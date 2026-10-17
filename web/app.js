import { loadAtlas } from "./atlas.js";
import { lookupDomain } from "./rdap.js";
import { CATEGORIES } from "./catalog.js";

const WARN_DAYS = 60;
const EXAMPLE = "github:PabloDinella/stackatlas/examples/atlas.yaml";
const $ = (id) => document.getElementById(id);
cytoscape.use(cytoscapeElk);

let ctx = { proxy: false };
let source = null;
let atlas = null;
let cy = null;
let focusedId = null;
let drawn = ""; // what the graph currently shows, to skip redrawing when nothing changed

// --- helpers --------------------------------------------------------------------

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const fmtDate = (iso) => iso ? new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) : "unknown";
const daysUntil = (iso) => iso ? Math.floor((new Date(iso) - Date.now()) / 86400e3) : null;
const link = (url, text) => url ? `<a href="${esc(url)}" target="_blank" rel="noopener">${esc(text ?? url.replace(/^https?:\/\//, ""))}</a>` : null;
// TLDs that never exist on the internet (RFC 2606, RFC 6761 and friends): no point asking RDAP
const RESERVED_TLDS = new Set(["example", "test", "invalid", "localhost", "local", "internal", "home", "lan"]);
const pick = (obj, keys) => Object.fromEntries(keys.filter((k) => obj[k] != null).map((k) => [k, obj[k]]));
const fullName = (p) => p.group ? `${p.group} · ${p.name}` : p.name;
const slug = (s) => String(s).normalize("NFD").replace(/[^\w]+/g, "-").toLowerCase();
// Graph ids must be plain: the layout engine misplaces nodes whose ids contain "." or "/"
const gid = (prefix, key) => `${prefix}-${String(key).replace(/[^\w-]/g, (c) => `_${c.charCodeAt(0)}_`)}`;

function domainState(d) {
  const days = daysUntil(d.expires);
  if (days == null) return "domain";
  return days < 0 ? "expired" : days <= WARN_DAYS ? "soon" : "domain";
}

// --- graph ----------------------------------------------------------------------

function buildElements({ projects, domains, services }) {
  const els = [];
  const added = new Set();
  const add = (el) => { if (!added.has(el.data.id)) { added.add(el.data.id); els.push(el); } };
  const usedResources = new Set(projects.flatMap((p) => p.resources.map((r) => r.key)));

  for (const p of projects) {
    let parent;
    if (p.owner) {
      parent = gid("own", slug(p.owner));
      add({ data: { id: parent, label: p.owner, kind: "owner" } });
    }
    if (p.group) {
      const id = gid("grp", slug(`${p.owner ?? ""} ${p.group}`));
      add({ data: { id, parent, label: p.group, kind: "group" } });
      parent = id;
    }
    const sub = [p.type !== "other" && !p.name.toLowerCase().includes(p.type) ? p.type : null, p.status !== "active" ? p.status : null].filter(Boolean).join(" · ");
    const linked = p.domains.length || p.resources.length;
    add({
      data: { id: gid("prj", p.id), parent, label: sub ? `${p.name}\n${sub}` : p.name, kind: "project", ref: p.id },
      classes: `project${p.status === "active" && linked ? "" : " orphan"}`,
    });
    for (const d of p.domains) add({ data: { id: gid("e", `${d}~${p.id}`), source: gid("dom", d), target: gid("prj", p.id) } });
    for (const r of p.resources) add({ data: { id: gid("e", `${p.id}~${r.key}`), source: gid("prj", p.id), target: gid("res", r.key) } });
  }

  for (const d of Object.values(domains)) {
    const days = daysUntil(d.expires);
    const when = days == null ? "" : days < 0 ? ` · expired ${-days} d ago` : ` · ${days} d`;
    const second = d.error ?? (!d.registrar && !d.expires ? "no registration data"
      : `${d.registrar ?? "registrar unknown"} · ${fmtDate(d.expires)}${when}`);
    add({
      data: { id: gid("dom", d.name), label: `${d.name}\n${second}`, kind: "domain", ref: d.name },
      classes: `${domainState(d)}${d.projects.length ? "" : " orphan"}`,
    });
  }

  for (const s of Object.values(services)) {
    const resources = Object.values(s.resources).filter((r) => usedResources.has(`${s.id}/${r.id}`) || r.declared);
    if (!resources.length && !s.declared) continue;
    const used = resources.some((r) => usedResources.has(`${s.id}/${r.id}`));
    add({
      data: { id: gid("svc", s.id), label: s.name, kind: "service", ref: s.id },
      classes: `service${used ? "" : " orphan"}`,
    });
    for (const r of resources) {
      add({
        data: { id: gid("res", `${s.id}/${r.id}`), parent: gid("svc", s.id), label: r.name, kind: "resource", ref: `${s.id}/${r.id}` },
        classes: `resource${usedResources.has(`${s.id}/${r.id}`) ? "" : " orphan"}`,
      });
    }
  }
  return els;
}

