import { getDatabase } from '@netlify/database';
import type { Context } from '@netlify/functions';

export default async (req: Request, context: Context) => {
  const headers = { 'Cache-Control': 'no-store' };
  if (!['GET', 'PUT'].includes(req.method)) {
    return new Response('Method not allowed', { status: 405, headers: { ...headers, Allow: 'GET, PUT' } });
  }
  if (req.method === 'PUT' && req.headers.get('origin') !== new URL(req.url).origin) {
    return new Response('Forbidden', { status: 403, headers });
  }
  let browserId = context.cookies.get('hunt_browser');
  if (!browserId || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(browserId)) {
    browserId = crypto.randomUUID();
  }
  context.cookies.set({ name: 'hunt_browser', value: browserId, httpOnly: true, secure: new URL(req.url).protocol === 'https:', sameSite: 'Strict', path: '/', maxAge: 31536000 });
  try {
    const db = getDatabase();
    if (req.method === 'GET') {
      const rows = await db.sql`SELECT plan FROM hunt_plans WHERE browser_id = ${browserId}`;
      return Response.json({ plan: rows[0]?.plan ?? null }, { headers });
    }
    const body = await req.text();
    if (body.length > 250000) return new Response('Plan too large', { status: 413, headers });
    let plan;
    try { plan = JSON.parse(body); } catch { return new Response('Invalid plan', { status: 400, headers }); }
    if (!plan || typeof plan !== 'object' || Array.isArray(plan) || plan.version !== 1 || typeof plan.state !== 'object' || !plan.state || !Array.isArray(plan.quantities)) {
      return new Response('Invalid plan', { status: 400, headers });
    }
    await db.sql`INSERT INTO hunt_plans (browser_id, plan) VALUES (${browserId}, ${JSON.stringify(plan)}::jsonb)
      ON CONFLICT (browser_id) DO UPDATE SET plan = EXCLUDED.plan, updated_at = NOW()`;
    return Response.json({ saved: true }, { headers });
  } catch {
    return Response.json({ error: 'Hunt storage is unavailable. Please try again.' }, { status: 503, headers });
  }
};
