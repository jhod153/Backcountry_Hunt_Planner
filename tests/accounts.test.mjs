import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';
const tick=()=>new Promise(r=>setTimeout(r,15));
async function setup(){
 const dom=new JSDOM(await readFile('index.html','utf8'),{url:'https://planner.example',runScripts:'outside-only'}),w=dom.window;
 w.structuredClone=structuredClone;
 w.eval(await readFile('data.js','utf8'));w.eval(await readFile('app.js','utf8'));
 let session=null,stored=null,conflict=false;const requests=[];
 w.identity={getUser:async()=>session,login:async()=>session={id:'owner',email:'owner@example.com',confirmedAt:'2026-11-01'},signup:async()=>({}),logout:async()=>{session=null},handleAuthCallback:async()=>null,onAuthChange:()=>{},requestPasswordRecovery:async()=>{},updateUser:async()=>{},acceptInvite:async()=>{}};
 w.fetch=async(url,options)=>{
  const body=options.body?JSON.parse(options.body):null;requests.push({url,method:options.method,body});
  let data;
  if(options.method==='POST')data=stored={id:'123',ownerId:'owner',version:1,name:body.name,data:body.data,members:[]};
  else if(options.method==='PUT'&&conflict)return {ok:false,json:async()=>({error:'Another person saved changes.'})};
  else if(options.method==='PATCH'){stored.members.push({email:body.email});data={ok:true};}
  else data=url.includes('?id=')?stored:stored?[stored]:[];
  return {ok:true,json:async()=>structuredClone(data)};
 };
 const source=(await readFile('collaboration.js','utf8')).replace(/^import .*?;\n/,"const { login, signup, logout, getUser, handleAuthCallback, requestPasswordRecovery, updateUser, acceptInvite, onAuthChange } = window.identity;\n");w.eval(source);await tick();
 const form=w.document.getElementById('authForm');form.elements.email.value='owner@example.com';form.elements.password.value='example-password';form.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await tick();
 return {dom,w,requests,setConflict:()=>conflict=true};
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
 assert.equal(w.document.getElementById('saveState').textContent,'Unsaved changes');
 dom.window.close();
});
