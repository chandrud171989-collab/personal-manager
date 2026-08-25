/* ---------------- Config ---------------- */
const DOC_CATEGORIES = ['Insurance','ID / License','Passport','Warranty','Vehicle RC','Subscription','Property','Other'];
const MAINT_TYPES = ['AC','RO / Water Purifier','Refrigerator','Washing Machine','Geyser','Vehicle','Other'];
const REMINDER_OPTIONS = [30,7,1];

let state = { view: 'dashboard' };

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

        <div class="field">
          <label>Annual CTC (₹)</label>
          <input
            type="number"
            id="financeCTC"
            placeholder="Example: 1500000"
          >
        </div>

        <div class="field">
          <label>Variable Pay / Year (₹)</label>
          <input
            type="number"
            id="financeVariable"
            placeholder="Example: 150000"
          >
        </div>

        <div class="field">
          <label>PF / Month (₹)</label>
          <input
            type="number"
            id="financePF"
            placeholder="Example: 1800"
          >
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

  const variable =
    Number(document.getElementById('financeVariable').value) || 0;

  const pf =
    Number(document.getElementById('financePF').value) || 0;

  if (ctc <= 0) {
    alert('Please enter your annual CTC.');
    return;
  }

  if (variable > ctc) {
    alert('Variable pay cannot be greater than CTC.');
    return;
  }

  const fixedCTC = ctc - variable;

  const monthlyCTC = ctc / 12;

  const monthlyFixed = fixedCTC / 12;

  const monthlyVariable = variable / 12;

  const estimatedSalary = monthlyFixed - pf;

  document.getElementById('salaryResult').innerHTML = `

    <div class="finance-result">

      <div class="finance-result-row">
        <span>Annual CTC</span>
        <strong>₹${formatFinanceMoney(ctc)}</strong>
      </div>

      <div class="finance-result-row">
        <span>Fixed CTC</span>
        <strong>₹${formatFinanceMoney(fixedCTC)}</strong>
      </div>

      <div class="finance-result-row">
        <span>Monthly CTC</span>
        <strong>₹${formatFinanceMoney(monthlyCTC)}</strong>
      </div>

      <div class="finance-result-row">
        <span>Monthly Variable</span>
        <strong>₹${formatFinanceMoney(monthlyVariable)}</strong>
      </div>

      <div class="finance-result-row finance-highlight">
        <span>Estimated Monthly Salary*</span>
        <strong>₹${formatFinanceMoney(estimatedSalary)}</strong>
      </div>

    </div>

    <div class="finance-note">
      *Approximate calculation before income tax and other deductions.
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
  const isEdit = Boolean(existing);

  // No reminder selected for a new item.
  // For old records with multiple reminders, don't show all of them selected.
  const existingReminders = Array.isArray(existing?.reminders)
    ? existing.reminders
    : [];

  const validPresetReminders = [30, 7, 1];

  let selectedReminder = null;
  let customReminder = '';

  if (existingReminders.length === 1) {
    const value = Number(existingReminders[0]);

    if (validPresetReminders.includes(value)) {
      selectedReminder = value;
    } else if (value > 0) {
      customReminder = value;
    }
  }

  const m = existing || {
    id: crypto.randomUUID(),
    reminders: [],
    notifiedThresholds: []
  };

  const today = todayISO();

  openModal(`
    <div class="modal-title">
      ${isEdit ? 'Edit maintenance' : 'Add home item'}
    </div>

    <form id="maintForm">

      <div class="field">
        <label>Item</label>

        <select name="type" id="typeSelect">
          ${MAINT_TYPES.map(type => `
            <option
              value="${escapeHTML(type)}"
              ${m.type === type ? 'selected' : ''}
            >
              ${escapeHTML(type)}
            </option>
          `).join('')}
        </select>
      </div>

      <div
        class="field"
        id="customNameField"
        style="${m.type === 'Other' ? '' : 'display:none'}"
      >
        <label>Custom name</label>

        <input
          type="text"
          name="itemName"
          value="${escapeHTML(
            m.type === 'Other' ? m.itemName || '' : ''
          )}"
          placeholder="e.g. Water heater"
        >
      </div>

      <div class="field">
        <label>Last serviced date</label>

        <input
          type="date"
          name="lastServiceDate"
          value="${m.lastServiceDate || ''}"
          max="${today}"
        >

        <small>Today or a past date only.</small>
      </div>

      <div class="field">
        <label>Service due date</label>

        <input
          type="date"
          name="nextServiceDate"
          required
          min="${today}"
          value="${m.nextServiceDate || ''}"
        >

        <small>Today or a future date only.</small>
      </div>

      <div class="field">
        <label>Cost (₹)</label>

        <input
          type="number"
          name="cost"
          min="0"
          step="0.01"
          value="${m.cost ?? ''}"
          placeholder="0"
        >
      </div>

      <!-- =========================
           REMINDER
      ========================== -->

      <div class="field">

        <label>Remind me before service</label>

        <div
          class="chip-row"
          id="reminderChipsM"
          role="radiogroup"
          aria-label="Reminder before service"
        >

          <button
            type="button"
            class="chip-toggle ${selectedReminder === 30 ? 'on' : ''}"
            data-val="30"
            aria-pressed="${selectedReminder === 30}"
          >
            30 days
          </button>

          <button
            type="button"
            class="chip-toggle ${selectedReminder === 7 ? 'on' : ''}"
            data-val="7"
            aria-pressed="${selectedReminder === 7}"
          >
            7 days
          </button>

          <button
            type="button"
            class="chip-toggle ${selectedReminder === 1 ? 'on' : ''}"
            data-val="1"
            aria-pressed="${selectedReminder === 1}"
          >
            1 day
          </button>

          <button
            type="button"
            class="chip-toggle ${customReminder ? 'on' : ''}"
            id="customReminderBtn"
            aria-pressed="${customReminder ? 'true' : 'false'}"
          >
            Custom
          </button>

        </div>

        <div
          id="customReminderField"
          style="${customReminder ? '' : 'display:none'}; margin-top:12px;"
        >

          <label
            for="customReminderDays"
            style="display:block; margin-bottom:8px;"
          >
            Custom reminder (days before service)
          </label>

          <input
            type="number"
            id="customReminderDays"
            min="1"
            max="365"
            step="1"
            value="${customReminder || ''}"
            placeholder="e.g. 15"
          >

          <small>
            Enter a number between 1 and 365 days.
          </small>

        </div>

      </div>

      <div class="field">
        <label>Notes</label>

        <textarea
          name="notes"
          placeholder="Optional notes"
        >${escapeHTML(m.notes || '')}</textarea>
      </div>

      <div class="modal-actions">

        ${
          isEdit
            ? '<button type="button" class="btn danger" id="deleteBtn">Delete</button>'
            : ''
        }

        <button
          type="button"
          class="btn"
          id="cancelBtn"
        >
          Cancel
        </button>

        <button
          type="submit"
          class="btn primary"
        >
          Save
        </button>

      </div>

    </form>
  `);

  /* =========================
     REMINDER LOGIC
  ========================== */

  const reminderChips = [
    ...document.querySelectorAll(
      '#reminderChipsM .chip-toggle[data-val]'
    )
  ];

  const customReminderBtn =
    document.getElementById('customReminderBtn');

  const customReminderField =
    document.getElementById('customReminderField');

  const customReminderInput =
    document.getElementById('customReminderDays');

  function clearPresetSelection() {
    reminderChips.forEach(chip => {
      chip.classList.remove('on');
      chip.setAttribute('aria-pressed', 'false');
    });
  }

  function selectPreset(value) {
    clearPresetSelection();

    const chip = reminderChips.find(
      c => Number(c.dataset.val) === Number(value)
    );

    if (chip) {
      chip.classList.add('on');
      chip.setAttribute('aria-pressed', 'true');
    }

    customReminderBtn.classList.remove('on');
    customReminderBtn.setAttribute('aria-pressed', 'false');

    customReminderField.style.display = 'none';
    customReminderInput.value = '';
  }

  function selectCustom() {
    clearPresetSelection();

    customReminderBtn.classList.add('on');
    customReminderBtn.setAttribute('aria-pressed', 'true');

    customReminderField.style.display = '';

    setTimeout(() => {
      customReminderInput.focus();
    }, 50);
  }

  reminderChips.forEach(chip => {

    chip.addEventListener('click', () => {

      const value = Number(chip.dataset.val);

      // Clicking already-selected reminder deselects it.
      if (
        chip.classList.contains('on') &&
        !customReminderBtn.classList.contains('on')
      ) {
        chip.classList.remove('on');
        chip.setAttribute('aria-pressed', 'false');
        return;
      }

      selectPreset(value);
    });

  });

  customReminderBtn.addEventListener('click', () => {

    if (customReminderBtn.classList.contains('on')) {

      customReminderBtn.classList.remove('on');
      customReminderBtn.setAttribute(
        'aria-pressed',
        'false'
      );

      customReminderField.style.display = 'none';
      customReminderInput.value = '';

    } else {

      selectCustom();

    }

  });

  /* =========================
     ITEM TYPE
  ========================== */

  document
    .getElementById('typeSelect')
    .addEventListener('change', e => {

      document.getElementById(
        'customNameField'
      ).style.display =
        e.target.value === 'Other'
          ? ''
          : 'none';

    });

  /* =========================
     CANCEL
  ========================== */

  document
    .getElementById('cancelBtn')
    .addEventListener('click', closeModal);

  /* =========================
     DELETE
  ========================== */

  document
    .getElementById('deleteBtn')
    ?.addEventListener('click', async () => {

      if (!confirm('Delete this maintenance item?')) {
        return;
      }

      try {

        await dbDelete('maintenance', m.id);

        closeModal();

        await render();

      } catch (error) {

        alert(
          `Could not delete item: ${
            error.message || error
          }`
        );

      }

    });

  /* =========================
     SAVE
  ========================== */

  document
    .getElementById('maintForm')
    .addEventListener('submit', async e => {

      e.preventDefault();

      const fd = new FormData(e.target);

      const type = fd.get('type');

      const lastServiceDate =
        fd.get('lastServiceDate');

      const nextServiceDate =
        fd.get('nextServiceDate');

      const cost = fd.get('cost');

      const todayDate =
        new Date(`${today}T00:00:00`);

      /* -------------------------
         Validate last service date
      ------------------------- */

      if (lastServiceDate) {

        const lastDate =
          new Date(`${lastServiceDate}T00:00:00`);

        if (lastDate > todayDate) {

          alert(
            'Last serviced date cannot be in the future.'
          );

          return;
        }

      }

      /* -------------------------
         Validate next service date
      ------------------------- */

      if (!nextServiceDate) {

        alert(
          'Please select a service due date.'
        );

        return;
      }

      const nextDate =
        new Date(`${nextServiceDate}T00:00:00`);

      if (nextDate < todayDate) {

        alert(
          'Service due date cannot be in the past.'
        );

        return;
      }

      if (lastServiceDate) {

        const lastDate =
          new Date(`${lastServiceDate}T00:00:00`);

        if (nextDate <= lastDate) {

          alert(
            'Service due date must be after the last serviced date.'
          );

          return;
        }

      }

      /* -------------------------
         Validate cost
      ------------------------- */

      if (
        cost !== '' &&
        Number(cost) < 0
      ) {

        alert(
          'Service cost cannot be negative.'
        );

        return;
      }

      /* -------------------------
         Determine reminder
      ------------------------- */

      let selectedReminder = null;

      const selectedPreset =
        reminderChips.find(
          chip =>
            chip.classList.contains('on')
        );

      if (selectedPreset) {

        selectedReminder =
          Number(selectedPreset.dataset.val);

      } else if (
        customReminderBtn.classList.contains('on')
      ) {

        const customDays =
          Number(customReminderInput.value);

        if (
          !Number.isInteger(customDays) ||
          customDays < 1 ||
          customDays > 365
        ) {

          alert(
            'Please enter a custom reminder between 1 and 365 days.'
          );

          customReminderInput.focus();

          return;
        }

        selectedReminder = customDays;
      }

      /*
       * No reminder is perfectly valid.
       *
       * [] = customer doesn't want a reminder.
       */

      const reminders =
        selectedReminder === null
          ? []
          : [selectedReminder];

      /* -------------------------
         Item name
      ------------------------- */

      const itemName =
        type === 'Other'
          ? String(
              fd.get('itemName') || ''
            ).trim() || 'Other item'
          : type;

      /* -------------------------
         Record
      ------------------------- */

      const record = {

        id: m.id,

        type,

        itemName,

        lastServiceDate:
          lastServiceDate || null,

        nextServiceDate,

        cost:
          cost === ''
            ? null
            : Number(cost),

        reminders,

        notes:
          String(
            fd.get('notes') || ''
          ).trim(),

        createdAt:
          m.createdAt,

        notifiedThresholds:
          isEdit &&
          m.nextServiceDate === nextServiceDate
            ? (m.notifiedThresholds || [])
            : []

      };

      try {

        await dbPut(
          'maintenance',
          record
        );

        closeModal();

        await render();

      } catch (error) {

        console.error(error);

        alert(
          `Could not save maintenance item: ${
            error.message || error
          }`
        );

      }

    });
}  const chips = Array.from(document.querySelectorAll('#reminderChipsM .chip-toggle'));
  chips.forEach(chip => chip.addEventListener('click', () => chip.classList.toggle('on')));

  document.getElementById('typeSelect').addEventListener('change', (e) => {
    document.getElementById('customNameField').style.display = e.target.value === 'Other' ? '' : 'none';
  });
  document.getElementById('cancelBtn').addEventListener('click', closeModal);
  if (isEdit) {
    document.getElementById('deleteBtn').addEventListener('click', async () => {
      if (confirm('Delete this item?')) { await dbDelete('maintenance', m.id); closeModal(); render(); }
    });
  }
  document.getElementById('maintForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const type = fd.get('type');
    const reminders = chips.filter(c => c.classList.contains('on')).map(c => Number(c.dataset.val));
    const record = {
      id: m.id,
      type,
      itemName: type === 'Other' ? (fd.get('itemName').trim() || 'Other item') : type,
      lastServiceDate: fd.get('lastServiceDate') || null,
      nextServiceDate: fd.get('nextServiceDate'),
      cost: fd.get('cost') ? Number(fd.get('cost')) : null,
      notes: fd.get('notes').trim(),
      reminders,
      notifiedThresholds: isEdit && existing.nextServiceDate === fd.get('nextServiceDate') ? (m.notifiedThresholds||[]) : [],
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
        await notify('Maintenance due', `${m.itemName} service due ${fmtDate(m.nextServiceDate)} (${daysLabel(days)}).`, `maint-${m.id}-${t}`);
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
setView('dashboard');
checkReminders();
setInterval(checkReminders, 6 * 60 * 60 * 1000); // re-check every 6h while app is open
