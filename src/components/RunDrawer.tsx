import { useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  CircleDot,
  ExternalLink,
  FileText,
  Octagon,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Square,
  X,
  XCircle,
} from "lucide-react";
import {
  ACTIVE_RUN_STATES,
  AVAILABILITY_META,
  RUN_STATE_META,
  type OfficeRun,
} from "../data/office";
import { useStore } from "../lib/store";
import { cn } from "../lib/utils";
import { Badge, Button, Drawer, IconButton } from "./ui";

type DecisionMode = "changes_requested" | "rejected" | null;

const verifiedTone = {
  verified: "success" as const,
  unverified: "warning" as const,
  missing: "accent" as const,
};

export function RunDrawer({ run, onClose }: { run: OfficeRun; onClose: () => void }) {
  const { agents, stopRun, decideRun, tasks, audit, recordEvent, sync } = useStore();
  const [mode, setMode] = useState<DecisionMode>(null);
  const [comment, setComment] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const agent = agents.find((entry) => entry.id === run.agentId);
  const linkedTask = tasks.find((entry) => entry.id === run.taskId);
  const state = RUN_STATE_META[run.state];
  const active = ACTIVE_RUN_STATES.includes(run.state);
  const canDecide = run.state === "owner_review";
  const runEvents = audit.filter((event) => event.entityType === "run" && event.entityId === run.id).slice(0, 6);

  const decide = async (decision: "approved" | "changes_requested" | "rejected") => {
    if (busy) return;
    setError(null);
    setNotice(null);
    setBusy(true);
    const result = await decideRun(run.id, decision, comment);
    setBusy(false);
    if (!result.ok) {
      setError(result.error ?? "Decision could not be saved.");
      return;
    }
    setMode(null);
    setComment("");
    setNotice(
      decision === "approved"
        ? "Run approved. Any publish or send remains a separate, explicit action."
        : decision === "changes_requested"
          ? "Changes requested and attached to the run record."
          : "Run rejected with your reason attached.",
    );
  };

  const stop = async () => {
    if (busy) return;
    setError(null);
    setNotice(null);
    setBusy(true);
    const result = await stopRun(run.id);
    setBusy(false);
    if (!result.ok) {
      setError(result.error ?? "This run could not be stopped.");
      return;
    }
    setNotice("Run stopped. Completed steps and the failure reason stay in the history.");
  };

  return (
    <Drawer open onClose={onClose} title="Run detail">
      <div className="sticky top-0 z-10 flex items-center justify-between border-b border-line bg-surface/95 px-5 py-3.5 backdrop-blur">
        <span className="overline">Run detail</span>
        <IconButton label="Close run detail" onClick={onClose}>
          <X size={16} />
        </IconButton>
      </div>

      <div className="px-5 py-5">
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge tone={state.tone} dot>
            {state.label}
          </Badge>
          <span className="rounded-md border border-line bg-surface-2 px-1.5 py-0.5 font-mono text-[9.5px] text-muted">
            v{run.outputVersion}
          </span>
          <Badge tone="neutral">{run.approvalRequired ? "Approval required" : "No external action"}</Badge>
          <span className="ml-auto font-mono text-[10px] text-faint">{run.id.toUpperCase()}</span>
        </div>

        <h2 className="mt-3 text-[19px] font-semibold leading-snug tracking-[-0.02em] text-ink">{run.action}</h2>
        <p className="mt-1 text-[11px] text-faint">
          {run.subject} · started {run.time} · {run.duration ?? "—"}
        </p>

        <div className="mt-4 flex items-center gap-2.5 rounded-xl border border-line p-3">
          <span className="grid size-8 place-items-center rounded-lg bg-accent-soft text-accent-text">
            <Sparkles size={14} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-[11.5px] font-medium text-ink">{agent?.name ?? run.agentId}</div>
            <div className="text-[10px] text-faint">
              {agent?.role ?? "Agent"} · {agent?.model ?? "unknown model"}
            </div>
          </div>
          {agent && (
            <Badge tone={AVAILABILITY_META[agent.availability].tone}>
              {AVAILABILITY_META[agent.availability].label}
            </Badge>
          )}
        </div>

        {run.failureReason && (
          <div className="mt-3 flex items-start gap-2 rounded-xl border border-warning/25 bg-warning-soft px-3 py-2.5">
            <AlertTriangle size={14} className="mt-0.5 shrink-0 text-warning" />
            <div>
              <p className="text-[11px] font-medium text-warning">
                {run.state === "cancelled" ? "Stopped" : run.state === "unavailable" ? "Agent unavailable" : "Failure reported"}
              </p>
              <p className="mt-0.5 text-[10.5px] leading-relaxed text-warning/90">{run.failureReason}</p>
            </div>
          </div>
        )}

        {run.decisionComment && (
          <div className="mt-3 rounded-xl border border-line bg-surface-2/60 px-3 py-2.5">
            <div className="text-[9.5px] uppercase tracking-[0.1em] text-faint">Owner decision</div>
            <p className="mt-1 text-[11px] leading-relaxed text-ink">“{run.decisionComment}”</p>
          </div>
        )}

        {linkedTask && (
          <div className="mt-3 flex items-center gap-2 rounded-xl border border-line px-3 py-2">
            <CircleDot size={11} className="text-faint" />
            <span className="text-[10.5px] text-muted">
              Linked task: <span className="font-medium text-ink">{linkedTask.title}</span>
            </span>
            <a
              href={`/tasks?task=${linkedTask.id}`}
              className="ml-auto flex items-center gap-1 text-[10px] font-medium text-accent-text hover:underline"
            >
              Open task <ExternalLink size={10} />
            </a>
          </div>
        )}

        <div className="mt-5">
          <div className="overline mb-2.5">Timeline</div>
          <div className="relative space-y-3 pl-1">
            <div className="absolute bottom-2 left-[4px] top-2 w-px bg-line" />
            {run.timeline.map((entry, index) => (
              <div key={`${entry.state}-${entry.at}-${index}`} className="relative flex gap-3">
                <span
                  className={cn(
                    "relative z-10 mt-1 size-[7px] shrink-0 rounded-full border",
                    entry.state === run.state ? "border-accent bg-accent" : "border-line bg-surface",
                  )}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] font-medium text-ink">{RUN_STATE_META[entry.state].label}</span>
                    <span className="ml-auto font-mono text-[8.5px] text-faint">{entry.time}</span>
                  </div>
                  {entry.note && <p className="mt-0.5 text-[10px] leading-relaxed text-faint">{entry.note}</p>}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-5">
          <div className="overline mb-2">Evidence</div>
          {run.evidence.length === 0 ? (
            <p className="rounded-xl border border-dashed border-line px-3 py-3 text-[10.5px] text-faint">
              No evidence attached. Claims from this run stay unverified.
            </p>
          ) : (
            <div className="space-y-2">
              {run.evidence.map((item) => (
                <div key={item.id} className="flex items-start gap-2 rounded-xl border border-line bg-surface-2/50 p-2.5">
                  <FileText size={12} className="mt-0.5 shrink-0 text-faint" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[11px] font-medium text-ink">{item.title}</div>
                    <div className="mt-0.5 text-[9.5px] text-faint">
                      {item.source} · {item.confidence}% confidence
                    </div>
                  </div>
                  <Badge tone={verifiedTone[item.verified]}>{item.verified}</Badge>
                </div>
              ))}
            </div>
          )}
        </div>

        {run.limitations.length > 0 && (
          <div className="mt-4">
            <div className="overline mb-2">Limitations</div>
            <ul className="space-y-1">
              {run.limitations.map((item) => (
                <li key={item} className="flex items-start gap-1.5 text-[10px] leading-relaxed text-faint">
                  <AlertTriangle size={9} className="mt-1 shrink-0 text-warning" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="mt-5">
          <div className="overline mb-2">Audit</div>
          {runEvents.length === 0 ? (
            <p className="text-[10.5px] text-faint">No audit events recorded for this run.</p>
          ) : (
            <div className="space-y-2">
              {runEvents.map((event) => (
                <div key={event.id} className="flex gap-2">
                  <span className="mt-1 size-1.5 shrink-0 rounded-full bg-line-strong" />
                  <div className="min-w-0 flex-1">
                    <p className="text-[10.5px] leading-snug text-ink">{event.action}</p>
                    <p className="mt-0.5 truncate text-[9.5px] text-faint">
                      {event.actorType} · {event.result} · {event.time}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <p className="mt-4 text-[9.5px] leading-relaxed text-faint">
          {sync.status === "live"
            ? "Live workspace API · approval decisions are written to D1 with an actor and timestamp, but no external message or post is sent."
            : "Demo dataset · runs are simulated in this session. Approval decisions are recorded with an actor and timestamp, but no external message or post is sent."}
        </p>
        {sync.status === "live" && run.state === "queued" && (
          <p className="mt-1.5 text-[9.5px] leading-relaxed text-warning">
            Queued on the worker. This pilot has no executor, so the state will not advance on its own.
          </p>
        )}
      </div>

      <div className="sticky bottom-0 border-t border-line bg-surface px-5 py-3.5">
        {error && (
          <div className="mb-2 flex items-start gap-1.5 rounded-lg bg-accent-soft px-2.5 py-2 text-[10.5px] text-accent-text">
            <AlertTriangle size={11} className="mt-0.5 shrink-0" /> {error}
          </div>
        )}
        {notice && (
          <div className="mb-2 flex items-start gap-1.5 rounded-lg bg-success-soft px-2.5 py-2 text-[10.5px] text-success">
            <CheckCircle2 size={11} className="mt-0.5 shrink-0" /> {notice}
          </div>
        )}

        {mode ? (
          <div>
            <label className="text-[10.5px] font-medium text-muted">
              {mode === "rejected" ? "Why is this rejected?" : "What should change?"}{" "}
              <span className="text-faint">(required)</span>
            </label>
            <textarea
              value={comment}
              onChange={(event) => setComment(event.target.value)}
              rows={3}
              autoFocus
              placeholder={
                mode === "rejected"
                  ? "e.g. Wrong audience — this draft targets existing customers."
                  : "e.g. Shorten the opener and confirm the launch window."
              }
              className="mt-1.5 w-full resize-none rounded-xl border border-line bg-surface-2 px-3 py-2 text-[11.5px] text-ink placeholder:text-faint focus:border-accent/40 focus:bg-surface focus:outline-none"
            />
            <div className="mt-2 flex items-center gap-2">
              <Button
                size="sm"
                variant="primary"
                onClick={() => void decide(mode)}
                disabled={!comment.trim() || busy}
              >
                {mode === "rejected" ? <XCircle size={13} /> : <RotateCcw size={13} />}
                {busy ? "Saving…" : mode === "rejected" ? "Confirm rejection" : "Confirm changes"}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setMode(null)}>
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            {canDecide && (
              <>
                <Button size="sm" variant="primary" onClick={() => void decide("approved")} disabled={busy}>
                  <ShieldCheck size={13} /> Approve run
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() => {
                    setError(null);
                    setNotice(null);
                    setMode("changes_requested");
                  }}
                >
                  <RotateCcw size={13} /> Request changes
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-accent-text hover:bg-accent-soft"
                  disabled={busy}
                  onClick={() => {
                    setError(null);
                    setNotice(null);
                    setMode("rejected");
                  }}
                >
                  <XCircle size={13} /> Reject
                </Button>
              </>
            )}
            {active && (
              <Button size="sm" variant="outline" onClick={() => void stop()} disabled={busy}>
                <Square size={12} /> Stop run
              </Button>
            )}
            {!canDecide && !active && (
              <span className="flex items-center gap-1.5 text-[10.5px] text-faint">
                <Octagon size={12} /> Run finished — history stays immutable.
              </span>
            )}
            <Button
              size="sm"
              variant="ghost"
              className="ml-auto"
              onClick={() =>
                recordEvent({
                  entityType: "run",
                  entityId: run.id,
                  action: "Run record reviewed",
                  meta: `${run.action} · ${run.subject}`,
                })
              }
            >
              Log review
            </Button>
          </div>
        )}
      </div>
    </Drawer>
  );
}
