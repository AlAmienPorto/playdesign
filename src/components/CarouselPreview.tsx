import { useEffect, useState } from 'react';
import { ImageOff } from 'lucide-react';
import type { CarouselDocument } from '../data/types';
import { splitHeadline } from '../lib/carousel';

interface CarouselPreviewProps {
  document: CarouselDocument;
  activeIndex: number;
  compact?: boolean;
  onImageState?: (invalid: boolean) => void;
}

export function CarouselPreview({ document, activeIndex, compact = false, onImageState }: CarouselPreviewProps) {
  const slide = document.slides[activeIndex] ?? document.slides[0];
  const [imageFailed, setImageFailed] = useState(false);
  const showImage = slide.kind === 'cover' && Boolean(document.coverImageUrl) && !imageFailed;
  const headline = splitHeadline(document.headline, document.highlight);

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
      className={`carousel-canvas template-${document.template}${compact ? ' is-compact' : ''}`}
      data-testid="carousel-preview"
      aria-label={`Pratinjau slide ${activeIndex + 1} dari ${document.slides.length}`}
    >
      {slide.kind === 'cover' ? (
        <>
          <div className="carousel-cover-media" aria-hidden="true">
            {showImage ? (
              <img
                src={document.coverImageUrl}
                alt=""
                width="1080"
                height="1350"
                onError={failImage}
              />
            ) : (
              <div className="carousel-image-empty">
                <ImageOff size={compact ? 14 : 26} />
                {!compact && <span>{imageFailed ? 'Foto cover tidak dapat dimuat' : 'Foto cover belum dipilih'}</span>}
              </div>
            )}
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
        <div className="carousel-text-slide">
          <div className="carousel-kicker">PLAYDESIGN / {String(activeIndex).padStart(2, '0')}</div>
          <div className="carousel-text-rule" />
          <h2>{slide.title || 'Judul slide belum diisi'}</h2>
          <p>{slide.body || 'Isi slide belum diisi.'}</p>
        </div>
      )}
      <div className="carousel-slide-number">
        <strong>{String(activeIndex + 1).padStart(2, '0')}</strong>
        <span>/ {String(document.slides.length).padStart(2, '0')}</span>
      </div>
      <div className="carousel-wordmark">playdesign</div>
    </div>
  );
}
