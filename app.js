/* =========================================================
   PERSONAL MANAGER - SUPABASE VERSION
   =========================================================
   Requires in index.html, in this order:
   1) supabase-js CDN
   2) supabase-config.js
   3) app.js

   Supabase tables used:
   - public.documents
   - public.maintenance
   - public.finance (reserved for future saved finance data)
   ========================================================= */

const DOC_CATEGORIES = [
  'Aadhaar', 'PAN', 'ID / Driving License', 'Passport', 'Voter ID',
  'Warranty', 'Vehicle RC', 'Subscription', 'Property',
  'Education Certificate', 'Other'
];

const MAINT_TYPES = [
  'AC', 'RO / Water Purifier', 'Refrigerator', 'Washing Machine',
  'Geyser', 'Vehicle Service', 'Home Cleaning', 'Pest Control',
  'Electrical/Plumbing', 'Other'
];

const REMINDER_OPTIONS = [30, 7, 1];

let state = { view: 'dashboard' };
let currentUser = null;
let viewEl = null;
let fab = null;
let modalRoot = null;
let authListenerStarted = false;

/* =========================================================
   SUPABASE
   ========================================================= */

function getSupabase() {
  if (window.supabaseClient && window.supabaseClient.auth) {
    return window.supabaseClient;
  }

  // Fallback if config created a global named `supabase`.
  if (window.supabase && window.supabase.auth && window.supabase.from) {
    return window.supabase;
  }

  return null;
}

function escapeHTML(value) {
  const div = document.createElement('div');
  div.textContent = value == null ? '' : String(value);
  return div.innerHTML;
}

function showAuthError(message) {
  const el = document.getElementById('authError');
  if (!el) return;
  el.textContent = message || '';
  el.style.display = message ? '' : 'none';
}

function friendlyAuthError(error) {
  const msg = error?.message || 'Something went wrong. Please try again.';

  if (/already registered|already exists|user already registered/i.test(msg)) {
    return 'This email is already registered. Please use Forgot Password to retrieve your account.';
  }

  if (/invalid login credentials/i.test(msg)) {
    return 'Invalid email or password.';
  }

  if (/email rate limit exceeded/i.test(msg)) {
    return 'Email rate limit exceeded. Please wait and try again later.';
  }

  if (/email not confirmed/i.test(msg)) {
    return 'Please verify your email before logging in.';
  }

  return msg;
}

/* =========================================================
   AUTH SCREEN
   ========================================================= */

function renderLoginPage(mode = 'login', message = '') {
  const app = document.getElementById('app');
  if (!app) return;

  const isSignup = mode === 'signup';
  const isReset = mode === 'reset';

  document.body.classList.add('auth-mode');

  // Ensure the application controls cannot remain visible on the auth page.
  app.innerHTML = `
    <div class="auth-page">
      <div class="auth-logo">P</div>
      <h1>Personal Manager</h1>
      <p class="auth-subtitle">
        ${isReset ? 'Reset your password' : isSignup ? 'Create your account' : 'Welcome back'}
      </p>

      <div id="authError" class="auth-error" style="${message ? '' : 'display:none'}">
        ${escapeHTML(message)}
      </div>

      ${isSignup ? `
        <div class="field">
          <label>NAME</label>
          <input id="authName" type="text" placeholder="Your name" autocomplete="name">
        </div>
      ` : ''}

      <div class="field">
        <label>EMAIL</label>
        <input id="authEmail" type="email" placeholder="you@example.com" autocomplete="email">
      </div>

      ${!isReset ? `
        <div class="field">
          <label>PASSWORD</label>
          <input id="authPassword" type="password"
                 placeholder="At least 6 characters"
                 autocomplete="${isSignup ? 'new-password' : 'current-password'}">
        </div>
      ` : ''}

      ${isSignup ? `
        <div class="field">
          <label>CONFIRM PASSWORD</label>
          <input id="authConfirmPassword" type="password"
                 placeholder="Re-enter password" autocomplete="new-password">
        </div>
      ` : ''}

      <button class="btn primary auth-main-btn" id="authSubmitBtn" type="button">
        ${isReset ? 'Send Reset Email' : isSignup ? 'Create Account' : 'Login'}
      </button>

      ${!isReset ? `
        <button class="btn auth-secondary-btn" id="authResetBtn" type="button">
          Forgot Password?
        </button>
        <div class="auth-switch">
          ${isSignup ? 'Already have an account?' : "Don't have an account?"}
        </div>
        <button class="btn auth-secondary-btn" id="authSwitchBtn" type="button">
          ${isSignup ? 'Login' : 'Create Account'}
        </button>
      ` : `
        <button class="btn auth-secondary-btn" id="authBackBtn" type="button">
          Back to Login
        </button>
      `}
    </div>
  `;

  const submitBtn = document.getElementById('authSubmitBtn');
  const emailInput = document.getElementById('authEmail');

  submitBtn.addEventListener('click', async () => {
    const client = getSupabase();

    if (!client) {
      showAuthError('Login/Create new account.');
      return;
    }

    const email = emailInput.value.trim();

    if (!email) {
      showAuthError('Please enter your email address.');
      return;
    }

    submitBtn.disabled = true;
    const originalText = submitBtn.textContent;
    submitBtn.textContent = isReset ? 'Sending...' : isSignup ? 'Creating...' : 'Logging in...';

    try {
      if (isReset) {
        const redirectUrl = window.location.origin + window.location.pathname;
        const { error } = await client.auth.resetPasswordForEmail(email, {
          redirectTo: redirectUrl
        });
        if (error) throw error;
        showAuthError('Password reset email sent. Please check your inbox.');
        return;
      }

      const password = document.getElementById('authPassword').value;

      if (password.length < 6) {
        showAuthError('Password must be at least 6 characters.');
        return;
      }

      if (isSignup) {
        const name = document.getElementById('authName').value.trim();
        const confirmPassword = document.getElementById('authConfirmPassword').value;

        if (!name) {
          showAuthError('Please enter your name.');
          return;
        }

        if (password !== confirmPassword) {
          showAuthError('Passwords do not match.');
          return;
        }

        const { data, error } = await client.auth.signUp({
          email,
          password,
          options: {
            data: { name }
          }
        });

        if (error) throw error;

        if (data.session && data.user) {
          currentUser = data.user;
          await startApp();
        } else {
          showAuthError('Account created. Please check your email to verify your account, then log in.');
        }
      } else {
        const { data, error } = await client.auth.signInWithPassword({
          email,
          password
        });

        if (error) throw error;

        currentUser = data.user;
        await startApp();
      }
    } catch (error) {
      showAuthError(friendlyAuthError(error));
    } finally {
      if (document.getElementById('authSubmitBtn')) {
        document.getElementById('authSubmitBtn').disabled = false;
        document.getElementById('authSubmitBtn').textContent = originalText;
      }
    }
  });

  document.getElementById('authResetBtn')?.addEventListener('click', () => {
    renderLoginPage('reset');
  });

  document.getElementById('authSwitchBtn')?.addEventListener('click', () => {
    renderLoginPage(isSignup ? 'login' : 'signup');
  });

  document.getElementById('authBackBtn')?.addEventListener('click', () => {
    renderLoginPage('login');
  });

  emailInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') submitBtn.click();
  });

  document.getElementById('authPassword')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') submitBtn.click();
  });
}

