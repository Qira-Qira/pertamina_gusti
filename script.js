const KEY="resilient3tmbg_v2";
const API_URL="/api/data";
const DEFAULT_DB={nodes:[],routes:[],risks:[],weather:[]};
let editingNodeId=null;
let editingRouteId=null;
const leafletMaps={};
const routeGeometryCache=new Map();
let clusteringEnabled=true;
const ROUTING_URL="https://router.project-osrm.org/route/v1/driving";
const PAPUA_BOUNDS={south:-2.5,north:0.2,west:129.5,east:133.5};
const CLUSTER_COLORS=["#d94841","#7b61a8","#008c95","#d17a00","#2f7d32","#b23a8f"];
function createId(){return typeof crypto!=="undefined"&&typeof crypto.randomUUID==="function"?crypto.randomUUID():`node-${Date.now()}-${Math.random().toString(36).slice(2,10)}`}
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
const titles={dashboard:"Dashboard",input:"Input Data",network:"Network Map",weather:"BMKG & Cuaca",route:"Route Planning",risk:"Risk & Alert",capacity:"Capacity Check",backup:"Backup Network",backupdata:"Backup Data"};
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
 fillSelects();renderTables();renderRisks();renderWeather();renderMapSearchOptions();updateClusterControl();drawMaps();
}
function updateClusterControl(){const button=document.getElementById("clusterToggle"),status=document.getElementById("clusterStatus");if(button)button.textContent=clusteringEnabled?"Sembunyikan Clustering":"Tampilkan Clustering SPPG";if(status)status.textContent=clusteringEnabled?"Sekolah dikelompokkan ke SPPG terdekat.":"Warna marker kembali ke tipe objek."}
function renderMapSearchOptions(){
 const options=document.getElementById("mapSearchOptions");if(!options)return;
 options.innerHTML=db.nodes.map(node=>`<option value="${node.name}">${node.area||""}</option>`).join("");
}
function fillSelects(){
 const buildOptions=(selectedId)=>{
  const s=document.getElementById(selectedId); if(!s)return;
  const currentValue=s.value || "";
  const options=[`<option value="">-- Pilih node --</option>`].concat(db.nodes.map(n=>`<option value="${n.id}" ${currentValue===n.id?"selected":""}>${n.name}</option>`));
  s.innerHTML=options.join("");
  if(!db.nodes.some(n=>n.id===currentValue)) s.value="";
 };
 ["pFrom","pTo"].forEach(buildOptions);
 const routeOptions=document.getElementById("routeNodeOptions");if(routeOptions)routeOptions.innerHTML=db.nodes.map(n=>`<option value="${n.name}">${n.area||""}</option>`).join("");
 const c=document.getElementById("capNode");if(c){
  const currentValue=c.value||"";
  c.innerHTML=[`<option value="">-- Pilih node --</option>`].concat(db.nodes.map(n=>`<option value="${n.id}" ${currentValue===n.id?"selected":""}>${n.name}</option>`)).join("");
  if(!db.nodes.some(n=>n.id===currentValue)) c.value="";
 }
}
function renderTables(){
 const nodeQuery=(document.getElementById("nodeTableSearch")?.value||"").trim().toLocaleLowerCase();
 const nodes=db.nodes.filter(n=>[n.name,n.type,n.area,n.note].some(value=>String(value||"").toLocaleLowerCase().includes(nodeQuery)));
 const nt=document.getElementById("nodeTable");if(nt)nt.innerHTML=nodes.length?`<table><tr><th>Nama</th><th>Jenis</th><th>Wilayah</th><th>Kapasitas</th><th></th></tr>${nodes.map(n=>`<tr><td>${n.name}</td><td>${n.type}</td><td>${n.area||"-"}</td><td>${n.cap||0}</td><td><button class="btn" onclick="editNode('${n.id}')">Edit</button> <button class="btn danger" onclick="delNode('${n.id}')">Hapus</button></td></tr>`).join("")}</table>`:(db.nodes.length?"<div class='info'>Node tidak ditemukan.</div>":"<div class='info'>Belum ada node. Tambahkan data di atas.");
 const routeQuery=(document.getElementById("routeTableSearch")?.value||"").trim().toLocaleLowerCase();
 const routes=db.routes.filter(r=>[name(r.from),name(r.to),r.mode,r.risk,String(r.time),String(r.cap)].some(value=>String(value||"").toLocaleLowerCase().includes(routeQuery)));
 const rt=document.getElementById("routeTable");if(rt)rt.innerHTML=routes.length?`<table><tr><th>Asal</th><th>Tujuan</th><th>Moda</th><th>Waktu</th><th>Risiko</th><th></th></tr>${routes.map(r=>`<tr><td>${name(r.from)}</td><td>${name(r.to)}</td><td>${r.mode}</td><td>${r.time} mnt</td><td>${r.risk}</td><td><button class="btn" onclick="editRoute('${r.id}')">Edit</button> <button class="btn danger" onclick="delRoute('${r.id}')">Hapus</button></td></tr>`).join("")}</table>`:(db.routes.length?"<div class='info'>Rute tidak ditemukan.</div>":"<div class='info'>Belum ada rute.</div>");
}
document.getElementById("nodeTableSearch")?.addEventListener("input",renderTables);
document.getElementById("routeTableSearch")?.addEventListener("input",renderTables);
function renderRisks(){const el=document.getElementById("riskList");if(!el)return;el.innerHTML=db.risks.length?db.risks.map(r=>`<div class="alert ${r.level==="Tinggi"?"bad":r.level==="Sedang"?"warn":"good"}"><b>${r.level} — ${r.type}</b><br>${r.location}<br>${r.note||""}<br><button class="btn danger" onclick="delRisk('${r.id}')">Hapus</button></div>`).join(""):"<div class='info'>Belum ada gangguan.</div>"}
function name(id){return db.nodes.find(n=>n.id===id)?.name||"Unknown"}
function delNode(id){if(editingNodeId===id)cancelNodeEdit();db.nodes=db.nodes.filter(n=>n.id!==id);db.routes=db.routes.filter(r=>r.from!==id&&r.to!==id);save()}
function editNode(id){
 const n=db.nodes.find(item=>item.id===id);if(!n)return;
 editingNodeId=id;
 document.getElementById("nName").value=n.name||"";document.getElementById("nType").value=n.type||"sppg";document.getElementById("nArea").value=n.area||"";document.getElementById("nCap").value=n.cap||0;document.getElementById("nX").value=n.x??50;document.getElementById("nY").value=n.y??50;document.getElementById("nLat").value=n.lat??"";document.getElementById("nLng").value=n.lng??"";document.getElementById("nNote").value=n.note||"";
 document.getElementById("cancelNodeEdit").hidden=false;document.getElementById("nName").focus();
}
function cancelNodeEdit(){editingNodeId=null;document.getElementById("nodeForm").reset();document.getElementById("cancelNodeEdit").hidden=true}
function editRoute(id){
 const r=db.routes.find(item=>item.id===id);if(!r)return;
 editingRouteId=id;fillSelects();
 document.getElementById("rFrom").value=name(r.from);document.getElementById("rTo").value=name(r.to);document.getElementById("rMode").value=r.mode||"Darat";document.getElementById("rRisk").value=r.risk||"Rendah";
 document.getElementById("cancelRouteEdit").hidden=false;document.getElementById("rFrom").focus();
}
function cancelRouteEdit(){editingRouteId=null;document.getElementById("routeForm").reset();fillSelects();document.getElementById("cancelRouteEdit").hidden=true}
function delRoute(id){if(editingRouteId===id)cancelRouteEdit();db.routes=db.routes.filter(r=>r.id!==id);save()}
function delRisk(id){db.risks=db.risks.filter(r=>r.id!==id);save()}
document.getElementById("nodeForm").onreset=()=>{editingNodeId=null;document.getElementById("cancelNodeEdit").hidden=true};
document.getElementById("routeForm").onreset=()=>{editingRouteId=null;document.getElementById("cancelRouteEdit").hidden=true};
function fieldValue(form,id){return form.querySelector(`#${id}`)?.value??""}
document.getElementById("nodeForm").onsubmit=e=>{e.preventDefault();const form=e.currentTarget,name=fieldValue(form,"nName").trim(),type=fieldValue(form,"nType"),area=fieldValue(form,"nArea").trim(),cap=fieldValue(form,"nCap"),x=fieldValue(form,"nX"),y=fieldValue(form,"nY"),lat=fieldValue(form,"nLat"),lng=fieldValue(form,"nLng"),note=fieldValue(form,"nNote").trim();if(!name){alert("Nama node wajib diisi.");return}const data={name,type:type||"sppg",area,cap:+cap||0,x:+x||50,y:+y||50,lat:lat===""?null:+lat,lng:lng===""?null:+lng,note};if(editingNodeId){const node=db.nodes.find(item=>item.id===editingNodeId);if(node)Object.assign(node,data)}else db.nodes.push({id:createId(),...data});cancelNodeEdit();save();alert("Node tersimpan offline.")};
function resolveNode(value){const query=value.trim().toLocaleLowerCase();return db.nodes.find(node=>node.id===value||node.name.toLocaleLowerCase()===query)}
document.getElementById("routeForm").onsubmit=e=>{e.preventDefault();const form=e.currentTarget,fromValue=fieldValue(form,"rFrom"),toValue=fieldValue(form,"rTo"),fromNode=resolveNode(fromValue),toNode=resolveNode(toValue);if(!fromNode||!toNode)return alert("Pilih asal dan tujuan dari daftar node yang tersedia.");if(fromNode.id===toNode.id)return alert("Asal dan tujuan tidak boleh sama.");const data={from:fromNode.id,to:toNode.id,mode:fieldValue(form,"rMode")||"Darat",time:+fieldValue(form,"rTime")||0,risk:fieldValue(form,"rRisk")||"Rendah",cap:+fieldValue(form,"rCap")||0};if(editingRouteId){const route=db.routes.find(item=>item.id===editingRouteId);if(route)Object.assign(route,data)}else db.routes.push({id:createId(),...data});cancelRouteEdit();save();alert("Rute tersimpan offline.")};
document.getElementById("riskForm").onsubmit=e=>{e.preventDefault();const typeEl=document.getElementById("riskType"),locEl=document.getElementById("riskLoc"),levelEl=document.getElementById("riskLevel"),noteEl=document.getElementById("riskNote");db.risks.push({id:crypto.randomUUID(),type:typeEl.value,location:locEl.value,level:levelEl.value,note:noteEl.value});e.target.reset();save();alert("Gangguan tersimpan offline.")};


