import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { id } from "date-fns/locale";
import {
  ArrowRight,
  Bot,
  CalendarDays,
  Check,
  CheckCircle2,
  Clock,
  Compass,
  FileCheck2,
  Layers,
  ListTodo,
  Loader2,
  MessageSquare,
  Play,
  Plus,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { AVAILABILITY_META } from "../data/office";
import { runQcGateApi, type QcGateResult } from "../lib/officeApi";
import { useStore } from "../lib/store";
import { TODAY } from "../lib/utils";
import { AgentAvatar, Badge, Button } from "../components/ui";

export default function Overview() {
  const navigate = useNavigate();
  const { tasks, posts, runs, agents, approvals, workspace } = useStore();

  const [qcRunning, setQcRunning] = useState(false);
  const [qcMessage, setQcMessage] = useState<string | null>(null);

  // Metrik riil langsung dari database
  const activeTasks = tasks.filter((t) => t.status !== "done");
  const pendingApprovals = approvals.length + runs.filter((r) => r.state === "owner_review").length;
  const reviewPosts = posts.filter((p) => p.status === "review" || p.status === "draft");
  const scheduledPosts = posts.filter((p) => p.status === "scheduled");

  const handleRunQc = async () => {
    try {
      setQcRunning(true);
      setQcMessage(null);
      const res: QcGateResult = await runQcGateApi();
      setQcMessage(
        `QC Gate selesai: ${res.posts} postingan diperiksa (${res.passed} lolos ke tinjauan pemilik, ${res.blocked} butuh revisi).`,
      );
    } catch (err) {
      setQcMessage(
        `Gagal menjalankan QC: ${err instanceof Error ? err.message : "Terjadi kesalahan API."}`,
      );
    } finally {
      setQcRunning(false);
    }
  };

  const hour = TODAY.getHours();
  const sapaan = hour < 12 ? "Selamat pagi" : hour < 15 ? "Selamat siang" : hour < 18 ? "Selamat sore" : "Selamat malam";

  return (
    <div className="space-y-6">
      {/* Top Banner / Sapaan Personal */}
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-line pb-5">
        <div>
          <div className="flex items-center gap-2 text-[11px] text-muted">
            <span className="relative flex size-2">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-success opacity-75" />
              <span className="relative inline-flex size-2 rounded-full bg-success" />
            </span>
            <span className="font-mono uppercase tracking-[0.12em] text-ink">
              {format(TODAY, "EEEE, d MMMM yyyy", { locale: id })}
            </span>
            <span className="text-faint">·</span>
            <Badge tone="accent">D1 APAC · Server Aktif</Badge>
          </div>

          <h1 className="mt-2 text-[26px] font-semibold tracking-[-0.03em] text-ink md:text-[30px]">
            {sapaan}, Jawad.
          </h1>
          <p className="mt-1 text-[13px] text-muted">
            Ruang kerja <span className="font-medium text-ink">{workspace.name}</span> aktif.{" "}
            <span className="font-medium text-ink">{agents.length} agen AI siaga</span> dengan sistem SPV-QC dua lapis.
          </p>
        </div>

        {/* Quick Actions Bar */}
        <div className="flex flex-wrap items-center gap-2.5">
          <Button
            variant="outline"
            size="sm"
            onClick={handleRunQc}
            disabled={qcRunning}
            className="border-line-strong hover:bg-surface-2"
          >
            {qcRunning ? (
              <Loader2 size={13} className="animate-spin text-accent-text" />
            ) : (
              <ShieldCheck size={14} className="text-accent-text" />
            )}
            <span>{qcRunning ? "Memeriksa..." : "Jalankan SPV-QC"}</span>
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate("/tasks")}
            className="hover:bg-surface-2"
          >
            <Plus size={14} className="text-muted" />
            <span>Tugas Baru</span>
          </Button>

          <Button
            variant="primary"
            size="sm"
            onClick={() => navigate("/agent")}
            className="shadow-sm"
          >
            <MessageSquare size={14} />
            <span>Buka Chat Agen</span>
          </Button>
        </div>
      </div>

      {/* QC Flash Notification */}
      {qcMessage && (
        <div className="flex items-center justify-between rounded-xl border border-accent/30 bg-accent-soft/40 px-4 py-2.5 text-[12px] text-ink animate-fade-in">
          <div className="flex items-center gap-2">
            <Sparkles size={14} className="text-accent-text shrink-0" />
            <span>{qcMessage}</span>
          </div>
          <button
            onClick={() => setQcMessage(null)}
            className="text-[11px] font-medium text-muted hover:text-ink ml-4"
          >
            Tutup
          </button>
        </div>
      )}

      {/* 4 Kartu Metrik Inti (Ringkas, Nyata, Bersih) */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {/* Tugas Aktif */}
        <div
          onClick={() => navigate("/tasks")}
          className="card group cursor-pointer p-4 transition-all hover:border-line-strong hover:bg-surface-2/40"
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-medium text-muted">Tugas Aktif</span>
            <span className="grid size-7 place-items-center rounded-lg border border-line bg-surface-2 text-faint group-hover:text-ink">
              <ListTodo size={14} />
            </span>
          </div>
          <div className="mt-2.5 flex items-baseline gap-2">
            <span className="font-mono text-[26px] font-semibold tracking-tight text-ink">
              {activeTasks.length}
            </span>
            <span className="text-[11px] text-faint">
              {activeTasks.length === 0 ? "semua tuntas" : "dalam pengerjaan"}
            </span>
          </div>
          <div className="mt-3 flex items-center justify-between border-t border-line/60 pt-2 text-[10.5px] text-muted">
            <span>Daftar tugas studio</span>
            <ArrowRight size={11} className="text-faint group-hover:translate-x-0.5 transition-transform" />
          </div>
        </div>

        {/* Antrean Konten & Jadwal */}
        <div
          onClick={() => navigate("/schedule")}
          className="card group cursor-pointer p-4 transition-all hover:border-line-strong hover:bg-surface-2/40"
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-medium text-muted">Konten &amp; Jadwal</span>
            <span className="grid size-7 place-items-center rounded-lg border border-line bg-surface-2 text-faint group-hover:text-ink">
              <CalendarDays size={14} />
            </span>
          </div>
          <div className="mt-2.5 flex items-baseline gap-2">
            <span className="font-mono text-[26px] font-semibold tracking-tight text-ink">
              {scheduledPosts.length + reviewPosts.length}
            </span>
            <span className="text-[11px] text-faint">
              {scheduledPosts.length} tayang · {reviewPosts.length} draf
            </span>
          </div>
          <div className="mt-3 flex items-center justify-between border-t border-line/60 pt-2 text-[10.5px] text-muted">
            <span>Kalender konten</span>
            <ArrowRight size={11} className="text-faint group-hover:translate-x-0.5 transition-transform" />
          </div>
        </div>

        {/* Armada Agen AI */}
        <div
          onClick={() => navigate("/agent")}
          className="card group cursor-pointer p-4 transition-all hover:border-line-strong hover:bg-surface-2/40"
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-medium text-muted">Armada Agen AI</span>
            <span className="grid size-7 place-items-center rounded-lg border border-line bg-surface-2 text-faint group-hover:text-ink">
              <Bot size={14} />
            </span>
          </div>
          <div className="mt-2.5 flex items-baseline gap-2">
            <span className="font-mono text-[26px] font-semibold tracking-tight text-ink">
              {agents.length}
            </span>
            <span className="text-[11px] text-faint">
              agen siaga dengan skill
            </span>
          </div>
          <div className="mt-3 flex items-center justify-between border-t border-line/60 pt-2 text-[10.5px] text-muted">
            <span>Buka ruang agen</span>
            <ArrowRight size={11} className="text-faint group-hover:translate-x-0.5 transition-transform" />
          </div>
        </div>

        {/* Gerbang Kualitas SPV */}
        <div
          onClick={handleRunQc}
          className="card group cursor-pointer p-4 transition-all hover:border-line-strong hover:bg-surface-2/40"
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-medium text-muted">Gerbang Kualitas SPV</span>
            <span className="grid size-7 place-items-center rounded-lg border border-line bg-surface-2 text-accent-text">
              <ShieldCheck size={14} />
            </span>
          </div>
          <div className="mt-2.5 flex items-baseline gap-2">
            <span className="font-mono text-[26px] font-semibold tracking-tight text-ink">
              2 Lapis
            </span>
            <span className="text-[11px] text-faint">
              08:00 &amp; 08:15 WIB
            </span>
          </div>
          <div className="mt-3 flex items-center justify-between border-t border-line/60 pt-2 text-[10.5px] text-muted">
            <span>Audit harian aktif</span>
            <Sparkles size={11} className="text-accent-text" />
          </div>
        </div>
      </div>

      {/* Alur Kerja Studio Playdesign (Workflow Visual) */}
      <section className="card p-4 md:p-5">
        <div className="flex items-center justify-between mb-3.5">
          <div>
            <h2 className="text-[13.5px] font-semibold tracking-tight text-ink flex items-center gap-2">
              <Layers size={15} className="text-accent-text" />
              Alur Kerja Studio Playdesign
            </h2>
            <p className="text-[11px] text-muted">
              Siklus kerja terintegrasi dari riset, produksi, hingga kurasi kualitas.
            </p>
          </div>
          <span className="text-[10px] font-mono text-faint tracking-wider">ALUR KERJA</span>
        </div>

        <div className="grid grid-cols-1 gap-2.5 md:grid-cols-4">
          {/* Tahap 1 */}
          <div className="relative rounded-xl border border-line bg-surface-2/40 p-3">
            <div className="flex items-center justify-between text-[11px] font-medium text-muted mb-1.5">
              <span className="flex items-center gap-1.5">
                <span className="grid size-4 place-items-center rounded-full bg-surface text-[9px] font-mono text-ink border border-line">1</span>
                Riset &amp; Ideasi
              </span>
              <Compass size={12} className="text-faint" />
            </div>
            <p className="text-[11px] text-faint leading-snug">
              Riset tren visual, kompetitor &amp; ide sudut pandang via <code>agent-reach</code>.
            </p>
            <div className="mt-2 text-[10px] text-accent-text font-medium">
              Agen: Salsabila / Echo
            </div>
          </div>

          {/* Tahap 2 */}
          <div className="relative rounded-xl border border-line bg-surface-2/40 p-3">
            <div className="flex items-center justify-between text-[11px] font-medium text-muted mb-1.5">
              <span className="flex items-center gap-1.5">
                <span className="grid size-4 place-items-center rounded-full bg-surface text-[9px] font-mono text-ink border border-line">2</span>
                Produksi &amp; Desain
              </span>
              <FileCheck2 size={12} className="text-faint" />
            </div>
            <p className="text-[11px] text-faint leading-snug">
              Pengerjaan tugas desain, penulisan narasi, dan penyiapan aset draf.
            </p>
            <div className="mt-2 text-[10px] text-accent-text font-medium">
              Tugas: {activeTasks.length} aktif
            </div>
          </div>

          {/* Tahap 3 */}
          <div className="relative rounded-xl border border-line bg-surface-2/40 p-3">
            <div className="flex items-center justify-between text-[11px] font-medium text-muted mb-1.5">
              <span className="flex items-center gap-1.5">
                <span className="grid size-4 place-items-center rounded-full bg-surface text-[9px] font-mono text-ink border border-line">3</span>
                Gerbang SPV-QC
              </span>
              <ShieldCheck size={12} className="text-accent-text" />
            </div>
            <p className="text-[11px] text-faint leading-snug">
              Penyaringan otomatis anti-slop, validasi klaim, batas tagar &amp; lisensi aset.
            </p>
            <div className="mt-2 text-[10px] text-accent-text font-medium">
              Cron 2 Lapis Otomatis
            </div>
          </div>

          {/* Tahap 4 */}
          <div className="relative rounded-xl border border-line bg-surface-2/40 p-3">
            <div className="flex items-center justify-between text-[11px] font-medium text-muted mb-1.5">
              <span className="flex items-center gap-1.5">
                <span className="grid size-4 place-items-center rounded-full bg-surface text-[9px] font-mono text-ink border border-line">4</span>
                Persetujuan Pemilik
              </span>
              <CheckCircle2 size={12} className="text-success" />
            </div>
            <p className="text-[11px] text-faint leading-snug">
              Validasi final Mas Jawad sebelum postingan dipublikasikan ke klien/sosmed.
            </p>
            <div className="mt-2 text-[10px] text-success font-medium">
              {pendingApprovals} menunggu tindakan
            </div>
          </div>
        </div>
      </section>

      {/* Main Grid: Armada AI (Kiri) + QC & Review (Kanan) */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        {/* Kiri: Armada Agen AI (7 Kolom) */}
        <section className="card p-4 md:p-5 lg:col-span-7 flex flex-col">
          <div className="flex items-center justify-between border-b border-line pb-3.5 mb-4">
            <div>
              <h2 className="text-[14px] font-semibold tracking-tight text-ink flex items-center gap-2">
                <Sparkles size={15} className="text-accent-text" />
                Armada Agen AI Siaga
              </h2>
              <p className="text-[11px] text-muted">
                Daftar agen di ruang kerja {workspace.name} dengan persona dan skill aktif.
              </p>
            </div>
            <Link
              to="/agent"
              className="flex items-center gap-1 text-[11px] font-medium text-muted hover:text-ink transition-colors"
            >
              Lihat semua <ArrowRight size={12} />
            </Link>
          </div>

          <div className="space-y-3 flex-1">
            {agents.map((agent) => {
              const availability = AVAILABILITY_META[agent.availability];
              const skills: string[] = agent.skills ?? [];

              return (
                <div
                  key={agent.id}
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-line bg-surface-2/30 p-3 transition-colors hover:border-line-strong hover:bg-surface-2/60"
                >
                  <div className="flex items-start gap-3 min-w-0">
                    <AgentAvatar size="md" online={agent.availability !== "unavailable"} />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="text-[12.5px] font-semibold text-ink truncate">
                          {agent.name}
                        </h3>
                        <Badge tone={availability.tone} dot>
                          {availability.label}
                        </Badge>
                        <span className="font-mono text-[9px] text-faint">
                          {agent.model}
                        </span>
                      </div>
                      <p className="mt-0.5 text-[11px] text-muted line-clamp-1">
                        {agent.role} · {agent.jobdesk}
                      </p>
                      {skills.length > 0 && (
                        <div className="mt-1.5 flex flex-wrap gap-1">
                          {skills.map((s) => (
                            <span
                              key={s}
                              className="rounded bg-surface px-1.5 py-0.5 font-mono text-[8.5px] text-faint border border-line"
                            >
                              {s}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => navigate(`/agent?agent=${agent.id}`)}
                    className="shrink-0 h-7 text-[11px] px-2.5 hover:bg-surface"
                  >
                    <MessageSquare size={12} className="text-accent-text" />
                    <span>Obrol</span>
                  </Button>
                </div>
              );
            })}
          </div>
        </section>

        {/* Kanan: Penjaga Kualitas & Antrean Tinjauan (5 Kolom) */}
        <div className="space-y-5 lg:col-span-5 flex flex-col">
          {/* Box 1: Aturan SPV-QC Gate */}
          <section className="card p-4 md:p-5">
            <div className="flex items-center justify-between mb-3 border-b border-line pb-3">
              <div className="flex items-center gap-2">
                <span className="grid size-7 place-items-center rounded-lg bg-accent-soft text-accent-text">
                  <ShieldCheck size={14} />
                </span>
                <div>
                  <h3 className="text-[13px] font-semibold text-ink">Standar Kualitas SPV-QC</h3>
                  <p className="text-[10px] text-faint">Filter ketat sebelum masuk tinjauan pemilik</p>
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleRunQc}
                disabled={qcRunning}
                className="h-7 text-[10.5px] px-2"
              >
                <Play size={10} className="text-accent-text" />
                <span>Uji Gerbang</span>
              </Button>
            </div>

            <div className="space-y-2 text-[11px] text-muted">
              <div className="flex items-center gap-2">
                <Check size={12} className="text-success shrink-0" />
                <span><strong>Anti-Slop:</strong> Blokir kata klise generik tanpa substansi</span>
              </div>
              <div className="flex items-center gap-2">
                <Check size={12} className="text-success shrink-0" />
                <span><strong>Klaim Terverifikasi:</strong> Tolak klaim garansi/gratis tanpa bukti</span>
              </div>
              <div className="flex items-center gap-2">
                <Check size={12} className="text-success shrink-0" />
                <span><strong>Batas Tagar:</strong> Maksimal 5 tagar relevan</span>
              </div>
              <div className="flex items-center gap-2">
                <Check size={12} className="text-success shrink-0" />
                <span><strong>Audit Lisensi:</strong> Verifikasi izin komersial font &amp; aset</span>
              </div>
            </div>

            <div className="mt-4 rounded-lg bg-surface-2/60 p-2.5 text-[10.5px] text-faint flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <Clock size={11} className="text-muted" /> Jadwal Cron Harian:
              </span>
              <span className="font-mono text-ink">08:00 WIB (Edge) &amp; 08:15 WIB (Hermes)</span>
            </div>
          </section>

          {/* Box 2: Postingan / Review Menunggu Jawad */}
          <section className="card p-4 md:p-5 flex-1">
            <div className="flex items-center justify-between mb-3 border-b border-line pb-3">
              <div>
                <h3 className="text-[13px] font-semibold text-ink flex items-center gap-2">
                  Antrean Tinjauan Postingan
                  {reviewPosts.length > 0 && (
                    <Badge tone="warning">{reviewPosts.length}</Badge>
                  )}
                </h3>
                <p className="text-[10px] text-faint">Membutuhkan persetujuan sebelum dipublikasikan</p>
              </div>
              <Link
                to="/schedule"
                className="text-[11px] font-medium text-muted hover:text-ink transition-colors"
              >
                Buka Jadwal
              </Link>
            </div>

            {reviewPosts.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-6 text-center">
                <span className="grid size-9 place-items-center rounded-full bg-success-soft text-success mb-2">
                  <CheckCircle2 size={18} />
                </span>
                <p className="text-[12px] font-medium text-ink">Semua Bersih &amp; Terkendali</p>
                <p className="text-[10.5px] text-faint mt-0.5 max-w-[220px]">
                  Tidak ada draf postingan yang tertahan di antrean tinjauan.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {reviewPosts.slice(0, 3).map((post) => (
                  <div
                    key={post.id}
                    onClick={() => navigate("/schedule")}
                    className="flex items-center justify-between rounded-lg border border-line bg-surface p-2.5 cursor-pointer hover:border-line-strong transition"
                  >
                    <div className="min-w-0 pr-2">
                      <p className="text-[11.5px] font-medium text-ink truncate">
                        {post.caption || "Draf postingan"}
                      </p>
                      <p className="text-[9.5px] text-faint font-mono mt-0.5">
                        {post.platform} · {post.date ? `${post.date} ${post.time}` : "Belum dijadwalkan"}
                      </p>
                    </div>
                    <Badge tone="warning" dot>Tinjauan</Badge>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