async function logout() {
  const client = getSupabase();
  currentUser = null;

  if (client) {
    const { error } = await client.auth.signOut();
    if (error) console.error('Logout error:', error);
  }

  closeModal();
  renderLoginPage('login');
}

/* =========================================================
   DATABASE MAPPING
   =========================================================
   The SQL tables use snake_case names. The UI uses camelCase.
   These functions keep that difference in one place.
   ========================================================= */

function documentToDb(doc) {
  // Keep this mapping exactly aligned with public.documents:
  // id, user_id, category, name, issue_date, expiry_date, notes,
  // file_path, created_at, updated_at, file_name, file_type, file_size
  return {
    id: doc.id,
    user_id: currentUser.id,
    category: doc.category || 'Other',
    name: doc.name || '',
    issue_date: doc.issueDate || null,
    expiry_date: doc.expiryDate || null,
    notes: doc.notes || null,
    file_path: doc.filePath || null,
    file_name: doc.fileName || null,
    file_type: doc.fileType || null,
    file_size: doc.fileSize || null,
    created_at: doc.createdAt || undefined,
    updated_at: new Date().toISOString()
  };
}

function documentFromDb(row) {
  return {
    id: row.id,
    name: row.name || '',
    category: row.category || 'Other',
    issueDate: row.issue_date || '',
    expiryDate: row.expiry_date || '',
    // reminder_days is not currently in public.documents.
    // The UI keeps the standard reminder choices until a reminder_days
    // column is added to the table.
    reminders: [30, 7, 1],
    notes: row.notes || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    fileName: row.file_name || null,
    fileType: row.file_type || null,
    filePath: row.file_path || null,
    fileSize: row.file_size || null,
    notifiedThresholds: []
  };
}

function maintenanceToDb(item) {
  return {
    id: item.id,
    user_id: currentUser.id,
    item_name: item.itemName || item.type || 'Other item',
    category: item.type || 'Other',
    last_service_date: item.lastServiceDate || null,
    next_service_date: item.nextServiceDate,
    reminder_days: Array.isArray(item.reminders) && item.reminders.length ? Math.min(...item.reminders) : 7,
    notes: [
      item.notes || '',
      item.cost != null && item.cost !== '' ? `Service cost: ₹${item.cost}` : ''
    ].filter(Boolean).join('\n') || null,
    created_at: item.createdAt || undefined,
    updated_at: new Date().toISOString()
  };
}

function maintenanceFromDb(row) {
  let notes = row.notes || '';
  let cost = null;

  const costMatch = notes.match(/(?:^|\n)Service cost:\s*₹([\d.]+)/i);
  if (costMatch) {
    cost = Number(costMatch[1]);
    notes = notes.replace(/(?:^|\n)Service cost:\s*₹[\d.]+/i, '').trim();
  }

  return {
    id: row.id,
    type: row.category || 'Other',
    itemName: row.item_name || row.category || 'Other item',
    lastServiceDate: row.last_service_date || '',
    nextServiceDate: row.next_service_date || '',
    reminders: row.reminder_days ? [Number(row.reminder_days)] : [30, 7, 1],
    cost,
    notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    notifiedThresholds: []
  };
}

const STORAGE_BUCKET = 'documents';
const MAX_DOCUMENT_FILE_SIZE = 6 * 1024 * 1024;
const ALLOWED_DOCUMENT_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png'
]);

function sanitizeFileName(name) {
  return String(name || 'file')
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .replace(/^\.+/, '')
    .slice(0, 120) || 'file';
}

function validateDocumentFile(file) {
  if (!file) return;

  if (!ALLOWED_DOCUMENT_TYPES.has(file.type)) {
    throw new Error('Only PDF, JPG, JPEG and PNG files are allowed.');
  }

  if (file.size > MAX_DOCUMENT_FILE_SIZE) {
    throw new Error('File size must be 6 MB or less.');
  }
}

function documentStoragePath(documentId, fileName) {
  return `${currentUser.id}/${documentId}/${sanitizeFileName(fileName)}`;
}

async function uploadDocumentFile(file, documentId) {
  const client = getSupabase();

  if (!client || !currentUser) {
    throw new Error('You are not logged in.');
  }

  validateDocumentFile(file);

  const path = documentStoragePath(documentId, file.name);

  const { error } = await client.storage
    .from(STORAGE_BUCKET)
    .upload(path, file, {
      contentType: file.type,
      upsert: false
    });

  if (error) {
    console.error('Document upload error:', error);
    throw new Error(`Could not upload file: ${error.message}`);
  }

  return {
    fileName: file.name,
    fileType: file.type,
    filePath: path,
    fileSize: file.size
  };
}

async function deleteDocumentFile(filePath) {
  if (!filePath) return;

  const client = getSupabase();
  if (!client) return;

  const { error } = await client.storage
    .from(STORAGE_BUCKET)
    .remove([filePath]);

  if (error) {
    console.warn('Storage delete warning:', error);
  }
}

async function getDocumentFileUrl(filePath) {
  const client = getSupabase();

  if (!client || !filePath) return null;

  const { data, error } = await client.storage
    .from(STORAGE_BUCKET)
    .createSignedUrl(filePath, 60 * 10);

  if (error) {
    console.error('Signed URL error:', error);
    throw new Error(`Could not open file: ${error.message}`);
  }

  return data?.signedUrl || null;
}

async function dbGetAll(table) {
  const client = getSupabase();
  if (!client || !currentUser) return [];

  const { data, error } = await client
    .from(table)
    .select('*')
    .eq('user_id', currentUser.id)
    .order('created_at', { ascending: false });

  if (error) {
    console.error(`${table} read error:`, error);
    return [];
  }

  if (table === 'documents') return (data || []).map(documentFromDb);
  if (table === 'maintenance') return (data || []).map(maintenanceFromDb);
  return data || [];
}

async function dbPut(table, obj) {
  const client = getSupabase();
  if (!client || !currentUser) throw new Error('You are not logged in.');

  let payload;

  if (table === 'documents') {
    payload = documentToDb(obj);
  } else if (table === 'maintenance') {
    payload = maintenanceToDb(obj);
  } else {
    payload = { ...obj, user_id: currentUser.id };
  }

  // Do not send undefined values to PostgREST.
  Object.keys(payload).forEach(key => {
    if (payload[key] === undefined) delete payload[key];
  });

  const { data, error } = await client
    .from(table)
    .upsert(payload, { onConflict: 'id' })
    .select()
    .single();

  if (error) {
    console.error(`${table} save error:`, error);
    throw error;
  }

  if (table === 'documents') return documentFromDb(data);
  if (table === 'maintenance') return maintenanceFromDb(data);
  return data;
}

