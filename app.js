/* ---------------- Config ---------------- */
const DOC_CATEGORIES = ['Àadhar','PAN','ID /Driving License','Passport','Voter ID','Warranty','Vehicle RC','Subscription','Property','Education Certificate','Other'];
const MAINT_TYPES = ['AC','RO / Water Purifier','Refrigerator','Washing Machine','Geyser','Vehicle Service','Home Cleaning','Pest Control','Electrical/Plumbing','Other'];
const REMINDER_OPTIONS = [30,7,1];

let state = { view: 'dashboard' };


/* ---------------- Local-only mode ----------------
   Supabase authentication is disabled for now.
   Data is stored locally in this browser using IndexedDB.
---------------------------------------------------- */
let currentUser = { local: true };

function updateAuthUI() {
  const bottomNav = document.querySelector('.bottomnav');
  if (bottomNav) bottomNav.style.display = '';

  if (fab) {
    fab.classList.toggle('hidden', state.view === 'dashboard');
  }
}

/* ---------------- IndexedDB ---------------- */
const DB_NAME = 'personalManagerDB';
const DB_VERSION = 1;
let dbPromise = new Promise((resolve, reject) => {
  const req = indexedDB.open(DB_NAME, DB_VERSION);
  req.onupgradeneeded = (e) => {
    const db = e.target.result;
    if (!db.objectStoreNames.contains('documents')) {
      db.createObjectStore('documents', { keyPath: 'id' });
    }
    if (!db.objectStoreNames.contains('maintenance')) {
      db.createObjectStore('maintenance', { keyPath: 'id' });
    }
  };
  req.onsuccess = () => resolve(req.result);
  req.onerror = () => reject(req.error);
});

