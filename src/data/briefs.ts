import type { WorkspaceId } from "./office";

export type BriefSource = "email" | "form";
export type BriefField = "deliverables" | "deadline" | "budget";

export interface BriefDeliverable {
  id: string;
  title: string;
}

export interface BriefQuestion {
  id: string;
  field: BriefField;
  question: string;
  hint: string;
}

export interface Brief {
  id: string;
  workspaceId: WorkspaceId;
  source: BriefSource;
  client: string;
  project: string;
  contact?: string;
  raw: string;
  deliverables: BriefDeliverable[];
  deadline?: string;
  budget?: number;
  questions: BriefQuestion[];
  confidence: number;
  limitations: string[];
  agentId: string;
  createdAt: string;
  approvedAt?: string;
  taskIds: string[];
}

export type BriefStatus = "needs_info" | "ready" | "approved";

export const BRIEF_STATUS_META: Record<BriefStatus, { label: string; tone: "warning" | "accent" | "success" }> = {
  needs_info: { label: "Needs information", tone: "warning" },
  ready: { label: "Ready for scope", tone: "accent" },
  approved: { label: "Scope approved", tone: "success" },
};

export const briefStatus = (brief: Brief): BriefStatus =>
  brief.approvedAt ? "approved" : brief.questions.length > 0 ? "needs_info" : "ready";

const MONTHS: Record<string, number> = {
  jan: 1,
  january: 1,
  feb: 2,
  february: 2,
  mar: 3,
  march: 3,
  apr: 4,
  april: 4,
  may: 5,
  jun: 6,
  june: 6,
  jul: 7,
  july: 7,
  aug: 8,
  august: 8,
  sep: 9,
  sept: 9,
  september: 9,
  oct: 10,
  october: 10,
  nov: 11,
  november: 11,
  dec: 12,
  december: 12,
};

