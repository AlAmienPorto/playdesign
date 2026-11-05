/**
 * Komposisi `Story` berasal dari proyek Remotion (satu implementasi untuk
 * preview dan render). Proyek itu punya toolchain sendiri tanpa @types/react,
 * jadi tipenya dideklarasikan di sini alih-alih ikut di-typecheck.
 */
declare module '@story' {
  import type { ComponentType } from 'react';
  import type { VideoSpec } from '../lib/video-spec';

  export type StoryCaption = { startMs: number; endMs: number; text: string };

  export type StoryProps = {
    spec: VideoSpec;
    assets?: {
      voiceover?: string;
      music?: string;
      sfx?: Array<{ src: string; atSec: number; volume: number }>;
      captions?: StoryCaption[];
    };
  };

  export const Story: ComponentType<StoryProps>;
}
