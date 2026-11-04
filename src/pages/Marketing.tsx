import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  CalendarPlus,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Clock,
  Eye,
  FileText,
  Image,
  Lock,
  Mail,
  MessageSquare,
  PenLine,
  Plus,
  Rocket,
  Send,
  ShieldCheck,
  Sparkles,
  Trash2,
  Upload,
  XCircle,
} from 'lucide-react';
import { useStore } from '../store/store';
import {
  AutoBadge,
  Avatar,
  Badge,
  Card,
  Drawer,
  EmptyState,
  Field,
  Fig,
  LinkButton,
  Modal,
  PageHead,
  Pager,
  Progress,
  SearchField,
  SelectBox,
  Tabs,
} from '../components/ui';
import {
  articleStatusLabel,
  cx,
  deliveryLabel,
  fmtDate,
  num,
  relTime,
} from '../lib/utils';
import type { Article, ArticleStatus, Comment, SocialPost } from '../data/types';
import { SocialPostPreview } from '../components/SocialPostPreview';

function MarketingPage({ title, desc, actions, children }: { title: string; desc: string; actions?: React.ReactNode; children: React.ReactNode }) {
  return (
    <>
      <PageHead kicker="Marketing & Content · Planned" title={title} desc={desc} actions={actions} />
      {children}
    </>
  );
}

const STATUS_TABS: Array<{ key: ArticleStatus | 'all'; label: string }> = [
  { key: 'all', label: 'Semua' },
  { key: 'draft', label: 'Draft' },
  { key: 'in_review', label: 'Review' },
  { key: 'approved', label: 'Approved' },
  { key: 'scheduled', label: 'Terjadwal' },
  { key: 'published', label: 'Terbit' },
  { key: 'archived', label: 'Arsip' },
];

const TOPIC_SUGGESTIONS = [
  {
    title: 'Aksesibilitas warna: mengukur kontras tanpa menebak',
    category: 'Design Notes',
    excerpt: 'Panduan praktis memilih pasangan warna yang lolos kontras 4.5:1 tanpa mengorbankan karakter brand.',
    body: 'Kontras adalah keputusan desain, bukan pemeriksaan terakhir sebelum rilis.\n\nKami memulai dengan menetapkan pasangan warna inti, mengukur rasio kontrasnya, lalu menyiapkan alternatif untuk teks kecil dan elemen interaktif.\n\nDraft ini perlu ditambahkan contoh dari sistem warna Sagara.',
  },
  {
    title: 'Brief motion identity untuk tim kecil',
    category: 'Process',
    excerpt: 'Apa yang perlu disepakati sebelum meminta motion designer membuat animasi logo pertama.',
    body: 'Motion identity bukan sekadar animasi logo. Ia adalah aturan ritme, easing, dan batas gerak.\n\nUntuk tim kecil, brief yang baik cukup satu halaman: konteks pemakaian, tiga referensi gerak, dan satu hal yang harus dihindari.\n\nDraft ini menunggu contoh dari proyek Gerak.',
  },
  {
    title: 'Studi kasus: sistem kemasan Ruang Kopi',
    category: 'Case Study',
    excerpt: 'Keputusan dieline, hierarki informasi, dan kompromi produksi pada tiga SKU pertama.',
    body: 'Studi kasus ini mencatat keputusan, bukan hanya hasil akhir.\n\nKami memilih struktur dieline yang bisa dipakai untuk tiga ukuran, lalu membangun hierarki informasi dari jarak baca di rak.\n\nDraft ini belum boleh terbit sebelum klien menyetujui penyebutan nama.',
  },
];

