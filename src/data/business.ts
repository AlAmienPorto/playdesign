import { dateAt } from "../lib/utils";
import type { WorkspaceId } from "./office";

type Tone = "accent" | "success" | "warning" | "info" | "neutral";

/* ------------------------------------------------------------------ */
/* Clients — MOD-002                                                   */
/* ------------------------------------------------------------------ */

export type ClientStatus = "active" | "onboarding" | "paused" | "past";

export const CLIENT_STATUS_META: Record<ClientStatus, { label: string; tone: Tone }> = {
  active: { label: "Active", tone: "success" },
  onboarding: { label: "Onboarding", tone: "info" },
  paused: { label: "Paused", tone: "warning" },
  past: { label: "Past client", tone: "neutral" },
};

export interface Client {
  id: string;
  workspaceId: WorkspaceId;
  name: string;
  company: string;
  email: string;
  phone: string;
  address: string;
  industry: string;
  status: ClientStatus;
  ownerId: string;
  since: string;
  notes: string;
  portalEnabled: boolean;
  leadId?: string;
}

const client = (
  id: string,
  workspaceId: WorkspaceId,
  name: string,
  company: string,
  email: string,
  phone: string,
  address: string,
  industry: string,
  status: ClientStatus,
  ownerId: string,
  since: string,
  notes: string,
  portalEnabled = true,
  leadId?: string,
): Client => ({
  id,
  workspaceId,
  name,
  company,
  email,
  phone,
  address,
  industry,
  status,
  ownerId,
  since,
  notes,
  portalEnabled,
  leadId,
});

export const CLIENTS: Client[] = [
  client("cl-northwind", "playdesign", "Elif Demir", "Northwind Studio", "elif@northwind.studio", "+46 70 118 2244", "Stockholm, SE", "Architecture", "active", "ja", "2024-03-11", "Long-term rebrand partner. Decision committee is Elif and their COO. Warm palette remains the sensitive area.", true, "l1"),
  client("cl-kraft", "playdesign", "Jonas Weber", "Kraft & Co", "jonas@kraftandco.de", "+49 151 229 8841", "Berlin, DE", "Consumer goods", "active", "ja", "2024-09-02", "12-month design retainer. Prefers weekly written updates and structured approvals.", true, "l3"),
  client("cl-orbit", "playdesign", "Mei Tan", "Orbit Labs", "mei@orbitlabs.io", "+65 8123 4450", "Singapore, SG", "SaaS", "active", "sl", "2025-01-20", "Launch is fixed mid-November. Scope can flex outside launch assets.", true, "l4"),
  client("cl-fieldnote", "playdesign", "Owen Blake", "Fieldnote", "owen@fieldnote.app", "+44 7700 900 221", "London, UK", "Research software", "active", "mc", "2023-11-06", "Design system phase 2 in production. Direct feedback, no polished decks needed.", true, "l5"),
  client("cl-vela", "playdesign", "Tomas Rivera", "Vela Coffee", "tomas@velacoffee.com", "+1 415 902 1180", "Portland, US", "Coffee retail", "onboarding", "dp", "2026-10-04", "Wants to launch before the holiday season. Async-first communication.", false, "l2"),
  client("cl-fjord", "playdesign", "Nils Andersen", "Fjord Supply", "nils@fjordsupply.no", "+47 920 11 830", "Oslo, NO", "Outdoor gear", "active", "sl", "2025-06-18", "Negotiating packaging sample approval. Physical samples required before sign-off.", true, "l7"),
  client("cl-casa", "playdesign", "Ana Sofia", "Casa Lumen", "ana@casalumen.pt", "+351 912 445 770", "Lisbon, PT", "Hospitality", "paused", "ao", "2025-02-14", "Budget freeze announced internally. Campaign toolkit is on hold until Q1.", false, "l8"),
  client("cl-mono", "playdesign", "Hana Ito", "Mono House", "hana@monohouse.jp", "+81 3 5555 0112", "Tokyo, JP", "Hospitality", "past", "ja", "2024-05-09", "Rebrand delivered and archived. Good candidate for a case study refresh.", true),
  client("cl-salt", "playdesign", "Ravi Kapoor", "Salt & Stone", "ravi@saltandstone.co", "+1 646 220 9911", "New York, US", "Wellness", "past", "dp", "2025-03-22", "Landing sprint delivered. No open work in this demo.", true),
  client("cl-hive", "brandal", "Maya Putri", "Hive & Harvest", "maya@hiveharvest.id", "+62 812 3300 1188", "Bandung, ID", "Food & beverage", "active", "ao", "2026-08-12", "Seasonal packaging run before Ramadan. Samples were couriered this week.", true, "bl1"),
  client("cl-gbee", "brandal", "Rangga Saputra", "Gbee Coffee", "rangga@gbeecoffee.id", "+62 811 2044 770", "Yogyakarta, ID", "Coffee retail", "onboarding", "sl", "2026-10-08", "Retail identity includes signage and menu boards. Proposal in review.", false, "bl2"),
  client("cl-sweetbloom", "brandal", "Dewi Larasati", "Sweetbloom", "dewi@sweetbloom.id", "+62 811 908 4420", "Jakarta, ID", "Beauty", "active", "mc", "2026-06-30", "Launch campaign is in negotiation. Needs board sign-off for budget.", true, "bl2"),
  client("cl-beebestie", "brandal", "Ayu Prameswari", "BeeBestie", "ayu@beebestie.id", "+62 812 7788 1010", "Surabaya, ID", "Honey & snacks", "active", "lf", "2026-05-19", "Launch week is fixed. Nutrition claims stay locked until verification lands.", true),
  client("cl-brandal", "brandal", "Bimo Santoso", "Brandal-Gbee", "bimo@brandalghee.id", "+62 813 4455 9090", "Bandung, ID", "Brand house", "active", "ja", "2026-04-01", "Brand house operating the Gbee and BeeBestie portfolio.", true),
];

