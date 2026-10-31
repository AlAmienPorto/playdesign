import { useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  CircleDot,
  FileText,
  RotateCcw,
  Send,
  ShieldCheck,
  Sparkles,
  X,
  XCircle,
} from "lucide-react";
import { TEAM, teamById } from "../data/mock";
import {
  AGENTS,
  APPROVAL_META,
  OUTPUT_LABEL,
  workspaceById,
  type OfficeTask,
} from "../data/office";
import { useStore } from "../lib/store";
import { dueMeta } from "../lib/utils";
import { Avatar, Badge, Button, Drawer, IconButton, ProgressBar } from "./ui";

type DecisionMode = "changes_requested" | "rejected" | null;

const verifiedTone = {
  verified: "success" as const,
  unverified: "warning" as const,
  missing: "accent" as const,
};

const verifiedLabel = {
  verified: "Verified",
  unverified: "Unverified",
  missing: "Missing",
};

const recordTone = {
  submitted: "info" as const,
  approved: "success" as const,
  changes_requested: "warning" as const,
  rejected: "accent" as const,
};

const recordLabel = {
  submitted: "Submitted",
  approved: "Approved",
  changes_requested: "Changes",
  rejected: "Rejected",
};

function actorName(actorId: string) {
  const agent = AGENTS.find((entry) => entry.id === actorId);
  if (agent) return agent.name;
  if (actorId === "system") return "System";
  return teamById(actorId).name;
}