async function dbDelete(table, id) {
  const client = getSupabase();
  if (!client || !currentUser) throw new Error('You are not logged in.');

  let oldFilePath = null;

  if (table === 'documents') {
    const { data: existing, error: readError } = await client
      .from('documents')
      .select('file_path')
      .eq('id', id)
      .eq('user_id', currentUser.id)
      .maybeSingle();

    if (readError) throw readError;
    oldFilePath = existing?.file_path || null;
  }

  const { error } = await client
    .from(table)
    .delete()
    .eq('id', id)
    .eq('user_id', currentUser.id);

  if (error) {
    console.error(`${table} delete error:`, error);
    throw error;
  }

  if (table === 'documents' && oldFilePath) {
    await deleteDocumentFile(oldFilePath);
  }
}

/* =========================================================
   APP SHELL / AUTH GATE
   ========================================================= */

function showAppShell() {
  const app = document.getElementById('app');
  if (!app) return;

  document.body.classList.remove('auth-mode');

  // Restore the original shell after the login screen replaced it.
  app.innerHTML = `
    <header class="topbar">
      <div class="topbar-brand">
        <span class="brand-mark"></span>
        <span class="brand-name">Personal Manager</span>
      </div>

      <div class="topbar-actions">
        <button id="notifPermBtn" class="icon-btn" title="Enable notifications" aria-label="Enable notifications" type="button">
          <svg viewBox="0 0 24 24" width="20" height="20">
            <path fill="currentColor" d="M12 22a2.5 2.5 0 0 0 2.45-2h-4.9A2.5 2.5 0 0 0 12 22zm7-6.2V11c0-3.4-1.8-6.2-5-6.9V3a2 2 0 0 0-4 0v1.1C6.8 4.8 5 7.6 5 11v4.8L3 17.8V19h18v-1.2z"/>
          </svg>
        </button>

        <button id="logoutBtn" class="logout-btn" type="button" title="Logout">
          <span class="logout-icon">↪</span>
          <span>Logout</span>
        </button>
      </div>
    </header>

    <main id="view" class="view"></main>

    <button id="fab" class="fab hidden" aria-label="Add new" type="button">
      <svg viewBox="0 0 24 24" width="26" height="26">
        <path fill="currentColor" d="M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6z"/>
      </svg>
    </button>

    <nav class="bottomnav">
      <button class="navbtn active" data-view="dashboard" type="button">
        <svg viewBox="0 0 24 24" width="22" height="22"><path fill="currentColor" d="M3 13h8V3H3zm0 8h8v-6H3zm10 0h8V11h-8zm0-18v6h8V3z"/></svg>
        <span>Dashboard</span>
      </button>

      <button class="navbtn" data-view="documents" type="button">
        <svg viewBox="0 0 24 24" width="22" height="22"><path fill="currentColor" d="M6 2c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6H6zm7 7V3.5L18.5 9H13z"/></svg>
        <span>Documents</span>
      </button>

      <button class="navbtn" data-view="maintenance" type="button">
        <svg viewBox="0 0 24 24" width="22" height="22"><path fill="currentColor" d="M22.7 19l-9.1-9.1c.9-2.3.4-5-1.5-6.9-2-2-5-2.4-7.4-1.3L9 6l-3 3-4.3-4.3C.6 7.1 1 10.1 3 12.1c1.9 1.9 4.6 2.4 6.9 1.5l9.1 9.1c.4.4 1 .4 1.4 0l2.3-2.3c.4-.4.4-1 0-1.4z"/></svg>
        <span>Maintenance</span>
      </button>

      <button class="navbtn" data-view="finance" type="button">
        <svg viewBox="0 0 24 24" width="22" height="22"><path fill="currentColor" d="M12 2C6.48 2 2 5.58 2 10c0 3.1 2.1 5.8 5.2 7.1L6 22l5-3.2c.33.03.66.05 1 .05 5.52 0 10-3.58 10-8.85C22 5.58 17.52 2 12 2z"/></svg>
        <span>Finance</span>
      </button>
    </nav>
  `;

  viewEl = document.getElementById('view');
  fab = document.getElementById('fab');
  modalRoot = document.getElementById('modalRoot');
}

function updateFab() {
  if (!fab) return;

  // + is intentionally available only on Documents and Maintenance.
  const show = currentUser && (state.view === 'documents' || state.view === 'maintenance');
  fab.classList.toggle('hidden', !show);
}

function bindAppEvents() {
  document.querySelectorAll('.navbtn').forEach(btn => {
    btn.onclick = () => setView(btn.dataset.view);
  });

  document.getElementById('fab')?.addEventListener('click', () => {
    if (state.view === 'documents') openDocumentForm(null);
    if (state.view === 'maintenance') openMaintenanceForm(null);
  });

  document.getElementById('logoutBtn')?.addEventListener('click', logout);
  document.getElementById('notifPermBtn')?.addEventListener('click', requestNotifPermission);
}

async function startApp() {
  if (!currentUser) {
    renderLoginPage('login');
    return;
  }

  showAppShell();
  bindAppEvents();
  updateFab();
  updateNotifBtn();

  await render();
  await checkReminders();
}

async function initAuth() {
  const client = getSupabase();

  if (!client) {
    renderLoginPage('login', 'login', 'Login/Create new account.');
    return;
  }

  if (!authListenerStarted) {
    authListenerStarted = true;

    client.auth.onAuthStateChange((event, session) => {
      currentUser = session?.user || null;

      // Avoid doing large async work directly inside the auth callback.
      setTimeout(async () => {
        if (currentUser) {
          await startApp();
        } else if (event === 'SIGNED_OUT') {
          closeModal();
          renderLoginPage('login');
        }
      }, 0);
    });
  }

  const { data, error } = await client.auth.getSession();

  if (error) {
    renderLoginPage('login', friendlyAuthError(error));
    return;
  }

  currentUser = data.session?.user || null;

  if (currentUser) {
    await startApp();
  } else {
    // IMPORTANT: unauthenticated users see Login first.
    renderLoginPage('login');
  }
}

/* =========================================================
   NAVIGATION / DATES
   ========================================================= */

function setView(view) {
  if (!currentUser) {
    renderLoginPage('login');
    return;
  }

  state.view = view;

  document.querySelectorAll('.navbtn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.view === view);
  });

  updateFab();
  render();
}

function daysUntil(dateStr) {
  if (!dateStr) return null;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const target = new Date(`${dateStr}T00:00:00`);
  return Math.round((target - today) / 86400000);
}

function statusClass(days) {
  if (days == null) return 'green';
  if (days < 0) return 'red';
  if (days <= 7) return 'red';
  if (days <= 30) return 'amber';
  return 'green';
}

function daysLabel(days) {
  if (days == null) return '—';
  if (days < 0) return `${Math.abs(days)}d overdue`;
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  return `in ${days}d`;
}

function fmtDate(dateStr) {
  if (!dateStr) return '—';
  const date = new Date(`${dateStr}T00:00:00`);
  return date.toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric'
  });
}

/* =========================================================
   RENDERING
   ========================================================= */

async function render() {
  if (!currentUser || !viewEl) return;

  try {
    if (state.view === 'dashboard') return await renderDashboard();
    if (state.view === 'documents') return await renderDocuments();
    if (state.view === 'maintenance') return await renderMaintenance();
    if (state.view === 'finance') return renderFinance();
  } catch (error) {
    console.error('Render error:', error);
    viewEl.innerHTML = `
      <div class="empty" style="margin-top:30px;">
        Unable to load this section. Please refresh and try again.
      </div>
    `;
  }
}

