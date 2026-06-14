/**
 * 沖縄不動産 一括スクレイパー（最大500件）
 * 日付フィルターなし・ページネーション対応
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const DATA_DIR = path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const DB_PATH = path.join(DATA_DIR, 'properties.db');
const db = new Database(DB_PATH);

db.exec(`
  CREATE TABLE IF NOT EXISTS properties (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source TEXT NOT NULL,
    prop_name TEXT, price TEXT, area TEXT,
    url TEXT UNIQUE, date_str TEXT,
    scraped_at TEXT DEFAULT (datetime('now', '+9 hours'))
  );
  CREATE INDEX IF NOT EXISTS idx_date ON properties(date_str);
  CREATE INDEX IF NOT EXISTS idx_source ON properties(source);
`);

const MAX_TOTAL = 500;

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

// ─── うちなーらいふ（全ページ）────────────────────────────────
async function scrapeUchinaAll(context, maxItems) {
  const results = [];
  const seen = new Set();
  console.log('\n🏠 うちなーらいふ 全件巡回中...');

  for (let pageNum = 1; pageNum <= 15; pageNum++) {
    if (results.length >= maxItems) break;
    const page = await context.newPage();
    try {
      const url = pageNum === 1
        ? 'https://www.e-uchina.net/list_all'
        : `https://www.e-uchina.net/list_all?page=${pageNum}`;
      await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
      await page.waitForTimeout(2000);

      const cards = await page.evaluate((areas) => {
        const data = [];
        for (const card of document.querySelectorAll('.card')) {
          const linkEl = card.querySelector('a[href*="/detail.html"]') || card.querySelector('a[href*="/bukken/"]');
          const url = linkEl ? linkEl.href : '';
          if (!url) continue;
          const typeEl = card.querySelector('.bukken-type');
          const propType = typeEl ? typeEl.textContent.trim() : '';
          const priceEl = card.querySelector('.bukken-data-price');
          let price = priceEl ? priceEl.textContent.replace(/\s+/g, '').replace(/お気に入り.*/, '').trim() : '';
          if (!price) { const pm = card.textContent.match(/(\d+億(?:[\d,]+万)?円|[\d,]+(?:\.\d+)?万円)/); price = pm ? pm[1] : '価格不明'; }
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
          // URLから日付を抽出（例: 260614）
          const dateMatch = url.match(/[a-z]-(\d{6})-/);
          const dateStr = dateMatch ? `20${dateMatch[1].slice(0,2)}-${dateMatch[1].slice(2,4)}-${dateMatch[1].slice(4,6)}` : '';
          data.push({ propName: [propType, madori].filter(Boolean).join(' ') || '物件', price, area, url, dateStr });
        }
        return data;
      }, OKINAWA_AREAS);

      if (cards.length === 0) { console.log(`  ページ${pageNum}: 0件 → 終了`); break; }

      for (const c of cards) {
        if (!seen.has(c.url)) {
          seen.add(c.url);
          results.push({ source: 'うちなーらいふ', propName: c.propName, price: c.price || '価格不明', area: c.area || 'エリア不明', url: c.url, dateStr: c.dateStr });
        }
        if (results.length >= maxItems) break;
      }
      console.log(`  ページ${pageNum}: ${cards.length}件 → 累計${results.length}件`);

      // 次ページの存在確認
      const hasNext = await page.evaluate(() => {
        const next = document.querySelector('a[href*="page="], .pagination .next, a.next');
        return !!next;
      });
      if (!hasNext && pageNum > 1) { console.log(`  次ページなし → 終了`); break; }
    } catch (e) { console.error(`  ページ${pageNum} エラー:`, e.message); break; }
    finally { await page.close(); }
  }

  console.log(`  ✅ うちなーらいふ 合計 ${results.length}件`);
  return results;
}

