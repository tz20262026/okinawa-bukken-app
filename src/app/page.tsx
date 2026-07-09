'use client';

import { useState, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';
import OkinawaMap from '@/components/OkinawaMap';
import VerdictDetail from '@/components/VerdictDetail';
import { getVerdict } from '@/lib/market';

const LeafletMap = dynamic(() => import('@/components/LeafletMap'), { ssr: false });

type Property = {
  id: number;
  source: string;
  prop_name: string;
  price: string;
  area: string;
  url: string;
  date_str: string;
  scraped_at: string;
  verdict: string | null;
  verdict_benchmark: number | null;
  verdict_diff: number | null;
};

type AlertProperty = {
  id: number;
  prop_name: string;
  price: string;
  area: string;
  url: string;
  verdict_diff: number | null;
};

type AreaVerdictCounts = Record<string, { yasui: number; soba: number; takai: number; total: number }>;

type Stats = {
  sources: Record<string, number>;
  dates: string[];
  total: number;
  areaCounts: Record<string, number>;
  areaVerdictCounts: AreaVerdictCounts;
};

type SortKey = 'newest' | 'price_asc' | 'price_desc' | 'area';

const SOURCE_COLORS: Record<string, { dot: string; badge: string; favicon: string }> = {
  'うちなーらいふ': { dot: '#3B82F6', badge: 'bg-blue-50 text-blue-700',    favicon: 'https://www.google.com/s2/favicons?domain=e-uchina.net&sz=32' },
  'goohome':        { dot: '#10B981', badge: 'bg-emerald-50 text-emerald-700', favicon: 'https://www.google.com/s2/favicons?domain=goohome.jp&sz=32' },
  'すまいずむ':     { dot: '#F97316', badge: 'bg-orange-50 text-orange-700',  favicon: 'https://www.google.com/s2/favicons?domain=sumaism.net&sz=32' },
};

const VERDICT_CFG = {
  '割安':   { cls: 'bg-emerald-50 text-emerald-700 border border-emerald-200', dot: 'bg-emerald-500' },
  '相場並み': { cls: 'bg-slate-100 text-slate-500 border border-slate-200',   dot: 'bg-slate-400' },
  '割高':   { cls: 'bg-red-50 text-red-600 border border-red-200',             dot: 'bg-red-500' },
} as const;

// 情報元サイトの掲載日が取れない物件も多いため、取得日で補完して表示する
function displayDate(p: Property): string {
  return (p.date_str || p.scraped_at || '').slice(0, 10) || '—';
}

function VerdictBadge({ prop }: { prop: Property }) {
  const v    = prop.verdict          ?? getVerdict(prop.prop_name, prop.price, prop.area)?.verdict   ?? null;
  const bench = prop.verdict_benchmark ?? getVerdict(prop.prop_name, prop.price, prop.area)?.benchmark ?? null;
  const diff  = prop.verdict_diff      ?? getVerdict(prop.prop_name, prop.price, prop.area)?.diff      ?? null;
  if (!v || !(v in VERDICT_CFG)) return null;
  const cfg = VERDICT_CFG[v as keyof typeof VERDICT_CFG];
  const diffRounded = diff !== null ? Math.round(diff as number) : null;
  const sign = (diffRounded ?? 0) > 0 ? '+' : '';
  const tip  = bench ? `相場 ${bench}万円 比 ${sign}${diffRounded}%` : '';
  return (
    <span title={tip} className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-md cursor-help ${cfg.cls}`}>
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${cfg.dot}`} />
      {v}
      {diffRounded !== null && <span className="opacity-60 tabular-nums">{sign}{diffRounded}%</span>}
    </span>
  );
}

