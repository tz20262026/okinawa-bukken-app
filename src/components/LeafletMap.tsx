'use client';

import { useEffect, useState } from 'react';
import { MapContainer, TileLayer, CircleMarker, Tooltip, Popup, useMapEvents } from 'react-leaflet';

type Property = {
  id: number;
  source: string;
  prop_name: string;
  price: string;
  area: string;
  url: string;
  date_str: string;
  scraped_at: string;
  verdict: string | null;
  verdict_benchmark: number | null;
  verdict_diff: number | null;
  lat?: number | null;
  lng?: number | null;
  address_detail?: string;
};

type AreaVerdictCounts = Record<string, { yasui: number; soba: number; takai: number; total: number }>;

type Props = {
  properties: Property[];
  selectedArea: string;
  onAreaSelect: (area: string) => void;
  areaCounts: Record<string, number>;
  areaVerdictCounts: AreaVerdictCounts;
};

const CITY_COORDS: Record<string, [number, number]> = {
  '那覇市':    [26.2124, 127.6809], '浦添市':    [26.2461, 127.7219],
  '豊見城市':  [26.1553, 127.6686], '宜野湾市':  [26.2815, 127.7798],
  '北谷町':    [26.3212, 127.7731], '嘉手納町':  [26.3628, 127.7562],
  '沖縄市':    [26.3344, 127.8020], 'うるま市':  [26.3786, 127.8585],
  '北中城村':  [26.2953, 127.8102], '中城村':    [26.2688, 127.7973],
  '読谷村':    [26.3960, 127.7453], '西原町':    [26.2446, 127.7521],
  '与那原町':  [26.2001, 127.7541], '南城市':    [26.1666, 127.7659],
  '糸満市':    [26.1208, 127.6699], '八重瀬町':  [26.1501, 127.7331],
  '恩納村':    [26.4914, 127.8560], '宜野座村':  [26.4858, 128.0009],
  '金武町':    [26.4513, 127.9213], '名護市':    [26.5916, 127.9772],
  '今帰仁村':  [26.6939, 127.9122], '本部町':    [26.6597, 127.8830],
  '大宜味村':  [26.7052, 128.0497], '国頭村':    [26.8397, 128.1958],
  '東村':      [26.6443, 128.1590], '伊江村':    [26.7244, 127.8012],
  '石垣市':    [24.3448, 124.1561], '宮古島市':  [24.8056, 125.2814],
  '竹富町':    [24.2459, 124.0576], '与那国町':  [24.4671, 122.9967],
  '多良間村':  [24.6617, 124.7131], '座間味村':  [26.2285, 127.3047],
  '渡嘉敷村':  [26.1934, 127.3634], '伊平屋村':  [27.0572, 127.9672],
  '伊是名村':  [26.9279, 127.9197],
};

function getAreaMarkerColor(yasui: number, takai: number, total: number): string {
  if (total === 0) return '#94a3b8';
  if (yasui / total >= 0.4) return '#10b981';
  if (takai / total >= 0.5) return '#ef4444';
  return '#6366f1';
}

function getVerdictColor(verdict: string | null): string {
  if (verdict === '割安') return '#10b981';
  if (verdict === '割高') return '#ef4444';
  if (verdict === '相場並み') return '#6366f1';
  return '#94a3b8';
}

function ZoomTracker({ onZoom }: { onZoom: (z: number) => void }) {
  const map = useMapEvents({ zoomend: () => onZoom(map.getZoom()) });
  useEffect(() => { onZoom(map.getZoom()); }, []);
  return null;
}

