// @ts-nocheck — dieksekusi oleh Node/tsx, bukan runtime Worker.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

import worker from "./index";

const MIGRATIONS = [
  "0001_init.sql",
  "0009_login_attempts.sql",
  "0016_carousel_export_jobs.sql",
  "0017_carousel_active_unique.sql",
  "0018_content_radar.sql",
];
const API_TOKEN = "api-token-test";
const ACCESS_PASSWORD = "password-test";
const RADAR_TOKEN = "radar-token-test";

function createD1() {
  const db = new DatabaseSync(":memory:", { enableForeignKeyConstraints: true });
  for (const file of MIGRATIONS) {
    db.exec(readFileSync(join(process.cwd(), "migrations", file), "utf8"));
  }
  const statement = (sql, params = []) => ({
    bind: (...next) => statement(sql, next),
    first: async () => {
      const row = db.prepare(sql).get(...params);
      return row ? { ...row } : null;
    },
    all: async () => ({
      results: db.prepare(sql).all(...params).map((row) => ({ ...row })),
      success: true,
      meta: {},
    }),
    run: async () => {
      const info = db.prepare(sql).run(...params);
      return {
        success: true,
        results: [],
        meta: { changes: Number(info.changes), last_row_id: Number(info.lastInsertRowid) },
      };
    },
  });
  return {
    prepare: (sql) => statement(sql),
    batch: async (statements) => {
      db.exec("BEGIN");
      try {
        const results = [];
        for (const entry of statements) results.push(await entry.run());
        db.exec("COMMIT");
        return results;
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
    },
  };
}

const env = () => ({
  DB: createD1(),
  ASSETS: { fetch: async () => new Response("asset", { status: 200 }) },
  AI: {},
  API_TOKEN,
  ACCESS_PASSWORD,
  RADAR_API_TOKEN: RADAR_TOKEN,
});

async function call(target, method, path, options = {}) {
  const headers = new Headers();
  if (options.token) headers.set("authorization", `Bearer ${options.token}`);
  if (options.actorId) headers.set("x-actor-id", options.actorId);
  let body;
  if (options.body !== undefined) {
    headers.set("content-type", "application/json");
    body = JSON.stringify(options.body);
  }
  const request = new Request(`https://radar.test${path}`, { method, headers, body });
  const response = await worker.fetch(request, target, {
    waitUntil() {},
    passThroughOnException() {},
  });
  const text = await response.text();
  let parsed = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = null;
  }
  return { status: response.status, contentType: response.headers.get("content-type"), text, body: parsed };
}

const workspace = (target, id) =>
  target.DB.prepare(
    "INSERT INTO workspaces (id, name, slug, meta, initial, approval_policy, created_at) VALUES (?, ?, ?, '{}', 'W', 'owner', ?)",
  )
    .bind(id, id, id, new Date().toISOString())
    .run();

const actor = (target, workspaceId, id, role) =>
  target.DB.prepare(
    "INSERT INTO actors (id, workspace_id, name, role, created_at) VALUES (?, ?, ?, ?, ?)",
  )
    .bind(id, workspaceId, id, role, new Date().toISOString())
    .run();

const source = (target, workspaceId, id, domain, tier, kind = "media") =>
  target.DB.prepare(
    `INSERT INTO content_radar_sources
       (workspace_id, id, domain, name, tier, kind, niches, enabled, requires_crosscheck, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, '["ai"]', 1, ?, ?, ?)`,
  )
    .bind(workspaceId, id, domain, domain, tier, kind, tier === "D" ? 1 : 0, new Date().toISOString(), new Date().toISOString())
    .run();

async function session(target) {
  const response = await call(target, "POST", "/api/auth/login", {
    body: { password: ACCESS_PASSWORD },
  });
  assert.equal(response.status, 200, response.text);
  return response.body.session;
}

async function setup() {
  const target = env();
  await workspace(target, "ws-a");
  await workspace(target, "ws-b");
  await actor(target, "ws-a", "ja", "owner");
  await actor(target, "ws-a", "op", "operator");
  await actor(target, "ws-b", "sara", "owner");
  return { env: target, token: await session(target) };
}

const iso = (offsetMs = 0) => new Date(Date.now() + offsetMs).toISOString();
const wibDate = () => new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);

const documentFixture = (title = "Model AI baru dirilis") => ({
  kicker: "AI",
  template: "split-brand",
  headline: title,
  highlight: "",
  sourceName: "Example News",
  sourceUrl: "https://example.com/ai/launch",
  coverImageUrl: "",
  slides: [1, 2, 3, 4].map((index) => ({
    id: `slide-${index}`,
    kind: index === 1 ? "cover" : "text",
    title: `Slide ${index}`,
    body: `Isi slide ${index}`,
  })),
  caption: "Caption carousel",
  hashtags: ["#AI"],
});

