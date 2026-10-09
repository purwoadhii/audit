import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { STEP_RESULTS, canEdit, fmtDate, slug, teamText } from '../util.js';
import { Empty, ErrorBox, Loading, RiskPill, StatusPill, useLoad, useToast } from '../components/ui.jsx';
import AuditForm from '../components/AuditForm.jsx';
import FindingSheet from '../components/FindingSheet.jsx';
import Attachments from '../components/Attachments.jsx';

export default function AuditDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const nav = useNavigate();
  const toast = useToast();
  const editor = canEdit(user);
  const { data: a, error, loading, reload, setData } = useLoad(() => api.get(`/audits/${id}`), [id]);
  const [editing, setEditing] = useState(false);
  const [sheet, setSheet] = useState(null); // { id } atau { preset }
  const [newStep, setNewStep] = useState('');

  if (loading && !a) return <Loading />;
  if (error) return <ErrorBox error={error} retry={reload} />;

  const done = a.steps.filter((s) => s.result !== 'Belum diuji').length;

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
      <div className="bar"><Link className="btn ghost" to="/audit">← Semua audit</Link></div>
      <div className="detail-head">
        <div className="grow">
          <div className="code">{a.code} · {a.type}</div>
          <h2>{a.title}</h2>
          <div className="facts">
            <span>Auditee <b>{a.unit}</b></span>
            <span>Ketua tim <b>{a.lead_name || '—'}</b></span>
            <span>Anggota <b>{teamText(a)}</b></span>
            <span>Periode <b>{fmtDate(a.start_date)} – {fmtDate(a.end_date)}</b></span>
          </div>
          {a.scope && <p className="t-sub" style={{ margin: '8px 0 0', maxWidth: '70ch', whiteSpace: 'pre-wrap' }}>{a.scope}</p>}
        </div>
        <div className="actions">
          <StatusPill value={a.status} />
          {user.role !== 'auditee' && <Link className="btn" to={`/audit/${a.id}/laporan`}>Laporan</Link>}
          {editor && <button className="btn" onClick={() => setEditing(true)}>Ubah</button>}
        </div>
      </div>
      <div className="grid-detail">
        {user.role !== 'auditee' ? (
          <div className="stack">
            <div className="panel">
              <h3>Program kerja · {done}/{a.steps.length} diuji</h3>
              {a.steps.length ? a.steps.map((s, i) => (
                <div className={`step res-${slug(s.result)}`} key={s.id}>
                  <div className="no">{String(i + 1).padStart(2, '0')}</div>
                  <div>
                    <div className="txt">{s.text}</div>
                    {editor ? (
                      <textarea id={`note-${s.id}`} defaultValue={s.note} placeholder="Catatan pengujian, sampel, dan bukti"
                        onBlur={(e) => e.target.value !== s.note && updateStep(s, { note: e.target.value })} />
                    ) : s.note && <div className="ro t-sub">{s.note}</div>}
                  </div>
                  <div className="act">
                    {editor ? (
                      <select id={`res-${s.id}`} aria-label="Hasil pengujian" value={s.result} onChange={(e) => updateStep(s, { result: e.target.value })}>
                        {STEP_RESULTS.map((r) => <option key={r}>{r}</option>)}
                      </select>
                    ) : <span className="pill">{s.result}</span>}
                    {editor && s.result === 'Tidak sesuai' && (
                      <button className="btn" onClick={() => setSheet({ preset: { audit_id: a.id, step_id: s.id, title: s.text, condition: document.getElementById(`note-${s.id}`)?.value ?? s.note } })}>Jadikan temuan</button>
                    )}
                    {editor && <button className="btn ghost" onClick={() => removeStep(s)}>Hapus langkah</button>}
                  </div>
                </div>
              )) : <Empty small>Belum ada langkah pengujian.</Empty>}
              {editor && (
                <form className="addrow" onSubmit={addStep}>
                  <input id="new-step" required value={newStep} onChange={(e) => setNewStep(e.target.value)} placeholder="Tambah langkah pengujian" />
                  <button className="btn">Tambah</button>
                </form>
              )}
            </div>
            <div className="panel">
              <h3>Kertas kerja dan dokumen audit</h3>
              <Attachments items={a.attachments} uploadUrl={editor ? `/audits/${a.id}/attachments` : null} canDelete={() => editor} onChange={reload} />
            </div>
          </div>
        ) : (
          <div className="panel"><h3>Tentang audit ini</h3><p className="t-sub" style={{ margin: 0 }}>Anda melihat temuan yang ditugaskan kepada Anda atau unit Anda. Klik temuan untuk memberi tanggapan dan mengunggah bukti.</p></div>
        )}
        <div className="panel">
          <h3>Temuan · {a.findings.length}</h3>
          {a.findings.length ? (
            <ul className="list-plain">
              {a.findings.map((f) => (
                <li key={f.id}><button onClick={() => setSheet({ id: f.id })}>
                  <span><span className="code">{f.code}</span><br /><span className="t-title">{f.title}</span><br /><span className="t-sub">{f.owner_name || 'Belum ada PIC'} · {f.status}</span></span>
                  <span><RiskPill value={f.risk} /></span>
                </button></li>
              ))}
            </ul>
          ) : <Empty small>Belum ada temuan.</Empty>}
          {editor && <div style={{ marginTop: 12 }}><button className="btn primary" onClick={() => setSheet({ preset: { audit_id: a.id } })}>Catat temuan</button></div>}
        </div>
      </div>
      {editing && <AuditForm audit={a} onClose={() => setEditing(false)} onSaved={reload} onDeleted={() => nav('/audit')} />}
      {sheet && <FindingSheet id={sheet.id} preset={sheet.preset} onClose={() => setSheet(null)} onChanged={reload} />}
    </>
  );
}
