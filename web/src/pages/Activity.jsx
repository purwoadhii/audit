import { useMemo, useState } from 'react';
import { api } from '../api.js';
import { ROLES, fmtDateTime } from '../util.js';
import { Empty, ErrorBox, Loading, Pager, useLoad, usePaged } from '../components/ui.jsx';
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

const ACTION_FILTER = { create: N_('Membuat'), update: N_('Mengubah'), delete: N_('Menghapus'), upload: N_('Mengunggah'), ocr: N_('OCR') };

export default function Activity() {
  const { data, error, loading, reload } = useLoad(() => api.get('/dashboard/activity'), []);
  const [filter, setFilter] = useState({ q: '', user: '', action: '', entity: '' });
  const set = (k) => (e) => setFilter({ ...filter, [k]: e.target.value });
  const users = useMemo(() => [...new Set((data || []).map((l) => l.user_name).filter(Boolean))].sort(), [data]);
  const rows = useMemo(() => {
    const q = filter.q.toLowerCase();
    return (data || []).filter((l) =>
      (!filter.user || l.user_name === filter.user) &&
      (!filter.action || l.action === filter.action) &&
      (!filter.entity || l.entity === filter.entity) &&
      (!q || `${l.user_name || ''} ${describe(l)}`.toLowerCase().includes(q)));
  }, [data, filter]);
  const paged = usePaged(rows, JSON.stringify(filter));
  if (loading && !data) return <Loading />;
  if (error) return <ErrorBox error={error} retry={reload} />;
  return (
    <>
      <div className="bar"><h2>{t('Log aktivitas')}</h2><span className="t-sub">{t('{n} aktivitas terakhir', { n: data.length })}</span></div>
      {!data.length ? <Empty title={t('Belum ada aktivitas')} /> : (
        <>
          <div className="filters one-line">
            <input id="act-q" placeholder={t('Cari pengguna, nomor, atau judul')} value={filter.q} onChange={set('q')} />
            <select id="act-user" aria-label={t('Pengguna')} value={filter.user} onChange={set('user')}><option value="">{t('Semua pengguna')}</option>{users.map((u) => <option key={u} value={u}>{u}</option>)}</select>
            <select id="act-action" aria-label={t('Aktivitas')} value={filter.action} onChange={set('action')}><option value="">{t('Semua aktivitas')}</option>{Object.entries(ACTION_FILTER).map(([k, v]) => <option key={k} value={k}>{t(v)}</option>)}</select>
            <select id="act-entity" aria-label={t('Data')} value={filter.entity} onChange={set('entity')}><option value="">{t('Semua data')}</option>{Object.entries(ENTITY).map(([k, v]) => <option key={k} value={k}>{t(v)}</option>)}</select>
          </div>
          <div className="tablebox"><table>
            <thead><tr><th>{t('Waktu')}</th><th>{t('Pengguna')}</th><th>{t('Aktivitas')}</th></tr></thead>
            <tbody>
              {paged.rows.map((l) => <tr key={l.id}><td className="num t-sub">{fmtDateTime(l.created_at)}</td><td>{l.user_name || '—'}{l.user_role && <div className="t-sub">{ROLES[l.user_role]}</div>}</td><td>{describe(l)}</td></tr>)}
              {!rows.length && <tr><td colSpan={3}><Empty small>{t('Tidak ada aktivitas yang cocok dengan filter.')}</Empty></td></tr>}
            </tbody>
          </table></div>
          <Pager paged={paged} />
        </>
      )}
    </>
  );
}