// ─── goohome（賃貸・売買・全ページ）────────────────────────────
async function scrapeGoohomeAll(context, maxItems) {
  const results = [];
  const seen = new Set();
  console.log('\n🏡 goohome 全件巡回中...');

  const urls = [
    'https://goohome.jp/chintai/',
    'https://goohome.jp/kodate/',
    'https://goohome.jp/mansion/',
    'https://goohome.jp/',
  ];

  for (const startUrl of urls) {
    if (results.length >= maxItems) break;
    for (let pageNum = 1; pageNum <= 5; pageNum++) {
      if (results.length >= maxItems) break;
      const page = await context.newPage();
      try {
        const url = pageNum === 1 ? startUrl : `${startUrl}?page=${pageNum}`;
        await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
        await page.waitForTimeout(2000);

        const cards = await page.evaluate((areas) => {
          const data = [], seenUrls = new Set();
          for (const el of document.querySelectorAll('.simple_estate_caset, .estate_list_item, [class*="estate"]')) {
            const typeEl = el.querySelector('.estate_type, [class*="type"]');
            const propType = typeEl ? typeEl.textContent.trim() : '';
            const linkEl = el.querySelector('a[href]');
            if (!linkEl) continue;
            const href = linkEl.getAttribute('href') || '';
            const url = href.startsWith('http') ? href : 'https://goohome.jp' + href;
            if (seenUrls.has(url) || !href.includes('/')) continue;
            seenUrls.add(url);
            const lines = el.textContent.trim().split('\n').map(l => l.trim()).filter(l => l.length > 0);
            const infoLine = lines.find(l => /[億万]円/.test(l)) || '';
            const priceMatch = infoLine.match(/(\d+億(?:[\d,]+万)?円|[\d,]+(?:\.\d+)?万円(?:\/月)?)/);
            const price = priceMatch ? priceMatch[1] : '価格不明';
            let area = '';
            if (priceMatch) {
              const before = infoLine.substring(0, infoLine.indexOf(priceMatch[1]));
              for (const a of areas) { if (before.includes(a)) { area = a; break; } }
              if (!area) area = before.trim().substring(0, 10);
            }
            const madoriMatch = infoLine.match(/([１２３４５\d][SLDK１２３４５LDK]+)/);
            const madori = madoriMatch ? madoriMatch[1].substring(0, 6) : '';
            if (price === '価格不明' && !madori) continue;
            data.push({ propName: [propType, madori].filter(Boolean).join(' ') || '不動産物件', price, area: area || 'エリア不明', url });
          }
          return data;
        }, OKINAWA_AREAS);

        if (cards.length === 0) break;
        for (const c of cards) {
          if (!seen.has(c.url)) {
            seen.add(c.url);
            results.push({ source: 'goohome', ...c, dateStr: '' });
          }
          if (results.length >= maxItems) break;
        }
        console.log(`  ${startUrl} ページ${pageNum}: ${cards.length}件 → 累計${results.length}件`);
      } catch (e) { console.error(`  goohome ${startUrl} エラー:`, e.message); break; }
      finally { await page.close(); }
    }
  }

  console.log(`  ✅ goohome 合計 ${results.length}件`);
  return results;
}

// ─── すまいずむ（全件）──────────────────────────────────────────
async function scrapeSumaismAll(context, maxItems) {
  const results = [];
  console.log('\n🏘️  すまいずむ 全件巡回中...');
  const page = await context.newPage();
  try {
    await page.goto('http://www.sumaism.net/chintai/', { waitUntil: 'networkidle', timeout: 40000 });
    await page.waitForTimeout(5000);
    const items = await page.evaluate((areas) => {
      const data = [];
      for (const row of document.querySelectorAll('table tr')) {
        const cells = Array.from(row.querySelectorAll('td'));
        if (cells.length < 7) continue;
        const priceCell = cells[2] ? cells[2].textContent.trim() : '';
        if (!priceCell || !/[億万]円/.test(priceCell)) continue;
        const nameCell = cells[1] ? cells[1].textContent.trim().replace(/\s+/g, '') : '';
        let area = '', propName = nameCell;
        for (const a of areas) { if (propName.includes(a)) { area = a; propName = propName.replace(a, '').trim(); break; } }
        const priceMatch = priceCell.match(/(\d+億(?:[\d,]+万)?円|[\d.]+万円)/);
        const price = priceMatch ? priceMatch[1] : priceCell;
        const madori = cells[3] ? cells[3].textContent.trim() : '';
        const linkEl = row.querySelector('a[href^="javascript:js_FormOpen"]');
        let url = '';
        if (linkEl) {
          const m = linkEl.getAttribute('href').match(/js_FormOpen\((\d+),\s*"([^"]+)",\s*(\d+)\)/);
          if (m) url = `http://www.sumaism.net/chintai/detail01.aspx?flg_out=1&iNo=${m[1]}&LNO=${m[2]}&mUser=${m[3]}`;
        }
        if (propName || area) {
          data.push({ propName: [propName, madori].filter(Boolean).join(' ') || '物件', price, area: area || 'エリア不明', url: url || '' });
        }
      }
      return data;
    }, OKINAWA_AREAS);

    const limited = items.slice(0, maxItems);
    results.push(...limited.map(c => ({ source: 'すまいずむ', ...c, dateStr: '' })));
    console.log(`  ✅ すまいずむ 合計 ${results.length}件`);
  } catch (e) { console.error('  ❌ すまいずむ:', e.message); }
  finally { await page.close(); }
  return results;
}

