-- Demo seed for the Office CRM D1 database.
-- This dataset mirrors the in-app demo with PRD role names and Indonesian
-- agent profiles. It is synthetic: never present it as live production data.

PRAGMA foreign_keys = ON;

INSERT INTO workspaces (id, name, slug, meta, initial, approval_policy, created_at) VALUES
  ('playdesign', 'Playdesign Studio', 'playdesign', 'Agency workspace · Pro', 'P', 'Owner approval required before publish, send or external side effects.', '2026-10-01T08:00:00Z'),
  ('brandal', 'Brandal-Gbee', 'brandal-gbee', 'Brand workspace · Studio', 'B', 'SPV review first, then owner approval for anything public.', '2026-10-01T08:00:00Z');

INSERT INTO actors (id, workspace_id, name, role, created_at) VALUES
  ('ja', 'playdesign', 'Jawad Al Amien', 'owner', '2026-10-01T08:00:00Z'),
  ('sl', 'playdesign', 'Sofia Lindqvist', 'operator', '2026-10-01T08:00:00Z'),
  ('mc', 'playdesign', 'Marcus Chen', 'operator', '2026-10-01T08:00:00Z'),
  ('ao', 'playdesign', 'Amara Okafor', 'operator', '2026-10-01T08:00:00Z'),
  ('dp', 'playdesign', 'Daniel Park', 'operator', '2026-10-01T08:00:00Z'),
  ('lf', 'playdesign', 'Lena Fischer', 'operator', '2026-10-01T08:00:00Z'),
  ('ja', 'brandal', 'Jawad Al Amien', 'owner', '2026-10-01T08:00:00Z'),
  ('lf', 'brandal', 'Lena Fischer', 'operator', '2026-10-01T08:00:00Z'),
  ('ao', 'brandal', 'Amara Okafor', 'operator', '2026-10-01T08:00:00Z'),
  ('mc', 'brandal', 'Marcus Chen', 'operator', '2026-10-01T08:00:00Z');

INSERT INTO agents (id, workspace_id, name, role, jobdesk, sort_order, availability, capabilities, provider, model, last_seen, note, created_at, updated_at) VALUES
  ('nova', 'playdesign', 'Raka Pratama', 'Specialist Agent',
   'Revenue operations: inbox triage, follow-ups and CRM hygiene', 1,
   'online', '["Inbox triage","Follow-up drafts","Scheduling","CRM hygiene"]',
   'Ruang gateway', 'Je.el Agent', 'Active now', NULL, '2026-10-01T08:00:00Z', '2026-10-30T08:30:00Z'),
  ('scout', 'playdesign', 'Salsabila Rahma', 'Specialist Agent',
   'Research and evidence: web research, source checks, competitor scans', 2,
   'idle', '["Web research","Source checks","Competitor scans"]',
   'Ruang gateway', 'Je.el Agent', '38m ago', NULL, '2026-10-01T08:00:00Z', '2026-10-30T08:22:00Z'),
  ('spv-playdesign', 'playdesign', 'Arif Nugroho', 'SPV/QC Agent',
   'QC gate: verifies evidence, tone and completeness before owner review', 3,
   'online', '["QC checklist","Evidence verification","Approval routing"]',
   'Ruang gateway', 'Je.el Agent QC', 'Active now', NULL, '2026-10-01T08:00:00Z', '2026-10-30T08:30:00Z'),
  ('echo', 'brandal', 'Dimas Anggara', 'Specialist Agent',
   'Content production: caption drafts, brand voice and content calendar', 1,
   'online', '["Caption drafts","Brand voice QC","Content calendar"]',
   'Ruang gateway', 'Je.el Agent', 'Active now', NULL, '2026-10-01T08:00:00Z', '2026-10-30T08:30:00Z'),
  ('atlas', 'brandal', 'Ayu Lestari', 'Specialist Agent',
   'Market research: pricing scans, competitor scans, source verification', 2,
   'unavailable', '["Market research","Pricing scans","Source verification"]',
   'Ruang gateway', 'Je.el Agent', '1h ago', 'provider outage since 08:12', '2026-10-01T08:00:00Z', '2026-10-30T08:12:00Z'),
  ('spv-brandal', 'brandal', 'Nadia Kusuma', 'SPV/QC Agent',
   'QC gate: brand voice and claims check before owner review', 3,
   'idle', '["QC checklist","Claims check","Approval routing"]',
   'Ruang gateway', 'Je.el Agent QC', '12m ago', NULL, '2026-10-01T08:00:00Z', '2026-10-30T08:48:00Z');

