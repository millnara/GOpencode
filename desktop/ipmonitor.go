package main

import (
	"log"
	"sync"
	"time"
)

type IPMonitor struct {
	mu       sync.Mutex
	cfg      *Config
	onChange func(newIP4 string, newIP6 string)
	interval time.Duration
	quit     chan struct{}
	stopped  bool
}

func NewIPMonitor(cfg *Config, onChange func(string, string)) *IPMonitor {
	interval := time.Duration(cfg.IPRecheckSeconds) * time.Second
	if interval < 10*time.Second {
		interval = 10 * time.Second
	}
	return &IPMonitor{
		cfg:      cfg,
		onChange: onChange,
		interval: interval,
		quit:     make(chan struct{}),
	}
}

func (m *IPMonitor) Start() {
	go m.loop()
}

func (m *IPMonitor) Stop() {
	m.mu.Lock()
	defer m.mu.Unlock()
	if !m.stopped {
		m.stopped = true
		close(m.quit)
	}
}

func (m *IPMonitor) loop() {
	m.check()

	ticker := time.NewTicker(m.interval)
	defer ticker.Stop()

	for {
		select {
		case <-ticker.C:
			m.check()
		case <-m.quit:
			return
		}
	}
}

func (m *IPMonitor) check() {
	m.mu.Lock()
	if m.stopped {
		m.mu.Unlock()
		return
	}
	m.mu.Unlock()

	if !m.cfg.AutoRecheck {
		return
	}

	ip4, ip6 := getExternalIPs()
	oldHost := m.cfg.Host
	oldHostIsV6 := false
	for i := 0; i < len(oldHost); i++ {
		if oldHost[i] == ':' {
			oldHostIsV6 = true
			break
		}
	}

	var newHost string
	if oldHostIsV6 {
		newHost = ip6
		if newHost == "" {
			newHost = ip4
		}
	} else {
		newHost = ip4
		if newHost == "" {
			newHost = ip6
		}
	}

	if newHost == "" {
		return
	}

	if newHost != oldHost {
		if oldHost != "" {
			log.Printf("IPMonitor: public IP changed: %s -> %s", oldHost, newHost)
		} else {
			log.Printf("IPMonitor: detected public IP: %s", newHost)
		}
		m.cfg.Host = newHost
		_ = saveConfig(*m.cfg)
	}

	if m.onChange != nil {
		m.onChange(ip4, ip6)
	}
}

func (m *IPMonitor) CheckNow() {
	m.check()
}
