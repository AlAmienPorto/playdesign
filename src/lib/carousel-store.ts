import type { Approval, CarouselDocument, DB, SocialPost } from '../data/types';
import { radarDraftToSocialPost, type RadarDraft } from './content-radar';

export interface SaveCarouselResult {
  ok: boolean;
  db: DB;
  reason?: 'not_found' | 'locked';
}

export interface CreateCarouselDraftResult {
  db: DB;
  postId: string;
}

export type CarouselReviewDecision = 'approved' | 'rejected' | 'revision';

export interface CarouselLifecycleResult {
  ok: boolean;
  db: DB;
  reason?: 'not_found' | 'invalid_status';
}

const newId = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

/** Status yang masih boleh diedit. Scheduled/Published adalah arsip terkunci. */
const LOCKED_STATUSES: SocialPost['status'][] = ['Scheduled', 'Published'];

/** Status yang boleh diajukan untuk review manusia. */
const SUBMITTABLE_STATUSES: SocialPost['status'][] = ['Draft', 'Rejected'];

export function carouselExportBlockedReason(
  post: SocialPost | null | undefined,
): 'not_found' | 'not_approved' | null {
  if (!post) return 'not_found';
  if (post.status !== 'Approved') return 'not_approved';
  return null;
}

const carouselApprovalTitle = (post: SocialPost) =>
  `Carousel Instagram · ${post.carousel?.headline || post.title}`;

const carouselPreview = (post: SocialPost) => {
  const document = post.carousel;
  return {
    channel: post.channel,
    caption: document?.caption ?? post.caption ?? '',
    hashtags: document?.hashtags ?? post.hashtags ?? [],
    slides: (document?.slides ?? [])
      .filter((slide) => slide.kind === 'text')
      .map((slide) => slide.title),
  };
};

export function createCarouselDraftInDb(
  db: DB,
  actor: string,
  postId: string,
): CreateCarouselDraftResult {
  const now = new Date().toISOString();
  const headline = 'Judul carousel baru';
  return {
    postId,
    db: {
      ...db,
      social: [
        {
          id: postId,
          title: headline,
          channel: 'Instagram',
          date: now,
          // Draft selalu lahir sebagai Draft; status Approved hanya lewat keputusan Owner.
          status: 'Draft',
          caption: '',
          hashtags: [],
          slides: [],
          author: actor,
          carousel: {
            kicker: 'PLAYDESIGN / CAROUSEL',
            template: 'split-brand',
            accent: '',
            brandHandle: '@plydsgn',
            headline,
            highlight: '',
            sourceName: 'Playdesign',
            sourceUrl: '',
            coverImageUrl: '',
            slides: [{ id: `${postId}-slide-1`, kind: 'cover', title: headline, body: '' }],
            caption: '',
            hashtags: [],
            updatedAt: now,
          },
        },
        ...db.social,
      ],
      audit: [
        {
          id: newId('au'),
          at: now,
          actor,
          action: 'Membuat draft carousel',
          target: headline,
          module: 'Carousel Studio',
        },
        ...db.audit,
      ],
    },
  };
}

