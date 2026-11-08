import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2,
  Clock3,
  FileText,
  RefreshCw,
  SearchX,
  ShieldAlert,
} from 'lucide-react';
import {
  createRadarDraft,
  fetchOffice,
  fetchRadarCandidate,
  fetchRadarCandidates,
  fetchRadarDrafts,
  fetchRadarRuns,
  fetchRadarSources,
  reclassifyRadarCandidate,
  rejectRadarCandidate,
  updateRadarSource,
  type OfficeActor,
  type RadarCandidateRecord,
  type RadarCandidateStatus,
  type RadarDraftRecord,
  type RadarNiche,
  type RadarRun,
  type RadarSourceKind,
  type RadarSourceRecord,
  type RadarSourceTier,
} from '../lib/api';
import {
  buildRadarSummary,
  classifyRadarEmptyState,
  isRadarRunStale,
} from '../lib/content-radar-dashboard';
import {
  AutoBadge,
  Badge,
  Card,
  EmptyState,
  Field,
  Modal,
  PageHead,
  SearchField,
  SelectBox,
  Tabs,
  Toggle,
} from '../components/ui';
import { useStore } from '../store/store';

const NICHES: RadarNiche[] = ['ai', 'technology', 'design', 'security', 'internet', 'crypto'];
const TIERS: RadarSourceTier[] = ['A', 'B', 'C', 'D', 'unverified'];
const KINDS: RadarSourceKind[] = ['official', 'media', 'community', 'regulator', 'research', 'project', 'discovered'];
const STATUSES: RadarCandidateStatus[] = ['new', 'qualified', 'rejected', 'drafted', 'archived'];
const SCORE_PARTS: Array<{ key: keyof RadarCandidateRecord['score']['components']; label: string; max: number }> = [
  { key: 'credibility', label: 'Kredibilitas', max: 30 },
  { key: 'relevance', label: 'Relevansi', max: 25 },
  { key: 'freshness', label: 'Kebaruan', max: 15 },
  { key: 'evidence', label: 'Bukti', max: 15 },
  { key: 'carouselPotential', label: 'Potensi carousel', max: 10 },
  { key: 'safety', label: 'Keamanan', max: 5 },
];

type RadarView = 'candidates' | 'sources' | 'runs';

type Filters = {
  query: string;
  niche: '' | RadarNiche;
  status: '' | RadarCandidateStatus;
  tier: '' | RadarSourceTier;
  minScore: string;
};

const INITIAL_FILTERS: Filters = { query: '', niche: '', status: '', tier: '', minScore: '50' };

const dateTime = (value: string | null | undefined) => {
  if (!value) return 'Belum tersedia';
  return new Intl.DateTimeFormat('id-ID', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Jakarta',
  }).format(new Date(value));
};

const statusTone = (status: RadarCandidateStatus) => {
  if (status === 'qualified' || status === 'drafted') return 'success' as const;
  if (status === 'rejected') return 'danger' as const;
  return 'neutral' as const;
};

const scoreTone = (score: number) => {
  if (score >= 75) return 'score-high';
  if (score >= 60) return 'score-mid';
  return 'score-low';
};

