import { useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { fmtDate } from '../util.js';
import { ConfirmDelete, ErrorBox, Loading, useLoad, useToast } from '../components/ui.jsx';

export const LICENSE_STATE = {
  trial: { label: 'Masa uji coba', cls: 'med' },
  trial_expired: { label: 'Uji coba habis', cls: 'high' },
  active: { label: 'Aktif', cls: 'ok' },
  expired: { label: 'Habis', cls: 'high' },
  invalid: { label: 'Tidak sah', cls: 'high' },
};

// Infra Admin: status lisensi, pasang kunci lisensi baru, atau kembali ke masa uji coba.
// System Admin hanya melihat statusnya.
export default function License() {
  const { user } = useAuth();
  const infra = user.role === 'infraadmin';
  const toast = useToast();
  const { data, error, loading, reload, setData } = useLoad(() => api.get('/admin/license'), []);
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  if (loading && !data) return <Loading />;
  if (error) return <ErrorBox error={error} retry={reload} />;

  const st = LICENSE_STATE[data.state] || LICENSE_STATE.invalid;
  const trial = data.state.startsWith('trial');
  const limit = data.max_users || 0;
  const pct = limit ? Math.min(100, Math.round((data.users_active / limit) * 100)) : 0;

  async function install(e) {
    e.preventDefault();
    setBusy(true);
    setMsg('');
    try {
      setData(await api.put('/admin/license', { key }));
      setKey('');
      toast('Lisensi dipasang');
    } catch (err) {
      setMsg(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    try {
      await api.del('/admin/license');
      toast('Lisensi dilepas, aplikasi kembali ke masa uji coba');
      reload();
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  return (
    <div className="stack">
      <section className="panel license-card">
        <div className="license-head">
          <div>
            <div className="t-sub">Status lisensi</div>
            <div className="license-name">{trial ? 'Belum berlisensi' : data.customer || 'Lisensi tidak terbaca'}</div>
          </div>
          <span className={`pill tone-${st.cls}`}>{st.label}</span>
        </div>
        <div className="license-stats">
          <div>
            <span className="t-sub">{trial ? 'Uji coba sampai' : 'Berlaku sampai'}</span>
            <b>{data.expires ? fmtDate(data.expires) : 'Selamanya'}</b>
            {data.days_left !== null && data.days_left !== undefined && <small className={data.days_left <= 30 ? 'bad-text' : ''}>{data.days_left > 0 ? `Sisa ${data.days_left} hari` : 'Sudah lewat'}</small>}
          </div>
          <div>
            <span className="t-sub">Pengguna aktif</span>
            <b>{data.users_active}{limit ? ` / ${limit}` : ''}</b>
            {limit ? <div className="progress"><div style={{ width: `${pct}%`, background: pct >= 100 ? 'var(--high)' : undefined }} /></div> : <small>Tanpa batas jumlah pengguna</small>}
          </div>
          <div>
            <span className="t-sub">{trial ? 'Dipasang sejak' : 'Diterbitkan'}</span>
            <b>{fmtDate(trial ? data.install_date : data.issued)}</b>
            {data.id && <small className="code">ID {data.id}</small>}
          </div>
        </div>
        {data.state === 'invalid' && <div className="notice">{data.error}</div>}
        {trial && <p className="t-sub" style={{ margin: 0 }}>Tanpa lisensi, aplikasi bisa dipakai {data.trial_days} hari sejak dipasang. Setelah itu pengguna dan System Admin tidak bisa masuk sampai lisensi dipasang. Infra Admin tetap bisa masuk.</p>}
        {!infra && <p className="t-sub" style={{ margin: 0 }}>Lisensi dipasang dan diperbarui oleh Infra Admin.</p>}
      </section>

      {infra && (
        <form className="panel form" onSubmit={install}>
          <h3 className="full" style={{ margin: 0 }}>{trial ? 'Pasang lisensi' : 'Ganti lisensi'}</h3>
          <label className="full"><span>Kunci lisensi</span>
            <textarea id="license-key" rows={4} spellCheck={false} className="mono" value={key} onChange={(e) => setKey(e.target.value)} placeholder="AM1.xxxxx.xxxxx" />
            <span className="hint">Kunci lisensi dibuat oleh penyedia aplikasi. Isinya (pelanggan, jumlah pengguna, masa berlaku) sudah ditandatangani dan tidak bisa diubah.</span>
          </label>
          {msg && <div className="error-text full" role="alert">{msg}</div>}
          <div className="form-foot full">
            {!trial && <span className="left"><ConfirmDelete label="Lepas lisensi" question="Lepas lisensi? Aplikasi kembali ke masa uji coba." yes="Ya, lepas" onConfirm={remove} /></span>}
            <button className="btn primary" disabled={busy || !key.trim()}>{busy ? 'Memeriksa…' : 'Pasang lisensi'}</button>
          </div>
        </form>
      )}
    </div>
  );
}
