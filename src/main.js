
import { createClient } from '@supabase/supabase-js';
import './style.css';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  document.querySelector('#app').innerHTML =
    '<main class="shell"><div class="card"><h2>Missing Supabase configuration</h2><p>Create a .env.local file from .env.example.</p></div></main>';
  throw new Error('Missing Supabase environment variables');
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const METERS = ['Main', 'Raw', 'Lighting', 'HVAC'];
const SIDES = ['West', 'East'];

const today = new Date().toISOString().slice(0, 10);
let selectedFiles = Array(6).fill(null);
let latestReadings = [];

document.querySelector('#app').innerHTML = `
  <main class="shell">
    <header>
      <div>
        <h1>⚡ Power Meter Reader</h1>
        <p>Upload up to 6 floor images. One image per floor contains all 8 opened meter panels.</p>
      </div>
      <button id="logoutBtn" class="secondary hidden">Log out</button>
    </header>

    <section id="authCard" class="card">
      <h2>Sign in</h2>
      <p class="muted">Use a Supabase Auth email/password account.</p>
      <input id="email" type="email" placeholder="Email" />
      <input id="password" type="password" placeholder="Password" />
      <div class="row">
        <button id="loginBtn">Sign in</button>
        <button id="signupBtn" class="secondary">Create account</button>
      </div>
      <div id="authMsg" class="message"></div>
    </section>

    <section id="appCard" class="hidden">
      <div class="card">
        <div class="section-head">
          <div>
            <h2>Upload up to 6 floors</h2>
            <p class="muted">For each floor, upload one clear image. Images are processed temporarily and are not saved.</p>
            <label>Reading date <input id="readingDate" type="date" /></label>
          </div>
          <button id="processBtn">🔎 Process all uploaded floors</button>
        </div>
        <div id="slots" class="grid"></div>
      </div>

      <div class="card">
        <div class="section-head">
          <div>
            <h2>Results</h2>
            <p class="muted">Mapping is fixed: positions 1–4 = West; positions 5–8 = East.</p>
          </div>
          <button id="refreshBtn" class="secondary">Refresh</button>
        </div>
        <div id="status"></div>
        <div id="results"></div>
      </div>
    </section>
  </main>
`;

document.querySelector('#readingDate').value = today;
const slotsEl = document.querySelector('#slots');
for (let i = 0; i < 6; i++) {
  slotsEl.insertAdjacentHTML('beforeend', `
    <div class="floor-slot">
      <h3>Floor ${i + 1}</h3>
      <input id="floor-${i}" class="floor-name" value="${i === 0 ? '1st Floor' : `${i + 1}th Floor`}" />
      <input id="file-${i}" type="file" accept="image/*" />
      <div id="preview-${i}" class="preview muted">No image selected</div>
    </div>
  `);
  document.querySelector(`#file-${i}`).addEventListener('change', (e) => {
    selectedFiles[i] = e.target.files[0] || null;
    const preview = document.querySelector(`#preview-${i}`);
    if (selectedFiles[i]) {
      preview.innerHTML = `<img src="${URL.createObjectURL(selectedFiles[i])}" alt="Floor preview" />`;
    } else {
      preview.textContent = 'No image selected';
    }
  });
}

const authCard = document.querySelector('#authCard');
const appCard = document.querySelector('#appCard');
const logoutBtn = document.querySelector('#logoutBtn');
const authMsg = document.querySelector('#authMsg');

function showMessage(text, type='') {
  authMsg.textContent = text;
  authMsg.className = `message ${type}`;
}

async function refreshSession() {
  const { data } = await supabase.auth.getSession();
  const loggedIn = !!data.session;
  authCard.classList.toggle('hidden', loggedIn);
  appCard.classList.toggle('hidden', !loggedIn);
  logoutBtn.classList.toggle('hidden', !loggedIn);
  if (loggedIn) loadRecentReadings();
}

document.querySelector('#loginBtn').onclick = async () => {
  const email = document.querySelector('#email').value.trim();
  const password = document.querySelector('#password').value;
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) showMessage(error.message, 'error');
  else showMessage('Signed in.', 'ok');
  refreshSession();
};

document.querySelector('#signupBtn').onclick = async () => {
  const email = document.querySelector('#email').value.trim();
  const password = document.querySelector('#password').value;
  const { error } = await supabase.auth.signUp({ email, password });
  if (error) showMessage(error.message, 'error');
  else showMessage('Account created. Check your email if confirmation is enabled.', 'ok');
};

logoutBtn.onclick = async () => {
  await supabase.auth.signOut();
  refreshSession();
};

