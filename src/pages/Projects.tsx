import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  CalendarDays,
  Check,
  ChevronRight,
  CircleAlert,
  FolderKanban,
  Layers,
  ListChecks,
  Plus,
  ShieldCheck,
  Target,
  Users,
} from 'lucide-react';
import { useStore } from '../store/store';
import {
  AutoBadge,
  Avatar,
  Badge,
  Card,
  EmptyState,
  Fig,
  LinkButton,
  PageHead,
  Progress,
  SearchField,
  SelectBox,
} from '../components/ui';
import { TaskBoardView, WorkloadBars } from '../components/TaskBoard';
import { TaskComposer } from '../components/dialogs';
import { compactRupiah, cx, fmtDate, relTime } from '../lib/utils';
import type { Deliverable } from '../data/types';

function ProjectsPage({ title, desc, actions, children }: { title: string; desc: string; actions?: React.ReactNode; children: React.ReactNode }) {
  return (
    <>
      <PageHead kicker="Projects · Foundation" title={title} desc={desc} actions={actions} />
      {children}
    </>
  );
}

export function ProjectsOverview() {
  const { db } = useStore();
  const navigate = useNavigate();
  const [taskOpen, setTaskOpen] = useState(false);
  const activeProjects = db.projects.filter((p) => p.status !== 'Selesai');
  const dueSoon = db.projects.filter((p) => new Date(p.dueAt).getTime() - Date.now() < 14 * 86400000);
  const pendingDeliverables = db.deliverables.filter((d) => d.status !== 'Selesai');
  const avgProgress = activeProjects.length ? Math.round(activeProjects.reduce((s, p) => s + p.progress, 0) / activeProjects.length) : 0;
  const openDeliverables = pendingDeliverables.slice(0, 5);

  return (
    <ProjectsPage
      title="Projects"
      desc="Proyek studio dari kickoff sampai deliverable. Kanban dan assignment memakai pola yang sama dengan Task Board."
      actions={
        <>
          <button type="button" className="btn btn-primary" onClick={() => setTaskOpen(true)}><Plus size={15} /> Tugas baru</button>
          <button type="button" className="btn btn-ghost" onClick={() => navigate('/projects/deliverables')}><Layers size={15} /> Deliverables</button>
        </>
      }
    >
      <div className="figs figs-4">
        <Fig label="Proyek aktif" value={activeProjects.length} hint={`${db.projects.filter((p) => p.status === 'Review').length} menunggu review klien`} icon={<FolderKanban size={16} />} />
        <Fig label="Deadline 14 hari" value={dueSoon.length} hint="Proyek yang mendekati tenggat" icon={<CalendarDays size={16} />} onClick={() => navigate('/calendar')} />
        <Fig label="Deliverable terbuka" value={pendingDeliverables.length} hint={`${db.deliverables.filter((d) => d.status === 'Review klien').length} menunggu klien`} icon={<Layers size={16} />} onClick={() => navigate('/projects/deliverables')} />
        <Fig label="Rata-rata progres" value={`${avgProgress}%`} hint="Proyek berjalan" icon={<Target size={16} />} />
      </div>

      <div className="project-grid">
        {db.projects.map((p) => {
          const client = db.companies.find((c) => c.id === p.clientId);
          const lead = db.users.find((u) => u.id === p.leadId);
          const deliverables = db.deliverables.filter((d) => d.projectId === p.id);
          const done = deliverables.filter((d) => d.status === 'Selesai').length;
          return (
            <Link to="/projects/deliverables" className="project-card" key={p.id}>
              <div className="project-top">
                <span className="project-mark" style={{ background: `hsl(${client?.hue ?? 20} 62% 93%)`, color: `hsl(${client?.hue ?? 20} 45% 32%)` }}>
                  {client?.name.slice(0, 2).toUpperCase()}
                </span>
                <AutoBadge value={p.status} />
              </div>
              <h3>{p.name}</h3>
              <p className="project-client">{p.type} · {client?.name}</p>
              <div className="project-progress">
                <div className="split-row">
                  <span>Progres</span>
                  <strong>{p.progress}%</strong>
                </div>
                <Progress value={p.progress} tone={p.progress >= 80 ? 'success' : p.status === 'Ditahan' ? 'warning' : 'brand'} />
              </div>
              <div className="project-meta">
                <span className="project-meta-item"><CalendarDays size={13} /> {fmtDate(p.dueAt)}</span>
                <span className="project-meta-item"><Layers size={13} /> {done}/{deliverables.length} deliverable</span>
                <span className="project-meta-item"><Target size={13} /> {compactRupiah(p.budget)}</span>
              </div>
              <div className="project-foot">
                <Avatar name={lead?.name ?? '—'} size={24} />
                <span>{lead?.name}</span>
                <span className="project-open">Detail <ChevronRight size={13} /></span>
              </div>
            </Link>
          );
        })}
      </div>

      <div className="grid-main">
        <Card className="span-6" title="Beban kerja tim" sub="Tugas terbuka dibanding kapasitas mingguan" action={<LinkButton to="/projects/assignment">Assignment</LinkButton>}>
          <WorkloadBars />
        </Card>

        <Card className="span-6" title="Deliverable perlu perhatian" sub="Urut tanggal, siap ditindaklanjuti" action={<LinkButton to="/projects/deliverables">Semua</LinkButton>} bodyClass="no-pad">
          <div className="deliverable-mini">
            {openDeliverables.map((d) => {
              const project = db.projects.find((p) => p.id === d.projectId);
              const owner = db.users.find((u) => u.id === d.ownerId);
              return (
                <Link to="/projects/deliverables" key={d.id} className="deliverable-row">
                  <span className={cx('deliverable-dot', d.status === 'Draft' ? 'neutral' : d.status === 'Selesai' ? 'success' : 'warning')} />
                  <span className="deliverable-main">
                    <span>{d.name}</span>
                    <span className="deliverable-sub">{project?.name} · {owner?.name.split(' ')[0]}</span>
                  </span>
                  <AutoBadge value={d.status} />
                  <span className="deliverable-date">{fmtDate(d.due)}</span>
                </Link>
              );
            })}
          </div>
        </Card>
      </div>

      <TaskComposer open={taskOpen} onClose={() => setTaskOpen(false)} />
    </ProjectsPage>
  );
}