/* ------------------------------------------------------------------ */
/* Projects — MOD-004                                                  */
/* ------------------------------------------------------------------ */

export type ProjectStatus = "planning" | "active" | "on_hold" | "review" | "completed" | "cancelled";

export const PROJECT_STATUS_META: Record<ProjectStatus, { label: string; tone: Tone }> = {
  planning: { label: "Planning", tone: "neutral" },
  active: { label: "Active", tone: "success" },
  on_hold: { label: "On hold", tone: "warning" },
  review: { label: "In review", tone: "accent" },
  completed: { label: "Completed", tone: "info" },
  cancelled: { label: "Cancelled", tone: "neutral" },
};

export interface Project {
  id: string;
  workspaceId: WorkspaceId;
  name: string;
  clientId: string;
  dealId?: string;
  description: string;
  type: string;
  managerId: string;
  startDate: string;
  deadline: string;
  budget: number;
  status: ProjectStatus;
  teamIds: string[];
  feedback: { id: string; author: string; body: string; time: string; kind: "internal" | "client" }[];
}

const project = (
  id: string,
  workspaceId: WorkspaceId,
  name: string,
  clientId: string,
  description: string,
  type: string,
  managerId: string,
  startDate: string,
  deadline: string,
  budget: number,
  status: ProjectStatus,
  teamIds: string[],
  dealId?: string,
  feedback: Project["feedback"] = [],
): Project => ({
  id,
  workspaceId,
  name,
  clientId,
  dealId,
  description,
  type,
  managerId,
  startDate,
  deadline,
  budget,
  status,
  teamIds,
  feedback,
});

export const PROJECTS: Project[] = [
  project("pr-northwind", "playdesign", "Northwind", "cl-northwind", "Full rebrand from logotype to a lean web build. Two routes explored; warm palette variant is the current decision point.", "Brand + web", "ja", "2026-08-04", dateAt(7), 24000, "active", ["ja", "sl", "mc", "dp"], "d4", [
    { id: "pf-nw-1", author: "Elif Demir", body: "The warmer palette feels much closer to the building itself. Please keep the type scale as is.", time: "2d ago", kind: "client" },
    { id: "pf-nw-2", author: "Marcus Chen", body: "Contrast on secondary buttons still fails AA in the warm variant — fixing before handoff.", time: "1d ago", kind: "internal" },
  ]),
  project("pr-orbit", "playdesign", "Orbit Labs", "cl-orbit", "Product launch system: moodboards, motion references, launch announcement and a dark-surface palette.", "Campaign", "sl", "2026-09-01", dateAt(13), 31200, "active", ["sl", "lf", "ao", "mc"], "d5", [
    { id: "pf-or-1", author: "Mei Tan", body: "Thursday 15:00 works for the review. Launch date is fixed, so motion references matter most.", time: "3h ago", kind: "client" },
  ]),
  project("pr-kraft", "playdesign", "Kraft & Co", "cl-kraft", "Design retainer covering campaign toolkits, packaging refreshes and monthly brand support.", "Retainer", "ja", "2026-01-12", dateAt(30), 42000, "active", ["ja", "lf", "ao"], "d7"),
  project("pr-fieldnote", "playdesign", "Fieldnote", "cl-fieldnote", "Design system phase 2: token naming, dark-mode parity and a component audit.", "Design system", "mc", "2026-07-21", dateAt(18), 27500, "active", ["mc", "dp"], "d8", [
    { id: "pf-fn-1", author: "Owen Blake", body: "Token audit looks right. Please keep the iOS parity check on the list.", time: "5h ago", kind: "client" },
  ]),
  project("pr-vela", "playdesign", "Vela Coffee", "cl-vela", "Ecommerce build and launch assets. Scope is still being validated against the holiday deadline.", "Ecommerce", "dp", "2026-10-04", dateAt(40), 8400, "planning", ["dp", "lf"], "d6"),
  project("pr-fjord", "playdesign", "Fjord Supply", "cl-fjord", "Identity and packaging system for the outdoor range. Physical sample approval is the gate.", "Brand + packaging", "sl", "2026-05-11", dateAt(4), 36800, "review", ["sl", "mc"], "d9", [
    { id: "pf-fj-1", author: "Nils Andersen", body: "The mockups look right. We still want to feel the paper stock before signing off.", time: "1d ago", kind: "client" },
  ]),
  project("pr-casa", "playdesign", "Casa Lumen", "cl-casa", "Campaign toolkit paused while the client's budget freeze is resolved. No external work should ship.", "Campaign", "ao", "2026-02-03", dateAt(20), 15600, "on_hold", ["ao", "lf"], "d10"),
  project("pr-mono", "playdesign", "Mono House", "cl-mono", "Full rebrand delivered and archived. Case study is being prepared from the results.", "Brand", "ja", "2025-10-06", dateAt(-6), 22000, "completed", ["ja", "sl", "lf"], "d11"),
  project("pr-salt", "playdesign", "Salt & Stone", "cl-salt", "Landing page sprint delivered. No open work in this demo.", "Web", "dp", "2026-02-17", dateAt(-9), 11800, "completed", ["dp", "lf"], "d12"),
  project("pr-bee", "brandal", "BeeBestie", "cl-beebestie", "Launch week teaser system: hero frames, caption variants and a story cut.", "Launch campaign", "lf", "2026-09-15", dateAt(5), 18000, "active", ["lf", "mc"], undefined, [
    { id: "pf-bee-1", author: "Ayu Prameswari", body: "Love the direction. Caption B needs a softer health claim.", time: "22m ago", kind: "client" },
  ]),
  project("pr-brandal", "brandal", "Brandal", "cl-brandal", "Brand ops: pricing sheets, packaging copy QC and retail collateral for the portfolio.", "Brand operations", "ao", "2026-04-01", dateAt(12), 26000, "active", ["ao", "mc", "sl"]),
  project("pr-hive", "brandal", "Hive & Harvest", "cl-hive", "Seasonal packaging system. Supplier quotes and physical samples are still open.", "Packaging", "ao", "2026-08-12", dateAt(9), 14800, "planning", ["ao", "mc"], "bd1"),
];

