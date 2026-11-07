import type { CarouselDocument, DB } from '../data/types';

export interface SaveCarouselResult {
  ok: boolean;
  db: DB;
}

const auditId = () => `au-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

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
