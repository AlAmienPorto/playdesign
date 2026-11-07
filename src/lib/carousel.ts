import type { CarouselDocument, CarouselSlide, SocialPost } from '../data/types';

const TEMPLATES: CarouselDocument['template'][] = ['split-brand', 'split-dark', 'full-image'];

const cleanHashtag = (value: string) => value.trim().replace(/^#+/, '');

const slideId = (postId: string, index: number) => `${postId}-slide-${index + 1}`;

const coverSlide = (post: SocialPost, headline: string): CarouselSlide => ({
  id: slideId(post.id, 0),
  kind: 'cover',
  title: headline,
  body: '',
});

export function normalizeCarousel(post: SocialPost): CarouselDocument {
  const saved = post.carousel;
  const headline = saved?.headline.trim() || post.title.trim() || 'Judul carousel';
  const savedSlides = Array.isArray(saved?.slides) ? saved.slides : [];
  const textSlides = saved
    ? savedSlides
        .filter((slide) => slide?.kind === 'text')
        .map((slide, index) => ({
          id: slide.id || slideId(post.id, index + 1),
          kind: 'text' as const,
          title: slide.title || `Slide ${index + 2}`,
          body: slide.body || '',
        }))
    : (post.slides ?? []).map((title, index) => ({
        id: slideId(post.id, index + 1),
        kind: 'text' as const,
        title: title || `Slide ${index + 2}`,
        body: '',
      }));

  return {
    kicker: saved?.kicker?.trim() || 'PLAYDESIGN / CAROUSEL',
    template: saved && TEMPLATES.includes(saved.template) ? saved.template : 'split-brand',
    headline,
    highlight: saved?.highlight ?? '',
    sourceName: saved?.sourceName?.trim() || post.author?.trim() || 'Playdesign',
    sourceUrl: saved?.sourceUrl ?? '',
    coverImageUrl: saved?.coverImageUrl?.trim() || post.mediaUrl?.trim() || '',
    slides: [coverSlide(post, headline), ...textSlides],
    caption: saved?.caption ?? post.caption ?? '',
    hashtags: (saved?.hashtags ?? post.hashtags ?? []).map(cleanHashtag).filter(Boolean),
    updatedAt: saved?.updatedAt || post.date,
  };
}

export function splitHeadline(headline: string, requestedHighlight: string) {
  const highlight = requestedHighlight.trim();
  if (!highlight) {
    return { before: headline, highlight: '', after: '', matched: false };
  }

  const index = headline.toLocaleLowerCase('id').indexOf(highlight.toLocaleLowerCase('id'));
  if (index < 0) {
    return { before: headline, highlight: '', after: '', matched: false };
  }

  return {
    before: headline.slice(0, index),
    highlight: headline.slice(index, index + highlight.length),
    after: headline.slice(index + highlight.length),
    matched: true,
  };
}

export function addTextSlide(document: CarouselDocument): CarouselDocument {
  const used = new Set(document.slides.map((slide) => slide.id));
  let suffix = document.slides.length + 1;
  let id = `carousel-slide-${suffix}`;
  while (used.has(id)) {
    suffix += 1;
    id = `carousel-slide-${suffix}`;
  }

  return {
    ...document,
    slides: [...document.slides, { id, kind: 'text', title: 'Slide baru', body: '' }],
  };
}

export function moveTextSlide(
  document: CarouselDocument,
  slideIdToMove: string,
  direction: -1 | 1,
): CarouselDocument {
  const index = document.slides.findIndex((slide) => slide.id === slideIdToMove);
  const destination = index + direction;
  if (
    index < 1 ||
    document.slides[index].kind !== 'text' ||
    destination < 1 ||
    destination >= document.slides.length
  ) {
    return document;
  }

  const slides = [...document.slides];
  [slides[index], slides[destination]] = [slides[destination], slides[index]];
  return { ...document, slides };
}

export function deleteTextSlide(document: CarouselDocument, slideIdToDelete: string): CarouselDocument {
  const target = document.slides.find((slide) => slide.id === slideIdToDelete);
  if (!target || target.kind !== 'text') return document;
  return { ...document, slides: document.slides.filter((slide) => slide.id !== slideIdToDelete) };
}

export function clampSlideIndex(index: number, count: number) {
  if (count <= 0) return 0;
  return Math.max(0, Math.min(Math.trunc(index), count - 1));
}
