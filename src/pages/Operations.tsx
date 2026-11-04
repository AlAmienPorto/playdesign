import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Activity,
  ArrowRight,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Clock,
  FileText,
  Lock,
  MessageSquare,
  RefreshCw,
  RotateCcw,
  Send,
  ShieldCheck,
  ShieldX,
  SquareKanban,
  Users,
  X,
} from 'lucide-react';
import { useStore } from '../store/store';
import {
  AutoBadge,
  Badge,
  Card,
  Drawer,
  EmptyState,
  Fig,
  PageHead,
  SearchField,
  SelectBox,
  Tabs,
} from '../components/ui';
import { TaskBoardView } from '../components/TaskBoard';
import { SocialPostPreview } from '../components/SocialPostPreview';
import {
  articleStatusLabel,
  cx,
  fmtDate,
  fmtLongDate,
  fmtTime,
  monthLabel,
  relTime,
  sameDay,
} from '../lib/utils';
import type { Approval } from '../data/types';

export function TaskBoardPage() {
  const { db } = useStore();
  const open = db.tasks.filter((t) => t.status !== 'done').length;
  const overdue = db.tasks.filter((t) => t.status !== 'done' && new Date(t.due).getTime() < Date.now()).length;

  return (
    <>
      <PageHead
        kicker="Operations · Live"
        title="Task Board"
        desc="Kanban tugas lintas proyek. Setiap perpindahan kolom dicatat di audit."
        actions={
          <div className="detail-inline">
            <Badge tone="info">{open} terbuka</Badge>
            {overdue > 0 && <Badge tone="danger">{overdue} lewat tenggat</Badge>}
          </div>
        }
      />
      <TaskBoardView />
    </>
  );
}

type CalendarKind = 'task' | 'content' | 'approval' | 'project';

interface CalEvent {
  id: string;
  title: string;
  date: string;
  kind: CalendarKind;
  href: string;
  sub?: string;
}

const WEEKDAYS = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'];

const KIND_LABEL: Record<CalendarKind, string> = {
  task: 'Tugas',
  content: 'Konten',
  approval: 'Approval',
  project: 'Proyek',
};

