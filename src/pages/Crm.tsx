import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  Building2,
  CalendarDays,
  Check,
  ChevronRight,
  CircleAlert,
  ClipboardList,
  GripVertical,
  Mail,
  MapPin,
  Phone,
  Plus,
  Search,
  ShieldCheck,
  Sparkles,
  Target,
  TrendingUp,
  UserRound,
  Users,
  Wallet,
} from 'lucide-react';
import { useStore } from '../store/store';
import {
  AutoBadge,
  Avatar,
  Badge,
  Card,
  Drawer,
  EmptyState,
  Field,
  Fig,
  LinkButton,
  Modal,
  PageHead,
  Pager,
  Progress,
  SearchField,
  SelectBox,
  Tabs,
} from '../components/ui';
import { LeadComposer, ReasonDialog } from '../components/dialogs';
import { WhatsAppIcon } from '../components/icons';
import {
  compactRupiah,
  cx,
  dealStageLabel,
  fillTemplate,
  fmtDate,
  fmtLongDate,
  orderBy,
  relTime,
  rupiah,
  waLink,
} from '../lib/utils';
import { LEAD_BUSINESS_TYPES, type Company, type Contact, type Deal, type DealStage, type Lead, type LeadSource, type WaTemplate } from '../data/types';

const CRM_KICKER = 'CRM · Foundation';

const leadTemplateVars = (lead: Lead): Record<string, string> => ({
  nama: lead.name,
  perusahaan: lead.company,
  jenis_usaha: lead.businessType,
  sumber: lead.source,
});

const leadWaLink = (lead: Lead, template?: WaTemplate) =>
  waLink(
    lead.phone,
    template
      ? fillTemplate(template.body, leadTemplateVars(lead))
      : `Halo ${lead.name}, saya dari playdesign. Boleh diskusi kebutuhan ${lead.company}?`,
  );

function CrmPage({
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
      <PageHead kicker={CRM_KICKER} title={title} desc={desc} actions={actions} />
      {children}
    </>
  );
}

const stageOrder: DealStage[] = ['new', 'qualified', 'proposal', 'negotiation', 'won', 'lost'];

const sourceTone: Record<string, 'brand' | 'info' | 'success' | 'warning' | 'violet' | 'neutral'> = {
  Website: 'info',
  Referral: 'success',
  Instagram: 'brand',
  LinkedIn: 'violet',
  Event: 'warning',
  Outbound: 'neutral',
};

