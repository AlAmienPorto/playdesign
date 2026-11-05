export function LogoMark({
  size = 26,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      className={className}
      role="img"
      aria-label="Playdesign"
    >
      <g fill="currentColor">
        <path d="M42 29 L51 38 L25 93 L15 82 Z" />
        <path d="M40 16 L52 14 L81 66 L70 73 Z" />
        <path d="M32 68 L88 65 L82 79 L37 79 Z" />
      </g>
    </svg>
  );
}

export function Logo({ subtitle = true }: { subtitle?: boolean }) {
  return (
    <div className="logo">
      <LogoMark size={30} className="logo-mark" />
      <div className="logo-text">
        <span className="logo-word">playdesign</span>
        {subtitle && <span className="logo-sub">Business Operating System</span>}
      </div>
    </div>
  );
}
