package main

import (
	"encoding/json"
	"fmt"
	"html/template"
	"net"
	"net/http"
	"os/exec"
)

func startWebServer(gw *Gateway, cfg *Config, onSave func(Config)) (int, error) {
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil { return 0, err }
	port := listener.Addr().(*net.TCPAddr).Port

	mux := http.NewServeMux()
	mux.HandleFunc("/settings", func(w http.ResponseWriter, r *http.Request) {
		if r.Method == "POST" {
			r.ParseForm()
			newCfg := *cfg
			fmt.Sscanf(r.FormValue("port"), "%d", &newCfg.Port)
			newCfg.OcURL = r.FormValue("ocUrl")
			newCfg.Username = r.FormValue("username")
			newCfg.Password = r.FormValue("password")
			if err := saveConfig(newCfg); err == nil {
				*cfg = newCfg
				onSave(newCfg)
			}
			w.Header().Set("Content-Type", "text/html")
			fmt.Fprintf(w, `<html><body style="background:#0d0d0f;color:#ececee;font-family:-apple-system,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0"><div style="text-align:center"><h2>Saved</h2><p style="color:#9a9aa3">Restart GOpencode for port changes to take effect</p><p style="font-size:13px;color:#6b6b73">You can close this window</p></div></body></html>`)
			return
		}
		w.Header().Set("Content-Type", "text/html")
		renderSettings(w, *cfg)
	})

	mux.HandleFunc("/pairing", func(w http.ResponseWriter, r *http.Request) {
		info := gw.PairingInfo()
		w.Header().Set("Content-Type", "text/html")
		renderPairing(w, info["ws"], info["room"], info["pw"])
	})

	go http.Serve(listener, mux)
	return port, nil
}

func openBrowser(url string) {
	exec.Command("rundll32", "url.dll,FileProtocolHandler", url).Start()
}

func renderSettings(w http.ResponseWriter, cfg Config) {
	tmpl := template.Must(template.New("settings").Parse(settingsHTML))
	tmpl.Execute(w, cfg)
}

func renderPairing(w http.ResponseWriter, ws, room, pw string) {
	data := map[string]string{"ws": ws, "room": room, "pw": pw}
	jsonData, _ := json.Marshal(data)
	tmpl := template.Must(template.New("pairing").Parse(pairingHTML))
	tmpl.Execute(w, map[string]string{
		"WS":       ws,
		"Room":     room,
		"PW":       pw,
		"JSONData": string(jsonData),
	})
}

const settingsHTML = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>GOpencode Settings</title>
<style>
*{box-sizing:border-box;margin:0}
body{background:#0d0d0f;color:#ececee;font-family:-apple-system,BlinkMacSystemFont,Inter,Segoe UI,Roboto,sans-serif;padding:24px;max-width:420px;margin:0 auto;-webkit-font-smoothing:antialiased}
h2{font-size:18px;font-weight:700;margin-bottom:20px;letter-spacing:-.02em}
label{display:block;margin-bottom:14px}
label span{display:block;font-size:13px;color:#9a9aa3;margin-bottom:5px;font-weight:500}
input,select{width:100%;background:#161618;border:1px solid #2a2a2f;border-radius:10px;padding:10px 14px;color:#ececee;font-size:14px;font-family:inherit;outline:none}
input:focus{border-color:#cc785c}
button{width:100%;background:#cc785c;color:#fff;border:none;border-radius:10px;padding:12px;font-weight:700;font-size:14px;cursor:pointer;margin-top:8px}
button:hover{filter:brightness(1.1)}
.hint{font-size:12px;color:#6b6b73;margin-top:16px;line-height:1.5}
.hint code{background:#161618;padding:2px 6px;border-radius:5px;font-family:SF Mono,Consolas,monospace}
</style></head><body>
<h2>Settings</h2>
<form method="POST">
<label><span>Gateway Port</span><input name="port" type="number" value="{{.Port}}" min="1024" max="65535"></label>
<label><span>opencode URL</span><input name="ocUrl" value="{{.OcURL}}" placeholder="http://127.0.0.1:4096"></label>
<label><span>Username</span><input name="username" value="{{.Username}}"></label>
<label><span>Password</span><input name="password" type="password" value="{{.Password}}" placeholder="opencode server password"></label>
<button type="submit">Save</button>
</form>
<div class="hint">Changes to the port require restarting GOpencode. The gateway proxies all traffic from your phone to opencode running at <code>{{.OcURL}}</code>.</div>
</body></html>`

const pairingHTML = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Pair Device</title>
<style>
*{box-sizing:border-box;margin:0}
body{background:#0d0d0f;color:#ececee;font-family:-apple-system,BlinkMacSystemFont,Inter,Segoe UI,Roboto,sans-serif;padding:24px;max-width:420px;margin:0 auto;text-align:center;-webkit-font-smoothing:antialiased}
h2{font-size:18px;font-weight:700;margin-bottom:6px;letter-spacing:-.02em}
.sub{font-size:13px;color:#9a9aa3;margin-bottom:20px}
#qr{margin:20px auto;background:#fff;padding:16px;border-radius:14px;display:inline-block}
.card{background:#161618;border:1px solid #2a2a2f;border-radius:12px;padding:14px;margin:10px 0;text-align:left}
.card .label{font-size:11px;color:#6b6b73;text-transform:uppercase;letter-spacing:.05em;margin-bottom:4px;font-weight:600}
.card .value{font-family:SF Mono,Consolas,monospace;font-size:13px;word-break:break-all;color:#e0a08a;font-weight:600}
.hint{font-size:12px;color:#6b6b73;margin-top:20px;line-height:1.6}
</style></head><body>
<h2>Pair your phone</h2>
<p class="sub">Scan the QR code with GOpencode, or enter the details manually</p>
<div id="qr"></div>
<div class="card"><div class="label">WebSocket URL</div><div class="value">{{.WS}}</div></div>
<div class="card"><div class="label">Room ID</div><div class="value">{{.Room}}</div></div>
<div class="card"><div class="label">Password</div><div class="value">{{.PW}}</div></div>
<div class="hint">Open GOpencode on your phone → Settings → Pair with gateway, then scan this QR or enter the details above.</div>
<script src="https://cdn.jsdelivr.net/npm/qrcodejs@1.0.0/qrcode.min.js"></script>
<script>
new QRCode(document.getElementById("qr"), {
  text: {{.JSONData}},
  width: 200, height: 200,
  colorDark: "#0d0d0f",
  colorLight: "#ffffff",
});
</script>
</body></html>`
