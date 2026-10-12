import { useEffect, useState } from 'react';
import { NavLink, Navigate, Route, Routes, Link, useLocation } from 'react-router-dom';
import { useAuth } from './auth.jsx';
import { useSettings } from './settings.jsx';
import { ROLES } from './util.js';
import { PORTAL, portalInfo } from './portal.js';
import { Icon, Logo } from './components/Icons.jsx';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Audits from './pages/Audits.jsx';
import AuditDetail from './pages/AuditDetail.jsx';
import Report from './pages/Report.jsx';
import Findings from './pages/Findings.jsx';
import Board from './pages/Board.jsx';
import Users from './pages/Users.jsx';
import Templates from './pages/Templates.jsx';
import Activity from './pages/Activity.jsx';
import Account from './pages/Account.jsx';
import Settings from './pages/Settings.jsx';
import Logins from './pages/Logins.jsx';
import Sessions from './pages/Sessions.jsx';
import System from './pages/System.jsx';
import License, { LICENSE_STATE } from './pages/License.jsx';
import Version from './pages/Version.jsx';
import { StorageSettings, StorageStatus } from './pages/Storage.jsx';
import { AiSettings, AiStatus, AiChat, AiUnavailable } from './pages/Ai.jsx';
import Ocr from './pages/Ocr.jsx';
import { api } from './api.js';
import { Loading } from './components/ui.jsx';

// Tiga pintu masuk dengan tampilan masing-masing:
//   /            pengguna (auditor, auditee, manajemen): menu atas untuk pekerjaan audit
//   /sysAdmin    System Admin: menu samping untuk pengguna dan pengaturan aplikasi
//   /infraAdmin  Infra Admin: menu samping untuk lisensi, akun admin, keamanan, dan server
export default function App() {
  const { user } = useAuth();
  if (user === undefined) return <div className="empty"><b>Memuat…</b></div>;
  if (!user) return <Login />;
  return PORTAL === 'user' ? <UserApp /> : <AdminApp />;
}

function AppFooter({ license }) {
  const { settings } = useSettings();
  return (
    <footer className="app-foot">
      <span>{settings.app_name}{settings.version && ` v${settings.version}`}</span>
      {license?.customer && <span>Berlisensi untuk {license.customer}</span>}
    </footer>
  );
}

// ---------- Pengguna ----------

// Menu Asisten AI muncul bila admin sudah mengaktifkannya untuk peran pengguna ini.
function useAiAvailable(user) {
  const [st, setSt] = useState({ id: null, status: null });
  const id = user?.id;
  useEffect(() => {
    if (!id) return;
    api.get('/ai/status').then((r) => setSt({ id, status: r })).catch(() => setSt({ id, status: { available: false, reason: 'error' } }));
  }, [id]);
  return st.id === id ? st.status : null; // null = sedang diperiksa
}

