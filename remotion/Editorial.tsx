import React from 'react';
import {
  AbsoluteFill,
  Audio,
  Img,
  OffthreadVideo,
  Sequence,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import type { VideoScene, VideoSpec } from './spec-types';
import type { Caption, StoryProps } from './Story';

/**
 * Template "Editorial Tech" — hasil pembedahan video acuan 9:16 (720×1280, 20 s).
 *
 * Ciri yang direplikasi:
 * - latar navy→hitam bergradasi, starfield halus + grid tipis;
 * - chrome atas: logo mark kotak + wordmark, label kanan `BRAND / UPDATE`;
 * - badge pil bergaris dengan dot aksen;
 * - headline berat 2–3 baris, kata kunci berwarna aksen (bisa ditandai `*kata*`);
 * - tagline huruf kapital ber-jarak;
 * - kartu kaca bergaris tipis: label + chip status, baris bernomor 01/02, panel mock;
 * - subtitle putih tebal satu baris di bawah, tanpa kotak.
 *
 * Pemetaan field spec (tanpa mengubah skema):
 * - `title`  → headline
 * - `body`   → tagline (title) / paragraf (statement, list) / subheadline (cta)
 * - `items`  → title: item pertama = badge; statement/list: baris bernomor; cta: pil
 * - `media`  → panel "IMAGE STUDIO" berisi gambar/video referensi
 *
 * SALINAN GANDA: kanonik di playdesign/remotion/Editorial.tsx, dipakai render
 * dari remotion-starter/src/Editorial.tsx. Ubah keduanya. Acuan gaya:
 * docs/video-style-editorial.md
 */

const MULBERRY_SEED = 20261105;

/** PRNG deterministik supaya starfield sama di setiap frame (tidak berkedip acak). */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const PACING_SPRING: Record<string, { damping: number; stiffness: number; mass: number }> = {
  slow: { damping: 24, stiffness: 68, mass: 1.1 },
  medium: { damping: 18, stiffness: 108, mass: 0.85 },
  fast: { damping: 12, stiffness: 165, mass: 0.6 },
};

const assetSrc = (path: string) => (/^https?:|^data:/.test(path) ? path : staticFile(path));

/** Aksen sekunder tetap (dari acuan: cyan + violet) supaya palet tidak pecah. */
const ACCENT_2 = '#7CD4FD';
const ACCENT_3 = '#A78BFA';

type Tokens = {
  base: number;
  accent: string;
  ink: string;
  muted: string;
  hairline: string;
  cardBg: string;
};

const makeTokens = (spec: VideoSpec, width: number, height: number): Tokens => {
  const base = Math.min(width, height);
  return {
    base,
    accent: spec.style.accent,
    ink: spec.style.ink,
    muted: 'rgba(226,236,248,0.62)',
    hairline: 'rgba(226,236,248,0.14)',
    cardBg: 'rgba(255,255,255,0.045)',
  };
};

const Starfield: React.FC<{ base: number; accent: string }> = ({ base, accent }) => {
  const { width, height } = useVideoConfig();
  const frame = useCurrentFrame();
  const dots = React.useMemo(() => {
    const rand = mulberry32(MULBERRY_SEED);
    return Array.from({ length: 90 }, () => ({
      x: rand() * 100,
      y: rand() * 100,
      r: 0.6 + rand() * 1.9,
      o: 0.12 + rand() * 0.5,
      phase: rand() * Math.PI * 2,
      speed: 0.02 + rand() * 0.05,
    }));
  }, []);

  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      {dots.map((dot, index) => {
        const twinkle = 0.65 + 0.35 * Math.sin(frame * dot.speed + dot.phase);
        return (
          <div
            key={index}
            style={{
              position: 'absolute',
              left: `${dot.x}%`,
              top: `${dot.y}%`,
              width: dot.r * (base / 720),
              height: dot.r * (base / 720),
              borderRadius: 999,
              background: index % 9 === 0 ? accent : '#E7F0FF',
              opacity: dot.o * twinkle,
            }}
          />
        );
      })}
      {/* Glow lembut di dua sudut, meniru depth of field acuan. */}
      <div
        style={{
          position: 'absolute',
          width: width * 0.9,
          height: width * 0.9,
          left: -width * 0.35,
          top: -width * 0.25,
          borderRadius: '50%',
          background: `radial-gradient(circle, ${accent}22 0%, transparent 62%)`,
        }}
      />
      <div
        style={{
          position: 'absolute',
          width: width * 1.1,
          height: width * 1.1,
          right: -width * 0.45,
          bottom: -width * 0.3,
          borderRadius: '50%',
          background: `radial-gradient(circle, ${ACCENT_3}1F 0%, transparent 65%)`,
        }}
      />
    </AbsoluteFill>
  );
};

