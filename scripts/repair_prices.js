/**
 * 価格修正スクリプト
 * properties.json の中で価格が低すぎる売買物件を詳細ページから再取得して修正する
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const JSON_PATH = path.join(DATA_DIR, 'properties.json');

const data = JSON.parse(fs.readFileSync(JSON_PATH, 'utf8'));
console.log(`JSON総件数: ${data.length}件`);

// 売買物件で価格が 100万円未満 → 坪単価を誤取得している疑い
const targets = data.filter(p => {
  const name = p.prop_name || '';
  const price = p.price || '';
  const url = p.url || '';
  if (!(name.includes('売買') || name.includes('売ア') || name.includes('売マ') || name.includes('売買'))) return false;
  if (!url.includes('e-uchina.net')) return false;
  const m = price.match(/^([\d.]+)万円$/);
  return m && parseFloat(m[1]) < 100;
});

console.log(`修正対象: ${targets.length}件`);
targets.forEach(t => console.log(`  ID:${t.id} ${t.prop_name} / ${t.price} / ${t.area}`));

if (targets.length === 0) {
  console.log('修正対象なし。終了。');
  process.exit(0);
}

async function getCorrectPrice(page, url) {
  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 20000 });
    await page.waitForTimeout(1000);
    const result = await page.evaluate(() => {
      const bodyText = (document.body.innerText || '').replace(/\s+/g, ' ');
      // 「価格 X億Y万円」を最優先で取得
      const m1 = bodyText.match(/価格\s*(\d+億(?:[\d,]+万)?円|\d+億円|[\d,]+万円)/);
      if (m1) return m1[1];
      // 億が含まれる価格
      const m2 = bodyText.match(/(\d+億(?:[\d,]+万)?円|\d+億円)/);
      if (m2) return m2[1];
      return null;
    });
    return result;
  } catch (e) {
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

  for (const target of targets) {
    process.stdout.write(`確認中 ID:${target.id} ${target.prop_name}(${target.price}) → `);
    const correct = await getCorrectPrice(page, target.url);
    if (correct && correct !== target.price) {
      console.log(`${correct} ✅`);
      urlToPrice[target.url] = correct;
      fixed++;
    } else {
      console.log(`変更なし(${correct || '取得失敗'})`);
    }
    await new Promise(r => setTimeout(r, 500));
  }

  await browser.close();

  if (fixed > 0) {
    // JSONを更新
    const updated = data.map(p => {
      if (urlToPrice[p.url]) {
        return { ...p, price: urlToPrice[p.url] };
      }
      return p;
    });
    fs.writeFileSync(JSON_PATH, JSON.stringify(updated, null, 2), 'utf8');
    console.log(`\n✅ JSON更新完了: ${fixed}件修正`);
  } else {
    console.log('\n修正なし');
  }
}

main().catch(e => {
  console.error('エラー:', e);
  process.exit(1);
});
