function number(value: unknown) {
  if (value === undefined || value === null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : null;
}
export function normalizeFood(p: any) {
  const n = p.nutriments || {};
  const g = number(p.serving_quantity);
  if (!g || !p.product_name) return null;
  const nutrient = (key: string) => number(n[key + '_serving']) ?? (number(n[key + '_100g']) === null ? null : Number(n[key + '_100g']) * g / 100);
  const cal = nutrient('energy-kcal') ?? (nutrient('energy-kj') === null ? null : nutrient('energy-kj')! / 4.184);
  const protein = nutrient('proteins'), carbs = nutrient('carbohydrates'), fat = nutrient('fat');
  const sodium = nutrient('sodium') ?? (nutrient('salt') === null ? null : nutrient('salt')! / 2.5);
  if ([cal, protein, carbs, fat, sodium].some(v => v === null)) return null;
  return { name: [p.brands, p.product_name].filter(Boolean).join(' — '), g, cal, protein, carbs, fat, sodium: sodium! * 1000, serving: p.serving_size || `${g} g`, source: `https://world.openfoodfacts.org/product/${encodeURIComponent(p.code)}`, externalId: p.code };
}
async function json(url: string) {
  const r = await fetch(url, { signal: AbortSignal.timeout(12000), headers: { 'User-Agent': 'BackcountryHuntPlanner/1.0 (nutrition and equipment lookup)' } });
  if (!r.ok) throw new Error('Lookup unavailable');
  return r.json();
}
export default async (req: Request) => {
  if (req.method !== 'GET') return Response.json({ error: 'Method not allowed.' }, { status: 405 });
  const url = new URL(req.url), q = (url.searchParams.get('q') || '').trim(), type = url.searchParams.get('type');
  if (q.length < 3 || q.length > 120 || !['food', 'gear'].includes(type || '')) return Response.json({ error: 'Enter a product name between 3 and 120 characters.' }, { status: 400 });
  try {
    if (type === 'food') {
      const search = await json(`https://search.openfoodfacts.org/search?q=${encodeURIComponent(q)}&page_size=12`);
      const details = await Promise.allSettled((search.hits || []).slice(0, 12).map(async (hit: any) => {
        const data = await json(`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(hit.code)}?fields=code,product_name,brands,serving_size,serving_quantity,nutriments`);
        return data.product ? normalizeFood(data.product) : null;
      }));
      if (details.length && details.every(r => r.status === 'rejected')) throw new Error('Unavailable');
      return Response.json({ products: details.flatMap(r => r.status === 'fulfilled' && r.value ? [r.value] : []), note: 'Open Food Facts: nutrition and food weight are per listed serving. Check the package label; products without complete serving nutrition are omitted.' });
    }
    // Only fixed manufacturer hosts are fetched; the query cannot supply a URL.
    const hosts = ['www.kuiu.com', 'www.firstlite.com', 'www.stoneglacier.com', 'exomtngear.com', 'kifaru.net', 'skregear.com'];
    const results = await Promise.allSettled(hosts.map(async host => {
      const data = await json(`https://${host}/search/suggest.json?q=${encodeURIComponent(q)}&resources[type]=product&resources[limit]=4`);
      const products = data.resources?.results?.products || [];
      return (await Promise.allSettled(products.map(async (p: any) => {
        if (!/^[a-z0-9-]+$/i.test(p.handle)) return null;
        const detail = await json(`https://${host}/products/${p.handle}.js`);
        const variants = detail.variants || [];
        return variants.filter((v: any) => number(v.weight) !== null && Number(v.weight) > 0).map((v: any) => ({ brand: detail.vendor, model: detail.title + (v.title && v.title !== 'Default Title' ? ` — ${v.title}` : ''), g: Number(v.weight), source: `https://${host}/products/${p.handle}?variant=${v.id}`, notes: 'Manufacturer listed variant weight; confirm size and included components.', externalId: `${host}-${v.id}` }));
      }))).flatMap(r => r.status === 'fulfilled' ? r.value || [] : []);
    }));
    if (results.every(r => r.status === 'rejected')) throw new Error('Unavailable');
    return Response.json({ products: results.flatMap(r => r.status === 'fulfilled' ? r.value : []).slice(0, 30), note: 'Manufacturer catalog weights in grams, by variant. Products without a published weight are omitted.' });
  } catch {
    return Response.json({ error: 'Product lookup is temporarily unavailable. Try again or use the existing library.' }, { status: 502 });
  }
};