export function MarketingOverview() {
  const { db, can, createArticle, toast } = useStore();
  const navigate = useNavigate();
  const published = db.articles.filter((a) => a.status === 'published').length;
  const review = db.articles.filter((a) => a.status === 'in_review').length;
  const approved = db.articles.filter((a) => a.status === 'approved').length;
  const drafts = db.articles.filter((a) => a.status === 'draft').length;
  const pending = db.approvals.filter((a) => a.status === 'pending');

  const flow = [
    { key: 'draft', label: 'Draft', count: drafts },
    { key: 'in_review', label: 'Review', count: review },
    { key: 'approved', label: 'Approved', count: approved },
    { key: 'published', label: 'Terbit', count: published },
  ];

  const useSuggestion = (topic: (typeof TOPIC_SUGGESTIONS)[number]) => {
    if (!can('content.write')) {
      toast('Peran ini tidak punya izin menulis konten.', 'danger');
      return;
    }
    const id = createArticle({
      title: topic.title,
      category: topic.category,
      excerpt: topic.excerpt,
      body: topic.body,
      authorId: db.users[0].id,
    });
    navigate(`/marketing/editor?id=${id}`);
  };

  return (
    <MarketingPage
      title="Marketing & Content"
      desc="Satu alur dari draft sampai delivery. Status konten dan status pengiriman adalah dua kolom berbeda."
      actions={
        <>
          <Link to="/marketing/articles" className="btn btn-ghost"><FileText size={15} /> Articles</Link>
          <Link to="/marketing/editor" className="btn btn-primary"><PenLine size={15} /> Tulis artikel</Link>
        </>
      }
    >
      <div className="figs figs-4">
        <Fig label="Terbit" value={published} hint={`${num(db.articles.reduce((s, a) => s + a.views, 0))} kunjungan`} icon={<FileText size={16} />} onClick={() => navigate('/marketing/articles')} />
        <Fig label="Di review" value={review} hint="Menunggu keputusan Owner" icon={<Clock size={16} />} onClick={() => navigate('/approvals')} />
        <Fig label="Approved" value={approved} hint="Siap dijadwalkan" icon={<ShieldCheck size={16} />} onClick={() => navigate('/marketing/articles')} />
        <Fig label="Draft" value={drafts} hint="Belum diajukan" icon={<PenLine size={16} />} onClick={() => navigate('/marketing/articles')} />
      </div>

      <div className="grid-main">
        <Card className="span-6" title="Alur konten" sub="draft → review → approved → terbit">
          <div className="flow-chain">
            {flow.map((f, i) => (
              <div className="flow-step" key={f.key}>
                <div className={`flow-node tone-${f.key}`}>
                  <strong>{f.count}</strong>
                  <span>{f.label}</span>
                </div>
                {i < flow.length - 1 && <ArrowRight size={16} className="flow-arrow" />}
              </div>
            ))}
          </div>
          <div className="flow-status">
            <div className="split-row">
              <span>Delivery</span>
              <Link to="/marketing/articles" className="text-btn">Lihat status <ArrowRight size={12} /></Link>
            </div>
            <div className="delivery-chips">
              {['published', 'scheduled', 'queued', 'delivery_uncertain'].map((s) => (
                <span className="delivery-chip" key={s}>
                  <AutoBadge value={s} />
                  <strong>{db.articles.filter((a) => a.delivery === s).length}</strong>
                </span>
              ))}
            </div>
            <p className="muted-small">Delivery uncertain tidak di-retry otomatis dan butuh keputusan manusia.</p>
          </div>
        </Card>

        <Card
          className="span-6 ai-panel"
          title={<span className="inline-title"><Sparkles size={16} /> Saran topik dari Hermes</span>}
          sub="Panel saran kosong bila Hermes tidak tersedia"
          action={<Badge tone="violet">AI draft</Badge>}
        >
          <div className="suggestion-list">
            {TOPIC_SUGGESTIONS.map((t) => (
              <div className="suggestion" key={t.title}>
                <div className="suggestion-main">
                  <Badge tone="neutral">{t.category}</Badge>
                  <strong>{t.title}</strong>
                  <p>{t.excerpt}</p>
                </div>
                <button type="button" className="btn btn-outline btn-xs" onClick={() => useSuggestion(t)}>
                  <Plus size={12} /> Buat draft
                </button>
              </div>
            ))}
          </div>
          <div className="notice-inline"><ShieldCheck size={14} /> Saran hanya membuat draft. Terbit tetap lewat approval Owner.</div>
        </Card>

        <Card
          className="span-8"
          title="Artikel terbaru"
          sub="Status dan delivery dipisah"
          action={<LinkButton to="/marketing/articles">Semua artikel</LinkButton>}
          bodyClass="no-pad"
        >
          <div className="table-wrap">
            <table className="pd-table">
              <thead>
                <tr>
                  <th scope="col">Post</th>
                  <th scope="col">Status</th>
                  <th scope="col">Delivery</th>
                  <th scope="col">Tanggal</th>
                  <th scope="col">Views</th>
                </tr>
              </thead>
              <tbody>
                {db.articles.slice(0, 6).map((a) => (
                  <tr key={a.id} className="is-clickable" onClick={() => navigate('/marketing/articles')}>
                    <td>
                      <div className="cell-main">
                        <strong>{a.title}</strong>
                        <span className="cell-sub">{a.category} · {db.users.find((u) => u.id === a.authorId)?.name}</span>
                      </div>
                    </td>
                    <td><AutoBadge value={articleStatusLabel[a.status]} /></td>
                    <td><AutoBadge value={deliveryLabel[a.delivery]} /></td>
                    <td>{fmtDate(a.date)}</td>
                    <td className="num-cell">{num(a.views)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card className="span-4" title="Antrean approval konten" sub={`${pending.length} packet menunggu`} bodyClass="no-pad">
          <div className="queue-list">
            {pending.slice(0, 4).map((a) => (
              <Link to="/approvals" className="queue-item" key={a.id}>
                <span className={cx('queue-icon', a.qc === 'PASS' ? 'is-ok' : a.qc === 'FAIL' ? 'is-danger' : 'is-warning')}>
                  <ShieldCheck size={15} />
                </span>
                <span className="queue-copy">
                  <span className="queue-title">{a.title}</span>
                  <span className="queue-meta">{a.kind} · {relTime(a.at)}</span>
                </span>
                <Badge tone={a.qc === 'PASS' ? 'success' : a.qc === 'FAIL' ? 'danger' : 'warning'}>{a.qc}</Badge>
              </Link>
            ))}
          </div>
          <div className="queue-foot">
            <span className="muted-small">Tak ada publish tanpa approval</span>
            <Link to="/approvals" className="text-btn">Buka <ArrowRight size={13} /></Link>
          </div>
        </Card>
      </div>
    </MarketingPage>
  );
}

export function ArticlesPage() {
  const { db, can, role, publishArticle, submitReview } = useStore();
  const navigate = useNavigate();
  const [tab, setTab] = useState('all');
  const [q, setQ] = useState('');
  const [category, setCategory] = useState('all');
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const pageSize = 8;

  const selected = db.articles.find((a) => a.id === selectedId) ?? null;
  const categories = Array.from(new Set(db.articles.map((a) => a.category)));
  const filtered = db.articles.filter((a) => {
    const matches = `${a.title} ${a.category}`.toLowerCase().includes(q.toLowerCase());
    return matches && (tab === 'all' || a.status === tab) && (category === 'all' || a.category === category);
  });
  const pageCount = Math.ceil(filtered.length / pageSize) || 1;
  const current = Math.min(page, pageCount);
  const rows = filtered.slice((current - 1) * pageSize, current * pageSize);
  const canWrite = can('content.write');

  return (
    <MarketingPage
      title="Articles"
      desc="Tab status, pencarian, filter kategori, dan alur pengajuan review. Editor tidak punya tombol publish."
      actions={<Link to="/marketing/editor" className="btn btn-primary"><PenLine size={15} /> Tulis artikel</Link>}
    >
      <Card bodyClass="no-pad">
        <div className="card-tabs">
          <Tabs
            items={STATUS_TABS.map((t) => ({
              key: t.key,
              label: t.label,
              count: t.key === 'all' ? db.articles.length : db.articles.filter((a) => a.status === t.key).length,
            }))}
            value={tab}
            onChange={(v) => { setTab(v); setPage(1); }}
            label="Status artikel"
          />
        </div>
        <div className="table-toolbar">
          <SearchField value={q} onChange={(v) => { setQ(v); setPage(1); }} placeholder="Cari judul atau kategori…" />
          <div className="toolbar-filters">
            <SelectBox
              label="Kategori"
              value={category}
              onChange={(v) => { setCategory(v); setPage(1); }}
              options={[{ value: 'all', label: 'Semua kategori' }, ...categories.map((c) => ({ value: c, label: c }))]}
            />
          </div>
        </div>
        <div className="table-wrap">
          <table className="pd-table">
            <thead>
              <tr>
                <th scope="col">Post</th>
                <th scope="col">Penulis</th>
                <th scope="col">Status</th>
                <th scope="col">Delivery</th>
                <th scope="col">Tanggal</th>
                <th scope="col">Views</th>
                <th scope="col">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((a) => (
                <tr key={a.id} className="is-clickable" onClick={() => setSelectedId(a.id)}>
                  <td>
                    <div className="cell-main">
                      <strong>{a.title}</strong>
                      <span className="cell-sub">{a.category}</span>
                    </div>
                  </td>
                  <td>
                    <span className="cell-person-inline">
                      <Avatar name={db.users.find((u) => u.id === a.authorId)?.name ?? '—'} size={22} />
                      {db.users.find((u) => u.id === a.authorId)?.name.split(' ')[0]}
                    </span>
                  </td>
                  <td><AutoBadge value={articleStatusLabel[a.status]} /></td>
                  <td><AutoBadge value={deliveryLabel[a.delivery]} /></td>
                  <td>{fmtDate(a.date)}</td>
                  <td className="num-cell">{num(a.views)}</td>
                  <td>
                    <button type="button" className="btn btn-outline btn-xs" onClick={(e) => { e.stopPropagation(); setSelectedId(a.id); }}>
                      Buka
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {rows.length === 0 && <EmptyState icon={<FileText size={20} />} title="Tidak ada artikel" desc="Ubah tab atau filter pencarian." />}
        <Pager page={current} pageCount={pageCount} total={filtered.length} pageSize={pageSize} onChange={setPage} />
      </Card>

      <Drawer
        open={!!selected}
        onClose={() => setSelectedId(null)}
        title={selected?.title ?? ''}
        sub={selected ? `${selected.category} · ${db.users.find((u) => u.id === selected.authorId)?.name}` : undefined}
        width={580}
        footer={
          selected ? (
            <>
              <button type="button" className="btn btn-ghost" onClick={() => setSelectedId(null)}>Tutup</button>
              {selected.status === 'draft' && canWrite && (
                <button type="button" className="btn btn-ghost" onClick={() => navigate(`/marketing/editor?id=${selected.id}`)}>
                  <PenLine size={14} /> Edit
                </button>
              )}
              {selected.status === 'draft' && (
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => {
                    submitReview(selected.id);
                    setSelectedId(null);
                  }}
                >
                  Ajukan review <ArrowRight size={14} />
                </button>
              )}
              {selected.status === 'in_review' && (
                <Link to="/approvals" className="btn btn-primary">Buka approval <ShieldCheck size={14} /></Link>
              )}
              {selected.status === 'approved' && can('content.publish') && (
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => {
                    publishArticle(selected.id);
                    setSelectedId(null);
                  }}
                >
                  <Rocket size={14} /> Terbitkan
                </button>
              )}
              {selected.status === 'scheduled' && (
                <Link to="/marketing/social" className="btn btn-primary">Lihat jadwal <CalendarPlus size={14} /></Link>
              )}
              {(selected.status === 'published' || selected.status === 'archived') && (
                <Link to="/marketing/library" className="btn btn-primary">Content Library <ArrowRight size={14} /></Link>
              )}
            </>
          ) : undefined
        }
      >
        {selected && (
          <div className="detail-stack">
            <div className="detail-grid">
              <div><span className="detail-label">Status konten</span><AutoBadge value={articleStatusLabel[selected.status]} /></div>
              <div><span className="detail-label">Status delivery</span><AutoBadge value={deliveryLabel[selected.delivery]} /></div>
              <div><span className="detail-label">Tanggal</span><strong>{fmtDate(selected.date, true)}</strong></div>
              <div><span className="detail-label">Views</span><strong>{num(selected.views)}</strong></div>
              <div><span className="detail-label">Slug</span><code className="code-inline">/{selected.slug}</code></div>
              <div><span className="detail-label">Kanal</span><span>{selected.channels?.join(', ') ?? 'Website'}</span></div>
            </div>

            <div className="detail-block">
              <h4>Ringkasan</h4>
              <p className="muted-text">{selected.excerpt}</p>
            </div>

            <div className="detail-block">
              <h4>Riwayat revisi</h4>
              <ol className="revision-list">
                {selected.revisions.map((r, i) => (
                  <li key={`${r.at}-${i}`}>
                    <span className="revision-dot" />
                    <div>
                      <strong>{r.label}</strong>
                      <span>{r.by} · {relTime(r.at)}</span>
                    </div>
                  </li>
                ))}
              </ol>
            </div>

            {selected.status === 'approved' && !can('content.publish') && (
              <div className="notice-banner is-warning">
                <Lock size={16} />
                <div>
                  <strong>Tombol publish hanya untuk Owner</strong>
                  <p>Peran {role} tidak memiliki izin <code>content.publish</code>. Guard tetap berjalan di server.</p>
                </div>
              </div>
            )}
            {selected.status === 'in_review' && (
              <div className="notice-inline"><ShieldCheck size={14} /> QC PASS sudah tercatat. Menunggu keputusan Owner.</div>
            )}
          </div>
        )}
      </Drawer>
    </MarketingPage>
  );
}

export function PagesPage() {
  const { db, addPage, can, toast } = useStore();
  const [tab, setTab] = useState('all');
  const [addOpen, setAddOpen] = useState(false);
  const [preview, setPreview] = useState<{ title: string; slug: string; type: string; status: string } | null>(null);
  const [form, setForm] = useState({ title: '', slug: '', type: 'Statis' as 'Statis' | 'Landing' });
  const rows = db.pages.filter((p) => tab === 'all' || p.type === tab);

  return (
    <MarketingPage
      title="Pages"
      desc="Halaman statis dan landing dengan slug, status, dan pemakaian di menu."
      actions={
        <button type="button" className="btn btn-primary" onClick={() => setAddOpen(true)}>
          <Plus size={15} /> Halaman baru
        </button>
      }
    >
      <Card bodyClass="no-pad">
        <div className="card-tabs">
          <Tabs
            items={[
              { key: 'all', label: 'Semua', count: db.pages.length },
              { key: 'Statis', label: 'Static', count: db.pages.filter((p) => p.type === 'Statis').length },
              { key: 'Landing', label: 'Landing', count: db.pages.filter((p) => p.type === 'Landing').length },
            ]}
            value={tab}
            onChange={setTab}
            label="Jenis halaman"
          />
        </div>
        <div className="table-wrap">
          <table className="pd-table">
            <thead>
              <tr>
                <th scope="col">Halaman</th>
                <th scope="col">Slug</th>
                <th scope="col">Tipe</th>
                <th scope="col">Status</th>
                <th scope="col">Dipakai di</th>
                <th scope="col">Diperbarui</th>
                <th scope="col">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.id} className="is-clickable" onClick={() => setPreview(p)}>
                  <td><strong>{p.title}</strong></td>
                  <td><code className="code-inline">/{p.slug}</code></td>
                  <td><Badge tone="neutral">{p.type}</Badge></td>
                  <td><AutoBadge value={p.status} /></td>
                  <td>{p.menus.length ? p.menus.join(', ') : <span className="muted-small">—</span>}</td>
                  <td>{fmtDate(p.updated)}</td>
                  <td>
                    <button type="button" className="btn btn-outline btn-xs" onClick={(e) => { e.stopPropagation(); setPreview(p); }}>
                      <Eye size={12} /> Pratinjau
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {rows.length === 0 && <EmptyState icon={<FileText size={20} />} title="Belum ada halaman" desc="Buat halaman draft pertama." />}
      </Card>

      <Modal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        title="Halaman baru"
        sub="Halaman dibuat sebagai draft dan belum dipakai di menu."
        footer={
          <>
            <button type="button" className="btn btn-ghost" onClick={() => setAddOpen(false)}>Batal</button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                if (!can('content.write')) {
                  toast('Peran ini tidak punya izin menulis.', 'danger');
                  return;
                }
                if (!form.title.trim()) {
                  toast('Judul wajib diisi.', 'danger');
                  return;
                }
                addPage({
                  title: form.title,
                  slug: form.slug || form.title.toLowerCase().replace(/\s+/g, '-'),
                  type: form.type,
                });
                setForm({ title: '', slug: '', type: 'Statis' });
                setAddOpen(false);
              }}
            >
              Buat halaman
            </button>
          </>
        }
      >
        <div className="form-grid">
          <Field label="Judul"><input className="input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} autoFocus /></Field>
          <Field label="Slug" hint="Kosongkan untuk dibuat otomatis."><input className="input" value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} placeholder="tentang-kami" /></Field>
          <Field label="Tipe">
            <select className="input" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as 'Statis' | 'Landing' })}>
              <option>Statis</option>
              <option>Landing</option>
            </select>
          </Field>
        </div>
      </Modal>

      <Drawer
        open={!!preview}
        onClose={() => setPreview(null)}
        title={preview?.title ?? ''}
        sub={preview ? `/${preview.slug}` : undefined}
      >
        {preview && (
          <div className="detail-stack">
            <div className="detail-grid">
              <div><span className="detail-label">Tipe</span><strong>{preview.type}</strong></div>
              <div><span className="detail-label">Status</span><AutoBadge value={preview.status} /></div>
            </div>
            <div className="preview-frame">
              <div className="preview-bar">
                <span className="preview-dots"><i /><i /><i /></span>
                <span className="preview-url">playdesign.studio/{preview.slug}</span>
              </div>
              <div className="preview-body">
                <p className="preview-kicker">playdesign studio</p>
                <h2>{preview.title}</h2>
                <p>Pratinjau struktural. Konten penuh dirender oleh CMS setelah halaman terbit.</p>
                <span className={cx('preview-pill', preview.status === 'Terbit' ? 'is-live' : '')}>{preview.status === 'Terbit' ? 'Live' : 'Draft'}</span>
              </div>
            </div>
            <div className="notice-inline"><Eye size={14} /> Pratinjau lokal, bukan halaman publik.</div>
          </div>
        )}
      </Drawer>
    </MarketingPage>
  );
}

