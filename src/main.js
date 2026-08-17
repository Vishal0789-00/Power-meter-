import { createClient } from '@supabase/supabase-js';
import { createWorker, PSM } from 'tesseract.js';
import './style.css';

const SUPABASE_URL =
  import.meta.env.VITE_SUPABASE_URL;

const SUPABASE_KEY =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

const app =
  document.querySelector('#app');

if (!SUPABASE_URL || !SUPABASE_KEY) {
  app.innerHTML = `
    <main class="shell">
      <div class="card">
        <h2>Missing Supabase configuration</h2>
        <p>
          Set VITE_SUPABASE_URL and
          VITE_SUPABASE_PUBLISHABLE_KEY
          in Vercel.
        </p>
      </div>
    </main>
  `;

  throw new Error(
    'Missing Supabase environment variables'
  );
}

const supabase =
  createClient(
    SUPABASE_URL,
    SUPABASE_KEY
  );

const METERS = [
  'Main',
  'Raw',
  'Lighting',
  'HVAC'
];

const today =
  new Date()
    .toISOString()
    .slice(0, 10);

let selectedFiles =
  Array(6).fill(null);

let worker = null;


app.innerHTML = `
<main class="shell">

  <header>

    <div>

      <h1>
        ⚡ Power Meter Reader
      </h1>

      <p>
        Free browser OCR version.
        No OpenAI API required.
      </p>

    </div>

    <button
      id="logoutBtn"
      class="secondary hidden"
    >
      Log out
    </button>

  </header>


  <section
    id="authCard"
    class="card"
  >

    <h2>
      Sign in
    </h2>

    <input
      id="email"
      type="email"
      placeholder="Email"
    >

    <input
      id="password"
      type="password"
      placeholder="Password"
    >

    <div class="row">

      <button id="loginBtn">
        Sign in
      </button>

      <button
        id="signupBtn"
        class="secondary"
      >
        Create account
      </button>

    </div>

    <p
      id="authMsg"
      class="message"
    ></p>

  </section>


  <section
    id="appCard"
    class="hidden"
  >

    <div class="card">

      <h2>
        Upload floors
      </h2>

      <p class="muted">
        Crop each image tightly around the
        8 meter panels before uploading.
      </p>

      <label>
        Reading date

        <input
          id="readingDate"
          type="date"
        >

      </label>

      <div
        id="floorInputs"
        class="grid"
      ></div>

      <button id="processBtn">
        🔎 Read meter images
      </button>

      <p
        id="status"
        class="message"
      ></p>

    </div>


    <div class="card">

      <h2>
        Results
      </h2>

      <p class="muted">
        OCR runs in your browser.
        Unclear values are marked REVIEW.
      </p>

      <div id="results"></div>

    </div>

  </section>

</main>
`;


document
  .querySelector('#readingDate')
  .value = today;


const floorInputs =
  document.querySelector(
    '#floorInputs'
  );


for (
  let i = 0;
  i < 6;
  i++
) {

  const n = i + 1;

  const floorName =
    n === 1
      ? '1st Floor'
      : n === 2
        ? '2nd Floor'
        : n === 3
          ? '3rd Floor'
          : `${n}th Floor`;


  floorInputs.insertAdjacentHTML(
    'beforeend',
    `
      <div class="floor-slot">

        <h3>
          Floor ${n}
        </h3>

        <input
          id="floorName${i}"
          value="${floorName}"
        >

        <input
          id="floorFile${i}"
          type="file"
          accept="image/*"
        >

        <div
          id="preview${i}"
          class="preview muted"
        >
          No image selected
        </div>

      </div>
    `
  );


  document
    .querySelector(
      `#floorFile${i}`
    )
    .addEventListener(
      'change',
      event => {

        selectedFiles[i] =
          event.target.files[0] ||
          null;


        const preview =
          document.querySelector(
            `#preview${i}`
          );


        if (!selectedFiles[i]) {

          preview.textContent =
            'No image selected';

          return;
        }


        preview.innerHTML = `
          <img
            src="${URL.createObjectURL(
              selectedFiles[i]
            )}"
            alt="Floor preview"
          >
        `;

      }
    );

}


const authCard =
  document.querySelector('#authCard');

const appCard =
  document.querySelector('#appCard');

const logoutBtn =
  document.querySelector('#logoutBtn');

const authMsg =
  document.querySelector('#authMsg');


