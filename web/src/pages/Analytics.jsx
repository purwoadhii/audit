import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { Empty, ErrorBox, Loading, useLoad } from '../components/ui.jsx';
import { RiskPill } from '../components/ui.jsx';
import { N_, localeTag, t } from '../i18n.jsx';

const AGING = { not_due: N_('Belum jatuh tempo'), d30: N_('Terlambat 1–30 hari'), d60: N_('Terlambat 31–60 hari'), d90: N_('Terlambat 61–90 hari'), d90plus: N_('Terlambat lebih dari 90 hari') };
const AGING_COLOR = { not_due: 'var(--ok)', d30: 'var(--med)', d60: '#C2632B', d90: 'var(--high)', d90plus: '#7E1F18' };
const RISKS = ['Tinggi', 'Sedang', 'Rendah'];
const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);

// Grafik batang bulanan: temuan baru dan temuan ditutup, berdampingan per bulan.
function TrendChart({ trend }) {
  const max = Math.max(1, ...trend.flatMap((m) => [m.opened, m.closed]));
  const label = (k) => new Date(`${k}-01T12:00:00`).toLocaleDateString(localeTag(), { month: 'short', year: '2-digit' });
  return (
    <>
      <div className="legend" style={{ marginTop: 0, marginBottom: 10 }}>
        <span><i style={{ background: 'var(--accent)' }} />{t('Temuan baru')}</span>
        <span><i style={{ background: 'var(--navy-700, #33516B)' }} />{t('Temuan ditutup')}</span>
      </div>
      <div className="trend" role="table" aria-label={t('Tren temuan per bulan')}>
        {trend.map((m) => (
          <div key={m.month} className="trend-col" role="row" title={t('{month}: {a} temuan baru, {b} ditutup', { month: label(m.month), a: m.opened, b: m.closed })}>
            <div className="trend-bars">
              <i role="cell" style={{ height: `${(m.opened / max) * 100}%`, background: 'var(--accent)' }}><b>{m.opened || ''}</b></i>
              <i role="cell" style={{ height: `${(m.closed / max) * 100}%`, background: 'var(--navy-700, #33516B)' }}><b>{m.closed || ''}</b></i>
            </div>
            <span className="mb-l">{label(m.month)}</span>
          </div>
        ))}
      </div>
    </>
  );
}

function Bars({ rows, label, value, color = 'var(--accent)', total }) {
  const max = Math.max(1, ...rows.map(value));
  return rows.map((r) => (
    <div className="riskbar load" key={label(r)}>
      <span title={label(r)} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label(r)}</span>
      <div className="track"><div className="fill" style={{ width: `${(value(r) / max) * 100}%`, background: typeof color === 'function' ? color(r) : color }} /></div>
      <span className="n">{value(r)}{total ? ` · ${pct(value(r), total)}%` : ''}</span>
    </div>
  ));
}