document.getElementById("weatherForm").onsubmit=e=>{
 e.preventDefault();
 const areaEl=document.getElementById("weatherArea"),statusEl=document.getElementById("weatherStatus"),riskEl=document.getElementById("weatherRisk"),timeEl=document.getElementById("weatherTime"),noteEl=document.getElementById("weatherNote");
 const item={
   id:crypto.randomUUID(),
   area:areaEl.value,
   status:statusEl.value,
   risk:riskEl.value,
   time:timeEl.value || new Date().toISOString().slice(0,16),
   note:noteEl.value
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
 document.getElementById("maybratWeather").textContent=may ? `${may.status} · Risiko ${may.risk} · update ${may.time}` : "Belum ada data cuaca lokal.";
 el.innerHTML=db.weather.length ? db.weather.map(x=>`<div class="alert ${x.risk==="Tinggi"?"bad":x.risk==="Sedang"?"warn":"good"}"><b>${x.area} — ${x.status}</b><br>Risiko distribusi: ${x.risk}<br>Update: ${x.time}<br>${x.note||""}<br><button class="btn danger" onclick="delWeather('${x.id}')">Hapus</button></div>`).join("") : "<div class='info'>Belum ada data cuaca yang disimpan.</div>";
}
function delWeather(id){db.weather=db.weather.filter(x=>x.id!==id);save()}

function nodeLatLng(node){
 const lat=Number(node.lat),lng=Number(node.lng);
 if(Number.isFinite(lat)&&Number.isFinite(lng))return [lat,lng];
 const x=Math.min(100,Math.max(0,Number(node.x)||50))/100;
 const y=Math.min(100,Math.max(0,Number(node.y)||50))/100;
 return [PAPUA_BOUNDS.north-y*(PAPUA_BOUNDS.north-PAPUA_BOUNDS.south),PAPUA_BOUNDS.west+x*(PAPUA_BOUNDS.east-PAPUA_BOUNDS.west)];
}
function markerColor(type){return type==="sppg"?"#27b36d":type==="hub"?"#4386e9":"#f0a33a"}
function coordinateDistance(first,second){
 const radians=value=>value*Math.PI/180,earthRadius=6371,latDelta=radians(second[0]-first[0]),lngDelta=radians(second[1]-first[1]);
 const a=Math.sin(latDelta/2)**2+Math.cos(radians(first[0]))*Math.cos(radians(second[0]))*Math.sin(lngDelta/2)**2;
 return earthRadius*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));
}
function buildClusters(nodes){
 const sppgs=nodes.filter(node=>node.type==="sppg");
 const assignments=new Map();
 if(!sppgs.length)return {sppgs,assignments};
 nodes.filter(node=>node.type!=="sppg").forEach(node=>{
  const point=nodeLatLng(node),nearest=sppgs.reduce((best,sppg)=>coordinateDistance(point,nodeLatLng(sppg))<best.distance?{sppg,distance:coordinateDistance(point,nodeLatLng(sppg))}:best,{sppg:sppgs[0],distance:Infinity});
  assignments.set(node.id,nearest.sppg.id);
 });
 return {sppgs,assignments};
}
function clusterColor(sppgId,sppgs){return CLUSTER_COLORS[Math.max(0,sppgs.findIndex(node=>node.id===sppgId))%CLUSTER_COLORS.length]}
function toggleClusters(){clusteringEnabled=!clusteringEnabled;updateClusterControl();drawMaps()}
function routeColor(route){return route.risk==="Tinggi"?"#e65a5a":route.mode.includes("Laut")?"#159bc7":"#2873df"}
function routeCacheKey(from,to){return `${from[0].toFixed(6)},${from[1].toFixed(6)}:${to[0].toFixed(6)},${to[1].toFixed(6)}`}
async function getRoadGeometry(from,to){
 const key=routeCacheKey(from,to);if(routeGeometryCache.has(key))return routeGeometryCache.get(key);
 try{
  const response=await fetch(`${ROUTING_URL}/${from[1]},${from[0]};${to[1]},${to[0]}?overview=full&geometries=geojson`);
  if(!response.ok)throw new Error("Routing service unavailable");
  const data=await response.json();
  const geometry=data.routes?.[0]?.geometry?.coordinates?.map(([lng,lat])=>[lat,lng]);
  if(!geometry?.length)throw new Error("No road route found");
  routeGeometryCache.set(key,geometry);return geometry;
 }catch(error){
  console.warn("Jalur jalan tidak tersedia, memakai garis langsung:",error);
  routeGeometryCache.set(key,[from,to]);return [from,to];
 }
}
function drawMaps(){["dashMap","networkMap","regionalLeafletMap"].forEach(id=>drawMap(id));}
async function drawMap(id){
 const container=document.getElementById(id);if(!container)return;
 if(!window.L){container.innerHTML="<div class='info'>Leaflet tidak dapat dimuat. Periksa koneksi internet untuk memuat peta.</div>";return;}
 let map=leafletMaps[id];
 if(!map){
  const leafletMap=L.map(container,{scrollWheelZoom:true}).setView([-1.2,131.6],8);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{maxZoom:19,attribution:"&copy; OpenStreetMap contributors"}).addTo(leafletMap);
  map={instance:leafletMap,layer:L.layerGroup().addTo(leafletMap),markers:new Map(),drawVersion:0};leafletMaps[id]=map;
 }else map.instance.invalidateSize();
 const leafletMap=map.instance;const drawVersion=++map.drawVersion;
 if(map.clusterLegend){leafletMap.removeControl(map.clusterLegend);map.clusterLegend=null}
 map.layer.clearLayers();
 map.markers.clear();
 const positions=new Map(db.nodes.map(node=>[node.id,nodeLatLng(node)]));
 const clusters=buildClusters(db.nodes);
  await Promise.all(db.routes.map(async route=>{
  const from=positions.get(route.from),to=positions.get(route.to);if(!from||!to)return;
  const geometry=route.mode.includes("Laut")?[from,to]:await getRoadGeometry(from,to);
  return L.polyline(geometry,{color:routeColor(route),weight:route.risk==="Tinggi"?5:4,dashArray:route.mode.includes("Laut")?"8 8":null}).bindTooltip(`${name(route.from)} → ${name(route.to)}<br>${route.mode} · ${route.time} menit · Risiko ${route.risk}`).addTo(map.layer);
 }));
 if(drawVersion!==map.drawVersion)return;
 if(id==="networkMap"&&clusteringEnabled){
  db.nodes.filter(node=>node.type!=="sppg").forEach(node=>{
   const sppgId=clusters.assignments.get(node.id),from=positions.get(node.id),to=positions.get(sppgId);if(!from||!to)return;
   L.polyline([from,to],{color:clusterColor(sppgId,clusters.sppgs),weight:2,dashArray:"4 7",opacity:.55}).addTo(map.layer);
  });
 }
 db.nodes.forEach(node=>{
  const point=positions.get(node.id);if(!point)return;
  const assignedSppg=clusters.assignments.get(node.id),fillColor=id==="networkMap"&&clusteringEnabled&&node.type!=="sppg"?clusterColor(assignedSppg,clusters.sppgs):markerColor(node.type),clusterName=assignedSppg?name(assignedSppg):"-";
  const marker=L.circleMarker(point,{radius:node.type==="sppg"?10:8,color:"#fff",weight:2,fillColor,fillOpacity:1}).bindPopup(`<b>${node.name}</b><br>${node.area||"Wilayah tidak diisi"}<br>Kapasitas: ${node.cap||0} porsi/hari${assignedSppg?`<br>Cluster: ${clusterName}`:""}`).addTo(map.layer);map.markers.set(node.id,marker);
 });
 if(id==="networkMap"&&clusteringEnabled){
  const legend=L.control({position:"topright"});legend.onAdd=()=>{const element=L.DomUtil.create("div","cluster-legend");element.innerHTML=`<b>Cluster SPPG</b>${clusters.sppgs.map(sppg=>`<div><i style="background:${clusterColor(sppg.id,clusters.sppgs)}"></i>${sppg.name}</div>`).join("")}`;return element};legend.addTo(leafletMap);map.clusterLegend=legend;
 }
 if(id==="regionalLeafletMap")leafletMap.setView([-1.2,131.6],8);
 else if(db.nodes.length)leafletMap.fitBounds(L.latLngBounds([...positions.values()]),{padding:[25,25],maxZoom:12});
}
function searchNetworkPlace(){
 const input=document.getElementById("mapSearch"),status=document.getElementById("mapSearchStatus"),map=leafletMaps.networkMap;
 if(!input||!status||!map)return;
 const query=input.value.trim().toLocaleLowerCase();
 if(!query){status.textContent="Ketik nama tempat untuk mencari.";return;}
 const node=db.nodes.find(item=>item.name.toLocaleLowerCase()===query)||db.nodes.find(item=>item.name.toLocaleLowerCase().includes(query));
 if(!node){status.textContent="Tempat tidak ditemukan.";return;}
 const point=nodeLatLng(node),marker=map.markers.get(node.id);map.instance.setView(point,Math.max(map.instance.getZoom(),14),{animate:true});
 if(marker)marker.openPopup();
 input.value=node.name;status.textContent=`Menampilkan lokasi: ${node.name}`;
}
document.getElementById("mapSearch")?.addEventListener("input",event=>{
 const query=event.target.value.trim().toLocaleLowerCase();
 if(query&&db.nodes.some(node=>node.name.toLocaleLowerCase()===query))searchNetworkPlace();
});
document.getElementById("mapSearch")?.addEventListener("keydown",event=>{if(event.key==="Enter"){event.preventDefault();searchNetworkPlace()}});
function findRoutes(){
 const fromEl=document.getElementById("pFrom"),toEl=document.getElementById("pTo");
 const a=fromEl?fromEl.value:"",b=toEl?toEl.value:"";
 if(!a||!b||a===b){
  document.getElementById("routeResults").innerHTML="<div class='info'>Pilih asal dan tujuan yang berbeda.</div>";
  return;
 }
 const rs=db.routes.filter(r=>(r.from===a&&r.to===b)||(r.from===b&&r.to===a)).sort((x,y)=>x.time-y.time);
 document.getElementById("routeResults").innerHTML=rs.length?rs.map((r,i)=>`<div class="alert ${r.risk==="Tinggi"?"bad":r.risk==="Sedang"?"warn":"good"}"><b>${i===0?"⭐ MOST RELIABLE — ":""}${r.mode}</b><br>${r.time} menit · Risiko ${r.risk} · Kapasitas ${r.cap} porsi/hari</div>`).join(""):"<div class='info'>Belum ada rute langsung antara node tersebut. Tambahkan rute pada menu Input Data.</div>";
}
function capacityCheck(){
 const capNodeEl=document.getElementById("capNode");
 const capNeedEl=document.getElementById("capNeed");
 if(!capNodeEl||!capNeedEl)return;
 const n=db.nodes.find(x=>x.id===capNodeEl.value);
 const need=+capNeedEl.value;
 if(!n){
  document.getElementById("capResult").innerHTML="<div class='info'>Pilih node yang valid terlebih dahulu.</div>";
  return;
 }
 const cap=n.cap||0;
 document.getElementById("capResult").innerHTML=`<div class="alert ${cap>=need?"good":"bad"}"><b>${cap>=need?"✓ KAPASITAS CUKUP":"! KAPASITAS TIDAK CUKUP"}</b><br>Node: ${n.name}<br>Kebutuhan: ${need} porsi/hari<br>Kapasitas: ${cap} porsi/hari<br>Sisa: ${Math.max(0,cap-need)} porsi/hari</div>`
}
function buildBackup(){const good=db.routes.filter(r=>r.risk!="Tinggi").sort((a,b)=>a.time-b.time)[0];document.getElementById("backupResult").innerHTML=good?`<div class="alert good"><b>✓ Backup ditemukan</b><br>${name(good.from)} → ${name(good.to)}<br>Moda: ${good.mode} · ${good.time} menit · Risiko ${good.risk}<br>Kapasitas: ${good.cap} porsi/hari</div>`:"<div class='alert bad'>Belum ada rute backup. Masukkan rute dengan risiko rendah/sedang.</div>"}
function exportData(){const blob=new Blob([JSON.stringify(db,null,2)],{type:"application/json"}),a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download="resilient-3t-mbg-backup.json";a.click();URL.revokeObjectURL(a.href)}
document.getElementById("importFile").onchange=e=>{const f=e.target.files[0];if(!f)return;const reader=new FileReader();reader.onload=()=>{try{const x=JSON.parse(reader.result);if(!x.nodes||!x.routes||!x.risks)throw Error();db=x;save();alert("Data berhasil diimport.");}catch{alert("File JSON tidak valid.")}};reader.readAsText(f)}
function clearAll(){if(confirm("Hapus semua data lokal?")){db={...DEFAULT_DB};save()}}
window.addEventListener("resize",drawMaps);
(async function init(){
  db=await fetchDbFromServer();
  refresh();
})();