function emptyHTML(message) {
  return `<div class="empty">${escapeHTML(message)}</div>`;
}

function cardHTML(item) {
  const isDocument = item._kind === 'document';
  const days = item._days;
  const cls = statusClass(days);
  const title = isDocument ? item.name : (item.itemName || item.type || 'Maintenance item');
  const sub = isDocument
    ? `${item.category || 'Document'} · expires ${fmtDate(item.expiryDate)}`
    : `${item.type || 'Maintenance'} · next service ${fmtDate(item.nextServiceDate)}`;

  return `
    <div class="card status-${cls}" data-kind="${isDocument ? 'document' : 'maintenance'}" data-id="${escapeHTML(item.id)}">
      <div class="card-body">
        <div class="card-title">${escapeHTML(title)}</div>
        <div class="card-sub">${escapeHTML(sub)}</div>
      </div>
      <div class="card-chip chip-${cls}">${escapeHTML(daysLabel(days))}</div>
    </div>
  `;
}

function bindCardClicks() {
  viewEl.querySelectorAll('.card').forEach(card => {
    card.addEventListener('click', async () => {
      const kind = card.dataset.kind;
      const id = card.dataset.id;
      const table = kind === 'document' ? 'documents' : 'maintenance';
      const all = await dbGetAll(table);
      const item = all.find(row => row.id === id);
      if (item) openDetail(kind, item);
    });
  });
}

async function renderDashboard() {
  const [docs, maintenance] = await Promise.all([
    dbGetAll('documents'),
    dbGetAll('maintenance')
  ]);

  const docItems = docs.map(d => ({
    ...d, _days: daysUntil(d.expiryDate), _kind: 'document'
  }));

  const maintItems = maintenance.map(m => ({
    ...m, _days: daysUntil(m.nextServiceDate), _kind: 'maintenance'
  }));

  const allItems = [...docItems, ...maintItems];
  const expiringDocs = docItems
    .filter(d => d._days != null && d._days <= 30)
    .sort((a, b) => a._days - b._days);

  const dueMaintenance = maintItems
    .filter(m => m._days != null && m._days <= 30)
    .sort((a, b) => a._days - b._days);

  const upcoming = allItems
    .filter(x => x._days != null && x._days >= 0 && x._days <= 30)
    .sort((a, b) => a._days - b._days)
    .slice(0, 8);

  const overdueCount = allItems.filter(x => x._days != null && x._days < 0).length;
  const soonCount = allItems.filter(x => x._days != null && x._days >= 0 && x._days <= 7).length;

  viewEl.innerHTML = `
    <div class="stats">
      <div class="stat-card red">
        <div class="stat-num">${overdueCount}</div>
        <div class="stat-label">Overdue</div>
      </div>
      <div class="stat-card amber">
        <div class="stat-num">${soonCount}</div>
        <div class="stat-label">Due in 7 days</div>
      </div>
      <div class="stat-card teal">
        <div class="stat-num">${allItems.length}</div>
        <div class="stat-label">Total tracked</div>
      </div>
    </div>

    <div class="section">
      <div class="section-head">
        <span class="section-title">Upcoming reminders</span>
        <span class="section-count">${upcoming.length}</span>
      </div>
      ${upcoming.length ? upcoming.map(cardHTML).join('') : emptyHTML('Nothing due in the next month.')}
    </div>

    <div class="section">
      <div class="section-head">
        <span class="section-title">Expiring documents</span>
        <span class="section-count">${expiringDocs.length}</span>
      </div>
      ${expiringDocs.length ? expiringDocs.map(cardHTML).join('') : emptyHTML('No documents expiring soon.')}
    </div>

    <div class="section">
      <div class="section-head">
        <span class="section-title">Maintenance due</span>
        <span class="section-count">${dueMaintenance.length}</span>
      </div>
      ${dueMaintenance.length ? dueMaintenance.map(cardHTML).join('') : emptyHTML('Nothing needs servicing soon.')}
    </div>
  `;

  bindCardClicks();
}

async function renderDocuments() {
  const docs = (await dbGetAll('documents'))
    .map(d => ({ ...d, _days: daysUntil(d.expiryDate), _kind: 'document' }))
    .sort((a, b) => (a._days ?? 999999) - (b._days ?? 999999));

  viewEl.innerHTML = `
    <div class="section" style="margin-top:8px;">
      <div class="section-head">
        <span class="section-title">All documents</span>
        <span class="section-count">${docs.length}</span>
      </div>
      ${docs.length ? docs.map(cardHTML).join('') : emptyHTML('No documents yet. Tap + to add one.')}
    </div>
  `;

  bindCardClicks();
}

async function renderMaintenance() {
  const items = (await dbGetAll('maintenance'))
    .map(m => ({ ...m, _days: daysUntil(m.nextServiceDate), _kind: 'maintenance' }))
    .sort((a, b) => (a._days ?? 999999) - (b._days ?? 999999));

  viewEl.innerHTML = `
    <div class="section" style="margin-top:8px;">
      <div class="section-head">
        <span class="section-title">Maintenance</span>
        <span class="section-count">${items.length}</span>
      </div>
      ${items.length ? items.map(cardHTML).join('') : emptyHTML('No maintenance items yet. Tap + to add one.')}
    </div>
  `;

  bindCardClicks();
}

/* =========================================================
   FINANCE / SALARY CALCULATOR
   No + button here by design.
   ========================================================= */

