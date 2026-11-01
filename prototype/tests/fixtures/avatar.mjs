import { crc32, deflateSync } from 'node:zlib';
export function pngChunk(type, data) {
  const name = Buffer.from(type), length = Buffer.alloc(4), checksum = Buffer.alloc(4);
  length.writeUInt32BE(data.length); checksum.writeUInt32BE(crc32(Buffer.concat([name, data])));
  return Buffer.concat([length, name, data, checksum]);
}
export function avatarFixture({ width = 32, height = width, metadata = false, inflatedSize } = {}) {
  const header = Buffer.alloc(13); header.writeUInt32BE(width); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = 6;
  const raw = Buffer.alloc(inflatedSize || (width * 4 + 1) * height);
  if (!inflatedSize) for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const at = y * (width * 4 + 1) + 1 + x * 4;
    raw.set([Math.round(x / width * 230), Math.round(y / height * 180), 135, 255], at);
  }
  return 'data:image/png;base64,' + Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), pngChunk('IHDR', header),
    ...(metadata ? [pngChunk('tEXt', Buffer.from('Test metadata\0discard this'))] : []),
    pngChunk('IDAT', deflateSync(raw)), pngChunk('IEND', Buffer.alloc(0)),
  ]).toString('base64');
}
