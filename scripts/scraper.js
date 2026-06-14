/**
 * 沖縄不動産 新着物件自動巡回スクレイパー
 * 対象: うちなーらいふ / goohome / すまいずむ
 * 出力: data/properties.db (SQLite) + data/okinawa_all_new_properties.csv
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

// データディレクトリ
const DATA_DIR = path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

// SQLite初期化
const DB_PATH = path.join(DATA_DIR, 'properties.db');
const db = new Database(DB_PATH);

db.exec(`
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

// 本日の日付
const today = new Date();
const YEAR_SHORT = String(today.getFullYear()).slice(2);
const MONTH = String(today.getMonth() + 1).padStart(2, '0');
const DAY = String(today.getDate()).padStart(2, '0');
const TODAY_STR = `${YEAR_SHORT}${MONTH}${DAY}`;
const TODAY_FULL = `20${YEAR_SHORT}-${MONTH}-${DAY}`;

console.log(`🗓️  本日: ${TODAY_FULL} (新着識別子: ${TODAY_STR})`);

// 沖縄の市区町村
const OKINAWA_AREAS = [
  '那覇市','糸満市','豊見城市','南城市','八重瀬町','与那原町','西原町',
  '浦添市','宜野湾市','沖縄市','北中城村','中城村','北谷町','読谷村',
  '嘉手納町','うるま市','恩納村','宜野座村','金武町','名護市','今帰仁村',
  '本部町','大宜味村','国頭村','東村','石垣市','竹富町','与那国町',
  '宮古島市','多良間村','渡名喜村','伊平屋村','伊是名村','座間味村',
  '渡嘉敷村','粟国村','南大東村','北大東村','伊江村',
];

function csvEscape(val) {
  if (val == null) return '';
  const s = String(val).replace(/\r?\n/g, ' ').trim();
  if (s.includes(',') || s.includes('"')) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

// ─── うちなーらいふ ─────────────────────────────────────────────
async function scrapeUchina(context) {
  const page = await context.newPage();
  const results = [];
  console.log('\n🏠 うちなーらいふ 巡回中...');
  try {
    await page.goto('https://www.e-uchina.net/list_all', { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(3000);
    const cards = await page.evaluate(({ todayStr, areas }) => {
      const data = [];
      for (const card of document.querySelectorAll('.card')) {
        const linkEl = card.querySelector('a[href*="/detail.html"]') || card.querySelector('a[href*="/bukken/"]');
        const url = linkEl ? linkEl.href : '';
        if (!url.includes(todayStr) && !card.querySelector('img[src*="new"]')) continue;
        const typeEl = card.querySelector('.bukken-type');
        const propType = typeEl ? typeEl.textContent.trim() : '';
        const priceEl = card.querySelector('.bukken-data-price');
        let price = priceEl ? priceEl.textContent.replace(/\s+/g, '').replace(/お気に入り.*/, '').trim() : '';
        if (!price) { const pm = card.textContent.match(/([\d,]+(?:\.\d+)?万円)/); price = pm ? pm[1] : '価格不明'; }
        const madoriEl = card.querySelector('.bukken-data-madori');
        let madori = '';
        if (madoriEl) { const m = madoriEl.textContent.match(/\d[SLDK]+/); madori = m ? m[0] : ''; }
        const areaEl = card.querySelector('.bukken-data-address');
        let area = '';
        if (areaEl) {
          const t = areaEl.textContent.trim();
          for (const a of areas) { if (t.includes(a)) { area = a; break; } }
          if (!area) area = t.replace(/お気に入り.*/, '').trim().substring(0, 20);
        }
        data.push({ propName: [propType, madori].filter(Boolean).join(' ') || '物件', price, area, url });
      }
      return data;
    }, { todayStr: TODAY_STR, areas: OKINAWA_AREAS });
    results.push(...cards.map(c => ({ source: 'うちなーらいふ', propName: c.propName, price: c.price || '価格不明', area: c.area || 'エリア不明', url: c.url })));
    console.log(`  ✅ ${results.length}件`);
  } catch (e) { console.error('  ❌ うちなーらいふ:', e.message); }
  finally { await page.close(); }
  return results;
}

