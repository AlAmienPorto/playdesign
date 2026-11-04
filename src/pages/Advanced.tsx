import { useMemo, useState } from 'react';
import {
  ArrowRight,
  Download,
  Layers,
  PackageOpen,
  Search,
  ShieldCheck,
  Sparkles,
  TriangleAlert,
} from 'lucide-react';
import { useStore } from '../store/store';
import {
  Badge,
  Card,
  Drawer,
  EmptyState,
  Fig,
  PageHead,
  Pager,
  SearchField,
  SelectBox,
  StatusPill,
  Tabs,
} from '../components/ui';
import { cx, downloadJSON } from '../lib/utils';
import type { Feature } from '../data/types';

const GROUP_TABS = [
  { key: 'all', label: 'Semua' },
  { key: 'Marketing & Content', label: 'Marketing & Content' },
  { key: 'Advanced Ecosystem', label: 'Advanced Ecosystem' },
  { key: 'Platform & Governance', label: 'Platform & Governance' },
];

const groupTone: Record<Feature['group'], 'info' | 'violet' | 'neutral'> = {
  'Marketing & Content': 'info',
  'Advanced Ecosystem': 'violet',
  'Platform & Governance': 'neutral',
};

const MODULE_LINK: Record<Feature['group'], { label: string; to: string }> = {
  'Marketing & Content': { label: 'Buka Marketing & Content', to: '/marketing' },
  'Advanced Ecosystem': { label: 'Buka Overview', to: '/overview' },
  'Platform & Governance': { label: 'Buka Administration', to: '/admin/settings' },
};

