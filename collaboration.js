import { login, signup, logout, getUser, handleAuthCallback, requestPasswordRecovery, updateUser, acceptInvite, onAuthChange } from '@netlify/identity';
const root=document.getElementById('accountPanel');
const planner=window.huntPlanner;
const draft=planner.snapshot();
let user=null, current=null, list=[], baseline=JSON.stringify(draft), busy=false, mode='login', inviteToken=null;
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const changed=()=>JSON.stringify(planner.snapshot())!==baseline;
const message=(text,error=false)=>{const el=document.getElementById('accountMessage');if(el){el.textContent=text;el.classList.toggle('account-error',error)}};
async function api(method='GET',body,id){
  await getUser();
  const res=await fetch('/.netlify/functions/plans'+(id?'?id='+encodeURIComponent(id):''),{method,credentials:'same-origin',cache:'no-store',headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined});
  const data=await res.json();if(!res.ok)throw Error(data.error||'Request failed.');return data;
}
function render(){
  root.innerHTML=`<div class="section-kicker">Hunt together</div><div class="account-heading"><h2>${user?'Your hunt plans':'Save your hunt. Bring your crew.'}</h2>${user?`<span class="muted">${esc(user.email)}</span>`:''}</div><p class="muted">${user?'Save your changes before leaving. Only you and the people you add can open a plan.':'Sign in to store plans across devices and edit them with selected people.'}</p><p id="accountMessage" role="status" aria-live="polite"></p>`;
  if(mode==='reset'||mode==='invite'){
    root.insertAdjacentHTML('beforeend',`<form id="resetForm" class="account-form"><label>New password<input class="field" name="password" type="password" minlength="8" autocomplete="new-password" required></label><button class="primary">Set password</button></form>`);
    document.getElementById('resetForm').onsubmit=e=>run(e,async()=>{const password=new FormData(e.target).get('password');if(mode==='invite')await acceptInvite(inviteToken,password);else await updateUser({password});mode='login';await hydrate();message('Password saved.');});return;
  }
  if(!user){
    root.insertAdjacentHTML('beforeend',`<div class="actions account-modes"><button type="button" class="${mode==='login'?'primary':'secondary'}" data-mode="login">Sign in</button><button type="button" class="${mode==='signup'?'primary':'secondary'}" data-mode="signup">Create account</button><button type="button" class="secondary" data-mode="recover">Forgot password</button></div><form id="authForm" class="account-form">${mode==='signup'?'<label>Name<input class="field" name="name" autocomplete="name" required maxlength="100"></label>':''}<label>Email<input class="field" name="email" type="email" autocomplete="email" required></label>${mode!=='recover'?`<label>Password<input class="field" name="password" type="password" ${mode==='signup'?'minlength="8"':''} autocomplete="${mode==='signup'?'new-password':'current-password'}" required></label>`:''}<button class="primary">${mode==='signup'?'Create account':mode==='recover'?'Send reset link':'Sign in'}</button></form>`);
    root.querySelectorAll('[data-mode]').forEach(b=>b.onclick=()=>{mode=b.dataset.mode;render()});
    document.getElementById('authForm').onsubmit=e=>run(e,async()=>{
      const f=new FormData(e.target),email=f.get('email'),password=f.get('password');
      if(mode==='recover'){await requestPasswordRecovery(email);message('Check your email for a password reset link.');return;}
      if(mode==='signup'){const account=await signup(email,password,{full_name:f.get('name')});if(!account.confirmedAt){message('Check your email to confirm your account, then sign in.');return;}}
      else await login(email,password);
      await hydrate();message('Signed in. Save this draft or open one of your saved plans.');
    });return;
  }
  root.insertAdjacentHTML('beforeend',`<div class="saved-plan-controls"><label>Saved plans<select id="planSelect" class="field"><option value="">Choose a plan…</option>${list.map(p=>`<option value="${esc(p.id)}" ${p.id===current?.id?'selected':''}>${esc(p.name)}${p.ownerId!==user.id?' · Shared with you':''}</option>`).join('')}</select></label><button id="openPlan" class="secondary">Open latest</button><button id="refreshPlans" class="secondary">Refresh list</button></div><div class="actions"><button id="savePlan" class="primary">${current?'Save changes':'Save this draft'}</button><button id="saveCopy" class="secondary">Save as separate plan</button><button id="signOut" class="secondary">Sign out</button></div><p id="saveState" class="muted"></p><div id="discardPrompt"></div>${current?.ownerId===user.id?`<details class="sharing"><summary>Manage collaborators</summary><p class="muted">Add the email they use to sign in. They can open and edit this plan from their saved plans after creating and confirming their account. Let them know you added them.</p><form id="shareForm" class="account-form"><label>Collaborator email<input class="field" type="email" name="email" maxlength="254" required></label><button class="secondary">Add editor</button></form><div>${(current.members||[]).map(m=>`<div class="row"><span>${esc(m.email)}</span><button class="secondary remove-member" data-email="${esc(m.email)}">Remove</button></div>`).join('')}</div></details>`:''}`);
  document.getElementById('openPlan').onclick=()=>run(null,async()=>{
    const id=document.getElementById('planSelect').value;if(!id)throw Error('Choose a saved plan first.');
    if(changed()){confirmDiscard(()=>open(id));return;}await open(id);
  });
  document.getElementById('refreshPlans').onclick=()=>run(null,async()=>{list=await api();render();message('Plan list refreshed.');});
  document.getElementById('savePlan').onclick=()=>run(null,()=>save(false));
  document.getElementById('saveCopy').onclick=()=>run(null,()=>save(true));
  document.getElementById('signOut').onclick=()=>run(null,async()=>{if(changed()){confirmDiscard(signOut);return;}await signOut()});
  if(current?.ownerId===user.id){
    document.getElementById('shareForm').onsubmit=e=>run(e,async()=>{await api('PATCH',{email:new FormData(e.target).get('email')},current.id);await reloadMembers();message('Editor added. They can sign in to find this plan.');});
    root.querySelectorAll('.remove-member').forEach(b=>b.onclick=()=>run(null,async()=>{await api('PATCH',{email:b.dataset.email,remove:true},current.id);await reloadMembers();message('Editor removed.');}));
  }
  updateDirty();
}
function confirmDiscard(action){
  const box=document.getElementById('discardPrompt');
  box.innerHTML='<div class="warning">You have unsaved changes. Save them first, or discard them to continue.<div class="actions"><button id="discardChanges" class="secondary">Discard changes and continue</button><button id="cancelDiscard" class="secondary">Keep editing</button></div></div>';
  document.getElementById('discardChanges').onclick=()=>run(null,action);
  document.getElementById('cancelDiscard').onclick=()=>box.replaceChildren();
}
async function open(id){
  const plan=await api('GET',null,id);planner.restore(plan.data);current=plan;baseline=JSON.stringify(planner.snapshot());render();message('Latest plan opened.');
}
async function save(copy){
  const snapshot=planner.snapshot(),name=snapshot.state.huntName.trim();
  if(!name)throw Error('Enter a hunt name in Setup first.');
  const saved=await api(copy||!current?'POST':'PUT',{name,data:snapshot,version:current?.version},copy?null:current?.id);
  current={...saved,members:copy?[]:current?.members||[]};baseline=JSON.stringify(snapshot);list=await api();render();message('Plan saved.');
}
async function reloadMembers(){const plan=await api('GET',null,current.id);current.members=plan.members;render();}
async function signOut(){await logout();user=null;current=null;list=[];planner.restore(draft);baseline=JSON.stringify(planner.snapshot());render();message('Signed out.');}
async function hydrate(){const next=await getUser();if(user&&next?.id!==user.id){current=null;list=[];planner.restore(draft);baseline=JSON.stringify(planner.snapshot());}user=next;render();if(user){list=await api();render();}}
async function run(e,fn){e?.preventDefault();if(busy)return;busy=true;root.querySelectorAll('button').forEach(b=>b.disabled=true);try{await fn()}catch(err){message(err.message||'Something went wrong. Please try again.',true)}finally{busy=false;root.querySelectorAll('button').forEach(b=>b.disabled=false);updateDirty();}}
function updateDirty(){const el=document.getElementById('saveState');if(el)el.textContent=current?(changed()?'Unsaved changes':'All changes saved'):'Draft — save to keep this plan online.';}
document.addEventListener('input',updateDirty);document.addEventListener('change',()=>setTimeout(updateDirty,0));document.addEventListener('click',()=>setTimeout(updateDirty,0));
window.addEventListener('beforeunload',e=>{if(user&&changed()){e.preventDefault();e.returnValue='';}});
onAuthChange((event)=>{if(['logout','login','user_updated'].includes(event)&&!busy)void run(null,hydrate);});
render();
void run(null,async()=>{const result=await handleAuthCallback();if(result?.type==='recovery'||result?.type==='invite'){mode=result.type==='recovery'?'reset':'invite';inviteToken=result.token;user=await getUser();render();return;}await hydrate();});
