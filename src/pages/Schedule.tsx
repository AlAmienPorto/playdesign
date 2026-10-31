import { useMemo, useState, type FormEvent } from "react";
import {
  addDays,
  addMonths,
  addWeeks,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  parseISO,
  startOfMonth,
  startOfWeek,
  subMonths,
  subWeeks,
} from "date-fns";
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Copy,
  PencilLine,
  Plus,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import {
  type Platform,
  type Post,
  type PostFormat,
  type PostStatus,
  teamById,
} from "../data/mock";
import { useStore } from "../lib/store";
import { cn, TODAY } from "../lib/utils";
import {
  Avatar,
  Badge,
  Button,
  Drawer,
  Field,
  IconButton,
  inputClass,
  Modal,
  PageHeader,
  Segmented,
} from "../components/ui";
import { PlatformIcon } from "../components/PlatformIcon";

const statusTone: Record<PostStatus, "success" | "info" | "warning" | "neutral"> = {
  published: "success",
  scheduled: "info",
  review: "warning",
  draft: "neutral",
};

const statusLabel: Record<PostStatus, string> = {
  published: "Published",
  scheduled: "Scheduled",
  review: "In review",
  draft: "Draft",
};

const statusDot: Record<PostStatus, string> = {
  published: "bg-success",
  scheduled: "bg-info",
  review: "bg-warning",
  draft: "bg-line-strong",
};

const platforms: Platform[] = ["Instagram", "LinkedIn", "X", "TikTok", "YouTube", "Email"];
const formats: PostFormat[] = ["Carousel", "Single", "Reel", "Thread", "Story"];

const weekdayLabels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function platformColor(platform: Platform) {
  const map: Record<Platform, string> = {
    Instagram: "#f0629b",
    LinkedIn: "#5aa2f0",
    X: "rgb(var(--fg))",
    TikTok: "#2fd3ba",
    YouTube: "#ff5c5c",
    Email: "#e1a448",
    "Web chat": "#72a0ff",
  };
  return map[platform];
}

function ComposerModal({
  defaultDate,
  onClose,
  onSubmit,
}: {
  defaultDate: string;
  onClose: () => void;
  onSubmit: (post: Omit<Post, "id">) => void;
}) {
  const [title, setTitle] = useState("");
  const [caption, setCaption] = useState("");
  const [platform, setPlatform] = useState<Platform>("Instagram");
  const [postFormat, setPostFormat] = useState<PostFormat>("Carousel");
  const [date, setDate] = useState(defaultDate);
  const [time, setTime] = useState("09:00");
  const [status, setStatus] = useState<PostStatus>("review");
  const { agents } = useStore();
  const agentName = agents[0]?.name ?? "the agent";

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!title.trim() || !date) return;
    onSubmit({
      title: title.trim(),
      caption: caption.trim() || "No caption yet.",
      platform,
      format: postFormat,
      date,
      time,
      status,
      ownerId: "ja",
    });
    onClose();
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Schedule a post"
      description={`${agentName} will hold it for review if you keep it as a draft.`}
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" form="post-form">
            Add to calendar
          </Button>
        </>
      }
    >
      <form id="post-form" onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        <Field label="Post title" className="sm:col-span-2">
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            className={inputClass}
            placeholder="e.g. Work that speaks — studio principles"
            required
            autoFocus
          />
        </Field>
        <Field label="Caption" hint="Optional" className="sm:col-span-2">
          <textarea
            value={caption}
            onChange={(event) => setCaption(event.target.value)}
            rows={3}
            className={cn(inputClass, "resize-none")}
            placeholder={`Write the hook, then let ${agentName} refine the tone…`}
          />
        </Field>
        <Field label="Channel">
          <select value={platform} onChange={(event) => setPlatform(event.target.value as Platform)} className={inputClass}>
            {platforms.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
        </Field>
        <Field label="Format">
          <select
            value={postFormat}
            onChange={(event) => setPostFormat(event.target.value as PostFormat)}
            className={inputClass}
          >
            {formats.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
        </Field>
        <Field label="Date">
          <input type="date" value={date} onChange={(event) => setDate(event.target.value)} className={inputClass} required />
        </Field>
        <Field label="Time">
          <input type="time" value={time} onChange={(event) => setTime(event.target.value)} className={inputClass} />
        </Field>
        <Field label="Status" className="sm:col-span-2">
          <div className="flex flex-wrap gap-2">
            {(["scheduled", "draft", "review"] as PostStatus[]).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setStatus(option)}
                className={cn(
                  "flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-[11px] font-medium transition-colors",
                  status === option
                    ? "border-accent/40 bg-accent-soft text-accent-text"
                    : "border-line bg-surface-2 text-muted hover:text-ink",
                )}
              >
                <span className={cn("size-1.5 rounded-full", statusDot[option])} />
                {statusLabel[option]}
              </button>
            ))}
          </div>
        </Field>
      </form>
    </Modal>
  );
}

