import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import {
  AlertTriangle,
  ArrowUpRight,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Info,
  Search,
  X,
  XCircle,
} from 'lucide-react';
import { NavLink } from 'react-router-dom';
import { cx, initials, avatarTone } from '../lib/utils';
import { useStore } from '../store/store';

type Tone = 'brand' | 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'violet';

export function Badge({
  children,
  tone = 'neutral',
  dot = false,
  className,
}: {
  children: ReactNode;
  tone?: Tone;
  dot?: boolean;
  className?: string;
}) {
  return (
    <span className={cx('badge', `tone-${tone}`, className)}>
      {dot && <i className="badge-dot" aria-hidden="true" />}
      {children}
    </span>
  );
}

const moduleTone: Record<string, Tone> = {
  Live: 'success',
  Foundation: 'info',
  Planned: 'neutral',
  'Needs setup': 'warning',
};

export function StatusPill({ status }: { status: string }) {
  return (
    <Badge tone={moduleTone[status] ?? 'neutral'} dot>
      {status}
    </Badge>
  );
}

const badgeMap: Record<string, Tone> = {
  published: 'success',
  Terbit: 'success',
  Disetujui: 'success',
  Sehat: 'success',
  Aktif: 'success',
  Terhubung: 'success',
  Selesai: 'success',
  Won: 'success',
  approved: 'info',
  Completed: 'success',
  Published: 'success',
  Scheduled: 'info',
  scheduled: 'info',
  in_review: 'warning',
  Menunggu: 'warning',
  'Minta Revisi': 'warning',
  Perhatian: 'warning',
  Dijeda: 'warning',
  'Needs setup': 'warning',
  'Review klien': 'warning',
  queued: 'neutral',
  Draft: 'neutral',
  draft: 'neutral',
  Idle: 'neutral',
  'Belum aktif': 'neutral',
  archived: 'neutral',
  Baru: 'brand',
  Tertarik: 'brand',
  'Terkualifikasi': 'violet',
  qualified: 'violet',
  proposal: 'info',
  negotiation: 'warning',
  failed: 'danger',
  Failed: 'danger',
  Kalah: 'danger',
  lost: 'danger',
  Risiko: 'danger',
  Error: 'danger',
  Spam: 'danger',
  cancelled: 'neutral',
  delivery_uncertain: 'danger',
  running: 'info',
  'Review internal': 'info',
  'Review': 'info',
  'Diundang': 'info',
};

export function AutoBadge({ value }: { value: string }) {
  const tone = badgeMap[value] ?? 'neutral';
  return <Badge tone={tone}>{value}</Badge>;
}

export function TaskPriorityBadge({ priority }: { priority: 'Tinggi' | 'Sedang' | 'Rendah' }) {
  const tone = priority === 'Tinggi' ? 'danger' : priority === 'Sedang' ? 'warning' : 'neutral';
  return (
    <Badge tone={tone} dot>
      {priority}
    </Badge>
  );
}

export function PageHead({
  kicker,
  title,
  desc,
  actions,
  children,
}: {
  kicker?: ReactNode;
  title: ReactNode;
  desc?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <header className="page-head">
      <div className="page-head-row">
        <div className="page-head-main">
          {kicker && <div className="page-kicker">{kicker}</div>}
          <h1 className="page-title">{title}</h1>
          {desc && <p className="page-desc">{desc}</p>}
        </div>
        {actions && <div className="head-actions">{actions}</div>}
      </div>
      {children}
    </header>
  );
}

export function Card({
  title,
  sub,
  action,
  children,
  className,
  bodyClass,
  id,
}: {
  title?: ReactNode;
  sub?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClass?: string;
  id?: string;
}) {
  return (
    <section className={cx('pd-card', className)} id={id}>
      {(title || action) && (
        <div className="card-head">
          <div>
            {title && <h2 className="card-title">{title}</h2>}
            {sub && <p className="card-sub">{sub}</p>}
          </div>
          {action && <div className="card-action">{action}</div>}
        </div>
      )}
      <div className={cx('card-body', bodyClass)}>{children}</div>
    </section>
  );
}