async function ingest(target, workspaceId, overrides = {}) {
  const sourceInput = overrides.source === null
    ? undefined
    : (overrides.source ?? {
        domain: "example.com",
        name: "Example News",
        tier: "A",
        kind: "media",
        niches: ["ai"],
      });
  const body = {
    workspaceId,
    candidate: {
      canonicalUrl: "https://example.com/ai/launch?utm_source=feed",
      title: "Model AI baru dirilis",
      summary: "Ringkasan singkat",
      publishedAt: iso(),
      discoveredAt: iso(),
      niche: "ai",
      clusterKey: "cluster-ai-launch",
      ...(overrides.candidate ?? {}),
    },
    ...(sourceInput === undefined ? {} : { source: sourceInput }),
    ...(overrides.provenance === undefined ? {} : { provenance: overrides.provenance }),
  };
  return call(target, "POST", "/api/content-radar/candidates:ingest", {
    token: RADAR_TOKEN,
    body,
  });
}

async function score(target, workspaceId, candidateId, overrides = {}) {
  return call(target, "POST", `/api/content-radar/candidates/${candidateId}/score`, {
    token: RADAR_TOKEN,
    body: {
      workspaceId,
      relevance: 25,
      carouselPotential: 10,
      riskFlags: [],
      reason: "Relevan untuk audiens desainer Indonesia.",
      ...overrides,
    },
  });
}

async function scoredCandidate(target, workspaceId, overrides = {}) {
  const ingested = await ingest(target, workspaceId, overrides);
  assert.ok([200, 201].includes(ingested.status), ingested.text);
  const candidateId = ingested.body.candidateId;
  const scored = await score(target, workspaceId, candidateId, overrides.score ?? {});
  assert.equal(scored.status, 200, scored.text);
  return candidateId;
}

async function automaticDraft(target, workspaceId, candidateId, overrides = {}) {
  return call(target, "POST", `/api/content-radar/candidates/${candidateId}/draft`, {
    token: RADAR_TOKEN,
    body: { workspaceId, document: documentFixture(), ...overrides },
  });
}

async function fillAutomaticDrafts(target, workspaceId, count) {
  const ids = [];
  for (let index = 0; index < count; index += 1) {
    const candidateId = await scoredCandidate(target, workspaceId, {
      candidate: {
        canonicalUrl: `https://example.com/ai/story-${index}`,
        title: `Berita ${index}`,
        clusterKey: `cluster-${index}`,
      },
      provenance: [{ url: `https://example.com/ai/story-${index}`, relation: "primary" }],
    });
    const drafted = await automaticDraft(target, workspaceId, candidateId);
    assert.equal(drafted.status, 201, drafted.text);
    ids.push(candidateId);
  }
  return ids;
}

test("read workspace sendiri berhasil dan hanya memuat kandidat workspace itu", async () => {
  const { env: target, token } = await setup();
  await scoredCandidate(target, "ws-a");
  await scoredCandidate(target, "ws-b", {
    candidate: { canonicalUrl: "https://example.com/ai/other", clusterKey: "cluster-other" },
    provenance: [{ url: "https://example.com/ai/other", relation: "primary" }],
  });

  const response = await call(target, "GET", "/api/content-radar/candidates?workspace=ws-a", {
    token,
    actorId: "ja",
  });

  assert.equal(response.status, 200, response.text);
  assert.equal(response.body.candidates.length, 1);
  assert.equal(response.body.candidates[0].sourceTier, "A");
  assert.equal(response.body.pagination.limit, 50);
});

test("workspace lain ditolak untuk sesi manusia", async () => {
  const { env: target, token } = await setup();
  const response = await call(target, "GET", "/api/content-radar/candidates?workspace=ws-b", {
    token,
    actorId: "ja",
  });
  assert.equal(response.status, 403);
  assert.equal(response.body.error.code, "forbidden");
});

test("IDOR: kandidat workspace lain tidak dapat dibaca lewat id", async () => {
  const { env: target, token } = await setup();
  const foreign = await scoredCandidate(target, "ws-b", {
    candidate: { canonicalUrl: "https://example.com/ai/foreign", clusterKey: "cluster-foreign" },
    provenance: [{ url: "https://example.com/ai/foreign", relation: "primary" }],
  });

  const response = await call(target, "GET", `/api/content-radar/candidates/${foreign}?workspace=ws-a`, {
    token,
    actorId: "ja",
  });
  assert.equal(response.status, 404);
  assert.equal(response.body.error.code, "candidate_not_found");
});

test("header actor palsu tidak dapat memperoleh identitas radar-agent", async () => {
  const { env: target, token } = await setup();
  const response = await call(target, "POST", "/api/content-radar/candidates:ingest", {
    token,
    actorId: "radar-agent",
    body: { workspaceId: "ws-a", candidate: { canonicalUrl: "https://example.com/x", title: "X", niche: "ai" } },
  });
  assert.equal(response.status, 403);
  assert.equal(response.body.error.code, "forbidden_machine_only");
});

test("sesi manusia tidak dapat memakai ingest dan score internal", async () => {
  const { env: target, token } = await setup();
  const ingestResponse = await call(target, "POST", "/api/content-radar/candidates:ingest", {
    token,
    actorId: "ja",
    body: { workspaceId: "ws-a", candidate: { canonicalUrl: "https://example.com/x", title: "X", niche: "ai" } },
  });
  assert.equal(ingestResponse.status, 403);
  assert.equal(ingestResponse.body.error.code, "forbidden_machine_only");

  const candidateId = await scoredCandidate(target, "ws-a");
  const scoreResponse = await call(target, "POST", `/api/content-radar/candidates/${candidateId}/score`, {
    token,
    actorId: "ja",
    body: { workspaceId: "ws-a", relevance: 25, carouselPotential: 10, reason: "x" },
  });
  assert.equal(scoreResponse.status, 403);
  assert.equal(scoreResponse.body.error.code, "forbidden_machine_only");
});

