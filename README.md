# Personal Manager

A free, subscription-free installable web app (PWA) for tracking documents and home maintenance, with expiry reminders. Everything is stored **only on your device** (IndexedDB) — nothing is uploaded anywhere.

## Deploy it exactly like Truckbro (GitHub Pages)

1. Create a new repo, e.g. `personal-manager`.
2. Copy in these files: `index.html`, `style.css`, `app.js`, `sw.js`, `manifest.json`, `icon-192.png`, `icon-512.png`.
3. Push to GitHub:
   ```
   git init
   git add .
   git commit -m "Personal Manager app"
   git branch -M main
   git remote add origin https://github.com/<your-username>/personal-manager.git
   git push -u origin main
   ```
4. In the repo: **Settings → Pages → Source → Deploy from a branch → main / (root)**.
5. Your app will be live at `https://<your-username>.github.io/personal-manager/`.

## Install it on your Android phone

1. Open the URL above in **Chrome** on your phone.
2. Tap the **⋮** menu → **Add to Home screen** (Chrome may also show an automatic "Install app" banner).
3. It now opens full-screen, with its own icon, like a native app — no Play Store, no subscription.
4. On first open, tap the bell icon (top-right) and allow notifications.

## Features included

- **Dashboard** — overdue count, due-in-7-days count, upcoming reminders, expiring documents, maintenance due.
- **Documents** — name, category, expiry date, notes, optional photo/PDF attachment, configurable reminders (30/7/1 days).
- **Home Maintenance** — item (AC, RO, fridge, washing machine, or custom), last/next service date, cost, notes, reminders.
- **Notifications** — fires at 30 days, 7 days, and 1 day before (whichever you tick per item), plus an overdue alert.

## Honest note on notifications

There's no native Android app here (that needs Android Studio/Kotlin to compile an APK, which I can't do in this chat). This is a PWA instead — same "no subscription, install from a link" idea, but built with the tools available:

- Reminders are checked **every time you open the app**, so if you open it daily nothing will be missed.
- While the app is installed, some Android/Chrome versions support checking periodically even when it's closed (`periodicSync`), which this app tries to register — but Android can still delay or skip it depending on battery optimization settings for the app.
- For guaranteed background alerts, you'd want it in **App info → Battery → Unrestricted** for Chrome, or a true native app built in Android Studio.

If it turns out you want the fully native version later (guaranteed background alarms via Android's AlarmManager), that's a bigger project I can help you scaffold in Kotlin — just let me know and we can start that separately.

PERSONAL MANAGER - PRIVATE DOCUMENT STORAGE

1. Replace your current app.js with app.js from this folder.
2. In Supabase SQL Editor, run document_privacy_setup.sql once.
3. Keep the documents bucket PRIVATE.
4. The browser encrypts PDF/JPG/PNG files with AES-256-GCM before upload.
5. Supabase Storage receives only encrypted .enc objects.
6. Customers do not see encryption/decryption controls.
7. On login, the app automatically unlocks the document vault using the password.
8. The app caches the non-extractable CryptoKey locally in IndexedDB for convenience on that device.
9. The current password-reset flow can reset the Supabase account password, but a password reset on a new device cannot unlock an existing encrypted vault without the old password. A future recovery-key flow should be added before production if password recovery must also recover encrypted documents.

