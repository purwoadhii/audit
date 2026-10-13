import { useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { ROLES, fmtDateTime } from '../util.js';
import { N_, T, t } from '../i18n.jsx';
import { useSettings } from '../settings.jsx';
import { ErrorBox, Loading, Req, ReqNote, Sheet, useLoad, useToast } from '../components/ui.jsx';

const ROLE_HINT = {
  infraadmin: N_('Developer. Masuk di /infraAdmin. Mengatur lisensi, akun System Admin, keamanan, dan kondisi server.'),
  admin: N_('Admin dari pihak klien. Masuk di /sysAdmin. Mengatur akun pengguna, template, tampilan, data master, penyimpanan, dan Asisten AI.'),
  auditor: N_('Membuat audit, mengisi program kerja, dan mencatat temuan.'),
  auditee: N_('Melihat temuan untuk dirinya atau unitnya, memberi tanggapan, dan mengunggah bukti.'),
  manajemen: N_('Melihat semua audit, temuan, dan laporan tanpa mengubah.'),
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
        <h2>{infra ? t('Akun admin') : t('Pengguna')}</h2>
        <span className="t-sub">{t('{a} aktif dari {b} akun', { a: active, b: data.length })}</span>
        <button className="btn primary" onClick={() => setEditing({})}>{infra ? t('Tambah admin') : t('Tambah pengguna')}</button>
      </div>
      {infra && <p className="page-note"><T k="Akun System Admin masuk di {path} dan mengatur akun pengguna." path={<b>/sysAdmin</b>} /> {t('Akun pengguna (auditor, auditee, manajemen) diatur oleh System Admin.')}</p>}
      <div className="tablebox">
        <table>
          <thead><tr><th>{t('Nama')}</th><th>{t('Username')}</th><th>{t('Email')}</th><th>{t('Peran')}</th><th>{t('Unit')}</th><th>{t('Login terakhir')}</th><th>{t('Status')}</th></tr></thead>
          <tbody>
            {data.map((u) => (
              <tr key={u.id} className={canOpen(u) ? 'click' : ''} onClick={() => canOpen(u) && setEditing(u)}>
                <td className="t-title">{u.name}</td><td>{u.username || '—'}</td><td>{u.email}</td><td>{ROLES[u.role]}</td><td>{u.unit || (['auditor', 'manajemen'].includes(u.role) ? <span className="t-sub">{t('Semua unit')}</span> : '—')}</td>
                <td className="num t-sub">{u.last_login_at ? fmtDateTime(u.last_login_at) : t('Belum pernah')}</td>
                <td>{u.active ? <span className="pill s-Selesai">{t('Aktif')}</span> : <span className="pill">{t('Nonaktif')}</span>}</td>
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
      toast(isNew ? t('Akun ditambahkan') : t('Akun disimpan'));
      onSaved();
      onClose();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <Sheet title={isNew ? (me.role === 'infraadmin' ? t('Admin baru') : t('Pengguna baru')) : user.name} onClose={onClose}>
      <form className="form" onSubmit={submit}>
        <ReqNote />
        <label><span>{t('Nama')} <Req /></span><input id="u-name" required value={f.name} onChange={set('name')} /></label>
        <label><span>{t('Username')} <Req /></span><input id="u-username" required pattern="[a-z0-9._\-]{3,60}" autoCapitalize="none" value={f.username} onChange={(e) => setF({ ...f, username: e.target.value.toLowerCase() })} placeholder="budi.santoso" /><span className="hint">{t('Dipakai untuk masuk. Huruf kecil, angka, titik, minus, garis bawah.')}</span></label>
        <label><span>{t('Email')} <Req /></span><input id="u-email" type="email" required disabled={!isNew} value={f.email} onChange={set('email')} /></label>
        <label><span>{t('Peran')} <Req /></span><select id="u-role" value={f.role} onChange={set('role')}>{roleOptions.map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select><span className="hint">{t(ROLE_HINT[f.role])}</span></label>
        {managedRoles(me).includes('auditee') && <label><span>{t('Unit')} {f.role === 'auditee' && <Req />}</span><input id="u-unit" required={f.role === 'auditee'} list="unit-list-u" value={f.unit} onChange={set('unit')} placeholder={t('Divisi Pengadaan')} /><datalist id="unit-list-u">{settings.units.map((x) => <option key={x} value={x} />)}</datalist><span className="hint">{t('Wajib untuk auditee. Pengguna dengan unit hanya melihat audit unitnya. Kosongkan supaya bisa melihat audit semua unit.')}</span></label>}
        <label className="full"><span>{isNew ? <>{t('Kata sandi awal')} <Req /></> : t('Atur ulang kata sandi')}</span><input id="u-pass" type="password" autoComplete="new-password" minLength={8} required={isNew} value={f.password} onChange={set('password')} placeholder={isNew ? t('Minimal 8 karakter') : t('Kosongkan bila tidak diubah')} /></label>
        {!isNew && user.id !== me.id && (
          <label className="full" style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><input id="u-active" type="checkbox" style={{ width: 'auto' }} checked={f.active} onChange={set('active')} />{t('Akun aktif')}</label>
        )}
        {error && <div className="error-text full" role="alert">{error}</div>}
        <div className="form-foot full"><button type="button" className="btn" onClick={onClose}>{t('Batal')}</button><button className="btn primary">{t('Simpan')}</button></div>
      </form>
    </Sheet>
  );
}
