const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { JSDOM } = require('jsdom');
const tick = () => new Promise(resolve => setTimeout(resolve, 0));

test('web search reviews products, saves food and gear, and reloads the library', async () => {
 const dom = new JSDOM(fs.readFileSync('index.html','utf8'), { url:'https://hunt.example', runScripts:'outside-only' });
 const w=dom.window, saved=[];
 w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};
 w.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new w.Event('close'));};
 w.fetch=async (url,options={})=>{
  if(url.endsWith('product-search'))return {ok:true,json:async()=>({products:[{name:'Test meal',brand:'Test maker',source:'https://example.com/meal',g:100,cal:450,protein:20,carbs:50,fat:19,sodium:600}]})};
  if(options.method==='POST'){const body=JSON.parse(options.body);const record={...body,id:'record-'+saved.length};saved.push(record);return {ok:true,json:async()=>record};}
  return {ok:true,json:async()=>({products:saved})};
 };
 for(const path of ['data.js','app.js','product-search.js'])w.eval(fs.readFileSync(path,'utf8'));
 await tick();
 assert.equal(w.document.querySelectorAll('#food .web-products').length,1);
 w.openProductSearch('food');
 w.document.querySelector('#webQuery').value='Test meal';
 w.document.querySelector('#webSearchForm').dispatchEvent(new w.Event('submit',{cancelable:true}));
 await tick();w.document.querySelector('[data-result]').click();
 assert.equal(w.document.querySelector('[name=cal]').value,'450');
 w.document.querySelector('#reviewProduct').dispatchEvent(new w.Event('submit',{cancelable:true}));
 await tick();assert.equal(saved.length,1);
 assert.ok(w.document.querySelector('#meals').textContent.includes('Test meal'));
 assert.ok(w.document.querySelector('#shopping').textContent.includes('Test meal'));
 w.openProductSearch('gear',true);
 w.document.querySelector('[name=name]').value='Custom tripod';w.document.querySelector('[name=g]').value='825';
 w.document.querySelector('#reviewProduct').dispatchEvent(new w.Event('submit',{cancelable:true}));
 await tick();assert.equal(saved.length,2);
 const before=w.document.querySelector('#topMetrics').textContent;
 const checkbox=w.document.querySelector('.extraGear');assert.ok(checkbox);checkbox.checked=true;checkbox.dispatchEvent(new w.Event('change'));
 assert.notEqual(w.document.querySelector('#topMetrics').textContent,before);
 // Re-loading the same record cannot duplicate it.
 w.huntProducts.load(saved[1]);w.huntProducts.refresh();assert.equal(w.document.querySelectorAll('.extraGear').length,1);
 assert.ok(!w.localStorage.getItem('huntMyGear')?.includes('Custom tripod'));
 dom.window.close();
});

test('search errors leave manual product entry available',async()=>{
 const dom=new JSDOM(fs.readFileSync('index.html','utf8'),{url:'https://hunt.example',runScripts:'outside-only'}),w=dom.window;
 w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};
 w.fetch=async url=>url.endsWith('product-search')?{ok:false,json:async()=>({error:'Search unavailable'})}:{ok:true,json:async()=>({products:[]})};
 for(const path of ['data.js','app.js','product-search.js'])w.eval(fs.readFileSync(path,'utf8'));
 await tick();w.openProductSearch('gear');w.document.querySelector('#webQuery').value='tripod';w.document.querySelector('#webSearchForm').dispatchEvent(new w.Event('submit',{cancelable:true}));await tick();
 assert.equal(w.document.querySelector('#productStatus').textContent,'Search unavailable');assert.equal(w.document.querySelector('#searchProducts').disabled,false);
 w.document.querySelector('#manualProduct').click();assert.ok(w.document.querySelector('#reviewProduct'));dom.window.close();
});
