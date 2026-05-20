/**
 * Live API "Try it" handler.
 * Sends { method, url, body? } to /api/call and renders the response.
 */
(function () {
  const PLACEHOLDER_RE = /\{([a-zA-Z][\w]*)\}/g;

  function ask(message, defaultValue) {
    const v = window.prompt(message, defaultValue || '');
    return v == null ? null : v.trim();
  }

  function fillPlaceholders(template) {
    const placeholders = [...template.matchAll(PLACEHOLDER_RE)].map((m) => m[1]);
    if (placeholders.length === 0) return template;

    let url = template;
    for (const name of placeholders) {
      const value = ask(`Enter a value for {${name}}\n\n(e.g. urn:li:organization:2414183)`, '');
      if (value === null) return null; // user cancelled
      url = url.replaceAll(`{${name}}`, encodeURIComponent(value).replace(/%3A/g, ':'));
    }
    return url;
  }

  async function tryEndpoint(button) {
    const method = button.dataset.method;
    const template = button.dataset.url;
    const target = document.getElementById(button.dataset.target);

    const url = fillPlaceholders(template);
    if (url === null) return;

    target.hidden = false;
    target.innerHTML = '<p class="muted">Calling…</p>';
    button.disabled = true;

    let payload = { method, url };
    if (method !== 'GET') {
      const sample = window.prompt(
        `Optional JSON request body (leave blank to send empty body):`,
        ''
      );
      if (sample == null) {
        button.disabled = false;
        target.hidden = true;
        return;
      }
      if (sample.trim()) {
        try {
          payload.body = JSON.parse(sample);
        } catch (e) {
          target.innerHTML = `<p class="error">Invalid JSON body: ${e.message}</p>`;
          button.disabled = false;
          return;
        }
      }
    }

    try {
      const res = await fetch('/api/call', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();

      if (data.error === 'needs_reauth') {
        target.innerHTML =
          '<p class="warn">Your access token has expired. <a href="/auth/linkedin">Re-authorize with LinkedIn</a>.</p>';
        return;
      }
      if (!res.ok) {
        target.innerHTML = `<pre class="error">${escape(JSON.stringify(data, null, 2))}</pre>`;
        return;
      }

      const r = data.response;
      const statusClass = r.status >= 200 && r.status < 300 ? 'http-get' : 'http-delete';
      target.innerHTML = `
        <div class="api-result-meta">
          <span class="http-method ${statusClass}">${r.status}</span>
          <span class="ep-label">${escape(r.statusText || '')}</span>
          <span class="ep-label">${escape(data.request.method)} <code>${escape(data.request.url)}</code></span>
        </div>
        <pre>${escape(typeof r.body === 'string' ? r.body : JSON.stringify(r.body, null, 2))}</pre>
      `;
    } catch (err) {
      target.innerHTML = `<p class="error">Request failed: ${escape(err.message)}</p>`;
    } finally {
      button.disabled = false;
    }
  }

  function escape(s) {
    return String(s)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;');
  }

  document.addEventListener('click', (e) => {
    const btn = e.target.closest('.btn-try');
    if (btn) tryEndpoint(btn);
  });
})();
