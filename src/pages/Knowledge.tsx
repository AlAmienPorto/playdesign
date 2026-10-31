import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Archive,
  BookOpen,
  ChevronDown,
  FileText,
  Lock,
  Plus,
  Search,
  Sparkles,
  X,
} from "lucide-react";
import {
  DOC_ACCESS_META,
  type DocAccess,
  type KnowledgeDoc,
} from "../data/business";
import { useStore } from "../lib/store";
import { cn } from "../lib/utils";
import {
  Badge,
  Button,
  Drawer,
  Field,
  IconButton,
  inputClass,
  Modal,
  PageHeader,
  Segmented,
  Toggle,
} from "../components/ui";

type KnowledgeFilter = "active" | "archived" | "all";

function AddDocModal({ onClose }: { onClose: () => void }) {
  const { workspace, projects, addKnowledgeDoc } = useStore();
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("Operations");
  const [summary, setSummary] = useState("");
  const [body, setBody] = useState("");
  const [source, setSource] = useState("");
  const [access, setAccess] = useState<DocAccess>("workspace");
  const [projectId, setProjectId] = useState("");
  const [error, setError] = useState("");

  const submit = () => {
    if (!title.trim()) {
      setError("Give the document a title.");
      return;
    }
    if (!source.trim()) {
      setError("A source is required — the agent will not retrieve unsourced documents.");
      return;
    }
    addKnowledgeDoc({
      title,
      category,
      summary,
      body,
      source,
      access,
      projectId: projectId || undefined,
    });
    onClose();
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="New knowledge document"
      description={`Documents are scoped to ${workspace.name}. A source is mandatory before anything is retrievable.`}
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" form="knowledge-form">Add document</Button>
        </>
      }
    >
      <form
        id="knowledge-form"
        className="grid gap-4 sm:grid-cols-2"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        {error && (
          <p className="sm:col-span-2 rounded-lg border border-warning/30 bg-warning-soft px-3 py-2 text-[11px] text-warning">
            {error}
          </p>
        )}
        <Field label="Title">
          <input value={title} onChange={(event) => setTitle(event.target.value)} className={inputClass} required autoFocus />
        </Field>
        <Field label="Category">
          <input value={category} onChange={(event) => setCategory(event.target.value)} className={inputClass} />
        </Field>
        <Field label="Source" className="sm:col-span-2" hint="Where this knowledge comes from">
          <input value={source} onChange={(event) => setSource(event.target.value)} className={inputClass} placeholder="e.g. Client brief · approved scope" required />
        </Field>
        <Field label="Summary" className="sm:col-span-2">
          <input value={summary} onChange={(event) => setSummary(event.target.value)} className={inputClass} placeholder="One sentence the agent can cite." />
        </Field>
        <Field label="Body" className="sm:col-span-2">
          <textarea value={body} onChange={(event) => setBody(event.target.value)} rows={5} className={cn(inputClass, "resize-none")} placeholder="Facts, decisions and constraints. Keep claims traceable to the source." />
        </Field>
        <Field label="Access">
          <select value={access} onChange={(event) => setAccess(event.target.value as DocAccess)} className={inputClass}>
            {(Object.keys(DOC_ACCESS_META) as DocAccess[]).map((key) => (
              <option key={key} value={key}>{DOC_ACCESS_META[key].label}</option>
            ))}
          </select>
        </Field>
        <Field label="Project" hint="Optional">
          <select value={projectId} onChange={(event) => setProjectId(event.target.value)} className={inputClass}>
            <option value="">No project</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>{project.name}</option>
            ))}
          </select>
        </Field>
      </form>
    </Modal>
  );
}

