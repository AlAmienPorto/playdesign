import { useEffect, useState, useMemo, type CSSProperties } from 'react';
import { ShieldCheck } from 'lucide-react';
import type { CarouselDocument } from '../data/types';
import { splitHeadline } from '../lib/carousel';

interface CarouselPreviewProps {
  document: CarouselDocument;
  activeIndex: number;
  compact?: boolean;
  onImageState?: (invalid: boolean) => void;
}

interface ParsedPoint {
  num: string;
  title?: string;
  text: string;
}

function parseSlideBody(body: string): { points: ParsedPoint[]; paragraphs: string[] } {
  if (!body) return { points: [], paragraphs: [] };
  let lines = body.split('\n').map((l) => l.trim()).filter(Boolean);
  if (lines.length <= 1 && /\b1[\.\)]\s+.*\b2[\.\)]\s+/.test(body)) {
    lines = body.split(/(?=\b\d+[\.\)]\s+)/).map((l) => l.trim()).filter(Boolean);
  }
  const points: ParsedPoint[] = [];

  for (const line of lines) {
    const match = line.match(/^(\d+[\.\)]|[-*•])\s*(.*)/);
    if (match) {
      const rawNum = match[1].replace(/[\.\):]/g, '');
      const content = match[2];
      const colonIdx = content.indexOf(':');
      if (colonIdx > 0 && colonIdx < 35) {
        points.push({
          num: rawNum.length <= 2 ? rawNum.padStart(2, '0') : '•',
          title: content.slice(0, colonIdx).trim(),
          text: content.slice(colonIdx + 1).trim(),
        });
      } else {
        points.push({
          num: rawNum.length <= 2 ? rawNum.padStart(2, '0') : '•',
          text: content,
        });
      }
    }
  }

  if (points.length >= 2) {
    return { points, paragraphs: [] };
  }

  const paragraphs = body.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  return { points: [], paragraphs: paragraphs.length ? paragraphs : [body] };
}

export function CarouselPreview({ document, activeIndex, compact = false, onImageState }: CarouselPreviewProps) {
  const slide = document.slides[activeIndex] ?? document.slides[0];
  const [imageFailed, setImageFailed] = useState(false);
  const showImage = slide.kind === 'cover' && Boolean(document.coverImageUrl) && !imageFailed;
  const isEditorialCover = slide.kind === 'cover' && !showImage;
  const headline = splitHeadline(document.headline, document.highlight);
  const parsed = useMemo(() => parseSlideBody(slide.body || ''), [slide.body]);

  const rawKicker = document.kicker || 'PLAYDESIGN / RADAR';
  const isCrypto = rawKicker.toLowerCase().includes('crypto');
  const cleanKicker = rawKicker.replace(/^PLAYDESIGN\s*\/\s*/i, '').trim() || 'BERITA';

  useEffect(() => {
    setImageFailed(false);
    onImageState?.(false);
  }, [document.coverImageUrl, onImageState]);

  const failImage = () => {
    setImageFailed(true);
    onImageState?.(true);
  };

  return (
    <div
      className={`carousel-canvas template-${document.template}${compact ? ' is-compact' : ''}${
        isEditorialCover ? ' is-editorial-cover' : ''
      }`}
      data-testid="carousel-preview"
      aria-label={`Pratinjau slide ${activeIndex + 1} dari ${document.slides.length}`}
      style={document.accent ? ({ '--carousel-accent': document.accent } as CSSProperties) : undefined}
    >
      {document.template === 'kolase' ? (
        <div className="carousel-kolase-stack" aria-hidden="true">
          <i />
          <i />
          <i />
        </div>
      ) : null}
      {document.template === 'poster' ? (
        <svg className="carousel-poster-number" viewBox="0 0 100 60" aria-hidden="true" focusable="false">
          <text x="98" y="48" textAnchor="end" fontSize="52" fontWeight="900" fill="currentColor">
            {String(activeIndex + 1).padStart(2, '0')}
          </text>
        </svg>
      ) : null}
      {slide.kind === 'cover' ? (
        showImage ? (
          <>
            <div className="carousel-cover-media" aria-hidden="true">
              <img
                src={document.coverImageUrl}
                alt=""
                width="1080"
                height="1350"
                onError={failImage}
              />
            </div>
            <div className="carousel-cover-copy">
              <div className="carousel-kicker">{document.kicker || 'PLAYDESIGN / CAROUSEL'}</div>
              <h2>
                {headline.before}
                {headline.matched && <mark>{headline.highlight}</mark>}
                {headline.after}
              </h2>
              <div className="carousel-source">
                <span>Sumber</span>
                <strong>{document.sourceName || 'Belum diisi'}</strong>
              </div>
            </div>
          </>
        ) : (
          <div className="carousel-editorial-cover">
            <div className="carousel-watermark" aria-hidden="true">
              PLAYDESIGN
            </div>
            <div className="carousel-badge-row">
              <span className={`carousel-badge-pill ${isCrypto ? 'is-crypto' : ''}`}>
                {cleanKicker}
              </span>
              <span className="carousel-badge-meta">EDISI EDITORIAL</span>
            </div>
            <h2>
              {headline.before}
              {headline.matched && <mark>{headline.highlight}</mark>}
              {headline.after}
            </h2>
            {slide.body ? <p className="carousel-cover-subtitle">{slide.body}</p> : null}
            <div className="carousel-source-pill">
              <ShieldCheck size={13} />
              <span>Sumber Terverifikasi:</span>
              <strong>{document.sourceName || 'Belum diisi'}</strong>
            </div>
          </div>
        )
      ) : (
        <div className="carousel-text-slide">
          <div className="carousel-kicker">PLAYDESIGN / {String(activeIndex).padStart(2, '0')}</div>
          <div className="carousel-text-rule" />
          <h2>{slide.title || 'Judul slide belum diisi'}</h2>
          {parsed.points.length >= 2 ? (
            <div className="carousel-points-list">
              {parsed.points.map((pt, idx) => (
                <div key={idx} className="carousel-point-card">
                  <div className="carousel-point-badge">{pt.num}</div>
                  <div className="carousel-point-content">
                    {pt.title && <strong>{pt.title}</strong>}
                    <span>{pt.text}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="carousel-quote-box">
              {parsed.paragraphs.map((p, idx) => (
                <p key={idx}>{p}</p>
              ))}
            </div>
          )}
        </div>
      )}
      <div className="carousel-footer-tagline">LETS PLAY CREATIVITY WITH US</div>
      <div className="carousel-slide-number">
        <strong>{String(activeIndex + 1).padStart(2, '0')}</strong>
        <span>/ {String(document.slides.length).padStart(2, '0')}</span>
      </div>
      <div className="carousel-wordmark">{document.brandHandle || 'playdesign'}</div>
    </div>
  );
}
