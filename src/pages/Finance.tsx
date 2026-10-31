import { useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Plus,
  Receipt,
  RotateCcw,
  Search,
  ShieldCheck,
  Wallet,
} from "lucide-react";
import { FINANCE_CATEGORIES, financeSummary, type Transaction } from "../data/business";
import { useStore } from "../lib/store";
import { cn, dateAt, formatDay, money, moneyCompact } from "../lib/utils";
import {
  Badge,
  Button,
  Field,
  inputClass,
  Modal,
  PageHeader,
  Segmented,
} from "../components/ui";

type TypeFilter = "all" | "income" | "expense";

function statusMeta(status: Transaction["status"]) {
  if (status === "posted") return { label: "Posted", tone: "success" as const, dot: true };
  if (status === "reversed") return { label: "Reversed", tone: "neutral" as const, dot: false };
  return { label: "Correction", tone: "neutral" as const, dot: false };
}

function RecordModal({ onClose }: { onClose: () => void }) {
  const { workspace, projects, clients, addTransaction } = useStore();
  const categories = FINANCE_CATEGORIES[workspace.id] ?? FINANCE_CATEGORIES.playdesign;
  const [type, setType] = useState<Transaction["type"]>("income");
  const [category, setCategory] = useState(categories[0]);
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("3500");
  const [date, setDate] = useState(dateAt(0));
  const [method, setMethod] = useState<Transaction["method"]>("Bank transfer");
  const [projectId, setProjectId] = useState("");
  const [clientId, setClientId] = useState("");
  const [reference, setReference] = useState("");
  const [error, setError] = useState("");

  const submit = () => {
    const result = addTransaction({
      type,
      category,
      description,
      amount: Number(amount) || 0,
      date,
      method,
      projectId: projectId || undefined,
      clientId: clientId || undefined,
      reference,
    });
    if (!result.ok) {
      setError(result.error ?? "The transaction could not be recorded.");
      return;
    }
    onClose();
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Record transaction"
      description="Income counts as cash only when it is posted. Reversing keeps the original and logs a correction entry."
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" form="transaction-form">
            Record transaction
          </Button>
        </>
      }
    >
      <form
        id="transaction-form"
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
        <div className="sm:col-span-2">
          <Segmented<Transaction["type"]>
            value={type}
            onChange={setType}
            options={[
              { value: "income", label: "Income" },
              { value: "expense", label: "Expense" },
            ]}
          />
        </div>
        <Field label="Description">
          <input value={description} onChange={(event) => setDescription(event.target.value)} className={inputClass} required autoFocus placeholder="e.g. Northwind milestone 3" />
        </Field>
        <Field label="Amount" hint="USD">
          <input value={amount} onChange={(event) => setAmount(event.target.value)} type="number" min="1" className={inputClass} required />
        </Field>
        <Field label="Category">
          <select value={category} onChange={(event) => setCategory(event.target.value)} className={inputClass}>
            {categories.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
        </Field>
        <Field label="Date">
          <input value={date} onChange={(event) => setDate(event.target.value)} type="date" className={inputClass} />
        </Field>
        <Field label="Method">
          <select value={method} onChange={(event) => setMethod(event.target.value as Transaction["method"])} className={inputClass}>
            {["Bank transfer", "Card", "Cash", "PayPal"].map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
        </Field>
        <Field label="Reference" hint="Optional">
          <input value={reference} onChange={(event) => setReference(event.target.value)} className={inputClass} placeholder="Auto-generated if empty" />
        </Field>
        <Field label="Project" hint="Optional">
          <select value={projectId} onChange={(event) => setProjectId(event.target.value)} className={inputClass}>
            <option value="">No project</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>{project.name}</option>
            ))}
          </select>
        </Field>
        <Field label="Client" hint="Optional">
          <select value={clientId} onChange={(event) => setClientId(event.target.value)} className={inputClass}>
            <option value="">No client</option>
            {clients.map((client) => (
              <option key={client.id} value={client.id}>{client.company}</option>
            ))}
          </select>
        </Field>
      </form>
    </Modal>
  );
}

