import { useMemo, useRef, useState, type DragEvent, type FormEvent } from "react";
import {
  CalendarDays,
  Check,
  Flame,
  GripVertical,
  KanbanSquare,
  Plus,
  Sparkles,
} from "lucide-react";
import {
  DEAL_COLUMNS,
  TASK_COLUMNS,
  teamById,
  type DealStage,
  type Priority,
  type TaskStatus,
} from "../data/mock";
import { useStore } from "../lib/store";
import { cn, dateAt, dueMeta, money, moneyCompact } from "../lib/utils";
import {
  Avatar,
  Badge,
  Button,
  Field,
  inputClass,
  Modal,
  PageHeader,
  ProgressBar,
  Segmented,
} from "../components/ui";
import { NewTaskModal } from "../components/NewTaskModal";
import { TaskDrawer } from "../components/TaskDrawer";

type View = "deals" | "tasks";

const priorityTone: Record<Priority, "accent" | "warning" | "neutral"> = {
  high: "accent",
  medium: "warning",
  low: "neutral",
};

const priorityLabel: Record<Priority, string> = { high: "High", medium: "Medium", low: "Low" };

const stageDot: Record<DealStage, string> = {
  new: "bg-[#9a8f8b]",
  qualified: "bg-info",
  proposal: "bg-warning",
  negotiation: "bg-accent",
  won: "bg-success",
};

const taskDot: Record<TaskStatus, string> = {
  backlog: "bg-[#9a8f8b]",
  in_progress: "bg-info",
  review: "bg-warning",
  done: "bg-success",
};

function DealModal({
  stage,
  onClose,
  onSubmit,
}: {
  stage: DealStage;
  onClose: () => void;
  onSubmit: (values: { company: string; title: string; value: number; contact: string; stage: DealStage }) => void;
}) {
  const [company, setCompany] = useState("");
  const [title, setTitle] = useState("");
  const [value, setValue] = useState("12000");
  const [contact, setContact] = useState("");
  const [dealStage, setDealStage] = useState<DealStage>(stage);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!company.trim() || !title.trim()) return;
    onSubmit({ company: company.trim(), title: title.trim(), value: Number(value) || 0, contact: contact.trim() || "—", stage: dealStage });
    onClose();
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="New deal"
      description="Add an opportunity to your pipeline."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" form="deal-form">
            Create deal
          </Button>
        </>
      }
    >
      <form id="deal-form" onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        <Field label="Company">
          <input value={company} onChange={(e) => setCompany(e.target.value)} className={inputClass} placeholder="e.g. Northwind Studio" required autoFocus />
        </Field>
        <Field label="Contact">
          <input value={contact} onChange={(e) => setContact(e.target.value)} className={inputClass} placeholder="Full name" />
        </Field>
        <Field label="Deal title" className="sm:col-span-2">
          <input value={title} onChange={(e) => setTitle(e.target.value)} className={inputClass} placeholder="e.g. Rebrand + website" required />
        </Field>
        <Field label="Value" hint="USD">
          <input value={value} onChange={(e) => setValue(e.target.value)} type="number" min="0" className={inputClass} />
        </Field>
        <Field label="Stage">
          <select value={dealStage} onChange={(e) => setDealStage(e.target.value as DealStage)} className={inputClass}>
            {DEAL_COLUMNS.map((column) => (
              <option key={column.id} value={column.id}>
                {column.label}
              </option>
            ))}
          </select>
        </Field>
      </form>
    </Modal>
  );
}

