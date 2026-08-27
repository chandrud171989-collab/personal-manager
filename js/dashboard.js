const viewEl = document.getElementById('view');
async function renderDashboard(){
  const [docs,maint]=await Promise.all([dbGetAll('documents'),dbGetAll('maintenance')]);
  const docItems=docs.map(d=>({...d,_days:daysUntil(d.expiryDate),_kind:'document'}));
  const maintItems=maint.map(m=>({...m,_days:daysUntil(m.nextServiceDate),_kind:'maintenance'}));
  const overdueOrSoonDocs=docItems.filter(d=>d._days!==null&&d._days<=30).sort((a,b)=>a._days-b._days);
  const dueMaint=maintItems.filter(m=>m._days!==null&&m._days<=30).sort((a,b)=>a._days-b._days);
  const upcoming=[...docItems,...maintItems].filter(x=>x._days!==null).sort((a,b)=>a._days-b._days).slice(0,8);
  const overdueCount=[...docItems,...maintItems].filter(x=>x._days!==null&&x._days<0).length;
  const soonCount=[...docItems,...maintItems].filter(x=>x._days!==null&&x._days>=0&&x._days<=7).length;
  viewEl.innerHTML=`<div class="stats"><div class="stat-card red"><div class="stat-num">${overdueCount}</div><div class="stat-label">Overdue</div></div><div class="stat-card amber"><div class="stat-num">${soonCount}</div><div class="stat-label">Due in 7 days</div></div><div class="stat-card teal"><div class="stat-num">${docs.length+maint.length}</div><div class="stat-label">Total tracked</div></div></div>
  <div class="section"><div class="section-head"><span class="section-title">Upcoming reminders</span><span class="section-count">${upcoming.length}</span></div>${upcoming.length?upcoming.map(cardHTML).join(''):emptyHTML('Nothing due in the next month.')}</div>
  <div class="section"><div class="section-head"><span class="section-title">Expiring documents</span><span class="section-count">${overdueOrSoonDocs.length}</span></div>${overdueOrSoonDocs.length?overdueOrSoonDocs.map(cardHTML).join(''):emptyHTML('No documents expiring soon.')}</div>
  <div class="section"><div class="section-head"><span class="section-title">Maintenance due</span><span class="section-count">${dueMaint.length}</span></div>${dueMaint.length?dueMaint.map(cardHTML).join(''):emptyHTML('Nothing needs servicing soon.')}</div>`;
  bindCardClicks();
}
function openDetail(kind,item){
  const days=daysUntil(kind==='document'?item.expiryDate:item.nextServiceDate), cls=statusClass(days); let photoTag='';
  if(kind==='document'&&item.fileBlob){const url=URL.createObjectURL(item.fileBlob); photoTag=item.fileType?.startsWith('image/')?`<img class="detail-photo" src="${url}">`:`<a class="detail-row" href="${url}" target="_blank" style="color:var(--teal)">Open attached file (${escapeHTML(item.fileName||'file')})</a>`;}
  const rows=kind==='document'?`<div class="detail-row"><span class="k">Category</span><span>${escapeHTML(item.category)}</span></div><div class="detail-row"><span class="k">Issue date</span><span>${fmtDate(item.issueDate)}</span></div><div class="detail-row"><span class="k">Expiry date</span><span>${item.expiryDate?fmtDate(item.expiryDate):'No expiry'}</span></div><div class="detail-row"><span class="k">Status</span><span class="card-chip chip-${cls}">${daysLabel(days)}</span></div><div class="detail-row"><span class="k">Reminders</span><span>${(item.reminders||[]).join(', ')||'None'} days before</span></div>${item.notes?`<div class="detail-row"><span class="k">Notes</span><span>${escapeHTML(item.notes)}</span></div>`:''}`:`<div class="detail-row"><span class="k">Type</span><span>${escapeHTML(item.type)}</span></div><div class="detail-row"><span class="k">Last service</span><span>${fmtDate(item.lastServiceDate)}</span></div><div class="detail-row"><span class="k">Next service</span><span>${fmtDate(item.nextServiceDate)}</span></div><div class="detail-row"><span class="k">Status</span><span class="card-chip chip-${cls}">${daysLabel(days)}</span></div>${item.cost?`<div class="detail-row"><span class="k">Cost</span><span>₹${item.cost}</span></div>`:''}<div class="detail-row"><span class="k">Reminders</span><span>${(item.reminders||[]).join(', ')||'None'} days before</span></div>${item.notes?`<div class="detail-row"><span class="k">Notes</span><span>${escapeHTML(item.notes)}</span></div>`:''}`;
  openModal(`<div class="modal-title">${escapeHTML(kind==='document'?item.name:item.itemName)}</div>${rows}${photoTag}<div class="modal-actions"><button type="button" class="btn" id="closeDetailBtn">Close</button><button type="button" class="btn primary" id="editBtn">Edit</button></div>`);
  document.getElementById('closeDetailBtn').onclick=closeModal;
  document.getElementById('editBtn').onclick=()=>{closeModal(); if(kind==='document')openDocumentForm(item);else openMaintenanceForm(item);};
}
function initPage(){ renderDashboard(); }
