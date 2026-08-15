const KEY="resilient3tmbg_v2";
const API_URL="/api/data";
const DEFAULT_DB={nodes:[],routes:[],risks:[],weather:[]};
function normalizeDb(value){
 const base={...DEFAULT_DB};
 if(!value||typeof value!=="object")return base;
 base.nodes=Array.isArray(value.nodes)?value.nodes:[];
 base.routes=Array.isArray(value.routes)?value.routes:[];
 base.risks=Array.isArray(value.risks)?value.risks:[];
 base.weather=Array.isArray(value.weather)?value.weather:[];
 return base;
}
function loadDb(){
 try{
  const raw=localStorage.getItem(KEY);
  if(!raw)return {...DEFAULT_DB};
  const parsed=JSON.parse(raw);
  const safe=normalizeDb(parsed);
  localStorage.setItem(KEY,JSON.stringify(safe));
  return safe;
 }catch(error){
  console.warn("Data lokal rusak atau tidak bisa dibaca:",error);
  localStorage.setItem(KEY,JSON.stringify(DEFAULT_DB));
  return {...DEFAULT_DB};
 }
}
async function fetchDbFromServer(){
 try{
  const response=await fetch(API_URL,{method:"GET",headers:{"Content-Type":"application/json"}});
  if(!response.ok)throw new Error("Server not available");
  const data=await response.json();
  return normalizeDb(data);
 }catch(error){
  console.warn("Server tidak tersedia, memakai data lokal:",error);
  return loadDb();
 }
}
async function syncDbToServer(){
 try{
  const response=await fetch(API_URL,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(db)});
  if(!response.ok)throw new Error("Save failed");
  const data=await response.json();
  db=normalizeDb(data);
 }catch(error){
  console.warn("Sinkronisasi server gagal, data tetap tersimpan di browser:",error);
  localStorage.setItem(KEY,JSON.stringify(normalizeDb(db)));
 }
}
let db=loadDb();
const titles={dashboard:"Dashboard",input:"Input Data",network:"Network Map",regionalmap:"Peta Papua Barat Daya",weather:"BMKG & Cuaca",route:"Route Planning",risk:"Risk & Alert",capacity:"Capacity Check",backup:"Backup Network",backupdata:"Backup Data"};
document.querySelectorAll(".nav button").forEach(b=>b.onclick=()=>showPage(b.dataset.page));
function showPage(id){document.querySelectorAll(".nav button").forEach(b=>b.classList.toggle("active",b.dataset.page===id));document.querySelectorAll(".page").forEach(p=>p.classList.toggle("active",p.id===id));document.getElementById("title").textContent=titles[id];refresh();}
async function save(){
 try{
  db=normalizeDb(db);
  localStorage.setItem(KEY,JSON.stringify(db));
  await syncDbToServer();
  refresh();
 }catch(error){
  console.error("Gagal menyimpan data lokal:",error);
  alert("Gagal menyimpan data. Coba cek server atau browser Anda.");
 }
}
function refresh(){
 document.getElementById("mNodes").textContent=db.nodes.length;document.getElementById("mRoutes").textContent=db.routes.length;document.getElementById("mRisk").textContent=db.risks.length;document.getElementById("mSaved").textContent=db.nodes.length+db.routes.length+db.risks.length;
 fillSelects();renderTables();renderRisks();renderWeather();drawMaps();
}
function fillSelects(){
 ["rFrom","rTo","pFrom","pTo"].forEach(id=>{const s=document.getElementById(id);if(!s)return;s.innerHTML=db.nodes.map(n=>`<option value="${n.id}">${n.name}</option>`).join("")});
 const c=document.getElementById("capNode");if(c)c.innerHTML=db.nodes.map(n=>`<option value="${n.id}">${n.name}</option>`).join("");
}
function renderTables(){
 const nt=document.getElementById("nodeTable");if(nt)nt.innerHTML=db.nodes.length?`<table><tr><th>Nama</th><th>Jenis</th><th>Wilayah</th><th>Kapasitas</th><th></th></tr>${db.nodes.map(n=>`<tr><td>${n.name}</td><td>${n.type}</td><td>${n.area||"-"}</td><td>${n.cap||0}</td><td><button class="btn danger" onclick="delNode('${n.id}')">Hapus</button></td></tr>`).join("")}</table>`:"<div class='info'>Belum ada node. Tambahkan data di atas.";
 const rt=document.getElementById("routeTable");if(rt)rt.innerHTML=db.routes.length?`<table><tr><th>Asal</th><th>Tujuan</th><th>Moda</th><th>Waktu</th><th>Risiko</th><th></th></tr>${db.routes.map(r=>`<tr><td>${name(r.from)}</td><td>${name(r.to)}</td><td>${r.mode}</td><td>${r.time} mnt</td><td>${r.risk}</td><td><button class="btn danger" onclick="delRoute('${r.id}')">Hapus</button></td></tr>`).join("")}</table>`:"<div class='info'>Belum ada rute.</div>";
}
function renderRisks(){const el=document.getElementById("riskList");if(!el)return;el.innerHTML=db.risks.length?db.risks.map(r=>`<div class="alert ${r.level==="Tinggi"?"bad":r.level==="Sedang"?"warn":"good"}"><b>${r.level} — ${r.type}</b><br>${r.location}<br>${r.note||""}<br><button class="btn danger" onclick="delRisk('${r.id}')">Hapus</button></div>`).join(""):"<div class='info'>Belum ada gangguan.</div>"}
function name(id){return db.nodes.find(n=>n.id===id)?.name||"Unknown"}
function delNode(id){db.nodes=db.nodes.filter(n=>n.id!==id);db.routes=db.routes.filter(r=>r.from!==id&&r.to!==id);save()}
function delRoute(id){db.routes=db.routes.filter(r=>r.id!==id);save()}
function delRisk(id){db.risks=db.risks.filter(r=>r.id!==id);save()}
document.getElementById("nodeForm").onsubmit=e=>{e.preventDefault();db.nodes.push({id:crypto.randomUUID(),name:nName.value,type:nType.value,area:nArea.value,cap:+nCap.value,x:+nX.value,y:+nY.value,note:nNote.value});e.target.reset();save();alert("Node tersimpan offline.")};
document.getElementById("routeForm").onsubmit=e=>{e.preventDefault();if(!rFrom.value||!rTo.value||rFrom.value===rTo.value)return alert("Pilih asal dan tujuan yang berbeda.");db.routes.push({id:crypto.randomUUID(),from:rFrom.value,to:rTo.value,mode:rMode.value,time:+rTime.value,risk:rRisk.value,cap:+rCap.value});e.target.reset();save();alert("Rute tersimpan offline.")};
document.getElementById("riskForm").onsubmit=e=>{e.preventDefault();db.risks.push({id:crypto.randomUUID(),type:riskType.value,location:riskLoc.value,level:riskLevel.value,note:riskNote.value});e.target.reset();save();alert("Gangguan tersimpan offline.")};


