/**
 * 沖縄不動産 新着物件自動巡回スクレイパー v2
 * 対象: うちなーらいふ / goohome / すまいずむ
 * 出力: okinawa_all_new_properties.csv
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

// 本日の日付
const today = new Date();
const YEAR_SHORT = String(today.getFullYear()).slice(2);
const MONTH = String(today.getMonth() + 1).padStart(2, '0');
const DAY = String(today.getDate()).padStart(2, '0');
const TODAY_STR = `${YEAR_SHORT}${MONTH}${DAY}`;  // "260614"

console.log(`🗓️  本日: 20${YEAR_SHORT}年${MONTH}月${DAY}日 (新着識別子: ${TODAY_STR})`);

// 沖縄の市区町村リスト（エリア抽出用）
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
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

// ─── 1. うちなーらいふ ─────────────────────────────────────────────
async function scrapeUchina(context) {
  const page = await context.newPage();
  const results = [];
  console.log('\n🏠 うちなーらいふ 巡回中...');

  try {
    await page.goto('https://www.e-uchina.net/list_all', {
      waitUntil: 'networkidle',
      timeout: 30000,
    });
    await page.waitForTimeout(3000);

    const cards = await page.evaluate(({ todayStr, areas }) => {
      const cardEls = document.querySelectorAll('.card');
      const data = [];

      for (const card of cardEls) {
        // 詳細URLから本日日付を確認
        const linkEl = card.querySelector('a[href*="/detail.html"]') ||
                       card.querySelector('a[href*="/bukken/"]');
        const url = linkEl ? linkEl.href : '';
        const isNew = url.includes(todayStr) || !!card.querySelector('img[src*="new"]');
        if (!isNew) continue;

        // 物件種別（.bukken-type）
        const typeEl = card.querySelector('.bukken-type');
        const propType = typeEl ? typeEl.textContent.trim() : '';

        // 価格（.bukken-data-price）
        const priceEl = card.querySelector('.bukken-data-price');
        let price = '';
        if (priceEl) {
          price = priceEl.textContent.replace(/\s+/g, '').trim();
          // 余分な文字を除去
          price = price.replace(/お気に入り.*/, '').trim();
        }
        if (!price) {
          const pm = card.textContent.match(/(\d+億(?:[\d,]+万)?円|[\d,]+(?:\.\d+)?万円)/);
          price = pm ? pm[1] : '価格不明';
        }

        // 間取り（.bukken-data-madori から種別のみ）
        const madoriEl = card.querySelector('.bukken-data-madori');
        let madori = '';
        if (madoriEl) {
          const t = madoriEl.textContent.trim();
          // "4DK" "3LDK" などの間取り記号だけ抽出
          const m = t.match(/\d[SLDK]+/);
          madori = m ? m[0] : '';
        }

        // 物件名 = 種別 + 間取り
        const propName = [propType, madori].filter(Boolean).join(' ') || '物件';

        // エリア（.bukken-data-address）
        const areaEl = card.querySelector('.bukken-data-address');
        let area = '';
        if (areaEl) {
          const areaText = areaEl.textContent.trim();
          // 沖縄市区町村名を抽出
          for (const a of areas) {
            if (areaText.includes(a)) { area = a; break; }
          }
          // 市区町村が取れなければ先頭部分を使う
          if (!area) area = areaText.replace(/お気に入り.*/, '').trim().substring(0, 20);
        }

        data.push({ propName, price, area, url });
      }
      return data;
    }, { todayStr: TODAY_STR, areas: OKINAWA_AREAS });

    results.push(...cards.map(c => ({
      source: 'うちなーらいふ',
      propName: c.propName || '物件名取得失敗',
      price: c.price || '価格不明',
      area: c.area || 'エリア不明',
      url: c.url,
    })));

    console.log(`  ✅ ${results.length}件 取得`);
  } catch (e) {
    console.error('  ❌ うちなーらいふ エラー:', e.message);
  } finally {
    await page.close();
  }
  return results;
}

