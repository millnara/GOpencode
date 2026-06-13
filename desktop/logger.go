package main

import (
	"fmt"
	"os"
	"path/filepath"
	"sync"
	"time"
)

var (
	logFile  *os.File
	logMutex sync.Mutex
)

func initLogging() {
	appData := os.Getenv("APPDATA")
	if appData == "" {
		home, _ := os.UserHomeDir()
		appData = filepath.Join(home, "AppData", "Roaming")
	}
	dir := filepath.Join(appData, "GOpencode")
	os.MkdirAll(dir, 0700)

	// Rotate old log
	logPath := filepath.Join(dir, "gateway.log")
	oldPath := filepath.Join(dir, "gateway.old.log")
	if fi, err := os.Stat(logPath); err == nil && fi.Size() > 2*1024*1024 {
		os.Rename(logPath, oldPath)
	}

	f, err := os.OpenFile(logPath, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0600)
	if err != nil {
		return
	}
	logFile = f
	f.WriteString(time.Now().Format("15:04:05.000") + " gateway started\n")
}

func logf(format string, args ...interface{}) {
	logMutex.Lock()
	defer logMutex.Unlock()
	msg := fmt.Sprintf(format, args...)
	now := time.Now().Format("15:04:05.000")
	line := now + " " + msg + "\n"
	if logFile != nil {
		logFile.WriteString(line)
		logFile.Sync()
	}
}

func closeLogging() {
	if logFile != nil {
		logFile.Sync()
		logFile.Close()
	}
}
