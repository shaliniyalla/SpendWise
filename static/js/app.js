const CATS=["Food","Travel","Shopping","Education","Entertainment","Bills & Utilities"];
const COL=["#c49a3f","#2e8b83","#b5586b","#0f4c45","#4a6fa5","#8a9189"];
const ICON=Object.fromEntries(CATS.map((c,i)=>[c,`<i class="dot" style="background:${COL[i]}"></i>`]));
const TRY=["coffee and sandwich","auto from college to home","bought a notebook","movie tickets","electricity bill","new shoes"];
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
const esc=s=>String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const inr=n=>"₹"+Number(n).toLocaleString("en-IN",{maximumFractionDigits:2});
const opts=all=>(all?'<option value="">All categories</option>':"")+CATS.map(c=>`<option>${esc(c)}</option>`).join("");
let tx=[],me=null,pred=null,chart=null,mchart=null,editId=null,mode="login";

async function api(url,o={}){
  const r=await fetch(url,{method:o.method||"GET",headers:{"Content-Type":"application/json"},body:o.body?JSON.stringify(o.body):undefined});
  const d=await r.json().catch(()=>({}));
  if(!r.ok){if(r.status===401&&!["/api/login","/api/me"].includes(url))showAuth();throw new Error(d.error||"Something went wrong.")}
  return d;
}
function toast(m){const t=$("#toast");t.textContent=m;t.classList.add("show");setTimeout(()=>t.classList.remove("show"),2200)}
function countUp(el,v,fmt=inr){const t0=performance.now();(function f(t){const k=Math.min(1,(t-t0)/700);el.textContent=fmt(v*(1-Math.pow(1-k,3)));if(k<1)requestAnimationFrame(f)})(t0)}
const sum=a=>a.reduce((s,t)=>s+t.amount,0);
const monthKey=()=>new Date().toISOString().slice(0,7);
function byCat(){const m=Object.fromEntries(CATS.map(c=>[c,0]));tx.forEach(t=>m[t.category]=(m[t.category]||0)+t.amount);return m}
function topCat(){const e=Object.entries(byCat()).sort((a,b)=>b[1]-a[1])[0];return e&&e[1]>0?e:null}
const stat=(a,b,id)=>`<div class="stat"><span class="muted">${a}</span><b ${id?`data-n="${id}"`:""}>${b}</b></div>`;

// ---- startup, splash, auth ----
function showAuth(){$("#app").hidden=true;$("#auth").hidden=false;startDemo()}
async function boot(){
  const wait=new Promise(r=>setTimeout(r,1900));
  const u=await api("/api/me").catch(()=>null);await wait;
  if(u)await start(u);else showAuth();
  $("#splash").classList.add("hide");
}
function setMode(m){mode=m;const r=m==="register";$$("[data-auth]").forEach(x=>x.classList.toggle("on",x.dataset.auth===m));$("#a-name-w").hidden=!r;$("#a-go").textContent=r?"Create account":"Log in";$("#a-title").textContent=r?"Create your account":"Welcome back";$("#a-sub").textContent=r?"It takes less than a minute.":"Log in to see your spending.";$("#a-err").textContent=""}
$$("[data-auth]").forEach(b=>b.onclick=()=>setMode(b.dataset.auth));
$$("[data-open]").forEach(b=>b.onclick=()=>{setMode(b.dataset.open);$("#auth-dlg").showModal()});
$("#a-close").onclick=()=>$("#auth-dlg").close();
$("#lp-cats").innerHTML=CATS.map((c,i)=>`<div class="catitem" style="border-top-color:${COL[i]}"><h3>${esc(c)}</h3><p class="muted">${["Lunch, groceries, coffee","Auto, bus, train, petrol","Clothes, shoes, gadgets","Books, pens, course fees","Movies, games, streaming","Electricity, recharge, rent"][i]}</p></div>`).join("");
// live demo on the landing page
const sleep=ms=>new Promise(r=>setTimeout(r,ms)),DEMO=[["auto from college to home",130,"Travel"],["bought a notebook and pens",65,"Education"],["coffee and sandwich",90,"Food"],["electricity bill",840,"Bills & Utilities"],["movie tickets",300,"Entertainment"]];
let demoOn=false;
async function startDemo(){
  if(demoOn)return;demoOn=true;const w=$("#rc-what"),m=$("#rc-amt"),s=$("#rc-stamp"),still=matchMedia("(prefers-reduced-motion:reduce)").matches;let i=0;
  while(!$("#auth").hidden){const [t,a,c]=DEMO[i++%DEMO.length];s.classList.remove("on");m.textContent="";w.textContent="";
    if(still){w.textContent=t;m.textContent=a}else{for(const ch of t){w.textContent+=ch;await sleep(48)}await sleep(250);m.textContent=a;await sleep(500)}
    s.innerHTML=ICON[c]+esc(c);s.classList.add("on");if(still)break;await sleep(2300)}
  demoOn=false;
}
$("#a-go").onclick=async()=>{
  try{await start(await api("/api/"+mode,{method:"POST",body:{name:$("#a-name").value,email:$("#a-email").value,password:$("#a-pass").value}}))}
  catch(e){$("#a-err").textContent=e.message}
};
["#a-email","#a-pass","#a-name"].forEach(s=>$(s).addEventListener("keydown",e=>e.key==="Enter"&&$("#a-go").click()));
async function logout(){await api("/api/logout",{method:"POST"});tx=[];me=null;pred=null;$("#a-pass").value="";showAuth()}
async function start(u){
  me=u;$("#auth-dlg").open&&$("#auth-dlg").close();$("#auth").hidden=true;$("#app").hidden=false;setUser();tx=await api("/api/transactions");go("overview");loadModel();
}
function setUser(){const i=me.name.trim()[0].toUpperCase();$("#top-av").textContent=i;$("#pf-av").textContent=i}

