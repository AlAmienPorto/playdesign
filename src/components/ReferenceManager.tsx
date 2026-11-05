import { useEffect, useState } from 'react';
import { Image as ImageIcon, Music4, Plus, Trash2, Video, Wand2 } from 'lucide-react';
import { Field } from './ui';
import {
  createVideoReference,
  deleteVideoReference,
  listVideoReferences,
  updateVideoReference,
  type VideoReferenceRecord,
} from '../lib/api';
import type { ReferenceRole, VideoReference } from '../lib/video-spec';

const ROLE_LABEL: Record<ReferenceRole, string> = {
  style: 'Gaya / palet',
  motion: 'Gerak kamera',
  subject: 'Subjek / produk',
  music: 'Musik latar',
  sfx: 'Efek suara',
};

const KIND_LABEL = { image: 'Gambar', video: 'Video', audio: 'Audio' } as const;

const toSpecRef = (record: VideoReferenceRecord): VideoReference => ({
  id: record.id,
  kind: record.kind,
  name: record.name,
  role: record.role,
  strength: record.strength,
  url: record.url,
  note: record.note ?? undefined,
});

/**
 * Pustaka referensi: hanya metadata + URL. Berkas aslinya tidak pernah disimpan
 * di server ini — runner mengunduhnya saat render (`https://…`) atau membaca
 * path `local:/…` di mesin runner.
 */
