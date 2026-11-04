import { useMemo, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowUpRight,
  ChevronDown,
  ChevronRight,
  Globe,
  Mail,
  MapPin,
  Phone,
  Plus,
  Search,
  Sparkles,
  Users,
  X,
} from "lucide-react";
import { teamById, type Lead, type LeadStatus } from "../data/mock";
import { useStore } from "../lib/store";
import { cn, money, moneyCompact } from "../lib/utils";
import {
  Avatar,
  Badge,
  Button,
  CircularGauge,
  Drawer,
  Field,
  IconButton,
  inputClass,
  Modal,
  PageHeader,
  ProgressBar,
  Segmented,
} from "../components/ui";
import { PlatformIcon } from "../components/PlatformIcon";

type LeadFilter = "all" | "new" | "qualified" | "nurturing";
type SortKey = "score" | "value" | "name";

const leadStatusStyles: Record<LeadStatus, { tone: "info" | "success" | "warning" | "accent" | "neutral"; label: string }> = {
  new: { tone: "info", label: "New" },
  qualified: { tone: "success", label: "Qualified" },
  nurturing: { tone: "warning", label: "Nurturing" },
  customer: { tone: "accent", label: "Customer" },
  cold: { tone: "neutral", label: "Cold" },
};

function SourceLabel({ source }: { source: string }) {
  if (source === "gmaps_scraper") {
    return (
      <span className="inline-flex items-center gap-1.5 font-medium text-success">
        <span className="grid size-[22px] place-items-center rounded-[6px] bg-success-soft text-success">
          <Phone size={11} />
        </span>
        <span className="hidden xl:inline">Google Maps WA</span>
      </span>
    );
  }
  if (source === "Instagram" || source === "LinkedIn" || source === "Email" || source === "Web chat") {
    return (
      <span className="inline-flex items-center gap-1.5">
        <PlatformIcon platform={source} size="sm" className="scale-90" />
        <span className="hidden xl:inline">{source}</span>
      </span>
    );
  }
  const Icon = source === "Website" ? Globe : Users;
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="grid size-[22px] place-items-center rounded-[6px] bg-surface-3 text-muted">
        <Icon size={11} />
      </span>
      <span className="hidden xl:inline">{source}</span>
    </span>
  );
}

function AddLeadModal({
  onClose,
  onSubmit,
}: {
  onClose: () => void;
  onSubmit: (lead: Lead) => void;
}) {
  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("");
  const [value, setValue] = useState("12000");
  const [source, setSource] = useState("Instagram");

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim()) return;
    onSubmit({
      id: `l-${Date.now()}`,
      name: name.trim(),
      company: company.trim() || "Independent",
      role: role.trim() || "Founder",
      email: email.trim() || `${name.trim().split(" ")[0].toLowerCase()}@example.com`,
      phone: "—",
      location: "—",
      status: "new",
      source,
      score: 50,
      value: Number(value) || 0,
      ownerId: "ja",
      lastActivity: "Added manually just now",
      tags: ["Inbound"],
      nextStep: "Qualify via intro call",
      notes: "Newly added contact. Enrichment and scores are placeholders until a source is attached.",
    });
    onClose();
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Add lead"
      description="The contact is added to this workspace. Scores appear as estimates until evidence is attached."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" form="lead-form">
            Add lead
          </Button>
        </>
      }
    >
      <form id="lead-form" onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        <Field label="Full name">
          <input value={name} onChange={(event) => setName(event.target.value)} className={inputClass} placeholder="e.g. Clara Moreau" required autoFocus />
        </Field>
        <Field label="Company">
          <input value={company} onChange={(event) => setCompany(event.target.value)} className={inputClass} placeholder="Company name" />
        </Field>
        <Field label="Email">
          <input value={email} onChange={(event) => setEmail(event.target.value)} type="email" className={inputClass} placeholder="name@company.com" />
        </Field>
        <Field label="Role">
          <input value={role} onChange={(event) => setRole(event.target.value)} className={inputClass} placeholder="e.g. Marketing Lead" />
        </Field>
        <Field label="Estimated value" hint="USD">
          <input value={value} onChange={(event) => setValue(event.target.value)} type="number" min="0" className={inputClass} />
        </Field>
        <Field label="Source">
          <select value={source} onChange={(event) => setSource(event.target.value)} className={inputClass}>
            {["Instagram", "LinkedIn", "Email", "Web chat", "Website", "Referral"].map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
        </Field>
      </form>
    </Modal>
  );
}

