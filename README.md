# stackatlas

A map of everything you run: your projects, the domains they live on, and the
services (and which parts of each service) they use.

Each repository describes itself in a small `stackatlas.yaml`. A central atlas
file pulls those together — from GitHub, GitLab, or anywhere on the web — and
stackatlas draws the whole picture as an interactive graph:

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

Open a public atlas in the hosted viewer, no install needed:

```
https://pablodinella.github.io/stackatlas/?atlas=github:PabloDinella/stackatlas/examples/atlas.yaml
```

Or run it yourself:

```bash
docker run --rm -p 8080:8080 ghcr.io/pablodinella/stackatlas github:PabloDinella/stackatlas/examples/atlas.yaml
```

and open <http://localhost:8080>.

## Describing a repository

Add a `stackatlas.yaml` at the root of a repository:

```yaml
# yaml-language-server: $schema=https://raw.githubusercontent.com/PabloDinella/stackatlas/main/schema/stackatlas.schema.json
owner: Jane              # who the projects are for
group: Recipe Box        # projects in a group are drawn together

projects:
  - name: Website
    type: website        # website | app | api | service | library | other
    url: https://example.com
    domains: [example.com]
    resources:
      - vercel/hosting
      - supabase/auth
      - supabase/database
      - use: cloudflare/r2
        notes: recipe photos

  - name: App
    type: app
    status: planned      # active | planned | paused | archived
    resources:
      - firebase/messaging
      - google-play/store
```

`owner` and `group` set defaults for every project in the file; a project can
override them. The first line lets editors with the YAML language server (e.g.
VS Code's YAML extension) autocomplete and check the file.

## The central atlas

The atlas you open is just another file of the same format, usually with
`include:` entries pointing at repositories:

```yaml
title: Jane's projects

include:
  - github:jane/recipe-box                     # reads stackatlas.yaml at the root
  - github:jane/monorepo/apps/web/stackatlas.yaml@main
  - gitlab:choir/website                       # gitlab.com
  - { gitlab: team/site, host: git.example.com, path: docs/stackatlas.yaml }
  - https://example.com/some/stackatlas.yaml
  - other-file.yaml                            # relative to this file

projects:
  # Projects without a repository of their own can live right here
  - name: Choir website
    owner: Community Choir
    domains: [example.org]
    resources: [hetzner/vps, coolify/deploy, cloudflare/dns]

services:
  # Add services the built-in catalog doesn't know, or override its entries
  home-lab:
    name: Home lab
    category: infrastructure
    resources:
      server: { name: Mini PC }

domains:
  # Facts RDAP can't know
  example.org: { auto_renew: true, cost: 10, currency: USD }
```

Includes can nest. Files that fail to load, unknown resources and other
problems show up under **Warnings** instead of breaking the map.

See [`examples/`](examples) for a complete example and
[`schema/stackatlas.schema.json`](schema/stackatlas.schema.json) for every field.

### Built-in services

`cloudflare`, `supabase`, `firebase`, `vercel`, `netlify`, `github`, `gitlab`,
`aws`, `hetzner`, `digitalocean`, `coolify`, `fly-io`, `render`, `google-play`
and `app-store`, each with their main resources. See
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

## Development

```bash
go run . -web web examples    # serves web/ from disk: edit and reload
go test ./...
```

## License

[MIT](LICENSE). Bundled libraries keep their own licenses; see
[THIRD_PARTY.md](THIRD_PARTY.md).
