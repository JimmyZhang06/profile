import { crc32, inflateSync } from 'node:zlib';
import { assert } from './security.mjs';

const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const maximumBytes = 160 * 1024;

// The browser sends a small raster crop. Validate the actual PNG, then keep
// only image chunks so metadata is never retained in an account avatar.
export function normalizeAvatar(image) {
  if (image === null) return null;
  const valid = condition => assert(condition, 400, '头像图片无法读取，请重新选择图片。', 'INVALID_AVATAR');
  valid(typeof image === 'string' && image.length <= maximumBytes * 1.4 + 22);
  valid(/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(image));
  const encoded = image.slice(22), bytes = Buffer.from(encoded, 'base64');
  valid(bytes.length <= maximumBytes && bytes.toString('base64') === encoded && bytes.subarray(0, 8).equals(signature));
  let offset = 8, header, width, height, channels, ended = false, dataEnded = false;
  const imageChunks = [], output = [signature];
  while (offset + 12 <= bytes.length) {
    const length = bytes.readUInt32BE(offset), end = offset + length + 12;
    valid(end <= bytes.length);
    const type = bytes.toString('ascii', offset + 4, offset + 8), data = bytes.subarray(offset + 8, end - 4);
    valid(/^[A-Za-z]{4}$/.test(type) && crc32(bytes.subarray(offset + 4, end - 4)) === bytes.readUInt32BE(end - 4));
    if (!header) {
      valid(type === 'IHDR' && length === 13);
      width = data.readUInt32BE(0); height = data.readUInt32BE(4);
      valid(width >= 16 && width <= 256 && width === height && data[8] === 8 && [2, 6].includes(data[9]) && data[10] === 0 && data[11] === 0 && data[12] === 0);
      channels = data[9] === 6 ? 4 : 3;
      header = true;
      output.push(bytes.subarray(offset, end));
    } else if (type === 'IDAT') {
      valid(!dataEnded);
      imageChunks.push(data); output.push(bytes.subarray(offset, end));
    } else if (type === 'IEND') {
      valid(length === 0 && imageChunks.length && end === bytes.length);
      output.push(bytes.subarray(offset, end)); ended = true; break;
    } else {
      // Unknown critical chunks and animated PNGs are not account images.
      valid(type[0] === type[0].toLowerCase() && !['acTL', 'fcTL', 'fdAT'].includes(type));
      if (imageChunks.length) dataEnded = true;
    }
    offset = end;
  }
  valid(ended);
  const stride = width * channels + 1, expected = stride * height;
  let decoded;
  try { decoded = inflateSync(Buffer.concat(imageChunks), { maxOutputLength: expected }); }
  catch { valid(false); }
  valid(decoded.length === expected);
  for (let row = 0; row < height; row++) valid(decoded[row * stride] <= 4);
  return 'data:image/png;base64,' + Buffer.concat(output).toString('base64');
}

export function storedAvatar(image) {
  return typeof image === 'string' && image.startsWith('data:image/png;base64,') && image.length <= maximumBytes * 1.4 + 22 ? image : null;
}
