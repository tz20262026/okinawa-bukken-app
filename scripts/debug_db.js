const Database = require('better-sqlite3');
const path = require('path');
const db = new Database(path.join(__dirname, '..', 'data', 'properties.db'));

const rows = db.prepare('SELECT prop_name, price FROM properties LIMIT 3').all();
console.log('DBサンプル:');
rows.forEach(r => console.log(JSON.stringify(r)));

const allSale = db.prepare("SELECT id, prop_name, price, area FROM properties WHERE prop_name LIKE '売%'").all();
const low = allSale.filter(r => {
  const m = r.price && r.price.match(/^([\d.]+)万円$/);
  return m && parseFloat(m[1]) < 100;
});
console.log('\n低価格売買物件数:', low.length);
low.forEach(r => console.log(`  ID:${r.id} ${r.prop_name} / ${r.price} / ${r.area}`));
