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
import { StorageSettings, StorageStatus } from './pages/Storage.jsx';

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

// System Admin (/sysAdmin): admin dari pihak klien mengatur pengguna, template, tampilan, data, dan penyimpanan.
function SysAdminArea() {
  return (
    <>
      <nav className="subtabs" aria-label="System Admin">
        <NavLink to="/sysAdmin/pengguna">Pengguna</NavLink>
        <NavLink to="/sysAdmin/template">Template</NavLink>
        <NavLink to="/sysAdmin/pengaturan">Pengaturan</NavLink>
        <NavLink to="/sysAdmin/penyimpanan">Penyimpanan file</NavLink>
        <NavLink to="/sysAdmin/sesi">Sesi aktif</NavLink>
      </nav>
      <Routes>
        <Route path="pengguna" element={<Users />} />
        <Route path="template" element={<Templates />} />
        <Route path="pengaturan" element={<Settings />} />
        <Route path="penyimpanan" element={<StorageSettings />} />
        <Route path="sesi" element={<Sessions />} />
        <Route path="*" element={<Navigate to="/sysAdmin/pengguna" replace />} />
      </Routes>
    </>
  );
}

// Infra Admin (/infraAdmin): developer memantau server, database, penyimpanan, dan mode perbaikan.
function InfraAdminArea() {
  return (
    <>
      <nav className="subtabs" aria-label="Infra Admin">
        <NavLink to="/infraAdmin/sistem">Sistem</NavLink>
        <NavLink to="/infraAdmin/penyimpanan">Penyimpanan file</NavLink>
        <NavLink to="/infraAdmin/keamanan">Keamanan dan perbaikan</NavLink>
      </nav>
      <Routes>
        <Route path="sistem" element={<System />} />
        <Route path="penyimpanan" element={<StorageStatus />} />
        <Route path="keamanan" element={<Settings infra />} />
        <Route path="*" element={<Navigate to="/infraAdmin/sistem" replace />} />
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
  const isInfra = user.role === 'infraadmin';
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
            {isAdmin && <NavLink to="/sysAdmin">System Admin</NavLink>}
            {isInfra && <NavLink to="/infraAdmin">Infra Admin</NavLink>}
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
          {isAdmin && <Route path="/sysAdmin/*" element={<SysAdminArea />} />}
          {isInfra && <Route path="/infraAdmin/*" element={<InfraAdminArea />} />}
          {/* Alamat lama tetap bisa dibuka */}
          {isAdmin && <Route path="/admin/sistem" element={<Navigate to="/infraAdmin/sistem" replace />} />}
          {isAdmin && <Route path="/admin/riwayat-login" element={<Navigate to="/aktivitas/riwayat-login" replace />} />}
          {isAdmin && <Route path="/admin/*" element={<Navigate to="/sysAdmin" replace />} />}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </>
  );
}
