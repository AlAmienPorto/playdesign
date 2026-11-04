import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Ban,
  Bot,
  Brain,
  Check,
  CheckCircle2,
  CircleDot,
  Clock,
  Cpu,
  Download,
  FileCheck2,
  Filter,
  Gauge,
  Layers,
  ListChecks,
  Lock,
  MessagesSquare,
  Pause,
  Play,
  RotateCcw,
  Send,
  Settings2,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Terminal,
  Timer,
  Wrench,
  XCircle,
  Zap,
} from 'lucide-react';
import { useStore } from '../store/store';
import {
  AutoBadge,
  Avatar,
  Badge,
  Card,
  Drawer,
  EmptyState,
  Fig,
  PageHead,
  Pager,
  Progress,
  SearchField,
  SelectBox,
  Tabs,
} from '../components/ui';
import {
  cx,
  fmtDate,
  fmtTime,
  jobStatusLabel,
  num,
  relTime,
} from '../lib/utils';
import type { Agent, Job, JobStatus } from '../data/types';

function AiPage({
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
      <PageHead kicker="AI Agent Center · Foundation" title={title} desc={desc} actions={actions} />
      {children}
    </>
  );
}

const agentStatusTone = (status: Agent['status']) => {
  if (status === 'Aktif') return 'success' as const;
  if (status === 'Dijeda') return 'warning' as const;
  if (status === 'Error') return 'danger' as const;
  return 'neutral' as const;
};

function AgentMark({ agent, size = 42 }: { agent: Agent; size?: number }) {
  return (
    <span
      className={cx('agent-mark', `tone-${agent.tone}`)}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.36) }}
      aria-hidden="true"
    >
      {agent.name.slice(0, 1)}
    </span>
  );
}

