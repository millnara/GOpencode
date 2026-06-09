package main

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
)

type Config struct {
	Port             int    `json:"port"`
	OcURL            string `json:"ocUrl"`
	Username         string `json:"username"`
	Password         string `json:"password"`
	AutoStart        bool   `json:"autoStart"`
	Host             string `json:"host"`             // External hostname/IP for remote access
	Headless         bool   `json:"headless"`         // Run headless without system tray
	AutoRecheck      bool   `json:"autoRecheck"`      // Re-detect public IP periodically
	IPRecheckSeconds int    `json:"ipRecheckSeconds"` // How often to re-detect (seconds)
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
	if cfg.Port == 0 { cfg.Port = defaultConfig.Port }
	if cfg.OcURL == "" { cfg.OcURL = defaultConfig.OcURL }
	if cfg.Username == "" { cfg.Username = defaultConfig.Username }
	return applyEnv(cfg)
}

func applyEnv(cfg Config) Config {
	if pw := os.Getenv("OPENCODE_PASSWORD"); pw != "" && cfg.Password == "" {
		cfg.Password = pw
	}
	return cfg
}

func saveConfig(cfg Config) error {
	data, err := json.MarshalIndent(cfg, "", "  ")
	if err != nil {
		return fmt.Errorf("marshal config: %w", err)
	}
	return os.WriteFile(configPath(), data, 0600)
}
