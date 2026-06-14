/**
 * バッチ座標ファイルを properties.json にマージ
 */
const fs   = require('fs');
const path = require('path');

const JSON_PATH = path.join(__dirname, '..', 'data', 'properties.json');
const DATA_DIR  = path.join(__dirname, '..', 'data');

const all = JSON.parse(fs.readFileSync(JSON_PATH, 'utf8'));

// バッチファイルを全て読み込んでマージ
const merged = {};
const batchFiles = fs.readdirSync(DATA_DIR).filter(f => f.startsWith('coords_batch_'));
console.log('バッチファイル:', batchFiles);

for (const file of batchFiles) {
  const data = JSON.parse(fs.readFileSync(path.join(DATA_DIR, file), 'utf8'));
  Object.assign(merged, data);
}

let updated = 0, hasCoords = 0;
const result = all.map(r => {
  const c = merged[r.id];
  if (!c) return r;
  updated++;
  if (c.lat) hasCoords++;
  return { ...r, address_detail: c.address_detail, lat: c.lat, lng: c.lng };
});

fs.writeFileSync(JSON_PATH, JSON.stringify(result, null, 2), 'utf8');

// バッチファイル削除
for (const file of batchFiles) {
  fs.unlinkSync(path.join(DATA_DIR, file));
}

console.log(`✅ マージ完了: ${updated}件更新 / 座標取得: ${hasCoords}件 / 合計: ${result.length}件`);
