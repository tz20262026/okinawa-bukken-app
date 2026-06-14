/**
 * 毎日自動スクレイパー（GitHub Actions専用）
 * うちなーらいふ / goohome / すまいずむ の新着を properties.json に追記
 */
const { chromium } = require('playwright');
const fs   = require('fs');
const path = require('path');

const JSON_PATH = path.join(__dirname, '..', 'data', 'properties.json');

// ─── 共通データ ─────────────────────────────────────────────────
const MARKET_2026 = {
  '那覇市':   { rent:6.8, sale:4200, land:2800 }, '浦添市':   { rent:6.0, sale:3600, land:2200 },
  '豊見城市': { rent:5.8, sale:3400, land:2000 }, '宜野湾市': { rent:6.0, sale:3800, land:2400 },
  '北谷町':   { rent:6.5, sale:4000, land:2600 }, '嘉手納町': { rent:5.5, sale:3000, land:1800 },
  '沖縄市':   { rent:5.5, sale:3200, land:1800 }, 'うるま市': { rent:5.0, sale:2800, land:1600 },
  '北中城村': { rent:5.2, sale:3000, land:1800 }, '中城村':   { rent:5.0, sale:2800, land:1600 },
  '読谷村':   { rent:5.2, sale:3000, land:1800 }, '西原町':   { rent:5.5, sale:3000, land:1800 },
  '与那原町': { rent:5.5, sale:3000, land:1700 }, '南城市':   { rent:5.0, sale:2600, land:1400 },
  '糸満市':   { rent:5.0, sale:2800, land:1600 }, '八重瀬町': { rent:4.8, sale:2600, land:1400 },
  '恩納村':   { rent:5.5, sale:3200, land:2000 }, '宜野座村': { rent:4.5, sale:2400, land:1200 },
  '金武町':   { rent:4.5, sale:2400, land:1200 }, '名護市':   { rent:4.8, sale:2600, land:1400 },
  '今帰仁村': { rent:4.0, sale:2200, land:1000 }, '本部町':   { rent:4.0, sale:2200, land:1000 },
  '大宜味村': { rent:3.5, sale:1800, land: 800  }, '国頭村':   { rent:3.5, sale:1800, land: 800  },
  '東村':     { rent:3.5, sale:1800, land: 800  }, '伊江村':   { rent:3.5, sale:1500, land: 700  },
  '石垣市':   { rent:5.5, sale:3200, land:1800 }, '宮古島市': { rent:5.5, sale:3400, land:2000 },
  '竹富町':   { rent:4.5, sale:2400, land:1200 }, '与那国町': { rent:4.0, sale:2000, land:1000 },
  '多良間村': { rent:3.5, sale:1600, land: 700  }, '座間味村': { rent:4.0, sale:2000, land: 900  },
  '渡嘉敷村': { rent:4.0, sale:2000, land: 900  }, '伊平屋村': { rent:3.5, sale:1600, land: 700  },
  '伊是名村': { rent:3.5, sale:1600, land: 700  },
};

const OKINAWA_AREAS = Object.keys(MARKET_2026).concat([
  '渡名喜村','粟国村','南大東村','北大東村',
]);

function parsePriceMan(price) {
  if (!price || price === '価格不明') return null;
  const s = price.replace(/,/g,'').replace(/\s/g,'');
  const m1 = s.match(/(\d+(?:\.\d+)?)億(\d+(?:\.\d+)?)万/);
  if (m1) return parseFloat(m1[1])*10000 + parseFloat(m1[2]);
  const m2 = s.match(/(\d+(?:\.\d+)?)億/);
  if (m2) return parseFloat(m2[1])*10000;
  const m3 = s.match(/(\d+(?:\.\d+)?)万/);
  if (m3) return parseFloat(m3[1]);
  return null;
}

function rentMultiplier(n) {
  if (/4LDK|5[SLDK]|6[SLDK]/i.test(n)) return 2.4;
  if (/3LDK|3DK/i.test(n))              return 1.95;
  if (/2LDK|2DK/i.test(n))              return 1.55;
  if (/1LDK/i.test(n))                  return 1.25;
  return 1.0;
}

function calcVerdict(propName, price, area) {
  const m = MARKET_2026[area];
  if (!m) return { verdict:null, verdict_benchmark:null, verdict_diff:null };
  if (/店舗|事務所|倉庫|工場|駐車場|売アパート|売ビル|一棟|収益物件/.test(propName||''))
    return { verdict:null, verdict_benchmark:null, verdict_diff:null };
  const p = parsePriceMan(price);
  if (p===null) return { verdict:null, verdict_benchmark:null, verdict_diff:null };
  const isSale = /売買|^売/.test(propName||'');
  const isLand = /土地|農地|原野|田地|田んぼ|雑種地/.test(propName||'') || /^田$|^田[\s　]/.test(propName||'');
  const isRent = !isSale && !isLand && (
    /賃貸|\/月|アパート|マンション|貸間/.test((propName||'')+(price||'')) ||
    /\/月/.test(price||'') || p < 20
  );
  const bm = isRent ? m.rent * rentMultiplier(propName||'') : isLand ? m.land : m.sale;
  const diff = ((p - bm) / bm) * 100;
  return {
    verdict: diff<=-15?'割安':diff>=15?'割高':'相場並み',
    verdict_benchmark: Math.round(bm*100)/100,
    verdict_diff: Math.round(diff*100)/100,
  };
}

