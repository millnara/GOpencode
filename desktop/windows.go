package main

import (
	"encoding/json"
	"fmt"
	"image"
	"os"
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
			logf("Failed to marshal pairing: %v", err)
			return
		}

		qr, err := qrcode.New(string(qrPayload), qrcode.Medium)
		if err != nil {
			logf("Failed to generate QR: %v", err)
			return
		}

		// Big QR: the payload (endpoint list + creds) is dense, and phones scan
		// from a monitor — small modules don't resolve.
		const qrSize = 380
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
			ClassIconId(2). // horse icon: rsrc puts the RT_GROUP_ICON at ID 2 (ID 1 is the image)
			Size(ui.Dpi(480, 760)).
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
			Position(ui.Dpi(50, 64)).
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
			Position(ui.Dpi(20, 456)).
			Size(ui.Dpi(440, 20)),
	)

	ui.NewEdit(
		wnd,
		ui.OptsEdit().
			Text(strings.Join(p.Endpoints, "\n")).
			Position(ui.Dpi(20, 478)).
			Width(ui.DpiX(440)).
			Height(ui.DpiY(90)).
			CtrlStyle(co.ES_MULTILINE|co.ES_AUTOVSCROLL|co.ES_READONLY),
	)

	yPos := 580
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
				ClassIconId(2). // horse icon: rsrc puts the RT_GROUP_ICON at ID 2 (ID 1 is the image)
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

// showPhrasesWindow edits the working-indicator phrase set: one phrase per
// line, ":" for linked lines. Saving persists to config and pushes to the
// connected phone; Import/Export read/write a JSON set file.
func showPhrasesWindow(gw *Gateway, cfg *Config) {
	go func() {
		runtime.LockOSThread()
		defer runtime.UnlockOSThread()

		wnd := ui.NewMain(
			ui.OptsMain().
				Title("GOpencode - Working Phrases").
				ClassIconId(2).
				Size(ui.Dpi(560, 520)).
				Style(co.WS_CAPTION | co.WS_SYSMENU | co.WS_CLIPCHILDREN | co.WS_BORDER | co.WS_VISIBLE | co.WS_MINIMIZEBOX | co.WS_SIZEBOX | co.WS_MAXIMIZEBOX),
		)

		y := 14
		ui.NewStatic(wnd, ui.OptsStatic().
			Text("Phrases shown on the phone while the AI is working (picked at random).").
			Position(ui.Dpi(20, y)).Size(ui.Dpi(520, 18)))
		y += 22
		ui.NewStatic(wnd, ui.OptsStatic().
			Text("One phrase per line.  Use ':' for linked lines that type one after another.").
			Position(ui.Dpi(20, y)).Size(ui.Dpi(520, 18)))
		y += 28

		ui.NewStatic(wnd, ui.OptsStatic().Text("Set name:").Position(ui.Dpi(20, y+3)).Size(ui.Dpi(64, 18)))
		nameEdit := ui.NewEdit(wnd, ui.OptsEdit().Text(cfg.PhrasesName).Position(ui.Dpi(88, y)).Width(ui.DpiX(300)))
		y += 34

		phrasesEdit := ui.NewEdit(wnd, ui.OptsEdit().
			Text(strings.Join(cfg.Phrases, "\r\n")).
			Position(ui.Dpi(20, y)).
			Width(ui.DpiX(520)).
			Height(ui.DpiY(270)).
			CtrlStyle(co.ES_MULTILINE|co.ES_AUTOVSCROLL|co.ES_WANTRETURN))
		y += 284

		importBtn := ui.NewButton(wnd, ui.OptsButton().Text("&Import…").Position(ui.Dpi(20, y)).Width(ui.DpiX(100)).Height(ui.DpiY(30)))
		exportBtn := ui.NewButton(wnd, ui.OptsButton().Text("&Export…").Position(ui.Dpi(128, y)).Width(ui.DpiX(100)).Height(ui.DpiY(30)))
		saveBtn := ui.NewButton(wnd, ui.OptsButton().Text("&Save && send").Position(ui.Dpi(326, y)).Width(ui.DpiX(116)).Height(ui.DpiY(30)))
		closeBtn := ui.NewButton(wnd, ui.OptsButton().Text("&Close").Position(ui.Dpi(450, y)).Width(ui.DpiX(90)).Height(ui.DpiY(30)))

		parse := func() (string, []string) {
			name := strings.TrimSpace(nameEdit.Text())
			if name == "" {
				name = "Set"
			}
			raw := strings.ReplaceAll(phrasesEdit.Text(), "\r\n", "\n")
			var out []string
			for _, ln := range strings.Split(raw, "\n") {
				ln = strings.TrimRight(ln, " \t")
				if strings.TrimSpace(ln) != "" {
					out = append(out, ln)
				}
			}
			return name, out
		}

		importBtn.On().BnClicked(func() {
			path, ok := pickFile(wnd.Hwnd(), false, "")
			if !ok {
				return
			}
			data, err := os.ReadFile(path)
			if err != nil {
				ui.MsgError(wnd, "Import failed", "Could not read the file:", err.Error())
				return
			}
			var set struct {
				Name    string   `json:"name"`
				Phrases []string `json:"phrases"`
			}
			if err := json.Unmarshal(data, &set); err != nil || len(set.Phrases) == 0 {
				ui.MsgError(wnd, "Import failed", "That isn't a valid GOpencode phrase set.", "")
				return
			}
			if set.Name != "" {
				nameEdit.SetText(set.Name)
			}
			phrasesEdit.SetText(strings.Join(set.Phrases, "\r\n"))
		})

		exportBtn.On().BnClicked(func() {
			name, phrases := parse()
			path, ok := pickFile(wnd.Hwnd(), true, sanitizeFileName(name)+".json")
			if !ok {
				return
			}
			data, _ := json.MarshalIndent(map[string]interface{}{"name": name, "phrases": phrases}, "", "  ")
			if err := os.WriteFile(path, data, 0600); err != nil {
				ui.MsgError(wnd, "Export failed", "Could not write the file:", err.Error())
				return
			}
			ui.MsgOk(wnd, "Exported", "Saved "+strconv.Itoa(len(phrases))+" phrases to:", path)
		})

		saveBtn.On().BnClicked(func() {
			name, phrases := parse()
			if len(phrases) == 0 {
				ui.MsgError(wnd, "No phrases", "Add at least one phrase.", "")
				return
			}
			newCfg := *cfg
			newCfg.PhrasesName = name
			newCfg.Phrases = phrases
			if err := saveConfig(newCfg); err != nil {
				ui.MsgError(wnd, "Save failed", "Could not save config:", err.Error())
				return
			}
			*cfg = newCfg
			if gw != nil {
				gw.SetPhrases(name, phrases)
			}
			ui.MsgOk(wnd, "Saved", "Saved "+strconv.Itoa(len(phrases))+" phrases.", "Sent to the phone if it's connected.")
		})

		closeBtn.On().BnClicked(func() { wnd.Hwnd().DestroyWindow() })

		wnd.RunAsMain()
	}()
}

