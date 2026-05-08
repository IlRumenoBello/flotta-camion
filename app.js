import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged }
  from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore, doc, setDoc, getDoc, onSnapshot, collection, getDocs }
  from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyDlDhQGIddBRmuRksk53bOdEUUPypABAiM",
  authDomain: "flotta-camion.firebaseapp.com",
  projectId: "flotta-camion",
  storageBucket: "flotta-camion.firebasestorage.app",
  messagingSenderId: "531128750431",
  appId: "1:531128750431:web:1580cc528454d9ef1aa6ea"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// ── State ─────────────────────────────────────────────
let trucks = [];
let trips = [];
let editingTripId = null;
let charts = {};
let saveTimeout = null;
let currentUserId = null;
let unsubscribe = null;
let currentPage = 'dashboard';

const MONTHS = ['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno',
  'Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre'];
const COST_KEYS = ['gasolio','autista','manutenzione','pedaggi','assicurazione','ammortamento'];
const COST_LABELS = {
  gasolio:'Gasolio', autista:'Autista', manutenzione:'Manutenzione',
  pedaggi:'Pedaggi', assicurazione:'Assicurazione', ammortamento:'Ammortamento'
};

// ── Helpers ───────────────────────────────────────────
function totalCosti(t) { return COST_KEYS.reduce((s,k) => s+(parseFloat(t[k])||0), 0); }
function totalRicaviMensili(t) { return (parseFloat(t.ricavoMensile)||0); }
function profittoTruck(t, tripRevenue) { return (tripRevenue||0) + totalRicaviMensili(t) - totalCosti(t); }
function fmtEur(n) { return n.toLocaleString('it-IT')+'€'; }
function fmtProfit(n) { return (n>=0?'+':'')+fmtEur(n); }
function fmtMono(n) { return n.toLocaleString('it-IT'); }

function getPeriod() {
  const m = document.getElementById('monthSelect')?.value || MONTHS[new Date().getMonth()];
  const y = document.getElementById('yearSelect')?.value || new Date().getFullYear();
  return `${m}-${y}`;
}

function getYear() { return document.getElementById('yearSelect')?.value || new Date().getFullYear(); }

// ── Firebase ──────────────────────────────────────────
function scheduleSave() {
  if (saveTimeout) clearTimeout(saveTimeout);
  saveTimeout = setTimeout(saveData, 1000);
}

async function saveData() {
  if (!currentUserId) return;
  const key = getPeriod();
  try {
    await setDoc(doc(db, 'flotte', currentUserId, 'mesi', key), { trucks, trips });
    showToast();
  } catch(e) { console.error(e); }
}

function loadData() {
  if (!currentUserId) return;
  const key = getPeriod();
  if (unsubscribe) unsubscribe();
  unsubscribe = onSnapshot(doc(db, 'flotte', currentUserId, 'mesi', key), snap => {
    if (snap.exists()) {
      const data = snap.data();
      trucks = data.trucks || [];
      trips = data.trips || [];
    } else {
      trucks = [defaultTruck(1)];
      trips = [];
    }
    renderCurrentPage();
  });
}

async function loadAllMonths() {
  if (!currentUserId) return [];
  const results = [];
  for (const month of MONTHS) {
    const key = `${month}-${getYear()}`;
    try {
      const snap = await getDoc(doc(db, 'flotte', currentUserId, 'mesi', key));
      if (snap.exists()) {
        const d = snap.data();
        const ts = d.trucks || [];
        const tr = d.trips || [];
        const totalR = ts.reduce((s,t) => {
          const tRevenue = tr.filter(v=>v.truckId===t.id).reduce((x,v)=>x+(parseFloat(v.amount)||0),0);
          return s + tRevenue + (parseFloat(t.ricavoMensile)||0);
        }, 0);
        const totalC = ts.reduce((s,t) => s+totalCosti(t), 0);
        const totalKm = tr.reduce((s,v)=>s+(parseFloat(v.km)||0),0);
        results.push({ month, totalR, totalC, profitto: totalR-totalC, viaggi: tr.length, km: totalKm });
      } else {
        results.push({ month, totalR:0, totalC:0, profitto:0, viaggi:0, km:0 });
      }
    } catch(e) {
      results.push({ month, totalR:0, totalC:0, profitto:0, viaggi:0, km:0 });
    }
  }
  return results;
}

