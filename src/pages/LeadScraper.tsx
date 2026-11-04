import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  Building2,
  Check,
  CheckCheck,
  CheckCircle2,
  Clock,
  Filter,
  Handshake,
  Instagram,
  Linkedin,
  Mail,
  MapPin,
  MessageCircle,
  Phone,
  Play,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  ThumbsDown,
  ThumbsUp,
} from 'lucide-react';
import { useStore } from '../store/store';
import {
  Badge,
  Card,
  Drawer,
  EmptyState,
  Field,
  Fig,
  PageHead,
  SearchField,
  Tabs,
} from '../components/ui';
import { WhatsAppIcon } from '../components/icons';
import { fmtDate, waLink } from '../lib/utils';
import type { RawLead, OutreachStatus } from '../data/types';
import {
  createScrapeRequest,
  listScrapeRequests,
  type ScrapeRequestRow,
  type ScrapeRequestStatus,
} from '../lib/api';

const sourceIcon = (source: RawLead['source']) => {
  switch (source) {
    case 'Google Maps':
      return <MapPin size={13} />;
    case 'Instagram':
      return <Instagram size={13} />;
    case 'LinkedIn':
      return <Linkedin size={13} />;
    default:
      return <Building2 size={13} />;
  }
};

function RawStatusBadge({ status }: { status: RawLead['status'] }) {
  if (status === 'Imported') return <Badge tone="info">Di CRM</Badge>;
  if (status === 'Verified') return <Badge tone="success" dot>Terverifikasi</Badge>;
  if (status === 'Ignored') return <Badge tone="neutral">Diabaikan</Badge>;
  return <Badge tone="warning" dot>Perlu review</Badge>;
}

function QueueBadge({ status }: { status: ScrapeRequestStatus }) {
  if (status === 'running') return <Badge tone="info" dot>Diproses</Badge>;
  if (status === 'done') return <Badge tone="success" dot>Selesai</Badge>;
  if (status === 'failed') return <Badge tone="danger" dot>Gagal</Badge>;
  return <Badge tone="warning" dot>Menunggu</Badge>;
}

const OUTREACH_LABEL: Record<OutreachStatus, string> = {
  contacted: 'Sudah dihubungi',
  replied: 'Dibalas',
  interested: 'Tertarik',
  not_interested: 'Tidak tertarik',
  deal: 'Deal',
};

const OUTREACH_ORDER: OutreachStatus[] = [
  'contacted',
  'replied',
  'interested',
  'not_interested',
  'deal',
];

const outreachIcon = (status: OutreachStatus) => {
  switch (status) {
    case 'contacted':
      return <MessageCircle size={12} />;
    case 'replied':
      return <CheckCheck size={12} />;
    case 'interested':
      return <ThumbsUp size={12} />;
    case 'not_interested':
      return <ThumbsDown size={12} />;
    default:
      return <Handshake size={12} />;
  }
};

function FollowUpBadge({ status }: { status?: OutreachStatus }) {
  if (!status) return <span className="muted-small">Belum dihubungi</span>;
  if (status === 'deal') return <Badge tone="success" dot>Deal</Badge>;
  if (status === 'interested') return <Badge tone="success" dot>Tertarik</Badge>;
  if (status === 'replied') return <Badge tone="info" dot>Dibalas</Badge>;
  if (status === 'not_interested') return <Badge tone="neutral" dot>Tidak tertarik</Badge>;
  return <Badge tone="warning" dot>Sudah dihubungi</Badge>;
}

/** D1 stores `datetime('now')` as UTC without a zone marker — normalise it. */
const parseDbDate = (value?: string | null): number => {
  if (!value) return 0;
  const normalised = value.includes('T') ? value : `${value.replace(' ', 'T')}Z`;
  const time = new Date(normalised).getTime();
  return Number.isNaN(time) ? 0 : time;
};

