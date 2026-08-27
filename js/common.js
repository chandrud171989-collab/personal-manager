/* Personal Manager - shared code
 * All pages use the same Supabase client/session.
 */
(() => {
  "use strict";

  const PM = window.PM = window.PM || {};
  PM.client = window.supabaseClient;

  PM.escape = (value) => {
    const div = document.createElement("div");
    div.textContent = value == null ? "" : String(value);
    return div.innerHTML;
  };

  PM.money = (value) =>
    Number(value || 0).toLocaleString("en-IN", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });

  PM.dateISO = (value) => {
    if (!value) return "";
    return String(value).slice(0, 10);
  };

  PM.dateText = (value) => {
    if (!value) return "—";
    const d = new Date(`${String(value).slice(0,10)}T00:00:00`);
    return Number.isNaN(d.getTime())
      ? String(value)
      : d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  };

  PM.daysUntil = (value) => {
    if (!value) return null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const target = new Date(`${String(value).slice(0,10)}T00:00:00`);
    return Math.round((target - today) / 86400000);
  };

  PM.statusClass = (days) => {
    if (days == null) return "green";
    if (days < 0 || days <= 7) return "red";
    if (days <= 30) return "amber";
    return "green";
  };

  PM.statusLabel = (days) => {
    if (days == null) return "—";
    if (days < 0) return `${Math.abs(days)}d overdue`;
    if (days === 0) return "Today";
    if (days === 1) return "Tomorrow";
    return `in ${days}d`;
  };

  PM.uuid = () => {
    try { return crypto.randomUUID(); }
    catch (_) { return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`; }
  };

  PM.getUser = async () => {
    if (!PM.client) throw new Error("Supabase client is not available.");
    const { data, error } = await PM.client.auth.getUser();
    if (error) throw error;
    if (!data.user) throw new Error("Authentication session missing.");
    return data.user;
  };

  PM.requireAuth = async () => {
    if (!PM.client) throw new Error("Supabase client is not initialized.");

    const { data, error } = await PM.client.auth.getSession();
    if (error) throw error;

    const user = data.session?.user;
    if (!user) {
      location.href = "login.html";
      throw new Error("Authentication session missing.");
    }

    PM.user = user;

    if (!PM.documentKey) {
      try { await PM.restoreDocumentKey(user.id); } catch (_) {}
    }

    return user;
  };

  PM.logout = async () => {
    const uid = PM.user?.id || null;
    try {
      if (PM.client) await PM.client.auth.signOut();
    } finally {
      PM.clearDocumentKey(uid);
      location.href = "login.html";
    }
  };

  PM.setupHeader = () => {
    document.getElementById("logoutBtn")?.addEventListener("click", PM.logout);
    document.getElementById("notifPermBtn")?.addEventListener("click", PM.requestNotifications);
    PM.updateNotificationButton();
  };

  PM.updateNotificationButton = () => {
    const btn = document.getElementById("notifPermBtn");
    if (!btn || !("Notification" in window)) return;
    btn.classList.toggle("granted", Notification.permission === "granted");
  };

  PM.requestNotifications = async () => {
    if (!("Notification" in window)) {
      alert("Notifications are not supported in this browser.");
      return;
    }
    try {
      const p = await Notification.requestPermission();
      PM.updateNotificationButton();
      if (p === "granted") {
        alert("Notifications enabled.");
      }
    } catch (e) {
      console.error(e);
    }
  };

  PM.modal = (html) => {
    const root = document.getElementById("modalRoot");
    if (!root) return;
    root.innerHTML = `
      <div class="modal-backdrop" id="pmBackdrop">
        <div class="modal-sheet">${html}</div>
      </div>`;
    document.getElementById("pmBackdrop")?.addEventListener("click", (e) => {
      if (e.target.id === "pmBackdrop") PM.closeModal();
    });
  };

  PM.closeModal = () => {
    const root = document.getElementById("modalRoot");
    if (root) root.innerHTML = "";
  };


  /* ---------- Client-side document encryption ---------- */
  const CRYPTO_PREFIX = "pm_doc_key_v1_";
  const CRYPTO_SALT_PREFIX = "PersonalManager-DocumentKey-v1:";

  function b64(bytes) {
    let s = "";
    const arr = new Uint8Array(bytes);
    for (let i = 0; i < arr.length; i += 0x8000) {
      s += String.fromCharCode(...arr.subarray(i, i + 0x8000));
    }
    return btoa(s);
  }

  function unb64(text) {
    const s = atob(text);
    const out = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
    return out;
  }

  PM.deriveDocumentKey = async (password, userId) => {
    if (!password || !userId) throw new Error("Unable to unlock document encryption.");

    const enc = new TextEncoder();
    const material = await crypto.subtle.importKey(
      "raw",
      enc.encode(password),
      "PBKDF2",
      false,
      ["deriveKey"]
    );

    const salt = enc.encode(CRYPTO_SALT_PREFIX + userId);

    return crypto.subtle.deriveKey(
      {
        name: "PBKDF2",
        salt,
        iterations: 310000,
        hash: "SHA-256"
      },
      material,
      { name: "AES-GCM", length: 256 },
      true,
      ["encrypt", "decrypt"]
    );
  };

  PM.saveDocumentKey = async (key, userId) => {
    const raw = await crypto.subtle.exportKey("raw", key);
    localStorage.setItem(CRYPTO_PREFIX + userId, b64(raw));
  };

  PM.restoreDocumentKey = async (userId) => {
    const stored = localStorage.getItem(CRYPTO_PREFIX + userId);
    if (!stored) return false;

    const key = await crypto.subtle.importKey(
      "raw",
      unb64(stored),
      { name: "AES-GCM" },
      true,
      ["encrypt", "decrypt"]
    );

    PM.documentKey = key;
    return true;
  };

  PM.unlockDocuments = async (password, userId) => {
    const key = await PM.deriveDocumentKey(password, userId);
    PM.documentKey = key;
    await PM.saveDocumentKey(key, userId);
    return key;
  };

  PM.clearDocumentKey = (userId) => {
    PM.documentKey = null;
    if (userId) localStorage.removeItem(CRYPTO_PREFIX + userId);
  };

  PM.encryptFile = async (file) => {
    if (!PM.documentKey) throw new Error("Document encryption is locked. Please log in again.");
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const plain = await file.arrayBuffer();
    const cipher = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      PM.documentKey,
      plain
    );

    const magic = new TextEncoder().encode("PMENC001");
    const packed = new Uint8Array(magic.length + iv.length + cipher.byteLength);
    packed.set(magic, 0);
    packed.set(iv, magic.length);
    packed.set(new Uint8Array(cipher), magic.length + iv.length);

    return new Blob([packed], { type: "application/octet-stream" });
  };

  PM.decryptBlob = async (blob, originalType = "application/pdf") => {
    if (!PM.documentKey) throw new Error("Document encryption is locked. Please log in again.");

    const packed = new Uint8Array(await blob.arrayBuffer());
    const magic = new TextDecoder().decode(packed.slice(0, 8));
    if (magic !== "PMENC001") throw new Error("This document is not in the expected encrypted format.");

    const iv = packed.slice(8, 20);
    const cipher = packed.slice(20);

    const plain = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv },
      PM.documentKey,
      cipher
    );

    return new Blob([plain], { type: originalType || "application/octet-stream" });
  };

  PM.initPage = async (page) => {
    await PM.requireAuth();

    const active = document.querySelector(`.navbtn[data-page="${page}"]`);
    if (active) active.classList.add("active");

    PM.setupHeader();
  };

  window.addEventListener("load", () => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("sw.js").catch(() => {});
    }
  });
})();
