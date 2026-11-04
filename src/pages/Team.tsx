import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Activity,
  ArrowRight,
  Bell,
  Check,
  CheckCheck,
  CircleDot,
  Hash,
  Megaphone,
  MessageSquare,
  MessagesSquare,
  Search,
  Send,
  ShieldCheck,
  Users,
} from 'lucide-react';
import { useStore } from '../store/store';
import {
  Avatar,
  Badge,
  Card,
  EmptyState,
  Fig,
  PageHead,
  SearchField,
  SelectBox,
  Tabs,
} from '../components/ui';
import { cx, fmtDate, fmtTime, relTime } from '../lib/utils';
import type { NotificationItem } from '../data/types';

function TeamPage({
  title,
  desc,
  actions,
  children,
}: {
  title: string;
  desc: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <>
      <PageHead kicker="Team Collaboration · Foundation" title={title} desc={desc} actions={actions} />
      {children}
    </>
  );
}

const ROOMS = [
  { key: 'Studio', label: 'Studio', desc: 'Semua tim', icon: Hash },
  { key: 'Marketing', label: 'Marketing', desc: 'Konten & kampanye', icon: Megaphone },
  { key: 'Produksi', label: 'Produksi', desc: 'Aset & produksi', icon: CircleDot },
  { key: 'AI Team', label: 'AI Team', desc: 'Agent & handoff', icon: MessageSquare },
];

export function InternalChatPage() {
  const { db, user, sendChat, role } = useStore();
  const [room, setRoom] = useState('Studio');
  const [text, setText] = useState('');
  const endRef = useRef<HTMLDivElement>(null);
  const messages = db.chat.filter((c) => c.room === room);
  const members = db.users.filter((u) => u.status === 'Aktif');

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [messages.length, room]);

  const submit = () => {
    const value = text.trim();
    if (!value) return;
    sendChat(room, value);
    setText('');
  };

  const lastByRoom = (key: string) => {
    const list = db.chat.filter((c) => c.room === key);
    return list[list.length - 1];
  };

  return (
    <TeamPage
      title="Internal Chat"
      desc="Ruang percakapan tim per topik. Pesan tidak menjadi instruksi pengiriman atau approval."
      actions={
        <Badge tone="success" dot>
          {members.length} anggota aktif
        </Badge>
      }
    >
      <div className="im-layout">
        <aside className="im-rooms">
          <div className="im-rooms-head">
            <h2 className="card-title">Ruang</h2>
            <span className="muted-small">{db.workspaces.find((w) => w.active)?.name}</span>
          </div>
          <div className="room-list">
            {ROOMS.map((r) => {
              const last = lastByRoom(r.key);
              const Icon = r.icon;
              return (
                <button
                  key={r.key}
                  type="button"
                  className={cx('room-item', room === r.key && 'is-active')}
                  onClick={() => setRoom(r.key)}
                >
                  <span className="room-icon">
                    <Icon size={15} />
                  </span>
                  <div>
                    <strong>{r.label}</strong>
                    <span>{last ? last.text : r.desc}</span>
                  </div>
                  {last && <time>{fmtTime(last.at)}</time>}
                </button>
              );
            })}
          </div>
          <div className="im-members">
            <span className="field-label">Anggota</span>
            <ul>
              {members.map((member) => (
                <li key={member.id}>
                  <Avatar name={member.name} size={26} />
                  <div>
                    <strong>{member.name}</strong>
                    <span>{member.role}</span>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </aside>

        <Card className="chat-card im-card" bodyClass="chat-card-body">
          <div className="chat-head">
            <div>
              <h2 className="card-title">#{room}</h2>
              <p className="card-sub">{ROOMS.find((r) => r.key === room)?.desc}</p>
            </div>
            <Badge tone="neutral">{messages.length} pesan</Badge>
          </div>

          <div className="chat-log" role="log" aria-live="polite">
            {messages.length === 0 ? (
              <EmptyState
                compact
                icon={<MessagesSquare size={20} />}
                title="Ruang masih kosong"
                desc="Tulis pesan pertama untuk membuka percakapan."
              />
            ) : (
              messages.map((message) => {
                const mine = message.mine || message.author === user.name;
                return (
                  <div key={message.id} className={cx('chat-msg', mine && 'is-mine')}>
                    <Avatar name={message.author} size={30} />
                    <div className="chat-bubble-wrap">
                      <div className="chat-meta">
                        <strong>{message.author}</strong>
                        <span>{message.role}</span>
                        <time>{fmtTime(message.at)}</time>
                      </div>
                      <div className="chat-bubble">{message.text}</div>
                    </div>
                  </div>
                );
              })
            )}
            <div ref={endRef} />
          </div>

          <div className="chat-composer">
            <input
              className="input"
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  submit();
                }
              }}
              placeholder={`Tulis pesan ke #${room}…`}
              aria-label={`Tulis pesan ke ${room}`}
            />
            <button type="button" className="btn btn-primary" onClick={submit} disabled={!text.trim()}>
              <Send size={14} /> Kirim
            </button>
          </div>
          <p className="chat-guard">
            <ShieldCheck size={13} /> Percakapan tidak mengubah status konten. Keputusan tetap lewat Persetujuan.
          </p>
        </Card>
      </div>
    </TeamPage>
  );
}

