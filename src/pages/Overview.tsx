import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  Bot,
  CalendarClock,
  Check,
  CircleAlert,
  Clock,
  FileText,
  FolderKanban,
  Plus,
  Send,
  ShieldCheck,
  Sparkles,
  Users,
} from 'lucide-react';
import { useStore } from '../store/store';
import {
  Avatar,
  AutoBadge,
  Badge,
  Card,
  Fig,
  LinkButton,
  PageHead,
} from '../components/ui';
import { MiniBars } from '../components/charts';
import { TaskComposer } from '../components/dialogs';
import {
  compactRupiah,
  cx,
  dayOffset,
  fmtDate,
  fmtTime,
  num,
  relTime,
} from '../lib/utils';
import type { AgentStatus } from '../data/types';

const agentTone: Record<AgentStatus, string> = {
  Aktif: 'success',
  Idle: 'neutral',
  Dijeda: 'warning',
  Error: 'danger',
};

const greeting = () => {
  const h = new Date().getHours();
  if (h < 11) return 'Selamat pagi';
  if (h < 15) return 'Selamat siang';
  if (h < 19) return 'Selamat sore';
  return 'Selamat malam';
};

export function Overview() {
  const { db, user, setTaskStatus, toast } = useStore();
  const navigate = useNavigate();
  const [taskOpen, setTaskOpen] = useState(false);

  const openDeals = db.deals.filter((d) => d.stage !== 'won' && d.stage !== 'lost');
  const pipeline = openDeals.reduce((s, d) => s + d.value, 0);
  const won = db.deals.filter((d) => d.stage === 'won');
  const wonValue = won.reduce((s, d) => s + d.value, 0);
  const openTasks = db.tasks.filter((t) => t.status !== 'done');
  const overdue = openTasks.filter((t) => new Date(t.due).getTime() < Date.now());
  const pending = db.approvals.filter((a) => a.status === 'pending');
  const activeJobs = db.jobs.filter((j) => j.status === 'running' || j.status === 'queued');
  const attentionJobs = db.jobs.filter((j) => j.status === 'failed' || j.status === 'delivery_uncertain');
  const published = db.articles.filter((a) => a.status === 'published');
  const totalViews = db.articles.reduce((s, a) => s + a.views, 0);
  const inReview = db.articles.filter((a) => a.status === 'in_review');

  const focusTasks = [...openTasks]
    .sort((a, b) => {
      const rank = { Tinggi: 0, Sedang: 1, Rendah: 2 };
      if (rank[a.priority] !== rank[b.priority]) return rank[a.priority] - rank[b.priority];
      return new Date(a.due).getTime() - new Date(b.due).getTime();
    })
    .slice(0, 5);

  const schedule = useMemo(() => {
    const now = Date.now();
    const items = [
      ...openTasks.map((t) => ({
        id: `t-${t.id}`,
        at: t.due,
        title: t.title,
        kind: 'Tugas',
        to: '/task-board',
      })),
      ...db.social
        .filter((s) => new Date(s.date).getTime() >= now)
        .map((s) => ({
          id: `s-${s.id}`,
          at: s.date,
          title: `${s.title} · ${s.channel}`,
          kind: 'Konten',
          to: '/marketing/social',
        })),
      ...db.projects.map((p) => ({
        id: `p-${p.id}`,
        at: p.dueAt,
        title: `Deadline ${p.name}`,
        kind: 'Proyek',
        to: '/projects',
      })),
    ];
    return items.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime()).slice(0, 4);
  }, [openTasks, db.social, db.projects]);

  const workload = useMemo(() => {
    const days = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'];
    return days.map((label, i) => {
      const start = new Date();
      start.setDate(start.getDate() - 3 + i);
      const count = db.tasks.filter((t) => {
        const d = new Date(t.due);
        return (
          d.getDate() === start.getDate() &&
          d.getMonth() === start.getMonth() &&
          d.getFullYear() === start.getFullYear()
        );
      }).length;
      return { label, value: count };
    });
  }, [db.tasks]);

  const deliveryCounts = ['published', 'scheduled', 'queued', 'delivery_uncertain', 'failed'].map((s) => ({
    status: s,
    count: db.articles.filter((a) => a.delivery === s).length,
  }));

  const aiSummary = [
    `Pipeline terbuka ${compactRupiah(pipeline)} dari ${openDeals.length} deal. ${openDeals.filter((d) => new Date(d.closeAt).getTime() - Date.now() < 14 * 86400000).length} deal menutup dalam 14 hari.`,
    `${inReview.length} artikel menunggu review dan ${pending.length} approval menunggu keputusan Owner.`,
    `${attentionJobs.length} job agent butuh perhatian manusia; tidak ada retry otomatis untuk delivery_uncertain.`,
  ];

  return (
    <>
      <PageHead
        kicker={
          <>
            <span className="kicker-dot" /> Overview · Command center
          </>
        }
        title={
          <>
            {greeting()}, <em className="serif-accent">{user.name.split(' ')[0]}</em>.
          </>
        }
        desc={`${pending.length} approval menunggu keputusanmu, ${attentionJobs.length} job agent perlu perhatian. Semua widget di sini bisa ditindaklanjuti.`}
        actions={
          <>
            <button type="button" className="btn btn-primary" onClick={() => setTaskOpen(true)}>
              <Plus size={15} /> Tugas baru
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => navigate('/approvals')}>
              <ShieldCheck size={15} /> Tinjau approval
            </button>
          </>
        }
      />

      <div className="figs figs-6">
        <Fig
          label="Pipeline aktif"
          value={compactRupiah(pipeline)}
          hint={`${openDeals.length} deal terbuka`}
          icon={<FolderKanban size={16} />}
          delta="+12% vs bulan lalu"
          deltaTone="success"
          onClick={() => navigate('/crm/pipeline')}
        />
        <Fig
          label="Menang bulan ini"
          value={compactRupiah(wonValue)}
          hint={`${won.length} deal ditutup`}
          icon={<Check size={16} />}
          delta="2 deal"
          deltaTone="success"
          onClick={() => navigate('/crm/deals')}
        />
        <Fig
          label="Tugas terbuka"
          value={openTasks.length}
          hint={overdue.length ? `${overdue.length} lewat tenggat` : 'Semua dalam jadwal'}
          icon={<FolderKanban size={16} />}
          deltaTone={overdue.length ? 'danger' : 'neutral'}
          delta={overdue.length ? `${overdue.length} terlambat` : undefined}
          onClick={() => navigate('/task-board')}
        />
        <Fig
          label="Approval menunggu"
          value={pending.length}
          hint="Butuh keputusan Owner"
          icon={<ShieldCheck size={16} />}
          delta={db.approvals.some((a) => a.qc === 'FAIL') ? '1 QC gagal' : undefined}
          deltaTone="danger"
          onClick={() => navigate('/approvals')}
        />
        <Fig
          label="Job agent hari ini"
          value={activeJobs.length}
          hint={`${db.jobs.filter((j) => j.status === 'running').length} berjalan · ${db.jobs.filter((j) => j.status === 'completed').length} selesai`}
          icon={<Bot size={16} />}
          onClick={() => navigate('/ai/jobs')}
        />
        <Fig
          label="Artikel terbit"
          value={published.length}
          hint={`${num(totalViews)} total kunjungan`}
          icon={<FileText size={16} />}
          delta={`${inReview.length} di review`}
          deltaTone="neutral"
          onClick={() => navigate('/marketing/articles')}
        />
      </div>

      <div className="overview-grid">
        <Card
          className="dark-card span-7 ai-widget"
          title={
            <span className="inline-title">
              <Sparkles size={16} /> Ringkasan AI studio
            </span>
          }
          sub="Dihasilkan dari data workspace · perlu approval sebelum dikirim"
          action={
            <Badge tone="neutral" className="on-dark">
              Hermes
            </Badge>
          }
        >
          <div className="ai-summary">
            <p className="ai-lead">
              Fokus pekan ini:{' '}
              <em>tutup retainer Karya, finalkan guideline Sagara, dan putuskan dua artikel review.</em>
            </p>
            <ul className="ai-points">
              {aiSummary.map((line) => (
                <li key={line}>
                  <span className="ai-bullet" />
                  {line}
                </li>
              ))}
            </ul>
            <div className="ai-foot">
              <span className="ai-source">
                Sumber: CRM · Marketing · Job Queue · {relTime(dayOffset(0, 8))}
              </span>
              <Link to="/ai/results" className="btn btn-light btn-sm">
                Buka hasil kerja <ArrowRight size={14} />
              </Link>
            </div>
          </div>
        </Card>

        <Card
          className="span-5"
          title="Antrean approval"
          sub="Tidak ada pengiriman tanpa keputusan manusia"
          action={<LinkButton to="/approvals">Semua</LinkButton>}
          bodyClass="no-pad"
        >
          <div className="queue-list">
            {pending.slice(0, 4).map((a) => (
              <button
                key={a.id}
                type="button"
                className="queue-item"
                onClick={() => navigate('/approvals')}
              >
                <span className={cx('queue-icon', a.qc === 'FAIL' ? 'is-danger' : a.qc === 'PENDING' ? 'is-warning' : 'is-ok')}>
                  {a.qc === 'FAIL' ? <CircleAlert size={15} /> : <ShieldCheck size={15} />}
                </span>
                <span className="queue-copy">
                  <span className="queue-title">{a.title}</span>
                  <span className="queue-meta">
                    {a.kind} · diajukan {a.requestedBy.split(' ')[0]} · {relTime(a.at)}
                  </span>
                </span>
                <Badge tone={a.qc === 'PASS' ? 'success' : a.qc === 'FAIL' ? 'danger' : 'warning'}>{`QC ${a.qc}`}</Badge>
              </button>
            ))}
            {pending.length === 0 && <p className="queue-empty">Tidak ada approval menunggu.</p>}
          </div>
          <div className="queue-foot">
            <span className="muted-small">
              <ShieldCheck size={13} /> Guard aktif di server
            </span>
            <Link to="/approvals" className="text-btn">
              Tinjau <ArrowRight size={13} />
            </Link>
          </div>
        </Card>

        <Card
          className="span-5"
          title="Tugas terbuka"
          sub={`${openTasks.length} tugas · diurutkan prioritas & tenggat`}
          action={<LinkButton to="/task-board">Task Board</LinkButton>}
          bodyClass="no-pad"
        >
          <div className="task-queue">
            {focusTasks.map((t) => {
              const assignee = db.users.find((u) => u.id === t.assigneeId);
              const isOverdue = new Date(t.due).getTime() < Date.now();
              return (
                <div className="task-row" key={t.id}>
                  <button
                    type="button"
                    className="task-check"
                    onClick={() => setTaskStatus(t.id, 'done')}
                    aria-label={`Selesaikan ${t.title}`}
                    title="Tandai selesai"
                  >
                    <Check size={12} />
                  </button>
                  <div className="task-row-main">
                    <span className="task-row-title">{t.title}</span>
                    <span className="task-row-meta">
                      {assignee?.name.split(' ')[0]} · {t.tags[0] ?? 'Umum'}
                    </span>
                  </div>
                  <span className={cx('task-due', isOverdue && 'is-overdue')}>
                    <Clock size={12} />
                    {fmtDate(t.due)}
                  </span>
                </div>
              );
            })}
          </div>
          <div className="queue-foot">
            <span className="muted-small">
              <CalendarClock size={13} /> {overdue.length} lewat tenggat
            </span>
            <button type="button" className="text-btn" onClick={() => setTaskOpen(true)}>
              <Plus size={13} /> Tambah
            </button>
          </div>
        </Card>

        <Card
          className="span-3"
          title="Kesehatan agent"
          sub="6 agent terdaftar"
          action={<LinkButton to="/ai/directory">Direktori</LinkButton>}
          bodyClass="no-pad"
        >
          <ul className="agent-health">
            {db.agents.map((a) => (
              <li key={a.id}>
                <span className={cx('health-dot', agentTone[a.status])} />
                <span className="health-name">{a.name}</span>
                <span className="health-rate">{a.successRate}%</span>
              </li>
            ))}
          </ul>
          <div className="queue-foot">
            <span className="muted-small">
              <CircleAlert size={13} /> 1 error · 1 dijeda
            </span>
            <Link to="/ai/directory" className="text-btn">
              Lihat <ArrowRight size={13} />
            </Link>
          </div>
        </Card>

        <Card
          className="span-4"
          title="Job berjalan"
          sub={`${activeJobs.length} di antrean · ${db.jobs.filter((j) => j.status === 'completed').length} selesai`}
          action={<LinkButton to="/ai/jobs">Job Queue</LinkButton>}
          bodyClass="no-pad"
        >
          <div className="job-mini-list">
            {db.jobs.slice(0, 4).map((j) => {
              const agent = db.agents.find((a) => a.id === j.agentId);
              return (
                <button key={j.id} type="button" className="job-mini" onClick={() => navigate('/ai/jobs')}>
                  <span className={cx('job-mini-dot', j.status.replace('_', '-'))} />
                  <span className="job-mini-main">
                    <span className="job-mini-title">{j.title}</span>
                    <span className="job-mini-meta">
                      {agent?.name} · {j.id} · {j.durationSec}s
                    </span>
                  </span>
                  <AutoBadge value={j.status} />
                </button>
              );
            })}
          </div>
          <div className="queue-foot">
            <span className="muted-small">
              <CircleAlert size={13} /> 1 delivery uncertain
            </span>
            <Link to="/ai/jobs" className="text-btn">
              Buka <ArrowRight size={13} />
            </Link>
          </div>
        </Card>

        <Card
          className="span-4"
          title="Jadwal mendatang"
          sub="Tugas, konten, dan deadline proyek"
          action={<LinkButton to="/calendar">Kalender</LinkButton>}
        >
          <div className="schedule-list">
            {schedule.map((item) => (
              <Link to={item.to} className="schedule-item" key={item.id}>
                <span className="schedule-date">
                  <strong>{new Date(item.at).getDate()}</strong>
                  <span>{fmtDate(item.at).split(' ')[1]}</span>
                </span>
                <span className="schedule-copy">
                  <span className="schedule-title">{item.title}</span>
                  <span className="schedule-meta">
                    {item.kind} · {fmtTime(item.at)} WIB
                  </span>
                </span>
                <ArrowRight size={14} className="row-arrow" />
              </Link>
            ))}
          </div>
          <div className="mini-bars-wrap">
            <MiniBars data={workload} height={84} />
          </div>
        </Card>

        <Card
          className="span-4"
          title="Status publikasi konten"
          sub="Status konten dan delivery dipisah"
          action={<LinkButton to="/marketing/articles">Articles</LinkButton>}
          bodyClass="no-pad"
        >
          <div className="delivery-list">
            {deliveryCounts.map((d) => (
              <Link to="/marketing/articles" className="delivery-row" key={d.status}>
                <AutoBadge value={d.status} />
                <span className="delivery-count">{d.count}</span>
              </Link>
            ))}
          </div>
          <div className="queue-foot">
            <span className="muted-small">Dua kolom, satu sumber kebenaran</span>
            <Link to="/marketing/articles" className="text-btn">
              Detail <ArrowRight size={13} />
            </Link>
          </div>
        </Card>

        <Card
          className="span-4"
          title="Status integrasi"
          sub="Connection yang menentukan guard"
          action={<LinkButton to="/admin/integrations">Integrasi</LinkButton>}
          bodyClass="no-pad"
        >
          <div className="integration-mini">
            {db.integrations.slice(0, 4).map((i) => (
              <Link to="/admin/integrations" className="integration-row" key={i.id}>
                <span className="integration-mark">{i.mark}</span>
                <span className="integration-copy">
                  <span className="integration-name">{i.name}</span>
                  <span className="integration-cat">{i.category}</span>
                </span>
                <AutoBadge value={i.status} />
              </Link>
            ))}
          </div>
          <div className="queue-foot">
            <span className="muted-small">
              <CircleAlert size={13} /> 3 butuh setup
            </span>
            <Link to="/admin/integrations" className="text-btn">
              Kelola <ArrowRight size={13} />
            </Link>
          </div>
        </Card>

        <Card
          className="span-7"
          title="Aktivitas terbaru"
          sub="Jejak audit lintas modul"
          action={<LinkButton to="/activity">Activity Feed</LinkButton>}
          bodyClass="no-pad"
        >
          <ul className="activity-list">
            {db.audit.slice(0, 6).map((a) => (
              <li key={a.id} className="activity-item">
                <Avatar name={a.actor.replace(' · agent', '')} size={26} />
                <div className="activity-copy">
                  <p>
                    <strong>{a.actor}</strong> {a.action.toLowerCase()}{' '}
                    <span className="activity-target">{a.target}</span>
                  </p>
                  <span className="activity-meta">
                    {a.module} · {relTime(a.at)}
                  </span>
                </div>
                <Link to="/logs" className="icon-btn icon-btn-sm" aria-label="Lihat log">
                  <ArrowRight size={14} />
                </Link>
              </li>
            ))}
          </ul>
        </Card>

        <Card
          className="span-5 workspace-card"
          title="Status workspace"
          sub={db.workspaces.find((w) => w.active)?.name}
          action={<LinkButton to="/admin/workspaces">Kelola</LinkButton>}
        >
          {(() => {
            const ws = db.workspaces.find((w) => w.active);
            const done = db.tasks.filter((t) => t.status === 'done').length;
            const total = db.tasks.length;
            const pctDone = total ? Math.round((done / total) * 100) : 0;
            return (
              <>
                <div className="workspace-head">
                  <div className="ws-badge">{(ws?.name ?? 'PD').slice(0, 2).toUpperCase()}</div>
                  <div>
                    <strong>{ws?.name}</strong>
                    <span>
                      Plan {ws?.plan} · {ws?.members} anggota · {ws?.projects} proyek
                    </span>
                  </div>
                  <Badge tone="success" dot>
                    Normal
                  </Badge>
                </div>
                <div className="workspace-stat">
                  <div className="split-row">
                    <span>Tugas selesai</span>
                    <strong>{pctDone}%</strong>
                  </div>
                  <div className="bar">
                    <span style={{ width: `${pctDone}%` }} />
                  </div>
                </div>
                <div className="workspace-members">
                  <Avatar name={user.name} size={28} />
                  {db.users.slice(1, 5).map((u) => (
                    <Avatar key={u.id} name={u.name} size={28} />
                  ))}
                  <span className="member-more">+{Math.max(0, db.users.length - 5)}</span>
                  <span className="member-note">
                    <Users size={13} /> Tim aktif
                  </span>
                </div>
                <div className="workspace-links">
                  <Link to="/admin/users" className="mini-link">
                    <Users size={14} /> Users
                  </Link>
                  <Link to="/admin/integrations" className="mini-link">
                    <Send size={14} /> Integrasi
                  </Link>
                  <Link to="/logs" className="mini-link">
                    <FileText size={14} /> Logs
                  </Link>
                </div>
              </>
            );
          })()}
        </Card>
      </div>

      <TaskComposer open={taskOpen} onClose={() => setTaskOpen(false)} />
    </>
  );
}
