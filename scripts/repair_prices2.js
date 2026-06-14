/**
 * 価格修正スクリプト v2
 * verdict_diff が -50% 以下の売買物件 → 実際のページで正しい価格を再取得
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const JSON_PATH = path.join(__dirname, '..', 'data', 'properties.json');
const data = JSON.parse(fs.readFileSync(JSON_PATH, 'utf8'));
console.log(`JSON総件数: ${data.length}件`);

// 売買物件で verdict_diff が -50% 以下（市場相場より50%以上安い = 価格がおかしい疑い）
const targets = data.filter(p => {
  const name = p.prop_name || '';
  const url = p.url || '';
  const diff = p.verdict_diff;
  if (!url.includes('e-uchina.net')) return false;
  const isSale = name.includes('売買') || name.includes('売ア') || name.includes('売マ') || name.startsWith('売');
  if (!isSale) return false;
  if (typeof diff !== 'number') return false;
  return diff < -50; // 50%以上割安 = 価格がおかしい可能性
});

console.log(`修正対象: ${targets.length}件`);
targets.forEach(t => console.log(`  ID:${t.id} ${t.prop_name} / ${t.price} / 割安${t.verdict_diff}% / ${t.area}`));

if (targets.length === 0) {
  console.log('修正対象なし');
  process.exit(0);
}

async function getCorrectPrice(page, url) {
  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 20000 });
    await page.waitForTimeout(800);
    return await page.evaluate(() => {
      const bodyText = (document.body.innerText || '').replace(/\s+/g, ' ');
      // 「価格 X億Y万円」「価格 X億円」「価格 X,XXX万円」を順に探す
      const m = bodyText.match(/価格\s*(\d+億(?:[\d,]+万)?円|\d+億円|[\d,]+万円)/);
      return m ? m[1] : null;
    });
  } catch {
    return null;
  }
}

async function main() {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36',
    locale: 'ja-JP',
  });
  const page = await context.newPage();

  let fixed = 0;
  const urlToPrice = {};

  for (const t of targets) {
    process.stdout.write(`ID:${t.id} ${t.prop_name}(${t.price}) → `);
    const correct = await getCorrectPrice(page, t.url);
    if (correct && correct !== t.price) {
      console.log(`${correct} ✅`);
      urlToPrice[t.url] = correct;
      fixed++;
    } else {
      console.log(`変更なし(${correct || '取得失敗'})`);
    }
    await new Promise(r => setTimeout(r, 400));
  }

  await browser.close();

  if (fixed > 0) {
    const updated = data.map(p => urlToPrice[p.url] ? { ...p, price: urlToPrice[p.url] } : p);
    fs.writeFileSync(JSON_PATH, JSON.stringify(updated, null, 2), 'utf8');
    console.log(`\n✅ JSON更新: ${fixed}件修正`);
  } else {
    console.log('\n修正なし');
  }
}

main().catch(e => { console.error(e); process.exit(1); });
