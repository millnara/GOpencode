import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.gary.gopencode",
  appName: "GOpencode",
  webDir: "dist",
  // Allow cleartext HTTP to the opencode server (e.g. over LAN or Tailscale).
  // For production prefer HTTPS.
  server: {
    androidScheme: "http",
    cleartext: true,
  },
  plugins: {
    LocalNotifications: {
      smallIcon: "ic_stat_icon",
      iconColor: "#4f6cff",
    },
  },
};

export default config;
