import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  ArrowUpRight,
  Building2,
  ChevronDown,
  FolderKanban,
  Mail,
  MapPin,
  Phone,
  Plus,
  Search,
  ShieldCheck,
  X,
} from "lucide-react";
import {
  CLIENT_STATUS_META,
  PROJECT_STATUS_META,
  clientProjects,
  projectProgress,
  type Client,
  type ClientStatus,
} from "../data/business";
import { teamById } from "../data/mock";
import { useStore } from "../lib/store";
import { cn, dueMeta, formatDay, money, moneyCompact } from "../lib/utils";
import {
  Avatar,
  Badge,
  Button,
  Drawer,
  Field,
  IconButton,
  inputClass,
  Modal,
  PageHeader,
  ProgressBar,
  Segmented,
  Toggle,
} from "../components/ui";

type ClientFilter = "all" | ClientStatus;

function AddClientModal({
  onClose,
  onSubmit,
}: {
  onClose: () => void;
  onSubmit: (input: { name: string; company: string; email: string; industry: string; notes: string }) => { ok: boolean; error?: string };
}) {
  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [email, setEmail] = useState("");
  const [industry, setIndustry] = useState("Design");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");

  return (
    <Modal
      open
      onClose={onClose}
      title="Add client"
      description="Clients are created here directly. Portal access stays off until an owner enables it."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            type="submit"
            form="client-form"
          >
            Add client
          </Button>
        </>
      }
    >
      <form
        id="client-form"
        className="grid gap-4 sm:grid-cols-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (!name.trim()) return;
          const result = onSubmit({ name, company, email, industry, notes });
          if (!result.ok) {
            setError(result.error ?? "The client could not be created.");
            return;
          }
          onClose();
        }}
      >
        {error && (
          <p className="sm:col-span-2 rounded-lg border border-warning/30 bg-warning-soft px-3 py-2 text-[11px] text-warning">
            {error}
          </p>
        )}
        <Field label="Contact name">
          <input value={name} onChange={(event) => setName(event.target.value)} className={inputClass} required autoFocus placeholder="e.g. Clara Moreau" />
        </Field>
        <Field label="Company">
          <input value={company} onChange={(event) => setCompany(event.target.value)} className={inputClass} placeholder="Company name" />
        </Field>
        <Field label="Email">
          <input value={email} onChange={(event) => setEmail(event.target.value)} type="email" className={inputClass} placeholder="name@company.com" />
        </Field>
        <Field label="Industry">
          <input value={industry} onChange={(event) => setIndustry(event.target.value)} className={inputClass} />
        </Field>
        <Field label="Notes" className="sm:col-span-2">
          <textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={3} className={cn(inputClass, "resize-none")} placeholder="Context the team should know before the kickoff." />
        </Field>
      </form>
    </Modal>
  );
}