export default function LeafletMap({ properties, selectedArea, onAreaSelect, areaCounts, areaVerdictCounts }: Props) {
  const [zoom, setZoom] = useState(10);
  const showIndividual = zoom >= 12;

  // 座標を持つ物件（現在フィルター済み properties から）
  const propWithCoords = properties.filter(p => p.lat && p.lng);

  // エリアマーカー（低ズーム時）
  const areaMarkers = Object.entries(areaCounts)
    .filter(([city, cnt]) => CITY_COORDS[city] && cnt > 0)
    .map(([city, cnt]) => {
      const vc = areaVerdictCounts[city] || { yasui: 0, takai: 0, total: 0 };
      const color = getAreaMarkerColor(vc.yasui, vc.takai, vc.total || cnt);
      const radius = Math.max(8, Math.min(28, 8 + Math.sqrt(cnt) * 2.5));
      return { city, coords: CITY_COORDS[city], cnt, color, radius, yasui: vc.yasui, takai: vc.takai };
    });

  return (
    <div className="w-full h-full relative">
      <MapContainer
        center={[26.35, 127.85]}
        zoom={10}
        style={{ width: '100%', height: '100%', borderRadius: '0.75rem' }}
        scrollWheelZoom
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <ZoomTracker onZoom={setZoom} />

        {/* ── エリアマーカー（ズーム12未満） ── */}
        {!showIndividual && areaMarkers.map(({ city, coords, cnt, color, radius, yasui, takai }) => (
          <CircleMarker
            key={city}
            center={coords}
            radius={radius}
            pathOptions={{
              color: selectedArea === city ? '#1e293b' : color,
              fillColor: color,
              fillOpacity: selectedArea === city ? 1.0 : 0.75,
              weight: selectedArea === city ? 3 : 1.5,
            }}
            eventHandlers={{ click: () => onAreaSelect(selectedArea === city ? '' : city) }}
          >
            <Tooltip permanent={cnt >= 20} direction="top" offset={[0, -radius]}>
              <div className="text-center text-xs">
                <div className="font-bold">{city}</div>
                <div>{cnt}件</div>
                <div><span className="text-emerald-600">割安{yasui}</span> / <span className="text-red-500">割高{takai}</span></div>
              </div>
            </Tooltip>
          </CircleMarker>
        ))}

        {/* ── 個別物件ピン（ズーム12以上） ── */}
        {showIndividual && propWithCoords.map(p => {
          const color = getVerdictColor(p.verdict);
          return (
            <CircleMarker
              key={p.id}
              center={[p.lat!, p.lng!]}
              radius={7}
              pathOptions={{ color: '#fff', fillColor: color, fillOpacity: 0.9, weight: 1.5 }}
            >
              <Popup maxWidth={280}>
                <div className="text-xs space-y-1">
                  <div className="font-bold text-sm text-slate-800 leading-snug">{p.prop_name}</div>
                  <div className="text-slate-500">{p.address_detail || p.area}</div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-slate-800">{p.price}</span>
                    {p.verdict && (
                      <span className="px-1.5 py-0.5 rounded text-white text-[10px] font-bold"
                        style={{ background: color }}>
                        {p.verdict}
                        {p.verdict_diff != null && ` (${p.verdict_diff > 0 ? '+' : ''}${p.verdict_diff.toFixed(0)}%)`}
                      </span>
                    )}
                  </div>
                  <div className="text-slate-400">{p.source} · {(p.date_str || p.scraped_at || '').slice(0, 10)}</div>
                  {p.url && (
                    <a href={p.url} target="_blank" rel="noopener noreferrer"
                      className="inline-block mt-1 text-blue-500 hover:underline font-semibold">
                      詳細を見る →
                    </a>
                  )}
                </div>
              </Popup>
            </CircleMarker>
          );
        })}
      </MapContainer>

      {/* 凡例 */}
      <div className="absolute bottom-3 left-3 z-[1000] bg-white/90 backdrop-blur-sm rounded-xl px-3 py-2 shadow-md border border-slate-100 text-xs space-y-1">
        <div className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-emerald-500 inline-block" />割安</div>
        <div className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-indigo-500 inline-block" />相場並み</div>
        <div className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-red-500 inline-block" />割高</div>
        <div className="text-slate-400 pt-0.5 border-t border-slate-100">
          {showIndividual ? `📍 個別ピン表示中` : '🔍 拡大で個別ピン表示'}
        </div>
      </div>
    </div>
  );
}
