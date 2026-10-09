import { useState } from 'react';
import { api } from '../api.js';
import { AUDIT_STATUS, ROLES } from '../util.js';
import { useSettings } from '../settings.jsx';
import { ConfirmDelete, Req, ReqNote, Sheet, useLoad, useToast } from './ui.jsx';

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
      toast(isNew ? 'Audit dibuat' : 'Audit disimpan');
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
      toast('Audit dihapus');
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
    <Sheet title={isNew ? 'Audit baru' : 'Ubah audit'} onClose={onClose}>
      <form className="form" onSubmit={submit}>
        <ReqNote />
        <label className="full"><span>Judul audit <Req /></span><input id="a-title" required value={f.title} onChange={set('title')} placeholder="Audit Pengadaan Barang Semester II" /></label>
        <label><span>Unit yang diaudit <Req /></span><input id="a-unit" required list="unit-list" value={f.unit} onChange={set('unit')} placeholder="Divisi Pengadaan" /><datalist id="unit-list">{settings.units.map((u) => <option key={u} value={u} />)}</datalist><span className="hint">Auditee di unit ini bisa melihat temuannya.</span></label>
        <label><span>Jenis audit <Req /></span><select id="a-type" required value={f.type} onChange={set('type')}><option value="">Pilih jenis</option>{types.map((t) => <option key={t}>{t}</option>)}</select></label>
        <label>Ketua tim<select id="a-lead" value={f.lead_id} onChange={set('lead_id')}><option value="">Pilih auditor</option>{auditors.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select></label>
        <div className="group full">
          <label htmlFor="a-members">Anggota tim</label>
          <select id="a-members" value="" onChange={(e) => e.target.value && setF({ ...f, member_ids: [...f.member_ids, Number(e.target.value)] })}>
            <option value="">{available.length ? 'Pilih pengguna untuk ditambahkan' : 'Semua pengguna sudah dipilih'}</option>
            {available.map((u) => <option key={u.id} value={u.id}>{u.name} · {ROLES[u.role]}{u.unit ? ` · ${u.unit}` : ''}</option>)}
          </select>
          {chosen.length > 0 && (
            <span className="chips">
              {chosen.map((u) => (
                <span className="chip" key={u.id}>{u.name}
                  <button type="button" aria-label={`Hapus ${u.name} dari tim`} onClick={() => setF({ ...f, member_ids: f.member_ids.filter((x) => x !== u.id) })}>×</button>
                </span>
              ))}
            </span>
          )}
        </div>
        <label className="full">Anggota eksternal<input id="a-team" value={f.team} onChange={set('team')} placeholder="Contoh: Andi (KAP Sejahtera), Rina" /><span className="hint">Untuk anggota yang tidak punya akun. Pisahkan dengan koma.</span></label>
        <label>Mulai<input id="a-start" type="date" value={f.start_date || ''} onChange={set('start_date')} /></label>
        <label>Selesai<input id="a-end" type="date" value={f.end_date || ''} onChange={set('end_date')} /></label>
        <label><span>Status <Req /></span><select id="a-status" value={f.status} onChange={set('status')}>{AUDIT_STATUS.map((s) => <option key={s}>{s}</option>)}</select></label>
        {isNew ? (
          <label>Template program kerja<select id="a-tpl" value={f.template_id} onChange={set('template_id')}><option value="">Tanpa template</option>{(templates.data || []).map((t) => <option key={t.id} value={t.id}>{t.name} ({t.steps.length} langkah)</option>)}</select><span className="hint">Langkah bisa ditambah atau dihapus nanti.</span></label>
        ) : <span />}
        <label className="full">Ruang lingkup dan tujuan<textarea id="a-scope" value={f.scope} onChange={set('scope')} /></label>
        {error && <div className="error-text full" role="alert">{error}</div>}
        <div className="form-foot full">
          {!isNew && <span className="left"><ConfirmDelete label="Hapus audit" question="Hapus audit ini beserta semua temuan dan buktinya?" onConfirm={remove} /></span>}
          <button type="button" className="btn" onClick={onClose}>Batal</button>
          <button className="btn primary" disabled={busy}>{isNew ? 'Buat audit' : 'Simpan'}</button>
        </div>
      </form>
    </Sheet>
  );
}
