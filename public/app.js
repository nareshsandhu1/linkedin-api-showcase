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

  async function sha256Hex(text) {
    if (!(window.crypto && window.crypto.subtle)) {
      throw new Error('SHA-256 hashing requires a secure (https) context');
    }
    const data = new TextEncoder().encode(text);
    const digest = await window.crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }

  function renderSchemaField(field) {
    if (field.type === 'heading') {
      return `<h4 class="try-section">${escape(field.label)}</h4>`;
    }
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
    if (field.type === 'number') {
      const minAttr = field.min != null ? ` min="${field.min}"` : '';
      const maxAttr = field.max != null ? ` max="${field.max}"` : '';
      return `
        <label class="try-label" for="${id}">${escape(field.label)}
          <input id="${id}" data-key="${escape(field.key)}" data-ftype="number"
                 type="number"${minAttr}${maxAttr}
                 value="${escape(field.default != null ? field.default : '')}" />
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
    const facetClauses = [];
    // Composite Rest.li params (e.g. filterCriteria=(lookbackWindow:...,campaign:...)).
    // Keyed by group name; each entry is an array of `key:value` clause strings.
    const groups = {};

    function addParam(key, value) {
      if (value === '' || value == null) return;
      params.push(`${encodeURIComponent(key)}=${value}`);
    }

    schema.fields.forEach((field) => {
      const wrap = form.querySelector(
        `[data-key="${field.key}"][data-ftype]`
      );
      if (!wrap) return;

      // Collect selected values for this field (for facet aggregation).
      let selected = [];
      if (field.type === 'urnList') {
        selected = parseUrnList(wrap.value);
      } else if (field.type === 'checkboxes') {
        selected = Array.from(
          wrap.querySelectorAll('input[type="checkbox"]:checked')
        ).map((i) => i.value);
      }

      // Facet fields contribute to a single `targetingCriteria` param instead
      // of producing their own query parameter.
      if (field.facetUrn) {
        if (selected.length === 0) {
          if (field.required) {
            errors.push(`${field.label} requires at least one selection`);
          }
          return;
        }
        facetClauses.push(
          `(or:(${field.facetUrn}:List(${selected.join(',')})))`
        );
        return;
      }

      // Group fields are assembled into a single composite param such as
      // `filterCriteria=(lookbackWindow:LAST_90_DAYS,adSegments:List(...))`.
      if (field.group) {
        let clause = null;
        if (field.type === 'urnList') {
          if (selected.length === 0) {
            if (field.required) errors.push(`${field.label} is required`);
            return;
          }
          const list = selected.map((u) => encodeURIComponent(u)).join(',');
          clause = `${field.key}:List(${list})`;
        } else {
          const raw = String(wrap.value || '').trim();
          if (raw === '') {
            if (field.required) errors.push(`${field.label} is required`);
            return;
          }
          clause = `${field.key}:${encodeURIComponent(raw)}`;
        }
        (groups[field.group] = groups[field.group] || []).push(clause);
        return;
      }

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
        params.push(`dateRange=(start:${sTuple},end:${eTuple})`);
      } else if (field.type === 'urnList') {
        if (selected.length === 0) {
          if (field.required) errors.push(`${field.label} is required`);
          return;
        }
        const list = selected.map((u) => encodeURIComponent(u)).join(',');
        params.push(`${encodeURIComponent(field.key)}=List(${list})`);
      } else if (field.type === 'checkboxes') {
        if (selected.length === 0) {
          if (field.required) {
            errors.push(`${field.label} requires at least one selection`);
          }
          return;
        }
        params.push(`${encodeURIComponent(field.key)}=${selected.join(',')}`);
      } else {
        addParam(field.key, encodeURIComponent(wrap.value));
      }
    });

    if (facetClauses.length) {
      params.push(
        `targetingCriteria=(include:(and:List(${facetClauses.join(',')})))`
      );
    }

    Object.keys(groups).forEach((name) => {
      const clauses = groups[name];
      if (clauses.length) {
        params.push(`${encodeURIComponent(name)}=(${clauses.join(',')})`);
      }
    });

    return { url: `${schema.baseUrl}?${params.join('&')}`, errors };
  }

  // ---- POST body builders ----------------------------------------------

  function readFieldSelections(form, field) {
    const wrap = form.querySelector(
      `[data-key="${field.key}"][data-ftype]`
    );
    if (!wrap) return null;
    if (field.type === 'urnList') return parseUrnList(wrap.value);
    if (field.type === 'checkboxes') {
      return Array.from(
        wrap.querySelectorAll('input[type="checkbox"]:checked')
      ).map((i) => i.value);
    }
    if (field.type === 'number') {
      const v = wrap.value === '' ? null : Number(wrap.value);
      return Number.isFinite(v) ? v : null;
    }
    return wrap.value;
  }

  function buildAudienceInsightsBody(form, schema) {
    const errors = [];
    const request = {
      requestMetaData: {},
      targetingCriteria: { include: { and: [] } },
    };
    const excludeOr = {};

    schema.fields.forEach((field) => {
      const value = readFieldSelections(form, field);

      // Facet fields → targetingCriteria.include.and (or .exclude.or).
      if (field.facetUrn) {
        const list = Array.isArray(value) ? value : [];
        if (list.length === 0) {
          if (field.required) errors.push(`${field.label} requires a value`);
          return;
        }
        request.targetingCriteria.include.and.push({
          or: { [field.facetUrn]: list },
        });
        return;
      }

      // Top-level / metadata fields.
      if (field.location === 'metadata') {
        if (value === null || value === '' || value === undefined) {
          if (field.required) errors.push(`${field.label} is required`);
          return;
        }
        request.requestMetaData[field.key] = value;
        return;
      }
      if (value === null || value === '' || value === undefined) {
        if (field.required) errors.push(`${field.label} is required`);
        return;
      }
      request[field.key] = value;
    });

    if (Object.keys(excludeOr).length) {
      request.targetingCriteria.exclude = { or: excludeOr };
    }

    return { body: { request }, errors };
  }

  function renderSchemaForm(target, method, schema) {
    const isPost =
      (schema.httpMethod || method).toUpperCase() !== 'GET' && schema.bodyShape;
    const httpMethod = (schema.httpMethod || method).toUpperCase();
    const fieldsHtml = schema.fields.map(renderSchemaField).join('');
    target.innerHTML = `
      <form class="try-form try-form-schema">
        ${schema.description ? `<p class="muted">${escape(schema.description)}</p>` : ''}
        ${fieldsHtml}
        <label class="try-label">${
          isPost ? 'Built request body (read-only preview)' : 'Built request URL (read-only)'
        }
          ${
            isPost
              ? '<textarea class="try-body try-body-preview" rows="10" readonly spellcheck="false"></textarea>'
              : '<input type="text" class="try-url" readonly spellcheck="false" />'
          }
        </label>
        ${
          isPost
            ? `<p class="muted try-hint">POST <code>${escape(schema.baseUrl)}</code></p>`
            : ''
        }
        <div class="try-actions">
          <button type="submit" class="btn-try">Send ${escape(httpMethod)} request</button>
          <button type="button" class="btn-cancel">Cancel</button>
        </div>
      </form>
      <div class="try-output"></div>
    `;

    const form = target.querySelector('.try-form');
    const output = target.querySelector('.try-output');
    const urlInput = form.querySelector('.try-url');
    const bodyPreview = form.querySelector('.try-body-preview');

    function refresh() {
      if (isPost) {
        Promise.resolve(buildSchemaPayload(form, schema)).then((built) => {
          bodyPreview.value = JSON.stringify(built.body, null, 2);
        });
      } else {
        const { url } = buildUrlFromSchema(form, schema);
        urlInput.value = url;
      }
    }
    refresh();
    form.addEventListener('input', refresh);
    form.addEventListener('change', refresh);

    target.querySelector('.btn-cancel').addEventListener('click', () => {
      target.hidden = true;
      target.innerHTML = '';
    });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const submitBtn = form.querySelector('button[type="submit"]');

      let payload;
      if (isPost) {
        const built = await buildSchemaPayload(form, schema);
        if (built.errors.length) {
          output.innerHTML = `<p class="error">${escape(built.errors.join('; '))}</p>`;
          return;
        }
        payload = { method: httpMethod, url: schema.baseUrl, body: built.body };
      } else {
        const built = buildUrlFromSchema(form, schema);
        if (built.errors.length) {
          output.innerHTML = `<p class="error">${escape(built.errors.join('; '))}</p>`;
          return;
        }
        payload = { method: httpMethod, url: built.url };
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

  function buildSchemaPayload(form, schema) {
    if (schema.bodyShape === 'audienceInsights') {
      return buildAudienceInsightsBody(form, schema);
    }
    if (schema.bodyShape === 'conversionEvent') {
      return buildConversionEventBody(form, schema);
    }
    return { body: {}, errors: ['Unknown bodyShape: ' + schema.bodyShape] };
  }

  async function buildConversionEventBody(form) {
    const errors = [];
    function val(key) {
      const el = form.querySelector(`[data-key="${key}"][data-ftype]`);
      return el ? String(el.value || '').trim() : '';
    }

    const body = {};

    // conversion rule (accept a bare ID or a full URN)
    let conversion = val('conversion');
    if (!conversion) {
      errors.push('Conversion rule is required');
    } else if (!conversion.startsWith('urn:')) {
      conversion = `urn:lla:llaPartnerConversion:${conversion}`;
    }
    body.conversion = conversion;

    // conversionHappenedAt (epoch ms; blank => now)
    const tsRaw = val('conversionHappenedAt');
    if (tsRaw === '') {
      body.conversionHappenedAt = Date.now();
    } else if (/^\d+$/.test(tsRaw)) {
      body.conversionHappenedAt = Number(tsRaw);
    } else {
      errors.push('Conversion happened at must be epoch milliseconds');
    }

    const eventId = val('eventId');
    if (eventId) body.eventId = eventId;

    // conversionValue (only when an amount is provided)
    const amount = val('amount');
    if (amount) {
      body.conversionValue = {
        currencyCode: val('currencyCode') || 'USD',
        amount,
      };
    }

    // user identifiers
    const userIds = [];
    const email = val('email');
    if (email) {
      try {
        const normalized = email.toLowerCase().replace(/\s+/g, '');
        const idValue = await sha256Hex(normalized);
        userIds.push({ idType: 'SHA256_EMAIL', idValue });
      } catch (err) {
        errors.push(err.message);
      }
    }
    const liFatId = val('liFatId');
    if (liFatId) {
      userIds.push({ idType: 'LINKEDIN_FIRST_PARTY_ADS_TRACKING_UUID', idValue: liFatId });
    }
    const acxiomId = val('acxiomId');
    if (acxiomId) userIds.push({ idType: 'ACXIOM_ID', idValue: acxiomId });
    const ipAddress = val('ipAddress');
    if (ipAddress) userIds.push({ idType: 'PLAINTEXT_IP_ADDRESS', idValue: ipAddress });
    const googleAid = val('googleAid');
    if (googleAid) userIds.push({ idType: 'GOOGLE_AID', idValue: googleAid });

    const user = { userIds };

    // userInfo (requires both first and last name when present)
    const firstName = val('firstName');
    const lastName = val('lastName');
    const companyName = val('companyName');
    const title = val('title');
    const userCountryCode = val('userCountryCode');
    const hasUserInfo =
      firstName || lastName || companyName || title || userCountryCode;
    if (hasUserInfo) {
      if (!firstName || !lastName) {
        errors.push('User info requires both first and last name');
      }
      const userInfo = {};
      if (firstName) userInfo.firstName = firstName;
      if (lastName) userInfo.lastName = lastName;
      if (companyName) userInfo.companyName = companyName;
      if (title) userInfo.title = title;
      if (userCountryCode) userInfo.countryCode = userCountryCode;
      user.userInfo = userInfo;
    }

    const lead = val('lead');
    if (lead) user.lead = lead;
    const externalId = val('externalId');
    if (externalId) user.externalIds = [externalId];

    if (userIds.length === 0 && !hasUserInfo && !lead && !externalId) {
      errors.push(
        'Provide at least one user identifier (email, click ID, etc.) or user info / lead / external ID'
      );
    }

    body.user = user;

    return { body, errors };
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
