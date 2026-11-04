import { useEffect, useState } from 'react';
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { getOfficeToken } from './lib/api';
import { TokenGate } from './components/TokenGate';
import { StoreProvider } from './store/store';
import { Shell } from './components/Shell';
import { Overview } from './pages/Overview';
import {
  ContactsPage,
  CrmOverview,
  CustomersPage,
  DealsPage,
  LeadsPage,
  PipelinePage,
} from './pages/Crm';
import { LeadScraperPage } from './pages/LeadScraper';
import { LandingCmsPage } from './pages/LandingCms';
import { CrmTemplates } from './pages/CrmTemplates';
import {
  AssignmentPage,
  DeliverablesPage,
  ProjectsOverview,
  ProjectTasks,
} from './pages/Projects';
import {
  ArticlesPage,
  CommentsPage,
  ContentLibraryPage,
  MarketingOverview,
  MediaPage,
  MenusPage,
  NewslettersPage,
  PagesPage,
  PostEditorPage,
  SocialPlannerPage,
} from './pages/Marketing';
import {
  AgentDirectory,
  AgentOverview,
  AgentSettingsPage,
  AITeamChat,
  ExecutionLogsPage,
  JobQueuePage,
  OrchestrationPage,
  WorkResultsPage,
} from './pages/Agents';
import {
  ActivityFeedPage,
  InternalChatPage,
  NotificationsPage,
} from './pages/Team';
import {
  AdminSettingsPage,
  AuditPage,
  IntegrationsPage,
  RolesPage,
  UsersPage,
  WorkspacesPage,
} from './pages/Admin';
import { FeaturesPage } from './pages/Advanced';
import {
  ApprovalsPage,
  CalendarPage,
  OperationsActivityPage,
  TaskBoardPage,
} from './pages/Operations';
import {
  AgentsControlPage,
  FoldersPage,
  LogsPage,
  MemoryPage,
  StudioSettingsPage,
  UsagePage,
} from './pages/System';

export default function App() {
  const [ready, setReady] = useState(() => Boolean(getOfficeToken()));
  const [notice, setNotice] = useState('');

  // Any 401 from the API clears the stored token; drop back to the gate with a
  // reason instead of leaving the UI half-broken with raw error messages.
  useEffect(() => {
    const onCleared = () => {
      setNotice(
        'Token ditolak server — kemungkinan sudah dirotasi. Tempel token terbaru dari .dev.vars.',
      );
      setReady(false);
    };
    const onSet = () => {
      setNotice('');
      setReady(true);
    };
    window.addEventListener('pd-auth-cleared', onCleared);
    window.addEventListener('pd-token-set', onSet);
    return () => {
      window.removeEventListener('pd-auth-cleared', onCleared);
      window.removeEventListener('pd-token-set', onSet);
    };
  }, []);

  if (!ready) {
    return (
      <TokenGate
        notice={notice}
        onReady={() => {
          setNotice('');
          setReady(true);
        }}
      />
    );
  }

  return (
    <StoreProvider>
      <HashRouter>
        <Shell>
          <Routes>
            <Route path="/" element={<Navigate to="/overview" replace />} />
            <Route path="/overview" element={<Overview />} />
            <Route path="/office" element={<Navigate to="/overview" replace />} />
            <Route path="/dashboard" element={<Navigate to="/overview" replace />} />

            <Route path="/crm" element={<CrmOverview />} />
            <Route path="/crm/scraper" element={<LeadScraperPage />} />
            <Route path="/crm/leads" element={<LeadsPage />} />
            <Route path="/crm/customers" element={<CustomersPage />} />
            <Route path="/crm/contacts" element={<ContactsPage />} />
            <Route path="/crm/deals" element={<DealsPage />} />
            <Route path="/crm/pipeline" element={<PipelinePage />} />
            <Route path="/crm/templates" element={<CrmTemplates />} />

            <Route path="/projects" element={<ProjectsOverview />} />
            <Route path="/projects/tasks" element={<ProjectTasks />} />
            <Route path="/projects/assignment" element={<AssignmentPage />} />
            <Route path="/projects/deliverables" element={<DeliverablesPage />} />

            <Route path="/marketing" element={<MarketingOverview />} />
            <Route path="/marketing/landing-cms" element={<LandingCmsPage />} />
            <Route path="/marketing/articles" element={<ArticlesPage />} />
            <Route path="/marketing/pages" element={<PagesPage />} />
            <Route path="/marketing/editor" element={<PostEditorPage />} />
            <Route path="/marketing/media" element={<MediaPage />} />
            <Route path="/marketing/social" element={<SocialPlannerPage />} />
            <Route path="/marketing/library" element={<ContentLibraryPage />} />
            <Route path="/marketing/comments" element={<CommentsPage />} />
            <Route path="/marketing/menus" element={<MenusPage />} />
            <Route path="/marketing/newsletters" element={<NewslettersPage />} />

            <Route path="/ai" element={<AgentOverview />} />
            <Route path="/ai/directory" element={<AgentDirectory />} />
            <Route path="/ai/chat" element={<AITeamChat />} />
            <Route path="/ai/orchestration" element={<OrchestrationPage />} />
            <Route path="/ai/jobs" element={<JobQueuePage />} />
            <Route path="/ai/results" element={<WorkResultsPage />} />
            <Route path="/ai/logs" element={<ExecutionLogsPage />} />
            <Route path="/ai/settings" element={<AgentSettingsPage />} />

            <Route path="/team/chat" element={<InternalChatPage />} />
            <Route path="/team/notifications" element={<NotificationsPage />} />
            <Route path="/team/activity" element={<ActivityFeedPage />} />

            <Route path="/tasks" element={<Navigate to="/task-board" replace />} />
            <Route path="/task-board" element={<TaskBoardPage />} />
            <Route path="/calendar" element={<CalendarPage />} />
            <Route path="/activity" element={<OperationsActivityPage />} />
            <Route path="/approvals" element={<ApprovalsPage />} />
            <Route path="/features" element={<FeaturesPage />} />

            <Route path="/admin" element={<Navigate to="/admin/users" replace />} />
            <Route path="/admin/users" element={<UsersPage />} />
            <Route path="/admin/roles" element={<RolesPage />} />
            <Route path="/admin/workspaces" element={<WorkspacesPage />} />
            <Route path="/admin/integrations" element={<IntegrationsPage />} />
            <Route path="/admin/audit" element={<AuditPage />} />
            <Route path="/admin/settings" element={<AdminSettingsPage />} />

            <Route path="/agents" element={<AgentsControlPage />} />
            <Route path="/usage" element={<UsagePage />} />
            <Route path="/memory" element={<MemoryPage />} />
            <Route path="/folders" element={<FoldersPage />} />
            <Route path="/logs" element={<LogsPage />} />
            <Route path="/settings" element={<StudioSettingsPage />} />

            <Route path="*" element={<Navigate to="/overview" replace />} />
          </Routes>
        </Shell>
      </HashRouter>
    </StoreProvider>
  );
}
