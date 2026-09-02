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
      view.innerHTML =
        `<div class="error">Supabase client is not initialized.</div>`;
      return;
    }

    const { data, error } = await client.auth.getSession();

    if (error || !data.session?.user) {
      window.location.href = "login.html";
      return;
    }

    currentUser = data.session.user;

    // Check whether this page was opened from an invitation email
    const invitationId =
      new URLSearchParams(window.location.search).get("invitation");

    if (invitationId) {
      await renderGroups();
      await showInvitation(invitationId);
      return;
    }

    await renderGroups();
  }

    async function showInvitation(invitationId) {
  try {
    const { data, error } = await client.rpc(
      "get_shared_expense_invitation",
      {
        p_invitation_id: invitationId
      }
    );

    if (error) {
      console.error("Invitation lookup error:", error);
      alert(error.message || "Unable to load invitation.");
      return;
    }

    if (!data || !data.length) {
      alert(
        "This invitation is not available for your account, " +
        "or it has already been processed."
      );
      return;
    }

    const invitation = data[0];

    openModal(`
      <div class="modal-title">Shared Expense Invitation</div>

      <div class="section">
        <p>
          <strong>${esc(invitation.inviter_name || "Someone")}</strong>
          has invited you to join:
        </p>

        <h3>${esc(invitation.group_name)}</h3>

        <p class="card-sub">
          Invitation sent to ${esc(invitation.invited_email)}
        </p>
      </div>

      <div class="modal-actions">
        <button
          type="button"
          class="btn danger"
          id="declineInvitationBtn"
        >
          Decline
        </button>

        <button
          type="button"
          class="btn primary"
          id="acceptInvitationBtn"
        >
          Accept
        </button>
      </div>
    `);

    document
      .getElementById("acceptInvitationBtn")
      .addEventListener("click", async () => {
        closeModal();

        await acceptInvitation(invitation.id);

        // Remove invitation parameter from the URL
        window.history.replaceState(
          {},
          document.title,
          "shared-expenses.html"
        );
      });

    document
      .getElementById("declineInvitationBtn")
      .addEventListener("click", async () => {
        closeModal();

        await declineInvitation(invitation.id);

        window.history.replaceState(
          {},
          document.title,
          "shared-expenses.html"
        );
      });

  } catch (error) {
    console.error("Invitation error:", error);
    alert(error.message || "Unable to process invitation.");
  }
}
    async function getGroups() {
      const { data, error } = await client.rpc(
        "get_shared_expense_groups"
      );

      if (error) throw error;

      return data || [];
    }

    async function getGroupMembers(groupId) {
      const { data, error } = await client.rpc(
        "get_shared_expense_group_members",
        {
          p_group_id: groupId
        }
      );

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
                <div
  class="shared-group-card"
  data-group-id="${esc(group.id)}"
>
  <div>
    <div class="card-title">
      ${esc(group.name)}
    </div>

    <div class="card-sub">
      ${group.role === "owner" ? "Owner" : "Member"}
    </div>
  </div>

  <div class="shared-actions">

    <button
      class="btn"
      data-open-group="${esc(group.id)}"
    >
      Open
    </button>

    ${
      group.role === "owner"
        ? `
          <button
            class="btn danger"
            data-delete-group="${esc(group.id)}"
          >
            Delete
          </button>
        `
        : ""
    }

  </div>
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
        btn.addEventListener("click", () => {
          openGroup(btn.dataset.openGroup);
        });
      });

      document.querySelectorAll("[data-delete-group]").forEach(btn => {
        btn.addEventListener("click", async () => {
          await deleteGroup(btn.dataset.deleteGroup);
        });
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

    box.innerHTML =
      `<div class="empty">Loading invitations...</div>`;

    try {
      const { data, error } = await client.rpc(
        "get_shared_expense_invitations"
      );

      if (error) {
        console.error("Invitation list error:", error);

        box.innerHTML =
          `<div class="empty">Unable to load invitations.</div>`;

        return;
      }

      if (!data || !data.length) {
        box.innerHTML =
          `<div class="empty">No pending invitations.</div>`;

        return;
      }

      box.innerHTML = data
        .map(inv => `
          <div class="invitation-card">

            <div>
              <div class="card-title">
                ${esc(inv.group_name || "Shared group")}
              </div>

              <div class="card-sub">
                Invited by
                ${esc(inv.inviter_name || inv.inviter_email || "Member")}
              </div>

              <div class="card-sub">
                Invitation sent to ${esc(inv.invited_email)}
              </div>
            </div>

            <div class="shared-actions">

              <button
                type="button"
                class="btn primary"
                data-accept="${esc(inv.id)}"
              >
                Accept
              </button>

              <button
                type="button"
                class="btn danger"
                data-decline="${esc(inv.id)}"
              >
                Decline
              </button>

            </div>

          </div>
        `)
        .join("");

      document
        .querySelectorAll("[data-accept]")
        .forEach(btn => {
          btn.addEventListener("click", async () => {
            await acceptInvitation(btn.dataset.accept);
          });
        });

      document
        .querySelectorAll("[data-decline]")
        .forEach(btn => {
          btn.addEventListener("click", async () => {
            await declineInvitation(btn.dataset.decline);
          });
        });

    } catch (error) {
      console.error("Invitation rendering error:", error);

      box.innerHTML =
        `<div class="empty">Unable to load invitations.</div>`;
    }
  }
  async function deleteGroup(groupId) {
  const confirmed = confirm(
    "Are you sure you want to delete this group?\n\n" +
    "This will permanently delete the group, " +
    "members, expenses, splits, settlements and invitations."
  );

  if (!confirmed) {
    return;
  }

  const secondConfirmation = confirm(
    "This action cannot be undone.\n\n" +
    "Delete this group?"
  );

  if (!secondConfirmation) {
    return;
  }

  const { error } = await client.rpc(
    "delete_shared_expense_group",
    {
      p_group_id: groupId
    }
  );

  if (error) {
    alert(error.message);
    return;
  }

  currentGroup = null;

  await renderGroups(
    "Group deleted successfully."
  );
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

      const { data: groupId, error } = await client.rpc(
        "create_shared_expense_group",
        {
          p_name: name
        }
      );

      if (error) {
        alert(error.message);
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
          <div class="stat-label">You get</div>
        </div>
        <div class="stat-card">
          <div class="stat-num">${money(Math.max(-myBalance, 0))}</div>
          <div class="stat-label">You pay</div>
        </div>
      </div>

      <div class="section">
        <div class="section-head">
          <span class="section-title">Members</span>
          ${
            currentGroup.role === "owner"
              ? `<button class="btn" id="inviteBtn">+ Invite</button>`
              : ""
            }
        </div>

        ${members.map(member => `
          <div class="member-row">
            <div>
              <strong>${member.user_id === currentUser.id ? "You" : esc(member.name || member.email || "Member")}</strong>
              <div class="card-sub">
                ${member.role}${member.email ? ` · ${esc(member.email)}` : ""}
              </div>
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
            <div style="flex:1;">

              <div class="card-title">
                ${esc(expense.description)}
              </div>

              <div class="card-sub">
                ${esc(expense.category || "Other")}
                ·
                ${esc(expense.expense_date)}
              </div>

              <div class="card-sub">
                Paid by:
                <strong>
                  ${esc(
                    getMemberDisplayName(expense.paid_by, members)
                  )}
                </strong>
              </div>

              ${
                expense.updated_at &&
                expense.updated_by
                  ? `
                    <div class="card-sub">
                      Modified by:
                      <strong>
                        ${esc(
                          getMemberDisplayName(
                            expense.updated_by,
                            members
                          )
                        )}
                      </strong>
                      ·
                      ${esc(formatDateTime(expense.updated_at))}
                    </div>
                  `
                  : ""
              }

              <div
                class="shared-actions"
                style="margin-top:10px;"
              >

                <button
                  type="button"
                  class="btn"
                  data-edit-expense="${esc(expense.id)}"
                >
                  Edit
                </button>

                ${
                  currentGroup.role === "owner"
                    ? `
                      <button
                        type="button"
                        class="btn danger"
                        data-delete-expense="${esc(expense.id)}"
                      >
                        Delete
                      </button>
                    `
                    : ""
                }

              </div>

            </div>

            <div class="expense-amount">
              ${money(expense.amount)}
            </div>

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

    const inviteBtn = document.getElementById("inviteBtn");

      if (inviteBtn) {
        inviteBtn.addEventListener("click", () => {
          openInviteForm();
        });
      }

    document.getElementById("settleBtn").addEventListener("click", () => {
      openSettlementForm(members, balances);
    });
    document
  .querySelectorAll("[data-edit-expense]")
  .forEach(btn => {
    btn.addEventListener("click", () => {
      const expense = expenses.find(
        e => e.id === btn.dataset.editExpense
      );

      if (!expense) return;

      openEditExpenseForm(
        expense,
        members,
        splits
      );
    });
  });

document
  .querySelectorAll("[data-delete-expense]")
  .forEach(btn => {
    btn.addEventListener("click", async () => {
      await deleteExpense(
        btn.dataset.deleteExpense
      );
    });
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
          <span>
            ${member.user_id === currentUser.id
              ? "You"
              : esc(member.name || member.email || "Member")}
          </span>
          <strong>Settled</strong>
        </div>
      `;
    }

    return `
      <div class="balance-row">
        <span>
          ${member.user_id === currentUser.id
            ? "You"
            : esc(member.name || member.email || "Member")}
        </span>
        <strong class="${balance > 0 ? "balance-positive" : "balance-negative"}">
          ${balance > 0 ? "+" : "-"}${money(Math.abs(balance))}
        </strong>
      </div>
    `;
  }).join("");
}

function getMemberDisplayName(userId, members) {
  if (userId === currentUser.id) {
    return "You";
  }

  const member = members.find(m => m.user_id === userId);

  if (!member) {
    return "Member";
  }

  return member.name || member.email || "Member";
}

function formatDateTime(value) {
  if (!value) return "";

  return new Date(value).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
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
        <input
          id="inviteEmail"
          type="email"
          required
          placeholder="member@example.com"
        >
        <small>The user must have a Personal Manager account.</small>
      </div>

      <div class="modal-actions">
        <button type="button" class="btn" id="cancelInvite">
          Cancel
        </button>

        <button type="submit" class="btn primary">
          Send Invitation
        </button>
      </div>
    </form>
  `);

  document
    .getElementById("cancelInvite")
    .addEventListener("click", closeModal);

  document
    .getElementById("inviteForm")
    .addEventListener("submit", async e => {
      e.preventDefault();

      const email = document
        .getElementById("inviteEmail")
        .value
        .trim()
        .toLowerCase();

      if (email === (currentUser.email || "").toLowerCase()) {
        alert("You are already a member of this group.");
        return;
      }

      const { data: invitationId, error: invitationError } =
        await client.rpc(
          "create_shared_expense_invitation",
          {
            p_group_id: currentGroup.id,
            p_email: email
          }
        );

      if (invitationError) {
        alert(invitationError.message);
        return;
      }

      if (!invitationId) {
        alert(
          "Invitation was created, but no invitation ID was returned."
        );
        return;
      }

      // Send invitation email through Supabase Edge Function
      const { data: emailResult, error: emailError } =
        await client.functions.invoke(
          "send-shared-expense-invite",
          {
            body: {
              email: email,
              groupName: currentGroup.name,
              inviterName:
                currentUser.user_metadata?.name ||
                currentUser.email,
              invitationId: invitationId
            }
          }
        );

      if (emailError) {
        console.error(
          "Invitation email error:",
          emailError
        );

        closeModal();

        alert(
          "Invitation was created, but the email could not be sent.\n\n" +
          "The member can still find the invitation in Shared Expenses."
        );

        return;
      }

      if (emailResult?.success) {
        closeModal();
        alert("Invitation sent successfully by email.");
      } else {
        closeModal();
        alert(
          "Invitation was created, but the email status could not be confirmed."
        );
      }
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
  async function deleteExpense(expenseId) {
  if (currentGroup.role !== "owner") {
    alert("Only the group owner can delete expenses.");
    return;
  }

  const confirmed = confirm(
    "Are you sure you want to delete this expense?\n\n" +
    "This will also remove its split information."
  );

  if (!confirmed) {
    return;
  }

  const { error } = await client.rpc(
    "delete_shared_expense",
    {
      p_expense_id: expenseId
    }
  );

  if (error) {
    alert(error.message);
    return;
  }

  await renderGroup();
}
  function openEditExpenseForm(expense, members, allSplits) {
  const existingSplits = allSplits.filter(
    s => s.expense_id === expense.id
  );

  openModal(`
    <div class="modal-title">Edit Expense</div>

    <form id="editExpenseForm">

      <div class="field">
        <label>Description</label>
        <input
          id="editExpenseDescription"
          required
          maxlength="120"
          value="${esc(expense.description || "")}"
        >
      </div>

      <div class="field">
        <label>Amount (₹)</label>
        <input
          id="editExpenseAmount"
          type="number"
          min="0.01"
          step="0.01"
          required
          value="${esc(expense.amount)}"
        >
      </div>

      <div class="field">
        <label>Date</label>
        <input
          id="editExpenseDate"
          type="date"
          required
          value="${esc(expense.expense_date)}"
        >
      </div>

      <div class="field">
        <label>Paid by</label>

        <select id="editPaidBy">
          ${members.map(m => `
            <option
              value="${esc(m.user_id)}"
              ${m.user_id === expense.paid_by ? "selected" : ""}
            >
              ${
                m.user_id === currentUser.id
                  ? "You"
                  : esc(m.name || m.email || "Member")
              }
            </option>
          `).join("")}
        </select>
      </div>

      <div class="field">
        <label>Category</label>

        <select id="editExpenseCategory">
          ${CATEGORIES.map(c => `
            <option
              ${c === expense.category ? "selected" : ""}
            >
              ${esc(c)}
            </option>
          `).join("")}
        </select>
      </div>

      <div class="field">
        <label>Split</label>

        <select id="editSplitType">
          <option
            value="equal"
            ${expense.split_type === "equal" ? "selected" : ""}
          >
            Equal
          </option>

          <option
            value="custom"
            ${expense.split_type === "custom" ? "selected" : ""}
          >
            Custom
          </option>
        </select>
      </div>

      <div class="field">
        <label>Split between</label>

        <div class="chip-row" id="editMemberChips">

          ${members.map(m => {
            const split = existingSplits.find(
              s => s.user_id === m.user_id
            );

            const selected = !!split;

            return `
              <button
                type="button"
                class="chip-toggle ${selected ? "on" : ""}"
                data-user-id="${esc(m.user_id)}"
              >
                ${
                  m.user_id === currentUser.id
                    ? "You"
                    : esc(m.name || m.email || "Member")
                }
              </button>
            `;
          }).join("")}

        </div>
      </div>

      <div id="editCustomSplitArea"></div>

      <div class="field">
        <label>Notes</label>

        <textarea
          id="editExpenseNotes"
          placeholder="Optional notes"
        >${esc(expense.notes || "")}</textarea>
      </div>

      <div class="modal-actions">
        <button
          type="button"
          class="btn"
          id="cancelEditExpense"
        >
          Cancel
        </button>

        <button
          type="submit"
          class="btn primary"
        >
          Save Changes
        </button>
      </div>

    </form>
  `);

  const chips = [
    ...document.querySelectorAll(
      "#editMemberChips .chip-toggle"
    )
  ];

  chips.forEach(chip => {
    chip.addEventListener("click", () => {
      chip.classList.toggle("on");

      if (!chips.some(c => c.classList.contains("on"))) {
        chip.classList.add("on");
      }

      renderEditCustomSplitInputs();
    });
  });

  document
    .getElementById("editSplitType")
    .addEventListener(
      "change",
      renderEditCustomSplitInputs
    );

  document
    .getElementById("cancelEditExpense")
    .addEventListener(
      "click",
      closeModal
    );

  function renderEditCustomSplitInputs() {
    const area = document.getElementById(
      "editCustomSplitArea"
    );

    if (
      document.getElementById("editSplitType").value !==
      "custom"
    ) {
      area.innerHTML = "";
      return;
    }

    area.innerHTML = chips
      .filter(c => c.classList.contains("on"))
      .map(chip => {

        const existing = existingSplits.find(
          s => s.user_id === chip.dataset.userId
        );

        return `
          <div class="field custom-split-row">

            <label>
              ${esc(chip.textContent.trim())}
              share (₹)
            </label>

            <input
              class="edit-custom-share"
              type="number"
              min="0"
              step="0.01"
              data-user-id="${esc(chip.dataset.userId)}"
              required
              value="${existing ? existing.share_amount : 0}"
            >

          </div>
        `;
      })
      .join("");
  }

  renderEditCustomSplitInputs();

  document
    .getElementById("editExpenseForm")
    .addEventListener("submit", async e => {

      e.preventDefault();

      const description =
        document
          .getElementById("editExpenseDescription")
          .value
          .trim();

      const amount =
        Number(
          document
            .getElementById("editExpenseAmount")
            .value
        );

      const expenseDate =
        document.getElementById(
          "editExpenseDate"
        ).value;

      const paidBy =
        document.getElementById(
          "editPaidBy"
        ).value;

      const category =
        document.getElementById(
          "editExpenseCategory"
        ).value;

      const splitType =
        document.getElementById(
          "editSplitType"
        ).value;

      const notes =
        document.getElementById(
          "editExpenseNotes"
        ).value
        .trim();

      const selectedUsers = chips
        .filter(c =>
          c.classList.contains("on")
        )
        .map(c => c.dataset.userId);

      if (!selectedUsers.length) {
        alert("Select at least one member.");
        return;
      }

      let splitRows = [];

      if (splitType === "equal") {

        const share =
          amount / selectedUsers.length;

        splitRows =
          selectedUsers.map(userId => ({
            user_id: userId,
            share_amount:
              Number(share.toFixed(2))
          }));

        const difference =
          Number(
            (
              amount -
              splitRows.reduce(
                (sum, row) =>
                  sum + row.share_amount,
                0
              )
            ).toFixed(2)
          );

        if (difference !== 0) {
          splitRows[0].share_amount += difference;
        }

      } else {

        const inputs = [
          ...document.querySelectorAll(
            ".edit-custom-share"
          )
        ];

        splitRows = inputs.map(input => ({
          user_id: input.dataset.userId,
          share_amount:
            Number(input.value || 0)
        }));

        const total =
          splitRows.reduce(
            (sum, row) =>
              sum + row.share_amount,
            0
          );

        if (
          Math.abs(total - amount) > 0.01
        ) {
          alert(
            `Custom split must equal ${money(amount)}. ` +
            `Current total is ${money(total)}.`
          );
          return;
        }
      }

      const { error } = await client.rpc(
        "update_shared_expense",
        {
          p_expense_id: expense.id,
          p_description: description,
          p_amount: amount,
          p_expense_date: expenseDate,
          p_paid_by: paidBy,
          p_category: category,
          p_notes: notes,
          p_split_type: splitType,
          p_split_rows: splitRows
        }
      );

      if (error) {
        alert(error.message);
        return;
      }

      closeModal();

      await renderGroup();
    });
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
              <option
                value="${esc(m.user_id)}"
                ${m.user_id === currentUser.id ? "selected" : ""}
              >
                ${m.user_id === currentUser.id
                  ? "You"
                  : esc(m.name || m.email || "Member")}
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
              >
                ${m.user_id === currentUser.id
                  ? "You"
                  : esc(m.name || m.email || "Member")}
                  </button>
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
            ${people.map(m => `
              <option value="${esc(m.user_id)}">
              ${esc(m.name || m.email || "Member")}
            </option>
          `).join("")}
          </select>
        </div>

        <div class="field">
          <label>To</label>
          <select id="settlementTo">
            ${people.map(m => `
              <option value="${esc(m.user_id)}">
              ${esc(m.name || m.email || "Member")}
            </option>
          `).join("")}
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

    // Expenses
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "shared_expenses",
        filter: `group_id=eq.${groupId}`
      },
      async () => {
        try {
          await renderGroup();
        } catch (error) {
          console.error("Realtime expense update error:", error);
        }
      }
    )

    // Expense splits
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "shared_expense_splits"
      },
      async () => {
        try {
          await renderGroup();
        } catch (error) {
          console.error("Realtime split update error:", error);
        }
      }
    )

    // Settlements
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "shared_expense_settlements",
        filter: `group_id=eq.${groupId}`
      },
      async () => {
        try {
          await renderGroup();
        } catch (error) {
          console.error("Realtime settlement update error:", error);
        }
      }
    )

    // Group members
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "shared_expense_group_members",
        filter: `group_id=eq.${groupId}`
      },
      async () => {
        try {
          await renderGroup();
        } catch (error) {
          console.error("Realtime member update error:", error);
        }
      }
    )

    .subscribe((status) => {
      console.log(
        `Shared Expenses realtime status for ${groupId}:`,
        status
      );
    });
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
