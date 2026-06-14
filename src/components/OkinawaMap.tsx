'use client';

type Region = 'south' | 'central' | 'north' | 'islands';

type Props = {
  selected: string;
  onSelect: (area: string) => void;
  counts: Record<string, number>;
};

const REGIONS: { id: Region; label: string; emoji: string; color: string; activeColor: string; cities: string[] }[] = [
  {
    id: 'north',
    label: '北部',
    emoji: '🌿',
    color: '#d1fae5',
    activeColor: '#059669',
    cities: ['名護市', '本部町', '今帰仁村', '大宜味村', '国頭村', '東村', '恩納村', '宜野座村', '金武町'],
  },
  {
    id: 'central',
    label: '中部',
    emoji: '🌆',
    color: '#dbeafe',
    activeColor: '#2563eb',
    cities: ['うるま市', '沖縄市', '北谷町', '嘉手納町', '読谷村', '宜野湾市', '浦添市', '北中城村', '中城村'],
  },
  {
    id: 'south',
    label: '南部',
    emoji: '🏙️',
    color: '#ede9fe',
    activeColor: '#7c3aed',
    cities: ['那覇市', '豊見城市', '糸満市', '南城市', '与那原町', '西原町', '八重瀬町'],
  },
  {
    id: 'islands',
    label: '離島',
    emoji: '🏝️',
    color: '#fef3c7',
    activeColor: '#d97706',
    cities: ['石垣市', '宮古島市', '竹富町', '与那国町', '多良間村', '伊江村', '座間味村', '渡嘉敷村', '伊平屋村', '伊是名村'],
  },
];

const CITY_POSITIONS: Record<string, { x: number; y: number }> = {
  '国頭村': { x: 120, y: 28 },
  '大宜味村': { x: 110, y: 50 },
  '東村': { x: 135, y: 55 },
  '今帰仁村': { x: 95, y: 62 },
  '本部町': { x: 88, y: 72 },
  '名護市': { x: 115, y: 80 },
  '恩納村': { x: 100, y: 105 },
  '宜野座村': { x: 128, y: 108 },
  '金武町': { x: 133, y: 120 },
  'うるま市': { x: 138, y: 140 },
  '沖縄市': { x: 120, y: 148 },
  '北谷町': { x: 102, y: 148 },
  '嘉手納町': { x: 108, y: 158 },
  '読谷村': { x: 90, y: 155 },
  '北中城村': { x: 132, y: 160 },
  '中城村': { x: 125, y: 168 },
  '宜野湾市': { x: 108, y: 172 },
  '浦添市': { x: 108, y: 185 },
  '那覇市': { x: 100, y: 200 },
  '豊見城市': { x: 112, y: 210 },
  '南城市': { x: 128, y: 205 },
  '与那原町': { x: 128, y: 195 },
  '西原町': { x: 118, y: 190 },
  '糸満市': { x: 100, y: 222 },
  '八重瀬町': { x: 120, y: 220 },
};

function getRegionForCity(city: string): Region | null {
  for (const r of REGIONS) {
    if (r.cities.includes(city)) return r.id;
  }
  return null;
}

function getCityCount(city: string, counts: Record<string, number>): number {
  return counts[city] || 0;
}