function renderFinance() {
  viewEl.innerHTML = `
    <div class="finance-page">
      <div class="finance-header">
        <h2>Salary & Finance</h2>
        <p>Calculate salary, deductions and loan EMI.</p>
      </div>

      <div class="finance-card">
        <div class="finance-section-title">Salary Calculator</div>

        <div class="field">
          <label>Annual CTC (₹)</label>
          <input id="financeCTC" type="number" min="0" step="1000" placeholder="e.g. 1200000">
        </div>

        <div class="field">
          <label>Basic Salary (annual ₹)</label>
          <input id="financeBasic" type="number" min="0" step="1000" placeholder="e.g. 480000">
        </div>

        <div class="field">
          <label>HRA (annual ₹)</label>
          <input id="financeHRA" type="number" min="0" step="1000" placeholder="e.g. 240000">
        </div>

        <div class="field">
          <label>Special Allowance (annual ₹)</label>
          <input id="financeAllowance" type="number" min="0" step="1000" placeholder="e.g. 180000">
        </div>

        <div class="field">
          <label>Variable Pay / Bonus (annual ₹)</label>
          <input id="financeVariable" type="number" min="0" step="1000" placeholder="e.g. 60000">
        </div>

        <div class="finance-section-title">Deductions</div>

        <div class="field">
          <label>PF (annual ₹)</label>
          <input id="financePF" type="number" min="0" step="1000" placeholder="e.g. 57600">
        </div>

        <div class="field">
          <label>Professional Tax (annual ₹)</label>
          <input id="financePT" type="number" min="0" step="100" placeholder="e.g. 2400">
        </div>

        <div class="field">
          <label>TDS (annual ₹)</label>
          <input id="financeTDS" type="number" min="0" step="1000" placeholder="e.g. 100000">
        </div>

        <div class="field">
          <label>Other Deductions (annual ₹)</label>
          <input id="financeOtherDeduction" type="number" min="0" step="1000" placeholder="0">
        </div>

        <button class="btn primary finance-calculate" id="financeSalaryCalculate" type="button">
          Calculate Salary
        </button>

        <div id="salaryResult"></div>
      </div>

      <div class="finance-card">
        <div class="finance-section-title">EMI Calculator</div>

        <div class="field">
          <label>Loan Amount (₹)</label>
          <input id="financeLoan" type="number" min="0" step="1000" placeholder="e.g. 1000000">
        </div>

        <div class="field">
          <label>Annual Interest Rate (%)</label>
          <input id="financeInterest" type="number" min="0" step="0.01" placeholder="e.g. 8.5">
        </div>

        <div class="field">
          <label>Tenure (years)</label>
          <input id="financeYears" type="number" min="1" step="1" placeholder="e.g. 5">
        </div>

        <button class="btn primary finance-calculate" id="financeEmiCalculate" type="button">
          Calculate EMI
        </button>

        <div id="emiResult"></div>
      </div>

      <div class="finance-card">
        <div class="finance-section-title">Loan Total</div>

        <div class="field">
          <label>Monthly EMI (₹)</label>
          <input id="financeLoanTotalEmi" type="number" min="0" step="100" placeholder="Enter EMI">
        </div>

        <div class="field">
          <label>Number of Months</label>
          <input id="financeLoanTotalMonths" type="number" min="1" step="1" placeholder="e.g. 60">
        </div>

        <button class="btn primary finance-calculate" id="financeLoanTotalCalculate" type="button">
          Calculate Total Payment
        </button>

        <div id="loanTotalResult"></div>
      </div>
    </div>
  `;

  document.getElementById('financeSalaryCalculate').addEventListener('click', calculateSalary);
  document.getElementById('financeEmiCalculate').addEventListener('click', calculateEMI);
  document.getElementById('financeLoanTotalCalculate').addEventListener('click', calculateLoanTotal);
}

function num(id) {
  return Number(document.getElementById(id)?.value) || 0;
}

function formatFinanceMoney(value) {
  return Math.round(value).toLocaleString('en-IN');
}

function calculateSalary() {
  const ctc = num('financeCTC');
  const basic = num('financeBasic');
  const hra = num('financeHRA');
  const allowance = num('financeAllowance');
  const variable = num('financeVariable');
  const pf = num('financePF');
  const pt = num('financePT');
  const tds = num('financeTDS');
  const other = num('financeOtherDeduction');

  const gross = basic + hra + allowance + variable;
  const totalDeductions = pf + pt + tds + other;
  const netAnnual = gross - totalDeductions;
  const netMonthly = netAnnual / 12;
  const grossMonthly = gross / 12;
  const ctcDifference = ctc - gross;

  document.getElementById('salaryResult').innerHTML = `
    <div class="finance-result">
      <div class="finance-result-heading">Salary Summary</div>
      <div class="finance-result-row"><span>Annual CTC</span><strong>₹${formatFinanceMoney(ctc)}</strong></div>
      <div class="finance-result-row"><span>Annual Gross</span><strong>₹${formatFinanceMoney(gross)}</strong></div>
      <div class="finance-result-row"><span>Monthly Gross</span><strong>₹${formatFinanceMoney(grossMonthly)}</strong></div>
      <div class="finance-result-row"><span>PF</span><strong>₹${formatFinanceMoney(pf)}</strong></div>
      <div class="finance-result-row"><span>Professional Tax</span><strong>₹${formatFinanceMoney(pt)}</strong></div>
      <div class="finance-result-row"><span>TDS</span><strong>₹${formatFinanceMoney(tds)}</strong></div>
      <div class="finance-result-row"><span>Other Deductions</span><strong>₹${formatFinanceMoney(other)}</strong></div>
      <div class="finance-result-row"><span>Total Deductions</span><strong>₹${formatFinanceMoney(totalDeductions)}</strong></div>
      <div class="finance-result-row finance-highlight"><span>Net Annual Salary</span><strong>₹${formatFinanceMoney(netAnnual)}</strong></div>
      <div class="finance-result-row finance-highlight"><span>Estimated Monthly Take Home</span><strong>₹${formatFinanceMoney(netMonthly)}</strong></div>
      ${ctcDifference > 0 ? `<div class="finance-note">CTC includes approximately ₹${formatFinanceMoney(ctcDifference)} outside the salary components entered above.</div>` : ''}
    </div>
  `;
}

function calculateEMI() {
  const principal = num('financeLoan');
  const annualRate = num('financeInterest');
  const years = num('financeYears');

  if (!principal || !years) {
    alert('Please enter loan amount and tenure.');
    return;
  }

  const months = years * 12;
  const monthlyRate = annualRate / 12 / 100;
  let emi;

  if (monthlyRate === 0) {
    emi = principal / months;
  } else {
    const factor = Math.pow(1 + monthlyRate, months);
    emi = principal * monthlyRate * factor / (factor - 1);
  }

  const totalPayment = emi * months;
  const totalInterest = totalPayment - principal;

  document.getElementById('emiResult').innerHTML = `
    <div class="finance-result">
      <div class="finance-result-row finance-highlight"><span>Monthly EMI</span><strong>₹${formatFinanceMoney(emi)}</strong></div>
      <div class="finance-result-row"><span>Total Payment</span><strong>₹${formatFinanceMoney(totalPayment)}</strong></div>
      <div class="finance-result-row"><span>Total Interest</span><strong>₹${formatFinanceMoney(totalInterest)}</strong></div>
      <div class="finance-result-row"><span>Number of Payments</span><strong>${months}</strong></div>
    </div>
  `;
}

function calculateLoanTotal() {
  const emi = num('financeLoanTotalEmi');
  const months = num('financeLoanTotalMonths');

  if (!emi || !months) {
    alert('Please enter EMI and number of months.');
    return;
  }

  const total = emi * months;

  document.getElementById('loanTotalResult').innerHTML = `
    <div class="finance-result">
      <div class="finance-result-row"><span>Monthly EMI</span><strong>₹${formatFinanceMoney(emi)}</strong></div>
      <div class="finance-result-row"><span>Number of Months</span><strong>${months}</strong></div>
      <div class="finance-result-row finance-highlight"><span>Total Payment</span><strong>₹${formatFinanceMoney(total)}</strong></div>
    </div>
  `;
}

/* =========================================================
   MODALS
   ========================================================= */

function closeModal() {
  const root = document.getElementById('modalRoot');
  if (root) root.innerHTML = '';
}

function openModal(html) {
  const root = document.getElementById('modalRoot');
  if (!root) return;

  root.innerHTML = `
    <div class="modal-backdrop" id="backdrop">
      <div class="modal-sheet">${html}</div>
    </div>
  `;

  document.getElementById('backdrop')?.addEventListener('click', e => {
    if (e.target.id === 'backdrop') closeModal();
  });
}

/* =========================================================
   DOCUMENT FORM
   ========================================================= */