/* ------------------------------------------------------------------ */
/* Finance — MOD-008                                                   */
/* ------------------------------------------------------------------ */

export type TransactionType = "income" | "expense";

export interface Transaction {
  id: string;
  workspaceId: WorkspaceId;
  type: TransactionType;
  category: string;
  description: string;
  amount: number;
  currency: "USD";
  date: string;
  method: "Bank transfer" | "Card" | "Cash" | "PayPal";
  projectId?: string;
  clientId?: string;
  reference: string;
  status: "posted" | "reversed" | "correction";
  createdBy: string;
}

export const OPENING_BALANCE: Record<WorkspaceId, number> = {
  playdesign: 42000,
  brandal: 9800,
};

const tx = (
  id: string,
  workspaceId: WorkspaceId,
  type: TransactionType,
  category: string,
  description: string,
  amount: number,
  daysAgo: number,
  method: Transaction["method"],
  reference: string,
  status: Transaction["status"] = "posted",
  projectId?: string,
  clientId?: string,
): Transaction => ({
  id,
  workspaceId,
  type,
  category,
  description,
  amount,
  currency: "USD",
  date: dateAt(-daysAgo),
  method,
  projectId,
  clientId,
  reference,
  status,
  createdBy: workspaceId === "playdesign" ? "ja" : "ao",
});

export const TRANSACTIONS: Transaction[] = [
  tx("tx-1", "playdesign", "income", "Project fee", "Northwind rebrand — milestone 2", 12000, 12, "Bank transfer", "INV-1042", "posted", "pr-northwind", "cl-northwind"),
  tx("tx-2", "playdesign", "income", "Retainer", "Kraft & Co monthly retainer", 3500, 5, "Bank transfer", "INV-1051", "posted", "pr-kraft", "cl-kraft"),
  tx("tx-3", "playdesign", "income", "Project fee", "Mono House final invoice", 8000, 20, "Bank transfer", "INV-1018", "posted", "pr-mono", "cl-mono"),
  tx("tx-4", "playdesign", "income", "Project fee", "Salt & Stone landing sprint", 5900, 30, "Card", "INV-1004", "posted", "pr-salt", "cl-salt"),
  tx("tx-5", "playdesign", "income", "Project fee", "Orbit Labs launch deposit", 15600, 8, "Bank transfer", "INV-1048", "posted", "pr-orbit", "cl-orbit"),
  tx("tx-6", "playdesign", "expense", "Software", "Figma organization seats", 180, 3, "Card", "EXP-2201", "posted"),
  tx("tx-7", "playdesign", "expense", "Contractor", "Motion contractor — Orbit launch", 3200, 10, "Bank transfer", "EXP-2194", "posted", "pr-orbit", "cl-orbit"),
  tx("tx-8", "playdesign", "expense", "Studio rent", "Studio rent — October", 4500, 15, "Bank transfer", "EXP-2188", "posted"),
  tx("tx-9", "playdesign", "expense", "Marketing", "Portfolio ads — LinkedIn", 1200, 18, "Card", "EXP-2179", "posted"),
  tx("tx-10", "playdesign", "expense", "Software", "Project management tooling", 240, 25, "Card", "EXP-2160", "posted"),
  tx("tx-11", "playdesign", "expense", "Equipment", "Colour calibration hardware", 2100, 40, "Card", "EXP-2103", "posted"),
  tx("tx-12", "playdesign", "expense", "Travel", "Client visit — Oslo", 860, 45, "Card", "EXP-2091", "posted", "pr-fjord", "cl-fjord"),
  tx("tx-13", "playdesign", "expense", "Contractor", "Motion contractor — duplicate entry", 3200, 9, "Bank transfer", "EXP-2194", "reversed", "pr-orbit", "cl-orbit"),
  tx("btx-1", "brandal", "income", "Project fee", "Hive & Harvest seasonal deposit", 7400, 6, "Bank transfer", "INV-3021", "posted", "pr-hive", "cl-hive"),
  tx("btx-2", "brandal", "income", "Project fee", "Gbee Coffee identity deposit", 4800, 14, "Bank transfer", "INV-3014", "posted", "pr-brandal", "cl-gbee"),
  tx("btx-3", "brandal", "expense", "Supplier", "Packaging supplier deposit", 2600, 8, "Bank transfer", "EXP-3210", "posted", "pr-hive", "cl-hive"),
  tx("btx-4", "brandal", "expense", "Marketing", "Launch content boost", 600, 12, "Card", "EXP-3202", "posted", "pr-bee", "cl-beebestie"),
  tx("btx-5", "brandal", "expense", "Software", "Design tooling", 120, 20, "Card", "EXP-3191", "posted"),
];

