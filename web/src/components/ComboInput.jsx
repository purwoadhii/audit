import { useId, useState } from 'react';

// Isian teks dengan daftar saran buatan sendiri. Pengganti <datalist>, yang warnanya ikut tema
// sistem operasi (bisa hitam di Windows mode gelap) dan tidak bisa diatur lewat CSS.
// options: daftar teks, atau { value, note } bila ada keterangan di sampingnya.
export default function ComboInput({ options, value, onChange, readOnly, ...rest }) {
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const items = options.map((o) => (typeof o === 'string' ? { value: o } : o));
  const needle = String(value || '').toLowerCase();
  // Bila isian sudah sama persis dengan salah satu pilihan, tampilkan semua pilihan.
  const exact = items.some((o) => o.value.toLowerCase() === needle);
  const shown = !needle || exact ? items : items.filter((o) => o.value.toLowerCase().includes(needle));
  const show = open && !readOnly && shown.length > 0;

  const pick = (v) => {
    onChange({ target: { value: v } });
    setOpen(false);
    setActive(-1);
  };
  function onKeyDown(e) {
    if (readOnly) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      setOpen(true);
      const step = e.key === 'ArrowDown' ? 1 : -1;
      setActive((i) => (shown.length ? (i + step + shown.length) % shown.length : -1));
    } else if (e.key === 'Enter' && show && active >= 0) {
      e.preventDefault();
      pick(shown[active].value);
    } else if (e.key === 'Escape' && show) {
      e.stopPropagation();
      setOpen(false);
    }
  }

  return (
    <span className="combo">
      <input {...rest} value={value} readOnly={readOnly} autoComplete="off" role="combobox" aria-expanded={show} aria-controls={listId}
        onChange={(e) => { onChange(e); setOpen(true); setActive(-1); }}
        onFocus={() => setOpen(true)} onBlur={() => setOpen(false)} onKeyDown={onKeyDown} />
      {show && (
        <ul className="combo-list" id={listId} role="listbox">
          {shown.map((o, i) => (
            <li key={o.value} role="option" aria-selected={i === active} className={i === active ? 'active' : ''}
              onMouseDown={(e) => { e.preventDefault(); pick(o.value); }} onMouseEnter={() => setActive(i)}>
              <span>{o.value}</span>{o.note && <span className="t-sub">{o.note}</span>}
            </li>
          ))}
        </ul>
      )}
    </span>
  );
}
