import { dateAt } from "../lib/utils";

export interface TeamMember {
  id: string;
  name: string;
  role: string;
  tone: number;
  isAgent?: boolean;
}

export const TEAM: TeamMember[] = [
  { id: "ja", name: "Jawad Al Amien", role: "Founder & Creative Director", tone: 6 },
  { id: "sl", name: "Sofia Lindqvist", role: "Brand Strategist", tone: 2 },
  { id: "mc", name: "Marcus Chen", role: "Design Lead", tone: 4 },
  { id: "ao", name: "Amara Okafor", role: "Account Manager", tone: 3 },
  { id: "dp", name: "Daniel Park", role: "Web Designer", tone: 5 },
  { id: "lf", name: "Lena Fischer", role: "Content Strategist", tone: 1 },
  { id: "nova", name: "Raka Pratama", role: "Specialist Agent", tone: 0, isAgent: true },
];

export const teamById = (id: string) => TEAM.find((member) => member.id === id) ?? TEAM[0];

/* ------------------------------------------------------------------ */
/* Tasks                                                               */
/* ------------------------------------------------------------------ */

export type Priority = "high" | "medium" | "low";
export type TaskStatus = "backlog" | "in_progress" | "review" | "done";

export interface Task {
  id: string;
  title: string;
  project: string;
  priority: Priority;
  status: TaskStatus;
  due: string;
  ownerId: string;
  tags: string[];
  subtasksDone: number;
  subtasksTotal: number;
}

export const TASKS: Task[] = [
  {
    id: "t1",
    title: "Finalize Northwind brand direction",
    project: "Northwind",
    priority: "high",
    status: "in_progress",
    due: dateAt(0),
    ownerId: "ja",
    tags: ["Branding"],
    subtasksDone: 3,
    subtasksTotal: 5,
  },
  {
    id: "t2",
    title: "Send Kraft & Co retainer proposal",
    project: "Kraft & Co",
    priority: "high",
    status: "backlog",
    due: dateAt(0),
    ownerId: "ja",
    tags: ["Sales"],
    subtasksDone: 1,
    subtasksTotal: 2,
  },
  {
    id: "t3",
    title: "Review Vela homepage wireframes",
    project: "Vela Coffee",
    priority: "medium",
    status: "backlog",
    due: dateAt(1),
    ownerId: "sl",
    tags: ["Web"],
    subtasksDone: 0,
    subtasksTotal: 3,
  },
  {
    id: "t4",
    title: "Prepare Orbit launch moodboard",
    project: "Orbit Labs",
    priority: "medium",
    status: "review",
    due: dateAt(3),
    ownerId: "ao",
    tags: ["Branding"],
    subtasksDone: 4,
    subtasksTotal: 4,
  },
  {
    id: "t5",
    title: "Client check-in: Fjord Supply",
    project: "Fjord Supply",
    priority: "medium",
    status: "in_progress",
    due: dateAt(0),
    ownerId: "sl",
    tags: ["Account"],
    subtasksDone: 1,
    subtasksTotal: 2,
  },
  {
    id: "t6",
    title: "QA Fieldnote design tokens",
    project: "Fieldnote",
    priority: "low",
    status: "in_progress",
    due: dateAt(4),
    ownerId: "mc",
    tags: ["Design system"],
    subtasksDone: 2,
    subtasksTotal: 6,
  },
  {
    id: "t7",
    title: "Schedule November content calendar",
    project: "Marketing",
    priority: "medium",
    status: "backlog",
    due: dateAt(2),
    ownerId: "lf",
    tags: ["Social"],
    subtasksDone: 0,
    subtasksTotal: 4,
  },
  {
    id: "t8",
    title: "Invoice follow-up: Casa Lumen",
    project: "Finance",
    priority: "high",
    status: "backlog",
    due: dateAt(-2),
    ownerId: "ja",
    tags: ["Finance"],
    subtasksDone: 0,
    subtasksTotal: 1,
  },
  {
    id: "t9",
    title: "Case study: Mono House rebrand",
    project: "Marketing",
    priority: "low",
    status: "review",
    due: dateAt(5),
    ownerId: "ao",
    tags: ["Content"],
    subtasksDone: 3,
    subtasksTotal: 4,
  },
  {
    id: "t10",
    title: "Write launch announcement",
    project: "Orbit Labs",
    priority: "high",
    status: "review",
    due: dateAt(3),
    ownerId: "lf",
    tags: ["Content", "Social"],
    subtasksDone: 2,
    subtasksTotal: 3,
  },
  {
    id: "t11",
    title: "Update lead scoring rubric",
    project: "Ops",
    priority: "medium",
    status: "done",
    due: dateAt(-1),
    ownerId: "mc",
    tags: ["Ops"],
    subtasksDone: 3,
    subtasksTotal: 3,
  },
  {
    id: "t12",
    title: "Export brand assets for handoff",
    project: "Northwind",
    priority: "low",
    status: "done",
    due: dateAt(-1),
    ownerId: "dp",
    tags: ["Branding"],
    subtasksDone: 7,
    subtasksTotal: 7,
  },
  {
    id: "t13",
    title: "Onboarding call: Fernbank",
    project: "Fernbank",
    priority: "medium",
    status: "backlog",
    due: dateAt(3),
    ownerId: "ja",
    tags: ["Account"],
    subtasksDone: 0,
    subtasksTotal: 2,
  },
  {
    id: "t14",
    title: "Explore AI voice agent for inbound calls",
    project: "Ops",
    priority: "low",
    status: "backlog",
    due: dateAt(7),
    ownerId: "mc",
    tags: ["AI"],
    subtasksDone: 0,
    subtasksTotal: 3,
  },
  {
    id: "t15",
    title: "Refresh pricing page copy",
    project: "Website",
    priority: "medium",
    status: "backlog",
    due: dateAt(8),
    ownerId: "lf",
    tags: ["Web", "Content"],
    subtasksDone: 1,
    subtasksTotal: 4,
  },
  {
    id: "t16",
    title: "Audit Q4 ad spend",
    project: "Marketing",
    priority: "low",
    status: "backlog",
    due: dateAt(6),
    ownerId: "ja",
    tags: ["Finance"],
    subtasksDone: 0,
    subtasksTotal: 2,
  },
];

