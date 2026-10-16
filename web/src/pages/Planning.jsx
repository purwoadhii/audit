import { useMemo, useState } from 'react';
import { Link, NavLink, Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { useSettings } from '../settings.jsx';
import { canEdit, fmtDate, slug } from '../util.js';
import { BusyButton, ConfirmDelete, Empty, ErrorBox, Loading, Pager, Req, ReqNote, RowActions, Sheet, StatusPill, useLoad, usePaged, useToast } from '../components/ui.jsx';
import ComboInput from '../components/ComboInput.jsx';
import AuditForm from '../components/AuditForm.jsx';
import CompanySelect from '../components/CompanySelect.jsx';
import { companyMode } from '../company.js';
import { useMenu } from '../menus.js';
import { exportExcel } from '../exporters.js';
import { N_, localeTag, t } from '../i18n.jsx';

// Matriks risiko 5×5 (kemungkinan × dampak). Batas tingkat sama dengan server (constants.js).
export const LIKELIHOOD = [N_('Sangat jarang'), N_('Jarang'), N_('Mungkin terjadi'), N_('Sering'), N_('Hampir pasti')];
export const IMPACT = [N_('Sangat kecil'), N_('Kecil'), N_('Sedang'), N_('Besar'), N_('Sangat besar')];
export const LEVELS = [N_('Rendah'), N_('Sedang'), N_('Tinggi'), N_('Sangat tinggi')];
export const levelOf = (score) => (score >= 20 ? 'Sangat tinggi' : score >= 10 ? 'Tinggi' : score >= 5 ? 'Sedang' : 'Rendah');
const CYCLE = { 'Sangat tinggi': 1, Tinggi: 1, Sedang: 2, Rendah: 3 };
const QUARTERS = [1, 2, 3, 4];
const thisYear = new Date().getFullYear();
const YEARS = [thisYear - 1, thisYear, thisYear + 1, thisYear + 2];

export const LevelPill = ({ level, score }) => (level
  ? <span className={`pill lvl-${slug(level)}`}>{score ? `${score} · ` : ''}{t(level)}</span>
  : <span className="t-sub">{t('Belum dinilai')}</span>);

// Status penugasan dalam rencana: dibatalkan, belum dimulai, atau status audit yang dibuat dari rencana.
const planStatus = (i) => (i.cancelled ? 'Dibatalkan' : i.audit_status || 'Belum dimulai');

// Tanggal awal dan akhir triwulan, untuk mengisi periode audit yang dibuat dari rencana.
const quarterDates = (year, q) => {
  const start = `${year}-${String((q - 1) * 3 + 1).padStart(2, '0')}-01`;
  const end = new Date(Date.UTC(year, q * 3, 0)).toISOString().slice(0, 10);
  return { start, end };
};

export default function Planning() {
  const [year, setYear] = useState(thisYear);
  const on = useMenu();
  const first = ['rencana', 'risiko', 'universe'].find((k) => on(`perencanaan.${k}`)) || 'rencana';
  return (
    <>
      <div className="bar"><h2>{t('Perencanaan audit')}</h2></div>
      <nav className="subtabs" aria-label={t('Perencanaan audit')}>
        {on('perencanaan.rencana') && <NavLink to="/perencanaan/rencana">{t('Rencana tahunan')}</NavLink>}
        {on('perencanaan.risiko') && <NavLink to="/perencanaan/risiko">{t('Penilaian risiko')}</NavLink>}
        {on('perencanaan.universe') && <NavLink to="/perencanaan/universe">{t('Audit universe')}</NavLink>}
      </nav>
      <Routes>
        {on('perencanaan.rencana') && <Route path="rencana" element={<Plan year={year} setYear={setYear} />} />}
        {on('perencanaan.risiko') && <Route path="risiko" element={<Risks year={year} setYear={setYear} />} />}
        {on('perencanaan.universe') && <Route path="universe" element={<Universe />} />}
        <Route path="*" element={<Navigate to={`/perencanaan/${first}`} replace />} />
      </Routes>
    </>
  );
}

function YearSelect({ year, setYear }) {
  return (
    <label className="date-filter">{t('Tahun')}
      <select id="plan-year" value={year} onChange={(e) => setYear(Number(e.target.value))}>{YEARS.map((y) => <option key={y} value={y}>{y}</option>)}</select>
    </label>
  );
}

// ---------------- Audit universe ----------------
function Universe() {
  const { user } = useAuth();
  const showRisk = useMenu()('perencanaan.risiko');
  const { settings } = useSettings();
  const editor = canEdit(user);
  const toast = useToast();
  const { data, error, loading, reload } = useLoad(() => api.get('/planning/entities'), []);
  const [f, setF] = useState({ q: '', kind: '', unit: '' });
  const [sheet, setSheet] = useState(null); // {} baru atau entitas yang diubah
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const kinds = useMemo(() => [...new Set([...settings.universe_kinds, ...(data || []).map((e) => e.kind)])], [data, settings]);
  const units = useMemo(() => [...new Set((data || []).map((e) => e.unit).filter(Boolean))].sort(), [data]);
  const rows = useMemo(() => (data || []).filter((e) => (!f.kind || e.kind === f.kind) && (!f.unit || e.unit === f.unit)
    && (!f.q || `${e.name} ${e.owner || ''} ${e.unit || ''}`.toLowerCase().includes(f.q.toLowerCase()))), [data, f]);
  const paged = usePaged(rows, JSON.stringify(f));

  async function remove(e) {
    try {
      await api.del(`/planning/entities/${e.id}`);
      toast(t('Area audit dihapus'));
      reload();
    } catch (err) { toast(err.message, 'error'); }
  }

  if (loading && !data) return <Loading />;
  if (error) return <ErrorBox error={error} retry={reload} />;
  return (
    <>
      <p className="t-sub intro">{showRisk
        ? t('Audit universe adalah daftar semua area yang bisa diaudit: proses bisnis, sistem, vendor, lokasi, dan unit organisasi. Setiap area dinilai risikonya setiap tahun untuk menentukan prioritas audit.')
        : t('Audit universe adalah daftar semua area yang bisa diaudit: proses bisnis, sistem, vendor, lokasi, dan unit organisasi. Area di sini bisa dipilih saat menyusun rencana audit tahunan.')}</p>
      <div className="filters one-line">
        <input id="ent-q" placeholder={t('Cari nama area, pemilik, atau unit')} value={f.q} onChange={set('q')} />
        <select id="ent-kind" aria-label={t('Jenis area')} value={f.kind} onChange={set('kind')}><option value="">{t('Semua jenis')}</option>{kinds.map((k) => <option key={k} value={k}>{t(k)}</option>)}</select>
        <select id="ent-unit" aria-label={t('Unit')} value={f.unit} onChange={set('unit')}><option value="">{t('Semua unit')}</option>{units.map((u) => <option key={u} value={u}>{u}</option>)}</select>
        {editor && <button className="btn primary" onClick={() => setSheet({})}>{t('Tambah area')}</button>}
      </div>
      {!data.length ? <Empty title={t('Audit universe masih kosong')}>{t('Tambahkan area yang bisa diaudit, misalnya proses pengadaan, sistem ERP, atau vendor utama.')}</Empty> : (
        <>
          <div className="tablebox">
            <table>
              <thead><tr><th>{t('Area')}</th><th>{t('Jenis area')}</th><th>{t('Unit')}</th><th>{t('Pemilik proses')}</th><th>{t('Audit terakhir')}</th><th className="num">{t('Jumlah audit')}</th>{editor && <th className="act-col">{t('Aksi')}</th>}</tr></thead>
              <tbody>
                {paged.rows.map((e) => (
                  <tr key={e.id} className={editor ? 'click' : ''} onClick={() => editor && setSheet(e)}>
                    <td><div className="t-title">{e.name}</div>{!e.active && <span className="pill">{t('Nonaktif')}</span>}{e.description && <div className="t-sub clamp">{e.description}</div>}</td>
                    <td>{t(e.kind)}</td>
                    <td>{e.unit || '—'}</td>
                    <td>{e.owner || '—'}</td>
                    <td className="num">{fmtDate(e.last_audit)}</td>
                    <td className="num">{e.audits}</td>
                    {editor && <td className="act-col"><RowActions onEdit={() => setSheet(e)} onDelete={() => remove(e)} question={showRisk ? t('Hapus area ini beserta penilaian risikonya? Audit dan rencana yang terkait tetap ada.') : t('Hapus area ini? Audit dan rencana yang terkait tetap ada.')} /></td>}
                  </tr>
                ))}
                {!rows.length && <tr><td colSpan={7}><Empty small>{t('Tidak ada area yang cocok.')}</Empty></td></tr>}
              </tbody>
            </table>
          </div>
          <Pager paged={paged} />
        </>
      )}
      {sheet && <EntityForm entity={sheet.id ? sheet : null} kinds={kinds} onClose={() => setSheet(null)} onSaved={reload} />}
    </>
  );
}

function EntityForm({ entity, kinds, onClose, onSaved }) {
  const { settings } = useSettings();
  const { user } = useAuth();
  const cm = companyMode(settings, user);
  const toast = useToast();
  const isNew = !entity;
  const [f, setF] = useState({
    name: entity?.name || '', kind: entity?.kind || kinds[0] || '', unit: entity?.unit || '', owner: entity?.owner || '',
    description: entity?.description || '', active: entity ? entity.active : true, company: entity?.company || cm.view,
  });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const { company, ...plain } = f;
      const body = cm.on ? f : plain;
      if (isNew) await api.post('/planning/entities', body);
      else await api.patch(`/planning/entities/${entity.id}`, body);
      toast(t('Area audit disimpan'));
      onClose();
      onSaved();
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  }
  return (
    <Sheet title={isNew ? t('Area audit baru') : t('Ubah area audit')} onClose={onClose}>
      <form className="form" onSubmit={submit}>
        <ReqNote />
        <label className="full"><span>{t('Nama area')} <Req /></span><input id="e-name" required value={f.name} onChange={set('name')} placeholder={t('Contoh: Proses pengadaan barang')} /></label>
        <label><span>{t('Jenis area')} <Req /></span><select id="e-kind" required value={f.kind} onChange={set('kind')}>{kinds.map((k) => <option key={k} value={k}>{t(k)}</option>)}</select></label>
        <CompanySelect id="e-company" value={f.company} onChange={set('company')} full />
        <label>{t('Unit')}<ComboInput id="e-unit" options={settings.units} value={f.unit} onChange={set('unit')} placeholder={t('Divisi Pengadaan')} /></label>
        <label>{t('Pemilik proses')}<input id="e-owner" value={f.owner} onChange={set('owner')} placeholder={t('Contoh: Kepala Divisi Pengadaan')} /></label>
        <label className="check-row"><input id="e-active" type="checkbox" checked={f.active} onChange={set('active')} />{t('Aktif dinilai dan direncanakan')}</label>
        <label className="full">{t('Keterangan')}<textarea id="e-desc" value={f.description} onChange={set('description')} placeholder={t('Ruang lingkup area, sistem yang dipakai, atau risiko utama')} /></label>
        {error && <div className="error-text full" role="alert">{error}</div>}
        <div className="form-foot full">
          <button type="button" className="btn" onClick={onClose}>{t('Batal')}</button>
          <button className="btn primary" disabled={busy}>{t('Simpan')}</button>
        </div>
      </form>
    </Sheet>
  );
}

