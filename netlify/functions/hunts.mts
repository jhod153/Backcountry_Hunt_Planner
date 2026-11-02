import { getUser } from '@netlify/identity';
import { getDatabase } from '@netlify/database';

export default async (req: Request) => {
  const headers = { 'Cache-Control': 'private, no-store' };
  const reply = (data: unknown, status = 200) => Response.json(data, { status, headers });
  const user = await getUser();
  if (!user) return reply({ error: 'Log in to access saved hunts.' }, 401);
  if (req.method !== 'GET' && req.headers.get('origin') !== new URL(req.url).origin) {
    return reply({ error: 'Invalid request origin.' }, 403);
  }
  try {
    const db = getDatabase();
    if (req.method === 'GET') {
      const hunts = await db.sql`SELECT id, name, updated_at FROM hunt_profiles WHERE user_id = ${user.id} ORDER BY updated_at DESC`;
      const id = new URL(req.url).searchParams.get('id');
      if (!id) return reply({ hunts });
      if (!/^[0-9a-f-]{36}$/i.test(id)) return reply({ error: 'Invalid hunt.' }, 400);
      const [hunt] = await db.sql`SELECT id, name, payload FROM hunt_profiles WHERE id = ${id} AND user_id = ${user.id}`;
      return hunt ? reply({ hunt }) : reply({ error: 'Hunt not found.' }, 404);
    }
    if (req.method === 'PUT') {
      const raw = await req.text();
      if (raw.length > 1000000) return reply({ error: 'Hunt is too large.' }, 413);
      const { id, name, payload } = JSON.parse(raw);
      if (!/^[0-9a-f-]{36}$/i.test(id) || typeof name !== 'string' || !name.trim() || name.length > 150 || !payload || !Array.isArray(payload.menus) || payload.menus.length !== 10 || !Array.isArray(payload.foods)) {
        return reply({ error: 'Invalid hunt profile.' }, 400);
      }
      const [hunt] = await db.sql`INSERT INTO hunt_profiles (id, user_id, name, payload) VALUES (${id}, ${user.id}, ${name.trim()}, ${JSON.stringify(payload)}::jsonb) ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, payload = EXCLUDED.payload, updated_at = now() WHERE hunt_profiles.user_id = ${user.id} RETURNING id, name, updated_at`;
      return hunt ? reply({ hunt }) : reply({ error: 'Hunt not found.' }, 404);
    }
    return reply({ error: 'Method not allowed.' }, 405);
  } catch {
    return reply({ error: 'Saved hunts are unavailable. Your current plan is still open. Please retry.' }, 503);
  }
};