export const TASK_COLUMNS: { id: TaskStatus; label: string; hint: string }[] = [
  { id: "backlog", label: "Backlog", hint: "Ideas & next up" },
  { id: "in_progress", label: "In progress", hint: "Being worked on" },
  { id: "review", label: "In review", hint: "Awaiting feedback" },
  { id: "done", label: "Done", hint: "Shipped this week" },
];

/* ------------------------------------------------------------------ */
/* Deals                                                               */
/* ------------------------------------------------------------------ */

export type DealStage = "new" | "qualified" | "proposal" | "negotiation" | "won";

export interface Deal {
  id: string;
  company: string;
  title: string;
  value: number;
  stage: DealStage;
  contact: string;
  ownerId: string;
  score: number;
  due: string;
  tags: string[];
  source: string;
}

export const DEALS: Deal[] = [
  {
    id: "d1",
    company: "Harbor & Co",
    title: "Brand refresh",
    value: 18400,
    stage: "new",
    contact: "Tomas Rivera",
    ownerId: "ao",
    score: 74,
    due: dateAt(5),
    tags: ["Branding"],
    source: "Instagram",
  },
  {
    id: "d2",
    company: "Lumen Studio",
    title: "Website redesign",
    value: 12600,
    stage: "new",
    contact: "Ana Sofia",
    ownerId: "dp",
    score: 68,
    due: dateAt(7),
    tags: ["Web"],
    source: "Website",
  },
  {
    id: "d3",
    company: "Fernbank",
    title: "Packaging system",
    value: 9200,
    stage: "new",
    contact: "Jonas Weber",
    ownerId: "ja",
    score: 61,
    due: dateAt(11),
    tags: ["Packaging"],
    source: "Referral",
  },
  {
    id: "d4",
    company: "Northwind Studio",
    title: "Rebrand + website",
    value: 24000,
    stage: "qualified",
    contact: "Elif Demir",
    ownerId: "ja",
    score: 92,
    due: dateAt(3),
    tags: ["Branding", "Web"],
    source: "Instagram",
  },
  {
    id: "d5",
    company: "Orbit Labs",
    title: "Product launch",
    value: 31200,
    stage: "qualified",
    contact: "Mei Tan",
    ownerId: "sl",
    score: 81,
    due: dateAt(13),
    tags: ["Campaign"],
    source: "LinkedIn",
  },
  {
    id: "d6",
    company: "Vela Coffee",
    title: "Ecommerce build",
    value: 8400,
    stage: "qualified",
    contact: "Tomas Rivera",
    ownerId: "dp",
    score: 87,
    due: dateAt(1),
    tags: ["Web"],
    source: "Web chat",
  },
  {
    id: "d7",
    company: "Kraft & Co",
    title: "Design retainer",
    value: 42000,
    stage: "proposal",
    contact: "Jonas Weber",
    ownerId: "ja",
    score: 88,
    due: dateAt(6),
    tags: ["Retainer"],
    source: "Referral",
  },
  {
    id: "d8",
    company: "Fieldnote",
    title: "App design system",
    value: 27500,
    stage: "proposal",
    contact: "Owen Blake",
    ownerId: "mc",
    score: 79,
    due: dateAt(9),
    tags: ["Design system"],
    source: "LinkedIn",
  },
  {
    id: "d9",
    company: "Fjord Supply",
    title: "Identity + packaging",
    value: 36800,
    stage: "negotiation",
    contact: "Nils Andersen",
    ownerId: "sl",
    score: 84,
    due: dateAt(4),
    tags: ["Branding", "Packaging"],
    source: "LinkedIn",
  },
  {
    id: "d10",
    company: "Casa Lumen",
    title: "Campaign toolkit",
    value: 15600,
    stage: "negotiation",
    contact: "Ana Sofia",
    ownerId: "ao",
    score: 57,
    due: dateAt(15),
    tags: ["Campaign"],
    source: "Email",
  },
  {
    id: "d11",
    company: "Mono House",
    title: "Full rebrand",
    value: 22000,
    stage: "won",
    contact: "Hana Ito",
    ownerId: "ja",
    score: 96,
    due: dateAt(-6),
    tags: ["Branding"],
    source: "Referral",
  },
  {
    id: "d12",
    company: "Salt & Stone",
    title: "Landing page sprint",
    value: 11800,
    stage: "won",
    contact: "Ravi Kapoor",
    ownerId: "dp",
    score: 90,
    due: dateAt(-9),
    tags: ["Web"],
    source: "Website",
  },
];

