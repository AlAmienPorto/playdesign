import {
  DEALS,
  LEADS,
  POSTS,
  TASKS,
  type Conversation,
  type Deal,
  type Lead,
  type Post,
  type Task,
  type TaskStatus,
} from "./mock";
import { dateAt } from "../lib/utils";

/* ------------------------------------------------------------------ */
/* Workspaces                                                          */
/* ------------------------------------------------------------------ */

export type WorkspaceId = "playdesign" | "brandal";

export interface Workspace {
  id: WorkspaceId;
  name: string;
  slug: string;
  meta: string;
  initial: string;
  approvalPolicy: string;
}

export const WORKSPACES: Workspace[] = [
  {
    id: "playdesign",
    name: "Playdesign Studio",
    slug: "playdesign",
    meta: "Agency workspace · Pro",
    initial: "P",
    approvalPolicy: "Owner approval required before publish, send or external side effects.",
  },
  {
    id: "brandal",
    name: "Brandal-Gbee",
    slug: "brandal-gbee",
    meta: "Brand workspace · Studio",
    initial: "B",
    approvalPolicy: "SPV review first, then owner approval for anything public.",
  },
];

export const workspaceById = (id: WorkspaceId) => WORKSPACES.find((item) => item.id === id) ?? WORKSPACES[0];

/* ------------------------------------------------------------------ */
/* Shared vocabulary                                                   */
/* ------------------------------------------------------------------ */

export type ActorType = "owner" | "operator" | "agent" | "system";
export type Tone = "accent" | "success" | "warning" | "info" | "neutral";

export type ApprovalDecision = "approved" | "changes_requested" | "rejected";
export type ApprovalState = "none" | "pending" | ApprovalDecision;

export const APPROVAL_META: Record<ApprovalState, { label: string; tone: Tone }> = {
  none: { label: "Belum diajukan", tone: "neutral" },
  pending: { label: "Menunggu persetujuan", tone: "accent" },
  approved: { label: "Disetujui", tone: "success" },
  changes_requested: { label: "Perlu revisi", tone: "warning" },
  rejected: { label: "Ditolak", tone: "warning" },
};

export type OutputStatus =
  | "draft"
  | "research"
  | "pending_verification"
  | "qc"
  | "owner_review"
  | "approved"
  | "rejected"
  | "failed";

export const OUTPUT_LABEL: Record<OutputStatus, string> = {
  draft: "Draf",
  research: "Riset",
  pending_verification: "Menunggu verifikasi",
  qc: "Dalam QC",
  owner_review: "Tinjauan Pemilik",
  approved: "Disetujui",
  rejected: "Ditolak",
  failed: "Gagal",
};

export interface Evidence {
  id: string;
  title: string;
  source: string;
  kind: "source" | "artifact" | "note";
  confidence: number;
  verified: "verified" | "unverified" | "missing";
}

export interface ApprovalRecord {
  id: string;
  version: number;
  decision: "submitted" | ApprovalDecision;
  actorId: string;
  actorType: ActorType;
  comment?: string;
  at: number;
  time: string;
  idempotencyKey: string;
}

export interface TaskComment {
  id: string;
  authorId: string;
  body: string;
  time: string;
}

/* ------------------------------------------------------------------ */
/* Tasks                                                               */
/* ------------------------------------------------------------------ */

export interface TaskMeta {
  workspaceId: WorkspaceId;
  board: string;
  brief: string;
  acceptance: string[];
  nextAction: string;
  approval: ApprovalState;
  outputVersion: number;
  outputStatus: OutputStatus;
  confidence?: number;
  limitations: string[];
  evidence: Evidence[];
  comments: TaskComment[];
  history: ApprovalRecord[];
  blockedReason?: string;
  assignedAgentId?: string;
}

export type OfficeTask = Task & TaskMeta;

const seedClock = Date.now();
const minutesAgo = (minutes: number) => seedClock - minutes * 60_000;
const agoLabel = (minutes: number) =>
  minutes < 1 ? "just now" : minutes < 60 ? `${Math.round(minutes)}m ago` : `${Math.round(minutes / 60)}h ago`;

const defaultNextAction = (status: TaskStatus) => {
  if (status === "done") return "Approved output archived — keep the audit trail.";
  if (status === "review") return "Owner review and approval decision.";
  if (status === "in_progress") return "Finish the output and attach evidence.";
  return "Confirm the brief and start production.";
};

