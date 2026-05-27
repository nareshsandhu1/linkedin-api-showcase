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
  const URN_RE = /urn:[a-z]+:[^\s:,]+(?::[^\s,)+]+)+/i;

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

  function decodeMaybe(value) {
    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  }

  function inferUrnPrefix(field) {
    if (field.urnPrefix) return field.urnPrefix;

    const candidates = [];
    if (typeof field.default === 'string') candidates.push(field.default);
    if (typeof field.hint === 'string') candidates.push(field.hint);
    if (Array.isArray(field.options)) candidates.push(...field.options);
    if (typeof field.sampleValue === 'string') candidates.push(field.sampleValue);

    for (const candidate of candidates) {
      const decoded = decodeMaybe(String(candidate || ''));
      const match = decoded.match(URN_RE);
      if (match) {
        const urn = match[0];
        const lastColon = urn.lastIndexOf(':');
        if (lastColon !== -1) return urn.slice(0, lastColon + 1);
      }
    }
    return '';
  }

  function extractIdFromValue(value, prefix) {
    const decoded = decodeMaybe(String(value || '').trim());
    if (!decoded) return '';
    if (prefix && decoded.startsWith(prefix)) return decoded.slice(prefix.length);
    if (/^urn:/i.test(decoded)) {
      const idx = decoded.lastIndexOf(':');
      return idx === -1 ? decoded : decoded.slice(idx + 1);
    }
    return decoded;
  }

  function toUrnValue(value, prefix) {
    const trimmed = String(value || '').trim();
    if (!trimmed) return '';
    const decoded = decodeMaybe(trimmed);
    if (/^urn:/i.test(decoded) || !prefix) return decoded;
    return `${prefix}${decoded}`;
  }

  function parseIdList(text, prefix) {
    return parseUrnList(text).map((value) => toUrnValue(value, prefix));
  }

  function parseJson(text) {
    try {
      return JSON.parse(text);
    } catch {
      return null;
    }
  }

  function labelToId(label) {
    return String(label || '')
      .replace(/\bURNs\b/g, 'IDs')
      .replace(/\bURN\b/g, 'ID');
  }

  function valueToFriendlyLabel(value) {
    const decoded = decodeMaybe(String(value || ''));
    if (/^urn:/i.test(decoded)) return extractIdFromValue(decoded, inferUrnPrefix({ sampleValue: decoded }));
    return decoded;
  }

  function placeholderLabel(name) {
    return String(name || '')
      .replace(/Urn$/i, ' ID')
      .replace(/Id$/i, ' ID')
      .replace(/Ids$/i, ' IDs')
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .replace(/^./, (char) => char.toUpperCase());
  }

  function humanizeUrnPrefix(prefix) {
    const trimmed = String(prefix || '').replace(/:$/, '');
    const segments = trimmed.split(':');
    const urnType = segments[segments.length - 1] || '';
    if (!urnType) return '';

    return urnType
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .replace(/^./, (char) => char.toUpperCase());
  }

  function isSimpleObject(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
  }

  function collectBodyHelperFields(value, path = []) {
    const fields = [];
    if (Array.isArray(value)) {
      value.forEach((item, index) => {
        fields.push(...collectBodyHelperFields(item, path.concat(index)));
      });
      return fields;
    }
    if (!isSimpleObject(value)) {
      if (typeof value === 'string') {
        const prefix = inferUrnPrefix({ sampleValue: value });
        if (prefix) {
          const key = String(path[path.length - 1] || 'value');
          const prefixLabel = humanizeUrnPrefix(prefix);
          fields.push({
            path,
            key,
            label: prefixLabel ? `${prefixLabel} ID` : placeholderLabel(key),
            urnPrefix: prefix,
            sampleValue: value,
          });
        }
      }
      return fields;
    }

    Object.keys(value).forEach((key) => {
      fields.push(...collectBodyHelperFields(value[key], path.concat(key)));
    });
    return fields;
  }

  function getNestedValue(source, path) {
    return path.reduce((current, key) => (current == null ? current : current[key]), source);
  }

  function setNestedValue(source, path, nextValue) {
    const clone = Array.isArray(source) ? source.slice() : { ...source };
    let cursor = clone;

    for (let index = 0; index < path.length - 1; index += 1) {
      const key = path[index];
      const existing = cursor[key];
      cursor[key] = Array.isArray(existing) ? existing.slice() : { ...existing };
      cursor = cursor[key];
    }

    cursor[path[path.length - 1]] = nextValue;
    return clone;
  }

  function renderBodyHelperFields(sampleBody) {
    const parsed = parseJson(sampleBody);
    if (!parsed) return '';

    const fields = collectBodyHelperFields(parsed);
    if (!fields.length) return '';

    return `
      <section class="try-helper-box" data-body-helpers="true">
        <h3>Request details</h3>
        <p class="muted">Enter only the IDs you know. The full LinkedIn values are added automatically.</p>
        <div class="try-placeholder-grid">
          ${fields
            .map((field, index) => {
              const idValue = extractIdFromValue(field.sampleValue, field.urnPrefix);
              return `
                <label class="try-label" for="b_${index}">${escape(field.label)}
                  <input id="b_${index}" type="text" data-body-field-index="${index}"
                         data-body-path="${escape(JSON.stringify(field.path))}"
                         data-urn-prefix="${escape(field.urnPrefix)}"
                         value="${escape(idValue)}" placeholder="Enter the ID only" spellcheck="false" />
                </label>`;
            })
            .join('')}
        </div>
      </section>`;
  }

  function buildBodyFromHelpers(form, sampleBody) {
    const parsed = parseJson(sampleBody);
    if (!parsed) return { body: null, errors: [] };

    let nextBody = parsed;
    const errors = [];
    const inputs = form.querySelectorAll('[data-body-path]');

    inputs.forEach((input) => {
      const path = JSON.parse(input.dataset.bodyPath || '[]');
      const prefix = input.dataset.urnPrefix || '';
      const rawValue = input.value.trim();
      const label = input.closest('.try-label')?.textContent?.trim() || 'Field';
      const currentValue = getNestedValue(nextBody, path);

      if (!rawValue) {
        errors.push(`${label} is required`);
        return;
      }

      if (typeof currentValue === 'string') {
        nextBody = setNestedValue(nextBody, path, toUrnValue(rawValue, prefix));
      }
    });

    return { body: nextBody, errors };
  }

  function escapeRegex(text) {
    return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function derivePlaceholderSamples(urlTemplate, sampleUrl) {
    const names = [...urlTemplate.matchAll(PLACEHOLDER_RE)].map((match) => match[1]);
    if (!names.length || !sampleUrl) return [];

    const pattern = escapeRegex(urlTemplate).replace(/\\\{([a-zA-Z][\w]*)\\\}/g, '([^&#?]+)');
    const match = new RegExp(`^${pattern}$`).exec(sampleUrl);
    if (!match) return names.map((name) => ({ name, sampleValue: '' }));

    return names.map((name, index) => ({
      name,
      sampleValue: decodeMaybe(match[index + 1] || ''),
    }));
  }

  function fmtDateTuple(yyyyMmDd) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(yyyyMmDd || '').trim());
    if (!m) return null;
    return `(year:${Number(m[1])},month:${Number(m[2])},day:${Number(m[3])})`;
  }

  function renderSchemaField(field) {
    const id = `f_${field.key.replace(/[^a-zA-Z0-9]/g, '_')}`;
    const urnPrefix = inferUrnPrefix(field);
    const friendlyLabel = labelToId(field.label);
    const friendlyHint = field.hint
      ? field.hint
          .replace(/urn:[^\s,.)]+/gi, (value) => extractIdFromValue(value, inferUrnPrefix({ sampleValue: value })))
          .replace(/\bURNs\b/g, 'IDs')
          .replace(/\bURN\b/g, 'ID')
      : '';
    const hint = friendlyHint
      ? `<p class="muted try-hint">${escape(friendlyHint)}</p>`
      : '';
    if (field.type === 'select') {
      const opts = field.options
        .map(
          (o) =>
            `<option value="${escape(o)}"${
              o === field.default ? ' selected' : ''
            }>${escape(valueToFriendlyLabel(o))}</option>`
        )
        .join('');
      return `
        <label class="try-label" for="${id}">${escape(friendlyLabel)}
          <select id="${id}" data-key="${escape(field.key)}" data-ftype="select">${opts}</select>
        </label>${hint}`;
    }
    if (field.type === 'number') {
      const minAttr = field.min != null ? ` min="${field.min}"` : '';
      const maxAttr = field.max != null ? ` max="${field.max}"` : '';
      return `
        <label class="try-label" for="${id}">${escape(friendlyLabel)}
          <input id="${id}" data-key="${escape(field.key)}" data-ftype="number"
                 type="number"${minAttr}${maxAttr}
                 value="${escape(field.default != null ? field.default : '')}" />
        </label>${hint}`;
    }
    if (field.type === 'dateRange') {
      const d = field.defaults || {};
      return `
        <fieldset class="try-fieldset" data-key="${escape(field.key)}" data-ftype="dateRange">
          <legend>${escape(friendlyLabel)}</legend>
          <label class="try-label-inline">Start
            <input type="date" data-role="start" value="${escape(d.start || '')}" />
          </label>
          <label class="try-label-inline">End
            <input type="date" data-role="end" value="${escape(d.end || '')}" />
          </label>
        </fieldset>${hint}`;
    }
    if (field.type === 'urnList') {
      const defaultValue = parseUrnList(field.default || '')
        .map((value) => extractIdFromValue(value, urnPrefix))
        .join('\n');
      return `
        <label class="try-label" for="${id}">${escape(friendlyLabel)}
          <textarea id="${id}" data-key="${escape(field.key)}" data-ftype="urnList"
                    rows="2" spellcheck="false"
                    placeholder="Enter one ID per line">${escape(defaultValue)}</textarea>
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
              <span>${escape(valueToFriendlyLabel(o))}</span>
            </label>`
        )
        .join('');
      return `
        <fieldset class="try-fieldset" data-key="${escape(field.key)}" data-ftype="checkboxes">
          <legend>${escape(friendlyLabel)}</legend>
          <div class="try-checkbox-grid">${boxes}</div>
        </fieldset>${hint}`;
    }
    // text fallback
    const textValue = urnPrefix
      ? extractIdFromValue(field.default || '', urnPrefix)
      : field.default || '';
    return `
      <label class="try-label" for="${id}">${escape(friendlyLabel)}
        <input id="${id}" data-key="${escape(field.key)}" data-ftype="text"
               type="text" value="${escape(textValue)}" spellcheck="false"
               placeholder="${escape(urnPrefix ? 'Enter the ID only' : '')}" />
      </label>${hint}`;
  }

  function buildUrlFromSchema(form, schema) {
    const params = [];
    const errors = [];
    const facetClauses = [];

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
        selected = parseIdList(wrap.value, inferUrnPrefix(field));
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
        const value = toUrnValue(wrap.value, inferUrnPrefix(field));
        addParam(field.key, encodeURIComponent(value));
      }
    });

    if (facetClauses.length) {
      params.push(
        `targetingCriteria=(include:(and:List(${facetClauses.join(',')})))`
      );
    }

    return { url: `${schema.baseUrl}?${params.join('&')}`, errors };
  }

  // ---- POST body builders ----------------------------------------------

  function readFieldSelections(form, field) {
    const wrap = form.querySelector(
      `[data-key="${field.key}"][data-ftype]`
    );
    if (!wrap) return null;
    if (field.type === 'urnList') return parseIdList(wrap.value, inferUrnPrefix(field));
    if (field.type === 'checkboxes') {
      return Array.from(
        wrap.querySelectorAll('input[type="checkbox"]:checked')
      ).map((i) => i.value);
    }
    if (field.type === 'number') {
      const v = wrap.value === '' ? null : Number(wrap.value);
      return Number.isFinite(v) ? v : null;
    }
    return toUrnValue(wrap.value, inferUrnPrefix(field));
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
        const built = buildSchemaPayload(form, schema);
        bodyPreview.value = JSON.stringify(built.body, null, 2);
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
        const built = buildSchemaPayload(form, schema);
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
    return { body: {}, errors: ['Unknown bodyShape: ' + schema.bodyShape] };
  }

  // -- Generic free-form editor --------------------------------------------

  function buildUrlFromTemplate(urlTemplate, form) {
    const errors = [];
    const nextUrl = urlTemplate.replace(PLACEHOLDER_RE, (_, name) => {
      const input = form.querySelector(`[data-placeholder-name="${name}"]`);
      if (!input) return `{${name}}`;
      const prefix = input.dataset.urnPrefix || '';
      const value = toUrnValue(input.value, prefix);
      if (!value) {
        errors.push(`${placeholderLabel(name)} is required`);
        return `{${name}}`;
      }
      return encodeURIComponent(value);
    });
    return { url: nextUrl, errors };
  }

  function renderPlaceholderFields(urlTemplate, sampleUrl) {
    const samples = derivePlaceholderSamples(urlTemplate, sampleUrl);
    if (!samples.length) return '';

    return `
      <section class="try-helper-box">
        <h3>Required IDs</h3>
        <p class="muted">Enter only the ID. The full LinkedIn value is built for you.</p>
        <div class="try-placeholder-grid">
          ${samples
            .map(({ name, sampleValue }) => {
              const prefix = inferUrnPrefix({ sampleValue });
              const idValue = extractIdFromValue(sampleValue, prefix);
              return `
                <label class="try-label" for="p_${escape(name)}">${escape(placeholderLabel(name))}
                  <input id="p_${escape(name)}" type="text" data-placeholder-name="${escape(name)}"
                         data-urn-prefix="${escape(prefix)}" value="${escape(idValue)}"
                         placeholder="Enter the ID only" spellcheck="false" />
                </label>`;
            })
            .join('')}
        </div>
      </section>`;
  }

  function renderGenericForm(target, method, urlTemplate, sampleUrl, sampleBody) {
    const hasBody = method !== 'GET';
    const hasPlaceholders = PLACEHOLDER_RE.test(urlTemplate);
    const hasBodyHelpers = Boolean(renderBodyHelperFields(sampleBody));
    PLACEHOLDER_RE.lastIndex = 0;
    target.innerHTML = `
      <form class="try-form">
        ${
          hasPlaceholders
            ? renderPlaceholderFields(urlTemplate, sampleUrl)
            : ''
        }
        <label class="try-label">Request URL
          <input type="text" class="try-url" value="${escape(sampleUrl)}" ${
            hasPlaceholders ? 'readonly' : ''
          } spellcheck="false" />
        </label>
        <p class="muted try-hint">
          Review the full request before sending. You only need the specific ID values.
        </p>
        ${hasBody ? renderBodyHelperFields(sampleBody) : ''}
        ${
          hasBody
            ? `<label class="try-label">Request body (JSON)
                 <textarea class="try-body" rows="10" ${
                   hasBodyHelpers ? 'readonly' : ''
                 } spellcheck="false">${escape(sampleBody)}</textarea>
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
    const urlInput = form.querySelector('.try-url');
    const bodyEl = form.querySelector('.try-body');

    function refreshUrl() {
      if (!hasPlaceholders) return;
      const built = buildUrlFromTemplate(urlTemplate, form);
      urlInput.value = built.url;
    }
    function refreshBody() {
      if (!hasBodyHelpers || !bodyEl) return;
      const built = buildBodyFromHelpers(form, sampleBody);
      if (built.body) {
        bodyEl.value = JSON.stringify(built.body, null, 2);
      }
    }
    refreshUrl();
    refreshBody();
    form.addEventListener('input', refreshUrl);
    form.addEventListener('input', refreshBody);

    target.querySelector('.btn-cancel').addEventListener('click', () => {
      target.hidden = true;
      target.innerHTML = '';
    });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const builtUrl = hasPlaceholders ? buildUrlFromTemplate(urlTemplate, form) : null;
      if (builtUrl && builtUrl.errors.length) {
        output.innerHTML = `<p class="error">${escape(builtUrl.errors.join('; '))}</p>`;
        return;
      }
      const url = form.querySelector('.try-url').value.trim();
      const submitBtn = form.querySelector('button[type="submit"]');

      if (PLACEHOLDER_RE.test(url)) {
        PLACEHOLDER_RE.lastIndex = 0;
        const names = [...url.matchAll(PLACEHOLDER_RE)].map((m) => m[1]).join(', ');
        output.innerHTML = `<p class="error">URL still contains placeholder(s): {${escape(names)}}. Replace them with real values.</p>`;
        return;
      }

      const payload = { method, url };
      if (hasBody && bodyEl && bodyEl.value.trim()) {
        if (hasBodyHelpers) {
          const builtBody = buildBodyFromHelpers(form, sampleBody);
          if (builtBody.errors.length) {
            output.innerHTML = `<p class="error">${escape(builtBody.errors.join('; '))}</p>`;
            return;
          }
          payload.body = builtBody.body;
        } else {
          try {
            payload.body = JSON.parse(bodyEl.value);
          } catch (err) {
            output.innerHTML = `<p class="error">Invalid JSON body: ${escape(err.message)}</p>`;
            return;
          }
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
    const urlTemplate = button.dataset.urlTemplate || button.dataset.url;
    const sampleUrl = button.dataset.url;
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
    renderGenericForm(target, method, urlTemplate, sampleUrl, sampleBody);
  }

  document.addEventListener('click', (e) => {
    const btn = e.target.closest('.btn-try');
    if (!btn || btn.type === 'submit') return;
    openEditor(btn);
  });
})();