function JobDrawer({
  job,
  onClose,
  onRetry,
}: {
  job: Job | null;
  onClose: () => void;
  onRetry: (id: string) => void;
}) {
  const { db } = useStore();
  if (!job) return null;
  const agent = db.agents.find((a) => a.id === job.agentId);
  const audit = db.audit.filter((a) => a.target.includes(job.id) || a.target.includes(job.title));
  const canRetry = job.status === 'failed';
  return (
    <Drawer
      open={Boolean(job)}
      onClose={onClose}
      title={job.title}
      sub={`${job.id} · ${agent?.name ?? 'Agent'} · ${jobStatusLabel[job.status]}`}
      width={640}
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Tutup
          </button>
          {canRetry && (
            <button type="button" className="btn btn-primary" onClick={() => onRetry(job.id)}>
              <RotateCcw size={14} /> Retry manual
            </button>
          )}
        </>
      }
    >
      <div className="detail-stack">
        <div className="detail-grid">
          <div>
            <span className="detail-label">Status</span>
            <AutoBadge value={job.status} />
          </div>
          <div>
            <span className="detail-label">Durasi</span>
            <span className="mono">{job.durationSec ? `${job.durationSec}s` : '—'}</span>
          </div>
          <div>
            <span className="detail-label">Retries</span>
            <span className="mono">{job.retries}</span>
          </div>
          <div>
            <span className="detail-label">Dipicu oleh</span>
            <span>{job.triggeredBy}</span>
          </div>
        </div>

        {job.status === 'delivery_uncertain' && (
          <div className="notice-banner tone-danger">
            <ShieldAlert size={16} />
            <div>
              <strong>Delivery uncertain — tidak di-retry otomatis.</strong>
              <span>Provider tidak mengonfirmasi hasil kirim. Butuh keputusan manusia sebelum ada aksi lanjutan.</span>
            </div>
          </div>
        )}

        {job.needsApproval && (
          <div className="notice-banner tone-warning">
            <Lock size={16} />
            <div>
              <strong>Output butuh approval manusia.</strong>
              <span>Agent tidak boleh memicu aksi keluar dari hasil job ini.</span>
            </div>
          </div>
        )}

        <div className="detail-block">
          <div className="detail-block-head">
            <Terminal size={14} /> Input
          </div>
          <p className="prose-sm">{job.input}</p>
        </div>

        {job.output && (
          <div className="detail-block">
            <div className="detail-block-head">
              <FileCheck2 size={14} /> Output
            </div>
            <p className="prose-sm">{job.output}</p>
          </div>
        )}

        {job.error && (
          <div className="detail-block is-danger">
            <div className="detail-block-head">
              <XCircle size={14} /> Error
            </div>
            <p className="prose-sm">{job.error}</p>
          </div>
        )}

        <div className="detail-block">
          <div className="detail-block-head">
            <Activity size={14} /> Event eksekusi
          </div>
          <ol className="timeline">
            {job.events.map((event, i) => (
              <li key={`${event.at}-${i}`} className="timeline-item">
                <span className={cx('timeline-dot', event.tone && `tone-${event.tone}`)} />
                <div>
                  <div className="timeline-title">{event.label}</div>
                  {event.detail && <div className="timeline-sub">{event.detail}</div>}
                  <div className="timeline-time">{fmtTime(event.at)} · {fmtDate(event.at)}</div>
                </div>
              </li>
            ))}
          </ol>
        </div>

        <div className="detail-block">
          <div className="detail-block-head">
            <ShieldCheck size={14} /> Audit trail
          </div>
          {audit.length ? (
            <ul className="audit-mini">
              {audit.map((a) => (
                <li key={a.id}>
                  <strong>{a.actor}</strong> {a.action} · {relTime(a.at)}
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted-small">Belum ada entri audit langsung untuk job ini. Retry manual akan dicatat otomatis.</p>
          )}
        </div>

        <p className="footnote">
          <Lock size={12} /> Rahasia tidak pernah dikirim ke klien. Field credential dihapus sebelum respons API.
        </p>
      </div>
    </Drawer>
  );
}

export function AgentOverview() {
  const { db } = useStore();
  const active = db.agents.filter((a) => a.status === 'Aktif');
  const running = db.jobs.filter((j) => j.status === 'running');
  const queued = db.jobs.filter((j) => j.status === 'queued');
  const avgSuccess = Math.round(db.agents.reduce((s, a) => s + a.successRate, 0) / db.agents.length);
  const uncertain = db.jobs.filter((j) => j.status === 'delivery_uncertain');
  const pendingApproval = db.approvals.filter((a) => a.status === 'pending');
  const latestJobs = [...db.jobs].sort((a, b) => +new Date(b.startedAt) - +new Date(a.startedAt)).slice(0, 5);
  const maxLoad = Math.max(...db.agents.map((a) => a.tasksToday), 1);

  return (
    <AiPage
      title="Agent Overview"
      desc="Status, beban kerja, dan kegagalan terakhir dari seluruh agent. Semua tindakan keluar tetap berada di tangan manusia."
      actions={
        <Badge tone={active.length ? 'success' : 'neutral'} dot>
          {active.length} agent aktif
        </Badge>
      }
    >
      <div className="figs figs-4">
        <Fig
          label="Agent aktif"
          value={`${active.length}/${db.agents.length}`}
          hint="Sisanya dijeda atau error"
          icon={<Bot size={17} />}
        />
        <Fig
          label="Job berjalan"
          value={running.length}
          hint={`${queued.length} menunggu di antrean`}
          icon={<Zap size={17} />}
        />
        <Fig
          label="Success rate"
          value={`${avgSuccess}%`}
          delta="7 hari"
          deltaTone="success"
          icon={<Gauge size={17} />}
        />
        <Fig
          label="Butuh keputusan"
          value={pendingApproval.length + uncertain.length}
          hint="Approval + delivery uncertain"
          icon={<ShieldAlert size={17} />}
        />
      </div>

      <div className="overview-grid mt-16">
        <Card
          title="Beban kerja agent"
          sub="Tugas yang ditangani hari ini. Angka kosong berarti idle, bukan nol."
          className="span-7"
        >
          <div className="agent-load-list">
            {db.agents.map((agent) => (
              <div key={agent.id} className="agent-load-row">
                <AgentMark agent={agent} size={34} />
                <div className="agent-load-main">
                  <div className="agent-load-top">
                    <strong>{agent.name}</strong>
                    <span className="muted-small">{agent.role}</span>
                  </div>
                  <Progress
                    value={(agent.tasksToday / maxLoad) * 100}
                    tone={agent.status === 'Error' ? 'danger' : agent.status === 'Dijeda' ? 'warning' : 'brand'}
                    thin
                  />
                </div>
                <div className="agent-load-meta">
                  <span className="mono">{agent.tasksToday}</span>
                  <Badge tone={agentStatusTone(agent.status)} dot>
                    {agent.status}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        </Card>

        <div className="span-5 stack">
          <Card title="Perlu perhatian" sub="Hal yang tidak boleh diselesaikan otomatis.">
            {uncertain.length === 0 && db.agents.filter((a) => a.status === 'Error').length === 0 ? (
              <p className="muted-small">Tidak ada kegagalan yang menunggu keputusan.</p>
            ) : (
              <ul className="attention-list">
                {db.agents
                  .filter((a) => a.status === 'Error')
                  .map((agent) => (
                    <li key={agent.id}>
                      <span className="attention-icon tone-danger">
                        <AlertTriangle size={14} />
                      </span>
                      <div>
                        <strong>{agent.name} berhenti</strong>
                        <span>{agent.description.split('.')[0]}. Terakhir {relTime(agent.lastRun)}.</span>
                      </div>
                    </li>
                  ))}
                {uncertain.map((job) => (
                  <li key={job.id}>
                    <span className="attention-icon tone-warning">
                      <ShieldAlert size={14} />
                    </span>
                    <div>
                      <strong>Delivery uncertain</strong>
                      <span>{job.title} — menunggu keputusan manusia, tidak di-retry.</span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card title="Guard pengiriman" sub="Aturan yang tidak bisa dilewati agent.">
            <ul className="rule-list">
              <li>
                <ShieldCheck size={14} /> QC PASS bukan pengganti approval Owner.
              </li>
              <li>
                <Ban size={14} /> Agent tidak punya hak publish atau kirim keluar.
              </li>
              <li>
                <RotateCcw size={14} /> delivery_uncertain tidak di-retry otomatis.
              </li>
              <li>
                <Lock size={14} /> Credential tidak pernah masuk konteks agent.
              </li>
            </ul>
          </Card>
        </div>
      </div>

      <div className="overview-grid mt-16">
        <Card
          title="Job terbaru"
          sub="Termasuk yang masih berjalan."
          className="span-7"
          action={<span className="link-text">Lihat Job Queue</span>}
        >
          <ul className="job-mini-list">
            {latestJobs.map((job) => {
              const agent = db.agents.find((a) => a.id === job.agentId);
              return (
                <li key={job.id} className="job-mini">
                  <span className="job-mini-icon">
                    {job.status === 'running' ? <Zap size={14} /> : job.status === 'failed' || job.status === 'delivery_uncertain' ? <XCircle size={14} /> : <CheckCircle2 size={14} />}
                  </span>
                  <div className="job-mini-main">
                    <div className="job-mini-title">{job.title}</div>
                    <div className="job-mini-meta">
                      {agent?.name ?? 'Agent'} · {relTime(job.startedAt)}
                      {job.needsApproval && <span className="chip-neutral">butuh approval</span>}
                    </div>
                  </div>
                  <AutoBadge value={job.status} />
                </li>
              );
            })}
          </ul>
        </Card>

        <Card title="Kesiapan orkestrasi" sub="Hermes menyusun draft dan QC; manusia memutuskan." className="span-5">
          <div className="flow-chain flow-vertical">
            {[
              { label: 'Intake', desc: 'Brief dari manusia', count: queued.length },
              { label: 'Draft', desc: 'Agent menyusun', count: running.length },
              { label: 'QC', desc: 'Vela memeriksa', count: db.jobs.filter((j) => j.agentId === 'a-3').length },
              { label: 'Approval', desc: 'Owner memutuskan', count: pendingApproval.length },
            ].map((step) => (
              <div key={step.label} className="flow-step">
                <div>
                  <strong>{step.label}</strong>
                  <span>{step.desc}</span>
                </div>
                <span className="tab-count">{step.count}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </AiPage>
  );
}

export function AgentDirectory() {
  const { db } = useStore();
  const [query, setQuery] = useState('');
  const [detail, setDetail] = useState<Agent | null>(null);
  const agents = db.agents.filter((a) =>
    `${a.name} ${a.codename} ${a.role} ${a.model}`.toLowerCase().includes(query.toLowerCase()),
  );

  return (
    <AiPage
      title="Agent Directory"
      desc="Profil lengkap setiap agent: model, cakupan, tool, dan batas kewenangan."
      actions={<Badge tone="info">{db.agents.length} agent terdaftar</Badge>}
    >
      <div className="toolbar">
        <SearchField value={query} onChange={setQuery} placeholder="Cari agent, peran, atau model…" />
      </div>

      {agents.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Bot size={22} />}
            title="Tidak ada agent yang cocok"
            desc="Ubah kata kunci pencarian."
          />
        </Card>
      ) : (
        <div className="agent-grid">
          {agents.map((agent) => (
            <button key={agent.id} type="button" className="agent-card" onClick={() => setDetail(agent)}>
              <div className="agent-card-top">
                <AgentMark agent={agent} />
                <div>
                  <h3>{agent.name}</h3>
                  <span className="mono">{agent.codename}</span>
                </div>
                <Badge tone={agentStatusTone(agent.status)} dot>
                  {agent.status}
                </Badge>
              </div>
              <p className="agent-role">{agent.role}</p>
              <p className="agent-desc">{agent.description}</p>
              <div className="agent-stats">
                <div>
                  <span>Success</span>
                  <strong>{agent.successRate}%</strong>
                </div>
                <div>
                  <span>Avg durasi</span>
                  <strong>{agent.avgDuration}s</strong>
                </div>
                <div>
                  <span>Hari ini</span>
                  <strong>{agent.tasksToday}</strong>
                </div>
              </div>
              <div className="agent-foot">
                <span className="mono">{agent.model}</span>
                <ArrowRight size={14} />
              </div>
            </button>
          ))}
        </div>
      )}

      <Drawer
        open={Boolean(detail)}
        onClose={() => setDetail(null)}
        title={detail?.name ?? 'Agent'}
        sub={detail ? `${detail.role} · ${detail.model}` : undefined}
      >
        {detail && (
          <div className="detail-stack">
            <div className="agent-hero">
              <AgentMark agent={detail} size={56} />
              <div>
                <strong>{detail.codename}</strong>
                <span>{detail.description}</span>
              </div>
            </div>
            <div className="detail-grid">
              <div>
                <span className="detail-label">Status</span>
                <Badge tone={agentStatusTone(detail.status)} dot>
                  {detail.status}
                </Badge>
              </div>
              <div>
                <span className="detail-label">Success rate</span>
                <span className="mono">{detail.successRate}%</span>
              </div>
              <div>
                <span className="detail-label">Avg durasi</span>
                <span className="mono">{detail.avgDuration}s</span>
              </div>
              <div>
                <span className="detail-label">Terakhir jalan</span>
                <span>{relTime(detail.lastRun)}</span>
              </div>
            </div>
            <div className="detail-block">
              <div className="detail-block-head">
                <Layers size={14} /> Cakupan workspace
              </div>
              <div className="tag-row">
                {detail.scope.map((scope) => (
                  <Badge key={scope} tone="neutral">
                    {scope}
                  </Badge>
                ))}
              </div>
            </div>
            <div className="detail-block">
              <div className="detail-block-head">
                <Wrench size={14} /> Tool yang diizinkan
              </div>
              <div className="tag-row">
                {detail.tools.map((tool) => (
                  <span key={tool} className="code-inline">
                    {tool}
                  </span>
                ))}
              </div>
              <p className="footnote">
                <Lock size={12} /> Tidak ada tool publish atau kirim keluar dalam daftar ini.
              </p>
            </div>
            <div className="detail-block">
              <div className="detail-block-head">
                <Activity size={14} /> Job terakhir
              </div>
              <ul className="audit-mini">
                {db.jobs
                  .filter((j) => j.agentId === detail.id)
                  .slice(0, 4)
                  .map((j) => (
                    <li key={j.id}>
                      {j.title} · <span className="mono">{jobStatusLabel[j.status]}</span>
                    </li>
                  ))}
                {db.jobs.filter((j) => j.agentId === detail.id).length === 0 && (
                  <li>Belum ada job untuk agent ini.</li>
                )}
              </ul>
            </div>
          </div>
        )}
      </Drawer>
    </AiPage>
  );
}

const AI_REPLIES = [
  'Catatan diterima. Aku menyimpan konteks ini untuk draft berikutnya; aksi keluar tetap menunggu approval Owner.',
  'Sudah kucatat. Bagian itu kutandai di work result supaya reviewer melihat sumber dan batasannya.',
  'Aku bisa menyiapkan revisi draft. Kirim brief tambahan, lalu aku masukkan ke antrean QC.',
];

export function AITeamChat() {
  const { db, sendChat, receiveChat, user } = useStore();
  const [text, setText] = useState('');
  const [typing, setTyping] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const timer = useRef<number | null>(null);
  const messages = db.chat.filter((c) => c.room === 'AI Team');
  const replyIndex = useRef(0);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [messages.length, typing]);

  useEffect(
    () => () => {
      if (timer.current) window.clearTimeout(timer.current);
    },
    [],
  );

  const submit = () => {
    const value = text.trim();
    if (!value) return;
    sendChat('AI Team', value);
    setText('');
    const responder = db.agents.filter((a) => a.status !== 'Dijeda')[replyIndex.current % 4];
    replyIndex.current += 1;
    setTyping(responder.name);
    timer.current = window.setTimeout(() => {
      receiveChat('AI Team', responder.name, `Agent · ${responder.role}`, AI_REPLIES[replyIndex.current % AI_REPLIES.length]);
      setTyping(null);
    }, 950);
  };

  return (
    <AiPage
      title="AI Team Chat"
      desc="Log percakapan antar agent beserta panel konteks. Percakapan tidak pernah menjadi perintah pengiriman."
      actions={
        <Badge tone="success" dot>
          {db.agents.filter((a) => a.status === 'Aktif').length} online
        </Badge>
      }
    >
      <div className="chat-layout">
        <Card className="chat-card" bodyClass="chat-card-body">
          <div className="chat-head">
            <div>
              <h2 className="card-title">Ruang AI Team</h2>
              <p className="card-sub">Aksa, Nara, Vela, dan Raka berbagi konteks pekerjaan.</p>
            </div>
            <Badge tone="info">Agent-to-agent</Badge>
          </div>

          <div className="chat-log" role="log" aria-live="polite">
            {messages.length === 0 && (
              <EmptyState
                compact
                icon={<MessagesSquare size={20} />}
                title="Belum ada percakapan"
                desc="Mulai dengan membagikan konteks pekerjaan ke tim agent."
              />
            )}
            {messages.map((message) => {
              const agent = db.agents.find((a) => a.name === message.author);
              const mine = message.author === user.name;
              return (
                <div key={message.id} className={cx('chat-msg', mine && 'is-mine', agent && 'is-agent')}>
                  {agent ? <AgentMark agent={agent} size={30} /> : <Avatar name={message.author} size={30} />}
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
            })}
            {typing && (
              <div className="chat-msg is-agent">
                <span className="agent-mark tone-neutral" aria-hidden="true">
                  {typing.slice(0, 1)}
                </span>
                <div className="chat-bubble is-typing">
                  {typing} sedang mengetik
                  <span className="typing-dots">
                    <i />
                    <i />
                    <i />
                  </span>
                </div>
              </div>
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
              placeholder="Bagikan konteks atau minta draft…"
              aria-label="Tulis pesan ke AI Team"
            />
            <button type="button" className="btn btn-primary" onClick={submit} disabled={!text.trim()}>
              <Send size={14} /> Kirim
            </button>
          </div>
          <p className="chat-guard">
            <ShieldAlert size={13} /> Agent tidak bisa memicu publish atau pengiriman dari chat. Semua hasil masuk Work Results untuk direview.
          </p>
        </Card>

        <div className="chat-side">
          <Card title="Panel agent" sub="Status langsung dari direktori.">
            <ul className="chat-agent-list">
              {db.agents.map((agent) => (
                <li key={agent.id}>
                  <AgentMark agent={agent} size={32} />
                  <div>
                    <strong>{agent.name}</strong>
                    <span>{agent.role}</span>
                  </div>
                  <Badge tone={agentStatusTone(agent.status)} dot>
                    {agent.status}
                  </Badge>
                </li>
              ))}
            </ul>
          </Card>
          <Card title="Aturan ruang" sub="Berlaku untuk semua agent.">
            <ul className="rule-list">
              <li>
                <Check size={14} /> Setiap klaim menyertakan sumber dan timestamp.
              </li>
              <li>
                <Ban size={14} /> Tidak ada instruksi kirim keluar di dalam chat.
              </li>
              <li>
                <Lock size={14} /> Credential dan data pribadi dilarang ditempel.
              </li>
              <li>
                <FileCheck2 size={14} /> Handoff ke manusia lewat approval packet.
              </li>
            </ul>
          </Card>
        </div>
      </div>
    </AiPage>
  );
}

export function OrchestrationPage() {
  const { db } = useStore();
  const queued = db.jobs.filter((j) => j.status === 'queued').length;
  const running = db.jobs.filter((j) => j.status === 'running').length;
  const needsReview = db.jobs.filter((j) => j.status === 'completed' && j.needsApproval).length;
  const pending = db.approvals.filter((a) => a.status === 'pending').length;

  const stages = [
    {
      key: 'intake',
      title: 'Intake',
      desc: 'Brief diterima dari manusia lalu dinormalisasi menjadi input job.',
      owner: 'Operator',
      count: queued,
      icon: <ListChecks size={16} />,
    },
    {
      key: 'draft',
      title: 'Draft',
      desc: 'Aksa, Nara, atau Raka menyusun output sesuai cakupan tool.',
      owner: 'Agent',
      count: running,
      icon: <Sparkles size={16} />,
    },
    {
      key: 'qc',
      title: 'QC',
      desc: 'Vela memeriksa tone, klaim, dan struktur. Hasil PASS/FAIL tercatat.',
      owner: 'Agent + Reviewer',
      count: needsReview,
      icon: <FileCheck2 size={16} />,
    },
    {
      key: 'approval',
      title: 'Approval',
      desc: 'Owner memutuskan packet. Tidak ada jalur alternatif.',
      owner: 'Owner',
      count: pending,
      icon: <ShieldCheck size={16} />,
    },
    {
      key: 'delivery',
      title: 'Delivery',
      desc: 'Adapter sisi server menjalankan pengiriman dan mencatat delivery event.',
      owner: 'Server',
      count: db.jobs.filter((j) => j.status === 'delivery_uncertain').length,
      icon: <Send size={16} />,
    },
  ];

  return (
    <AiPage
      title="Orchestration"
      desc="Alur kerja Hermes dari intake sampai delivery, termasuk titik eskalasi manusia."
    >
      <div className="notice-banner tone-info">
        <Brain size={16} />
        <div>
          <strong>Hermes menyusun dan memeriksa, bukan memutuskan.</strong>
          <span>Setiap perpindahan ke delivery wajib melewati packet approval yang disetujui Owner.</span>
        </div>
      </div>

      <Card title="Alur orkestrasi" sub="Satu jalur utama; tidak ada bypass." className="mt-16">
        <ol className="orchestration">
          {stages.map((stage, i) => (
            <li key={stage.key} className="orchestration-step">
              <div className="orchestration-mark">
                {stage.icon}
                {i < stages.length - 1 && <span className="orchestration-line" />}
              </div>
              <div className="orchestration-body">
                <div className="orchestration-head">
                  <strong>{stage.title}</strong>
                  <span className="tab-count">{stage.count}</span>
                </div>
                <p>{stage.desc}</p>
                <span className="orchestration-owner">{stage.owner}</span>
              </div>
            </li>
          ))}
        </ol>
      </Card>

      <div className="overview-grid mt-16">
        <Card title="Penugasan agent" sub="Berdasarkan cakupan dan status saat ini." className="span-7">
          <div className="assignment-grid">
            {db.agents.map((agent) => (
              <div key={agent.id} className="assignment-card">
                <div className="assignment-head">
                  <AgentMark agent={agent} size={34} />
                  <div>
                    <strong>{agent.name}</strong>
                    <span>{agent.role}</span>
                  </div>
                  <Badge tone={agentStatusTone(agent.status)} dot>
                    {agent.status}
                  </Badge>
                </div>
                <div className="assignment-stats">
                  <div>
                    <span>Job aktif</span>
                    <strong>{db.jobs.filter((j) => j.agentId === agent.id && (j.status === 'running' || j.status === 'queued')).length}</strong>
                  </div>
                  <div>
                    <span>Tugas hari ini</span>
                    <strong>{agent.tasksToday}</strong>
                  </div>
                  <div>
                    <span>Success</span>
                    <strong>{agent.successRate}%</strong>
                  </div>
                </div>
                <div className="tag-row">
                  {agent.scope.map((scope) => (
                    <span key={scope} className="chip-neutral">
                      {scope}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Card>

        <div className="span-5 stack">
          <Card title="Eskalasi" sub="Kapan pekerjaan berhenti dan menunggu manusia.">
            <ul className="rule-list">
              <li>
                <ShieldAlert size={14} /> QC FAIL dikembalikan ke draft, tidak masuk approval.
              </li>
              <li>
                <Ban size={14} /> Provider timeout menjadi delivery_uncertain, bukan retry otomatis.
              </li>
              <li>
                <AlertTriangle size={14} /> Error tool berulang menghentikan agent dan memicu notifikasi.
              </li>
              <li>
                <Lock size={14} /> Output dengan data sensitif diblokir sebelum keluar dari server.
              </li>
            </ul>
          </Card>
          <Card title="Kesehatan antrean" sub="Snapshot saat ini.">
            <div className="stat-list">
              <div className="stat-list-row">
                <span>Queued</span>
                <strong>{queued}</strong>
              </div>
              <div className="stat-list-row">
                <span>Running</span>
                <strong>{running}</strong>
              </div>
              <div className="stat-list-row">
                <span>Menunggu review</span>
                <strong>{needsReview}</strong>
              </div>
              <div className="stat-list-row">
                <span>Delivery uncertain</span>
                <strong>{db.jobs.filter((j) => j.status === 'delivery_uncertain').length}</strong>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </AiPage>
  );
}

const JOB_TABS: Array<{ key: JobStatus | 'all'; label: string }> = [
  { key: 'all', label: 'Semua' },
  { key: 'running', label: 'Running' },
  { key: 'queued', label: 'Queued' },
  { key: 'completed', label: 'Completed' },
  { key: 'failed', label: 'Failed' },
  { key: 'delivery_uncertain', label: 'Delivery uncertain' },
  { key: 'cancelled', label: 'Cancelled' },
];

export function JobQueuePage() {
  const { db, retryJob, toast } = useStore();
  const [status, setStatus] = useState<JobStatus | 'all'>('all');
  const [query, setQuery] = useState('');
  const [agentFilter, setAgentFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [active, setActive] = useState<Job | null>(null);
  const pageSize = 8;

  const counts = useMemo(() => {
    const map: Record<string, number> = { all: db.jobs.length };
    db.jobs.forEach((j) => {
      map[j.status] = (map[j.status] ?? 0) + 1;
    });
    return map;
  }, [db.jobs]);

  const filtered = useMemo(() => {
    return db.jobs
      .filter((job) => (status === 'all' ? true : job.status === status))
      .filter((job) => (agentFilter === 'all' ? true : job.agentId === agentFilter))
      .filter((job) => {
        const agent = db.agents.find((a) => a.id === job.agentId);
        return `${job.id} ${job.title} ${job.triggeredBy} ${agent?.name ?? ''}`
          .toLowerCase()
          .includes(query.toLowerCase());
      })
      .sort((a, b) => +new Date(b.startedAt) - +new Date(a.startedAt));
  }, [db.jobs, db.agents, status, agentFilter, query]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, pageCount);
  const rows = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  const retry = (id: string) => {
    const job = db.jobs.find((j) => j.id === id);
    retryJob(id);
    if (job?.status !== 'failed') toast('Job ini tidak bisa di-retry manual.', 'warning');
    setActive(null);
  };

  return (
    <AiPage
      title="Job Queue"
      desc="Antrean job agent dengan filter status dan drawer eksekusi. Retry hanya untuk job yang gagal."
      actions={<Badge tone="neutral">{db.jobs.length} job tercatat</Badge>}
    >
      <div className="toolbar toolbar-wrap">
        <Tabs items={JOB_TABS.map((tab) => ({ key: tab.key, label: tab.label, count: counts[tab.key] ?? 0 }))} value={status} onChange={(v) => { setStatus(v as JobStatus | 'all'); setPage(1); }} />
        <div className="toolbar-actions">
          <SearchField value={query} onChange={(v) => { setQuery(v); setPage(1); }} placeholder="Cari job atau agent…" />
          <SelectBox
            label="Filter agent"
            value={agentFilter}
            onChange={(v) => { setAgentFilter(v); setPage(1); }}
            options={[{ value: 'all', label: 'Semua agent' }, ...db.agents.map((a) => ({ value: a.id, label: a.name }))]}
          />
        </div>
      </div>

      <Card bodyClass="card-flush">
        {rows.length === 0 ? (
          <EmptyState
            icon={<Zap size={22} />}
            title="Tidak ada job pada filter ini"
            desc="Coba status lain atau ubah kata kunci pencarian."
          />
        ) : (
          <div className="table-wrap">
            <table className="pd-table">
              <thead>
                <tr>
                  <th scope="col">Job</th>
                  <th scope="col">Agent</th>
                  <th scope="col">Status</th>
                  <th scope="col">Dipicu</th>
                  <th scope="col">Durasi</th>
                  <th scope="col">Approval</th>
                  <th scope="col" className="num-cell">Retries</th>
                  <th scope="col" />
                </tr>
              </thead>
              <tbody>
                {rows.map((job) => {
                  const agent = db.agents.find((a) => a.id === job.agentId);
                  return (
                    <tr key={job.id} className="is-clickable" onClick={() => setActive(job)}>
                      <td>
                        <div className="cell-main">{job.title}</div>
                        <div className="cell-sub mono">{job.id}</div>
                      </td>
                      <td>
                        <div className="cell-person">
                          {agent && <AgentMark agent={agent} size={26} />}
                          <span>{agent?.name ?? '—'}</span>
                        </div>
                      </td>
                      <td>
                        <AutoBadge value={job.status} />
                      </td>
                      <td>
                        <div className="cell-main">{job.triggeredBy}</div>
                        <div className="cell-sub">{relTime(job.startedAt)}</div>
                      </td>
                      <td className="num-cell mono">{job.durationSec ? `${job.durationSec}s` : '—'}</td>
                      <td>{job.needsApproval ? <Badge tone="warning">Butuh</Badge> : <span className="muted-small">Tidak</span>}</td>
                      <td className="num-cell mono">{job.retries}</td>
                      <td className="row-end">
                        <ArrowRight size={14} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <Pager page={safePage} pageCount={pageCount} total={filtered.length} pageSize={pageSize} onChange={setPage} />
      </Card>

      <JobDrawer job={active} onClose={() => setActive(null)} onRetry={retry} />
    </AiPage>
  );
}

export function WorkResultsPage() {
  const { db } = useStore();
  const [query, setQuery] = useState('');
  const [active, setActive] = useState<Job | null>(null);
  const { retryJob } = useStore();

  const results = db.jobs
    .filter((j) => j.status === 'completed' && j.output)
    .filter((j) => {
      const agent = db.agents.find((a) => a.id === j.agentId);
      return `${j.title} ${j.output} ${agent?.name ?? ''}`.toLowerCase().includes(query.toLowerCase());
    });
  const waiting = results.filter((r) => r.needsApproval);
  const ready = results.filter((r) => !r.needsApproval);

  return (
    <AiPage
      title="Work Results"
      desc="Hasil pekerjaan agent dengan status review. Hasil tanpa approval tidak bisa menjadi aksi keluar."
      actions={<Badge tone={waiting.length ? 'warning' : 'success'}>{waiting.length} menunggu review</Badge>}
    >
      <div className="figs figs-3">
        <Fig label="Total hasil" value={results.length} hint="Dari job completed" icon={<FileCheck2 size={17} />} />
        <Fig label="Menunggu review" value={waiting.length} hint="Perlu keputusan manusia" icon={<ShieldAlert size={17} />} />
        <Fig label="Siap dipakai" value={ready.length} hint="Hanya untuk kerja internal" icon={<CheckCircle2 size={17} />} />
      </div>

      <div className="toolbar mt-16">
        <SearchField value={query} onChange={setQuery} placeholder="Cari hasil atau agent…" />
      </div>

      {results.length === 0 ? (
        <Card>
          <EmptyState
            icon={<FileCheck2 size={22} />}
            title="Belum ada hasil"
            desc="Work result muncul setelah job selesai dan menyimpan output."
          />
        </Card>
      ) : (
        <div className="result-grid">
          {results.map((job) => {
            const agent = db.agents.find((a) => a.id === job.agentId);
            return (
              <button key={job.id} type="button" className="result-card" onClick={() => setActive(job)}>
                <div className="result-head">
                  <span className="result-icon">
                    <FileCheck2 size={15} />
                  </span>
                  <Badge tone={job.needsApproval ? 'warning' : 'success'} dot>
                    {job.needsApproval ? 'Menunggu review' : 'Siap dipakai'}
                  </Badge>
                </div>
                <h3>{job.title}</h3>
                <p>{job.output}</p>
                <div className="result-meta">
                  <span>
                    {agent?.name ?? 'Agent'} · {relTime(job.startedAt)}
                  </span>
                  <span className="mono">{job.durationSec}s</span>
                </div>
              </button>
            );
          })}
        </div>
      )}

      <JobDrawer job={active} onClose={() => setActive(null)} onRetry={retryJob} />
    </AiPage>
  );
}

const LEVEL_TABS = ['all', 'INFO', 'WARN', 'ERROR'] as const;

export function ExecutionLogsPage() {
  const { db } = useStore();
  const [level, setLevel] = useState<(typeof LEVEL_TABS)[number]>('all');
  const [query, setQuery] = useState('');

  const logs = db.logs
    .filter((log) => (level === 'all' ? true : log.level === level))
    .filter((log) => `${log.source} ${log.message}`.toLowerCase().includes(query.toLowerCase()));
  const counts = {
    all: db.logs.length,
    INFO: db.logs.filter((l) => l.level === 'INFO').length,
    WARN: db.logs.filter((l) => l.level === 'WARN').length,
    ERROR: db.logs.filter((l) => l.level === 'ERROR').length,
  };

  return (
    <AiPage
      title="Execution Logs"
      desc="Jejak mentah eksekusi job dan sistem. Field rahasia dihapus sebelum ditampilkan."
      actions={
        <button
          type="button"
          className="btn btn-outline btn-sm"
          onClick={() => {
            const blob = new Blob([logs.map((l) => `${l.at} ${l.level} ${l.source} ${l.message}`).join('\n')], {
              type: 'text/plain',
            });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'playdesign-execution.log';
            a.click();
            URL.revokeObjectURL(url);
          }}
        >
          <Download size={14} /> Ekspor log
        </button>
      }
    >
      <div className="notice-banner tone-neutral">
        <Lock size={16} />
        <div>
          <strong>Redaksi otomatis aktif.</strong>
          <span>Token, cookie, dan API key tidak pernah ditulis ke log. Yang tersedia hanya referensi credential.</span>
        </div>
      </div>

      <div className="toolbar toolbar-wrap mt-16">
        <Tabs
          items={LEVEL_TABS.map((key) => ({ key, label: key === 'all' ? 'Semua' : key, count: counts[key] }))}
          value={level}
          onChange={(v) => setLevel(v as (typeof LEVEL_TABS)[number])}
        />
        <div className="toolbar-actions">
          <SearchField value={query} onChange={setQuery} placeholder="Cari source atau pesan…" />
        </div>
      </div>

      <Card bodyClass="card-flush">
        {logs.length === 0 ? (
          <EmptyState icon={<Terminal size={22} />} title="Tidak ada log" desc="Ubah filter level atau kata kunci." />
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

      <Card title="Job events terbaru" sub="Urutan eksekusi dari worker." className="mt-16">
        <ul className="timeline">
          {db.jobs
            .flatMap((job) => job.events.map((event) => ({ ...event, job })))
            .sort((a, b) => +new Date(b.at) - +new Date(a.at))
            .slice(0, 8)
            .map((event, i) => (
              <li key={`${event.job.id}-${i}`} className="timeline-item">
                <span className={cx('timeline-dot', event.tone && `tone-${event.tone}`)} />
                <div>
                  <div className="timeline-title">{event.label}</div>
                  <div className="timeline-sub">
                    <span className="mono">{event.job.id}</span> · {event.job.title}
                    {event.detail ? ` · ${event.detail}` : ''}
                  </div>
                  <div className="timeline-time">{fmtTime(event.at)}</div>
                </div>
              </li>
            ))}
        </ul>
      </Card>
    </AiPage>
  );
}

const MODELS = [
  'Hermes · Creative 4',
  'Hermes · Reviewer',
  'Hermes · Planner',
  '9router-go · Reasoner',
  '9router-go · Vision',
  '9router-go · Analyst',
];

const ALL_TOOLS = ['cms.draft', 'cms.read', 'docs.read', 'docs.write', 'web.search', 'analytics.read', 'brand.guidelines', 'assets.read', 'image.describe', 'social.schedule', 'content.review'];

export function AgentSettingsPage() {
  const { db, can, updateAgent, toast } = useStore();
  const [editing, setEditing] = useState<Agent | null>(null);
  const [status, setStatus] = useState<Agent['status']>('Aktif');
  const [model, setModel] = useState('');
  const [tools, setTools] = useState<string[]>([]);
  const [scope, setScope] = useState<string[]>([]);
  const allowed = can('agents.configure');

  const openEdit = (agent: Agent) => {
    setEditing(agent);
    setStatus(agent.status);
    setModel(agent.model);
    setTools(agent.tools);
    setScope(agent.scope);
  };

  const toggle = (list: string[], setList: (v: string[]) => void, value: string) => {
    setList(list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);
  };

  const save = () => {
    if (!editing) return;
    if (!allowed) {
      toast('Hanya Owner dan Admin yang bisa mengubah konfigurasi agent.', 'danger');
      return;
    }
    updateAgent(editing.id, { status, model, tools, scope });
    setEditing(null);
  };

  return (
    <AiPage
      title="Agent Settings"
      desc="Model, batas tool, dan cakupan workspace per agent. Perubahan dicatat di audit."
      actions={
        <Badge tone={allowed ? 'success' : 'warning'} dot>
          {allowed ? 'Boleh dikonfigurasi' : 'Hanya lihat'}
        </Badge>
      }
    >
      {!allowed && (
        <div className="notice-banner tone-warning">
          <Lock size={16} />
          <div>
            <strong>Peran ini tidak punya izin agents.configure.</strong>
            <span>Konfigurasi agent hanya bisa diubah Owner atau Admin.</span>
          </div>
        </div>
      )}

      <Card bodyClass="card-flush" className={allowed ? '' : 'mt-16'}>
        <div className="table-wrap">
          <table className="pd-table">
            <thead>
              <tr>
                <th scope="col">Agent</th>
                <th scope="col">Model</th>
                <th scope="col">Cakupan</th>
                <th scope="col">Tool</th>
                <th scope="col">Status</th>
                <th scope="col" />
              </tr>
            </thead>
            <tbody>
              {db.agents.map((agent) => (
                <tr key={agent.id}>
                  <td>
                    <div className="cell-person">
                      <AgentMark agent={agent} size={28} />
                      <div>
                        <div className="cell-main">{agent.name}</div>
                        <div className="cell-sub mono">{agent.codename}</div>
                      </div>
                    </div>
                  </td>
                  <td className="mono">{agent.model}</td>
                  <td>
                    <div className="tag-row">
                      {agent.scope.map((s) => (
                        <span key={s} className="chip-neutral">
                          {s}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="mono muted-small">{agent.tools.length} tool</td>
                  <td>
                    <Badge tone={agentStatusTone(agent.status)} dot>
                      {agent.status}
                    </Badge>
                  </td>
                  <td className="row-end">
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => openEdit(agent)}>
                      <Settings2 size={14} /> Atur
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Drawer
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        title={editing ? `Atur ${editing.name}` : 'Atur agent'}
        sub="Perubahan berlaku untuk job berikutnya dan masuk audit trail."
        footer={
          <>
            <button type="button" className="btn btn-ghost" onClick={() => setEditing(null)}>
              Batal
            </button>
            <button type="button" className="btn btn-primary" onClick={save} disabled={!allowed}>
              Simpan konfigurasi
            </button>
          </>
        }
      >
        {editing && (
          <div className="detail-stack">
            <div className="agent-hero">
              <AgentMark agent={editing} size={52} />
              <div>
                <strong>{editing.codename}</strong>
                <span>{editing.role}</span>
              </div>
            </div>

            <label className="field">
              <span className="field-label">Model</span>
              <select className="input" value={model} onChange={(e) => setModel(e.target.value)} disabled={!allowed}>
                {MODELS.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
              <span className="field-hint">Routing model tetap di sisi server.</span>
            </label>

            <label className="field">
              <span className="field-label">Status</span>
              <select
                className="input"
                value={status}
                onChange={(e) => setStatus(e.target.value as Agent['status'])}
                disabled={!allowed}
              >
                {(['Aktif', 'Idle', 'Dijeda', 'Error'] as const).map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>

            <div className="field">
              <span className="field-label">Cakupan workspace</span>
              <div className="tag-row">
                {['Marketing', 'Content', 'Strategy', 'CRM', 'Projects', 'Assets', 'Analytics'].map((s) => (
                  <button
                    key={s}
                    type="button"
                    className={cx('chip-toggle', scope.includes(s) && 'is-on')}
                    onClick={() => allowed && toggle(scope, setScope, s)}
                    aria-pressed={scope.includes(s)}
                  >
                    {scope.includes(s) && <Check size={12} />} {s}
                  </button>
                ))}
              </div>
            </div>

            <div className="field">
              <span className="field-label">Tool yang diizinkan</span>
              <div className="tool-checks">
                {ALL_TOOLS.map((tool) => (
                  <label key={tool} className={cx('tool-check', tools.includes(tool) && 'is-on')}>
                    <input
                      type="checkbox"
                      checked={tools.includes(tool)}
                      onChange={() => toggle(tools, setTools, tool)}
                      disabled={!allowed}
                    />
                    <span className="mono">{tool}</span>
                  </label>
                ))}
              </div>
              <span className="field-hint">
                Tool publish dan kirim keluar tidak tersedia untuk agent dalam konfigurasi apa pun.
              </span>
            </div>

            <p className="footnote">
              <ShieldCheck size={12} /> Setiap penyimpanan konfigurasi menulis entri audit dengan aktor dan target.
            </p>
          </div>
        )}
      </Drawer>
    </AiPage>
  );
}
