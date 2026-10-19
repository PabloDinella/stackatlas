// Optional usage analytics with PostHog, off unless configured:
//   - the hosted viewer gets a key at deploy time, in analytics.json;
//   - a self-hosted server passes STACKATLAS_POSTHOG_KEY through /api/config.
//
// Only counts and kinds are sent, never atlas addresses or the names of
// repositories, projects or domains. No cookies (memory persistence), no
// autocapture, no session recording, and Do Not Track / Global Privacy
// Control turn it off.

const POSTHOG_JS = "https://cdn.jsdelivr.net/npm/posthog-js@1.435.8/+esm";
const DEFAULT_HOST = "https://us.i.posthog.com";

let posthog = null;

// URLs carry ?atlas=github:someone/private-atlas: keep only origin and path
const stripQuery = (url) => {
  try { const u = new URL(url); return u.origin + u.pathname; } catch { return undefined; }
};

function scrub(value) {
  if (typeof value === "string") return /^https?:\/\//.test(value) ? stripQuery(value) : value;
  if (Array.isArray(value)) return value.map(scrub);
  if (value && typeof value === "object") {
    for (const k of Object.keys(value)) {
      if (/with_query/.test(k)) delete value[k];
      else value[k] = scrub(value[k]);
    }
  }
  return value;
}

export async function initAnalytics(config = {}) {
  let key = config.posthogKey;
  let host = config.posthogHost;
  if (!key) {
    try {
      const res = await fetch("analytics.json", { cache: "no-store" });
      if (res.ok) ({ key, host } = await res.json());
    } catch { /* not configured */ }
  }
  if (!key || navigator.doNotTrack === "1" || navigator.globalPrivacyControl) return;

  try {
    posthog = (await import(POSTHOG_JS)).default;
    posthog.init(key, {
      api_host: host || DEFAULT_HOST,
      persistence: "memory",
      autocapture: false,
      capture_pageview: false,
      capture_pageleave: false,
      disable_session_recording: true,
      disable_surveys: true,
      person_profiles: "identified_only",
      // PostHog adds URLs under many names ($current_url, $session_entry_url,
      // $initial_current_url in $set_once…): strip the query from all of them
      // The page title is the atlas title, which is user content
      sanitize_properties: (props) => { delete props.title; return scrub(props); },
    });
    track("$pageview", { $current_url: stripQuery(location.href) });
  } catch {
    posthog = null; // blocked or offline: the viewer works the same
  }
}

/** Sends an event if analytics is on. Props must never hold names or addresses. */
export function track(event, props = {}) {
  posthog?.capture(event, props);
}
