import { useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { STEP_RESULTS, canEdit, fmtDate, fmtDateTime, slug, teamText } from '../util.js';
import { Empty, ErrorBox, Loading, RiskPill, StatusPill, useLoad, useToast } from '../components/ui.jsx';
import AuditForm from '../components/AuditForm.jsx';
import FindingSheet from '../components/FindingSheet.jsx';
import FindingBatchSheet from '../components/FindingBatchSheet.jsx';
import Attachments from '../components/Attachments.jsx';
import ApprovalPanel from '../components/ApprovalPanel.jsx';
import { T, t } from '../i18n.jsx';

export default function AuditDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const nav = useNavigate();
  const toast = useToast();
  const editor = canEdit(user);
  const { data: a, error, loading, reload, setData } = useLoad(() => api.get(`/audits/${id}`), [id]);
  const [editing, setEditing] = useState(false);
  const [params, setParams] = useSearchParams();
  // ?temuan=id dari notifikasi langsung membuka temuan itu.
  const [sheet, setSheet] = useState(() => (params.get('temuan') ? { id: Number(params.get('temuan')) } : null)); // { id } atau { preset }
  const [batch, setBatch] = useState(null); // 'temuan' atau 'isu': tab yang dibuka di form tambah sekaligus
  const [newStep, setNewStep] = useState('');

  if (loading && !a) return <Loading />;
  if (error) return <ErrorBox error={error} retry={reload} />;

  const done = a.steps.filter((s) => s.result !== 'Belum diuji').length;
  // Penyetuju dari unit yang diaudit (auditee) juga melihat kertas kerja audit ini.
  const workPapers = user.role !== 'auditee' || a.approver_id === user.id;
  // Selama menunggu persetujuan atau sudah disetujui, kertas kerja tidak bisa diubah.
  const locked = ['persetujuan', 'disetujui'].includes(a.approval);
  const canWrite = editor && !locked;
  const isLead = a.lead_id === user.id;

  async function reviewStep(step, reviewed) {
    try {
      const saved = await api.post(`/audits/${a.id}/steps/${step.id}/review`, { reviewed });
      setData((d) => ({ ...d, steps: d.steps.map((s) => (s.id === step.id ? saved : s)) }));
    } catch (err) {
      toast(err.message, 'error');
    }
  }
  function closeSheet() {
    setSheet(null);
    if (params.get('temuan')) setParams({}, { replace: true });
  }
  const findings = a.findings.filter((f) => f.kind !== 'isu');
  const issues = a.findings.filter((f) => f.kind === 'isu');

  async function updateStep(step, patch) {
    try {
      const saved = await api.patch(`/audits/${a.id}/steps/${step.id}`, patch);
      setData((d) => ({ ...d, steps: d.steps.map((s) => (s.id === step.id ? saved : s)) }));
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  async function addStep(e) {
    e.preventDefault();
    try {
      const s = await api.post(`/audits/${a.id}/steps`, { text: newStep });
      setData((d) => ({ ...d, steps: [...d.steps, s] }));
      setNewStep('');
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  async function removeStep(step) {
    try {
      await api.del(`/audits/${a.id}/steps/${step.id}`);
      setData((d) => ({ ...d, steps: d.steps.filter((s) => s.id !== step.id) }));
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  return (
    <>
      <div className="bar"><Link className="btn ghost" to="/audit">{t('← Semua audit')}</Link></div>
      <div className="detail-head">
        <div className="grow">
          <div className="code">{a.code} · {t(a.type)}</div>
          <h2>{a.title}</h2>
          <div className="facts">
            <span><T k="Auditee {unit}" unit={<b>{a.unit}</b>} /></span>
            <span><T k="Ketua tim {name}" name={<b>{a.lead_name || '—'}</b>} /></span>
            <span><T k="Anggota {names}" names={<b>{teamText(a)}</b>} /></span>
            <span><T k="Periode {period}" period={<b>{fmtDate(a.start_date)} – {fmtDate(a.end_date)}</b>} /></span>
            <span><T k="Jumlah temuan {n}" n={<b>{findings.length}</b>} /></span>
            <span><T k="Jumlah isu {n}" n={<b>{issues.length}</b>} /></span>
          </div>
          {a.scope && <p className="t-sub" style={{ margin: '8px 0 0', maxWidth: '70ch', whiteSpace: 'pre-wrap' }}>{a.scope}</p>}
        </div>
        <div className="actions">
          <StatusPill value={a.status} />
          {workPapers && <Link className="btn" to={`/audit/${a.id}/laporan`}>{t('Laporan')}</Link>}
          {editor && <button className="btn" onClick={() => setEditing(true)}>{t('Ubah')}</button>}
        </div>
      </div>
      {workPapers && <ApprovalPanel audit={a} onChanged={reload} />}
      <div className="grid-detail">
        {workPapers ? (
          <div className="stack">
            <div className="panel">
              <h3>{t('Program kerja · {done}/{total} diuji', { done, total: a.steps.length })}</h3>
              {a.steps.length ? a.steps.map((s, i) => (
                <div className={`step res-${slug(s.result)}`} key={s.id}>
                  <div className="no">{String(i + 1).padStart(2, '0')}</div>
                  <div>
                    <div className="txt">{s.text}</div>
                    {canWrite ? (
                      <textarea id={`note-${s.id}`} defaultValue={s.note} placeholder={t('Catatan pengujian, sampel, dan bukti')}
                        onBlur={(e) => e.target.value !== s.note && updateStep(s, { note: e.target.value })} />
                    ) : s.note && <div className="ro t-sub">{s.note}</div>}
                    {s.reviewed_by && <div className="reviewed">✓ {t('Direview {name}, {date}', { name: s.reviewer_name || '—', date: fmtDateTime(s.reviewed_at) })}</div>}
                  </div>
                  <div className="act">
                    {canWrite ? (
                      <select id={`res-${s.id}`} aria-label={t('Hasil pengujian')} value={s.result} onChange={(e) => updateStep(s, { result: e.target.value })}>
                        {STEP_RESULTS.map((r) => <option key={r} value={r}>{t(r)}</option>)}
                      </select>
                    ) : <span className="pill">{t(s.result)}</span>}
                    {isLead && !locked && s.result !== 'Belum diuji' && (
                      s.reviewed_by
                        ? <button className="btn ghost" onClick={() => reviewStep(s, false)}>{t('Batalkan review')}</button>
                        : <button className="btn" onClick={() => reviewStep(s, true)}>{t('Tandai direview')}</button>
                    )}
                    {canWrite && s.result === 'Tidak sesuai' && (
                      <button className="btn" onClick={() => setSheet({ preset: { audit_id: a.id, step_id: s.id, title: s.text, condition: document.getElementById(`note-${s.id}`)?.value ?? s.note } })}>{t('Jadikan temuan')}</button>
                    )}
                    {canWrite && <button className="btn ghost" onClick={() => removeStep(s)}>{t('Hapus langkah')}</button>}
                  </div>
                </div>
              )) : <Empty small>{t('Belum ada langkah pengujian.')}</Empty>}
              {canWrite && (
                <form className="addrow" onSubmit={addStep}>
                  <input id="new-step" required value={newStep} onChange={(e) => setNewStep(e.target.value)} placeholder={t('Tambah langkah pengujian')} />
                  <button className="btn">{t('Tambah')}</button>
                </form>
              )}
            </div>
            <div className="panel">
              <h3>{t('Kertas kerja dan dokumen audit')}</h3>
              <Attachments items={a.attachments} uploadUrl={editor ? `/audits/${a.id}/attachments` : null} canDelete={() => editor} onChange={reload} />
            </div>
          </div>
        ) : (
          <div className="panel"><h3>{t('Tentang audit ini')}</h3><p className="t-sub" style={{ margin: 0 }}>{t('Anda melihat temuan yang ditugaskan kepada Anda atau unit Anda. Klik temuan untuk memberi tanggapan dan mengunggah bukti.')}</p></div>
        )}
        <div className="panel">
          <FindingList title={t('Temuan · {n}', { n: findings.length })} items={findings} empty={t('Belum ada temuan.')} onOpen={(f) => setSheet({ id: f.id })} />
          <div style={{ height: 16 }} />
          <FindingList title={t('Isu · {n}', { n: issues.length })} items={issues} empty={t('Belum ada isu.')} onOpen={(f) => setSheet({ id: f.id })} />
          {canWrite && (
            <div className="actions" style={{ marginTop: 12 }}>
              <button className="btn primary" onClick={() => setBatch('temuan')}>{t('Tambah temuan')}</button>
              <button className="btn" onClick={() => setBatch('isu')}>{t('Tambah isu')}</button>
            </div>
          )}
        </div>
      </div>
      {editing && <AuditForm audit={a} onClose={() => setEditing(false)} onSaved={reload} onDeleted={() => nav('/audit')} />}
      {batch && <FindingBatchSheet audit={a} initialKind={batch} onClose={() => setBatch(null)} onSaved={reload} />}
      {sheet && <FindingSheet id={sheet.id} preset={sheet.preset} onClose={closeSheet} onChanged={reload} />}
    </>
  );
}

function FindingList({ title, items, empty, onOpen }) {
  return (
    <>
      <h3>{title}</h3>
      {items.length ? (
        <ul className="list-plain">
          {items.map((f) => (
            <li key={f.id}><button onClick={() => onOpen(f)}>
              <span><span className="code">{f.code}</span><br /><span className="t-title">{f.title}</span><br /><span className="t-sub">{f.owner_name || t('Belum ada PIC')} · {t(f.status)}{f.reviewed_by ? ` · ✓ ${t('Direview')}` : ''}</span></span>
              <span><RiskPill value={f.risk} /></span>
            </button></li>
          ))}
        </ul>
      ) : <Empty small>{empty}</Empty>}
    </>
  );
}
