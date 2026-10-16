import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { t } from '../i18n.jsx';

// Alamat halaman verifikasi tanda tangan elektronik untuk satu kode.
export const verifyUrl = (code) => `${window.location.origin}/verifikasi/${code}`;

export function useQr(code) {
  const [src, setSrc] = useState(null);
  useEffect(() => {
    if (!code) return undefined;
    let live = true;
    QRCode.toDataURL(verifyUrl(code), { margin: 0, width: 160, errorCorrectionLevel: 'M' }).then((u) => live && setSrc(u)).catch(() => {});
    return () => { live = false; };
  }, [code]);
  return code ? src : null;
}

// Satu kolom tanda tangan di laporan: jabatan, gambar tanda tangan atau tanda centang, nama, tanggal, dan kode verifikasi.
export default function SignBlock({ sign }) {
  const e = sign.entry;
  const qr = useQr(e?.sign_code);
  return (
    <span className="sign-col">
      {t(sign.title)}
      {e?.signature ? <img className="sign-img" src={e.signature} alt={t('Tanda tangan {name}', { name: sign.name || '' })} />
        : sign.note ? <div className="signed">✓ {sign.note}</div> : <div />}
      <b>{sign.name || ''}</b>
      {e?.signature && sign.note && <small className="t-sub">{sign.note}</small>}
      {e?.sign_code && (
        <small className="sign-code">
          {qr && <img src={qr} alt="" width="64" height="64" />}
          <span>{t('Ditandatangani secara elektronik')}<br />{t('Kode verifikasi')}: <b>{e.sign_code}</b><br /><span className="t-sub">{verifyUrl(e.sign_code).replace(/^https?:\/\//, '')}</span></span>
        </small>
      )}
    </span>
  );
}
