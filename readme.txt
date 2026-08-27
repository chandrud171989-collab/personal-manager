PERSONAL MANAGER - COMPLETE MULTI-PAGE VERSION

Structure
---------
index.html                 Dashboard
login.html                 Login / registration / reset
documents.html             Documents
maintenance.html           Maintenance
finance.html               Finance
css/style.css              Shared styling
js/common.js               Shared auth/session helpers
js/supabase-config.js      Supabase configuration
js/dashboard.js            Dashboard
js/documents.js            Documents + Supabase Storage
js/maintenance.js          Maintenance + expense summary
js/finance.js               Home expenses + maintenance totals + EMI
js/login.js                 Login page
sw.js                      PWA service worker
manifest.json              PWA manifest
supabase-migration.sql      Safe DB/storage migration

IMPORTANT
---------
1. This version uses your existing Supabase URL/key.
2. Documents are uploaded to the PRIVATE "documents" Storage bucket.
3. Document files are saved at:
      <user-id>/<document-id>/<timestamp>-<filename>
4. public.documents stores:
      id, user_id, category, name, issue_date, expiry_date, notes,
      file_path, created_at, updated_at, file_name, file_type,
      file_size, reminder_days
5. Documents are opened through temporary signed URLs.
6. Do not make the documents bucket public.

DEPLOYMENT
----------
Upload the complete folder structure to the GitHub Pages repository.
Do not put the project inside an extra nested folder.

Run supabase-migration.sql once in Supabase SQL Editor.
Then hard-refresh the site (Ctrl+Shift+R).


DOCUMENT ENCRYPTION
-------------------
New document files are encrypted in the customer's browser with AES-GCM-256
before upload to Supabase Storage.

The encryption key is derived from the customer's existing account password
and user ID using PBKDF2-SHA-256. The password itself is never uploaded to
Supabase by this feature. The derived key is cached locally in the browser for
seamless use after login and is removed on logout.

Supabase Storage contains an encrypted binary object (not the original PDF/JPG/PNG).
The original file type/name/size are kept as metadata so the customer can see
the document normally.

Viewing:
  Supabase encrypted object -> browser download -> browser decryption -> original file

Deletion:
  database row + encrypted Storage object are both deleted.

IMPORTANT SECURITY NOTE
-----------------------
This protects document contents from Supabase Storage/database access because
the stored object is ciphertext. JavaScript running on the customer's device
can access the derived key, so normal client-side/XSS risks still apply.

If the customer changes/reset their account password, existing document keys
may require a re-encryption/recovery flow. No password-change migration is
implemented in this version.


PERFORMANCE OPTIMIZATIONS - V3
-------------------------------
- Service worker only intercepts same-origin application files.
- Supabase API/Storage and CDN requests are not cached/intercepted.
- HTML uses network-first so new deployments appear quickly.
- Static application assets use cache-first for fast repeat loads.
- Dashboard queries select only columns it needs.
- Maintenance expense synchronization uses a single upsert instead of a read + write.
- Removed unused Finance initial query functions.
- Normal login now derives the document encryption key exactly once.
- Signup derives the key exactly once.
