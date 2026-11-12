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
  RADAR_WORKSPACE_ID: "ws-a",
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

/**
 * Registers a trusted source the way the Owner would (`PATCH /sources/:id`).
 * Ingest never grants trust, so every fixture that expects a scored candidate
 * to be credible has to put the domain in the registry first.
 */
const ensureSource = (target, workspaceId, domain, tier = "A", kind = "media") =>
  target.DB.prepare(
    `INSERT OR IGNORE INTO content_radar_sources
       (workspace_id, id, domain, name, tier, kind, niches, enabled, requires_crosscheck, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, '["ai"]', 1, ?, ?, ?)`,
  )
    .bind(
      workspaceId,
      `srct-${domain.replace(/[^a-z0-9]+/g, "-")}`,
      domain,
      domain,
      tier,
      kind,
      tier === "D" ? 1 : 0,
      new Date().toISOString(),
      new Date().toISOString(),
    )
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
  const declared = overrides.candidate?.sourceDomain ?? overrides.source?.domain;
  const canonicalUrl = overrides.candidate?.canonicalUrl ?? "https://example.com/ai/launch?utm_source=feed";
  const domain = declared ?? new URL(canonicalUrl).hostname.toLowerCase();
  await ensureSource(target, workspaceId, domain, "A");
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

/**
 * Wraps the fake D1 so the *first* `countCryptoDrafts` read reports zero while
 * the real table already holds a crypto draft. That defeats the pre-check in
 * `createAutomaticDraft` and leaves the in-statement `WHERE … < 1` guard as the
 * only thing that can refuse the insert — which is the point of the test that
 * uses this.
 */
const hideFirstCryptoCount = (target) => {
  let reads = 0;
  const db = target.DB;
  const wrap = (statement, realFirst) => ({
    ...statement,
    first: async () => {
      reads += 1;
      return reads === 1 ? { total: 0 } : realFirst();
    },
  });
  return {
    ...target,
    DB: {
      prepare: (sql) => {
        const statement = db.prepare(sql);
        if (!/^\s*SELECT COUNT\(\*\) AS total FROM content_radar_drafts d\s+JOIN content_radar_candidates/.test(sql)) {
          return statement;
        }
        return {
          ...wrap(statement, () => statement.first()),
          bind: (...params) => {
            const bound = statement.bind(...params);
            return wrap(bound, () => bound.first());
          },
        };
      },
      batch: (statements) => db.batch(statements),
    },
  };
};

