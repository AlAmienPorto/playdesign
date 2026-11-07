// @ts-nocheck — dieksekusi oleh Node/tsx, bukan build Vite.
import assert from 'node:assert/strict';
import test from 'node:test';

import { SEED } from '../data/seed';
import { normalizeCarousel } from './carousel';
import { createCarouselDraftInDb, saveCarouselInDb } from './carousel-store';

const cloneSeed = () => structuredClone(SEED);

test('saveCarouselInDb menyimpan dokumen tanpa mengubah DB asal', () => {
  const db = cloneSeed();
  const post = db.social[0];
  const document = {
    ...normalizeCarousel(post),
    headline: 'Carousel yang baru',
    coverImageUrl: 'https://images.example/new-cover.jpg',
    caption: 'Caption yang disimpan',
    hashtags: ['playdesign', 'studio'],
    slides: [
      { id: 'cover', kind: 'cover', title: 'Carousel yang baru', body: '' },
      { id: 'text-1', kind: 'text', title: 'Keputusan pertama', body: 'Mulai dari pesan.' },
    ],
    updatedAt: '2026-11-07T12:00:00.000Z',
  };

  const result = saveCarouselInDb(db, post.id, document, 'Jawad Al Amien');

  assert.equal(result.ok, true);
  assert.notEqual(result.db, db);
  assert.equal(db.social[0].carousel, undefined);
  const saved = result.db.social.find((row) => row.id === post.id)?.carousel;
  assert.deepEqual({ ...saved, updatedAt: document.updatedAt }, document);
  assert.doesNotThrow(() => new Date(saved?.updatedAt ?? '').toISOString());
});

test('saveCarouselInDb menyinkronkan field lama untuk Social Planner', () => {
  const db = cloneSeed();
  const post = db.social[0];
  const document = {
    ...normalizeCarousel(post),
    headline: 'Judul sinkron',
    coverImageUrl: 'https://images.example/sync.jpg',
    caption: 'Caption sinkron',
    hashtags: ['satu', 'dua'],
    slides: [
      { id: 'cover', kind: 'cover', title: 'Judul sinkron', body: '' },
      { id: 'text-1', kind: 'text', title: 'Slide kedua', body: 'Isi kedua' },
      { id: 'text-2', kind: 'text', title: 'Slide ketiga', body: 'Isi ketiga' },
    ],
  };

  const result = saveCarouselInDb(db, post.id, document, 'Jawad Al Amien');
  const saved = result.db.social.find((row) => row.id === post.id);

  assert.equal(saved?.title, 'Judul sinkron');
  assert.equal(saved?.caption, 'Caption sinkron');
  assert.deepEqual(saved?.hashtags, ['satu', 'dua']);
  assert.equal(saved?.mediaUrl, 'https://images.example/sync.jpg');
  assert.deepEqual(saved?.slides, ['Slide kedua', 'Slide ketiga']);
});

test('saveCarouselInDb menambahkan audit Carousel Studio', () => {
  const db = cloneSeed();
  const post = db.social[0];
  const document = normalizeCarousel(post);

  const result = saveCarouselInDb(db, post.id, document, 'Jawad Al Amien');
  const audit = result.db.audit[0];

  assert.equal(audit.actor, 'Jawad Al Amien');
  assert.equal(audit.action, 'Menyimpan draft carousel');
  assert.equal(audit.target, document.headline);
  assert.equal(audit.module, 'Carousel Studio');
  assert.match(audit.id, /^au-/);
  assert.doesNotThrow(() => new Date(audit.at).toISOString());
});

test('saveCarouselInDb mengembalikan DB yang sama untuk post tidak dikenal', () => {
  const db = cloneSeed();
  const document = normalizeCarousel(db.social[0]);

  const result = saveCarouselInDb(db, 'tidak-ada', document, 'Jawad Al Amien');

  assert.equal(result.ok, false);
  assert.equal(result.db, db);
});

test('createCarouselDraftInDb membuat record Instagram nyata dengan audit', () => {
  const db = cloneSeed();
  const result = createCarouselDraftInDb(db, 'Jawad Al Amien', 'draft-uji');
  const created = result.db.social.find((post) => post.id === result.postId);

  assert.equal(result.postId, 'draft-uji');
  assert.equal(created?.channel, 'Instagram');
  assert.equal(created?.status, 'Approved');
  assert.equal(created?.carousel?.slides[0].kind, 'cover');
  assert.equal(db.social.some((post) => post.id === 'draft-uji'), false);
  assert.equal(result.db.audit[0].action, 'Membuat draft carousel');
});