const playdesignOverrides: Record<string, Partial<TaskMeta>> = {
  t1: {
    brief:
      "Lock the Northwind direction after the warm-palette round: final logo behaviour, type scale and colour tokens. Nothing goes to the client without a versioned approval.",
    acceptance: ["Warm palette variant included", "Tokens documented for the web build", "Owner approval recorded before handoff"],
    nextAction: "Close the type-scale decision and submit v2 for approval.",
    outputVersion: 2,
    confidence: 86,
    limitations: ["Warm-palette contrast still fails AA on secondary buttons."],
    evidence: [
      {
        id: "e-t1-1",
        title: "Northwind direction deck v2",
        source: "External artifact · Figma reference",
        kind: "artifact",
        confidence: 90,
        verified: "unverified",
      },
    ],
    history: [
      {
        id: "ap-t1-1",
        version: 1,
        decision: "approved",
        actorId: "ja",
        actorType: "owner",
        comment: "Direction approved — proceed to production.",
        at: minutesAgo(2880),
        time: "2d ago",
        idempotencyKey: "t1:v1:approved",
      },
    ],
  },
  t2: {
    board: "Sales",
    brief:
      "Send Jonas Weber a retainer proposal that reflects the scope agreed in discovery, with milestone billing and an approval gate before anything leaves the studio.",
    acceptance: ["Scope matches discovery notes", "Pricing approved by owner", "Proposal held for approval before send"],
    nextAction: "Owner review of proposal v2.",
    approval: "pending",
    outputVersion: 2,
    outputStatus: "owner_review",
    confidence: 82,
    limitations: ["Pricing assumes a 12-month term and has not had legal review."],
    evidence: [
      {
        id: "e-t2-1",
        title: "Discovery call notes — Kraft & Co",
        source: "CRM note · 14 Oct",
        kind: "source",
        confidence: 92,
        verified: "verified",
      },
      {
        id: "e-t2-2",
        title: "Retainer proposal v2",
        source: "External artifact · storage ref",
        kind: "artifact",
        confidence: 88,
        verified: "unverified",
      },
    ],
    history: [
      {
        id: "ap-t2-1",
        version: 2,
        decision: "submitted",
        actorId: "ja",
        actorType: "owner",
        at: minutesAgo(90),
        time: "1h ago",
        idempotencyKey: "t2:v2:submitted",
      },
      {
        id: "ap-t2-2",
        version: 1,
        decision: "changes_requested",
        actorId: "ja",
        actorType: "owner",
        comment: "Add milestone billing and the Q4 kickoff window.",
        at: minutesAgo(420),
        time: "7h ago",
        idempotencyKey: "t2:v1:changes_requested",
      },
    ],
  },
  t4: {
    brief:
      "Prepare the Orbit Labs launch moodboard: two routes, motion references and a palette that survives dark surfaces. Client sees only the approved version.",
    acceptance: ["Two distinct routes", "Motion references sourced", "Dark-surface palette tested"],
    nextAction: "Owner approval of moodboard v2.",
    approval: "pending",
    outputVersion: 2,
    outputStatus: "owner_review",
    confidence: 88,
    limitations: ["Font licensing for Orbit Grotesk is still unverified."],
    evidence: [
      {
        id: "e-t4-1",
        title: "Moodboard v2 — route A/B",
        source: "External artifact · Figma reference",
        kind: "artifact",
        confidence: 91,
        verified: "unverified",
      },
      {
        id: "e-t4-2",
        title: "Orbit launch brief",
        source: "Client brief · PDF",
        kind: "source",
        confidence: 95,
        verified: "verified",
      },
    ],
    history: [
      {
        id: "ap-t4-1",
        version: 2,
        decision: "submitted",
        actorId: "ao",
        actorType: "operator",
        at: minutesAgo(58),
        time: "58m ago",
        idempotencyKey: "t4:v2:submitted",
      },
    ],
  },
  t6: {
    brief:
      "Audit the Fieldnote token set against the design system spec: naming, contrast and dark-mode parity. QC sign-off happens before any owner review.",
    acceptance: ["All tokens named per spec", "Contrast checked in light and dark", "QC notes attached"],
    nextAction: "Finish the contrast audit; QC sign-off and then submit.",
    outputStatus: "qc",
    confidence: 74,
    limitations: ["Dark-mode parity not checked on iOS yet."],
    evidence: [
      {
        id: "e-t6-1",
        title: "Token audit sheet",
        source: "Internal artifact · Notion export",
        kind: "note",
        confidence: 78,
        verified: "unverified",
      },
    ],
  },
  t8: {
    brief:
      "Follow up Casa Lumen's overdue invoice with a policy-compliant nudge. Tone escalation requires owner sign-off; no payment link is sent automatically.",
    acceptance: ["Invoice state verified", "Tone approved", "Send action logged with actor"],
    nextAction: "Waiting on finance to confirm the revised amount.",
    blockedReason: "Blocked: finance has not confirmed the revised invoice amount.",
    limitations: ["Payment status comes from the demo ledger — treat as unverified."],
  },
  t9: {
    brief:
      "Write the Mono House case study with real outcomes, client quotes and the approved before/after assets. Claims need sources before publication.",
    acceptance: ["Client quote signed off", "Metrics sourced", "Images cleared for publication"],
    nextAction: "Owner approval of case study v2.",
    approval: "pending",
    outputVersion: 2,
    outputStatus: "owner_review",
    confidence: 76,
    limitations: ["Two client quotes are still pending sign-off."],
    evidence: [
      {
        id: "e-t9-1",
        title: "Mono House rebrand results",
        source: "Internal report · 2026",
        kind: "source",
        confidence: 80,
        verified: "verified",
      },
      {
        id: "e-t9-2",
        title: "Client quote email",
        source: "Inbox thread",
        kind: "note",
        confidence: 65,
        verified: "unverified",
      },
    ],
    history: [
      {
        id: "ap-t9-1",
        version: 2,
        decision: "submitted",
        actorId: "ao",
        actorType: "operator",
        at: minutesAgo(150),
        time: "2h ago",
        idempotencyKey: "t9:v2:submitted",
      },
    ],
  },
  t10: {
    brief:
      "Draft the Orbit Labs launch announcement for studio channels. Launch date comes from the client and must be verified before scheduling.",
    acceptance: ["Launch date verified", "Approved by owner", "Scheduled only after approval"],
    nextAction: "Owner approval of announcement v3.",
    approval: "pending",
    outputVersion: 3,
    outputStatus: "owner_review",
    confidence: 91,
    limitations: ["Launch date supplied by the client — not independently confirmed."],
    evidence: [
      {
        id: "e-t10-1",
        title: "Orbit launch timeline",
        source: "Client email",
        kind: "source",
        confidence: 70,
        verified: "unverified",
      },
      {
        id: "e-t10-2",
        title: "Announcement copy v3",
        source: "External artifact · doc ref",
        kind: "artifact",
        confidence: 93,
        verified: "unverified",
      },
    ],
    history: [
      {
        id: "ap-t10-1",
        version: 3,
        decision: "submitted",
        actorId: "lf",
        actorType: "operator",
        at: minutesAgo(34),
        time: "34m ago",
        idempotencyKey: "t10:v3:submitted",
      },
      {
        id: "ap-t10-2",
        version: 2,
        decision: "changes_requested",
        actorId: "ja",
        actorType: "owner",
        comment: "Tighten the opening and confirm the launch date.",
        at: minutesAgo(200),
        time: "3h ago",
        idempotencyKey: "t10:v2:changes_requested",
      },
    ],
  },
  t12: {
    brief: "Export final Northwind brand assets for handoff with checksums and a manifest.",
    acceptance: ["Manifest attached", "Checksums recorded", "Owner approval on release"],
    nextAction: "Approved output archived.",
    approval: "approved",
    outputVersion: 1,
    outputStatus: "approved",
    confidence: 96,
    evidence: [
      {
        id: "e-t12-1",
        title: "Northwind asset manifest",
        source: "External artifact · storage ref",
        kind: "artifact",
        confidence: 96,
        verified: "verified",
      },
    ],
    history: [
      {
        id: "ap-t12-1",
        version: 1,
        decision: "approved",
        actorId: "ja",
        actorType: "owner",
        comment: "Looks complete — release for handoff.",
        at: minutesAgo(1440),
        time: "1d ago",
        idempotencyKey: "t12:v1:approved",
      },
    ],
  },
  t13: {
    brief:
      "Prepare Fernbank onboarding: agenda, discovery questions and a shared folder. Client-facing pack stays in draft until the owner approves it.",
    acceptance: ["Agenda shared with client owner", "Discovery questions attached", "Pack approved before send"],
    nextAction: "Confirm the call slot and prepare the onboarding pack.",
  },
};