function DocDrawer({ doc, onClose }: { doc: KnowledgeDoc; onClose: () => void }) {
  const { agents, projects, toggleDocAgentAccess, archiveKnowledgeDoc } = useStore();
  const access = DOC_ACCESS_META[doc.access];
  const project = projects.find((entry) => entry.id === doc.projectId);
  const agentOn = doc.access === "agent";
  const ownerLocked = doc.access === "owner";
  const [flash, setFlash] = useState("");

  const notify = (text: string) => {
    setFlash(text);
    window.setTimeout(() => setFlash(""), 2600);
  };

  return (
    <Drawer open onClose={onClose} title="Knowledge document">
      <div className="sticky top-0 z-10 flex items-center justify-between border-b border-line bg-surface/95 px-5 py-3.5 backdrop-blur">
        <span className="overline">Knowledge</span>
        <IconButton label="Close document" onClick={onClose}>
          <X size={16} />
        </IconButton>
      </div>

      <div className="px-5 py-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-[17px] font-semibold tracking-tight text-ink">{doc.title}</h2>
            <p className="mt-0.5 text-[11px] text-muted">{doc.category} · updated {doc.updatedAt}</p>
          </div>
          <Badge tone={doc.status === "active" ? "success" : "neutral"} dot={doc.status === "active"}>
            {doc.status === "active" ? "Active" : "Archived"}
          </Badge>
        </div>

        {flash && (
          <p className="mt-3 rounded-lg border border-success/25 bg-success-soft px-3 py-2 text-[10.5px] text-success">
            {flash}
          </p>
        )}

        <div className="mt-4 rounded-xl border border-line bg-surface-2/50 p-3.5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-1.5 text-[11.5px] font-medium text-ink">
                <Sparkles size={13} className="text-accent-text" /> Agent retrieval
              </div>
              <p className="mt-1 text-[10px] leading-relaxed text-faint">
                {ownerLocked
                  ? "Locked. Owner-only documents can never be retrieved by agents."
                  : agentOn
                    ? `Allowed for ${doc.agentIds.length} agent${doc.agentIds.length === 1 ? "" : "s"}. The agent cites the source when it answers.`
                    : "Blocked. The agent cannot retrieve this document."}
              </p>
            </div>
            <Toggle
              checked={agentOn}
              disabled={ownerLocked}
              onChange={() => {
                const result = toggleDocAgentAccess(doc.id);
                notify(result.ok ? (agentOn ? "Agent access removed." : "Agent access granted.") : result.error ?? "Could not change access.");
              }}
              label={ownerLocked ? "Owner-only documents cannot allow agent access" : "Toggle agent access"}
            />
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <div className="rounded-xl border border-line p-3">
            <div className="text-[9.5px] uppercase tracking-[0.08em] text-faint">Access</div>
            <div className="mt-1"><Badge tone={access.tone}>{access.label}</Badge></div>
          </div>
          <div className="rounded-xl border border-line p-3">
            <div className="text-[9.5px] uppercase tracking-[0.08em] text-faint">Project</div>
            <div className="mt-1 text-[11px] font-medium text-ink">{project?.name ?? "Workspace-wide"}</div>
          </div>
        </div>

        <div className="mt-4">
          <div className="overline mb-2">Source</div>
          <div className="flex items-center gap-2 rounded-lg border border-line px-2.5 py-2 text-[11px] text-muted">
            <FileText size={13} className="shrink-0 text-faint" /> {doc.source}
          </div>
          <p className="mt-1 text-[9px] text-faint">Unverified sources are labelled. The agent must not present them as confirmed.</p>
        </div>

        {doc.summary && (
          <div className="mt-4">
            <div className="overline mb-2">Summary</div>
            <p className="rounded-lg bg-surface-2/60 px-3 py-2.5 text-[11.5px] leading-relaxed text-ink">{doc.summary}</p>
          </div>
        )}

        <div className="mt-4">
          <div className="overline mb-2">Body</div>
          <p className="whitespace-pre-line text-[11.5px] leading-relaxed text-muted">{doc.body || "No body captured yet."}</p>
        </div>

        <div className="mt-4">
          <div className="overline mb-2">Agent access</div>
          <div className="flex flex-wrap gap-1.5">
            {agents.map((agent) => {
              const allowed = doc.agentIds.includes(agent.id) && agentOn;
              return (
                <span
                  key={agent.id}
                  className={cn(
                    "rounded-md border px-2 py-1 text-[9.5px] font-medium",
                    allowed ? "border-accent/30 bg-accent-soft text-accent-text" : "border-line text-faint",
                  )}
                >
                  {agent.name}
                </span>
              );
            })}
          </div>
          <p className="mt-1.5 text-[9px] text-faint">Agent access never includes Finance or owner-only documents.</p>
        </div>

        <div className="mt-5 flex gap-2">
          <Button
            variant="outline"
            size="sm"
            className="flex-1"
            onClick={() => {
              const result = archiveKnowledgeDoc(doc.id, doc.status === "active");
              notify(result.ok ? (doc.status === "active" ? "Document archived." : "Document restored.") : result.error ?? "Could not update.");
            }}
            disabled={doc.access === "owner"}
          >
            <Archive size={12} /> {doc.status === "active" ? "Archive document" : "Restore document"}
          </Button>
          <div className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-dashed border-line px-2 text-[9px] text-faint">
            <Lock size={10} /> {doc.chunks} chunks indexed
          </div>
        </div>
      </div>
    </Drawer>
  );
}