function openDocumentForm(existing) {
  const isEdit = Boolean(existing);
  const d = existing || {
    id: crypto.randomUUID(),
    reminders: [30, 7, 1],
    notifiedThresholds: []
  };

  openModal(`
    <div class="modal-title">${isEdit ? 'Edit document' : 'Add document'}</div>
    <form id="docForm">
      <div class="field">
        <label>Document name</label>
        <input type="text" name="name" required value="${escapeHTML(d.name || '')}" placeholder="e.g. Car insurance">
      </div>

      <div class="field">
        <label>Category</label>
        <select name="category">
          ${DOC_CATEGORIES.map(category => `
            <option value="${escapeHTML(category)}" ${d.category === category ? 'selected' : ''}>${escapeHTML(category)}</option>
          `).join('')}
        </select>
      </div>

      <div class="field">
        <label>Issue date</label>
        <input type="date" name="issueDate" value="${d.issueDate || ''}">
      </div>

      <div class="field">
        <label>Expiry date</label>
        <input type="date" name="expiryDate" required value="${d.expiryDate || ''}">
      </div>

      <div class="field">
        <label>Remind me before expiry</label>
        <div class="chip-row" id="reminderChips">
          ${REMINDER_OPTIONS.map(n => `
            <button type="button" class="chip-toggle ${d.reminders?.includes(n) ? 'on' : ''}" data-val="${n}">
              ${n} day${n > 1 ? 's' : ''}
            </button>
          `).join('')}
        </div>
      </div>

      <div class="field">
        <label>Notes</label>
        <textarea name="notes" placeholder="Optional notes">${escapeHTML(d.notes || '')}</textarea>
      </div>

      <div class="field">
        <label>Photo / PDF</label>
        <div class="filepick">
          <span class="filepick-name" id="fileName">${escapeHTML(d.fileName || 'No file attached')}</span>
          <button type="button" class="filepick-btn" id="filePickBtn">Choose</button>
          <input type="file" id="fileInput" accept="application/pdf,image/jpeg,image/png" hidden>
        </div>

        <div id="fileActions" style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px;">
          ${d.filePath ? '<button type="button" class="btn" id="viewSelectedFileBtn">View file</button>' : ''}
          ${d.filePath ? '<button type="button" class="btn danger" id="removeFileBtn">Remove File</button>' : ''}
        </div>

        <small>PDF, JPG or PNG · Maximum 6 MB</small>
      </div>

      <div class="modal-actions">
        ${isEdit ? '<button type="button" class="btn danger" id="deleteBtn">Delete</button>' : ''}
        <button type="button" class="btn" id="cancelBtn">Cancel</button>
        <button type="submit" class="btn primary">Save</button>
      </div>
    </form>
  `);

  const chips = [...document.querySelectorAll('#reminderChips .chip-toggle')];
  chips.forEach(chip => {
    chip.addEventListener('click', () => chip.classList.toggle('on'));
  });

  const fileInput = document.getElementById('fileInput');
  const filePickBtn = document.getElementById('filePickBtn');
  const fileNameEl = document.getElementById('fileName');
  const fileActions = document.getElementById('fileActions');

  let selectedFile = null;
  let removeExistingFile = false;

  filePickBtn?.addEventListener('click', () => fileInput?.click());

  fileInput?.addEventListener('change', () => {
    const file = fileInput.files?.[0] || null;
    if (!file) return;

    try {
      validateDocumentFile(file);
      selectedFile = file;
      removeExistingFile = false;
      if (fileNameEl) fileNameEl.textContent = file.name;

      // A newly selected file replaces the old attachment when Save is pressed.
      if (fileActions) {
        fileActions.innerHTML = `
          <span style="font-size:13px;opacity:.75;">New file selected. Save to upload.</span>
          <button type="button" class="btn danger" id="clearSelectedFileBtn">Remove Selection</button>
        `;

        document.getElementById('clearSelectedFileBtn')?.addEventListener('click', () => {
          selectedFile = null;
          if (fileInput) fileInput.value = '';
          if (fileNameEl) fileNameEl.textContent = d.fileName || 'No file attached';

          fileActions.innerHTML = `
            ${d.filePath ? '<button type="button" class="btn" id="viewSelectedFileBtn">View file</button>' : ''}
            ${d.filePath ? '<button type="button" class="btn danger" id="removeFileBtn">Remove File</button>' : ''}
          `;
          bindExistingFileButtons();
        });
      }
    } catch (error) {
      selectedFile = null;
      if (fileInput) fileInput.value = '';
      alert(error.message);
    }
  });

  function bindExistingFileButtons() {
    document.getElementById('removeFileBtn')?.addEventListener('click', () => {
      if (!confirm('Remove the uploaded file? The document itself will be kept.')) return;

      selectedFile = null;
      removeExistingFile = true;
      if (fileInput) fileInput.value = '';
      if (fileNameEl) fileNameEl.textContent = 'No file attached';

      if (fileActions) {
        fileActions.innerHTML = `
          <span style="font-size:13px;opacity:.75;">File will be removed when you save.</span>
        `;
      }
    });

    document.getElementById('viewSelectedFileBtn')?.addEventListener('click', async () => {
      if (!d.filePath) return;

      const btn = document.getElementById('viewSelectedFileBtn');
      if (btn) {
        btn.disabled = true;
        btn.textContent = 'Opening...';
      }

      try {
        const url = await getDocumentFileUrl(d.filePath);
        if (!url) throw new Error('File URL could not be created.');
        window.open(url, '_blank', 'noopener,noreferrer');
      } catch (error) {
        alert(error.message || 'Could not open file.');
      } finally {
        if (btn) {
          btn.disabled = false;
          btn.textContent = 'View file';
        }
      }
    });
  }

  bindExistingFileButtons();

  document.getElementById('cancelBtn').addEventListener('click', closeModal);

  document.getElementById('deleteBtn')?.addEventListener('click', async () => {
    if (!confirm('Delete this document and its uploaded file?')) return;

    try {
      await dbDelete('documents', d.id);
      closeModal();
      await render();
    } catch (error) {
      alert(friendlyAuthError(error));
    }
  });

  document.getElementById('docForm').addEventListener('submit', async e => {
    e.preventDefault();

    const fd = new FormData(e.target);
    const expiryDate = fd.get('expiryDate');
    const issueDate = fd.get('issueDate');

    if (issueDate && expiryDate && issueDate > expiryDate) {
      alert('Expiry date must be after the issue date.');
      return;
    }

    const reminders = chips
      .filter(chip => chip.classList.contains('on'))
      .map(chip => Number(chip.dataset.val));

    const record = {
      id: d.id,
      name: String(fd.get('name') || '').trim(),
      category: fd.get('category'),
      issueDate: issueDate || null,
      expiryDate,
      reminders,
      notes: String(fd.get('notes') || '').trim(),
      createdAt: d.createdAt,
      fileName: d.fileName || null,
      fileType: d.fileType || null,
      filePath: d.filePath || null,
      fileSize: d.fileSize || null,
      notifiedThresholds: isEdit && d.expiryDate === expiryDate ? (d.notifiedThresholds || []) : []
    };

    if (!record.name || !expiryDate) {
      alert('Please enter the document name and expiry date.');
      return;
    }

    const saveBtn = e.target.querySelector('button[type="submit"]');
    const originalSaveText = saveBtn?.textContent || 'Save';

    try {
      if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.textContent = selectedFile ? 'Uploading...' : 'Saving...';
      }

      const oldFilePath = d.filePath || null;
      let uploaded = null;

      if (selectedFile) {
        uploaded = await uploadDocumentFile(selectedFile, record.id);
        record.fileName = uploaded.fileName;
        record.fileType = uploaded.fileType;
        record.filePath = uploaded.filePath;
        record.fileSize = uploaded.fileSize;
      } else if (removeExistingFile) {
        record.fileName = null;
        record.fileType = null;
        record.filePath = null;
        record.fileSize = null;
      }

      try {
        await dbPut('documents', record);
      } catch (saveError) {
        // Do not leave an orphaned new Storage object if the DB save fails.
        if (uploaded?.filePath) {
          await deleteDocumentFile(uploaded.filePath);
        }
        throw saveError;
      }

      // Remove the old Storage object only after the database update succeeds.
      if (oldFilePath && oldFilePath !== record.filePath) {
        await deleteDocumentFile(oldFilePath);
      }

      closeModal();
      await render();
    } catch (error) {
      console.error(error);
      alert(`Could not save document: ${error.message || error}`);
    } finally {
      if (saveBtn) {
        saveBtn.disabled = false;
        saveBtn.textContent = originalSaveText;
      }
    }
  });
}

