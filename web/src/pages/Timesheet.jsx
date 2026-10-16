import { useMemo, useState } from 'react';
import { Link, NavLink, Navigate, Route, Routes } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { canEdit, fmtDate } from '../util.js';
import { BusyButton, Empty, ErrorBox, Loading, Req, RowActions, Sheet, StatusPill, useLoad, useToast } from '../components/ui.jsx';
import { exportExcel } from '../exporters.js';
import { localeTag, t } from '../i18n.jsx';

const iso = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const addDays = (s, n) => iso(new Date(new Date(`${s}T12:00:00`).getTime() + n * 86400000));
// Senin pada minggu tanggal s.
const mondayOf = (s) => { const d = new Date(`${s}T12:00:00`); return addDays(s, -((d.getDay() + 6) % 7)); };
const fmtH = (h) => Number(h || 0).toLocaleString(localeTag(), { maximumFractionDigits: 2 });
const dayName = (s) => new Date(`${s}T12:00:00`).toLocaleDateString(localeTag(), { weekday: 'long', day: 'numeric', month: 'short' });
const thisYear = new Date().getFullYear();

export default function Timesheet() {
  const { user } = useAuth();
  const logger = canEdit(user);
  return (
    <>
      <div className="bar"><h2>{t('Timesheet')}</h2></div>
      <nav className="subtabs" aria-label={t('Timesheet')}>
        {logger && <NavLink to="/timesheet/jam">{t('Jam saya')}</NavLink>}
        {!logger && <NavLink to="/timesheet/jam">{t('Jam auditor')}</NavLink>}
        <NavLink to="/timesheet/realisasi">{t('Realisasi jam')}</NavLink>
      </nav>
      <Routes>
        <Route path="jam" element={<Week />} />
        <Route path="realisasi" element={<Summary />} />
        <Route path="*" element={<Navigate to="/timesheet/jam" replace />} />
      </Routes>
    </>
  );
}

