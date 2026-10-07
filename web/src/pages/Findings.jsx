import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { FINDING_STATUS, RISKS, canEdit, fmtDate } from '../util.js';
import { Empty, ErrorBox, Loading, RiskPill, StatusPill, useLoad } from '../components/ui.jsx';
import FindingSheet from '../components/FindingSheet.jsx';

export default function Findings() {
  const { user } = useAuth();
  const [filter, setFilter] = useState({ q: '', status: '', risk: '', audit: '', overdue: false });
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

  const rows = useMemo(() => {
    const q = filter.q.toLowerCase();
    return (data || []).filter((f) =>
      (!filter.status || f.status === filter.status) &&
      (!filter.risk || f.risk === filter.risk) &&
      (!filter.audit || String(f.audit_id) === filter.audit) &&
      (!filter.overdue || f.overdue) &&
      (!q || `${f.code} ${f.title} ${f.owner_name || ''} ${f.condition}`.toLowerCase().includes(q)));
  }, [data, filter]);

  return (
    <>
      <div className="bar">
        <h2>{user.role === 'auditee' ? 'Temuan untuk Anda' : 'Temuan'}</h2>
        {canEdit(user) && <button className="btn primary" onClick={() => setSheet({ preset: {} })}>Catat temuan</button>}
      </div>
      <div className="filters">
        <input id="f-q" placeholder="Cari judul, PIC, atau kondisi" value={filter.q} onChange={set('q')} />
        <select id="f-status-filter" aria-label="Status" value={filter.status} onChange={set('status')}><option value="">Semua status</option>{FINDING_STATUS.map((s) => <option key={s}>{s}</option>)}</select>
        <select id="f-risk-filter" aria-label="Risiko" value={filter.risk} onChange={set('risk')}><option value="">Semua risiko</option>{RISKS.map((s) => <option key={s}>{s}</option>)}</select>
        <select id="f-audit-filter" aria-label="Audit" value={filter.audit} onChange={set('audit')}><option value="">Semua audit</option>{audits.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select>
        <label className="btn" style={{ cursor: 'pointer' }}><input id="f-overdue" type="checkbox" style={{ width: 'auto' }} checked={filter.overdue} onChange={set('overdue')} />Terlambat saja</label>
      </div>
      {loading && !data ? <Loading /> : error ? <ErrorBox error={error} retry={reload} /> : !data.length ? (
        <Empty title="Belum ada temuan">{canEdit(user) ? 'Catat temuan dari audit yang sedang berjalan, atau tandai langkah program kerja sebagai Tidak sesuai.' : 'Temuan akan muncul di sini setelah auditor mencatatnya.'}</Empty>
      ) : (
        <div className="tablebox">
          <table>
            <thead><tr><th>No.</th><th>Temuan</th><th>Risiko</th><th>PIC</th><th>Batas waktu</th><th>Status</th></tr></thead>
            <tbody>
              {rows.map((f) => (
                <tr key={f.id} className="click" onClick={() => setSheet({ id: f.id })}>
                  <td className="code">{f.code}</td>
                  <td><div className="t-title">{f.title}</div><div className="t-sub">{f.audit_title} · {f.audit_unit}</div></td>
                  <td><RiskPill value={f.risk} /></td>
                  <td>{f.owner_name || '—'}</td>
                  <td className={`num ${f.overdue ? 'overdue' : ''}`}>{fmtDate(f.due_date)}{f.overdue ? ' · terlambat' : ''}</td>
                  <td><StatusPill value={f.status} /></td>
                </tr>
              ))}
              {!rows.length && <tr><td colSpan={6}><Empty small>Tidak ada temuan yang cocok dengan filter.</Empty></td></tr>}
            </tbody>
          </table>
        </div>
      )}
      {sheet && <FindingSheet id={sheet.id} preset={sheet.preset} onClose={() => setSheet(null)} onChanged={reload} />}
    </>
  );
}