function ClientDrawer({ client, onClose }: { client: Client; onClose: () => void }) {
  const { projects, tasks, transactions, workspace } = useStore();
  const owner = teamById(client.ownerId);
  const status = CLIENT_STATUS_META[client.status];
  const linkedProjects = clientProjects(projects, client.id);
  const activeProjects = linkedProjects.filter((project) => project.status === "active" || project.status === "review");
  const clientIncome = transactions
    .filter((entry) => entry.clientId === client.id && entry.type === "income" && entry.status === "posted")
    .reduce((sum, entry) => sum + entry.amount, 0);
  const lifetime = linkedProjects.reduce((sum, project) => sum + project.budget, 0);
  const openTasks = linkedProjects.flatMap((project) =>
    tasks.filter((task) => task.project === project.name && task.status !== "done"),
  );
  const [portalPreview, setPortalPreview] = useState(client.portalEnabled);

  return (
    <Drawer open onClose={onClose} title="Client 360">
      <div className="sticky top-0 z-10 flex items-center justify-between border-b border-line bg-surface/95 px-5 py-3.5 backdrop-blur">
        <span className="overline">Client 360</span>
        <IconButton label="Close client" onClick={onClose}>
          <X size={16} />
        </IconButton>
      </div>

      <div className="px-5 py-5">
        <div className="flex items-start gap-3.5">
          <Avatar name={client.name} tone={owner.tone} size="xl" />
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-[18px] font-semibold tracking-tight text-ink">{client.name}</h2>
            <p className="mt-0.5 text-[12px] text-muted">
              {client.company} · {client.industry}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Badge tone={status.tone} dot>
                {status.label}
              </Badge>
              <Badge tone={client.portalEnabled ? "info" : "neutral"}>{client.portalEnabled ? "Portal on" : "Portal off"}</Badge>
              <span className="text-[10px] text-faint">Since {formatDay(client.since, "MMM yyyy")}</span>
            </div>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <div className="rounded-xl border border-line p-3">
            <div className="text-[9.5px] uppercase tracking-[0.08em] text-faint">Collected</div>
            <div className="mt-1 font-mono text-[16px] font-medium text-ink">{money(clientIncome)}</div>
            <div className="mt-0.5 text-[9px] text-faint">Posted income only</div>
          </div>
          <div className="rounded-xl border border-line p-3">
            <div className="text-[9.5px] uppercase tracking-[0.08em] text-faint">Contract value</div>
            <div className="mt-1 font-mono text-[16px] font-medium text-ink">{money(lifetime)}</div>
            <div className="mt-0.5 text-[9px] text-faint">Sum of project budgets</div>
          </div>
        </div>

        <div className="mt-5">
          <div className="overline mb-2">Contact</div>
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-[11.5px] text-muted">
              <Mail size={13} className="text-faint" /> {client.email}
            </div>
            <div className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-[11.5px] text-muted">
              <Phone size={13} className="text-faint" /> {client.phone}
            </div>
            <div className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-[11.5px] text-muted">
              <MapPin size={13} className="text-faint" /> {client.address}
            </div>
          </div>
        </div>

        <div className="mt-5">
          <div className="mb-2 flex items-center justify-between">
            <span className="overline">Projects</span>
            <span className="font-mono text-[9px] text-faint">{linkedProjects.length} total</span>
          </div>
          <div className="space-y-2">
            {linkedProjects.length === 0 && (
              <p className="rounded-lg border border-dashed border-line px-3 py-3 text-[11px] text-faint">
                No projects yet. Create one from the Projects page or from a won deal.
              </p>
            )}
            {linkedProjects.map((project) => {
              const meta = PROJECT_STATUS_META[project.status];
              const progress = projectProgress(project.id, projects, tasks);
              return (
                <Link
                  key={project.id}
                  to={`/projects?project=${project.id}`}
                  onClick={onClose}
                  className="block rounded-xl border border-line px-3 py-2.5 transition-colors hover:bg-surface-2/60"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-[12px] font-medium text-ink">{project.name}</span>
                    <Badge tone={meta.tone}>{meta.label}</Badge>
                  </div>
                  <div className="mt-1 flex items-center justify-between text-[9.5px] text-faint">
                    <span>Due {dueMeta(project.deadline).label}</span>
                    <span>{progress}%</span>
                  </div>
                  <ProgressBar value={progress} className="mt-1.5" tone={progress >= 75 ? "success" : progress >= 40 ? "warning" : "accent"} />
                </Link>
              );
            })}
          </div>
        </div>

        <div className="mt-5 rounded-xl border border-line bg-surface-2/50 p-3.5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-1.5 text-[11.5px] font-medium text-ink">
                <ShieldCheck size={13} className="text-accent-text" /> Client portal preview
              </div>
              <p className="mt-1 text-[10px] leading-relaxed text-faint">
                {portalPreview
                  ? `${client.name.split(" ")[0]} would see ${activeProjects.length} active project${activeProjects.length === 1 ? "" : "s"}, ${openTasks.length} open task${openTasks.length === 1 ? "" : "s"} and their own assets. Never internal notes, finance or other clients.`
                  : "Portal access is off. Nothing is shared until the owner enables it."}
              </p>
            </div>
            <Toggle checked={portalPreview} onChange={setPortalPreview} label="Preview portal scope" />
          </div>
        </div>

        <div className="mt-5">
          <div className="overline mb-2">Owner notes</div>
          <p className="text-[11.5px] leading-relaxed text-muted">{client.notes}</p>
        </div>

        <div className="mt-5 rounded-xl border border-dashed border-line px-3.5 py-3 text-[10px] leading-relaxed text-faint">
          Client data is scoped to {workspace.name}. Portal visibility is a preview only in this demo — no login or
          sharing link is created.
        </div>
      </div>
    </Drawer>
  );
}

