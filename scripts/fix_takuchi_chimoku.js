/**
 * 「売買土地」89件の実際の地目を各URLから取得して prop_name を修正する
 * うちなーらいふ detail ページの地目テーブルを参照
 */
const { chromium } = require('playwright');
const fs   = require('fs');
const path = require('path');

const JSON_PATH = path.join(__dirname, '..', 'data', 'properties.json');
const props = JSON.parse(fs.readFileSync(JSON_PATH, 'utf8'));

// 対象: うちなーらいふの「売買土地」のみ
const targets = props.filter(r =>
  r.source === 'うちなーらいふ' &&
  r.prop_name && r.prop_name.startsWith('売買土地') &&
  r.url
);
console.log(`対象: ${targets.length}件`);

// 地目コードマップ
const CHIMOKU_MAP = {
  '宅地':  '売買宅地',
  '農地':  '売買農地',
  '田':    '売買田',
  '畑':    '売買農地',
  '原野':  '売買原野',
  '山林':  '売買山林',
  '雑種地':'売買雑種地',
  '林地':  '売買山林',
  '牧草地':'売買農地',
};

(async () => {
  const br = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const ctx = await br.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  });

  const results = {};  // id → 新しいprop_name
  let success = 0, failed = 0;

  for (let i = 0; i < targets.length; i++) {
    const item = targets[i];
    const p = await ctx.newPage();
    try {
      await p.goto(item.url, { waitUntil: 'domcontentloaded', timeout: 20000 });
      await p.waitForTimeout(800);

      // 地目を取得 - テーブル行の「地目」セルを探す
      const chimoku = await p.evaluate(() => {
        // テーブルベースのレイアウト
        const rows = document.querySelectorAll('tr, .detail-row, [class*="spec-row"]');
        for (const row of rows) {
          const text = row.textContent || '';
          if (/地目/.test(text)) {
            const cells = row.querySelectorAll('td, dd, span, div');
            for (let j = 0; j < cells.length; j++) {
              if (/地目/.test(cells[j].textContent||'')) {
                const next = cells[j+1];
                if (next) return next.textContent.trim();
              }
            }
            // テキスト全体から地目の値を抽出
            const m = text.match(/地目[\s:：\|]*(宅地|農地|田|畑|原野|山林|雑種地|林地|牧草地)/);
            if (m) return m[1];
          }
        }
        // dl/dt/dd 形式
        const dts = document.querySelectorAll('dt');
        for (const dt of dts) {
          if (/地目/.test(dt.textContent||'')) {
            const dd = dt.nextElementSibling;
            if (dd) return dd.textContent.trim();
          }
        }
        // th/td 形式
        const ths = document.querySelectorAll('th');
        for (const th of ths) {
          if (/地目/.test(th.textContent||'')) {
            const td = th.nextElementSibling;
            if (td) return td.textContent.trim();
          }
        }
        return null;
      });

      if (chimoku) {
        const mapped = Object.keys(CHIMOKU_MAP).find(k => chimoku.includes(k));
        const newName = mapped ? CHIMOKU_MAP[mapped] : `売買土地（${chimoku}）`;
        results[item.id] = newName;
        if (i < 5 || mapped !== '宅地') {
          console.log(`  [${i+1}/${targets.length}] ${item.area} → 地目:${chimoku} → ${newName}`);
        }
        success++;
      } else {
        console.log(`  [${i+1}/${targets.length}] ${item.area} ${item.url.slice(-20)} → 地目不明（売買土地のまま）`);
        failed++;
      }
    } catch(e) {
      console.error(`  [${i+1}/${targets.length}] ERROR: ${e.message.slice(0,60)}`);
      failed++;
    } finally {
      await p.close();
    }
    // うちなーらいふへの負荷軽減
    await new Promise(r => setTimeout(r, 600));
  }

  await br.close();

  console.log(`\n✅ 成功: ${success}件 / 失敗: ${failed}件`);

  // prop_name を更新
  const updated = props.map(r => {
    if (results[r.id]) return { ...r, prop_name: results[r.id] };
    return r;
  });

  // 変更サマリー
  const changes = {};
  Object.values(results).forEach(v => { changes[v] = (changes[v]||0)+1; });
  console.log('\n地目別内訳:');
  Object.entries(changes).forEach(([k,v]) => console.log(`  ${k}: ${v}件`));

  fs.writeFileSync(JSON_PATH, JSON.stringify(updated, null, 2), 'utf8');
  console.log('\n✅ properties.json 更新完了');
})().catch(e => { console.error(e); process.exit(1); });