export function ProjectTasks() {
  const { db } = useStore();
  const open = db.tasks.filter((t) => t.status !== 'done').length;
  return (
    <ProjectsPage title="Tasks" desc={`${open} tugas terbuka lintas proyek. Pindahkan kartu untuk mengubah status; setiap perubahan masuk audit.`}>
      <Card bodyClass="board-card">
        <TaskBoardView />
      </Card>
    </ProjectsPage>
  );
}

export function AssignmentPage() {
  const { db } = useStore();
  return (
    <ProjectsPage
      title="Assignment"
      desc="Siapa mengerjakan apa, dengan kapasitas yang terlihat. Beban dihitung dari tugas terbuka."
    >
      <div className="assignment-grid">
        {db.users.map((u) => {
          const tasks = db.tasks.filter((t) => t.assigneeId === u.id);
          const open = tasks.filter((t) => t.status !== 'done');
          const overdue = open.filter((t) => new Date(t.due).getTime() < Date.now());
          const pct = Math.min(100, Math.round((open.length / 6) * 100));
          return (
            <Card key={u.id} className="assignment-card">
              <div className="assignment-head">
                <Avatar name={u.name} size={38} />
                <div>
                  <strong>{u.name}</strong>
                  <span>{u.jobTitle} · {u.role}</span>
                </div>
                <span className={cx('capacity-pill', pct > 80 ? 'is-danger' : pct > 60 ? 'is-warning' : 'is-ok')}>{pct}% kapasitas</span>
              </div>
              <Progress value={pct} tone={pct > 80 ? 'danger' : pct > 60 ? 'warning' : 'brand'} />
              <div className="assignment-stats">
                <span><strong>{open.length}</strong> terbuka</span>
                <span><strong>{tasks.filter((t) => t.status === 'review').length}</strong> review</span>
                <span className={overdue.length ? 'text-danger' : ''}><strong>{overdue.length}</strong> terlambat</span>
              </div>
              <div className="assignment-list">
                {open.length === 0 && <p className="muted-text small">Tidak ada tugas terbuka.</p>}
                {open.slice(0, 3).map((t) => (
                  <div className="assignment-task" key={t.id}>
                    <span className={cx('priority-dot', t.priority.toLowerCase())} />
                    <span>{t.title}</span>
                    <span className="assignment-due">{fmtDate(t.due)}</span>
                  </div>
                ))}
              </div>
              <Link to="/projects/tasks" className="text-btn">Buka task board <ArrowRight size={13} /></Link>
            </Card>
          );
        })}
      </div>
      <div className="notice-banner mt-16">
        <ShieldCheck size={16} />
        <div>
          <strong>Assignment tidak mengirim notifikasi eksternal</strong>
          <p>Penugasan hanya mengubah state internal dan mencatat audit. Pengiriman keluar tetap melalui approval.</p>
        </div>
      </div>
    </ProjectsPage>
  );
}