export function LeadScraperPage() {
  const { db, importRawLeadToCrm, toast, syncFromApi, setOutreach } = useStore();

  const [keyword, setKeyword] = useState('katering harian');
  const [city, setCity] = useState('Semarang');
  const [limit, setLimit] = useState(5);
  const [requesting, setRequesting] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const [requests, setRequests] = useState<ScrapeRequestRow[]>([]);
  const handledRef = useRef<Set<string>>(new Set());
  const primedRef = useRef(false);

  const [tab, setTab] = useState('all');
  const [cityFilter, setCityFilter] = useState('all');
  const [query, setQuery] = useState('');

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [activeLead, setActiveLead] = useState<RawLead | null>(null);
  const [customPitch, setCustomPitch] = useState('');

  const rawLeads = db.rawLeads ?? [];

  const outreachMap = useMemo(
    () => new Map((db.outreach ?? []).map((row) => [row.leadId, row])),
    [db.outreach],
  );

  /** Leads contacted 2+ days ago that never replied — the follow-up backlog. */
  const needsFollowUp = useMemo(() => {
    const cutoff = Date.now() - 2 * 24 * 60 * 60 * 1000;
    return rawLeads
      .filter((lead) => {
        const row = outreachMap.get(lead.id);
        if (!row || row.status !== 'contacted') return false;
        return parseDbDate(row.contactedAt) <= cutoff;
      })
      .sort(
        (a, b) =>
          parseDbDate(outreachMap.get(a.id)?.contactedAt) -
          parseDbDate(outreachMap.get(b.id)?.contactedAt),
      );
  }, [rawLeads, outreachMap]);

  /** Reply-rate per keyword — shows which scrape keyword actually converts. */
  const keywordStats = useMemo(() => {
    const stats = new Map<string, { total: number; contacted: number; replied: number }>();
    rawLeads.forEach((lead) => {
      const key = lead.category?.trim() || 'Lainnya';
      const bucket = stats.get(key) ?? { total: 0, contacted: 0, replied: 0 };
      bucket.total += 1;
      const row = outreachMap.get(lead.id);
      if (row) {
        bucket.contacted += 1;
        if (row.status === 'replied' || row.status === 'interested' || row.status === 'deal') {
          bucket.replied += 1;
        }
      }
      stats.set(key, bucket);
    });
    return Array.from(stats.entries())
      .map(([keyword, value]) => ({
        keyword,
        ...value,
        rate: value.contacted ? Math.round((value.replied / value.contacted) * 100) : 0,
      }))
      .sort((a, b) => b.contacted - a.contacted || b.total - a.total)
      .slice(0, 6);
  }, [rawLeads, outreachMap]);

  const activeOutreach = activeLead ? outreachMap.get(activeLead.id) : undefined;

  const counts = {
    all: rawLeads.length,
    raw: rawLeads.filter((lead) => lead.status === 'Raw').length,
    verified: rawLeads.filter((lead) => lead.status === 'Verified').length,
    imported: rawLeads.filter((lead) => lead.status === 'Imported').length,
  };

  const cities = Array.from(
    new Set(rawLeads.map((lead) => lead.city).filter((value): value is string => Boolean(value))),
  ).sort();

  const filtered = rawLeads
    .filter((lead) => (tab === 'all' ? true : lead.status.toLowerCase() === tab))
    .filter((lead) =>
      cityFilter === 'all' ? true : lead.city?.toLowerCase() === cityFilter.toLowerCase(),
    )
    .filter((lead) =>
      `${lead.name} ${lead.company} ${lead.city} ${lead.phone} ${lead.email} ${lead.instagram}`
        .toLowerCase()
        .includes(query.toLowerCase()),
    )
    .sort((a, b) => new Date(b.scrapedAt).getTime() - new Date(a.scrapedAt).getTime());

  const selectable = filtered.filter((lead) => lead.status !== 'Imported');
  const allSelected = selectable.length > 0 && selectable.every((lead) => selectedIds.includes(lead.id));

  /* --- queue polling ------------------------------------------------- */
  const refreshRequests = useCallback(async () => {
    try {
      const rows = await listScrapeRequests();
      setRequests(rows);

      if (!primedRef.current) {
        rows.forEach((row) => handledRef.current.add(row.id));
        primedRef.current = true;
        return;
      }

      const finished = rows.filter(
        (row) => row.status === 'done' && !handledRef.current.has(row.id),
      );
      const failed = rows.filter(
        (row) => row.status === 'failed' && !handledRef.current.has(row.id),
      );
      if (!finished.length && !failed.length) return;

      [...finished, ...failed].forEach((row) => handledRef.current.add(row.id));

      failed.forEach((row) => {
        toast(
          `Scraping "${row.keyword}" di ${row.city} gagal. ${row.error ?? ''}`.trim(),
          'danger',
        );
      });

      if (finished.length) {
        const inserted = finished.reduce((sum, row) => sum + Number(row.inserted ?? 0), 0);
        const result = await syncFromApi();
        if (!result.ok) {
          toast(result.error ?? 'Hasil scraping masuk, tapi gagal ditarik ke UI.', 'danger');
        } else if (inserted > 0) {
          toast(`${inserted} prospek baru dari hasil scraping sudah masuk antrean.`, 'success');
        } else {
          toast('Scraping selesai, tapi tidak ada kontak baru yang ditemukan.', 'warning');
        }
      }
    } catch {
      /* offline / token issue — TokenGate handles auth */
    }
  }, [syncFromApi, toast]);

  useEffect(() => {
    refreshRequests();
    const timer = window.setInterval(refreshRequests, 20_000);
    return () => window.clearInterval(timer);
  }, [refreshRequests]);

  /* --- actions ------------------------------------------------------- */
  const handleRequestScrape = async () => {
    if (!keyword.trim() || !city.trim()) {
      toast('Kata kunci dan kota target wajib diisi.', 'danger');
      return;
    }

    setRequesting(true);
    try {
      await createScrapeRequest({ city: city.trim(), keyword: keyword.trim(), maxLeads: limit });
      await refreshRequests();
      toast(
        `Permintaan scraping "${keyword.trim()}" di ${city.trim()} dikirim ke antrean. Runner memproses tiap ±5 menit.`,
        'success',
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Gagal mengirim permintaan scraping.';
      toast(message, 'danger');
    } finally {
      setRequesting(false);
    }
  };

  const handleSyncFromD1 = async () => {
    setSyncing(true);
    const result = await syncFromApi();
    setSyncing(false);
    if (result.ok) {
      toast(`${result.count} prospek ditarik dari database D1.`, 'success');
    } else {
      toast(result.error ?? 'Gagal menyinkronkan data dari D1.', 'danger');
    }
  };

  const handleOutreach = async (lead: RawLead, status: OutreachStatus) => {
    await setOutreach(lead, status);
    toast(`Status follow up ${lead.company}: ${OUTREACH_LABEL[status]}.`, 'success');
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
    );
  };

  const selectAll = () => {
    setSelectedIds(allSelected ? [] : selectable.map((lead) => lead.id));
  };

  const handleBulkImport = () => {
    const targets = (db.rawLeads ?? []).filter(
      (lead) => selectedIds.includes(lead.id) && lead.status !== 'Imported',
    );
    if (!targets.length) return;
    targets.forEach((lead) => importRawLeadToCrm(lead.id, { silent: true }));
    setSelectedIds([]);
    toast(`${targets.length} prospek diimpor ke Leads.`, 'success');
  };

  const openLeadDrawer = (lead: RawLead) => {
    setActiveLead(lead);
    setCustomPitch(
      `Halo ${lead.name}, saya dari playdesign. Kami melihat profil ${lead.company}${
        lead.city ? ` di ${lead.city}` : ''
      } dan ingin berbagi ringkasan layanan brand & website yang mungkin relevan. Boleh saya kirim portofolio singkatnya?`,
    );
  };

  const pendingCount = requests.filter(
    (row) => row.status === 'pending' || row.status === 'running',
  ).length;

  return (
    <>
      <PageHead
        kicker="CRM · Lead generation"
        title="Lead Scraper"
        desc="Prospek UMKM Jawa Tengah hasil scraping nyata yang tersimpan di database D1. Minta scrape baru, lalu review hasilnya sebelum diimpor ke Leads."
        actions={
          <div className="head-inline">
            <Badge tone="success" dot>Live D1</Badge>
            {pendingCount > 0 && <Badge tone="warning" dot>{pendingCount} antre</Badge>}
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={handleSyncFromD1}
              disabled={syncing}
            >
              <RefreshCw size={13} className={syncing ? 'spin' : undefined} />
              {syncing ? 'Menarik data…' : 'Sync dari D1'}
            </button>
            <Link to="/crm/leads" className="btn btn-ghost btn-sm">
              Buka Leads <ArrowRight size={13} />
            </Link>
          </div>
        }
      />

      <div className="figs figs-4">
        <Fig label="Antrean mentah" value={counts.all} hint="Semua hasil scrape" icon={<Search size={17} />} />
        <Fig
          label="Terverifikasi"
          value={counts.verified}
          hint="Kontak siap dihubungi"
          icon={<CheckCircle2 size={17} />}
        />
        <Fig label="Perlu review" value={counts.raw} hint="Belum disaring manual" icon={<Filter size={17} />} />
        <Fig label="Sudah di Leads" value={counts.imported} hint="Diimpor ke CRM" icon={<Check size={17} />} />
      </div>

      {needsFollowUp.length > 0 && (
        <Card
          title="Perlu follow up"
          sub="Sudah dihubungi lebih dari 2 hari tapi belum ada balasan."
        >
          <div className="detail-stack">
            {needsFollowUp.slice(0, 5).map((lead) => {
              const row = outreachMap.get(lead.id);
              const days = Math.max(
                0,
                Math.floor((Date.now() - parseDbDate(row?.contactedAt)) / 86_400_000),
              );
              return (
                <div
                  key={lead.id}
                  className="detail-inline"
                  style={{ justifyContent: 'space-between', gap: 10 }}
                >
                  <div>
                    <strong>{lead.company}</strong>
                    <span className="muted-small"> · {days} hari sejak dihubungi</span>
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {lead.phone && (
                      <a
                        href={waLink(
                          lead.phone,
                          `Halo ${lead.name}, saya dari playdesign — menindaklanjuti pesan saya sebelumnya soal ${
                            lead.category ?? 'layanan brand & website'
                          } untuk ${lead.company}. Apakah sempat dibaca? Saya bisa kirim ringkasan singkat kalau membantu.`,
                        )}
                        target="_blank"
                        rel="noreferrer"
                        className="btn btn-wa btn-xs"
                      >
                        <WhatsAppIcon size={12} /> Follow up
                      </a>
                    )}
                    <button
                      type="button"
                      className="btn btn-ghost btn-xs"
                      onClick={() => openLeadDrawer(lead)}
                    >
                      Detail
                    </button>
                  </div>
                </div>
              );
            })}
            {needsFollowUp.length > 5 && (
              <span className="field-hint">
                +{needsFollowUp.length - 5} lead lain juga menunggu follow up.
              </span>
            )}
          </div>
        </Card>
      )}

      {keywordStats.some((row) => row.contacted > 0) && (
        <Card
          title="Performa per kata kunci"
          sub="Rasio balasan dari lead yang sudah benar-benar dihubungi."
          bodyClass="no-pad"
        >
          <div className="table-wrap">
            <table className="pd-table">
              <thead>
                <tr>
                  <th>Kata kunci</th>
                  <th>Total lead</th>
                  <th>Dihubungi</th>
                  <th>Dibalas</th>
                  <th className="row-end">Rasio balas</th>
                </tr>
              </thead>
              <tbody>
                {keywordStats.map((row) => (
                  <tr key={row.keyword}>
                    <td>
                      <span className="cell-main">{row.keyword}</span>
                    </td>
                    <td>{row.total}</td>
                    <td>{row.contacted}</td>
                    <td>{row.replied}</td>
                    <td className="row-end">
                      <strong>{row.rate}%</strong>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Card title="Parameter scrape" sub="Tentukan kata kunci, wilayah target, dan jumlah hasil.">
        <div className="scraper-config">
          <div className="scraper-source-row">
            <span className="field-label">Sumber platform</span>
            <div className="source-segmented-pills">
              {(
                [
                  ['Google Maps', <MapPin key="gmaps" size={14} />],
                  ['Instagram', <Instagram key="ig" size={14} />],
                  ['LinkedIn', <Linkedin key="li" size={14} />],
                  ['Direktori', <Building2 key="dir" size={14} />],
                ] as Array<[RawLead['source'], JSX.Element]>
              ).map(([value, icon]) => {
                const supported = value === 'Google Maps';
                return (
                  <button
                    key={value}
                    type="button"
                    className={`source-pill ${supported ? 'is-active' : ''}`}
                    disabled
                    title={supported ? 'Didukung runner' : 'Belum didukung runner otomatis'}
                  >
                    {icon}
                    {value === 'Direktori' ? 'Direktori bisnis' : value}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="scraper-form-grid">
            <Field label="Kata kunci / bidang usaha" className="scraper-keyword">
              <input
                className="input"
                value={keyword}
                onChange={(event) => setKeyword(event.target.value)}
                placeholder="Misal: katering harian, konveksi kaos"
                disabled={requesting}
              />
            </Field>

            <Field label="Kota / wilayah target">
              <input
                className="input"
                value={city}
                onChange={(event) => setCity(event.target.value)}
                placeholder="Misal: Semarang, Solo, Kudus"
                disabled={requesting}
              />
            </Field>

            <Field label="Jumlah hasil">
              <select
                className="input"
                value={limit}
                onChange={(event) => setLimit(Number(event.target.value))}
                disabled={requesting}
              >
                <option value={3}>3 prospek</option>
                <option value={5}>5 prospek</option>
                <option value={10}>10 prospek</option>
                <option value={20}>20 prospek</option>
              </select>
            </Field>
          </div>

          <div className="scraper-run-row">
            <div className="notice-inline">
              <ShieldCheck size={14} />
              <span>
                Permintaan masuk ke antrean D1 dan diproses runner otomatis tiap ±5 menit. Hasilnya
                adalah kontak nyata (bukan simulasi) yang muncul di antrean review.
              </span>
            </div>
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleRequestScrape}
              disabled={requesting}
            >
              {requesting ? (
                <>
                  <RefreshCw size={14} className="spin" /> Mengirim…
                </>
              ) : (
                <>
                  <Play size={14} /> Minta Scrape Sekarang
                </>
              )}
            </button>
          </div>
        </div>
      </Card>

      {requests.length > 0 && (
        <Card
          title="Antrean permintaan"
          sub="Diproses otomatis oleh runner scraper. Halaman ini menyegarkan status tiap 20 detik."
          bodyClass="no-pad"
        >
          <div className="table-wrap">
            <table className="pd-table">
              <thead>
                <tr>
                  <th>Kata kunci</th>
                  <th>Kota</th>
                  <th>Target</th>
                  <th>Status</th>
                  <th>Hasil</th>
                  <th className="row-end">Diminta</th>
                </tr>
              </thead>
              <tbody>
                {requests.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <span className="cell-main">{row.keyword}</span>
                    </td>
                    <td>
                      <span className="scraper-location">
                        <MapPin size={12} /> {row.city}
                      </span>
                    </td>
                    <td>{row.max_leads}</td>
                    <td>
                      <QueueBadge status={row.status} />
                    </td>
                    <td>
                      {row.inserted ? (
                        <span className="muted-small">{row.inserted} lead</span>
                      ) : row.error ? (
                        <span className="muted-small" title={row.error}>
                          —
                        </span>
                      ) : (
                        <span className="muted-small">—</span>
                      )}
                    </td>
                    <td className="row-end">
                      <span className="muted-small">
                        <Clock size={11} /> {fmtDate(row.requested_at)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {selectedIds.length > 0 && (
        <div className="scraper-bulk-bar" role="status" aria-live="polite">
          <div className="scraper-bulk-info">
            <CheckCircle2 size={16} />
            <span>
              <strong>{selectedIds.length}</strong> prospek dipilih
            </span>
          </div>
          <div className="scraper-bulk-actions">
            <button type="button" className="btn btn-primary btn-sm" onClick={handleBulkImport}>
              <Plus size={13} /> Import ke Leads ({selectedIds.length})
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setSelectedIds([])}>
              Batal
            </button>
          </div>
        </div>
      )}

      <div className="scraper-toolbar">
        <Tabs
          items={[
            { key: 'all', label: 'Semua', count: counts.all },
            { key: 'raw', label: 'Perlu review', count: counts.raw },
            { key: 'verified', label: 'Terverifikasi', count: counts.verified },
            { key: 'imported', label: 'Di CRM', count: counts.imported },
          ]}
          value={tab}
          onChange={setTab}
        />

        <div className="scraper-toolbar-actions">
          {cities.length > 0 && (
            <label className="scraper-filter">
              <MapPin size={13} />
              <select
                value={cityFilter}
                onChange={(event) => setCityFilter(event.target.value)}
                aria-label="Filter kota"
              >
                <option value="all">Semua kota</option>
                {cities.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </label>
          )}
          <SearchField
            value={query}
            onChange={setQuery}
            placeholder="Cari nama, perusahaan, kontak…"
            className="scraper-search"
          />
        </div>
      </div>

      <Card bodyClass="no-pad">
        {filtered.length === 0 ? (
          <EmptyState
            icon={<Search size={24} />}
            title={rawLeads.length ? 'Tidak ada prospek yang cocok' : 'Antrean masih kosong'}
            desc={
              rawLeads.length
                ? 'Ubah filter status, kota, atau kata kunci pencarian.'
                : 'Minta scrape baru untuk mengisi antrean review dari hasil pencarian nyata.'
            }
            action={
              rawLeads.length === 0 ? (
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={handleRequestScrape}
                  disabled={requesting}
                >
                  <Play size={14} /> Minta Scrape Sekarang
                </button>
              ) : undefined
            }
          />
        ) : (
          <div className="table-wrap">
            <table className="pd-table scraper-table">
              <thead>
                <tr>
                  <th className="check-cell">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={selectAll}
                      disabled={selectable.length === 0}
                      aria-label="Pilih semua prospek yang bisa diimpor"
                    />
                  </th>
                  <th>Perusahaan & PIC</th>
                  <th>Sumber</th>
                  <th className="scraper-location-col">Lokasi</th>
                  <th>Kontak</th>
                  <th>Status</th>
                  <th>Follow up</th>
                  <th className="scraper-date">Ditemukan</th>
                  <th className="row-end">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((lead) => {
                  const isImported = lead.status === 'Imported';
                  const isChecked = selectedIds.includes(lead.id);

                  return (
                    <tr
                      key={lead.id}
                      className={`is-clickable ${isChecked ? 'is-selected' : ''}`}
                      onClick={() => openLeadDrawer(lead)}
                    >
                      <td className="check-cell" onClick={(event) => event.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleSelect(lead.id)}
                          disabled={isImported}
                          aria-label={`Pilih ${lead.company}`}
                        />
                      </td>
                      <td>
                        <span className="cell-main" title={lead.company}>
                          {lead.company}
                          <span className="cell-sub">{lead.name}</span>
                        </span>
                      </td>
                      <td>
                        <span className="scraper-source">
                          {sourceIcon(lead.source)} {lead.source}
                        </span>
                      </td>
                      <td className="scraper-location-col">
                        <span className="scraper-location">
                          <MapPin size={12} /> {lead.city ?? '—'}
                        </span>
                      </td>
                      <td>
                        <span className="scraper-contact">
                          {lead.phone ? (
                            <span>
                              <Phone size={12} /> {lead.phone}
                            </span>
                          ) : lead.instagram ? (
                            <span>
                              <Instagram size={12} /> {lead.instagram}
                            </span>
                          ) : (
                            <span className="muted-small">Belum tertera</span>
                          )}
                          {lead.email && (
                            <span className="scraper-contact-sub">
                              <Mail size={11} /> {lead.email}
                            </span>
                          )}
                        </span>
                      </td>
                      <td>
                        <RawStatusBadge status={lead.status} />
                      </td>
                      <td>
                        <FollowUpBadge status={outreachMap.get(lead.id)?.status} />
                      </td>
                      <td className="scraper-date">
                        <span className="muted-small">{fmtDate(lead.scrapedAt)}</span>
                      </td>
                      <td className="row-end" onClick={(event) => event.stopPropagation()}>
                        <div className="scraper-actions">
                          {lead.phone && (
                            <a
                              href={waLink(
                                lead.phone,
                                `Halo ${lead.name}, saya dari playdesign. Kami melihat profil ${lead.company}${
                                  lead.city ? ` di ${lead.city}` : ''
                                } dan ingin berbagi ringkasan layanan brand & website. Boleh saya kirim portofolio singkatnya?`,
                              )}
                              target="_blank"
                              rel="noreferrer"
                              className="btn btn-wa btn-xs"
                              title="Buka draf WhatsApp"
                            >
                              <WhatsAppIcon size={12} /> WA
                            </a>
                          )}
                          <button
                            type="button"
                            className={`btn btn-xs ${isImported ? 'btn-ghost' : 'btn-primary'}`}
                            onClick={() => importRawLeadToCrm(lead.id)}
                            disabled={isImported}
                          >
                            {isImported ? (
                              <>
                                <Check size={12} /> Di CRM
                              </>
                            ) : (
                              <>
                                <Plus size={12} /> Import
                              </>
                            )}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Drawer
        open={Boolean(activeLead)}
        onClose={() => setActiveLead(null)}
        title={activeLead?.company ?? 'Detail prospek'}
        sub={activeLead ? `${activeLead.name} · ${activeLead.source}` : undefined}
        width={560}
        footer={
          activeLead ? (
            <>
              <button type="button" className="btn btn-ghost" onClick={() => setActiveLead(null)}>
                Tutup
              </button>
              {activeLead.phone && (
                <a
                  href={waLink(activeLead.phone, customPitch)}
                  target="_blank"
                  rel="noreferrer"
                  className="btn btn-wa"
                >
                  <WhatsAppIcon size={14} /> Buka WhatsApp
                </a>
              )}
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => {
                  importRawLeadToCrm(activeLead.id);
                  setActiveLead(null);
                }}
                disabled={activeLead.status === 'Imported'}
              >
                {activeLead.status === 'Imported' ? (
                  <>
                    <Check size={14} /> Sudah di Leads
                  </>
                ) : (
                  <>
                    <Plus size={14} /> Import ke Leads
                  </>
                )}
              </button>
            </>
          ) : undefined
        }
      >
        {activeLead && (
          <div className="detail-stack">
            <div className="detail-inline">
              <Badge tone="brand">{activeLead.source}</Badge>
              <RawStatusBadge status={activeLead.status} />
            </div>

            <div className="detail-grid">
              <div>
                <span className="detail-label">PIC</span>
                <strong>{activeLead.name}</strong>
              </div>
              <div>
                <span className="detail-label">Perusahaan</span>
                <strong>{activeLead.company}</strong>
              </div>
              <div>
                <span className="detail-label">WhatsApp / telepon</span>
                <span className="detail-value">{activeLead.phone ?? '—'}</span>
              </div>
              <div>
                <span className="detail-label">Email</span>
                <span className="detail-value">{activeLead.email ?? '—'}</span>
              </div>
              <div>
                <span className="detail-label">Instagram</span>
                <span className="detail-value">{activeLead.instagram ?? '—'}</span>
              </div>
              <div>
                <span className="detail-label">Lokasi</span>
                <span className="detail-value">{activeLead.city ?? '—'}</span>
              </div>
              <div>
                <span className="detail-label">Ditemukan</span>
                <span className="detail-value">{fmtDate(activeLead.scrapedAt)}</span>
              </div>
              <div>
                <span className="detail-label">Sumber</span>
                <span className="detail-value">{activeLead.source}</span>
              </div>
              {activeLead.category && (
                <div>
                  <span className="detail-label">Kategori</span>
                  <span className="detail-value">{activeLead.category}</span>
                </div>
              )}
              {activeLead.rating != null && (
                <div>
                  <span className="detail-label">Rating Google Maps</span>
                  <span className="detail-value">{activeLead.rating} / 5</span>
                </div>
              )}
              {activeLead.confidenceScore != null && (
                <div>
                  <span className="detail-label">Skor kepercayaan</span>
                  <span className="detail-value">{Math.round(activeLead.confidenceScore * 100)}%</span>
                </div>
              )}
              {activeLead.whatsappLink && (
                <div>
                  <span className="detail-label">Link WhatsApp</span>
                  <span className="detail-value" style={{ wordBreak: 'break-all' }}>
                    {activeLead.whatsappLink}
                  </span>
                </div>
              )}
              {activeLead.googleMapsUrl && (
                <div>
                  <span className="detail-label">Google Maps</span>
                  <a
                    className="detail-value"
                    href={activeLead.googleMapsUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Buka di Google Maps
                  </a>
                </div>
              )}
            </div>

            {activeLead.fullAddress && (
              <div className="detail-block">
                <div className="detail-block-head">
                  <MapPin size={14} /> Alamat lengkap
                </div>
                <p style={{ margin: 0, fontSize: '12.5px', lineHeight: 1.6, color: 'var(--ink-2)' }}>
                  {activeLead.fullAddress}
                </p>
              </div>
            )}

            <div className="ai-pitch-card">
              <div className="ai-pitch-head">
                <Sparkles size={15} /> Saran pendekatan
              </div>
              <p className="ai-pitch-text">
                Draf awal untuk membantu menyusun pesan. Bukan hasil audit atau penilaian kualitas
                brand.
              </p>
              <ul className="ai-pitch-list">
                <li>
                  <span>
                    <strong>Potensi kebutuhan</strong> — penyegaran identitas visual, kemasan, dan
                    landing page.
                  </span>
                </li>
                <li>
                  <span>
                    <strong>Sudut pendekatan</strong> — tawarkan audit singkat atau studi kasus di
                    industri serupa.
                  </span>
                </li>
              </ul>
            </div>

            <div className="detail-block">
              <div className="detail-block-head">
                <WhatsAppIcon size={14} /> Draf pesan WhatsApp
              </div>
              <textarea
                className="input"
                rows={5}
                value={customPitch}
                onChange={(event) => setCustomPitch(event.target.value)}
                placeholder="Sesuaikan pesan sebelum membuka WhatsApp…"
              />
              <span className="field-hint">Pesan hanya mengisi draf. Tidak ada pengiriman otomatis.</span>
            </div>

            <div className="detail-block">
              <div className="detail-block-head">
                <MessageCircle size={14} /> Status follow up
              </div>
              <div className="detail-inline" style={{ marginBottom: 8 }}>
                <FollowUpBadge status={activeOutreach?.status} />
                {activeOutreach?.contactedAt && (
                  <span className="muted-small">
                    Dihubungi {fmtDate(activeOutreach.contactedAt)}
                    {activeOutreach.repliedAt ? ` · Dibalas ${fmtDate(activeOutreach.repliedAt)}` : ''}
                  </span>
                )}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {OUTREACH_ORDER.map((status) => {
                  const active = activeOutreach?.status === status;
                  return (
                    <button
                      key={status}
                      type="button"
                      className={`btn btn-xs ${active ? 'btn-primary' : 'btn-ghost'}`}
                      onClick={() => handleOutreach(activeLead, status)}
                    >
                      {outreachIcon(status)} {OUTREACH_LABEL[status]}
                    </button>
                  );
                })}
              </div>
              <span className="field-hint">
                Catat setelah kamu benar-benar mengirim pesan. Tidak ada pesan yang dikirim otomatis.
              </span>
            </div>

            <div className="notice-inline">
              <ShieldCheck size={14} />
              <span>
                Data ini berasal dari database D1 hasil scraping Google Maps. Tidak ada credential
                yang disimpan. Beberapa sumber memiliki ketentuan penggunaan masing-masing.
              </span>
            </div>
          </div>
        )}
      </Drawer>
    </>
  );
}
