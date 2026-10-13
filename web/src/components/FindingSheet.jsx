import { useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { AUDITEE_STATUS, FINDING_KINDS, FINDING_STATUS, RISKS, canEdit, fmtDateTime } from '../util.js';
import { ConfirmDelete, Req, ReqNote, ErrorBox, Loading, RiskPill, Sheet, StatusPill, useLoad, useToast } from './ui.jsx';
import Attachments from './Attachments.jsx';
import { N_, t } from '../i18n.jsx';

const ELEMENTS = [
  ['condition', N_('Kondisi'), N_('Apa yang ditemukan di lapangan')],
  ['criteria', N_('Kriteria'), N_('Aturan, SOP, atau standar yang seharusnya berlaku')],
  ['cause', N_('Sebab'), ''],
  ['effect', N_('Akibat'), ''],
  ['recommendation', N_('Rekomendasi'), ''],
];

// Panel samping untuk membuat, melihat, dan menindaklanjuti satu temuan.
export default function FindingSheet({ id, preset, onClose, onChanged }) {
  const { user } = useAuth();
  const editor = canEdit(user);
  const isNew = !id;
  const detail = useLoad(() => (id ? api.get(`/findings/${id}`) : Promise.resolve(null)), [id]);
  const audits = useLoad(() => (editor ? api.get('/audits') : Promise.resolve([])), [editor]);
  const users = useLoad(() => (editor ? api.get('/users') : Promise.resolve([])), [editor]);

  if (!isNew && detail.loading && !detail.data) return <Sheet title={t('Temuan')} onClose={onClose}><Loading /></Sheet>;
  if (!isNew && detail.error) return <Sheet title={t('Temuan')} onClose={onClose}><ErrorBox error={detail.error} retry={detail.reload} /></Sheet>;

  const finding = detail.data;
  const refresh = () => { detail.reload(); onChanged?.(); };
  return (
    <Sheet title={isNew ? t('Temuan atau isu baru') : `${finding.code} · ${FINDING_KINDS[finding.kind]}`} onClose={onClose}>
      {editor ? (
        <EditorForm key={finding?.updated_at || 'new'} finding={finding} preset={preset} audits={audits.data || []}
          users={(users.data || []).filter((u) => u.active)} onSaved={() => { onChanged?.(); if (isNew) onClose(); else detail.reload(); }}
          onDeleted={() => { onChanged?.(); onClose(); }} />
      ) : (
        <ReadView finding={finding} canRespond={user.role === 'auditee'} onSaved={refresh} />
      )}
      {!isNew && (
        <>
          <div className="panel">
            <h3>{t('Bukti tindak lanjut')}</h3>
            <Attachments items={finding.attachments} uploadUrl={user.role === 'manajemen' ? null : `/findings/${finding.id}/attachments`}
              canDelete={(a) => editor || a.uploaded_by === user.id} onChange={refresh} />
          </div>
          <LogPanel finding={finding} canWrite={user.role !== 'manajemen'} onAdded={refresh} />
        </>
      )}
    </Sheet>
  );
}

function EditorForm({ finding, preset, audits, users, onSaved, onDeleted }) {
  const toast = useToast();
  const isNew = !finding;
  const src = finding || {};
  const [f, setF] = useState(() => ({
    kind: src.kind || preset?.kind || 'temuan',
    title: src.title ?? preset?.title ?? '',
    audit_id: src.audit_id ?? preset?.audit_id ?? '',
    risk: src.risk || 'Sedang',
    status: src.status || 'Terbuka',
    owner_id: src.owner_id ?? '',
    due_date: src.due_date || '',
    condition: src.condition ?? preset?.condition ?? '',
    criteria: src.criteria || '', cause: src.cause || '', effect: src.effect || '', recommendation: src.recommendation || '',
    response: src.response || '',
  }));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const auditId = f.audit_id || audits[0]?.id || '';

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const { kind, ...rest } = f;
      const body = { ...rest, ...(isNew ? { kind } : {}), audit_id: Number(auditId), owner_id: f.owner_id ? Number(f.owner_id) : null, due_date: f.due_date || null };
      if (isNew && preset?.step_id) body.step_id = preset.step_id;
      const saved = isNew ? await api.post('/findings', body) : await api.patch(`/findings/${finding.id}`, body);
      toast(isNew ? (kind === 'isu' ? t('Isu dicatat dan masuk papan tindak lanjut') : t('Temuan dicatat dan masuk papan tindak lanjut')) : t('Perubahan disimpan'));
      onSaved(saved);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    try {
      await api.del(`/findings/${finding.id}`);
      toast(f.kind === 'isu' ? t('Isu dihapus') : t('Temuan dihapus'));
      onDeleted();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <form className="form" onSubmit={submit}>
      <ReqNote />
      {isNew && <label className="full"><span>{t('Jenis')} <Req /></span><select id="f-kind" value={f.kind} onChange={set('kind')}>{Object.entries(FINDING_KINDS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>}
      <label className="full"><span>{f.kind === 'isu' ? t('Judul isu') : t('Judul temuan')} <Req /></span><input id="f-title" required value={f.title} onChange={set('title')} /></label>
      <label><span>{t('Audit')} <Req /></span><select id="f-audit" required value={auditId} onChange={set('audit_id')}>{audits.map((a) => <option key={a.id} value={a.id}>{a.code} · {a.title}</option>)}</select></label>
      <label><span>{t('Tingkat risiko')} <Req /></span><select id="f-risk" value={f.risk} onChange={set('risk')}>{RISKS.map((r) => <option key={r} value={r}>{t(r)}</option>)}</select></label>
      <fieldset className="fs">
        <legend>{t('Unsur temuan')}</legend>
        {ELEMENTS.map(([k, label, hint]) => (
          <label key={k}>{t(label)}{hint && <span className="hint">{t(hint)}</span>}<textarea id={`f-${k}`} value={f[k]} onChange={set(k)} /></label>
        ))}
      </fieldset>
      <label>{t('Penanggung jawab (PIC)')}<select id="f-owner" value={f.owner_id} onChange={set('owner_id')}><option value="">{t('Belum ditentukan')}</option>{users.map((u) => <option key={u.id} value={u.id}>{u.name}{u.unit ? ` · ${u.unit}` : ''}</option>)}</select></label>
      <label>{t('Batas waktu')}<input id="f-due" type="date" value={f.due_date} onChange={set('due_date')} /></label>
      <label><span>{t('Status tindak lanjut')} <Req /></span><select id="f-status" value={f.status} onChange={set('status')}>{FINDING_STATUS.map((s) => <option key={s} value={s}>{t(s)}</option>)}</select></label>
      <span />
      <label className="full">{t('Tanggapan auditee')}<textarea id="f-response" value={f.response} onChange={set('response')} /></label>
      {error && <div className="error-text full" role="alert">{error}</div>}
      <div className="form-foot full">
        {!isNew && <span className="left"><ConfirmDelete question={f.kind === 'isu' ? t('Hapus isu ini beserta riwayat dan buktinya?') : t('Hapus temuan ini beserta riwayat dan buktinya?')} onConfirm={remove} /></span>}
        <button className="btn primary" disabled={busy}>{isNew ? (f.kind === 'isu' ? t('Simpan isu') : t('Simpan temuan')) : t('Simpan perubahan')}</button>
      </div>
    </form>
  );
}

function ReadView({ finding, canRespond, onSaved }) {
  const toast = useToast();
  const [response, setResponse] = useState(finding.response || '');
  const [status, setStatus] = useState(finding.status);
  const [error, setError] = useState('');
  const statusChoices = AUDITEE_STATUS.includes(finding.status) ? AUDITEE_STATUS : [finding.status, ...AUDITEE_STATUS];
  const locked = finding.status === 'Selesai';

  async function submit(e) {
    e.preventDefault();
    setError('');
    try {
      await api.patch(`/findings/${finding.id}`, { response, ...(status !== finding.status ? { status } : {}) });
      toast(t('Tanggapan disimpan'));
      onSaved();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <>
      <div className="panel">
        <div className="actions" style={{ marginBottom: 8 }}><RiskPill value={finding.risk} /><StatusPill value={finding.status} /><span className={`t-sub ${finding.overdue ? 'overdue' : ''}`}>{t('Batas {date}', { date: finding.due_date || '—' })}</span></div>
        <div className="t-title" style={{ fontSize: 16 }}>{finding.title}</div>
        <div className="t-sub">{finding.audit_code} · {finding.audit_title} · {t('PIC {name}', { name: finding.owner_name || '—' })}</div>
        <div className="form" style={{ marginTop: 12 }}>
          {ELEMENTS.map(([k, label]) => (
            <div className="full" key={k}><div className="hint" style={{ fontWeight: 700, color: 'var(--muted)' }}>{t(label)}</div><div className="ro">{finding[k] || '—'}</div></div>
          ))}
        </div>
      </div>
      {canRespond && !locked ? (
        <form className="panel form" onSubmit={submit}>
          <h3 className="full" style={{ margin: 0 }}>{t('Tanggapan dan progres Anda')}</h3>
          <label className="full">{t('Tanggapan')}<textarea id="r-response" value={response} onChange={(e) => setResponse(e.target.value)} placeholder={t('Rencana atau tindakan yang sudah dilakukan')} /></label>
          <label>{t('Status')}<select id="r-status" value={status} onChange={(e) => setStatus(e.target.value)}>{statusChoices.map((s) => <option key={s} value={s}>{t(s)}</option>)}</select><span className="hint">{t('Pilih "{status}" bila sudah selesai. Auditor akan menutup temuan setelah memeriksa bukti.', { status: t('Menunggu verifikasi') })}</span></label>
          <span />
          {error && <div className="error-text full" role="alert">{error}</div>}
          <div className="form-foot full"><button className="btn primary">{t('Kirim tanggapan')}</button></div>
        </form>
      ) : (
        <div className="panel"><h3>{t('Tanggapan auditee')}</h3><div className="ro">{finding.response || '—'}</div></div>
      )}
    </>
  );
}

function LogPanel({ finding, canWrite, onAdded }) {
  const toast = useToast();
  const [text, setText] = useState('');
  async function submit(e) {
    e.preventDefault();
    try {
      await api.post(`/findings/${finding.id}/logs`, { text });
      setText('');
      toast(t('Progres dicatat'));
      onAdded();
    } catch (err) {
      toast(err.message, 'error');
    }
  }
  return (
    <div className="panel">
      <h3>{t('Riwayat tindak lanjut')}</h3>
      {canWrite && (
        <form className="addrow" style={{ margin: '0 0 12px' }} onSubmit={submit}>
          <input id="log-text" required value={text} onChange={(e) => setText(e.target.value)} placeholder={t('Contoh: SOP revisi sudah disahkan direksi')} />
          <button className="btn">{t('Catat')}</button>
        </form>
      )}
      <div className="log">
        {finding.logs.length ? finding.logs.map((l) => (
          <div className="log-item" key={l.id}>
            <div className="when">{fmtDateTime(l.created_at)} · {l.user_name || t('Pengguna dihapus')}{l.status ? ` · ${t(l.status)}` : ''}</div>
            {l.text}
          </div>
        )) : <div className="t-sub">{t('Belum ada catatan progres.')}</div>}
      </div>
    </div>
  );
}
