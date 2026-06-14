import { NextRequest, NextResponse } from 'next/server';
import { getProperties, getStats, SortKey } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const source = searchParams.get('source') || undefined;
    const area = searchParams.get('area') || undefined;
    const date = searchParams.get('date') || undefined;
    const search = searchParams.get('search') || undefined;
    const sort = (searchParams.get('sort') || 'newest') as SortKey;
    const propType = searchParams.get('propType') || undefined;
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '50', 10);
    const statsOnly = searchParams.get('stats') === '1';

    if (statsOnly) {
      const stats = getStats();
      return NextResponse.json(stats);
    }

    const result = getProperties({ source, area, date, search, propType, sort, page, limit });
    return NextResponse.json(result);
  } catch (e) {
    console.error('DB error:', e);
    return NextResponse.json({ error: 'データベースエラー', data: [], total: 0 }, { status: 500 });
  }
}
