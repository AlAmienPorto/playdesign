import { Suspense, lazy, useMemo, useState } from 'react';
import { GripVertical, Plus, Sparkles, Trash2, Wand2 } from 'lucide-react';
import { Field } from './ui';
import { ReferenceManager } from './ReferenceManager';

import { createVideoJob, reviseVideoScene, type VideoJob } from '../lib/api';
import {
  ASPECTS,
  STYLE_PRESETS,
  VOICES,
  defaultScene,
  defaultSpec,
  narrationText,
  normalizeSpec,
  replaceScene,
  type SceneKind,
  type StylePreset,
  type TransitionKind,
  type VideoScene,
  type VideoSpec,
} from '../lib/video-spec';

// Remotion Player berat (~400 KB); dimuat hanya saat panel pratinjau dipakai.
const StoryPlayer = lazy(() => import('./StoryPlayer').then((mod) => ({ default: mod.StoryPlayer })));

const SCENE_LABEL: Record<SceneKind, string> = {
  title: 'Judul',
  statement: 'Pernyataan',
  list: 'Daftar poin',
  quote: 'Kutipan',
  cta: 'Ajakan (CTA)',
  image: 'Gambar',
  video: 'Video',
};

const TRANSITION_LABEL: Record<TransitionKind, string> = {
  cut: 'Potong langsung',
  fade: 'Pudar',
  slide: 'Geser',
  wipe: 'Sapu',
};

/**
 * Editor spec: satu objek yang sama dipakai pratinjau dan renderer.
 * Tidak ada state kedua untuk "hasil render" — job hanya menyimpan spec.
 */
