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

// --- merging --------------------------------------------------------------------

const slug = (s) => String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\w]+/g, "-").replace(/^-|-$/g, "").toLowerCase();

function mergeServices(files, warnings) {
  const services = {};
  for (const [id, s] of Object.entries(BUILTIN_SERVICES)) {
    services[id] = { ...s, id, builtin: true, resources: Object.fromEntries(
      Object.entries(s.resources ?? {}).map(([rid, r]) => [rid, { ...r, id: rid }])) };
  }
  // Applied in reverse so that the central atlas has the last word, and among
  // included files the one included first
  for (const { source, doc } of [...files].reverse()) {
    for (const [id, s] of Object.entries(doc.services ?? {})) {
      if (!s || typeof s !== "object") {
        warnings.push({ file: source.label, url: source.fileUrl, message: `service "${id}" must be a mapping` });
        continue;
      }
      const base = services[id] ?? { id, name: id, resources: {} };
      const resources = { ...base.resources };
      for (const [rid, r] of Object.entries(s.resources ?? {})) {
        resources[rid] = { ...resources[rid], id: rid, name: rid, ...(typeof r === "string" ? { name: r } : r), declared: true };
      }
      services[id] = { ...base, ...s, id, resources, declared: true };
    }
  }
  return services;
}

function merge(files, warnings) {
  const root = files.find((f) => f.depth === 0)?.doc ?? {};
  const services = mergeServices(files, warnings);
  const domains = {};
  const projects = [];
  const ids = new Set();

  const domain = (name) => domains[name] ??= { name, projects: [], meta: {} };

  for (const { doc } of [...files].reverse()) { // same precedence as services
    for (const [name, meta] of Object.entries(doc.domains ?? {})) {
      Object.assign(domain(name.toLowerCase()).meta, meta ?? {});
    }
  }

  for (const { source, doc } of files) {
    const warn = (message) => warnings.push({ file: source.label, url: source.fileUrl, message });

    for (const [i, raw] of asArray(doc.projects).entries()) {
      if (!raw || typeof raw !== "object" || !raw.name) {
        warn(`project #${i + 1} has no name`);
        continue;
      }
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
        const use = typeof r === "string" ? r : r?.use;
        const [serviceId, resourceId] = String(use ?? "").split("/");
        if (!serviceId || !resourceId) {
          warn(`project "${p.name}": resource "${use}" should look like "service/resource", e.g. "supabase/auth"`);
          continue;
        }
        if (!services[serviceId]) {
          warn(`project "${p.name}": unknown service "${serviceId}"; declare it under services:`);
          services[serviceId] = { id: serviceId, name: serviceId, resources: {}, unknown: true };
        }
        const resources = services[serviceId].resources;
        if (!resources[resourceId]) {
          if (!services[serviceId].unknown) warn(`project "${p.name}": "${serviceId}" has no resource "${resourceId}"; declare it under services.${serviceId}.resources`);
          resources[resourceId] = { id: resourceId, name: resourceId, unknown: true };
        }
        p.resources.push({ key: `${serviceId}/${resourceId}`, service: serviceId, resource: resourceId, notes: r?.notes ?? null });
      }
      projects.push(p);
    }
  }

  return { title: root.title ?? "Stack atlas", files, projects, domains, services, warnings };
}
