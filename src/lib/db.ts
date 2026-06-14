import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const DATA_DIR = path.join(process.cwd(), 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const DB_PATH = path.join(DATA_DIR, 'properties.db');

let _db: Database.Database | null = null;

function getDb(): Database.Database {
  if (!_db) {
    _db = new Database(DB_PATH);
    _db.exec(`
      CREATE TABLE IF NOT EXISTS properties (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        source TEXT NOT NULL,
        prop_name TEXT,
        price TEXT,
        area TEXT,
        url TEXT UNIQUE,
        date_str TEXT,
        scraped_at TEXT DEFAULT (datetime('now', '+9 hours'))
      );
      CREATE INDEX IF NOT EXISTS idx_date ON properties(date_str);
      CREATE INDEX IF NOT EXISTS idx_source ON properties(source);
    `);
  }
  return _db;
}

export type Property = {
  id: number;
  source: string;
  prop_name: string;
  price: string;
  area: string;
  url: string;
  date_str: string;
  scraped_at: string;
};

export type SortKey = 'newest' | 'price_asc' | 'price_desc' | 'area';

export type PropertiesFilter = {
  source?: string;
  area?: string;
  date?: string;
  search?: string;
  propType?: string;
  sort?: SortKey;
  page?: number;
  limit?: number;
};

// 価格テキスト→万円単位の数値に変換するSQL式
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

export function getProperties(filter: PropertiesFilter = {}): { data: Property[]; total: number } {
  const db = getDb();
  const { source, area, date, search, propType, sort = 'newest', page = 1, limit = 50 } = filter;

  const conditions: string[] = [];
  const params: unknown[] = [];

  if (source) { conditions.push('source = ?'); params.push(source); }
  if (area) { conditions.push('area LIKE ?'); params.push(`%${area}%`); }
  if (date) { conditions.push('date_str = ?'); params.push(date); }
  if (propType) { conditions.push('prop_name LIKE ?'); params.push(`%${propType}%`); }
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

export function getStats(): { sources: Record<string, number>; dates: string[]; total: number; areaCounts: Record<string, number> } {
  const db = getDb();
  const srcRows = db.prepare('SELECT source, COUNT(*) as cnt FROM properties GROUP BY source').all() as { source: string; cnt: number }[];
  const dateRows = db.prepare("SELECT DISTINCT date_str FROM properties WHERE date_str IS NOT NULL ORDER BY date_str DESC LIMIT 30").all() as { date_str: string }[];
  const total = (db.prepare('SELECT COUNT(*) as cnt FROM properties').get() as { cnt: number }).cnt;
  const areaRows = db.prepare("SELECT area, COUNT(*) as cnt FROM properties WHERE area IS NOT NULL AND area != '' GROUP BY area").all() as { area: string; cnt: number }[];

  return {
    sources: Object.fromEntries(srcRows.map(r => [r.source, r.cnt])),
    dates: dateRows.map(r => r.date_str),
    total,
    areaCounts: Object.fromEntries(areaRows.map(r => [r.area, r.cnt])),
  };
}
