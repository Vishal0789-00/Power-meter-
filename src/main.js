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

  if (worker) {
    return worker;
  }

  const status =
    document.querySelector(
      '#status'
    );

  status.textContent =
    'Loading free OCR engine...';


  worker =
    await createWorker(
      'eng',
      1,
      {
        logger: message => {

          if (
            message.status &&
            typeof message.progress ===
              'number'
          ) {

            const percent =
              Math.round(
                message.progress * 100
              );

            status.textContent =
              `${message.status} ${percent}%`;
          }
        }
      }
    );


  await worker.setParameters({
    tessedit_pageseg_mode:
      PSM.SINGLE_BLOCK
  });


  return worker;
}


function imageSize(file) {

  return new Promise(
    (resolve, reject) => {

      const image =
        new Image();

      image.onload =
        () => {

          resolve({
            width:
              image.naturalWidth,

            height:
              image.naturalHeight
          });

        };


      image.onerror =
        () => {

          reject(
            new Error(
              'Could not open image.'
            )
          );

        };


      image.src =
        URL.createObjectURL(
          file
        );
    }
  );
}


function numberFromText(
  text,
  labels
) {

  const lines =
    text
      .split(/\r?\n/)
      .map(
        line =>
          line.trim()
      )
      .filter(Boolean);


  for (
    const line
    of lines
  ) {

    const lower =
      line.toLowerCase();


    if (
      !labels.some(
        label =>
          lower.includes(label)
      )
    ) {
      continue;
    }


    const matches =
      line.match(
        /\b\d{1,3}(?:[,\s]\d{3})*(?:\.\d+)?\b/g
      );


    if (
      matches &&
      matches.length
    ) {

      return matches[
        matches.length - 1
      ]
        .replace(
          /\s/g,
          ''
        )
        .replace(
          /,/g,
          ''
        );
    }
  }


  return null;
}


function parseMeterText(
  text,
  position
) {

  const kwh =
    numberFromText(
      text,
      [
        'total energy',
        'total energ',
        'energy'
      ]
    );


  const kvah =
    numberFromText(
      text,
      [
        'apparent power per hour',
        'apparent power',
        'kvah',
        'kvah'
      ]
    );


  return {

    position,

    kwh,

    kvah,

    status:
      kwh && kvah
        ? 'OK'
        : 'REVIEW'

  };
}


async function readEightPanels(
  file
) {

  const ocr =
    await getWorker();

  const size =
    await imageSize(file);

  const panelWidth =
    Math.floor(
      size.width / 8
    );

  const readings = [];


  for (
    let i = 0;
    i < 8;
    i++
  ) {

    const left =
      i * panelWidth;


    const width =
      i === 7
        ? size.width - left
        : panelWidth;


    const result =
      await ocr.recognize(
        file,
        {
          rectangle: {

            left,

            top: 0,

            width,

            height:
              size.height

          }
        }
      );


    readings.push(
      parseMeterText(
        result.data.text ||
          '',
        i + 1
      )
    );


    document
      .querySelector(
        '#status'
      )
      .textContent =
      `Reading panel ${i + 1} of 8...`;
  }


  return readings;
}
function buildRows(
  floorName,
  readingDate,
  readings
) {
  return readings.map(
    reading => {

      const position =
        reading.position;

      return {
        floor_name:
          floorName,

        side:
          position <= 4
            ? 'West'
            : 'East',

        meter_type:
          position <= 4
            ? METERS[position - 1]
            : METERS[position - 5],

        position,

        kwh:
          reading.kwh,

        kvah:
          reading.kvah,

        status:
          reading.status,

        reading_date:
          readingDate
      };
    }
  );
}


async function saveRows(rows) {

  const {
    data: userData,
    error: userError
  } =
    await supabase.auth.getUser();


  if (userError) {
    throw userError;
  }


  if (!userData.user) {
    throw new Error(
      'Please sign in again.'
    );
  }


  const readingDate =
    document.querySelector(
      '#readingDate'
    ).value;


  const floorNames =
    [
      ...new Set(
        rows.map(
          row =>
            row.floor_name
        )
      )
    ];


  for (
    const floorName
    of floorNames
  ) {

    const {
      error
    } =
      await supabase
        .from(
          'meter_readings'
        )
        .delete()
        .eq(
          'user_id',
          userData.user.id
        )
        .eq(
          'reading_date',
          readingDate
        )
        .eq(
          'floor_name',
          floorName
        );


    if (error) {
      throw error;
    }
  }


  const {
    error
  } =
    await supabase
      .from(
        'meter_readings'
      )
      .insert(
        rows.map(
          row => ({
            ...row,
            user_id:
              userData.user.id
          })
        )
      );


  if (error) {
    throw error;
  }
}


document
  .querySelector(
    '#processBtn'
  )
  .onclick =
  async () => {

    const status =
      document.querySelector(
        '#status'
      );

    const button =
      document.querySelector(
        '#processBtn'
      );

    const uploads = [];


    for (
      let i = 0;
      i < 6;
      i++
    ) {

      if (!selectedFiles[i]) {
        continue;
      }


      const floorName =
        document
          .querySelector(
            `#floorName${i}`
          )
          .value
          .trim();


      if (!floorName) {

        alert(
          `Enter a floor name for slot ${i + 1}.`
        );

        return;
      }


      uploads.push({
        floorName,
        file:
          selectedFiles[i]
      });
    }


    if (!uploads.length) {

      alert(
        'Upload at least one floor image.'
      );

      return;
    }


    button.disabled =
      true;


    try {

      const readingDate =
        document
          .querySelector(
            '#readingDate'
          )
          .value;


      const allRows = [];


      for (
        const upload
        of uploads
      ) {

        status.textContent =
          `Reading ${upload.floorName}...`;


        const readings =
          await readEightPanels(
            upload.file
          );


        const rows =
          buildRows(
            upload.floorName,
            readingDate,
            readings
          );


        allRows.push(
          ...rows
        );
      }


      status.textContent =
        'Saving readings...';


      await saveRows(
        allRows
      );


      renderResults(
        allRows
      );


      status.textContent =
        'Finished. Review any rows marked REVIEW.';


    } catch (error) {

      console.error(error);


      status.textContent =
        `Error: ${
          error?.message ||
          String(error)
        }`;


    } finally {

      button.disabled =
        false;

    }
  };


