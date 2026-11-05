/**
 * VideoSpec v1 — satu sumber kebenaran untuk Web UI, pratinjau, dan renderer.
 *
 * Aturan:
 * - Semua nilai dinormalisasi di sini sebelum dikirim ke API, jadi runner tidak
 *   pernah menerima durasi/fps/dimensi yang aneh.
 * - Tidak ada byte media di sini; referensi hanya berupa id/URL.
 * - Komposisi Remotion `Story` membaca objek ini apa adanya.
 */

export type StylePreset = 'cinematic' | 'realistic' | 'anime' | 'documentary' | 'commercial' | 'custom';
export type SceneKind = 'title' | 'statement' | 'list' | 'quote' | 'cta' | 'image' | 'video';
export type TransitionKind = 'cut' | 'fade' | 'slide' | 'wipe';
export type CameraMove = 'static' | 'push-in' | 'pull-out' | 'pan-left' | 'pan-right' | 'handheld';
export type Lighting = 'soft' | 'hard' | 'backlit' | 'natural';
export type Grade = 'neutral' | 'warm' | 'cool' | 'mono';
export type Pacing = 'slow' | 'medium' | 'fast';
export type ReferenceRole = 'style' | 'motion' | 'subject' | 'music' | 'sfx';
export type SubtitleSource = 'tts' | 'script';

export interface VideoReference {
  id: string;
  kind: 'image' | 'video' | 'audio';
  name: string;
  role: ReferenceRole;
  /** 0..1, hanya dipakai provider yang mendukung. */
  strength?: number;
  url?: string;
  driveFileId?: string;
  note?: string;
}

export interface VideoScene {
  id: string;
  kind: SceneKind;
  durationSec: number;
  title?: string;
  body?: string;
  items?: string[];
  media?: {
    refId?: string;
    fit?: 'cover' | 'contain';
    motion?: 'none' | 'kenburns' | 'parallax';
  };
  transitionIn?: TransitionKind;
}

export interface VideoStyle {
  preset: StylePreset;
  bg: string;
  accent: string;
  ink: string;
  grade: Grade;
  camera: CameraMove;
  lighting: Lighting;
  transition: TransitionKind;
  pacing: Pacing;
  /** Skala tipografi 0.8..1.4 terhadap ukuran dasar komposisi. */
  typeScale: number;
  fontFamily: string;
}

export interface VideoAudio {
  voice: {
    enabled: boolean;
    provider: 'edge';
    voiceId: string;
    lang: string;
    /** -50..50 (%) */
    rate: number;
    /** -50..50 (%) */
    pitch: number;
  };
  script: string;
  music: {
    enabled: boolean;
    refId?: string;
    /** 0..100 */
    volume: number;
    fadeOutSec: number;
  };
  sfx: Array<{ refId: string; atSec: number; volume: number }>;
  ducking: boolean;
}

export interface VideoSubtitle {
  enabled: boolean;
  source: SubtitleSource;
  /** 0..100 */
  fontSizePct: number;
  position: 'bottom' | 'center' | 'top';
  boxed: boolean;
}

export interface VideoRender {
  aspect: '9:16' | '16:9' | '1:1';
  width: number;
  height: number;
  fps: number;
  durationSec: number;
  /** false = jangan unggah ke Drive, simpan di mesin runner. */
  upload: boolean;
  compositionId: string;
}

export interface VideoSpec {
  version: 1;
  prompt: string;
  negativePrompt: string;
  style: VideoStyle;
  scenes: VideoScene[];
  references: VideoReference[];
  audio: VideoAudio;
  subtitle: VideoSubtitle;
  render: VideoRender;
}

export const VOICES = [
  { id: 'id-ID-GadisNeural', label: 'Gadis — perempuan Indonesia', lang: 'id-ID' },
  { id: 'id-ID-ArdiNeural', label: 'Ardi — laki-laki Indonesia', lang: 'id-ID' },
  { id: 'en-US-AriaNeural', label: 'Aria — female English', lang: 'en-US' },
  { id: 'en-US-GuyNeural', label: 'Guy — male English', lang: 'en-US' },
] as const;