export const DEAL_COLUMNS: { id: DealStage; label: string }[] = [
  { id: "new", label: "New" },
  { id: "qualified", label: "Qualified" },
  { id: "proposal", label: "Proposal" },
  { id: "negotiation", label: "Negotiation" },
  { id: "won", label: "Won" },
];

/* ------------------------------------------------------------------ */
/* Content schedule                                                    */
/* ------------------------------------------------------------------ */

export type Platform = "Instagram" | "LinkedIn" | "X" | "TikTok" | "YouTube" | "Email" | "Web chat";
export type PostStatus = "published" | "scheduled" | "review" | "draft";
export type PostFormat = "Carousel" | "Single" | "Reel" | "Thread" | "Story";

export interface Post {
  id: string;
  title: string;
  caption: string;
  platform: Platform;
  date: string;
  time: string;
  status: PostStatus;
  format: PostFormat;
  ownerId: string;
  reach?: number;
  engagement?: number;
}

export const POSTS: Post[] = [
  {
    id: "p1",
    title: "Behind the Northwind rebrand",
    caption:
      "Six weeks, four workshops and one very stubborn lowercase. Here's how we rebuilt Northwind Studio from the logotype up. Swipe for the before → after.",
    platform: "Instagram",
    date: dateAt(-28),
    time: "09:00",
    status: "published",
    format: "Carousel",
    ownerId: "ja",
    reach: 48200,
    engagement: 4.2,
  },
  {
    id: "p2",
    title: "5 signs your brand needs a refresh",
    caption:
      "Your brand isn't broken — it's outgrown. Five quiet signals it might be time for a refresh (number 3 is the one most teams miss).",
    platform: "LinkedIn",
    date: dateAt(-24),
    time: "08:30",
    status: "published",
    format: "Single",
    ownerId: "sl",
    reach: 21400,
    engagement: 2.8,
  },
  {
    id: "p3",
    title: "Studio tour: where ideas get loud",
    caption: "A 40-second walk through the studio at 4pm on a Thursday. Sound on.",
    platform: "Instagram",
    date: dateAt(-22),
    time: "18:00",
    status: "published",
    format: "Reel",
    ownerId: "lf",
    reach: 91600,
    engagement: 6.1,
  },
  {
    id: "p4",
    title: "Meet the team: Sofia",
    caption: "Strategy lead, playlist curator, and the person who asks 'but why?' four times in a row.",
    platform: "Instagram",
    date: dateAt(-17),
    time: "12:00",
    status: "published",
    format: "Story",
    ownerId: "lf",
    reach: 12300,
    engagement: 3.4,
  },
  {
    id: "p5",
    title: "Kraft & Co case study",
    caption:
      "From 14 disconnected sub-brands to one flexible identity system. The full Kraft & Co story is live — link in comments.",
    platform: "LinkedIn",
    date: dateAt(-15),
    time: "10:00",
    status: "published",
    format: "Carousel",
    ownerId: "ja",
    reach: 33800,
    engagement: 5.2,
  },
  {
    id: "p6",
    title: "Design is a team sport",
    caption:
      "Unpopular opinion: the best design decisions happen in rooms where the designer is not the loudest voice. A thread on collaboration.",
    platform: "X",
    date: dateAt(-10),
    time: "15:30",
    status: "published",
    format: "Thread",
    ownerId: "mc",
    reach: 8900,
    engagement: 1.9,
  },
  {
    id: "p7",
    title: "Mono House: before / after",
    caption: "Same building, entirely different feeling. The Mono House rebrand, in 15 seconds.",
    platform: "TikTok",
    date: dateAt(-8),
    time: "19:00",
    status: "published",
    format: "Reel",
    ownerId: "lf",
    reach: 142000,
    engagement: 7.8,
  },
  {
    id: "p8",
    title: "Orbit Labs teaser",
    caption: "Something new is orbiting. Launch day is close.",
    platform: "Instagram",
    date: dateAt(-3),
    time: "11:00",
    status: "published",
    format: "Single",
    ownerId: "ao",
    reach: 27600,
    engagement: 4.9,
  },
  {
    id: "p9",
    title: "Why we killed our own brand",
    caption:
      "We redesigned Playdesign twice in one year — and threw both versions away. What we learned about designing for yourself.",
    platform: "LinkedIn",
    date: dateAt(-1),
    time: "09:30",
    status: "published",
    format: "Carousel",
    ownerId: "ja",
    reach: 40200,
    engagement: 6.4,
  },
  {
    id: "p10",
    title: "Work that speaks — studio principles",
    caption:
      "Seven principles we repeat in every kickoff. Save this for your next brand workshop. Which one do you break most often?",
    platform: "Instagram",
    date: dateAt(0),
    time: "11:30",
    status: "scheduled",
    format: "Carousel",
    ownerId: "lf",
  },
  {
    id: "p11",
    title: "The 3 questions we ask every client",
    caption: "Every project starts the same way: with three uncomfortable questions. Here they are.",
    platform: "X",
    date: dateAt(0),
    time: "16:00",
    status: "scheduled",
    format: "Thread",
    ownerId: "ja",
  },
  {
    id: "p12",
    title: "October recap: 4 launches, 1 new team",
    caption:
      "Four launches, two rebrands and a new face in the studio. A short recap of a very loud month.",
    platform: "LinkedIn",
    date: dateAt(1),
    time: "10:00",
    status: "scheduled",
    format: "Single",
    ownerId: "sl",
  },
  {
    id: "p13",
    title: "Fernbank packaging reveal",
    caption:
      "Paper stock, ink weight and one very satisfying unboxing. Revealing the new Fernbank packaging system.",
    platform: "Instagram",
    date: dateAt(3),
    time: "09:00",
    status: "draft",
    format: "Carousel",
    ownerId: "lf",
  },
  {
    id: "p14",
    title: "Inside our AI-assisted workflow",
    caption:
      "Raka drafts, we decide. A transparent look at how an AI agent fits into a design studio without flattening the craft.",
    platform: "LinkedIn",
    date: dateAt(4),
    time: "08:30",
    status: "scheduled",
    format: "Single",
    ownerId: "ja",
  },
  {
    id: "p15",
    title: "Holiday campaign concepts",
    caption: "Three routes for the holiday season. Which one feels most like you?",
    platform: "Instagram",
    date: dateAt(5),
    time: "13:00",
    status: "review",
    format: "Carousel",
    ownerId: "lf",
  },
  {
    id: "p16",
    title: "Client spotlight: Fieldnote",
    caption: "How Fieldnote turned a research tool into a brand people actually enjoy looking at.",
    platform: "LinkedIn",
    date: dateAt(6),
    time: "09:00",
    status: "scheduled",
    format: "Single",
    ownerId: "sl",
  },
  {
    id: "p17",
    title: "Raka's content playbook",
    caption: "The prompts, guardrails and review loops behind our AI content engine.",
    platform: "X",
    date: dateAt(7),
    time: "17:00",
    status: "draft",
    format: "Thread",
    ownerId: "ja",
  },
];

