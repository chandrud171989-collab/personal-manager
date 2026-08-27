/* Personal Manager - Documents module
 * Cloud-backed document storage: Supabase Storage + public.documents
 * Keeps the existing document UI/features: optional dates, No expiry,
 * one reminder, custom reminder, notes, 6 MB file limit, edit/delete.
 */
const viewEl = document.getElementById('view');
const STORAGE_BUCKET = 'documents';
const DOC_CATEGORIES = ['Àadhar','PAN','ID /Driving License','Passport','Voter ID','Warranty','Vehicle RC','Subscription','Property','Education Certificate','Other'];

function docUid() {
  if (typeof uid === 'function') return uid();
  return crypto.randomUUID();
}
function esc(v) { return typeof escapeHTML === 'function' ? escapeHTML(v ?? '') : String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function getClient() {
  if (window.supabaseClient) return window.supabaseClient;
  if (window.supabase) return window.supabase;
  throw new Error('Supabase is not configured.');
}
async function getUser() {
  const client = getClient();
  const { data, error } = await client.auth.getUser();
  if (error) throw error;
  if (!data?.user) throw new Error('You are not logged in.');
  return data.user;
}

async function getDocuments() {
  const client = getClient();
  const user = await getUser();
  const { data, error } = await client.from('documents').select('*').eq('user_id', user.id).order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

function fromDb(row) {
  return {
    ...row,
    issueDate: row.issue_date ?? row.issueDate ?? null,
    expiryDate: row.expiry_date ?? row.expiryDate ?? null,
    filePath: row.file_path ?? row.filePath ?? null,
    fileName: row.file_name ?? row.fileName ?? null,
    fileType: row.file_type ?? row.fileType ?? null,
    fileSize: row.file_size ?? row.fileSize ?? null,
    reminders: Array.isArray(row.reminders) ? row.reminders : [],
    notifiedThresholds: Array.isArray(row.notified_thresholds) ? row.notified_thresholds : (Array.isArray(row.notifiedThresholds) ? row.notifiedThresholds : [])
  };
}

function toDb(doc, userId) {
  return {
    id: doc.id,
    user_id: userId,
    category: doc.category || 'Other',
    name: doc.name,
    issue_date: doc.issueDate || null,
    expiry_date: doc.expiryDate || null,
    notes: doc.notes || null,
    file_path: doc.filePath || null,
    file_name: doc.fileName || null,
    file_type: doc.fileType || null,
    file_size: doc.fileSize || null,
    reminders: doc.reminders || [],
    notified_thresholds: doc.notifiedThresholds || [],
    updated_at: new Date().toISOString()
  };
}

async function uploadDocumentFile(file, userId, documentId) {
  if (!file) return null;
  if (file.size > 6 * 1024 * 1024) throw new Error('Maximum file size is 6 MB.');
  const client = getClient();
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const path = `${userId}/${documentId}/${Date.now()}-${safeName}`;
  const { error } = await client.storage.from(STORAGE_BUCKET).upload(path, file, {
    contentType: file.type || 'application/octet-stream',
    upsert: false
  });
  if (error) throw new Error(`File upload failed: ${error.message}`);
  return path;
}

async function removeDocumentFile(path) {
  if (!path) return;
  try {
    const client = getClient();
    const { error } = await client.storage.from(STORAGE_BUCKET).remove([path]);
    if (error) console.warn('Storage delete warning:', error.message);
  } catch (e) { console.warn('Storage delete warning:', e); }
}

async function openDocumentFile(path) {
  if (!path) throw new Error('No cloud file is attached to this document.');
  const client = getClient();
  const { data, error } = await client.storage.from(STORAGE_BUCKET).createSignedUrl(path, 10 * 60);
  if (error || !data?.signedUrl) throw new Error(`Could not open file: ${error?.message || 'signed URL unavailable'}`);
  window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
}

async function renderDocuments() {
  try {
    const docs = (await getDocuments()).map(d => ({ ...d, _days: typeof daysUntil === 'function' ? daysUntil(d.expiryDate) : null }));
    docs.sort((a,b) => (a._days ?? 9999) - (b._days ?? 9999));
    viewEl.innerHTML = `<div class="section" style="margin-top:8px;">
      <div class="section-head"><span class="section-title">All documents</span><span class="section-count">${docs.length}</span></div>
      ${docs.length ? docs.map(d => `<div class="card" data-doc-id="${esc(d.id)}"><div class="card-body"><div class="card-title">${esc(d.name)}</div><div class="card-sub">${esc(d.category || 'Other')} · ${d.expiryDate ? `expires ${typeof fmtDate === 'function' ? fmtDate(d.expiryDate) : d.expiryDate}` : 'No expiry'}${d.fileName ? ` · ${esc(d.fileName)}` : ''}</div></div><div class="card-chip">${d.filePath ? 'File' : 'No file'}</div></div>`).join('') : (typeof emptyHTML === 'function' ? emptyHTML('No documents yet. Tap + to add one.') : '<div class="empty">No documents yet. Tap + to add one.</div>')}
    </div>`;
    viewEl.querySelectorAll('[data-doc-id]').forEach(card => card.addEventListener('click', async () => {
      const doc = docs.find(x => x.id === card.dataset.docId);
      if (doc) await showDocumentDetail(doc);
    }));
  } catch (err) {
    console.error(err);
    viewEl.innerHTML = `<div class="empty">Unable to load documents.<br>${esc(err.message || err)}</div>`;
  }
}

async function showDocumentDetail(doc) {
  const fileButton = doc.filePath ? '<button type="button" class="btn primary" id="viewDocFileBtn">View File</button>' : '';
  const editButton = '<button type="button" class="btn" id="editDocBtn">Edit</button>';
  if (typeof openModal === 'function') {
    openModal(`<div class="modal-title">${esc(doc.name)}</div>
      <div class="section"><div class="detail-row"><span>Category</span><strong>${esc(doc.category || 'Other')}</strong></div>
      <div class="detail-row"><span>Issue date</span><strong>${doc.issueDate ? esc(doc.issueDate) : '—'}</strong></div>
      <div class="detail-row"><span>Expiry</span><strong>${doc.expiryDate ? esc(doc.expiryDate) : 'No expiry'}</strong></div>
      <div class="detail-row"><span>File</span><strong>${esc(doc.fileName || 'No file attached')}</strong></div>
      ${doc.notes ? `<div class="detail-row"><span>Notes</span><span>${esc(doc.notes)}</span></div>` : ''}</div>
      <div class="modal-actions">${fileButton}${editButton}<button type="button" class="btn" id="closeDocDetailBtn">Close</button></div>`);
    document.getElementById('closeDocDetailBtn')?.addEventListener('click', closeModal);
    document.getElementById('editDocBtn')?.addEventListener('click', () => { closeModal(); openDocumentForm(doc); });
    document.getElementById('viewDocFileBtn')?.addEventListener('click', async () => {
      try { await openDocumentFile(doc.filePath); } catch (e) { alert(e.message || e); }
    });
  }
}

function openDocumentForm(existing) {
  const isEdit = !!existing;
  const old = existing || { id: docUid(), reminders: [], notifiedThresholds: [] };
  let selectedReminder = null;
  const first = Number(old.reminders?.[0]);
  if ([30,7,1].includes(first) || (Number.isInteger(first) && first > 0 && first <= 365)) selectedReminder = first;
  const noExpiry = !old.expiryDate;

  openModal(`<div class="modal-title">${isEdit ? 'Edit document' : 'Add document'}</div><form id="docForm">
    <div class="field"><label>Document name</label><input type="text" name="name" required value="${esc(old.name || '')}" placeholder="e.g. Car insurance"></div>
    <div class="field"><label>Category</label><select name="category">${DOC_CATEGORIES.map(c => `<option ${old.category===c?'selected':''}>${esc(c)}</option>`).join('')}</select></div>
    <div class="field"><label>Issue date</label><input type="date" name="issueDate" value="${esc(old.issueDate || '')}"></div>
    <div class="field"><label>Expiry date</label><input type="date" name="expiryDate" value="${esc(old.expiryDate || '')}" ${noExpiry?'disabled':''}></div>
    <div class="field"><label style="display:flex;align-items:center;gap:10px;text-transform:none;font-size:16px;"><input type="checkbox" id="noExpiry" ${noExpiry?'checked':''} style="width:auto;"><span>No expiry</span></label></div>
    <div class="field"><label>Remind me before expiry</label><div class="chip-row" id="docReminderChips">${[30,7,1].map(n => `<button type="button" class="chip-toggle ${selectedReminder===n?'on':''}" data-val="${n}" aria-pressed="${selectedReminder===n}">${n} day${n>1?'s':''}</button>`).join('')}<button type="button" class="chip-toggle ${selectedReminder && ![30,7,1].includes(selectedReminder)?'on':''}" id="docCustomBtn">Custom</button></div>
      <div id="docCustomField" style="${selectedReminder && ![30,7,1].includes(selectedReminder) && !noExpiry?'':'display:none;'}margin-top:12px;"><label style="display:block;margin-bottom:8px;text-transform:none;">Custom reminder (days before expiry)</label><input type="number" id="docCustomDays" min="1" max="365" step="1" value="${selectedReminder && ![30,7,1].includes(selectedReminder)?selectedReminder:''}" placeholder="e.g. 15"></div></div>
    <div class="field"><label>Notes</label><textarea name="notes" placeholder="Optional notes">${esc(old.notes || '')}</textarea></div>
    <div class="field"><label>Photo / PDF</label><div class="filepick"><span class="filepick-name" id="fileName">${esc(old.fileName || 'No file attached')}</span><button type="button" class="filepick-btn" id="filePickBtn">Choose</button><input type="file" id="fileInput" accept="image/*,application/pdf"></div></div>
    <div class="modal-actions">${isEdit?'<button type="button" class="btn danger" id="deleteBtn">Delete Entry</button>':''}<button type="button" class="btn" id="cancelBtn">Cancel</button><button type="submit" class="btn primary" id="saveDocBtn">Save</button></div>
  </form>`);

  let selectedFile = null;
  const chips = [...document.querySelectorAll('#docReminderChips .chip-toggle[data-val]')];
  const customBtn = document.getElementById('docCustomBtn');
  const customField = document.getElementById('docCustomField');
  const customInput = document.getElementById('docCustomDays');
  const noExpiryBox = document.getElementById('noExpiry');
  const expiryInput = document.querySelector('#docForm input[name="expiryDate"]');
  const clearReminder = () => { chips.forEach(c => { c.classList.remove('on'); c.setAttribute('aria-pressed','false'); }); customBtn.classList.remove('on'); customBtn.setAttribute('aria-pressed','false'); customField.style.display='none'; customInput.value=''; };
  const selectPreset = n => { clearReminder(); const c=chips.find(x=>Number(x.dataset.val)===n); if(c){c.classList.add('on');c.setAttribute('aria-pressed','true');} };
  const selectCustom = () => { clearReminder(); customBtn.classList.add('on'); customBtn.setAttribute('aria-pressed','true'); customField.style.display=''; customInput.focus(); };
  chips.forEach(c => c.addEventListener('click', () => { if(!noExpiryBox.checked) selectPreset(Number(c.dataset.val)); }));
  customBtn.addEventListener('click', () => { if(!noExpiryBox.checked) customBtn.classList.contains('on') ? clearReminder() : selectCustom(); });
  noExpiryBox.addEventListener('change', () => { expiryInput.disabled=noExpiryBox.checked; if(noExpiryBox.checked){expiryInput.value='';clearReminder();} chips.forEach(c=>c.disabled=noExpiryBox.checked);customBtn.disabled=noExpiryBox.checked;customInput.disabled=noExpiryBox.checked; });
  noExpiryBox.dispatchEvent(new Event('change'));
  document.getElementById('filePickBtn').addEventListener('click', () => document.getElementById('fileInput').click());
  document.getElementById('fileInput').addEventListener('change', e => { const f=e.target.files[0]; if(!f)return; if(f.size>6*1024*1024){alert('Maximum file size is 6 MB.');e.target.value='';return;} selectedFile=f;document.getElementById('fileName').textContent=f.name; });
  document.getElementById('cancelBtn').addEventListener('click', closeModal);

  if(isEdit) document.getElementById('deleteBtn').addEventListener('click', async () => {
    if(!confirm('Delete this document entry?')) return;
    try { await deleteCloudDocument(old); closeModal(); await renderDocuments(); } catch(e){console.error(e);alert(`Could not delete document: ${e.message||e}`);}
  });

  document.getElementById('docForm').addEventListener('submit', async e => {
    e.preventDefault();
    const btn=document.getElementById('saveDocBtn'); btn.disabled=true; btn.textContent='Saving...';
    const fd=new FormData(e.target); const issueDate=String(fd.get('issueDate')||''); const expiryDate=noExpiryBox.checked?null:String(fd.get('expiryDate')||'');
    if(issueDate&&expiryDate&&issueDate>expiryDate){btn.disabled=false;btn.textContent='Save';alert('Expiry date must be after the issue date.');return;}
    let reminder=null; if(!noExpiryBox.checked){const selected=chips.find(c=>c.classList.contains('on'));if(selected)reminder=Number(selected.dataset.val);else if(customBtn.classList.contains('on')){const n=Number(customInput.value);if(!Number.isInteger(n)||n<1||n>365){btn.disabled=false;btn.textContent='Save';alert('Please enter a custom reminder between 1 and 365 days.');return;}reminder=n;}}
    const user=await getUser(); const id=old.id||docUid(); let newPath=null;
    const record={...old,id,name:String(fd.get('name')||'').trim(),category:fd.get('category'),issueDate:issueDate||null,expiryDate,notes:String(fd.get('notes')||'').trim(),reminders:reminder===null?[]:[reminder],notifiedThresholds:isEdit&&old.expiryDate===expiryDate?(old.notifiedThresholds||[]):[],filePath:old.filePath||null,fileName:old.fileName||null,fileType:old.fileType||null,fileSize:old.fileSize||null};
    if(!record.name){btn.disabled=false;btn.textContent='Save';alert('Please enter a document name.');return;}
    try {
      if(selectedFile){ newPath=await uploadDocumentFile(selectedFile,user.id,id); record.filePath=newPath;record.fileName=selectedFile.name;record.fileType=selectedFile.type||'application/octet-stream';record.fileSize=selectedFile.size; }
      const client=getClient(); const payload=toDb(record,user.id); if(!isEdit) payload.created_at=new Date().toISOString();
      const {error}=await client.from('documents').upsert(payload,{onConflict:'id'}); if(error)throw error;
      if(selectedFile&&old.filePath&&old.filePath!==newPath) await removeDocumentFile(old.filePath);
      closeModal(); await renderDocuments();
    } catch(err) {
      if(newPath) await removeDocumentFile(newPath);
      console.error(err);alert(`Could not save document: ${err.message||err}`);btn.disabled=false;btn.textContent='Save';
    }
  });
}

async function deleteCloudDocument(doc) {
  const client=getClient(); const user=await getUser();
  const {error}=await client.from('documents').delete().eq('id',doc.id).eq('user_id',user.id);
  if(error)throw error;
  if(doc.filePath) await removeDocumentFile(doc.filePath);
}

function initPage(){
  renderDocuments();
  const fab=document.getElementById('fab');
  if(fab&&!fab.dataset.bound){fab.dataset.bound='1';fab.addEventListener('click',()=>openDocumentForm(null));}
  const id=sessionStorage.getItem('pm_edit_id'), kind=sessionStorage.getItem('pm_edit_kind');
  if(id&&kind==='document'){sessionStorage.removeItem('pm_edit_id');sessionStorage.removeItem('pm_edit_kind');getDocuments().then(items=>{const item=items.find(x=>x.id===id);if(item)openDocumentForm(item);});}
}

document.addEventListener('DOMContentLoaded', initPage);
