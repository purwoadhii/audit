import logoOti from '../assets/logo-oti.webp';

// Logo OTI: logo aplikasi di halaman login dan bilah atas.
export function Logo({ size = 24 }) {
  return <img src={logoOti} width={size} height={size} alt="" aria-hidden="true" style={{ display: 'block' }} />;
}

// Ikon garis sederhana untuk menu. Semua memakai kotak 24x24 dan warna teks di sekitarnya.
const PATHS = {
  home: <><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V21h14V9.5" /><path d="M10 21v-6h4v6" /></>,
  audit: <><rect x="5" y="4" width="14" height="17" rx="2" /><path d="M9 2.5h6v3H9z" /><path d="M8.5 13l2.5 2.5 4.5-5" /></>,
  finding: <><path d="M12 3 2.5 20h19z" /><path d="M12 10v4.5" /><path d="M12 17.5h.01" /></>,
  board: <><rect x="3" y="4" width="5" height="16" rx="1.5" /><rect x="9.5" y="4" width="5" height="11" rx="1.5" /><rect x="16" y="4" width="5" height="7" rx="1.5" /></>,
  ai: <><path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8z" /><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z" /></>,
  ocr: <><path d="M4 8V5a1 1 0 0 1 1-1h3" /><path d="M16 4h3a1 1 0 0 1 1 1v3" /><path d="M20 16v3a1 1 0 0 1-1 1h-3" /><path d="M8 20H5a1 1 0 0 1-1-1v-3" /><path d="M8 9h8M8 12h8M8 15h5" /></>,
  activity: <><path d="M3 12h4l3-8 4 16 3-8h4" /></>,
  users: <><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6" /><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8" /><path d="M18 14.3c2.1.7 3.5 2.6 3.5 5.7" /></>,
  template: <><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M8 8h8M8 12h8M8 16h5" /></>,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  chart: <><path d="M3 3v18h18" /><path d="M7 15l4-4 3 3 5-6" /></>,
  key: <><circle cx="8" cy="15" r="4" /><path d="M11 12l9-9" /><path d="M16 7l3 3" /></>,
  plan: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18" /><path d="M8 3v4M16 3v4" /><path d="M7.5 14h3v3h-3z" /></>,
  report: <><path d="M4 20V10" /><path d="M10 20V4" /><path d="M16 20v-7" /><path d="M22 20H2" /></>,
  backup: <><ellipse cx="12" cy="5.5" rx="7.5" ry="2.5" /><path d="M4.5 5.5v6c0 1.4 3.4 2.5 7.5 2.5s7.5-1.1 7.5-2.5v-6" /><path d="M4.5 11.5v6c0 1.4 3.4 2.5 7.5 2.5s7.5-1.1 7.5-2.5v-6" /></>,
  edit: <><path d="M4 20h4L19 9l-4-4L4 16z" /><path d="M13.5 6.5l4 4" /></>,
  trash: <><path d="M4 7h16" /><path d="M9 7V4h6v3" /><path d="M6 7l1 13h10l1-13" /><path d="M10 11v6M14 11v6" /></>,
  sample: <><path d="M9 3h6M10 3v6l-5.5 9.5A1.7 1.7 0 0 0 6 21h12a1.7 1.7 0 0 0 1.5-2.5L14 9V3" /><path d="M7.5 15h9" /></>,
  storage: <><ellipse cx="12" cy="5.5" rx="8" ry="2.5" /><path d="M4 5.5v13c0 1.4 3.6 2.5 8 2.5s8-1.1 8-2.5v-13" /><path d="M4 12c0 1.4 3.6 2.5 8 2.5s8-1.1 8-2.5" /></>,
  login: <><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" /><path d="M10 17l5-5-5-5" /><path d="M15 12H3" /></>,
  devices: <><rect x="2" y="4" width="14" height="10" rx="1.5" /><path d="M6 18h6" /><rect x="17" y="8" width="5" height="12" rx="1.2" /></>,
  license: <><circle cx="8" cy="15" r="4" /><path d="M10.8 12.2 20 3" /><path d="M17 6l3 3" /><path d="M14.5 8.5l2 2" /></>,
  building: <><rect x="4" y="3" width="11" height="18" rx="1" /><path d="M15 9h4a1 1 0 0 1 1 1v11H15" /><path d="M8 7h3M8 11h3M8 15h3" /></>,
  offline: <><path d="M2 8.5a15 15 0 0 1 4.2-2.7M9.8 4.9A15 15 0 0 1 22 8.5" /><path d="M5 12a10 10 0 0 1 4-2.3M14.5 9.9A10 10 0 0 1 19 12" /><path d="M8.5 15.5a5 5 0 0 1 7 0" /><path d="M12 19h.01" /><path d="M3 3l18 18" /></>,
  shield: <><path d="M12 3 4 6v6c0 4.6 3.4 8 8 9 4.6-1 8-4.4 8-9V6z" /><path d="M9 12l2 2 4-4" /></>,
  server: <><rect x="3" y="4" width="18" height="7" rx="1.5" /><rect x="3" y="13" width="18" height="7" rx="1.5" /><path d="M7 7.5h.01M7 16.5h.01" /></>,
  version: <><path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8z" /><path d="M7.5 7.5h.01" /></>,
  user: <><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7" /></>,
  logout: <><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="M16 17l5-5-5-5" /><path d="M21 12H9" /></>,
  menu: <><path d="M4 6h16M4 12h16M4 18h16" /></>,
};

export function Icon({ name, size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="ico">
      {PATHS[name]}
    </svg>
  );
}
