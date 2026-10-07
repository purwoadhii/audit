import { NavLink, Navigate, Route, Routes, Link } from 'react-router-dom';
import { useAuth } from './auth.jsx';
import { ROLES } from './util.js';
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

export default function App() {
  const { user, logout } = useAuth();
  if (user === undefined) return <div className="empty"><b>Memuat…</b></div>;
  if (!user) return <Login />;
  const isAdmin = user.role === 'admin';
  const seesActivity = ['admin', 'auditor', 'manajemen'].includes(user.role);
  return (
    <div className="wrap">
      <header className="top">
        <Link to="/" className="brand">
          <div className="brand-mark">JA</div>
          <div><h1>Jejak Audit</h1><small>Manajemen audit internal</small></div>
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
        {isAdmin && <NavLink to="/template">Template</NavLink>}
        {isAdmin && <NavLink to="/pengguna">Pengguna</NavLink>}
      </nav>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/audit" element={<Audits />} />
        <Route path="/audit/:id" element={<AuditDetail />} />
        <Route path="/audit/:id/laporan" element={<Report />} />
        <Route path="/temuan" element={<Findings />} />
        <Route path="/tindak-lanjut" element={<Board />} />
        <Route path="/akun" element={<Account />} />
        {seesActivity && <Route path="/aktivitas" element={<Activity />} />}
        {isAdmin && <Route path="/template" element={<Templates />} />}
        {isAdmin && <Route path="/pengguna" element={<Users />} />}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  );
}