document.querySelector('#processBtn').onclick = async () => {
  const floors = [];
  for (let i = 0; i < 6; i++) {
    const file = selectedFiles[i];
    if (!file) continue;
    const name = document.querySelector(`#floor-${i}`).value.trim();
    if (!name) {
      alert(`Please enter a floor name for slot ${i + 1}.`);
      return;
    }
    floors.push({ floorName: name, file, slot: i + 1 });
  }

  if (!floors.length) {
    alert('Upload at least one floor image.');
    return;
  }

  const status = document.querySelector('#status');
  status.innerHTML = `<div class="message">Uploading ${floors.length} floor image(s) and processing them...</div>`;
  document.querySelector('#processBtn').disabled = true;

  try {
    const user = (await supabase.auth.getUser()).data.user;
    if (!user) throw new Error('Please sign in again.');

    const uploads = [];
    for (const floor of floors) {
      const imageBase64 = await fileToDataUrl(floor.file);
      uploads.push({
        floorName: floor.floorName,
        imageDataUrl: imageBase64,
        slot: floor.slot
      });
    }

    const readingDate = document.querySelector('#readingDate').value;
    const { data: fnData, error: fnError } = await supabase.functions.invoke('process-floor-images', {
      body: { floors: uploads, readingDate }
    });
    if (fnError) throw fnError;

    latestReadings = fnData.readings || [];
    renderResults(latestReadings);
    status.innerHTML = `<div class="message ok">Finished ${uploads.length} floor(s). Review any rows marked REVIEW.</div>`;
  } catch (err) {
    console.error(err);
    status.innerHTML = `<div class="message error">${escapeHtml(err.message || String(err))}</div>`;
  } finally {
    document.querySelector('#processBtn').disabled = false;
  }
};

document.querySelector('#refreshBtn').onclick = loadRecentReadings;
document.querySelector('#readingDate').addEventListener('change', loadRecentReadings);

async function loadRecentReadings() {
  const selectedDate = document.querySelector('#readingDate')?.value || today;
  const { data, error } = await supabase
    .from('meter_readings')
    .select('reading_date,floor_name,side,meter_type,kwh,kvah,status,created_at')
    .eq('reading_date', selectedDate)
    .order('floor_name', { ascending: true })
    .order('position', { ascending: true })
    .limit(500);

  if (error) {
    document.querySelector('#results').innerHTML = `<div class="message error">${escapeHtml(error.message)}</div>`;
    return;
  }
  latestReadings = data || [];
  renderResults(latestReadings);
}

function renderResults(rows) {
  if (!rows.length) {
    document.querySelector('#results').innerHTML = '<p class="muted">No readings for this date yet.</p>';
    return;
  }

  const selectedDate = document.querySelector('#readingDate')?.value || today;

  const grouped = {};
  for (const r of rows) {
    grouped[r.floor_name] ??= [];
    grouped[r.floor_name].push(r);
  }

  let html = `<div class="date-heading">Reading Date: <strong>${escapeHtml(selectedDate)}</strong></div>`;

  for (const [floor, floorRows] of Object.entries(grouped)) {
    html += `<section class="floor-result">
      <h2>${escapeHtml(floor)}</h2>`;

    html += `<h3>kWh Readings</h3>`;
    html += `<table><thead><tr><th>Meter</th><th>West</th><th>East</th></tr></thead><tbody>`;
    for (const meter of METERS) {
      const west = floorRows.find(r => r.meter_type === meter && r.side === 'West');
      const east = floorRows.find(r => r.meter_type === meter && r.side === 'East');
      html += `<tr>
        <td>${escapeHtml(meter)}</td>
        <td>${escapeHtml(west?.kwh ?? '')}</td>
        <td>${escapeHtml(east?.kwh ?? '')}</td>
      </tr>`;
    }
    html += `</tbody></table>`;
    html += `<button class="secondary" data-copy="${encodeURIComponent(makeMatrix(floorRows, 'kwh', floor))}">Copy kWh only</button>`;

    html += `<h3 class="kvah-title">kVAh Readings</h3>`;
    html += `<table><thead><tr><th>Meter</th><th>West</th><th>East</th></tr></thead><tbody>`;
    for (const meter of METERS) {
      const west = floorRows.find(r => r.meter_type === meter && r.side === 'West');
      const east = floorRows.find(r => r.meter_type === meter && r.side === 'East');
      html += `<tr>
        <td>${escapeHtml(meter)}</td>
        <td>${escapeHtml(west?.kvah ?? '')}</td>
        <td>${escapeHtml(east?.kvah ?? '')}</td>
      </tr>`;
    }
    html += `</tbody></table>`;
    html += `<button class="secondary" data-copy="${encodeURIComponent(makeMatrix(floorRows, 'kvah', floor))}">Copy kVAh only</button>`;

    const reviewCount = floorRows.filter(r => r.status === 'REVIEW').length;
    if (reviewCount) {
      html += `<div class="message error">${reviewCount} reading row(s) need review.</div>`;
    }

    html += `</section>`;
  }

  document.querySelector('#results').innerHTML = html;

  document.querySelectorAll('[data-copy]').forEach(btn => {
    btn.onclick = async () => {
      await navigator.clipboard.writeText(decodeURIComponent(btn.dataset.copy));
      const old = btn.textContent;
      btn.textContent = '✓ Copied';
      setTimeout(() => btn.textContent = old, 1200);
    };
  });
}

function makeMatrix(rows, field, floor) {
  // Copy ONLY the measurement values for direct paste into Excel.
  // No date, floor name, or labels are included in the copied block.
  const lines = ['Meter\tWest\tEast'];

  for (const meter of METERS) {
    const west = rows.find(r => r.meter_type === meter && r.side === 'West');
    const east = rows.find(r => r.meter_type === meter && r.side === 'East');
    lines.push(`${meter}\t${west?.[field] ?? ''}\t${east?.[field] ?? ''}`);
  }

  return lines.join('\n');
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, ch => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
  }[ch]));
}

refreshSession();
      