const GridBackdrop: React.FC<{ base: number; height: number }> = ({ base, height }) => (
  <AbsoluteFill
    style={{
      pointerEvents: 'none',
      backgroundImage: `linear-gradient(to right, rgba(226,236,248,0.05) 1px, transparent 1px),
        linear-gradient(to bottom, rgba(226,236,248,0.045) 1px, transparent 1px)`,
      backgroundSize: `${base * 0.125}px ${base * 0.125}px`,
      maskImage: `linear-gradient(to bottom, rgba(0,0,0,0.85), transparent ${Math.round(height * 0.82)}px)`,
      WebkitMaskImage: `linear-gradient(to bottom, rgba(0,0,0,0.85), transparent ${Math.round(height * 0.82)}px)`,
    }}
  />
);

const LogoMark: React.FC<{ size: number; accent: string; bg: string }> = ({ size, accent, bg }) => (
  <div
    style={{
      width: size,
      height: size,
      borderRadius: size * 0.28,
      background: accent,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      flex: 'none',
    }}
  >
    <div
      style={{
        width: size * 0.42,
        height: size * 0.42,
        borderRadius: size * 0.09,
        background: bg,
        boxShadow: `inset 0 0 0 ${Math.max(1, size * 0.05)}px ${accent}`,
      }}
    />
  </div>
);

const Chrome: React.FC<{ tokens: Tokens; brand: string; label: string; enter: number }> = ({
  tokens,
  brand,
  label,
  enter,
}) => {
  const { base } = tokens;
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        opacity: enter,
        transform: `translateY(${(1 - enter) * -base * 0.012}px)`,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: base * 0.018 }}>
        <LogoMark size={base * 0.042} accent={tokens.accent} bg="#05070f" />
        <div
          style={{
            fontSize: base * 0.032,
            fontWeight: 800,
            letterSpacing: '0.06em',
            color: tokens.ink,
          }}
        >
          {brand}
        </div>
      </div>
      <div
        style={{
          fontSize: base * 0.0155,
          fontWeight: 600,
          letterSpacing: '0.22em',
          textTransform: 'uppercase',
          color: tokens.muted,
        }}
      >
        {label}
      </div>
    </div>
  );
};

const Badge: React.FC<{ tokens: Tokens; text: string; enter: number; color?: string }> = ({
  tokens,
  text,
  enter,
  color,
}) => {
  const { base } = tokens;
  const tint = color ?? tokens.accent;
  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: base * 0.012,
        padding: `${base * 0.012}px ${base * 0.026}px`,
        borderRadius: 999,
        border: `1px solid ${tint}66`,
        background: `${tint}12`,
        opacity: enter,
        transform: `translateY(${(1 - enter) * base * 0.02}px)`,
        alignSelf: 'flex-start',
      }}
    >
      <div style={{ width: base * 0.009, height: base * 0.009, borderRadius: 999, background: tint }} />
      <div
        style={{
          fontSize: base * 0.0145,
          fontWeight: 700,
          letterSpacing: '0.18em',
          textTransform: 'uppercase',
          color: tint,
        }}
      >
        {text}
      </div>
    </div>
  );
};