const brandalTasks: OfficeTask[] = [
  {
    id: "b1",
    title: "BeeBestie launch teaser",
    project: "BeeBestie",
    priority: "high",
    status: "review",
    due: dateAt(1),
    ownerId: "lf",
    tags: ["Launch", "Social"],
    subtasksDone: 4,
    subtasksTotal: 4,
    workspaceId: "brandal",
    board: "Brand launch",
    brief:
      "Produce the BeeBestie teaser set for the launch week: one hero frame, two caption variants and a story cut. Copy follows the brand tone guide and never publishes itself.",
    acceptance: ["Tone checked against brand guide", "Caption variants approved", "Publish scheduled only after approval"],
    nextAction: "Owner approval of teaser v2.",
    approval: "pending",
    outputVersion: 2,
    outputStatus: "owner_review",
    confidence: 91,
    limitations: ["Product claims are unverified until the nutrition sheet lands."],
    evidence: [
      {
        id: "e-b1-1",
        title: "BeeBestie teaser frames",
        source: "External artifact · drive ref",
        kind: "artifact",
        confidence: 89,
        verified: "unverified",
      },
      {
        id: "e-b1-2",
        title: "Brandal tone guide",
        source: "Knowledge base · Brand guidelines",
        kind: "source",
        confidence: 94,
        verified: "verified",
      },
    ],
    comments: [
      {
        id: "cm-b1-1",
        authorId: "lf",
        body: "Hero frame is ready; caption B needs a softer claim.",
        time: "26m ago",
      },
    ],
    history: [
      {
        id: "ap-b1-1",
        version: 2,
        decision: "submitted",
        actorId: "lf",
        actorType: "operator",
        at: minutesAgo(22),
        time: "22m ago",
        idempotencyKey: "b1:v2:submitted",
      },
    ],
    assignedAgentId: "echo",
  },
  {
    id: "b2",
    title: "Brandal-Gbee pricing sheet",
    project: "Brandal",
    priority: "high",
    status: "backlog",
    due: dateAt(2),
    ownerId: "ao",
    tags: ["Ops", "Pricing"],
    subtasksDone: 1,
    subtasksTotal: 4,
    workspaceId: "brandal",
    board: "Brand ops",
    brief:
      "Rebuild the wholesale pricing sheet with supplier quotes and margin bands. Numbers cannot be published until finance confirms the latest quotes.",
    acceptance: ["Every price traces to a supplier quote", "Margin bands reviewed", "Owner approval before sharing"],
    nextAction: "Waiting on supplier quotes from Ayu Lestari.",
    approval: "none",
    outputVersion: 1,
    outputStatus: "research",
    limitations: ["Two supplier quotes are missing."],
    evidence: [
      {
        id: "e-b2-1",
        title: "Supplier quote pack (partial)",
        source: "Ayu Lestari research · 3 of 5 suppliers",
        kind: "source",
        confidence: 58,
        verified: "missing",
      },
    ],
    comments: [],
    history: [],
    blockedReason: "Blocked: Ayu Lestari is unavailable, two supplier quotes are missing.",
    assignedAgentId: "atlas",
  },
  {
    id: "b3",
    title: "QC honey packaging copy",
    project: "Brandal",
    priority: "medium",
    status: "in_progress",
    due: dateAt(3),
    ownerId: "mc",
    tags: ["Packaging", "QC"],
    subtasksDone: 3,
    subtasksTotal: 5,
    workspaceId: "brandal",
    board: "Brand production",
    brief:
      "QC the honey line packaging copy for regulatory clarity, tone and claims. Findings go into QC notes; fixes require a new version.",
    acceptance: ["Claims checked", "Tone matches guide", "QC notes attached"],
    nextAction: "Finish QC notes and submit for SPV review.",
    approval: "none",
    outputVersion: 1,
    outputStatus: "qc",
    confidence: 72,
    limitations: ["Regulatory review not yet done."],
    evidence: [
      {
        id: "e-b3-1",
        title: "Packaging copy v1",
        source: "External artifact · print ref",
        kind: "artifact",
        confidence: 80,
        verified: "unverified",
      },
    ],
    comments: [],
    history: [],
    assignedAgentId: "echo",
  },
  {
    id: "b4",
    title: "Instagram bios refresh",
    project: "BeeBestie",
    priority: "low",
    status: "done",
    due: dateAt(-2),
    ownerId: "lf",
    tags: ["Social"],
    subtasksDone: 2,
    subtasksTotal: 2,
    workspaceId: "brandal",
    board: "Brand ops",
    brief: "Refresh the main and secondary Instagram bios with the new positioning.",
    acceptance: ["Approved by owner", "Updated on both accounts"],
    nextAction: "Approved output archived.",
    approval: "approved",
    outputVersion: 1,
    outputStatus: "approved",
    confidence: 93,
    limitations: [],
    evidence: [
      {
        id: "e-b4-1",
        title: "Bio copy v1",
        source: "External artifact · doc ref",
        kind: "artifact",
        confidence: 93,
        verified: "verified",
      },
    ],
    comments: [],
    history: [
      {
        id: "ap-b4-1",
        version: 1,
        decision: "approved",
        actorId: "ja",
        actorType: "owner",
        comment: "Approved — update both profiles.",
        at: minutesAgo(1600),
        time: "1d ago",
        idempotencyKey: "b4:v1:approved",
      },
    ],
  },
  {
    id: "b5",
    title: "Research Gen-Z snack competitors",
    project: "Brandal",
    priority: "medium",
    status: "backlog",
    due: dateAt(5),
    ownerId: "sl",
    tags: ["Research", "AI"],
    subtasksDone: 0,
    subtasksTotal: 3,
    workspaceId: "brandal",
    board: "Brand research",
    brief:
      "Scan five Gen-Z snack challengers for positioning, price bands and content angles. Findings are research, not verified facts, until sources are checked.",
    acceptance: ["Five competitors covered", "Sources attached per claim", "Confidence labelled"],
    nextAction: "Queue research once Ayu Lestari is available.",
    approval: "none",
    outputVersion: 0,
    outputStatus: "research",
    limitations: ["Agent Ayu Lestari is unavailable — research has not started."],
    evidence: [],
    comments: [],
    history: [],
    assignedAgentId: "atlas",
  },
];

