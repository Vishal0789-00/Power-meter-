import { createClient } from '@supabase/supabase-js';
import './style.css';

const SUPABASE_URL =
  import.meta.env.VITE_SUPABASE_URL;

const SUPABASE_KEY =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  document.querySelector('#app').innerHTML = `
    <main class="shell">
      <div class="card">
        <h2>Missing Supabase configuration</h2>
        <p>Create the required Vercel environment variables.</p>
      </div>
    </main>
  `;

  throw new Error(
    'Missing Supabase environment variables'
  );
}

const supabase = createClient(
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
  new Date().toISOString().slice(0, 10);

let selectedFiles =
  Array(6).fill(null);

let latestReadings = [];

document.querySelector('#app').innerHTML = `
  <main class="shell">

    <header>

      <div>
        <h1>⚡ Power Meter Reader</h1>

        <p>
          Upload up to 6 floor images.
          One image per floor contains
          all 8 opened meter panels.
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

      <h2>Sign in</h2>

      <p class="muted">
        Use a Supabase Auth email/password account.
      </p>

      <input
        id="email"
        type="email"
        placeholder="Email"
      />

      <input
        id="password"
        type="password"
        placeholder="Password"
      />

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

      <div
        id="authMsg"
        class="message"
      ></div>

    </section>

    <section
      id="appCard"
      class="hidden"
    >
`;
  <div class="card">

    <div class="section-head">

      <div>

        <h2>
          Upload up to 6 floors
        </h2>

        <p class="muted">
          For each floor, upload one clear image.
          Images are processed temporarily
          and are not saved.
        </p>

        <label>
          Reading date

          <input
            id="readingDate"
            type="date"
          />

        </label>

      </div>

      <button id="processBtn">
        🔎 Process all uploaded floors
      </button>

    </div>

    <div
      id="slots"
      class="grid"
    ></div>

  </div>


  <div class="card">

    <div class="section-head">

      <div>

        <h2>
          Results
        </h2>

        <p class="muted">
          Positions 1–4 = West.
          Positions 5–8 = East.
        </p>

      </div>

      <button
        id="refreshBtn"
        class="secondary"
      >
        Refresh
      </button>

    </div>

    <div id="status"></div>

    <div id="results"></div>

  </div>

</section>

</main>
`;

document.querySelector(
  '#readingDate'
).value = today;


const slotsEl =
  document.querySelector('#slots');


function getFloorName(number) {

  const suffix =
    number === 1
      ? 'st'
      : number === 2
        ? 'nd'
        : number === 3
          ? 'rd'
          : 'th';

  return `${number}${suffix} Floor`;
}


for (let i = 0; i < 6; i++) {

  const floorNumber = i + 1;

  slotsEl.insertAdjacentHTML(
    'beforeend',
    `
      <div class="floor-slot">

        <h3>
          Floor ${floorNumber}
        </h3>

        <input
          id="floor-${i}"
          class="floor-name"
          value="${getFloorName(floorNumber)}"
        />

        <input
          id="file-${i}"
          type="file"
          accept="image/*"
        />

        <div
          id="preview-${i}"
          class="preview muted"
        >
          No image selected
        </div>

      </div>
    `
  );

  document
    .querySelector(`#file-${i}`)
    .addEventListener(
      'change',
      (event) => {

        selectedFiles[i] =
          event.target.files[0] || null;

        const preview =
          document.querySelector(
            `#preview-${i}`
          );

        if (selectedFiles[i]) {

          const imageUrl =
            URL.createObjectURL(
              selectedFiles[i]
            );

          preview.innerHTML = `
            <img
              src="${imageUrl}"
              alt="Floor preview"
            />
          `;

        } else {

          preview.textContent =
            'No image selected';

        }

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


function showMessage(
  text,
  type = ''
) {

  authMsg.textContent = text;

  authMsg.className =
    `message ${type}`;
}


async function refreshSession() {

  const {
    data
  } =
    await supabase.auth.getSession();

  const loggedIn =
    !!data.session;

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

    loadRecentReadings();

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

      showMessage(
        error.message,
        'error'
      );

    } else {

      showMessage(
        'Signed in.',
        'ok'
      );

    }

    refreshSession();
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

    if (error) {

      showMessage(
        error.message,
        'error'
      );

    } else {

      showMessage(
        'Account created. Check your email if confirmation is enabled.',
        'ok'
      );

    }
  };


logoutBtn.onclick =
  async () => {

    await supabase.auth.signOut();

    refreshSession();

  };


/*
  IMPORTANT:
  This function fixes the
  "fileToDataUrl is not defined"
  error.
*/

function fileToDataUrl(file) {

  return new Promise(
    (resolve, reject) => {

      const reader =
        new FileReader();

      reader.onload =
        () => {

          resolve(
            reader.result
          );

        };

      reader.onerror =
        () => {

          reject(
            new Error(
              'Could not read image file.'
            )
          );

        };

      reader.readAsDataURL(file);

    }
  );
}


/*
  PROCESS BUTTON
*/

document
  .querySelector('#processBtn')
  .onclick =
  async () => {

    const floors = [];

    for (
      let i = 0;
      i < 6;
      i++
    ) {

      const file =
        selectedFiles[i];

      if (!file) continue;

      const name =
        document
          .querySelector(
            `#floor-${i}`
          )
          .value
          .trim();

      if (!name) {

        alert(
          `Please enter a floor name for slot ${i + 1}.`
        );

        return;
      }

      floors.push({
        floorName: name,
        file: file,
        slot: i + 1
      });
    }

    if (!floors.length) {

      alert(
        'Upload at least one floor image.'
      );

      return;
    }

    const status =
      document.querySelector(
        '#status'
      );

    status.innerHTML = `
      <div class="message">
        Uploading ${floors.length}
        floor image(s) and processing...
      </div>
    `;

    document
      .querySelector(
        '#processBtn'
      )
      .disabled = true;
          try {

      const user =
        (
          await supabase.auth
            .getUser()
        ).data.user;

      if (!user) {

        throw new Error(
          'Please sign in again.'
        );

      }

      const uploads = [];

      for (
        const floor of floors
      ) {

        const imageBase64 =
          await fileToDataUrl(
            floor.file
          );

        uploads.push({

          floorName:
            floor.floorName,

          imageDataUrl:
            imageBase64,

          slot:
            floor.slot

        });
      }


      const readingDate =
        document
          .querySelector(
            '#readingDate'
          )
          .value;


      const {
        data: fnData,
        error: fnError
      } =
        await supabase.functions.invoke(
          'process-floor-images',
          {
            body: {
              floors: uploads,
              readingDate
            }
          }
        );


      if (fnError) {

        throw fnError;

      }


      latestReadings =
        fnData.readings || [];


      renderResults(
        latestReadings
      );


      status.innerHTML = `
        <div class="message ok">
          Finished ${uploads.length}
          floor(s).
          Review any rows marked REVIEW.
        </div>
      `;


    } catch (error) {

      console.error(error);

      status.innerHTML = `
        <div class="message error">
          ${escapeHtml(
            error?.message ||
            String(error)
          )}
        </div>
      `;


    } finally {

      document
        .querySelector(
          '#processBtn'
        )
        .disabled = false;

    }

  };


document
  .querySelector(
    '#refreshBtn'
  )
  .onclick =
  loadRecentReadings;


document
  .querySelector(
    '#readingDate'
  )
  .addEventListener(
    'change',
    loadRecentReadings
  );


async function loadRecentReadings() {

  const selectedDate =
    document
      .querySelector(
        '#readingDate'
      )
      ?.value ||
    today;


  const {
    data,
    error
  } =
    await supabase
      .from(
        'meter_readings'
      )
      .select(
        'reading_date,floor_name,side,meter_type,kwh,kvah,status,created_at,position'
      )
      .eq(
        'reading_date',
        selectedDate
      )
      .order(
        'floor_name',
        {
          ascending: true
        }
      )
      .order(
        'position',
        {
          ascending: true
        }
      )
      .limit(500);


  if (error) {

    document
      .querySelector(
        '#results'
      )
      .innerHTML = `
        <div class="message error">
          ${escapeHtml(
            error.message
          )}
        </div>
      `;

    return;
  }


  latestReadings =
    data || [];


  renderResults(
    latestReadings
  );
}
function renderResults(rows) {

  if (!rows.length) {

    document
      .querySelector(
        '#results'
      )
      .innerHTML =
      '<p class="muted">No readings for this date yet.</p>';

    return;
  }


  const selectedDate =
    document
      .querySelector(
        '#readingDate'
      )
      ?.value ||
    today;


  const grouped = {};


  for (
    const row of rows
  ) {

    grouped[
      row.floor_name
    ] ??= [];

    grouped[
      row.floor_name
    ].push(row);

  }


  let html = `
    <div class="date-heading">
      Reading Date:
      <strong>
        ${escapeHtml(
          selectedDate
        )}
      </strong>
    </div>
  `;


  for (
    const [floor, floorRows]
    of Object.entries(grouped)
  ) {

    html += `
      <section class="floor-result">

        <h2>
          ${escapeHtml(floor)}
        </h2>

        <h3>
          kWh Readings
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
      const meter of METERS
    ) {

      const west =
        floorRows.find(
          row =>
            row.meter_type === meter &&
            row.side === 'West'
        );


      const east =
        floorRows.find(
          row =>
            row.meter_type === meter &&
            row.side === 'East'
        );


      html += `
        <tr>

          <td>
            ${escapeHtml(meter)}
          </td>

          <td>
            ${escapeHtml(
              west?.kwh ?? ''
            )}
          </td>

          <td>
            ${escapeHtml(
              east?.kwh ?? ''
            )}
          </td>

        </tr>
      `;
    }


    html += `
          </tbody>

        </table>

        <button
          class="secondary"
          data-copy="${encodeURIComponent(
            makeValuesOnly(
              floorRows,
              'kwh'
            )
          )}"
        >
          📋 Copy kWh only
        </button>


        <h3 class="kvah-title">
          kVAh Readings
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
      const meter of METERS
    ) {

      const west =
        floorRows.find(
          row =>
            row.meter_type === meter &&
            row.side === 'West'
        );


      const east =
        floorRows.find(
          row =>
            row.meter_type === meter &&
            row.side === 'East'
        );


      html += `
        <tr>

          <td>
            ${escapeHtml(meter)}
          </td>

          <td>
            ${escapeHtml(
              west?.kvah ?? ''
            )}
          </td>

          <td>
            ${escapeHtml(
              east?.kvah ?? ''
            )}
          </td>

        </tr>
      `;
    }


    html += `
          </tbody>

        </table>

        <button
          class="secondary"
          data-copy="${encodeURIComponent(
            makeValuesOnly(
              floorRows,
              'kvah'
            )
          )}"
        >
          📋 Copy kVAh only
        </button>
    `;


    const reviewCount =
      floorRows.filter(
        row =>
          row.status === 'REVIEW'
      ).length;


    if (reviewCount) {

      html += `
        <div class="message error">
          ${reviewCount}
          reading row(s) need review.
        </div>
      `;

    }


    html += `
      </section>
    `;
  }


  document
    .querySelector(
      '#results'
    )
    .innerHTML = html;


  document
    .querySelectorAll(
      '[data-copy]'
    )
    .forEach(
      button => {

        button.onclick =
          async () => {

            const text =
              decodeURIComponent(
                button.dataset.copy
              );


            try {

              await navigator
                .clipboard
                .writeText(text);

            } catch {

              const textarea =
                document.createElement(
                  'textarea'
                );

              textarea.value =
                text;

              textarea.style.position =
                'fixed';

              textarea.style.opacity =
                '0';

              document.body.appendChild(
                textarea
              );

              textarea.select();

              document.execCommand(
                'copy'
              );

              textarea.remove();

            }


            const oldText =
              button.textContent;

            button.textContent =
              '✓ Copied';


            setTimeout(
              () => {

                button.textContent =
                  oldText;

              },
              1200
            );

          };

      }
    );
}
/*
  Creates the exact text
  that will be copied to Excel.

  IMPORTANT:

  It copies ONLY the readings.

  It does NOT copy:

  - date
  - floor name
  - meter name
  - kWh label
  - kVAh label

  Four rows are copied.

  Each row contains:

  West value    East value

  Excel receives
  the tab character as
  a separate cell.
*/

function makeValuesOnly(
  rows,
  field
) {

  const lines = [];


  for (
    const meter of METERS
  ) {

    const west =
      rows.find(
        row =>
          row.meter_type === meter &&
          row.side === 'West'
      );


    const east =
      rows.find(
        row =>
          row.meter_type === meter &&
          row.side === 'East'
      );


    lines.push(
      `${west?.[field] ?? ''}\t${east?.[field] ?? ''}`
    );

  }


  return lines.join('\n');
}


/*
  Prevent HTML values from
  breaking the page.
*/

function escapeHtml(value) {

  return String(value)
    .replace(
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


/*
  Start the application.
*/

refreshSession();