export function TaskDrawer({ task, onClose }: { task: OfficeTask; onClose: () => void }) {
  const { decideTask, submitTask, assignTask, addTaskComment, audit, agents } = useStore();
  const [mode, setMode] = useState<DecisionMode>(null);
  const [comment, setComment] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);

  const owner = teamById(task.ownerId);
  const workspace = workspaceById(task.workspaceId);
  const assignedAgent = agents.find((agent) => agent.id === task.assignedAgentId);
  const due = dueMeta(task.due);
  const approval = APPROVAL_META[task.approval];
  const taskEvents = audit.filter((event) => event.taskId === task.id).slice(0, 5);
  const canDecide = task.approval === "pending" || task.status === "review";

  const resetFeedback = () => {
    setError(null);
    setNotice(null);
  };

  const decide = async (decision: "approved" | "changes_requested" | "rejected") => {
    if (busy) return;
    resetFeedback();
    setBusy(true);
    const result = await decideTask(task.id, decision, comment);
    setBusy(false);
    if (!result.ok) {
      setError(result.error ?? "Decision could not be saved.");
      return;
    }
    setMode(null);
    setComment("");
    setNotice(
      decision === "approved"
        ? `Approved output v${task.outputVersion}. Publishing stays a separate, explicit step.`
        : decision === "changes_requested"
          ? "Changes requested. The task moved back to production."
          : "Rejected. The task moved back to the backlog with your reason attached.",
    );
  };

  const submit = async () => {
    if (busy) return;
    resetFeedback();
    setBusy(true);
    const result = await submitTask(task.id);
    setBusy(false);
    if (!result.ok) {
      setError(result.error ?? "Could not submit this version.");
      return;
    }
    setNotice(`Submitted v${task.outputVersion + 1} for owner review.`);
  };

  const sendComment = () => {
    if (!draft.trim()) return;
    const result = addTaskComment(task.id, draft);
    if (!result.ok) {
      setError(result.error ?? "Comment could not be saved.");
      return;
    }
    setDraft("");
  };

  return (
    <Drawer open onClose={onClose} title="Task detail">
      <div className="sticky top-0 z-10 flex items-center justify-between border-b border-line bg-surface/95 px-5 py-3.5 backdrop-blur">
        <span className="overline">Task detail</span>
        <IconButton label="Close task detail" onClick={onClose}>
          <X size={16} />
        </IconButton>
      </div>

      <div className="px-5 py-5">
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge tone={approval.tone} dot>
            {approval.label}
          </Badge>
          <span className="rounded-md border border-line bg-surface-2 px-1.5 py-0.5 font-mono text-[9.5px] text-muted">
            v{task.outputVersion}
          </span>
          <Badge tone="neutral">{OUTPUT_LABEL[task.outputStatus]}</Badge>
          <span className="ml-auto font-mono text-[10px] text-faint">{task.id.toUpperCase()}</span>
        </div>

        <h2 className="mt-3 text-[19px] font-semibold leading-snug tracking-[-0.02em] text-ink">{task.title}</h2>
        <p className="mt-1 text-[11px] text-faint">
          {workspace.name} · {task.board} · {task.project} · due {due.label}
        </p>

        {task.blockedReason && (
          <div className="mt-4 flex items-start gap-2 rounded-xl border border-warning/25 bg-warning-soft px-3 py-2.5">
            <AlertTriangle size={14} className="mt-0.5 shrink-0 text-warning" />
            <p className="text-[11px] leading-relaxed text-warning">{task.blockedReason}</p>
          </div>
        )}

        <div className="mt-4 rounded-xl border border-accent/20 bg-accent-soft/40 p-3">
          <div className="text-[9.5px] uppercase tracking-[0.1em] text-accent-text">Next action</div>
          <p className="mt-1 text-[12px] font-medium leading-snug text-ink">{task.nextAction}</p>
        </div>

        <div className="mt-4 flex items-center justify-between rounded-xl border border-line p-3">
          <div className="flex items-center gap-2.5">
            <Avatar name={owner.name} tone={owner.tone} size="sm" />
            <div>
              <div className="text-[11.5px] font-medium text-ink">{owner.name}</div>
              <div className="text-[10px] text-faint">{owner.role}</div>
            </div>
          </div>
          <label className="flex items-center gap-1.5 text-[10px] text-faint">
            Assign
            <select
              value={task.ownerId}
              onChange={async (event) => {
                const result = await assignTask(task.id, event.target.value);
                if (!result.ok) setError(result.error ?? "Could not reassign this task.");
              }}
              disabled={busy}
              aria-label="Assign owner"
              className="h-7 rounded-lg border border-line bg-surface-2 px-1.5 text-[10.5px] font-medium text-muted focus:outline-none"
            >
              {TEAM.filter((member) => !member.isAgent).map((member) => (
                <option key={member.id} value={member.id}>
                  {member.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        {assignedAgent && (
          <div className="mt-2 flex items-center gap-2 rounded-xl border border-line bg-surface-2/60 px-3 py-2">
            <Sparkles size={12} className="text-accent-text" />
            <span className="text-[10.5px] text-muted">
              Agent assigned: <span className="font-medium text-ink">{assignedAgent.name}</span> · {assignedAgent.role}
            </span>
            <Badge
              tone={assignedAgent.availability === "online" ? "success" : assignedAgent.availability === "idle" ? "neutral" : "warning"}
              className="ml-auto"
            >
              {assignedAgent.availability}
            </Badge>
          </div>
        )}

        <div className="mt-5">
          <div className="overline mb-2">Brief</div>
          <p className="text-[11.5px] leading-relaxed text-muted">{task.brief}</p>
        </div>

        <div className="mt-4">
          <div className="overline mb-2">Acceptance criteria</div>
          <ul className="space-y-1.5">
            {task.acceptance.map((item) => (
              <li key={item} className="flex items-start gap-2 text-[11px] leading-snug text-muted">
                <CircleDot size={10} className="mt-1 shrink-0 text-faint" />
                {item}
              </li>
            ))}
          </ul>
        </div>

        <div className="mt-5">
          <div className="flex items-center justify-between">
            <div className="overline">Output &amp; evidence</div>
            {typeof task.confidence === "number" && (
              <span className="font-mono text-[9.5px] text-faint">{task.confidence}% confidence</span>
            )}
          </div>
          {typeof task.confidence === "number" && (
            <ProgressBar
              value={task.confidence}
              className="mt-2"
              height="h-1"
              tone={task.confidence >= 85 ? "success" : task.confidence >= 70 ? "warning" : "accent"}
            />
          )}

          {task.evidence.length > 0 ? (
            <div className="mt-3 space-y-2">
              {task.evidence.map((item) => (
                <div key={item.id} className="rounded-xl border border-line bg-surface-2/50 p-2.5">
                  <div className="flex items-start gap-2">
                    <FileText size={12} className="mt-0.5 shrink-0 text-faint" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[11px] font-medium text-ink">{item.title}</div>
                      <div className="mt-0.5 text-[9.5px] text-faint">{item.source}</div>
                    </div>
                    <Badge tone={verifiedTone[item.verified]}>{verifiedLabel[item.verified]}</Badge>
                  </div>
                  <div className="mt-2 flex items-center gap-2 pl-5">
                    <div className="h-1 flex-1 overflow-hidden rounded-full bg-surface-3">
                      <div className="h-full rounded-full bg-line-strong" style={{ width: `${item.confidence}%` }} />
                    </div>
                    <span className="font-mono text-[9px] text-faint">{item.confidence}%</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-2 rounded-xl border border-dashed border-line px-3 py-3 text-[10.5px] text-faint">
              No evidence attached yet. Outputs that make claims stay unverified until sources are added.
            </p>
          )}

          {task.limitations.length > 0 && (
            <ul className="mt-2 space-y-1">
              {task.limitations.map((item) => (
                <li key={item} className="flex items-start gap-1.5 text-[10px] leading-relaxed text-faint">
                  <AlertTriangle size={9} className="mt-1 shrink-0 text-warning" />
                  {item}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="mt-5">
          <div className="overline mb-2">Approval history</div>
          <div className="space-y-2">
            {task.history.length === 0 && (
              <p className="text-[10.5px] text-faint">No versions submitted yet.</p>
            )}
            {task.history.map((record) => (
              <div key={record.id} className="rounded-xl border border-line p-2.5">
                <div className="flex items-center gap-2">
                  <Badge tone={recordTone[record.decision]} dot>
                    {recordLabel[record.decision]}
                  </Badge>
                  <span className="font-mono text-[9px] text-faint">v{record.version}</span>
                  <span className="ml-auto font-mono text-[9px] text-faint">{record.time}</span>
                </div>
                <div className="mt-1.5 text-[10.5px] text-muted">
                  {actorName(record.actorId)} · {record.actorType}
                </div>
                {record.comment && (
                  <p className="mt-1 rounded-lg bg-surface-2 px-2 py-1.5 text-[10.5px] leading-relaxed text-muted">
                    “{record.comment}”
                  </p>
                )}
                <div className="mt-1.5 truncate font-mono text-[8.5px] text-faint">
                  idempotency: {record.idempotencyKey}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-5">
          <div className="overline mb-2">Comments</div>
          <div className="space-y-2">
            {task.comments.map((entry) => (
              <div key={entry.id} className="rounded-xl border border-line px-2.5 py-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-medium text-ink">{teamById(entry.authorId).name}</span>
                  <span className="font-mono text-[8.5px] text-faint">{entry.time}</span>
                </div>
                <p className="mt-0.5 text-[10.5px] leading-relaxed text-muted">{entry.body}</p>
              </div>
            ))}
            {task.comments.length === 0 && <p className="text-[10.5px] text-faint">No comments yet.</p>}
          </div>
          <div className="mt-2 flex items-center gap-1.5 rounded-xl border border-line bg-surface-2 p-1.5 focus-within:border-accent/40 focus-within:bg-surface">
            <input
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  sendComment();
                }
              }}
              placeholder="Add a comment…"
              className="h-7 min-w-0 flex-1 bg-transparent px-1 text-[11px] text-ink placeholder:text-faint focus:outline-none"
            />
            <Button
              size="sm"
              variant="primary"
              disabled={!draft.trim()}
              onClick={sendComment}
              className="size-7 rounded-lg p-0"
              aria-label="Add comment"
            >
              <Send size={12} />
            </Button>
          </div>
        </div>

        <div className="mt-5">
          <div className="overline mb-2">Activity</div>
          <div className="space-y-2">
            {taskEvents.length === 0 && <p className="text-[10.5px] text-faint">No recorded events yet.</p>}
            {taskEvents.map((event) => (
              <div key={event.id} className="flex gap-2">
                <span className="mt-1 size-1.5 shrink-0 rounded-full bg-line-strong" />
                <div className="min-w-0 flex-1">
                  <p className="text-[10.5px] leading-snug text-ink">{event.action}</p>
                  <p className="mt-0.5 truncate text-[9.5px] text-faint">
                    {actorName(event.actorId)} · {event.meta ?? event.entityType} · {event.time}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
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
                  ? "e.g. Wrong direction — the brief asked for a warm palette."
                  : "e.g. Add milestone billing and confirm the launch date."
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
                  <ShieldCheck size={13} /> Approve v{task.outputVersion}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() => {
                    resetFeedback();
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
                    resetFeedback();
                    setMode("rejected");
                  }}
                >
                  <XCircle size={13} /> Reject
                </Button>
              </>
            )}
            {!canDecide && task.approval !== "approved" && (
              <Button size="sm" variant="primary" onClick={() => void submit()} disabled={busy}>
                <Send size={13} /> {busy ? "Submitting…" : `Submit v${task.outputVersion + 1} for review`}
              </Button>
            )}
            {task.approval === "approved" && (
              <>
                <span className="flex items-center gap-1.5 text-[10.5px] text-success">
                  <CheckCircle2 size={12} /> Approved v{task.outputVersion}
                </span>
                <Button size="sm" variant="outline" className="ml-auto" onClick={submit}>
                  <RotateCcw size={12} /> New version
                </Button>
              </>
            )}
          </div>
        )}
      </div>
    </Drawer>
  );
}
