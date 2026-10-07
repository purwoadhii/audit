import { useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { ROLES } from '../util.js';
import { ErrorBox, Loading, Sheet, useLoad, useToast } from '../components/ui.jsx';

const ROLE_HINT = {
  admin: 'Mengelola pengguna, template, dan semua data.',
  auditor: 'Membuat audit, mengisi program kerja, dan mencatat temuan.',
  auditee: 'Melihat temuan untuk dirinya atau unitnya, memberi tanggapan, dan mengunggah bukti.',
  manajemen: 'Melihat semua audit, temuan, dan laporan tanpa mengubah.',
};

export default function Users() {
  const { data, error, loading, reload } = useLoad(() => api.get('/users'), []);
  const [editing, setEditing] = useState(null);
  if (loading && !data) return <Loading />;
  if (error) return <ErrorBox error={error} retry={reload} />;
  return (
    <>
      <div className="bar"><h2>Pengguna</h2><button className="btn primary" onClick={() => setEditing({})}>Tambah pengguna</button></div>
      <div className="tablebox">
        <table>
          <thead><tr><th>Nama</th><th>Email</th><th>Peran</th><th>Unit</th><th>Status</th></tr></thead>
          <tbody>
            {data.map((u) => (
              <tr key={u.id} className="click" onClick={() => setEditing(u)}>
                <td className="t-title">{u.name}</td><td>{u.email}</td><td>{ROLES[u.role]}</td><td>{u.unit || '—'}</td>
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
  const [f, setF] = useState({ name: user?.name || '', email: user?.email || '', role: user?.role || 'auditor', unit: user?.unit || '', password: '', active: user?.active ?? true });
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
        <label>Nama<input id="u-name" required value={f.name} onChange={set('name')} /></label>
        <label>Email<input id="u-email" type="email" required disabled={!isNew} value={f.email} onChange={set('email')} /></label>
        <label>Peran<select id="u-role" value={f.role} onChange={set('role')}>{Object.entries(ROLES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select><span className="hint">{ROLE_HINT[f.role]}</span></label>
        <label>Unit<input id="u-unit" value={f.unit} onChange={set('unit')} placeholder="Divisi Pengadaan" /><span className="hint">Wajib untuk auditee, harus sama persis dengan unit di audit.</span></label>
        <label className="full">{isNew ? 'Kata sandi awal' : 'Atur ulang kata sandi'}<input id="u-pass" type="password" autoComplete="new-password" minLength={8} required={isNew} value={f.password} onChange={set('password')} placeholder={isNew ? 'Minimal 8 karakter' : 'Kosongkan bila tidak diubah'} /></label>
        {!isNew && user.id !== me.id && (
          <label className="full" style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><input id="u-active" type="checkbox" style={{ width: 'auto' }} checked={f.active} onChange={set('active')} />Akun aktif</label>
        )}
        {error && <div className="error-text full" role="alert">{error}</div>}
        <div className="form-foot full"><button type="button" className="btn" onClick={onClose}>Batal</button><button className="btn primary">Simpan</button></div>
      </form>
    </Sheet>
  );
}
