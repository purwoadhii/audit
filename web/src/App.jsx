import { NavLink, Navigate, Route, Routes, Link } from 'react-router-dom';
import { useAuth } from './auth.jsx';
import { useSettings } from './settings.jsx';
import { ROLES, isAdmin as checkAdmin } from './util.js';
import { LogoIcon } from './components/Icons.jsx';
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

// Menu Aktivitas: log aktivitas untuk admin, auditor, dan manajemen; riwayat login hanya untuk admin
// karena memuat alamat IP dan perangkat setiap pengguna.
function ActivityArea({ admin }) {
  return (
    <>
      {admin && (
        <nav className="subtabs" aria-label="Aktivitas">
          <NavLink to="/aktivitas" end>Log aktivitas</NavLink>
          <NavLink to="/aktivitas/riwayat-login">Riwayat login</NavLink>
        </nav>
      )}
      <Routes>
        <Route index element={<Activity />} />
        {admin && <Route path="riwayat-login" element={<Logins />} />}
        <Route path="*" element={<Navigate to="/aktivitas" replace />} />
      </Routes>
    </>
  );
}

// Menu Administrasi: System Admin melihat semua kecuali Sistem, Infra Admin melihat semuanya.
function AdminArea({ infra }) {
  return (
    <>
      <nav className="subtabs" aria-label="Administrasi">
        <NavLink to="/admin/pengguna">Pengguna</NavLink>
        <NavLink to="/admin/template">Template</NavLink>
        <NavLink to="/admin/pengaturan">Pengaturan</NavLink>
        <NavLink to="/admin/sesi">Sesi aktif</NavLink>
        {infra && <NavLink to="/admin/sistem">Sistem</NavLink>}
      </nav>
      <Routes>
        <Route path="pengguna" element={<Users />} />
        <Route path="template" element={<Templates />} />
        <Route path="pengaturan" element={<Settings />} />
        <Route path="riwayat-login" element={<Navigate to="/aktivitas/riwayat-login" replace />} />
        <Route path="sesi" element={<Sessions />} />
        {infra && <Route path="sistem" element={<System />} />}
        <Route path="*" element={<Navigate to="/admin/pengguna" replace />} />
      </Routes>
    </>
  );
}

export default function App() {
  const { user, logout } = useAuth();
  const { settings } = useSettings();
  if (user === undefined) return <div className="empty"><b>Memuat…</b></div>;
  if (!user) return <Login />;
  const isAdmin = checkAdmin(user);
  const seesActivity = isAdmin || ['auditor', 'manajemen'].includes(user.role);
  return (
    <>
      <div className="appbar">
        {settings.maintenance && <div className="maint">Mode perbaikan aktif. Hanya Infra Admin yang bisa masuk.</div>}
        <div className="appbar-in">
          <header className="top">
            <Link to="/" className="brand">
              <div className="brand-mark"><LogoIcon size={20} /></div>
              <div><h1>{settings.app_name}</h1>{settings.app_tagline && <small>{settings.app_tagline}</small>}</div>
            </Link>
            <div className="usermenu">
              <div className="who">{user.name}<span>{ROLES[user.role]}{user.unit ? ` · ${user.unit}` : ''}</span></div>
              <Link className="btn ghost" to="/akun">Akun</Link>
              <button className="btn" onClick={logout}>Keluar</button>
            </div>
          </header>
          <nav className="tabs">
            <NavLink to="/" end>Ringkasan</NavLink>
            <NavLink to="/audit">Audit</NavLink>
            <NavLink to="/temuan">Temuan</NavLink>
            <NavLink to="/tindak-lanjut">Tindak Lanjut</NavLink>
            {seesActivity && <NavLink to="/aktivitas">Aktivitas</NavLink>}
            {isAdmin && <NavLink to="/admin">Administrasi</NavLink>}
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
          <Route path="/akun" element={<Account />} />
          {seesActivity && <Route path="/aktivitas/*" element={<ActivityArea admin={isAdmin} />} />}
          {isAdmin && <Route path="/admin/*" element={<AdminArea infra={user.role === 'infraadmin'} />} />}
          <Route path="/pengguna" element={<Navigate to="/admin/pengguna" replace />} />
          <Route path="/template" element={<Navigate to="/admin/template" replace />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </>
  );
}