async function dbGetAll(store) {
  const db = await dbPromise;
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readonly');
    const req = tx.objectStore(store).getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function dbPut(store, obj) {
  const db = await dbPromise;
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    tx.objectStore(store).put(obj);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
async function dbDelete(store, id) {
  const db = await dbPromise;
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    tx.objectStore(store).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2,8); }

/* ---------------- Date helpers ---------------- */
function daysUntil(dateStr) {
  if (!dateStr) return null;
  const today = new Date(); today.setHours(0,0,0,0);
  const target = new Date(dateStr + 'T00:00:00');
  return Math.round((target - today) / 86400000);
}
function statusClass(days) {
  if (days === null) return 'green';
  if (days < 0) return 'red';
  if (days <= 7) return 'red';
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

/* ---------------- Rendering ---------------- */
const viewEl = document.getElementById('view');
const fab = document.getElementById('fab');
fab.classList.add('hidden');

function setView(view) {
  state.view = view;
  document.querySelectorAll('.navbtn').forEach(b => b.classList.toggle('active', b.dataset.view === view));
  fab.classList.toggle('hidden', view === 'dashboard');
  render();
}

async function render() {
  if (state.view === 'dashboard') return renderDashboard();
  if (state.view === 'documents') return renderDocuments();
  if (state.view === 'maintenance') return renderMaintenance();
  if (state.view === 'finance') return renderFinance();
}

async function renderDashboard() {
  const [docs, maint] = await Promise.all([dbGetAll('documents'), dbGetAll('maintenance')]);

  const docItems = docs.map(d => ({...d, _days: daysUntil(d.expiryDate), _kind:'document'}));
  const maintItems = maint.map(m => ({...m, _days: daysUntil(m.nextServiceDate), _kind:'maintenance'}));

  const overdueOrSoonDocs = docItems.filter(d => d._days !== null && d._days <= 30).sort((a,b)=>a._days-b._days);
  const dueMaint = maintItems.filter(m => m._days !== null && m._days <= 30).sort((a,b)=>a._days-b._days);
  const upcoming = [...docItems, ...maintItems]
    .filter(x => x._days !== null)
    .sort((a,b)=>a._days-b._days)
    .slice(0,8);

  const overdueCount = [...docItems, ...maintItems].filter(x => x._days !== null && x._days < 0).length;
  const soonCount = [...docItems, ...maintItems].filter(x => x._days !== null && x._days >= 0 && x._days <= 7).length;

  viewEl.innerHTML = `
    <div class="stats">
      <div class="stat-card red"><div class="stat-num">${overdueCount}</div><div class="stat-label">Overdue</div></div>
      <div class="stat-card amber"><div class="stat-num">${soonCount}</div><div class="stat-label">Due in 7 days</div></div>
      <div class="stat-card teal"><div class="stat-num">${docs.length + maint.length}</div><div class="stat-label">Total tracked</div></div>
    </div>

    <div class="section">
      <div class="section-head"><span class="section-title">Upcoming reminders</span><span class="section-count">${upcoming.length}</span></div>
      ${upcoming.length ? upcoming.map(cardHTML).join('') : emptyHTML('Nothing due in the next month.')}
    </div>

    <div class="section">
      <div class="section-head"><span class="section-title">Expiring documents</span><span class="section-count">${overdueOrSoonDocs.length}</span></div>
      ${overdueOrSoonDocs.length ? overdueOrSoonDocs.map(cardHTML).join('') : emptyHTML('No documents expiring soon.')}
    </div>

    <div class="section">
      <div class="section-head"><span class="section-title">Maintenance due</span><span class="section-count">${dueMaint.length}</span></div>
      ${dueMaint.length ? dueMaint.map(cardHTML).join('') : emptyHTML('Nothing needs servicing soon.')}
    </div>
  `;
  bindCardClicks();
}

function emptyHTML(msg) {
  return `<div class="empty">${msg}</div>`;
}

function cardHTML(item) {
  const cls = statusClass(item._days);
  const chip = daysLabel(item._days);
  const title = item._kind === 'document' ? item.name : item.itemName;
  const sub = item._kind === 'document'
    ? `${item.category} · expires ${fmtDate(item.expiryDate)}`
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

async function renderMaintenance() {
  const items = (await dbGetAll('maintenance')).map(m => ({...m, _days: daysUntil(m.nextServiceDate)}))
    .sort((a,b) => (a._days ?? 9999) - (b._days ?? 9999));
  viewEl.innerHTML = `
    <div class="section" style="margin-top:8px;">
      <div class="section-head"><span class="section-title">Home items</span><span class="section-count">${items.length}</span></div>
      ${items.length ? items.map(m => cardHTML({...m, _kind:'maintenance'})).join('') : emptyHTML('No items yet. Tap + to add one.')}
    </div>
  `;
  bindCardClicks();
}

/* ---------------- Finance ---------------- */

function renderFinance() {
  viewEl.innerHTML = `
    <div class="finance-page">

      <div class="finance-header">
        <h1>Salary & Finance</h1>
        <p>Manage your salary, loans and EMIs</p>
      </div>

<!-- Salary Calculator -->
<div class="finance-card">

  <h2>💼 Salary Calculator</h2>

  <div class="finance-section-title">
    Salary Components
  </div>

  <div class="field">
    <label>Annual CTC (₹)</label>
    <input
      type="number"
      id="financeCTC"
      min="0"
      placeholder="Example: 1500000">
  </div>

  <div class="field">
    <label>Basic Salary / Year (₹)</label>
    <input
      type="number"
      id="financeBasic"
      min="0"
      placeholder="Example: 600000">
  </div>

  <div class="field">
    <label>HRA / Year (₹)</label>
    <input
      type="number"
      id="financeHRA"
      min="0"
      placeholder="Example: 300000">
  </div>

  <div class="field">
    <label>Other Allowances / Year (₹)</label>
    <input
      type="number"
      id="financeAllowance"
      min="0"
      placeholder="Example: 450000">
  </div>

  <div class="field">
    <label>Variable Pay / Year (₹)</label>
    <input
      type="number"
      id="financeVariable"
      min="0"
      placeholder="Example: 150000">
  </div>


  <div class="finance-section-title">
    Employee Deductions
  </div>

  <div class="field">
    <label>Employee PF / Month (₹)</label>
    <input
      type="number"
      id="financePF"
      min="0"
      placeholder="Example: 1800">
  </div>

  <div class="field">
    <label>Professional Tax / Month (₹)</label>
    <input
      type="number"
      id="financePT"
      min="0"
      placeholder="Example: 200">
  </div>

  <div class="field">
    <label>TDS / Income Tax / Month (₹)</label>
    <input
      type="number"
      id="financeTDS"
      min="0"
      placeholder="Example: 5000">
  </div>

  <div class="field">
    <label>Other Deductions / Month (₹)</label>
    <input
      type="number"
      id="financeOtherDeduction"
      min="0"
      placeholder="Example: 500">
  </div>


  <button
    type="button"
    class="btn primary finance-calculate"
    id="calculateSalaryBtn">

    Calculate Salary

  </button>

  <div id="salaryResult"></div>

</div>


      <!-- EMI Calculator -->
      <div class="finance-card">

        <h2>🏦 EMI Calculator</h2>

        <div class="field">
          <label>Loan Amount (₹)</label>
          <input
            type="number"
            id="financeLoan"
            placeholder="Example: 1000000"
          >
        </div>

        <div class="field">
          <label>Interest Rate (% per year)</label>
          <input
            type="number"
            id="financeInterest"
            step="0.01"
            placeholder="Example: 8.5"
          >
        </div>

        <div class="field">
          <label>Loan Tenure (Years)</label>
          <input
            type="number"
            id="financeYears"
            placeholder="Example: 5"
          >
        </div>

        <button
          type="button"
          class="btn primary finance-calculate"
          id="calculateEMIBtn">
          Calculate EMI
        </button>

        <div id="emiResult"></div>

      </div>


      <!-- Loan Summary -->
      <div class="finance-card">

        <h2>📊 Monthly Loan Summary</h2>

        <div class="field">
          <label>Home Loan EMI (₹)</label>
          <input
            type="number"
            id="homeLoanEMI"
            placeholder="Example: 47000"
          >
        </div>

        <div class="field">
          <label>Personal Loan EMI (₹)</label>
          <input
            type="number"
            id="personalLoanEMI"
            placeholder="Example: 22000"
          >
        </div>

        <div class="field">
          <label>Car Loan EMI (₹)</label>
          <input
            type="number"
            id="carLoanEMI"
            placeholder="Example: 31000"
          >
        </div>

        <button
          type="button"
          class="btn primary finance-calculate"
          id="calculateLoanBtn">
          Calculate Total EMI
        </button>

        <div id="loanTotalResult"></div>

      </div>

    </div>
  `;

  bindFinanceEvents();
}


/* ---------------- Finance Events ---------------- */

function bindFinanceEvents() {

  document
    .getElementById('calculateSalaryBtn')
    .addEventListener('click', calculateSalary);

  document
    .getElementById('calculateEMIBtn')
    .addEventListener('click', calculateEMI);

  document
    .getElementById('calculateLoanBtn')
    .addEventListener('click', calculateLoanTotal);
}


/* ---------------- Salary Calculator ---------------- */

function calculateSalary() {

  const ctc =
    Number(document.getElementById('financeCTC').value) || 0;

  const basic =
    Number(document.getElementById('financeBasic').value) || 0;

  const hra =
    Number(document.getElementById('financeHRA').value) || 0;

  const allowance =
    Number(document.getElementById('financeAllowance').value) || 0;

  const variable =
    Number(document.getElementById('financeVariable').value) || 0;

  const pf =
    Number(document.getElementById('financePF').value) || 0;

  const professionalTax =
    Number(document.getElementById('financePT').value) || 0;

  const tds =
    Number(document.getElementById('financeTDS').value) || 0;

  const otherDeduction =
    Number(document.getElementById('financeOtherDeduction').value) || 0;


  /* Validation */

  if (ctc <= 0) {
    alert('Please enter your Annual CTC.');
    return;
  }

  if (variable > ctc) {
    alert('Variable pay cannot be greater than CTC.');
    return;
  }

  const fixedCTC = ctc - variable;

  const monthlyCTC = ctc / 12;

  const monthlyFixedGross = fixedCTC / 12;

  const monthlyVariable = variable / 12;

  const totalMonthlyDeductions =
    pf +
    professionalTax +
    tds +
    otherDeduction;

  const estimatedTakeHome =
    monthlyFixedGross -
    totalMonthlyDeductions;


  /* Display Results */

  document.getElementById('salaryResult').innerHTML = `

    <div class="finance-result">

      <div class="finance-result-heading">
        Salary Summary
      </div>

      <div class="finance-result-row">
        <span>Annual CTC</span>
        <strong>₹${formatFinanceMoney(ctc)}</strong>
      </div>

      <div class="finance-result-row">
        <span>Fixed CTC</span>
        <strong>₹${formatFinanceMoney(fixedCTC)}</strong>
      </div>

      <div class="finance-result-row">
        <span>Variable Pay</span>
        <strong>₹${formatFinanceMoney(variable)}</strong>
      </div>

      <div class="finance-result-row">
        <span>Monthly CTC</span>
        <strong>₹${formatFinanceMoney(monthlyCTC)}</strong>
      </div>

      <div class="finance-result-row">
        <span>Monthly Fixed Gross</span>
        <strong>₹${formatFinanceMoney(monthlyFixedGross)}</strong>
      </div>


      <div class="finance-result-heading deduction-heading">
        Monthly Deductions
      </div>

      <div class="finance-result-row">
        <span>Employee PF</span>
        <strong>− ₹${formatFinanceMoney(pf)}</strong>
      </div>

      <div class="finance-result-row">
        <span>Professional Tax</span>
        <strong>− ₹${formatFinanceMoney(professionalTax)}</strong>
      </div>

      <div class="finance-result-row">
        <span>TDS / Income Tax</span>
        <strong>− ₹${formatFinanceMoney(tds)}</strong>
      </div>

      <div class="finance-result-row">
        <span>Other Deductions</span>
        <strong>− ₹${formatFinanceMoney(otherDeduction)}</strong>
      </div>

      <div class="finance-result-row">
        <span>Total Deductions</span>
        <strong>− ₹${formatFinanceMoney(totalMonthlyDeductions)}</strong>
      </div>


      <div class="finance-result-row finance-highlight">
        <span>Estimated Take Home</span>
        <strong>₹${formatFinanceMoney(estimatedTakeHome)}</strong>
      </div>

    </div>

    <div class="finance-note">
      This is an estimate based on the values entered.
      Actual salary may vary based on your company's payroll structure.
    </div>

  `;
}


/* ---------------- EMI Calculator ---------------- */

function calculateEMI() {

  const principal =
    Number(document.getElementById('financeLoan').value) || 0;

  const annualRate =
    Number(document.getElementById('financeInterest').value) || 0;

  const years =
    Number(document.getElementById('financeYears').value) || 0;

  if (principal <= 0 || annualRate <= 0 || years <= 0) {
    alert('Please enter all loan details.');
    return;
  }

  const monthlyRate = annualRate / 12 / 100;

  const months = years * 12;

  const emi =
    principal *
    monthlyRate *
    Math.pow(1 + monthlyRate, months) /
    (Math.pow(1 + monthlyRate, months) - 1);

  const totalPayment = emi * months;

  const totalInterest = totalPayment - principal;

  document.getElementById('emiResult').innerHTML = `

    <div class="finance-result">

      <div class="finance-result-row finance-highlight">
        <span>Monthly EMI</span>
        <strong>₹${formatFinanceMoney(emi)}</strong>
      </div>

      <div class="finance-result-row">
        <span>Total Interest</span>
        <strong>₹${formatFinanceMoney(totalInterest)}</strong>
      </div>

      <div class="finance-result-row">
        <span>Total Payment</span>
        <strong>₹${formatFinanceMoney(totalPayment)}</strong>
      </div>

    </div>
  `;
}


/* ---------------- Loan Summary ---------------- */

function calculateLoanTotal() {

  const home =
    Number(document.getElementById('homeLoanEMI').value) || 0;

  const personal =
    Number(document.getElementById('personalLoanEMI').value) || 0;

  const car =
    Number(document.getElementById('carLoanEMI').value) || 0;

  const total = home + personal + car;

  document.getElementById('loanTotalResult').innerHTML = `

    <div class="finance-result">

      <div class="finance-result-row">
        <span>Home Loan</span>
        <strong>₹${formatFinanceMoney(home)}</strong>
      </div>

      <div class="finance-result-row">
        <span>Personal Loan</span>
        <strong>₹${formatFinanceMoney(personal)}</strong>
      </div>

      <div class="finance-result-row">
        <span>Car Loan</span>
        <strong>₹${formatFinanceMoney(car)}</strong>
      </div>

      <div class="finance-result-row finance-highlight">
        <span>Total Monthly EMI</span>
        <strong>₹${formatFinanceMoney(total)}</strong>
      </div>

    </div>
  `;
}


/* ---------------- Finance Number Format ---------------- */

function formatFinanceMoney(value) {
  return Math.round(value).toLocaleString('en-IN');
}

function escapeHTML(str) {
  const d = document.createElement('div');
  d.textContent = str ?? '';
  return d.innerHTML;
}

/* ---------------- Modal helpers ---------------- */
const modalRoot = document.getElementById('modalRoot');
function closeModal() { modalRoot.innerHTML = ''; }
function openModal(html) {
  modalRoot.innerHTML = `<div class="modal-backdrop" id="backdrop"><div class="modal-sheet">${html}</div></div>`;
  document.getElementById('backdrop').addEventListener('click', (e) => {
    if (e.target.id === 'backdrop') closeModal();
  });
}

/* ---------------- Document form ---------------- */
function openDocumentForm(existing) {
  const isEdit = !!existing;
  const d = existing || { id: uid(), reminders: [30,7,1], notifiedThresholds: [] };
  openModal(`
    <div class="modal-title">${isEdit ? 'Edit document' : 'Add document'}</div>
    <form id="docForm">
      <div class="field"><label>Document name</label>
        <input type="text" name="name" required value="${escapeHTML(d.name||'')}" placeholder="e.g. Car insurance">
      </div>
      <div class="field"><label>Category</label>
        <select name="category">
          ${DOC_CATEGORIES.map(c => `<option ${d.category===c?'selected':''}>${c}</option>`).join('')}
        </select>
      </div>
      <div class="field"><label>Expiry date</label>
        <input type="date" name="expiryDate" required value="${d.expiryDate||''}">
      </div>
      <div class="field"><label>Remind me before expiry</label>
        <div class="chip-row" id="reminderChips">
          ${REMINDER_OPTIONS.map(n => `<button type="button" class="chip-toggle ${d.reminders?.includes(n)?'on':''}" data-val="${n}">${n} day${n>1?'s':''}</button>`).join('')}
        </div>
      </div>
      <div class="field"><label>Notes</label>
        <textarea name="notes" placeholder="Optional notes">${escapeHTML(d.notes||'')}</textarea>
      </div>
      <div class="field"><label>Photo / PDF</label>
        <div class="filepick">
          <span class="filepick-name" id="fileName">${d.fileName || 'No file attached'}</span>
          <button type="button" class="filepick-btn" id="filePickBtn">Choose</button>
          <input type="file" id="fileInput" accept="image/*,application/pdf">
        </div>
      </div>
      <div class="modal-actions">
        ${isEdit ? '<button type="button" class="btn danger" id="deleteBtn">Delete</button>' : ''}
        <button type="button" class="btn" id="cancelBtn">Cancel</button>
        <button type="submit" class="btn primary">Save</button>
      </div>
    </form>
  `);

  let fileData = d.fileBlob ? { blob: d.fileBlob, name: d.fileName, type: d.fileType } : null;
  const chips = Array.from(document.querySelectorAll('#reminderChips .chip-toggle'));
  chips.forEach(chip => chip.addEventListener('click', () => chip.classList.toggle('on')));

  document.getElementById('filePickBtn').addEventListener('click', () => document.getElementById('fileInput').click());
  document.getElementById('fileInput').addEventListener('change', (e) => {
    const f = e.target.files[0];
    if (f) {
      fileData = { blob: f, name: f.name, type: f.type };
      document.getElementById('fileName').textContent = f.name;
    }
  });
  document.getElementById('cancelBtn').addEventListener('click', closeModal);
  if (isEdit) {
    document.getElementById('deleteBtn').addEventListener('click', async () => {
      if (confirm('Delete this document?')) { await dbDelete('documents', d.id); closeModal(); render(); }
    });
  }
  document.getElementById('docForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const reminders = chips.filter(c => c.classList.contains('on')).map(c => Number(c.dataset.val));
    const record = {
      id: d.id,
      name: fd.get('name').trim(),
      category: fd.get('category'),
      expiryDate: fd.get('expiryDate'),
      notes: fd.get('notes').trim(),
      reminders,
      notifiedThresholds: isEdit && existing.expiryDate === fd.get('expiryDate') ? (d.notifiedThresholds||[]) : [],
      fileBlob: fileData ? fileData.blob : null,
      fileName: fileData ? fileData.name : null,
      fileType: fileData ? fileData.type : null,
    };
    await dbPut('documents', record);
    closeModal();
    render();
  });
}

/* ---------------- Maintenance form ---------------- */
function openMaintenanceForm(existing) {
  const isEdit = !!existing;
  const m = existing || { id: uid(), reminders: [30,7,1], notifiedThresholds: [] };
  const todayDate = new Date().toISOString().split('T')[0];

  openModal(`
    <div class="modal-title">${isEdit ? 'Edit item' : 'Add home item'}</div>
    <form id="maintForm">
      <div class="field"><label>Item</label>
        <select name="type" id="typeSelect">
          ${MAINT_TYPES.map(t => `<option ${m.type===t?'selected':''}>${t}</option>`).join('')}
        </select>
      </div>
      <div class="field" id="customNameField" style="${m.type==='Other'?'':'display:none'}">
        <label>Custom name</label>
        <input type="text" name="itemName" value="${escapeHTML(m.itemName && m.type==='Other' ? m.itemName : '')}" placeholder="e.g. Water heater">
      </div>
      <div class="field"><label>Last service date</label>
        <input type="date" name="lastServiceDate" value="${m.lastServiceDate||''}" max="${todayDate}">
        <small>Today or a past date only.</small>
      </div>
      <div class="field"><label>Service due date</label>
        <input type="date" name="nextServiceDate" required min="${todayDate}" value="${m.nextServiceDate||''}">
        <small>Today or a future date only.</small>
      </div>
      <div class="field"><label>Cost (₹)</label>
        <input type="number" name="cost" min="0" step="0.01" value="${m.cost ?? ''}" placeholder="0">
      </div>
      <div class="field"><label>Remind me before service</label>
        <div class="chip-row" id="reminderChipsM">
          ${REMINDER_OPTIONS.map(n => `<button type="button" class="chip-toggle ${m.reminders?.includes(n)?'on':''}" data-val="${n}">${n} day${n>1?'s':''}</button>`).join('')}
        </div>
      </div>
      <div class="field"><label>Notes</label>
        <textarea name="notes" placeholder="Optional notes">${escapeHTML(m.notes||'')}</textarea>
      </div>
      <div class="modal-actions">
        ${isEdit ? '<button type="button" class="btn danger" id="deleteBtn">Delete</button>' : ''}
        <button type="button" class="btn" id="cancelBtn">Cancel</button>
        <button type="submit" class="btn primary">Save</button>
      </div>
    </form>
  `);

  const chips = Array.from(document.querySelectorAll('#reminderChipsM .chip-toggle'));
  chips.forEach(chip => chip.addEventListener('click', () => chip.classList.toggle('on')));

  document.getElementById('typeSelect').addEventListener('change', (e) => {
    document.getElementById('customNameField').style.display = e.target.value === 'Other' ? '' : 'none';
  });

  document.getElementById('cancelBtn').addEventListener('click', closeModal);

  if (isEdit) {
    document.getElementById('deleteBtn').addEventListener('click', async () => {
      if (confirm('Delete this item?')) {
        await dbDelete('maintenance', m.id);
        closeModal();
        render();
      }
    });
  }

  document.getElementById('maintForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    const fd = new FormData(e.target);
    const type = fd.get('type');
    const lastServiceDate = fd.get('lastServiceDate');
    const nextServiceDate = fd.get('nextServiceDate');
    const cost = fd.get('cost');
    const reminders = chips
      .filter(c => c.classList.contains('on'))
      .map(c => Number(c.dataset.val));

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Last service cannot be in the future.
    if (lastServiceDate) {
      const lastDate = new Date(lastServiceDate + 'T00:00:00');
      if (lastDate > today) {
        alert('Last serviced date cannot be in the future.');
        return;
      }
    }

    // Service due date must be today or later.
    if (nextServiceDate) {
      const nextDate = new Date(nextServiceDate + 'T00:00:00');
      if (nextDate < today) {
        alert('Service due date cannot be in the past.');
        return;
      }
    }

    // Service due date must be after the last service date.
    if (lastServiceDate && nextServiceDate) {
      const lastDate = new Date(lastServiceDate + 'T00:00:00');
      const nextDate = new Date(nextServiceDate + 'T00:00:00');
      if (nextDate <= lastDate) {
        alert('Service due date must be after the last serviced date.');
        return;
      }
    }

    if (cost && Number(cost) < 0) {
      alert('Service cost cannot be negative.');
      return;
    }

    const record = {
      id: m.id,
      type,
      itemName: type === 'Other'
        ? (fd.get('itemName').trim() || 'Other item')
        : type,
      lastServiceDate: lastServiceDate || null,
      nextServiceDate,
      cost: cost ? Number(cost) : null,
      notes: fd.get('notes').trim(),
      reminders,
      notifiedThresholds:
        isEdit && existing.nextServiceDate === nextServiceDate
          ? (m.notifiedThresholds || [])
          : [],
    };

    await dbPut('maintenance', record);
    closeModal();
    render();
  });
}

/* ---------------- Detail view ---------------- */
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
    <div class="detail-row"><span class="k">Expiry date</span><span>${fmtDate(item.expiryDate)}</span></div>
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
    if (kind === 'document') openDocumentForm(item); else openMaintenanceForm(item);
  });
}

