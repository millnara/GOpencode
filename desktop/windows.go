package main

import (
	"encoding/json"
	"fmt"
	"image"
	"log"
	"runtime"
	"strconv"
	"strings"
	"unsafe"

	"github.com/rodrigocfd/windigo/co"
	"github.com/rodrigocfd/windigo/ui"
	"github.com/rodrigocfd/windigo/win"
	"github.com/skip2/go-qrcode"
)

func showPairingWindow(gw *Gateway, cfg *Config) {
	pairing := gw.PairingInfo()

	upnp := DetectUPnP(cfg.Port)
	accessInfo := "Local network only — set up port forwarding for remote access."
	if upnp.available && upnp.externalIP != "" {
		accessInfo = fmt.Sprintf("Remote access available: %s", upnp.externalIP)
		cfg.Host = upnp.externalIP
		_ = saveConfig(*cfg)
	}

	hasTailscale := false
	for _, la := range getLocalIPs() {
		if la.Type == "tunnel" {
			hasTailscale = true
			break
		}
	}

	go func() {
		runtime.LockOSThread()
		defer runtime.UnlockOSThread()

		qrPayload, err := json.Marshal(pairing)
		if err != nil {
			log.Printf("Failed to marshal pairing: %v", err)
			return
		}

		qr, err := qrcode.New(string(qrPayload), qrcode.Medium)
		if err != nil {
			log.Printf("Failed to generate QR: %v", err)
			return
		}

		const qrSize = 256
		qrImg := qr.Image(qrSize)

		showPairingWindowNative(pairing, qrImg, qrSize, accessInfo, hasTailscale)
	}()
}

// qrToBGRAPixels converts a Go image into a 32-bit BGRX DIB pixel buffer
// suitable for SetDIBitsToDevice. Rows are bottom-up (DIB default).
func qrToBGRAPixels(src image.Image, size int) []byte {
	bounds := src.Bounds()
	rowBytes := size * 4
	pixels := make([]byte, rowBytes*size)
	for y := 0; y < size; y++ {
		dstRow := (size - 1 - y) * rowBytes
		for x := 0; x < size; x++ {
			r, g, b, _ := src.At(bounds.Min.X+x, bounds.Min.Y+y).RGBA()
			off := dstRow + x*4
			pixels[off+0] = byte(b >> 8) // B
			pixels[off+1] = byte(g >> 8) // G
			pixels[off+2] = byte(r >> 8) // R
			pixels[off+3] = 0xFF
		}
	}
	return pixels
}

func showPairingWindowNative(p Pairing, qrImg image.Image, qrSize int, accessInfo string, hasTailscale bool) {
	pixels := qrToBGRAPixels(qrImg, qrSize)

	wnd := ui.NewMain(
		ui.OptsMain().
			Title("GOpencode - Pair Your Phone").
			Size(ui.Dpi(480, 640)).
			Style(co.WS_CAPTION | co.WS_SYSMENU | co.WS_CLIPCHILDREN | co.WS_BORDER | co.WS_VISIBLE | co.WS_MINIMIZEBOX | co.WS_SIZEBOX | co.WS_MAXIMIZEBOX),
	)

	ui.NewStatic(
		wnd,
		ui.OptsStatic().
			Text("Scan this QR code with GOpencode on your phone").
			Position(ui.Dpi(20, 12)).
			Size(ui.Dpi(440, 20)),
	)

	ui.NewStatic(
		wnd,
		ui.OptsStatic().
			Text(accessInfo).
			Position(ui.Dpi(20, 34)).
			Size(ui.Dpi(440, 20)),
	)

	// Custom-painted child window for the QR. We own the WM_PAINT handler and
	// blit the BGRX pixel buffer with SetDIBitsToDevice. No bitmap handles,
	// no SS_BITMAP, no LoadImage — just direct GDI pixel output.
	qrCtrl := ui.NewControl(
		wnd,
		ui.OptsControl().
			Position(ui.Dpi(112, 64)).
			Size(ui.Dpi(qrSize, qrSize)).
			ClassStyle(co.CS_HREDRAW|co.CS_VREDRAW).
			Style(co.WS_CHILD|co.WS_VISIBLE|co.WS_BORDER).
			ExStyle(co.WS_EX_CLIENTEDGE),
	)
	qrCtrl.On().WmPaint(func() {
		var ps win.PAINTSTRUCT
		hdc, err := qrCtrl.Hwnd().BeginPaint(&ps)
		if err != nil {
			return
		}
		defer qrCtrl.Hwnd().EndPaint(&ps)

		bmi := win.BITMAPINFO{}
		bmi.BmiHeader.SetBiSize()
		bmi.BmiHeader.Width = int32(qrSize)
		bmi.BmiHeader.Height = int32(qrSize) // positive = bottom-up
		bmi.BmiHeader.Planes = 1
		bmi.BmiHeader.BitCount = 32
		bmi.BmiHeader.Compression = co.BI_RGB
		_, _ = hdc.SetDIBitsToDevice(
			win.POINT{X: 0, Y: 0},
			win.SIZE{Cx: int32(qrSize), Cy: int32(qrSize)},
			win.POINT{X: 0, Y: 0},
			0, qrSize,
			unsafe.Pointer(&pixels[0]),
			&bmi,
			co.DIB_COLORS_RGB,
		)
	})

	ui.NewStatic(
		wnd,
		ui.OptsStatic().
			Text("Connection addresses (the phone tries them in order):").
			Position(ui.Dpi(20, 332)).
			Size(ui.Dpi(440, 20)),
	)

	ui.NewEdit(
		wnd,
		ui.OptsEdit().
			Text(strings.Join(p.Endpoints, "\n")).
			Position(ui.Dpi(20, 354)).
			Width(ui.DpiX(440)).
			Height(ui.DpiY(100)).
			CtrlStyle(co.ES_MULTILINE|co.ES_AUTOVSCROLL|co.ES_READONLY),
	)

	yPos := 470
	ui.NewStatic(
		wnd,
		ui.OptsStatic().
			Text("Room ID:  "+p.Room).
			Position(ui.Dpi(20, yPos)).
			Size(ui.Dpi(440, 18)),
	)
	ui.NewStatic(
		wnd,
		ui.OptsStatic().
			Text("Password:  "+p.Pw).
			Position(ui.Dpi(20, yPos+20)).
			Size(ui.Dpi(440, 18)),
	)

	if hasTailscale {
		ui.NewStatic(
			wnd,
			ui.OptsStatic().
				Text("Tailscale detected — phone can connect via Tailscale if installed on the phone.").
				Position(ui.Dpi(20, yPos+44)).
				Size(ui.Dpi(440, 32)),
		)
	}

	closeBtn := ui.NewButton(
		wnd,
		ui.OptsButton().
			Text("&Close").
			Position(ui.Dpi(190, yPos+82)).
			Width(ui.DpiX(100)).
			Height(ui.DpiY(30)),
	)
	closeBtn.On().BnClicked(func() {
		wnd.Hwnd().DestroyWindow()
	})

	wnd.RunAsMain()
}