export const STYLE_PRESETS: Record<StylePreset, { label: string; hint: string; style: Omit<VideoStyle, 'preset'> }> = {
  cinematic: {
    label: 'Cinematic',
    hint: 'Kontras tinggi, gerak lambat, transisi halus',
    style: {
      bg: '#0b1020',
      accent: '#22d3ee',
      ink: '#f8fafc',
      grade: 'cool',
      camera: 'push-in',
      lighting: 'backlit',
      transition: 'fade',
      pacing: 'slow',
      typeScale: 1.06,
      fontFamily: 'Inter, system-ui, sans-serif',
    },
  },
  realistic: {
    label: 'Realistic',
    hint: 'Netral, bersih, tanpa gaya berlebih',
    style: {
      bg: '#f6f3ef',
      accent: '#b4532a',
      ink: '#1c1917',
      grade: 'neutral',
      camera: 'static',
      lighting: 'natural',
      transition: 'cut',
      pacing: 'medium',
      typeScale: 1,
      fontFamily: 'Inter, system-ui, sans-serif',
    },
  },
  anime: {
    label: 'Anime',
    hint: 'Warna jenuh, gerak cepat, garis tegas',
    style: {
      bg: '#1b1035',
      accent: '#f472b6',
      ink: '#fdf4ff',
      grade: 'warm',
      camera: 'pan-right',
      lighting: 'hard',
      transition: 'slide',
      pacing: 'fast',
      typeScale: 1.12,
      fontFamily: 'Inter, system-ui, sans-serif',
    },
  },
  documentary: {
    label: 'Documentary',
    hint: 'Tenang, teks besar, tempo bicara',
    style: {
      bg: '#141414',
      accent: '#eab308',
      ink: '#fafafa',
      grade: 'mono',
      camera: 'handheld',
      lighting: 'natural',
      transition: 'cut',
      pacing: 'slow',
      typeScale: 1.02,
      fontFamily: 'Inter, system-ui, sans-serif',
    },
  },
  commercial: {
    label: 'Commercial',
    hint: 'Cepat, CTA besar, warna berani',
    style: {
      bg: '#111827',
      accent: '#f97316',
      ink: '#ffffff',
      grade: 'warm',
      camera: 'push-in',
      lighting: 'hard',
      transition: 'wipe',
      pacing: 'fast',
      typeScale: 1.1,
      fontFamily: 'Inter, system-ui, sans-serif',
    },
  },
  custom: {
    label: 'Custom',
    hint: 'Atur sendiri semua kontrol',
    style: {
      bg: '#0b1020',
      accent: '#22d3ee',
      ink: '#f8fafc',
      grade: 'neutral',
      camera: 'static',
      lighting: 'soft',
      transition: 'fade',
      pacing: 'medium',
      typeScale: 1,
      fontFamily: 'Inter, system-ui, sans-serif',
    },
  },
};

export const ASPECTS: Record<VideoRender['aspect'], { width: number; height: number; label: string }> = {
  '9:16': { width: 1080, height: 1920, label: 'Vertikal 9:16' },
  '16:9': { width: 1920, height: 1080, label: 'Lanskap 16:9' },
  '1:1': { width: 1080, height: 1080, label: 'Persegi 1:1' },
};

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);
const num = (raw: unknown, fallback: number) => {
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
};
const str = (raw: unknown, fallback = '') => (typeof raw === 'string' ? raw : fallback);
const bool = (raw: unknown, fallback: boolean) => (typeof raw === 'boolean' ? raw : fallback);

const pick = <T extends string>(raw: unknown, allowed: readonly T[], fallback: T): T =>
  allowed.includes(raw as T) ? (raw as T) : fallback;

const SCENE_KINDS = ['title', 'statement', 'list', 'quote', 'cta', 'image', 'video'] as const;
const TRANSITIONS = ['cut', 'fade', 'slide', 'wipe'] as const;
const PRESETS = ['cinematic', 'realistic', 'anime', 'documentary', 'commercial', 'custom'] as const;
const CAMERAS = ['static', 'push-in', 'pull-out', 'pan-left', 'pan-right', 'handheld'] as const;
const LIGHTING = ['soft', 'hard', 'backlit', 'natural'] as const;
const GRADES = ['neutral', 'warm', 'cool', 'mono'] as const;
const PACING = ['slow', 'medium', 'fast'] as const;
const ROLES = ['style', 'motion', 'subject', 'music', 'sfx'] as const;

export const SCENE_LIMIT = 24;

export function newSceneId(): string {
  return `sc-${Math.random().toString(36).slice(2, 8)}`;
}

export function defaultScene(partial: Partial<VideoScene> = {}): VideoScene {
  return {
    id: partial.id ?? newSceneId(),
    kind: partial.kind ?? 'statement',
    durationSec: clamp(num(partial.durationSec, 4), 0.5, 30),
    title: partial.title ?? '',
    body: partial.body ?? '',
    items: partial.items ?? [],
    media: partial.media,
    transitionIn: partial.transitionIn ?? 'fade',
  };
}

