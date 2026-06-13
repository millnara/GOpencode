package main

import (
	_ "embed"
	"os"
	"time"

	"github.com/getlantern/systray"
	"golang.org/x/sys/windows/registry"
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

func onReady(gw *Gateway, cfg *Config, ipMon *IPMonitor, onRestart func(Config)) {
	systray.SetIcon(iconIdle)
	systray.SetTitle("GOpencode")
	systray.SetTooltip("GOpencode - waiting for connection")

	mStatus := systray.AddMenuItem("Status: Waiting for connection", "Current status")
	mStatus.Disable()

	systray.AddSeparator()

	mPairing := systray.AddMenuItem("Show pairing QR", "Display QR code for phone pairing")
	mSettings := systray.AddMenuItem("Settings", "Configure gateway")
	mPhrases := systray.AddMenuItem("Working phrases…", "Edit the phrases shown on the phone while the AI works")

	systray.AddSeparator()

	mAutoStart := systray.AddMenuItemCheckbox("Start with Windows", "Launch on system startup", cfg.AutoStart)

	systray.AddSeparator()

	mQuit := systray.AddMenuItem("Quit", "Stop gateway and exit")

	go func() {
		for {
			status := gw.Status()
			switch status {
			case "paired":
				systray.SetIcon(iconGreen)
				systray.SetTooltip("GOpencode - phone connected")
				mStatus.SetTitle("Status: Phone connected")
			case "error":
				systray.SetIcon(iconRed)
				systray.SetTooltip("GOpencode - error")
				mStatus.SetTitle("Status: Error")
			default:
				systray.SetIcon(iconIdle)
				systray.SetTooltip("GOpencode - waiting for connection")
				mStatus.SetTitle("Status: Waiting for connection")
			}
			time.Sleep(2 * time.Second)
		}
	}()

	go func() {
		for {
			select {
			case <-mPairing.ClickedCh:
				showPairingWindow(gw, cfg)

			case <-mSettings.ClickedCh:
				showSettingsWindow(cfg, ipMon, onRestart)

			case <-mPhrases.ClickedCh:
				showPhrasesWindow(gw, cfg)

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