export function CrmOverview() {
  const { db } = useStore();
  const navigate = useNavigate();
  const openDeals = db.deals.filter((d) => d.stage !== 'won' && d.stage !== 'lost');
  const won = db.deals.filter((d) => d.stage === 'won');
  const lost = db.deals.filter((d) => d.stage === 'lost');
  const pipeline = openDeals.reduce((s, d) => s + d.value, 0);
  const winRate = won.length + lost.length ? Math.round((won.length / (won.length + lost.length)) * 100) : 0;
  const avg = won.length ? won.reduce((s, d) => s + d.value, 0) / won.length : 0;
  const activeLeads = db.leads.filter((l) => l.status === 'Baru' || l.status === 'Terkualifikasi' || l.status === 'Dihubungi');

  const stageTotals = stageOrder
    .filter((s) => s !== 'lost')
    .map((s) => {
      const deals = db.deals.filter((d) => d.stage === s);
      return {
        stage: s,
        count: deals.length,
        value: deals.reduce((sum, d) => sum + d.value, 0),
      };
    });
  const maxStage = Math.max(...stageTotals.map((s) => s.value), 1);

  const riskDeals = [...openDeals]
    .filter((d) => new Date(d.closeAt).getTime() - Date.now() < 21 * 86400000 || d.probability < 40)
    .sort((a, b) => new Date(a.closeAt).getTime() - new Date(b.closeAt).getTime())
    .slice(0, 4);

  const owners = db.users
    .filter((u) => ['Owner', 'Admin', 'Operator', 'Reviewer'].includes(u.role))
    .map((u) => {
      const deals = openDeals.filter((d) => d.ownerId === u.id);
      return { user: u, count: deals.length, value: deals.reduce((s, d) => s + d.value, 0) };
    })
    .sort((a, b) => b.value - a.value);
  const maxOwner = Math.max(...owners.map((o) => o.value), 1);

  return (
    <CrmPage
      title="CRM"
      desc="Pipeline, klien, dan aktivitas penjualan studio dalam satu tempat. Setiap perubahan tahap tercatat di audit."
      actions={
        <>
          <button type="button" className="btn btn-outline" onClick={() => navigate('/crm/scraper')}>
            <Search size={14} /> Lead Scraper
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => navigate('/crm/pipeline')}>
            <GripVertical size={15} /> Buka pipeline
          </button>
          <button type="button" className="btn btn-primary" onClick={() => navigate('/crm/leads')}>
            <Plus size={15} /> Lead baru
          </button>
        </>
      }
    >
      <div className="figs figs-4">
        <Fig label="Pipeline aktif" value={compactRupiah(pipeline)} hint={`${openDeals.length} deal terbuka`} icon={<Wallet size={16} />} onClick={() => navigate('/crm/pipeline')} />
        <Fig label="Win rate" value={`${winRate}%`} hint={`${won.length} menang · ${lost.length} kalah`} icon={<Target size={16} />} />
        <Fig label="Rata-rata deal" value={compactRupiah(avg)} hint="Berdasarkan deal menang" icon={<TrendingUp size={16} />} />
        <Fig label="Lead aktif" value={activeLeads.length} hint={`${db.leads.filter((l) => l.status === 'Baru').length} belum dihubungi`} icon={<Users size={16} />} onClick={() => navigate('/crm/leads')} />
      </div>

      <div className="grid-main">
        <Card
          className="span-7"
          title="Funnel pipeline"
          sub="Nilai per tahap, bukan jumlah dekoratif"
          action={<LinkButton to="/crm/pipeline">Pipeline</LinkButton>}
        >
          <div className="funnel">
            {stageTotals.map((s) => (
              <button type="button" key={s.stage} className="funnel-row" onClick={() => navigate('/crm/pipeline')}>
                <span className="funnel-label">{dealStageLabel[s.stage]}</span>
                <span className="funnel-track">
                  <span className={`funnel-fill stage-${s.stage}`} style={{ width: `${Math.max(4, (s.value / maxStage) * 100)}%` }} />
                </span>
                <span className="funnel-count">{s.count}</span>
                <span className="funnel-value">{compactRupiah(s.value)}</span>
              </button>
            ))}
          </div>
          <div className="funnel-foot">
            <span>Nilai pipeline dihitung dari deal terbuka.</span>
            <span className="mono">Σ {compactRupiah(pipeline)}</span>
          </div>
        </Card>

        <Card
          className="span-5"
          title="Aktivitas terbaru"
          sub="Tim sales & relasi klien"
          action={<LinkButton to="/activity">Semua</LinkButton>}
          bodyClass="no-pad"
        >
          <ul className="activity-list compact">
            {db.activities.slice(0, 5).map((a) => (
              <li key={a.id} className="activity-item">
                <span className={`activity-icon kind-${a.kind.toLowerCase()}`}>
                  {a.kind === 'Panggilan' ? <Phone size={13} /> : a.kind === 'Email' ? <Mail size={13} /> : a.kind === 'Meeting' ? <Users size={13} /> : <ClipboardList size={13} />}
                </span>
                <div className="activity-copy">
                  <p>{a.subject}</p>
                  <span className="activity-meta">
                    {a.who} · {relTime(a.at)}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </Card>

        <Card
          className="span-7"
          title="Deal berisiko"
          sub="Tutup dalam 21 hari atau probabilitas di bawah 40%"
          action={<LinkButton to="/crm/deals">Deals</LinkButton>}
          bodyClass="no-pad"
        >
          {riskDeals.length === 0 ? (
            <EmptyState compact title="Tidak ada deal berisiko" desc="Semua deal berjalan sesuai jadwal." />
          ) : (
            <table className="pd-table">
              <thead>
                <tr>
                  <th scope="col">Deal</th>
                  <th scope="col">Nilai</th>
                  <th scope="col">Tahap</th>
                  <th scope="col">Tutup</th>
                  <th scope="col">Prob.</th>
                  <th scope="col" />
                </tr>
              </thead>
              <tbody>
                {riskDeals.map((d) => {
                  const company = db.companies.find((c) => c.id === d.companyId);
                  return (
                    <tr key={d.id} onClick={() => navigate('/crm/deals')} className="is-clickable">
                      <td>
                        <div className="cell-main">
                          <strong>{d.title}</strong>
                          <span className="cell-sub">{company?.name}</span>
                        </div>
                      </td>
                      <td className="num-cell">{compactRupiah(d.value)}</td>
                      <td>
                        <AutoBadge value={dealStageLabel[d.stage]} />
                      </td>
                      <td>
                        <span className={cx(new Date(d.closeAt).getTime() - Date.now() < 7 * 86400000 && 'text-danger')}>{fmtDate(d.closeAt)}</span>
                      </td>
                      <td>
                        <div className="prob-cell">
                          <Progress value={d.probability} thin tone={d.probability < 40 ? 'warning' : 'brand'} />
                          <span>{d.probability}%</span>
                        </div>
                      </td>
                      <td className="row-end">
                        <ChevronRight size={15} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </Card>

        <Card className="span-5" title="Performa owner" sub="Nilai pipeline terbuka per pemilik">
          <div className="owner-list">
            {owners.map((o) => (
              <div className="owner-row" key={o.user.id}>
                <Avatar name={o.user.name} size={30} />
                <div className="owner-main">
                  <div className="split-row">
                    <strong>{o.user.name}</strong>
                    <span>{compactRupiah(o.value)}</span>
                  </div>
                  <div className="bar bar-thin">
                    <span style={{ width: `${Math.max(3, (o.value / maxOwner) * 100)}%` }} />
                  </div>
                  <span className="owner-meta">
                    {o.count} deal · {o.user.role}
                  </span>
                </div>
              </div>
            ))}
          </div>
          <div className="notice-inline">
            <ShieldCheck size={14} /> Tahap menang/kalah wajib alasan dan masuk audit.
          </div>
        </Card>
      </div>
    </CrmPage>
  );
}

export function LeadsPage() {
  const { db, convertLead } = useStore();
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [source, setSource] = useState('all');
  const [business, setBusiness] = useState('all');
  const [sort, setSort] = useState('created');
  const [page, setPage] = useState(1);
  const [addOpen, setAddOpen] = useState(false);
  const [selected, setSelected] = useState<Lead | null>(null);
  const [templateId, setTemplateId] = useState('');
  const pageSize = 8;

  const defaultTemplate = db.waTemplates.find((t) => t.isDefault) ?? db.waTemplates[0];
  const activeTemplate = db.waTemplates.find((t) => t.id === templateId) ?? defaultTemplate;

  const openLead = (lead: Lead) => {
    setSelected(lead);
    setTemplateId(defaultTemplate?.id ?? '');
  };

  const filtered = useMemo(() => {
    const rows = db.leads.filter((l) => {
      const matches = `${l.name} ${l.company} ${l.source} ${l.phone} ${l.businessType}`
        .toLowerCase()
        .includes(q.toLowerCase());
      return (
        matches &&
        (source === 'all' || l.source === source) &&
        (business === 'all' || l.businessType === business)
      );
    });
    const accessor = {
      name: (l: Lead) => l.name,
      business: (l: Lead) => l.businessType,
      created: (l: Lead) => new Date(l.createdAt).getTime(),
    }[sort] ?? ((l: Lead) => new Date(l.createdAt).getTime());
    return orderBy(rows, accessor, sort === 'name' || sort === 'business' ? 'asc' : 'desc');
  }, [db.leads, q, source, business, sort]);

  const pageCount = Math.ceil(filtered.length / pageSize) || 1;
  const current = Math.min(page, pageCount);
  const rows = filtered.slice((current - 1) * pageSize, current * pageSize);

  const handleConvert = (lead: Lead) => {
    const id = convertLead(lead.id);
    setSelected(null);
    if (id) navigate('/crm/pipeline');
  };

  return (
    <CrmPage
      title="Leads"
      desc="Lead dengan nomor WA dan jenis usaha. Chat langsung atau konversi menjadi deal."
      actions={
        <div className="flex gap-8">
          <button type="button" className="btn btn-outline" onClick={() => navigate('/crm/scraper')}>
            <Search size={14} /> Scrape Prospek Baru
          </button>
          <button type="button" className="btn btn-primary" onClick={() => setAddOpen(true)}>
            <Plus size={15} /> Lead baru
          </button>
        </div>
      }
    >
      <Card bodyClass="no-pad">
        <div className="table-toolbar">
          <SearchField value={q} onChange={(v) => { setQ(v); setPage(1); }} placeholder="Cari nama, perusahaan, WA, jenis usaha…" />
          <div className="toolbar-filters">
            <SelectBox
              label="Sumber"
              value={source}
              onChange={(v) => { setSource(v); setPage(1); }}
              options={[
                { value: 'all', label: 'Semua sumber' },
                ...(['Website', 'Referral', 'Instagram', 'LinkedIn', 'Event', 'Outbound'] as LeadSource[]).map((s) => ({ value: s, label: s })),
              ]}
            />
            <SelectBox
              label="Jenis usaha"
              value={business}
              onChange={(v) => { setBusiness(v); setPage(1); }}
              options={[
                { value: 'all', label: 'Semua jenis' },
                ...LEAD_BUSINESS_TYPES.map((type) => ({ value: type, label: type })),
              ]}
            />
            <SelectBox
              label="Urutkan"
              value={sort}
              onChange={setSort}
              options={[
                { value: 'created', label: 'Terbaru' },
                { value: 'name', label: 'Nama A–Z' },
                { value: 'business', label: 'Jenis usaha' },
              ]}
            />
          </div>
        </div>
        <div className="table-wrap">
          <table className="pd-table">
            <thead>
              <tr>
                <th scope="col">Lead</th>
                <th scope="col">Nomor WA</th>
                <th scope="col">Jenis usaha</th>
                <th scope="col">Sumber</th>
                <th scope="col">Status</th>
                <th scope="col">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((l) => (
                <tr key={l.id} className="is-clickable" onClick={() => openLead(l)}>
                  <td>
                    <div className="cell-person">
                      <Avatar name={l.name} size={32} />
                      <div className="cell-main">
                        <strong>{l.name}</strong>
                        <span className="cell-sub">{l.company}</span>
                      </div>
                    </div>
                  </td>
                  <td>
                    {l.phone ? (
                      <a
                        className="wa-number"
                        href={leadWaLink(l, defaultTemplate)}
                        target="_blank"
                        rel="noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        title={`Chat WhatsApp ${l.name}${defaultTemplate ? ` · ${defaultTemplate.name}` : ''}`}
                      >
                        <WhatsAppIcon size={13} />
                        {l.phone}
                      </a>
                    ) : (
                      <span className="muted-small">Belum ada</span>
                    )}
                  </td>
                  <td>
                    <Badge tone="neutral">{l.businessType}</Badge>
                  </td>
                  <td>
                    <Badge tone={sourceTone[l.source]}>{l.source}</Badge>
                  </td>
                  <td>
                    <AutoBadge value={l.status} />
                  </td>
                  <td>
                    <div className="table-actions">
                      {l.phone && (
                        <a
                          className="btn btn-wa btn-xs"
                          href={leadWaLink(l, defaultTemplate)}
                          target="_blank"
                          rel="noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          title={`Chat WhatsApp ${l.name}${defaultTemplate ? ` · ${defaultTemplate.name}` : ''}`}
                        >
                          <WhatsAppIcon size={12} /> WA
                        </a>
                      )}
                      {l.status === 'Tidak cocok' ? (
                        <span className="muted-small">Arsip</span>
                      ) : (
                        <button
                          type="button"
                          className="btn btn-outline btn-xs"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleConvert(l);
                          }}
                        >
                          <ArrowRight size={12} /> Konversi
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {rows.length === 0 && (
          <EmptyState
            icon={<Users size={20} />}
            title="Tidak ada lead yang cocok"
            desc="Ubah filter atau tambahkan lead baru."
            action={<button type="button" className="btn btn-primary btn-sm" onClick={() => setAddOpen(true)}><Plus size={14} /> Lead baru</button>}
          />
        )}
        <Pager page={current} pageCount={pageCount} total={filtered.length} pageSize={pageSize} onChange={setPage} />
      </Card>

      <LeadComposer open={addOpen} onClose={() => setAddOpen(false)} />

      <Drawer
        open={!!selected}
        onClose={() => setSelected(null)}
        title={selected?.name ?? ''}
        sub={selected ? `${selected.company} · ${selected.businessType}` : undefined}
        footer={
          selected && selected.status !== 'Tidak cocok' ? (
            <>
              {selected.phone && (
                <a
                  className="btn btn-wa"
                  href={leadWaLink(selected, activeTemplate)}
                  target="_blank"
                  rel="noreferrer"
                >
                  <WhatsAppIcon size={14} /> Chat WhatsApp
                </a>
              )}
              <button type="button" className="btn btn-primary" onClick={() => handleConvert(selected)}>
                Konversi ke deal <ArrowRight size={14} />
              </button>
            </>
          ) : undefined
        }
      >
        {selected && (
          <div className="detail-stack">
            <div className="detail-grid">
              <div>
                <span className="detail-label">Nomor WA</span>
                <strong>{selected.phone || '—'}</strong>
              </div>
              <div><span className="detail-label">Jenis usaha</span><strong>{selected.businessType}</strong></div>
              <div><span className="detail-label">Status</span><AutoBadge value={selected.status} /></div>
              <div><span className="detail-label">Sumber</span><Badge tone={sourceTone[selected.source]}>{selected.source}</Badge></div>
              <div><span className="detail-label">Dibuat</span><strong>{fmtDate(selected.createdAt, true)}</strong></div>
            </div>
            <div className="detail-block">
              <div className="detail-block-head">
                <h4>Template pesan</h4>
                <Link to="/crm/templates" className="text-btn">Kelola <ArrowRight size={12} /></Link>
              </div>
              <select
                className="input"
                value={activeTemplate?.id ?? ''}
                onChange={(e) => setTemplateId(e.target.value)}
                aria-label="Template pesan WhatsApp"
              >
                {db.waTemplates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}{t.isDefault ? ' · utama' : ''}
                  </option>
                ))}
              </select>
              <div className="wa-bubble">
                {activeTemplate
                  ? fillTemplate(activeTemplate.body, leadTemplateVars(selected))
                  : 'Belum ada template. Tambahkan template di halaman Template WA.'}
              </div>
            </div>
            {selected.phone && (
              <a className="btn btn-wa btn-block" href={leadWaLink(selected, activeTemplate)} target="_blank" rel="noreferrer">
                <WhatsAppIcon size={14} /> Chat WhatsApp {selected.name.split(' ')[0]}
              </a>
            )}
            <div className="detail-block">
              <h4>Catatan</h4>
              <p className="muted-text">{selected.note ?? 'Belum ada catatan untuk lead ini.'}</p>
            </div>
            <div className="notice-inline">
              <ShieldCheck size={14} /> Konversi lead membuat deal pada tahap qualified. Riwayat lead tetap tersimpan.
            </div>
          </div>
        )}
      </Drawer>
    </CrmPage>
  );
}

export function CustomersPage() {
  const { db } = useStore();
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [health, setHealth] = useState('all');
  const [selected, setSelected] = useState<Company | null>(null);

  const rows = db.companies.filter((c) => {
    const matches = `${c.name} ${c.industry} ${c.city}`.toLowerCase().includes(q.toLowerCase());
    return matches && (health === 'all' || c.health === health);
  });

  const contacts = selected ? db.contacts.filter((c) => c.companyId === selected.id) : [];
  const deals = selected ? db.deals.filter((d) => d.companyId === selected.id) : [];
  const projects = selected ? db.projects.filter((p) => p.clientId === selected.id) : [];

  return (
    <CrmPage
      title="Customers"
      desc="Akun dan perusahaan yang bekerja dengan playdesign, lengkap dengan kesehatan hubungan."
      actions={
        <button type="button" className="btn btn-ghost" onClick={() => navigate('/crm/contacts')}>
          <UserRound size={15} /> Lihat kontak
        </button>
      }
    >
      <div className="table-toolbar card-toolbar">
        <SearchField value={q} onChange={setQ} placeholder="Cari perusahaan, industri, kota…" />
        <div className="toolbar-filters">
          <SelectBox
            label="Kesehatan"
            value={health}
            onChange={setHealth}
            options={[
              { value: 'all', label: 'Semua status' },
              { value: 'Sehat', label: 'Sehat' },
              { value: 'Perhatian', label: 'Perhatian' },
              { value: 'Risiko', label: 'Risiko' },
            ]}
          />
        </div>
      </div>

      <div className="company-grid">
        {rows.map((c) => {
          const owner = db.users.find((u) => u.id === c.ownerId);
          return (
            <button type="button" className="company-card" key={c.id} onClick={() => setSelected(c)}>
              <div className="company-top">
                <span className="company-mark" style={{ background: `hsl(${c.hue} 60% 93%)`, color: `hsl(${c.hue} 45% 32%)` }}>
                  {c.name.slice(0, 2).toUpperCase()}
                </span>
                <AutoBadge value={c.health} />
              </div>
              <h3>{c.name}</h3>
              <p className="company-meta">
                {c.industry} · {c.city}
              </p>
              <div className="company-figures">
                <div>
                  <span>Nilai kontrak</span>
                  <strong>{compactRupiah(c.arr)}</strong>
                </div>
                <div>
                  <span>Kontak</span>
                  <strong>{c.contactCount}</strong>
                </div>
              </div>
              <div className="company-foot">
                <Avatar name={owner?.name ?? '—'} size={20} />
                <span>{owner?.name}</span>
                <ChevronRight size={14} />
              </div>
            </button>
          );
        })}
      </div>
      {rows.length === 0 && <Card><EmptyState icon={<Building2 size={20} />} title="Tidak ada perusahaan" desc="Ubah filter pencarian." /></Card>}

      <Drawer
        open={!!selected}
        onClose={() => setSelected(null)}
        title={selected?.name ?? ''}
        sub={selected ? `${selected.industry} · ${selected.city}` : undefined}
        width={560}
      >
        {selected && (
          <div className="detail-stack">
            <div className="detail-grid">
              <div><span className="detail-label">Kesehatan</span><AutoBadge value={selected.health} /></div>
              <div><span className="detail-label">Nilai kontrak</span><strong>{rupiah(selected.arr)}</strong></div>
              <div><span className="detail-label">Klien sejak</span><strong>{fmtDate(selected.since, true)}</strong></div>
              <div><span className="detail-label">Pemilik akun</span><strong>{db.users.find((u) => u.id === selected.ownerId)?.name}</strong></div>
            </div>

            <div className="detail-block">
              <div className="detail-block-head">
                <h4>Kontak ({contacts.length})</h4>
                <Link to="/crm/contacts" className="text-btn">Semua <ArrowRight size={12} /></Link>
              </div>
              <div className="mini-people">
                {contacts.map((c) => (
                  <div className="mini-person" key={c.id}>
                    <Avatar name={c.name} size={28} />
                    <div>
                      <strong>{c.name}</strong>
                      <span>{c.title}</span>
                    </div>
                    <a href={`mailto:${c.email}`} className="icon-btn icon-btn-sm" aria-label={`Email ${c.name}`}>
                      <Mail size={13} />
                    </a>
                  </div>
                ))}
                {contacts.length === 0 && <p className="muted-text">Belum ada kontak tercatat.</p>}
              </div>
            </div>

            <div className="detail-block">
              <h4>Deal ({deals.length})</h4>
              <div className="mini-deals">
                {deals.map((d) => (
                  <Link to="/crm/deals" className="mini-deal" key={d.id}>
                    <span>{d.title}</span>
                    <span>{compactRupiah(d.value)}</span>
                    <AutoBadge value={dealStageLabel[d.stage]} />
                  </Link>
                ))}
                {deals.length === 0 && <p className="muted-text">Belum ada deal.</p>}
              </div>
            </div>

            <div className="detail-block">
              <h4>Proyek ({projects.length})</h4>
              <div className="mini-deals">
                {projects.map((p) => (
                  <Link to="/projects" className="mini-deal" key={p.id}>
                    <span>{p.name}</span>
                    <span>{p.progress}%</span>
                    <AutoBadge value={p.status} />
                  </Link>
                ))}
                {projects.length === 0 && <p className="muted-text">Belum ada proyek berjalan.</p>}
              </div>
            </div>

            <div className="notice-inline">
              <MapPin size={14} /> {selected.city} · bergabung {fmtDate(selected.since, true)}
            </div>
          </div>
        )}
      </Drawer>
    </CrmPage>
  );
}

export function ContactsPage() {
  const { db, addContact, toast } = useStore();
  const [q, setQ] = useState('');
  const [company, setCompany] = useState('all');
  const [addOpen, setAddOpen] = useState(false);
  const [selected, setSelected] = useState<Contact | null>(null);
  const [form, setForm] = useState({ name: '', companyId: db.companies[0]?.id ?? '', title: '', email: '', phone: '', ownerId: db.users[0]?.id ?? '' });

  const rows = db.contacts.filter((c) => {
    const matches = `${c.name} ${c.email} ${c.title}`.toLowerCase().includes(q.toLowerCase());
    return matches && (company === 'all' || c.companyId === company);
  });

  const submit = () => {
    if (!form.name.trim() || !form.email.trim()) {
      toast('Nama dan email wajib diisi.', 'danger');
      return;
    }
    addContact(form);
    setAddOpen(false);
    setForm({ name: '', companyId: db.companies[0]?.id ?? '', title: '', email: '', phone: '', ownerId: db.users[0]?.id ?? '' });
  };

  return (
    <CrmPage
      title="Contacts"
      desc="Orang-orang di balik setiap akun. Relasi dijaga dengan jejak aktivitas terakhir."
      actions={
        <button type="button" className="btn btn-primary" onClick={() => setAddOpen(true)}>
          <Plus size={15} /> Kontak baru
        </button>
      }
    >
      <div className="table-toolbar card-toolbar">
        <SearchField value={q} onChange={setQ} placeholder="Cari nama, jabatan, email…" />
        <div className="toolbar-filters">
          <SelectBox
            label="Perusahaan"
            value={company}
            onChange={setCompany}
            options={[{ value: 'all', label: 'Semua perusahaan' }, ...db.companies.map((c) => ({ value: c.id, label: c.name }))]}
          />
        </div>
      </div>

      <Card bodyClass="no-pad">
        <div className="table-wrap">
          <table className="pd-table">
            <thead>
              <tr>
                <th scope="col">Kontak</th>
                <th scope="col">Perusahaan</th>
                <th scope="col">Jabatan</th>
                <th scope="col">Kontak</th>
                <th scope="col">Pemilik</th>
                <th scope="col">Terakhir</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => {
                const comp = db.companies.find((x) => x.id === c.companyId);
                const owner = db.users.find((u) => u.id === c.ownerId);
                return (
                  <tr key={c.id} className="is-clickable" onClick={() => setSelected(c)}>
                    <td>
                      <div className="cell-person">
                        <Avatar name={c.name} size={32} />
                        <div className="cell-main">
                          <strong>{c.name}</strong>
                          <span className="cell-sub">{c.email}</span>
                        </div>
                      </div>
                    </td>
                    <td>{comp?.name ?? '—'}</td>
                    <td>{c.title}</td>
                    <td>
                      <div className="cell-main">
                        <span>{c.phone}</span>
                        <span className="cell-sub">{c.email}</span>
                      </div>
                    </td>
                    <td>
                      <span className="cell-person-inline">
                        <Avatar name={owner?.name ?? '—'} size={22} /> {owner?.name.split(' ')[0]}
                      </span>
                    </td>
                    <td>{relTime(c.lastTouch)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {rows.length === 0 && <EmptyState icon={<UserRound size={20} />} title="Tidak ada kontak" desc="Ubah filter atau tambahkan kontak baru." />}
      </Card>

      <Modal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        title="Kontak baru"
        sub="Kontak terhubung ke satu perusahaan."
        footer={
          <>
            <button type="button" className="btn btn-ghost" onClick={() => setAddOpen(false)}>Batal</button>
            <button type="button" className="btn btn-primary" onClick={submit}>Simpan kontak</button>
          </>
        }
      >
        <div className="form-grid">
          <Field label="Nama"><input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Nama lengkap" autoFocus /></Field>
          <Field label="Perusahaan">
            <select className="input" value={form.companyId} onChange={(e) => setForm({ ...form, companyId: e.target.value })}>
              {db.companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
          <Field label="Jabatan"><input className="input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></Field>
          <Field label="Pemilik"><select className="input" value={form.ownerId} onChange={(e) => setForm({ ...form, ownerId: e.target.value })}>{db.users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select></Field>
          <Field label="Email"><input type="email" className="input" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
          <Field label="Telepon"><input className="input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field>
        </div>
      </Modal>

      <Drawer
        open={!!selected}
        onClose={() => setSelected(null)}
        title={selected?.name ?? ''}
        sub={selected ? `${selected.title} · ${db.companies.find((c) => c.id === selected.companyId)?.name}` : undefined}
      >
        {selected && (
          <div className="detail-stack">
            <div className="detail-grid">
              <div><span className="detail-label">Email</span><a href={`mailto:${selected.email}`} className="link-text">{selected.email}</a></div>
              <div><span className="detail-label">Telepon</span><strong>{selected.phone}</strong></div>
              <div><span className="detail-label">Perusahaan</span><strong>{db.companies.find((c) => c.id === selected.companyId)?.name}</strong></div>
              <div><span className="detail-label">Terakhir dihubungi</span><strong>{fmtDate(selected.lastTouch, true)}</strong></div>
              <div><span className="detail-label">Pemilik relasi</span><strong>{db.users.find((u) => u.id === selected.ownerId)?.name}</strong></div>
            </div>
            <div className="detail-actions">
              <a href={`mailto:${selected.email}`} className="btn btn-primary"><Mail size={14} /> Kirim email</a>
              <a href={`tel:${selected.phone.replace(/\s/g, '')}`} className="btn btn-ghost"><Phone size={14} /> Telepon</a>
            </div>
            <div className="notice-inline"><ShieldCheck size={14} /> Aksi keluar seperti email memakai aplikasi eksternal; playdesign tidak mengirim otomatis.</div>
          </div>
        )}
      </Drawer>
    </CrmPage>
  );
}

function AddDealModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { db, addDeal, toast } = useStore();
  const [form, setForm] = useState({
    title: '',
    companyId: db.companies[0]?.id ?? '',
    value: '',
    stage: 'new' as DealStage,
    ownerId: db.users[0]?.id ?? '',
    closeAt: new Date(Date.now() + 21 * 86400000).toISOString().slice(0, 10),
    source: 'Referral',
  });
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Deal baru"
      sub="Deal masuk ke pipeline dan bisa dipindahkan lewat kanban."
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose}>Batal</button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              if (!form.title.trim()) {
                toast('Judul deal wajib diisi.', 'danger');
                return;
              }
              addDeal({
                title: form.title.trim(),
                companyId: form.companyId,
                value: Number(form.value) || 0,
                stage: form.stage,
                ownerId: form.ownerId,
                closeAt: new Date(`${form.closeAt}T12:00:00`).toISOString(),
                source: form.source,
              });
              onClose();
            }}
          >
            Simpan deal
          </button>
        </>
      }
    >
      <div className="form-grid">
        <Field label="Judul deal" className="span-2"><input className="input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Contoh: Rebrand Arunika" autoFocus /></Field>
        <Field label="Perusahaan"><select className="input" value={form.companyId} onChange={(e) => setForm({ ...form, companyId: e.target.value })}>{db.companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
        <Field label="Nilai (Rp)"><input type="number" className="input" value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} placeholder="150000000" /></Field>
        <Field label="Tahap"><select className="input" value={form.stage} onChange={(e) => setForm({ ...form, stage: e.target.value as DealStage })}>{stageOrder.map((s) => <option key={s} value={s}>{dealStageLabel[s]}</option>)}</select></Field>
        <Field label="Pemilik"><select className="input" value={form.ownerId} onChange={(e) => setForm({ ...form, ownerId: e.target.value })}>{db.users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select></Field>
        <Field label="Tanggal tutup"><input type="date" className="input" value={form.closeAt} onChange={(e) => setForm({ ...form, closeAt: e.target.value })} /></Field>
        <Field label="Sumber"><select className="input" value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })}>{['Referral', 'Website', 'Instagram', 'LinkedIn', 'Event', 'Outbound'].map((s) => <option key={s}>{s}</option>)}</select></Field>
      </div>
    </Modal>
  );
}

export function DealsPage() {
  const { db, moveDeal } = useStore();
  const [q, setQ] = useState('');
  const [stage, setStage] = useState('all');
  const [page, setPage] = useState(1);
  const [addOpen, setAddOpen] = useState(false);
  const [selected, setSelected] = useState<Deal | null>(null);
  const [pendingStage, setPendingStage] = useState<DealStage | null>(null);
  const pageSize = 9;

  const filtered = db.deals
    .filter((d) => {
      const company = db.companies.find((c) => c.id === d.companyId)?.name ?? '';
      const matches = `${d.title} ${company}`.toLowerCase().includes(q.toLowerCase());
      return matches && (stage === 'all' || d.stage === stage);
    })
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

  const pageCount = Math.ceil(filtered.length / pageSize) || 1;
  const current = Math.min(page, pageCount);
  const rows = filtered.slice((current - 1) * pageSize, current * pageSize);

  const changeStage = (deal: Deal, next: DealStage) => {
    if (next === 'won' || next === 'lost') {
      setPendingStage(next);
      return;
    }
    moveDeal(deal.id, next);
    setSelected((prev) => (prev && prev.id === deal.id ? { ...prev, stage: next, probability: next === 'qualified' ? 35 : next === 'proposal' ? 55 : next === 'negotiation' ? 75 : 20 } : prev));
  };

  return (
    <CrmPage
      title="Deals"
      desc="Nilai, tahap, pemilik, dan tanggal tutup. Won atau lost wajib punya alasan yang tersimpan."
      actions={
        <button type="button" className="btn btn-primary" onClick={() => setAddOpen(true)}>
          <Plus size={15} /> Deal baru
        </button>
      }
    >
      <div className="table-toolbar card-toolbar">
        <SearchField value={q} onChange={(v) => { setQ(v); setPage(1); }} placeholder="Cari deal atau perusahaan…" />
        <div className="toolbar-filters">
          <SelectBox
            label="Tahap"
            value={stage}
            onChange={(v) => { setStage(v); setPage(1); }}
            options={[{ value: 'all', label: 'Semua tahap' }, ...stageOrder.map((s) => ({ value: s, label: dealStageLabel[s] }))]}
          />
        </div>
      </div>

      <Card bodyClass="no-pad">
        <div className="table-wrap">
          <table className="pd-table">
            <thead>
              <tr>
                <th scope="col">Deal</th>
                <th scope="col">Nilai</th>
                <th scope="col">Tahap</th>
                <th scope="col">Probabilitas</th>
                <th scope="col">Pemilik</th>
                <th scope="col">Tutup</th>
                <th scope="col" />
              </tr>
            </thead>
            <tbody>
              {rows.map((d) => {
                const company = db.companies.find((c) => c.id === d.companyId);
                const owner = db.users.find((u) => u.id === d.ownerId);
                return (
                  <tr key={d.id} className="is-clickable" onClick={() => setSelected(d)}>
                    <td>
                      <div className="cell-main">
                        <strong>{d.title}</strong>
                        <span className="cell-sub">{company?.name} · {d.source}</span>
                      </div>
                    </td>
                    <td className="num-cell">{compactRupiah(d.value)}</td>
                    <td><AutoBadge value={dealStageLabel[d.stage]} /></td>
                    <td>
                      <div className="prob-cell">
                        <Progress value={d.probability} thin />
                        <span>{d.probability}%</span>
                      </div>
                    </td>
                    <td>
                      <span className="cell-person-inline"><Avatar name={owner?.name ?? '—'} size={22} />{owner?.name.split(' ')[0]}</span>
                    </td>
                    <td>{fmtDate(d.closeAt)}</td>
                    <td className="row-end"><ChevronRight size={15} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {rows.length === 0 && <EmptyState icon={<Wallet size={20} />} title="Tidak ada deal" desc="Ubah filter atau tambahkan deal baru." />}
        <Pager page={current} pageCount={pageCount} total={filtered.length} pageSize={pageSize} onChange={setPage} />
      </Card>

      <AddDealModal open={addOpen} onClose={() => setAddOpen(false)} />

      <Drawer
        open={!!selected}
        onClose={() => setSelected(null)}
        title={selected?.title ?? ''}
        sub={selected ? db.companies.find((c) => c.id === selected.companyId)?.name : undefined}
        footer={
          selected ? (
            <>
              <button type="button" className="btn btn-ghost" onClick={() => setSelected(null)}>Tutup</button>
              <Link to="/crm/pipeline" className="btn btn-primary">Buka pipeline <ArrowRight size={14} /></Link>
            </>
          ) : undefined
        }
      >
        {selected && (
          <div className="detail-stack">
            <div className="deal-value-block">
              <span>Nilai deal</span>
              <strong>{rupiah(selected.value)}</strong>
              <div className="prob-cell">
                <Progress value={selected.probability} thin />
                <span>{selected.probability}% probabilitas</span>
              </div>
            </div>
            <div className="detail-grid">
              <div><span className="detail-label">Tahap</span><AutoBadge value={dealStageLabel[selected.stage]} /></div>
              <div><span className="detail-label">Pemilik</span><strong>{db.users.find((u) => u.id === selected.ownerId)?.name}</strong></div>
              <div><span className="detail-label">Tanggal tutup</span><strong>{fmtDate(selected.closeAt, true)}</strong></div>
              <div><span className="detail-label">Sumber</span><Badge tone={sourceTone[selected.source]}>{selected.source}</Badge></div>
              <div><span className="detail-label">Terakhir diubah</span><strong>{relTime(selected.updatedAt)}</strong></div>
              <div><span className="detail-label">Status</span><Badge tone={selected.stage === 'won' ? 'success' : selected.stage === 'lost' ? 'danger' : 'info'}>{selected.stage === 'won' ? 'Menang' : selected.stage === 'lost' ? 'Kalah' : 'Berjalan'}</Badge></div>
            </div>

            <div className="detail-block">
              <h4>Pindahkan tahap</h4>
              <div className="stage-picker">
                {stageOrder.map((s) => (
                  <button
                    key={s}
                    type="button"
                    className={cx('stage-chip', selected.stage === s && 'is-current')}
                    disabled={selected.stage === s}
                    onClick={() => changeStage(selected, s)}
                  >
                    {dealStageLabel[s]}
                    {selected.stage === s && <Check size={12} />}
                  </button>
                ))}
              </div>
              <p className="field-hint">Won dan lost membutuhkan alasan. Setiap perubahan dicatat di audit.</p>
            </div>

            {selected.stageNote && (
              <div className="detail-block">
                <h4>Catatan tahap</h4>
                <p className="muted-text">{selected.stageNote}</p>
              </div>
            )}

            <div className="notice-inline"><ShieldCheck size={14} /> Perubahan tahap tidak mengirim apa pun keluar.</div>
          </div>
        )}
      </Drawer>

      <ReasonDialog
        open={!!pendingStage}
        onClose={() => setPendingStage(null)}
        title={pendingStage === 'won' ? 'Tandai deal menang' : 'Tandai deal kalah'}
        desc="Alasan ini masuk ke audit trail dan tidak bisa dikosongkan."
        confirmLabel={pendingStage === 'won' ? 'Tandai menang' : 'Tandai kalah'}
        onSubmit={(reason) => {
          if (selected && pendingStage) {
            const next = pendingStage;
            moveDeal(selected.id, next, reason);
            setSelected({ ...selected, stage: next, probability: next === 'won' ? 100 : 0, stageNote: reason });
            setPendingStage(null);
          }
        }}
      />
    </CrmPage>
  );
}

export function PipelinePage() {
  const { db, moveDeal } = useStore();
  const [dragging, setDragging] = useState<string | null>(null);
  const [pending, setPending] = useState<{ dealId: string; stage: DealStage } | null>(null);
  const [selected, setSelected] = useState<Deal | null>(null);

  const drop = (stage: DealStage) => {
    if (!dragging) return;
    const deal = db.deals.find((d) => d.id === dragging);
    setDragging(null);
    if (!deal || deal.stage === stage) return;
    if (stage === 'won' || stage === 'lost') {
      setPending({ dealId: deal.id, stage });
      return;
    }
    moveDeal(deal.id, stage);
  };

  return (
    <CrmPage
      title="Pipeline"
      desc="Kanban per tahap. Drag hanya mengubah tahap; won dan lost wajib alasan dan masuk audit."
      actions={
        <Badge tone="info" dot>
          drag &amp; drop
        </Badge>
      }
    >
      <div className="kanban-wrap">
        <div className="kanban">
          {stageOrder.map((stage) => {
            const deals = db.deals.filter((d) => d.stage === stage);
            const total = deals.reduce((s, d) => s + d.value, 0);
            return (
              <div
                key={stage}
                className={cx('kan-col', `stage-${stage}`)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => drop(stage)}
              >
                <div className="kan-head">
                  <div>
                    <span className={`stage-dot stage-${stage}`} />
                    <strong>{dealStageLabel[stage]}</strong>
                    <span className="kan-count">{deals.length}</span>
                  </div>
                  <span className="kan-total">{compactRupiah(total)}</span>
                </div>
                <div className="kan-body">
                  {deals.map((d) => {
                    const company = db.companies.find((c) => c.id === d.companyId);
                    const owner = db.users.find((u) => u.id === d.ownerId);
                    return (
                      <article
                        key={d.id}
                        className={cx('kan-card', dragging === d.id && 'is-dragging')}
                        draggable
                        onDragStart={() => setDragging(d.id)}
                        onDragEnd={() => setDragging(null)}
                        onClick={() => setSelected(d)}
                      >
                        <div className="kan-card-top">
                          <span className="kan-company">{company?.name}</span>
                          <GripVertical size={14} className="kan-grip" />
                        </div>
                        <h3>{d.title}</h3>
                        <div className="kan-value">{compactRupiah(d.value)}</div>
                        <div className="kan-prob">
                          <Progress value={d.probability} thin tone={d.probability >= 70 ? 'success' : d.probability >= 40 ? 'brand' : 'warning'} />
                          <span>{d.probability}%</span>
                        </div>
                        <div className="kan-foot">
                          <Avatar name={owner?.name ?? '—'} size={22} />
                          <span className={cx('kan-date', new Date(d.closeAt).getTime() - Date.now() < 7 * 86400000 && new Date(d.stage) ? '' : '')}>
                            <CalendarDays size={12} /> {fmtDate(d.closeAt)}
                          </span>
                        </div>
                        {d.stageNote && <p className="kan-note">{d.stageNote}</p>}
                      </article>
                    );
                  })}
                  {deals.length === 0 && (
                    <div className="kan-empty">
                      <CircleAlert size={14} /> Tarik deal ke sini
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="pipeline-legend">
        <span><ShieldCheck size={14} /> Setiap perubahan tahap tercatat di audit log dengan pelaku dan waktu.</span>
        <Link to="/admin/audit" className="text-btn">Lihat audit <ArrowRight size={13} /></Link>
      </div>

      <ReasonDialog
        open={!!pending}
        onClose={() => setPending(null)}
        title={pending?.stage === 'won' ? 'Tandai deal menang' : 'Tandai deal kalah'}
        desc="Tahap won/lost wajib punya alasan. Alasan masuk audit trail."
        confirmLabel="Simpan alasan"
        onSubmit={(reason) => {
          if (pending) {
            moveDeal(pending.dealId, pending.stage, reason);
            setPending(null);
          }
        }}
      />

      <Drawer
        open={!!selected}
        onClose={() => setSelected(null)}
        title={selected?.title ?? ''}
        sub={selected ? db.companies.find((c) => c.id === selected.companyId)?.name : undefined}
      >
        {selected && (
          <div className="detail-stack">
            <div className="deal-value-block">
              <span>Nilai deal</span>
              <strong>{rupiah(selected.value)}</strong>
              <AutoBadge value={dealStageLabel[selected.stage]} />
            </div>
            <div className="detail-grid">
              <div><span className="detail-label">Probabilitas</span><strong>{selected.probability}%</strong></div>
              <div><span className="detail-label">Pemilik</span><strong>{db.users.find((u) => u.id === selected.ownerId)?.name}</strong></div>
              <div><span className="detail-label">Tanggal tutup</span><strong>{fmtDate(selected.closeAt, true)}</strong></div>
              <div><span className="detail-label">Sumber</span><strong>{selected.source}</strong></div>
            </div>
            {selected.stageNote && <div className="detail-block"><h4>Catatan tahap</h4><p className="muted-text">{selected.stageNote}</p></div>}
            <div className="notice-inline"><ShieldCheck size={14} /> Untuk memindahkan tahap, tarik kartu di pipeline. Won/lost memerlukan alasan.</div>
          </div>
        )}
      </Drawer>
    </CrmPage>
  );
}
