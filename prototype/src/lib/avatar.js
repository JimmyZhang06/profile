export const AVATAR_SIZE = 192;
export function safeAvatar(value) {
  return typeof value === 'string' && value.length <= 230000 && /^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(value) ? value : null;
}

export function avatarCrop(width, height, zoom = 1, position = { x: 0, y: 0 }, size = 240) {
  const scale = Math.max(size / width, size / height) * Math.max(1, Math.min(3, zoom));
  const limitX = Math.max(0, (width * scale - size) / 2), limitY = Math.max(0, (height * scale - size) / 2);
  const x = Math.max(-limitX, Math.min(limitX, position.x)), y = Math.max(-limitY, Math.min(limitY, position.y));
  return { x, y, scale, left: (size - width * scale) / 2 + x, top: (size - height * scale) / 2 + y };
}

export async function readAvatarFile(file) {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('请选择 JPG、PNG 或 WebP 图片。');
  if (!file.size || file.size > 8 * 1024 * 1024) throw new Error('请选择不超过 8 MB 的图片。');
  let bitmap;
  try { bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' }); }
  catch { throw new Error('这张图片无法读取，请换一张图片。'); }
  if (bitmap.width < 16 || bitmap.height < 16 || bitmap.width * bitmap.height > 32000000) {
    bitmap.close(); throw new Error('图片尺寸不合适，请选择至少 16 × 16、总像素不超过 3200 万的图片。');
  }
  return bitmap;
}

export function drawAvatar(canvas, bitmap, zoom, position) {
  const crop = avatarCrop(bitmap.width, bitmap.height, zoom, position);
  const context = canvas.getContext('2d');
  const ratio = canvas.width / 240;
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.drawImage(bitmap, crop.left * ratio, crop.top * ratio, bitmap.width * crop.scale * ratio, bitmap.height * crop.scale * ratio);
  return crop;
}
