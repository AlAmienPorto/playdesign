import { useState } from "react";
import { format } from "date-fns";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Code2,
  Database,
  FileText,
  Loader2,
  ShieldCheck,
  X,
} from "lucide-react";
import {
  DELIVERY_RUN_META,
  type DeliveryCheck,
  type DeliveryPlanItem,
  type DeliveryRun,
} from "../data/delivery";
import { useStore } from "../lib/store";
import { AgentAvatar, Badge, Button, Drawer, IconButton, inputClass } from "./ui";
import { cn } from "../lib/utils";

const checkIcon = (check: DeliveryCheck) => {
  if (check.result === "pass") return <CheckCircle2 size={13} className="text-success" />;
  if (check.result === "warn") return <AlertTriangle size={13} className="text-warning" />;
  return <Clock size={13} className="text-faint" />;
};

export function DeliveryRunDrawer({
  run,
  item,
  onClose,
}: {
  run: DeliveryRun;
  item: DeliveryPlanItem | undefined;
  onClose: () => void;
}) {
  const { validateDeliveryRun } = useStore();
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const meta = DELIVERY_RUN_META[run.state];

  const validate = () => {
    const result = validateDeliveryRun(run.id, note);
    if (!result.ok) {
      setError(result.error ?? "The run could not be validated.");
      return;
    }
    setError("");
    setMessage("Validated. The module is marked complete in the plan.");
  };

  return (
    <Drawer open onClose={onClose} title={`Delivery run ${run.moduleId}`}>
      <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge tone={meta.tone} dot>
              {meta.label}
            </Badge>
            <span className="font-mono text-[10px] text-faint">{run.moduleId}</span>
          </div>
          <h2 className="mt-1.5 text-[15px] font-semibold leading-snug tracking-tight text-ink">{run.title}</h2>
          <p className="mt-0.5 text-[10.5px] text-muted">
            {run.duration === "—" ? "Running now" : run.duration} · started {run.time}
          </p>
        </div>
        <IconButton label="Close run" onClick={onClose} className="-mr-1.5 -mt-1">
          <X size={15} />
        </IconButton>
      </div>

      <div className="space-y-4 px-5 py-4">
        <div className="flex items-center gap-2.5 rounded-xl border border-line bg-surface-2 px-3 py-2.5">
          <AgentAvatar size="sm" online={run.state === "running"} />
          <div className="min-w-0 flex-1">
            <div className="text-[11.5px] font-medium text-ink">Je.el Agent ran this module</div>
            <div className="mt-0.5 text-[10px] text-faint">
              One module at a time · owner sign-off before the item is marked complete
            </div>
          </div>
          {run.state === "running" ? (
            <Loader2 size={15} className="animate-spin text-info" />
          ) : (
            <ShieldCheck size={15} className="text-success" />
          )}
        </div>

        <section>
          <h3 className="overline mb-2">Execution trail</h3>
          <ol className="space-y-0">
            {run.steps.map((step, index) => (
              <li key={`${step.label}-${index}`} className="relative flex gap-2.5 pb-3 pl-0.5 last:pb-0">
                {index < run.steps.length - 1 && (
                  <span aria-hidden className="absolute left-[5px] top-3 h-full w-px bg-line" />
                )}
                <span
                  className={cn(
                    "relative mt-1 size-2.5 shrink-0 rounded-full border-2 border-surface",
                    index === run.steps.length - 1 && run.state === "running" ? "bg-info" : "bg-line-strong",
                  )}
                />
                <div className="min-w-0 flex-1">
                  <div className="text-[11.5px] font-medium leading-snug text-ink">{step.label}</div>
                  <div className="mt-0.5 text-[10px] text-faint">
                    {step.note} · {step.time}
                  </div>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section>
          <div className="mb-2 flex items-center justify-between">
            <h3 className="overline">Demo checks</h3>
            <span className="font-mono text-[9px] text-faint">simulated</span>
          </div>
          <div className="overflow-hidden rounded-xl border border-line">
            {run.checks.map((check) => (
              <div
                key={check.id}
                className="flex items-start gap-2.5 border-b border-line px-3 py-2.5 last:border-0"
              >
                <span className="mt-0.5 shrink-0">{checkIcon(check)}</span>
                <div className="min-w-0 flex-1">
                  <div className="text-[11px] font-medium text-ink">{check.label}</div>
                  <div className="mt-0.5 text-[10px] leading-relaxed text-faint">{check.detail}</div>
                </div>
                <span className="font-mono text-[9.5px] text-faint">{check.result}</span>
              </div>
            ))}
          </div>
          <p className="mt-1.5 text-[9.5px] leading-relaxed text-faint">
            Simulated results — no CI job is attached. Run the real build and tests before shipping.
          </p>
        </section>

        {run.evidence.length > 0 && (
          <section>
            <h3 className="overline mb-2">Evidence</h3>
            <div className="space-y-1.5">
              {run.evidence.map((entry) => (
                <div
                  key={entry}
                  className="flex items-center gap-2 rounded-lg border border-line bg-surface-2 px-2.5 py-2 text-[10.5px] text-muted"
                >
                  {entry.includes("endpoint") ? (
                    <Code2 size={12} className="shrink-0 text-faint" />
                  ) : entry.includes(".sql") ? (
                    <Database size={12} className="shrink-0 text-faint" />
                  ) : (
                    <FileText size={12} className="shrink-0 text-faint" />
                  )}
                  <span className="min-w-0 flex-1 truncate">{entry}</span>
                </div>
              ))}
            </div>
          </section>
        )}

        {run.limitations.length > 0 && (
          <section>
            <h3 className="overline mb-2">Known limitations</h3>
            <div className="space-y-1">
              {run.limitations.map((entry) => (
                <p key={entry} className="flex items-start gap-1.5 text-[10.5px] leading-relaxed text-muted">
                  <AlertTriangle size={11} className="mt-0.5 shrink-0 text-warning" /> {entry}
                </p>
              ))}
            </div>
          </section>
        )}

        {item && (
          <section className="rounded-xl border border-line bg-surface-2/60 p-3">
            <h3 className="mb-1.5 text-[11px] font-medium text-ink">Acceptance criteria</h3>
            <ul className="space-y-1">
              {item.acceptance.map((criterion) => (
                <li key={criterion} className="flex items-start gap-1.5 text-[10.5px] leading-relaxed text-muted">
                  <CheckCircle2 size={10} className="mt-0.5 shrink-0 text-faint" /> {criterion}
                </li>
              ))}
            </ul>
          </section>
        )}

        {run.state === "awaiting_validation" && (
          <section className="rounded-xl border border-warning/30 bg-warning-soft/40 p-3">
            <div className="flex items-center gap-1.5">
              <ShieldCheck size={13} className="text-warning" />
              <h3 className="text-[11.5px] font-medium text-ink">Owner validation</h3>
            </div>
            <p className="mt-1 text-[10.5px] leading-relaxed text-muted">
              Check the acceptance criteria against the output. Validation is a sign-off, not an automated test.
            </p>
            <textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              rows={2}
              placeholder="Optional note for the audit trail…"
              className={cn(inputClass, "mt-2 resize-none bg-surface text-[12px]")}
            />
            {error && <p className="mt-1.5 text-[10.5px] text-warning">{error}</p>}
            {message && <p className="mt-1.5 text-[10.5px] text-success">{message}</p>}
            <Button variant="primary" size="sm" className="mt-2 w-full" onClick={validate}>
              <ShieldCheck size={13} /> Validate against PRD
            </Button>
          </section>
        )}

        {run.state === "validated" && (
          <section className="rounded-xl border border-success/25 bg-success-soft/50 p-3">
            <div className="flex items-center gap-1.5">
              <CheckCircle2 size={13} className="text-success" />
              <h3 className="text-[11.5px] font-medium text-ink">Validated against PRD</h3>
            </div>
            <p className="mt-1 text-[10.5px] leading-relaxed text-muted">
              {run.validatedAt ? format(new Date(run.validatedAt), "MMM d, HH:mm") : "Owner sign-off"} ·{" "}
              {run.validationNote ?? "No note recorded."}
            </p>
          </section>
        )}

        {run.state === "running" && (
          <section className="rounded-xl border border-info/25 bg-info-soft/40 px-3 py-2.5 text-[10.5px] leading-relaxed text-muted">
            Demo checks are running. The run will hold for your validation when they finish.
          </section>
        )}
      </div>

      <div className="mt-auto border-t border-line bg-surface-2/50 px-5 py-3 text-[9.5px] leading-relaxed text-faint">
        Simulated locally · no model call, no deployment. Every decision is written to the audit trail.
      </div>
    </Drawer>
  );
}
