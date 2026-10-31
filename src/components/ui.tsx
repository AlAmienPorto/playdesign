import {
  useEffect,
  useId,
  type ButtonHTMLAttributes,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn, initials, toneGradients } from "../lib/utils";

/* ---------------------------------- Avatar --------------------------------- */

const avatarSizes = {
  xs: "size-6 text-[9px]",
  sm: "size-7 text-[10px]",
  md: "size-8 text-[11px]",
  lg: "size-10 text-[12px]",
  xl: "size-14 text-base",
};

export function Avatar({
  name,
  tone = 0,
  size = "md",
  className,
  ring,
}: {
  name: string;
  tone?: number;
  size?: keyof typeof avatarSizes;
  className?: string;
  ring?: boolean;
}) {
  return (
    <span
      title={name}
      className={cn(
        "inline-flex shrink-0 select-none items-center justify-center rounded-full bg-gradient-to-br font-semibold tracking-wide text-white",
        toneGradients[tone % toneGradients.length],
        avatarSizes[size],
        ring && "ring-2 ring-surface",
        className,
      )}
    >
      {initials(name)}
    </span>
  );
}

export function AgentAvatar({
  size = "md",
  online = true,
  className,
}: {
  size?: "sm" | "md" | "lg" | "xl";
  online?: boolean;
  className?: string;
}) {
  const dims = {
    sm: "size-6 rounded-[7px]",
    md: "size-8 rounded-[9px]",
    lg: "size-10 rounded-[11px]",
    xl: "size-14 rounded-2xl",
  }[size];
  const icon = { sm: 11, md: 14, lg: 18, xl: 24 }[size];
  return (
    <span className={cn("relative inline-flex shrink-0", className)}>
      <span
        className={cn(
          "grid place-items-center bg-gradient-to-br from-[#d61c1c] via-[#bf0b0b] to-[#7a0505] text-white shadow-[0_6px_18px_-6px_rgba(191,11,11,0.7)]",
          dims,
        )}
      >
        <svg width={icon} height={icon} viewBox="0 0 24 24" fill="none" aria-hidden>
          <path
            d="M12 2.5c.5 4.9 2.6 7 7.5 7.5-4.9.5-7 2.6-7.5 7.5-.5-4.9-2.6-7-7.5-7.5 4.9-.5 7-2.6 7.5-7.5Z"
            fill="currentColor"
          />
          <circle cx="18.5" cy="18" r="2" fill="currentColor" opacity=".75" />
        </svg>
      </span>
      {online && (
        <span className="absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full border-2 border-surface bg-[#2fbf8f]">
          <span className="absolute inset-0 animate-ping rounded-full bg-[#2fbf8f] opacity-40" />
        </span>
      )}
    </span>
  );
}

/* ---------------------------------- Badge ---------------------------------- */

type BadgeTone = "accent" | "success" | "warning" | "info" | "neutral" | "outline";

const badgeTones: Record<BadgeTone, string> = {
  accent: "bg-accent-soft text-accent-text",
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  info: "bg-info-soft text-info",
  neutral: "bg-surface-3 text-muted",
  outline: "border border-line text-muted",
};

export function Badge({
  children,
  tone = "neutral",
  dot,
  className,
}: {
  children: ReactNode;
  tone?: BadgeTone;
  dot?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium leading-5",
        badgeTones[tone],
        className,
      )}
    >
      {dot && <span className="size-1.5 rounded-full bg-current opacity-80" />}
      {children}
    </span>
  );
}

/* ---------------------------------- Button --------------------------------- */

type ButtonVariant = "primary" | "secondary" | "outline" | "ghost" | "soft";

const buttonVariants: Record<ButtonVariant, string> = {
  primary:
    "bg-accent text-accent-contrast shadow-[0_1px_0_rgba(255,255,255,0.12)_inset,0_8px_20px_-10px_rgba(191,11,11,0.65)] hover:bg-accent-hover",
  secondary: "bg-surface-3 text-ink hover:bg-line",
  outline: "border border-line bg-transparent text-ink hover:bg-surface-2",
  ghost: "text-muted hover:bg-surface-3 hover:text-ink",
  soft: "bg-accent-soft text-accent-text hover:bg-accent-soft/70",
};

