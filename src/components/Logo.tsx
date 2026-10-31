const PATHS = [
  "M39.75 11.5 52.76 10.52 83.22 58.54 76.83 69.71Z",
  "M5.36 77.57 38.39 31.64 51.29 33.36 11.13 89.48Z",
  "M25.62 70.94 94.64 70.45 88.62 82.12 31.76 82.36Z",
];

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 100" className={className} role="img" aria-label="Playdesign" fill="currentColor">
      {PATHS.map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}
