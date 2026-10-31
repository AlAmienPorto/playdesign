import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { format, addDays, addMonths } from "date-fns";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Building2,
  CalendarDays,
  CheckCircle2,
  CircleDollarSign,
  CircleHelp,
  FileText,
  Flame,
  FolderKanban,
  Mail,
  MessageSquare,
  Palette,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Users,
  Video,
  Wallet,
  Workflow,
} from "lucide-react";
import { AGENDA, AGENDA_BY_WORKSPACE, teamById } from "../data/mock";
import { financeSummary } from "../data/business";
import { AVAILABILITY_META, type AuditEvent } from "../data/office";
import { useStore } from "../lib/store";
import { cn, dueMeta, money, moneyCompact, TODAY } from "../lib/utils";
import { AgentAvatar, Badge, Button, CircularGauge, ProgressBar, Sparkline } from "../components/ui";

function buildSeries(range: "30D" | "90D" | "12M") {
  if (range === "30D") {
    const labels = [-30, -27, -24, -21, -18, -15, -12, -9, -6, -3, 0].map((offset) =>
      format(addDays(TODAY, offset), "MMM d"),
    );
    const won = [18, 21, 20, 26, 24, 31, 29, 34, 33, 39, 44];
    const pipeline = [72, 78, 75, 86, 90, 88, 96, 104, 99, 112, 124];
    return labels.map((label, index) => ({ label, won: won[index], pipeline: pipeline[index] }));
  }
  if (range === "90D") {
    const labels = [-84, -77, -70, -63, -56, -49, -42, -35, -28, -21, -14, -7, 0].map((offset) =>
      format(addDays(TODAY, offset), "MMM d"),
    );
    const won = [26, 30, 28, 36, 34, 41, 39, 47, 52, 49, 58, 55, 64];
    const pipeline = [88, 94, 102, 98, 112, 118, 124, 120, 134, 142, 138, 151, 164];
    return labels.map((label, index) => ({ label, won: won[index], pipeline: pipeline[index] }));
  }
  const labels = Array.from({ length: 12 }, (_, index) =>
    format(addMonths(TODAY, index - 11), "MMM"),
  );
  const won = [28, 32, 30, 38, 42, 40, 48, 52, 58, 54, 62, 70];
  const pipeline = [96, 104, 98, 112, 118, 124, 132, 138, 146, 140, 152, 168];
  return labels.map((label, index) => ({ label, won: won[index], pipeline: pipeline[index] }));
}

const auditStyles: Record<AuditEvent["entityType"], { icon: typeof Sparkles; className: string }> = {
  run: { icon: Sparkles, className: "bg-accent-soft text-accent-text" },
  approval: { icon: ShieldCheck, className: "bg-accent-soft text-accent-text" },
  task: { icon: CheckCircle2, className: "bg-info-soft text-info" },
  post: { icon: CalendarDays, className: "bg-warning-soft text-warning" },
  deal: { icon: TrendingUp, className: "bg-success-soft text-success" },
  lead: { icon: Users, className: "bg-info-soft text-info" },
  agent: { icon: Sparkles, className: "bg-accent-soft text-accent-text" },
  copilot: { icon: MessageSquare, className: "bg-accent-soft text-accent-text" },
  inbox: { icon: Mail, className: "bg-info-soft text-info" },
  brief: { icon: FileText, className: "bg-warning-soft text-warning" },
  delivery: { icon: FileText, className: "bg-accent-soft text-accent-text" },
  client: { icon: Building2, className: "bg-info-soft text-info" },
  project: { icon: FolderKanban, className: "bg-success-soft text-success" },
  finance: { icon: Wallet, className: "bg-success-soft text-success" },
  asset: { icon: Palette, className: "bg-accent-soft text-accent-text" },
  knowledge: { icon: BookOpen, className: "bg-warning-soft text-warning" },
  automation: { icon: Workflow, className: "bg-info-soft text-info" },
  report: { icon: FileText, className: "bg-info-soft text-info" },
};