export function buildTasks(): OfficeTask[] {
  const playdesign = TASKS.map((task) => {
    const override = playdesignOverrides[task.id];
    const isReview = task.status === "review";
    const isDone = task.status === "done";
    return {
      ...task,
      workspaceId: "playdesign" as WorkspaceId,
      board: "Studio delivery",
      brief: `Deliver "${task.title}" for ${task.project} to studio standard. External sends, posts and publishes stay locked until the owner approves a specific version.`,
      acceptance: [
        `Brief and scope for ${task.project} confirmed`,
        "Output backed by sources or internal evidence",
        "No external publish or send before owner approval",
      ],
      nextAction: defaultNextAction(task.status),
      approval: (isDone ? "approved" : isReview ? "pending" : "none") as ApprovalState,
      outputVersion: isReview || isDone ? 1 : 0,
      outputStatus: (isDone ? "approved" : isReview ? "owner_review" : "draft") as OutputStatus,
      limitations: [],
      evidence: [],
      comments: [],
      history: isDone
        ? [
            {
              id: `ap-${task.id}-seed`,
              version: 1,
              decision: "approved" as const,
              actorId: "ja",
              actorType: "owner" as ActorType,
              comment: "Approved and filed.",
              at: minutesAgo(1440),
              time: "1d ago",
              idempotencyKey: `${task.id}:v1:approved`,
            },
          ]
        : isReview
          ? [
              {
                id: `ap-${task.id}-submitted`,
                version: 1,
                decision: "submitted" as const,
                actorId: task.ownerId,
                actorType: "operator" as ActorType,
                at: minutesAgo(120),
                time: "2h ago",
                idempotencyKey: `${task.id}:v1:submitted`,
              },
            ]
          : [],
      assignedAgentId: isReview ? "nova" : undefined,
      ...override,
    } satisfies OfficeTask;
  });

  return [...playdesign, ...brandalTasks];
}

export const OFFICE_TASKS = buildTasks();

/* ------------------------------------------------------------------ */
/* Deals                                                               */
/* ------------------------------------------------------------------ */

export type OfficeDeal = Deal & { workspaceId: WorkspaceId };

const brandalDeals: OfficeDeal[] = [
  {
    id: "bd1",
    company: "Hive & Harvest",
    title: "Seasonal packaging",
    value: 14800,
    stage: "qualified",
    contact: "Maya Putri",
    ownerId: "ao",
    score: 83,
    due: dateAt(4),
    tags: ["Packaging"],
    source: "Instagram",
    workspaceId: "brandal",
  },
  {
    id: "bd2",
    company: "Gbee Coffee",
    title: "Retail identity",
    value: 9600,
    stage: "proposal",
    contact: "Rangga Saputra",
    ownerId: "sl",
    score: 76,
    due: dateAt(8),
    tags: ["Branding"],
    source: "Referral",
    workspaceId: "brandal",
  },
  {
    id: "bd3",
    company: "Sweetbloom",
    title: "Launch campaign",
    value: 21400,
    stage: "negotiation",
    contact: "Dewi Larasati",
    ownerId: "mc",
    score: 88,
    due: dateAt(2),
    tags: ["Campaign"],
    source: "LinkedIn",
    workspaceId: "brandal",
  },
];

