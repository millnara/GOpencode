import type { CSSProperties } from "react";

type IconName =
  | "folder" | "settings" | "camera" | "qr" | "scan" | "back" | "more"
  | "stop" | "send" | "check" | "close" | "search" | "chevron"
  | "browse" | "info" | "wifi" | "key" | "link" | "fork" | "compact"
  | "shell" | "delete" | "trash" | "undo" | "warning" | "ellipsis" | "home"
  | "bolt" | "add" | "play" | "image" | "lock" | "globe" | "user"
  | "bell" | "volume" | "shield" | "external" | "doc" | "folderOpen"
  | "sparkle" | "power" | "share" | "save" | "refresh" | "moon" | "sun"
  | "arrowUp" | "arrowDown" | "chevronDown" | "chevronRight" | "chevronUp"
  | "dot" | "terminal";

type Props = {
  name: IconName;
  size?: number;
  strokeWidth?: number;
  style?: CSSProperties;
  className?: string;
  fill?: string;
};

const paths: Record<IconName, string> = {
  folder: '<path d="M3 7.5A2.5 2.5 0 0 1 5.5 5h3.7a2 2 0 0 1 1.41.59L11.91 7H18.5A2.5 2.5 0 0 1 21 9.5v8A2.5 2.5 0 0 1 18.5 20h-13A2.5 2.5 0 0 1 3 17.5v-10Z"/>',
  browse: '<path d="M3 7.5A2.5 2.5 0 0 1 5.5 5h3.7a2 2 0 0 1 1.41.59L11.91 7H18.5A2.5 2.5 0 0 1 21 9.5v.5"/><path d="M3 11.5h18M7 15h4"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 0 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 0 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 0 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8v.1a1.7 1.7 0 0 0 1.5 1H21a2 2 0 0 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"/>',
  camera: '<path d="M3 8.5A2.5 2.5 0 0 1 5.5 6h2.7a1 1 0 0 0 .8-.4l1.2-1.6a1 1 0 0 1 .8-.4h2a1 1 0 0 1 .8.4l1.2 1.6a1 1 0 0 0 .8.4h2.7A2.5 2.5 0 0 1 21 8.5v8A2.5 2.5 0 0 1 18.5 19h-13A2.5 2.5 0 0 1 3 16.5v-8Z"/><circle cx="12" cy="12.5" r="3.5"/>',
  qr: '<rect x="3" y="3" width="8" height="8" rx="1.5"/><rect x="13" y="3" width="8" height="8" rx="1.5"/><rect x="3" y="13" width="8" height="8" rx="1.5"/><path d="M13 13h3v3h-3z M18 18v3 M13 18h2"/>',
  scan: '<path d="M3 7V5a2 2 0 0 1 2-2h2 M21 7V5a2 2 0 0 0-2-2h-2 M3 17v2a2 2 0 0 0 2 2h2 M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 12h10"/>',
  back: '<path d="M15 6l-6 6 6 6"/>',
  more: '<circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/>',
  stop: '<rect x="6" y="6" width="12" height="12" rx="2"/>',
  send: '<path d="M12 19V5 M5 12l7-7 7 7"/>',
  check: '<path d="M5 12l5 5L20 7"/>',
  close: '<path d="M6 6l12 12 M6 18L18 6"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>',
  chevron: '<path d="M9 6l6 6-6 6"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 8h.01 M11 12h1v5h1"/>',
  wifi: '<path d="M5 12.55a11 11 0 0 1 14 0 M2 8.82a15 15 0 0 1 20 0 M8.5 16.43a6 6 0 0 1 7 0"/><circle cx="12" cy="20" r="1"/>',
  key: '<circle cx="8" cy="15" r="4"/><path d="M11 12l9-9 M16 7l3 3"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1.5 1.5 M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1.5-1.5"/>',
  fork: '<circle cx="6" cy="5" r="2"/><circle cx="18" cy="5" r="2"/><circle cx="12" cy="19" r="2"/><path d="M6 7v3a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7 M12 12v5"/>',
  compact: '<rect x="3" y="3" width="18" height="6" rx="1.5"/><rect x="3" y="11" width="18" height="4" rx="1.5"/><rect x="3" y="17" width="18" height="4" rx="1.5"/>',
  shell: '<path d="M4 7l5 5-5 5V7z M14 4l6 8-6 8V4z"/>',
  delete: '<path d="M4 7h16 M9 7V4h6v3 M6 7l1 13a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-13"/>',
  trash: '<path d="M4 7h16 M9 7V4h6v3 M6 7l1 13a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-13"/>',
  undo: '<path d="M9 14L4 9l5-5 M4 9h11a5 5 0 0 1 0 10h-3"/>',
  warning: '<path d="M12 4l10 17H2L12 4z M12 10v5 M12 18h.01"/>',
  ellipsis: '<circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/>',
  home: '<path d="M3 11l9-8 9 8 M5 10v10h5v-6h4v6h5V10"/>',
  bolt: '<path d="M13 3L4 14h7l-1 7 9-11h-7l1-7z"/>',
  add: '<path d="M12 5v14 M5 12h14"/>',
  play: '<path d="M7 5l12 7-12 7V5z"/>',
  image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5-5-9 9"/>',
  lock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 1 1 8 0v4"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18 M12 3a14 14 0 0 1 0 18 M12 3a14 14 0 0 0 0 18"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  bell: '<path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4l2-2z M10 20a2 2 0 0 0 4 0"/>',
  volume: '<path d="M5 9v6h4l5 5V4L9 9H5z M17 8a5 5 0 0 1 0 8"/>',
  shield: '<path d="M12 3l8 3v6c0 5-4 8-8 9-4-1-8-4-8-9V6l8-3z"/>',
  external: '<path d="M14 4h6v6 M20 4l-9 9 M9 5H5a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-4"/>',
  doc: '<path d="M6 3h9l5 5v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z M15 3v5h5 M8 13h8 M8 17h6"/>',
  folderOpen: '<path d="M3 7.5A2.5 2.5 0 0 1 5.5 5h3.7a2 2 0 0 1 1.41.59L11.91 7H18.5A2.5 2.5 0 0 1 21 9.5v.6L18.4 19.5a1 1 0 0 1-1 .9H4.6a1 1 0 0 1-1-1L3 9.5V7.5Z"/>',
  sparkle: '<path d="M12 3l2 5 5 2-5 2-2 5-2-5-5-2 5-2 2-5z M19 14l1 2 2 1-2 1-1 2-1-2-2-1 2-1 1-2z"/>',
  power: '<path d="M12 3v9 M8 6a7 7 0 1 0 8 0"/>',
  share: '<path d="M9 12a3 3 0 1 0 6 0 3 3 0 1 0-6 0z M9 6a3 3 0 1 0 6 0 3 3 0 1 0-6 0z M9 18a3 3 0 1 0 6 0 3 3 0 1 0-6 0z M8.5 7.5l7 3 M8.5 16.5l7-3"/>',
  save: '<path d="M5 4h11l4 4v12a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z M7 4v6h9V4 M8 14h8v7H8z"/>',
  refresh: '<path d="M20 12a8 8 0 1 1-2.34-5.66 M20 4v5h-5"/>',
  moon: '<path d="M21 13.5A9 9 0 1 1 10.5 3a7 7 0 0 0 10.5 10.5z"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 3v2 M12 19v2 M3 12h2 M19 12h2 M5.6 5.6l1.4 1.4 M17 17l1.4 1.4 M5.6 18.4L7 17 M17 7l1.4-1.4"/>',
  arrowUp: '<path d="M12 19V5 M5 12l7-7 7 7"/>',
  arrowDown: '<path d="M12 5v14 M5 12l7 7 7-7"/>',
  chevronDown: '<path d="M6 9l6 6 6-6"/>',
  chevronRight: '<path d="M9 6l6 6-6 6"/>',
  chevronUp: '<path d="M6 15l6-6 6 6"/>',
  dot: '<circle cx="12" cy="12" r="3"/>',
  terminal: '<path d="M4 7l5 5-5 5V7z M14 17h6"/>',
};

export default function Icon({ name, size = 22, strokeWidth = 1.8, style, className, fill = "none" }: Props) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill={fill}
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={style}
      className={className}
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: paths[name] }}
    />
  );
}