-- Tasks ---------------------------------------------------------------------
INSERT INTO tasks (
  id, workspace_id, title, project, priority, status, due, owner_id, tags,
  subtasks_done, subtasks_total, board, brief, acceptance, next_action, approval,
  output_version, output_status, confidence, limitations, blocked_reason,
  assigned_agent_id, created_at, updated_at
) VALUES
  ('t1', 'playdesign', 'Finalize Northwind brand direction', 'Northwind', 'high', 'in_progress', '2026-10-30',
   'ja', '["Branding"]', 3, 5, 'Studio delivery',
   'Lock the Northwind direction after the warm-palette round: final logo behaviour, type scale and colour tokens. Nothing goes to the client without a versioned approval.',
   '["Warm palette variant included","Tokens documented for the web build","Owner approval recorded before handoff"]',
   'Close the type-scale decision and submit v2 for approval.', 'none', 2, 'draft', 86,
   '["Warm-palette contrast still fails AA on secondary buttons."]', NULL, 'nova',
   '2026-10-20T09:00:00Z', '2026-10-30T08:40:00Z'),

  ('t2', 'playdesign', 'Send Kraft & Co retainer proposal', 'Kraft & Co', 'high', 'backlog', '2026-10-30',
   'ja', '["Sales"]', 1, 2, 'Sales',
   'Send Jonas Weber a retainer proposal that reflects the scope agreed in discovery, with milestone billing and an approval gate before anything leaves the studio.',
   '["Scope matches discovery notes","Pricing approved by owner","Proposal held for approval before send"]',
   'Owner review of proposal v2.', 'pending', 2, 'owner_review', 82,
   '["Pricing assumes a 12-month term and has not had legal review."]', NULL, 'nova',
   '2026-10-22T09:00:00Z', '2026-10-30T07:30:00Z'),

  ('t4', 'playdesign', 'Prepare Orbit launch moodboard', 'Orbit Labs', 'medium', 'review', '2026-11-02',
   'ao', '["Branding"]', 4, 4, 'Studio delivery',
   'Prepare the Orbit Labs launch moodboard with three visual routes. The owner picks a route before anything is shared with the client.',
   '["Three routes presented","Client-safe assets only","Owner approval recorded"]',
   'Owner approval of moodboard v2.', 'pending', 2, 'owner_review', 78,
   '["Route C references a font still pending licensing."]', NULL, 'spv-playdesign',
   '2026-10-21T09:00:00Z', '2026-10-30T08:02:00Z'),

  ('t8', 'playdesign', 'Invoice follow-up: Casa Lumen', 'Finance', 'high', 'backlog', '2026-10-28',
   'ja', '["Finance"]', 0, 1, 'Studio delivery',
   'Nudge Casa Lumen about the overdue invoice without damaging the relationship. No message leaves until finance confirms the ledger.',
   '["Ledger confirmed by finance","Tone reviewed","Owner approval before send"]',
   'Waiting on finance confirmation before drafting.', 'none', 0, 'draft', 60,
   '["Invoice state is from the demo ledger."]',
   'Blocked: finance confirmation is missing before any invoice nudge.', 'nova',
   '2026-10-18T09:00:00Z', '2026-10-29T08:40:00Z'),

  ('t10', 'playdesign', 'Write launch announcement', 'Orbit Labs', 'high', 'review', '2026-11-02',
   'lf', '["Content"]', 2, 3, 'Studio delivery',
   'Draft the Orbit Labs launch announcement for the site and LinkedIn. Claims stay tied to the approved press release.',
   '["Claims match press release","Two variants provided","Owner approval before publish"]',
   'Owner review of announcement v1.', 'pending', 1, 'owner_review', 80,
   '["Launch date could move; copy currently assumes 12 Nov."]', NULL, 'nova',
   '2026-10-25T09:00:00Z', '2026-10-30T07:50:00Z'),

  ('t12', 'playdesign', 'Finalize Northwind brand assets', 'Northwind', 'medium', 'done', '2026-10-28',
   'ja', '["Branding","Handoff"]', 3, 3, 'Studio delivery',
   'Export final Northwind brand assets for handoff with checksums and a manifest.',
   '["Manifest attached","Checksums recorded","Owner approval on release"]',
   'Approved output archived.', 'approved', 1, 'approved', 96,
   '[]', NULL, 'nova',
   '2026-10-16T09:00:00Z', '2026-10-29T09:00:00Z'),

  ('b1', 'brandal', 'BeeBestie launch teaser', 'BeeBestie', 'high', 'review', '2026-10-31',
   'lf', '["Launch","Social"]', 4, 4, 'Brand launch',
   'Produce the BeeBestie teaser set for the launch week: one hero frame, two caption variants and a story cut. Copy follows the brand tone guide and never publishes itself.',
   '["Tone checked against brand guide","Caption variants approved","Publish scheduled only after approval"]',
   'Owner approval of teaser v2.', 'pending', 2, 'owner_review', 91,
   '["Product claims are unverified until the nutrition sheet lands."]', NULL, 'echo',
   '2026-10-23T09:00:00Z', '2026-10-30T08:38:00Z'),

  ('b2', 'brandal', 'Brandal-Gbee pricing sheet', 'Brandal', 'high', 'backlog', '2026-11-01',
   'ao', '["Ops","Pricing"]', 1, 4, 'Brand ops',
   'Rebuild the wholesale pricing sheet with supplier quotes and margin bands. Numbers cannot be published until finance confirms the latest quotes.',
   '["Every price traces to a supplier quote","Margin bands reviewed","Owner approval before sharing"]',
   'Waiting on supplier quotes from Ayu Lestari.', 'none', 1, 'research', 58,
   '["Two supplier quotes are missing."]',
   'Blocked: Ayu Lestari is unavailable, two supplier quotes are missing.', 'atlas',
   '2026-10-24T09:00:00Z', '2026-10-30T08:12:00Z'),

  ('b3', 'brandal', 'QC honey packaging copy', 'Brandal', 'medium', 'in_progress', '2026-11-01',
   'mc', '["Packaging","QC"]', 3, 5, 'Brand production',
   'QC the honey line packaging copy for regulatory clarity, tone and claims. Findings go into QC notes; fixes require a new version.',
   '["Claims checked","Tone matches guide","QC notes attached"]',
   'Finish QC notes and submit for SPV review.', 'none', 1, 'qc', 72,
   '["Regulatory review not yet done."]', NULL, 'echo',
   '2026-10-24T09:00:00Z', '2026-10-30T08:20:00Z'),

  ('b4', 'brandal', 'Instagram bios refresh', 'BeeBestie', 'low', 'done', '2026-10-28',
   'lf', '["Social"]', 2, 2, 'Brand ops',
   'Refresh the main and secondary Instagram bios with the new positioning.',
   '["Approved by owner","Updated on both accounts"]',
   'Approved output archived.', 'approved', 1, 'approved', 93,
   '[]', NULL, 'echo',
   '2026-10-15T09:00:00Z', '2026-10-29T08:40:00Z'),

  ('b5', 'brandal', 'Research Gen-Z snack competitors', 'Brandal', 'medium', 'backlog', '2026-11-04',
   'sl', '["Research","AI"]', 0, 3, 'Brand research',
   'Scan five Gen-Z snack challengers for positioning, price bands and content angles. Findings are research, not verified facts, until sources are checked.',
   '["Five competitors covered","Sources attached per claim","Confidence labelled"]',
   'Queue research once Ayu Lestari is available.', 'none', 0, 'research', 40,
   '["Agent Ayu Lestari is unavailable — research has not started."]',
   'Blocked: research agent is offline.', 'atlas',
   '2026-10-26T09:00:00Z', '2026-10-30T08:15:00Z');

