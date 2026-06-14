/**
 * LINE Messaging API で割安物件（-40%以上）を通知
 * 環境変数: LINE_CHANNEL_ACCESS_TOKEN, LINE_USER_ID
 */
const fs   = require('fs');
const path = require('path');
const https = require('https');

const TODAY_JSON = path.join(__dirname, '..', 'data', 'new_properties_today.json');
const TOKEN      = process.env.LINE_CHANNEL_ACCESS_TOKEN;
const USER_ID    = process.env.LINE_USER_ID;

if (!TOKEN || !USER_ID) {
  console.log('⚠️ LINE_CHANNEL_ACCESS_TOKEN または LINE_USER_ID が未設定。通知をスキップ。');
  process.exit(0);
}

if (!fs.existsSync(TODAY_JSON)) {
  console.log('new_properties_today.json がありません。スキップ。');
  process.exit(0);
}

const newProps = JSON.parse(fs.readFileSync(TODAY_JSON, 'utf8'));

// -40% 以上の割安物件を絞り込む
const bargains = newProps.filter(p =>
  p.verdict === '割安' && typeof p.verdict_diff === 'number' && p.verdict_diff <= -40
);

if (bargains.length === 0) {
  console.log(`✅ 新着${newProps.length}件中、-40%超の割安物件なし。通知スキップ。`);
  process.exit(0);
}

console.log(`📱 -40%超 割安物件 ${bargains.length}件 → LINE通知`);

function sendLine(text) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      to: USER_ID,
      messages: [{ type: 'text', text }],
    });
    const req = https.request({
      hostname: 'api.line.me',
      path: '/v2/bot/message/push',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${TOKEN}`,
        'Content-Length': Buffer.byteLength(body),
      },
    }, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        if (res.statusCode === 200) resolve();
        else reject(new Error(`LINE API ${res.statusCode}: ${data}`));
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

(async () => {
  // ヘッダー通知
  const date = new Date().toLocaleDateString('ja-JP', { timeZone: 'Asia/Tokyo', month:'long', day:'numeric' });
  await sendLine(`🏠 OKINAWA REsystem 新着アラート [${date}]\n-40%超の割安物件が ${bargains.length}件 見つかりました！`);

  // 物件ごとに通知（最大5件）
  for (const p of bargains.slice(0, 5)) {
    const diff = p.verdict_diff?.toFixed(0) ?? '?';
    const bm   = p.verdict_benchmark != null ? `相場${p.verdict_benchmark}万円` : '';
    const msg = [
      `📌 ${p.prop_name}`,
      `💰 ${p.price}（${diff}% / ${bm}）`,
      `📍 ${p.area}`,
      `🔗 ${p.url || 'URL不明'}`,
    ].join('\n');
    await sendLine(msg);
    await new Promise(r => setTimeout(r, 300));
  }

  if (bargains.length > 5) {
    await sendLine(`…他 ${bargains.length - 5}件あります。サイトで全件確認 → https://okinawa-bukken-app.vercel.app`);
  }

  console.log(`✅ LINE通知完了（${Math.min(bargains.length, 5)}件送信）`);
})().catch(e => { console.error('LINE通知エラー:', e.message); process.exit(1); });
