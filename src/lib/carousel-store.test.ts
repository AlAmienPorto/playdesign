// @ts-nocheck — dieksekusi oleh Node/tsx, bukan build Vite.
import assert from 'node:assert/strict';
import test from 'node:test';

import { SEED } from '../data/seed';
import { normalizeCarousel } from './carousel';
import {
  carouselExportBlockedReason,
  createCarouselDraftInDb,
  decideCarouselInDb,
  saveCarouselInDb,
  submitCarouselForReviewInDb,
} from './carousel-store';

const cloneSeed = () => structuredClone(SEED);
const findPost = (db, id) => db.social.find((post) => post.id === id);

test('saveCarouselInDb menyimpan dokumen tanpa mengubah DB asal', () => {
  const db = cloneSeed();
  const post = db.social.find((row) => row.status === 'Approved' && row.channel === 'Instagram') ?? db.social[0];
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
  assert.equal(post.carousel, undefined);
  const saved = findPost(result.db, post.id)?.carousel;
  assert.deepEqual({ ...saved, updatedAt: document.updatedAt }, document);
  assert.doesNotThrow(() => new Date(saved?.updatedAt ?? '').toISOString());
});

test('saveCarouselInDb menyinkronkan field lama untuk Social Planner', () => {
  const db = cloneSeed();
  const post = db.social.find((row) => row.status === 'Approved' && row.channel === 'Instagram') ?? db.social[0];
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
  const saved = findPost(result.db, post.id);

  assert.equal(saved?.title, 'Judul sinkron');
  assert.equal(saved?.caption, 'Caption sinkron');
  assert.deepEqual(saved?.hashtags, ['satu', 'dua']);
  assert.equal(saved?.mediaUrl, 'https://images.example/sync.jpg');
  assert.deepEqual(saved?.slides, ['Slide kedua', 'Slide ketiga']);
});

test('saveCarouselInDb menambahkan audit Carousel Studio', () => {
  const db = cloneSeed();
  const post = db.social.find((row) => row.status === 'Approved' && row.channel === 'Instagram') ?? db.social[0];
  const document = normalizeCarousel(post);

  const result = saveCarouselInDb(db, post.id, document, 'Jawad Al Amien');
  const audit = result.db.audit[0];

  assert.equal(result.ok, true);
  assert.equal(audit.actor, 'Jawad Al Amien');
  assert.equal(audit.action, 'Merevisi carousel yang sudah disetujui');
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
  assert.equal(result.reason, 'not_found');
});

test('createCarouselDraftInDb membuat record Instagram nyata berstatus Draft', () => {
  const db = cloneSeed();
  const result = createCarouselDraftInDb(db, 'Jawad Al Amien', 'draft-uji');
  const created = findPost(result.db, result.postId);

  assert.equal(result.postId, 'draft-uji');
  assert.equal(created?.channel, 'Instagram');
  assert.equal(created?.status, 'Draft');
  assert.equal(created?.carousel?.slides[0].kind, 'cover');
  assert.equal(db.social.some((post) => post.id === 'draft-uji'), false);
  assert.equal(result.db.audit[0].action, 'Membuat draft carousel');
});

test('draft baru tidak bisa langsung diekspor sebelum disetujui', () => {
  const db = cloneSeed();
  const { db: next, postId } = createCarouselDraftInDb(db, 'Jawad Al Amien', 'draft-uji');

  assert.equal(carouselExportBlockedReason(findPost(next, postId)), 'not_approved');
});

test('saveCarouselInDb menolak menimpa konten Published dan Scheduled', () => {
  const db = cloneSeed();
  const published = db.social.find((row) => row.status === 'Published');
  assert.ok(published, 'seed harus punya konten Published untuk diuji');
  const document = normalizeCarousel(published);

  const result = saveCarouselInDb(db, published.id, document, 'Jawad Al Amien');

  assert.equal(result.ok, false);
  assert.equal(result.reason, 'locked');
  assert.equal(result.db, db);
  assert.equal(findPost(db, published.id)?.carousel, undefined);
});

test('saveCarouselInDb mengembalikan status Approved ke Draft setelah direvisi', () => {
  const db = cloneSeed();
  const post = db.social.find((row) => row.status === 'Approved' && row.channel === 'Instagram');
  assert.ok(post, 'seed harus punya konten Approved untuk diuji');
  const document = { ...normalizeCarousel(post), headline: 'Revisi setelah approval' };

  const result = saveCarouselInDb(db, post.id, document, 'Jawad Al Amien');
  const saved = findPost(result.db, post.id);

  assert.equal(result.ok, true);
  assert.equal(saved?.status, 'Draft');
  assert.equal(saved?.reviewedBy, undefined);
  assert.equal(saved?.approvedAt, undefined);
  assert.equal(result.db.audit[0].action, 'Merevisi carousel yang sudah disetujui');
});