// ─── メイン ────────────────────────────────────────────────────
async function main() {
  console.log('==============================================');
  console.log('  沖縄不動産 一括スクレイパー（最大500件）');
  console.log('==============================================');

  // 既存件数を確認
  const existing = (db.prepare('SELECT COUNT(*) as cnt FROM properties').get()).cnt;
  console.log(`\n既存DB件数: ${existing}件`);
  const remaining = MAX_TOTAL - existing;
  if (remaining <= 0) {
    console.log('✅ すでに500件以上あります。終了します。');
    process.exit(0);
  }
  console.log(`追加可能件数: ${remaining}件`);

  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36',
    locale: 'ja-JP',
  });

  let all = [];
  try {
    // 各サイトから取得（合計が500件を超えないよう按分）
    const perSite = Math.ceil(remaining / 3);
    const [r1, r2, r3] = await Promise.allSettled([
      scrapeUchinaAll(context, perSite * 2),   // うちなーらいふは多め
      scrapeGoohomeAll(context, perSite),
      scrapeSumaismAll(context, perSite),
    ]);
    if (r1.status === 'fulfilled') all.push(...r1.value);
    if (r2.status === 'fulfilled') all.push(...r2.value);
    if (r3.status === 'fulfilled') all.push(...r3.value);
  } finally {
    await browser.close();
  }

  // 重複排除・上限チェック
  const seen = new Set();
  const deduped = all.filter(r => {
    if (!r.url || seen.has(r.url)) return false;
    seen.add(r.url);
    return true;
  });
  const toAdd = deduped.slice(0, remaining);

  // DB保存
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
        insert.run(r.source, r.propName || r.prop_name, r.price, r.area, r.url || (r.source + '_' + Date.now() + Math.random()), r.dateStr || '');
        count++;
      } catch {}
    }
    return count;
  });
  const saved = insertMany(toAdd);

  // JSON更新
  const jsonPath = path.join(DATA_DIR, 'properties.json');
  const allRows = db.prepare('SELECT * FROM properties ORDER BY id DESC').all();
  fs.writeFileSync(jsonPath, JSON.stringify(allRows, null, 2), 'utf8');

  // CSV更新
  const csvPath = path.join(DATA_DIR, 'okinawa_all_new_properties.csv');
  const csvHeader = '情報元,物件名,価格,エリア,詳細URL';
  const csvRows = allRows.map(r => [csvEscape(r.source), csvEscape(r.prop_name), csvEscape(r.price), csvEscape(r.area), csvEscape(r.url)].join(','));
  fs.writeFileSync(csvPath, '﻿' + csvHeader + '\n' + csvRows.join('\n'), 'utf8');

  // サマリー
  const total = (db.prepare('SELECT COUNT(*) as cnt FROM properties').get()).cnt;
  const srcs = {};
  allRows.forEach(r => { srcs[r.source] = (srcs[r.source] || 0) + 1; });

  console.log('\n==============================================');
  console.log('📊 最終結果');
  Object.entries(srcs).forEach(([s, c]) => console.log(`  ${s}: ${c}件`));
  console.log(`  DB総件数: ${total}件 (今回追加: ${saved}件)`);
  console.log(`✅ JSON: ${jsonPath}`);
  console.log(`✅ CSV: ${csvPath}`);
}

main().catch(e => { console.error('🚨', e.message); process.exit(1); });