export function VideoComposer({
  onCreated,
  onToast,
}: {
  onCreated: (job: VideoJob) => void;
  onToast: (message: string, tone?: 'success' | 'danger' | 'warning') => void;
}) {
  const [spec, setSpec] = useState<VideoSpec>(() => defaultSpec());
  const [title, setTitle] = useState('');
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState<'brief' | 'style' | 'scenes' | 'refs' | 'audio'>('brief');
  const [instructions, setInstructions] = useState<Record<string, string>>({});
  const [revisingId, setRevisingId] = useState<string | null>(null);

  const patch = (next: Partial<VideoSpec>) => setSpec((current) => normalizeSpec({ ...current, ...next }, current.render.aspect));
  const patchScenes = (updater: (scenes: VideoSpec['scenes']) => VideoSpec['scenes']) =>
    setSpec((current) => normalizeSpec({ ...current, scenes: updater(current.scenes) }, current.render.aspect));
  const patchStyle = (next: Partial<VideoSpec['style']>) => patch({ style: { ...spec.style, ...next } });
  const patchAudio = (next: Partial<VideoSpec['audio']>) => patch({ audio: { ...spec.audio, ...next } });
  const patchRender = (next: Partial<VideoSpec['render']>) => patch({ render: { ...spec.render, ...next } });
  const patchSubtitle = (next: Partial<VideoSpec['subtitle']>) => patch({ subtitle: { ...spec.subtitle, ...next } });

  const totalSeconds = useMemo(
    () => spec.scenes.reduce((sum, scene) => sum + scene.durationSec, 0),
    [spec.scenes],
  );

  const updateScene = (index: number, next: Partial<VideoScene>) =>
    patch({ scenes: spec.scenes.map((scene, i) => (i === index ? { ...scene, ...next } : scene)) });

  const moveScene = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= spec.scenes.length) return;
    const next = [...spec.scenes];
    [next[index], next[target]] = [next[target], next[index]];
    patch({ scenes: next });
  };

  const addScene = () => patch({ scenes: [...spec.scenes, defaultScene({ kind: 'statement' })] });
  const removeScene = (index: number) =>
    patch({ scenes: spec.scenes.length > 1 ? spec.scenes.filter((_, i) => i !== index) : spec.scenes });

  const reviseScene = async (index: number) => {
    const scene = spec.scenes[index];
    if (!scene || revisingId) return;
    const instruction = (instructions[scene.id] ?? '').trim();
    if (instruction.length < 3) {
      onToast('Tulis instruksi revisi dulu (minimal 3 karakter).', 'warning');
      return;
    }

    setRevisingId(scene.id);
    try {
      const next = await reviseVideoScene({
        scene,
        instruction,
        prompt: spec.prompt,
        style: spec.style,
        sceneIndex: index,
        sceneCount: spec.scenes.length,
      });
      patchScenes((scenes) => replaceScene(scenes, scene.id, next));
      setInstructions((current) => ({ ...current, [scene.id]: '' }));
      onToast(`Scene ${index + 1} direvisi. Scene lain tidak berubah.`, 'success');
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Gagal merevisi scene.', 'danger');
    } finally {
      setRevisingId(null);
    }
  };

  /** Pecah prompt jadi scene tanpa AI: kalimat panjang jadi scene pernyataan. */
  const scenesFromPrompt = () => {
    const source = spec.prompt.trim();
    if (!source) {
      onToast('Isi prompt dulu supaya bisa dipecah jadi scene.', 'warning');
      return;
    }
    const sentences = source
      .split(/(?<=[.!?])\s+|\n+/)
      .map((line) => line.trim())
      .filter(Boolean)
      .slice(0, 6);
    const scenes = sentences.map((sentence, index) => {
      const isFirst = index === 0;
      const isLast = index === sentences.length - 1;
      return defaultScene({
        kind: isFirst ? 'title' : isLast && sentences.length > 2 ? 'cta' : 'statement',
        durationSec: Math.min(8, Math.max(3, Math.round(sentence.length / 14))),
        title: sentence.length > 46 ? `${sentence.slice(0, 46)}…` : sentence,
        body: sentence.length > 46 ? sentence : '',
        transitionIn: spec.style.transition,
      });
    });
    patch({ scenes });
    onToast(`${scenes.length} scene dibuat dari prompt. Periksa durasi dan teksnya.`, 'success');
  };

  const fillScript = () => {
    const text = narrationText({ ...spec, audio: { ...spec.audio, script: '' } });
    if (!text) {
      onToast('Belum ada teks di scene untuk dijadikan narasi.', 'warning');
      return;
    }
    patchAudio({ script: text });
    onToast('Narasi diisi dari teks scene.', 'success');
  };

  const submit = async () => {
    const cleanTitle = title.trim() || spec.prompt.trim().slice(0, 80) || `Story ${new Date().toLocaleDateString('id-ID')}`;
    setSaving(true);
    try {
      const job = await createVideoJob({ templateId: 'story', title: cleanTitle, spec });
      onCreated(job);
      onToast(
        spec.render.upload
          ? `Job "${cleanTitle}" masuk antrean. Runner merender lalu mengunggah ke Drive.`
          : `Job "${cleanTitle}" masuk antrean. Unggahan dimatikan, file disimpan di mesin runner.`,
        'success',
      );
      setTitle('');
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Gagal membuat job video.', 'danger');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="studio-grid">
      <div className="studio-editor">
        <div className="studio-tabs" role="tablist">
          {(
            [
              ['brief', 'Prompt & brief'],
              ['style', 'Gaya'],
              ['scenes', `Scene (${spec.scenes.length})`],
              ['refs', `Referensi (${spec.references.length})`],
              ['audio', 'Suara & subtitle'],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={tab === key}
              className={`studio-tab${tab === key ? ' is-active' : ''}`}
              onClick={() => setTab(key)}
            >
              {label}
            </button>
          ))}
        </div>

        {tab === 'brief' ? (
          <div className="studio-section">
            <Field label="Prompt" hint="Tulis maksud video dalam bahasa sehari-hari. Dipakai sebagai acuan brief.">
              <textarea
                className="input"
                rows={4}
                value={spec.prompt}
                placeholder="Video 15 detik untuk catering sehat: masak fresh tiap hari, antar tepat waktu, ajakan pesan lewat WhatsApp."
                onChange={(event) => patch({ prompt: event.target.value })}
              />
            </Field>

            <Field label="Negative prompt" hint="Hal yang tidak diinginkan (dipakai provider yang mendukung).">
              <input
                className="input"
                value={spec.negativePrompt}
                placeholder="contoh: teks berantakan, warna pudar, logo lain"
                onChange={(event) => patch({ negativePrompt: event.target.value })}
              />
            </Field>

            <div className="studio-row">
              <Field label="Rasio">
                <select
                  className="input"
                  value={spec.render.aspect}
                  onChange={(event) => {
                    const aspect = event.target.value as VideoSpec['render']['aspect'];
                    patchRender({ aspect, width: ASPECTS[aspect].width, height: ASPECTS[aspect].height });
                  }}
                >
                  {Object.entries(ASPECTS).map(([key, value]) => (
                    <option key={key} value={key}>
                      {value.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="FPS">
                <select
                  className="input"
                  value={spec.render.fps}
                  onChange={(event) => patchRender({ fps: Number(event.target.value) })}
                >
                  {[24, 25, 30, 50, 60].map((fps) => (
                    <option key={fps} value={fps}>
                      {fps} fps
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Judul job" hint="Nama file di Drive.">
                <input
                  className="input"
                  value={title}
                  placeholder="Promo catering sehat"
                  onChange={(event) => setTitle(event.target.value)}
                />
              </Field>
            </div>

            <label className="studio-check">
              <input
                type="checkbox"
                checked={spec.render.upload}
                onChange={(event) => patchRender({ upload: event.target.checked })}
              />
              <span>
                <strong>Unggah ke Google Drive</strong>
                <em>
                  {spec.render.upload
                    ? 'File final langsung masuk Drive setelah render.'
                    : 'Dimatikan: file tetap di mesin runner, tidak diunggah ke mana pun.'}
                </em>
              </span>
            </label>

            <div className="studio-hint">
              Durasi total <strong>{totalSeconds.toFixed(1)} detik</strong> ·{' '}
              {Math.round(totalSeconds * spec.render.fps)} frame · {spec.scenes.length} scene
            </div>

            <div className="studio-note">
              <strong>Footage generatif belum tersambung</strong>
              <span>
                Revisi AI di tab Scene hanya mengubah teks dan struktur scene. Klip video hasil AI
                butuh provider berbayar; selama belum ada kredensial, tidak ada tombol generate dan
                tidak ada klip palsu.
              </span>
            </div>

            <div className="studio-actions">
              <button type="button" className="btn btn-ghost btn-sm" onClick={scenesFromPrompt}>
                <Wand2 size={14} /> Buat scene dari prompt
              </button>
            </div>
          </div>
        ) : null}

        {tab === 'style' ? (
          <div className="studio-section">
            <div className="studio-chips">
              {(Object.keys(STYLE_PRESETS) as StylePreset[]).map((preset) => (
                <button
                  key={preset}
                  type="button"
                  className={`chip${spec.style.preset === preset ? ' is-active' : ''}`}
                  title={STYLE_PRESETS[preset].hint}
                  onClick={() => {
                    const base = STYLE_PRESETS[preset].style;
                    setSpec((current) =>
                      normalizeSpec({ ...current, style: { ...base, preset } }, current.render.aspect),
                    );
                  }}
                >
                  {STYLE_PRESETS[preset].label}
                </button>
              ))}
            </div>
            <p className="studio-hint">{STYLE_PRESETS[spec.style.preset].hint}</p>

            <div className="studio-row">
              <Field label="Color grading">
                <select
                  className="input"
                  value={spec.style.grade}
                  onChange={(event) => patchStyle({ grade: event.target.value as VideoSpec['style']['grade'] })}
                >
                  <option value="neutral">Netral</option>
                  <option value="warm">Hangat</option>
                  <option value="cool">Dingin</option>
                  <option value="mono">Monokrom</option>
                </select>
              </Field>
              <Field label="Gerak kamera">
                <select
                  className="input"
                  value={spec.style.camera}
                  onChange={(event) => patchStyle({ camera: event.target.value as VideoSpec['style']['camera'] })}
                >
                  <option value="static">Diam</option>
                  <option value="push-in">Maju perlahan</option>
                  <option value="pull-out">Mundur perlahan</option>
                  <option value="pan-left">Geser kiri</option>
                  <option value="pan-right">Geser kanan</option>
                  <option value="handheld">Genggam</option>
                </select>
              </Field>
              <Field label="Pencahayaan">
                <select
                  className="input"
                  value={spec.style.lighting}
                  onChange={(event) => patchStyle({ lighting: event.target.value as VideoSpec['style']['lighting'] })}
                >
                  <option value="soft">Lembut</option>
                  <option value="hard">Keras</option>
                  <option value="backlit">Backlight</option>
                  <option value="natural">Alami</option>
                </select>
              </Field>
            </div>

            <div className="studio-row">
              <Field label="Transisi">
                <select
                  className="input"
                  value={spec.style.transition}
                  onChange={(event) => patchStyle({ transition: event.target.value as TransitionKind })}
                >
                  {Object.entries(TRANSITION_LABEL).map(([key, label]) => (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Tempo animasi">
                <select
                  className="input"
                  value={spec.style.pacing}
                  onChange={(event) => patchStyle({ pacing: event.target.value as VideoSpec['style']['pacing'] })}
                >
                  <option value="slow">Lambat</option>
                  <option value="medium">Sedang</option>
                  <option value="fast">Cepat</option>
                </select>
              </Field>
              <Field label="Skala tipografi">
                <input
                  className="input"
                  type="range"
                  min={0.8}
                  max={1.4}
                  step={0.02}
                  value={spec.style.typeScale}
                  onChange={(event) => patchStyle({ typeScale: Number(event.target.value) })}
                />
              </Field>
            </div>

            <div className="studio-row">
              <Field label="Warna latar">
                <input
                  className="input"
                  type="color"
                  value={spec.style.bg}
                  onChange={(event) => patchStyle({ bg: event.target.value })}
                />
              </Field>
              <Field label="Warna aksen">
                <input
                  className="input"
                  type="color"
                  value={spec.style.accent}
                  onChange={(event) => patchStyle({ accent: event.target.value })}
                />
              </Field>
              <Field label="Warna teks">
                <input
                  className="input"
                  type="color"
                  value={spec.style.ink}
                  onChange={(event) => patchStyle({ ink: event.target.value })}
                />
              </Field>
            </div>
          </div>
        ) : null}

        {tab === 'scenes' ? (
          <div className="studio-section">
            {spec.scenes.map((scene, index) => (
              <div className="scene-row" key={scene.id}>
                <div className="scene-row-head">
                  <span className="scene-index">
                    <GripVertical size={13} /> {index + 1}
                  </span>
                  <select
                    className="input input-sm"
                    value={scene.kind}
                    onChange={(event) => updateScene(index, { kind: event.target.value as SceneKind })}
                  >
                    {Object.entries(SCENE_LABEL).map(([key, label]) => (
                      <option key={key} value={key}>
                        {label}
                      </option>
                    ))}
                  </select>
                  <input
                    className="input input-sm scene-duration"
                    type="number"
                    min={0.5}
                    max={30}
                    step={0.5}
                    value={scene.durationSec}
                    onChange={(event) => updateScene(index, { durationSec: Number(event.target.value) })}
                  />
                  <span className="muted-small">detik</span>
                  <select
                    className="input input-sm"
                    value={scene.transitionIn ?? spec.style.transition}
                    onChange={(event) => updateScene(index, { transitionIn: event.target.value as TransitionKind })}
                  >
                    {Object.entries(TRANSITION_LABEL).map(([key, label]) => (
                      <option key={key} value={key}>
                        {label}
                      </option>
                    ))}
                  </select>
                  <span className="scene-row-actions">
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => moveScene(index, -1)} disabled={index === 0}>
                      ↑
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => moveScene(index, 1)}
                      disabled={index === spec.scenes.length - 1}
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => removeScene(index)}
                      disabled={spec.scenes.length <= 1}
                      aria-label="Hapus scene"
                    >
                      <Trash2 size={13} />
                    </button>
                  </span>
                </div>

                <input
                  className="input"
                  value={scene.title ?? ''}
                  placeholder="Judul scene"
                  onChange={(event) => updateScene(index, { title: event.target.value })}
                />
                <textarea
                  className="input"
                  rows={2}
                  value={scene.body ?? ''}
                  placeholder="Teks pendukung / narasi scene"
                  onChange={(event) => updateScene(index, { body: event.target.value })}
                />
                {scene.kind === 'image' || scene.kind === 'video' ? (
                  <div className="studio-row">
                    <Field label="Referensi media">
                      <select
                        className="input input-sm"
                        value={scene.media?.refId ?? ''}
                        onChange={(event) =>
                          updateScene(index, {
                            media: event.target.value
                              ? { ...scene.media, refId: event.target.value }
                              : undefined,
                          })
                        }
                      >
                        <option value="">— tanpa media —</option>
                        {spec.references
                          .filter((ref) => ref.kind === (scene.kind === 'video' ? 'video' : 'image'))
                          .map((ref) => (
                            <option key={ref.id} value={ref.id}>
                              {ref.name}
                            </option>
                          ))}
                      </select>
                    </Field>
                    <Field label="Penyesuaian">
                      <select
                        className="input input-sm"
                        value={scene.media?.fit ?? 'cover'}
                        onChange={(event) =>
                          updateScene(index, {
                            media: { ...scene.media, fit: event.target.value as 'cover' | 'contain' },
                          })
                        }
                      >
                        <option value="cover">Isi penuh (cover)</option>
                        <option value="contain">Utuh (contain)</option>
                      </select>
                    </Field>
                    <Field label="Gerak">
                      <select
                        className="input input-sm"
                        value={scene.media?.motion ?? 'kenburns'}
                        onChange={(event) =>
                          updateScene(index, {
                            media: {
                              ...scene.media,
                              motion: event.target.value as 'none' | 'kenburns' | 'parallax',
                            },
                          })
                        }
                      >
                        <option value="none">Diam</option>
                        <option value="kenburns">Ken Burns</option>
                        <option value="parallax">Paralaks</option>
                      </select>
                    </Field>
                  </div>
                ) : null}

                {scene.kind === 'list' ? (
                  <textarea
                    className="input"
                    rows={3}
                    value={(scene.items ?? []).join('\n')}
                    placeholder={'Satu poin per baris\nBahan segar harian\nAntar tepat waktu'}
                    onChange={(event) =>
                      updateScene(index, {
                        items: event.target.value.split('\n').map((line) => line.trim()).filter(Boolean),
                      })
                    }
                  />
                ) : null}

                <div className="scene-revise">
                  <textarea
                    className="input scene-revise-input"
                    aria-label={`Instruksi revisi untuk scene ${index + 1}`}
                    rows={2}
                    maxLength={600}
                    value={instructions[scene.id] ?? ''}
                    placeholder="Revisi scene ini, contoh: judul lebih tegas, durasi 3 detik"
                    onChange={(event) =>
                      setInstructions((current) => ({ ...current, [scene.id]: event.target.value }))
                    }
                  />
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => reviseScene(index)}
                    disabled={revisingId !== null || (instructions[scene.id] ?? '').trim().length < 3}
                  >
                    <Sparkles size={14} /> {revisingId === scene.id ? 'Merevisi…' : 'Revisi AI'}
                  </button>
                </div>
              </div>
            ))}

            <div className="studio-actions">
              <button type="button" className="btn btn-ghost btn-sm" onClick={addScene}>
                <Plus size={14} /> Tambah scene
              </button>
            </div>
          </div>
        ) : null}

        {tab === 'refs' ? (
          <ReferenceManager
            selected={spec.references}
            onChange={(references) => patch({ references })}
            onApplyPalette={(palette) => {
              patchStyle({
                bg: palette.bg ?? spec.style.bg,
                accent: palette.accent ?? spec.style.accent,
                preset: 'custom',
              });
              onToast('Palet dari referensi dipakai; preset diubah ke Custom.', 'success');
            }}
            onToast={onToast}
          />
        ) : null}

        {tab === 'audio' ? (
          <div className="studio-section">
            <label className="studio-check">
              <input
                type="checkbox"
                checked={spec.audio.voice.enabled}
                onChange={(event) => patchAudio({ voice: { ...spec.audio.voice, enabled: event.target.checked } })}
              />
              <span>
                <strong>Voice-over</strong>
                <em>Suara dibuat runner dengan edge-tts, lalu digabung ke video.</em>
              </span>
            </label>

            <div className="studio-row">
              <Field label="Suara">
                <select
                  className="input"
                  value={spec.audio.voice.voiceId}
                  disabled={!spec.audio.voice.enabled}
                  onChange={(event) => {
                    const voice = VOICES.find((item) => item.id === event.target.value);
                    patchAudio({
                      voice: { ...spec.audio.voice, voiceId: event.target.value, lang: voice?.lang ?? 'id-ID' },
                    });
                  }}
                >
                  {VOICES.map((voice) => (
                    <option key={voice.id} value={voice.id}>
                      {voice.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Kecepatan" hint={`${spec.audio.voice.rate > 0 ? '+' : ''}${spec.audio.voice.rate}%`}>
                <input
                  className="input"
                  type="range"
                  min={-30}
                  max={30}
                  step={5}
                  value={spec.audio.voice.rate}
                  disabled={!spec.audio.voice.enabled}
                  onChange={(event) =>
                    patchAudio({ voice: { ...spec.audio.voice, rate: Number(event.target.value) } })
                  }
                />
              </Field>
              <Field label="Nada" hint={`${spec.audio.voice.pitch > 0 ? '+' : ''}${spec.audio.voice.pitch} Hz`}>
                <input
                  className="input"
                  type="range"
                  min={-30}
                  max={30}
                  step={5}
                  value={spec.audio.voice.pitch}
                  disabled={!spec.audio.voice.enabled}
                  onChange={(event) =>
                    patchAudio({ voice: { ...spec.audio.voice, pitch: Number(event.target.value) } })
                  }
                />
              </Field>
            </div>

            <Field label="Naskah narasi" hint="Kosongkan untuk memakai teks scene apa adanya.">
              <textarea
                className="input"
                rows={4}
                value={spec.audio.script}
                placeholder="Catering sehat setiap hari. Bahan segar, antar tepat waktu…"
                onChange={(event) => patchAudio({ script: event.target.value })}
              />
            </Field>
            <div className="studio-actions">
              <button type="button" className="btn btn-ghost btn-sm" onClick={fillScript}>
                <Wand2 size={14} /> Isi dari teks scene
              </button>
            </div>

            <label className="studio-check">
              <input
                type="checkbox"
                checked={spec.subtitle.enabled}
                onChange={(event) => patchSubtitle({ enabled: event.target.checked })}
              />
              <span>
                <strong>Subtitle otomatis</strong>
                <em>Diambil dari timing suara (TTS), jadi sinkron dengan narasi.</em>
              </span>
            </label>

            {spec.subtitle.enabled ? (
              <div className="studio-row">
                <Field label="Posisi subtitle">
                  <select
                    className="input"
                    value={spec.subtitle.position}
                    onChange={(event) =>
                      patchSubtitle({ position: event.target.value as VideoSpec['subtitle']['position'] })
                    }
                  >
                    <option value="bottom">Bawah</option>
                    <option value="center">Tengah</option>
                    <option value="top">Atas</option>
                  </select>
                </Field>
                <Field label="Ukuran" hint={`${spec.subtitle.fontSizePct.toFixed(1)}% tinggi frame`}>
                  <input
                    className="input"
                    type="range"
                    min={2}
                    max={9}
                    step={0.2}
                    value={spec.subtitle.fontSizePct}
                    onChange={(event) => patchSubtitle({ fontSizePct: Number(event.target.value) })}
                  />
                </Field>
                <Field label="Latar teks">
                  <select
                    className="input"
                    value={spec.subtitle.boxed ? 'boxed' : 'plain'}
                    onChange={(event) => patchSubtitle({ boxed: event.target.value === 'boxed' })}
                  >
                    <option value="boxed">Kotak gelap</option>
                    <option value="plain">Tanpa latar</option>
                  </select>
                </Field>
              </div>
            ) : null}

            <label className="studio-check">
              <input
                type="checkbox"
                checked={spec.audio.music.enabled}
                onChange={(event) => patchAudio({ music: { ...spec.audio.music, enabled: event.target.checked } })}
              />
              <span>
                <strong>Musik latar</strong>
                <em>Pilih berkas dari tab Referensi (jenis audio). Tanpa berkas, bagian ini dilewati.</em>
              </span>
            </label>

            {spec.audio.music.enabled ? (
              <div className="studio-row">
                <Field label="Berkas musik" hint="Diambil dari pustaka referensi (jenis audio).">
                  <select
                    className="input"
                    value={spec.audio.music.refId ?? ''}
                    onChange={(event) =>
                      patchAudio({
                        music: { ...spec.audio.music, refId: event.target.value || undefined },
                      })
                    }
                  >
                    <option value="">— pilih referensi audio —</option>
                    {spec.references
                      .filter((ref) => ref.kind === 'audio')
                      .map((ref) => (
                        <option key={ref.id} value={ref.id}>
                          {ref.name}
                        </option>
                      ))}
                  </select>
                </Field>
                <Field label="Volume musik" hint={`${spec.audio.music.volume}%`}>
                  <input
                    className="input"
                    type="range"
                    min={0}
                    max={100}
                    step={2}
                    value={spec.audio.music.volume}
                    onChange={(event) =>
                      patchAudio({ music: { ...spec.audio.music, volume: Number(event.target.value) } })
                    }
                  />
                </Field>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      <aside className="studio-aside">
        <div className="studio-preview">
          <Suspense fallback={<div className="studio-player-skeleton">Memuat pratinjau…</div>}>
            <StoryPlayer spec={spec} className="studio-player" />
          </Suspense>
        </div>
        <button type="button" className="btn btn-primary studio-render" onClick={() => void submit()} disabled={saving}>
          <Sparkles size={14} /> {saving ? 'Mengantrekan…' : spec.render.upload ? 'Render & kirim ke Drive' : 'Render (simpan lokal)'}
        </button>
        <p className="studio-hint">
          {spec.render.upload
            ? 'File final langsung ke Google Drive; tidak ada byte video di server ini.'
            : 'Unggahan dimatikan: file final disimpan di mesin runner dan dicatat sebagai path lokal.'}
        </p>
      </aside>
    </div>
  );
}
