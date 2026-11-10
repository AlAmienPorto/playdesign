import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowDown,
  ArrowUp,
  CalendarClock,
  Check,
  ChevronLeft,
  ChevronRight,
  Clipboard,
  CloudUpload,
  Download,
  ExternalLink,
  Image as ImageIcon,
  Plus,
  Save,
  Send,
  ShieldCheck,
  Trash2,
  X,
} from 'lucide-react';
import { CarouselPreview } from '../components/CarouselPreview';
import { AutoBadge, Badge, EmptyState, Field, Modal, PageHead } from '../components/ui';
import type { CarouselDocument, CarouselSlide, SocialPost } from '../data/types';
import {
  addTextSlide,
  CAROUSEL_FONTS,
  CAROUSEL_TEMPLATES,
  clampSlideIndex,
  deleteTextSlide,
  moveTextSlide,
  normalizeAccent,
  normalizeBrandHandle,
  normalizeCarousel,
  normalizeFont,
  resolveCarouselSelection,
} from '../lib/carousel';
import { ApiError, acknowledgeRadarDraftImport, createCarouselExportJob, fetchCarouselExportJobs, fetchOffice, fetchRadarDrafts, scheduleCarouselPublish, type CarouselExportJob, type CarouselPublishPlatform } from '../lib/api';
import { syncRadarDraftImports, type RadarDraft } from '../lib/content-radar';
import { useStore } from '../store/store';

const LAST_CAROUSEL_KEY = 'playdesign.carousel.last';

const ACTIVE_EXPORT_STATUSES: CarouselExportJob['status'][] = ['queued', 'rendering', 'uploading'];

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
  status: 'Draft',
});

const exportStatusLabel: Record<CarouselExportJob['status'], string> = {
  queued: 'Menunggu runner',
  rendering: 'Merender PNG 1080×1350',
  uploading: 'Mengunggah ke Drive',
  done: 'Tersimpan di Drive',
  failed: 'Gagal',
  canceled: 'Dibatalkan',
};

const formatBytes = (value?: number | null) => {
  if (!value || value <= 0) return '';
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
};

