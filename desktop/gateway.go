package main

import (
	"crypto/rand"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

type Gateway struct {
	cfg       Config
	room      string
	pw        string
	auth      string
	server    *http.Server
	mu        sync.Mutex
	phone     *websocket.Conn
	status    string
	webrtc    *WebRTCTransport
	lastEvent time.Time
	done      chan struct{}
}

func NewGateway(cfg Config) *Gateway {
	room := make([]byte, 8)
	rand.Read(room)
	pw := make([]byte, 12)
	rand.Read(pw)
	auth := "Basic " + base64.StdEncoding.EncodeToString([]byte(cfg.Username+":"+cfg.Password))
	return &Gateway{
		cfg:       cfg,
		room:      hex.EncodeToString(room),
		pw:        base64.RawURLEncoding.EncodeToString(pw),
		auth:      auth,
		lastEvent: time.Now(),
		done:      make(chan struct{}),
	}
}

func (g *Gateway) PairingInfo() map[string]string {
	return map[string]string{
		"ws":   fmt.Sprintf("ws://localhost:%d", g.cfg.Port),
		"room": g.room,
		"pw":   g.pw,
	}
}

func (g *Gateway) Status() string { return g.status }

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool { return true },
}

func (g *Gateway) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Access-Control-Allow-Origin", "*")
	if r.Method == "OPTIONS" { w.WriteHeader(200); return }

	if r.URL.Path == "/pairing" {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(g.PairingInfo())
		return
	}

	if r.URL.Path == "/status" {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"status": g.status, "port": fmt.Sprintf("%d", g.cfg.Port)})
		return
	}

	if strings.HasPrefix(r.URL.Path, "/ws") || r.URL.Path == "/" {
		g.handleWebSocket(w, r)
		return
	}

	w.WriteHeader(404)
}

func (g *Gateway) handleWebSocket(w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil { return }

	authed := false
	subscriptions := make(map[float64]chan struct{})

	defer func() {
		for _, ch := range subscriptions { close(ch) }
		g.mu.Lock()
		if g.phone == conn { g.phone = nil; g.status = "idle" }
		g.mu.Unlock()
		conn.Close()
	}()

	for {
		_, raw, err := conn.ReadMessage()
		if err != nil { return }

		var msg map[string]interface{}
		if err := json.Unmarshal(raw, &msg); err != nil { continue }

		if !authed {
			if msg["type"] == "auth" && msg["room"] == g.room && msg["pw"] == g.pw {
				authed = true
				g.mu.Lock()
				g.phone = conn
				g.status = "paired"
				g.mu.Unlock()
				id, _ := msg["id"].(float64)
				conn.WriteJSON(map[string]interface{}{"id": id, "type": "authed"})

				// Offer WebRTC upgrade for P2P
				wr := NewWebRTCTransport(func(data []byte) {
					// When phone sends over data channel, treat as JSON-RPC
					conn.WriteMessage(websocket.TextMessage, data)
				})
				g.mu.Lock()
				g.webrtc = wr
				g.mu.Unlock()
				offer, err := wr.CreateOffer(
					func(sdp string) error {
						return conn.WriteJSON(map[string]interface{}{"type": "webrtc-offer", "sdp": sdp})
					},
					func(candidate string) error {
						return conn.WriteJSON(map[string]interface{}{"type": "webrtc-candidate", "candidate": candidate})
					},
				)
				if err == nil && offer != "" {
					conn.WriteJSON(map[string]interface{}{"type": "webrtc-offer", "sdp": offer})
				}
			} else {
				id, _ := msg["id"].(float64)
				conn.WriteJSON(map[string]interface{}{"id": id, "error": "auth failed"})
			}
			continue
		}

		id, _ := msg["id"].(float64)
		msgType, _ := msg["type"].(string)

		if msgType == "webrtc-answer" {
			sdp, _ := msg["sdp"].(string)
			g.mu.Lock()
			wr := g.webrtc
			g.mu.Unlock()
			if wr != nil && sdp != "" {
				if err := wr.SetRemoteDescription(sdp); err != nil {
					log.Printf("webrtc: set remote desc error: %v", err)
				}
			}
			continue
		}

		if msgType == "webrtc-candidate" {
			cand, _ := msg["candidate"].(string)
			g.mu.Lock()
			wr := g.webrtc
			g.mu.Unlock()
			if wr != nil && cand != "" {
				wr.AddICECandidate(cand)
			}
			continue
		}

		if msgType == "sse-start" {
			stop := make(chan struct{})
			subscriptions[id] = stop
			go g.streamSSE(conn, id, msg, stop)
			continue
		}

		if msgType == "sse-stop" {
			if ch, ok := subscriptions[id]; ok { close(ch); delete(subscriptions, id) }
			continue
		}

		go g.proxyRequest(conn, id, msg)
	}
}

