/**
 * 沖縄 2026年6月 エリア別相場データ
 * 賃貸: 万円/月（1K〜2LDKの平均）
 * 売買: 万円（一戸建て・マンション平均）
 * 土地: 万円（土地のみ平均）
 * 出典: 国土交通省地価公示・各社平均値を基に推計
 */

type MarketData = {
  rent: number;   // 月額賃料 万円
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

  // 1億xxxx万円
  const okuMan = s.match(/(\d+(?:\.\d+)?)億(\d+(?:\.\d+)?)万/);
  if (okuMan) return parseFloat(okuMan[1]) * 10000 + parseFloat(okuMan[2]);

  // x億円
  const oku = s.match(/(\d+(?:\.\d+)?)億/);
  if (oku) return parseFloat(oku[1]) * 10000;

  // xx万円
  const man = s.match(/(\d+(?:\.\d+)?)万/);
  if (man) return parseFloat(man[1]);

  return null;
}

export type Verdict = '割安' | '相場並み' | '割高';

type VerdictResult = {
  verdict: Verdict;
  benchmark: number; // 万円
  diff: number;      // % (正=高い)
};

/** 物件の割安/割高判定 */
export function getVerdict(propName: string, price: string, area: string): VerdictResult | null {
  const m = MARKET_2026[area];
  if (!m) return null;

  const priceNum = parsePriceMan(price);
  if (priceNum === null) return null;

  // 物件種別を推定
  const isRent = /賃貸|\/月|アパート|マンション|貸間/.test(propName + price) ||
                 /\/月/.test(price);
  const isLand = /土地/.test(propName);

  let benchmark: number;
  if (isRent) {
    benchmark = m.rent;
  } else if (isLand) {
    benchmark = m.land;
  } else {
    benchmark = m.sale;
  }

  const diff = ((priceNum - benchmark) / benchmark) * 100;

  let verdict: Verdict;
  if (diff <= -15) verdict = '割安';
  else if (diff >= 15) verdict = '割高';
  else verdict = '相場並み';

  return { verdict, benchmark, diff };
}