export default function Knowledge() {
  const { knowledgeDocs, agents, workspace } = useStore();
  const [params, setParams] = useSearchParams();
  const [filter, setFilter] = useState<KnowledgeFilter>("active");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = knowledgeDocs.find((doc) => doc.id === (params.get("doc") ?? selectedId)) ?? null;
  const [addOpen, setAddOpen] = useState(false);

  const closeDoc = () => {
    setSelectedId(null);
    if (params.get("doc")) setParams({});
  };

  const categories = useMemo(
    () => Array.from(new Set(knowledgeDocs.map((doc) => doc.category))).sort(),
    [knowledgeDocs],
  );

  const rows = useMemo(() => {
    const search = query.trim().toLowerCase();
    return knowledgeDocs
      .filter((doc) => {
        if (filter !== "all" && doc.status !== filter) return false;
        if (category !== "all" && doc.category !== category) return false;
        if (!search) return true;
        return `${doc.title} ${doc.category} ${doc.summary} ${doc.source}`.toLowerCase().includes(search);
      })
      .sort((a, b) => a.title.localeCompare(b.title));
  }, [knowledgeDocs, filter, category, query]);

  const agentDocs = knowledgeDocs.filter((doc) => doc.access === "agent" && doc.status === "active").length;
  const ownerDocs = knowledgeDocs.filter((doc) => doc.access === "owner").length;
  const archived = knowledgeDocs.filter((doc) => doc.status === "archived").length;

  return (
    <div>
      <PageHeader
        eyebrow="Intelligence"
        title="Knowledge"
        description={`The source of truth for ${workspace.name}. Only active, sourced documents with agent access are retrievable by ${agents[0]?.name ?? "the agent"}.`}
      >
        <Button variant="primary" onClick={() => setAddOpen(true)}>
          <Plus size={15} /> New document
        </Button>
      </PageHeader>

      <div className="grid grid-cols-2 gap-3.5 xl:grid-cols-4">
        {[
          { label: "Documents", value: String(knowledgeDocs.filter((doc) => doc.status === "active").length), note: "Active", icon: BookOpen, className: "bg-info-soft text-info" },
          { label: "Agent-enabled", value: String(agentDocs), note: "Retrievable", icon: Sparkles, className: "bg-accent-soft text-accent-text" },
          { label: "Owner-only", value: String(ownerDocs), note: "Never retrieved", icon: Lock, className: "bg-warning-soft text-warning" },
          { label: "Archived", value: String(archived), note: "Excluded", icon: Archive, className: "bg-surface-3 text-muted" },
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
            placeholder="Search documents, sources or summaries…"
            className="h-9 w-full rounded-[9px] border border-line bg-surface-2 pl-8 pr-3 text-[12px] text-ink placeholder:text-faint transition-colors focus:border-accent/40 focus:bg-surface focus:outline-none focus:ring-2 focus:ring-accent/10"
          />
        </div>
        <Segmented<KnowledgeFilter>
          value={filter}
          onChange={setFilter}
          size="sm"
          options={[
            { value: "active", label: "Active", count: knowledgeDocs.filter((doc) => doc.status === "active").length },
            { value: "archived", label: "Archived", count: archived },
            { value: "all", label: "All", count: knowledgeDocs.length },
          ]}
        />
        <div className="relative lg:ml-auto">
          <select
            value={category}
            onChange={(event) => setCategory(event.target.value)}
            aria-label="Filter by category"
            className="h-8 appearance-none rounded-lg border border-line bg-surface-2 pl-2.5 pr-7 text-[11px] font-medium text-muted focus:outline-none"
          >
            <option value="all">All categories</option>
            {categories.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
          <ChevronDown size={12} className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-faint" />
        </div>
      </div>

      <div className="card mt-4 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[840px] border-collapse">
            <thead>
              <tr className="border-b border-line bg-surface-2/50">
                {["Document", "Category", "Access", "Source", "Updated", "Agent"].map((label, index) => (
                  <th
                    key={label}
                    className={cn(
                      "px-4 py-2.5 text-left font-mono text-[9px] font-medium uppercase tracking-[0.12em] text-faint",
                      index === 0 && "pl-5",
                      index === 5 && "text-right",
                    )}
                  >
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((doc) => {
                const access = DOC_ACCESS_META[doc.access];
                return (
                  <tr
                    key={doc.id}
                    onClick={() => setSelectedId(doc.id)}
                    className="group cursor-pointer border-b border-line transition-colors last:border-0 hover:bg-surface-2/60"
                  >
                    <td className="py-3 pl-5 pr-3">
                      <div className="flex items-center gap-2.5">
                        <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-surface-3 text-muted">
                          <FileText size={13} />
                        </span>
                        <div className="min-w-0">
                          <div className={cn("truncate text-[12px] font-medium", doc.status === "active" ? "text-ink" : "text-faint line-through")}>
                            {doc.title}
                          </div>
                          <div className="truncate text-[9.5px] text-faint">{doc.summary}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 text-[10.5px] text-muted">{doc.category}</td>
                    <td className="px-4"><Badge tone={access.tone}>{access.label}</Badge></td>
                    <td className="max-w-[200px] truncate px-4 text-[10px] text-faint">{doc.source}</td>
                    <td className="px-4 font-mono text-[9.5px] text-faint">{doc.updatedAt}</td>
                    <td className="pr-4 text-right">
                      <span className={cn("font-mono text-[9px] uppercase tracking-[0.08em]", doc.access === "agent" ? "text-success" : "text-faint")}>
                        {doc.access === "agent" ? "Allowed" : "Blocked"}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {rows.length === 0 && (
          <div className="px-5 py-10 text-center text-[12px] text-faint">No documents match this filter.</div>
        )}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line bg-surface-2/40 px-4 py-2.5 text-[9.5px] text-faint">
          <span>Owner-only and archived documents are never retrieved by agents.</span>
          <span className="font-mono">{rows.length} documents</span>
        </div>
      </div>

      <p className="mt-3 text-[9.5px] text-faint">
        Knowledge is seeded demo content. In production, retrieval is scoped by workspace and project, and every agent
        answer cites its source.
      </p>

      {selected && <DocDrawer doc={selected} onClose={closeDoc} />}
      {addOpen && <AddDocModal onClose={() => setAddOpen(false)} />}
    </div>
  );
}
