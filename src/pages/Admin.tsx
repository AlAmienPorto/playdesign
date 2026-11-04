import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Building2,
  Check,
  CheckCircle2,
  Crown,
  Download,
  KeyRound,
  Lock,
  Mail,
  Plug,
  ScrollText,
  Settings2,
  ShieldCheck,
  UserPlus,
  Users,
} from 'lucide-react';
import { useStore } from '../store/store';
import {
  AutoBadge,
  Avatar,
  Badge,
  Card,
  CheckMark,
  Drawer,
  EmptyState,
  Field,
  Fig,
  Modal,
  PageHead,
  Pager,
  SearchField,
  SelectBox,
  StatusPill,
  Toggle,
} from '../components/ui';
import { PERMISSIONS, PERMISSION_LABELS, ROLES } from '../lib/permissions';
import { cx, downloadJSON, fmtDate, fmtTime, relTime, roleLabel } from '../lib/utils';
import type { DB, Integration, Permission, Role } from '../data/types';

function AdminPage({
  title,
  desc,
  actions,
  children,
}: {
  title: string;
  desc: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <>
      <PageHead kicker="Administration · Foundation" title={title} desc={desc} actions={actions} />
      {children}
    </>
  );
}

const roleTone: Record<Role, 'brand' | 'info' | 'violet' | 'success' | 'warning' | 'neutral'> = {
  Owner: 'brand',
  Admin: 'info',
  Editor: 'violet',
  Reviewer: 'success',
  Operator: 'warning',
  Agent: 'neutral',
};