export function defaultSpec(partial: Partial<VideoSpec> = {}): VideoSpec {
  const preset = partial.style?.preset ?? 'cinematic';
  const base = STYLE_PRESETS[preset].style;
  const aspect = partial.render?.aspect ?? '9:16';
  const dims = ASPECTS[aspect];
  const scenes = (partial.scenes ?? []).map((scene) => defaultScene(scene));

  return {
    version: 1,
    prompt: partial.prompt ?? '',
    negativePrompt: partial.negativePrompt ?? '',
    style: { ...base, ...partial.style, preset },
    scenes: scenes.length ? scenes : [defaultScene({ kind: 'title', durationSec: 4 }), defaultScene({ kind: 'cta', durationSec: 4 })],
    references: partial.references ?? [],
    audio: {
      voice: {
        enabled: partial.audio?.voice?.enabled ?? true,
        provider: 'edge',
        voiceId: partial.audio?.voice?.voiceId ?? 'id-ID-GadisNeural',
        lang: partial.audio?.voice?.lang ?? 'id-ID',
        rate: clamp(num(partial.audio?.voice?.rate, 0), -50, 50),
        pitch: clamp(num(partial.audio?.voice?.pitch, 0), -50, 50),
      },
      script: partial.audio?.script ?? '',
      music: {
        enabled: partial.audio?.music?.enabled ?? false,
        refId: partial.audio?.music?.refId,
        volume: clamp(num(partial.audio?.music?.volume, 22), 0, 100),
        fadeOutSec: clamp(num(partial.audio?.music?.fadeOutSec, 1.5), 0, 10),
      },
      sfx: partial.audio?.sfx ?? [],
      ducking: partial.audio?.ducking ?? true,
    },
    subtitle: {
      enabled: partial.subtitle?.enabled ?? true,
      source: partial.subtitle?.source ?? 'tts',
      fontSizePct: clamp(num(partial.subtitle?.fontSizePct, 4.2), 2, 9),
      position: partial.subtitle?.position ?? 'bottom',
      boxed: partial.subtitle?.boxed ?? true,
    },
    render: {
      aspect,
      width: clamp(num(partial.render?.width, dims.width), 320, 2160),
      height: clamp(num(partial.render?.height, dims.height), 320, 2160),
      fps: Math.round(clamp(num(partial.render?.fps, 30), 24, 60)),
      durationSec: clamp(num(partial.render?.durationSec, 0), 3, 120),
      upload: partial.render?.upload ?? true,
      compositionId: partial.render?.compositionId ?? 'Story',
    },
  };
}