export function CarouselStudioPage() {
  const {
    db,
    can,
    role,
    user,
    createCarouselDraft,
    importRadarDrafts,
    saveCarousel,
    submitCarouselReview,
    decideCarouselReview,
    schedulePost,
    toast,
  } = useStore();
  const instagramPosts = useMemo(
    () => db.social.filter((post) => post.channel === 'Instagram'),
    [db.social],
  );
  const initialSelectedId = useMemo(() => {
    let preferredId: string | null = null;
    try {
      preferredId = localStorage.getItem(LAST_CAROUSEL_KEY);
    } catch {
      preferredId = null;
    }
    return resolveCarouselSelection(instagramPosts, preferredId);
  }, []);
  const [selectedId, setSelectedId] = useState(initialSelectedId);
  const selectedPost = instagramPosts.find((post) => post.id === selectedId) ?? null;
  const [document, setDocument] = useState<CarouselDocument | null>(() => {
    const initialPost = instagramPosts.find((post) => post.id === initialSelectedId);
    return initialPost ? normalizeCarousel(initialPost) : null;
  });
  const [activeIndex, setActiveIndex] = useState(0);
  const [dirty, setDirty] = useState(false);
  const [savedAt, setSavedAt] = useState(() => {
    const initialPost = instagramPosts.find((post) => post.id === initialSelectedId);
    return initialPost ? normalizeCarousel(initialPost).updatedAt : '';
  });
  const [imageInvalid, setImageInvalid] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [scheduleAt, setScheduleAt] = useState(() => {
    const initialPost = instagramPosts.find((post) => post.id === initialSelectedId);
    return initialPost ? toLocalDateTime(initialPost.date) : '';
  });
  const [statusMessage, setStatusMessage] = useState('');
  const [reviewNote, setReviewNote] = useState('');
  const [exportJob, setExportJob] = useState<CarouselExportJob | null>(null);
  const [exportBusy, setExportBusy] = useState(false);
  const [exportError, setExportError] = useState('');
  const [publishAccounts, setPublishAccounts] = useState<CarouselPublishPlatform[]>(['instagram']);
  const [publishAt, setPublishAt] = useState('');
  const [publishBusy, setPublishBusy] = useState(false);
  const [publishError, setPublishError] = useState('');

  // Import draft Content Radar yang belum di-import secara otomatis saat Carousel Studio dibuka.
  useEffect(() => {
    let cancelled = false;
    const rawWorkspace = db.workspaces?.find((w) => w.active)?.id ?? db.workspaces?.[0]?.id ?? 'playdesign';
    const workspaceId = rawWorkspace === 'ws-1' ? 'playdesign' : rawWorkspace;

    const runImport = async () => {
      let actorId = user.id || 'ja';
      try {
        const office = await fetchOffice(workspaceId);
        if (office.actor?.id) actorId = office.actor.id;
      } catch {
        // Tetap gunakan user.id bila fetchOffice gagal atau offline
      }

      if (cancelled) return;

      try {
        const res = await syncRadarDraftImports({
          workspaceId,
          actorId,
          fetchDrafts: async () => (await fetchRadarDrafts({ workspaceId, unimported: true, limit: 100 })) as unknown as RadarDraft[],
          importDrafts: importRadarDrafts,
          ackDraft: (draftId) => acknowledgeRadarDraftImport(draftId, { workspaceId, actorId }),
        });

        if (cancelled) return;
        if (res.imported.length > 0) {
          toast(`Mengimpor ${res.imported.length} draft dari Content Radar.`, 'success');
        }
        if (res.failed.length > 0) {
          toast(`${res.failed.length} draft radar belum berhasil disinkronkan.`, 'warning');
        }
      } catch {
        // Gagal import tidak memblokir editor
      }
    };

    runImport();

    return () => {
      cancelled = true;
    };
  }, []);

  // Jika dokumen kosong dan ada post Instagram (misal setelah import), pilih draft pertama
  useEffect(() => {
    if (!document && instagramPosts.length > 0) {
      const targetId = selectedId || resolveCarouselSelection(instagramPosts, null);
      const post = instagramPosts.find((row) => row.id === targetId) ?? instagramPosts[0];
      if (post) {
        setSelectedId(post.id);
        setDocument(normalizeCarousel(post));
        setSavedAt(post.carousel?.updatedAt ?? post.date);
        setScheduleAt(toLocalDateTime(post.date));
      }
    }
  }, [document, selectedId, instagramPosts]);

  // Status/pointer Drive dibaca dari D1; halaman tidak pernah menyimpan byte gambar.
  useEffect(() => {
    if (!selectedId) {
      setExportJob(null);
      return;
    }
    let cancelled = false;
    setExportError('');
    fetchCarouselExportJobs(selectedId)
      .then((jobs) => {
        if (!cancelled) setExportJob(jobs[0] ?? null);
      })
      .catch(() => {
        if (!cancelled) setExportJob(null);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  useEffect(() => {
    if (!exportJob) return;
    const publishing = exportJob.publishStatus === 'queued' || exportJob.publishStatus === 'scheduling';
    if (!ACTIVE_EXPORT_STATUSES.includes(exportJob.status) && !publishing) return;
    const postId = exportJob.postId;
    const timer = setInterval(() => {
      fetchCarouselExportJobs(postId)
        .then((jobs) => setExportJob(jobs[0] ?? null))
        .catch(() => undefined);
    }, 8000);
    return () => clearInterval(timer);
  }, [exportJob?.id, exportJob?.status, exportJob?.publishStatus, exportJob?.postId]);

  const rememberSelection = (postId: string) => {
    try {
      localStorage.setItem(LAST_CAROUSEL_KEY, postId);
    } catch {
      // The editor still works when browser storage is unavailable.
    }
  };

  const selectPost = (postId: string) => {
    const post = instagramPosts.find((row) => row.id === postId);
    if (!post) return;
    const nextDocument = normalizeCarousel(post);
    setSelectedId(postId);
    rememberSelection(postId);
    setDocument(nextDocument);
    setActiveIndex(0);
    setScheduleAt(toLocalDateTime(post.date));
    setDirty(false);
    setSavedAt(nextDocument.updatedAt);
    setImageInvalid(false);
    setReviewNote('');
    setStatusMessage('');
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
    rememberSelection(id);
    setDocument(nextDocument);
    setActiveIndex(0);
    setScheduleAt(toLocalDateTime(new Date().toISOString()));
    setDirty(false);
    setSavedAt(nextDocument.updatedAt);
    setReviewNote('');
    setStatusMessage('Draft carousel baru dibuat dengan status Draft.');
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

  const handleSubmitReview = () => {
    if (!selectedId) return;
    if (dirty) {
      toast('Simpan perubahan dulu sebelum mengajukan review.', 'warning');
      return;
    }
    if (submitCarouselReview(selectedId)) {
      setStatusMessage('Carousel diajukan dan menunggu keputusan Owner.');
    }
  };

  const handleDecision = (decision: 'approved' | 'rejected' | 'revision') => {
    if (!selectedId) return;
    if (decideCarouselReview(selectedId, decision, reviewNote)) {
      setReviewNote('');
      setStatusMessage(
        decision === 'approved'
          ? 'Carousel disetujui.'
          : decision === 'revision'
            ? 'Revisi diminta; carousel kembali ke Draft.'
            : 'Carousel ditolak.',
      );
    }
  };

  const handleExport = async () => {
    if (!document || !selectedId) return;
    if (dirty) {
      toast('Simpan perubahan dulu sebelum ekspor final.', 'warning');
      return;
    }
    setExportBusy(true);
    setExportError('');
    try {
      const job = await createCarouselExportJob({
        postId: selectedId,
        title: document.headline || 'Carousel',
        document,
      });
      setExportJob(job);
      setStatusMessage('Ekspor final masuk antrean runner lokal.');
      toast('Ekspor masuk antrean. Runner lokal akan mengunggah ke Drive.', 'success');
    } catch (error) {
      const message = error instanceof ApiError
        ? error.message
        : 'Tidak bisa menghubungi API ekspor. Periksa koneksi dan sesi login.';
      setExportError(message);
      toast(message, 'danger');
    } finally {
      setExportBusy(false);
    }
  };

  const togglePublishAccount = (platform: CarouselPublishPlatform) => {
    setPublishAccounts((current) =>
      current.includes(platform) ? current.filter((item) => item !== platform) : [...current, platform],
    );
  };

  const handleSchedulePublish = async () => {
    if (!exportJob) return;
    if (publishAccounts.length === 0) {
      toast('Pilih minimal satu akun Tebar.', 'warning');
      return;
    }
    setPublishBusy(true);
    setPublishError('');
    try {
      const scheduledAt = publishAt ? new Date(publishAt).toISOString() : null;
      const job = await scheduleCarouselPublish({
        jobId: exportJob.id,
        accounts: publishAccounts,
        scheduledAt,
      });
      setExportJob(job);
      setStatusMessage(
        scheduledAt
          ? `Carousel dijadwalkan ke Tebar pada ${new Date(scheduledAt).toLocaleString('id-ID')}.`
          : 'Carousel akan segera diposting ke Tebar.',
      );
      toast('Permintaan tayang dikirim ke runner Tebar.', 'success');
    } catch (error) {
      const message = error instanceof ApiError
        ? error.message
        : 'Gagal menjadwalkan ke Tebar. Periksa koneksi dan sesi login.';
      setPublishError(message);
      toast(message, 'danger');
    } finally {
      setPublishBusy(false);
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
    // Slide setelah yang dihapus bergeser satu posisi; slide aktif ikut bergeser
    // supaya yang sedang dilihat tidak melompat ke cover.
    const nextIndex = index < 0
      ? activeIndex
      : index < activeIndex
        ? activeIndex - 1
        : index === activeIndex
          ? Math.min(activeIndex, next.slides.length - 1)
          : activeIndex;
    setDocument(next);
    setActiveIndex(clampSlideIndex(nextIndex, next.slides.length));
    setDeleteId(null);
    setDirty(true);
  };

  const handleSchedule = () => {
    if (!selectedPost || selectedPost.status !== 'Approved' || !scheduleAt) return;
    if (dirty) {
      toast('Simpan perubahan dulu supaya jadwal memakai versi terbaru.', 'warning');
      return;
    }
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
          desc="Buat draft lokal pertama. Draft lahir berstatus Draft dan baru bisa diekspor setelah disetujui Owner."
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
  const status = selectedPost?.status ?? 'Draft';
  const isOwner = role === 'Owner';
  const locked = status === 'Scheduled' || status === 'Published';
  const canSchedule = status === 'Approved' && Boolean(scheduleAt) && !dirty;
  const canSubmit = (status === 'Draft' || status === 'Rejected') && !dirty && can('content.write');
  const canExport = status === 'Approved' && !dirty && isOwner && !exportBusy;
  const exportRunning = Boolean(exportJob && ACTIVE_EXPORT_STATUSES.includes(exportJob.status));
  const isRadarDraft = Boolean(
    selectedPost?.radarDraftId ||
    selectedPost?.author === 'radar-agent' ||
    selectedPost?.id?.startsWith('radar') ||
    selectedPost?.carousel?.kicker?.toLowerCase().includes('radar'),
  );
  const sanitizedSourceUrl = document.sourceUrl && /^https?:\/\//i.test(document.sourceUrl)
    ? document.sourceUrl
    : null;

  return (
    <>
      <PageHead
        kicker="Marketing & Content · Production"
        title="Carousel Studio"
        desc="Draft → review Owner → Approved → ekspor Drive atau jadwalkan. Konten AI tidak pernah tayang tanpa keputusan manusia."
        actions={
          <>
            {isRadarDraft && <Badge tone="brand">Content Radar</Badge>}
            <Badge tone={dirty ? 'warning' : 'success'}>{dirty ? 'Belum disimpan' : 'Tersimpan'}</Badge>
            <button type="button" className="btn btn-ghost" onClick={createDraft} disabled={!can('content.write')}>
              <Plus size={15} /> Draft baru
            </button>
            <button type="button" className="btn btn-primary" onClick={handleSave} disabled={!dirty || !can('content.write') || locked}>
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

      {isRadarDraft && (
        <div
          className="carousel-provenance-bar"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
            padding: '10px 14px',
            background: 'var(--surface-2)',
            border: '1px solid var(--line)',
            borderRadius: 'var(--radius)',
            marginBottom: '14px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Badge tone="brand">Content Radar</Badge>
            <span style={{ fontSize: '12.5px', color: 'var(--muted)' }}>
              Draft ini bersumber dari Content Radar.
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Link
              to="/marketing/content-radar"
              className="btn btn-ghost"
              style={{ fontSize: '12px', padding: '4px 10px' }}
            >
              Kembali ke Content Radar
            </Link>
            {sanitizedSourceUrl && (
              <a
                href={sanitizedSourceUrl}
                target="_blank"
                rel="noreferrer"
                className="btn btn-ghost"
                style={{
                  fontSize: '12px',
                  padding: '4px 10px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                }}
              >
                <ExternalLink size={13} /> Sumber asli
              </a>
            )}
          </div>
        </div>
      )}

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
                <h2>Review, ekspor, jadwal</h2>
              </div>
              <AutoBadge value={status} />
            </div>

            <ol className="carousel-status-track" aria-label="Tahapan carousel">
              {(['Draft', 'Review', 'Approved', 'Scheduled'] as const).map((step) => (
                <li
                  key={step}
                  className={
                    status === step
                      ? 'is-current'
                      : (step === 'Scheduled' ? status === 'Published' : false)
                        ? 'is-done'
                        : ''
                  }
                >
                  {step}
                </li>
              ))}
            </ol>

            {(status === 'Draft' || status === 'Rejected') && (
              <div className="carousel-workflow-grid">
                <div className="carousel-review-copy">
                  <strong>{status === 'Rejected' ? 'Ditolak Owner' : 'Draft lokal'}</strong>
                  <span>
                    {status === 'Rejected'
                      ? selectedPost?.reviewNote || 'Perbaiki sesuai catatan, lalu ajukan ulang.'
                      : 'Ajukan ke Owner untuk dinilai sebelum diekspor atau dijadwalkan.'}
                  </span>
                </div>
                <button type="button" className="btn btn-outline" onClick={handleSubmitReview} disabled={!canSubmit}>
                  <Send size={15} /> Ajukan review
                </button>
              </div>
            )}

            {status === 'Review' && (
              <div className="carousel-review-box">
                <p className="carousel-review-copy">
                  <ShieldCheck size={15} />
                  <span>
                    Menunggu keputusan Owner{selectedPost?.submittedAt ? ` · diajukan ${new Date(selectedPost.submittedAt).toLocaleString('id-ID')}` : ''}.
                    {' '}QC PASS bukan pengganti approval.
                  </span>
                </p>
                <Field label="Catatan keputusan" hint="Wajib untuk penolakan atau permintaan revisi.">
                  <textarea
                    className="input"
                    rows={3}
                    value={reviewNote}
                    onChange={(event) => setReviewNote(event.target.value)}
                    maxLength={400}
                    disabled={!isOwner}
                    placeholder="Alasan penolakan atau instruksi revisi…"
                  />
                </Field>
                <div className="carousel-review-actions">
                  <button type="button" className="btn btn-primary" onClick={() => handleDecision('approved')} disabled={!isOwner}>
                    <Check size={15} /> Setujui
                  </button>
                  <button type="button" className="btn btn-outline" onClick={() => handleDecision('revision')} disabled={!isOwner || !reviewNote.trim()}>
                    Minta revisi
                  </button>
                  <button type="button" className="btn btn-danger-text" onClick={() => handleDecision('rejected')} disabled={!isOwner || !reviewNote.trim()}>
                    <X size={15} /> Tolak
                  </button>
                </div>
                {!isOwner && (
                  <p className="carousel-inline-warning">Hanya Owner yang bisa memutuskan. Anda masuk sebagai {role}.</p>
                )}
              </div>
            )}

            {status === 'Approved' && (
              <>
                <div className="carousel-workflow-grid">
                  <Field label="Tanggal dan waktu tayang" hint="Penjadwalan tidak mempublikasikan konten langsung.">
                    <input
                      type="datetime-local"
                      className="input"
                      value={scheduleAt}
                      onChange={(event) => setScheduleAt(event.target.value)}
                    />
                  </Field>
                  <button type="button" className="btn btn-outline" onClick={handleSchedule} disabled={!canSchedule}>
                    <CalendarClock size={15} /> Jadwalkan
                  </button>
                </div>
                {dirty && (
                  <p className="carousel-inline-warning">Simpan perubahan dulu; jadwal dan ekspor memakai versi tersimpan.</p>
                )}
                {selectedPost?.reviewedBy && (
                  <p className="carousel-review-meta">
                    Disetujui {selectedPost.reviewedBy}
                    {selectedPost.approvedAt ? ` · ${new Date(selectedPost.approvedAt).toLocaleString('id-ID')}` : ''}
                    {selectedPost.reviewNote ? ` · "${selectedPost.reviewNote}"` : ''}
                  </p>
                )}

                <div className="carousel-export-panel">
                  <div className="carousel-export-head">
                    <div>
                      <span className="carousel-card-kicker">Artefak final</span>
                      <strong>Ekspor carousel ke Google Drive</strong>
                    </div>
                    <button type="button" className="btn btn-primary" onClick={handleExport} disabled={!canExport}>
                      <CloudUpload size={15} /> {exportRunning ? 'Ekspor berjalan…' : 'Ekspor final'}
                    </button>
                  </div>
                  <p className="carousel-export-hint">
                    Runner lokal merender setiap slide menjadi PNG 1080×1350, menulis caption + manifest,
                    lalu mengunggah satu folder ke Drive. Server hanya menyimpan status dan pointer.
                  </p>
                  {!isOwner && (
                    <p className="carousel-inline-warning">Ekspor final hanya untuk Owner.</p>
                  )}
                  {exportError && <p className="carousel-inline-warning">{exportError}</p>}
                  {exportJob ? (
                    <div className={`carousel-export-job tone-${exportJob.status}`}>
                      <div className="carousel-export-job-head">
                        <Badge tone={exportJob.status === 'done' ? 'success' : exportJob.status === 'failed' ? 'danger' : 'info'}>
                          {exportStatusLabel[exportJob.status]}
                        </Badge>
                        <span className="carousel-export-meta">
                          {exportJob.slideCount} slide
                          {formatBytes(exportJob.bytes) ? ` · ${formatBytes(exportJob.bytes)}` : ''}
                          {exportJob.attempts ? ` · percobaan ${exportJob.attempts + 1}` : ''}
                        </span>
                      </div>
                      {exportJob.status === 'done' && exportJob.driveFolderLink && (
                        <a className="btn btn-ghost carousel-drive-link" href={exportJob.driveFolderLink} target="_blank" rel="noreferrer">
                          <ExternalLink size={15} /> Buka folder Drive
                        </a>
                      )}
                      {exportJob.status === 'done' && status === 'Approved' && (
                        <div className="carousel-publish">
                          <div className="carousel-publish-head">
                            <span className="carousel-card-kicker">Distribusi</span>
                            <strong><Send size={14} /> Jadwalkan ke Tebar</strong>
                          </div>
                          {exportJob.publishStatus === 'scheduled' && (
                            <p className="carousel-export-meta">
                              Terjadwal di Tebar
                              {exportJob.publishAt
                                ? ` · ${new Date(exportJob.publishAt).toLocaleString('id-ID')}`
                                : ' · segera tayang'}
                              {exportJob.tebarPostId ? ` · post ${exportJob.tebarPostId.slice(0, 8)}` : ''}
                            </p>
                          )}
                          {(exportJob.publishStatus === 'queued' || exportJob.publishStatus === 'scheduling') && (
                            <p className="carousel-export-meta">Runner sedang mengunggah media ke Tebar…</p>
                          )}
                          {exportJob.publishStatus === 'failed' && exportJob.publishError && (
                            <p className="carousel-export-error">{exportJob.publishError}</p>
                          )}
                          {exportJob.publishStatus !== 'scheduled' && (
                            <div className="carousel-publish-form">
                              <Field label="Waktu tayang" hint="Kosongkan untuk tayang sekarang.">
                                <input
                                  type="datetime-local"
                                  className="input"
                                  value={publishAt}
                                  onChange={(event) => setPublishAt(event.target.value)}
                                />
                              </Field>
                              <div className="carousel-publish-targets" role="group" aria-label="Akun Tebar tujuan">
                                {(['instagram', 'threads'] as CarouselPublishPlatform[]).map((platform) => (
                                  <label
                                    key={platform}
                                    className={`carousel-chip${publishAccounts.includes(platform) ? ' is-on' : ''}`}
                                  >
                                    <input
                                      type="checkbox"
                                      checked={publishAccounts.includes(platform)}
                                      onChange={() => togglePublishAccount(platform)}
                                    />
                                    {platform === 'instagram' ? 'Instagram' : 'Threads'}
                                  </label>
                                ))}
                              </div>
                              <button
                                type="button"
                                className="btn btn-ghost"
                                onClick={handleSchedulePublish}
                                disabled={publishBusy || !isOwner}
                              >
                                <Send size={15} /> {publishBusy ? 'Mengirim…' : 'Jadwalkan ke Tebar'}
                              </button>
                            </div>
                          )}
                          {!isOwner && (
                            <p className="carousel-inline-warning">Penjadwalan Tebar hanya untuk Owner.</p>
                          )}
                          {publishError && <p className="carousel-inline-warning">{publishError}</p>}
                        </div>
                      )}
                      {exportJob.status === 'failed' && exportJob.error && (
                        <p className="carousel-export-error">{exportJob.error}</p>
                      )}
                      {ACTIVE_EXPORT_STATUSES.includes(exportJob.status) && (
                        <p className="carousel-export-meta">
                          Menunggu runner lokal. Status diperbarui otomatis tiap 8 detik.
                        </p>
                      )}
                    </div>
                  ) : (
                    <p className="carousel-export-meta">Belum ada ekspor untuk carousel ini.</p>
                  )}
                </div>
              </>
            )}

            {locked && (
              <div className="carousel-review-box">
                <p className="carousel-review-copy">
                  <ShieldCheck size={15} />
                  <span>
                    {status === 'Scheduled'
                      ? 'Konten sudah dijadwalkan. Edit dikunci agar kalender dan artefak Drive tetap sinkron.'
                      : 'Konten sudah terbit. Riwayat tidak bisa ditimpa dari Carousel Studio.'}
                  </span>
                </p>
                {exportJob?.status === 'done' && exportJob.driveFolderLink && (
                  <a className="btn btn-ghost carousel-drive-link" href={exportJob.driveFolderLink} target="_blank" rel="noreferrer">
                    <ExternalLink size={15} /> Buka folder Drive
                  </a>
                )}
              </div>
            )}
          </section>

          <fieldset className="carousel-lock" disabled={locked}>
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
                <Field className="span-2" label="Template cover" hint="Klik kartu — pratinjau langsung memakai dokumen ini.">
                  <div className="carousel-template-gallery">
                    {CAROUSEL_TEMPLATES.map((tpl) => (
                      <button
                        key={tpl.id}
                        type="button"
                        className={`carousel-template-card${document.template === tpl.id ? ' is-active' : ''}`}
                        onClick={() => patchDocument({ template: tpl.id })}
                        aria-pressed={document.template === tpl.id}
                        title={tpl.description}
                      >
                        <span className="carousel-template-thumb" aria-hidden="true">
                          <CarouselPreview document={{ ...document, template: tpl.id }} activeIndex={0} compact />
                        </span>
                        <span className="carousel-template-meta">
                          <strong>{tpl.label}</strong>
                          <span>{tpl.description}</span>
                          <em>{tpl.useCase}</em>
                        </span>
                      </button>
                    ))}
                  </div>
                </Field>
                <Field label="Warna aksen" hint={document.accent ? 'Aksen brand aktif.' : 'Kosong = palet template.'}>
                  <div className="carousel-accent-row">
                    <input
                      type="color"
                      className="carousel-accent-swatch"
                      aria-label="Pilih warna aksen"
                      value={document.accent || '#ef5a6b'}
                      onChange={(event) => patchDocument({ accent: normalizeAccent(event.target.value) })}
                    />
                    <input
                      className="input"
                      value={document.accent ?? ''}
                      onChange={(event) => patchDocument({ accent: event.target.value })}
                      onBlur={(event) => patchDocument({ accent: normalizeAccent(event.target.value) })}
                      placeholder="#ef5a6b"
                      maxLength={7}
                      aria-label="Kode warna aksen"
                    />
                  </div>
                </Field>
                <Field label="Handle brand" hint="Tampil di footer setiap slide.">
                  <input
                    className="input"
                    value={document.brandHandle ?? ''}
                    onChange={(event) => patchDocument({ brandHandle: event.target.value })}
                    onBlur={(event) => patchDocument({ brandHandle: normalizeBrandHandle(event.target.value) })}
                    placeholder="@plydsgn"
                    maxLength={31}
                  />
                </Field>
                <Field label="Font dasar" hint="Berlaku untuk semua slide; bisa ditimpa per slide.">
                  <select
                    className="input"
                    value={document.font ?? ''}
                    onChange={(event) => patchDocument({ font: normalizeFont(event.target.value) })}
                  >
                    <option value="">Default (Grotesk)</option>
                    {CAROUSEL_FONTS.map((font) => (
                      <option key={font.id} value={font.id}>{font.label}</option>
                    ))}
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
                  {isRadarDraft && (
                    <div style={{ display: 'flex', gap: '8px', marginTop: '6px' }}>
                      <Link to="/marketing/content-radar" className="btn btn-ghost" style={{ fontSize: '11.5px', padding: '2px 8px' }}>
                        Kembali ke Content Radar
                      </Link>
                      {sanitizedSourceUrl && (
                        <a href={sanitizedSourceUrl} target="_blank" rel="noreferrer" className="btn btn-ghost" style={{ fontSize: '11.5px', padding: '2px 8px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                          <ExternalLink size={12} /> Buka sumber asli
                        </a>
                      )}
                    </div>
                  )}
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
                    <Field label="Font slide ini" hint="Kosong = ikut font dasar.">
                      <select
                        className="input"
                        value={slide.font ?? ''}
                        onFocus={() => setActiveIndex(index)}
                        onChange={(event) => patchSlide(slide.id, { font: normalizeFont(event.target.value) })}
                      >
                        <option value="">Ikut font dasar</option>
                        {CAROUSEL_FONTS.map((font) => (
                          <option key={font.id} value={font.id}>{font.label}</option>
                        ))}
                      </select>
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
          </fieldset>

          <div className="carousel-bottom-actions">
            <span><Check size={14} /> {locked ? 'Konten terkunci' : dirty ? 'Ada perubahan yang belum disimpan' : 'Draft lokal sinkron'}</span>
            <button type="button" className="btn btn-primary" onClick={handleSave} disabled={!dirty || !can('content.write') || locked}>
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
