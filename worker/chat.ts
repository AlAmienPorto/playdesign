/**
 * Agent Chat API — bertenaga Cloudflare Workers AI & D1 Storage.
 *
 * Mengarahkan percakapan ke model LLM dengan persona agent yang dipilih
 * (Raka Pratama, Salsabila Rahma, Arif Nugroho, dll.), lengkap dengan
 * jobdesk, skills dari database, dan konteks aktif workspace.
 *
 * Seluruh riwayat percakapan otomatis tersimpan persisten di tabel `agent_messages` di D1.
 */

interface ChatMessageInput {
  role: "user" | "assistant" | "agent";
  content?: string;
  text?: string;
}

interface ChatRequestBody {
  workspaceId?: string;
  agentId?: string;
  messages: ChatMessageInput[];
}

export async function handleGetAgentMessages(
  env: { DB: D1Database },
  req: Request,
  json: (body: unknown, status?: number) => Response,
): Promise<Response> {
  const url = new URL(req.url);
  const workspaceId = url.searchParams.get("workspaceId") || "playdesign";
  const agentId = url.searchParams.get("agentId");
  if (!agentId) {
    return json({ error: { code: "invalid_request", message: "agentId wajib diisi." } }, 400);
  }

  const rows = await env.DB.prepare(
    "SELECT id, role, content, proposal, created_at FROM agent_messages WHERE workspace_id = ? AND agent_id = ? ORDER BY created_at ASC LIMIT 100",
  )
    .bind(workspaceId, agentId)
    .all<{ id: string; role: string; content: string; proposal: string | null; created_at: string }>();

  const messages = (rows.results || []).map((r) => {
    let parsedProposal: any = undefined;
    if (r.proposal) {
      try {
        parsedProposal = JSON.parse(r.proposal);
      } catch {}
    }
    return {
      id: r.id,
      role: r.role,
      text: r.content,
      proposal: parsedProposal,
      createdAt: r.created_at,
    };
  });

  return json({ messages });
}

export async function handleClearAgentMessages(
  env: { DB: D1Database },
  req: Request,
  json: (body: unknown, status?: number) => Response,
): Promise<Response> {
  const url = new URL(req.url);
  const workspaceId = url.searchParams.get("workspaceId") || "playdesign";
  const agentId = url.searchParams.get("agentId");
  if (!agentId) {
    return json({ error: { code: "invalid_request", message: "agentId wajib diisi." } }, 400);
  }

  await env.DB.prepare("DELETE FROM agent_messages WHERE workspace_id = ? AND agent_id = ?")
    .bind(workspaceId, agentId)
    .run();

  return json({ ok: true, cleared: true });
}