export const OFFICE_DEALS: OfficeDeal[] = [
  ...DEALS.map((deal) => ({ ...deal, workspaceId: "playdesign" as WorkspaceId })),
  ...brandalDeals,
];

/* ------------------------------------------------------------------ */
/* Posts                                                               */
/* ------------------------------------------------------------------ */

export type OfficePost = Post & { workspaceId: WorkspaceId };

const brandalPosts: OfficePost[] = [
  {
    id: "bp1",
    title: "BeeBestie launch countdown",
    caption:
      "Three days. One jar. A whole lot of honey. The BeeBestie teaser goes live Thursday — watch this space.",
    platform: "Instagram",
    date: dateAt(2),
    time: "10:00",
    status: "review",
    format: "Reel",
    ownerId: "lf",
    workspaceId: "brandal",
  },
  {
    id: "bp2",
    title: "Brandal-Gbee packaging story",
    caption: "How the honey line got its stripes — a short behind-the-scenes thread.",
    platform: "LinkedIn",
    date: dateAt(4),
    time: "09:00",
    status: "scheduled",
    format: "Thread",
    ownerId: "sl",
    workspaceId: "brandal",
  },
  {
    id: "bp3",
    title: "Wholesale partner spotlight",
    caption: "Meet the shops carrying the first Brandal-Gbee run.",
    platform: "Instagram",
    date: dateAt(6),
    time: "13:00",
    status: "draft",
    format: "Carousel",
    ownerId: "ao",
    workspaceId: "brandal",
  },
];

export const OFFICE_POSTS: OfficePost[] = [
  ...POSTS.map((post) => ({ ...post, workspaceId: "playdesign" as WorkspaceId })),
  ...brandalPosts,
];

/* ------------------------------------------------------------------ */
/* Leads                                                               */
/* ------------------------------------------------------------------ */

export type OfficeLead = Lead & { workspaceId: WorkspaceId };

const brandalLeads: OfficeLead[] = [
  {
    id: "bl1",
    name: "Maya Putri",
    company: "Hive & Harvest",
    role: "Founder",
    email: "maya@hiveharvest.id",
    phone: "+62 812 3300 1188",
    location: "Bandung, ID",
    status: "qualified",
    source: "Instagram",
    score: 83,
    value: 14800,
    ownerId: "ao",
    lastActivity: "Requested seasonal packaging samples",
    tags: ["Packaging", "Priority"],
    nextStep: "Send sample kit and wholesale price band",
    notes: "Wants a seasonal run before Ramadan. Decision maker is Maya; co-founder handles production.",
    workspaceId: "brandal",
  },
  {
    id: "bl2",
    name: "Dewi Larasati",
    company: "Sweetbloom",
    role: "Brand Manager",
    email: "dewi@sweetbloom.id",
    phone: "+62 811 908 4420",
    location: "Jakarta, ID",
    status: "nurturing",
    source: "LinkedIn",
    score: 88,
    value: 21400,
    ownerId: "mc",
    lastActivity: "Opened launch deck twice",
    tags: ["Campaign"],
    nextStep: "Share BeeBestie teaser as a reference",
    notes: "Needs board sign-off for budget. Responds well to visual references.",
    workspaceId: "brandal",
  },
];

export const OFFICE_LEADS: OfficeLead[] = [
  ...LEADS.map((lead) => ({ ...lead, workspaceId: "playdesign" as WorkspaceId })),
  ...brandalLeads,
];

/* ------------------------------------------------------------------ */
/* Inbox                                                               */
/* ------------------------------------------------------------------ */

export type OfficeConversation = Conversation & { workspaceId: WorkspaceId };

/* const brandalConversations: OfficeConversation[] = [
  {
    id: "bc1",
    name: "Maya Putri",
    company: "Hive & Harvest",
    role: "Founder",
    channel: "Instagram",
    preview: "Can we see the seasonal packaging samples before Friday?",
    lastTime: "6m",
    unread: 2,
    handler: "ai",
    sentiment: "positive",
    intent: "Sample request",
    confidence: 90,
    value: 14800,
    email: "maya@hiveharvest.id",
    location: "Bandung, ID",
    aiSuggestion:
      "Hi Maya — yes. We can send a sample kit with both paper stocks and let you feel the finish before Friday. I'll confirm courier details today and hold the wholesale price band until you've reviewed it.",
    messages: [
      { id: "bm1", from: "them", text: "Hi! The seasonal concept looks lovely.", time: "09:18" },
      { id: "bm2", from: "them", text: "Can we see the seasonal packaging samples before Friday?", time: "09:19" },
      { id: "bm3", from: "me", text: "Absolutely — I'll check what we can courier today and come back with options.", time: "09:24" },
    ],
    workspaceId: "brandal",
  },
  {
    id: "bc2",
    name: "Rangga Saputra",
    company: "Gbee Coffee",
    role: "Co-founder",
    channel: "Email",
    preview: "Does the retail identity include signage?",
    lastTime: "2h",
    unread: 0,
    handler: "human",
    sentiment: "neutral",
    intent: "Scope question",
    confidence: 85,
    value: 9600,
    email: "rangga@gbeecoffee.id",
    location: "Yogyakarta, ID",
    aiSuggestion:
      "Yes — the retail identity includes primary signage, menu boards and window graphics. I'll send the scope sheet with the proposal so everything is in one place.",
    messages: [
      { id: "bm1", from: "them", text: "Does the retail identity include signage?", time: "07:40" },
      { id: "bm2", from: "me", text: "Yes — signage, menu boards and window graphics are included. Scope sheet coming with the proposal.", time: "08:05" },
    ],
    workspaceId: "brandal",
  },
]; */

