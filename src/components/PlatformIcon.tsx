import { Mail, MessageSquare, type LucideIcon } from "lucide-react";
import type { ReactElement, SVGProps } from "react";
import type { Platform } from "../data/mock";
import { cn } from "../lib/utils";

function InstagramGlyph(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" {...props}>
      <rect width="20" height="20" x="2" y="2" rx="5" />
      <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
      <line x1="17.5" x2="17.51" y1="6.5" y2="6.5" />
    </svg>
  );
}

function LinkedInGlyph(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z" />
      <rect width="4" height="12" x="2" y="9" />
      <circle cx="4" cy="4" r="2" />
    </svg>
  );
}

function XGlyph(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231Zm-1.161 17.52h1.833L7.084 4.126H5.117Z" />
    </svg>
  );
}

function TikTokGlyph(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
      <path d="M12.53.02C13.84 0 15.14.01 16.44 0c.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07Z" />
    </svg>
  );
}

function YouTubeGlyph(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
      <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
    </svg>
  );
}

interface PlatformStyle {
  color: string;
  bg: string;
  glyph?: (props: SVGProps<SVGSVGElement>) => ReactElement;
  lucide?: LucideIcon;
}

const platformStyles: Record<Platform, PlatformStyle> = {
  Instagram: { color: "#f0629b", bg: "rgba(240,98,155,0.12)", glyph: InstagramGlyph },
  LinkedIn: { color: "#5aa2f0", bg: "rgba(90,162,240,0.12)", glyph: LinkedInGlyph },
  X: { color: "rgb(var(--fg))", bg: "rgb(var(--surface-3))", glyph: XGlyph },
  TikTok: { color: "#2fd3ba", bg: "rgba(47,211,186,0.12)", glyph: TikTokGlyph },
  YouTube: { color: "#ff5c5c", bg: "rgba(255,92,92,0.12)", glyph: YouTubeGlyph },
  Email: { color: "#e1a448", bg: "rgba(225,164,72,0.12)", lucide: Mail },
  "Web chat": { color: "#72a0ff", bg: "rgba(114,160,255,0.12)", lucide: MessageSquare },
};

const sizes = {
  sm: { box: "size-[22px] rounded-[6px]", icon: 12 },
  md: { box: "size-7 rounded-[8px]", icon: 14 },
  lg: { box: "size-9 rounded-[10px]", icon: 17 },
};

export function PlatformIcon({
  platform,
  size = "sm",
  className,
  bare,
}: {
  platform: Platform;
  size?: keyof typeof sizes;
  className?: string;
  bare?: boolean;
}) {
  const style = platformStyles[platform];
  const dims = sizes[size];
  const Glyph = "glyph" in style ? style.glyph : null;
  const Lucide = "lucide" in style ? style.lucide : null;

  return (
    <span
      title={platform}
      style={bare ? { color: style.color } : { color: style.color, backgroundColor: style.bg }}
      className={cn("inline-grid shrink-0 place-items-center", !bare && dims.box, className)}
    >
      {Glyph ? <Glyph width={dims.icon} height={dims.icon} /> : Lucide ? <Lucide size={dims.icon} strokeWidth={2} /> : null}
    </span>
  );
}