// ---- navigation ----
function go(p){
  $$(".page").forEach(s=>s.hidden=s.id!=="p-"+p);$$("#nav button").forEach(b=>b.classList.toggle("on",b.dataset.page===p));
  ({overview:renderOverview,transactions:renderTx,analysis:renderAnalysis,profile:renderProfile})[p]?.();window.scrollTo(0,0);
}
$$("#nav button").forEach(b=>b.onclick=()=>go(b.dataset.page));
document.addEventListener("click",e=>{const g=e.target.closest("[data-go]");if(g)go(g.dataset.go)});
$("#top-av").onclick=()=>go("profile");

// ---- home ----
function txRow(t){return `<div class="row"><div>${ICON[t.category]||""} ${esc(t.description)}<div class="muted">${t.date}</div></div><div><span class="pill">${esc(t.category)}</span> <b>${inr(t.amount)}</b></div></div>`}
function renderOverview(){
  const h=new Date().getHours(),g=h<12?"Good morning":h<17?"Good afternoon":"Good evening",top=topCat();
  $("#welcome").textContent=`${g}, ${me.name.split(" ")[0]}`;
  const mt=sum(tx.filter(t=>t.date.startsWith(monthKey())));countUp($("#ov-month"),mt);
  const bd=$("#ov-budget");
  if(me.budget>0){const pc=mt/me.budget*100;bd.innerHTML=`<div class="bar"><i class="${pc>=90?"hot":""}" style="width:${Math.min(100,pc)}%"></i></div>${pc.toFixed(0)}% of your ${inr(me.budget)} budget used${pc>=100?" – over budget":""}`}
  else bd.innerHTML='No budget yet. <a data-go="profile">Set one in Profile</a>';
  $("#ov-stats").innerHTML=stat("All-time spending",inr(0),"t")+stat("Expenses saved",0,"c")+stat("Top category",top?ICON[top[0]]+" "+top[0]:"–");
  countUp($('[data-n="t"]'),sum(tx));countUp($('[data-n="c"]'),tx.length,v=>Math.round(v));
  const m=byCat(),max=Math.max(1,...Object.values(m));
  $("#ov-cats").innerHTML=CATS.map(c=>`<div class="row"><span>${ICON[c]} ${esc(c)}</span><div class="mbar"><i style="width:${m[c]/max*100}%"></i></div><b>${inr(m[c])}</b></div>`).join("");
  const mo={},now=new Date(),ks=[];for(let i=5;i>=0;i--){const d=new Date(now.getFullYear(),now.getMonth()-i,1);ks.push(d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0"))}
  tx.forEach(t=>mo[t.date.slice(0,7)]=(mo[t.date.slice(0,7)]||0)+t.amount);
  if(mchart)mchart.destroy();
  mchart=new Chart($("#mchart"),{type:"bar",data:{labels:ks.map(k=>new Date(k+"-01").toLocaleString("en",{month:"short"})),datasets:[{data:ks.map(k=>mo[k]||0),backgroundColor:"#0f4c45",borderRadius:6}]},options:{maintainAspectRatio:false,plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>inr(c.raw)}}},scales:{y:{beginAtZero:true,grid:{color:"#eee"}},x:{grid:{display:false}}}}});
  $("#ov-recent").innerHTML=tx.length?tx.slice(0,5).map(txRow).join(""):'<div class="empty"><p class="muted">No expenses yet. Add your first one to get started.</p></div>';
}