export const FINANCE_CATEGORIES: Record<WorkspaceId, string[]> = {
  playdesign: ["Project fee", "Retainer", "Royalties", "Software", "Contractor", "Studio rent", "Marketing", "Equipment", "Travel"],
  brandal: ["Project fee", "Retainer", "Supplier", "Software", "Marketing", "Logistics"],
};

export function financeSummary(transactions: Transaction[], workspaceId: WorkspaceId) {
  const valid = transactions.filter((entry) => entry.status === "posted" && entry.workspaceId === workspaceId);
  const income = valid.filter((entry) => entry.type === "income").reduce((sum, entry) => sum + entry.amount, 0);
  const expense = valid.filter((entry) => entry.type === "expense").reduce((sum, entry) => sum + entry.amount, 0);
  const opening = OPENING_BALANCE[workspaceId];
  return { income, expense, net: income - expense, balance: opening + income - expense, opening };
}

/* ------------------------------------------------------------------ */
/* Creative studio — MOD-006                                           */
/* ------------------------------------------------------------------ */

export type AssetStatus =
  | "brief"
  | "production"
  | "internal_review"
  | "client_review"
  | "revision"
  | "approved"
  | "delivered";

export const ASSET_STATUS_META: Record<AssetStatus, { label: string; tone: Tone }> = {
  brief: { label: "Brief", tone: "neutral" },
  production: { label: "In production", tone: "info" },
  internal_review: { label: "Internal review", tone: "warning" },
  client_review: { label: "Client review", tone: "accent" },
  revision: { label: "Revision", tone: "warning" },
  approved: { label: "Approved", tone: "success" },
  delivered: { label: "Delivered", tone: "success" },
};

export interface AssetVersion {
  version: number;
  label: string;
  note: string;
  at: string;
  by: string;
}

export interface AssetFeedback {
  id: string;
  author: string;
  body: string;
  time: string;
  kind: "internal" | "client";
}

export interface CreativeAsset {
  id: string;
  workspaceId: WorkspaceId;
  projectId: string;
  name: string;
  type: "Brand" | "Web" | "Campaign" | "Packaging" | "Social" | "Motion";
  status: AssetStatus;
  currentVersion: number;
  versions: AssetVersion[];
  feedback: AssetFeedback[];
  updatedAt: string;
  fileUrl: string;
}

const asset = (
  id: string,
  workspaceId: WorkspaceId,
  projectId: string,
  name: string,
  type: CreativeAsset["type"],
  status: AssetStatus,
  versions: AssetVersion[],
  feedback: AssetFeedback[],
  updatedAt: string,
  fileUrl: string,
): CreativeAsset => ({
  id,
  workspaceId,
  projectId,
  name,
  type,
  status,
  currentVersion: versions[0]?.version ?? 1,
  versions,
  feedback,
  updatedAt,
  fileUrl,
});

