import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type {
  Agent,
  Article,
  ChatMessage,
  Comment,
  DB,
  Job,
  Lead,
  LeadBusinessType,
  LeadSource,
  Permission,
  Role,
  Task,
  TaskStatus,
  WaTemplate,
  DealStage,
  Approval,
  User,
  RawLead,
  Outreach,
  LandingPageConfig,
} from '../data/types';
import { SEED } from '../data/seed';
import { hasPermission } from '../lib/permissions';
import { dayOffset, uid } from '../lib/utils';
import { fetchOffice, fetchOutreach, getOfficeToken, saveOutreach, type OutreachStatus } from '../lib/api';

const STORE_KEY = 'playdesign.os.v2';
const THEME_KEY = 'playdesign.theme';
const ROLE_KEY = 'playdesign.role';

type Tone = 'default' | 'success' | 'danger' | 'warning';
interface Toast {
  id: string;
  message: string;
  tone: Tone;
}

interface NewLeadInput {
  name: string;
  company: string;
  phone: string;
  businessType: LeadBusinessType;
  source: LeadSource;
  value: number;
  ownerId: string;
  note?: string;
}

interface NewTaskInput {
  title: string;
  assigneeId: string;
  priority: Task['priority'];
  due: string;
  projectId?: string;
  tags?: string[];
}

interface NewArticleInput {
  title: string;
  category: string;
  excerpt: string;
  body: string;
  authorId: string;
}

interface StoreValue {
  db: DB;
  user: User;
  role: Role;
  setRole: (role: Role) => void;
  can: (permission: Permission) => boolean;
  theme: 'light' | 'dark';
  toggleTheme: () => void;
  navCollapsed: boolean;
  setNavCollapsed: (v: boolean) => void;
  toasts: Toast[];
  toast: (message: string, tone?: Tone) => void;
  dismissToast: (id: string) => void;
  switchWorkspace: (id: string) => void;
  addLead: (input: NewLeadInput) => void;
  convertLead: (leadId: string) => string | null;
  addDeal: (input: { title: string; companyId: string; value: number; stage: DealStage; ownerId: string; closeAt: string; source: string }) => void;
  addContact: (input: { name: string; companyId: string; title: string; email: string; phone: string; ownerId: string }) => void;
  moveDeal: (dealId: string, stage: DealStage, note?: string) => boolean;
  addTask: (input: NewTaskInput) => void;
  setTaskStatus: (taskId: string, status: TaskStatus) => void;
  updateDeliverable: (id: string, status: 'Draft' | 'Review internal' | 'Review klien' | 'Selesai') => void;
  saveWaTemplate: (input: { id?: string; name: string; body: string }) => string;
  deleteWaTemplate: (id: string) => void;
  setDefaultWaTemplate: (id: string) => void;
  createArticle: (input: NewArticleInput) => string;
  updateArticle: (id: string, patch: Partial<Article>) => void;
  submitReview: (articleId: string) => void;
  publishArticle: (articleId: string) => void;
  moderateComment: (id: string, status: Comment['status']) => void;
  deleteComment: (id: string) => void;
  decideApproval: (id: string, decision: 'approved' | 'rejected' | 'revision', note: string) => void;
  importRawLeadToCrm: (rawLeadId: string, options?: { silent?: boolean }) => void;
  addScrapedLeads: (leads: RawLead[], options?: { silent?: boolean }) => void;
  updateLandingConfig: (config: Partial<LandingPageConfig>) => void;
  retryJob: (jobId: string) => void;
  markNotificationRead: (id: string) => void;
  markAllNotificationsRead: () => void;
  sendChat: (room: string, text: string) => void;
  receiveChat: (room: string, author: string, role: string, text: string) => void;
  saveSettings: (patch: DB['settings']) => void;
  inviteUser: (input: { name: string; email: string; role: Role }) => void;
  updateUserRole: (id: string, role: Role) => void;
  addPage: (input: { title: string; slug: string; type: 'Statis' | 'Landing' }) => void;
  addMenuItem: (menuId: string, label: string, href: string) => void;
  removeMenuItem: (menuId: string, itemId: string) => void;
  moveMenuItem: (menuId: string, itemId: string, direction: -1 | 1) => void;
  schedulePost: (postId: string, date: string) => void;
  updateAgent: (id: string, patch: Partial<Agent>) => void;
  addMemory: (input: { title: string; scope: string; content: string; tags: string[] }) => void;
  syncFromApi: () => Promise<{ ok: boolean; count: number; error?: string }>;
  setOutreach: (lead: RawLead, status: OutreachStatus, note?: string) => Promise<void>;
  resetData: () => void;
}

const StoreContext = createContext<StoreValue | null>(null);

const cloneSeed = (): DB => JSON.parse(JSON.stringify(SEED)) as DB;

