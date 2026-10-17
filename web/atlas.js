// Loads an atlas: reads the root file, follows `include:` references to other
// files (in other repositories, on GitHub or GitLab), and merges everything
// into one model of projects, domains, services and resources.

import { load, CORE_SCHEMA } from "./vendor/js-yaml.mjs";
import { BUILTIN_SERVICES } from "./catalog.js";

export const DEFAULT_FILE = "stackatlas.yaml";
// YAML 1.2 core schema, like editors use: 2027-01-31 stays a string, not a Date
export const parseYaml = (text) => load(text, { schema: CORE_SCHEMA });
export const TYPES = ["website", "app", "api", "service", "library", "other"];
export const STATUSES = ["active", "planned", "paused", "archived"];
const MAX_DEPTH = 10;

// --- sources --------------------------------------------------------------------
// A source is where one atlas file lives. It knows its URL, a short label and
// how to resolve a relative include written inside it.

const isYamlPath = (p) => /\.ya?ml$/i.test(p);
const withDefaultFile = (p) => !p ? DEFAULT_FILE : isYamlPath(p) ? p : `${p.replace(/\/$/, "")}/${DEFAULT_FILE}`;

function joinPath(base, rel) {
  if (rel.startsWith("/")) return rel.slice(1);
  const parts = base.split("/").slice(0, -1);
  for (const part of rel.split("/")) {
    if (part === "..") parts.pop();
    else if (part !== "." && part !== "") parts.push(part);
  }
  return parts.join("/");
}

function githubSource({ owner, repo, ref = "HEAD", path }) {
  path = withDefaultFile(path);
  return {
    kind: "github", owner, repo, ref, path,
    url: `https://raw.githubusercontent.com/${owner}/${repo}/${ref}/${path.split("/").map(encodeURIComponent).join("/")}`,
    label: `github:${owner}/${repo}${path === DEFAULT_FILE ? "" : `/${path}`}${ref === "HEAD" ? "" : `@${ref}`}`,
    repoUrl: `https://github.com/${owner}/${repo}`,
    fileUrl: `https://github.com/${owner}/${repo}/blob/${ref}/${path}`,
    resolve: (rel) => githubSource({ owner, repo, ref, path: joinPath(path, rel) }),
  };
}

function gitlabSource({ host = "gitlab.com", project, ref = "HEAD", path }) {
  path = withDefaultFile(path);
  return {
    kind: "gitlab", host, project, ref, path,
    url: `https://${host}/api/v4/projects/${encodeURIComponent(project)}/repository/files/${encodeURIComponent(path)}/raw?ref=${encodeURIComponent(ref)}`,
    label: `gitlab:${host === "gitlab.com" ? "" : `${host}/`}${project}${path === DEFAULT_FILE ? "" : `//${path}`}${ref === "HEAD" ? "" : `@${ref}`}`,
    repoUrl: `https://${host}/${project}`,
    fileUrl: `https://${host}/${project}/-/blob/${ref}/${path}`,
    resolve: (rel) => gitlabSource({ host, project, ref, path: joinPath(path, rel) }),
  };
}

function urlSource(url) {
  return {
    kind: "url", url,
    label: url.startsWith(location.origin) ? url.slice(location.origin.length) : url,
    fileUrl: url,
    resolve: (rel) => urlSource(new URL(rel, url).href),
  };
}

function splitRef(s) {
  const at = s.lastIndexOf("@");
  return at > 0 ? [s.slice(0, at), s.slice(at + 1)] : [s, undefined];
}

/**
 * Turns an include reference into a source. References can be:
 *   "github:owner/repo[/path/file.yaml][@ref]"
 *   "gitlab:group/project[//path/file.yaml][@ref]"
 *   "https://…", or a path relative to the including file
 *   { github: "owner/repo", path, ref } / { gitlab: "group/project", host, path, ref } / { url }
 */
