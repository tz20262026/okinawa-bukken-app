/**
 * 売買宅地（未確認分）の地目を再スクレイプ
 * - networkidle + 長めのタイムアウトで確実に取得
 * - ページ全体テキストから地目を正規表現で抽出
 */
const { chromium } = require('playwright');
const fs   = require('fs');
const path = require('path');

const JSON_PATH = path.join(__dirname, '..', 'data', 'properties.json');
const props = JSON.parse(fs.readFileSync(JSON_PATH, 'utf8'));

// 未確認の売買宅地（614-パターンURL）を対象にする
const targets = props.filter(r =>
  r.prop_name === '売買宅地' &&
  r.source === 'うちなーらいふ' &&
  r.url && r.url.includes('614-')
);
console.log(`対象: ${targets.length}件`);

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
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36',
    locale: 'ja-JP',
  });

  const results = {};
  let success = 0, failed = 0;

  for (let i = 0; i < targets.length; i++) {
    const item = targets[i];
    const p = await ctx.newPage();
    try {
      await p.goto(item.url, { waitUntil: 'networkidle', timeout: 30000 });
      await p.waitForTimeout(1200);

      const chimoku = await p.evaluate(() => {
        const bodyText = document.body.innerText || '';
        // テキスト全体から「地目」の次の値を抽出（最優先）
        const patterns = [
          /地目[^\n]*?[：:\s]+\s*(宅地|農地|田|畑|原野|山林|雑種地|林地)/,
          /地　目[^\n]*?(宅地|農地|田|畑|原野|山林|雑種地)/,
          /地目.*?(宅地|農地|田|畑|原野|山林|雑種地)/,
        ];
        for (const re of patterns) {
          const m = bodyText.match(re);
          if (m) return m[1];
        }
        // テーブルのth/td
        const ths = [...document.querySelectorAll('th,dt,label')];
        for (const th of ths) {
          if (/地目/.test(th.textContent || '')) {
            const sibling = th.nextElementSibling || th.parentElement?.nextElementSibling;
            if (sibling) {
              const val = sibling.textContent?.trim() || '';
              const m = val.match(/宅地|農地|田|畑|原野|山林|雑種地/);
              if (m) return m[0];
            }
          }
        }
        return null;
      });

      if (chimoku) {
        const mapped = Object.keys(CHIMOKU_MAP).find(k => chimoku.includes(k));
        const newName = mapped ? CHIMOKU_MAP[mapped] : null;
        if (newName && newName !== '売買宅地') {
          results[item.id] = newName;
          console.log(`✅ [${i+1}/${targets.length}] id:${item.id} ${item.area} 地目:${chimoku} → ${newName}`);
        } else {
          console.log(`   [${i+1}/${targets.length}] id:${item.id} ${item.area} 地目:${chimoku || '不明'} → 宅地確定`);
        }
        success++;
      } else {
        // ページソースの一部をダンプして確認
        const snippet = await p.evaluate(() => {
          const el = document.querySelector('[class*="spec"],[class*="detail"],[class*="info"],table');
          return el ? el.innerText?.slice(0, 200) : document.body.innerText?.slice(0, 300);
        });
        console.log(`❌ [${i+1}/${targets.length}] id:${item.id} ${item.area} 地目不明`);
        console.log(`   ページ抜粋: ${snippet?.replace(/\n/g,' ').slice(0,100)}`);
        failed++;
      }
    } catch(e) {
      console.error(`❌ [${i+1}/${targets.length}] id:${item.id} ERROR: ${e.message.slice(0,60)}`);
      failed++;
    } finally {
      await p.close();
    }
    await new Promise(r => setTimeout(r, 700));
  }

  await br.close();
  console.log(`\n成功: ${success} / 失敗: ${failed}`);

  if (Object.keys(results).length === 0) {
    console.log('変更なし');
    process.exit(0);
  }

  const updated = props.map(r => results[r.id] ? { ...r, prop_name: results[r.id] } : r);
  fs.writeFileSync(JSON_PATH, JSON.stringify(updated, null, 2), 'utf8');

  const changes = {};
  Object.values(results).forEach(v => { changes[v] = (changes[v]||0)+1; });
  console.log('\n変更内訳:');
  Object.entries(changes).forEach(([k,v]) => console.log(`  ${k}: ${v}件`));
  console.log('✅ properties.json 更新完了');
})().catch(e => { console.error(e); process.exit(1); });