// ---------------- Penilaian risiko ----------------
function Risks({ year, setYear }) {
  const { user } = useAuth();
  const editor = canEdit(user);
  const toast = useToast();
  const nav = useNavigate();
  const { data, error, loading, reload } = useLoad(() => api.get(`/planning/risks?year=${year}`), [year]);
  const [cell, setCell] = useState(null); // [kemungkinan, dampak] yang dipilih di matriks
  const [level, setLevel] = useState('');
  const [assess, setAssess] = useState(null);
  const [adding, setAdding] = useState(null);

  const rows = useMemo(() => (data || []).filter((e) => (!cell || (e.likelihood === cell[0] && e.impact === cell[1])) && (!level || (level === '-' ? !e.level : e.level === level))), [data, cell, level]);
  const paged = usePaged(rows, `${year}${cell}${level}`);
  if (loading && !data) return <Loading />;
  if (error) return <ErrorBox error={error} retry={reload} />;
  const count = (l, i) => data.filter((e) => e.likelihood === l && e.impact === i).length;
  const assessed = data.filter((e) => e.score).length;
  const due = data.filter((e) => e.due && !e.plan_item_id).length;

  if (!data.length) {
    return <Empty title={t('Audit universe masih kosong')} action={<Link className="btn primary" to="/perencanaan/universe">{t('Buka audit universe')}</Link>}>{t('Tambahkan area yang bisa diaudit dulu, lalu nilai risikonya di sini.')}</Empty>;
  }
  return (
    <>
      <div className="filters one-line">
        <YearSelect year={year} setYear={setYear} />
        <select id="risk-level" aria-label={t('Tingkat risiko')} value={level} onChange={(e) => setLevel(e.target.value)}>
          <option value="">{t('Semua tingkat risiko')}</option>{LEVELS.map((l) => <option key={l} value={l}>{t(l)}</option>)}<option value="-">{t('Belum dinilai')}</option>
        </select>
        {cell && <button className="btn" onClick={() => setCell(null)}>{t('Hapus pilihan matriks')}</button>}
      </div>
      <div className="risk-grid">
        <div className="panel">
          <h3>{t('Matriks risiko {year}', { year })}</h3>
          <div className="heat" role="grid" aria-label={t('Matriks risiko')}>
            <div className="heat-y">{t('Kemungkinan')}</div>
            <div className="heat-body">
              {[5, 4, 3, 2, 1].map((l) => (
                <div className="heat-row" key={l} role="row">
                  <span className="heat-lbl" title={t(LIKELIHOOD[l - 1])}>{l}</span>
                  {[1, 2, 3, 4, 5].map((i) => {
                    const n = count(l, i);
                    const on = cell && cell[0] === l && cell[1] === i;
                    return (
                      <button type="button" role="gridcell" key={i} className={`heat-cell lvl-${slug(levelOf(l * i))}${on ? ' on' : ''}`}
                        aria-label={t('Kemungkinan {l}, dampak {i}: {n} area', { l, i, n })} onClick={() => setCell(on ? null : [l, i])}>
                        {n || ''}
                      </button>
                    );
                  })}
                </div>
              ))}
              <div className="heat-row heat-x"><span className="heat-lbl" />{[1, 2, 3, 4, 5].map((i) => <span key={i} title={t(IMPACT[i - 1])}>{i}</span>)}</div>
              <div className="heat-xlbl">{t('Dampak')}</div>
            </div>
          </div>
          <div className="legend">{LEVELS.map((l) => <span key={l}><i className={`lvl-${slug(l)}`} />{t(l)}</span>)}</div>
        </div>
        <div className="panel">
          <h3>{t('Ringkasan {year}', { year })}</h3>
          <div className="stat-list">
            <div><b>{assessed}/{data.length}</b><span>{t('area sudah dinilai')}</span></div>
            {LEVELS.slice().reverse().map((l) => <div key={l}><b>{data.filter((e) => e.level === l).length}</b><span><LevelPill level={l} /></span></div>)}
            <div><b>{due}</b><span>{t('area perlu diaudit tahun ini tapi belum masuk rencana')}</span></div>
          </div>
          <p className="t-sub">{t('Siklus audit yang disarankan: risiko Sangat tinggi dan Tinggi setiap tahun, Sedang setiap 2 tahun, Rendah setiap 3 tahun, dihitung dari audit terakhir.')}</p>
        </div>
      </div>
      <div className="tablebox">
        <table>
          <thead><tr><th>{t('Area')}</th><th className="num">{t('Kemungkinan')}</th><th className="num">{t('Dampak')}</th><th>{t('Skor risiko')}</th><th>{t('Audit terakhir')}</th><th>{t('Audit berikutnya')}</th><th>{t('Rencana {year}', { year })}</th>{editor && <th className="act-col">{t('Aksi')}</th>}</tr></thead>
          <tbody>
            {paged.rows.map((e) => (
              <tr key={e.id}>
                <td><div className="t-title">{e.name}</div><div className="t-sub">{t(e.kind)}{e.unit ? ` · ${e.unit}` : ''}</div>{e.notes && <div className="t-sub clamp">“{e.notes}”</div>}</td>
                <td className="num">{e.likelihood ? <span title={t(LIKELIHOOD[e.likelihood - 1])}>{e.likelihood}</span> : '—'}</td>
                <td className="num">{e.impact ? <span title={t(IMPACT[e.impact - 1])}>{e.impact}</span> : '—'}</td>
                <td><LevelPill level={e.level} score={e.score} /></td>
                <td className="num">{fmtDate(e.last_audit)}</td>
                <td>{e.next_audit_year ? <span className={e.due && !e.plan_item_id ? 'due-text' : ''}>{e.due ? t('Tahun ini') : e.next_audit_year}</span> : '—'}</td>
                <td>{e.plan_item_id ? <Link to="/perencanaan/rencana">{t('Sudah direncanakan')}</Link> : editor && e.score
                  ? <button className="btn small" onClick={() => setAdding({ entity: e })}>{t('Masukkan ke rencana')}</button> : '—'}</td>
                {editor && <td className="act-col"><button className="btn small" onClick={() => setAssess(e)}>{e.score ? t('Nilai ulang') : t('Nilai')}</button></td>}
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={8}><Empty small>{t('Tidak ada area yang cocok.')}</Empty></td></tr>}
          </tbody>
        </table>
      </div>
      <Pager paged={paged} />
      {assess && <RiskForm entity={assess} year={year} onClose={() => setAssess(null)} onSaved={reload} />}
      {adding && <PlanItemForm year={year} entity={adding.entity} onClose={() => setAdding(null)} onSaved={() => { toast(t('Masuk ke rencana {year}', { year })); nav('/perencanaan/rencana'); }} />}
    </>
  );
}

function RiskForm({ entity, year, onClose, onSaved }) {
  const toast = useToast();
  const [f, setF] = useState({ likelihood: entity.likelihood || 3, impact: entity.impact || 3, notes: entity.notes || '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const score = f.likelihood * f.impact;
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    try {
      await api.put(`/planning/risks/${entity.id}/${year}`, f);
      toast(t('Penilaian risiko disimpan'));
      onClose();
      onSaved();
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  }
  const Scale = ({ k, labels }) => (
    <div className="scale" role="radiogroup">
      {labels.map((l, i) => (
        <button type="button" key={l} role="radio" aria-checked={f[k] === i + 1} className={f[k] === i + 1 ? 'on' : ''} onClick={() => setF({ ...f, [k]: i + 1 })}>
          <b>{i + 1}</b><span>{t(l)}</span>
        </button>
      ))}
    </div>
  );
  return (
    <Sheet title={t('Penilaian risiko {year}: {name}', { year, name: entity.name })} onClose={onClose}>
      <form className="form" onSubmit={submit}>
        <div className="full"><div className="lbl-strong">{t('Kemungkinan')}</div><span className="hint">{t('Seberapa mungkin risiko di area ini terjadi dalam setahun.')}</span><Scale k="likelihood" labels={LIKELIHOOD} /></div>
        <div className="full"><div className="lbl-strong">{t('Dampak')}</div><span className="hint">{t('Seberapa besar akibatnya bagi keuangan, operasional, kepatuhan, atau reputasi bila terjadi.')}</span><Scale k="impact" labels={IMPACT} /></div>
        <div className="full score-line">{t('Skor risiko')}: <LevelPill level={levelOf(score)} score={score} /> <span className="t-sub">{t('Audit disarankan setiap {n} tahun.', { n: CYCLE[levelOf(score)] })}</span></div>
        <label className="full">{t('Alasan penilaian')}<textarea id="r-notes" value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} placeholder={t('Contoh: nilai transaksi besar, ada temuan berulang, sistem baru diganti')} /></label>
        {error && <div className="error-text full" role="alert">{error}</div>}
        <div className="form-foot full">
          <button type="button" className="btn" onClick={onClose}>{t('Batal')}</button>
          <button className="btn primary" disabled={busy}>{t('Simpan penilaian')}</button>
        </div>
      </form>
    </Sheet>
  );
}

// ---------------- Rencana audit tahunan ----------------
function Plan({ year, setYear }) {
  const { user } = useAuth();
  const showRisk = useMenu()('perencanaan.risiko');
  const editor = canEdit(user);
  const toast = useToast();
  const nav = useNavigate();
  const { data, error, loading, reload } = useLoad(() => api.get(`/planning/plan?year=${year}`), [year]);
  const [sheet, setSheet] = useState(null);
  const [creating, setCreating] = useState(null); // penugasan yang dibuatkan audit
  const [q, setQ] = useState('');
  const [quarter, setQuarter] = useState('');
  const rows = useMemo(() => (data?.items || []).filter((i) => (!quarter || i.quarter === Number(quarter))
    && (!q || `${i.title} ${i.unit} ${i.entity_name || ''} ${i.lead_name || ''}`.toLowerCase().includes(q.toLowerCase()))), [data, q, quarter]);
  const paged = usePaged(rows, `${year}${q}${quarter}`);

  async function remove(i) {
    try {
      await api.del(`/planning/plan/${i.id}`);
      toast(t('Rencana dihapus'));
      reload();
    } catch (err) { toast(err.message, 'error'); }
  }
  function exportPlan() {
    return exportExcel(`rencana-audit-${year}`, [{
      name: t('Rencana {year}', { year }),
      title: t('Rencana audit tahunan {year}', { year }),
      columns: [
        { header: t('Triwulan'), key: 'quarter', width: 9 },
        { header: t('Judul audit'), key: 'title', width: 40, wrap: true },
        { header: t('Area'), key: 'entity_name', width: 28, wrap: true },
        { header: t('Unit'), key: 'unit', width: 22 },
        { header: t('Jenis audit'), key: 'type', width: 18 },
        ...(showRisk ? [{ header: t('Skor risiko'), key: 'risk', width: 18 }] : []),
        { header: t('Ketua tim'), key: 'lead_name', width: 20 },
        { header: t('Tim dan jam'), key: 'team', width: 40, wrap: true },
        { header: t('Anggaran jam'), key: 'hours', width: 12 },
        { header: t('Status'), key: 'status', width: 16 },
        { header: t('Audit'), key: 'audit_code', width: 15 },
      ],
      rows: data.items.map((i) => ({
        ...i, quarter: `Q${i.quarter}`, type: t(i.type), entity_name: i.entity_name || '', lead_name: i.lead_name || '',
        risk: i.score ? `${i.score} · ${t(i.level)}` : '', team: i.members.map((m) => `${m.name} (${m.hours})`).join(', '),
        status: t(planStatus(i)), audit_code: i.audit_code || '',
      })),
    }]);
  }

  if (loading && !data) return <Loading />;
  if (error) return <ErrorBox error={error} retry={reload} />;
  const s = data.summary;
  const pct = s.planned ? Math.round((s.done / s.planned) * 100) : 0;
  return (
    <>
      <div className="filters one-line">
        <YearSelect year={year} setYear={setYear} />
        <input id="plan-q" placeholder={t('Cari judul, area, unit, atau ketua tim')} value={q} onChange={(e) => setQ(e.target.value)} />
        <select id="plan-quarter" aria-label={t('Triwulan')} value={quarter} onChange={(e) => setQuarter(e.target.value)}>
          <option value="">{t('Semua triwulan')}</option>{QUARTERS.map((n) => <option key={n} value={n}>{t('Triwulan {n}', { n })}</option>)}
        </select>
        {data.items.length > 0 && <BusyButton onClick={exportPlan}>{t('Ekspor Excel')}</BusyButton>}
        {editor && <button className="btn primary" onClick={() => setSheet({})}>{t('Tambah rencana')}</button>}
      </div>
      <div className="kpis plan-kpis">
        <div className="kpi tone-accent"><div className="lbl">{t('Penugasan direncanakan')}</div><div className="val">{s.planned}</div><div className="sub">{s.cancelled ? t('{n} dibatalkan', { n: s.cancelled }) : t('tahun {year}', { year })}</div></div>
        <div className="kpi tone-low"><div className="lbl">{t('Sudah dimulai')}</div><div className="val">{s.started}</div><div className="sub">{t('audit sudah dibuat')}</div></div>
        <div className="kpi tone-ok"><div className="lbl">{t('Selesai')}</div><div className="val">{pct}%</div><div className="sub">{t('{a} dari {b} penugasan', { a: s.done, b: s.planned })}</div></div>
        <div className="kpi tone-muted"><div className="lbl">{t('Anggaran jam')}</div><div className="val">{s.hours.toLocaleString(localeTag())}</div><div className="sub">{t('jam auditor')}</div></div>
      </div>
      {!data.items.length ? (
        <Empty title={t('Belum ada rencana audit {year}', { year })} action={editor && showRisk && <Link className="btn" to="/perencanaan/risiko">{t('Lihat penilaian risiko')}</Link>}>
          {showRisk ? t('Mulai dari penilaian risiko: area dengan risiko tertinggi dimasukkan ke rencana lebih dulu.') : t('Tambahkan rencana audit untuk tahun ini, lalu buat auditnya langsung dari rencana.')}
        </Empty>
      ) : (
        <>
          <div className="tablebox">
            <table>
              <thead><tr><th>{t('Triwulan')}</th><th>{t('Audit')}</th>{showRisk && <th>{t('Skor risiko')}</th>}<th>{t('Ketua tim')}</th><th>{t('Tim dan jam')}</th><th className="num">{t('Jam (realisasi / anggaran)')}</th><th>{t('Status')}</th>{editor && <th className="act-col">{t('Aksi')}</th>}</tr></thead>
              <tbody>
                {paged.rows.map((i) => (
                  <tr key={i.id} className={i.cancelled ? 'muted-row' : ''}>
                    <td className="num">Q{i.quarter}</td>
                    <td><div className="t-title">{i.title}</div><div className="t-sub">{[i.entity_name, i.unit, t(i.type)].filter(Boolean).join(' · ')}</div></td>
                    {showRisk && <td><LevelPill level={i.level} score={i.score} /></td>}
                    <td>{i.lead_name || '—'}</td>
                    <td className="t-sub">{i.members.map((m) => `${m.name} (${m.hours})`).join(', ') || '—'}</td>
                    <td className="num" title={t('Realisasi dari timesheet / anggaran')}>{i.audit_id ? `${Number(i.actual).toLocaleString(localeTag())} / ${i.hours}` : i.hours}</td>
                    <td>
                      {i.audit_id ? <Link to={`/audit/${i.audit_id}`} className="plain-link"><StatusPill value={i.audit_status} /> <span className="code">{i.audit_code}</span></Link>
                        : <span className={`pill plan-${slug(planStatus(i))}`}>{t(planStatus(i))}</span>}
                      {editor && !i.audit_id && !i.cancelled && <div><button className="btn small" style={{ marginTop: 6 }} onClick={() => setCreating(i)}>{t('Buat audit')}</button></div>}
                    </td>
                    {editor && <td className="act-col"><RowActions onEdit={() => setSheet(i)} onDelete={() => remove(i)} question={t('Hapus rencana ini? Audit yang sudah dibuat dari rencana ini tetap ada.')} /></td>}
                  </tr>
                ))}
                {!rows.length && <tr><td colSpan={showRisk ? 8 : 7}><Empty small>{t('Tidak ada rencana yang cocok.')}</Empty></td></tr>}
              </tbody>
            </table>
          </div>
          <Pager paged={paged} />
        </>
      )}
      {data.auditors.length > 0 && (
        <div className="panel" style={{ marginTop: 16 }}>
          <h3>{t('Beban kerja auditor {year}', { year })}</h3>
          <p className="t-sub" style={{ marginTop: 0 }}>{t('Kapasitas {n} jam per auditor per tahun. Bisa diubah di System Admin → Pengaturan → Perencanaan audit.', { n: data.capacity })}</p>
          {data.auditors.map((a) => {
            const p = Math.round((a.hours / data.capacity) * 100);
            return (
              <div className="riskbar load" key={a.id}>
                <span>{a.name}</span>
                <div className="track"><div className="fill" style={{ width: `${Math.min(100, p)}%`, background: p > 100 ? 'var(--high)' : p > 85 ? 'var(--med)' : 'var(--ok)' }} /></div>
                <span className={`n${p > 100 ? ' due-text' : ''}`}>{t('{h} jam · {p}%', { h: a.hours, p })}</span>
              </div>
            );
          })}
        </div>
      )}
      {sheet && <PlanItemForm year={year} item={sheet.id ? sheet : null} onClose={() => setSheet(null)} onSaved={reload} />}
      {creating && (() => {
        const { start, end } = quarterDates(creating.year, creating.quarter);
        const preset = {
          title: creating.title, unit: creating.unit, type: creating.type, lead_id: creating.lead_id || '', start_date: start, end_date: end,
          member_ids: creating.members.map((m) => m.id).filter((id) => id !== creating.lead_id), entity_id: creating.entity_id, plan_item_id: creating.id, ...(creating.company ? { company: creating.company } : {}),
        };
        return <AuditForm preset={preset} onClose={() => setCreating(null)} onSaved={(a) => nav(`/audit/${a.id}`)} />;
      })()}
    </>
  );
}

function PlanItemForm({ year, item, entity, onClose, onSaved }) {
  const { settings } = useSettings();
  const { user } = useAuth();
  const cm = companyMode(settings, user);
  const toast = useToast();
  const isNew = !item;
  const users = useLoad(() => api.get('/users'), []);
  const entities = useLoad(() => api.get('/planning/entities'), []);
  const [f, setF] = useState(() => ({
    year: item?.year || year,
    entity_id: item?.entity_id || entity?.id || '',
    title: item?.title || (entity ? t('Audit {name}', { name: entity.name }) : ''),
    unit: item?.unit || entity?.unit || '',
    type: item?.type || settings.audit_types[0] || '',
    quarter: item?.quarter || 1,
    lead_id: item?.lead_id || '',
    members: item?.members?.map(({ id, hours }) => ({ id, hours })) || [],
    notes: item?.notes || '',
    cancelled: item?.cancelled || false,
    company: item?.company || entity?.company || cm.view,
  }));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  const auditors = (users.data || []).filter((u) => u.active && ['auditor', 'superadmin', 'admin'].includes(u.role));
  const available = auditors.filter((u) => !f.members.some((m) => m.id === u.id));
  const nameOf = (id) => auditors.find((u) => u.id === id)?.name || item?.members.find((m) => m.id === id)?.name || '—';
  const hours = f.members.reduce((s, m) => s + (Number(m.hours) || 0), 0);

  function pickEntity(e) {
    const id = Number(e.target.value) || '';
    const en = (entities.data || []).find((x) => x.id === id);
    setF({ ...f, entity_id: id, ...(en && isNew && !f.title ? { title: t('Audit {name}', { name: en.name }) } : {}), ...(en?.unit && !f.unit ? { unit: en.unit } : {}), ...(en?.company ? { company: en.company } : {}) });
  }
  function setLead(e) {
    const id = Number(e.target.value) || '';
    // Ketua tim otomatis masuk alokasi jam.
    const members = id && !f.members.some((m) => m.id === id) ? [{ id, hours: 0 }, ...f.members] : f.members;
    setF({ ...f, lead_id: id, members });
  }
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const body = { ...f, entity_id: f.entity_id || null, lead_id: f.lead_id || null, quarter: Number(f.quarter), members: f.members.map((m) => ({ id: m.id, hours: Number(m.hours) || 0 })) };
      if (!cm.on) delete body.company;
      if (isNew) await api.post('/planning/plan', body);
      else await api.patch(`/planning/plan/${item.id}`, body);
      toast(t('Rencana disimpan'));
      onClose();
      onSaved();
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  }
  return (
    <Sheet title={isNew ? t('Rencana audit baru') : t('Ubah rencana audit')} onClose={onClose}>
      <form className="form" onSubmit={submit}>
        <ReqNote />
        <label><span>{t('Tahun')} <Req /></span><select id="p-year" value={f.year} onChange={set('year')}>{YEARS.map((y) => <option key={y} value={y}>{y}</option>)}</select></label>
        <label><span>{t('Triwulan')} <Req /></span><select id="p-quarter" value={f.quarter} onChange={set('quarter')}>{QUARTERS.map((n) => <option key={n} value={n}>{t('Triwulan {n}', { n })}</option>)}</select></label>
        <label className="full">{t('Area di audit universe')}
          <select id="p-entity" value={f.entity_id} onChange={pickEntity}>
            <option value="">{t('Tanpa area')}</option>
            {(entities.data || []).filter((x) => x.active || x.id === f.entity_id).map((x) => <option key={x.id} value={x.id}>{x.name} · {t(x.kind)}</option>)}
          </select>
        </label>
        <CompanySelect id="p-company" value={f.company} onChange={set('company')} full />
        <label className="full"><span>{t('Judul audit')} <Req /></span><input id="p-title" required value={f.title} onChange={set('title')} /></label>
        <label><span>{t('Unit yang diaudit')} <Req /></span><ComboInput id="p-unit" required options={settings.units} value={f.unit} onChange={set('unit')} /></label>
        <label><span>{t('Jenis audit')} <Req /></span><select id="p-type" required value={f.type} onChange={set('type')}>{[...new Set([f.type, ...settings.audit_types])].filter(Boolean).map((x) => <option key={x} value={x}>{t(x)}</option>)}</select></label>
        <label>{t('Ketua tim')}<select id="p-lead" value={f.lead_id} onChange={setLead}><option value="">{t('Pilih auditor')}</option>{auditors.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select></label>
        <span />
        <div className="group full">
          <label htmlFor="p-add-member">{t('Alokasi auditor dan anggaran jam')}</label>
          {f.members.map((m, idx) => (
            <div className="alloc" key={m.id}>
              <span>{nameOf(m.id)}</span>
              <input type="number" min="0" max="3000" aria-label={t('Jam untuk {name}', { name: nameOf(m.id) })} value={m.hours}
                onChange={(e) => setF({ ...f, members: f.members.map((x, j) => (j === idx ? { ...x, hours: e.target.value } : x)) })} />
              <span className="t-sub">{t('jam')}</span>
              <button type="button" className="btn ghost small" onClick={() => setF({ ...f, members: f.members.filter((_, j) => j !== idx) })}>{t('Hapus')}</button>
            </div>
          ))}
          <select id="p-add-member" value="" onChange={(e) => e.target.value && setF({ ...f, members: [...f.members, { id: Number(e.target.value), hours: 0 }] })}>
            <option value="">{available.length ? t('Tambah auditor') : t('Semua auditor sudah dipilih')}</option>
            {available.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
          <span className="hint">{t('Total {n} jam.', { n: hours })}</span>
        </div>
        <label className="full">{t('Catatan')}<textarea id="p-notes" value={f.notes} onChange={set('notes')} placeholder={t('Alasan dipilih, fokus audit, atau ketergantungan')} /></label>
        {!isNew && <label className="check-row full"><input id="p-cancelled" type="checkbox" checked={f.cancelled} onChange={set('cancelled')} />{t('Dibatalkan (tidak dihitung di ringkasan dan beban kerja)')}</label>}
        {error && <div className="error-text full" role="alert">{error}</div>}
        <div className="form-foot full">
          {!isNew && !item.audit_id && <span className="left"><ConfirmDelete question={t('Hapus rencana ini?')} onConfirm={async () => { await api.del(`/planning/plan/${item.id}`); onClose(); onSaved(); }} /></span>}
          <button type="button" className="btn" onClick={onClose}>{t('Batal')}</button>
          <button className="btn primary" disabled={busy}>{t('Simpan')}</button>
        </div>
      </form>
    </Sheet>
  );
}
