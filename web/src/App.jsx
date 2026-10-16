import { useEffect, useState } from 'react';
import { NavLink, Navigate, Route, Routes, Link, useLocation } from 'react-router-dom';
import { useAuth } from './auth.jsx';
import { useSettings } from './settings.jsx';
import { ROLES } from './util.js';
import { N_, t } from './i18n.jsx';
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
import Settings, { SampleData } from './pages/Settings.jsx';
import Logins from './pages/Logins.jsx';
import Sessions from './pages/Sessions.jsx';
import System from './pages/System.jsx';
import License, { LICENSE_STATE } from './pages/License.jsx';
import Version from './pages/Version.jsx';
import { StorageSettings, StorageStatus } from './pages/Storage.jsx';
import { AiSettings, AiStatus, AiChat, AiUnavailable } from './pages/Ai.jsx';
import Ocr from './pages/Ocr.jsx';
import Recap from './pages/Recap.jsx';
import Backup from './pages/Backup.jsx';
import LangMenu from './components/LangMenu.jsx';
import { api } from './api.js';
import { Loading } from './components/ui.jsx';

// Tiga pintu masuk dengan tampilan masing-masing:
//   /            pengguna (super user, auditor, auditee, manajemen): menu atas untuk pekerjaan audit
//   /sysAdmin    System Admin: menu samping untuk pengguna dan pengaturan aplikasi
//   /infraAdmin  Infra Admin: menu samping untuk lisensi, akun admin, keamanan, dan server
export default function App() {
  const { user } = useAuth();
  if (user === undefined) return <div className="empty"><b>{t('Memuat…')}</b></div>;
  if (!user) return <Login />;
  return PORTAL === 'user' ? <UserApp /> : <AdminApp />;
}

