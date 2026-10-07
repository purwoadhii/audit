import { useRef, useState } from 'react';
import { api } from '../api.js';
import { fmtSize } from '../util.js';
import { Sheet, useToast } from './ui.jsx';

// Daftar file bukti dengan tombol unggah. `uploadUrl` null berarti hanya baca.
export default function Attachments({ items, uploadUrl, canDelete, onChange }) {
  const input = useRef();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState(null);

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
      toast('Bukti diunggah');
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
              <span className="t-sub num">{fmtSize(a.size)}</span>
              {['done', 'ocr'].includes(a.text_status) && (
                <button type="button" className="btn ghost small" onClick={() => showText(a)} title="Teks yang terbaca dari file ini">
                  {a.text_status === 'ocr' ? <span className="text-badge">OCR</span> : null} Lihat teks
                </button>
              )}
              {a.text_status === 'pending' && <span className="t-sub">Sedang dibaca…</span>}
              {canDelete(a) && <button type="button" className="btn ghost small" onClick={() => remove(a.id)} aria-label={`Hapus ${a.filename}`}>Hapus</button>}
            </li>
          ))}
        </ul>
      ) : <div className="t-sub">Belum ada file bukti.</div>}
      {view && (
        <Sheet title={view.filename} onClose={() => setView(null)}>
          {view.loading ? <div className="t-sub">Memuat…</div> : view.error ? <div className="error-text">{view.error}</div> : (
            <>
              <p className="t-sub">{view.status === 'ocr' ? 'Dibaca dengan OCR. Periksa kembali angka dan nama penting dengan file aslinya.' : 'Teks yang terbaca dari file.'}</p>
              <div className="text-view">{view.text || 'Tidak ada teks.'}</div>
            </>
          )}
        </Sheet>
      )}
      {uploadUrl && (
        <div style={{ marginTop: 10 }}>
          <input ref={input} type="file" hidden onChange={upload} accept=".pdf,.png,.jpg,.jpeg,.gif,.webp,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.csv,.txt,.zip" />
          <button type="button" className="btn" disabled={busy} onClick={() => input.current.click()}>{busy ? 'Mengunggah…' : 'Unggah bukti'}</button>
          <span className="t-sub" style={{ marginLeft: 8 }}>PDF, gambar, Office, atau ZIP</span>
        </div>
      )}
    </div>
  );
}
