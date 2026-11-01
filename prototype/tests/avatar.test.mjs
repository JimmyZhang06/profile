import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeAvatar } from '../server/cloud/avatar.mjs';
import { avatarCrop, safeAvatar } from '../src/lib/avatar.js';
import { avatarFixture } from './fixtures/avatar.mjs';

test('account avatar keeps raster pixels but strips metadata and supports removal', () => {
  assert.equal(normalizeAvatar(avatarFixture({ metadata: true })), avatarFixture());
  assert.equal(normalizeAvatar(null), null);
  assert.equal(safeAvatar('https://external.example/avatar.png'), null);
  assert.equal(safeAvatar(avatarFixture()), avatarFixture());
});
test('avatar validation rejects fake images, corrupt streams, oversized dimensions and decompression bombs', () => {
  const corrupt = Buffer.from(avatarFixture().slice(22), 'base64'); corrupt[45] ^= 1;
  for (const image of [undefined, '', 'https://example.test/image', 'data:image/svg+xml;base64,PHN2Zz4=', 'data:image/png;base64,AAAA',
    'data:image/png;base64,' + corrupt.toString('base64'), avatarFixture({ width: 257 }), avatarFixture({ height: 24 }),
    avatarFixture({ inflatedSize: 1024 * 1024 }), avatarFixture().slice(0, -8), 'data:image/png;base64,' + 'A'.repeat(240000)]) {
    assert.throws(() => normalizeAvatar(image), error => error.code === 'INVALID_AVATAR');
  }
});
test('avatar crop covers the circle at every edge and clamps offsets after zooming out', () => {
  for (const [width, height] of [[800, 400], [400, 800], [32, 32]]) {
    for (const zoom of [1, 2, 3]) {
      for (const position of [{x: 9999, y: -9999}, {x: -9999, y: 9999}]) {
        const crop = avatarCrop(width, height, zoom, position);
        assert(crop.left <= 0 && crop.top <= 0);
        assert(crop.left + width * crop.scale >= 240 && crop.top + height * crop.scale >= 240);
      }
    }
  }
  assert.deepEqual(avatarCrop(400,400,1,{x:400,y:400}), {x:0,y:0,scale:.6,left:0,top:0});
});
