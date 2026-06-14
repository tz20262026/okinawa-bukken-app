import { NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs';
import type { Property } from '@/lib/db';
import { getNewYasuiProperties, sendPropertyAlert } from '@/lib/alert';

export async function GET() {
  try {
    const jsonPath = path.join(process.cwd(), 'data', 'properties.json');
    const all: Property[] = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
    const newYasui = getNewYasuiProperties(all, 24);
    return NextResponse.json({ count: newYasui.length, properties: newYasui.slice(0, 20) });
  } catch {
    return NextResponse.json({ count: 0, properties: [] });
  }
}

export async function POST() {
  try {
    const jsonPath = path.join(process.cwd(), 'data', 'properties.json');
    const all: Property[] = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
    const newYasui = getNewYasuiProperties(all, 24);
    for (const p of newYasui) {
      await sendPropertyAlert(p);
    }
    return NextResponse.json({ sent: newYasui.length });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}