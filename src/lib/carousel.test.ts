// @ts-nocheck — dieksekusi oleh Node/tsx, bukan build Vite.
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  addTextSlide,
  clampSlideIndex,
  deleteTextSlide,
  moveTextSlide,
  normalizeCarousel,
  splitHeadline,
} from './carousel';

const legacyPost = {
  id: 'so-legacy',
  title: 'Sistem visual yang konsisten',
  channel: 'Instagram',
  date: '2026-11-07T10:00:00.000Z',
  status: 'Approved',
  caption: 'Tiga keputusan yang membuat brand mudah dikenali.',
  hashtags: ['Playdesign', '#BrandDesign'],
  mediaUrl: 'https://images.example/cover.jpg',
  slides: ['Mulai dari hierarki', 'Batasi warna utama'],
};

test('normalizeCarousel mengubah post lama menjadi dokumen cover-first tanpa mutasi', () => {
  const before = structuredClone(legacyPost);
  const document = normalizeCarousel(legacyPost);

  assert.deepEqual(legacyPost, before);
  assert.equal(document.headline, legacyPost.title);
  assert.equal(document.coverImageUrl, legacyPost.mediaUrl);
  assert.deepEqual(document.hashtags, ['Playdesign', 'BrandDesign']);
  assert.equal(document.slides[0].kind, 'cover');
  assert.equal(document.slides[0].title, legacyPost.title);
  assert.deepEqual(
    document.slides.slice(1).map((slide) => slide.title),
    legacyPost.slides,
  );
});

test('normalizeCarousel memulihkan carousel kosong agar selalu punya cover', () => {
  const document = normalizeCarousel({
    ...legacyPost,
    carousel: {
      kicker: '',
      template: 'unknown-template',
      headline: '',
      highlight: '',
      sourceName: '',
      sourceUrl: '',
      coverImageUrl: '',
      slides: [],
      caption: '',
      hashtags: [],
      updatedAt: '',
    },
  });

  assert.equal(document.template, 'split-brand');
  assert.equal(document.slides.length, 1);
  assert.equal(document.slides[0].kind, 'cover');
  assert.equal(document.slides[0].title, legacyPost.title);
});

test('splitHeadline memisahkan highlight tanpa mengubah kapitalisasi headline', () => {
  assert.deepEqual(splitHeadline('Ruang kerja untuk Tim Kecil', 'tim kecil'), {
    before: 'Ruang kerja untuk ',
    highlight: 'Tim Kecil',
    after: '',
    matched: true,
  });
});

test('splitHeadline mengembalikan headline utuh ketika highlight tidak ditemukan', () => {
  assert.deepEqual(splitHeadline('Ruang kerja untuk tim kecil', '212 GB'), {
    before: 'Ruang kerja untuk tim kecil',
    highlight: '',
    after: '',
    matched: false,
  });
});

test('addTextSlide menambah slide teks baru tanpa mengubah dokumen asal', () => {
  const document = normalizeCarousel(legacyPost);
  const next = addTextSlide(document);

  assert.equal(next.slides.length, document.slides.length + 1);
  assert.equal(document.slides.length, 3);
  assert.equal(next.slides.at(-1)?.kind, 'text');
  assert.equal(next.slides.at(-1)?.title, 'Slide baru');
  assert.equal(new Set(next.slides.map((slide) => slide.id)).size, next.slides.length);
});

test('moveTextSlide memindahkan slide teks tetapi tidak melewati cover', () => {
  const document = normalizeCarousel(legacyPost);
  const firstTextId = document.slides[1].id;
  const secondTextId = document.slides[2].id;

  const unchanged = moveTextSlide(document, firstTextId, -1);
  const moved = moveTextSlide(document, secondTextId, -1);

  assert.deepEqual(unchanged.slides.map((slide) => slide.id), document.slides.map((slide) => slide.id));
  assert.equal(moved.slides[0].kind, 'cover');
  assert.deepEqual(moved.slides.slice(1).map((slide) => slide.id), [secondTextId, firstTextId]);
});

test('moveTextSlide tidak mengubah urutan ketika slide terakhir digeser turun', () => {
  const document = normalizeCarousel(legacyPost);
  const lastId = document.slides.at(-1).id;

  assert.deepEqual(
    moveTextSlide(document, lastId, 1).slides.map((slide) => slide.id),
    document.slides.map((slide) => slide.id),
  );
});

test('deleteTextSlide menghapus slide teks dan menolak menghapus cover', () => {
  const document = normalizeCarousel(legacyPost);
  const textId = document.slides[1].id;
  const withoutText = deleteTextSlide(document, textId);
  const withoutCover = deleteTextSlide(document, document.slides[0].id);

  assert.equal(withoutText.slides.some((slide) => slide.id === textId), false);
  assert.deepEqual(withoutCover.slides, document.slides);
});

test('clampSlideIndex menjaga indeks di dalam jumlah slide yang tersedia', () => {
  assert.equal(clampSlideIndex(-4, 3), 0);
  assert.equal(clampSlideIndex(1, 3), 1);
  assert.equal(clampSlideIndex(9, 3), 2);
  assert.equal(clampSlideIndex(2, 0), 0);
});