export default function Kanban() {
  const { tasks, deals, moveDeal, moveTask, addDeal, addTask, toggleTask, agents } = useStore();
  const agentName = agents[0]?.name ?? "the agent";
  const [view, setView] = useState<View>("deals");
  const [dragId, setDragId] = useState<string | null>(null);
  const [overColumn, setOverColumn] = useState<string | null>(null);
  const [dealModal, setDealModal] = useState<DealStage | null>(null);
  const [taskModal, setTaskModal] = useState<TaskStatus | null>(null);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const dragged = useRef(false);

  const selectedTask = tasks.find((task) => task.id === selectedTaskId) ?? null;

  const openDeals = deals.filter((deal) => deal.stage !== "won");
  const stats = useMemo(() => {
    if (view === "deals") {
      const openValue = openDeals.reduce((sum, deal) => sum + deal.value, 0);
      const weighted = openDeals.reduce((sum, deal) => sum + (deal.value * deal.score) / 100, 0);
      const won = deals.filter((deal) => deal.stage === "won").reduce((sum, deal) => sum + deal.value, 0);
      return [
        { label: "Open pipeline", value: moneyCompact(openValue), note: `${openDeals.length} active deals` },
        { label: "Weighted forecast", value: moneyCompact(weighted), note: "Score adjusted" },
        { label: "Won this month", value: moneyCompact(won), note: `${deals.filter((d) => d.stage === "won").length} closed deals` },
        { label: "Avg. deal size", value: moneyCompact(openValue / Math.max(openDeals.length, 1)), note: "Across open deals" },
      ];
    }
    return [
      { label: "Open tasks", value: String(tasks.filter((task) => task.status !== "done").length), note: "Across all projects" },
      { label: "In progress", value: String(tasks.filter((task) => task.status === "in_progress").length), note: "Being worked on" },
      { label: "In review", value: String(tasks.filter((task) => task.status === "review").length), note: "Awaiting feedback" },
      { label: "Completed", value: String(tasks.filter((task) => task.status === "done").length), note: "This week" },
    ];
  }, [view, deals, tasks, openDeals]);

  const handleDrop = (column: string) => {
    if (!dragId) return;
    if (view === "deals") moveDeal(dragId, column as DealStage);
    else moveTask(dragId, column as TaskStatus);
    setDragId(null);
    setOverColumn(null);
  };

  return (
    <div>
      <PageHeader
        eyebrow="Workspace"
        title="Kanban"
        description="Drag deals through your pipeline, or switch to the studio task board. Every status change is logged, and approvals stay with the owner."
      >
        <Segmented<View>
          value={view}
          onChange={setView}
          options={[
            { value: "deals", label: "Deals", count: deals.length },
            { value: "tasks", label: "Tasks", count: tasks.length },
          ]}
        />
        {view === "deals" ? (
          <Button variant="primary" onClick={() => setDealModal("new")}>
            <Plus size={15} /> New deal
          </Button>
        ) : (
          <Button variant="primary" onClick={() => setTaskModal("backlog")}>
            <Plus size={15} /> New task
          </Button>
        )}
      </PageHeader>

      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-line bg-line md:grid-cols-4">
        {stats.map((stat) => (
          <div key={stat.label} className="bg-surface px-4 py-3.5">
            <div className="text-[10.5px] font-medium uppercase tracking-[0.08em] text-faint">{stat.label}</div>
            <div className="mt-1.5 font-mono text-[20px] font-medium leading-none tracking-tight text-ink">{stat.value}</div>
            <div className="mt-1.5 text-[10.5px] text-faint">{stat.note}</div>
          </div>
        ))}
      </div>

      <div className="mt-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-[11px] text-muted">
          <KanbanSquare size={13} className="text-faint" />
          {view === "deals" ? "Sales pipeline" : "Studio task board"}
          <span className="text-faint">·</span>
          <span className="text-faint">Drag cards to move them</span>
        </div>
        <div className="hidden items-center gap-1.5 rounded-full border border-line bg-surface px-2.5 py-1 text-[10px] text-faint sm:flex">
          <Sparkles size={10} className="text-accent-text" />
          {agentName} proposes changes — you approve
        </div>
      </div>

      <div className="-mx-4 mt-3 overflow-x-auto px-4 pb-4 md:mx-0 md:px-0">
        <div className="flex min-w-max items-start gap-3">
          {view === "deals"
            ? DEAL_COLUMNS.map((column) => {
                const columnDeals = deals.filter((deal) => deal.stage === column.id);
                const total = columnDeals.reduce((sum, deal) => sum + deal.value, 0);
                return (
                  <section
                    key={column.id}
                    onDragOver={(event) => {
                      event.preventDefault();
                      setOverColumn(column.id);
                    }}
                    onDrop={(event) => {
                      event.preventDefault();
                      handleDrop(column.id);
                    }}
                    className={cn(
                      "flex w-[286px] shrink-0 snap-start flex-col rounded-xl border border-line bg-subtle/70 transition-colors",
                      overColumn === column.id && "border-accent/50 bg-accent-soft/30",
                    )}
                  >
                    <header className="flex items-center justify-between gap-2 border-b border-line px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <span className={cn("size-1.5 rounded-full", stageDot[column.id])} />
                        <span className="text-[12px] font-semibold text-ink">{column.label}</span>
                        <span className="grid h-[18px] min-w-[18px] place-items-center rounded-md bg-surface-3 px-1 font-mono text-[10px] text-muted">
                          {columnDeals.length}
                        </span>
                      </div>
                      <span className="font-mono text-[10px] text-faint">{moneyCompact(total)}</span>
                    </header>

                    <div className="flex max-h-[calc(100dvh-330px)] min-h-[260px] flex-col gap-2 overflow-y-auto p-2">
                      {columnDeals.map((deal) => {
                        const owner = teamById(deal.ownerId);
                        const due = dueMeta(deal.due);
                        return (
                          <article
                            key={deal.id}
                            draggable
                            onDragStart={(event: DragEvent<HTMLElement>) => {
                              setDragId(deal.id);
                              event.dataTransfer.effectAllowed = "move";
                              event.dataTransfer.setData("text/plain", deal.id);
                            }}
                            onDragEnd={() => {
                              setDragId(null);
                              setOverColumn(null);
                            }}
                            className={cn(
                              "group cursor-grab rounded-[10px] border border-line bg-surface p-3 shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition-all hover:border-line-strong hover:shadow-card active:cursor-grabbing",
                              dragId === deal.id && "rotate-[1deg] opacity-40",
                            )}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex min-w-0 items-center gap-2">
                                <span className="grid size-6 shrink-0 place-items-center rounded-[6px] bg-surface-3 font-mono text-[9px] font-semibold text-muted">
                                  {deal.company.slice(0, 2).toUpperCase()}
                                </span>
                                <span className="truncate text-[12px] font-semibold text-ink">{deal.company}</span>
                              </div>
                              <span
                                className={cn(
                                  "flex shrink-0 items-center gap-0.5 font-mono text-[9.5px]",
                                  deal.score >= 85 ? "text-success" : deal.score >= 70 ? "text-warning" : "text-faint",
                                )}
                              >
                                <Flame size={9} />
                                {deal.score}
                              </span>
                            </div>
                            <p className="mt-1.5 truncate text-[11px] text-muted">{deal.title}</p>
                            <div className="mt-2 flex flex-wrap gap-1">
                              {deal.tags.map((tag) => (
                                <span
                                  key={tag}
                                  className="rounded-md border border-line bg-surface-2 px-1.5 py-0.5 text-[9.5px] text-muted"
                                >
                                  {tag}
                                </span>
                              ))}
                            </div>
                            <div className="mt-2.5 flex items-center justify-between border-t border-line pt-2.5">
                              <span className="font-mono text-[11.5px] font-medium text-ink">{money(deal.value)}</span>
                              <div className="flex items-center gap-2">
                                <span
                                  className={cn(
                                    "text-[10px]",
                                    due.overdue ? "text-accent-text" : due.soon ? "text-warning" : "text-faint",
                                  )}
                                >
                                  {due.label}
                                </span>
                                <Avatar name={owner.name} tone={owner.tone} size="xs" />
                              </div>
                            </div>
                          </article>
                        );
                      })}

                      <button
                        onClick={() => setDealModal(column.id)}
                        className="mt-auto flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-lg border border-dashed border-line text-[11px] font-medium text-faint transition-colors hover:border-line-strong hover:bg-surface hover:text-ink"
                      >
                        <Plus size={12} /> Add deal
                      </button>
                    </div>
                  </section>
                );
              })
            : TASK_COLUMNS.map((column) => {
                const columnTasks = tasks.filter((task) => task.status === column.id);
                return (
                  <section
                    key={column.id}
                    onDragOver={(event) => {
                      event.preventDefault();
                      setOverColumn(column.id);
                    }}
                    onDrop={(event) => {
                      event.preventDefault();
                      handleDrop(column.id);
                    }}
                    className={cn(
                      "flex w-[286px] shrink-0 snap-start flex-col rounded-xl border border-line bg-subtle/70 transition-colors",
                      overColumn === column.id && "border-accent/50 bg-accent-soft/30",
                    )}
                  >
                    <header className="flex items-center justify-between gap-2 border-b border-line px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <span className={cn("size-1.5 rounded-full", taskDot[column.id])} />
                        <span className="text-[12px] font-semibold text-ink">{column.label}</span>
                        <span className="grid h-[18px] min-w-[18px] place-items-center rounded-md bg-surface-3 px-1 font-mono text-[10px] text-muted">
                          {columnTasks.length}
                        </span>
                      </div>
                      <span className="font-mono text-[9.5px] text-faint">{column.hint}</span>
                    </header>

                    <div className="flex max-h-[calc(100dvh-330px)] min-h-[260px] flex-col gap-2 overflow-y-auto p-2">
                      {columnTasks.map((task) => {
                        const owner = teamById(task.ownerId);
                        const due = dueMeta(task.due);
                        const done = task.status === "done";
                        return (
                          <article
                            key={task.id}
                            draggable
                            onClick={() => {
                              if (!dragged.current) setSelectedTaskId(task.id);
                            }}
                            onDragStart={(event: DragEvent<HTMLElement>) => {
                              dragged.current = true;
                              setDragId(task.id);
                              event.dataTransfer.effectAllowed = "move";
                              event.dataTransfer.setData("text/plain", task.id);
                            }}
                            onDragEnd={() => {
                              setDragId(null);
                              setOverColumn(null);
                              window.setTimeout(() => {
                                dragged.current = false;
                              }, 0);
                            }}
                            className={cn(
                              "group cursor-grab rounded-[10px] border border-line bg-surface p-3 shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition-all hover:border-line-strong hover:shadow-card active:cursor-grabbing",
                              dragId === task.id && "rotate-[1deg] opacity-40",
                            )}
                          >
                            <div className="flex items-start gap-2">
                              <button
                                aria-label={done ? "Reopen task" : "Complete task"}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  toggleTask(task.id);
                                }}
                                onPointerDown={(event) => event.stopPropagation()}
                                className={cn(
                                  "mt-0.5 grid size-4 shrink-0 place-items-center rounded-full border transition-colors",
                                  done
                                    ? "border-success bg-success text-white"
                                    : "border-line-strong text-transparent hover:border-accent hover:text-accent",
                                )}
                              >
                                <Check size={9} strokeWidth={3} />
                              </button>
                              <div className="min-w-0 flex-1">
                                <p
                                  className={cn(
                                    "text-[12px] font-medium leading-snug",
                                    done ? "text-faint line-through" : "text-ink",
                                  )}
                                >
                                  {task.title}
                                </p>
                                <p className="mt-0.5 text-[10px] text-faint">{task.project}</p>
                              </div>
                              <GripVertical size={12} className="mt-0.5 shrink-0 text-line-strong opacity-0 transition-opacity group-hover:opacity-100" />
                            </div>
                            <div className="mt-2 flex flex-wrap items-center gap-1.5">
                              <Badge tone={priorityTone[task.priority]}>{priorityLabel[task.priority]}</Badge>
                              {task.approval === "pending" && (
                                <Badge tone="accent">Approval v{task.outputVersion}</Badge>
                              )}
                              {task.approval === "changes_requested" && <Badge tone="warning">Changes</Badge>}
                              {task.blockedReason && <Badge tone="warning">Blocked</Badge>}
                              {task.subtasksTotal > 0 && (
                                <span className="font-mono text-[9.5px] text-faint">
                                  {task.subtasksDone}/{task.subtasksTotal} subtasks
                                </span>
                              )}
                            </div>
                            {task.subtasksTotal > 0 && (
                              <ProgressBar
                                value={task.subtasksDone}
                                max={task.subtasksTotal}
                                tone={done ? "success" : "accent"}
                                height="h-1"
                                className="mt-2"
                              />
                            )}
                            <div className="mt-2.5 flex items-center justify-between border-t border-line pt-2">
                              <span
                                className={cn(
                                  "flex items-center gap-1 text-[10px]",
                                  due.overdue && !done ? "text-accent-text" : due.soon && !done ? "text-warning" : "text-faint",
                                )}
                              >
                                <CalendarDays size={10} />
                                {due.label}
                              </span>
                              <Avatar name={owner.name} tone={owner.tone} size="xs" />
                            </div>
                          </article>
                        );
                      })}

                      <button
                        onClick={() => setTaskModal(column.id)}
                        className="mt-auto flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-lg border border-dashed border-line text-[11px] font-medium text-faint transition-colors hover:border-line-strong hover:bg-surface hover:text-ink"
                      >
                        <Plus size={12} /> Add task
                      </button>
                    </div>
                  </section>
                );
              })}
        </div>
      </div>

      <p className="mt-1 text-center text-[10px] text-faint">
        Demo dataset · changes stay in this session · {view === "deals" ? `${deals.length} deals` : `${tasks.length} tasks`}
      </p>

      {dealModal && (
        <DealModal
          stage={dealModal}
          onClose={() => setDealModal(null)}
          onSubmit={(values) =>
            addDeal({
              ...values,
              contact: values.contact || "—",
              ownerId: "ja",
              score: 65,
              due: dateAt(14),
              tags: ["New"],
              source: "Manual",
            })
          }
        />
      )}
      {taskModal && (
        <NewTaskModal
          status={taskModal}
          onClose={() => setTaskModal(null)}
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
      {selectedTask && <TaskDrawer task={selectedTask} onClose={() => setSelectedTaskId(null)} />}
    </div>
  );
}
