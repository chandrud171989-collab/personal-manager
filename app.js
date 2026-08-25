/* ---------------- Config ---------------- */
const DOC_CATEGORIES = ['Àadhar','PAN','ID /Driving License','Passport','Voter ID','Warranty','Vehicle RC','Subscription','Property','Education Certificate','Other'];
const MAINT_TYPES = ['AC','RO / Water Purifier','Refrigerator','Washing Machine','Geyser','Vehicle Service','Home Cleaning','Pest Control','Electrical/Plumbing','Other'];
const REMINDER_OPTIONS = [30,7,1];

let state = { view: 'dashboard' };


/* ---------------- Supabase Authentication ---------------- */

let currentUser = null;
let authReady = false;

function getSupabaseClient() {
  if (typeof supabaseClient === 'undefined' || !supabaseClient) {
    return null;
  }
  return supabaseClient;
}

function updateAuthUI(user) {
  const bottomNav = document.querySelector('.bottomnav');
  const notifButton = document.getElementById('notifPermBtn');

  if (notifButton) {
    notifButton.style.display = user ? '' : 'none';
  }

  if (bottomNav) {
    bottomNav.style.display = user ? '' : 'none';
  }

  if (fab) {
    fab.classList.toggle('hidden', !user || state.view === 'dashboard' || state.view === 'finance');
  }

  let logoutBtn = document.getElementById('logoutBtn');

  if (user) {
    if (!logoutBtn) {
      logoutBtn = document.createElement('button');
      logoutBtn.id = 'logoutBtn';
      logoutBtn.className = 'icon-btn';
      logoutBtn.title = 'Logout';
      logoutBtn.setAttribute('aria-label', 'Logout');
      logoutBtn.innerHTML = `
        <svg viewBox="0 0 24 24" width="20" height="20">
          <path fill="currentColor"
            d="M10 17l5-5-5-5v3H3v4h7v3zm8-15H6c-1.1 0-2 .9-2 2v4h2V4h12v16H6v-4H4v4c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/>
        </svg>
      `;
      if (notifButton && notifButton.parentElement) {
        notifButton.parentElement.insertBefore(logoutBtn, notifButton);
      }
    }

    // The HTML already contains #logoutBtn, so bind the handler
    // whether the button was created dynamically or already existed.
    if (!logoutBtn.dataset.logoutBound) {
      logoutBtn.addEventListener('click', logoutUser);
      logoutBtn.dataset.logoutBound = 'true';
    }

    logoutBtn.style.display = '';
  } else if (logoutBtn) {
    logoutBtn.style.display = 'none';
  }
}

