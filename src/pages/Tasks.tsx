import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  AlertCircle,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  ListTodo,
  Plus,
  Search,
  Timer,
} from "lucide-react";
import { TEAM, teamById, type Priority } from "../data/mock";
import type { OfficeTask } from "../data/office";
import { useStore } from "../lib/store";
import { cn, dueMeta } from "../lib/utils";
import { Avatar, Badge, Button, PageHeader, Segmented } from "../components/ui";
import { NewTaskModal } from "../components/NewTaskModal";
import { TaskDrawer } from "../components/TaskDrawer";

type StatusFilter = "all" | "open" | "done";
type PriorityFilter = "all" | Priority;

const priorityStyles: Record<Priority, { label: string; dot: string; text: string }> = {
  high: { label: "High", dot: "bg-accent", text: "text-accent-text" },
  medium: { label: "Medium", dot: "bg-warning", text: "text-warning" },
  low: { label: "Low", dot: "bg-line-strong", text: "text-faint" },
};

function GroupHeader({
  label,
  count,
  dot,
  hint,
}: {
  label: string;
  count: number;
  dot: string;
  hint?: string;
}) {
  return (
    <div className="flex items-center gap-2 border-b border-line bg-surface-2/60 px-4 py-2">
      <span className={cn("size-1.5 rounded-full", dot)} />
      <span className="text-[10.5px] font-semibold uppercase tracking-[0.1em] text-muted">{label}</span>
      <span className="grid h-[17px] min-w-[17px] place-items-center rounded-md bg-surface-3 px-1 font-mono text-[9.5px] text-faint">
        {count}
      </span>
      {hint && <span className="ml-auto font-mono text-[9.5px] text-faint">{hint}</span>}
    </div>
  );
}

function TaskRow({ task, onOpen }: { task: OfficeTask; onOpen: () => void }) {
  const { toggleTask } = useStore();
  const owner = teamById(task.ownerId);
  const due = dueMeta(task.due);
  const done = task.status === "done";
  const priority = priorityStyles[task.priority];

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpen();
        }
      }}
      className="group flex cursor-pointer items-center gap-3 border-b border-line px-4 py-3 text-left transition-colors last:border-0 hover:bg-surface-2/50 focus-visible:bg-surface-2/60 focus-visible:outline-none"
    >
      <button
        aria-label={done ? `Reopen ${task.title}` : `Complete ${task.title}`}
        onClick={(event) => {
          event.stopPropagation();
          toggleTask(task.id);
        }}
        className={cn(
          "grid size-[17px] shrink-0 place-items-center rounded-full border transition-colors",
          done
            ? "border-success bg-success text-white"
            : "border-line-strong text-transparent hover:border-accent hover:text-accent",
        )}
      >
        <Check size={10} strokeWidth={3} />
      </button>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span
            className={cn(
              "truncate text-[12.5px] font-medium leading-snug",
              done ? "text-faint line-through" : "text-ink",
            )}
          >
            {task.title}
          </span>
          <span className="hidden rounded-md border border-line bg-surface-2 px-1.5 py-0.5 text-[9.5px] text-muted sm:inline-block">
            {task.project}
          </span>
          {task.approval === "pending" && (
            <span className="rounded-md bg-accent-soft px-1.5 py-0.5 text-[9px] font-medium text-accent-text">
              Approval v{task.outputVersion}
            </span>
          )}
          {task.approval === "changes_requested" && (
            <span className="rounded-md bg-warning-soft px-1.5 py-0.5 text-[9px] font-medium text-warning">
              Changes requested
            </span>
          )}
          {task.blockedReason && (
            <span className="rounded-md bg-warning-soft px-1.5 py-0.5 text-[9px] font-medium text-warning">
              Blocked
            </span>
          )}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[10px] text-faint">
          <span className="inline-flex items-center gap-1">
            <span className={cn("size-1.5 rounded-full", priority.dot)} />
            <span className={priority.text}>{priority.label}</span>
          </span>
          {task.subtasksTotal > 0 && (
            <span className="font-mono">
              {task.subtasksDone}/{task.subtasksTotal} subtasks
            </span>
          )}
          {task.tags.map((tag) => (
            <span key={tag} className="hidden text-[9.5px] md:inline">
              #{tag.toLowerCase().replace(/\s+/g, "")}
            </span>
          ))}
        </div>
      </div>

      <span
        className={cn(
          "hidden w-[86px] shrink-0 items-center justify-end gap-1 text-right text-[10.5px] sm:flex",
          done ? "text-faint" : due.overdue ? "text-accent-text" : due.soon ? "text-warning" : "text-faint",
        )}
      >
        <CalendarDays size={10} />
        {due.label}
      </span>
      <Avatar name={owner.name} tone={owner.tone} size="sm" className="shrink-0" />
    </div>
  );
}

