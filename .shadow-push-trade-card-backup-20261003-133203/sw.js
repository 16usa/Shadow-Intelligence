/* SHADOW_WEB_PUSH_IOS_V100_SW */
self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));

self.addEventListener('push',event=>{
  let data={};
  try{data=event.data?.json?.()||{};}catch{data={body:event.data?.text?.()||'New Shadow Intelligence alert'};}
  const title=String(data.title||'Shadow Intelligence');
  const options={
    body:String(data.body||'New confirmed trade alert'),
    icon:'/assets/shadow-push-192.png',
    badge:'/assets/shadow-push-192.png',
    tag:String(data.tag||'shadow-trade'),
    renotify:true,
    data:{url:String(data.url||'/'),eventId:data.eventId||'',entityId:data.entityId||'',tokenMint:data.tokenMint||''}
  };
  event.waitUntil(self.registration.showNotification(title,options));
});

self.addEventListener('notificationclick',event=>{
  event.notification.close();
  const target=new URL(String(event.notification?.data?.url||'/'),self.location.origin).href;
  event.waitUntil((async()=>{
    const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});
    for(const client of windows){
      if('navigate' in client)await client.navigate(target).catch(()=>{});
      if('focus' in client)return client.focus();
    }
    return self.clients.openWindow(target);
  })());
});