INSERT INTO task_outputs (id, task_id, version, status, content, confidence, limitations, created_by, created_at) VALUES
  ('out-t1-v2', 't1', 2, 'draft', 'Direction v2: warm palette, updated type scale and token sheet.', 86,
   '["Warm-palette contrast still fails AA on secondary buttons."]', 'nova', '2026-10-30T08:40:00Z'),
  ('out-t2-v2', 't2', 2, 'owner_review', 'Retainer proposal v2 with milestone billing.', 82,
   '["Pricing assumes a 12-month term and has not had legal review."]', 'nova', '2026-10-30T07:30:00Z'),
  ('out-t4-v2', 't4', 2, 'owner_review', 'Moodboard v2 with three routes and client-safe assets.', 78,
   '["Route C references a font still pending licensing."]', 'ao', '2026-10-30T08:02:00Z'),
  ('out-t10-v1', 't10', 1, 'owner_review', 'Launch announcement v1 with two variants.', 80,
   '["Launch date could move; copy currently assumes 12 Nov."]', 'nova', '2026-10-30T07:50:00Z'),
  ('out-t12-v1', 't12', 1, 'approved', 'Northwind asset manifest with checksums.', 96,
   '[]', 'nova', '2026-10-29T09:00:00Z'),
  ('out-b1-v2', 'b1', 2, 'owner_review', 'BeeBestie teaser v2: hero frame, two captions and story cut.', 91,
   '["Product claims are unverified until the nutrition sheet lands."]', 'echo', '2026-10-30T08:38:00Z'),
  ('out-b2-v1', 'b2', 1, 'research', 'Partial supplier quote pack, 3 of 5 suppliers.', 58,
   '["Two supplier quotes are missing."]', 'atlas', '2026-10-30T08:12:00Z'),
  ('out-b3-v1', 'b3', 1, 'qc', 'Packaging copy v1 with QC notes.', 72,
   '["Regulatory review not yet done."]', 'echo', '2026-10-30T08:20:00Z'),
  ('out-b4-v1', 'b4', 1, 'approved', 'Bio copy v1 approved for both accounts.', 93,
   '[]', 'echo', '2026-10-29T08:40:00Z');