export const ASSETS: CreativeAsset[] = [
  asset("as-nw-guidelines", "playdesign", "pr-northwind", "Northwind brand guidelines", "Brand", "internal_review", [
    { version: 3, label: "v3 · warm palette", note: "Warm palette and type scale applied; AA contrast notes added.", at: "2h ago", by: "mc" },
    { version: 2, label: "v2 · type system", note: "Type scale and logo behaviour documented.", at: "1d ago", by: "mc" },
    { version: 1, label: "v1 · first draft", note: "Initial guideline skeleton.", at: "4d ago", by: "sl" },
  ], [
    { id: "fb-nw-1", author: "Marcus Chen", body: "Secondary button contrast still fails AA — fixing in v4.", time: "1h ago", kind: "internal" },
  ], "2h ago", "External artifact · Figma reference"),
  asset("as-orbit-mood", "playdesign", "pr-orbit", "Orbit launch moodboard", "Campaign", "client_review", [
    { version: 2, label: "v2 · route A/B", note: "Two routes with motion references and dark-surface palette.", at: "58m ago", by: "ao" },
    { version: 1, label: "v1 · route A", note: "First direction shared internally.", at: "2d ago", by: "sl" },
  ], [
    { id: "fb-or-1", author: "Amara Okafor", body: "Waiting for Mei's Thursday review. Font licensing is still unverified.", time: "40m ago", kind: "internal" },
  ], "58m ago", "External artifact · Figma reference"),
  asset("as-kraft-deck", "playdesign", "pr-kraft", "Kraft & Co retainer deck", "Brand", "approved", [
    { version: 2, label: "v2 · Q4 scope", note: "Milestone billing and Q4 kickoff window added.", at: "3d ago", by: "ja" },
    { version: 1, label: "v1 · proposal", note: "Initial retainer proposal.", at: "6d ago", by: "ja" },
  ], [
    { id: "fb-kr-1", author: "Jonas Weber", body: "Approved. Let's schedule the kickoff.", time: "2d ago", kind: "client" },
  ], "3d ago", "External artifact · storage ref"),
  asset("as-fieldnote-tokens", "playdesign", "pr-fieldnote", "Fieldnote token audit", "Web", "production", [
    { version: 1, label: "v1 · audit sheet", note: "Token naming and contrast pass in progress.", at: "1d ago", by: "dp" },
  ], [
    { id: "fb-fn-1", author: "Owen Blake", body: "Keep the iOS parity check on the list.", time: "5h ago", kind: "client" },
  ], "1d ago", "Internal artifact · Notion export"),
  asset("as-vela-wire", "playdesign", "pr-vela", "Vela homepage wireframes", "Web", "revision", [
    { version: 4, label: "v4 · mobile pass", note: "Mobile navigation simplified after feedback.", at: "4h ago", by: "dp" },
    { version: 3, label: "v3 · desktop pass", note: "Hero and product grid revised.", at: "2d ago", by: "dp" },
    { version: 2, label: "v2 · structure", note: "Section order changed.", at: "4d ago", by: "dp" },
  ], [
    { id: "fb-ve-1", author: "Tomas Rivera", body: "Can we make the product grid more editorial? The current one feels like a catalogue.", time: "1d ago", kind: "client" },
  ], "4h ago", "External artifact · Figma reference"),
  asset("as-fjord-pack", "playdesign", "pr-fjord", "Fjord packaging mockups", "Packaging", "client_review", [
    { version: 3, label: "v3 · material notes", note: "Paper stock options and ink weights added.", at: "1d ago", by: "mc" },
    { version: 2, label: "v2 · dielines", note: "Dielines adjusted for the new format.", at: "4d ago", by: "mc" },
  ], [
    { id: "fb-fj-1", author: "Nils Andersen", body: "Looks right. We still want physical samples before signing.", time: "1d ago", kind: "client" },
  ], "1d ago", "External artifact · print ref"),
  asset("as-casa-toolkit", "playdesign", "pr-casa", "Casa Lumen campaign toolkit", "Campaign", "production", [
    { version: 2, label: "v2 · paused", note: "Work paused pending the client's budget confirmation.", at: "5d ago", by: "lf" },
    { version: 1, label: "v1 · concepts", note: "Three campaign routes.", at: "9d ago", by: "lf" },
  ], [], "5d ago", "External artifact · drive ref"),
  asset("as-mono-book", "playdesign", "pr-mono", "Mono House brand book", "Brand", "delivered", [
    { version: 5, label: "v5 · final", note: "Final brand book delivered and archived.", at: "6d ago", by: "ja" },
    { version: 4, label: "v4 · client edits", note: "Final client edits applied.", at: "8d ago", by: "sl" },
  ], [
    { id: "fb-mo-1", author: "Hana Ito", body: "Delivered. Thank you — the team is using it already.", time: "5d ago", kind: "client" },
  ], "6d ago", "External artifact · storage ref"),
  asset("as-bee-teaser", "brandal", "pr-bee", "BeeBestie launch teaser", "Social", "client_review", [
    { version: 2, label: "v2 · softer claims", note: "Caption B claim softened; hero frame unchanged.", at: "22m ago", by: "lf" },
    { version: 1, label: "v1 · launch set", note: "Hero frame and two caption variants.", at: "1d ago", by: "lf" },
  ], [
    { id: "fb-bee-1", author: "Ayu Prameswari", body: "Hero frame is perfect. Please soften caption B.", time: "22m ago", kind: "client" },
  ], "22m ago", "External artifact · drive ref"),
  asset("as-honey-copy", "brandal", "pr-brandal", "Honey packaging copy", "Packaging", "internal_review", [
    { version: 3, label: "v3 · QC notes", note: "Claims checked against the brand guide.", at: "3h ago", by: "mc" },
    { version: 2, label: "v2 · tone pass", note: "Tone aligned with the brand voice.", at: "1d ago", by: "mc" },
  ], [
    { id: "fb-ho-1", author: "Marcus Chen", body: "Regulatory review still pending before client review.", time: "2h ago", kind: "internal" },
  ], "3h ago", "External artifact · print ref"),
  asset("as-gbee-sign", "brandal", "pr-brandal", "Gbee retail signage", "Brand", "brief", [
    { version: 1, label: "v1 · brief", note: "Signage scope captured from the client thread.", at: "2d ago", by: "sl" },
  ], [], "2d ago", "Brief · no file yet"),
];

