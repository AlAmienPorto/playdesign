import { useCallback, useEffect, useMemo, useState } from 'react';
import { CloudUpload, ExternalLink, Film, Play, RefreshCw, Sparkles, X } from 'lucide-react';
import { Badge, Card, EmptyState, Field, Fig, PageHead } from '../components/ui';
import {
  createVideoJob,
  fetchVideoJobs,
  fetchVideoTemplates,
  updateVideoJob,
  type VideoJob,
  type VideoJobStatus,
  type VideoTemplate,
} from '../lib/api';
import { useStore } from '../store/store';
import './VideoStudio.css';

const STATUS_TONE: Record<VideoJobStatus, 'neutral' | 'info' | 'success' | 'danger' | 'warning'> = {
  queued: 'neutral',
  rendering: 'info',
  uploading: 'info',
  done: 'success',
  failed: 'danger',
  canceled: 'warning',
};

const STATUS_LABEL: Record<VideoJobStatus, string> = {
  queued: 'Menunggu runner',
  rendering: 'Dirender',
  uploading: 'Diunggah ke Drive',
  done: 'Selesai',
  failed: 'Gagal',
  canceled: 'Dibatalkan',
};

const formatBytes = (bytes?: number | null) => {
  if (!bytes || bytes <= 0) return '—';
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const formatWhen = (iso?: string | null) => {
  if (!iso) return '—';
  const date = new Date(iso.includes('T') ? iso : `${iso.replace(' ', 'T')}Z`);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' });
};

// Pratinjau tidak pernah melewati server ini: thumbnail & player memakai
// endpoint Drive langsung dari browser, jadi tidak ada byte video di Worker/D1.
const DRIVE_ID = /^[A-Za-z0-9_-]{10,}$/;

const driveIdOf = (job: VideoJob): string => {
  const id = job.driveFileId ?? '';
  return DRIVE_ID.test(id) ? id : '';
};

const thumbUrl = (id: string, width = 320) => `https://drive.google.com/thumbnail?id=${id}&sz=w${width}`;
const embedUrl = (id: string) => `https://drive.google.com/file/d/${id}/preview`;

type FormState = Record<string, string>;

const defaultsFor = (template?: VideoTemplate): FormState => {
  const state: FormState = {};
  for (const field of template?.propsSchema.fields ?? []) {
    state[field.key] = field.default === undefined ? '' : String(field.default);
  }
  return state;
};

export function VideoStudioPage() {
  const { toast } = useStore();
  const [templates, setTemplates] = useState<VideoTemplate[]>([]);
  const [jobs, setJobs] = useState<VideoJob[]>([]);
  const [templateId, setTemplateId] = useState('');
  const [title, setTitle] = useState('');
  const [form, setForm] = useState<FormState>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState<VideoJob | null>(null);
  const [detail, setDetail] = useState<VideoJob | null>(null);
  const [busyId, setBusyId] = useState('');
  const [brokenThumbs, setBrokenThumbs] = useState<Record<string, boolean>>({});

  const template = useMemo(() => templates.find((item) => item.id === templateId), [templates, templateId]);

  const load = useCallback(
    async (quiet = false) => {
      if (!quiet) setLoading(true);
      try {
        const [nextTemplates, nextJobs] = await Promise.all([fetchVideoTemplates(), fetchVideoJobs(30)]);
        setTemplates(nextTemplates);
        setJobs(nextJobs);
        setError('');
        setTemplateId((current) => {
          if (current && nextTemplates.some((item) => item.id === current)) return current;
          return nextTemplates[0]?.id ?? '';
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Gagal memuat data video.');
      } finally {
        if (!quiet) setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    void load();
  }, [load]);

  // Isi form dari default template setiap kali template berganti.
  useEffect(() => {
    setForm(defaultsFor(templates.find((item) => item.id === templateId)));
  }, [templateId, templates]);

  // Esc menutup pemutar pratinjau.
  useEffect(() => {
    if (!preview && !detail) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setPreview(null);
      setDetail(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [preview, detail]);

  const activeCount = jobs.filter((job) => ['queued', 'rendering', 'uploading'].includes(job.status)).length;

  // Selama ada job berjalan, tanya server tiap 8 detik.
  useEffect(() => {
    if (!activeCount) return;
    const timer = window.setInterval(() => void load(true), 8000);
    return () => window.clearInterval(timer);
  }, [activeCount, load]);

  const submit = async () => {
    if (!template) {
      toast('Pilih template dulu.', 'warning');
      return;
    }
    const cleanTitle = title.trim() || `${template.name} ${new Date().toLocaleDateString('id-ID')}`;
    setSaving(true);
    try {
      const props: Record<string, unknown> = {};
      for (const field of template.propsSchema.fields) {
        const raw = form[field.key] ?? '';
        props[field.key] = field.type === 'number' ? Number(raw || 0) : raw;
      }
      const job = await createVideoJob({ templateId: template.id, title: cleanTitle, props });
      toast(`Job video "${cleanTitle}" masuk antrean. Runner akan merender lalu mengunggah ke Drive.`, 'success');
      setTitle('');
      setJobs((current) => [job, ...current]);
      void load(true);
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Gagal membuat job video.', 'danger');
    } finally {
      setSaving(false);
    }
  };

  const doneCount = jobs.filter((job) => job.status === 'done').length;
  const failedCount = jobs.filter((job) => job.status === 'failed').length;

  // Batal / ulangi. Server yang memutuskan transisi mana yang sah — UI hanya
  // menampilkan tombol untuk status yang memang punya jalan keluar.
  const act = async (job: VideoJob, next: 'canceled' | 'queued') => {
    setBusyId(job.id);
    try {
      const updated = await updateVideoJob(job.id, { status: next });
      setJobs((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      setDetail((current) => (current && current.id === updated.id ? updated : current));
      toast(
        next === 'canceled' ? `Job "${job.title}" dibatalkan.` : `Job "${job.title}" masuk antrean lagi.`,
        'success',
      );
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Gagal memperbarui job.', 'danger');
    } finally {
      setBusyId('');
    }
  };

  // Sel pratinjau: thumbnail dari Drive, diklik untuk memutar di modal.
  const previewCell = (job: VideoJob) => {
    const id = driveIdOf(job);
    if (id) {
      return (
        <button type="button" className="video-thumb" onClick={() => setPreview(job)} title="Putar pratinjau">
          {brokenThumbs[id] ? (
            <span className="video-thumb-fallback">
              <Play size={13} />
              Putar
            </span>
          ) : (
            <>
              <img
                src={thumbUrl(id)}
                alt={`Pratinjau ${job.title}`}
                loading="lazy"
                onError={() => setBrokenThumbs((current) => ({ ...current, [id]: true }))}
              />
              <span className="video-thumb-play">
                <Play size={13} />
              </span>
            </>
          )}
        </button>
      );
    }
    if (job.status === 'queued' || job.status === 'rendering' || job.status === 'uploading') {
      return <span className="muted-small">Menunggu render</span>;
    }
    if (job.status === 'done') {
      return (
        <span className="muted-small" title="File hasil ada di disk runner, bukan di Drive — pratinjau butuh file Drive.">
          Lokal (uji)
        </span>
      );
    }
    return <span className="muted-small">—</span>;
  };

  return (
    <>
      <PageHead
        kicker="Marketing & Content"
        title="Video Studio"
        desc="Buat video promo dari brief di sini. Render dijalankan di mesin runner, lalu file final langsung diunggah ke Google Drive — tidak ada video yang disimpan di server."
        actions={
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => void load()} disabled={loading}>
            <RefreshCw size={14} /> {loading ? 'Memuat…' : 'Muat ulang'}
          </button>
        }
      />

      <div className="figs figs-4">
        <Fig label="Total job" value={jobs.length} icon={<Film size={16} />} />
        <Fig label="Sedang jalan" value={activeCount} icon={<CloudUpload size={16} />} />
        <Fig label="Selesai" value={doneCount} icon={<Sparkles size={16} />} />
        <Fig label="Gagal" value={failedCount} icon={<Film size={16} />} />
      </div>

      {error && <p className="notice-inline">{error}</p>}

      <Card
        title="Buat video baru"
        sub="Pilih template, isi brief, lalu antrekan. File hasil tidak pernah mampir ke server ini."
      >
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 }}>
          <Field label="Template">
            <select className="input" value={templateId} onChange={(event) => setTemplateId(event.target.value)}>
              {templates.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name} ({item.aspect})
                </option>
              ))}
            </select>
          </Field>
          <Field label="Judul job" hint="Dipakai untuk nama file di Drive.">
            <input
              className="input"
              value={title}
              placeholder={template ? `${template.name} — ${new Date().toLocaleDateString('id-ID')}` : 'Judul video'}
              onChange={(event) => setTitle(event.target.value)}
            />
          </Field>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: 12,
            marginTop: 12,
          }}
        >
          {(template?.propsSchema.fields ?? []).map((field) => (
            <Field key={field.key} label={field.label}>
              <input
                className="input"
                type={field.type === 'color' ? 'color' : field.type === 'number' ? 'number' : 'text'}
                value={form[field.key] ?? ''}
                min={field.type === 'number' ? 3 : undefined}
                max={field.type === 'number' ? 120 : undefined}
                onChange={(event) => setForm((current) => ({ ...current, [field.key]: event.target.value }))}
              />
            </Field>
          ))}
        </div>

        <div className="row-end" style={{ marginTop: 16 }}>
          <button type="button" className="btn btn-primary" onClick={() => void submit()} disabled={saving || !template}>
            <Sparkles size={14} /> {saving ? 'Mengantrekan…' : 'Render & kirim ke Drive'}
          </button>
        </div>
      </Card>

      <Card title="Riwayat render" sub="Status diperbarui otomatis selama ada job berjalan.">
        {jobs.length === 0 ? (
          <EmptyState title="Belum ada job video" desc="Buat job pertama di panel atas." />
        ) : (
          <table className="pd-table">
            <thead>
              <tr>
                <th>Judul</th>
                <th>Template</th>
                <th>Status</th>
                <th>Pratinjau</th>
                <th>Resolusi</th>
                <th>Ukuran</th>
                <th>Dibuat</th>
                <th>File</th>
                <th>Aksi</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((job) => (
                <tr key={job.id}>
                  <td>
                    <div className="cell-main">{job.title}</div>
                    <div className="cell-sub">{job.id}</div>
                  </td>
                  <td>{templates.find((item) => item.id === job.templateId)?.name ?? job.templateId}</td>
                  <td>
                    <Badge tone={STATUS_TONE[job.status]} dot>
                      {STATUS_LABEL[job.status]}
                    </Badge>
                    {(job.attempts ?? 0) > 0 && <div className="cell-sub">percobaan ke-{(job.attempts ?? 0) + 1}</div>}
                    {job.status === 'failed' && job.error && <div className="cell-sub">{job.error}</div>}
                  </td>
                  <td>{previewCell(job)}</td>
                  <td>
                    {job.width}×{job.height}
                  </td>
                  <td>{formatBytes(job.bytes)}</td>
                  <td>{formatWhen(job.createdAt)}</td>
                  <td>
                    {job.driveWebLink ? (
                      <a className="detail-link" href={job.driveWebLink} target="_blank" rel="noreferrer">
                        Buka di Drive <ExternalLink size={12} />
                      </a>
                    ) : (
                      <span className="muted-small">—</span>
                    )}
                  </td>
                  <td>
                    <div className="row-actions">
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => setDetail(job)}>
                        Detail
                      </button>
                      {(job.status === 'queued' || job.status === 'rendering' || job.status === 'uploading') && (
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          onClick={() => void act(job, 'canceled')}
                          disabled={busyId === job.id}
                        >
                          Batal
                        </button>
                      )}
                      {(job.status === 'failed' || job.status === 'canceled') && (
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          onClick={() => void act(job, 'queued')}
                          disabled={busyId === job.id}
                        >
                          Ulangi
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {preview && driveIdOf(preview) && (
        <div className="overlay overlay-center" onClick={() => setPreview(null)}>
          <div className="modal modal-wide" onClick={(event) => event.stopPropagation()}>
            <div className="modal-head">
              <div>
                <h2>{preview.title}</h2>
                <p>
                  {preview.width}×{preview.height} · {formatBytes(preview.bytes)} · diputar langsung dari Google Drive
                </p>
              </div>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setPreview(null)} aria-label="Tutup">
                <X size={14} />
              </button>
            </div>
            <div className="modal-body">
              <iframe
                className="video-preview-frame"
                style={
                  preview.height > preview.width
                    ? { aspectRatio: '9 / 16', width: 'auto', height: 'min(62vh, 560px)', maxWidth: '100%', margin: '0 auto' }
                    : undefined
                }
                src={embedUrl(driveIdOf(preview))}
                title={`Pratinjau ${preview.title}`}
                allow="autoplay; fullscreen"
                allowFullScreen
              />
              <p className="muted-small" style={{ marginTop: 10 }}>
                Kalau pemutar kosong, file belum dibagikan ke akun Google yang sedang login di browser ini. Buka di Drive
                untuk memutar langsung.
              </p>
            </div>
            <div className="modal-foot">
              <a className="btn btn-ghost btn-sm" href={preview.driveWebLink ?? '#'} target="_blank" rel="noreferrer">
                Buka di Drive <ExternalLink size={12} />
              </a>
            </div>
          </div>
        </div>
      )}
      {detail && (
        <div className="overlay overlay-center" onClick={() => setDetail(null)}>
          <div className="modal" onClick={(event) => event.stopPropagation()}>
            <div className="modal-head">
              <div>
                <h2>{detail.title}</h2>
                <p>
                  {detail.id} · {STATUS_LABEL[detail.status]} · {detail.width}×{detail.height}
                </p>
              </div>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setDetail(null)} aria-label="Tutup">
                <X size={14} />
              </button>
            </div>
            <div className="modal-body">
              <dl className="brief-list">
                <div>
                  <dt>Template</dt>
                  <dd>{templates.find((item) => item.id === detail.templateId)?.name ?? detail.templateId}</dd>
                </div>
                <div>
                  <dt>Durasi</dt>
                  <dd>
                    {(detail.durationFrames / (detail.fps || 30)).toFixed(1)} s · {detail.fps} fps ·{' '}
                    {detail.durationFrames} frame
                  </dd>
                </div>
                <div>
                  <dt>Percobaan</dt>
                  <dd>ke-{(detail.attempts ?? 0) + 1}</dd>
                </div>
                <div>
                  <dt>Dibuat</dt>
                  <dd>{formatWhen(detail.createdAt)}</dd>
                </div>
                <div>
                  <dt>Mulai render</dt>
                  <dd>{formatWhen(detail.startedAt)}</dd>
                </div>
                <div>
                  <dt>Selesai</dt>
                  <dd>{formatWhen(detail.finishedAt)}</dd>
                </div>
                {detail.bytes ? (
                  <div>
                    <dt>Ukuran</dt>
                    <dd>{formatBytes(detail.bytes)}</dd>
                  </div>
                ) : null}
              </dl>

              <h3 className="brief-title">Brief yang dipakai</h3>
              <dl className="brief-list">
                {Object.entries(detail.props ?? {}).length === 0 ? (
                  <div>
                    <dt>—</dt>
                    <dd>Job ini tidak menyimpan props.</dd>
                  </div>
                ) : (
                  Object.entries(detail.props ?? {}).map(([key, value]) => (
                    <div key={key}>
                      <dt>{key}</dt>
                      <dd>{String(value)}</dd>
                    </div>
                  ))
                )}
              </dl>

              {detail.error ? (
                <>
                  <h3 className="brief-title">Error terakhir</h3>
                  <p className="detail-error">{detail.error}</p>
                </>
              ) : null}
            </div>
            <div className="modal-foot">
              {detail.driveWebLink ? (
                <a className="btn btn-ghost btn-sm" href={detail.driveWebLink} target="_blank" rel="noreferrer">
                  Buka file <ExternalLink size={12} />
                </a>
              ) : null}
              {detail.driveFolderId && DRIVE_ID.test(detail.driveFolderId) ? (
                <a
                  className="btn btn-ghost btn-sm"
                  href={`https://drive.google.com/drive/folders/${detail.driveFolderId}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Buka folder <ExternalLink size={12} />
                </a>
              ) : null}
              {(detail.status === 'failed' || detail.status === 'canceled') && (
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={() => void act(detail, 'queued')}
                  disabled={busyId === detail.id}
                >
                  Ulangi job ini
                </button>
              )}
              {(detail.status === 'queued' || detail.status === 'rendering' || detail.status === 'uploading') && (
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => void act(detail, 'canceled')}
                  disabled={busyId === detail.id}
                >
                  Batalkan
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
