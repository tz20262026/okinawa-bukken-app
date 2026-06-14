import path from 'path';
import fs from 'fs';

const DATA_DIR = path.join(process.cwd(), 'data');
const DB_PATH = path.join(DATA_DIR, 'properties.db');
const JSON_PATH = path.join(DATA_DIR, 'properties.json');

export type Property = {
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
  lat?: number | null;
  lng?: number | null;
  address_detail?: string;
};

export type SortKey = 'newest' | 'price_asc' | 'price_desc' | 'area';

export type PropertiesFilter = {
  source?: string;
  area?: string;
  date?: string;
  period?: string;
  search?: string;
  propType?: string;
  verdict?: string;
  sort?: SortKey;
  page?: number;
  limit?: number;
};

// 価格テキスト → 万円数値（ソート用）
function parsePriceForSort(price: string): number {
  if (!price) return 0;
  const s = price.replace(/,/g, '');
  const okuMan = s.match(/(\d+(?:\.\d+)?)億(\d+(?:\.\d+)?)万/);
  if (okuMan) return parseFloat(okuMan[1]) * 10000 + parseFloat(okuMan[2]);
  const oku = s.match(/(\d+(?:\.\d+)?)億/);
  if (oku) return parseFloat(oku[1]) * 10000;
  const man = s.match(/(\d+(?:\.\d+)?)万/);
  if (man) return parseFloat(man[1]);
  return 0;
}

// ────────────────────────────────────────────────
// JSON ベース（Vercel 本番環境）
// ────────────────────────────────────────────────
function getAllFromJson(): Property[] {
  try {
    const raw = fs.readFileSync(JSON_PATH, 'utf-8');
    return JSON.parse(raw) as Property[];
  } catch {
    return [];
  }
}

function filterAndSort(all: Property[], filter: PropertiesFilter): { data: Property[]; total: number } {
  const { source, area, date, period, search, propType, verdict, sort = 'newest', page = 1, limit = 50 } = filter;
  let rows = all;
  if (source) rows = rows.filter(r => r.source === source);
  if (area) rows = rows.filter(r => r.area?.includes(area));
  if (date) rows = rows.filter(r => r.date_str === date);
  if (period) {
    const now = new Date();
    const cutoff = period === '3months'
      ? new Date(now.getFullYear(), now.getMonth() - 3, now.getDate())
      : new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
    const cutoffStr = cutoff.toISOString().split('T')[0];
    rows = rows.filter(r => ((r.scraped_at || r.date_str || '').slice(0, 10)) >= cutoffStr);
  }
  if (propType) rows = rows.filter(r => r.prop_name?.includes(propType));
  if (verdict) rows = rows.filter(r => r.verdict === verdict);
  if (search) {
    const q = search.toLowerCase();
    rows = rows.filter(r =>
      r.prop_name?.toLowerCase().includes(q) ||
      r.area?.toLowerCase().includes(q) ||
      r.source?.toLowerCase().includes(q)
    );
  }

  // ソート
  rows = [...rows].sort((a, b) => {
    if (sort === 'price_asc') return parsePriceForSort(a.price) - parsePriceForSort(b.price);
    if (sort === 'price_desc') return parsePriceForSort(b.price) - parsePriceForSort(a.price);
    if (sort === 'area') return (a.area ?? '').localeCompare(b.area ?? '', 'ja');
    return b.id - a.id; // newest
  });

  const total = rows.length;
  const data = rows.slice((page - 1) * limit, page * limit);
  return { data, total };
}

type AreaVerdictCounts = Record<string, { yasui: number; soba: number; takai: number; total: number }>;

function getStatsFromJson(): { sources: Record<string, number>; dates: string[]; total: number; areaCounts: Record<string, number>; areaVerdictCounts: AreaVerdictCounts } {
  const all = getAllFromJson();
  const sources: Record<string, number> = {};
  const dateSet = new Set<string>();
  const areaCounts: Record<string, number> = {};
  const areaVerdictCounts: AreaVerdictCounts = {};

  for (const r of all) {
    sources[r.source] = (sources[r.source] || 0) + 1;
    if (r.date_str) dateSet.add(r.date_str);
    if (r.area) {
      areaCounts[r.area] = (areaCounts[r.area] || 0) + 1;
      if (!areaVerdictCounts[r.area]) areaVerdictCounts[r.area] = { yasui: 0, soba: 0, takai: 0, total: 0 };
      areaVerdictCounts[r.area].total++;
      if (r.verdict === '割安') areaVerdictCounts[r.area].yasui++;
      else if (r.verdict === '割高') areaVerdictCounts[r.area].takai++;
      else if (r.verdict === '相場並み') areaVerdictCounts[r.area].soba++;
    }
  }

  const dates = Array.from(dateSet).sort((a, b) => b.localeCompare(a));
  return { sources, dates, total: all.length, areaCounts, areaVerdictCounts };
}

// ────────────────────────────────────────────────
// SQLite ベース（ローカル開発環境）
// ────────────────────────────────────────────────
let _sqliteMode: boolean | null = null;

function useSqlite(): boolean {
  if (_sqliteMode !== null) return _sqliteMode;
  _sqliteMode = fs.existsSync(DB_PATH);
  return _sqliteMode;
}

const PRICE_NUM = `
  CASE
    WHEN price LIKE '%億%' THEN
      CAST(REPLACE(REPLACE(REPLACE(price,'億円',''),'億',''),',','') AS REAL) * 10000
    WHEN price LIKE '%万円%' THEN
      CAST(REPLACE(REPLACE(REPLACE(price,'万円/月',''),'万円',''),',','') AS REAL)
    ELSE 0
  END
`.trim();