/* ------------------------------------------------------------------ */
/* Knowledge base — MOD-011                                            */
/* ------------------------------------------------------------------ */

export type DocAccess = "workspace" | "project" | "owner" | "agent";
export const DOC_ACCESS_META: Record<DocAccess, { label: string; tone: Tone }> = {
  workspace: { label: "Workspace", tone: "neutral" },
  project: { label: "Project members", tone: "info" },
  owner: { label: "Owner only", tone: "warning" },
  agent: { label: "Agents allowed", tone: "accent" },
};

export interface KnowledgeDoc {
  id: string;
  workspaceId: WorkspaceId;
  title: string;
  category: string;
  summary: string;
  body: string;
  source: string;
  access: DocAccess;
  status: "active" | "archived";
  projectId?: string;
  agentIds: string[];
  chunks: number;
  updatedAt: string;
}

const doc = (
  id: string,
  workspaceId: WorkspaceId,
  title: string,
  category: string,
  summary: string,
  body: string,
  source: string,
  access: DocAccess,
  projectId: string | undefined,
  agentIds: string[],
  chunks: number,
  updatedAt: string,
  status: KnowledgeDoc["status"] = "active",
): KnowledgeDoc => ({
  id,
  workspaceId,
  title,
  category,
  summary,
  body,
  source,
  access,
  status,
  projectId,
  agentIds,
  chunks,
  updatedAt,
});

export const KNOWLEDGE_DOCS: KnowledgeDoc[] = [
  doc("kd-brand", "playdesign", "Brand guidelines 2026", "Brand", "Logo behaviour, palette, type scale and voice rules for Playdesign's own brand.", "The Playdesign mark uses a single red accent (#BF0B0B) on warm paper. Type is set tight; headlines never exceed three lines. Voice is warm, direct and never over-polished. Never place the accent on a red-adjacent background. This document is the source of truth for studio materials.", "Internal · owner-authored", "agent", undefined, ["nova", "scout", "spv-playdesign"], 128, "2h ago"),
  doc("kd-services", "playdesign", "Services & pricing", "Commercial", "Service lines, minimum engagement sizes and what is explicitly out of scope.", "Brand systems start at $18k with a six-week minimum. Web builds start at $12k. Retainers start at $3.5k per month. Discovery is never free. Prices are indicative and must be confirmed by the owner before they are quoted externally.", "Internal · pricing sheet", "owner", undefined, [], 42, "Yesterday"),
  doc("kd-tone", "playdesign", "Tone of voice", "Brand", "How the studio writes: short sentences, concrete nouns, no hype.", "Write like a person, not a deck. Prefer verbs over adjectives. Never use 'seamless', 'revolutionary' or 'unlock'. Client-facing copy is reviewed by a human before it leaves the studio.", "Internal · notes", "agent", undefined, ["nova", "echo", "spv-playdesign"], 18, "3d ago"),
  doc("kd-northwind", "playdesign", "Northwind brand strategy", "Client", "Positioning, audience and the warm-palette decision record for Northwind Studio.", "Northwind is repositioning from a generalist studio to an architecture-led practice. The warm palette is approved in principle; secondary button contrast must be fixed before handoff. Decision owners: Elif Demir (client), Jawad Al Amien (studio).", "Client brief · approved scope", "project", "pr-northwind", ["nova"], 64, "2d ago"),
  doc("kd-orbit", "playdesign", "Orbit launch brief", "Client", "Launch date, audience and required assets for the Orbit Labs product launch.", "Launch is fixed for mid-November. Required assets: moodboard, motion references, launch announcement and a dark-surface palette. Launch date is client-supplied and has not been independently verified.", "Client email · unverified date", "project", "pr-orbit", ["nova", "scout"], 37, "3h ago"),
  doc("kd-cases", "playdesign", "Case studies", "Marketing", "Approved outcome stories with sources for each claim.", "Mono House: full rebrand delivered in six weeks. Kraft & Co: 14 sub-brands consolidated into one identity system. Metrics must be re-checked before reuse in new content; quotes require client sign-off.", "Internal · case study folder", "workspace", undefined, ["nova", "echo"], 264, "5d ago"),
  doc("kd-finance", "playdesign", "Finance policy", "Operations", "Revenue recognition, correction rules and what counts as cash.", "Deal value is not cash. Income is recognised only when funds are received. Posted transactions are corrected with an opposite entry, never deleted. Opening balance is set when the workspace starts using the system.", "Internal · finance policy", "owner", undefined, [], 22, "1w ago"),
  doc("kd-sop", "playdesign", "Studio delivery SOP", "Operations", "Approval gates, evidence rules and the definition of done.", "Every external output needs an owner-approved version. Evidence is attached before a task is submitted. QC runs before owner review. Nothing is published directly from a draft.", "Internal · SOP", "agent", undefined, ["nova", "scout", "spv-playdesign", "echo", "atlas"], 31, "4d ago"),
  doc("kd-brandal-tone", "brandal", "Brandal tone guide", "Brand", "Warm, playful and never clinical. Claims stay verifiable.", "Brandal speaks like a friend who happens to know their craft. No clinical health claims. Every product claim needs a source before it is published.", "Internal · brand guide", "agent", undefined, ["echo", "atlas", "spv-brandal"], 46, "1d ago"),
  doc("kd-beebestie", "brandal", "BeeBestie product facts", "Client", "Product range, ingredients and claims that are still unverified.", "The nutrition sheet is not final. Any health or nutrition claim must be marked unverified until the sheet lands. Hero frame approvals do not cover copy claims.", "Client brief · unverified claims", "project", "pr-bee", ["echo", "spv-brandal"], 28, "22m ago"),
  doc("kd-suppliers", "brandal", "Supplier list", "Operations", "Packaging suppliers, quotes and lead times.", "Three of five supplier quotes are confirmed. Ayu Lestari's research run failed on 31 Oct; two quotes are missing. Do not publish pricing until finance confirms.", "Internal · partial research", "owner", "pr-hive", [], 19, "1h ago"),
  doc("kd-packaging", "brandal", "Packaging specs", "Packaging", "Paper stock, ink weights and dieline references for the honey line.", "Honey line uses 350gsm uncoated stock with a single spot ink. Dielines are versioned; never print from an unversioned file.", "Internal · production notes", "workspace", "pr-brandal", ["echo"], 33, "3d ago"),
];