/* =========================================================
   MAINTENANCE FORM
   ========================================================= */

function todayISO() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function openMaintenanceForm(existing) {
  const isEdit = Boolean(existing);
  const m = existing || {
    id: crypto.randomUUID(),
    reminders: [30, 7, 1],
    notifiedThresholds: []
  };

  const today = todayISO();

  openModal(`
    <div class="modal-title">${isEdit ? 'Edit maintenance' : 'Add maintenance'}</div>

    <form id="maintForm">
      <div class="field">
        <label>Item</label>
        <select name="type" id="typeSelect">
          ${MAINT_TYPES.map(type => `
            <option value="${escapeHTML(type)}" ${m.type === type ? 'selected' : ''}>${escapeHTML(type)}</option>
          `).join('')}
        </select>
      </div>

      <div class="field" id="customNameField" style="${m.type === 'Other' ? '' : 'display:none'}">
        <label>Custom name</label>
        <input type="text" name="itemName" value="${escapeHTML(m.type === 'Other' ? m.itemName || '' : '')}" placeholder="e.g. Water heater">
      </div>

      <div class="field">
        <label>Last serviced date</label>
        <input type="date" name="lastServiceDate" value="${m.lastServiceDate || ''}" max="${today}">
        <small>Today or a past date only.</small>
      </div>

      <div class="field">
        <label>Service due date</label>
        <input type="date" name="nextServiceDate" required min="${today}" value="${m.nextServiceDate || ''}">
        <small>Today or a future date only.</small>
      </div>

      <div class="field">
        <label>Cost (₹)</label>
        <input type="number" name="cost" min="0" step="0.01" value="${m.cost ?? ''}" placeholder="0">
      </div>

      <div class="field">
        <label>Remind me before service</label>
        <div class="chip-row" id="reminderChipsM">
          ${REMINDER_OPTIONS.map(n => `
            <button type="button" class="chip-toggle ${m.reminders?.includes(n) ? 'on' : ''}" data-val="${n}">
              ${n} day${n > 1 ? 's' : ''}
            </button>
          `).join('')}
        </div>
      </div>

      <div class="field">
        <label>Notes</label>
        <textarea name="notes" placeholder="Optional notes">${escapeHTML(m.notes || '')}</textarea>
      </div>

      <div class="modal-actions">
        ${isEdit ? '<button type="button" class="btn danger" id="deleteBtn">Delete</button>' : ''}
        <button type="button" class="btn" id="cancelBtn">Cancel</button>
        <button type="submit" class="btn primary">Save</button>
      </div>
    </form>
  `);

  const chips = [...document.querySelectorAll('#reminderChipsM .chip-toggle')];
  chips.forEach(chip => chip.addEventListener('click', () => chip.classList.toggle('on')));

  document.getElementById('typeSelect').addEventListener('change', e => {
    document.getElementById('customNameField').style.display = e.target.value === 'Other' ? '' : 'none';
  });

  document.getElementById('cancelBtn').addEventListener('click', closeModal);

  document.getElementById('deleteBtn')?.addEventListener('click', async () => {
    if (!confirm('Delete this maintenance item?')) return;

    try {
      await dbDelete('maintenance', m.id);
      closeModal();
      await render();
    } catch (error) {
      alert(`Could not delete item: ${error.message || error}`);
    }
  });

  document.getElementById('maintForm').addEventListener('submit', async e => {
    e.preventDefault();

    const fd = new FormData(e.target);
    const type = fd.get('type');
    const lastServiceDate = fd.get('lastServiceDate');
    const nextServiceDate = fd.get('nextServiceDate');
    const cost = fd.get('cost');
    const selectedReminders = chips
      .filter(chip => chip.classList.contains('on'))
      .map(chip => Number(chip.dataset.val));

    const todayDate = new Date(`${today}T00:00:00`);

    if (lastServiceDate) {
      const lastDate = new Date(`${lastServiceDate}T00:00:00`);
      if (lastDate > todayDate) {
        alert('Last serviced date cannot be in the future.');
        return;
      }
    }

    if (!nextServiceDate) {
      alert('Please select a service due date.');
      return;
    }

    const nextDate = new Date(`${nextServiceDate}T00:00:00`);

    if (nextDate < todayDate) {
      alert('Service due date cannot be in the past.');
      return;
    }

    if (lastServiceDate) {
      const lastDate = new Date(`${lastServiceDate}T00:00:00`);
      if (nextDate <= lastDate) {
        alert('Service due date must be after the last serviced date.');
        return;
      }
    }

    if (cost !== '' && Number(cost) < 0) {
      alert('Service cost cannot be negative.');
      return;
    }

    const itemName = type === 'Other'
      ? String(fd.get('itemName') || '').trim() || 'Other item'
      : type;

    const record = {
      id: m.id,
      type,
      itemName,
      lastServiceDate: lastServiceDate || null,
      nextServiceDate,
      cost: cost === '' ? null : Number(cost),
      reminders: selectedReminders,
      notes: String(fd.get('notes') || '').trim(),
      createdAt: m.createdAt,
      notifiedThresholds: isEdit && m.nextServiceDate === nextServiceDate ? (m.notifiedThresholds || []) : []
    };

    try {
      await dbPut('maintenance', record);
      closeModal();
      await render();
    } catch (error) {
      console.error(error);
      alert(`Could not save maintenance item: ${error.message || error}`);
    }
  });
}

/* =========================================================
   DETAIL VIEW
   ========================================================= */

