'use client';

import { useState, useEffect, useCallback } from 'react';

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
};

const SOURCE_COLORS: Record<string, string> = {
  'うちなーらいふ': 'bg-blue-100 text-blue-800 border-blue-200',
  'goohome': 'bg-green-100 text-green-800 border-green-200',
  'すまいずむ': 'bg-orange-100 text-orange-800 border-orange-200',
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

  const LIMIT = 50;

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

  const handleSearch = () => {
    setSearch(searchInput);
    setPage(1);
  };

  const totalPages = Math.ceil(total / LIMIT);

  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-blue-700 text-white py-5 shadow-lg">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <h1 className="text-2xl font-bold">🏠 沖縄不動産 新着物件ダッシュボード</h1>
              <p className="text-blue-200 text-sm mt-1">うちなーらいふ / goohome / すまいずむ 自動収集</p>
            </div>
            {stats && (
              <div className="text-right">
                <p className="text-3xl font-bold">{stats.total.toLocaleString()}</p>
                <p className="text-blue-200 text-sm">総物件数</p>
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6">
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            {Object.entries(stats.sources).map(([src, cnt]) => (
              <div key={src} className="bg-white rounded-xl shadow p-4 border border-gray-100">
                <p className="text-sm text-gray-500">{src}</p>
                <p className="text-2xl font-bold text-gray-800">{cnt}<span className="text-sm font-normal text-gray-500">件</span></p>
              </div>
            ))}
            <div className="bg-white rounded-xl shadow p-4 border border-gray-100">
              <p className="text-sm text-gray-500">最新収集日</p>
              <p className="text-sm font-bold text-gray-800">{stats.dates[0] || '---'}</p>
            </div>
          </div>
        )}

        <div className="bg-white rounded-xl shadow p-4 mb-6 border border-gray-100">
          <div className="flex flex-wrap gap-3">
            <select
              value={source}
              onChange={e => { setSource(e.target.value); setPage(1); }}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">すべての情報元</option>
              <option value="うちなーらいふ">うちなーらいふ</option>
              <option value="goohome">goohome</option>
              <option value="すまいずむ">すまいずむ</option>
            </select>

            <select
              value={date}
              onChange={e => { setDate(e.target.value); setPage(1); }}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">すべての日付</option>
              {stats?.dates.map(d => (
                <option key={d} value={d}>{d}{d === todayStr ? ' (今日)' : ''}</option>
              ))}
            </select>

            <input
              type="text"
              value={area}
              onChange={e => { setArea(e.target.value); setPage(1); }}
              placeholder="エリアで絞り込み..."
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />

            <div className="flex gap-2 flex-1 min-w-[200px]">
              <input
                type="text"
                value={searchInput}
                onChange={e => setSearchInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSearch()}
                placeholder="キーワード検索..."
                className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                onClick={handleSearch}
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
              >
                検索
              </button>
            </div>

            {(source || area || date || search) && (
              <button
                onClick={() => { setSource(''); setArea(''); setDate(''); setSearch(''); setSearchInput(''); setPage(1); }}
                className="border border-gray-300 text-gray-600 hover:bg-gray-50 px-4 py-2 rounded-lg text-sm transition-colors"
              >
                リセット
              </button>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between mb-3">
          <p className="text-sm text-gray-600">
            {loading ? '読み込み中...' : `${total.toLocaleString()}件中 ${total === 0 ? 0 : ((page-1)*LIMIT+1)}〜${Math.min(page*LIMIT, total)}件を表示`}
          </p>
        </div>

        <div className="bg-white rounded-xl shadow border border-gray-100 overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-20 text-gray-400">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mr-3"></div>
              データを読み込み中...
            </div>
          ) : properties.length === 0 ? (
            <div className="text-center py-20 text-gray-400">
              <p className="text-4xl mb-3">🏚️</p>
              <p>物件データがありません</p>
              <p className="text-sm mt-1">スクレイパーを実行してデータを収集してください</p>
              <code className="text-xs bg-gray-100 px-2 py-1 rounded mt-2 inline-block">node scripts/scraper.js</code>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="text-left px-4 py-3 font-semibold text-gray-700 w-28">情報元</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-700">物件名</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-700 w-28">価格</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-700 w-24">エリア</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-700 w-24">収集日</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-700 w-16">詳細</th>
                  </tr>
                </thead>
                <tbody>
                  {properties.map((p, i) => (
                    <tr key={p.id} className={`border-b border-gray-100 hover:bg-blue-50 transition-colors ${i % 2 === 0 ? '' : 'bg-gray-50/50'}`}>
                      <td className="px-4 py-3">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium border ${SOURCE_COLORS[p.source] || 'bg-gray-100 text-gray-700 border-gray-200'}`}>
                          {p.source}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-medium text-gray-800">{p.prop_name}</td>
                      <td className="px-4 py-3 text-red-600 font-semibold">{p.price}</td>
                      <td className="px-4 py-3 text-gray-600">{p.area}</td>
                      <td className="px-4 py-3 text-gray-400 text-xs">{p.date_str}</td>
                      <td className="px-4 py-3">
                        {p.url ? (
                          <a href={p.url} target="_blank" rel="noopener noreferrer"
                            className="text-blue-600 hover:text-blue-800 hover:underline font-medium">
                            詳細→
                          </a>
                        ) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-2 mt-6">
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
              className="px-4 py-2 rounded-lg border border-gray-300 text-sm disabled:opacity-40 hover:bg-gray-50 transition-colors">
              前へ
            </button>
            <span className="text-sm text-gray-600">{page} / {totalPages}</span>
            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
              className="px-4 py-2 rounded-lg border border-gray-300 text-sm disabled:opacity-40 hover:bg-gray-50 transition-colors">
              次へ
            </button>
          </div>
        )}

        <footer className="text-center text-xs text-gray-400 mt-8 py-4">
          <p>沖縄不動産 新着物件ダッシュボード &copy; 2026 | データは毎日自動収集されます</p>
        </footer>
      </main>
    </div>
  );
}