document.getElementById("weatherForm").onsubmit=e=>{
 e.preventDefault();
 const item={
   id:crypto.randomUUID(),
   area:weatherArea.value,
   status:weatherStatus.value,
   risk:weatherRisk.value,
   time:weatherTime.value || new Date().toISOString().slice(0,16),
   note:weatherNote.value
 };
 db.weather.unshift(item);
 db.weather=db.weather.slice(0,20);
 save();
 alert("Kondisi cuaca tersimpan offline.");
};

function refreshBMKGStatus(){
 const now=new Date();
 const local=new Date(now.getTime()-now.getTimezoneOffset()*60000).toISOString().slice(0,16);
 document.getElementById("weatherTime").value=local;
}

function renderWeather(){
 const el=document.getElementById("weatherLocalList");
 if(!el)return;
 const may=db.weather.find(x=>x.area==="Maybrat");
 const tam=db.weather.find(x=>x.area==="Tambrauw");
 document.getElementById("maybratWeather").textContent=may ? `${may.status} · Risiko ${may.risk} · update ${may.time}` : "Belum ada data cuaca lokal.";
 document.getElementById("tambrauwWeather").textContent=tam ? `${tam.status} · Risiko ${tam.risk} · update ${tam.time}` : "Belum ada data cuaca lokal.";
 el.innerHTML=db.weather.length ? db.weather.map(x=>`<div class="alert ${x.risk==="Tinggi"?"bad":x.risk==="Sedang"?"warn":"good"}"><b>${x.area} — ${x.status}</b><br>Risiko distribusi: ${x.risk}<br>Update: ${x.time}<br>${x.note||""}<br><button class="btn danger" onclick="delWeather('${x.id}')">Hapus</button></div>`).join("") : "<div class='info'>Belum ada data cuaca yang disimpan.</div>";
}
function delWeather(id){db.weather=db.weather.filter(x=>x.id!==id);save()}

