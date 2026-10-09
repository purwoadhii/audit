import { useRef, useState } from 'react';
import { api } from '../api.js';
import { useToast } from '../components/ui.jsx';

// Menu OCR: baca teks dari foto, PDF hasil scan, atau dokumen Office tanpa menyimpan file.
export default function Ocr() {
  const toast = useToast();
  const input = useRef();
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  async function read(file) {
    if (!file) return;
    setBusy(true);
    setError('');
    setResult(null);
    try {
      setResult(await api.upload('/ocr', file));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(result.text);
      toast('Teks disalin');
    } catch {
      toast('Tidak bisa menyalin. Pilih teks lalu tekan Ctrl+C.', 'error');
    }
  }

  function download() {
    const url = URL.createObjectURL(new Blob([result.text], { type: 'text/plain;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `${result.filename.replace(/\.[^.]+$/, '')}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <div className="bar"><h2>OCR (baca teks dokumen)</h2></div>
      <div
        className={`panel ocr-drop${drag ? ' drag' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); read(e.dataTransfer.files[0]); }}
      >
        <input ref={input} type="file" hidden accept=".png,.jpg,.jpeg,.gif,.webp,.pdf,.docx,.xlsx,.pptx,.txt,.csv" onChange={(e) => { read(e.target.files[0]); e.target.value = ''; }} />
        <p>Tarik file ke sini, atau</p>
        <button className="btn primary" disabled={busy} onClick={() => input.current.click()}>{busy ? 'Membaca…' : 'Pilih file'}</button>
        <p className="t-sub">
          Foto atau scan (JPG, PNG), PDF termasuk hasil scan, Word, Excel, dan PowerPoint. Teks dibaca dalam bahasa Indonesia dan
          Inggris di server aplikasi, dan file tidak disimpan. Scan yang tebal bisa memerlukan waktu agak lama.
        </p>
      </div>
      {error && <div className="panel error-text" role="alert" style={{ marginTop: 12 }}>{error}</div>}
      {result && (
        <div className="panel" style={{ marginTop: 12 }}>
          <div className="bar" style={{ marginBottom: 8, justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
            <div>
              <h3 style={{ margin: 0 }}>{result.filename}</h3>
              <span className="t-sub">{result.ocr ? 'Dibaca dengan OCR' : 'Teks diambil dari dokumen'} · {result.text.length.toLocaleString('id-ID')} karakter · {(result.ms / 1000).toFixed(1)} detik</span>
            </div>
            {result.text && (
              <div style={{ display: 'flex', gap: 6 }}>
                <button className="btn" onClick={copy}>Salin</button>
                <button className="btn" onClick={download}>Unduh .txt</button>
              </div>
            )}
          </div>
          {result.ocr && <p className="t-sub">Hasil OCR bisa keliru. Periksa kembali angka dan nama penting dengan dokumen aslinya.</p>}
          <div className="text-view">{result.text || 'Tidak ada teks yang terbaca.'}</div>
        </div>
      )}
      <p className="t-sub" style={{ marginTop: 12 }}>
        File bukti yang diunggah di temuan dan audit juga dibaca otomatis. Teksnya bisa dilihat dari tombol "Lihat teks" di daftar file,
        dan bisa dicari lewat Asisten AI.
      </p>
    </>
  );
}