function showLoginScreen(mode = 'login', message = '') {
  authReady = true;
  currentUser = null;

  updateAuthUI(null);

  const isRegister = mode === 'register';

  viewEl.innerHTML = `
    <div class="auth-page" style="
      max-width:420px;
      margin:40px auto;
      padding:28px 20px 100px;
    ">
      <div style="
        text-align:center;
        margin-bottom:28px;
      ">
        <div style="
          width:54px;
          height:54px;
          margin:0 auto 14px;
          border-radius:16px;
          background:#2dd4bf;
          display:flex;
          align-items:center;
          justify-content:center;
          color:#12151a;
          font-size:28px;
          font-weight:800;
        ">P</div>

        <h1 style="margin:0 0 8px;">Personal Manager</h1>
        <p style="margin:0;opacity:.7;">
          ${isRegister ? 'Create your account' : 'Welcome back'}
        </p>
      </div>

      ${message ? `
        <div style="
          padding:12px 14px;
          margin-bottom:16px;
          border-radius:10px;
          background:rgba(239,68,68,.12);
          color:#fca5a5;
          font-size:14px;
        ">${escapeHTML(message)}</div>
      ` : ''}

      <form id="authForm">

        ${isRegister ? `
          <div class="field">
            <label>Name</label>
            <input
              type="text"
              id="authName"
              autocomplete="name"
              placeholder="Your name"
              required
            >
          </div>
        ` : ''}

        <div class="field">
          <label>Email</label>
          <input
            type="email"
            id="authEmail"
            autocomplete="email"
            placeholder="you@example.com"
            required
          >
        </div>

        <div class="field">
          <label>Password</label>
          <input
            type="password"
            id="authPassword"
            autocomplete="${isRegister ? 'new-password' : 'current-password'}"
            placeholder="${isRegister ? 'At least 6 characters' : 'Your password'}"
            minlength="6"
            required
          >
        </div>

        ${isRegister ? `
          <div class="field">
            <label>Confirm password</label>
            <input
              type="password"
              id="authConfirmPassword"
              autocomplete="new-password"
              placeholder="Re-enter password"
              minlength="6"
              required
            >
          </div>
        ` : ''}

        <button
          type="submit"
          class="btn primary"
          id="authSubmitBtn"
          style="width:100%;margin-top:8px;"
        >
          ${isRegister ? 'Create Account' : 'Login'}
        </button>

      </form>

      <div style="
        text-align:center;
        margin-top:20px;
        display:flex;
        flex-direction:column;
        gap:12px;
      ">
        ${!isRegister ? `
          <button type="button" class="btn" id="forgotPasswordBtn">
            Forgot Password?
          </button>

          <div style="opacity:.7;font-size:14px;">
            Don't have an account?
          </div>

          <button type="button" class="btn" id="showRegisterBtn">
            Create Account
          </button>
        ` : `
          <div style="opacity:.7;font-size:14px;">
            Already have an account?
          </div>

          <button type="button" class="btn" id="showLoginBtn">
            Back to Login
          </button>
        `}
      </div>
    </div>
  `;

  const form = document.getElementById('authForm');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const client = getSupabaseClient();

    if (!client) {
      alert('Supabase is not configured. Please check supabase-config.js.');
      return;
    }

    const email = document.getElementById('authEmail').value.trim();
    const password = document.getElementById('authPassword').value;

    const submitBtn = document.getElementById('authSubmitBtn');
    submitBtn.disabled = true;
    submitBtn.textContent = isRegister ? 'Creating...' : 'Logging in...';

    try {
      if (isRegister) {
        const name = document.getElementById('authName').value.trim();
        const confirmPassword = document.getElementById('authConfirmPassword').value;

        if (password !== confirmPassword) {
          throw new Error('Passwords do not match.');
        }

        const { data, error } = await client.auth.signUp({
          email,
          password,
          options: {
            data: {
              full_name: name
            }
          }
        });

        if (error) throw error;

        if (data.session) {
          currentUser = data.user;
          state.view = 'dashboard';
          updateAuthUI(currentUser);
          render();
        } else {
          showLoginScreen(
            'login',
            'Account created. Please check your email to confirm your account, then log in.'
          );
        }

      } else {
        const { data, error } = await client.auth.signInWithPassword({
          email,
          password
        });

        if (error) throw error;

        currentUser = data.user;
        state.view = 'dashboard';
        updateAuthUI(currentUser);
        render();
      }

    } catch (error) {
      showLoginScreen(isRegister ? 'register' : 'login', error.message || 'Unable to continue.');
    }
  });

  if (!isRegister) {
    document.getElementById('forgotPasswordBtn').addEventListener('click', async () => {
      const client = getSupabaseClient();

      if (!client) {
        alert('Supabase is not configured. Please check supabase-config.js.');
        return;
      }

      const email = document.getElementById('authEmail').value.trim();

      if (!email) {
        alert('Enter your email address first.');
        return;
      }

      try {
        const redirectTo = window.location.origin + window.location.pathname;

        const { error } = await client.auth.resetPasswordForEmail(email, {
          redirectTo
        });

        if (error) throw error;

        alert('Password reset email sent. Please check your inbox.');
      } catch (error) {
        alert(error.message || 'Unable to send password reset email.');
      }
    });

    document.getElementById('showRegisterBtn').addEventListener('click', () => {
      showLoginScreen('register');
    });

  } else {
    document.getElementById('showLoginBtn').addEventListener('click', () => {
      showLoginScreen('login');
    });
  }
}

