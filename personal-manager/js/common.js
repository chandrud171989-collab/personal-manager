/* Personal Manager - shared code
 * All pages use the same Supabase client/session.
 */
(() => {
  "use strict";

  const PM = window.PM = window.PM || {};
  PM.client = window.supabaseClient;

    /* ---------- Security / Auto-lock ---------- */

  const SESSION_UNLOCKED_KEY = "pm_session_unlocked";
  const AUTO_LOCK_HIDDEN_AT_KEY = "pm_auto_lock_hidden_at";
  const AUTO_LOCK_MS = 60 * 1000;
  PM.markSessionUnlocked = () => {
  try {
    sessionStorage.setItem(SESSION_UNLOCKED_KEY, "1");
  } catch (_) {}
};

PM.isSessionUnlocked = () => {
  try {
    return sessionStorage.getItem(SESSION_UNLOCKED_KEY) === "1";
  } catch (_) {
    return false;
  }
};

PM.clearSessionUnlocked = () => {
  try {
    sessionStorage.removeItem(SESSION_UNLOCKED_KEY);
    sessionStorage.removeItem(AUTO_LOCK_HIDDEN_AT_KEY);
  } catch (_) {}
};

  let autoLockTimer = null;
  let appIsLocked = false;

    /* ---------- Automatic background lock ---------- */

  PM.autoLock = async () => {
    if (appIsLocked) return;

    appIsLocked = true;

    const uid = PM.user?.id || null;

    // Stop any pending timer.
    if (autoLockTimer) {
      clearTimeout(autoLockTimer);
      autoLockTimer = null;
    }

    // Remove the temporary authentication state.
    PM.clearSessionUnlocked();

    // Remove the encryption key from memory.
    PM.clearDocumentKey(uid);

    // Sign out only this device/session.
    try {
      if (PM.client) {
        await PM.client.auth.signOut({ scope: "local" });
      }
    } catch (error) {
      console.error("Auto-lock sign-out error:", error);
    }

    location.href = "login.html";
  };

  function scheduleAutoLock() {
    if (!PM.isSessionUnlocked()) return;

    if (autoLockTimer) {
      clearTimeout(autoLockTimer);
    }

    try {
      sessionStorage.setItem(
        AUTO_LOCK_HIDDEN_AT_KEY,
        String(Date.now())
      );
    } catch (_) {}

    autoLockTimer = setTimeout(async () => {
      if (!document.hidden) return;

      const hiddenAt = Number(
        sessionStorage.getItem(AUTO_LOCK_HIDDEN_AT_KEY) || 0
      );

      if (
        hiddenAt &&
        Date.now() - hiddenAt >= AUTO_LOCK_MS
      ) {
        await PM.autoLock();
      }
    }, AUTO_LOCK_MS + 100);
  }

  function cancelAutoLock() {
    if (autoLockTimer) {
      clearTimeout(autoLockTimer);
      autoLockTimer = null;
    }

    try {
      sessionStorage.removeItem(AUTO_LOCK_HIDDEN_AT_KEY);
    } catch (_) {}
  }

  document.addEventListener("visibilitychange", () => {
    if (!PM.isSessionUnlocked()) return;

    if (document.hidden) {
      scheduleAutoLock();
    } else {
      const hiddenAt = Number(
        sessionStorage.getItem(AUTO_LOCK_HIDDEN_AT_KEY) || 0
      );

      if (
        hiddenAt &&
        Date.now() - hiddenAt >= AUTO_LOCK_MS
      ) {
        PM.autoLock();
      } else {
        cancelAutoLock();
      }
    }
  });

  window.addEventListener("pagehide", () => {
    if (!PM.isSessionUnlocked()) return;

    try {
      sessionStorage.setItem(
        AUTO_LOCK_HIDDEN_AT_KEY,
        String(Date.now())
      );
    } catch (_) {}
  });

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
  if (!PM.client) {
    throw new Error("Supabase client is not initialized.");
  }

  // Require this app session to have been explicitly unlocked.
  if (!PM.isSessionUnlocked()) {
    try {
      await PM.client.auth.signOut({ scope: "local" });
    } catch (_) {}

    location.href = "login.html";
    throw new Error("Authentication required.");
  }

  // Check whether the app was in the background too long.
  try {
    const hiddenAt = Number(
      sessionStorage.getItem(AUTO_LOCK_HIDDEN_AT_KEY) || 0
    );

    if (hiddenAt) {
      const elapsed = Date.now() - hiddenAt;

      if (elapsed >= AUTO_LOCK_MS) {
        await PM.autoLock();
        throw new Error("Session locked.");
      }

      // Returned before the 1-minute timeout.
      sessionStorage.removeItem(AUTO_LOCK_HIDDEN_AT_KEY);
    }
  } catch (error) {
    if (error?.message === "Session locked.") {
      throw error;
    }
  }

  const { data, error } = await PM.client.auth.getSession();

  if (error) throw error;

  if (!data.session?.user) {
    PM.clearSessionUnlocked();
    location.href = "login.html";
    throw new Error("Authentication session missing.");
  }

  PM.user = data.session.user;

  // Restore the secure document encryption key.
  if (!PM.documentKey) {
    try {
      await PM.restoreDocumentKey(PM.user.id);
    } catch (_) {}
  }

  return PM.user;
};

  PM.logout = async () => {
    const uid = PM.user?.id || null;
    try {
      if (PM.client) await PM.client.auth.signOut({ scope: "local" });
    } finally {
      PM.clearDocumentKey(uid);
      PM.clearSessionUnlocked();
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

  /*
   * Secure document-key storage
   *
   * The actual CryptoKey is stored in IndexedDB.
   * It is non-extractable, so JavaScript cannot export the key again.
   *
   * A legacy localStorage key is still supported temporarily so
   * existing users can be migrated without losing access to documents.
   */

  const KEY_DB_NAME = "PersonalManagerSecureKeys";
  const KEY_DB_VERSION = 1;
  const KEY_STORE_NAME = "documentKeys";

  let keyDbPromise = null;

  function openKeyDatabase() {
    if (keyDbPromise) return keyDbPromise;

    keyDbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(KEY_DB_NAME, KEY_DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = event.target.result;

        if (!db.objectStoreNames.contains(KEY_STORE_NAME)) {
          db.createObjectStore(KEY_STORE_NAME, {
            keyPath: "userId"
          });
        }
      };

      request.onsuccess = () => resolve(request.result);

      request.onerror = () => {
        keyDbPromise = null;
        reject(request.error);
      };
    });

    return keyDbPromise;
  }

  async function saveSecureKey(userId, key) {
  const db = await openKeyDatabase();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(KEY_STORE_NAME, "readwrite");
    const store = tx.objectStore(KEY_STORE_NAME);

    const request = store.put({
      userId,
      key
    });

    request.onsuccess = () => resolve();

    request.onerror = () => {
      reject(
        request.error ||
        new Error("Unable to save document key.")
      );
    };

    tx.onerror = () => {
      reject(
        tx.error ||
        new Error("Unable to save document key.")
      );
    };

    tx.onabort = () => {
      reject(
        tx.error ||
        new Error("Unable to save document key.")
      );
    };
  });
}
  async function loadSecureKey(userId) {
    const db = await openKeyDatabase();

    return new Promise((resolve, reject) => {
      const tx = db.transaction(KEY_STORE_NAME, "readonly");
      const request = tx.objectStore(KEY_STORE_NAME).get(userId);

      request.onsuccess = () => {
        resolve(request.result?.key || null);
      };

      request.onerror = () => reject(request.error);
    });
  }

  async function deleteSecureKey(userId) {
    if (!userId) return;

    const db = await openKeyDatabase();

    return new Promise((resolve, reject) => {
      const tx = db.transaction(KEY_STORE_NAME, "readwrite");

      tx.objectStore(KEY_STORE_NAME).delete(userId);

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error("Unable to delete document key."));
    });
  }

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

    for (let i = 0; i < s.length; i++) {
      out[i] = s.charCodeAt(i);
    }

    return out;
  }

  PM.deriveDocumentKey = async (password, userId) => {
    if (!password || !userId) {
      throw new Error("Unable to unlock document encryption.");
    }

    const enc = new TextEncoder();

    const material = await crypto.subtle.importKey(
      "raw",
      enc.encode(password),
      "PBKDF2",
      false,
      ["deriveKey"]
    );

    const salt = enc.encode(
      CRYPTO_SALT_PREFIX + userId
    );

    /*
     * IMPORTANT:
     * The derived key is now non-extractable.
     *
     * It can still encrypt/decrypt documents, but JavaScript
     * cannot export the raw AES key.
     */
    return crypto.subtle.deriveKey(
      {
        name: "PBKDF2",
        salt,
        iterations: 310000,
        hash: "SHA-256"
      },
      material,
      {
        name: "AES-GCM",
        length: 256
      },
      false,
      ["encrypt", "decrypt"]
    );
  };

  PM.saveDocumentKey = async (key, userId) => {
    if (!key || !userId) {
      throw new Error("Unable to save document encryption key.");
    }

    /*
     * Store the CryptoKey directly in IndexedDB.
     *
     * The key is non-extractable, so the application cannot
     * retrieve the raw AES key as text or Base64.
     */
    await saveSecureKey(userId, key);

    /*
     * Remove the old localStorage copy after successful migration.
     */
    try {
      localStorage.removeItem(CRYPTO_PREFIX + userId);
    } catch (_) {}
  };

  PM.restoreDocumentKey = async (userId) => {
    if (!userId) return false;

    /*
     * 1. First try the secure IndexedDB key.
     */
    try {
      const secureKey = await loadSecureKey(userId);

      if (secureKey) {
        PM.documentKey = secureKey;
        return true;
      }
    } catch (error) {
      console.error("Secure document key restore failed:", error);
    }

    /*
     * 2. Migration path for existing users.
     *
     * Older versions stored the raw AES key in localStorage.
     * Import it as NON-EXTRACTABLE, move it to IndexedDB,
     * then delete the old localStorage copy.
     */
    let stored = null;

    try {
      stored = localStorage.getItem(
        CRYPTO_PREFIX + userId
      );
    } catch (_) {}

    if (!stored) {
      return false;
    }

    try {
      const key = await crypto.subtle.importKey(
        "raw",
        unb64(stored),
        {
          name: "AES-GCM"
        },
        false,
        ["encrypt", "decrypt"]
      );

      await saveSecureKey(userId, key);

      try {
        localStorage.removeItem(
          CRYPTO_PREFIX + userId
        );
      } catch (_) {}

      PM.documentKey = key;

      return true;

    } catch (error) {
      console.error(
        "Legacy document key migration failed:",
        error
      );

      return false;
    }
  };
  
  PM.unlockDocuments = async (password, userId) => {
  if (!password || !userId) {
    throw new Error("Unable to unlock document encryption.");
  }

  const key = await PM.deriveDocumentKey(password, userId);

  PM.documentKey = key;
  PM.markSessionUnlocked();

  // Save the encryption key and expose the promise
  PM.documentKeySavePromise = saveSecureKey(userId, key)
    .then(() => {
      try {
        localStorage.removeItem(CRYPTO_PREFIX + userId);
      } catch (_) {}
    })
    .catch((error) => {
      console.error("Unable to save document encryption key:", error);
      throw error;
    });

  return key;
};

  /*
   * Logout should clear ONLY the in-memory key.
   *
   * The secure IndexedDB key must remain so that a later
   * passkey authentication can restore it.
   */
  PM.clearDocumentKey = (userId) => {
    PM.documentKey = null;

    /*
     * DO NOT delete the IndexedDB key here.
     *
     * userId is intentionally unused because logout should
     * not destroy the device's passkey-unlock capability.
     */
  };

  /*
   * Permanently remove the device encryption key.
   *
   * This can be used later for account deletion / device reset.
   */
  PM.deleteStoredDocumentKey = async (userId) => {
    if (!userId) return;

    await deleteSecureKey(userId);

    try {
      localStorage.removeItem(
        CRYPTO_PREFIX + userId
      );
    } catch (_) {}

    if (PM.user?.id === userId) {
      PM.documentKey = null;
    }
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
    PM.setupHeader();
    document.querySelectorAll(".navbtn").forEach((a) => {
      a.classList.toggle("active", a.dataset.page === page);
    });
  };

  window.addEventListener("load", () => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("sw.js").catch(() => {});
    }
  });
})();