function LeadDrawer({ lead, onClose }: { lead: Lead; onClose: () => void }) {
  const navigate = useNavigate();
  const { agents, startRun, convertLeadToClient } = useStore();
  const owner = teamById(lead.ownerId);
  const agent = agents[0];
  const [queued, setQueued] = useState<"available" | "unavailable" | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const [converted, setConverted] = useState<{ ok: boolean; message: string; clientId?: string } | null>(null);
  const status = leadStatusStyles[lead.status];
  const scoreLabel = lead.score >= 85 ? "Very likely to convert" : lead.score >= 70 ? "Warm — keep nurturing" : "Needs qualification";

  const convert = () => {
    const result = convertLeadToClient(lead.id);
    setConverted({
      ok: result.ok,
      message: result.ok ? `${lead.company} is now a client with onboarding status.` : result.error ?? "Could not convert this lead.",
      clientId: result.clientId,
    });
  };

  const followUp = async () => {
    if (!agent || queued) return;
    setRunError(null);
    const result = await startRun({
      agentId: agent.id,
      action: "Drafted follow-up",
      subject: `${lead.name} · ${lead.company}`,
      limitations: ["Draft only — sending needs your approval."],
    });
    if (!result.ok) {
      setRunError(result.error ?? "The run could not be queued.");
      return;
    }
    setQueued(agent.availability === "unavailable" ? "unavailable" : "available");
  };

  return (
    <Drawer open onClose={onClose} title="Lead profile">
      <div className="sticky top-0 z-10 flex items-center justify-between border-b border-line bg-surface/95 px-5 py-3.5 backdrop-blur">
        <span className="overline">Lead profile</span>
        <IconButton label="Close profile" onClick={onClose}>
          <X size={16} />
        </IconButton>
      </div>

      <div className="px-5 py-5">
        <div className="flex items-start gap-3.5">
          <Avatar name={lead.name} tone={owner.tone} size="xl" />
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-[18px] font-semibold tracking-tight text-ink">{lead.name}</h2>
            <p className="mt-0.5 text-[12px] text-muted">
              {lead.role} · {lead.company}
            </p>
            <div className="mt-2 flex items-center gap-2">
              <Badge tone={status.tone} dot>
                {status.label}
              </Badge>
              <span className="text-[10px] text-faint">Owner: {owner.name.split(" ")[0]}</span>
            </div>
          </div>
        </div>

        <div className="mt-4 flex gap-2">
          {lead.whatsappLink || lead.phone ? (
            <a
              href={lead.whatsappLink || `https://wa.me/${lead.phone.replace(/\D/g, '')}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-[10px] bg-emerald-600 text-[12px] font-medium text-white transition-colors hover:bg-emerald-700"
            >
              <Phone size={14} /> Chat WhatsApp
            </a>
          ) : (
            <a
              href={`mailto:${lead.email}`}
              className="inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-[10px] border border-line text-[12px] font-medium text-ink transition-colors hover:bg-surface-2"
            >
              <Mail size={14} className="text-muted" /> Email
            </a>
          )}
          <button
            onClick={followUp}
            disabled={queued !== null}
            className={cn(
              "inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-[10px] text-[12px] font-medium transition-colors",
              queued === "available"
                ? "bg-success-soft text-success"
                : queued === "unavailable"
                  ? "bg-warning-soft text-warning"
                  : "bg-accent text-white hover:bg-accent-hover",
            )}
          >
            <Sparkles size={14} />
            {queued === "available"
              ? `${agent?.name ?? "Agent"} queued a draft`
              : queued === "unavailable"
                ? `${agent?.name ?? "Agent"} unavailable`
                : `Ask ${agent?.name ?? "the agent"} to follow up`}
          </button>
        </div>
        {runError && <p className="mt-1 text-[10px] leading-relaxed text-warning">{runError}</p>}

        {(lead.status !== "customer" || converted?.ok) && (
          <div className="mt-2">
            {lead.status !== "customer" && (
              <button
                onClick={convert}
                className="inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-[10px] border border-line text-[12px] font-medium text-ink transition-colors hover:bg-surface-2"
              >
                <ArrowUpRight size={14} />
                Convert to client
              </button>
            )}
            {converted && (
              <div
                className={cn(
                  "mt-2 flex items-center justify-between gap-2 rounded-lg border px-2.5 py-2",
                  converted.ok ? "border-success/25 bg-success-soft" : "border-line bg-surface-2/70",
                )}
              >
                <span className={cn("text-[10px] leading-relaxed", converted.ok ? "text-success" : "text-warning")}>
                  {converted.message}
                </span>
                {converted.ok && converted.clientId && (
                  <button
                    onClick={() => navigate(`/clients?client=${converted.clientId}`)}
                    className="shrink-0 text-[10px] font-medium text-accent-text hover:underline"
                  >
                    Open client
                  </button>
                )}
              </div>
            )}
            <p className="mt-1 text-[9px] text-faint">Creates a client record and a qualified deal if none exists.</p>
          </div>
        )}

        <div className="mt-5 flex items-center gap-4 rounded-xl border border-line bg-surface-2/60 p-3.5">
          <CircularGauge value={lead.score} size={78} stroke={6} label={String(lead.score)} sublabel="AI score" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 text-[11px] font-medium text-ink">
              <Sparkles size={12} className="text-accent-text" /> {scoreLabel}
            </div>
            <p className="mt-1 text-[10px] leading-relaxed text-faint">
              Estimate from demo engagement signals — not a measured prediction.
            </p>
            <ProgressBar value={lead.score} className="mt-2" tone={lead.score >= 85 ? "success" : lead.score >= 65 ? "warning" : "accent"} />
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <div className="rounded-xl border border-line p-3">
            <div className="text-[9.5px] uppercase tracking-[0.08em] text-faint">Deal value</div>
            <div className="mt-1 font-mono text-[16px] font-medium text-ink">{money(lead.value)}</div>
          </div>
          <div className="rounded-xl border border-line p-3">
            <div className="text-[9.5px] uppercase tracking-[0.08em] text-faint">Source</div>
            <div className="mt-1 flex h-6 items-center text-[12px] font-medium text-ink">{lead.source}</div>
          </div>
        </div>

        <div className="mt-5">
          <div className="overline mb-2">Contact</div>
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-[11.5px] text-muted">
              <Mail size={13} className="text-faint" /> {lead.email}
            </div>
            <div className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-[11.5px] text-muted">
              <Phone size={13} className="text-faint" /> {lead.phone}
            </div>
            <div className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-[11.5px] text-muted">
              <MapPin size={13} className="text-faint" /> {lead.location}
            </div>
          </div>
        </div>

        <div className="mt-5 rounded-xl border border-accent/20 bg-accent-soft/50 p-3.5">
          <div className="text-[9.5px] uppercase tracking-[0.1em] text-accent-text">Next step</div>
          <p className="mt-1 text-[12px] font-medium leading-snug text-ink">{lead.nextStep}</p>
          <button
            onClick={() => navigate("/inbox")}
            className="mt-2 flex items-center gap-1 text-[10.5px] font-medium text-accent-text hover:underline"
          >
            Open conversation <ArrowUpRight size={11} />
          </button>
        </div>

        <div className="mt-5">
          <div className="overline mb-2">Agent read</div>
          <p className="text-[11.5px] leading-relaxed text-muted">{lead.notes}</p>
        </div>

        <div className="mt-5">
          <div className="overline mb-2.5">Recent activity</div>
          <div className="relative space-y-3 pl-1">
            <div className="absolute bottom-2 left-[4px] top-2 w-px bg-line" />
            {[
              { label: lead.lastActivity, time: "Just now" },
              { label: "Agent enriched contact details (demo source)", time: "1d ago" },
              { label: `Lead created from ${lead.source}`, time: "4d ago" },
            ].map((item) => (
              <div key={item.label} className="relative flex gap-3">
                <span className="relative z-10 mt-1.5 size-[7px] shrink-0 rounded-full border border-line bg-surface" />
                <div>
                  <p className="text-[11px] leading-snug text-ink">{item.label}</p>
                  <p className="mt-0.5 font-mono text-[9px] text-faint">{item.time}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-5 flex flex-wrap gap-1.5">
          {lead.tags.map((tag) => (
            <Badge key={tag} tone="neutral">
              {tag}
            </Badge>
          ))}
        </div>
      </div>
    </Drawer>
  );
}

export default function Leads() {
  const { leads, addLead, workspace, refresh } = useStore();
  const [filter, setFilter] = useState<LeadFilter>("all");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("score");
  const [source, setSource] = useState("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [scraping, setScraping] = useState(false);
  const [scrapeNotice, setScrapeNotice] = useState<string | null>(null);

  const runScraper = async () => {
    if (scraping) return;
    setScraping(true);
    setScrapeNotice("Menyinkronkan daftar prospek terbaru dari database produksi...");
    try {
      await refresh();
      setScrapeNotice("Prospek berhasil disinkronkan.");
      setTimeout(() => setScrapeNotice(null), 4000);
    } catch {
      setScrapeNotice("Gagal menyinkronkan data.");
      setTimeout(() => setScrapeNotice(null), 4000);
    } finally {
      setScraping(false);
    }
  };

  const sources = useMemo(() => Array.from(new Set(leads.map((lead) => lead.source))), [leads]);

  const filtered = useMemo(() => {
    const search = query.trim().toLowerCase();
    return leads
      .filter((lead) => {
        if (filter !== "all" && lead.status !== filter) return false;
        if (source !== "all" && lead.source !== source) return false;
        if (search && !`${lead.name} ${lead.company} ${lead.email} ${lead.tags.join(" ")}`.toLowerCase().includes(search)) return false;
        return true;
      })
      .sort((a, b) => {
        if (sort === "value") return b.value - a.value;
        if (sort === "name") return a.name.localeCompare(b.name);
        return b.score - a.score;
      });
  }, [leads, filter, source, query, sort]);

  const selectedLead = leads.find((lead) => lead.id === selectedId) ?? null;
  const totalValue = leads.reduce((sum, lead) => sum + lead.value, 0);
  const hotLeads = leads.filter((lead) => lead.score >= 85).length;
  const avgScore = Math.round(leads.reduce((sum, lead) => sum + lead.score, 0) / Math.max(leads.length, 1));

  const counts = {
    all: leads.length,
    new: leads.filter((lead) => lead.status === "new").length,
    qualified: leads.filter((lead) => lead.status === "qualified").length,
    nurturing: leads.filter((lead) => lead.status === "nurturing").length,
  };

  return (
    <div>
      <PageHeader
        eyebrow="Ruang Kerja"
        title="Prospek & Leads"
        description={`Direktori prospek di ${workspace.name}, termasuk hasil pemindaian Google Maps UMKM Jawa Tengah tanpa website.`}
      >
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={runScraper} disabled={scraping}>
            <Sparkles size={15} className="text-emerald-500" /> {scraping ? "Menyinkronkan…" : "Scan WA Jateng"}
          </Button>
          <Button variant="primary" onClick={() => setAddOpen(true)}>
            <Plus size={15} /> Tambah Prospek
          </Button>
        </div>
      </PageHeader>

      {scrapeNotice && (
        <div className="mt-3 flex items-center justify-between rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-2.5 text-[12px] text-emerald-400">
          <span>{scrapeNotice}</span>
          <button onClick={() => setScrapeNotice(null)} className="text-[11px] hover:underline">Tutup</button>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3.5 xl:grid-cols-4">
        {[
          { label: "Total leads", value: String(leads.length), note: "Demo dataset", icon: Users, className: "bg-info-soft text-info" },
          { label: "Hot leads", value: String(hotLeads), note: "Score 85+", icon: Sparkles, className: "bg-accent-soft text-accent-text" },
          { label: "Open value", value: moneyCompact(totalValue), note: "Estimated", icon: ArrowUpRight, className: "bg-success-soft text-success" },
          { label: "Avg. AI score", value: String(avgScore), note: "Estimate", icon: Globe, className: "bg-warning-soft text-warning" },
        ].map((stat) => {
          const Icon = stat.icon;
          return (
            <div key={stat.label} className="card flex items-center gap-3 p-4">
              <span className={cn("grid size-9 shrink-0 place-items-center rounded-[10px]", stat.className)}>
                <Icon size={17} />
              </span>
              <div>
                <div className="font-mono text-[19px] font-medium leading-none tracking-tight text-ink">{stat.value}</div>
                <div className="mt-1 text-[11px] font-medium text-muted">{stat.label}</div>
              </div>
              <span className="ml-auto hidden text-right text-[9.5px] text-faint sm:block">{stat.note}</span>
            </div>
          );
        })}
      </div>

      <div className="card mt-4 flex flex-col gap-2.5 p-3 lg:flex-row lg:items-center">
        <div className="relative flex-1 lg:max-w-[280px]">
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search leads, companies or tags…"
            className="h-9 w-full rounded-[9px] border border-line bg-surface-2 pl-8 pr-3 text-[12px] text-ink placeholder:text-faint transition-colors focus:border-accent/40 focus:bg-surface focus:outline-none focus:ring-2 focus:ring-accent/10"
          />
        </div>

        <Segmented<LeadFilter>
          value={filter}
          onChange={setFilter}
          size="sm"
          options={[
            { value: "all", label: "All", count: counts.all },
            { value: "new", label: "New", count: counts.new },
            { value: "qualified", label: "Qualified", count: counts.qualified },
            { value: "nurturing", label: "Nurturing", count: counts.nurturing },
          ]}
        />

        <div className="flex flex-wrap items-center gap-2 lg:ml-auto">
          <div className="relative">
            <select
              value={source}
              onChange={(event) => setSource(event.target.value)}
              aria-label="Filter by source"
              className="h-8 appearance-none rounded-lg border border-line bg-surface-2 pl-2.5 pr-7 text-[11px] font-medium text-muted focus:outline-none"
            >
              <option value="all">All sources</option>
              {sources.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
            <ChevronDown size={12} className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-faint" />
          </div>
          <div className="relative">
            <select
              value={sort}
              onChange={(event) => setSort(event.target.value as SortKey)}
              aria-label="Sort leads"
              className="h-8 appearance-none rounded-lg border border-line bg-surface-2 pl-2.5 pr-7 text-[11px] font-medium text-muted focus:outline-none"
            >
              <option value="score">Sort: AI score</option>
              <option value="value">Sort: value</option>
              <option value="name">Sort: name</option>
            </select>
            <ChevronDown size={12} className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-faint" />
          </div>
        </div>
      </div>

      <div className="card mt-4 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] border-collapse">
            <thead>
              <tr className="border-b border-line bg-surface-2/50">
                {["Lead", "Company", "Stage", "Source", "AI score", "Value", "Owner", ""].map((label, index) => (
                  <th
                    key={`${label}-${index}`}
                    className={cn(
                      "px-4 py-2.5 text-left font-mono text-[9px] font-medium uppercase tracking-[0.12em] text-faint",
                      index === 0 && "pl-5",
                      (index === 5 || index === 6) && "text-right",
                    )}
                  >
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((lead) => {
                const owner = teamById(lead.ownerId);
                const status = leadStatusStyles[lead.status];
                return (
                  <tr
                    key={lead.id}
                    onClick={() => setSelectedId(lead.id)}
                    className="group cursor-pointer border-b border-line transition-colors last:border-0 hover:bg-surface-2/60"
                  >
                    <td className="py-3 pl-5 pr-3">
                      <div className="flex items-center gap-2.5">
                        <Avatar name={lead.name} tone={owner.tone} size="md" />
                        <div className="min-w-0">
                          <div className="truncate text-[12px] font-medium text-ink">{lead.name}</div>
                          <div className="truncate text-[10px] text-faint">{lead.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-[11.5px] font-medium text-ink">{lead.company}</div>
                      <div className="text-[10px] text-faint">{lead.role}</div>
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={status.tone} dot>
                        {status.label}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-[10.5px] text-muted">
                        <SourceLabel source={lead.source} />
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="h-1 w-14 overflow-hidden rounded-full bg-surface-3">
                          <div
                            className={cn(
                              "h-full rounded-full",
                              lead.score >= 85 ? "bg-success" : lead.score >= 65 ? "bg-warning" : "bg-line-strong",
                            )}
                            style={{ width: `${lead.score}%` }}
                          />
                        </div>
                        <span className="font-mono text-[10.5px] text-muted">{lead.score}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-[11.5px] text-ink">{moneyCompact(lead.value)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-2">
                        {lead.whatsappLink && (
                          <a
                            href={lead.whatsappLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="inline-flex size-7 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-500 transition-colors hover:bg-emerald-500 hover:text-white"
                            title="Chat langsung di WhatsApp"
                          >
                            <Phone size={12} />
                          </a>
                        )}
                        <Avatar name={owner.name} tone={owner.tone} size="xs" />
                      </div>
                    </td>
                    <td className="py-3 pl-2 pr-4">
                      <ChevronRight
                        size={14}
                        className="text-faint transition-transform group-hover:translate-x-0.5 group-hover:text-muted"
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {filtered.length === 0 && (
          <div className="flex flex-col items-center gap-1.5 px-6 py-14 text-center">
            <span className="grid size-10 place-items-center rounded-xl bg-surface-3 text-faint">
              <Users size={18} />
            </span>
            <p className="mt-1 text-sm font-medium text-ink">No leads found</p>
            <p className="text-xs text-muted">Try a different search or clear your filters.</p>
          </div>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 px-1 text-[10.5px] text-faint">
        <span>
          Showing {filtered.length} of {leads.length} leads · Demo dataset, scores are estimates
        </span>
        <span className="flex items-center gap-2">
          <Badge tone="success" dot>
            {hotLeads} hot
          </Badge>
          <Badge tone="warning" dot>
            {counts.nurturing} nurturing
          </Badge>
        </span>
      </div>

      {selectedLead && <LeadDrawer key={selectedLead.id} lead={selectedLead} onClose={() => setSelectedId(null)} />}
      {addOpen && (
        <AddLeadModal
          onClose={() => setAddOpen(false)}
          onSubmit={(lead) => addLead(lead)}
        />
      )}
    </div>
  );
}