const buttonSizes = {
  sm: "h-8 gap-1.5 rounded-lg px-2.5 text-xs",
  md: "h-9 gap-2 rounded-[10px] px-3.5 text-[13px]",
  lg: "h-10 gap-2 rounded-xl px-4 text-sm",
  icon: "size-9 rounded-[10px]",
};

export function Button({
  children,
  variant = "secondary",
  size = "md",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: keyof typeof buttonSizes;
}) {
  return (
    <button
      className={cn(
        "inline-flex select-none items-center justify-center font-medium transition-colors active:translate-y-px disabled:pointer-events-none disabled:opacity-50",
        buttonVariants[variant],
        buttonSizes[size],
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export function IconButton({
  children,
  className,
  label,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      aria-label={label}
      title={label}
      className={cn(
        "grid size-9 shrink-0 place-items-center rounded-[10px] text-muted transition-colors hover:bg-surface-3 hover:text-ink",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

/* --------------------------------- Segmented -------------------------------- */

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  className,
  size = "md",
}: {
  options: { value: T; label: string; count?: number }[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
  size?: "sm" | "md";
}) {
  return (
    <div
      className={cn(
        "inline-flex items-center gap-0.5 rounded-[10px] border border-line bg-surface-2 p-0.5",
        className,
      )}
    >
      {options.map((option) => (
        <button
          key={option.value}
          onClick={() => onChange(option.value)}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-lg font-medium transition-colors",
            size === "sm" ? "h-7 px-2 text-[11px]" : "h-8 px-3 text-xs",
            value === option.value
              ? "bg-surface text-ink shadow-sm ring-1 ring-line"
              : "text-muted hover:text-ink",
          )}
        >
          {option.label}
          {option.count !== undefined && (
            <span
              className={cn(
                "rounded-md px-1 font-mono text-[10px]",
                value === option.value ? "bg-accent-soft text-accent-text" : "bg-surface-3 text-faint",
              )}
            >
              {option.count}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

/* ---------------------------------- Toggle --------------------------------- */

export function Toggle({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-[22px] w-[38px] shrink-0 items-center rounded-full transition-colors disabled:opacity-50",
        checked ? "bg-accent" : "bg-line-strong",
      )}
    >
      <span
        className={cn(
          "inline-block size-4 rounded-full bg-white shadow-sm transition-transform",
          checked ? "translate-x-[18px]" : "translate-x-[3px]",
        )}
      />
    </button>
  );
}

/* --------------------------------- Progress -------------------------------- */

export function ProgressBar({
  value,
  max = 100,
  className,
  tone = "accent",
  height = "h-1.5",
}: {
  value: number;
  max?: number;
  className?: string;
  tone?: "accent" | "success" | "warning" | "info";
  height?: string;
}) {
  const tones = {
    accent: "bg-accent",
    success: "bg-success",
    warning: "bg-warning",
    info: "bg-info",
  };
  return (
    <div className={cn("w-full overflow-hidden rounded-full bg-surface-3", height, className)}>
      <div
        className={cn("h-full rounded-full transition-[width] duration-500", tones[tone])}
        style={{ width: `${Math.min(100, (value / max) * 100)}%` }}
      />
    </div>
  );
}

/* --------------------------------- Gauge ----------------------------------- */

export function CircularGauge({
  value,
  size = 120,
  stroke = 8,
  label,
  sublabel,
  className,
}: {
  value: number;
  size?: number;
  stroke?: number;
  label?: ReactNode;
  sublabel?: string;
  className?: string;
}) {
  const radius = (size - stroke) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (value / 100) * circumference;
  return (
    <div className={cn("relative inline-grid place-items-center", className)} style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={stroke}
          className="stroke-surface-3"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="stroke-accent transition-[stroke-dashoffset] duration-700"
        />
      </svg>
      <div className="absolute inset-0 grid place-content-center text-center">
        <div className="font-mono text-xl font-medium tracking-tight text-ink">{label ?? `${value}%`}</div>
        {sublabel && <div className="mt-0.5 text-[10px] text-faint">{sublabel}</div>}
      </div>
    </div>
  );
}

/* --------------------------------- Sparkline -------------------------------- */

export function Sparkline({
  data,
  className,
  height = 32,
  width = 96,
  tone = "accent",
}: {
  data: number[];
  className?: string;
  height?: number;
  width?: number;
  tone?: "accent" | "success" | "warning" | "info";
}) {
  const gradientId = useId().replace(/:/g, "");
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const step = width / (data.length - 1);
  const points = data.map((value, index) => [index * step, height - 3 - ((value - min) / range) * (height - 8)]);
  const line = points.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`).join(" ");
  const area = `${line} L${width},${height} L0,${height} Z`;
  const stroke = {
    accent: "rgb(var(--accent))",
    success: "rgb(var(--success))",
    warning: "rgb(var(--warning))",
    info: "rgb(var(--info))",
  }[tone];

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className={cn("overflow-visible", className)}
      preserveAspectRatio="none"
      aria-hidden
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity="0.24" />
          <stop offset="100%" stopColor={stroke} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gradientId})`} />
      <path d={line} fill="none" stroke={stroke} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={points[points.length - 1][0]} cy={points[points.length - 1][1]} r="2.2" fill={stroke} />
    </svg>
  );
}

/* ---------------------------------- Modal ---------------------------------- */

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = "md",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: "sm" | "md" | "lg";
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [open, onClose]);

  const widths = { sm: "sm:max-w-md", md: "sm:max-w-xl", lg: "sm:max-w-2xl" };

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-end justify-center sm:items-center sm:p-6">
      <div
        className="absolute inset-0 animate-fade-in bg-black/55 backdrop-blur-[3px]"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn(
          "relative flex max-h-[92dvh] w-full animate-scale-in flex-col overflow-hidden rounded-t-3xl border border-line bg-surface shadow-float sm:rounded-2xl",
          widths[size],
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4 sm:px-6">
          <div>
            <h2 className="text-[15px] font-semibold tracking-tight text-ink">{title}</h2>
            {description && <p className="mt-0.5 text-xs text-muted">{description}</p>}
          </div>
          <IconButton label="Close dialog" onClick={onClose} className="-mr-2 -mt-1">
            <X size={16} />
          </IconButton>
        </div>
        <div className="overflow-y-auto px-5 py-5 sm:px-6">{children}</div>
        {footer && (
          <div className="flex items-center justify-end gap-2 border-t border-line bg-surface-2/60 px-5 py-3.5 sm:px-6">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

export function Drawer({
  open,
  onClose,
  children,
  title,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  title: string;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[80] flex justify-end">
      <div className="absolute inset-0 animate-fade-in bg-black/50 backdrop-blur-[2px]" onClick={onClose} />
      <aside
        aria-label={title}
        className="relative flex h-full w-full max-w-[440px] animate-slide-in flex-col overflow-y-auto border-l border-line bg-surface shadow-float"
      >
        {children}
      </aside>
    </div>,
    document.body,
  );
}

/* ---------------------------------- Field ---------------------------------- */

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
    <label className={cn("block", className)}>
      <span className="mb-1.5 flex items-center justify-between text-xs font-medium text-muted">
        {label}
        {hint && <span className="font-normal text-faint">{hint}</span>}
      </span>
      {children}
    </label>
  );
}

export const inputClass =
  "w-full rounded-[10px] border border-line bg-surface-2 px-3 py-2 text-[13px] text-ink placeholder:text-faint transition-colors focus:border-accent/50 focus:bg-surface focus:outline-none focus:ring-2 focus:ring-accent/15";

/* -------------------------------- PageHeader ------------------------------- */

export function PageHeader({
  eyebrow,
  title,
  description,
  children,
  className,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-7 flex flex-wrap items-end justify-between gap-4", className)}>
      <div>
        {eyebrow && <div className="overline mb-2">{eyebrow}</div>}
        <h1 className="text-[26px] font-semibold leading-tight tracking-[-0.02em] text-ink md:text-[30px]">
          {title}
        </h1>
        {description && <p className="mt-1.5 max-w-2xl text-[13px] leading-relaxed text-muted">{description}</p>}
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  );
}

/* ---------------------------------- Kbd ------------------------------------ */

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded border border-line bg-surface-2 px-1 font-mono text-[10px] font-medium text-faint">
      {children}
    </kbd>
  );
}