function defaultTruck(n) {
  return { id: Date.now()+n, name:`Camion ${n}`, ricavoMensile:0,
    gasolio:0, autista:0, manutenzione:0, pedaggi:0, assicurazione:0, ammortamento:0 };
}

// ── Auth ──────────────────────────────────────────────
window.doLogin = async () => {
  hideError();
  try { await signInWithEmailAndPassword(auth, emailInput(), pwInput()); }
  catch(e) { showError(translateError(e.code)); }
};
window.doRegister = async () => {
  hideError();
  if (pwInput().length < 6) { showError('Password minimo 6 caratteri.'); return; }
  try { await createUserWithEmailAndPassword(auth, emailInput(), pwInput()); }
  catch(e) { showError(translateError(e.code)); }
};
window.doLogout = async () => { if(unsubscribe)unsubscribe(); await signOut(auth); };

function emailInput() { return document.getElementById('emailInput').value.trim(); }
function pwInput() { return document.getElementById('passwordInput').value; }
function showError(m) { const el=document.getElementById('loginError'); el.textContent=m; el.style.display='block'; }
function hideError() { document.getElementById('loginError').style.display='none'; }
function translateError(code) {
  return ({ 'auth/user-not-found':'Utente non trovato.', 'auth/wrong-password':'Password errata.',
    'auth/invalid-email':'Email non valida.', 'auth/email-already-in-use':'Email già in uso.',
    'auth/invalid-credential':'Email o password errati.',
    'auth/too-many-requests':'Troppi tentativi. Riprova.' })[code] || 'Errore: '+code;
}

onAuthStateChanged(auth, user => {
  if (user) {
    currentUserId = user.uid;
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('appScreen').style.display = 'flex';
    document.getElementById('userEmail').textContent = user.email;
    document.getElementById('userAvatar').textContent = user.email[0].toUpperCase();
    initSelects();
    loadData();
  } else {
    currentUserId = null;
    document.getElementById('loginScreen').style.display = 'flex';
    document.getElementById('appScreen').style.display = 'none';
  }
});

function initSelects() {
  const ySel = document.getElementById('yearSelect');
  const now = new Date();
  ySel.innerHTML = '';
  for (let y = now.getFullYear()-2; y <= now.getFullYear()+1; y++) {
    const o = document.createElement('option');
    o.value=y; o.textContent=y;
    if(y===now.getFullYear()) o.selected=true;
    ySel.appendChild(o);
  }
  document.getElementById('monthSelect').value = MONTHS[now.getMonth()];
}

// ── Navigation ────────────────────────────────────────
window.showPage = function(name) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById('page-'+name).classList.add('active');
  document.getElementById('nav-'+name).classList.add('active');
  currentPage = name;
  if (name === 'storico') renderStorico();
  else renderCurrentPage();
};

window.onPeriodChange = function() { loadData(); };

function renderCurrentPage() {
  if (currentPage === 'dashboard') renderDashboard();
  else if (currentPage === 'viaggi') renderViagg();
  else if (currentPage === 'camion') renderCamion();
}

// ── DASHBOARD ─────────────────────────────────────────
function renderDashboard() {
  const period = getPeriod();
  document.getElementById('dashTitle').textContent = 'Dashboard';
  document.getElementById('dashSub').textContent = period;

  const tripsByTruck = {};
  trips.forEach(v => {
    if (!tripsByTruck[v.truckId]) tripsByTruck[v.truckId] = 0;
    tripsByTruck[v.truckId] += (parseFloat(v.amount)||0);
  });

  const totalR = trucks.reduce((s,t) => s+(tripsByTruck[t.id]||0)+(parseFloat(t.ricavoMensile)||0), 0);
  const totalC = trucks.reduce((s,t) => s+totalCosti(t), 0);
  const totalP = totalR - totalC;
  const margin = totalR>0 ? Math.round(totalP/totalR*100) : 0;
  const totalKm = trips.reduce((s,v)=>s+(parseFloat(v.km)||0),0);

  document.getElementById('summaryCards').innerHTML = `
    <div class="s-card"><div class="s-label">Camion</div><div class="s-value">${trucks.length}</div></div>
    <div class="s-card"><div class="s-label">Ricavi</div><div class="s-value">${fmtEur(totalR)}</div></div>
    <div class="s-card"><div class="s-label">Costi</div><div class="s-value">${fmtEur(totalC)}</div></div>
    <div class="s-card ${totalP>=0?'green':'red'}"><div class="s-label">Profitto</div><div class="s-value ${totalP>=0?'green':'red'}">${fmtProfit(totalP)}</div></div>
    <div class="s-card ${margin>=0?'green':'red'}"><div class="s-label">Margine</div><div class="s-value ${margin>=0?'green':'red'}">${margin}%</div></div>
    <div class="s-card blue"><div class="s-label">Km totali</div><div class="s-value">${fmtMono(totalKm)}</div></div>
  `;

  renderProfitChart(tripsByTruck);
  renderCostiChart();
  renderRecentTrips();
}

