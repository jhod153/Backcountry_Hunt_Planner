(()=>{'use strict';
const bridge=window.huntProducts,esc=bridge.esc;
let searchVersion=0;
let kind='food',results=[],previousFocus,libraryReady=false,libraryPromise;
const dialog=document.createElement('dialog');
dialog.className='product-dialog';dialog.setAttribute('aria-labelledby','productTitle');document.body.append(dialog);
function message(text){dialog.querySelector('#productStatus').textContent=text;}
async function api(path,body){const response=await fetch('/.netlify/functions/'+path,{method:body?'POST':'GET',headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined,cache:'no-store'});const data=await response.json();if(!response.ok)throw Error(data.error||'Unable to connect. Please try again.');return data;}
function controls(){
 document.querySelectorAll('#food .section-title, #pack .section-title, #gearManagerBody .gear-manager-tabs').forEach(el=>{
 if(el.querySelector('.web-products'))return;
 const k=el.closest('#food')?'food':'gear';const b=document.createElement('button');b.type='button';b.className='secondary web-products';b.textContent='Search internet / add product';b.onclick=()=>open(k);el.append(b);
 });
}
new MutationObserver(controls).observe(document.body,{childList:true,subtree:true});controls();
window.openProductSearch=open;
function open(type,manual=false){
 searchVersion++;kind=type;results=[];previousFocus=document.activeElement;
 dialog.innerHTML=`<div class="product-heading"><div><div class="section-kicker">Expand your kit</div><h2 id="productTitle">Add ${kind==='food'?'food':'gear'}</h2></div><button class="icon-btn" id="closeProducts" aria-label="Close product search" type="button">×</button></div><p class="muted">Search the internet for any brand, or enter your own product. Saved products are available on this browser.</p><form id="webSearchForm" class="product-search-form"><label><span class="label">Product or brand</span><input id="webQuery" class="field" required minlength="3" maxlength="180" placeholder="${kind==='food'?'e.g. Peak Refuel chicken pesto':'e.g. MSR PocketRocket Deluxe'}"></label><button class="primary" id="searchProducts">Search internet</button></form><button class="text-btn" id="manualProduct" type="button">Enter a product manually</button><p id="productStatus" role="status" aria-live="polite"></p><div id="webResults" class="product-results"></div><div id="productReview"></div>`;
 dialog.querySelector('#closeProducts').onclick=()=>dialog.close();
 dialog.querySelector('#manualProduct').onclick=()=>review({});
 dialog.querySelector('#webSearchForm').onsubmit=search;
 if(!dialog.open)dialog.showModal();
 if(manual)review({});
}
dialog.addEventListener('close',()=>previousFocus?.focus());
async function search(e){
 e.preventDefault();const version=++searchVersion;const button=dialog.querySelector('#searchProducts'),query=dialog.querySelector('#webQuery').value.trim();
 if(query.length<3)return;
 button.disabled=true;button.textContent='Searching…';message('Searching product sources. This can take a moment.');dialog.querySelector('#webResults').innerHTML='';dialog.querySelector('#productReview').innerHTML='';
 try{const data=await api('product-search',{query,kind});if(!dialog.open||version!==searchVersion)return;results=data.products;message(results.length?'Choose a product to review its details.':'No matching products found. Try a more specific name or enter your product manually.');
 dialog.querySelector('#webResults').innerHTML=results.map((p,i)=>`<article class="product-result"><div><span class="section-kicker">${esc(p.brand||'Product')}</span><h3>${esc(p.name)}</h3><a href="${esc(p.source)}" target="_blank" rel="noopener noreferrer">View source</a></div><button class="secondary" data-result="${i}" type="button">Review & add</button></article>`).join('');
 dialog.querySelectorAll('[data-result]').forEach(b=>b.onclick=()=>review(results[+b.dataset.result]));
 }catch(error){if(version===searchVersion)message(error.message);}finally{button.disabled=false;button.textContent='Search internet';}
}
function review(p){
 const food=kind==='food';
 const choices=food?bridge.slots.map(id=>({id,label:id})):bridge.gearSlots;
 const field=(id,label,value,min=0)=>`<label><span class="label">${label}</span><input class="field" name="${id}" type="number" min="${min}" max="100000" step="any" required value="${Number.isFinite(value)?value:''}"></label>`;
 dialog.querySelector('#productReview').innerHTML=`<form id="reviewProduct" class="product-review"><div class="section-kicker">Review product</div><h3>Check ${food?'serving size, weight & nutrition':'product & weight'}</h3><p class="muted">${food?'All values must describe one serving. Weight is in grams; sodium is in milligrams.':'Use the weight for your size and configuration.'} Missing details need to be entered before saving.</p>${p.source?`<a href="${esc(p.source)}" target="_blank" rel="noopener noreferrer">Check original source</a>`:''}<label><span class="label">Product name</span><input class="field" name="name" required maxlength="200" value="${esc(p.name||'')}"></label><label><span class="label">Brand</span><input class="field" name="brand" maxlength="100" value="${esc(p.brand||'')}"></label><label><span class="label">${food?'Add to meal':'Gear category'}</span><select class="field" name="category">${choices.map(c=>`<option value="${esc(c.id)}">${esc(c.label)}</option>`).join('')}</select></label>${food?`<p class="muted">Serving: ${esc(p.serving||'Enter the values for one serving below.')}</p>`:''}<div class="product-numbers">${field('g',food?'Serving weight (g)':'Weight (g)',p.g,0.01)}${food?field('cal','Calories (kcal)',p.cal)+field('protein','Protein (g)',p.protein)+field('carbs','Carbs (g)',p.carbs)+field('fat','Fat (g)',p.fat)+field('sodium','Sodium (mg)',p.sodium):''}</div><button class="primary" id="saveProduct">${food?'Save & add one serving':'Save to My Gear'}</button><p class="muted">${food?'Also added to your food library for future meals.':'Select it under Added products in Pack to include its weight.'}</p></form>`;
 const form=dialog.querySelector('#reviewProduct');form.querySelector('[name=category]').value=food?'Snacks':'misc';
 form.onsubmit=async e=>{
 e.preventDefault();const b=form.querySelector('#saveProduct');b.disabled=true;message('Saving product…');
 try{
 if(!libraryReady){await loadLibrary();}
 const values=Object.fromEntries(new FormData(form));
 const meal=values.category;
 const categories={'Breakfast':'Breakfast','Lunch':'Lunch','Dinner':'Dinner','Snacks':'Snacks & Protein','Treats':'Treats & Candy','Electrolytes':'Hydration','Emergency Food':'Snacks & Protein'};
 const product={name:values.name,brand:values.brand,g:Number(values.g),source:p.source||'',category:food?categories[meal]:'Custom Gear',slot:food?'':meal};
 if(food)for(const key of ['cal','protein','carbs','fat','sodium'])product[key]=Number(values[key]);
 const record=await api('products',{kind,product});bridge.add(record,meal);dialog.close();
 }catch(error){message(error.message);}finally{b.disabled=false;}
 };
 form.querySelector('[name=name]').focus();
}
async function loadLibrary(){if(!libraryPromise)libraryPromise=(async()=>{const data=await api('products');data.products.forEach(p=>bridge.load(p));libraryReady=true;bridge.refresh();})().catch(error=>{libraryPromise=null;throw error;});return libraryPromise;}
loadLibrary().catch(()=>{
 const notice=document.createElement('p');notice.className='warning';notice.textContent='Saved products could not be loaded. Reopen product search to try saving again when connected.';document.getElementById('food').prepend(notice);
});
})();
