import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  AlertCircle,
  Bell,
  CalendarDays,
  Menu,
  Moon,
  Search,
  ShieldCheck,
  Sparkles,
  Sun,
  TrendingUp,
} from "lucide-react";
import { AgentAvatar, Avatar, IconButton, Kbd } from "../ui";
import { useTheme } from "../../lib/theme";
import { useStore } from "../../lib/store";
import type { AppNotification } from "../../data/office";
import { cn } from "../../lib/utils";
import { Brand } from "./Sidebar";

const kindStyles: Record<AppNotification["kind"], { icon: typeof Sparkles; className: string }> = {
  ai: { icon: Sparkles, className: "bg-accent-soft text-accent-text" },
  deal: { icon: TrendingUp, className: "bg-success-soft text-success" },
  post: { icon: CalendarDays, className: "bg-info-soft text-info" },
  task: { icon: AlertCircle, className: "bg-warning-soft text-warning" },
  approval: { icon: ShieldCheck, className: "bg-accent-soft text-accent-text" },
};

const timeLabel = (time: string) => (time === "just now" ? time : `${time} ago`);

export function Topbar({ onMenu, onSearch }: { onMenu: () => void; onSearch: () => void }) {
  const { resolved, toggleTheme } = useTheme();
  const { notifications, agents, autopilot, markNotificationRead, markAllNotificationsRead, workspace } = useStore();
  const navigate = useNavigate();
  const [panelOpen, setPanelOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const unread = notifications.filter((item) => item.unread).length;
  const leadAgent = agents[0];

  useEffect(() => {
    if (!panelOpen) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!panelRef.current?.contains(event.target as Node)) setPanelOpen(false);
    };
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && setPanelOpen(false);
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [panelOpen]);

  const openNotification = (item: AppNotification) => {
    markNotificationRead(item.id);
    setPanelOpen(false);
    navigate(item.href);
  };

  return (
    <header className="sticky top-0 z-30 flex h-[60px] items-center gap-2 border-b border-line bg-bg/80 px-4 backdrop-blur-xl md:px-6 lg:px-8">
      <IconButton label="Open navigation" onClick={onMenu} className="-ml-1.5 lg:hidden">
        <Menu size={18} />
      </IconButton>
      <div className="lg:hidden">
        <Brand compact />
      </div>

      <button
        onClick={onSearch}
        className="hidden h-9 w-full max-w-[300px] items-center gap-2.5 rounded-[10px] border border-line bg-surface px-3 text-left text-[12.5px] text-faint transition-colors hover:border-line-strong hover:text-muted md:flex"
      >
        <Search size={15} className="text-faint" />
        <span className="flex-1">Cari apa saja…</span>
        <span className="flex items-center gap-1">
          <Kbd>⌘</Kbd>
          <Kbd>K</Kbd>
        </span>
      </button>

      <div className="ml-auto flex items-center gap-1">
        <Link
          to="/agent"
          className="mr-1 hidden items-center gap-2 rounded-full border border-line bg-surface py-1 pl-1 pr-2.5 xl:flex"
        >
          <AgentAvatar size="sm" online={autopilot && leadAgent?.availability !== "unavailable"} />
          <span className="text-[11px] font-medium text-ink">{leadAgent?.name ?? "Agen"}</span>
          <span className="h-3 w-px bg-line" />
          <span className="flex items-center gap-1.5 text-[10.5px] text-muted">
            <span className={cn("size-1.5 rounded-full", autopilot ? "bg-[#2fbf8f]" : "bg-line-strong")} />
            {autopilot ? "Autopilot aktif" : "Dijeda"}
          </span>
        </Link>

        <IconButton label="Cari" onClick={onSearch} className="md:hidden">
          <Search size={17} />
        </IconButton>

        <IconButton
          label={resolved === "dark" ? "Ganti ke mode terang" : "Ganti ke mode gelap"}
          onClick={toggleTheme}
        >
          {resolved === "dark" ? <Sun size={17} /> : <Moon size={17} />}
        </IconButton>

        <div className="relative" ref={panelRef}>
          <IconButton
            label="Notifikasi"
            onClick={() => setPanelOpen((current) => !current)}
            className={cn(panelOpen && "bg-surface-3 text-ink")}
          >
            <Bell size={17} />
            {unread > 0 && (
              <span className="absolute right-[9px] top-[9px] size-[7px] rounded-full bg-accent ring-2 ring-bg" />
            )}
          </IconButton>

          {panelOpen && (
            <div className="absolute right-0 top-11 w-[min(360px,calc(100vw-2rem))] animate-scale-in overflow-hidden rounded-xl border border-line bg-surface shadow-float">
              <div className="flex items-center justify-between border-b border-line px-4 py-3">
                <div className="flex items-center gap-2">
                  <h3 className="text-[13px] font-semibold text-ink">Notifikasi</h3>
                  {unread > 0 && (
                    <span className="rounded-full bg-accent px-1.5 font-mono text-[9px] leading-4 text-white">
                      {unread}
                    </span>
                  )}
                  <span className="font-mono text-[9px] uppercase tracking-[0.1em] text-faint">{workspace.name}</span>
                </div>
                <button
                  onClick={markAllNotificationsRead}
                  className="text-[11px] font-medium text-muted transition-colors hover:text-ink"
                >
                  Tandai semua dibaca
                </button>
              </div>
              <div className="max-h-[360px] overflow-y-auto p-1.5">
                {notifications.map((item) => {
                  const style = kindStyles[item.kind];
                  const Icon = style.icon;
                  return (
                    <button
                      key={item.id}
                      onClick={() => openNotification(item)}
                      className={cn(
                        "flex w-full items-start gap-3 rounded-lg px-2.5 py-2.5 text-left transition-colors hover:bg-surface-2",
                        item.unread && "bg-surface-2/70",
                      )}
                    >
                      <span className={cn("mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg", style.className)}>
                        <Icon size={14} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          <span className="truncate text-[12px] font-medium text-ink">{item.title}</span>
                          {item.unread && <span className="size-1.5 shrink-0 rounded-full bg-accent" />}
                        </span>
                        <span className="mt-0.5 block text-[11px] leading-relaxed text-muted">{item.description}</span>
                        <span className="mt-1 block font-mono text-[10px] text-faint">{timeLabel(item.time)}</span>
                      </span>
                    </button>
                  );
                })}
                {notifications.length === 0 && (
                  <p className="px-3 py-6 text-center text-[11px] text-faint">No notifications in this workspace.</p>
                )}
              </div>
              <Link
                to="/inbox"
                onClick={() => setPanelOpen(false)}
                className="block border-t border-line bg-surface-2/50 px-4 py-2.5 text-center text-[11.5px] font-medium text-muted transition-colors hover:text-ink"
              >
                Open inbox
              </Link>
            </div>
          )}
        </div>

        <div className="mx-1 hidden h-5 w-px bg-line sm:block" />

        <Link
          to="/settings"
          className="rounded-full ring-offset-2 ring-offset-bg transition-shadow hover:ring-2 hover:ring-line-strong"
          aria-label="Profile settings"
        >
          <Avatar name="Jawad Al Amien" tone={6} size="md" className="text-[10.5px]" />
        </Link>
      </div>
    </header>
  );
}
