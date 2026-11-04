import { useState } from 'react';
import { Link } from 'react-router-dom';
import { MessageSquareText, Plus, Save, ShieldCheck, Star, Trash2 } from 'lucide-react';
import { useStore } from '../store/store';
import { Badge, Card, EmptyState, Field, PageHead } from '../components/ui';
import { WhatsAppIcon } from '../components/icons';
import { cx, fillTemplate, relTime } from '../lib/utils';
import type { WaTemplate } from '../data/types';

const TEMPLATE_VARS = ['nama', 'perusahaan', 'jenis_usaha', 'sumber'] as const;

const PREVIEW_VARS: Record<string, string> = {
  nama: 'Sari Wulandari',
  perusahaan: 'Arunanta Travel',
  jenis_usaha: 'Travel Agent',
  sumber: 'Instagram',
};

export function CrmTemplates() {
  const { db, saveWaTemplate, deleteWaTemplate, setDefaultWaTemplate, toast } = useStore();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [body, setBody] = useState('');
  const selected = db.waTemplates.find((t) => t.id === editingId);

  const load = (template: WaTemplate) => {
    setEditingId(template.id);
    setName(template.name);
    setBody(template.body);
  };

  const startNew = () => {
    setEditingId(null);
    setName('');
    setBody('');
  };

  const save = () => {
    if (!name.trim() || !body.trim()) {
      toast('Nama dan isi template wajib diisi.', 'danger');
      return;
    }
    const id = saveWaTemplate({ id: editingId ?? undefined, name: name.trim(), body: body.trim() });
    setEditingId(id);
  };

  const insertVar = (key: string) =>
    setBody((prev) => `${prev}${prev && !prev.endsWith(' ') && !prev.endsWith('\n') ? ' ' : ''}{${key}}`);

  return (
    <>
      <PageHead
        kicker="CRM · Foundation"
        title="Template WA"
        desc="Template pesan untuk menghubungi lead lewat WhatsApp. Template hanya mengisi draf chat, pengiriman tetap manual."
        actions={
          <button type="button" className="btn btn-primary" onClick={startNew}>
            <Plus size={15} /> Template baru
          </button>
        }
      />

      <div className="grid-main">
        <Card
          className="span-4"
          title="Daftar template"
          sub={`${db.waTemplates.length} template · satu ditandai utama`}
          bodyClass="no-pad"
        >
          <div className="wa-template-list">
            {db.waTemplates.map((template) => (
              <button
                key={template.id}
                type="button"
                className={cx('wa-template-item', editingId === template.id && 'is-active')}
                onClick={() => load(template)}
              >
                <div className="wa-template-top">
                  <strong>{template.name}</strong>
                  {template.isDefault && <Badge tone="success">Utama</Badge>}
                </div>
                <p>{template.body}</p>
                <span className="wa-template-meta">
                  {relTime(template.updatedAt)} · {template.body.length} karakter
                </span>
              </button>
            ))}
            {db.waTemplates.length === 0 && (
              <EmptyState
                icon={<WhatsAppIcon size={20} />}
                title="Belum ada template"
                desc="Buat template pertama untuk dipakai di chat lead."
                action={
                  <button type="button" className="btn btn-primary btn-sm" onClick={startNew}>
                    <Plus size={14} /> Template baru
                  </button>
                }
              />
            )}
          </div>
        </Card>

        <Card
          className="span-8"
          title={selected ? 'Edit template' : 'Template baru'}
          sub="Gunakan variabel agar pesan menyesuaikan setiap lead."
          action={
            selected && !selected.isDefault ? (
              <button type="button" className="btn btn-ghost btn-xs" onClick={() => setDefaultWaTemplate(selected.id)}>
                <Star size={12} /> Jadikan utama
              </button>
            ) : undefined
          }
        >
          <div className="detail-stack">
            <div className="form-grid">
              <Field label="Nama template" className="span-2">
                <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Sapaan awal" />
              </Field>
              <Field label="Isi pesan" className="span-2" hint="Satu pesan pendek lebih mudah dibalas.">
                <textarea
                  className="input"
                  rows={7}
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder="Halo {nama}, saya dari playdesign…"
                />
              </Field>
            </div>

            <div className="wa-var-row">
              <span>Variabel</span>
              {TEMPLATE_VARS.map((key) => (
                <button key={key} type="button" className="wa-var-chip" onClick={() => insertVar(key)}>
                  {`{${key}}`}
                </button>
              ))}
            </div>

            <div className="wa-preview-block">
              <span className="detail-label">Pratinjau untuk lead contoh</span>
              <div className="wa-bubble">
                {body ? fillTemplate(body, PREVIEW_VARS) : 'Isi template untuk melihat pratinjau.'}
              </div>
            </div>

            <div className="detail-actions">
              <button type="button" className="btn btn-primary" onClick={save}>
                <Save size={14} /> Simpan template
              </button>
              {selected && (
                <button
                  type="button"
                  className="btn btn-danger-text"
                  onClick={() => {
                    deleteWaTemplate(selected.id);
                    startNew();
                  }}
                >
                  <Trash2 size={14} /> Hapus
                </button>
              )}
              <Link to="/crm/leads" className="btn btn-ghost">
                <MessageSquareText size={14} /> Buka leads
              </Link>
            </div>

            <div className="notice-inline">
              <ShieldCheck size={14} /> Tidak ada pesan yang dikirim otomatis. Tombol WA membuka draf berisi template, lalu kamu yang mengirim.
            </div>
          </div>
        </Card>
      </div>
    </>
  );
}
