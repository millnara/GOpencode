import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.gary.gopencode",
  appName: "GOpencode",
  webDir: "dist",
  // Allow cleartext HTTP to the Tailscale server (http://gg-45-ferngrove:4096).
  // For production prefer HTTPS via `tailscale serve`.
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
