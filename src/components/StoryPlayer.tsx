import { useEffect, useMemo, useRef, useState } from 'react';
import { Story, type StoryCaption } from '@story';
import { Player, type PlayerRef } from '@remotion/player';
import type { VideoSpec } from '../lib/video-spec';

/**
 * Cue perkiraan untuk pratinjau: dibagi proporsional terhadap panjang teks tiap
 * scene. Renderer memakai cue TTS yang sebenarnya; ini hanya untuk melihat
 * ritme sebelum render.
 */
function previewCaptions(spec: VideoSpec): StoryCaption[] {
  const cues: StoryCaption[] = [];
  let cursor = 0;
  for (const scene of spec.scenes) {
    const text = [scene.title, scene.body, ...(scene.items ?? [])].filter(Boolean).join(' · ');
    if (text) {
      const start = cursor * 1000 + 120;
      const end = (cursor + scene.durationSec) * 1000 - 120;
      cues.push({ startMs: Math.max(start, cursor * 1000), endMs: Math.max(end, start + 400), text });
    }
    cursor += scene.durationSec;
  }
  return cues;
}

export function StoryPlayer({ spec, className }: { spec: VideoSpec; className?: string }) {
  const playerRef = useRef<PlayerRef>(null);
  const [playing, setPlaying] = useState(false);

  const durationInFrames = useMemo(() => {
    const seconds = spec.scenes.reduce((sum, scene) => sum + scene.durationSec, 0) || spec.render.durationSec;
    return Math.max(1, Math.round(seconds * spec.render.fps));
  }, [spec]);

  const inputProps = useMemo(
    () => ({
      spec,
      assets: spec.subtitle.enabled ? { captions: previewCaptions(spec) } : undefined,
    }),
    [spec],
  );

  useEffect(() => {
    const player = playerRef.current;
    if (!player) return;
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    player.addEventListener('play', onPlay);
    player.addEventListener('pause', onPause);
    return () => {
      player.removeEventListener('play', onPlay);
      player.removeEventListener('pause', onPause);
    };
  }, []);

  // Lebar mengikuti rasio komposisi, dibatasi 60vh supaya tetap muat di layar pendek.
  const widthCap = ((60 * spec.render.width) / spec.render.height).toFixed(2);

  return (
    <div
      className={className}
      style={{ width: `min(100%, ${widthCap}vh)`, aspectRatio: `${spec.render.width} / ${spec.render.height}` }}
    >
      <Player
        ref={playerRef}
        component={Story}
        inputProps={inputProps}
        durationInFrames={durationInFrames}
        fps={spec.render.fps}
        compositionWidth={spec.render.width}
        compositionHeight={spec.render.height}
        style={{ width: '100%', height: '100%' }}
        controls={false}
        loop
        doubleClickToFullscreen
      />
      <div className="story-player-bar">
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={() => (playing ? playerRef.current?.pause() : playerRef.current?.play())}
        >
          {playing ? 'Jeda' : 'Putar pratinjau'}
        </button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => playerRef.current?.seekTo(0)}>
          Ulang
        </button>
        <span className="story-player-meta">
          {spec.render.width}×{spec.render.height} · {spec.render.fps} fps ·{' '}
          {spec.scenes.reduce((sum, scene) => sum + scene.durationSec, 0).toFixed(1)} dtk
        </span>
      </div>
    </div>
  );
}