function style() {
  const v = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const box = (k) => ({ "background-color": v(`--${k}-fill`), "border-color": v(`--${k}-stroke`), color: v(`--${k}-text`) });
  return [
    { selector: "node", style: {
      shape: "round-rectangle", label: "data(label)", "text-wrap": "wrap", "text-valign": "center", "text-halign": "center",
      "font-family": "system-ui, sans-serif", "font-size": 12, "line-height": 1.35, width: "label", height: "label",
      padding: "10px", "border-width": 1 } },
    { selector: "node.domain", style: box("domain") },
    { selector: "node.soon", style: box("soon") },
    { selector: "node.expired", style: box("expired") },
    { selector: "node.project", style: box("project") },
    { selector: "node.service, node.resource", style: box("service") },
    { selector: "node.orphan", style: { "border-style": "dashed" } },
    { selector: ":parent", style: {
      "text-valign": "top", "text-halign": "center", "text-margin-y": -4, "font-size": 13, "font-weight": 500, color: v("--fg"),
      "border-color": v("--border"), "border-width": 1, padding: "14px" } },
    { selector: 'node[kind = "owner"]', style: { "background-color": v("--group-1") } },
    { selector: 'node[kind = "group"]', style: { "background-color": v("--group-2"), "font-size": 12, color: v("--muted") } },
    { selector: "node.service:parent", style: { "background-color": v("--service-fill"), "background-opacity": 0.3,
      "border-color": v("--service-stroke"), color: v("--fg"), "font-size": 12 } },
    { selector: "edge", style: { width: 1.2, "line-color": v("--edge"), "curve-style": "bezier" } },
    { selector: ".faded", style: { opacity: 0.12 } },
    { selector: "node.focus", style: { "border-width": 3 } },
    { selector: "edge.hot", style: { width: 2.2, "line-color": v("--project-stroke") } },
  ];
}

const layout = {
  name: "elk",
  nodeDimensionsIncludeLabels: true,
  elk: {
    algorithm: "layered", "elk.direction": "RIGHT",
    "elk.hierarchyHandling": "INCLUDE_CHILDREN",
    "elk.layered.spacing.nodeNodeBetweenLayers": 70,
    "elk.spacing.nodeNode": 18,
    "elk.layered.nodePlacement.strategy": "NETWORK_SIMPLEX",
  },
  nodeLayoutOptions: (n) => n.isParent() ? { "elk.padding": "[top=40,left=16,bottom=16,right=16]" } : {},
};

