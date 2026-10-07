import { useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { ROLES, LOGIN_REASON, device, fmtDateTime } from '../util.js';
import { useLoad, useToast } from '../components/ui.jsx';

export default function Account() {
  const { user } = useAuth();
  const toast = useToast();
  const logins = useLoad(() => api.get('/auth/my-logins'), []);
  const [f, setF] = useState({ current: '', next: '', confirm: '' });
  const [error, setError] = useState('');
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  async function submit(e) {
    e.preventDefault();
    setError('');
    if (f.next !== f.confirm) return setError('Konfirmasi kata sandi tidak sama.');
    try {
      await api.post('/auth/password', { current: f.current, next: f.next });
      setF({ current: '', next: '', confirm: '' });
      toast('Kata sandi diganti. Perangkat lain sudah dikeluarkan.');
    } catch (err) {
      setError(err.message);
    }
  }
  return (
    <>
    <div className="grid2">
      <div className="panel">
        <h3>Akun saya</h3>
        <div className="t-title" style={{ fontSize: 16 }}>{user.name}</div>
        <div className="t-sub">{user.username ? `${user.username} · ` : ''}{user.email}</div>
        <div className="t-sub">{ROLES[user.role]}{user.unit ? ` · ${user.unit}` : ''}</div>
      </div>
      <form className="panel form" onSubmit={submit}>
        <h3 className="full" style={{ margin: 0 }}>Ganti kata sandi</h3>
        <label className="full">Kata sandi lama<input id="p-cur" type="password" autoComplete="current-password" required value={f.current} onChange={set('current')} /></label>
        <label>Kata sandi baru<input id="p-new" type="password" autoComplete="new-password" minLength={8} required value={f.next} onChange={set('next')} /></label>
        <label>Ulangi kata sandi baru<input id="p-conf" type="password" autoComplete="new-password" required value={f.confirm} onChange={set('confirm')} /></label>
        {error && <div className="error-text full" role="alert">{error}</div>}
        <div className="form-foot full"><button className="btn primary">Simpan kata sandi</button></div>
      </form>
    </div>
    <div className="bar" style={{ marginTop: 20 }}><h2>Riwayat login saya</h2><span className="t-sub">20 terakhir. Laporkan ke admin bila ada yang tidak Anda kenali.</span></div>
    {logins.data?.length ? (
      <div className="tablebox"><table>
        <thead><tr><th>Waktu</th><th>Hasil</th><th>Alamat IP</th><th>Perangkat</th></tr></thead>
        <tbody>{logins.data.map((l) => (
          <tr key={l.id}>
            <td className="num t-sub">{fmtDateTime(l.created_at)}</td>
            <td>{l.success ? <span className="ok-text">Berhasil</span> : <span className="bad-text">{LOGIN_REASON[l.reason] || 'Gagal'}</span>}</td>
            <td className="code">{l.ip || '—'}</td>
            <td>{device(l.user_agent)}</td>
          </tr>
        ))}</tbody>
      </table></div>
    ) : <div className="t-sub">{logins.loading ? 'Memuat…' : 'Belum ada riwayat.'}</div>}
    </>
  );
}