function renderProfitChart(tripsByTruck) {
  if (!tripsByTruck) {
    const t = {}; trips.forEach(v=>{if(!t[v.truckId])t[v.truckId]=0;t[v.truckId]+=(parseFloat(v.amount)||0);}); tripsByTruck=t;
  }
  const labels = trucks.map(t=>t.name);
  const profits = trucks.map(t=>profittoTruck(t, tripsByTruck[t.id]||0));
  const colors = profits.map(p=>p>=0?'rgba(0,229,160,0.8)':'rgba(255,107,107,0.8)');
  const ctx = document.getElementById('profitChart')?.getContext('2d');
  if (!ctx) return;
  if (charts.profit) charts.profit.destroy();
  charts.profit = new Chart(ctx, {
    type:'bar', data:{ labels, datasets:[{ data:profits, backgroundColor:colors, borderRadius:6, borderSkipped:false }] },
    options:{ responsive:true, maintainAspectRatio:false,
      plugins:{ legend:{display:false}, tooltip:{ callbacks:{ label:c=>(c.raw>=0?'+':'')+c.raw.toLocaleString('it-IT')+'€' } } },
      scales:{
        y:{ ticks:{color:'#7D8590',callback:v=>(v>=0?'+':'')+v.toLocaleString('it-IT')+'€'}, grid:{color:'rgba(255,255,255,0.04)'} },
        x:{ ticks:{color:'#7D8590'}, grid:{display:false} }
      }
    }
  });
}

function renderCostiChart() {
  const totals = {};
  COST_KEYS.forEach(k => { totals[k] = trucks.reduce((s,t)=>s+(parseFloat(t[k])||0),0); });
  const vals = COST_KEYS.map(k=>totals[k]).filter(v=>v>0);
  const lbls = COST_KEYS.filter(k=>totals[k]>0).map(k=>COST_LABELS[k]);
  const colors = ['#00E5A0','#58A6FF','#F0B429','#FF6B6B','#B794F4','#63B3ED'];
  const ctx = document.getElementById('costiChart')?.getContext('2d');
  if (!ctx) return;
  if (charts.costi) charts.costi.destroy();
  charts.costi = new Chart(ctx, {
    type:'doughnut', data:{ labels:lbls, datasets:[{ data:vals, backgroundColor:colors, borderWidth:0, hoverOffset:6 }] },
    options:{ responsive:true, maintainAspectRatio:false, cutout:'65%',
      plugins:{ legend:{ position:'right', labels:{ color:'#7D8590', font:{size:12}, padding:12, boxWidth:10 } } }
    }
  });
}

function renderRecentTrips() {
  const recent = [...trips].sort((a,b)=>new Date(b.date)-new Date(a.date)).slice(0,5);
  const el = document.getElementById('recentTrips');
  if (!recent.length) { el.innerHTML='<div class="empty-state">Nessun viaggio registrato</div>'; return; }
  el.innerHTML = `<table class="trip-table">
    <thead><tr><th>Data</th><th>Camion</th><th>Rotta</th><th>Cliente</th><th>Importo</th></tr></thead>
    <tbody>${recent.map(v=>{
      const t = trucks.find(x=>x.id===v.truckId);
      return `<tr>
        <td class="mono">${v.date||'—'}</td>
        <td>${t?t.name:'—'}</td>
        <td>${v.from||'?'} → ${v.to||'?'}</td>
        <td>${v.client||'—'}</td>
        <td class="mono green">+${fmtEur(parseFloat(v.amount)||0)}</td>
      </tr>`;
    }).join('')}</tbody>
  </table>`;
}

