import { useState } from 'react';
import { api } from '../api.js';
import { FINDING_STATUS, RISKS } from '../util.js';
import { Req, Sheet, useLoad, useToast } from './ui.jsx';
import { N_, t } from '../i18n.jsx';

const TEXTS = [
  ['condition', N_('Kondisi'), N_('Apa yang ditemukan di lapangan')],
  ['criteria', N_('Kriteria'), N_('Aturan, SOP, atau standar yang seharusnya berlaku')],
  ['cause', N_('Sebab'), ''],
  ['effect', N_('Akibat'), ''],
  ['recommendation', N_('Rekomendasi'), ''],
  ['response', N_('Tanggapan auditee'), ''],
];
const LABEL = {
  temuan: { tab: N_('Temuan ({n})'), item: N_('Temuan #{n}'), add: N_('Tambah temuan'), title: N_('Judul temuan') },
  isu: { tab: N_('Isu ({n})'), item: N_('Isu #{n}'), add: N_('Tambah isu'), title: N_('Judul isu') },
};

let seq = 0;
const blank = (kind) => ({
  key: ++seq, kind, title: '', risk: 'Sedang', status: 'Terbuka', owner_id: '', due_date: '',
  condition: '', criteria: '', cause: '', effect: '', recommendation: '', response: '',
});
// Blok yang belum disentuh sama sekali dilewati saat menyimpan.
const touched = (x) => [x.title, x.owner_id, x.due_date, ...TEXTS.map(([k]) => x[k])].some((v) => String(v).trim());

// Menambah beberapa temuan dan isu sekaligus ke satu audit, dengan tab Temuan dan Isu.
export default function FindingBatchSheet({ audit, initialKind = 'temuan', onClose, onSaved }) {
  const toast = useToast();
  const users = useLoad(() => api.get('/users'), []);
  const [tab, setTab] = useState(initialKind);
  const [items, setItems] = useState(() => [blank('temuan'), blank('isu')]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const owners = (users.data || []).filter((u) => u.active);

  const shown = items.filter((x) => x.kind === tab);
  const count = (kind) => items.filter((x) => x.kind === kind && touched(x)).length;
  const update = (key, k) => (e) => setItems((all) => all.map((x) => (x.key === key ? { ...x, [k]: e.target.value } : x)));
  const remove = (key) => setItems((all) => all.filter((x) => x.key !== key));
  const add = () => setItems((all) => [...all, blank(tab)]);

  async function submit(e) {
    e.preventDefault();
    setError('');
    const filled = items.filter(touched);
    if (!filled.length) return setError(t('Isi minimal satu temuan atau isu.'));
    const missing = filled.find((x) => !x.title.trim());
    if (missing) {
      const no = items.filter((x) => x.kind === missing.kind).indexOf(missing) + 1;
      setTab(missing.kind);
      return setError(t('{item}: {field} wajib diisi.', { item: t(LABEL[missing.kind].item, { n: no }), field: t(LABEL[missing.kind].title) }));
    }
    setBusy(true);
    try {
      const body = filled.map(({ key, ...x }) => ({ ...x, owner_id: x.owner_id ? Number(x.owner_id) : null, due_date: x.due_date || null }));
      await api.post('/findings/batch', { audit_id: audit.id, items: body });
      const nF = filled.filter((x) => x.kind === 'temuan').length;
      const nI = filled.length - nF;
      toast(t('{f} temuan dan {i} isu disimpan', { f: nF, i: nI }));
      onSaved();
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet title={t('Tambah temuan dan isu')} onClose={onClose}>
      <form className="form" onSubmit={submit} noValidate>
        <div className="full">
          <div className="hint" style={{ fontWeight: 700 }}>{t('Audit')}</div>
          <div className="ro">{audit.code} · {audit.title}</div>
        </div>
        <nav className="subtabs full" style={{ marginBottom: 0 }} role="tablist">
          {['temuan', 'isu'].map((k) => (
            <button key={k} type="button" role="tab" aria-selected={tab === k} className={tab === k ? 'active' : ''} onClick={() => setTab(k)}>
              {t(LABEL[k].tab, { n: count(k) })}
            </button>
          ))}
        </nav>
        {shown.map((x, i) => (
          <fieldset className="fs two" key={x.key}>
            <legend>{t(LABEL[tab].item, { n: i + 1 })}</legend>
            <div className="full fs-head"><button type="button" className="btn ghost" onClick={() => remove(x.key)}>{t('Hapus')}</button></div>
            <label className="full"><span>{t(LABEL[tab].title)} <Req /></span><input id={`b-title-${x.key}`} value={x.title} onChange={update(x.key, 'title')} /></label>
            <label><span>{t('Tingkat risiko')} <Req /></span><select value={x.risk} onChange={update(x.key, 'risk')}>{RISKS.map((r) => <option key={r} value={r}>{t(r)}</option>)}</select></label>
            <label><span>{t('Status tindak lanjut')} <Req /></span><select value={x.status} onChange={update(x.key, 'status')}>{FINDING_STATUS.map((s) => <option key={s} value={s}>{t(s)}</option>)}</select></label>
            <label>{t('Penanggung jawab (PIC)')}<select value={x.owner_id} onChange={update(x.key, 'owner_id')}><option value="">{t('Belum ditentukan')}</option>{owners.map((u) => <option key={u.id} value={u.id}>{u.name}{u.unit ? ` · ${u.unit}` : ''}</option>)}</select></label>
            <label>{t('Batas waktu')}<input type="date" value={x.due_date} onChange={update(x.key, 'due_date')} /></label>
            {TEXTS.map(([k, label, hint]) => (
              <label className="full" key={k}>{t(label)}{hint && <span className="hint">{t(hint)}</span>}<textarea value={x[k]} onChange={update(x.key, k)} /></label>
            ))}
          </fieldset>
        ))}
        {!shown.length && <div className="full t-sub">{tab === 'isu' ? t('Belum ada isu di form ini.') : t('Belum ada temuan di form ini.')}</div>}
        <div className="full"><button type="button" className="btn" onClick={add}>+ {t(LABEL[tab].add)}</button></div>
        {error && <div className="error-text full" role="alert">{error}</div>}
        <div className="form-foot full sticky-foot">
          <span className="left t-sub">{t('Blok yang dibiarkan kosong tidak disimpan.')}</span>
          <button type="button" className="btn" onClick={onClose}>{t('Batal')}</button>
          <button className="btn primary" disabled={busy}>{t('Simpan')}</button>
        </div>
      </form>
    </Sheet>
  );
}
