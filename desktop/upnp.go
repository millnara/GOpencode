package main

import (
	"io"
	"net"
	"net/http"
	"strings"
	"time"
)

type UPnP struct {
	available  bool
	localIP    string
	externalIP string
	externalIP6 string
}

func DetectUPnP(port int) *UPnP {
	upnp := &UPnP{
		localIP: getLocalIP(),
	}

	extIP4, extIP6 := getExternalIPs()
	upnp.externalIP = extIP4
	upnp.externalIP6 = extIP6

	if extIP4 != "" && extIP4 != "127.0.0.1" && !isPrivateIPv4(extIP4) {
		upnp.available = true
	} else if extIP6 != "" && !isPrivateIPv6(extIP6) {
		upnp.available = true
	}

	return upnp
}

func getExternalIP() string {
	v4, _ := getExternalIPs()
	return v4
}

func getExternalIP6() string {
	_, v6 := getExternalIPs()
	return v6
}

func getExternalIPs() (string, string) {
	var v4, v6 string

	ipv4Services := []string{
		"https://api.ipify.org",
		"https://ipv4.icanhazip.com",
		"https://ifconfig.me/ip",
	}
	for _, svc := range ipv4Services {
		if ip := fetchIP(svc, false); ip != "" {
			v4 = ip
			break
		}
	}

	ipv6Services := []string{
		"https://api64.ipify.org",
		"https://ipv6.icanhazip.com",
		"https://ifconfig.co/ip",
	}
	for _, svc := range ipv6Services {
		if ip := fetchIP(svc, true); ip != "" {
			v6 = ip
			break
		}
	}

	return v4, v6
}

func fetchIP(url string, preferV6 bool) string {
	client := &http.Client{Timeout: 5 * time.Second}

	if preferV6 {
		ipv6Transport := &http.Transport{
			DialContext: (&net.Dialer{
				Timeout:   5 * time.Second,
				FallbackDelay: -1,
			}).DialContext,
		}
		client.Transport = ipv6Transport
	}

	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return ""
	}
	req.Header.Set("User-Agent", "GOpencode/0.3")

	resp, err := client.Do(req)
	if err != nil {
		return ""
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		return ""
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return ""
	}

	ip := strings.TrimSpace(string(body))
	parsed := net.ParseIP(ip)
	if parsed == nil {
		return ""
	}
	isV4 := parsed.To4() != nil
	if preferV6 && isV4 {
		return ""
	}
	if !preferV6 && !isV4 {
		return ""
	}
	return ip
}

func isPrivateIPv4(ipStr string) bool {
	ip := net.ParseIP(ipStr)
	if ip == nil {
		return true
	}
	if ip.IsLoopback() || ip.IsLinkLocalUnicast() || ip.IsLinkLocalMulticast() {
		return true
	}
	if ip4 := ip.To4(); ip4 != nil {
		if ip4[0] == 10 {
			return true
		}
		if ip4[0] == 172 && ip4[1] >= 16 && ip4[1] <= 31 {
			return true
		}
		if ip4[0] == 192 && ip4[1] == 168 {
			return true
		}
		if ip4[0] == 100 && ip4[1] >= 64 && ip4[1] <= 127 {
			return true
		}
	}
	return false
}

func isPrivateIPv6(ipStr string) bool {
	ip := net.ParseIP(ipStr)
	if ip == nil {
		return true
	}
	if ip.IsLoopback() || ip.IsLinkLocalUnicast() || ip.IsLinkLocalMulticast() {
		return true
	}
	if ip.IsPrivate() {
		return true
	}
	return false
}

func getLocalIP() string {
	ifaces, err := net.Interfaces()
	if err != nil {
		return "127.0.0.1"
	}

	for _, iface := range ifaces {
		if iface.Flags&net.FlagLoopback != 0 || iface.Flags&net.FlagUp == 0 {
			continue
		}
		addrs, err := iface.Addrs()
		if err != nil {
			continue
		}
		for _, addr := range addrs {
			var ip net.IP
			switch v := addr.(type) {
			case *net.IPNet:
				ip = v.IP
			case *net.IPAddr:
				ip = v.IP
			}
			if ip == nil || ip.IsLoopback() {
				continue
			}
			if ip.To4() != nil {
				return ip.String()
			}
		}
	}
	return "127.0.0.1"
}

type LocalAddress struct {
	IP   string
	Type string
}

func getLocalIPs() []LocalAddress {
	ifaces, err := net.Interfaces()
	if err != nil {
		return nil
	}
	var out []LocalAddress
	for _, iface := range ifaces {
		if iface.Flags&net.FlagLoopback != 0 || iface.Flags&net.FlagUp == 0 {
			continue
		}
		addrs, err := iface.Addrs()
		if err != nil {
			continue
		}
		for _, addr := range addrs {
			var ip net.IP
			switch v := addr.(type) {
			case *net.IPNet:
				ip = v.IP
			case *net.IPAddr:
				ip = v.IP
			}
			if ip == nil || ip.IsLoopback() {
				continue
			}
			v4 := ip.To4()
			if v4 != nil {
				if v4[0] == 169 && v4[1] == 254 {
					continue
				}
				if v4[0] == 100 && v4[1] >= 64 && v4[1] <= 127 {
					out = append(out, LocalAddress{IP: ip.String(), Type: "tunnel"})
				} else if v4[0] == 10 ||
					(v4[0] == 172 && v4[1] >= 16 && v4[1] <= 31) ||
					(v4[0] == 192 && v4[1] == 168) {
					out = append(out, LocalAddress{IP: ip.String(), Type: "lan"})
				}
			} else {
				if ip.IsLinkLocalUnicast() {
					continue
				}
				out = append(out, LocalAddress{IP: ip.String(), Type: "ipv6"})
			}
		}
	}
	return out
}

func isTunnelIP(ipStr string) bool {
	ip := net.ParseIP(ipStr)
	if ip == nil {
		return false
	}
	v4 := ip.To4()
	if v4 == nil {
		return false
	}
	return v4[0] == 100 && v4[1] >= 64 && v4[1] <= 127
}