export function ReferenceManager({
  selected,
  onChange,
  onApplyPalette,
  onToast,
}: {
  selected: VideoReference[];
  onChange: (next: VideoReference[]) => void;
  onApplyPalette: (palette: { bg?: string; accent?: string }) => void;
  onToast: (message: string, tone?: 'success' | 'danger' | 'warning') => void;
}) {
  const [library, setLibrary] = useState<VideoReferenceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: '',
    url: '',
    kind: 'image' as VideoReferenceRecord['kind'],
    role: 'subject' as ReferenceRole,
    strength: 0.6,
  });

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const rows = await listVideoReferences();
        if (alive) setLibrary(rows);
      } catch (err) {
        if (alive) setError(err instanceof Error ? err.message : 'Gagal memuat pustaka referensi.');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const isUsed = (id: string) => selected.some((ref) => ref.id === id);

  const toggle = (record: VideoReferenceRecord) => {
    if (isUsed(record.id)) {
      onChange(selected.filter((ref) => ref.id !== record.id));
    } else {
      onChange([...selected, toSpecRef(record)]);
    }
  };

  const add = async () => {
    const url = form.url.trim();
    if (!url) {
      onToast('Tempel URL berkas referensi dulu.', 'warning');
      return;
    }
    if (!/^https?:\/\//i.test(url) && !/^local:[/\\]/i.test(url)) {
      onToast('URL harus https://… atau local:/path/di/mesin/runner.', 'warning');
      return;
    }
    const fallbackName = url.split('?')[0].split('/').pop() || 'Referensi';
    setBusy('new');
    try {
      const record = await createVideoReference({
        name: form.name.trim() || fallbackName.slice(0, 80),
        kind: form.kind,
        role: form.role,
        url,
        strength: form.strength,
      });
      setLibrary((current) => [record, ...current]);
      onChange([...selected, toSpecRef(record)]);
      setForm({ name: '', url: '', kind: form.kind, role: form.role, strength: form.strength });
      onToast('Referensi ditambahkan dan langsung dipakai di job ini.', 'success');
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Gagal menambah referensi.', 'danger');
    } finally {
      setBusy(null);
    }
  };

  const remove = async (record: VideoReferenceRecord) => {
    setBusy(record.id);
    try {
      await deleteVideoReference(record.id);
      setLibrary((current) => current.filter((item) => item.id !== record.id));
      onChange(selected.filter((ref) => ref.id !== record.id));
      onToast(`Referensi "${record.name}" dihapus dari pustaka.`, 'success');
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Gagal menghapus referensi.', 'danger');
    } finally {
      setBusy(null);
    }
  };

  const setStrength = (record: VideoReferenceRecord, value: number) => {
    setLibrary((current) => current.map((item) => (item.id === record.id ? { ...item, strength: value } : item)));
    onChange(selected.map((ref) => (ref.id === record.id ? { ...ref, strength: value } : ref)));
  };

  const persistStrength = (record: VideoReferenceRecord) => {
    void updateVideoReference(record.id, { strength: record.strength }).catch(() => {
      onToast('Kekuatan referensi gagal disimpan; nilainya tetap dipakai di job ini.', 'warning');
    });
  };

  return (
    <div className="studio-section">
      <div className="ref-form">
        <div className="studio-row">
          <Field label="Nama">
            <input
              className="input"
              value={form.name}
              placeholder="foto produk / musik intro"
              onChange={(event) => setForm({ ...form, name: event.target.value })}
            />
          </Field>
          <Field label="Jenis">
            <select
              className="input"
              value={form.kind}
              onChange={(event) =>
                setForm({ ...form, kind: event.target.value as VideoReferenceRecord['kind'] })
              }
            >
              {Object.entries(KIND_LABEL).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Fungsi">
            <select
              className="input"
              value={form.role}
              onChange={(event) => setForm({ ...form, role: event.target.value as ReferenceRole })}
            >
              {Object.entries(ROLE_LABEL).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <Field
          label="URL berkas"
          hint="https://… (Drive publik/berbagi, CDN) atau local:/path/di/mesin/runner untuk berkas yang sudah ada di sandbox."
        >
          <input
            className="input"
            value={form.url}
            placeholder="https://drive.google.com/uc?export=download&id=… atau local:/home/ubuntu/work/refs/produk.jpg"
            onChange={(event) => setForm({ ...form, url: event.target.value })}
          />
        </Field>

        <div className="studio-row">
          <Field label="Kekuatan" hint={`${Math.round(form.strength * 100)}% — dipakai provider yang mendukung`}>
            <input
              className="input"
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={form.strength}
              onChange={(event) => setForm({ ...form, strength: Number(event.target.value) })}
            />
          </Field>
          <div className="row-end" style={{ alignSelf: 'end' }}>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => void add()} disabled={busy === 'new'}>
              <Plus size={14} /> {busy === 'new' ? 'Menyimpan…' : 'Tambah referensi'}
            </button>
          </div>
        </div>
      </div>

      {error ? <p className="detail-error">{error}</p> : null}
      {loading ? <p className="studio-hint">Memuat pustaka referensi…</p> : null}
      {!loading && library.length === 0 ? (
        <p className="studio-hint">
          Pustaka masih kosong. Tambahkan URL gambar/video/audio di atas — atau kirim berkasnya lewat Telegram, nanti
          saya taruh di mesin runner dan daftarkan dengan awalan <code>local:</code>.
        </p>
      ) : null}

      <div className="ref-grid">
        {library.map((record) => {
          const used = isUsed(record.id);
          const Icon = record.kind === 'image' ? ImageIcon : record.kind === 'video' ? Video : Music4;
          return (
            <div className={`ref-card${used ? ' is-used' : ''}`} key={record.id}>
              <div className="ref-thumb">
                {record.kind === 'image' ? (
                  <img src={record.url} alt={record.name} loading="lazy" />
                ) : record.kind === 'video' ? (
                  <video src={record.url} muted preload="metadata" playsInline />
                ) : (
                  <div className="ref-audio">
                    <Music4 size={18} />
                    <audio src={record.url} controls preload="none" />
                  </div>
                )}
              </div>

              <div className="ref-body">
                <div className="ref-title">
                  <Icon size={13} />
                  <strong>{record.name}</strong>
                </div>
                <div className="muted-small">
                  {KIND_LABEL[record.kind]} · {ROLE_LABEL[record.role]}
                  {record.width && record.height ? ` · ${record.width}×${record.height}` : ''}
                  {record.kind !== 'image' && record.durationMs
                    ? ` · ${(record.durationMs / 1000).toFixed(1)} s`
                    : ''}
                </div>

                {record.palette?.bg && record.palette?.accent ? (
                  <div className="ref-palette">
                    <span style={{ background: record.palette.bg }} title={record.palette.bg} />
                    <span style={{ background: record.palette.accent }} title={record.palette.accent} />
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => onApplyPalette(record.palette ?? {})}
                    >
                      <Wand2 size={12} /> Pakai warna ini
                    </button>
                  </div>
                ) : (
                  <div className="muted-small">Palet dihitung runner saat render pertama.</div>
                )}

                <input
                  className="input input-sm"
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={record.strength}
                  onChange={(event) => setStrength(record, Number(event.target.value))}
                  onPointerUp={() => persistStrength(record)}
                />

                <div className="ref-actions">
                  <button type="button" className={`btn btn-sm ${used ? 'btn-primary' : 'btn-ghost'}`} onClick={() => toggle(record)}>
                    {used ? 'Dipakai' : 'Pakai'}
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => void remove(record)}
                    disabled={busy === record.id}
                    aria-label={`Hapus ${record.name}`}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {selected.length > 0 ? (
        <p className="studio-hint">
          {selected.length} referensi dipakai job ini. Scene bergambar memakai referensi bertanda{' '}
          <em>Subjek</em>; musik memakai referensi bertanda <em>Musik latar</em>.
        </p>
      ) : null}
    </div>
  );
}
