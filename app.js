import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged }
  from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore, doc, setDoc, getDoc, onSnapshot }
  from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyDlDhQGIddBRmuRksk53bOdEUUPypABAiM",
  authDomain: "flotta-camion.firebaseapp.com",
  projectId: "flotta-camion",
  storageBucket: "flotta-camion.firebasestorage.app",
  messagingSenderId: "531128750431",
  appId: "1:531128750431:web:1580cc528454d9ef1aa6ea",
  measurementId: "G-5XCN7K9ET6"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// ── State ────────────────────────────────────────────────────────────────────
let trucks = [];
let chartInstance = null;
let saveTimeout = null;
let currentUserId = null;
let unsubscribe = null;

const COST_KEYS = ['gasolio','autista','manutenzione','pedaggi','assicurazione','ammortamento'];
const COST_LABELS = {
  gasolio:'Gasolio', autista:'Autista (stipendio)',
  manutenzione:'Manutenzione', pedaggi:'Pedaggi/Autostrade',
  assicurazione:'Assicurazione', ammortamento:'Ammortamento'
};

// ── Helpers ──────────────────────────────────────────────────────────────────
function totalCosti(t) { return COST_KEYS.reduce((s, k) => s + (parseFloat(t[k]) || 0), 0); }
function totalRicavi(t) { return (parseFloat(t.ricavoViaggi) || 0) + (parseFloat(t.ricavoMensile) || 0); }
function profitto(t) { return totalRicavi(t) - totalCosti(t); }
function fmtEur(n) { return n.toLocaleString('it-IT') + ' €'; }
function fmtProfit(n) { return (n >= 0 ? '+' : '') + fmtEur(n); }

function getCurrentMonthYear() {
  const m = document.getElementById('monthSelect')?.value || 'Gennaio';
  const y = document.getElementById('yearSelect')?.value || new Date().getFullYear();
  return `${m}-${y}`;
}

// ── Firebase Save/Load ───────────────────────────────────────────────────────
function scheduleSave() {
  if (saveTimeout) clearTimeout(saveTimeout);
  saveTimeout = setTimeout(saveData, 1200);
}

async function saveData() {
  if (!currentUserId) return;
  const key = getCurrentMonthYear();
  try {
    await setDoc(doc(db, 'flotte', currentUserId, 'mesi', key), { trucks });
    showToast();
  } catch (e) {
    console.error('Errore salvataggio:', e);
  }
}

async function loadData() {
  if (!currentUserId) return;
  const key = getCurrentMonthYear();
  if (unsubscribe) unsubscribe();
  unsubscribe = onSnapshot(doc(db, 'flotte', currentUserId, 'mesi', key), (snap) => {
    if (snap.exists()) {
      trucks = snap.data().trucks || [];
    } else {
      trucks = getDefaultTrucks();
    }
    renderAll();
  });
}

function getDefaultTrucks() {
  return [{
    id: Date.now(), name: 'Camion 1',
    ricavoViaggi: 0, ricavoMensile: 0,
    gasolio: 0, autista: 0, manutenzione: 0,
    pedaggi: 0, assicurazione: 0, ammortamento: 0
  }];
}

// ── Auth ─────────────────────────────────────────────────────────────────────
window.doLogin = async function () {
  const email = document.getElementById('emailInput').value.trim();
  const pw = document.getElementById('passwordInput').value;
  hideError();
  try {
    await signInWithEmailAndPassword(auth, email, pw);
  } catch (e) {
    showError(translateError(e.code));
  }
};

window.doRegister = async function () {
  const email = document.getElementById('emailInput').value.trim();
  const pw = document.getElementById('passwordInput').value;
  hideError();
  if (pw.length < 6) { showError('La password deve avere almeno 6 caratteri.'); return; }
  try {
    await createUserWithEmailAndPassword(auth, email, pw);
  } catch (e) {
    showError(translateError(e.code));
  }
};

window.doLogout = async function () {
  if (unsubscribe) unsubscribe();
  await signOut(auth);
};

function translateError(code) {
  const map = {
    'auth/user-not-found': 'Utente non trovato.',
    'auth/wrong-password': 'Password errata.',
    'auth/invalid-email': 'Email non valida.',
    'auth/email-already-in-use': 'Email già in uso.',
    'auth/invalid-credential': 'Email o password errati.',
    'auth/too-many-requests': 'Troppi tentativi. Riprova tra qualche minuto.',
  };
  return map[code] || 'Errore: ' + code;
}