test("radar-agent tidak dapat menjalankan mutasi registry Owner", async () => {
  const { env: target } = await setup();
  await source(target, "ws-a", "src-example-com", "example.com", "B");

  const patch = await call(target, "PATCH", "/api/content-radar/sources/src-example-com", {
    token: RADAR_TOKEN,
    body: { workspaceId: "ws-a", tier: "C" },
  });
  assert.equal(patch.status, 403);
  assert.equal(patch.body.error.code, "forbidden_owner_only");

  const candidateId = await scoredCandidate(target, "ws-a");
  const shared = await call(target, "POST", `/api/content-radar/candidates/${candidateId}/draft`, {
    token: RADAR_TOKEN,
    body: { workspaceId: "ws-a", document: documentFixture() },
  });
  assert.equal(shared.status, 201, shared.text);
  assert.equal(shared.body.draft.creationKind, "automatic");

  const reject = await call(target, "POST", `/api/content-radar/candidates/${candidateId}/reject`, {
    token: RADAR_TOKEN,
    body: { workspaceId: "ws-a", reason: "x" },
  });
  assert.equal(reject.status, 403);
  assert.equal(reject.body.error.code, "forbidden_owner_only");
});

test("operator non-owner ditolak pada aksi Owner", async () => {
  const { env: target, token } = await setup();
  await source(target, "ws-a", "src-example-com", "example.com", "B");
  const response = await call(target, "PATCH", "/api/content-radar/sources/src-example-com", {
    token,
    actorId: "op",
    body: { workspaceId: "ws-a", tier: "C" },
  });
  assert.equal(response.status, 403);
  assert.equal(response.body.error.code, "forbidden");
});

test("pagination dibatasi dan nilai di luar batas ditolak", async () => {
  const { env: target, token } = await setup();
  await scoredCandidate(target, "ws-a");

  const tooLarge = await call(target, "GET", "/api/content-radar/candidates?workspace=ws-a&limit=500", {
    token,
    actorId: "ja",
  });
  assert.equal(tooLarge.status, 400);
  assert.equal(tooLarge.body.error.code, "validation_failed");

  const bounded = await call(target, "GET", "/api/content-radar/candidates?workspace=ws-a&limit=200", {
    token,
    actorId: "ja",
  });
  assert.equal(bounded.status, 200);
  assert.equal(bounded.body.pagination.limit, 200);
});

test("filter kandidat memakai minScore dan niche", async () => {
  const { env: target, token } = await setup();
  await scoredCandidate(target, "ws-a");
  await source(target, "ws-a", "src-low-example", "low.example", "D");
  const lowScore = await ingest(target, "ws-a", {
    source: { domain: "low.example", kind: "media", tier: "D" },
    candidate: {
      canonicalUrl: "https://low.example/design/low",
      title: "Berita desain",
      niche: "design",
      clusterKey: "cluster-design",
    },
    provenance: [{ url: "https://low.example/design/low", relation: "primary" }],
  });
  const scored = await score(target, "ws-a", lowScore.body.candidateId, {
    relevance: 0,
    carouselPotential: 0,
  });
  assert.equal(scored.body.score.total, 41);

  const all = await call(target, "GET", "/api/content-radar/candidates?workspace=ws-a&minScore=0", {
    token,
    actorId: "ja",
  });
  assert.equal(all.body.candidates.length, 2);

  const filtered = await call(target, "GET", "/api/content-radar/candidates?workspace=ws-a", {
    token,
    actorId: "ja",
  });
  assert.equal(filtered.body.candidates.length, 1);

  const byNiche = await call(target, "GET", "/api/content-radar/candidates?workspace=ws-a&niche=design&minScore=0", {
    token,
    actorId: "ja",
  });
  assert.equal(byNiche.body.candidates.length, 1);
  assert.equal(byNiche.body.candidates[0].niche, "design");
});

test("detail kandidat memuat sumber dan tidak merender HTML sebagai HTML", async () => {
  const { env: target, token } = await setup();
  const candidateId = await scoredCandidate(target, "ws-a", {
    candidate: { title: "<script>alert(1)</script>" },
  });

  const response = await call(target, "GET", `/api/content-radar/candidates/${candidateId}?workspace=ws-a`, {
    token,
    actorId: "ja",
  });

  assert.equal(response.status, 200);
  assert.match(response.contentType, /application\/json/);
  assert.equal(response.body.candidate.title, "<script>alert(1)</script>");
  assert.equal(response.body.candidate.sources.length, 1);
  assert.equal(response.body.candidate.sources[0].relation, "primary");
  assert.equal(response.body.candidate.score.components.credibility, 30);
  assert.ok(!response.text.startsWith("<"));
});

