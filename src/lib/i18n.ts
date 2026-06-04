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
    "app.title": "opencode",
    "projects.title": "Progetti",
    "projects.search": "Cerca progetti…",
    "projects.empty": "Nessun progetto trovato.",
    "sessions.empty": "Nessuna sessione. Tocca + per iniziarne una.",
    "sessions.new": "Nuova",
    "chat.placeholder": "Scrivi a opencode…",
    "chat.working": "elaborazione…",
    "perm.title": "Permesso",
    "perm.allow": "Consenti",
    "perm.always": "Sempre",
    "perm.deny": "Nega",
    "settings.title": "Impostazioni",
    "settings.server": "URL server",
    "settings.password": "Password",
    "settings.save": "Salva",
    "nav.projects": "Progetti",
    "nav.settings": "Impostazioni",
  },
  "zh-TW": {
    "app.title": "opencode",
    "projects.title": "專案",
    "projects.search": "搜尋專案…",
    "projects.empty": "找不到專案。",
    "sessions.empty": "尚無對話。點擊 + 開始新對話。",
    "sessions.new": "新增",
    "chat.placeholder": "給 opencode 發訊息…",
    "chat.working": "處理中…",
    "perm.title": "權限",
    "perm.allow": "允許",
    "perm.always": "永遠允許",
    "perm.deny": "拒絕",
    "settings.title": "設定",
    "settings.server": "伺服器網址",
    "settings.password": "密碼",
    "settings.save": "儲存",
    "nav.projects": "專案",
    "nav.settings": "設定",
  },
};

export function t(key: string): string {
  const loc = getConn().locale || "en";
  return DICT[loc]?.[key] ?? DICT.en[key] ?? key;
}
export const locales = Object.keys(DICT);