/** Normalisasi apa pun (dari API, localStorage, atau Telegram) jadi spec valid. */
export function normalizeSpec(raw: unknown, fallbackAspect: VideoRender['aspect'] = '9:16'): VideoSpec {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return defaultSpec({ render: { aspect: fallbackAspect } as VideoRender });
  const input = raw as Record<string, unknown>;
  const styleRaw = (input.style ?? {}) as Record<string, unknown>;
  const renderRaw = (input.render ?? {}) as Record<string, unknown>;
  const audioRaw = (input.audio ?? {}) as Record<string, unknown>;
  const voiceRaw = (audioRaw.voice ?? {}) as Record<string, unknown>;
  const musicRaw = (audioRaw.music ?? {}) as Record<string, unknown>;
  const subtitleRaw = (input.subtitle ?? {}) as Record<string, unknown>;

  const aspect = pick(renderRaw.aspect ?? fallbackAspect, ['9:16', '16:9', '1:1'] as const, fallbackAspect);
  const dims = ASPECTS[aspect];
  const preset = pick(styleRaw.preset, PRESETS, 'cinematic');
  const presetStyle = STYLE_PRESETS[preset].style;

  const scenes = (Array.isArray(input.scenes) ? input.scenes : [])
    .filter((scene): scene is Record<string, unknown> => !!scene && typeof scene === 'object' && !Array.isArray(scene))
    .slice(0, SCENE_LIMIT)
    .map((scene) =>
      defaultScene({
        id: str(scene.id) || newSceneId(),
        kind: pick(scene.kind, SCENE_KINDS, 'statement'),
        durationSec: clamp(num(scene.durationSec, 4), 0.5, 30),
        title: str(scene.title),
        body: str(scene.body),
        items: Array.isArray(scene.items) ? scene.items.map((item) => String(item)).slice(0, 8) : [],
        media: scene.media && typeof scene.media === 'object' ? (scene.media as VideoScene['media']) : undefined,
        transitionIn: pick(scene.transitionIn, TRANSITIONS, presetStyle.transition),
      }),
    );

  const references = (Array.isArray(input.references) ? input.references : [])
    .filter((ref): ref is Record<string, unknown> => !!ref && typeof ref === 'object')
    .slice(0, 8)
    .map((ref) => ({
      id: str(ref.id) || `ref-${Math.random().toString(36).slice(2, 8)}`,
      kind: pick(ref.kind, ['image', 'video', 'audio'] as const, 'image'),
      name: str(ref.name, 'referensi'),
      role: pick(ref.role, ROLES, 'style'),
      strength: ref.strength === undefined ? undefined : clamp(num(ref.strength, 0.6), 0, 1),
      url: str(ref.url) || undefined,
      driveFileId: str(ref.driveFileId) || undefined,
      note: str(ref.note) || undefined,
    }));

  const durationSec = clamp(
    scenes.reduce((sum, scene) => sum + scene.durationSec, 0) || num(renderRaw.durationSec, 15),
    3,
    120,
  );

  return {
    version: 1,
    prompt: str(input.prompt).slice(0, 2000),
    negativePrompt: str(input.negativePrompt).slice(0, 800),
    style: {
      preset,
      bg: str(styleRaw.bg, presetStyle.bg),
      accent: str(styleRaw.accent, presetStyle.accent),
      ink: str(styleRaw.ink, presetStyle.ink),
      grade: pick(styleRaw.grade, GRADES, presetStyle.grade),
      camera: pick(styleRaw.camera, CAMERAS, presetStyle.camera),
      lighting: pick(styleRaw.lighting, LIGHTING, presetStyle.lighting),
      transition: pick(styleRaw.transition, TRANSITIONS, presetStyle.transition),
      pacing: pick(styleRaw.pacing, PACING, presetStyle.pacing),
      typeScale: clamp(num(styleRaw.typeScale, presetStyle.typeScale), 0.8, 1.4),
      fontFamily: str(styleRaw.fontFamily, presetStyle.fontFamily),
    },
    scenes,
    references,
    audio: {
      voice: {
        enabled: bool(voiceRaw.enabled, true),
        provider: 'edge',
        voiceId: str(voiceRaw.voiceId, 'id-ID-GadisNeural'),
        lang: str(voiceRaw.lang, 'id-ID'),
        rate: clamp(num(voiceRaw.rate, 0), -50, 50),
        pitch: clamp(num(voiceRaw.pitch, 0), -50, 50),
      },
      script: str(audioRaw.script).slice(0, 4000),
      music: {
        enabled: bool(musicRaw.enabled, false),
        refId: str(musicRaw.refId) || undefined,
        volume: clamp(num(musicRaw.volume, 22), 0, 100),
        fadeOutSec: clamp(num(musicRaw.fadeOutSec, 1.5), 0, 10),
      },
      sfx: (Array.isArray(audioRaw.sfx) ? audioRaw.sfx : [])
        .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object')
        .slice(0, 12)
        .map((item) => ({
          refId: str(item.refId),
          atSec: clamp(num(item.atSec, 0), 0, 120),
          volume: clamp(num(item.volume, 60), 0, 100),
        })),
      ducking: bool(audioRaw.ducking, true),
    },
    subtitle: {
      enabled: bool(subtitleRaw.enabled, true),
      source: pick(subtitleRaw.source, ['tts', 'script'] as const, 'tts'),
      fontSizePct: clamp(num(subtitleRaw.fontSizePct, 4.2), 2, 9),
      position: pick(subtitleRaw.position, ['bottom', 'center', 'top'] as const, 'bottom'),
      boxed: bool(subtitleRaw.boxed, true),
    },
    render: {
      aspect,
      width: Math.round(clamp(num(renderRaw.width, dims.width), 320, 2160)),
      height: Math.round(clamp(num(renderRaw.height, dims.height), 320, 2160)),
      fps: Math.round(clamp(num(renderRaw.fps, 30), 24, 60)),
      durationSec,
      upload: bool(renderRaw.upload, true),
      compositionId: str(renderRaw.compositionId, 'Story'),
    },
  };
}

/** Teks narasi: pakai script kalau ada, kalau tidak gabung isi scene. */
export function narrationText(spec: VideoSpec): string {
  const script = spec.audio.script.trim();
  if (script) return script;
  return spec.scenes
    .map((scene) => [scene.title, scene.body, ...(scene.items ?? [])].filter(Boolean).join('. '))
    .filter(Boolean)
    .join(' ');
}

/** Ringkasan satu paragraf — dipakai untuk judul otomatis dan instruksi Telegram. */
export function specSummary(spec: VideoSpec): string {
  const scenes = spec.scenes.map((scene, index) => `${index + 1}. [${scene.kind}] ${scene.title || scene.body || 'tanpa teks'}`);
  return [
    `Prompt: ${spec.prompt || '(kosong)'}`,
    `Gaya: ${spec.style.preset}, ${spec.style.camera}, ${spec.style.transition}, tempo ${spec.style.pacing}`,
    `Durasi: ${spec.render.durationSec} detik, ${spec.render.width}x${spec.render.height} @ ${spec.render.fps}fps`,
    `Suara: ${spec.audio.voice.enabled ? `${spec.audio.voice.voiceId}` : 'nonaktif'}`,
    `Subtitle: ${spec.subtitle.enabled ? spec.subtitle.source : 'nonaktif'}`,
    `Unggah Drive: ${spec.render.upload ? 'ya' : 'tidak (simpan lokal)'}`,
    'Scene:',
    ...scenes,
  ].join('\n');
}