export default function Clients() {
  const { clients, projects, tasks, transactions, workspace, addClient } = useStore();
  const [params, setParams] = useSearchParams();
  const [filter, setFilter] = useState<ClientFilter>("all");
  const [query, setQuery] = useState("");
  const [localSelectedId, setLocalSelectedId] = useState<string | null>(null);
  const selectedId = params.get("client") ?? localSelectedId;
  const [addOpen, setAddOpen] = useState(false);
  const [created, setCreated] = useState("");

  const closeClient = () => {
    setLocalSelectedId(null);
    if (params.get("client")) setParams({});
  };

  const rows = useMemo(() => {
    const search = query.trim().toLowerCase();
    return clients
      .filter((client) => {
        if (filter !== "all" && client.status !== filter) return false;
        if (!search) return true;
        return `${client.name} ${client.company} ${client.email} ${client.industry}`.toLowerCase().includes(search);
      })
      .map((client) => {
        const linked = clientProjects(projects, client.id);
        const open = linked.filter((project) => project.status === "active" || project.status === "review" || project.status === "planning");
        const collected = transactions
          .filter((entry) => entry.clientId === client.id && entry.type === "income" && entry.status === "posted")
          .reduce((sum, entry) => sum + entry.amount, 0);
        return { client, open, collected };
      })
      .sort((a, b) => b.collected - a.collected);
  }, [clients, projects, transactions, filter, query]);

  const selected = clients.find((client) => client.id === selectedId) ?? null;
  const active = clients.filter((client) => client.status === "active").length;
  const onboarding = clients.filter((client) => client.status === "onboarding").length;
  const openProjects = projects.filter((project) => project.status === "active" || project.status === "review").length;
  const collected = transactions
    .filter((entry) => entry.type === "income" && entry.status === "posted")
    .reduce((sum, entry) => sum + entry.amount, 0);

  const counts = {
    all: clients.length,
    active,
    onboarding,
    paused: clients.filter((client) => client.status === "paused").length,
    past: clients.filter((client) => client.status === "past").length,
  };

  const addClientRecord = (input: { name: string; company: string; email: string; industry: string; notes: string }) => {
    const result = addClient(input);
    if (!result.ok) return result;
    setCreated(`${input.name} was added to ${workspace.name}.`);
    setFilter("all");
    setQuery("");
    window.setTimeout(() => setCreated(""), 3000);
    return result;
  };

  return (
    <div>
      <PageHeader
        eyebrow="Business"
        title="Clients"
        description={`Every client in ${workspace.name} with their projects, collected value and portal scope. Demo data — no live sync.`}
      >
        <Button variant="primary" onClick={() => setAddOpen(true)}>
          <Plus size={15} /> Add client
        </Button>
      </PageHeader>

      {created && (
        <div className="mb-4 rounded-xl border border-success/25 bg-success-soft/60 px-3.5 py-2.5 text-[11.5px] text-success">
          {created}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3.5 xl:grid-cols-4">
        {[
          { label: "Active clients", value: String(active), note: `${onboarding} onboarding`, icon: Building2, className: "bg-success-soft text-success" },
          { label: "Open projects", value: String(openProjects), note: "Active + review", icon: FolderKanban, className: "bg-info-soft text-info" },
          { label: "Collected", value: moneyCompact(collected), note: "Posted income", icon: ArrowUpRight, className: "bg-accent-soft text-accent-text" },
          { label: "Open tasks", value: String(tasks.filter((task) => task.status !== "done").length), note: "Across clients", icon: ShieldCheck, className: "bg-warning-soft text-warning" },
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
            placeholder="Search clients, companies or industries…"
            className="h-9 w-full rounded-[9px] border border-line bg-surface-2 pl-8 pr-3 text-[12px] text-ink placeholder:text-faint transition-colors focus:border-accent/40 focus:bg-surface focus:outline-none focus:ring-2 focus:ring-accent/10"
          />
        </div>

        <Segmented<ClientFilter>
          value={filter}
          onChange={setFilter}
          size="sm"
          options={[
            { value: "all", label: "All", count: counts.all },
            { value: "active", label: "Active", count: counts.active },
            { value: "onboarding", label: "Onboarding", count: counts.onboarding },
            { value: "paused", label: "Paused", count: counts.paused },
            { value: "past", label: "Past", count: counts.past },
          ]}
        />

        <span className="ml-auto hidden items-center gap-1.5 text-[10px] text-faint lg:flex">
          <ShieldCheck size={12} className="text-success" /> Each client sees only their own records
        </span>
      </div>

      <div className="card mt-4 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[880px] border-collapse">
            <thead>
              <tr className="border-b border-line bg-surface-2/50">
                {["Client", "Company", "Status", "Projects", "Collected", "Owner", "Portal", ""].map((label, index) => (
                  <th
                    key={`${label}-${index}`}
                    className={cn(
                      "px-4 py-2.5 text-left font-mono text-[9px] font-medium uppercase tracking-[0.12em] text-faint",
                      index === 0 && "pl-5",
                      (index === 4 || index === 6) && "text-right",
                    )}
                  >
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(({ client, open, collected: clientCollected }) => {
                const owner = teamById(client.ownerId);
                const status = CLIENT_STATUS_META[client.status];
                return (
                  <tr
                    key={client.id}
                    onClick={() => setLocalSelectedId(client.id)}
                    className="group cursor-pointer border-b border-line transition-colors last:border-0 hover:bg-surface-2/60"
                  >
                    <td className="py-3 pl-5 pr-3">
                      <div className="flex items-center gap-2.5">
                        <Avatar name={client.name} tone={owner.tone} size="md" />
                        <div className="min-w-0">
                          <div className="truncate text-[12px] font-medium text-ink">{client.name}</div>
                          <div className="truncate text-[10px] text-faint">{client.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4">
                      <div className="text-[11.5px] text-ink">{client.company}</div>
                      <div className="text-[9.5px] text-faint">{client.industry}</div>
                    </td>
                    <td className="px-4">
                      <Badge tone={status.tone} dot>
                        {status.label}
                      </Badge>
                    </td>
                    <td className="px-4">
                      <div className="text-[11.5px] text-ink">{open.length} open</div>
                      <div className="text-[9.5px] text-faint">{clientProjects(projects, client.id).length} total</div>
                    </td>
                    <td className="px-4 text-right font-mono text-[11.5px] text-ink">{money(clientCollected)}</td>
                    <td className="px-4">
                      <div className="flex items-center gap-2">
                        <Avatar name={owner.name} tone={owner.tone} size="sm" />
                        <span className="truncate text-[11px] text-muted">{owner.name.split(" ")[0]}</span>
                      </div>
                    </td>
                    <td className="px-4 text-right">
                      <span className={cn("font-mono text-[9px] uppercase tracking-[0.08em]", client.portalEnabled ? "text-success" : "text-faint")}>
                        {client.portalEnabled ? "On" : "Off"}
                      </span>
                    </td>
                    <td className="pr-4 text-right">
                      <span className="text-faint transition-colors group-hover:text-ink">
                        <ArrowUpRight size={14} className="inline" />
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {rows.length === 0 && (
          <div className="px-5 py-10 text-center text-[12px] text-faint">No clients match this filter.</div>
        )}
      </div>

      <div className="mt-3 flex items-center justify-between text-[9.5px] text-faint">
        <span>Contract value comes from project budgets. Collected comes from posted income entries only.</span>
        <div className="relative hidden sm:block">
          <select className="h-7 appearance-none rounded-lg border border-line bg-surface-2 pl-2 pr-6 text-[10px] text-muted focus:outline-none" defaultValue="all" aria-label="Client sort">
            <option value="all">Sort: collected</option>
            <option value="name">Sort: name</option>
          </select>
          <ChevronDown size={11} className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 text-faint" />
        </div>
      </div>

      {selected && <ClientDrawer client={selected} onClose={closeClient} />}
      {addOpen && <AddClientModal onClose={() => setAddOpen(false)} onSubmit={addClientRecord} />}
    </div>
  );
}
