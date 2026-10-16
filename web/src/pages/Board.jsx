import { useMemo, useState } from 'react';
import { api } from '../api.js';
import { FINDING_KINDS, FINDING_STATUS, RISKS, fmtDate } from '../util.js';
import { Empty, ErrorBox, Loading, useLoad } from '../components/ui.jsx';
import FindingSheet from '../components/FindingSheet.jsx';
import { t } from '../i18n.jsx';

// Kartu per kolom dibatasi per halaman supaya papan tidak memanjang ke bawah.
const PER_COLUMN = 5;

export default function Board() {
  const { data, error, loading, reload } = useLoad(() => api.get('/findings'), []);
  const [openId, setOpenId] = useState(null);
  const [filter, setFilter] = useState({ q: '', kind: '', risk: '', audit: '', overdue: false });
  const [pages, setPages] = useState({});
  const set = (k) => (e) => {
    setFilter({ ...filter, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
    setPages({});
  };

  const audits = useMemo(() => {
    const m = new Map();
    for (const f of data || []) m.set(f.audit_id, `${f.audit_code} · ${f.audit_title}`);
    return [...m];
  }, [data]);

  const rows = useMemo(() => {
    const q = filter.q.toLowerCase();
    return (data || []).filter((f) =>
      (!filter.kind || f.kind === filter.kind) &&
      (!filter.risk || f.risk === filter.risk) &&
      (!filter.audit || String(f.audit_id) === filter.audit) &&
      (!filter.overdue || f.overdue) &&
      (!q || `${f.code} ${f.title} ${f.owner_name || ''} ${f.audit_title} ${f.audit_unit || ''}`.toLowerCase().includes(q)));
  }, [data, filter]);

  return (
    <>
      <div className="bar"><h2>{t('Tindak lanjut rekomendasi')}</h2><span className="t-sub">{t('Klik kartu untuk memperbarui progres')}</span></div>
      {loading && !data ? <Loading /> : error ? <ErrorBox error={error} retry={reload} /> : !data.length ? (
        <Empty title={t('Belum ada rekomendasi untuk dipantau')}>{t('Setiap temuan yang dicatat otomatis masuk ke papan ini.')}</Empty>
      ) : (
        <>
          <div className="filters one-line">
            <input id="b-q" placeholder={t('Cari judul, PIC, audit, atau unit')} value={filter.q} onChange={set('q')} />
            <select id="b-kind" aria-label={t('Jenis')} value={filter.kind} onChange={set('kind')}><option value="">{t('Temuan dan isu')}</option>{Object.entries(FINDING_KINDS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
            <select id="b-risk" aria-label={t('Risiko')} value={filter.risk} onChange={set('risk')}><option value="">{t('Semua risiko')}</option>{RISKS.map((s) => <option key={s} value={s}>{t(s)}</option>)}</select>
            <select id="b-audit" aria-label={t('Audit')} value={filter.audit} onChange={set('audit')}><option value="">{t('Semua audit')}</option>{audits.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select>
            <label className="btn check"><input id="b-overdue" type="checkbox" checked={filter.overdue} onChange={set('overdue')} />{t('Terlambat saja')}</label>
          </div>
          <div className="board">
            {FINDING_STATUS.map((s) => {
              const items = rows.filter((f) => f.status === s).sort((a, b) => String(a.due_date || '9').localeCompare(String(b.due_date || '9')));
              const total = Math.max(1, Math.ceil(items.length / PER_COLUMN));
              const page = Math.min(pages[s] || 1, total);
              const go = (n) => setPages({ ...pages, [s]: n });
              return (
                <div className="col" key={s}>
                  <h4><span>{t(s)}</span><span className="t-sub num">{items.length}</span></h4>
                  {items.slice((page - 1) * PER_COLUMN, page * PER_COLUMN).map((f) => (
                    <button key={f.id} className={`card k-${f.risk}`} onClick={() => setOpenId(f.id)}>
                      <div className="code">{f.code}</div>
                      <div className="t-title">{f.title}</div>
                      <div className="meta"><span>{f.owner_name || t('Belum ada PIC')}</span><span className={`num ${f.overdue ? 'overdue' : ''}`}>{fmtDate(f.due_date)}</span></div>
                    </button>
                  ))}
                  {!items.length && <Empty small>{t('Kosong')}</Empty>}
                  {total > 1 && (
                    <div className="col-pager">
                      <button type="button" className="btn small" disabled={page === 1} onClick={() => go(page - 1)} aria-label={t('Sebelumnya')}>‹</button>
                      <span className="t-sub num">{t('Halaman {a} dari {b}', { a: page, b: total })}</span>
                      <button type="button" className="btn small" disabled={page === total} onClick={() => go(page + 1)} aria-label={t('Berikutnya')}>›</button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
      {openId && <FindingSheet id={openId} onClose={() => setOpenId(null)} onChanged={reload} />}
    </>
  );
}
