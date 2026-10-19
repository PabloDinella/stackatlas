# stackatlas

A map of everything you run: your projects, the domains they live on, and the
services (and which parts of each service) they use.

Each repository describes itself in a small `stackatlas.yaml`. A central atlas
file pulls those together — from GitHub, GitLab, or anywhere on the web — and
stackatlas draws the whole picture as an interactive graph.

**[▶ See a live example](https://pablodinella.github.io/stackatlas/?atlas=github:PabloDinella/stackatlas/examples/atlas.yaml)**: an indie developer with four micro-SaaS
products, a newsletter, a shared VPS, a freelance client and a retired product.
Its files are in [`examples/`](examples).


- **Click anything to focus on it.** A domain shows the project behind it and
  what that project uses; a service shows every project that depends on it.
- **Domains look themselves up.** Registrar, expiry date and DNS provider come
  from [RDAP](https://about.rdap.org/), so dates are never stale. Domains that
  expire within 60 days turn amber.
- **Resources, not just services.** Say a project uses `supabase/auth` and
  `firebase/storage`, not merely "Supabase" and "Firebase".
- **Tiny to run.** One binary or a ~20 MB container using a few MB of memory.
  Everything happens in your browser; the server only adds access to private
  repositories.

## Quick start

**1. Describe a repository.** Ask your coding agent (Claude Code, Codex,
Cursor…), in the repository:

```text
Set up stackatlas here: https://raw.githubusercontent.com/PabloDinella/stackatlas/main/docs/agent-instructions.md
```

It writes `stackatlas.yaml` and makes sure future changes keep it up to date.
Prefer writing it yourself? See [below](#describing-a-repository).

**2. See it.** Open `https://pablodinella.github.io/stackatlas/?atlas=github:you/your-repo`,
or run it yourself with Docker:

```bash
docker run --rm -p 8080:8080 ghcr.io/pablodinella/stackatlas github:you/your-repo
```

and open <http://localhost:8080>.

## Describing a repository

Add a `stackatlas.yaml` at the root of a repository:

```yaml
# yaml-language-server: $schema=https://raw.githubusercontent.com/PabloDinella/stackatlas/main/schema/stackatlas.schema.json
owner: Own products      # who the projects are for
group: Receiptly         # projects in a group are drawn together

projects:
  - name: Web app
    type: app            # website | app | api | service | library | other
    url: https://receiptly.example
    domains: [receiptly.example]
    resources:
      - vercel/hosting
      - clerk/auth
      - neon/postgres
      - stripe/checkout
      - use: cloudflare/r2
        notes: receipt photos and generated PDFs

  - name: Mobile app
    type: app
    status: planned      # active | planned | paused | archived
    resources:
      - app-store/store
      - google-play/store
```

`owner` and `group` set defaults for every project in the file; a project can
override them. The first line lets editors with the YAML language server (e.g.
VS Code's YAML extension) autocomplete and check the file.

A repository's file works on its own: open it in the viewer to see just that
repository. To find the bigger picture from there, it can point back to the
atlas that includes it:

```yaml
atlas: github:you/your-atlas/atlas.yaml   # optional; a list is fine too
```

The viewer then shows a link to it. If that atlas is private, people without
access see the link but can't open it, and a public repository pointing to it
reveals the private atlas's name.

Fields starting with `x-` are yours (`x-mrr: 1,840 USD`, `x-team: growth`):
stackatlas never interprets them and shows them in the details panel.

## The central atlas

The atlas you open is just another file of the same format, usually with
`include:` entries pointing at repositories:

```yaml
title: Sam's products

include:
  - github:sam/receiptly                       # reads stackatlas.yaml at the root
  - github:sam/monorepo/apps/web/stackatlas.yaml@main
  - gitlab:sam/pingwise                        # gitlab.com
  - { gitlab: team/site, host: git.example.com, path: docs/stackatlas.yaml }
  - https://example.com/some/stackatlas.yaml
  - other-file.yaml                            # relative to this file

projects:
  # Projects without a repository of their own can live right here
  - name: Website
    owner: Northwind Bakery (client)
    domains: [northwindbakery.example]
    resources: [netlify/hosting, cloudflare/dns]

services:
  # Add facts about built-in services, or declare services it doesn't know
  stripe: { account: billing@example.com, plan: Standard }
  home-lab:
    name: Home lab
    category: infrastructure
    resources:
      server: { name: Mini PC }

domains:
  # Facts RDAP can't know
  northwindbakery.example: { auto_renew: false, cost: 12, currency: USD, notes: Paid by the client }
```

Includes can nest. Files that fail to load, unknown resources and other
problems show up under **Warnings** instead of breaking the map.

Registrar, expiry and DNS provider are looked up over RDAP. Anything under
`domains:` (`registrar`, `expires`, `registered`, `dns`) overrides the lookup,
and `lookup: false` skips it. Reserved TLDs such as `.example`, `.test` or
`.internal` are never looked up.

See [`examples/`](examples) for a complete example and
[`schema/stackatlas.schema.json`](schema/stackatlas.schema.json) for every field.

### Services and resources

Projects list what they use as `service/resource`. A service doesn't have to
be in the built-in catalog: any file — a repository's own `stackatlas.yaml`
or the central atlas — can declare one under `services:`.

```yaml
projects:
  - name: Web app
    resources:
      - mailcoach/campaigns
      - home-lab/server
      - cloudflare/queues

services:
  mailcoach:                       # a service the catalog doesn't know
    name: Mailcoach
    category: email                # see the schema for the categories
    url: https://app.mailcoach.app
    resources:
      campaigns: Campaigns         # short form: just the display name
  home-lab:
    name: Home lab
    category: infrastructure
    resources:
      server: { name: Mini PC, notes: Proxmox }
  cloudflare:                      # extend a built-in service
    resources:
      queues: Queues
```

- **Declarations are atlas-wide.** A service declared in one file can be used
  by projects in any other file, so shared things (a home-lab server, a
  company account) are best declared once, in the central atlas.
- **Declarations merge.** Declaring a built-in service adds to it: new
  resources join the catalog's, and fields such as `plan` or `account` are
  filled in. When two files set the same field, the central atlas wins; between
  included files, the one listed first in `include:` wins. The same goes for
  `domains:`.
- **Undeclared references still show up**, with a warning. `mailcoach/campaigns`
  without a declaration is drawn as a service named "mailcoach"; the warning
  is there to catch typos such as `supabse/auth`.

### Built-in services

Hosting and infrastructure: `cloudflare`, `vercel`, `netlify`, `github`,
`gitlab`, `aws`, `hetzner`, `digitalocean`, `coolify`, `fly-io`, `render`,
`railway`. Backend: `supabase`, `firebase`, `neon`, `upstash`, `clerk`.
Payments: `stripe`, `lemon-squeezy`, `paddle`. Email: `resend`, `postmark`.
Monitoring and analytics: `sentry`, `betterstack`, `plausible`, `posthog`.
AI: `openai`, `anthropic`. Distribution: `google-play`, `app-store`. Each comes
with its main resources. See
[`web/catalog.js`](web/catalog.js) for the ids, and send a pull request to add
more.

## Compatibility

Atlas files have no version number, and don't need one: the format only grows.

- **Fields are only ever added**, always optional, and never removed or given
  a new meaning. A file written today stays valid.
- **The viewer reads what it can.** Fields it doesn't know are ignored (with a
  warning, in case they are typos), so an older stackatlas reading a newer
  file still draws everything it understands.
- **Renames keep the old name working.** Older or common alternative names are
  read as the current ones, with a gentle warning: `repository` as `repo`,
  `description` as `notes`, `fly/apps` as `fly-io/apps`, and so on. Service
  and resource ids in the catalog never change.
- **The schema URL always describes the latest format**, so editors and CI
  check against it. Your own data goes in `x-` fields, which the schema
  always accepts.

## Self-hosting

Run stackatlas on your own machine (a home lab, say) to read **private**
repositories. Give it tokens through the environment; they stay on the server
and never reach the browser.

```bash
docker run -d -p 8080:8080 \
  -e GITHUB_TOKEN -e GITLAB_TOKEN \
  ghcr.io/pablodinella/stackatlas github:you/your-private-atlas/atlas.yaml
```

The atlas can also live on disk:

```bash
docker run -d -p 8080:8080 -v ./atlas:/atlas:ro ghcr.io/pablodinella/stackatlas /atlas
```

There is a [`compose.yaml`](compose.yaml) to start from. Without Docker,
download a binary from the [releases](https://github.com/PabloDinella/stackatlas/releases)
and run `stackatlas <atlas>`.

| Variable | Purpose |
|---|---|
| `GITHUB_TOKEN` | Read private GitHub repositories. A [fine-grained token](https://github.com/settings/personal-access-tokens) with read-only **Contents** access to the repositories in your atlas is enough. |
| `GITLAB_TOKEN` | Read private GitLab repositories. A fine-grained token with the **Repository: Read** project permission on the projects in your atlas, or a legacy token with the `read_api` scope. |
| `STACKATLAS_GITLAB_HOSTS` | Self-hosted GitLab hosts, comma-separated (gitlab.com is always allowed). |
| `STACKATLAS_SOURCE` | The atlas to open, if not given as an argument. |
| `STACKATLAS_ADDR` | Address to listen on (default `:8080`). |
| `STACKATLAS_POSTHOG_KEY` | Turns on [usage analytics](#privacy) with your own PostHog project. Off when unset. |
| `STACKATLAS_POSTHOG_HOST` | PostHog host, e.g. `https://eu.i.posthog.com` (default `https://us.i.posthog.com`). |

**Files not loading?** They show up in the map as red *Not loaded* boxes; click
one to see why and what to do. The server log (`docker logs <container>`)
says at startup whether each token is set, and logs every failed read with
whether a token went with it. Note that `-e GITLAB_TOKEN` only passes the
variable on if it is exported in your shell, and that GitLab answers *404 Not
Found* (not 403) when a token can't access a private project.

**Security.** To read private repositories, the server proxies requests to
GitHub and GitLab with your tokens. It only fetches `.yaml`/`.yml` files from
those hosts, so the tokens cannot be used through it to read source code, but
anyone who can reach the server can read the YAML files your tokens can.
Scope the tokens to the repositories in your atlas, and keep the server on
your private network (or behind authentication).

## Privacy

The [hosted viewer](https://pablodinella.github.io/stackatlas/) counts how it
is used with [PostHog](https://posthog.com), to learn what to improve. It sends
page views and a few events (an atlas loaded, a node clicked, warnings opened)
with **counts and kinds only**: how many projects, domains, files and warnings,
whether the atlas came from GitHub, GitLab or a URL. It never sends the atlas
address or the names of repositories, projects, services or domains, and the
page URL is sent without its `?atlas=` part. There are no cookies and no
session recordings, and Do Not Track or Global Privacy Control turn it off.

Self-hosted stackatlas sends nothing, unless you set `STACKATLAS_POSTHOG_KEY`
to collect the same data in your own PostHog project.

## How it works

The viewer in [`web/`](web) is a static page: it reads the atlas, follows
includes, queries RDAP and draws the graph with
[Cytoscape.js](https://js.cytoscape.org/) and [ELK](https://eclipse.dev/elk/).
That is why it can be hosted on GitHub Pages for public atlases. The Go server
([`main.go`](main.go)) embeds the viewer and adds three things: the atlas to
open, serving a local atlas directory, and the token-adding proxy.

### Validating in CI

To check a `stackatlas.yaml` in a pull request, validate it against
[the schema](schema/stackatlas.schema.json). Read the YAML with the YAML 1.2
core schema, so dates stay strings, as [`scripts/validate.mjs`](scripts/validate.mjs)
does:

```bash
npm install --no-save ajv@8 ajv-formats@3 && node scripts/validate.mjs path/to/files
```

## Development

```bash
go run . -web web examples    # serves web/ from disk: edit and reload
go test ./...
node --test test/*.test.mjs   # the viewer's atlas loading
```

## License

[MIT](LICENSE). Bundled libraries keep their own licenses; see
[THIRD_PARTY.md](THIRD_PARTY.md).
