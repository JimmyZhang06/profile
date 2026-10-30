import brandMark from '../assets/luli-mark.svg';
import './brand-logo.css';

export function BrandLogo({ expanded = false }) {
  return <>
    <img className="brand-mark" src={brandMark} width="28" height="28" alt="" aria-hidden="true" draggable="false" />
    {expanded ? <span className="brand-wordmark" aria-hidden="true">履历</span> : null}
  </>;
}