const isoDate = (year: number, month: number, day: number) =>
  `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

const parseDeadline = (raw: string): string | undefined => {
  const iso = raw.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/);
  if (iso) {
    const month = Number(iso[2]);
    const day = Number(iso[3]);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) return isoDate(Number(iso[1]), month, day);
  }

  const long = raw.match(
    /\b(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sept|sep|oct|nov|dec)\.?\s+(\d{1,2})(?:,?\s+(20\d{2}))?\b/i,
  );
  if (long) {
    const month = MONTHS[long[1].toLowerCase()];
    const day = Number(long[2]);
    if (month && day >= 1 && day <= 31) {
      const year = long[3] ? Number(long[3]) : new Date().getFullYear();
      return isoDate(year, month, day);
    }
  }

  const dayFirst = raw.match(
    /\b(\d{1,2})\s+(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sept|sep|oct|nov|dec)\.?(?:,?\s+(20\d{2}))?\b/i,
  );
  if (dayFirst) {
    const day = Number(dayFirst[1]);
    const month = MONTHS[dayFirst[2].toLowerCase()];
    if (month && day >= 1 && day <= 31) {
      const year = dayFirst[3] ? Number(dayFirst[3]) : new Date().getFullYear();
      return isoDate(year, month, day);
    }
  }

  return undefined;
};

const parseBudget = (raw: string): number | undefined => {
  const match = raw.match(/(?:usd\s*)?\$\s*([\d][\d,.]*)\s*(k|m|thousand|million)?/i);
  if (!match) return undefined;
  const base = Number(match[1].replace(/,/g, ""));
  if (!Number.isFinite(base) || base <= 0) return undefined;
  const unit = match[2]?.toLowerCase();
  if (unit === "k" || unit === "thousand") return Math.round(base * 1_000);
  if (unit === "m" || unit === "million") return Math.round(base * 1_000_000);
  return Math.round(base);
};

const DELIVERABLE_MATCHERS: { pattern: RegExp; title: string }[] = [
  { pattern: /\bcampaign\s+key\s+visual\b|\bkey\s+visual\b/i, title: "Campaign key visual" },
  { pattern: /\blogo(?:\s+refresh|\s+redesign)?\b/i, title: "Logo refresh" },
  { pattern: /\bbrand\s+guidelines?\b|\bbrand\s+book\b/i, title: "Brand guidelines" },
  { pattern: /\bbrand\s+identity\b|\bvisual\s+identity\b/i, title: "Brand identity" },
  { pattern: /\bdesign\s+system\b/i, title: "Design system" },
  { pattern: /\blanding\s+page\b/i, title: "Landing page" },
  { pattern: /\bwebsite\b|\bweb\s+(?:design|build|refresh)\b/i, title: "Website" },
  { pattern: /\bpackaging(?:\s+system)?\b/i, title: "Packaging system" },
  { pattern: /\blabel\s+design\b|\bproduct\s+labels?\b/i, title: "Label design" },
  { pattern: /\bsocial\s+(?:posts?|assets?|graphics?|content)\b/i, title: "Social assets" },
  { pattern: /\bcontent\s+strategy\b|\bcontent\s+calendar\b/i, title: "Content strategy" },
  { pattern: /\bmotion\s+(?:assets?|design)\b|\banimation\b/i, title: "Motion assets" },
  { pattern: /\bcase\s+study\b/i, title: "Case study" },
  { pattern: /\bpitch\s+deck\b/i, title: "Pitch deck" },
  { pattern: /\bpresentation\s+deck\b/i, title: "Presentation deck" },
  { pattern: /\bui\/ux\b|\bapp\s+design\b/i, title: "UI/UX design" },
  { pattern: /\billustration(?:s)?\b/i, title: "Illustrations" },
  { pattern: /\badvertising\s+campaign\b|\bcampaign\b/i, title: "Campaign" },
];

const parseDeliverables = (raw: string): string[] => {
  const found = DELIVERABLE_MATCHERS.filter((matcher) => matcher.pattern.test(raw)).map((matcher) => matcher.title);
  return [...new Set(found)];
};

const questionsFor = (deliverables: string[], deadline?: string, budget?: number): BriefQuestion[] => {
  const questions: BriefQuestion[] = [];
  if (deliverables.length === 0) {
    questions.push({
      id: "q-deliverables",
      field: "deliverables",
      question: "What exactly should we deliver?",
      hint: "List the outputs, separated by commas.",
    });
  }
  if (!deadline) {
    questions.push({
      id: "q-deadline",
      field: "deadline",
      question: "When does this need to be live?",
      hint: "A confirmed date is required before scope approval.",
    });
  }
  if (budget === undefined) {
    questions.push({
      id: "q-budget",
      field: "budget",
      question: "What budget range has been approved?",
      hint: "Used to shape the scope and production plan.",
    });
  }
  return questions;
};

export interface BriefExtraction {
  deliverables: string[];
  deadline?: string;
  budget?: number;
  questions: BriefQuestion[];
  confidence: number;
  limitations: string[];
}

export function extractBriefScope(raw: string): BriefExtraction {
  const deliverables = parseDeliverables(raw);
  const deadline = parseDeadline(raw);
  const budget = parseBudget(raw);
  const questions = questionsFor(deliverables, deadline, budget);

  const confidence = Math.min(
    95,
    55 + (deliverables.length > 0 ? 15 : 0) + (deadline ? 15 : 0) + (budget !== undefined ? 15 : 0),
  );

  const limitations = [
    "Extraction is a local demo heuristic — confirm the scope with the client before production.",
  ];
  if (budget !== undefined) limitations.push("Budget was inferred from the message; verify the approved amount.");
  if (deadline) limitations.push("Deadline was inferred from the message; verify it against the delivery calendar.");
  if (deliverables.length === 0) limitations.push("No deliverable could be identified with confidence.");

  return { deliverables, deadline, budget, questions, confidence, limitations };
}

const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();

const seedBrief = (
  id: string,
  workspaceId: WorkspaceId,
  source: BriefSource,
  client: string,
  project: string,
  contact: string,
  raw: string,
  minutes: number,
  extra: { approvedAt?: string; taskIds?: string[] } = {},
): Brief => {
  const extracted = extractBriefScope(raw);
  return {
    id,
    workspaceId,
    source,
    client,
    project,
    contact,
    raw,
    deliverables: extracted.deliverables.map((title, index) => ({ id: `${id}-d${index + 1}`, title })),
    deadline: extracted.deadline,
    budget: extracted.budget,
    questions: extracted.questions,
    confidence: extracted.confidence,
    limitations: extracted.limitations,
    agentId: workspaceId === "playdesign" ? "nova" : "echo",
    createdAt: minutesAgo(minutes),
    approvedAt: extra.approvedAt,
    taskIds: extra.taskIds ?? [],
  };
};

export const BRIEFS: Brief[] = [
  seedBrief(
    "b1",
    "playdesign",
    "email",
    "Northwind Studio",
    "Northwind rebrand",
    "elif@northwind.studio",
    "Hi Playdesign — we need to refresh the Northwind identity: logo refresh, brand guidelines and a landing page. Launch is on 2026-11-20. Budget around $18,000. Can you send a scope and proposal?",
    44,
  ),
  seedBrief(
    "b2",
    "playdesign",
    "form",
    "Kraft & Co",
    "Q1 retainer",
    "jonas@kraft.co",
    "We would like ongoing design support for Q1, mostly packaging and social assets. We do not have a firm budget yet and the start date is still being discussed.",
    190,
  ),
  seedBrief(
    "b3",
    "playdesign",
    "email",
    "Fieldnote",
    "Fieldnote packaging",
    "hello@fieldnote.co",
    "Please prepare the packaging system and label design for the new Fieldnote range. Timeline is 2026-11-10 and the approved budget is $9,200. This is ready to schedule once you approve the scope.",
    1440,
    { approvedAt: minutesAgo(1320) },
  ),
  seedBrief(
    "b4",
    "brandal",
    "email",
    "Gbee",
    "Ramadan campaign",
    "brand@gbee.id",
    "Need a campaign key visual and social assets for the Ramadan launch. Go live by 2026-11-08 with a budget of $2,400.",
    75,
  ),
];
