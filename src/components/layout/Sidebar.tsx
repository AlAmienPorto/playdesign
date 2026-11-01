import { useEffect, useRef, useState } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import {
  BarChart3,
  BookOpen,
  Building2,
  CalendarDays,
  Check,
  ChevronsUpDown,
  FileText,
  FolderKanban,
  Inbox,
  Kanban,
  LayoutDashboard,
  ListTodo,
  Palette,
  Settings,
  Sparkles,
  Users,
  Wallet,
  Workflow,
  Wrench,
  X,
  ArrowUpRight,
} from "lucide-react";
import { AgentAvatar, Toggle } from "../ui";
import { LogoMark } from "../Logo";
import { cn, dueMeta } from "../../lib/utils";
import { useStore } from "../../lib/store";
import { CONVERSATIONS_BY_WORKSPACE } from "../../data/office";

const navSections = [
  {
    label: "Ruang Kerja",
    items: [
      { to: "/", label: "Ringkasan", icon: LayoutDashboard },
      { to: "/inbox", label: "Kotak Masuk", icon: Inbox, dynamicCount: "inbox" as const },
      { to: "/briefs", label: "Brief Desain", icon: FileText, dynamicCount: "briefs" as const },
      { to: "/leads", label: "Prospek", icon: Users },
      { to: "/kanban", label: "Papan Kanban", icon: Kanban },
      { to: "/tasks", label: "Daftar Tugas", icon: ListTodo, dynamicCount: true },
      { to: "/schedule", label: "Jadwal Tayang", icon: CalendarDays },
    ],
  },
  {
    label: "Bisnis",
    items: [
      { to: "/clients", label: "Klien", icon: Building2 },
      { to: "/projects", label: "Proyek", icon: FolderKanban },
      { to: "/studio", label: "Studio", icon: Palette },
      { to: "/finance", label: "Keuangan", icon: Wallet },
    ],
  },
  {
    label: "Intelijen",
    items: [
      { to: "/agent", label: "Agen AI", icon: Sparkles, agent: true },
      { to: "/delivery", label: "Pengiriman AI", icon: Wrench },
      { to: "/knowledge", label: "Basis Pengetahuan", icon: BookOpen },
      { to: "/analytics", label: "Analitik", icon: BarChart3 },
      { to: "/automation", label: "Otomasi", icon: Workflow },
    ],
  },
];

export function Brand({ compact }: { compact?: boolean }) {
  return (
    <Link to="/" className="flex items-center gap-2.5">
      <LogoMark className="size-8 shrink-0 text-[#ed1c24]" />
      {!compact && (
        <span className="flex items-baseline gap-1.5">
          <span className="text-[17px] font-semibold tracking-[-0.03em] text-ink">playdesign</span>
          <span className="rounded-md bg-accent-soft px-1.5 py-0.5 font-mono text-[9px] font-medium uppercase tracking-wider text-accent-text">
            CRM
          </span>
        </span>
      )}
    </Link>
  );
}

