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

Open any public atlas in the [hosted viewer](https://pablodinella.github.io/stackatlas/),
no install needed: paste its address, or link to it with `?atlas=`, like the
[example](https://pablodinella.github.io/stackatlas/?atlas=github:PabloDinella/stackatlas/examples/atlas.yaml).

Or run it yourself:

```bash
docker run --rm -p 8080:8080 ghcr.io/pablodinella/stackatlas github:PabloDinella/stackatlas/examples/atlas.yaml
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

**Let an AI agent write it.** Paste [this prompt](docs/agent-prompt.md) into
Claude Code, Codex, Cursor or another coding agent in your repository. It
inspects the code, writes `stackatlas.yaml`, and adds a rule to `AGENTS.md` (or
`CLAUDE.md`) so the file is updated whenever the project's services change.

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
| `GITLAB_TOKEN` | Read private GitLab repositories. A token with the `read_api` scope. |
| `STACKATLAS_GITLAB_HOSTS` | Self-hosted GitLab hosts, comma-separated (gitlab.com is always allowed). |
| `STACKATLAS_SOURCE` | The atlas to open, if not given as an argument. |
| `STACKATLAS_ADDR` | Address to listen on (default `:8080`). |

**Security.** To read private repositories, the server proxies requests to
GitHub and GitLab with your tokens. It only fetches `.yaml`/`.yml` files from
those hosts, so the tokens cannot be used through it to read source code, but
anyone who can reach the server can read the YAML files your tokens can.
Scope the tokens to the repositories in your atlas, and keep the server on
your private network (or behind authentication).

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
```

## License

[MIT](LICENSE). Bundled libraries keep their own licenses; see
[THIRD_PARTY.md](THIRD_PARTY.md).