function setAuthMessage(
  text,
  type = ''
) {
  authMsg.textContent = text;
  authMsg.className =
    `message ${type}`;
}


async function refreshSession() {

  const {
    data,
    error
  } =
    await supabase.auth.getSession();

  if (error) {

    setAuthMessage(
      error.message,
      'error'
    );

    return;
  }


  const loggedIn =
    Boolean(data.session);


  authCard.classList.toggle(
    'hidden',
    loggedIn
  );

  appCard.classList.toggle(
    'hidden',
    !loggedIn
  );

  logoutBtn.classList.toggle(
    'hidden',
    !loggedIn
  );


  if (loggedIn) {
    await loadSavedReadings();
  }
}


document
  .querySelector('#loginBtn')
  .onclick =
  async () => {

    const email =
      document
        .querySelector('#email')
        .value
        .trim();

    const password =
      document
        .querySelector('#password')
        .value;


    const {
      error
    } =
      await supabase.auth
        .signInWithPassword({
          email,
          password
        });


    if (error) {

      setAuthMessage(
        error.message,
        'error'
      );

      return;
    }


    setAuthMessage(
      'Signed in.',
      'ok'
    );


    await refreshSession();
  };


document
  .querySelector('#signupBtn')
  .onclick =
  async () => {

    const email =
      document
        .querySelector('#email')
        .value
        .trim();

    const password =
      document
        .querySelector('#password')
        .value;


    const {
      error
    } =
      await supabase.auth
        .signUp({
          email,
          password
        });


    setAuthMessage(
      error
        ? error.message
        : 'Account created. Check your email if confirmation is enabled.',
      error
        ? 'error'
        : 'ok'
    );
  };


logoutBtn.onclick =
  async () => {

    await supabase.auth.signOut();


    if (worker) {

      await worker.terminate();

      worker = null;
    }


    await refreshSession();
  };
async function getWorker() {
  if (worker) return worker;

  const status = document.querySelector('#status');
  status.textContent = 'Loading OCR...';

  worker = await createWorker('eng', 1, {
    logger: m => {
      if (m.status && typeof m.progress === 'number') {
        status.textContent =
          `${m.status} ${Math.round(m.progress * 100)}%`;
      }
    }
  });

  await worker.setParameters({
    tessedit_pageseg_mode: PSM.SINGLE_LINE,
    tessedit_char_whitelist: '0123456789.'
  });

  return worker;
}


function loadImage(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();

    img.onload = () => {
      URL.revokeObjectURL(img.src);
      resolve(img);
    };

    img.onerror = () => {
      URL.revokeObjectURL(img.src);
      reject(new Error('Could not open image.'));
    };

    img.src = URL.createObjectURL(file);
  });
}


function cropPanel(image, panel, row) {
  const w = image.naturalWidth / 8;
  const left = Math.round(panel * w);
  const right = panel === 7
    ? image.naturalWidth
    : Math.round((panel + 1) * w);

  const width = right - left;

  const topRatio = row === 'kwh' ? 0.53 : 0.76;
  const bottomRatio = row === 'kwh' ? 0.78 : 0.995;

  const top = Math.floor(
    image.naturalHeight * topRatio
  );

  const height = Math.max(
    1,
    Math.ceil(
      image.naturalHeight * bottomRatio
    ) - top
  );

  const scale = 4;

  const canvas = document.createElement('canvas');

  canvas.width = width * scale;
  canvas.height = height * scale;

  const ctx = canvas.getContext('2d');

  ctx.drawImage(
    image,
    left,
    top,
    width,
    height,
    0,
    0,
    canvas.width,
    canvas.height
  );

  const data = ctx.getImageData(
    0,
    0,
    canvas.width,
    canvas.height
  );

  for (let i = 0; i < data.data.length; i += 4) {
    const r = data.data[i];
    const g = data.data[i + 1];
    const b = data.data[i + 2];

    let gray =
      0.299 * r +
      0.587 * g +
      0.114 * b;

    gray =
      (gray - 110) * 2.2 + 128;

    gray =
      Math.max(0, Math.min(255, gray));

    data.data[i] = gray;
    data.data[i + 1] = gray;
    data.data[i + 2] = gray;
  }

  ctx.putImageData(data, 0, 0);

  return canvas;
}


function extractNumber(text) {
  const matches =
    String(text || '')
      .replace(/[^0-9.]/g, ' ')
      .match(/\d+(?:\.\d+)?/g);

  if (!matches || !matches.length) {
    return null;
  }

  matches.sort(
    (a, b) => b.length - a.length
  );

  return matches[0];
}


