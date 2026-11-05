export type ModuleStatus = 'Live' | 'Foundation' | 'Planned' | 'Needs setup';
export type Role = 'Owner' | 'Admin' | 'Editor' | 'Reviewer' | 'Operator' | 'Agent';

export type Permission =
  | 'content.read'
  | 'content.write'
  | 'content.review'
  | 'content.publish'
  | 'media.write'
  | 'comments.moderate'
  | 'crm.write'
  | 'agents.configure'
  | 'admin.modules';

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  status: 'Aktif' | 'Diundang' | 'Ditangguhkan';
  lastActive: string;
  jobTitle: string;
}

export interface Company {
  id: string;
  name: string;
  industry: string;
  city: string;
  arr: number;
  ownerId: string;
  health: 'Sehat' | 'Perhatian' | 'Risiko';
  contactCount: number;
  since: string;
  hue: number;
}

export interface Contact {
  id: string;
  name: string;
  companyId: string;
  title: string;
  email: string;
  phone: string;
  ownerId: string;
  lastTouch: string;
}

export type LeadSource = 'Website' | 'Referral' | 'Instagram' | 'LinkedIn' | 'Event' | 'Outbound';

export type LeadBusinessType =
  | 'UMKM'
  | 'Travel Agent'
  | 'F&B'
  | 'Retail'
  | 'Korporat'
  | 'Pendidikan'
  | 'Kesehatan'
  | 'Properti'
  | 'Lainnya';

export const LEAD_BUSINESS_TYPES: LeadBusinessType[] = [
  'UMKM',
  'Travel Agent',
  'F&B',
  'Retail',
  'Korporat',
  'Pendidikan',
  'Kesehatan',
  'Properti',
  'Lainnya',
];

export interface Lead {
  id: string;
  name: string;
  company: string;
  phone: string;
  businessType: LeadBusinessType;
  source: LeadSource;
  value: number;
  ownerId: string;
  status: 'Baru' | 'Terkualifikasi' | 'Dihubungi' | 'Tidak cocok';
  createdAt: string;
  note?: string;
}

export interface WaTemplate {
  id: string;
  name: string;
  body: string;
  isDefault: boolean;
  updatedAt: string;
}

export type DealStage = 'new' | 'qualified' | 'proposal' | 'negotiation' | 'won' | 'lost';

export interface Deal {
  id: string;
  title: string;
  companyId: string;
  value: number;
  stage: DealStage;
  ownerId: string;
  closeAt: string;
  probability: number;
  source: string;
  updatedAt: string;
  stageNote?: string;
}

export interface Activity {
  id: string;
  kind: 'Panggilan' | 'Email' | 'Meeting' | 'Catatan';
  subject: string;
  detail: string;
  who: string;
  at: string;
  dealId?: string;
  companyId?: string;
}

export type TaskStatus = 'todo' | 'doing' | 'review' | 'done';

export interface Task {
  id: string;
  title: string;
  assigneeId: string;
  status: TaskStatus;
  priority: 'Tinggi' | 'Sedang' | 'Rendah';
  due: string;
  tags: string[];
  projectId?: string;
  createdAt: string;
}

export interface Project {
  id: string;
  name: string;
  clientId: string;
  type: string;
  status: 'Berjalan' | 'Review' | 'Selesai' | 'Ditahan';
  progress: number;
  startAt: string;
  dueAt: string;
  leadId: string;
  budget: number;
}

export interface Deliverable {
  id: string;
  projectId: string;
  name: string;
  status: 'Draft' | 'Review internal' | 'Review klien' | 'Selesai';
  due: string;
  ownerId: string;
}

export type AgentStatus = 'Aktif' | 'Idle' | 'Dijeda' | 'Error';

export interface Agent {
  id: string;
  name: string;
  codename: string;
  role: string;
  model: string;
  status: AgentStatus;
  tasksToday: number;
  successRate: number;
  avgDuration: number;
  lastRun: string;
  tools: string[];
  scope: string[];
  description: string;
  tone: string;
}

