/** market.ts と完全同一ロジックで properties.json の verdict を再計算 */
const fs   = require('fs');
const path = require('path');

const JSON_PATH = path.join(__dirname, '..', 'data', 'properties.json');

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
  '宜野座村':  { rent: 4.5,  sale: 2400, land: 1200 },
  '金武町':    { rent: 4.5,  sale: 2400, land: 1200 },
  '名護市':    { rent: 4.8,  sale: 2600, land: 1400 },
  '今帰仁村':  { rent: 4.0,  sale: 2200, land: 1000 },
  '本部町':    { rent: 4.0,  sale: 2200, land: 1000 },
  '大宜味村':  { rent: 3.5,  sale: 1800, land:  800 },
  '国頭村':    { rent: 3.5,  sale: 1800, land:  800 },
  '東村':      { rent: 3.5,  sale: 1800, land:  800 },
  '伊江村':    { rent: 3.5,  sale: 1500, land:  700 },
  '石垣市':    { rent: 5.5,  sale: 3200, land: 1800 },
  '宮古島市':  { rent: 5.5,  sale: 3400, land: 2000 },
  '竹富町':    { rent: 4.5,  sale: 2400, land: 1200 },
  '与那国町':  { rent: 4.0,  sale: 2000, land: 1000 },
  '多良間村':  { rent: 3.5,  sale: 1600, land:  700 },
  '座間味村':  { rent: 4.0,  sale: 2000, land:  900 },
  '渡嘉敷村':  { rent: 4.0,  sale: 2000, land:  900 },
  '伊平屋村':  { rent: 3.5,  sale: 1600, land:  700 },
  '伊是名村':  { rent: 3.5,  sale: 1600, land:  700 },
};

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

function rentMultiplier(propName) {
  if (/4LDK|5[SLDK]|6[SLDK]/i.test(propName)) return 2.4;
  if (/3LDK|3DK/i.test(propName))              return 1.95;
  if (/2LDK|2DK/i.test(propName))              return 1.55;
  if (/1LDK/i.test(propName))                  return 1.25;
  return 1.0;
}

function calcVerdict(propName, price, area) {
  const m = MARKET_2026[area];
  if (!m) return { verdict: null, verdict_benchmark: null, verdict_diff: null };

  const priceNum = parsePriceMan(price);
  if (priceNum === null) return { verdict: null, verdict_benchmark: null, verdict_diff: null };

  // 商業・業務・収益投資物件・軍用地（通常の売買相場と市場が異なる）は判定しない
  if (/店舗|事務所|倉庫|工場|駐車場|売アパート|売ビル|一棟|収益物件|軍用地/.test(propName || '')) {
    return { verdict: null, verdict_benchmark: null, verdict_diff: null };
  }

  // 売買を最優先（「売買マンション」「売アパート」は売買）
  const isSaleProp = /売買|^売/.test(propName || '');
  const isLand     = /土地|農地|原野|田地|田んぼ|雑種地/.test(propName || '') || /^田$|^田[\s　]/.test(propName || '');

  const isRent = !isSaleProp && !isLand && (
    /賃貸|\/月|アパート|マンション|貸間/.test((propName || '') + (price || '')) ||
    /\/月/.test(price || '') ||
    priceNum < 20
  );

  let benchmark;
  if (isRent) {
    benchmark = m.rent * rentMultiplier(propName || '');
  } else if (isLand) {
    benchmark = m.land;
  } else {
    benchmark = m.sale;
  }

  const diff = ((priceNum - benchmark) / benchmark) * 100;

  // 相場比が信頼できる範囲外（大規模区画・シェア物件などの外れ値）は判定不能扱い
  if (diff < -85 || diff > 150) {
    return { verdict: null, verdict_benchmark: null, verdict_diff: null };
  }

  const verdict = diff <= -15 ? '割安' : diff >= 15 ? '割高' : '相場並み';

  return {
    verdict,
    verdict_benchmark: Math.round(benchmark * 100) / 100,
    verdict_diff:      Math.round(diff * 100) / 100,
  };
}

const rows    = JSON.parse(fs.readFileSync(JSON_PATH, 'utf8'));
const counts  = { '割安': 0, '相場並み': 0, '割高': 0, null: 0 };

const updated = rows.map(r => {
  const v = calcVerdict(r.prop_name || '', r.price || '', r.area || '');
  counts[v.verdict ?? 'null']++;
  return { ...r, verdict: v.verdict, verdict_benchmark: v.verdict_benchmark, verdict_diff: v.verdict_diff };
});

fs.writeFileSync(JSON_PATH, JSON.stringify(updated, null, 2), 'utf8');

console.log('✅ verdict 再計算完了');
console.log(`  割安: ${counts['割安']}件`);
console.log(`  相場並み: ${counts['相場並み']}件`);
console.log(`  割高: ${counts['割高']}件`);
console.log(`  対象外(null): ${counts['null']}件`);
console.log(`  合計: ${updated.length}件`);

// サンプル確認
const highSamples = updated.filter(r => r.verdict === '割高').slice(0, 5);
console.log('\n割高サンプル:');
highSamples.forEach(r => console.log(` ${r.source} | ${r.area} | ${r.price} | ${r.prop_name?.slice(0,30)} | bm:${r.verdict_benchmark} diff:${r.verdict_diff}`));

const lowSamples = updated.filter(r => r.verdict === '割安').slice(0, 5);
console.log('\n割安サンプル:');
lowSamples.forEach(r => console.log(` ${r.source} | ${r.area} | ${r.price} | ${r.prop_name?.slice(0,30)} | bm:${r.verdict_benchmark} diff:${r.verdict_diff}`));