async function readCrop(canvas) {
  const ocr = await getWorker();

  const result =
    await ocr.recognize(canvas);

  return extractNumber(
    result?.data?.text || ''
  );
}


async function readOnePanel(
  image,
  panel
) {
  const status =
    document.querySelector('#status');

  status.textContent =
    `Reading panel ${panel + 1} of 8...`;

  const kwhCanvas =
    cropPanel(
      image,
      panel,
      'kwh'
    );

  const kvahCanvas =
    cropPanel(
      image,
      panel,
      'kvah'
    );

  const kwh =
    await readCrop(kwhCanvas);

  const kvah =
    await readCrop(kvahCanvas);

  return {
    position: panel + 1,
    kwh,
    kvah,
    status:
      kwh && kvah
        ? 'OK'
        : 'REVIEW'
  };
}


async function readEightPanels(file) {
  const image =
    await loadImage(file);

  const readings = [];

  for (let i = 0; i < 8; i++) {
    readings.push(
      await readOnePanel(
        image,
        i
      )
    );
  }

  return readings;
}


function buildRows(
  floorName,
  readingDate,
  readings
) {
  return readings.map(r => {
    const p = r.position;

    return {
      floor_name: floorName,
      side: p <= 4 ? 'West' : 'East',
      meter_type:
        p <= 4
          ? METERS[p - 1]
          : METERS[p - 5],
      position: p,
      kwh: r.kwh,
      kvah: r.kvah,
      status: r.status,
      reading_date: readingDate
    };
  });
}


async function saveRows(rows) {
  const {
    data,
    error
  } =
    await supabase.auth.getUser();

  if (error) throw error;

  if (!data.user) {
    throw new Error(
      'Please sign in again.'
    );
  }

  const date =
    document.querySelector(
      '#readingDate'
    ).value;

  const floors = [
    ...new Set(
      rows.map(
        r => r.floor_name
      )
    )
  ];

  for (const floor of floors) {
    const result =
      await supabase
        .from('meter_readings')
        .delete()
        .eq('user_id', data.user.id)
        .eq('reading_date', date)
        .eq('floor_name', floor);

    if (result.error) {
      throw result.error;
    }
  }

  const result =
    await supabase
      .from('meter_readings')
      .insert(
        rows.map(r => ({
          ...r,
          user_id: data.user.id
        }))
      );

  if (result.error) {
    throw result.error;
  }
      }
document
  .querySelector('#processBtn')
  .onclick = async () => {

    const status =
      document.querySelector('#status');

    const button =
      document.querySelector('#processBtn');

    const uploads = [];

    for (let i = 0; i < 6; i++) {

      if (!selectedFiles[i]) continue;

      const floorName =
        document
          .querySelector(`#floorName${i}`)
          .value
          .trim();

      if (!floorName) {
        alert(
          `Enter floor name ${i + 1}.`
        );
        return;
      }

      uploads.push({
        floorName,
        file: selectedFiles[i]
      });
    }

    if (!uploads.length) {
      alert(
        'Upload at least one floor image.'
      );
      return;
    }

    button.disabled = true;

    try {

      const date =
        document
          .querySelector('#readingDate')
          .value;

      const allRows = [];

      for (const upload of uploads) {

        status.textContent =
          `Reading ${upload.floorName}...`;

        const readings =
          await readEightPanels(
            upload.file
          );

        allRows.push(
          ...buildRows(
            upload.floorName,
            date,
            readings
          )
        );
      }

      status.textContent =
        'Saving readings...';

      await saveRows(allRows);

      renderResults(allRows);

      status.textContent =
        'Finished. Review REVIEW values.';

    } catch (error) {

      console.error(error);

      status.textContent =
        `Error: ${
          error?.message ||
          String(error)
        }`;

    } finally {

      button.disabled = false;
    }
  };


async function loadSavedReadings() {

  const date =
    document
      .querySelector('#readingDate')
      .value;

  const {
    data,
    error
  } =
    await supabase
      .from('meter_readings')
      .select(
        'reading_date,floor_name,side,meter_type,kwh,kvah,status,position'
      )
      .eq(
        'reading_date',
        date
      )
      .order(
        'floor_name',
        { ascending: true }
      )
      .order(
        'position',
        { ascending: true }
      )
      .limit(500);

  if (error) {

    document
      .querySelector('#results')
      .innerHTML =
      `<p class="message error">
        ${escapeHtml(error.message)}
      </p>`;

    return;
  }

  renderResults(data || []);
}


