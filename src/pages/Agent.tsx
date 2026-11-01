import { useEffect, useRef, useState, type CSSProperties, type FormEvent } from "react";
import { useSearchParams } from "react-router-dom";
import {
  AlertTriangle,
  ArrowUpRight,
  BookOpen,
  CheckCircle2,
  Clock,
  FileText,
  Folder,
  Plus,
  RefreshCw,
  Send,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Zap,
} from "lucide-react";
import { AUTOMATIONS, KNOWLEDGE, type Automation } from "../data/mock";
import { AVAILABILITY_META, RUN_STATE_META, type OfficeRun } from "../data/office";
import {
  clearAgentMessages,
  loadAgentMessages,
  officeApiEnabled,
  sendAgentChat,
} from "../lib/officeApi";
import { useStore } from "../lib/store";
import { cn, moneyCompact } from "../lib/utils";
import {
  AgentAvatar,
  Avatar,
  Badge,
  Button,
  Field,
  IconButton,
  inputClass,
  Modal,
  PageHeader,
  Toggle,
} from "../components/ui";
import { RunDrawer } from "../components/RunDrawer";

interface Proposal {
  action: string;
  subject: string;
  limitations: string[];
  status: "pending" | "confirmed" | "cancelled" | "unavailable";
}

interface ChatMessage {
  id: string;
  role: "user" | "agent";
  text: string;
  proposal?: Proposal;
}

const suggestedPrompts = [
  "Summarize today's pipeline",
  "Draft a follow-up to Kraft & Co",
  "Which leads are hottest right now?",
];

function AutomationModal({ onClose, onSubmit }: { onClose: () => void; onSubmit: (automation: Automation) => void }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim()) return;
    onSubmit({
      id: `au-${Date.now()}`,
      name: name.trim(),
      description: description.trim() || "Custom agent automation.",
      active: true,
      runs: 0,
      successRate: 100,
    });
    onClose();
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="New automation"
      description="Describe the job once — the agent handles the draft. Approvals stay with you."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" form="automation-form">
            Create automation
          </Button>
        </>
      }
    >
      <form id="automation-form" onSubmit={submit} className="space-y-4">
        <Field label="Name">
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            className={inputClass}
            placeholder="e.g. Proposal follow-ups"
            required
            autoFocus
          />
        </Field>
        <Field label="What should the agent do?">
          <textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            rows={4}
            className={cn(inputClass, "resize-none")}
            placeholder="Draft a polite nudge 4 days after a proposal is sent, then escalate to me if there's no reply after another week."
          />
        </Field>
      </form>
    </Modal>
  );
}