export function saveCarouselInDb(
  db: DB,
  postId: string,
  document: CarouselDocument,
  actor: string,
): SaveCarouselResult {
  const current = db.social.find((post) => post.id === postId);
  if (!current) return { ok: false, db, reason: 'not_found' };
  // Konten terjadwal/terbit adalah arsip: menimpanya akan merusak riwayat Social Planner.
  if (LOCKED_STATUSES.includes(current.status)) return { ok: false, db, reason: 'locked' };

  const now = new Date().toISOString();
  // Menyimpan perubahan pada konten Approved membatalkan approval: harus direview ulang.
  const invalidatesApproval = current.status === 'Approved';
  return {
    ok: true,
    db: {
      ...db,
      social: db.social.map((post) =>
        post.id === postId
          ? {
              ...post,
              status: invalidatesApproval ? 'Draft' : post.status,
              title: document.headline,
              caption: document.caption,
              hashtags: [...document.hashtags],
              mediaUrl: document.coverImageUrl || undefined,
              slides: document.slides
                .filter((slide) => slide.kind === 'text')
                .map((slide) => slide.title),
              ...(invalidatesApproval
                ? {
                    reviewedBy: undefined,
                    reviewedAt: undefined,
                    reviewNote: undefined,
                    approvedAt: undefined,
                    submittedAt: undefined,
                  }
                : {}),
              carousel: {
                ...document,
                hashtags: [...document.hashtags],
                slides: document.slides.map((slide) => ({ ...slide })),
                updatedAt: now,
              },
            }
          : post,
      ),
      audit: [
        {
          id: newId('au'),
          at: now,
          actor,
          action: invalidatesApproval ? 'Merevisi carousel yang sudah disetujui' : 'Menyimpan draft carousel',
          target: document.headline,
          module: 'Carousel Studio',
        },
        ...db.audit,
      ],
    },
  };
}

export function submitCarouselForReviewInDb(
  db: DB,
  postId: string,
  actor: string,
): CarouselLifecycleResult {
  const current = db.social.find((post) => post.id === postId);
  if (!current) return { ok: false, db, reason: 'not_found' };
  if (!SUBMITTABLE_STATUSES.includes(current.status)) return { ok: false, db, reason: 'invalid_status' };
  // Satu paket approval aktif per post supaya Owner tidak memutuskan versi ganda.
  if (db.approvals.some((item) => item.socialPostId === postId && item.status === 'pending')) {
    return { ok: false, db, reason: 'invalid_status' };
  }

  const now = new Date().toISOString();
  const approval: Approval = {
    id: newId('ap'),
    title: carouselApprovalTitle(current),
    kind: 'Jadwal sosial',
    requestedBy: actor,
    module: 'Carousel Studio',
    at: now,
    qc: 'PASS',
    status: 'pending',
    socialPostId: postId,
    risk: 'Konten dibuat dengan bantuan AI. Approval Owner wajib sebelum ekspor final atau penjadwalan.',
    previewData: carouselPreview(current),
  };

  return {
    ok: true,
    db: {
      ...db,
      social: db.social.map((post) =>
        post.id === postId
          ? { ...post, status: 'Review', submittedAt: now, reviewedBy: undefined, reviewedAt: undefined }
          : post,
      ),
      approvals: [approval, ...db.approvals],
      notifications: [
        {
          id: newId('nt'),
          title: 'Carousel menunggu approval',
          body: `${current.carousel?.headline || current.title} diajukan oleh ${actor}.`,
          at: now,
          read: false,
          kind: 'approval',
          href: '/approvals',
        },
        ...db.notifications,
      ],
      audit: [
        {
          id: newId('au'),
          at: now,
          actor,
          action: 'Mengajukan carousel untuk review',
          target: current.carousel?.headline || current.title,
          module: 'Carousel Studio',
        },
        ...db.audit,
      ],
    },
  };
}

export function decideCarouselInDb(
  db: DB,
  postId: string,
  decision: CarouselReviewDecision,
  actor: string,
  note: string,
): CarouselLifecycleResult {
  const current = db.social.find((post) => post.id === postId);
  if (!current) return { ok: false, db, reason: 'not_found' };
  if (current.status !== 'Review') return { ok: false, db, reason: 'invalid_status' };

  const now = new Date().toISOString();
  const nextStatus: SocialPost['status'] =
    decision === 'approved' ? 'Approved' : decision === 'rejected' ? 'Rejected' : 'Draft';
  const trimmedNote = note.trim();
  const label =
    decision === 'approved' ? 'Menyetujui carousel' : decision === 'rejected' ? 'Menolak carousel' : 'Meminta revisi carousel';

  return {
    ok: true,
    db: {
      ...db,
      social: db.social.map((post) =>
        post.id === postId
          ? {
              ...post,
              status: nextStatus,
              reviewedBy: actor,
              reviewedAt: now,
              reviewNote: trimmedNote || undefined,
              approvedAt: decision === 'approved' ? now : undefined,
            }
          : post,
      ),
      approvals: db.approvals.map((item) =>
        item.socialPostId === postId && item.status === 'pending'
          ? { ...item, status: decision, decidedBy: actor, note: trimmedNote || undefined }
          : item,
      ),
      audit: [
        {
          id: newId('au'),
          at: now,
          actor,
          action: label,
          target: current.carousel?.headline || current.title,
          module: 'Carousel Studio',
        },
        ...db.audit,
      ],
    },
  };
}