INSERT INTO evidence (id, task_id, output_id, title, source, kind, confidence, verified, created_at) VALUES
  ('e-t1-1', 't1', 'out-t1-v2', 'Northwind direction deck v2', 'External artifact · Figma reference', 'artifact', 90, 'unverified', '2026-10-30T08:41:00Z'),
  ('e-t2-1', 't2', NULL, 'Discovery call notes — Kraft & Co', 'CRM note · 14 Oct', 'source', 92, 'verified', '2026-10-30T07:31:00Z'),
  ('e-t2-2', 't2', 'out-t2-v2', 'Retainer proposal v2', 'External artifact · storage ref', 'artifact', 88, 'unverified', '2026-10-30T07:32:00Z'),
  ('e-t4-1', 't4', 'out-t4-v2', 'Orbit moodboard routes', 'External artifact · drive ref', 'artifact', 84, 'unverified', '2026-10-30T08:03:00Z'),
  ('e-t10-1', 't10', 'out-t10-v1', 'Orbit press release', 'Knowledge base · approved press kit', 'source', 90, 'verified', '2026-10-30T07:51:00Z'),
  ('e-t12-1', 't12', 'out-t12-v1', 'Northwind asset manifest', 'External artifact · storage ref', 'artifact', 96, 'verified', '2026-10-29T09:01:00Z'),
  ('e-b1-1', 'b1', 'out-b1-v2', 'BeeBestie teaser frames', 'External artifact · drive ref', 'artifact', 89, 'unverified', '2026-10-30T08:39:00Z'),
  ('e-b1-2', 'b1', NULL, 'Brandal tone guide', 'Knowledge base · Brand guidelines', 'source', 94, 'verified', '2026-10-30T08:39:30Z'),
  ('e-b2-1', 'b2', 'out-b2-v1', 'Supplier quote pack (partial)', 'Ayu Lestari research · 3 of 5 suppliers', 'source', 58, 'missing', '2026-10-30T08:12:30Z'),
  ('e-b3-1', 'b3', 'out-b3-v1', 'Packaging copy v1', 'External artifact · print ref', 'artifact', 80, 'unverified', '2026-10-30T08:21:00Z'),
  ('e-b4-1', 'b4', 'out-b4-v1', 'Bio copy v1', 'External artifact · doc ref', 'artifact', 93, 'verified', '2026-10-29T08:41:00Z');

INSERT INTO approvals (id, task_id, version, decision, actor_id, actor_type, comment, idempotency_key, decided_at) VALUES
  ('ap-t1-1', 't1', 1, 'approved', 'ja', 'owner', 'Direction approved — proceed to production.', 't1:v1:approved', '2026-10-28T09:00:00Z'),
  ('ap-t2-1', 't2', 2, 'submitted', 'ja', 'owner', NULL, 't2:v2:submitted', '2026-10-30T07:30:00Z'),
  ('ap-t4-1', 't4', 2, 'submitted', 'ao', 'operator', NULL, 't4:v2:submitted', '2026-10-30T08:02:00Z'),
  ('ap-t10-1', 't10', 1, 'submitted', 'lf', 'operator', NULL, 't10:v1:submitted', '2026-10-30T07:50:00Z'),
  ('ap-t12-1', 't12', 1, 'approved', 'ja', 'owner', 'Looks complete — release for handoff.', 't12:v1:approved', '2026-10-29T09:00:00Z'),
  ('ap-b1-1', 'b1', 2, 'submitted', 'lf', 'operator', NULL, 'b1:v2:submitted', '2026-10-30T08:38:00Z'),
  ('ap-b4-1', 'b4', 1, 'approved', 'ja', 'owner', 'Approved — update both profiles.', 'b4:v1:approved', '2026-10-29T08:40:00Z');

INSERT INTO task_comments (id, task_id, author_id, body, created_at) VALUES
  ('cm-b1-1', 'b1', 'lf', 'Hero frame is ready; caption B needs a softer claim.', '2026-10-30T08:34:00Z'),
  ('cm-t2-1', 't2', 'ja', 'Pricing was agreed verbally — keep it gated until written sign-off.', '2026-10-30T07:35:00Z');