func showSettingsWindow(cfg *Config, ipMon *IPMonitor, onRestart func(Config)) {
	go func() {
		runtime.LockOSThread()
		defer runtime.UnlockOSThread()

		wnd := ui.NewMain(
			ui.OptsMain().
				Title("GOpencode - Settings").
				Size(ui.Dpi(640, 560)).
				Style(co.WS_CAPTION | co.WS_SYSMENU | co.WS_CLIPCHILDREN | co.WS_BORDER | co.WS_VISIBLE | co.WS_MINIMIZEBOX | co.WS_SIZEBOX | co.WS_MAXIMIZEBOX),
		)

		yPos := 15

		ui.NewStatic(
			wnd,
			ui.OptsStatic().
				Text("Gateway Settings").
				Position(ui.Dpi(20, yPos)).
				Size(ui.Dpi(600, 22)),
		)
		yPos += 32

		portEdit := ui.NewEdit(
			wnd,
			ui.OptsEdit().
				Text(strconv.Itoa(cfg.Port)).
				Position(ui.Dpi(20, yPos)).
				Width(ui.DpiX(600)),
		)
		ui.NewStatic(
			wnd,
			ui.OptsStatic().
				Text("Gateway Port (1024-65535) — restart required after change").
				Position(ui.Dpi(20, yPos+25)).
				Size(ui.Dpi(600, 16)),
		)
		yPos += 56

		ocUrlEdit := ui.NewEdit(
			wnd,
			ui.OptsEdit().
				Text(cfg.OcURL).
				Position(ui.Dpi(20, yPos)).
				Width(ui.DpiX(600)),
		)
		ui.NewStatic(
			wnd,
			ui.OptsStatic().
				Text("opencode server URL").
				Position(ui.Dpi(20, yPos+25)).
				Size(ui.Dpi(600, 16)),
		)
		yPos += 56

		userEdit := ui.NewEdit(
			wnd,
			ui.OptsEdit().
				Text(cfg.Username).
				Position(ui.Dpi(20, yPos)).
				Width(ui.DpiX(600)),
		)
		ui.NewStatic(
			wnd,
			ui.OptsStatic().
				Text("opencode username").
				Position(ui.Dpi(20, yPos+25)).
				Size(ui.Dpi(600, 16)),
		)
		yPos += 56

		pwEdit := ui.NewEdit(
			wnd,
			ui.OptsEdit().
				Text(cfg.Password).
				Position(ui.Dpi(20, yPos)).
				Width(ui.DpiX(600)),
		)
		ui.NewStatic(
			wnd,
			ui.OptsStatic().
				Text("opencode password").
				Position(ui.Dpi(20, yPos+25)).
				Size(ui.Dpi(600, 16)),
		)
		yPos += 56

		ui.NewStatic(
			wnd,
			ui.OptsStatic().
				Text("Network (auto-detected, read-only)").
				Position(ui.Dpi(20, yPos)).
				Size(ui.Dpi(600, 20)),
		)
		yPos += 22

		networkText := buildNetworkText(cfg)
		ui.NewEdit(
			wnd,
			ui.OptsEdit().
				Text(networkText).
				Position(ui.Dpi(20, yPos)).
				Width(ui.DpiX(600)).
				Height(ui.DpiY(90)),
		)
		yPos += 100

		autoRecheckChk := ui.NewCheckBox(
			wnd,
			ui.OptsCheckBox().
				Text("Auto-detect public IP periodically (handles ISP IP rotation)").
				Position(ui.Dpi(20, yPos)).
				Size(ui.Dpi(600, 20)),
		)
		if cfg.AutoRecheck {
			autoRecheckChk.SetCheck(true)
		}
		yPos += 28

		ui.NewStatic(
			wnd,
			ui.OptsStatic().
				Text("Recheck interval:").
				Position(ui.Dpi(20, yPos)).
				Size(ui.Dpi(150, 20)),
		)

		intervals := []int{60, 300, 900, 1800, 3600}
		intervalLabels := []string{"1 minute", "5 minutes", "15 minutes", "30 minutes", "60 minutes"}
		curSel := 0
		for i, v := range intervals {
			if cfg.IPRecheckSeconds == v {
				curSel = i
				break
			}
		}

		recheckCombo := ui.NewComboBox(
			wnd,
			ui.OptsComboBox().
				Position(ui.Dpi(180, yPos-2)).
				Width(ui.DpiX(200)),
		)
		recheckCombo.AddItem(intervalLabels...)
		recheckCombo.SelectIndex(curSel)

		recheckNowBtn := ui.NewButton(
			wnd,
			ui.OptsButton().
				Text("Re-check &now").
				Position(ui.Dpi(400, yPos-4)).
				Width(ui.DpiX(180)).
				Height(ui.DpiY(26)),
		)
		recheckNowBtn.On().BnClicked(func() {
			go func() {
				if ipMon != nil {
					ipMon.CheckNow()
				}
				display := "No public IP detected"
				if cfg.Host != "" {
					display = "Current public IP: " + cfg.Host
				}
				wnd.UiThread(func() {
					ui.MsgOk(wnd, "Recheck complete", display, "If your public IP changed, the phone was notified.")
				})
			}()
		})
		yPos += 40

		saveBtn := ui.NewButton(
			wnd,
			ui.OptsButton().
				Text("&Save").
				Position(ui.Dpi(220, yPos)).
				Width(ui.DpiX(90)).
				Height(ui.DpiY(30)),
		)
		cancelBtn := ui.NewButton(
			wnd,
			ui.OptsButton().
				Text("&Cancel").
				Position(ui.Dpi(330, yPos)).
				Width(ui.DpiX(90)).
				Height(ui.DpiY(30)),
		)

		saveBtn.On().BnClicked(func() {
			portStr := portEdit.Text()
			port, err := strconv.Atoi(portStr)
			if err != nil || port < 1024 || port > 65535 {
				ui.MsgError(wnd, "Invalid Port", "Port must be a number between 1024 and 65535.", "")
				return
			}

			newCfg := *cfg
			newCfg.Port = port
			newCfg.OcURL = ocUrlEdit.Text()
			newCfg.Username = userEdit.Text()
			newCfg.Password = pwEdit.Text()
			newCfg.AutoRecheck = autoRecheckChk.IsChecked()
			sel := recheckCombo.SelectedIndex()
			if sel >= 0 && sel < len(intervals) {
				newCfg.IPRecheckSeconds = intervals[sel]
			}

			if err := saveConfig(newCfg); err != nil {
				ui.MsgError(wnd, "Save Failed", "Could not save config:", err.Error())
				return
			}

			*cfg = newCfg

			if onRestart != nil {
				onRestart(newCfg)
			}

			wnd.Hwnd().DestroyWindow()
		})

		cancelBtn.On().BnClicked(func() {
			wnd.Hwnd().DestroyWindow()
		})

		wnd.RunAsMain()
	}()
}

func buildNetworkText(cfg *Config) string {
	lines := []string{}
	for _, la := range getLocalIPs() {
		var label string
		switch la.Type {
		case "lan":
			label = "LAN"
		case "tunnel":
			label = "Tunnel (Tailscale/ZeroTier/etc.)"
		case "ipv6":
			label = "IPv6"
		default:
			label = la.Type
		}
		lines = append(lines, fmt.Sprintf("%s:  %s", label, la.IP))
	}
	extIP4, extIP6 := getExternalIPs()
	if extIP4 != "" {
		lines = append(lines, fmt.Sprintf("Public IPv4:  %s", extIP4))
	}
	if extIP6 != "" {
		lines = append(lines, fmt.Sprintf("Public IPv6:  %s", extIP6))
	}
	if len(lines) == 0 {
		return "No network interfaces detected."
	}
	return strings.Join(lines, "\n")
}