function showError(msg) {
  const el = document.getElementById('loginError');
  el.textContent = msg;
  el.style.display = 'block';
}
function hideError() {
  document.getElementById('loginError').style.display = 'none';
}

onAuthStateChanged(auth, (user) => {
  if (user) {
    currentUserId = user.uid;
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('appScreen').style.display = 'block';
    document.getElementById('userEmail').textContent = user.email;
    initYearSelect();
    loadData();
  } else {
    currentUserId = null;
    document.getElementById('loginScreen').style.display = 'flex';
    document.getElementById('appScreen').style.display = 'none';
    trucks = [];
  }
});

function initYearSelect() {
  const sel = document.getElementById('yearSelect');
  const now = new Date().getFullYear();
  sel.innerHTML = '';
  for (let y = now - 2; y <= now + 1; y++) {
    const opt = document.createElement('option');
    opt.value = y; opt.textContent = y;
    if (y === now) opt.selected = true;
    sel.appendChild(opt);
  }
  // Set current month
  const months = ['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno',
    'Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre'];
  document.getElementById('monthSelect').value = months[new Date().getMonth()];
}

// ── Truck Actions ─────────────────────────────────────────────────────────────
window.addTruck = function () {
  trucks.push({
    id: Date.now(), name: 'Nuovo camion',
    ricavoViaggi: 0, ricavoMensile: 0,
    gasolio: 0, autista: 0, manutenzione: 0,
    pedaggi: 0, assicurazione: 0, ammortamento: 0
  });
  renderAll();
  scheduleSave();
};

window.removeTruck = function (id) {
  if (!confirm('Rimuovere questo camion?')) return;
  trucks = trucks.filter(t => t.id !== id);
  renderAll();
  scheduleSave();
};

window.updateField = function (id, field, val) {
  const t = trucks.find(x => x.id === id);
  if (t) t[field] = parseFloat(val) || 0;
  renderSummary();
  renderChart();
  scheduleSave();
};

window.updateName = function (id, val) {
  const t = trucks.find(x => x.id === id);
  if (t) t.name = val;
  scheduleSave();
};

window.renderAll = function () {
  loadData();
};

// ── Render ────────────────────────────────────────────────────────────────────
function renderSummary() {
  const totalR = trucks.reduce((s, t) => s + totalRicavi(t), 0);
  const totalC = trucks.reduce((s, t) => s + totalCosti(t), 0);
  const totalP = totalR - totalC;
  const margin = totalR > 0 ? Math.round(totalP / totalR * 100) : 0;
  const numTrucks = trucks.length;

  document.getElementById('summaryCards').innerHTML = `
    <div class="summary-card">
      <div class="summary-label">Camion attivi</div>
      <div class="summary-value">${numTrucks}</div>
    </div>
    <div class="summary-card">
      <div class="summary-label">Ricavi totali</div>
      <div class="summary-value">${fmtEur(totalR)}</div>
    </div>
    <div class="summary-card">
      <div class="summary-label">Costi totali</div>
      <div class="summary-value">${fmtEur(totalC)}</div>
    </div>
    <div class="summary-card">
      <div class="summary-label">Profitto netto</div>
      <div class="summary-value ${totalP >= 0 ? 'green' : 'red'}">${fmtProfit(totalP)}</div>
    </div>
    <div class="summary-card">
      <div class="summary-label">Margine</div>
      <div class="summary-value ${margin >= 0 ? 'green' : 'red'}">${margin}%</div>
    </div>
  `;
}

