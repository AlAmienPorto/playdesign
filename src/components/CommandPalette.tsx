import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import {
  ArrowRight,
  BarChart3,
  BookOpen,
  Building2,
  CalendarDays,
  CalendarPlus,
  FolderKanban,
  Kanban,
  FileText,
  LayoutDashboard,
  ListTodo,
  Palette,
  Search,
  Sparkles,
  Users,
  Inbox,
  CornerDownLeft,
  Plus,
  Wallet,
  Workflow,
  Wrench,
} from "lucide-react";
import { useStore } from "../lib/store";
import { LEADS, TEAM, teamById } from "../data/mock";
import { Avatar, Kbd } from "./ui";
import { cn, money } from "../lib/utils";

interface Result {
  id: string;
  label: string;
  sub: string;
  group: "Pages" | "Leads" | "Deals" | "Tasks" | "Quick actions";
  icon: ReactNode;
  action: () => void;
}

const pages = [
  { to: "/", label: "Overview", sub: "Workspace home", icon: <LayoutDashboard size={15} /> },
  { to: "/inbox", label: "Inbox", sub: "AI + human conversations", icon: <Inbox size={15} /> },
  { to: "/briefs", label: "Briefs", sub: "Brief intake and scope approval", icon: <FileText size={15} /> },
  { to: "/leads", label: "Leads", sub: "Contacts and lead scores", icon: <Users size={15} /> },
  { to: "/clients", label: "Clients", sub: "Client 360 and portal scope", icon: <Building2 size={15} /> },
  { to: "/projects", label: "Projects", sub: "Delivery, progress and budgets", icon: <FolderKanban size={15} /> },
  { to: "/studio", label: "Studio", sub: "Creative assets and versions", icon: <Palette size={15} /> },
  { to: "/finance", label: "Finance", sub: "Cash, income and corrections", icon: <Wallet size={15} /> },
  { to: "/kanban", label: "Kanban", sub: "Pipeline and task boards", icon: <Kanban size={15} /> },
  { to: "/tasks", label: "Tasks", sub: "Everything to get done", icon: <ListTodo size={15} /> },
  { to: "/schedule", label: "Schedule", sub: "Social content calendar", icon: <CalendarDays size={15} /> },
  { to: "/agent", label: "AI Agent", sub: "Agent workspace", icon: <Sparkles size={15} /> },
  { to: "/delivery", label: "AI delivery", sub: "Analysis, planning and implementation", icon: <Wrench size={15} /> },
  { to: "/knowledge", label: "Knowledge", sub: "Sources the agent may cite", icon: <BookOpen size={15} /> },
  { to: "/analytics", label: "Analytics", sub: "Sales, delivery and cash reports", icon: <BarChart3 size={15} /> },
  { to: "/automation", label: "Automation", sub: "Workflows and execution log", icon: <Workflow size={15} /> },
];

