# LinkedIn Conversions API via server-side GTM (Stape)

End-to-end setup for sending a custom DOM event from a web page → GA4 →
Stape server container → LinkedIn Conversions API.

Architecture:

```
Browser page (dataLayer push)
        │
        ▼
Web GTM container (GTM-TRQVKJVZ)
  ├─ Google Tag (GA4 base)         ──► sets server_container_url
  └─ GA4 Event tag                 ──► forwards event + params
        │
        ▼  POST /g/collect
Stape server container (sGTM)
  ├─ GA4 Client                    ──► claims the request
  └─ LinkedIn CAPI Tag Template    ──► POSTs to LinkedIn
        │
        ▼
LinkedIn Campaign Manager (conversion rule diagnostics)
```

---

## 0. Prerequisites

| Resource | What you need |
|---|---|
| LinkedIn Campaign Manager | A conversion rule with **Tracking method = Conversions API** (or "Both"). Note the numeric **Conversion Rule ID** (e.g. `26604276`). |
| LinkedIn CAPI access token | Generate in Campaign Manager → **Account assets → Conversions API**. Copy once, store securely. |
| Stape account | Free tier is fine for testing. |
| GTM | A **web** container (e.g. `GTM-TRQVKJVZ`) and a **server** container (Stape creates this for you). |
| GA4 property | Any Measurement ID (`G-XXXXXXXXXX`). Just used as a transport label — GA4 doesn't need to be actively used. |

---

## 1. Stape — create the server container

1. Stape dashboard → **New container** → name it (e.g. `linkedin-capi`).
2. Stape creates:
   - A new server-type GTM container with its own `GTM-XXXXXXX` ID.
   - A tagging server URL like `https://<sub>.nle.stape.io` (e.g. `https://aataordv.nle.stape.io`).
3. Stape dashboard → **Power-ups** → enable **LinkedIn Conversions API**. This installs the LinkedIn tag template in the server container's gallery and pre-creates a set of Data Layer Variables in the web container.

Copy the tagging server URL — you'll need it in the web container.

---

## 2. Browser page — what the page must push

The page must push a `dataLayer` event with this exact schema (key names matter):

```js
window.dataLayer = window.dataLayer || [];
window.dataLayer.push({
  event: "li_conversion_<RULE_ID>",       // e.g. "li_conversion_26604276"
  conversion_rule_id: 26604276,
  conversion_happened_at: Date.now(),      // epoch ms
  event_id: crypto.randomUUID(),           // dedupe key
  value: 1.00,
  currency: "USD",
  user_data: {
    email: "user@example.com",             // raw, NOT pre-hashed
    phone: "+15555550100",
    li_fat_id: "<from ?li_fat_id= URL param or LinkedIn click>"
  }
});
```

Reference implementation: `gtm-capi-test/index.html` in this repo.

Key points:
- Email/phone must be **raw** — the LinkedIn template hashes them server-side.
- `li_fat_id` alone is enough to identify a conversion; email and phone are optional.
- The `event` name must match the trigger exactly in both GTM containers.

---

## 3. Web container (`GTM-TRQVKJVZ`)

### 3.1 Data Layer Variables (auto-created by Stape preset)

Stape's "LinkedIn Conversions API" power-up creates these Data Layer Variables. Verify they exist with these exact Data Layer Variable Names (all **Version 2**):

| GTM variable name | Data Layer Variable Name |
|---|---|
| `conversion_rule_id - Stape Test 26604276` | `conversion_rule_id` |
| `conversion_happened_at - Stape Test 26604276` | `conversion_happened_at` |
| `event_id - Stape Test 26604276` | `event_id` |
| `value - Stape Test 26604276` | `value` |
| `currency - Stape Test 26604276` | `currency` |
| `user_data - Stape Test 26604276` | `user_data` |

If the preset didn't create them, make them yourself (Variables → New → Data Layer Variable, Version 2).

### 3.2 Trigger

- Triggers → New → **Custom Event**
- Event name: `li_conversion_26604276`
- This trigger fires on: **All Custom Events**