// ---------------- Isian per minggu ----------------
function Week() {
  const { user } = useAuth();
  const logger = canEdit(user);
  const seesAll = ['admin', 'superadmin', 'manajemen'].includes(user.role);
  const toast = useToast();
  const [start, setStart] = useState(() => mondayOf(iso(new Date())));
  const [who, setWho] = useState(logger ? String(user.id) : 'all');
  const end = addDays(start, 6);
  const opts = useLoad(() => api.get('/timesheets/options'), []);
  const { data, error, loading, reload } = useLoad(() => api.get(`/timesheets?from=${start}&to=${end}&user_id=${who}`), [start, who]);
  const [sheet, setSheet] = useState(null);
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  const total = (data?.entries || []).reduce((s, e) => s + e.hours, 0);
  const mine = who === String(user.id);

  async function remove(e) {
    try {
      await api.del(`/timesheets/${e.id}`);
      toast(t('Isian dihapus'));
      reload();
    } catch (err) { toast(err.message, 'error'); }
  }

  return (
    <>
      <div className="filters one-line">
        <button className="btn" onClick={() => setStart(addDays(start, -7))} aria-label={t('Minggu sebelumnya')}>‹</button>
        <span className="week-label">{fmtDate(start)} – {fmtDate(end)}</span>
        <button className="btn" onClick={() => setStart(addDays(start, 7))} aria-label={t('Minggu berikutnya')}>›</button>
        <button className="btn ghost" onClick={() => setStart(mondayOf(iso(new Date())))}>{t('Minggu ini')}</button>
        {seesAll && (
          <select id="ts-user" aria-label={t('Auditor')} value={who} onChange={(e) => setWho(e.target.value)}>
            {logger && <option value={user.id}>{t('Jam saya')}</option>}
            <option value="all">{t('Semua auditor')}</option>
            {(opts.data?.users || []).filter((u) => u.id !== user.id).map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        )}
        <span className="spacer" />
        <span className="t-sub">{t('Total minggu ini: {h} jam', { h: fmtH(total) })}</span>
        {logger && mine && <button className="btn primary" onClick={() => setSheet({ work_date: iso(new Date()) <= end && iso(new Date()) >= start ? iso(new Date()) : start })}>{t('Catat jam')}</button>}
      </div>
      {loading && !data ? <Loading /> : error ? <ErrorBox error={error} retry={reload} /> : (
        <div className="week">
          {days.map((d) => {
            const rows = data.entries.filter((e) => e.work_date === d);
            const sum = rows.reduce((s, e) => s + e.hours, 0);
            const future = d > iso(new Date());
            return (
              <section key={d} className={`week-day${d === iso(new Date()) ? ' today' : ''}`}>
                <header>
                  <b>{dayName(d)}</b>
                  <span className={sum > 10 ? 'due-text' : 't-sub'}>{sum ? t('{h} jam', { h: fmtH(sum) }) : ''}</span>
                  {logger && mine && !future && <button className="btn ghost small" onClick={() => setSheet({ work_date: d })}>{t('Tambah')}</button>}
                </header>
                {rows.length ? (
                  <ul className="ts-list">
                    {rows.map((e) => (
                      <li key={e.id}>
                        <span className="ts-h">{fmtH(e.hours)}</span>
                        <span>
                          <span className="t-title">{e.audit_id ? <Link to={`/audit/${e.audit_id}`}>{e.audit_code} · {e.audit_title}</Link> : t('Di luar audit')}</span>
                          <span className="t-sub"> · {t(e.activity)}{who === 'all' ? ` · ${e.user_name}` : ''}</span>
                          {e.note && <div className="t-sub">{e.note}</div>}
                        </span>
                        {(e.user_id === user.id || ['admin', 'superadmin'].includes(user.role)) && logger
                          ? <RowActions onEdit={() => setSheet(e)} onDelete={() => remove(e)} question={t('Hapus isian ini?')} /> : <span />}
                      </li>
                    ))}
                  </ul>
                ) : <div className="t-sub ts-empty">{future ? '' : t('Belum ada isian.')}</div>}
              </section>
            );
          })}
        </div>
      )}
      {sheet && opts.data && <EntryForm entry={sheet} opts={opts.data} onClose={() => setSheet(null)} onSaved={reload} />}
    </>
  );
}

function EntryForm({ entry, opts, onClose, onSaved }) {
  const toast = useToast();
  const isNew = !entry.id;
  const [f, setF] = useState({
    work_date: entry.work_date, audit_id: entry.audit_id ?? (isNew ? opts.audits[0]?.id ?? '' : ''),
    activity: entry.activity || '', hours: entry.hours ?? '', note: entry.note || '',
  });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const activities = f.audit_id ? opts.audit_activities : opts.other_activities;
  const activity = activities.includes(f.activity) ? f.activity : activities[0];
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const body = { ...f, activity, audit_id: f.audit_id ? Number(f.audit_id) : null, hours: Number(String(f.hours).replace(',', '.')) };
      if (isNew) await api.post('/timesheets', body);
      else await api.patch(`/timesheets/${entry.id}`, body);
      toast(t('Jam kerja disimpan'));
      onClose();
      onSaved();
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  }
  return (
    <Sheet title={isNew ? t('Catat jam kerja') : t('Ubah jam kerja')} onClose={onClose}>
      <form className="form" onSubmit={submit}>
        <label><span>{t('Tanggal')} <Req /></span><input id="ts-date" type="date" required max={iso(new Date())} value={f.work_date} onChange={set('work_date')} /></label>
        <label><span>{t('Jam')} <Req /></span><input id="ts-hours" required inputMode="decimal" value={f.hours} onChange={set('hours')} placeholder="7,5" /><span className="hint">{t('Kelipatan 15 menit, misalnya 0,25 atau 1,5.')}</span></label>
        <label className="full">{t('Audit')}
          <select id="ts-audit" value={f.audit_id} onChange={set('audit_id')}>
            <option value="">{t('Di luar audit (pelatihan, administrasi, rapat)')}</option>
            {opts.audits.map((a) => <option key={a.id} value={a.id}>{a.code} · {a.title}{a.status === 'Selesai' ? ` (${t('Selesai')})` : ''}</option>)}
          </select>
        </label>
        <label className="full"><span>{t('Kegiatan')} <Req /></span>
          <select id="ts-activity" value={activity} onChange={set('activity')}>{activities.map((x) => <option key={x} value={x}>{t(x)}</option>)}</select>
        </label>
        <label className="full">{t('Keterangan')}<input id="ts-note" value={f.note} onChange={set('note')} maxLength={500} placeholder={t('Contoh: uji petik dokumen pembayaran')} /></label>
        {error && <div className="error-text full" role="alert">{error}</div>}
        <div className="form-foot full">
          <button type="button" className="btn" onClick={onClose}>{t('Batal')}</button>
          <button className="btn primary" disabled={busy}>{t('Simpan')}</button>
        </div>
      </form>
    </Sheet>
  );
}

