package main

import (
	"bufio"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

type Config struct {
	Port             int    `json:"port"`
	OcURL            string `json:"ocUrl"`
	Username         string `json:"username"`
	Password         string `json:"password"`
	Room             string `json:"room"`
	Pw               string `json:"pw"`
	AutoStart        bool   `json:"autoStart"`
	Host             string `json:"host"`
	Headless         bool   `json:"headless"`
	AutoRecheck      bool   `json:"autoRecheck"`
	IPRecheckSeconds int    `json:"ipRecheckSeconds"`
	// Working-indicator phrase set shown on the phone. Each phrase is one line;
	// ":" inside a phrase marks linked lines that animate one after another.
	PhrasesName string   `json:"phrasesName"`
	Phrases     []string `json:"phrases"`
}

var defaultConfig = Config{
	Port:             8765,
	OcURL:            "http://127.0.0.1:4096",
	Username:         "opencode",
	Password:         "",
	AutoStart:        false,
	Host:             "",
	Headless:         false,
	AutoRecheck:      true,
	IPRecheckSeconds: 60,
	PhrasesName:      "Default",
	Phrases: []string{
		"Calm your knickers, I'm doing it...",
		"Hope I don't fuck this up...",
		"Gimme dat...:Gimme dat...:I'm jokin'...",
	},
}

func configPath() string {
	appData := os.Getenv("APPDATA")
	if appData == "" {
		home, _ := os.UserHomeDir()
		appData = filepath.Join(home, "AppData", "Roaming")
	}
	dir := filepath.Join(appData, "GOpencode")
	os.MkdirAll(dir, 0700)
	return filepath.Join(dir, "config.json")
}

func loadConfig() Config {
	cfg := defaultConfig
	data, err := os.ReadFile(configPath())
	if err != nil {
		return applyEnv(cfg)
	}
	if err := json.Unmarshal(data, &cfg); err != nil {
		return applyEnv(defaultConfig)
	}
	if cfg.Port == 0 {
		cfg.Port = defaultConfig.Port
	}
	if cfg.OcURL == "" {
		cfg.OcURL = defaultConfig.OcURL
	}
	if cfg.Username == "" {
		cfg.Username = defaultConfig.Username
	}
	if len(cfg.Phrases) == 0 {
		cfg.Phrases = defaultConfig.Phrases
		cfg.PhrasesName = defaultConfig.PhrasesName
	}
	return applyEnv(cfg)
}

func applyEnv(cfg Config) Config {
	// Check the env var that opencode and the scheduled-task script use.
	if pw := os.Getenv("OPENCODE_SERVER_PASSWORD"); pw != "" && cfg.Password == "" {
		cfg.Password = pw
	}
	// Also try the alias some setups use.
	if pw := os.Getenv("OPENCODE_PASSWORD"); pw != "" && cfg.Password == "" {
		cfg.Password = pw
	}
	// If still empty, try to read it from the opencode scheduled-task script.
	if cfg.Password == "" {
		if pw := readPasswordFromScript(); pw != "" {
			cfg.Password = pw
		}
	}
	return cfg
}

func readPasswordFromScript() string {
	home, _ := os.UserHomeDir()
	paths := []string{
		filepath.Join(home, ".config", "opencode", "serve-web.cmd"),
		filepath.Join(home, ".config", "opencode", "serve-web.bat"),
	}
	for _, p := range paths {
		f, err := os.Open(p)
		if err != nil {
			continue
		}
		defer f.Close()
		sc := bufio.NewScanner(f)
		for sc.Scan() {
			line := sc.Text()
			// Look for: set "OPENCODE_SERVER_PASSWORD=..."
			// or: set OPENCODE_SERVER_PASSWORD=...
			line = strings.TrimSpace(line)
			for _, prefix := range []string{
				`set "OPENCODE_SERVER_PASSWORD=`,
				`set OPENCODE_SERVER_PASSWORD=`,
			} {
				if strings.HasPrefix(strings.ToUpper(line), strings.ToUpper(prefix)) {
					rest := line[len(prefix):]
					rest = strings.TrimRight(rest, `"`)
					rest = strings.TrimSpace(rest)
					if rest != "" {
						return rest
					}
				}
			}
		}
	}
	return ""
}

func saveConfig(cfg Config) error {
	data, err := json.MarshalIndent(cfg, "", "  ")
	if err != nil {
		return fmt.Errorf("marshal config: %w", err)
	}
	return os.WriteFile(configPath(), data, 0600)
}
