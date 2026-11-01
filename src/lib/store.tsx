import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { TEAM, type Deal, type DealStage, type Post, type TaskStatus } from "../data/mock";
import {
  briefStatus,
  extractBriefScope,
  type Brief,
  type BriefField,
  type BriefSource,
} from "../data/briefs";
import {
  DELIVERY_ANALYSES,
  DELIVERY_PLAN,
  DELIVERY_RUNS,
  PRD_MODULES,
  buildDeliveryAnalysis,
  buildDeliveryPlan,
  completeDeliveryRun,
  createDeliveryRun,
  dependencyReady,
  type DeliveryAnalysis,
  type DeliveryPlanItem,
  type DeliveryRun,
} from "../data/delivery";
import {
  ASSETS,
  AUTOMATION_EXECUTIONS,
  CLIENTS,
  KNOWLEDGE_DOCS,
  PERMISSION_MODULES,
  PROJECTS,
  ROLE_PERMISSIONS,
  ROLES,
  TRANSACTIONS,
  WORKFLOWS,
  financeSummary,
  type AutomationExecution,
  type Client,
  type CreativeAsset,
  type KnowledgeDoc,
  type PermissionModule,
  type Project,
  type ProjectStatus,
  type RoleDef,
  type Transaction,
  type Workflow,
} from "../data/business";
import {
  AGENTS,
  APPROVAL_META,
  OFFICE_DEALS,
  OFFICE_LEADS,
  OFFICE_POSTS,
  OFFICE_RUNS,
  OFFICE_TASKS,
  RUN_STATE_META,
  SEED_AUDIT,
  SEED_NOTIFICATIONS,
  TERMINAL_RUN_STATES,
  WORKSPACES,
  workspaceById,
  type ActorType,
  type AppNotification,
  type AuditEvent,
  type Evidence,
  type OfficeAgent,
  type OfficeDeal,
  type OfficeLead,
  type OfficePost,
  type OfficeRun,
  type OfficeTask,
  type RunState,
  type Workspace,
  type WorkspaceId,
} from "../data/office";
import { dateAt, money } from "./utils";
import {
  apiErrorMessage,
  createTask as createTaskOnServer,
  decideApproval,
  decideRun as decideRunOnServer,
  fetchOffice,
  officeApiEnabled,
  patchTask,
  startRunFromProposal,
  stopRun as stopRunOnServer,
} from "./officeApi";

const uid = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

export interface ActionResult {
  ok: boolean;
  error?: string;
  duplicate?: boolean;
}

export interface StartRunInput {
  agentId: string;
  action: string;
  subject: string;
  taskId?: string;
  approvalRequired?: boolean;
  forceFailure?: boolean;
  failureReason?: string;
  limitations?: string[];
  evidence?: Evidence[];
}

export type NewTaskInput = Pick<
  OfficeTask,
  "title" | "project" | "priority" | "status" | "due" | "ownerId" | "tags" | "subtasksDone" | "subtasksTotal"
>;

export interface SyncState {
  status: "demo" | "syncing" | "live" | "error";
  message?: string;
  error?: string;
  lastSyncAt?: number;
}

export interface RunStartResult {
  ok: boolean;
  runId?: string;
  error?: string;
}

interface AppStore {
  workspace: Workspace;
  workspaces: Workspace[];
  switchWorkspace: (id: WorkspaceId) => void;

  sync: SyncState;
  refresh: () => Promise<void>;
  clearSyncError: () => void;

  tasks: OfficeTask[];
  deals: OfficeDeal[];
  posts: OfficePost[];
  leads: OfficeLead[];
  briefs: Brief[];
  runs: OfficeRun[];
  agents: OfficeAgent[];
  audit: AuditEvent[];
  notifications: AppNotification[];
  approvals: OfficeTask[];

  autopilot: boolean;
  setAutopilot: (enabled: boolean) => void;

  moveTask: (id: string, status: TaskStatus) => Promise<ActionResult>;
  toggleTask: (id: string) => Promise<ActionResult>;
  addTask: (task: NewTaskInput) => Promise<ActionResult>;
  assignTask: (id: string, ownerId: string) => Promise<ActionResult>;
  submitTask: (id: string) => Promise<ActionResult>;
  decideTask: (
    id: string,
    decision: "approved" | "changes_requested" | "rejected",
    comment: string,
  ) => Promise<ActionResult>;
  addTaskComment: (id: string, body: string) => ActionResult;

  moveDeal: (id: string, stage: DealStage) => void;
  addDeal: (deal: Omit<Deal, "id">) => void;
  addLead: (lead: Omit<OfficeLead, "id" | "workspaceId">) => void;

  addBrief: (input: { source: BriefSource; client: string; project: string; contact?: string; raw: string }) => string;
  answerBriefQuestion: (id: string, field: BriefField, value: string) => ActionResult;
  addBriefDeliverable: (id: string, title: string) => ActionResult;
  removeBriefDeliverable: (id: string, deliverableId: string) => void;
  approveBriefScope: (id: string) => ActionResult;

  deliveryAnalysis: DeliveryAnalysis | null;
  deliveryPlan: DeliveryPlanItem[];
  deliveryRuns: DeliveryRun[];
  runDeliveryAnalysis: () => ActionResult;
  draftDeliveryPlan: () => ActionResult;
  approveDeliveryPlan: (ids: string[]) => ActionResult;
  startDeliveryRun: (itemId: string) => { ok: boolean; runId?: string; error?: string };
  validateDeliveryRun: (runId: string, note?: string) => ActionResult;

  clients: Client[];
  projects: Project[];
  assets: CreativeAsset[];
  transactions: Transaction[];
  knowledgeDocs: KnowledgeDoc[];
  workflows: Workflow[];
  automationExecutions: AutomationExecution[];
  roles: RoleDef[];
  permissionModules: readonly PermissionModule[];
  rolePermissions: Record<RoleDef["id"], PermissionModule[]>;

  convertLeadToClient: (leadId: string) => { ok: boolean; error?: string; clientId?: string };
  addClient: (input: {
    name: string;
    company: string;
    email: string;
    industry: string;
    notes: string;
  }) => ActionResult;
  createProject: (input: {
    name: string;
    clientId: string;
    description: string;
    type: string;
    managerId: string;
    startDate: string;
    deadline: string;
    budget: number;
  }) => ActionResult;
  createProjectFromDeal: (dealId: string) => ActionResult;
  updateProjectStatus: (id: string, status: ProjectStatus) => ActionResult;
  submitAssetForReview: (id: string) => ActionResult;
  sendAssetToClient: (id: string) => ActionResult;
  approveAsset: (id: string) => ActionResult;
  requestAssetRevision: (id: string, note: string) => ActionResult;
  addAssetVersion: (id: string, note: string) => ActionResult;
  addTransaction: (input: {
    type: Transaction["type"];
    category: string;
    description: string;
    amount: number;
    date: string;
    method: Transaction["method"];
    projectId?: string;
    clientId?: string;
    reference?: string;
  }) => ActionResult;
  reverseTransaction: (id: string) => ActionResult;
  addKnowledgeDoc: (input: {
    title: string;
    category: string;
    summary: string;
    body: string;
    source: string;
    access: KnowledgeDoc["access"];
    projectId?: string;
  }) => string;
  archiveKnowledgeDoc: (id: string, archived: boolean) => ActionResult;
  toggleDocAgentAccess: (id: string) => ActionResult;
  toggleWorkflow: (id: string) => void;
  runWorkflow: (id: string) => ActionResult;

  addPost: (post: Omit<Post, "id">) => void;
  updatePost: (id: string, patch: Partial<Post>) => void;
  deletePost: (id: string) => void;
  approvePost: (id: string) => ActionResult;
  publishPost: (id: string) => ActionResult;

  startRun: (input: StartRunInput) => Promise<RunStartResult>;
  stopRun: (id: string) => Promise<ActionResult>;
  decideRun: (
    id: string,
    decision: "approved" | "changes_requested" | "rejected",
    comment: string,
  ) => Promise<ActionResult>;

  markNotificationRead: (id: string) => void;
  markAllNotificationsRead: () => void;
  recordEvent: (input: {
    entityType: AuditEvent["entityType"];
    entityId: string;
    action: string;
    meta?: string;
    result?: AuditEvent["result"];
  }) => void;
}

const StoreContext = createContext<AppStore | null>(null);

const statusLabel: Record<TaskStatus, string> = {
  backlog: "Backlog",
  in_progress: "In progress",
  review: "In review",
  done: "Done",
};

const stageLabel: Record<DealStage, string> = {
  new: "New",
  qualified: "Qualified",
  proposal: "Proposal",
  negotiation: "Negotiation",
  won: "Won",
};

const nextActionFor = (status: TaskStatus) =>
  status === "done"
    ? "Approved output archived — keep the audit trail."
    : status === "review"
      ? "Owner review and approval decision."
      : status === "in_progress"
        ? "Finish the output and attach evidence."
        : "Confirm the brief and start production.";

const isTerminal = (state: RunState) => TERMINAL_RUN_STATES.includes(state);
const isActive = (state: RunState) => !isTerminal(state);

const taskApprovalRecord = (
  task: OfficeTask,
  decision: "approved" | "changes_requested" | "rejected",
  comment: string,
) => ({
  id: uid("ap"),
  version: task.outputVersion,
  decision,
  actorId: "ja",
  actorType: "owner" as ActorType,
  comment: comment.trim() || undefined,
  at: Date.now(),
  time: "just now",
  idempotencyKey: `${task.id}:v${task.outputVersion}:${decision}`,
});

const hasKey = (task: OfficeTask, key: string) => task.history.some((record) => record.idempotencyKey === key);

const briefAgentFor = (workspaceId: WorkspaceId) => (workspaceId === "playdesign" ? "nova" : "echo");

const ownerForDeliverable = (title: string) => {
  const value = title.toLowerCase();
  if (/web|landing|ui|app/.test(value)) return "dp";
  if (/social|content|case study|copy|campaign|motion/.test(value)) return "lf";
  if (/brand|identity|guideline/.test(value)) return "sl";
  if (/logo|design system|packaging|label|illustration/.test(value)) return "mc";
  return "ja";
};

const tagForDeliverable = (title: string) => {
  const value = title.toLowerCase();
  if (/web|landing|ui|app/.test(value)) return "Web";
  if (/packaging|label/.test(value)) return "Packaging";
  if (/social|content|case study|copy|campaign|motion/.test(value)) return "Content";
  if (/brand|identity|guideline|logo|design system/.test(value)) return "Branding";
  return "Design";
};