export function PostEditorPage() {
  const { db, can, role, createArticle, updateArticle, submitReview, publishArticle, toast } = useStore();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const id = params.get('id');
  const article = db.articles.find((a) => a.id === id) ?? null;
  const readOnly = !can('content.write');

  const [title, setTitle] = useState('');
  const [slug, setSlug] = useState('');
  const [category, setCategory] = useState('Design Notes');
  const [excerpt, setExcerpt] = useState('');
  const [body, setBody] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);

  useEffect(() => {
    if (article) {
      setTitle(article.title);
      setSlug(article.slug);
      setCategory(article.category);
      setExcerpt(article.excerpt);
      setBody(article.body);
      setSlugTouched(true);
    } else {
      setTitle('');
      setSlug('');
      setCategory('Design Notes');
      setExcerpt('');
      setBody('');
      setSlugTouched(false);
    }
  }, [article?.id]);

  const wordCount = body.trim() ? body.trim().split(/\s+/).length : 0;
  const readMinutes = Math.max(1, Math.round(wordCount / 200));
  const categories = ['Design Notes', 'Brand Strategy', 'Studio', 'Process', 'Case Study'];
  const status = article?.status ?? 'draft';

  const save = () => {
    if (readOnly) {
      toast('Peran ini tidak punya izin menulis.', 'danger');
      return null;
    }
    if (!title.trim()) {
      toast('Judul wajib diisi sebelum menyimpan.', 'danger');
      return null;
    }
    const payload = {
      title: title.trim(),
      slug: slug || title.toLowerCase().replace(/[^a-z0-9\s-]/g, '').trim().replace(/\s+/g, '-'),
      category,
      excerpt,
      body,
    };
    if (article) {
      updateArticle(article.id, payload);
      return article.id;
    }
    const newId = createArticle({ ...payload, authorId: db.users[0].id });
    navigate(`/marketing/editor?id=${newId}`, { replace: true });
    toast('Draft dibuat.', 'success');
    return newId;
  };

  return (
    <MarketingPage
      title={article ? 'Post Editor' : 'Post baru'}
      desc="Form, panel status, dan riwayat revisi. Menyimpan tidak menerbitkan apa pun."
      actions={
        <>
          <Link to="/marketing/articles" className="btn btn-ghost"><ArrowLeft size={15} /> Articles</Link>
          {article && status === 'approved' && can('content.publish') && (
            <button type="button" className="btn btn-primary" onClick={() => publishArticle(article.id)}>
              <Rocket size={15} /> Terbitkan
            </button>
          )}
        </>
      }
    >
      <div className="editor-layout">
        <Card className="editor-main" title={article ? 'Konten' : 'Draft baru'} sub={readOnly ? 'Mode baca — peran ini tidak bisa menulis' : 'Simpan draft, lalu ajukan review'}>
          <div className="form-grid">
            <Field label="Judul" className="span-2">
              <input
                className="input input-lg"
                value={title}
                onChange={(e) => {
                  setTitle(e.target.value);
                  if (!slugTouched) setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9\s-]/g, '').trim().replace(/\s+/g, '-'));
                }}
                placeholder="Judul artikel"
                disabled={readOnly}
              />
            </Field>
            <Field label="Slug">
              <input
                className="input"
                value={slug}
                onChange={(e) => { setSlug(e.target.value); setSlugTouched(true); }}
                placeholder="judul-artikel"
                disabled={readOnly}
              />
            </Field>
            <Field label="Kategori">
              <select className="input" value={category} onChange={(e) => setCategory(e.target.value)} disabled={readOnly}>
                {categories.map((c) => <option key={c}>{c}</option>)}
              </select>
            </Field>
            <Field label="Ringkasan" className="span-2" hint={`${excerpt.length}/180 karakter`}>
              <textarea className="input" rows={2} maxLength={180} value={excerpt} onChange={(e) => setExcerpt(e.target.value)} disabled={readOnly} />
            </Field>
            <Field label="Isi artikel" className="span-2" hint={`${wordCount} kata · ± ${readMinutes} menit baca`}>
              <textarea className="input editor-textarea" rows={16} value={body} onChange={(e) => setBody(e.target.value)} disabled={readOnly} placeholder="Tulis isi artikel di sini…" />
            </Field>
          </div>
          <div className="editor-actions">
            <button type="button" className="btn btn-ghost" disabled={readOnly} onClick={save}>
              Simpan draft
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={readOnly}
              onClick={() => {
                const savedId = save();
                if (savedId) submitReview(savedId);
              }}
            >
              Ajukan review <ArrowRight size={14} />
            </button>
            {readOnly && <span className="muted-small"><Lock size={12} /> Tombol tulis dinonaktifkan</span>}
          </div>
        </Card>

        <aside className="editor-side">
          <Card title="Status" sub={article ? `Terakhir ${relTime(article.revisions[article.revisions.length - 1]?.at ?? article.date)}` : 'Belum disimpan'}>
            <div className="status-steps">
              {(['draft', 'in_review', 'approved', 'published'] as ArticleStatus[]).map((s, i) => {
                const idx = ['draft', 'in_review', 'approved', 'scheduled', 'published', 'archived'].indexOf(status);
                const stepIdx = ['draft', 'in_review', 'approved', 'published'].indexOf(s);
                const isDone = idx > stepIdx && status !== 'archived';
                const isCurrent = status === s || (s === 'approved' && status === 'scheduled');
                return (
                  <div className={cx('status-step', isDone && 'is-done', isCurrent && 'is-current')} key={s}>
                    <span className="status-step-dot">{isDone ? <Check size={10} /> : i + 1}</span>
                    <div>
                      <strong>{articleStatusLabel[s]}</strong>
                      <span>{s === 'draft' ? 'Bisa diedit bebas' : s === 'in_review' ? 'QC & Owner' : s === 'approved' ? 'Siap terbit' : 'Live di website'}</span>
                    </div>
                  </div>
                );
              })}
            </div>
            {article && <div className="status-delivery"><span>Delivery</span><AutoBadge value={deliveryLabel[article.delivery]} /></div>}
            <div className="notice-inline"><Lock size={13} /> Editor tidak punya tombol publish.</div>
            <p className="muted-small">Peran aktif: {role}</p>
          </Card>

          <Card title="Riwayat revisi" sub={article ? `${article.revisions.length} entri` : 'Kosong'}>
            {article ? (
              <ol className="revision-list">
                {[...article.revisions].reverse().map((r, i) => (
                  <li key={`${r.at}-${i}`}>
                    <span className="revision-dot" />
                    <div>
                      <strong>{r.label}</strong>
                      <span>{r.by} · {relTime(r.at)}</span>
                    </div>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="muted-text small">Revisi muncul setelah draft disimpan.</p>
            )}
          </Card>

          <Card title="Pratinjau" sub="Ringkas, bukan render situs">
            <div className="editor-preview">
              <span className="preview-kicker">{category}</span>
              <h3>{title || 'Judul artikel'}</h3>
              <p>{excerpt || 'Ringkasan artikel akan tampil di sini.'}</p>
              <div className="preview-meta">
                <Avatar name={db.users[0].name} size={20} />
                {db.users[0].name.split(' ')[0]} · {readMinutes} menit baca
              </div>
            </div>
          </Card>
        </aside>
      </div>
    </MarketingPage>
  );
}

export function MediaPage() {
  return (
    <MarketingPage
      title="Media"
      desc="Grid, folder, upload, dan alt text. Upload ditutup sampai object storage tersedia."
      actions={<button type="button" className="btn btn-primary" disabled><Upload size={15} /> Upload</button>}
    >
      <div className="setup-banner">
        <div className="setup-icon"><Image size={22} /></div>
        <div className="setup-copy">
          <Badge tone="warning" dot>Needs setup</Badge>
          <h2>Media menunggu object storage</h2>
          <p>Upload tidak dibuka sebelum Cloudflare R2 dan kredensial server tersedia. Ini guard, bukan bug: tanpa storage, file tidak punya tempat yang aman.</p>
          <div className="setup-actions">
            <Link to="/admin/integrations" className="btn btn-primary">Buka integrasi <ArrowRight size={14} /></Link>
            <button type="button" className="btn btn-ghost" disabled><Upload size={14} /> Upload dinonaktifkan</button>
          </div>
        </div>
      </div>

      <div className="grid-3 mt-16">
        {[
          { icon: <Image size={18} />, title: 'Object storage', desc: 'Bucket R2 + signed URL untuk upload langsung.', state: 'Belum ada' },
          { icon: <ShieldCheck size={18} />, title: 'Validator MIME', desc: 'Hanya tipe berkas yang diizinkan diterima.', state: 'Siap' },
          { icon: <FileText size={18} />, title: 'Metadata & alt text', desc: 'Setiap aset punya alt, folder, dan pemilik.', state: 'Siap' },
        ].map((d) => (
          <Card key={d.title} className="dependency-card">
            <span className="dependency-icon">{d.icon}</span>
            <h3>{d.title}</h3>
            <p>{d.desc}</p>
            <Badge tone={d.state === 'Siap' ? 'success' : 'warning'}>{d.state}</Badge>
          </Card>
        ))}
      </div>

      <Card className="mt-16">
        <EmptyState
          icon={<Lock size={22} />}
          title="Belum ada media"
          desc="Tidak ada data contoh yang ditampilkan. Setelah storage aktif, aset pertama bisa diunggah dan diberi alt text."
          action={<Link to="/admin/integrations" className="btn btn-ghost">Lihat status integrasi</Link>}
        />
      </Card>
    </MarketingPage>
  );
}

const channelTone: Record<string, string> = {
  Instagram: 'brand',
  LinkedIn: 'info',
  X: 'neutral',
  YouTube: 'danger',
  Newsletter: 'violet',
};

const dateKey = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
};