/* ---------------- Notifications ---------------- */
const notifBtn = document.getElementById('notifPermBtn');

function updateNotifBtn() {
  if ('Notification' in window && Notification.permission === 'granted') {
    notifBtn.classList.add('granted');
  }
}

async function requestNotifPermission() {
  if (!('Notification' in window)) { alert('Notifications are not supported in this browser.'); return; }
  const perm = await Notification.requestPermission();
  updateNotifBtn();
  if (perm === 'granted') {
    checkReminders();
    try {
      const reg = await navigator.serviceWorker.ready;
      if ('periodicSync' in reg) {
        await reg.periodicSync.register('pm-reminder-check', { minInterval: 12 * 60 * 60 * 1000 });
      }
    } catch (e) { /* periodic sync not available — checks still run whenever the app opens */ }
  }
}

async function notify(title, body, tag) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  try {
    const reg = await navigator.serviceWorker.ready;
    reg.active.postMessage({ type: 'SHOW_NOTIFICATION', title, body, tag });
  } catch (e) {
    new Notification(title, { body, icon: 'icon-192.png' });
  }
}

async function checkReminders() {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;

  const docs = await dbGetAll('documents');
  for (const d of docs) {
    const days = daysUntil(d.expiryDate);
    if (days === null) continue;
    const reminders = d.reminders || [];
    const notified = d.notifiedThresholds || [];
    for (const t of reminders) {
      if (days <= t && !notified.includes(t)) {
        await notify('Document expiring', `${d.name} expires ${fmtDate(d.expiryDate)} (${daysLabel(days)}).`, `doc-${d.id}-${t}`);
        notified.push(t);
      }
    }
    if (days < 0 && !notified.includes('overdue')) {
      await notify('Document expired', `${d.name} expired ${fmtDate(d.expiryDate)}.`, `doc-${d.id}-overdue`);
      notified.push('overdue');
    }
    if (notified.length !== (d.notifiedThresholds||[]).length) {
      d.notifiedThresholds = notified;
      await dbPut('documents', d);
    }
  }

  const items = await dbGetAll('maintenance');
  for (const m of items) {
    const days = daysUntil(m.nextServiceDate);
    if (days === null) continue;
    const reminders = m.reminders || [];
    const notified = m.notifiedThresholds || [];
    for (const t of reminders) {
      if (days <= t && !notified.includes(t)) {
        await notify('Maintenance due', `${m.itemName} Maintenance ${fmtDate(m.nextServiceDate)} (${daysLabel(days)}).`, `maint-${m.id}-${t}`);
        notified.push(t);
      }
    }
    if (days < 0 && !notified.includes('overdue')) {
      await notify('Maintenance overdue', `${m.itemName} service was due ${fmtDate(m.nextServiceDate)}.`, `maint-${m.id}-overdue`);
      notified.push('overdue');
    }
    if (notified.length !== (m.notifiedThresholds||[]).length) {
      m.notifiedThresholds = notified;
      await dbPut('maintenance', m);
    }
  }
}

/* ---------------- Wire up ---------------- */
document.querySelectorAll('.navbtn').forEach(btn => {
  btn.addEventListener('click', () => setView(btn.dataset.view));
});

fab.addEventListener('click', () => {
  if (state.view === 'documents') openDocumentForm(null);
  else if (state.view === 'maintenance') openMaintenanceForm(null);
});

notifBtn.addEventListener('click', requestNotifPermission);

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
}

updateNotifBtn();

/*
 * Start the app directly in local-only mode.
 * Supabase authentication is disabled for now.
 */
render();

setInterval(() => {
  checkReminders();
}, 6 * 60 * 60 * 1000); // re-check every 6h while app is open
