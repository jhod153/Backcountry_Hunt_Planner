const CACHE='hunt-planner-v4';
const STATIC=['./icon.svg','./manifest.webmanifest'];
const MUTABLE=['./','./index.html','./styles.css','./data.js','./app.js'];

self.addEventListener('install',event=>{
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll([...STATIC,...MUTABLE])));
});

self.addEventListener('activate',event=>{
  event.waitUntil((async()=>{
    const keys=await caches.keys();
    await Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key)));
    await self.clients.claim();
  })());
});

async function networkFirst(request){
  try{
    const response=await fetch(request,{cache:'no-store'});
    if(response && response.ok){
      const cache=await caches.open(CACHE);
      cache.put(request,response.clone());
    }
    return response;
  }catch(err){
    return (await caches.match(request)) || (request.mode==='navigate' ? caches.match('./index.html') : Response.error());
  }
}

self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET') return;
  const url=new URL(event.request.url);
  if(url.origin!==self.location.origin) return;
  if(event.request.mode==='navigate' || /\/(index\.html|styles\.css|app\.js|data\.js)$/.test(url.pathname)){
    event.respondWith(networkFirst(event.request));
    return;
  }
  event.respondWith(caches.match(event.request).then(cached=>cached || fetch(event.request).then(response=>{
    if(response && response.ok){caches.open(CACHE).then(cache=>cache.put(event.request,response.clone()));}
    return response;
  })));
});