test("ingest idempotent memakai canonical URL yang sama", async () => {
  const { env: target } = await setup();
  const first = await ingest(target, "ws-a");
  const second = await ingest(target, "ws-a", {
    candidate: { canonicalUrl: "https://EXAMPLE.com/ai/launch/?utm_campaign=x#section" },
  });

  assert.equal(first.status, 201, first.text);
  assert.equal(first.body.created, true);
  assert.equal(second.status, 200, second.text);
  assert.equal(second.body.created, false);
  assert.equal(second.body.candidateId, first.body.candidateId);

  const rows = await target.DB.prepare(
    "SELECT COUNT(*) AS total FROM content_radar_candidates WHERE workspace_id = ?",
  )
    .bind("ws-a")
    .first();
  assert.equal(rows.total, 1);
});

test("ingest menautkan cross-check ke klaster yang sama tanpa duplikat kandidat", async () => {
  const { env: target } = await setup();
  const first = await ingest(target, "ws-a");
  const second = await ingest(target, "ws-a", {
    candidate: {
      canonicalUrl: "https://other.example.org/ai/launch-followup",
      title: "Tindak lanjut",
      sourceDomain: "other.example.org",
    },
    provenance: [
      { url: "https://other.example.org/ai/launch-followup", relation: "crosscheck" },
    ],
  });

  assert.equal(second.status, 200, second.text);
  assert.equal(second.body.clustered, true);
  assert.equal(second.body.candidateId, first.body.candidateId);

  const candidates = await target.DB.prepare(
    "SELECT COUNT(*) AS total FROM content_radar_candidates WHERE workspace_id = ?",
  )
    .bind("ws-a")
    .first();
  assert.equal(candidates.total, 1);

  const sources = await target.DB.prepare(
    "SELECT COUNT(*) AS total FROM content_radar_candidate_sources WHERE workspace_id = ? AND candidate_id = ?",
  )
    .bind("ws-a", first.body.candidateId)
    .first();
  assert.equal(sources.total, 2);
});

test("ingest menolak source discovered bertier selain unverified", async () => {
  const { env: target } = await setup();
  const response = await ingest(target, "ws-a", {
    source: { domain: "baru.example", kind: "discovered", tier: "B" },
    candidate: { sourceDomain: "baru.example", canonicalUrl: "https://baru.example/ai/berita" },
  });
  assert.equal(response.status, 400);
  assert.equal(response.body.error.code, "discovered_source_requires_unverified");
});

test("ingest menolak canonical URL non-HTTP", async () => {
  const { env: target } = await setup();
  const response = await ingest(target, "ws-a", {
    candidate: { canonicalUrl: "javascript:alert(1)" },
  });
  assert.equal(response.status, 400);
  assert.equal(response.body.error.code, "invalid_canonical_url");
});

test("ingest memakai tier registry, bukan tier kiriman klien", async () => {
  const { env: target } = await setup();
  await source(target, "ws-a", "src-example-com", "example.com", "B");
  const response = await ingest(target, "ws-a", {
    source: { domain: "example.com", kind: "media", tier: "unverified" },
  });
  assert.equal(response.status, 201, response.text);
  assert.equal(response.body.source.tier, "B");

  const row = await target.DB.prepare(
    "SELECT source_tier FROM content_radar_candidates WHERE workspace_id = ? AND id = ?",
  )
    .bind("ws-a", response.body.candidateId)
    .first();
  assert.equal(row.source_tier, "B");
});

test("score menghitung ulang komponen faktual dan hanya menerima nilai diskret", async () => {
  const { env: target } = await setup();
  const ingested = await ingest(target, "ws-a");
  const candidateId = ingested.body.candidateId;

  const response = await score(target, "ws-a", candidateId);
  assert.equal(response.status, 200, response.text);
  assert.equal(response.body.score.components.credibility, 30);
  assert.equal(response.body.score.components.freshness, 15);
  assert.equal(response.body.score.components.evidence, 11);
  assert.equal(response.body.score.components.relevance, 25);
  assert.equal(response.body.score.components.carouselPotential, 10);
  assert.equal(response.body.score.components.safety, 5);
  assert.equal(response.body.score.total, 96);
  assert.equal(response.body.candidate.status, "qualified");

  const invalidRelevance = await score(target, "ws-a", candidateId, { relevance: 7 });
  assert.equal(invalidRelevance.status, 400);
  assert.equal(invalidRelevance.body.error.code, "validation_failed");

  const invalidFlag = await score(target, "ws-a", candidateId, { riskFlags: ["clickbait"] });
  assert.equal(invalidFlag.status, 400);
  assert.equal(invalidFlag.body.error.code, "validation_failed");
});

test("score memakai cross-check dan flag risiko dari server", async () => {
  const { env: target } = await setup();
  await source(target, "ws-a", "src-other-org", "other.example.org", "B");
  const ingested = await ingest(target, "ws-a", {
    provenance: [
      { url: "https://example.com/ai/launch", relation: "primary" },
      { url: "https://other.example.org/ai/launch", relation: "crosscheck" },
    ],
  });

  const response = await score(target, "ws-a", ingested.body.candidateId, {
    riskFlags: ["context_required"],
  });
  assert.equal(response.status, 200, response.text);
  assert.equal(response.body.score.components.evidence, 15);
  assert.equal(response.body.score.components.safety, 3);
  assert.equal(response.body.score.total, 98);
  assert.deepEqual(response.body.candidate.riskFlags, ["context_required"]);
});

