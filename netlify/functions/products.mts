import { getDatabase } from '@netlify/database';
import { createHash, randomUUID } from 'node:crypto';
import type { Context } from '@netlify/functions';

export default async (req: Request, context: Context) => {
  const headers = { 'Cache-Control': 'no-store' };
  if (!['GET', 'POST', 'DELETE'].includes(req.method)) return new Response(null, { status: 405 });
  if (req.method !== 'GET' && req.headers.get('origin') !== new URL(req.url).origin) return new Response(null, { status: 403 });
  let owner = context.cookies.get('hunt-products');
  if (!owner || !/^[a-f0-9-]{36}$/.test(owner)) {
    owner = randomUUID();
    context.cookies.set({ name: 'hunt-products', value: owner, httpOnly: true, secure: new URL(req.url).protocol === 'https:', sameSite: 'Lax', path: '/', maxAge: 31536000 });
  }
  const hash = createHash('sha256').update(owner).digest('hex');
  try {
    const db = getDatabase();
    if (req.method === 'GET') {
      const rows = await db.sql`SELECT id, kind, product FROM hunt_saved_products WHERE owner_hash = ${hash} ORDER BY created_at, id`;
      return Response.json({ products: rows }, { headers });
    }
    const body = await req.text();
    if (body.length > 8000) return new Response(null, { status: 413 });
    let data;
    try { data = JSON.parse(body); } catch { return Response.json({ error: 'Invalid product.' }, { status: 400, headers }); }
    if (req.method === 'DELETE') {
      if (typeof data.id !== 'string' || !/^[a-f0-9-]{36}$/.test(data.id)) return new Response(null, { status: 400 });
      await db.sql`DELETE FROM hunt_saved_products WHERE id = ${data.id} AND owner_hash = ${hash}`;
      return Response.json({ removed: true }, { headers });
    }
    const { kind, product: p } = data;
    if (!['food', 'gear'].includes(kind) || !p || typeof p.name !== 'string' || !p.name.trim() || p.name.length > 200 || !Number.isFinite(p.g) || p.g <= 0 || p.g > 100000) return Response.json({ error: 'Enter a product name and a valid weight.' }, { status: 400, headers });
    if (kind === 'food' && ['cal', 'protein', 'carbs', 'fat', 'sodium'].some(k => !Number.isFinite(p[k]) || p[k] < 0 || p[k] > 100000)) return Response.json({ error: 'Enter all nutrition values per serving.' }, { status: 400, headers });
    const product = { name: p.name.trim(), g: p.g, category: String(p.category || '').slice(0, 80), slot: String(p.slot || 'misc').slice(0, 80), brand: String(p.brand || 'Custom').slice(0, 100), source: /^https?:\/\//i.test(p.source || '') ? String(p.source).slice(0, 2000) : '', cal: p.cal, protein: p.protein, carbs: p.carbs, fat: p.fat, sodium: p.sodium, tags: 'Custom product' };
    const id = randomUUID();
    await db.sql`INSERT INTO hunt_saved_products (id, owner_hash, kind, product) VALUES (${id}, ${hash}, ${kind}, ${JSON.stringify(product)}::jsonb)`;
    return Response.json({ id, kind, product }, { status: 201, headers });
  } catch {
    return Response.json({ error: 'Your product library is unavailable. Please try again.' }, { status: 503, headers });
  }
};