// ─── 2. goohome ────────────────────────────────────────────────────
async function scrapeGoohome(context) {
  const page = await context.newPage();
  const results = [];
  console.log('\n🏡 goohome 巡回中...');

  try {
    await page.goto('https://goohome.jp/', {
      waitUntil: 'networkidle',
      timeout: 30000,
    });
    await page.waitForTimeout(3000);

    const cards = await page.evaluate((areas) => {
      const casets = document.querySelectorAll('.simple_estate_caset');
      const data = [];
      const seen = new Set();

      for (const el of casets) {
        // 物件種別
        const typeEl = el.querySelector('.estate_type');
        const propType = typeEl ? typeEl.textContent.trim() : '';

        // URL
        const linkEl = el.querySelector('a[href]');
        if (!linkEl) continue;
        const href = linkEl.getAttribute('href') || '';
        const url = href.startsWith('http') ? href : 'https://goohome.jp' + href;
        if (seen.has(url)) continue;
        seen.add(url);

        // テキスト情報（全テキストを行分割）
        const lines = el.textContent.trim().split('\n')
          .map(l => l.trim()).filter(l => l.length > 0);

        // 価格・エリア・間取りを含む行を探す
        // 例: "那覇市仲井真6.8万円２LDK"
        const infoLine = lines.find(l => /[億万]円/.test(l)) || '';

        let price = '';
        let area = '';

        if (infoLine) {
          // 価格を抽出（例: "6.8万円" "4,050万円" "1億100万円"）
          const priceMatch = infoLine.match(/(\d+億(?:[\d,]+万)?円|[\d,]+(?:\.\d+)?万円(?:\/月)?)/);
          price = priceMatch ? priceMatch[1] : '価格不明';

          // エリア = 価格より前の市区町村部分
          if (priceMatch) {
            const priceIndex = infoLine.indexOf(priceMatch[1]);
            const beforePrice = infoLine.substring(0, priceIndex);
            // 市区町村を抽出
            for (const a of areas) {
              if (beforePrice.includes(a)) { area = a; break; }
            }
            if (!area) area = beforePrice.trim();
          }
        }

        // propNameに間取りも追加
        const madoriMatch = infoLine.match(/([１２３４５\d][SLDK]+[^万]*$)/);
        const madori = madoriMatch ? madoriMatch[1].substring(0, 6) : '';
        const propName = [propType, madori].filter(Boolean).join(' ') || '不動産物件';

        data.push({
          propName,
          price: price || '価格不明',
          area: area || 'エリア不明',
          url,
        });
      }
      return data;
    }, OKINAWA_AREAS);

    results.push(...cards.map(c => ({
      source: 'goohome',
      propName: c.propName,
      price: c.price,
      area: c.area,
      url: c.url,
    })));

    console.log(`  ✅ ${results.length}件 取得`);
  } catch (e) {
    console.error('  ❌ goohome エラー:', e.message);
  } finally {
    await page.close();
  }
  return results;
}

