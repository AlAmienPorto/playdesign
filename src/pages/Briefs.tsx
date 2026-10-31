import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { AlertTriangle, CheckCircle2, CircleDollarSign, Clock3, FileText, Plus, ShieldCheck } from "lucide-react";
import { NewBriefModal } from "../components/NewBriefModal";
import { BriefDrawer } from "../components/BriefDrawer";
import { BRIEF_STATUS_META, briefStatus, type BriefStatus } from "../data/briefs";
import { useStore } from "../lib/store";
import { formatDay, money } from "../lib/utils";
import { Badge, Button, PageHeader, Segmented } from "../components/ui";

type Filter = "all" | BriefStatus;

export default function Briefs() {
  const { briefs, addBrief } = useStore();
  const [searchParams, setSearchParams] = useSearchParams();
  const [filter, setFilter] = useState<Filter>("all");
  const [intakeOpen, setIntakeOpen] = useState(false);
  const [message, setMessage] = useState("");

  const selected = briefs.find((brief) => brief.id === searchParams.get("brief")) ?? null;
  const counts = {
    all: briefs.length,
    needs_info: briefs.filter((brief) => briefStatus(brief) === "needs_info").length,
    ready: briefs.filter((brief) => briefStatus(brief) === "ready").length,
    approved: briefs.filter((brief) => briefStatus(brief) === "approved").length,
  };

  const order: Record<BriefStatus, number> = { needs_info: 0, ready: 1, approved: 2 };
  const sorted = [...briefs].sort(
    (a, b) => order[briefStatus(a)] - order[briefStatus(b)] || Date.parse(b.createdAt) - Date.parse(a.createdAt),
  );
  const visible = filter === "all" ? sorted : sorted.filter((brief) => briefStatus(brief) === filter);

  useEffect(() => {
    if (!message) return;
    const timer = window.setTimeout(() => setMessage(""), 4000);
    return () => window.clearTimeout(timer);
  }, [message]);

  const openBrief = (id: string) => setSearchParams({ brief: id });
  const closeBrief = () => setSearchParams({});

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Workspace"
        title="Brief intake"
        description="Paste a client email or form submission. The agent extracts deliverables, deadline and budget, asks for anything missing, and the owner approves the scope before production starts."
      >
        <Button variant="primary" onClick={() => setIntakeOpen(true)}>
          <Plus size={15} /> New brief
        </Button>
      </PageHeader>

      {message && (
        <div className="flex items-center gap-2 rounded-xl border border-success/25 bg-success-soft/60 px-3.5 py-2.5 text-[11.5px] text-success">
          <CheckCircle2 size={14} /> {message}
        </div>
      )}

      <div className="grid gap-2.5 sm:grid-cols-3">
        <button
          onClick={() => setFilter("needs_info")}
          className="card flex items-start gap-3 p-3.5 text-left transition-colors hover:bg-surface-2/60"
        >
          <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-warning-soft text-warning">
            <AlertTriangle size={15} />
          </span>
          <span>
            <span className="block text-[20px] font-semibold tracking-tight text-ink">{counts.needs_info}</span>
            <span className="block text-[11px] text-muted">Needs information</span>
          </span>
        </button>
        <button
          onClick={() => setFilter("ready")}
          className="card flex items-start gap-3 p-3.5 text-left transition-colors hover:bg-surface-2/60"
        >
          <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-accent-soft text-accent-text">
            <ShieldCheck size={15} />
          </span>
          <span>
            <span className="block text-[20px] font-semibold tracking-tight text-ink">{counts.ready}</span>
            <span className="block text-[11px] text-muted">Ready for scope</span>
          </span>
        </button>
        <button
          onClick={() => setFilter("approved")}
          className="card flex items-start gap-3 p-3.5 text-left transition-colors hover:bg-surface-2/60"
        >
          <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-success-soft text-success">
            <CheckCircle2 size={15} />
          </span>
          <span>
            <span className="block text-[20px] font-semibold tracking-tight text-ink">{counts.approved}</span>
            <span className="block text-[11px] text-muted">Scope approved</span>
          </span>
        </button>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmented
          value={filter}
          onChange={setFilter}
          options={[
            { value: "all", label: "All", count: counts.all },
            { value: "needs_info", label: "Needs info", count: counts.needs_info },
            { value: "ready", label: "Ready", count: counts.ready },
            { value: "approved", label: "Approved", count: counts.approved },
          ]}
        />
        <p className="text-[10.5px] text-faint">
          Scope approval is owner-only · production tasks are created on approval
        </p>
      </div>

      {visible.length === 0 ? (
        <div className="card grid place-items-center gap-2 px-6 py-14 text-center">
          <span className="grid size-11 place-items-center rounded-xl bg-surface-3 text-faint">
            <FileText size={18} />
          </span>
          <h2 className="text-[14px] font-semibold text-ink">No briefs in this view</h2>
          <p className="max-w-sm text-[11.5px] leading-relaxed text-muted">
            New briefs arrive from email or the intake form. The agent will extract the scope and ask for what is
            missing before the owner can approve.
          </p>
          <Button variant="secondary" size="sm" className="mt-1" onClick={() => setIntakeOpen(true)}>
            <Plus size={13} /> Add the first brief
          </Button>
        </div>
      ) : (
        <div className="grid gap-3 xl:grid-cols-2">
          {visible.map((brief) => {
            const status = briefStatus(brief);
            const meta = BRIEF_STATUS_META[status];
            return (
              <button
                key={brief.id}
                onClick={() => openBrief(brief.id)}
                className="card group w-full p-4 text-left transition-colors hover:bg-surface-2/50"
              >
                <div className="flex flex-wrap items-center gap-1.5">
                  <Badge tone={meta.tone} dot>
                    {meta.label}
                  </Badge>
                  <Badge tone="outline">{brief.source === "email" ? "Email" : "Form"}</Badge>
                  <span className="ml-auto font-mono text-[10px] text-faint">{brief.confidence}% confidence</span>
                </div>
                <h2 className="mt-2.5 text-[15px] font-semibold tracking-tight text-ink">
                  {brief.project}
                </h2>
                <p className="mt-0.5 text-[11.5px] text-muted">{brief.client}</p>
                <p className="mt-2 line-clamp-2 text-[11.5px] leading-relaxed text-faint">{brief.raw}</p>

                <div className="mt-2.5 flex flex-wrap gap-1">
                  {brief.deliverables.slice(0, 3).map((deliverable) => (
                    <span
                      key={deliverable.id}
                      className="rounded-md bg-surface-3 px-1.5 py-0.5 text-[10.5px] text-muted"
                    >
                      {deliverable.title}
                    </span>
                  ))}
                  {brief.deliverables.length > 3 && (
                    <span className="rounded-md bg-surface-3 px-1.5 py-0.5 text-[10.5px] text-faint">
                      +{brief.deliverables.length - 3}
                    </span>
                  )}
                  {brief.deliverables.length === 0 && (
                    <span className="text-[10.5px] text-warning">No deliverable identified</span>
                  )}
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-line pt-2.5 text-[10.5px] text-faint">
                  <span className="inline-flex items-center gap-1">
                    <Clock3 size={10} />
                    {brief.deadline ? formatDay(brief.deadline, "MMM d") : "Deadline missing"}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <CircleDollarSign size={10} />
                    {brief.budget !== undefined ? money(brief.budget) : "Budget missing"}
                  </span>
                  <span className="ml-auto inline-flex items-center gap-1 text-muted">
                    {status === "needs_info"
                      ? `${brief.questions.length} question${brief.questions.length === 1 ? "" : "s"}`
                      : status === "ready"
                        ? "Review scope"
                        : `${brief.taskIds.length} task${brief.taskIds.length === 1 ? "" : "s"}`}
                    <span className="transition-transform group-hover:translate-x-0.5">→</span>
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      )}

      <div className="flex items-center gap-1.5 px-1 text-[10px] text-faint">
        <FileText size={10} /> Demo dataset · synthetic clients · extraction runs locally, no external calls.
      </div>

      {intakeOpen && (
        <NewBriefModal
          onClose={() => setIntakeOpen(false)}
          onSubmit={(values) => {
            const id = addBrief(values);
            openBrief(id);
          }}
        />
      )}

      {selected && (
        <BriefDrawer key={selected.id} brief={selected} onClose={closeBrief} onMessage={setMessage} />
      )}
    </div>
  );
}
