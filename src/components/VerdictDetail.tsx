'use client';

import { useEffect } from 'react';
import { MARKET_2026, parsePriceMan } from '@/lib/market';

type VerdictProperty = {
  id: number;
  prop_name: string;
  price: string;
  area: string;
  url: string;
  verdict: string | null;
  verdict_benchmark: number | null;
  verdict_diff: number | null;
};

type Props = {
  property: VerdictProperty;
  areaProperties: VerdictProperty[];
  onClose: () => void;
};

export default function VerdictDetail({ property, areaProperties, onClose }: Props) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const market = MARKET_2026[property.area];
  const priceNum = parsePriceMan(property.price);
  const benchmark = property.verdict_benchmark;
  const diff = property.verdict_diff;
  const verdict = property.verdict;

  const isLand = /土地|農地|原野|田地|雑種地/.test(property.prop_name);
  const isSale = /売買|^売/.test(property.prop_name);
  const isRent = !isSale && !isLand && (priceNum !== null && priceNum < 20);
  const propTypeLabel = isLand ? '土地・農地系' : isRent ? '賃貸' : '売買';
  const benchmarkLabel = isLand ? '土地相場' : isRent ? '賃貸相場' : '売買相場';

  const sameAreaPrices = areaProperties
    .filter(p => p.id !== property.id && p.area === property.area)
    .map(p => parsePriceMan(p.price))
    .filter((n): n is number => n !== null && n > 0);
  const avgSameArea = sameAreaPrices.length >= 2
    ? sameAreaPrices.reduce((a, b) => a + b, 0) / sameAreaPrices.length
    : null;

  const maxVal = Math.max(priceNum ?? 0, benchmark ?? 0, avgSameArea ?? 0) * 1.25 || 1;

  const verdictCls =
    verdict === '割安' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
    verdict === '割高' ? 'bg-red-50 text-red-700 border-red-200' :
    'bg-slate-100 text-slate-600 border-slate-200';
  const barCls =
    verdict === '割安' ? 'bg-emerald-500' :
    verdict === '割高' ? 'bg-red-500' : 'bg-slate-400';

  const pct = (val: number) => String(Math.min((val / maxVal) * 100, 100).toFixed(1)) + '%';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="p-5 space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[11px] text-slate-400 mb-0.5">{property.area} · {propTypeLabel}</p>
              <h2 className="font-bold text-slate-800 text-sm leading-snug line-clamp-2">{property.prop_name}</h2>
            </div>
            <button onClick={onClose} className="shrink-0 w-7 h-7 flex items-center justify-center rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-500 text-sm transition-colors">✕</button>
          </div>

          {verdict && (
            <div className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-bold border ${verdictCls}`}>
              {verdict}
              {diff !== null && (
                <span className="text-xs font-normal opacity-70">（相場比 {diff > 0 ? '+' : ''}{diff.toFixed(1)}%）</span>
              )}
            </div>
          )}

          {priceNum !== null && benchmark !== null && benchmark !== undefined && (
            <div className="space-y-3">
              <h3 className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest">価格比較グラフ</h3>
              <div className="space-y-2.5">
                <div>
                  <div className="flex justify-between items-center text-xs text-slate-700 mb-1">
                    <span className="font-medium">この物件</span>
                    <span className="font-bold text-slate-900">{property.price}</span>
                  </div>
                  <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full transition-all ${barCls}`} style={{ width: pct(priceNum) }} />
                  </div>
                </div>
                <div>
                  <div className="flex justify-between items-center text-xs text-slate-700 mb-1">
                    <span className="font-medium">{property.area}の{benchmarkLabel}</span>
                    <span className="font-bold text-blue-700">{benchmark.toLocaleString()}万円</span>
                  </div>
                  <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full rounded-full bg-blue-400 transition-all" style={{ width: pct(benchmark) }} />
                  </div>
                </div>
                {avgSameArea !== null && (
                  <div>
                    <div className="flex justify-between items-center text-xs text-slate-700 mb-1">
                      <span className="font-medium">{property.area}の表示中平均（{sameAreaPrices.length}件）</span>
                      <span className="font-bold text-violet-700">{Math.round(avgSameArea).toLocaleString()}万円</span>
                    </div>
                    <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full rounded-full bg-violet-400 transition-all" style={{ width: pct(avgSameArea) }} />
                    </div>
                  </div>
                )}
              </div>
              <div className="flex items-center gap-3 text-[10px] text-slate-500">
                <span className="flex items-center gap-1"><span className={`w-2 h-2 rounded-full ${barCls}`} />この物件</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-400" />{benchmarkLabel}</span>
                {avgSameArea !== null && <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-violet-400" />表示中平均</span>}
              </div>
            </div>
          )}

          {market && (
            <div className="bg-slate-50 rounded-xl p-3.5">
              <h3 className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest mb-3">{property.area}の相場データ（2026年）</h3>
              <div className="grid grid-cols-3 gap-3 text-center">
                <div>
                  <p className="text-[10px] text-slate-500 mb-0.5">賃貸相場</p>
                  <p className="text-sm font-bold text-slate-800">{market.rent}万円</p>
                  <p className="text-[9px] text-slate-400">/月・1K基準</p>
                </div>
                <div>
                  <p className="text-[10px] text-slate-500 mb-0.5">売買相場</p>
                  <p className="text-sm font-bold text-slate-800">{market.sale.toLocaleString()}万円</p>
                </div>
                <div>
                  <p className="text-[10px] text-slate-500 mb-0.5">土地相場</p>
                  <p className="text-sm font-bold text-slate-800">{market.land.toLocaleString()}万円</p>
                </div>
              </div>
            </div>
          )}

          <div className="bg-blue-50 rounded-xl p-3 text-xs text-slate-600 space-y-0.5">
            <p className="font-semibold text-slate-700 mb-1">📊 判定基準</p>
            <p>• <span className="text-emerald-600 font-semibold">割安</span>：相場比 −15%以下（買いチャンス）</p>
            <p>• <span className="text-slate-500 font-semibold">相場並み</span>：相場比 ±15%以内</p>
            <p>• <span className="text-red-600 font-semibold">割高</span>：相場比 +15%以上</p>
            <p className="text-slate-400 text-[10px] mt-1">※相場データは2026年6月現在の独自調査値です</p>
          </div>

          {property.url && (
            <a href={property.url} target="_blank" rel="noopener noreferrer"
              className="flex items-center justify-center gap-1.5 w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-semibold transition-colors">
              詳細ページを見る →
            </a>
          )}
        </div>
      </div>
    </div>
  );
}