// Domains and projects get ELK's layered layout. Services are placed by hand
// afterwards, in as many columns as it takes to match the height of the rest:
// left to ELK, dozens of services become one very long column.
async function runLayout() {
  const services = cy.nodes('[kind = "service"]');
  const serviceSide = services.union(services.descendants());
  const rest = cy.elements().not(serviceSide).not(serviceSide.connectedEdges());
  await rest.layout(layout).run().promiseOn("layoutstop");

  const GAP = 16;
  for (const s of services) {
    let y = 0;
    for (const r of s.children()) {
      r.position({ x: 0, y: y + r.outerHeight() / 2 });
      y += r.outerHeight() + 8;
    }
  }

  // Each service goes as close as possible to the projects that use it
  const height = (rest.nonempty() ? rest.boundingBox().h : 0) || 400;
  const center = (s) => {
    const ys = resourcesOf(s).neighborhood('node[kind = "project"]').map((p) => p.position("y"));
    return ys.length ? ys.reduce((a, b) => a + b) / ys.length : Infinity;
  };
  const ordered = services.toArray().map((s) => [s, center(s)]).sort((a, b) => a[1] - b[1]).map(([s]) => s);
  const total = ordered.reduce((sum, s) => sum + s.boundingBox().h + GAP, 0);
  const columns = Math.max(1, Math.ceil(total / Math.max(height, 300)));
  const perColumn = Math.ceil(ordered.length / columns);

  const top = rest.nonempty() ? rest.boundingBox().y1 : 0;
  let x = rest.nonempty() ? rest.boundingBox().x2 + 90 : 0;
  for (let c = 0; c < columns; c++) {
    const column = ordered.slice(c * perColumn, (c + 1) * perColumn);
    const columnHeight = column.reduce((sum, s) => sum + s.boundingBox().h + GAP, -GAP);
    let y = top + Math.max(0, (height - columnHeight) / 2);
    let width = 0;
    for (const s of column) {
      const bb = s.boundingBox();
      if (s.isParent()) s.children().shift({ x: x - bb.x1, y: y - bb.y1 });
      else s.position({ x: x + bb.w / 2, y: y + bb.h / 2 });
      y += bb.h + GAP;
      width = Math.max(width, bb.w);
    }
    x += width + 40;
  }
}

// --- focus ----------------------------------------------------------------------

const resourcesOf = (node) => node.data("kind") === "resource" ? node : node.descendants('node[kind = "resource"]');

function projectsOf(node) {
  const kind = node.data("kind");
  if (kind === "project") return node;
  if (kind === "domain") return node.neighborhood('node[kind = "project"]');
  if (kind === "service" || kind === "resource") return resourcesOf(node).neighborhood('node[kind = "project"]');
  return node.descendants('node[kind = "project"]');
}

function focus(node) {
  focusedId = node.id();
  const kind = node.data("kind");
  const projects = projectsOf(node);
  const serviceSide = kind === "service" || kind === "resource";
  const own = serviceSide ? resourcesOf(node) : cy.collection();
  let related = projects.union(node);
  for (const p of projects) {
    related = related.union(p.neighborhood("node").filter((n) =>
      kind === "domain" ? n.data("kind") === "resource" || n.same(node)
      : serviceSide ? n.data("kind") === "domain" || own.has(n)
      : true));
  }
  const edges = related.edgesWith(related);
  cy.batch(() => {
    cy.elements().addClass("faded").removeClass("focus hot");
    related.union(related.ancestors()).union(edges).removeClass("faded");
    if (!node.isParent()) node.addClass("focus");
    edges.addClass("hot");
  });
  showDetails(node);
}

function clearFocus() {
  focusedId = null;
  cy?.elements().removeClass("faded focus hot");
  $("details").classList.remove("open");
}

// --- panels ---------------------------------------------------------------------

