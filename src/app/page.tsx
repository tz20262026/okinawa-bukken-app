'use client';

import { useState, useEffect, useCallback } from 'react';
import OkinawaMap from '@/components/OkinawaMap';

type Property = {
  id: number;
  source: string;
  prop_name: string;
  price: string;
  area: string;
  url: string;
  date_str: string;
  scraped_at: string;
};

type Stats = {
  sources: Record<string, number>;
  dates: string[];
  total: number;
  areaCounts: Record<string, number>;
};

const SOURCE_INFO: Record<string, { bg: string; text: string; dot: string; favicon: string; label: string }> = {
  'うちなーらいふ': { bg: 'bg-blue-50', text: 'text-blue-700', dot: 'bg-blue-500', favicon: 'https://www.google.com/s2/favicons?domain=e-uchina.net&sz=32', label: 'うちなーらいふ' },
  'goohome':        { bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500', favicon: 'https://www.google.com/s2/favicons?domain=goohome.jp&sz=32', label: 'goohome' },
  'すまいずむ':     { bg: 'bg-orange-50', text: 'text-orange-700', dot: 'bg-orange-500', favicon: 'https://www.google.com/s2/favicons?domain=sumaism.net&sz=32', label: 'すまいずむ' },
};
// 後方互換用
const SOURCE_COLORS = SOURCE_INFO;

export default function Home() {
  const [properties, setProperties] = useState<Property[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [source, setSource] = useState('');
  const [area, setArea] = useState('');
  const [date, setDate] = useState('');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<'newest' | 'price_asc' | 'price_desc' | 'area'>('newest');
  const [propType, setPropType] = useState(''); // '賃貸' | '売買' | ''
  const [mapOpen, setMapOpen] = useState(true);

  const LIMIT = 30;

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch('/api/properties?stats=1');
      const data = await res.json();
      setStats(data);
    } catch {}
  }, []);

  const fetchProperties = useCallback(async () => {
    setLoading(true);
    try {
      const p = new URLSearchParams();
      if (source) p.set('source', source);
      if (area) p.set('area', area);
      if (date) p.set('date', date);
      if (search) p.set('search', search);
      if (propType) p.set('propType', propType);
      p.set('sort', sort);
      p.set('page', String(page));
      p.set('limit', String(LIMIT));
      const res = await fetch(`/api/properties?${p}`);
      const data = await res.json();
      setProperties(data.data || []);
      setTotal(data.total || 0);
    } catch {
      setProperties([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [source, area, date, search, sort, propType, page]);

  useEffect(() => { fetchStats(); }, [fetchStats]);
  useEffect(() => { fetchProperties(); }, [fetchProperties]);

  const resetAll = () => { setSource(''); setArea(''); setDate(''); setSearch(''); setSort('newest'); setPropType(''); setPage(1); };
  const hasFilter = !!(source || area || date || search || propType);
  const totalPages = Math.ceil(total / LIMIT);

  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;

  return (
    <div className="min-h-screen bg-gray-50">

      {/* ─── ヘッダー ─── */}
      <header className="bg-gradient-to-r from-blue-700 to-blue-500 text-white shadow-lg sticky top-0 z-20">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <div>
            <h1 className="text-lg sm:text-xl font-bold">🏠 沖縄不動産 新着ダッシュボード</h1>
            <p className="text-blue-200 text-xs hidden sm:block">うちなーらいふ / goohome / すまいずむ 毎日自動収集</p>
          </div>
          {stats && (
            <div className="text-right shrink-0">
              <p className="text-2xl sm:text-3xl font-bold leading-none">{stats.total}</p>
              <p className="text-blue-200 text-xs">件</p>
            </div>
          )}
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-3 sm:px-4 py-4">

        {/* ─── ソース別カード ─── */}
        {stats && (
          <div className="grid grid-cols-3 gap-2 sm:gap-3 mb-4">
            {Object.entries(stats.sources).map(([src, cnt]) => {
              const c = SOURCE_INFO[src] || { bg: 'bg-gray-50', text: 'text-gray-700', dot: 'bg-gray-400', favicon: '', label: src };
              const isActive = source === src;
              return (
                <button
                  key={src}
                  onClick={() => { setSource(isActive ? '' : src); setPage(1); }}
                  className={`rounded-xl p-3 text-left transition-all border-2 ${c.bg}
                    ${isActive ? 'border-blue-500 shadow-md ring-2 ring-blue-200' : 'border-transparent hover:border-gray-200 hover:shadow-sm'}`}
                >
                  <div className="flex items-center gap-2 mb-1.5">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={c.favicon} alt={src} width={16} height={16} className="rounded-sm shrink-0" />
                    <span className={`text-xs font-semibold truncate ${c.text}`}>{src}</span>
                  </div>
                  <p className="text-2xl font-bold text-gray-800">
                    {cnt}<span className="text-xs font-normal text-gray-500 ml-0.5">件</span>
                  </p>
                </button>
              );
            })}
          </div>
        )}

        {/* ─── 検索バー ─── */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-3 mb-4">
          {/* 賃貸/売買 タブ */}
          <div className="flex gap-1.5 mb-3">
            {[{ key: '', label: '🏠 すべて' }, { key: '賃貸', label: '🔑 賃貸' }, { key: '売買', label: '🏡 売買' }].map(t => (
              <button
                key={t.key}
                onClick={() => { setPropType(t.key); setPage(1); }}
                className={`flex-1 py-2 rounded-xl text-sm font-semibold transition-all ${
                  propType === t.key
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            {/* キーワード検索（入力即反映） */}
            <div className="relative flex-1">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-base pointer-events-none">🔍</span>
              <input
                type="text"
                value={search}
                onChange={e => { setSearch(e.target.value); setPage(1); }}
                placeholder="物件名・間取り（2LDK・1K）・エリア名で検索"
                className="w-full pl-9 pr-8 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
              {search && (
                <button
                  onClick={() => { setSearch(''); setPage(1); }}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700 text-xl font-light"
                >×</button>
              )}
            </div>

            {/* 日付フィルター */}
            <select
              value={date}
              onChange={e => { setDate(e.target.value); setPage(1); }}
              className="border border-gray-200 rounded-xl px-3 py-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-400 sm:w-auto"
            >
              <option value="">📅 全期間</option>
              {stats?.dates.map(d => (
                <option key={d} value={d}>{d}{d === todayStr ? '（今日）' : ''}</option>
              ))}
            </select>

            {/* リセット */}
            {hasFilter && (
              <button
                onClick={resetAll}
                className="flex items-center justify-center gap-1 border-2 border-red-300 text-red-500 hover:bg-red-50 px-4 py-3 rounded-xl text-sm font-medium transition-colors"
              >
                ✕ リセット
              </button>
            )}
          </div>

          {/* 現在の絞り込み状態 */}
          {hasFilter && (
            <div className="flex flex-wrap gap-1.5 mt-2.5">
              {propType && (
                <span className="flex items-center gap-1 bg-blue-100 text-blue-700 text-xs font-medium px-2.5 py-1 rounded-full">
                  {propType === '賃貸' ? '🔑' : '🏡'} {propType}
                  <button onClick={() => { setPropType(''); setPage(1); }} className="hover:text-blue-900 font-bold">×</button>
                </span>
              )}
              {source && (
                <span className="flex items-center gap-1 bg-blue-100 text-blue-700 text-xs font-medium px-2.5 py-1 rounded-full">
                  {source}
                  <button onClick={() => { setSource(''); setPage(1); }} className="hover:text-blue-900 font-bold">×</button>
                </span>
              )}
              {area && (
                <span className="flex items-center gap-1 bg-violet-100 text-violet-700 text-xs font-medium px-2.5 py-1 rounded-full">
                  📍{area}
                  <button onClick={() => { setArea(''); setPage(1); }} className="hover:text-violet-900 font-bold">×</button>
                </span>
              )}
              {search && (
                <span className="flex items-center gap-1 bg-amber-100 text-amber-700 text-xs font-medium px-2.5 py-1 rounded-full">
                  🔍「{search}」
                  <button onClick={() => { setSearch(''); setPage(1); }} className="hover:text-amber-900 font-bold">×</button>
                </span>
              )}
              {date && (
                <span className="flex items-center gap-1 bg-green-100 text-green-700 text-xs font-medium px-2.5 py-1 rounded-full">
                  📅{date}
                  <button onClick={() => { setDate(''); setPage(1); }} className="hover:text-green-900 font-bold">×</button>
                </span>
              )}
            </div>
          )}
        </div>

        {/* ─── エリアマップ ─── */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 mb-4 overflow-hidden">
          <button
            onClick={() => setMapOpen(v => !v)}
            className="w-full flex items-center justify-between px-4 py-3.5 hover:bg-gray-50 transition-colors"
          >
            <span className="font-semibold text-sm text-gray-800 flex items-center gap-2">
              🗺️ エリアで絞り込む
              {area && (
                <span className="bg-violet-600 text-white text-xs px-2.5 py-0.5 rounded-full">{area}</span>
              )}
            </span>
            <span className={`text-gray-400 transition-transform duration-200 ${mapOpen ? 'rotate-180' : ''}`}>▾</span>
          </button>

          {mapOpen && (
            <div className="border-t border-gray-100 p-3 sm:p-4">
              <OkinawaMap
                selected={area}
                onSelect={(a) => { setArea(a); setPage(1); }}
                counts={stats?.areaCounts || {}}
              />
            </div>
          )}
        </div>

        {/* ─── 件数 ＋ ソート ─── */}
        <div className="flex items-center justify-between mb-2 px-1 gap-2 flex-wrap">
          <p className="text-sm text-gray-500">
            {loading
              ? <span className="text-gray-400">検索中...</span>
              : hasFilter
                ? <><span className="font-bold text-blue-700 text-base">{total}</span> 件ヒット</>
                : <><span className="font-bold text-gray-700">{total}</span> 件</>
            }
          </p>
          <div className="flex items-center gap-1.5">
            {(['newest','price_asc','price_desc','area'] as const).map(key => {
              const labels = { newest:'🆕 新着順', price_asc:'💰 安い順', price_desc:'💎 高い順', area:'📍 エリア順' };
              return (
                <button
                  key={key}
                  onClick={() => { setSort(key); setPage(1); }}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    sort === key
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  {labels[key]}
                </button>
              );
            })}
          </div>
        </div>

        {/* ─── 物件一覧 ─── */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden mb-4">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-gray-400">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
              <span className="text-sm">読み込み中...</span>
            </div>
          ) : properties.length === 0 ? (
            <div className="text-center py-16 text-gray-400">
              <p className="text-5xl mb-3">🏚️</p>
              <p className="font-medium text-gray-500 mb-1">物件が見つかりません</p>
              <p className="text-xs text-gray-400 mb-3">別のキーワードやエリアで試してください</p>
              {hasFilter && (
                <button onClick={resetAll}
                  className="text-sm text-blue-500 underline hover:text-blue-700">
                  フィルターをすべてリセット
                </button>
              )}
            </div>
          ) : (
            <>
              {/* PC: テーブル */}
              <div className="hidden sm:block overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-100 text-xs text-gray-500 uppercase tracking-wide">
                      <th className="text-left px-4 py-3 font-semibold w-32">情報元</th>
                      <th className="text-left px-4 py-3 font-semibold">物件名・間取り</th>
                      <th className="text-left px-4 py-3 font-semibold w-28">価格</th>
                      <th className="text-left px-4 py-3 font-semibold w-24">エリア</th>
                      <th className="text-left px-4 py-3 font-semibold w-24">更新日</th>
                      <th className="px-4 py-3 w-16" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {properties.map((p) => {
                      const c = SOURCE_COLORS[p.source] || { bg: 'bg-gray-50', text: 'text-gray-700', dot: 'bg-gray-400' };
                      return (
                        <tr key={p.id} className="hover:bg-blue-50/30 transition-colors">
                          <td className="px-4 py-3">
                            <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium ${c.bg} ${c.text}`}>
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={c.favicon} alt={p.source} width={12} height={12} className="rounded-sm shrink-0" />
                              {p.source}
                            </span>
                          </td>
                          <td className="px-4 py-3 font-medium text-gray-800">{p.prop_name}</td>
                          <td className="px-4 py-3 font-bold text-red-600">{p.price}</td>
                          <td className="px-4 py-3">
                            <button
                              onClick={() => { setArea(area === p.area ? '' : p.area); setPage(1); }}
                              className="text-blue-600 hover:underline text-xs"
                            >
                              {p.area}
                            </button>
                          </td>
                          <td className="px-4 py-3 text-gray-400 text-xs">{p.date_str}</td>
                          <td className="px-4 py-3">
                            {p.url
                              ? <a href={p.url} target="_blank" rel="noopener noreferrer"
                                  className="text-xs text-blue-600 font-medium bg-blue-50 hover:bg-blue-100 px-2.5 py-1.5 rounded-lg transition-colors whitespace-nowrap">
                                  詳細 →
                                </a>
                              : '—'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* スマホ: カード */}
              <div className="sm:hidden divide-y divide-gray-50">
                {properties.map((p) => {
                  const c = SOURCE_COLORS[p.source] || { bg: 'bg-gray-50', text: 'text-gray-700', dot: 'bg-gray-400' };
                  return (
                    <div key={p.id} className="p-4">
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${c.bg} ${c.text}`}>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={c.favicon} alt={p.source} width={12} height={12} className="rounded-sm shrink-0" />
                          {p.source}
                        </span>
                        <span className="text-xs text-gray-400">{p.date_str}</span>
                      </div>
                      <p className="font-semibold text-gray-800 text-sm mb-2 leading-snug">{p.prop_name}</p>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-red-600">{p.price}</span>
                          <button
                            onClick={() => { setArea(area === p.area ? '' : p.area); setPage(1); }}
                            className="text-blue-600 text-xs bg-blue-50 px-2 py-0.5 rounded-full hover:bg-blue-100"
                          >
                            📍{p.area}
                          </button>
                        </div>
                        {p.url && (
                          <a href={p.url} target="_blank" rel="noopener noreferrer"
                            className="text-xs text-blue-600 font-medium bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-lg transition-colors">
                            詳細 →
                          </a>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>

        {/* ─── ページネーション ─── */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-2 pb-4 flex-wrap">
            <button onClick={() => setPage(1)} disabled={page === 1}
              className="px-3 py-2 rounded-lg border border-gray-200 text-sm disabled:opacity-30 hover:bg-gray-50">«</button>
            <button onClick={() => setPage(p => p - 1)} disabled={page === 1}
              className="px-4 py-2 rounded-lg border border-gray-200 text-sm disabled:opacity-30 hover:bg-gray-50">前へ</button>
            <span className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold min-w-[80px] text-center">
              {page} / {totalPages}
            </span>
            <button onClick={() => setPage(p => p + 1)} disabled={page === totalPages}
              className="px-4 py-2 rounded-lg border border-gray-200 text-sm disabled:opacity-30 hover:bg-gray-50">次へ</button>
            <button onClick={() => setPage(totalPages)} disabled={page === totalPages}
              className="px-3 py-2 rounded-lg border border-gray-200 text-sm disabled:opacity-30 hover:bg-gray-50">»</button>
          </div>
        )}

        <footer className="text-center text-xs text-gray-300 pb-6">
          沖縄不動産 新着ダッシュボード &copy; 2026 | 毎日 JST 9:00 自動更新
        </footer>

      </main>
    </div>
  );
}
