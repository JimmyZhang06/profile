import { inflateSync } from "node:zlib";
import { assert } from "./security.mjs";
const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
// Browser decodes JPEG/PNG to bounded RGB(A) PNG before upload. Verify its
// actual scanlines and CRCs, then discard every ancillary metadata chunk.
export function normalizeEvidence(bytes) {
  const valid = (value) =>
    assert(value, 400, "凭证图片无法读取，请重新选择 JPEG 或 PNG 图片");
  assert(bytes.length <= 3 * 1024 * 1024, 413, "单张凭证最多 3 MB");
  valid(bytes.subarray(0, 8).equals(signature));
  let offset = 8,
    width,
    height,
    channels,
    ended = false;
  const output = [signature],
    data = [];
  while (offset + 12 <= bytes.length) {
    const length = bytes.readUInt32BE(offset),
      end = offset + length + 12;
    valid(end <= bytes.length);
    const type = bytes.toString("ascii", offset + 4, offset + 8),
      chunk = bytes.subarray(offset + 8, end - 4);
    valid(
      crc32(bytes.subarray(offset + 4, end - 4)) ===
        bytes.readUInt32BE(end - 4),
    );
    if (!width) {
      valid(type === "IHDR" && length === 13);
      width = chunk.readUInt32BE(0);
      height = chunk.readUInt32BE(4);
      channels = chunk[9] === 6 ? 4 : 3;
      valid(
        width > 0 &&
          height > 0 &&
          width <= 2000 &&
          height <= 2000 &&
          chunk[8] === 8 &&
          [2, 6].includes(chunk[9]) &&
          chunk[10] === 0 &&
          chunk[11] === 0 &&
          chunk[12] === 0,
      );
      output.push(bytes.subarray(offset, end));
    } else if (type === "IDAT") {
      data.push(chunk);
      output.push(bytes.subarray(offset, end));
    } else if (type === "IEND") {
      valid(length === 0 && data.length && end === bytes.length);
      output.push(bytes.subarray(offset, end));
      ended = true;
      break;
    } else
      valid(
        /^[a-z][A-Za-z]{3}$/.test(type) &&
          !["acTL", "fcTL", "fdAT"].includes(type),
      );
    offset = end;
  }
  valid(ended);
  const stride = width * channels + 1,
    expected = stride * height;
  let decoded;
  try {
    decoded = inflateSync(Buffer.concat(data), { maxOutputLength: expected });
  } catch {
    valid(false);
  }
  valid(decoded.length === expected);
  for (let row = 0; row < height; row++) valid(decoded[row * stride] <= 4);
  return Buffer.concat(output);
}