/* ------------------------------------------------------------------ */
/* Automation — MOD-014                                                */
/* ------------------------------------------------------------------ */

export type WorkflowStatus = "success" | "failed" | "waiting";

export interface Workflow {
  id: string;
  workspaceId: WorkspaceId;
  code: string;
  name: string;
  description: string;
  trigger: string;
  conditions: string[];
  actions: string[];
  active: boolean;
  runs: number;
  successRate: number;
}

export interface AutomationExecution {
  id: string;
  workspaceId: WorkspaceId;
  workflowId: string;
  status: WorkflowStatus;
  summary: string;
  time: string;
  at: number;
}

const workflow = (
  id: string,
  workspaceId: WorkspaceId,
  code: string,
  name: string,
  description: string,
  trigger: string,
  conditions: string[],
  actions: string[],
  active: boolean,
  runs: number,
  successRate: number,
): Workflow => ({
  id,
  workspaceId,
  code,
  name,
  description,
  trigger,
  conditions,
  actions,
  active,
  runs,
  successRate,
});

export const WORKFLOWS: Workflow[] = [
  workflow("wf-onboarding", "playdesign", "AUTO-001", "New client onboarding", "Creates the onboarding project, checklist and portal access when a client is created.", "Client created", ["Client status is active", "Portal access is enabled"], ["Create onboarding project", "Generate checklist", "Assign project manager", "Notify team", "Create portal access"], true, 24, 100),
  workflow("wf-overdue", "playdesign", "AUTO-002", "Overdue task", "Notifies the assignee and project manager when a task passes its due date.", "Task past due date", ["Task status is not done", "Assignee exists"], ["Notify assignee", "Notify project manager", "Record execution"], true, 86, 97),
  workflow("wf-approval", "playdesign", "AUTO-003", "Client approval", "Creates a client approval request when an asset enters client review.", "Asset moved to client review", ["Asset has a published version", "Project has a portal"], ["Notify client", "Create approval request", "Wait for response", "Update asset status", "Notify creative team"], true, 41, 95),
  workflow("wf-weekly", "playdesign", "AUTO-004", "Weekly business report", "Assembles sales, project, task and finance data into a weekly owner report.", "Scheduled · Monday 08:00", ["Owner is active"], ["Retrieve sales data", "Retrieve project data", "Retrieve task data", "Retrieve finance data", "Generate summary", "Send to management"], true, 12, 100),
  workflow("wf-cashflow", "playdesign", "AUTO-005", "Cashflow monitoring", "Alerts the owner when the cash balance drops below the configured threshold.", "Scheduled · daily 07:00", ["Balance below $15,000"], ["Retrieve transactions", "Calculate cashflow", "Compare threshold", "Generate alert", "Notify owner"], true, 31, 100),
  workflow("wf-brandal-onboarding", "brandal", "AUTO-001", "New client onboarding", "Creates the onboarding checklist and SPV review assignment for new Brandal clients.", "Client created", ["SPV reviewer available"], ["Create onboarding project", "Assign SPV", "Notify team"], true, 9, 100),
  workflow("wf-brandal-overdue", "brandal", "AUTO-002", "Overdue task", "Notifies assignee and SPV when a Brandal task passes its due date.", "Task past due date", ["Task status is not done"], ["Notify assignee", "Notify SPV", "Record execution"], true, 22, 95),
  workflow("wf-brandal-approval", "brandal", "AUTO-003", "Client approval", "Raises a client approval request after SPV review passes.", "Asset passed SPV review", ["SPV review approved"], ["Notify client", "Create approval request", "Update asset status"], true, 14, 93),
];