/* ------------------------------------------------------------------ */
/* Leads                                                               */
/* ------------------------------------------------------------------ */

export type LeadStatus = "new" | "qualified" | "nurturing" | "customer" | "cold";

export interface Lead {
  id: string;
  name: string;
  company: string;
  role: string;
  email: string;
  phone: string;
  location: string;
  status: LeadStatus;
  source: string;
  score: number;
  value: number;
  ownerId: string;
  lastActivity: string;
  tags: string[];
  nextStep: string;
  notes: string;
  category?: string;
  fullAddress?: string;
  rating?: number;
  whatsappVerified?: boolean;
  whatsappLink?: string;
  googleMapsUrl?: string;
  confidenceScore?: number;
}

export const LEADS: Lead[] = [
  {
    id: "l1",
    name: "Elif Demir",
    company: "Northwind Studio",
    role: "Creative Director",
    email: "elif@northwind.studio",
    phone: "+46 70 118 2244",
    location: "Stockholm, SE",
    status: "qualified",
    source: "Instagram",
    score: 92,
    value: 24000,
    ownerId: "ja",
    lastActivity: "Score updated after pricing reply",
    tags: ["Rebrand", "Priority"],
    nextStep: "Send warm-palette moodboard by 4pm",
    notes:
      "Loved the direction on the first pass. Budget approved for Q4, decision committee is Elif and their COO. Warm palette variant is the main blocker.",
  },
  {
    id: "l2",
    name: "Tomas Rivera",
    company: "Vela Coffee",
    role: "Founder",
    email: "tomas@velacoffee.com",
    phone: "+1 415 902 1180",
    location: "Portland, US",
    status: "new",
    source: "Web chat",
    score: 87,
    value: 8400,
    ownerId: "dp",
    lastActivity: "Asked about ecommerce budget",
    tags: ["Web", "Ecommerce"],
    nextStep: "Send project range + booking link",
    notes: "Wants to launch before the holiday season. Prefers async communication over calls.",
  },
  {
    id: "l3",
    name: "Jonas Weber",
    company: "Kraft & Co",
    role: "Marketing Lead",
    email: "jonas@kraftandco.de",
    phone: "+49 151 229 8841",
    location: "Berlin, DE",
    status: "qualified",
    source: "Referral",
    score: 81,
    value: 42000,
    ownerId: "ja",
    lastActivity: "Retainer signed yesterday",
    tags: ["Retainer", "Priority"],
    nextStep: "Schedule Q4 kickoff",
    notes: "Signed a 12-month design retainer. Loves structured processes and weekly written updates.",
  },
  {
    id: "l4",
    name: "Mei Tan",
    company: "Orbit Labs",
    role: "Product Manager",
    email: "mei@orbitlabs.io",
    phone: "+65 8123 4450",
    location: "Singapore, SG",
    status: "qualified",
    source: "Web chat",
    score: 78,
    value: 31200,
    ownerId: "sl",
    lastActivity: "Requested Thursday review",
    tags: ["Launch"],
    nextStep: "Reschedule review to Thursday 15:00",
    notes: "Launch is fixed for mid-November; timeline is tight but flexible on scope outside launch assets.",
  },
  {
    id: "l5",
    name: "Owen Blake",
    company: "Fieldnote",
    role: "COO",
    email: "owen@fieldnote.app",
    phone: "+44 7700 900 221",
    location: "London, UK",
    status: "customer",
    source: "Referral",
    score: 95,
    value: 27500,
    ownerId: "mc",
    lastActivity: "Approved design system phase 2",
    tags: ["Design system"],
    nextStep: "Share phase 2 timeline",
    notes: "Long-term partner. Usually moves quickly, values direct feedback over polished presentations.",
  },
  {
    id: "l6",
    name: "Priya Nair",
    company: "Loomwork",
    role: "Head of Growth",
    email: "priya@loomwork.co",
    phone: "+91 98200 33419",
    location: "Mumbai, IN",
    status: "nurturing",
    source: "LinkedIn",
    score: 74,
    value: 16800,
    ownerId: "ao",
    lastActivity: "Opened pricing email 3×",
    tags: ["Website"],
    nextStep: "Follow up with case study",
    notes: "Interested but waiting on a funding round. Engages heavily with case-study content.",
  },
  {
    id: "l7",
    name: "Nils Andersen",
    company: "Fjord Supply",
    role: "CEO",
    email: "nils@fjordsupply.no",
    phone: "+47 920 11 830",
    location: "Oslo, NO",
    status: "nurturing",
    source: "LinkedIn",
    score: 71,
    value: 36800,
    ownerId: "sl",
    lastActivity: "Asked for packaging mockups",
    tags: ["Packaging"],
    nextStep: "Send updated mockups",
    notes: "Negotiating timeline. Wants physical samples before signing.",
  },
  {
    id: "l8",
    name: "Ana Sofia",
    company: "Casa Lumen",
    role: "Brand Manager",
    email: "ana@casalumen.pt",
    phone: "+351 912 445 770",
    location: "Lisbon, PT",
    status: "cold",
    source: "Email",
    score: 38,
    value: 15600,
    ownerId: "ao",
    lastActivity: "No reply for 21 days",
    tags: ["Campaign"],
    nextStep: "Send a light nudge or archive",
    notes: "Budget freeze announced internally. Worth one more soft follow-up next quarter.",
  },
  {
    id: "l9",
    name: "Ravi Kapoor",
    company: "Aperture Health",
    role: "Head of Design",
    email: "ravi@aperture.health",
    phone: "+1 646 220 9911",
    location: "New York, US",
    status: "new",
    source: "Website",
    score: 59,
    value: 14000,
    ownerId: "mc",
    lastActivity: "Downloaded capabilities deck",
    tags: ["Healthcare"],
    nextStep: "Qualify via intro call",
    notes: "Downloaded the capabilities deck and browsed three case studies. No direct reply yet.",
  },
  {
    id: "l10",
    name: "Clara Moreau",
    company: "Atelier Nord",
    role: "Founder",
    email: "clara@ateliernord.fr",
    phone: "+33 6 44 20 18 92",
    location: "Paris, FR",
    status: "nurturing",
    source: "Instagram",
    score: 77,
    value: 21500,
    ownerId: "ja",
    lastActivity: "Replied to studio tour reel",
    tags: ["Branding", "Retail"],
    nextStep: "Invite to discovery call",
    notes: "Warm inbound from a Reel. Opening a second physical location and needs a full identity refresh.",
  },
];