// ---- add expense ----
$("#chips").innerHTML=TRY.map(t=>`<button type="button">${t}</button>`).join("");
$$("#chips button").forEach(b=>b.onclick=()=>{$("#f-desc").value=b.textContent;$("#f-amt").focus()});
$("#f-pred").onclick=async()=>{
  const d=$("#f-desc").value.trim(),a=parseFloat($("#f-amt").value),e=$("#f-err");e.textContent="";
  if(!d)return e.textContent="Write what you spent on.";
  if(!(a>0))return e.textContent="Enter an amount greater than 0.";
  const b=$("#f-pred");b.disabled=true;b.textContent="Thinking…";
  try{pred=await api("/api/predict",{method:"POST",body:{description:d}});showPred(pred)}
  catch(x){e.textContent=x.message;pred=null;$("#pred-body").hidden=true;$("#pred-empty").hidden=false}
  finally{b.disabled=false;b.textContent="Find category"}
};
function showPred(r){
  $("#pred-empty").hidden=true;$("#pred-body").hidden=false;
  $("#pd-icon").innerHTML=ICON[r.category];$("#pd-cat").textContent=r.category;$("#pd-conf").textContent=(r.confidence*100).toFixed(0)+"%";
  $("#pd-bar").style.width="0";setTimeout(()=>$("#pd-bar").style.width=r.confidence*100+"%",30);
  $("#pd-sel").innerHTML=opts();$("#pd-sel").value=r.category;
  $("#pd-why").textContent=(r.keywords.length?`Based on the words "${r.keywords.join('", "')}".`:"")+(r.confidence<0.45?" Not very sure, so please check the category.":"");
  $("#pd-top").innerHTML=r.top.map(t=>`<div class="row"><span>${ICON[t.category]} ${esc(t.category)}</span><span>${(t.probability*100).toFixed(0)}%</span></div>`).join("");
}
$("#f-save").onclick=async()=>{
  if(!pred)return;
  try{const t=await api("/api/transactions",{method:"POST",body:{description:$("#f-desc").value,amount:$("#f-amt").value,category:$("#pd-sel").value,predicted_category:pred.category,confidence:pred.confidence}});
    tx.unshift(t);tx.sort((a,b)=>b.date.localeCompare(a.date)||b.id-a.id);pred=null;$("#f-desc").value="";$("#f-amt").value="";$("#pred-body").hidden=true;$("#pred-empty").hidden=false;toast("Expense saved ✓");go("transactions")}
  catch(e){$("#f-err").textContent=e.message}
};

// ---- transactions ----
["#t-q","#t-cat","#t-sort"].forEach(s=>$(s).oninput=renderTx);
function renderTx(){
  const q=$("#t-q").value.toLowerCase(),c=$("#t-cat").value,s=$("#t-sort").value;
  const l=tx.filter(t=>t.description.toLowerCase().includes(q)&&(!c||t.category===c));
  l.sort((a,b)=>s==="old"?a.date.localeCompare(b.date)||a.id-b.id:s==="hi"?b.amount-a.amount:s==="lo"?a.amount-b.amount:b.date.localeCompare(a.date)||b.id-a.id);
  $("#t-body").innerHTML=l.length?l.map(t=>`<tr><td>${t.date}</td><td>${esc(t.description)}</td><td><span class="pill">${ICON[t.category]} ${esc(t.category)}</span></td><td class="r"><b>${inr(t.amount)}</b></td><td class="r"><button class="ghost" data-e="${t.id}">Edit</button><button class="ghost" data-d="${t.id}">Delete</button></td></tr>`).join(""):'<tr><td colspan="5" class="muted">No expenses to show.</td></tr>';
  $$("[data-e]").forEach(b=>b.onclick=()=>openEdit(+b.dataset.e));$$("[data-d]").forEach(b=>b.onclick=()=>del(+b.dataset.d));
}
async function del(id){
  if(!confirm("Delete this expense? This cannot be undone."))return;
  try{await api("/api/transactions/"+id,{method:"DELETE"});tx=tx.filter(t=>t.id!==id);renderTx();toast("Expense deleted")}catch(e){toast(e.message)}
}
function openEdit(id){const t=tx.find(x=>x.id===id);editId=id;$("#e-desc").value=t.description;$("#e-amt").value=t.amount;$("#e-cat").value=t.category;$("#e-date").value=t.date;$("#e-err").textContent="";$("#dlg").showModal()}
$("#e-cancel").onclick=()=>$("#dlg").close();
$("#e-form").onsubmit=async ev=>{
  ev.preventDefault();
  try{const t=await api("/api/transactions/"+editId,{method:"PUT",body:{description:$("#e-desc").value,amount:$("#e-amt").value,category:$("#e-cat").value,date:$("#e-date").value}});
    tx=tx.map(x=>x.id===editId?t:x);$("#dlg").close();renderTx();toast("Changes saved ✓")}catch(e){$("#e-err").textContent=e.message}
};