/** `*kata*` ditandai sebagai aksen (boleh beberapa kata); tanpa penanda, kata terakhir. */
const Headline: React.FC<{ tokens: Tokens; text: string; enter: number; align?: 'left' | 'center'; size?: number }> = ({
  tokens,
  text,
  enter,
  align = 'left',
  size,
}) => {
  const { base } = tokens;
  const fontSize = size ?? base * 0.092;
  const hasMarkers = text.includes('*');
  const lines = text.split('\n');

  return (
    <div
      style={{
        fontSize,
        fontWeight: 800,
        lineHeight: 0.98,
        letterSpacing: '-0.03em',
        textAlign: align,
        color: tokens.ink,
        opacity: enter,
        transform: `translateY(${(1 - enter) * base * 0.028}px)`,
        maxWidth: '94%',
      }}
    >
      {lines.map((line, lineIndex) => {
        // Bagian ganjil dari split('*') adalah bagian yang ditandai aksen.
        const segments = line.split('*');
        const lastSegmentWords = segments[segments.length - 1].trim().split(/\s+/).filter(Boolean);
        return (
          <div key={lineIndex}>
            {segments.map((segment, segmentIndex) => {
              const words = segment.trim().split(/\s+/).filter(Boolean);
              if (!words.length) return null;
              return words.map((word, wordIndex) => {
                const marked = hasMarkers && segmentIndex % 2 === 1;
                const fallbackAccent =
                  !hasMarkers &&
                  segmentIndex === segments.length - 1 &&
                  wordIndex === lastSegmentWords.length - 1;
                return (
                  <span
                    key={`${segmentIndex}-${wordIndex}`}
                    style={{
                      color: marked || fallbackAccent ? tokens.accent : tokens.ink,
                      marginRight: base * 0.018,
                    }}
                  >
                    {word}
                  </span>
                );
              });
            })}
          </div>
        );
      })}
    </div>
  );
};

const Tagline: React.FC<{ tokens: Tokens; text: string; enter: number; align?: 'left' | 'center' }> = ({
  tokens,
  text,
  enter,
  align = 'left',
}) => {
  const { base } = tokens;
  return (
    <div
      style={{
        fontSize: base * 0.0175,
        fontWeight: 600,
        letterSpacing: '0.24em',
        textTransform: 'uppercase',
        color: tokens.muted,
        opacity: enter,
        textAlign: align,
        lineHeight: 1.5,
      }}
    >
      {text}
    </div>
  );
};

const GlassCard: React.FC<{
  tokens: Tokens;
  enter: number;
  label?: string;
  status?: string;
  children: React.ReactNode;
}> = ({ tokens, enter, label, status, children }) => {
  const { base } = tokens;
  return (
    <div
      style={{
        width: '100%',
        borderRadius: base * 0.036,
        padding: base * 0.032,
        background: tokens.cardBg,
        border: `1px solid ${tokens.hairline}`,
        boxShadow: `0 ${base * 0.03}px ${base * 0.07}px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.06)`,
        opacity: enter,
        transform: `translateY(${(1 - enter) * base * 0.045}px) scale(${0.985 + enter * 0.015})`,
        display: 'flex',
        flexDirection: 'column',
        gap: base * 0.022,
      }}
    >
      {label || status ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div
            style={{
              fontSize: base * 0.0145,
              fontWeight: 700,
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
              color: tokens.muted,
            }}
          >
            {label}
          </div>
          {status ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: base * 0.008 }}>
              <div style={{ width: base * 0.0075, height: base * 0.0075, borderRadius: 999, background: tokens.accent }} />
              <div
                style={{
                  fontSize: base * 0.0125,
                  fontWeight: 700,
                  letterSpacing: '0.16em',
                  textTransform: 'uppercase',
                  color: tokens.accent,
                }}
              >
                {status}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
      {children}
    </div>
  );
};

const NumberRow: React.FC<{
  tokens: Tokens;
  index: number;
  title: string;
  desc?: string;
  enter: number;
}> = ({ tokens, index, title, desc, enter }) => {
  const { base } = tokens;
  const tint = index % 2 === 0 ? tokens.accent : ACCENT_2;
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: base * 0.02,
        padding: base * 0.02,
        borderRadius: base * 0.022,
        background: 'rgba(255,255,255,0.03)',
        border: `1px solid ${tokens.hairline}`,
        opacity: enter,
        transform: `translateX(${(1 - enter) * base * 0.03}px)`,
      }}
    >
      <div
        style={{
          minWidth: base * 0.062,
          height: base * 0.042,
          borderRadius: base * 0.012,
          background: `${tint}1F`,
          border: `1px solid ${tint}55`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: base * 0.019,
          fontWeight: 800,
          color: tint,
          letterSpacing: '0.04em',
        }}
      >
        {String(index + 1).padStart(2, '0')}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: base * 0.006 }}>
        <div style={{ fontSize: base * 0.0235, fontWeight: 700, lineHeight: 1.2 }}>{title}</div>
        {desc ? (
          <div style={{ fontSize: base * 0.0175, color: tokens.muted, lineHeight: 1.35 }}>{desc}</div>
        ) : null}
      </div>
    </div>
  );
};

