package main

import (
	_ "embed"
	"fmt"
	"os"
	"time"

	"github.com/getlantern/systray"
	"golang.org/x/sys/windows/registry"
)

var (
	webPort int
)

//go:embed assets/icon_idle.ico
var iconIdle []byte

//go:embed assets/icon_green.ico
var iconGreen []byte

//go:embed assets/icon_red.ico
var iconRed []byte

func setAutoStart(enabled bool) error {
	key, err := registry.OpenKey(registry.CURRENT_USER,
		`SOFTWARE\Microsoft\Windows\CurrentVersion\Run`,
		registry.SET_VALUE)
	if err != nil { return err }
	defer key.Close()

	if enabled {
		exe, _ := os.Executable()
		return key.SetStringValue("GOpencode", exe)
	}
	return key.DeleteValue("GOpencode")
}

func isAutoStart() bool {
	key, err := registry.OpenKey(registry.CURRENT_USER,
		`SOFTWARE\Microsoft\Windows\CurrentVersion\Run`,
		registry.QUERY_VALUE)
	if err != nil { return false }
	defer key.Close()
	_, _, err = key.GetStringValue("GOpencode")
	return err == nil
}

func onReady(gw *Gateway, cfg *Config, onRestart func(Config)) {
	systray.SetIcon(iconIdle)
	systray.SetTitle("GOpencode")
	systray.SetTooltip("GOpencode — idle")

	mStatus := systray.AddMenuItem("Status: Waiting for connection", "Current status")
	mStatus.Disable()

	systray.AddSeparator()

	mPairing := systray.AddMenuItem("Show pairing QR", "Display QR code for phone pairing")
	mOpen := systray.AddMenuItem("Open opencode web UI", "Open the opencode web interface")
	mSettings := systray.AddMenuItem("Settings", "Configure gateway")

	systray.AddSeparator()

	mAutoStart := systray.AddMenuItemCheckbox("Start with Windows", "Launch on system startup", cfg.AutoStart)

	systray.AddSeparator()

	mQuit := systray.AddMenuItem("Quit", "Stop gateway and exit")

	// Status icon updater
	go func() {
		for {
			status := gw.Status()
			switch status {
			case "paired":
				systray.SetIcon(iconGreen)
				systray.SetTooltip("GOpencode — phone connected")
				mStatus.SetTitle("Status: Phone connected \u2713")
			case "error":
				systray.SetIcon(iconRed)
				systray.SetTooltip("GOpencode — error")
				mStatus.SetTitle("Status: Error")
			default:
				systray.SetIcon(iconIdle)
				systray.SetTooltip("GOpencode — waiting for connection")
				mStatus.SetTitle("Status: Waiting for connection")
			}
			time.Sleep(2 * time.Second)
		}
	}()

	go func() {
		for {
			select {
			case <-mPairing.ClickedCh:
				url := fmt.Sprintf("http://127.0.0.1:%d/pairing", webPort)
				openBrowser(url)

			case <-mOpen.ClickedCh:
				openBrowser(cfg.OcURL)

			case <-mSettings.ClickedCh:
				url := fmt.Sprintf("http://127.0.0.1:%d/settings", webPort)
				openBrowser(url)

			case <-mAutoStart.ClickedCh:
				newVal := !cfg.AutoStart
				if err := setAutoStart(newVal); err == nil {
					cfg.AutoStart = newVal
					saveConfig(*cfg)
					if newVal { mAutoStart.Check() } else { mAutoStart.Uncheck() }
				}

			case <-mQuit.ClickedCh:
				gw.Stop()
				systray.Quit()
				os.Exit(0)
			}
		}
	}()
}

func onExit() {}
