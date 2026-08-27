/* Personal Manager - Documents
 * Cloud-backed Documents module.
 * IMPORTANT: this file only changes document file storage to Supabase Storage.
 * It does not use browser-only Blob/IndexedDB storage for uploaded files.
 */

const STORAGE_BUCKET = 'documents';
const MAX_FILE_SIZE = 6 * 1024 * 1024;
const DOC_CATEGORIES = ['Aadhaar','PAN','ID /Driving License','Passport','Voter ID','Warranty','Vehicle RC','Subscription','Property','Education Certificate','Other'];

const $ = (s, root=document) => root.querySelector(s);
const $$ = (s, root=document) => [...root.querySelectorAll(s)];

function esc(v) {
  if (typeof window.escapeHTML === 'function') return window.escapeHTML(v ?? '');
  return String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

function getClient() {
  try {
    if (typeof supabaseClient !== 'undefined' && supabaseClient?.from) return supabaseClient;
  } catch (_) {}
  if (window.supabaseClient?.from) return window.supabaseClient;
  throw new Error('Supabase client is not loaded. Please check supabase-config.js.');
}

async function getUser() {
  const client = getClient();
  const { data, error } = await client.auth.getUser();
  if (error) throw error;
  if (!data?.user) {
    location.href = 'login.html';
    throw new Error('You are not logged in.');
  }
  return data.user;
}

function daysUntilLocal(date) {
  if (!date) return null;
  const a = new Date(); a.setHours(0,0,0,0);
  const b = new Date(`${date}T00:00:00`);
  if (Number.isNaN(b.getTime())) return null;
  return Math.ceil((b-a)/86400000);
}

function fmtDateLocal(date) {
  if (!date) return '—';
  const d = new Date(`${date}T00:00:00`);
  if (Number.isNaN(d.getTime())) return date;
  return d.toLocaleDateString('en-IN', {day:'2-digit', month:'short', year:'numeric'});
}

function uidLocal() {
  try { return crypto.randomUUID(); } catch (_) { return `${Date.now()}-${Math.random().toString(36).slice(2)}`; }
}

function openModalLocal(html) {
  if (typeof window.openModal === 'function') return window.openModal(html);
  const root = $('#modalRoot');
  if (!root) throw new Error('Modal container is missing.');
  root.innerHTML = `<div class="modal-backdrop" id="docModalBackdrop"><div class="modal">${html}</div></div>`;
  $('#docModalBackdrop').addEventListener('click', e => { if (e.target.id === 'docModalBackdrop') closeModalLocal(); });
}
function closeModalLocal() {
  if (typeof window.closeModal === 'function') return window.closeModal();
  const root = $('#modalRoot'); if (root) root.innerHTML = '';
}

async function listDocuments() {
  const user = await getUser();
  const { data, error } = await getClient().from('documents')
    .select('*').eq('user_id', user.id).order('created_at', {ascending:false});
  if (error) throw error;
  return (data || []).map(r => ({
    ...r,
    issueDate: r.issue_date ?? null,
    expiryDate: r.expiry_date ?? null,
    filePath: r.file_path ?? null,
    fileName: r.file_name ?? null,
    fileType: r.file_type ?? null,
    fileSize: r.file_size ?? null,
    reminders: Array.isArray(r.reminders) ? r.reminders : [],
    notifiedThresholds: Array.isArray(r.notified_thresholds) ? r.notified_thresholds : []
  }));
}

async function uploadDocumentFile(file, userId, documentId) {
  if (!file) return null;
  if (file.size > MAX_FILE_SIZE) throw new Error('Maximum file size is 6 MB.');
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const path = `${userId}/${documentId}/${Date.now()}-${safeName}`;
  const { error } = await getClient().storage.from(STORAGE_BUCKET).upload(path, file, {
    cacheControl: '3600',
    contentType: file.type || 'application/octet-stream',
    upsert: false
  });
  if (error) throw new Error(`File upload failed: ${error.message}`);
  return path;
}

async function deleteStorageFile(path) {
  if (!path) return;
  const { error } = await getClient().storage.from(STORAGE_BUCKET).remove([path]);
  if (error) throw new Error(`Storage delete failed: ${error.message}`);
}

async function openDocumentFile(path) {
  if (!path) throw new Error('No file is attached to this document.');
  const { data, error } = await getClient().storage.from(STORAGE_BUCKET).createSignedUrl(path, 600);
  if (error || !data?.signedUrl) throw new Error(error?.message || 'Could not create secure file URL.');
  window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
}

async function renderDocuments() {
  const view = $('#view');
  if (!view) return;
  view.innerHTML = '<div class="empty">Loading documents...</div>';
  try {
    const docs = await listDocuments();
    docs.sort((a,b) => (daysUntilLocal(a.expiryDate) ?? 99999) - (daysUntilLocal(b.expiryDate) ?? 99999));
    view.innerHTML = `<div class="section" style="margin-top:8px;">
      <div class="section-head"><span class="section-title">All documents</span><span class="section-count">${docs.length}</span></div>
      ${docs.length ? docs.map(d => `<div class="card" data-doc-id="${esc(d.id)}" role="button" tabindex="0">
        <div class="card-body"><div class="card-title">${esc(d.name)}</div>
        <div class="card-sub">${esc(d.category || 'Other')} · ${d.expiryDate ? `expires ${esc(fmtDateLocal(d.expiryDate))}` : 'No expiry'}${d.fileName ? ` · ${esc(d.fileName)}` : ''}</div></div>
        <div class="card-chip">${d.filePath ? 'File' : 'No file'}</div></div>`).join('') : '<div class="empty">No documents yet. Tap + to add one.</div>'}
    </div>`;
    $$('.card[data-doc-id]', view).forEach(card => {
      const open = () => { const d = docs.find(x => x.id === card.dataset.docId); if (d) showDocumentDetail(d); };
      card.addEventListener('click', open);
      card.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); }});
    });
  } catch (e) {
    console.error('Documents load error:', e);
    view.innerHTML = `<div class="empty">Unable to load documents.<br><small>${esc(e.message || String(e))}</small></div>`;
  }
}

