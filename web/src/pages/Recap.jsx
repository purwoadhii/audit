import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { FINDING_STATUS, RISKS, fmtDate } from '../util.js';
import { BusyButton, Empty, ErrorBox, Loading, StatusPill, useLoad } from '../components/ui.jsx';
import { useSettings } from '../settings.jsx';
import { exportExcel, auditColumns, auditRow, findingColumns, findingRow } from '../exporters.js';
import { N_, t } from '../i18n.jsx';

const year = new Date().getFullYear();
const PRESETS = [
  ['tahun', N_('Tahun ini'), `${year}-01-01`, `${year}-12-31`],
  ['s1', N_('Semester I tahun ini'), `${year}-01-01`, `${year}-06-30`],
  ['s2', N_('Semester II tahun ini'), `${year}-07-01`, `${year}-12-31`],
  ['lalu', N_('Tahun lalu'), `${year - 1}-01-01`, `${year - 1}-12-31`],
  ['semua', N_('Semua periode'), '', ''],
];

// Audit masuk periode bila rentang tanggalnya beririsan dengan periode yang dipilih.
function inPeriod(a, from, to) {
  if (!from && !to) return true;
  const start = a.start_date || a.end_date;
  const end = a.end_date || a.start_date;
  if (!start) return false;
  return (!to || start <= to) && (!from || end >= from);
}

const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);

// Jumlah temuan dan isu, yang terbuka, terlambat, selesai, dan berisiko tinggi.
function stats(key, list) {
  const g = { key, total: list.length, open: 0, overdue: 0, done: 0, high: 0, temuan: 0, isu: 0 };
  for (const f of list) {
    g[f.kind === 'isu' ? 'isu' : 'temuan'] += 1;
    if (f.status === 'Selesai') g.done += 1; else g.open += 1;
    if (f.overdue) g.overdue += 1;
    if (f.risk === 'Tinggi') g.high += 1;
  }
  return g;
}

// Mengelompokkan temuan per kunci (kategori atau akar masalah), yang terbanyak di atas.
function groupBy(list, keyOf) {
  const m = new Map();
  for (const f of list) {
    const k = keyOf(f) || '';
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(f);
  }
  return [...m].map(([k, items]) => stats(k, items)).sort((a, b) => b.total - a.total || a.key.localeCompare(b.key));
}

