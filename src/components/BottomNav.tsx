import { t } from "../lib/i18n";

export default function BottomNav({ active }: { active: string }) {
  const Tab = ({ id, hash, icon, label }: { id: string; hash: string; icon: string; label: string }) => (
    <button className={"navtab" + (active === id ? " active" : "")} onClick={() => (location.hash = hash)}>
      <span className="navicon">{icon}</span>
      <span>{label}</span>
    </button>
  );
  return (
    <nav className="bottomnav">
      <Tab id="projects" hash="#/" icon="📁" label={t("nav.projects")} />
      <Tab id="settings" hash="#/settings" icon="⚙" label={t("nav.settings")} />
    </nav>
  );
}
