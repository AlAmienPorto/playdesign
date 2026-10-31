import { useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle,
  ArrowUpRight,
  CalendarDays,
  CheckCircle2,
  CircleDollarSign,
  FileText,
  Lock,
  Mail,
  Plus,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import {
  BRIEF_STATUS_META,
  briefStatus,
  type Brief,
  type BriefQuestion,
} from "../data/briefs";
import { useStore } from "../lib/store";
import { formatDay, money } from "../lib/utils";
import { AgentAvatar, Badge, Button, Drawer, inputClass } from "./ui";

function QuestionRow({ briefId, question }: { briefId: string; question: BriefQuestion }) {
  const { answerBriefQuestion } = useStore();
  const [value, setValue] = useState("");
  const [error, setError] = useState("");

  const save = () => {
    const result = answerBriefQuestion(briefId, question.field, value);
    if (!result.ok) setError(result.error ?? "Could not save the answer.");
  };

  return (
    <div className="rounded-xl border border-line bg-surface-2/60 p-3">
      <div className="flex items-start gap-2">
        <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-md bg-warning-soft text-warning">
          <AlertTriangle size={12} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[12.5px] font-medium text-ink">{question.question}</p>
          <p className="mt-0.5 text-[11px] text-faint">{question.hint}</p>
        </div>
      </div>
      <div className="mt-2.5 flex flex-col gap-2 sm:flex-row">
        <input
          type={question.field === "deadline" ? "date" : "text"}
          inputMode={question.field === "budget" ? "decimal" : undefined}
          value={value}
          onChange={(event) => {
            setValue(event.target.value);
            setError("");
          }}
          className={inputClass}
          placeholder={
            question.field === "deliverables"
              ? "Brand guidelines, Social assets"
              : question.field === "budget"
                ? "18000"
                : undefined
          }
          aria-label={question.question}
        />
        <Button variant="primary" size="md" onClick={save} disabled={!value.trim()} className="shrink-0">
          Save answer
        </Button>
      </div>
      {error && <p className="mt-1.5 text-[11px] text-accent-text">{error}</p>}
    </div>
  );
}

export function BriefDrawer({
  brief,
  onClose,
  onMessage,
}: {
  brief: Brief;
  onClose: () => void;
  onMessage: (message: string) => void;
}) {
  const { addBriefDeliverable, removeBriefDeliverable, approveBriefScope, agents } = useStore();
  const [newDeliverable, setNewDeliverable] = useState("");
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");

  const status = briefStatus(brief);
  const statusMeta = BRIEF_STATUS_META[status];
  const agent = agents.find((entry) => entry.id === brief.agentId);
  const approved = status === "approved";

  const addDeliverable = () => {
    const result = addBriefDeliverable(brief.id, newDeliverable);
    if (!result.ok) {
      setError(result.error ?? "Could not add the deliverable.");
      return;
    }
    setNewDeliverable("");
    setError("");
    setFeedback("Deliverable added to the scope.");
  };

  const approve = () => {
    const result = approveBriefScope(brief.id);
    if (!result.ok) {
      setError(result.error ?? "Could not approve the scope.");
      return;
    }
    setError("");
    setFeedback("Scope approved. Production tasks are on the board.");
    onMessage("Scope approved — production tasks created.");
  };

  return (
    <Drawer open onClose={onClose} title={`Brief · ${brief.project}`}>
      <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={statusMeta.tone} dot>
              {statusMeta.label}
            </Badge>
            <Badge tone="outline">{brief.source === "email" ? "Email" : "Form"}</Badge>
          </div>
          <h2 className="mt-2 text-[18px] font-semibold tracking-[-0.02em] text-ink">{brief.project}</h2>
          <p className="mt-0.5 text-[12px] text-muted">
            {brief.client}
            {brief.contact ? ` · ${brief.contact}` : ""}
          </p>
        </div>
        <button
          onClick={onClose}
          aria-label="Close brief"
          className="grid size-8 shrink-0 place-items-center rounded-lg text-muted hover:bg-surface-3 hover:text-ink"
        >
          <X size={16} />
        </button>
      </div>

      <div className="flex-1 space-y-5 px-5 py-5">
        <div className="flex items-center gap-2.5 rounded-xl border border-line bg-surface-2/60 p-3">
          <AgentAvatar size="sm" online={agent?.availability !== "unavailable"} />
          <div className="min-w-0 flex-1">
            <p className="text-[12px] font-medium text-ink">
              {agent?.name ?? "Agent"} extracted the scope
            </p>
            <p className="text-[10.5px] text-faint">
              {brief.confidence}% confidence · local demo heuristic · no external call
            </p>
          </div>
          <Sparkles size={14} className="shrink-0 text-accent" />
        </div>

        <div className="grid grid-cols-2 gap-2.5">
          <div className="rounded-xl border border-line p-3">
            <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.08em] text-faint">
              <CalendarDays size={11} /> Deadline
            </div>
            <p className="mt-1 text-[12.5px] font-medium text-ink">
              {brief.deadline ? formatDay(brief.deadline, "MMM d, yyyy") : "Not provided"}
            </p>
          </div>
          <div className="rounded-xl border border-line p-3">
            <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.08em] text-faint">
              <CircleDollarSign size={11} /> Budget
            </div>
            <p className="mt-1 text-[12.5px] font-medium text-ink">
              {brief.budget !== undefined ? money(brief.budget) : "Not provided"}
            </p>
          </div>
        </div>

        <section>
          <div className="mb-2 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.08em] text-faint">
            <FileText size={12} /> Original brief
          </div>
          <blockquote className="max-h-44 overflow-y-auto rounded-xl border border-line bg-surface-2/50 p-3 text-[12px] leading-relaxed text-muted">
            {brief.raw}
          </blockquote>
        </section>

        <section>
          <div className="mb-2 flex items-center justify-between gap-2">
            <h3 className="text-[12.5px] font-semibold text-ink">Extracted scope</h3>
            <span className="font-mono text-[10px] text-faint">
              {brief.deliverables.length} deliverable{brief.deliverables.length === 1 ? "" : "s"}
            </span>
          </div>
          <div className="space-y-1.5">
            {brief.deliverables.map((deliverable) => (
              <div
                key={deliverable.id}
                className="flex items-center gap-2 rounded-lg border border-line bg-surface px-2.5 py-2"
              >
                <span className="size-1.5 shrink-0 rounded-full bg-accent" />
                <span className="min-w-0 flex-1 text-[12px] text-ink">{deliverable.title}</span>
                {!approved && (
                  <button
                    onClick={() => removeBriefDeliverable(brief.id, deliverable.id)}
                    aria-label={`Remove ${deliverable.title}`}
                    className="grid size-7 place-items-center rounded-md text-faint transition-colors hover:bg-surface-3 hover:text-accent-text"
                  >
                    <Trash2 size={12} />
                  </button>
                )}
              </div>
            ))}
            {brief.deliverables.length === 0 && (
              <p className="rounded-lg border border-dashed border-line px-3 py-2.5 text-[11.5px] text-faint">
                No deliverable identified yet.
              </p>
            )}
          </div>
          {!approved && (
            <div className="mt-2 flex gap-2">
              <input
                value={newDeliverable}
                onChange={(event) => {
                  setNewDeliverable(event.target.value);
                  setError("");
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && newDeliverable.trim()) {
                    event.preventDefault();
                    addDeliverable();
                  }
                }}
                className={inputClass}
                placeholder="Add a deliverable"
              />
              <Button
                variant="secondary"
                onClick={addDeliverable}
                disabled={!newDeliverable.trim()}
                aria-label="Add deliverable"
              >
                <Plus size={14} />
              </Button>
            </div>
          )}
        </section>

        {brief.questions.length > 0 && !approved && (
          <section>
            <div className="mb-2 flex items-center gap-1.5">
              <AlertTriangle size={12} className="text-warning" />
              <h3 className="text-[12.5px] font-semibold text-ink">Missing information</h3>
            </div>
            <div className="space-y-2">
              {brief.questions.map((question) => (
                <QuestionRow key={question.id} briefId={brief.id} question={question} />
              ))}
            </div>
          </section>
        )}

        {brief.limitations.length > 0 && (
          <section className="rounded-xl border border-line bg-surface-2/40 p-3">
            <h3 className="text-[10.5px] font-medium uppercase tracking-[0.08em] text-faint">Agent notes</h3>
            <ul className="mt-1.5 space-y-1">
              {brief.limitations.map((limitation) => (
                <li key={limitation} className="flex gap-1.5 text-[11px] leading-relaxed text-muted">
                  <span className="mt-1.5 size-1 shrink-0 rounded-full bg-faint" />
                  {limitation}
                </li>
              ))}
            </ul>
          </section>
        )}

        {approved ? (
          <section className="rounded-xl border border-success/25 bg-success-soft/60 p-3.5">
            <div className="flex items-center gap-2">
              <CheckCircle2 size={15} className="text-success" />
              <h3 className="text-[12.5px] font-semibold text-ink">Scope approved by owner</h3>
            </div>
            <p className="mt-1 text-[11px] leading-relaxed text-muted">
              {brief.approvedAt ? `Locked ${formatDay(brief.approvedAt, "MMM d, yyyy")}. ` : ""}
              {brief.taskIds.length > 0
                ? `${brief.taskIds.length} production task${brief.taskIds.length === 1 ? "" : "s"} created. Outputs still need owner approval before anything leaves the studio.`
                : "Scope is locked. Production can start from the task board."}
            </p>
            <Link
              to="/tasks"
              className="mt-2 inline-flex items-center gap-1.5 text-[11.5px] font-medium text-accent-text hover:underline"
            >
              Open tasks <ArrowUpRight size={12} />
            </Link>
          </section>
        ) : status === "ready" ? (
          <section className="rounded-xl border border-line bg-surface-2/50 p-3.5">
            <div className="flex items-center gap-2">
              <Lock size={14} className="text-muted" />
              <h3 className="text-[12.5px] font-semibold text-ink">Owner approval</h3>
            </div>
            <p className="mt-1 text-[11px] leading-relaxed text-muted">
              Approving locks the scope and creates {brief.deliverables.length} production task
              {brief.deliverables.length === 1 ? "" : "s"}. External actions still require approval later.
            </p>
            <Button variant="primary" className="mt-2.5 w-full" onClick={approve}>
              <CheckCircle2 size={14} /> Approve scope
            </Button>
          </section>
        ) : (
          <section className="rounded-xl border border-warning/25 bg-warning-soft/40 p-3.5">
            <div className="flex items-center gap-2">
              <Lock size={14} className="text-warning" />
              <h3 className="text-[12.5px] font-semibold text-ink">Scope approval blocked</h3>
            </div>
            <p className="mt-1 text-[11px] leading-relaxed text-muted">
              Answer the {brief.questions.length} open question{brief.questions.length === 1 ? "" : "s"} first.
              Deliverables, deadline and budget are required before the owner can approve.
            </p>
          </section>
        )}

        {feedback && (
          <p className="flex items-center gap-1.5 text-[11px] text-success">
            <CheckCircle2 size={12} /> {feedback}
          </p>
        )}
        {error && (
          <p className="flex items-center gap-1.5 text-[11px] text-accent-text">
            <AlertTriangle size={12} /> {error}
          </p>
        )}

        <p className="flex items-center gap-1.5 text-[10px] text-faint">
          <Mail size={10} /> Demo brief · synthetic client data · nothing is sent externally.
        </p>
      </div>
    </Drawer>
  );
}