function postImportContent(post: SocialPost) {
  return {
    title: post.title,
    caption: post.caption ?? '',
    mediaUrl: post.mediaUrl,
    hashtags: post.hashtags ?? [],
    slides: post.slides ?? [],
    carousel: post.carousel,
  };
}

function postImportSnapshot(post: SocialPost): string {
  return JSON.stringify(postImportContent(post));
}

function isPostHumanEdited(existing: SocialPost, original: SocialPost): boolean {
  if (existing.status !== 'Draft') return true;
  if (
    existing.submittedAt ||
    existing.reviewedBy ||
    existing.reviewedAt ||
    existing.reviewNote ||
    existing.approvedAt
  ) {
    return true;
  }
  const baseline = existing.radarImportSnapshot;
  return baseline
    ? postImportSnapshot(existing) !== baseline
    : postImportSnapshot(existing) !== postImportSnapshot(original);
}

export function importRadarDraftsInDb(
  db: DB,
  drafts: RadarDraft[],
  actor = 'radar-agent',
): { imported: string[]; db: DB } {
  if (!Array.isArray(drafts) || drafts.length === 0) {
    return { imported: [], db };
  }

  const now = new Date().toISOString();
  const imported: string[] = [];
  const newAuditEntries: DB['audit'] = [];
  const nextSocial: SocialPost[] = [...db.social];

  for (const draft of drafts) {
    let post: SocialPost;
    try {
      post = radarDraftToSocialPost(draft);
    } catch {
      continue;
    }

    const existingIndex = nextSocial.findIndex((item) => item.id === draft.postId);

    if (existingIndex < 0) {
      nextSocial.unshift({
        ...post,
        status: 'Draft',
        radarImportSnapshot: postImportSnapshot(post),
      });
      newAuditEntries.push({
        id: newId('au'),
        at: now,
        actor: actor || draft.createdBy || 'radar-agent',
        action: 'Mengimpor Draft Content Radar',
        target: post.title,
        module: 'Carousel Studio',
      });
      imported.push(draft.id);
    } else {
      const existing = nextSocial[existingIndex];
      if (!isPostHumanEdited(existing, post)) {
        nextSocial[existingIndex] = {
          ...post,
          id: existing.id,
          status: 'Draft',
          author: existing.author,
          radarImportSnapshot: postImportSnapshot(post),
        };
      }
      imported.push(draft.id);
    }
  }

  return {
    imported,
    db: {
      ...db,
      social: nextSocial,
      audit: newAuditEntries.length > 0 ? [...newAuditEntries, ...db.audit] : db.audit,
    },
  };
}

export function importRadarDrafts(
  draftsOrDb: RadarDraft[] | DB,
  draftsOrActor?: RadarDraft[] | string,
  maybeActor?: string,
): { imported: string[]; db: DB } {
  if (Array.isArray(draftsOrDb)) {
    const drafts = draftsOrDb;
    const actor = typeof draftsOrActor === 'string' ? draftsOrActor : 'radar-agent';
    return importRadarDraftsInDb({ social: [], audit: [] } as unknown as DB, drafts, actor);
  }
  const db = draftsOrDb;
  const drafts = Array.isArray(draftsOrActor) ? draftsOrActor : [];
  const actor = typeof maybeActor === 'string' ? maybeActor : 'radar-agent';
  return importRadarDraftsInDb(db, drafts, actor);
}