export default function Home() {
  const [properties, setProperties] = useState<Property[]>([]);
  const [stats, setStats]   = useState<Stats | null>(null);
  const [total, setTotal]   = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage]     = useState(1);
  const [source, setSource] = useState('');
  const [area, setArea]     = useState('');
  const [period, setPeriod] = useState('');
  const [search, setSearch] = useState('');
  const [sort, setSort]     = useState<SortKey>('newest');
  const [propType, setPropType] = useState('');
  const [verdict, setVerdict]   = useState('');
  const [mapOpen, setMapOpen]   = useState(false);
  const [viewMode, setViewMode] = useState<'list' | 'map'>('list');

  // 機能2: 判定根拠モーダル
  const [selectedProp, setSelectedProp] = useState<Property | null>(null);

  // 機能1: バーストアラート
  const [alertCount, setAlertCount] = useState(0);
  const [alertOpen, setAlertOpen]   = useState(false);
  const [alertProps, setAlertProps] = useState<AlertProperty[]>([]);

  const LIMIT = 30;

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch('/api/properties?stats=1');
      setStats(await res.json());
    } catch {}
  }, []);

  const fetchProperties = useCallback(async () => {
    setLoading(true);
    try {
      const p = new URLSearchParams();
      if (source)   p.set('source', source);
      if (area)     p.set('area', area);
      if (period)   p.set('period', period);
      if (search)   p.set('search', search);
      if (propType) p.set('propType', propType);
      if (verdict)  p.set('verdict', verdict);
      p.set('sort', sort);
      p.set('page', String(page));
      p.set('limit', String(LIMIT));
      const res  = await fetch(`/api/properties?${p}`);
      const data = await res.json();
      setProperties(data.data  || []);
      setTotal(data.total || 0);
    } catch {
      setProperties([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [source, area, period, search, sort, propType, verdict, page]);

  // 機能1: アラートポーリング（5分おき）
  const checkAlerts = useCallback(async () => {
    try {
      const res = await fetch('/api/alert');
      const data = await res.json();
      setAlertCount(data.count || 0);
      setAlertProps(data.properties || []);
    } catch {}
  }, []);

  useEffect(() => { fetchStats(); },      [fetchStats]);
  useEffect(() => { fetchProperties(); }, [fetchProperties]);
  useEffect(() => {
    checkAlerts();
    const id = setInterval(checkAlerts, 5 * 60 * 1000);
    return () => clearInterval(id);
  }, [checkAlerts]);

  const resetAll  = () => { setSource(''); setArea(''); setPeriod(''); setSearch(''); setSort('newest'); setPropType(''); setVerdict(''); setPage(1); };
  const hasFilter = !!(source || area || period || search || propType || verdict);
  const totalPages = Math.ceil(total / LIMIT);

  type FilterChip = { label: string; onRemove: () => void; color: string };
  const activeFilters: FilterChip[] = [
    propType ? { label: propType, onRemove: () => setPropType(''), color: 'bg-blue-50 text-blue-700' } : null,
    verdict  ? { label: verdict,  onRemove: () => setVerdict(''),  color: verdict === '割安' ? 'bg-emerald-50 text-emerald-700' : verdict === '割高' ? 'bg-red-50 text-red-700' : 'bg-slate-100 text-slate-600' } : null,
    source   ? { label: source,   onRemove: () => setSource(''),   color: 'bg-slate-100 text-slate-700' } : null,
    area     ? { label: `📍 ${area}`, onRemove: () => setArea(''), color: 'bg-violet-50 text-violet-700' } : null,
    search   ? { label: `"${search}"`, onRemove: () => setSearch(''), color: 'bg-amber-50 text-amber-700' } : null,
    period   ? { label: period === '3months' ? '直近3ヶ月' : '直近1年', onRemove: () => setPeriod(''), color: 'bg-green-50 text-green-700' } : null,
  ].filter((f): f is FilterChip => f !== null);

  const SORT_LABELS: Record<SortKey, string> = { newest: '新着順', price_asc: '安い順', price_desc: '高い順', area: 'エリア順' };

  return (
    <div className="min-h-screen bg-slate-50">

      {/* 機能2: 判定根拠モーダル */}
      {selectedProp && (
        <VerdictDetail
          property={selectedProp}
          areaProperties={properties}
          onClose={() => setSelectedProp(null)}
        />
      )}

      {/* ── ヘッダー ── */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-20 shadow-sm">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-blue-600 rounded-xl flex items-center justify-center shrink-0 shadow-sm shadow-blue-200">
              <span className="text-white text-sm">🏠</span>
            </div>
            <div>
              <h1 className="font-bold text-slate-800 text-sm sm:text-base leading-tight">OKINAWA REsystem</h1>
              <p className="text-slate-400 text-[11px] hidden sm:block">うちなーらいふ / goohome / すまいずむ 毎日自動収集</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {/* 件数（PCのみ表示） */}
            {stats && (
              <div className="hidden sm:flex items-baseline gap-1 mr-1">
                <span className="text-2xl font-bold text-blue-600">{stats.total.toLocaleString()}</span>
                <span className="text-slate-400 text-sm">件</span>
              </div>
            )}

            {/* リスト / 地図 切り替え */}
            <div className="flex rounded-xl border border-slate-200 overflow-hidden">
              {(['list', 'map'] as const).map(mode => (
                <button
                  key={mode}
                  onClick={() => setViewMode(mode)}
                  className={`px-2.5 sm:px-3 py-1.5 text-xs font-semibold transition-colors ${
                    viewMode === mode
                      ? 'bg-blue-600 text-white'
                      : 'bg-white text-slate-500 hover:bg-slate-50'
                  }`}
                >
                  {mode === 'list' ? '📋' : '🗺️'}<span className="hidden sm:inline ml-1">{mode === 'list' ? 'リスト' : '地図'}</span>
                </button>
              ))}
            </div>

            {/* 機能1: アラートベル */}
            <div className="relative">
              <button
                onClick={() => setAlertOpen(v => !v)}
                className={`relative w-9 h-9 flex items-center justify-center rounded-xl border-2 transition-colors ${
                  alertOpen
                    ? 'bg-amber-100 border-amber-300'
                    : alertCount > 0
                      ? 'bg-amber-50 border-amber-300'
                      : 'bg-white border-slate-200 hover:bg-slate-50'
                }`}
                title="新着割安物件アラート"
              >
                <span className="text-lg leading-none">🔔</span>
                {alertCount > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1 shadow-sm">
                    {alertCount > 99 ? '99+' : alertCount}
                  </span>
                )}
              </button>
              {alertOpen && (
                <div className="absolute right-0 top-11 bg-white rounded-2xl shadow-xl border border-slate-200 w-72 z-30 overflow-hidden">
                  <div className="px-3 py-2.5 border-b border-slate-100 flex items-center justify-between">
                    <p className="text-xs font-bold text-slate-700">🔔 新着割安物件（直近24時間）</p>
                    <button onClick={() => setAlertOpen(false)} className="text-slate-400 hover:text-slate-600 text-xs px-1">✕</button>
                  </div>
                  {alertProps.length === 0 ? (
                    <p className="text-xs text-slate-400 text-center py-5">新着なし（毎朝9時更新）</p>
                  ) : (
                    <div className="divide-y divide-slate-50 max-h-72 overflow-y-auto">
                      {alertProps.map(p => (
                        <div key={p.id} className="px-3 py-2.5">
                          <p className="text-xs font-semibold text-slate-800 line-clamp-1 mb-0.5">{p.prop_name}</p>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-emerald-600">{p.price}</span>
                            <span className="text-[10px] text-slate-400">{p.area}</span>
                            {p.verdict_diff !== null && (
                              <span className="text-[10px] font-semibold text-emerald-600 ml-auto tabular-nums">
                                {Math.round(p.verdict_diff)}%
                              </span>
                            )}
                            {p.url && (
                              <a href={p.url} target="_blank" rel="noopener noreferrer"
                                className="text-[10px] text-blue-500 hover:underline shrink-0">→</a>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  <p className="text-[9px] text-slate-300 text-center py-1.5">5分おきに自動更新</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-3 sm:px-4 py-5 space-y-3">

        {/* ── 地図ビュー ── */}
        {viewMode === 'map' && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-3 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setViewMode('list')}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition-colors"
                >
                  ← 戻る
                </button>
                <span className="text-sm font-semibold text-slate-700">🗺️ エリア別物件マップ</span>
              </div>
              {area && (
                <span className="bg-indigo-100 text-indigo-700 text-xs font-semibold px-2.5 py-1 rounded-full flex items-center gap-1">
                  📍 {area}
                  <button onClick={() => { setArea(''); setPage(1); }} className="ml-1 opacity-60 hover:opacity-100">×</button>
                </span>
              )}
            </div>
            <div style={{ height: '520px' }} className="relative">
              {stats && (
                <LeafletMap
                  properties={properties}
                  selectedArea={area}
                  onAreaSelect={(a) => { setArea(a); setPage(1); }}
                  areaCounts={stats.areaCounts}
                  areaVerdictCounts={stats.areaVerdictCounts}
                />
              )}
            </div>
            <div className="border-t border-slate-100 p-3">
              <p className="text-xs text-slate-500 mb-2">
                {area ? `${area} の物件` : '全エリアの物件'} — <span className="font-bold text-slate-800">{total}</span>件
              </p>
              <div className="space-y-1.5 max-h-64 overflow-y-auto">
                {properties.map(p => {
                  const vColor = p.verdict === '割安' ? 'text-emerald-600' : p.verdict === '割高' ? 'text-red-500' : 'text-slate-500';
                  return (
                    <div key={p.id} className="flex items-center gap-2 text-xs py-1 border-b border-slate-50 last:border-0">
                      <span className="text-slate-400 shrink-0 w-20 truncate">{p.area}</span>
                      <span className="flex-1 text-slate-700 truncate">{p.prop_name}</span>
                      <span className="font-bold text-slate-800 shrink-0">{p.price}</span>
                      {p.verdict && <span className={`shrink-0 font-semibold ${vColor}`}>{p.verdict}</span>}
                      {p.url && <a href={p.url} target="_blank" rel="noopener noreferrer" className="shrink-0 text-blue-500 hover:underline">→</a>}
                    </div>
                  );
                })}
              </div>
              {total > properties.length && (
                <p className="text-xs text-slate-400 mt-2 text-center">…他 {total - properties.length}件</p>
              )}
            </div>
          </div>
        )}

        {/* ── ソース別集計カード ── */}
        {stats && (
          <div className="grid grid-cols-3 gap-2 sm:gap-3">
            {Object.entries(stats.sources).map(([src, cnt]) => {
              const c = SOURCE_COLORS[src] ?? { dot: '#6B7280', badge: 'bg-slate-100 text-slate-600', favicon: '' };
              const isActive = source === src;
              return (
                <button
                  key={src}
                  onClick={() => { setSource(isActive ? '' : src); setPage(1); }}
                  className={`rounded-2xl p-3 sm:p-4 text-left transition-all duration-150 ${
                    isActive
                      ? 'bg-blue-600 shadow-lg shadow-blue-200 scale-[0.98]'
                      : 'bg-white border border-slate-200 hover:border-blue-200 hover:shadow-md'
                  }`}
                >
                  <div className="flex items-center gap-1.5 mb-2">
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ background: c.dot }} />
                    <span className={`text-xs font-semibold truncate ${isActive ? 'text-blue-100' : 'text-slate-500'}`}>{src}</span>
                  </div>
                  <p className={`text-xl sm:text-2xl font-bold leading-none ${isActive ? 'text-white' : 'text-slate-800'}`}>
                    {cnt.toLocaleString()}
                    <span className={`text-xs font-normal ml-0.5 ${isActive ? 'text-blue-200' : 'text-slate-400'}`}>件</span>
                  </p>
                </button>
              );
            })}
          </div>
        )}

        {/* ── 検索・フィルターエリア ── */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          {/* 賃貸 / 売買 / 農地系 タブ（横スクロール対応） */}
          <div className="flex border-b border-slate-100 overflow-x-auto scrollbar-none">
            {(
              [
                { key: '',      label: 'すべて' },
                { key: '賃貸',  label: '🔑 賃貸' },
                { key: '売買',  label: '🏡 売買' },
                { key: '宅地',  label: '🏗️ 宅地' },
                { key: '雑種地',label: '🟫 雑種地' },
                { key: '田',    label: '🌾 田' },
                { key: '農地',  label: '🌿 農地' },
                { key: '原野',  label: '🏔️ 原野' },
              ] as const
            ).map(({ key, label }) => (
              <button
                key={key}
                onClick={() => { setPropType(key); setPage(1); }}
                className={`shrink-0 px-3 sm:px-4 py-2.5 text-xs sm:text-sm font-semibold transition-colors relative whitespace-nowrap ${
                  propType === key
                    ? 'text-blue-600'
                    : 'text-slate-400 hover:text-slate-600'
                }`}
              >
                {label}
                {propType === key && (
                  <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600 rounded-t" />
                )}
              </button>
            ))}
          </div>

          <div className="p-3 space-y-2.5">
            {/* 検索 + 期間フィルター（機能3） */}
            <div className="flex gap-2">
              <div className="relative flex-1">
                <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                  type="text"
                  value={search}
                  onChange={e => { setSearch(e.target.value); setPage(1); }}
                  placeholder="物件名・間取り・エリアで検索…"
                  className="w-full pl-10 pr-8 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                />
                {search && (
                  <button
                    onClick={() => { setSearch(''); setPage(1); }}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>
              <select
                value={period}
                onChange={e => { setPeriod(e.target.value); setPage(1); }}
                className="border border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent shrink-0"
              >
                <option value="">📅 全期間</option>
                <option value="1year">📅 直近1年</option>
                <option value="3months">📅 直近3ヶ月</option>
              </select>
            </div>

            {/* アクティブフィルターチップ */}
            {activeFilters.length > 0 && (
              <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
                {activeFilters.map((f, i) => (
                  <span key={i} className={`inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full ${f.color}`}>
                    {f.label}
                    <button
                      onClick={() => { f.onRemove(); setPage(1); }}
                      className="opacity-60 hover:opacity-100 leading-none ml-0.5"
                    >×</button>
                  </span>
                ))}
                <button onClick={resetAll} className="text-xs text-slate-400 hover:text-red-500 transition-colors ml-1 underline underline-offset-2">
                  すべて解除
                </button>
              </div>
            )}
          </div>
        </div>

        {/* ── エリアマップ ── */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <button
            onClick={() => setMapOpen(v => !v)}
            className="w-full flex items-center justify-between px-4 py-3.5 hover:bg-slate-50 transition-colors text-left"
          >
            <span className="flex items-center gap-2.5 font-semibold text-sm text-slate-700">
              <span className="w-6 h-6 bg-violet-100 rounded-lg flex items-center justify-center text-xs shrink-0">🗺️</span>
              エリアで絞り込む
              {area && (
                <span className="bg-violet-600 text-white text-xs px-2.5 py-0.5 rounded-full font-medium">{area}</span>
              )}
            </span>
            <svg className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${mapOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {mapOpen && (
            <div className="border-t border-slate-100 p-3 sm:p-4">
              <OkinawaMap
                selected={area}
                onSelect={(a) => { setArea(a); setPage(1); }}
                counts={stats?.areaCounts || {}}
              />
            </div>
          )}
        </div>

        {/* ── 件数 ＋ 絞り込み ＋ ソート（リストモードのみ） ── */}
        {viewMode === 'list' && <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-500">
              {loading ? (
                <span className="text-slate-400 animate-pulse">検索中…</span>
              ) : (
                <><span className="font-bold text-slate-800 text-base">{total.toLocaleString()}</span>{' '}件{hasFilter ? ' ヒット' : ''}</>
              )}
            </p>
          </div>

          {/* 絞り込み＋ソート（横スクロール） */}
          <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none pb-0.5">
            {(['割安', '相場並み', '割高'] as const).map(key => {
              const dotColor = { 割安: 'bg-emerald-500', 相場並み: 'bg-slate-400', 割高: 'bg-red-500' }[key];
              const isActive = verdict === key;
              return (
                <button key={key}
                  onClick={() => { setVerdict(isActive ? '' : key); setPage(1); }}
                  className={`shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap ${
                    isActive
                      ? 'bg-slate-800 text-white shadow-sm'
                      : 'bg-white border border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  <span className={`w-2 h-2 rounded-full shrink-0 ${dotColor}`} />
                  {key}
                </button>
              );
            })}

            <span className="w-px h-5 bg-slate-200 shrink-0" />

            {(['newest', 'price_asc', 'price_desc', 'area'] as const).map(key => (
              <button key={key}
                onClick={() => { setSort(key); setPage(1); }}
                className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap ${
                  sort === key
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'bg-white border border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50'
                }`}
              >{SORT_LABELS[key]}</button>
            ))}
          </div>
        </div>}

        {/* 機能2: 根拠クリックヒント */}
        {viewMode === 'list' && !loading && properties.length > 0 && (
          <p className="text-[11px] text-slate-400 text-right -mt-1">
            💡 行クリック → 割安・割高の判定根拠を表示
          </p>
        )}

        {/* ── 物件一覧（リストモードのみ） ── */}
        {viewMode === 'list' && <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3">
              <div className="w-8 h-8 border-2 border-slate-200 border-t-blue-600 rounded-full animate-spin" />
              <span className="text-sm text-slate-400">読み込み中…</span>
            </div>
          ) : properties.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-slate-400">
              <span className="text-5xl mb-4">🏚️</span>
              <p className="font-semibold text-slate-600 mb-1 text-sm">物件が見つかりません</p>
              <p className="text-xs mb-4 text-slate-400">別のキーワードやエリアで試してください</p>
              {hasFilter && (
                <button onClick={resetAll} className="text-sm text-blue-500 hover:text-blue-700 underline underline-offset-2">
                  フィルターをリセット
                </button>
              )}
            </div>
          ) : (
            <>
              {/* PC テーブル */}
              <div className="hidden sm:block">
                <table className="w-full table-fixed">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50/60">
                      <th className="text-left pl-4 pr-2 py-2.5 text-[11px] font-semibold text-slate-400 uppercase tracking-widest w-[46%]">情報元 / 物件名</th>
                      <th className="text-left px-2 py-2.5 text-[11px] font-semibold text-slate-400 uppercase tracking-widest w-[22%]">価格 / 評価</th>
                      <th className="text-left px-2 py-2.5 text-[11px] font-semibold text-slate-400 uppercase tracking-widest w-[16%]">エリア</th>
                      <th className="text-left px-2 py-2.5 text-[11px] font-semibold text-slate-400 uppercase tracking-widest w-[10%]">更新日</th>
                      <th className="w-[6%]" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {properties.map(p => {
                      const c = SOURCE_COLORS[p.source] ?? { dot: '#6B7280', badge: 'bg-slate-100 text-slate-600', favicon: '' };
                      return (
                        <tr
                          key={p.id}
                          className="hover:bg-blue-50/30 transition-colors group cursor-pointer"
                          onClick={() => setSelectedProp(p)}
                        >
                          <td className="pl-4 pr-2 py-2.5">
                            <div className="flex items-center gap-1.5 mb-0.5">
                              <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: c.dot }} />
                              <span className={`text-[10px] font-semibold ${c.badge.split(' ')[1] ?? 'text-slate-500'}`}>{p.source}</span>
                            </div>
                            <p className="text-xs font-medium text-slate-800 line-clamp-1 leading-snug">{p.prop_name}</p>
                          </td>
                          <td className="px-2 py-2.5">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-bold text-slate-800 text-sm whitespace-nowrap">{p.price}</span>
                              <VerdictBadge prop={p} />
                            </div>
                          </td>
                          <td className="px-2 py-2.5">
                            <button
                              onClick={e => { e.stopPropagation(); setArea(area === p.area ? '' : p.area); setPage(1); }}
                              className="text-xs text-indigo-600 hover:text-indigo-800 font-medium hover:underline underline-offset-2 text-left"
                            >{p.area}</button>
                          </td>
                          <td className="px-2 py-2.5 text-[11px] text-slate-600 whitespace-nowrap">{displayDate(p)}</td>
                          <td className="pr-4 py-2.5 text-right">
                            {p.url ? (
                              <a href={p.url} target="_blank" rel="noopener noreferrer"
                                onClick={e => e.stopPropagation()}
                                className="text-[11px] font-semibold text-blue-500 hover:text-blue-700 whitespace-nowrap">
                                →
                              </a>
                            ) : null}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* スマホ カード */}
              <div className="sm:hidden divide-y divide-slate-50">
                {properties.map(p => {
                  const c = SOURCE_COLORS[p.source] ?? { dot: '#6B7280', badge: 'bg-slate-100 text-slate-600', favicon: '' };
                  return (
                    <div
                      key={p.id}
                      className="p-4 active:bg-slate-50 transition-colors cursor-pointer"
                      onClick={() => setSelectedProp(p)}
                    >
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-md ${c.badge}`}>
                          <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: c.dot }} />
                          {p.source}
                        </span>
                        <span className="text-xs text-slate-400 shrink-0">{displayDate(p)}</span>
                      </div>
                      <p className="text-sm font-semibold text-slate-800 mb-2.5 leading-snug">{p.prop_name}</p>
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 flex-wrap min-w-0">
                          <span className="font-bold text-slate-800 text-sm shrink-0">{p.price}</span>
                          <VerdictBadge prop={p} />
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            onClick={e => { e.stopPropagation(); setArea(area === p.area ? '' : p.area); setPage(1); }}
                            className="text-xs text-violet-600 bg-violet-50 hover:bg-violet-100 px-2 py-1 rounded-lg font-medium transition-colors"
                          >{p.area}</button>
                          {p.url && (
                            <a href={p.url} target="_blank" rel="noopener noreferrer"
                              onClick={e => e.stopPropagation()}
                              className="text-xs text-blue-600 font-semibold bg-blue-50 hover:bg-blue-100 px-3 py-1 rounded-lg transition-colors">
                              詳細 →
                            </a>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>}

        {/* ── ページネーション（リストモードのみ） ── */}
        {viewMode === 'list' && totalPages > 1 && (
          <div className="flex items-center justify-center gap-2 pb-2 flex-wrap">
            <button onClick={() => setPage(1)} disabled={page === 1}
              className="w-9 h-9 flex items-center justify-center rounded-xl border border-slate-200 text-slate-500 text-sm disabled:opacity-30 hover:bg-slate-100 transition-colors">«</button>
            <button onClick={() => setPage(p => p - 1)} disabled={page === 1}
              className="px-4 h-9 flex items-center rounded-xl border border-slate-200 text-slate-600 text-sm font-medium disabled:opacity-30 hover:bg-slate-100 transition-colors">前へ</button>
            <span className="px-5 h-9 flex items-center bg-blue-600 text-white rounded-xl text-sm font-bold shadow-sm shadow-blue-200 min-w-[80px] justify-center">
              {page} / {totalPages}
            </span>
            <button onClick={() => setPage(p => p + 1)} disabled={page === totalPages}
              className="px-4 h-9 flex items-center rounded-xl border border-slate-200 text-slate-600 text-sm font-medium disabled:opacity-30 hover:bg-slate-100 transition-colors">次へ</button>
            <button onClick={() => setPage(totalPages)} disabled={page === totalPages}
              className="w-9 h-9 flex items-center justify-center rounded-xl border border-slate-200 text-slate-500 text-sm disabled:opacity-30 hover:bg-slate-100 transition-colors">»</button>
          </div>
        )}

        <footer className="text-center text-xs text-slate-300 pb-4">
          OKINAWA REsystem &copy; 2026 — 毎日 JST 9:00 自動更新
        </footer>
      </main>
    </div>
  );
}