export const AUTOMATION_EXECUTIONS: AutomationExecution[] = [
  { id: "ax-1", workspaceId: "playdesign", workflowId: "wf-overdue", status: "success", summary: "Notified Jawad about Casa Lumen invoice follow-up (2d overdue).", time: "12m ago", at: Date.now() - 12 * 60_000 },
  { id: "ax-2", workspaceId: "playdesign", workflowId: "wf-approval", status: "waiting", summary: "Awaiting client review for Orbit launch moodboard.", time: "58m ago", at: Date.now() - 58 * 60_000 },
  { id: "ax-3", workspaceId: "playdesign", workflowId: "wf-cashflow", status: "success", summary: "Daily check passed — balance above threshold.", time: "3h ago", at: Date.now() - 3 * 3_600_000 },
  { id: "ax-4", workspaceId: "playdesign", workflowId: "wf-weekly", status: "success", summary: "Weekly report assembled for Jawad (demo data).", time: "2d ago", at: Date.now() - 2 * 86_400_000 },
  { id: "ax-5", workspaceId: "playdesign", workflowId: "wf-overdue", status: "failed", summary: "Could not notify assignee — missing contact for one task.", time: "3d ago", at: Date.now() - 3 * 86_400_000 },
  { id: "ax-6", workspaceId: "brandal", workflowId: "wf-brandal-approval", status: "waiting", summary: "Awaiting client review for BeeBestie teaser v2.", time: "22m ago", at: Date.now() - 22 * 60_000 },
  { id: "ax-7", workspaceId: "brandal", workflowId: "wf-brandal-overdue", status: "success", summary: "Notified Amara about the Brandal pricing sheet.", time: "4h ago", at: Date.now() - 4 * 3_600_000 },
];

/* ------------------------------------------------------------------ */
/* Roles & permissions — MOD-009 / REQ-AUTH-001                        */
/* ------------------------------------------------------------------ */

export type RoleId =
  | "owner"
  | "admin"
  | "management"
  | "sales"
  | "pm"
  | "creative"
  | "finance"
  | "client"
  | "agent";

export interface RoleDef {
  id: RoleId;
  label: string;
  description: string;
}

export const ROLES: RoleDef[] = [
  { id: "owner", label: "Owner", description: "Full access, including finance, permissions and deployments." },
  { id: "admin", label: "Admin", description: "Workspace administration without ownership transfer." },
  { id: "management", label: "Management", description: "Oversight of operations, projects and performance." },
  { id: "sales", label: "Sales", description: "Leads, clients and the sales pipeline." },
  { id: "pm", label: "Project manager", description: "Projects, tasks and delivery boards." },
  { id: "creative", label: "Creative", description: "Production work, assets and task execution." },
  { id: "finance", label: "Finance", description: "Transactions, reports and cashflow." },
  { id: "client", label: "Client", description: "Portal access to their own projects only." },
  { id: "agent", label: "AI agent", description: "Scoped reads and drafts; no permission inheritance." },
];

export const PERMISSION_MODULES = [
  "Overview",
  "CRM & leads",
  "Sales pipeline",
  "Clients",
  "Projects",
  "Tasks",
  "Creative studio",
  "Finance",
  "Communication",
  "Knowledge",
  "Analytics",
  "Automation",
  "Settings",
] as const;

export type PermissionModule = (typeof PERMISSION_MODULES)[number];

const all: PermissionModule[] = [...PERMISSION_MODULES];

export const ROLE_PERMISSIONS: Record<RoleId, PermissionModule[]> = {
  owner: all,
  admin: all.filter((module) => module !== "Finance"),
  management: ["Overview", "CRM & leads", "Sales pipeline", "Clients", "Projects", "Tasks", "Creative studio", "Communication", "Knowledge", "Analytics", "Automation"],
  sales: ["Overview", "CRM & leads", "Sales pipeline", "Clients", "Communication", "Analytics"],
  pm: ["Overview", "Clients", "Projects", "Tasks", "Creative studio", "Communication", "Knowledge", "Analytics"],
  creative: ["Overview", "Projects", "Tasks", "Creative studio", "Communication", "Knowledge"],
  finance: ["Overview", "Clients", "Finance", "Analytics"],
  client: ["Projects"],
  agent: ["Overview", "CRM & leads", "Projects", "Tasks", "Creative studio", "Knowledge"],
};

export const TEAM_ROLES: Record<string, { roleId: RoleId; department: string; active: boolean }> = {
  ja: { roleId: "owner", department: "Leadership", active: true },
  sl: { roleId: "management", department: "Strategy", active: true },
  mc: { roleId: "creative", department: "Design", active: true },
  ao: { roleId: "sales", department: "Accounts", active: true },
  dp: { roleId: "creative", department: "Web", active: true },
  lf: { roleId: "creative", department: "Content", active: true },
  nova: { roleId: "agent", department: "AI operations", active: true },
};

/* Helpers */

export const clientById = (clients: Client[], id: string) => clients.find((entry) => entry.id === id);

export const projectProgress = (
  projectId: string,
  projects: Project[],
  tasks: { project: string; status: string }[],
) => {
  const project = projects.find((entry) => entry.id === projectId);
  if (!project) return 0;
  if (project.status === "completed") return 100;
  const related = tasks.filter((task) => task.project === project.name);
  if (related.length === 0) return 0;
  const done = related.filter((task) => task.status === "done").length;
  return Math.round((done / related.length) * 100);
};

export const clientProjects = (projects: Project[], clientId: string) =>
  projects.filter((project) => project.clientId === clientId);