test("score menolak timestamp publikasi di masa depan tanpa komponen freshness", async () => {
  const { env: target } = await setup();
  const ingested = await ingest(target, "ws-a", {
    candidate: { publishedAt: iso(6 * 3_600_000) },
  });
  const response = await score(target, "ws-a", ingested.body.candidateId);
  assert.equal(response.status, 200, response.text);
  assert.equal(response.body.score.components.freshness, 0);
  assert.equal(response.body.score.inputSnapshot.timestampValid, false);
  assert.equal(response.body.candidate.status, "qualified");
});

test("draft otomatis menegakkan skor minimum 75", async () => {
  const { env: target } = await setup();
  await source(target, "ws-a", "src-example-com", "example.com", "D");
  const candidateId = await scoredCandidate(target, "ws-a", {
    source: { domain: "example.com", kind: "media", tier: "D" },
    score: { relevance: 0, carouselPotential: 0 },
  });

  const response = await automaticDraft(target, "ws-a", candidateId);
  assert.equal(response.status, 409);
  assert.equal(response.body.error.code, "draft_not_eligible");
  assert.ok(response.body.error.details.reasons.includes("score_below_75"));
});

test("draft otomatis menegakkan cross-check tepercaya", async () => {
  const { env: target } = await setup();
  await source(target, "ws-a", "src-example-com", "example.com", "B");
  const candidateId = await scoredCandidate(target, "ws-a", {
    source: { domain: "example.com", kind: "media", tier: "B" },
    provenance: [{ url: "https://example.com/ai/launch", relation: "signal" }],
  });

  const response = await automaticDraft(target, "ws-a", candidateId);
  assert.equal(response.status, 409);
  assert.equal(response.body.error.code, "draft_not_eligible");
  assert.ok(response.body.error.details.reasons.includes("insufficient_crosscheck"));
});

test("draft otomatis membuat status Draft dan menulis audit agent", async () => {
  const { env: target } = await setup();
  const candidateId = await scoredCandidate(target, "ws-a");

  const response = await automaticDraft(target, "ws-a", candidateId);
  assert.equal(response.status, 201, response.text);
  assert.equal(response.body.draft.status, "Draft");
  assert.equal(response.body.draft.creationKind, "automatic");
  assert.equal(response.body.draft.createdBy, "radar-agent");
  assert.equal(response.body.draft.autoDateWib, wibDate());
  assert.equal(response.body.draft.document.slides.length, 4);
  assert.equal(response.body.draft.sourcesSnapshot[0].relation, "primary");

  const candidate = await target.DB.prepare(
    "SELECT status, draft_id FROM content_radar_candidates WHERE workspace_id = ? AND id = ?",
  )
    .bind("ws-a", candidateId)
    .first();
  assert.equal(candidate.status, "drafted");
  assert.equal(candidate.draft_id, response.body.draft.id);

  const audit = await target.DB.prepare(
    "SELECT actor_type, actor_id, action, meta FROM activity_events WHERE workspace_id = ? AND entity_id = ?",
  )
    .bind("ws-a", response.body.draft.id)
    .first();
  assert.equal(audit.actor_type, "agent");
  assert.equal(audit.actor_id, "radar-agent");
  assert.equal(audit.action, "content_radar.draft_created");
  assert.equal(JSON.parse(audit.meta).radarEntityType, "draft");
});

test("draft otomatis menolak kandidat yang sudah punya draft", async () => {
  const { env: target } = await setup();
  const candidateId = await scoredCandidate(target, "ws-a");
  assert.equal((await automaticDraft(target, "ws-a", candidateId)).status, 201);

  const response = await automaticDraft(target, "ws-a", candidateId);
  assert.equal(response.status, 409);
  assert.equal(response.body.error.code, "draft_not_eligible");
  assert.ok(response.body.error.details.reasons.includes("already_drafted"));
});

test("draft otomatis menegakkan cap tiga per hari dan retry hanya mengisi slot tersisa", async () => {
  const { env: target } = await setup();
  await fillAutomaticDrafts(target, "ws-a", 2);

  const third = await scoredCandidate(target, "ws-a", {
    candidate: { canonicalUrl: "https://example.com/ai/third", title: "Ketiga", clusterKey: "cluster-third" },
    provenance: [{ url: "https://example.com/ai/third", relation: "primary" }],
  });
  assert.equal((await automaticDraft(target, "ws-a", third)).status, 201);

  const fourth = await scoredCandidate(target, "ws-a", {
    candidate: { canonicalUrl: "https://example.com/ai/fourth", title: "Keempat", clusterKey: "cluster-fourth" },
    provenance: [{ url: "https://example.com/ai/fourth", relation: "primary" }],
  });
  const blocked = await automaticDraft(target, "ws-a", fourth);
  assert.equal(blocked.status, 409);
  assert.equal(blocked.body.error.code, "daily_draft_cap_reached");

  const total = await target.DB.prepare(
    "SELECT COUNT(*) AS total FROM content_radar_drafts WHERE workspace_id = ? AND creation_kind = 'automatic'",
  )
    .bind("ws-a")
    .first();
  assert.equal(total.total, 3);
});