export function ContentRadarPage() {
  const { db, toast } = useStore();
  const workspaceId = db.workspaces.find((workspace) => workspace.active)?.id ?? db.workspaces[0]?.id ?? '';
  const [view, setView] = useState<RadarView>('candidates');
  const [filters, setFilters] = useState<Filters>(INITIAL_FILTERS);
  const [candidates, setCandidates] = useState<RadarCandidateRecord[]>([]);
  const [summaryCandidates, setSummaryCandidates] = useState<RadarCandidateRecord[]>([]);
  const [sources, setSources] = useState<RadarSourceRecord[]>([]);
  const [runs, setRuns] = useState<RadarRun[]>([]);
  const [drafts, setDrafts] = useState<RadarDraftRecord[]>([]);
  const [actor, setActor] = useState<OfficeActor | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState('');
  const [detail, setDetail] = useState<RadarCandidateRecord | null>(null);
  const [detailLoading, setDetailLoading] = useState('');
  const [rejecting, setRejecting] = useState<RadarCandidateRecord | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const initializedRef = useRef(false);
  const requestRef = useRef(0);

  const hasFilters =
    filters.query.trim() !== '' ||
    filters.niche !== '' ||
    filters.status !== '' ||
    filters.tier !== '' ||
    filters.minScore !== INITIAL_FILTERS.minScore;

  const load = useCallback(async () => {
    const requestId = ++requestRef.current;
    if (!workspaceId) {
      setError('Workspace aktif tidak tersedia.');
      setLoading(false);
      return;
    }
    if (!initializedRef.current) setLoading(true);
    setError('');
    try {
      const [office, nextCandidates, nextSummary, nextSources, nextRuns, nextDrafts] = await Promise.all([
        fetchOffice(workspaceId),
        fetchRadarCandidates({
          workspaceId,
          query: filters.query.trim() || undefined,
          niche: filters.niche || undefined,
          status: filters.status || undefined,
          tier: filters.tier || undefined,
          minScore: Number(filters.minScore),
          windowHours: 24,
          limit: 100,
        }),
        fetchRadarCandidates({ workspaceId, minScore: 0, windowHours: 24, limit: 200 }),
        fetchRadarSources({ workspaceId, limit: 200 }),
        fetchRadarRuns({ workspaceId, limit: 20 }),
        fetchRadarDrafts({ workspaceId, limit: 200 }),
      ]);
      if (requestId !== requestRef.current) return;
      setActor(office.actor ?? null);
      setCandidates(nextCandidates);
      setSummaryCandidates(nextSummary);
      setSources(nextSources);
      setRuns(nextRuns);
      setDrafts(nextDrafts);
      setDetail((current) =>
        current ? nextCandidates.find((candidate) => candidate.id === current.id) ?? null : null,
      );
    } catch (nextError) {
      if (requestId === requestRef.current) {
        setError(nextError instanceof Error ? nextError.message : 'Permintaan Content Radar gagal.');
      }
    } finally {
      if (requestId === requestRef.current) {
        initializedRef.current = true;
        setLoading(false);
      }
    }
  }, [filters, workspaceId]);

  useEffect(() => {
    void load();
  }, [load]);

  const summary = useMemo(
    () => buildRadarSummary({ candidates: summaryCandidates, sources, drafts }),
    [drafts, sources, summaryCandidates],
  );
  const collector = runs.find((run) => run.kind === 'collector');
  const selector = runs.find((run) => run.kind === 'selector');
  const staleCollector = isRadarRunStale(collector);
  const ownerReady = actor?.role === 'owner';

  const resetFilters = () => setFilters(INITIAL_FILTERS);

  const withOwner = async (id: string, action: (owner: { workspaceId: string; actorId: string }) => Promise<unknown>, success: string) => {
    if (!actor || actor.role !== 'owner') {
      toast('Aksi ini membutuhkan actor Owner yang terautentikasi.', 'danger');
      return;
    }
    setBusyId(id);
    try {
      await action({ workspaceId, actorId: actor.id });
      toast(success, 'success');
      await load();
    } catch (nextError) {
      toast(nextError instanceof Error ? nextError.message : 'Aksi Owner gagal.', 'danger');
    } finally {
      setBusyId('');
    }
  };

  const openDetail = async (candidate: RadarCandidateRecord) => {
    if (detail?.id === candidate.id) {
      setDetail(null);
      return;
    }
    setDetailLoading(candidate.id);
    try {
      setDetail(await fetchRadarCandidate(workspaceId, candidate.id));
    } catch (nextError) {
      toast(nextError instanceof Error ? nextError.message : 'Provenance kandidat gagal dimuat.', 'danger');
    } finally {
      setDetailLoading('');
    }
  };

  const submitReject = async () => {
    if (!rejecting || !rejectReason.trim()) return;
    const candidate = rejecting;
    setRejecting(null);
    await withOwner(
      candidate.id,
      (owner) => rejectRadarCandidate(candidate.id, { ...owner, reason: rejectReason.trim() }),
      'Kandidat ditolak.',
    );
    setRejectReason('');
  };

  return (
    <div className="content-radar-page">
      <PageHead
        title="Content Radar"
        desc="Triage kandidat editorial, periksa bukti, lalu teruskan hanya kandidat yang layak untuk tindakan Owner."
        actions={
          <button type="button" className="btn btn-ghost" onClick={() => void load()} disabled={loading}>
            <RefreshCw size={15} aria-hidden="true" />
            Muat ulang
          </button>
        }
      >
        <Tabs
          label="Tampilan Content Radar"
          value={view}
          onChange={(key) => setView(key as RadarView)}
          items={[
            { key: 'candidates', label: 'Kandidat', count: candidates.length },
            { key: 'sources', label: 'Registry sumber', count: sources.length },
            { key: 'runs', label: 'Run health', count: runs.length },
          ]}
        />
      </PageHead>

      {loading ? (
        <Card className="radar-state-card">
          <div className="radar-loading" role="status">
            <RefreshCw size={18} aria-hidden="true" />
            <div>
              <strong>Memuat kandidat dan kesehatan collector</strong>
              <span>Data workspace dan hak actor sedang diperiksa.</span>
            </div>
          </div>
        </Card>
      ) : error ? (
        <Card className="radar-state-card">
          <EmptyState
            icon={<ShieldAlert size={24} aria-hidden="true" />}
            title="Content Radar tidak dapat dimuat"
            desc={error}
            action={
              <button type="button" className="btn btn-primary" onClick={() => void load()}>
                Coba lagi
              </button>
            }
          />
        </Card>
      ) : (
        <>
          <section className="radar-summary" aria-label="Ringkasan Content Radar">
            <div><span>Kandidat 24 jam</span><strong>{summary.candidates24h}</strong></div>
            <div><span>Skor 75+</span><strong>{summary.score75Plus}</strong></div>
            <div><span>Draft hari ini (WIB)</span><strong>{summary.draftsTodayWib}</strong></div>
            <div><span>Sumber unverified</span><strong>{summary.unverifiedSources}</strong></div>
            <div className={staleCollector ? 'is-warning' : ''}>
              <span>Collector terakhir</span>
              <strong>{collector ? dateTime(collector.heartbeatAt ?? collector.createdAt) : 'Belum ada run'}</strong>
            </div>
            <div>
              <span>Selector terakhir</span>
              <strong>{selector ? dateTime(selector.heartbeatAt ?? selector.createdAt) : 'Belum ada run'}</strong>
            </div>
          </section>

          {staleCollector && (
            <div className="radar-warning" role="alert">
              <AlertTriangle size={17} aria-hidden="true" />
              <div>
                <strong>Collector perlu diperiksa</strong>
                <span>{collector ? 'Heartbeat terakhir sudah melewati empat jam.' : 'Belum ada run collector untuk workspace ini.'}</span>
              </div>
              <button type="button" className="btn btn-ghost" onClick={() => setView('runs')}>Lihat run health</button>
            </div>
          )}

          {view === 'candidates' && (
            <CandidateView
              candidates={candidates}
              sources={sources}
              runs={runs}
              drafts={drafts}
              filters={filters}
              setFilters={setFilters}
              hasFilters={hasFilters}
              resetFilters={resetFilters}
              actor={actor}
              ownerReady={ownerReady}
              busyId={busyId}
              detail={detail}
              detailLoading={detailLoading}
              onDetail={openDetail}
              onDraft={(candidate) => void withOwner(
                candidate.id,
                (owner) => createRadarDraft(candidate.id, owner),
                'Draft Content Composer dibuat dan menunggu review Owner.',
              )}
              onReject={setRejecting}
              onNiche={(candidate, niche) => void withOwner(
                candidate.id,
                (owner) => reclassifyRadarCandidate(candidate.id, { ...owner, niche }),
                'Niche kandidat diperbarui.',
              )}
            />
          )}

          {view === 'sources' && (
            <SourceRegistry
              sources={sources}
              actor={actor}
              ownerReady={ownerReady}
              busyId={busyId}
              onUpdate={(source, patch) => void withOwner(
                source.id,
                (owner) => updateRadarSource(source.id, { ...owner, ...patch }),
                'Registry sumber diperbarui.',
              )}
            />
          )}

          {view === 'runs' && <RunHealth runs={runs} />}
        </>
      )}

      <Modal
        open={Boolean(rejecting)}
        onClose={() => {
          setRejecting(null);
          setRejectReason('');
        }}
        title="Tolak kandidat"
        sub={rejecting?.title}
        footer={
          <>
            <button type="button" className="btn btn-ghost" onClick={() => setRejecting(null)}>Batal</button>
            <button type="button" className="btn btn-danger" onClick={() => void submitReject()} disabled={!rejectReason.trim()}>
              Simpan penolakan
            </button>
          </>
        }
      >
        <Field label="Alasan penolakan" hint="Alasan disimpan pada kandidat untuk audit editorial.">
          <textarea
            rows={4}
            value={rejectReason}
            onChange={(event) => setRejectReason(event.target.value)}
            placeholder="Jelaskan alasan kandidat tidak dilanjutkan"
            autoFocus
          />
        </Field>
      </Modal>
    </div>
  );
}

