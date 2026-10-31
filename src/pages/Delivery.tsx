import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock3,
  Code2,
  Database,
  FileText,
  ListChecks,
  Loader2,
  Play,
  Search,
  ShieldCheck,
  Sparkles,
  Wrench,
} from "lucide-react";
import {
  DELIVERY_RUN_META,
  FINDING_META,
  PLAN_STATUS_META,
  PRD_DOC,
  PRD_MODULES,
  dependencyReady,
  type DeliveryAnalysis,
  type DeliveryMode,
  type DeliveryPlanItem,
  type DeliveryRun,
} from "../data/delivery";
import { useStore } from "../lib/store";
import { cn } from "../lib/utils";
import { Badge, Button, PageHeader } from "../components/ui";
import { DeliveryRunDrawer } from "../components/DeliveryRunDrawer";

const modes: {
  id: DeliveryMode;
  step: string;
  label: string;
  detail: string;
  icon: typeof Search;
}[] = [
  {
    id: "analysis",
    step: "01",
    label: "Analysis",
    detail: "Read the PRD, audit the repository, find gaps and draft the backlog.",
    icon: Search,
  },
  {
    id: "planning",
    step: "02",
    label: "Planning",
    detail: "Break the backlog into dependency-ordered tasks with migrations and contracts.",
    icon: ListChecks,
  },
  {
    id: "implementation",
    step: "03",
    label: "Implementation",
    detail: "Run one module at a time, check it and validate against the PRD.",
    icon: Wrench,
  },
];

const coverageMeta = {
  shipped: { label: "Shipped", dot: "bg-success" },
  partial: { label: "Partial", dot: "bg-warning" },
  missing: { label: "Missing", dot: "bg-line-strong" },
} as const;

const repoMeta = {
  detected: { icon: CheckCircle2, className: "text-success" },
  gap: { icon: AlertTriangle, className: "text-warning" },
  decision: { icon: ShieldCheck, className: "text-info" },
} as const;