function renderTrucks() {
  const maxAbs = Math.max(...trucks.map(t => Math.abs(profitto(t))), 1);

  document.getElementById('truckList').innerHTML = trucks.map(t => {
    const r = totalRicavi(t), c = totalCosti(t), p = profitto(t);
    const barW = Math.round(Math.abs(p) / maxAbs * 100);
    const isPos = p >= 0;

    return `
    <div class="truck-card" id="truck-${t.id}">
      <div class="truck-header">
        <div class="truck-title-wrap">
          <div class="truck-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#E8FF47" stroke-width="1.5" stroke-linecap="round">
              <path d="M1 3h15v13H1zM16 8h4l3 3v5h-7V8z"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/>
            </svg>
          </div>
          <input class="truck-name-input" value="${t.name}"
            onchange="updateName(${t.id}, this.value)"
            oninput="updateName(${t.id}, this.value)">
        </div>
        <div style="display:flex;align-items:center;gap:10px">
          <span class="profit-badge ${isPos ? 'pos' : 'neg'}">${fmtProfit(p)}</span>
          <button class="btn-delete" onclick="removeTruck(${t.id})" aria-label="Rimuovi">✕</button>
        </div>
      </div>

      <div class="truck-body">
        <div>
          <div class="section-title-small">Costi mensili</div>
          ${COST_KEYS.map(k => `
            <div class="field-row">
              <span class="field-label">${COST_LABELS[k]}</span>
              <input class="field-input" type="number" min="0" step="1" value="${t[k]}"
                onchange="updateField(${t.id},'${k}',this.value)"
                oninput="updateField(${t.id},'${k}',this.value)">
            </div>`).join('')}
        </div>
        <div>
          <div class="section-title-small">Ricavi</div>
          <div class="field-row">
            <span class="field-label">Ricavi da viaggi</span>
            <input class="field-input" type="number" min="0" step="1" value="${t.ricavoViaggi}"
              onchange="updateField(${t.id},'ricavoViaggi',this.value)"
              oninput="updateField(${t.id},'ricavoViaggi',this.value)">
          </div>
          <div class="field-row">
            <span class="field-label">Ricavi mensili fissi</span>
            <input class="field-input" type="number" min="0" step="1" value="${t.ricavoMensile}"
              onchange="updateField(${t.id},'ricavoMensile',this.value)"
              oninput="updateField(${t.id},'ricavoMensile',this.value)">
          </div>
          <div class="field-row" style="margin-top:8px;border-bottom:none">
            <span class="field-label" style="color:var(--text)">Totale ricavi</span>
            <span style="font-size:14px;font-weight:500;color:var(--text)">${fmtEur(r)}</span>
          </div>
          <div class="field-row" style="border-bottom:none">
            <span class="field-label" style="color:var(--text)">Totale costi</span>
            <span style="font-size:14px;font-weight:500;color:var(--text)">${fmtEur(c)}</span>
          </div>
        </div>
      </div>

      <div class="truck-footer">
        <div style="display:flex;gap:16px;flex-wrap:wrap">
          <div class="footer-stat">Ricavi <strong>${fmtEur(r)}</strong></div>
          <div class="footer-stat">Costi <strong>${fmtEur(c)}</strong></div>
          <div class="footer-stat">Profitto <strong style="color:${isPos?'var(--green)':'var(--red)'}">${fmtProfit(p)}</strong></div>
        </div>
      </div>
      <div class="bar-track">
        <div class="bar-fill ${isPos ? 'green' : 'red'}" style="width:${barW}%"></div>
      </div>
    </div>`;
  }).join('');
}

function renderChart() {
  const labels = trucks.map(t => t.name);
  const profits = trucks.map(t => profitto(t));
  const colors = profits.map(p => p >= 0 ? '#4ade80' : '#f87171');
  const ctx = document.getElementById('profitChart').getContext('2d');
  if (chartInstance) chartInstance.destroy();
  chartInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Profitto netto (€)',
        data: profits,
        backgroundColor: colors,
        borderRadius: 6,
        borderSkipped: false
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => (ctx.raw >= 0 ? '+' : '') + ctx.raw.toLocaleString('it-IT') + ' €'
          }
        }
      },
      scales: {
        y: {
          ticks: {
            color: '#666',
            callback: v => (v >= 0 ? '+' : '') + v.toLocaleString('it-IT') + '€'
          },
          grid: { color: 'rgba(255,255,255,0.05)' }
        },
        x: {
          ticks: { color: '#666' },
          grid: { display: false }
        }
      }
    }
  });
}

function renderAll() {
  renderSummary();
  renderTrucks();
  renderChart();
}

// ── Toast ─────────────────────────────────────────────────────────────────────
function showToast() {
  const t = document.getElementById('saveToast');
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2000);
}

// Enter key on login
document.addEventListener('keydown', e => {
  if (e.key === 'Enter' && document.getElementById('loginScreen').style.display !== 'none') {
    window.doLogin();
  }
});