### 3.3 Google Tag (GA4 base / init)

- Tag type: **Google Tag**
- Tag ID: your GA4 Measurement ID, e.g. `G-E45DK4LQQY`
- **Configuration parameters** (Add parameter for each):

  | Parameter | Value |
  |---|---|
  | `server_container_url` | `https://aataordv.nle.stape.io` *(no trailing slash)* |
  | `transport_type` | `xhr` *(required so ModHeader can inject the debug header during testing)* |

- Trigger: **Initialization – All Pages**

### 3.4 GA4 Event tag (`LI GA4 Event - Stape Test 26604276`)

- Tag type: **Google Analytics: GA4 Event**
- Measurement ID: same `G-XXXXXXXXXX` (or "Use Google tag settings")
- Event name: `li_conversion_26604276`
- Event parameters (Add Row for each):

  | Parameter name | Value |
  |---|---|
  | `event_id` | `{{event_id - Stape Test 26604276}}` |
  | `conversion_rule_id` | `{{conversion_rule_id - Stape Test 26604276}}` |
  | `conversion_happened_at` | `{{conversion_happened_at - Stape Test 26604276}}` |
  | `value` | `{{value - Stape Test 26604276}}` |
  | `currency` | `{{currency - Stape Test 26604276}}` |
  | `user_data` | `{{user_data - Stape Test 26604276}}` |

- Trigger: the `li_conversion_26604276` custom event trigger from 3.2.

### 3.5 Submit / Publish the web container

---

## 4. Server container (the Stape-provisioned one)

### 4.1 Client

- Clients → New → **Google Analytics: GA4** (built-in). Defaults are fine.
- This claims requests to `/g/collect` and turns them into events.

### 4.2 Event Data variables (REQUIRED — must be created manually)

The LinkedIn template needs the user IDs as scalar values, not as the whole `user_data` object. Create these in the server container:

Variables → New → **Event Data**:

| Variable name | Key Path |
|---|---|
| `ED - email` | `user_data.email` |
| `ED - phone` | `user_data.phone` |
| `ED - li_fat_id` | `user_data.li_fat_id` |

### 4.3 LinkedIn CAPI tag (`LI Tag Template - Stape Test 26604276`)

- Tag type: **LinkedIn | CAPI Tag Template** (from the Community Gallery; auto-added by the Stape power-up)
- **LinkedIn API Access Token:** paste the raw token from Campaign Manager (no quotes, no `+`, no whitespace). Storing it in a server-side Constant variable is recommended.
- **Conversion Rule ID:** `26604276`
- **User Ids Override:** click **Add property** for each identifier you want to send:

  | Key (ID type) | Value |
  |---|---|
  | `LINKEDIN_FIRST_PARTY_ADS_TRACKING_UUID` | `{{ED - li_fat_id}}` |
  | `SHA256_EMAIL` *(optional)* | `{{ED - email}}` |

  > **Why the override is required:** the template's auto-parse only reads cookies and a few well-known fields. It doesn't dig into `user_data.li_fat_id`. Without the explicit override, LinkedIn returns: *"No conversion event was sent to CAPI. You must set 1 out of the 4 acceptable IDs…"*

- Trigger: **Custom** → Event Name **equals** `li_conversion_26604276`.

### 4.4 Submit / Publish the server container

---

## 5. Testing

### 5.1 Tools

Install **ModHeader** (Chrome/Edge/Firefox). It's used to inject the server-Preview debug header into browser requests so the server container's Preview tab can see them.

### 5.2 Get a fresh server-Preview token

1. In the **server container**, click **Preview**.
2. In Tag Assistant top-right gear → **Send requests manually**.
3. Click **Copy x-gtm-server-preview HTTP header**. The token looks like `ZW52LTd8…=`.

> The token changes every time you stop/restart Preview. Always grab a fresh one before testing.

### 5.3 Configure ModHeader

- Request headers → Add:
  - Name: `x-gtm-server-preview`
  - Value: *(paste the token)*
