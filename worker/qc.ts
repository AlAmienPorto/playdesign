/**
 * Gate QC deterministik untuk Playdesign (dari skill playdesign-spv-qc).
 *
 * Dijalankan oleh Cloudflare Cron tiap hari dan juga bisa dipicu manual lewat
 * POST /api/qc/run. Tidak memakai LLM: semua aturan di sini bisa diperiksa dari
 * isi database, jadi hasilnya sama setiap kali dijalankan dan tidak ada biaya.
 *
 * SPV hanya menyaring, tidak pernah memberi approval final — state tertinggi
 * yang boleh dihasilkan adalah "owner_review".
 */

type Severity = "block" | "warn";

export type QcFinding = {
  rule: string;
  severity: Severity;
  message: string;
};

type PostRow = {
  id: string;
  workspace_id: string;
  title: string;
  caption: string;
  platform: string;
  format: string;
  status: string;
  scheduled_for: string;
};

const SLOP = [
  "solusi terbaik",
  "revolusioner",
  "game changer",
  "seamless",
  "unlock",
  "di era digital",
  "one-stop",
  "terdepan",
  "nomor 1",
  "no.1",
  "luar biasa sekali",
];

const CLAIM = [
  /\bgratis\b/i,
  /\b100\s*%/i,
  /\bgaransi\b/i,
  /\btermurah\b/i,
  /\btercepat\b/i,
  /\bterbaik\b/i,
  /#1\b/,
  /\bsatu-satunya\b/i,
];

const SOURCE_MARK = /(sumber\s*:|menurut\s|https?:\/\/|riset\s|data\s+internal)/i;

const CAPTION_LIMIT: Record<string, number> = {
  Instagram: 2200,
  Facebook: 63206,
  LinkedIn: 3000,
  TikTok: 2200,
  X: 280,
};