export const CONVERSATIONS_BY_WORKSPACE: Record<WorkspaceId, OfficeConversation[]> = {
  playdesign: [],
  brandal: [],
};

/* ------------------------------------------------------------------ */
/* Agent fleet                                                         */
/* ------------------------------------------------------------------ */

export type AgentAvailability = "online" | "idle" | "unavailable";
export type AgentRole = "Specialist Agent" | "SPV/QC Agent";

export const AVAILABILITY_META: Record<AgentAvailability, { label: string; tone: Tone }> = {
  online: { label: "Aktif", tone: "success" },
  idle: { label: "Siaga", tone: "neutral" },
  unavailable: { label: "Tidak aktif", tone: "warning" },
};

export interface OfficeAgent {
  id: string;
  workspaceId: WorkspaceId;
  name: string;
  role: AgentRole;
  jobdesk: string;
  availability: AgentAvailability;
  capabilities: string[];
  skills: string[];
  provider: string;
  model: string;
  lastSeen: string;
  note?: string;
}

export const AGENTS: OfficeAgent[] = [
  {
    id: "nova",
    workspaceId: "playdesign",
    name: "Raka Pratama",
    role: "Specialist Agent",
    jobdesk: "Revenue operations: inbox triage, follow-ups and CRM hygiene",
    availability: "online",
    capabilities: ["Inbox triage", "Follow-up drafts", "Scheduling", "CRM hygiene"],
    skills: ["email-inbox-triage", "playdesign-coordinator-workflow"],
    provider: "Ruang gateway",
    model: "Je.el Agent",
    lastSeen: "Active now",
  },
  {
    id: "scout",
    workspaceId: "playdesign",
    name: "Salsabila Rahma",
    role: "Specialist Agent",
    jobdesk: "Research and evidence: web research, source checks, competitor scans",
    availability: "idle",
    capabilities: ["Web research", "Source checks", "Competitor scans"],
    skills: ["social-media-competitor-research", "grounded-citations", "competitor-news-monitor"],
    provider: "Ruang gateway",
    model: "Je.el Agent",
    lastSeen: "38m ago",
  },
  {
    id: "spv-playdesign",
    workspaceId: "playdesign",
    name: "Arif Nugroho",
    role: "SPV/QC Agent",
    jobdesk: "QC gate: verifies evidence, tone and completeness before owner review",
    availability: "online",
    capabilities: ["QC checklist", "Evidence verification", "Approval routing"],
    skills: ["playdesign-spv-qc", "grounded-citations"],
    provider: "Ruang gateway",
    model: "Je.el Agent QC",
    lastSeen: "Active now",
  },
  {
    id: "echo",
    workspaceId: "brandal",
    name: "Dimas Anggara",
    role: "Specialist Agent",
    jobdesk: "Content production: caption drafts, brand voice and content calendar",
    availability: "online",
    capabilities: ["Caption drafts", "Brand voice QC", "Content calendar"],
    skills: ["playdesign-content-style", "playdesign-social-style", "humanizer"],
    provider: "Ruang gateway",
    model: "Je.el Agent",
    lastSeen: "Active now",
  },
  {
    id: "atlas",
    workspaceId: "brandal",
    name: "Ayu Lestari",
    role: "Specialist Agent",
    jobdesk: "Market research: pricing scans, competitor scans, source verification",
    availability: "unavailable",
    capabilities: ["Market research", "Pricing scans", "Source verification"],
    skills: ["product-price-monitor", "social-media-competitor-research"],
    provider: "Ruang gateway",
    model: "Je.el Agent",
    lastSeen: "1h ago",
    note: "provider outage since 08:12",
  },
  {
    id: "spv-brandal",
    workspaceId: "brandal",
    name: "Nadia Kusuma",
    role: "SPV/QC Agent",
    jobdesk: "QC gate: brand voice and claims check before owner review",
    availability: "idle",
    capabilities: ["QC checklist", "Claims check", "Approval routing"],
    skills: ["playdesign-spv-qc", "playdesign-creative-style"],
    provider: "Ruang gateway",
    model: "Je.el Agent QC",
    lastSeen: "12m ago",
  },
];

/* ------------------------------------------------------------------ */
/* Runs                                                                */
/* ------------------------------------------------------------------ */

export type RunState =
  | "queued"
  | "running"
  | "received"
  | "qc"
  | "owner_review"
  | "approved"
  | "changes_requested"
  | "rejected"
  | "failed"
  | "unavailable"
  | "cancelled";

export const RUN_STATE_META: Record<RunState, { label: string; tone: Tone }> = {
  queued: { label: "Antrean", tone: "neutral" },
  running: { label: "Berjalan", tone: "info" },
  received: { label: "Diterima", tone: "info" },
  qc: { label: "Dalam QC", tone: "warning" },
  owner_review: { label: "Tinjauan Pemilik", tone: "accent" },
  approved: { label: "Disetujui", tone: "success" },
  changes_requested: { label: "Revisi", tone: "warning" },
  rejected: { label: "Ditolak", tone: "warning" },
  failed: { label: "Gagal", tone: "warning" },
  unavailable: { label: "Tidak aktif", tone: "warning" },
  cancelled: { label: "Dibatalkan", tone: "neutral" },
};

export const TERMINAL_RUN_STATES: RunState[] = [
  "approved",
  "changes_requested",
  "rejected",
  "failed",
  "unavailable",
  "cancelled",
];