document
  .querySelector('#readingDate')
  .onchange =
  loadSavedReadings;


function renderResults(rows) {

  const results =
    document.querySelector('#results');

  if (!rows.length) {

    results.innerHTML =
      `<p class="muted">
        No readings for this date yet.
      </p>`;

    return;
  }

  const grouped = {};

  rows.forEach(row => {

    if (!grouped[row.floor_name]) {
      grouped[row.floor_name] = [];
    }

    grouped[row.floor_name].push(row);
  });

  let html = '';

  for (
    const [floor, floorRows]
    of Object.entries(grouped)
  ) {

    html += `
      <section class="floor-result">

        <h2>
          ${escapeHtml(floor)}
        </h2>

        <h3>kWh</h3>

        <table>

          <thead>
            <tr>
              <th>Meter</th>
              <th>West</th>
              <th>East</th>
            </tr>
          </thead>

          <tbody>
    `;

    METERS.forEach(meter => {

      const west =
        floorRows.find(
          r =>
            r.meter_type === meter &&
            r.side === 'West'
        );

      const east =
        floorRows.find(
          r =>
            r.meter_type === meter &&
            r.side === 'East'
        );

      html += `
        <tr>
          <td>
            ${escapeHtml(meter)}
          </td>

          <td>
            ${escapeHtml(west?.kwh || '')}
          </td>

          <td>
            ${escapeHtml(east?.kwh || '')}
          </td>
        </tr>
      `;
    });

    html += `
          </tbody>
        </table>

        <button
          class="secondary copyBtn"
          data-copy="${encodeURIComponent(
            makeCopy(
              floorRows,
              'kwh'
            )
          )}"
        >
          Copy kWh only
        </button>

        <h3>kVAh</h3>

        <table>

          <thead>
            <tr>
              <th>Meter</th>
              <th>West</th>
              <th>East</th>
            </tr>
          </thead>

          <tbody>
    `;

    METERS.forEach(meter => {

      const west =
        floorRows.find(
          r =>
            r.meter_type === meter &&
            r.side === 'West'
        );

      const east =
        floorRows.find(
          r =>
            r.meter_type === meter &&
            r.side === 'East'
        );

      html += `
        <tr>
          <td>
            ${escapeHtml(meter)}
          </td>

          <td>
            ${escapeHtml(west?.kvah || '')}
          </td>

          <td>
            ${escapeHtml(east?.kvah || '')}
          </td>
        </tr>
      `;
    });

    html += `
          </tbody>
        </table>

        <button
          class="secondary copyBtn"
          data-copy="${encodeURIComponent(
            makeCopy(
              floorRows,
              'kvah'
            )
          )}"
        >
          Copy kVAh only
        </button>
    `;

    const reviews =
      floorRows.filter(
        r =>
          r.status === 'REVIEW'
      ).length;

    if (reviews) {

      html += `
        <p class="message error">
          ${reviews}
          reading(s) need review.
        </p>
      `;
    }

    html += `
      </section>
    `;
  }

  results.innerHTML = html;


  document
    .querySelectorAll('.copyBtn')
    .forEach(button => {

      button.onclick =
        async () => {

          const value =
            decodeURIComponent(
              button.dataset.copy || ''
            );

          try {

            await navigator
              .clipboard
              .writeText(value);

          } catch {

            const box =
              document.createElement(
                'textarea'
              );

            box.value = value;

            document.body
              .appendChild(box);

            box.select();

            document.execCommand(
              'copy'
            );

            box.remove();
          }

          const old =
            button.textContent;

          button.textContent =
            '✓ Copied';

          setTimeout(
            () => {
              button.textContent = old;
            },
            1200
          );
        };
    });
}


function makeCopy(
  rows,
  field
) {

  return METERS
    .map(meter => {

      const west =
        rows.find(
          r =>
            r.meter_type === meter &&
            r.side === 'West'
        );

      const east =
        rows.find(
          r =>
            r.meter_type === meter &&
            r.side === 'East'
        );

      return `${
        west?.[field] || ''
      }\t${
        east?.[field] || ''
      }`;
    })
    .join('\n');
}


function escapeHtml(value) {

  return String(value)
    .replace(
      /[&<>"']/g,
      c => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
      }[c])
    );
}


refreshSession();
