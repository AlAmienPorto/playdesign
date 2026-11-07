import { useMemo, useState } from 'react';
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  CalendarClock,
  Check,
  ChevronLeft,
  ChevronRight,
  Clipboard,
  Download,
  Image as ImageIcon,
  Plus,
  Save,
  Trash2,
} from 'lucide-react';
import { CarouselPreview } from '../components/CarouselPreview';
import { Badge, EmptyState, Field, Modal, PageHead } from '../components/ui';
import type { CarouselDocument, CarouselSlide, SocialPost } from '../data/types';
import {
  addTextSlide,
  clampSlideIndex,
  deleteTextSlide,
  moveTextSlide,
  normalizeCarousel,
} from '../lib/carousel';
import { useStore } from '../store/store';

const toLocalDateTime = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
};

const escapeXml = (value: string) => value.replace(/[<>&'\"]/g, (char) => ({
  '<': '&lt;',
  '>': '&gt;',
  '&': '&amp;',
  "'": '&apos;',
  '"': '&quot;',
}[char] ?? char));

const wrapSvgText = (value: string, max = 28) => {
  const words = value.trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    if (`${line} ${word}`.trim().length > max && line) {
      lines.push(line);
      line = word;
    } else {
      line = `${line} ${word}`.trim();
    }
  }
  if (line) lines.push(line);
  return lines.slice(0, 8);
};

