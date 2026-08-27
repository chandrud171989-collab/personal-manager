const viewEl = document.getElementById('view');
const DOC_CATEGORIES = ['Àadhar','PAN','ID /Driving License','Passport','Voter ID','Warranty','Vehicle RC','Subscription','Property','Education Certificate','Other'];
async function renderDocuments() {
  const docs = (await dbGetAll('documents')).map(d => ({...d, _days: daysUntil(d.expiryDate)}))
    .sort((a,b) => (a._days ?? 9999) - (b._days ?? 9999));
  viewEl.innerHTML = `
    <div class="section" style="margin-top:8px;">
      <div class="section-head"><span class="section-title">All documents</span><span class="section-count">${docs.length}</span></div>
      ${docs.length ? docs.map(d => cardHTML({...d, _kind:'document'})).join('') : emptyHTML('No documents yet. Tap + to add one.')}
    </div>
  `;
  bindCardClicks();
}

async function renderMaintenance(generation) {
  const items = (await dbGetAll('maintenance')).map(m => ({...m, _days: daysUntil(m.nextServiceDate)}))
    .sort((a,b) => (a._days ?? 9999) - (b._days ?? 9999));

  if (!renderIsCurrent(generation, 'maintenance')) return;

  viewEl.innerHTML = `
    <div class="section" style="margin-top:8px;">
      <div class="section-head"><span class="section-title">Home items</span><span class="section-count">${items.length}</span></div>
      ${items.length ? items.map(m => cardHTML({...m, _kind:'maintenance'})).join('') : emptyHTML('No items yet. Tap + to add one.')}
    </div>

    ${maintenanceExpenseSummaryHTML()}
  `;

  bindCardClicks();
  document.getElementById('viewExpenseBtn')?.addEventListener('click', renderMaintenanceExpenseSummary);
  document.getElementById('expenseFromDate')?.addEventListener('change', renderMaintenanceExpenseSummary);
  document.getElementById('expenseToDate')?.addEventListener('change', renderMaintenanceExpenseSummary);

  // Show the summary immediately using the existing maintenance costs.
  if (renderIsCurrent(generation, 'maintenance')) {
    await renderMaintenanceExpenseSummary();
  }
}
function openDocumentForm(existing) {
  const isEdit = !!existing;
  const old = existing || { id: uid(), reminders: [], notifiedThresholds: [] };

  // Existing records that accidentally contain multiple reminders are normalized
  // to one reminder for display. New documents have no reminder selected.
  let selectedReminder = null;
  if (Array.isArray(old.reminders) && old.reminders.length) {
    const first = Number(old.reminders[0]);
    if ([30, 7, 1].includes(first) || (Number.isInteger(first) && first > 0 && first <= 365)) {
      selectedReminder = first;
    }
  }

  const noExpiry = !old.expiryDate;

  openModal(`
    <div class="modal-title">${isEdit ? 'Edit document' : 'Add document'}</div>
    <form id="docForm">
      <div class="field"><label>Document name</label>
        <input type="text" name="name" required value="${escapeHTML(old.name||'')}" placeholder="e.g. Car insurance">
      </div>
      <div class="field"><label>Category</label>
        <select name="category">
          ${DOC_CATEGORIES.map(c => `<option ${old.category===c?'selected':''}>${escapeHTML(c)}</option>`).join('')}
        </select>
      </div>
      <div class="field"><label>Issue date</label>
        <input type="date" name="issueDate" value="${old.issueDate||''}">
      </div>
      <div class="field"><label>Expiry date</label>
        <input type="date" name="expiryDate" value="${old.expiryDate||''}" ${noExpiry?'disabled':''}>
      </div>
      <div class="field">
        <label style="display:flex;align-items:center;gap:10px;text-transform:none;font-size:16px;">
          <input type="checkbox" id="noExpiry" name="noExpiry" ${noExpiry?'checked':''} style="width:auto;">
          <span>No expiry</span>
        </label>
      </div>
      <div class="field"><label>Remind me before expiry</label>
        <div class="chip-row" id="docReminderChips">
          ${[30,7,1].map(n => `<button type="button" class="chip-toggle ${selectedReminder===n?'on':''}" data-val="${n}" aria-pressed="${selectedReminder===n}">${n} day${n>1?'s':''}</button>`).join('')}
          <button type="button" class="chip-toggle ${selectedReminder && ![30,7,1].includes(selectedReminder)?'on':''}" id="docCustomBtn" aria-pressed="${selectedReminder && ![30,7,1].includes(selectedReminder)?'true':'false'}">Custom</button>
        </div>
        <div id="docCustomField" style="${selectedReminder && ![30,7,1].includes(selectedReminder) && !noExpiry?'':'display:none;'}margin-top:12px;">
          <label for="docCustomDays" style="display:block;margin-bottom:8px;text-transform:none;">Custom reminder (days before expiry)</label>
          <input type="number" id="docCustomDays" min="1" max="365" step="1" value="${selectedReminder && ![30,7,1].includes(selectedReminder)?selectedReminder:''}" placeholder="e.g. 15">
        </div>
      </div>
      <div class="field"><label>Notes</label>
        <textarea name="notes" placeholder="Optional notes">${escapeHTML(old.notes||'')}</textarea>
      </div>
      <div class="field"><label>Photo / PDF</label>
        <div class="filepick">
          <span class="filepick-name" id="fileName">${escapeHTML(old.fileName || 'No file attached')}</span>
          <button type="button" class="filepick-btn" id="filePickBtn">Choose</button>
          <input type="file" id="fileInput" accept="image/*,application/pdf">
        </div>
      </div>
      <div class="modal-actions">
        ${isEdit ? '<button type="button" class="btn danger" id="deleteBtn">Delete Entry</button>' : ''}
        <button type="button" class="btn" id="cancelBtn">Cancel</button>
        <button type="submit" class="btn primary">Save</button>
      </div>
    </form>
  `);

  let fileData = old.fileBlob ? { blob: old.fileBlob, name: old.fileName, type: old.fileType } : null;
  const chips = Array.from(document.querySelectorAll('#docReminderChips .chip-toggle[data-val]'));
  const customBtn = document.getElementById('docCustomBtn');
  const customField = document.getElementById('docCustomField');
  const customInput = document.getElementById('docCustomDays');
  const noExpiryBox = document.getElementById('noExpiry');
  const expiryInput = document.querySelector('#docForm input[name="expiryDate"]');

  function clearReminder() {
    chips.forEach(c => { c.classList.remove('on'); c.setAttribute('aria-pressed','false'); });
    customBtn.classList.remove('on');
    customBtn.setAttribute('aria-pressed','false');
    customField.style.display = 'none';
    customInput.value = '';
  }

  function selectPreset(value) {
    clearReminder();
    const chip = chips.find(c => Number(c.dataset.val) === value);
    if (chip) { chip.classList.add('on'); chip.setAttribute('aria-pressed','true'); }
  }

  function selectCustom() {
    clearReminder();
    customBtn.classList.add('on');
    customBtn.setAttribute('aria-pressed','true');
    customField.style.display = '';
    customInput.focus();
  }

  chips.forEach(chip => chip.addEventListener('click', () => {
    if (noExpiryBox.checked) return;
    selectPreset(Number(chip.dataset.val));
  }));

  customBtn.addEventListener('click', () => {
    if (noExpiryBox.checked) return;
    if (customBtn.classList.contains('on')) clearReminder();
    else selectCustom();
  });

  noExpiryBox.addEventListener('change', () => {
    if (noExpiryBox.checked) {
      expiryInput.value = '';
      expiryInput.disabled = true;
      clearReminder();
      chips.forEach(c => c.disabled = true);
      customBtn.disabled = true;
      customInput.disabled = true;
    } else {
      expiryInput.disabled = false;
      chips.forEach(c => c.disabled = false);
      customBtn.disabled = false;
      customInput.disabled = false;
    }
  });

  // Ensure the initial disabled state is correct.
  noExpiryBox.dispatchEvent(new Event('change'));

  document.getElementById('filePickBtn').addEventListener('click', () => document.getElementById('fileInput').click());
  document.getElementById('fileInput').addEventListener('change', e => {
    const f = e.target.files[0];
    if (f) {
      if (f.size > 6 * 1024 * 1024) { alert('Maximum file size is 6 MB.'); e.target.value=''; return; }
      fileData = { blob: f, name: f.name, type: f.type };
      document.getElementById('fileName').textContent = f.name;
    }
  });

  document.getElementById('cancelBtn').addEventListener('click', closeModal);

  if (isEdit) {
    document.getElementById('deleteBtn').addEventListener('click', async () => {
      if (!confirm('Delete this document entry?')) return;
      try { await dbDelete('documents', old.id); closeModal(); await renderDocuments(); }
      catch (err) { alert(`Could not delete document: ${err.message || err}`); }
    });
  }

  document.getElementById('docForm').addEventListener('submit', async e => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const issueDate = String(fd.get('issueDate') || '');
    const expiryDate = noExpiryBox.checked ? null : String(fd.get('expiryDate') || '');

    if (issueDate && expiryDate && issueDate > expiryDate) {
      alert('Expiry date must be after the issue date.'); return;
    }

    let reminder = null;
    if (!noExpiryBox.checked) {
      const selected = chips.find(c => c.classList.contains('on'));
      if (selected) reminder = Number(selected.dataset.val);
      else if (customBtn.classList.contains('on')) {
        const n = Number(customInput.value);
        if (!Number.isInteger(n) || n < 1 || n > 365) {
          alert('Please enter a custom reminder between 1 and 365 days.'); return;
        }
        reminder = n;
      }
    }

    const record = {
      ...old,
      id: old.id,
      name: String(fd.get('name') || '').trim(),
      category: fd.get('category'),
      issueDate: issueDate || null,
      expiryDate,
      notes: String(fd.get('notes') || '').trim(),
      reminders: reminder === null ? [] : [reminder],
      notifiedThresholds: isEdit && old.expiryDate === expiryDate ? (old.notifiedThresholds || []) : [],
      fileBlob: fileData ? fileData.blob : old.fileBlob || null,
      fileName: fileData ? fileData.name : old.fileName || null,
      fileType: fileData ? fileData.type : old.fileType || null
    };

    if (!record.name) { alert('Please enter a document name.'); return; }

    try { await dbPut('documents', record); closeModal(); await renderDocuments(); }
    catch (err) { console.error(err); alert(`Could not save document: ${err.message || err}`); }
  });
}


function render(){ return renderDocuments(); }
async function initPage(){ await renderDocuments(); const id=sessionStorage.getItem('pm_edit_id'); const kind=sessionStorage.getItem('pm_edit_kind'); if(id&&kind==='document'){sessionStorage.removeItem('pm_edit_id');sessionStorage.removeItem('pm_edit_kind');const item=(await dbGetAll('documents')).find(x=>x.id===id);if(item)openDocumentForm(item);}}