// ─── うちなーらいふ ──────────────────────────────────────────────
async function scrapeUchina(ctx, existingUrls) {
  const results = [];
  console.log('\n🏠 うちなーらいふ スクレイプ中...');
  for (let pg = 1; pg <= 10; pg++) {
    const url = pg===1
      ? 'https://www.e-uchina.net/list_all'
      : `https://www.e-uchina.net/list_all?page=${pg}`;
    const p = await ctx.newPage();
    try {
      await p.goto(url, { waitUntil:'networkidle', timeout:30000 });
      await p.waitForTimeout(1500);
      const cards = await p.evaluate((areas) => {
        const data = [];
        for (const card of document.querySelectorAll('.card')) {
          const linkEl = card.querySelector('a[href*="/detail.html"],a[href*="/bukken/"]');
          if (!linkEl) continue;
          const cardUrl = linkEl.href;
          const typeEl  = card.querySelector('.bukken-type');
          const propType = typeEl ? typeEl.textContent.trim() : '';
          const priceEl = card.querySelector('.bukken-data-price');
          let price = priceEl ? priceEl.textContent.replace(/\s+/g,'').replace(/お気に入り.*/,'').trim() : '';
          if (!price) { const pm=card.textContent.match(/([\d,]+(?:\.\d+)?万円)/); price=pm?pm[1]:'価格不明'; }
          const madoriEl = card.querySelector('.bukken-data-madori');
          let madori = '';
          if (madoriEl) { const m=madoriEl.textContent.match(/\d[SLDK]+/); madori=m?m[0]:''; }
          const addrEl = card.querySelector('.bukken-data-address');
          let area = '';
          if (addrEl) { const t=addrEl.textContent.trim(); for (const a of areas) { if(t.includes(a)){area=a;break;} } }
          const dm = cardUrl.match(/[a-z]-(\d{6})-/);
          const dateStr = dm?`20${dm[1].slice(0,2)}-${dm[1].slice(2,4)}-${dm[1].slice(4,6)}`:'';
          data.push({ url:cardUrl, propName:[propType,madori].filter(Boolean).join(' ')||'物件', price, area, dateStr });
        }
        return data;
      }, OKINAWA_AREAS);
      if (cards.length===0) { console.log(`  ページ${pg}: 0件 → 終了`); break; }
      let added=0;
      for (const c of cards) {
        if (existingUrls.has(c.url)) continue;
        existingUrls.add(c.url);
        results.push({ source:'うちなーらいふ', prop_name:c.propName, price:c.price||'価格不明', area:c.area||'エリア不明', url:c.url, date_str:c.dateStr||'', ...calcVerdict(c.propName,c.price,c.area) });
        added++;
      }
      console.log(`  ページ${pg}: ${cards.length}件スキャン / ${added}件新規`);
      if (added===0 && pg>2) { console.log('  新規なし2ページ連続 → 終了'); break; }
    } catch(e) { console.error(`  ページ${pg} エラー:`,e.message); break; }
    finally { await p.close(); }
  }
  console.log(`  ✅ うちなーらいふ: ${results.length}件新規`);
  return results;
}

// ─── goohome ────────────────────────────────────────────────────
async function scrapeGoohome(ctx, existingUrls) {
  const results = [];
  const CITY_SLUGS = [
    {slug:'naha',area:'那覇市'},{slug:'urasoe',area:'浦添市'},{slug:'ginowan',area:'宜野湾市'},
    {slug:'chatan',area:'北谷町'},{slug:'okinawa',area:'沖縄市'},{slug:'uruma',area:'うるま市'},
    {slug:'itoman',area:'糸満市'},{slug:'tomigusuku',area:'豊見城市'},{slug:'nanjo',area:'南城市'},
    {slug:'yomitan',area:'読谷村'},{slug:'nishihara',area:'西原町'},{slug:'nago',area:'名護市'},
  ];
  console.log('\n🏡 goohome スクレイプ中...');
  for (const {slug, area} of CITY_SLUGS) {
    for (const type of ['kodate','mansion']) {
      for (let pg=1; pg<=3; pg++) {
        const url = `https://goohome.jp/${type}/${slug}/?page=${pg}-20`;
        const p = await ctx.newPage();
        try {
          await p.goto(url, { waitUntil:'domcontentloaded', timeout:20000 });
          await p.waitForTimeout(1000);
          const cards = await p.evaluate((area) => {
            return [...document.querySelectorAll('.estate_incaset')].map(el => {
              const linkEl = el.querySelector('a[href]');
              if (!linkEl) return null;
              const href = linkEl.getAttribute('href')||'';
              const cardUrl = href.startsWith('http')?href:'https://goohome.jp'+href;
              const text = (el.innerText||'').replace(/\s+/g,' ').trim();
              const pm = text.match(/([\d,]+(?:\.\d+)?万円(?:\/月)?)/);
              const price = pm?pm[1]:null;
              const typeEl = el.querySelector('.estate_type,[class*="type"]');
              const propType = typeEl?typeEl.textContent.trim():'';
              return { url:cardUrl, price:price||'価格不明', area, propType };
            }).filter(Boolean);
          }, area);
          let added=0;
          for (const c of cards) {
            if (!c.url||existingUrls.has(c.url)) continue;
            existingUrls.add(c.url);
            const propName = c.propType||`${type==='kodate'?'戸建て':'マンション'}`;
            results.push({ source:'goohome', prop_name:propName, price:c.price, area:c.area, url:c.url, date_str:new Date().toISOString().slice(0,10), ...calcVerdict(propName,c.price,c.area) });
            added++;
          }
          if (cards.length===0||added===0) break;
        } catch(e) { break; }
        finally { await p.close(); }
      }
    }
  }
  console.log(`  ✅ goohome: ${results.length}件新規`);
  return results;
}

