// Local notification when an assistant turn finishes while the app is backgrounded.
// Uses Capacitor LocalNotifications on device, falls back to the web Notification API.
import { Capacitor } from "@capacitor/core";

let notifId = 1;

export async function ensureNotifyPermission(): Promise<boolean> {
  try {
    if (Capacitor.isNativePlatform()) {
      const { LocalNotifications } = await import("@capacitor/local-notifications");
      const p = await LocalNotifications.requestPermissions();
      return p.display === "granted";
    }
    if ("Notification" in window) {
      if (Notification.permission === "granted") return true;
      const r = await Notification.requestPermission();
      return r === "granted";
    }
  } catch { /* ignore */ }
  return false;
}

export async function notifyDone(title: string, body: string): Promise<void> {
  // Only notify if the app is not in the foreground.
  if (document.visibilityState === "visible") return;
  try {
    if (Capacitor.isNativePlatform()) {
      const { LocalNotifications } = await import("@capacitor/local-notifications");
      await LocalNotifications.schedule({
        notifications: [{ id: notifId++, title, body, schedule: { at: new Date(Date.now() + 100) } }],
      });
      return;
    }
    if ("Notification" in window && Notification.permission === "granted") {
      new Notification(title, { body });
    }
  } catch { /* ignore */ }
}