test("draft otomatis menegakkan cap satu crypto per hari", async () => {
  const { env: target } = await setup();
  const first = await scoredCandidate(target, "ws-a", {
    candidate: { canonicalUrl: "https://example.com/crypto/one", niche: "crypto", clusterKey: "cluster-crypto-1" },
    provenance: [{ url: "https://example.com/crypto/one", relation: "primary" }],
  });
  assert.equal((await automaticDraft(target, "ws-a", first)).status, 201);

  const second = await scoredCandidate(target, "ws-a", {
    candidate: { canonicalUrl: "https://example.com/crypto/two", niche: "crypto", clusterKey: "cluster-crypto-2" },
    provenance: [{ url: "https://example.com/crypto/two", relation: "primary" }],
  });
  const blocked = await automaticDraft(target, "ws-a", second);
  assert.equal(blocked.status, 409);
  assert.equal(blocked.body.error.code, "crypto_draft_cap_reached");
});

test("draft otomatis menolak dokumen di luar 4 sampai 8 slide", async () => {
  const { env: target } = await setup();
  const candidateId = await scoredCandidate(target, "ws-a");
  const response = await automaticDraft(target, "ws-a", candidateId, {
    document: { ...documentFixture(), slides: documentFixture().slides.slice(0, 2) },
  });
  assert.equal(response.status, 400);
  assert.equal(response.body.error.code, "invalid_document");
});

test("draft manual Owner tidak mengurangi kuota otomatis", async () => {
  const { env: target, token } = await setup();
  for (let index = 0; index < 3; index += 1) {
    const ingested = await ingest(target, "ws-a", {
      candidate: {
        canonicalUrl: `https://example.com/manual/${index}`,
        title: `Manual ${index}`,
        clusterKey: `cluster-manual-${index}`,
      },
      provenance: [{ url: `https://example.com/manual/${index}`, relation: "primary" }],
    });
    const manual = await call(target, "POST", `/api/content-radar/candidates/${ingested.body.candidateId}/draft`, {
      token,
      actorId: "ja",
      body: { workspaceId: "ws-a" },
    });
    assert.equal(manual.status, 201, manual.text);
    assert.equal(manual.body.draft.creationKind, "manual");
    assert.equal(manual.body.draft.autoDateWib, null);
    assert.equal(manual.body.draft.createdBy, "Owner");
    assert.equal(manual.body.draft.document.slides.length, 4);
  }

  const automatic = await scoredCandidate(target, "ws-a", {
    candidate: { canonicalUrl: "https://example.com/ai/auto", clusterKey: "cluster-auto" },
    provenance: [{ url: "https://example.com/ai/auto", relation: "primary" }],
  });
  const response = await automaticDraft(target, "ws-a", automatic);
  assert.equal(response.status, 201, response.text);

  const manualAudit = await target.DB.prepare(
    "SELECT COUNT(*) AS total FROM activity_events WHERE workspace_id = ? AND action = 'content_radar.manual_draft_created'",
  )
    .bind("ws-a")
    .first();
  assert.equal(manualAudit.total, 3);
});

test("reject Owner menulis alasan dan audit, kandidat drafted tidak dapat ditolak", async () => {
  const { env: target, token } = await setup();
  const candidateId = await scoredCandidate(target, "ws-a");

  const rejected = await call(target, "POST", `/api/content-radar/candidates/${candidateId}/reject`, {
    token,
    actorId: "ja",
    body: { workspaceId: "ws-a", reason: "Sumber tidak tepercaya" },
  });
  assert.equal(rejected.status, 200, rejected.text);
  assert.equal(rejected.body.candidate.status, "rejected");
  assert.equal(rejected.body.candidate.rejectionReason, "Sumber tidak tepercaya");

  const audit = await target.DB.prepare(
    "SELECT actor_type, action, meta FROM activity_events WHERE workspace_id = ? AND entity_id = ?",
  )
    .bind("ws-a", candidateId)
    .first();
  assert.equal(audit.actor_type, "owner");
  assert.equal(audit.action, "content_radar.candidate_rejected");
  assert.equal(JSON.parse(audit.meta).radarEntityType, "candidate");

  const drafted = await scoredCandidate(target, "ws-a", {
    candidate: { canonicalUrl: "https://example.com/ai/drafted", clusterKey: "cluster-drafted" },
    provenance: [{ url: "https://example.com/ai/drafted", relation: "primary" }],
  });
  assert.equal((await automaticDraft(target, "ws-a", drafted)).status, 201);
  const blocked = await call(target, "POST", `/api/content-radar/candidates/${drafted}/reject`, {
    token,
    actorId: "ja",
    body: { workspaceId: "ws-a", reason: "x" },
  });
  assert.equal(blocked.status, 409);
  assert.equal(blocked.body.error.code, "candidate_already_drafted");
});

test("PATCH source tier D memaksa requires_crosscheck dan mengaudit perubahan", async () => {
  const { env: target, token } = await setup();
  await source(target, "ws-a", "src-example-com", "example.com", "B");

  const toD = await call(target, "PATCH", "/api/content-radar/sources/src-example-com", {
    token,
    actorId: "ja",
    body: { workspaceId: "ws-a", tier: "D" },
  });
  assert.equal(toD.status, 200, toD.text);
  assert.equal(toD.body.source.tier, "D");
  assert.equal(toD.body.source.requiresCrosscheck, true);

  const back = await call(target, "PATCH", "/api/content-radar/sources/src-example-com", {
    token,
    actorId: "ja",
    body: { workspaceId: "ws-a", tier: "B" },
  });
  assert.equal(back.status, 200, back.text);
  assert.equal(back.body.source.requiresCrosscheck, false);

  const audit = await target.DB.prepare(
    "SELECT COUNT(*) AS total FROM activity_events WHERE workspace_id = ? AND action = 'content_radar.source_updated'",
  )
    .bind("ws-a")
    .first();
  assert.equal(audit.total, 2);
});

