import { useMemo, useState } from 'react';
import { api } from '../api.js';
import { ROLES, APPROVAL_LABEL, fmtDate, fmtDateTime } from '../util.js';
import { Empty, ErrorBox, Loading, Pager, useLoad, usePaged } from '../components/ui.jsx';
import { N_, t } from '../i18n.jsx';

const ACTION = {
  create: N_('membuat {entity} {what}'), update: N_('mengubah {entity} {what}'), delete: N_('menghapus {entity} {what}'),
  upload: N_('mengunggah {entity} {what}'), ocr: N_('membaca dengan OCR {entity} {what}'),
  review: N_('mereview kertas kerja dan temuan audit {what}'),
  ajukan: N_('mengajukan laporan audit {what}'), teruskan: N_('meneruskan laporan audit {what} ke penyetuju'),
  setujui: N_('menyetujui laporan audit {what}'), kembalikan: N_('mengembalikan laporan audit {what}'), tarik: N_('menarik pengajuan laporan audit {what}'),
  assess: N_('menilai risiko {what}'),
};
const ENTITY = { audit: N_('audit'), finding: N_('temuan'), user: N_('pengguna'), attachment: N_('file bukti'), setting: N_('pengaturan'), file: N_('file'), backup: N_('backup database'), approval: N_('persetujuan'),
  entity: N_('area audit'), risk: N_('penilaian risiko'), plan: N_('rencana audit') };

// Nama kolom untuk daftar perubahan (nilai sebelum dan sesudah).
const FIELD = {
  title: N_('Judul'), unit: N_('Unit'), type: N_('Jenis audit'), status: N_('Status'), lead: N_('Ketua tim'), members: N_('Anggota tim'),
  team: N_('Anggota eksternal'), scope: N_('Ruang lingkup dan tujuan'), start_date: N_('Tanggal mulai'), end_date: N_('Tanggal selesai'),
  risk: N_('Tingkat risiko'), due_date: N_('Batas waktu'), owner: N_('Penanggung jawab (PIC)'), audit: N_('Audit'),
  category: N_('Kategori temuan'), root_cause: N_('Kategori akar masalah'), condition: N_('Kondisi'), criteria: N_('Kriteria'),
  cause: N_('Sebab'), effect: N_('Akibat'), recommendation: N_('Rekomendasi'), response: N_('Tanggapan auditee'),
  approver: N_('Penyetuju'), approval: N_('Persetujuan'),
  entity: N_('Area audit'), kind: N_('Jenis area'), description: N_('Keterangan'), year: N_('Tahun'), quarter: N_('Triwulan'),
  hours: N_('Anggaran jam'), notes: N_('Catatan'), cancelled: N_('Dibatalkan'), score: N_('Skor risiko'),
  name: N_('Nama'), username: N_('Username'), email: N_('Email'), role: N_('Peran'), active: N_('Status akun'), password: N_('Kata sandi'),
};
// Nilai yang disimpan dalam bahasa Indonesia (status, risiko, jenis) diterjemahkan saat tampil.
const TRANSLATED = ['status', 'risk', 'type', 'category', 'root_cause', 'kind'];

function showValue(k, v) {
  if (v === null || v === undefined || v === '') return '—';
  if (k === 'password') return t('diubah');
  if (k === 'active') return Number(v) ? t('Aktif') : t('Nonaktif');
  if (k === 'cancelled') return Number(v) ? t('Ya') : t('Tidak');
  if (k === 'quarter') return `Q${v}`;
  if (k === 'score') return String(v).replace(/ · (.+)$/, (_, l) => ` · ${t(l)}`);
  if (k === 'role') return ROLES[v] || v;
  if (k.endsWith('_date')) return fmtDate(v);
  if (TRANSLATED.includes(k)) return t(v);
  if (k === 'approval') return t(APPROVAL_LABEL[v] || v);
  const s = String(v);
  return s.length > 120 ? `${s.slice(0, 120)}…` : s;
}

// Daftar perubahan satu aktivitas: kolom, nilai lama, dan nilai baru.
function Changes({ detail }) {
  const entries = Object.entries(detail?.changes || {});
  if (!entries.length) return null;
  return (
    <ul className="changes">
      {entries.map(([k, [from, to]]) => (
        <li key={k}>
          <b>{FIELD[k] ? t(FIELD[k]) : detail.labels?.[k] ? t(detail.labels[k]) : k}</b>
          {k === 'password' ? <span> {t('diubah')}</span> : <> <span className="from">{showValue(k, from)}</span> → <span className="to">{showValue(k, to)}</span></>}
        </li>
      ))}
    </ul>
  );
}

function describe(l) {
  const d = l.detail || {};
  // Untuk pengaturan, filename berisi label tetap dari server (misalnya gambar latar login).
  const what = (l.entity === 'setting' && d.filename ? t(d.filename) : d.code || d.title || d.filename || d.email) || (l.entity_id ? `#${l.entity_id}` : '');
  const entity = ENTITY[l.entity] ? t(ENTITY[l.entity]) : l.entity;
  return (ACTION[l.action] ? t(ACTION[l.action], { entity, what }) : `${l.action} ${entity} ${what}`).trim();
}

const ACTION_FILTER = {
  create: N_('Membuat'), update: N_('Mengubah'), delete: N_('Menghapus'), upload: N_('Mengunggah'), ocr: N_('OCR'),
  review: N_('Mereview'), ajukan: N_('Mengajukan'), setujui: N_('Menyetujui'), kembalikan: N_('Mengembalikan'),
  assess: N_('Menilai risiko'),
};

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
              {paged.rows.map((l) => <tr key={l.id}><td className="num t-sub">{fmtDateTime(l.created_at)}</td><td>{l.user_name || '—'}{l.user_role && <div className="t-sub">{ROLES[l.user_role]}</div>}</td><td>{describe(l)}{l.detail?.note && <div className="t-sub">“{l.detail.note}”</div>}<Changes detail={l.detail} /></td></tr>)}
              {!rows.length && <tr><td colSpan={3}><Empty small>{t('Tidak ada aktivitas yang cocok dengan filter.')}</Empty></td></tr>}
            </tbody>
          </table></div>
          <Pager paged={paged} />
        </>
      )}
    </>
  );
}
