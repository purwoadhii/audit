import { api } from '../api.js';
import { fmtDateTime } from '../util.js';
import { Empty, ErrorBox, Loading, useLoad } from '../components/ui.jsx';
import { N_, t } from '../i18n.jsx';

const ACTION = {
  create: N_('membuat {entity} {what}'), update: N_('mengubah {entity} {what}'), delete: N_('menghapus {entity} {what}'),
  upload: N_('mengunggah {entity} {what}'), ocr: N_('membaca dengan OCR {entity} {what}'),
};
const ENTITY = { audit: N_('audit'), finding: N_('temuan'), user: N_('pengguna'), attachment: N_('file bukti'), setting: N_('pengaturan'), file: N_('file') };

function describe(l) {
  const d = l.detail || {};
  // Untuk pengaturan, filename berisi label tetap dari server (misalnya gambar latar login).
  const what = (l.entity === 'setting' && d.filename ? t(d.filename) : d.code || d.title || d.filename || d.email) || (l.entity_id ? `#${l.entity_id}` : '');
  const entity = ENTITY[l.entity] ? t(ENTITY[l.entity]) : l.entity;
  return (ACTION[l.action] ? t(ACTION[l.action], { entity, what }) : `${l.action} ${entity} ${what}`).trim();
}

export default function Activity() {
  const { data, error, loading, reload } = useLoad(() => api.get('/dashboard/activity'), []);
  if (loading && !data) return <Loading />;
  if (error) return <ErrorBox error={error} retry={reload} />;
  return (
    <>
      <div className="bar"><h2>{t('Log aktivitas')}</h2><span className="t-sub">{t('100 aktivitas terakhir')}</span></div>
      {!data.length ? <Empty title={t('Belum ada aktivitas')} /> : (
        <div className="tablebox"><table>
          <thead><tr><th>{t('Waktu')}</th><th>{t('Pengguna')}</th><th>{t('Aktivitas')}</th></tr></thead>
          <tbody>{data.map((l) => <tr key={l.id}><td className="num t-sub">{fmtDateTime(l.created_at)}</td><td>{l.user_name || '—'}</td><td>{describe(l)}</td></tr>)}</tbody>
        </table></div>
      )}
    </>
  );
}
