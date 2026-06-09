# GOpencode Desktop App - Headless & Remote Access Guide

## Overview

The GOpencode desktop app now supports headless operation and remote connections, allowing you to:
- Run without a system tray icon (ideal for servers)
- Access your gateway from outside your local network
- Run as a Windows service for automatic startup

## Quick Start

### Basic Usage

```bash
# Normal mode (system tray)
gopencode.exe

# Headless mode (no system tray)
gopencode.exe -headless

# Specify external host/IP
gopencode.exe -headless -host 192.168.1.100

# Specify port
gopencode.exe -port 8080

# Run as Windows service
gopencode.exe -service
```

### Service Management

Use the provided `service.bat` script to manage the Windows service:

```batch
# Install as service
service.bat install

# Start service
service.bat start

# Stop service  
service.bat stop

# Remove service
service.bat remove

# Check status
service.bat status

# Run in background (not as service)
service.bat run
```

## Command Line Options

| Option | Description | Default |
|--------|-------------|---------|
| `-headless` | Run without system tray | false |
| `-host <host>` | External host/IP for remote access | auto-detect |
| `-port <port>` | Gateway port number | 8765 |
| `-service` | Run as Windows service | false |
| `-service-name <name>` | Service name | GOpencode |
| `-service-desc <desc>` | Service description | GOpencode Gateway |

## Configuration

### Web Interface Settings

Access the web interface at `http://localhost:8765/settings` (or your configured port). You can configure:

- **Gateway Port**: The port the gateway listens on
- **External Host/IP**: Your machine's IP or hostname for remote access (leave empty to auto-detect)
- **opencode URL**: The URL of your opencode server
- **Username/Password**: Authentication for the opencode server
- **Run Headless**: Enable/disable headless mode

### Remote Access Setup

1. **Determine your external IP/hostname**:
   - **Local network**: Use your computer's IP address (e.g., `192.168.1.100`)
   - **Internet access**: Use your public IP or dynamic DNS hostname
   - **Auto-detection**: Leave the External Host/IP field empty for automatic detection

2. **Configure firewall**:
   - Open the gateway port (default: 8765) in your firewall
   - For internet access, forward port 8765 from your router to the local machine

3. **Pair your device**:
   - Access the pairing page: `http://your-ip:8765/pairing`
   - Scan the QR code or enter the connection details manually

## Headless Mode

When running in headless mode (`-headless`):
- No system tray icon appears
- The application runs in the background
- Output is logged to the console
- Perfect for servers and remote deployment

## Windows Service Mode

When running as a service (`-service`):
- The application starts automatically when Windows boots
- Runs in headless mode automatically
- Controlled via Windows Service Manager
- Logs are written to Windows Event Viewer

### Service Commands

```bash
# Install service
sc create GOpencode binPath= "C:\path\to\gopencode.exe -service" DisplayName= "GOpencode Gateway" start= auto

# Start service
net start GOpencode

# Stop service
net stop GOpencode

# Delete service
sc delete GOpencode
```

## Security Considerations

1. **Network Security**:
   - Use strong passwords for your opencode server
   - Consider using SSH tunneling or VPN for remote access
   - Only expose to trusted networks

2. **Firewall Configuration**:
   - Only open necessary ports
   - Use firewall rules to restrict access to specific IP ranges

3. **Authentication**:
   - Always use username/password authentication
   - Change default passwords
   - Use strong, unique passwords

## Troubleshooting

### Common Issues

1. **Port already in use**:
   - Change the port using `-port` option
   - Check what's using the port: `netstat -ano | findstr :8765`

2. **Remote connection fails**:
   - Verify firewall settings
   - Check external host/IP configuration
   - Ensure the gateway is running

3. **Service won't start**:
   - Check Windows Event Viewer for error messages
   - Verify the executable path
   - Ensure service account has proper permissions

### Logs

- **Console**: When running in headless mode, logs go to console
- **Windows Service**: Logs go to Windows Event Viewer
- **Debug**: Add debug logging by modifying the source code

## Advanced Configuration

### Environment Variables

```bash
set OPENCODE_PASSWORD=your_password
set GOPENCODE_HOST=192.168.1.100
set GOPENCODE_PORT=8080
```

### Configuration File Location

The configuration file is stored in:
- **Windows**: `%APPDATA%\GOpencode\config.json`
- **Linux/macOS**: `~/config/gopencode/desktop/config.json`

### Network Interface Detection

The app automatically detects the best network interface for external access. You can override this by setting the `-host` parameter.

## Examples

### Development Setup
```bash
# Run for development with verbose output
gopencode.exe -headless -host localhost -port 8765
```

### Production Server
```bash
# Run as service on external IP
gopencode.exe -service -host server.example.com -port 8765
```

### Testing Remote Access
```bash
# Test with specific host
gopencode.exe -headless -host 192.168.1.100
```

## Migration from Version 1.x

If you're upgrading from a previous version:
1. Your existing configuration will be preserved
2. The new `Host` field will default to "localhost"
3. To enable remote access, set the External Host/IP in the web settings
4. Consider running in headless mode for better integration