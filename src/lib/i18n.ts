const DICT: Record<string, string> = {
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
};

export function t(key: string): string {
  return DICT[key] ?? key;
}
