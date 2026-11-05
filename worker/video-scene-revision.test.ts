// @ts-nocheck — dieksekusi oleh Node/tsx, bukan runtime Worker.
import assert from 'node:assert/strict';
import test from 'node:test';

import { extractSceneRevision, sanitizeSceneRevision } from './video-scene-revision';
import type { VideoScene } from '../src/lib/video-spec';

const current: VideoScene = {
  id: 'sc-keep',
  kind: 'image',
  durationSec: 4,
  title: 'Judul lama',
  body: 'Isi lama',
  items: [],
  media: { refId: 'ref-keep', fit: 'cover', motion: 'kenburns' },
  transitionIn: 'fade',
};

test('extractSceneRevision membaca objek JSON murni', () => {
  assert.deepEqual(extractSceneRevision('{"title":"Baru"}'), { title: 'Baru' });
});

test('extractSceneRevision membaca satu fenced JSON', () => {
  assert.deepEqual(extractSceneRevision('```json\n{"body":"Lebih tegas"}\n```'), { body: 'Lebih tegas' });
});

test('extractSceneRevision menolak respons rusak', () => {
  assert.throws(() => extractSceneRevision('Tentu, judulnya menjadi lebih baik.'), /JSON/i);
});

test('sanitizeSceneRevision mempertahankan identitas dan referensi media', () => {
  const revised = sanitizeSceneRevision(current, {
    id: 'sc-hijack',
    kind: 'video',
    durationSec: 3,
    title: 'Pesan Sekarang',
    body: 'Chat WhatsApp hari ini',
    media: { refId: 'ref-hijack', fit: 'contain', motion: 'parallax' },
    transitionIn: 'wipe',
    unknown: 'hapus saya',
  });

  assert.deepEqual(revised, {
    id: 'sc-keep',
    kind: 'video',
    durationSec: 3,
    title: 'Pesan Sekarang',
    body: 'Chat WhatsApp hari ini',
    items: [],
    media: { refId: 'ref-keep', fit: 'contain', motion: 'parallax' },
    transitionIn: 'wipe',
  });
  assert.equal('unknown' in revised, false);
});

test('sanitizeSceneRevision menormalkan enum, durasi, dan batas teks', () => {
  const revised = sanitizeSceneRevision(current, {
    kind: 'merusak',
    durationSec: 999,
    title: 'T'.repeat(300),
    body: 'B'.repeat(900),
    items: Array.from({ length: 12 }, (_, index) => `${index}-${'I'.repeat(250)}`),
    transitionIn: 'zoom',
    media: { fit: 'stretch', motion: 'spin' },
  });

  assert.equal(revised.kind, current.kind);
  assert.equal(revised.durationSec, 30);
  assert.equal(revised.title?.length, 160);
  assert.equal(revised.body?.length, 600);
  assert.equal(revised.items?.length, 8);
  assert.ok((revised.items?.[0].length ?? 0) <= 180);
  assert.equal(revised.transitionIn, current.transitionIn);
  assert.equal(revised.media?.fit, current.media?.fit);
  assert.equal(revised.media?.motion, current.media?.motion);
});
