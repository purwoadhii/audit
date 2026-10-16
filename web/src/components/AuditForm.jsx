import { useState } from 'react';
import { api } from '../api.js';
import { AUDIT_STATUS, ROLES, canApproveFor } from '../util.js';
import { useSettings } from '../settings.jsx';
import { useAuth } from '../auth.jsx';
import ComboInput from './ComboInput.jsx';
import { ConfirmDelete, Req, ReqNote, Sheet, useLoad, useToast } from './ui.jsx';
import { t } from '../i18n.jsx';

const today = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);

// preset: isian awal untuk audit baru, misalnya dari rencana audit tahunan (berisi plan_item_id).
export default function AuditForm({ audit, preset, onClose, onSaved, onDeleted }) {
  const isNew = !audit;
  const toast = useToast();
  const { settings } = useSettings();
  const { user } = useAuth();
  // Pengguna yang terikat unit hanya membuat audit untuk unitnya sendiri.
  const myUnit = !settings.unit_scope || ['admin', 'infraadmin', 'superadmin'].includes(user.role) ? '' : String(user.unit || '').trim();
  // Jenis lama tetap muncul walau sudah dihapus dari daftar di Pengaturan.
  const types = audit?.type && !settings.audit_types.includes(audit.type) ? [audit.type, ...settings.audit_types] : settings.audit_types;
  const users = useLoad(() => api.get('/users'), []);
  const templates = useLoad(() => (isNew ? api.get('/templates') : Promise.resolve([])), [isNew]);
  const entities = useLoad(() => api.get('/planning/entities').catch(() => []), []);
  const [f, setF] = useState(() => ({
    title: audit?.title || '', unit: audit?.unit || myUnit, type: audit?.type || settings.audit_types[0] || '',
    lead_id: audit?.lead_id || '', approver_id: audit?.approver_id || '', team: audit?.team || '', member_ids: (audit?.members || []).map((m) => m.id), start_date: audit?.start_date || today(),
    end_date: audit?.end_date || '', status: audit?.status || 'Perencanaan', scope: audit?.scope || '', template_id: '', entity_id: audit?.entity_id || '',
    ...preset,
  }));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const body = { ...f, lead_id: f.lead_id ? Number(f.lead_id) : null, approver_id: f.approver_id ? Number(f.approver_id) : null, template_id: f.template_id ? Number(f.template_id) : undefined, entity_id: f.entity_id ? Number(f.entity_id) : null };
      if (!isNew) delete body.template_id;
      const saved = isNew ? await api.post('/audits', body) : await api.patch(`/audits/${audit.id}`, body);
      toast(isNew ? t('Audit dibuat') : t('Audit disimpan'));
      // Tutup dulu, lalu onSaved boleh berpindah halaman tanpa tertimpa.
      onClose();
      onSaved(saved);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    try {
      await api.del(`/audits/${audit.id}`);
      toast(t('Audit dihapus'));
      onDeleted?.();
    } catch (err) {
      setError(err.message);
    }
  }

  const auditors = (users.data || []).filter((u) => u.active && ['auditor', 'superadmin', 'admin'].includes(u.role));
  // Penyetuju: Manager (akun Manajemen) atau Kepala unit (auditee di unit yang diaudit).
  const approvers = (users.data || []).filter((u) => u.active && canApproveFor(u, f.unit));
  const approverGone = f.approver_id && audit?.approver_id === Number(f.approver_id) && !approvers.some((u) => u.id === Number(f.approver_id));
  const locked = ['persetujuan', 'disetujui'].includes(audit?.approval);
  // Anggota tim bisa dipilih dari semua pengguna aktif (kecuali akun Infra Admin developer).
  const people = (users.data || []).filter((u) => u.active && u.role !== 'infraadmin');
  const chosen = f.member_ids.map((id) => people.find((u) => u.id === id) || (audit?.members || []).find((m) => m.id === id)).filter(Boolean);
  const available = people.filter((u) => !f.member_ids.includes(u.id) && String(u.id) !== String(f.lead_id));
  return (
    <Sheet title={isNew ? t('Audit baru') : t('Ubah audit')} onClose={onClose}>
      <form className="form" onSubmit={submit}>
        <ReqNote />
        <label className="full"><span>{t('Judul audit')} <Req /></span><input id="a-title" required value={f.title} onChange={set('title')} placeholder={t('Audit Pengadaan Barang Semester II')} /></label>
        <label><span>{t('Unit yang diaudit')} <Req /></span><ComboInput id="a-unit" required options={settings.units} value={f.unit} onChange={set('unit')} readOnly={Boolean(myUnit)} placeholder={t('Divisi Pengadaan')} /><span className="hint">{myUnit ? t('Audit hanya bisa dibuat untuk unit Anda.') : t('Auditee di unit ini bisa melihat temuannya.')}</span></label>
        <label><span>{t('Jenis audit')} <Req /></span><select id="a-type" required value={f.type} onChange={set('type')}><option value="">{t('Pilih jenis')}</option>{types.map((x) => <option key={x} value={x}>{t(x)}</option>)}</select></label>
        <label>{t('Ketua tim')}<select id="a-lead" value={f.lead_id} onChange={set('lead_id')}><option value="">{t('Pilih auditor')}</option>{auditors.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select></label>
        <label>{t('Penyetuju laporan')}
          <select id="a-approver" value={f.approver_id} onChange={set('approver_id')}>
            <option value="">{t('Pilih Manager atau Kepala unit')}</option>
            {approverGone && <option value={audit.approver_id}>{audit.approver_name}</option>}
            {approvers.map((u) => <option key={u.id} value={u.id}>{u.name} · {u.role === 'manajemen' ? t('Manager') : t('Kepala unit')}{u.unit ? ` · ${u.unit}` : ''}</option>)}
          </select>
          <span className="hint">{t('Akun Manajemen, atau auditee di unit yang diaudit.')}</span>
        </label>
        <div className="group full">
          <label htmlFor="a-members">{t('Anggota tim')}</label>
          <select id="a-members" value="" onChange={(e) => e.target.value && setF({ ...f, member_ids: [...f.member_ids, Number(e.target.value)] })}>
            <option value="">{available.length ? t('Pilih pengguna untuk ditambahkan') : t('Semua pengguna sudah dipilih')}</option>
            {available.map((u) => <option key={u.id} value={u.id}>{u.name} · {ROLES[u.role]}{u.unit ? ` · ${u.unit}` : ''}</option>)}
          </select>
          {chosen.length > 0 && (
            <span className="chips">
              {chosen.map((u) => (
                <span className="chip" key={u.id}>{u.name}
                  <button type="button" aria-label={t('Hapus {name} dari tim', { name: u.name })} onClick={() => setF({ ...f, member_ids: f.member_ids.filter((x) => x !== u.id) })}>×</button>
                </span>
              ))}
            </span>
          )}
        </div>
        <label className="full">{t('Anggota eksternal')}<input id="a-team" value={f.team} onChange={set('team')} placeholder={t('Contoh: Andi (KAP Sejahtera), Rina')} /><span className="hint">{t('Untuk anggota yang tidak punya akun. Pisahkan dengan koma.')}</span></label>
        <label>{t('Tanggal mulai')}<input id="a-start" type="date" value={f.start_date || ''} onChange={set('start_date')} /></label>
        <label>{t('Tanggal selesai')}<input id="a-end" type="date" value={f.end_date || ''} onChange={set('end_date')} /></label>
        <label><span>{t('Status')} <Req /></span><select id="a-status" value={f.status} onChange={set('status')}>{AUDIT_STATUS.map((s) => <option key={s} value={s}>{t(s)}</option>)}</select></label>
        {isNew ? (
          <label>{t('Template program kerja')}<select id="a-tpl" value={f.template_id} onChange={set('template_id')}><option value="">{t('Tanpa template')}</option>{(templates.data || []).map((tp) => <option key={tp.id} value={tp.id}>{t('{name} ({n} langkah)', { name: tp.name, n: tp.steps.length })}</option>)}</select><span className="hint">{t('Langkah bisa ditambah atau dihapus nanti.')}</span></label>
        ) : <span />}
        {(entities.data || []).length > 0 && (
          <label className="full">{t('Area di audit universe')}
            <select id="a-entity" value={f.entity_id || ''} onChange={set('entity_id')} disabled={Boolean(preset?.plan_item_id)}>
              <option value="">{t('Tanpa area')}</option>
              {entities.data.filter((x) => x.active || x.id === Number(f.entity_id)).map((x) => <option key={x.id} value={x.id}>{x.name} · {t(x.kind)}</option>)}
            </select>
            <span className="hint">{preset?.plan_item_id ? t('Audit ini dibuat dari rencana audit tahunan.') : t('Menghubungkan audit ke area agar tanggal audit terakhirnya tercatat untuk penilaian risiko.')}</span>
          </label>
        )}
        <label className="full">{t('Ruang lingkup dan tujuan')}<textarea id="a-scope" value={f.scope} onChange={set('scope')} /></label>
        {locked && <div className="notice full">{t('Laporan audit ini sedang menunggu persetujuan atau sudah disetujui, jadi isinya tidak bisa diubah. Yang masih bisa diubah hanya status.')}</div>}
        {error && <div className="error-text full" role="alert">{error}</div>}
        <div className="form-foot full">
          {!isNew && <span className="left"><ConfirmDelete label={t('Hapus audit')} question={t('Hapus audit ini beserta semua temuan dan buktinya?')} onConfirm={remove} /></span>}
          <button type="button" className="btn" onClick={onClose}>{t('Batal')}</button>
          <button className="btn primary" disabled={busy}>{isNew ? t('Buat audit') : t('Simpan')}</button>
        </div>
      </form>
    </Sheet>
  );
}