- URL filters → Add:
  - `https://<your-stape-subdomain>.nle.stape.io/*`  *(or `*stape.io*`)*
- Master toggle and row toggle: **ON**
- If you need it in Incognito: `chrome://extensions` → ModHeader → Details → **Allow in Incognito**.

### 5.4 End-to-end test

1. **Web container → Preview** → enter your page URL → Connect.
2. Hard-refresh the page (Cmd/Ctrl + Shift + R).
3. On the page, fill in any required fields (email is optional once `li_fat_id` mapping is in place) and click the fire/conversion button.
4. Verify each hop:

   | Where | What to check |
   |---|---|
   | Web Preview → click the `li_conversion_26604276` event row | `LI GA4 Event - Stape Test 26604276` is under **Tags Fired** |
   | Browser DevTools → Network → filter `collect` | Request URL host = your Stape domain, **Type: xhr**, **Status: 200/204**, Request Headers contain `x-gtm-server-preview` |
   | Server Preview → click the incoming request | **GA4** client claims it. Event Data tab shows `user_data.email`, `user_data.li_fat_id`, etc. |
   | Server Preview → click the LinkedIn tag | Status **Succeeded**. Outgoing HTTP response from LinkedIn is **2xx**. |
   | LinkedIn Campaign Manager → conversion rule → **Diagnostics** | Activity appears within a few minutes. |

### 5.5 Production behaviour without ModHeader

ModHeader is only for debugging. In production, real traffic flows through Stape exactly the same way — you just can't see it in server Preview without the debug header. Use Stape dashboard → **Logs** to inspect live traffic, and Campaign Manager → Diagnostics to verify ingestion.

---

## 6. Common errors and fixes

| Symptom | Cause | Fix |
|---|---|---|
| Web Preview: GA4 tag in **Tags Not Fired**, debug says `_event equals <other name>` | Trigger event name doesn't match the page's pushed event | Update the **Custom Event** trigger's event name to match exactly (e.g. `li_conversion_26604276`). |
| `collect` request goes to `region1.google-analytics.com` instead of Stape | `server_container_url` missing on the Google Tag | Add `server_container_url` to the Google Tag's Configuration parameters. Publish. |
| `collect` request type is **ping** (not xhr); ModHeader can't inject the header | GA4 default `sendBeacon` transport | Add `transport_type = xhr` to the Google Tag's Configuration parameters. |
| Server Preview shows nothing even though Stape returns 200 | Browser request is missing `x-gtm-server-preview` header | Verify ModHeader: master toggle on, row toggle on, URL filter matches, token is current. Also confirm `transport_type = xhr`. |
| Server tag fails: *"You must set 1 out of the 4 acceptable IDs…"* | LinkedIn template's auto-parse can't find any user ID | Expand **User Ids Override**, add `LINKEDIN_FIRST_PARTY_ADS_TRACKING_UUID` → `{{ED - li_fat_id}}` (and optionally `SHA256_EMAIL` → `{{ED - email}}`). |
| Publish blocked: *Unknown variable "ED - li_fat_id"* | Variable referenced but not created in this container | Create the Event Data variable in the **server** container with the exact same name and the key path `user_data.li_fat_id`. |
| Stape Preview token rejected after a while | Token regenerates each time Preview restarts | Re-copy a fresh token from server Preview and update ModHeader. |
| Tag fires but LinkedIn returns 401 | Bad access token | Confirm the stored token is the raw string (no quotes, no `+`, no newlines). Re-generate in Campaign Manager if unsure. |

---

## 7. What you'll have at the end

- A web container that, on any `li_conversion_<RULE_ID>` dataLayer push, forwards the event with all required fields to your Stape server.
- A server container that converts that hit into a LinkedIn Conversions API call with the correct rule ID, identifiers, value, currency, and event time.
- Reproducible testing via ModHeader + linked Preview sessions.

To wire this up for additional conversion rules: create another rule in Campaign Manager, then in each container clone the existing trigger + tag, swap the rule ID in three places (trigger event name, web event name, server tag config), and re-publish.
