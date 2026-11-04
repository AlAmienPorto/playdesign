import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Brain,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  Cpu,
  Database,
  Download,
  File,
  FolderOpen,
  Gauge,
  Lock,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Save,
  ScrollText,
  Search,
  Settings2,
  ShieldCheck,
  Trash2,
  Upload,
  Users,
  X,
  Zap,
} from 'lucide-react';
import { useStore } from '../store/store';
import {
  Avatar,
  Badge,
  Card,
  EmptyState,
  Field,
  Fig,
  Modal,
  PageHead,
  Progress,
  SearchField,
  SelectBox,
  Tabs,
  Toggle,
} from '../components/ui';
import { Donut, MiniBars, Sparkline } from '../components/charts';
import { cx, downloadJSON, fmtDate, fmtTime, num, relTime, rupiah } from '../lib/utils';
import type { AgentStatus, FolderItem, LogEntry } from '../data/types';

const agentStatusTone = (status: AgentStatus) =>
  status === 'Aktif' ? 'success' : status === 'Dijeda' ? 'warning' : status === 'Error' ? 'danger' : 'neutral';

export function AgentsControlPage() {
  const { db, can, updateAgent, toast } = useStore();
  const [query, setQuery] = useState('');
  const allowed = can('agents.configure');
  const active = db.agents.filter((a) => a.status === 'Aktif');
  const agents = db.agents.filter((a) =>
    `${a.name} ${a.codename} ${a.role} ${a.model}`.toLowerCase().includes(query.toLowerCase()),
  );

  const toggle = (id: string, status: AgentStatus) => {
    if (!allowed) {
      toast('Hanya Owner dan Admin yang bisa mengubah status agent.', 'danger');
      return;
    }
    updateAgent(id, { status });
  };

  return (
    <>
      <PageHead
        kicker="System · Live"
        title="Agents"
        desc="Control room agent warisan. Menjalankan, menjeda, dan memulihkan agent tanpa memberi hak keluar."
        actions={
          <Badge tone="success" dot>
            {active.length} aktif
          </Badge>
        }
      />

      <div className="figs figs-4">
        <Fig label="Agent aktif" value={active.length} hint={`dari ${db.agents.length}`} icon={<Cpu size={17} />} />
        <Fig label="Tugas hari ini" value={db.agents.reduce((s, a) => s + a.tasksToday, 0)} hint="Lintas agent" icon={<Zap size={17} />} />
        <Fig
          label="Success rate"
          value={`${Math.round(db.agents.reduce((s, a) => s + a.successRate, 0) / db.agents.length)}%`}
          delta="rata-rata"
          deltaTone="neutral"
          icon={<Gauge size={17} />}
        />
        <Fig
          label="Perlu perhatian"
          value={db.agents.filter((a) => a.status === 'Error').length}
          hint="Agent berhenti"
          icon={<AlertTriangle size={17} />}
        />
      </div>

      <div className="toolbar mt-16">
        <SearchField value={query} onChange={setQuery} placeholder="Cari agent atau model…" />
      </div>

      {agents.length === 0 ? (
        <Card>
          <EmptyState icon={<Cpu size={22} />} title="Tidak ada agent" desc="Ubah kata kunci pencarian." />
        </Card>
      ) : (
        <div className="agent-grid">
          {agents.map((agent) => {
            const jobs = db.jobs.filter((j) => j.agentId === agent.id && (j.status === 'running' || j.status === 'queued'));
            return (
              <article key={agent.id} className="agent-card control-card">
                <div className="agent-card-top">
                  <span className={cx('agent-mark', `tone-${agent.tone}`)} aria-hidden="true">
                    {agent.name.slice(0, 1)}
                  </span>
                  <div>
                    <h3>{agent.name}</h3>
                    <span className="mono">{agent.codename}</span>
                  </div>
                  <Badge tone={agentStatusTone(agent.status)} dot>
                    {agent.status}
                  </Badge>
                </div>
                <p className="agent-role">{agent.role} · {agent.model}</p>
                <div className="control-stats">
                  <div>
                    <span>Success</span>
                    <strong>{agent.successRate}%</strong>
                  </div>
                  <div>
                    <span>Avg durasi</span>
                    <strong>{agent.avgDuration}s</strong>
                  </div>
                  <div>
                    <span>Antrean</span>
                    <strong>{jobs.length}</strong>
                  </div>
                </div>
                <div className="control-foot">
                  <span className="muted-small">Terakhir {relTime(agent.lastRun)}</span>
                  <div className="detail-inline">
                    {agent.status === 'Aktif' ? (
                      <button type="button" className="btn btn-outline btn-sm" onClick={() => toggle(agent.id, 'Dijeda')} disabled={!allowed}>
                        <Pause size={13} /> Jeda
                      </button>
                    ) : (
                      <button type="button" className="btn btn-primary btn-sm" onClick={() => toggle(agent.id, 'Aktif')} disabled={!allowed}>
                        {agent.status === 'Error' ? <RotateCcw size={13} /> : <Play size={13} />}
                        {agent.status === 'Error' ? 'Pulihkan' : 'Aktifkan'}
                      </button>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      <Card title="Job aktif" sub="Antrean dan eksekusi yang sedang berjalan." className="mt-16">
        <ul className="job-mini-list">
          {db.jobs
            .filter((j) => j.status === 'running' || j.status === 'queued')
            .map((job) => (
              <li key={job.id} className="job-mini">
                <span className="job-mini-icon">
                  {job.status === 'running' ? <Zap size={14} /> : <Clock size={14} />}
                </span>
                <div className="job-mini-main">
                  <div className="job-mini-title">{job.title}</div>
                  <div className="job-mini-meta">
                    {db.agents.find((a) => a.id === job.agentId)?.name} · {job.status === 'running' ? 'berjalan' : 'menunggu'} · {relTime(job.startedAt)}
                  </div>
                </div>
                <Badge tone={job.status === 'running' ? 'info' : 'neutral'}>{job.status}</Badge>
              </li>
            ))}
          {db.jobs.filter((j) => j.status === 'running' || j.status === 'queued').length === 0 && (
            <li className="muted-small">Tidak ada job aktif saat ini.</li>
          )}
        </ul>
      </Card>
      <p className="footnote">
        <ShieldCheck size={12} /> Menjeda agent menghentikan job baru, bukan membatalkan job berjalan. Perubahan tercatat di audit.
      </p>
    </>
  );
}

const AGENT_COLORS = ['#d8212c', '#c26a20', '#7a5cc4', '#2e8b74', '#b08a1e', '#5d6f8f'];

export function UsagePage() {
  const { db } = useStore();
  const days = Array.from(new Set(db.usage.map((u) => u.day))).sort();
  const last7 = days.slice(-7);
  const daily = last7.map((day) => ({
    day,
    tokens: db.usage.filter((u) => u.day === day).reduce((s, u) => s + u.tokens, 0),
    cost: db.usage.filter((u) => u.day === day).reduce((s, u) => s + u.cost, 0),
  }));
  const totalTokens = daily.reduce((s, d) => s + d.tokens, 0);
  const totalCost = daily.reduce((s, d) => s + d.cost, 0);
  const topAgent = [...db.agents]
    .map((agent) => ({
      agent,
      tokens: db.usage.filter((u) => u.agentId === agent.id && last7.includes(u.day)).reduce((s, u) => s + u.tokens, 0),
    }))
    .sort((a, b) => b.tokens - a.tokens)[0];
  const slices = db.agents.map((agent, i) => ({
    label: agent.name,
    value: db.usage.filter((u) => u.agentId === agent.id && last7.includes(u.day)).reduce((s, u) => s + u.tokens, 0),
    color: AGENT_COLORS[i % AGENT_COLORS.length],
  }));

  return (
    <>
      <PageHead
        kicker="System · Live"
        title="Usage"
        desc="Pemakaian token dan biaya agent tujuh hari terakhir. Angka berasal dari usage record, bukan estimasi."
        actions={<Badge tone="neutral">7 hari terakhir</Badge>}
      />

      <div className="figs figs-4">
        <Fig
          label="Total token"
          value={num(totalTokens)}
          delta={daily.length > 1 ? `${daily[daily.length - 1].tokens > daily[0].tokens ? '+' : ''}${Math.round(((daily[daily.length - 1].tokens - daily[0].tokens) / Math.max(daily[0].tokens, 1)) * 100)}%` : undefined}
          deltaTone={daily.length > 1 && daily[daily.length - 1].tokens < daily[0].tokens ? 'success' : 'danger'}
          hint="vs. hari pertama"
          icon={<Zap size={17} />}
          spark={<Sparkline data={daily.map((d) => d.tokens)} />}
        />
        <Fig label="Estimasi biaya" value={rupiah(totalCost)} hint="Routing model sisi server" icon={<Database size={17} />} />
        <Fig label="Rata-rata harian" value={num(Math.round(totalTokens / Math.max(last7.length, 1)))} hint="Token per hari" icon={<Gauge size={17} />} />
        <Fig label="Agent teratas" value={topAgent?.agent.name ?? '—'} hint={topAgent ? `${num(topAgent.tokens)} token` : undefined} icon={<Cpu size={17} />} />
      </div>

      <div className="overview-grid mt-16">
        <Card title="Token harian" sub="Tujuh hari terakhir, semua agent." className="span-7">
          <MiniBars
            data={daily.map((d) => ({
              label: new Date(d.day).getDate().toString(),
              value: d.tokens,
              tone: 'brand',
            }))}
            height={168}
          />
          <div className="chart-foot">
            <span>{fmtDate(last7[0] ?? new Date().toISOString())}</span>
            <span>{fmtDate(last7[last7.length - 1] ?? new Date().toISOString())}</span>
          </div>
        </Card>
        <Card title="Distribusi agent" sub="Porsi token tujuh hari." className="span-5">
          <div className="donut-wrap">
            <Donut
              slices={slices}
              centerTop={num(totalTokens)}
              centerBottom="token"
              size={168}
            />
            <ul className="donut-legend">
              {slices.map((slice) => (
                <li key={slice.label}>
                  <i style={{ background: slice.color }} />
                  <span>{slice.label}</span>
                  <strong>{Math.round((slice.value / Math.max(totalTokens, 1)) * 100)}%</strong>
                </li>
              ))}
            </ul>
          </div>
        </Card>
      </div>

      <Card title="Rincian per agent" sub="Biaya dihitung dari usage record lokal." className="mt-16" bodyClass="card-flush">
        <div className="table-wrap">
          <table className="pd-table">
            <thead>
              <tr>
                <th scope="col">Agent</th>
                <th scope="col">Model</th>
                <th scope="col" className="num-cell">Token 7 hari</th>
                <th scope="col" className="num-cell">Biaya</th>
                <th scope="col">Porsi</th>
              </tr>
            </thead>
            <tbody>
              {db.agents.map((agent) => {
                const rows = db.usage.filter((u) => u.agentId === agent.id && last7.includes(u.day));
                const tokens = rows.reduce((s, u) => s + u.tokens, 0);
                const cost = rows.reduce((s, u) => s + u.cost, 0);
                return (
                  <tr key={agent.id}>
                    <td>
                      <div className="cell-person">
                        <Avatar name={agent.name} size={28} />
                        <div>
                          <div className="cell-main">{agent.name}</div>
                          <div className="cell-sub">{agent.role}</div>
                        </div>
                      </div>
                    </td>
                    <td className="mono">{agent.model}</td>
                    <td className="num-cell mono">{num(tokens)}</td>
                    <td className="num-cell mono">{rupiah(cost)}</td>
                    <td>
                      <div className="porsi-cell">
                        <Progress value={(tokens / Math.max(totalTokens, 1)) * 100} thin />
                        <span>{Math.round((tokens / Math.max(totalTokens, 1)) * 100)}%</span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
      <p className="footnote">
        <Lock size={12} /> Usage tidak memuat isi percakapan atau data pribadi. Hanya jumlah token, biaya, dan agent.
      </p>
    </>
  );
}

export function MemoryPage() {
  const { db, addMemory } = useStore();
  const [query, setQuery] = useState('');
  const [scope, setScope] = useState('all');
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [memoryScope, setMemoryScope] = useState('Brand');
  const [content, setContent] = useState('');
  const [tags, setTags] = useState('');
  const scopes = Array.from(new Set(db.memories.map((m) => m.scope)));

  const memories = db.memories
    .filter((m) => (scope === 'all' ? true : m.scope === scope))
    .filter((m) => `${m.title} ${m.content} ${m.tags.join(' ')}`.toLowerCase().includes(query.toLowerCase()));

  const save = () => {
    if (!title.trim() || !content.trim()) return;
    addMemory({
      title: title.trim(),
      scope: memoryScope,
      content: content.trim(),
      tags: tags.split(',').map((t) => t.trim()).filter(Boolean),
    });
    setTitle('');
    setContent('');
    setTags('');
    setOpen(false);
  };

  return (
    <>
      <PageHead
        kicker="System · Live"
        title="Memory"
        desc="Konteks yang boleh dipakai agent. Memori tidak menyimpan credential atau data pribadi."
        actions={
          <button type="button" className="btn btn-primary" onClick={() => setOpen(true)}>
            <Plus size={15} /> Tambah memori
          </button>
        }
      />

      <div className="figs figs-3">
        <Fig label="Memori" value={db.memories.length} hint="Konteks aktif" icon={<Brain size={17} />} />
        <Fig label="Cakupan" value={scopes.length} hint="Brand, governance, proyek" icon={<Database size={17} />} />
        <Fig
          label="Diperbarui 7 hari"
          value={db.memories.filter((m) => Date.now() - +new Date(m.updated) < 7 * 86400000).length}
          hint="Tetap segar"
          icon={<CheckCircle2 size={17} />}
        />
      </div>

      <div className="toolbar toolbar-wrap mt-16">
        <SearchField value={query} onChange={setQuery} placeholder="Cari memori atau tag…" />
        <div className="toolbar-actions">
          <SelectBox
            label="Filter cakupan"
            value={scope}
            onChange={setScope}
            options={[{ value: 'all', label: 'Semua cakupan' }, ...scopes.map((s) => ({ value: s, label: s }))]}
          />
        </div>
      </div>

      {memories.length === 0 ? (
        <Card>
          <EmptyState icon={<Brain size={22} />} title="Tidak ada memori" desc="Tambahkan konteks yang boleh dipakai agent." />
        </Card>
      ) : (
        <div className="memory-grid">
          {memories.map((memory) => (
            <article key={memory.id} className="memory-card">
              <div className="memory-head">
                <Badge tone="brand">{memory.scope}</Badge>
                <span className="muted-small">{relTime(memory.updated)}</span>
              </div>
              <h3>{memory.title}</h3>
              <p>{memory.content}</p>
              <div className="tag-row">
                {memory.tags.map((tag) => (
                  <span key={tag} className="tag">
                    {tag}
                  </span>
                ))}
              </div>
            </article>
          ))}
        </div>
      )}

      <p className="footnote">
        <Lock size={12} /> Memori tidak boleh memuat password, token, atau data pribadi. Pelanggaran harus dihapus dan dilaporkan.
      </p>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Tambah memori"
        sub="Konteks ini akan tersedia untuk agent pada job berikutnya."
        footer={
          <>
            <button type="button" className="btn btn-ghost" onClick={() => setOpen(false)}>
              Batal
            </button>
            <button type="button" className="btn btn-primary" onClick={save} disabled={!title.trim() || !content.trim()}>
              <Save size={14} /> Simpan
            </button>
          </>
        }
      >
        <div className="form-grid">
          <Field label="Judul">
            <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Judul konteks" autoFocus />
          </Field>
          <Field label="Cakupan">
            <select className="input" value={memoryScope} onChange={(e) => setMemoryScope(e.target.value)}>
              {['Brand', 'Governance', 'Projects', 'Analytics', 'Assets', 'AI'].map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Isi" hint="Ringkas, spesifik, tanpa data sensitif.">
            <textarea className="input" rows={5} value={content} onChange={(e) => setContent(e.target.value)} />
          </Field>
          <Field label="Tag" hint="Pisahkan dengan koma.">
            <input className="input" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="tone, copywriting" />
          </Field>
        </div>
      </Modal>
    </>
  );
}

function FolderTree({
  items,
  expanded,
  toggle,
  depth = 0,
}: {
  items: FolderItem[];
  expanded: Record<string, boolean>;
  toggle: (id: string) => void;
  depth?: number;
}) {
  return (
    <ul className={cx('folder-list', depth > 0 && 'is-nested')}>
      {items.map((item) => {
        const isFolder = item.kind === 'Folder';
        const isOpen = expanded[item.id] ?? depth === 0;
        return (
          <li key={item.id}>
            <button
              type="button"
              className="folder-row"
              onClick={() => isFolder && toggle(item.id)}
              aria-expanded={isFolder ? isOpen : undefined}
            >
              <span className="folder-name">
                {isFolder ? (
                  isOpen ? (
                    <ChevronDown size={14} />
                  ) : (
                    <ChevronRight size={14} />
                  )
                ) : (
                  <span className="folder-spacer" />
                )}
                {isFolder ? <FolderOpen size={16} /> : <File size={16} />}
                <strong>{item.name}</strong>
              </span>
              <span className="folder-meta">
                {item.size && <span className="mono">{item.size}</span>}
                <span>{relTime(item.updated)}</span>
              </span>
            </button>
            {isFolder && isOpen && item.children && (
              <FolderTree items={item.children} expanded={expanded} toggle={toggle} depth={depth + 1} />
            )}
          </li>
        );
      })}
    </ul>
  );
}

export function FoldersPage() {
  const { db } = useStore();
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [query, setQuery] = useState('');
  const toggle = (id: string) => setExpanded((prev) => ({ ...prev, [id]: !(prev[id] ?? false) }));

  const flatten = (items: FolderItem[], path = ''): Array<FolderItem & { path: string }> =>
    items.flatMap((item) => [
      { ...item, path: path ? `${path} / ${item.name}` : item.name },
      ...(item.children ? flatten(item.children, path ? `${path} / ${item.name}` : item.name) : []),
    ]);
  const all = flatten(db.folders);
  const matches = query ? all.filter((f) => f.name.toLowerCase().includes(query.toLowerCase())) : [];

  return (
    <>
      <PageHead
        kicker="System · Live"
        title="Folders"
        desc="Struktur aset studio. Upload ditutup sampai object storage aktif."
        actions={
          <button
            type="button"
            className="btn btn-outline btn-sm"
            disabled
            title="Upload ditutup sampai R2 aktif"
          >
            <Upload size={14} /> Upload ditutup
          </button>
        }
      />

      <div className="notice-banner tone-warning">
        <Upload size={16} />
        <div>
          <strong>Storage belum tersedia.</strong>
          <span>Daftar folder bisa dibaca, tetapi upload dan hapus ditutup sampai integrasi object storage aktif.</span>
        </div>
      </div>

      <div className="toolbar mt-16">
        <SearchField value={query} onChange={setQuery} placeholder="Cari file atau folder…" />
      </div>

      <div className="overview-grid">
        <Card className="span-8" title="Struktur folder" sub={`${all.length} item terdaftar`}>
          {query ? (
            matches.length === 0 ? (
              <EmptyState icon={<Search size={22} />} title="Tidak ditemukan" desc="Coba kata kunci lain." />
            ) : (
              <ul className="folder-list">
                {matches.map((item) => (
                  <li key={item.id}>
                    <div className="folder-row">
                      <span className="folder-name">
                        {item.kind === 'Folder' ? <FolderOpen size={16} /> : <File size={16} />}
                        <div>
                          <strong>{item.name}</strong>
                          <span className="muted-small">{item.path}</span>
                        </div>
                      </span>
                      <span className="folder-meta">
                        {item.size && <span className="mono">{item.size}</span>}
                        <span>{relTime(item.updated)}</span>
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )
          ) : (
            <FolderTree items={db.folders} expanded={expanded} toggle={toggle} />
          )}
        </Card>

        <div className="span-4 stack">
          <Card title="Ringkasan aset" sub="Dari struktur lokal.">
            <div className="stat-list">
              <div className="stat-list-row">
                <span>Folder</span>
                <strong>{all.filter((f) => f.kind === 'Folder').length}</strong>
              </div>
              <div className="stat-list-row">
                <span>File</span>
                <strong>{all.filter((f) => f.kind === 'File').length}</strong>
              </div>
              <div className="stat-list-row">
                <span>Terbaru</span>
                <strong>{all.length ? relTime(all.sort((a, b) => +new Date(b.updated) - +new Date(a.updated))[0].updated) : '—'}</strong>
              </div>
            </div>
          </Card>
          <Card title="Konvensi penamaan" sub="Berlaku untuk semua aset.">
            <p className="code-inline">klien-proyek-jenis-versi</p>
            <p className="muted-small mt-8">Contoh: sagara-identity-logo-v03. Tanpa spasi dan tanpa nama personal.</p>
          </Card>
        </div>
      </div>
      <p className="footnote">
        <ShieldCheck size={12} /> Folder tidak mengubah status konten. Media tetap Needs setup sampai storage aktif.
      </p>
    </>
  );
}

const LEVEL_TABS = ['all', 'INFO', 'WARN', 'ERROR'] as const;

export function LogsPage() {
  const { db } = useStore();
  const [level, setLevel] = useState<(typeof LEVEL_TABS)[number]>('all');
  const [query, setQuery] = useState('');
  const [source, setSource] = useState('all');

  const sources = Array.from(new Set(db.logs.map((l) => l.source))).sort();
  const logs = db.logs
    .filter((l) => (level === 'all' ? true : l.level === level))
    .filter((l) => (source === 'all' ? true : l.source === source))
    .filter((l) => `${l.source} ${l.message}`.toLowerCase().includes(query.toLowerCase()));
  const counts = {
    all: db.logs.length,
    INFO: db.logs.filter((l) => l.level === 'INFO').length,
    WARN: db.logs.filter((l) => l.level === 'WARN').length,
    ERROR: db.logs.filter((l) => l.level === 'ERROR').length,
  };

  return (
    <>
      <PageHead
        kicker="System · Live"
        title="Logs"
        desc="Jejak sistem dan worker. Tidak ada nilai rahasia yang ditulis ke log."
        actions={
          <button type="button" className="btn btn-outline btn-sm" onClick={() => downloadJSON('playdesign-logs.json', logs)}>
            <Download size={14} /> Ekspor
          </button>
        }
      />

      <div className="toolbar toolbar-wrap">
        <Tabs
          items={LEVEL_TABS.map((key) => ({ key, label: key === 'all' ? 'Semua' : key, count: counts[key] }))}
          value={level}
          onChange={(v) => setLevel(v as (typeof LEVEL_TABS)[number])}
        />
        <div className="toolbar-actions">
          <SearchField value={query} onChange={setQuery} placeholder="Cari pesan log…" />
          <SelectBox
            label="Filter source"
            value={source}
            onChange={setSource}
            options={[{ value: 'all', label: 'Semua source' }, ...sources.map((s) => ({ value: s, label: s }))]}
          />
        </div>
      </div>

      <Card bodyClass="card-flush">
        {logs.length === 0 ? (
          <EmptyState icon={<ScrollText size={22} />} title="Tidak ada log" desc="Ubah level, source, atau kata kunci." />
        ) : (
          <div className="log-table">
            {logs.map((log) => (
              <div key={log.id} className="log-row">
                <span className={cx('log-level', `level-${log.level.toLowerCase()}`)}>{log.level}</span>
                <time className="mono">{fmtDate(log.at)} {fmtTime(log.at)}</time>
                <span className="log-source mono">{log.source}</span>
                <span className="log-message">{log.message}</span>
              </div>
            ))}
          </div>
        )}
      </Card>
      <p className="footnote">
        <Lock size={12} /> Redaksi otomatis: token, cookie, API key, dan header otorisasi tidak pernah masuk log.
      </p>
    </>
  );
}

const TIMEZONES = ['Asia/Jakarta', 'Asia/Makassar', 'Asia/Jayapura', 'Asia/Singapore'];

export function StudioSettingsPage() {
  const { db, saveSettings, resetData } = useStore();
  const [form, setForm] = useState(db.settings);
  const [resetOpen, setResetOpen] = useState(false);
  const [confirmText, setConfirmText] = useState('');

  const update = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const dirty = useMemo(() => JSON.stringify(form) !== JSON.stringify(db.settings), [form, db.settings]);

  return (
    <>
      <PageHead
        kicker="System · Live"
        title="Settings"
        desc="Identitas studio, preferensi kerja, dan data lokal. Data disimpan di browser ini."
        actions={
          <div className="detail-inline">
            <button type="button" className="btn btn-outline btn-sm" onClick={() => downloadJSON('playdesign-workspace.json', db)}>
              <Download size={14} /> Ekspor data
            </button>
            <button type="button" className="btn btn-primary" onClick={() => saveSettings(form)} disabled={!dirty}>
              <Save size={14} /> Simpan
            </button>
          </div>
        }
      />

      <div className="overview-grid">
        <Card title="Identitas studio" sub="Tampil di shell dan dokumen keluar." className="span-7">
          <div className="form-grid">
            <Field label="Nama studio">
              <input className="input" value={form.name} onChange={(e) => update('name', e.target.value)} />
            </Field>
            <Field label="Tagline">
              <input className="input" value={form.tagline} onChange={(e) => update('tagline', e.target.value)} />
            </Field>
            <Field label="Email kontak">
              <input className="input" type="email" value={form.email} onChange={(e) => update('email', e.target.value)} />
            </Field>
            <Field label="Zona waktu">
              <select className="input" value={form.timezone} onChange={(e) => update('timezone', e.target.value)}>
                {TIMEZONES.map((tz) => (
                  <option key={tz} value={tz}>
                    {tz}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Awal minggu">
              <select className="input" value={form.weekStart} onChange={(e) => update('weekStart', e.target.value as typeof form.weekStart)}>
                <option value="Senin">Senin</option>
                <option value="Minggu">Minggu</option>
              </select>
            </Field>
          </div>
        </Card>

        <Card title="Preferensi" sub="Notifikasi dan digest." className="span-5">
          <div className="setting-list">
            <div className="setting-row">
              <div>
                <strong>Digest harian</strong>
                <span>Ringkasan pagi berisi approval dan job bermasalah.</span>
              </div>
              <Toggle checked={form.digest} onChange={(v) => update('digest', v)} label="Digest harian" />
            </div>
            <div className="setting-row">
              <div>
                <strong>Notifikasi approval</strong>
                <span>Packet baru yang menunggu keputusan.</span>
              </div>
              <Toggle checked={form.notifyApprovals} onChange={(v) => update('notifyApprovals', v)} label="Notifikasi approval" />
            </div>
            <div className="setting-row">
              <div>
                <strong>Notifikasi job</strong>
                <span>Job gagal atau delivery uncertain.</span>
              </div>
              <Toggle checked={form.notifyJobs} onChange={(v) => update('notifyJobs', v)} label="Notifikasi job" />
            </div>
          </div>
        </Card>
      </div>

      <Card title="Tentang data lokal" sub="Demo workspace menyimpan state di browser." className="mt-16">
        <div className="settings-about">
          <div>
            <strong>playdesign.os.v2</strong>
            <span>State tersimpan di localStorage perangkat ini. Tidak ada data yang dikirim ke server eksternal.</span>
          </div>
          <div className="detail-inline">
            <button type="button" className="btn btn-outline btn-sm" onClick={() => downloadJSON('playdesign-workspace.json', db)}>
              <Download size={14} /> Unduh cadangan
            </button>
            <button type="button" className="btn btn-danger-text btn-sm" onClick={() => setResetOpen(true)}>
              <RotateCcw size={14} /> Reset data
            </button>
          </div>
        </div>
      </Card>

      <p className="footnote">
        <Database size={12} /> Versi data: playdesign.os.v2 · {db.users.length} pengguna · {db.tasks.length} tugas · {db.jobs.length} job.
      </p>

      <Modal
        open={resetOpen}
        onClose={() => setResetOpen(false)}
        title="Reset data lokal?"
        sub="Semua perubahan lokal akan hilang dan diganti seed awal."
        footer={
          <>
            <button type="button" className="btn btn-ghost" onClick={() => setResetOpen(false)}>
              Batal
            </button>
            <button
              type="button"
              className="btn btn-danger-text"
              disabled={confirmText !== 'RESET'}
              onClick={() => {
                resetData();
                setResetOpen(false);
                setConfirmText('');
              }}
            >
              <Trash2 size={14} /> Reset sekarang
            </button>
          </>
        }
      >
        <div className="detail-stack">
          <div className="notice-banner tone-danger">
            <AlertTriangle size={16} />
            <div>
              <strong>Tindakan ini tidak bisa dibatalkan.</strong>
              <span>Unduh cadangan lebih dulu jika data lokal masih dibutuhkan.</span>
            </div>
          </div>
          <Field label="Ketik RESET untuk melanjutkan">
            <input className="input" value={confirmText} onChange={(e) => setConfirmText(e.target.value)} placeholder="RESET" />
          </Field>
        </div>
      </Modal>
    </>
  );
}
