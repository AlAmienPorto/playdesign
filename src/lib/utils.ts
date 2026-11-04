export const cx = (...parts: Array<string | false | null | undefined>) =>
  parts.filter(Boolean).join(' ');

let counter = 0;
export const uid = (prefix: string) => {
  counter += 1;
  return `${prefix}-${Date.now().toString(36).slice(-4)}${counter}`;
};

export const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');

export const compactRupiah = (value: number) => {
  if (value >= 1_000_000_000) return `Rp ${trim(value / 1_000_000_000)} M`;
  if (value >= 1_000_000) return `Rp ${trim(value / 1_000_000)} jt`;
  if (value >= 1_000) return `Rp ${trim(value / 1_000)} rb`;
  return `Rp ${value}`;
};

export const rupiah = (value: number) =>
  new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(
    value,
  );

const trim = (n: number) => {
  const rounded = Math.round(n * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : String(rounded).replace('.', ',');
};

export const num = (value: number) => new Intl.NumberFormat('id-ID').format(value);

export const waLink = (phone: string, message?: string) => {
  const digits = phone.replace(/\D/g, '');
  const intl = digits.startsWith('0') ? `62${digits.slice(1)}` : digits;
  return `https://wa.me/${intl}${message ? `?text=${encodeURIComponent(message)}` : ''}`;
};

export const fillTemplate = (body: string, vars: Record<string, string>) =>
  body.replace(/\{(\w+)\}/g, (match, key: string) => vars[key] ?? match);

export const pct = (value: number) => `${Math.round(value)}%`;

export const fmtDate = (iso: string, withYear = false) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('id-ID', {
    day: '2-digit',
    month: 'short',
    ...(withYear ? { year: 'numeric' } : {}),
  }).format(d);
};

export const fmtLongDate = (iso: string) =>
  new Intl.DateTimeFormat('id-ID', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(iso));

export const fmtTime = (iso: string) =>
  new Intl.DateTimeFormat('id-ID', { hour: '2-digit', minute: '2-digit' }).format(new Date(iso));

export const relTime = (iso: string) => {
  const d = new Date(iso).getTime();
  const diff = Date.now() - d;
  const mins = Math.round(diff / 60000);
  if (mins < 1) return 'baru saja';
  if (mins < 60) return `${mins} mnt lalu`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} jam lalu`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} hari lalu`;
  return fmtDate(iso, true);
};

export const dayOffset = (offset: number, hour = 9) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
};

export const addDays = (iso: string, days: number) => {
  const d = new Date(iso);
  d.setDate(d.getDate() + days);
  return d.toISOString();
};

export const sameDay = (a: string | Date, b: string | Date) => {
  const x = new Date(a);
  const y = new Date(b);
  return (
    x.getFullYear() === y.getFullYear() && x.getMonth() === y.getMonth() && x.getDate() === y.getDate()
  );
};

export const monthLabel = (date: Date) =>
  new Intl.DateTimeFormat('id-ID', { month: 'long', year: 'numeric' }).format(date);

export const toISODate = (date: Date) => {
  const d = new Date(date);
  d.setHours(12, 0, 0, 0);
  return d.toISOString();
};

export const downloadJSON = (filename: string, payload: unknown) => {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
};

export const avatarTone = (name: string) => {
  const hues = [4, 22, 350, 168, 210, 34, 268, 12];
  let sum = 0;
  for (let i = 0; i < name.length; i += 1) sum += name.charCodeAt(i);
  return hues[sum % hues.length];
};

export const roleLabel: Record<string, string> = {
  Owner: 'Owner',
  Admin: 'Admin',
  Editor: 'Editor',
  Reviewer: 'Reviewer',
  Operator: 'Operator',
  Agent: 'Agent',
};

export const articleStatusLabel: Record<string, string> = {
  draft: 'Draft',
  in_review: 'Review',
  approved: 'Approved',
  scheduled: 'Terjadwal',
  published: 'Terbit',
  archived: 'Arsip',
};

export const deliveryLabel: Record<string, string> = {
  queued: 'Queued',
  scheduled: 'Scheduled',
  published: 'Published',
  failed: 'Failed',
  cancelled: 'Cancelled',
  delivery_uncertain: 'Delivery uncertain',
};

export const jobStatusLabel: Record<string, string> = {
  queued: 'Queued',
  running: 'Running',
  completed: 'Completed',
  failed: 'Failed',
  cancelled: 'Cancelled',
  delivery_uncertain: 'Delivery uncertain',
};

export const dealStageLabel: Record<string, string> = {
  new: 'Baru',
  qualified: 'Terkualifikasi',
  proposal: 'Proposal',
  negotiation: 'Negosiasi',
  won: 'Menang',
  lost: 'Kalah',
};

export const orderBy = <T,>(list: T[], get: (item: T) => string | number, dir: 'asc' | 'desc' = 'desc') => {
  const sorted = [...list].sort((a, b) => {
    const av = get(a);
    const bv = get(b);
    if (typeof av === 'number' && typeof bv === 'number') return av - bv;
    return String(av).localeCompare(String(bv), 'id');
  });
  return dir === 'desc' ? sorted.reverse() : sorted;
};
