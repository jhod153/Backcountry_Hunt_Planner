import { getUser } from '@netlify/identity';
import { and, or, eq, desc, sql } from 'drizzle-orm';
import { database } from '../../db/index.js';
import { plans, collaborators } from '../../db/schema.js';

export default async (req: Request) => {
  const reply = (data: unknown, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
  const user = await getUser();
  // Identity verifies the session; verified JWT context may omit profile timestamps.
  if (!user?.id || !user.email) return reply({ error: 'Sign in to access hunt plans.' }, 401);
  if (!['GET','POST','PUT','PATCH'].includes(req.method)) return reply({ error: 'Method not allowed.' }, 405);
  if (req.method !== 'GET') {
    const origin = req.headers.get('origin');
    if (origin && origin !== new URL(req.url).origin) return reply({ error: 'Invalid request origin.' }, 403);
    if (!req.headers.get('content-type')?.includes('application/json')) return reply({ error: 'JSON required.' }, 415);
  }
  try {
    const db = database(), email = user.email.toLowerCase();
    const access = or(eq(plans.ownerId, user.id), sql`exists (select 1 from ${collaborators} where ${collaborators.planId} = ${plans.id} and ${collaborators.email} = ${email})`);
    const id = new URL(req.url).searchParams.get('id');
    if (id && !/^[0-9a-f-]{36}$/i.test(id)) return reply({ error: 'Invalid plan.' }, 400);
    if (req.method === 'GET') {
      if (!id) return reply(await db.select({ id: plans.id, name: plans.name, version: plans.version, updatedAt: plans.updatedAt, ownerId: plans.ownerId }).from(plans).where(access).orderBy(desc(plans.updatedAt)));
      const [plan] = await db.select().from(plans).where(and(eq(plans.id, id), access));
      if (!plan) return reply({ error: 'Plan not found or access removed.' }, 404);
      const members = plan.ownerId === user.id ? await db.select({ email: collaborators.email }).from(collaborators).where(eq(collaborators.planId, id)) : [];
      return reply({ ...plan, members });
    }
    const raw = await req.text();
    if (raw.length > 500000) return reply({ error: 'Plan is too large.' }, 413);
    let body;
    try { body = JSON.parse(raw); } catch { return reply({ error: 'Invalid JSON.' }, 400); }
    if (req.method === 'PATCH') {
      if (!id) return reply({ error: 'Choose a plan.' }, 400);
      const memberEmail = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(memberEmail) || memberEmail.length > 254) return reply({ error: 'Enter a valid email address.' }, 400);
      // Lock the owner row during membership changes to enforce ownership in the same transaction.
      return await db.transaction(async tx => {
        const [owner] = await tx.select().from(plans).where(and(eq(plans.id, id), eq(plans.ownerId, user.id))).for('update');
        if (!owner) return reply({ error: 'Only the plan owner can manage collaborators.' }, 403);
        if (body.remove === true) await tx.delete(collaborators).where(and(eq(collaborators.planId, id), eq(collaborators.email, memberEmail)));
        else await tx.insert(collaborators).values({ planId: id, email: memberEmail }).onConflictDoNothing();
        return reply({ ok: true });
      });
    }
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    if (!name || name.length > 120 || !body.data || typeof body.data !== 'object' || Array.isArray(body.data)) return reply({ error: 'Provide a hunt name (up to 120 characters) and plan data.' }, 400);
    if (req.method === 'POST') {
      const [plan] = await db.insert(plans).values({ name, data: body.data, ownerId: user.id }).returning();
      return reply(plan, 201);
    }
    if (!id || !Number.isInteger(body.version)) return reply({ error: 'Choose a saved plan.' }, 400);
    const [updated] = await db.update(plans).set({ name, data: body.data, version: sql`${plans.version} + 1`, updatedAt: new Date() }).where(and(eq(plans.id, id), access, eq(plans.version, body.version))).returning();
    if (!updated) {
      const [existing] = await db.select({ id: plans.id }).from(plans).where(and(eq(plans.id, id), access));
      return existing ? reply({ error: 'Another person saved changes. Open the latest plan before saving, or save your edits as a separate plan.' }, 409) : reply({ error: 'Plan not found or access removed.' }, 404);
    }
    return reply(updated);
  } catch {
    return reply({ error: 'Unable to access saved plans. Please try again.' }, 500);
  }
};