/* ------------------------------------------------------------------ */
/* Inbox                                                               */
/* ------------------------------------------------------------------ */

export interface Message {
  id: string;
  from: "them" | "me" | "ai";
  text: string;
  time: string;
}

export interface Conversation {
  id: string;
  name: string;
  company: string;
  role: string;
  channel: Platform;
  preview: string;
  lastTime: string;
  unread: number;
  handler: "ai" | "human";
  sentiment: "positive" | "neutral" | "at risk";
  intent: string;
  confidence: number;
  value: number;
  email: string;
  location: string;
  aiSuggestion: string;
  messages: Message[];
}

export const CONVERSATIONS: Conversation[] = [
  {
    id: "c1",
    name: "Elif Demir",
    company: "Northwind Studio",
    role: "Creative Director",
    channel: "Instagram",
    preview: "Loved the moodboard. Can we add a version with the warmer palette?",
    lastTime: "2m",
    unread: 2,
    handler: "ai",
    sentiment: "positive",
    intent: "Design revision request",
    confidence: 96,
    value: 24000,
    email: "elif@northwind.studio",
    location: "Stockholm, SE",
    aiSuggestion:
      "Hi Elif — great to hear! I'll have a warm-palette variant of the hero in your inbox by 4pm today, plus a side-by-side so you can compare in context. I'll include the next milestone invoice note in the same email.",
    messages: [
      { id: "m1", from: "them", text: "Hi! We went through the deck last night — the direction feels really right.", time: "09:42" },
      { id: "m2", from: "them", text: "Could you add a version with the warmer palette for the hero section?", time: "09:43" },
      { id: "m3", from: "ai", text: "Absolutely, Elif. I've asked Jawad to prepare a warm-palette variant and we'll have it in your inbox by 4pm today. Anything else you'd like us to explore?", time: "09:44" },
      { id: "m4", from: "them", text: "That's perfect. Also — when is the next milestone invoice due?", time: "09:51" },
    ],
  },
  {
    id: "c2",
    name: "Tomas Rivera",
    company: "Vela Coffee",
    role: "Founder",
    channel: "Web chat",
    preview: "What would a full ecommerce build cost, realistically?",
    lastTime: "18m",
    unread: 1,
    handler: "ai",
    sentiment: "neutral",
    intent: "Pricing question",
    confidence: 91,
    value: 8400,
    email: "tomas@velacoffee.com",
    location: "Portland, US",
    aiSuggestion:
      "Realistically, a build like yours lands between $8k–$12k depending on product count and whether we migrate existing content. I'd love to send a tailored estimate — here's a 15-minute booking link, or I can send it async if you prefer.",
    messages: [
      { id: "m1", from: "them", text: "Hey — quick question before I fill in the form.", time: "09:10" },
      { id: "m2", from: "them", text: "What would a full ecommerce build cost, realistically?", time: "09:11" },
      { id: "m3", from: "me", text: "Hey Tomas! Happy to give you a straight answer — ranges depend a lot on catalogue size. I can share a real estimate today.", time: "09:14" },
    ],
  },
  {
    id: "c3",
    name: "Jonas Weber",
    company: "Kraft & Co",
    role: "Marketing Lead",
    channel: "Email",
    preview: "Signed the retainer — can we kick off next week?",
    lastTime: "1h",
    unread: 0,
    handler: "human",
    sentiment: "positive",
    intent: "Contract signed",
    confidence: 99,
    value: 42000,
    email: "jonas@kraftandco.de",
    location: "Berlin, DE",
    aiSuggestion:
      "Welcome aboard, Jonas! Tuesday or Wednesday next week both work on our side. I'll send a short kickoff agenda and a shared folder with the discovery questions before the call.",
    messages: [
      { id: "m1", from: "them", text: "Signed and sent. Excited to get moving.", time: "08:22" },
      { id: "m2", from: "them", text: "Can we kick off next week? Tuesday or Wednesday ideally.", time: "08:23" },
      { id: "m3", from: "me", text: "Amazing news, Jonas — welcome aboard! I'll confirm a slot today once the team's calendar is clear.", time: "08:41" },
    ],
  },
  {
    id: "c4",
    name: "Mei Tan",
    company: "Orbit Labs",
    role: "Product Manager",
    channel: "LinkedIn",
    preview: "Can we move the design review to Thursday?",
    lastTime: "2h",
    unread: 0,
    handler: "ai",
    sentiment: "neutral",
    intent: "Reschedule meeting",
    confidence: 94,
    value: 31200,
    email: "mei@orbitlabs.io",
    location: "Singapore, SG",
    aiSuggestion:
      "Thursday works — I've moved the review to 15:00 SGT and sent an updated invite to everyone. I also pushed the feedback deadline to Friday noon so the team still has time to turn things around.",
    messages: [
      { id: "m1", from: "them", text: "Small scheduling issue — can we move the design review to Thursday?", time: "07:55" },
      { id: "m2", from: "ai", text: "Of course. Thursday 15:00 SGT is open — I've sent a new invite and moved the feedback deadline to Friday noon.", time: "07:56" },
      { id: "m3", from: "them", text: "Perfect, thank you. This is why I like working with you.", time: "08:02" },
    ],
  },
  {
    id: "c5",
    name: "Nils Andersen",
    company: "Fjord Supply",
    role: "CEO",
    channel: "Instagram",
    preview: "Could you share the latest packaging mockups?",
    lastTime: "3h",
    unread: 1,
    handler: "human",
    sentiment: "neutral",
    intent: "Asset request",
    confidence: 88,
    value: 36800,
    email: "nils@fjordsupply.no",
    location: "Oslo, NO",
    aiSuggestion:
      "Hi Nils — absolutely. I'll send the updated mockups along with the material notes we discussed. If you'd like, I can also courier physical samples so you can feel the paper stock before deciding.",
    messages: [
      { id: "m1", from: "them", text: "Could you share the latest packaging mockups?", time: "06:40" },
      { id: "m2", from: "me", text: "Will do — updating the material notes first so everything is in one place.", time: "07:12" },
    ],
  },
  {
    id: "c6",
    name: "Ana Sofia",
    company: "Casa Lumen",
    role: "Brand Manager",
    channel: "Email",
    preview: "Invoice question — can we split this month's payment?",
    lastTime: "5h",
    unread: 0,
    handler: "ai",
    sentiment: "at risk",
    intent: "Billing",
    confidence: 84,
    value: 15600,
    email: "ana@casalumen.pt",
    location: "Lisbon, PT",
    aiSuggestion:
      "Hi Ana — yes, we can split it into two payments (this Friday and the 15th). I'll send an updated invoice and update our records so nothing looks overdue in the meantime.",
    messages: [
      { id: "m1", from: "them", text: "Invoice question — can we split this month's payment into two?", time: "05:05" },
      { id: "m2", from: "ai", text: "Hi Ana, yes — I can split it into two payments. I'll confirm the dates with finance and send an updated invoice today.", time: "05:07" },
    ],
  },
];