function drawMaps(){["dashMap","networkMap"].forEach(id=>drawMap(id));}
function drawMap(id){
 const map=document.getElementById(id);if(!map)return;map.innerHTML="";
 const w=map.clientWidth,h=map.clientHeight;
 db.routes.forEach(r=>{const a=db.nodes.find(n=>n.id===r.from),b=db.nodes.find(n=>n.id===r.to);if(!a||!b)return;const x1=a.x/100*w,y1=a.y/100*h,x2=b.x/100*w,y2=b.y/100*h,dx=x2-x1,dy=y2-y1,line=document.createElement("div");line.className="route "+(r.mode.includes("Laut")?"sea":"land");line.style.left=x1+"px";line.style.top=y1+"px";line.style.width=Math.hypot(dx,dy)+"px";line.style.transform=`rotate(${Math.atan2(dy,dx)}rad)`;map.appendChild(line)});
 db.nodes.forEach(n=>{const el=document.createElement("div");el.className="node "+n.type;el.style.left=`calc(${n.x}% - 9px)`;el.style.top=`calc(${n.y}% - 9px)`;el.title=n.name;map.appendChild(el);const l=document.createElement("div");l.className="nlabel";l.textContent=n.name;l.style.left=`calc(${n.x}% + 10px)`;l.style.top=`calc(${n.y}% - 8px)`;map.appendChild(l)});
 const lg=document.createElement("div");lg.className="legend";lg.innerHTML="<b>Legenda</b><div><i class='lg' style='background:#27b36d'></i>SPPG</div><div><i class='lg' style='background:#4386e9'></i>Hub</div><div><i class='lg' style='background:#f0a33a'></i>Sekolah</div><div>━━ Darat</div><div style='color:#39b9ef'>╌╌ Laut</div>";map.appendChild(lg);
}
function findRoutes(){
 const a=pFrom.value,b=pTo.value;if(!a||!b)return;
 const rs=db.routes.filter(r=>r.from===a&&r.to===b||r.from===b&&r.to===a).sort((x,y)=>x.time-y.time);
 document.getElementById("routeResults").innerHTML=rs.length?rs.map((r,i)=>`<div class="alert ${r.risk==="Tinggi"?"bad":r.risk==="Sedang"?"warn":"good"}"><b>${i===0?"⭐ MOST RELIABLE — ":""}${r.mode}</b><br>${r.time} menit · Risiko ${r.risk} · Kapasitas ${r.cap} porsi/hari</div>`).join(""):"<div class='info'>Belum ada rute langsung antara node tersebut. Tambahkan rute pada menu Input Data.</div>";
}
function capacityCheck(){const n=db.nodes.find(x=>x.id===capNode.value),need=+capNeed.value;if(!n)return;const cap=n.cap||0;document.getElementById("capResult").innerHTML=`<div class="alert ${cap>=need?"good":"bad"}"><b>${cap>=need?"✓ KAPASITAS CUKUP":"! KAPASITAS TIDAK CUKUP"}</b><br>Node: ${n.name}<br>Kebutuhan: ${need} porsi/hari<br>Kapasitas: ${cap} porsi/hari<br>Sisa: ${Math.max(0,cap-need)} porsi/hari</div>`}
function buildBackup(){const good=db.routes.filter(r=>r.risk!="Tinggi").sort((a,b)=>a.time-b.time)[0];document.getElementById("backupResult").innerHTML=good?`<div class="alert good"><b>✓ Backup ditemukan</b><br>${name(good.from)} → ${name(good.to)}<br>Moda: ${good.mode} · ${good.time} menit · Risiko ${good.risk}<br>Kapasitas: ${good.cap} porsi/hari</div>`:"<div class='alert bad'>Belum ada rute backup. Masukkan rute dengan risiko rendah/sedang.</div>"}
function exportData(){const blob=new Blob([JSON.stringify(db,null,2)],{type:"application/json"}),a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download="resilient-3t-mbg-backup.json";a.click();URL.revokeObjectURL(a.href)}
document.getElementById("importFile").onchange=e=>{const f=e.target.files[0];if(!f)return;const reader=new FileReader();reader.onload=()=>{try{const x=JSON.parse(reader.result);if(!x.nodes||!x.routes||!x.risks)throw Error();db=x;save();alert("Data berhasil diimport.");}catch{alert("File JSON tidak valid.")}};reader.readAsText(f)}
function clearAll(){if(confirm("Hapus semua data lokal?")){db={...DEFAULT_DB};save()}}
window.addEventListener("resize",drawMaps);
(async function init(){
  db=await fetchDbFromServer();
  refresh();
})();
