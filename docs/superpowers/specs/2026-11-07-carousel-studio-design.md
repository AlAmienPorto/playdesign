# Carousel Studio Design

## Intent

Add a production-oriented carousel editor to kantor.playdesign that follows the supplied reference: persistent 4:5 preview on the left, compact slide controls below it, and dense editorial controls on the right. This is a new Marketing sub-page, not a replacement for Content Composer or Social Planner.

The screen is for preparing an Instagram carousel, reviewing the visual result, saving the draft, and passing approved scheduling data to the existing social workflow.

## Goals

- Add `/marketing/carousel` and a `Carousel Studio` item under Marketing & Content.
- Preserve the current shell, routes, Content Composer, Social Planner, Video Studio, backend, and Telegram integrations.
- Match the reference composition and density without copying its Pansos Creative identity or GTA artwork.
- Make the preview respond immediately to field and slide changes.
- Make every enabled control perform a real client-side action.
- Persist carousel drafts through the existing local Playdesign store.
- Reuse the existing `SocialPost` records as the starting content source.
- Support desktop, tablet, mobile, keyboard use, empty, loading, and error states.

## Non-goals

- No new dashboard, project, framework, or design system.
- No new image generation service.
- No social publishing API, server render pipeline, D1 migration, or Cloudflare media storage in this change.
- No copying or bundling the supplied screenshot, Pansos Creative mark, GTA logo, characters, or other third-party artwork.
- No replacement of the article editor or calendar planner.

## Constraints

- Modify the existing React and Vite app in place.
- Reuse the existing shell, store, toast, permissions, and social data.
- A visual asset is only used when it already exists in a real social record or the user supplies a URL. Otherwise the preview displays a clearly labelled image placeholder.
- Actions that require an unavailable external service are not shown as working controls. The UI explains the missing integration instead of shipping dead buttons.
- Tests are written first for pure document operations and store behavior.
- Existing light and dark themes remain usable. The editor canvas itself uses a dark production surface in both themes to keep visual judgement stable.

## Approaches considered

### A. New Carousel Studio sub-page, selected

A new Marketing route owns the carousel editor and reads or writes the same social data used by Social Planner. This preserves both current workflows and keeps the editor-specific layout isolated.

### B. Add an Article or Carousel mode to Content Composer

This saves one navigation item but mixes unrelated article and social schemas, increases branching, and makes the existing editor harder to maintain.

### C. Replace Content Composer

This gives the closest one-screen imitation but removes a working article workflow. It conflicts with the requirement to preserve existing functionality.

## Screen structure

```text
Existing Playdesign shell
└── Carousel Studio page
    ├── Page heading and document selector
    ├── Production workspace
    │   ├── Preview rail
    │   │   ├── 4:5 active slide preview
    │   │   ├── Previous and next controls
    │   │   ├── Slide thumbnails
    │   │   └── Download active slide and copy caption
    │   └── Editor column
    │       ├── Workflow card
    │       ├── Cover slide card
    │       ├── Text slide cards
    │       └── Save action row
    └── Accessible status region
```

Desktop uses a fixed preview rail and flexible editor column. At medium width the preview becomes non-sticky and narrower. On mobile the preview stacks above the editor, thumbnails scroll horizontally, two-column fields become one column, and controls meet the 44 px tap target.

## Data model

Extend `SocialPost` with an optional `carousel` document so older saved local data remains valid.

```ts
interface CarouselDocument {
  kicker: string;
  template: 'split-brand' | 'split-dark' | 'full-image';
  headline: string;
  highlight: string;
  sourceName: string;
  sourceUrl: string;
  coverImageUrl: string;
  slides: CarouselSlide[];
  caption: string;
  hashtags: string[];
  updatedAt: string;
}

interface CarouselSlide {
  id: string;
  kind: 'cover' | 'text';
  title: string;
  body: string;
}
```

Old social posts are converted in memory into this document shape from `title`, `caption`, `hashtags`, `mediaUrl`, and `slides`. Saving writes the optional document back to the same local store record. No destructive migration is needed.

Pure operations handle add, delete, reorder, active-index clamping, highlight matching, and document normalization. These functions are unit tested independently.

## Behavior

### Document selection

The top selector lists existing Instagram social records. Selecting one loads its carousel document or derives one from existing fields. If no Instagram records exist, the page shows an honest empty state with one action to create a local draft.

### Preview