// ── VIAGGI ────────────────────────────────────────────
window.renderViagg = function() {
  const period = getPeriod();
  document.getElementById('viaggiSub').textContent = period;

  const filterTruck = document.getElementById('filterTruck')?.value || '';
  const filterSearch = (document.getElementById('filterSearch')?.value||'').toLowerCase();

  // populate truck filter
  const sel = document.getElementById('filterTruck');
  if (sel) {
    const cur = sel.value;
    sel.innerHTML = '<option value="">Tutti i camion</option>' +
      trucks.map(t=>`<option value="${t.id}" ${t.id==cur?'selected':''}>${t.name}</option>`).join('');
  }

  let filtered = [...trips].sort((a,b)=>new Date(b.date)-new Date(a.date));
  if (filterTruck) filtered = filtered.filter(v=>String(v.truckId)===String(filterTruck));
  if (filterSearch) filtered = filtered.filter(v=>
    (v.client||'').toLowerCase().includes(filterSearch) ||
    (v.from||'').toLowerCase().includes(filterSearch) ||
    (v.to||'').toLowerCase().includes(filterSearch) ||
    (v.container||'').toLowerCase().includes(filterSearch)
  );

  document.getElementById('tripCount').textContent = `${filtered.length} viaggi`;

  const el = document.getElementById('tripTable');
  if (!filtered.length) {
    el.innerHTML = `<div class="empty-state">
      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M1 3h15v13H1zM16 8h4l3 3v5h-7V8z"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>
      <div>Nessun viaggio trovato.<br>Clicca "+ Nuovo viaggio" per aggiungerne uno.</div>
    </div>`; return;
  }

  el.innerHTML = `<table class="trip-table">
    <thead><tr><th>Data</th><th>Camion</th><th>Rotta</th><th>Cliente</th><th>Container</th><th>Km</th><th>Importo</th><th></th></tr></thead>
    <tbody>${filtered.map(v=>{
      const t = trucks.find(x=>x.id===v.truckId);
      return `<tr>
        <td class="mono">${v.date||'—'}</td>
        <td><span class="tag">${t?t.name:'—'}</span></td>
        <td>${v.from||'?'} → ${v.to||'?'}</td>
        <td>${v.client||'—'}</td>
        <td class="mono">${v.container||'—'}</td>
        <td class="mono">${v.km?fmtMono(v.km)+' km':'—'}</td>
        <td class="mono green">+${fmtEur(parseFloat(v.amount)||0)}</td>
        <td>
          <div style="display:flex;gap:4px">
            <button class="btn-icon edit" onclick="editTrip('${v.id}')" title="Modifica">✎</button>
            <button class="btn-icon" onclick="deleteTrip('${v.id}')" title="Elimina">✕</button>
          </div>
        </td>
      </tr>`;
    }).join('')}</tbody>
  </table>`;
};

window.openTripModal = function(id) {
  editingTripId = id || null;
  const modal = document.getElementById('tripModal');
  const sel = document.getElementById('tripTruck');
  sel.innerHTML = trucks.map(t=>`<option value="${t.id}">${t.name}</option>`).join('');

  if (id) {
    const v = trips.find(x=>x.id===id);
    document.getElementById('modalTitle').textContent = 'Modifica viaggio';
    if(v) {
      sel.value = v.truckId;
      document.getElementById('tripDate').value = v.date||'';
      document.getElementById('tripFrom').value = v.from||'';
      document.getElementById('tripTo').value = v.to||'';
      document.getElementById('tripClient').value = v.client||'';
      document.getElementById('tripContainer').value = v.container||'';
      document.getElementById('tripKm').value = v.km||'';
      document.getElementById('tripAmount').value = v.amount||'';
      document.getElementById('tripNotes').value = v.notes||'';
    }
  } else {
    document.getElementById('modalTitle').textContent = 'Nuovo viaggio';
    document.getElementById('tripDate').value = new Date().toISOString().split('T')[0];
    ['tripFrom','tripTo','tripClient','tripContainer','tripKm','tripAmount','tripNotes'].forEach(id=>document.getElementById(id).value='');
  }
  modal.style.display = 'flex';
};

window.editTrip = function(id) { window.openTripModal(id); };

window.saveTrip = function() {
  const truckId = parseInt(document.getElementById('tripTruck').value);
  const trip = {
    id: editingTripId || Date.now().toString(),
    truckId,
    date: document.getElementById('tripDate').value,
    from: document.getElementById('tripFrom').value.trim(),
    to: document.getElementById('tripTo').value.trim(),
    client: document.getElementById('tripClient').value.trim(),
    container: document.getElementById('tripContainer').value.trim(),
    km: parseFloat(document.getElementById('tripKm').value)||0,
    amount: parseFloat(document.getElementById('tripAmount').value)||0,
    notes: document.getElementById('tripNotes').value.trim(),
  };
  if (editingTripId) {
    trips = trips.map(v=>v.id===editingTripId?trip:v);
  } else {
    trips.push(trip);
  }
  closeTripModal();
  renderCurrentPage();
  scheduleSave();
};

