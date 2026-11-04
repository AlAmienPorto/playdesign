import { useEffect, useState } from 'react';
import { LEAD_BUSINESS_TYPES, type LeadBusinessType, type LeadSource } from '../data/types';
import { useStore } from '../store/store';
import { Field, Modal } from './ui';

const tomorrow = (offset = 7) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toISOString().slice(0, 10);
};

export function TaskComposer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { db, addTask, toast } = useStore();
  const [title, setTitle] = useState('');
  const [assigneeId, setAssigneeId] = useState(db.users[0]?.id ?? '');
  const [priority, setPriority] = useState<'Tinggi' | 'Sedang' | 'Rendah'>('Sedang');
  const [due, setDue] = useState(tomorrow());
  const [projectId, setProjectId] = useState('');
  const [tags, setTags] = useState('');

  useEffect(() => {
    if (open) {
      setTitle('');
      setAssigneeId(db.users[0]?.id ?? '');
      setPriority('Sedang');
      setDue(tomorrow());
      setProjectId('');
      setTags('');
    }
  }, [open, db.users]);

  const submit = () => {
    if (!title.trim()) {
      toast('Judul tugas wajib diisi.', 'danger');
      return;
    }
    addTask({
      title: title.trim(),
      assigneeId,
      priority,
      due: new Date(`${due}T17:00:00`).toISOString(),
      projectId: projectId || undefined,
      tags: tags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean),
    });
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Tugas baru"
      sub="Tugas masuk ke Task Board dan terlihat oleh tim."
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Batal
          </button>
          <button type="button" className="btn btn-primary" onClick={submit}>
            Buat tugas
          </button>
        </>
      }
    >
      <div className="form-grid">
        <Field label="Judul tugas" className="span-2">
          <input
            className="input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Contoh: Finalisasi deck Sagara"
            autoFocus
          />
        </Field>
        <Field label="Penanggung jawab">
          <select className="input" value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)}>
            {db.users
              .filter((u) => u.status === 'Aktif')
              .map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
          </select>
        </Field>
        <Field label="Prioritas">
          <select className="input" value={priority} onChange={(e) => setPriority(e.target.value as typeof priority)}>
            <option>Tinggi</option>
            <option>Sedang</option>
            <option>Rendah</option>
          </select>
        </Field>
        <Field label="Jatuh tempo">
          <input type="date" className="input" value={due} onChange={(e) => setDue(e.target.value)} />
        </Field>
        <Field label="Proyek">
          <select className="input" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
            <option value="">Tanpa proyek</option>
            {db.projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Tag" hint="Pisahkan dengan koma." className="span-2">
          <input className="input" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="Brand, Presentasi" />
        </Field>
      </div>
    </Modal>
  );
}

const SOURCES: LeadSource[] = ['Website', 'Referral', 'Instagram', 'LinkedIn', 'Event', 'Outbound'];

export function LeadComposer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { addLead, user, toast } = useStore();
  const [name, setName] = useState('');
  const [company, setCompany] = useState('');
  const [phone, setPhone] = useState('');
  const [businessType, setBusinessType] = useState<LeadBusinessType>('UMKM');
  const [source, setSource] = useState<LeadSource>('Website');
  const [value, setValue] = useState('');
  const [note, setNote] = useState('');

  useEffect(() => {
    if (open) {
      setName('');
      setCompany('');
      setPhone('');
      setBusinessType('UMKM');
      setSource('Website');
      setValue('');
      setNote('');
    }
  }, [open]);

  const submit = () => {
    if (!name.trim() || !company.trim() || !phone.trim()) {
      toast('Nama, perusahaan, dan nomor WA wajib diisi.', 'danger');
      return;
    }
    addLead({
      name: name.trim(),
      company: company.trim(),
      phone: phone.trim(),
      businessType,
      source,
      value: Number(value) || 0,
      ownerId: user.id,
      note: note.trim() || undefined,
    });
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Lead baru"
      sub="Lead masuk dengan status Baru dan bisa dikonversi menjadi deal."
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Batal
          </button>
          <button type="button" className="btn btn-primary" onClick={submit}>
            Simpan lead
          </button>
        </>
      }
    >
      <div className="form-grid">
        <Field label="Nama kontak">
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Nama lengkap" autoFocus />
        </Field>
        <Field label="Perusahaan">
          <input className="input" value={company} onChange={(e) => setCompany(e.target.value)} placeholder="Nama perusahaan" />
        </Field>
        <Field label="Nomor WA" hint="Format 08xx atau +62.">
          <input className="input" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="0812 3456 7890" inputMode="tel" />
        </Field>
        <Field label="Jenis usaha">
          <select className="input" value={businessType} onChange={(e) => setBusinessType(e.target.value as LeadBusinessType)}>
            {LEAD_BUSINESS_TYPES.map((type) => (
              <option key={type}>{type}</option>
            ))}
          </select>
        </Field>
        <Field label="Sumber">
          <select className="input" value={source} onChange={(e) => setSource(e.target.value as LeadSource)}>
            {SOURCES.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </Field>
        <Field label="Estimasi nilai (opsional)" hint="Dipakai saat lead dikonversi menjadi deal.">
          <input type="number" min={0} className="input" value={value} onChange={(e) => setValue(e.target.value)} placeholder="120000000" />
        </Field>
        <Field label="Catatan" className="span-2">
          <textarea className="input" rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Kebutuhan, batas waktu, konteks…" />
        </Field>
      </div>
    </Modal>
  );
}

export function ReasonDialog({
  open,
  onClose,
  title,
  desc,
  confirmLabel = 'Simpan',
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  desc: string;
  confirmLabel?: string;
  onSubmit: (reason: string) => void;
}) {
  const [reason, setReason] = useState('');
  const { toast } = useStore();
  useEffect(() => {
    if (open) setReason('');
  }, [open]);
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      sub={desc}
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Batal
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              if (!reason.trim()) {
                toast('Alasan wajib diisi.', 'danger');
                return;
              }
              onSubmit(reason.trim());
              onClose();
            }}
          >
            {confirmLabel}
          </button>
        </>
      }
    >
      <Field label="Alasan" hint="Alasan masuk ke audit trail dan tidak bisa dikosongkan.">
        <textarea
          className="input"
          rows={4}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Tulis alasan keputusan…"
          autoFocus
        />
      </Field>
    </Modal>
  );
}
