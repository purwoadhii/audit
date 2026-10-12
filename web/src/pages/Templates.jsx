import { useState } from 'react';
import { api } from '../api.js';
import { ConfirmDelete, ErrorBox, Loading, Sheet, useLoad, useToast } from '../components/ui.jsx';
import { t } from '../i18n.jsx';

export default function Templates() {
  const { data, error, loading, reload } = useLoad(() => api.get('/templates'), []);
  const [editing, setEditing] = useState(null);
  if (loading && !data) return <Loading />;
  if (error) return <ErrorBox error={error} retry={reload} />;
  return (
    <>
      <div className="bar"><h2>{t('Template program kerja')}</h2><button className="btn primary" onClick={() => setEditing({})}>{t('Tambah template')}</button></div>
      <div className="tablebox">
        <table>
          <thead><tr><th>{t('Nama')}</th><th>{t('Jumlah langkah')}</th><th>{t('Langkah pertama')}</th></tr></thead>
          <tbody>{data.map((tpl) => (
            <tr key={tpl.id} className="click" onClick={() => setEditing(tpl)}><td className="t-title">{tpl.name}</td><td className="num">{tpl.steps.length}</td><td className="t-sub">{tpl.steps[0] || '—'}</td></tr>
          ))}</tbody>
        </table>
      </div>
      {editing && <TemplateForm tpl={editing.id ? editing : null} onClose={() => setEditing(null)} onSaved={reload} />}
    </>
  );
}

function TemplateForm({ tpl, onClose, onSaved }) {
  const toast = useToast();
  const [name, setName] = useState(tpl?.name || '');
  const [steps, setSteps] = useState((tpl?.steps || []).join('\n'));
  const [error, setError] = useState('');
  async function submit(e) {
    e.preventDefault();
    try {
      const body = { name, steps: steps.split('\n') };
      if (tpl) await api.patch(`/templates/${tpl.id}`, body); else await api.post('/templates', body);
      toast(t('Template disimpan'));
      onSaved();
      onClose();
    } catch (err) {
      setError(err.message);
    }
  }
  async function remove() {
    await api.del(`/templates/${tpl.id}`);
    onSaved();
    onClose();
  }
  return (
    <Sheet title={tpl ? tpl.name : t('Template baru')} onClose={onClose}>
      <form className="form" onSubmit={submit}>
        <label className="full">{t('Nama template')}<input id="t-name" required value={name} onChange={(e) => setName(e.target.value)} /></label>
        <label className="full">{t('Langkah pengujian')}<span className="hint">{t('Satu langkah per baris.')}</span><textarea id="t-steps" style={{ minHeight: 260 }} value={steps} onChange={(e) => setSteps(e.target.value)} /></label>
        {error && <div className="error-text full" role="alert">{error}</div>}
        <div className="form-foot full">
          {tpl && <span className="left"><ConfirmDelete question={t('Hapus template ini? Audit yang sudah dibuat tidak berubah.')} onConfirm={remove} /></span>}
          <button type="button" className="btn" onClick={onClose}>{t('Batal')}</button><button className="btn primary">{t('Simpan')}</button>
        </div>
      </form>
    </Sheet>
  );
}