window.deleteTrip = function(id) {
  if(!confirm('Eliminare questo viaggio?')) return;
  trips = trips.filter(v=>v.id!==id);
  renderCurrentPage();
  scheduleSave();
};

window.closeTripModal = function() { document.getElementById('tripModal').style.display='none'; };
window.closeTripModalOutside = function(e) { if(e.target===document.getElementById('tripModal')) closeTripModal(); };

// ── STORICO ───────────────────────────────────────────
async function renderStorico() {
  document.getElementById('storicoTable').innerHTML = '<div class="empty-state">Caricamento...</div>';
  const data = await loadAllMonths();
  const currentMonth = document.getElementById('monthSelect')?.value;

  const totP = data.reduce((s,d)=>s+d.profitto,0);
  const totR = data.reduce((s,d)=>s+d.totalR,0);
  const totC = data.reduce((s,d)=>s+d.totalC,0);
  const totKm = data.reduce((s,d)=>s+d.km,0);

  document.getElementById('storicoCards').innerHTML = `
    <div class="s-card"><div class="s-label">Ricavi anno</div><div class="s-value">${fmtEur(totR)}</div></div>
    <div class="s-card"><div class="s-label">Costi anno</div><div class="s-value">${fmtEur(totC)}</div></div>
    <div class="s-card ${totP>=0?'green':'red'}"><div class="s-label">Profitto anno</div><div class="s-value ${totP>=0?'green':'red'}">${fmtProfit(totP)}</div></div>
    <div class="s-card blue"><div class="s-label">Km anno</div><div class="s-value">${fmtMono(totKm)}</div></div>
  `;

  const ctx = document.getElementById('storicoChart')?.getContext('2d');
  if (ctx) {
    if (charts.storico) charts.storico.destroy();
    charts.storico = new Chart(ctx, {
      type:'bar',
      data:{
        labels: data.map(d=>d.month.slice(0,3)),
        datasets:[
          { label:'Ricavi', data:data.map(d=>d.totalR), backgroundColor:'rgba(0,229,160,0.3)', borderColor:'#00E5A0', borderWidth:1.5, borderRadius:4 },
          { label:'Costi', data:data.map(d=>d.totalC), backgroundColor:'rgba(255,107,107,0.3)', borderColor:'#FF6B6B', borderWidth:1.5, borderRadius:4 },
          { label:'Profitto', data:data.map(d=>d.profitto), type:'line', borderColor:'#F0B429', backgroundColor:'transparent', borderWidth:2, pointRadius:3, tension:0.3 }
        ]
      },
      options:{
        responsive:true, maintainAspectRatio:false,
        plugins:{ legend:{ labels:{ color:'#7D8590', font:{size:12} } } },
        scales:{
          y:{ ticks:{color:'#7D8590',callback:v=>v.toLocaleString('it-IT')+'€'}, grid:{color:'rgba(255,255,255,0.04)'} },
          x:{ ticks:{color:'#7D8590'}, grid:{display:false} }
        }
      }
    });
  }

  document.getElementById('storicoTable').innerHTML = `
    <table class="storico-table">
      <thead><tr><th>Mese</th><th>Ricavi</th><th>Costi</th><th>Profitto</th><th>Viaggi</th><th>Km</th></tr></thead>
      <tbody>${data.map(d=>`
        <tr class="${d.month===currentMonth?'current-month':''}">
          <td class="label">${d.month}${d.month===currentMonth?' ◀':''}</td>
          <td>${fmtEur(d.totalR)}</td>
          <td>${fmtEur(d.totalC)}</td>
          <td class="${d.profitto>=0?'green':'red'}">${fmtProfit(d.profitto)}</td>
          <td>${d.viaggi}</td>
          <td>${fmtMono(d.km)}</td>
        </tr>`).join('')}
      </tbody>
    </table>`;
}

