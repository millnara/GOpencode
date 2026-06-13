package main

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
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
	phone     *phoneConn
	status    string
	webrtc    *WebRTCTransport
	lastEvent time.Time
	done      chan struct{}
}

// phoneConn serializes writes to one phone socket. gorilla/websocket supports
// only one concurrent writer; SSE pumps, proxied responses, pongs and relocate
// pushes all write from separate goroutines. The mutex is per-connection and
// every write carries a deadline, so one dead peer can never wedge the rest.
type phoneConn struct {
	conn *websocket.Conn
	mu   sync.Mutex
}

func (p *phoneConn) writeJSON(v interface{}) error {
	p.mu.Lock()
	defer p.mu.Unlock()
	p.conn.SetWriteDeadline(time.Now().Add(30 * time.Second))
	return p.conn.WriteJSON(v)
}

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool { return true },
}

func NewGateway(cfg Config) *Gateway {
	room := []byte(cfg.Room)
	if len(room) == 0 {
		room = make([]byte, 8)
		rand.Read(room)
	}
	rawPw := cfg.Pw
	if rawPw == "" {
		pwBytes := make([]byte, 12)
		rand.Read(pwBytes)
		rawPw = base64.RawURLEncoding.EncodeToString(pwBytes)
	}
	// Persist credentials so the phone can reconnect without re-scanning
	if cfg.Room == "" || cfg.Pw == "" {
		cfg.Room = hex.EncodeToString(room)
		cfg.Pw = rawPw
		if err := saveConfig(cfg); err != nil {
			logf("ERROR saving persisted credentials: %v", err)
		} else {
			logf("credentials persisted room=%s", cfg.Room)
		}
	}
	auth := "Basic " + base64.StdEncoding.EncodeToString([]byte(cfg.Username+":"+cfg.Password))
	return &Gateway{
		cfg:       cfg,
		room:      hex.EncodeToString(room),
		pw:        rawPw,
		auth:      auth,
		lastEvent: time.Now(),
		done:      make(chan struct{}),
	}
}

type Pairing struct {
	Room      string   `json:"room"`
	Pw        string   `json:"pw"`
	Endpoints []string `json:"endpoints"`
}

func (g *Gateway) buildEndpoints(publicIP4, publicIP6 string) []string {
	var endpoints []string
	seen := make(map[string]bool)

	for _, la := range getLocalIPs() {
		if la.Type == "lan" {
			ep := fmt.Sprintf("ws://%s:%d", la.IP, g.cfg.Port)
			if !seen[ep] {
				endpoints = append(endpoints, ep)
				seen[ep] = true
			}
		}
	}
	if publicIP4 != "" && !isPrivateIPv4(publicIP4) {
		ep := fmt.Sprintf("ws://%s:%d", publicIP4, g.cfg.Port)
		if !seen[ep] {
			endpoints = append(endpoints, ep)
			seen[ep] = true
		}
	}
	if publicIP6 != "" && !isPrivateIPv6(publicIP6) {
		ep := fmt.Sprintf("ws://[%s]:%d", publicIP6, g.cfg.Port)
		if !seen[ep] {
			endpoints = append(endpoints, ep)
			seen[ep] = true
		}
	}
	for _, la := range getLocalIPs() {
		if la.Type == "tunnel" {
			ep := fmt.Sprintf("ws://%s:%d", la.IP, g.cfg.Port)
			if !seen[ep] {
				endpoints = append(endpoints, ep)
				seen[ep] = true
			}
		}
	}
	return endpoints
}

func (g *Gateway) PairingInfo() Pairing {
	ip4, ip6 := getExternalIPs()
	return Pairing{
		Room:      g.room,
		Pw:        g.pw,
		Endpoints: g.buildEndpoints(ip4, ip6),
	}
}