// pickFile shows the native open/save dialog filtered to JSON, returning the
// chosen filesystem path. save=true uses the Save dialog with overwrite prompt.
func pickFile(owner win.HWND, save bool, defName string) (string, bool) {
	already, _ := win.CoInitializeEx(co.COINIT_APARTMENTTHREADED | co.COINIT_DISABLE_OLE1DDE)
	if !already {
		defer win.CoUninitialize()
	}
	rel := win.NewOleReleaser()
	defer rel.Release()

	var fd *win.IFileDialog
	if save {
		var fsd *win.IFileSaveDialog
		if err := win.CoCreateInstance(rel, &co.CLSID_FileSaveDialog, nil, co.CLSCTX_INPROC_SERVER, &fsd); err != nil {
			return "", false
		}
		fd = &fsd.IFileDialog
	} else {
		var fod *win.IFileOpenDialog
		if err := win.CoCreateInstance(rel, &co.CLSID_FileOpenDialog, nil, co.CLSCTX_INPROC_SERVER, &fod); err != nil {
			return "", false
		}
		fd = &fod.IFileDialog
	}

	opts, _ := fd.GetOptions()
	opts |= co.FOS_FORCEFILESYSTEM
	if save {
		opts |= co.FOS_OVERWRITEPROMPT
	} else {
		opts |= co.FOS_FILEMUSTEXIST
	}
	fd.SetOptions(opts)
	fd.SetFileTypes([]win.COMDLG_FILTERSPEC{
		{Name: "GOpencode phrase set (*.json)", Spec: "*.json"},
		{Name: "All files (*.*)", Spec: "*.*"},
	})
	fd.SetFileTypeIndex(1)
	fd.SetDefaultExtension("json")
	if defName != "" {
		fd.SetFileName(defName)
	}

	ok, _ := fd.Show(owner)
	if !ok {
		return "", false
	}
	item, err := fd.GetResult(rel)
	if err != nil {
		return "", false
	}
	path, err := item.GetDisplayName(co.SIGDN_FILESYSPATH)
	if err != nil {
		return "", false
	}
	return path, true
}

// sanitizeFileName makes a phrase-set name safe for a default file name.
func sanitizeFileName(s string) string {
	if s == "" {
		return "phrases"
	}
	repl := func(r rune) rune {
		if strings.ContainsRune(`\/:*?"<>|`, r) {
			return '_'
		}
		return r
	}
	return strings.Map(repl, s)
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