const nextStatus = (status: Deliverable['status']): Deliverable['status'] | null => {
  if (status === 'Draft') return 'Review internal';
  if (status === 'Review internal') return 'Review klien';
  if (status === 'Review klien') return 'Selesai';
  return null;
};

export function DeliverablesPage() {
  const { db, updateDeliverable } = useStore();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('all');
  const rows = useMemo(
    () =>
      db.deliverables.filter((d) => {
        const project = db.projects.find((p) => p.id === d.projectId)?.name ?? '';
        const matches = `${d.name} ${project}`.toLowerCase().includes(q.toLowerCase());
        return matches && (status === 'all' || d.status === status);
      }),
    [db.deliverables, db.projects, q, status],
  );

  return (
    <ProjectsPage
      title="Deliverables"
      desc="Status pekerjaan yang bisa diperiksa klien. Satu deliverable, satu pemilik, satu tanggal."
    >
      <div className="table-toolbar card-toolbar">
        <SearchField value={q} onChange={setQ} placeholder="Cari deliverable atau proyek…" />
        <div className="toolbar-filters">
          <SelectBox
            label="Status"
            value={status}
            onChange={setStatus}
            options={[
              { value: 'all', label: 'Semua status' },
              { value: 'Draft', label: 'Draft' },
              { value: 'Review internal', label: 'Review internal' },
              { value: 'Review klien', label: 'Review klien' },
              { value: 'Selesai', label: 'Selesai' },
            ]}
          />
        </div>
      </div>

      <Card bodyClass="no-pad">
        <div className="table-wrap">
          <table className="pd-table">
            <thead>
              <tr>
                <th scope="col">Deliverable</th>
                <th scope="col">Proyek</th>
                <th scope="col">Pemilik</th>
                <th scope="col">Jatuh tempo</th>
                <th scope="col">Status</th>
                <th scope="col">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((d) => {
                const project = db.projects.find((p) => p.id === d.projectId);
                const owner = db.users.find((u) => u.id === d.ownerId);
                const next = nextStatus(d.status);
                return (
                  <tr key={d.id}>
                    <td>
                      <div className="cell-main">
                        <strong>{d.name}</strong>
                        <span className="cell-sub">{project?.type}</span>
                      </div>
                    </td>
                    <td>
                      <span className="cell-main"><span>{project?.name}</span></span>
                    </td>
                    <td>
                      <span className="cell-person-inline"><Avatar name={owner?.name ?? '—'} size={22} />{owner?.name.split(' ')[0]}</span>
                    </td>
                    <td>{fmtDate(d.due)}</td>
                    <td><AutoBadge value={d.status} /></td>
                    <td>
                      {next ? (
                        <button type="button" className="btn btn-outline btn-xs" onClick={() => updateDeliverable(d.id, next)}>
                          {d.status === 'Review klien' ? <><Check size={12} /> Selesai</> : <>Kirim <ArrowRight size={12} /></>}
                        </button>
                      ) : (
                        <span className="muted-small">Selesai</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {rows.length === 0 && <EmptyState icon={<ListChecks size={20} />} title="Tidak ada deliverable" desc="Ubah filter untuk melihat hasil lain." />}
      </Card>

      <div className="grid-3 mt-16">
        {['Draft', 'Review internal', 'Review klien'].map((s) => {
          const count = db.deliverables.filter((d) => d.status === s).length;
          return (
            <Card key={s} className="mini-stat-card">
              <div className="mini-stat">
                <span className="mini-stat-icon">{s === 'Draft' ? <CircleAlert size={16} /> : s === 'Review internal' ? <Users size={16} /> : <Layers size={16} />}</span>
                <div>
                  <span>{s}</span>
                  <strong>{count}</strong>
                </div>
              </div>
              <p>{s === 'Draft' ? 'Belum siap dilihat' : s === 'Review internal' ? 'Diperiksa tim' : 'Menunggu respons klien'}</p>
            </Card>
          );
        })}
      </div>
      <p className="footnote">Terakhir diperbarui {relTime(db.deliverables[0]?.due ?? new Date().toISOString())} · status berasal dari data lokal workspace.</p>
    </ProjectsPage>
  );
}