// ─── 3. すまいずむ ─────────────────────────────────────────────────
async function scrapeSumaism(context) {
  const page = await context.newPage();
  const results = [];
  console.log('\n🏘️  すまいずむ 巡回中...');

  try {
    await page.goto('http://www.sumaism.net/chintai/', {
      waitUntil: 'networkidle',
      timeout: 40000,
    });
    await page.waitForTimeout(5000);

    const items = await page.evaluate((areas) => {
      /**
       * テーブル構造:
       * セル[0]: 画像
       * セル[1]: "那覇市国場アパート" (エリア+物件名)
       * セル[2]: "4.3万円／1,000円" (賃料/共益費)
       * セル[3]: "1LDK" (間取り)
       * セル[4]: "0ヶ月／0ヶ月" (敷金/礼金)
       * セル[5]: 駐車場
       * セル[6]: 築年
       * セル[7]: "那覇市詳細 会社名" (エリア+詳細リンク)
       */
      const rows = document.querySelectorAll('table tr');
      const data = [];

      for (const row of rows) {
        const cells = Array.from(row.querySelectorAll('td'));
        if (cells.length < 7) continue;

        const nameCell = cells[1] ? cells[1].textContent.trim() : '';
        const priceCell = cells[2] ? cells[2].textContent.trim() : '';
        const madoriCell = cells[3] ? cells[3].textContent.trim() : '';

        // 価格チェック: 万円・億円が含まれているかで物件行かどうか判定
        if (!priceCell || !/[億万]円/.test(priceCell)) continue;

        // 物件名: "浦添市伊祖アパート" → エリア名 + 建物種別
        let propName = nameCell.replace(/\s+/g, '');
        let area = '';
        for (const a of areas) {
          if (propName.includes(a)) {
            area = a;
            // エリア名除去後が物件名
            propName = propName.replace(a, '').trim();
            break;
          }
        }
        if (!area) {
          // エリアが見つからない場合は先頭の市区町村っぽい部分を使う
          const areaMatch = nameCell.match(/^[゠-ヿ぀-ゟ一-鿿]{2,5}[市区町村]/);
          if (areaMatch) area = areaMatch[0];
        }

        // 価格: "6.8万円／600円" → "6.8万円"、"1億100万円" → "1億100万円"
        const priceMatch = priceCell.match(/(\d+億(?:[\d,]+万)?円|[\d.]+万円)/);
        const price = priceMatch ? priceMatch[1] : priceCell;

        // 詳細URL: js_FormOpen のリンクから構築
        const linkEl = row.querySelector('a[href^="javascript:js_FormOpen"]');
        let url = '';
        if (linkEl) {
          const href = linkEl.getAttribute('href');
          const match = href.match(/js_FormOpen\((\d+),\s*"([^"]+)",\s*(\d+)\)/);
          if (match) {
            const iNo = match[1];
            const lNo = match[2];
            const mUser = match[3];
            url = `http://www.sumaism.net/chintai/detail01.aspx?flg_out=1&iNo=${iNo}&LNO=${lNo}&mUser=${mUser}`;
          }
        }

        if (propName || area) {
          data.push({
            propName: [propName, madoriCell].filter(Boolean).join(' ') || '物件',
            price,
            area: area || 'エリア不明',
            url: url || 'http://www.sumaism.net/chintai/',
          });
        }
      }
      return data;
    }, OKINAWA_AREAS);

    results.push(...items.slice(0, 20).map(c => ({
      source: 'すまいずむ',
      propName: c.propName,
      price: c.price,
      area: c.area,
      url: c.url,
    })));

    console.log(`  ✅ ${results.length}件 取得`);
  } catch (e) {
    console.error('  ❌ すまいずむ エラー:', e.message);
  } finally {
    await page.close();
  }
  return results;
}

// ─── メイン処理 ──────────────────────────────────────────────────────
async function main() {
  console.log('==========================================');
  console.log('  沖縄不動産 新着物件自動巡回スクレイパー v2');
  console.log('==========================================');

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    locale: 'ja-JP',
  });

  let allResults = [];
  try {
    // 並列実行
    const [r1, r2, r3] = await Promise.allSettled([
      scrapeUchina(context),
      scrapeGoohome(context),
      scrapeSumaism(context),
    ]);

    if (r1.status === 'fulfilled') allResults.push(...r1.value);
    else console.error('うちなーらいふ失敗:', r1.reason?.message || r1.reason);
    if (r2.status === 'fulfilled') allResults.push(...r2.value);
    else console.error('goohome失敗:', r2.reason?.message || r2.reason);
    if (r3.status === 'fulfilled') allResults.push(...r3.value);
    else console.error('すまいずむ失敗:', r3.reason?.message || r3.reason);

  } finally {
    await browser.close();
  }

  // CSVに書き出し（BOM付きUTF-8でExcel対応）
  const csvPath = path.join(__dirname, 'okinawa_all_new_properties.csv');
  const header = '情報元,物件名,価格,エリア,詳細URL';
  const rows = allResults.map(r =>
    [csvEscape(r.source), csvEscape(r.propName), csvEscape(r.price), csvEscape(r.area), csvEscape(r.url)].join(',')
  );
  fs.writeFileSync(csvPath, '﻿' + header + '\n' + rows.join('\n'), 'utf8');

  // ── サマリー表示 ──
  console.log('\n==========================================');
  console.log('📊 結果サマリー');
  console.log('==========================================');
  const sources = {};
  for (const r of allResults) {
    sources[r.source] = (sources[r.source] || 0) + 1;
  }
  for (const [src, cnt] of Object.entries(sources)) {
    console.log(`  ${src}: ${cnt}件`);
  }
  console.log(`  合計: ${allResults.length}件`);
  console.log(`\n✅ CSV出力完了: ${csvPath}`);
  console.log('\n--- サンプルデータ (最初の5件) ---');
  allResults.slice(0, 5).forEach((r, i) => {
    console.log(`[${i+1}] ${r.source} | ${r.propName} | ${r.price} | ${r.area}`);
    if (r.url) console.log(`     ${r.url}`);
  });
}

main().catch(e => {
  console.error('🚨 致命的エラー:', e.message);
  process.exit(1);
});
