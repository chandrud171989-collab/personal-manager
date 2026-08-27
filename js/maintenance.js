const viewEl = document.getElementById('view');
const MAINT_TYPES = ['AC','RO / Water Purifier','Refrigerator','Washing Machine','Geyser','Vehicle Service','Home Cleaning','Pest Control','Electrical/Plumbing','Other'];
async function renderMaintenance() {
  const items = (await dbGetAll('maintenance')).map(m => ({...m, _days: daysUntil(m.nextServiceDate)}))
    .sort((a,b) => (a._days ?? 9999) - (b._days ?? 9999));

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
  await renderMaintenanceExpenseSummary();
}
/* ---------------- Maintenance Expense Summary ---------------- */

/*
 * Expense data is stored in public.maintenance_expenses.
 * The existing maintenance table remains unchanged.
 *
 * Expected columns:
 * id, user_id, maintenance_id, item_name, service_date,
 * amount, notes, created_at, updated_at
 */

async function getExpenseUserId() {
  if (!window.supabaseClient || !window.supabaseClient.auth) return null;
  const { data, error } = await window.supabaseClient.auth.getUser();
  if (error) {
    console.warn('Unable to get Supabase user:', error);
    return null;
  }
  return data?.user?.id || null;
}

async function getMaintenanceExpenses(fromDate = '', toDate = '') {
  if (!window.supabaseClient) {
    throw new Error('Expense storage is not configured.');
  }

  let query = window.supabaseClient
    .from('maintenance_expenses')
    .select('id,maintenance_id,item_name,service_date,amount,notes,created_at')
    .order('service_date', { ascending: false });

  if (fromDate) query = query.gte('service_date', fromDate);
  if (toDate) query = query.lte('service_date', toDate);

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

async function saveMaintenanceExpense(maintenance) {
  if (!window.supabaseClient) return;

  const userId = await getExpenseUserId();
  if (!userId) return;

  const amount = Number(maintenance.cost);
  if (!Number.isFinite(amount) || amount <= 0) return;

  const serviceDate =
    maintenance.lastServiceDate ||
    new Date().toISOString().slice(0, 10);

  const payload = {
    user_id: userId,
    maintenance_id: maintenance.id,
    item_name: maintenance.itemName || maintenance.type || 'Other item',
    service_date: serviceDate,
    amount,
    notes: maintenance.notes || null,
    updated_at: new Date().toISOString()
  };

  const { error } = await window.supabaseClient
    .from('maintenance_expenses')
    .upsert(payload, {
      onConflict: 'maintenance_id,service_date'
    });

  if (error) throw error;
}

function formatExpenseAmount(value) {
  return Number(value || 0).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

function expenseCell(value) {
  const text = String(value ?? '');
  return `"${text.replace(/"/g, '""')}"`;
}

/*
 * Creates an Excel-compatible .xls workbook using an HTML table.
 * It opens directly in Microsoft Excel without adding another library.
 */
function downloadMaintenanceExpensesXLS(rows, byItem, total, fromDate, toDate) {
  const summaryRows = Object.entries(byItem)
    .sort((a, b) => b[1] - a[1])
    .map(([item, amount]) => `
      <tr>
        <td>${escapeHTML(item)}</td>
        <td>${Number(amount).toFixed(2)}</td>
      </tr>
    `).join('');

  const detailRows = rows.map(row => `
    <tr>
      <td>${escapeHTML(row.service_date || '')}</td>
      <td>${escapeHTML(row.item_name || 'Other item')}</td>
      <td>${Number(row.amount || 0).toFixed(2)}</td>
      <td>${escapeHTML(row.notes || '')}</td>
    </tr>
  `).join('');

  const html = `
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
body { font-family: Arial, sans-serif; }
h1 { font-size: 18px; }
h2 { font-size: 15px; margin-top: 24px; }
table { border-collapse: collapse; margin-bottom: 18px; }
th, td { border: 1px solid #999; padding: 7px 10px; }
th { font-weight: bold; }
.total { font-weight: bold; }
</style>
</head>
<body>
<h1>Personal Manager - Maintenance Expenses</h1>
<p>Period: ${escapeHTML(fromDate || 'All')} to ${escapeHTML(toDate || 'All')}</p>

<h2>Expense Summary</h2>
<table>
<tr><th>Item</th><th>Total (₹)</th></tr>
${summaryRows}
<tr class="total"><td>Grand Total</td><td>${Number(total).toFixed(2)}</td></tr>
</table>

<h2>Expense Details</h2>
<table>
<tr><th>Date</th><th>Item</th><th>Amount (₹)</th><th>Notes</th></tr>
${detailRows}
</table>
</body>
</html>`;

  const blob = new Blob([html], { type: 'application/vnd.ms-excel' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `maintenance-expenses-${fromDate || 'all'}-to-${toDate || 'all'}.xls`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function renderMaintenanceExpenseSummary() {
  const container = document.getElementById('maintenanceExpenseResults');
  if (!container) return;

  const fromDate = document.getElementById('expenseFromDate')?.value || '';
  const toDate = document.getElementById('expenseToDate')?.value || '';

  if (fromDate && toDate && fromDate > toDate) {
    container.innerHTML = '<div class="empty">From date cannot be after To date.</div>';
    return;
  }

  try {
    // Primary source for this app: the customer's local maintenance records.
    // Cost is treated as an expense on the last-service date.
    const maintenance = await dbGetAll('maintenance');
    let rows = maintenance
      .filter(m => Number.isFinite(Number(m.cost)) && Number(m.cost) > 0 && m.lastServiceDate)
      .map(m => ({
        service_date: m.lastServiceDate,
        item_name: m.itemName || m.type || 'Other item',
        amount: Number(m.cost),
        notes: m.notes || ''
      }));

    // If Supabase has explicit expense rows, prefer those because they can
    // contain multiple expenses for the same maintenance item.
    if (window.supabaseClient) {
      try {
        const userId = await getExpenseUserId();
        if (userId) {
          let q = window.supabaseClient
            .from('maintenance_expenses')
            .select('id,maintenance_id,item_name,service_date,amount,notes,created_at')
            .eq('user_id', userId)
            .order('service_date', { ascending: false });
          if (fromDate) q = q.gte('service_date', fromDate);
          if (toDate) q = q.lte('service_date', toDate);
          const result = await q;
          if (!result.error && Array.isArray(result.data) && result.data.length) {
            rows = result.data.map(r => ({
              service_date: r.service_date,
              item_name: r.item_name || 'Other item',
              amount: Number(r.amount || 0),
              notes: r.notes || ''
            })).filter(r => r.amount > 0);
          }
        }
      } catch (e) {
        console.warn('Using local maintenance costs for expense summary:', e);
      }
    }

    rows = rows.filter(row => {
      if (!row.service_date) return false;
      if (fromDate && row.service_date < fromDate) return false;
      if (toDate && row.service_date > toDate) return false;
      return true;
    }).sort((a,b) => String(b.service_date).localeCompare(String(a.service_date)));

    const total = rows.reduce((sum, row) => sum + Number(row.amount || 0), 0);
    const byItem = {};
    rows.forEach(row => {
      const item = row.item_name || 'Other item';
      byItem[item] = (byItem[item] || 0) + Number(row.amount || 0);
    });

    const itemRows = Object.entries(byItem)
      .sort((a,b) => b[1] - a[1])
      .map(([item, amount]) => `
        <div class="finance-result-row">
          <span>${escapeHTML(item)}</span>
          <strong>₹${formatExpenseAmount(amount)}</strong>
        </div>
      `).join('');

    const detailRows = rows.length ? rows.map(row => `
      <div class="detail-row">
        <span>${fmtDate(row.service_date)} · ${escapeHTML(row.item_name || 'Other item')}</span>
        <strong>₹${formatExpenseAmount(row.amount)}</strong>
      </div>
      ${row.notes ? `<div class="detail-row"><span class="k">Notes</span><span style="text-align:right;max-width:65%">${escapeHTML(row.notes)}</span></div>` : ''}
    `).join('') : '<div class="empty">No expenses found for this period.</div>';

    container.innerHTML = `
      <div style="padding:16px;border:1px solid var(--border);border-radius:14px;background:var(--surface);margin-bottom:14px;">
        <div style="font-size:14px;color:var(--text-dim);margin-bottom:6px;">TOTAL EXPENSES</div>
        <div style="font-size:28px;font-weight:800;color:var(--teal);">₹${formatExpenseAmount(total)}</div>
        <div style="font-size:13px;color:var(--text-dim);margin-top:5px;">${rows.length} expense record${rows.length === 1 ? '' : 's'}</div>
      </div>

      ${itemRows ? `
        <div style="margin-bottom:14px;">
          <div class="section-head"><span class="section-title">Expense by Item</span></div>
          <div class="finance-result">${itemRows}</div>
        </div>` : ''}

      <div>
        <div class="section-head"><span class="section-title">Expense Details</span><span class="section-count">${rows.length}</span></div>
        ${detailRows}
      </div>
    `;

    const downloadBtn = document.getElementById('downloadExpenseBtn');
    if (downloadBtn) {
      downloadBtn.disabled = rows.length === 0;
      downloadBtn.onclick = () => rows.length && downloadMaintenanceExpensesXLS(rows, byItem, total, fromDate, toDate);
    }
  } catch (error) {
    console.error(error);
    container.innerHTML = `<div class="empty">Unable to load expenses. ${escapeHTML(error.message || error)}</div>`;
  }
}

function maintenanceExpenseSummaryHTML() {
  return `
    <div class="section maintenance-expense-summary" style="margin-top:18px;padding-bottom:30px;">
      <div class="section-head">
        <span class="section-title">Maintenance Expense Summary</span>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
        <div class="field">
          <label>From date</label>
          <input type="date" id="expenseFromDate">
        </div>
        <div class="field">
          <label>To date</label>
          <input type="date" id="expenseToDate">
        </div>
      </div>

      <div class="modal-actions" style="margin-top:4px;">
        <button type="button" class="btn primary" id="viewExpenseBtn">View Expenses</button>
        <button type="button" class="btn" id="downloadExpenseBtn" disabled>Download Excel (.xls)</button>
      </div>

      <div id="maintenanceExpenseResults" style="margin-top:16px;">
        <div class="empty">Loading expense summary...</div>
      </div>
    </div>
  `;
}

/* ---------------- Maintenance form ---------------- */
function openMaintenanceForm(existing) {
  const isEdit = !!existing;
  const old = existing || { id: uid(), reminders: [], notifiedThresholds: [] };
  const todayDate = new Date().toISOString().split('T')[0];

  let selectedReminder = null;
  if (Array.isArray(old.reminders) && old.reminders.length) {
    const first = Number(old.reminders[0]);
    if (Number.isInteger(first) && first > 0 && first <= 365) selectedReminder = first;
  }

  openModal(`
    <div class="modal-title">${isEdit ? 'Edit item' : 'Add home item'}</div>
    <form id="maintForm">
      <div class="field"><label>Item</label>
        <select name="type" id="typeSelect">
          ${MAINT_TYPES.map(t => `<option ${old.type===t?'selected':''}>${escapeHTML(t)}</option>`).join('')}
        </select>
      </div>
      <div class="field" id="customNameField" style="${old.type==='Other'?'':'display:none'}">
        <label>Custom name</label>
        <input type="text" name="itemName" value="${escapeHTML(old.type==='Other' ? (old.itemName||'') : '')}" placeholder="e.g. Water heater">
      </div>
      <div class="field"><label>Last service date</label>
        <input type="date" name="lastServiceDate" value="${old.lastServiceDate||''}" max="${todayDate}">
        <small>Today or a past date only.</small>
      </div>
      <div class="field"><label>Service due date</label>
        <input type="date" name="nextServiceDate" required min="${todayDate}" value="${old.nextServiceDate||''}">
        <small>Today or a future date only.</small>
      </div>
      <div class="field"><label>Cost (₹)</label>
        <input type="number" name="cost" min="0" step="0.01" value="${old.cost ?? ''}" placeholder="0">
      </div>
      <div class="field"><label>Remind me before service</label>
        <div class="chip-row" id="maintReminderChips">
          ${[30,7,1].map(n => `<button type="button" class="chip-toggle ${selectedReminder===n?'on':''}" data-val="${n}" aria-pressed="${selectedReminder===n}">${n} day${n>1?'s':''}</button>`).join('')}
          <button type="button" class="chip-toggle ${selectedReminder && ![30,7,1].includes(selectedReminder)?'on':''}" id="maintCustomBtn" aria-pressed="${selectedReminder && ![30,7,1].includes(selectedReminder)?'true':'false'}">Custom</button>
        </div>
        <div id="maintCustomField" style="${selectedReminder && ![30,7,1].includes(selectedReminder)?'':'display:none;'}margin-top:12px;">
          <label for="maintCustomDays" style="display:block;margin-bottom:8px;text-transform:none;">Custom reminder (days before service)</label>
          <input type="number" id="maintCustomDays" min="1" max="365" step="1" value="${selectedReminder && ![30,7,1].includes(selectedReminder)?selectedReminder:''}" placeholder="e.g. 15">
        </div>
      </div>
      <div class="field"><label>Notes</label>
        <textarea name="notes" placeholder="Optional notes">${escapeHTML(old.notes||'')}</textarea>
      </div>
      <div class="modal-actions">
        ${isEdit ? '<button type="button" class="btn danger" id="deleteBtn">Delete Entry</button>' : ''}
        <button type="button" class="btn" id="cancelBtn">Cancel</button>
        <button type="submit" class="btn primary">Save</button>
      </div>
    </form>
  `);

  const chips = Array.from(document.querySelectorAll('#maintReminderChips .chip-toggle[data-val]'));
  const customBtn = document.getElementById('maintCustomBtn');
  const customField = document.getElementById('maintCustomField');
  const customInput = document.getElementById('maintCustomDays');

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
    const value = Number(chip.dataset.val);
    if (chip.classList.contains('on')) clearReminder();
    else selectPreset(value);
  }));

  customBtn.addEventListener('click', () => {
    if (customBtn.classList.contains('on')) clearReminder();
    else selectCustom();
  });

  document.getElementById('typeSelect').addEventListener('change', e => {
    document.getElementById('customNameField').style.display = e.target.value === 'Other' ? '' : 'none';
  });
  document.getElementById('cancelBtn').addEventListener('click', closeModal);

  if (isEdit) {
    document.getElementById('deleteBtn').addEventListener('click', async () => {
      if (!confirm('Delete this maintenance entry?')) return;
      try { await dbDelete('maintenance', old.id); closeModal(); await renderMaintenance(); }
      catch (err) { alert(`Could not delete maintenance item: ${err.message || err}`); }
    });
  }

  document.getElementById('maintForm').addEventListener('submit', async e => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const type = fd.get('type');
    const lastServiceDate = String(fd.get('lastServiceDate') || '');
    const nextServiceDate = String(fd.get('nextServiceDate') || '');
    const costRaw = String(fd.get('cost') || '');

    const today = new Date(); today.setHours(0,0,0,0);
    if (lastServiceDate) {
      const lastDate = new Date(lastServiceDate + 'T00:00:00');
      if (lastDate > today) { alert('Last serviced date cannot be in the future.'); return; }
    }
    if (!nextServiceDate) { alert('Please select a service due date.'); return; }
    const nextDate = new Date(nextServiceDate + 'T00:00:00');
    if (nextDate < today) { alert('Service due date cannot be in the past.'); return; }
    if (lastServiceDate) {
      const lastDate = new Date(lastServiceDate + 'T00:00:00');
      if (nextDate <= lastDate) { alert('Service due date must be after the last serviced date.'); return; }
    }
    if (costRaw !== '' && Number(costRaw) < 0) { alert('Service cost cannot be negative.'); return; }

    let reminder = null;
    const selected = chips.find(c => c.classList.contains('on'));
    if (selected) reminder = Number(selected.dataset.val);
    else if (customBtn.classList.contains('on')) {
      const n = Number(customInput.value);
      if (!Number.isInteger(n) || n < 1 || n > 365) { alert('Please enter a custom reminder between 1 and 365 days.'); return; }
      reminder = n;
    }

    const itemName = type === 'Other'
      ? (String(fd.get('itemName') || '').trim() || 'Other item')
      : type;

    const record = {
      ...old,
      id: old.id,
      type,
      itemName,
      lastServiceDate: lastServiceDate || null,
      nextServiceDate,
      cost: costRaw === '' ? null : Number(costRaw),
      notes: String(fd.get('notes') || '').trim(),
      reminders: reminder === null ? [] : [reminder],
      notifiedThresholds: isEdit && old.nextServiceDate === nextServiceDate ? (old.notifiedThresholds || []) : []
    };

    try {
      await dbPut('maintenance', record);

      // Mirror a positive maintenance cost into Supabase expense history
      // when the authenticated Supabase client is available.
      try {
        if (record.cost && Number(record.cost) > 0) {
          await saveMaintenanceExpense(record);
        }
      } catch (expenseErr) {
        console.error('Expense history save failed:', expenseErr);
        // Maintenance itself is already saved locally, so do not block the user.
      }

      closeModal();
      await renderMaintenance();
    }
    catch (err) {
      console.error(err);
      alert(`Could not save maintenance item: ${err.message || err}`);
    }
  });
}
function openMaintenanceForm(existing) {
  const isEdit = !!existing;
  const old = existing || { id: uid(), reminders: [], notifiedThresholds: [] };
  const todayDate = new Date().toISOString().split('T')[0];

  let selectedReminder = null;
  if (Array.isArray(old.reminders) && old.reminders.length) {
    const first = Number(old.reminders[0]);
    if (Number.isInteger(first) && first > 0 && first <= 365) selectedReminder = first;
  }

  openModal(`
    <div class="modal-title">${isEdit ? 'Edit item' : 'Add home item'}</div>
    <form id="maintForm">
      <div class="field"><label>Item</label>
        <select name="type" id="typeSelect">
          ${MAINT_TYPES.map(t => `<option ${old.type===t?'selected':''}>${escapeHTML(t)}</option>`).join('')}
        </select>
      </div>
      <div class="field" id="customNameField" style="${old.type==='Other'?'':'display:none'}">
        <label>Custom name</label>
        <input type="text" name="itemName" value="${escapeHTML(old.type==='Other' ? (old.itemName||'') : '')}" placeholder="e.g. Water heater">
      </div>
      <div class="field"><label>Last service date</label>
        <input type="date" name="lastServiceDate" value="${old.lastServiceDate||''}" max="${todayDate}">
        <small>Today or a past date only.</small>
      </div>
      <div class="field"><label>Service due date</label>
        <input type="date" name="nextServiceDate" required min="${todayDate}" value="${old.nextServiceDate||''}">
        <small>Today or a future date only.</small>
      </div>
      <div class="field"><label>Cost (₹)</label>
        <input type="number" name="cost" min="0" step="0.01" value="${old.cost ?? ''}" placeholder="0">
      </div>
      <div class="field"><label>Remind me before service</label>
        <div class="chip-row" id="maintReminderChips">
          ${[30,7,1].map(n => `<button type="button" class="chip-toggle ${selectedReminder===n?'on':''}" data-val="${n}" aria-pressed="${selectedReminder===n}">${n} day${n>1?'s':''}</button>`).join('')}
          <button type="button" class="chip-toggle ${selectedReminder && ![30,7,1].includes(selectedReminder)?'on':''}" id="maintCustomBtn" aria-pressed="${selectedReminder && ![30,7,1].includes(selectedReminder)?'true':'false'}">Custom</button>
        </div>
        <div id="maintCustomField" style="${selectedReminder && ![30,7,1].includes(selectedReminder)?'':'display:none;'}margin-top:12px;">
          <label for="maintCustomDays" style="display:block;margin-bottom:8px;text-transform:none;">Custom reminder (days before service)</label>
          <input type="number" id="maintCustomDays" min="1" max="365" step="1" value="${selectedReminder && ![30,7,1].includes(selectedReminder)?selectedReminder:''}" placeholder="e.g. 15">
        </div>
      </div>
      <div class="field"><label>Notes</label>
        <textarea name="notes" placeholder="Optional notes">${escapeHTML(old.notes||'')}</textarea>
      </div>
      <div class="modal-actions">
        ${isEdit ? '<button type="button" class="btn danger" id="deleteBtn">Delete Entry</button>' : ''}
        <button type="button" class="btn" id="cancelBtn">Cancel</button>
        <button type="submit" class="btn primary">Save</button>
      </div>
    </form>
  `);

  const chips = Array.from(document.querySelectorAll('#maintReminderChips .chip-toggle[data-val]'));
  const customBtn = document.getElementById('maintCustomBtn');
  const customField = document.getElementById('maintCustomField');
  const customInput = document.getElementById('maintCustomDays');

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
    const value = Number(chip.dataset.val);
    if (chip.classList.contains('on')) clearReminder();
    else selectPreset(value);
  }));

  customBtn.addEventListener('click', () => {
    if (customBtn.classList.contains('on')) clearReminder();
    else selectCustom();
  });

  document.getElementById('typeSelect').addEventListener('change', e => {
    document.getElementById('customNameField').style.display = e.target.value === 'Other' ? '' : 'none';
  });
  document.getElementById('cancelBtn').addEventListener('click', closeModal);

  if (isEdit) {
    document.getElementById('deleteBtn').addEventListener('click', async () => {
      if (!confirm('Delete this maintenance entry?')) return;
      try { await dbDelete('maintenance', old.id); closeModal(); await renderMaintenance(); }
      catch (err) { alert(`Could not delete maintenance item: ${err.message || err}`); }
    });
  }

  document.getElementById('maintForm').addEventListener('submit', async e => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const type = fd.get('type');
    const lastServiceDate = String(fd.get('lastServiceDate') || '');
    const nextServiceDate = String(fd.get('nextServiceDate') || '');
    const costRaw = String(fd.get('cost') || '');

    const today = new Date(); today.setHours(0,0,0,0);
    if (lastServiceDate) {
      const lastDate = new Date(lastServiceDate + 'T00:00:00');
      if (lastDate > today) { alert('Last serviced date cannot be in the future.'); return; }
    }
    if (!nextServiceDate) { alert('Please select a service due date.'); return; }
    const nextDate = new Date(nextServiceDate + 'T00:00:00');
    if (nextDate < today) { alert('Service due date cannot be in the past.'); return; }
    if (lastServiceDate) {
      const lastDate = new Date(lastServiceDate + 'T00:00:00');
      if (nextDate <= lastDate) { alert('Service due date must be after the last serviced date.'); return; }
    }
    if (costRaw !== '' && Number(costRaw) < 0) { alert('Service cost cannot be negative.'); return; }

    let reminder = null;
    const selected = chips.find(c => c.classList.contains('on'));
    if (selected) reminder = Number(selected.dataset.val);
    else if (customBtn.classList.contains('on')) {
      const n = Number(customInput.value);
      if (!Number.isInteger(n) || n < 1 || n > 365) { alert('Please enter a custom reminder between 1 and 365 days.'); return; }
      reminder = n;
    }

    const itemName = type === 'Other'
      ? (String(fd.get('itemName') || '').trim() || 'Other item')
      : type;

    const record = {
      ...old,
      id: old.id,
      type,
      itemName,
      lastServiceDate: lastServiceDate || null,
      nextServiceDate,
      cost: costRaw === '' ? null : Number(costRaw),
      notes: String(fd.get('notes') || '').trim(),
      reminders: reminder === null ? [] : [reminder],
      notifiedThresholds: isEdit && old.nextServiceDate === nextServiceDate ? (old.notifiedThresholds || []) : []
    };

    try {
      await dbPut('maintenance', record);

      // Mirror a positive maintenance cost into Supabase expense history
      // when the authenticated Supabase client is available.
      try {
        if (record.cost && Number(record.cost) > 0) {
          await saveMaintenanceExpense(record);
        }
      } catch (expenseErr) {
        console.error('Expense history save failed:', expenseErr);
        // Maintenance itself is already saved locally, so do not block the user.
      }

      closeModal();
      await renderMaintenance();
    }
    catch (err) {
      console.error(err);
      alert(`Could not save maintenance item: ${err.message || err}`);
    }
  });
}
function render(){ return renderMaintenance(); }
async function initPage(){
  await renderMaintenance();
  const fab = document.getElementById('fab');
  if (fab && !fab.dataset.bound) {
    fab.dataset.bound = '1';
    fab.addEventListener('click', () => openMaintenanceForm(null));
  }
  const id=sessionStorage.getItem('pm_edit_id'); const kind=sessionStorage.getItem('pm_edit_kind'); if(id&&kind==='maintenance'){sessionStorage.removeItem('pm_edit_id');sessionStorage.removeItem('pm_edit_kind');const item=(await dbGetAll('maintenance')).find(x=>x.id===id);if(item)openMaintenanceForm(item);}
}
