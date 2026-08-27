(() => {
  "use strict";
  const PM = window.PM;
  const BUCKET = "documents";
  const MAX = 6 * 1024 * 1024;
  const CATS = ["Aadhaar","PAN","ID / Driving License","Passport","Voter ID","Warranty","Vehicle RC","Subscription","Property","Education Certificate","Other"];
  const REMINDERS = [30,7,1];
  const view = document.getElementById("view");

  async function load() {
    const { data, error } = await PM.client
      .from("documents")
      .select("*")
      .eq("user_id", PM.user.id)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data || [];
  }

  async function uploadEncryptedFile(file, userId, docId) {
    if (!file) return null;
    if (file.size > MAX) throw new Error("Maximum file size is 6 MB.");
    if (!["application/pdf","image/jpeg","image/png"].includes(file.type)) {
      throw new Error("Only PDF, JPG or PNG files are allowed.");
    }

    const encrypted = await PM.encryptFile(file);
    const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `${userId}/${docId}/${Date.now()}-${safe}.enc`;

    const { error } = await PM.client.storage.from(BUCKET).upload(path, encrypted, {
      cacheControl: "3600",
      contentType: "application/octet-stream",
      upsert: false
    });

    if (error) throw new Error(`Encrypted file upload failed: ${error.message}`);
    return path;
  }

  async function removeFile(path) {
    if (!path) return;
    const { error } = await PM.client.storage.from(BUCKET).remove([path]);
    if (error) console.warn("Storage delete:", error.message);
  }

  async function viewFile(doc) {
    if (!doc.file_path) throw new Error("No file is attached to this document.");
    if (!PM.documentKey) throw new Error("Document encryption is locked. Please log in again.");

    const popup = window.open("about:blank", "_blank");
    try {
      const { data, error } = await PM.client.storage.from(BUCKET).download(doc.file_path);
      if (error) throw error;

      const decrypted = await PM.decryptBlob(data, doc.file_type || "application/pdf");
      const url = URL.createObjectURL(decrypted);

      if (popup) {
        popup.location.href = url;
        setTimeout(() => URL.revokeObjectURL(url), 60000);
      } else {
        window.location.href = url;
        setTimeout(() => URL.revokeObjectURL(url), 60000);
      }
    } catch (e) {
      if (popup) popup.close();
      throw new Error(`Could not open encrypted file: ${e.message || e}`);
    }
  }

  function render(rows) {
    view.innerHTML = `
      <h1 class="page-title">Documents</h1>
      <p class="page-subtitle">Store your important documents securely.</p>
      <div class="section">
        <div class="section-head"><span class="section-title">All documents</span><span class="section-count">${rows.length}</span></div>
        ${rows.length ? rows.map(d => `
          <div class="card" data-id="${PM.escape(d.id)}">
            <div class="card-main">
              <div class="card-title">${PM.escape(d.name)}</div>
              <div class="card-sub">${PM.escape(d.category || "Other")} · ${d.expiry_date ? `expires ${PM.escape(PM.dateText(d.expiry_date))}` : "No expiry"}${d.file_name ? ` · ${PM.escape(d.file_name)}` : ""}</div>
            </div>
            <div class="card-chip chip-green">${d.file_path ? "Encrypted file" : "No file"}</div>
          </div>`).join("") : '<div class="empty">No documents yet. Tap + to add one.</div>'}
      </div>`;
    view.querySelectorAll(".card[data-id]").forEach(el => {
      el.onclick = () => {
        const d = rows.find(x => x.id === el.dataset.id);
        if (d) openDetail(d);
      };
    });
  }

  function openDetail(d) {
    PM.modal(`
      <div class="modal-title">${PM.escape(d.name)}</div>
      <div class="detail-row"><span>Category</span><strong>${PM.escape(d.category || "Other")}</strong></div>
      ${d.issue_date ? `<div class="detail-row"><span>Issue date</span><strong>${PM.escape(PM.dateText(d.issue_date))}</strong></div>` : ""}
      <div class="detail-row"><span>Expiry</span><strong>${PM.escape(d.expiry_date ? PM.dateText(d.expiry_date) : "No expiry")}</strong></div>
      <div class="detail-row"><span>File</span><strong>${PM.escape(d.file_name || "No file attached")}</strong></div>
      ${d.file_path ? `<div class="detail-row"><span>Storage</span><strong>Encrypted</strong></div>` : ""}
      ${d.notes ? `<div class="detail-row"><span>Notes</span><span>${PM.escape(d.notes)}</span></div>` : ""}
      <div class="modal-actions">
        ${d.file_path ? `<button class="btn primary" id="viewDocFile" type="button">View File</button>` : ""}
        <button class="btn" id="editDoc" type="button">Edit</button>
        <button class="btn" id="closeDoc" type="button">Close</button>
      </div>`);
    document.getElementById("closeDoc").onclick = PM.closeModal;
    document.getElementById("editDoc").onclick = () => { PM.closeModal(); openForm(d); };
    document.getElementById("viewDocFile")?.addEventListener("click", async () => {
      try { await viewFile(d); } catch (e) { alert(e.message); }
    });
  }

  function openForm(old = null) {
    const edit = !!old;
    const id = old?.id || PM.uuid();
    let reminder = old?.reminder_days ?? null;
    const noExpiry = !!old && !old.expiry_date;

    PM.modal(`
      <div class="modal-title">${edit ? "Edit document" : "Add document"}</div>
      <form id="docForm">
        <div class="field"><label>Document name</label><input name="name" required value="${PM.escape(old?.name || "")}" placeholder="e.g. Car insurance"></div>
        <div class="field"><label>Category</label>
          <select name="category">${CATS.map(c => `<option ${old?.category===c ? "selected" : ""}>${PM.escape(c)}</option>`).join("")}</select>
        </div>
        <div class="field"><label>Issue date</label><input type="date" name="issueDate" value="${PM.escape(old?.issue_date || "")}"></div>
        <div class="field"><label>Expiry date</label><input id="expiryDate" type="date" name="expiryDate" value="${PM.escape(old?.expiry_date || "")}" ${noExpiry ? "disabled" : ""}></div>
        <div class="field"><label style="text-transform:none"><input id="noExpiry" type="checkbox" ${noExpiry ? "checked" : ""}> No expiry</label></div>
        <div class="field"><label>Remind me before expiry</label>
          <div class="chip-row" id="docReminderChips">
            ${REMINDERS.map(n => `<button type="button" class="chip-toggle ${reminder===n ? "on":""}" data-val="${n}">${n} day${n>1?"s":""}</button>`).join("")}
            <button type="button" class="chip-toggle ${reminder && !REMINDERS.includes(reminder) ? "on":""}" id="customReminderBtn">Custom</button>
          </div>
          <div id="customReminderWrap" style="display:${reminder && !REMINDERS.includes(reminder) ? "block":"none"};margin-top:12px">
            <label style="text-transform:none">Custom reminder (days)</label>
            <input id="customReminder" type="number" min="1" max="365" value="${reminder && !REMINDERS.includes(reminder) ? reminder : ""}">
          </div>
        </div>
        <div class="field"><label>Notes</label><textarea name="notes" placeholder="Optional notes">${PM.escape(old?.notes || "")}</textarea></div>
        <div class="field"><label>Photo / PDF</label>
          <div class="filepick">
            <span class="filepick-name" id="fileName">${PM.escape(old?.file_name || "No file attached")}</span>
            <button class="filepick-btn" id="chooseFile" type="button">Choose File</button>
            <input id="fileInput" type="file" accept="application/pdf,image/jpeg,image/png">
          </div>
          <small>PDF, JPG or PNG. Maximum 6 MB. The file is encrypted in your browser before upload.</small>
        </div>
        <div id="docStatus" class="status"></div>
        <div class="modal-actions">
          ${edit ? '<button type="button" class="btn danger" id="deleteDoc">Delete Entry</button>' : ""}
          <button type="button" class="btn" id="cancelDoc">Cancel</button>
          <button type="submit" class="btn primary" id="saveDoc">Save</button>
        </div>
      </form>
    `);

    let selectedFile = null;
    const chips = [...document.querySelectorAll("#docReminderChips .chip-toggle[data-val]")];
    const no = document.getElementById("noExpiry");
    const expiry = document.getElementById("expiryDate");
    const customBtn = document.getElementById("customReminderBtn");
    const customWrap = document.getElementById("customReminderWrap");
    const customInput = document.getElementById("customReminder");

    const clearReminder = () => {
      chips.forEach(x => x.classList.remove("on"));
      customBtn.classList.remove("on");
      customWrap.style.display = "none";
      customInput.value = "";
      reminder = null;
    };

    chips.forEach(chip => chip.onclick = () => {
      if (no.checked) return;
      clearReminder();
      reminder = Number(chip.dataset.val);
      chip.classList.add("on");
    });

    customBtn.onclick = () => {
      if (no.checked) return;
      if (customBtn.classList.contains("on")) clearReminder();
      else {
        clearReminder();
        customBtn.classList.add("on");
        customWrap.style.display = "block";
        customInput.focus();
      }
    };

    function expiryState() {
      expiry.disabled = no.checked;
      chips.forEach(x => x.disabled = no.checked);
      customBtn.disabled = no.checked;
      if (no.checked) clearReminder();
    }
    no.onchange = expiryState;
    expiryState();

    document.getElementById("chooseFile").onclick = () => document.getElementById("fileInput").click();
    document.getElementById("fileInput").onchange = e => {
      selectedFile = e.target.files[0] || null;
      if (selectedFile) document.getElementById("fileName").textContent = selectedFile.name;
    };
    document.getElementById("cancelDoc").onclick = PM.closeModal;

    if (edit) {
      document.getElementById("deleteDoc").onclick = async () => {
        if (!confirm("Delete this document entry?")) return;
        try {
          const { error } = await PM.client.from("documents").delete().eq("id", old.id).eq("user_id", PM.user.id);
          if (error) throw error;
          await removeFile(old.file_path);
          PM.closeModal();
          render(await load());
        } catch (e) {
          alert(`Could not delete document: ${e.message || e}`);
        }
      };
    }

    document.getElementById("docForm").onsubmit = async e => {
      e.preventDefault();
      const btn = document.getElementById("saveDoc");
      const status = document.getElementById("docStatus");
      btn.disabled = true;
      btn.textContent = "Saving...";

      let uploadedPath = null;
      try {
        const fd = new FormData(e.target);
        const name = String(fd.get("name") || "").trim();
        const issue = String(fd.get("issueDate") || "") || null;
        const exp = no.checked ? null : (String(fd.get("expiryDate") || "") || null);

        if (!name) throw new Error("Please enter a document name.");
        if (issue && exp && issue > exp) throw new Error("Expiry date must be after the issue date.");

        let finalReminder = reminder;
        if (!no.checked && customBtn.classList.contains("on")) {
          finalReminder = Number(customInput.value);
          if (!Number.isInteger(finalReminder) || finalReminder < 1 || finalReminder > 365) {
            throw new Error("Custom reminder must be between 1 and 365 days.");
          }
        }
        if (no.checked) finalReminder = null;

        if (selectedFile) {
          status.textContent = "Encrypting file in your browser...";
          uploadedPath = await uploadEncryptedFile(selectedFile, PM.user.id, id);
        }

        status.textContent = "Saving document...";
        const record = {
          id,
          user_id: PM.user.id,
          category: String(fd.get("category") || "Other"),
          name,
          issue_date: issue,
          expiry_date: exp,
          notes: String(fd.get("notes") || "").trim() || null,
          reminder_days: finalReminder,
          file_path: uploadedPath || old?.file_path || null,
          file_name: selectedFile ? selectedFile.name : (old?.file_name || null),
          file_type: selectedFile ? selectedFile.type : (old?.file_type || null),
          file_size: selectedFile ? selectedFile.size : (old?.file_size || null),
          updated_at: new Date().toISOString()
        };
        if (!edit) record.created_at = new Date().toISOString();

        const { error } = await PM.client.from("documents").upsert(record, { onConflict: "id" });
        if (error) throw error;

        if (selectedFile && old?.file_path && old.file_path !== uploadedPath) {
          await removeFile(old.file_path);
        }

        status.textContent = "Saved successfully.";
        PM.closeModal();
        render(await load());
      } catch (e) {
        console.error("Document save error:", e);
        if (uploadedPath) await removeFile(uploadedPath);
        status.textContent = e.message || String(e);
        btn.disabled = false;
        btn.textContent = "Save";
      }
    };
  }

  async function start() {
    try {
      await PM.initPage("documents");

      const fab = document.getElementById("fab");

      if (fab) {
        fab.onclick = () => openForm();
      }

      render(await load());
    } catch (e) {
      console.error(e);
      view.innerHTML = `<div class="error">Unable to start Documents.<br>${PM.escape(e.message || String(e))}</div>`;
    }
  }
  start();
})();