function inspect(post: PostRow, now: number): { findings: QcFinding[]; limitations: string[] } {
  const findings: QcFinding[] = [];
  const limitations: string[] = [];
  const caption = post.caption ?? "";
  const limit = CAPTION_LIMIT[post.platform];

  if (!caption.trim()) {
    findings.push({ rule: "caption_missing", severity: "block", message: "Caption kosong — belum ada copy yang bisa dinilai." });
  }

  if (limit && caption.length > limit) {
    findings.push({
      rule: "caption_over_limit",
      severity: "block",
      message: `Caption ${caption.length} karakter, melebihi batas ${post.platform} (${limit}).`,
    });
  }

  const hashtags = caption.match(/#[^\s#]+/g) ?? [];
  if (hashtags.length > 30) {
    findings.push({
      rule: "hashtag_overload",
      severity: "block",
      message: `${hashtags.length} hashtag — batas aman 30, lebih dari itu berisiko dianggap spam.`,
    });
  }

  const claims = CLAIM.filter((re) => re.test(caption)).map((re) => re.source);
  if (claims.length && !SOURCE_MARK.test(caption)) {
    findings.push({
      rule: "unverified_claim",
      severity: "block",
      message: `Klaim tanpa sumber: ${claims.join(", ")}. Tambahkan sumber atau ubah jadi bahasa yang tidak mengklaim.`,
    });
  }

  const slop = SLOP.filter((word) => caption.toLowerCase().includes(word));
  if (slop.length) {
    findings.push({ rule: "anti_slop", severity: "block", message: `Frasa generik: ${slop.join(", ")}.` });
  }

  if (post.title.trim().length >= 12 && caption.toLowerCase().includes(post.title.trim().toLowerCase())) {
    findings.push({
      rule: "caption_repeats_title",
      severity: "warn",
      message: "Judul diulang persis di caption — caption sebaiknya menambah konteks, bukan mengulang.",
    });
  }

  if (/\b(dm|inbox|whatsapp|wa)\b/i.test(caption)) {
    findings.push({
      rule: "cta_dm_readiness",
      severity: "warn",
      message: "CTA mengarah ke DM/WA — pastikan bio, inbox, dan template balasan sudah siap sebelum tayang.",
    });
  }

  if (/carousel/i.test(post.format)) {
    limitations.push("Jumlah slide dan ukuran 1080×1350 px belum tercatat di database — periksa manual.");
  }

  const scheduled = Date.parse(post.scheduled_for);
  if (!Number.isNaN(scheduled) && scheduled < now) {
    findings.push({
      rule: "schedule_slip",
      severity: "block",
      message: `Jadwal ${post.scheduled_for} sudah lewat tapi status masih "${post.status}".`,
    });
  }

  limitations.push("Provenance lisensi font/foto/klip belum tersimpan di database — verifikasi manual tetap wajib.");
  return { findings, limitations };
}

export type QcSummary = {
  ranAt: string;
  posts: number;
  passed: number;
  blocked: number;
  runs: { postId: string; title: string; state: string; findings: QcFinding[] }[];
};

export async function runQcGate(env: { DB: D1Database }): Promise<QcSummary> {
  const now = Date.now();
  const at = new Date(now).toISOString();
  const day = at.slice(0, 10).replace(/-/g, "");

  const { results: posts } = await env.DB.prepare(
    `SELECT id, workspace_id, title, caption, platform, format, status, scheduled_for
       FROM posts
      WHERE status IN ('review', 'draft')
      ORDER BY scheduled_for ASC
      LIMIT 50`,
  ).all<PostRow>();

  const rows = posts ?? [];
  const summary: QcSummary = { ranAt: at, posts: rows.length, passed: 0, blocked: 0, runs: [] };

  // Agen SPV per workspace (dipakai sebagai agent_id pada tabel runs).
  const { results: spvAgents } = await env.DB.prepare(
    `SELECT id, workspace_id FROM agents WHERE role LIKE '%SPV%'`,
  ).all<{ id: string; workspace_id: string }>();
  const agentFor = new Map((spvAgents ?? []).map((a) => [a.workspace_id, a.id]));

  const statements: D1PreparedStatement[] = [];

  for (const post of rows) {
    const agentId = agentFor.get(post.workspace_id);
    if (!agentId) {
      summary.runs.push({ postId: post.id, title: post.title, state: "skipped", findings: [] });
      continue;
    }

    const { findings, limitations } = inspect(post, now);
    const blocking = findings.filter((f) => f.severity === "block");
    const state = blocking.length ? "changes_requested" : "owner_review";
    if (blocking.length) summary.blocked += 1;
    else summary.passed += 1;

    const runId = `qc-${post.id}-${day}`;
    const evidence = [
      `Diperiksa ${at} · ${post.platform} · ${post.format} · status ${post.status} · ${post.caption.length} karakter`,
      ...findings.map((f) => `${f.severity === "block" ? "BLOCK" : "WARN"} ${f.rule}: ${f.message}`),
    ];
    if (!findings.length) evidence.push("Tidak ada pelanggaran pada aturan otomatis.");

    statements.push(
      env.DB.prepare(
        `INSERT OR IGNORE INTO runs
           (id, workspace_id, agent_id, task_id, action, subject, state,
            approval_required, output_version, evidence, limitations, started_at, ended_at)
         VALUES (?, ?, ?, NULL, 'qc_gate', ?, ?, 1, 1, ?, ?, ?, ?)`,
      ).bind(
        runId,
        post.workspace_id,
        agentId,
        `QC · ${post.title}`,
        state,
        JSON.stringify(evidence),
        JSON.stringify(limitations),
        at,
        at,
      ),
      env.DB.prepare(
        `INSERT OR IGNORE INTO activity_events
           (id, workspace_id, entity_type, entity_id, task_id, actor_type, actor_id, action, result, meta, created_at)
         VALUES (?, ?, 'run', ?, NULL, 'agent', ?, 'qc_gate', ?, ?, ?)`,
      ).bind(
        `evt-${runId}`,
        post.workspace_id,
        runId,
        agentId,
        blocking.length ? "pending" : "ok",
        JSON.stringify({ postId: post.id, blocking: blocking.length, total: findings.length }),
        at,
      ),
    );

    summary.runs.push({ postId: post.id, title: post.title, state, findings });
  }

  if (statements.length) await env.DB.batch(statements);

  return summary;
}

export type QcNote = {
  postId: string;
  comment: string;
  state?: "owner_review" | "changes_requested" | "approved" | "rejected";
};

/**
 * Menyimpan hasil analisis mendalam (dari Hermes/LLM) ke run QC yang sudah ada.
 * Gate deterministik tetap pemilik keputusan awal; catatan ini melengkapinya.
 */
export async function saveQcNote(
  env: { DB: D1Database },
  note: QcNote,
): Promise<{ runId: string } | null> {
  const { results } = await env.DB.prepare(
    `SELECT id FROM runs
      WHERE action = 'qc_gate' AND id LIKE ? 
      ORDER BY started_at DESC LIMIT 1`,
  )
    .bind(`qc-${note.postId}-%`)
    .all<{ id: string }>();

  const runId = results?.[0]?.id;
  if (!runId) return null;

  const at = new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare(
      `UPDATE runs SET decision_comment = ?, state = COALESCE(?, state), ended_at = ? WHERE id = ?`,
    ).bind(note.comment.slice(0, 4000), note.state ?? null, at, runId),
    env.DB.prepare(
      `INSERT OR IGNORE INTO run_events (id, run_id, state, note, at) VALUES (?, ?, 'qc_note', ?, ?)`,
    ).bind(`note-${runId}-${at}`, runId, note.comment.slice(0, 4000), at),
  ]);

  return { runId };
}