test("read workspace sendiri berhasil dan hanya memuat kandidat workspace itu", async () => {
  const { env: target, token } = await setup();
  await scoredCandidate(target, "ws-a");
  // A second collector identity bound to ws-b seeds the other workspace; the
  // ws-a machine token can no longer reach it.
  await scoredCandidate({ ...target, RADAR_WORKSPACE_ID: "ws-b" }, "ws-b", {
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
  const foreign = await scoredCandidate({ ...target, RADAR_WORKSPACE_ID: "ws-b" }, "ws-b", {
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

test("ingest tidak dapat memilih tier: domain baru selalu unverified dan discovered", async () => {
  const { env: target } = await setup();
  const response = await ingest(target, "ws-a", {
    source: { domain: "promoted.example", kind: "media", tier: "A" },
    candidate: {
      sourceDomain: "promoted.example",
      canonicalUrl: "https://promoted.example/ai/klaim",
      clusterKey: "cluster-promoted",
    },
  });
  assert.equal(response.status, 201, response.text);
  assert.equal(response.body.source.tier, "unverified");

  const row = await target.DB.prepare(
    "SELECT tier, kind, verified_at, verified_by FROM content_radar_sources WHERE workspace_id = ? AND domain = ?",
  )
    .bind("ws-a", "promoted.example")
    .first();
  assert.equal(row.tier, "unverified");
  assert.equal(row.kind, "discovered");
  assert.equal(row.verified_at, null);
  assert.equal(row.verified_by, null);

  const scored = await score(target, "ws-a", response.body.candidateId);
  assert.equal(scored.status, 200, scored.text);
  assert.equal(scored.body.score.components.credibility, 5);
  assert.equal(scored.body.score.components.evidence, 2);
});

test("re-ingest tidak dapat menaikkan tier atau memindahkan domain kandidat", async () => {
  const { env: target } = await setup();
  await ensureSource(target, "ws-a", "trusted.example", "A");
  const first = await ingest(target, "ws-a", {
    source: { domain: "low.example", kind: "media", tier: "D" },
    candidate: {
      sourceDomain: "low.example",
      canonicalUrl: "https://low.example/ai/low",
      clusterKey: "cluster-low",
    },
    provenance: [{ url: "https://low.example/ai/low", relation: "primary" }],
  });
  assert.equal(first.status, 201, first.text);

  const second = await ingest(target, "ws-a", {
    source: { domain: "trusted.example", kind: "media", tier: "A" },
    candidate: {
      sourceDomain: "trusted.example",
      canonicalUrl: "https://low.example/ai/low",
      clusterKey: "cluster-low",
    },
    provenance: [{ url: "https://low.example/ai/low", relation: "primary" }],
  });
  assert.equal(second.status, 200, second.text);
  assert.equal(second.body.candidateId, first.body.candidateId);

  const row = await target.DB.prepare(
    "SELECT source_domain, source_tier FROM content_radar_candidates WHERE workspace_id = ? AND id = ?",
  )
    .bind("ws-a", first.body.candidateId)
    .first();
  assert.equal(row.source_domain, "low.example");
  assert.equal(row.source_tier, "unverified");

  const scored = await score(target, "ws-a", first.body.candidateId);
  assert.equal(scored.status, 200, scored.text);
  assert.equal(scored.body.score.components.credibility, 5);
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
  await ensureSource(target, "ws-a", "example.com", "A");
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
  await ensureSource(target, "ws-a", "example.com", "A");
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
  await ensureSource(target, "ws-a", "example.com", "A");
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
  await ensureSource(target, "ws-a", "example.com", "A");
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

test("PATCH kandidat: Owner mereklasifikasi kandidat undrafted dan audit tercatat", async () => {
  const { env: target, token } = await setup();
  const ingested = await ingest(target, "ws-a", {
    candidate: {
      canonicalUrl: "https://example.com/ai/reclass",
      niche: "ai",
      clusterKey: "cluster-reclass",
    },
    provenance: [{ url: "https://example.com/ai/reclass", relation: "primary" }],
  });
  assert.equal(ingested.status, 201, ingested.text);
  const candidateId = ingested.body.candidateId;

  const patched = await call(target, "PATCH", `/api/content-radar/candidates/${candidateId}`, {
    token,
    actorId: "ja",
    body: { workspaceId: "ws-a", niche: "crypto" },
  });
  assert.equal(patched.status, 200, patched.text);
  assert.equal(patched.body.candidate.niche, "crypto");
  assert.equal(patched.body.candidate.status, "new");

  const row = await target.DB.prepare(
    "SELECT niche FROM content_radar_candidates WHERE workspace_id = ? AND id = ?",
  )
    .bind("ws-a", candidateId)
    .first();
  assert.equal(row.niche, "crypto");

  const audit = await target.DB.prepare(
    `SELECT actor_type, action, meta FROM activity_events
      WHERE workspace_id = ? AND entity_id = ? AND action = 'content_radar.candidate_reclassified'`,
  )
    .bind("ws-a", candidateId)
    .first();
  assert.equal(audit.actor_type, "owner");
  const meta = JSON.parse(audit.meta);
  assert.equal(meta.radarEntityType, "candidate");
  assert.equal(meta.clusterKey, "cluster-reclass");
  assert.equal(meta.from.niche, "ai");
  assert.equal(meta.to.niche, "crypto");
});

test("PATCH kandidat menolak reklasifikasi bila cluster sudah punya draft", async () => {
  const { env: target, token } = await setup();
  const drafted = await scoredCandidate(target, "ws-a", {
    candidate: {
      canonicalUrl: "https://example.com/ai/drafted-reclass",
      niche: "ai",
      clusterKey: "cluster-locked",
    },
    provenance: [{ url: "https://example.com/ai/drafted-reclass", relation: "primary" }],
  });
  assert.equal((await automaticDraft(target, "ws-a", drafted)).status, 201);

  const blocked = await call(target, "PATCH", `/api/content-radar/candidates/${drafted}`, {
    token,
    actorId: "ja",
    body: { workspaceId: "ws-a", niche: "crypto" },
  });
  assert.equal(blocked.status, 409);
  assert.equal(blocked.body.error.code, "niche_locked");

  const row = await target.DB.prepare(
    "SELECT niche, draft_id FROM content_radar_candidates WHERE workspace_id = ? AND id = ?",
  )
    .bind("ws-a", drafted)
    .first();
  assert.equal(row.niche, "ai");
  assert.ok(row.draft_id);

  const audits = await target.DB.prepare(
    "SELECT COUNT(*) AS total FROM activity_events WHERE workspace_id = ? AND action = 'content_radar.candidate_reclassified'",
  )
    .bind("ws-a")
    .first();
  assert.equal(audits.total, 0);

  // The draft row alone is enough: a candidate whose `draft_id` flag was lost
  // still cannot be relabelled while its cluster owns a draft.
  await target.DB.prepare(
    "UPDATE content_radar_candidates SET draft_id = NULL, status = 'qualified' WHERE workspace_id = ? AND id = ?",
  )
    .bind("ws-a", drafted)
    .run();
  const flagless = await call(target, "PATCH", `/api/content-radar/candidates/${drafted}`, {
    token,
    actorId: "ja",
    body: { workspaceId: "ws-a", niche: "crypto" },
  });
  assert.equal(flagless.status, 409);
  assert.equal(flagless.body.error.code, "niche_locked");
});

test("PATCH kandidat: no-op mengembalikan kandidat tanpa audit", async () => {
  const { env: target, token } = await setup();
  const ingested = await ingest(target, "ws-a", {
    candidate: {
      canonicalUrl: "https://example.com/ai/reclass-noop",
      niche: "ai",
      clusterKey: "cluster-reclass-noop",
    },
    provenance: [{ url: "https://example.com/ai/reclass-noop", relation: "primary" }],
  });
  assert.equal(ingested.status, 201, ingested.text);

  const response = await call(target, "PATCH", `/api/content-radar/candidates/${ingested.body.candidateId}`, {
    token,
    actorId: "ja",
    body: { workspaceId: "ws-a", niche: "ai" },
  });
  assert.equal(response.status, 200, response.text);
  assert.equal(response.body.candidate.niche, "ai");

  const audits = await target.DB.prepare(
    "SELECT COUNT(*) AS total FROM activity_events WHERE workspace_id = ? AND action = 'content_radar.candidate_reclassified'",
  )
    .bind("ws-a")
    .first();
  assert.equal(audits.total, 0);
});

test("PATCH kandidat: lock atomik menolak draft yang muncul setelah pre-check tanpa audit", async () => {
  const { env: target, token } = await setup();
  const ingested = await ingest(target, "ws-a", {
    candidate: {
      canonicalUrl: "https://example.com/ai/reclass-race",
      niche: "ai",
      clusterKey: "cluster-reclass-race",
    },
    provenance: [{ url: "https://example.com/ai/reclass-race", relation: "primary" }],
  });
  assert.equal(ingested.status, 201, ingested.text);
  const candidateId = ingested.body.candidateId;
  const db = target.DB;
  let injected = false;
  const raced = {
    ...target,
    DB: {
      prepare: (sql) => db.prepare(sql),
      batch: async (statements) => {
        if (!injected) {
          injected = true;
          await db.prepare(
            `INSERT INTO content_radar_drafts
              (workspace_id, id, candidate_id, post_id, cluster_key, auto_date_wib, creation_kind,
               title, document, status, score_snapshot, sources_snapshot, created_by, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, NULL, 'manual', ?, '{}', 'Draft', '{}', '[]', 'Owner', ?, ?)`,
          )
            .bind(
              "ws-a",
              "raddraft-race",
              candidateId,
              "post-race",
              "cluster-reclass-race",
              "Race lock",
              "2026-11-08T00:00:00.000Z",
              "2026-11-08T00:00:00.000Z",
            )
            .run();
        }
        return db.batch(statements);
      },
    },
  };

  const response = await call(raced, "PATCH", `/api/content-radar/candidates/${candidateId}`, {
    token,
    actorId: "ja",
    body: { workspaceId: "ws-a", niche: "crypto" },
  });
  assert.equal(response.status, 409, response.text);
  assert.equal(response.body.error.code, "niche_locked");

  const row = await db.prepare(
    "SELECT niche FROM content_radar_candidates WHERE workspace_id = ? AND id = ?",
  )
    .bind("ws-a", candidateId)
    .first();
  assert.equal(row.niche, "ai");
  const audits = await db.prepare(
    "SELECT COUNT(*) AS total FROM activity_events WHERE workspace_id = ? AND action = 'content_radar.candidate_reclassified'",
  )
    .bind("ws-a")
    .first();
  assert.equal(audits.total, 0);
});

test("PATCH kandidat: draft_id sendiri tetap mengunci tanpa draft row", async () => {
  const { env: target, token } = await setup();
  const drafted = await scoredCandidate(target, "ws-a", {
    candidate: {
      canonicalUrl: "https://example.com/ai/reclass-own-flag",
      niche: "ai",
      clusterKey: "cluster-reclass-own-flag",
    },
    provenance: [{ url: "https://example.com/ai/reclass-own-flag", relation: "primary" }],
  });
  assert.equal((await automaticDraft(target, "ws-a", drafted)).status, 201);
  await target.DB.prepare("PRAGMA foreign_keys = OFF").run();
  await target.DB.prepare("DELETE FROM content_radar_drafts WHERE workspace_id = ? AND candidate_id = ?")
    .bind("ws-a", drafted)
    .run();
  await target.DB.prepare("PRAGMA foreign_keys = ON").run();
  const db = target.DB;
  let batchCalled = false;
  const guarded = {
    ...target,
    DB: {
      prepare: (sql) => db.prepare(sql),
      batch: (statements) => {
        batchCalled = true;
        return db.batch(statements);
      },
    },
  };

  const response = await call(guarded, "PATCH", `/api/content-radar/candidates/${drafted}`, {
    token,
    actorId: "ja",
    body: { workspaceId: "ws-a", niche: "crypto" },
  });
  assert.equal(response.status, 409, response.text);
  assert.equal(response.body.error.code, "niche_locked");
  assert.equal(batchCalled, false);
  const row = await target.DB.prepare(
    "SELECT niche, draft_id FROM content_radar_candidates WHERE workspace_id = ? AND id = ?",
  )
    .bind("ws-a", drafted)
    .first();
  assert.equal(row.niche, "ai");
  assert.ok(row.draft_id);
});

test("PATCH kandidat: sibling draft_id tetap mengunci saat draft row berbeda cluster", async () => {
  const { env: target, token } = await setup();
  const ingested = await ingest(target, "ws-a", {
    candidate: {
      canonicalUrl: "https://example.com/ai/reclass-sibling-target",
      niche: "ai",
      clusterKey: "cluster-reclass-sibling",
    },
    provenance: [{ url: "https://example.com/ai/reclass-sibling-target", relation: "primary" }],
  });
  assert.equal(ingested.status, 201, ingested.text);
  const targetId = ingested.body.candidateId;
  const siblingIngested = await ingest(target, "ws-a", {
    candidate: {
      canonicalUrl: "https://example.com/ai/reclass-sibling-drafted",
      niche: "ai",
      clusterKey: "cluster-reclass-other",
    },
    provenance: [{ url: "https://example.com/ai/reclass-sibling-drafted", relation: "primary" }],
  });
  assert.equal(siblingIngested.status, 201, siblingIngested.text);
  const sibling = siblingIngested.body.candidateId;
  await target.DB.prepare(
    `INSERT INTO content_radar_drafts
      (workspace_id, id, candidate_id, post_id, cluster_key, auto_date_wib, creation_kind,
       title, document, status, score_snapshot, sources_snapshot, created_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, NULL, 'manual', ?, '{}', 'Draft', '{}', '[]', 'Owner', ?, ?)`,
  )
    .bind(
      "ws-a",
      "raddraft-sibling",
      sibling,
      "post-sibling",
      "cluster-reclass-other",
      "Sibling lock",
      "2026-11-08T00:00:00.000Z",
      "2026-11-08T00:00:00.000Z",
    )
    .run();
  await target.DB.prepare(
    "UPDATE content_radar_candidates SET draft_id = ?, status = 'drafted' WHERE workspace_id = ? AND id = ?",
  )
    .bind("raddraft-sibling", "ws-a", sibling)
    .run();
  await target.DB.prepare("DROP INDEX ux_content_radar_candidates_cluster").run();
  await target.DB.prepare(
    "UPDATE content_radar_candidates SET cluster_key = ? WHERE workspace_id = ? AND id = ?",
  )
    .bind("cluster-reclass-sibling", "ws-a", sibling)
    .run();

  const response = await call(target, "PATCH", `/api/content-radar/candidates/${targetId}`, {
    token,
    actorId: "ja",
    body: { workspaceId: "ws-a", niche: "crypto" },
  });
  assert.equal(response.status, 409, response.text);
  assert.equal(response.body.error.code, "niche_locked");
  const row = await target.DB.prepare(
    "SELECT niche, draft_id FROM content_radar_candidates WHERE workspace_id = ? AND id = ?",
  )
    .bind("ws-a", targetId)
    .first();
  assert.equal(row.niche, "ai");
  assert.equal(row.draft_id, null);
});

test("PATCH kandidat menolak mesin, id tak dikenal, dan niche tidak valid", async () => {
  const { env: target, token } = await setup();
  const ingested = await ingest(target, "ws-a", {
    candidate: {
      canonicalUrl: "https://example.com/ai/guarded",
      niche: "ai",
      clusterKey: "cluster-guarded",
    },
    provenance: [{ url: "https://example.com/ai/guarded", relation: "primary" }],
  });
  assert.equal(ingested.status, 201, ingested.text);
  const candidateId = ingested.body.candidateId;

  const machine = await call(target, "PATCH", `/api/content-radar/candidates/${candidateId}`, {
    token: RADAR_TOKEN,
    body: { workspaceId: "ws-a", niche: "crypto" },
  });
  assert.equal(machine.status, 403);
  assert.equal(machine.body.error.code, "forbidden_owner_only");

  const unknown = await call(target, "PATCH", "/api/content-radar/candidates/radcand-missing", {
    token,
    actorId: "ja",
    body: { workspaceId: "ws-a", niche: "crypto" },
  });
  assert.equal(unknown.status, 404);
  assert.equal(unknown.body.error.code, "candidate_not_found");

  const invalid = await call(target, "PATCH", `/api/content-radar/candidates/${candidateId}`, {
    token,
    actorId: "ja",
    body: { workspaceId: "ws-a", niche: "kuliner" },
  });
  assert.equal(invalid.status, 400);
  assert.equal(invalid.body.error.code, "validation_failed");

  const row = await target.DB.prepare(
    "SELECT niche FROM content_radar_candidates WHERE workspace_id = ? AND id = ?",
  )
    .bind("ws-a", candidateId)
    .first();
  assert.equal(row.niche, "ai");

  const audits = await target.DB.prepare(
    "SELECT COUNT(*) AS total FROM activity_events WHERE workspace_id = ? AND action = 'content_radar.candidate_reclassified'",
  )
    .bind("ws-a")
    .first();
  assert.equal(audits.total, 0);
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
  assert.equal(response.status, 403);
  assert.equal(response.body.error.code, "forbidden_workspace");

  const ownWorkspace = await call(target, "POST", `/api/content-radar/runs/${created.body.run.id}`, {
    token: RADAR_TOKEN,
    body: { workspaceId: "ws-a", status: "running" },
  });
  assert.equal(ownWorkspace.status, 200, ownWorkspace.text);
});

test("asOf kiriman klien tidak mengubah skor maupun kelayakan draft", async () => {
  const { env: target } = await setup();
  await ensureSource(target, "ws-a", "example.com", "A");
  const publishedAt = iso(-120 * 3_600_000);
  const ingested = await ingest(target, "ws-a", {
    candidate: { publishedAt },
    provenance: [{ url: "https://example.com/ai/launch", relation: "primary" }],
  });

  const honest = await score(target, "ws-a", ingested.body.candidateId);
  assert.equal(honest.status, 200, honest.text);
  assert.equal(honest.body.score.components.freshness, 0);
  assert.equal(honest.body.score.total, 81);
  assert.ok(honest.body.score.inputSnapshot.ageHours > 100);

  const forgedAsOf = new Date(Date.parse(publishedAt) + 3_600_000).toISOString();
  const forged = await score(target, "ws-a", ingested.body.candidateId, { asOf: forgedAsOf });
  assert.equal(forged.status, 200, forged.text);
  assert.equal(forged.body.score.total, honest.body.score.total);
  assert.equal(forged.body.score.components.freshness, 0);
  assert.ok(
    Math.abs(forged.body.score.inputSnapshot.ageHours - honest.body.score.inputSnapshot.ageHours) < 0.01,
  );
  assert.ok(Date.parse(forged.body.score.inputSnapshot.asOf) > Date.now() - 60_000);
  assert.ok(forged.body.score.inputSnapshot.asOf !== forgedAsOf);

  const draft = await automaticDraft(target, "ws-a", ingested.body.candidateId);
  assert.equal(draft.status, 409);
  assert.equal(draft.body.error.code, "draft_not_eligible");
  assert.ok(draft.body.error.details.reasons.includes("outside_24h_window"));
});

test("draft otomatis mengevaluasi ulang jendela 24 jam dengan jam server", async () => {
  const { env: target } = await setup();
  await ensureSource(target, "ws-a", "example.com", "A");
  const publishedAt = iso(-30 * 3_600_000);
  const ingested = await ingest(target, "ws-a", {
    candidate: { publishedAt },
    provenance: [{ url: "https://example.com/ai/launch", relation: "primary" }],
  });
  const scored = await score(target, "ws-a", ingested.body.candidateId);
  assert.equal(scored.status, 200, scored.text);

  // Snapshot frozen when the article was one hour old: internally consistent
  // (ageHours 1, freshness 15) but 29 hours stale by draft time.
  const frozen = {
    ...scored.body.score.inputSnapshot,
    asOf: new Date(Date.parse(publishedAt) + 3_600_000).toISOString(),
  };
  await target.DB.prepare(
    "UPDATE content_radar_candidates SET score_input_snapshot = ?, score_total = 96 WHERE workspace_id = ? AND id = ?",
  )
    .bind(JSON.stringify(frozen), "ws-a", ingested.body.candidateId)
    .run();

  const response = await automaticDraft(target, "ws-a", ingested.body.candidateId);
  assert.equal(response.status, 409);
  assert.equal(response.body.error.code, "draft_not_eligible");
  assert.ok(response.body.error.details.reasons.includes("outside_24h_window"));

  const drafts = await target.DB.prepare(
    "SELECT COUNT(*) AS total FROM content_radar_drafts WHERE workspace_id = ?",
  )
    .bind("ws-a")
    .first();
  assert.equal(drafts.total, 0);
});

test("sumber unverified tidak dapat memenuhi syarat draft lewat primary self-declared", async () => {
  const { env: target } = await setup();
  const ingested = await ingest(target, "ws-a", {
    source: { domain: "shady.example", kind: "media", tier: "A" },
    candidate: {
      sourceDomain: "shady.example",
      canonicalUrl: "https://shady.example/ai/klaim",
      clusterKey: "cluster-shady",
    },
    provenance: [
      { url: "https://shady.example/ai/klaim", relation: "primary" },
      { url: "https://junk.example/ai/klaim", relation: "crosscheck" },
    ],
  });
  assert.equal(ingested.status, 201, ingested.text);

  const scored = await score(target, "ws-a", ingested.body.candidateId);
  assert.equal(scored.status, 200, scored.text);
  assert.equal(scored.body.score.components.credibility, 5);
  assert.equal(scored.body.score.components.evidence, 2);
  assert.equal(scored.body.score.total, 62);

  const draft = await automaticDraft(target, "ws-a", ingested.body.candidateId);
  assert.equal(draft.status, 409);
  assert.equal(draft.body.error.code, "draft_not_eligible");
  assert.ok(draft.body.error.details.reasons.includes("insufficient_crosscheck"));
  assert.ok(draft.body.error.details.reasons.includes("score_below_75"));
});

test("niche eksplisit yang berbeda tidak membatalkan refresh kandidat drafted", async () => {
  const { env: target } = await setup();
  const first = await scoredCandidate(target, "ws-a", {
    candidate: {
      canonicalUrl: "https://example.com/crypto/one",
      niche: "crypto",
      clusterKey: "cluster-crypto-1",
    },
    provenance: [{ url: "https://example.com/crypto/one", relation: "primary" }],
  });
  assert.equal((await automaticDraft(target, "ws-a", first)).status, 201);
  await target.DB.prepare(
    "UPDATE content_radar_candidates SET last_seen_at = ? WHERE workspace_id = ? AND id = ?",
  )
    .bind(iso(-3_600_000), "ws-a", first)
    .run();

  const flipped = await ingest(target, "ws-a", {
    candidate: {
      canonicalUrl: "https://example.com/crypto/one",
      niche: "ai",
      clusterKey: "cluster-crypto-1",
      title: "Judul setelah reklasifikasi",
      summary: "Ringkasan baru",
    },
    provenance: [
      { url: "https://example.com/crypto/one", relation: "primary" },
      { url: "https://other.example.org/crypto/one", relation: "crosscheck" },
    ],
  });
  assert.equal(flipped.status, 200, flipped.text);
  assert.equal(flipped.body.nicheLocked, true);
  assert.equal(flipped.body.niche, "crypto");

  const row = await target.DB.prepare(
    `SELECT niche, status, draft_id, title, summary, last_seen_at
       FROM content_radar_candidates WHERE workspace_id = ? AND id = ?`,
  )
    .bind("ws-a", first)
    .first();
  assert.equal(row.niche, "crypto");
  assert.equal(row.status, "drafted");
  assert.ok(row.draft_id);
  assert.equal(row.title, "Judul setelah reklasifikasi");
  assert.equal(row.summary, "Ringkasan baru");
  assert.ok(Date.parse(row.last_seen_at) > Date.now() - 60_000);

  // The provenance batch still ran even though the niche was refused.
  const provenance = await target.DB.prepare(
    "SELECT COUNT(*) AS total FROM content_radar_candidate_sources WHERE workspace_id = ? AND candidate_id = ?",
  )
    .bind("ws-a", first)
    .first();
  assert.equal(provenance.total, 2);

  // The crypto quota is counted through the stored niche, so it still holds.
  const second = await scoredCandidate(target, "ws-a", {
    candidate: {
      canonicalUrl: "https://example.com/crypto/two",
      niche: "crypto",
      clusterKey: "cluster-crypto-2",
    },
    provenance: [{ url: "https://example.com/crypto/two", relation: "primary" }],
  });
  const blocked = await automaticDraft(target, "ws-a", second);
  assert.equal(blocked.status, 409);
  assert.equal(blocked.body.error.code, "crypto_draft_cap_reached");

  const automatic = await target.DB.prepare(
    "SELECT COUNT(*) AS total FROM content_radar_drafts WHERE workspace_id = ? AND creation_kind = 'automatic'",
  )
    .bind("ws-a")
    .first();
  assert.equal(automatic.total, 1);

  // An undrafted candidate is refreshed too — the stored niche wins, the value
  // is reported as ignored, and nothing aborts the write.
  const plain = await ingest(target, "ws-a", {
    candidate: {
      canonicalUrl: "https://example.com/ai/plain",
      niche: "ai",
      clusterKey: "cluster-plain",
      title: "Judul awal",
      summary: "Ringkasan awal",
    },
    provenance: [{ url: "https://example.com/ai/plain", relation: "primary" }],
  });
  assert.equal(plain.status, 201, plain.text);
  await target.DB.prepare(
    "UPDATE content_radar_candidates SET last_seen_at = ? WHERE workspace_id = ? AND id = ?",
  )
    .bind(iso(-3_600_000), "ws-a", plain.body.candidateId)
    .run();

  const relabelled = await ingest(target, "ws-a", {
    candidate: {
      canonicalUrl: "https://example.com/ai/plain",
      niche: "crypto",
      clusterKey: "cluster-plain",
      title: "Judul setelah percobaan reklasifikasi",
      summary: "Ringkasan setelah percobaan",
    },
    provenance: [
      { url: "https://example.com/ai/plain", relation: "primary" },
      { url: "https://other.example.org/ai/plain", relation: "crosscheck" },
    ],
  });
  assert.equal(relabelled.status, 200, relabelled.text);
  assert.equal(relabelled.body.nicheLocked, true);
  assert.equal(relabelled.body.niche, "ai");

  const plainRow = await target.DB.prepare(
    `SELECT niche, title, summary, last_seen_at FROM content_radar_candidates
      WHERE workspace_id = ? AND id = ?`,
  )
    .bind("ws-a", plain.body.candidateId)
    .first();
  assert.equal(plainRow.niche, "ai");
  assert.equal(plainRow.title, "Judul setelah percobaan reklasifikasi");
  assert.equal(plainRow.summary, "Ringkasan setelah percobaan");
  assert.ok(Date.parse(plainRow.last_seen_at) > Date.now() - 60_000);

  const plainProvenance = await target.DB.prepare(
    "SELECT COUNT(*) AS total FROM content_radar_candidate_sources WHERE workspace_id = ? AND candidate_id = ?",
  )
    .bind("ws-a", plain.body.candidateId)
    .first();
  assert.equal(plainProvenance.total, 2);
});

test("niche berbeda pada kandidat undrafted tidak memindahkannya ke kuota crypto", async () => {
  const { env: target } = await setup();
  const first = await scoredCandidate(target, "ws-a", {
    candidate: {
      canonicalUrl: "https://example.com/crypto/one",
      niche: "crypto",
      clusterKey: "cluster-crypto-1",
    },
    provenance: [{ url: "https://example.com/crypto/one", relation: "primary" }],
  });
  assert.equal((await automaticDraft(target, "ws-a", first)).status, 201);

  // Undrafted `ai` candidate that the collector now believes is crypto.
  const plain = await scoredCandidate(target, "ws-a", {
    candidate: {
      canonicalUrl: "https://example.com/ai/drift",
      niche: "ai",
      clusterKey: "cluster-drift",
    },
    provenance: [{ url: "https://example.com/ai/drift", relation: "primary" }],
  });
  const drift = await ingest(target, "ws-a", {
    candidate: {
      canonicalUrl: "https://example.com/ai/drift",
      niche: "crypto",
      clusterKey: "cluster-drift",
    },
    provenance: [{ url: "https://example.com/ai/drift", relation: "primary" }],
  });
  assert.equal(drift.status, 200, drift.text);
  assert.equal(drift.body.nicheLocked, true);
  assert.equal(drift.body.niche, "ai");

  // A second crypto draft is still impossible after the attempt.
  const second = await scoredCandidate(target, "ws-a", {
    candidate: {
      canonicalUrl: "https://example.com/crypto/two",
      niche: "crypto",
      clusterKey: "cluster-crypto-2",
    },
    provenance: [{ url: "https://example.com/crypto/two", relation: "primary" }],
  });
  const blocked = await automaticDraft(target, "ws-a", second);
  assert.equal(blocked.status, 409);
  assert.equal(blocked.body.error.code, "crypto_draft_cap_reached");

  const cryptoDrafts = () =>
    target.DB.prepare(
      `SELECT COUNT(*) AS total FROM content_radar_drafts d
         JOIN content_radar_candidates c
           ON c.workspace_id = d.workspace_id AND c.id = d.candidate_id
        WHERE d.workspace_id = ? AND c.niche = 'crypto'`,
    )
      .bind("ws-a")
      .first();
  assert.equal((await cryptoDrafts()).total, 1);

  // The drifted candidate still behaves as `ai`: it is draftable, and the draft
  // it produces is not counted against the crypto quota.
  assert.equal((await automaticDraft(target, "ws-a", plain)).status, 201);
  assert.equal((await cryptoDrafts()).total, 1);
});

test("re-ingest tanpa niche mempertahankan klasifikasi dan menyegarkan kandidat drafted", async () => {
  const { env: target } = await setup();
  const first = await scoredCandidate(target, "ws-a", {
    candidate: {
      canonicalUrl: "https://example.com/crypto/one",
      niche: "crypto",
      clusterKey: "cluster-crypto-1",
    },
    provenance: [{ url: "https://example.com/crypto/one", relation: "primary" }],
  });
  assert.equal((await automaticDraft(target, "ws-a", first)).status, 201);
  await target.DB.prepare(
    "UPDATE content_radar_candidates SET last_seen_at = ? WHERE workspace_id = ? AND id = ?",
  )
    .bind(iso(-3_600_000), "ws-a", first)
    .run();
  const before = await target.DB.prepare(
    "SELECT last_seen_at, niche FROM content_radar_candidates WHERE workspace_id = ? AND id = ?",
  )
    .bind("ws-a", first)
    .first();

  // `niche: undefined` is dropped by JSON.stringify, so the collector sends a
  // routine refresh with no classification at all.
  const refresh = await ingest(target, "ws-a", {
    candidate: {
      canonicalUrl: "https://example.com/crypto/one",
      niche: undefined,
      clusterKey: "cluster-crypto-1",
      title: "Judul diperbarui",
      summary: "Ringkasan diperbarui",
    },
    provenance: [{ url: "https://example.com/crypto/one", relation: "primary" }],
  });
  assert.equal(refresh.status, 200, refresh.text);
  assert.equal(refresh.body.created, false);
  assert.equal(refresh.body.niche, "crypto");
  assert.equal(refresh.body.nicheLocked, false);

  const after = await target.DB.prepare(
    "SELECT niche, title, summary, last_seen_at FROM content_radar_candidates WHERE workspace_id = ? AND id = ?",
  )
    .bind("ws-a", first)
    .first();
  assert.equal(after.niche, "crypto");
  assert.equal(after.title, "Judul diperbarui");
  assert.equal(after.summary, "Ringkasan diperbarui");
  assert.ok(Date.parse(after.last_seen_at) > Date.parse(before.last_seen_at));
  assert.ok(Date.parse(after.last_seen_at) > Date.now() - 60_000);

  const drafts = await target.DB.prepare(
    "SELECT COUNT(*) AS total FROM content_radar_drafts WHERE workspace_id = ? AND creation_kind = 'automatic'",
  )
    .bind("ws-a")
    .first();
  assert.equal(drafts.total, 1);

  // A brand-new candidate still has to declare its niche.
  const missing = await ingest(target, "ws-a", {
    candidate: {
      canonicalUrl: "https://example.com/ai/no-niche",
      niche: undefined,
      clusterKey: "cluster-no-niche",
    },
    provenance: [{ url: "https://example.com/ai/no-niche", relation: "primary" }],
  });
  assert.equal(missing.status, 400);
  assert.equal(missing.body.error.code, "validation_failed");
});

test("dua domain dengan slug sama dapat diingest bersamaan", async () => {
  const { env: target } = await setup();
  const first = await ingest(target, "ws-a", {
    source: { domain: "foo.bar.com", kind: "media" },
    candidate: {
      sourceDomain: "foo.bar.com",
      canonicalUrl: "https://foo.bar.com/ai/satu",
      clusterKey: "cluster-foo-dot",
    },
  });
  const second = await ingest(target, "ws-a", {
    source: { domain: "foo-bar.com", kind: "media" },
    candidate: {
      sourceDomain: "foo-bar.com",
      canonicalUrl: "https://foo-bar.com/ai/dua",
      clusterKey: "cluster-foo-dash",
    },
  });
  assert.equal(first.status, 201, first.text);
  assert.equal(second.status, 201, second.text);
  assert.match(first.body.source.id, /^src-foo-bar-com-[0-9a-f]{8}$/);
  assert.match(second.body.source.id, /^src-foo-bar-com-[0-9a-f]{8}$/);
  assert.notEqual(first.body.source.id, second.body.source.id);

  const rows = await target.DB.prepare(
    "SELECT id, domain FROM content_radar_sources WHERE workspace_id = ? AND domain IN ('foo.bar.com', 'foo-bar.com') ORDER BY domain ASC",
  )
    .bind("ws-a")
    .all();
  assert.equal(rows.results.length, 2);
  assert.notEqual(rows.results[0].id, rows.results[1].id);
});

test("workspace tidak dapat dienumerasi sebelum autentikasi", async () => {
  const { env: target } = await setup();
  await source(target, "ws-a", "src-example-com", "example.com", "B");

  const readExisting = await call(target, "GET", "/api/content-radar/candidates?workspace=ws-a");
  const readMissing = await call(target, "GET", "/api/content-radar/candidates?workspace=tidak-ada");
  assert.equal(readExisting.status, 401);
  assert.equal(readMissing.status, 401);
  assert.equal(readMissing.body.error.code, "unauthorized");

  const patchExisting = await call(target, "PATCH", "/api/content-radar/sources/src-example-com", {
    body: { workspaceId: "ws-a", tier: "C" },
  });
  const patchMissing = await call(target, "PATCH", "/api/content-radar/sources/src-example-com", {
    body: { workspaceId: "tidak-ada", tier: "C" },
  });
  assert.equal(patchExisting.status, 401);
  assert.equal(patchMissing.status, 401);

  const rejectExisting = await call(target, "POST", "/api/content-radar/candidates/radcand-x/reject", {
    body: { workspaceId: "ws-a", reason: "x" },
  });
  const rejectMissing = await call(target, "POST", "/api/content-radar/candidates/radcand-x/reject", {
    body: { workspaceId: "tidak-ada", reason: "x" },
  });
  assert.equal(rejectExisting.status, 401);
  assert.equal(rejectMissing.status, 401);

  const ackExisting = await call(target, "POST", "/api/content-radar/drafts/radardraft-x/imported", {
    body: { workspaceId: "ws-a" },
  });
  const ackMissing = await call(target, "POST", "/api/content-radar/drafts/radardraft-x/imported", {
    body: { workspaceId: "tidak-ada" },
  });
  assert.equal(ackExisting.status, 401);
  assert.equal(ackMissing.status, 401);
});

test("rute mesin gagal tertutup saat RADAR_WORKSPACE_ID tidak diset", async () => {
  const { env: target } = await setup();
  const unbound = { ...target, RADAR_WORKSPACE_ID: undefined };

  const ingestResponse = await call(unbound, "POST", "/api/content-radar/candidates:ingest", {
    token: RADAR_TOKEN,
    body: {
      workspaceId: "ws-a",
      candidate: { canonicalUrl: "https://example.com/ai/unbound", title: "Unbound", niche: "ai" },
    },
  });
  assert.equal(ingestResponse.status, 503);
  assert.equal(ingestResponse.body.error.code, "machine_not_configured");

  const readResponse = await call(unbound, "GET", "/api/content-radar/candidates?workspace=ws-a", {
    token: RADAR_TOKEN,
  });
  assert.equal(readResponse.status, 503);
  assert.equal(readResponse.body.error.code, "machine_not_configured");

  const humanRead = await call(unbound, "GET", "/api/content-radar/candidates?workspace=ws-a", {
    token: API_TOKEN,
    actorId: "ja",
  });
  assert.equal(humanRead.status, 200, humanRead.text);
});

test("mesin tidak dapat menyentuh workspace lain", async () => {
  const { env: target } = await setup();
  const write = await ingest(target, "ws-b", {
    candidate: { canonicalUrl: "https://example.com/ai/wsb", clusterKey: "cluster-wsb" },
  });
  assert.equal(write.status, 403);
  assert.equal(write.body.error.code, "forbidden_workspace");

  const read = await call(target, "GET", "/api/content-radar/candidates?workspace=ws-b", {
    token: RADAR_TOKEN,
  });
  assert.equal(read.status, 403);
  assert.equal(read.body.error.code, "forbidden_workspace");

  const own = await call(target, "GET", "/api/content-radar/candidates?workspace=ws-a", {
    token: RADAR_TOKEN,
  });
  assert.equal(own.status, 200, own.text);
});

test("rute Owner membutuhkan x-actor-id eksplisit", async () => {
  const { env: target, token } = await setup();
  await source(target, "ws-a", "src-example-com", "example.com", "B");
  const candidateId = await scoredCandidate(target, "ws-a");

  const reject = await call(target, "POST", `/api/content-radar/candidates/${candidateId}/reject`, {
    token,
    body: { workspaceId: "ws-a", reason: "x" },
  });
  assert.equal(reject.status, 400);
  assert.equal(reject.body.error.code, "actor_required");

  const patch = await call(target, "PATCH", "/api/content-radar/sources/src-example-com", {
    token,
    body: { workspaceId: "ws-a", tier: "C" },
  });
  assert.equal(patch.status, 400);
  assert.equal(patch.body.error.code, "actor_required");

  const manual = await call(target, "POST", `/api/content-radar/candidates/${candidateId}/draft`, {
    token,
    body: { workspaceId: "ws-a" },
  });
  assert.equal(manual.status, 400);
  assert.equal(manual.body.error.code, "actor_required");

  const candidate = await target.DB.prepare(
    "SELECT status, draft_id FROM content_radar_candidates WHERE workspace_id = ? AND id = ?",
  )
    .bind("ws-a", candidateId)
    .first();
  assert.equal(candidate.status, "qualified");
  assert.equal(candidate.draft_id, null);

  const sourceRow = await target.DB.prepare(
    "SELECT tier FROM content_radar_sources WHERE workspace_id = ? AND id = ?",
  )
    .bind("ws-a", "src-example-com")
    .first();
  assert.equal(sourceRow.tier, "B");
});

test("acknowledgement imported menolak identitas mesin", async () => {
  const { env: target } = await setup();
  const candidateId = await scoredCandidate(target, "ws-a");
  const drafted = await automaticDraft(target, "ws-a", candidateId);
  const draftId = drafted.body.draft.id;

  const response = await call(target, "POST", `/api/content-radar/drafts/${draftId}/imported`, {
    token: RADAR_TOKEN,
    body: { workspaceId: "ws-a" },
  });
  assert.equal(response.status, 403);
  assert.equal(response.body.error.code, "forbidden_human_only");

  const row = await target.DB.prepare(
    "SELECT imported_at FROM content_radar_drafts WHERE workspace_id = ? AND id = ?",
  )
    .bind("ws-a", draftId)
    .first();
  assert.equal(row.imported_at, null);

  const queue = await call(target, "GET", "/api/content-radar/drafts?workspace=ws-a&unimported=true", {
    token: API_TOKEN,
    actorId: "ja",
  });
  assert.equal(queue.body.drafts.length, 1);
});

test("Owner dapat mengoreksi kind sumber discovered, mesin tidak", async () => {
  const { env: target, token } = await setup();
  const ingested = await ingest(target, "ws-a", {
    source: { domain: "regulator.example", kind: "media", tier: "A" },
    candidate: {
      sourceDomain: "regulator.example",
      canonicalUrl: "https://regulator.example/ai/aturan",
      clusterKey: "cluster-regulator",
    },
    provenance: [{ url: "https://regulator.example/ai/aturan", relation: "primary" }],
  });
  assert.equal(ingested.status, 201, ingested.text);
  const sourceId = ingested.body.source.id;

  const initial = await target.DB.prepare(
    "SELECT tier, kind FROM content_radar_sources WHERE workspace_id = ? AND id = ?",
  )
    .bind("ws-a", sourceId)
    .first();
  assert.equal(initial.tier, "unverified");
  assert.equal(initial.kind, "discovered");

  // A machine cannot relabel the registry, not even to the truth.
  const machine = await call(target, "PATCH", `/api/content-radar/sources/${sourceId}`, {
    token: RADAR_TOKEN,
    body: { workspaceId: "ws-a", kind: "official" },
  });
  assert.equal(machine.status, 403);
  assert.equal(machine.body.error.code, "forbidden_owner_only");

  const unchanged = await target.DB.prepare(
    "SELECT tier, kind FROM content_radar_sources WHERE workspace_id = ? AND id = ?",
  )
    .bind("ws-a", sourceId)
    .first();
  assert.equal(unchanged.tier, "unverified");
  assert.equal(unchanged.kind, "discovered");

  // The Owner corrects kind and tier in one request.
  const corrected = await call(target, "PATCH", `/api/content-radar/sources/${sourceId}`, {
    token,
    actorId: "ja",
    body: { workspaceId: "ws-a", kind: "regulator", tier: "A" },
  });
  assert.equal(corrected.status, 200, corrected.text);
  assert.equal(corrected.body.source.kind, "regulator");
  assert.equal(corrected.body.source.tier, "A");
  assert.equal(corrected.body.source.requiresCrosscheck, false);
  assert.equal(corrected.body.source.verifiedBy, "ja");

  // The Tier D coupling still lands in the same UPDATE as the relabel.
  const tierD = await call(target, "PATCH", `/api/content-radar/sources/${sourceId}`, {
    token,
    actorId: "ja",
    body: { workspaceId: "ws-a", kind: "official", tier: "D" },
  });
  assert.equal(tierD.status, 200, tierD.text);
  assert.equal(tierD.body.source.kind, "official");
  assert.equal(tierD.body.source.tier, "D");
  assert.equal(tierD.body.source.requiresCrosscheck, true);

  const row = await target.DB.prepare(
    "SELECT tier, kind, requires_crosscheck FROM content_radar_sources WHERE workspace_id = ? AND id = ?",
  )
    .bind("ws-a", sourceId)
    .first();
  assert.equal(row.kind, "official");
  assert.equal(row.tier, "D");
  assert.equal(row.requires_crosscheck, 1);

  // Both kind moves are audited, old value and new value.
  const audits = await target.DB.prepare(
    `SELECT meta FROM activity_events
      WHERE workspace_id = ? AND action = 'content_radar.source_updated'
      ORDER BY rowid ASC`,
  )
    .bind("ws-a")
    .all();
  assert.equal(audits.results.length, 2);
  const first = JSON.parse(audits.results[0].meta);
  assert.equal(first.from.kind, "discovered");
  assert.equal(first.to.kind, "regulator");
  assert.equal(first.to.tier, "A");
  const second = JSON.parse(audits.results[1].meta);
  assert.equal(second.from.kind, "regulator");
  assert.equal(second.to.kind, "official");
  assert.equal(second.to.requiresCrosscheck, true);
});

test("mesin terikat tidak dapat membedakan workspace lain dari workspace yang tidak ada", async () => {
  const { env: target } = await setup();

  const existingRead = await call(target, "GET", "/api/content-radar/candidates?workspace=ws-b", {
    token: RADAR_TOKEN,
  });
  const missingRead = await call(target, "GET", "/api/content-radar/candidates?workspace=tidak-ada", {
    token: RADAR_TOKEN,
  });
  assert.equal(existingRead.status, 403);
  assert.equal(missingRead.status, 403);
  assert.equal(existingRead.status, missingRead.status);
  assert.equal(existingRead.body.error.code, "forbidden_workspace");
  assert.equal(missingRead.body.error.code, "forbidden_workspace");
  // Byte-identical bodies: nothing about the named workspace leaks.
  assert.deepEqual(missingRead.body, existingRead.body);

  const existingWrite = await ingest(target, "ws-b", {
    candidate: { canonicalUrl: "https://example.com/ai/probe-b", clusterKey: "cluster-probe-b" },
  });
  const missingWrite = await ingest(target, "tidak-ada", {
    candidate: { canonicalUrl: "https://example.com/ai/probe-x", clusterKey: "cluster-probe-x" },
  });
  assert.equal(existingWrite.status, 403);
  assert.equal(missingWrite.status, 403);
  assert.equal(missingWrite.body.error.code, "forbidden_workspace");
  assert.deepEqual(missingWrite.body, existingWrite.body);

  const own = await call(target, "GET", "/api/content-radar/candidates?workspace=ws-a", {
    token: RADAR_TOKEN,
  });
  assert.equal(own.status, 200, own.text);
});

test("cap crypto di dalam statement tetap menolak walau pre-check dilewati", async () => {
  const { env: target } = await setup();
  const first = await scoredCandidate(target, "ws-a", {
    candidate: {
      canonicalUrl: "https://example.com/crypto/one",
      niche: "crypto",
      clusterKey: "cluster-crypto-1",
    },
    provenance: [{ url: "https://example.com/crypto/one", relation: "primary" }],
  });
  assert.equal((await automaticDraft(target, "ws-a", first)).status, 201);

  const second = await scoredCandidate(target, "ws-a", {
    candidate: {
      canonicalUrl: "https://example.com/crypto/two",
      niche: "crypto",
      clusterKey: "cluster-crypto-2",
    },
    provenance: [{ url: "https://example.com/crypto/two", relation: "primary" }],
  });

  // The pre-check now sees zero crypto drafts, so only the `WHERE (SELECT
  // COUNT(*) …) < 1` predicate inside the INSERT can refuse the row.
  const blocked = await automaticDraft(hideFirstCryptoCount(target), "ws-a", second);
  assert.equal(blocked.status, 409, blocked.text);
  assert.equal(blocked.body.error.code, "crypto_draft_cap_reached");

  const drafts = await target.DB.prepare(
    "SELECT COUNT(*) AS total FROM content_radar_drafts WHERE workspace_id = ? AND creation_kind = 'automatic'",
  )
    .bind("ws-a")
    .first();
  assert.equal(drafts.total, 1);

  const candidate = await target.DB.prepare(
    "SELECT status, draft_id FROM content_radar_candidates WHERE workspace_id = ? AND id = ?",
  )
    .bind("ws-a", second)
    .first();
  assert.equal(candidate.status, "qualified");
  assert.equal(candidate.draft_id, null);
});
