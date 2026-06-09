package main

import (
	"fmt"
	"log"
	"os"
	"os/signal"
	"strings"

	"github.com/getlantern/systray"
)

func main() {
	for _, arg := range os.Args[1:] {
		switch arg {
		case "-detect-external-ip", "--detect-external-ip":
			extIP, extIP6 := getExternalIPs()
			localIP := getLocalIP()
			var sb strings.Builder
			if extIP != "" {
				sb.WriteString("EXTERNAL_IP=" + extIP + "\r\n")
			} else {
				sb.WriteString("EXTERNAL_IP=\r\n")
			}
			if extIP6 != "" {
				sb.WriteString("EXTERNAL_IP6=" + extIP6 + "\r\n")
			} else {
				sb.WriteString("EXTERNAL_IP6=\r\n")
			}
			sb.WriteString("LOCAL_IP=" + localIP + "\r\n")
			out := os.TempDir() + `\gopencode_detect.txt`
			_ = os.WriteFile(out, []byte(sb.String()), 0600)
			fmt.Print(sb.String())
			return
		case "-version", "--version", "-v":
			fmt.Println("GOpencode 0.3.0")
			return
		}
	}

	cfg := loadConfig()

	gw := NewGateway(cfg)
	if err := gw.Start(); err != nil {
		log.Fatalf("gateway failed to start: %v", err)
	}

	onRestart := func(newCfg Config) {
		gw.Stop()
		gw = NewGateway(newCfg)
		cfg = newCfg
		if err := gw.Start(); err != nil {
			log.Printf("restart failed: %v", err)
		}
	}

	ipMon := NewIPMonitor(&cfg, func(newIP4, newIP6 string) {
		log.Printf("IPMonitor: public IPs changed — pushing relocate (ipv4=%s, ipv6=%s)", newIP4, newIP6)
		gw.PushRelocate(newIP4, newIP6)
	})
	ipMon.Start()

	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, os.Interrupt)

	go func() {
		<-sigCh
		ipMon.Stop()
		gw.Stop()
		systray.Quit()
	}()

	systray.Run(func() { onReady(gw, &cfg, ipMon, onRestart) }, onExit)
}
