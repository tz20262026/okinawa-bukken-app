/**
 * goohome.jp 沖縄 bulk スクレイパー
 * estate_incaset クラスを使って売買・賃貸物件を100件以上取得
 */
const { chromium } = require('playwright');
const fs   = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const DATA_DIR  = path.join(__dirname, '..', 'data');
const DB_PATH   = path.join(DATA_DIR, 'properties.db');
const JSON_PATH = path.join(DATA_DIR, 'properties.json');

// market.ts と同一のデータ・ロジック
const MARKET_2026 = {
  '那覇市':    { rent: 6.8,  sale: 4200, land: 2800 },
  '浦添市':    { rent: 6.0,  sale: 3600, land: 2200 },
  '豊見城市':  { rent: 5.8,  sale: 3400, land: 2000 },
  '宜野湾市':  { rent: 6.0,  sale: 3800, land: 2400 },
  '北谷町':    { rent: 6.5,  sale: 4000, land: 2600 },
  '嘉手納町':  { rent: 5.5,  sale: 3000, land: 1800 },
  '沖縄市':    { rent: 5.5,  sale: 3200, land: 1800 },
  'うるま市':  { rent: 5.0,  sale: 2800, land: 1600 },
  '北中城村':  { rent: 5.2,  sale: 3000, land: 1800 },
  '中城村':    { rent: 5.0,  sale: 2800, land: 1600 },
  '読谷村':    { rent: 5.2,  sale: 3000, land: 1800 },
  '西原町':    { rent: 5.5,  sale: 3000, land: 1800 },
  '与那原町':  { rent: 5.5,  sale: 3000, land: 1700 },
  '南城市':    { rent: 5.0,  sale: 2600, land: 1400 },
  '糸満市':    { rent: 5.0,  sale: 2800, land: 1600 },
  '八重瀬町':  { rent: 4.8,  sale: 2600, land: 1400 },
  '恩納村':    { rent: 5.5,  sale: 3200, land: 2000 },
  '名護市':    { rent: 4.8,  sale: 2600, land: 1400 },
  '石垣市':    { rent: 5.5,  sale: 3200, land: 1800 },
  '宮古島市':  { rent: 5.5,  sale: 3400, land: 2000 },
};

const OKINAWA_AREAS = Object.keys(MARKET_2026).concat([
  '宜野座村','金武町','今帰仁村','本部町','大宜味村','国頭村','東村','伊江村',
  '竹富町','与那国町','多良間村','座間味村','渡嘉敷村','伊平屋村','伊是名村',
]);

const CITY_SLUGS = [
  { slug: 'naha',       area: '那覇市' },
  { slug: 'urasoe',     area: '浦添市' },
  { slug: 'ginowan',    area: '宜野湾市' },
  { slug: 'chatan',     area: '北谷町' },
  { slug: 'okinawa',    area: '沖縄市' },
  { slug: 'uruma',      area: 'うるま市' },
  { slug: 'itoman',     area: '糸満市' },
  { slug: 'tomigusuku', area: '豊見城市' },
  { slug: 'nanjo',      area: '南城市' },
  { slug: 'yomitan',    area: '読谷村' },
  { slug: 'nishihara',  area: '西原町' },
  { slug: 'nago',       area: '名護市' },
];

function parsePriceMan(price) {
  if (!price || price === '価格不明') return null;
  const s = price.replace(/,/g, '').replace(/\s/g, '');
  const m1 = s.match(/(\d+(?:\.\d+)?)億(\d+(?:\.\d+)?)万/);
  if (m1) return parseFloat(m1[1]) * 10000 + parseFloat(m1[2]);
  const m2 = s.match(/(\d+(?:\.\d+)?)億/);
  if (m2) return parseFloat(m2[1]) * 10000;
  const m3 = s.match(/(\d+(?:\.\d+)?)万/);
  if (m3) return parseFloat(m3[1]);
  return null;
}