-- Runs ----------------------------------------------------------------------
INSERT INTO runs (
  id, workspace_id, agent_id, task_id, action, subject, state, approval_required,
  output_version, evidence, limitations, failure_reason, decision_comment, started_at, ended_at
) VALUES
  ('r1', 'playdesign', 'nova', NULL, 'Qualified lead', 'Tomas Rivera · Vela Coffee', 'approved', 0, 1,
   '[{"id":"e-r1","title":"Inbound form + web chat","source":"CRM activity","kind":"source","confidence":87,"verified":"verified"}]',
   '["Budget signal comes from chat only."]', NULL, 'Score looks fair — route to Daniel.',
   '2026-10-30T08:58:00Z', '2026-10-30T08:58:12Z'),
  ('r2', 'playdesign', 'nova', NULL, 'Drafted follow-up', 'Elif Demir · Northwind Studio', 'owner_review', 1, 1,
   '[{"id":"e-r2","title":"Last 12 replies with Northwind","source":"Inbox history","kind":"source","confidence":94,"verified":"verified"}]',
   '["Warm-palette variant is still with design."]', NULL, NULL,
   '2026-10-30T08:42:00Z', NULL),
  ('r3', 'playdesign', 'nova', NULL, 'Rescheduled review', 'Mei Tan · Orbit Labs', 'approved', 0, 1,
   '[]', '[]', NULL, 'Calendar invite confirmed by owner.',
   '2026-10-30T07:00:00Z', '2026-10-30T07:00:06Z'),
  ('r4', 'playdesign', 'nova', NULL, 'Billing question', 'Ana Sofia · Casa Lumen', 'owner_review', 1, 1,
   '[{"id":"e-r4","title":"Casa Lumen invoice thread","source":"Inbox thread","kind":"source","confidence":72,"verified":"unverified"}]',
   '["Billing policy changes need owner sign-off.","Invoice state is from the demo ledger."]', NULL, NULL,
   '2026-10-30T04:00:00Z', NULL),
  ('r5', 'playdesign', 'nova', NULL, 'Enriched contact', 'Clara Moreau · Atelier Nord', 'failed', 0, 1,
   '[]', '[]', 'Provider timed out after 22s — only partial public data was persisted. Retry is safe.', NULL,
   '2026-10-30T02:00:00Z', '2026-10-30T02:00:22Z'),
  ('r6', 'playdesign', 'scout', NULL, 'Batch re-tag contacts', 'Marketing list · 128 records', 'cancelled', 0, 1,
   '[]', '[]', 'Stopped by Jawad before completion. No records were hidden.', NULL,
   '2026-10-29T23:00:00Z', '2026-10-29T23:00:41Z'),
  ('br1', 'brandal', 'echo', 'b1', 'Drafted launch caption', 'BeeBestie teaser · Instagram', 'owner_review', 1, 2,
   '[{"id":"e-br1","title":"BeeBestie tone guide","source":"Knowledge base","kind":"source","confidence":92,"verified":"verified"}]',
   '["Nutrition claims need verification before publish."]', NULL, NULL,
   '2026-10-30T08:48:00Z', NULL),
  ('br2', 'brandal', 'atlas', 'b2', 'Competitor pricing scan', 'Gen-Z snack market', 'unavailable', 0, 1,
   '[]', '[]', 'Agent unavailable — Ayu Lestari is offline (provider outage since 08:12). Nothing was researched.', NULL,
   '2026-10-30T08:00:00Z', NULL),
  ('br3', 'brandal', 'echo', NULL, 'Scheduled packaging story', 'Brandal-Gbee · LinkedIn', 'approved', 0, 1,
   '[]', '[]', NULL, NULL,
   '2026-10-30T05:00:00Z', '2026-10-30T05:00:11Z'),
  ('br4', 'brandal', 'echo', 'b3', 'QC brand voice pass', 'Honey packaging copy', 'qc', 1, 1,
   '[]', '["Regulatory check pending."]', NULL, NULL,
   '2026-10-30T08:24:00Z', NULL);

INSERT INTO run_events (id, run_id, state, note, at) VALUES
  ('re-r1-1', 'r1', 'queued', NULL, '2026-10-30T08:57:00Z'),
  ('re-r1-2', 'r1', 'running', NULL, '2026-10-30T08:58:00Z'),
  ('re-r1-3', 'r1', 'approved', 'Lead score confirmed by owner', '2026-10-30T08:58:12Z'),
  ('re-r2-1', 'r2', 'queued', NULL, '2026-10-30T08:41:00Z'),
  ('re-r2-2', 'r2', 'running', NULL, '2026-10-30T08:42:00Z'),
  ('re-r2-3', 'r2', 'owner_review', 'Held for owner approval', '2026-10-30T08:42:08Z'),
  ('re-r3-1', 'r3', 'queued', NULL, '2026-10-30T06:58:00Z'),
  ('re-r3-2', 'r3', 'running', NULL, '2026-10-30T07:00:00Z'),
  ('re-r3-3', 'r3', 'approved', 'Calendar invite confirmed by owner', '2026-10-30T07:00:06Z'),
  ('re-r4-1', 'r4', 'queued', NULL, '2026-10-30T03:58:00Z'),
  ('re-r4-2', 'r4', 'running', NULL, '2026-10-30T04:00:00Z'),
  ('re-r4-3', 'r4', 'owner_review', 'Billing policy needs owner sign-off', '2026-10-30T04:00:22Z'),
  ('re-r5-1', 'r5', 'queued', NULL, '2026-10-30T01:59:00Z'),
  ('re-r5-2', 'r5', 'running', NULL, '2026-10-30T02:00:00Z'),
  ('re-r5-3', 'r5', 'failed', 'Provider timeout', '2026-10-30T02:00:22Z'),
  ('re-r6-1', 'r6', 'queued', NULL, '2026-10-29T22:58:00Z'),
  ('re-r6-2', 'r6', 'running', NULL, '2026-10-29T23:00:00Z'),
  ('re-r6-3', 'r6', 'cancelled', 'Stopped by owner', '2026-10-29T23:00:41Z'),
  ('re-br1-1', 'br1', 'queued', NULL, '2026-10-30T08:47:00Z'),
  ('re-br1-2', 'br1', 'running', NULL, '2026-10-30T08:48:00Z'),
  ('re-br1-3', 'br1', 'owner_review', 'Held for owner approval', '2026-10-30T08:48:09Z'),
  ('re-br2-1', 'br2', 'queued', NULL, '2026-10-30T07:59:00Z'),
  ('re-br2-2', 'br2', 'unavailable', 'Dispatch rejected', '2026-10-30T08:00:00Z'),
  ('re-br3-1', 'br3', 'queued', NULL, '2026-10-30T04:58:00Z'),
  ('re-br3-2', 'br3', 'running', NULL, '2026-10-30T05:00:00Z'),
  ('re-br3-3', 'br3', 'approved', NULL, '2026-10-30T05:00:11Z'),
  ('re-br4-1', 'br4', 'queued', NULL, '2026-10-30T08:23:00Z'),
  ('re-br4-2', 'br4', 'running', NULL, '2026-10-30T08:24:00Z'),
  ('re-br4-3', 'br4', 'qc', 'Regulatory check pending', '2026-10-30T08:24:20Z');

