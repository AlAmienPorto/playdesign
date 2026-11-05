// @ts-nocheck — dieksekusi oleh Node/tsx, bukan build Vite.
import test from 'node:test';
import assert from 'node:assert/strict';

import { reviseVideoScene } from './api';
import { defaultScene } from './video-spec';

const scene = defaultScene({ kind: 'title', title: 'Lama' });

function stubFetch() {
  const calls: Array<{ url: string; body: any }> = [];
  globalThis.fetch = async (url: any, init: any) => {
    calls.push({ url: String(url), body: JSON.parse(String(init?.body ?? '{}')) });
    return new Response(JSON.stringify({ scene: { ...scene, title: 'Baru' }, model: 'm' }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };
  return calls;
}

test('reviseVideoScene mengirim konteks brief di dalam objek context', async () => {
  const calls = stubFetch();

  await reviseVideoScene({
    scene,
    instruction: 'judul lebih tegas',
    prompt: 'Promo kopi susu',
    style: { preset: 'commercial' } as any,
    sceneIndex: 1,
    sceneCount: 3,
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, '/api/video/scenes/revise');
  const body = calls[0].body;
  assert.equal(body.workspace, 'playdesign');
  assert.equal(body.instruction, 'judul lebih tegas');
  assert.equal(body.scene.id, scene.id);
  assert.ok(body.context, 'payload harus punya objek context');
  assert.equal(body.context.prompt, 'Promo kopi susu');
  assert.equal(body.context.sceneIndex, 1);
  assert.equal(body.context.sceneCount, 3);
  assert.equal(body.context.style.preset, 'commercial');
  assert.equal(body.prompt, undefined);
});

test('reviseVideoScene mengembalikan scene dari server', async () => {
  stubFetch();

  const result = await reviseVideoScene({ scene, instruction: 'judul lebih tegas' });

  assert.equal(result.id, scene.id);
  assert.equal(result.title, 'Baru');
});
