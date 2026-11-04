import { useState } from 'react';
import {
  Heart,
  MessageCircle,
  Send,
  Bookmark,
  Share2,
  ThumbsUp,
  Repeat2,
  BarChart2,
  MoreHorizontal,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  Globe,
  Sparkles,
} from 'lucide-react';
import { Badge } from './ui';

export interface SocialPreviewProps {
  channel: 'Instagram' | 'LinkedIn' | 'X' | 'YouTube' | 'Newsletter' | string;
  title?: string;
  caption?: string;
  hashtags?: string[];
  slides?: string[];
  author?: string;
  date?: string;
}

export function SocialPostPreview({
  channel = 'Instagram',
  title = 'Post Preview',
  caption = '',
  hashtags = [],
  slides = [],
  author = 'Playdesign Studio',
}: SocialPreviewProps) {
  const [currentSlide, setCurrentSlide] = useState(0);
  const [liked, setLiked] = useState(false);
  const [saved, setSaved] = useState(false);

  const displaySlides =
    slides.length > 0
      ? slides
      : [
          title || 'Kreativitas & Sistem: Menemukan Titik Temu',
          'Konsistensi identitas visual memperkuat kepercayaan brand hingga 3.5x.',
          'Pelajari studi kasus lengkap di playdesign.studio',
        ];

  const displayCaption =
    caption ||
    'Setiap touchpoint brand adalah cerminan nilai studio Anda. Desain bukan sekadar mempercantik, melainkan menyederhanakan cara pesan Anda diterima audiens ✨';

  const displayTags =
    hashtags.length > 0
      ? hashtags
      : ['#branding', '#designsystem', '#visualidentity', '#playdesign'];

  const nextSlide = () => {
    setCurrentSlide((prev) => (prev + 1) % displaySlides.length);
  };

  const prevSlide = () => {
    setCurrentSlide((prev) => (prev - 1 + displaySlides.length) % displaySlides.length);
  };

  // INSTAGRAM MOCKUP
  if (channel.toLowerCase() === 'instagram') {
    return (
      <div className="social-mockup mockup-instagram">
        {/* Header */}
        <div className="mockup-ig-head">
          <div className="mockup-ig-user">
            <div className="mockup-avatar ig-gradient">PD</div>
            <div>
              <div className="mockup-username">
                playdesign.studio <CheckCircle2 size={13} className="verified-badge" />
              </div>
              <span className="mockup-subtext">Bandung, Indonesia · Asli</span>
            </div>
          </div>
          <button type="button" className="mockup-more-btn" aria-label="Menu opsi">
            <MoreHorizontal size={16} />
          </button>
        </div>

        {/* Media / Carousel Canvas */}
        <div className="mockup-ig-canvas">
          <div className="canvas-badge">
            <Sparkles size={12} /> Playdesign Studio
          </div>
          <div className="canvas-content">
            <span className="canvas-kicker">SLIDE {currentSlide + 1} DARI {displaySlides.length}</span>
            <h3 className="canvas-title">{displaySlides[currentSlide]}</h3>
            <div className="canvas-brand-tag">@playdesign.studio</div>
          </div>

          {displaySlides.length > 1 && (
            <>
              <button
                type="button"
                className="canvas-nav-btn prev"
                onClick={prevSlide}
                aria-label="Slide sebelumnya"
              >
                <ChevronLeft size={16} />
              </button>
              <button
                type="button"
                className="canvas-nav-btn next"
                onClick={nextSlide}
                aria-label="Slide berikutnya"
              >
                <ChevronRight size={16} />
              </button>
              <div className="canvas-counter">
                {currentSlide + 1}/{displaySlides.length}
              </div>
            </>
          )}
        </div>

        {/* Action Bar */}
        <div className="mockup-ig-actions">
          <div className="ig-action-left">
            <button
              type="button"
              className={`mockup-act-btn ${liked ? 'is-active text-danger' : ''}`}
              onClick={() => setLiked(!liked)}
              aria-label="Suka"
            >
              <Heart size={20} fill={liked ? 'currentColor' : 'none'} />
            </button>
            <button type="button" className="mockup-act-btn" aria-label="Komentar">
              <MessageCircle size={20} />
            </button>
            <button type="button" className="mockup-act-btn" aria-label="Bagikan">
              <Send size={19} />
            </button>
          </div>

          {displaySlides.length > 1 && (
            <div className="canvas-dots">
              {displaySlides.map((_, idx) => (
                <span
                  key={idx}
                  className={`canvas-dot ${idx === currentSlide ? 'is-active' : ''}`}
                  onClick={() => setCurrentSlide(idx)}
                />
              ))}
            </div>
          )}

          <button
            type="button"
            className={`mockup-act-btn ${saved ? 'is-active' : ''}`}
            onClick={() => setSaved(!saved)}
            aria-label="Simpan"
          >
            <Bookmark size={20} fill={saved ? 'currentColor' : 'none'} />
          </button>
        </div>

        {/* Likes & Caption */}
        <div className="mockup-ig-body">
          <div className="mockup-ig-likes">
            Disukai oleh <strong>sagara.creative</strong> dan <strong>142 lainnya</strong>
          </div>
          <div className="mockup-ig-caption">
            <strong>playdesign.studio</strong> {displayCaption}
          </div>
          <div className="mockup-tags">
            {displayTags.map((tag) => (
              <span key={tag} className="tag-link">
                {tag}
              </span>
            ))}
          </div>
          <span className="mockup-timestamp">2 JAM YANG LALU · SIAP TERBIT OTOMATIS</span>
        </div>
      </div>
    );
  }

  // LINKEDIN MOCKUP
  if (channel.toLowerCase() === 'linkedin') {
    return (
      <div className="social-mockup mockup-linkedin">
        <div className="mockup-li-head">
          <div className="mockup-avatar li-avatar">PD</div>
          <div className="mockup-li-author">
            <div className="mockup-username">
              {author} <span className="li-degree">• Mengikuti</span>
            </div>
            <span className="mockup-subtext">Brand, Digital & Motion Studio · 3.420 pengikut</span>
            <span className="mockup-subtext li-time">
              2j • Diedit • <Globe size={11} className="inline-icon" />
            </span>
          </div>
        </div>

        <div className="mockup-li-text">
          <p>{displayCaption}</p>
          <div className="mockup-tags">
            {displayTags.map((tag) => (
              <span key={tag} className="tag-link">
                {tag}
              </span>
            ))}
          </div>
        </div>

        <div className="mockup-li-media">
          <div className="li-media-slide">
            <Badge tone="brand">Playdesign Insight</Badge>
            <h4>{displaySlides[currentSlide]}</h4>
            <span className="muted-small">Halaman {currentSlide + 1} dari {displaySlides.length}</span>
          </div>
          {displaySlides.length > 1 && (
            <div className="li-slide-controls">
              <button type="button" className="btn btn-xs btn-outline" onClick={prevSlide}>
                <ChevronLeft size={12} />
              </button>
              <span>{currentSlide + 1} / {displaySlides.length}</span>
              <button type="button" className="btn btn-xs btn-outline" onClick={nextSlide}>
                <ChevronRight size={12} />
              </button>
            </div>
          )}
        </div>

        <div className="mockup-li-stats">
          <div className="li-reactions">
            <span className="reaction-bubble icon-like">👍</span>
            <span className="reaction-bubble icon-insight">💡</span>
            <span className="reaction-bubble icon-love">❤️</span>
            <span className="reaction-count">84 orang</span>
          </div>
          <span className="muted-small">19 komentar • 7 repost</span>
        </div>

        <div className="mockup-li-actions">
          <button type="button" className="li-act-btn">
            <ThumbsUp size={15} /> Suka
          </button>
          <button type="button" className="li-act-btn">
            <MessageCircle size={15} /> Komentar
          </button>
          <button type="button" className="li-act-btn">
            <Repeat2 size={15} /> Repost
          </button>
          <button type="button" className="li-act-btn">
            <Send size={15} /> Kirim
          </button>
        </div>
      </div>
    );
  }

  // X (TWITTER) MOCKUP
  return (
    <div className="social-mockup mockup-x">
      <div className="mockup-x-head">
        <div className="mockup-avatar x-avatar">PD</div>
        <div className="mockup-x-meta">
          <div className="mockup-x-names">
            <strong>{author}</strong>
            <CheckCircle2 size={14} className="verified-badge-x" />
            <span className="mockup-x-handle">@playdesign</span>
            <span className="mockup-dot">•</span>
            <span className="mockup-x-time">2j</span>
          </div>
        </div>
      </div>

      <div className="mockup-x-body">
        <p className="mockup-x-text">{displayCaption}</p>
        <div className="mockup-tags">
          {displayTags.map((tag) => (
            <span key={tag} className="tag-link">
              {tag}
            </span>
          ))}
        </div>

        <div className="mockup-x-card">
          <div className="x-card-content">
            <span className="canvas-kicker">SERI KONTEN RESMI</span>
            <h4>{displaySlides[currentSlide]}</h4>
            <span className="x-card-url">playdesign.studio</span>
          </div>
        </div>
      </div>

      <div className="mockup-x-actions">
        <button type="button" className="x-act-btn">
          <MessageCircle size={15} /> <span>14</span>
        </button>
        <button type="button" className="x-act-btn">
          <Repeat2 size={15} /> <span>38</span>
        </button>
        <button type="button" className="x-act-btn">
          <Heart size={15} /> <span>156</span>
        </button>
        <button type="button" className="x-act-btn">
          <BarChart2 size={15} /> <span>2.4k</span>
        </button>
        <button type="button" className="x-act-btn">
          <Share2 size={15} />
        </button>
      </div>
    </div>
  );
}