function openDetail(kind, item) {
  const days = daysUntil(kind === 'document' ? item.expiryDate : item.nextServiceDate);
  const cls = statusClass(days);

  const rows = kind === 'document' ? `
    <div class="detail-row"><span class="k">Category</span><span>${escapeHTML(item.category)}</span></div>
    ${item.issueDate ? `<div class="detail-row"><span class="k">Issue date</span><span>${fmtDate(item.issueDate)}</span></div>` : ''}
    <div class="detail-row"><span class="k">Expiry date</span><span>${fmtDate(item.expiryDate)}</span></div>
    <div class="detail-row"><span class="k">Status</span><span class="card-chip chip-${cls}">${daysLabel(days)}</span></div>
    ${item.fileName ? `<div class="detail-row"><span class="k">Attachment</span><span style="text-align:right;max-width:65%">${escapeHTML(item.fileName)}</span></div>` : ''}
    ${item.notes ? `<div class="detail-row"><span class="k">Notes</span><span style="text-align:right;max-width:65%">${escapeHTML(item.notes)}</span></div>` : ''}
  ` : `
    <div class="detail-row"><span class="k">Type</span><span>${escapeHTML(item.type)}</span></div>
    <div class="detail-row"><span class="k">Last serviced</span><span>${fmtDate(item.lastServiceDate)}</span></div>
    <div class="detail-row"><span class="k">Service due</span><span>${fmtDate(item.nextServiceDate)}</span></div>
    <div class="detail-row"><span class="k">Status</span><span class="card-chip chip-${cls}">${daysLabel(days)}</span></div>
    ${item.cost != null ? `<div class="detail-row"><span class="k">Cost</span><span>₹${formatFinanceMoney(item.cost)}</span></div>` : ''}
    ${item.notes ? `<div class="detail-row"><span class="k">Notes</span><span style="text-align:right;max-width:65%">${escapeHTML(item.notes)}</span></div>` : ''}
  `;

  openModal(`
    <div class="modal-title">${escapeHTML(kind === 'document' ? item.name : item.itemName)}</div>
    ${rows}
    <div class="modal-actions">
      <button type="button" class="btn" id="closeDetailBtn">Close</button>
      ${kind === 'document' && item.filePath ? '<button type="button" class="btn" id="viewFileBtn">View file</button>' : ''}
      ${kind === 'document' && item.filePath ? '<button type="button" class="btn danger" id="removeFileDetailBtn">Remove File</button>' : ''}
      <button type="button" class="btn primary" id="editBtn">Edit</button>
    </div>
  `);

  document.getElementById('closeDetailBtn').addEventListener('click', closeModal);

  document.getElementById('viewFileBtn')?.addEventListener('click', async () => {
    const btn = document.getElementById('viewFileBtn');
    if (!item.filePath) return;

    btn.disabled = true;
    btn.textContent = 'Opening...';

    try {
      const url = await getDocumentFileUrl(item.filePath);
      if (!url) throw new Error('File URL could not be created.');
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (error) {
      alert(error.message || 'Could not open file.');
    } finally {
      btn.disabled = false;
      btn.textContent = 'View file';
    }
  });

  document.getElementById('removeFileDetailBtn')?.addEventListener('click', async () => {
    if (!item.filePath) return;
    if (!confirm('Remove the uploaded file? The document itself will be kept.')) return;

    const btn = document.getElementById('removeFileDetailBtn');
    btn.disabled = true;
    btn.textContent = 'Removing...';

    try {
      await deleteDocumentFile(item.filePath);

      await dbPut('documents', {
        ...item,
        filePath: null,
        fileName: null,
        fileType: null,
        fileSize: null
      });

      closeModal();
      await render();
    } catch (error) {
      console.error('Remove file error:', error);
      alert(`Could not remove file: ${error.message || error}`);
      btn.disabled = false;
      btn.textContent = 'Remove File';
    }
  });

  document.getElementById('editBtn').addEventListener('click', () => {
    closeModal();
    if (kind === 'document') openDocumentForm(item);
    else openMaintenanceForm(item);
  });
}

/* =========================================================
   NOTIFICATIONS
   ========================================================= */

function updateNotifBtn() {
  const btn = document.getElementById('notifPermBtn');
  if (!btn || !('Notification' in window)) return;

  btn.classList.toggle('granted', Notification.permission === 'granted');
}

async function requestNotifPermission() {
  if (!('Notification' in window)) {
    alert('Notifications are not supported in this browser.');
    return;
  }

  try {
    const permission = await Notification.requestPermission();
    updateNotifBtn();

    if (permission === 'granted') {
      await checkReminders();

      if ('serviceWorker' in navigator) {
        try {
          const registration = await navigator.serviceWorker.ready;
          if ('periodicSync' in registration) {
            await registration.periodicSync.register('pm-reminder-check', {
              minInterval: 12 * 60 * 60 * 1000
            });
          }
        } catch (_) {}
      }
    }
  } catch (error) {
    console.error('Notification permission error:', error);
  }
}

async function notify(title, body, tag) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;

  try {
    if ('serviceWorker' in navigator) {
      const registration = await navigator.serviceWorker.ready;
      if (registration?.showNotification) {
        await registration.showNotification(title, {
          body,
          icon: 'icon-192.png',
          tag
        });
        return;
      }
    }
  } catch (_) {}

  try {
    new Notification(title, { body, icon: 'icon-192.png', tag });
  } catch (_) {}
}

async function checkReminders() {
  if (!currentUser) return;
  if (!('Notification' in window) || Notification.permission !== 'granted') return;

  // Browser-only reminder check. Persistent server-side notifications can be added later.
  const docs = await dbGetAll('documents');
  const maintenance = await dbGetAll('maintenance');

  for (const doc of docs) {
    const days = daysUntil(doc.expiryDate);
    if (days == null) continue;

    const thresholds = doc.reminders || [];

    for (const threshold of thresholds) {
      if (days === threshold) {
        await notify(
          'Document reminder',
          `${doc.name} expires ${fmtDate(doc.expiryDate)} (${daysLabel(days)}).`,
          `doc-${doc.id}-${threshold}`
        );
      }
    }

    if (days < 0) {
      await notify(
        'Document expired',
        `${doc.name} expired on ${fmtDate(doc.expiryDate)}.`,
        `doc-${doc.id}-overdue`
      );
    }
  }

  for (const item of maintenance) {
    const days = daysUntil(item.nextServiceDate);
    if (days == null) continue;

    const thresholds = item.reminders || [];

    for (const threshold of thresholds) {
      if (days === threshold) {
        await notify(
          'Maintenance reminder',
          `${item.itemName} is due ${fmtDate(item.nextServiceDate)} (${daysLabel(days)}).`,
          `maint-${item.id}-${threshold}`
        );
      }
    }

    if (days < 0) {
      await notify(
        'Maintenance overdue',
        `${item.itemName} was due on ${fmtDate(item.nextServiceDate)}.`,
        `maint-${item.id}-overdue`
      );
    }
  }
}

/* =========================================================
   SERVICE WORKER
   ========================================================= */

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(error => {
      console.warn('Service worker registration failed:', error);
    });
  });
}

/* =========================================================
   START
   ========================================================= */

window.addEventListener('load', () => {
  // The authentication check is the first gate.
  // No dashboard is rendered until a valid session exists.
  initAuth();
});