func (g *Gateway) PushRelocate(publicIP4, publicIP6 string) {
	g.mu.Lock()
	conn := g.phone
	g.mu.Unlock()
	if conn == nil {
		return
	}
	endpoints := g.buildEndpoints(publicIP4, publicIP6)
	if len(endpoints) == 0 {
		return
	}
	msg := map[string]interface{}{
		"type":      "relocate",
		"endpoints": endpoints,
	}
	if err := conn.writeJSON(msg); err != nil {
		logf("relocate: write failed: %v", err)
	} else {
		logf("relocate: pushed %d endpoints (ipv4=%s, ipv6=%s)", len(endpoints), publicIP4, publicIP6)
	}
}

func (g *Gateway) Status() string { return g.status }

// phraseSet returns the current working-indicator set under lock.
func (g *Gateway) phraseSet() map[string]interface{} {
	g.mu.Lock()
	name := g.cfg.PhrasesName
	phrases := append([]string(nil), g.cfg.Phrases...)
	g.mu.Unlock()
	return map[string]interface{}{"name": name, "phrases": phrases}
}

// sendPhrases pushes the current phrase set to one phone connection (used right
// after auth so the phone adopts the desktop's set on connect).
func (g *Gateway) sendPhrases(pc *phoneConn) {
	g.mu.Lock()
	empty := len(g.cfg.Phrases) == 0
	g.mu.Unlock()
	if empty {
		return
	}
	if err := pc.writeJSON(map[string]interface{}{"type": "phrases", "set": g.phraseSet()}); err != nil {
		logf("phrases: send failed: %v", err)
	}
}

// SetPhrases updates the active set and pushes it to the connected phone.
func (g *Gateway) SetPhrases(name string, phrases []string) {
	g.mu.Lock()
	g.cfg.PhrasesName = name
	g.cfg.Phrases = phrases
	conn := g.phone
	g.mu.Unlock()
	if conn != nil {
		if err := conn.writeJSON(map[string]interface{}{"type": "phrases", "set": g.phraseSet()}); err != nil {
			logf("phrases: push failed: %v", err)
		} else {
			logf("phrases: pushed %d to phone", len(phrases))
		}
	}
}

func (g *Gateway) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Access-Control-Allow-Origin", "*")
	if r.Method == "OPTIONS" {
		w.WriteHeader(200)
		return
	}

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

	if strings.HasPrefix(r.URL.Path, "/app/") {
		g.serveApp(w, r)
		return
	}

	if r.URL.Path == "/app-manifest" {
		g.serveManifest(w, r)
		return
	}

	w.WriteHeader(404)
}