const deliveryOwnerFor = (area: string) => {
  if (area === "Foundation" || area === "Finance") return "ja";
  if (area === "Intelligence" || area === "Analytics") return "lf";
  return "dp";
};

const parseBudgetAnswer = (value: string) => {
  const match = value.replace(/,/g, "").match(/(\d+(?:\.\d+)?)\s*(k|m)?/i);
  if (!match) return undefined;
  const base = Number(match[1]);
  if (!Number.isFinite(base) || base <= 0) return undefined;
  const unit = match[2]?.toLowerCase();
  if (unit === "k") return Math.round(base * 1_000);
  if (unit === "m") return Math.round(base * 1_000_000);
  return Math.round(base);
};

const splitDeliverables = (value: string) =>
  value
    .split(/,|;|\band\b/i)
    .map((item) => item.trim())
    .filter(Boolean);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [workspaceId, setWorkspaceId] = useState<WorkspaceId>("playdesign");
  const [allTasks, setAllTasks] = useState<OfficeTask[]>(OFFICE_TASKS);
  const [allDeals, setAllDeals] = useState<OfficeDeal[]>(OFFICE_DEALS);
  const [allPosts, setAllPosts] = useState<OfficePost[]>(OFFICE_POSTS);
  const [allLeads, setAllLeads] = useState<OfficeLead[]>(OFFICE_LEADS);
  const [allBriefs, setAllBriefs] = useState<Brief[]>([]);
  const [allDeliveryAnalyses, setAllDeliveryAnalyses] = useState<DeliveryAnalysis[]>(DELIVERY_ANALYSES);
  const [allDeliveryPlan, setAllDeliveryPlan] = useState<DeliveryPlanItem[]>(DELIVERY_PLAN);
  const [allDeliveryRuns, setAllDeliveryRuns] = useState<DeliveryRun[]>(DELIVERY_RUNS);
  const [allClients, setAllClients] = useState<Client[]>(CLIENTS);
  const [allProjects, setAllProjects] = useState<Project[]>(PROJECTS);
  const [allAssets, setAllAssets] = useState<CreativeAsset[]>(ASSETS);
  const [allTransactions, setAllTransactions] = useState<Transaction[]>(TRANSACTIONS);
  const [allKnowledgeDocs, setAllKnowledgeDocs] = useState<KnowledgeDoc[]>(KNOWLEDGE_DOCS);
  const [allWorkflows, setAllWorkflows] = useState<Workflow[]>(WORKFLOWS);
  const [allAutomationExecutions, setAllAutomationExecutions] = useState<AutomationExecution[]>(AUTOMATION_EXECUTIONS);
  const [allRuns, setAllRuns] = useState<OfficeRun[]>(OFFICE_RUNS);
  const [allAudit, setAllAudit] = useState<AuditEvent[]>(SEED_AUDIT);
  const [allNotifications, setAllNotifications] = useState<AppNotification[]>(SEED_NOTIFICATIONS);
  const [autopilot, setAutopilot] = useState(true);
  const [syncState, setSyncState] = useState<SyncState>(() => ({
    status: officeApiEnabled ? "syncing" : "demo",
  }));

  const runsRef = useRef<OfficeRun[]>(allRuns);
  useEffect(() => {
    runsRef.current = allRuns;
  }, [allRuns]);

  const syncTicket = useRef(0);

  const upsertTask = useCallback((task: OfficeTask) => {
    setAllTasks((current) =>
      current.some((entry) => entry.id === task.id)
        ? current.map((entry) => (entry.id === task.id ? task : entry))
        : [task, ...current],
    );
  }, []);

  const upsertRun = useCallback((run: OfficeRun) => {
    runsRef.current = runsRef.current.some((entry) => entry.id === run.id)
      ? runsRef.current.map((entry) => (entry.id === run.id ? run : entry))
      : [run, ...runsRef.current];
    setAllRuns((current) =>
      current.some((entry) => entry.id === run.id)
        ? current.map((entry) => (entry.id === run.id ? run : entry))
        : [run, ...current],
    );
  }, []);

  const loadSnapshot = useCallback(async (wid: WorkspaceId, silent: boolean) => {
    if (!officeApiEnabled) return;
    const ticket = ++syncTicket.current;
    if (!silent) setSyncState((current) => ({ ...current, status: "syncing", message: undefined }));
    try {
      const data = await fetchOffice(wid);
      if (ticket !== syncTicket.current) return;
      setAllTasks((current) => [...data.tasks, ...current.filter((task) => task.workspaceId !== wid)]);
      setAllRuns((current) => {
        const next = [...data.runs, ...current.filter((run) => run.workspaceId !== wid)];
        runsRef.current = next;
        return next;
      });
      setAllAudit((current) => [...data.activity, ...current.filter((event) => event.workspaceId !== wid)]);
      setSyncState({ status: "live", lastSyncAt: Date.now() });
    } catch (error) {
      if (ticket !== syncTicket.current) return;
      const message = apiErrorMessage(error);
      setSyncState((current) =>
        silent && current.status === "live"
          ? { ...current, error: message }
          : {
              status: "error",
              message: current.lastSyncAt
                ? `${message} Showing the last synced snapshot.`
                : `${message} Showing the demo dataset until the API is reachable.`,
              error: current.error,
              lastSyncAt: current.lastSyncAt,
            },
      );
    }
  }, []);

  const refresh = useCallback(() => loadSnapshot(workspaceId, false), [loadSnapshot, workspaceId]);

  const clearSyncError = useCallback(
    () => setSyncState((current) => ({ ...current, error: undefined })),
    [],
  );

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const workspace = workspaceById(workspaceId);
  const tasks = allTasks.filter((task) => task.workspaceId === workspaceId);
  const deals = allDeals.filter((deal) => deal.workspaceId === workspaceId);
  const posts = allPosts.filter((post) => post.workspaceId === workspaceId);
  const leads = allLeads.filter((lead) => lead.workspaceId === workspaceId);
  const briefs = allBriefs.filter((brief) => brief.workspaceId === workspaceId);
  const deliveryAnalysis = allDeliveryAnalyses.find((entry) => entry.workspaceId === workspaceId) ?? null;
  const deliveryPlan = allDeliveryPlan.filter((entry) => entry.workspaceId === workspaceId);
  const deliveryRuns = allDeliveryRuns.filter((entry) => entry.workspaceId === workspaceId);
  const clients = allClients.filter((entry) => entry.workspaceId === workspaceId);
  const projects = allProjects.filter((entry) => entry.workspaceId === workspaceId);
  const assets = allAssets.filter((entry) => entry.workspaceId === workspaceId);
  const transactions = allTransactions.filter((entry) => entry.workspaceId === workspaceId);
  const knowledgeDocs = allKnowledgeDocs.filter((entry) => entry.workspaceId === workspaceId);
  const workflows = allWorkflows.filter((entry) => entry.workspaceId === workspaceId);
  const automationExecutions = allAutomationExecutions.filter((entry) => entry.workspaceId === workspaceId);
  const runs = allRuns.filter((run) => run.workspaceId === workspaceId);
  const audit = allAudit.filter((event) => event.workspaceId === workspaceId);
  const notifications = allNotifications.filter((item) => item.workspaceId === workspaceId);
  const agents = AGENTS.filter((agent) => agent.workspaceId === workspaceId);
  const approvals = tasks.filter((task) => task.approval === "pending");
  const live = officeApiEnabled && syncState.status === "live";

  const pushAudit = (input: Omit<AuditEvent, "id" | "at" | "time">) => {
    const entry: AuditEvent = { ...input, id: uid("ev"), at: Date.now(), time: "just now" };
    setAllAudit((current) => [entry, ...current]);
  };

  const pushNotification = (input: Omit<AppNotification, "id" | "time" | "unread">) => {
    const entry: AppNotification = { ...input, id: uid("n"), time: "just now", unread: true };
    setAllNotifications((current) => [entry, ...current]);
  };

  /* ------------------------------ tasks ------------------------------ */

  const moveTask = async (id: string, status: TaskStatus): Promise<ActionResult> => {
    const task = allTasks.find((entry) => entry.id === id);
    if (!task || task.status === status) return { ok: true };

    if (live) {
      try {
        upsertTask(await patchTask(task.workspaceId, id, { status }));
        setSyncState((current) => ({ ...current, error: undefined, lastSyncAt: Date.now() }));
        void loadSnapshot(task.workspaceId, true);
        return { ok: true };
      } catch (error) {
        const message = apiErrorMessage(error);
        setSyncState((current) => ({ ...current, error: message }));
        return { ok: false, error: message };
      }
    }

    setAllTasks((current) =>
      current.map((entry) => {
        if (entry.id !== id) return entry;
        let next: OfficeTask = { ...entry, status, nextAction: nextActionFor(status) };
        if (status === "review" && entry.approval === "none") {
          const version = Math.max(entry.outputVersion, 1);
          const key = `${id}:v${version}:submitted`;
          next = {
            ...next,
            approval: "pending",
            outputVersion: version,
            outputStatus: "owner_review",
            history: hasKey(entry, key)
              ? entry.history
              : [
                  {
                    id: uid("ap"),
                    version,
                    decision: "submitted",
                    actorId: "ja",
                    actorType: "owner",
                    at: Date.now(),
                    time: "just now",
                    idempotencyKey: key,
                  },
                  ...entry.history,
                ],
          };
        }
        const approvedKey = `${id}:v${entry.outputVersion}:approved`;
        if (status === "done" && entry.approval === "pending" && !hasKey(entry, approvedKey)) {
          next = {
            ...next,
            approval: "approved",
            outputStatus: "approved",
            nextAction: nextActionFor("done"),
            history: [taskApprovalRecord(entry, "approved", "Approved from the board."), ...next.history],
          };
        }
        return next;
      }),
    );

    pushAudit({
      workspaceId: task.workspaceId,
      entityType: "task",
      entityId: id,
      taskId: id,
      actorType: "owner",
      actorId: "ja",
      action: `Moved task to ${statusLabel[status]}`,
      result: "ok",
      meta: task.title,
    });
    return { ok: true };
  };

  const toggleTask = async (id: string): Promise<ActionResult> => {
    const task = allTasks.find((entry) => entry.id === id);
    if (!task) return { ok: false, error: "Task not found." };
    const reopening = task.status === "done";
    const nextStatus: TaskStatus = reopening ? "backlog" : "done";

    if (live) {
      try {
        upsertTask(await patchTask(task.workspaceId, id, { status: nextStatus }));
        setSyncState((current) => ({ ...current, error: undefined, lastSyncAt: Date.now() }));
        void loadSnapshot(task.workspaceId, true);
        return { ok: true };
      } catch (error) {
        const message = apiErrorMessage(error);
        setSyncState((current) => ({ ...current, error: message }));
        return { ok: false, error: message };
      }
    }

    setAllTasks((current) =>
      current.map((entry) => {
        if (entry.id !== id) return entry;
        if (reopening) return { ...entry, status: nextStatus, nextAction: nextActionFor(nextStatus) };
        const key = `${id}:v${entry.outputVersion}:approved`;
        return {
          ...entry,
          status: nextStatus,
          nextAction: nextActionFor(nextStatus),
          approval: entry.approval === "pending" && !hasKey(entry, key) ? "approved" : entry.approval,
          outputStatus: entry.approval === "pending" ? "approved" : entry.outputStatus,
          history:
            entry.approval === "pending" && !hasKey(entry, key)
              ? [taskApprovalRecord(entry, "approved", "Completed from the task list."), ...entry.history]
              : entry.history,
        };
      }),
    );
    pushAudit({
      workspaceId: task.workspaceId,
      entityType: "task",
      entityId: id,
      taskId: id,
      actorType: "owner",
      actorId: "ja",
      action: reopening ? "Reopened task" : "Marked task complete",
      result: "ok",
      meta: task.title,
    });
    return { ok: true };
  };

  const addTask = async (input: NewTaskInput): Promise<ActionResult> => {
    if (live) {
      try {
        upsertTask(await createTaskOnServer(workspaceId, { ...input }));
        void loadSnapshot(workspaceId, true);
        return { ok: true };
      } catch (error) {
        return { ok: false, error: apiErrorMessage(error) };
      }
    }

    const task: OfficeTask = {
      ...input,
      id: uid("t"),
      workspaceId,
      board: "Studio delivery",
      brief: `New work for ${input.project}. Add acceptance criteria and evidence before submitting for approval.`,
      acceptance: ["Brief confirmed", "Evidence attached where claims are made", "Owner approval before external action"],
      nextAction: nextActionFor(input.status),
      approval: "none",
      outputVersion: 0,
      outputStatus: "draft",
      limitations: [],
      evidence: [],
      comments: [],
      history: [],
    };
    setAllTasks((current) => [task, ...current]);
    pushAudit({
      workspaceId,
      entityType: "task",
      entityId: task.id,
      taskId: task.id,
      actorType: "owner",
      actorId: "ja",
      action: "Created task",
      result: "ok",
      meta: `${task.title} · ${task.project}`,
    });
    return { ok: true };
  };

  const assignTask = async (id: string, ownerId: string): Promise<ActionResult> => {
    const task = allTasks.find((entry) => entry.id === id);
    if (!task) return { ok: false, error: "Task not found." };

    if (live) {
      try {
        upsertTask(await patchTask(task.workspaceId, id, { ownerId }));
        void loadSnapshot(task.workspaceId, true);
        return { ok: true };
      } catch (error) {
        return { ok: false, error: apiErrorMessage(error) };
      }
    }

    const owner = TEAM.find((member) => member.id === ownerId);
    setAllTasks((current) => current.map((entry) => (entry.id === id ? { ...entry, ownerId } : entry)));
    pushAudit({
      workspaceId: task.workspaceId,
      entityType: "task",
      entityId: id,
      taskId: id,
      actorType: "owner",
      actorId: "ja",
      action: "Reassigned task",
      result: "ok",
      meta: `${task.title} → ${owner?.name ?? ownerId}`,
    });
    return { ok: true };
  };

  const submitTask = async (id: string): Promise<ActionResult> => {
    const task = allTasks.find((entry) => entry.id === id);
    if (!task) return { ok: false, error: "Task not found." };
    if (task.approval === "pending") return { ok: false, error: "This version is already waiting for review." };

    if (live) {
      try {
        upsertTask(await patchTask(task.workspaceId, id, { status: "review" }));
        void loadSnapshot(task.workspaceId, true);
        return { ok: true };
      } catch (error) {
        return { ok: false, error: apiErrorMessage(error) };
      }
    }

    const version = task.outputVersion + 1;
    const key = `${id}:v${version}:submitted`;
    if (hasKey(task, key)) return { ok: false, duplicate: true, error: "This version was already submitted." };
    setAllTasks((current) =>
      current.map((entry) =>
        entry.id === id
          ? {
              ...entry,
              status: "review",
              approval: "pending",
              outputVersion: version,
              outputStatus: "owner_review",
              nextAction: `Owner review of output v${version}.`,
              history: [
                {
                  id: uid("ap"),
                  version,
                  decision: "submitted",
                  actorId: "ja",
                  actorType: "owner",
                  at: Date.now(),
                  time: "just now",
                  idempotencyKey: key,
                },
                ...entry.history,
              ],
            }
          : entry,
      ),
    );
    pushAudit({
      workspaceId: task.workspaceId,
      entityType: "approval",
      entityId: id,
      taskId: id,
      actorType: "owner",
      actorId: "ja",
      action: `Submitted output v${version} for review`,
      result: "pending",
      meta: task.title,
    });
    return { ok: true };
  };

  const decideTask = async (
    id: string,
    decision: "approved" | "changes_requested" | "rejected",
    comment: string,
  ): Promise<ActionResult> => {
    const task = allTasks.find((entry) => entry.id === id);
    if (!task) return { ok: false, error: "Task not found." };
    if (task.approval !== "pending" && task.status !== "review") {
      return { ok: false, error: "There is no pending approval for this task." };
    }
    const trimmed = comment.trim();
    if (decision !== "approved" && !trimmed) {
      return { ok: false, error: "A short reason is required to request changes or reject." };
    }
    const key = `${id}:v${task.outputVersion}:${decision}`;
    if (hasKey(task, key)) {
      return { ok: false, duplicate: true, error: "This version already has that decision." };
    }

    if (live) {
      try {
        upsertTask(await decideApproval(task.workspaceId, id, task.outputVersion, decision, trimmed));
        if (decision === "approved") {
          setAllNotifications((current) =>
            current.map((item) =>
              item.href === `/tasks?task=${id}` ? { ...item, unread: false } : item,
            ),
          );
        }
        void loadSnapshot(task.workspaceId, true);
        return { ok: true };
      } catch (error) {
        return { ok: false, error: apiErrorMessage(error) };
      }
    }

    const record = taskApprovalRecord(task, decision, trimmed);
    const nextStatus: TaskStatus = decision === "approved" ? "done" : decision === "rejected" ? "backlog" : "in_progress";
    setAllTasks((current) =>
      current.map((entry) =>
        entry.id === id
          ? {
              ...entry,
              status: nextStatus,
              approval: decision,
              outputStatus:
                decision === "approved" ? "approved" : decision === "changes_requested" ? "draft" : "rejected",
              nextAction:
                decision === "approved"
                  ? "Approved — schedule from the content queue and publish explicitly."
                  : decision === "changes_requested"
                    ? "Apply the requested changes, then submit a new version."
                    : "Revise the brief before resubmitting.",
              subtasksDone: decision === "approved" ? entry.subtasksTotal : entry.subtasksDone,
              history: [record, ...entry.history],
            }
          : entry,
      ),
    );
    pushAudit({
      workspaceId: task.workspaceId,
      entityType: "approval",
      entityId: id,
      taskId: id,
      actorType: "owner",
      actorId: "ja",
      action: `Approval decision: ${APPROVAL_META[decision].label}`,
      result: "ok",
      meta: `${task.title} · v${task.outputVersion}${trimmed ? ` · ${trimmed}` : ""}`,
    });
    if (decision === "approved") {
      setAllNotifications((current) =>
        current.map((item) =>
          item.href === `/tasks?task=${id}` ? { ...item, unread: false } : item,
        ),
      );
    }
    return { ok: true };
  };

  const addTaskComment = (id: string, body: string): ActionResult => {
    if (live) return { ok: false, error: "Task comments are not stored by the workspace API yet." };
    const task = allTasks.find((entry) => entry.id === id);
    const trimmed = body.trim();
    if (!task || !trimmed) return { ok: false, error: "Write a comment first." };
    setAllTasks((current) =>
      current.map((entry) =>
        entry.id === id
          ? {
              ...entry,
              comments: [
                { id: uid("cm"), authorId: "ja", body: trimmed, time: "just now" },
                ...entry.comments,
              ],
            }
          : entry,
      ),
    );
    pushAudit({
      workspaceId: task.workspaceId,
      entityType: "task",
      entityId: id,
      taskId: id,
      actorType: "owner",
      actorId: "ja",
      action: "Comment added",
      result: "ok",
      meta: trimmed.slice(0, 80),
    });
    return { ok: true };
  };

  /* ------------------------------ deals ------------------------------ */

  const moveDeal = (id: string, stage: DealStage) => {
    const deal = allDeals.find((entry) => entry.id === id);
    if (!deal || deal.stage === stage) return;
    setAllDeals((current) => current.map((entry) => (entry.id === id ? { ...entry, stage } : entry)));
    pushAudit({
      workspaceId: deal.workspaceId,
      entityType: "deal",
      entityId: id,
      actorType: "owner",
      actorId: "ja",
      action: `Moved deal to ${stageLabel[stage]}`,
      result: "ok",
      meta: `${deal.company} · ${deal.title}`,
    });
  };

  const addDeal = (deal: Omit<Deal, "id">) => {
    const created: OfficeDeal = { ...deal, id: uid("d"), workspaceId };
    setAllDeals((current) => [created, ...current]);
    pushAudit({
      workspaceId,
      entityType: "deal",
      entityId: created.id,
      actorType: "owner",
      actorId: "ja",
      action: "Created deal",
      result: "ok",
      meta: `${created.company} · ${created.title}`,
    });
  };

  const addLead = (lead: Omit<OfficeLead, "id" | "workspaceId">) => {
    const created: OfficeLead = { ...lead, id: uid("l"), workspaceId };
    setAllLeads((current) => [created, ...current]);
    pushAudit({
      workspaceId,
      entityType: "lead",
      entityId: created.id,
      actorType: "owner",
      actorId: "ja",
      action: "Added lead",
      result: "ok",
      meta: `${created.name} · ${created.company}`,
    });
  };

  /* ------------------------------ briefs ----------------------------- */

  const addBrief: AppStore["addBrief"] = ({ source, client, project, contact, raw }) => {
    const extraction = extractBriefScope(raw);
    const id = uid("br");
    const brief: Brief = {
      id,
      workspaceId,
      source,
      client: client.trim(),
      project: project.trim(),
      contact: contact?.trim() || undefined,
      raw: raw.trim(),
      deliverables: extraction.deliverables.map((title, index) => ({ id: `${id}-d${index + 1}`, title })),
      deadline: extraction.deadline,
      budget: extraction.budget,
      questions: extraction.questions,
      confidence: extraction.confidence,
      limitations: extraction.limitations,
      agentId: briefAgentFor(workspaceId),
      createdAt: new Date().toISOString(),
      taskIds: [],
    };
    setAllBriefs((current) => [brief, ...current]);
    pushAudit({
      workspaceId,
      entityType: "brief",
      entityId: id,
      actorType: "agent",
      actorId: brief.agentId,
      action: "Brief received · scope extracted",
      result: extraction.questions.length > 0 ? "pending" : "ok",
      meta: `${brief.client} · ${brief.project} · ${brief.deliverables.length} deliverable${brief.deliverables.length === 1 ? "" : "s"}`,
    });
    if (extraction.questions.length === 0) {
      pushNotification({
        workspaceId,
        title: "Brief ready for scope approval",
        description: `${brief.client} · ${brief.project}`,
        kind: "approval",
        href: `/briefs?brief=${id}`,
      });
    }
    return id;
  };

  const answerBriefQuestion = (id: string, field: BriefField, value: string): ActionResult => {
    const brief = allBriefs.find((entry) => entry.id === id && entry.workspaceId === workspaceId);
    if (!brief) return { ok: false, error: "Brief not found in this workspace." };
    if (brief.approvedAt) return { ok: false, error: "The scope is already approved and locked." };
    const question = brief.questions.find((entry) => entry.field === field);
    if (!question) return { ok: false, error: "That question is no longer open." };

    let deliverables = brief.deliverables;
    let deadline = brief.deadline;
    let budget = brief.budget;

    if (field === "deliverables") {
      const titles = splitDeliverables(value);
      if (titles.length === 0) return { ok: false, error: "List at least one deliverable." };
      const existing = new Set(deliverables.map((item) => item.title.toLowerCase()));
      const additions = titles
        .filter((title) => !existing.has(title.toLowerCase()))
        .map((title) => ({ id: uid("bd"), title }));
      if (additions.length === 0) return { ok: false, error: "That deliverable is already in scope." };
      deliverables = [...deliverables, ...additions];
    }

    if (field === "deadline") {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(value))) {
        return { ok: false, error: "Choose a valid deadline date." };
      }
      deadline = value;
    }

    if (field === "budget") {
      const parsed = parseBudgetAnswer(value);
      if (parsed === undefined) return { ok: false, error: "Enter a valid budget amount." };
      budget = parsed;
    }

    const questions = brief.questions.filter((entry) => entry.id !== question.id);
    setAllBriefs((current) =>
      current.map((entry) =>
        entry.id === id ? { ...entry, deliverables, deadline, budget, questions } : entry,
      ),
    );
    pushAudit({
      workspaceId,
      entityType: "brief",
      entityId: id,
      actorType: "owner",
      actorId: "ja",
      action: `Answered scope question · ${field}`,
      result: "ok",
      meta: `${brief.client} · ${brief.project}`,
    });
    if (questions.length === 0) {
      pushNotification({
        workspaceId,
        title: "Brief ready for scope approval",
        description: `${brief.client} · ${brief.project}`,
        kind: "approval",
        href: `/briefs?brief=${id}`,
      });
    }
    return { ok: true };
  };

  const addBriefDeliverable = (id: string, title: string): ActionResult => {
    const brief = allBriefs.find((entry) => entry.id === id && entry.workspaceId === workspaceId);
    if (!brief) return { ok: false, error: "Brief not found in this workspace." };
    if (brief.approvedAt) return { ok: false, error: "The scope is already approved and locked." };
    const trimmed = title.trim();
    if (!trimmed) return { ok: false, error: "Name the deliverable first." };
    if (brief.deliverables.some((item) => item.title.toLowerCase() === trimmed.toLowerCase())) {
      return { ok: false, error: "That deliverable is already in scope." };
    }
    setAllBriefs((current) =>
      current.map((entry) =>
        entry.id === id
          ? {
              ...entry,
              deliverables: [...entry.deliverables, { id: uid("bd"), title: trimmed }],
              questions: entry.questions.filter((question) => question.field !== "deliverables"),
            }
          : entry,
      ),
    );
    pushAudit({
      workspaceId,
      entityType: "brief",
      entityId: id,
      actorType: "owner",
      actorId: "ja",
      action: "Added deliverable to scope",
      result: "ok",
      meta: `${brief.client} · ${trimmed}`,
    });
    return { ok: true };
  };

  const removeBriefDeliverable = (id: string, deliverableId: string) => {
    const brief = allBriefs.find((entry) => entry.id === id && entry.workspaceId === workspaceId);
    if (!brief || brief.approvedAt) return;
    const removed = brief.deliverables.find((item) => item.id === deliverableId);
    const deliverables = brief.deliverables.filter((item) => item.id !== deliverableId);
    const needsQuestion =
      deliverables.length === 0 && !brief.questions.some((question) => question.field === "deliverables");
    setAllBriefs((current) =>
      current.map((entry) =>
        entry.id === id
          ? {
              ...entry,
              deliverables,
              questions: needsQuestion
                ? [
                    ...entry.questions,
                    {
                      id: "q-deliverables",
                      field: "deliverables",
                      question: "What exactly should we deliver?",
                      hint: "List the outputs, separated by commas.",
                    },
                  ]
                : entry.questions,
            }
          : entry,
      ),
    );
    pushAudit({
      workspaceId,
      entityType: "brief",
      entityId: id,
      actorType: "owner",
      actorId: "ja",
      action: "Removed deliverable from scope",
      result: "ok",
      meta: `${brief.client}${removed ? ` · ${removed.title}` : ""}`,
    });
  };

  const approveBriefScope = (id: string): ActionResult => {
    const brief = allBriefs.find((entry) => entry.id === id && entry.workspaceId === workspaceId);
    if (!brief) return { ok: false, error: "Brief not found in this workspace." };
    if (brief.approvedAt) return { ok: false, duplicate: true, error: "This scope was already approved." };
    if (briefStatus(brief) !== "ready") {
      return { ok: false, error: "Answer the open questions before approving the scope." };
    }
    if (!brief.deadline || brief.budget === undefined || brief.deliverables.length === 0) {
      return { ok: false, error: "Deliverables, deadline and budget are required for approval." };
    }

    const due = brief.deadline;
    const createdTasks: OfficeTask[] = brief.deliverables.map((deliverable) => ({
      id: uid("t"),
      workspaceId,
      title: deliverable.title,
      project: brief.project,
      priority: "high",
      status: "backlog",
      due,
      ownerId: ownerForDeliverable(deliverable.title),
      tags: [tagForDeliverable(deliverable.title)],
      subtasksDone: 0,
      subtasksTotal: 3,
      board: "Studio delivery",
      brief: `Approved scope from ${brief.client}: ${brief.raw}`,
      acceptance: [
        "Scope approved by owner",
        `${deliverable.title} delivered`,
        "Evidence attached before submission",
      ],
      nextAction: "Confirm the approved scope and draft the first output.",
      approval: "none",
      outputVersion: 0,
      outputStatus: "draft",
      limitations: [],
      evidence: [],
      comments: [],
      history: [],
      assignedAgentId: brief.agentId,
    }));

    setAllBriefs((current) =>
      current.map((entry) =>
        entry.id === id
          ? {
              ...entry,
              approvedAt: new Date().toISOString(),
              taskIds: createdTasks.map((task) => task.id),
            }
          : entry,
      ),
    );
    setAllTasks((current) => [...createdTasks, ...current]);
    pushAudit({
      workspaceId,
      entityType: "approval",
      entityId: id,
      actorType: "owner",
      actorId: "ja",
      action: "Approved brief scope",
      result: "ok",
      meta: `${brief.client} · ${brief.project} · ${createdTasks.length} task${createdTasks.length === 1 ? "" : "s"} created`,
    });
    pushNotification({
      workspaceId,
      title: "Scope approved",
      description: `${brief.client} · ${createdTasks.length} production task${createdTasks.length === 1 ? "" : "s"} created`,
      kind: "task",
      href: "/tasks",
    });
    return { ok: true };
  };

  /* ---------------------------- delivery ----------------------------- */

  const runDeliveryAnalysis = (): ActionResult => {
    if (allDeliveryAnalyses.some((entry) => entry.workspaceId === workspaceId)) {
      return { ok: false, duplicate: true, error: "An analysis already exists in this workspace." };
    }
    const analysis = buildDeliveryAnalysis(workspaceId);
    setAllDeliveryAnalyses((current) => [...current, analysis]);
    pushAudit({
      workspaceId,
      entityType: "delivery",
      entityId: analysis.id,
      actorType: "agent",
      actorId: agents[0]?.id ?? "nova",
      action: "Analysis mode complete · PRD gap review",
      result: "ok",
      meta: `${analysis.findings.length} findings · ${PRD_MODULES.length} PRD modules · local repo snapshot`,
    });
    return { ok: true };
  };

  const draftDeliveryPlan = (): ActionResult => {
    if (!allDeliveryAnalyses.some((entry) => entry.workspaceId === workspaceId)) {
      return { ok: false, error: "Run the analysis before drafting a plan." };
    }
    if (allDeliveryPlan.some((entry) => entry.workspaceId === workspaceId)) {
      return { ok: false, duplicate: true, error: "A plan is already drafted in this workspace." };
    }
    const items = buildDeliveryPlan(workspaceId);
    setAllDeliveryPlan((current) => [...current, ...items]);
    pushAudit({
      workspaceId,
      entityType: "delivery",
      entityId: `plan-${workspaceId}`,
      actorType: "agent",
      actorId: agents[0]?.id ?? "nova",
      action: "Planning mode complete · dependency-ordered plan",
      result: "ok",
      meta: `${items.length} items · migration, API contract and acceptance per item`,
    });
    return { ok: true };
  };

  const approveDeliveryPlan = (ids: string[]): ActionResult => {
    const analysis = allDeliveryAnalyses.find((entry) => entry.workspaceId === workspaceId);
    if (!analysis) return { ok: false, error: "Run the analysis before approving a plan." };
    const plan = allDeliveryPlan.filter((entry) => entry.workspaceId === workspaceId);
    const eligible = plan.filter(
      (item) => ids.includes(item.id) && item.status === "queued" && dependencyReady(item, plan),
    );
    if (eligible.length === 0) {
      return { ok: false, error: "No eligible items. Approve the dependencies first." };
    }

    const due = new Date(Date.now() + 14 * 86_400_000).toISOString().slice(0, 10);
    const created: { item: DeliveryPlanItem; task: OfficeTask }[] = eligible.map((item) => ({
      item,
      task: {
        id: uid("t"),
        workspaceId,
        title: `${item.moduleId} · ${item.title}`,
        project: `Product build · ${workspace.name}`,
        priority: "high",
        status: "backlog",
        due,
        ownerId: deliveryOwnerFor(item.area),
        tags: Array.from(new Set(["delivery", item.area.toLowerCase()])),
        subtasksDone: 0,
        subtasksTotal: item.acceptance.length,
        board: "Studio delivery",
        brief: `${item.migration}. API: ${item.api.join(", ")}.`,
        acceptance: item.acceptance,
        nextAction: "Implement the migration, then the API contract, then the UI.",
        approval: "none",
        outputVersion: 0,
        outputStatus: "draft",
        limitations: [],
        evidence: [],
        comments: [],
        history: [],
        assignedAgentId: agents[0]?.id,
      },
    }));

    setAllTasks((current) => [...created.map((entry) => entry.task), ...current]);
    setAllDeliveryPlan((current) =>
      current.map((item) => {
        const match = created.find((entry) => entry.item.id === item.id);
        return match ? { ...item, status: "approved", taskIds: [...item.taskIds, match.task.id] } : item;
      }),
    );
    created.forEach((entry) =>
      pushAudit({
        workspaceId,
        entityType: "task",
        entityId: entry.task.id,
        taskId: entry.task.id,
        actorType: "owner",
        actorId: "ja",
        action: "Created delivery task",
        result: "ok",
        meta: `${entry.task.title} · ${entry.task.project}`,
      }),
    );
    pushAudit({
      workspaceId,
      entityType: "delivery",
      entityId: `plan-${workspaceId}`,
      actorType: "owner",
      actorId: "ja",
      action: `Plan approved · ${created.length} task${created.length === 1 ? "" : "s"} created`,
      result: "ok",
      meta: eligible.map((item) => item.moduleId).join(" · "),
    });
    pushNotification({
      workspaceId,
      title: "Delivery plan approved",
      description: `${created.length} module task${created.length === 1 ? "" : "s"} added to the backlog.`,
      kind: "approval",
      href: "/tasks",
    });
    return { ok: true };
  };

  const startDeliveryRun = (itemId: string): { ok: boolean; runId?: string; error?: string } => {
    const item = allDeliveryPlan.find((entry) => entry.id === itemId && entry.workspaceId === workspaceId);
    if (!item) return { ok: false, error: "Plan item not found in this workspace." };
    if (item.status !== "approved") {
      return { ok: false, error: "Approve this plan item before implementation starts." };
    }
    if (allDeliveryRuns.some((run) => run.planItemId === itemId && run.state !== "validated")) {
      return { ok: false, error: "A run is already active for this plan item." };
    }

    const run = createDeliveryRun(workspaceId, item);
    setAllDeliveryRuns((current) => [run, ...current]);
    setAllDeliveryPlan((current) =>
      current.map((entry) => (entry.id === itemId ? { ...entry, status: "running" } : entry)),
    );
    pushAudit({
      workspaceId,
      entityType: "delivery",
      entityId: run.id,
      actorType: "agent",
      actorId: agents[0]?.id ?? "nova",
      action: `Implementation started · ${item.moduleId}`,
      result: "pending",
      meta: `${item.title} · simulated run`,
    });

    window.setTimeout(() => {
      setAllDeliveryRuns((current) =>
        current.map((entry) => (entry.id === run.id && entry.state === "running" ? completeDeliveryRun(entry, item) : entry)),
      );
      setAllDeliveryPlan((current) =>
        current.map((entry) => (entry.id === itemId ? { ...entry, status: "in_review" } : entry)),
      );
      pushAudit({
        workspaceId,
        entityType: "delivery",
        entityId: run.id,
        actorType: "agent",
        actorId: agents[0]?.id ?? "nova",
        action: `Output ready · ${item.moduleId}`,
        result: "pending",
        meta: "Waiting for owner PRD validation",
      });
      pushNotification({
        workspaceId,
        title: "Validation needed — delivery",
        description: `${item.title} is ready for PRD validation.`,
        kind: "approval",
        href: "/delivery?mode=implementation",
      });
    }, 1600);

    return { ok: true, runId: run.id };
  };

  const validateDeliveryRun = (runId: string, note?: string): ActionResult => {
    const run = allDeliveryRuns.find((entry) => entry.id === runId && entry.workspaceId === workspaceId);
    if (!run) return { ok: false, error: "Delivery run not found in this workspace." };
    if (run.state !== "awaiting_validation") {
      return { ok: false, error: "This run is not waiting for validation." };
    }
    const trimmed = note?.trim();
    setAllDeliveryRuns((current) =>
      current.map((entry) =>
        entry.id === runId
          ? {
              ...entry,
              state: "validated",
              validatedAt: Date.now(),
              validationNote: trimmed || "Validated by owner against PRD acceptance criteria.",
            }
          : entry,
      ),
    );
    setAllDeliveryPlan((current) =>
      current.map((entry) => (entry.id === run.planItemId ? { ...entry, status: "validated" } : entry)),
    );
    pushAudit({
      workspaceId,
      entityType: "delivery",
      entityId: run.id,
      actorType: "owner",
      actorId: "ja",
      action: `Validated against PRD · ${run.moduleId}`,
      result: "ok",
      meta: `${run.title}${trimmed ? ` · ${trimmed}` : ""}`,
    });
    pushNotification({
      workspaceId,
      title: "Module validated",
      description: `${run.title} passed owner validation.`,
      kind: "ai",
      href: "/delivery?mode=implementation",
    });
    return { ok: true };
  };

  /* ------------------------------ clients ---------------------------- */

  const convertLeadToClient = (
    leadId: string,
  ): { ok: boolean; error?: string; clientId?: string } => {
    const lead = allLeads.find((entry) => entry.id === leadId && entry.workspaceId === workspaceId);
    if (!lead) return { ok: false, error: "Lead not found in this workspace." };
    const existing = allClients.find(
      (entry) =>
        entry.workspaceId === workspaceId &&
        (entry.leadId === lead.id || entry.company.toLowerCase() === lead.company.toLowerCase()),
    );
    if (existing) {
      return { ok: false, error: `${lead.company} is already a client in this workspace.`, clientId: existing.id };
    }

    const clientId = uid("cl");
    const created: Client = {
      id: clientId,
      workspaceId,
      name: lead.name,
      company: lead.company,
      email: lead.email,
      phone: lead.phone,
      address: lead.location,
      industry: lead.tags[0] ?? "Design",
      status: "onboarding",
      ownerId: lead.ownerId,
      since: dateAt(0),
      notes: lead.notes,
      portalEnabled: true,
      leadId: lead.id,
    };
    setAllClients((current) => [created, ...current]);
    setAllLeads((current) =>
      current.map((entry) => (entry.id === lead.id ? { ...entry, status: "customer", lastActivity: "Converted to client" } : entry)),
    );

    const existingDeal = allDeals.find(
      (entry) => entry.workspaceId === workspaceId && entry.company.toLowerCase() === lead.company.toLowerCase(),
    );
    if (!existingDeal) {
      const createdDeal: OfficeDeal = {
        id: uid("d"),
        workspaceId,
        company: lead.company,
        title: lead.tags[0] ? `${lead.tags[0]} engagement` : "New engagement",
        value: lead.value,
        stage: "qualified",
        contact: lead.name,
        ownerId: lead.ownerId,
        score: lead.score,
        due: dateAt(14),
        tags: lead.tags,
        source: lead.source,
      };
      setAllDeals((current) => [createdDeal, ...current]);
      pushAudit({
        workspaceId,
        entityType: "deal",
        entityId: createdDeal.id,
        actorType: "owner",
        actorId: "ja",
        action: "Created deal from converted lead",
        result: "ok",
        meta: `${lead.company} · ${money(createdDeal.value)}`,
      });
    }

    pushAudit({
      workspaceId,
      entityType: "client",
      entityId: clientId,
      actorType: "owner",
      actorId: "ja",
      action: "Converted lead to client",
      result: "ok",
      meta: `${lead.name} · ${lead.company} · portal enabled`,
    });
    pushNotification({
      workspaceId,
      title: "New client created",
      description: `${lead.company} is onboarding. Project and portal access can be set up next.`,
      kind: "deal",
      href: `/clients?client=${clientId}`,
    });
    return { ok: true, clientId };
  };

  const addClient: AppStore["addClient"] = (input) => {
    const name = input.name.trim();
    if (!name) return { ok: false, error: "A contact name is required." };
    const company = input.company.trim() || "Independent";
    if (allClients.some((entry) => entry.workspaceId === workspaceId && entry.company.toLowerCase() === company.toLowerCase())) {
      return { ok: false, duplicate: true, error: `${company} already exists in this workspace.` };
    }
    const clientId = uid("cl");
    const created: Client = {
      id: clientId,
      workspaceId,
      name,
      company,
      email: input.email.trim() || `${name.split(" ")[0].toLowerCase()}@example.com`,
      phone: "—",
      address: "—",
      industry: input.industry.trim() || "Design",
      status: "onboarding",
      ownerId: "ja",
      since: dateAt(0),
      notes: input.notes.trim() || "Created manually. Portal access is off until the owner enables it.",
      portalEnabled: false,
    };
    setAllClients((current) => [created, ...current]);
    pushAudit({
      workspaceId,
      entityType: "client",
      entityId: clientId,
      actorType: "owner",
      actorId: "ja",
      action: "Created client",
      result: "ok",
      meta: `${name} · ${company} · portal off`,
    });
    return { ok: true };
  };

  /* ------------------------------ projects --------------------------- */

  const createProject: AppStore["createProject"] = (input) => {
    const name = input.name.trim();
    if (!name) return { ok: false, error: "Give the project a name." };
    if (!allClients.some((entry) => entry.id === input.clientId && entry.workspaceId === workspaceId)) {
      return { ok: false, error: "Choose a client from this workspace." };
    }
    if (allProjects.some((entry) => entry.workspaceId === workspaceId && entry.name.toLowerCase() === name.toLowerCase())) {
      return { ok: false, duplicate: true, error: "A project with that name already exists." };
    }
    if (input.budget <= 0) return { ok: false, error: "Budget must be greater than zero." };
    if (!input.deadline) return { ok: false, error: "A deadline is required." };

    const id = uid("pr");
    const created: Project = {
      id,
      workspaceId,
      name,
      clientId: input.clientId,
      description: input.description.trim() || "Scope will be refined during planning.",
      type: input.type.trim() || "Design",
      managerId: input.managerId,
      startDate: input.startDate || dateAt(0),
      deadline: input.deadline,
      budget: input.budget,
      status: "planning",
      teamIds: [input.managerId],
      feedback: [],
    };
    setAllProjects((current) => [created, ...current]);
    pushAudit({
      workspaceId,
      entityType: "project",
      entityId: id,
      actorType: "owner",
      actorId: "ja",
      action: "Created project",
      result: "ok",
      meta: `${name} · ${money(created.budget)}`,
    });
    return { ok: true };
  };

  const createProjectFromDeal = (dealId: string): ActionResult => {
    const deal = allDeals.find((entry) => entry.id === dealId && entry.workspaceId === workspaceId);
    if (!deal) return { ok: false, error: "Deal not found in this workspace." };
    if (deal.stage !== "won") return { ok: false, error: "Only won deals can become projects." };
    if (allProjects.some((entry) => entry.workspaceId === workspaceId && entry.dealId === deal.id)) {
      return { ok: false, duplicate: true, error: "This won deal already has a project." };
    }

    let client = allClients.find(
      (entry) => entry.workspaceId === workspaceId && entry.company.toLowerCase() === deal.company.toLowerCase(),
    );
    if (!client) {
      const clientId = uid("cl");
      client = {
        id: clientId,
        workspaceId,
        name: deal.contact,
        company: deal.company,
        email: "—",
        phone: "—",
        address: "—",
        industry: deal.tags[0] ?? "Design",
        status: "active",
        ownerId: deal.ownerId,
        since: dateAt(0),
        notes: "Client record created when the deal was converted to a project.",
        portalEnabled: true,
      };
      setAllClients((current) => [client as Client, ...current]);
      pushAudit({
        workspaceId,
        entityType: "client",
        entityId: client.id,
        actorType: "owner",
        actorId: "ja",
        action: "Created client from won deal",
        result: "ok",
        meta: deal.company,
      });
    }

    const id = uid("pr");
    const created: Project = {
      id,
      workspaceId,
      name: deal.company,
      clientId: client.id,
      dealId: deal.id,
      description: `${deal.title}. Created from a won deal — the deal value is a contract reference, not a cash transaction.`,
      type: deal.tags[0] ?? "Design",
      managerId: deal.ownerId,
      startDate: dateAt(0),
      deadline: dateAt(30),
      budget: deal.value,
      status: "planning",
      teamIds: [deal.ownerId],
      feedback: [],
    };
    setAllProjects((current) => [created, ...current]);
    pushAudit({
      workspaceId,
      entityType: "project",
      entityId: id,
      actorType: "owner",
      actorId: "ja",
      action: "Created project from won deal",
      result: "ok",
      meta: `${deal.company} · ${money(deal.value)}`,
    });
    pushNotification({
      workspaceId,
      title: "Project created from deal",
      description: `${deal.company} is ready for planning. The deal value is not counted as cash.`,
      kind: "deal",
      href: `/projects?project=${id}`,
    });
    return { ok: true };
  };

  const updateProjectStatus = (id: string, status: ProjectStatus): ActionResult => {
    const project = allProjects.find((entry) => entry.id === id && entry.workspaceId === workspaceId);
    if (!project) return { ok: false, error: "Project not found in this workspace." };
    if (project.status === status) return { ok: false, duplicate: true, error: "That status is already set." };
    setAllProjects((current) =>
      current.map((entry) => (entry.id === id ? { ...entry, status } : entry)),
    );
    pushAudit({
      workspaceId,
      entityType: "project",
      entityId: id,
      actorType: "owner",
      actorId: "ja",
      action: `Project moved to ${status.replace("_", " ")}`,
      result: "ok",
      meta: project.name,
    });
    return { ok: true };
  };

  /* ------------------------------ studio ----------------------------- */

  const submitAssetForReview = (id: string): ActionResult => {
    const asset = allAssets.find((entry) => entry.id === id && entry.workspaceId === workspaceId);
    if (!asset) return { ok: false, error: "Asset not found in this workspace." };
    if (!["brief", "production", "revision"].includes(asset.status)) {
      return { ok: false, error: "This asset is not in production." };
    }
    setAllAssets((current) =>
      current.map((entry) =>
        entry.id === id ? { ...entry, status: "internal_review", updatedAt: "just now" } : entry,
      ),
    );
    pushAudit({
      workspaceId,
      entityType: "asset",
      entityId: id,
      actorType: "operator",
      actorId: "ja",
      action: `Submitted ${asset.name} for internal review`,
      result: "pending",
      meta: `v${asset.currentVersion}`,
    });
    return { ok: true };
  };

  const sendAssetToClient = (id: string): ActionResult => {
    const asset = allAssets.find((entry) => entry.id === id && entry.workspaceId === workspaceId);
    if (!asset) return { ok: false, error: "Asset not found in this workspace." };
    if (asset.status !== "internal_review") {
      return { ok: false, error: "Internal review must pass before an asset goes to the client." };
    }
    setAllAssets((current) =>
      current.map((entry) =>
        entry.id === id ? { ...entry, status: "client_review", updatedAt: "just now" } : entry,
      ),
    );
    pushAudit({
      workspaceId,
      entityType: "asset",
      entityId: id,
      actorType: "owner",
      actorId: "ja",
      action: `Sent ${asset.name} to client review`,
      result: "pending",
      meta: `v${asset.currentVersion} · client approval required`,
    });
    pushNotification({
      workspaceId,
      title: "Client approval requested",
      description: `${asset.name} v${asset.currentVersion} is waiting for the client.`,
      kind: "approval",
      href: `/studio?asset=${id}`,
    });
    return { ok: true };
  };

  const approveAsset = (id: string): ActionResult => {
    const asset = allAssets.find((entry) => entry.id === id && entry.workspaceId === workspaceId);
    if (!asset) return { ok: false, error: "Asset not found in this workspace." };
    if (asset.status !== "client_review") {
      return { ok: false, error: "Only assets in client review can be approved." };
    }
    setAllAssets((current) =>
      current.map((entry) =>
        entry.id === id
          ? {
              ...entry,
              status: "approved",
              updatedAt: "just now",
              feedback: [
                {
                  id: uid("fb"),
                  author: "Client (recorded by owner)",
                  body: `Approved v${entry.currentVersion} in the demo client portal.`,
                  time: "just now",
                  kind: "client",
                },
                ...entry.feedback,
              ],
            }
          : entry,
      ),
    );
    pushAudit({
      workspaceId,
      entityType: "asset",
      entityId: id,
      actorType: "owner",
      actorId: "ja",
      action: `Recorded client approval · ${asset.name}`,
      result: "ok",
      meta: `v${asset.currentVersion}`,
    });
    return { ok: true };
  };

  const requestAssetRevision = (id: string, note: string): ActionResult => {
    const asset = allAssets.find((entry) => entry.id === id && entry.workspaceId === workspaceId);
    if (!asset) return { ok: false, error: "Asset not found in this workspace." };
    const trimmed = note.trim();
    if (!trimmed) return { ok: false, error: "Describe the revision request first." };
    if (!["client_review", "internal_review"].includes(asset.status)) {
      return { ok: false, error: "This asset is not in review." };
    }
    const fromClient = asset.status === "client_review";
    setAllAssets((current) =>
      current.map((entry) =>
        entry.id === id
          ? {
              ...entry,
              status: "revision",
              updatedAt: "just now",
              feedback: [
                {
                  id: uid("fb"),
                  author: fromClient ? "Client (recorded by owner)" : "Internal review",
                  body: trimmed,
                  time: "just now",
                  kind: fromClient ? "client" : "internal",
                },
                ...entry.feedback,
              ],
            }
          : entry,
      ),
    );
    pushAudit({
      workspaceId,
      entityType: "asset",
      entityId: id,
      actorType: "owner",
      actorId: "ja",
      action: `Revision requested · ${asset.name}`,
      result: "pending",
      meta: `v${asset.currentVersion} · ${trimmed}`,
    });
    return { ok: true };
  };

  const addAssetVersion = (id: string, note: string): ActionResult => {
    const asset = allAssets.find((entry) => entry.id === id && entry.workspaceId === workspaceId);
    if (!asset) return { ok: false, error: "Asset not found in this workspace." };
    const trimmed = note.trim();
    if (!trimmed) return { ok: false, error: "Add a short note for the new version." };
    const version = asset.currentVersion + 1;
    setAllAssets((current) =>
      current.map((entry) =>
        entry.id === id
          ? {
              ...entry,
              status: "internal_review",
              currentVersion: version,
              updatedAt: "just now",
              versions: [
                {
                  version,
                  label: `v${version} · revision`,
                  note: trimmed,
                  at: "just now",
                  by: "ja",
                },
                ...entry.versions,
              ],
            }
          : entry,
      ),
    );
    pushAudit({
      workspaceId,
      entityType: "asset",
      entityId: id,
      actorType: "owner",
      actorId: "ja",
      action: `Uploaded ${asset.name} v${version}`,
      result: "ok",
      meta: trimmed,
    });
    return { ok: true };
  };

  /* ------------------------------ finance ---------------------------- */

  const addTransaction: AppStore["addTransaction"] = (input) => {
    const amount = Math.round(input.amount);
    if (!Number.isFinite(amount) || amount <= 0) return { ok: false, error: "Amount must be greater than zero." };
    if (!input.description.trim()) return { ok: false, error: "Describe the transaction." };
    if (!input.date) return { ok: false, error: "Choose a transaction date." };
    const reference = input.reference?.trim() || `${input.type === "income" ? "INV" : "EXP"}-${Date.now().toString().slice(-5)}`;

    const created: Transaction = {
      id: uid("tx"),
      workspaceId,
      type: input.type,
      category: input.category,
      description: input.description.trim(),
      amount,
      currency: "USD",
      date: input.date,
      method: input.method,
      projectId: input.projectId,
      clientId: input.clientId,
      reference,
      status: "posted",
      createdBy: "ja",
    };
    setAllTransactions((current) => [created, ...current]);
    pushAudit({
      workspaceId,
      entityType: "finance",
      entityId: created.id,
      actorType: "owner",
      actorId: "ja",
      action: `Recorded ${input.type}`,
      result: "ok",
      meta: `${money(amount)} · ${created.description} · ${reference}`,
    });

    const summary = financeSummary([created, ...allTransactions], workspaceId);
    if (summary.balance < 15000) {
      pushNotification({
        workspaceId,
        title: "Cashflow below threshold",
        description: `Balance is ${money(summary.balance)} — below the $15,000 monitoring threshold.`,
        kind: "task",
        href: "/finance",
      });
    }
    return { ok: true };
  };

  const reverseTransaction = (id: string): ActionResult => {
    const original = allTransactions.find((entry) => entry.id === id && entry.workspaceId === workspaceId);
    if (!original) return { ok: false, error: "Transaction not found in this workspace." };
    if (original.status === "reversed") return { ok: false, duplicate: true, error: "This transaction was already reversed." };
    if (original.status !== "posted") return { ok: false, error: "Only posted transactions can be reversed." };

    const correction: Transaction = {
      ...original,
      id: uid("tx"),
      type: original.type === "income" ? "expense" : "income",
      description: `Correction — ${original.description}`,
      date: dateAt(0),
      reference: `REV-${original.reference}`,
      status: "correction",
    };
    setAllTransactions((current) => [
      correction,
      ...current.map((entry): Transaction => (entry.id === id ? { ...entry, status: "reversed" } : entry)),
    ]);
    pushAudit({
      workspaceId,
      entityType: "finance",
      entityId: original.id,
      actorType: "owner",
      actorId: "ja",
      action: "Reversed transaction with a correction entry",
      result: "ok",
      meta: `${original.reference} → ${correction.reference} · ${money(original.amount)}`,
    });
    return { ok: true };
  };

  /* ----------------------------- knowledge --------------------------- */

  const addKnowledgeDoc: AppStore["addKnowledgeDoc"] = (input) => {
    const id = uid("kd");
    const created: KnowledgeDoc = {
      id,
      workspaceId,
      title: input.title.trim() || "Untitled document",
      category: input.category.trim() || "General",
      summary: input.summary.trim(),
      body: input.body.trim(),
      source: input.source.trim() || "Internal · owner-authored",
      access: input.access,
      status: "active",
      projectId: input.projectId,
      agentIds: input.access === "agent" ? agents.map((agent) => agent.id) : [],
      chunks: 0,
      updatedAt: "just now",
    };
    setAllKnowledgeDocs((current) => [created, ...current]);
    pushAudit({
      workspaceId,
      entityType: "knowledge",
      entityId: id,
      actorType: "owner",
      actorId: "ja",
      action: "Created knowledge document",
      result: "ok",
      meta: `${created.title} · ${created.category}`,
    });
    return id;
  };

  const archiveKnowledgeDoc = (id: string, archived: boolean): ActionResult => {
    const document = allKnowledgeDocs.find((entry) => entry.id === id && entry.workspaceId === workspaceId);
    if (!document) return { ok: false, error: "Document not found in this workspace." };
    setAllKnowledgeDocs((current) =>
      current.map((entry) => (entry.id === id ? { ...entry, status: archived ? "archived" : "active" } : entry)),
    );
    pushAudit({
      workspaceId,
      entityType: "knowledge",
      entityId: id,
      actorType: "owner",
      actorId: "ja",
      action: archived ? "Archived knowledge document" : "Restored knowledge document",
      result: "ok",
      meta: document.title,
    });
    return { ok: true };
  };

  const toggleDocAgentAccess = (id: string): ActionResult => {
    const document = allKnowledgeDocs.find((entry) => entry.id === id && entry.workspaceId === workspaceId);
    if (!document) return { ok: false, error: "Document not found in this workspace." };
    if (document.access === "owner") {
      return { ok: false, error: "Owner-only documents can never be retrieved by agents." };
    }
    const nextAccess = document.access === "agent" ? "workspace" : "agent";
    setAllKnowledgeDocs((current) =>
      current.map((entry) =>
        entry.id === id
          ? {
              ...entry,
              access: nextAccess,
              agentIds: nextAccess === "agent" ? agents.map((agent) => agent.id) : [],
            }
          : entry,
      ),
    );
    pushAudit({
      workspaceId,
      entityType: "knowledge",
      entityId: id,
      actorType: "owner",
      actorId: "ja",
      action: nextAccess === "agent" ? "Allowed AI retrieval" : "Revoked AI retrieval",
      result: "ok",
      meta: document.title,
    });
    return { ok: true };
  };

  /* ----------------------------- automation -------------------------- */

  const toggleWorkflow = (id: string) => {
    const workflow = allWorkflows.find((entry) => entry.id === id && entry.workspaceId === workspaceId);
    if (!workflow) return;
    setAllWorkflows((current) =>
      current.map((entry) => (entry.id === id ? { ...entry, active: !entry.active } : entry)),
    );
    pushAudit({
      workspaceId,
      entityType: "automation",
      entityId: id,
      actorType: "owner",
      actorId: "ja",
      action: `${workflow.active ? "Paused" : "Enabled"} automation · ${workflow.name}`,
      result: "ok",
      meta: workflow.code,
    });
  };

  const runWorkflow = (id: string): ActionResult => {
    const workflow = allWorkflows.find((entry) => entry.id === id && entry.workspaceId === workspaceId);
    if (!workflow) return { ok: false, error: "Workflow not found in this workspace." };
    if (!workflow.active) return { ok: false, error: "Enable the workflow before running it." };

    const today = dateAt(0);
    const overdue = tasks.filter((task) => task.status !== "done" && task.due < today).length;
    const reviewAssets = assets.filter((asset) => asset.status === "client_review").length;
    const onboarding = clients.filter((client) => client.status === "onboarding" || client.status === "active").length;
    const summary = financeSummary(allTransactions, workspaceId);

    let note = "";
    let executionLabel = "Ran";
    if (workflow.code === "AUTO-001") {
      note = onboarding
        ? `${onboarding} client${onboarding === 1 ? "" : "s"} checked — onboarding checklist and portal steps are already in place.`
        : "No new clients — nothing to onboard.";
    } else if (workflow.code === "AUTO-002") {
      note = overdue
        ? `${overdue} task${overdue === 1 ? "" : "s"} past due — assignee and project manager notified (demo).`
        : "No overdue tasks — no notification sent.";
    } else if (workflow.code === "AUTO-003") {
      note = reviewAssets
        ? `${reviewAssets} asset${reviewAssets === 1 ? "" : "s"} waiting for client approval. Reminder queued.`
        : "No assets in client review — nothing to request.";
      if (!reviewAssets) executionLabel = "Checked";
    } else if (workflow.code === "AUTO-004") {
      note = `Weekly report assembled: ${money(summary.income)} income, ${money(summary.expense)} expenses, ${projects.filter((project) => project.status === "active").length} active projects. Demo data only.`;
    } else if (workflow.code === "AUTO-005") {
      note = summary.balance < 15000
        ? `Cashflow alert: balance ${money(summary.balance)} is below the $15,000 threshold.`
        : `Cashflow check passed: balance ${money(summary.balance)} is above the $15,000 threshold.`;
    } else {
      note = workflow.description;
    }

    const execution: AutomationExecution = {
      id: uid("ax"),
      workspaceId,
      workflowId: id,
      status: "success",
      summary: note,
      time: "just now",
      at: Date.now(),
    };
    setAllAutomationExecutions((current) => [execution, ...current]);
    setAllWorkflows((current) =>
      current.map((entry) => (entry.id === id ? { ...entry, runs: entry.runs + 1 } : entry)),
    );
    pushAudit({
      workspaceId,
      entityType: "automation",
      entityId: execution.id,
      actorType: "system",
      actorId: "system",
      action: `${executionLabel} automation · ${workflow.name}`,
      result: "ok",
      meta: note,
    });
    if (workflow.code === "AUTO-004" || workflow.code === "AUTO-005") {
      pushNotification({
        workspaceId,
        title: workflow.code === "AUTO-004" ? "Weekly report ready" : "Cashflow check complete",
        description: note,
        kind: "task",
        href: "/analytics",
      });
    }
    return { ok: true };
  };

  /* ------------------------------ posts ------------------------------ */

  const addPost = (post: Omit<Post, "id">) => {
    const created: OfficePost = { ...post, id: uid("p"), workspaceId };
    setAllPosts((current) => [created, ...current]);
    pushAudit({
      workspaceId,
      entityType: "post",
      entityId: created.id,
      actorType: "owner",
      actorId: "ja",
      action: "Created post",
      result: "ok",
      meta: `${created.title} · ${created.platform}`,
    });
  };

  const updatePost = (id: string, patch: Partial<Post>) => {
    const post = allPosts.find((entry) => entry.id === id);
    if (!post) return;
    if (patch.status === "published" && post.status !== "scheduled") return;
    setAllPosts((current) => current.map((entry) => (entry.id === id ? { ...entry, ...patch } : entry)));
    if (patch.status && patch.status !== post.status) {
      pushAudit({
        workspaceId: post.workspaceId,
        entityType: "post",
        entityId: id,
        actorType: "owner",
        actorId: "ja",
        action: `Post moved to ${patch.status}`,
        result: "ok",
        meta: `${post.title} · ${post.platform}`,
      });
    }
  };

  const deletePost = (id: string) => {
    const post = allPosts.find((entry) => entry.id === id);
    if (!post) return;
    setAllPosts((current) => current.filter((entry) => entry.id !== id));
    pushAudit({
      workspaceId: post.workspaceId,
      entityType: "post",
      entityId: id,
      actorType: "owner",
      actorId: "ja",
      action: "Deleted post",
      result: "ok",
      meta: `${post.title} · ${post.platform}`,
    });
  };

  const approvePost = (id: string): ActionResult => {
    const post = allPosts.find((entry) => entry.id === id);
    if (!post) return { ok: false, error: "Post not found." };
    if (post.status === "published") return { ok: false, error: "This post is already published." };
    if (post.status === "scheduled") return { ok: false, error: "This post is already approved and scheduled." };
    setAllPosts((current) =>
      current.map((entry) => (entry.id === id ? { ...entry, status: "scheduled" } : entry)),
    );
    pushAudit({
      workspaceId: post.workspaceId,
      entityType: "post",
      entityId: id,
      actorType: "owner",
      actorId: "ja",
      action: "Approved post for scheduling",
      result: "ok",
      meta: `${post.title} · ${post.platform}`,
    });
    return { ok: true };
  };

  const publishPost = (id: string): ActionResult => {
    const post = allPosts.find((entry) => entry.id === id);
    if (!post) return { ok: false, error: "Post not found." };
    if (post.status !== "scheduled") {
      return { ok: false, error: "Only scheduled, approved posts can be published." };
    }
    setAllPosts((current) =>
      current.map((entry) => (entry.id === id ? { ...entry, status: "published" } : entry)),
    );
    pushAudit({
      workspaceId: post.workspaceId,
      entityType: "post",
      entityId: id,
      actorType: "owner",
      actorId: "ja",
      action: "Published post",
      result: "ok",
      meta: `${post.title} · ${post.platform}`,
    });
    return { ok: true };
  };

  /* ------------------------------- runs ------------------------------ */

  const transitionRun = (id: string, next: RunState, note?: string) => {
    const current = runsRef.current.find((entry) => entry.id === id);
    if (!current || isTerminal(current.state)) return;
    if (current.state === next) return;
    const updated: OfficeRun = {
      ...current,
      state: next,
      timeline: [...current.timeline, { state: next, at: Date.now(), time: "just now", note }],
      duration: current.duration === "—" ? "—" : `${Math.max(1, Math.round((Date.now() - current.startedAt) / 1000))}s`,
      failureReason:
        next === "failed" || next === "unavailable"
          ? current.failureReason ?? "Provider failure — check worker logs."
          : current.failureReason,
    };
    runsRef.current = runsRef.current.map((entry) => (entry.id === id ? updated : entry));
    setAllRuns((currentRuns) => currentRuns.map((entry) => (entry.id === id ? updated : entry)));
    pushAudit({
      workspaceId: updated.workspaceId,
      entityType: "run",
      entityId: id,
      taskId: updated.taskId,
      actorType: "agent",
      actorId: updated.agentId,
      action: `${RUN_STATE_META[next].label} · ${updated.action}`,
      result: next === "failed" || next === "unavailable" ? "failed" : next === "owner_review" ? "pending" : "ok",
      meta: note ?? updated.subject,
    });
    if (next === "owner_review") {
      pushNotification({
        workspaceId: updated.workspaceId,
        title: "Approval needed",
        description: `${updated.action} · ${updated.subject}`,
        kind: "approval",
        href: `/agent?run=${id}`,
      });
    }
  };

  const startRun = async (input: StartRunInput): Promise<RunStartResult> => {
    const agent = AGENTS.find((entry) => entry.id === input.agentId) ?? AGENTS[0];

    if (live) {
      try {
        const run = await startRunFromProposal({
          workspaceId,
          agentId: agent.id,
          action: input.action,
          subject: input.subject,
          taskId: input.taskId,
          approvalRequired: input.approvalRequired,
        });
        upsertRun(run);
        void loadSnapshot(workspaceId, true);
        return { ok: true, runId: run.id };
      } catch (error) {
        return { ok: false, error: apiErrorMessage(error) };
      }
    }

    const unavailable = agent.availability === "unavailable";
    const id = uid("run");
    const state: RunState = unavailable ? "unavailable" : "queued";
    const created: OfficeRun = {
      id,
      workspaceId: agent.workspaceId,
      agentId: agent.id,
      action: input.action,
      subject: input.subject,
      state,
      startedAt: Date.now(),
      time: "just now",
      duration: "—",
      taskId: input.taskId,
      approvalRequired: input.approvalRequired ?? true,
      outputVersion: 1,
      evidence: input.evidence ?? [],
      limitations: input.limitations ?? [],
      failureReason: unavailable
        ? `Agent unavailable — ${agent.name} is offline (${agent.note ?? "provider outage"}). Nothing was executed.`
        : input.forceFailure
          ? input.failureReason ?? "Provider timeout — delivery ambiguous."
          : undefined,
      timeline: [
        {
          state,
          at: Date.now(),
          time: "just now",
          note: unavailable ? "Dispatch rejected by availability check" : "Accepted by dispatcher",
        },
      ],
    };
    runsRef.current = [created, ...runsRef.current];
    setAllRuns((current) => [created, ...current]);
    pushAudit({
      workspaceId: created.workspaceId,
      entityType: "run",
      entityId: id,
      taskId: input.taskId,
      actorType: unavailable ? "system" : "agent",
      actorId: agent.id,
      action: unavailable ? `Run blocked · ${input.action}` : `Run queued · ${input.action}`,
      result: unavailable ? "failed" : "pending",
      meta: unavailable ? created.failureReason : `${input.subject} · draft-first`,
    });
    if (unavailable) return { ok: true, runId: id };

    window.setTimeout(() => transitionRun(id, "running", "Worker lease acquired"), 600);
    if (input.forceFailure) {
      window.setTimeout(
        () => transitionRun(id, "failed", input.failureReason ?? "Provider timeout — delivery ambiguous."),
        1900,
      );
      return { ok: true, runId: id };
    }
    window.setTimeout(() => transitionRun(id, "received", "Output received"), 1600);
    window.setTimeout(() => transitionRun(id, "qc", "QC checklist running"), 2500);
    window.setTimeout(() => transitionRun(id, "owner_review", "Held for owner approval"), 3400);
    return { ok: true, runId: id };
  };

  const stopRun = async (id: string): Promise<ActionResult> => {
    const run = allRuns.find((entry) => entry.id === id);
    if (!run) return { ok: false, error: "Run not found." };
    if (!isActive(run.state)) return { ok: false, error: "This run already finished and cannot be stopped." };

    if (live) {
      try {
        upsertRun(await stopRunOnServer(run.workspaceId, id));
        void loadSnapshot(run.workspaceId, true);
        return { ok: true };
      } catch (error) {
        return { ok: false, error: apiErrorMessage(error) };
      }
    }

    const updated: OfficeRun = {
      ...run,
      state: "cancelled",
      failureReason: "Stopped by owner. History is preserved.",
      timeline: [...run.timeline, { state: "cancelled", at: Date.now(), time: "just now", note: "Stopped by owner" }],
    };
    runsRef.current = runsRef.current.map((entry) => (entry.id === id ? updated : entry));
    setAllRuns((current) => current.map((entry) => (entry.id === id ? updated : entry)));
    pushAudit({
      workspaceId: run.workspaceId,
      entityType: "run",
      entityId: id,
      taskId: run.taskId,
      actorType: "owner",
      actorId: "ja",
      action: "Stopped run",
      result: "ok",
      meta: `${run.action} · ${run.subject}`,
    });
    return { ok: true };
  };

  const decideRun = async (
    id: string,
    decision: "approved" | "changes_requested" | "rejected",
    comment: string,
  ): Promise<ActionResult> => {
    const run = allRuns.find((entry) => entry.id === id);
    if (!run) return { ok: false, error: "Run not found." };
    if (run.state !== "owner_review") return { ok: false, error: "This run is not waiting for an approval decision." };
    const trimmed = comment.trim();
    if (decision !== "approved" && !trimmed) {
      return { ok: false, error: "A short reason is required to request changes or reject." };
    }

    if (live) {
      try {
        upsertRun(await decideRunOnServer(run.workspaceId, id, decision, trimmed));
        setAllNotifications((current) =>
          current.map((item) => (item.href === `/agent?run=${id}` ? { ...item, unread: false } : item)),
        );
        void loadSnapshot(run.workspaceId, true);
        return { ok: true };
      } catch (error) {
        return { ok: false, error: apiErrorMessage(error) };
      }
    }

    const updated: OfficeRun = {
      ...run,
      state: decision,
      decisionComment: trimmed || undefined,
      timeline: [
        ...run.timeline,
        {
          state: decision,
          at: Date.now(),
          time: "just now",
          note: trimmed || (decision === "approved" ? "Approved by owner" : undefined),
        },
      ],
    };
    runsRef.current = runsRef.current.map((entry) => (entry.id === id ? updated : entry));
    setAllRuns((current) => current.map((entry) => (entry.id === id ? updated : entry)));
    setAllNotifications((current) =>
      current.map((item) => (item.href === `/agent?run=${id}` ? { ...item, unread: false } : item)),
    );
    pushAudit({
      workspaceId: run.workspaceId,
      entityType: "run",
      entityId: id,
      taskId: run.taskId,
      actorType: "owner",
      actorId: "ja",
      action: `Run ${RUN_STATE_META[decision].label.toLowerCase()}`,
      result: "ok",
      meta: `${run.action} · ${run.subject}${trimmed ? ` · ${trimmed}` : ""}`,
    });
    return { ok: true };
  };

  /* -------------------------- notifications -------------------------- */

  const markNotificationRead = (id: string) =>
    setAllNotifications((current) => current.map((item) => (item.id === id ? { ...item, unread: false } : item)));

  const markAllNotificationsRead = () =>
    setAllNotifications((current) =>
      current.map((item) => (item.workspaceId === workspaceId ? { ...item, unread: false } : item)),
    );

  const recordEvent: AppStore["recordEvent"] = (input) => {
    pushAudit({
      workspaceId,
      entityType: input.entityType,
      entityId: input.entityId,
      actorType: "owner",
      actorId: "ja",
      action: input.action,
      result: input.result ?? "ok",
      meta: input.meta,
    });
  };

  const switchWorkspace = (id: WorkspaceId) => setWorkspaceId(id);

  const value: AppStore = {
    workspace,
    workspaces: WORKSPACES,
    switchWorkspace,
    sync: syncState,
    refresh,
    clearSyncError,
    tasks,
    deals,
    posts,
    leads,
    briefs,
    runs,
    agents,
    audit,
    notifications,
    approvals,
    addBrief,
    answerBriefQuestion,
    addBriefDeliverable,
    removeBriefDeliverable,
    approveBriefScope,
    deliveryAnalysis,
    deliveryPlan,
    deliveryRuns,
    runDeliveryAnalysis,
    draftDeliveryPlan,
    approveDeliveryPlan,
    startDeliveryRun,
    validateDeliveryRun,
    clients,
    projects,
    assets,
    transactions,
    knowledgeDocs,
    workflows,
    automationExecutions,
    roles: ROLES,
    permissionModules: PERMISSION_MODULES,
    rolePermissions: ROLE_PERMISSIONS,
    convertLeadToClient,
    addClient,
    createProject,
    createProjectFromDeal,
    updateProjectStatus,
    submitAssetForReview,
    sendAssetToClient,
    approveAsset,
    requestAssetRevision,
    addAssetVersion,
    addTransaction,
    reverseTransaction,
    addKnowledgeDoc,
    archiveKnowledgeDoc,
    toggleDocAgentAccess,
    toggleWorkflow,
    runWorkflow,
    autopilot,
    setAutopilot,
    moveTask,
    toggleTask,
    addTask,
    assignTask,
    submitTask,
    decideTask,
    addTaskComment,
    moveDeal,
    addDeal,
    addLead,
    addPost,
    updatePost,
    deletePost,
    approvePost,
    publishPost,
    startRun,
    stopRun,
    decideRun,
    markNotificationRead,
    markAllNotificationsRead,
    recordEvent,
  };

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore() {
  const context = useContext(StoreContext);
  if (!context) throw new Error("useStore must be used inside StoreProvider");
  return context;
}
