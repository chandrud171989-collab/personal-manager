(() => {
  "use strict";
  const PM = window.PM;
  const ITEMS = ["AC","RO / Water Purifier","Refrigerator","Washing Machine","Geyser","Vehicle Service","Home Cleaning","Pest Control","Electrical/Plumbing","Other"];
  const TYPES = ["Appliance","Vehicle","Service"];
  const REM = [30,7,1];
  const view = document.getElementById("view");

  async function load() {
    const { data, error } = await PM.client
      .from("maintenance")
      .select("id,user_id,type,item_name,last_service_date,next_service_date,cost,notes,reminders,created_at,updated_at")
      .eq("user_id", PM.user.id)
      .order("created_at",{ascending:false});
    if (error) throw error;
    return data || [];
  }

  async function saveExpense(item) {
    if (item.cost == null || !Number.isFinite(Number(item.cost)) || Number(item.cost) <= 0) return;
    const serviceDate = item.last_service_date || item.next_service_date || new Date().toISOString().slice(0,10);
    const payload = {
      user_id: PM.user.id,
      maintenance_id: item.id,
      item_name: item.item_name || "Other item",
      service_date: serviceDate,
      amount: Number(item.cost),
      notes: item.notes || null,
      updated_at: new Date().toISOString()
    };
    try {
      const { data: existing, error: findError } = await PM.client
        .from("maintenance_expenses")
        .select("id")
        .eq("user_id", PM.user.id)
        .eq("maintenance_id", item.id)
        .eq("service_date", serviceDate)
        .maybeSingle();
      if (findError) throw findError;

      if (existing?.id) {
        const { error } = await PM.client.from("maintenance_expenses")
          .update(payload)
          .eq("id", existing.id)
          .eq("user_id", PM.user.id);
        if (error) throw error;
      } else {
        const { error } = await PM.client.from("maintenance_expenses").insert(payload);
        if (error) throw error;
      }
    } catch (e) {
      console.warn("Maintenance expense sync skipped:", e.message || e);
    }
  }

  function selectedReminder(row) {
    if (!Array.isArray(row?.reminders) || !row.reminders.length) return null;
    const n = Number(row.reminders[0]);
    return Number.isInteger(n) ? n : null;
  }

  function render(rows) {
    view.innerHTML = `
      <h1 class="page-title">Maintenance</h1>
      <p class="page-subtitle">Track home and vehicle servicing.</p>
      <div class="section">
        <div class="section-head"><span class="section-title">Home Items</span><span class="section-count">${rows.length}</span></div>
        ${rows.length ? rows.map(m => {
          const days = PM.daysUntil(m.next_service_date);
          return `<div class="card status-${PM.statusClass(days)}" data-id="${PM.escape(m.id)}">
            <div class="card-main">
              <div class="card-title">${PM.escape(m.item_name || "Other item")}</div>
              <div class="card-sub">${PM.escape(m.type || "")}${m.type ? " · " : ""}Next service ${PM.escape(PM.dateText(m.next_service_date))}${m.cost != null ? ` · ₹${PM.money(m.cost)}` : ""}</div>
            </div>
            <div class="card-chip chip-${PM.statusClass(days)}">${PM.escape(PM.statusLabel(days))}</div>
          </div>`;
        }).join("") : '<div class="empty">No items yet. Tap + to add one.</div>'}
      </div>

      <div class="section">
        <div class="section-head"><span class="section-title">Maintenance Expense Summary</span></div>
        <div class="finance-grid">
          <div class="field"><label>From date</label><input type="date" id="expenseFrom"></div>
          <div class="field"><label>To date</label><input type="date" id="expenseTo"></div>
        </div>
        <div class="modal-actions">
          <button class="btn primary" id="viewExpenses" type="button">View Expenses</button>
          <button class="btn" id="downloadExpenses" type="button" disabled>Download Excel (.xls)</button>
        </div>
        <div id="expenseResults"><div class="empty">Select a period and tap View Expenses.</div></div>
      </div>`;

    view.querySelectorAll(".card[data-id]").forEach(el => el.onclick = () => {
      const row = rows.find(x => x.id === el.dataset.id);
      if (row) openDetail(row);
    });
    document.getElementById("viewExpenses").onclick = renderExpenseSummary;
    document.getElementById("downloadExpenses").onclick = downloadXLS;
  }

  function openDetail(m) {
    const reminder = selectedReminder(m);
    PM.modal(`
      <div class="modal-title">${PM.escape(m.item_name || "Maintenance item")}</div>
      <div class="detail-row"><span>Type</span><strong>${PM.escape(m.type || "—")}</strong></div>
      <div class="detail-row"><span>Last serviced</span><strong>${PM.escape(PM.dateText(m.last_service_date))}</strong></div>
      <div class="detail-row"><span>Service due</span><strong>${PM.escape(PM.dateText(m.next_service_date))}</strong></div>
      ${m.cost != null ? `<div class="detail-row"><span>Cost</span><strong>₹${PM.money(m.cost)}</strong></div>` : ""}
      <div class="detail-row"><span>Reminder</span><strong>${reminder ? `${reminder} day${reminder>1?"s":""} before` : "None"}</strong></div>
      ${m.notes ? `<div class="detail-row"><span>Notes</span><span>${PM.escape(m.notes)}</span></div>` : ""}
      <div class="modal-actions">
        <button class="btn" id="closeMaint" type="button">Close</button>
        <button class="btn primary" id="editMaint" type="button">Edit</button>
      </div>`);
    document.getElementById("closeMaint").onclick = PM.closeModal;
    document.getElementById("editMaint").onclick = () => { PM.closeModal(); openForm(m); };
  }

  function openForm(old=null) {
    const edit = !!old;
    const id = old?.id || PM.uuid();
    const today = new Date().toISOString().slice(0,10);
    let reminder = selectedReminder(old);

    PM.modal(`
      <div class="modal-title">${edit ? "Edit home item" : "Add home item"}</div>
      <form id="maintForm">
        <div class="field">
          <label>Type</label>
          <select id="typeSelect" name="type">
            ${TYPES.map(t=>`<option value="${PM.escape(t)}" ${(old?.type===t) || (!old && t==="Appliance") ? "selected":""}>${PM.escape(t)}</option>`).join("")}
          </select>
        </div>
        <div class="field">
          <label>Item</label>
          <select id="itemSelect" name="item">
            ${ITEMS.map(x=>`<option value="${PM.escape(x)}" ${(!old && x==="AC") || old?.item_name===x ? "selected":""}>${PM.escape(x)}</option>`).join("")}
          </select>
        </div>
        <div class="field" id="customItemWrap" style="display:${old && !ITEMS.includes(old.item_name) ? "block":"none"}">
          <label>Custom item name</label>
          <input id="customItem" name="customItem" value="${PM.escape(old && !ITEMS.includes(old.item_name) ? old.item_name : "")}" placeholder="e.g. Water heater">
        </div>
        <div class="field"><label>Last service date</label><input type="date" name="lastServiceDate" value="${PM.escape(old?.last_service_date || "")}" max="${today}"><small>Today or a past date only.</small></div>
        <div class="field"><label>Service due date</label><input type="date" name="nextServiceDate" required value="${PM.escape(old?.next_service_date || "")}" min="${today}"><small>Today or a future date only.</small></div>
        <div class="field"><label>Cost (₹)</label><input type="number" name="cost" min="0" step="0.01" value="${old?.cost ?? ""}" placeholder="0"></div>
        <div class="field"><label>Remind me before service</label>
          <div class="chip-row" id="maintRem">
            ${REM.map(n=>`<button type="button" class="chip-toggle ${reminder===n?"on":""}" data-val="${n}">${n} day${n>1?"s":""}</button>`).join("")}
            <button type="button" class="chip-toggle ${reminder && !REM.includes(reminder)?"on":""}" id="customRemBtn">Custom</button>
          </div>
          <div id="maintCustomWrap" style="display:${reminder && !REM.includes(reminder)?"block":"none"};margin-top:12px">
            <label style="text-transform:none">Custom reminder (days)</label>
            <input id="maintCustom" type="number" min="1" max="365" value="${reminder && !REM.includes(reminder)?reminder:""}">
          </div>
        </div>
        <div class="field"><label>Notes</label><textarea name="notes" placeholder="Optional notes">${PM.escape(old?.notes || "")}</textarea></div>
        <div id="maintStatus" class="status"></div>
        <div class="modal-actions">
          ${edit?'<button type="button" class="btn danger" id="deleteMaint">Delete Entry</button>':""}
          <button type="button" class="btn" id="cancelMaint">Cancel</button>
          <button type="submit" class="btn primary" id="saveMaint">Save</button>
        </div>
      </form>`);

    const itemSelect=document.getElementById("itemSelect");
    const customItemWrap=document.getElementById("customItemWrap");
    itemSelect.onchange=()=>customItemWrap.style.display=itemSelect.value==="Other"?"block":"none";

    const chips=[...document.querySelectorAll("#maintRem .chip-toggle[data-val]")];
    const customBtn=document.getElementById("customRemBtn");
    const customWrap=document.getElementById("maintCustomWrap");
    const customInput=document.getElementById("maintCustom");
    const clearRem=()=>{chips.forEach(x=>x.classList.remove("on"));customBtn.classList.remove("on");customWrap.style.display="none";customInput.value="";reminder=null;};
    chips.forEach(c=>c.onclick=()=>{clearRem();reminder=Number(c.dataset.val);c.classList.add("on")});
    customBtn.onclick=()=>{if(customBtn.classList.contains("on"))clearRem();else{clearRem();customBtn.classList.add("on");customWrap.style.display="block";customInput.focus();}};
    document.getElementById("cancelMaint").onclick=PM.closeModal;

    if(edit) document.getElementById("deleteMaint").onclick=async()=>{
      if(!confirm("Delete this maintenance item?"))return;
      try{
        const {error}=await PM.client.from("maintenance").delete().eq("id",old.id).eq("user_id",PM.user.id);
        if(error)throw error;
        PM.closeModal(); render(await load());
      }catch(e){alert(`Could not delete item: ${e.message||e}`);}
    };

    document.getElementById("maintForm").onsubmit=async e=>{
      e.preventDefault();
      const btn=document.getElementById("saveMaint"),status=document.getElementById("maintStatus");
      btn.disabled=true;btn.textContent="Saving...";
      try{
        const fd=new FormData(e.target);
        const type=String(fd.get("type")||"Appliance");
        const selected=String(fd.get("item")||"Other");
        const custom=String(fd.get("customItem")||"").trim();
        const itemName=selected==="Other"?(custom||"Other item"):selected;
        const last=String(fd.get("lastServiceDate")||"")||null;
        const next=String(fd.get("nextServiceDate")||"");
        const costText=String(fd.get("cost")||"");
        if(!next)throw new Error("Please select a service due date.");
        if(last&&last>today)throw new Error("Last serviced date cannot be in the future.");
        if(last&&next<=last)throw new Error("Service due date must be after the last serviced date.");
        if(costText&&Number(costText)<0)throw new Error("Service cost cannot be negative.");

        let finalReminder=reminder;
        if(customBtn.classList.contains("on")){
          finalReminder=Number(customInput.value);
          if(!Number.isInteger(finalReminder)||finalReminder<1||finalReminder>365)throw new Error("Custom reminder must be between 1 and 365 days.");
        }

        const userNotes=String(fd.get("notes")||"").trim()||null;
        status.textContent="Saving...";

        const record={
          id,user_id:PM.user.id,
          type,
          item_name:itemName,
          last_service_date:last,
          next_service_date:next,
          cost:costText===""?null:Number(costText),
          notes:userNotes,
          reminders:finalReminder===null?[]:[finalReminder],
          updated_at:new Date().toISOString()
        };
        if(!edit)record.created_at=new Date().toISOString();

        const {error}=await PM.client.from("maintenance").upsert(record,{onConflict:"id"});
        if(error)throw error;

        await saveExpense(record);
        PM.closeModal();
        render(await load());
      }catch(e){console.error(e);status.textContent=e.message||String(e);btn.disabled=false;btn.textContent="Save";}
    };
  }

  async function fetchExpenses(from,to){
    let q=PM.client.from("maintenance_expenses")
      .select("id,maintenance_id,item_name,service_date,amount,notes,created_at")
      .eq("user_id",PM.user.id).order("service_date",{ascending:false});
    if(from)q=q.gte("service_date",from);
    if(to)q=q.lte("service_date",to);
    const {data,error}=await q;
    if(error)throw error;
    return data||[];
  }

  function renderExpense(rows){
    const total=rows.reduce((s,r)=>s+Number(r.amount||0),0);
    const byItem={};
    rows.forEach(r=>{const k=r.item_name||"Other item";byItem[k]=(byItem[k]||0)+Number(r.amount||0);});
    const summary=Object.entries(byItem).sort((a,b)=>b[1]-a[1]).map(([k,v])=>`<tr><td>${PM.escape(k)}</td><td>₹${PM.money(v)}</td></tr>`).join("");
    const details=rows.map(r=>`<tr><td>${PM.escape(PM.dateText(r.service_date))}</td><td>${PM.escape(r.item_name||"Other item")}</td><td>₹${PM.money(r.amount)}</td><td>${PM.escape(r.notes||"")}</td></tr>`).join("");
    document.getElementById("expenseResults").innerHTML=`
      <div class="section"><div class="finance-big">₹${PM.money(total)}</div><div class="card-sub">Total expenses</div></div>
      <div class="section"><div class="section-title">Expense by Item</div><table class="summary-table"><tr><th>Item</th><th>Total</th></tr>${summary||"<tr><td colspan='2'>No expenses</td></tr>"}</table></div>
      <div class="section"><div class="section-title">Expense Details</div><table class="summary-table"><tr><th>Date</th><th>Item</th><th>Amount</th><th>Notes</th></tr>${details||"<tr><td colspan='4'>No expenses found for this period.</td></tr>"}</table></div>`;
    const btn=document.getElementById("downloadExpenses");
    btn.disabled=!rows.length;
    btn.dataset.rows=JSON.stringify({rows});
  }

  async function renderExpenseSummary(){
    const from=document.getElementById("expenseFrom").value,to=document.getElementById("expenseTo").value;
    if(from&&to&&from>to){alert("From date cannot be after To date.");return;}
    try{document.getElementById("expenseResults").innerHTML='<div class="empty">Loading expenses...</div>';renderExpense(await fetchExpenses(from,to));}
    catch(e){document.getElementById("expenseResults").innerHTML=`<div class="error">${PM.escape(e.message||e)}</div>`;}
  }

  function downloadXLS(){
    const raw=document.getElementById("downloadExpenses").dataset.rows;if(!raw)return;
    const {rows}=JSON.parse(raw);
    const html=`<!doctype html><html><head><meta charset="utf-8"><style>body{font-family:Arial}table{border-collapse:collapse}th,td{border:1px solid #999;padding:7px 10px}</style></head><body><h1>Personal Manager - Maintenance Expenses</h1><table><tr><th>Date</th><th>Item</th><th>Amount</th><th>Notes</th></tr>${rows.map(r=>`<tr><td>${PM.escape(r.service_date||"")}</td><td>${PM.escape(r.item_name||"Other item")}</td><td>${Number(r.amount||0).toFixed(2)}</td><td>${PM.escape(r.notes||"")}</td></tr>`).join("")}</table></body></html>`;
    const blob=new Blob([html],{type:"application/vnd.ms-excel"}),url=URL.createObjectURL(blob),a=document.createElement("a");
    a.href=url;a.download=`maintenance-expenses.xls`;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }

  async function start(){
    try{
      await PM.initPage("maintenance");
      document.getElementById("fab").onclick=()=>openForm();
      render(await load());
    }catch(e){view.innerHTML=`<div class="error">Unable to start Maintenance<br>${PM.escape(e.message||e)}</div>`;}
  }
  start();
})();
