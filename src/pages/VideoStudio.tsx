import { useCallback, useEffect, useMemo, useState } from 'react';
import { CloudUpload, ExternalLink, Film, RefreshCw, Sparkles } from 'lucide-react';
import { Badge, Card, EmptyState, Field, Fig, PageHead } from '../components/ui';
import {
  createVideoJob,
  fetchVideoJobs,
  fetchVideoTemplates,
  type VideoJob,
  type VideoJobStatus,
  type VideoTemplate,
} from '../lib/api';
import { useStore } from '../store/store';

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
                <th>Resolusi</th>
                <th>Ukuran</th>
                <th>Dibuat</th>
                <th>File</th>
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
                    {job.status === 'failed' && job.error && <div className="cell-sub">{job.error}</div>}
                  </td>
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
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </>
  );
}
