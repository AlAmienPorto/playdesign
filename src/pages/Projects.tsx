import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  FolderKanban,
  MessageSquare,
  Plus,
  Search,
  Target,
  Users,
  Wallet,
  X,
} from "lucide-react";
import {
  ASSET_STATUS_META,
  PROJECT_STATUS_META,
  projectProgress,
  type Project,
  type ProjectStatus,
} from "../data/business";
import { TEAM, teamById } from "../data/mock";
import { useStore } from "../lib/store";
import { cn, dateAt, dueMeta, formatDay, money, moneyCompact } from "../lib/utils";
import {
  Avatar,
  Badge,
  Button,
  Drawer,
  Field,
  IconButton,
  inputClass,
  Modal,
  PageHeader,
  ProgressBar,
  Segmented,
} from "../components/ui";

type ProjectFilter = "all" | "active" | "planning" | "review" | "on_hold" | "completed";

const statusOptions: ProjectStatus[] = ["planning", "active", "on_hold", "review", "completed", "cancelled"];

function NewProjectModal({ onClose }: { onClose: () => void }) {
  const { clients, createProject, workspace } = useStore();
  const [managerId, setManagerId] = useState("ja");
  const [name, setName] = useState("");
  const [clientId, setClientId] = useState(clients[0]?.id ?? "");
  const [type, setType] = useState("Brand + web");
  const [description, setDescription] = useState("");
  const [startDate, setStartDate] = useState(dateAt(0));
  const [deadline, setDeadline] = useState(dateAt(30));
  const [budget, setBudget] = useState("18000");
  const [error, setError] = useState("");

  const submit = () => {
    const result = createProject({
      name,
      clientId,
      description,
      type,
      managerId,
      startDate,
      deadline,
      budget: Number(budget) || 0,
    });
    if (!result.ok) {
      setError(result.error ?? "The project could not be created.");
      return;
    }
    onClose();
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="New project"
      description={`Projects are created inside ${workspace.name}. Progress is derived from tasks, never typed in.`}
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" form="project-form">
            Create project
          </Button>
        </>
      }
    >
      <form
        id="project-form"
        className="grid gap-4 sm:grid-cols-2"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        {error && (
          <p className="sm:col-span-2 rounded-lg border border-warning/30 bg-warning-soft px-3 py-2 text-[11px] text-warning">
            {error}
          </p>
        )}
        <Field label="Project name">
          <input value={name} onChange={(event) => setName(event.target.value)} className={inputClass} required autoFocus placeholder="e.g. Northwind website" />
        </Field>
        <Field label="Client">
          <select value={clientId} onChange={(event) => setClientId(event.target.value)} className={inputClass} required>
            {clients.map((client) => (
              <option key={client.id} value={client.id}>
                {client.company}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Project type">
          <input value={type} onChange={(event) => setType(event.target.value)} className={inputClass} placeholder="Brand, web, campaign…" />
        </Field>
        <Field label="Manager">
          <select value={managerId} onChange={(event) => setManagerId(event.target.value)} className={inputClass}>
            {TEAM.map((member) => (
              <option key={member.id} value={member.id}>
                {member.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Start date">
          <input value={startDate} onChange={(event) => setStartDate(event.target.value)} type="date" className={inputClass} />
        </Field>
        <Field label="Deadline">
          <input value={deadline} onChange={(event) => setDeadline(event.target.value)} type="date" className={inputClass} />
        </Field>
        <Field label="Budget" hint="USD">
          <input value={budget} onChange={(event) => setBudget(event.target.value)} type="number" min="0" className={inputClass} />
        </Field>
        <Field label="Description" className="sm:col-span-2">
          <textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={3} className={cn(inputClass, "resize-none")} placeholder="What is in scope, and what is explicitly out of scope?" />
        </Field>
      </form>
    </Modal>
  );
}

function ProjectDrawer({ project, onClose }: { project: Project; onClose: () => void }) {
  const { projects, tasks, clients, assets, transactions, updateProjectStatus } = useStore();
  const client = clients.find((entry) => entry.id === project.clientId);
  const manager = teamById(project.managerId);
  const meta = PROJECT_STATUS_META[project.status];
  const progress = projectProgress(project.id, projects, tasks);
  const relatedTasks = tasks.filter((task) => task.project === project.name);
  const byStatus = {
    backlog: relatedTasks.filter((task) => task.status === "backlog").length,
    in_progress: relatedTasks.filter((task) => task.status === "in_progress").length,
    review: relatedTasks.filter((task) => task.status === "review").length,
    done: relatedTasks.filter((task) => task.status === "done").length,
  };
  const relatedAssets = assets.filter((asset) => asset.projectId === project.id);
  const relatedTransactions = transactions.filter((entry) => entry.projectId === project.id);
  const billed = relatedTransactions
    .filter((entry) => entry.type === "income" && entry.status === "posted")
    .reduce((sum, entry) => sum + entry.amount, 0);
  const spent = relatedTransactions
    .filter((entry) => entry.type === "expense" && entry.status === "posted")
    .reduce((sum, entry) => sum + entry.amount, 0);

  return (
    <Drawer open onClose={onClose} title="Project detail">
      <div className="sticky top-0 z-10 flex items-center justify-between border-b border-line bg-surface/95 px-5 py-3.5 backdrop-blur">
        <span className="overline">Project</span>
        <IconButton label="Close project" onClick={onClose}>
          <X size={16} />
        </IconButton>
      </div>

      <div className="px-5 py-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="truncate text-[18px] font-semibold tracking-tight text-ink">{project.name}</h2>
            <p className="mt-0.5 text-[11.5px] text-muted">
              {client?.company ?? "No client"} · {project.type}
            </p>
          </div>
          <Badge tone={meta.tone} dot>
            {meta.label}
          </Badge>
        </div>

        <p className="mt-3 text-[11.5px] leading-relaxed text-muted">{project.description}</p>

        <div className="mt-4 rounded-xl border border-line bg-surface-2/60 p-3.5">
          <div className="flex items-center justify-between text-[10px] text-muted">
            <span>Progress from completed tasks</span>
            <span className="font-mono text-ink">{progress}%</span>
          </div>
          <ProgressBar value={progress} className="mt-2" height="h-2" tone={progress >= 75 ? "success" : progress >= 40 ? "warning" : "accent"} />
          <div className="mt-3 grid grid-cols-4 gap-2">
            {[
              { label: "Backlog", value: byStatus.backlog },
              { label: "Active", value: byStatus.in_progress },
              { label: "Review", value: byStatus.review },
              { label: "Done", value: byStatus.done },
            ].map((cell) => (
              <div key={cell.label} className="rounded-lg bg-surface px-2 py-1.5 text-center">
                <div className="font-mono text-[13px] font-medium text-ink">{cell.value}</div>
                <div className="text-[8.5px] uppercase tracking-[0.06em] text-faint">{cell.label}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <div className="rounded-xl border border-line p-3">
            <div className="text-[9.5px] uppercase tracking-[0.08em] text-faint">Budget</div>
            <div className="mt-1 font-mono text-[15px] font-medium text-ink">{money(project.budget)}</div>
            <div className="mt-0.5 text-[9px] text-faint">{money(billed)} collected · {money(spent)} spent</div>
          </div>
          <div className="rounded-xl border border-line p-3">
            <div className="text-[9.5px] uppercase tracking-[0.08em] text-faint">Deadline</div>
            <div className="mt-1 font-mono text-[15px] font-medium text-ink">{dueMeta(project.deadline).label}</div>
            <div className="mt-0.5 text-[9px] text-faint">Started {formatDay(project.startDate)}</div>
          </div>
        </div>

        <div className="mt-5">
          <div className="overline mb-2">Status</div>
          <div className="flex flex-wrap gap-1.5">
            {statusOptions.map((status) => {
              const option = PROJECT_STATUS_META[status];
              return (
                <button
                  key={status}
                  onClick={() => updateProjectStatus(project.id, status)}
                  disabled={status === project.status}
                  className={cn(
                    "rounded-lg border px-2.5 py-1.5 text-[10.5px] font-medium transition-colors",
                    status === project.status
                      ? "border-accent/40 bg-accent-soft text-accent-text"
                      : "border-line text-muted hover:bg-surface-2",
                  )}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
          <p className="mt-1.5 text-[9px] text-faint">Status changes are logged to the audit trail. Dates and budgets are not altered.</p>
        </div>

        <div className="mt-5">
          <div className="overline mb-2">Team</div>
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 rounded-lg px-2 py-1.5">
              <Avatar name={manager.name} tone={manager.tone} size="sm" />
              <span className="text-[11.5px] text-ink">{manager.name}</span>
              <span className="text-[9.5px] text-faint">Project manager</span>
            </div>
            {project.teamIds
              .filter((id) => id !== project.managerId)
              .map((id) => {
                const member = teamById(id);
                return (
                  <div key={id} className="flex items-center gap-2 rounded-lg px-2 py-1.5">
                    <Avatar name={member.name} tone={member.tone} size="sm" />
                    <span className="text-[11.5px] text-ink">{member.name}</span>
                    <span className="text-[9.5px] text-faint">{member.role}</span>
                  </div>
                );
              })}
          </div>
        </div>

        <div className="mt-5">
          <div className="mb-2 flex items-center justify-between">
            <span className="overline">Open tasks</span>
            <Link to="/tasks" onClick={onClose} className="text-[9.5px] font-medium text-accent-text hover:underline">
              Open board
            </Link>
          </div>
          <div className="space-y-1.5">
            {relatedTasks.filter((task) => task.status !== "done").slice(0, 5).map((task) => (
              <div key={task.id} className="rounded-lg border border-line px-2.5 py-2">
                <div className="truncate text-[11px] font-medium text-ink">{task.title}</div>
                <div className="mt-0.5 flex items-center gap-2 text-[9px] text-faint">
                  <span>{teamById(task.ownerId).name.split(" ")[0]}</span>
                  <span>·</span>
                  <span>{dueMeta(task.due).label}</span>
                </div>
              </div>
            ))}
            {relatedTasks.filter((task) => task.status !== "done").length === 0 && (
              <p className="rounded-lg border border-dashed border-line px-3 py-3 text-[10.5px] text-faint">
                No open tasks. Add tasks on the Tasks page — progress updates automatically.
              </p>
            )}
          </div>
        </div>

        <div className="mt-5">
          <div className="mb-2 flex items-center justify-between">
            <span className="overline">Creative assets</span>
            <Link to="/studio" onClick={onClose} className="text-[9.5px] font-medium text-accent-text hover:underline">
              Open studio
            </Link>
          </div>
          <div className="space-y-1.5">
            {relatedAssets.map((asset) => {
              const assetMeta = ASSET_STATUS_META[asset.status];
              return (
                <div key={asset.id} className="flex items-center justify-between gap-2 rounded-lg border border-line px-2.5 py-2">
                  <div className="min-w-0">
                    <div className="truncate text-[11px] font-medium text-ink">{asset.name}</div>
                    <div className="text-[9px] text-faint">v{asset.currentVersion} · {asset.updatedAt}</div>
                  </div>
                  <Badge tone={assetMeta.tone}>{assetMeta.label}</Badge>
                </div>
              );
            })}
            {relatedAssets.length === 0 && (
              <p className="rounded-lg border border-dashed border-line px-3 py-3 text-[10.5px] text-faint">
                No assets yet. Nothing is shared with the client automatically.
              </p>
            )}
          </div>
        </div>

        <div className="mt-5">
          <div className="overline mb-2">Feedback</div>
          <div className="space-y-2">
            {project.feedback.map((item) => (
              <div key={item.id} className="rounded-xl border border-line px-3 py-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-medium text-ink">{item.author}</span>
                  <Badge tone={item.kind === "client" ? "info" : "neutral"}>{item.kind === "client" ? "Client" : "Internal"}</Badge>
                </div>
                <p className="mt-1 text-[10.5px] leading-relaxed text-muted">{item.body}</p>
                <div className="mt-1 font-mono text-[9px] text-faint">{item.time}</div>
              </div>
            ))}
            {project.feedback.length === 0 && (
              <p className="rounded-lg border border-dashed border-line px-3 py-3 text-[10.5px] text-faint">
                No feedback recorded yet.
              </p>
            )}
          </div>
        </div>
      </div>
    </Drawer>
  );
}

export default function Projects() {
  const { projects, tasks, clients, deals, assets, createProjectFromDeal, workspace } = useStore();
  const [params, setParams] = useSearchParams();
  const [filter, setFilter] = useState<ProjectFilter>("all");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<"deadline" | "budget" | "progress">("deadline");
  const [selectedId, setSelectedId] = useState<string | null>(params.get("project"));
  const [modalOpen, setModalOpen] = useState(false);
  const [message, setMessage] = useState("");

  const selected = projects.find((project) => project.id === selectedId) ?? null;

  const closeProject = () => {
    setSelectedId(null);
    if (params.get("project")) setParams({});
  };

  const rows = useMemo(() => {
    const search = query.trim().toLowerCase();
    return projects
      .filter((project) => {
        if (filter !== "all" && project.status !== filter) return false;
        if (!search) return true;
        const client = clients.find((entry) => entry.id === project.clientId);
        return `${project.name} ${project.type} ${client?.company ?? ""}`.toLowerCase().includes(search);
      })
      .map((project) => ({ project, progress: projectProgress(project.id, projects, tasks) }))
      .sort((a, b) => {
        const aClosed = a.project.status === "completed" || a.project.status === "cancelled" ? 1 : 0;
        const bClosed = b.project.status === "completed" || b.project.status === "cancelled" ? 1 : 0;
        if (aClosed !== bClosed) return aClosed - bClosed;
        if (sort === "budget") return b.project.budget - a.project.budget;
        if (sort === "progress") return a.progress - b.progress;
        return new Date(a.project.deadline).getTime() - new Date(b.project.deadline).getTime();
      });
  }, [projects, tasks, clients, filter, query, sort]);

  const wonDeals = deals.filter(
    (deal) => deal.stage === "won" && !projects.some((project) => project.dealId === deal.id),
  );

  const activeCount = projects.filter((project) => project.status === "active").length;
  const dueSoon = projects.filter(
    (project) =>
      project.status !== "completed" &&
      project.status !== "cancelled" &&
      dueMeta(project.deadline).soon,
  ).length;
  const totalBudget = projects
    .filter((project) => project.status !== "cancelled")
    .reduce((sum, project) => sum + project.budget, 0);
  const avgProgress = Math.round(
    projects
      .filter((project) => project.status !== "cancelled")
      .reduce((sum, project) => sum + projectProgress(project.id, projects, tasks), 0) /
      Math.max(projects.filter((project) => project.status !== "cancelled").length, 1),
  );

  const counts = {
    all: projects.length,
    active: activeCount,
    planning: projects.filter((project) => project.status === "planning").length,
    review: projects.filter((project) => project.status === "review").length,
    on_hold: projects.filter((project) => project.status === "on_hold").length,
    completed: projects.filter((project) => project.status === "completed").length,
  };

  const convert = (dealId: string) => {
    const result = createProjectFromDeal(dealId);
    setMessage(result.ok ? "Project created from the won deal — nothing was invoiced automatically." : result.error ?? "Could not create the project.");
    window.setTimeout(() => setMessage(""), 3200);
  };

  return (
    <div>
      <PageHeader
        eyebrow="Business"
        title="Projects"
        description={`Delivery for ${workspace.name}: progress is completed tasks over total tasks, calculated live from the board.`}
      >
        <Button variant="primary" onClick={() => setModalOpen(true)}>
          <Plus size={15} /> New project
        </Button>
      </PageHeader>

      {message && (
        <div className="mb-4 rounded-xl border border-success/25 bg-success-soft/60 px-3.5 py-2.5 text-[11.5px] text-success">
          {message}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3.5 xl:grid-cols-4">
        {[
          { label: "Active projects", value: String(activeCount), note: `${counts.planning} planning`, icon: FolderKanban, className: "bg-success-soft text-success" },
          { label: "Due soon", value: String(dueSoon), note: "Within 3 days", icon: AlertTriangle, className: "bg-warning-soft text-warning" },
          { label: "Portfolio budget", value: moneyCompact(totalBudget), note: "Excludes cancelled", icon: Wallet, className: "bg-info-soft text-info" },
          { label: "Avg. progress", value: `${avgProgress}%`, note: "From tasks", icon: Target, className: "bg-accent-soft text-accent-text" },
        ].map((stat) => {
          const Icon = stat.icon;
          return (
            <div key={stat.label} className="card flex items-center gap-3 p-4">
              <span className={cn("grid size-9 shrink-0 place-items-center rounded-[10px]", stat.className)}>
                <Icon size={17} />
              </span>
              <div>
                <div className="font-mono text-[19px] font-medium leading-none tracking-tight text-ink">{stat.value}</div>
                <div className="mt-1 text-[11px] font-medium text-muted">{stat.label}</div>
              </div>
              <span className="ml-auto hidden text-right text-[9.5px] text-faint sm:block">{stat.note}</span>
            </div>
          );
        })}
      </div>

      {wonDeals.length > 0 && (
        <section className="card mt-4 overflow-hidden">
          <div className="border-b border-line px-4 py-3">
            <h2 className="flex items-center gap-2 text-[13.5px] font-semibold tracking-tight text-ink">
              <CheckCircle2 size={15} className="text-success" /> Won deals ready to become projects
            </h2>
            <p className="mt-0.5 text-[10.5px] text-muted">Converting creates a planning project with the deal value as budget.</p>
          </div>
          <div>
            {wonDeals.map((deal) => (
              <div key={deal.id} className="flex items-center justify-between gap-3 border-t border-line px-4 py-2.5">
                <div className="min-w-0">
                  <div className="truncate text-[12px] font-medium text-ink">{deal.company} · {deal.title}</div>
                  <div className="text-[9.5px] text-faint">{money(deal.value)} · won {dueMeta(deal.due).label.toLowerCase()}</div>
                </div>
                <Button variant="soft" size="sm" onClick={() => convert(deal.id)}>
                  Create project
                </Button>
              </div>
            ))}
          </div>
        </section>
      )}

      <div className="card mt-4 flex flex-col gap-2.5 p-3 lg:flex-row lg:items-center">
        <div className="relative flex-1 lg:max-w-[280px]">
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search projects, clients or types…"
            className="h-9 w-full rounded-[9px] border border-line bg-surface-2 pl-8 pr-3 text-[12px] text-ink placeholder:text-faint transition-colors focus:border-accent/40 focus:bg-surface focus:outline-none focus:ring-2 focus:ring-accent/10"
          />
        </div>
        <Segmented<ProjectFilter>
          value={filter}
          onChange={setFilter}
          size="sm"
          options={[
            { value: "all", label: "All", count: counts.all },
            { value: "active", label: "Active", count: counts.active },
            { value: "planning", label: "Planning", count: counts.planning },
            { value: "review", label: "Review", count: counts.review },
            { value: "on_hold", label: "Hold", count: counts.on_hold },
            { value: "completed", label: "Done", count: counts.completed },
          ]}
        />
        <div className="relative ml-auto">
          <select
            value={sort}
            onChange={(event) => setSort(event.target.value as typeof sort)}
            aria-label="Sort projects"
            className="h-8 appearance-none rounded-lg border border-line bg-surface-2 pl-2.5 pr-7 text-[11px] font-medium text-muted focus:outline-none"
          >
            <option value="deadline">Sort: deadline</option>
            <option value="budget">Sort: budget</option>
            <option value="progress">Sort: progress</option>
          </select>
          <ChevronDown size={12} className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-faint" />
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3.5 md:grid-cols-2 xl:grid-cols-3">
        {rows.map(({ project, progress }) => {
          const client = clients.find((entry) => entry.id === project.clientId);
          const meta = PROJECT_STATUS_META[project.status];
          const due = dueMeta(project.deadline);
          const closed = project.status === "completed" || project.status === "cancelled";
          const projectAssets = assets.filter((asset) => asset.projectId === project.id);
          return (
            <button
              key={project.id}
              onClick={() => setSelectedId(project.id)}
              className="card group overflow-hidden p-4 text-left transition-shadow hover:shadow-float"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate text-[13px] font-semibold tracking-tight text-ink">{project.name}</div>
                  <div className="mt-0.5 truncate text-[10px] text-faint">{client?.company ?? "No client"} · {project.type}</div>
                </div>
                <Badge tone={meta.tone} dot>
                  {meta.label}
                </Badge>
              </div>

              <div className="mt-3.5 flex items-center justify-between text-[9.5px] text-faint">
                <span>Progress</span>
                <span className="font-mono text-ink">{progress}%</span>
              </div>
              <ProgressBar value={progress} className="mt-1.5" tone={progress >= 75 ? "success" : progress >= 40 ? "warning" : "accent"} />

              <div className="mt-3.5 flex items-center justify-between gap-2">
                <div className="flex -space-x-1.5">
                  {[project.managerId, ...project.teamIds.filter((id) => id !== project.managerId)].slice(0, 4).map((id) => {
                    const member = teamById(id);
                    return <Avatar key={id} name={member.name} tone={member.tone} size="xs" className="ring-2 ring-surface" />;
                  })}
                  {project.teamIds.length > 3 && (
                    <span className="grid size-6 place-items-center rounded-full bg-surface-3 text-[9px] text-muted ring-2 ring-surface">
                      +{project.teamIds.length - 3}
                    </span>
                  )}
                </div>
                <span className="font-mono text-[10px] text-muted">{money(project.budget)}</span>
              </div>

              <div className="mt-3 flex items-center justify-between border-t border-line pt-2.5 text-[9.5px]">
                <span className="flex items-center gap-1.5 text-muted">
                  <CalendarDays size={11} className="text-faint" />
                  <span className={cn(!closed && (due.overdue || due.soon) && "text-warning")}>
                    {closed ? (project.status === "completed" ? "Delivered" : "Cancelled") : due.label}
                  </span>
                </span>
                <span className="flex items-center gap-2 text-faint">
                  <span className="flex items-center gap-0.5"><Users size={10} /> {project.teamIds.length}</span>
                  <span className="flex items-center gap-0.5"><FolderKanban size={10} /> {projectAssets.length}</span>
                  <span className="flex items-center gap-0.5"><MessageSquare size={10} /> {project.feedback.length}</span>
                </span>
              </div>
            </button>
          );
        })}
      </div>

      {rows.length === 0 && (
        <div className="card mt-4 px-5 py-10 text-center text-[12px] text-faint">No projects match this filter.</div>
      )}

      <p className="mt-3 text-[9.5px] text-faint">
        Budget is a planning figure, not a promise. Collected and spent values come from posted finance entries linked to
        each project.
      </p>

      {selected && <ProjectDrawer project={selected} onClose={closeProject} />}
      {modalOpen && <NewProjectModal onClose={() => setModalOpen(false)} />}
    </div>
  );
}
