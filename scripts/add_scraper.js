/**
 * goohome / すまいずむ 追加スクレイパー（正確な構造対応版）
 * 取得データを DB + JSON に追記する
 */
const { chromium } = require('playwright');
const fs   = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const DATA_DIR  = path.join(__dirname, '..', 'data');
const DB_PATH   = path.join(DATA_DIR, 'properties.db');
const JSON_PATH = path.join(DATA_DIR, 'properties.json');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(DB_PATH);
db.exec(`
  CREATE TABLE IF NOT EXISTS properties (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source TEXT NOT NULL,
    prop_name TEXT, price TEXT, area TEXT,
    url TEXT UNIQUE, date_str TEXT,
    scraped_at TEXT DEFAULT (datetime('now', '+9 hours'))
  );
  CREATE UNIQUE INDEX IF NOT EXISTS idx_url ON properties(url);
`);

const OKINAWA_AREAS = [
  '那覇市','糸満市','豊見城市','南城市','八重瀬町','与那原町','西原町',
  '浦添市','宜野湾市','沖縄市','北中城村','中城村','北谷町','読谷村',
  '嘉手納町','うるま市','恩納村','宜野座村','金武町','名護市','今帰仁村',
  '本部町','大宜味村','国頭村','東村','石垣市','竹富町','与那国町',
  '宮古島市','多良間村','渡名喜村','伊平屋村','伊是名村','座間味村',
  '渡嘉敷村','粟国村','南大東村','北大東村','伊江村',
];

