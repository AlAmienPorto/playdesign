import { AlertTriangle, CheckCircle2, Loader2, RefreshCw, X } from "lucide-react";
import { useStore } from "../../lib/store";

export function SyncBanner() {
  const { sync, refresh, clearSyncError } = useStore();

  if (sync.status === "demo") return null;

  if (sync.error) {
    return (
      <div className="border-b border-warning/20 bg-warning-soft px-4 py-1.5 text-[10px] text-warning md:px-6 lg:px-8">
        <div className="mx-auto flex max-w-[1520px] items-center gap-2">
          <AlertTriangle size={11} className="shrink-0" />
          <span className="min-w-0 flex-1 truncate">{sync.error}</span>
          <button
            onClick={clearSyncError}
            className="shrink-0 rounded p-0.5 hover:bg-warning/10"
            aria-label="Dismiss sync error"
          >
            <X size={11} />
          </button>
        </div>
      </div>
    );
  }

  if (sync.status === "syncing") {
    return (
      <div className="border-b border-line bg-surface-2/60 px-4 py-1.5 text-[10px] text-muted md:px-6 lg:px-8">
        <div className="mx-auto flex max-w-[1520px] items-center gap-2">
          <Loader2 size={11} className="animate-spin" />
          <span>Connecting to the workspace API…</span>
        </div>
      </div>
    );
  }

  if (sync.status === "error") {
    return (
      <div className="border-b border-warning/20 bg-warning-soft px-4 py-1.5 text-[10px] text-warning md:px-6 lg:px-8">
        <div className="mx-auto flex max-w-[1520px] items-center gap-2">
          <AlertTriangle size={11} className="shrink-0" />
          <span className="min-w-0 flex-1 truncate">{sync.message ?? "The workspace API is unreachable."}</span>
          <button
            onClick={() => void refresh()}
            className="inline-flex shrink-0 items-center gap-1 font-medium hover:underline"
          >
            <RefreshCw size={10} /> Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="border-b border-line bg-surface-2/60 px-4 py-1.5 text-[10px] text-muted md:px-6 lg:px-8">
      <div className="mx-auto flex max-w-[1520px] items-center gap-2">
        <CheckCircle2 size={11} className="text-success" />
        <span>Live workspace API — tasks, approvals and runs are read from D1.</span>
        <button
          onClick={() => void refresh()}
          className="ml-auto inline-flex items-center gap-1 font-medium text-muted hover:text-ink"
        >
          <RefreshCw size={10} /> Refresh
        </button>
      </div>
    </div>
  );
}