// ---- insights ----
function renderAnalysis(){
  const m=byCat(),tot=sum(tx),top=topCat();
  $("#an-empty").hidden=tot>0;$("#chart").parentElement.hidden=!(tot>0);if(chart)chart.destroy();
  if(tot>0)chart=new Chart($("#chart"),{type:"doughnut",data:{labels:CATS,datasets:[{data:CATS.map(c=>m[c]),backgroundColor:COL,borderWidth:2,borderColor:"#fff"}]},options:{maintainAspectRatio:false,cutout:"62%",plugins:{legend:{position:"bottom"},tooltip:{callbacks:{label:c=>`${c.label}: ${inr(c.raw)}`}}}}});
  $("#an-top").innerHTML=top?`<p><span class="big">${ICON[top[0]]}</span> <b>${esc(top[0])}</b> · ${inr(top[1])}</p>`:'<p class="muted">No data yet.</p>';
  const pc=c=>tot?(m[c]/tot*100).toFixed(1):"0.0";
  $("#an-list").innerHTML=CATS.map(c=>`<div class="row"><span>${ICON[c]} ${esc(c)}</span><span>${inr(m[c])} · ${pc(c)}%</span></div>`).join("");
  $("#an-cards").innerHTML=CATS.map((c,i)=>`<div class="stat" style="border-top:4px solid ${COL[i]}"><span class="muted">${ICON[c]} ${esc(c)}</span><b>${inr(m[c])}</b><span class="muted">${tx.filter(t=>t.category===c).length} expenses · ${pc(c)}%</span></div>`).join("");
}

// ---- profile & settings ----
function renderProfile(){
  $("#pf-name").textContent=me.name;$("#pf-email").textContent=me.email;
  $("#pf-since").textContent=me.created?"Member since "+new Date(me.created).toLocaleDateString("en-IN",{day:"numeric",month:"long",year:"numeric"}):"";
  const top=topCat();$("#pf-stats").innerHTML=stat("Expenses saved",tx.length)+stat("Total spent",inr(sum(tx)))+stat("Favourite category",top?ICON[top[0]]+" "+top[0]:"–");
  $("#pf-n").value=me.name;$("#pf-b").value=me.budget||"";["#pf-err","#pw-err"].forEach(s=>$(s).textContent="");
}
$("#pf-save").onclick=async()=>{
  try{me=await api("/api/profile",{method:"PUT",body:{name:$("#pf-n").value,budget:$("#pf-b").value||0}});setUser();renderProfile();toast("Profile updated ✓")}catch(e){$("#pf-err").textContent=e.message}
};
$("#pw-save").onclick=async()=>{
  try{await api("/api/password",{method:"POST",body:{current:$("#pw-c").value,new:$("#pw-n").value}});$("#pw-c").value=$("#pw-n").value="";$("#pw-err").textContent="";toast("Password updated ✓")}catch(e){$("#pw-err").textContent=e.message}
};
$("#export").onclick=()=>{
  const q=v=>'"'+String(v).replace(/"/g,'""')+'"',csv=["Date,Description,Category,Amount"].concat(tx.map(t=>[t.date,q(t.description),q(t.category),t.amount].join(","))).join("\n");
  const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([csv],{type:"text/csv"}));a.download="spendwise-expenses.csv";a.click();
};
$("#logout").onclick=logout;
$("#del-acc").onclick=async()=>{
  if(!confirm("Delete your account and all expenses permanently?"))return;
  try{await api("/api/account",{method:"DELETE"});tx=[];me=null;showAuth();toast("Account deleted")}catch(e){toast(e.message)}
};

// ---- project info ----
async function loadModel(){
  try{
    const m=await api("/api/model-info"),p=x=>(x*100).toFixed(1)+"%";
    $("#m-info").innerHTML=`<h3>The model</h3><div class="row"><span>Algorithm</span><b>${esc(m.algorithm)}</b></div><div class="row"><span>Features</span><b>${esc(m.features)}</b></div><div class="row"><span>Dataset size</span><b>${m.dataset_size}</b></div><div class="row"><span>Train / test</span><b>${m.train_size} / ${m.test_size}</b></div><p class="muted">Categories: ${m.categories.map(esc).join(", ")}</p>`;
    $("#m-metrics").innerHTML=`<h3>Measured on held-out test data</h3><div class="row"><span>Accuracy</span><b>${p(m.accuracy)}</b></div><div class="row"><span>Precision (macro)</span><b>${p(m.macro_precision)}</b></div><div class="row"><span>Recall (macro)</span><b>${p(m.macro_recall)}</b></div><div class="row"><span>F1-score (macro)</span><b>${p(m.macro_f1)}</b></div><div class="row"><span>Strict test (unseen items)</span><b>${p(m.strict_unseen_item_accuracy)}</b></div><p class="note">The dataset is synthetic, so the main scores are optimistic. The strict test is closer to real use.</p>`;
  }catch(e){}
}
$("#t-cat").innerHTML=opts(true);$("#e-cat").innerHTML=opts();
boot();
