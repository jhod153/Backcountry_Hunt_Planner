import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';
async function planner() {
 const html=await readFile('index.html','utf8');
 const dom=new JSDOM(html,{url:'https://planner.example',runScripts:'outside-only'});
 dom.window.eval(await readFile('data.js','utf8'));
 dom.window.structuredClone=structuredClone;
 dom.window.eval(await readFile('app.js','utf8'));
 return dom;
}
test('saved hunt round-trips all editable state, quantities, fuel and bear storage',async()=>{
 const dom=await planner(),p=dom.window.huntPlanner;
 const saved=JSON.parse(JSON.stringify(p.snapshot()));
 saved.state.huntName='Crew elk hunt';saved.state.days=7;saved.state.water=3;
 saved.state.menus[6]={'Breakfast::0':2};saved.state.optional={'10':true};
 saved.state.pantry={'Ramen':true};saved.state.shopDone={'Tuna pouch':true};saved.state.truck={'0':true};
 saved.state.myGear.custom=[{id:'custom-test',model:'Crew pack',slot:'backpack',g:1000}];
 saved.bear={enabled:true,size:'large'};saved.fuel={size:'large',qty:3};saved.quantities[0]=2;
 p.restore(saved);
 assert.deepEqual(JSON.parse(JSON.stringify(p.snapshot())),saved);
 assert.equal(dom.window.document.getElementById('huntName').value,'Crew elk hunt');
 dom.window.close();
});
test('invalid saved data is rejected before changing the current hunt',async()=>{
 const dom=await planner(),p=dom.window.huntPlanner,original=JSON.stringify(p.snapshot());
 const invalid=JSON.parse(original);invalid.state.days=11;
 assert.throws(()=>p.restore(invalid));assert.equal(JSON.stringify(p.snapshot()),original);
 dom.window.close();
});
test('hunt names render as text rather than markup',async()=>{
 const dom=await planner(),p=dom.window.huntPlanner,saved=JSON.parse(JSON.stringify(p.snapshot()));
 saved.state.huntName='"><img src=x onerror=alert(1)>';
 p.restore(saved);
 assert.equal(dom.window.document.getElementById('huntName').value,saved.state.huntName);
 assert.equal(dom.window.document.querySelector('#setup img'),null);
 dom.window.close();
});