export function parseRef(ref, from) {
  if (ref && typeof ref === "object") {
    if (ref.github) {
      const [owner, repo] = String(ref.github).split("/");
      if (!owner || !repo) throw new Error(`github reference needs "owner/repo": ${JSON.stringify(ref)}`);
      return githubSource({ owner, repo, ref: ref.ref, path: ref.path });
    }
    if (ref.gitlab) return gitlabSource({ host: ref.host, project: String(ref.gitlab), ref: ref.ref, path: ref.path });
    if (ref.url) return parseRef(String(ref.url), from);
    throw new Error(`unknown include: ${JSON.stringify(ref)}`);
  }
  const s = String(ref ?? "").trim();
  if (!s) throw new Error("empty include");
  if (s.startsWith("github:")) {
    const [main, gitRef] = splitRef(s.slice(7));
    const [owner, repo, ...rest] = main.split("/");
    if (!owner || !repo) throw new Error(`github reference needs "owner/repo": ${s}`);
    return githubSource({ owner, repo, ref: gitRef, path: rest.join("/") });
  }
  if (s.startsWith("gitlab:")) {
    const [main, gitRef] = splitRef(s.slice(7));
    const [project, path] = main.split("//");
    return gitlabSource({ project, ref: gitRef, path });
  }
  if (/^https?:\/\//.test(s)) return urlSource(s);
  return from ? from.resolve(s) : urlSource(new URL(s, location.href).href);
}

// --- loading --------------------------------------------------------------------

async function fetchText(source, ctx) {
  const proxied = ctx.proxy && (source.kind === "github" || source.kind === "gitlab");
  const res = await fetch(proxied ? `api/fetch?url=${encodeURIComponent(source.url)}` : source.url, { cache: "no-store" });
  if (res.status === 404) throw new Error("file not found (or the repository is private and no token is set)");
  if (res.status === 401 || res.status === 403) throw new Error(`access denied (${res.status}); is a token needed?`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

const asArray = (v) => v == null ? [] : Array.isArray(v) ? v : [v];

/** Loads the atlas at `rootRef`. Never throws for problems in files: they become warnings. */
export async function loadAtlas(rootRef, ctx = {}) {
  const files = [];
  const warnings = [];
  const seen = new Set();

  async function visit(source, depth, order) {
    if (seen.has(source.url)) return;
    seen.add(source.url);
    if (depth > MAX_DEPTH) {
      warnings.push({ file: source.label, message: `includes nested deeper than ${MAX_DEPTH} levels; stopped here` });
      return;
    }
    let doc;
    try {
      doc = parseYaml(await fetchText(source, ctx)) ?? {};
      if (typeof doc !== "object" || Array.isArray(doc)) throw new Error("the file must be a YAML mapping");
    } catch (e) {
      warnings.push({ file: source.label, url: source.fileUrl, message: e.message });
      return;
    }
    files.push({ source, doc, depth, order });
    await Promise.all(asArray(doc.include).map((ref, i) => {
      let child;
      try { child = parseRef(ref, source); } catch (e) {
        warnings.push({ file: source.label, url: source.fileUrl, message: e.message });
        return null;
      }
      return visit(child, depth + 1, [...order, i]);
    }));
  }

  await visit(parseRef(rootRef), 0, []);
  files.sort((a, b) => a.order.join(".").localeCompare(b.order.join("."), undefined, { numeric: true }));
  return merge(files, warnings);
}

// --- reading files tolerantly ------------------------------------------------------
// There is no version number in atlas files. Instead, the format only grows:
// fields are added, never removed or redefined, and this reader is forgiving.
// Unknown fields are ignored (with a warning, in case they are typos), x-…
// fields are kept for the user, and old or common alternative names are read
// as the current ones.

const FIELDS = {
  file: ["title", "atlas", "owner", "group", "include", "projects", "services", "domains"],
  project: ["name", "owner", "group", "type", "status", "url", "repo", "notes", "domains", "resources"],
  service: ["name", "category", "url", "plan", "account", "notes", "resources"],
  resource: ["name", "notes"],
  use: ["use", "notes"],
  domain: ["registrar", "expires", "registered", "dns", "lookup", "auto_renew", "cost", "currency", "notes"],
};

const FIELD_ALIASES = {
  file: {},
  project: { repository: "repo", description: "notes", domain: "domains", uses: "resources", services: "resources" },
  service: { dashboard: "url" },
  resource: { description: "notes" },
  use: { resource: "use", description: "notes" },
  domain: { autorenew: "auto_renew", auto_renewal: "auto_renew", expiry: "expires", expiration: "expires", description: "notes" },
};

// Service ids people are likely to write, mapped to the catalog's
const SERVICE_ALIASES = {
  fly: "fly-io", flyio: "fly-io", lemonsqueezy: "lemon-squeezy", googleplay: "google-play", "play-store": "google-play",
  appstore: "app-store", "better-stack": "betterstack", "digital-ocean": "digitalocean", cf: "cloudflare",
};

/** Returns the known fields of `obj` under their current names, plus its x-… fields as `extra`. */
function read(obj, kind, what, warn) {
  const out = {};
  const extra = {};
  const aliases = FIELD_ALIASES[kind];
  // Current names first, so they win over an alias given alongside them
  const entries = Object.entries(obj).sort(([a], [b]) => (a in aliases) - (b in aliases));
  for (const [key, value] of entries) {
    if (key.startsWith("x-")) {
      extra[key.slice(2)] = value;
      continue;
    }
    const name = aliases[key] ?? key;
    if (!FIELDS[kind].includes(name)) {
      warn(`${what}: unknown field "${key}" ignored (a newer stackatlas may know it)`);
      continue;
    }
    if (name in out) continue;
    if (name !== key) warn(`${what}: read "${key}" as "${name}"`);
    out[name] = value;
  }
  if (Object.keys(extra).length) out.extra = extra;
  return out;
}

const isMapping = (v) => v != null && typeof v === "object" && !Array.isArray(v);

// --- merging --------------------------------------------------------------------

const slug = (s) => String(s).normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\w]+/g, "-").replace(/^-|-$/g, "").toLowerCase();

function serviceId(id, warn, what) {
  const canonical = SERVICE_ALIASES[id];
  if (!canonical) return id;
  warn(`${what}: read service "${id}" as "${canonical}"`);
  return canonical;
}

function mergeServices(files) {
  const services = {};
  for (const [id, s] of Object.entries(BUILTIN_SERVICES)) {
    services[id] = { ...s, id, builtin: true, resources: Object.fromEntries(
      Object.entries(s.resources ?? {}).map(([rid, r]) => [rid, { ...r, id: rid }])) };
  }
  // Applied in reverse so that the central atlas has the last word, and among
  // included files the one included first
  for (const { doc, warn } of [...files].reverse()) {
    if (!isMapping(doc.services ?? {})) {
      warn("services: must be a mapping of service ids");
      continue;
    }
    for (const [rawId, raw] of Object.entries(doc.services ?? {})) {
      const id = serviceId(rawId, warn, `services.${rawId}`);
      if (!isMapping(raw)) {
        warn(`service "${rawId}" must be a mapping`);
        continue;
      }
      const s = read(raw, "service", `service "${rawId}"`, warn);
      const base = services[id] ?? { id, name: id, resources: {} };
      const resources = { ...base.resources };
      for (const [rid, r] of Object.entries(isMapping(s.resources) ? s.resources : {})) {
        const fields = typeof r === "string" ? { name: r } : isMapping(r) ? read(r, "resource", `resource "${rawId}/${rid}"`, warn) : {};
        resources[rid] = { ...resources[rid], id: rid, name: rid, ...fields, declared: true };
      }
      services[id] = { ...base, ...s, id, resources, declared: true };
    }
  }
  return services;
}

function merge(files, warnings) {
  for (const f of files) {
    f.warn = (message) => warnings.push({ file: f.source.label, url: f.source.fileUrl, message });
    f.doc = read(f.doc, "file", "file", f.warn);
  }
  const rootFile = files.find((f) => f.depth === 0);
  const root = rootFile?.doc ?? {};
  const services = mergeServices(files);
  const domains = {};
  const projects = [];
  const ids = new Set();

  const domain = (name) => domains[name] ??= { name, projects: [], meta: {} };

  for (const { doc, warn } of [...files].reverse()) { // same precedence as services
    for (const [name, meta] of Object.entries(isMapping(doc.domains) ? doc.domains : {})) {
      const fields = isMapping(meta) ? read(meta, "domain", `domain "${name}"`, warn) : {};
      const d = domain(name.toLowerCase());
      d.meta = { ...d.meta, ...fields, extra: { ...d.meta.extra, ...fields.extra } };
    }
  }

  for (const { source, doc, warn } of files) {
    for (const [i, item] of asArray(doc.projects).entries()) {
      if (!isMapping(item) || !item.name) {
        warn(`project #${i + 1} has no name`);
        continue;
      }
      const raw = read(item, "project", `project "${item.name}"`, warn);
      const p = {
        name: String(raw.name),
        group: raw.group ?? doc.group ?? null,
        owner: raw.owner ?? doc.owner ?? null,
        type: raw.type ?? "other",
        status: raw.status ?? "active",
        url: raw.url ?? null,
        // A repository's own stackatlas.yaml describes that repository
        repo: raw.repo ?? (source.repoUrl && source.path?.split("/").at(-1) === DEFAULT_FILE ? source.repoUrl : null),
        notes: raw.notes ?? null,
        extra: raw.extra ?? {},
        source,
        domains: [],
        resources: [],
      };
      p.id = slug([p.owner, p.group, p.name].filter(Boolean).join(" "));
      if (ids.has(p.id)) {
        warn(`project "${p.name}" is defined more than once; keeping the first`);
        continue;
      }
      ids.add(p.id);
      if (!TYPES.includes(p.type)) warn(`project "${p.name}": unknown type "${p.type}" (expected ${TYPES.join(", ")})`);
      if (!STATUSES.includes(p.status)) warn(`project "${p.name}": unknown status "${p.status}" (expected ${STATUSES.join(", ")})`);

      for (const d of asArray(raw.domains)) {
        const name = String(d).trim().toLowerCase();
        if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(name)) {
          warn(`project "${p.name}": "${d}" is not a domain name`);
          continue;
        }
        p.domains.push(name);
        domain(name).projects.push(p.id);
      }

      for (const r of asArray(raw.resources)) {
        const use = isMapping(r) ? read(r, "use", `project "${p.name}"`, warn) : { use: r };
        const [rawService, resourceId] = String(use.use ?? "").split("/");
        if (!rawService || !resourceId) {
          warn(`project "${p.name}": resource "${use.use}" should look like "service/resource", e.g. "supabase/auth"`);
          continue;
        }
        const sid = serviceId(rawService, warn, `project "${p.name}"`);
        if (!services[sid]) {
          warn(`project "${p.name}": unknown service "${sid}"; declare it under services:`);
          services[sid] = { id: sid, name: sid, resources: {}, unknown: true };
        }
        const resources = services[sid].resources;
        if (!resources[resourceId]) {
          if (!services[sid].unknown) warn(`project "${p.name}": "${sid}" has no resource "${resourceId}"; declare it under services.${sid}.resources`);
          resources[resourceId] = { id: resourceId, name: resourceId, unknown: true };
        }
        p.resources.push({ key: `${sid}/${resourceId}`, service: sid, resource: resourceId, notes: use.notes ?? null });
      }
      projects.push(p);
    }
  }

  // A file opened on its own can say which atlas it belongs to
  const partOf = [];
  for (const ref of asArray(root.atlas)) {
    try { partOf.push(parseRef(ref, rootFile.source).label); } catch (e) { rootFile.warn(`atlas: ${e.message}`); }
  }

  return { title: root.title ?? "Stack atlas", files, projects, domains, services, warnings, partOf };
}