export function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { tasks, workspace, workspaces, switchWorkspace, agents, autopilot, setAutopilot, approvals, runs, briefs } = useStore();
  const navigate = useNavigate();
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const switcherRef = useRef<HTMLDivElement>(null);

  const dueToday = tasks.filter((task) => task.status !== "done" && dueMeta(task.due).label === "Today").length;
  const pendingApprovals = approvals.length + runs.filter((run) => run.state === "owner_review").length;
  const inboxCount = CONVERSATIONS_BY_WORKSPACE[workspace.id].reduce((sum, item) => sum + item.unread, 0);
  const openBriefs = briefs.filter((brief) => !brief.approvedAt).length;
  const leadAgent = agents[0];

  useEffect(() => {
    if (!switcherOpen) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!switcherRef.current?.contains(event.target as Node)) setSwitcherOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSwitcherOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [switcherOpen]);

  const chooseWorkspace = (id: typeof workspaces[number]["id"]) => {
    switchWorkspace(id);
    setSwitcherOpen(false);
    onClose();
    navigate("/");
  };

  return (
    <>
      <div
        className={cn(
          "fixed inset-0 z-40 bg-black/50 backdrop-blur-[2px] transition-opacity lg:hidden",
          open ? "opacity-100" : "pointer-events-none opacity-0",
        )}
        onClick={onClose}
        aria-hidden
      />
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-[266px] flex-col border-r border-line bg-subtle px-3.5 pb-3.5 pt-5 transition-transform duration-300 lg:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex items-center justify-between px-1.5">
          <Brand />
          <button
            onClick={onClose}
            aria-label="Close navigation"
            className="grid size-8 place-items-center rounded-lg text-muted hover:bg-surface-3 hover:text-ink lg:hidden"
          >
            <X size={16} />
          </button>
        </div>

        <div ref={switcherRef} className="relative mt-5">
          <button
            onClick={() => setSwitcherOpen((current) => !current)}
            aria-expanded={switcherOpen}
            aria-haspopup="menu"
            aria-label={`Switch workspace, current ${workspace.name}`}
            className="group flex w-full items-center gap-2.5 rounded-xl border border-line bg-surface p-2.5 text-left transition-shadow hover:shadow-sm"
          >
            <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-[#2c2626] to-[#141010] font-mono text-[11px] font-semibold text-white dark:from-[#3a3232] dark:to-[#201a1a]">
              {workspace.initial}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[12.5px] font-medium leading-tight text-ink">
                {workspace.name}
              </span>
              <span className="mt-0.5 block truncate text-[10.5px] text-faint">{workspace.meta}</span>
            </span>
            <ChevronsUpDown size={14} className="shrink-0 text-faint transition-colors group-hover:text-muted" />
          </button>

          {switcherOpen && (
            <div
              role="menu"
              aria-label="Workspaces"
              className="absolute inset-x-0 top-[calc(100%+6px)] z-20 animate-fade-in overflow-hidden rounded-xl border border-line bg-surface shadow-float"
            >
              <div className="px-2.5 pb-1 pt-2 font-mono text-[8.5px] uppercase tracking-[0.14em] text-faint">
                Ruang Kerja
              </div>
              {workspaces.map((item) => (
                <button
                  key={item.id}
                  role="menuitemradio"
                  aria-checked={item.id === workspace.id}
                  onClick={() => chooseWorkspace(item.id)}
                  className="flex w-full items-center gap-2.5 px-2.5 py-2 text-left transition-colors hover:bg-surface-2"
                >
                  <span className="grid size-6 shrink-0 place-items-center rounded-md bg-surface-3 font-mono text-[10px] font-semibold text-muted">
                    {item.initial}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[11.5px] font-medium text-ink">{item.name}</span>
                    <span className="block truncate text-[9.5px] text-faint">{item.meta}</span>
                  </span>
                  {item.id === workspace.id && <Check size={13} className="shrink-0 text-accent" />}
                </button>
              ))}
              <p className="border-t border-line bg-surface-2/60 px-2.5 py-2 text-[9px] leading-relaxed text-faint">
                {workspace.approvalPolicy}
              </p>
            </div>
          )}
        </div>

        <nav className="mt-6 flex-1 space-y-6 overflow-y-auto pb-4">
          {navSections.map((section) => (
            <div key={section.label}>
              <div className="mb-2 px-2.5 font-mono text-[9.5px] font-medium uppercase tracking-[0.18em] text-faint">
                {section.label}
              </div>
              <div className="space-y-0.5">
                {section.items.map((item) => {
                  const Icon = item.icon;
                  const dynamic = "dynamicCount" in item ? item.dynamicCount : undefined;
                  const count =
                    dynamic === true
                      ? dueToday
                      : dynamic === "inbox"
                        ? inboxCount
                        : dynamic === "briefs"
                          ? openBriefs
                          : undefined;
                  return (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      end={item.to === "/"}
                      onClick={onClose}
                      className={({ isActive }) =>
                        cn(
                          "group flex h-[38px] items-center gap-2.5 rounded-[9px] px-2.5 text-[13px] font-medium transition-colors",
                          isActive
                            ? "bg-surface text-ink shadow-[0_1px_2px_rgba(0,0,0,0.04)] ring-1 ring-line"
                            : "text-muted hover:bg-surface/60 hover:text-ink",
                        )
                      }
                    >
                      {({ isActive }) => (
                        <>
                          <Icon
                            size={16}
                            strokeWidth={1.9}
                            className={cn(
                              "shrink-0 transition-colors",
                              isActive ? "text-accent" : "text-faint group-hover:text-muted",
                            )}
                          />
                          <span className="flex-1">{item.label}</span>
                          {"agent" in item && item.agent && (
                            <span className="rounded-md bg-accent-soft px-1.5 py-0.5 font-mono text-[9px] font-medium text-accent-text">
                              AI
                            </span>
                          )}
                          {count !== undefined && count > 0 && (
                            <span
                              className={cn(
                                "grid h-[18px] min-w-[18px] place-items-center rounded-md px-1 font-mono text-[10px]",
                                isActive ? "bg-accent-soft text-accent-text" : "bg-surface-3 text-faint",
                              )}
                            >
                              {count}
                            </span>
                          )}
                        </>
                      )}
                    </NavLink>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        <div className="relative overflow-hidden rounded-xl border border-line bg-surface p-3">
          <div className="pointer-events-none absolute -right-8 -top-10 size-24 rounded-full bg-accent/10 blur-2xl" />
          <div className="relative flex items-center gap-2">
            <AgentAvatar size="sm" online={autopilot && leadAgent?.availability !== "unavailable"} />
            <div className="min-w-0 flex-1">
              <div className="text-[12px] font-medium leading-tight text-ink">{leadAgent?.name ?? "Agen"}</div>
              <div className="mt-0.5 flex items-center gap-1 text-[10px] text-faint">
                <span className={cn("size-1.5 rounded-full", autopilot ? "bg-[#2fbf8f]" : "bg-line-strong")} />
                {autopilot ? "Autopilot aktif" : "Dijeda"}
              </div>
            </div>
            <Toggle checked={autopilot} onChange={setAutopilot} label="Beralih autopilot agen" />
          </div>
          <p className="relative mt-2.5 text-[11px] leading-relaxed text-muted">
            {autopilot
              ? `${pendingApprovals} persetujuan menunggu. Khusus draf — tidak ada yang terkirim otomatis.`
              : "Dijeda — draf ditahan dan membutuhkan tinjauan Anda."}
          </p>
          <Link
            to="/agent"
            onClick={onClose}
            className="relative mt-2.5 flex items-center justify-between rounded-lg border border-line bg-surface-2 px-2.5 py-1.5 text-[11px] font-medium text-ink transition-colors hover:border-line-strong hover:bg-surface-3"
          >
            Buka ruang agen
            <ArrowUpRight size={13} className="text-muted" />
          </Link>
        </div>

        <Link
          to="/settings"
          onClick={onClose}
          className="mt-2 flex items-center gap-2.5 rounded-xl p-2 transition-colors hover:bg-surface"
        >
          <span className="grid size-8 shrink-0 place-items-center rounded-full bg-gradient-to-br from-[#4b4b55] to-[#2b2b33] text-[11px] font-semibold text-white">
            JA
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[12.5px] font-medium leading-tight text-ink">Jawad Al Amien</span>
            <span className="block truncate text-[10.5px] text-faint">jawad@playdesign.co</span>
          </span>
          <Settings size={15} className="shrink-0 text-faint" />
        </Link>
      </aside>
    </>
  );
}
