import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import {
  CalendarDays,
  CheckCheck,
  ChevronRight,
  MapPin,
  Search,
  Send,
  Sparkles,
  UserRoundCheck,
  X,
} from "lucide-react";
import type { Conversation, Message } from "../data/mock";
import { CONVERSATIONS_BY_WORKSPACE } from "../data/office";
import { useStore } from "../lib/store";
import { cn, money, TODAY, toneFor } from "../lib/utils";
import {
  AgentAvatar,
  Avatar,
  Badge,
  Button,
  IconButton,
  PageHeader,
  ProgressBar,
  Segmented,
} from "../components/ui";
import { PlatformIcon } from "../components/PlatformIcon";

type InboxFilter = "all" | "unread" | "ai";

const sentimentTone = {
  positive: "success" as const,
  neutral: "info" as const,
  "at risk": "accent" as const,
};

const autoReplies: Record<string, string> = {
  c1: "Warm-palette variant is with Jawad now — you'll have the side-by-side comparison before 4pm. I've also noted the milestone invoice date in the same email.",
  c2: "I've just sent a tailored estimate to your inbox, Tomás — plus two ecommerce case studies that are close to your scope. Happy to jump on a quick call if easier.",
  c3: "Kickoff is pencilled in for Wednesday 10:00 CET. I'll send the agenda, discovery questions and a shared folder before the end of the day.",
  c4: "Done — the review is now on Thursday 15:00 SGT. Everyone has the updated invite, and feedback is due Friday at noon so the team still has room to iterate.",
  c5: "Updated mockups and material notes are in your inbox. I can also courier two physical samples today if you want to feel the paper stock before deciding.",
  c6: "I've split the invoice into two payments: this Friday and the 15th. The updated invoice is on its way, and nothing will show as overdue in the meantime.",
};

function MessageBubble({ message, name, agentName }: { message: Message; name: string; agentName: string }) {
  const incoming = message.from === "them";
  return (
    <div className={cn("flex gap-2", incoming ? "justify-start" : "justify-end")}>
      {incoming && <Avatar name={name} tone={toneFor(name)} size="xs" className="mt-auto" />}
      <div className={cn("max-w-[78%]", !incoming && "flex flex-col items-end")}>
        {message.from === "ai" && (
          <div className="mb-1 flex items-center gap-1 text-[9.5px] font-medium text-accent-text">
            <Sparkles size={10} /> {agentName}
          </div>
        )}
        <div
          className={cn(
            "rounded-2xl px-3 py-2 text-[12px] leading-relaxed",
            incoming
              ? "rounded-bl-md border border-line bg-surface-2 text-ink"
              : message.from === "ai"
                ? "rounded-br-md border border-accent/20 bg-accent-soft text-ink"
                : "rounded-br-md bg-surface-3 text-ink",
          )}
        >
          {message.text}
        </div>
        <div className="mt-1 flex items-center gap-1 font-mono text-[8.5px] text-faint">
          {message.time}
          {message.from === "me" && <CheckCheck size={10} className="text-info" />}
        </div>
      </div>
    </div>
  );
}

