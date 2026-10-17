// Run with: node --test test/*.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

globalThis.location = { href: "file:///", origin: "file://" };
globalThis.fetch = async (url) => {
  try { return { ok: true, status: 200, text: async () => readFileSync(new URL(url), "utf8") }; }
  catch { return { ok: false, status: 404, text: async () => "" }; }
};
const { loadAtlas } = await import("../web/atlas.js");

function atlas(files) {
  const dir = mkdtempSync(join(tmpdir(), "stackatlas-"));
  for (const [name, text] of Object.entries(files)) writeFileSync(join(dir, name), text);
  return loadAtlas(pathToFileURL(join(dir, "atlas.yaml")).href);
}

test("the central atlas wins conflicts, then the first include", async () => {
  const a = await atlas({
    "atlas.yaml": "include: [a.yaml, b.yaml]\nservices: { stripe: { plan: Central } }\ndomains: { x.example: { cost: 1 } }\n",
    "a.yaml": "services: { stripe: { plan: A, account: a } }\ndomains: { x.example: { cost: 2, notes: A } }\n",
    "b.yaml": "services: { stripe: { plan: B, account: b } }\ndomains: { x.example: { notes: B } }\n",
  });
  assert.equal(a.services.stripe.plan, "Central");
  assert.equal(a.services.stripe.account, "a");
  assert.equal(a.domains["x.example"].meta.cost, 1);
  assert.equal(a.domains["x.example"].meta.notes, "A");
});

test("services can be declared or extended anywhere", async () => {
  const a = await atlas({
    "atlas.yaml": "include: [repo.yaml]\nprojects:\n  - name: P\n    resources: [mailcoach/campaigns, cloudflare/queues]\n",
    "repo.yaml": "services:\n  mailcoach: { name: Mailcoach, resources: { campaigns: Campaigns } }\n  cloudflare: { resources: { queues: Queues } }\n",
  });
  assert.equal(a.services.mailcoach.resources.campaigns.name, "Campaigns");
  assert.equal(a.services.cloudflare.resources.queues.name, "Queues");
  assert.ok(a.services.cloudflare.resources.r2, "built-in resources are kept");
  assert.deepEqual(a.warnings, []);
});

test("unknown services give one warning and are still drawn", async () => {
  const a = await atlas({ "atlas.yaml": "projects: [{ name: P, resources: [supabse/auth] }]\n" });
  assert.equal(a.warnings.length, 1);
  assert.match(a.warnings[0].message, /unknown service "supabse"/);
  assert.equal(a.projects[0].resources[0].key, "supabse/auth");
});

test("old or alternative names are read as the current ones", async () => {
  const a = await atlas({
    "atlas.yaml": [
      "projects:",
      "  - name: P",
      "    repository: https://example.com/repo",
      "    description: hello",
      "    domain: p.example",
      "    uses: [fly/apps]",
      "domains:",
      "  p.example: { expiry: 2030-01-01, autorenew: true }",
    ].join("\n"),
  });
  const [p] = a.projects;
  assert.equal(p.repo, "https://example.com/repo");
  assert.equal(p.notes, "hello");
  assert.deepEqual(p.domains, ["p.example"]);
  assert.equal(p.resources[0].key, "fly-io/apps");
  assert.equal(a.domains["p.example"].meta.expires, "2030-01-01", "dates stay strings");
  assert.equal(a.domains["p.example"].meta.auto_renew, true);
  assert.ok(a.warnings.every((w) => /: read (service )?"/.test(w.message)), JSON.stringify(a.warnings));
});

test("the current name wins over an alias given alongside it", async () => {
  const a = await atlas({ "atlas.yaml": "projects: [{ name: P, description: old, notes: new }]\n" });
  assert.equal(a.projects[0].notes, "new");
});

test("unknown fields are ignored with a warning; x- fields are kept", async () => {
  const a = await atlas({ "atlas.yaml": "colour: blue\nprojects: [{ name: P, x-mrr: 100, flavour: lime }]\n" });
  assert.deepEqual(a.projects[0].extra, { mrr: 100 });
  assert.equal(a.warnings.length, 2);
  assert.ok(a.warnings.every((w) => /unknown field/.test(w.message)));
});

test("a federated file opened on its own works and points to its atlas", async () => {
  const a = await atlas({ "atlas.yaml": "atlas: github:someone/my-atlas/atlas.yaml\nprojects: [{ name: P }]\n" });
  assert.equal(a.projects.length, 1);
  assert.deepEqual(a.partOf, ["github:someone/my-atlas/atlas.yaml"]);
});

test("failed files are listed, with a reason that says what to do", async () => {
  const realFetch = globalThis.fetch;
  const answers = { "github:a/missing": [404, "none"], "gitlab:g/no-access": [404, "gitlab"], "gitlab:g/expired": [401, "gitlab"], "github:a/scope": [403, "github"] };
  globalThis.fetch = async (url) => {
    const ref = Object.keys(answers).find((r) => decodeURIComponent(url).includes(r.split(":")[1].split("/")[1]));
    if (url.startsWith("file:")) return realFetch(url);
    const [status, token] = answers[ref];
    const body = status === 403 ? '{"error":"insufficient_granular_scope","error_description":"Needs [Repository: Read]."}' : "";
    return { ok: false, status, headers: { get: () => token }, text: async () => body };
  };
  try {
    const dir = mkdtempSync(join(tmpdir(), "stackatlas-"));
    writeFileSync(join(dir, "atlas.yaml"), `include: [${Object.keys(answers).join(", ")}]\n`);
    const a = await loadAtlas(pathToFileURL(join(dir, "atlas.yaml")).href, { proxy: true, tokens: { github: false, gitlab: true } });
    const why = Object.fromEntries(a.failed.map((f) => [f.label, f.message]));
    assert.equal(a.failed.length, 4);
    assert.match(why["github:a/missing"], /GITHUB_TOKEN isn't set/);
    assert.match(why["gitlab:g/no-access"], /token can access this repository/);
    assert.match(why["gitlab:g/expired"], /rejected the token/);
    assert.match(why["github:a/scope"], /Contents: read-only/);
    assert.match(why["github:a/scope"], /GitHub says: "Needs \[Repository: Read\]\."/);
    assert.ok(a.failed.every((f) => f.includedFrom));
  } finally {
    globalThis.fetch = realFetch;
  }
});