export function SocialPlannerPage() {
  const { db, schedulePost } = useStore();
  const [month, setMonth] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [date, setDate] = useState('');
  const selected = db.social.find((s) => s.id === selectedId) ?? null;

  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const offset = (first.getDay() + 6) % 7;
  const cells = Array.from({ length: 42 }, (_, i) => {
    const d = new Date(month.getFullYear(), month.getMonth(), 1 - offset + i);
    return d;
  });
  const monthNames = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
  const approved = db.social.filter((s) => s.status === 'Approved');

  const openPost = (post: SocialPost) => {
    setSelectedId(post.id);
    setDate(post.date.slice(0, 10));
  };

  return (
    <MarketingPage
      title="Social Planner"
      desc="Kalender bulanan per kanal. Hanya konten approved yang bisa dijadwalkan."
      actions={
        <div className="calendar-nav">
          <button type="button" className="icon-btn" aria-label="Bulan sebelumnya" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}>
            <ChevronLeft size={16} />
          </button>
          <strong>{monthNames[month.getMonth()]} {month.getFullYear()}</strong>
          <button type="button" className="icon-btn" aria-label="Bulan berikutnya" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}>
            <ChevronRight size={16} />
          </button>
        </div>
      }
    >
      <div className="planner-layout">
        <Card className="planner-calendar" bodyClass="no-pad">
          <div className="calendar-grid calendar-head">
            {['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'].map((d) => <div key={d}>{d}</div>)}
            {cells.map((d) => {
              const posts = db.social.filter((s) => dateKey(s.date) === dateKey(d.toISOString()));
              const isToday = d.toDateString() === new Date().toDateString();
              const inMonth = d.getMonth() === month.getMonth();
              return (
                <div key={d.toISOString()} className={cx('calendar-cell', !inMonth && 'is-outside', isToday && 'is-today')}>
                  <span className="calendar-day">{d.getDate()}</span>
                  <div className="calendar-posts">
                    {posts.slice(0, 2).map((p) => (
                      <button
                        type="button"
                        key={p.id}
                        className={cx('post-chip', `chip-${channelTone[p.channel]}`)}
                        onClick={() => openPost(p)}
                        title={`${p.title} · ${p.channel} · ${p.status}`}
                      >
                        <span className="post-dot" />
                        <span>{p.title}</span>
                      </button>
                    ))}
                    {posts.length > 2 && <span className="calendar-more">+{posts.length - 2} lagi</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        <aside className="planner-side">
          <Card title="Siap dijadwalkan" sub="Hanya konten approved yang tampil">
            <div className="approved-list">
              {approved.map((p) => (
                <button type="button" className="approved-item" key={p.id} onClick={() => openPost(p)}>
                  <Badge tone={(channelTone[p.channel] as 'brand') ?? 'neutral'}>{p.channel}</Badge>
                  <span className="approved-title">{p.title}</span>
                  <CalendarPlus size={14} />
                </button>
              ))}
              {approved.length === 0 && <p className="muted-text small">Tidak ada konten approved.</p>}
            </div>
            <div className="notice-inline"><ShieldCheck size={14} /> Konten belum approved tidak bisa dijadwalkan.</div>
          </Card>
          <Card title="Kanal" sub="Hanya kanal terhubung yang tampil">
            <ul className="channel-list">
              {['Instagram', 'LinkedIn', 'X'].map((c) => (
                <li key={c}>
                  <span className={`channel-mark chip-${channelTone[c]}`}>{c.slice(0, 2)}</span>
                  <div><strong>{c}</strong><span>Terhubung</span></div>
                  <Badge tone="success">Aktif</Badge>
                </li>
              ))}
              <li>
                <span className="channel-mark chip-neutral">NE</span>
                <div><strong>Newsletter</strong><span>Provider email</span></div>
                <Badge tone="warning">Needs setup</Badge>
              </li>
            </ul>
          </Card>
        </aside>
      </div>

      <Drawer
        open={!!selected}
        onClose={() => setSelectedId(null)}
        title={selected?.title ?? ''}
        sub={selected ? `${selected.channel} · ${selected.status}` : undefined}
        footer={
          selected ? (
            <>
              <button type="button" className="btn btn-ghost" onClick={() => setSelectedId(null)}>Tutup</button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={selected.status === 'Published'}
                onClick={() => {
                  schedulePost(selected.id, new Date(`${date}T10:00:00`).toISOString());
                  setSelectedId(null);
                }}
              >
                <CalendarPlus size={14} /> {selected.status === 'Published' ? 'Sudah terbit' : 'Jadwalkan'}
              </button>
            </>
          ) : undefined
        }
      >
        {selected && (
          <div className="detail-stack">
            <div className="detail-grid">
              <div><span className="detail-label">Kanal</span><Badge tone={(channelTone[selected.channel] as 'brand') ?? 'neutral'}>{selected.channel}</Badge></div>
              <div><span className="detail-label">Status</span><AutoBadge value={selected.status} /></div>
              <div><span className="detail-label">Tanggal</span><strong>{fmtDate(selected.date, true)}</strong></div>
              <div><span className="detail-label">Artikel</span><strong>{db.articles.find((a) => a.id === selected.articleId)?.title ?? '—'}</strong></div>
            </div>

            <div className="detail-block">
              <div className="detail-block-head">
                <Sparkles size={14} /> Live Pratinjau Tampilan Feed ({selected.channel})
              </div>
              <SocialPostPreview
                channel={selected.channel}
                title={selected.title}
                caption={selected.caption}
                hashtags={selected.hashtags}
                slides={selected.slides}
                author={selected.author}
              />
            </div>
            <Field label="Jadwal baru" hint="Mengubah jadwal tidak menerbitkan konten.">
              <input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} disabled={selected.status === 'Published'} />
            </Field>
            {selected.status === 'Published' ? (
              <div className="notice-inline"><Check size={14} /> Konten sudah terbit; jadwal terkunci.</div>
            ) : (
              <div className="notice-inline"><ShieldCheck size={14} /> Guard: hanya konten approved yang bisa dijadwalkan.</div>
            )}
          </div>
        )}
      </Drawer>
    </MarketingPage>
  );
}

export function ContentLibraryPage() {
  const { db } = useStore();
  const [q, setQ] = useState('');
  const [type, setType] = useState('all');

  const items = useMemo(() => {
    const list: Array<{ id: string; title: string; type: string; status: string; updated: string; to: string; meta: string }> = [
      ...db.articles.map((a) => ({
        id: a.id, title: a.title, type: 'Artikel', status: articleStatusLabel[a.status], updated: a.date, to: '/marketing/articles', meta: a.category,
      })),
      ...db.pages.map((p) => ({
        id: p.id, title: p.title, type: 'Halaman', status: p.status, updated: p.updated, to: '/marketing/pages', meta: `/${p.slug}`,
      })),
      ...db.social.map((s) => ({
        id: s.id, title: s.title, type: 'Sosial', status: s.status, updated: s.date, to: '/marketing/social', meta: s.channel,
      })),
    ];
    return list
      .filter((i) => (type === 'all' || i.type === type) && `${i.title} ${i.type} ${i.meta}`.toLowerCase().includes(q.toLowerCase()))
      .sort((a, b) => new Date(b.updated).getTime() - new Date(a.updated).getTime());
  }, [db, q, type]);

  return (
    <MarketingPage title="Content Library" desc="Satu daftar lintas tipe untuk artikel, halaman, dan jadwal sosial.">
      <div className="table-toolbar card-toolbar">
        <SearchField value={q} onChange={setQ} placeholder="Cari konten…" />
        <div className="toolbar-filters">
          <SelectBox
            label="Tipe"
            value={type}
            onChange={setType}
            options={[
              { value: 'all', label: 'Semua tipe' },
              { value: 'Artikel', label: 'Artikel' },
              { value: 'Halaman', label: 'Halaman' },
              { value: 'Sosial', label: 'Sosial' },
            ]}
          />
        </div>
      </div>
      <Card bodyClass="no-pad">
        <div className="table-wrap">
          <table className="pd-table">
            <thead>
              <tr>
                <th scope="col">Konten</th>
                <th scope="col">Tipe</th>
                <th scope="col">Status</th>
                <th scope="col">Diperbarui</th>
                <th scope="col" />
              </tr>
            </thead>
            <tbody>
              {items.map((i) => (
                <tr key={`${i.type}-${i.id}`} className="is-clickable">
                  <td>
                    <div className="cell-main">
                      <strong>{i.title}</strong>
                      <span className="cell-sub">{i.meta}</span>
                    </div>
                  </td>
                  <td><Badge tone="neutral">{i.type}</Badge></td>
                  <td><AutoBadge value={i.status} /></td>
                  <td>{fmtDate(i.updated)}</td>
                  <td className="row-end"><Link to={i.to} className="icon-btn icon-btn-sm" aria-label="Buka konten"><ArrowRight size={14} /></Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {items.length === 0 && <EmptyState icon={<FileText size={20} />} title="Tidak ada konten" desc="Ubah filter atau buat artikel baru." />}
      </Card>
    </MarketingPage>
  );
}

const commentTabs = ['Menunggu', 'Disetujui', 'Spam', 'Semua'];

export function CommentsPage() {
  const { db, moderateComment, deleteComment } = useStore();
  const [tab, setTab] = useState('Menunggu');
  const rows = db.comments.filter((c) => tab === 'Semua' || c.status === tab);

  return (
    <MarketingPage title="Comments" desc="Moderasi komentar. Komentar spam tidak pernah dirender di situs.">
      <div className="figs figs-4">
        <Fig label="Menunggu" value={db.comments.filter((c) => c.status === 'Menunggu').length} hint="Perlu keputusan" icon={<MessageSquare size={16} />} />
        <Fig label="Disetujui" value={db.comments.filter((c) => c.status === 'Disetujui').length} hint="Tampil di situs" icon={<Check size={16} />} />
        <Fig label="Spam" value={db.comments.filter((c) => c.status === 'Spam').length} hint="Tidak dirender" icon={<XCircle size={16} />} />
        <Fig label="Total" value={db.comments.length} hint="Semua komentar" icon={<FileText size={16} />} />
      </div>

      <div className="comment-layout">
        <Card bodyClass="no-pad">
          <div className="card-tabs">
            <Tabs
              items={commentTabs.map((t) => ({ key: t, label: t, count: t === 'Semua' ? db.comments.length : db.comments.filter((c) => c.status === t).length }))}
              value={tab}
              onChange={setTab}
              label="Status komentar"
            />
          </div>
          <div className="comment-list">
            {rows.map((c) => (
              <article className={cx('comment-item', c.status === 'Spam' && 'is-spam')} key={c.id}>
                <Avatar name={c.author} size={34} />
                <div className="comment-main">
                  <div className="comment-head">
                    <strong>{c.author}</strong>
                    <span>{c.email}</span>
                    <span className="comment-time">{relTime(c.at)}</span>
                  </div>
                  <p>{c.body}</p>
                  <div className="comment-meta">
                    <span>pada</span>
                    <span className="comment-article">{c.article}</span>
                    <AutoBadge value={c.status} />
                  </div>
                  <div className="comment-actions">
                    {c.status !== 'Disetujui' && (
                      <button type="button" className="btn btn-outline btn-xs" onClick={() => moderateComment(c.id, 'Disetujui')}>
                        <Check size={12} /> Setujui
                      </button>
                    )}
                    {c.status !== 'Spam' && (
                      <button type="button" className="btn btn-outline btn-xs" onClick={() => moderateComment(c.id, 'Spam')}>
                        <XCircle size={12} /> Spam
                      </button>
                    )}
                    <button type="button" className="btn btn-ghost btn-xs btn-danger-text" onClick={() => deleteComment(c.id)}>
                      <Trash2 size={12} /> Hapus
                    </button>
                  </div>
                </div>
              </article>
            ))}
            {rows.length === 0 && <EmptyState compact icon={<MessageSquare size={20} />} title="Tidak ada komentar" desc="Tidak ada komentar pada status ini." />}
          </div>
        </Card>

        <aside>
          <Card title="Aturan moderasi" sub="Guard yang selalu aktif">
            <ul className="rule-list">
              <li><Check size={14} /> Komentar spam tidak dirender.</li>
              <li><Check size={14} /> Moderasi tercatat di audit.</li>
              <li><Check size={14} /> Balasan tidak dikirim otomatis.</li>
              <li><Lock size={14} /> Aksi massal belum tersedia.</li>
            </ul>
            <div className="notice-inline"><ShieldCheck size={14} /> Anti-spam awal menggunakan moderasi manual sampai Turnstile diputuskan.</div>
          </Card>
        </aside>
      </div>
    </MarketingPage>
  );
}

export function MenusPage() {
  const { db, addMenuItem, removeMenuItem, moveMenuItem, toast } = useStore();
  const [forms, setForms] = useState<Record<string, { label: string; href: string }>>({});

  const ensure = (id: string) => forms[id] ?? { label: '', href: '' };

  return (
    <MarketingPage title="Menus" desc="Menu header dan footer, maksimal dua level. Urutan tersimpan dan masuk audit.">
      <div className="menu-layout">
        <Card title="Pratinjau header" sub="Tampilan navigasi publik" className="span-12">
          <div className="site-preview-nav">
            <span className="site-logo">playdesign</span>
            <nav>
              {db.menus.find((m) => m.location === 'Header')?.items.map((i) => (
                <span key={i.id} className="site-nav-item">
                  {i.label}
                  {i.children && <ChevronRight size={11} className="site-nav-caret" />}
                </span>
              ))}
            </nav>
            <span className="site-cta">Mulai proyek</span>
          </div>
        </Card>

        {db.menus.map((menu) => {
          const form = ensure(menu.id);
          return (
            <Card key={menu.id} className="span-6" title={`Menu ${menu.location.toLowerCase()}`} sub={`${menu.items.length} item · maksimal 2 level`}>
              <div className="menu-items">
                {menu.items.map((item, index) => (
                  <div className="menu-item-row" key={item.id}>
                    <span className="menu-grip">⋮⋮</span>
                    <div className="menu-item-main">
                      <strong>{item.label}</strong>
                      <span>{item.href}{item.children ? ` · ${item.children.length} submenu` : ''}</span>
                      {item.children && (
                        <div className="submenu-list">
                          {item.children.map((child) => (
                            <span key={child.id} className="submenu-item">{child.label}</span>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="menu-item-actions">
                      <button type="button" className="icon-btn icon-btn-sm" onClick={() => moveMenuItem(menu.id, item.id, -1)} disabled={index === 0} aria-label="Naikkan">
                        <ArrowUp size={13} />
                      </button>
                      <button type="button" className="icon-btn icon-btn-sm" onClick={() => moveMenuItem(menu.id, item.id, 1)} disabled={index === menu.items.length - 1} aria-label="Turunkan">
                        <ArrowDown size={13} />
                      </button>
                      <button type="button" className="icon-btn icon-btn-sm" onClick={() => removeMenuItem(menu.id, item.id)} aria-label="Hapus">
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              <form
                className="menu-add-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!form.label.trim() || !form.href.trim()) {
                    toast('Label dan URL wajib diisi.', 'danger');
                    return;
                  }
                  addMenuItem(menu.id, form.label.trim(), form.href.trim());
                  setForms({ ...forms, [menu.id]: { label: '', href: '' } });
                }}
              >
                <input className="input" placeholder="Label" value={form.label} onChange={(e) => setForms({ ...forms, [menu.id]: { ...form, label: e.target.value } })} />
                <input className="input" placeholder="/halaman" value={form.href} onChange={(e) => setForms({ ...forms, [menu.id]: { ...form, href: e.target.value } })} />
                <button type="submit" className="btn btn-primary btn-sm"><Plus size={13} /> Tambah</button>
              </form>
              <div className="notice-inline"><Lock size={13} /> Submenu level tiga tidak diizinkan.</div>
            </Card>
          );
        })}
      </div>
    </MarketingPage>
  );
}

export function NewslettersPage() {
  return (
    <MarketingPage
      title="Newsletters"
      desc="Kampanye untuk penerima terkonfirmasi. Pengiriman diblokir sampai provider email tersedia."
      actions={<button type="button" className="btn btn-primary" disabled><Send size={15} /> Kampanye baru</button>}
    >
      <div className="setup-banner">
        <div className="setup-icon"><Mail size={22} /></div>
        <div className="setup-copy">
          <Badge tone="warning" dot>Needs setup</Badge>
          <h2>Newsletter menunggu provider email</h2>
          <p>Kampanye tidak bisa disusun atau dikirim sebelum provider dan domain terverifikasi. Penerima berstatus unsubscribed tidak akan pernah dikirimi.</p>
          <div className="setup-actions">
            <Link to="/admin/integrations" className="btn btn-primary">Buka integrasi <ArrowRight size={14} /></Link>
            <button type="button" className="btn btn-ghost" disabled><Send size={14} /> Kirim dinonaktifkan</button>
          </div>
        </div>
      </div>

      <div className="grid-main mt-16">
        <Card className="span-7" title="Persyaratan aktivasi" sub="Checklist sebelum modul bisa dipakai">
          <div className="checklist">
            {[
              { label: 'Provider email transaksional', done: false, note: 'Resend belum dikonfigurasi' },
              { label: 'Domain pengirim terverifikasi', done: false, note: 'SPF & DKIM belum dipasang' },
              { label: 'Daftar penerima dengan consent', done: true, note: 'Kebijakan opt-in disiapkan' },
              { label: 'Template kampanye', done: true, note: 'Draft template tersedia di Content Library' },
              { label: 'Approval packet untuk setiap kirim', done: true, note: 'Guard server aktif' },
            ].map((c) => (
              <div className="checklist-row" key={c.label}>
                <span className={cx('checklist-box', c.done && 'is-done')}>{c.done ? <Check size={12} /> : null}</span>
                <div><strong>{c.label}</strong><span>{c.note}</span></div>
              </div>
            ))}
          </div>
        </Card>
        <Card className="span-5" title="Guard pengiriman" sub="Tidak ada jalur ilegal">
          <ul className="rule-list">
            <li><ShieldCheck size={14} /> Kirim hanya setelah approval Owner.</li>
            <li><ShieldCheck size={14} /> Penerima unsubscribed dikecualikan permanen.</li>
            <li><Lock size={14} /> Provider belum ada → kirim diblokir di server.</li>
            <li><CircleAlert size={14} /> Approval tidak membuka jalur kirim.</li>
          </ul>
          <div className="notice-inline"><Mail size={14} /> Packet newsletter bisa disetujui, tetapi tetap tidak terkirim.</div>
        </Card>
      </div>
    </MarketingPage>
  );
}