/* ------------------------------------------------------------------ */
/* Overview feed / agenda                                              */
/* ------------------------------------------------------------------ */

export interface ActivityItem {
  id: string;
  kind: "ai" | "deal" | "task" | "post" | "invoice";
  title: string;
  meta: string;
  time: string;
}

export const ACTIVITIES: ActivityItem[] = [
  {
    id: "a1",
    kind: "ai",
    title: "Raka qualified a new lead from web chat",
    meta: "Tomas Rivera · Vela Coffee · score 87",
    time: "2m",
  },
  {
    id: "a2",
    kind: "ai",
    title: "Raka drafted a follow-up for Northwind",
    meta: "Warm-palette revision · sent for approval",
    time: "18m",
  },
  {
    id: "a3",
    kind: "deal",
    title: "Kraft & Co moved to Proposal",
    meta: "Sofia Lindqvist · $42,000 retainer",
    time: "52m",
  },
  {
    id: "a4",
    kind: "task",
    title: "Moodboard task moved to review",
    meta: "Amara Okafor · Orbit Labs launch",
    time: "1h",
  },
  {
    id: "a5",
    kind: "post",
    title: "3 posts scheduled for next week",
    meta: "Instagram, LinkedIn, X · content queue",
    time: "2h",
  },
  {
    id: "a6",
    kind: "invoice",
    title: "Invoice reminder sent to Casa Lumen",
    meta: "Raka · tone: friendly, escalation avoided",
    time: "3h",
  },
];