-- Activity ------------------------------------------------------------------
INSERT INTO activity_events (id, workspace_id, entity_type, entity_id, task_id, actor_type, actor_id, action, result, meta, created_at) VALUES
  ('ev-1', 'playdesign', 'run', 'r1', NULL, 'agent', 'nova', 'Qualified lead', 'ok', 'Tomas Rivera · Vela Coffee · score 87', '2026-10-30T08:58:12Z'),
  ('ev-2', 'playdesign', 'run', 'r2', NULL, 'agent', 'nova', 'Draft follow-up held for approval', 'pending', 'Elif Demir · Northwind Studio', '2026-10-30T08:42:08Z'),
  ('ev-3', 'playdesign', 'deal', 'd4', NULL, 'agent', 'nova', 'Moved deal to Qualified', 'ok', 'Northwind Studio · score 92', '2026-10-30T08:36:00Z'),
  ('ev-4', 'playdesign', 'approval', 't4', 't4', 'operator', 'ao', 'Submitted moodboard v2 for owner review', 'pending', 'Orbit Labs', '2026-10-30T08:02:00Z'),
  ('ev-5', 'playdesign', 'post', 'p2', NULL, 'owner', 'ja', 'Approved post for scheduling', 'ok', 'Work that speaks · Instagram', '2026-10-30T07:25:00Z'),
  ('ev-6', 'playdesign', 'run', 'r5', NULL, 'agent', 'nova', 'Run failed — provider timeout', 'failed', 'Clara Moreau · enrichment partial', '2026-10-30T02:00:22Z'),
  ('ev-7', 'brandal', 'approval', 'b1', 'b1', 'operator', 'lf', 'Submitted teaser v2 for owner review', 'pending', 'BeeBestie launch', '2026-10-30T08:38:00Z'),
  ('ev-8', 'brandal', 'agent', 'atlas', NULL, 'system', 'system', 'Agent marked unavailable', 'failed', 'Ayu Lestari · provider outage since 08:12', '2026-10-30T08:12:00Z'),
  ('ev-9', 'brandal', 'post', 'bp2', NULL, 'owner', 'ja', 'Approved post for scheduling', 'ok', 'Packaging story · LinkedIn', '2026-10-30T06:30:00Z'),
  ('ev-10', 'brandal', 'task', 'b2', 'b2', 'agent', 'atlas', 'Task blocked — missing supplier quotes', 'failed', 'Brandal pricing sheet', '2026-10-30T04:20:00Z'),
  ('ev-11', 'playdesign', 'task', 't8', 't8', 'owner', 'ja', 'Task blocked — finance confirmation missing', 'failed', 'Casa Lumen invoice', '2026-10-30T04:00:00Z'),
  ('ev-12', 'playdesign', 'inbox', 'c4', NULL, 'owner', 'ja', 'Reply sent to Mei Tan', 'ok', 'Orbit Labs · after manual approval', '2026-10-30T07:00:00Z');