const Terminal: React.FC<{ tokens: Tokens; lines: string[]; enter: number }> = ({ tokens, lines, enter }) => {
  const { base } = tokens;
  const frame = useCurrentFrame();
  return (
    <div
      style={{
        borderRadius: base * 0.026,
        overflow: 'hidden',
        border: `1px solid ${tokens.hairline}`,
        background: 'rgba(3,7,16,0.86)',
        opacity: enter,
        transform: `translateY(${(1 - enter) * base * 0.03}px)`,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: base * 0.012,
          padding: `${base * 0.016}px ${base * 0.02}px`,
          borderBottom: `1px solid ${tokens.hairline}`,
          background: 'rgba(255,255,255,0.03)',
        }}
      >
        {['#FF5F57', '#FEBC2E', '#28C840'].map((color) => (
          <div key={color} style={{ width: base * 0.012, height: base * 0.012, borderRadius: 999, background: color }} />
        ))}
        <div
          style={{
            marginLeft: base * 0.01,
            fontSize: base * 0.014,
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
            color: tokens.muted,
            letterSpacing: '0.06em',
          }}
        >
          codex://ready
        </div>
      </div>
      <div
        style={{
          padding: base * 0.024,
          display: 'flex',
          flexDirection: 'column',
          gap: base * 0.012,
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
          fontSize: base * 0.0165,
          lineHeight: 1.5,
        }}
      >
        {lines.map((line, index) => {
          const appear = interpolate(frame - index * 5, [0, 6], [0, 1], {
            extrapolateLeft: 'clamp',
            extrapolateRight: 'clamp',
          });
          const isComment = line.trimStart().startsWith('//');
          return (
            <div key={index} style={{ opacity: appear, color: isComment ? 'rgba(226,236,248,0.45)' : tokens.ink }}>
              {line}
            </div>
          );
        })}
      </div>
    </div>
  );
};

const MediaPanel: React.FC<{ tokens: Tokens; spec: VideoSpec; scene: VideoScene; enter: number }> = ({
  tokens,
  spec,
  scene,
  enter,
}) => {
  const { base } = tokens;
  const ref = scene.media?.refId ? (spec.references ?? []).find((item) => item.id === scene.media?.refId) : undefined;
  const url = ref?.url ? assetSrc(ref.url) : undefined;
  const isVideo = ref?.kind === 'video';

  return (
    <GlassCard tokens={tokens} enter={enter} label="Image studio" status="Ready">
      <div
        style={{
          position: 'relative',
          width: '100%',
          height: base * 0.42,
          borderRadius: base * 0.022,
          overflow: 'hidden',
          background: `linear-gradient(135deg, ${ACCENT_3}33, ${ACCENT_2}22 55%, ${tokens.accent}1A)`,
        }}
      >
        {url && isVideo ? (
          <OffthreadVideo
            src={url}
            muted
            style={{ width: '100%', height: '100%', objectFit: scene.media?.fit ?? 'cover' }}
          />
        ) : null}
        {url && !isVideo ? (
          <Img src={url} style={{ width: '100%', height: '100%', objectFit: scene.media?.fit ?? 'cover' }} />
        ) : null}
        {!url ? (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <div
              style={{
                width: base * 0.26,
                height: base * 0.26,
                borderRadius: 999,
                border: `1px solid ${tokens.hairline}`,
              }}
            />
          </div>
        ) : null}
      </div>
      {scene.body ? (
        <div style={{ fontSize: base * 0.0175, color: tokens.muted, lineHeight: 1.35 }}>{scene.body}</div>
      ) : null}
    </GlassCard>
  );
};

const Pills: React.FC<{ tokens: Tokens; items: string[]; enter: number; accent: string }> = ({
  tokens,
  items,
  enter,
  accent,
}) => {
  const { base } = tokens;
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: base * 0.014, justifyContent: 'center', opacity: enter }}>
      {items.slice(0, 4).map((item, index) => {
        const tint = index % 2 === 0 ? accent : ACCENT_2;
        return (
          <div
            key={item}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: base * 0.01,
              padding: `${base * 0.011}px ${base * 0.024}px`,
              borderRadius: 999,
              border: `1px solid ${tint}55`,
              background: `${tint}10`,
              fontSize: base * 0.0145,
              fontWeight: 700,
              letterSpacing: '0.16em',
              textTransform: 'uppercase',
              color: tint,
            }}
          >
            <div style={{ width: base * 0.008, height: base * 0.008, borderRadius: 999, background: tint }} />
            {item}
          </div>
        );
      })}
    </div>
  );
};