function calcVerdict(propName, price, area) {
  const m = MARKET_2026[area];
  if (!m) return { verdict: null, verdict_benchmark: null, verdict_diff: null };
  const priceNum = parsePriceMan(price);
  if (priceNum === null) return { verdict: null, verdict_benchmark: null, verdict_diff: null };
  const isRent = /賃貸|\/月|アパート|マンション|貸間/.test((propName || '') + (price || '')) ||
                 /\/月/.test(price || '');
  const isLand = /土地/.test(propName || '');
  const benchmark = isRent ? m.rent : isLand ? m.land : m.sale;
  const diff = ((priceNum - benchmark) / benchmark) * 100;
  const verdict = diff <= -15 ? '割安' : diff >= 15 ? '割高' : '相場並み';
  return { verdict, verdict_benchmark: benchmark, verdict_diff: Math.round(diff * 100) / 100 };
}

// 1ページ分の estate_incaset カードを取得
async function scrapePage(page, cityInfo, propType) {
  return page.evaluate(({ areas, cityArea, propType }) => {
    const data = [];
    const cards = document.querySelectorAll('.estate_incaset, .simple_estate_caset');
    for (const card of cards) {
      const linkEl = card.querySelector('a[href]');
      if (!linkEl) continue;
      const href = linkEl.getAttribute('href') || '';
      const url  = href.startsWith('http') ? href : 'https://goohome.jp' + href;
      if (!url || url === 'https://goohome.jp') continue;

      const text = (card.innerText || '').replace(/\s+/g, ' ').trim();

      // 価格
      const pm = text.match(/(\d+億(?:[\d,]+万)?円|[\d,]+(?:\.\d+)?万円(?:\/月)?)/);
      if (!pm) continue;
      const price = pm[1];

      // エリア（テキストから判定 → fallback to city）
      let area = cityArea;
      for (const a of areas) {
        if (text.includes(a)) { area = a; break; }
      }

      // 間取り
      const mm = text.match(/([１２３４５\d][SLDK１２３４５LDKsldkスーリーフォー]+)/);
      const madori = mm ? mm[1].replace(/[１２３４５]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0)).substring(0, 6) : '';

      // 物件名（タイトル的テキスト）
      const titleEl = card.querySelector('.prop_title, h3, h4, .title');
      let propName = titleEl ? titleEl.textContent.trim() : '';
      if (!propName) propName = [propType, area, madori].filter(Boolean).join(' ').trim() || '不動産物件';

      data.push({ propName, price, area, url });
    }
    return data;
  }, { areas: OKINAWA_AREAS, cityArea: cityInfo.area, propType });
}

async function scrapeCity(ctx, cityInfo, propType, seen) {
  const results = [];
  const typeSlug = propType === '戸建て' ? 'kodate' : 'chintai/mansion';

  for (let pg = 1; pg <= 5; pg++) {
    const url = `https://goohome.jp/${typeSlug}/${cityInfo.slug}/?page=${pg}-20`;
    const page = await ctx.newPage();
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 25000 });
      await page.waitForTimeout(2000);

      // 実際にカードが存在するか確認
      const cardCount = await page.evaluate(() =>
        document.querySelectorAll('.estate_incaset, .simple_estate_caset').length
      );
      if (cardCount === 0) {
        console.log(`  ${cityInfo.area} ${propType} pg${pg}: カードなし → 終了`);
        break;
      }

      const items = await scrapePage(page, cityInfo, propType);
      let added = 0;
      for (const item of items) {
        if (!seen.has(item.url)) {
          seen.add(item.url);
          results.push(item);
          added++;
        }
      }
      console.log(`  ${cityInfo.area} ${propType} pg${pg}: ${items.length}件取得 +${added} 累計${results.length}件`);
      if (items.length < 5) break;  // 最終ページ
    } catch (e) {
      console.error(`  ${cityInfo.area} ${propType} pg${pg} エラー:`, e.message);
      break;
    } finally {
      await page.close();
    }
  }
  return results;
}

