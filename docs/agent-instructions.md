# Set up stackatlas in a repository

These are instructions for an AI coding agent working in a repository. Your
task: create a `stackatlas.yaml` at the root of the repository, describing what
it runs and what it depends on, for [stackatlas](https://github.com/PabloDinella/stackatlas),
and make sure it stays up to date.

(People: ask your agent to follow this file. See the
[README](../README.md#quick-start) for the one-line prompt.)

## Reference

- Format (JSON Schema): https://raw.githubusercontent.com/PabloDinella/stackatlas/main/schema/stackatlas.schema.json
- Known services and their resource ids: https://raw.githubusercontent.com/PabloDinella/stackatlas/main/web/catalog.js
- Documentation and examples: https://github.com/PabloDinella/stackatlas#describing-a-repository

Read the schema and the catalog first if you can fetch them. If you can't,
follow the shape of the example at the end.

## 1. Find out what the repository runs

Look at the code and configuration rather than guessing. Useful places:
dependency manifests (package.json, requirements.txt, pyproject.toml, go.mod,
Gemfile, composer.json, pubspec.yaml…), deployment configuration (vercel.json,
netlify.toml, wrangler.toml, fly.toml, firebase.json, supabase/, render.yaml,
railway.json, Dockerfile, docker-compose files, Coolify or Kubernetes
manifests, Terraform), CI workflows, `.env.example` and other environment
templates (variable names only), mobile app configuration (app.json, eas.json,
capacitor.config.*, Android and iOS project files), and the README.

Work out:

- **Projects.** Each deployable part is one project: a website, a web app, an
  API, a background service, a mobile app. A monorepo usually has several.
  Give each a short `name`, a `type` (website, app, api, service, library,
  other) and a `status` (active, planned, paused, archived). Add its public
  `url` when you can find it.
- **Domains.** Registrable domains each project is served on, e.g.
  `example.com`, not `app.example.com`. Look in deployment configuration,
  CNAME files, routes and the README.
- **Resources.** What each project uses, written as `service/resource`, e.g.
  `supabase/auth`, `cloudflare/r2`, `stripe/billing`, `vercel/hosting`. Be
  specific: say which parts of a service are used, not just the service. Use
  the ids from the catalog. When a service or resource isn't in the catalog,
  declare it under `services:` (see the example). Add `notes` to a resource
  when its role isn't obvious (for example, "receipt photos" on a storage
  bucket).

## 2. Ask the user what you can't find out

Before writing the file, ask the user in one go, and only about what the code
doesn't tell you:

- `owner`: who the projects are for (the user, a client, an organization);
- `group`: the product name that groups the projects, if there is one;
- domains, URLs or statuses you couldn't determine;
- whether a central atlas includes this repository; if so, add its reference
  as `atlas:` (optional; e.g. `atlas: github:user/my-atlas/atlas.yaml`);
- anything you inferred but aren't sure about.

## 3. Write `stackatlas.yaml`

- Put it at the repository root, starting with this line so editors can check
  it:
  `# yaml-language-server: $schema=https://raw.githubusercontent.com/PabloDinella/stackatlas/main/schema/stackatlas.schema.json`
- Put `owner` and `group` at the top level when all projects share them.
- Never include secrets, tokens, passwords, API keys or private e-mail
  addresses. stackatlas files are often public.
- Keep it short: no comments that restate the obvious.
- If you can, validate the file against the schema. Read the YAML with the
  YAML 1.2 core schema so that dates stay strings.

## 4. Keep it up to date

Add this section to the repository's agent instructions: `AGENTS.md` if it
exists, otherwise `CLAUDE.md` if it exists, otherwise create `AGENTS.md`. If
both exist, put it in `AGENTS.md` and make sure `CLAUDE.md` points to it.
Adapt the wording to the file's style if needed, but keep the meaning:

```markdown
## stackatlas.yaml

`stackatlas.yaml` describes what this repository runs: its projects, their
domains and the services they use (format:
https://github.com/PabloDinella/stackatlas). Keep it accurate. In the same
change that adds, removes or replaces a service, SDK, hosting or deployment
target, storage bucket, database, payment or e-mail provider, domain, or a
deployable part of this repository, update `stackatlas.yaml` to match.
```

## 5. Report back

Show the user the final `stackatlas.yaml`, list what you inferred and how sure you
are, and say which instructions file you changed.

## Example

```yaml
# yaml-language-server: $schema=https://raw.githubusercontent.com/PabloDinella/stackatlas/main/schema/stackatlas.schema.json
owner: Own products
group: Receiptly

projects:
  - name: Web app
    type: app
    url: https://receiptly.example
    domains: [receiptly.example]
    resources:
      - vercel/hosting
      - clerk/auth
      - neon/postgres
      - stripe/checkout
      - mailcoach/campaigns
      - use: cloudflare/r2
        notes: receipt photos and generated PDFs

  - name: Mobile app
    type: app
    status: planned
    resources:
      - app-store/store
      - google-play/store

services:
  # Only for services or resources that aren't in the catalog
  mailcoach:
    name: Mailcoach
    category: email
    resources:
      campaigns: Campaigns
```