function showDocumentDetail(doc) {
  openModalLocal(`<div class="modal-title">${esc(doc.name)}</div>
    <div class="section">
      <div class="detail-row"><span>Category</span><strong>${esc(doc.category || 'Other')}</strong></div>
      <div class="detail-row"><span>Issue date</span><strong>${esc(doc.issueDate ? fmtDateLocal(doc.issueDate) : '—')}</strong></div>
      <div class="detail-row"><span>Expiry</span><strong>${esc(doc.expiryDate ? fmtDateLocal(doc.expiryDate) : 'No expiry')}</strong></div>
      <div class="detail-row"><span>File</span><strong>${esc(doc.fileName || 'No file attached')}</strong></div>
      ${doc.notes ? `<div class="detail-row"><span>Notes</span><span>${esc(doc.notes)}</span></div>` : ''}
    </div>
    <div class="modal-actions">
      ${doc.filePath ? '<button type="button" class="btn primary" id="viewDocFileBtn">View File</button>' : ''}
      <button type="button" class="btn" id="editDocBtn">Edit</button>
      <button type="button" class="btn" id="closeDocBtn">Close</button>
    </div>`);
  $('#closeDocBtn')?.addEventListener('click', closeModalLocal);
  $('#editDocBtn')?.addEventListener('click', () => { closeModalLocal(); openDocumentForm(doc); });
  $('#viewDocFileBtn')?.addEventListener('click', async () => {
    try { await openDocumentFile(doc.filePath); } catch(e) { alert(e.message || e); }
  });
}

