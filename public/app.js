/**
 * Live API "Try it" handler.
 * Renders an inline editor (URL + JSON body) prefilled with example values
 * so users can tweak required params before sending the request to /api/call.
 */
(function () {
  const PLACEHOLDER_RE = /\{([a-zA-Z][\w]*)\}/g;

  function escape(s) {
    return String(s)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;');
  }

  function openEditor(button) {
    const method = button.dataset.method;
    const urlTemplate = button.dataset.url;
    const sampleBody = button.dataset.sampleBody || '';
    const target = document.getElementById(button.dataset.target);
    const hasBody = method !== 'GET';

    target.hidden = false;
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
      } catch (err) {
        output.innerHTML = `<p class="error">Request failed: ${escape(err.message)}</p>`;
      } finally {
        submitBtn.disabled = false;
      }
    });
  }

  document.addEventListener('click', (e) => {
    const btn = e.target.closest('.btn-try');
    if (!btn || btn.type === 'submit') return;
    openEditor(btn);
  });
})();