export default function OkinawaMap({ selected, onSelect, counts }: Props) {
  const selectedRegion = selected ? getRegionForCity(selected) : null;

  const handleCityClick = (city: string) => {
    onSelect(selected === city ? '' : city);
  };

  return (
    <div className="flex flex-col lg:flex-row gap-4">
      {/* SVG地図 */}
      <div className="bg-gradient-to-b from-sky-100 to-blue-50 rounded-xl border border-blue-100 p-3 flex-shrink-0">
        <p className="text-xs text-center text-blue-500 font-medium mb-2">🗺️ 沖縄本島マップ（クリックで絞り込み）</p>
        <svg viewBox="0 0 240 260" className="w-[200px] mx-auto" style={{ filter: 'drop-shadow(0 2px 8px rgba(0,0,0,0.10))' }}>
          {/* 海の背景 */}
          <rect width="240" height="260" fill="url(#seaGradient)" rx="12" />
          <defs>
            <radialGradient id="seaGradient" cx="50%" cy="50%" r="70%">
              <stop offset="0%" stopColor="#bfdbfe" />
              <stop offset="100%" stopColor="#93c5fd" />
            </radialGradient>
          </defs>

          {/* 本島シルエット（簡略化パス） */}
          <path
            d="M118,22 C122,20 128,24 130,30 C134,40 132,52 128,60
               C140,65 145,78 138,88 C132,95 125,98 130,110
               C136,122 142,132 140,145 C138,158 132,162 128,168
               C126,175 120,180 118,188 C116,196 112,205 106,210
               C100,218 96,224 100,230 C96,230 90,228 88,222
               C84,215 90,208 94,200 C90,195 88,188 90,182
               C92,176 98,170 100,162 C98,155 92,150 88,145
               C84,140 82,134 84,128 C86,120 92,115 94,108
               C90,100 86,92 88,84 C90,76 96,68 98,62
               C96,55 90,52 88,46 C86,38 90,28 96,24 Z"
            fill="#f0fdf4"
            stroke="#86efac"
            strokeWidth="1.5"
          />

          {/* 各市区町村ドット */}
          {Object.entries(CITY_POSITIONS).map(([city, pos]) => {
            const region = getRegionForCity(city);
            const regionInfo = REGIONS.find(r => r.id === region);
            const isSelected = selected === city;
            const count = getCityCount(city, counts);
            const hasData = count > 0;

            return (
              <g key={city} onClick={() => handleCityClick(city)} style={{ cursor: 'pointer' }}>
                <circle
                  cx={pos.x}
                  cy={pos.y}
                  r={isSelected ? 9 : hasData ? 7 : 5}
                  fill={isSelected ? regionInfo?.activeColor : hasData ? regionInfo?.color : '#e5e7eb'}
                  stroke={isSelected ? regionInfo?.activeColor : hasData ? regionInfo?.activeColor : '#d1d5db'}
                  strokeWidth={isSelected ? 2.5 : 1.5}
                  opacity={hasData ? 1 : 0.5}
                />
                {hasData && (
                  <text
                    x={pos.x}
                    y={pos.y + 1}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fontSize="5"
                    fontWeight="700"
                    fill={isSelected ? 'white' : regionInfo?.activeColor}
                  >
                    {count}
                  </text>
                )}
                {isSelected && (
                  <text
                    x={pos.x}
                    y={pos.y - 12}
                    textAnchor="middle"
                    fontSize="6"
                    fontWeight="600"
                    fill={regionInfo?.activeColor}
                  >
                    {city}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
        <p className="text-xs text-center text-gray-400 mt-1">● 数字 = 物件数</p>
      </div>

      {/* 地域別ボタン一覧 */}
      <div className="flex-1 space-y-3">
        {REGIONS.map(region => {
          const regionCount = region.cities.reduce((sum, c) => sum + (counts[c] || 0), 0);
          return (
            <div key={region.id} className="border border-gray-100 rounded-xl overflow-hidden">
              <div className="px-3 py-2 flex items-center justify-between"
                style={{ backgroundColor: region.color }}>
                <span className="text-sm font-semibold text-gray-700">{region.emoji} {region.label}</span>
                <span className="text-xs font-medium px-2 py-0.5 rounded-full text-white"
                  style={{ backgroundColor: region.activeColor }}>
                  計{regionCount}件
                </span>
              </div>
              <div className="p-2 flex flex-wrap gap-1.5 bg-white">
                {region.cities.map(city => {
                  const count = counts[city] || 0;
                  const isActive = selected === city;
                  return (
                    <button
                      key={city}
                      onClick={() => handleCityClick(city)}
                      className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-all ${
                        isActive
                          ? 'text-white border-transparent shadow-sm'
                          : count > 0
                          ? 'bg-white text-gray-700 hover:shadow-sm border-gray-200'
                          : 'bg-gray-50 text-gray-400 border-gray-100 cursor-default'
                      }`}
                      style={isActive ? { backgroundColor: region.activeColor, borderColor: region.activeColor } : {}}
                      disabled={!isActive && count === 0}
                    >
                      {city}
                      {count > 0 && (
                        <span className={`ml-1 text-xs ${isActive ? 'text-white/80' : 'text-gray-400'}`}>
                          {count}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