function openDocumentForm(existing=null) {
  const isEdit = !!existing;
  const old = existing || { id: uidLocal(), reminders: [], notifiedThresholds: [] };
  let selectedReminder = Number(old.reminders?.[0]) || null;
  if (!(selectedReminder > 0 && selectedReminder <= 365)) selectedReminder = null;
  const noExpiry = !old.expiryDate;

  openModalLocal(`<div class="modal-title">${isEdit ? 'Edit document' : 'Add document'}</div>
    <form id="docForm">
      <div class="field"><label>Document name</label><input type="text" name="name" required value="${esc(old.name || '')}" placeholder="e.g. Car insurance"></div>
      <div class="field"><label>Category</label><select name="category">${DOC_CATEGORIES.map(c => `<option ${old.category===c?'selected':''}>${esc(c)}</option>`).join('')}</select></div>
      <div class="field"><label>Issue date</label><input type="date" name="issueDate" value="${esc(old.issueDate || '')}"></div>
      <div class="field"><label>Expiry date</label><input type="date" name="expiryDate" value="${esc(old.expiryDate || '')}" ${noExpiry?'disabled':''}></div>
      <div class="field"><label style="display:flex;align-items:center;gap:10px;text-transform:none;font-size:16px;"><input type="checkbox" id="noExpiry" ${noExpiry?'checked':''} style="width:auto;"><span>No expiry</span></label></div>
      <div class="field"><label>Remind me before expiry</label><div class="chip-row" id="docReminderChips">
        ${[30,7,1].map(n => `<button type="button" class="chip-toggle ${selectedReminder===n?'on':''}" data-val="${n}" aria-pressed="${selectedReminder===n}">${n} day${n>1?'s':''}</button>`).join('')}
        <button type="button" class="chip-toggle ${selectedReminder && ![30,7,1].includes(selectedReminder)?'on':''}" id="docCustomBtn">Custom</button>
      </div><div id="docCustomField" style="${selectedReminder && ![30,7,1].includes(selectedReminder) && !noExpiry?'':'display:none;'}margin-top:12px;"><label style="display:block;margin-bottom:8px;text-transform:none;">Custom reminder (days before expiry)</label><input type="number" id="docCustomDays" min="1" max="365" value="${selectedReminder && ![30,7,1].includes(selectedReminder)?selectedReminder:''}" placeholder="e.g. 15"></div></div>
      <div class="field"><label>Notes</label><textarea name="notes" placeholder="Optional notes">${esc(old.notes || '')}</textarea></div>
      <div class="field"><label>Photo / PDF</label><div class="filepick"><span class="filepick-name" id="fileName">${esc(old.fileName || 'No file attached')}</span><button type="button" class="filepick-btn" id="filePickBtn">Choose</button><input type="file" id="fileInput" accept="application/pdf,image/jpeg,image/png"></div><small>PDF, JPG or PNG. Maximum 6 MB. Files are stored securely in Supabase.</small></div>
      <div class="modal-actions">${isEdit?'<button type="button" class="btn danger" id="deleteBtn">Delete Entry</button>':''}<button type="button" class="btn" id="cancelBtn">Cancel</button><button type="submit" class="btn primary" id="saveDocBtn">Save</button></div>
    </form>`);

  let selectedFile = null;
  const chips = $$('#docReminderChips .chip-toggle[data-val]');
  const customBtn = $('#docCustomBtn'), customField = $('#docCustomField'), customInput = $('#docCustomDays');
  const noExpiryBox = $('#noExpiry'), expiryInput = $('#docForm input[name="expiryDate"]');
  const clearReminder = () => { chips.forEach(c=>{c.classList.remove('on');c.setAttribute('aria-pressed','false');}); customBtn.classList.remove('on');customBtn.setAttribute('aria-pressed','false');customField.style.display='none';customInput.value=''; };
  const selectPreset = n => { clearReminder(); const c=chips.find(x=>Number(x.dataset.val)===n); if(c){c.classList.add('on');c.setAttribute('aria-pressed','true');} };
  const selectCustom = () => { clearReminder(); customBtn.classList.add('on');customBtn.setAttribute('aria-pressed','true');customField.style.display='';customInput.focus(); };
  chips.forEach(c=>c.addEventListener('click',()=>{if(!noExpiryBox.checked)selectPreset(Number(c.dataset.val));}));
  customBtn.addEventListener('click',()=>{if(!noExpiryBox.checked)(customBtn.classList.contains('on')?clearReminder():selectCustom());});
  noExpiryBox.addEventListener('change',()=>{expiryInput.disabled=noExpiryBox.checked;if(noExpiryBox.checked){expiryInput.value='';clearReminder();}chips.forEach(c=>c.disabled=noExpiryBox.checked);customBtn.disabled=noExpiryBox.checked;customInput.disabled=noExpiryBox.checked;});
  noExpiryBox.dispatchEvent(new Event('change'));
  $('#filePickBtn').addEventListener('click',()=>$('#fileInput').click());
  $('#fileInput').addEventListener('change',e=>{const f=e.target.files[0];if(!f)return;if(!['application/pdf','image/jpeg','image/png'].includes(f.type)){alert('Only PDF, JPG or PNG files are allowed.');e.target.value='';return;}if(f.size>MAX_FILE_SIZE){alert('Maximum file size is 6 MB.');e.target.value='';return;}selectedFile=f;$('#fileName').textContent=f.name;});
  $('#cancelBtn').addEventListener('click',closeModalLocal);

  if(isEdit) $('#deleteBtn').addEventListener('click',async()=>{if(!confirm('Delete this document entry?'))return;try{await deleteCloudDocument(old);closeModalLocal();await renderDocuments();}catch(e){console.error(e);alert(`Could not delete document: ${e.message||e}`);}});

  $('#docForm').addEventListener('submit',async e=>{
    e.preventDefault();
    const btn=$('#saveDocBtn');btn.disabled=true;btn.textContent='Saving...';
    const fd=new FormData(e.target);const name=String(fd.get('name')||'').trim();const issueDate=String(fd.get('issueDate')||'');const expiryDate=noExpiryBox.checked?null:String(fd.get('expiryDate')||'');
    if(!name){btn.disabled=false;btn.textContent='Save';alert('Please enter a document name.');return;}
    if(issueDate&&expiryDate&&issueDate>expiryDate){btn.disabled=false;btn.textContent='Save';alert('Expiry date must be after the issue date.');return;}
    let reminder=null;if(!noExpiryBox.checked){const preset=chips.find(c=>c.classList.contains('on'));if(preset)reminder=Number(preset.dataset.val);else if(customBtn.classList.contains('on')){const n=Number(customInput.value);if(!Number.isInteger(n)||n<1||n>365){btn.disabled=false;btn.textContent='Save';alert('Please enter a custom reminder between 1 and 365 days.');return;}reminder=n;}}
    let uploadedPath=null;
    try {
      const user=await getUser();const id=old.id||uidLocal();
      const record={id,user_id:user.id,name,category:fd.get('category')||'Other',issue_date:issueDate||null,expiry_date:expiryDate,notes:String(fd.get('notes')||'').trim()||null,file_path:old.filePath||null,file_name:old.fileName||null,file_type:old.fileType||null,file_size:old.fileSize||null,reminders:reminder===null?[]:[reminder],notified_thresholds:isEdit&&old.expiryDate===expiryDate?(old.notifiedThresholds||[]):[],updated_at:new Date().toISOString()};
      if(selectedFile){uploadedPath=await uploadDocumentFile(selectedFile,user.id,id);record.file_path=uploadedPath;record.file_name=selectedFile.name;record.file_type=selectedFile.type;record.file_size=selectedFile.size;}
      if(!isEdit)record.created_at=new Date().toISOString();
      const {error}=await getClient().from('documents').upsert(record,{onConflict:'id'});if(error)throw error;
      if(selectedFile&&old.filePath&&old.filePath!==uploadedPath){try{await deleteStorageFile(old.filePath);}catch(e){console.warn(e);}}
      closeModalLocal();await renderDocuments();
    }catch(err){if(uploadedPath){try{await deleteStorageFile(uploadedPath);}catch(_){} }console.error(err);alert(`Could not save document: ${err.message||err}`);btn.disabled=false;btn.textContent='Save';}
  });
}

async function deleteCloudDocument(doc){
  const user=await getUser();
  const {error}=await getClient().from('documents').delete().eq('id',doc.id).eq('user_id',user.id);
  if(error)throw error;
  if(doc.filePath){try{await deleteStorageFile(doc.filePath);}catch(e){console.warn(e);}}
}

function bindPage(){
  const fab=$('#fab');if(fab&&!fab.dataset.bound){fab.dataset.bound='1';fab.addEventListener('click',()=>openDocumentForm(null));}
  const logout=$('#logoutBtn');if(logout&&!logout.dataset.bound){logout.dataset.bound='1';logout.addEventListener('click',async()=>{try{await getClient().auth.signOut();}finally{location.href='login.html';}});}
  const notif=$('#notifPermBtn');if(notif&&!notif.dataset.bound){notif.dataset.bound='1';notif.addEventListener('click',async()=>{if(!('Notification'in window)){alert('Notifications are not supported by this browser.');return;}const p=await Notification.requestPermission();if(p==='granted')alert('Notifications enabled.');});}
  renderDocuments();
}

document.addEventListener('DOMContentLoaded',bindPage);