async function main() {
  console.log('🏡 goohome bulk スクレイプ開始...');

  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const ctx = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36',
    locale: 'ja-JP',
  });

  const seen = new Set();
  const allNew = [];

  // 既存URLを seen に追加
  const db = new Database(DB_PATH);
  const existingUrls = db.prepare("SELECT url FROM properties WHERE source='goohome'").all();
  for (const r of existingUrls) seen.add(r.url);
  console.log(`既存 goohome URL: ${existingUrls.length}件`);

  try {
    for (const city of CITY_SLUGS) {
      if (allNew.length >= 120) break;  // 120件で打ち切り

      const [kotateItems, chintaiItems] = await Promise.allSettled([
        scrapeCity(ctx, city, '戸建て', seen),
        scrapeCity(ctx, city, '賃貸', seen),
      ]);
      if (kotateItems.status === 'fulfilled') allNew.push(...kotateItems.value);
      if (chintaiItems.status === 'fulfilled') allNew.push(...chintaiItems.value);

      console.log(`📍 ${city.area} 完了 / 新規累計: ${allNew.length}件`);
    }
  } finally {
    await browser.close();
  }

  console.log(`\n新規取得: ${allNew.length}件`);
  if (allNew.length === 0) {
    console.log('⚠️ 取得件数0件 - スクレイプに失敗した可能性あり');
    return;
  }

  // verdict 列が存在しない場合のみ追加（IF NOT EXISTS は SQLite 非対応なので try/catch で対応）
  ['verdict TEXT', 'verdict_benchmark REAL', 'verdict_diff REAL'].forEach(col => {
    try { db.exec(`ALTER TABLE properties ADD COLUMN ${col}`); } catch {}
  });

  const insert = db.prepare(`
    INSERT INTO properties (source, prop_name, price, area, url, date_str)
    VALUES (?, ?, ?, ?, ?, '')
    ON CONFLICT(url) DO UPDATE SET
      prop_name=excluded.prop_name, price=excluded.price, area=excluded.area,
      scraped_at=datetime('now', '+9 hours')
  `);
  const insertMany = db.transaction(rows => {
    let count = 0;
    for (const r of rows) {
      try { insert.run('goohome', r.propName, r.price, r.area, r.url); count++; }
      catch {}
    }
    return count;
  });
  const saved = insertMany(allNew);
  console.log(`DB追記: ${saved}件`);

  // 全件 verdict 再計算 → JSON 更新
  const allRows = db.prepare('SELECT * FROM properties ORDER BY id DESC').all();
  const rowsWithVerdict = allRows.map(r => {
    const v = calcVerdict(r.prop_name || '', r.price || '', r.area || '');
    return { ...r, verdict: v.verdict, verdict_benchmark: v.verdict_benchmark, verdict_diff: v.verdict_diff };
  });
  fs.writeFileSync(JSON_PATH, JSON.stringify(rowsWithVerdict, null, 2), 'utf8');

  const srcs = {};
  rowsWithVerdict.forEach(r => { srcs[r.source] = (srcs[r.source] || 0) + 1; });
  console.log('\n📊 最終結果:');
  Object.entries(srcs).forEach(([s, c]) => console.log(`  ${s}: ${c}件`));
  console.log(`  合計: ${rowsWithVerdict.length}件`);

  const vc = { '割安': 0, '相場並み': 0, '割高': 0, null: 0 };
  rowsWithVerdict.forEach(r => { vc[r.verdict ?? 'null']++; });
  console.log(`  verdict: 割安${vc['割安']} / 相場並み${vc['相場並み']} / 割高${vc['割高']} / null${vc['null']}`);
  console.log('✅ 完了');
}

main().catch(e => { console.error('🚨', e); process.exit(1); });
