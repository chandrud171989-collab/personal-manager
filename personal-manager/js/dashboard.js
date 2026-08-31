(() => {
  "use strict";
  const PM = window.PM;
  const view = document.getElementById("view");

  async function dbAll(table) {
    const { data, error } = await PM.client.from(table).select("*").eq("user_id", PM.user.id).order("created_at", { ascending: false });
    if (error) throw error;
    return data || [];
  }

  function docMap(d) {
    return { ...d, _kind: "document", _days: PM.daysUntil(d.expiry_date) };
  }

  function maintMap(m) {
    return { ...m, _kind: "maintenance", _days: PM.daysUntil(m.next_service_date) };
  }

  function card(item) {
    const title = item._kind === "document" ? item.name : (item.item_name || item.category || "Maintenance item");
    const sub = item._kind === "document"
      ? `${item.category || "Document"} · ${item.expiry_date ? `expires ${PM.dateText(item.expiry_date)}` : "No expiry"}`
      : `Maintenance · next service ${PM.dateText(item.next_service_date)}`;
    return `<a class="card status-${PM.statusClass(item._days)}" href="${item._kind === "document" ? "documents.html" : "maintenance.html"}">
      <div class="card-main"><div class="card-title">${PM.escape(title)}</div><div class="card-sub">${PM.escape(sub)}</div></div>
      <div class="card-chip chip-${PM.statusClass(item._days)}">${PM.escape(PM.statusLabel(item._days))}</div>
    </a>`;
  }

  async function render() {
    try {
      await PM.initPage("dashboard");
      const [docs, maint] = await Promise.all([dbAll("documents"), dbAll("maintenance")]);
      const items = [...docs.map(docMap), ...maint.map(maintMap)];
      const expiring = docs.map(docMap).filter(x => x._days != null && x._days <= 30).sort((a,b)=>a._days-b._days);
      const due = maint.map(maintMap).filter(x => x._days != null && x._days <= 30).sort((a,b)=>a._days-b._days);
      const upcoming = items.filter(x => x._days != null && x._days >= 0 && x._days <= 30).sort((a,b)=>a._days-b._days).slice(0,8);
      const overdue = items.filter(x => x._days != null && x._days < 0).length;
      const soon = items.filter(x => x._days != null && x._days >= 0 && x._days <= 7).length;

      view.innerHTML = `
        <h1 class="page-title">Dashboard</h1>
        <p class="page-subtitle">Your personal reminders and records</p>
        <div class="stats">
          <div class="stat-card"><div class="stat-num">${overdue}</div><div class="stat-label">Overdue</div></div>
          <div class="stat-card"><div class="stat-num">${soon}</div><div class="stat-label">Due in 7 days</div></div>
          <div class="stat-card"><div class="stat-num">${items.length}</div><div class="stat-label">Total tracked</div></div>
        </div>
        <div class="section"><div class="section-head"><span class="section-title">Upcoming reminders</span><span class="section-count">${upcoming.length}</span></div>
          ${upcoming.length ? upcoming.map(card).join("") : '<div class="empty">Nothing due in the next month.</div>'}
        </div>
        <div class="section"><div class="section-head"><span class="section-title">Expiring documents</span><span class="section-count">${expiring.length}</span></div>
          ${expiring.length ? expiring.map(card).join("") : '<div class="empty">No documents expiring soon.</div>'}
        </div>
        <div class="section"><div class="section-head"><span class="section-title">Maintenance due</span><span class="section-count">${due.length}</span></div>
          ${due.length ? due.map(card).join("") : '<div class="empty">Nothing needs servicing soon.</div>'}
        </div>`;
    } catch (e) {
      console.error(e);
      view.innerHTML = `<div class="error">${PM.escape(e.message || String(e))}</div>`;
    }
  }

  render();
})();