// ---------------- Realisasi jam ----------------
export function HoursBar({ actual, budget }) {
  const p = budget ? Math.round((actual / budget) * 100) : 0;
  const tone = !budget ? 'var(--accent)' : p > 100 ? 'var(--high)' : p > 85 ? 'var(--med)' : 'var(--ok)';
  return (
    <div className="hours-bar" title={budget ? t('{a} dari {b} jam ({p}%)', { a: fmtH(actual), b: fmtH(budget), p }) : undefined}>
      <div className="track"><div className="fill" style={{ width: `${budget ? Math.min(100, p) : actual ? 100 : 0}%`, background: tone }} /></div>
      <span className={p > 100 ? 'due-text' : ''}>{fmtH(actual)}{budget ? ` / ${fmtH(budget)}` : ''}</span>
    </div>
  );
}

function Summary() {
  const [year, setYear] = useState(thisYear);
  const { data, error, loading, reload } = useLoad(() => api.get(`/timesheets/summary?year=${year}`), [year]);
  const months = useMemo(() => Array.from({ length: 12 }, (_, i) => new Date(2000, i, 1).toLocaleDateString(localeTag(), { month: 'short' })), []);
  if (loading && !data) return <Loading />;
  if (error) return <ErrorBox error={error} retry={reload} />;
  const total = data.users.reduce((s, u) => s + u.hours, 0);
  const auditHours = data.users.reduce((s, u) => s + u.audit_hours, 0);
  const maxMonth = Math.max(1, ...data.months);
  const maxAct = Math.max(1, ...data.activities.map((a) => a.hours));
  function exportXls() {
    return exportExcel(`realisasi-jam-${year}`, [
      { name: t('Per audit'), title: t('Realisasi jam per audit {year}', { year }), columns: [
        { header: t('Kode'), key: 'code', width: 15 }, { header: t('Audit'), key: 'title', width: 44, wrap: true }, { header: t('Unit'), key: 'unit', width: 24 },
        { header: t('Status'), key: 'status', width: 14 }, { header: t('Anggaran jam'), key: 'budget', width: 14 }, { header: t('Realisasi jam'), key: 'actual', width: 14 }],
      rows: data.audits.map((a) => ({ ...a, status: t(a.status) })) },
      { name: t('Per auditor'), title: t('Realisasi jam per auditor {year}', { year }), columns: [
        { header: t('Auditor'), key: 'name', width: 28 }, { header: t('Jam audit'), key: 'audit_hours', width: 14 }, { header: t('Jam di luar audit'), key: 'other_hours', width: 16 },
        { header: t('Total'), key: 'hours', width: 12 }, { header: t('Anggaran di rencana'), key: 'budget', width: 18 }],
      rows: data.users },
    ]);
  }
  return (
    <>
      <div className="filters one-line">
        <label className="date-filter">{t('Tahun')}
          <select id="ts-year" value={year} onChange={(e) => setYear(Number(e.target.value))}>{[thisYear - 1, thisYear, thisYear + 1].map((y) => <option key={y} value={y}>{y}</option>)}</select>
        </label>
        <span className="spacer" />
        {data.users.length > 0 && <BusyButton onClick={exportXls}>{t('Ekspor Excel')}</BusyButton>}
      </div>
      {!data.users.length && !data.audits.length ? <Empty title={t('Belum ada jam kerja tercatat di {year}', { year })}>{t('Auditor mencatat jamnya di menu Timesheet → Jam saya.')}</Empty> : (
        <>
          <div className="kpis">
            <div className="kpi tone-accent"><div className="lbl">{t('Total jam tercatat')}</div><div className="val">{fmtH(total)}</div><div className="sub">{t('{n} auditor', { n: data.users.length })}</div></div>
            <div className="kpi tone-ok"><div className="lbl">{t('Jam untuk audit')}</div><div className="val">{total ? Math.round((auditHours / total) * 100) : 0}%</div><div className="sub">{t('{h} jam', { h: fmtH(auditHours) })}</div></div>
            <div className="kpi tone-low"><div className="lbl">{t('Audit dengan jam tercatat')}</div><div className="val">{data.audits.filter((a) => a.actual).length}</div><div className="sub">{t('tahun {year}', { year })}</div></div>
            <div className="kpi tone-muted"><div className="lbl">{t('Melebihi anggaran')}</div><div className="val">{data.audits.filter((a) => a.budget && a.actual > a.budget).length}</div><div className="sub">{t('audit')}</div></div>
          </div>
          <div className="grid2">
            <div className="panel">
              <h3>{t('Jam per bulan')}</h3>
              <div className="month-bars">
                {data.months.map((h, i) => (
                  <div key={i} title={t('{h} jam', { h: fmtH(h) })}><span className="mb-v">{h ? fmtH(h) : ''}</span><i style={{ height: `${(h / maxMonth) * 100}%` }} /><span className="mb-l">{months[i]}</span></div>
                ))}
              </div>
            </div>
            <div className="panel">
              <h3>{t('Jam per kegiatan')}</h3>
              {data.activities.map((a) => (
                <div className="riskbar load" key={a.activity}><span>{t(a.activity)}</span><div className="track"><div className="fill" style={{ width: `${(a.hours / maxAct) * 100}%`, background: 'var(--accent)' }} /></div><span className="n">{t('{h} jam', { h: fmtH(a.hours) })}</span></div>
              ))}
            </div>
          </div>
          <div className="panel" style={{ marginTop: 16 }}>
            <h3>{t('Realisasi per auditor')}</h3>
            <p className="t-sub" style={{ marginTop: 0 }}>{t('Dibanding anggaran jam di rencana audit tahunan. Kapasitas {n} jam per auditor per tahun.', { n: fmtH(data.capacity) })}</p>
            <div className="tablebox flat">
              <table>
                <thead><tr><th>{t('Auditor')}</th><th className="num">{t('Jam audit')}</th><th className="num">{t('Jam di luar audit')}</th><th>{t('Realisasi audit / anggaran')}</th><th>{t('Total / kapasitas')}</th></tr></thead>
                <tbody>
                  {data.users.map((u) => (
                    <tr key={u.id}>
                      <td className="t-title">{u.name}</td>
                      <td className="num">{fmtH(u.audit_hours)}</td>
                      <td className="num">{fmtH(u.other_hours)}</td>
                      <td><HoursBar actual={u.audit_hours} budget={u.budget} /></td>
                      <td><HoursBar actual={u.hours} budget={data.capacity} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div className="panel" style={{ marginTop: 16 }}>
            <h3>{t('Realisasi per audit')}</h3>
            <div className="tablebox flat">
              <table>
                <thead><tr><th>{t('Audit')}</th><th>{t('Status')}</th><th>{t('Realisasi / anggaran jam')}</th></tr></thead>
                <tbody>
                  {data.audits.map((a) => (
                    <tr key={a.id}>
                      <td><Link to={`/audit/${a.id}`} className="t-title">{a.title}</Link><div className="t-sub"><span className="code">{a.code}</span> · {a.unit}</div></td>
                      <td><StatusPill value={a.status} /></td>
                      <td>{a.budget || a.actual ? <HoursBar actual={a.actual} budget={a.budget} /> : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </>
  );
}

// Panel jam kerja di halaman detail audit: realisasi dibanding anggaran di rencana, per orang dan per kegiatan.
export function AuditHours({ auditId }) {
  const { data } = useLoad(() => api.get(`/timesheets/audit/${auditId}`), [auditId]);
  if (!data || (!data.actual && !data.budget)) return null;
  return (
    <div className="panel">
      <div className="bar" style={{ marginBottom: 8 }}>
        <h3 style={{ margin: 0 }}>{t('Jam kerja')}</h3>
        <Link to="/timesheet/realisasi">{t('Realisasi jam')}</Link>
      </div>
      <HoursBar actual={data.actual} budget={data.budget} />
      <p className="t-sub" style={{ margin: '6px 0 10px' }}>{data.budget ? t('Realisasi {a} dari anggaran {b} jam.', { a: fmtH(data.actual), b: fmtH(data.budget) }) : t('{h} jam tercatat. Audit ini tidak punya anggaran jam di rencana.', { h: fmtH(data.actual) })}</p>
      <div className="facts">
        {data.users.map((u) => <span key={u.id}>{u.name}: <b>{fmtH(u.hours)}</b></span>)}
      </div>
      {data.activities.length > 0 && <div className="facts t-sub" style={{ marginTop: 6 }}>{data.activities.map((x) => <span key={x.activity}>{t(x.activity)}: {fmtH(x.hours)}</span>)}</div>}
    </div>
  );
}
