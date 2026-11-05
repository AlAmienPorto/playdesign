// @ts-nocheck — dieksekusi oleh Node/tsx, bukan build Vite.
import test from 'node:test';
import assert from 'node:assert/strict';

import { defaultScene, normalizeSpec, replaceScene } from './video-spec';

test('replaceScene hanya mengganti scene dengan id yang sama', () => {
  const first = defaultScene({ kind: 'title', title: 'Lama' });
  const second = defaultScene({ kind: 'statement', title: 'Tetap' });
  const next = { ...first, title: 'Baru' };

  const result = replaceScene([first, second], first.id, next);

  assert.equal(result.length, 2);
  assert.equal(result[0].title, 'Baru');
  assert.equal(result[1], second);
});

test('replaceScene memaksa id scene lama walau balasan AI membawa id lain', () => {
  const scene = defaultScene({ kind: 'statement', title: 'Lama' });
  const next = { ...scene, id: 'sc-dari-ai', title: 'Baru' };

  const result = replaceScene([scene], scene.id, next);

  assert.equal(result[0].id, scene.id);
  assert.equal(result[0].title, 'Baru');
});

test('replaceScene tidak menambah scene saat id tidak ditemukan', () => {
  const scene = defaultScene({ kind: 'statement' });

  const result = replaceScene([scene], 'sc-tidak-ada', { ...scene, title: 'Baru' });

  assert.equal(result.length, 1);
  assert.equal(result[0].title, scene.title);
});

test('normalizeSpec mempertahankan mode image-to-video', () => {
  const spec = normalizeSpec({ generation: { provider: 'replicate', enabled: true, mode: 'image-to-video' } } as any);
  assert.equal(spec.generation.mode, 'image-to-video');
  assert.equal(spec.generation.enabled, true);
});

test('normalizeSpec memaksa mode tak dikenal kembali ke text-to-video', () => {
  const spec = normalizeSpec({ generation: { provider: 'none', enabled: false, mode: 'video-ajaib' } } as any);
  assert.equal(spec.generation.mode, 'text-to-video');
});
