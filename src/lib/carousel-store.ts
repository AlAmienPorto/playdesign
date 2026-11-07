import type { CarouselDocument, DB } from '../data/types';

export interface SaveCarouselResult {
  ok: boolean;
  db: DB;
}

export interface CreateCarouselDraftResult {
  db: DB;
  postId: string;
}

const auditId = () => `au-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

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
          status: 'Approved',
          caption: '',
          hashtags: [],
          slides: [],
          author: actor,
          carousel: {
            kicker: 'PLAYDESIGN / CAROUSEL',
            template: 'split-brand',
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
          id: auditId(),
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
  if (!db.social.some((post) => post.id === postId)) return { ok: false, db };

  const now = new Date().toISOString();
  return {
    ok: true,
    db: {
      ...db,
      social: db.social.map((post) =>
        post.id === postId
          ? {
              ...post,
              title: document.headline,
              caption: document.caption,
              hashtags: [...document.hashtags],
              mediaUrl: document.coverImageUrl || undefined,
              slides: document.slides
                .filter((slide) => slide.kind === 'text')
                .map((slide) => slide.title),
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
          id: auditId(),
          at: now,
          actor,
          action: 'Menyimpan draft carousel',
          target: document.headline,
          module: 'Carousel Studio',
        },
        ...db.audit,
      ],
    },
  };
}
