import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { useSettings } from '../settings.jsx';
import { FINDING_KINDS, FINDING_STATUS, RISKS, canEdit, fmtDate } from '../util.js';
import { BusyButton, Empty, ErrorBox, Loading, Pager, RiskPill, RowActions, StatusPill, useLoad, usePaged, useToast } from '../components/ui.jsx';
import FindingSheet from '../components/FindingSheet.jsx';
import { t } from '../i18n.jsx';
import { exportExcel, findingColumns, findingRow } from '../exporters.js';

export default function Findings() {
  const { user } = useAuth();
  const { settings } = useSettings();
  const toast = useToast();
  const editor = canEdit(user);
  // Auditee bisa memperbarui tanggapannya, manajemen hanya melihat.
  const acts = editor || user.role === 'auditee';
  const [filter, setFilter] = useState({ q: '', kind: '', status: '', risk: '', category: '', audit: '', overdue: false });
  const { data, error, loading, reload } = useLoad(() => api.get('/findings'), []);
  // ?id= dari tautan Asisten AI langsung membuka temuan itu.
  const [params, setParams] = useSearchParams();
  const [sheet, setSheetState] = useState(() => (params.get('id') ? { id: Number(params.get('id')) } : null));
  const setSheet = (v) => {
    setSheetState(v);
    if (!v && params.get('id')) setParams({}, { replace: true });
  };
  const set = (k) => (e) => setFilter({ ...filter, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });

  const audits = useMemo(() => {
    const m = new Map();
    for (const f of data || []) m.set(f.audit_id, `${f.audit_code} · ${f.audit_title}`);
    return [...m];
  }, [data]);

  // Kategori dari pengaturan, ditambah kategori lama yang masih dipakai temuan.
  const categories = useMemo(() => [...new Set([...settings.finding_categories, ...(data || []).map((f) => f.category).filter(Boolean)])], [data, settings]);

  const rows = useMemo(() => {
    const q = filter.q.toLowerCase();
    return (data || []).filter((f) =>
      (!filter.kind || f.kind === filter.kind) &&
      (!filter.status || f.status === filter.status) &&
      (!filter.risk || f.risk === filter.risk) &&
      (!filter.category || (f.category || '') === (filter.category === '-' ? '' : filter.category)) &&
      (!filter.audit || String(f.audit_id) === filter.audit) &&
      (!filter.overdue || f.overdue) &&
      (!q || `${f.code} ${f.title} ${f.owner_name || ''} ${f.condition}`.toLowerCase().includes(q)));
  }, [data, filter]);
  const paged = usePaged(rows, JSON.stringify(filter));

  async function remove(f) {
    try {
      await api.del(`/findings/${f.id}`);
      toast(f.kind === 'isu' ? t('Isu {code} dihapus', { code: f.code }) : t('Temuan {code} dihapus', { code: f.code }));
      reload();
    } catch (err) { toast(err.message, 'error'); }
  }

  return (
    <>
      <div className="bar">
        <h2>{user.role === 'auditee' ? t('Temuan dan isu untuk Anda') : t('Temuan dan isu')}</h2>
        <span className="bar-actions">
          {data?.length > 0 && <BusyButton onClick={() => exportExcel('temuan-dan-isu', [{ name: t('Temuan dan isu'), columns: findingColumns(), rows: rows.map(findingRow) }])}>{t('Ekspor Excel')}</BusyButton>}
          {editor && <button className="btn primary" onClick={() => setSheet({ preset: {} })}>{t('Catat temuan')}</button>}
        </span>
      </div>
      <div className="filters one-line">
        <input id="f-q" placeholder={t('Cari judul, PIC, atau kondisi')} value={filter.q} onChange={set('q')} />
        <select id="f-kind-filter" aria-label={t('Jenis')} value={filter.kind} onChange={set('kind')}><option value="">{t('Temuan dan isu')}</option>{Object.entries(FINDING_KINDS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        <select id="f-status-filter" aria-label={t('Status')} value={filter.status} onChange={set('status')}><option value="">{t('Semua status')}</option>{FINDING_STATUS.map((s) => <option key={s} value={s}>{t(s)}</option>)}</select>
        <select id="f-risk-filter" aria-label={t('Risiko')} value={filter.risk} onChange={set('risk')}><option value="">{t('Semua risiko')}</option>{RISKS.map((s) => <option key={s} value={s}>{t(s)}</option>)}</select>
        <select id="f-category-filter" aria-label={t('Kategori temuan')} value={filter.category} onChange={set('category')}><option value="">{t('Semua kategori')}</option>{categories.map((c) => <option key={c} value={c}>{t(c)}</option>)}<option value="-">{t('Tanpa kategori')}</option></select>
        <select id="f-audit-filter" aria-label={t('Audit')} value={filter.audit} onChange={set('audit')}><option value="">{t('Semua audit')}</option>{audits.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select>
        <label className="btn check"><input id="f-overdue" type="checkbox" checked={filter.overdue} onChange={set('overdue')} />{t('Terlambat saja')}</label>
      </div>
      {loading && !data ? <Loading /> : error ? <ErrorBox error={error} retry={reload} /> : !data.length ? (
        <Empty title={t('Belum ada temuan')}>{canEdit(user) ? t('Catat temuan dari audit yang sedang berjalan, atau tandai langkah program kerja sebagai Tidak sesuai.') : t('Temuan akan muncul di sini setelah auditor mencatatnya.')}</Empty>
      ) : (
        <div className="tablebox">
          <table>
            <thead><tr><th>{t('No.')}</th><th>{t('Judul')}</th><th>{t('Risiko')}</th><th>{t('PIC')}</th><th>{t('Batas waktu')}</th><th>{t('Status')}</th>{acts && <th className="act-col">{t('Aksi')}</th>}</tr></thead>
            <tbody>
              {paged.rows.map((f) => (
                <tr key={f.id} className="click" onClick={() => setSheet({ id: f.id })}>
                  <td className="code">{f.code}</td>
                  <td><div className="t-title">{f.title}</div><div className="t-sub">{[FINDING_KINDS[f.kind], f.category && t(f.category), f.audit_title, f.audit_unit].filter(Boolean).join(' · ')}</div></td>
                  <td><RiskPill value={f.risk} /></td>
                  <td>{f.owner_name || '—'}</td>
                  <td className={`num ${f.overdue ? 'overdue' : ''}`}>{fmtDate(f.due_date)}{f.overdue ? ` · ${t('terlambat')}` : ''}</td>
                  <td><StatusPill value={f.status} /></td>
                  {acts && <td className="act-col"><RowActions onEdit={() => setSheet({ id: f.id })} onDelete={editor ? () => remove(f) : null}
                    question={f.kind === 'isu' ? t('Hapus isu ini beserta riwayat dan buktinya?') : t('Hapus temuan ini beserta riwayat dan buktinya?')} /></td>}
                </tr>
              ))}
              {!rows.length && <tr><td colSpan={acts ? 7 : 6}><Empty small>{t('Tidak ada temuan yang cocok dengan filter.')}</Empty></td></tr>}
            </tbody>
          </table>
        </div>
      )}
      {data?.length > 0 && <Pager paged={paged} />}
      {sheet && <FindingSheet id={sheet.id} preset={sheet.preset} onClose={() => setSheet(null)} onChanged={reload} />}
    </>
  );
}
