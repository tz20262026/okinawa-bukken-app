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

const SOURCE_COLORS: Record<string, { bg: string; text: string; dot: string }> = {
  'うちなーらいふ': { bg: 'bg-blue-50', text: 'text-blue-700', dot: 'bg-blue-500' },
  'goohome':        { bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500' },
  'すまいずむ':     { bg: 'bg-orange-50', text: 'text-orange-700', dot: 'bg-orange-500' },
};

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
  const [searchInput, setSearchInput] = useState('');
  const [mapOpen, setMapOpen] = useState(false);

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
      const params = new URLSearchParams();
      if (source) params.set('source', source);
      if (area) params.set('area', area);
      if (date) params.set('date', date);
      if (search) params.set('search', search);
      params.set('page', String(page));
      params.set('limit', String(LIMIT));
      const res = await fetch(`/api/properties?${params}`);
      const data = await res.json();
      setProperties(data.data || []);
      setTotal(data.total || 0);
    } catch {
      setProperties([]);
    } finally {
      setLoading(false);
    }
  }, [source, area, date, search, page]);

  useEffect(() => { fetchStats(); }, [fetchStats]);
  useEffect(() => { fetchProperties(); }, [fetchProperties]);

  const handleSearch = () => { setSearch(searchInput); setPage(1); };
  const handleAreaSelect = (a: string) => { setArea(a); setPage(1); };
  const resetAll = () => { setSource(''); setArea(''); setDate(''); setSearch(''); setSearchInput(''); setPage(1); };

  const totalPages = Math.ceil(total / LIMIT);
  const hasFilter = !!(source || area || date || search);

  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* ヘッダー */}
      <header className="bg-gradient-to-r from-blue-700 to-blue-500 text-white shadow-lg sticky top-0 z-20">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <div>
            <h1 className="text-lg sm:text-xl font-bold leading-tight">🏠 沖縄不動産 新着ダッシュボード</h1>
            <p className="text-blue-200 text-xs hidden sm:block">うちなーらいふ / goohome / すまいずむ 毎日自動収集</p>
          </div>
          {stats && (
            <div className="text-right shrink-0">
              <p className="text-2xl sm:text-3xl font-bold leading-none">{stats.total.toLocaleString()}</p>
              <p className="text-blue-200 text-xs">件</p>
            </div>
          )}
        </div>
      </header>

      <main className="max-w-7xl mx-auto w-full px-3 sm:px-4 py-4 flex-1">

        {/* ソース別カード */}
        {stats && (
          <div className="grid grid-cols-3 gap-2 sm:gap-3 mb-4">
            {Object.entries(stats.sources).map(([src, cnt]) => {
              const c = SOURCE_COLORS[src] || { bg: 'bg-gray-50', text: 'text-gray-700', dot: 'bg-gray-400' };
              return (
                <button
                  key={src}
                  onClick={() => { setSource(source === src ? '' : src); setPage(1); }}
                  className={`rounded-xl p-3 border text-left transition-all ${c.bg} ${source === src ? 'ring-2 ring-offset-1 ring-blue-500 shadow-sm' : 'border-gray-100 hover:shadow-sm'}`}
                >
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className={`w-2 h-2 rounded-full shrink-0 ${c.dot}`} />
                    <span className={`text-xs font-semibold truncate ${c.text}`}>{src}</span>
                  </div>
                  <p className="text-xl font-bold text-gray-800">{cnt}<span className="text-xs font-normal text-gray-500 ml-0.5">件</span></p>
                </button>
              );
            })}
          </div>
        )}

        {/* 地図パネル（アコーディオン） */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 mb-4 overflow-hidden">
          <button
            onClick={() => setMapOpen(!mapOpen)}
            className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors"
          >
            <span className="font-semibold text-sm text-gray-800 flex items-center gap-2">
              🗺️ エリアマップで絞り込む
              {area && <span className="px-2 py-0.5 bg-blue-600 text-white text-xs rounded-full">{area}</span>}
            </span>
            <span className={`text-gray-400 text-lg transition-transform ${mapOpen ? 'rotate-180' : ''}`}>▾</span>
          </button>
          {mapOpen && (
            <div className="border-t border-gray-100 p-3 sm:p-4">
              <OkinawaMap
                selected={area}
                onSelect={(a) => { handleAreaSelect(a); }}
                counts={stats?.areaCounts || {}}
              />
              {area && (
                <button
                  onClick={() => handleAreaSelect('')}
                  className="mt-3 text-xs text-gray-500 hover:text-red-500 underline"
                >
                  ✕ エリア絞り込みを解除
                </button>
              )}
            </div>
          )}
        </div>

        {/* 検索・フィルターバー */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-3 mb-4">
          <div className="flex flex-wrap gap-2">
            <select
              value={date}
              onChange={e => { setDate(e.target.value); setPage(1); }}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-400"
            >
              <option value="">📅 全期間</option>
              {stats?.dates.map(d => (
                <option key={d} value={d}>{d}{d === todayStr ? '（今日）' : ''}</option>
              ))}
            </select>

            <div className="flex gap-2 flex-1 min-w-0">
              <input
                type="text"
                value={searchInput}
                onChange={e => setSearchInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSearch()}
                placeholder="物件名・間取りで検索..."
                className="flex-1 min-w-0 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
              <button
                onClick={handleSearch}
                className="bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors shrink-0"
              >
                検索
              </button>
            </div>

            {hasFilter && (
              <button
                onClick={resetAll}
                className="flex items-center gap-1 border border-red-200 text-red-500 hover:bg-red-50 px-3 py-2 rounded-lg text-sm transition-colors shrink-0"
              >
                ✕ リセット
              </button>
            )}
          </div>
        </div>

        {/* 件数表示 */}
        <div className="flex items-center justify-between mb-2 px-1">
          <p className="text-sm text-gray-500">
            {loading ? '読み込み中...' : (
              hasFilter
                ? <><span className="font-bold text-blue-700">{total.toLocaleString()}件</span> がヒット</>
                : <><span className="font-bold text-gray-700">{total.toLocaleString()}件</span> 表示中</>
            )}
          </p>
          {!loading && total > 0 && (
            <p className="text-xs text-gray-400">{(page-1)*LIMIT+1}〜{Math.min(page*LIMIT, total)}件目</p>
          )}
        </div>

        {/* 物件テーブル */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden mb-4">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-16 text-gray-400 gap-3">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
              <span className="text-sm">データを読み込み中...</span>
            </div>
          ) : properties.length === 0 ? (
            <div className="text-center py-16 text-gray-400">
              <p className="text-5xl mb-3">🏚️</p>
              <p className="font-medium text-gray-500">物件が見つかりません</p>
              {hasFilter && (
                <button onClick={resetAll} className="mt-3 text-sm text-blue-500 underline">
                  フィルターをリセット
                </button>
              )}
            </div>
          ) : (
            <>
              {/* PC向けテーブル */}
              <div className="hidden sm:block overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-100">
                      <th className="text-left px-4 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wide w-32">情報元</th>
                      <th className="text-left px-4 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wide">物件名</th>
                      <th className="text-left px-4 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wide w-28">価格</th>
                      <th className="text-left px-4 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wide w-24">エリア</th>
                      <th className="text-left px-4 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wide w-24">収集日</th>
                      <th className="px-4 py-3 w-14" />
                    </tr>
                  </thead>
                  <tbody>
                    {properties.map((p, i) => {
                      const c = SOURCE_COLORS[p.source] || { bg: 'bg-gray-50', text: 'text-gray-700', dot: 'bg-gray-400' };
                      return (
                        <tr key={p.id} className={`border-b border-gray-50 hover:bg-blue-50/40 transition-colors ${i % 2 === 1 ? 'bg-gray-50/30' : ''}`}>
                          <td className="px-4 py-3">
                            <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium ${c.bg} ${c.text}`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${c.dot}`} />
                              {p.source}
                            </span>
                          </td>
                          <td className="px-4 py-3 font-medium text-gray-800">{p.prop_name}</td>
                          <td className="px-4 py-3 font-bold text-red-600">{p.price}</td>
                          <td className="px-4 py-3">
                            <button
                              onClick={() => { setArea(area === p.area ? '' : p.area); setPage(1); }}
                              className="text-blue-600 hover:underline text-sm"
                            >
                              {p.area}
                            </button>
                          </td>
                          <td className="px-4 py-3 text-gray-400 text-xs">{p.date_str}</td>
                          <td className="px-4 py-3 text-right">
                            {p.url ? (
                              <a href={p.url} target="_blank" rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 text-xs font-medium bg-blue-50 hover:bg-blue-100 px-2.5 py-1.5 rounded-lg transition-colors">
                                詳細 →
                              </a>
                            ) : '—'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* スマホ向けカードリスト */}
              <div className="sm:hidden divide-y divide-gray-50">
                {properties.map((p) => {
                  const c = SOURCE_COLORS[p.source] || { bg: 'bg-gray-50', text: 'text-gray-700', dot: 'bg-gray-400' };
                  return (
                    <div key={p.id} className="p-4">
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium shrink-0 ${c.bg} ${c.text}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${c.dot}`} />
                          {p.source}
                        </span>
                        <span className="text-xs text-gray-400">{p.date_str}</span>
                      </div>
                      <p className="font-semibold text-gray-800 text-sm mb-1">{p.prop_name}</p>
                      <div className="flex items-center gap-3 text-sm">
                        <span className="font-bold text-red-600">{p.price}</span>
                        <button
                          onClick={() => { setArea(area === p.area ? '' : p.area); setPage(1); }}
                          className="text-blue-600 text-xs hover:underline"
                        >
                          📍 {p.area}
                        </button>
                      </div>
                      {p.url && (
                        <a href={p.url} target="_blank" rel="noopener noreferrer"
                          className="mt-2 block w-full text-center text-xs text-blue-600 font-medium bg-blue-50 hover:bg-blue-100 py-2 rounded-lg transition-colors">
                          詳細を見る →
                        </a>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>

        {/* ページネーション */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-2 pb-4">
            <button
              onClick={() => setPage(1)}
              disabled={page === 1}
              className="px-3 py-2 rounded-lg border border-gray-200 text-sm disabled:opacity-30 hover:bg-gray-50 transition-colors"
            >
              ««
            </button>
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-4 py-2 rounded-lg border border-gray-200 text-sm disabled:opacity-30 hover:bg-gray-50 transition-colors"
            >
              前へ
            </button>
            <span className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold">
              {page} / {totalPages}
            </span>
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="px-4 py-2 rounded-lg border border-gray-200 text-sm disabled:opacity-30 hover:bg-gray-50 transition-colors"
            >
              次へ
            </button>
            <button
              onClick={() => setPage(totalPages)}
              disabled={page === totalPages}
              className="px-3 py-2 rounded-lg border border-gray-200 text-sm disabled:opacity-30 hover:bg-gray-50 transition-colors"
            >
              »»
            </button>
          </div>
        )}

        <footer className="text-center text-xs text-gray-300 pb-6">
          沖縄不動産 新着ダッシュボード &copy; 2026 | 毎日 JST 9:00 自動更新
        </footer>
      </main>
    </div>
  );
}
