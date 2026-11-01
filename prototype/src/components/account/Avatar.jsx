import { safeAvatar } from '../../lib/avatar.js';

export function Avatar({ image, name = '', className = '' }) {
  const source = safeAvatar(image);
  return <span className={'avatar-image ' + className} aria-hidden="true">
    {source ? <img src={source} alt="" draggable="false" /> : Array.from(name.trim())[0]?.toUpperCase() || '我'}
  </span>;
}