function PostDrawer({ post, onClose }: { post: Post; onClose: () => void }) {
  const { updatePost, deletePost, addPost, approvePost, publishPost } = useStore();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const author = teamById(post.ownerId);

  const approve = () => {
    setError(null);
    setNotice(null);
    const result = approvePost(post.id);
    if (!result.ok) {
      setError(result.error ?? "This post could not be approved.");
      return;
    }
    setNotice("Approved and scheduled. Publishing remains a separate, explicit step.");
  };

  const publish = () => {
    setError(null);
    setNotice(null);
    const result = publishPost(post.id);
    if (!result.ok) {
      setError(result.error ?? "This post cannot be published.");
      return;
    }
    setNotice("Published in this demo session. No external network call was made.");
  };

  return (
    <Drawer open onClose={onClose} title="Post details">
      <div className="sticky top-0 z-10 flex items-center justify-between border-b border-line bg-surface/95 px-5 py-3.5 backdrop-blur">
        <div className="flex items-center gap-2.5">
          <PlatformIcon platform={post.platform} size="md" />
          <div>
            <div className="text-[12px] font-medium text-ink">{post.platform}</div>
            <div className="text-[10px] text-faint">{post.format}</div>
          </div>
        </div>
        <IconButton label="Close details" onClick={onClose}>
          <X size={16} />
        </IconButton>
      </div>

      <div className="flex-1 px-5 py-5">
        <div className="flex items-center justify-between gap-2">
          <Badge tone={statusTone[post.status]} dot>
            {statusLabel[post.status]}
          </Badge>
          <span className="font-mono text-[10px] text-faint">#{post.id.toUpperCase()}</span>
        </div>
        <h2 className="mt-3 text-[19px] font-semibold leading-snug tracking-[-0.02em] text-ink">{post.title}</h2>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <div className="rounded-xl border border-line bg-surface-2 p-3">
            <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.08em] text-faint">
              <CalendarDays size={11} /> Date
            </div>
            <div className="mt-1.5 text-[12px] font-medium text-ink">
              {format(parseISO(post.date), "EEE, MMM d")}
            </div>
          </div>
          <div className="rounded-xl border border-line bg-surface-2 p-3">
            <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.08em] text-faint">
              <Clock size={11} /> Time
            </div>
            <div className="mt-1.5 text-[12px] font-medium text-ink">{post.time}</div>
          </div>
        </div>

        <div className="mt-5">
          <div className="overline mb-2">Caption</div>
          <p className="rounded-xl border border-line bg-surface-2 p-3.5 text-[12px] leading-relaxed text-muted">
            {post.caption}
          </p>
        </div>

        {post.status === "published" && (
          <div className="mt-5 grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-line p-3">
              <div className="text-[10px] text-faint">Reach</div>
              <div className="mt-1 font-mono text-[18px] font-medium text-ink">
                {post.reach ? post.reach.toLocaleString() : "—"}
              </div>
            </div>
            <div className="rounded-xl border border-line p-3">
              <div className="text-[10px] text-faint">Engagement</div>
              <div className="mt-1 font-mono text-[18px] font-medium text-ink">
                {post.engagement ? `${post.engagement}%` : "—"}
              </div>
            </div>
          </div>
        )}

        <div className="mt-5 flex items-center justify-between rounded-xl border border-line p-3">
          <div className="flex items-center gap-2.5">
            <Avatar name={author.name} tone={author.tone} size="sm" />
            <div>
              <div className="text-[11.5px] font-medium text-ink">{author.name}</div>
              <div className="text-[10px] text-faint">{author.role}</div>
            </div>
          </div>
          <span className="text-[10px] text-faint">Owner</span>
        </div>

        <div className="mt-5 rounded-xl border border-dashed border-line bg-surface-2/50 p-3">
          <div className="flex items-start gap-2">
            <Sparkles size={13} className="mt-0.5 shrink-0 text-accent-text" />
            <p className="text-[11px] leading-relaxed text-muted">
              Draft heuristic: <span className="font-medium text-ink">09:00–11:00</span> performs best for this channel
              in the demo dataset. Treat it as a suggestion, not a measured result.
            </p>
          </div>
        </div>

        <div className="mt-4 rounded-xl border border-line px-3 py-2.5 text-[10px] leading-relaxed text-faint">
          {post.status === "published"
            ? "Published. The record stays in the audit trail."
            : post.status === "scheduled"
              ? "Approved and scheduled. Publishing needs a separate, explicit confirmation."
              : "Nothing is scheduled or published until you approve this draft."}
        </div>
      </div>

      <div className="sticky bottom-0 border-t border-line bg-surface px-5 py-3.5">
        {error && (
          <div className="mb-2 rounded-lg bg-accent-soft px-2.5 py-2 text-[10.5px] text-accent-text">{error}</div>
        )}
        {notice && (
          <div className="mb-2 flex items-start gap-1.5 rounded-lg bg-success-soft px-2.5 py-2 text-[10.5px] text-success">
            <CheckCircle2 size={11} className="mt-0.5 shrink-0" /> {notice}
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2">
        {post.status !== "published" && post.status !== "scheduled" && (
          <Button variant="primary" size="sm" onClick={approve}>
            <CheckCircle2 size={13} /> Approve &amp; schedule
          </Button>
        )}
        {post.status === "scheduled" && (
          <>
            <Button variant="primary" size="sm" onClick={publish}>
              <ArrowRight size={13} /> Publish now
            </Button>
            <Button variant="outline" size="sm" onClick={() => updatePost(post.id, { status: "draft" })}>
              <PencilLine size={13} /> Move to draft
            </Button>
          </>
        )}
        <Button
          variant="outline"
          size="sm"
          onClick={() =>
            addPost({
              ...post,
              title: `${post.title} (copy)`,
              status: "draft",
            })
          }
        >
          <Copy size={13} /> Duplicate
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="ml-auto text-accent-text hover:bg-accent-soft hover:text-accent-text"
          onClick={() => {
            deletePost(post.id);
            onClose();
          }}
        >
          <Trash2 size={13} /> Delete
        </Button>
        </div>
      </div>
    </Drawer>
  );
}

