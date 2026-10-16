import { useRef, useState } from 'react';
import { api } from '../api.js';
import { fmtDateTime, fmtSize } from '../util.js';
import { Sheet, useToast } from './ui.jsx';
import { t } from '../i18n.jsx';

// Daftar file bukti dengan tombol unggah. `uploadUrl` null berarti hanya baca.
export default function Attachments({ items, uploadUrl, canDelete, onChange }) {
  const input = useRef();
  const versionInput = useRef();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState(null);
  const [history, setHistory] = useState(null); // { file, items }
  const [replacing, setReplacing] = useState(null); // file yang akan diganti dengan versi baru

  async function showVersions(a) {
    setHistory({ file: a, items: null });
    try {
      setHistory({ file: a, items: await api.get(`/attachments/${a.id}/versions`) });
    } catch (err) {
      setHistory(null);
      toast(err.message, 'error');
    }
  }

  async function uploadVersion(e) {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file || !replacing) return;
    setBusy(true);
    try {
      await api.upload(`/attachments/${replacing.id}/versions`, file);
      toast(t('Versi baru diunggah'));
      onChange();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setBusy(false);
      setReplacing(null);
    }
  }

  async function showText(a) {
    setView({ filename: a.filename, loading: true });
    try {
      setView(await api.get(`/attachments/${a.id}/text`));
    } catch (err) {
      setView({ filename: a.filename, error: err.message });
    }
  }

  async function upload(e) {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    setBusy(true);
    try {
      await api.upload(uploadUrl, file);
      toast(t('Bukti diunggah'));
      onChange();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  }

  async function remove(id) {
    try {
      await api.del(`/attachments/${id}`);
      onChange();
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  return (
    <div>
      {items.length ? (
        <ul className="files">
          {items.map((a) => (
            <li key={a.id}>
              <a href={`/api/attachments/${a.id}`} target="_blank" rel="noreferrer">{a.filename}</a>
              {a.version > 1 && <span className="pill">v{a.version}</span>}
              <span className="t-sub num">{fmtSize(a.size)}</span>
              {['done', 'ocr'].includes(a.text_status) && (
                <button type="button" className="btn ghost small" onClick={() => showText(a)} title={t('Teks yang terbaca dari file ini')}>
                  {a.text_status === 'ocr' ? <span className="text-badge">OCR</span> : null} {t('Lihat teks')}
                </button>
              )}
              {a.text_status === 'pending' && <span className="t-sub">{t('Sedang dibaca…')}</span>}
              {Number(a.versions) > 1 && <button type="button" className="btn ghost small" onClick={() => showVersions(a)}>{t('Riwayat versi ({n})', { n: a.versions })}</button>}
              {uploadUrl && <button type="button" className="btn ghost small" disabled={busy} onClick={() => { setReplacing(a); versionInput.current.click(); }}>{t('Unggah versi baru')}</button>}
              {canDelete(a) && <button type="button" className="btn ghost small" onClick={() => remove(a.id)} aria-label={t('Hapus {name}', { name: a.filename })}
                title={Number(a.versions) > 1 ? t('Semua versi file ini ikut terhapus.') : undefined}>{t('Hapus')}</button>}
            </li>
          ))}
        </ul>
      ) : <div className="t-sub">{t('Belum ada file bukti.')}</div>}
      {view && (
        <Sheet title={view.filename} onClose={() => setView(null)}>
          {view.loading ? <div className="t-sub">{t('Memuat…')}</div> : view.error ? <div className="error-text">{view.error}</div> : (
            <>
              <p className="t-sub">{view.status === 'ocr' ? t('Dibaca dengan OCR. Periksa kembali angka dan nama penting dengan file aslinya.') : t('Teks yang terbaca dari file.')}</p>
              <div className="text-view">{view.text || t('Tidak ada teks.')}</div>
            </>
          )}
        </Sheet>
      )}
      {history && (
        <Sheet title={t('Riwayat versi: {name}', { name: history.file.filename })} onClose={() => setHistory(null)}>
          {!history.items ? <div className="t-sub">{t('Memuat…')}</div> : (
            <table>
              <thead><tr><th>{t('Versi')}</th><th>{t('File')}</th><th>{t('Diunggah')}</th><th className="num">{t('Ukuran')}</th></tr></thead>
              <tbody>
                {history.items.map((v) => (
                  <tr key={v.id}>
                    <td>v{v.version}{v.id === history.items[0].id && <span className="t-sub"> · {t('terbaru')}</span>}</td>
                    <td><a href={`/api/attachments/${v.id}?download=1`}>{v.filename}</a></td>
                    <td className="t-sub">{v.uploaded_by_name || '—'} · {fmtDateTime(v.created_at)}</td>
                    <td className="num">{fmtSize(v.size)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Sheet>
      )}
      <input ref={versionInput} type="file" hidden onChange={uploadVersion} accept=".pdf,.png,.jpg,.jpeg,.gif,.webp,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.csv,.txt,.zip" />
      {uploadUrl && (
        <div style={{ marginTop: 10 }}>
          <input ref={input} type="file" hidden onChange={upload} accept=".pdf,.png,.jpg,.jpeg,.gif,.webp,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.csv,.txt,.zip" />
          <button type="button" className="btn" disabled={busy} onClick={() => input.current.click()}>{busy ? t('Mengunggah…') : t('Unggah bukti')}</button>
          <span className="t-sub" style={{ marginLeft: 8 }}>{t('PDF, gambar, Office, atau ZIP')}</span>
        </div>
      )}
    </div>
  );
}
