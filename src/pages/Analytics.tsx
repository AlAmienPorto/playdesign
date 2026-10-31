import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ArrowDownToLine, BarChart3, PieChart as PieIcon, Target, TrendingUp } from "lucide-react";
import { ASSET_STATUS_META, PROJECT_STATUS_META, financeSummary } from "../data/business";
import { useStore } from "../lib/store";
import { cn, formatDay, money, moneyCompact } from "../lib/utils";
import { Badge, Button, PageHeader, ProgressBar, Segmented } from "../components/ui";

const stageLabel: Record<string, string> = {
  new: "New",
  qualified: "Qualified",
  proposal: "Proposal",
  negotiation: "Negotiation",
  won: "Won",
};

const stageColor: Record<string, string> = {
  new: "#72a0ff",
  qualified: "#4e7c6a",
  proposal: "#c9822e",
  negotiation: "#a65e4e",
  won: "#bf0b0b",
};

function tooltipStyle() {
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
  };
}

export default function Analytics() {
  const { deals, projects, tasks, assets, transactions, clients, workspace, runs, agents } = useStore();
  const [range, setRange] = useState<"30D" | "90D" | "6M">("90D");
  const [exported, setExported] = useState("");

  const summary = financeSummary(transactions, workspace.id);

  const monthly = useMemo(() => {
    const months = new Map<string, { income: number; expense: number }>();
    transactions
      .filter((entry) => entry.status === "posted")
      .forEach((entry) => {
        const key = entry.date.slice(0, 7);
        const current = months.get(key) ?? { income: 0, expense: 0 };
        if (entry.type === "income") current.income += entry.amount;
        else current.expense += entry.amount;
        months.set(key, current);
      });
    return Array.from(months.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .slice(-6)
      .map(([key, value]) => ({
        label: formatDay(`${key}-01`, "MMM"),
        income: value.income,
        expense: value.expense,
      }));
  }, [transactions]);

  const pipeline = useMemo(
    () =>
      ["new", "qualified", "proposal", "negotiation", "won"].map((stage) => {
        const entries = deals.filter((deal) => deal.stage === stage);
        return {
          stage,
          label: stageLabel[stage],
          count: entries.length,
          value: entries.reduce((sum, deal) => sum + deal.value, 0),
        };
      }),
    [deals],
  );

  const projectStatus = useMemo(
    () =>
      (Object.keys(PROJECT_STATUS_META) as (keyof typeof PROJECT_STATUS_META)[]).map((status) => ({
        status,
        label: PROJECT_STATUS_META[status].label,
        count: projects.filter((project) => project.status === status).length,
      })),
    [projects],
  );

  const taskCounts = {
    backlog: tasks.filter((task) => task.status === "backlog").length,
    in_progress: tasks.filter((task) => task.status === "in_progress").length,
    review: tasks.filter((task) => task.status === "review").length,
    done: tasks.filter((task) => task.status === "done").length,
  };

  const assetFunnel = useMemo(
    () =>
      (Object.keys(ASSET_STATUS_META) as (keyof typeof ASSET_STATUS_META)[]).map((status) => ({
        status,
        label: ASSET_STATUS_META[status].label,
        count: assets.filter((asset) => asset.status === status).length,
      })),
    [assets],
  );

  const clientRevenue = useMemo(() => {
    return clients
      .map((client) => ({
        client,
        income: transactions
          .filter((entry) => entry.clientId === client.id && entry.type === "income" && entry.status === "posted")
          .reduce((sum, entry) => sum + entry.amount, 0),
      }))
      .filter((entry) => entry.income > 0)
      .sort((a, b) => b.income - a.income)
      .slice(0, 5);
  }, [clients, transactions]);

  const openPipeline = deals.filter((deal) => deal.stage !== "won").reduce((sum, deal) => sum + deal.value, 0);
  const wonValue = deals.filter((deal) => deal.stage === "won").reduce((sum, deal) => sum + deal.value, 0);
  const completion = tasks.length ? Math.round((taskCounts.done / tasks.length) * 100) : 0;
  const agentApproved = runs.filter((run) => run.state === "approved").length;

  const exportReport = () => {
    const lines = [
      ["metric", "value"],
      ["workspace", workspace.name],
      ["income_posted", String(summary.income)],
      ["expense_posted", String(summary.expense)],
      ["net", String(summary.net)],
      ["cash_balance", String(summary.balance)],
      ["open_pipeline", String(openPipeline)],
      ["won_value", String(wonValue)],
      ["task_completion_pct", String(completion)],
      ["active_projects", String(projects.filter((project) => project.status === "active").length)],
      ["agent_approved_runs", String(agentApproved)],
    ];
    const csv = lines.map((row) => row.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `playdesign-analytics-${workspace.id}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
    setExported("Summary exported as CSV. Nothing left your browser.");
    window.setTimeout(() => setExported(""), 3000);
  };

  return (
    <div>
      <PageHeader
        eyebrow="Intelligence"
        title="Analytics"
        description={`How ${workspace.name} is performing across sales, delivery and cash. Every figure is derived from the demo dataset — no live warehouse.`}
      >
        <Segmented
          value={range}
          onChange={setRange}
          size="sm"
          options={[
            { value: "30D", label: "30D" },
            { value: "90D", label: "90D" },
            { value: "6M", label: "6M" },
          ]}
        />
        <Button variant="outline" onClick={exportReport}>
          <ArrowDownToLine size={15} /> Export summary
        </Button>
      </PageHeader>

      {exported && (
        <div className="mb-4 rounded-xl border border-success/25 bg-success-soft/60 px-3.5 py-2.5 text-[11.5px] text-success">
          {exported}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3.5 xl:grid-cols-4">
        {[
          { label: "Open pipeline", value: moneyCompact(openPipeline), note: `${deals.filter((deal) => deal.stage !== "won").length} deals`, icon: TrendingUp, className: "bg-info-soft text-info" },
          { label: "Won value", value: moneyCompact(wonValue), note: "Closed deals", icon: Target, className: "bg-success-soft text-success" },
          { label: "Task completion", value: `${completion}%`, note: `${taskCounts.done}/${tasks.length} done`, icon: BarChart3, className: "bg-accent-soft text-accent-text" },
          { label: "Cash balance", value: moneyCompact(summary.balance), note: "Posted entries", icon: PieIcon, className: "bg-warning-soft text-warning" },
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

      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-12">
        <section className="card overflow-hidden xl:col-span-7">
          <div className="flex items-center justify-between px-4 py-3">
            <div>
              <h2 className="text-[13.5px] font-semibold tracking-tight text-ink">Income vs expense</h2>
              <p className="mt-0.5 text-[10.5px] text-muted">Posted transactions grouped by month.</p>
            </div>
            <Badge tone="neutral">{range === "6M" ? "6 months" : range}</Badge>
          </div>
          <div className="h-[240px] px-2 pb-3">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthly} margin={{ top: 8, right: 16, left: 0, bottom: 0 }} barGap={4}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--border))" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 9.5, fill: "rgb(var(--fg-faint))" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 9.5, fill: "rgb(var(--fg-faint))" }} axisLine={false} tickLine={false} width={46} tickFormatter={(value) => moneyCompact(Number(value))} />
                <Tooltip {...tooltipStyle()} formatter={(value, name) => [money(Number(value)), name === "income" ? "Income" : "Expense"]} />
                <Bar dataKey="income" fill="rgb(var(--success))" radius={[4, 4, 0, 0]} maxBarSize={22} />
                <Bar dataKey="expense" fill="rgb(var(--accent))" radius={[4, 4, 0, 0]} maxBarSize={22} opacity={0.75} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="card overflow-hidden xl:col-span-5">
          <div className="px-4 py-3">
            <h2 className="text-[13.5px] font-semibold tracking-tight text-ink">Pipeline by stage</h2>
            <p className="mt-0.5 text-[10.5px] text-muted">Deal count and value, not weighted probability.</p>
          </div>
          <div className="flex items-center gap-2 px-4 pb-4">
            <div className="h-[150px] w-[150px] shrink-0">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={pipeline} dataKey="count" nameKey="label" innerRadius={44} outerRadius={68} paddingAngle={2} stroke="none">
                    {pipeline.map((entry) => (
                      <Cell key={entry.stage} fill={stageColor[entry.stage]} />
                    ))}
                  </Pie>
                  <Tooltip {...tooltipStyle()} formatter={(value, name) => [`${value} deals`, name]} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="min-w-0 flex-1 space-y-1.5">
              {pipeline.map((entry) => (
                <div key={entry.stage} className="flex items-center justify-between gap-2 text-[10px]">
                  <span className="flex min-w-0 items-center gap-1.5 text-muted">
                    <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: stageColor[entry.stage] }} />
                    <span className="truncate">{entry.label}</span>
                  </span>
                  <span className="font-mono text-ink">{entry.count}</span>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-3">
        <section className="card p-4">
          <h2 className="text-[13px] font-semibold tracking-tight text-ink">Tasks by status</h2>
          <p className="mt-0.5 text-[10px] text-muted">{tasks.length} tasks across the workspace.</p>
          <div className="mt-3 space-y-2.5">
            {[
              { label: "Backlog", value: taskCounts.backlog, tone: "info" as const },
              { label: "In progress", value: taskCounts.in_progress, tone: "accent" as const },
              { label: "In review", value: taskCounts.review, tone: "warning" as const },
              { label: "Done", value: taskCounts.done, tone: "success" as const },
            ].map((row) => (
              <div key={row.label}>
                <div className="flex items-center justify-between text-[10px]">
                  <span className="text-muted">{row.label}</span>
                  <span className="font-mono text-ink">{row.value}</span>
                </div>
                <ProgressBar
                  value={tasks.length ? (row.value / tasks.length) * 100 : 0}
                  className="mt-1"
                  tone={row.tone}
                />
              </div>
            ))}
          </div>
        </section>

        <section className="card p-4">
          <h2 className="text-[13px] font-semibold tracking-tight text-ink">Projects by status</h2>
          <p className="mt-0.5 text-[10px] text-muted">{projects.length} projects in this workspace.</p>
          <div className="mt-3 space-y-1.5">
            {projectStatus.map((row) => (
              <div key={row.status} className="flex items-center justify-between rounded-lg px-2 py-1.5 text-[10.5px] odd:bg-surface-2/50">
                <span className="text-muted">{row.label}</span>
                <span className="font-mono text-ink">{row.count}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="card p-4">
          <h2 className="text-[13px] font-semibold tracking-tight text-ink">Creative review funnel</h2>
          <p className="mt-0.5 text-[10px] text-muted">{assets.length} assets at different gates.</p>
          <div className="mt-3 space-y-1.5">
            {assetFunnel.map((row) => (
              <div key={row.status} className="flex items-center justify-between rounded-lg px-2 py-1.5 text-[10.5px] odd:bg-surface-2/50">
                <span className="text-muted">{row.label}</span>
                <span className="font-mono text-ink">{row.count}</span>
              </div>
            ))}
          </div>
        </section>
      </div>

      <section className="card mt-4 overflow-hidden">
        <div className="px-4 py-3">
          <h2 className="text-[13.5px] font-semibold tracking-tight text-ink">Top clients by collected income</h2>
          <p className="mt-0.5 text-[10.5px] text-muted">Posted income only. Concentration risk is shown, not scored.</p>
        </div>
        <div className="space-y-2.5 px-4 pb-4">
          {clientRevenue.map(({ client, income }) => {
            const share = summary.income ? Math.round((income / summary.income) * 100) : 0;
            return (
              <div key={client.id}>
                <div className="flex items-center justify-between text-[10.5px]">
                  <span className="text-ink">{client.company}</span>
                  <span className="font-mono text-muted">{money(income)} · {share}%</span>
                </div>
                <ProgressBar value={share} className="mt-1" tone={share >= 30 ? "warning" : "success"} />
              </div>
            );
          })}
          {clientRevenue.length === 0 && (
            <p className="py-4 text-center text-[11px] text-faint">No posted client income in this workspace yet.</p>
          )}
        </div>
      </section>

      <p className="mt-3 text-[9.5px] text-faint">
        Reports use the same workspace-scoped data as the pages above. Agent activity: {agentApproved} approved run
        {agentApproved === 1 ? "" : "s"} out of {runs.length} across {agents.length} agents.
      </p>
    </div>
  );
}
