package main

import (
	"fmt"
	"log"

	"golang.org/x/sys/windows/svc"
	"golang.org/x/sys/windows/svc/debug"
)

type gopencodeService struct {
	gw  *Gateway
	cfg Config
}

func (s *gopencodeService) Execute(args []string, r <-chan svc.ChangeRequest, changes chan<- svc.Status) (ssec bool, errno uint32) {
	changes <- svc.Status{State: svc.StartPending}

	s.cfg = loadConfig()
	s.cfg.Headless = true

	s.gw = NewGateway(s.cfg)
	if err := s.gw.Start(); err != nil {
		log.Printf("Failed to start gateway: %v", err)
		changes <- svc.Status{State: svc.Stopped}
		return false, 1
	}

	changes <- svc.Status{State: svc.Running, Accepts: svc.AcceptStop | svc.AcceptShutdown}
	log.Printf("Service started - listening on port %d", s.cfg.Port)

loop:
	for {
		select {
		case c := <-r:
			switch c.Cmd {
			case svc.Interrogate:
				changes <- c.CurrentStatus
			case svc.Stop, svc.Shutdown:
				break loop
			}
		}
	}

	changes <- svc.Status{State: svc.StopPending}
	log.Println("Service stopping...")
	s.gw.Stop()
	changes <- svc.Status{State: svc.Stopped}
	return false, 0
}

func runAsWindowsService(cfg Config) error {
	isIntSess, err := svc.IsWindowsService()
	if err != nil {
		return fmt.Errorf("detect service: %v", err)
	}
	if !isIntSess {
		return fmt.Errorf("not running in service context")
	}

	elog := debug.New("gopencode")
	elog.Info(1, "starting in service mode")

	service := &gopencodeService{cfg: cfg}
	err = svc.Run("GOpencode", service)
	if err != nil {
		elog.Error(1, fmt.Sprintf("service failed: %v", err))
		return fmt.Errorf("service failed: %v", err)
	}

	return nil
}
