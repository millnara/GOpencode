// Minimal i18n (EN base). Add locales like giuliastro (it, zh-TW) by extending DICT.
import { getConn } from "./settings";

type Dict = Record<string, string>;
const DICT: Record<string, Dict> = {
  en: {
    "app.title": "opencode",
    "projects.title": "Projects",
    "projects.search": "Search projects…",
    "projects.empty": "No projects found.",
    "sessions.empty": "No sessions yet. Tap + to start one.",
    "sessions.new": "New",
    "chat.placeholder": "Message opencode…",
    "chat.working": "working…",
    "perm.title": "Permission",
    "perm.allow": "Allow",
    "perm.always": "Always",
    "perm.deny": "Deny",
    "settings.title": "Settings",
    "settings.server": "Server URL",
    "settings.password": "Password",
    "settings.save": "Save",
    "nav.projects": "Projects",
    "nav.settings": "Settings",
  },
  it: {
    "projects.title": "Progetti",
    "chat.placeholder": "Scrivi a opencode…",
    "perm.allow": "Consenti",
    "perm.deny": "Nega",
  },
};

export function t(key: string): string {
  const loc = getConn().locale || "en";
  return DICT[loc]?.[key] ?? DICT.en[key] ?? key;
}
export const locales = Object.keys(DICT);