function showDetails(node) {
  const kind = node.data("kind");
  const ref = node.data("ref");
  const extra = (obj) => Object.entries(obj ?? {}).map(([k, v]) => [k, typeof v === "object" ? JSON.stringify(v) : v]);
  const names = (nodes) => nodes.map((n) => fullName(atlas.projects.find((p) => p.id === n.data("ref")))).join(", ");
  let title = node.data("label").split("\n")[0];
  let rows = [];

  if (kind === "project") {
    const p = atlas.projects.find((x) => x.id === ref);
    title = fullName(p);
    rows = [["Type", p.type], ["Status", p.status], ["Owner", p.owner], ["Group", p.group], ["URL", link(p.url)],
            ["Repository", link(p.repo)], ["Resources", p.resources.map((r) => r.notes ? `${r.key} (${esc(r.notes)})` : r.key).join(", ")],
            ["Notes", p.notes], ...extra(p.extra), ["Defined in", link(p.source.fileUrl, p.source.label)]];
  } else if (kind === "domain") {
    const d = atlas.domains[ref];
    const days = daysUntil(d.expires);
    rows = [["Registrar", d.registrar], ["Expires", d.expires && `${fmtDate(d.expires)} (${days} days)`],
            ["Registered", d.registered && fmtDate(d.registered)], ["DNS", d.dns],
            ["Nameservers", d.nameservers?.join(", ")], ["Auto-renew", d.meta.auto_renew == null ? null : d.meta.auto_renew ? "yes" : "no"],
            ["Yearly cost", d.meta.cost != null ? `${d.meta.cost} ${d.meta.currency ?? ""}` : null],
            ["Notes", d.meta.notes], ...extra(d.meta.extra), ["Lookup", d.error]];
  } else if (kind === "service") {
    const s = atlas.services[ref];
    rows = [["Category", CATEGORIES[s.category] ?? s.category], ["Plan", s.plan], ["Account", s.account],
            ["Dashboard", link(s.url)], ["Used by", names(projectsOf(node))], ["Notes", s.notes], ...extra(s.extra)];
  } else if (kind === "resource") {
    const [sid, rid] = ref.split("/");
    const s = atlas.services[sid];
    title = `${s.name} ${s.resources[rid].name}`;
    const usage = atlas.projects.flatMap((p) => p.resources.filter((r) => r.key === ref && r.notes).map((r) => `${fullName(p)}: ${r.notes}`));
    rows = [["Used by", names(projectsOf(node))], ["Usage notes", usage.join("; ")], ["Notes", s.resources[rid].notes],
            ...extra(s.resources[rid].extra)];
  } else {
    rows = [["Projects", names(projectsOf(node))]];
  }

  $("details").querySelector(".body").innerHTML = `<h2>${esc(title)}</h2><dl>` + rows
    .filter(([, val]) => val != null && val !== "")
    .map(([k, val]) => `<dt>${k}</dt><dd>${String(val).startsWith("<a ") ? val : esc(val)}</dd>`).join("") + "</dl>";
  $("warnings").classList.remove("open");
  $("details").classList.add("open");
}

function showWarnings() {
  $("warnings").querySelector(".body").innerHTML = `<h2>Warnings</h2><ul>` + atlas.warnings
    .map((w) => `<li>${esc(w.message)}<small>${w.url ? link(w.url, w.file) : esc(w.file)}</small></li>`).join("") + "</ul>";
  $("details").classList.remove("open");
  $("warnings").classList.toggle("open");
}

function showPartOf(refs) {
  const bar = $("part-of");
  bar.hidden = !refs.length;
  bar.innerHTML = refs.length
    ? `This file is part of ${refs.map((r) => `<a href="?atlas=${encodeURIComponent(r)}">${esc(r)}</a>`).join(" and ")}. Open it to see the whole atlas.`
    : "";
}

// --- loading --------------------------------------------------------------------