export default function Schedule() {
  const { posts, addPost, updatePost, agents } = useStore();
  const agentName = agents[0]?.name ?? "the agent";
  const [cursor, setCursor] = useState(startOfMonth(TODAY));
  const [selectedDate, setSelectedDate] = useState(TODAY);
  const [view, setView] = useState<"month" | "week">("month");
  const [composerOpen, setComposerOpen] = useState(false);
  const [composerDate, setComposerDate] = useState(format(TODAY, "yyyy-MM-dd"));
  const [selectedPostId, setSelectedPostId] = useState<string | null>(null);
  const [suggestionApplied, setSuggestionApplied] = useState(false);

  const selectedPost = posts.find((post) => post.id === selectedPostId) ?? null;
  const nextDraft = posts.find((post) => post.status === "review" || post.status === "draft") ?? null;

  const applySuggestion = () => {
    const delta = (4 - TODAY.getDay() + 7) % 7 || 7;
    const thursday = addDays(TODAY, delta);
    if (nextDraft) {
      updatePost(nextDraft.id, { date: format(thursday, "yyyy-MM-dd"), time: "09:00", status: "review" });
    }
    setSuggestionApplied(true);
    setSelectedDate(thursday);
    setCursor(startOfMonth(thursday));
  };

  const postsByDate = useMemo(() => {
    const map = new Map<string, Post[]>();
    posts.forEach((post) => {
      const list = map.get(post.date) ?? [];
      list.push(post);
      map.set(post.date, list);
    });
    return map;
  }, [posts]);

  const monthDays = useMemo(() => {
    const start = startOfWeek(startOfMonth(cursor), { weekStartsOn: 1 });
    const end = endOfWeek(endOfMonth(cursor), { weekStartsOn: 1 });
    return eachDayOfInterval({ start, end });
  }, [cursor]);

  const weekDays = useMemo(() => {
    const start = startOfWeek(selectedDate, { weekStartsOn: 1 });
    return eachDayOfInterval({ start, end: endOfWeek(selectedDate, { weekStartsOn: 1 }) });
  }, [selectedDate]);

  const monthPosts = posts.filter((post) => isSameMonth(parseISO(post.date), cursor));
  const scheduledCount = monthPosts.filter((post) => post.status === "scheduled").length;
  const selectedPosts = [...(postsByDate.get(format(selectedDate, "yyyy-MM-dd")) ?? [])].sort((a, b) =>
    a.time.localeCompare(b.time),
  );
  const upcoming = [...posts]
    .filter((post) => post.status === "scheduled" && parseISO(post.date) >= TODAY)
    .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time))
    .slice(0, 4);

  const channelMix = platforms
    .map((platform) => ({
      platform,
      count: posts.filter((post) => post.platform === platform).length,
    }))
    .filter((entry) => entry.count > 0)
    .sort((a, b) => b.count - a.count);
  const maxChannel = Math.max(...channelMix.map((entry) => entry.count), 1);

  const navigate = (direction: "prev" | "next" | "today") => {
    if (direction === "today") {
      setCursor(startOfMonth(TODAY));
      setSelectedDate(TODAY);
      return;
    }
    if (view === "month") {
      const next = direction === "next" ? addMonths(cursor, 1) : subMonths(cursor, 1);
      setCursor(next);
      setSelectedDate(next);
    } else {
      setSelectedDate((current) => (direction === "next" ? addDays(current, 7) : addDays(current, -7)));
      setCursor((current) => (direction === "next" ? addWeeks(current, 1) : subWeeks(current, 1)));
    }
  };

  const openComposer = (date?: Date) => {
    setComposerDate(format(date ?? selectedDate, "yyyy-MM-dd"));
    setComposerOpen(true);
  };

  return (
    <div>
      <PageHeader
        eyebrow="Marketing"
        title="Content calendar"
        description="Plan, review and schedule posts across every channel. Drafts need approval before they are scheduled, and publishing is always a separate step."
      >
        <Button variant="outline" onClick={() => openComposer()}>
          <Plus size={15} className="text-muted" />
          New post
        </Button>
        <Button variant="primary" onClick={() => openComposer(TODAY)}>
          <Sparkles size={15} />
          Draft with {agentName}
        </Button>
      </PageHeader>

      <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-12">
        <section className="card overflow-hidden xl:col-span-9">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3.5">
            <div className="flex items-center gap-2">
              <div className="flex items-center rounded-lg border border-line bg-surface-2 p-0.5">
                <button
                  onClick={() => navigate("prev")}
                  aria-label="Previous"
                  className="grid size-7 place-items-center rounded-md text-muted transition-colors hover:bg-surface hover:text-ink"
                >
                  <ChevronLeft size={14} />
                </button>
                <button
                  onClick={() => navigate("next")}
                  aria-label="Next"
                  className="grid size-7 place-items-center rounded-md text-muted transition-colors hover:bg-surface hover:text-ink"
                >
                  <ChevronRight size={14} />
                </button>
              </div>
              <div>
                <h2 className="text-[15px] font-semibold tracking-tight text-ink">
                  {view === "month"
                    ? format(cursor, "MMMM yyyy")
                    : `${format(weekDays[0], "MMM d")} – ${format(weekDays[6], "MMM d, yyyy")}`}
                </h2>
                <p className="mt-0.5 text-[10.5px] text-faint">
                  {view === "month"
                    ? `${monthPosts.length} posts · ${scheduledCount} scheduled`
                    : `${weekDays.reduce((sum, day) => sum + (postsByDate.get(format(day, "yyyy-MM-dd"))?.length ?? 0), 0)} posts this week`}
                </p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => navigate("today")} className="ml-1">
                Today
              </Button>
            </div>

            <div className="flex items-center gap-2">
              <Segmented<"month" | "week">
                value={view}
                onChange={setView}
                size="sm"
                options={[
                  { value: "month", label: "Month" },
                  { value: "week", label: "Week" },
                ]}
              />
              <Button variant="secondary" size="sm" onClick={() => openComposer()}>
                <Plus size={13} /> Post
              </Button>
            </div>
          </div>

          {view === "month" ? (
            <div>
              <div className="grid grid-cols-7 border-b border-line bg-surface-2/50">
                {weekdayLabels.map((label, index) => (
                  <div
                    key={label}
                    className={cn(
                      "px-2 py-2 text-center font-mono text-[9.5px] font-medium uppercase tracking-[0.1em]",
                      index >= 5 ? "text-faint/70" : "text-faint",
                    )}
                  >
                    {label}
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-7">
                {monthDays.map((day) => {
                  const dateKey = format(day, "yyyy-MM-dd");
                  const dayPosts = (postsByDate.get(dateKey) ?? []).sort((a, b) => a.time.localeCompare(b.time));
                  const inMonth = isSameMonth(day, cursor);
                  const isToday = isSameDay(day, TODAY);
                  const isSelected = isSameDay(day, selectedDate);
                  const isWeekend = day.getDay() === 0 || day.getDay() === 6;
                  return (
                    <div
                      key={dateKey}
                      className={cn(
                        "min-h-[108px] border-b border-r border-line p-1.5 last:border-r-0",
                        !inMonth && "bg-surface-2/30",
                        isWeekend && inMonth && "bg-surface-2/20",
                        isSelected && inMonth && "bg-accent-soft/30",
                      )}
                    >
                      <div className="mb-1 flex items-center justify-between">
                        <button
                          onClick={() => setSelectedDate(day)}
                          className={cn(
                            "grid size-6 place-items-center rounded-full font-mono text-[10.5px] transition-colors",
                            isToday
                              ? "bg-accent font-semibold text-white"
                              : inMonth
                                ? "text-muted hover:bg-surface-3 hover:text-ink"
                                : "text-faint/50 hover:bg-surface-3",
                            isSelected && !isToday && inMonth && "bg-surface-3 text-ink ring-1 ring-line-strong",
                          )}
                        >
                          {format(day, "d")}
                        </button>
                        {dayPosts.length > 2 && inMonth && (
                          <span className="font-mono text-[8.5px] text-faint">{dayPosts.length}</span>
                        )}
                      </div>
                      <div className="space-y-1">
                        {dayPosts.slice(0, 2).map((post) => (
                          <button
                            key={post.id}
                            onClick={() => setSelectedPostId(post.id)}
                            className={cn(
                              "group flex w-full items-center gap-1.5 rounded-[5px] border border-line/70 bg-surface px-1.5 py-[3px] text-left transition-colors hover:border-line-strong hover:bg-surface-2",
                              !inMonth && "opacity-60",
                            )}
                          >
                            <span
                              className="size-1.5 shrink-0 rounded-full"
                              style={{ backgroundColor: platformColor(post.platform) }}
                            />
                            <span className="truncate text-[9px] font-medium text-muted group-hover:text-ink">
                              {post.title}
                            </span>
                            {post.status === "draft" && (
                              <span className="ml-auto shrink-0 font-mono text-[7.5px] uppercase text-faint">D</span>
                            )}
                          </button>
                        ))}
                        {dayPosts.length > 2 && (
                          <button
                            onClick={() => setSelectedDate(day)}
                            className="w-full rounded-[5px] px-1.5 py-[2px] text-left text-[8.5px] font-medium text-faint transition-colors hover:bg-surface-3 hover:text-muted"
                          >
                            +{dayPosts.length - 2} more
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <div className="grid min-w-[720px] grid-cols-7">
                {weekDays.map((day) => {
                  const dateKey = format(day, "yyyy-MM-dd");
                  const dayPosts = (postsByDate.get(dateKey) ?? []).sort((a, b) => a.time.localeCompare(b.time));
                  const isToday = isSameDay(day, TODAY);
                  return (
                    <div
                      key={dateKey}
                      className={cn(
                        "min-h-[420px] border-r border-line p-2 last:border-r-0",
                        isSameDay(day, selectedDate) && "bg-accent-soft/20",
                      )}
                    >
                      <button
                        onClick={() => setSelectedDate(day)}
                        className="mb-2 flex w-full items-center justify-between rounded-lg px-1.5 py-1 text-left hover:bg-surface-2"
                      >
                        <span>
                          <span className="block font-mono text-[9px] uppercase tracking-[0.1em] text-faint">
                            {format(day, "EEE")}
                          </span>
                          <span
                            className={cn(
                              "mt-0.5 inline-grid size-6 place-items-center rounded-full font-mono text-[11px]",
                              isToday ? "bg-accent font-semibold text-white" : "text-ink",
                            )}
                          >
                            {format(day, "d")}
                          </span>
                        </span>
                        <span className="font-mono text-[9px] text-faint">{dayPosts.length}</span>
                      </button>
                      <div className="space-y-1.5">
                        {dayPosts.map((post) => (
                          <button
                            key={post.id}
                            onClick={() => setSelectedPostId(post.id)}
                            className="w-full rounded-lg border border-line bg-surface p-2 text-left transition-colors hover:border-line-strong hover:bg-surface-2"
                          >
                            <div className="flex items-center justify-between">
                              <PlatformIcon platform={post.platform} size="sm" className="scale-[0.8]" />
                              <span className="font-mono text-[8.5px] text-faint">{post.time}</span>
                            </div>
                            <div className="mt-1.5 line-clamp-2 text-[10px] font-medium leading-snug text-ink">
                              {post.title}
                            </div>
                            <div className="mt-1.5 flex items-center gap-1">
                              <span className={cn("size-1.5 rounded-full", statusDot[post.status])} />
                              <span className="text-[8.5px] text-faint">{statusLabel[post.status]}</span>
                            </div>
                          </button>
                        ))}
                        <button
                          onClick={() => openComposer(day)}
                          className="flex h-7 w-full items-center justify-center gap-1 rounded-lg border border-dashed border-line text-[9px] text-faint transition-colors hover:border-line-strong hover:bg-surface hover:text-muted"
                        >
                          <Plus size={10} /> Add
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line bg-surface-2/40 px-4 py-2.5">
            <div className="flex flex-wrap items-center gap-3">
              {(["published", "scheduled", "review", "draft"] as PostStatus[]).map((status) => (
                <span key={status} className="flex items-center gap-1.5 text-[9.5px] text-faint">
                  <span className={cn("size-1.5 rounded-full", statusDot[status])} />
                  {statusLabel[status]}
                </span>
              ))}
            </div>
            <span className="font-mono text-[9px] text-faint">Demo calendar · no channel is connected</span>
          </div>
        </section>

        <aside className="space-y-4 xl:col-span-3">
          <section className="card p-4">
            <div className="flex items-start justify-between">
              <div>
                <div className="overline">Selected day</div>
                <h2 className="mt-1.5 text-[15px] font-semibold tracking-tight text-ink">
                  {format(selectedDate, "EEE, MMM d")}
                </h2>
                <p className="mt-0.5 text-[10.5px] text-faint">
                  {selectedPosts.length} {selectedPosts.length === 1 ? "post" : "posts"} planned
                </p>
              </div>
              <button
                onClick={() => openComposer(selectedDate)}
                className="grid size-7 place-items-center rounded-lg border border-line text-muted transition-colors hover:border-line-strong hover:text-ink"
                aria-label="Add post on this day"
              >
                <Plus size={13} />
              </button>
            </div>

            <div className="mt-3 space-y-2">
              {selectedPosts.length === 0 && (
                <div className="rounded-xl border border-dashed border-line px-3 py-5 text-center">
                  <CalendarDays size={16} className="mx-auto text-faint" />
                  <p className="mt-1.5 text-[11px] text-muted">Nothing scheduled</p>
                  <button
                    onClick={() => openComposer(selectedDate)}
                    className="mt-1 text-[10.5px] font-medium text-accent-text hover:underline"
                  >
                    Schedule a post
                  </button>
                </div>
              )}
              {selectedPosts.map((post) => (
                <button
                  key={post.id}
                  onClick={() => setSelectedPostId(post.id)}
                  className="flex w-full items-center gap-2.5 rounded-xl border border-line bg-surface-2/50 p-2.5 text-left transition-colors hover:border-line-strong hover:bg-surface-2"
                >
                  <PlatformIcon platform={post.platform} size="md" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[11px] font-medium text-ink">{post.title}</div>
                    <div className="mt-0.5 flex items-center gap-1.5 text-[9.5px] text-faint">
                      <Clock size={9} /> {post.time}
                      <span>·</span>
                      {statusLabel[post.status]}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </section>

          <section className="card p-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-[13px] font-semibold tracking-tight text-ink">Next in queue</h2>
                <p className="mt-0.5 text-[10px] text-faint">Scheduled &amp; ready</p>
              </div>
              <span className="grid h-5 min-w-5 place-items-center rounded-md bg-accent-soft px-1 font-mono text-[9.5px] text-accent-text">
                {upcoming.length}
              </span>
            </div>
            <div className="mt-3 space-y-2.5">
              {upcoming.map((post) => (
                <button
                  key={post.id}
                  onClick={() => setSelectedPostId(post.id)}
                  className="flex w-full items-start gap-2 text-left"
                >
                  <span
                    className="mt-1 size-1.5 shrink-0 rounded-full"
                    style={{ backgroundColor: platformColor(post.platform) }}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[10.5px] font-medium text-ink">{post.title}</span>
                    <span className="mt-0.5 block text-[9.5px] text-faint">
                      {format(parseISO(post.date), "EEE, MMM d")} · {post.time} · {post.platform}
                    </span>
                  </span>
                  <ArrowRight size={11} className="mt-1 shrink-0 text-faint" />
                </button>
              ))}
              {upcoming.length === 0 && <p className="text-[10.5px] text-faint">Queue is clear.</p>}
            </div>
          </section>

          <section className="card p-4">
            <h2 className="text-[13px] font-semibold tracking-tight text-ink">Channel mix</h2>
            <p className="mt-0.5 text-[10px] text-faint">Across all planned content</p>
            <div className="mt-3 space-y-2.5">
              {channelMix.map((entry) => (
                <div key={entry.platform} className="flex items-center gap-2">
                  <PlatformIcon platform={entry.platform} size="sm" />
                  <span className="w-16 text-[10px] text-muted">{entry.platform}</span>
                  <div className="h-1 flex-1 overflow-hidden rounded-full bg-surface-3">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${(entry.count / maxChannel) * 100}%`,
                        backgroundColor: platformColor(entry.platform),
                      }}
                    />
                  </div>
                  <span className="w-3 text-right font-mono text-[9.5px] text-faint">{entry.count}</span>
                </div>
              ))}
              {channelMix.length === 0 && <p className="text-[10.5px] text-faint">No posts yet.</p>}
            </div>
          </section>

          <section className="relative overflow-hidden rounded-2xl border border-line bg-surface p-4">
            <div className="pointer-events-none absolute -right-10 -top-12 size-32 rounded-full bg-accent/10 blur-2xl" />
            <div className="relative flex items-center gap-2">
              <Sparkles size={14} className="text-accent-text" />
              <h2 className="text-[12px] font-semibold text-ink">Agent suggestion</h2>
            </div>
            <p className="relative mt-2 text-[10.5px] leading-relaxed text-muted">
              {nextDraft ? (
                <>
                  Moving the <span className="font-medium text-ink">{nextDraft.title}</span> draft to Thursday morning
                  keeps a day between review and publish. It goes back to review, not straight to the queue.
                </>
              ) : (
                <>No draft is waiting for review right now. New drafts always land in review first — nothing is queued automatically.</>
              )}
            </p>
            <button
              onClick={applySuggestion}
              disabled={suggestionApplied || !nextDraft}
              className={cn(
                "relative mt-2.5 flex w-full items-center justify-center gap-1.5 rounded-lg border px-2 py-1.5 text-[10.5px] font-medium transition-colors",
                suggestionApplied
                  ? "border-success/30 bg-success-soft text-success"
                  : "border-line bg-surface-2 text-ink hover:border-line-strong hover:bg-surface-3",
              )}
            >
              {suggestionApplied ? (
                <>
                  <CheckCircle2 size={12} /> Applied to calendar
                </>
              ) : (
                <>
                  <ArrowRight size={12} /> Apply suggestion
                </>
              )}
            </button>
          </section>
        </aside>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 px-1 text-[10.5px] text-faint">
        <span className="flex items-center gap-1.5">
          <ArrowLeft size={11} /> Tip: click any day to focus it, or any post to review the brief.
        </span>
        <span className="font-mono">{posts.length} posts · {scheduledCount} scheduled</span>
      </div>

      {composerOpen && (
        <ComposerModal
          defaultDate={composerDate}
          onClose={() => setComposerOpen(false)}
          onSubmit={(post) => addPost(post)}
        />
      )}
      {selectedPost && <PostDrawer post={selectedPost} onClose={() => setSelectedPostId(null)} />}
    </div>
  );
}