export type JobStatus =
  | 'queued'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'delivery_uncertain';

export interface JobEvent {
  at: string;
  label: string;
  detail?: string;
  tone?: 'default' | 'success' | 'danger' | 'warning';
}

export interface Job {
  id: string;
  agentId: string;
  title: string;
  status: JobStatus;
  startedAt: string;
  durationSec: number;
  retries: number;
  needsApproval: boolean;
  triggeredBy: string;
  input: string;
  output?: string;
  error?: string;
  events: JobEvent[];
}

export type ArticleStatus = 'draft' | 'in_review' | 'approved' | 'scheduled' | 'published' | 'archived';
export type DeliveryStatus =
  | 'queued'
  | 'scheduled'
  | 'published'
  | 'failed'
  | 'cancelled'
  | 'delivery_uncertain';

export interface Revision {
  at: string;
  label: string;
  by: string;
}

export interface Article {
  id: string;
  title: string;
  slug: string;
  authorId: string;
  category: string;
  status: ArticleStatus;
  delivery: DeliveryStatus;
  date: string;
  views: number;
  excerpt: string;
  body: string;
  revisions: Revision[];
  channels?: string[];
  scheduledAt?: string;
}

export interface Page {
  id: string;
  title: string;
  slug: string;
  type: 'Statis' | 'Landing';
  status: 'Draft' | 'Terbit';
  menus: string[];
  updated: string;
}

export interface Comment {
  id: string;
  author: string;
  email: string;
  article: string;
  body: string;
  at: string;
  status: 'Menunggu' | 'Disetujui' | 'Spam';
}

export interface MenuItem {
  id: string;
  label: string;
  href: string;
  children?: MenuItem[];
}

export interface Menu {
  id: string;
  location: 'Header' | 'Footer';
  items: MenuItem[];
}

export interface Approval {
  id: string;
  title: string;
  kind: 'Artikel' | 'Jadwal sosial' | 'Newsletter' | 'Laporan AI';
  requestedBy: string;
  module: string;
  at: string;
  qc: 'PASS' | 'FAIL' | 'PENDING';
  status: 'pending' | 'approved' | 'rejected' | 'revision';
  decidedBy?: string;
  note?: string;
  articleId?: string;
  socialPostId?: string;
  risk?: string;
  previewData?: {
    caption?: string;
    hashtags?: string[];
    slides?: string[];
    channel?: string;
    mediaUrl?: string;
  };
}

export interface NotificationItem {
  id: string;
  title: string;
  body: string;
  at: string;
  read: boolean;
  kind: 'approval' | 'job' | 'comment' | 'system' | 'task';
  href?: string;
}

export interface AuditEntry {
  id: string;
  at: string;
  actor: string;
  action: string;
  target: string;
  module: string;
}

export interface Integration {
  id: string;
  name: string;
  category: string;
  status: 'Terhubung' | 'Needs setup' | 'Belum aktif' | 'Error';
  note: string;
  lastSync?: string;
  mark: string;
}

export interface ChatMessage {
  id: string;
  room: string;
  author: string;
  role: string;
  text: string;
  at: string;
  mine?: boolean;
}

export interface SocialPost {
  id: string;
  title: string;
  channel: 'Instagram' | 'LinkedIn' | 'X' | 'YouTube' | 'Newsletter';
  date: string;
  status: 'Approved' | 'Scheduled' | 'Published';
  articleId?: string;
  caption?: string;
  hashtags?: string[];
  mediaUrl?: string;
  slides?: string[];
  author?: string;
}

