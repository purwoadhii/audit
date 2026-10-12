import { useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { ROLES, fmtDateTime } from '../util.js';
import { useSettings } from '../settings.jsx';
import { ErrorBox, Loading, Req, ReqNote, Sheet, useLoad, useToast } from '../components/ui.jsx';

const ROLE_HINT = {
  infraadmin: 'Developer. Masuk di /infraAdmin. Mengatur lisensi, akun System Admin, keamanan, dan kondisi server.',
  admin: 'Admin dari pihak klien. Masuk di /sysAdmin. Mengatur akun pengguna, template, tampilan, data master, penyimpanan, dan Asisten AI.',
  auditor: 'Membuat audit, mengisi program kerja, dan mencatat temuan.',
  auditee: 'Melihat temuan untuk dirinya atau unitnya, memberi tanggapan, dan mengunggah bukti.',
  manajemen: 'Melihat semua audit, temuan, dan laporan tanpa mengubah.',
};

// System Admin mengatur akun pengguna; Infra Admin mengatur akun System Admin dan Infra Admin.
const managedRoles = (me) => (me.role === 'infraadmin' ? ['admin', 'infraadmin'] : ['auditor', 'auditee', 'manajemen']);

export default function Users() {
  const { data, error, loading, reload } = useLoad(() => api.get('/users'), []);
  const [editing, setEditing] = useState(null);
  const { user: me } = useAuth();
  const infra = me.role === 'infraadmin';
  const canOpen = () => true;
  if (loading && !data) return <Loading />;
  if (error) return <ErrorBox error={error} retry={reload} />;
  const active = data.filter((u) => u.active).length;
  return (
    <>
      <div className="bar">
        <h2>{infra ? 'Akun admin' : 'Pengguna'}</h2>
        <span className="t-sub">{active} aktif dari {data.length} akun</span>
        <button className="btn primary" onClick={() => setEditing({})}>{infra ? 'Tambah admin' : 'Tambah pengguna'}</button>
      </div>
      {infra && <p className="page-note">Akun System Admin masuk di <b>/sysAdmin</b> dan mengatur akun pengguna. Akun pengguna (auditor, auditee, manajemen) diatur oleh System Admin.</p>}
      <div className="tablebox">
        <table>
          <thead><tr><th>Nama</th><th>Username</th><th>Email</th><th>Peran</th><th>Unit</th><th>Login terakhir</th><th>Status</th></tr></thead>
          <tbody>
            {data.map((u) => (
              <tr key={u.id} className={canOpen(u) ? 'click' : ''} onClick={() => canOpen(u) && setEditing(u)}>
                <td className="t-title">{u.name}</td><td>{u.username || '—'}</td><td>{u.email}</td><td>{ROLES[u.role]}</td><td>{u.unit || '—'}</td>
                <td className="num t-sub">{u.last_login_at ? fmtDateTime(u.last_login_at) : 'Belum pernah'}</td>
                <td>{u.active ? <span className="pill s-Selesai">Aktif</span> : <span className="pill">Nonaktif</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {editing && <UserForm user={editing.id ? editing : null} onClose={() => setEditing(null)} onSaved={reload} />}
    </>
  );
}

function UserForm({ user, onClose, onSaved }) {
  const { user: me } = useAuth();
  const toast = useToast();
  const isNew = !user;
  const { settings } = useSettings();
  const roleOptions = Object.entries(ROLES).filter(([k]) => managedRoles(me).includes(k));
  const [f, setF] = useState({ name: user?.name || '', username: user?.username || '', email: user?.email || '', role: user?.role || managedRoles(me)[0], unit: user?.unit || '', password: '', active: user?.active ?? true });
  const [error, setError] = useState('');
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });

  async function submit(e) {
    e.preventDefault();
    setError('');
    try {
      if (isNew) await api.post('/users', f);
      else {
        const { email, password, ...rest } = f;
        await api.patch(`/users/${user.id}`, password ? { ...rest, password } : rest);
      }
      toast(isNew ? 'Akun ditambahkan' : 'Akun disimpan');
      onSaved();
      onClose();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <Sheet title={isNew ? (me.role === 'infraadmin' ? 'Admin baru' : 'Pengguna baru') : user.name} onClose={onClose}>
      <form className="form" onSubmit={submit}>
        <ReqNote />
        <label><span>Nama <Req /></span><input id="u-name" required value={f.name} onChange={set('name')} /></label>
        <label><span>Username <Req /></span><input id="u-username" required pattern="[a-z0-9._\-]{3,60}" autoCapitalize="none" value={f.username} onChange={(e) => setF({ ...f, username: e.target.value.toLowerCase() })} placeholder="budi.santoso" /><span className="hint">Dipakai untuk masuk. Huruf kecil, angka, titik, minus, garis bawah.</span></label>
        <label><span>Email <Req /></span><input id="u-email" type="email" required disabled={!isNew} value={f.email} onChange={set('email')} /></label>
        <label><span>Peran <Req /></span><select id="u-role" value={f.role} onChange={set('role')}>{roleOptions.map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select><span className="hint">{ROLE_HINT[f.role]}</span></label>
        {managedRoles(me).includes('auditee') && <label><span>Unit {f.role === 'auditee' && <Req />}</span><input id="u-unit" required={f.role === 'auditee'} list="unit-list-u" value={f.unit} onChange={set('unit')} placeholder="Divisi Pengadaan" /><datalist id="unit-list-u">{settings.units.map((x) => <option key={x} value={x} />)}</datalist><span className="hint">Wajib untuk auditee, harus sama persis dengan unit di audit.</span></label>}
        <label className="full"><span>{isNew ? <>Kata sandi awal <Req /></> : 'Atur ulang kata sandi'}</span><input id="u-pass" type="password" autoComplete="new-password" minLength={8} required={isNew} value={f.password} onChange={set('password')} placeholder={isNew ? 'Minimal 8 karakter' : 'Kosongkan bila tidak diubah'} /></label>
        {!isNew && user.id !== me.id && (
          <label className="full" style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><input id="u-active" type="checkbox" style={{ width: 'auto' }} checked={f.active} onChange={set('active')} />Akun aktif</label>
        )}
        {error && <div className="error-text full" role="alert">{error}</div>}
        <div className="form-foot full"><button type="button" className="btn" onClick={onClose}>Batal</button><button className="btn primary">Simpan</button></div>
      </form>
    </Sheet>
  );
}