const NOTIF_TABS = [
  { key: 'all', label: 'Semua' },
  { key: 'unread', label: 'Belum dibaca' },
  { key: 'approval', label: 'Approval' },
  { key: 'job', label: 'Job' },
  { key: 'system', label: 'Sistem' },
  { key: 'task', label: 'Tugas' },
];

const notifTone: Record<NotificationItem['kind'], 'warning' | 'danger' | 'success' | 'info' | 'neutral'> = {
  approval: 'warning',
  job: 'danger',
  comment: 'info',
  system: 'neutral',
  task: 'info',
};

const notifIcon = (kind: NotificationItem['kind']) => {
  if (kind === 'approval') return <ShieldCheck size={15} />;
  if (kind === 'job') return <Activity size={15} />;
  if (kind === 'comment') return <MessagesSquare size={15} />;
  if (kind === 'task') return <CheckCheck size={15} />;
  return <Bell size={15} />;
};

export function NotificationsPage() {
  const { db, markNotificationRead, markAllNotificationsRead } = useStore();
  const navigate = useNavigate();
  const [tab, setTab] = useState('all');
  const [query, setQuery] = useState('');

  const unread = db.notifications.filter((n) => !n.read).length;
  const filtered = db.notifications
    .filter((n) => {
      if (tab === 'all') return true;
      if (tab === 'unread') return !n.read;
      return n.kind === tab;
    })
    .filter((n) => `${n.title} ${n.body}`.toLowerCase().includes(query.toLowerCase()));

  const counts = {
    all: db.notifications.length,
    unread,
    approval: db.notifications.filter((n) => n.kind === 'approval').length,
    job: db.notifications.filter((n) => n.kind === 'job').length,
    system: db.notifications.filter((n) => n.kind === 'system').length,
    task: db.notifications.filter((n) => n.kind === 'task').length,
  };

  return (
    <TeamPage
      title="Notifications"
      desc="Hanya kejadian nyata: approval menunggu, job gagal, dan perubahan integrasi."
      actions={
        <button type="button" className="btn btn-outline btn-sm" onClick={markAllNotificationsRead} disabled={!unread}>
          <CheckCheck size={14} /> Tandai semua dibaca
        </button>
      }
    >
      <div className="figs figs-3">
        <Fig label="Belum dibaca" value={unread} hint={`dari ${db.notifications.length} notifikasi`} icon={<Bell size={17} />} />
        <Fig
          label="Approval menunggu"
          value={db.notifications.filter((n) => n.kind === 'approval' && !n.read).length}
          hint="Butuh keputusan Owner"
          icon={<ShieldCheck size={17} />}
        />
        <Fig
          label="Job bermasalah"
          value={db.notifications.filter((n) => n.kind === 'job' && !n.read).length}
          hint="Failed atau delivery uncertain"
          icon={<Activity size={17} />}
        />
      </div>

      <div className="toolbar toolbar-wrap mt-16">
        <Tabs
          items={NOTIF_TABS.map((t) => ({ key: t.key, label: t.label, count: counts[t.key as keyof typeof counts] }))}
          value={tab}
          onChange={setTab}
        />
        <div className="toolbar-actions">
          <SearchField value={query} onChange={setQuery} placeholder="Cari notifikasi…" />
        </div>
      </div>

      <Card bodyClass="card-flush">
        {filtered.length === 0 ? (
          <EmptyState icon={<Bell size={22} />} title="Tidak ada notifikasi" desc="Filter ini belum memiliki kejadian." />
        ) : (
          <ul className="notification-list">
            {filtered.map((notification) => (
              <li key={notification.id} className={cx('notification-row', !notification.read && 'is-unread')}>
                <span className={cx('notification-icon', `tone-${notifTone[notification.kind]}`)}>
                  {notifIcon(notification.kind)}
                </span>
                <button
                  type="button"
                  className="notification-main"
                  onClick={() => {
                    markNotificationRead(notification.id);
                    if (notification.href) navigate(notification.href);
                  }}
                >
                  <span className="notification-title">
                    {notification.title}
                    {!notification.read && <i className="unread-dot" aria-label="Belum dibaca" />}
                  </span>
                  <span className="notification-body">{notification.body}</span>
                  <span className="notification-meta">
                    <Badge tone={notifTone[notification.kind]}>{notification.kind}</Badge>
                    {relTime(notification.at)} · {fmtDate(notification.at)} {fmtTime(notification.at)}
                  </span>
                </button>
                <div className="notification-actions">
                  {!notification.read && (
                    <button
                      type="button"
                      className="icon-btn icon-btn-sm"
                      onClick={() => markNotificationRead(notification.id)}
                      aria-label="Tandai dibaca"
                      title="Tandai dibaca"
                    >
                      <Check size={14} />
                    </button>
                  )}
                  {notification.href && (
                    <button
                      type="button"
                      className="icon-btn icon-btn-sm"
                      onClick={() => {
                        markNotificationRead(notification.id);
                        navigate(notification.href!);
                      }}
                      aria-label="Buka terkait"
                      title="Buka terkait"
                    >
                      <ArrowRight size={14} />
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </TeamPage>
  );
}

interface FeedItem {
  id: string;
  at: string;
  who: string;
  action: string;
  target: string;
  module: string;
  kind: 'audit' | 'activity';
  detail?: string;
}

export function ActivityFeedPage() {
  const { db } = useStore();
  const [module, setModule] = useState('all');
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState('all');

  const items = useMemo<FeedItem[]>(() => {
    const audit: FeedItem[] = db.audit.map((a) => ({
      id: a.id,
      at: a.at,
      who: a.actor,
      action: a.action,
      target: a.target,
      module: a.module,
      kind: 'audit',
    }));
    const activities: FeedItem[] = db.activities.map((a) => ({
      id: a.id,
      at: a.at,
      who: a.who,
      action: a.subject,
      target: a.kind,
      module: 'CRM',
      kind: 'activity',
      detail: a.detail,
    }));
    return [...audit, ...activities].sort((a, b) => +new Date(b.at) - +new Date(a.at));
  }, [db.audit, db.activities]);

  const modules = Array.from(new Set(items.map((i) => i.module))).sort();
  const filtered = items
    .filter((item) => (module === 'all' ? true : item.module === module))
    .filter((item) => (kind === 'all' ? true : item.kind === kind))
    .filter((item) => `${item.who} ${item.action} ${item.target} ${item.detail ?? ''}`.toLowerCase().includes(query.toLowerCase()));

  return (
    <TeamPage
      title="Activity Feed"
      desc="Jejak pekerjaan manusia dan agent dalam satu garis waktu."
      actions={<Badge tone="neutral">{items.length} entri</Badge>}
    >
      <div className="figs figs-3">
        <Fig label="Entri pekan ini" value={items.filter((i) => Date.now() - +new Date(i.at) < 7 * 86400000).length} hint="Audit + aktivitas CRM" icon={<Activity size={17} />} />
        <Fig label="Aksi agent" value={items.filter((i) => i.who.includes('agent')).length} hint="Selalu lewat guard" icon={<MessagesSquare size={17} />} />
        <Fig label="Modul tercatat" value={modules.length} hint="Dari audit trail" icon={<Users size={17} />} />
      </div>

      <div className="toolbar toolbar-wrap mt-16">
        <div className="toolbar-actions">
          <SearchField value={query} onChange={setQuery} placeholder="Cari aktor, aksi, atau target…" />
          <SelectBox
            label="Filter jenis"
            value={kind}
            onChange={setKind}
            options={[
              { value: 'all', label: 'Semua jenis' },
              { value: 'audit', label: 'Audit sistem' },
              { value: 'activity', label: 'Aktivitas CRM' },
            ]}
          />
          <SelectBox
            label="Filter modul"
            value={module}
            onChange={setModule}
            options={[{ value: 'all', label: 'Semua modul' }, ...modules.map((m) => ({ value: m, label: m }))]}
          />
        </div>
      </div>

      <Card bodyClass="card-flush">
        {filtered.length === 0 ? (
          <EmptyState icon={<Activity size={22} />} title="Tidak ada aktivitas" desc="Coba modul atau kata kunci lain." />
        ) : (
          <ul className="feed-list">
            {filtered.slice(0, 40).map((item) => (
              <li key={`${item.kind}-${item.id}`} className="feed-item">
                <span className={cx('feed-mark', item.kind === 'audit' ? 'is-audit' : 'is-crm')}>
                  {item.kind === 'audit' ? <ShieldCheck size={14} /> : <Users size={14} />}
                </span>
                <div className="feed-main">
                  <div className="feed-copy">
                    <strong>{item.who}</strong> {item.action.toLowerCase()} <span>{item.target}</span>
                  </div>
                  {item.detail && <p className="feed-detail">{item.detail}</p>}
                  <div className="feed-meta">
                    <Badge tone="neutral">{item.module}</Badge>
                    <span>{item.kind === 'audit' ? 'Audit' : 'CRM activity'}</span>
                    <span>
                      {fmtDate(item.at)} · {fmtTime(item.at)}
                    </span>
                    <span>{relTime(item.at)}</span>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <p className="footnote">
        <Search size={12} /> Feed menggabungkan audit trail sistem dan aktivitas CRM. Tidak ada entri yang bisa dihapus dari tampilan.
      </p>
    </TeamPage>
  );
}