function CandidateView({
  candidates,
  sources,
  runs,
  drafts,
  filters,
  setFilters,
  hasFilters,
  resetFilters,
  actor,
  ownerReady,
  busyId,
  detail,
  detailLoading,
  onDetail,
  onDraft,
  onReject,
  onNiche,
}: {
  candidates: RadarCandidateRecord[];
  sources: RadarSourceRecord[];
  runs: RadarRun[];
  drafts: RadarDraftRecord[];
  filters: Filters;
  setFilters: React.Dispatch<React.SetStateAction<Filters>>;
  hasFilters: boolean;
  resetFilters: () => void;
  actor: OfficeActor | null;
  ownerReady: boolean;
  busyId: string;
  detail: RadarCandidateRecord | null;
  detailLoading: string;
  onDetail: (candidate: RadarCandidateRecord) => Promise<void>;
  onDraft: (candidate: RadarCandidateRecord) => void;
  onReject: (candidate: RadarCandidateRecord) => void;
  onNiche: (candidate: RadarCandidateRecord, niche: RadarNiche) => void;
}) {
  const emptyKind = classifyRadarEmptyState({ candidates, sources, runs, drafts, hasFilters });
  return (
    <>
      <Card className="radar-filter-card" bodyClass="radar-filter-grid">
        <div className="radar-search-control">
          <span className="field-label">Cari kandidat</span>
          <SearchField
            value={filters.query}
            onChange={(query) => setFilters((current) => ({ ...current, query }))}
            placeholder="Cari kandidat"
          />
        </div>
        <div><span className="field-label">Niche</span><SelectBox label="Niche" value={filters.niche} onChange={(niche) => setFilters((current) => ({ ...current, niche: niche as Filters['niche'] }))} options={[{ value: '', label: 'Semua niche' }, ...NICHES.map((niche) => ({ value: niche, label: niche }))]} /></div>
        <div><span className="field-label">Status</span><SelectBox label="Status" value={filters.status} onChange={(status) => setFilters((current) => ({ ...current, status: status as Filters['status'] }))} options={[{ value: '', label: 'Semua status' }, ...STATUSES.map((status) => ({ value: status, label: status }))]} /></div>
        <div><span className="field-label">Tier sumber</span><SelectBox label="Tier sumber" value={filters.tier} onChange={(tier) => setFilters((current) => ({ ...current, tier: tier as Filters['tier'] }))} options={[{ value: '', label: 'Semua tier' }, ...TIERS.map((tier) => ({ value: tier, label: `Tier ${tier}` }))]} /></div>
        <div><span className="field-label">Skor minimum</span><SelectBox label="Skor minimum" value={filters.minScore} onChange={(minScore) => setFilters((current) => ({ ...current, minScore }))} options={['0', '50', '60', '75', '90'].map((score) => ({ value: score, label: `${score}+` }))} /></div>
      </Card>

      {!ownerReady && (
        <div className="radar-permission-note" role="status">
          <ShieldAlert size={16} aria-hidden="true" />
          {actor ? `Actor ${actor.name} berperan ${actor.role}. Aksi keputusan hanya tersedia untuk Owner.` : 'Actor autentik tidak tersedia. Aksi keputusan dinonaktifkan.'}
        </div>
      )}

      {candidates.length === 0 ? (
        <Card className="radar-state-card">
          {emptyKind === 'first-run' ? (
            <EmptyState
              icon={<Clock3 size={24} aria-hidden="true" />}
              title="Radar belum menerima kandidat"
              desc="Registry dan run belum tersedia. Periksa konfigurasi collector sebelum triage dimulai."
            />
          ) : emptyKind === 'filtered' ? (
            <EmptyState
              icon={<SearchX size={24} aria-hidden="true" />}
              title="Tidak ada kandidat yang cocok"
              desc="Filter aktif tidak menemukan kandidat dalam jendela 24 jam."
              action={<button type="button" className="btn btn-primary" onClick={resetFilters}>Reset filter</button>}
            />
          ) : (
            <EmptyState
              icon={<CheckCircle2 size={24} aria-hidden="true" />}
              title="Belum ada kandidat dalam 24 jam"
              desc="Registry sudah tersedia. Periksa run health bila collector seharusnya sudah berjalan."
            />
          )}
        </Card>
      ) : (
        <div className="radar-candidate-list" aria-label="Kandidat editorial">
          {candidates.map((candidate, index) => (
            <article className={`radar-candidate ${index === 0 ? 'is-priority' : ''}`} key={candidate.id}>
              <div className="radar-candidate-main">
                <div className="radar-candidate-heading">
                  <div className={`radar-score ${scoreTone(candidate.score.total)}`} aria-label={`Skor total ${candidate.score.total} dari 100`}>
                    <strong>{candidate.score.total}</strong><span>/100</span>
                  </div>
                  <div>
                    <div className="radar-candidate-meta">
                      <Badge tone={statusTone(candidate.status)}>{candidate.status}</Badge>
                      <Badge tone="neutral">Tier {candidate.sourceTier}</Badge>
                      <span>{candidate.niche}</span>
                      <span>{dateTime(candidate.publishedAt ?? candidate.discoveredAt)}</span>
                    </div>
                    <h2>{candidate.title}</h2>
                    <p>{candidate.summary}</p>
                  </div>
                </div>
                <div className="radar-score-grid" aria-label="Rincian skor">
                  {SCORE_PARTS.map((part) => (
                    <div key={part.key}>
                      <span>{part.label}</span>
                      <strong>{candidate.score.components[part.key]} / {part.max}</strong>
                    </div>
                  ))}
                </div>
                <div className="radar-evidence-line">
                  <span><strong>{candidate.sourceDomain}</strong> sebagai sumber utama</span>
                  <span>{candidate.score.inputSnapshot.independentCrossChecks?.length ?? 0} cross-check independen</span>
                  {candidate.timestampFallback && <span className="is-risk">Waktu publikasi memakai fallback</span>}
                </div>
                <p className="radar-score-reason"><strong>Alasan skor:</strong> {candidate.scoreReason}</p>
                {candidate.riskFlags.length > 0 && (
                  <div className="radar-risks" aria-label="Risk flags">
                    {candidate.riskFlags.map((risk) => <Badge key={risk} tone="danger">{risk}</Badge>)}
                  </div>
                )}
                {detail?.id === candidate.id && (
                  <CandidateProvenance candidate={detail} />
                )}
              </div>
              <div className="radar-candidate-actions">
                <a href={candidate.canonicalUrl} target="_blank" rel="noreferrer" className="btn btn-ghost">
                  Buka sumber <ArrowUpRight size={14} aria-hidden="true" />
                </a>
                <button type="button" className="btn btn-ghost" onClick={() => void onDetail(candidate)} disabled={detailLoading === candidate.id}>
                  {detailLoading === candidate.id ? 'Memuat bukti' : detail?.id === candidate.id ? 'Tutup bukti' : 'Lihat provenance'}
                </button>
                <label className="radar-action-field">
                  <span>Niche kandidat</span>
                  <select
                    aria-label={`Niche untuk ${candidate.title}`}
                    value={candidate.niche}
                    onChange={(event) => onNiche(candidate, event.target.value as RadarNiche)}
                    disabled={!ownerReady || Boolean(candidate.draftId) || busyId === candidate.id}
                  >
                    {NICHES.map((niche) => <option key={niche} value={niche}>{niche}</option>)}
                  </select>
                </label>
                <button type="button" className="btn btn-primary" onClick={() => onDraft(candidate)} disabled={!ownerReady || Boolean(candidate.draftId) || busyId === candidate.id || candidate.status === 'rejected'}>
                  {candidate.draftId ? 'Draft sudah dibuat' : busyId === candidate.id ? 'Menyimpan' : 'Buat draft'}
                </button>
                <button type="button" className="btn btn-danger-subtle" onClick={() => onReject(candidate)} disabled={!ownerReady || Boolean(candidate.draftId) || busyId === candidate.id || candidate.status === 'rejected'}>
                  Tolak kandidat
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </>
  );
}

function CandidateProvenance({ candidate }: { candidate: RadarCandidateRecord }) {
  return (
    <section className="radar-provenance" aria-label={`Provenance ${candidate.title}`}>
      <h3>Provenance dan bukti</h3>
      {candidate.sources?.length ? (
        <div className="radar-provenance-list">
          {candidate.sources.map((source) => (
            <div key={source.id}>
              <div>
                <Badge tone={source.relation === 'primary' ? 'info' : 'neutral'}>{source.relation}</Badge>
                <Badge tone="neutral">Tier {source.tier}</Badge>
              </div>
              <a href={source.url} target="_blank" rel="noreferrer">{source.title || source.domain}<ArrowUpRight size={13} aria-hidden="true" /></a>
              <span>{source.name} · {source.domain}</span>
              {source.excerpt && <p>{source.excerpt}</p>}
            </div>
          ))}
        </div>
      ) : (
        <p>Belum ada provenance yang tersimpan untuk kandidat ini.</p>
      )}
    </section>
  );
}

function SourceRegistry({
  sources,
  actor,
  ownerReady,
  busyId,
  onUpdate,
}: {
  sources: RadarSourceRecord[];
  actor: OfficeActor | null;
  ownerReady: boolean;
  busyId: string;
  onUpdate: (source: RadarSourceRecord, patch: Partial<Pick<RadarSourceRecord, 'tier' | 'kind' | 'enabled'>>) => void;
}) {
  if (sources.length === 0) {
    return <Card className="radar-state-card"><EmptyState icon={<FileText size={24} aria-hidden="true" />} title="Registry sumber masih kosong" desc="Tambahkan sumber melalui proses registry sebelum collector dijalankan." /></Card>;
  }
  return (
    <Card
      title="Registry sumber"
      sub="Tier, jenis, dan status aktif mengendalikan bagaimana collector menilai sumber."
      className="radar-registry-card"
    >
      {!ownerReady && <div className="radar-permission-note">{actor ? `Perubahan membutuhkan Owner. Actor saat ini: ${actor.name}.` : 'Actor autentik tidak tersedia.'}</div>}
      <div className="radar-source-table-wrap">
        <table className="pd-table radar-source-table">
          <thead><tr><th>Sumber</th><th>Tier</th><th>Jenis</th><th>Niche</th><th>Cross-check</th><th>Aktif</th></tr></thead>
          <tbody>
            {sources.map((source) => (
              <tr key={source.id}>
                <td><strong>{source.name}</strong><span>{source.domain}</span>{source.feedUrl && <a href={source.feedUrl} target="_blank" rel="noreferrer">Feed <ArrowUpRight size={12} aria-hidden="true" /></a>}</td>
                <td>
                  <select aria-label={`Tier ${source.name}`} value={source.tier} disabled={!ownerReady || busyId === source.id} onChange={(event) => onUpdate(source, { tier: event.target.value as RadarSourceTier })}>
                    {TIERS.map((tier) => <option key={tier} value={tier} disabled={source.kind === 'discovered' && tier !== 'unverified'}>{tier}</option>)}
                  </select>
                </td>
                <td>
                  <select aria-label={`Jenis ${source.name}`} value={source.kind} disabled={!ownerReady || busyId === source.id} onChange={(event) => onUpdate(source, { kind: event.target.value as RadarSourceKind })}>
                    {KINDS.map((kind) => <option key={kind} value={kind} disabled={source.tier !== 'unverified' && kind === 'discovered'}>{kind}</option>)}
                  </select>
                </td>
                <td>{source.niches.join(', ')}</td>
                <td>{source.requiresCrosscheck ? 'Wajib' : 'Tidak wajib'}</td>
                <td><Toggle checked={source.enabled} onChange={(enabled) => onUpdate(source, { enabled })} label={`${source.enabled ? 'Nonaktifkan' : 'Aktifkan'} ${source.name}`} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function RunHealth({ runs }: { runs: RadarRun[] }) {
  if (runs.length === 0) {
    return <Card className="radar-state-card"><EmptyState icon={<Clock3 size={24} aria-hidden="true" />} title="Belum ada run collector atau selector" desc="Run akan muncul setelah proses Content Radar pertama dimulai." /></Card>;
  }
  return (
    <Card title="Run health" sub="Heartbeat dan hasil collector/selector terbaru untuk workspace aktif." className="radar-runs-card">
      <div className="radar-run-list">
        {runs.map((run) => (
          <article key={run.id}>
            <div className="radar-run-head"><div><strong>{run.kind}</strong><span>{run.id}</span></div><AutoBadge value={run.status} /></div>
            <dl>
              <div><dt>Mulai</dt><dd>{dateTime(run.startedAt ?? run.createdAt)}</dd></div>
              <div><dt>Heartbeat</dt><dd>{dateTime(run.heartbeatAt)}</dd></div>
              <div><dt>Selesai</dt><dd>{dateTime(run.finishedAt)}</dd></div>
            </dl>
            <div className="radar-run-counts">
              {Object.entries(run.counts).map(([key, value]) => <span key={key}><small>{key}</small><strong>{value}</strong></span>)}
            </div>
            {run.error && <p className="radar-run-error"><AlertTriangle size={14} aria-hidden="true" />{run.error}</p>}
          </article>
        ))}
      </div>
    </Card>
  );
}
