import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { differenceInCalendarDays, format, parseISO } from "date-fns";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const TODAY = new Date();

export function dateAt(offsetDays: number) {
  const d = new Date(TODAY);
  d.setDate(d.getDate() + offsetDays);
  return format(d, "yyyy-MM-dd");
}

export function money(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

export function moneyCompact(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

export function number(value: number) {
  return new Intl.NumberFormat("en-US").format(value);
}

export function formatDay(dateISO: string, pattern = "MMM d") {
  return format(parseISO(dateISO), pattern);
}

export function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

export function dueMeta(dateISO: string) {
  const diff = differenceInCalendarDays(parseISO(dateISO), TODAY);
  if (diff === 0) return { label: "Today", overdue: false, soon: true };
  if (diff === 1) return { label: "Tomorrow", overdue: false, soon: true };
  if (diff === -1) return { label: "Yesterday", overdue: true, soon: false };
  if (diff < 0) return { label: `${Math.abs(diff)}d overdue`, overdue: true, soon: false };
  return { label: format(parseISO(dateISO), "MMM d"), overdue: false, soon: diff <= 3 };
}

export function timeAgo(dateISO: string) {
  const then = parseISO(dateISO).getTime();
  const mins = Math.max(1, Math.round((Date.now() - then) / 60000));
  if (mins < 60) return `${mins}m`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.round(hours / 24);
  return `${days}d`;
}

export const toneGradients = [
  "from-[#BF0B0B] to-[#7A0505]",
  "from-[#C9822E] to-[#8A5516]",
  "from-[#4E7C6A] to-[#2F5245]",
  "from-[#7A4D6B] to-[#523247]",
  "from-[#4A6B8A] to-[#2E4557]",
  "from-[#A65E4E] to-[#6F3A2F]",
  "from-[#4B4B55] to-[#2B2B33]",
] as const;

export function toneFor(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) % 997;
  return (hash % (toneGradients.length - 1)) + 1;
}
