/**
 * 物件住所＆座標取得バッチ（4並列用）
 * 使い方: node scrape_coords_batch.js --batch 0 --total 4
 */
const { chromium } = require('playwright');
const fs   = require('fs');
const path = require('path');
const https = require('https');

const args = process.argv.slice(2);
const batchIdx   = parseInt(args[args.indexOf('--batch')   + 1] ?? '0');
const totalBatch = parseInt(args[args.indexOf('--total')   + 1] ?? '4');

const JSON_PATH  = path.join(__dirname, '..', 'data', 'properties.json');
const OUT_PATH   = path.join(__dirname, '..', 'data', `coords_batch_${batchIdx}.json`);

const all  = JSON.parse(fs.readFileSync(JSON_PATH, 'utf8'));
// lat/lng 未設定のもののみ対象
const targets = all.filter(r => r.url && r.lat == null);
const chunkSize = Math.ceil(targets.length / totalBatch);
const batch = targets.slice(batchIdx * chunkSize, (batchIdx + 1) * chunkSize);

console.log(`[Batch ${batchIdx}] 対象: ${batch.length}件 / 全体: ${targets.length}件`);

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// Nominatim ジオコーディング（1秒間隔必須）
async function geocode(address) {
  const query = encodeURIComponent('沖縄県' + address);
  const url = `https://nominatim.openstreetmap.org/search?q=${query}&format=json&limit=1&countrycodes=jp`;
  return new Promise((resolve) => {
    const req = https.get(url, {
      headers: { 'User-Agent': 'OkinawaREsystem/1.0 (tz77772014@gmail.com)' }
    }, (res) => {
      let body = '';
      res.on('data', d => body += d);
      res.on('end', () => {
        try {
          const data = JSON.parse(body);
          if (data[0]) resolve({ lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) });
          else resolve(null);
        } catch { resolve(null); }
      });
    });
    req.on('error', () => resolve(null));
    req.setTimeout(8000, () => { req.destroy(); resolve(null); });
  });
}

// 住所抽出（ソース別）
async function extractAddress(page, source) {
  return await page.evaluate((src) => {
    // うちなーらいふ
    if (src === 'うちなーらいふ') {
      const ths = [...document.querySelectorAll('th, td')];
      const idx = ths.findIndex(el => /所在地/.test(el.textContent || ''));
      if (idx >= 0 && ths[idx + 1]) {
        return ths[idx + 1].textContent.replace(/\s*地図\s*/, '').trim();
      }
      // フォールバック：テキストから
      const m = document.body.innerText.match(/所在地\s*[\t\n]\s*([^\n]+)/);
      return m ? m[1].replace(/\s*地図\s*/, '').trim() : '';
    }
    // goohome
    if (src === 'goohome') {
      const addrEl = document.querySelector('[class*="address"]');
      if (addrEl) {
        const t = addrEl.textContent.trim();
        if (t && !/^地図/.test(t)) return '沖縄県' + t;
      }
      const m = document.body.innerText.match(/所在地\s*[\t\n]\s*(沖縄県[^\n]+)/);
      return m ? m[1].trim() : '';
    }
    // すまいずむ
    const m = document.body.innerText.match(/沖縄県[^\n　 ]{3,40}/);
    return m ? m[0].trim() : '';
  }, source);
}

(async () => {
  const results = {};
  const br = await chromium.launch({ headless: true });
  const ctx = await br.newContext({ userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' });

  // 住所キャッシュ（同住所の重複ジオコーディング防止）
  const geoCache = {};
  let ok = 0, fail = 0;

  for (let i = 0; i < batch.length; i++) {
    const prop = batch[i];
    if (i % 50 === 0) console.log(`[Batch ${batchIdx}] ${i}/${batch.length} (ok:${ok} fail:${fail})`);

    const page = await ctx.newPage();
    try {
      await page.goto(prop.url, { waitUntil: 'domcontentloaded', timeout: 20000 });
      await page.waitForTimeout(800);

      let address = await extractAddress(page, prop.source);
      if (!address && prop.area) address = prop.area; // フォールバック：市区町村名

      let geo = null;
      if (address) {
        if (geoCache[address]) {
          geo = geoCache[address];
        } else {
          await sleep(1100); // Nominatim 1req/sec 制限
          geo = await geocode(address);
          if (geo) geoCache[address] = geo;
        }
      }

      results[prop.id] = {
        address_detail: address || prop.area || '',
        lat: geo?.lat ?? null,
        lng: geo?.lng ?? null,
      };
      if (geo) ok++; else fail++;
    } catch (e) {
      results[prop.id] = { address_detail: prop.area || '', lat: null, lng: null };
      fail++;
    } finally {
      await page.close();
    }
  }

  await br.close();
  fs.writeFileSync(OUT_PATH, JSON.stringify(results, null, 2), 'utf8');
  console.log(`[Batch ${batchIdx}] 完了! ok:${ok} fail:${fail} → ${OUT_PATH}`);
})();