function UserApp() {
  const { user, logout } = useAuth();
  const { settings } = useSettings();
  const ai = useAiAvailable(user);
  const seesActivity = ['auditor', 'manajemen'].includes(user.role);
  const appBg = settings.app_background_url;
  const tabs = [
    { to: '/', label: 'Ringkasan', icon: 'home', end: true },
    { to: '/audit', label: 'Audit', icon: 'audit' },
    { to: '/temuan', label: 'Temuan', icon: 'finding' },
    { to: '/tindak-lanjut', label: 'Tindak Lanjut', icon: 'board' },
    { to: '/asisten', label: 'Asisten AI', icon: 'ai' },
    { to: '/ocr', label: 'OCR', icon: 'ocr' },
    seesActivity && { to: '/aktivitas', label: 'Aktivitas', icon: 'activity' },
  ].filter(Boolean);
  return (
    <div className="user-shell">
      {appBg && <div className="app-bg" style={{ backgroundImage: `url("${appBg}")` }} aria-hidden="true" />}
      <div className="appbar">
        {settings.maintenance && <div className="maint">Mode perbaikan aktif. Hanya Infra Admin yang bisa masuk.</div>}
        <div className="appbar-in">
          <header className="top">
            <Link to="/" className="brand">
              <div className="brand-mark"><Logo size={40} /></div>
              <div><h1>{settings.app_name}</h1>{settings.app_tagline && <small>{settings.app_tagline}</small>}</div>
            </Link>
            <div className="usermenu">
              <Link to="/akun" className="who-chip" title="Akun saya">
                <span className="avatar" aria-hidden="true">{initials(user.name)}</span>
                <span className="who">{user.name}<span>{ROLES[user.role]}{user.unit ? ` · ${user.unit}` : ''}</span></span>
              </Link>
              <button className="btn" onClick={logout}><Icon name="logout" size={16} />Keluar</button>
            </div>
          </header>
          <nav className="tabs">
            {tabs.map((t) => <NavLink key={t.to} to={t.to} end={t.end}><Icon name={t.icon} size={17} />{t.label}</NavLink>)}
          </nav>
        </div>
      </div>
      <main className="wrap">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/audit" element={<Audits />} />
          <Route path="/audit/:id" element={<AuditDetail />} />
          <Route path="/audit/:id/laporan" element={<Report />} />
          <Route path="/temuan" element={<Findings />} />
          <Route path="/tindak-lanjut" element={<Board />} />
          <Route path="/asisten" element={!ai ? <Loading /> : ai.available ? <AiChat /> : <AiUnavailable reason={ai.reason} />} />
          <Route path="/ocr" element={<Ocr />} />
          <Route path="/akun" element={<Account />} />
          {seesActivity && <Route path="/aktivitas/*" element={<Activity />} />}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      <div className="wrap"><AppFooter /></div>
    </div>
  );
}