func (g *Gateway) handleWebSocket(w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		logf("ws: upgrade failed: %v", err)
		return
	}
	logf("ws: new connection from %s", r.RemoteAddr)

	conn.SetReadLimit(10 << 20) // 10 MB — allow image payloads
	pc := &phoneConn{conn: conn}

	// The phone pings every ~10s when idle (see transport.ts keepalive). Without
	// a read deadline a half-open socket (Android backgrounding, Wi-Fi↔cellular
	// handoff, IP change) leaves ReadMessage blocked forever, so the defer never
	// runs and status stays "paired" while the phone has long since given up and
	// is failing to reconnect. 90s matches the phone's body-upload budget so a
	// slow image upload (one large frame) doesn't trip the deadline mid-transfer.
	const readDeadline = 90 * time.Second
	conn.SetReadDeadline(time.Now().Add(readDeadline))

	authed := false
	subscriptions := make(map[float64]chan struct{})

	defer func() {
		for _, ch := range subscriptions {
			close(ch)
		}
		g.mu.Lock()
		if g.phone == pc {
			g.phone = nil
			g.status = "idle"
		}
		g.mu.Unlock()
		conn.Close()
	}()

	for {
		_, raw, err := conn.ReadMessage()
		if err != nil {
			logf("ws: read ended for %s: %v", r.RemoteAddr, err)
			return
		}
		conn.SetReadDeadline(time.Now().Add(readDeadline))

		var msg map[string]interface{}
		if err := json.Unmarshal(raw, &msg); err != nil {
			logf("ws: bad JSON (%d bytes): %v", len(raw), err)
			continue
		}

		if !authed {
			if msg["type"] == "auth" && msg["room"] == g.room && msg["pw"] == g.pw {
				authed = true
				logf("ws: auth SUCCESS room=%s", msg["room"])
				g.mu.Lock()
				g.phone = pc
				g.status = "paired"
				g.mu.Unlock()
				id, _ := msg["id"].(float64)
				pc.writeJSON(map[string]interface{}{"id": id, "type": "authed"})
				logf("ws: sent authed (WebSocket-only, no WebRTC)")
				g.sendPhrases(pc)
				hash := g.appHash()
				if hash != "" {
					pc.writeJSON(map[string]interface{}{"type": "app-update", "hash": hash, "version": "1.0.0"})
				}
			} else {
				logf("ws: auth FAILED room_matches=%v pw_matches=%v", msg["room"] == g.room, msg["pw"] == g.pw)
				id, _ := msg["id"].(float64)
				pc.writeJSON(map[string]interface{}{"id": id, "error": "auth failed"})
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
					logf("webrtc: set remote desc error: %v", err)
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

		if msgType == "ping" {
			pc.writeJSON(map[string]interface{}{"type": "pong"})
			continue
		}

		if msgType == "sse-start" {
			stop := make(chan struct{})
			subscriptions[id] = stop
			go g.streamSSE(pc, id, msg, stop)
			continue
		}

		if msgType == "sse-stop" {
			if ch, ok := subscriptions[id]; ok {
				close(ch)
				delete(subscriptions, id)
			}
			continue
		}

		go g.proxyRequest(pc, id, msg)
	}
}

func (g *Gateway) proxyRequest(conn *phoneConn, id float64, msg map[string]interface{}) {
	method, _ := msg["method"].(string)
	if method == "" {
		method = "GET"
	}
	path, _ := msg["path"].(string)
	body, _ := json.Marshal(msg["body"])

	url := g.cfg.OcURL + path
	logf("proxy: %s %s", method, url)
	req, err := http.NewRequest(method, url, strings.NewReader(string(body)))
	if err != nil {
		conn.writeJSON(map[string]interface{}{"id": id, "status": 0, "error": err.Error()})
		return
	}
	req.Header.Set("Authorization", g.auth)
	req.Header.Set("Content-Type", "application/json")

	client := &http.Client{Timeout: 120 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		logf("proxy: %s %s -> error: %v", method, url, err)
		conn.writeJSON(map[string]interface{}{"id": id, "status": 0, "error": err.Error()})
		return
	}
	defer resp.Body.Close()
	logf("proxy: %s %s -> %d", method, url, resp.StatusCode)

	respBody, _ := io.ReadAll(resp.Body)
	headers := make(map[string]string)
	for k := range resp.Header {
		headers[k] = resp.Header.Get(k)
	}

	var parsed interface{}
	if err := json.Unmarshal(respBody, &parsed); err != nil {
		parsed = string(respBody)
	}

	conn.writeJSON(map[string]interface{}{
		"id": id, "status": resp.StatusCode,
		"body": parsed, "headers": headers,
	})
}

func (g *Gateway) streamSSE(conn *phoneConn, id float64, msg map[string]interface{}, stop chan struct{}) {
	path, _ := msg["path"].(string)
	dir, _ := msg["directory"].(string)
	if path == "" {
		path = "/event"
	}

	url := g.cfg.OcURL + path
	if dir != "" {
		if strings.Contains(path, "?") {
			url += "&"
		} else {
			url += "?"
		}
		url += "directory=" + dir
	}

	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		conn.writeJSON(map[string]interface{}{"id": id, "type": "sse-error", "error": err.Error()})
		return
	}
	req.Header.Set("Authorization", g.auth)
	req.Header.Set("Accept", "text/event-stream")

	client := &http.Client{Timeout: 0}
	resp, err := client.Do(req)
	if err != nil {
		conn.writeJSON(map[string]interface{}{"id": id, "type": "sse-error", "error": err.Error()})
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
					if data == "" {
						continue
					}
					var event map[string]interface{}
					if err := json.Unmarshal([]byte(data), &event); err == nil {
						g.lastEvent = time.Now()
						conn.writeJSON(map[string]interface{}{
							"id": id, "type": "sse-event", "event": event,
						})
					}
				}
			}
		}
		if rErr != nil {
			if rErr != io.EOF {
				conn.writeJSON(map[string]interface{}{"id": id, "type": "sse-error", "error": rErr.Error()})
			}
			return
		}
	}
}