async function loadSavedReadings() {

  const readingDate =
    document
      .querySelector(
        '#readingDate'
      )
      .value;


  const {
    data,
    error
  } =
    await supabase
      .from(
        'meter_readings'
      )
      .select(
        'reading_date,floor_name,side,meter_type,kwh,kvah,status,position'
      )
      .eq(
        'reading_date',
        readingDate
      )
      .order(
        'floor_name',
        {
          ascending:
            true
        }
      )
      .order(
        'position',
        {
          ascending:
            true
        }
      )
      .limit(500);


  if (error) {

    document
      .querySelector(
        '#results'
      )
      .innerHTML =
      `
        <p class="message error">
          ${escapeHtml(
            error.message
          )}
        </p>
      `;

    return;
  }


  renderResults(
    data || []
  );
}


document
  .querySelector(
    '#readingDate'
  )
  .onchange =
  loadSavedReadings;


function renderResults(
  rows
) {

  const results =
    document.querySelector(
      '#results'
    );


  if (!rows.length) {

    results.innerHTML =
      `
        <p class="muted">
          No readings for this date yet.
        </p>
      `;

    return;
  }


  const grouped = {};


  for (
    const row
    of rows
  ) {

    if (
      !grouped[
        row.floor_name
      ]
    ) {

      grouped[
        row.floor_name
      ] = [];
    }


    grouped[
      row.floor_name
    ].push(row);
  }


  let html = '';


  for (
    const [
      floor,
      floorRows
    ]
    of Object.entries(
      grouped
    )
  ) {

    html += `
      <section
        class="floor-result"
      >

        <h2>
          ${escapeHtml(
            floor
          )}
        </h2>

        <h3>
          kWh
        </h3>

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


    for (
      const meter
      of METERS
    ) {

      const west =
        floorRows.find(
          row =>
            row.meter_type ===
              meter &&
            row.side ===
              'West'
        );


      const east =
        floorRows.find(
          row =>
            row.meter_type ===
              meter &&
            row.side ===
              'East'
        );


      html += `
        <tr>

          <td>
            ${escapeHtml(
              meter
            )}
          </td>

          <td>
            ${escapeHtml(
              west?.kwh ||
                ''
            )}
          </td>

          <td>
            ${escapeHtml(
              east?.kwh ||
                ''
            )}
          </td>

        </tr>
      `;
    }


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


        <h3>
          kVAh
        </h3>


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


    for (
      const meter
      of METERS
    ) {

      const west =
        floorRows.find(
          row =>
            row.meter_type ===
              meter &&
            row.side ===
              'West'
        );


      const east =
        floorRows.find(
          row =>
            row.meter_type ===
              meter &&
            row.side ===
              'East'
        );


      html += `
        <tr>

          <td>
            ${escapeHtml(
              meter
            )}
          </td>

          <td>
            ${escapeHtml(
              west?.kvah ||
                ''
            )}
          </td>

          <td>
            ${escapeHtml(
              east?.kvah ||
                ''
            )}
          </td>

        </tr>
      `;
    }


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


    const reviewCount =
      floorRows.filter(
        row =>
          row.status ===
            'REVIEW'
      ).length;


    if (
      reviewCount
    ) {

      html += `
        <p
          class="message error"
        >
          ${reviewCount}
          reading(s)
          need review.
        </p>
      `;
    }


    html += `
      </section>
    `;
  }


  results.innerHTML =
    html;


  document
    .querySelectorAll(
      '.copyBtn'
    )
    .forEach(
      button => {

        button.onclick =
          async () => {

            const value =
              decodeURIComponent(
                button.dataset
                  .copy ||
                  ''
              );


            try {

              await navigator
                .clipboard
                .writeText(
                  value
                );

            } catch {

              const textarea =
                document
                  .createElement(
                    'textarea'
                  );


              textarea.value =
                value;


              document.body
                .appendChild(
                  textarea
                );


              textarea.select();


              document
                .execCommand(
                  'copy'
                );


              textarea.remove();
            }


            const old =
              button.textContent;


            button.textContent =
              '✓ Copied';


            setTimeout(
              () => {

                button.textContent =
                  old;

              },
              1200
            );
          };
      }
    );
}


function makeCopy(
  rows,
  field
) {

  return METERS
    .map(
      meter => {

        const west =
          rows.find(
            row =>
              row.meter_type ===
                meter &&
              row.side ===
                'West'
          );


        const east =
          rows.find(
            row =>
              row.meter_type ===
                meter &&
              row.side ===
                'East'
          );


        return `${
          west?.[field] ||
          ''
        }\t${
          east?.[field] ||
          ''
        }`;
      }
    )
    .join('\n');
}


function escapeHtml(
  value
) {

  return String(
    value
  ).replace(
    /[&<>"']/g,
    character => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
    }[character])
  );
}


refreshSession();
