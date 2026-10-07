import { useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { ROLES, fmtDateTime } from '../util.js';
import { useSettings } from '../settings.jsx';
import { ErrorBox, Loading, Req, ReqNote, Sheet, useLoad, useToast } from '../components/ui.jsx';

const ROLE_HINT = {
  infraadmin: 'Developer. Semua hak System Admin, ditambah halaman Sistem, mode perbaikan, dan batas percobaan login.',
  admin: 'Admin dari pihak klien. Mengelola pengguna, template, pengaturan tampilan, data master, riwayat login, dan semua data.',
  auditor: 'Membuat audit, mengisi program kerja, dan mencatat temuan.',
  auditee: 'Melihat temuan untuk dirinya atau unitnya, memberi tanggapan, dan mengunggah bukti.',
  manajemen: 'Melihat semua audit, temuan, dan laporan tanpa mengubah.',
};

export default function Users() {
  const { data, error, loading, reload } = useLoad(() => api.get('/users'), []);
  const [editing, setEditing] = useState(null);
  const { user: me } = useAuth();
  // Akun Infra Admin hanya bisa diubah oleh Infra Admin.
  const canOpen = (u) => u.role !== 'infraadmin' || me.role === 'infraadmin';
  if (loading && !data) return <Loading />;
  if (error) return <ErrorBox error={error} retry={reload} />;
  return (
    <>
      <div className="bar"><h2>Pengguna</h2><button className="btn primary" onClick={() => setEditing({})}>Tambah pengguna</button></div>
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
  const roleOptions = Object.entries(ROLES).filter(([k]) => k !== 'infraadmin' || me.role === 'infraadmin');
  const [f, setF] = useState({ name: user?.name || '', username: user?.username || '', email: user?.email || '', role: user?.role || 'auditor', unit: user?.unit || '', password: '', active: user?.active ?? true });
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
      toast(isNew ? 'Pengguna ditambahkan' : 'Pengguna disimpan');
      onSaved();
      onClose();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <Sheet title={isNew ? 'Pengguna baru' : user.name} onClose={onClose}>
      <form className="form" onSubmit={submit}>
        <ReqNote />
        <label><span>Nama <Req /></span><input id="u-name" required value={f.name} onChange={set('name')} /></label>
        <label><span>Username <Req /></span><input id="u-username" required pattern="[a-z0-9._\-]{3,60}" autoCapitalize="none" value={f.username} onChange={(e) => setF({ ...f, username: e.target.value.toLowerCase() })} placeholder="budi.santoso" /><span className="hint">Dipakai untuk masuk. Huruf kecil, angka, titik, minus, garis bawah.</span></label>
        <label><span>Email <Req /></span><input id="u-email" type="email" required disabled={!isNew} value={f.email} onChange={set('email')} /></label>
        <label><span>Peran <Req /></span><select id="u-role" value={f.role} onChange={set('role')}>{roleOptions.map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select><span className="hint">{ROLE_HINT[f.role]}</span></label>
        <label><span>Unit {f.role === 'auditee' && <Req />}</span><input id="u-unit" required={f.role === 'auditee'} list="unit-list-u" value={f.unit} onChange={set('unit')} placeholder="Divisi Pengadaan" /><datalist id="unit-list-u">{settings.units.map((x) => <option key={x} value={x} />)}</datalist><span className="hint">Wajib untuk auditee, harus sama persis dengan unit di audit.</span></label>
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