const initials = (name) => String(name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((x) => x[0].toUpperCase()).join('');

// ---------- System Admin dan Infra Admin ----------

const ADMIN_NAV = {
  sys: [
    { title: 'Pengguna', items: [
      { path: 'pengguna', label: 'Pengguna', icon: 'users', el: <Users /> },
      { path: 'template', label: 'Template audit', icon: 'template', el: <Templates /> },
    ] },
    { title: 'Pengaturan', items: [
      { path: 'pengaturan', label: 'Pengaturan', icon: 'settings', el: <Settings /> },
      { path: 'penyimpanan', label: 'Penyimpanan file', icon: 'storage', el: <StorageSettings /> },
      { path: 'ai', label: 'Asisten AI', icon: 'ai', el: <AiSettings /> },
    ] },
    { title: 'Pengawasan', items: [
      { path: 'aktivitas', label: 'Log aktivitas', icon: 'activity', el: <Activity /> },
      { path: 'riwayat-login', label: 'Riwayat login', icon: 'login', el: <Logins /> },
      { path: 'sesi', label: 'Sesi aktif', icon: 'devices', el: <Sessions /> },
    ] },
    { title: 'Aplikasi', items: [
      { path: 'lisensi', label: 'Lisensi', icon: 'license', el: <License /> },
    ] },
  ],
  infra: [
    { title: 'Lisensi dan akun', items: [
      { path: 'lisensi', label: 'Lisensi', icon: 'license', el: <License /> },
      { path: 'admin', label: 'Akun admin', icon: 'users', el: <Users /> },
    ] },
    { title: 'Keamanan', items: [
      { path: 'keamanan', label: 'Keamanan dan perbaikan', icon: 'shield', el: <Settings infra /> },
      { path: 'aktivitas', label: 'Aktivitas admin', icon: 'activity', el: <Activity /> },
      { path: 'riwayat-login', label: 'Riwayat login admin', icon: 'login', el: <Logins /> },
      { path: 'sesi', label: 'Sesi admin', icon: 'devices', el: <Sessions /> },
    ] },
    { title: 'Sistem', items: [
      { path: 'sistem', label: 'Server dan database', icon: 'server', el: <System /> },
      { path: 'penyimpanan', label: 'Penyimpanan file', icon: 'storage', el: <StorageStatus /> },
      { path: 'ai', label: 'Asisten AI', icon: 'ai', el: <AiStatus /> },
      { path: 'versi', label: 'Versi aplikasi', icon: 'version', el: <Version /> },
    ] },
  ],
};

// Peringatan lisensi untuk admin: masa uji coba, akan habis dalam 30 hari, atau sudah habis.
function LicenseBanner({ license }) {
  if (!license) return null;
  const { state, days_left: left } = license;
  let text = '';
  if (state === 'trial') text = `Aplikasi dalam masa uji coba, sisa ${left} hari. Pasang lisensi sebelum masa uji coba habis.`;
  else if (state === 'active' && left !== null && left <= 30) text = `Lisensi berakhir dalam ${left} hari. Perbarui lisensi supaya pengguna tetap bisa masuk.`;
  else if (state !== 'active') text = `${LICENSE_STATE[state]?.label || 'Lisensi bermasalah'}: pengguna dan System Admin tidak bisa masuk sampai lisensi dipasang.`;
  if (!text) return null;
  return (
    <div className={`license-banner${state === 'active' || state === 'trial' ? '' : ' bad'}`} role="status">
      <Icon name="license" size={18} />
      <span>{text}</span>
      <Link to={`${portalInfo.base}/lisensi`}>{PORTAL === 'infra' ? 'Atur lisensi' : 'Lihat lisensi'}</Link>
    </div>
  );
}

function AdminApp() {
  const { user, logout } = useAuth();
  const { settings } = useSettings();
  const loc = useLocation();
  const [open, setOpen] = useState(false);
  const [license, setLicense] = useState(null);
  const groups = ADMIN_NAV[PORTAL];
  const items = groups.flatMap((g) => g.items);
  const base = portalInfo.base;
  const current = items.find((i) => loc.pathname.toLowerCase().startsWith(`${base}/${i.path}`.toLowerCase()))
    || (loc.pathname.toLowerCase().startsWith(`${base}/akun`.toLowerCase()) ? { label: 'Akun saya' } : null);
  const licensePath = `${base}/lisensi`;
  // Muat ulang status lisensi setiap kali halaman lisensi dibuka atau ditinggalkan.
  const onLicensePage = loc.pathname === licensePath;
  useEffect(() => { api.get('/admin/license').then(setLicense).catch(() => {}); }, [onLicensePage]);
  useEffect(() => { setOpen(false); }, [loc.pathname]);

  return (
    <div className={`admin-shell portal-${PORTAL}`}>
      <aside className={`side${open ? ' open' : ''}`}>
        <div className="side-top">
          <Link to={base} className="side-brand">
            <Logo size={36} />
            <span><b>{settings.app_name}</b><span className={`portal-badge ${PORTAL}`}>{portalInfo.label}</span></span>
          </Link>
          <button type="button" className="side-toggle" onClick={() => setOpen(!open)} aria-expanded={open} aria-label="Menu"><Icon name="menu" size={22} /></button>
        </div>
        <nav className="side-nav" aria-label={portalInfo.label}>
          {groups.map((g) => (
            <div key={g.title} className="side-group">
              <div className="side-title">{g.title}</div>
              {g.items.map((i) => <NavLink key={i.path} to={`${base}/${i.path}`}><Icon name={i.icon} />{i.label}</NavLink>)}
            </div>
          ))}
        </nav>
        <div className="side-user">
          <NavLink to={`${base}/akun`} className="who-chip">
            <span className="avatar" aria-hidden="true">{initials(user.name)}</span>
            <span className="who">{user.name}<span>{ROLES[user.role]}</span></span>
          </NavLink>
          <button className="btn" onClick={logout} title="Keluar"><Icon name="logout" size={16} />Keluar</button>
        </div>
      </aside>
      <div className="admin-main">
        {settings.maintenance && <div className="maint">Mode perbaikan aktif. {PORTAL === 'infra' ? 'Pengguna dan System Admin tidak bisa masuk.' : 'Hanya Infra Admin yang bisa masuk.'}</div>}
        <LicenseBanner license={license} />
        <div className="admin-head">
          <div className="crumb">{portalInfo.label}</div>
          <h1>{current?.label || portalInfo.label}</h1>
        </div>
        <main className="admin-content">
          <Routes>
            {items.map((i) => <Route key={i.path} path={`${base}/${i.path}/*`} element={i.el} />)}
            <Route path={`${base}/akun`} element={<Account />} />
            <Route path="*" element={<Navigate to={`${base}/${items[0].path}`} replace />} />
          </Routes>
        </main>
        <AppFooter license={license} />
      </div>
    </div>
  );
}
