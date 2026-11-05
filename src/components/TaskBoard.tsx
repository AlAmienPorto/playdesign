import { useMemo, useState } from 'react';
import { CalendarDays, Check, GripVertical, Plus, Search } from 'lucide-react';
import type { Task, TaskStatus } from '../data/types';
import { useStore } from '../store/store';
import { Avatar, Badge, Card, Drawer, EmptyState, Progress, SelectBox, TaskPriorityBadge } from './ui';
import { TaskComposer } from './dialogs';
import { cx, fmtDate, relTime } from '../lib/utils';

const COLUMNS: Array<{ key: TaskStatus; label: string }> = [
  { key: 'todo', label: 'To do' },
  { key: 'doing', label: 'Dikerjakan' },
  { key: 'review', label: 'Review' },
  { key: 'done', label: 'Selesai' },
];

export function TaskBoardView({ compact }: { compact?: boolean }) {
  const { db, setTaskStatus } = useStore();
  const [q, setQ] = useState('');
  const [assignee, setAssignee] = useState('all');
  const [project, setProject] = useState('all');
  const [addOpen, setAddOpen] = useState(false);
  const [selected, setSelected] = useState<Task | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);

  const filtered = useMemo(
    () =>
      db.tasks.filter((t) => {
        const matches = `${t.title} ${t.tags.join(' ')}`.toLowerCase().includes(q.toLowerCase());
        return matches && (assignee === 'all' || t.assigneeId === assignee) && (project === 'all' || t.projectId === project);
      }),
    [db.tasks, q, assignee, project],
  );

  const drop = (status: TaskStatus) => {
    if (dragging) {
      setTaskStatus(dragging, status);
      setDragging(null);
    }
  };

  return (
    <>
      <div className="board-toolbar">
        <div className="search-field">
          <Search size={15} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari tugas atau tag…" aria-label="Cari tugas" />
        </div>
        <div className="toolbar-filters">
          <SelectBox
            label="Assignee"
            value={assignee}
            onChange={setAssignee}
            options={[{ value: 'all', label: 'Semua anggota' }, ...db.users.map((u) => ({ value: u.id, label: u.name }))]}
          />
          <SelectBox
            label="Proyek"
            value={project}
            onChange={setProject}
            options={[{ value: 'all', label: 'Semua proyek' }, ...db.projects.map((p) => ({ value: p.id, label: p.name }))]}
          />
          <button type="button" className="btn btn-primary" onClick={() => setAddOpen(true)}>
            <Plus size={15} /> Tugas
          </button>
        </div>
      </div>

      <div className="kanban-wrap">
        <div className={cx('kanban task-kanban', compact && 'is-compact')}>
          {COLUMNS.map((col) => {
            const tasks = filtered
              .filter((t) => t.status === col.key)
              .sort((a, b) => {
                const rank = { Tinggi: 0, Sedang: 1, Rendah: 2 };
                if (rank[a.priority] !== rank[b.priority]) return rank[a.priority] - rank[b.priority];
                return new Date(a.due).getTime() - new Date(b.due).getTime();
              });
            return (
              <div key={col.key} className={cx('kan-col', `task-col-${col.key}`)} onDragOver={(e) => e.preventDefault()} onDrop={() => drop(col.key)}>
                <div className="kan-head">
                  <div>
                    <span className={cx('task-col-dot', col.key)} />
                    <strong>{col.label}</strong>
                    <span className="kan-count">{tasks.length}</span>
                  </div>
                  <button type="button" className="icon-btn icon-btn-sm" onClick={() => setAddOpen(true)} aria-label={`Tambah tugas ke ${col.label}`}>
                    <Plus size={14} />
                  </button>
                </div>
                <div className="kan-body">
                  {tasks.map((t) => {
                    const user = db.users.find((u) => u.id === t.assigneeId);
                    const proj = db.projects.find((p) => p.id === t.projectId);
                    const overdue = t.status !== 'done' && new Date(t.due).getTime() < Date.now();
                    return (
                      <article
                        key={t.id}
                        className={cx('kan-card task-card', dragging === t.id && 'is-dragging')}
                        draggable
                        onDragStart={() => setDragging(t.id)}
                        onDragEnd={() => setDragging(null)}
                        onClick={() => setSelected(t)}
                      >
                        <div className="task-card-top">
                          <TaskPriorityBadge priority={t.priority} />
                          <GripVertical size={14} className="kan-grip" />
                        </div>
                        <h3>{t.title}</h3>
                        {proj && <span className="task-project">{proj.name}</span>}
                        <div className="kan-foot">
                          <span className={cx('kan-date', overdue && 'is-overdue')}>
                            <CalendarDays size={12} /> {fmtDate(t.due)}
                          </span>
                          <Avatar name={user?.name ?? '—'} size={22} />
                        </div>
                        {t.tags.length > 0 && (
                          <div className="tag-row">
                            {t.tags.slice(0, 2).map((tag) => (
                              <span className="tag" key={tag}>{tag}</span>
                            ))}
                          </div>
                        )}
                      </article>
                    );
                  })}
                  {tasks.length === 0 && (
                    <div className="kan-empty">
                      <span>Kosong</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <TaskComposer open={addOpen} onClose={() => setAddOpen(false)} />

      <Drawer
        open={!!selected}
        onClose={() => setSelected(null)}
        title={selected?.title ?? ''}
        sub={selected ? `Dibuat ${relTime(selected.createdAt)}` : undefined}
        footer={
          selected ? (
            <>
              <button type="button" className="btn btn-ghost" onClick={() => setSelected(null)}>Tutup</button>
              {selected.status !== 'done' && (
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => {
                    setTaskStatus(selected.id, 'done');
                    setSelected(null);
                  }}
                >
                  <Check size={14} /> Tandai selesai
                </button>
              )}
            </>
          ) : undefined
        }
      >
        {selected && (
          <div className="detail-stack">
            <div className="detail-grid">
              <div><span className="detail-label">Penanggung jawab</span><strong>{db.users.find((u) => u.id === selected.assigneeId)?.name}</strong></div>
              <div><span className="detail-label">Prioritas</span><TaskPriorityBadge priority={selected.priority} /></div>
              <div><span className="detail-label">Jatuh tempo</span><strong>{fmtDate(selected.due, true)}</strong></div>
              <div><span className="detail-label">Status</span><Badge tone={selected.status === 'done' ? 'success' : selected.status === 'review' ? 'warning' : 'info'}>{COLUMNS.find((c) => c.key === selected.status)?.label}</Badge></div>
              <div><span className="detail-label">Proyek</span><strong>{db.projects.find((p) => p.id === selected.projectId)?.name ?? '—'}</strong></div>
              <div><span className="detail-label">Tag</span><span className="tag-row">{selected.tags.map((t) => <span className="tag" key={t}>{t}</span>)}</span></div>
            </div>
            <div className="detail-block">
              <h4>Pindahkan status</h4>
              <div className="stage-picker">
                {COLUMNS.map((c) => (
                  <button
                    key={c.key}
                    type="button"
                    className={cx('stage-chip', selected.status === c.key && 'is-current')}
                    onClick={() => {
                      setTaskStatus(selected.id, c.key);
                      setSelected({ ...selected, status: c.key });
                    }}
                    disabled={selected.status === c.key}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            </div>
            <Card title="Progres proyek" sub={db.projects.find((p) => p.id === selected.projectId)?.name}>
              <Progress value={db.projects.find((p) => p.id === selected.projectId)?.progress ?? 0} />
            </Card>
          </div>
        )}
      </Drawer>
    </>
  );
}

export function WorkloadBars() {
  const { db } = useStore();
  const rows = db.users.map((u) => {
    const tasks = db.tasks.filter((t) => t.assigneeId === u.id && t.status !== 'done');
    const capacity = 6;
    return { user: u, count: tasks.length, pct: Math.min(100, Math.round((tasks.length / capacity) * 100)) };
  });
  return (
    <div className="workload">
      {rows.map((r) => (
        <div className="workload-row" key={r.user.id}>
          <Avatar name={r.user.name} size={28} />
          <div className="workload-main">
            <div className="split-row">
              <strong>{r.user.name}</strong>
              <span>{r.count} tugas</span>
            </div>
            <Progress value={r.pct} thin tone={r.pct > 80 ? 'danger' : r.pct > 60 ? 'warning' : 'brand'} />
          </div>
          <span className="workload-pct">{r.pct}%</span>
        </div>
      ))}
    </div>
  );
}