export function FeaturesPage() {
  const { db } = useStore();
  const [group, setGroup] = useState('all');
  const [status, setStatus] = useState('all');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [detail, setDetail] = useState<Feature | null>(null);
  const pageSize = 10;

  const features = db.features;
  const planned = features.filter((f) => f.status === 'Planned').length;
  const setup = features.filter((f) => f.status === 'Needs setup').length;
  const guarded = features.filter((f) => f.guard).length;

  const counts = useMemo(() => {
    const map: Record<string, number> = { all: features.length };
    features.forEach((f) => {
      map[f.group] = (map[f.group] ?? 0) + 1;
    });
    return map;
  }, [features]);

  const filtered = features
    .filter((f) => (group === 'all' ? true : f.group === group))
    .filter((f) => (status === 'all' ? true : f.status === status))
    .filter((f) => {
      const haystack = `${f.name} ${f.desc} ${f.dependency ?? ''} ${f.guard ?? ''}`.toLowerCase();
      return haystack.includes(query.toLowerCase());
    });

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, pageCount);
  const rows = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);
  const link = detail ? MODULE_LINK[detail.group] : null;

  return (
    <>
      <PageHead
        kicker="Operations · Live"
        title="Fitur Lanjutan"
        desc="Registry 30 fitur roadmap. Setiap fitur menyebut dependency dan guard sebelum dibangun."
        actions={
          <button
            type="button"
            className="btn btn-outline btn-sm"
            onClick={() => downloadJSON('playdesign-features.json', features)}
          >
            <Download size={14} /> Ekspor JSON
          </button>
        }
      />

      <div className="figs figs-4">
        <Fig label="Total fitur" value={features.length} hint="Registry berversi" icon={<Sparkles size={17} />} />
        <Fig label="Planned" value={planned} hint="Sudah dirancang" icon={<Layers size={17} />} />
        <Fig label="Needs setup" value={setup} hint="Menunggu dependency" icon={<PackageOpen size={17} />} />
        <Fig label="Punya guard" value={guarded} hint="Batas keras sebelum aktif" icon={<ShieldCheck size={17} />} />
      </div>

      <div className="toolbar toolbar-wrap mt-16">
        <Tabs
          items={GROUP_TABS.map((tab) => ({ ...tab, count: counts[tab.key] ?? 0 }))}
          value={group}
          onChange={(v) => {
            setGroup(v);
            setPage(1);
          }}
        />
        <div className="toolbar-actions">
          <SearchField
            value={query}
            onChange={(v) => {
              setQuery(v);
              setPage(1);
            }}
            placeholder="Cari fitur, dependency, atau guard…"
          />
          <SelectBox
            label="Filter status"
            value={status}
            onChange={(v) => {
              setStatus(v);
              setPage(1);
            }}
            options={[
              { value: 'all', label: 'Semua status' },
              { value: 'Planned', label: 'Planned' },
              { value: 'Needs setup', label: 'Needs setup' },
            ]}
          />
        </div>
      </div>

      <Card bodyClass="card-flush">
        {rows.length === 0 ? (
          <EmptyState
            icon={<Search size={22} />}
            title="Tidak ada fitur yang cocok"
            desc="Ubah grup, status, atau kata kunci pencarian."
          />
        ) : (
          <div className="table-wrap">
            <table className="pd-table feature-table">
              <thead>
                <tr>
                  <th scope="col">Fitur</th>
                  <th scope="col">Grup</th>
                  <th scope="col">Status</th>
                  <th scope="col">Dependency</th>
                  <th scope="col">Guard</th>
                  <th scope="col" />
                </tr>
              </thead>
              <tbody>
                {rows.map((feature) => (
                  <tr key={feature.id} className="is-clickable" onClick={() => setDetail(feature)}>
                    <td>
                      <div className="cell-main">{feature.name}</div>
                      <div className="cell-sub mono">{feature.id}</div>
                    </td>
                    <td>
                      <Badge tone={groupTone[feature.group]}>{feature.group}</Badge>
                    </td>
                    <td>
                      <StatusPill status={feature.status} />
                    </td>
                    <td className={cx('muted-small', !feature.dependency && 'is-empty')}>
                      {feature.dependency ?? '—'}
                    </td>
                    <td>
                      {feature.guard ? (
                        <span className="guard-chip">
                          <ShieldCheck size={12} /> {feature.guard}
                        </span>
                      ) : (
                        <span className="muted-small">—</span>
                      )}
                    </td>
                    <td className="row-end">
                      <ArrowRight size={14} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pager
          page={safePage}
          pageCount={pageCount}
          total={filtered.length}
          pageSize={pageSize}
          onChange={setPage}
        />
      </Card>

      <p className="footnote">
        <TriangleAlert size={12} /> Fitur `Needs setup` tidak dibuka sebelum dependency tersedia. Status tidak boleh dinaikkan tanpa bukti.
      </p>

      <Drawer
        open={Boolean(detail)}
        onClose={() => setDetail(null)}
        title={detail?.name ?? 'Fitur'}
        sub={detail ? `${detail.id} · ${detail.group}` : undefined}
        footer={
          <>
            <button type="button" className="btn btn-ghost" onClick={() => setDetail(null)}>
              Tutup
            </button>
            {link && (
              <a className="btn btn-primary" href={`#${link.to}`} onClick={() => setDetail(null)}>
                {link.label} <ArrowRight size={14} />
              </a>
            )}
          </>
        }
      >
        {detail && (
          <div className="detail-stack">
            <div className="detail-inline">
              <StatusPill status={detail.status} />
              <Badge tone={groupTone[detail.group]}>{detail.group}</Badge>
              {detail.guard && (
                <Badge tone="warning">
                  <ShieldCheck size={12} /> Guard aktif
                </Badge>
              )}
            </div>
            <p className="prose-sm">{detail.desc}</p>
            <div className="detail-block">
              <div className="detail-block-head">
                <PackageOpen size={14} /> Dependency
              </div>
              <p className="prose-sm">{detail.dependency ?? 'Tidak ada dependency eksternal yang tercatat.'}</p>
            </div>
            <div className={cx('detail-block', detail.guard && 'is-warning')}>
              <div className="detail-block-head">
                <ShieldCheck size={14} /> Guard
              </div>
              <p className="prose-sm">
                {detail.guard ?? 'Belum ada guard khusus. Guard global approval dan audit tetap berlaku.'}
              </p>
            </div>
            <div className="detail-block">
              <div className="detail-block-head">
                <Layers size={14} /> Status arti
              </div>
              <p className="prose-sm">
                {detail.status === 'Planned'
                  ? 'Sudah dirancang, belum dibangun. Tetap tampil dengan label status yang jujur.'
                  : 'Bisa dibangun, menunggu dependency eksternal. Fitur terkait ditutup sampai dependency aktif.'}
              </p>
            </div>
            <p className="footnote">
              Registry ini adalah sumber kebenaran fitur. Menambah fitur wajib melalui registry, bukan menu top-level baru.
            </p>
          </div>
        )}
      </Drawer>
    </>
  );
}