export interface AgendaItem {
  id: string;
  time: string;
  title: string;
  meta: string;
  kind: "meeting" | "post" | "email" | "task";
}

export const AGENDA: AgendaItem[] = [
  {
    id: "g1",
    time: "09:00",
    title: "Brand kickoff — Northwind Studio",
    meta: "Video call · Elif + 2 others",
    kind: "meeting",
  },
  {
    id: "g2",
    time: "11:30",
    title: "Work that speaks — carousel",
    meta: "Instagram · in demo queue",
    kind: "post",
  },
  {
    id: "g3",
    time: "14:00",
    title: "Design review — Orbit Labs",
    meta: "Studio 2 · Mei Tan",
    kind: "meeting",
  },
  {
    id: "g4",
    time: "16:00",
    title: "The 3 questions we ask — thread",
    meta: "X · approved by Jawad",
    kind: "post",
  },
  {
    id: "g5",
    time: "17:00",
    title: "Weekly pipeline digest",
    meta: "Email · demo digest",
    kind: "email",
  },
];

export const AGENDA_BY_WORKSPACE: Record<string, AgendaItem[]> = {
  playdesign: AGENDA,
  brandal: [
    {
      id: "bg1",
      time: "09:30",
      title: "Launch sync — Sweetbloom",
      meta: "Video call · Marcus + 2 others",
      kind: "meeting",
    },
    {
      id: "bg2",
      time: "11:00",
      title: "BeeBestie teaser — story cut",
      meta: "Instagram · in demo queue",
      kind: "post",
    },
    {
      id: "bg3",
      time: "14:30",
      title: "Packaging review — Hive & Harvest",
      meta: "Studio 1 · Amara",
      kind: "meeting",
    },
    {
      id: "bg4",
      time: "16:00",
      title: "Gbee Coffee retail — thread",
      meta: "LinkedIn · approved by Jawad",
      kind: "post",
    },
    {
      id: "bg5",
      time: "17:30",
      title: "Weekly brand digest",
      meta: "Email · demo digest",
      kind: "email",
    },
  ],
};