export default function Tasks() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { tasks, addTask, agents } = useStore();
  const agentName = agents[0]?.name ?? "the agent";
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [priorityFilter, setPriorityFilter] = useState<PriorityFilter>("all");
  const [ownerFilter, setOwnerFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [taskModal, setTaskModal] = useState(false);

  const taskParam = params.get("task");
  const selectedTask = taskParam ? tasks.find((task) => task.id === taskParam) ?? null : null;
  const openTask = (id: string) => setParams({ task: id });
  const closeTask = () => setParams({});

  const open = tasks.filter((task) => task.status !== "done");
  const stats = [
    {
      label: "Due today",
      value: open.filter((task) => dueMeta(task.due).label === "Today").length,
      icon: CalendarDays,
      className: "bg-warning-soft text-warning",
      note: "Protect these first",
    },
    {
      label: "Overdue",
      value: open.filter((task) => dueMeta(task.due).overdue).length,
      icon: AlertCircle,
      className: "bg-accent-soft text-accent-text",
      note: "Needs attention",
    },
    {
      label: "In progress",
      value: tasks.filter((task) => task.status === "in_progress").length,
      icon: Timer,
      className: "bg-info-soft text-info",
      note: "Across projects",
    },
    {
      label: "Completed",
      value: tasks.filter((task) => task.status === "done").length,
      icon: CheckCircle2,
      className: "bg-success-soft text-success",
      note: "This week",
    },
  ];

  const filtered = useMemo(() => {
    const search = query.trim().toLowerCase();
    return tasks.filter((task) => {
      if (search && !`${task.title} ${task.project} ${task.tags.join(" ")}`.toLowerCase().includes(search)) return false;
      if (priorityFilter !== "all" && task.priority !== priorityFilter) return false;
      if (ownerFilter !== "all" && task.ownerId !== ownerFilter) return false;
      if (statusFilter === "open" && task.status === "done") return false;
      if (statusFilter === "done" && task.status !== "done") return false;
      return true;
    });
  }, [tasks, query, priorityFilter, ownerFilter, statusFilter]);

  const groups = useMemo(() => {
    const byDue = (a: OfficeTask, b: OfficeTask) => new Date(a.due).getTime() - new Date(b.due).getTime();
    const active = filtered.filter((task) => task.status !== "done");
    return [
      {
        key: "overdue",
        label: "Overdue",
        dot: "bg-accent",
        hint: "Move these forward",
        tasks: active.filter((task) => dueMeta(task.due).overdue).sort(byDue),
      },
      {
        key: "today",
        label: "Today",
        dot: "bg-warning",
        hint: "Due today",
        tasks: active.filter((task) => dueMeta(task.due).label === "Today").sort(byDue),
      },
      {
        key: "upcoming",
        label: "Upcoming",
        dot: "bg-info",
        hint: "Next few weeks",
        tasks: active.filter((task) => {
          const due = dueMeta(task.due);
          return !due.overdue && due.label !== "Today";
        }).sort(byDue),
      },
      {
        key: "completed",
        label: "Completed",
        dot: "bg-success",
        hint: "Nice work",
        tasks: filtered.filter((task) => task.status === "done"),
      },
    ].filter((group) => group.tasks.length > 0);
  }, [filtered]);

  const hasFilters = query !== "" || priorityFilter !== "all" || ownerFilter !== "all" || statusFilter !== "all";
  const doneCount = tasks.filter((task) => task.status === "done").length;

  return (
    <div>
      <PageHeader
        eyebrow="Workspace"
        title="Tasks"
        description={`Everything the studio is moving on right now. ${agentName} drafts tasks from conversations and follow-ups — you approve what goes out.`}
      >
        <Button variant="outline" onClick={() => navigate("/kanban")}>
          <ListTodo size={15} className="text-muted" />
          Board view
        </Button>
        <Button variant="primary" onClick={() => setTaskModal(true)}>
          <Plus size={15} />
          New task
        </Button>
      </PageHeader>

      <div className="grid grid-cols-2 gap-3.5 xl:grid-cols-4">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <div key={stat.label} className="card flex items-center gap-3 p-4">
              <span className={cn("grid size-9 shrink-0 place-items-center rounded-[10px]", stat.className)}>
                <Icon size={17} />
              </span>
              <div className="min-w-0">
                <div className="font-mono text-[19px] font-medium leading-none tracking-tight text-ink">
                  {stat.value}
                </div>
                <div className="mt-1 text-[11px] font-medium text-muted">{stat.label}</div>
              </div>
              <span className="ml-auto hidden text-right text-[9.5px] text-faint sm:block">{stat.note}</span>
            </div>
          );
        })}
      </div>

      <div className="card mt-4 flex flex-col gap-2.5 p-3 lg:flex-row lg:items-center">
        <div className="relative flex-1 lg:max-w-[280px]">
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search tasks, projects or tags…"
            className="h-9 w-full rounded-[9px] border border-line bg-surface-2 pl-8 pr-3 text-[12px] text-ink placeholder:text-faint transition-colors focus:border-accent/40 focus:bg-surface focus:outline-none focus:ring-2 focus:ring-accent/10"
          />
        </div>

        <Segmented<StatusFilter>
          value={statusFilter}
          onChange={setStatusFilter}
          size="sm"
          options={[
            { value: "all", label: "All", count: tasks.length },
            { value: "open", label: "Open", count: tasks.length - doneCount },
            { value: "done", label: "Done", count: doneCount },
          ]}
        />

        <div className="flex flex-wrap items-center gap-2 lg:ml-auto">
          <div className="relative">
            <select
              value={priorityFilter}
              onChange={(event) => setPriorityFilter(event.target.value as PriorityFilter)}
              aria-label="Filter by priority"
              className="h-8 appearance-none rounded-lg border border-line bg-surface-2 pl-2.5 pr-7 text-[11px] font-medium text-muted focus:outline-none"
            >
              <option value="all">All priorities</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
            <ChevronDown size={12} className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-faint" />
          </div>

          <div className="relative">
            <select
              value={ownerFilter}
              onChange={(event) => setOwnerFilter(event.target.value)}
              aria-label="Filter by owner"
              className="h-8 appearance-none rounded-lg border border-line bg-surface-2 pl-2.5 pr-7 text-[11px] font-medium text-muted focus:outline-none"
            >
              <option value="all">All owners</option>
              {TEAM.filter((member) => !member.isAgent).map((member) => (
                <option key={member.id} value={member.id}>
                  {member.name}
                </option>
              ))}
            </select>
            <ChevronDown size={12} className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-faint" />
          </div>

          {hasFilters && (
            <button
              onClick={() => {
                setQuery("");
                setPriorityFilter("all");
                setOwnerFilter("all");
                setStatusFilter("all");
              }}
              className="h-8 rounded-lg px-2 text-[11px] font-medium text-muted transition-colors hover:bg-surface-3 hover:text-ink"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      <div className="mt-4 overflow-hidden rounded-2xl border border-line bg-surface">
        {groups.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 px-6 py-16 text-center">
            <span className="grid size-10 place-items-center rounded-xl bg-surface-3 text-faint">
              <CheckCircle2 size={19} />
            </span>
            <p className="mt-1 text-sm font-medium text-ink">Nothing here</p>
            <p className="max-w-xs text-xs text-muted">
              {hasFilters ? "No tasks match these filters. Try clearing them." : "You're all caught up. Enjoy the quiet."}
            </p>
            <Button variant="outline" size="sm" className="mt-2" onClick={() => setTaskModal(true)}>
              <Plus size={13} /> Add a task
            </Button>
          </div>
        ) : (
          groups.map((group) => (
            <div key={group.key}>
              <GroupHeader label={group.label} count={group.tasks.length} dot={group.dot} hint={group.hint} />
              {group.tasks.map((task) => (
                <TaskRow key={task.id} task={task} onOpen={() => openTask(task.id)} />
              ))}
            </div>
          ))
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 px-1 text-[10.5px] text-faint">
        <span>
          Showing {filtered.length} of {tasks.length} tasks
        </span>
        <span className="flex items-center gap-2">
          <Badge tone="neutral">{open.length} open</Badge>
          <Badge tone="success">{doneCount} completed</Badge>
        </span>
      </div>

      {taskModal && (
        <NewTaskModal
          onClose={() => setTaskModal(false)}
          onSubmit={(values) =>
            addTask({
              ...values,
              ownerId: "ja",
              tags: ["New"],
              subtasksDone: 0,
              subtasksTotal: 0,
            })
          }
        />
      )}
      {selectedTask && <TaskDrawer task={selectedTask} onClose={closeTask} />}
    </div>
  );
}
