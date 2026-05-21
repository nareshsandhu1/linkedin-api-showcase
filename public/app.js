/**
 * Live API "Try it" handler.
 * Renders an inline editor (URL + JSON body) prefilled with example values
 * so users can tweak required params before sending the request to /api/call.
 *
 * If the button carries a `data-param-schema` JSON blob, a structured form
 * is rendered instead — with selects, date pickers, checkboxes, and URN
 * lists — and the URL is built from the selected values on submit.
 */
(function () {
  const PLACEHOLDER_RE = /\{([a-zA-Z][\w]*)\}/g;

  function escape(s) {
    return String(s)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;');
  }

  // -- Schema-driven form (e.g. Ad Analytics) -------------------------------

  function parseUrnList(text) {
    return String(text || '')
      .split(/[\s,]+/)
      .map((s) => s.trim())
      .filter(Boolean);
  }

  function fmtDateTuple(yyyyMmDd) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(yyyyMmDd || '').trim());
    if (!m) return null;
    return `(year:${Number(m[1])},month:${Number(m[2])},day:${Number(m[3])})`;
  }

  function renderSchemaField(field) {
    const id = `f_${field.key.replace(/[^a-zA-Z0-9]/g, '_')}`;
    const hint = field.hint
      ? `<p class="muted try-hint">${escape(field.hint)}</p>`
      : '';
    if (field.type === 'select') {
      const opts = field.options
        .map(
          (o) =>
            `<option value="${escape(o)}"${
              o === field.default ? ' selected' : ''
            }>${escape(o)}</option>`
        )
        .join('');
      return `
        <label class="try-label" for="${id}">${escape(field.label)}
          <select id="${id}" data-key="${escape(field.key)}" data-ftype="select">${opts}</select>
        </label>${hint}`;
    }
    if (field.type === 'dateRange') {
      const d = field.defaults || {};
      return `
        <fieldset class="try-fieldset" data-key="${escape(field.key)}" data-ftype="dateRange">
          <legend>${escape(field.label)}</legend>
          <label class="try-label-inline">Start
            <input type="date" data-role="start" value="${escape(d.start || '')}" />
          </label>
          <label class="try-label-inline">End
            <input type="date" data-role="end" value="${escape(d.end || '')}" />
          </label>
        </fieldset>${hint}`;
    }
    if (field.type === 'urnList') {
      return `
        <label class="try-label" for="${id}">${escape(field.label)}
          <textarea id="${id}" data-key="${escape(field.key)}" data-ftype="urnList"
                    rows="2" spellcheck="false"
                    placeholder="urn:li:sponsoredAccount:506336348">${escape(field.default || '')}</textarea>
        </label>${hint}`;
    }
    if (field.type === 'checkboxes') {
      const defaults = new Set(field.defaults || []);
      const boxes = field.options
        .map(
          (o) => `
            <label class="try-checkbox">
              <input type="checkbox" value="${escape(o)}"${
                defaults.has(o) ? ' checked' : ''
              } />
              <span>${escape(o)}</span>
            </label>`
        )
        .join('');
      return `
        <fieldset class="try-fieldset" data-key="${escape(field.key)}" data-ftype="checkboxes">
          <legend>${escape(field.label)}</legend>
          <div class="try-checkbox-grid">${boxes}</div>
        </fieldset>${hint}`;
    }
    // text fallback
    return `
      <label class="try-label" for="${id}">${escape(field.label)}
        <input id="${id}" data-key="${escape(field.key)}" data-ftype="text"
               type="text" value="${escape(field.default || '')}" spellcheck="false" />
      </label>${hint}`;
  }

  function buildUrlFromSchema(form, schema) {
    const params = [];
    const errors = [];

    function addParam(key, value) {
      if (value === '' || value == null) return;
      params.push(`${encodeURIComponent(key)}=${value}`);
    }

    schema.fields.forEach((field) => {
      const wrap = form.querySelector(
        `[data-key="${field.key}"][data-ftype]`
      );
      if (!wrap) return;

      if (field.type === 'select') {
        addParam(field.key, encodeURIComponent(wrap.value));
      } else if (field.type === 'dateRange') {
        const start = wrap.querySelector('[data-role="start"]').value;
        const end = wrap.querySelector('[data-role="end"]').value;
        const sTuple = fmtDateTuple(start);
        const eTuple = fmtDateTuple(end);
        if (!sTuple || !eTuple) {
          if (field.required) errors.push(`${field.label} is required`);
          return;
        }
        // dateRange=(start:(year:Y,month:M,day:D),end:(year:Y,month:M,day:D))
        params.push(`dateRange=(start:${sTuple},end:${eTuple})`);
      } else if (field.type === 'urnList') {
        const urns = parseUrnList(wrap.value);
        if (urns.length === 0) return;
        const list = urns.map((u) => encodeURIComponent(u)).join(',');
        params.push(`${encodeURIComponent(field.key)}=List(${list})`);
      } else if (field.type === 'checkboxes') {
        const checked = Array.from(
          wrap.querySelectorAll('input[type="checkbox"]:checked')
        ).map((i) => i.value);
        if (checked.length === 0) {
          if (field.required) errors.push(`${field.label} requires at least one selection`);
          return;
        }
        params.push(`${encodeURIComponent(field.key)}=${checked.join(',')}`);
      } else {
        addParam(field.key, encodeURIComponent(wrap.value));
      }
    });

    return { url: `${schema.baseUrl}?${params.join('&')}`, errors };
  }

  function renderSchemaForm(target, method, schema) {
    const fieldsHtml = schema.fields.map(renderSchemaField).join('');
    target.innerHTML = `
      <form class="try-form try-form-schema">
        ${schema.description ? `<p class="muted">${escape(schema.description)}</p>` : ''}
        ${fieldsHtml}
        <label class="try-label">Built request URL (read-only)
          <input type="text" class="try-url" readonly spellcheck="false" />
        </label>
        <div class="try-actions">
          <button type="submit" class="btn-try">Send ${escape(method)} request</button>
          <button type="button" class="btn-cancel">Cancel</button>
        </div>
      </form>
      <div class="try-output"></div>
    `;

    const form = target.querySelector('.try-form');
    const output = target.querySelector('.try-output');
    const urlInput = form.querySelector('.try-url');

    function refreshUrl() {
      const { url } = buildUrlFromSchema(form, schema);
      urlInput.value = url;
    }
    refreshUrl();
    form.addEventListener('input', refreshUrl);
    form.addEventListener('change', refreshUrl);

    target.querySelector('.btn-cancel').addEventListener('click', () => {
      target.hidden = true;
      target.innerHTML = '';
    });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const submitBtn = form.querySelector('button[type="submit"]');
      const built = buildUrlFromSchema(form, schema);
      if (built.errors.length) {
        output.innerHTML = `<p class="error">${escape(built.errors.join('; '))}</p>`;
        return;
      }

      submitBtn.disabled = true;
      output.innerHTML = '<p class="muted">Calling…</p>';
      try {
        const res = await fetch('/api/call', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ method, url: built.url }),
        });
        const data = await res.json();
        renderApiResult(output, res, data);
      } catch (err) {
        output.innerHTML = `<p class="error">Request failed: ${escape(err.message)}</p>`;
      } finally {
        submitBtn.disabled = false;
      }
    });
  }

  // -- Generic free-form editor --------------------------------------------

  function renderGenericForm(target, method, urlTemplate, sampleBody) {
    const hasBody = method !== 'GET';
    target.innerHTML = `
      <form class="try-form">
        <label class="try-label">Request URL
          <input type="text" class="try-url" value="${escape(urlTemplate)}" spellcheck="false" />
        </label>
        <p class="muted try-hint">
          Replace placeholders like <code>{urn}</code> with real values
          (e.g. <code>urn:li:organization:2414183</code>).
        </p>
        ${
          hasBody
            ? `<label class="try-label">Request body (JSON)
                 <textarea class="try-body" rows="10" spellcheck="false">${escape(sampleBody)}</textarea>
               </label>`
            : ''
        }
        <div class="try-actions">
          <button type="submit" class="btn-try">Send ${escape(method)} request</button>
          <button type="button" class="btn-cancel">Cancel</button>
        </div>
      </form>
      <div class="try-output"></div>
    `;

    const form = target.querySelector('.try-form');
    const output = target.querySelector('.try-output');

    target.querySelector('.btn-cancel').addEventListener('click', () => {
      target.hidden = true;
      target.innerHTML = '';
    });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const url = form.querySelector('.try-url').value.trim();
      const bodyEl = form.querySelector('.try-body');
      const submitBtn = form.querySelector('button[type="submit"]');

      if (PLACEHOLDER_RE.test(url)) {
        PLACEHOLDER_RE.lastIndex = 0;
        const names = [...url.matchAll(PLACEHOLDER_RE)].map((m) => m[1]).join(', ');
        output.innerHTML = `<p class="error">URL still contains placeholder(s): {${escape(names)}}. Replace them with real values.</p>`;
        return;
      }

      const payload = { method, url };
      if (hasBody && bodyEl && bodyEl.value.trim()) {
        try {
          payload.body = JSON.parse(bodyEl.value);
        } catch (err) {
          output.innerHTML = `<p class="error">Invalid JSON body: ${escape(err.message)}</p>`;
          return;
        }
      }

      submitBtn.disabled = true;
      output.innerHTML = '<p class="muted">Calling…</p>';

      try {
        const res = await fetch('/api/call', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        renderApiResult(output, res, data);
      } catch (err) {
        output.innerHTML = `<p class="error">Request failed: ${escape(err.message)}</p>`;
      } finally {
        submitBtn.disabled = false;
      }
    });
  }

  // -- Shared result rendering ---------------------------------------------

  function renderApiResult(output, res, data) {
    if (data.error === 'needs_reauth') {
      output.innerHTML =
        '<p class="warn">Your access token has expired. <a href="/auth/linkedin">Re-authorize with LinkedIn</a>.</p>';
      return;
    }
    if (!res.ok) {
      output.innerHTML = `<pre class="error">${escape(JSON.stringify(data, null, 2))}</pre>`;
      return;
    }
    const r = data.response;
    const okStatus = r.status >= 200 && r.status < 300;
    const statusClass = okStatus ? 'http-get' : 'http-delete';
    output.innerHTML = `
      <div class="api-result-meta">
        <span class="http-method ${statusClass}">${r.status}</span>
        <span class="ep-label">${escape(r.statusText || '')}</span>
        <span class="ep-label">${escape(data.request.method)} <code>${escape(data.request.url)}</code></span>
      </div>
      <pre>${escape(typeof r.body === 'string' ? r.body : JSON.stringify(r.body, null, 2))}</pre>
    `;
  }

  // -- Dispatcher -----------------------------------------------------------

  function openEditor(button) {
    const method = button.dataset.method;
    const urlTemplate = button.dataset.url;
    const sampleBody = button.dataset.sampleBody || '';
    const target = document.getElementById(button.dataset.target);
    target.hidden = false;

    const schemaJson = button.dataset.paramSchema;
    if (schemaJson) {
      try {
        const schema = JSON.parse(schemaJson);
        renderSchemaForm(target, method, schema);
        return;
      } catch (err) {
        // fall through to generic editor on parse error
      }
    }
    renderGenericForm(target, method, urlTemplate, sampleBody);
  }

  document.addEventListener('click', (e) => {
    const btn = e.target.closest('.btn-try');
    if (!btn || btn.type === 'submit') return;
    openEditor(btn);
  });
})();
