import {
  normalizeScene,
  type VideoScene,
} from '../src/lib/video-spec';

function objectRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Respons AI harus berupa objek JSON.');
  }
  return value as Record<string, unknown>;
}

export function extractSceneRevision(text: string): unknown {
  const trimmed = text.trim();
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
