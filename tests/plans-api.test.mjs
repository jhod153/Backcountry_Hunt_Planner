import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { transform } from 'esbuild';

async function endpoint(user) {
  const source=(await readFile('netlify/functions/plans.mts','utf8'))
    .replace(/^import .*;\n/gm,'').replace('export default async','const handler = async');
  const {code}=await transform(source,{loader:'ts',target:'es2022'});
  let inserted;
  const db={insert:()=>({values:value=>{inserted=value;return {returning:async()=>[{id:'saved-plan',version:1,...value}]};}})};
  const handler=new Function('getUser','database','plans','collaborators','and','or','eq','desc','sql',code+'\nreturn handler;')(
    async()=>user,()=>db,{ownerId:'owner_id'}, {},()=>null,()=>null,()=>null,()=>null,()=>null
  );
  return {handler,inserted:()=>inserted};
}
test('verified Identity sessions without a confirmation timestamp can save drafts',async()=>{
  const {handler,inserted}=await endpoint({id:'verified-owner',email:'owner@example.com'});
  const response=await handler(new Request('https://planner.example/.netlify/functions/plans',{
    method:'POST',headers:{'Content-Type':'application/json',Origin:'https://planner.example'},
    body:JSON.stringify({name:'November hunt',data:{state:{days:7}}})
  }));
  assert.equal(response.status,201);
  assert.equal(inserted().ownerId,'verified-owner');
  assert.equal((await response.json()).name,'November hunt');
});
test('anonymous requests cannot read or save hunt plans',async()=>{
  const {handler,inserted}=await endpoint(null);
  for(const method of ['GET','POST']){
    const response=await handler(new Request('https://planner.example/.netlify/functions/plans',{method}));
    assert.equal(response.status,401);
  }
  assert.equal(inserted(),undefined);
});
test('signed-in draft writes still reject requests from another origin',async()=>{
  const {handler,inserted}=await endpoint({id:'verified-owner',email:'owner@example.com'});
  const response=await handler(new Request('https://planner.example/.netlify/functions/plans',{
    method:'POST',headers:{'Content-Type':'application/json',Origin:'https://other.example'},body:'{}'
  }));
  assert.equal(response.status,403);assert.equal(inserted(),undefined);
});
