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
    style: Record<string, string>;
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
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  const source = fenced?.[1] ?? trimmed;

  try {
    return objectRecord(JSON.parse(source));
  } catch (error) {
    if (error instanceof Error && error.message === 'Respons AI harus berupa objek JSON.') throw error;
    throw new Error('Respons AI tidak mengandung JSON yang valid.');
  }
}

export function sanitizeSceneRevision(current: VideoScene, candidate: unknown): VideoScene {
  const input = objectRecord(candidate);
  const media = input.media && typeof input.media === 'object' && !Array.isArray(input.media)
    ? input.media as Record<string, unknown>
    : {};

  const allowed = {
    id: current.id,
    kind: input.kind,
    durationSec: input.durationSec,
    title: input.title,
    body: input.body,
    items: input.items,
    transitionIn: input.transitionIn,
    media: {
      refId: current.media?.refId,
      fit: media.fit,
      motion: media.motion,
    },
  };

  return normalizeScene(allowed, current);
}
