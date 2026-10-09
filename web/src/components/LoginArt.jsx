// Ilustrasi panel kiri halaman login: clipboard audit, grafik temuan, kaca pembesar, perisai.
export default function LoginArt() {
  return (
    <svg aria-hidden="true" focusable="false" viewBox="0 0 560 420" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="lp-paper" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff"/><stop offset="1" stopColor="#e6eef2"/>
        </linearGradient>
        <linearGradient id="lp-tealg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#3fd0b4"/><stop offset="1" stopColor="#1e8f7a"/>
        </linearGradient>
        <linearGradient id="lp-lens" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#bff3e8" stopOpacity=".55"/><stop offset="1" stopColor="#2bb39a" stopOpacity=".15"/>
        </linearGradient>
        <filter id="lp-sh" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="14" stdDeviation="16" floodColor="#000" floodOpacity=".35"/>
        </filter>
      </defs>

      {/* Kartu grafik di belakang (kiri) */}
      <g className="float-slow" filter="url(#lp-sh)">
        <rect x="20" y="70" width="170" height="130" rx="16" fill="#173d55" stroke="rgba(255,255,255,.12)"/>
        <text x="38" y="100" fill="#a9bfc9" fontSize="12" fontFamily="Segoe UI, sans-serif">Temuan per Bulan</text>
        <rect x="40"  y="150" width="18" height="34" rx="4" fill="#2bb39a" opacity=".55"/>
        <rect x="68"  y="132" width="18" height="52" rx="4" fill="#2bb39a" opacity=".7"/>
        <rect x="96"  y="142" width="18" height="42" rx="4" fill="#2bb39a" opacity=".6"/>
        <rect x="124" y="118" width="18" height="66" rx="4" fill="#3fd0b4"/>
        <rect x="152" y="128" width="18" height="56" rx="4" fill="#2bb39a" opacity=".8"/>
      </g>

      {/* Kartu status di belakang (kanan) */}
      <g className="float-slow" filter="url(#lp-sh)">
        <rect x="390" y="250" width="160" height="118" rx="16" fill="#173d55" stroke="rgba(255,255,255,.12)"/>
        <text x="408" y="278" fill="#a9bfc9" fontSize="12" fontFamily="Segoe UI, sans-serif">Tindak Lanjut</text>
        <circle cx="440" cy="322" r="26" fill="none" stroke="rgba(255,255,255,.12)" strokeWidth="9"/>
        <circle cx="440" cy="322" r="26" fill="none" stroke="#3fd0b4" strokeWidth="9"
                strokeDasharray="122 164" strokeLinecap="round" transform="rotate(-90 440 322)"/>
        <text x="440" y="327" fill="#fff" fontSize="13" fontWeight="700" textAnchor="middle" fontFamily="Segoe UI, sans-serif">75%</text>
        <rect x="480" y="306" width="54" height="7" rx="3.5" fill="rgba(255,255,255,.18)"/>
        <rect x="480" y="320" width="40" height="7" rx="3.5" fill="rgba(255,255,255,.12)"/>
        <rect x="480" y="334" width="48" height="7" rx="3.5" fill="rgba(255,255,255,.12)"/>
      </g>

      {/* Dokumen utama / clipboard */}
      <g className="float" filter="url(#lp-sh)">
        <rect x="170" y="40" width="220" height="300" rx="18" fill="url(#lp-paper)"/>
        <rect x="235" y="26" width="90" height="30" rx="10" fill="#0f2738"/>
        <circle cx="280" cy="41" r="6" fill="#2bb39a"/>
        <rect x="196" y="78" width="120" height="12" rx="6" fill="#13232e"/>
        <rect x="196" y="98" width="80" height="8" rx="4" fill="#9fb1ba"/>

        {/* daftar periksa */}
        <g fontFamily="Segoe UI, sans-serif">
          <rect x="196" y="130" width="22" height="22" rx="6" fill="url(#lp-tealg)"/>
          <path d="M201 141 l4.5 4.5 l8 -9" stroke="#fff" strokeWidth="2.6" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
          <rect x="230" y="134" width="130" height="8" rx="4" fill="#c4d1d8"/>
          <rect x="230" y="146" width="90" height="6" rx="3" fill="#dde6eb"/>

          <rect x="196" y="172" width="22" height="22" rx="6" fill="url(#lp-tealg)"/>
          <path d="M201 183 l4.5 4.5 l8 -9" stroke="#fff" strokeWidth="2.6" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
          <rect x="230" y="176" width="120" height="8" rx="4" fill="#c4d1d8"/>
          <rect x="230" y="188" width="70" height="6" rx="3" fill="#dde6eb"/>

          <rect x="196" y="214" width="22" height="22" rx="6" fill="#f4b740"/>
          <rect x="205.5" y="219" width="3" height="8" rx="1.5" fill="#fff"/>
          <circle cx="207" cy="231" r="1.8" fill="#fff"/>
          <rect x="230" y="218" width="134" height="8" rx="4" fill="#c4d1d8"/>
          <rect x="230" y="230" width="96" height="6" rx="3" fill="#dde6eb"/>

          <rect x="196" y="256" width="22" height="22" rx="6" fill="none" stroke="#b8c7cf" strokeWidth="2"/>
          <rect x="230" y="260" width="110" height="8" rx="4" fill="#c4d1d8"/>
          <rect x="230" y="272" width="60" height="6" rx="3" fill="#dde6eb"/>
        </g>

        {/* tanda tangan */}
        <path d="M200 312 c10 -14 18 -14 22 0 s14 -18 22 -4 s12 -8 20 -2" stroke="#16384f" strokeWidth="2" fill="none" strokeLinecap="round"/>
        <rect x="300" y="306" width="66" height="20" rx="10" fill="#e3f6f1"/>
        <text x="333" y="320" fill="#1e8f7a" fontSize="10.5" fontWeight="700" textAnchor="middle" fontFamily="Segoe UI, sans-serif">VERIFIED</text>
      </g>

      {/* Kaca pembesar */}
      <g className="float">
        <line x1="415" y1="205" x2="462" y2="252" stroke="#0f2738" strokeWidth="18" strokeLinecap="round"/>
        <line x1="415" y1="205" x2="462" y2="252" stroke="#2bb39a" strokeWidth="10" strokeLinecap="round"/>
        <circle cx="375" cy="165" r="56" fill="url(#lp-lens)" stroke="#ffffff" strokeWidth="9"/>
        <circle cx="375" cy="165" r="56" fill="none" stroke="#2bb39a" strokeWidth="3" opacity=".6"/>
        <path d="M345 140 a38 38 0 0 1 26 -14" stroke="#fff" strokeWidth="5" fill="none" strokeLinecap="round" opacity=".8"/>
      </g>

      {/* Perisai */}
      <g className="float-slow" filter="url(#lp-sh)">
        <path d="M95 260 l42 -16 l42 16 v30 c0 30 -20 50 -42 60 c-22 -10 -42 -30 -42 -60 z" fill="url(#lp-tealg)"/>
        <path d="M120 296 l12 12 l24 -26" stroke="#fff" strokeWidth="5" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
      </g>

      {/* titik dekoratif */}
      <circle cx="500" cy="80" r="5" fill="#3fd0b4" opacity=".7"/>
      <circle cx="525" cy="120" r="3" fill="#fff" opacity=".4"/>
      <circle cx="40" cy="330" r="4" fill="#fff" opacity=".35"/>
      <circle cx="60" cy="380" r="6" fill="#3fd0b4" opacity=".45"/>
    </svg>
  );
}