const SceneFrame: React.FC<{
  scene: VideoScene;
  spec: VideoSpec;
  sceneFrames: number;
  index: number;
  totalScenes: number;
}> = ({ scene, spec, sceneFrames, index, totalScenes }) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const tokens = makeTokens(spec, width, height);
  const { base } = tokens;
  const springCfg = PACING_SPRING[spec.style.pacing] ?? PACING_SPRING.medium;
  const progress = Math.min(1, frame / Math.max(1, sceneFrames));
  const pad = Math.round(base * 0.062);

  const chromeIn = spring({ frame: frame - 1, fps, config: springCfg });
  const badgeIn = spring({ frame: frame - 4, fps, config: springCfg });
  const headIn = spring({ frame: frame - 7, fps, config: springCfg });
  const tagIn = spring({ frame: frame - 13, fps, config: springCfg });
  const cardIn = spring({ frame: frame - 17, fps, config: springCfg });

  const centered = scene.kind === 'cta' || scene.kind === 'quote';
  const eyebrow = scene.kind === 'title' ? scene.items?.[0] : scene.kind === 'statement' ? scene.items?.[0] : undefined;
  const cardItems =
    scene.kind === 'statement'
      ? (scene.items ?? []).slice(1)
      : scene.kind === 'list'
        ? (scene.items ?? [])
        : [];
  const headline = scene.title ?? '';
  const drift = interpolate(progress, [0, 1], [0, -base * 0.012], { extrapolateRight: 'clamp' });

  return (
    <AbsoluteFill
      style={{
        background: `linear-gradient(180deg, #0B1B31 0%, #071120 46%, #02050D 100%)`,
        color: tokens.ink,
        fontFamily: spec.style.fontFamily,
        overflow: 'hidden',
      }}
    >
      <Starfield base={base} accent={tokens.accent} />
      <GridBackdrop base={base} height={height} />

      <AbsoluteFill style={{ padding: pad, display: 'flex', flexDirection: 'column', transform: `translateY(${drift}px)` }}>
        <Chrome tokens={tokens} brand={spec.brand ?? 'Playdesign'} label="Update" enter={chromeIn} />

        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: centered ? 'center' : 'flex-start',
            gap: base * (centered ? 0.034 : 0.024),
            paddingBottom: base * 0.04,
          }}
        >
          {eyebrow ? <Badge tokens={tokens} text={eyebrow} enter={badgeIn} /> : null}

          {headline ? (
            <Headline tokens={tokens} text={headline} enter={headIn} align={centered ? 'center' : 'left'} />
          ) : null}

          {scene.body && scene.kind !== 'list' ? (
            <Tagline tokens={tokens} text={scene.body} enter={tagIn} align={centered ? 'center' : 'left'} />
          ) : null}

          {scene.kind === 'cta' && scene.items?.length ? (
            <Pills tokens={tokens} items={scene.items} enter={cardIn} accent={tokens.accent} />
          ) : null}

          {scene.kind === 'list' && cardItems.length ? (
            <div style={{ width: '100%', marginTop: base * 0.012 }}>
              <GlassCard tokens={tokens} enter={cardIn} label={scene.body || 'Sorotan'} status="Ready">
                {cardItems.slice(0, 3).map((item, index) => (
                  <NumberRow
                    key={item}
                    tokens={tokens}
                    index={index}
                    title={item}
                    enter={spring({ frame: frame - 16 - index * 4, fps, config: springCfg })}
                  />
                ))}
              </GlassCard>
            </div>
          ) : null}

          {scene.kind === 'statement' && (cardItems.length || scene.body) ? (
            <div style={{ width: '100%', marginTop: base * 0.012 }}>
              <GlassCard tokens={tokens} enter={cardIn} label="Alur kerja" status="Planned">
                {cardItems.slice(0, 3).map((item, index) => (
                  <NumberRow
                    key={item}
                    tokens={tokens}
                    index={index}
                    title={item}
                    enter={spring({ frame: frame - 16 - index * 4, fps, config: springCfg })}
                  />
                ))}
                {scene.body ? (
                  <Terminal
                    tokens={tokens}
                    lines={[`// ${scene.body}`, 'await codex.review()', '// rencana berjalan']}
                    enter={spring({ frame: frame - 30, fps, config: springCfg })}
                  />
                ) : null}
              </GlassCard>
            </div>
          ) : null}

          {scene.media ? <MediaPanel tokens={tokens} spec={spec} scene={scene} enter={cardIn} /> : null}
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: base * 0.0135,
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            color: 'rgba(226,236,248,0.38)',
            opacity: chromeIn,
          }}
        >
          <div>Official update · 4 Nov 2026</div>
          <div>
            {String(index + 1).padStart(2, '0')} / {String(totalScenes).padStart(2, '0')}
          </div>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

