PERSONAL MANAGER - MULTI-PAGE VERSION

Pages:
  index.html        Dashboard
  documents.html    Documents
  maintenance.html  Maintenance + Maintenance Expense Summary
  finance.html      Finance + Home Expenses + EMI Calculator
  login.html        Login / registration / forgot password

Shared files:
  js/supabase-config.js
  js/common.js
  js/ui.js
  css/style.css
  sw.js
  manifest.json

IMPORTANT:
1. Replace the old single-page files with this complete folder structure.
2. Keep the Supabase project/schema already used by the existing app.
3. The browser IndexedDB database name/version and existing object stores are preserved:
   documents, maintenance, financeExpenses.
4. Documents continue to use the existing local fileBlob behavior from the supplied working app.
5. Maintenance continues to mirror positive maintenance costs to public.maintenance_expenses when configured.
6. Finance automatically includes maintenance expense history and local maintenance costs as fallback.
7. Monthly Loan Summary is removed; EMI Calculator remains.
8. Finance has no floating + button. Documents and Maintenance have their own + button.
9. Normal page navigation is used instead of the old shared setView/render system, eliminating the async render race that was overwriting pages.
10. Service worker cache is versioned and uses network-first fetching so updated files are not trapped in an old app.js cache.