const ORDER_MAP: Record<SortKey, string> = {
  newest:     'id DESC',
  price_asc:  `(${PRICE_NUM}) ASC, id DESC`,
  price_desc: `(${PRICE_NUM}) DESC, id DESC`,
  area:       'area ASC, id DESC',
};

function getPropertiesSqlite(filter: PropertiesFilter): { data: Property[]; total: number } {
  // dynamic require を使って Vercel ビルド時に import されないようにする
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Database = require('better-sqlite3');
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  const db = new Database(DB_PATH);
  db.exec(`
    CREATE TABLE IF NOT EXISTS properties (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source TEXT NOT NULL,
      prop_name TEXT, price TEXT, area TEXT,
      url TEXT UNIQUE, date_str TEXT,
      scraped_at TEXT DEFAULT (datetime('now', '+9 hours')),
      verdict TEXT, verdict_benchmark REAL, verdict_diff REAL
    );
    CREATE INDEX IF NOT EXISTS idx_date ON properties(date_str);
    CREATE INDEX IF NOT EXISTS idx_source ON properties(source);
    CREATE INDEX IF NOT EXISTS idx_verdict ON properties(verdict);
  `);
  // 旧DBにverdict列がない場合に備えてALTER TABLE（エラーは無視）
  for (const col of ['verdict TEXT', 'verdict_benchmark REAL', 'verdict_diff REAL']) {
    try { db.exec(`ALTER TABLE properties ADD COLUMN ${col}`); } catch { /* already exists */ }
  }

  const { source, area, date, period, search, propType, verdict, sort = 'newest', page = 1, limit = 50 } = filter;
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (source)   { conditions.push('source = ?');           params.push(source); }
  if (area)     { conditions.push('area LIKE ?');          params.push(`%${area}%`); }
  if (date)     { conditions.push('date_str = ?');         params.push(date); }
  if (period) {
    const interval = period === '3months' ? '-3 months' : '-1 year';
    conditions.push(`coalesce(scraped_at, date_str) >= date('now', '${interval}')`);
  }
  if (propType) { conditions.push('prop_name LIKE ?');     params.push(`%${propType}%`); }
  if (verdict)  { conditions.push('verdict = ?');          params.push(verdict); }
  if (search) {
    conditions.push('(prop_name LIKE ? OR area LIKE ? OR source LIKE ?)');
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const orderBy = ORDER_MAP[sort] ?? ORDER_MAP.newest;
  const offset = (page - 1) * limit;

  const total = (db.prepare(`SELECT COUNT(*) as cnt FROM properties ${where}`).get(...params) as { cnt: number }).cnt;
  const data = db.prepare(`SELECT * FROM properties ${where} ORDER BY ${orderBy} LIMIT ? OFFSET ?`).all(...params, limit, offset) as Property[];
  return { data, total };
}

function getStatsSqlite(): { sources: Record<string, number>; dates: string[]; total: number; areaCounts: Record<string, number>; areaVerdictCounts: AreaVerdictCounts } {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Database = require('better-sqlite3');
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  const db = new Database(DB_PATH);
  db.exec(`CREATE TABLE IF NOT EXISTS properties (id INTEGER PRIMARY KEY AUTOINCREMENT, source TEXT NOT NULL, prop_name TEXT, price TEXT, area TEXT, url TEXT UNIQUE, date_str TEXT, scraped_at TEXT DEFAULT (datetime('now', '+9 hours')));`);

  const srcRows = db.prepare('SELECT source, COUNT(*) as cnt FROM properties GROUP BY source').all() as { source: string; cnt: number }[];
  const dateRows = db.prepare("SELECT DISTINCT date_str FROM properties WHERE date_str IS NOT NULL ORDER BY date_str DESC LIMIT 30").all() as { date_str: string }[];
  const total = (db.prepare('SELECT COUNT(*) as cnt FROM properties').get() as { cnt: number }).cnt;
  const areaRows = db.prepare("SELECT area, COUNT(*) as cnt FROM properties WHERE area IS NOT NULL AND area != '' GROUP BY area").all() as { area: string; cnt: number }[];
  const verdictRows = db.prepare("SELECT area, verdict, COUNT(*) as cnt FROM properties WHERE area IS NOT NULL AND verdict IS NOT NULL GROUP BY area, verdict").all() as { area: string; verdict: string; cnt: number }[];

  const areaVerdictCounts: AreaVerdictCounts = {};
  for (const r of verdictRows) {
    if (!areaVerdictCounts[r.area]) areaVerdictCounts[r.area] = { yasui: 0, soba: 0, takai: 0, total: 0 };
    if (r.verdict === '割安') areaVerdictCounts[r.area].yasui += r.cnt;
    else if (r.verdict === '割高') areaVerdictCounts[r.area].takai += r.cnt;
    else if (r.verdict === '相場並み') areaVerdictCounts[r.area].soba += r.cnt;
    areaVerdictCounts[r.area].total += r.cnt;
  }

  return {
    sources: Object.fromEntries(srcRows.map(r => [r.source, r.cnt])),
    dates: dateRows.map(r => r.date_str),
    total,
    areaCounts: Object.fromEntries(areaRows.map(r => [r.area, r.cnt])),
    areaVerdictCounts,
  };
}

// ────────────────────────────────────────────────
// 公開 API（自動切り替え）
// ────────────────────────────────────────────────
export function getProperties(filter: PropertiesFilter = {}): { data: Property[]; total: number } {
  if (useSqlite()) return getPropertiesSqlite(filter);
  return filterAndSort(getAllFromJson(), filter);
}

export function getStats(): { sources: Record<string, number>; dates: string[]; total: number; areaCounts: Record<string, number> } {
  if (useSqlite()) return getStatsSqlite();
  return getStatsFromJson();
}
