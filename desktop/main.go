package main

import (
	"log"
	"os"
	"os/signal"

	"github.com/getlantern/systray"
)

func main() {
	cfg := loadConfig()
	gw := NewGateway(cfg)
	if err := gw.Start(); err != nil {
		log.Fatalf("gateway failed to start: %v", err)
	}

	p, err := startWebServer(gw, &cfg, func(newCfg Config) {
		cfg = newCfg
	})
	if err != nil {
		log.Fatalf("web server failed: %v", err)
	}
	webPort = p

	onRestart := func(newCfg Config) {
		gw.Stop()
		gw = NewGateway(newCfg)
		cfg = newCfg
		if err := gw.Start(); err != nil {
			log.Printf("restart failed: %v", err)
		}
	}

	go func() {
		systray.Run(func() { onReady(gw, &cfg, onRestart) }, onExit)
	}()

	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, os.Interrupt)
	<-sigCh
	gw.Stop()
}
