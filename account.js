const $ = id => document.getElementById(id);
let identity, user, activeId = null, inviteToken = null;
const message = text => { $('accountMessage').textContent = text; };
async function api(path = '', options = {}) {
  // Refresh the session before sending the cookie to the protected endpoint.
  if (!await identity.getUser()) throw new Error('Please log in again.');
  const r = await fetch('/.netlify/functions/hunts' + path, { ...options, cache: 'no-store', headers: { 'Content-Type': 'application/json' } });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error || 'Unable to access saved hunts.');
  return data;
}
async function listHunts() {
  const { hunts } = await api();
  $('savedHunts').replaceChildren(new Option('Choose a hunt', ''), ...hunts.map(h => new Option(h.name, h.id)));
  if (activeId) $('savedHunts').value = activeId;
}
async function syncAccount() {
  user = await identity.getUser();
  activeId = null;
  $('huntControls').classList.toggle('hidden', !user);
  $('accountToggle').classList.toggle('hidden', !!user);
  $('accountStatus').textContent = user ? `Signed in as ${user.email}` : 'Log in to save hunts across devices.';
  if (user) { $('accountForm').classList.add('hidden'); await listHunts(); }
  else $('savedHunts').replaceChildren(new Option('Choose a hunt', ''));
}
async function busy(button, fn) {
  button.disabled = true;
  try { await fn(); } catch(e) { message(e.message || 'Unable to complete this request. Please retry.'); }
  finally { button.disabled = false; }
}
$('accountToggle').onclick = () => $('accountForm').classList.toggle('hidden');
$('accountForm').onsubmit = e => { e.preventDefault(); busy(e.submitter, async () => {
  if (!identity) throw new Error('Account service is loading. Please retry.');
  await identity.login($('accountEmail').value, $('accountPassword').value);
  $('accountPassword').value = ''; await syncAccount(); message('Logged in. Choose a saved hunt or save your current plan.');
}); };
$('signup').onclick = e => busy(e.currentTarget, async () => {
  if (!$('accountForm').reportValidity()) return;
  if (!identity) throw new Error('Account service is loading. Please retry.');
  const created = await identity.signup($('accountEmail').value, $('accountPassword').value);
  $('accountPassword').value = ''; await syncAccount();
  message(created.emailVerified ? 'Account created.' : 'Check your email to confirm your account, then return here to log in.');
});
$('forgotPassword').onclick = e => busy(e.currentTarget, async () => {
  if (!$('accountEmail').reportValidity() || !$('accountEmail').value) return;
  if (!identity) throw new Error('Account service is loading. Please retry.');
  await identity.requestPasswordRecovery($('accountEmail').value); message('Check your email for a password reset link.');
});
$('logout').onclick = e => busy(e.currentTarget, async () => { await identity.logout(); await syncAccount(); message('Logged out. The open plan remains on screen.'); });
async function save(asNew) {
  const payload = window.huntPlanner.snapshot(), name = payload.huntName.trim();
  if (!name) throw new Error('Enter a hunt name in Setup before saving.');
  const id = asNew || !activeId ? crypto.randomUUID() : activeId;
  await api('', { method: 'PUT', body: JSON.stringify({ id, name, payload }) });
  activeId = id; await listHunts(); message(`Saved “${name}”.`);
}
$('saveHunt').onclick = e => busy(e.currentTarget, () => save(false));
$('saveNewHunt').onclick = e => busy(e.currentTarget, () => save(true));
$('loadHunt').onclick = e => busy(e.currentTarget, async () => {
  const id = $('savedHunts').value;
  if (!id) throw new Error('Choose a saved hunt first.');
  if (!confirm('Load this hunt? Unsaved changes to the open plan will be replaced.')) return;
  const { hunt } = await api('?id=' + encodeURIComponent(id));
  window.huntPlanner.restore(hunt.payload); activeId = hunt.id; message(`Loaded “${hunt.name}”.`);
});
$('resetForm').onsubmit = e => { e.preventDefault(); busy(e.submitter, async () => {
  if (inviteToken) { await identity.acceptInvite(inviteToken, $('newPassword').value); inviteToken = null; }
  else await identity.updateUser({ password: $('newPassword').value });
  $('newPassword').value = ''; $('resetForm').classList.add('hidden'); await syncAccount(); message('Password set.');
}); };
try {
  identity = await import('https://esm.sh/@netlify/identity@2.0.0?bundle');
  const callback = await identity.handleAuthCallback();
  if (callback?.type === 'recovery' || callback?.type === 'invite') {
    inviteToken = callback.token || null; $('resetForm').classList.remove('hidden'); message('Set your password to finish.');
  }
  await syncAccount();
  identity.onAuthChange((event) => { if (event === 'logout') syncAccount().catch(e => message(e.message)); });
} catch { message('Account service could not load. Check your connection and reload to log in.'); }
