// @ts-nocheck — dieksekusi oleh Node/tsx, bukan build Vite.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  addTextSlide,
  CAROUSEL_FONTS,
  CAROUSEL_TEMPLATES,
  fontStack,
  normalizeFont,
  clampSlideIndex,
  deleteTextSlide,
  moveTextSlide,
  normalizeCarousel,
  resolveCarouselSelection,
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

test('normalizeCarousel menyimpan aksen & handle brand yang valid', () => {
  const document = normalizeCarousel({
    ...legacyPost,
    carousel: {
      kicker: 'PLAYDESIGN / CAROUSEL',
      template: 'split-dark',
      accent: '#1E6F5C',
      brandHandle: 'ply dsgn',
      headline: 'Judul',
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

  assert.equal(document.accent, '#1e6f5c');
  assert.equal(document.brandHandle, '@plydsgn');
});

test('normalizeCarousel membuang aksen tidak valid dan handle kosong', () => {
  const build = (patch: Record<string, string>) =>
    normalizeCarousel({
      ...legacyPost,
      carousel: {
        kicker: '',
        template: 'split-brand',
        headline: 'Judul',
        highlight: '',
        sourceName: '',
        sourceUrl: '',
        coverImageUrl: '',
        slides: [],
        caption: '',
        hashtags: [],
        updatedAt: '',
        ...patch,
      },
    });

  assert.equal(build({ accent: 'merah' }).accent, '');
  assert.equal(build({ accent: '#12345' }).accent, '');
  assert.equal(build({ brandHandle: '   ' }).brandHandle, '');
  assert.equal(build({ accent: '#abc' }).accent, '#abc');
});

test('CAROUSEL_TEMPLATES mencakup semua template yang didukung', () => {
  assert.deepEqual(
    CAROUSEL_TEMPLATES.map((item) => item.id).sort(),
    ['blok', 'full-image', 'kolase', 'poster', 'split-brand', 'split-dark'],
  );
  for (const item of CAROUSEL_TEMPLATES) {
    assert.ok(item.label.length > 0 && item.description.length > 0);
    assert.ok(item.useCase.length > 0);
    assert.match(item.swatch, /^#[0-9a-f]{6}$/);
  }
});

test('CAROUSEL_FONTS menyediakan pilihan font yang valid', () => {
  assert.ok(CAROUSEL_FONTS.length >= 4);
  const ids = new Set<string>();
  for (const font of CAROUSEL_FONTS) {
    assert.match(font.id, /^[a-z]+$/);
    assert.ok(font.label.length > 0 && font.host.length > 0 && font.stack.length > 0);
    assert.ok(!ids.has(font.id), `id font duplikat: ${font.id}`);
    ids.add(font.id);
  }
});

test('normalizeFont hanya meloloskan id font yang dikenal', () => {
  assert.equal(normalizeFont('SERIF'), 'serif');
  assert.equal(normalizeFont('  mono '), 'mono');
  assert.equal(normalizeFont('comic-sans'), '');
  assert.equal(normalizeFont(''), '');
  assert.equal(normalizeFont(undefined), '');
  assert.equal(fontStack('narrow'), CAROUSEL_FONTS.find((f) => f.id === 'narrow')?.stack);
  assert.equal(fontStack(''), undefined);
});

test('normalizeCarousel menyimpan font dokumen dan font per slide', () => {
  const doc = normalizeCarousel({
    ...legacyPost,
    carousel: {
      kicker: '',
      template: 'split-brand',
      headline: 'Judul',
      highlight: '',
      sourceName: '',
      sourceUrl: '',
      coverImageUrl: '',
      caption: '',
      hashtags: [],
      updatedAt: '',
      font: 'serif',
      slides: [
        { id: 's2', kind: 'text', title: 'A', body: 'B', font: 'mono' },
        { id: 's3', kind: 'text', title: 'C', body: 'D', font: 'papyrus' },
      ],
    },
  });

  assert.equal(doc.font, 'serif');
  assert.equal(doc.slides[1].font, 'mono');
  assert.equal(doc.slides[2].font, '');
});

test('setiap template punya hook CSS pratinjau', () => {
  const css = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');
  const hooks: Record<string, string[]> = {
    'split-brand': ['.carousel-canvas::before', '--carousel-accent'],
    'split-dark': ['.carousel-canvas.template-split-dark .carousel-editorial-cover'],
    'full-image': ['.carousel-canvas.template-full-image .carousel-cover-copy'],
    poster: ['.carousel-canvas.template-poster .carousel-editorial-cover h2', '.carousel-poster-number'],
    kolase: ['.carousel-kolase-stack', '.carousel-canvas.template-kolase .carousel-editorial-cover'],
    blok: ['.carousel-canvas.template-blok', '.carousel-canvas.template-blok .carousel-point-badge'],
  };
  for (const item of CAROUSEL_TEMPLATES) {
    for (const hook of hooks[item.id]) {
      assert.ok(css.includes(hook), `CSS kehilangan hook ${hook} untuk template ${item.id}`);
    }
  }
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

test('resolveCarouselSelection memulihkan record terakhir bila masih ada', () => {
  const posts = [
    { ...legacyPost, id: 'satu' },
    { ...legacyPost, id: 'dua' },
  ];

  assert.equal(resolveCarouselSelection(posts, 'dua'), 'dua');
  assert.equal(resolveCarouselSelection(posts, 'hilang'), 'satu');
  assert.equal(resolveCarouselSelection([], 'dua'), '');
});