export function CommandPalette({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const { tasks, deals } = useStore();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setActive(0);
    const timer = window.setTimeout(() => inputRef.current?.focus(), 30);
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [open, onClose]);

  const results = useMemo<Result[]>(() => {
    const go = (to: string) => () => {
      navigate(to);
      onClose();
    };
    const q = query.trim().toLowerCase();

    if (!q) {
      return [
        ...pages.map((page) => ({
          id: `page-${page.to}`,
          label: page.label,
          sub: page.sub,
          group: "Pages" as const,
          icon: page.icon,
          action: go(page.to),
        })),
        {
          id: "quick-task",
          label: "Create a task",
          sub: "Add something to the board",
          group: "Quick actions",
          icon: <Plus size={15} />,
          action: go("/tasks"),
        },
        {
          id: "quick-post",
          label: "Schedule a post",
          sub: "Queue content for a channel",
          group: "Quick actions",
          icon: <CalendarPlus size={15} />,
          action: go("/schedule"),
        },
      ];
    }

    const pageHits: Result[] = pages
      .filter((page) => `${page.label} ${page.sub}`.toLowerCase().includes(q))
      .map((page) => ({
        id: `page-${page.to}`,
        label: page.label,
        sub: page.sub,
        group: "Pages",
        icon: page.icon,
        action: go(page.to),
      }));

    const leadHits: Result[] = LEADS.filter((lead) =>
      `${lead.name} ${lead.company} ${lead.email}`.toLowerCase().includes(q),
    )
      .slice(0, 4)
      .map((lead) => ({
        id: `lead-${lead.id}`,
        label: lead.name,
        sub: `${lead.company} · ${money(lead.value)}`,
        group: "Leads",
        icon: <Avatar name={lead.name} tone={TEAM.find((m) => m.id === lead.ownerId)?.tone ?? 1} size="xs" />,
        action: go("/leads"),
      }));

    const dealHits: Result[] = deals
      .filter((deal) => `${deal.company} ${deal.title} ${deal.contact}`.toLowerCase().includes(q))
      .slice(0, 4)
      .map((deal) => ({
        id: `deal-${deal.id}`,
        label: deal.company,
        sub: `${deal.title} · ${money(deal.value)}`,
        group: "Deals",
        icon: <Kanban size={15} />,
        action: go("/kanban"),
      }));

    const taskHits: Result[] = tasks
      .filter((task) => `${task.title} ${task.project}`.toLowerCase().includes(q))
      .slice(0, 4)
      .map((task) => ({
        id: `task-${task.id}`,
        label: task.title,
        sub: `${task.project} · ${teamById(task.ownerId).name}`,
        group: "Tasks",
        icon: <ListTodo size={15} />,
        action: go("/tasks"),
      }));

    return [...pageHits, ...leadHits, ...dealHits, ...taskHits].slice(0, 10);
  }, [query, navigate, onClose, tasks, deals]);

  useEffect(() => setActive(0), [query]);

  useEffect(() => {
    if (!open) return;
    const item = listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`);
    item?.scrollIntoView({ block: "nearest" });
  }, [active, open]);

  if (!open) return null;

  const onKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((current) => (current + 1) % Math.max(results.length, 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((current) => (current - 1 + results.length) % Math.max(results.length, 1));
    } else if (event.key === "Enter" && results[active]) {
      event.preventDefault();
      results[active].action();
    }
  };

  let lastGroup = "";

  return createPortal(
    <div className="fixed inset-0 z-[90] flex items-start justify-center px-4 pt-[12vh]">
      <div className="absolute inset-0 animate-fade-in bg-black/55 backdrop-blur-[3px]" onClick={onClose} />
      <div className="relative w-full max-w-[620px] animate-scale-in overflow-hidden rounded-2xl border border-line bg-surface shadow-float">
        <div className="flex items-center gap-3 border-b border-line px-4">
          <Search size={17} className="shrink-0 text-faint" />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Search leads, deals, tasks or jump to a page…"
            className="h-[54px] w-full bg-transparent text-[14px] text-ink placeholder:text-faint focus:outline-none"
          />
          <Kbd>esc</Kbd>
        </div>

        <div ref={listRef} className="max-h-[min(430px,55vh)] overflow-y-auto p-2">
          {results.length === 0 && (
            <div className="flex flex-col items-center gap-1 py-12 text-center">
              <Search size={20} className="text-faint" />
              <p className="mt-2 text-sm font-medium text-ink">No results for “{query}”</p>
              <p className="text-xs text-muted">Try a company name, task or page.</p>
            </div>
          )}
          {results.map((result, index) => {
            const showGroup = result.group !== lastGroup;
            lastGroup = result.group;
            return (
              <div key={result.id}>
                {showGroup && (
                  <div className="px-3 pb-1 pt-3 font-mono text-[9.5px] font-medium uppercase tracking-[0.16em] text-faint">
                    {result.group}
                  </div>
                )}
                <button
                  data-index={index}
                  onMouseEnter={() => setActive(index)}
                  onClick={result.action}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-[10px] px-3 py-2.5 text-left transition-colors",
                    active === index ? "bg-surface-3" : "hover:bg-surface-2",
                  )}
                >
                  <span className="grid size-7 shrink-0 place-items-center rounded-lg border border-line bg-surface-2 text-muted">
                    {result.icon}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-medium text-ink">{result.label}</span>
                    <span className="block truncate text-[11px] text-faint">{result.sub}</span>
                  </span>
                  {active === index && <ArrowRight size={14} className="shrink-0 text-muted" />}
                </button>
              </div>
            );
          })}
        </div>

        <div className="flex items-center justify-between border-t border-line bg-surface-2/60 px-4 py-2.5 text-[10.5px] text-faint">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <Kbd>↑</Kbd>
              <Kbd>↓</Kbd> navigate
            </span>
            <span className="flex items-center gap-1">
              <Kbd>
                <CornerDownLeft size={9} />
              </Kbd>{" "}
              open
            </span>
          </div>
          <span className="flex items-center gap-1.5">
            <Sparkles size={11} /> Search powered by agents
          </span>
        </div>
      </div>
    </div>,
    document.body,
  );
}
