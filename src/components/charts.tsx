import { useId } from 'react';
import { cx } from '../lib/utils';

const BRAND = '#d8212c';

export function Sparkline({
  data,
  width = 108,
  height = 34,
  tone = BRAND,
  fill = true,
}: {
  data: number[];
  width?: number;
  height?: number;
  tone?: string;
  fill?: boolean;
}) {
  const gid = useId().replace(/:/g, '');
  if (data.length < 2) return null;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const span = max - min || 1;
  const step = width / (data.length - 1);
  const points = data.map((v, i) => {
    const x = i * step;
    const y = height - 3 - ((v - min) / span) * (height - 8);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const line = points.join(' ');
  return (
    <svg viewBox={`0 0 ${width} ${height}`} width={width} height={height} className="spark" aria-hidden="true">
      <defs>
        <linearGradient id={`g-${gid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={tone} stopOpacity="0.22" />
          <stop offset="100%" stopColor={tone} stopOpacity="0" />
        </linearGradient>
      </defs>
      {fill && <polygon points={`0,${height} ${line} ${width},${height}`} fill={`url(#g-${gid})`} />}
      <polyline points={line} fill="none" stroke={tone} strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

export interface BarDatum {
  label: string;
  value: number;
  tone?: 'brand' | 'muted' | 'success' | 'warning';
}

export function MiniBars({ data, height = 112 }: { data: BarDatum[]; height?: number }) {
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <div className="mini-bars" style={{ height }}>
      {data.map((d, i) => (
        <div className="mini-bar-col" key={`${d.label}-${i}`} title={`${d.label}: ${d.value}`}>
          <div className="mini-bar-track">
            <div
              className={cx('mini-bar-fill', d.tone && `tone-${d.tone}`)}
              style={{ height: `${Math.max(6, (d.value / max) * 100)}%` }}
            />
          </div>
          <span className="mini-bar-label">{d.label}</span>
        </div>
      ))}
    </div>
  );
}

export interface Slice {
  label: string;
  value: number;
  color: string;
}

export function Donut({
  slices,
  size = 156,
  thickness = 15,
  centerTop,
  centerBottom,
}: {
  slices: Slice[];
  size?: number;
  thickness?: number;
  centerTop?: string;
  centerBottom?: string;
}) {
  const total = slices.reduce((sum, s) => sum + s.value, 0);
  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;
  return (
    <div className="donut" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--line)"
          strokeWidth={thickness}
        />
        {slices.map((s) => {
          const length = total ? (s.value / total) * circumference : 0;
          const dash = `${Math.max(0, length - 3)} ${circumference}`;
          const rotation = (offset / (total || 1)) * 360 - 90;
          offset += s.value;
          return (
            <circle
              key={s.label}
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke={s.color}
              strokeWidth={thickness}
              strokeDasharray={dash}
              strokeLinecap="round"
              transform={`rotate(${rotation} ${size / 2} ${size / 2})`}
            />
          );
        })}
      </svg>
      <div className="donut-center">
        {centerTop && <strong>{centerTop}</strong>}
        {centerBottom && <span>{centerBottom}</span>}
      </div>
    </div>
  );
}
