import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowRight, Bot, CalendarClock, Check, CircleAlert, Clock, FileText,
  FolderKanban, RefreshCw, ShieldCheck, Sparkles, Users,
} from 'lucide-react';
import { AutoBadge, Badge, Card, LinkButton } from '../components/ui';
import { MiniBars } from '../components/charts';
import {
  fetchOffice,
  type OfficeActivity,
  type OfficeAgent,
  type OfficeRun,
  type OfficeSnapshot,
  type OfficeTask,
} from '../lib/api';
import { compactRupiah, cx, fmtDate, fmtTime, num, relTime } from '../lib/utils';
import './Overview.css';

const ACTIVE_RUN_STATES = new Set(['queued', 'running', 'received', 'qc', 'owner_review']);
const ATTENTION_RUN_STATES = new Set(['failed', 'unavailable']);
const priorityRank: Record<OfficeTask['priority'], number> = { high: 0, medium: 1, low: 2 };

const greeting = () => {
  const hour = new Date().getHours();
  if (hour < 11) return 'Selamat pagi';
  if (hour < 15) return 'Selamat siang';
  if (hour < 19) return 'Selamat sore';
  return 'Selamat malam';
};

const agentTone = (agent: OfficeAgent) => {
  if (agent.availability === 'online') return 'success';
  if (agent.availability === 'idle') return 'warning';
  return 'danger';
};

const runLabel = (run: OfficeRun) => run.subject || run.action || run.id;

const activityTarget = (activity: OfficeActivity) => {
  if (!activity.meta) return activity.entityId;
  try {
    const meta = JSON.parse(activity.meta) as Record<string, unknown>;
    const candidate = meta.title ?? meta.subject ?? meta.name;
    return typeof candidate === 'string' ? candidate : activity.entityId;
  } catch {
    return activity.entityId;
  }
};