func (g *Gateway) Start() error {
	g.status = "idle"
	mux := http.NewServeMux()
	mux.HandleFunc("/", g.ServeHTTP)

	// Detect UPnP / external IP
	upnp := DetectUPnP(g.cfg.Port)
	if upnp.available && upnp.externalIP != "" {
		logf("UPnP detected, external IP: %s", upnp.externalIP)
		g.cfg.Host = upnp.externalIP
	} else {
		logf("No external IP detected, using local IP: %s", getLocalIP())
	}

	// Always bind all interfaces — the phone connects over LAN/Tailscale even
	// when no public IP is detected. Binding 127.0.0.1 made the gateway
	// unreachable (reconnect failures) whenever UPnP detection came up empty.
	bindAddr := "0.0.0.0"
	logf("Gateway binding to %s:%d", bindAddr, g.cfg.Port)

	g.server = &http.Server{
		Addr:         fmt.Sprintf("%s:%d", bindAddr, g.cfg.Port),
		Handler:      mux,
		ReadTimeout:  10 * time.Second,
		WriteTimeout: 0,
	}
	go func() {
		if err := g.server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			logf("gateway error: %v", err)
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
				logf("watchdog: no SSE events for %v, checking liveness", silent.Round(time.Second))
				resp, err := http.Get(g.cfg.OcURL + "/path")
				if err != nil || resp == nil || resp.StatusCode >= 500 {
					logf("watchdog: opencode may be down, status set to error")
					g.mu.Lock()
					g.status = "error"
					g.mu.Unlock()
				}
				if resp != nil {
					resp.Body.Close()
				}
			}
		case <-g.done:
			return
		}
	}
}

func (g *Gateway) appDistDir() string {
	exe, _ := os.Executable()
	dir := filepath.Join(filepath.Dir(exe), "dist")
	if _, err := os.Stat(dir); err == nil {
		return dir
	}
	return filepath.Join(filepath.Dir(exe), "..", "dist")
}

func (g *Gateway) appHash() string {
	dir := g.appDistDir()
	index := filepath.Join(dir, "index.html")
	data, err := os.ReadFile(index)
	if err != nil {
		return ""
	}
	h := sha256.Sum256(data)
	return hex.EncodeToString(h[:])
}

func (g *Gateway) serveApp(w http.ResponseWriter, r *http.Request) {
	dir := g.appDistDir()
	rel := strings.TrimPrefix(r.URL.Path, "/app/")
	if rel == "" {
		rel = "index.html"
	}
	fp := filepath.Join(dir, filepath.FromSlash(rel))
	fp = filepath.Clean(fp)
	if !strings.HasPrefix(fp, filepath.Clean(dir)) {
		http.Error(w, "forbidden", 403)
		return
	}
	w.Header().Set("Access-Control-Allow-Origin", "*")
	http.ServeFile(w, r, fp)
}

func (g *Gateway) serveManifest(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{
		"hash":    g.appHash(),
		"version": "1.0.0",
	})
}

func (g *Gateway) Stop() {
	close(g.done)
	if g.server != nil {
		g.server.Close()
	}
}