export const ACTIVE_RUN_STATES: RunState[] = ["queued", "running", "received", "qc"];

export interface RunEvent {
  state: RunState;
  at: number;
  time: string;
  note?: string;
}

export interface OfficeRun {
  id: string;
  workspaceId: WorkspaceId;
  agentId: string;
  action: string;
  subject: string;
  state: RunState;
  startedAt: number;
  time: string;
  duration?: string;
  taskId?: string;
  approvalRequired: boolean;
  outputVersion: number;
  evidence: Evidence[];
  limitations: string[];
  failureReason?: string;
  decisionComment?: string;
  timeline: RunEvent[];
}

const run = (
  id: string,
  workspaceId: WorkspaceId,
  agentId: string,
  action: string,
  subject: string,
  state: RunState,
  minutes: number,
  duration: string,
  extra: Partial<OfficeRun> = {},
): OfficeRun => ({
  id,
  workspaceId,
  agentId,
  action,
  subject,
  state,
  startedAt: minutesAgo(minutes),
  time: agoLabel(minutes),
  duration,
  approvalRequired: true,
  outputVersion: 1,
  evidence: [],
  limitations: [],
  timeline: [
    { state: "queued", at: minutesAgo(minutes + 1), time: agoLabel(minutes + 1) },
    { state: "running", at: minutesAgo(minutes), time: agoLabel(minutes) },
    { state, at: minutesAgo(Math.max(minutes - 1, 0)), time: agoLabel(Math.max(minutes - 1, 0)) },
  ],
  ...extra,
});

export const OFFICE_RUNS: OfficeRun[] = [
  run("r1", "playdesign", "nova", "Qualified lead", "Tomas Rivera · Vela Coffee", "approved", 2, "12s", {
    approvalRequired: false,
    evidence: [
      {
        id: "e-r1",
        title: "Inbound form + web chat",
        source: "CRM activity",
        kind: "source",
        confidence: 87,
        verified: "verified",
      },
    ],
    limitations: ["Budget signal comes from chat only."],
    decisionComment: "Score looks fair — route to Daniel.",
  }),
  run("r2", "playdesign", "nova", "Drafted follow-up", "Elif Demir · Northwind Studio", "owner_review", 18, "8s", {
    limitations: ["Warm-palette variant is still with design."],
    evidence: [
      {
        id: "e-r2",
        title: "Last 12 replies with Northwind",
        source: "Inbox history",
        kind: "source",
        confidence: 94,
        verified: "verified",
      },
    ],
  }),
  run("r3", "playdesign", "nova", "Rescheduled review", "Mei Tan · Orbit Labs", "approved", 120, "6s", {
    approvalRequired: false,
    timeline: [
      { state: "queued", at: minutesAgo(122), time: "2h ago" },
      { state: "running", at: minutesAgo(121), time: "2h ago" },
      { state: "approved", at: minutesAgo(120), time: "2h ago", note: "Calendar invite confirmed by owner" },
    ],
  }),
  run("r4", "playdesign", "nova", "Billing question", "Ana Sofia · Casa Lumen", "owner_review", 300, "22s", {
    limitations: ["Billing policy changes need owner sign-off.", "Invoice state is from the demo ledger."],
    evidence: [
      {
        id: "e-r4",
        title: "Casa Lumen invoice thread",
        source: "Inbox thread",
        kind: "source",
        confidence: 72,
        verified: "unverified",
      },
    ],
  }),
  run("r5", "playdesign", "nova", "Enriched contact", "Clara Moreau · Atelier Nord", "failed", 420, "22s", {
    approvalRequired: false,
    failureReason: "Provider timed out after 22s — only partial public data was persisted. Retry is safe.",
    timeline: [
      { state: "queued", at: minutesAgo(421), time: "7h ago" },
      { state: "running", at: minutesAgo(420), time: "7h ago" },
      { state: "failed", at: minutesAgo(420), time: "7h ago", note: "Provider timeout" },
    ],
  }),
  run("r6", "playdesign", "scout", "Batch re-tag contacts", "Marketing list · 128 records", "cancelled", 540, "41s", {
    approvalRequired: false,
    failureReason: "Stopped by Jawad before completion. No records were hidden.",
    timeline: [
      { state: "queued", at: minutesAgo(542), time: "9h ago" },
      { state: "running", at: minutesAgo(541), time: "9h ago" },
      { state: "cancelled", at: minutesAgo(540), time: "9h ago", note: "Stopped by owner" },
    ],
  }),
  run("br1", "brandal", "echo", "Drafted launch caption", "BeeBestie teaser · Instagram", "owner_review", 12, "9s", {
    limitations: ["Nutrition claims need verification before publish."],
    evidence: [
      {
        id: "e-br1",
        title: "BeeBestie tone guide",
        source: "Knowledge base",
        kind: "source",
        confidence: 92,
        verified: "verified",
      },
    ],
  }),
  run("br2", "brandal", "atlas", "Competitor pricing scan", "Gen-Z snack market", "unavailable", 60, "—", {
    failureReason:
      "Agent unavailable — Ayu Lestari is offline (provider outage since 08:12). Nothing was researched.",
    approvalRequired: false,
    timeline: [
      { state: "queued", at: minutesAgo(61), time: "1h ago" },
      { state: "unavailable", at: minutesAgo(60), time: "1h ago", note: "Dispatch rejected" },
    ],
  }),
  run("br3", "brandal", "echo", "Scheduled packaging story", "Brandal-Gbee · LinkedIn", "approved", 180, "11s", {
    approvalRequired: false,
  }),
  run("br4", "brandal", "echo", "QC brand voice pass", "Honey packaging copy", "qc", 6, "—", {
    limitations: ["Regulatory check pending."],
  }),
];

