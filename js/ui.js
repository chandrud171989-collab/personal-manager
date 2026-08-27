function emptyHTML(msg) {
  return `<div class="empty">${msg}</div>`;
}

function cardHTML(item) {
  const cls = statusClass(item._days);
  const chip = daysLabel(item._days);
  const title = item._kind === 'document' ? item.name : item.itemName;
  const sub = item._kind === 'document'
    ? `${item.category} · ${item.expiryDate ? `expires ${fmtDate(item.expiryDate)}` : 'No expiry'}`
    : `${item.type} · next service ${fmtDate(item.nextServiceDate)}`;
  return `
    <div class="card status-${cls}" data-kind="${item._kind}" data-id="${item.id}">
      <div class="card-body">
        <div class="card-title">${escapeHTML(title)}</div>
        <div class="card-sub">${escapeHTML(sub)}</div>
      </div>
      <div class="card-chip chip-${cls}">${chip}</div>
    </div>
  `;
}

function bindCardClicks() {
  viewEl.querySelectorAll('.card').forEach(card => {
    card.addEventListener('click', async () => {
      const { kind, id } = card.dataset;
      const store = kind === 'document' ? 'documents' : 'maintenance';
      const all = await dbGetAll(store);
      const item = all.find(x => x.id === id);
      if (item) openDetail(kind, item);
    });
  });
}


function openDetail(kind, item) {
  const days = daysUntil(kind === 'document' ? item.expiryDate : item.nextServiceDate);
  const cls = statusClass(days);
  let photoTag = '';
  if (kind === 'document' && item.fileBlob) {
    const url = URL.createObjectURL(item.fileBlob);
    if ((item.fileType||'').startsWith('image/')) {
      photoTag = `<img class="detail-photo" src="${url}">`;
    } else {
      photoTag = `<a class="detail-row" href="${url}" target="_blank" style="color:var(--teal)">Open attached file (${escapeHTML(item.fileName||'file')})</a>`;
    }
  }
  const rows = kind === 'document' ? `
    <div class="detail-row"><span class="k">Category</span><span>${escapeHTML(item.category)}</span></div>
    <div class="detail-row"><span class="k">Issue date</span><span>${fmtDate(item.issueDate)}</span></div>
    <div class="detail-row"><span class="k">Expiry date</span><span>${item.expiryDate ? fmtDate(item.expiryDate) : 'No expiry'}</span></div>
    <div class="detail-row"><span class="k">Status</span><span class="card-chip chip-${cls}">${daysLabel(days)}</span></div>
    <div class="detail-row"><span class="k">Reminders</span><span>${(item.reminders||[]).join(', ') || 'None'} days before</span></div>
    ${item.notes ? `<div class="detail-row"><span class="k">Notes</span><span style="text-align:right;max-width:65%">${escapeHTML(item.notes)}</span></div>` : ''}
  ` : `
    <div class="detail-row"><span class="k">Type</span><span>${escapeHTML(item.type)}</span></div>
    <div class="detail-row"><span class="k">Last service</span><span>${fmtDate(item.lastServiceDate)}</span></div>
    <div class="detail-row"><span class="k">Next service</span><span>${fmtDate(item.nextServiceDate)}</span></div>
    <div class="detail-row"><span class="k">Status</span><span class="card-chip chip-${cls}">${daysLabel(days)}</span></div>
    ${item.cost ? `<div class="detail-row"><span class="k">Cost</span><span>₹${item.cost}</span></div>` : ''}
    <div class="detail-row"><span class="k">Reminders</span><span>${(item.reminders||[]).join(', ') || 'None'} days before</span></div>
    ${item.notes ? `<div class="detail-row"><span class="k">Notes</span><span style="text-align:right;max-width:65%">${escapeHTML(item.notes)}</span></div>` : ''}
  `;

  openModal(`
    <div class="modal-title">${escapeHTML(kind === 'document' ? item.name : item.itemName)}</div>
    ${rows}
    ${photoTag}
    <div class="modal-actions">
      <button type="button" class="btn" id="closeDetailBtn">Close</button>
      <button type="button" class="btn primary" id="editBtn">Edit</button>
    </div>
  `);
  document.getElementById('closeDetailBtn').addEventListener('click', closeModal);
  document.getElementById('editBtn').addEventListener('click', () => {
    closeModal();
    sessionStorage.setItem('pm_edit_kind', kind);
    sessionStorage.setItem('pm_edit_id', item.id);
    window.location.href = kind === 'document' ? 'documents.html' : 'maintenance.html';
  });
}