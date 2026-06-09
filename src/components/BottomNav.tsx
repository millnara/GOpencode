import { t } from "../lib/i18n";
import Icon from "./Icon";

export default function BottomNav({ active }: { active: string }) {
  const Tab = ({ id, hash, icon, label }: { id: string; hash: string; icon: "folder" | "settings"; label: string }) => (
    <a className={"navtab" + (active === id ? " active" : "")} href={hash}>
      <span className="navicon"><Icon name={icon} size={22} strokeWidth={1.7} /></span>
      <span>{label}</span>
    </a>
  );
  return (
    <nav className="bottomnav">
      <Tab id="projects" hash="#/" icon="folder" label={t("nav.projects")} />
      <Tab id="settings" hash="#/settings" icon="settings" label={t("nav.settings")} />
    </nav>
  );
}
