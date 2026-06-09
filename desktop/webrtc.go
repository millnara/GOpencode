package main

import (
	"encoding/json"
	"log"

	"github.com/pion/webrtc/v4"
)

const stunServer = "stun:stun.l.google.com:19302"
const turnServer = "turn:openrelay.metered.ca:80"
const turnUsername = "openrelayproject"
const turnCredential = "openrelayproject"

type WebRTCTransport struct {
	pc *webrtc.PeerConnection
	dc *webrtc.DataChannel
	sendOffer  func(sdp string) error
	sendICECandidate func(candidate string) error
	onMessage func([]byte)
	connected bool
	closed    chan struct{}
}

func NewWebRTCTransport(onMessage func([]byte)) *WebRTCTransport {
	return &WebRTCTransport{onMessage: onMessage, closed: make(chan struct{})}
}

func (w *WebRTCTransport) CreateOffer(sendOffer func(sdp string) error, sendIce func(candidate string) error) (string, error) {
	w.sendOffer = sendOffer
	w.sendICECandidate = sendIce

	config := webrtc.Configuration{
		ICEServers: []webrtc.ICEServer{
			{URLs: []string{stunServer}},
			{URLs: []string{turnServer}, Username: turnUsername, Credential: turnCredential},
		},
	}

	pc, err := webrtc.NewPeerConnection(config)
	if err != nil { return "", err }
	w.pc = pc

	dc, err := pc.CreateDataChannel("gopencode", nil)
	if err != nil { return "", err }
	w.dc = dc

	dc.OnOpen(func() {
		log.Println("webrtc: data channel open")
		w.connected = true
	})
	dc.OnMessage(func(msg webrtc.DataChannelMessage) {
		if w.onMessage != nil { w.onMessage(msg.Data) }
	})
	dc.OnClose(func() { w.connected = false; close(w.closed) })

	pc.OnICECandidate(func(c *webrtc.ICECandidate) {
		if c != nil && w.sendICECandidate != nil {
			offer := c.ToJSON()
			if offer.Candidate != "" {
				data, _ := json.Marshal(offer)
				w.sendICECandidate(string(data))
			}
		}
	})

	pc.OnConnectionStateChange(func(s webrtc.PeerConnectionState) {
		log.Printf("webrtc: state %s", s)
		if s == webrtc.PeerConnectionStateFailed || s == webrtc.PeerConnectionStateClosed {
			w.connected = false
		}
	})

	offer, err := pc.CreateOffer(nil)
	if err != nil { return "", err }
	if err := pc.SetLocalDescription(offer); err != nil { return "", err }

	offerJSON, err := json.Marshal(offer)
	return string(offerJSON), err
}

func (w *WebRTCTransport) SetRemoteDescription(sdpJSON string) error {
	var sdp webrtc.SessionDescription
	if err := json.Unmarshal([]byte(sdpJSON), &sdp); err != nil { return err }
	return w.pc.SetRemoteDescription(sdp)
}

func (w *WebRTCTransport) AddICECandidate(candidateJSON string) error {
	var candidate webrtc.ICECandidateInit
	if err := json.Unmarshal([]byte(candidateJSON), &candidate); err != nil { return err }
	return w.pc.AddICECandidate(candidate)
}

func (w *WebRTCTransport) Send(data []byte) error {
	if !w.connected || w.dc == nil { return nil }
	return w.dc.Send(data)
}

func (w *WebRTCTransport) IsConnected() bool { return w.connected }

func (w *WebRTCTransport) Close() {
	if w.pc != nil { w.pc.Close() }
}