/* ------------------------------------------------------------------ */
/* Audit trail                                                         */
/* ------------------------------------------------------------------ */

export interface AuditEvent {
  id: string;
  workspaceId: WorkspaceId;
  entityType:
    | "task"
    | "approval"
    | "run"
    | "post"
    | "deal"
    | "lead"
    | "agent"
    | "copilot"
    | "inbox"
    | "brief"
    | "delivery"
    | "client"
    | "project"
    | "finance"
    | "asset"
    | "knowledge"
    | "automation"
    | "report";
  entityId: string;
  taskId?: string;
  actorType: ActorType;
  actorId: string;
  action: string;
  result: "ok" | "failed" | "pending" | "denied";
  meta?: string;
  at: number;
  time: string;
}

const event = (
  id: string,
  workspaceId: WorkspaceId,
  entityType: AuditEvent["entityType"],
  entityId: string,
  actorType: ActorType,
  actorId: string,
  action: string,
  minutes: number,
  meta: string,
  result: AuditEvent["result"] = "ok",
  taskId?: string,
): AuditEvent => ({
  id,
  workspaceId,
  entityType,
  entityId,
  taskId,
  actorType,
  actorId,
  action,
  result,
  meta,
  at: minutesAgo(minutes),
  time: agoLabel(minutes),
});

export const SEED_AUDIT: AuditEvent[] = [
  event("ev-1", "playdesign", "run", "r1", "agent", "nova", "Qualified lead", 2, "Tomas Rivera · Vela Coffee · score 87"),
  event("ev-2", "playdesign", "run", "r2", "agent", "nova", "Draft follow-up held for approval", 18, "Elif Demir · Northwind Studio", "pending"),
  event("ev-3", "playdesign", "deal", "d4", "agent", "nova", "Moved deal to Qualified", 24, "Northwind Studio · score 92"),
  event("ev-4", "playdesign", "approval", "t4", "operator", "ao", "Submitted moodboard v2 for owner review", 58, "Orbit Labs", "pending", "t4"),
  event("ev-5", "playdesign", "post", "p10", "owner", "ja", "Approved post for scheduling", 95, "Work that speaks · Instagram"),
  event("ev-6", "playdesign", "run", "r5", "agent", "nova", "Run failed — provider timeout", 420, "Clara Moreau · enrichment partial", "failed"),
  event("ev-7", "brandal", "approval", "b1", "operator", "lf", "Submitted teaser v2 for owner review", 22, "BeeBestie launch", "pending", "b1"),
  event("ev-8", "brandal", "agent", "atlas", "system", "system", "Agent marked unavailable", 60, "Ayu Lestari · provider outage since 08:12", "failed"),
  event("ev-9", "brandal", "post", "bp2", "owner", "ja", "Approved post for scheduling", 150, "Packaging story · LinkedIn"),
  event("ev-10", "brandal", "task", "b2", "agent", "atlas", "Task blocked — missing supplier quotes", 240, "Brandal pricing sheet", "failed", "b2"),
  event("ev-11", "playdesign", "task", "t8", "owner", "ja", "Task blocked — finance confirmation missing", 260, "Casa Lumen invoice", "failed", "t8"),
  event("ev-12", "playdesign", "inbox", "c4", "owner", "ja", "Reply sent to Mei Tan", 120, "Orbit Labs · after manual approval"),
];

/* ------------------------------------------------------------------ */
/* Notifications                                                       */
/* ------------------------------------------------------------------ */

export interface AppNotification {
  id: string;
  workspaceId: WorkspaceId;
  title: string;
  description: string;
  time: string;
  unread: boolean;
  kind: "ai" | "deal" | "post" | "task" | "approval";
  href: string;
}

export const SEED_NOTIFICATIONS: AppNotification[] = [
  {
    id: "n1",
    workspaceId: "playdesign",
    title: "Approval needed — Orbit moodboard",
    description: "Moodboard v2 is waiting for your decision.",
    time: "58m",
    unread: true,
    kind: "approval",
    href: "/tasks?task=t4",
  },
  {
    id: "n2",
    workspaceId: "playdesign",
    title: "Northwind moved to Qualified",
    description: "Lead score jumped to 92 after Raka's pricing reply.",
    time: "24m",
    unread: true,
    kind: "deal",
    href: "/kanban",
  },
  {
    id: "n3",
    workspaceId: "playdesign",
    title: "Carousel scheduled for 11:30",
    description: "“Work that speaks” was approved and queued for Instagram.",
    time: "1h",
    unread: true,
    kind: "post",
    href: "/schedule",
  },
  {
    id: "n4",
    workspaceId: "playdesign",
    title: "Invoice follow-up is blocked",
    description: "Casa Lumen's invoice needs finance confirmation before any nudge.",
    time: "4h",
    unread: false,
    kind: "task",
    href: "/tasks?task=t8",
  },
  {
    id: "bn1",
    workspaceId: "brandal",
    title: "Approval needed — BeeBestie teaser",
    description: "Dimas's teaser v2 is ready. Publishing stays locked until approved.",
    time: "22m",
    unread: true,
    kind: "approval",
    href: "/tasks?task=b1",
  },
  {
    id: "bn2",
    workspaceId: "brandal",
    title: "Ayu Lestari is unavailable",
    description: "Competitor pricing scan did not run. Research tasks are blocked.",
    time: "1h",
    unread: true,
    kind: "ai",
    href: "/agent?run=br2",
  },
];
