/* Personal Manager - shared services */
const APP_BUILD = 'multipage-v1';
const DB_NAME = 'personalManagerDB';
const DB_VERSION = 2;

let currentUser = null;

function escapeHTML(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2,8); }
function daysUntil(dateStr) {
  if (!dateStr) return null;
  const today = new Date(); today.setHours(0,0,0,0);
  const target = new Date(dateStr + 'T00:00:00');
  return Math.round((target - today) / 86400000);
}
function statusClass(days) {
  if (days === null) return 'green';
  if (days < 0 || days <= 7) return 'red';
  if (days <= 30) return 'amber';
  return 'green';
}
function daysLabel(days) {
  if (days === null) return '—';
  if (days < 0) return `${Math.abs(days)}d overdue`;
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  return `in ${days}d`;
}
function fmtDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' });
}

let dbPromise = new Promise((resolve, reject) => {
  const req = indexedDB.open(DB_NAME, DB_VERSION);
  req.onupgradeneeded = e => {
    const db = e.target.result;
    if (!db.objectStoreNames.contains('documents')) db.createObjectStore('documents', { keyPath:'id' });
    if (!db.objectStoreNames.contains('maintenance')) db.createObjectStore('maintenance', { keyPath:'id' });
    if (!db.objectStoreNames.contains('financeExpenses')) db.createObjectStore('financeExpenses', { keyPath:'id' });
  };
  req.onsuccess = () => resolve(req.result);
  req.onerror = () => reject(req.error);
});
async function dbGetAll(store) {
  const db = await dbPromise;
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(store,'readonly'); const req=tx.objectStore(store).getAll();
    req.onsuccess=()=>resolve(req.result); req.onerror=()=>reject(req.error);
  });
}
async function dbPut(store,obj) {
  const db=await dbPromise;
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(store,'readwrite'); tx.objectStore(store).put(obj);
    tx.oncomplete=()=>resolve(); tx.onerror=()=>reject(tx.error);
  });
}
async function dbDelete(store,id) {
  const db=await dbPromise;
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(store,'readwrite'); tx.objectStore(store).delete(id);
    tx.oncomplete=()=>resolve(); tx.onerror=()=>reject(tx.error);
  });
}

function getModalRoot() {
  let root=document.getElementById('modalRoot');
  if(!root){ root=document.createElement('div'); root.id='modalRoot'; document.body.appendChild(root); }
  return root;
}
function closeModal(){ getModalRoot().innerHTML=''; }
function openModal(html){
  const root=getModalRoot();
  root.innerHTML=`<div class="modal-backdrop" id="backdrop"><div class="modal-sheet">${html}</div></div>`;
  const backdrop=document.getElementById('backdrop');
  backdrop?.addEventListener('click',e=>{ if(e.target===backdrop) closeModal(); });
}

function pageUrl(name){ return name; }
function goLogin(){ window.location.href = pageUrl('login.html'); }
function goHome(){ window.location.href = pageUrl('index.html'); }

async function requireAuth() {
  const client = window.supabaseClient;
  if (!client) { alert('Supabase is not configured.'); goLogin(); return null; }
  const {data,error}=await client.auth.getSession();
  if(error || !data.session){ goLogin(); return null; }
  currentUser=data.session.user;
  const logout=document.getElementById('logoutBtn');
  if(logout && !logout.dataset.bound){
    logout.dataset.bound='1';
    logout.addEventListener('click', logoutUser);
  }
  const notif=document.getElementById('notifPermBtn');
  if(notif && !notif.dataset.bound){
    notif.dataset.bound='1';
    notif.addEventListener('click', requestNotifPermission);
  }
  client.auth.onAuthStateChange((event,session)=>{
    if(!session){ currentUser=null; goLogin(); }
    else currentUser=session.user;
  });
  return currentUser;
}
async function logoutUser(){
  const client=window.supabaseClient;
  if(client) { const {error}=await client.auth.signOut(); if(error){alert(error.message||'Unable to logout.'); return;} }
  currentUser=null; goLogin();
}

async function requestNotifPermission(){
  if(!('Notification' in window)){alert('Notifications are not supported in this browser.');return;}
  const perm=await Notification.requestPermission();
  if(perm==='granted') checkReminders();
}
async function notify(title,body,tag){
  if(!('Notification' in window)||Notification.permission!=='granted') return;
  try{
    const reg=await navigator.serviceWorker.ready;
    if(reg.active) reg.active.postMessage({type:'SHOW_NOTIFICATION',title,body,tag});
    else new Notification(title,{body});
  }catch(e){ new Notification(title,{body}); }
}
async function checkReminders(){
  if(!('Notification' in window)||Notification.permission!=='granted') return;
  const docs=await dbGetAll('documents');
  for(const d of docs){
    const days=daysUntil(d.expiryDate); if(days===null) continue;
    const reminders=d.reminders||[]; const notified=d.notifiedThresholds||[];
    for(const t of reminders){
      if(days<=t&&!notified.includes(t)){ await notify('Document expiring',`${d.name} expires ${fmtDate(d.expiryDate)} (${daysLabel(days)}).`,`doc-${d.id}-${t}`); notified.push(t); }
    }
    if(days<0&&!notified.includes('overdue')){await notify('Document expired',`${d.name} expired ${fmtDate(d.expiryDate)}.`,`doc-${d.id}-overdue`);notified.push('overdue');}
    if(notified.length!==(d.notifiedThresholds||[]).length){d.notifiedThresholds=notified;await dbPut('documents',d);}
  }
  const items=await dbGetAll('maintenance');
  for(const m of items){
    const days=daysUntil(m.nextServiceDate); if(days===null) continue;
    const reminders=m.reminders||[]; const notified=m.notifiedThresholds||[];
    for(const t of reminders){
      if(days<=t&&!notified.includes(t)){await notify('Maintenance due',`${m.itemName} Maintenance ${fmtDate(m.nextServiceDate)} (${daysLabel(days)}).`,`maint-${m.id}-${t}`);notified.push(t);}
    }
    if(days<0&&!notified.includes('overdue')){await notify('Maintenance overdue',`${m.itemName} service was due ${fmtDate(m.nextServiceDate)}.`,`maint-${m.id}-overdue`);notified.push('overdue');}
    if(notified.length!==(m.notifiedThresholds||[]).length){m.notifiedThresholds=notified;await dbPut('maintenance',m);}
  }
}

document.addEventListener('DOMContentLoaded',()=>{
  if (location.pathname.endsWith('/login.html')) return;
  requireAuth().then(user=>{ if(user && typeof initPage==='function') initPage(); });
});

async function getExpenseUserId() {
  const client = window.supabaseClient;
  if (!client) return null;
  const { data } = await client.auth.getUser();
  return data?.user?.id || null;
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