const previewSvg = (document: CarouselDocument, activeIndex: number) => {
  const slide = document.slides[activeIndex] ?? document.slides[0];
  const title = slide.kind === 'cover' ? document.headline : slide.title;
  const body = slide.kind === 'cover'
    ? `Sumber: ${document.sourceName || 'Belum diisi'}`
    : slide.body || 'Isi slide belum diisi.';
  const titleLines = wrapSvgText(title, 24);
  const bodyLines = wrapSvgText(body, 42);
  const titleText = titleLines.map((line, index) =>
    `<tspan x="88" dy="${index === 0 ? 0 : 80}">${escapeXml(line)}</tspan>`,
  ).join('');
  const bodyY = 420 + titleLines.length * 80;
  const bodyText = bodyLines.map((line, index) =>
    `<tspan x="88" dy="${index === 0 ? 0 : 46}">${escapeXml(line)}</tspan>`,
  ).join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1350" viewBox="0 0 1080 1350">
    <rect width="1080" height="1350" fill="#11131a"/>
    <rect x="0" y="0" width="24" height="1350" fill="#bf1d2d"/>
    <text x="88" y="110" fill="#ef5a6b" font-family="Arial, sans-serif" font-size="24" font-weight="700" letter-spacing="4">${escapeXml(document.kicker || 'PLAYDESIGN / CAROUSEL')}</text>
    <text x="88" y="420" fill="#fffaf5" font-family="Arial, sans-serif" font-size="68" font-weight="800">${titleText}</text>
    <text x="88" y="${bodyY}" fill="#c5bdba" font-family="Arial, sans-serif" font-size="30">${bodyText}</text>
    <text x="88" y="1260" fill="#ef5a6b" font-family="Arial, sans-serif" font-size="30" font-weight="700">playdesign</text>
    <text x="930" y="1260" fill="#fffaf5" font-family="Arial, sans-serif" font-size="30" text-anchor="end">${String(activeIndex + 1).padStart(2, '0')} / ${String(document.slides.length).padStart(2, '0')}</text>
    ${document.coverImageUrl && slide.kind === 'cover' ? '<text x="88" y="1180" fill="#8f8785" font-family="Arial, sans-serif" font-size="22">Foto eksternal tidak disematkan dalam ekspor SVG.</text>' : ''}
  </svg>`;
};

const draftPost = (id: string): SocialPost => ({
  id,
  title: 'Judul carousel baru',
  channel: 'Instagram',
  date: new Date().toISOString(),
  status: 'Approved',
});

export function CarouselStudioPage() {
  const {
    db,
    can,
    createCarouselDraft,
    saveCarousel,
    schedulePost,
    toast,
  } = useStore();
  const instagramPosts = useMemo(
    () => db.social.filter((post) => post.channel === 'Instagram'),
    [db.social],
  );
  const [selectedId, setSelectedId] = useState(() => instagramPosts[0]?.id ?? '');
  const selectedPost = instagramPosts.find((post) => post.id === selectedId) ?? null;
  const [document, setDocument] = useState<CarouselDocument | null>(() =>
    instagramPosts[0] ? normalizeCarousel(instagramPosts[0]) : null,
  );
  const [activeIndex, setActiveIndex] = useState(0);
  const [dirty, setDirty] = useState(false);
  const [savedAt, setSavedAt] = useState('');
  const [imageInvalid, setImageInvalid] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [scheduleAt, setScheduleAt] = useState(() =>
    instagramPosts[0] ? toLocalDateTime(instagramPosts[0].date) : '',
  );
  const [statusMessage, setStatusMessage] = useState('');

  const selectPost = (postId: string) => {
    const post = instagramPosts.find((row) => row.id === postId);
    if (!post) return;
    setSelectedId(postId);
    setDocument(normalizeCarousel(post));
    setActiveIndex(0);
    setScheduleAt(toLocalDateTime(post.date));
    setDirty(false);
    setSavedAt('');
    setImageInvalid(false);
  };

  const updateDocument = (updater: (current: CarouselDocument) => CarouselDocument) => {
    setDocument((current) => current ? updater(current) : current);
    setDirty(true);
    setSavedAt('');
  };

  const patchDocument = (patch: Partial<CarouselDocument>) => {
    updateDocument((current) => {
      const next = { ...current, ...patch };
      if (patch.headline !== undefined) {
        next.slides = current.slides.map((slide, index) =>
          index === 0 ? { ...slide, title: patch.headline ?? '' } : slide,
        );
      }
      return next;
    });
  };

  const patchSlide = (slideId: string, patch: Partial<CarouselSlide>) => {
    updateDocument((current) => ({
      ...current,
      slides: current.slides.map((slide) => slide.id === slideId ? { ...slide, ...patch } : slide),
    }));
  };

  const createDraft = () => {
    const id = createCarouselDraft();
    if (!id) return;
    const nextDocument = normalizeCarousel(draftPost(id));
    setSelectedId(id);
    setDocument(nextDocument);
    setActiveIndex(0);
    setScheduleAt(toLocalDateTime(new Date().toISOString()));
    setDirty(false);
    setSavedAt(nextDocument.updatedAt);
  };

  const handleSave = () => {
    if (!document || !selectedId) return;
    if (saveCarousel(selectedId, document)) {
      const time = new Date().toISOString();
      setDocument({ ...document, updatedAt: time });
      setDirty(false);
      setSavedAt(time);
      setStatusMessage('Draft carousel tersimpan.');
    }
  };

  const handleCopy = async () => {
    if (!document) return;
    const hashtags = document.hashtags.map((tag) => `#${tag.replace(/^#+/, '')}`).join(' ');
    const text = [document.caption.trim(), hashtags].filter(Boolean).join('\n\n');
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard tidak tersedia');
      await navigator.clipboard.writeText(text);
      toast('Caption disalin.', 'success');
      setStatusMessage('Caption dan hashtag disalin ke clipboard.');
    } catch {
      toast('Caption gagal disalin. Periksa izin clipboard browser.', 'danger');
      setStatusMessage('Gagal menyalin caption.');
    }
  };

  const handleDownload = () => {
    if (!document) return;
    try {
      const blob = new Blob([previewSvg(document, activeIndex)], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const anchor = window.document.createElement('a');
      anchor.href = url;
      anchor.download = `${selectedId || 'carousel'}-slide-${activeIndex + 1}.svg`;
      anchor.click();
      URL.revokeObjectURL(url);
      toast('Slide SVG diunduh.', 'success');
      setStatusMessage('Slide aktif berhasil diunduh sebagai SVG.');
    } catch {
      toast('Slide gagal diunduh.', 'danger');
      setStatusMessage('Gagal mengunduh slide.');
    }
  };

  const addSlide = () => {
    if (!document) return;
    const next = addTextSlide(document);
    setDocument(next);
    setActiveIndex(next.slides.length - 1);
    setDirty(true);
  };

  const moveSlide = (slideId: string, direction: -1 | 1) => {
    if (!document) return;
    const currentIndex = document.slides.findIndex((slide) => slide.id === slideId);
    const next = moveTextSlide(document, slideId, direction);
    setDocument(next);
    setActiveIndex(clampSlideIndex(currentIndex + direction, next.slides.length));
    setDirty(true);
  };

  const confirmDelete = () => {
    if (!document || !deleteId) return;
    const index = document.slides.findIndex((slide) => slide.id === deleteId);
    const next = deleteTextSlide(document, deleteId);
    setDocument(next);
    setActiveIndex(clampSlideIndex(Math.min(activeIndex, index - 1), next.slides.length));
    setDeleteId(null);
    setDirty(true);
  };

  const handleSchedule = () => {
    if (!selectedPost || selectedPost.status !== 'Approved' || !scheduleAt) return;
    schedulePost(selectedPost.id, new Date(scheduleAt).toISOString());
    setStatusMessage('Carousel dijadwalkan melalui Social Planner.');
  };

  if (!document) {
    return (
      <>
        <PageHead
          kicker="Marketing & Content"
          title="Carousel Studio"
          desc="Susun carousel Instagram dengan preview 4:5 dan kontrol editorial dalam satu layar."
        />
        <EmptyState
          icon={<ImageIcon size={24} />}
          title="Belum ada carousel Instagram"
          desc="Buat draft lokal pertama. Draft akan masuk ke data Social Planner dan tidak dipublikasikan otomatis."
          action={can('content.write') ? (
            <button type="button" className="btn btn-primary" onClick={createDraft}>
              <Plus size={15} /> Buat draft carousel
            </button>
          ) : undefined}
        />
      </>
    );
  }

  const activeSlide = document.slides[activeIndex] ?? document.slides[0];
  const highlightMatches = !document.highlight.trim()
    || document.headline.toLocaleLowerCase('id').includes(document.highlight.trim().toLocaleLowerCase('id'));
  const canSchedule = selectedPost?.status === 'Approved' && Boolean(scheduleAt);

  return (
    <>
      <PageHead
        kicker="Marketing & Content · Production"
        title="Carousel Studio"
        desc="Edit konten sambil menilai hasil 4:5. Draft tersimpan lokal; publikasi tetap melalui approval dan Social Planner."
        actions={
          <>
            <Badge tone={dirty ? 'warning' : 'success'}>{dirty ? 'Belum disimpan' : 'Tersimpan'}</Badge>
            <button type="button" className="btn btn-ghost" onClick={createDraft} disabled={!can('content.write')}>
              <Plus size={15} /> Draft baru
            </button>
            <button type="button" className="btn btn-primary" onClick={handleSave} disabled={!dirty || !can('content.write')}>
              <Save size={15} /> Simpan draft
            </button>
          </>
        }
      />

      <div className="carousel-toolbar" aria-label="Pilih dokumen carousel">
        <Field label="Dokumen Instagram">
          <select className="input" value={selectedId} onChange={(event) => selectPost(event.target.value)}>
            {instagramPosts.map((post) => (
              <option value={post.id} key={post.id}>{post.title} · {post.status}</option>
            ))}
          </select>
        </Field>
        <div className="carousel-save-state">
          <span>{document.slides.length} slide</span>
          <span>{savedAt ? `Terakhir disimpan ${new Date(savedAt).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}` : 'Perubahan lokal belum disimpan'}</span>
        </div>
      </div>

      <div className="carousel-studio">
        <aside className="carousel-preview-rail" aria-label="Pratinjau carousel">
          <CarouselPreview
            document={document}
            activeIndex={activeIndex}
            onImageState={setImageInvalid}
          />
          <div className="carousel-nav-row">
            <button
              type="button"
              className="carousel-nav-btn"
              onClick={() => setActiveIndex((index) => clampSlideIndex(index - 1, document.slides.length))}
              disabled={activeIndex === 0}
              aria-label="Slide sebelumnya"
            >
              <ChevronLeft size={18} />
            </button>
            <span><strong>{activeIndex + 1}</strong> / {document.slides.length}</span>
            <button
              type="button"
              className="carousel-nav-btn"
              onClick={() => setActiveIndex((index) => clampSlideIndex(index + 1, document.slides.length))}
              disabled={activeIndex === document.slides.length - 1}
              aria-label="Slide berikutnya"
            >
              <ChevronRight size={18} />
            </button>
          </div>
          <div className="carousel-thumbnails" aria-label="Daftar slide">
            {document.slides.map((slide, index) => (
              <button
                type="button"
                key={slide.id}
                className={`carousel-thumbnail${index === activeIndex ? ' is-active' : ''}`}
                onClick={() => setActiveIndex(index)}
                aria-label={`Buka slide ${index + 1}: ${slide.title}`}
                aria-current={index === activeIndex ? 'true' : undefined}
              >
                <CarouselPreview document={document} activeIndex={index} compact />
                <span>{String(index + 1).padStart(2, '0')}</span>
              </button>
            ))}
          </div>
          <div className="carousel-preview-actions">
            <button type="button" className="btn btn-ghost" onClick={handleDownload}>
              <Download size={15} /> Unduh slide
            </button>
            <button type="button" className="btn btn-ghost" onClick={handleCopy}>
              <Clipboard size={15} /> Copy caption
            </button>
          </div>
          {document.coverImageUrl && activeSlide.kind === 'cover' && (
            <p className="carousel-export-note">Ekspor SVG memuat layout dan teks. Foto eksternal tidak disematkan.</p>
          )}
        </aside>

        <main className="carousel-editor" aria-label="Editor carousel">
          <section className="carousel-editor-card carousel-workflow-card">
            <div className="carousel-card-head">
              <div>
                <span className="carousel-card-kicker">Workflow</span>
                <h2>Approval & jadwal</h2>
              </div>
              <Badge tone={selectedPost?.status === 'Approved' ? 'success' : 'neutral'}>{selectedPost?.status ?? 'Draft'}</Badge>
            </div>
            <div className="carousel-workflow-grid">
              <Field label="Tanggal dan waktu tayang" hint="Penjadwalan tidak mempublikasikan konten langsung.">
                <input type="datetime-local" className="input" value={scheduleAt} onChange={(event) => setScheduleAt(event.target.value)} />
              </Field>
              <button type="button" className="btn btn-outline" onClick={handleSchedule} disabled={!canSchedule}>
                <CalendarClock size={15} /> Jadwalkan
              </button>
            </div>
            {!canSchedule && (
              <p className="carousel-inline-warning">Hanya record berstatus Approved dengan waktu valid yang dapat dijadwalkan.</p>
            )}
          </section>

          <section className="carousel-editor-card">
            <div className="carousel-card-head">
              <div>
                <span className="carousel-card-kicker">Slide 01</span>
                <h2>Cover</h2>
              </div>
              <Badge tone="brand">4:5</Badge>
            </div>
            <div className="carousel-form-grid">
              <Field label="Label atas">
                <input className="input" value={document.kicker} onChange={(event) => patchDocument({ kicker: event.target.value })} maxLength={48} />
              </Field>
              <Field label="Template cover">
                <select className="input" value={document.template} onChange={(event) => patchDocument({ template: event.target.value as CarouselDocument['template'] })}>
                  <option value="split-brand">Split brand</option>
                  <option value="split-dark">Split dark</option>
                  <option value="full-image">Full image</option>
                </select>
              </Field>
              <Field className="span-2" label="Judul" hint={`${document.headline.length}/120 karakter`}>
                <textarea className="input" value={document.headline} onChange={(event) => patchDocument({ headline: event.target.value })} maxLength={120} rows={3} />
              </Field>
              <Field label="Kata sorotan" hint={highlightMatches ? 'Frasa ditemukan di judul.' : 'Frasa belum ditemukan; judul tetap tampil utuh.'}>
                <input className={`input${highlightMatches ? '' : ' is-invalid'}`} value={document.highlight} onChange={(event) => patchDocument({ highlight: event.target.value })} maxLength={40} />
              </Field>
              <Field label="Nama sumber">
                <input className="input" value={document.sourceName} onChange={(event) => patchDocument({ sourceName: event.target.value })} maxLength={60} />
              </Field>
              <Field className="span-2" label="URL sumber">
                <input type="url" className="input" value={document.sourceUrl} onChange={(event) => patchDocument({ sourceUrl: event.target.value })} placeholder="https://…" />
              </Field>
              <Field className="span-2" label="URL foto cover" hint={imageInvalid ? 'Foto tidak dapat dimuat. Preview memakai placeholder.' : 'Kosongkan jika foto belum siap.'}>
                <input type="url" className={`input${imageInvalid ? ' is-invalid' : ''}`} value={document.coverImageUrl} onChange={(event) => patchDocument({ coverImageUrl: event.target.value })} placeholder="https://…" />
              </Field>
            </div>
          </section>

          {document.slides.slice(1).map((slide, textIndex) => {
            const index = textIndex + 1;
            return (
              <section className={`carousel-editor-card${activeIndex === index ? ' is-active' : ''}`} key={slide.id}>
                <div className="carousel-card-head">
                  <div>
                    <span className="carousel-card-kicker">Slide {String(index + 1).padStart(2, '0')}</span>
                    <h2>{slide.title || 'Slide tanpa judul'}</h2>
                  </div>
                  <div className="carousel-card-controls">
                    <button type="button" className="icon-btn" onClick={() => moveSlide(slide.id, -1)} disabled={index === 1} aria-label={`Pindahkan slide ${index + 1} ke atas`}><ArrowUp size={15} /></button>
                    <button type="button" className="icon-btn" onClick={() => moveSlide(slide.id, 1)} disabled={index === document.slides.length - 1} aria-label={`Pindahkan slide ${index + 1} ke bawah`}><ArrowDown size={15} /></button>
                    <button type="button" className="icon-btn is-danger" onClick={() => setDeleteId(slide.id)} aria-label={`Hapus slide ${index + 1}`}><Trash2 size={15} /></button>
                  </div>
                </div>
                <div className="carousel-form-grid">
                  <Field className="span-2" label="Judul slide" hint={`${slide.title.length}/90 karakter`}>
                    <input className="input" value={slide.title} onFocus={() => setActiveIndex(index)} onChange={(event) => patchSlide(slide.id, { title: event.target.value })} maxLength={90} />
                  </Field>
                  <Field className="span-2" label="Isi" hint={`${slide.body.length}/260 karakter`}>
                    <textarea className="input" value={slide.body} onFocus={() => setActiveIndex(index)} onChange={(event) => patchSlide(slide.id, { body: event.target.value })} maxLength={260} rows={4} />
                  </Field>
                </div>
              </section>
            );
          })}

          <button type="button" className="carousel-add-slide" onClick={addSlide}>
            <Plus size={17} /> Tambah slide teks
          </button>

          <section className="carousel-editor-card">
            <div className="carousel-card-head">
              <div>
                <span className="carousel-card-kicker">Distribusi</span>
                <h2>Caption & hashtag</h2>
              </div>
            </div>
            <div className="carousel-form-grid">
              <Field className="span-2" label="Caption" hint={`${document.caption.length}/2.200 karakter`}>
                <textarea className="input carousel-caption-input" value={document.caption} onChange={(event) => patchDocument({ caption: event.target.value })} maxLength={2200} rows={6} />
              </Field>
              <Field className="span-2" label="Hashtag" hint="Pisahkan dengan spasi atau koma; tanda # ditambahkan saat disalin.">
                <input
                  className="input"
                  value={document.hashtags.join(' ')}
                  onChange={(event) => patchDocument({
                    hashtags: event.target.value.split(/[\s,]+/).map((tag) => tag.replace(/^#+/, '').trim()).filter(Boolean),
                  })}
                  placeholder="branding designstudio playdesign"
                />
              </Field>
            </div>
          </section>

          <div className="carousel-bottom-actions">
            <span><Check size={14} /> {dirty ? 'Ada perubahan yang belum disimpan' : 'Draft lokal sinkron'}</span>
            <button type="button" className="btn btn-primary" onClick={handleSave} disabled={!dirty || !can('content.write')}>
              <Save size={15} /> Simpan draft
            </button>
          </div>
        </main>
      </div>

      <p className="sr-only" role="status" aria-live="polite">{statusMessage}</p>

      <Modal
        open={Boolean(deleteId)}
        onClose={() => setDeleteId(null)}
        title="Hapus slide teks?"
        sub="Slide akan dihapus dari draft lokal setelah Anda menyimpan perubahan."
        footer={
          <>
            <button type="button" className="btn btn-ghost" onClick={() => setDeleteId(null)}>Batal</button>
            <button type="button" className="btn btn-danger-text" onClick={confirmDelete}><Trash2 size={14} /> Hapus slide</button>
          </>
        }
      >
        <p>Cover tetap dipertahankan. Tindakan ini tidak memengaruhi konten yang sudah dipublikasikan.</p>
      </Modal>
    </>
  );
}
