# Carousel Studio Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a functional, responsive Carousel Studio to kantor.playdesign with the supplied reference's preview-and-editor composition while preserving every existing workflow.

**Architecture:** Add pure carousel document helpers and an optional `carousel` field on existing `SocialPost` records. A focused page component owns transient editing state, calls one store save method for persistence and audit, and uses the existing scheduling method; routing and navigation extend the current Marketing module.

**Tech Stack:** React 18, TypeScript, React Router, existing CSS and lucide-react, Node test runner via tsx, Vite.

**Spec:** `docs/superpowers/specs/2026-11-07-carousel-studio-design.md`

## Global Constraints

- Modify the existing application in place; no dashboard, framework, project, D1 migration, or publishing service.
- Preserve Content Composer, Social Planner, Video Studio, backend, and Telegram integrations.
- Do not bundle the screenshot, Pansos Creative identity, GTA artwork, or fabricated cover imagery.
- Use existing social records and local store; missing imagery must remain an explicit placeholder.
- Use TDD for document operations and persistence behavior.
- Keep all enabled controls functional and label unavailable external actions honestly.
- Maintain light and dark themes, keyboard operation, 44 px mobile targets, and no horizontal page overflow.

## Review Focus

- Legacy `SocialPost` without `carousel` normalizes to a valid cover-first document without mutating the source.
- An empty or malformed `slides` array cannot remove the cover or leave the active index out of bounds.
- Reorder and delete at first or last text slide remain deterministic and preserve the cover at index zero.
- A requested highlight absent from the headline renders the whole headline once, without dropped text.
- A broken or cross-origin image does not break preview or SVG export; the exported result remains honest about omitted imagery.

---

### Task 1: Carousel document domain

**Files:**
- Modify: `src/data/types.ts`
- Create: `src/lib/carousel.ts`
- Test: `src/lib/carousel.test.ts`

**Interfaces:**
- Consumes: existing `SocialPost`.
- Produces: `CarouselDocument`, `CarouselSlide`, `normalizeCarousel(post)`, `splitHeadline(headline, highlight)`, `addTextSlide(document)`, `moveTextSlide(document, slideId, direction)`, `deleteTextSlide(document, slideId)`, and `clampSlideIndex(index, count)`.

- [ ] Write failing tests for legacy normalization, malformed slides, highlight miss/match, add, boundary reorder, delete, and active-index clamping.
- [ ] Run `npx tsx --test src/lib/carousel.test.ts` and confirm RED because the module does not exist.
- [ ] Add optional carousel types to `SocialPost` and implement the smallest immutable helpers in `src/lib/carousel.ts`.
- [ ] Run `npx tsx --test src/lib/carousel.test.ts` and confirm all tests PASS.

### Task 2: Store persistence and audit

**Files:**
- Modify: `src/store/store.tsx`
- Create: `src/lib/carousel-store.ts`
- Test: `src/lib/carousel-store.test.ts`

**Interfaces:**
- Consumes: `saveCarouselInDb(db, postId, document, actor)` pure helper.
- Produces: store method `saveCarousel(postId: string, document: CarouselDocument): boolean`, persisted social record fields, and an audit entry.

- [ ] Write failing tests asserting immutable post update, mirrored caption/hashtags/media/slides fields, audit creation, and unchanged DB for an unknown post.
- [ ] Run `npx tsx --test src/lib/carousel-store.test.ts` and confirm RED.
- [ ] Implement `saveCarouselInDb` and expose `saveCarousel` through the existing context with `content.write` permission enforcement and toast feedback.
- [ ] Run both carousel test files and confirm PASS.

### Task 3: Carousel Studio page

**Files:**
- Create: `src/pages/CarouselStudio.tsx`
- Create: `src/components/CarouselPreview.tsx`
- Modify: `src/styles.css`

**Interfaces:**
- Consumes: `normalizeCarousel`, document operations, `saveCarousel`, `schedulePost`, existing `PageHead`, `Field`, `Modal`, `Badge`, and `toast`.
- Produces: `CarouselStudioPage` with document selection, live 4:5 preview, thumbnails, cover fields, text-slide editors, save, copy, SVG download, and scheduling guard.

- [ ] Build the preview component with cover/text layouts, source label, safe image fallback, selected marker, and honest missing-image placeholder.
- [ ] Build the page state flow for existing Instagram posts, derived legacy documents, dirty/saved state, active-index clamping, and local draft creation empty state.
- [ ] Wire previous/next/thumbnails, cover fields, template choice, text fields, add/move/delete confirmation, caption and hashtag fields.
- [ ] Wire real clipboard copy, SVG download, store save, approved-only scheduling, inline errors, and accessible status announcements.
- [ ] Add isolated desktop split layout, medium layout, mobile stack, theme states, focus, reduced-motion, long-text and scroll containment styles.
- [ ] Run `npm run typecheck` and fix all page/component errors.

### Task 4: Navigation and route integration

**Files:**
- Modify: `src/routes.ts`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `CarouselStudioPage`.
- Produces: `/marketing/carousel`, Marketing sub-menu item `Carousel Studio`, and matching breadcrumb.

- [ ] Add the sub-menu item using `PanelsTopLeft`, breadcrumb, import, and route without changing existing paths.
- [ ] Run `npm run typecheck` and `npm run build`; both must exit zero.

### Task 5: Real UI verification and quality gate

**Files:**
- Modify only if verification exposes a defect.

**Interfaces:**
- Consumes: built application.
- Produces: verified desktop/tablet/mobile Carousel Studio with no console errors.

- [ ] Start the real Vite app and navigate to `#/marketing/carousel` through the existing token gate.
- [ ] Verify document selection, next/previous, thumbnails, field-to-preview updates, templates, add, reorder, delete cancel/confirm, copy, SVG download, save, reload persistence, and schedule guard.
- [ ] Verify 1440 px, 1024 px, 768 px, and 390 px widths in light and dark themes, including 200 percent zoom and no page overflow.
- [ ] Check contrast for text pairs with `contrast-check.py`; minimum normal text 4.5:1 and large text 3:1.
- [ ] Run `npx tsx --test src/lib/*.test.ts worker/*.test.ts`, `npm run typecheck`, and `npm run build` and capture real output.
- [ ] Run the antislop Delivery Gate: responsiveness, accessibility, identity, no fake interactions, no excessive rounding/gradients, content completeness, and console cleanliness.