test('submitCarouselForReviewInDb memindahkan Draft ke Review dan membuat paket approval', () => {
  const db = cloneSeed();
  const { db: withDraft, postId } = createCarouselDraftInDb(db, 'Nadia Prameswari', 'draft-review');

  const result = submitCarouselForReviewInDb(withDraft, postId, 'Nadia Prameswari');
  const post = findPost(result.db, postId);
  const approval = result.db.approvals[0];

  assert.equal(result.ok, true);
  assert.equal(post?.status, 'Review');
  assert.ok(post?.submittedAt);
  assert.equal(approval.kind, 'Jadwal sosial');
  assert.equal(approval.socialPostId, postId);
  assert.equal(approval.status, 'pending');
  assert.equal(approval.requestedBy, 'Nadia Prameswari');
  assert.equal(result.db.notifications[0].kind, 'approval');
  assert.equal(result.db.audit[0].action, 'Mengajukan carousel untuk review');
});

test('submitCarouselForReviewInDb menolak status yang sudah diputuskan', () => {
  const db = cloneSeed();
  const approved = db.social.find((row) => row.status === 'Approved' && row.channel === 'Instagram');
  assert.ok(approved);

  const result = submitCarouselForReviewInDb(db, approved.id, 'Nadia Prameswari');

  assert.equal(result.ok, false);
  assert.equal(result.reason, 'invalid_status');
  assert.equal(result.db, db);
});

test('submitCarouselForReviewInDb menolak pengajuan ganda saat paket masih pending', () => {
  const db = cloneSeed();
  const { db: withDraft, postId } = createCarouselDraftInDb(db, 'Nadia Prameswari', 'draft-dobel');
  const first = submitCarouselForReviewInDb(withDraft, postId, 'Nadia Prameswari');
  const second = submitCarouselForReviewInDb(first.db, postId, 'Nadia Prameswari');

  assert.equal(second.ok, false);
  assert.equal(second.reason, 'invalid_status');
});

test('decideCarouselInDb menyetujui dan mencatat keputusan Owner', () => {
  const db = cloneSeed();
  const { db: withDraft, postId } = createCarouselDraftInDb(db, 'Nadia Prameswari', 'draft-acc');
  const { db: submitted } = submitCarouselForReviewInDb(withDraft, postId, 'Nadia Prameswari');

  const result = decideCarouselInDb(submitted, postId, 'approved', 'Jawad Al Amien', 'Layak tayang.');
  const post = findPost(result.db, postId);

  assert.equal(result.ok, true);
  assert.equal(post?.status, 'Approved');
  assert.equal(post?.reviewedBy, 'Jawad Al Amien');
  assert.equal(post?.reviewNote, 'Layak tayang.');
  assert.ok(post?.approvedAt);
  assert.equal(carouselExportBlockedReason(post), null);
});

test('decideCarouselInDb menolak dan mengembalikan revisi ke Draft', () => {
  const db = cloneSeed();
  const { db: withDraft, postId } = createCarouselDraftInDb(db, 'Nadia Prameswari', 'draft-tolak');
  const { db: submitted } = submitCarouselForReviewInDb(withDraft, postId, 'Nadia Prameswari');

  const rejected = decideCarouselInDb(submitted, postId, 'rejected', 'Jawad Al Amien', 'Klaim tanpa sumber.');
  assert.equal(findPost(rejected.db, postId)?.status, 'Rejected');

  const { db: again, postId: secondId } = createCarouselDraftInDb(db, 'Nadia Prameswari', 'draft-revisi');
  const { db: submittedAgain } = submitCarouselForReviewInDb(again, secondId, 'Nadia Prameswari');
  const revision = decideCarouselInDb(submittedAgain, secondId, 'revision', 'Jawad Al Amien', 'Tambah data.');

  assert.equal(findPost(revision.db, secondId)?.status, 'Draft');
  assert.equal(findPost(revision.db, secondId)?.reviewNote, 'Tambah data.');
});

test('decideCarouselInDb menolak keputusan ganda', () => {
  const db = cloneSeed();
  const { db: withDraft, postId } = createCarouselDraftInDb(db, 'Nadia Prameswari', 'draft-ganda');
  const { db: submitted } = submitCarouselForReviewInDb(withDraft, postId, 'Nadia Prameswari');
  const first = decideCarouselInDb(submitted, postId, 'approved', 'Jawad Al Amien', '');

  const second = decideCarouselInDb(first.db, postId, 'rejected', 'Jawad Al Amien', '');

  assert.equal(second.ok, false);
  assert.equal(second.reason, 'invalid_status');
});

test('carouselExportBlockedReason menjelaskan setiap status yang belum boleh diekspor', () => {
  const db = cloneSeed();
  assert.equal(carouselExportBlockedReason(undefined), 'not_found');
  assert.equal(carouselExportBlockedReason({ ...db.social[0], status: 'Draft' }), 'not_approved');
  assert.equal(carouselExportBlockedReason({ ...db.social[0], status: 'Review' }), 'not_approved');
  assert.equal(carouselExportBlockedReason({ ...db.social[0], status: 'Rejected' }), 'not_approved');
  assert.equal(carouselExportBlockedReason({ ...db.social[0], status: 'Approved' }), null);
});
