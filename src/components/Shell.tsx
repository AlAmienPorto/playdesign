import { useEffect, useMemo, useRef, useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  Bell,
  Check,
  ChevronDown,
  ChevronRight,
  ChevronsUpDown,
  Command,
  CornerDownLeft,
  FileText,
  FolderKanban,
  LogOut,
  Menu,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  ShieldCheck,
  Sun,
  Users,
  Workflow,
  X,
  Bot,
} from 'lucide-react';
import { CRUMBS, NAV_GROUPS, crumbFor } from '../routes';
import { useStore } from '../store/store';
import { cx, fmtDate, relTime } from '../lib/utils';
import { Logo, LogoMark } from './Logo';
import { Avatar, Badge, KeyHint, Toasts } from './ui';

type CmdResult = {
  id: string;
  group: string;
  label: string;
  meta: string;
  to: string;
};

const isNavActive = (pathname: string, path: string, match?: string) =>
  match ? pathname === path || pathname.startsWith(`${match}/`) : pathname === path;

const branchOwner = (pathname: string) =>
  NAV_GROUPS.flatMap((group) => group.items).find(
    (item) => item.children?.length && isNavActive(pathname, item.path, item.match),
  );

export function Shell({ children }: { children: React.ReactNode }) {
  const { db, navCollapsed, setNavCollapsed, theme, toggleTheme, role, user, switchWorkspace } = useStore();
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [wsOpen, setWsOpen] = useState(false);
  const [openMenus, setOpenMenus] = useState<Record<string, boolean>>(() => {
    const owner = branchOwner(location.pathname);
    return owner ? { [owner.path]: true } : {};
  });

  const pendingApprovals = db.approvals.filter((a) => a.status === 'pending').length;
  const unread = db.notifications.filter((n) => !n.read).length;
  const crumb = crumbFor(location.pathname);
  const workspace = db.workspaces.find((w) => w.active);

  useEffect(() => {
    const owner = branchOwner(location.pathname);
    if (owner) setOpenMenus((prev) => (prev[owner.path] ? prev : { [owner.path]: true }));
  }, [location.pathname]);

  useEffect(() => {
    setMobileOpen(false);
    setNotifOpen(false);
    setProfileOpen(false);
    setWsOpen(false);
    window.scrollTo({ top: 0 });
  }, [location.pathname]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const active = (path: string, match?: string) => isNavActive(location.pathname, path, match);

  return (
    <div className={cx('shell', navCollapsed && 'is-collapsed')}>
      {mobileOpen && (
        <button type="button" className="sidebar-scrim" onClick={() => setMobileOpen(false)} aria-label="Tutup navigasi" />
      )}
      <aside className={cx('sidebar', mobileOpen && 'is-open')}>
        <div className="sidebar-top">
          <NavLink to="/overview" className="logo-link" aria-label="Playdesign Overview">
            {navCollapsed ? <LogoMark size={28} className="logo-mark" /> : <Logo />}
          </NavLink>
          <button
            type="button"
            className="sidebar-collapse"
            onClick={() => setNavCollapsed(!navCollapsed)}
            aria-label={navCollapsed ? 'Perluas sidebar' : 'Ciutkan sidebar'}
          >
            {navCollapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
          </button>
          <button type="button" className="sidebar-mobile-close" onClick={() => setMobileOpen(false)} aria-label="Tutup navigasi">
            <X size={17} />
          </button>
        </div>

        <div className="workspace-switch">
          <button
            type="button"
            className="workspace-btn"
            onClick={() => setWsOpen((v) => !v)}
            aria-expanded={wsOpen}
            title="Ganti workspace"
          >
            <span className="ws-avatar">{workspace?.name.slice(0, 2).toUpperCase() ?? 'PD'}</span>
            {!navCollapsed && (
              <span className="ws-copy">
                <span className="ws-name">{workspace?.name ?? 'Playdesign Studio'}</span>
                <span className="ws-plan">{workspace?.plan ?? 'Studio'} workspace</span>
              </span>
            )}
            {!navCollapsed && <ChevronsUpDown size={13} className="ws-chevron" />}
          </button>
          {wsOpen && (
            <div className="popover ws-pop">
              <div className="popover-head">
                <span>Ganti workspace</span>
              </div>
              {db.workspaces.map((w) => (
                <button
                  key={w.id}
                  type="button"
                  className="menu-item"
                  onClick={() => {
                    switchWorkspace(w.id);
                    setWsOpen(false);
                  }}
                >
                  <span>
                    {w.name}
                    <small>{w.plan} · {w.projects} proyek</small>
                  </span>
                  {w.active && <Check size={14} />}
                </button>
              ))}
              <NavLink to="/admin/workspaces" className="menu-item menu-link" onClick={() => setWsOpen(false)}>
                Kelola workspace
                <ArrowRight size={13} />
              </NavLink>
            </div>
          )}
        </div>

        <nav className="sidebar-nav" aria-label="Navigasi utama">
          {NAV_GROUPS.map((group) => (
            <div className="nav-group" key={group.label}>
              {!navCollapsed && <div className="nav-group-label">{group.label}</div>}
              {group.items.map((item) => {
                const Icon = item.icon;
                const isActive = active(item.path, item.match);
                const hasChildren = !navCollapsed && Boolean(item.children?.length);
                const isOpen = hasChildren && Boolean(openMenus[item.path]);
                return (
                  <div
                    className={cx('nav-entry', Boolean(item.children?.length) && 'has-sub')}
                    key={item.path}
                  >
                    <div className={cx('nav-row', isOpen && 'is-open')}>
                      <NavLink
                        to={item.path}
                        className={({ isActive: navActive }) => cx('nav-item', navActive && 'active')}
                        title={`${item.label}${item.status ? ` · ${item.status}` : ''}`}
                        end={!item.match}
                      >
                        <Icon size={17} className="nav-icon" />
                        {!navCollapsed && (
                          <>
                            <span className="nav-label">{item.label}</span>
                            {item.path === '/approvals' && pendingApprovals > 0 ? (
                              <span className="nav-count">{pendingApprovals}</span>
                            ) : (
                              <span className={cx('nav-status', item.status?.toLowerCase().replace(' ', '-'))}>
                                {item.status === 'Live' ? <i className="nav-dot" /> : item.status}
                              </span>
                            )}
                          </>
                        )}
                        {navCollapsed && isActive && <span className="nav-active-dot" />}
                      </NavLink>
                      {hasChildren && (
                        <button
                          type="button"
                          className="nav-toggle"
                          aria-expanded={isOpen}
                          aria-label={`${isOpen ? 'Tutup' : 'Buka'} submenu ${item.label}`}
                          title={`${isOpen ? 'Tutup' : 'Buka'} submenu ${item.label}`}
                          onClick={() =>
                            setOpenMenus((prev) => (prev[item.path] ? {} : { [item.path]: true }))
                          }
                        >
                          <ChevronRight size={13} />
                        </button>
                      )}
                    </div>
                    {isOpen && item.children && (
                      <div className="nav-sub">
                        {item.children.map((child) => {
                          const ChildIcon = child.icon;
                          return (
                            <NavLink
                              key={child.path}
                              to={child.path}
                              end
                              className={({ isActive: childActive }) =>
                                cx('nav-sub-item', childActive && 'active')
                              }
                            >
                              <ChildIcon size={14} className="nav-sub-icon" />
                              {child.label}
                            </NavLink>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="sidebar-foot">
          <div className="system-status" title="Semua layanan berjalan normal">
            <span className="pulse-dot" />
            {!navCollapsed && (
              <div>
                <strong>Semua sistem normal</strong>
                <span>Sinkron {relTime(db.audit[0]?.at ?? new Date().toISOString())}</span>
              </div>
            )}
          </div>
          {!navCollapsed && (
            <div className="sidebar-version">
              <LogoMark size={13} />
              <span>playdesign OS · v2.0</span>
            </div>
          )}
        </div>
      </aside>

      <div className="main-wrap">
        <header className="topbar">
          <div className="topbar-left">
            <button type="button" className="icon-btn topbar-menu" onClick={() => setMobileOpen(true)} aria-label="Buka navigasi">
              <Menu size={18} />
            </button>
            <nav className="crumbs" aria-label="Breadcrumb">
              <NavLink to="/overview" className="crumb-brand">
                playdesign
              </NavLink>
              <span className="crumb-sep">/</span>
              <span className="crumb-section">{crumb.section}</span>
              <span className="crumb-sep">/</span>
              <span className="crumb-page">{crumb.page}</span>
            </nav>
          </div>
          <div className="topbar-right">
            <span className="sync-chip" title="Sinkronisasi lokal aktif">
              <i className="sync-dot" />
              Tersinkron
            </span>
            <button type="button" className="search-trigger" onClick={() => setPaletteOpen(true)} aria-label="Cari halaman, task, deal">
              <Search size={15} />
              <span>Cari apa saja…</span>
              <KeyHint />
            </button>
            <button type="button" className="icon-btn hide-mobile" onClick={toggleTheme} aria-label="Ubah tema">
              {theme === 'light' ? <Moon size={17} /> : <Sun size={17} />}
            </button>

            <div className="popover-anchor">
              <button
                type="button"
                className={cx('icon-btn', unread > 0 && 'has-badge')}
                onClick={() => {
                  setNotifOpen((v) => !v);
                  setProfileOpen(false);
                }}
                aria-label={`Notifikasi, ${unread} belum dibaca`}
                aria-expanded={notifOpen}
              >
                <Bell size={17} />
                {unread > 0 && <span className="notif-badge">{unread}</span>}
              </button>
              {notifOpen && <NotificationPanel onClose={() => setNotifOpen(false)} />}
            </div>

            <div className="popover-anchor">
              <button
                type="button"
                className="profile-trigger"
                onClick={() => {
                  setProfileOpen((v) => !v);
                  setNotifOpen(false);
                }}
                aria-expanded={profileOpen}
                aria-label="Menu profil"
              >
                <Avatar name={user.name} size={30} />
                <span className="profile-copy hide-mobile">
                  <span className="profile-name">{user.name}</span>
                  <span className="profile-role">{role}</span>
                </span>
                <ChevronDown size={14} className="profile-chevron" />
              </button>
              {profileOpen && <ProfilePanel onClose={() => setProfileOpen(false)} />}
            </div>
          </div>
        </header>

        <main className="main-content">
          <div className="page" key={location.pathname}>
            {children}
          </div>
        </main>
      </div>

      {paletteOpen && <CommandPalette onClose={() => setPaletteOpen(false)} />}
      <Toasts />
      <span className="sr-only" aria-live="polite">
        Halaman {crumb.page}
      </span>
    </div>
  );
}

function NotificationPanel({ onClose }: { onClose: () => void }) {
  const { db, markNotificationRead, markAllNotificationsRead } = useStore();
  const navigate = useNavigate();
  const items = db.notifications.slice(0, 6);
  return (
    <div className="popover notif-panel">
      <div className="popover-head">
        <span>Notifikasi</span>
        <button type="button" className="text-btn" onClick={markAllNotificationsRead}>
          Tandai semua
        </button>
      </div>
      <div className="notif-list">
        {items.map((n) => (
          <button
            key={n.id}
            type="button"
            className={cx('notif-item', !n.read && 'unread')}
            onClick={() => {
              markNotificationRead(n.id);
              if (n.href) navigate(n.href);
              onClose();
            }}
          >
            <span className={cx('notif-icon', `kind-${n.kind}`)}>
              {n.kind === 'approval' ? <ShieldCheck size={14} /> : n.kind === 'job' ? <Workflow size={14} /> : n.kind === 'comment' ? <FileText size={14} /> : n.kind === 'task' ? <FolderKanban size={14} /> : <Bell size={14} />}
            </span>
            <span className="notif-copy">
              <span className="notif-title">{n.title}</span>
              <span className="notif-body">{n.body}</span>
              <span className="notif-time">{relTime(n.at)}</span>
            </span>
            {!n.read && <i className="unread-dot" />}
          </button>
        ))}
      </div>
      <div className="popover-foot">
        <button
          type="button"
          className="text-btn"
          onClick={() => {
            navigate('/team/notifications');
            onClose();
          }}
        >
          Lihat semua notifikasi
          <ArrowRight size={13} />
        </button>
      </div>
    </div>
  );
}

function ProfilePanel({ onClose }: { onClose: () => void }) {
  const { user, role, setRole, theme, toggleTheme, toast } = useStore();
  const navigate = useNavigate();
  const roles = ['Owner', 'Admin', 'Editor', 'Reviewer', 'Operator'] as const;
  return (
    <div className="popover profile-panel">
      <div className="profile-head">
        <Avatar name={user.name} size={40} />
        <div>
          <strong>{user.name}</strong>
          <span>{user.email}</span>
        </div>
      </div>
      <div className="popover-label">Tampilan sebagai</div>
      <div className="role-list">
        {roles.map((r) => (
          <button
            key={r}
            type="button"
            className={cx('menu-item', role === r && 'is-selected')}
            onClick={() => {
              setRole(r);
              toast(`Peran disimulasikan: ${r}`, 'success');
            }}
          >
            <span>{r}</span>
            {role === r && <Check size={14} />}
          </button>
        ))}
      </div>
      <div className="popover-divider" />
      <button
        type="button"
        className="menu-item"
        onClick={() => {
          navigate('/settings');
          onClose();
        }}
      >
        <span>Pengaturan studio</span>
        <ArrowRight size={14} />
      </button>
      <button
        type="button"
        className="menu-item"
        onClick={() => {
          navigate('/admin/integrations');
          onClose();
        }}
      >
        <span>Integrasi</span>
        <ArrowRight size={14} />
      </button>
      <button type="button" className="menu-item" onClick={toggleTheme}>
        <span>{theme === 'light' ? 'Mode gelap' : 'Mode terang'}</span>
        {theme === 'light' ? <Moon size={14} /> : <Sun size={14} />}
      </button>
      <div className="popover-divider" />
      <button
        type="button"
        className="menu-item is-muted"
        onClick={() => {
          toast('Ini sesi lokal playdesign OS.', 'default');
          onClose();
        }}
      >
        <span>Keluar</span>
        <LogOut size={14} />
      </button>
    </div>
  );
}

function CommandPalette({ onClose }: { onClose: () => void }) {
  const { db, toast, toggleTheme } = useStore();
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [cursor, setCursor] = useState(0);

  useEffect(() => {
    inputRef.current?.focus();
    document.body.classList.add('no-scroll');
    return () => document.body.classList.remove('no-scroll');
  }, []);

  const navResults = useMemo<CmdResult[]>(() => {
    return Object.entries(CRUMBS).map(([path, meta]) => ({
      id: `nav-${path}`,
      group: 'Halaman',
      label: meta.page,
      meta: meta.section,
      to: path,
    }));
  }, []);

  const dataResults = useMemo<CmdResult[]>(() => {
    const out: CmdResult[] = [];
    db.tasks.slice(0, 14).forEach((t) =>
      out.push({ id: t.id, group: 'Tugas', label: t.title, meta: `Jatuh tempo ${fmtDate(t.due)}`, to: '/task-board' }),
    );
    db.deals.slice(0, 12).forEach((d) =>
      out.push({ id: d.id, group: 'Deal', label: d.title, meta: `Tahap ${d.stage}`, to: '/crm/pipeline' }),
    );
    db.articles.slice(0, 12).forEach((a) =>
      out.push({ id: a.id, group: 'Artikel', label: a.title, meta: a.category, to: '/marketing/articles' }),
    );
    db.agents.forEach((a) =>
      out.push({ id: a.id, group: 'Agent', label: `${a.name} · ${a.role}`, meta: a.status, to: '/ai/directory' }),
    );
    db.jobs.slice(0, 8).forEach((j) =>
      out.push({ id: j.id, group: 'Job', label: `${j.id} · ${j.title}`, meta: j.status, to: '/ai/jobs' }),
    );
    db.companies.forEach((c) =>
      out.push({ id: c.id, group: 'Klien', label: c.name, meta: c.industry, to: '/crm/customers' }),
    );
    return out;
  }, [db]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    const all = [...navResults, ...dataResults];
    const filtered = q
      ? all.filter((r) => `${r.label} ${r.meta} ${r.group}`.toLowerCase().includes(q)).slice(0, 14)
      : [...navResults.slice(0, 7), ...dataResults.filter((r) => r.group === 'Deal' || r.group === 'Agent').slice(0, 5)];
    return filtered;
  }, [query, navResults, dataResults]);

  useEffect(() => {
    setCursor(0);
  }, [query]);

  const go = (to: string) => {
    navigate(to);
    onClose();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setCursor((c) => Math.min(c + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setCursor((c) => Math.max(c - 1, 0));
    } else if (e.key === 'Enter' && results[cursor]) {
      e.preventDefault();
      go(results[cursor].to);
    } else if (e.key === 'Escape') {
      onClose();
    }
  };

  let lastGroup = '';
  return (
    <div className="cmd-overlay" onMouseDown={onClose} role="presentation">
      <div className="cmd-palette" onMouseDown={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Pencarian global">
        <div className="cmd-input-row">
          <Search size={18} />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Cari halaman, task, deal, artikel, agent…"
            aria-label="Pencarian global"
          />
          <button type="button" className="cmd-esc" onClick={onClose}>
            Esc
          </button>
        </div>
        <div className="cmd-results">
          {results.length === 0 && (
            <div className="cmd-empty">
              <Search size={20} />
              <p>Tidak ada hasil untuk “{query}”.</p>
            </div>
          )}
          {results.map((r, i) => {
            const showHead = r.group !== lastGroup;
            lastGroup = r.group;
            return (
              <div key={`${r.group}-${r.id}`}>
                {showHead && <div className="cmd-group">{r.group}</div>}
                <button
                  type="button"
                  className={cx('cmd-item', i === cursor && 'is-active')}
                  onMouseEnter={() => setCursor(i)}
                  onClick={() => go(r.to)}
                >
                  <span className="cmd-item-icon">
                    {r.group === 'Halaman' ? <Command size={14} /> : r.group === 'Tugas' ? <FolderKanban size={14} /> : r.group === 'Deal' ? <Users size={14} /> : r.group === 'Artikel' ? <FileText size={14} /> : r.group === 'Agent' ? <Bot size={14} /> : r.group === 'Job' ? <Workflow size={14} /> : <Users size={14} />}
                  </span>
                  <span className="cmd-item-label">{r.label}</span>
                  <span className="cmd-item-meta">{r.meta}</span>
                </button>
              </div>
            );
          })}
          {query.trim() === '' && (
            <button
              type="button"
              className="cmd-item"
              onClick={() => {
                toggleTheme();
                toast('Tema diubah.', 'default');
                onClose();
              }}
            >
              <span className="cmd-item-icon">
                <Sun size={14} />
              </span>
              <span className="cmd-item-label">Ubah tema terang / gelap</span>
              <span className="cmd-item-meta">Aksi</span>
            </button>
          )}
        </div>
        <div className="cmd-foot">
          <span>
            <kbd>↑</kbd>
            <kbd>↓</kbd> navigasi
          </span>
          <span>
            <CornerDownLeft size={12} /> buka
          </span>
          <span className="cmd-foot-brand">
            <LogoMark size={12} /> playdesign
          </span>
        </div>
      </div>
    </div>
  );
}

