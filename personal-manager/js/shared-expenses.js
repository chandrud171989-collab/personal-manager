(() => {
  "use strict";

  const client = window.supabaseClient;
  const view = document.getElementById("view");
  const modalRoot = document.getElementById("modalRoot");
  const logoutBtn = document.getElementById("logoutBtn");

  let currentUser = null;
  let currentGroup = null;
  let realtimeChannel = null;

  const CATEGORIES = [
    "Food", "Travel", "Transport", "Home", "Shopping",
    "Entertainment", "Bills", "Other"
  ];

  function esc(value) {
    const d = document.createElement("div");
    d.textContent = value ?? "";
    return d.innerHTML;
  }

  function money(value) {
    return Number(value || 0).toLocaleString("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 2
    });
  }

  function closeModal() {
    modalRoot.innerHTML = "";
  }

  function openModal(html) {
    modalRoot.innerHTML =
      `<div class="modal-backdrop" id="sharedBackdrop">
        <div class="modal-sheet">${html}</div>
      </div>`;

    document.getElementById("sharedBackdrop").addEventListener("click", e => {
      if (e.target.id === "sharedBackdrop") closeModal();
    });
  }

  async function init() {
    if (!client) {
      view.innerHTML = `<div class="error">Supabase client is not initialized.</div>`;
      return;
    }

    const { data, error } = await client.auth.getSession();

    if (error || !data.session?.user) {
      window.location.href = "login.html";
      return;
    }

    currentUser = data.session.user;
    await renderGroups();
  }

  async function getGroups() {
    const { data, error } = await client
      .from("shared_expense_group_members")
      .select(`
        group_id,
        role,
        shared_expense_groups (
          id,
          name,
          created_by,
          created_at
        )
      `)
      .eq("user_id", currentUser.id);

    if (error) throw error;

    return (data || [])
      .map(row => ({
        ...row.shared_expense_groups,
        role: row.role
      }))
      .filter(Boolean);
  }

  async function getGroupMembers(groupId) {
    const { data, error } = await client
      .from("shared_expense_group_members")
      .select("user_id, role, joined_at")
      .eq("group_id", groupId);

    if (error) throw error;

    return data || [];
  }

  async function getExpenses(groupId) {
    const { data, error } = await client
      .from("shared_expenses")
      .select("*")
      .eq("group_id", groupId)
      .order("expense_date", { ascending: false })
      .order("created_at", { ascending: false });

    if (error) throw error;
    return data || [];
  }

  async function getSplits(expenseIds) {
    if (!expenseIds.length) return [];

    const { data, error } = await client
      .from("shared_expense_splits")
      .select("*")
      .in("expense_id", expenseIds);

    if (error) throw error;
    return data || [];
  }

  async function renderGroups(message = "") {
    try {
      const groups = await getGroups();

      view.innerHTML = `
        <h1 class="page-title">Shared Expenses</h1>
        <p class="page-subtitle">Share expenses with your Personal Manager connections.</p>

        ${message ? `<div class="notice shared-notice">${esc(message)}</div>` : ""}

        <div class="section">
          <div class="section-head">
            <span class="section-title">Your groups</span>
            <button class="btn primary" id="createGroupBtn">+ Create Group</button>
          </div>

          ${
            groups.length
              ? groups.map(group => `
                <div class="shared-group-card" data-group-id="${esc(group.id)}">
                  <div>
                    <div class="card-title">${esc(group.name)}</div>
                    <div class="card-sub">${group.role === "owner" ? "Owner" : "Member"}</div>
                  </div>
                  <button class="btn" data-open-group="${esc(group.id)}">Open</button>
                </div>
              `).join("")
              : `<div class="empty">No groups yet. Create your first shared expense group.</div>`
          }
        </div>

        <div class="section">
          <div class="section-head">
            <span class="section-title">Invitations</span>
          </div>
          <div id="invitationList"><div class="empty">Loading invitations...</div></div>
        </div>
      `;

      document.getElementById("createGroupBtn")
        .addEventListener("click", openCreateGroup);

      document.querySelectorAll("[data-open-group]").forEach(btn => {
        btn.addEventListener("click", () => openGroup(btn.dataset.openGroup));
      });

      await renderInvitations();
    } catch (error) {
      console.error(error);
      view.innerHTML = `<div class="error">${esc(error.message || "Unable to load Shared Expenses.")}</div>`;
    }
  }

  async function renderInvitations() {
    const box = document.getElementById("invitationList");
    if (!box) return;

    const { data, error } = await client
      .from("shared_expense_invitations")
      .select(`
        id,
        group_id,
        invited_email,
        invited_by,
        status,
        created_at,
        shared_expense_groups (id, name)
      `)
      .eq("status", "pending")
      .ilike("invited_email", currentUser.email);

    if (error) {
      box.innerHTML = `<div class="empty">Unable to load invitations.</div>`;
      return;
    }

    if (!data?.length) {
      box.innerHTML = `<div class="empty">No pending invitations.</div>`;
      return;
    }

    box.innerHTML = data.map(inv => `
      <div class="invitation-card">
        <div>
          <div class="card-title">${esc(inv.shared_expense_groups?.name || "Shared group")}</div>
          <div class="card-sub">Invitation sent to ${esc(inv.invited_email)}</div>
        </div>
        <div class="shared-actions">
          <button class="btn primary" data-accept="${esc(inv.id)}">Accept</button>
          <button class="btn danger" data-decline="${esc(inv.id)}">Decline</button>
        </div>
      </div>
    `).join("");

    document.querySelectorAll("[data-accept]").forEach(btn => {
      btn.addEventListener("click", () => acceptInvitation(btn.dataset.accept));
    });

    document.querySelectorAll("[data-decline]").forEach(btn => {
      btn.addEventListener("click", () => declineInvitation(btn.dataset.decline));
    });
  }

  function openCreateGroup() {
    openModal(`
      <div class="modal-title">Create Shared Expense Group</div>
      <form id="groupForm">
        <div class="field">
          <label>Group name</label>
          <input id="groupName" required maxlength="80" placeholder="e.g. Family">
        </div>

        <div class="modal-actions">
          <button type="button" class="btn" id="cancelGroup">Cancel</button>
          <button type="submit" class="btn primary">Create Group</button>
        </div>
      </form>
    `);

    document.getElementById("cancelGroup").addEventListener("click", closeModal);

    document.getElementById("groupForm").addEventListener("submit", async e => {
      e.preventDefault();

      const name = document.getElementById("groupName").value.trim();
      if (!name) return;

      const { data: group, error } = await client
        .from("shared_expense_groups")
        .insert({
          name,
          created_by: currentUser.id
        })
        .select()
        .single();

      if (error) {
        alert(error.message);
        return;
      }

      const { error: memberError } = await client
        .from("shared_expense_group_members")
        .insert({
          group_id: group.id,
          user_id: currentUser.id,
          role: "owner"
        });

      if (memberError) {
        alert(memberError.message);
        return;
      }

      closeModal();
      await renderGroups("Group created successfully.");
    });
  }

  async function openGroup(groupId) {
    try {
      const groups = await getGroups();
      currentGroup = groups.find(g => g.id === groupId);

      if (!currentGroup) {
        alert("You are not a member of this group.");
        return;
      }

      await renderGroup();
      subscribeToGroup(groupId);
    } catch (error) {
      alert(error.message || "Unable to open group.");
    }
  }

  async function renderGroup() {
    const members = await getGroupMembers(currentGroup.id);
    const expenses = await getExpenses(currentGroup.id);
    const splits = await getSplits(expenses.map(e => e.id));

    const balances = calculateBalances(expenses, splits, members);
    const myBalance = balances[currentUser.id] || 0;

    view.innerHTML = `
      <div class="shared-header">
        <div>
          <button class="btn" id="backGroups">← Groups</button>
          <h1 class="page-title">${esc(currentGroup.name)}</h1>
          <p class="page-subtitle">${members.length} member${members.length === 1 ? "" : "s"}</p>
        </div>
        <button class="btn primary" id="addExpenseBtn">+ Add Expense</button>
      </div>

      <div class="shared-stats">
        <div class="stat-card">
          <div class="stat-num">${money(expenses.reduce((sum, e) => sum + Number(e.amount), 0))}</div>
          <div class="stat-label">Total expenses</div>
        </div>
        <div class="stat-card">
          <div class="stat-num">${money(Math.max(myBalance, 0))}</div>
          <div class="stat-label">You are owed</div>
        </div>
        <div class="stat-card">
          <div class="stat-num">${money(Math.max(-myBalance, 0))}</div>
          <div class="stat-label">You owe</div>
        </div>
      </div>

      <div class="section">
        <div class="section-head">
          <span class="section-title">Members</span>
          <button class="btn" id="inviteBtn">+ Invite</button>
        </div>

        ${members.map(member => `
          <div class="member-row">
            <div>
              <strong>${member.user_id === currentUser.id ? "You" : esc(member.user_id)}</strong>
              <div class="card-sub">${member.role}</div>
            </div>
          </div>
        `).join("")}
      </div>

      <div class="section">
        <div class="section-head">
          <span class="section-title">Expenses</span>
          <span class="section-count">${expenses.length}</span>
        </div>

        ${
          expenses.length
            ? expenses.map(expense => `
              <div class="expense-row">
                <div>
                  <div class="card-title">${esc(expense.description)}</div>
                  <div class="card-sub">
                    ${esc(expense.category || "Other")} · ${esc(expense.expense_date)}
                  </div>
                </div>
                <div class="expense-amount">${money(expense.amount)}</div>
              </div>
            `).join("")
            : `<div class="empty">No expenses yet. Add the first one.</div>`
        }
      </div>

      <div class="section">
        <div class="section-head">
          <span class="section-title">Balances</span>
          <button class="btn primary" id="settleBtn">Settle Up</button>
        </div>

        ${renderBalanceRows(balances, members)}
      </div>
    `;

    document.getElementById("backGroups").addEventListener("click", () => {
      unsubscribeGroup();
      currentGroup = null;
      renderGroups();
    });

    document.getElementById("addExpenseBtn").addEventListener("click", () => {
      openExpenseForm(members);
    });

    document.getElementById("inviteBtn").addEventListener("click", () => {
      openInviteForm();
    });

    document.getElementById("settleBtn").addEventListener("click", () => {
      openSettlementForm(members, balances);
    });
  }

  function calculateBalances(expenses, splits, members) {
    const balances = {};
    members.forEach(m => balances[m.user_id] = 0);

    expenses.forEach(expense => {
      const paidBy = expense.paid_by;
      if (balances[paidBy] === undefined) balances[paidBy] = 0;

      balances[paidBy] += Number(expense.amount);

      splits
        .filter(s => s.expense_id === expense.id)
        .forEach(split => {
          if (balances[split.user_id] === undefined) balances[split.user_id] = 0;
          balances[split.user_id] -= Number(split.share_amount);
        });
    });

    return balances;
  }

  function renderBalanceRows(balances, members) {
    return members.map(member => {
      const balance = Number(balances[member.user_id] || 0);

      if (Math.abs(balance) < 0.005) {
        return `
          <div class="balance-row">
            <span>${member.user_id === currentUser.id ? "You" : esc(member.user_id)}</span>
            <strong>Settled</strong>
          </div>
        `;
      }

      return `
        <div class="balance-row">
          <span>${member.user_id === currentUser.id ? "You" : esc(member.user_id)}</span>
          <strong class="${balance > 0 ? "balance-positive" : "balance-negative"}">
            ${balance > 0 ? "+" : "-"}${money(Math.abs(balance))}
          </strong>
        </div>
      `;
    }).join("");
  }

  function openInviteForm() {
    if (currentGroup.role !== "owner") {
      alert("Only the group owner can invite members.");
      return;
    }

    openModal(`
      <div class="modal-title">Invite Member</div>
      <form id="inviteForm">
        <div class="field">
          <label>Personal Manager email</label>
          <input id="inviteEmail" type="email" required placeholder="member@example.com">
          <small>The user must have a Personal Manager account.</small>
        </div>

        <div class="modal-actions">
          <button type="button" class="btn" id="cancelInvite">Cancel</button>
          <button type="submit" class="btn primary">Send Invitation</button>
        </div>
      </form>
    `);

    document.getElementById("cancelInvite").addEventListener("click", closeModal);

    document.getElementById("inviteForm").addEventListener("submit", async e => {
      e.preventDefault();

      const email = document.getElementById("inviteEmail").value.trim().toLowerCase();

      if (email === (currentUser.email || "").toLowerCase()) {
        alert("You are already a member of this group.");
        return;
      }

      const { error } = await client.rpc(
        "create_shared_expense_invitation",
        {
          p_group_id: currentGroup.id,
          p_email: email
        }
      );

      if (error) {
        alert(error.message);
        return;
      }

      closeModal();
      alert("Invitation created. The member can accept it from Shared Expenses.");
    });
  }

  async function acceptInvitation(invitationId) {
    const { error } = await client.rpc(
      "accept_shared_expense_invitation",
      {
        p_invitation_id: invitationId
      }
    );

    if (error) {
      alert(error.message);
      return;
    }

    await renderGroups("Invitation accepted.");
  }

  async function declineInvitation(invitationId) {
    const { error } = await client
      .from("shared_expense_invitations")
      .update({ status: "declined" })
      .eq("id", invitationId);

    if (error) {
      alert(error.message);
      return;
    }

    await renderGroups("Invitation declined.");
  }

  function openExpenseForm(members) {
    openModal(`
      <div class="modal-title">Add Expense</div>
      <form id="expenseForm">
        <div class="field">
          <label>Description</label>
          <input id="expenseDescription" required maxlength="120" placeholder="e.g. Dinner">
        </div>

        <div class="field">
          <label>Amount (₹)</label>
          <input id="expenseAmount" type="number" min="0.01" step="0.01" required placeholder="0.00">
        </div>

        <div class="field">
          <label>Date</label>
          <input id="expenseDate" type="date" required value="${new Date().toISOString().slice(0,10)}">
        </div>

        <div class="field">
          <label>Paid by</label>
          <select id="paidBy">
            ${members.map(m => `
              <option value="${esc(m.user_id)}" ${m.user_id === currentUser.id ? "selected" : ""}>
                ${m.user_id === currentUser.id ? "You" : esc(m.user_id)}
              </option>
            `).join("")}
          </select>
        </div>

        <div class="field">
          <label>Category</label>
          <select id="expenseCategory">
            ${CATEGORIES.map(c => `<option>${c}</option>`).join("")}
          </select>
        </div>

        <div class="field">
          <label>Split</label>
          <select id="splitType">
            <option value="equal">Equal</option>
            <option value="custom">Custom</option>
          </select>
        </div>

        <div class="field">
          <label>Split between</label>
          <div class="chip-row" id="memberChips">
            ${members.map(m => `
              <button
                type="button"
                class="chip-toggle on"
                data-user-id="${esc(m.user_id)}"
              >${m.user_id === currentUser.id ? "You" : esc(m.user_id)}</button>
            `).join("")}
          </div>
        </div>

        <div id="customSplitArea"></div>

        <div class="field">
          <label>Notes</label>
          <textarea id="expenseNotes" placeholder="Optional notes"></textarea>
        </div>

        <div class="modal-actions">
          <button type="button" class="btn" id="cancelExpense">Cancel</button>
          <button type="submit" class="btn primary">Add Expense</button>
        </div>
      </form>
    `);

    const chips = [...document.querySelectorAll("#memberChips .chip-toggle")];

    chips.forEach(chip => {
      chip.addEventListener("click", () => {
        chip.classList.toggle("on");
        if (!chips.some(c => c.classList.contains("on"))) chip.classList.add("on");
        renderCustomSplitInputs();
      });
    });

    document.getElementById("splitType").addEventListener("change", renderCustomSplitInputs);
    document.getElementById("cancelExpense").addEventListener("click", closeModal);

    function renderCustomSplitInputs() {
      const area = document.getElementById("customSplitArea");
      if (document.getElementById("splitType").value !== "custom") {
        area.innerHTML = "";
        return;
      }

      area.innerHTML = chips
        .filter(c => c.classList.contains("on"))
        .map(c => `
          <div class="field custom-split-row">
            <label>${esc(c.textContent.trim())} share (₹)</label>
            <input
              class="custom-share"
              type="number"
              min="0"
              step="0.01"
              data-user-id="${esc(c.dataset.userId)}"
              required
              value="0"
            >
          </div>
        `).join("");
    }

    document.getElementById("expenseForm").addEventListener("submit", async e => {
      e.preventDefault();

      const description = document.getElementById("expenseDescription").value.trim();
      const amount = Number(document.getElementById("expenseAmount").value);
      const expenseDate = document.getElementById("expenseDate").value;
      const paidBy = document.getElementById("paidBy").value;
      const category = document.getElementById("expenseCategory").value;
      const splitType = document.getElementById("splitType").value;
      const notes = document.getElementById("expenseNotes").value.trim();

      const selectedUsers = chips
        .filter(c => c.classList.contains("on"))
        .map(c => c.dataset.userId);

      if (!selectedUsers.length) {
        alert("Select at least one member.");
        return;
      }

      let splitRows = [];

      if (splitType === "equal") {
        const share = amount / selectedUsers.length;
        splitRows = selectedUsers.map(userId => ({
          user_id: userId,
          share_amount: Number(share.toFixed(2))
        }));

        const difference = Number((amount -
          splitRows.reduce((s, r) => s + r.share_amount, 0)).toFixed(2));

        if (difference !== 0) {
          splitRows[0].share_amount += difference;
        }
      } else {
        const customInputs = [...document.querySelectorAll(".custom-share")];

        splitRows = customInputs.map(input => ({
          user_id: input.dataset.userId,
          share_amount: Number(input.value || 0)
        }));

        const total = splitRows.reduce((s, r) => s + r.share_amount, 0);

        if (Math.abs(total - amount) > 0.01) {
          alert(`Custom split must equal ${money(amount)}. Current total is ${money(total)}.`);
          return;
        }
      }

      const { data: expense, error } = await client
        .from("shared_expenses")
        .insert({
          group_id: currentGroup.id,
          description,
          amount,
          expense_date: expenseDate,
          paid_by: paidBy,
          category,
          notes,
          split_type: splitType,
          created_by: currentUser.id
        })
        .select()
        .single();

      if (error) {
        alert(error.message);
        return;
      }

      const { error: splitError } = await client
        .from("shared_expense_splits")
        .insert(
          splitRows.map(row => ({
            expense_id: expense.id,
            user_id: row.user_id,
            share_amount: row.share_amount
          }))
        );

      if (splitError) {
        await client.from("shared_expenses").delete().eq("id", expense.id);
        alert(splitError.message);
        return;
      }

      closeModal();
      await renderGroup();
    });
  }

  function openSettlementForm(members, balances) {
    const people = members.filter(m => m.user_id !== currentUser.id);

    openModal(`
      <div class="modal-title">Settle Up</div>
      <form id="settlementForm">
        <div class="field">
          <label>From</label>
          <select id="settlementFrom">
            <option value="${esc(currentUser.id)}">You</option>
            ${people.map(m => `<option value="${esc(m.user_id)}">${esc(m.user_id)}</option>`).join("")}
          </select>
        </div>

        <div class="field">
          <label>To</label>
          <select id="settlementTo">
            ${people.map(m => `<option value="${esc(m.user_id)}">${esc(m.user_id)}</option>`).join("")}
          </select>
        </div>

        <div class="field">
          <label>Amount (₹)</label>
          <input id="settlementAmount" type="number" min="0.01" step="0.01" required>
        </div>

        <div class="field">
          <label>Notes</label>
          <input id="settlementNotes" placeholder="Optional">
        </div>

        <div class="modal-actions">
          <button type="button" class="btn" id="cancelSettlement">Cancel</button>
          <button type="submit" class="btn primary">Record Settlement</button>
        </div>
      </form>
    `);

    document.getElementById("cancelSettlement").addEventListener("click", closeModal);

    document.getElementById("settlementForm").addEventListener("submit", async e => {
      e.preventDefault();

      const fromUser = document.getElementById("settlementFrom").value;
      const toUser = document.getElementById("settlementTo").value;
      const amount = Number(document.getElementById("settlementAmount").value);

      if (fromUser === toUser) {
        alert("From and To must be different.");
        return;
      }

      const { error } = await client
        .from("shared_expense_settlements")
        .insert({
          group_id: currentGroup.id,
          from_user: fromUser,
          to_user: toUser,
          amount,
          notes: document.getElementById("settlementNotes").value.trim()
        });

      if (error) {
        alert(error.message);
        return;
      }

      closeModal();
      await renderGroup();
    });
  }

  function subscribeToGroup(groupId) {
    unsubscribeGroup();

    realtimeChannel = client
      .channel(`shared-expenses-${groupId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "shared_expenses",
          filter: `group_id=eq.${groupId}`
        },
        () => renderGroup()
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "shared_expense_splits"
        },
        () => renderGroup()
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "shared_expense_settlements",
          filter: `group_id=eq.${groupId}`
        },
        () => renderGroup()
      )
      .subscribe();
  }

  function unsubscribeGroup() {
    if (realtimeChannel) {
      client.removeChannel(realtimeChannel);
      realtimeChannel = null;
    }
  }

  logoutBtn?.addEventListener("click", async () => {
    await client.auth.signOut();
    window.location.href = "login.html";
  });

  window.addEventListener("beforeunload", unsubscribeGroup);

  init();
})();