// ─── すまいずむ ──────────────────────────────────────────────────
async function scrapeSumaism(ctx, existingUrls) {
  const results = [];
  console.log('\n🏘️ すまいずむ スクレイプ中...');
  const urls = [
    'http://www.sumaism.net/chintai/index.aspx',
    'http://www.sumaism.net/baibai/index.aspx',
  ];
  for (const baseUrl of urls) {
    for (let pg=1; pg<=5; pg++) {
      const url = pg===1?baseUrl:`${baseUrl}?page=${pg}`;
      const p = await ctx.newPage();
      try {
        await p.goto(url, { waitUntil:'domcontentloaded', timeout:20000 });
        await p.waitForTimeout(1000);
        const cards = await p.evaluate((areas) => {
          return [...document.querySelectorAll('a[href*="detail"]')].map(linkEl => {
            const href = linkEl.href||'';
            if (!href.includes('sumaism.net')) return null;
            const parent = linkEl.closest('tr,li,div.item,[class*="item"]')||linkEl.parentElement;
            const text = parent?parent.textContent.replace(/\s+/g,' ').trim():'';
            const pm = text.match(/([\d,]+(?:\.\d+)?万円(?:\/月)?)/);
            const price = pm?pm[1]:'価格不明';
            let area='';
            for(const a of areas){if(text.includes(a)){area=a;break;}}
            const propName = parent?.querySelector('[class*="type"],[class*="name"]')?.textContent?.trim()||'物件';
            return { url:href, price, area, propName };
          }).filter(Boolean);
        }, OKINAWA_AREAS);
        let added=0;
        for (const c of cards) {
          if (!c.url||existingUrls.has(c.url)) continue;
          existingUrls.add(c.url);
          results.push({ source:'すまいずむ', prop_name:c.propName, price:c.price, area:c.area||'エリア不明', url:c.url, date_str:new Date().toISOString().slice(0,10), ...calcVerdict(c.propName,c.price,c.area) });
          added++;
        }
        if (cards.length===0||added===0) break;
      } catch(e) { break; }
      finally { await p.close(); }
    }
  }
  console.log(`  ✅ すまいずむ: ${results.length}件新規`);
  return results;
}

// ─── メイン ──────────────────────────────────────────────────────
(async () => {
  const existing = fs.existsSync(JSON_PATH) ? JSON.parse(fs.readFileSync(JSON_PATH,'utf8')) : [];
  const existingUrls = new Set(existing.map(r=>r.url).filter(Boolean));
  console.log(`既存: ${existing.length}件`);

  const br = await chromium.launch({ headless:true });
  const ctx = await br.newContext({ userAgent:'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' });

  const [a, b, c] = await Promise.all([
    scrapeUchina(ctx, existingUrls),
    scrapeGoohome(ctx, existingUrls),
    scrapeSumaism(ctx, existingUrls),
  ]);

  await br.close();

  const allNew = [...a, ...b, ...c];

  // LINE通知用に今日の新着を保存
  const TODAY_JSON = path.join(__dirname, '..', 'data', 'new_properties_today.json');
  fs.writeFileSync(TODAY_JSON, JSON.stringify(allNew, null, 2), 'utf8');

  if (allNew.length===0) {
    console.log('\n✅ 新規物件なし');
    process.exit(0);
  }

  const maxId = existing.reduce((m,r)=>Math.max(m,r.id||0),0);
  const withIds = allNew.map((r,i)=>({ id:maxId+i+1, scraped_at:new Date().toISOString(), ...r }));
  const merged = [...existing, ...withIds];
  fs.writeFileSync(JSON_PATH, JSON.stringify(merged,null,2),'utf8');

  console.log(`\n✅ 追加: ${allNew.length}件 / 合計: ${merged.length}件`);
  console.log(`  うちなーらいふ: ${a.length} / goohome: ${b.length} / すまいずむ: ${c.length}`);
})().catch(e=>{ console.error(e); process.exit(1); });
