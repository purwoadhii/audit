import { useState } from 'react';
import { api } from '../api.js';
import { AUDIT_STATUS, ROLES } from '../util.js';
import { useSettings } from '../settings.jsx';
import { ConfirmDelete, Req, ReqNote, Sheet, useLoad, useToast } from './ui.jsx';
import { t } from '../i18n.jsx';

const today = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);

export default function AuditForm({ audit, onClose, onSaved, onDeleted }) {
  const isNew = !audit;
  const toast = useToast();
  const { settings } = useSettings();
  // Jenis lama tetap muncul walau sudah dihapus dari daftar di Pengaturan.
  const types = audit?.type && !settings.audit_types.includes(audit.type) ? [audit.type, ...settings.audit_types] : settings.audit_types;
  const users = useLoad(() => api.get('/users'), []);
  const templates = useLoad(() => (isNew ? api.get('/templates') : Promise.resolve([])), [isNew]);
  const [f, setF] = useState(() => ({
    title: audit?.title || '', unit: audit?.unit || '', type: audit?.type || settings.audit_types[0] || '',
    lead_id: audit?.lead_id || '', team: audit?.team || '', member_ids: (audit?.members || []).map((m) => m.id), start_date: audit?.start_date || today(),
    end_date: audit?.end_date || '', status: audit?.status || 'Perencanaan', scope: audit?.scope || '', template_id: '',
  }));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const body = { ...f, lead_id: f.lead_id ? Number(f.lead_id) : null, template_id: f.template_id ? Number(f.template_id) : undefined };
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

  const auditors = (users.data || []).filter((u) => u.active && (u.role === 'auditor' || u.role === 'admin'));
  // Anggota tim bisa dipilih dari semua pengguna aktif (kecuali akun Infra Admin developer).
  const people = (users.data || []).filter((u) => u.active && u.role !== 'infraadmin');
  const chosen = f.member_ids.map((id) => people.find((u) => u.id === id) || (audit?.members || []).find((m) => m.id === id)).filter(Boolean);
  const available = people.filter((u) => !f.member_ids.includes(u.id) && String(u.id) !== String(f.lead_id));
  return (
    <Sheet title={isNew ? t('Audit baru') : t('Ubah audit')} onClose={onClose}>
      <form className="form" onSubmit={submit}>
        <ReqNote />
        <label className="full"><span>{t('Judul audit')} <Req /></span><input id="a-title" required value={f.title} onChange={set('title')} placeholder={t('Audit Pengadaan Barang Semester II')} /></label>
        <label><span>{t('Unit yang diaudit')} <Req /></span><input id="a-unit" required list="unit-list" value={f.unit} onChange={set('unit')} placeholder={t('Divisi Pengadaan')} /><datalist id="unit-list">{settings.units.map((u) => <option key={u} value={u} />)}</datalist><span className="hint">{t('Auditee di unit ini bisa melihat temuannya.')}</span></label>
        <label><span>{t('Jenis audit')} <Req /></span><select id="a-type" required value={f.type} onChange={set('type')}><option value="">{t('Pilih jenis')}</option>{types.map((x) => <option key={x} value={x}>{t(x)}</option>)}</select></label>
        <label>{t('Ketua tim')}<select id="a-lead" value={f.lead_id} onChange={set('lead_id')}><option value="">{t('Pilih auditor')}</option>{auditors.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select></label>
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
        <label className="full">{t('Ruang lingkup dan tujuan')}<textarea id="a-scope" value={f.scope} onChange={set('scope')} /></label>
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