export default function Inbox() {
  const navigate = useNavigate();
  const { workspace, leads: storeLeads, agents, recordEvent } = useStore();
  const [conversations, setConversations] = useState<Conversation[]>(
    () => CONVERSATIONS_BY_WORKSPACE[workspace.id],
  );
  const [selectedId, setSelectedId] = useState(CONVERSATIONS_BY_WORKSPACE[workspace.id][0]?.id ?? "");
  const [filter, setFilter] = useState<InboxFilter>("all");
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState("");
  const [typing, setTyping] = useState(false);
  const [dismissedSuggestions, setDismissedSuggestions] = useState<Record<string, boolean>>({});
  const [heldDrafts, setHeldDrafts] = useState<Record<string, string>>({});
  const scrollRef = useRef<HTMLDivElement>(null);
  const agentName = agents[0]?.name ?? "the agent";

  const active = conversations.find((conversation) => conversation.id === selectedId) ?? conversations[0];
  const lead = storeLeads.find((entry) => entry.name === active?.name);
  const suggestionVisible = active ? !dismissedSuggestions[active.id] : false;
  const suggestionText = active ? heldDrafts[active.id] ?? active.aiSuggestion : "";

  const filtered = useMemo(() => {
    const search = query.trim().toLowerCase();
    return conversations.filter((conversation) => {
      if (filter === "unread" && conversation.unread === 0) return false;
      if (filter === "ai" && conversation.handler !== "ai") return false;
      if (
        search &&
        !`${conversation.name} ${conversation.company} ${conversation.preview}`.toLowerCase().includes(search)
      )
        return false;
      return true;
    });
  }, [conversations, filter, query]);

  useEffect(() => {
    const node = scrollRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [selectedId, active.messages.length, typing]);

  const selectConversation = (id: string) => {
    setSelectedId(id);
    setDraft("");
    setTyping(false);
    setConversations((current) =>
      current.map((conversation) => (conversation.id === id ? { ...conversation, unread: 0 } : conversation)),
    );
  };

  const toggleHandler = () => {
    setConversations((current) =>
      current.map((conversation) =>
        conversation.id === active.id
          ? { ...conversation, handler: conversation.handler === "ai" ? "human" : "ai" }
          : conversation,
      ),
    );
  };

  const sendMessage = () => {
    const text = draft.trim();
    if (!text) return;
    const conversationId = active.id;
    const newMessage: Message = {
      id: `m-${Date.now()}`,
      from: "me",
      text,
      time: format(new Date(), "HH:mm"),
    };
    setConversations((current) =>
      current.map((conversation) =>
        conversation.id === conversationId
          ? {
              ...conversation,
              messages: [...conversation.messages, newMessage],
              preview: text,
              lastTime: "now",
            }
          : conversation,
      ),
    );
    setDraft("");
    recordEvent({
      entityType: "inbox",
      entityId: conversationId,
      action: `Reply sent to ${active.name}`,
      meta: `${active.company} · sent manually by owner`,
    });

    if (active.handler === "ai") {
      setTyping(true);
      window.setTimeout(() => {
        setHeldDrafts((current) => ({
          ...current,
          [conversationId]:
            autoReplies[conversationId] ??
            `Noted — I'll keep this moving and flag anything that needs ${active.name.split(" ")[0]}'s decision.`,
        }));
        setDismissedSuggestions((current) => ({ ...current, [conversationId]: false }));
        setTyping(false);
      }, 1300);
    }
  };

  const unreadTotal = conversations.reduce((sum, conversation) => sum + conversation.unread, 0);
  const aiHandling = conversations.filter((conversation) => conversation.handler === "ai").length;

  return (
    <div>
      <PageHeader
        eyebrow="Workspace"
        title="Inbox"
        description={`Every conversation in ${workspace.name}, with ${agentName} preparing drafts. Nothing sends until you press send.`}
      >
        <Badge tone="accent" dot>
          {unreadTotal} unread
        </Badge>
        <Button variant="outline" onClick={() => navigate("/agent")}>
          <Sparkles size={15} className="text-muted" /> Agent settings
        </Button>
      </PageHeader>

      <div className="card grid grid-cols-1 overflow-hidden md:h-[calc(100dvh-198px)] md:min-h-[640px] md:grid-cols-[300px_minmax(0,1fr)] xl:grid-cols-[300px_minmax(0,1fr)_296px]">
        {/* Conversation list */}
        <div className="flex max-h-[300px] flex-col border-b border-line md:max-h-none md:border-b-0 md:border-r">
          <div className="border-b border-line p-3">
            <div className="flex items-center justify-between">
              <h2 className="text-[13px] font-semibold text-ink">Conversations</h2>
              <span className="font-mono text-[10px] text-faint">{filtered.length}</span>
            </div>
            <div className="relative mt-2">
              <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-faint" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search conversations…"
                className="h-8 w-full rounded-lg border border-line bg-surface-2 pl-[30px] pr-2.5 text-[11px] text-ink placeholder:text-faint focus:border-accent/40 focus:bg-surface focus:outline-none"
              />
            </div>
            <div className="mt-2">
              <Segmented<InboxFilter>
                value={filter}
                onChange={setFilter}
                size="sm"
                className="w-full"
                options={[
                  { value: "all", label: "All" },
                  { value: "unread", label: "Unread", count: unreadTotal },
                  { value: "ai", label: agentName, count: aiHandling },
                ]}
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {filtered.map((conversation) => {
              const isActive = conversation.id === active.id;
              return (
                <button
                  key={conversation.id}
                  onClick={() => selectConversation(conversation.id)}
                  className={cn(
                    "relative flex w-full gap-2.5 border-l-2 px-3 py-3 text-left transition-colors",
                    isActive
                      ? "border-accent bg-surface-2"
                      : "border-transparent hover:bg-surface-2/60",
                  )}
                >
                  <Avatar name={conversation.name} tone={toneFor(conversation.name)} size="md" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="truncate text-[11.5px] font-semibold text-ink">{conversation.name}</span>
                      <span className="shrink-0 font-mono text-[8.5px] text-faint">{conversation.lastTime}</span>
                    </div>
                    <div className="mt-0.5 flex items-center gap-1.5">
                      <span className="truncate text-[9.5px] text-faint">{conversation.company}</span>
                      <span className="text-[8px] text-line-strong">·</span>
                      <PlatformIcon platform={conversation.channel} size="sm" className="scale-[0.65]" />
                      {conversation.handler === "ai" && <Sparkles size={9} className="text-accent-text" />}
                    </div>
                    <p className="mt-1 line-clamp-1 text-[10px] leading-snug text-muted">{conversation.preview}</p>
                  </div>
                  {conversation.unread > 0 && (
                    <span className="absolute bottom-3 right-3 grid size-4 place-items-center rounded-full bg-accent font-mono text-[8px] font-medium text-white">
                      {conversation.unread}
                    </span>
                  )}
                </button>
              );
            })}
            {filtered.length === 0 && (
              <div className="px-4 py-10 text-center text-[11px] text-faint">No conversations found.</div>
            )}
          </div>

          <div className="border-t border-line px-3 py-2.5">
            <div className="flex items-center justify-between text-[9.5px] text-faint">
              <span className="flex items-center gap-1.5">
                <AgentAvatar size="sm" className="scale-[0.8]" />
                {agentName} drafting {aiHandling} of {conversations.length}
              </span>
              <span className="flex items-center gap-1 text-success">
                <span className="size-1.5 rounded-full bg-success" /> online
              </span>
            </div>
            <ProgressBar value={aiHandling} max={conversations.length} className="mt-2" height="h-1" />
          </div>
        </div>

        {/* Thread */}
        <div className="flex min-h-[520px] flex-col md:min-h-0">
          <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-2.5">
            <div className="flex min-w-0 items-center gap-2.5">
              <Avatar name={active.name} tone={toneFor(active.name)} size="md" />
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <h2 className="truncate text-[13px] font-semibold text-ink">{active.name}</h2>
                  <PlatformIcon platform={active.channel} size="sm" className="scale-90" />
                </div>
                <p className="truncate text-[10px] text-faint">
                  {active.role} · {active.company}
                </p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              <Badge tone={active.handler === "ai" ? "accent" : "neutral"} dot className="hidden sm:inline-flex">
                {active.handler === "ai" ? `${agentName} drafting` : "You're handling"}
              </Badge>
              <button
                onClick={toggleHandler}
                className="flex h-7 items-center gap-1 rounded-lg border border-line px-2 text-[10px] font-medium text-muted transition-colors hover:border-line-strong hover:text-ink"
              >
                {active.handler === "ai" ? <UserRoundCheck size={11} /> : <Sparkles size={11} />}
                {active.handler === "ai" ? "Take over" : `Hand to ${agentName}`}
              </button>
            </div>
          </div>

          <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto px-4 py-5">
            <div className="flex items-center gap-3">
              <div className="h-px flex-1 bg-line" />
              <span className="font-mono text-[8.5px] uppercase tracking-[0.12em] text-faint">Today</span>
              <div className="h-px flex-1 bg-line" />
            </div>
            {active.messages.map((message) => (
              <MessageBubble key={message.id} message={message} name={active.name} agentName={agentName} />
            ))}
            {typing && (
              <div className="flex justify-end">
                <div className="flex flex-col items-end">
                  <div className="mb-1 flex items-center gap-1 text-[9.5px] font-medium text-accent-text">
                    <Sparkles size={10} /> {agentName} is drafting
                  </div>
                  <div className="flex items-center gap-1 rounded-2xl rounded-br-md border border-accent/20 bg-accent-soft px-3 py-2.5">
                    {[0, 1, 2].map((index) => (
                      <span
                        key={index}
                        className="size-1.5 animate-typing rounded-full bg-accent-text"
                        style={{ animationDelay: `${index * 0.15}s` }}
                      />
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          {suggestionVisible && (
            <div className="mx-3 mb-2 rounded-xl border border-accent/20 bg-accent-soft/40 p-3">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-accent-text">
                  <Sparkles size={11} /> {agentName}'s draft reply
                </span>
                <IconButton
                  label="Dismiss suggestion"
                  onClick={() => setDismissedSuggestions((current) => ({ ...current, [active.id]: true }))}
                  className="size-5"
                >
                  <X size={11} />
                </IconButton>
              </div>
              <p className="mt-1.5 line-clamp-3 text-[11px] leading-relaxed text-muted">{suggestionText}</p>
              <div className="mt-2 flex items-center gap-2">
                <Button
                  size="sm"
                  variant="primary"
                  onClick={() => {
                    setDraft(suggestionText);
                    setDismissedSuggestions((current) => ({ ...current, [active.id]: true }));
                  }}
                >
                  Use reply
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setDismissedSuggestions((current) => ({ ...current, [active.id]: true }))}>
                  Dismiss
                </Button>
                <span className="ml-auto flex items-center gap-1 font-mono text-[8.5px] text-faint">
                  <span className="size-1 rounded-full bg-success" /> {active.confidence}% confidence
                </span>
              </div>
            </div>
          )}

          <div className="border-t border-line p-3">
            <div className="flex items-end gap-1.5 rounded-xl border border-line bg-surface-2 p-1.5 transition-colors focus-within:border-accent/40 focus-within:bg-surface">
              <button
                onClick={() => setDraft(suggestionText)}
                aria-label={`Use ${agentName}'s suggestion`}
                className="grid size-8 shrink-0 place-items-center rounded-lg text-accent-text transition-colors hover:bg-accent-soft"
              >
                <Sparkles size={15} />
              </button>
              <input
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    sendMessage();
                  }
                }}
                placeholder={`Reply to ${active.name.split(" ")[0]}…`}
                className="h-8 min-w-0 flex-1 bg-transparent text-[12px] text-ink placeholder:text-faint focus:outline-none"
              />
              <Button
                variant="primary"
                size="sm"
                onClick={sendMessage}
                disabled={!draft.trim()}
                className="size-8 rounded-lg p-0"
                aria-label="Send message"
              >
                <Send size={13} />
              </Button>
            </div>
            <div className="mt-1.5 flex items-center justify-between px-1 text-[8.5px] text-faint">
              <span>Enter to send · {agentName} only drafts</span>
              <span className="hidden sm:inline">Reply target: 15 min</span>
            </div>
          </div>
        </div>

        {/* Insight panel */}
        <aside className="hidden flex-col overflow-y-auto border-l border-line xl:flex">
          <div className="border-b border-line p-4 text-center">
            <Avatar name={active.name} tone={toneFor(active.name)} size="xl" className="mx-auto" />
            <h3 className="mt-2.5 text-[14px] font-semibold text-ink">{active.name}</h3>
            <p className="text-[10.5px] text-muted">
              {active.role} · {active.company}
            </p>
            <div className="mt-2 flex justify-center gap-1.5">
              <Badge tone={sentimentTone[active.sentiment]} dot>
                {active.sentiment}
              </Badge>
              <Badge tone="neutral">{active.channel}</Badge>
            </div>
            <div className="mt-3 flex items-center justify-center gap-2">
              <Button variant="outline" size="sm" className="flex-1" onClick={() => navigate("/leads")}>
                View lead
              </Button>
              <Button variant="secondary" size="sm" className="flex-1" onClick={() => navigate("/schedule")}>
                <CalendarDays size={12} /> Book
              </Button>
            </div>
          </div>

          <div className="space-y-4 p-4">
            <div>
              <div className="overline mb-2">AI summary</div>
              <div className="rounded-xl border border-line bg-surface-2/60 p-3">
                <div className="text-[10px] text-faint">Detected intent</div>
                <div className="mt-0.5 text-[12px] font-medium text-ink">{active.intent}</div>
                <div className="mt-3 flex items-center justify-between text-[9.5px] text-faint">
                  <span>Confidence</span>
                  <span className="font-mono text-muted">{active.confidence}%</span>
                </div>
                <ProgressBar value={active.confidence} className="mt-1.5" height="h-1" />
                <div className="mt-3 flex items-start gap-1.5 border-t border-line pt-2.5 text-[10px] leading-relaxed text-muted">
                  <Sparkles size={11} className="mt-0.5 shrink-0 text-accent-text" />
                  {agentName} drafts replies in the workspace tone. Pricing, scope and send-offs stay with you.
                </div>
              </div>
            </div>

            <div>
              <div className="overline mb-2">Deal context</div>
              <div className="space-y-2.5 rounded-xl border border-line p-3">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-faint">Value</span>
                  <span className="font-mono text-[12px] font-medium text-ink">{money(active.value)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-faint">Stage</span>
                  <Badge tone="success">Qualified</Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-faint">Owner</span>
                  <span className="flex items-center gap-1.5 text-[10.5px] text-ink">
                    <Avatar name="Jawad Al Amien" tone={6} size="xs" /> Jawad
                  </span>
                </div>
              </div>
            </div>

            <div>
              <div className="overline mb-2">Contact</div>
              <div className="space-y-1.5 text-[10.5px] text-muted">
                <div className="flex items-center gap-2">
                  <span className="text-faint">@</span> {active.email}
                </div>
                <div className="flex items-center gap-2">
                  <MapPin size={11} className="text-faint" /> {active.location}
                </div>
                {lead && (
                  <div className="flex items-center justify-between border-t border-line pt-2 text-[10px]">
                    <span className="text-faint">Lead score</span>
                    <span className="font-mono text-ink">{lead.score}/100</span>
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-xl border border-dashed border-line p-3">
              <div className="text-[9px] uppercase tracking-[0.1em] text-faint">Suggested next step</div>
              <p className="mt-1 text-[11px] leading-snug text-ink">
                {lead?.nextStep ?? "Confirm scope and send a booking link."}
              </p>
              <button
                onClick={() => navigate("/agent")}
                className="mt-2 flex items-center gap-1 text-[10px] font-medium text-accent-text hover:underline"
              >
                Ask {agentName} to draft this <ChevronRight size={11} />
              </button>
            </div>
          </div>
        </aside>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 px-1 text-[10.5px] text-faint">
        <span className="flex items-center gap-1.5">
          <CheckCheck size={11} /> Drafts stay in the workspace until you send. Sending is written to the audit trail.
        </span>
        <span className="font-mono">{format(TODAY, "HH:mm")} local time</span>
      </div>
    </div>
  );
}
