import type { CSSProperties, ReactNode } from 'react';
import {
  AbsoluteFill,
  Audio,
  Img,
  Sequence,
  Video,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import type { VideoReference, VideoScene, VideoSpec } from '../lib/video-spec';

export type StoryCaption = { startMs: number; endMs: number; text: string };

export interface StoryProps {
  spec: VideoSpec;
  assets?: {
    voiceover?: string;
    music?: string;
    sfx?: Array<{ src: string; atSec: number; volume: number }>;
    captions?: StoryCaption[];
  };
}

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

function sceneContent(scene: VideoScene, accent: string): ReactNode {
  if (scene.kind === 'list') {
    return (
      <>
        {scene.title && <h1 style={{ margin: 0 }}>{scene.title}</h1>}
        <div style={{ display: 'grid', gap: '0.5em', marginTop: '0.8em' }}>
          {(scene.items ?? []).map((item, index) => (
            <div key={`${scene.id}-${index}`} style={{ display: 'flex', alignItems: 'flex-start', gap: '0.55em' }}>
              <span style={{ color: accent, fontWeight: 900 }}>{String(index + 1).padStart(2, '0')}</span>
              <span>{item}</span>
            </div>
          ))}
        </div>
      </>
    );
  }

  if (scene.kind === 'quote') {
    return (
      <>
        <span style={{ color: accent, fontSize: '2.4em', lineHeight: 0.5 }}>“</span>
        <h1 style={{ margin: '0.3em 0 0' }}>{scene.title || scene.body}</h1>
        {scene.title && scene.body && <p style={{ margin: '0.9em 0 0', opacity: 0.78 }}>{scene.body}</p>}
      </>
    );
  }

  return (
    <>
      {scene.title && <h1 style={{ margin: 0 }}>{scene.title}</h1>}
      {scene.body && <p style={{ margin: scene.title ? '0.65em 0 0' : 0, opacity: 0.84 }}>{scene.body}</p>}
      {scene.kind === 'cta' && (
        <span
          style={{
            alignSelf: 'flex-start',
            background: accent,
            borderRadius: '999px',
            color: '#05070d',
            display: 'inline-flex',
            fontSize: '0.48em',
            fontWeight: 900,
            letterSpacing: '0.08em',
            marginTop: '1.4em',
            padding: '0.75em 1.25em',
            textTransform: 'uppercase',
          }}
        >
          Mulai sekarang
        </span>
      )}
    </>
  );
}

function mediaLayer(scene: VideoScene, reference: VideoReference | undefined, style: CSSProperties) {
  if (!reference?.url || !scene.media) return null;
  const mediaStyle: CSSProperties = {
    ...style,
    height: '100%',
    objectFit: scene.media.fit ?? 'cover',
    width: '100%',
  };

  return reference.kind === 'video' ? (
    <Video src={reference.url} muted style={mediaStyle} />
  ) : (
    <Img src={reference.url} style={mediaStyle} />
  );
}

export function Story({ spec, assets }: StoryProps) {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const sceneFrames = spec.scenes.map((scene) => Math.max(1, Math.round(scene.durationSec * fps)));
  const totalFrames = sceneFrames.reduce((sum, duration) => sum + duration, 0);
  const boundedFrame = clamp(frame, 0, Math.max(totalFrames - 1, 0));

  let sceneIndex = 0;
  let sceneStart = 0;
  for (let index = 0; index < sceneFrames.length; index += 1) {
    if (boundedFrame < sceneStart + sceneFrames[index]) {
      sceneIndex = index;
      break;
    }
    sceneStart += sceneFrames[index];
  }

  const scene = spec.scenes[sceneIndex] ?? spec.scenes[0];
  if (!scene) return <AbsoluteFill style={{ backgroundColor: spec.style.bg }} />;

  const localFrame = boundedFrame - sceneStart;
  const duration = sceneFrames[sceneIndex] ?? 1;
  const transitionFrames = Math.max(1, Math.min(Math.round(fps * 0.45), Math.floor(duration / 3)));
  const enter = interpolate(localFrame, [0, transitionFrames], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const exit = interpolate(localFrame, [duration - transitionFrames, duration - 1], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const opacity = scene.transitionIn === 'cut' ? 1 : Math.min(enter, exit);
  const slide = (1 - enter) * (scene.transitionIn === 'wipe' ? 14 : 7);
  const scale = spec.style.camera === 'push-in'
    ? interpolate(localFrame, [0, duration], [1, 1.06])
    : spec.style.camera === 'pull-out'
      ? interpolate(localFrame, [0, duration], [1.06, 1])
      : 1;
  const pan = spec.style.camera === 'pan-left'
    ? interpolate(localFrame, [0, duration], [2, -2])
    : spec.style.camera === 'pan-right'
      ? interpolate(localFrame, [0, duration], [-2, 2])
      : 0;
  const reference = spec.references.find((item) => item.id === scene.media?.refId);
  const elapsedMs = (boundedFrame / fps) * 1000;
  const caption = assets?.captions?.find((item) => elapsedMs >= item.startMs && elapsedMs <= item.endMs);
  const baseSize = Math.min(width, height) * 0.062 * spec.style.typeScale;
  const gradeFilter = spec.style.grade === 'mono'
    ? 'grayscale(1) contrast(1.08)'
    : spec.style.grade === 'warm'
      ? 'sepia(0.18) saturate(1.14)'
      : spec.style.grade === 'cool'
        ? 'hue-rotate(8deg) saturate(1.08)'
        : undefined;

  return (
    <AbsoluteFill
      style={{
        backgroundColor: spec.style.bg,
        color: spec.style.ink,
        fontFamily: spec.style.fontFamily,
        overflow: 'hidden',
      }}
    >
      <AbsoluteFill
        style={{
          background: `radial-gradient(circle at 82% 14%, ${spec.style.accent}55 0%, transparent 38%), linear-gradient(145deg, ${spec.style.bg}, #05070d)`,
          filter: gradeFilter,
          opacity,
          transform: `translateX(${pan}%) scale(${scale})`,
        }}
      >
        {mediaLayer(scene, reference, { filter: gradeFilter, opacity: 0.58 })}
      </AbsoluteFill>

      <AbsoluteFill
        style={{
          background: 'linear-gradient(180deg, rgba(0,0,0,0.04), rgba(0,0,0,0.58))',
          padding: `${height * 0.09}px ${width * 0.075}px`,
        }}
      >
        <div
          style={{
            alignItems: scene.kind === 'title' || scene.kind === 'cta' ? 'center' : 'flex-start',
            display: 'flex',
            flex: 1,
            flexDirection: 'column',
            fontSize: baseSize,
            justifyContent: 'center',
            lineHeight: 1.08,
            opacity,
            textAlign: scene.kind === 'title' || scene.kind === 'cta' ? 'center' : 'left',
            textShadow: '0 0.08em 0.35em rgba(0,0,0,0.35)',
            transform: `translateY(${slide}%)`,
          }}
        >
          {sceneContent(scene, spec.style.accent)}
        </div>

        {spec.subtitle.enabled && caption && (
          <div
            style={{
              alignSelf: 'center',
              background: spec.subtitle.boxed ? 'rgba(3, 5, 10, 0.78)' : undefined,
              borderRadius: spec.subtitle.boxed ? '0.5em' : undefined,
              color: spec.style.ink,
              fontSize: Math.max(18, Math.min(width, height) * (spec.subtitle.fontSizePct / 100)),
              fontWeight: 700,
              left: '8%',
              lineHeight: 1.25,
              padding: spec.subtitle.boxed ? '0.45em 0.7em' : undefined,
              position: 'absolute',
              right: '8%',
              textAlign: 'center',
              textShadow: spec.subtitle.boxed ? undefined : '0 0.08em 0.28em #000',
              ...(spec.subtitle.position === 'top'
                ? { top: '8%' }
                : spec.subtitle.position === 'center'
                  ? { top: '48%', transform: 'translateY(-50%)' }
                  : { bottom: '7%' }),
            }}
          >
            {caption.text}
          </div>
        )}
      </AbsoluteFill>

      {assets?.voiceover && <Audio src={assets.voiceover} />}
      {assets?.music && <Audio src={assets.music} volume={spec.audio.music.volume / 100} />}
      {assets?.sfx?.map((item, index) => (
        <Sequence key={`${item.src}-${index}`} from={Math.max(0, Math.round(item.atSec * fps))}>
          <Audio src={item.src} volume={item.volume / 100} />
        </Sequence>
      ))}
    </AbsoluteFill>
  );
}