test("PATCH source discovered wajib menyertakan kind saat dipromosikan", async () => {
  const { env: target, token } = await setup();
  await source(target, "ws-a", "src-baru-example", "baru.example", "unverified", "discovered");

  const blocked = await call(target, "PATCH", "/api/content-radar/sources/src-baru-example", {
    token,
    actorId: "ja",
    body: { workspaceId: "ws-a", tier: "B" },
  });
  assert.equal(blocked.status, 400);
  assert.equal(blocked.body.error.code, "discovered_source_requires_unverified");

  const promoted = await call(target, "PATCH", "/api/content-radar/sources/src-baru-example", {
    token,
    actorId: "ja",
    body: { workspaceId: "ws-a", tier: "B", kind: "media" },
  });
  assert.equal(promoted.status, 200, promoted.text);
  assert.equal(promoted.body.source.kind, "media");
  assert.equal(promoted.body.source.verifiedBy, "ja");
});

test("run lock: dua pembuatan run bersamaan hanya satu yang menang", async () => {
  const { env: target } = await setup();
  const first = await call(target, "POST", "/api/content-radar/runs", {
    token: RADAR_TOKEN,
    body: { workspaceId: "ws-a", kind: "selector" },
  });
  assert.equal(first.status, 201, first.text);

  const second = await call(target, "POST", "/api/content-radar/runs", {
    token: RADAR_TOKEN,
    body: { workspaceId: "ws-a", kind: "selector" },
  });
  assert.equal(second.status, 409);
  assert.equal(second.body.error.code, "run_locked");

  const other = await call(target, "POST", "/api/content-radar/runs", {
    token: RADAR_TOKEN,
    body: { workspaceId: "ws-a", kind: "collector" },
  });
  assert.equal(other.status, 201, other.text);
});

test("run lock melepas run running yang basi sebelum membuat run baru", async () => {
  const { env: target } = await setup();
  const stale = iso(-3 * 3_600_000);
  await target.DB.prepare(
    `INSERT INTO content_radar_runs
       (workspace_id, id, kind, status, started_at, heartbeat_at, created_at, updated_at)
     VALUES (?, 'run-stale', 'selector', 'running', ?, ?, ?, ?)`,
  )
    .bind("ws-a", stale, stale, stale, stale)
    .run();

  const response = await call(target, "POST", "/api/content-radar/runs", {
    token: RADAR_TOKEN,
    body: { workspaceId: "ws-a", kind: "selector" },
  });
  assert.equal(response.status, 201, response.text);
  assert.equal(response.body.reaped, 1);

  const previous = await target.DB.prepare(
    "SELECT status, finished_at FROM content_radar_runs WHERE workspace_id = ? AND id = 'run-stale'",
  )
    .bind("ws-a")
    .first();
  assert.equal(previous.status, "cancelled");
  assert.ok(previous.finished_at);
});

test("run update memakai kosakata status tetap dan menolak transisi terminal", async () => {
  const { env: target } = await setup();
  const created = await call(target, "POST", "/api/content-radar/runs", {
    token: RADAR_TOKEN,
    body: { workspaceId: "ws-a", kind: "collector" },
  });
  const runId = created.body.run.id;

  const wrongVocabulary = await call(target, "POST", `/api/content-radar/runs/${runId}`, {
    token: RADAR_TOKEN,
    body: { workspaceId: "ws-a", status: "success" },
  });
  assert.equal(wrongVocabulary.status, 400);
  assert.equal(wrongVocabulary.body.error.code, "validation_failed");

  const running = await call(target, "POST", `/api/content-radar/runs/${runId}`, {
    token: RADAR_TOKEN,
    body: { workspaceId: "ws-a", status: "running" },
  });
  assert.equal(running.status, 200, running.text);
  assert.ok(running.body.run.startedAt);

  const succeeded = await call(target, "POST", `/api/content-radar/runs/${runId}`, {
    token: RADAR_TOKEN,
    body: { workspaceId: "ws-a", status: "succeeded", fetched: 12, new: 4, qualified: 2 },
  });
  assert.equal(succeeded.status, 200, succeeded.text);
  assert.equal(succeeded.body.run.status, "succeeded");
  assert.equal(succeeded.body.run.counts.fetched, 12);
  assert.ok(succeeded.body.run.finishedAt);

  const afterTerminal = await call(target, "POST", `/api/content-radar/runs/${runId}`, {
    token: RADAR_TOKEN,
    body: { workspaceId: "ws-a", status: "failed" },
  });
  assert.equal(afterTerminal.status, 409);
  assert.equal(afterTerminal.body.error.code, "run_state_conflict");
});