-- Content, deals, leads ------------------------------------------------------
INSERT INTO posts (id, workspace_id, title, caption, platform, scheduled_for, status, format, owner_id, reach, engagement, created_at, updated_at) VALUES
  ('p1', 'playdesign', 'Behind the Northwind rebrand', 'Six weeks, four workshops and one stubborn lowercase. Here is how we rebuilt Northwind Studio from the logotype up.', 'Instagram', '2026-10-02T09:00:00Z', 'published', 'Carousel', 'ja', 48200, 4.2, '2026-10-01T08:00:00Z', '2026-10-02T09:00:00Z'),
  ('p2', 'playdesign', 'Work that speaks', 'A carousel about craft, decisions and the quiet parts of a rebrand.', 'Instagram', '2026-10-30T11:30:00Z', 'scheduled', 'Carousel', 'ja', NULL, NULL, '2026-10-28T08:00:00Z', '2026-10-30T07:25:00Z'),
  ('p3', 'playdesign', 'Inside our AI-assisted workflow', 'Raka drafts, we decide. A transparent look at how an AI agent fits into a design studio without flattening the craft.', 'LinkedIn', '2026-11-03T08:30:00Z', 'scheduled', 'Single', 'ja', NULL, NULL, '2026-10-27T08:00:00Z', '2026-10-30T06:00:00Z'),
  ('p4', 'playdesign', 'Holiday campaign concepts', 'Three routes for the holiday season. Which one feels most like you?', 'Instagram', '2026-11-04T13:00:00Z', 'review', 'Carousel', 'lf', NULL, NULL, '2026-10-27T08:00:00Z', '2026-10-29T08:00:00Z'),
  ('bp1', 'brandal', 'Packaging story', 'How the new honey line went from supplier samples to shelf-ready packaging.', 'LinkedIn', '2026-10-30T10:00:00Z', 'scheduled', 'Single', 'ja', NULL, NULL, '2026-10-26T08:00:00Z', '2026-10-30T06:30:00Z'),
  ('bp2', 'brandal', 'BeeBestie teaser', 'Something sweet is coming. Teaser frames from the launch set.', 'Instagram', '2026-10-31T09:00:00Z', 'review', 'Reel', 'lf', NULL, NULL, '2026-10-28T08:00:00Z', '2026-10-30T08:38:00Z'),
  ('bp3', 'brandal', 'Supplier spotlight', 'Meet the growers behind the new single-origin line.', 'Instagram', '2026-11-05T09:00:00Z', 'draft', 'Carousel', 'lf', NULL, NULL, '2026-10-29T08:00:00Z', '2026-10-29T08:00:00Z');

INSERT INTO schedules (id, workspace_id, post_id, platform, scheduled_for, status, owner_id, created_at) VALUES
  ('sch-p2', 'playdesign', 'p2', 'Instagram', '2026-10-30T11:30:00Z', 'scheduled', 'ja', '2026-10-30T07:25:00Z'),
  ('sch-p3', 'playdesign', 'p3', 'LinkedIn', '2026-11-03T08:30:00Z', 'scheduled', 'ja', '2026-10-30T06:00:00Z'),
  ('sch-p4', 'playdesign', 'p4', 'Instagram', '2026-11-04T13:00:00Z', 'review', 'lf', '2026-10-29T08:00:00Z'),
  ('sch-bp1', 'brandal', 'bp1', 'LinkedIn', '2026-10-30T10:00:00Z', 'scheduled', 'ja', '2026-10-30T06:30:00Z'),
  ('sch-bp2', 'brandal', 'bp2', 'Instagram', '2026-10-31T09:00:00Z', 'review', 'lf', '2026-10-30T08:38:00Z'),
  ('sch-bp3', 'brandal', 'bp3', 'Instagram', '2026-11-05T09:00:00Z', 'draft', 'lf', '2026-10-29T08:00:00Z');