export function CalendarPage() {
  const { db } = useStore();
  const navigate = useNavigate();
  const [cursor, setCursor] = useState(() => new Date());
  const [selected, setSelected] = useState<Date | null>(null);

  const events = useMemo<CalEvent[]>(() => {
    const list: CalEvent[] = [];
    db.tasks.forEach((t) =>
      list.push({
        id: `task-${t.id}`,
        title: t.title,
        date: t.due,
        kind: 'task',
        href: '/task-board',
        sub: db.users.find((u) => u.id === t.assigneeId)?.name,
      }),
    );
    db.articles.forEach((a) => {
      const date = a.scheduledAt ?? (a.status === 'published' ? a.date : null);
      if (!date) return;
      list.push({
        id: `art-${a.id}`,
        title: a.title,
        date,
        kind: 'content',
        href: '/marketing/articles',
        sub: articleStatusLabel[a.status],
      });
    });
    db.projects.forEach((p) =>
      list.push({
        id: `proj-${p.id}`,
        title: p.name,
        date: p.dueAt,
        kind: 'project',
        href: '/projects',
        sub: p.status,
      }),
    );
    db.approvals
      .filter((a) => a.status === 'pending')
      .forEach((a) =>
        list.push({
          id: `ap-${a.id}`,
          title: a.title,
          date: a.at,
          kind: 'approval',
          href: '/approvals',
          sub: a.kind,
        }),
      );
    db.social
      .filter((s) => s.status === 'Scheduled')
      .forEach((s) =>
        list.push({
          id: `so-${s.id}`,
          title: s.title,
          date: s.date,
          kind: 'content',
          href: '/marketing/social',
          sub: s.channel,
        }),
      );
    return list;
  }, [db]);

  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const first = new Date(year, month, 1);
  const startOffset = (first.getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const dayCount = Math.ceil((startOffset + daysInMonth) / 7) * 7;

  const cells = Array.from({ length: dayCount }, (_, i) => {
    const dayIndex = i - startOffset + 1;
    const inMonth = dayIndex >= 1 && dayIndex <= daysInMonth;
    const date = new Date(year, month, dayIndex);
    return { date, inMonth, key: `${year}-${month}-${dayIndex}` };
  });

  const eventsOn = (date: Date) => events.filter((e) => sameDay(e.date, date));
  const selectedEvents = selected ? eventsOn(selected).sort((a, b) => +new Date(a.date) - +new Date(b.date)) : [];
  const upcoming = [...events]
    .filter((e) => +new Date(e.date) >= Date.now())
    .sort((a, b) => +new Date(a.date) - +new Date(b.date))
    .slice(0, 5);

  return (
    <>
      <PageHead
        kicker="Operations · Live"
        title="Calendar"
        desc="Jadwal tugas, konten terjadwal, dan proyek dalam satu kalender. Konten hanya muncul setelah approved."
        actions={
          <Badge tone="neutral">
            {events.length} jadwal bulan ini
          </Badge>
        }
      />

      <div className="overview-grid">
        <Card className="span-8" bodyClass="calendar-card-body">
          <div className="calendar-head">
            <div>
              <h2 className="card-title">{monthLabel(cursor)}</h2>
              <p className="card-sub">Minggu dimulai Senin.</p>
            </div>
            <div className="calendar-nav">
              <button
                type="button"
                className="icon-btn"
                onClick={() => setCursor(new Date(year, month - 1, 1))}
                aria-label="Bulan sebelumnya"
              >
                <ChevronLeft size={16} />
              </button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setCursor(new Date())}>
                Hari ini
              </button>
              <button
                type="button"
                className="icon-btn"
                onClick={() => setCursor(new Date(year, month + 1, 1))}
                aria-label="Bulan berikutnya"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>

          <div className="calendar-weekdays">
            {WEEKDAYS.map((day) => (
              <span key={day}>{day}</span>
            ))}
          </div>
          <div className="calendar-grid">
            {cells.map((cell) => {
              const list = eventsOn(cell.date);
              const isToday = sameDay(cell.date, new Date());
              return (
                <button
                  type="button"
                  key={cell.key}
                  className={cx(
                    'calendar-day',
                    !cell.inMonth && 'is-outside',
                    isToday && 'is-today',
                    selected && sameDay(cell.date, selected) && 'is-selected',
                  )}
                  onClick={() => setSelected(cell.date)}
                >
                  <span className="calendar-date">{cell.date.getDate()}</span>
                  <div className="calendar-events">
                    {list.slice(0, 2).map((event) => (
                      <span key={event.id} className={cx('calendar-event', `kind-${event.kind}`)}>
                        <i />
                        {event.title}
                      </span>
                    ))}
                    {list.length > 2 && <span className="calendar-more">+{list.length - 2} lagi</span>}
                  </div>
                </button>
              );
            })}
          </div>

          <div className="calendar-legend">
            {(['task', 'content', 'approval', 'project'] as const).map((kind) => (
              <span key={kind} className={cx('legend-item', `kind-${kind}`)}>
                <i /> {KIND_LABEL[kind]}
              </span>
            ))}
          </div>
        </Card>

        <div className="span-4 stack">
          <Card title="Jadwal berikutnya" sub="Lima item terdekat.">
            {upcoming.length === 0 ? (
              <p className="muted-small">Tidak ada jadwal mendatang.</p>
            ) : (
              <ul className="schedule-list">
                {upcoming.map((event) => (
                  <li key={event.id} className="schedule-item">
                    <span className={cx('schedule-mark', `kind-${event.kind}`)}>
                      <CalendarDays size={14} />
                    </span>
                    <button type="button" onClick={() => navigate(event.href)}>
                      <span className="schedule-title">{event.title}</span>
                      <span className="schedule-meta">
                        {fmtDate(event.date)} · {fmtTime(event.date)} · {KIND_LABEL[event.kind]}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card title="Guard kalender" sub="Semua konten keluar harus approved.">
            <ul className="rule-list">
              <li>
                <ShieldCheck size={14} /> Hanya konten approved yang tampil sebagai jadwal keluar.
              </li>
              <li>
                <Lock size={14} /> Menggeser jadwal hanya mengubah scheduled_at, bukan status konten.
              </li>
              <li>
                <CircleAlert size={14} /> Delivery uncertain tidak muncul sebagai jadwal baru.
              </li>
            </ul>
          </Card>
        </div>
      </div>

      <Drawer
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        title={selected ? fmtLongDate(selected.toISOString()) : ''}
        sub={`${selectedEvents.length} item pada hari ini`}
        footer={
          <button type="button" className="btn btn-ghost" onClick={() => setSelected(null)}>
            Tutup
          </button>
        }
      >
        {selectedEvents.length === 0 ? (
          <EmptyState
            icon={<CalendarDays size={22} />}
            title="Hari ini kosong"
            desc="Tidak ada tugas, konten, atau approval yang jatuh tempo."
          />
        ) : (
          <ul className="day-events">
            {selectedEvents.map((event) => (
              <li key={event.id}>
                <span className={cx('day-event-mark', `kind-${event.kind}`)}>
                  {event.kind === 'task' ? <SquareKanban size={14} /> : event.kind === 'content' ? <FileText size={14} /> : event.kind === 'approval' ? <ShieldCheck size={14} /> : <Users size={14} />}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setSelected(null);
                    navigate(event.href);
                  }}
                >
                  <strong>{event.title}</strong>
                  <span>
                    {fmtTime(event.date)} · {KIND_LABEL[event.kind]}
                    {event.sub ? ` · ${event.sub}` : ''}
                  </span>
                </button>
                <ArrowRight size={14} />
              </li>
            ))}
          </ul>
        )}
      </Drawer>
    </>
  );
}

interface FeedEntry {
  id: string;
  at: string;
  actor: string;
  action: string;
  target: string;
  module: string;
  source: 'audit' | 'crm';
  detail?: string;
}

export function OperationsActivityPage() {
  const { db } = useStore();
  const [module, setModule] = useState('all');
  const [query, setQuery] = useState('');

  const entries = useMemo<FeedEntry[]>(() => {
    const audit: FeedEntry[] = db.audit.map((a) => ({
      id: a.id,
      at: a.at,
      actor: a.actor,
      action: a.action,
      target: a.target,
      module: a.module,
      source: 'audit',
    }));
    const crm: FeedEntry[] = db.activities.map((a) => ({
      id: a.id,
      at: a.at,
      actor: a.who,
      action: a.subject,
      target: a.kind,
      module: 'CRM',
      source: 'crm',
      detail: a.detail,
    }));
    return [...audit, ...crm].sort((a, b) => +new Date(b.at) - +new Date(a.at));
  }, [db.audit, db.activities]);

  const modules = Array.from(new Set(entries.map((e) => e.module))).sort();
  const filtered = entries
    .filter((e) => (module === 'all' ? true : e.module === module))
    .filter((e) => `${e.actor} ${e.action} ${e.target} ${e.detail ?? ''}`.toLowerCase().includes(query.toLowerCase()));

  const groups = useMemo(() => {
    const map = new Map<string, FeedEntry[]>();
    filtered.slice(0, 40).forEach((entry) => {
      const key = fmtLongDate(entry.at);
      map.set(key, [...(map.get(key) ?? []), entry]);
    });
    return Array.from(map.entries());
  }, [filtered]);

  return (
    <>
      <PageHead
        kicker="Operations · Live"
        title="Activity"
        desc="Jejak pekerjaan dari audit trail dan aktivitas CRM. Tidak ada entri yang bisa disembunyikan."
        actions={<Badge tone="neutral">{filtered.length} entri</Badge>}
      />

      <div className="figs figs-3">
        <Fig label="Total entri" value={entries.length} hint="Audit + aktivitas" icon={<Activity size={17} />} />
        <Fig label="Aksi agent" value={entries.filter((e) => e.actor.includes('agent')).length} hint="Selalu lewat guard" icon={<ShieldCheck size={17} />} />
        <Fig label="Modul" value={modules.length} hint="Lintas workspace" icon={<Users size={17} />} />
      </div>

      <div className="toolbar toolbar-wrap mt-16">
        <SearchField value={query} onChange={setQuery} placeholder="Cari aktor, aksi, atau target…" />
        <div className="toolbar-actions">
          <SelectBox
            label="Filter modul"
            value={module}
            onChange={setModule}
            options={[{ value: 'all', label: 'Semua modul' }, ...modules.map((m) => ({ value: m, label: m }))]}
          />
        </div>
      </div>

      {groups.length === 0 ? (
        <Card>
          <EmptyState icon={<Activity size={22} />} title="Tidak ada aktivitas" desc="Coba modul atau kata kunci lain." />
        </Card>
      ) : (
        <div className="feed-groups">
          {groups.map(([day, list]) => (
            <Card key={day} title={day} sub={`${list.length} entri`}>
              <ul className="feed-list">
                {list.map((entry) => (
                  <li key={`${entry.source}-${entry.id}`} className="feed-item">
                    <span className={cx('feed-mark', entry.source === 'audit' ? 'is-audit' : 'is-crm')}>
                      {entry.source === 'audit' ? <ShieldCheck size={14} /> : <Users size={14} />}
                    </span>
                    <div className="feed-main">
                      <div className="feed-copy">
                        <strong>{entry.actor}</strong> {entry.action.toLowerCase()} <span>{entry.target}</span>
                      </div>
                      {entry.detail && <p className="feed-detail">{entry.detail}</p>}
                      <div className="feed-meta">
                        <Badge tone="neutral">{entry.module}</Badge>
                        <span>{entry.source === 'audit' ? 'Audit' : 'CRM activity'}</span>
                        <span>{fmtTime(entry.at)}</span>
                        <span>{relTime(entry.at)}</span>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          ))}
        </div>
      )}
      <p className="footnote">
        <Lock size={12} /> Audit trail bersifat append-only. Retensi mengikuti kebijakan workspace.
      </p>
    </>
  );
}

const APPROVAL_TABS = [
  { key: 'all', label: 'Semua' },
  { key: 'pending', label: 'Menunggu' },
  { key: 'revision', label: 'Minta Revisi' },
  { key: 'approved', label: 'Disetujui' },
  { key: 'rejected', label: 'Ditolak' },
];

const qcTone = (qc: Approval['qc']) => (qc === 'PASS' ? 'success' : qc === 'FAIL' ? 'danger' : 'warning');

export function ApprovalsPage() {
  const { db, role, decideApproval, toast } = useStore();
  const [tab, setTab] = useState('all');
  const [query, setQuery] = useState('');
  const [active, setActive] = useState<Approval | null>(null);
  const [note, setNote] = useState('');
  const isOwner = role === 'Owner';

  const counts = {
    all: db.approvals.length,
    pending: db.approvals.filter((a) => a.status === 'pending').length,
    revision: db.approvals.filter((a) => a.status === 'revision').length,
    approved: db.approvals.filter((a) => a.status === 'approved').length,
    rejected: db.approvals.filter((a) => a.status === 'rejected').length,
  };

  const filtered = db.approvals
    .filter((a) => (tab === 'all' ? true : a.status === tab))
    .filter((a) => `${a.title} ${a.kind} ${a.requestedBy}`.toLowerCase().includes(query.toLowerCase()))
    .sort((a, b) => +new Date(b.at) - +new Date(a.at));

  const openReview = (approval: Approval) => {
    setActive(approval);
    setNote(approval.note ?? '');
  };

  const decide = (decision: 'approved' | 'rejected' | 'revision') => {
    if (!active) return;
    if ((decision === 'rejected' || decision === 'revision') && !note.trim()) {
      toast(`Alasan ${decision === 'revision' ? 'revisi' : 'penolakan'} wajib diisi agar tercatat di audit trail.`, 'danger');
      return;
    }
    decideApproval(active.id, decision, note.trim());
    setActive(null);
    setNote('');
  };

  const article = active?.articleId ? db.articles.find((a) => a.id === active.articleId) : undefined;

  return (
    <>
      <PageHead
        kicker="Operations · Live"
        title="Persetujuan"
        desc="Satu-satunya jalur untuk mengirim konten keluar. QC PASS bukan pengganti keputusan Owner."
        actions={
          <Badge tone={counts.pending ? 'warning' : 'success'} dot>
            {counts.pending} menunggu
          </Badge>
        }
      />

      <div className="figs figs-4">
        <Fig label="Menunggu" value={counts.pending} hint="Butuh keputusan" icon={<Clock size={17} />} />
        <Fig label="Minta Revisi" value={counts.revision} hint="Perbaikan diajukan" icon={<RotateCcw size={17} />} />
        <Fig label="Disetujui" value={counts.approved} hint="Siap masuk antrean" icon={<Check size={17} />} />
        <Fig label="Ditolak" value={counts.rejected} hint="Dikembalikan ke draft" icon={<ShieldX size={17} />} />
      </div>

      {!isOwner && (
        <div className="notice-banner tone-warning mt-16">
          <Lock size={16} />
          <div>
            <strong>Hanya Owner yang bisa memutuskan pengiriman keluar.</strong>
            <span>Peran aktif: {role}. Kamu bisa membaca packet, tetapi tombol keputusan dinonaktifkan.</span>
          </div>
        </div>
      )}

      <div className="toolbar toolbar-wrap mt-16">
        <Tabs
          items={APPROVAL_TABS.map((t) => ({ ...t, count: counts[t.key as keyof typeof counts] }))}
          value={tab}
          onChange={setTab}
        />
        <div className="toolbar-actions">
          <SearchField value={query} onChange={setQuery} placeholder="Cari packet atau pemohon…" />
        </div>
      </div>

      {filtered.length === 0 ? (
        <Card>
          <EmptyState icon={<ShieldCheck size={22} />} title="Tidak ada packet" desc="Filter ini belum memiliki approval." />
        </Card>
      ) : (
        <div className="approval-list">
          {filtered.map((approval) => (
            <article key={approval.id} className={cx('approval-card', approval.status === 'pending' && 'is-pending')}>
              <div className="approval-head">
                <span className={cx('approval-icon', `tone-${qcTone(approval.qc)}`)}>
                  {approval.status === 'approved' ? <Check size={16} /> : approval.status === 'rejected' ? <X size={16} /> : <ShieldCheck size={16} />}
                </span>
                <div className="approval-title">
                  <h3>{approval.title}</h3>
                  <span>
                    {approval.kind} · diminta {approval.requestedBy} · {relTime(approval.at)}
                  </span>
                </div>
                <div className="approval-badges">
                  <Badge tone={qcTone(approval.qc)} dot>
                    QC {approval.qc}
                  </Badge>
                  <AutoBadge value={approval.status === 'pending' ? 'Menunggu' : approval.status === 'revision' ? 'Minta Revisi' : approval.status === 'approved' ? 'Disetujui' : 'Ditolak'} />
                </div>
              </div>
              {approval.risk && <p className="approval-risk">{approval.risk}</p>}
              {approval.note && <p className="approval-note">Catatan keputusan: {approval.note}</p>}
              <div className="approval-foot">
                <span className="muted-small">
                  {approval.module} · {approval.id}
                  {approval.decidedBy ? ` · diputuskan ${approval.decidedBy}` : ''}
                </span>
                <button type="button" className="btn btn-outline btn-sm" onClick={() => openReview(approval)}>
                  {approval.status === 'pending' || approval.status === 'revision' ? 'Tinjau packet' : 'Lihat detail'} <ArrowRight size={13} />
                </button>
              </div>
            </article>
          ))}
        </div>
      )}

      <Drawer
        open={Boolean(active)}
        onClose={() => setActive(null)}
        title={active?.title ?? 'Approval packet'}
        sub={active ? `${active.kind} · ${active.id}` : undefined}
        width={620}
        footer={
          active?.status === 'pending' || active?.status === 'revision' ? (
            <>
              <button type="button" className="btn btn-ghost" onClick={() => setActive(null)}>
                Tutup
              </button>
              <button
                type="button"
                className="btn btn-outline"
                onClick={() => decide('revision')}
                disabled={!isOwner}
              >
                <RotateCcw size={14} /> Minta Revisi
              </button>
              <button
                type="button"
                className="btn btn-danger-text"
                onClick={() => decide('rejected')}
                disabled={!isOwner}
              >
                <X size={14} /> Tolak
              </button>
              <button type="button" className="btn btn-primary" onClick={() => decide('approved')} disabled={!isOwner}>
                <Check size={14} /> Setujui
              </button>
            </>
          ) : (
            <button type="button" className="btn btn-ghost" onClick={() => setActive(null)}>
              Tutup
            </button>
          )
        }
      >
        {active && (
          <div className="detail-stack">
            <div className="detail-inline">
              <Badge tone={qcTone(active.qc)} dot>
                QC {active.qc}
              </Badge>
              <Badge tone="neutral">{active.module}</Badge>
              <AutoBadge value={active.status === 'pending' ? 'Menunggu' : active.status === 'revision' ? 'Minta Revisi' : active.status === 'approved' ? 'Disetujui' : 'Ditolak'} />
            </div>

            <div className="detail-grid">
              <div>
                <span className="detail-label">Diminta oleh</span>
                <strong>{active.requestedBy}</strong>
              </div>
              <div>
                <span className="detail-label">Waktu</span>
                <span>{fmtDate(active.at, true)} · {fmtTime(active.at)}</span>
              </div>
              <div>
                <span className="detail-label">Jenis</span>
                <span>{active.kind}</span>
              </div>
              <div>
                <span className="detail-label">Keputusan</span>
                <span>{active.decidedBy ?? 'Belum diputuskan'}</span>
              </div>
            </div>

            {active.risk && (
              <div className={cx('notice-banner', active.qc === 'FAIL' ? 'tone-danger' : 'tone-warning')}>
                <CircleAlert size={16} />
                <div>
                  <strong>Catatan risiko</strong>
                  <span>{active.risk}</span>
                </div>
              </div>
            )}

            {article && (
              <div className="detail-block">
                <div className="detail-block-head">
                  <FileText size={14} /> Konten yang diajukan
                </div>
                <div className="approval-preview">
                  <span className="preview-kicker">{article.category}</span>
                  <h3>{article.title}</h3>
                  <p>{article.excerpt}</p>
                  <span className="muted-small">
                    {articleStatusLabel[article.status]} · {article.channels?.join(', ') ?? 'Website'}
                  </span>
                </div>
              </div>
            )}

            {(active.kind === 'Jadwal sosial' || active.previewData) && (
              <div className="detail-block">
                <div className="detail-block-head">
                  <FileText size={14} /> Live Pratinjau Sosial Media ({active.previewData?.channel ?? 'Instagram'})
                </div>
                <SocialPostPreview
                  channel={active.previewData?.channel ?? 'Instagram'}
                  title={active.title}
                  caption={active.previewData?.caption}
                  hashtags={active.previewData?.hashtags}
                  slides={active.previewData?.slides}
                />
              </div>
            )}

            <div className="detail-block">
              <div className="detail-block-head">
                <MessageSquare size={14} /> Catatan keputusan / feedback revisi
              </div>
              {active.status === 'pending' || active.status === 'revision' ? (
                <textarea
                  className="input"
                  rows={3}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Catatan persetujuan, alasan penolakan, atau instruksi revisi yang wajib diperbaiki…"
                  disabled={!isOwner}
                />
              ) : (
                <p className="prose-sm">{active.note ?? 'Tidak ada catatan tambahan.'}</p>
              )}
            </div>

            <div className="notice-banner tone-neutral">
              <Lock size={16} />
              <div>
                <strong>Keputusan mengikat kedua status.</strong>
                <span>
                  Setujui mengubah status konten menjadi approved. Delivery tetap berjalan terpisah dan tidak di-retry otomatis
                  bila uncertain.
                </span>
              </div>
            </div>

            <p className="footnote">
              <ShieldCheck size={12} /> Tanpa izin content.publish, tombol keputusan dinonaktifkan di klien dan ditolak di server.
            </p>
          </div>
        )}
      </Drawer>
    </>
  );
}