export function Overview() {
  const navigate = useNavigate();
  const [snapshot, setSnapshot] = useState<OfficeSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

  const loadOffice = useCallback(async (silent = false) => {
    if (silent) setRefreshing(true);
    else setLoading(true);
    try {
      const next = await fetchOffice('playdesign');
      setSnapshot(next);
      setUpdatedAt(new Date());
      setError('');
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Dashboard gagal memuat data dari server.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadOffice();
    const timer = window.setInterval(() => void loadOffice(true), 60_000);
    return () => window.clearInterval(timer);
  }, [loadOffice]);

  const tasks = useMemo(() => snapshot?.tasks ?? [], [snapshot]);
  const deals = useMemo(() => snapshot?.deals ?? [], [snapshot]);
  const runs = useMemo(() => snapshot?.runs ?? [], [snapshot]);
  const agents = useMemo(() => snapshot?.agents ?? [], [snapshot]);
  const posts = useMemo(() => snapshot?.posts ?? [], [snapshot]);
  const activities = useMemo(() => snapshot?.activity ?? [], [snapshot]);
  const schedules = useMemo(() => snapshot?.schedules ?? [], [snapshot]);

  const openDeals = deals.filter((deal) => deal.stage !== 'won');
  const wonDeals = deals.filter((deal) => deal.stage === 'won');
  const pipelineValue = openDeals.reduce((sum, deal) => sum + deal.value, 0);
  const wonValue = wonDeals.reduce((sum, deal) => sum + deal.value, 0);
  const openTasks = tasks.filter((task) => task.status !== 'done');
  const overdueTasks = openTasks.filter((task) => new Date(task.due).getTime() < Date.now());
  const pendingApprovals = snapshot?.approvals ?? tasks.filter((task) => task.approval === 'pending');
  const activeRuns = runs.filter((run) => ACTIVE_RUN_STATES.has(run.state));
  const attentionRuns = runs.filter((run) => ATTENTION_RUN_STATES.has(run.state));
  const publishedPosts = posts.filter((post) => post.status.toLowerCase() === 'published');
  const totalReach = publishedPosts.reduce((sum, post) => sum + (post.reach ?? 0), 0);
  const closeSoon = openDeals.filter((deal) => {
    const remaining = new Date(deal.due).getTime() - Date.now();
    return remaining >= 0 && remaining <= 14 * 86_400_000;
  });

  const focusTasks = [...openTasks]
    .sort((left, right) => {
      const priority = priorityRank[left.priority] - priorityRank[right.priority];
      return priority || new Date(left.due).getTime() - new Date(right.due).getTime();
    })
    .slice(0, 5);

  const upcomingSchedules = schedules
    .filter((schedule) => new Date(schedule.scheduledFor).getTime() >= Date.now())
    .sort((left, right) => new Date(left.scheduledFor).getTime() - new Date(right.scheduledFor).getTime())
    .slice(0, 4);

  const workload = useMemo(() => {
    const labels = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'];
    const startOfWeek = new Date();
    const day = startOfWeek.getDay() || 7;
    startOfWeek.setHours(0, 0, 0, 0);
    startOfWeek.setDate(startOfWeek.getDate() - day + 1);
    return labels.map((label, index) => {
      const date = new Date(startOfWeek);
      date.setDate(startOfWeek.getDate() + index);
      const value = tasks.filter((task) => new Date(task.due).toDateString() === date.toDateString()).length;
      return { label, value };
    });
  }, [tasks]);

  const postCounts = useMemo(() => {
    const counts = new Map<string, number>();
    posts.forEach((post) => counts.set(post.status, (counts.get(post.status) ?? 0) + 1));
    return [...counts.entries()]
      .map(([status, count]) => ({ status, count }))
      .sort((left, right) => right.count - left.count);
  }, [posts]);

  const todayLabel = new Date().toLocaleDateString('id-ID', {
    weekday: 'long', day: 'numeric', month: 'long',
  });

  if (loading && !snapshot) {
    return (
      <div className="overview-page">
        <Card title="Memuat dashboard" sub="Mengambil data terbaru langsung dari database D1">
          <p className="queue-empty">Mohon tunggu sebentar…</p>
        </Card>
      </div>
    );
  }

  if (!snapshot) {
    return (
      <div className="overview-page">
        <Card title="Dashboard belum dapat dimuat" sub={error || 'Server tidak mengembalikan data.'}>
          <button type="button" className="btn btn-primary" onClick={() => void loadOffice()}>
            <RefreshCw size={15} /> Coba lagi
          </button>
        </Card>
      </div>
    );
  }

  if (snapshot.dataMode !== 'live') {
    return (
      <div className="overview-page">
        <Card
          title="Data produksi belum terhubung"
          sub="API aktif, tetapi database masih berstatus demo-seed. Angka contoh sengaja tidak ditampilkan sebagai data nyata."
        >
          <div className="ai-summary">
            <p className="ai-lead">
              <strong>Dashboard dilindungi dari data dummy</strong>
              <span>
                Isi database perlu diganti dengan catatan operasional yang sebenarnya, lalu Worker dikonfigurasi dengan DATA_MODE=live.
              </span>
            </p>
            <button type="button" className="btn btn-primary" onClick={() => void loadOffice()}>
              <RefreshCw size={15} /> Periksa lagi
            </button>
          </div>
        </Card>
      </div>
    );
  }

  const actorName = snapshot.actor?.name || 'Tim';
  const workspaceName = snapshot.workspace?.name || 'Playdesign';
  const completedTasks = tasks.filter((task) => task.status === 'done').length;
  const completionRate = tasks.length ? Math.round((completedTasks / tasks.length) * 100) : 0;
  const attentionTotal = pendingApprovals.length + attentionRuns.length + overdueTasks.length;

  return (
    <div className="overview-page">
      {error && (
        <div className="notice notice-warning" role="status">
          Sinkronisasi terakhir gagal. Data yang terlihat berasal dari pemuatan berhasil terakhir. {error}
        </div>
      )}

      <section className="overview-hero">
        <div className="overview-hero-main">
          <div className="overview-live-line">
            <span className="overview-live-dot" aria-hidden="true" />
            Data langsung dari D1
            <time>{todayLabel}</time>
          </div>
          <h1>{greeting()}, {actorName.split(' ')[0]}.</h1>
          <p>Ringkasan ini dihitung dari data workspace di server dan diperbarui otomatis setiap menit.</p>
          <div className="overview-hero-actions">
            <button
              type="button"
              className="btn overview-action-primary"
              disabled={refreshing}
              onClick={() => void loadOffice(true)}
            >
              <RefreshCw size={15} /> {refreshing ? 'Memperbarui…' : 'Perbarui data'}
            </button>
            <button type="button" className="btn overview-action-secondary" onClick={() => navigate('/approvals')}>
              <ShieldCheck size={15} /> Tinjau approval
            </button>
          </div>
        </div>

        <div className="overview-decision-lane" aria-label="Hal yang perlu perhatian">
          <div className="overview-decision-head"><span>Perlu perhatian</span><strong>{attentionTotal}</strong></div>
          <button type="button" className="overview-decision-item" onClick={() => navigate('/approvals')}>
            <span className="overview-decision-icon is-approval"><ShieldCheck size={15} /></span>
            <span><strong>{pendingApprovals.length} approval</strong><small>Menunggu keputusan</small></span>
            <ArrowRight size={14} />
          </button>
          <button type="button" className="overview-decision-item" onClick={() => navigate('/ai/jobs')}>
            <span className="overview-decision-icon is-agent"><Bot size={15} /></span>
            <span><strong>{attentionRuns.length} proses agent</strong><small>Gagal atau tidak tersedia</small></span>
            <ArrowRight size={14} />
          </button>
          <button type="button" className="overview-decision-item" onClick={() => navigate('/task-board')}>
            <span className="overview-decision-icon is-task"><Clock size={15} /></span>
            <span><strong>{overdueTasks.length} tugas terlambat</strong><small>{overdueTasks.length ? 'Lewat tenggat' : 'Semua sesuai jadwal'}</small></span>
            <ArrowRight size={14} />
          </button>
        </div>
      </section>

      <div className="overview-metrics" aria-label="Ringkasan performa">
        <button type="button" className="overview-metric" onClick={() => navigate('/crm/pipeline')}>
          <span className="overview-metric-label"><FolderKanban size={15} /> Pipeline aktif</span>
          <strong>{compactRupiah(pipelineValue)}</strong><small>{openDeals.length} deal terbuka</small>
        </button>
        <button type="button" className="overview-metric" onClick={() => navigate('/crm/deals')}>
          <span className="overview-metric-label"><Check size={15} /> Deal menang</span>
          <strong>{compactRupiah(wonValue)}</strong><small>{wonDeals.length} deal tersimpan</small>
        </button>
        <button type="button" className="overview-metric" onClick={() => navigate('/task-board')}>
          <span className="overview-metric-label"><CalendarClock size={15} /> Tugas terbuka</span>
          <strong>{openTasks.length}</strong><small>{overdueTasks.length ? `${overdueTasks.length} lewat tenggat` : 'Semua dalam jadwal'}</small>
        </button>
        <button type="button" className="overview-metric" onClick={() => navigate('/marketing/social')}>
          <span className="overview-metric-label"><FileText size={15} /> Konten terbit</span>
          <strong>{publishedPosts.length}</strong><small>{num(totalReach)} jangkauan tercatat</small>
        </button>
      </div>

      <div className="overview-grid">
        <div className="overview-section-break span-12">
          <div><h2>Keputusan & eksekusi</h2><p>Antrean dari task, deal, dan run yang tersimpan di server.</p></div>
          <span>{updatedAt ? `Diperbarui ${fmtTime(updatedAt.toISOString())}` : 'Data server'}</span>
        </div>

        <Card
          className="span-7 ai-widget overview-brief-card"
          title={<span className="inline-title"><Sparkles size={16} /> Briefing workspace</span>}
          sub="Dihitung otomatis dari data terbaru"
          action={<Badge tone="violet">Live</Badge>}
        >
          <div className="ai-summary">
            <p className="ai-lead">
              <strong>Fokus saat ini</strong>
              <span>{closeSoon.length ? `${closeSoon.length} deal memiliki tenggat dalam 14 hari.` : 'Tidak ada deal dengan tenggat dalam 14 hari.'}</span>
            </p>
            <ul className="ai-points">
              <li><span className="ai-bullet" />Pipeline terbuka {compactRupiah(pipelineValue)} dari {openDeals.length} deal.</li>
              <li><span className="ai-bullet" />{pendingApprovals.length} approval menunggu dan {overdueTasks.length} tugas melewati tenggat.</li>
              <li><span className="ai-bullet" />{activeRuns.length} proses agent aktif dan {attentionRuns.length} membutuhkan pemeriksaan.</li>
            </ul>
            <div className="ai-foot">
              <span className="ai-source">Sumber: D1 · tasks · deals · runs</span>
              <Link to="/ai/jobs" className="btn btn-outline btn-sm">Buka job queue <ArrowRight size={14} /></Link>
            </div>
          </div>
        </Card>

        <Card className="span-5" title="Antrean approval" sub={`${pendingApprovals.length} item dari server`} action={<LinkButton to="/approvals">Semua</LinkButton>} bodyClass="no-pad">
          <div className="queue-list">
            {pendingApprovals.slice(0, 4).map((task) => (
              <button key={task.id} type="button" className="queue-item" onClick={() => navigate('/approvals')}>
                <span className="queue-icon is-warning"><ShieldCheck size={15} /></span>
                <span className="queue-copy"><span className="queue-title">{task.title}</span><span className="queue-meta">{task.project} · {relTime(task.updatedAt)}</span></span>
                <AutoBadge value={task.outputStatus} />
              </button>
            ))}
            {pendingApprovals.length === 0 && <p className="queue-empty">Tidak ada approval menunggu.</p>}
          </div>
          <div className="queue-foot"><span className="muted-small"><ShieldCheck size={13} /> Approval policy server aktif</span><Link to="/approvals" className="text-btn">Tinjau <ArrowRight size={13} /></Link></div>
        </Card>

        <Card className="span-5" title="Tugas terbuka" sub={`${openTasks.length} tugas · prioritas dan tenggat aktual`} action={<LinkButton to="/task-board">Task Board</LinkButton>} bodyClass="no-pad">
          <div className="task-queue">
            {focusTasks.map((task) => {
              const isOverdue = new Date(task.due).getTime() < Date.now();
              return (
                <button type="button" className="task-row" key={task.id} onClick={() => navigate('/task-board')}>
                  <span className={cx('task-check', task.status === 'review' && 'is-active')}><Check size={12} /></span>
                  <span className="task-row-main"><span className="task-row-title">{task.title}</span><span className="task-row-meta">{task.project} · {task.priority}</span></span>
                  <span className={cx('task-due', isOverdue && 'is-overdue')}><Clock size={12} />{fmtDate(task.due)}</span>
                </button>
              );
            })}
            {focusTasks.length === 0 && <p className="queue-empty">Tidak ada tugas terbuka.</p>}
          </div>
          <div className="queue-foot"><span className="muted-small"><CalendarClock size={13} /> {overdueTasks.length} lewat tenggat</span><Link to="/task-board" className="text-btn">Buka <ArrowRight size={13} /></Link></div>
        </Card>

        <Card className="span-3" title="Kesehatan agent" sub={`${agents.length} agent terdaftar di D1`} action={<LinkButton to="/ai/directory">Direktori</LinkButton>} bodyClass="no-pad">
          <ul className="agent-health">
            {agents.map((agent) => (
              <li key={agent.id}><span className={cx('health-dot', agentTone(agent))} /><span className="health-name">{agent.name}</span><span className="health-rate">{agent.availability}</span></li>
            ))}
            {agents.length === 0 && <li className="queue-empty">Belum ada agent.</li>}
          </ul>
          <div className="queue-foot"><span className="muted-small"><CircleAlert size={13} /> {agents.filter((agent) => agent.availability === 'unavailable').length} unavailable</span><Link to="/ai/directory" className="text-btn">Lihat <ArrowRight size={13} /></Link></div>
        </Card>

        <Card className="span-4" title="Proses agent" sub={`${activeRuns.length} aktif · ${attentionRuns.length} perlu perhatian`} action={<LinkButton to="/ai/jobs">Job Queue</LinkButton>} bodyClass="no-pad">
          <div className="job-mini-list">
            {runs.slice(0, 4).map((run) => {
              const agent = agents.find((item) => item.id === run.agentId);
              return (
                <button key={run.id} type="button" className="job-mini" onClick={() => navigate('/ai/jobs')}>
                  <span className={cx('job-mini-dot', run.state.replace('_', '-'))} />
                  <span className="job-mini-main"><span className="job-mini-title">{runLabel(run)}</span><span className="job-mini-meta">{agent?.name ?? run.agentId} · {relTime(run.startedAt)}</span></span>
                  <AutoBadge value={run.state} />
                </button>
              );
            })}
            {runs.length === 0 && <p className="queue-empty">Belum ada proses agent.</p>}
          </div>
          <div className="queue-foot"><span className="muted-small"><Bot size={13} /> {runs.length} run tersimpan</span><Link to="/ai/jobs" className="text-btn">Buka <ArrowRight size={13} /></Link></div>
        </Card>

        <div className="overview-section-break span-12">
          <div><h2>Operasional</h2><p>Jadwal publikasi dan status konten langsung dari database.</p></div>
          <span>Tanpa data contoh lokal</span>
        </div>

        <Card className="span-6" title="Jadwal mendatang" sub="Post terjadwal dari server" action={<LinkButton to="/calendar">Kalender</LinkButton>}>
          <div className="schedule-list">
            {upcomingSchedules.map((schedule) => (
              <Link to="/calendar" className="schedule-item" key={schedule.id}>
                <span className="schedule-date"><strong>{new Date(schedule.scheduledFor).getDate()}</strong><span>{fmtDate(schedule.scheduledFor).split(' ')[1]}</span></span>
                <span className="schedule-copy"><span className="schedule-title">{schedule.title}</span><span className="schedule-meta">{schedule.platform} · {fmtTime(schedule.scheduledFor)} WIB</span></span>
                <ArrowRight size={14} className="row-arrow" />
              </Link>
            ))}
            {upcomingSchedules.length === 0 && <p className="queue-empty">Tidak ada jadwal mendatang.</p>}
          </div>
          <div className="mini-bars-wrap"><MiniBars data={workload} height={84} /></div>
        </Card>

        <Card className="span-6" title="Status publikasi" sub={`${posts.length} konten tersimpan`} action={<LinkButton to="/marketing/social">Social Planner</LinkButton>} bodyClass="no-pad">
          <div className="delivery-list">
            {postCounts.map((item) => (
              <Link to="/marketing/social" className="delivery-row" key={item.status}><AutoBadge value={item.status} /><span className="delivery-count">{item.count}</span></Link>
            ))}
            {postCounts.length === 0 && <p className="queue-empty">Belum ada konten.</p>}
          </div>
          <div className="queue-foot"><span className="muted-small">{num(totalReach)} total jangkauan tercatat</span><Link to="/marketing/social" className="text-btn">Detail <ArrowRight size={13} /></Link></div>
        </Card>

        <div className="overview-section-break span-12">
          <div><h2>Jejak & workspace</h2><p>Aktivitas audit dan kondisi workspace berdasarkan catatan server.</p></div>
          <span>D1 audit trail</span>
        </div>

        <Card className="span-7" title="Aktivitas terbaru" sub={`${activities.length} event terbaru diterima`} action={<LinkButton to="/activity">Activity Feed</LinkButton>} bodyClass="no-pad">
          <ul className="activity-list">
            {activities.slice(0, 6).map((activity) => (
              <li key={activity.id} className="activity-item">
                <span className={cx('queue-icon', activity.result === 'failed' ? 'is-danger' : activity.result === 'pending' ? 'is-warning' : 'is-ok')}>{activity.result === 'failed' ? <CircleAlert size={15} /> : <Check size={15} />}</span>
                <div className="activity-copy"><p><strong>{activity.actorId}</strong> {activity.action.toLowerCase()} <span className="activity-target">{activityTarget(activity)}</span></p><span className="activity-meta">{activity.entityType} · {relTime(activity.at)}</span></div>
                <Link to="/logs" className="icon-btn icon-btn-sm" aria-label="Lihat log"><ArrowRight size={14} /></Link>
              </li>
            ))}
            {activities.length === 0 && <li className="queue-empty">Belum ada aktivitas tercatat.</li>}
          </ul>
        </Card>

        <Card className="span-5 workspace-card" title="Status workspace" sub={workspaceName} action={<LinkButton to="/admin/workspaces">Kelola</LinkButton>}>
          <div className="workspace-head">
            <div className="ws-badge">{(snapshot.workspace?.initial || workspaceName.slice(0, 2)).toUpperCase()}</div>
            <div><strong>{workspaceName}</strong><span>{agents.length} agent · {(snapshot.leads ?? []).length} lead · {deals.length} deal</span></div>
            <Badge tone="success" dot>Terhubung</Badge>
          </div>
          <div className="workspace-stat">
            <div className="split-row"><span>Tugas selesai</span><strong>{completionRate}%</strong></div>
            <div className="bar"><span style={{ width: `${completionRate}%` }} /></div>
          </div>
          <div className="workspace-links">
            <Link to="/task-board" className="mini-link"><Check size={14} /> {tasks.length} Tasks</Link>
            <Link to="/crm/leads" className="mini-link"><Users size={14} /> {(snapshot.leads ?? []).length} Leads</Link>
            <Link to="/logs" className="mini-link"><FileText size={14} /> Audit</Link>
          </div>
        </Card>
      </div>
    </div>
  );
}
