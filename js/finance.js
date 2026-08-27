(() => {
  "use strict";
  const PM = window.PM;
  const view = document.getElementById("view");
  const CATS = ["Food & Groceries","Electricity","Water","Gas","Internet / Mobile","House Rent","Education","Medical","Travel","Shopping","Insurance","Entertainment","Household","Vehicle","Subscriptions","Other"];

  function render() {
    view.innerHTML = `
      <h1 class="page-title">Finance</h1>
      <p class="page-subtitle">Track home expenses, maintenance costs and calculate EMI.</p>

      <div class="section">
        <div class="section-head"><span class="section-title">Home Expenses</span><button class="btn primary" id="addExpense" type="button">+ Add Expense</button></div>
        <div class="finance-grid">
          <div class="field"><label>From date</label><input type="date" id="homeFrom"></div>
          <div class="field"><label>To date</label><input type="date" id="homeTo"></div>
        </div>
        <div class="modal-actions">
          <button class="btn primary" id="viewHome" type="button">View Expenses</button>
          <button class="btn" id="downloadHome" type="button" disabled>Download Excel (.xls)</button>
        </div>
        <div id="homeResults"><div class="empty">Select a period and tap View Expenses.</div></div>
      </div>

      <div class="section">
        <div class="section-head"><span class="section-title">EMI Calculator</span></div>
        <div class="field"><label>Loan Amount (₹)</label><input id="emiPrincipal" type="number" min="0" step="1000"></div>
        <div class="field"><label>Interest Rate (% per year)</label><input id="emiRate" type="number" min="0" step="0.01"></div>
        <div class="field"><label>Loan Tenure (years)</label><input id="emiYears" type="number" min="1" step="1"></div>
        <button class="btn primary" id="calcEmi" type="button">Calculate EMI</button>
        <div id="emiResult"></div>
      </div>
    `;

    document.getElementById("addExpense").onclick = () => openExpenseForm();
    document.getElementById("viewHome").onclick = viewHome;
    document.getElementById("downloadHome").onclick = downloadHome;
    document.getElementById("calcEmi").onclick = calculateEMI;
  }

  function openExpenseForm(old=null) {
    const edit=!!old;
    const category=old?.category||"Other";
    const known=CATS.includes(category) ? category : "Other";

    PM.modal(`
      <div class="modal-title">${edit?"Edit expense":"Add expense"}</div>
      <form id="expenseForm">
        <div class="field"><label>Expense name</label><input name="name" required value="${PM.escape(old?.name||"")}" placeholder="e.g. Groceries"></div>

        <div class="field">
          <label>Category</label>
          <select id="expenseCategory" name="category">
            ${CATS.map(c=>`<option value="${PM.escape(c)}" ${known===c?"selected":""}>${PM.escape(c)}</option>`).join("")}
          </select>
        </div>

        <div class="field" id="customCategoryWrap" style="display:${known==="Other" ? "block":"none"}">
          <label>Custom category</label>
          <input id="customCategory" name="customCategory" value="${known==="Other" && category!=="Other" ? PM.escape(category) : ""}" placeholder="e.g. Home Repair">
        </div>

        <div class="field"><label>Amount (₹)</label><input name="amount" type="number" min="0.01" step="0.01" required value="${old?.amount||""}"></div>
        <div class="field"><label>Date</label><input name="expenseDate" type="date" required value="${PM.escape(old?.expense_date||new Date().toISOString().slice(0,10))}"></div>
        <div class="field"><label>Notes</label><textarea name="notes">${PM.escape(old?.notes||"")}</textarea></div>
        <div id="expenseStatus" class="status"></div>
        <div class="modal-actions">
          ${edit?'<button type="button" class="btn danger" id="delExpense">Delete Entry</button>':""}
          <button type="button" class="btn" id="cancelExpense">Cancel</button>
          <button type="submit" class="btn primary" id="saveExpense">Save</button>
        </div>
      </form>`);

    const cat=document.getElementById("expenseCategory");
    const customWrap=document.getElementById("customCategoryWrap");
    cat.onchange=()=>customWrap.style.display=cat.value==="Other"?"block":"none";

    document.getElementById("cancelExpense").onclick=PM.closeModal;

    if(edit) document.getElementById("delExpense").onclick=async()=>{
      if(!confirm("Delete this expense?"))return;
      try{
        const {error}=await PM.client.from("finance_expenses").delete().eq("id",old.id).eq("user_id",PM.user.id);
        if(error)throw error;
        PM.closeModal(); await viewHome();
      }catch(e){alert(e.message||String(e));}
    };

    document.getElementById("expenseForm").onsubmit=async e=>{
      e.preventDefault();
      const btn=document.getElementById("saveExpense"),status=document.getElementById("expenseStatus");
      btn.disabled=true;btn.textContent="Saving...";
      try{
        const fd=new FormData(e.target);
        let finalCategory=String(fd.get("category")||"Other");
        if(finalCategory==="Other"){
          finalCategory=String(fd.get("customCategory")||"").trim()||"Other";
        }
        const rec={
          id:old?.id||PM.uuid(),
          user_id:PM.user.id,
          name:String(fd.get("name")||"").trim(),
          category:finalCategory,
          amount:Number(fd.get("amount")),
          expense_date:String(fd.get("expenseDate")),
          notes:String(fd.get("notes")||"").trim()||null,
          updated_at:new Date().toISOString()
        };
        if(!rec.name||!Number.isFinite(rec.amount)||rec.amount<=0||!rec.expense_date)throw new Error("Please complete all required fields.");
        if(!edit)rec.created_at=new Date().toISOString();

        const {error}=await PM.client.from("finance_expenses").upsert(rec,{onConflict:"id"});
        if(error)throw error;

        PM.closeModal();
        await viewHome();
      }catch(err){
        status.textContent=err.message||String(err);
        btn.disabled=false;btn.textContent="Save";
      }
    };
  }

  async function viewHome() {
    try {
      const from=document.getElementById("homeFrom").value, to=document.getElementById("homeTo").value;
      if(from&&to&&from>to){alert("From date cannot be after To date.");return;}

      let q=PM.client.from("finance_expenses")
        .select("id,name,category,amount,expense_date,notes,created_at")
        .eq("user_id",PM.user.id)
        .order("expense_date",{ascending:false});
      if(from)q=q.gte("expense_date",from);
      if(to)q=q.lte("expense_date",to);
      const {data,error}=await q;if(error)throw error;

      const home=data||[];
      let mq=PM.client.from("maintenance_expenses")
        .select("item_name,amount,service_date,notes")
        .eq("user_id",PM.user.id)
        .order("service_date",{ascending:false});
      if(from)mq=mq.gte("service_date",from);
      if(to)mq=mq.lte("service_date",to);
      const {data:maint,error:me}=await mq;
      if(me)throw me;
      const maintenance=maint||[];

      const homeTotal=home.reduce((s,r)=>s+Number(r.amount||0),0);
      const maintTotal=maintenance.reduce((s,r)=>s+Number(r.amount||0),0);
      const total=homeTotal+maintTotal;
      const byCat={};
      home.forEach(r=>{const k=r.category||"Other";byCat[k]=(byCat[k]||0)+Number(r.amount||0);});
      maintenance.forEach(r=>{const k=`Maintenance - ${r.item_name||"Other item"}`;byCat[k]=(byCat[k]||0)+Number(r.amount||0);});

      document.getElementById("homeResults").innerHTML=`
        <div class="section"><div class="finance-big">₹${PM.money(total)}</div><div class="card-sub">Total expenses</div></div>
        <div class="section"><div class="section-title">Expense Breakdown</div><div class="finance-grid">
          <div class="stat-card"><div class="stat-num">₹${PM.money(homeTotal)}</div><div class="stat-label">Home expenses</div></div>
          <div class="stat-card"><div class="stat-num">₹${PM.money(maintTotal)}</div><div class="stat-label">Maintenance</div></div>
        </div></div>
        <div class="section"><div class="section-title">Expense by Category / Item</div>
          <table class="summary-table"><tr><th>Category / Item</th><th>Total</th></tr>
          ${Object.entries(byCat).sort((a,b)=>b[1]-a[1]).map(([k,v])=>`<tr><td>${PM.escape(k)}</td><td>₹${PM.money(v)}</td></tr>`).join("")||"<tr><td colspan='2'>No expenses</td></tr>"}
          </table>
        </div>
        <div class="section"><div class="section-title">Expense Details</div>
          <table class="summary-table"><tr><th>Date</th><th>Item</th><th>Category</th><th>Amount</th></tr>
          ${home.map(r=>`<tr><td>${PM.escape(PM.dateText(r.expense_date))}</td><td>${PM.escape(r.name)}</td><td>${PM.escape(r.category||"Other")}</td><td>₹${PM.money(r.amount)}</td></tr>`).join("")}
          ${maintenance.map(r=>`<tr><td>${PM.escape(PM.dateText(r.service_date))}</td><td>${PM.escape(r.item_name||"Maintenance")}</td><td>Maintenance</td><td>₹${PM.money(r.amount)}</td></tr>`).join("")}
          </table>
        </div>`;

      const btn=document.getElementById("downloadHome");
      btn.disabled=!(home.length||maintenance.length);
      btn.dataset.rows=JSON.stringify({home,maintenance,from,to});
    } catch(e) {
      document.getElementById("homeResults").innerHTML=`<div class="error">${PM.escape(e.message||e)}</div>`;
    }
  }

  function downloadHome(){
    const raw=document.getElementById("downloadHome").dataset.rows;if(!raw)return;
    const {home,maintenance,from,to}=JSON.parse(raw);
    const rows=[
      ...home.map(r=>({date:r.expense_date,item:r.name,category:r.category,amount:r.amount,notes:r.notes||""})),
      ...maintenance.map(r=>({date:r.service_date,item:r.item_name||"Maintenance",category:"Maintenance",amount:r.amount,notes:r.notes||""}))
    ];
    const html=`<!doctype html><html><head><meta charset="utf-8"><style>body{font-family:Arial}table{border-collapse:collapse}th,td{border:1px solid #999;padding:7px 10px}</style></head><body><h1>Personal Manager - Finance Expenses</h1><p>Period: ${PM.escape(from||"All")} to ${PM.escape(to||"All")}</p><table><tr><th>Date</th><th>Item</th><th>Category</th><th>Amount</th><th>Notes</th></tr>${rows.map(r=>`<tr><td>${PM.escape(r.date)}</td><td>${PM.escape(r.item)}</td><td>${PM.escape(r.category)}</td><td>${Number(r.amount||0).toFixed(2)}</td><td>${PM.escape(r.notes)}</td></tr>`).join("")}</table></body></html>`;
    const blob=new Blob([html],{type:"application/vnd.ms-excel"}),url=URL.createObjectURL(blob),a=document.createElement("a");
    a.href=url;a.download=`finance-expenses-${from||"all"}-to-${to||"all"}.xls`;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }

  function calculateEMI(){
    const p=Number(document.getElementById("emiPrincipal").value)||0;
    const annual=Number(document.getElementById("emiRate").value)||0;
    const years=Number(document.getElementById("emiYears").value)||0;
    if(!p||!years){alert("Please enter loan amount and tenure.");return;}
    const n=years*12,r=annual/12/100;
    const emi=r===0?p/n:p*r*Math.pow(1+r,n)/(Math.pow(1+r,n)-1);
    const total=emi*n,interest=total-p;
    document.getElementById("emiResult").innerHTML=`
      <div class="section">
        <div class="finance-result-row finance-highlight"><span>Monthly EMI</span><strong>₹${PM.money(emi)}</strong></div>
        <div class="finance-result-row"><span>Total Payment</span><strong>₹${PM.money(total)}</strong></div>
        <div class="finance-result-row"><span>Total Interest</span><strong>₹${PM.money(interest)}</strong></div>
        <div class="finance-result-row"><span>Number of Payments</span><strong>${n}</strong></div>
      </div>`;
  }

  (async()=>{
    try{await PM.initPage("finance");render();}
    catch(e){view.innerHTML=`<div class="error">${PM.escape(e.message||String(e))}</div>`;}
  })();
})();