export async function handleAgentChat(
  env: { DB: D1Database; AI: Ai },
  req: Request,
  json: (body: unknown, status?: number) => Response,
): Promise<Response> {
  const body = (await req.json().catch(() => null)) as ChatRequestBody | null;
  if (!body || !Array.isArray(body.messages) || body.messages.length === 0) {
    return json({ error: { code: "invalid_request", message: "messages array wajib diisi." } }, 400);
  }

  const workspaceId = body.workspaceId?.trim() || "playdesign";

  // Ambil info workspace
  const workspace = await env.DB.prepare("SELECT id, name FROM workspaces WHERE id = ?")
    .bind(workspaceId)
    .first<{ id: string; name: string }>();

  // Ambil agent sesuai ID, atau agent pertama di workspace
  let agentQuery = "SELECT * FROM agents WHERE workspace_id = ? AND id = ?";
  let agent = body.agentId
    ? await env.DB.prepare(agentQuery).bind(workspaceId, body.agentId).first<any>()
    : null;

  if (!agent) {
    agent = await env.DB.prepare(
      "SELECT * FROM agents WHERE workspace_id = ? ORDER BY sort_order ASC LIMIT 1",
    )
      .bind(workspaceId)
      .first<any>();
  }

  if (!agent) {
    return json({ error: { code: "agent_not_found", message: "Agent tidak ditemukan untuk workspace ini." } }, 404);
  }

  // Ambil metrik ringkas workspace agar AI sadar konteks nyata
  let taskCount = 0;
  let dealCount = 0;
  let postCount = 0;

  try {
    const counts = await env.DB.batch<{ c: number }>([
      env.DB.prepare("SELECT COUNT(*) AS c FROM tasks WHERE workspace_id = ? AND status != 'done'").bind(workspaceId),
      env.DB.prepare("SELECT COUNT(*) AS c FROM deals WHERE workspace_id = ?").bind(workspaceId),
      env.DB.prepare("SELECT COUNT(*) AS c FROM posts WHERE workspace_id = ?").bind(workspaceId),
    ]);
    taskCount = counts[0]?.results?.[0]?.c ?? 0;
    dealCount = counts[1]?.results?.[0]?.c ?? 0;
    postCount = counts[2]?.results?.[0]?.c ?? 0;
  } catch {
    /* abaikan kegagalan query hitungan non-kritis */
  }

  let capabilities: string[] = [];
  try {
    capabilities = JSON.parse(agent.capabilities || "[]");
  } catch {}

  let skills: string[] = [];
  try {
    skills = JSON.parse(agent.skills || "[]");
  } catch {}

  const systemPrompt = `Kamu adalah ${agent.name}, AI agent dengan peran "${agent.role}" di workspace "${workspace?.name ?? workspaceId}" Playdesign OS.
Tugas utama (jobdesk): ${agent.jobdesk}
Keahlian/Skill yang kamu kuasai: ${skills.length ? skills.join(", ") : "Umum"}
Capabilities: ${capabilities.length ? capabilities.join(", ") : "Umum"}
Status ketersediaan: ${agent.availability}

Kondisi workspace saat ini:
- ${taskCount} task aktif
- ${dealCount} deals
- ${postCount} postingan/konten terjadwal

Pedoman menjawab:
1. Jawab selalu dalam Bahasa Indonesia yang lugas, profesional, alami, dan solutif sesuai karakter dan bidang keahlianmu (${agent.name} - ${agent.role}).
2. Bertindaklah sebagai agen otonom yang kompeten. Berikan saran taktis, analisis, atau rancangan draft konkret jika diminta.
3. Jangan pernah mengarang data metrik internal palsu.
4. Jika kamu menyarankan suatu tindakan resmi yang perlu dijalankan ke antrean sistem (misalnya: "Drafting follow-up prospek", "Review QC konten", "Riset kompetitor"), kamu BOLEH menyertakan proposal di baris paling akhir responsmu dengan format blok kode JSON persis:
\`\`\`proposal
{
  "action": "Nama aksi singkat (contoh: Draft follow-up / QC Review)",
  "subject": "Target aksi spesifik",
  "limitations": ["Batasan konteks atau catatan"]
}
\`\`\`
Jika sekadar tanya-jawab, ideasi, diskusi, atau konsultasi biasa, jawab langsung tanpa blok proposal.`;

  const formattedHistory = body.messages
    .slice(-10)
    .map((m) => ({
      role: m.role === "agent" ? "assistant" : m.role === "assistant" ? "assistant" : "user",
      content: (m.content || m.text || "").trim(),
    }))
    .filter((m) => m.content.length > 0);

  // Ambil pesan user terakhir untuk disimpan ke database D1
  const latestUserMsg = [...formattedHistory].reverse().find((m) => m.role === "user");
  const userMsgId = crypto.randomUUID();
  if (latestUserMsg) {
    try {
      await env.DB.prepare(
        "INSERT INTO agent_messages (id, workspace_id, agent_id, role, content) VALUES (?, ?, ?, ?, ?)",
      )
        .bind(userMsgId, workspaceId, agent.id, "user", latestUserMsg.content)
        .run();
    } catch (saveErr) {
      console.warn("Gagal menyimpan pesan user ke D1:", saveErr);
    }
  }

  let responseText = "";

  try {
    // Model utama: Llama 3.3 70B (kualitas tinggi, respons cepat)
    const result: any = await env.AI.run("@cf/meta/llama-3.3-70b-instruct-fp8-fast" as any, {
      messages: [
        { role: "system", content: systemPrompt },
        ...formattedHistory,
      ],
      max_tokens: 1024,
      temperature: 0.7,
    });
    responseText = result?.response ?? result?.choices?.[0]?.message?.content ?? "";
  } catch (error) {
    console.warn("Llama 3.3 70B gagal, fallback ke Llama 3.1 8B:", error);
    try {
      const fallbackResult: any = await env.AI.run("@cf/meta/llama-3.1-8b-instruct" as any, {
        messages: [
          { role: "system", content: systemPrompt },
          ...formattedHistory,
        ],
        max_tokens: 1024,
        temperature: 0.7,
      });
      responseText = fallbackResult?.response ?? fallbackResult?.choices?.[0]?.message?.content ?? "";
    } catch (fallbackError) {
      console.error("AI run failed:", fallbackError);
      return json({ error: { code: "ai_service_unavailable", message: "Layanan AI sedang sibuk. Coba beberapa saat lagi." } }, 503);
    }
  }

  // Ekstrak proposal jika ada
  let proposal: { action: string; subject: string; limitations: string[]; status: "pending" } | null = null;
  const proposalMatch = /```proposal\s*([\s\S]*?)\s*```/.exec(responseText);
  if (proposalMatch) {
    try {
      const parsed = JSON.parse(proposalMatch[1]);
      if (parsed.action && parsed.subject) {
        proposal = {
          action: String(parsed.action),
          subject: String(parsed.subject),
          limitations: Array.isArray(parsed.limitations) ? parsed.limitations.map(String) : [],
          status: "pending",
        };
        responseText = responseText.replace(/```proposal[\s\S]*?```/, "").trim();
      }
    } catch {
      /* abaikan error parsing proposal */
    }
  }

  // Simpan balasan AI ke database D1
  const assistantMsgId = crypto.randomUUID();
  try {
    await env.DB.prepare(
      "INSERT INTO agent_messages (id, workspace_id, agent_id, role, content, proposal) VALUES (?, ?, ?, ?, ?, ?)",
    )
      .bind(
        assistantMsgId,
        workspaceId,
        agent.id,
        "agent",
        responseText,
        proposal ? JSON.stringify(proposal) : null,
      )
      .run();
  } catch (saveErr) {
    console.warn("Gagal menyimpan balasan agent ke D1:", saveErr);
  }

  return json({
    text: responseText,
    proposal,
    userMessageId: userMsgId,
    agentMessageId: assistantMsgId,
    agent: {
      id: agent.id,
      name: agent.name,
      role: agent.role,
    },
  });
}
