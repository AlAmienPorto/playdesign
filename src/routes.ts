import {
  Bot,
  Building2,
  CalendarClock,
  CalendarDays,
  FileCheck2,
  Image as ImageIcon,
  Inbox,
  LayoutDashboard,
  LayoutTemplate,
  Library,
  ListTodo,
  Megaphone,
  MessagesSquare,
  Network,
  PenLine,
  Plug,
  Radar,
  ScrollText,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  UserPlus,
  Users,
  type LucideIcon,
} from 'lucide-react';
import type { ComponentType } from 'react';
import type { ModuleStatus } from './data/types';
import { WhatsAppIcon } from './components/icons';

export type SubTabIcon = ComponentType<{ size?: number | string; className?: string }>;

export interface SubTab {
  label: string;
  path: string;
  icon: SubTabIcon;
}

export const MODULE_TABS: Record<string, SubTab[]> = {
  marketing: [
    { label: 'Content Composer', path: '/marketing/editor', icon: PenLine },
    { label: 'Social Planner', path: '/marketing/social', icon: CalendarClock },
    { label: 'Landing Pages', path: '/marketing/landing-cms', icon: LayoutTemplate },
    { label: 'Media', path: '/marketing/media', icon: ImageIcon },
    { label: 'Content Library', path: '/marketing/library', icon: Library },
  ],
  leads: [
    { label: 'Lead Inbox', path: '/crm/leads', icon: Inbox },
    { label: 'Import & Scraping', path: '/crm/scraper', icon: Radar },
    { label: 'Template WA', path: '/crm/templates', icon: WhatsAppIcon },
  ],
  ai: [
    { label: 'Agent Directory', path: '/ai/directory', icon: Users },
    { label: 'AI Team Chat', path: '/ai/chat', icon: MessagesSquare },
    { label: 'Automation / Orchestration', path: '/ai/orchestration', icon: Network },
    { label: 'Job Queue + Execution Logs', path: '/ai/jobs', icon: ListTodo },
    { label: 'Work Results', path: '/ai/results', icon: FileCheck2 },
    { label: 'Agent Settings', path: '/ai/settings', icon: SlidersHorizontal },
  ],
  admin: [
    { label: 'Users & Roles', path: '/admin/users', icon: Users },
    { label: 'Integrations', path: '/admin/integrations', icon: Plug },
    { label: 'Audit', path: '/admin/audit', icon: ScrollText },
    { label: 'Settings', path: '/admin/settings', icon: Settings },
  ],
};

export interface NavItem {
  label: string;
  path: string;
  icon: LucideIcon;
  status?: ModuleStatus;
  match?: string;
  children?: SubTab[];
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

export const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Workspace',
    items: [
      { label: 'Overview', path: '/overview', icon: LayoutDashboard, status: 'Live' },
      {
        label: 'Marketing & Content',
        path: '/marketing/editor',
        icon: Megaphone,
        status: 'Planned',
        match: '/marketing',
        children: MODULE_TABS.marketing,
      },
      {
        label: 'Leads',
        path: '/crm/leads',
        icon: UserPlus,
        status: 'Foundation',
        match: '/crm',
        children: MODULE_TABS.leads,
      },
      {
        label: 'AI Agent Center',
        path: '/ai/directory',
        icon: Bot,
        status: 'Foundation',
        match: '/ai',
        children: MODULE_TABS.ai,
      },
    ],
  },
  {
    label: 'Operations',
    items: [
      { label: 'Persetujuan', path: '/approvals', icon: ShieldCheck, status: 'Live' },
      { label: 'Schedule', path: '/calendar', icon: CalendarDays, status: 'Live' },
    ],
  },
  {
    label: 'System',
    items: [
      {
        label: 'Administration',
        path: '/admin/users',
        icon: Building2,
        status: 'Foundation',
        match: '/admin',
        children: MODULE_TABS.admin,
      },
    ],
  },
];