const loadDB = (): DB => {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return cloneSeed();
    const parsed = JSON.parse(raw) as DB;
    if (!parsed.users || !parsed.agents || !parsed.features) return cloneSeed();
    parsed.leads = parsed.leads.map((lead) => {
      const seeded = SEED.leads.find((l) => l.id === lead.id);
      return {
        ...lead,
        phone: lead.phone ?? seeded?.phone ?? '',
        businessType: lead.businessType ?? seeded?.businessType ?? 'Lainnya',
      };
    });
    if (!parsed.waTemplates?.length) parsed.waTemplates = cloneSeed().waTemplates;
    if (!parsed.rawLeads?.length) parsed.rawLeads = cloneSeed().rawLeads;
    if (!parsed.landingConfig) parsed.landingConfig = cloneSeed().landingConfig;
    return parsed;
  } catch {
    return cloneSeed();
  }
};

const loadTheme = (): 'light' | 'dark' => {
  const saved = localStorage.getItem(THEME_KEY);
  if (saved === 'light' || saved === 'dark') return saved;
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
};

const loadRole = (): Role => {
  const saved = localStorage.getItem(ROLE_KEY) as Role | null;
  return saved && ['Owner', 'Admin', 'Editor', 'Reviewer', 'Operator'].includes(saved)
    ? saved
    : 'Owner';
};

const now = () => new Date().toISOString();

const stamp = (db: DB, actor: string, action: string, target: string, module: string): DB => ({
  ...db,
  audit: [
    { id: uid('au'), at: now(), actor, action, target, module },
    ...db.audit,
  ],
});

const pushNote = (
  db: DB,
  input: { title: string; body: string; kind: DB['notifications'][number]['kind']; href?: string },
): DB => ({
  ...db,
  notifications: [
    { id: uid('n'), at: now(), read: false, ...input },
    ...db.notifications,
  ],
});

const STAGE_PROBABILITY: Record<DealStage, number> = {
  new: 20,
  qualified: 35,
  proposal: 55,
  negotiation: 75,
  won: 100,
  lost: 0,
};

