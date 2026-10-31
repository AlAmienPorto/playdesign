import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  ArrowRight,
  Check,
  CheckCircle2,
  Clock3,
  Eye,
  Palette,
  RefreshCw,
  Search,
  Send,
  Upload,
  X,
} from "lucide-react";
import {
  ASSET_STATUS_META,
  type AssetStatus,
  type CreativeAsset,
} from "../data/business";
import { teamById } from "../data/mock";
import { useStore } from "../lib/store";
import { cn } from "../lib/utils";
import {
  Avatar,
  Badge,
  Button,
  Drawer,
  IconButton,
  inputClass,
  PageHeader,
  Segmented,
} from "../components/ui";

type StudioFilter = "all" | AssetStatus;

const flow: AssetStatus[] = ["brief", "production", "internal_review", "client_review", "revision", "approved", "delivered"];

function AssetDrawer({ asset, onClose }: { asset: CreativeAsset; onClose: () => void }) {
  const {
    projects,
    submitAssetForReview,
    sendAssetToClient,
    approveAsset,
    requestAssetRevision,
    addAssetVersion,
  } = useStore();
  const project = projects.find((entry) => entry.id === asset.projectId);
  const meta = ASSET_STATUS_META[asset.status];
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState("");

  const run = (label: string, action: () => { ok: boolean; error?: string }) => {
    setError("");
    setDone("");
    const result = action();
    if (!result.ok) {
      setError(result.error ?? "That action is not available right now.");
      return;
    }
    setDone(label);
    setNote("");
    window.setTimeout(() => setDone(""), 2600);
  };

  return (
    <Drawer open onClose={onClose} title="Asset detail">
      <div className="sticky top-0 z-10 flex items-center justify-between border-b border-line bg-surface/95 px-5 py-3.5 backdrop-blur">
        <span className="overline">Creative asset</span>
        <IconButton label="Close asset" onClick={onClose}>
          <X size={16} />
        </IconButton>
      </div>

      <div className="px-5 py-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-[17px] font-semibold tracking-tight text-ink">{asset.name}</h2>
            <p className="mt-0.5 text-[11px] text-muted">
              {project?.name ?? "No project"} · {asset.type} · v{asset.currentVersion}
            </p>
          </div>
          <Badge tone={meta.tone} dot>
            {meta.label}
          </Badge>
        </div>

        <p className="mt-3 rounded-lg border border-dashed border-line px-3 py-2 text-[10px] leading-relaxed text-faint">
          {asset.fileUrl}. Files stay external in this demo — the studio tracks versions, status and approvals only.
        </p>

        <div className="mt-4">
          <div className="overline mb-2">Lifecycle</div>
          <div className="flex flex-wrap gap-1">
            {flow.map((step) => {
              const active = step === asset.status;
              const passed = flow.indexOf(step) < flow.indexOf(asset.status);
              return (
                <span
                  key={step}
                  className={cn(
                    "rounded-md border px-1.5 py-0.5 font-mono text-[8.5px] uppercase tracking-[0.06em]",
                    active
                      ? "border-accent/40 bg-accent-soft text-accent-text"
                      : passed
                        ? "border-success/25 bg-success-soft text-success"
                        : "border-line text-faint",
                  )}
                >
                  {ASSET_STATUS_META[step].label}
                </span>
              );
            })}
          </div>
        </div>

        {(error || done) && (
          <p
            className={cn(
              "mt-3 rounded-lg px-3 py-2 text-[10.5px]",
              error ? "border border-warning/30 bg-warning-soft text-warning" : "border border-success/25 bg-success-soft text-success",
            )}
          >
            {error || done}
          </p>
        )}

        <div className="mt-4 space-y-2">
          {["brief", "production", "revision"].includes(asset.status) && (
            <Button variant="soft" size="sm" className="w-full" onClick={() => run("Submitted for internal review.", () => submitAssetForReview(asset.id))}>
              <Upload size={13} /> Submit for internal review
            </Button>
          )}
          {asset.status === "internal_review" && (
            <Button variant="primary" size="sm" className="w-full" onClick={() => run("Sent to client review. Nothing else is shared.", () => sendAssetToClient(asset.id))}>
              <Send size={13} /> Send to client review
            </Button>
          )}
          {asset.status === "client_review" && (
            <Button variant="primary" size="sm" className="w-full" onClick={() => run("Client approval recorded.", () => approveAsset(asset.id))}>
              <Check size={13} /> Record client approval
            </Button>
          )}
          {asset.status === "approved" && (
            <div className="rounded-lg border border-success/25 bg-success-soft px-3 py-2 text-[10.5px] text-success">
              Approved. Delivery is a separate step and is not automated.
            </div>
          )}
        </div>

        <div className="mt-4">
          <label className="mb-1.5 block text-[11px] font-medium text-muted">
            {asset.status === "client_review" || asset.status === "internal_review" ? "Revision note" : "New version note"}
          </label>
          <textarea
            value={note}
            onChange={(event) => setNote(event.target.value)}
            rows={2}
            className={cn(inputClass, "resize-none text-[11.5px]")}
            placeholder="What changed, or what the client asked for…"
          />
          <div className="mt-2 flex gap-2">
            <Button
              variant="outline"
              size="sm"
              className="flex-1"
              onClick={() => run("Revision requested and logged.", () => requestAssetRevision(asset.id, note))}
            >
              <RefreshCw size={12} /> Request revision
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="flex-1"
              onClick={() => run("New version logged.", () => addAssetVersion(asset.id, note))}
            >
              <Upload size={12} /> Add version
            </Button>
          </div>
          <p className="mt-1.5 text-[9px] text-faint">Versions are never deleted. Revision requires a note.</p>
        </div>

        <div className="mt-5">
          <div className="overline mb-2">Versions</div>
          <div className="relative space-y-2.5 pl-3">
            <div className="absolute bottom-1 left-[3px] top-1 w-px bg-line" />
            {asset.versions.map((version) => (
              <div key={`${version.version}-${version.at}`} className="relative">
                <span className="absolute -left-3 top-1.5 size-[7px] rounded-full border border-line bg-surface" />
                <div className="rounded-lg border border-line px-2.5 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-medium text-ink">{version.label}</span>
                    <span className="font-mono text-[8.5px] text-faint">{version.at}</span>
                  </div>
                  <p className="mt-0.5 text-[10px] leading-relaxed text-muted">{version.note}</p>
                  <div className="mt-1 flex items-center gap-1.5 text-[8.5px] text-faint">
                    <Avatar name={teamById(version.by).name} tone={teamById(version.by).tone} size="xs" className="size-4 text-[7px]" />
                    {teamById(version.by).name}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-5">
          <div className="overline mb-2">Feedback</div>
          <div className="space-y-2">
            {asset.feedback.map((item) => (
              <div key={item.id} className="rounded-lg border border-line px-2.5 py-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10.5px] font-medium text-ink">{item.author}</span>
                  <Badge tone={item.kind === "client" ? "info" : "neutral"}>{item.kind === "client" ? "Client" : "Internal"}</Badge>
                </div>
                <p className="mt-1 text-[10px] leading-relaxed text-muted">{item.body}</p>
                <div className="mt-0.5 font-mono text-[8.5px] text-faint">{item.time}</div>
              </div>
            ))}
            {asset.feedback.length === 0 && (
              <p className="rounded-lg border border-dashed border-line px-3 py-3 text-[10px] text-faint">No feedback yet.</p>
            )}
          </div>
        </div>
      </div>
    </Drawer>
  );
}

export default function Studio() {
  const { assets, projects, workspace } = useStore();
  const [params, setParams] = useSearchParams();
  const [filter, setFilter] = useState<StudioFilter>("all");
  const [query, setQuery] = useState("");
  const [localSelectedId, setLocalSelectedId] = useState<string | null>(null);
  const selectedId = params.get("asset") ?? localSelectedId;

  const closeAsset = () => {
    setLocalSelectedId(null);
    if (params.get("asset")) setParams({});
  };

  const selected = assets.find((asset) => asset.id === selectedId) ?? null;

  const rows = useMemo(() => {
    const search = query.trim().toLowerCase();
    return assets.filter((asset) => {
      if (filter !== "all" && asset.status !== filter) return false;
      if (!search) return true;
      const project = projects.find((entry) => entry.id === asset.projectId);
      return `${asset.name} ${asset.type} ${project?.name ?? ""}`.toLowerCase().includes(search);
    });
  }, [assets, projects, filter, query]);

  const counts = {
    all: assets.length,
    production: assets.filter((asset) => asset.status === "production").length,
    internal_review: assets.filter((asset) => asset.status === "internal_review").length,
    client_review: assets.filter((asset) => asset.status === "client_review").length,
    revision: assets.filter((asset) => asset.status === "revision").length,
    approved: assets.filter((asset) => asset.status === "approved").length,
  };

  return (
    <div>
      <PageHeader
        eyebrow="Creative"
        title="Studio"
        description={`Versioned creative work for ${workspace.name}. Internal review always precedes client review, and nothing is delivered automatically.`}
      />

      <div className="grid grid-cols-2 gap-3.5 xl:grid-cols-4">
        {[
          { label: "In production", value: String(counts.production), note: "Active work", icon: Palette, className: "bg-info-soft text-info" },
          { label: "Internal review", value: String(counts.internal_review), note: "Team gate", icon: Eye, className: "bg-warning-soft text-warning" },
          { label: "Client review", value: String(counts.client_review), note: "Awaiting client", icon: Clock3, className: "bg-accent-soft text-accent-text" },
          { label: "Revisions", value: String(counts.revision), note: "Changes requested", icon: RefreshCw, className: "bg-warning-soft text-warning" },
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
            placeholder="Search assets, types or projects…"
            className="h-9 w-full rounded-[9px] border border-line bg-surface-2 pl-8 pr-3 text-[12px] text-ink placeholder:text-faint transition-colors focus:border-accent/40 focus:bg-surface focus:outline-none focus:ring-2 focus:ring-accent/10"
          />
        </div>
        <div className="-mx-0.5 max-w-full overflow-x-auto px-0.5">
          <Segmented<StudioFilter>
            value={filter}
            onChange={setFilter}
            size="sm"
            className="w-max"
            options={[
              { value: "all", label: "All", count: counts.all },
              { value: "production", label: "Production", count: counts.production },
              { value: "internal_review", label: "Internal", count: counts.internal_review },
              { value: "client_review", label: "Client", count: counts.client_review },
              { value: "revision", label: "Revision", count: counts.revision },
              { value: "approved", label: "Approved", count: counts.approved },
            ]}
          />
        </div>
        <span className="ml-auto hidden items-center gap-1.5 text-[10px] text-faint lg:flex">
          <CheckCircle2 size={12} className="text-success" /> Internal review is mandatory before client review
        </span>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3.5 md:grid-cols-2 xl:grid-cols-3">
        {rows.map((asset) => {
          const meta = ASSET_STATUS_META[asset.status];
          const project = projects.find((entry) => entry.id === asset.projectId);
          return (
            <button
              key={asset.id}
              onClick={() => setLocalSelectedId(asset.id)}
              className="card group overflow-hidden p-4 text-left transition-shadow hover:shadow-float"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate text-[12.5px] font-semibold text-ink">{asset.name}</div>
                  <div className="mt-0.5 truncate text-[9.5px] text-faint">{project?.name ?? "No project"} · {asset.type}</div>
                </div>
                <Badge tone={meta.tone} dot>
                  {meta.label}
                </Badge>
              </div>

              <div className="mt-3 flex items-center gap-1.5">
                {flow.slice(0, 5).map((step) => {
                  const index = flow.indexOf(step);
                  const current = flow.indexOf(asset.status);
                  return (
                    <span
                      key={step}
                      className={cn(
                        "h-1 flex-1 rounded-full",
                        index < current ? "bg-success/60" : index === current ? "bg-accent" : "bg-surface-3",
                      )}
                    />
                  );
                })}
              </div>

              <div className="mt-3 flex items-center justify-between text-[9.5px]">
                <span className="font-mono text-muted">v{asset.currentVersion} · {asset.versions.length} version{asset.versions.length === 1 ? "" : "s"}</span>
                <span className="text-faint">{asset.updatedAt}</span>
              </div>

              <div className="mt-3 flex items-center justify-between border-t border-line pt-2.5">
                <span className="flex items-center gap-2 text-[9px] text-faint">
                  <span className="flex items-center gap-0.5"><Eye size={10} /> {asset.feedback.length} feedback</span>
                  <span className="flex items-center gap-0.5"><ArrowRight size={10} /> {asset.fileUrl.startsWith("Brief") ? "No file yet" : "External file"}</span>
                </span>
                <span className="text-faint transition-colors group-hover:text-accent-text">
                  <ArrowRight size={13} />
                </span>
              </div>
            </button>
          );
        })}
      </div>

      {rows.length === 0 && (
        <div className="card mt-4 px-5 py-10 text-center text-[12px] text-faint">No assets match this filter.</div>
      )}

      <p className="mt-3 text-[9.5px] text-faint">
        Version history is append-only. Approving an asset records the client decision but does not publish or send files.
      </p>

      {selected && <AssetDrawer asset={selected} onClose={closeAsset} />}
    </div>
  );
}
