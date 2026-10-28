import React from 'react';

const PATHS = {
  dashboard: <><rect x="3" y="3" width="7" height="9" rx="1.5" /><rect x="14" y="3" width="7" height="5" rx="1.5" /><rect x="14" y="12" width="7" height="9" rx="1.5" /><rect x="3" y="16" width="7" height="5" rx="1.5" /></>,
  plus: <><path d="M12 5v14M5 12h14" /></>,
  file: <><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5" /><path d="M9 13h6M9 17h4" /></>,
  users: <><path d="M17 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9.5" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></>,
  bot: <><rect x="4" y="8" width="16" height="12" rx="3" /><path d="M12 4v4" /><circle cx="9" cy="14" r="1" /><circle cx="15" cy="14" r="1" /><path d="M9 18h6" /></>,
  search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></>,
  layers: <><path d="m12 3 9 5-9 5-9-5 9-5z" /><path d="m3 13 9 5 9-5" /><path d="m3 17 9 5 9-5" /></>,
  shield: <><path d="M12 3 5 6v6c0 4.5 3 7.5 7 9 4-1.5 7-4.5 7-9V6l-7-3z" /><path d="m9 12 2 2 4-4" /></>,
  activity: <><path d="M3 12h4l2.5-7 5 14L17 12h4" /></>,
  coins: <><circle cx="9" cy="9" r="5" /><path d="M14.5 5.3a5 5 0 0 1 0 11.4" /><path d="M7 14v3a3 3 0 0 0 6 0v-3" /></>,
  check: <><path d="m4 12 5 5L20 6" /></>,
  checkCircle: <><circle cx="12" cy="12" r="9" /><path d="m8.5 12 2.5 2.5 4.5-5" /></>,
  alert: <><path d="M12 4 2.8 20h18.4L12 4z" /><path d="M12 10v4M12 17.2v.1" /></>,
  xCircle: <><circle cx="12" cy="12" r="9" /><path d="m9 9 6 6M15 9l-6 6" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  arrowRight: <><path d="M5 12h14M13 6l6 6-6 6" /></>,
  arrowUpRight: <><path d="M7 17 17 7M9 7h8v8" /></>,
  download: <><path d="M12 3v12M7 11l5 5 5-5" /><path d="M4 21h16" /></>,
  chevronRight: <><path d="m9 5 7 7-7 7" /></>,
  refresh: <><path d="M20 12a8 8 0 1 1-2.3-5.6" /><path d="M20 4v5h-5" /></>,
  lock: <><rect x="4" y="10" width="16" height="11" rx="2.5" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></>,
  eye: <><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7z" /><circle cx="12" cy="12" r="3" /></>,
  play: <><path d="M8 5v14l11-7-11-7z" /></>,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></>,
  database: <><ellipse cx="12" cy="5" rx="8" ry="3" /><path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5" /><path d="M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3" /></>,
  book: <><path d="M4 5a2 2 0 0 1 2-2h13v18H6a2 2 0 0 0-2 2V5z" /><path d="M4 19a2 2 0 0 1 2-2h13" /></>,
  scale: <><path d="M12 3v18M5 7h14" /><path d="m5 7-3 7h6L5 7zM19 7l-3 7h6l-3-7z" /></>,
  sparkles: <><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3z" /><path d="M19 16l.9 2.1L22 19l-2.1.9L19 22l-.9-2.1L16 19l2.1-.9L19 16z" /></>,
  gitBranch: <><circle cx="6" cy="6" r="2.5" /><circle cx="6" cy="18" r="2.5" /><circle cx="18" cy="8" r="2.5" /><path d="M6 8.5v7M8.5 6H13a3 3 0 0 1 3 3v0" /></>,
  flag: <><path d="M5 21V4M5 5h11l-2 4 2 4H5" /></>,
  inbox: <><path d="M4 13h4l2 3h4l2-3h4" /><path d="M5 4h14l2 9v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-5l2-9z" /></>,
  external: <><path d="M14 4h6v6M20 4l-9 9" /><path d="M18 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h5" /></>,
  rotate: <><path d="M3 12a9 9 0 1 0 3-6.7" /><path d="M3 4v5h5" /></>,
  send: <><path d="m22 2-7 20-4-9-9-4 20-7z" /><path d="M22 2 11 13" /></>,
  zap: <><path d="M13 2 4 14h6l-1 8 9-12h-6l1-8z" /></>,
  filter: <><path d="M3 5h18l-7 8v6l-4 2v-8L3 5z" /></>,
  copy: <><rect x="9" y="9" width="12" height="12" rx="2" /><path d="M5 15V5a2 2 0 0 1 2-2h10" /></>,
  building: <><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M9 7h1M14 7h1M9 11h1M14 11h1M9 15h1M14 15h1" /></>,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8v.1" /></>,
  target: <><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="4" /><circle cx="12" cy="12" r="1" /></>,
  edit: <><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" /></>,
  x: <><path d="M6 6l12 12M18 6 6 18" /></>,
  minus: <><path d="M5 12h14" /></>,
  logOut: <><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></>,
  user: <><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></>,
  award: <><circle cx="12" cy="8" r="6" /><path d="M15.477 12.89 17 22l-5-3-5 3 1.523-9.11" /></>,
  briefcase: <><rect width="20" height="14" x="2" y="7" rx="2" /><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" /></>,
};

export function Icon({ name, size = 16, stroke = 1.8, className = '', style }) {
  const path = PATHS[name] || PATHS.info;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`ic ${className}`}
      style={style}
      aria-hidden="true"
    >
      {path}
    </svg>
  );
}