export default function Delivery() {
  const {
    workspace,
    deliveryAnalysis,
    deliveryPlan,
    deliveryRuns,
    runDeliveryAnalysis,
    draftDeliveryPlan,
    approveDeliveryPlan,
    startDeliveryRun,
  } = useStore();
  const [params, setParams] = useSearchParams();
  const [busy, setBusy] = useState<"analysis" | "planning" | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const modeParam = params.get("mode");
  const mode: DeliveryMode =
    modeParam === "planning" || modeParam === "implementation" ? modeParam : "analysis";
  const selectedRun = deliveryRuns.find((run) => run.id === params.get("run")) ?? null;

  const setMode = (next: DeliveryMode) => {
    setError("");
    setParams(next === "analysis" ? {} : { mode: next });
  };
  const openRun = (id: string) => setParams({ mode: "implementation", run: id });
  const closeRun = () => setParams({ mode: "implementation" });

  const findings = deliveryAnalysis?.findings ?? [];
  const gaps = findings.filter((finding) => finding.kind === "gap").length;
  const approved = deliveryPlan.filter((item) => item.status === "approved");
  const inReview = deliveryPlan.filter((item) => item.status === "in_review");
  const validated = deliveryPlan.filter((item) => item.status === "validated");
  const eligible = deliveryPlan.filter(
    (item) => item.status === "queued" && dependencyReady(item, deliveryPlan),
  );

  const runAnalysis = () => {
    if (busy) return;
    setError("");
    setMessage("");
    setBusy("analysis");
    window.setTimeout(() => {
      const result = runDeliveryAnalysis();
      setBusy(null);
      if (!result.ok) {
        setError(result.error ?? "The analysis could not be completed.");
        return;
      }
      setMessage("Analysis complete · findings and backlog are ready for planning.");
    }, 900);
  };

  const draftPlan = () => {
    if (busy) return;
    setError("");
    setMessage("");
    setBusy("planning");
    window.setTimeout(() => {
      const result = draftDeliveryPlan();
      setBusy(null);
      if (!result.ok) {
        setError(result.error ?? "The plan could not be drafted.");
        return;
      }
      setMessage("Plan drafted · dependency order and acceptance criteria are ready for approval.");
    }, 800);
  };

  const approvePlan = () => {
    setError("");
    setMessage("");
    const ids = eligible.map((item) => item.id);
    const result = approveDeliveryPlan(ids);
    if (!result.ok) {
      setError(result.error ?? "The plan could not be approved.");
      return;
    }
    setMessage(
      `Plan approved · ${ids.length} task${ids.length === 1 ? "" : "s"} created in the backlog. Nothing was coded or deployed.`,
    );
  };

  const runImplementation = (itemId: string) => {
    setError("");
    setMessage("");
    const result = startDeliveryRun(itemId);
    if (!result.ok) {
      setError(result.error ?? "The implementation run could not start.");
      return;
    }
    if (result.runId) openRun(result.runId);
  };

  const analysisDone = Boolean(deliveryAnalysis);

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Intelligence"
        title="AI delivery"
        description={`A PRD-driven build loop for ${workspace.name}: the agent analyses the spec and the repository, plans dependency-ordered modules, then implements one module at a time. Each stage stops for your approval.`}
      >
        {!deliveryAnalysis ? (
          <Button variant="primary" onClick={runAnalysis} disabled={busy === "analysis"}>
            {busy === "analysis" ? <Loader2 size={15} className="animate-spin" /> : <Search size={15} />}
            {busy === "analysis" ? "Analysing…" : "Run analysis"}
          </Button>
        ) : deliveryPlan.length === 0 ? (
          <Button variant="primary" onClick={draftPlan} disabled={busy === "planning"}>
            {busy === "planning" ? <Loader2 size={15} className="animate-spin" /> : <ListChecks size={15} />}
            {busy === "planning" ? "Drafting…" : "Draft plan"}
          </Button>
        ) : (
          <Button variant="primary" onClick={() => setMode("implementation")}>
            <Wrench size={15} /> Open implementation
          </Button>
        )}
      </PageHeader>

      {(message || error) && (
        <div
          className={cn(
            "flex items-center gap-2 rounded-xl border px-3.5 py-2.5 text-[11.5px]",
            error
              ? "border-warning/30 bg-warning-soft/50 text-warning"
              : "border-success/25 bg-success-soft/60 text-success",
          )}
        >
          {error ? <AlertTriangle size={14} /> : <CheckCircle2 size={14} />}
          <span>{error || message}</span>
        </div>
      )}

      <div className="grid gap-2.5 sm:grid-cols-3">
        {modes.map((entry) => {
          const Icon = entry.icon;
          const done =
            entry.id === "analysis"
              ? analysisDone
              : entry.id === "planning"
                ? deliveryPlan.length > 0
                : validated.length > 0;
          const metric =
            entry.id === "analysis"
              ? `${findings.length} findings`
              : entry.id === "planning"
                ? `${deliveryPlan.length} items`
                : `${validated.length}/${deliveryPlan.length} validated`;
          return (
            <button
              key={entry.id}
              onClick={() => setMode(entry.id)}
              className={cn(
                "card p-4 text-left transition-colors",
                mode === entry.id ? "ring-1 ring-accent/40" : "hover:bg-surface-2/50",
              )}
            >
              <div className="flex items-start justify-between">
                <span
                  className={cn(
                    "grid size-8 place-items-center rounded-lg",
                    done ? "bg-accent-soft text-accent-text" : "bg-surface-3 text-faint",
                  )}
                >
                  <Icon size={15} />
                </span>
                <span className="font-mono text-[9.5px] text-faint">{entry.step}</span>
              </div>
              <h2 className="mt-2.5 flex items-center gap-1.5 text-[13.5px] font-semibold text-ink">
                {entry.label} mode
                {done && <CheckCircle2 size={12} className="text-success" />}
              </h2>
              <p className="mt-1 text-[10.5px] leading-relaxed text-muted">{entry.detail}</p>
              <div className="mt-2 flex items-center gap-2">
                <Badge tone={done ? "success" : "neutral"}>{metric}</Badge>
                {mode === entry.id && (
                  <span className="font-mono text-[9px] uppercase tracking-[0.1em] text-accent-text">current</span>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {mode === "analysis" && (
        <AnalysisMode
          analysis={deliveryAnalysis}
          busy={busy === "analysis"}
          onRun={runAnalysis}
          onDraft={draftPlan}
          drafting={busy === "planning"}
          hasPlan={deliveryPlan.length > 0}
          onOpenPlanning={() => setMode("planning")}
          gaps={gaps}
          approved={approved.length}
          inReview={inReview.length}
          validated={validated.length}
        />
      )}

      {mode === "planning" && (
        <PlanningMode
          analysis={deliveryAnalysis}
          plan={deliveryPlan}
          busy={busy === "planning"}
          onDraft={draftPlan}
          onApprove={approvePlan}
          onOpenAnalysis={() => setMode("analysis")}
          eligible={eligible}
          error={error}
        />
      )}

      {mode === "implementation" && (
        <ImplementationMode
          analysis={deliveryAnalysis}
          plan={deliveryPlan}
          runs={deliveryRuns}
          onOpenPlanning={() => setMode("planning")}
          onOpenAnalysis={() => setMode("analysis")}
          onRun={runImplementation}
          onOpenRun={openRun}
        />
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-[10px] text-faint">
        <span className="flex items-center gap-1.5">
          <FileText size={10} /> Source: {PRD_DOC.name} · v{PRD_DOC.version} · owner-provided, read-only
        </span>
        <span className="font-mono">Demo workspace · simulated checks · no external model call</span>
      </div>

      {selectedRun && (
        <DeliveryRunDrawer
          key={selectedRun.id}
          run={selectedRun}
          item={deliveryPlan.find((item) => item.id === selectedRun.planItemId)}
          onClose={closeRun}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Analysis                                                            */
/* ------------------------------------------------------------------ */

function AnalysisMode({
  analysis,
  busy,
  onRun,
  onDraft,
  drafting,
  hasPlan,
  onOpenPlanning,
  gaps,
  approved,
  inReview,
  validated,
}: {
  analysis: DeliveryAnalysis | null;
  busy: boolean;
  onRun: () => void;
  onDraft: () => void;
  drafting: boolean;
  hasPlan: boolean;
  onOpenPlanning: () => void;
  gaps: number;
  approved: number;
  inReview: number;
  validated: number;
}) {
  if (!analysis) {
    return (
      <section className="card grid place-items-center gap-2 px-6 py-14 text-center">
        <span className="grid size-11 place-items-center rounded-xl bg-surface-3 text-faint">
          <Search size={18} />
        </span>
        <h2 className="text-[14px] font-semibold text-ink">No analysis in this workspace yet</h2>
        <p className="max-w-md text-[11.5px] leading-relaxed text-muted">
          The agent reads the PRD and the local repository, lists gaps against the spec, records open decisions
          and drafts an implementation backlog. It does not change code or infrastructure.
        </p>
        <Button variant="primary" size="sm" className="mt-1" onClick={onRun} disabled={busy}>
          {busy ? <Loader2 size={13} className="animate-spin" /> : <Search size={13} />}
          {busy ? "Analysing…" : "Run analysis"}
        </Button>
        <p className="mt-1 text-[9.5px] text-faint">Local demo heuristic · no external model call.</p>
      </section>
    );
  }

  const shipped = PRD_MODULES.filter((module) => module.coverage === "shipped").length;
  const partial = PRD_MODULES.filter((module) => module.coverage === "partial").length;
  const missing = PRD_MODULES.filter((module) => module.coverage === "missing").length;
  const openDecisions = analysis.decisions.filter((decision) => decision.status === "pending").length;

  return (
    <div className="space-y-4">
      <section className="card p-4 md:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-[14px] font-semibold tracking-tight text-ink">
              <Sparkles size={14} className="text-accent-text" />
              What the agent understood
            </h2>
            <p className="mt-0.5 text-[10.5px] text-muted">Product reading before any code is written</p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <Badge tone="warning" dot>
              {gaps} gaps
            </Badge>
            <Badge tone="neutral">{openDecisions} open decisions</Badge>
            <Badge tone="success" dot>
              {shipped} modules shipped
            </Badge>
          </div>
        </div>
        <ul className="mt-3 space-y-1.5">
          {analysis.understanding.map((entry) => (
            <li key={entry} className="flex items-start gap-2 text-[11.5px] leading-relaxed text-muted">
              <span className="mt-1.5 size-1 shrink-0 rounded-full bg-accent" />
              {entry}
            </li>
          ))}
        </ul>
      </section>

      <div className="grid gap-4 xl:grid-cols-12">
        <section className="card overflow-hidden xl:col-span-8">
          <div className="flex items-center justify-between px-4 py-3.5">
            <div>
              <h2 className="text-[14px] font-semibold tracking-tight text-ink">Findings vs the PRD</h2>
              <p className="mt-0.5 text-[10.5px] text-muted">Gaps, partials, risks and decisions found in this repo</p>
            </div>
            <span className="font-mono text-[9px] uppercase tracking-[0.1em] text-faint">{analysis.findings.length} items</span>
          </div>
          <div>
            {analysis.findings.map((finding) => {
              const meta = FINDING_META[finding.kind];
              return (
                <div key={finding.id} className="border-t border-line px-4 py-3">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge tone={meta.tone} dot>
                      {meta.label}
                    </Badge>
                    <span
                      className={cn(
                        "font-mono text-[9px] uppercase tracking-[0.08em]",
                        finding.severity === "high" ? "text-warning" : "text-faint",
                      )}
                    >
                      {finding.severity}
                    </span>
                    <span className="ml-auto font-mono text-[9px] text-faint">{finding.refs.join(" · ")}</span>
                  </div>
                  <h3 className="mt-1.5 text-[12px] font-medium text-ink">{finding.title}</h3>
                  <p className="mt-0.5 text-[10.5px] leading-relaxed text-muted">{finding.detail}</p>
                </div>
              );
            })}
          </div>
        </section>

        <div className="space-y-4 xl:col-span-4">
          <section className="card overflow-hidden">
            <div className="px-4 py-3.5">
              <h2 className="text-[14px] font-semibold tracking-tight text-ink">PRD source</h2>
              <p className="mt-0.5 break-all font-mono text-[9.5px] leading-relaxed text-faint">{analysis.docName}</p>
            </div>
            <div className="grid grid-cols-3 gap-px border-y border-line bg-line">
              {[
                { label: "Shipped", value: shipped },
                { label: "Partial", value: partial },
                { label: "Missing", value: missing },
              ].map((stat) => (
                <div key={stat.label} className="bg-surface px-3 py-2.5 text-center">
                  <div className="font-mono text-[16px] font-medium leading-none text-ink">{stat.value}</div>
                  <div className="mt-1 text-[9px] text-faint">{stat.label}</div>
                </div>
              ))}
            </div>
            <div className="max-h-[290px] overflow-y-auto">
              {PRD_MODULES.map((module) => {
                const coverage = coverageMeta[module.coverage];
                return (
                  <div key={module.id} className="flex items-center gap-2 border-b border-line px-3 py-2 last:border-0">
                    <span className={cn("size-1.5 shrink-0 rounded-full", coverage.dot)} />
                    <span className="font-mono text-[9px] text-faint">{module.id}</span>
                    <span className="min-w-0 flex-1 truncate text-[10.5px] text-ink">{module.name}</span>
                    <span className="font-mono text-[9px] text-faint">{coverage.label}</span>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="card overflow-hidden">
            <div className="px-4 py-3.5">
              <h2 className="text-[14px] font-semibold tracking-tight text-ink">Repository audit</h2>
              <p className="mt-0.5 text-[10.5px] text-muted">What exists today, before any change</p>
            </div>
            <div>
              {analysis.repo.map((row) => {
                const meta = repoMeta[row.status];
                const Icon = meta.icon;
                return (
                  <div key={row.label} className="flex items-start gap-2.5 border-t border-line px-4 py-2.5">
                    <Icon size={12} className={cn("mt-0.5 shrink-0", meta.className)} />
                    <div className="min-w-0 flex-1">
                      <div className="text-[11px] font-medium text-ink">{row.label}</div>
                      <div className="mt-0.5 text-[10px] leading-relaxed text-faint">{row.value}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="card overflow-hidden">
            <div className="px-4 py-3.5">
              <h2 className="text-[14px] font-semibold tracking-tight text-ink">Open decisions</h2>
              <p className="mt-0.5 text-[10.5px] text-muted">Kept as pending, never invented</p>
            </div>
            <div>
              {analysis.decisions.map((decision) => (
                <div key={decision.id} className="border-t border-line px-4 py-2.5">
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono text-[9px] text-faint">{decision.id}</span>
                    <Badge tone={decision.status === "decided" ? "success" : "warning"}>
                      {decision.status === "decided" ? "Decided" : "Pending"}
                    </Badge>
                  </div>
                  <div className="mt-1 text-[11px] font-medium text-ink">{decision.title}</div>
                  <p className="mt-0.5 text-[10px] leading-relaxed text-faint">{decision.note}</p>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>

      <section className="card px-4 py-3">
        <h3 className="overline mb-1.5">Analysis limits</h3>
        <div className="space-y-1">
          {analysis.limitations.map((entry) => (
            <p key={entry} className="flex items-start gap-1.5 text-[10.5px] leading-relaxed text-muted">
              <AlertTriangle size={11} className="mt-0.5 shrink-0 text-warning" /> {entry}
            </p>
          ))}
        </div>
      </section>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-surface-2/60 px-4 py-3">
        <p className="text-[11px] leading-relaxed text-muted">
          Backlog is ready. Planning turns it into dependency-ordered tasks with migration, API contract and
          acceptance criteria — no code and no deployment yet.
        </p>
        <div className="flex items-center gap-2">
          <Badge tone="neutral">
            {approved} approved · {inReview} in review · {validated} validated
          </Badge>
          {hasPlan ? (
            <Button variant="primary" size="sm" onClick={onOpenPlanning}>
              Open planning <ArrowRight size={13} />
            </Button>
          ) : (
            <Button variant="primary" size="sm" onClick={onDraft} disabled={drafting}>
              {drafting ? <Loader2 size={13} className="animate-spin" /> : <ListChecks size={13} />}
              {drafting ? "Drafting…" : "Draft plan"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Planning                                                            */
/* ------------------------------------------------------------------ */

function PlanningMode({
  analysis,
  plan,
  busy,
  onDraft,
  onApprove,
  onOpenAnalysis,
  eligible,
  error,
}: {
  analysis: DeliveryAnalysis | null;
  plan: DeliveryPlanItem[];
  busy: boolean;
  onDraft: () => void;
  onApprove: () => void;
  onOpenAnalysis: () => void;
  eligible: DeliveryPlanItem[];
  error: string;
}) {
  if (!analysis) {
    return (
      <section className="card grid place-items-center gap-2 px-6 py-14 text-center">
        <span className="grid size-11 place-items-center rounded-xl bg-surface-3 text-faint">
          <ListChecks size={18} />
        </span>
        <h2 className="text-[14px] font-semibold text-ink">Planning is blocked</h2>
        <p className="max-w-sm text-[11.5px] leading-relaxed text-muted">
          The plan is built from the analysis. Run the analysis first so the agent has a reviewed gap list and
          backlog to split.
        </p>
        <Button variant="secondary" size="sm" className="mt-1" onClick={onOpenAnalysis}>
          <Search size={13} /> Go to analysis
        </Button>
      </section>
    );
  }

  if (plan.length === 0) {
    return (
      <section className="card grid place-items-center gap-2 px-6 py-14 text-center">
        <span className="grid size-11 place-items-center rounded-xl bg-surface-3 text-faint">
          <ListChecks size={18} />
        </span>
        <h2 className="text-[14px] font-semibold text-ink">No plan drafted yet</h2>
        <p className="max-w-md text-[11.5px] leading-relaxed text-muted">
          The planner splits the backlog into small modules, orders them by dependency and attaches a migration,
          API contract and acceptance criteria to each item.
        </p>
        <Button variant="primary" size="sm" className="mt-1" onClick={onDraft} disabled={busy}>
          {busy ? <Loader2 size={13} className="animate-spin" /> : <ListChecks size={13} />}
          {busy ? "Drafting…" : "Draft implementation plan"}
        </Button>
      </section>
    );
  }

  const blocked = plan.filter((item) => item.status === "queued" && !dependencyReady(item, plan));

  return (
    <div className="space-y-3">
      <section className="card flex flex-wrap items-center justify-between gap-3 px-4 py-3.5">
        <div>
          <h2 className="text-[14px] font-semibold tracking-tight text-ink">Dependency-ordered plan</h2>
          <p className="mt-0.5 max-w-2xl text-[10.5px] leading-relaxed text-muted">
            Each item carries a migration, API contract and acceptance criteria. Approving the plan only creates
            backlog tasks — it does not code, migrate or deploy anything.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="neutral">{blocked.length} waiting on dependencies</Badge>
          <Button variant="primary" size="sm" onClick={onApprove} disabled={eligible.length === 0}>
            <ShieldCheck size={13} /> Approve plan · {eligible.length} eligible
          </Button>
        </div>
      </section>

      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-warning/30 bg-warning-soft/50 px-3.5 py-2.5 text-[11px] text-warning">
          <AlertTriangle size={13} /> {error}
        </div>
      )}

      {plan.map((item, index) => {
        const meta = PLAN_STATUS_META[item.status];
        const ready = dependencyReady(item, plan);
        const dependencies = item.dependsOn
          .map((id) => plan.find((entry) => entry.id === id))
          .filter((entry): entry is DeliveryPlanItem => Boolean(entry));
        return (
          <article key={item.id} className="card overflow-hidden">
            <div className="flex flex-wrap items-start gap-3 px-4 py-3.5">
              <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-surface-3 font-mono text-[10px] text-muted">
                {String(index + 1).padStart(2, "0")}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="font-mono text-[10px] text-faint">{item.moduleId}</span>
                  <Badge tone={meta.tone} dot>
                    {meta.label}
                  </Badge>
                  {item.status === "queued" && !ready && <Badge tone="warning">Waiting on dependency</Badge>}
                  <span className="ml-auto font-mono text-[9.5px] text-faint">{item.estimate}</span>
                </div>
                <h3 className="mt-1 text-[13px] font-semibold text-ink">{item.title}</h3>
                <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[9.5px] text-faint">
                  <span>{item.area}</span>
                  {dependencies.length > 0 && (
                    <>
                      <span>·</span>
                      <span>Depends on {dependencies.map((dependency) => dependency.moduleId).join(", ")}</span>
                    </>
                  )}
                  {item.taskIds.length > 0 && (
                    <>
                      <span>·</span>
                      <Link to="/tasks" className="text-accent-text hover:underline">
                        {item.taskIds.length} task{item.taskIds.length === 1 ? "" : "s"} in backlog
                      </Link>
                    </>
                  )}
                </div>
              </div>
            </div>

            <div className="grid gap-px border-t border-line bg-line md:grid-cols-3">
              <div className="bg-surface px-4 py-3">
                <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-medium text-muted">
                  <Database size={11} className="text-faint" /> Migration
                </div>
                <p className="font-mono text-[10px] leading-relaxed text-ink">{item.migration}</p>
              </div>
              <div className="bg-surface px-4 py-3">
                <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-medium text-muted">
                  <Code2 size={11} className="text-faint" /> API contract
                </div>
                <ul className="space-y-0.5">
                  {item.api.map((route) => (
                    <li key={route} className="font-mono text-[10px] leading-relaxed text-ink">
                      {route}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="bg-surface px-4 py-3">
                <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-medium text-muted">
                  <CheckCircle2 size={11} className="text-faint" /> Acceptance criteria
                </div>
                <ul className="space-y-0.5">
                  {item.acceptance.map((criterion) => (
                    <li key={criterion} className="flex items-start gap-1.5 text-[10px] leading-relaxed text-muted">
                      <span className="mt-1.5 size-1 shrink-0 rounded-full bg-line-strong" />
                      {criterion}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </article>
        );
      })}

      <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-[10px] text-faint">
        <span className="flex items-center gap-1.5">
          <ShieldCheck size={10} /> Owner approval required · dependencies must be approved first
        </span>
        <span>Plan is a draft until approved.</span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Implementation                                                      */
/* ------------------------------------------------------------------ */

function ImplementationMode({
  analysis,
  plan,
  runs,
  onOpenPlanning,
  onOpenAnalysis,
  onRun,
  onOpenRun,
}: {
  analysis: DeliveryAnalysis | null;
  plan: DeliveryPlanItem[];
  runs: DeliveryRun[];
  onOpenPlanning: () => void;
  onOpenAnalysis: () => void;
  onRun: (itemId: string) => void;
  onOpenRun: (runId: string) => void;
}) {
  if (!analysis) {
    return <BlockedPanel title="Implementation is blocked" detail="Run the analysis first." action="Go to analysis" onAction={onOpenAnalysis} icon={Search} />;
  }
  if (plan.length === 0) {
    return <BlockedPanel title="No plan to implement" detail="Draft and approve a plan before running a module." action="Go to planning" onAction={onOpenPlanning} icon={ListChecks} />;
  }

  const validated = plan.filter((item) => item.status === "validated").length;
  const approved = plan.filter((item) => item.status === "approved").length;
  const review = plan.filter((item) => item.status === "in_review").length;

  return (
    <div className="space-y-3">
      <div className="grid gap-2.5 sm:grid-cols-3">
        {[
          { label: "Ready to run", value: approved, tone: "text-accent-text" },
          { label: "Waiting for validation", value: review, tone: "text-warning" },
          { label: "Validated against PRD", value: validated, tone: "text-success" },
        ].map((stat) => (
          <div key={stat.label} className="card px-4 py-3">
            <div className={cn("font-mono text-[20px] font-medium leading-none tracking-tight", stat.tone)}>
              {stat.value}
            </div>
            <div className="mt-1 text-[10.5px] text-muted">{stat.label}</div>
          </div>
        ))}
      </div>

      {plan.map((item) => {
        const run = runs.find((entry) => entry.planItemId === item.id);
        const meta = PLAN_STATUS_META[item.status];
        return (
          <article key={item.id} className="card flex flex-wrap items-start gap-3 px-4 py-3.5">
            <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-surface-3 text-muted">
              <Wrench size={14} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="font-mono text-[10px] text-faint">{item.moduleId}</span>
                <Badge tone={meta.tone} dot>
                  {meta.label}
                </Badge>
                {run && run.state !== "validated" && (
                  <Badge tone={DELIVERY_RUN_META[run.state].tone} dot>
                    {DELIVERY_RUN_META[run.state].label}
                  </Badge>
                )}
              </div>
              <h3 className="mt-1 text-[13px] font-semibold text-ink">{item.title}</h3>
              <p className="mt-0.5 text-[10.5px] text-muted">
                {item.area} · {item.estimate} ·{" "}
                {run
                  ? `last run ${run.time} · ${run.duration}`
                  : item.status === "approved"
                    ? "approved and ready to run"
                    : item.status === "queued"
                      ? "approve in planning first"
                      : "no run recorded"}
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              {item.status === "approved" && !run && (
                <Button variant="primary" size="sm" onClick={() => onRun(item.id)}>
                  <Play size={12} /> Run implementation
                </Button>
              )}
              {run && (
                <Button variant="outline" size="sm" onClick={() => onOpenRun(run.id)}>
                  <Clock3 size={12} />
                  {run.state === "awaiting_validation"
                    ? "Review & validate"
                    : run.state === "validated"
                      ? "View trail"
                      : "View run"}
                </Button>
              )}
              {item.status === "queued" && !run && (
                <Button variant="ghost" size="sm" onClick={onOpenPlanning}>
                  Open planning <ArrowRight size={12} />
                </Button>
              )}
            </div>
          </article>
        );
      })}

      <div className="flex items-center gap-1.5 px-1 text-[10px] text-faint">
        <AlertTriangle size={10} /> Runs are simulated against the plan. Owner validation records a sign-off — it is
        not a CI result.
      </div>
    </div>
  );
}

function BlockedPanel({
  title,
  detail,
  action,
  onAction,
  icon: Icon,
}: {
  title: string;
  detail: string;
  action: string;
  onAction: () => void;
  icon: typeof Search;
}) {
  return (
    <section className="card grid place-items-center gap-2 px-6 py-14 text-center">
      <span className="grid size-11 place-items-center rounded-xl bg-surface-3 text-faint">
        <Icon size={18} />
      </span>
      <h2 className="text-[14px] font-semibold text-ink">{title}</h2>
      <p className="max-w-sm text-[11.5px] leading-relaxed text-muted">{detail}</p>
      <Button variant="secondary" size="sm" className="mt-1" onClick={onAction}>
        {action}
      </Button>
    </section>
  );
}
