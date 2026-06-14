const Database = require('better-sqlite3');
const path = require('path');
const db = new Database(path.join(__dirname, '..', 'data', 'properties.db'));

// DBの総件数とテーブル構造
const count = db.prepare('SELECT COUNT(*) as cnt FROM properties').get();
console.log('DB総件数:', count.cnt);

// 売買原野の件数
const genや = db.prepare("SELECT COUNT(*) as cnt FROM properties WHERE prop_name LIKE '%原野%'").get();
console.log('原野物件数:', genや.cnt);

// 1.48万円があるか
const check = db.prepare("SELECT * FROM properties WHERE price='1.48万円' LIMIT 5").all();
console.log('1.48万円 DB件数:', check.length);
check.forEach(r => console.log(r));

// IDが979のレコード
const byId = db.prepare('SELECT * FROM properties WHERE id=979').get();
console.log('ID=979:', byId);
