import { createClient } from '@supabase/supabase-js';
import './style.css';

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
);

const METERS = ['Main', 'Raw', 'Lighting', 'HVAC'];

let files = Array(6).fill(null);

document.querySelector('#app').innerHTML = `
<main class="shell">

<header>
<h1>⚡ Power Meter Reader</h1>
<p>Upload up to 6 floor images. One image per floor contains all 8 meter panels.</p>
<button id="logout" class="secondary">Log out</button>
</header>

<section id="login" class="card">
<h2>Sign in</h2>

<input id="email" type="email" placeholder="Email">
<input id="password" type="password" placeholder="Password">

<button id="signin">Sign in</button>
<button id="signup" class="secondary">Create account</button>

<p id="loginMsg"></p>
</section>

<section id="appPage" class="hidden">

<div class="card">

<h2>Upload floors</h2>

<label>
Reading date
<input id="date" type="date">
</label>

<div id="floors"></div>

<button id="process">
🔎 Process all uploaded floors
</button>

<p id="status"></p>

</div>

<div class="card">

<h2>Results</h2>

<div id="results"></div>

</div>

</section>

</main>
`;

document.querySelector('#date').value =
  new Date().toISOString().slice(0, 10);

const floors = document.querySelector('#floors');

for (let i = 0; i < 6; i++) {

  const n = i + 1;

  floors.insertAdjacentHTML(
    'beforeend',
    `
    <div class="floor-slot">

      <h3>Floor ${n}</h3>

      <input
        id="name${i}"
        value="${n === 1 ? '1st' : n === 2 ? '2nd' : n === 3 ? '3rd' : n + 'th'} Floor"
      >

      <input
        id="file${i}"
        type="file"
        accept="image/*"
      >

    </div>
    `
  );

  document
    .querySelector(`#file${i}`)
    .addEventListener(
      'change',
      e => {
        files[i] =
          e.target.files[0] || null;
      }
    );
  const loginBox =
  document.querySelector('#login');

const appPage =
  document.querySelector('#appPage');

const loginMsg =
  document.querySelector('#loginMsg');


async function showPage() {

  const { data } =
    await supabase.auth.getSession();

  const loggedIn =
    !!data.session;

  loginBox.classList.toggle(
    'hidden',
    loggedIn
  );

  appPage.classList.toggle(
    'hidden',
    !loggedIn
  );
}


document
  .querySelector('#signin')
  .onclick = async () => {

    const email =
      document.querySelector(
        '#email'
      ).value.trim();

    const password =
      document.querySelector(
        '#password'
      ).value;

    const { error } =
      await supabase.auth
        .signInWithPassword({
          email,
          password
        });

    if (error) {

      loginMsg.textContent =
        error.message;

      return;
    }

    loginMsg.textContent =
      'Signed in successfully.';

    showPage();
  };


document
  .querySelector('#signup')
  .onclick = async () => {

    const email =
      document.querySelector(
        '#email'
      ).value.trim();

    const password =
      document.querySelector(
        '#password'
      ).value;

    const { error } =
      await supabase.auth.signUp({
        email,
        password
      });

    loginMsg.textContent =
      error
        ? error.message
        : 'Account created. Check your email if confirmation is required.';
  };


document
  .querySelector('#logout')
  .onclick = async () => {

    await supabase.auth.signOut();

    showPage();
  };


function fileToDataUrl(file) {

  return new Promise(
    (resolve, reject) => {

      const reader =
        new FileReader();

      reader.onload =
        () => resolve(
          reader.result
        );

      reader.onerror =
        () => reject(
          new Error(
            'Could not read image.'
          )
        );

      reader.readAsDataURL(file);
    }
  );
}


document
  .querySelector('#process')
  .onclick = async () => {

    const uploaded = [];

    for (
      let i = 0;
      i < 6;
      i++
    ) {

      if (!files[i]) continue;

      const floorName =
        document.querySelector(
          `#name${i}`
        ).value.trim();

      const imageDataUrl =
        await fileToDataUrl(
          files[i]
        );

      uploaded.push({
        floorName,
        imageDataUrl
      });
    }


    if (!uploaded.length) {

      alert(
        'Please upload at least one floor image.'
      );

      return;
    }


    const date =
      document.querySelector(
        '#date'
      ).value;


    const status =
      document.querySelector(
        '#status'
      );

    status.textContent =
      'Processing images...';


    document.querySelector(
      '#process'
    ).disabled = true;


    try {

      const {
        data,
        error
      } =
        await supabase.functions.invoke(
          'process-floor-images',
          {
            body: {
              floors: uploaded,
              readingDate: date
            }
          }
        );


      if (error) {
        throw error;
      }


      render(
        data.readings || []
      );


      status.textContent =
        'Processing complete.';


    } catch (error) {

      console.error(error);

      status.textContent =
        'Error: ' +
        (error.message ||
          String(error));

    } finally {

      document.querySelector(
        '#process'
      ).disabled = false;

    }
  };


function render(rows) {

  const results =
    document.querySelector(
      '#results'
    );


  if (!rows.length) {

    results.innerHTML =
      '<p>No readings found.</p>';

    return;
  }


  const floors = {};


  rows.forEach(row => {

    if (!floors[row.floor_name]) {
      floors[row.floor_name] = [];
    }

    floors[row.floor_name].push(
      row
    );
  });


  let html = '';


  for (
    const floor in floors
  ) {

    const data =
      floors[floor];


    html += `
      <section class="floor-result">

        <h2>
          ${escapeHtml(floor)}
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


    METERS.forEach(
      meter => {

        const west =
          data.find(
            r =>
              r.meter_type === meter &&
              r.side === 'West'
          );

        const east =
          data.find(
            r =>
              r.meter_type === meter &&
              r.side === 'East'
          );


        html += `
          <tr>

            <td>
              ${meter}
            </td>

            <td>
              ${west?.kwh || ''}
            </td>

            <td>
              ${east?.kwh || ''}
            </td>

          </tr>
        `;
      }
    );


    html += `
          </tbody>

        </table>

        <button
          class="secondary copy"
          data-value="${encodeURIComponent(
            makeCopy(data, 'kwh')
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


    METERS.forEach(
      meter => {

        const west =
          data.find(
            r =>
              r.meter_type === meter &&
              r.side === 'West'
          );

        const east =
          data.find(
            r =>
              r.meter_type === meter &&
              r.side === 'East'
          );


        html += `
          <tr>

            <td>
              ${meter}
            </td>

            <td>
              ${west?.kvah || ''}
            </td>

            <td>
              ${east?.kvah || ''}
            </td>

          </tr>
        `;
      }
    );


    html += `
          </tbody>

        </table>

        <button
          class="secondary copy"
          data-value="${encodeURIComponent(
            makeCopy(data, 'kvah')
          )}"
        >
          Copy kVAh only
        </button>

      </section>
    `;
  }


  results.innerHTML =
    html;


  document
    .querySelectorAll(
      '.copy'
    )
    .forEach(
      button => {

        button.onclick =
          async () => {

            const value =
              decodeURIComponent(
                button.dataset.value
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

              box.value =
                value;

              document.body.appendChild(
                box
              );

              box.select();

              document.execCommand(
                'copy'
              );

              box.remove();
            }


            button.textContent =
              '✓ Copied';


            setTimeout(
              () => {
                button.textContent =
                  button.dataset.type ===
                  'kvah'
                    ? 'Copy kVAh only'
                    : 'Copy kWh only';
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
      }
    )
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


showPage();
}
