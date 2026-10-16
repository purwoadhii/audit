import { useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { useSettings } from '../settings.jsx';
import { APPROVAL_LABEL, canEdit, fmtDateTime } from '../util.js';
import { useLoad, useToast } from './ui.jsx';
import { Link } from 'react-router-dom';
import { N_, t } from '../i18n.jsx';

const TONE = { review: 'tone-med', persetujuan: 'tone-med', disetujui: 'tone-ok', dikembalikan: 'tone-high' };
const HISTORY = {
  ajukan: N_('mengajukan laporan'), teruskan: N_('mereview dan meneruskan ke penyetuju'), setujui: N_('menyetujui laporan'),
  kembalikan: N_('mengembalikan laporan'), tarik: N_('menarik pengajuan'),
};

// Alur persetujuan laporan audit: tim mengajukan, ketua tim mereview, lalu Manager atau Kepala unit menyetujui.
export default function ApprovalPanel({ audit: a, onChanged }) {
  const { user } = useAuth();
  const { settings } = useSettings();
  const toast = useToast();
  const [note, setNote] = useState('');
  const [returning, setReturning] = useState(false);
  const [busy, setBusy] = useState(false);
  const [password, setPassword] = useState('');
  const sig = useLoad(() => api.get('/auth/signature'), []);

  const state = a.approval;
  const isLead = a.lead_id === user.id;
  const isApprover = a.approver_id === user.id;
  const editor = canEdit(user);
  const steps = a.steps.filter((s) => s.result !== 'Belum diuji' && !s.reviewed_by).length;
  const findings = a.findings.filter((f) => !f.reviewed_by).length;
  const pendingReview = settings.review_required && (steps || findings);

  async function act(action, extra = {}) {
    setBusy(true);
    try {
      await api.post(`/audits/${a.id}/approval`, { action, note: note.trim(), ...(signing ? { password } : {}), ...extra });
      toast(t('Tersimpan'));
      setNote('');
      setPassword('');
      setReturning(false);
      onChanged();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  }

  async function reviewAll() {
    setBusy(true);
    try {
      const r = await api.post(`/audits/${a.id}/review-all`, {});
      toast(t('{steps} langkah dan {findings} temuan atau isu ditandai sudah direview.', r));
      onChanged();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  }

  const canSubmit = editor && (!state || state === 'dikembalikan');
  const canForward = isLead && state === 'review';
  const canApprove = isApprover && state === 'persetujuan';
  const canReturn = canForward || canApprove || (isApprover && state === 'disetujui');
  const canWithdraw = editor && ['review', 'persetujuan'].includes(state) && !isApprover;
  // Ketua tim menandatangani saat meneruskan (atau mengajukan langsung), penyetuju saat menyetujui.
  const signing = !returning && (canForward || canApprove || (canSubmit && isLead));
  const signature = sig.data?.signature;
  const blockedSign = signing && settings.esign_required && (!signature || !password);
  const missing = !a.lead_id ? t('Tentukan ketua tim dulu di Ubah audit.') : !a.approver_id ? t('Pilih penyetuju dulu di Ubah audit.') : '';
  const waitingId = state === 'review' ? a.lead_id : state === 'persetujuan' ? a.approver_id : null;
  const waitingOn = waitingId === user.id ? t('Menunggu tindakan Anda') : waitingId ? t('Menunggu {name}', { name: state === 'review' ? a.lead_name : a.approver_name }) : null;

  return (
    <div className="panel approval">
      <div className="bar" style={{ marginBottom: 6 }}>
        <h3 style={{ margin: 0 }}>{t('Persetujuan laporan')}</h3>
        <span className={`pill ${TONE[state] || ''}`}>{state ? t(APPROVAL_LABEL[state]) : t('Belum diajukan')}</span>
      </div>
      <div className="facts">
        <span>{t('Ketua tim')}: <b>{a.lead_name || '—'}</b></span>
        <span>{t('Penyetuju')}: <b>{a.approver_name || '—'}</b></span>
        {waitingOn && <span>{waitingOn}</span>}
      </div>

      {(isLead || canSubmit) && !['persetujuan', 'disetujui'].includes(state) && pendingReview ? (
        <div className="notice" style={{ marginTop: 10 }}>
          {t('Belum direview ketua tim: {steps} langkah dan {findings} temuan atau isu.', { steps, findings })}
          {isLead && <button type="button" className="btn small" style={{ marginLeft: 8 }} disabled={busy} onClick={reviewAll}>{t('Tandai semua sudah direview')}</button>}
        </div>
      ) : null}

      {(canSubmit || canForward || canApprove || canReturn || canWithdraw) && (
        <div className="approval-actions">
          {(canSubmit || canForward || canApprove || returning) && (
            <textarea id="approval-note" value={note} onChange={(e) => setNote(e.target.value)}
              placeholder={returning ? t('Alasan dikembalikan (wajib)') : t('Catatan (opsional)')} />
          )}
          {signing && !missing && (
            <div className="sign-confirm">
              <span>{t('Tombol di bawah menandatangani laporan ini secara elektronik atas nama Anda. Laporan akan mendapat kode verifikasi.')}</span>
              {signature ? <img src={signature} alt={t('Tanda tangan saya')} />
                : <span className={settings.esign_required ? 'bad-text' : 't-sub'}>{t('Anda belum punya tanda tangan.')} <Link to="/akun">{t('Buat di Akun saya')}</Link></span>}
              {settings.esign_required && <label>{t('Kata sandi Anda')}<input id="sign-password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} /></label>}
            </div>
          )}
          <div className="actions">
            {canSubmit && (missing ? <span className="t-sub">{missing}</span>
              : <button className="btn primary" disabled={busy || (isLead && blockedSign)} onClick={() => act('ajukan')}>{isLead ? t('Ajukan ke penyetuju') : t('Ajukan ke ketua tim')}</button>)}
            {canForward && !returning && <button className="btn primary" disabled={busy || blockedSign} onClick={() => act('teruskan')}>{t('Teruskan ke penyetuju')}</button>}
            {canApprove && !returning && <button className="btn primary" disabled={busy || blockedSign} onClick={() => act('setujui')}>{t('Setujui laporan')}</button>}
            {canReturn && (returning
              ? <>
                <button className="btn" onClick={() => setReturning(false)}>{t('Batal')}</button>
                <button className="btn primary danger-fill" disabled={busy || !note.trim()} onClick={() => act('kembalikan')}>{state === 'disetujui' ? t('Buka kembali laporan') : t('Kembalikan')}</button>
              </>
              : <button className="btn danger" onClick={() => setReturning(true)}>{state === 'disetujui' ? t('Buka kembali') : t('Kembalikan')}</button>)}
            {canWithdraw && <button className="btn ghost" disabled={busy} onClick={() => act('tarik')}>{t('Tarik pengajuan')}</button>}
          </div>
        </div>
      )}

      {a.approvals?.length > 0 && (
        <ol className="approval-log">
          {a.approvals.map((p) => (
            <li key={p.id}>
              <span className="t-sub num">{fmtDateTime(p.created_at)}</span>
              <span><b>{p.user_name || '—'}</b> {t(HISTORY[p.action] || p.action)}{p.note && <span className="t-sub"> · “{p.note}”</span>}
                {p.sign_code && <span className="t-sub"> · {t('ditandatangani')} <Link to={`/verifikasi/${p.sign_code}`} className="code">{p.sign_code}</Link></span>}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
