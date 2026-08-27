const viewEl = document.getElementById('view');
/* ---------------- Finance ---------------- */

const FINANCE_CATEGORIES = [
  'Groceries',
  'Electricity',
  'Water',
  'Gas',
  'Internet',
  'Mobile',
  'Rent',
  'Education',
  'Medical',
  'Fuel',
  'Shopping',
  'Food / Dining',
  'Travel',
  'Insurance',
  'EMI / Loan',
  'Home Repair',
  'Family',
  'Other'
];

const FINANCE_PAYMENT_METHODS = [
  'Cash',
  'UPI',
  'Credit Card',
  'Debit Card',
  'Bank Transfer',
  'Other'
];

function financeDateInputValue(d = new Date()) {
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000)
    .toISOString().slice(0,10);
}

function financeMonthStart() {
  const d = new Date();
  d.setDate(1);
  return financeDateInputValue(d);
}

function financeMonthEnd() {
  const d = new Date();
  d.setMonth(d.getMonth() + 1, 0);
  return financeDateInputValue(d);
}

function formatFinanceMoney(value) {
  return Math.round(Number(value) || 0).toLocaleString('en-IN');
}

function financeRowAmount(row) {
  return Number(row.amount) || 0;
}

async function getFinanceHomeExpenses() {
  return dbGetAll('financeExpenses');
}

async function getFinanceMaintenanceRows(fromDate = '', toDate = '') {
  let rows = [];

  // Use explicit Supabase maintenance expense history when available.
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
            id: r.id,
            source: 'maintenance',
            date: r.service_date,
            category: 'Maintenance',
            item: r.item_name || 'Other item',
            amount: Number(r.amount) || 0,
            notes: r.notes || ''
          })).filter(r => r.amount > 0);
        }
      }
    } catch (e) {
      console.warn('Finance: Supabase maintenance history unavailable; using local maintenance.', e);
    }
  }

  // Fallback to the existing local maintenance records.
  if (!rows.length) {
    const maintenance = await dbGetAll('maintenance');
    rows = maintenance
      .filter(m => Number(m.cost) > 0 && m.lastServiceDate)
      .map(m => ({
        id: `maint-${m.id}-${m.lastServiceDate}`,
        source: 'maintenance',
        date: m.lastServiceDate,
        category: 'Maintenance',
        item: m.itemName || m.type || 'Other item',
        amount: Number(m.cost) || 0,
        notes: m.notes || ''
      }));
  }

  return rows.filter(r => {
    if (fromDate && r.date < fromDate) return false;
    if (toDate && r.date > toDate) return false;
    return true;
  });
}

function openFinanceExpenseForm(existing = null) {
  const isEdit = !!existing;
  const old = existing || {
    id: uid(),
    date: financeDateInputValue(),
    category: 'Groceries',
    customCategory: '',
    amount: '',
    paymentMethod: 'UPI',
    notes: ''
  };

  const customCategory = old.category === 'Other' ? (old.customCategory || '') : '';

  openModal(`
    <div class="modal-title">${isEdit ? 'Edit expense' : 'Add home expense'}</div>
    <form id="financeExpenseForm">
      <div class="field">
        <label>Date</label>
        <input type="date" name="date" value="${old.date || financeDateInputValue()}" required>
      </div>

      <div class="field">
        <label>Category</label>
        <select name="category" id="financeExpenseCategory">
          ${FINANCE_CATEGORIES.map(c =>
            `<option value="${escapeHTML(c)}" ${old.category === c ? 'selected' : ''}>${escapeHTML(c)}</option>`
          ).join('')}
        </select>
      </div>

      <div class="field" id="financeCustomCategoryField" style="${old.category === 'Other' ? '' : 'display:none;'}">
        <label>Custom category</label>
        <input type="text" name="customCategory" id="financeCustomCategory"
          value="${escapeHTML(customCategory)}"
          placeholder="e.g. Pet, Gifts">
      </div>

      <div class="field">
        <label>Amount (₹)</label>
        <input type="number" name="amount" min="0.01" step="0.01"
          value="${old.amount ?? ''}" placeholder="e.g. 2500" required>
      </div>

      <div class="field">
        <label>Payment method</label>
        <select name="paymentMethod">
          ${FINANCE_PAYMENT_METHODS.map(p =>
            `<option ${old.paymentMethod === p ? 'selected' : ''}>${escapeHTML(p)}</option>`
          ).join('')}
        </select>
      </div>

      <div class="field">
        <label>Notes</label>
        <textarea name="notes" placeholder="Optional notes">${escapeHTML(old.notes || '')}</textarea>
      </div>

      <div class="modal-actions">
        ${isEdit ? '<button type="button" class="btn danger" id="financeDeleteExpenseBtn">Delete Entry</button>' : ''}
        <button type="button" class="btn" id="financeCancelExpenseBtn">Cancel</button>
        <button type="submit" class="btn primary">Save Expense</button>
      </div>
    </form>
  `);

  const categorySelect = document.getElementById('financeExpenseCategory');
  const customField = document.getElementById('financeCustomCategoryField');

  categorySelect.addEventListener('change', () => {
    customField.style.display = categorySelect.value === 'Other' ? '' : 'none';
  });

  document.getElementById('financeCancelExpenseBtn').addEventListener('click', closeModal);

  if (isEdit) {
    document.getElementById('financeDeleteExpenseBtn').addEventListener('click', async () => {
      if (!confirm('Delete this expense entry?')) return;
      try {
        await dbDelete('financeExpenses', old.id);
        closeModal();
        await renderFinance();
      } catch (err) {
        alert(`Could not delete expense: ${err.message || err}`);
      }
    });
  }

  document.getElementById('financeExpenseForm').addEventListener('submit', async e => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const date = String(fd.get('date') || '');
    const amount = Number(fd.get('amount') || 0);
    const category = String(fd.get('category') || 'Other');
    const custom = String(fd.get('customCategory') || '').trim();

    if (!date) {
      alert('Please select an expense date.');
      return;
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      alert('Please enter a valid expense amount.');
      return;
    }
    if (category === 'Other' && !custom) {
      alert('Please enter a custom category.');
      return;
    }

    const record = {
      ...old,
      id: old.id,
      date,
      category,
      customCategory: category === 'Other' ? custom : '',
      item: category === 'Other' ? custom : category,
      amount,
      paymentMethod: String(fd.get('paymentMethod') || 'Other'),
      notes: String(fd.get('notes') || '').trim(),
      updatedAt: new Date().toISOString()
    };

    try {
      await dbPut('financeExpenses', record);
      closeModal();
      await renderFinance();
    } catch (err) {
      console.error(err);
      alert(`Could not save expense: ${err.message || err}`);
    }
  });
}