export default function Recap() {
  const { settings } = useSettings();
  const audits = useLoad(() => api.get('/audits'), []);
  const findings = useLoad(() => api.get('/findings'), []);
  const [f, setF] = useState({ preset: 'tahun', from: PRESETS[0][2], to: PRESETS[0][3], unit: '', type: '' });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value, ...(k === 'from' || k === 'to' ? { preset: '' } : {}) });
  const choose = (e) => {
    const p = PRESETS.find((x) => x[0] === e.target.value);
    setF({ ...f, preset: e.target.value, ...(p ? { from: p[2], to: p[3] } : {}) });
  };

  const units = useMemo(() => [...new Set((audits.data || []).map((a) => a.unit))].sort(), [audits.data]);
  const types = useMemo(() => [...new Set((audits.data || []).map((a) => a.type))].sort(), [audits.data]);
  const view = useMemo(() => {
    if (!audits.data || !findings.data) return null;
    const as = audits.data.filter((a) => inPeriod(a, f.from, f.to) && (!f.unit || a.unit === f.unit) && (!f.type || a.type === f.type));
    const ids = new Set(as.map((a) => a.id));
    const fs = findings.data.filter((x) => ids.has(x.audit_id));
    const temuan = fs.filter((x) => x.kind !== 'isu');
    return {
      audits: as, findings: fs,
      kpi: {
        audits: as.length, done: as.filter((a) => a.status === 'Selesai').length,
        temuan: temuan.length, isu: fs.length - temuan.length,
        open: fs.filter((x) => x.status !== 'Selesai').length, overdue: fs.filter((x) => x.overdue).length,
        closed: fs.filter((x) => x.status === 'Selesai').length,
      },
      // Semua unit yang diaudit di periode ini, termasuk yang belum punya temuan.
      byUnit: [...new Set(as.map((a) => a.unit))]
        .map((u) => ({ ...stats(u, fs.filter((x) => x.audit_unit === u)), audits: as.filter((a) => a.unit === u).length }))
        .sort((a, b) => b.total - a.total || b.audits - a.audits || a.key.localeCompare(b.key)),
      byCategory: groupBy(fs, (x) => x.category),
      byRoot: groupBy(fs, (x) => x.root_cause),
      matrix: RISKS.map((r) => ({ risk: r, cells: FINDING_STATUS.map((s) => fs.filter((x) => x.risk === r && x.status === s).length) })),
    };
  }, [audits.data, findings.data, f]);

  const loading = (audits.loading && !audits.data) || (findings.loading && !findings.data);
  const error = audits.error || findings.error;
  const periodText = f.from || f.to ? t('{start} s.d. {end}', { start: fmtDate(f.from), end: fmtDate(f.to) }) : t('Semua periode');
  const label = (k, none) => (k ? t(k) : t(none));

  async function toExcel() {
    const counts = [
      { header: t('Temuan'), key: 'temuan', width: 10 }, { header: t('Isu'), key: 'isu', width: 8 },
      { header: t('Terbuka'), key: 'open', width: 10 }, { header: t('Terlambat'), key: 'overdue', width: 10 },
      { header: t('Selesai'), key: 'done', width: 10 }, { header: t('Risiko tinggi'), key: 'high', width: 12 },
    ];
    const groupCols = (head) => [{ header: head, key: 'key', width: 30 }, ...counts];
    const k = view.kpi;
    await exportExcel('rekap-audit', [
      {
        name: t('Ringkasan'), title: t('Rekap audit {period}', { period: periodText }),
        columns: [{ header: t('Ukuran'), key: 'k', width: 34 }, { header: t('Jumlah'), key: 'v', width: 12 }],
        rows: [
          { k: t('Audit'), v: k.audits }, { k: t('Audit selesai'), v: k.done }, { k: t('Temuan'), v: k.temuan }, { k: t('Isu'), v: k.isu },
          { k: t('Temuan dan isu terbuka'), v: k.open }, { k: t('Lewat batas waktu'), v: k.overdue },
          { k: t('Tindak lanjut selesai (%)'), v: pct(k.closed, k.temuan + k.isu) },
          ...(f.unit ? [{ k: t('Unit'), v: f.unit }] : []), ...(f.type ? [{ k: t('Jenis audit'), v: t(f.type) }] : []),
        ],
      },
      { name: t('Per unit'), columns: [{ header: t('Unit'), key: 'key', width: 30 }, { header: t('Audit'), key: 'audits', width: 8 }, ...counts], rows: view.byUnit },
      { name: t('Per kategori'), columns: groupCols(t('Kategori temuan')), rows: view.byCategory.map((g) => ({ ...g, key: label(g.key, 'Tanpa kategori') })) },
      { name: t('Per akar masalah'), columns: groupCols(t('Kategori akar masalah')), rows: view.byRoot.map((g) => ({ ...g, key: label(g.key, 'Tanpa kategori') })) },
      { name: t('Audit'), columns: auditColumns(), rows: view.audits.map(auditRow) },
      { name: t('Temuan dan isu'), columns: findingColumns(), rows: view.findings.map(findingRow) },
    ]);
  }

  return (
    <>
      <div className="bar no-print">
        <h2>{t('Rekap lintas audit')}</h2>
        {view && (
          <span className="bar-actions">
            <BusyButton onClick={toExcel}>{t('Ekspor Excel')}</BusyButton>
            <button className="btn primary" onClick={() => window.print()}>{t('Cetak / simpan PDF')}</button>
          </span>
        )}
      </div>
      <div className="filters one-line no-print">
        <select id="rk-preset" aria-label={t('Periode')} value={f.preset} onChange={choose}>
          {!f.preset && <option value="">{t('Periode khusus')}</option>}
          {PRESETS.map(([k, l]) => <option key={k} value={k}>{t(l)}</option>)}
        </select>
        <label className="date-filter">{t('Dari')}<input id="rk-from" type="date" value={f.from} onChange={set('from')} /></label>
        <label className="date-filter">{t('Sampai')}<input id="rk-to" type="date" value={f.to} onChange={set('to')} /></label>
        <select id="rk-unit" aria-label={t('Unit')} value={f.unit} onChange={set('unit')}><option value="">{t('Semua unit')}</option>{units.map((u) => <option key={u} value={u}>{u}</option>)}</select>
        <select id="rk-type" aria-label={t('Jenis audit')} value={f.type} onChange={set('type')}><option value="">{t('Semua jenis audit')}</option>{types.map((x) => <option key={x} value={x}>{t(x)}</option>)}</select>
      </div>
      {loading ? <Loading /> : error ? <ErrorBox error={error} retry={() => { audits.reload(); findings.reload(); }} /> : (
        <article className="recap">
          <div className="print-only">
            <h1>{t('Rekap audit {period}', { period: periodText })}</h1>
            <div className="t-sub">{[f.unit, f.type && t(f.type), settings.app_name].filter(Boolean).join(' · ')} · {t('Dicetak {date}', { date: fmtDate(new Date().toISOString()) })}</div>
          </div>
          <p className="t-sub no-print">{t('Audit dihitung bila periodenya beririsan dengan {period}. Temuan dan isu mengikuti audit tersebut.', { period: periodText })}</p>
          {!view.audits.length ? <Empty title={t('Tidak ada audit di periode ini')}>{t('Ubah periode atau filter untuk melihat rekap.')}</Empty> : (
            <>
              <div className="kpis">
                <div className="kpi"><div className="lbl">{t('Audit')}</div><div className="val">{view.kpi.audits}</div><div className="sub">{t('{n} selesai', { n: view.kpi.done })}</div></div>
                <div className="kpi"><div className="lbl">{t('Temuan dan isu')}</div><div className="val">{view.kpi.temuan + view.kpi.isu}</div><div className="sub">{t('{a} temuan · {b} isu', { a: view.kpi.temuan, b: view.kpi.isu })}</div></div>
                <div className={`kpi ${view.kpi.overdue ? 'alert' : ''}`}><div className="lbl">{t('Masih terbuka')}</div><div className="val">{view.kpi.open}</div><div className="sub">{t('{n} lewat batas waktu', { n: view.kpi.overdue })}</div></div>
                <div className="kpi"><div className="lbl">{t('Tindak lanjut selesai')}</div><div className="val">{pct(view.kpi.closed, view.kpi.temuan + view.kpi.isu)}%</div><div className="sub">{t('{n} ditutup', { n: view.kpi.closed })}</div></div>
              </div>
              <div className="grid2">
                <Group title={t('Per unit')} head={t('Unit')} rows={view.byUnit} withAudits />
                <section className="panel">
                  <h3>{t('Risiko dan status')}</h3>
                  <table>
                    <thead><tr><th>{t('Risiko')}</th>{FINDING_STATUS.map((s) => <th key={s} className="num">{t(s)}</th>)}<th className="num">{t('Total')}</th></tr></thead>
                    <tbody>{view.matrix.map((m) => <tr key={m.risk}><td>{t(m.risk)}</td>{m.cells.map((c, i) => <td key={i} className="num">{c}</td>)}<td className="num"><b>{m.cells.reduce((x, y) => x + y, 0)}</b></td></tr>)}</tbody>
                  </table>
                </section>
                <Group title={t('Per kategori temuan')} head={t('Kategori')} rows={view.byCategory} none={N_('Tanpa kategori')} />
                <Group title={t('Per kategori akar masalah')} head={t('Akar masalah')} rows={view.byRoot} none={N_('Tanpa kategori')} />
              </div>
              <section className="panel" style={{ marginTop: 16 }}>
                <h3>{t('Audit di periode ini')}</h3>
                <table>
                  <thead><tr><th>{t('No.')}</th><th>{t('Audit')}</th><th>{t('Periode')}</th><th className="num">{t('Temuan')}</th><th className="num">{t('Isu')}</th><th>{t('Status')}</th></tr></thead>
                  <tbody>
                    {view.audits.map((a) => (
                      <tr key={a.id}>
                        <td className="code"><Link to={`/audit/${a.id}`}>{a.code}</Link></td>
                        <td><div className="t-title">{a.title}</div><div className="t-sub">{a.unit} · {t(a.type)}</div></td>
                        <td className="num">{fmtDate(a.start_date)} – {fmtDate(a.end_date)}</td>
                        <td className="num">{a.findings_total} <span className="t-sub">{t('({n} terbuka)', { n: a.findings_open })}</span></td>
                        <td className="num">{a.issues_total} <span className="t-sub">{t('({n} terbuka)', { n: a.issues_open })}</span></td>
                        <td><StatusPill value={a.status} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            </>
          )}
        </article>
      )}
    </>
  );
}

function Group({ title, head, rows, none, withAudits }) {
  return (
    <section className="panel">
      <h3>{title}</h3>
      {!rows.length ? <Empty small>{t('Belum ada temuan atau isu.')}</Empty> : (
        <table>
          <thead><tr><th>{head}</th>{withAudits && <th className="num">{t('Audit')}</th>}<th className="num">{t('Temuan')}</th><th className="num">{t('Isu')}</th><th className="num">{t('Terbuka')}</th><th className="num">{t('Terlambat')}</th><th className="num">{t('Risiko tinggi')}</th></tr></thead>
          <tbody>
            {rows.map((g) => (
              <tr key={g.key || '-'}>
                <td>{!g.key ? <span className="t-sub">{t(none)}</span> : none ? t(g.key) : g.key}</td>
                {withAudits && <td className="num">{g.audits}</td>}
                <td className="num">{g.temuan}</td><td className="num">{g.isu}</td><td className="num">{g.open}</td>
                <td className={`num ${g.overdue ? 'overdue' : ''}`}>{g.overdue}</td><td className="num">{g.high}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