export default function Finance() {
  const { transactions, workspace, projects, reverseTransaction } = useStore();
  const [filter, setFilter] = useState<TypeFilter>("all");
  const [query, setQuery] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [messageTone, setMessageTone] = useState<"success" | "warning">("success");

  const summary = financeSummary(transactions, workspace.id);

  const rows = useMemo(() => {
    const search = query.trim().toLowerCase();
    return transactions
      .filter((entry) => {
        if (filter !== "all" && entry.type !== filter) return false;
        if (!search) return true;
        return `${entry.description} ${entry.category} ${entry.reference}`.toLowerCase().includes(search);
      })
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [transactions, filter, query]);

  const series = useMemo(() => {
    const sorted = [...transactions]
      .filter((entry) => entry.status === "posted")
      .sort((a, b) => a.date.localeCompare(b.date));
    let running = summary.opening;
    return sorted.map((entry) => {
      running += entry.type === "income" ? entry.amount : -entry.amount;
      return { label: formatDay(entry.date), balance: running };
    });
  }, [transactions, summary.opening]);

  const counts = {
    all: transactions.length,
    income: transactions.filter((entry) => entry.type === "income").length,
    expense: transactions.filter((entry) => entry.type === "expense").length,
  };

  const reverse = (entry: Transaction) => {
    const result = reverseTransaction(entry.id);
    setMessageTone(result.ok ? "success" : "warning");
    setMessage(
      result.ok
        ? `Correction entry created for ${entry.reference}. The original stays in the ledger, and both are excluded from totals.`
        : result.error ?? "The transaction could not be reversed.",
    );
    window.setTimeout(() => setMessage(""), 3200);
  };

  return (
    <div>
      <PageHeader
        eyebrow="Business"
        title="Finance"
        description={`Cash in and out of ${workspace.name}. Net is income minus expense; balance adds the opening balance. Posted entries are corrected, never deleted.`}
      >
        <Button variant="primary" onClick={() => setModalOpen(true)}>
          <Plus size={15} /> Record transaction
        </Button>
      </PageHeader>

      {message && (
        <div
          className={cn(
            "mb-4 rounded-xl border px-3.5 py-2.5 text-[11.5px]",
            messageTone === "success"
              ? "border-success/25 bg-success-soft/60 text-success"
              : "border-warning/30 bg-warning-soft text-warning",
          )}
        >
          {message}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3.5 xl:grid-cols-4">
        {[
          { label: "Income", value: moneyCompact(summary.income), note: "Posted", icon: ArrowDownLeft, className: "bg-success-soft text-success" },
          { label: "Expenses", value: moneyCompact(summary.expense), note: "Posted", icon: ArrowUpRight, className: "bg-warning-soft text-warning" },
          { label: "Net", value: moneyCompact(summary.net), note: "Income − expense", icon: Receipt, className: "bg-info-soft text-info" },
          { label: "Cash balance", value: moneyCompact(summary.balance), note: `Opening ${moneyCompact(summary.opening)}`, icon: Wallet, className: "bg-accent-soft text-accent-text" },
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

      <section className="card mt-4 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3">
          <div>
            <h2 className="text-[13.5px] font-semibold tracking-tight text-ink">Cash balance trend</h2>
            <p className="mt-0.5 text-[10.5px] text-muted">Opening balance plus posted entries, oldest to newest.</p>
          </div>
          <Badge tone="neutral">Demo ledger</Badge>
        </div>
        <div className="h-[190px] px-2 pb-3">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={series} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="finance-balance" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="rgb(var(--accent))" stopOpacity={0.24} />
                  <stop offset="100%" stopColor="rgb(var(--accent))" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--border))" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 9.5, fill: "rgb(var(--fg-faint))" }} axisLine={false} tickLine={false} minTickGap={28} />
              <YAxis tick={{ fontSize: 9.5, fill: "rgb(var(--fg-faint))" }} axisLine={false} tickLine={false} width={46} tickFormatter={(value) => moneyCompact(Number(value))} />
              <Tooltip
                contentStyle={{
                  background: "rgb(var(--surface))",
                  border: "1px solid rgb(var(--border))",
                  borderRadius: 10,
                  boxShadow: "0 16px 40px -16px rgba(0,0,0,0.3)",
                  fontSize: 11,
                  padding: "8px 10px",
                }}
                labelStyle={{ color: "rgb(var(--fg))", fontWeight: 500, marginBottom: 4 }}
                formatter={(value) => [money(Number(value)), "Balance"]}
              />
              <Area type="monotone" dataKey="balance" stroke="rgb(var(--accent))" strokeWidth={1.8} fill="url(#finance-balance)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </section>

      <div className="card mt-4 flex flex-col gap-2.5 p-3 lg:flex-row lg:items-center">
        <div className="relative flex-1 lg:max-w-[280px]">
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search description, category or reference…"
            className="h-9 w-full rounded-[9px] border border-line bg-surface-2 pl-8 pr-3 text-[12px] text-ink placeholder:text-faint transition-colors focus:border-accent/40 focus:bg-surface focus:outline-none focus:ring-2 focus:ring-accent/10"
          />
        </div>
        <Segmented<TypeFilter>
          value={filter}
          onChange={setFilter}
          size="sm"
          options={[
            { value: "all", label: "All", count: counts.all },
            { value: "income", label: "Income", count: counts.income },
            { value: "expense", label: "Expense", count: counts.expense },
          ]}
        />
        <span className="ml-auto hidden items-center gap-1.5 text-[10px] text-faint lg:flex">
          <ShieldCheck size={12} className="text-success" /> Reversed entries stay visible in the ledger
        </span>
      </div>

      <div className="card mt-4 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] border-collapse">
            <thead>
              <tr className="border-b border-line bg-surface-2/50">
                {["Date", "Description", "Category", "Project", "Method", "Amount", "Status", ""].map((label, index) => (
                  <th
                    key={`${label}-${index}`}
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
              {rows.map((entry) => {
                const project = projects.find((item) => item.id === entry.projectId);
                const meta = statusMeta(entry.status);
                return (
                  <tr key={entry.id} className="border-b border-line last:border-0">
                    <td className="py-2.5 pl-5 pr-3 font-mono text-[10px] text-faint">{formatDay(entry.date)}</td>
                    <td className="px-4">
                      <div
                        className={cn(
                          "text-[11.5px] font-medium",
                          entry.status === "reversed" && "text-faint line-through",
                          entry.status === "correction" && "text-muted",
                          entry.status === "posted" && "text-ink",
                        )}
                      >
                        {entry.description}
                      </div>
                      <div className="text-[9px] text-faint">
                        {entry.reference}{entry.status === "correction" ? " · audit trail" : ""}{entry.clientId ? "" : " · unlinked"}
                      </div>
                    </td>
                    <td className="px-4 text-[10.5px] text-muted">{entry.category}</td>
                    <td className="px-4 text-[10px] text-faint">{project?.name ?? "—"}</td>
                    <td className="px-4 text-[10px] text-faint">{entry.method}</td>
                    <td className={cn(
                      "px-4 text-right font-mono text-[11.5px]",
                      entry.status === "reversed" && "text-faint line-through",
                      entry.status === "correction" && "text-faint",
                      entry.status === "posted" && (entry.type === "income" ? "text-success" : "text-ink"),
                    )}>
                      {entry.type === "income" ? "+" : "−"}{money(entry.amount)}
                    </td>
                    <td className="px-4">
                      <Badge tone={meta.tone} dot={meta.dot}>
                        {meta.label}
                      </Badge>
                    </td>
                    <td className="pr-4 text-right">
                      {entry.status === "posted" ? (
                        <button
                          onClick={() => reverse(entry)}
                          className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[9.5px] font-medium text-muted transition-colors hover:bg-surface-3 hover:text-ink"
                          title="Mark as reversed and log a correction entry"
                        >
                          <RotateCcw size={11} /> Reverse
                        </button>
                      ) : (
                        <span className="text-[9px] text-faint">{entry.status === "reversed" ? "Corrected" : "Not counted"}</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {rows.length === 0 && (
          <div className="px-5 py-10 text-center text-[12px] text-faint">No transactions match this filter.</div>
        )}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line bg-surface-2/40 px-4 py-2.5 text-[9.5px] text-faint">
          <span>Reversing keeps the original and logs a REV- correction entry. Neither is deleted, and neither counts toward totals.</span>
          <span className="font-mono">{rows.length} entries shown</span>
        </div>
      </div>

      <div className="mt-3 rounded-xl border border-dashed border-line px-3.5 py-2.5 text-[9.5px] leading-relaxed text-faint">
        This ledger is seeded demo data. In production it is written through the worker API to D1, with every write
        audited. Deal value is not counted as cash.
      </div>

      {modalOpen && <RecordModal onClose={() => setModalOpen(false)} />}
    </div>
  );
}
