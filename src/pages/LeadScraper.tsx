import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  Building2,
  Check,
  CheckCircle2,
  Filter,
  Instagram,
  Linkedin,
  Mail,
  MapPin,
  Phone,
  Play,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
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
  Progress,
  SearchField,
  Tabs,
} from '../components/ui';
import { WhatsAppIcon } from '../components/icons';
import { fmtDate, waLink } from '../lib/utils';
import type { RawLead } from '../data/types';

const DEMO_PEOPLE = [
  'Dewi Pratama',
  'Rizky Hidayat',
  'Sinta Lestari',
  'Fajar Kusuma',
  'Nadia Anggraini',
  'Bima Saputra',
  'Ayu Wulandari',
  'Hendra Wijaya',
  'Maya Sari',
  'Galih Permana',
];

const DEMO_SUFFIXES = [
  'Studio',
  'Group',
  'Kreatif',
  'Digital',
  'Lab',
  'Kolektif',
  'Prima',
  'Nusantara',
  'Works',
  'Haus',
];

const slugify = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, '');

const buildDemoLeads = (
  source: RawLead['source'],
  keyword: string,
  city: string,
  total: number,
): RawLead[] => {
  const base = slugify(keyword) || 'prospek';
  return Array.from({ length: total }, (_, index) => ({
    id: `rl-demo-${Date.now()}-${index}`,
    name: DEMO_PEOPLE[index % DEMO_PEOPLE.length],
    company: `${keyword.trim()} ${DEMO_SUFFIXES[index % DEMO_SUFFIXES.length]}`,
    source,
    phone: `08${Math.floor(1000000000 + Math.random() * 8999999999)}`,
    email: `hello@${base}${index + 1}.id`,
    instagram: `@${base}${index + 1}`,
    city: city.trim(),
    status: index % 4 === 0 ? 'Raw' : 'Verified',
    scrapedAt: new Date().toISOString(),
  }));
};

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

export function LeadScraperPage() {
  const { db, importRawLeadToCrm, addScrapedLeads, toast, syncFromApi } = useStore();

  const [source, setSource] = useState<RawLead['source']>('Google Maps');
  const [keyword, setKeyword] = useState('katering harian');
  const [city, setCity] = useState('Semarang');
  const [limit, setLimit] = useState(2);
  const [isScraping, setIsScraping] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [progress, setProgress] = useState(0);

  const [tab, setTab] = useState('all');
  const [cityFilter, setCityFilter] = useState('all');
  const [query, setQuery] = useState('');

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [activeLead, setActiveLead] = useState<RawLead | null>(null);
  const [customPitch, setCustomPitch] = useState('');

  const rawLeads = db.rawLeads ?? [];

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

  const handleStartScrape = () => {
    if (!keyword.trim() || !city.trim()) {
      toast('Kata kunci dan kota target wajib diisi.', 'danger');
      return;
    }

    setIsScraping(true);
    setProgress(15);

    window.setTimeout(() => setProgress(55), 450);
    window.setTimeout(() => setProgress(85), 950);

    window.setTimeout(() => {
      addScrapedLeads(buildDemoLeads(source, keyword, city, limit), { silent: true });
      setIsScraping(false);
      setProgress(100);
      setTab('all');
      setCityFilter('all');
      setQuery('');
      toast(`Simulasi selesai. ${limit} prospek demo masuk ke antrean review.`, 'success');
    }, 1450);
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

  return (
    <>
      <PageHead
        kicker="CRM · Lead generation"
        title="Lead Scraper"
        desc="Prospek UMKM Jawa Tengah dari Google Maps yang sudah tersimpan di database D1. Tarik data terbaru atau review hasil scrape sebelum diimpor ke Leads."
        actions={
          <div className="head-inline">
            <Badge tone="success" dot>Live D1</Badge>
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

      <Card title="Parameter scrape" sub="Tentukan sumber, kata kunci, dan wilayah target.">
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
              ).map(([value, icon]) => (
                <button
                  key={value}
                  type="button"
                  className={`source-pill ${source === value ? 'is-active' : ''}`}
                  onClick={() => setSource(value)}
                  disabled={isScraping}
                >
                  {icon}
                  {value === 'Direktori' ? 'Direktori bisnis' : value}
                </button>
              ))}
            </div>
          </div>

          <div className="scraper-form-grid">
            <Field label="Kata kunci / bidang usaha" className="scraper-keyword">
              <input
                className="input"
                value={keyword}
                onChange={(event) => setKeyword(event.target.value)}
                placeholder="Misal: skincare clinic, kedai kopi, software house"
                disabled={isScraping}
              />
            </Field>

            <Field label="Kota / wilayah target">
              <input
                className="input"
                value={city}
                onChange={(event) => setCity(event.target.value)}
                placeholder="Misal: Bandung, Jakarta Selatan"
                disabled={isScraping}
              />
            </Field>

            <Field label="Jumlah hasil (demo)">
              <select
                className="input"
                value={limit}
                onChange={(event) => setLimit(Number(event.target.value))}
                disabled={isScraping}
              >
                <option value={2}>2 prospek</option>
                <option value={5}>5 prospek</option>
                <option value={10}>10 prospek</option>
              </select>
            </Field>
          </div>

          {isScraping && (
            <div className="scraper-inline-progress" role="status" aria-live="polite">
              <RefreshCw size={15} className="spin" />
              <div className="scraper-progress-body">
                <div className="scraper-progress-meta">
                  <span>
                    Menyiapkan hasil simulasi untuk <strong>{keyword}</strong> di{' '}
                    <strong>{city}</strong>…
                  </span>
                  <strong>{progress}%</strong>
                </div>
                <Progress value={progress} tone="brand" />
              </div>
            </div>
          )}

          <div className="scraper-run-row">
            <div className="notice-inline">
              <ShieldCheck size={14} />
              <span>
                Data live berasal dari database D1 (hasil scraping Google Maps UMKM Jawa Tengah).
                Tombol simulasi hanya untuk menguji alur review.
              </span>
            </div>
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleStartScrape}
              disabled={isScraping}
            >
              {isScraping ? (
                <>
                  <RefreshCw size={14} className="spin" /> Menyiapkan…
                </>
              ) : (
                <>
                  <Play size={14} /> Jalankan demo
                </>
              )}
            </button>
          </div>
        </div>
      </Card>

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
                : 'Jalankan scraper demo untuk mengisi antrean review.'
            }
            action={
              rawLeads.length === 0 ? (
                <button type="button" className="btn btn-primary btn-sm" onClick={handleStartScrape}>
                  <Play size={14} /> Jalankan demo
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
