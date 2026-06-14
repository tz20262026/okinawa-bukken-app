import type { Property } from '@/lib/db';

export type AlertProperty = {
  id: number;
  prop_name: string;
  price: string;
  area: string;
  url: string;
  verdict_diff: number | null;
  scraped_at: string;
};

export async function sendPropertyAlert(property: AlertProperty): Promise<void> {
  const diff = property.verdict_diff ?? 0;
  const msg = `\n🏠 新着割安物件アラート\n${property.prop_name}\n💰 ${property.price}\n📍 ${property.area}\n📊 相場比 ${diff.toFixed(1)}%\n🔗 ${property.url}`;

  if (process.env.LINE_NOTIFY_TOKEN) {
    try {
      await fetch('https://notify-api.line.me/api/notify', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.LINE_NOTIFY_TOKEN}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({ message: msg }),
      });
    } catch {}
  }

  if (process.env.ALERT_WEBHOOK_URL) {
    try {
      await fetch(process.env.ALERT_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'yasui_alert', property, timestamp: new Date().toISOString() }),
      });
    } catch {}
  }
}

export function getNewYasuiProperties(all: Property[], hoursBack = 24): AlertProperty[] {
  const cutoff = new Date(Date.now() - hoursBack * 60 * 60 * 1000);
  return all
    .filter(p => {
      if (p.verdict !== '割安') return false;
      if (typeof p.verdict_diff !== 'number' || p.verdict_diff > -20) return false;
      if (!p.scraped_at) return false;
      return new Date(p.scraped_at) >= cutoff;
    })
    .map(p => ({
      id: p.id,
      prop_name: p.prop_name,
      price: p.price,
      area: p.area,
      url: p.url,
      verdict_diff: p.verdict_diff,
      scraped_at: p.scraped_at,
    }));
}