function financeExportXLS(rows, maintenanceRows, fromDate, toDate) {
  const homeTotal = rows.reduce((s, r) => s + financeRowAmount(r), 0);
  const maintTotal = maintenanceRows.reduce((s, r) => s + financeRowAmount(r), 0);
  const total = homeTotal + maintTotal;

  const categoryTotals = {};
  rows.forEach(r => {
    const category = r.category === 'Other' ? (r.customCategory || 'Other') : r.category;
    categoryTotals[category] = (categoryTotals[category] || 0) + financeRowAmount(r);
  });
  maintenanceRows.forEach(r => {
    categoryTotals.Maintenance = (categoryTotals.Maintenance || 0) + financeRowAmount(r);
  });

  const summaryRows = Object.entries(categoryTotals)
    .sort((a,b) => b[1] - a[1])
    .map(([k,v]) => `<tr><td>${escapeHTML(k)}</td><td>${v.toFixed(2)}</td></tr>`)
    .join('');

  const homeRows = rows.map(r => `
    <tr>
      <td>${escapeHTML(r.date)}</td>
      <td>${escapeHTML(r.category === 'Other' ? (r.customCategory || 'Other') : r.category)}</td>
      <td>${escapeHTML(r.item || '')}</td>
      <td>${Number(r.amount).toFixed(2)}</td>
      <td>${escapeHTML(r.paymentMethod || '')}</td>
      <td>${escapeHTML(r.notes || '')}</td>
    </tr>`).join('');

  const maintRows = maintenanceRows.map(r => `
    <tr>
      <td>${escapeHTML(r.date)}</td>
      <td>${escapeHTML(r.item || 'Other item')}</td>
      <td>${Number(r.amount).toFixed(2)}</td>
      <td>${escapeHTML(r.notes || '')}</td>
    </tr>`).join('');

  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8">
  <style>
  body{font-family:Arial,sans-serif}table{border-collapse:collapse;margin-bottom:22px}
  th,td{border:1px solid #999;padding:7px 10px}th{font-weight:bold}
  .total{font-weight:bold}
  </style></head><body>
  <h1>Personal Manager - Finance</h1>
  <p>Period: ${escapeHTML(fromDate || 'All')} to ${escapeHTML(toDate || 'All')}</p>

  <h2>Summary</h2>
  <table>
    <tr><th>Type</th><th>Total (₹)</th></tr>
    <tr><td>Home Expenses</td><td>${homeTotal.toFixed(2)}</td></tr>
    <tr><td>Maintenance</td><td>${maintTotal.toFixed(2)}</td></tr>
    <tr class="total"><td>Grand Total</td><td>${total.toFixed(2)}</td></tr>
  </table>

  <h2>Expense by Category</h2>
  <table><tr><th>Category</th><th>Total (₹)</th></tr>${summaryRows}
    <tr class="total"><td>Grand Total</td><td>${total.toFixed(2)}</td></tr>
  </table>

  <h2>Home Expense Details</h2>
  <table><tr><th>Date</th><th>Category</th><th>Item</th><th>Amount (₹)</th><th>Payment</th><th>Notes</th></tr>
    ${homeRows || '<tr><td colspan="6">No home expenses</td></tr>'}
  </table>

  <h2>Maintenance Details</h2>
  <table><tr><th>Date</th><th>Item</th><th>Amount (₹)</th><th>Notes</th></tr>
    ${maintRows || '<tr><td colspan="4">No maintenance expenses</td></tr>'}
  </table>
  </body></html>`;

  const blob = new Blob([html], { type: 'application/vnd.ms-excel' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `finance-${fromDate || 'all'}-to-${toDate || 'all'}.xls`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function renderFinanceSummary() {
  const container = document.getElementById('financeResults');
  if (!container) return;

  const fromDate = document.getElementById('financeFromDate')?.value || '';
  const toDate = document.getElementById('financeToDate')?.value || '';

  if (fromDate && toDate && fromDate > toDate) {
    container.innerHTML = '<div class="empty">From date cannot be after To date.</div>';
    return;
  }

  container.innerHTML = '<div class="empty">Calculating expenses...</div>';

  try {
    const home = (await getFinanceHomeExpenses()).filter(r =>
      (!fromDate || r.date >= fromDate) && (!toDate || r.date <= toDate)
    );
    const maintenance = await getFinanceMaintenanceRows(fromDate, toDate);

    const homeTotal = home.reduce((s,r) => s + financeRowAmount(r), 0);
    const maintenanceTotal = maintenance.reduce((s,r) => s + financeRowAmount(r), 0);
    const total = homeTotal + maintenanceTotal;

    const categoryTotals = {};
    home.forEach(r => {
      const category = r.category === 'Other' ? (r.customCategory || 'Other') : r.category;
      categoryTotals[category] = (categoryTotals[category] || 0) + financeRowAmount(r);
    });
    maintenance.forEach(r => {
      categoryTotals.Maintenance = (categoryTotals.Maintenance || 0) + financeRowAmount(r);
    });

    const categoryRows = Object.entries(categoryTotals)
      .sort((a,b) => b[1] - a[1])
      .map(([category, amount]) => `
        <div class="finance-result-row">
          <span>${escapeHTML(category)}</span>
          <strong>₹${formatFinanceMoney(amount)}</strong>
        </div>
      `).join('');

    const allRows = [
      ...home.map(r => ({
        ...r,
        displayCategory: r.category === 'Other' ? (r.customCategory || 'Other') : r.category,
        displayItem: r.item || r.category
      })),
      ...maintenance.map(r => ({
        ...r,
        displayCategory: 'Maintenance',
        displayItem: r.item || 'Other item',
        paymentMethod: 'Maintenance'
      }))
    ].sort((a,b) => String(b.date).localeCompare(String(a.date)));

    const details = allRows.length ? allRows.map(r => `
      <div class="detail-row">
        <span>
          ${fmtDate(r.date)} · ${escapeHTML(r.displayItem)}
          <small style="opacity:.65;"> · ${escapeHTML(r.displayCategory)}</small>
        </span>
        <strong>₹${formatFinanceMoney(r.amount)}</strong>
      </div>
      ${r.notes ? `<div class="detail-row"><span class="k">Notes</span><span style="text-align:right;max-width:65%">${escapeHTML(r.notes)}</span></div>` : ''}
    `).join('') : '<div class="empty">No expenses found for this period.</div>';

    container.innerHTML = `
      <div style="padding:16px;border:1px solid var(--border);border-radius:14px;background:var(--surface);margin-bottom:14px;">
        <div style="font-size:14px;color:var(--text-dim);margin-bottom:6px;">TOTAL EXPENSES</div>
        <div style="font-size:30px;font-weight:800;color:var(--teal);">₹${formatFinanceMoney(total)}</div>
      </div>

      <div class="finance-result" style="margin-bottom:14px;">
        <div class="finance-result-row">
          <span>Home Expenses</span><strong>₹${formatFinanceMoney(homeTotal)}</strong>
        </div>
        <div class="finance-result-row">
          <span>Maintenance</span><strong>₹${formatFinanceMoney(maintenanceTotal)}</strong>
        </div>
      </div>

      ${categoryRows ? `
        <div style="margin-bottom:14px;">
          <div class="section-head"><span class="section-title">Expense by Category</span></div>
          <div class="finance-result">${categoryRows}</div>
        </div>` : ''}

      <div>
        <div class="section-head">
          <span class="section-title">Expense History</span>
          <span class="section-count">${allRows.length}</span>
        </div>
        ${details}
      </div>
    `;

    const download = document.getElementById('downloadFinanceBtn');
    if (download) {
      download.disabled = allRows.length === 0;
      download.onclick = () => {
        if (allRows.length) financeExportXLS(home, maintenance, fromDate, toDate);
      };
    }
  } catch (error) {
    console.error(error);
    container.innerHTML = `<div class="empty">Unable to calculate expenses. ${escapeHTML(error.message || error)}</div>`;
  }
}

function renderFinance() {
  viewEl.innerHTML = `
    <div class="finance-page">

      <div class="finance-header">
        <h1>Finance</h1>
        <p>Track home expenses and maintenance costs</p>
      </div>

      <div class="finance-card">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;">
          <div>
            <h2 style="margin-bottom:4px;">💰 Home Expenses</h2>
            <p style="margin:0;opacity:.7;font-size:13px;">Record and review your everyday spending.</p>
          </div>
          <button type="button" class="btn primary" id="addFinanceExpenseBtn">+ Add Expense</button>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:18px;">
          <div class="field">
            <label>From date</label>
            <input type="date" id="financeFromDate" value="${financeMonthStart()}">
          </div>
          <div class="field">
            <label>To date</label>
            <input type="date" id="financeToDate" value="${financeMonthEnd()}">
          </div>
        </div>

        <div class="modal-actions" style="margin-top:4px;">
          <button type="button" class="btn primary" id="viewFinanceBtn">View Expenses</button>
          <button type="button" class="btn" id="downloadFinanceBtn" disabled>Download Excel (.xls)</button>
        </div>

        <div id="financeResults" style="margin-top:16px;">
          <div class="empty">Loading finance summary...</div>
        </div>
      </div>

      <div class="finance-card">
        <h2>🏦 EMI Calculator</h2>

        <div class="field">
          <label>Loan Amount (₹)</label>
          <input type="number" id="financeLoan" placeholder="Example: 1000000">
        </div>

        <div class="field">
          <label>Interest Rate (% per year)</label>
          <input type="number" id="financeInterest" step="0.01" placeholder="Example: 8.5">
        </div>

        <div class="field">
          <label>Loan Tenure (Years)</label>
          <input type="number" id="financeYears" placeholder="Example: 5">
        </div>

        <button type="button" class="btn primary finance-calculate" id="calculateEMIBtn">Calculate EMI</button>
        <div id="emiResult"></div>
      </div>


    </div>
  `;

  const addExpenseBtn = document.getElementById('addFinanceExpenseBtn');
  if (addExpenseBtn) {
    // Bind directly after the Finance DOM is rendered.
    addExpenseBtn.onclick = (event) => {
      event.preventDefault();
      event.stopPropagation();
      openFinanceExpenseForm(null);
    };
  }
  document.getElementById('viewFinanceBtn').addEventListener('click', renderFinanceSummary);
  document.getElementById('financeFromDate').addEventListener('change', renderFinanceSummary);
  document.getElementById('financeToDate').addEventListener('change', renderFinanceSummary);

  document.getElementById('calculateEMIBtn').addEventListener('click', calculateEMI);

  renderFinanceSummary();
}

/* ---------------- EMI Calculator ---------------- */

function calculateEMI() {
  const principal = Number(document.getElementById('financeLoan').value) || 0;
  const annualRate = Number(document.getElementById('financeInterest').value) || 0;
  const years = Number(document.getElementById('financeYears').value) || 0;

  if (principal <= 0 || annualRate <= 0 || years <= 0) {
    alert('Please enter all loan details.');
    return;
  }

  const monthlyRate = annualRate / 12 / 100;
  const months = years * 12;
  const emi = principal * monthlyRate * Math.pow(1 + monthlyRate, months) /
    (Math.pow(1 + monthlyRate, months) - 1);
  const totalPayment = emi * months;
  const totalInterest = totalPayment - principal;

  document.getElementById('emiResult').innerHTML = `
    <div class="finance-result">
      <div class="finance-result-row finance-highlight"><span>Monthly EMI</span><strong>₹${formatFinanceMoney(emi)}</strong></div>
      <div class="finance-result-row"><span>Total Interest</span><strong>₹${formatFinanceMoney(totalInterest)}</strong></div>
      <div class="finance-result-row"><span>Total Payment</span><strong>₹${formatFinanceMoney(totalPayment)}</strong></div>
    </div>`;
}
function render(){ return renderFinance(); }
function initPage(){ renderFinance(); }
