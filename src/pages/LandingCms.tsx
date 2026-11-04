import { useState } from 'react';
import {
  Globe,
  Sparkles,
  Layout,
  Layers,
  Eye,
  Save,
  Plus,
  Trash2,
  ExternalLink,
  Check,
  Building,
  Phone,
  Mail,
  MapPin,
  ArrowRight,
  ShieldCheck,
} from 'lucide-react';
import { useStore } from '../store/store';
import {
  PageHead,
  Card,
  Badge,
  Tabs,
  Field,
  Modal,
} from '../components/ui';
import { WhatsAppIcon } from '../components/icons';
import type { LandingPageConfig } from '../data/types';

export function LandingCmsPage() {
  const { db, updateLandingConfig, toast } = useStore();

  const initialConfig = db.landingConfig ?? {
    hero: {
      badge: 'Brand & Digital Studio · Bandung',
      headline: 'Membangun Identitas Brand & Pengalaman Digital yang Berdampak',
      subheadline: 'Kami membantu brand ambisius mendesain produk, identitas visual, dan sistem digital yang elegan serta terukur.',
      ctaPrimary: 'Mulai Proyek',
      ctaPrimaryLink: '#kontak',
      ctaSecondary: 'Lihat Portofolio',
      ctaSecondaryLink: '#portofolio',
    },
    services: [
      { id: 'srv-1', title: 'Brand Identity & Strategy', description: 'Pondasi identitas visual, nada bicara, dan sistem desain yang kohesif.', icon: 'Sparkles', badge: 'Core' },
      { id: 'srv-2', title: 'Digital Product & Web Design', description: 'Desain website & UI/UX aplikasi dengan presisi editorial dan performa tinggi.', icon: 'Layout', badge: 'Populer' },
    ],
    caseStudies: [
      { id: 'cs-1', title: 'Sagara Creative Rebrand', client: 'PT Sagara Cipta', category: 'Branding & Design System', summary: 'Restrukturisasi token visual dan panduan multi-produk.', metrics: '+240% brand awareness' },
    ],
    testimonials: [
      { id: 'tst-1', quote: 'Playdesign berhasil menerjemahkan visi abstrak kami menjadi sistem desain yang sangat rapi dan siap skala.', author: 'Rian Pratama', role: 'Founder & CEO', company: 'Sagara Creative' },
    ],
    contact: {
      whatsapp: '6281234567890',
      email: 'hello@playdesign.studio',
      address: 'Jl. Riau No. 45, Citarum, Bandung, Jawa Barat 40115',
      defaultMessage: 'Halo Playdesign Studio, saya tertarik untuk konsultasi proyek branding/web untuk bisnis saya.',
    },
  };

  const [config, setConfig] = useState<LandingPageConfig>(initialConfig);
  const [tab, setTab] = useState<'hero' | 'services' | 'portfolio' | 'testimonials' | 'contact'>('hero');
  const [showPreviewModal, setShowPreviewModal] = useState(false);

  const handleSave = () => {
    updateLandingConfig(config);
    toast('Semua perubahan konten landing page berhasil disimpan dan siap dipublikasikan.', 'success');
  };

  return (
    <>
      <PageHead
        kicker="Company Web · Admin CMS"
        title="Admin Panel Landing Page"
        desc="Kelola konten, teks hero, portofolio unggulan, dan integrasi formulir kontak website resmi perusahaan."
        actions={
          <div className="flex gap-8">
            <button
              type="button"
              className="btn btn-outline"
              onClick={() => setShowPreviewModal(true)}
            >
              <Eye size={14} /> Live Preview Web
            </button>
            <button type="button" className="btn btn-primary" onClick={handleSave}>
              <Save size={14} /> Simpan Perubahan
            </button>
          </div>
        }
      />

      <div className="toolbar toolbar-wrap mt-16">
        <Tabs
          items={[
            { key: 'hero', label: '1. Hero Banner' },
            { key: 'services', label: `2. Layanan (${config.services.length})` },
            { key: 'portfolio', label: `3. Portofolio (${config.caseStudies.length})` },
            { key: 'testimonials', label: `4. Testimoni (${config.testimonials.length})` },
            { key: 'contact', label: '5. Kontak & WhatsApp' },
          ]}
          value={tab}
          onChange={(k) => setTab(k as typeof tab)}
        />
      </div>

      <div className="grid-2-1 gap-20 mt-16">
        {/* LEFT COLUMN: SECTION EDITORS */}
        <div>
          {/* TAB 1: HERO */}
          {tab === 'hero' && (
            <Card title="Pengaturan Hero Section" sub="Bagian paling atas yang pertama kali dilihat calon klien">
              <div className="space-y-16">
                <div>
                  <label className="field-label">Kicker / Badge Kecil</label>
                  <input
                    type="text"
                    className="input"
                    value={config.hero.badge}
                    onChange={(e) =>
                      setConfig({ ...config, hero: { ...config.hero, badge: e.target.value } })
                    }
                  />
                </div>

                <div>
                  <label className="field-label">Headline Utama (Judul Besar)</label>
                  <textarea
                    className="input"
                    rows={2}
                    value={config.hero.headline}
                    onChange={(e) =>
                      setConfig({ ...config, hero: { ...config.hero, headline: e.target.value } })
                    }
                  />
                </div>

                <div>
                  <label className="field-label">Sub-Headline / Penjelasan Singkat</label>
                  <textarea
                    className="input"
                    rows={3}
                    value={config.hero.subheadline}
                    onChange={(e) =>
                      setConfig({ ...config, hero: { ...config.hero, subheadline: e.target.value } })
                    }
                  />
                </div>

                <div className="grid-2 gap-12">
                  <div>
                    <label className="field-label">Teks Tombol Utama (CTA 1)</label>
                    <input
                      type="text"
                      className="input"
                      value={config.hero.ctaPrimary}
                      onChange={(e) =>
                        setConfig({ ...config, hero: { ...config.hero, ctaPrimary: e.target.value } })
                      }
                    />
                  </div>
                  <div>
                    <label className="field-label">Link Tombol Utama</label>
                    <input
                      type="text"
                      className="input"
                      value={config.hero.ctaPrimaryLink}
                      onChange={(e) =>
                        setConfig({
                          ...config,
                          hero: { ...config.hero, ctaPrimaryLink: e.target.value },
                        })
                      }
                    />
                  </div>
                </div>

                <div className="grid-2 gap-12">
                  <div>
                    <label className="field-label">Teks Tombol Kedua (CTA 2)</label>
                    <input
                      type="text"
                      className="input"
                      value={config.hero.ctaSecondary}
                      onChange={(e) =>
                        setConfig({
                          ...config,
                          hero: { ...config.hero, ctaSecondary: e.target.value },
                        })
                      }
                    />
                  </div>
                  <div>
                    <label className="field-label">Link Tombol Kedua</label>
                    <input
                      type="text"
                      className="input"
                      value={config.hero.ctaSecondaryLink}
                      onChange={(e) =>
                        setConfig({
                          ...config,
                          hero: { ...config.hero, ctaSecondaryLink: e.target.value },
                        })
                      }
                    />
                  </div>
                </div>
              </div>
            </Card>
          )}

          {/* TAB 2: SERVICES */}
          {tab === 'services' && (
            <Card
              title="Daftar Layanan Studio"
              sub="Kelola kartu paket solusi yang ditawarkan kepada calon klien"
              action={
                <button
                  type="button"
                  className="btn btn-outline btn-xs"
                  onClick={() => {
                    const newSrv = {
                      id: `srv-${Date.now()}`,
                      title: 'Layanan Baru',
                      description: 'Deskripsi lengkap layanan studio.',
                      icon: 'Sparkles',
                      badge: 'New',
                    };
                    setConfig({ ...config, services: [...config.services, newSrv] });
                  }}
                >
                  <Plus size={12} /> Tambah Layanan
                </button>
              }
            >
              <div className="space-y-16">
                {config.services.map((srv, idx) => (
                  <div key={srv.id} className="border p-14 rounded-8 bg-surface-2">
                    <div className="flex-between mb-8">
                      <strong>Layanan #{idx + 1}</strong>
                      <button
                        type="button"
                        className="btn btn-ghost btn-xs text-danger"
                        onClick={() => {
                          setConfig({
                            ...config,
                            services: config.services.filter((s) => s.id !== srv.id),
                          });
                        }}
                      >
                        <Trash2 size={12} /> Hapus
                      </button>
                    </div>
                    <div className="grid-2 gap-12 mb-8">
                      <div>
                        <label className="field-label">Nama Layanan</label>
                        <input
                          type="text"
                          className="input"
                          value={srv.title}
                          onChange={(e) => {
                            const updated = config.services.map((s) =>
                              s.id === srv.id ? { ...s, title: e.target.value } : s
                            );
                            setConfig({ ...config, services: updated });
                          }}
                        />
                      </div>
                      <div>
                        <label className="field-label">Badge Label (Opsional)</label>
                        <input
                          type="text"
                          className="input"
                          value={srv.badge ?? ''}
                          placeholder="Misal: Populer, Core"
                          onChange={(e) => {
                            const updated = config.services.map((s) =>
                              s.id === srv.id ? { ...s, badge: e.target.value } : s
                            );
                            setConfig({ ...config, services: updated });
                          }}
                        />
                      </div>
                    </div>
                    <div>
                      <label className="field-label">Deskripsi Layanan</label>
                      <textarea
                        className="input"
                        rows={2}
                        value={srv.description}
                        onChange={(e) => {
                          const updated = config.services.map((s) =>
                            s.id === srv.id ? { ...s, description: e.target.value } : s
                          );
                          setConfig({ ...config, services: updated });
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* TAB 3: PORTFOLIO */}
          {tab === 'portfolio' && (
            <Card
              title="Portofolio & Studi Kasus Unggulan"
              sub="Tampilkan proyek terbaik untuk meyakinkan calon klien"
              action={
                <button
                  type="button"
                  className="btn btn-outline btn-xs"
                  onClick={() => {
                    const newCs = {
                      id: `cs-${Date.now()}`,
                      title: 'Proyek Desain Baru',
                      client: 'Nama Klien',
                      category: 'Branding & Web',
                      summary: 'Ringkasan pengerjaan proyek dan dampak bisnis yang dicapai.',
                      metrics: '+150% pertumbuhan',
                    };
                    setConfig({ ...config, caseStudies: [...config.caseStudies, newCs] });
                  }}
                >
                  <Plus size={12} /> Tambah Proyek
                </button>
              }
            >
              <div className="space-y-16">
                {config.caseStudies.map((cs, idx) => (
                  <div key={cs.id} className="border p-14 rounded-8 bg-surface-2">
                    <div className="flex-between mb-8">
                      <strong>Proyek #{idx + 1}</strong>
                      <button
                        type="button"
                        className="btn btn-ghost btn-xs text-danger"
                        onClick={() => {
                          setConfig({
                            ...config,
                            caseStudies: config.caseStudies.filter((c) => c.id !== cs.id),
                          });
                        }}
                      >
                        <Trash2 size={12} /> Hapus
                      </button>
                    </div>
                    <div className="grid-2 gap-12 mb-8">
                      <div>
                        <label className="field-label">Judul Proyek</label>
                        <input
                          type="text"
                          className="input"
                          value={cs.title}
                          onChange={(e) => {
                            const updated = config.caseStudies.map((c) =>
                              c.id === cs.id ? { ...c, title: e.target.value } : c
                            );
                            setConfig({ ...config, caseStudies: updated });
                          }}
                        />
                      </div>
                      <div>
                        <label className="field-label">Nama Klien</label>
                        <input
                          type="text"
                          className="input"
                          value={cs.client}
                          onChange={(e) => {
                            const updated = config.caseStudies.map((c) =>
                              c.id === cs.id ? { ...c, client: e.target.value } : c
                            );
                            setConfig({ ...config, caseStudies: updated });
                          }}
                        />
                      </div>
                    </div>
                    <div className="grid-2 gap-12 mb-8">
                      <div>
                        <label className="field-label">Kategori</label>
                        <input
                          type="text"
                          className="input"
                          value={cs.category}
                          onChange={(e) => {
                            const updated = config.caseStudies.map((c) =>
                              c.id === cs.id ? { ...c, category: e.target.value } : c
                            );
                            setConfig({ ...config, caseStudies: updated });
                          }}
                        />
                      </div>
                      <div>
                        <label className="field-label">Hasil / Metrics Berdampak</label>
                        <input
                          type="text"
                          className="input"
                          value={cs.metrics ?? ''}
                          placeholder="Misal: +240% brand awareness"
                          onChange={(e) => {
                            const updated = config.caseStudies.map((c) =>
                              c.id === cs.id ? { ...c, metrics: e.target.value } : c
                            );
                            setConfig({ ...config, caseStudies: updated });
                          }}
                        />
                      </div>
                    </div>
                    <div>
                      <label className="field-label">Ringkasan Studi Kasus</label>
                      <textarea
                        className="input"
                        rows={2}
                        value={cs.summary}
                        onChange={(e) => {
                          const updated = config.caseStudies.map((c) =>
                            c.id === cs.id ? { ...c, summary: e.target.value } : c
                          );
                          setConfig({ ...config, caseStudies: updated });
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* TAB 4: TESTIMONIALS */}
          {tab === 'testimonials' && (
            <Card
              title="Testimoni Klien"
              sub="Bukti sosial kepuasan klien studio"
              action={
                <button
                  type="button"
                  className="btn btn-outline btn-xs"
                  onClick={() => {
                    const newTst = {
                      id: `tst-${Date.now()}`,
                      quote: 'Pengerjaan sangat profesional dan tepat waktu.',
                      author: 'Nama Klien',
                      role: 'Managing Director',
                      company: 'PT Maju Bersama',
                    };
                    setConfig({ ...config, testimonials: [...config.testimonials, newTst] });
                  }}
                >
                  <Plus size={12} /> Tambah Testimoni
                </button>
              }
            >
              <div className="space-y-16">
                {config.testimonials.map((tst, idx) => (
                  <div key={tst.id} className="border p-14 rounded-8 bg-surface-2">
                    <div className="flex-between mb-8">
                      <strong>Testimoni #{idx + 1}</strong>
                      <button
                        type="button"
                        className="btn btn-ghost btn-xs text-danger"
                        onClick={() => {
                          setConfig({
                            ...config,
                            testimonials: config.testimonials.filter((t) => t.id !== tst.id),
                          });
                        }}
                      >
                        <Trash2 size={12} /> Hapus
                      </button>
                    </div>
                    <div className="grid-3 gap-12 mb-8">
                      <div>
                        <label className="field-label">Nama Pemberi Testimoni</label>
                        <input
                          type="text"
                          className="input"
                          value={tst.author}
                          onChange={(e) => {
                            const updated = config.testimonials.map((t) =>
                              t.id === tst.id ? { ...t, author: e.target.value } : t
                            );
                            setConfig({ ...config, testimonials: updated });
                          }}
                        />
                      </div>
                      <div>
                        <label className="field-label">Jabatan / Role</label>
                        <input
                          type="text"
                          className="input"
                          value={tst.role}
                          onChange={(e) => {
                            const updated = config.testimonials.map((t) =>
                              t.id === tst.id ? { ...t, role: e.target.value } : t
                            );
                            setConfig({ ...config, testimonials: updated });
                          }}
                        />
                      </div>
                      <div>
                        <label className="field-label">Nama Perusahaan</label>
                        <input
                          type="text"
                          className="input"
                          value={tst.company}
                          onChange={(e) => {
                            const updated = config.testimonials.map((t) =>
                              t.id === tst.id ? { ...t, company: e.target.value } : t
                            );
                            setConfig({ ...config, testimonials: updated });
                          }}
                        />
                      </div>
                    </div>
                    <div>
                      <label className="field-label">Kutipan Ulasan (Quote)</label>
                      <textarea
                        className="input"
                        rows={2}
                        value={tst.quote}
                        onChange={(e) => {
                          const updated = config.testimonials.map((t) =>
                            t.id === tst.id ? { ...t, quote: e.target.value } : t
                          );
                          setConfig({ ...config, testimonials: updated });
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* TAB 5: CONTACT */}
          {tab === 'contact' && (
            <Card title="Kontak Resmi & CTA WhatsApp" sub="Informasi yang terhubung ke tombol chat dan form landing page">
              <div className="space-y-16">
                <div className="grid-2 gap-12">
                  <div>
                    <label className="field-label">Nomor WhatsApp Resmi (Awali 62)</label>
                    <input
                      type="text"
                      className="input"
                      value={config.contact.whatsapp}
                      onChange={(e) =>
                        setConfig({
                          ...config,
                          contact: { ...config.contact, whatsapp: e.target.value },
                        })
                      }
                    />
                  </div>
                  <div>
                    <label className="field-label">Email Kantor</label>
                    <input
                      type="email"
                      className="input"
                      value={config.contact.email}
                      onChange={(e) =>
                        setConfig({
                          ...config,
                          contact: { ...config.contact, email: e.target.value },
                        })
                      }
                    />
                  </div>
                </div>

                <div>
                  <label className="field-label">Alamat Studio / Kantor Fisik</label>
                  <input
                    type="text"
                    className="input"
                    value={config.contact.address}
                    onChange={(e) =>
                      setConfig({
                        ...config,
                        contact: { ...config.contact, address: e.target.value },
                      })
                    }
                  />
                </div>

                <div>
                  <label className="field-label">Pesan Pembuka Default Saat Calon Klien Klik Tombol WA</label>
                  <textarea
                    className="input"
                    rows={3}
                    value={config.contact.defaultMessage}
                    onChange={(e) =>
                      setConfig({
                        ...config,
                        contact: { ...config.contact, defaultMessage: e.target.value },
                      })
                    }
                  />
                </div>
              </div>
            </Card>
          )}
        </div>

        {/* RIGHT COLUMN: LIVE MINI PREVIEW */}
        <div>
          <Card title="Live Mini Preview" sub="Pratinjau struktur tampilan website publik">
            <div className="web-mini-preview">
              {/* Navbar Mini */}
              <div className="mini-nav">
                <span className="mini-logo">Playdesign</span>
                <div className="mini-links">
                  <span>Layanan</span>
                  <span>Portofolio</span>
                  <span>Kontak</span>
                </div>
              </div>

              {/* Hero Mini */}
              <div className="mini-hero">
                <span className="mini-badge">{config.hero.badge}</span>
                <h4 className="mini-headline">{config.hero.headline}</h4>
                <p className="mini-sub">{config.hero.subheadline}</p>
                <div className="mini-cta-row">
                  <span className="mini-btn primary">{config.hero.ctaPrimary}</span>
                  <span className="mini-btn secondary">{config.hero.ctaSecondary}</span>
                </div>
              </div>

              {/* Services Mini */}
              <div className="mini-section">
                <span className="mini-section-title">Layanan Kami</span>
                <div className="mini-services-grid">
                  {config.services.slice(0, 2).map((s) => (
                    <div key={s.id} className="mini-service-card">
                      <strong>{s.title}</strong>
                      <p>{s.description}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Case Studies Mini */}
              <div className="mini-section">
                <span className="mini-section-title">Studi Kasus Terbaru</span>
                {config.caseStudies.slice(0, 1).map((cs) => (
                  <div key={cs.id} className="mini-cs-card">
                    <span className="mini-cs-client">{cs.client}</span>
                    <strong>{cs.title}</strong>
                    {cs.metrics && <span className="mini-cs-metrics">{cs.metrics}</span>}
                  </div>
                ))}
              </div>

              {/* Contact Footer Mini */}
              <div className="mini-footer">
                <a
                  href={`https://wa.me/${config.contact.whatsapp}?text=${encodeURIComponent(
                    config.contact.defaultMessage
                  )}`}
                  target="_blank"
                  rel="noreferrer"
                  className="mini-wa-banner"
                >
                  <WhatsAppIcon size={13} /> Chat WhatsApp Studio
                </a>
                <span className="mini-address">{config.contact.address}</span>
              </div>
            </div>
          </Card>
        </div>
      </div>

      {/* FULL MODAL LIVE PREVIEW */}
      <Modal
        open={showPreviewModal}
        onClose={() => setShowPreviewModal(false)}
        title="Pratinjau Penuh Website Perusahaan"
        sub="Tampilan website Playdesign Studio sesuai konfigurasi CMS aktif"
        width={840}
      >
        <div className="p-16">
          <div className="border rounded-12 p-32 bg-surface text-center">
            <Badge tone="brand" className="mb-12">{config.hero.badge}</Badge>
            <h1 className="text-28 font-serif mb-12">{config.hero.headline}</h1>
            <p className="max-w-prose mx-auto text-muted mb-20">{config.hero.subheadline}</p>
            <div className="flex-center gap-12 mb-36">
              <button type="button" className="btn btn-primary">{config.hero.ctaPrimary}</button>
              <button type="button" className="btn btn-outline">{config.hero.ctaSecondary}</button>
            </div>

            <div className="grid-2 gap-16 text-left border-top pt-24 mb-24">
              {config.services.map((s) => (
                <div key={s.id} className="border p-16 rounded-8 bg-surface-2">
                  {s.badge && <Badge tone="neutral" className="mb-6">{s.badge}</Badge>}
                  <h3 className="font-semibold text-15 mb-4">{s.title}</h3>
                  <p className="text-muted text-13">{s.description}</p>
                </div>
              ))}
            </div>

            <div className="border-top pt-20 text-center">
              <span className="text-xs text-muted block mb-4">Hubungi Studio Kami</span>
              <strong className="text-15 block mb-8">{config.contact.address}</strong>
              <a
                href={`https://wa.me/${config.contact.whatsapp}?text=${encodeURIComponent(
                  config.contact.defaultMessage
                )}`}
                target="_blank"
                rel="noreferrer"
                className="btn btn-primary btn-sm inline-flex items-center gap-6"
              >
                <WhatsAppIcon size={14} /> WhatsApp: {config.contact.whatsapp}
              </a>
            </div>
          </div>
        </div>
      </Modal>
    </>
  );
}

