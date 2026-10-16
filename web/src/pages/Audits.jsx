import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { fmtDate, canEdit } from '../util.js';
import { BusyButton, Empty, ErrorBox, Loading, Pager, RowActions, StatusPill, useLoad, usePaged, useToast } from '../components/ui.jsx';
import AuditForm from '../components/AuditForm.jsx';
import { t } from '../i18n.jsx';
import { exportExcel, auditColumns, auditRow } from '../exporters.js';

export default function Audits() {
  const { user } = useAuth();
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const { data, error, loading, reload } = useLoad(() => api.get('/audits'), []);
  const toast = useToast();
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState(null);
  const editor = canEdit(user);
  const rows = useMemo(() => {
    const needle = q.toLowerCase();
    return (data || []).filter((a) => !needle || `${a.code} ${a.title} ${a.unit} ${a.company || ''} ${a.lead_name || ''}`.toLowerCase().includes(needle));
  }, [data, q]);
  const paged = usePaged(rows, q);
  const creating = params.get('baru') === '1';
  const setCreating = (v) => setParams(v ? { baru: '1' } : {}, { replace: true });

  // Form ubah butuh data lengkap (anggota tim dan lainnya), jadi detail audit dimuat dulu.
  async function edit(id) {
    try { setEditing(await api.get(`/audits/${id}`)); } catch (err) { toast(err.message, 'error'); }
  }
  async function remove(a) {
    try {
      await api.del(`/audits/${a.id}`);
      toast(t('Audit {code} dihapus', { code: a.code }));
      reload();
    } catch (err) { toast(err.message, 'error'); }
  }

  const head = (
    <div className="bar">
      <h2>{t('Daftar audit')}</h2>
      <span className="bar-actions">
        {data?.length > 0 && <BusyButton onClick={() => exportExcel('daftar-audit', [{ name: t('Audit'), columns: auditColumns(rows.some((a) => a.company)), rows: rows.map(auditRow) }])}>{t('Ekspor Excel')}</BusyButton>}
        {editor && <button className="btn primary" onClick={() => setCreating(true)}>{t('Buat audit')}</button>}
      </span>
    </div>
  );
  let body;
  if (loading && !data) body = <Loading />;
  else if (error) body = <ErrorBox error={error} retry={reload} />;
  else if (!data.length) body = <Empty title={t('Belum ada audit')}>{t('Buat audit, pilih template program kerja, lalu catat hasil pengujian.')}</Empty>;
  else {
    body = (
      <>
        <div className="filters"><input id="audit-q" placeholder={t('Cari judul, unit, atau ketua tim')} value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <div className="tablebox">
          <table>
            <thead><tr><th>{t('No.')}</th><th>{t('Audit')}</th><th>{t('Ketua tim')}</th><th>{t('Periode')}</th><th>{t('Program kerja')}</th><th>{t('Temuan')}</th><th>{t('Isu')}</th><th>{t('Status')}</th>{editor && <th className="act-col">{t('Aksi')}</th>}</tr></thead>
            <tbody>
              {paged.rows.map((a) => {
                const pct = a.steps_total ? Math.round((a.steps_done / a.steps_total) * 100) : 0;
                return (
                  <tr key={a.id} className="click" onClick={() => nav(`/audit/${a.id}`)}>
                    <td className="code">{a.code}</td>
                    <td><div className="t-title">{a.title}</div><div className="t-sub">{[a.company, a.unit, t(a.type)].filter(Boolean).join(' · ')}</div></td>
                    <td>{a.lead_name || '—'}</td>
                    <td className="num">{fmtDate(a.start_date)} – {fmtDate(a.end_date)}</td>
                    <td><div className="progress"><div style={{ width: `${pct}%` }} /></div><div className="t-sub num">{t('{done}/{total} langkah', { done: a.steps_done, total: a.steps_total })}</div></td>
                    <td className="num">{a.findings_total} <span className="t-sub">{t('({n} terbuka)', { n: a.findings_open })}</span></td>
                    <td className="num">{a.issues_total} <span className="t-sub">{t('({n} terbuka)', { n: a.issues_open })}</span></td>
                    <td><StatusPill value={a.status} /></td>
                    {editor && <td className="act-col"><RowActions onEdit={() => edit(a.id)} onDelete={() => remove(a)} question={t('Hapus audit ini beserta semua temuan dan buktinya?')} /></td>}
                  </tr>
                );
              })}
              {!rows.length && <tr><td colSpan={editor ? 9 : 8}><Empty small>{t('Tidak ada audit yang cocok.')}</Empty></td></tr>}
            </tbody>
          </table>
        </div>
        <Pager paged={paged} />
      </>
    );
  }
  return (
    <>
      {head}
      {body}
      {editing && <AuditForm audit={editing} onClose={() => setEditing(null)} onSaved={reload} onDeleted={reload} />}
      {creating && <AuditForm onClose={() => setCreating(false)} onSaved={(a) => nav(`/audit/${a.id}`)} />}
    </>
  );
}