export function StoreProvider({ children }: { children: ReactNode }) {
  const [db, setDb] = useState<DB>(loadDB);
  const [theme, setTheme] = useState<'light' | 'dark'>(loadTheme);
  const [role, setRoleState] = useState<Role>(loadRole);
  const [navCollapsed, setNavCollapsed] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timers = useRef<Record<string, number>>({});

  const user = db.users[0];

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem(THEME_KEY, theme);
    const metaThemeColor = document.querySelector('meta[name="theme-color"]');
    if (metaThemeColor) {
      metaThemeColor.setAttribute('content', theme === 'dark' ? '#0b0f17' : '#faf6f3');
    }
  }, [theme]);

  useEffect(() => {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(db));
    } catch {
      /* storage full — keep session state */
    }
  }, [db]);

  useEffect(() => {
    localStorage.setItem(ROLE_KEY, role);
  }, [role]);

  /* ------------------------------------------------------------------ */
  /* D1 sync — pull scraped leads from the Worker API                    */
  /* ------------------------------------------------------------------ */

  const syncFromApi = useCallback(async (): Promise<{ ok: boolean; count: number; error?: string }> => {
    try {
      const [snapshot, outreachRows] = await Promise.all([
        fetchOffice('playdesign'),
        fetchOutreach().catch(() => []),
      ]);
      const apiLeads = snapshot.leads ?? [];
      const mapped: RawLead[] = apiLeads.map((lead) => ({
        id: lead.id,
        name: lead.name || lead.company || 'Tanpa nama',
        company: lead.company || lead.name || 'Tanpa nama',
        source:
          lead.sourceType === 'instagram'
            ? 'Instagram'
            : lead.sourceType === 'website'
              ? 'Direktori'
              : 'Google Maps',
        phone: lead.phone,
        email: lead.email && !lead.email.endsWith('@wa.leads') ? lead.email : undefined,
        city: lead.location,
        status:
          lead.status === 'verified'
            ? 'Verified'
            : lead.status === 'imported'
              ? 'Imported'
              : lead.status === 'invalid'
                ? 'Ignored'
                : 'Raw',
        scrapedAt: lead.lastActivity || new Date().toISOString(),
        category: lead.category,
        fullAddress: lead.fullAddress,
        rating: lead.rating,
        whatsappVerified: lead.whatsappVerified,
        whatsappLink: lead.whatsappLink,
        googleMapsUrl: lead.googleMapsUrl,
        sourceUrl: lead.sourceUrl ?? lead.googleMapsUrl,
        sourceType: lead.sourceType === 'instagram' || lead.sourceType === 'website' ? lead.sourceType : 'gmaps',
        instagram: lead.instagram,
        confidenceScore: lead.confidenceScore,
      }));
      setDb((prev) => ({
        ...prev,
        rawLeads: mapped,
        outreach: outreachRows.map((row) => ({
          id: row.id,
          leadId: row.leadId,
          leadName: row.leadName ?? '',
          company: row.company ?? '',
          phone: row.phone ?? undefined,
          category: row.category ?? undefined,
          city: row.city ?? undefined,
          status: row.status,
          channel: 'whatsapp' as const,
          note: row.note ?? undefined,
          contactedAt: row.contactedAt,
          repliedAt: row.repliedAt ?? undefined,
          updatedAt: row.updatedAt,
        })),
      }));
      return { ok: true, count: mapped.length };
    } catch (error) {
      if ((error as { status?: number } | null)?.status === 401) {
        return {
          ok: false,
          count: 0,
          error: 'Token ditolak server. Tempel token terbaru di layar akses.',
        };
      }
      const message = error instanceof Error ? error.message : 'Gagal menyinkronkan data dari D1.';
      return { ok: false, count: 0, error: message };
    }
  }, []);

  useEffect(() => {
    if (getOfficeToken()) {
      void syncFromApi();
    }
    const onTokenSet = () => {
      void syncFromApi();
    };
    window.addEventListener('pd-token-set', onTokenSet);
    return () => window.removeEventListener('pd-token-set', onTokenSet);
  }, [syncFromApi]);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    if (timers.current[id]) {
      window.clearTimeout(timers.current[id]);
      delete timers.current[id];
    }
  }, []);

  const toast = useCallback(
    (message: string, tone: Tone = 'default') => {
      const id = uid('toast');
      setToasts((prev) => [...prev.slice(-3), { id, message, tone }]);
      timers.current[id] = window.setTimeout(() => dismissToast(id), 4200);
    },
    [dismissToast],
  );

  const can = useCallback((permission: Permission) => hasPermission(role, permission), [role]);

  /* ------------------------------------------------------------------ */
  /* Outreach — WhatsApp follow-up tracking (persisted to D1)            */
  /* ------------------------------------------------------------------ */

  const setOutreach = useCallback(
    async (lead: RawLead, status: OutreachStatus, note?: string) => {
      const now = new Date().toISOString();
      const replied = status === 'replied' || status === 'interested' || status === 'deal';

      setDb((prev) => {
        const list = prev.outreach ?? [];
        const existing = list.find((row) => row.leadId === lead.id);
        const nextRow: Outreach = {
          id: existing?.id ?? uid('lo'),
          leadId: lead.id,
          leadName: lead.name,
          company: lead.company,
          phone: lead.phone,
          category: lead.category,
          city: lead.city,
          status,
          channel: 'whatsapp',
          note: note ?? existing?.note,
          contactedAt: existing?.contactedAt ?? now,
          repliedAt: replied ? existing?.repliedAt ?? now : existing?.repliedAt,
          updatedAt: now,
        };
        return {
          ...prev,
          outreach: existing
            ? list.map((row) => (row.leadId === lead.id ? nextRow : row))
            : [nextRow, ...list],
        };
      });

      try {
        await saveOutreach({
          leadId: lead.id,
          leadName: lead.name,
          company: lead.company,
          phone: lead.phone,
          category: lead.category,
          city: lead.city,
          status,
          note,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Gagal menyimpan status follow up.';
        toast(message, 'danger');
      }
    },
    [toast],
  );

  const setRole = useCallback((next: Role) => {
    setRoleState(next);
  }, []);

  const toggleTheme = () => setTheme((t) => (t === 'light' ? 'dark' : 'light'));

  const switchWorkspace = (id: string) => {
    setDb((prev) => ({
      ...prev,
      workspaces: prev.workspaces.map((w) => ({ ...w, active: w.id === id })),
    }));
    const ws = db.workspaces.find((w) => w.id === id);
    toast(`Workspace aktif: ${ws?.name ?? id}`, 'success');
  };

  const addLead = (input: NewLeadInput) => {
    setDb((prev) => {
      const lead: Lead = {
        id: uid('l'),
        status: 'Baru',
        createdAt: now(),
        ...input,
      };
      const next = { ...prev, leads: [lead, ...prev.leads] };
      return stamp(next, user.name, 'Menambahkan lead', input.name, 'CRM');
    });
    toast(`Lead ${input.name} ditambahkan.`);
  };

  const convertLead = (leadId: string) => {
    const lead = db.leads.find((l) => l.id === leadId);
    if (!lead) return null;
    const dealId = uid('d');
    setDb((prev) => {
      let company = prev.companies.find((c) => c.name.toLowerCase() === lead.company.toLowerCase());
      let companies = prev.companies;
      if (!company) {
        company = {
          id: uid('c'),
          name: lead.company,
          industry: 'Belum diklasifikasi',
          city: '—',
          arr: lead.value,
          ownerId: lead.ownerId,
          health: 'Perhatian',
          contactCount: 0,
          since: now(),
          hue: 18,
        };
        companies = [company, ...companies];
      }
      const deal = {
        id: dealId,
        title: `Peluang ${lead.company}`,
        companyId: company.id,
        value: lead.value,
        stage: 'qualified' as DealStage,
        ownerId: lead.ownerId,
        closeAt: dayOffset(30, 12),
        probability: STAGE_PROBABILITY.qualified,
        source: lead.source,
        updatedAt: now(),
      };
      const next: DB = {
        ...prev,
        companies,
        deals: [deal, ...prev.deals],
        leads: prev.leads.map((l) =>
          l.id === leadId ? { ...l, status: 'Terkualifikasi' as const } : l,
        ),
      };
      return stamp(next, user.name, 'Mengonversi lead menjadi deal', lead.name, 'CRM');
    });
    toast(`Deal baru dibuat dari lead ${lead.name}.`, 'success');
    return dealId;
  };

  const addDeal: StoreValue['addDeal'] = (input) => {
    setDb((prev) => {
      const deal = {
        id: uid('d'),
        ...input,
        probability: STAGE_PROBABILITY[input.stage],
        updatedAt: now(),
      };
      const next = { ...prev, deals: [deal, ...prev.deals] };
      return stamp(next, user.name, 'Membuat deal', input.title, 'CRM');
    });
    toast('Deal baru ditambahkan.');
  };

  const addContact: StoreValue['addContact'] = (input) => {
    setDb((prev) => {
      const next: DB = {
        ...prev,
        contacts: [
          {
            id: uid('ct'),
            ...input,
            lastTouch: now(),
          },
          ...prev.contacts,
        ],
        companies: prev.companies.map((c) =>
          c.id === input.companyId ? { ...c, contactCount: c.contactCount + 1 } : c,
        ),
      };
      return stamp(next, user.name, 'Menambahkan kontak', input.name, 'CRM');
    });
    toast('Kontak baru ditambahkan.');
  };

  const moveDeal = (dealId: string, stage: DealStage, note?: string) => {
    const current = db.deals.find((d) => d.id === dealId);
    if (!current) return false;
    if (current.stage === stage) return true;
    if (stage === 'won' || stage === 'lost') {
      if (!note?.trim()) {
        toast('Tahap menang atau kalah wajib punya alasan.', 'danger');
        return false;
      }
    }
    setDb((prev) => {
      const next: DB = {
        ...prev,
        deals: prev.deals.map((d) =>
          d.id === dealId
            ? {
                ...d,
                stage,
                probability: STAGE_PROBABILITY[stage],
                updatedAt: now(),
                stageNote: note ?? d.stageNote,
              }
            : d,
        ),
      };
      return stamp(
        next,
        user.name,
        `Mengubah tahap deal`,
        `${current.title} → ${stage}`,
        'CRM',
      );
    });
    toast(`Tahap deal dipindahkan ke ${stage}.`, 'success');
    return true;
  };

  const addTask = (input: NewTaskInput) => {
    setDb((prev) => {
      const task: Task = {
        id: uid('t'),
        status: 'todo',
        createdAt: now(),
        tags: input.tags ?? [],
        ...input,
      };
      const next = { ...prev, tasks: [task, ...prev.tasks] };
      return stamp(next, user.name, 'Membuat tugas', input.title, 'Projects');
    });
    toast('Tugas baru ditambahkan.');
  };

  const setTaskStatus = (taskId: string, status: TaskStatus) => {
    const task = db.tasks.find((t) => t.id === taskId);
    if (!task) return;
    setDb((prev) => {
      const next: DB = {
        ...prev,
        tasks: prev.tasks.map((t) => (t.id === taskId ? { ...t, status } : t)),
      };
      return stamp(next, user.name, 'Mengubah status tugas', task.title, 'Projects');
    });
    toast(`Status tugas: ${status}.`, 'success');
  };

  const updateDeliverable: StoreValue['updateDeliverable'] = (id, status) => {
    const target = db.deliverables.find((d) => d.id === id);
    if (!target) return;
    setDb((prev) => {
      const next: DB = {
        ...prev,
        deliverables: prev.deliverables.map((d) => (d.id === id ? { ...d, status } : d)),
      };
      return stamp(next, user.name, 'Memperbarui deliverable', `${target.name} → ${status}`, 'Projects');
    });
    toast(`Deliverable: ${status}.`, 'success');
  };

  const saveWaTemplate: StoreValue['saveWaTemplate'] = (input) => {
    const id = input.id ?? uid('wt');
    setDb((prev) => {
      const exists = prev.waTemplates.some((t) => t.id === id);
      const templates: WaTemplate[] = exists
        ? prev.waTemplates.map((t) =>
            t.id === id ? { ...t, name: input.name, body: input.body, updatedAt: now() } : t,
          )
        : [
            ...prev.waTemplates,
            { id, name: input.name, body: input.body, isDefault: prev.waTemplates.length === 0, updatedAt: now() },
          ];
      return stamp(
        { ...prev, waTemplates: templates },
        user.name,
        exists ? 'Memperbarui template WA' : 'Menambahkan template WA',
        input.name,
        'CRM',
      );
    });
    toast('Template WA disimpan.', 'success');
    return id;
  };

  const deleteWaTemplate = (id: string) => {
    setDb((prev) => {
      const target = prev.waTemplates.find((t) => t.id === id);
      const remaining = prev.waTemplates.filter((t) => t.id !== id);
      const templates = remaining.length > 0 && !remaining.some((t) => t.isDefault)
        ? remaining.map((t, i) => (i === 0 ? { ...t, isDefault: true } : t))
        : remaining;
      return stamp({ ...prev, waTemplates: templates }, user.name, 'Menghapus template WA', target?.name ?? id, 'CRM');
    });
    toast('Template WA dihapus.', 'warning');
  };

  const setDefaultWaTemplate = (id: string) => {
    setDb((prev) => {
      const target = prev.waTemplates.find((t) => t.id === id);
      const templates = prev.waTemplates.map((t) => ({ ...t, isDefault: t.id === id }));
      return stamp({ ...prev, waTemplates: templates }, user.name, 'Menetapkan template WA utama', target?.name ?? id, 'CRM');
    });
    toast('Template utama diperbarui.', 'success');
  };

  const createArticle = (input: NewArticleInput) => {
    const id = uid('art');
    setDb((prev) => {
      const article: Article = {
        id,
        title: input.title || 'Tanpa judul',
        slug:
          input.title
            .toLowerCase()
            .replace(/[^a-z0-9\s-]/g, '')
            .trim()
            .replace(/\s+/g, '-') || 'tanpa-judul',
        authorId: input.authorId,
        category: input.category,
        status: 'draft',
        delivery: 'queued',
        date: now(),
        views: 0,
        excerpt: input.excerpt,
        body: input.body,
        revisions: [{ at: now(), label: 'Draft dibuat', by: user.name }],
      };
      const next = { ...prev, articles: [article, ...prev.articles] };
      return stamp(next, user.name, 'Membuat draft artikel', article.title, 'Marketing & Content');
    });
    return id;
  };

  const updateArticle: StoreValue['updateArticle'] = (id, patch) => {
    const article = db.articles.find((a) => a.id === id);
    if (!article) return;
    setDb((prev) => {
      const next: DB = {
        ...prev,
        articles: prev.articles.map((a) =>
          a.id === id
            ? {
                ...a,
                ...patch,
                revisions: [
                  ...a.revisions,
                  { at: now(), label: 'Disimpan', by: user.name },
                ],
              }
            : a,
        ),
      };
      return stamp(next, user.name, 'Menyimpan artikel', article.title, 'Marketing & Content');
    });
    toast('Draft disimpan.');
  };

  const submitReview = (articleId: string) => {
    const article = db.articles.find((a) => a.id === articleId);
    if (!article) return;
    if (article.status !== 'draft') {
      toast('Hanya draft yang bisa diajukan review.', 'warning');
      return;
    }
    setDb((prev) => {
      let next: DB = {
        ...prev,
        articles: prev.articles.map((a) =>
          a.id === articleId
            ? {
                ...a,
                status: 'in_review' as const,
                delivery: 'queued' as const,
                revisions: [
                  ...a.revisions,
                  { at: now(), label: 'QC PASS · diajukan review', by: 'Vela · agent' },
                ],
              }
            : a,
        ),
      };
      const approval: Approval = {
        id: uid('ap'),
        title: article.title,
        kind: 'Artikel',
        requestedBy: user.name,
        module: 'Marketing & Content',
        at: now(),
        qc: 'PASS',
        status: 'pending',
        articleId,
        risk: 'Keputusan akhir ada di Owner. QC PASS bukan pengganti approval.',
      };
      next = { ...next, approvals: [approval, ...next.approvals] };
      next = pushNote(next, {
        title: 'Approval baru menunggu',
        body: `Artikel "${article.title}" diajukan oleh ${user.name}.`,
        kind: 'approval',
        href: '/approvals',
      });
      return stamp(next, user.name, 'Mengajukan artikel review', article.title, 'Marketing & Content');
    });
    toast('Diajukan. Menunggu keputusan Owner.', 'success');
  };

  const publishArticle = (articleId: string) => {
    if (!can('content.publish')) {
      toast('Publish ditolak: hanya Owner yang boleh menerbitkan.', 'danger');
      return;
    }
    const article = db.articles.find((a) => a.id === articleId);
    if (!article) return;
    if (article.status !== 'approved') {
      toast('Publish ditolak: konten belum approved.', 'danger');
      return;
    }
    setDb((prev) => {
      const next: DB = {
        ...prev,
        articles: prev.articles.map((a) =>
          a.id === articleId
            ? {
                ...a,
                status: 'published' as const,
                delivery: 'published' as const,
                date: now(),
                revisions: [...a.revisions, { at: now(), label: 'Terbit', by: user.name }],
              }
            : a,
        ),
      };
      return stamp(next, user.name, 'Menerbitkan artikel', article.title, 'Marketing & Content');
    });
    toast('Artikel terbit. Delivery tercatat Published.', 'success');
  };

  const moderateComment = (id: string, status: Comment['status']) => {
    setDb((prev) => {
      const target = prev.comments.find((c) => c.id === id);
      const next: DB = {
        ...prev,
        comments: prev.comments.map((c) => (c.id === id ? { ...c, status } : c)),
      };
      return stamp(next, user.name, `Moderasi komentar → ${status}`, target?.author ?? id, 'Marketing & Content');
    });
    toast(`Komentar ditandai ${status.toLowerCase()}.`, 'success');
  };

  const deleteComment = (id: string) => {
    setDb((prev) => {
      const target = prev.comments.find((c) => c.id === id);
      const next = { ...prev, comments: prev.comments.filter((c) => c.id !== id) };
      return stamp(next, user.name, 'Menghapus komentar', target?.author ?? id, 'Marketing & Content');
    });
    toast('Komentar dihapus.', 'success');
  };

  const decideApproval = (id: string, decision: 'approved' | 'rejected' | 'revision', note: string) => {
    if (role !== 'Owner') {
      toast('Hanya Owner yang bisa memutuskan pengiriman keluar.', 'danger');
      return;
    }
    const approval = db.approvals.find((a) => a.id === id);
    if (!approval) return;
    if (approval.status !== 'pending') {
      toast('Packet ini sudah diputuskan.', 'warning');
      return;
    }
    setDb((prev) => {
      let next: DB = {
        ...prev,
        approvals: prev.approvals.map((a) =>
          a.id === id
            ? { ...a, status: decision, decidedBy: user.name, note: note || undefined }
            : a,
        ),
      };
      if (approval.articleId) {
        next = {
          ...next,
          articles: next.articles.map((a) =>
            a.id === approval.articleId
              ? {
                  ...a,
                  status: decision === 'approved' ? 'approved' : 'draft',
                  revisions: [
                    ...a.revisions,
                    {
                      at: now(),
                      label: decision === 'approved' ? 'Approved oleh Owner' : decision === 'revision' ? 'Minta revisi oleh Owner' : 'Ditolak → kembali draft',
                      by: user.name,
                    },
                  ],
                }
              : a,
          ),
        };
      }
      if (decision === 'approved' && approval.kind === 'Jadwal sosial') {
        const targetPostId = approval.socialPostId ?? 'so-5';
        next = {
          ...next,
          social: next.social.map((s) =>
            s.id === targetPostId ? { ...s, status: 'Scheduled' as const, date: dayOffset(4, 10) } : s,
          ),
        };
      }
      const noteTitle = decision === 'approved' ? 'Approval disetujui' : decision === 'revision' ? 'Revisi diminta untuk approval' : 'Approval ditolak';
      const noteBody = decision === 'approved' ? `${approval.title} — siap dikirim.` : decision === 'revision' ? `${approval.title} — perbaikan dibutuhkan: "${note}"` : `${approval.title} — dikembalikan ke draft.`;
      next = pushNote(next, {
        title: noteTitle,
        body: noteBody,
        kind: 'approval',
        href: '/approvals',
      });
      if (approval.kind === 'Newsletter' && decision === 'approved') {
        next = pushNote(next, {
          title: 'Pengiriman newsletter tetap diblokir',
          body: 'Provider email belum terhubung. Approval tidak membuka jalur kirim.',
          kind: 'system',
          href: '/admin/integrations',
        });
      }
      return stamp(
        next,
        user.name,
        decision === 'approved' ? 'Menyetujui approval packet' : decision === 'revision' ? 'Meminta revisi approval packet' : 'Menolak approval packet',
        approval.title,
        approval.module,
      );
    });
    if (approval.kind === 'Newsletter' && decision === 'approved') {
      toast('Disetujui. Pengiriman tetap diblokir sampai provider aktif.', 'warning');
    } else if (decision === 'approved') {
      toast('Disetujui. Konten siap dikirim sesuai jadwal.', 'success');
    } else if (decision === 'revision') {
      toast('Permintaan revisi terkirim ke pembuat konten.', 'warning');
    } else {
      toast('Ditolak. Konten dikembalikan ke draft.', 'danger');
    }
  };

  const importRawLeadToCrm: StoreValue['importRawLeadToCrm'] = (rawLeadId, options) => {
    const raw = (db.rawLeads ?? []).find((r) => r.id === rawLeadId);
    if (!raw) return;
    const newLead: Lead = {
      id: uid('l'),
      name: raw.name,
      company: raw.company,
      phone: raw.phone ?? '',
      businessType: raw.source === 'Google Maps' ? 'UMKM' : 'Lainnya',
      source:
        raw.source === 'Instagram'
          ? 'Instagram'
          : raw.source === 'LinkedIn'
          ? 'LinkedIn'
          : 'Outbound',
      value: raw.source === 'Google Maps' ? 5_000_000 : 0,
      ownerId: user.id,
      status: 'Baru',
      createdAt: now(),
      note: `Diimpor dari Lead Scraper (${raw.source}).${
        raw.category ? ` Kategori: ${raw.category}.` : ''
      } Kota: ${raw.city ?? 'Tidak diketahui'}.${
        raw.fullAddress ? ` Alamat: ${raw.fullAddress}.` : ''
      }${raw.rating != null ? ` Rating GMaps: ${raw.rating}/5.` : ''}${
        raw.email ? ` Email: ${raw.email}.` : ''
      }${raw.sourceUrl ? ` Sumber: ${raw.sourceUrl}.` : ''}`,
    };
    setDb((prev) => {
      const next = {
        ...prev,
        leads: [newLead, ...prev.leads],
        rawLeads: (prev.rawLeads ?? []).map((r) =>
          r.id === rawLeadId ? { ...r, status: 'Imported' as const } : r,
        ),
      };
      return stamp(next, user.name, 'Mengimpor lead scraper', newLead.company, 'CRM');
    });
    if (!options?.silent) {
      toast(`Lead ${raw.name} (${raw.company}) berhasil diimpor ke CRM!`, 'success');
    }
  };

  const addScrapedLeads: StoreValue['addScrapedLeads'] = (newLeads, options) => {
    setDb((prev) => {
      const next = { ...prev, rawLeads: [...newLeads, ...(prev.rawLeads ?? [])] };
      return stamp(next, user.name, 'Menambahkan hasil scrape', `${newLeads.length} prospek`, 'CRM');
    });
    if (!options?.silent) {
      toast(`${newLeads.length} leads baru berhasil ditambahkan dari scraper!`, 'success');
    }
  };

  const updateLandingConfig = (config: Partial<LandingPageConfig>) => {
    setDb((prev) => ({
      ...prev,
      landingConfig: prev.landingConfig ? { ...prev.landingConfig, ...config } : (config as LandingPageConfig),
    }));
    toast('Konfigurasi Landing Page berhasil disimpan!', 'success');
  };

  const retryJob = (jobId: string) => {
    const job = db.jobs.find((j) => j.id === jobId);
    if (!job) return;
    if (job.status === 'delivery_uncertain') {
      toast('Delivery uncertain tidak di-retry otomatis. Butuh keputusan manusia.', 'danger');
      return;
    }
    if (job.status !== 'failed') {
      toast('Hanya job gagal yang bisa di-retry manual.', 'warning');
      return;
    }
    setDb((prev) => {
      const next: DB = {
        ...prev,
        jobs: prev.jobs.map((j) =>
          j.id === jobId
            ? {
                ...j,
                status: 'queued' as Job['status'],
                retries: j.retries + 1,
                startedAt: now(),
                error: undefined,
                events: [
                  ...j.events,
                  { at: now(), label: `Retry manual #${j.retries + 1}`, detail: `oleh ${user.name}`, tone: 'warning' as const },
                ],
              }
            : j,
        ),
      };
      return stamp(next, user.name, 'Retry manual job', job.title, 'AI Agent Center');
    });
    toast('Job dimasukkan kembali ke antrean.', 'success');
  };

  const markNotificationRead = (id: string) => {
    setDb((prev) => ({
      ...prev,
      notifications: prev.notifications.map((n) => (n.id === id ? { ...n, read: true } : n)),
    }));
  };

  const markAllNotificationsRead = () => {
    setDb((prev) => ({
      ...prev,
      notifications: prev.notifications.map((n) => ({ ...n, read: true })),
    }));
    toast('Semua notifikasi ditandai dibaca.', 'success');
  };

  const sendChat = (room: string, text: string) => {
    const message: ChatMessage = {
      id: uid('ch'),
      room,
      author: user.name,
      role,
      text,
      at: now(),
      mine: true,
    };
    setDb((prev) => ({ ...prev, chat: [...prev.chat, message] }));
  };

  const receiveChat = (room: string, author: string, authorRole: string, text: string) => {
    const message: ChatMessage = {
      id: uid('ch'),
      room,
      author,
      role: authorRole,
      text,
      at: now(),
    };
    setDb((prev) => ({ ...prev, chat: [...prev.chat, message] }));
  };

  const saveSettings = (patch: DB['settings']) => {
    setDb((prev) => {
      const next = { ...prev, settings: patch };
      return stamp(next, user.name, 'Memperbarui pengaturan studio', patch.name, 'Settings');
    });
    toast('Pengaturan disimpan.', 'success');
  };

  const inviteUser = (input: { name: string; email: string; role: Role }) => {
    setDb((prev) => {
      const newUser: User = {
        id: uid('u'),
        name: input.name,
        email: input.email,
        role: input.role,
        status: 'Diundang',
        lastActive: now(),
        jobTitle: 'Anggota baru',
      };
      const next = { ...prev, users: [...prev.users, newUser] };
      return stamp(next, user.name, 'Mengundang pengguna', `${input.name} · ${input.role}`, 'Administration');
    });
    toast(`Undangan dikirim ke ${input.email}.`);
  };

  const updateUserRole = (id: string, nextRole: Role) => {
    setDb((prev) => {
      const target = prev.users.find((u) => u.id === id);
      const next = {
        ...prev,
        users: prev.users.map((u) => (u.id === id ? { ...u, role: nextRole } : u)),
      };
      return stamp(next, user.name, 'Mengubah peran pengguna', `${target?.name ?? id} → ${nextRole}`, 'Administration');
    });
    toast('Peran pengguna diperbarui.', 'success');
  };

  const addPage = (input: { title: string; slug: string; type: 'Statis' | 'Landing' }) => {
    setDb((prev) => {
      const next: DB = {
        ...prev,
        pages: [
          {
            id: uid('pg'),
            ...input,
            status: 'Draft',
            menus: [],
            updated: now(),
          },
          ...prev.pages,
        ],
      };
      return stamp(next, user.name, 'Membuat halaman', input.title, 'Marketing & Content');
    });
    toast('Halaman draft dibuat.');
  };

  const addMenuItem = (menuId: string, label: string, href: string) => {
    setDb((prev) => {
      const next: DB = {
        ...prev,
        menus: prev.menus.map((m) =>
          m.id === menuId && m.items.length < 8
            ? { ...m, items: [...m.items, { id: uid('mi'), label, href }] }
            : m,
        ),
      };
      return stamp(next, user.name, 'Menambah item menu', label, 'Marketing & Content');
    });
    toast('Item menu ditambahkan.');
  };

  const removeMenuItem = (menuId: string, itemId: string) => {
    setDb((prev) => {
      const menu = prev.menus.find((m) => m.id === menuId);
      const target = menu?.items.find((i) => i.id === itemId);
      const next: DB = {
        ...prev,
        menus: prev.menus.map((m) =>
          m.id === menuId ? { ...m, items: m.items.filter((i) => i.id !== itemId) } : m,
        ),
      };
      return stamp(next, user.name, 'Menghapus item menu', target?.label ?? itemId, 'Marketing & Content');
    });
    toast('Item menu dihapus.', 'warning');
  };

  const moveMenuItem = (menuId: string, itemId: string, direction: -1 | 1) => {
    setDb((prev) => {
      const next: DB = {
        ...prev,
        menus: prev.menus.map((m) => {
          if (m.id !== menuId) return m;
          const index = m.items.findIndex((i) => i.id === itemId);
          const target = index + direction;
          if (index < 0 || target < 0 || target >= m.items.length) return m;
          const items = [...m.items];
          [items[index], items[target]] = [items[target], items[index]];
          return { ...m, items };
        }),
      };
      return stamp(next, user.name, 'Mengubah urutan menu', menuId, 'Marketing & Content');
    });
  };

  const schedulePost = (postId: string, date: string) => {
    const post = db.social.find((s) => s.id === postId);
    if (!post) return;
    if (post.status === 'Published') {
      toast('Konten yang sudah terbit tidak bisa dijadwalkan ulang.', 'danger');
      return;
    }
    setDb((prev) => {
      const next: DB = {
        ...prev,
        social: prev.social.map((s) =>
          s.id === postId ? { ...s, date, status: 'Scheduled' } : s,
        ),
      };
      return stamp(next, user.name, 'Menjadwalkan konten sosial', post.title, 'Social Planner');
    });
    toast('Konten dijadwalkan. Hanya konten approved yang bisa masuk kalender.', 'success');
  };

  const updateAgent = (id: string, patch: Partial<Agent>) => {
    setDb((prev) => {
      const target = prev.agents.find((a) => a.id === id);
      const next = {
        ...prev,
        agents: prev.agents.map((a) => (a.id === id ? { ...a, ...patch } : a)),
      };
      return stamp(next, user.name, 'Memperbarui konfigurasi agent', target?.name ?? id, 'AI Agent Center');
    });
    toast('Konfigurasi agent disimpan.');
  };

  const addMemory = (input: { title: string; scope: string; content: string; tags: string[] }) => {
    setDb((prev) => {
      const next: DB = {
        ...prev,
        memories: [
          { id: uid('me'), updated: now(), ...input },
          ...prev.memories,
        ],
      };
      return stamp(next, user.name, 'Menambahkan memori', input.title, 'Memory');
    });
    toast('Memori disimpan.');
  };

  const resetData = () => {
    localStorage.removeItem(STORE_KEY);
    setDb(cloneSeed());
    setRoleState('Owner');
    toast('Data lokal dikembalikan ke kondisi awal.', 'warning');
  };

  const value = useMemo<StoreValue>(
    () => ({
      db,
      user,
      role,
      setRole,
      can,
      theme,
      toggleTheme,
      navCollapsed,
      setNavCollapsed,
      toasts,
      toast,
      dismissToast,
      switchWorkspace,
      addLead,
      convertLead,
      addDeal,
      addContact,
      moveDeal,
      addTask,
      setTaskStatus,
      updateDeliverable,
      saveWaTemplate,
      deleteWaTemplate,
      setDefaultWaTemplate,
      createArticle,
      updateArticle,
      submitReview,
      publishArticle,
      moderateComment,
      deleteComment,
      decideApproval,
      retryJob,
      markNotificationRead,
      markAllNotificationsRead,
      sendChat,
      receiveChat,
      saveSettings,
      inviteUser,
      updateUserRole,
      addPage,
      addMenuItem,
      removeMenuItem,
      moveMenuItem,
      schedulePost,
      updateAgent,
      addMemory,
      importRawLeadToCrm,
      addScrapedLeads,
      updateLandingConfig,
      resetData,
      syncFromApi,
      setOutreach,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [db, role, theme, navCollapsed, toasts, can, user],
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore must be used inside StoreProvider');
  return ctx;
}

export const activeUser = (db: DB) => db.users[0];
