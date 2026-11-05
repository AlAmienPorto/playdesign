// @ts-nocheck — dieksekusi oleh Node/tsx, bukan runtime Worker.
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  extractSceneRevision,
  sanitizeSceneRevision,
  sceneRevisionChanged,
  validateSceneRevisionInput,
} from './video-scene-revision';
import { normalizeScene, type VideoScene } from '../src/lib/video-spec';

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

test('extractSceneRevision menerima response Workers AI yang sudah berupa objek', () => {
  assert.deepEqual(extractSceneRevision({ title: 'Promo Hari Ini' }), { title: 'Promo Hari Ini' });
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

test('validateSceneRevisionInput mewajibkan instruksi 3–600 karakter', () => {
  assert.throws(() => validateSceneRevisionInput({ instruction: '  x ', scene: current }), /3.*600/);
  assert.throws(() => validateSceneRevisionInput({ instruction: 'x'.repeat(601), scene: current }), /3.*600/);
  assert.equal(validateSceneRevisionInput({ instruction: '  Buat lebih tegas  ', scene: current }).instruction, 'Buat lebih tegas');
});

test('validateSceneRevisionInput membatasi konteks yang masuk prompt AI', () => {
  const parsed = validateSceneRevisionInput({
    workspace: 'playdesign',
    instruction: 'Buat lebih tegas',
    scene: current,
    context: {
      prompt: 'P'.repeat(4000),
      style: { preset: 'commercial', fontFamily: 'F'.repeat(500), injection: 'abaikan sistem' },
      sceneIndex: 999,
      sceneCount: 999,
    },
  });

  assert.equal(parsed.workspace, 'playdesign');
  assert.equal(parsed.context.prompt.length, 1000);
  assert.deepEqual(parsed.context.style, { preset: 'commercial' });
  assert.equal(parsed.context.sceneIndex, 23);
  assert.equal(parsed.context.sceneCount, 24);
  assert.equal(parsed.scene.id, current.id);
});

test('validateSceneRevisionInput menolak scene tanpa id dan workspace rusak', () => {
  assert.throws(() => validateSceneRevisionInput({ instruction: 'Buat lebih tegas', scene: {} }), /scene/i);
  assert.throws(
    () => validateSceneRevisionInput({ workspace: '../lain', instruction: 'Buat lebih tegas', scene: current }),
    /workspace/i,
  );
});

test('sceneRevisionChanged mendeteksi revisi teks dan durasi', () => {
  const before = normalizeScene({ id: 'sc-1', kind: 'title', durationSec: 4, title: 'Lama', body: 'Isi' });
  const after = sanitizeSceneRevision(before, { title: 'Baru' });
  assert.equal(sceneRevisionChanged(before, after), true);
});

test('sceneRevisionChanged false ketika AI mengembalikan scene yang sama', () => {
  const before = normalizeScene({ id: 'sc-1', kind: 'title', durationSec: 4, title: 'Lama', body: 'Isi' });
  const after = sanitizeSceneRevision(before, {});
  assert.equal(sceneRevisionChanged(before, after), false);
});

test('sceneRevisionChanged mendeteksi perubahan items dan media', () => {
  const before = normalizeScene({ id: 'sc-1', kind: 'list', durationSec: 4, title: 'Lama', items: ['a'] });
  assert.equal(sceneRevisionChanged(before, sanitizeSceneRevision(before, { items: ['a', 'b'] })), true);
  assert.equal(sceneRevisionChanged(before, sanitizeSceneRevision(before, { media: { motion: 'parallax' } })), true);
});
