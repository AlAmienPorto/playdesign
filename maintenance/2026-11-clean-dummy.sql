-- Bersihkan seluruh data dummy, sisakan hanya agent (dan workspace/actor sebagai induk).
-- Urutan hapus mengikuti foreign key: anak dulu, induk belakangan.

DELETE FROM run_events;
DELETE FROM runs;
DELETE FROM task_outputs;
DELETE FROM evidence;
DELETE FROM task_comments;
DELETE FROM approvals;
DELETE FROM tasks;
DELETE FROM activity_events;
DELETE FROM posts;
DELETE FROM schedules;
DELETE FROM deals;
DELETE FROM leads;
DELETE FROM reports;
DELETE FROM copilot_proposals;
DELETE FROM idempotency_keys;

-- Setiap agent wajib punya skill.
UPDATE agents SET skills = '["email-inbox-triage","playdesign-coordinator-workflow"]' WHERE id = 'nova';
UPDATE agents SET skills = '["social-media-competitor-research","grounded-citations","competitor-news-monitor"]' WHERE id = 'scout';
UPDATE agents SET skills = '["playdesign-spv-qc","grounded-citations"]' WHERE id = 'spv-playdesign';
UPDATE agents SET skills = '["playdesign-content-style","playdesign-social-style","humanizer"]' WHERE id = 'echo';
UPDATE agents SET skills = '["product-price-monitor","social-media-competitor-research"]' WHERE id = 'atlas';
UPDATE agents SET skills = '["playdesign-spv-qc","playdesign-creative-style"]' WHERE id = 'spv-brandal';
