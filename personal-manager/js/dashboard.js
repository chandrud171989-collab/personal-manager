(() => {
  "use strict";

  const PM = window.PM;
  const view = document.getElementById("view");
  function passkeyEnabledKey() {
  return `pm_passkey_enabled_${PM.user?.id || "unknown"}`;
}

function isPasskeyEnabled() {
  return localStorage.getItem(passkeyEnabledKey()) === "1";
}

function markPasskeyEnabled() {
  localStorage.setItem(passkeyEnabledKey(), "1");
}

  async function dbAll(table) {
    const { data, error } = await PM.client
      .from(table)
      .select("*")
      .eq("user_id", PM.user.id)
      .order("created_at", { ascending: false });

    if (error) throw error;
    return data || [];
  }

  function docMap(d) {
    return {
      ...d,
      _kind: "document",
      _days: PM.daysUntil(d.expiry_date)
    };
  }

  function maintMap(m) {
    return {
      ...m,
      _kind: "maintenance",
      _days: PM.daysUntil(m.next_service_date)
    };
  }

  function card(item) {
    const title =
      item._kind === "document"
        ? item.name
        : (item.item_name || item.category || "Maintenance item");

    const sub =
      item._kind === "document"
        ? `${item.category || "Document"} · ${
            item.expiry_date
              ? `expires ${PM.dateText(item.expiry_date)}`
              : "No expiry"
          }`
        : `Maintenance · next service ${PM.dateText(item.next_service_date)}`;

    return `<a class="card status-${PM.statusClass(item._days)}" href="${
      item._kind === "document"
        ? "documents.html"
        : "maintenance.html"
    }">
      <div class="card-main">
        <div class="card-title">${PM.escape(title)}</div>
        <div class="card-sub">${PM.escape(sub)}</div>
      </div>
      <div class="card-chip chip-${PM.statusClass(item._days)}">
        ${PM.escape(PM.statusLabel(item._days))}
      </div>
    </a>`;
  }

  function showPasskeyModal() {
    PM.modal(`
      <div style="text-align:center;">
        <div style="font-size:32px;margin-bottom:10px;">🔐</div>

        <div style="font-weight:800;font-size:18px;">
          Fingerprint Login
        </div>

        <div class="status" style="margin-top:8px;">
          Sign in faster using your fingerprint, face unlock,
          or device PIN.
        </div>

        <button
          class="btn primary"
          id="modalRegisterPasskeyBtn"
          type="button"
          style="width:100%;margin-top:18px;"
        >
          Enable Fingerprint Login
        </button>

        <button
          class="btn"
          id="modalCancelPasskeyBtn"
          type="button"
          style="width:100%;margin-top:10px;"
        >
          Cancel
        </button>

        <div
          id="modalPasskeyStatus"
          class="status"
          style="text-align:center;margin-top:10px;"
        ></div>
      </div>
    `);

    document
      .getElementById("modalCancelPasskeyBtn")
      ?.addEventListener("click", () => {
        PM.closeModal();
      });

    document
      .getElementById("modalRegisterPasskeyBtn")
      ?.addEventListener("click", async () => {
        const btn = document.getElementById("modalRegisterPasskeyBtn");
        const status = document.getElementById("modalPasskeyStatus");

        if (!btn) return;

        btn.disabled = true;
        btn.textContent = "Registering...";

        try {
          const client = PM.client;

          if (!client?.auth?.registerPasskey) {
            throw new Error(
              "Passkey registration is not available."
            );
          }

          const { data, error } =
            await client.auth.registerPasskey();

          if (error) throw error;

          console.log("Passkey registered:", data);

          markPasskeyEnabled();

          if (status) {
            status.textContent =
              "✓ Fingerprint login enabled successfully.";
          }

          btn.textContent = "✓ Enabled";

          setTimeout(() => {
            PM.closeModal();
          }, 1000);

        } catch (error) {
          console.error(
            "Passkey registration error:",
            error
          );

          btn.disabled = false;
          btn.textContent = "Enable Fingerprint Login";

          if (status) {
            status.textContent =
              error?.message ||
              "Passkey registration failed.";
          }
        }
      });
  }

  async function render() {
    try {
      await PM.initPage("dashboard");

      const [docs, maint] = await Promise.all([
        dbAll("documents"),
        dbAll("maintenance")
      ]);

      const items = [
        ...docs.map(docMap),
        ...maint.map(maintMap)
      ];

      const expiring = docs
        .map(docMap)
        .filter(
          x => x._days != null && x._days <= 30
        )
        .sort((a, b) => a._days - b._days);

      const due = maint
        .map(maintMap)
        .filter(
          x => x._days != null && x._days <= 30
        )
        .sort((a, b) => a._days - b._days);

      const upcoming = items
        .filter(
          x =>
            x._days != null &&
            x._days >= 0 &&
            x._days <= 30
        )
        .sort((a, b) => a._days - b._days)
        .slice(0, 8);

      const overdue = items.filter(
        x => x._days != null && x._days < 0
      ).length;

      const soon = items.filter(
        x =>
          x._days != null &&
          x._days >= 0 &&
          x._days <= 7
      ).length;

      view.innerHTML = `
        <h1 class="page-title">Dashboard</h1>

        <p class="page-subtitle">
          Your personal reminders and records
        </p>

        <div class="stats">
          <div class="stat-card">
            <div class="stat-num">${overdue}</div>
            <div class="stat-label">Overdue</div>
          </div>

          <div class="stat-card">
            <div class="stat-num">${soon}</div>
            <div class="stat-label">Due in 7 days</div>
          </div>

          <div class="stat-card">
            <div class="stat-num">${items.length}</div>
            <div class="stat-label">Total tracked</div>
          </div>
        </div>

        <div class="section">
          <div class="section-head">
            <span class="section-title">
              Upcoming reminders
            </span>

            <span class="section-count">
              ${upcoming.length}
            </span>
          </div>

          ${
            upcoming.length
              ? upcoming.map(card).join("")
              : '<div class="empty">Nothing due in the next month.</div>'
          }
        </div>

        <div class="section">
          <div class="section-head">
            <span class="section-title">
              Expiring documents
            </span>

            <span class="section-count">
              ${expiring.length}
            </span>
          </div>

          ${
            expiring.length
              ? expiring.map(card).join("")
              : '<div class="empty">No documents expiring soon.</div>'
          }
        </div>

        <div class="section">
          <div class="section-head">
            <span class="section-title">
              Maintenance due
            </span>

            <span class="section-count">
              ${due.length}
            </span>
          </div>

          ${
            due.length
              ? due.map(card).join("")
              : '<div class="empty">Nothing needs servicing soon.</div>'
          }
        </div>

        <div
          style="
            text-align:center;
            margin:24px 0 10px;
          "
        >
          <button
            id="fingerprintSettingBtn"
            type="button"
            style="
              border:0;
              background:none;
              padding:8px 12px;
              font-size:13px;
              color:inherit;
              opacity:.75;
              cursor:pointer;
            "
          >
            ${isPasskeyEnabled()
              ? "✓ Fingerprint Login Enabled"
              : "🔐 Fingerprint Login"}
          </button>
        </div>
      `;

      document
        .getElementById("fingerprintSettingBtn")
        ?.addEventListener("click", showPasskeyModal);

    } catch (e) {
      console.error(e);

      view.innerHTML =
        `<div class="error">${PM.escape(
          e.message || String(e)
        )}</div>`;
    }
  }

  render();
})();