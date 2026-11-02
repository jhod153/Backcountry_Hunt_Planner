import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { normalizeFood } from '../netlify/functions/product-search.mts';
import hunts from '../netlify/functions/hunts.mts';

test('nutrition converts 100g values to a serving and sodium to milligrams', () => {
  const food = normalizeFood({ code: '123', product_name: 'Trail bar', serving_quantity: 50, nutriments: { 'energy-kcal_100g': 400, proteins_100g: 20, carbohydrates_100g: 40, fat_100g: 10, sodium_100g: 0.5 } });
  assert.equal(food.cal, 200); assert.equal(food.protein, 10); assert.equal(food.sodium, 250); assert.equal(food.g, 50);
});
test('missing nutrition or serving weight is not imported as zero', () => {
  assert.equal(normalizeFood({ product_name: 'Incomplete', serving_quantity: 50, nutriments: {} }), null);
  assert.equal(normalizeFood({ product_name: 'No serving', nutriments: {} }), null);
});
test('saved hunts require an authenticated user', async () => {
  const response = await hunts(new Request('https://example.test/.netlify/functions/hunts'));
  assert.equal(response.status, 401); assert.equal(response.headers.get('cache-control'), 'private, no-store');
});
test('imports contribute nutrition and weight, and profiles round-trip the entire hunt', () => {
  const dom = new JSDOM(readFileSync('index.html', 'utf8'), { url: 'https://example.test', runScripts: 'outside-only' });
  const w = dom.window;
  w.eval(readFileSync('data.js', 'utf8')); w.eval(readFileSync('app.js', 'utf8'));
  const planner = w.huntPlanner, original = planner.snapshot();
  const before = w.document.querySelector('#food .metrics').textContent;
  planner.importFood({ externalId: 'test-bar', name: 'Test bar', g: 50, cal: 200, protein: 10, carbs: 20, fat: 9, sodium: 250 }, 'Breakfast');
  assert.notEqual(w.document.querySelector('#food .metrics').textContent, before);
  const snapshot = planner.snapshot();
  assert.equal(snapshot.foods.at(-1).cal, 200);
  assert.equal(snapshot.menus[0]['Breakfast::' + (snapshot.foods.length - 1)], 1);
  planner.importGear({ externalId: 'test-pant', brand: 'KUIU', model: 'Attack Pant', g: 400, source: 'https://www.kuiu.com/' });
  const gear = planner.snapshot().myGear.custom.at(-1); assert.equal(gear.g, 400); assert.equal(gear.slot, 'hunting-pants');
  w.document.getElementById('huntName').value = 'November ridge hunt';
  w.document.getElementById('huntName').dispatchEvent(new w.Event('input'));
  const saved = planner.snapshot();
  planner.restore(original); planner.restore(saved);
  assert.equal(planner.snapshot().huntName, 'November ridge hunt');
  assert.deepEqual(JSON.parse(JSON.stringify(planner.snapshot())), JSON.parse(JSON.stringify(saved)));
  // Missing library weights remain visibly missing.
  w.document.querySelector('[data-view="library"]').click();
  assert.match(w.document.getElementById('gearLibraryResults').textContent, /Weight needed/);
  dom.window.close();
});

test('Pack offers custom gear, counts extra weight, and restores saved extras', () => {
  const dom = new JSDOM(readFileSync('index.html', 'utf8'), { url: 'https://example.test', runScripts: 'outside-only' });
  const w = dom.window;
  w.eval(readFileSync('data.js', 'utf8')); w.eval(readFileSync('app.js', 'utf8'));
  const original = w.huntPlanner.snapshot();
  w.document.querySelector('#packAddGear').click();
  w.document.querySelector('#showCustomForm').click();
  w.document.querySelector('#customGearName').value = 'Spare repair kit';
  w.document.querySelector('#customGearWeight').value = '500';
  w.document.querySelector('#saveCustomGear').click();
  const before = w.document.querySelector('#topMetrics').textContent;
  const id = w.huntPlanner.snapshot().myGear.custom.at(-1).id;
  w.document.querySelector(`.addPackGear[data-id="${id}"]`).click();
  assert.notEqual(w.document.querySelector('#topMetrics').textContent, before);
  assert.match(w.document.querySelector('#pack').textContent, /Spare repair kit/);
  const saved = w.huntPlanner.snapshot();
  w.huntPlanner.restore(original);
  assert.equal(w.huntPlanner.snapshot().packExtras.length, 0);
  w.huntPlanner.restore(saved);
  assert.equal(w.huntPlanner.snapshot().packExtras[0], id);
  w.document.querySelector('.removePackGear').click();
  assert.equal(w.huntPlanner.snapshot().packExtras.length, 0);
  w.document.querySelector('#days').value = '7';
  w.document.querySelector('#days').dispatchEvent(new w.Event('change'));
  assert.equal(w.huntPlanner.snapshot().days, 7);
  dom.window.close();
});

test('older shared plans restore meals, gear, quantities, and shelter', () => {
  const dom = new JSDOM(readFileSync('index.html', 'utf8'), { url: 'https://example.test', runScripts: 'outside-only' });
  const w = dom.window;
  w.eval(readFileSync('data.js', 'utf8')); w.eval(readFileSync('app.js', 'utf8'));
  const original = w.huntPlanner.snapshot();
  const { foods, bear, fuel, qty, ...state } = original;
  state.huntName = 'November Mulie - 5 Days';
  state.shelter = 'cimarron';
  state.menus[0]['Breakfast::0'] = 2;
  const legacy = { state, bear: { ...bear, enabled: true }, fuel, quantities: [0, 4, 4, 8, 6] };
  w.huntPlanner.restore(legacy);
  const restored = w.huntPlanner.snapshot();
  assert.equal(restored.huntName, state.huntName);
  assert.equal(restored.shelter, 'cimarron');
  assert.equal(restored.menus[0]['Breakfast::0'], 2);
  assert.equal(restored.bear.enabled, true);
  assert.equal(JSON.stringify(restored.qty), JSON.stringify(legacy.quantities));
  assert.equal(restored.foods.length, foods.length);
  assert.throws(() => w.huntPlanner.restore({ menus: original.menus }), /incomplete/);
  dom.window.close();
});

test('shared plan links select the existing hunt without replacing the open plan', async () => {
  const dom = new JSDOM(readFileSync('index.html', 'utf8'), { url: 'https://example.test/?plan=a4650584-e14c-4e99-889c-6769047b9120', runScripts: 'outside-only' });
  const w = dom.window;
  const identity = { getUser: async () => ({ email: 'hunter@example.test' }), handleAuthCallback: async () => null, onAuthChange: () => {} };
  w.testIdentity = identity;
  w.fetch = async () => ({ ok: true, json: async () => ({ hunts: [{ id: 'a4650584-e14c-4e99-889c-6769047b9120', name: 'November Mulie - 5 Days' }] }) });
  let restored = false;
  w.huntPlanner = { restore: () => { restored = true; } };
  const script = readFileSync('account.js', 'utf8').replace("await import('https://esm.sh/@netlify/identity@2.0.0?bundle')", 'window.testIdentity');
  await w.eval('(async () => {' + script + '})()');
  assert.equal(w.document.querySelector('#savedHunts').value, 'a4650584-e14c-4e99-889c-6769047b9120');
  assert.match(w.document.querySelector('#accountMessage').textContent, /Load hunt/);
  assert.equal(restored, false);
  dom.window.close();
});