export const CRUMBS: Record<string, { section: string; page: string }> = {
  '/overview': { section: 'Workspace', page: 'Overview' },
  '/crm': { section: 'CRM', page: 'Overview' },
  '/crm/scraper': { section: 'Leads', page: 'Import & Scraping' },
  '/crm/leads': { section: 'Leads', page: 'Lead Inbox' },
  '/crm/customers': { section: 'CRM', page: 'Customers' },
  '/crm/contacts': { section: 'CRM', page: 'Contacts' },
  '/crm/deals': { section: 'CRM', page: 'Deals' },
  '/crm/pipeline': { section: 'CRM', page: 'Pipeline' },
  '/crm/templates': { section: 'Leads', page: 'Template WA' },
  '/projects': { section: 'Projects', page: 'Overview' },
  '/projects/tasks': { section: 'Projects', page: 'Tasks' },
  '/projects/assignment': { section: 'Projects', page: 'Assignment' },
  '/projects/deliverables': { section: 'Projects', page: 'Deliverables' },
  '/marketing': { section: 'Marketing & Content', page: 'Overview' },
  '/marketing/landing-cms': { section: 'Marketing & Content', page: 'Landing Page CMS' },
  '/marketing/articles': { section: 'Marketing & Content', page: 'Articles' },
  '/marketing/pages': { section: 'Marketing & Content', page: 'Pages' },
  '/marketing/editor': { section: 'Marketing & Content', page: 'Post Editor' },
  '/marketing/media': { section: 'Marketing & Content', page: 'Media' },
  '/marketing/social': { section: 'Marketing & Content', page: 'Social Planner' },
  '/marketing/library': { section: 'Marketing & Content', page: 'Content Library' },
  '/marketing/comments': { section: 'Marketing & Content', page: 'Comments' },
  '/marketing/menus': { section: 'Marketing & Content', page: 'Menus' },
  '/marketing/newsletters': { section: 'Marketing & Content', page: 'Newsletters' },
  '/ai': { section: 'AI Agent Center', page: 'Overview' },
  '/ai/directory': { section: 'AI Agent Center', page: 'Agent Directory' },
  '/ai/chat': { section: 'AI Agent Center', page: 'AI Team Chat' },
  '/ai/orchestration': { section: 'AI Agent Center', page: 'Orchestration' },
  '/ai/jobs': { section: 'AI Agent Center', page: 'Job Queue' },
  '/ai/results': { section: 'AI Agent Center', page: 'Work Results' },
  '/ai/logs': { section: 'AI Agent Center', page: 'Execution Logs' },
  '/ai/settings': { section: 'AI Agent Center', page: 'Agent Settings' },
  '/team/chat': { section: 'Team Collaboration', page: 'Internal Chat' },
  '/team/notifications': { section: 'Team Collaboration', page: 'Notifications' },
  '/team/activity': { section: 'Team Collaboration', page: 'Activity Feed' },
  '/admin/users': { section: 'Administration', page: 'Users' },
  '/admin/roles': { section: 'Administration', page: 'Roles & Permissions' },
  '/admin/workspaces': { section: 'Administration', page: 'Workspaces' },
  '/admin/integrations': { section: 'Administration', page: 'Integrations' },
  '/admin/audit': { section: 'Administration', page: 'Audit' },
  '/admin/settings': { section: 'Administration', page: 'Settings' },
  '/features': { section: 'Operations', page: 'Fitur Lanjutan' },
  '/task-board': { section: 'Operations', page: 'Task Board' },
  '/calendar': { section: 'Operations', page: 'Calendar' },
  '/activity': { section: 'Operations', page: 'Activity' },
  '/approvals': { section: 'Operations', page: 'Persetujuan' },
  '/agents': { section: 'System', page: 'Agents' },
  '/usage': { section: 'System', page: 'Usage' },
  '/memory': { section: 'System', page: 'Memory' },
  '/folders': { section: 'System', page: 'Folders' },
  '/logs': { section: 'System', page: 'Logs' },
  '/settings': { section: 'System', page: 'Settings' },
};

export const crumbFor = (pathname: string) =>
  CRUMBS[pathname] ?? {
    section: 'Workspace',
    page: 'Overview',
  };