INSERT INTO deals (id, workspace_id, company, title, value, stage, contact, owner_id, score, due, tags, source, created_at) VALUES
  ('d1', 'playdesign', 'Harbor & Co', 'Brand refresh', 18400, 'new', 'Tomas Rivera', 'ao', 74, '2026-11-04', '["Branding"]', 'Instagram', '2026-10-10T08:00:00Z'),
  ('d3', 'playdesign', 'Kraft & Co', 'Design retainer', 42000, 'proposal', 'Jonas Weber', 'ja', 88, '2026-11-05', '["Retainer"]', 'Referral', '2026-10-12T08:00:00Z'),
  ('d4', 'playdesign', 'Northwind Studio', 'Rebrand + website', 24000, 'qualified', 'Elif Demir', 'ja', 92, '2026-11-02', '["Branding","Web"]', 'Instagram', '2026-10-14T08:00:00Z'),
  ('d5', 'playdesign', 'Orbit Labs', 'Product launch', 31200, 'qualified', 'Mei Tan', 'sl', 81, '2026-11-12', '["Campaign"]', 'LinkedIn', '2026-10-15T08:00:00Z'),
  ('d9', 'playdesign', 'Fjord Supply', 'Identity + packaging', 36800, 'negotiation', 'Nils Andersen', 'sl', 84, '2026-11-03', '["Branding","Packaging"]', 'LinkedIn', '2026-10-16T08:00:00Z'),
  ('d10', 'playdesign', 'Casa Lumen', 'Campaign toolkit', 15600, 'negotiation', 'Ana Sofia', 'ao', 57, '2026-11-14', '["Campaign"]', 'Email', '2026-10-17T08:00:00Z'),
  ('d11', 'playdesign', 'Mono House', 'Full rebrand', 22000, 'won', 'Hana Ito', 'ja', 96, '2026-10-24', '["Branding"]', 'Referral', '2026-10-08T08:00:00Z'),
  ('bd1', 'brandal', 'BeeBestie', 'Launch campaign', 18000, 'proposal', 'Rangga Saputra', 'lf', 86, '2026-11-08', '["Launch","Social"]', 'Referral', '2026-10-18T08:00:00Z'),
  ('bd2', 'brandal', 'Gbee Coffee', 'Retail identity', 9600, 'qualified', 'Rangga Saputra', 'ao', 78, '2026-11-10', '["Branding","Retail"]', 'Web chat', '2026-10-20T08:00:00Z'),
  ('bd3', 'brandal', 'Honey Lane', 'Packaging refresh', 12400, 'negotiation', 'Sari Wulandari', 'lf', 71, '2026-11-06', '["Packaging"]', 'Instagram', '2026-10-21T08:00:00Z');

INSERT INTO leads (id, workspace_id, name, company, role, email, phone, location, status, source, score, value, owner_id, last_activity, tags, next_step, notes, created_at) VALUES
  ('l1', 'playdesign', 'Elif Demir', 'Northwind Studio', 'Creative Director', 'elif@northwind.studio', '+46 70 118 2244', 'Stockholm, SE', 'qualified', 'Instagram', 92, 24000, 'ja', '2h ago', '["Rebrand","Website"]', 'Send warm-palette follow-up after design review.', 'Asked for a warmer palette; decision maker on the rebrand.', '2026-10-05T08:00:00Z'),
  ('l2', 'playdesign', 'Jonas Weber', 'Kraft & Co', 'Managing Partner', 'jonas@kraftco.de', '+49 30 771 9920', 'Berlin, DE', 'new', 'Referral', 85, 42000, 'ja', '1d ago', '["Retainer"]', 'Owner review of retainer proposal v2.', 'Referred by Mono House. Prefers milestone billing.', '2026-10-08T08:00:00Z'),
  ('l3', 'playdesign', 'Nils Andersen', 'Fjord Supply', 'Head of Brand', 'nils@fjordsupply.no', '+47 912 55 018', 'Oslo, NO', 'qualified', 'LinkedIn', 84, 36800, 'sl', '4h ago', '["Packaging"]', 'Share the identity + packaging scope sheet.', 'Wants a sustainability angle in the packaging system.', '2026-10-11T08:00:00Z'),
  ('l4', 'playdesign', 'Ana Sofia', 'Casa Lumen', 'Marketing Lead', 'ana@casalumen.pt', '+351 912 004 118', 'Lisbon, PT', 'nurturing', 'Email', 57, 15600, 'ao', '1d ago', '["Campaign"]', 'Wait for finance confirmation before the invoice nudge.', 'Invoice is overdue; relationship still warm.', '2026-10-12T08:00:00Z'),
  ('bl1', 'brandal', 'Rangga Saputra', 'Gbee Coffee', 'Co-founder', 'rangga@gbeecoffee.id', '+62 812 3388 1044', 'Yogyakarta, ID', 'qualified', 'Web chat', 88, 9600, 'ao', '2h ago', '["Retail","Signage"]', 'Send the scope sheet with the retail identity proposal.', 'Asked whether retail identity includes signage — yes.', '2026-10-19T08:00:00Z'),
  ('bl2', 'brandal', 'Sari Wulandari', 'Honey Lane', 'Brand Manager', 'sari@honeylane.id', '+62 813 2211 7788', 'Bandung, ID', 'qualified', 'Instagram', 76, 12400, 'lf', '1d ago', '["Packaging"]', 'SPV review of packaging copy before owner approval.', 'Regulatory clarity is the main concern for claims.', '2026-10-20T08:00:00Z');

INSERT INTO reports (id, workspace_id, kind, period, payload, generated_at) VALUES
  ('rep-pd-1', 'playdesign', 'weekly', '2026-W44',
   '{"label":"Demo snapshot","pipelineValue":128400,"approvalsPending":3,"runSuccessRate":0.83,"tasksDone":1,"tasksReview":3}',
   '2026-10-30T00:00:00Z'),
  ('rep-br-1', 'brandal', 'weekly', '2026-W44',
   '{"label":"Demo snapshot","pipelineValue":40000,"approvalsPending":1,"runSuccessRate":0.75,"tasksDone":1,"tasksReview":1}',
   '2026-10-30T00:00:00Z');