export function UsersPage() {
  const { db, can, inviteUser, updateUserRole, toast } = useStore();
  const allowed = can('admin.modules');
  const [query, setQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [inviteOpen, setInviteOpen] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('Editor');

  const users = db.users
    .filter((u) => (roleFilter === 'all' ? true : u.role === roleFilter))
    .filter((u) => `${u.name} ${u.email} ${u.jobTitle}`.toLowerCase().includes(query.toLowerCase()));

  const submitInvite = () => {
    if (!allowed) {
      toast('Peran ini tidak punya izin mengundang pengguna.', 'danger');
      return;
    }
    if (!name.trim() || !email.trim()) {
      toast('Nama dan email wajib diisi.', 'danger');
      return;
    }
    inviteUser({ name: name.trim(), email: email.trim(), role });
    setName('');
    setEmail('');
    setRole('Editor');
    setInviteOpen(false);
  };

  return (
    <AdminPage
      title="Users"
      desc="Anggota workspace, peran, dan status akses. Undangan tidak otomatis memberi hak publish."
      actions={
        <button type="button" className="btn btn-primary" onClick={() => setInviteOpen(true)} disabled={!allowed}>
          <UserPlus size={15} /> Undang pengguna
        </button>
      }
    >
      <div className="figs figs-4">
        <Fig label="Total anggota" value={db.users.length} hint="Termasuk undangan" icon={<Users size={17} />} />
        <Fig label="Aktif" value={db.users.filter((u) => u.status === 'Aktif').length} hint="Bisa masuk sekarang" icon={<CheckCircle2 size={17} />} />
        <Fig label="Undangan tertunda" value={db.users.filter((u) => u.status === 'Diundang').length} hint="Menunggu konfirmasi" icon={<Mail size={17} />} />
        <Fig label="Owner" value={db.users.filter((u) => u.role === 'Owner').length} hint="Satu-satunya pemegang publish" icon={<Crown size={17} />} />
      </div>

      {!allowed && (
        <div className="notice-banner tone-warning mt-16">
          <Lock size={16} />
          <div>
            <strong>Mode hanya lihat.</strong>
            <span>Hanya Owner dan Admin yang bisa mengundang atau mengubah peran.</span>
          </div>
        </div>
      )}

      <div className="toolbar toolbar-wrap mt-16">
        <SearchField value={query} onChange={setQuery} placeholder="Cari nama, email, atau jabatan…" />
        <div className="toolbar-actions">
          <SelectBox
            label="Filter peran"
            value={roleFilter}
            onChange={setRoleFilter}
            options={[{ value: 'all', label: 'Semua peran' }, ...ROLES.map((r) => ({ value: r, label: r }))]}
          />
        </div>
      </div>

      <Card bodyClass="card-flush">
        {users.length === 0 ? (
          <EmptyState icon={<Users size={22} />} title="Tidak ada pengguna" desc="Ubah kata kunci atau filter peran." />
        ) : (
          <div className="table-wrap">
            <table className="pd-table">
              <thead>
                <tr>
                  <th scope="col">Pengguna</th>
                  <th scope="col">Jabatan</th>
                  <th scope="col">Peran</th>
                  <th scope="col">Status</th>
                  <th scope="col">Aktif terakhir</th>
                  <th scope="col">Izin kunci</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id}>
                    <td>
                      <div className="cell-person">
                        <Avatar name={u.name} size={32} />
                        <div>
                          <div className="cell-main">{u.name}</div>
                          <div className="cell-sub">{u.email}</div>
                        </div>
                      </div>
                    </td>
                    <td>{u.jobTitle}</td>
                    <td>
                      <select
                        className="input input-sm"
                        value={u.role}
                        onChange={(e) => updateUserRole(u.id, e.target.value as Role)}
                        disabled={!allowed || u.id === db.users[0].id}
                        aria-label={`Ubah peran ${u.name}`}
                      >
                        {ROLES.map((r) => (
                          <option key={r} value={r}>
                            {r}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <AutoBadge value={u.status} />
                    </td>
                    <td>{relTime(u.lastActive)}</td>
                    <td>
                      <div className="tag-row">
                        <Badge tone={roleTone[u.role]}>{roleLabel[u.role]}</Badge>
                        {u.role === 'Owner' ? (
                          <Badge tone="success">publish</Badge>
                        ) : (
                          <span className="muted-small">tanpa publish</span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <p className="footnote">
        <ShieldCheck size={12} /> Perubahan peran tercatat di audit. `content.write` tidak pernah otomatis memberi `content.publish`.
      </p>

      <Modal
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        title="Undang pengguna"
        sub="Undangan dikirim oleh server. Peran bisa diubah setelah bergabung."
        footer={
          <>
            <button type="button" className="btn btn-ghost" onClick={() => setInviteOpen(false)}>
              Batal
            </button>
            <button type="button" className="btn btn-primary" onClick={submitInvite}>
              <Mail size={14} /> Kirim undangan
            </button>
          </>
        }
      >
        <div className="form-grid">
          <Field label="Nama lengkap">
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Nama anggota" autoFocus />
          </Field>
          <Field label="Email kerja" hint="Gunakan domain studio.">
            <input
              className="input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="nama@playdesign.studio"
            />
          </Field>
          <Field label="Peran" hint="Editor dan Reviewer tidak punya hak publish.">
            <select className="input" value={role} onChange={(e) => setRole(e.target.value as Role)}>
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </Field>
          <div className="notice-banner tone-neutral">
            <KeyRound size={15} />
            <div>
              <strong>Tidak ada credential di undangan.</strong>
              <span>Akses diberikan lewat sesi server, bukan kata sandi yang dikirim lewat chat atau email biasa.</span>
            </div>
          </div>
        </div>
      </Modal>
    </AdminPage>
  );
}

export function RolesPage() {
  const { db } = useStore();
  const permissions = Object.keys(PERMISSIONS) as Permission[];

  return (
    <AdminPage
      title="Roles & Permissions"
      desc="Matriks izin yang berlaku di server. Publish keluar hanya milik Owner."
      actions={<Badge tone="brand">Matriks mengikat</Badge>}
    >
      <div className="role-grid">
        {ROLES.map((role) => {
          const members = db.users.filter((u) => u.role === role);
          const grants = permissions.filter((p) => PERMISSIONS[p].includes(role));
          return (
            <div key={role} className={cx('role-card', role === 'Owner' && 'is-owner')}>
              <div className="role-head">
                <span className={cx('role-mark', `tone-${roleTone[role]}`)}>
                  {role === 'Owner' ? <Crown size={16} /> : <ShieldCheck size={16} />}
                </span>
                <div>
                  <strong>{role}</strong>
                  <span>{members.length} anggota</span>
                </div>
              </div>
              <div className="role-grants">
                {grants.map((p) => (
                  <span key={p} className="chip-neutral">
                    {PERMISSION_LABELS[p]}
                  </span>
                ))}
                {grants.length === 0 && <span className="muted-small">Tidak ada izin.</span>}
              </div>
              {role !== 'Owner' && <p className="role-note">Tidak bisa menerbitkan atau mengirim keluar.</p>}
              {role === 'Owner' && <p className="role-note">Satu-satunya peran dengan content.publish.</p>}
            </div>
          );
        })}
      </div>

      <Card title="Matriks izin" sub="Bacaan langsung dari konfigurasi server. Tidak bisa diubah dari UI demo." className="mt-16" bodyClass="card-flush">
        <div className="table-wrap">
          <table className="pd-table permission-table">
            <thead>
              <tr>
                <th scope="col">Permission</th>
                {ROLES.map((role) => (
                  <th key={role} scope="col" className="matrix-head">
                    {role}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {permissions.map((permission) => (
                <tr key={permission}>
                  <td>
                    <div className="cell-main">{PERMISSION_LABELS[permission]}</div>
                    <div className="cell-sub mono">{permission}</div>
                  </td>
                  {ROLES.map((role) => (
                    <td key={role} className="matrix-cell">
                      <CheckMark yes={PERMISSIONS[permission].includes(role)} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="notice-banner tone-warning mt-16">
        <AlertTriangle size={16} />
        <div>
          <strong>Aturan keras.</strong>
          <span>`content.write` tidak pernah memberi `content.publish`. Agent tidak memiliki izin apa pun di matriks ini.</span>
        </div>
      </div>
    </AdminPage>
  );
}

export function WorkspacesPage() {
  const { db, switchWorkspace, user } = useStore();
  const active = db.workspaces.find((w) => w.active);

  return (
    <AdminPage
      title="Workspaces"
      desc="Pisahkan pekerjaan studio, lab internal, dan portal klien tanpa mencampur data."
      actions={<Badge tone="success" dot>{active?.name}</Badge>}
    >
      <div className="figs figs-3">
        <Fig label="Workspace" value={db.workspaces.length} hint="Satu aktif per sesi" icon={<Building2 size={17} />} />
        <Fig
          label="Total anggota"
          value={db.workspaces.reduce((s, w) => s + w.members, 0)}
          hint="Termasuk portal klien"
          icon={<Users size={17} />}
        />
        <Fig
          label="Proyek terdaftar"
          value={db.workspaces.reduce((s, w) => s + w.projects, 0)}
          hint="Di seluruh workspace"
          icon={<CheckCircle2 size={17} />}
        />
      </div>

      <div className="workspace-grid mt-16">
        {db.workspaces.map((ws) => (
          <div key={ws.id} className={cx('workspace-card', ws.active && 'is-active')}>
            <div className="workspace-head">
              <span className="workspace-mark">{ws.name.slice(0, 2).toUpperCase()}</span>
              <div>
                <strong>{ws.name}</strong>
                <span>{ws.plan}</span>
              </div>
              {ws.active ? <Badge tone="success" dot>Aktif</Badge> : <Badge tone="neutral">Tidak aktif</Badge>}
            </div>
            <div className="workspace-stats">
              <div>
                <span>Anggota</span>
                <strong>{ws.members}</strong>
              </div>
              <div>
                <span>Proyek</span>
                <strong>{ws.projects}</strong>
              </div>
              <div>
                <span>Paket</span>
                <strong>{ws.plan}</strong>
              </div>
            </div>
            <div className="workspace-people">
              {db.users.slice(0, Math.min(ws.members, 4)).map((u) => (
                <Avatar key={u.id} name={u.name} size={26} />
              ))}
              {ws.members > 4 && <span className="avatar-more">+{ws.members - 4}</span>}
            </div>
            <button
              type="button"
              className={cx('btn', ws.active ? 'btn-outline' : 'btn-primary')}
              onClick={() => switchWorkspace(ws.id)}
              disabled={ws.active}
            >
              {ws.active ? 'Workspace aktif' : 'Pindah ke workspace ini'}
            </button>
          </div>
        ))}
      </div>

      <Card title="Batas workspace" sub="Aturan yang berlaku untuk semua paket." className="mt-16">
        <ul className="rule-list">
          <li>
            <Check size={14} /> Data CRM dan konten tidak berpindah otomatis antar workspace.
          </li>
          <li>
            <Lock size={14} /> Portal klien tidak melihat audit internal atau antrean agent.
          </li>
          <li>
            <ShieldCheck size={14} /> Publish tetap hanya untuk Owner pada workspace masing-masing.
          </li>
          <li>
            <KeyRound size={14} /> Integrasi bersifat per workspace dan menyimpan referensi credential.
          </li>
        </ul>
      </Card>
      <p className="footnote">Sesi saat ini: {user.name} · {user.role}.</p>
    </AdminPage>
  );
}

export function IntegrationsPage() {
  const { db } = useStore();
  const [detail, setDetail] = useState<Integration | null>(null);
  const connected = db.integrations.filter((i) => i.status === 'Terhubung');
  const setup = db.integrations.filter((i) => i.status === 'Needs setup');

  return (
    <AdminPage
      title="Integrations"
      desc="Status koneksi eksternal. Integrasi hanya menyimpan referensi credential di server."
      actions={<Badge tone="info">{connected.length} terhubung</Badge>}
    >
      <div className="figs figs-3">
        <Fig label="Terhubung" value={connected.length} hint="Siap dipakai dengan guard" icon={<Plug size={17} />} />
        <Fig label="Needs setup" value={setup.length} hint="Fitur terkait ditutup" icon={<AlertTriangle size={17} />} />
        <Fig label="Total integrasi" value={db.integrations.length} hint="Tanpa credential di klien" icon={<KeyRound size={17} />} />
      </div>

      <div className="integration-grid mt-16">
        {db.integrations.map((integration) => (
          <button
            key={integration.id}
            type="button"
            className={cx('integration-card', integration.status === 'Needs setup' && 'is-warning')}
            onClick={() => setDetail(integration)}
          >
            <div className="integration-card-head">
              <span className="integration-mark">{integration.mark}</span>
              <AutoBadge value={integration.status} />
            </div>
            <strong>{integration.name}</strong>
            <span className="integration-cat">{integration.category}</span>
            <p>{integration.note}</p>
            <div className="integration-foot">
              {integration.lastSync ? `Sinkron ${relTime(integration.lastSync)}` : 'Belum pernah sinkron'}
            </div>
          </button>
        ))}
      </div>

      <div className="notice-banner tone-warning mt-16">
        <Lock size={16} />
        <div>
          <strong>Credential tidak disimpan di database aplikasi.</strong>
          <span>Yang tersedia hanya `credential_ref`. Nilai rahasia dibaca dari secret server saat dibutuhkan.</span>
        </div>
      </div>

      <Drawer
        open={Boolean(detail)}
        onClose={() => setDetail(null)}
        title={detail?.name ?? 'Integrasi'}
        sub={detail ? `${detail.category} · ${detail.status}` : undefined}
        footer={
          <button type="button" className="btn btn-ghost" onClick={() => setDetail(null)}>
            Tutup
          </button>
        }
      >
        {detail && (
          <div className="detail-stack">
            <div className="integration-hero">
              <span className="integration-mark lg">{detail.mark}</span>
              <div>
                <strong>{detail.name}</strong>
                <span>{detail.category}</span>
              </div>
              <AutoBadge value={detail.status} />
            </div>
            <p className="prose-sm">{detail.note}</p>
            <div className="detail-grid">
              <div>
                <span className="detail-label">Terakhir sinkron</span>
                <span>{detail.lastSync ? `${fmtDate(detail.lastSync, true)} · ${fmtTime(detail.lastSync)}` : 'Belum pernah'}</span>
              </div>
              <div>
                <span className="detail-label">Penyimpanan rahasia</span>
                <span className="mono">credential_ref</span>
              </div>
              <div>
                <span className="detail-label">Akses klien</span>
                <span>Tidak ada nilai rahasia</span>
              </div>
              <div>
                <span className="detail-label">Status</span>
                <AutoBadge value={detail.status} />
              </div>
            </div>
            {detail.status === 'Needs setup' && (
              <div className="notice-banner tone-warning">
                <AlertTriangle size={16} />
                <div>
                  <strong>Fitur terkait ditutup.</strong>
                  <span>
                    Media, Newsletter, Email Marketing, dan WhatsApp CRM tetap tidak tersedia sampai dependency ini aktif di server.
                  </span>
                </div>
              </div>
            )}
            <p className="footnote">
              <ShieldCheck size={12} /> Perubahan integrasi menghasilkan entri audit dan tidak pernah menampilkan secret ke klien.
            </p>
          </div>
        )}
      </Drawer>
    </AdminPage>
  );
}

export function AuditPage() {
  const { db } = useStore();
  const [query, setQuery] = useState('');
  const [moduleFilter, setModuleFilter] = useState('all');
  const [page, setPage] = useState(1);
  const pageSize = 10;

  const modules = Array.from(new Set(db.audit.map((a) => a.module))).sort();
  const filtered = db.audit
    .filter((a) => (moduleFilter === 'all' ? true : a.module === moduleFilter))
    .filter((a) => `${a.actor} ${a.action} ${a.target}`.toLowerCase().includes(query.toLowerCase()));
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, pageCount);
  const rows = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  return (
    <AdminPage
      title="Audit"
      desc="Setiap aksi tulis punya jejak: siapa, kapan, apa, dan di modul mana."
      actions={
        <button
          type="button"
          className="btn btn-outline btn-sm"
          onClick={() => downloadJSON('playdesign-audit.json', filtered)}
          disabled={filtered.length === 0}
        >
          <Download size={14} /> Ekspor JSON
        </button>
      }
    >
      <div className="figs figs-3">
        <Fig label="Total entri" value={db.audit.length} hint="Audit trail lokal" icon={<ScrollText size={17} />} />
        <Fig
          label="Aksi agent"
          value={db.audit.filter((a) => a.actor.includes('agent')).length}
          hint="Semua lewat guard server"
          icon={<ShieldCheck size={17} />}
        />
        <Fig label="Modul tercatat" value={modules.length} hint="Tidak ada modul tanpa audit" icon={<Building2 size={17} />} />
      </div>

      <div className="toolbar toolbar-wrap mt-16">
        <SearchField value={query} onChange={(v) => { setQuery(v); setPage(1); }} placeholder="Cari aktor, aksi, atau target…" />
        <div className="toolbar-actions">
          <SelectBox
            label="Filter modul"
            value={moduleFilter}
            onChange={(v) => { setModuleFilter(v); setPage(1); }}
            options={[{ value: 'all', label: 'Semua modul' }, ...modules.map((m) => ({ value: m, label: m }))]}
          />
        </div>
      </div>

      <Card bodyClass="card-flush">
        {rows.length === 0 ? (
          <EmptyState icon={<ScrollText size={22} />} title="Tidak ada entri audit" desc="Ubah filter atau kata kunci." />
        ) : (
          <div className="table-wrap">
            <table className="pd-table">
              <thead>
                <tr>
                  <th scope="col">Waktu</th>
                  <th scope="col">Aktor</th>
                  <th scope="col">Aksi</th>
                  <th scope="col">Target</th>
                  <th scope="col">Modul</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((entry) => (
                  <tr key={entry.id}>
                    <td>
                      <div className="cell-main">{fmtDate(entry.at)}</div>
                      <div className="cell-sub">{fmtTime(entry.at)}</div>
                    </td>
                    <td>{entry.actor}</td>
                    <td>{entry.action}</td>
                    <td>{entry.target}</td>
                    <td>
                      <Badge tone="neutral">{entry.module}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pager page={safePage} pageCount={pageCount} total={filtered.length} pageSize={pageSize} onChange={setPage} />
      </Card>

      <p className="footnote">
        <Lock size={12} /> Audit tidak bisa diedit atau dihapus dari UI. Retensi mengikuti kebijakan workspace.
      </p>
    </AdminPage>
  );
}

const MODULE_REGISTRY: Array<{ name: string; status: 'Live' | 'Foundation' | 'Planned'; guard?: string }> = [
  { name: 'Overview', status: 'Live' },
  { name: 'CRM', status: 'Foundation', guard: 'Won/lost wajib alasan + audit' },
  { name: 'Projects', status: 'Foundation' },
  { name: 'Marketing & Content', status: 'Planned', guard: 'Approval sebelum publish' },
  { name: 'AI Agent Center', status: 'Foundation', guard: 'Agent tanpa hak keluar' },
  { name: 'Team Collaboration', status: 'Foundation' },
  { name: 'Administration', status: 'Foundation', guard: 'Audit untuk perubahan izin' },
  { name: 'Fitur Lanjutan', status: 'Live' },
];

export function AdminSettingsPage() {
  const { db, saveSettings, can, toast } = useStore();
  const allowed = can('admin.modules');
  const [form, setForm] = useState<DB['settings']>(db.settings);

  const update = <K extends keyof DB['settings']>(key: K, value: DB['settings'][K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const submit = () => {
    if (!allowed) {
      toast('Peran ini tidak bisa mengubah kebijakan workspace.', 'danger');
      return;
    }
    if (form.autoRetry) {
      toast('Auto-retry job keluar tidak diizinkan. Matikan opsi ini.', 'danger');
      return;
    }
    saveSettings(form);
  };

  return (
    <AdminPage
      title="Settings"
      desc="Kebijakan modul dan notifikasi. Opsi yang bertentangan dengan guard tidak bisa diaktifkan."
      actions={
        <button type="button" className="btn btn-primary" onClick={submit} disabled={!allowed}>
          <Check size={14} /> Simpan kebijakan
        </button>
      }
    >
      {!allowed && (
        <div className="notice-banner tone-warning">
          <Lock size={16} />
          <div>
            <strong>Mode hanya lihat.</strong>
            <span>Hanya Owner dan Admin yang bisa mengubah kebijakan workspace.</span>
          </div>
        </div>
      )}

      <div className="overview-grid mt-16">
        <Card title="Notifikasi & digest" sub="Hanya kejadian nyata yang memicu notifikasi." className="span-7">
          <div className="setting-list">
            <div className="setting-row">
              <div>
                <strong>Digest harian</strong>
                <span>Ringkasan pekerjaan dan antrean approval setiap pagi.</span>
              </div>
              <Toggle checked={form.digest} onChange={(v) => update('digest', v)} label="Digest harian" />
            </div>
            <div className="setting-row">
              <div>
                <strong>Notifikasi approval</strong>
                <span>Kirim saat packet baru menunggu keputusan Owner.</span>
              </div>
              <Toggle checked={form.notifyApprovals} onChange={(v) => update('notifyApprovals', v)} label="Notifikasi approval" />
            </div>
            <div className="setting-row">
              <div>
                <strong>Notifikasi job</strong>
                <span>Kirim saat job gagal atau berstatus delivery_uncertain.</span>
              </div>
              <Toggle checked={form.notifyJobs} onChange={(v) => update('notifyJobs', v)} label="Notifikasi job" />
            </div>
            <div className="setting-row is-locked">
              <div>
                <strong>Auto-retry job</strong>
                <span>Tidak diizinkan. delivery_uncertain harus menunggu keputusan manusia.</span>
              </div>
              <Toggle checked={false} onChange={() => toast('Auto-retry dinonaktifkan oleh guard pengiriman.', 'warning')} label="Auto-retry job" />
            </div>
          </div>
        </Card>

        <Card title="Registry modul" sub="Status jujur, tanpa menyembunyikan modul Planned." className="span-5">
          <ul className="registry-list">
            {MODULE_REGISTRY.map((module) => (
              <li key={module.name}>
                <div>
                  <strong>{module.name}</strong>
                  {module.guard && <span>{module.guard}</span>}
                </div>
                <StatusPill status={module.status} />
              </li>
            ))}
          </ul>
          <p className="footnote">
            <Settings2 size={12} /> Modul Planned tetap tampil di sidebar dengan label status.
          </p>
        </Card>
      </div>

      <Card title="Guard yang selalu aktif" sub="Tidak bisa dimatikan dari pengaturan." className="mt-16">
        <div className="guard-grid">
          <div className="guard-item">
            <Lock size={16} />
            <div>
              <strong>Approval manusia</strong>
              <span>Tidak ada publish atau kirim keluar tanpa keputusan Owner.</span>
            </div>
          </div>
          <div className="guard-item">
            <ShieldCheck size={16} />
            <div>
              <strong>Dua status terpisah</strong>
              <span>Status konten dan status delivery tidak pernah digabung.</span>
            </div>
          </div>
          <div className="guard-item">
            <KeyRound size={16} />
            <div>
              <strong>Rahasia hanya di server</strong>
              <span>Tidak ada credential di frontend, DB aplikasi, repo, atau log.</span>
            </div>
          </div>
          <div className="guard-item">
            <ScrollText size={16} />
            <div>
              <strong>Audit melekat</strong>
              <span>Setiap aksi tulis mencatat aktor, waktu, target, dan modul.</span>
            </div>
          </div>
        </div>
      </Card>
    </AdminPage>
  );
}