/* ------------------------------------------------------------------ */
/* Agent                                                               */
/* ------------------------------------------------------------------ */

export interface Automation {
  id: string;
  name: string;
  description: string;
  active: boolean;
  runs: number;
  successRate: number;
}

export const AUTOMATIONS: Automation[] = [
  {
    id: "au1",
    name: "Lead qualification",
    description: "Scores inbound leads, enriches company data and routes hot leads to the right owner.",
    active: true,
    runs: 1284,
    successRate: 97,
  },
  {
    id: "au2",
    name: "Follow-up sequences",
    description: "Drafts a personalized follow-up after 3 days of silence, held for human approval.",
    active: true,
    runs: 862,
    successRate: 95,
  },
  {
    id: "au3",
    name: "Meeting scheduler",
    description: "Finds slots, sends calendar invites and handles reschedules inside the thread.",
    active: true,
    runs: 431,
    successRate: 99,
  },
  {
    id: "au4",
    name: "CRM hygiene",
    description: "Dedupes contacts, fills missing fields and re-tags leads based on recent activity.",
    active: true,
    runs: 2310,
    successRate: 98,
  },
  {
    id: "au5",
    name: "Social content drafting",
    description: "Turns project wins into post drafts and queues them for human review.",
    active: false,
    runs: 96,
    successRate: 91,
  },
  {
    id: "au6",
    name: "Invoice reminders",
    description: "Sends friendly payment nudges with escalating tone only when a human approves.",
    active: false,
    runs: 58,
    successRate: 89,
  },
];

export interface KnowledgeSource {
  id: string;
  name: string;
  type: "PDF" | "Doc" | "Notes" | "Folder";
  size: string;
  synced: string;
  chunks: number;
}

export const KNOWLEDGE: KnowledgeSource[] = [
  { id: "k1", name: "Brand guidelines 2026", type: "PDF", size: "18.4 MB", synced: "2h ago", chunks: 128 },
  { id: "k2", name: "Services & pricing", type: "Doc", size: "240 KB", synced: "Yesterday", chunks: 42 },
  { id: "k3", name: "Tone of voice", type: "Notes", size: "12 KB", synced: "3d ago", chunks: 18 },
  { id: "k4", name: "Case studies", type: "Folder", size: "12 files", synced: "5d ago", chunks: 264 },
];

export interface AgentRun {
  id: string;
  action: string;
  subject: string;
  outcome: "Resolved" | "Escalated" | "Approved";
  duration: string;
  time: string;
}

export const AGENT_RUNS: AgentRun[] = [
  { id: "r1", action: "Qualified lead", subject: "Tomas Rivera · Vela Coffee", outcome: "Resolved", duration: "12s", time: "2m ago" },
  { id: "r2", action: "Drafted follow-up", subject: "Elif Demir · Northwind Studio", outcome: "Approved", duration: "8s", time: "18m ago" },
  { id: "r3", action: "Rescheduled review", subject: "Mei Tan · Orbit Labs", outcome: "Resolved", duration: "6s", time: "2h ago" },
  { id: "r4", action: "Billing question", subject: "Ana Sofia · Casa Lumen", outcome: "Escalated", duration: "22s", time: "5h ago" },
  { id: "r5", action: "Enriched contact", subject: "Clara Moreau · Atelier Nord", outcome: "Resolved", duration: "4s", time: "7h ago" },
];

export interface Notification {
  id: string;
  title: string;
  description: string;
  time: string;
  unread: boolean;
  kind: "ai" | "deal" | "post" | "task";
}

export const NOTIFICATIONS: Notification[] = [
  {
    id: "n1",
    title: "Raka needs your approval",
    description: "A follow-up draft for Elif Demir is waiting for review.",
    time: "2m",
    unread: true,
    kind: "ai",
  },
  {
    id: "n2",
    title: "Northwind moved to Qualified",
    description: "Lead score jumped to 92 after Raka's pricing reply.",
    time: "24m",
    unread: true,
    kind: "deal",
  },
  {
    id: "n3",
    title: "Carousel scheduled for 11:30",
    description: "“Work that speaks” is queued for Instagram.",
    time: "1h",
    unread: true,
    kind: "post",
  },
  {
    id: "n4",
    title: "Invoice overdue",
    description: "Casa Lumen's invoice is 2 days past due.",
    time: "3h",
    unread: false,
    kind: "task",
  },
];

export const CHANNEL_PERFORMANCE = [
  { label: "LinkedIn", value: 84, color: "#4A9EFF" },
  { label: "Instagram", value: 68, color: "#F0629B" },
  { label: "Referral", value: 52, color: "#C9822E" },
  { label: "Website", value: 41, color: "#4E7C6A" },
  { label: "Email", value: 24, color: "#9A8F8B" },
];
