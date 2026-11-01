import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';
const tick=()=>new Promise(r=>setTimeout(r,15));
async function setup(options={}){
 const dom=new JSDOM(await readFile('index.html','utf8'),{url:options.url||'https://planner.example',runScripts:'outside-only'}),w=dom.window;
 w.structuredClone=structuredClone;
 w.eval(await readFile('data.js','utf8'));w.eval(await readFile('app.js','utf8'));
 let session=options.session||null,stored=options.stored||null,conflict=false;const requests=[];
 w.identity={refreshSession:async()=>null,getUser:async()=>session,login:async()=>session={id:'owner',email:'owner@example.com',confirmedAt:'2026-11-01'},signup:async()=>({}),logout:async()=>{session=null},handleAuthCallback:async()=>null,onAuthChange:()=>{},requestPasswordRecovery:async()=>{},updateUser:async()=>{},acceptInvite:async()=>{}};
 w.fetch=async(url,options)=>{
  const body=options.body?JSON.parse(options.body):null;requests.push({url,method:options.method,body});
  let data;
  if(options.method==='POST')data=stored={id:'123',ownerId:'owner',version:1,name:body.name,data:body.data,members:[]};
  else if(options.method==='PUT'&&conflict)return {ok:false,json:async()=>({error:'Another person saved changes.'})};
  else if(options.method==='PUT')data=stored={...stored,name:body.name,data:body.data,version:stored.version+1};
  else if(options.method==='PATCH'){stored.members.push({email:body.email});data={ok:true};}
  else data=url.includes('?id=')?stored:stored?[stored]:[];
  return {ok:true,json:async()=>structuredClone(data)};
 };
 const source=(await readFile('collaboration.js','utf8')).replace(/^import .*?;\n/,"const { login, signup, logout, getUser, handleAuthCallback, requestPasswordRecovery, updateUser, acceptInvite, onAuthChange, refreshSession } = window.identity;\n");w.eval(source);await tick();
 if(!options.session){const form=w.document.getElementById('authForm');form.elements.email.value='owner@example.com';form.elements.password.value='example-password';form.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await tick();}
 return {dom,w,requests,getStored:()=>structuredClone(stored),setConflict:()=>conflict=true};
}
test('signed-in owners save a draft and select collaborators by email',async()=>{
 const {dom,w,requests}=await setup();
 w.document.getElementById('savePlan').click();await tick();
 assert.equal(requests.find(r=>r.method==='POST').body.name,'September Elk - 5 Days');
 const form=w.document.getElementById('shareForm');assert.ok(form);
 form.elements.email.value='crew@example.com';form.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await tick();
 assert.equal(requests.find(r=>r.method==='PATCH').body.email,'crew@example.com');
 assert.match(w.document.getElementById('accountPanel').textContent,/crew@example.com/);
 dom.window.close();
});
test('save conflicts preserve unsaved edits and show the server message',async()=>{
 const {dom,w,setConflict}=await setup();w.document.getElementById('savePlan').click();await tick();
 const input=w.document.getElementById('huntName');input.value='My unsaved changes';input.dispatchEvent(new w.Event('input',{bubbles:true}));setConflict();
 w.document.getElementById('savePlan').click();await tick();
 assert.match(w.document.getElementById('accountMessage').textContent,/Another person saved/);
 assert.equal(w.huntPlanner.snapshot().state.huntName,'My unsaved changes');
 assert.equal(w.document.getElementById('saveState').textContent,'Changes are not saved. Use Save to retry.');
 dom.window.close();
});

test('edits autosave online and reopen after refresh with all hunt inputs',async()=>{
 const first=await setup();
 const input=first.w.document.getElementById('huntName');input.value='November backcountry';input.dispatchEvent(new first.w.Event('input',{bubbles:true}));
 const days=first.w.document.getElementById('days');days.value='7';days.dispatchEvent(new first.w.Event('change',{bubbles:true}));
 await new Promise(r=>setTimeout(r,800));
 const stored=first.getStored();assert.equal(stored.data.state.huntName,'November backcountry');assert.equal(stored.data.state.days,7);
 assert.equal(first.w.document.getElementById('saveState').textContent,'All changes saved');
 const url=first.w.location.href;assert.match(url,/plan=123/);first.dom.window.close();
 const second=await setup({session:{id:'owner',email:'owner@example.com'},stored,url});
 assert.equal(second.w.huntPlanner.snapshot().state.huntName,'November backcountry');
 assert.equal(second.w.huntPlanner.snapshot().state.days,7);
 assert.equal(second.w.document.getElementById('savePlan').textContent,'Save changes');
 const name=second.w.document.getElementById('huntName');name.value='Updated hunt';name.dispatchEvent(new second.w.Event('input',{bubbles:true}));
 await new Promise(r=>setTimeout(r,800));
 assert.equal(second.requests.filter(r=>r.method==='POST').length,0);
 assert.equal(second.requests.filter(r=>r.method==='PUT').length,1);
 assert.equal(second.getStored().data.state.huntName,'Updated hunt');second.dom.window.close();
});
test('refresh without a plan URL reopens the most recent owned plan',async()=>{
 const first=await setup();first.w.document.getElementById('savePlan').click();await tick();
 const stored=first.getStored();first.dom.window.close();
 const second=await setup({session:{id:'owner',email:'owner@example.com'},stored});
 assert.equal(second.w.document.getElementById('savePlan').textContent,'Save changes');second.dom.window.close();
});
test('a refresh with unsaved edits warns before leaving',async()=>{
 const {dom,w}=await setup();
 const input=w.document.getElementById('huntName');input.value='Unsaved hunt';input.dispatchEvent(new w.Event('input',{bubbles:true}));
 const event=new w.Event('beforeunload',{cancelable:true});w.dispatchEvent(event);assert.equal(event.defaultPrevented,true);dom.window.close();
});