- Uses a 4:5 aspect ratio.
- Uses Playdesign text identity, crimson accent, and editorial typography instead of Pansos Creative lime branding.
- The selected slide is the one focal point.
- Cover templates alter image and text placement.
- Highlight applies only when the requested phrase exists in the headline. If it does not match, the form shows a clear hint and the preview remains readable.
- Missing cover art displays `Foto cover belum dipilih`, not invented imagery.
- Previous, next, and thumbnail controls update the active slide.

### Editing

- Cover card controls kicker, template, headline, highlight, source, and image URL.
- Text cards control title and body.
- Text cards can move up, move down, and be deleted.
- The cover remains first and cannot be deleted or reordered.
- Add slide creates a blank text slide with an honest placeholder.
- Character hints are informative and never fabricate performance claims.

### Actions

- `Simpan draft` writes to local Playdesign store and records an audit entry.
- `Copy caption` writes caption and hashtags to the clipboard and reports success or failure.
- `Download slide` exports the active preview as an SVG file generated from current text and colors. It does not claim to export third-party images when cross-origin restrictions prevent embedding them.
- `Jadwalkan` uses the existing `schedulePost` flow when the record is approved and a date is provided.
- External publish, AI rewrite, bulk render, and server upload controls are omitted because there is no current endpoint for them.

## UI states

- Loading: shown while the local draft selection initializes.
- Empty: explains that there is no Instagram carousel and offers creation of a local draft.
- Error: shows clipboard or export failure with a retryable action where possible.
- Unsaved: a visible state appears after edits.
- Saved: a timestamped status appears after persistence.
- Invalid cover URL: preview falls back to the labelled placeholder and shows an inline error.
- Delete: confirmation is required before removing a text slide.

## Visual direction

Reading this as: an internal social-production editor for a small design team, using Playdesign's warm editorial identity with the reference's dense split workspace, dial ENERGY 2 / RHYTHM 1 / MOTION 1.

- Color: Playdesign crimson stays the accent because this is an extension of the existing product identity. The dark editor surface exists to keep image judgement stable, not to imitate a generic tech dashboard.
- Layout: fixed preview plus flexible form reflects the edit-and-judge task. The preview remains visible because every field changes it.
- Typography: existing Inter handles compact controls, while existing Instrument Serif is reserved for a small editorial accent in the preview. This keeps the UI readable and recognizably Playdesign.
- Spacing: compact 8, 12, 16, and 24 px steps match a production tool where related controls must stay close.
- Cards: cards separate workflow and slide types. They are not used as decoration or as a uniform dashboard grid.
- Icons: reuse the current icon dependency only for semantically specific actions such as move, delete, copy, and download.
- Motion: only immediate transitions and control states. No perpetual animation or decorative entrance sequence.
- Identity motif: a crimson editorial rule and numbered slide marker repeat across preview and thumbnails.

## Accessibility and resilience

- All actions use native buttons and all fields have visible labels.
- Icon-only controls have accessible names.
- Focus order follows preview controls, document controls, then editor fields.
- Focus indicators use the current application focus system.
- Text and control contrast is checked with the antislop contrast tool.
- Controls are at least 44 px on touch layouts.
- Images have dimensions and alt text. The preview reserves its 4:5 space before image load.
- No horizontal overflow from thumbnail rows, source links, or long headlines.
- Text remains usable at 200 percent zoom.

## Testing and verification

1. Unit tests first for document normalization, highlight splitting, add, delete, reorder, and active-index clamping.
2. Unit tests first for store save behavior and backward compatibility with social posts that lack `carousel`.
3. Typecheck and production build.
4. Run the real app locally.
5. Browser click-through for document selection, previous and next, thumbnails, template selection, edits, add, move, delete confirmation, copy caption, download, save, and scheduling guard.
6. Verify desktop, tablet, and mobile widths in light and dark themes.
7. Check browser console for errors.
8. Run the antislop Delivery Gate and report evidence.

## Acceptance criteria

- The new route is reachable from the existing Marketing submenu.
- Existing routes and workflows remain available.
- The desktop composition visibly matches the reference pattern: preview rail left, dense editor right.
- Preview updates as fields change.
- Draft survives page reload through the existing store.
- Reorder and delete operations are deterministic and tested.
- No enabled control is inert.
- Mobile has no horizontal page overflow and uses a distinct stacked layout.
- Unit tests, typecheck, and production build pass.
- Real browser click-through has no console errors.
