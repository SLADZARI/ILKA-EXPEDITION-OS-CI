import type { ReactNode } from 'react';

const PATHS: Record<string, ReactNode> = {
  cards: <><rect x="4" y="3" width="13" height="17" rx="2"/><path d="M8 7h5M8 11h5M8 15h3"/></>,
  compass: <><circle cx="12" cy="12" r="9"/><path d="m15.5 8.5-2.1 4.9-4.9 2.1 2.1-4.9z"/></>,
  anchor: <><circle cx="12" cy="5" r="2"/><path d="M12 7v13M5 12H2c0 5.5 4.5 9 10 9s10-3.5 10-9h-3M8 12h8"/></>,
  check: <path d="m5 12 4 4L19 6"/>,
  arrow: <><path d="M5 12h14"/><path d="m13 6 6 6-6 6"/></>,
  alert: <><path d="M12 3 2.5 20h19z"/><path d="M12 9v4M12 17h.01"/></>,
  wifiOff: <><path d="M2 8.82a15 15 0 0 1 4.17-2.65M10.66 5.13A15 15 0 0 1 22 8.82M5 12.55a10 10 0 0 1 4.07-2.38M13.42 10.18A10 10 0 0 1 19 12.55M8.53 16.11a5 5 0 0 1 6.95 0M12 20h.01M3 3l18 18"/></>,
  book: <><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V4H6.5A2.5 2.5 0 0 0 4 6.5z"/><path d="M4 6.5v13"/></>,
  clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
  x: <><path d="M18 6 6 18"/><path d="m6 6 12 12"/></>,
  info: <><circle cx="12" cy="12" r="9"/><path d="M12 8h.01M12 12v4"/></>,
  star: <path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2-4.5-4.4 6.2-.9z"/>,
  route: <><circle cx="6" cy="18" r="2"/><circle cx="18" cy="6" r="2"/><path d="M8 18h3a3 3 0 0 0 3-3V9a3 3 0 0 1 3-3"/></>,
  calendar: <><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/></>,
};

export function Icon({ name, size = 20 }: { name: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true">
      {PATHS[name] ?? PATHS.cards}
    </svg>
  );
}