test("internal runs:force membatalkan run aktif dan menandai meta forced", async () => {
  const { env: target } = await setup();
  await call(target, "POST", "/api/content-radar/runs", {
    token: RADAR_TOKEN,
    body: { workspaceId: "ws-a", kind: "selector" },
  });

  const forced = await call(target, "POST", "/api/content-radar/internal/runs:force", {
    token: RADAR_TOKEN,
    body: { workspaceId: "ws-a", kind: "selector", dryRun: true },
  });
  assert.equal(forced.status, 201, forced.text);
  assert.equal(forced.body.cancelled, 1);
  assert.equal(forced.body.run.meta.forced, true);
  assert.equal(forced.body.run.meta.dryRun, true);
  assert.equal(forced.body.run.status, "queued");
});

test("acknowledgement imported bersifat idempotent dan mengeluarkan draft dari daftar unimported", async () => {
  const { env: target, token } = await setup();
  const candidateId = await scoredCandidate(target, "ws-a");
  const drafted = await automaticDraft(target, "ws-a", candidateId);
  const draftId = drafted.body.draft.id;

  const before = await call(target, "GET", "/api/content-radar/drafts?workspace=ws-a&unimported=true", {
    token,
    actorId: "ja",
  });
  assert.equal(before.body.drafts.length, 1);

  const first = await call(target, "POST", `/api/content-radar/drafts/${draftId}/imported`, {
    token,
    actorId: "ja",
    body: { workspaceId: "ws-a" },
  });
  assert.equal(first.status, 200, first.text);
  assert.equal(first.body.alreadyImported, false);

  const second = await call(target, "POST", `/api/content-radar/drafts/${draftId}/imported`, {
    token,
    actorId: "ja",
    body: { workspaceId: "ws-a" },
  });
  assert.equal(second.status, 200, second.text);
  assert.equal(second.body.alreadyImported, true);
  assert.equal(second.body.importedAt, first.body.importedAt);

  const after = await call(target, "GET", "/api/content-radar/drafts?workspace=ws-a&unimported=true", {
    token,
    actorId: "ja",
  });
  assert.equal(after.body.drafts.length, 0);

  const missing = await call(target, "POST", "/api/content-radar/drafts/radardraft-missing/imported", {
    token,
    actorId: "ja",
    body: { workspaceId: "ws-a" },
  });
  assert.equal(missing.status, 404);
  assert.equal(missing.body.error.code, "draft_not_found");
});

test("read sources dan runs dibatasi dan workspace scoped", async () => {
  const { env: target, token } = await setup();
  await source(target, "ws-a", "src-example-com", "example.com", "B");
  await call(target, "POST", "/api/content-radar/runs", {
    token: RADAR_TOKEN,
    body: { workspaceId: "ws-a", kind: "collector" },
  });

  const sources = await call(target, "GET", "/api/content-radar/sources?workspace=ws-a", {
    token,
    actorId: "ja",
  });
  assert.equal(sources.status, 200);
  assert.equal(sources.body.sources.length, 1);
  assert.equal(sources.body.sources[0].domain, "example.com");

  const runs = await call(target, "GET", "/api/content-radar/runs?workspace=ws-a", {
    token,
    actorId: "ja",
  });
  assert.equal(runs.status, 200);
  assert.equal(runs.body.runs.length, 1);
  assert.equal(runs.body.runs[0].kind, "collector");

  const foreignSources = await call(target, "GET", "/api/content-radar/sources?workspace=ws-b", {
    token,
    actorId: "ja",
  });
  assert.equal(foreignSources.status, 403);
});

test("rute tidak dikenal di bawah prefix radar mengembalikan not_found", async () => {
  const { env: target, token } = await setup();
  const response = await call(target, "GET", "/api/content-radar/unknown", { token, actorId: "ja" });
  assert.equal(response.status, 404);
  assert.equal(response.body.error.code, "not_found");
});

test("tanpa token radar internal ditolak walau API_TOKEN manusia valid", async () => {
  const { env: target } = await setup();
  const response = await call(target, "POST", "/api/content-radar/runs", {
    token: API_TOKEN,
    actorId: "ja",
    body: { workspaceId: "ws-a", kind: "collector" },
  });
  assert.equal(response.status, 403);
  assert.equal(response.body.error.code, "forbidden_machine_only");
});

test("tanpa kredensial sama sekali read radar ditolak unauthorized", async () => {
  const { env: target } = await setup();
  const response = await call(target, "GET", "/api/content-radar/candidates?workspace=ws-a");
  assert.equal(response.status, 401);
  assert.equal(response.body.error.code, "unauthorized");
});

test("draft otomatis menolak kandidat yang belum diskor", async () => {
  const { env: target } = await setup();
  const ingested = await ingest(target, "ws-a");
  const response = await automaticDraft(target, "ws-a", ingested.body.candidateId);
  assert.equal(response.status, 409);
  assert.equal(response.body.error.code, "candidate_not_scored");
});

test("run workspace lain tidak dapat diperbarui", async () => {
  const { env: target } = await setup();
  const created = await call(target, "POST", "/api/content-radar/runs", {
    token: RADAR_TOKEN,
    body: { workspaceId: "ws-a", kind: "collector" },
  });
  const response = await call(target, "POST", `/api/content-radar/runs/${created.body.run.id}`, {
    token: RADAR_TOKEN,
    body: { workspaceId: "ws-b", status: "running" },
  });
  assert.equal(response.status, 404);
  assert.equal(response.body.error.code, "run_not_found");
});
