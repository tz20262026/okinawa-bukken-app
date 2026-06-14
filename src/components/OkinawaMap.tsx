'use client';

type Props = {
  selected: string;
  onSelect: (area: string) => void;
  counts: Record<string, number>;
};

const AREA_GROUPS = [
  {
    label: '北部',
    emoji: '🌿',
    bg: 'bg-emerald-50',
    headerBg: 'bg-emerald-100',
    activeBg: 'bg-emerald-600',
    activeBorder: 'border-emerald-600',
    textColor: 'text-emerald-800',
    countBg: 'bg-emerald-600',
    cities: ['名護市', '本部町', '今帰仁村', '大宜味村', '国頭村', '東村', '恩納村', '宜野座村', '金武町'],
  },
  {
    label: '中部',
    emoji: '🌆',
    bg: 'bg-blue-50',
    headerBg: 'bg-blue-100',
    activeBg: 'bg-blue-600',
    activeBorder: 'border-blue-600',
    textColor: 'text-blue-800',
    countBg: 'bg-blue-600',
    cities: ['うるま市', '沖縄市', '北谷町', '嘉手納町', '読谷村', '宜野湾市', '浦添市', '北中城村', '中城村'],
  },
  {
    label: '南部',
    emoji: '🏙️',
    bg: 'bg-violet-50',
    headerBg: 'bg-violet-100',
    activeBg: 'bg-violet-600',
    activeBorder: 'border-violet-600',
    textColor: 'text-violet-800',
    countBg: 'bg-violet-600',
    cities: ['那覇市', '豊見城市', '糸満市', '南城市', '与那原町', '西原町', '八重瀬町'],
  },
  {
    label: '離島',
    emoji: '🏝️',
    bg: 'bg-amber-50',
    headerBg: 'bg-amber-100',
    activeBg: 'bg-amber-600',
    activeBorder: 'border-amber-600',
    textColor: 'text-amber-800',
    countBg: 'bg-amber-600',
    cities: ['石垣市', '宮古島市', '竹富町', '与那国町', '多良間村', '伊江村', '座間味村', '渡嘉敷村', '伊平屋村', '伊是名村'],
  },
];

export default function OkinawaMap({ selected, onSelect, counts }: Props) {
  return (
    <div className="space-y-3">
      {AREA_GROUPS.map(group => {
        const regionTotal = group.cities.reduce((sum, c) => sum + (counts[c] || 0), 0);

        return (
          <div key={group.label} className={`rounded-xl overflow-hidden border border-gray-100`}>
            {/* グループヘッダー */}
            <div className={`${group.headerBg} px-4 py-2.5 flex items-center justify-between`}>
              <span className={`font-bold text-sm ${group.textColor}`}>
                {group.emoji} {group.label}
              </span>
              {regionTotal > 0 && (
                <span className={`${group.countBg} text-white text-xs font-bold px-2.5 py-1 rounded-full`}>
                  計{regionTotal}件
                </span>
              )}
            </div>

            {/* 市区町村ボタングリッド */}
            <div className={`${group.bg} p-3 grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2`}>
              {group.cities.map(city => {
                const count = counts[city] || 0;
                const isSelected = selected === city;

                return (
                  <button
                    key={city}
                    onClick={() => onSelect(isSelected ? '' : city)}
                    disabled={count === 0 && !isSelected}
                    className={`
                      relative flex flex-col items-center justify-center
                      min-h-[60px] px-2 py-2.5 rounded-xl border-2
                      font-medium text-sm transition-all
                      ${isSelected
                        ? `${group.activeBg} ${group.activeBorder} text-white shadow-md scale-95`
                        : count > 0
                          ? `bg-white border-gray-200 ${group.textColor} hover:border-current hover:shadow-sm active:scale-95`
                          : 'bg-white/40 border-gray-100 text-gray-300 cursor-default'
                      }
                    `}
                  >
                    <span className="leading-tight text-center">{city}</span>
                    {count > 0 && (
                      <span className={`
                        mt-1 text-xs font-bold px-1.5 py-0.5 rounded-full
                        ${isSelected ? 'bg-white/30 text-white' : `${group.countBg} text-white`}
                      `}>
                        {count}件
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
  );
}