export function Fig({
  label,
  value,
  hint,
  icon,
  delta,
  deltaTone = 'success',
  spark,
  onClick,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon?: ReactNode;
  delta?: string;
  deltaTone?: 'success' | 'danger' | 'neutral';
  spark?: ReactNode;
  onClick?: () => void;
}) {
  const content = (
    <>
      <div className="fig-top">
        <span className="fig-label">{label}</span>
        {icon && <span className="fig-icon">{icon}</span>}
      </div>
      <div className="fig-value">{value}</div>
      <div className="fig-bottom">
        <div className="fig-meta">
          {delta && <span className={cx('fig-delta', `is-${deltaTone}`)}>{delta}</span>}
          {hint && <span className="fig-hint">{hint}</span>}
        </div>
        {spark && <div className="fig-spark">{spark}</div>}
      </div>
    </>
  );
  if (onClick) {
    return (
      <button type="button" className="fig fig-clickable" onClick={onClick}>
        {content}
      </button>
    );
  }
  return <div className="fig">{content}</div>;
}

export function Tabs({
  items,
  value,
  onChange,
  label,
}: {
  items: Array<{ key: string; label: string; count?: number }>;
  value: string;
  onChange: (key: string) => void;
  label?: string;
}) {
  return (
    <div className="tabs" role="tablist" aria-label={label ?? 'Filter status'}>
      {items.map((item) => (
        <button
          key={item.key}
          type="button"
          role="tab"
          aria-selected={value === item.key}
          className={cx('tab', value === item.key && 'active')}
          onClick={() => onChange(item.key)}
        >
          {item.label}
          {item.count !== undefined && <span className="tab-count">{item.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function Toolbar({ children }: { children: ReactNode }) {
  return <div className="toolbar">{children}</div>;
}

export function SearchField({
  value,
  onChange,
  placeholder = 'Cari…',
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
}) {
  return (
    <div className={cx('search-field', className)}>
      <Search size={15} aria-hidden="true" />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
      />
      {value && (
        <button type="button" className="search-clear" onClick={() => onChange('')} aria-label="Bersihkan pencarian">
          <X size={13} />
        </button>
      )}
    </div>
  );
}

export function SelectBox({
  value,
  onChange,
  options,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>;
  label: string;
}) {
  return (
    <label className="select-box">
      <span className="sr-only">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} aria-label={label}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function Field({
  label,
  hint,
  children,
  className,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={cx('field', className)}>
      <span className="field-label">{label}</span>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  );
}

export function Pager({
  page,
  pageCount,
  total,
  pageSize,
  onChange,
}: {
  page: number;
  pageCount: number;
  total: number;
  pageSize: number;
  onChange: (p: number) => void;
}) {
  if (total === 0) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  return (
    <div className="pager">
      <span className="pager-info">
        {from}–{to} dari {total}
      </span>
      <div className="pager-controls">
        <button type="button" className="icon-btn" onClick={() => onChange(page - 1)} disabled={page <= 1} aria-label="Halaman sebelumnya">
          <ChevronLeft size={16} />
        </button>
        <span className="pager-page">
          {page} / {Math.max(pageCount, 1)}
        </span>
        <button type="button" className="icon-btn" onClick={() => onChange(page + 1)} disabled={page >= pageCount} aria-label="Halaman berikutnya">
          <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  desc,
  action,
  compact,
}: {
  icon?: ReactNode;
  title: string;
  desc?: ReactNode;
  action?: ReactNode;
  compact?: boolean;
}) {
  return (
    <div className={cx('empty', compact && 'empty-compact')}>
      {icon && <div className="empty-icon">{icon}</div>}
      <h3>{title}</h3>
      {desc && <p>{desc}</p>}
      {action && <div className="empty-action">{action}</div>}
    </div>
  );
}

export function Drawer({
  open,
  onClose,
  title,
  sub,
  children,
  footer,
  width = 520,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  sub?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  width?: number;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    document.body.classList.add('no-scroll');
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.classList.remove('no-scroll');
    };
  }, [open, onClose]);

  if (!open) return null;
  return createPortal(
    <div className="overlay" onMouseDown={onClose}>
      <aside
        className="drawer"
        style={{ maxWidth: width }}
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === 'string' ? title : 'Detail'}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="drawer-head">
          <div>
            <h2 className="drawer-title">{title}</h2>
            {sub && <p className="drawer-sub">{sub}</p>}
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Tutup panel">
            <X size={17} />
          </button>
        </div>
        <div className="drawer-body">{children}</div>
        {footer && <div className="drawer-foot">{footer}</div>}
      </aside>
    </div>,
    document.body,
  );
}

export function Modal({
  open,
  onClose,
  title,
  sub,
  children,
  footer,
  wide,
  width,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  sub?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
  width?: number;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    document.body.classList.add('no-scroll');
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.classList.remove('no-scroll');
    };
  }, [open, onClose]);

  if (!open) return null;
  return createPortal(
    <div className="overlay overlay-center" onMouseDown={onClose}>
      <div
        className={cx('modal', wide && 'modal-wide')}
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === 'string' ? title : 'Formulir'}
        style={width ? { maxWidth: width } : undefined}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <div>
            <h2>{title}</h2>
            {sub && <p>{sub}</p>}
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Tutup">
            <X size={17} />
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

export function Avatar({ name, size = 30, className }: { name: string; size?: number; className?: string }) {
  const hue = avatarTone(name);
  return (
    <span
      className={cx('avatar', className)}
      style={{
        width: size,
        height: size,
        fontSize: Math.max(9, Math.round(size * 0.35)),
        background: `hsl(${hue} 62% 93%)`,
        color: `hsl(${hue} 48% 33%)`,
      }}
      title={name}
      aria-hidden="true"
    >
      {initials(name)}
    </span>
  );
}

export function AvatarStack({ names, max = 4 }: { names: string[]; max?: number }) {
  const shown = names.slice(0, max);
  return (
    <span className="avatar-stack">
      {shown.map((n) => (
        <Avatar key={n} name={n} size={24} />
      ))}
      {names.length > max && <span className="avatar-more">+{names.length - max}</span>}
    </span>
  );
}

export function Progress({
  value,
  tone = 'brand',
  thin,
}: {
  value: number;
  tone?: 'brand' | 'success' | 'warning' | 'danger';
  thin?: boolean;
}) {
  return (
    <div
      className={cx('progress', thin && 'progress-thin')}
      role="progressbar"
      aria-valuenow={Math.round(value)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <span className={`tone-${tone}`} style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
    </div>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className={cx('toggle', checked && 'is-on')}
      onClick={() => onChange(!checked)}
    >
      <span />
    </button>
  );
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="section-title">
      <h2>{children}</h2>
      {action}
    </div>
  );
}

export function LinkButton({ to, children }: { to: string; children: ReactNode }) {
  return (
    <NavLink to={to} className="link-cta">
      {children}
      <ArrowUpRight size={13} />
    </NavLink>
  );
}

export function Toasts() {
  const { toasts, dismissToast } = useStore();
  return createPortal(
    <div className="toast-host" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={cx('toast', `toast-${t.tone}`)}>
          <span className="toast-icon">
            {t.tone === 'success' ? (
              <CheckCircle2 size={16} />
            ) : t.tone === 'danger' ? (
              <XCircle size={16} />
            ) : t.tone === 'warning' ? (
              <AlertTriangle size={16} />
            ) : (
              <Info size={16} />
            )}
          </span>
          <span className="toast-msg">{t.message}</span>
          <button type="button" onClick={() => dismissToast(t.id)} aria-label="Tutup notifikasi">
            <X size={13} />
          </button>
        </div>
      ))}
    </div>,
    document.body,
  );
}

export function CheckMark({ yes }: { yes: boolean }) {
  return yes ? (
    <span className="check-yes" aria-label="Ya">
      <Check size={15} />
    </span>
  ) : (
    <span className="check-no" aria-label="Tidak">
      <X size={14} />
    </span>
  );
}

export function KeyHint({ children = '⌘K' }: { children?: ReactNode }) {
  return <kbd className="kbd">{children}</kbd>;
}
