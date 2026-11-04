import { getUser, login, signup, logout, confirmEmail, recoverPassword, requestPasswordRecovery, refreshSession } from '@netlify/identity';
export default async (req: Request) => {
  const headers = { 'Cache-Control': 'no-store' };
  try {
    if (req.method === 'GET') { await refreshSession(); return Response.json({ user: await getUser() }, { headers }); }
    if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });
    if (req.headers.get('origin') !== new URL(req.url).origin) return new Response('Forbidden', { status: 403 });
    const b = await req.json();
    let user;
    switch (b.action) {
      case 'login': user = await login(b.email, b.password); break;
      case 'signup': user = await signup(b.email, b.password); break;
      case 'logout': await logout(); return Response.json({ user: null }, { headers });
      case 'confirm': user = await confirmEmail(b.token); break;
      case 'recover': user = await recoverPassword(b.token, b.password); break;
      case 'forgot': await requestPasswordRecovery(b.email); return Response.json({ message: 'Check your email for a password reset link.' }, { headers });
      default: return new Response('Invalid action', { status: 400 });
    }
    return Response.json({ user, message: b.action === 'signup' && !user.confirmedAt ? 'Check your email to confirm your account, then log in.' : '' }, { headers });
  } catch { return Response.json({ error: 'Unable to complete this account action. Check your details and try again.' }, { status: 400, headers }); }
};