// ─── goohome：トップの simple_estate_caset + /kodate/ の data-cell ──
async function scrapeGoohome(context) {
  const results = [];
  const seen = new Set();
  console.log('\n🏡 goohome スクレイプ開始...');

  // ① トップページ（賃貸）
  {
    const p = await context.newPage();
    try {
      await p.goto('https://goohome.jp/', { waitUntil: 'networkidle', timeout: 30000 });
      await p.waitForTimeout(2000);

      const cards = await p.evaluate((areas) => {
        const data = [];
        for (const el of document.querySelectorAll('.simple_estate_caset')) {
          const linkEl = el.querySelector('a[href]');
          if (!linkEl) continue;
          const href  = linkEl.getAttribute('href') || '';
          const url   = href.startsWith('http') ? href : 'https://goohome.jp' + href;

          const text = (el.innerText || '').replace(/\s+/g, ' ').trim();
          const pm   = text.match(/(\d+億(?:[\d,]+万)?円|[\d,]+(?:\.\d+)?万円(?:\/月)?)/);
          const price = pm ? pm[1] : null;
          if (!price) continue;

          let area = '';
          for (const a of areas) { if (text.includes(a)) { area = a; break; } }
          const mm = text.match(/([１２３４５\d][SLDK１２３４５LDK]+)/);
          const madori = mm ? mm[1].substring(0, 6) : '';
          const typeEl = el.querySelector('.estate_type');
          const propType = typeEl ? typeEl.textContent.trim() : '';

          data.push({ propName: [propType, madori].filter(Boolean).join(' ') || '不動産物件', price, area: area || 'エリア不明', url });
        }
        return data;
      }, OKINAWA_AREAS);

      console.log(`  トップページ（賃貸）: ${cards.length}件`);
      for (const c of cards) {
        if (!seen.has(c.url)) { seen.add(c.url); results.push({ source: 'goohome', ...c, dateStr: '' }); }
      }
    } catch (e) { console.error('  goohome トップエラー:', e.message); }
    finally { await p.close(); }
  }

  // ② /kodate/（戸建て）
  {
    const p = await context.newPage();
    try {
      await p.goto('https://goohome.jp/kodate/', { waitUntil: 'networkidle', timeout: 30000 });
      await p.waitForTimeout(2000);

      const cards = await p.evaluate((areas) => {
        const data = [];
        // テーブル行から取得
        for (const row of document.querySelectorAll('tr')) {
          const cells = Array.from(row.querySelectorAll('td'));
          if (cells.length < 3) continue;
          const priceCells = cells.filter(c => /\d+[億万]円/.test(c.textContent || ''));
          if (priceCells.length === 0) continue;
          const pm = priceCells[0].textContent?.match(/(\d+億(?:[\d,]+万)?円|[\d,]+(?:\.\d+)?万円)/);
          if (!pm) continue;
          const price = pm[1];
          const linkEl = row.querySelector('a[href]');
          const href   = linkEl?.getAttribute('href') || '';
          const url    = href ? (href.startsWith('http') ? href : 'https://goohome.jp' + href) : '';
          if (!url) continue;
          const text = row.innerText?.replace(/\s+/g, ' ').trim() || '';
          let area = '';
          for (const a of areas) { if (text.includes(a)) { area = a; break; } }
          const mm = text.match(/([１２３４５\d][SLDK１２３４５LDK]+)/);
          const madori = mm ? mm[1].substring(0, 6) : '';
          data.push({ propName: ['戸建て', madori].filter(Boolean).join(' '), price, area: area || 'エリア不明', url });
        }
        return data;
      }, OKINAWA_AREAS);

      console.log(`  /kodate/: ${cards.length}件`);
      for (const c of cards) {
        if (!seen.has(c.url)) { seen.add(c.url); results.push({ source: 'goohome', ...c, dateStr: '' }); }
      }
    } catch (e) { console.error('  goohome /kodate/ エラー:', e.message); }
    finally { await p.close(); }
  }

  // ③ 検索結果ページをスクレイプ（複数エリア）
  const searchUrls = [
    'https://goohome.jp/chintai/result/?pref=47&city=&eki=&route=&walk=&bld=&floorplan=&rent_from=&rent_to=&area_from=&area_to=&age=&floor=&sort=new&p=1',
    'https://goohome.jp/chintai/result/?pref=47&sort=new&p=1',
    'https://goohome.jp/chintai/result/?sort=new&p=1',
    'https://goohome.jp/kodate/result/?pref=47&sort=new&p=1',
  ];
  for (const startUrl of searchUrls) {
    if (results.length > 500) break;
    for (let pg = 1; pg <= 15; pg++) {
      const url = startUrl.replace('p=1', `p=${pg}`);
      const p = await context.newPage();
      try {
        await p.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
        await p.waitForTimeout(1500);

        const cards = await p.evaluate((areas) => {
          const data = [];
          const seen2 = new Set();
          const selectors = ['.simple_estate_caset', '.estate_list_item', 'li.property', 'tr td.prop_title'];
          let els = [];
          for (const sel of selectors) {
            els = Array.from(document.querySelectorAll(sel));
            if (els.length > 0) break;
          }
          for (const el of els) {
            const linkEl = el.querySelector('a[href]') || (el.tagName === 'A' ? el : null);
            if (!linkEl) continue;
            const href = linkEl.getAttribute('href') || '';
            if (!href) continue;
            const url = href.startsWith('http') ? href : 'https://goohome.jp' + href;
            if (seen2.has(url)) continue;
            seen2.add(url);
            const text = (el.innerText || '').replace(/\s+/g, ' ').trim();
            const pm = text.match(/(\d+億(?:[\d,]+万)?円|[\d,]+(?:\.\d+)?万円(?:\/月)?)/);
            if (!pm) continue;
            const price = pm[1];
            let area = '';
            for (const a of areas) { if (text.includes(a)) { area = a; break; } }
            const mm = text.match(/([１２３４５\d][SLDK１２３４５LDK]+)/);
            const madori = mm ? mm[1].substring(0, 6) : '';
            data.push({ propName: madori || '不動産物件', price, area: area || 'エリア不明', url });
          }
          return data;
        }, OKINAWA_AREAS);

        if (cards.length === 0) break;
        let added = 0;
        for (const c of cards) {
          if (!seen.has(c.url)) { seen.add(c.url); results.push({ source: 'goohome', ...c, dateStr: '' }); added++; }
        }
        console.log(`  検索結果 pg${pg}: ${cards.length}件取得 (+${added}) 累計${results.length}件`);
        if (cards.length < 5) break;
      } catch (e) { console.error(`  検索${pg} エラー:`, e.message); break; }
      finally { await p.close(); }
    }
  }

  console.log(`✅ goohome 合計 ${results.length}件`);
  return results;
}