// ─── goohome ────────────────────────────────────────────────────
async function scrapeGoohome(context) {
  const page = await context.newPage();
  const results = [];
  console.log('\n🏡 goohome 巡回中...');
  try {
    await page.goto('https://goohome.jp/', { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(3000);
    const cards = await page.evaluate((areas) => {
      const data = [], seen = new Set();
      for (const el of document.querySelectorAll('.simple_estate_caset')) {
        const typeEl = el.querySelector('.estate_type');
        const propType = typeEl ? typeEl.textContent.trim() : '';
        const linkEl = el.querySelector('a[href]');
        if (!linkEl) continue;
        const href = linkEl.getAttribute('href') || '';
        const url = href.startsWith('http') ? href : 'https://goohome.jp' + href;
        if (seen.has(url)) continue; seen.add(url);
        const lines = el.textContent.trim().split('\n').map(l => l.trim()).filter(l => l.length > 0);
        const infoLine = lines.find(l => /万円/.test(l)) || '';
        const priceMatch = infoLine.match(/([\d,]+(?:\.\d+)?万円(?:\/月)?)/);
        const price = priceMatch ? priceMatch[1] : '価格不明';
        let area = '';
        if (priceMatch) {
          const before = infoLine.substring(0, infoLine.indexOf(priceMatch[1]));
          for (const a of areas) { if (before.includes(a)) { area = a; break; } }
          if (!area) area = before.trim();
        }
        const madoriMatch = infoLine.match(/([１２３４５\d][SLDK１２３４５]+)/);
        const madori = madoriMatch ? madoriMatch[1].substring(0, 6) : '';
        data.push({ propName: [propType, madori].filter(Boolean).join(' ') || '不動産物件', price, area: area || 'エリア不明', url });
      }
      return data;
    }, OKINAWA_AREAS);
    results.push(...cards.map(c => ({ source: 'goohome', ...c })));
    console.log(`  ✅ ${results.length}件`);
  } catch (e) { console.error('  ❌ goohome:', e.message); }
  finally { await page.close(); }
  return results;
}

// ─── すまいずむ ─────────────────────────────────────────────────
async function scrapeSumaism(context) {
  const page = await context.newPage();
  const results = [];
  console.log('\n🏘️  すまいずむ 巡回中...');
  try {
    await page.goto('http://www.sumaism.net/chintai/', { waitUntil: 'networkidle', timeout: 40000 });
    await page.waitForTimeout(5000);
    const items = await page.evaluate((areas) => {
      const data = [];
      for (const row of document.querySelectorAll('table tr')) {
        const cells = Array.from(row.querySelectorAll('td'));
        if (cells.length < 7) continue;
        const priceCell = cells[2] ? cells[2].textContent.trim() : '';
        if (!priceCell || !/万円/.test(priceCell)) continue;
        const nameCell = cells[1] ? cells[1].textContent.trim().replace(/\s+/g, '') : '';
        let area = '', propName = nameCell;
        for (const a of areas) { if (propName.includes(a)) { area = a; propName = propName.replace(a, '').trim(); break; } }
        const priceMatch = priceCell.match(/([\d.]+万円)/);
        const price = priceMatch ? priceMatch[1] : priceCell;
        const madori = cells[3] ? cells[3].textContent.trim() : '';
        const linkEl = row.querySelector('a[href^="javascript:js_FormOpen"]');
        let url = '';
        if (linkEl) {
          const m = linkEl.getAttribute('href').match(/js_FormOpen\((\d+),\s*"([^"]+)",\s*(\d+)\)/);
          if (m) url = `http://www.sumaism.net/chintai/detail01.aspx?flg_out=1&iNo=${m[1]}&LNO=${m[2]}&mUser=${m[3]}`;
        }
        if (propName || area) {
          data.push({ propName: [propName, madori].filter(Boolean).join(' ') || '物件', price, area: area || 'エリア不明', url: url || 'http://www.sumaism.net/chintai/' });
        }
      }
      return data;
    }, OKINAWA_AREAS);
    results.push(...items.slice(0, 20).map(c => ({ source: 'すまいずむ', ...c })));
    console.log(`  ✅ ${results.length}件`);
  } catch (e) { console.error('  ❌ すまいずむ:', e.message); }
  finally { await page.close(); }
  return results;
}

// ─── メイン ──────────────────────────────────────────────────────
async function main() {
  console.log('===========================================');
  console.log('  沖縄不動産 新着物件自動巡回スクレイパー');
  console.log('===========================================');

  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36',
    locale: 'ja-JP',
  });

  let all = [];
  try {
    const [r1, r2, r3] = await Promise.allSettled([
      scrapeUchina(context), scrapeGoohome(context), scrapeSumaism(context),
    ]);
    if (r1.status === 'fulfilled') all.push(...r1.value);
    if (r2.status === 'fulfilled') all.push(...r2.value);
    if (r3.status === 'fulfilled') all.push(...r3.value);
  } finally {
    await browser.close();
  }

  // SQLiteに保存（当日データをupsert）
  const insert = db.prepare(`
    INSERT INTO properties (source, prop_name, price, area, url, date_str)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(url) DO UPDATE SET
      source=excluded.source, prop_name=excluded.prop_name,
      price=excluded.price, area=excluded.area, date_str=excluded.date_str,
      scraped_at=datetime('now', '+9 hours')
  `);
  const insertMany = db.transaction((rows) => {
    let count = 0;
    for (const r of rows) {
      try {
        insert.run(r.source, r.propName, r.price, r.area, r.url || r.source + '_' + Date.now() + Math.random(), TODAY_FULL);
        count++;
      } catch {}
    }
    return count;
  });
  const saved = insertMany(all);

  // CSVにも出力
  const csvPath = path.join(DATA_DIR, 'okinawa_all_new_properties.csv');
  const header = '情報元,物件名,価格,エリア,詳細URL';
  const rows = all.map(r => [csvEscape(r.source), csvEscape(r.propName), csvEscape(r.price), csvEscape(r.area), csvEscape(r.url)].join(','));
  fs.writeFileSync(csvPath, '﻿' + header + '\n' + rows.join('\n'), 'utf8');

  // Vercel用 JSON も出力（DBから全件取得してソート）
  const jsonPath = path.join(DATA_DIR, 'properties.json');
  const allRows = db.prepare('SELECT * FROM properties ORDER BY id DESC').all();
  fs.writeFileSync(jsonPath, JSON.stringify(allRows, null, 2), 'utf8');

  // サマリー
  console.log('\n===========================================');
  console.log('📊 結果');
  const srcs = {};
  all.forEach(r => { srcs[r.source] = (srcs[r.source] || 0) + 1; });
  Object.entries(srcs).forEach(([s, c]) => console.log(`  ${s}: ${c}件`));
  console.log(`  合計: ${all.length}件 (DB保存: ${saved}件)`);
  console.log(`✅ DB: ${DB_PATH}`);
  console.log(`✅ CSV: ${csvPath}`);
  console.log(`✅ JSON: ${jsonPath}`);
}

main().catch(e => { console.error('🚨', e.message); process.exit(1); });