function AppFooter({ license }) {
  const { settings } = useSettings();
  return (
    <footer className="app-foot">
      <span>{t(settings.app_name)}{settings.version && ` v${settings.version}`}</span>
      {license?.customer && <span>{t('Berlisensi untuk {customer}', { customer: license.customer })}</span>}
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
  // OCR dan Asisten AI hanya untuk lisensi Pro.
  const has = (f) => (user.features || []).includes(f);
  const seesActivity = ['superadmin', 'auditor', 'manajemen'].includes(user.role);
  const appBg = settings.app_background_url;
  const tabs = [
    { to: '/', label: t('Ringkasan'), icon: 'home', end: true },
    { to: '/audit', label: t('Audit'), icon: 'audit' },
    { to: '/temuan', label: t('Temuan'), icon: 'finding' },
    { to: '/tindak-lanjut', label: t('Tindak Lanjut'), icon: 'board' },
    user.role !== 'auditee' && { to: '/rekap', label: t('Rekap'), icon: 'report' },
    has('ai') && { to: '/asisten', label: t('Asisten AI'), icon: 'ai' },
    has('ocr') && { to: '/ocr', label: t('OCR'), icon: 'ocr' },
    seesActivity && { to: '/aktivitas', label: t('Aktivitas'), icon: 'activity' },
  ].filter(Boolean);
  return (
    <div className="user-shell">
      {appBg && <div className="app-bg" style={{ backgroundImage: `url("${appBg}")` }} aria-hidden="true" />}
      <div className="appbar">
        {settings.maintenance && <div className="maint">{t('Mode perbaikan aktif. Hanya Infra Admin yang bisa masuk.')}</div>}
        <div className="appbar-in">
          <header className="top">
            <Link to="/" className="brand">
              <div className="brand-mark"><Logo size={40} /></div>
              <div><h1>{t(settings.app_name)}</h1>{settings.app_tagline && <small>{t(settings.app_tagline)}</small>}</div>
            </Link>
            <div className="usermenu">
              <LangMenu />
              <Link to="/akun" className="who-chip" title={t('Akun saya')}>
                <span className="avatar" aria-hidden="true">{initials(user.name)}</span>
                <span className="who">{user.name}{user.unit && <span>{user.unit}</span>}</span>
              </Link>
              <button className="btn" onClick={logout}><Icon name="logout" size={16} />{t('Keluar')}</button>
            </div>
          </header>
          <nav className="tabs">
            {tabs.map((tab) => <NavLink key={tab.to} to={tab.to} end={tab.end}><Icon name={tab.icon} size={17} />{tab.label}</NavLink>)}
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
          {user.role !== 'auditee' && <Route path="/rekap" element={<Recap />} />}
          {has('ai') && <Route path="/asisten" element={!ai ? <Loading /> : ai.available ? <AiChat /> : <AiUnavailable reason={ai.reason} />} />}
          {has('ocr') && <Route path="/ocr" element={<Ocr />} />}
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
    { title: N_('Pengguna'), items: [
      { path: 'pengguna', label: N_('Pengguna'), icon: 'users', el: <Users /> },
      { path: 'template', label: N_('Template audit'), icon: 'template', el: <Templates /> },
    ] },
    { title: N_('Pengaturan'), items: [
      { path: 'pengaturan', label: N_('Pengaturan'), icon: 'settings', el: <Settings /> },
      { path: 'penyimpanan', label: N_('Penyimpanan file'), icon: 'storage', el: <StorageSettings /> },
      { path: 'ai', label: N_('Asisten AI'), icon: 'ai', el: <AiSettings /> },
      { path: 'data-awal', label: N_('Data awal'), icon: 'sample', el: <SampleData /> },
    ] },
    { title: N_('Pengawasan'), items: [
      { path: 'aktivitas', label: N_('Log aktivitas'), icon: 'activity', el: <Activity /> },
      { path: 'riwayat-login', label: N_('Riwayat login'), icon: 'login', el: <Logins /> },
      { path: 'sesi', label: N_('Sesi aktif'), icon: 'devices', el: <Sessions /> },
    ] },
    { title: N_('Aplikasi'), items: [
      { path: 'lisensi', label: N_('Lisensi'), icon: 'license', el: <License /> },
    ] },
  ],
  infra: [
    { title: N_('Lisensi dan akun'), items: [
      { path: 'lisensi', label: N_('Lisensi'), icon: 'license', el: <License /> },
      { path: 'admin', label: N_('Akun admin'), icon: 'users', el: <Users /> },
    ] },
    { title: N_('Keamanan'), items: [
      { path: 'keamanan', label: N_('Keamanan dan perbaikan'), icon: 'shield', el: <Settings infra /> },
      { path: 'aktivitas', label: N_('Aktivitas admin'), icon: 'activity', el: <Activity /> },
      { path: 'riwayat-login', label: N_('Riwayat login admin'), icon: 'login', el: <Logins /> },
      { path: 'sesi', label: N_('Sesi admin'), icon: 'devices', el: <Sessions /> },
    ] },
    { title: N_('Sistem'), items: [
      { path: 'sistem', label: N_('Server dan database'), icon: 'server', el: <System /> },
      { path: 'backup', label: N_('Backup database'), icon: 'backup', el: <Backup /> },
      { path: 'penyimpanan', label: N_('Penyimpanan file'), icon: 'storage', el: <StorageStatus /> },
      { path: 'ai', label: N_('Asisten AI'), icon: 'ai', el: <AiStatus /> },
      { path: 'versi', label: N_('Versi aplikasi'), icon: 'version', el: <Version /> },
    ] },
  ],
};

// Peringatan lisensi untuk admin: masa uji coba, akan habis dalam 30 hari, atau sudah habis.
function LicenseBanner({ license }) {
  if (!license) return null;
  const { state, days_left: left } = license;
  let text = '';
  if (state === 'trial') text = t('Aplikasi dalam masa uji coba, sisa {n} hari. Pasang lisensi sebelum masa uji coba habis.', { n: left });
  else if (state === 'active' && left !== null && left <= 30) text = t('Lisensi berakhir dalam {n} hari. Perbarui lisensi supaya pengguna tetap bisa masuk.', { n: left });
  else if (state !== 'active') text = t('{state}: pengguna dan System Admin tidak bisa masuk sampai lisensi dipasang.', { state: t(LICENSE_STATE[state]?.label) || t('Lisensi bermasalah') });
  if (!text) return null;
  return (
    <div className={`license-banner${state === 'active' || state === 'trial' ? '' : ' bad'}`} role="status">
      <Icon name="license" size={18} />
      <span>{text}</span>
      <Link to={`${portalInfo.base}/lisensi`}>{PORTAL === 'infra' ? t('Atur lisensi') : t('Lihat lisensi')}</Link>
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
    || (loc.pathname.toLowerCase().startsWith(`${base}/akun`.toLowerCase()) ? { label: N_('Akun saya') } : null);
  const licensePath = `${base}/lisensi`;
  // Muat ulang status lisensi setiap kali halaman lisensi dibuka atau ditinggalkan, dan setelah lisensi diganti.
  const onLicensePage = loc.pathname === licensePath;
  useEffect(() => {
    const load = () => api.get('/admin/license').then(setLicense).catch(() => {});
    load();
    window.addEventListener('license-changed', load);
    return () => window.removeEventListener('license-changed', load);
  }, [onLicensePage]);
  useEffect(() => { setOpen(false); }, [loc.pathname]);

  return (
    <div className={`admin-shell portal-${PORTAL}`}>
      <aside className={`side${open ? ' open' : ''}`}>
        <div className="side-top">
          <Link to={base} className="side-brand">
            <Logo size={36} />
            <span><b>{t(settings.app_name)}</b><span className={`portal-badge ${PORTAL}`}>{t(portalInfo.label)}</span></span>
          </Link>
          <button type="button" className="side-toggle" onClick={() => setOpen(!open)} aria-expanded={open} aria-label={t('Menu')}><Icon name="menu" size={22} /></button>
        </div>
        <nav className="side-nav" aria-label={t(portalInfo.label)}>
          {groups.map((g) => (
            <div key={g.title} className="side-group">
              <div className="side-title">{t(g.title)}</div>
              {g.items.map((i) => <NavLink key={i.path} to={`${base}/${i.path}`}><Icon name={i.icon} />{t(i.label)}</NavLink>)}
            </div>
          ))}
        </nav>
        <div className="side-user">
          <NavLink to={`${base}/akun`} className="who-chip">
            <span className="avatar" aria-hidden="true">{initials(user.name)}</span>
            <span className="who">{user.name}<span>{ROLES[user.role]}</span></span>
          </NavLink>
          <button className="btn" onClick={logout} title={t('Keluar')}><Icon name="logout" size={16} />{t('Keluar')}</button>
        </div>
      </aside>
      <div className="admin-main">
        {settings.maintenance && <div className="maint">{PORTAL === 'infra' ? t('Mode perbaikan aktif. Pengguna dan System Admin tidak bisa masuk.') : t('Mode perbaikan aktif. Hanya Infra Admin yang bisa masuk.')}</div>}
        <LicenseBanner license={license} />
        <div className="admin-head">
          <div>
            <div className="crumb">{t(portalInfo.label)}</div>
            <h1>{t(current?.label) || t(portalInfo.label)}</h1>
          </div>
          <LangMenu />
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