export default function Agent() {
  const {
    deals,
    tasks,
    leads,
    posts,
    runs,
    agents,
    workspace,
    autopilot,
    setAutopilot,
    startRun,
    recordEvent,
    sync,
  } = useStore();
  const [automations, setAutomations] = useState<Automation[]>(AUTOMATIONS);
  const [autonomy, setAutonomy] = useState(84);
  const [automationModal, setAutomationModal] = useState(false);
  const [syncState, setSyncState] = useState<"idle" | "syncing" | "done">("idle");
  const [params, setParams] = useSearchParams();
  const agentParam = params.get("agent");

  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(agentParam);
  const leadAgent = (selectedAgentId ? agents.find((a) => a.id === selectedAgentId) : null) ?? agents[0];
  const [messages, setMessages] = useState<ChatMessage[]>(() => [
    {
      id: "welcome",
      role: "agent",
      text: `Halo! Saya ${agents[0]?.name ?? "Agent"}, ${agents[0]?.role ?? "spesialis"} di ${workspace.name}. Ada yang bisa saya bantu?`,
    },
  ]);
  const [draft, setDraft] = useState("");
  const [thinking, setThinking] = useState(false);
  const chatRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const runParam = params.get("run");
  const selectedRun = runs.find((run) => run.id === runParam) ?? null;

  useEffect(() => {
    if (agentParam && agents.some((a) => a.id === agentParam)) {
      setSelectedAgentId(agentParam);
    }
  }, [agentParam, agents]);

  useEffect(() => {
    if (!leadAgent?.id) return;
    let active = true;
    if (officeApiEnabled) {
      loadAgentMessages(workspace.id, leadAgent.id)
        .then((stored) => {
          if (!active) return;
          if (stored && stored.length > 0) {
            setMessages(stored);
          } else {
            setMessages([
              {
                id: `welcome-${leadAgent.id}`,
                role: "agent",
                text: `Halo! Saya ${leadAgent.name} (${leadAgent.role}). Ada yang bisa saya bantu terkait ${leadAgent.jobdesk.toLowerCase()}?`,
              },
            ]);
          }
        })
        .catch((err) => console.warn("Failed to load agent messages:", err));
    }
    return () => {
      active = false;
    };
  }, [workspace.id, leadAgent?.id]);

  const handleClearChat = async () => {
    if (leadAgent?.id && officeApiEnabled) {
      await clearAgentMessages(workspace.id, leadAgent.id).catch(() => {});
    }
    setMessages([
      {
        id: `welcome-${leadAgent?.id ?? "default"}`,
        role: "agent",
        text: `Halo! Saya ${leadAgent?.name ?? "Agent"}, ${leadAgent?.role ?? "spesialis"} di ${workspace.name}. Ada yang bisa saya bantu?`,
      },
    ]);
  };

  useEffect(() => {
    const node = chatRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [messages, thinking]);

  const activeAutomations = automations.filter((automation) => automation.active).length;
  const openDeals = deals.filter((deal) => deal.stage !== "won");
  const openValue = openDeals.reduce((sum, deal) => sum + deal.value, 0);
  const pendingRuns = runs.filter((run) => run.state === "owner_review").length;
  const approvedRuns = runs.filter((run) => run.state === "approved").length;
  const failedRuns = runs.filter((run) => run.state === "failed" || run.state === "unavailable").length;
  const agentAvailable = leadAgent?.availability !== "unavailable";

  const scrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
    if (id === "playground") window.setTimeout(() => inputRef.current?.focus(), 450);
  };

  const openRun = (id: string) => setParams({ run: id });
  const closeRun = () => setParams({});

  const reply = (text: string): { text: string; proposal?: Proposal } => {
    const query = text.toLowerCase();
    if (/(pipeline|summary|today|overview|revenue)/.test(query)) {
      return {
        text: `${workspace.name} has ${openDeals.length} open deals worth ${moneyCompact(openValue)} in this demo dataset. ${deals
          .slice(0, 2)
          .map((deal) => `${deal.company} (${deal.stage})`)
          .join(" and ")} are the closest to a decision. I can only read the records provided here — nothing is synced live.`,
      };
    }
    if (/(follow|draw|draft|email|nudge)/.test(query) && !/(task|post)/.test(query)) {
      const lead = leads[0];
      const company = deals[0]?.company ?? "the last prospect";
      return {
        text: `I can prepare a follow-up draft for ${company}, but sending stays your call. Here is what I would queue — you review the draft, then approve or ask for changes.`,
        proposal: {
          action: "Drafted follow-up",
          subject: lead ? `${lead.name} · ${lead.company}` : company,
          limitations: ["Tone matched against the demo thread, not a live mailbox."],
          status: "pending",
        },
      };
    }
    if (/(hot|lead|qualif|score)/.test(query)) {
      const ranked = [...leads].sort((a, b) => b.score - a.score).slice(0, 3);
      return {
        text: ranked.length
          ? `Top scored leads in ${workspace.name}: ${ranked
              .map((lead) => `${lead.name} (${lead.score}, ${lead.company})`)
              .join(", ")}. Scores come from the demo dataset, so treat them as illustrative until live signals are connected.`
          : `There are no leads in ${workspace.name} yet. I won't invent any — add one and I can score it.`,
      };
    }
    if (/(post|content|social|calendar|schedule)/.test(query)) {
      const next = [...posts].sort((a, b) => a.date.localeCompare(b.date))[0];
      return {
        text: next
          ? `The next post is “${next.title}” on ${next.platform} (${next.status}). Nothing is published automatically: drafts need approval, and publishing is a separate explicit step.`
          : `There are no posts queued for ${workspace.name} in this demo.`,
      };
    }
    if (/(task|overdue|priorit)/.test(query)) {
      const open = tasks.filter((task) => task.status !== "done");
      const awaiting = tasks.filter((task) => task.approval === "pending");
      return {
        text: `${open.length} tasks are open in ${workspace.name} and ${awaiting.length} are waiting for your approval.${
          awaiting[0] ? ` “${awaiting[0].title}” is the oldest pending decision.` : ""
        } I can summarise them, but status changes stay with you.`,
      };
    }
    return {
      text: "I can read the records in this workspace and draft next steps, but I will not execute external actions. Tell me whether you want a summary, a draft, or a recommendation — and I'll preview it before anything is queued.",
    };
  };

  const send = async (text: string) => {
    const value = text.trim();
    if (!value || thinking) return;
    const userMsg: ChatMessage = { id: `u-${Date.now()}`, role: "user", text: value };
    const nextHistory = [...messages, userMsg];
    setMessages(nextHistory);
    setDraft("");
    setThinking(true);

    try {
      if (officeApiEnabled) {
        const res = await sendAgentChat({
          workspaceId: workspace.id,
          agentId: leadAgent?.id,
          messages: nextHistory.map((m) => ({ role: m.role, text: m.text })),
        });
        setMessages((current) => [
          ...current,
          {
            id: `a-${Date.now()}`,
            role: "agent",
            text: res.text,
            proposal: res.proposal ?? undefined,
          },
        ]);
      } else {
        const answer = reply(value);
        setMessages((current) => [
          ...current,
          { id: `n-${Date.now()}`, role: "agent", text: answer.text, proposal: answer.proposal },
        ]);
      }
    } catch (err) {
      console.error("agent_chat_error", err);
      setMessages((current) => [
        ...current,
        {
          id: `err-${Date.now()}`,
          role: "agent",
          text: `Gagal menghubungi AI agent: ${err instanceof Error ? err.message : "Terjadi kesalahan."}`,
        },
      ]);
    } finally {
      setThinking(false);
    }
  };

  const confirmProposal = async (messageId: string, proposal: Proposal) => {
    if (!leadAgent) return;
    if (!agentAvailable) {
      setMessages((current) =>
        current.map((message) =>
          message.id === messageId
            ? { ...message, proposal: { ...proposal, status: "unavailable" } }
            : message,
        ),
      );
      return;
    }
    const result = await startRun({
      agentId: leadAgent.id,
      action: proposal.action,
      subject: proposal.subject,
      limitations: proposal.limitations,
    });
    if (!result.ok) {
      setMessages((current) => [
        ...current,
        {
          id: `e-${Date.now()}`,
          role: "agent",
          text: `I could not queue that run: ${result.error ?? "unknown error"}. Nothing was executed.`,
        },
      ]);
      return;
    }
    setMessages((current) =>
      current.map((message) =>
        message.id === messageId ? { ...message, proposal: { ...proposal, status: "confirmed" } } : message,
      ),
    );
  };

  const cancelProposal = (messageId: string, proposal: Proposal) => {
    recordEvent({
      entityType: "copilot",
      entityId: messageId,
      action: "Copilot proposal dismissed",
      meta: `${proposal.action} · ${proposal.subject}`,
      result: "denied",
    });
    setMessages((current) =>
      current.map((message) =>
        message.id === messageId ? { ...message, proposal: { ...proposal, status: "cancelled" } } : message,
      ),
    );
  };

  const syncKnowledge = () => {
    if (syncState === "syncing") return;
    setSyncState("syncing");
    window.setTimeout(() => setSyncState("done"), 1000);
  };

  return (
    <div>
      <PageHeader
        eyebrow="Intelligence"
        title="AI agent"
        description={`${leadAgent?.name ?? "The agent"} runs drafts across ${workspace.name}: inbox triage, follow-ups and scheduling. Every external action returns to you as a preview, and every decision is logged.`}
      >
        <Button variant="outline" onClick={() => scrollTo("run-log")}>
          <Clock size={15} className="text-muted" /> Run log
        </Button>
        <Button variant="primary" onClick={() => scrollTo("playground")}>
          <Sparkles size={15} /> Talk to {leadAgent?.name ?? "the agent"}
        </Button>
      </PageHeader>

      {/* Hero */}
      <section className="card relative overflow-hidden">
        <div aria-hidden className="pointer-events-none absolute inset-0 accent-glow" />
        <div aria-hidden className="dot-grid pointer-events-none absolute right-0 top-0 h-full w-[46%] opacity-[0.18]" />
        <div className="relative p-5 md:p-6">
          <div className="flex flex-wrap items-start justify-between gap-5">
            <div className="flex gap-4">
              <AgentAvatar size="xl" online={autopilot && agentAvailable} />
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-[22px] font-semibold tracking-[-0.03em] text-ink">
                    {leadAgent?.name ?? "the agent"}
                  </h2>
                  <Badge tone="neutral" className="font-mono">
                    {leadAgent?.model?.toUpperCase() ?? "JE.EL AGENT"}
                  </Badge>
                  <Badge tone={autopilot ? "success" : "warning"} dot>
                    {autopilot ? "Autopilot active" : "Paused"}
                  </Badge>
                  {!agentAvailable && (
                    <Badge tone="warning" dot>
                      Unavailable
                    </Badge>
                  )}
                </div>
                <p className="mt-1.5 max-w-xl text-[12px] leading-relaxed text-muted">
                  {leadAgent?.role ?? "Revenue agent"} for {workspace.name}. Reads the records in this workspace and
                  drafts next steps — never sends, publishes or posts without your explicit approval.
                </p>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {(leadAgent?.capabilities ?? ["Brand-aware", "CRM native", "Tone matched", "Human hand-off"]).map(
                    (tag) => (
                      <span
                        key={tag}
                        className="rounded-md border border-line bg-surface/70 px-2 py-0.5 text-[9.5px] font-medium text-muted backdrop-blur"
                      >
                        {tag}
                      </span>
                    ),
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3 rounded-xl border border-line bg-surface/80 px-3.5 py-2.5 backdrop-blur">
              <div>
                <div className="text-[10.5px] font-medium text-ink">Autopilot</div>
                <div className="mt-0.5 text-[9.5px] text-faint">
                  {autopilot ? "Drafting, not sending" : "Holding all drafts"}
                </div>
              </div>
              <Toggle checked={autopilot} onChange={setAutopilot} label="Toggle autopilot" />
            </div>
          </div>

          <div className="mt-6 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-line bg-line md:grid-cols-4">
            {[
              { label: "Runs in workspace", value: String(runs.length), note: sync.status === "live" ? "Live · D1" : "Demo dataset", icon: Sparkles },
              { label: "Awaiting approval", value: String(pendingRuns), note: "Owner decision", icon: CheckCircle2 },
              { label: "Approved runs", value: String(approvedRuns), note: "No auto-send", icon: TrendingUp },
              { label: "Failed / blocked", value: String(failedRuns), note: "Reported honestly", icon: Zap },
            ].map((stat) => {
              const Icon = stat.icon;
              return (
                <div key={stat.label} className="bg-surface/80 px-4 py-3.5 backdrop-blur">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-medium text-faint">{stat.label}</span>
                    <Icon size={12} className="text-faint" />
                  </div>
                  <div className="mt-1.5 font-mono text-[20px] font-medium leading-none tracking-tight text-ink">
                    {stat.value}
                  </div>
                  <div className="mt-1.5 text-[9.5px] text-success">{stat.note}</div>
                </div>
              );
            })}
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-3">
            <div className="flex min-w-[240px] flex-1 items-center gap-3">
              <span className="text-[10.5px] text-muted">Autonomy</span>
              <input
                type="range"
                min={0}
                max={100}
                value={autonomy}
                onChange={(event) => setAutonomy(Number(event.target.value))}
                aria-label="Autonomy level"
                className="flex-1"
                style={{ "--range-fill": `${autonomy}%` } as CSSProperties}
              />
              <span className="w-8 text-right font-mono text-[10.5px] text-ink">{autonomy}%</span>
            </div>
            <div className="flex items-center gap-1.5 text-[10px] text-faint">
              <ShieldCheck size={12} className="text-success" />
              External actions always need approval, whatever the autonomy setting
            </div>
          </div>
        </div>
      </section>

      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-12">
        <div className="space-y-4 xl:col-span-7">
          {/* Automations */}
          <section className="card overflow-hidden">
            <div className="flex items-center justify-between gap-2 px-4 py-3.5">
              <div>
                <h2 className="flex items-center gap-2 text-[14px] font-semibold tracking-tight text-ink">
                  Automations
                  <span className="rounded-md bg-surface-3 px-1.5 py-0.5 font-mono text-[9.5px] text-muted">
                    {activeAutomations} active
                  </span>
                </h2>
                <p className="mt-0.5 text-[10.5px] text-muted">Repeatable jobs the agent runs on your behalf</p>
              </div>
              <Button variant="outline" size="sm" onClick={() => setAutomationModal(true)}>
                <Plus size={13} /> New
              </Button>
            </div>

            <div>
              {automations.map((automation) => (
                <div
                  key={automation.id}
                  className="flex items-start gap-3 border-t border-line px-4 py-3 transition-colors hover:bg-surface-2/40"
                >
                  <span
                    className={cn(
                      "mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg",
                      automation.active ? "bg-accent-soft text-accent-text" : "bg-surface-3 text-faint",
                    )}
                  >
                    <Zap size={13} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-[12px] font-medium text-ink">{automation.name}</h3>
                      <span className="font-mono text-[9px] text-faint">
                        {automation.runs.toLocaleString()} runs · {automation.successRate}% success
                      </span>
                    </div>
                    <p className="mt-1 max-w-[460px] text-[10.5px] leading-relaxed text-muted">
                      {automation.description}
                    </p>
                  </div>
                  <Toggle
                    checked={automation.active}
                    onChange={(checked) =>
                      setAutomations((current) =>
                        current.map((entry) => (entry.id === automation.id ? { ...entry, active: checked } : entry)),
                      )
                    }
                    label={`Toggle ${automation.name}`}
                  />
                </div>
              ))}
            </div>
            <div className="border-t border-line bg-surface-2/40 px-4 py-2.5 text-[9.5px] text-faint">
              Changes are versioned. New automations always start with human approval. Demo data — toggles are not
              persisted to a server.
            </div>
          </section>

          {/* Fleet */}
          <section className="card overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3.5">
              <div>
                <h2 className="text-[14px] font-semibold tracking-tight text-ink">Armada Agen</h2>
                <p className="mt-0.5 text-[10.5px] text-muted">Daftar agen di {workspace.name}</p>
              </div>
              <span className="font-mono text-[9px] uppercase tracking-[0.1em] text-faint">
                {agents.length} agen
              </span>
            </div>
            <div>
              {agents.map((agent) => {
                const availability = AVAILABILITY_META[agent.availability];
                const activeRuns = runs.filter(
                  (run) => run.agentId === agent.id && run.state !== "approved" && run.state !== "failed",
                ).length;
                return (
                  <div
                    key={agent.id}
                    onClick={() => {
                      setSelectedAgentId(agent.id);
                      scrollTo("playground");
                    }}
                    className={cn(
                      "flex items-start gap-3 border-t border-line px-4 py-3 cursor-pointer transition hover:bg-surface-2/60",
                      leadAgent?.id === agent.id && "bg-surface-2/40",
                    )}
                  >
                    <span
                      className={cn(
                        "mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg",
                        agent.availability === "unavailable"
                          ? "bg-warning-soft text-warning"
                          : "bg-accent-soft text-accent-text",
                      )}
                    >
                      <Sparkles size={13} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-[12px] font-medium text-ink">{agent.name}</h3>
                        <Badge tone={availability.tone} dot>
                          {availability.label}
                        </Badge>
                        <span className="font-mono text-[9px] text-faint">
                          {agent.model} · {activeRuns} open run{activeRuns === 1 ? "" : "s"}
                        </span>
                      </div>
                      <p className="mt-0.5 text-[10.5px] text-muted">{agent.role} · {agent.jobdesk}</p>
                      <p className="mt-0.5 text-[9.5px] text-faint">{agent.capabilities.join(" · ")}</p>
                      {(agent.skills ?? []).length > 0 && (
                        <p className="mt-0.5 text-[9.5px] text-faint">
                          skill: {(agent.skills ?? []).join(" · ")}
                        </p>
                      )}
                      {agent.note && (
                        <p className="mt-1 flex items-center gap-1 text-[9.5px] text-warning">
                          <AlertTriangle size={9} /> {agent.note}
                        </p>
                      )}
                    </div>
                    <span className="shrink-0 font-mono text-[9px] text-faint">{agent.lastSeen}</span>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Run log */}
          <section id="run-log" className="card scroll-mt-24 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3.5">
              <div>
                <h2 className="text-[14px] font-semibold tracking-tight text-ink">Recent runs</h2>
                <p className="mt-0.5 text-[10.5px] text-muted">What the agent did, in order — open a run for its trail</p>
              </div>
              <span className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.1em] text-faint">
                <span className={cn("size-1.5 rounded-full", sync.status === "live" ? "bg-success" : "bg-line-strong")} />
                {sync.status === "live" ? "Live" : "Demo"}
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] text-left">
                <thead>
                  <tr className="border-y border-line bg-surface-2/40">
                    {["Action", "Subject", "State", "Time"].map((label, index) => (
                      <th
                        key={label}
                        className={cn(
                          "px-4 py-2 font-mono text-[8.5px] font-medium uppercase tracking-[0.1em] text-faint",
                          index === 3 && "text-right",
                        )}
                      >
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {runs.map((run: OfficeRun) => (
                    <tr
                      key={run.id}
                      role="button"
                      tabIndex={0}
                      aria-label={`Open run ${run.action} for ${run.subject}`}
                      onClick={() => openRun(run.id)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          openRun(run.id);
                        }
                      }}
                      className="cursor-pointer border-b border-line transition-colors last:border-0 hover:bg-surface-2/60 focus:bg-surface-2/60 focus:outline-none"
                    >
                      <td className="whitespace-nowrap px-4 py-2.5 text-[11px] font-medium text-ink">{run.action}</td>
                      <td className="max-w-[190px] truncate px-4 py-2.5 text-[10.5px] text-muted">{run.subject}</td>
                      <td className="px-4 py-2.5">
                        <Badge tone={RUN_STATE_META[run.state].tone} dot>
                          {RUN_STATE_META[run.state].label}
                        </Badge>
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-right font-mono text-[9.5px] text-faint">
                        {run.duration ?? "—"} · {run.time}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {runs.length === 0 && (
              <div className="px-4 py-8 text-center text-[11px] text-faint">No runs recorded in this workspace yet.</div>
            )}
          </section>
        </div>

        <div className="space-y-4 xl:col-span-5">
          {/* Playground */}
          <section id="playground" className="card scroll-mt-24 flex h-[540px] flex-col overflow-hidden">
            <div className="flex items-center justify-between border-b border-line px-4 py-3">
              <div className="flex items-center gap-2">
                <AgentAvatar size="md" online={agentAvailable} />
                <div>
                  <h2 className="flex items-center gap-1.5 text-[12.5px] font-semibold text-ink">
                    {leadAgent?.name ?? "Playground"}
                    <span className="rounded bg-accent-soft px-1 py-0.5 font-mono text-[8px] text-accent-text">
                      {leadAgent?.model?.toUpperCase() ?? "JE.EL AGENT"}
                    </span>
                  </h2>
                  <p className="text-[9px] text-faint">
                    {leadAgent?.role} · Reads {workspace.name} · AI live
                  </p>
                </div>
              </div>
              <IconButton
                label="Hapus riwayat obrolan"
                onClick={handleClearChat}
                className="size-7"
              >
                <RefreshCw size={12} />
              </IconButton>
            </div>

            {agents.length > 1 && (
              <div className="flex items-center gap-1.5 border-b border-line bg-surface-2/40 px-3 py-2 overflow-x-auto">
                <span className="text-[9.5px] text-faint mr-1 shrink-0 font-medium">Pilih Agen:</span>
                {agents.map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => setSelectedAgentId(a.id)}
                    className={cn(
                      "rounded-full px-2.5 py-0.5 text-[10px] font-medium transition shrink-0",
                      leadAgent?.id === a.id
                        ? "bg-accent-soft text-accent-text border border-accent-line font-semibold"
                        : "bg-surface text-muted hover:text-ink border border-line",
                    )}
                  >
                    {a.name}
                  </button>
                ))}
              </div>
            )}

            <div ref={chatRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
              {messages.map((message) => (
                <div key={message.id} className={cn("flex gap-2", message.role === "user" ? "justify-end" : "justify-start")}>
                  {message.role === "agent" && <AgentAvatar size="sm" online={false} className="mt-auto" />}
                  <div className={cn("max-w-[85%]", message.role === "user" && "flex flex-col items-end")}>
                    <div
                      className={cn(
                        "whitespace-pre-wrap rounded-2xl px-3 py-2 text-[11.5px] leading-relaxed",
                        message.role === "user"
                          ? "rounded-br-md bg-surface-3 text-ink"
                          : "rounded-bl-md border border-line bg-surface-2 text-ink",
                      )}
                    >
                      {message.text}
                    </div>

                    {message.proposal && (
                      <div className="mt-1.5 w-full rounded-xl border border-accent/25 bg-accent-soft/30 p-2.5 text-left">
                        <div className="flex items-center gap-1.5">
                          <Sparkles size={11} className="text-accent-text" />
                          <span className="text-[10px] font-medium text-accent-text">Proposal aksi · pratinjau</span>
                        </div>
                        <p className="mt-1 text-[10.5px] leading-snug text-ink">
                          {message.proposal.action} — {message.proposal.subject}
                        </p>
                        {message.proposal.limitations.map((item) => (
                          <p key={item} className="mt-1 flex items-start gap-1 text-[9px] leading-relaxed text-faint">
                            <AlertTriangle size={8} className="mt-0.5 shrink-0 text-warning" /> {item}
                          </p>
                        ))}
                        {message.proposal.status === "pending" ? (
                          <div className="mt-2 flex flex-wrap items-center gap-1.5">
                            <Button
                              size="sm"
                              variant="primary"
                              onClick={() => confirmProposal(message.id, message.proposal!)}
                              disabled={!agentAvailable}
                            >
                              Konfirmasi &amp; antrekan
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => cancelProposal(message.id, message.proposal!)}
                            >
                              Batal
                            </Button>
                            {!agentAvailable && (
                              <span className="text-[9px] text-warning">
                                {leadAgent?.name} sedang tidak aktif — tidak ada aksi yang dieksekusi.
                              </span>
                            )}
                          </div>
                        ) : (
                          <p
                            className={cn(
                              "mt-2 flex items-center gap-1 text-[9.5px]",
                              message.proposal.status === "confirmed" ? "text-success" : "text-faint",
                            )}
                          >
                            {message.proposal.status === "confirmed" ? (
                              <>
                                <CheckCircle2 size={10} /> Masuk antrean — pantau di log eksekusi.
                              </>
                            ) : message.proposal.status === "unavailable" ? (
                              <>
                                <AlertTriangle size={10} className="text-warning" /> Tidak masuk antrean — agen tidak aktif.
                              </>
                            ) : (
                              <>Dibatalkan — tidak ada yang diantrekan.</>
                            )}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))}
              {thinking && (
                <div className="flex gap-2">
                  <AgentAvatar size="sm" online={false} className="mt-auto" />
                  <div className="flex items-center gap-1 rounded-2xl rounded-bl-md border border-line bg-surface-2 px-3 py-2.5">
                    {[0, 1, 2].map((index) => (
                      <span
                        key={index}
                        className="size-1.5 animate-typing rounded-full bg-muted"
                        style={{ animationDelay: `${index * 0.15}s` }}
                      />
                    ))}
                  </div>
                </div>
              )}

              {messages.length === 1 && (
                <div className="space-y-1.5 pt-1">
                  {suggestedPrompts.map((prompt) => (
                    <button
                      key={prompt}
                      onClick={() => send(prompt)}
                      className="flex w-full items-center justify-between gap-2 rounded-lg border border-line bg-surface px-2.5 py-2 text-left text-[10.5px] text-muted transition-colors hover:border-line-strong hover:text-ink"
                    >
                      {prompt}
                      <ArrowUpRight size={11} className="shrink-0 text-faint" />
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="border-t border-line p-2.5">
              <div className="flex items-center gap-1.5 rounded-xl border border-line bg-surface-2 p-1.5 focus-within:border-accent/40 focus-within:bg-surface">
                <Sparkles size={14} className="ml-1.5 shrink-0 text-accent-text" />
                <input
                  ref={inputRef}
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      send(draft);
                    }
                  }}
                  placeholder="Tanyakan apa saja ke agen…"
                  aria-label="Kirim pesan ke agen"
                  className="h-8 min-w-0 flex-1 bg-transparent text-[11.5px] text-ink placeholder:text-faint focus:outline-none"
                />
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => send(draft)}
                  disabled={!draft.trim()}
                  className="size-8 rounded-lg p-0"
                  aria-label="Kirim pesan ke agen"
                >
                  <Send size={13} />
                </Button>
              </div>
              <p className="mt-1.5 text-center text-[8.5px] text-faint">
                Respon menggunakan konteks ruang kerja ini. Tidak ada tindakan keluar tanpa persetujuan Anda.
              </p>
            </div>
          </section>

          {/* Knowledge */}
          <section className="card overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3.5">
              <div>
                <h2 className="text-[14px] font-semibold tracking-tight text-ink">Knowledge</h2>
                <p className="mt-0.5 text-[10.5px] text-muted">Sources the agent reasons over</p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={syncKnowledge}
                disabled={syncState === "syncing"}
                className={cn(syncState === "done" && "text-success")}
              >
                <RefreshCw size={12} className={cn(syncState === "syncing" && "animate-spin")} />
                {syncState === "syncing" ? "Syncing…" : syncState === "done" ? "Synced" : "Sync"}
              </Button>
            </div>
            <div>
              {KNOWLEDGE.map((source) => {
                const Icon = source.type === "Folder" ? Folder : source.type === "Notes" ? BookOpen : FileText;
                return (
                  <div
                    key={source.id}
                    className="flex items-center gap-3 border-t border-line px-4 py-2.5 transition-colors hover:bg-surface-2/40"
                  >
                    <span className="grid size-7 shrink-0 place-items-center rounded-lg border border-line bg-surface-2 text-muted">
                      <Icon size={13} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[11.5px] font-medium text-ink">{source.name}</div>
                      <div className="mt-0.5 text-[9.5px] text-faint">
                        {source.type} · {source.size} · {source.chunks} chunks
                      </div>
                    </div>
                    <span className="shrink-0 font-mono text-[8.5px] text-faint">{source.synced}</span>
                  </div>
                );
              })}
            </div>
            <div className="flex items-center justify-between border-t border-line bg-surface-2/40 px-4 py-2.5 text-[9px] text-faint">
              <span className="flex items-center gap-1.5">
                <ShieldCheck size={11} className="text-success" /> 452 chunks indexed
              </span>
              <span>Demo index</span>
            </div>
          </section>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 px-1 text-[10.5px] text-faint">
        <span className="flex items-center gap-1.5">
          <Avatar name="Jawad Al Amien" tone={0} size="xs" />
          Workspace-scoped · approvals and stops are written to the audit trail
        </span>
        <span className="font-mono">
          {leadAgent?.model ?? "Je.el Agent"} · demo sandbox · no external sends
        </span>
      </div>

      {automationModal && (
        <AutomationModal
          onClose={() => setAutomationModal(false)}
          onSubmit={(automation) => setAutomations((current) => [automation, ...current])}
        />
      )}

      {selectedRun && <RunDrawer run={selectedRun} onClose={closeRun} />}
    </div>
  );
}