func (g *Gateway) proxyRequest(conn *websocket.Conn, id float64, msg map[string]interface{}) {
	method, _ := msg["method"].(string)
	if method == "" { method = "GET" }
	path, _ := msg["path"].(string)
	body, _ := json.Marshal(msg["body"])

	url := g.cfg.OcURL + path
	req, err := http.NewRequest(method, url, strings.NewReader(string(body)))
	if err != nil {
		conn.WriteJSON(map[string]interface{}{"id": id, "status": 0, "error": err.Error()})
		return
	}
	req.Header.Set("Authorization", g.auth)
	req.Header.Set("Content-Type", "application/json")

	client := &http.Client{Timeout: 120 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		conn.WriteJSON(map[string]interface{}{"id": id, "status": 0, "error": err.Error()})
		return
	}
	defer resp.Body.Close()

	respBody, _ := io.ReadAll(resp.Body)
	headers := make(map[string]string)
	for k := range resp.Header {
		headers[k] = resp.Header.Get(k)
	}

	var parsed interface{}
	if err := json.Unmarshal(respBody, &parsed); err != nil {
		parsed = string(respBody)
	}

	conn.WriteJSON(map[string]interface{}{
		"id": id, "status": resp.StatusCode,
		"body": parsed, "headers": headers,
	})
}

func (g *Gateway) streamSSE(conn *websocket.Conn, id float64, msg map[string]interface{}, stop chan struct{}) {
	path, _ := msg["path"].(string)
	dir, _ := msg["directory"].(string)
	if path == "" { path = "/event" }

	url := g.cfg.OcURL + path
	if dir != "" {
		if strings.Contains(path, "?") { url += "&" } else { url += "?" }
		url += "directory=" + dir
	}

	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		conn.WriteJSON(map[string]interface{}{"id": id, "type": "sse-error", "error": err.Error()})
		return
	}
	req.Header.Set("Authorization", g.auth)
	req.Header.Set("Accept", "text/event-stream")

	client := &http.Client{Timeout: 0}
	resp, err := client.Do(req)
	if err != nil {
		conn.WriteJSON(map[string]interface{}{"id": id, "type": "sse-error", "error": err.Error()})
		return
	}
	defer resp.Body.Close()

	reader := io.Reader(resp.Body)
	buf := make([]byte, 4096)
	lineBuf := ""

	for {
		select {
		case <-stop:
			return
		default:
		}

		n, rErr := reader.Read(buf)
		if n > 0 {
			lineBuf += string(buf[:n])
			lines := strings.Split(lineBuf, "\n")
			lineBuf = lines[len(lines)-1]
			for _, line := range lines[:len(lines)-1] {
				line = strings.TrimSpace(line)
				if strings.HasPrefix(line, "data:") {
					data := strings.TrimSpace(line[5:])
					if data == "" { continue }
					var event map[string]interface{}
					if err := json.Unmarshal([]byte(data), &event); err == nil {
						g.lastEvent = time.Now()
	g.lastEvent = time.Now()
	conn.WriteJSON(map[string]interface{}{
							"id": id, "type": "sse-event", "event": event,
						})
					}
				}
			}
		}
		if rErr != nil {
			if rErr != io.EOF {
				conn.WriteJSON(map[string]interface{}{"id": id, "type": "sse-error", "error": rErr.Error()})
			}
			return
		}
	}
}

func (g *Gateway) Start() error {
	g.status = "idle"
	mux := http.NewServeMux()
	mux.HandleFunc("/", g.ServeHTTP)
	g.server = &http.Server{
		Addr:         fmt.Sprintf("127.0.0.1:%d", g.cfg.Port),
		Handler:      mux,
		ReadTimeout:  10 * time.Second,
		WriteTimeout: 0,
	}
	go func() {
		if err := g.server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Printf("gateway error: %v", err)
			g.status = "error"
		}
	}()

	go g.watchdog()
	return nil
}

func (g *Gateway) watchdog() {
	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()
	for {
		select {
		case <-ticker.C:
			g.mu.Lock()
			silent := time.Since(g.lastEvent)
			hasPhone := g.phone != nil
			g.mu.Unlock()
			if hasPhone && silent > 5*time.Minute {
				log.Printf("watchdog: no SSE events for %v, checking liveness", silent.Round(time.Second))
				resp, err := http.Get(g.cfg.OcURL + "/path")
				if err != nil || resp == nil || resp.StatusCode >= 500 {
					log.Printf("watchdog: opencode may be down, status set to error")
					g.mu.Lock()
					g.status = "error"
					g.mu.Unlock()
				}
				if resp != nil { resp.Body.Close() }
			}
		case <-g.done:
			return
		}
	}
}

func (g *Gateway) Stop() {
	close(g.done)
	if g.server != nil {
		g.server.Close()
	}
}