export interface RawLead {
  id: string;
  name: string;
  company: string;
  source: 'Google Maps' | 'Instagram' | 'LinkedIn' | 'Direktori';
  phone?: string;
  email?: string;
  instagram?: string;
  city?: string;
  status: 'Raw' | 'Verified' | 'Imported' | 'Ignored';
  scrapedAt: string;
  category?: string;
  fullAddress?: string;
  rating?: number;
  whatsappVerified?: boolean;
  whatsappLink?: string;
  googleMapsUrl?: string;
  sourceUrl?: string;
  sourceType?: 'gmaps' | 'instagram' | 'website';
  confidenceScore?: number;
}

export interface Outreach {
  id: string;
  leadId: string;
  leadName: string;
  company: string;
  phone?: string;
  category?: string;
  city?: string;
  status: OutreachStatus;
  channel: 'whatsapp';
  note?: string;
  contactedAt: string;
  repliedAt?: string;
  updatedAt: string;
}

export type OutreachStatus =
  | 'contacted'
  | 'replied'
  | 'interested'
  | 'not_interested'
  | 'deal';

export interface LandingPageConfig {
  hero: {
    badge: string;
    headline: string;
    subheadline: string;
    ctaPrimary: string;
    ctaPrimaryLink: string;
    ctaSecondary: string;
    ctaSecondaryLink: string;
  };
  services: Array<{
    id: string;
    title: string;
    description: string;
    icon: string;
    badge?: string;
  }>;
  caseStudies: Array<{
    id: string;
    title: string;
    client: string;
    category: string;
    summary: string;
    metrics?: string;
  }>;
  testimonials: Array<{
    id: string;
    quote: string;
    author: string;
    role: string;
    company: string;
  }>;
  contact: {
    whatsapp: string;
    email: string;
    address: string;
    defaultMessage: string;
  };
}

export interface Feature {
  id: string;
  name: string;
  group: 'Marketing & Content' | 'Advanced Ecosystem' | 'Platform & Governance';
  status: 'Planned' | 'Needs setup';
  guard?: string;
  dependency?: string;
  desc: string;
}

export interface StudioSettings {
  name: string;
  tagline: string;
  email: string;
  timezone: string;
  weekStart: 'Senin' | 'Minggu';
  digest: boolean;
  notifyApprovals: boolean;
  notifyJobs: boolean;
  autoRetry: boolean;
}

export interface MemoryRecord {
  id: string;
  title: string;
  scope: string;
  tags: string[];
  updated: string;
  content: string;
}

export interface FolderItem {
  id: string;
  name: string;
  kind: 'Folder' | 'File';
  size?: string;
  updated: string;
  children?: FolderItem[];
}

export interface LogEntry {
  id: string;
  at: string;
  level: 'INFO' | 'WARN' | 'ERROR';
  source: string;
  message: string;
}

export interface UsageRecord {
  agentId: string;
  day: string;
  tokens: number;
  cost: number;
}

export interface Workspace {
  id: string;
  name: string;
  members: number;
  projects: number;
  plan: string;
  active: boolean;
}

export interface CalendarEvent {
  id: string;
  title: string;
  date: string;
  kind: 'task' | 'content' | 'approval' | 'project';
  href: string;
}

export interface DB {
  users: User[];
  companies: Company[];
  contacts: Contact[];
  leads: Lead[];
  waTemplates: WaTemplate[];
  deals: Deal[];
  activities: Activity[];
  tasks: Task[];
  projects: Project[];
  deliverables: Deliverable[];
  agents: Agent[];
  jobs: Job[];
  articles: Article[];
  pages: Page[];
  comments: Comment[];
  menus: Menu[];
  approvals: Approval[];
  notifications: NotificationItem[];
  audit: AuditEntry[];
  integrations: Integration[];
  chat: ChatMessage[];
  social: SocialPost[];
  features: Feature[];
  settings: StudioSettings;
  memories: MemoryRecord[];
  folders: FolderItem[];
  logs: LogEntry[];
  usage: UsageRecord[];
  workspaces: Workspace[];
  rawLeads?: RawLead[];
  outreach?: Outreach[];
  landingConfig?: LandingPageConfig;
}
