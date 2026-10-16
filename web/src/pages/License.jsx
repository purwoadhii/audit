import { useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { fmtDate } from '../util.js';
import { ConfirmDelete, ErrorBox, Loading, useLoad, useToast } from '../components/ui.jsx';
import { N_, t } from '../i18n.jsx';

export const EDITION = { standar: N_('Standar'), pro: N_('Pro') };
const FEATURE_LIST = [['ocr', N_('OCR')], ['ai', N_('Asisten AI')]];

export const LICENSE_STATE = {
  trial: { label: N_('Masa uji coba'), cls: 'med' },
  trial_expired: { label: N_('Uji coba habis'), cls: 'high' },
  active: { label: N_('Aktif'), cls: 'ok' },
  expired: { label: N_('Habis'), cls: 'high' },
  invalid: { label: N_('Tidak sah'), cls: 'high' },
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
      window.dispatchEvent(new Event('license-changed'));
      setKey('');
      toast(t('Lisensi dipasang'));
    } catch (err) {
      setMsg(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    try {
      await api.del('/admin/license');
      toast(t('Lisensi dilepas, aplikasi kembali ke masa uji coba'));
      window.dispatchEvent(new Event('license-changed'));
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
            <div className="t-sub">{t('Status lisensi')}</div>
            <div className="license-name">{trial ? t('Belum berlisensi') : data.customer || t('Lisensi tidak terbaca')}</div>
          </div>
          <span className="license-pills">
            {data.edition && <span className={`pill edition-${data.edition}`}>{trial ? t('Uji coba Pro') : t('Paket {edition}', { edition: t(EDITION[data.edition]) })}</span>}
            <span className={`pill tone-${st.cls}`}>{t(st.label)}</span>
          </span>
        </div>
        <div className="license-stats">
          <div>
            <span className="t-sub">{trial ? t('Uji coba sampai') : t('Berlaku sampai')}</span>
            <b>{data.expires ? fmtDate(data.expires) : t('Selamanya')}</b>
            {data.days_left !== null && data.days_left !== undefined && <small className={data.days_left <= 30 ? 'bad-text' : ''}>{data.days_left > 0 ? t('Sisa {n} hari', { n: data.days_left }) : t('Sudah lewat')}</small>}
          </div>
          <div>
            <span className="t-sub">{t('Pengguna aktif')}</span>
            <b>{data.users_active}{limit ? ` / ${limit}` : ''}</b>
            {limit ? <div className="progress"><div style={{ width: `${pct}%`, background: pct >= 100 ? 'var(--high)' : undefined }} /></div> : <small>{t('Tanpa batas jumlah pengguna')}</small>}
            <small>{t('{users} pengguna, {admins} System Admin. Infra Admin dan {free} System Admin tidak dihitung.', { users: data.users_work, admins: data.users_admin, free: data.free_admins })}</small>
          </div>
          <div>
            <span className="t-sub">{trial ? t('Dipasang sejak') : t('Diterbitkan')}</span>
            <b>{fmtDate(trial ? data.install_date : data.issued)}</b>
            {data.id && <small className="code">{t('ID {id}', { id: data.id })}</small>}
          </div>
        </div>
        {data.edition && (
          <div className="license-features">
            <span className="t-sub">{t('Fitur paket')}</span>
            {FEATURE_LIST.map(([f, label]) => {
              const on = (data.features || []).includes(f);
              return <span key={f} className={`feat${on ? ' on' : ''}`}>{on ? '✓' : '✕'} {on ? t(label) : t('{feature} (khusus Pro)', { feature: t(label) })}</span>;
            })}
          </div>
        )}
        {data.state === 'invalid' && <div className="notice">{t(data.error)}</div>}
        {trial && <p className="t-sub" style={{ margin: 0 }}>{t('Tanpa lisensi, aplikasi bisa dipakai {days} hari sejak dipasang. Setelah itu pengguna dan System Admin tidak bisa masuk sampai lisensi dipasang. Infra Admin tetap bisa masuk.', { days: data.trial_days })}</p>}
        {!infra && <p className="t-sub" style={{ margin: 0 }}>{t('Lisensi dipasang dan diperbarui oleh Infra Admin.')}</p>}
      </section>

      {infra && (
        <form className="panel form" onSubmit={install}>
          <h3 className="full" style={{ margin: 0 }}>{trial ? t('Pasang lisensi') : t('Ganti lisensi')}</h3>
          <label className="full"><span>{t('Kunci lisensi')}</span>
            <textarea id="license-key" rows={4} spellCheck={false} className="mono" value={key} onChange={(e) => setKey(e.target.value)} placeholder="AM1.xxxxx.xxxxx" />
            <span className="hint">{t('Kunci lisensi dibuat oleh penyedia aplikasi. Isinya (pelanggan, paket, jumlah pengguna, masa berlaku) sudah ditandatangani dan tidak bisa diubah.')}</span>
          </label>
          {msg && <div className="error-text full" role="alert">{msg}</div>}
          <div className="form-foot full">
            {!trial && <span className="left"><ConfirmDelete label={t('Lepas lisensi')} question={t('Lepas lisensi? Aplikasi kembali ke masa uji coba.')} yes={t('Ya, lepas')} onConfirm={remove} /></span>}
            <button className="btn primary" disabled={busy || !key.trim()}>{busy ? t('Memeriksa…') : t('Pasang lisensi')}</button>
          </div>
        </form>
      )}
    </div>
  );
}
