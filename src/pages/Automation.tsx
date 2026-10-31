import { useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Play,
  RotateCw,
  ShieldCheck,
  Sparkles,
  Workflow as WorkflowIcon,
  XCircle,
} from "lucide-react";
import { type AutomationExecution, type Workflow } from "../data/business";
import { useStore } from "../lib/store";
import { cn } from "../lib/utils";
import { Badge, Button, PageHeader, ProgressBar, Toggle } from "../components/ui";

const statusMeta: Record<AutomationExecution["status"], { label: string; tone: "success" | "warning" | "neutral"; icon: typeof CheckCircle2 }> = {
  success: { label: "Success", tone: "success", icon: CheckCircle2 },
  waiting: { label: "Waiting", tone: "warning", icon: Clock3 },
  failed: { label: "Failed", tone: "neutral", icon: XCircle },
};

function WorkflowCard({ workflow }: { workflow: Workflow }) {
  const { workflows, automationExecutions, toggleWorkflow, runWorkflow } = useStore();
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const current = workflows.find((entry) => entry.id === workflow.id) ?? workflow;
  const executions = automationExecutions.filter((entry) => entry.workflowId === workflow.id);
  const last = executions[0];

  const run = () => {
    setError("");
    setMessage("");
    const result = runWorkflow(workflow.id);
    if (!result.ok) {
      setError(result.error ?? "The workflow could not run.");
      return;
    }
    setMessage("Workflow executed against the demo dataset. Nothing external was called.");
    window.setTimeout(() => setMessage(""), 3200);
  };

  return (
    <section className="card overflow-hidden">
      <div className="flex items-start justify-between gap-3 px-4 py-3.5">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-[8.5px] uppercase tracking-[0.12em] text-faint">{workflow.code}</span>
            <Badge tone={current.active ? "success" : "neutral"} dot={current.active}>
              {current.active ? "Active" : "Paused"}
            </Badge>
          </div>
          <h2 className="mt-1 text-[13px] font-semibold tracking-tight text-ink">{workflow.name}</h2>
          <p className="mt-0.5 max-w-[440px] text-[10.5px] leading-relaxed text-muted">{workflow.description}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button variant="outline" size="sm" onClick={run} disabled={!current.active}>
            <Play size={12} /> Run now
          </Button>
          <Toggle checked={current.active} onChange={() => toggleWorkflow(workflow.id)} label={`Toggle ${workflow.name}`} />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-px border-t border-line bg-line sm:grid-cols-2">
        <div className="bg-surface px-4 py-3">
          <div className="font-mono text-[8.5px] uppercase tracking-[0.12em] text-faint">Trigger</div>
          <div className="mt-1 flex items-center gap-1.5 text-[10.5px] text-ink">
            <Sparkles size={11} className="text-accent-text" /> {workflow.trigger}
          </div>
          <div className="mt-2 space-y-1">
            {workflow.conditions.map((condition) => (
              <div key={condition} className="flex items-start gap-1.5 text-[9.5px] text-faint">
                <span className="mt-[5px] size-1 shrink-0 rounded-full bg-line-strong" />
                {condition}
              </div>
            ))}
          </div>
        </div>
        <div className="bg-surface px-4 py-3">
          <div className="font-mono text-[8.5px] uppercase tracking-[0.12em] text-faint">Actions</div>
          <div className="mt-1 flex flex-wrap gap-1">
            {workflow.actions.map((action) => (
              <span key={action} className="rounded-md border border-line bg-surface-2 px-1.5 py-0.5 text-[9px] text-muted">
                {action}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-4 py-2.5">
        <div className="flex items-center gap-3 text-[9px] text-faint">
          <span className="font-mono">{workflow.runs} runs</span>
          <span className="font-mono">{workflow.successRate}% success</span>
          <span>{last ? `Last: ${last.time} · ${last.status}` : "No executions yet"}</span>
        </div>
        <ProgressBar
          value={workflow.successRate}
          className="h-1 w-24"
          tone={workflow.successRate >= 95 ? "success" : workflow.successRate >= 80 ? "warning" : "accent"}
        />
      </div>

      {(message || error) && (
        <div
          className={cn(
            "border-t px-4 py-2 text-[10px]",
            error ? "border-warning/25 bg-warning-soft text-warning" : "border-success/25 bg-success-soft text-success",
          )}
        >
          {error || message}
        </div>
      )}
    </section>
  );
}

export default function Automation() {
  const { workflows, automationExecutions, workspace } = useStore();
  const [view, setView] = useState<"workflows" | "log">("workflows");

  const executions = useMemo(
    () => [...automationExecutions].sort((a, b) => b.at - a.at),
    [automationExecutions],
  );

  const active = workflows.filter((workflow) => workflow.active).length;
  const totalRuns = workflows.reduce((sum, workflow) => sum + workflow.runs, 0);
  const waiting = executions.filter((execution) => execution.status === "waiting").length;
  const failed = executions.filter((execution) => execution.status === "failed").length;
  const successRate = workflows.length
    ? Math.round(workflows.reduce((sum, workflow) => sum + workflow.successRate, 0) / workflows.length)
    : 0;

  return (
    <div>
      <PageHeader
        eyebrow="Intelligence"
        title="Automation"
        description={`Rules that move work forward in ${workspace.name}. Every run is simulated locally in this demo — no email, message or external system is touched.`}
      >
        <div className="flex items-center gap-1 rounded-[10px] border border-line bg-surface-2 p-0.5">
          {[
            { value: "workflows" as const, label: "Workflows" },
            { value: "log" as const, label: "Execution log" },
          ].map((tab) => (
            <button
              key={tab.value}
              onClick={() => setView(tab.value)}
              className={cn(
                "h-7 rounded-lg px-2.5 text-[11px] font-medium transition-colors",
                view === tab.value ? "bg-surface text-ink shadow-sm ring-1 ring-line" : "text-muted hover:text-ink",
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </PageHeader>

      <div className="grid grid-cols-2 gap-3.5 xl:grid-cols-4">
        {[
          { label: "Active workflows", value: String(active), note: `${workflows.length} configured`, icon: WorkflowIcon, className: "bg-success-soft text-success" },
          { label: "Recorded runs", value: String(totalRuns), note: "Demo counters", icon: RotateCw, className: "bg-info-soft text-info" },
          { label: "Avg. success rate", value: `${successRate}%`, note: "Across workflows", icon: ShieldCheck, className: "bg-accent-soft text-accent-text" },
          { label: "Waiting / failed", value: `${waiting} / ${failed}`, note: "Recent executions", icon: AlertTriangle, className: "bg-warning-soft text-warning" },
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

      {view === "workflows" ? (
        <>
          <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-2">
            {workflows.map((workflow) => (
              <WorkflowCard key={workflow.id} workflow={workflow} />
            ))}
          </div>
          {workflows.length === 0 && (
            <div className="card mt-4 px-5 py-10 text-center text-[12px] text-faint">No workflows in this workspace.</div>
          )}
        </>
      ) : (
        <div className="card mt-4 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] border-collapse">
              <thead>
                <tr className="border-b border-line bg-surface-2/50">
                  {["Status", "Workflow", "Summary", "When"].map((label, index) => (
                    <th
                      key={label}
                      className={cn(
                        "px-4 py-2.5 text-left font-mono text-[9px] font-medium uppercase tracking-[0.12em] text-faint",
                        index === 0 && "pl-5",
                      )}
                    >
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {executions.map((execution) => {
                  const workflow = workflows.find((entry) => entry.id === execution.workflowId);
                  const meta = statusMeta[execution.status];
                  const Icon = meta.icon;
                  return (
                    <tr key={execution.id} className="border-b border-line last:border-0">
                      <td className="py-2.5 pl-5 pr-3">
                        <Badge tone={meta.tone}>
                          <Icon size={10} /> {meta.label}
                        </Badge>
                      </td>
                      <td className="px-4">
                        <div className="text-[11.5px] text-ink">{workflow?.name ?? "Unknown workflow"}</div>
                        <div className="font-mono text-[8.5px] text-faint">{workflow?.code}</div>
                      </td>
                      <td className="px-4 text-[10.5px] text-muted">{execution.summary}</td>
                      <td className="px-4 font-mono text-[9.5px] text-faint">{execution.time}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {executions.length === 0 && (
            <div className="px-5 py-10 text-center text-[12px] text-faint">No executions recorded for this workspace.</div>
          )}
          <div className="border-t border-line bg-surface-2/40 px-4 py-2.5 text-[9.5px] text-faint">
            Executions are local demo events. Failed runs stay visible — nothing is silently retried.
          </div>
        </div>
      )}

      <div className="mt-4 rounded-xl border border-dashed border-line px-3.5 py-3 text-[9.5px] leading-relaxed text-faint">
        Automation never sends client communication or publishes content on its own. Outbound steps require an owner
        approval, and every run is written to the audit trail. Counters are seeded demo values; “Run now” only evaluates
        the current workspace data.
      </div>
    </div>
  );
}
