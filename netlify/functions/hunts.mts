import { getUser, refreshSession } from '@netlify/identity';
import { getDatabase } from '@netlify/database';
export default async (req: Request) => {
 const headers = { 'Cache-Control': 'no-store' };
 try {
  await refreshSession();
  const user = await getUser();
  if (!user) return Response.json({ error: 'Log in to save and open hunts.' }, { status: 401, headers });
  const db = getDatabase();
  if (req.method === 'GET') {
   const hunts = await db.sql`SELECT id, name, profile, updated_at FROM hunt_profiles WHERE user_id = ${user.id} ORDER BY updated_at DESC`;
   return Response.json({ hunts }, { headers });
  }
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  if (req.headers.get('origin') !== new URL(req.url).origin) return new Response('Forbidden', { status: 403 });
  const b = await req.json();
  if (!b.name?.trim() || b.name.length > 160 || !b.profile || JSON.stringify(b.profile).length > 500000) return Response.json({ error: 'Enter a hunt name (up to 160 characters).' }, { status: 400, headers });
  const profile = JSON.stringify(b.profile);
  let rows;
  if (b.id) {
   if (!/^[0-9a-f-]{36}$/i.test(b.id)) return new Response('Invalid hunt', { status: 400 });
   rows = await db.sql`UPDATE hunt_profiles SET name = ${b.name.trim()}, profile = ${profile}::jsonb, updated_at = NOW() WHERE id = ${b.id}::uuid AND user_id = ${user.id} RETURNING id, name`;
  } else {
   rows = await db.sql`INSERT INTO hunt_profiles (id, user_id, name, profile) VALUES (${crypto.randomUUID()}::uuid, ${user.id}, ${b.name.trim()}, ${profile}::jsonb) RETURNING id, name`;
  }
  if (!rows.length) return Response.json({ error: 'Hunt not found. Create a new hunt instead.' }, { status: 404, headers });
  return Response.json(rows[0], { headers });
 } catch { return Response.json({ error: 'Your hunt could not be saved or loaded. Please try again.' }, { status: 503, headers }); }
};
