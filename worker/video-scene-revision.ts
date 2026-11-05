import {
  normalizeScene,
  type VideoScene,
} from '../src/lib/video-spec';

export interface SceneRevisionInput {
  workspace: string;
  instruction: string;
  scene: VideoScene;
  context: {
    prompt: string;
    style: Record<string, unknown>;
    sceneIndex: number;
    sceneCount: number;
  };
}

function objectRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Respons AI harus berupa objek JSON.');
  }
  return value as Record<string, unknown>;
}

const boundedInt = (value: unknown, min: number, max: number, fallback: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(Math.max(Math.round(parsed), min), max) : fallback;
};

export function validateSceneRevisionInput(raw: unknown): SceneRevisionInput {
  const input = objectRecord(raw);
  const instruction = typeof input.instruction === 'string' ? input.instruction.trim() : '';
  if (instruction.length < 3 || instruction.length > 600) {
    throw new Error('instruction wajib 3–600 karakter.');
  }

  const workspace = typeof input.workspace === 'string' && input.workspace.trim()
    ? input.workspace.trim()
    : 'playdesign';
  if (!/^[a-zA-Z0-9_-]{1,80}$/.test(workspace)) throw new Error('workspace tidak valid.');

  const sceneRaw = objectRecord(input.scene);
  if (typeof sceneRaw.id !== 'string' || !sceneRaw.id.trim()) throw new Error('scene.id wajib diisi.');
  const scene = normalizeScene(sceneRaw, {
    id: sceneRaw.id.trim().slice(0, 80),
    kind: 'statement',
    durationSec: 4,
    title: '',
    body: '',
    items: [],
    transitionIn: 'fade',
  });

  const contextRaw = input.context && typeof input.context === 'object' && !Array.isArray(input.context)
    ? input.context as Record<string, unknown>
    : {};
  const styleRaw = contextRaw.style && typeof contextRaw.style === 'object' && !Array.isArray(contextRaw.style)
    ? contextRaw.style as Record<string, unknown>
    : {};
  const preset = typeof styleRaw.preset === 'string' ? styleRaw.preset.slice(0, 40) : '';

  return {
    workspace,
    instruction,
    scene,
    context: {
      prompt: typeof contextRaw.prompt === 'string' ? contextRaw.prompt.slice(0, 1000) : '',
      style: preset ? { preset } : {},
      sceneIndex: boundedInt(contextRaw.sceneIndex, 0, 23, 0),
      sceneCount: boundedInt(contextRaw.sceneCount, 1, 24, 1),
    },
  };
}

export function extractSceneRevision(response: unknown): unknown {
  if (response && typeof response === 'object' && !Array.isArray(response)) {
    return objectRecord(response);
  }
  if (typeof response !== 'string') throw new Error('Respons AI tidak mengandung JSON yang valid.');

  const trimmed = response.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidates = [trimmed, fenced?.[1]?.trim(), firstBalancedObject(trimmed)]
    .filter((value): value is string => typeof value === 'string' && value.length > 0);

  for (const source of candidates) {
    try {
      return objectRecord(JSON.parse(source));
    } catch {
      continue;
    }
  }
  throw new Error('Respons AI tidak mengandung JSON yang valid.');
}

/** Ambil objek JSON pertama yang kurawalnya seimbang, mengabaikan kurawal di dalam string. */
function firstBalancedObject(text: string): string | null {
  const start = text.indexOf('{');
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < text.length; index += 1) {
    const char = text[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') inString = true;
    else if (char === '{') depth += 1;
    else if (char === '}') {
      depth -= 1;
      if (depth === 0) return text.slice(start, index + 1);
    }
  }
  return null;
}

export function sanitizeSceneRevision(current: VideoScene, candidate: unknown): VideoScene {
  const input = objectRecord(candidate);
  const media = input.media && typeof input.media === 'object' && !Array.isArray(input.media)
    ? input.media as Record<string, unknown>
    : {};

  const allowed: Record<string, unknown> = {
    id: current.id,
    kind: input.kind,
    durationSec: input.durationSec,
    title: input.title,
    body: input.body,
    items: input.items,
    transitionIn: input.transitionIn,
  };
  if (current.media) {
    allowed.media = {
      refId: current.media.refId,
      fit: media.fit,
      motion: media.motion,
    };
  }

  // Tanpa klip yang benar-benar ada, scene tidak boleh berlabel image/video:
  // itu akan menampilkan media yang tidak pernah dirender.
  const mediaKinds = new Set(["image", "video"]);
  if (!current.media?.refId && typeof input.kind === "string" && mediaKinds.has(input.kind)) {
    allowed.kind = current.kind;
  }

  return normalizeScene(allowed, current);
}

/**
 * True bila hasil revisi berbeda dari scene lama pada field yang boleh diubah.
 * Dipakai untuk menolak "sukses palsu" ketika model mengembalikan scene yang sama.
 */
export function sceneRevisionChanged(before: VideoScene, after: VideoScene): boolean {
  const fingerprint = (scene: VideoScene) =>
    JSON.stringify({
      kind: scene.kind,
      durationSec: scene.durationSec,
      title: scene.title,
      body: scene.body,
      items: scene.items ?? [],
      transitionIn: scene.transitionIn,
      fit: scene.media?.fit ?? 'cover',
      motion: scene.media?.motion ?? 'none',
    });
  return fingerprint(before) !== fingerprint(after);
}