const Captions: React.FC<{ tokens: Tokens; captions: Caption[]; spec: VideoSpec }> = ({ tokens, captions, spec }) => {
  const frame = useCurrentFrame();
  const { fps, width } = useVideoConfig();
  const nowMs = (frame / fps) * 1000;
  const cue = captions.find((item) => nowMs >= item.startMs && nowMs < item.endMs);
  if (!cue) return null;
  const base = tokens.base;
  const fontSize = Math.round((base * spec.subtitle.fontSizePct) / 100);
  const justify =
    spec.subtitle.position === 'top' ? 'flex-start' : spec.subtitle.position === 'center' ? 'center' : 'flex-end';

  return (
    <AbsoluteFill
      style={{
        justifyContent: justify,
        alignItems: 'center',
        padding: `0 ${Math.round(width * 0.07)}px ${Math.round(base * 0.1)}px`,
      }}
    >
      <div
        style={{
          textAlign: 'center',
          fontFamily: spec.style.fontFamily,
          fontSize,
          fontWeight: 700,
          lineHeight: 1.24,
          letterSpacing: '-0.01em',
          color: '#FFFFFF',
          background: spec.subtitle.boxed ? 'rgba(3,7,16,0.62)' : 'transparent',
          padding: spec.subtitle.boxed ? `${Math.round(fontSize * 0.3)}px ${Math.round(fontSize * 0.5)}px` : 0,
          borderRadius: Math.round(fontSize * 0.34),
          textShadow: '0 2px 18px rgba(0,0,0,0.85)',
          maxWidth: '88%',
        }}
      >
        {cue.text}
      </div>
    </AbsoluteFill>
  );
};

const FadeOut: React.FC<{ seconds: number }> = ({ seconds }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const fadeFrames = Math.max(1, Math.round(seconds * fps));
  const opacity = interpolate(frame, [durationInFrames - fadeFrames, durationInFrames], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  if (opacity <= 0) return null;
  return <AbsoluteFill style={{ backgroundColor: '#02050D', opacity }} />;
};

export const Editorial: React.FC<StoryProps> = ({ spec, assets }) => {
  const { fps, durationInFrames, width, height } = useVideoConfig();
  const tokens = makeTokens(spec, width, height);
  let cursor = 0;
  const timeline = spec.scenes.map((scene) => {
    const frames = Math.max(1, Math.round(scene.durationSec * fps));
    const from = cursor;
    cursor += frames;
    return { scene, from, frames };
  });

  return (
    <AbsoluteFill style={{ backgroundColor: '#02050D' }}>
      {timeline.map((item, index) => (
        <Sequence key={item.scene.id} from={item.from} durationInFrames={item.frames} name={`Scene ${index + 1}`}>
          <SceneFrame
            scene={item.scene}
            spec={spec}
            sceneFrames={item.frames}
            index={index}
            totalScenes={timeline.length}
          />
        </Sequence>
      ))}

      {assets?.voiceover ? <Audio src={assetSrc(assets.voiceover)} volume={1} /> : null}

      {assets?.music ? (
        <Audio
          src={assetSrc(assets.music)}
          volume={(f) => {
            const base = spec.audio.music.volume / 100;
            const fadeFrames = Math.max(1, spec.audio.music.fadeOutSec * fps);
            const fade = interpolate(f - (durationInFrames - fadeFrames), [0, fadeFrames], [1, 0], {
              extrapolateLeft: 'clamp',
              extrapolateRight: 'clamp',
            });
            return base * fade;
          }}
        />
      ) : null}

      {(assets?.sfx ?? []).map((effect, index) => (
        <Sequence key={`sfx-${index}`} from={Math.round(effect.atSec * fps)} durationInFrames={Math.round(fps * 3)}>
          <Audio src={assetSrc(effect.src)} volume={effect.volume / 100} />
        </Sequence>
      ))}

      {spec.subtitle.enabled && assets?.captions?.length ? (
        <Captions tokens={tokens} captions={assets.captions} spec={spec} />
      ) : null}

      <FadeOut seconds={0.4} />
    </AbsoluteFill>
  );
};