// ── CAMION ────────────────────────────────────────────
function renderCamion() {
  const tripsByTruck = {};
  trips.forEach(v=>{if(!tripsByTruck[v.truckId])tripsByTruck[v.truckId]=0;tripsByTruck[v.truckId]+=(parseFloat(v.amount)||0);});
  const maxAbs = Math.max(...trucks.map(t=>Math.abs(profittoTruck(t,tripsByTruck[t.id]||0))),1);

  document.getElementById('truckList').innerHTML = trucks.map(t=>{
    const tripRev = tripsByTruck[t.id]||0;
    const c = totalCosti(t);
    const r = tripRev + (parseFloat(t.ricavoMensile)||0);
    const p = r - c;
    const barW = Math.round(Math.abs(p)/maxAbs*100);
    const isPos = p>=0;
    return `
    <div class="truck-card">
      <div class="truck-header">
        <div class="truck-title">
          <div class="truck-icon-wrap">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M1 3h15v13H1zM16 8h4l3 3v5h-7V8z"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>
          </div>
          <input class="truck-name-input" value="${t.name}"
            onchange="updateTruckName(${t.id},this.value)" oninput="updateTruckName(${t.id},this.value)">
        </div>
        <div style="display:flex;align-items:center;gap:8px">
          <span class="profit-badge ${isPos?'pos':'neg'}">${fmtProfit(p)}</span>
          <button class="btn-icon" onclick="removeTruck(${t.id})" title="Elimina">✕</button>
        </div>
      </div>
      <div class="truck-body">
        <div>
          <div class="section-label">Costi fissi mensili</div>
          ${COST_KEYS.map(k=>`
            <div class="field-row">
              <span class="field-label">${COST_LABELS[k]}</span>
              <input class="field-input" type="number" min="0" step="1" value="${t[k]}"
                onchange="updateTruckField(${t.id},'${k}',this.value)"
                oninput="updateTruckField(${t.id},'${k}',this.value)">
            </div>`).join('')}
        </div>
        <div>
          <div class="section-label">Ricavi mensili fissi</div>
          <div class="field-row">
            <span class="field-label">Contratti fissi</span>
            <input class="field-input" type="number" min="0" step="1" value="${t.ricavoMensile}"
              onchange="updateTruckField(${t.id},'ricavoMensile',this.value)"
              oninput="updateTruckField(${t.id},'ricavoMensile',this.value)">
          </div>
          <div class="section-label" style="margin-top:16px">Riepilogo mese</div>
          <div class="field-row"><span class="field-label">Ricavi da viaggi</span><span style="font-family:'JetBrains Mono',monospace;font-size:12px">${fmtEur(tripRev)}</span></div>
          <div class="field-row"><span class="field-label">Ricavi fissi</span><span style="font-family:'JetBrains Mono',monospace;font-size:12px">${fmtEur(parseFloat(t.ricavoMensile)||0)}</span></div>
          <div class="field-row"><span class="field-label">Totale costi</span><span style="font-family:'JetBrains Mono',monospace;font-size:12px">${fmtEur(c)}</span></div>
          <div class="field-row" style="border:none;margin-top:4px"><span class="field-label" style="font-weight:600;color:var(--text)">Profitto</span><span style="font-family:'JetBrains Mono',monospace;font-size:13px;color:${isPos?'var(--green)':'var(--red)'}">${fmtProfit(p)}</span></div>
        </div>
      </div>
      <div class="bar-track"><div class="bar-fill ${isPos?'green':'red'}" style="width:${barW}%"></div></div>
    </div>`;
  }).join('');
}

window.addTruck = function() {
  trucks.push(defaultTruck(trucks.length+1));
  renderCamion(); scheduleSave();
};
window.removeTruck = function(id) {
  if(!confirm('Rimuovere questo camion?')) return;
  trucks=trucks.filter(t=>t.id!==id); renderCamion(); scheduleSave();
};
window.updateTruckField = function(id,field,val) {
  const t=trucks.find(x=>x.id===id); if(t) t[field]=parseFloat(val)||0;
  renderCamion(); scheduleSave();
};
window.updateTruckName = function(id,val) {
  const t=trucks.find(x=>x.id===id); if(t) t.name=val; scheduleSave();
};

// ── Toast ─────────────────────────────────────────────
function showToast() {
  const t=document.getElementById('saveToast');
  t.classList.add('show'); setTimeout(()=>t.classList.remove('show'),2000);
}

// Enter su login
document.addEventListener('keydown', e => {
  if (e.key==='Enter' && document.getElementById('loginScreen').style.display!=='none') window.doLogin();
});
