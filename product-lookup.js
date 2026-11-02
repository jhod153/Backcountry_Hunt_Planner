(() => {
  const $ = id => document.getElementById(id);
  let type, slot, generation = 0;
  window.openProductLookup = (kind, meal, query = '') => {
    type = kind; slot = meal; generation++;
    $('lookupTitle').textContent = kind === 'food' ? 'Find food & nutrition' : 'Find gear & weight';
    $('lookupQuery').value = query; $('lookupResults').replaceChildren();
    $('lookupMessage').textContent = kind === 'food' ? 'Search packaged foods. Results include serving weight, calories, macros, and sodium.' : 'Search manufacturer catalogs for weights by product and size.';
    $('productLookup').showModal();
  };
  $('closeLookup').onclick = () => { generation++; $('productLookup').close(); };
  $('lookupForm').onsubmit = async e => {
    e.preventDefault(); const run = ++generation, kind = type, meal = slot, button = e.submitter;
    button.disabled = true; $('lookupResults').replaceChildren(); $('lookupMessage').textContent = 'Looking up product details…';
    try {
      const response = await fetch(`/.netlify/functions/product-search?type=${kind}&q=${encodeURIComponent($('lookupQuery').value.trim())}`, { cache: 'no-store' });
      const data = await response.json();
      if (run !== generation) return;
      if (!response.ok) throw new Error(data.error || 'Lookup failed.');
      $('lookupMessage').textContent = (data.products.length ? '' : 'No products with complete details found. Try a different brand or product name. ') + data.note;
      for (const product of data.products) {
        const card = document.createElement('article'); card.className = 'card';
        const name = document.createElement('h3'); name.textContent = product.name || `${product.brand} ${product.model}`;
        const details = document.createElement('p');
        details.textContent = kind === 'food' ? `Per ${product.serving}: ${Math.round(product.cal)} cal · ${product.g} g · Protein ${product.protein.toFixed(1)} g · Carbs ${product.carbs.toFixed(1)} g · Fat ${product.fat.toFixed(1)} g · Sodium ${Math.round(product.sodium)} mg` : `${product.g} g · ${product.notes}`;
        const source = document.createElement('a'); source.textContent = 'View source'; source.href = product.source; source.target = '_blank'; source.rel = 'noopener noreferrer';
        const add = document.createElement('button'); add.className = 'primary'; add.textContent = kind === 'food' ? `Add serving to ${meal}` : 'Add to My Gear';
        add.onclick = () => { kind === 'food' ? window.huntPlanner.importFood(product, meal) : window.huntPlanner.importGear(product); add.textContent = 'Added'; add.disabled = true; };
        const actions = document.createElement('div'); actions.className = 'actions'; actions.append(source, add); card.append(name, details, actions); $('lookupResults').append(card);
      }
    } catch (err) { if (run === generation) $('lookupMessage').textContent = err.message || 'Lookup unavailable. Please retry.'; }
    finally { button.disabled = false; }
  };
})();