async function logoutUser() {
  const client = getSupabaseClient();

  if (!client) return;

  const { error } = await client.auth.signOut();

  if (error) {
    alert(error.message || 'Unable to logout.');
    return;
  }

  currentUser = null;
  state.view = 'dashboard';
  showLoginScreen('login');
}

async function initializeAuth() {
  const client = getSupabaseClient();

  if (!client) {
    showLoginScreen('login', 'Supabase is not configured. Check supabase-config.js.');
    return;
  }

  const { data, error } = await client.auth.getSession();

  if (error) {
    showLoginScreen('login', error.message);
    return;
  }

  currentUser = data.session?.user || null;
  authReady = true;

  if (!currentUser) {
    showLoginScreen('login');
    return;
  }

  updateAuthUI(currentUser);
  setView('dashboard');

  client.auth.onAuthStateChange((event, session) => {
    currentUser = session?.user || null;

    if (!currentUser) {
      state.view = 'dashboard';
      showLoginScreen('login');
    } else {
      updateAuthUI(currentUser);
      if (event === 'SIGNED_IN') {
        state.view = 'dashboard';
      }
      render();
    }
  });
}

/* ---------------- IndexedDB ---------------- */
const DB_NAME = 'personalManagerDB';
const DB_VERSION = 2;
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
    if (!db.objectStoreNames.contains('financeExpenses')) {
      db.createObjectStore('financeExpenses', { keyPath: 'id' });
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
  fab.classList.toggle('hidden', view === 'dashboard' || view === 'finance');
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

    ${maintenanceExpenseSummaryHTML()}
  `;

  bindCardClicks();
  document.getElementById('viewExpenseBtn')?.addEventListener('click', renderMaintenanceExpenseSummary);
  document.getElementById('expenseFromDate')?.addEventListener('change', renderMaintenanceExpenseSummary);
  document.getElementById('expenseToDate')?.addEventListener('change', renderMaintenanceExpenseSummary);

  // Show the summary immediately using the existing maintenance costs.
  await renderMaintenanceExpenseSummary();
}

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
        await render();
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
      await render();
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
    addExpenseBtn.onclick = () => openFinanceExpenseForm(null);
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

/* ---------------- Loan Summary ---------------- */

function calculateLoanTotal() {
  const home = Number(document.getElementById('homeLoanEMI').value) || 0;
  const personal = Number(document.getElementById('personalLoanEMI').value) || 0;
  const car = Number(document.getElementById('carLoanEMI').value) || 0;
  const total = home + personal + car;

  document.getElementById('loanTotalResult').innerHTML = `
    <div class="finance-result">
      <div class="finance-result-row"><span>Home Loan</span><strong>₹${formatFinanceMoney(home)}</strong></div>
      <div class="finance-result-row"><span>Personal Loan</span><strong>₹${formatFinanceMoney(personal)}</strong></div>
      <div class="finance-result-row"><span>Car Loan</span><strong>₹${formatFinanceMoney(car)}</strong></div>
      <div class="finance-result-row finance-highlight"><span>Total Monthly EMI</span><strong>₹${formatFinanceMoney(total)}</strong></div>
    </div>`;
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
      try { await dbDelete('documents', old.id); closeModal(); await render(); }
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

    try { await dbPut('documents', record); closeModal(); await render(); }
    catch (err) { console.error(err); alert(`Could not save document: ${err.message || err}`); }
  });
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
      try { await dbDelete('maintenance', old.id); closeModal(); await render(); }
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
      await render();
    }
    catch (err) {
      console.error(err);
      alert(`Could not save maintenance item: ${err.message || err}`);
    }
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
 * Start authentication first.
 * Dashboard is shown only after a valid Supabase session exists.
 */
initializeAuth();

setInterval(() => {
  if (currentUser) {
    checkReminders();
  }
}, 6 * 60 * 60 * 1000); // re-check every 6h while app is open
