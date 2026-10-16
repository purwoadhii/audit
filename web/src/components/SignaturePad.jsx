import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { useLoad, useToast } from './ui.jsx';
import { t } from '../i18n.jsx';

// Tanda tangan elektronik pengguna: digambar dengan mouse, jari, atau pena, atau diunggah sebagai gambar.
// Disimpan sebagai PNG dan disalin ke laporan setiap kali pengguna mereview atau menyetujui laporan audit.
export default function SignaturePad() {
  const toast = useToast();
  const { data, reload } = useLoad(() => api.get('/auth/signature'), []);
  const canvas = useRef(null);
  const drawing = useRef(false);
  const [dirty, setDirty] = useState(false);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const current = data?.signature;

  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const ratio = window.devicePixelRatio || 1;
    c.width = c.clientWidth * ratio;
    c.height = c.clientHeight * ratio;
    const ctx = c.getContext('2d');
    ctx.scale(ratio, ratio);
    ctx.lineWidth = 2.2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#0B1F2E';
  }, [editing, current]);

  const point = (e) => {
    const r = canvas.current.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  };
  const down = (e) => {
    drawing.current = true;
    canvas.current.setPointerCapture(e.pointerId);
    const ctx = canvas.current.getContext('2d');
    ctx.beginPath();
    ctx.moveTo(...point(e));
  };
  const move = (e) => {
    if (!drawing.current) return;
    const ctx = canvas.current.getContext('2d');
    ctx.lineTo(...point(e));
    ctx.stroke();
    setDirty(true);
  };
  const up = () => { drawing.current = false; };
  const clear = () => {
    const c = canvas.current;
    c.getContext('2d').clearRect(0, 0, c.width, c.height);
    setDirty(false);
  };

  // Potong ruang kosong di sekitar coretan supaya tanda tangan tampil penuh di laporan.
  function trimmed() {
    const c = canvas.current;
    const { width: w, height: h } = c;
    const px = c.getContext('2d').getImageData(0, 0, w, h).data;
    let x0 = w; let y0 = h; let x1 = 0; let y1 = 0;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (px[(y * w + x) * 4 + 3] > 0) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    }
    if (x1 <= x0) return null;
    const pad = 8;
    const out = document.createElement('canvas');
    out.width = x1 - x0 + pad * 2;
    out.height = y1 - y0 + pad * 2;
    out.getContext('2d').drawImage(c, x0 - pad, y0 - pad, out.width, out.height, 0, 0, out.width, out.height);
    return out.toDataURL('image/png');
  }

  async function save(signature) {
    setBusy(true);
    try {
      await api.put('/auth/signature', { signature });
      toast(signature ? t('Tanda tangan disimpan') : t('Tanda tangan dihapus'));
      setEditing(false);
      setDirty(false);
      reload();
    } catch (err) { toast(err.message, 'error'); } finally { setBusy(false); }
  }

  function upload(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!/^image\/(png|jpeg)$/.test(file.type)) return toast(t('Tanda tangan harus berupa gambar PNG atau JPEG.'), 'error');
    if (file.size > 280 * 1024) return toast(t('Gambar tanda tangan terlalu besar (maksimal 300 KB).'), 'error');
    const r = new FileReader();
    r.onload = () => save(r.result);
    r.readAsDataURL(file);
  }

  return (
    <div className="panel sigpad">
      <h3 style={{ margin: 0 }}>{t('Tanda tangan elektronik')}</h3>
      <p className="t-sub" style={{ margin: 0 }}>{t('Dipakai saat Anda mereview atau menyetujui laporan audit. Laporan yang ditandatangani mendapat kode verifikasi dan QR yang bisa dicek siapa saja.')}</p>
      {current && !editing ? (
        <>
          <img className="current" src={current} alt={t('Tanda tangan saya')} />
          <div className="actions">
            <button type="button" className="btn" onClick={() => setEditing(true)}>{t('Ganti tanda tangan')}</button>
            <button type="button" className="btn ghost danger" disabled={busy} onClick={() => save(null)}>{t('Hapus')}</button>
          </div>
        </>
      ) : (
        <>
          <canvas ref={canvas} aria-label={t('Area tanda tangan')} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerLeave={up} />
          <span className="hint">{t('Tanda tangani di kotak ini dengan mouse, jari, atau pena.')}</span>
          <div className="actions">
            <button type="button" className="btn primary" disabled={!dirty || busy} onClick={() => save(trimmed())}>{t('Simpan tanda tangan')}</button>
            <button type="button" className="btn" onClick={clear}>{t('Ulangi')}</button>
            <label className="btn ghost">{t('Unggah gambar')}<input type="file" accept="image/png,image/jpeg" hidden onChange={upload} /></label>
            {current && <button type="button" className="btn ghost" onClick={() => setEditing(false)}>{t('Batal')}</button>}
          </div>
        </>
      )}
    </div>
  );
}