export default function Analytics() {
  const [months, setMonths] = useState(12);
  const { data, error, loading, reload } = useLoad(() => api.get(`/dashboard/analytics?months=${months}`), [months]);
  const totals = useMemo(() => {
    if (!data) return null;
    const closed = data.closing.reduce((s, x) => s + x.closed, 0);
    const onTime = data.closing.reduce((s, x) => s + x.on_time, 0);
    const withDue = data.closing.reduce((s, x) => s + x.with_due, 0);
    const days = closed ? Math.round(data.closing.reduce((s, x) => s + (x.days || 0) * x.closed, 0) / closed) : null;
    const opened = data.trend.reduce((s, m) => s + m.opened, 0);
    const late = data.aging.filter((a) => a.bucket !== 'not_due').reduce((s, a) => s + a.n, 0);
    return { closed, onTime, withDue, days, opened, late, open: data.aging.reduce((s, a) => s + a.n, 0) };
  }, [data]);

  if (loading && !data) return <Loading />;
  if (error) return <ErrorBox error={error} retry={reload} />;
  const catTotal = data.byCategory.reduce((s, x) => s + x.n, 0);
  const rcTotal = data.byRootCause.reduce((s, x) => s + x.n, 0);
  return (
    <>
      <div className="bar">
        <h2>{t('Analitik temuan')}</h2>
        <label className="date-filter">{t('Periode')}
          <select id="an-months" value={months} onChange={(e) => setMonths(Number(e.target.value))}>
            {[6, 12, 24, 36].map((m) => <option key={m} value={m}>{t('{n} bulan terakhir', { n: m })}</option>)}
          </select>
        </label>
      </div>
      <div className="kpis">
        <div className="kpi tone-accent"><div className="lbl">{t('Temuan baru')}</div><div className="val">{totals.opened}</div><div className="sub">{t('{n} bulan terakhir', { n: months })}</div></div>
        <div className="kpi tone-ok"><div className="lbl">{t('Ditutup tepat waktu')}</div><div className="val">{pct(totals.onTime, totals.withDue)}%</div><div className="sub">{t('{a} dari {b} yang punya batas waktu', { a: totals.onTime, b: totals.withDue })}</div></div>
        <div className="kpi tone-low"><div className="lbl">{t('Rata-rata lama penyelesaian')}</div><div className="val">{totals.days ?? '—'}</div><div className="sub">{t('hari, dari {n} temuan ditutup', { n: totals.closed })}</div></div>
        <div className={`kpi ${totals.late ? 'tone-high' : 'tone-muted'}`}><div className="lbl">{t('Terbuka dan terlambat')}</div><div className="val">{totals.late}</div><div className="sub">{t('dari {n} temuan terbuka', { n: totals.open })}</div></div>
      </div>

      <div className="panel">
        <h3>{t('Tren temuan per bulan')}</h3>
        <TrendChart trend={data.trend} />
      </div>

      <div className="grid2" style={{ marginTop: 16 }}>
        <div className="panel">
          <h3>{t('Umur temuan terbuka')}</h3>
          <Bars rows={data.aging} label={(a) => t(AGING[a.bucket])} value={(a) => a.n} color={(a) => AGING_COLOR[a.bucket]} total={totals.open} />
        </div>
        <div className="panel">
          <h3>{t('Penyelesaian per tingkat risiko')}</h3>
          <div className="tablebox flat">
            <table>
              <thead><tr><th>{t('Risiko')}</th><th className="num">{t('Ditutup')}</th><th className="num">{t('Rata-rata hari')}</th><th className="num">{t('Tepat waktu')}</th></tr></thead>
              <tbody>
                {RISKS.map((r) => {
                  const x = data.closing.find((c) => c.risk === r) || { closed: 0, days: null, on_time: 0, with_due: 0 };
                  return <tr key={r}><td><RiskPill value={r} /></td><td className="num">{x.closed}</td><td className="num">{x.days ?? '—'}</td><td className="num">{x.with_due ? `${pct(x.on_time, x.with_due)}%` : '—'}</td></tr>;
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="grid2" style={{ marginTop: 16 }}>
        <div className="panel">
          <h3>{t('Kategori temuan')}</h3>
          {data.byCategory.length ? <Bars rows={data.byCategory} label={(x) => (x.category === '-' ? t('Tanpa kategori') : t(x.category))} value={(x) => x.n} total={catTotal} /> : <Empty small>{t('Belum ada temuan pada periode ini.')}</Empty>}
        </div>
        <div className="panel">
          <h3>{t('Kategori akar masalah')}</h3>
          {data.byRootCause.length ? <Bars rows={data.byRootCause} label={(x) => (x.root_cause === '-' ? t('Tanpa kategori') : t(x.root_cause))} value={(x) => x.n} total={rcTotal} /> : <Empty small>{t('Belum ada temuan pada periode ini.')}</Empty>}
        </div>
      </div>

      <div className="panel" style={{ marginTop: 16 }}>
        <h3>{t('Temuan berulang')}</h3>
        <p className="t-sub" style={{ marginTop: 0 }}>{t('Kategori temuan yang sama muncul di lebih dari satu audit pada unit yang sama. Ini tanda perbaikan belum menyentuh akar masalah.')}</p>
        {data.repeats.length ? (
          <div className="tablebox flat">
            <table>
              <thead><tr><th>{t('Unit')}</th><th>{t('Kategori temuan')}</th><th className="num">{t('Jumlah audit')}</th><th className="num">{t('Jumlah temuan')}</th><th></th></tr></thead>
              <tbody>
                {data.repeats.map((x) => (
                  <tr key={`${x.unit}|${x.category}`}>
                    <td className="t-title">{x.unit}</td><td>{t(x.category)}</td><td className="num">{x.audits}</td><td className="num">{x.findings}</td>
                    <td><Link to={`/temuan?unit=${encodeURIComponent(x.unit)}&category=${encodeURIComponent(x.category)}`}>{t('Lihat temuan')}</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <Empty small>{t('Tidak ada temuan berulang.')}</Empty>}
      </div>

      <div className="panel" style={{ marginTop: 16 }}>
        <h3>{t('Perbandingan unit')}</h3>
        <div className="tablebox flat">
          <table>
            <thead><tr><th>{t('Unit')}</th><th className="num">{t('Temuan')}</th><th>{t('Selesai')}</th><th className="num">{t('Terlambat')}</th><th className="num">{t('Risiko tinggi terbuka')}</th></tr></thead>
            <tbody>
              {data.units.map((u) => (
                <tr key={u.unit}>
                  <td className="t-title">{u.unit}</td>
                  <td className="num">{u.total}</td>
                  <td><div className="hours-bar"><div className="track"><div className="fill" style={{ width: `${pct(u.done, u.total)}%`, background: 'var(--ok)' }} /></div><span>{pct(u.done, u.total)}%</span></div></td>
                  <td className={`num${u.overdue ? ' due-text' : ''}`}>{u.overdue}</td>
                  <td className="num">{u.high_open}</td>
                </tr>
              ))}
              {!data.units.length && <tr><td colSpan={5}><Empty small>{t('Belum ada temuan.')}</Empty></td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
