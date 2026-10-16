import { useParams, Link } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { useSettings } from '../settings.jsx';
import { ROLES, fmtDateTime } from '../util.js';
import { ErrorBox, Loading, useLoad } from '../components/ui.jsx';
import { N_, t } from '../i18n.jsx';

const ACTION = { teruskan: N_('Review ketua tim'), ajukan: N_('Review ketua tim'), setujui: N_('Persetujuan laporan') };

// Halaman publik untuk memeriksa tanda tangan elektronik laporan audit dari kode atau QR di laporan cetak.
export default function Verify() {
  const { code } = useParams();
  const { user } = useAuth();
  const { settings } = useSettings();
  const { data: v, error, loading, reload } = useLoad(() => api.get(`/verify/${encodeURIComponent(code)}`), [code]);
  let body;
  if (loading && !v) body = <Loading />;
  else if (error) body = <ErrorBox error={error} retry={reload} />;
  else if (!v.valid) body = <div className="verdict bad">✕ {t('Kode verifikasi {code} tidak dikenal. Tanda tangan ini tidak sah.', { code })}</div>;
  else {
    const ok = v.unchanged && !v.revoked;
    body = (
      <>
        <div className={`verdict ${ok ? 'ok' : 'warn'}`}>
          {ok ? `✓ ${t('Tanda tangan sah dan isi laporan belum berubah sejak ditandatangani.')}`
            : v.revoked ? `! ${t('Tanda tangan ini sah, tetapi laporan sudah dikembalikan atau ditarik sesudah ditandatangani.')}`
              : `! ${t('Tanda tangan ini sah, tetapi isi laporan sudah berubah sesudah ditandatangani.')}`}
        </div>
        <dl>
          <dt>{t('Kode verifikasi')}</dt><dd className="code">{v.code}</dd>
          <dt>{t('Laporan')}</dt><dd><b>{v.audit.code}</b> · {v.audit.title}</dd>
          <dt>{t('Unit yang diaudit')}</dt><dd>{v.audit.unit}</dd>
          <dt>{t('Ditandatangani oleh')}</dt><dd>{v.signer || '—'}{v.signer_role ? ` · ${ROLES[v.signer_role] || v.signer_role}` : ''}{v.signer_unit ? ` · ${v.signer_unit}` : ''}</dd>
          <dt>{t('Sebagai')}</dt><dd>{t(ACTION[v.action] || v.action)}</dd>
          <dt>{t('Waktu')}</dt><dd>{fmtDateTime(v.signed_at)}</dd>
          {v.revoked && <><dt>{t('Sesudahnya')}</dt><dd>{v.revoked.action === 'tarik' ? t('Pengajuan ditarik') : t('Laporan dikembalikan')} · {fmtDateTime(v.revoked.at)}</dd></>}
          <dt>{t('Sidik isi (SHA-256)')}</dt><dd className="code" style={{ whiteSpace: 'normal', wordBreak: 'break-all' }}>{v.content_hash}</dd>
        </dl>
      </>
    );
  }
  return (
    <div className="verify panel">
      <h2 style={{ marginTop: 0 }}>{t('Verifikasi tanda tangan elektronik')}</h2>
      <p className="t-sub">{t(settings.app_name)}</p>
      {body}
      {!user && <p style={{ marginTop: 18 }}><Link to="/">{t('Masuk ke aplikasi')}</Link></p>}
    </div>
  );
}
