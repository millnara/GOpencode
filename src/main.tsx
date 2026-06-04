import React from "react";
import { createRoot } from "react-dom/client";
import { Capacitor } from "@capacitor/core";
import { StatusBar, Style } from "@capacitor/status-bar";
import { App } from "@capacitor/app";
import AppComp from "./App";
import "./styles.css";
import { loadConn } from "./lib/settings";

async function initNative() {
  if (!Capacitor.isNativePlatform()) return;
  try {
    await StatusBar.setStyle({ style: Style.Dark });
    await StatusBar.setBackgroundColor({ color: "#0d0d0f" });
  } catch { /* ignore */ }
  try {
    App.addListener("backButton", () => {
      if (history.length > 1) {
        history.back();
      } else {
        App.exitApp();
      }
    });
  } catch { /* ignore */ }
}

loadConn().finally(() => {
  createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <AppComp />
    </React.StrictMode>
  );
  initNative();
});