async function refresh() {
  if (!source) return;
  $("status").textContent = "Loading…";
  $("error").style.display = "none";
  try {
    atlas = await loadAtlas(source, ctx);
    await Promise.all(Object.values(atlas.domains).map(async (d) => {
      const lookup = d.meta.lookup !== false && !RESERVED_TLDS.has(d.name.split(".").at(-1));
      Object.assign(d, lookup ? await lookupDomain(d.name) : {}, pick(d.meta, ["registrar", "expires", "registered", "dns"]));
    }));
    if (!atlas.files.length) throw new Error(atlas.warnings.map((w) => `${w.file}: ${w.message}`).join("\n"));

    document.title = $("title").textContent = atlas.title;
    showPartOf(atlas.partOf);
    const elements = buildElements(atlas);
    const signature = JSON.stringify(elements);
    if (signature !== drawn || !cy) {
      const keep = focusedId;
      cy?.destroy();
      $("cy").style.visibility = "hidden"; // nodes jump around until the layout settles
      cy = cytoscape({ container: $("cy"), elements, style: style(), minZoom: 0.2, maxZoom: 2.5, wheelSensitivity: 0.3 });
      cy.on("tap", (e) => e.target === cy ? clearFocus() : e.target.isNode() && focus(e.target));
      await runLayout();
      cy.fit(undefined, 30);
      $("cy").style.visibility = "";
      drawn = signature;
      if (keep && cy.getElementById(keep).nonempty()) focus(cy.getElementById(keep)); else clearFocus();
    } else if (focusedId && cy.getElementById(focusedId).nonempty()) {
      showDetails(cy.getElementById(focusedId)); // data behind the panel may have changed
    }

    const domains = Object.values(atlas.domains);
    const expiring = domains.filter((d) => domainState(d) !== "domain").length;
    const resources = new Set(atlas.projects.flatMap((p) => p.resources.map((r) => r.key))).size;
    $("status").textContent = `${atlas.projects.length} projects · ${domains.length} domains · ${resources} resources`
      + (expiring ? ` · ${expiring} domain(s) expiring` : "")
      + ` · ${new Date().toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}`;
    $("warnings-btn").hidden = !atlas.warnings.length;
    $("warnings-btn").firstChild.textContent = `${atlas.warnings.length} warning${atlas.warnings.length === 1 ? "" : "s"}`;
  } catch (e) {
    $("status").textContent = "Error";
    $("error").style.display = "block";
    $("error").textContent = `Could not load ${source}\n\n${e.message}`;
  }
}

function open(ref) {
  source = ref;
  drawn = "";
  const params = new URLSearchParams(location.search);
  params.set("atlas", ref);
  history.replaceState(null, "", `?${params}`);
  $("atlas-input").value = ref;
  focusedId = null;
  refresh();
}

async function init() {
  let config = {};
  try {
    const res = await fetch("api/config");
    if (res.ok) config = await res.json();
  } catch { /* static hosting: no server */ }
  ctx = { proxy: !!config.proxy };

  const fromUrl = new URLSearchParams(location.search).get("atlas");
  source = fromUrl ?? config.source ?? null;
  // A server started with an atlas shows only that atlas; otherwise anyone can open one.
  $("open").hidden = !!config.source && !fromUrl;
  if (source) {
    $("atlas-input").value = source;
    refresh();
  } else {
    $("status").textContent = "Paste the address of an atlas file to start";
    $("atlas-input").focus();
  }
}

$("open").addEventListener("submit", (e) => { e.preventDefault(); open($("atlas-input").value.trim()); });
$("try-example").addEventListener("click", (e) => { e.preventDefault(); open(EXAMPLE); });
$("refresh").addEventListener("click", refresh);
$("fit").addEventListener("click", () => cy?.animate({ fit: { padding: 30 } }, { duration: 250 }));
$("warnings-btn").addEventListener("click", () => atlas && showWarnings());
for (const btn of document.querySelectorAll(".panel .close")) btn.addEventListener("click", () => { clearFocus(); $("warnings").classList.remove("open"); });
document.addEventListener("keydown", (e) => {
  if (e.ctrlKey || e.metaKey || e.altKey || e.target.closest("input, textarea")) return;
  const k = e.key.toLowerCase();
  if (k === "escape") { clearFocus(); $("warnings").classList.remove("open"); }
  else if (k === "r") refresh();
  else if (k === "f") $("fit").click();
  else if (k === "w" && atlas?.warnings.length) showWarnings();
});
document.addEventListener("visibilitychange", () => document.visibilityState === "visible" && refresh());
matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => cy?.style(style()));
window.stackatlas = { get cy() { return cy; }, get atlas() { return atlas; } }; // for debugging in the console
init();
