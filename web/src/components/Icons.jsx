import logoOti from '../assets/logo-oti.webp';

// Logo OTI: logo aplikasi di halaman login dan bilah atas.
export function Logo({ size = 24 }) {
  return <img src={logoOti} width={size} height={size} alt="" aria-hidden="true" style={{ display: 'block' }} />;
}