// ─── すまいずむ：ASP.NET __doPostBack ページネーション ──────────────
async function scrapeSumaism(context) {
  const results = [];
  const seen = new Set();
  console.log('\n🏘️  すまいずむ スクレイプ開始...');

  const startUrls = [
    'http://www.sumaism.net/chintai/',
    'http://www.sumaism.net/baibai/',
  ];

  for (const startUrl of startUrls) {
    const label = startUrl.includes('chintai') ? '賃貸' : '売買';
    console.log(`  ${label} (${startUrl})`);
    const page = await context.newPage();
    try {
      await page.goto(startUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(3000);

      // 何ページあるか確認
      const maxPage = await page.evaluate(() => {
        const links = Array.from(document.querySelectorAll('a[href]'));
        const nums = links.map(a => {
          const m = (a.getAttribute('href') || '').match(/Page\$(\d+)/);
          return m ? parseInt(m[1]) : 0;
        });
        return nums.length > 0 ? Math.max(...nums) : 1;
      });
      console.log(`  最大ページ: ${maxPage}`);

      // 1ページ目のデータ取得
      const firstPageItems = await extractSumaismRows(page);
      console.log(`  1ページ目: ${firstPageItems.length}件`);
      for (const c of firstPageItems) {
        if (!seen.has(c.url)) { seen.add(c.url); results.push({ source: 'すまいずむ', ...c, dateStr: '' }); }
      }

      // 2ページ以降：__doPostBack クリック
      for (let pg = 2; pg <= Math.min(maxPage, 20); pg++) {
        try {
          // ページリンクをクリック
          const clicked = await page.evaluate((pgNum) => {
            const links = Array.from(document.querySelectorAll('a[href]'));
            const target = links.find(a => (a.getAttribute('href') || '').includes(`Page$${pgNum}`));
            if (target) { target.click(); return true; }
            return false;
          }, pg);

          if (!clicked) {
            console.log(`  ページ${pg}: リンクなし → 終了`);
            break;
          }

          await page.waitForTimeout(3000);
          const items = await extractSumaismRows(page);
          console.log(`  ページ${pg}: ${items.length}件`);
          for (const c of items) {
            if (!seen.has(c.url)) { seen.add(c.url); results.push({ source: 'すまいずむ', ...c, dateStr: '' }); }
          }
        } catch (e) {
          console.error(`  ページ${pg} エラー:`, e.message);
          break;
        }
      }
    } catch (e) { console.error(`  ${label} エラー:`, e.message); }
    finally { await page.close(); }
  }

  console.log(`✅ すまいずむ 合計 ${results.length}件`);
  return results;
}

async function extractSumaismRows(page) {
  return page.evaluate((areas) => {
    const data = [];
    for (const row of document.querySelectorAll('table tr')) {
      const cells = Array.from(row.querySelectorAll('td'));
      if (cells.length < 5) continue;
      const rowText = row.innerText?.replace(/\s+/g, ' ').trim() || '';
      if (!rowText || !/[億万]円/.test(rowText)) continue;
      if (/物件番号|並び替え|表示件数|賃料|間取/.test(rowText)) continue;

      const priceMatch = rowText.match(/(\d+億(?:[\d,]+万)?円|[\d.]+万円(?:\/月)?)/);
      if (!priceMatch) continue;
      const price = priceMatch[1];

      let area = '', propName = '';
      for (const cell of cells) {
        const t = (cell.textContent || '').trim();
        if (!t) continue;
        for (const ar of areas) { if (t.includes(ar)) { area = ar; break; } }
        if (!propName && t.length > 3 && t.length < 60 && !/\d+[億万]円/.test(t)) {
          propName = t.replace(/\s+/g, ' ').trim();
        }
      }

      const madoriMatch = rowText.match(/([１２３４５\d][SLDK１２３４５LDK]+)/);
      const madori = madoriMatch ? madoriMatch[1].substring(0, 6) : '';

      const linkEl = row.querySelector('a[href]');
      let url = '';
      if (linkEl) {
        const href = linkEl.getAttribute('href') || '';
        if (href.startsWith('javascript:')) {
          const m = href.match(/js_FormOpen\((\d+),\s*"([^"]+)",\s*(\d+)\)/);
          if (m) url = `http://www.sumaism.net/chintai/detail01.aspx?flg_out=1&iNo=${m[1]}&LNO=${m[2]}&mUser=${m[3]}`;
        } else if (href) {
          url = href.startsWith('http') ? href : 'http://www.sumaism.net' + href;
        }
      }
      if (!url) url = `sumaism_${price}_${area}_${Math.random().toString(36).slice(2,8)}`;

      const fullName = [propName, madori].filter(Boolean).join(' ').replace(/\s+/g, ' ').slice(0, 60) || '物件';
      if (price) data.push({ propName: fullName, price, area: area || 'エリア不明', url });
    }
    return data;
  }, OKINAWA_AREAS);
}

// ─── verdict 計算（market.ts と同じロジック） ───────────────────────
const MARKET_2026 = {
  '那覇市':   { rent: 6.5,  sale: 3500, land: 1800 },
  '浦添市':   { rent: 6.0,  sale: 3200, land: 1500 },
  '宜野湾市': { rent: 6.0,  sale: 3000, land: 1400 },
  '沖縄市':   { rent: 5.5,  sale: 2600, land: 1100 },
  '豊見城市': { rent: 5.8,  sale: 3000, land: 1400 },
  '糸満市':   { rent: 5.0,  sale: 2500, land: 1000 },
  '南城市':   { rent: 4.5,  sale: 2200, land: 900  },
  '八重瀬町': { rent: 4.5,  sale: 2000, land: 800  },
  '与那原町': { rent: 5.0,  sale: 2500, land: 1000 },
  '西原町':   { rent: 5.5,  sale: 2600, land: 1100 },
  'うるま市': { rent: 5.0,  sale: 2400, land: 1000 },
  '北中城村': { rent: 5.0,  sale: 2400, land: 1000 },
  '中城村':   { rent: 4.8,  sale: 2200, land: 900  },
  '北谷町':   { rent: 6.0,  sale: 3200, land: 1600 },
  '嘉手納町': { rent: 5.0,  sale: 2500, land: 1000 },
  '読谷村':   { rent: 5.5,  sale: 2800, land: 1200 },
  '恩納村':   { rent: 5.8,  sale: 3500, land: 1500 },
  '宜野座村': { rent: 4.0,  sale: 1800, land: 700  },
  '金武町':   { rent: 4.0,  sale: 1800, land: 700  },
  '名護市':   { rent: 5.0,  sale: 2200, land: 900  },
  '今帰仁村': { rent: 4.0,  sale: 1800, land: 700  },
  '本部町':   { rent: 4.2,  sale: 1900, land: 750  },
  '大宜味村': { rent: 3.5,  sale: 1400, land: 550  },
  '国頭村':   { rent: 3.5,  sale: 1400, land: 550  },
  '東村':     { rent: 3.0,  sale: 1200, land: 500  },
  '伊江村':   { rent: 3.5,  sale: 1400, land: 550  },
  '石垣市':   { rent: 5.5,  sale: 2800, land: 1200 },
  '宮古島市': { rent: 5.2,  sale: 2600, land: 1100 },
  '竹富町':   { rent: 4.0,  sale: 2000, land: 800  },
  '与那国町': { rent: 3.5,  sale: 1500, land: 600  },
  '座間味村': { rent: 4.0,  sale: 1800, land: 700  },
  '渡嘉敷村': { rent: 3.5,  sale: 1500, land: 600  },
};

function parsePriceMan(price) {
  if (!price) return null;
  const s = price.replace(/,/g, '');
  if (/億/.test(s)) {
    const m1 = s.match(/(\d+(?:\.\d+)?)億(\d+(?:\.\d+)?)万/);
    if (m1) return parseFloat(m1[1]) * 10000 + parseFloat(m1[2]);
    const m2 = s.match(/(\d+(?:\.\d+)?)億/);
    if (m2) return parseFloat(m2[1]) * 10000;
  }
  const m3 = s.match(/(\d+(?:\.\d+)?)万/);
  return m3 ? parseFloat(m3[1]) : null;
}

function calcVerdict(propName, price, area) {
  const mn = parsePriceMan(price);
  if (mn === null) return { verdict: null, verdict_benchmark: null, verdict_diff: null };
  const isRent = /\/月|万円\//.test(price) || mn < 20;
  const entry = MARKET_2026[area];
  if (!entry) return { verdict: null, verdict_benchmark: null, verdict_diff: null };
  const benchmark = isRent ? entry.rent : (/土地/.test(propName) ? entry.land : entry.sale);
  if (!benchmark) return { verdict: null, verdict_benchmark: null, verdict_diff: null };
  const diff = Math.round(((mn - benchmark) / benchmark) * 100);
  const verdict = diff <= -15 ? '割安' : diff >= 15 ? '割高' : '相場並み';
  return { verdict, verdict_benchmark: benchmark, verdict_diff: diff };
}

// ─── メイン ──────────────────────────────────────────────────────────
async function main() {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const ctx = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36',
    locale: 'ja-JP',
  });

  let all = [];
  try {
    const [r1, r2] = await Promise.allSettled([
      scrapeGoohome(ctx),
      scrapeSumaism(ctx),
    ]);
    if (r1.status === 'fulfilled') all.push(...r1.value);
    else console.error('goohome 失敗:', r1.reason);
    if (r2.status === 'fulfilled') all.push(...r2.value);
    else console.error('すまいずむ 失敗:', r2.reason);
  } finally {
    await browser.close();
  }

  console.log(`\n取得合計: ${all.length}件`);

  // DB に UPSERT
  const insert = db.prepare(`
    INSERT INTO properties (source, prop_name, price, area, url, date_str)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(url) DO UPDATE SET
      prop_name=excluded.prop_name, price=excluded.price, area=excluded.area,
      scraped_at=datetime('now', '+9 hours')
  `);
  const insertMany = db.transaction(rows => {
    let count = 0;
    for (const r of rows) {
      try { insert.run(r.source, r.propName || r.prop_name, r.price, r.area, r.url, r.dateStr || ''); count++; }
      catch {}
    }
    return count;
  });
  const saved = insertMany(all);
  console.log(`DB追記: ${saved}件`);

  // 全件取得 + verdict 計算 → JSON 書き出し
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
  console.log('✅ JSON更新完了');
}

main().catch(e => { console.error('🚨', e); process.exit(1); });