const agendaStyles = {
  meeting: { icon: Video, className: "bg-info-soft text-info" },
  post: { icon: CalendarDays, className: "bg-accent-soft text-accent-text" },
  email: { icon: Mail, className: "bg-warning-soft text-warning" },
  task: { icon: CheckCircle2, className: "bg-success-soft text-success" },
};

function ChartTooltipStyle() {
  return {
    contentStyle: {
      background: "rgb(var(--surface))",
      border: "1px solid rgb(var(--border))",
      borderRadius: 10,
      boxShadow: "0 16px 40px -16px rgba(0,0,0,0.3)",
      fontSize: 11,
      padding: "8px 10px",
    },
    labelStyle: { color: "rgb(var(--fg))", fontWeight: 500, marginBottom: 4 },
    itemStyle: { color: "rgb(var(--fg-muted))", padding: 2 },
  };
}

export default function Overview() {
  const navigate = useNavigate();
  const { deals, posts, runs, agents, approvals, audit, workspace, autopilot, projects, transactions } = useStore();
  const [range, setRange] = useState<"30D" | "90D" | "12M">("30D");
  const series = useMemo(() => buildSeries(range), [range]);

  const openDeals = deals.filter((deal) => deal.stage !== "won");
  const openValue = openDeals.reduce((sum, deal) => sum + deal.value, 0);
  const wonValue = deals.filter((deal) => deal.stage === "won").reduce((sum, deal) => sum + deal.value, 0);
  const watchlist = [...openDeals]
    .sort((a, b) => new Date(a.due).getTime() - new Date(b.due).getTime())
    .slice(0, 4);
  const leadAgent = agents[0];
  const agenda = AGENDA_BY_WORKSPACE[workspace.id] ?? AGENDA;
  const pendingRuns = runs.filter((run) => run.state === "owner_review").length;
  const pendingApprovals = approvals.length + pendingRuns;
  const scheduledPosts = posts.filter((post) => post.status === "scheduled").length;
  const completedRuns = runs.filter((run) => run.state !== "failed" && run.state !== "unavailable").length;
  const resolution = runs.length ? Math.round((completedRuns / runs.length) * 100) : 0;
  const activeProjects = projects.filter((project) => project.status === "active").length;
  const atRiskProjects = projects.filter(
    (project) =>
      project.status !== "completed" &&
      project.status !== "cancelled" &&
      dueMeta(project.deadline).soon,
  ).length;
  const cash = financeSummary(transactions, workspace.id);
  const hour = TODAY.getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  const kpis = [
    {
      label: "Open pipeline",
      value: moneyCompact(openValue),
      delta: "Demo",
      note: `${openDeals.length} open deals`,
      icon: CircleDollarSign,
      points: [22, 26, 24, 31, 28, 36, 34, 42, 39, 48, 52, 57],
      tone: "accent" as const,
      href: "/kanban",
    },
    {
      label: "Agent runs",
      value: String(runs.length),
      delta: "Demo",
      note: `${pendingRuns} runs awaiting review`,
      icon: Sparkles,
      points: [2, 3, 2, 4, 3, 5, 4, 5, 6, 5, 7, 6],
      tone: "accent" as const,
      href: "/agent",
    },
    {
      label: "Active projects",
      value: String(activeProjects),
      delta: "Demo",
      note: `${atRiskProjects} due within 3 days`,
      icon: FolderKanban,
      points: [2, 3, 3, 4, 4, 4, 5, 5, 6, 6, 6, 7],
      tone: "success" as const,
      href: "/projects",
    },
    {
      label: "Cash balance",
      value: moneyCompact(cash.balance),
      delta: "Demo",
      note: "Opening + posted entries",
      icon: Wallet,
      points: [38, 41, 39, 44, 43, 48, 46, 51, 49, 54, 52, 57],
      tone: "warning" as const,
      href: "/finance",
    },
  ];

  return (
    <div className="space-y-4">
      {/* Greeting */}
      <div className="flex flex-wrap items-end justify-between gap-4 pb-1">
        <div>
          <div className="flex items-center gap-2 text-[11px] text-muted">
            <span className="relative flex size-1.5">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-accent opacity-60" />
              <span className="relative inline-flex size-1.5 rounded-full bg-accent" />
            </span>
            <span className="font-mono uppercase tracking-[0.12em]">
              {format(TODAY, "EEEE, MMMM d")}
            </span>
            <span className="text-faint">·</span>
            <span>{workspace.name}</span>
          </div>
          <h1 className="mt-2.5 text-[27px] font-semibold leading-tight tracking-[-0.03em] text-ink md:text-[32px]">
            {greeting}, Jawad.
          </h1>
          <p className="mt-1.5 text-[13px] text-muted">
            {leadAgent?.name ?? "The agent"} logged <span className="font-medium text-ink">{runs.length} runs</span> and{" "}
            <span className="font-medium text-ink">{pendingApprovals} approvals</span> are waiting for you in{" "}
            {workspace.name}.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => navigate("/schedule")}>
            <CalendarDays size={15} className="text-muted" />
            Content queue
          </Button>
          <Button variant="primary" onClick={() => navigate("/agent")}>
            <Sparkles size={15} />
            Ask {leadAgent?.name ?? "the agent"}
          </Button>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
        {kpis.map((kpi) => {
          const Icon = kpi.icon;
          const displayValue = kpi.value;
          return (
            <button
              key={kpi.label}
              onClick={() => navigate(kpi.href)}
              aria-label={`${kpi.label}: open ${kpi.href}`}
              className="card group relative overflow-hidden p-4 text-left transition-colors hover:border-line-strong md:p-[18px]"
            >
              <div className="flex items-start justify-between gap-2">
                <span className="text-[11.5px] font-medium text-muted">{kpi.label}</span>
                <span className="grid size-7 place-items-center rounded-lg border border-line bg-surface-2 text-faint transition-colors group-hover:text-muted">
                  <Icon size={14} />
                </span>
              </div>
              <div className="mt-3 flex items-end justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-mono text-[25px] font-medium leading-none tracking-[-0.04em] text-ink">
                    {displayValue}
                  </div>
                  <div className="mt-2 flex items-center gap-1.5 text-[10.5px]">
                    <span className="inline-flex items-center gap-0.5 rounded-md bg-success-soft px-1.5 py-0.5 font-medium text-success">
                      <ArrowUpRight size={10} />
                      {kpi.delta}
                    </span>
                    <span className="text-faint">{kpi.note}</span>
                  </div>
                </div>
                <Sparkline data={kpi.points} tone={kpi.tone} className="h-8 w-[82px] shrink-0" />
              </div>
            </button>
          );
        })}
      </div>

      {/* Chart + agent */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <section className="card overflow-hidden p-4 md:p-5 lg:col-span-8">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-[14px] font-semibold tracking-tight text-ink">Revenue &amp; pipeline</h2>
                <Badge tone="neutral" dot>
                  Demo
                </Badge>
              </div>
              <p className="mt-0.5 text-[11px] text-muted">Closed-won revenue against new pipeline · sample trend</p>
            </div>
            <div className="flex rounded-[9px] border border-line bg-surface-2 p-0.5">
              {(["30D", "90D", "12M"] as const).map((option) => (
                <button
                  key={option}
                  onClick={() => setRange(option)}
                  className={cn(
                    "h-7 rounded-[7px] px-2.5 font-mono text-[10.5px] font-medium transition-colors",
                    range === option ? "bg-surface text-ink shadow-sm ring-1 ring-line" : "text-faint hover:text-ink",
                  )}
                >
                  {option}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-end gap-x-8 gap-y-2">
            <div>
              <div className="font-mono text-[30px] font-medium leading-none tracking-[-0.04em] text-ink">
                {money(openValue)}
              </div>
              <div className="mt-1.5 text-[11px] text-muted">
                open pipeline · {openDeals.length} active deals
              </div>
            </div>
            <div className="flex items-center gap-2 pb-0.5">
              <span className="size-2 rounded-full bg-success" />
              <span className="text-[11px] text-muted">
                <span className="font-medium text-ink">{money(wonValue)}</span> won this month
              </span>
            </div>
          </div>

          <div className="mt-4 h-[230px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={series} margin={{ top: 6, right: 4, left: -18, bottom: 0 }}>
                <defs>
                  <linearGradient id="pipelineFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="rgb(var(--accent))" stopOpacity={0.28} />
                    <stop offset="100%" stopColor="rgb(var(--accent))" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="wonFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="rgb(var(--success))" stopOpacity={0.12} />
                    <stop offset="100%" stopColor="rgb(var(--success))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="rgb(var(--border))" strokeDasharray="3 4" vertical={false} />
                <XAxis
                  dataKey="label"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: "rgb(var(--fg-subtle))", fontSize: 10 }}
                  dy={8}
                  interval="preserveStartEnd"
                  minTickGap={24}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: "rgb(var(--fg-subtle))", fontSize: 10 }}
                  tickFormatter={(value: number) => `$${value}k`}
                  width={52}
                />
                <Tooltip
                  {...ChartTooltipStyle()}
                  cursor={{ stroke: "rgb(var(--border-strong))", strokeDasharray: "3 3" }}
                  formatter={(value: unknown, name?: string | number) => [
                    `$${Number(value).toLocaleString()}k`,
                    name === "pipeline" ? "Pipeline" : "Won",
                  ]}
                />
                <Area
                  type="monotone"
                  dataKey="won"
                  stroke="rgb(var(--success))"
                  strokeWidth={1.8}
                  fill="url(#wonFill)"
                  activeDot={{ r: 3 }}
                  isAnimationActive={false}
                />
                <Area
                  type="monotone"
                  dataKey="pipeline"
                  stroke="rgb(var(--accent))"
                  strokeWidth={2}
                  fill="url(#pipelineFill)"
                  activeDot={{ r: 3.5, strokeWidth: 2, stroke: "rgb(var(--surface))" }}
                  isAnimationActive={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3.5">
            <div className="flex items-center gap-4">
              <span className="flex items-center gap-1.5 text-[10.5px] text-muted">
                <span className="size-2 rounded-full bg-accent" /> Pipeline
              </span>
              <span className="flex items-center gap-1.5 text-[10.5px] text-muted">
                <span className="size-2 rounded-full bg-success" /> Won
              </span>
            </div>
            <div className="flex items-center gap-4 text-[10.5px] text-faint">
              <span>
                Avg. deal <span className="font-mono text-muted">{money(Math.round(openValue / Math.max(openDeals.length, 1)))}</span>
              </span>
              <span className="hidden sm:inline">
                Open deals <span className="font-mono text-muted">{openDeals.length}</span>
              </span>
              <span className="hidden sm:inline">
                Approvals <span className="font-mono text-muted">{pendingApprovals}</span>
              </span>
            </div>
          </div>
        </section>

        <section className="card flex flex-col p-4 md:p-5 lg:col-span-4">
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-[14px] font-semibold tracking-tight text-ink">
                  {leadAgent?.name ?? "The agent"}
                </h2>
                <Badge tone={autopilot ? "accent" : "warning"} dot>
                  {autopilot ? "Autopilot" : "Paused"}
                </Badge>
              </div>
              <p className="mt-0.5 text-[11px] text-muted">{leadAgent?.role ?? "Your AI revenue agent"}</p>
            </div>
            <Link
              to="/agent"
              className="grid size-8 place-items-center rounded-lg border border-line text-muted transition-colors hover:border-line-strong hover:text-ink"
              aria-label="Open agent"
            >
              <ArrowUpRight size={15} />
            </Link>
          </div>

          <div className="mt-5 flex items-center gap-3">
            <AgentAvatar size="lg" online={leadAgent?.availability !== "unavailable"} />
            <div className="min-w-0">
              <div className="text-[13px] font-medium text-ink">{leadAgent?.model ?? "Je.el Agent"}</div>
              <div className="mt-0.5 text-[10.5px] text-faint">
                {leadAgent?.capabilities.slice(0, 3).join(" · ") ?? "Inbox, follow-ups & scheduling"}
              </div>
            </div>
            {leadAgent && (
              <Badge tone={AVAILABILITY_META[leadAgent.availability].tone} className="ml-auto" dot>
                {AVAILABILITY_META[leadAgent.availability].label}
              </Badge>
            )}
          </div>

          <div className="mt-5 flex items-center gap-5 rounded-xl border border-line bg-surface-2/60 p-3.5">
            <CircularGauge value={resolution} size={96} stroke={7} label={`${resolution}%`} sublabel="completed" />
            <div className="grid flex-1 gap-3">
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-muted">Runs</span>
                <span className="font-mono text-[12px] font-medium text-ink">{runs.length}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-muted">Awaiting</span>
                <span className="font-mono text-[12px] font-medium text-ink">{pendingRuns}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-muted">Failed</span>
                <span className="font-mono text-[12px] font-medium text-ink">
                  {runs.filter((run) => run.state === "failed" || run.state === "unavailable").length}
                </span>
              </div>
            </div>
          </div>

          <div className="mt-4">
            <div className="flex items-center justify-between text-[10.5px]">
              <span className="text-muted">Approval gate</span>
              <span className="font-mono text-ink">{pendingRuns} pending</span>
            </div>
            <ProgressBar value={runs.length ? (pendingRuns / runs.length) * 100 : 0} className="mt-2" tone="warning" />
            <p className="mt-2.5 flex items-start gap-1.5 text-[10.5px] leading-relaxed text-faint">
              <Sparkles size={11} className="mt-0.5 shrink-0 text-accent-text" />
              External actions never skip approval — autonomy only changes how much the agent drafts.
            </p>
          </div>

          <Link
            to="/agent"
            className="mt-4 flex items-center justify-between rounded-[10px] border border-line px-3 py-2.5 text-[12px] font-medium text-ink transition-colors hover:border-line-strong hover:bg-surface-2"
          >
            <span className="flex items-center gap-2">
              <MessageSquare size={14} className="text-muted" /> Open agent workspace
            </span>
            <ArrowRight size={14} className="text-muted" />
          </Link>
        </section>
      </div>

      {/* Bottom row */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <section className="card p-4 md:p-5 lg:col-span-5">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h2 className="flex items-center gap-2 text-[14px] font-semibold tracking-tight text-ink">
                Deals to watch
                <Badge tone="warning">{watchlist.length}</Badge>
              </h2>
              <p className="mt-0.5 text-[11px] text-muted">Closest to a decision</p>
            </div>
            <Link
              to="/kanban"
              className="text-[11px] font-medium text-muted transition-colors hover:text-ink"
            >
              View pipeline
            </Link>
          </div>

          <div className="mt-3 divide-y divide-line">
            {watchlist.map((deal) => {
              const owner = teamById(deal.ownerId);
              const due = dueMeta(deal.due);
              return (
                <button
                  key={deal.id}
                  onClick={() => navigate("/kanban")}
                  className="group flex w-full items-center gap-3 py-2.5 text-left"
                >
                  <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-surface-3 font-mono text-[10px] font-semibold text-muted">
                    {deal.company.slice(0, 2).toUpperCase()}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12px] font-medium text-ink">{deal.company}</span>
                    <span className="block truncate text-[10.5px] text-faint">
                      {deal.title} · {owner.name.split(" ")[0]}
                    </span>
                  </span>
                  <span className="hidden text-right sm:block">
                    <span className="block font-mono text-[12px] text-ink">{moneyCompact(deal.value)}</span>
                    <span
                      className={cn(
                        "mt-0.5 block text-[10px]",
                        due.overdue ? "text-accent-text" : due.soon ? "text-warning" : "text-faint",
                      )}
                    >
                      {due.label}
                    </span>
                  </span>
                  <span
                    className={cn(
                      "ml-1 hidden shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 font-mono text-[10px] md:flex",
                      deal.score >= 85 ? "bg-success-soft text-success" : "bg-warning-soft text-warning",
                    )}
                  >
                    <Flame size={9} />
                    {deal.score}
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        <section className="card p-4 md:p-5 lg:col-span-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-[14px] font-semibold tracking-tight text-ink">Today</h2>
              <p className="mt-0.5 text-[11px] text-muted">
                {agenda.length} events · {scheduledPosts} posts scheduled
              </p>
            </div>
            <Link
              to="/schedule"
              className="text-[11px] font-medium text-muted transition-colors hover:text-ink"
            >
              Calendar
            </Link>
          </div>

          <div className="relative mt-4 space-y-0.5">
            <div className="absolute bottom-3 left-[7px] top-3 w-px bg-line" aria-hidden />
            {agenda.map((item) => {
              const style = agendaStyles[item.kind];
              const Icon = style.icon;
              return (
                <div key={item.id} className="group relative flex gap-3 py-1.5">
                  <span className="relative z-10 mt-1 grid size-[15px] shrink-0 place-items-center rounded-full border border-line bg-surface">
                    <span className="size-1.5 rounded-full bg-line-strong transition-colors group-hover:bg-accent" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2">
                      <span className="font-mono text-[10px] text-faint">{item.time}</span>
                      <span className="truncate text-[12px] font-medium text-ink">{item.title}</span>
                    </div>
                    <div className="mt-0.5 flex items-center gap-1.5 text-[10.5px] text-faint">
                      <Icon size={10} className={style.className.split(" ")[1]} />
                      <span className="truncate">{item.meta}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-3 flex items-center gap-2 rounded-lg border border-dashed border-line px-2.5 py-2 text-[10.5px] text-faint">
            <Sparkles size={11} className="text-accent-text" />
            {leadAgent?.name ?? "The agent"} rebalanced your afternoon to protect focus time.
          </div>
        </section>

        <section className="card flex flex-col p-4 md:p-5 lg:col-span-3">
          <div className="flex items-center justify-between">
            <h2 className="text-[14px] font-semibold tracking-tight text-ink">Agent activity</h2>
            <span className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.12em] text-faint">
              <span className="size-1.5 rounded-full bg-line-strong" />
              Demo
            </span>
          </div>
          <div className="mt-3 flex-1 space-y-3">
            {audit.slice(0, 5).map((activity) => {
              const style = auditStyles[activity.entityType];
              const Icon = style.icon;
              return (
                <div key={activity.id} className="flex gap-2.5">
                  <span className={cn("mt-0.5 grid size-6 shrink-0 place-items-center rounded-md", style.className)}>
                    <Icon size={12} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[11.5px] leading-snug text-ink">{activity.action}</p>
                    <p className="mt-0.5 truncate text-[10px] text-faint">
                      {activity.meta ?? activity.entityType}
                      {activity.result !== "ok" ? ` · ${activity.result}` : ""}
                    </p>
                  </div>
                  <span className="shrink-0 font-mono text-[9.5px] text-faint">{activity.time}</span>
                </div>
              );
            })}
            {audit.length === 0 && (
              <p className="text-[10.5px] text-faint">No audit events in this workspace yet.</p>
            )}
          </div>
          <Link
            to="/agent"
            className="mt-4 flex items-center justify-between border-t border-line pt-3 text-[11px] font-medium text-muted transition-colors hover:text-ink"
          >
            See all agent runs
            <ArrowRight size={12} />
          </Link>
        </section>
      </div>

      {/* Footnote */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-1 pt-1 text-[10.5px] text-faint">
        <span className="flex items-center gap-1.5">
          <CircleHelp size={11} />
          Demo dataset — figures are illustrative, stored in this session, and never presented as live sync.
        </span>
        <span className="font-mono">No external connections</span>
      </div>
    </div>
  );
}
