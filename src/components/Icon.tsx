import type { CSSProperties, ReactNode } from 'react';

const ICONS: Record<string, ReactNode> = {
  play:    <polygon points="7 4 20 12 7 20 7 4" fill="currentColor" stroke="none"/>,
  pause:   <><rect x="6" y="4" width="4" height="16" fill="currentColor" stroke="none"/><rect x="14" y="4" width="4" height="16" fill="currentColor" stroke="none"/></>,
  stop:    <rect x="6" y="6" width="12" height="12" fill="currentColor" stroke="none"/>,
  rec:     <circle cx="12" cy="12" r="7" fill="currentColor" stroke="none"/>,
  rewind:  <><polygon points="11 5 3 12 11 19 11 5" fill="currentColor" stroke="none"/><polygon points="21 5 13 12 21 19 21 5" fill="currentColor" stroke="none"/></>,
  forward: <><polygon points="13 5 21 12 13 19 13 5" fill="currentColor" stroke="none"/><polygon points="3 5 11 12 3 19 3 5" fill="currentColor" stroke="none"/></>,
  back:    <path d="M15 18l-6-6 6-6"/>,
  next:    <path d="M9 18l6-6-6-6"/>,
  plus:    <><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></>,
  mic:     <><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M19 10a7 7 0 0 1-14 0"/><line x1="12" y1="17" x2="12" y2="21"/><line x1="8" y1="21" x2="16" y2="21"/></>,
  upload:  <><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/><path d="M3 15v4a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-4"/></>,
  check:   <polyline points="20 6 9 17 4 12"/>,
  list:    <><line x1="4" y1="6" x2="20" y2="6"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="18" x2="20" y2="18"/></>,
  trash:   <><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></>,
  share:   <><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/><path d="M4 12v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7"/></>,
  more:    <><circle cx="5" cy="12" r="1.5" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="1.5" fill="currentColor" stroke="none"/></>,
  menu:    <><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></>,
  close:   <><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></>,
  search:  <><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.5" y2="16.5"/></>,
  cassette:<><rect x="3" y="6" width="18" height="12" rx="1"/><circle cx="9" cy="12" r="2"/><circle cx="15" cy="12" r="2"/><rect x="7" y="16" width="10" height="1.5"/></>,
  star:    <polygon points="12 2 15 9 22 10 17 15 18 22 12 18 6 22 7 15 2 10 9 9 12 2"/>,
  loop:    <><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></>,
  grip:    <><line x1="8" y1="6" x2="16" y2="6"/><line x1="8" y1="10" x2="16" y2="10"/><line x1="8" y1="14" x2="16" y2="14"/></>,
  rename:  <><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></>,
  copy:    <><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></>,
  refresh:  <><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></>,
};

export type IconName = keyof typeof ICONS | string;

interface IconProps {
  name: IconName;
  size?: number;
  color?: string;
  stroke?: number;
}

export const Icon = ({ name, size = 20, color = 'currentColor', stroke = 1.75 }: IconProps) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth={stroke}
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    {ICONS[name]}
  </svg>
);

interface IconBtnProps {
  name: IconName;
  onClick?: (e: React.MouseEvent) => void;
  size?: number;
  title?: string;
  style?: CSSProperties;
}

export const IconBtn = ({ name, onClick, size = 18, title, style }: IconBtnProps) => (
  <button className="icon-btn" onClick={onClick} title={title} aria-label={title || name} style={style}>
    <Icon name={name} size={size} color="var(--ink-0)" />
  </button>
);

export const Grain = () => <div className="grain" aria-hidden="true" />;
