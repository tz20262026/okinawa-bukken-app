/**
 * 割安物件（-40%以上）を通知
 * - ntfy.sh プッシュ通知（アカウント不要、スマホアプリで受信）
 * - LINE Messaging API（LINE_CHANNEL_ACCESS_TOKEN + LINE_USER_ID が設定済みの場合）
 */
const fs    = require('fs');
const path  = require('path');
const https = require('https');

// ntfy.sh トピック（固有のランダム文字列で他人が見られないようにする）
const NTFY_TOPIC = 'okinawa-bukken-tz20262026';

const TODAY_JSON = path.join(__dirname, '..', 'data', 'new_properties_today.json');
const LINE_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN;
const LINE_UID   = process.env.LINE_USER_ID;

if (!fs.existsSync(TODAY_JSON)) {
  console.log('new_properties_today.json がありません。スキップ。');
  process.exit(0);
}

const newProps = JSON.parse(fs.readFileSync(TODAY_JSON, 'utf8'));

// -40% 以上の割安物件を絞り込む
const bargains = newProps.filter(p =>
  p.verdict === '割安' && typeof p.verdict_diff === 'number' && p.verdict_diff <= -40
);

console.log(`新着: ${newProps.length}件 / -40%超 割安: ${bargains.length}件`);

if (bargains.length === 0) {
  console.log('✅ -40%超の割安物件なし。通知スキップ。');
  process.exit(0);
}

// ─── HTTP POST ヘルパー ──────────────────────────────────────────
function httpPost(options, body) {
  return new Promise((resolve, reject) => {
    const data = typeof body === 'string' ? body : JSON.stringify(body);
    const req = https.request({
      ...options,
      headers: {
        'Content-Length': Buffer.byteLength(data),
        ...(options.headers || {}),
      },
    }, res => {
      let resp = '';
      res.on('data', c => resp += c);
      res.on('end', () => resolve({ status: res.statusCode, body: resp }));
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

// ─── ntfy.sh 通知 ───────────────────────────────────────────────
async function sendNtfy(title, message, url) {
  const res = await httpPost({
    hostname: 'ntfy.sh',
    path: `/${NTFY_TOPIC}`,
    method: 'POST',
    headers: {
      'Title': encodeURIComponent(title),
      'Priority': 'high',
      ...(url ? { 'Click': url } : {}),
      'Content-Type': 'text/plain; charset=utf-8',
    },
  }, message);
  if (res.status !== 200) throw new Error(`ntfy ${res.status}: ${res.body}`);
}

// ─── LINE 通知 ──────────────────────────────────────────────────
async function sendLine(text) {
  if (!LINE_TOKEN || !LINE_UID) return;
  const res = await httpPost({
    hostname: 'api.line.me',
    path: '/v2/bot/message/push',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${LINE_TOKEN}`,
    },
  }, JSON.stringify({ to: LINE_UID, messages: [{ type: 'text', text }] }));
  if (res.status !== 200) throw new Error(`LINE API ${res.status}: ${res.body}`);
}

// ─── メイン ─────────────────────────────────────────────────────
(async () => {
  const date = new Date().toLocaleDateString('ja-JP', { timeZone: 'Asia/Tokyo', month: 'long', day: 'numeric' });
  const summary = `🏠 割安物件 ${bargains.length}件発見！ [${date}]`;

  // ntfy.sh ── まとめて1回
  try {
    const lines = bargains.slice(0, 5).map(p => {
      const diff = p.verdict_diff?.toFixed(0) ?? '?';
      return `${p.area} ${p.price}（${diff}%）${p.prop_name}`;
    }).join('\n');
    await sendNtfy(
      summary,
      lines + (bargains.length > 5 ? `\n…他${bargains.length - 5}件` : ''),
      'https://okinawa-bukken-app.vercel.app'
    );
    console.log('✅ ntfy.sh 通知送信');
  } catch (e) {
    console.error('❌ ntfy.sh エラー:', e.message);
  }

  // LINE ── 個別送信（設定済みの場合のみ）
  if (LINE_TOKEN && LINE_UID) {
    try {
      await sendLine(`${summary}\n\n${bargains.slice(0, 5).map(p => {
        const diff = p.verdict_diff?.toFixed(0) ?? '?';
        const bm   = p.verdict_benchmark != null ? `相場${p.verdict_benchmark}万円` : '';
        return `📌 ${p.prop_name}\n💰 ${p.price}（${diff}% / ${bm}）\n📍 ${p.area}\n🔗 ${p.url || ''}`;
      }).join('\n\n')}`);
      console.log('✅ LINE 通知送信');
    } catch (e) {
      console.error('❌ LINE エラー:', e.message);
    }
  } else {
    console.log('ℹ️ LINE未設定 → ntfy.sh のみ');
  }
})().catch(e => { console.error('通知エラー:', e.message); process.exit(1); });
