/**
 * 沖縄 2026年6月 エリア別相場データ（1K基準）
 * 賃貸: 万円/月（1K基準 ─ 間取り補正は getVerdict で行う）
 * 売買: 万円（一戸建て・マンション平均）
 * 土地: 万円（土地のみ平均）
 */

type MarketData = {
  rent: number;   // 月額賃料 万円（1K基準）
  sale: number;   // 売買価格 万円
  land: number;   // 土地価格 万円
};

export const MARKET_2026: Record<string, MarketData> = {
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

/** 価格テキスト → 万円数値 */
export function parsePriceMan(price: string): number | null {
  if (!price || price === '価格不明') return null;
  const s = price.replace(/,/g, '').replace(/\s/g, '');

  const okuMan = s.match(/(\d+(?:\.\d+)?)億(\d+(?:\.\d+)?)万/);
  if (okuMan) return parseFloat(okuMan[1]) * 10000 + parseFloat(okuMan[2]);

  const oku = s.match(/(\d+(?:\.\d+)?)億/);
  if (oku) return parseFloat(oku[1]) * 10000;

  const man = s.match(/(\d+(?:\.\d+)?)万/);
  if (man) return parseFloat(man[1]);

  return null;
}

export type Verdict = '割安' | '相場並み' | '割高';

type VerdictResult = {
  verdict: Verdict;
  benchmark: number;
  diff: number;
};

/**
 * 間取りから賃料補正倍率を返す（1K基準 = 1.0）
 * 1K/1DK=1.0, 1LDK=1.25, 2DK/2LDK=1.55, 3DK/3LDK=1.95, 4LDK+=2.4
 */
function rentMultiplier(propName: string): number {
  if (/4LDK|5[SLDK]|6[SLDK]/i.test(propName)) return 2.4;
  if (/3LDK|3DK/i.test(propName))              return 1.95;
  if (/2LDK|2DK/i.test(propName))              return 1.55;
  if (/1LDK/i.test(propName))                  return 1.25;
  return 1.0; // 1K, 1DK
}

/** 物件の割安/割高判定 */
export function getVerdict(propName: string, price: string, area: string): VerdictResult | null {
  const m = MARKET_2026[area];
  if (!m) return null;

  const priceNum = parsePriceMan(price);
  if (priceNum === null) return null;

  // 商業・業務物件・収益投資物件は判定不能
  if (/店舗|事務所|倉庫|工場|駐車場|売アパート|売ビル|一棟|収益物件/.test(propName)) return null;

  // 売買を最優先判定（「売買マンション」「売アパート」は売買扱い）
  const isSaleProp = /売買|^売/.test(propName);
  const isLand     = /土地|農地|原野|田地|田んぼ|雑種地/.test(propName) || /^田$|^田[\s　]/.test(propName);

  // 売買でなく土地でもない → 賃貸判定
  const isRent = !isSaleProp && !isLand && (
    /賃貸|\/月|アパート|マンション|貸間/.test(propName + price) ||
    /\/月/.test(price) ||
    priceNum < 20   // 20万円未満は賃貸と推定
  );

  let benchmark: number;
  if (isRent) {
    // 1K基準に間取り補正を掛ける
    benchmark = m.rent * rentMultiplier(propName);
  } else if (isLand) {
    benchmark = m.land;
  } else {
    benchmark = m.sale;
  }

  const diff = ((priceNum - benchmark) / benchmark) * 100;

  let verdict: Verdict;
  if (diff <= -15)  verdict = '割安';
  else if (diff >= 15) verdict = '割高';
  else verdict = '相場並み';

  return { verdict, benchmark: Math.round(benchmark * 100) / 100, diff };
}
