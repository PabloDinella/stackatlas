// Command stackatlas serves the stackatlas viewer.
//
// The viewer (web/) does all the work in the browser: it reads the atlas file,
// follows includes, looks up domains over RDAP and draws the graph. This server
// only adds what a static page cannot do:
//
//   - tells the viewer which atlas to open (the command-line argument);
//   - serves a local atlas directory, when the argument is a path;
//   - proxies reads from GitHub and GitLab, adding tokens so private
//     repositories work without exposing the tokens to the browser.
package main

import (
	"embed"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"io/fs"
	"log"
	"net/http"
	"net/url"
	"os"
	"path"
	"path/filepath"
	"regexp"
	"strings"
	"time"
)

//go:embed web
var webFiles embed.FS

var version = "dev"

const maxFileSize = 2 << 20 // 2 MiB is plenty for a YAML manifest

func main() {
	addr := flag.String("addr", envOr("STACKATLAS_ADDR", ":8080"), "address to listen on")
	showVersion := flag.Bool("version", false, "print the version and exit")
	webDir := flag.String("web", "", "serve the viewer from this directory instead of the embedded copy (for development)")
	flag.Usage = func() {
		fmt.Fprintf(flag.CommandLine.Output(), `Usage: stackatlas [flags] [atlas]

atlas is the file the viewer opens, one of:
  github:owner/repo[/path/file.yaml][@ref]
  gitlab:group/project[@ref]
  https://example.com/atlas.yaml
  ./path/to/atlas.yaml (or a directory containing atlas.yaml)

Without it, the viewer asks for an address.

Environment:
  GITHUB_TOKEN             token used for github.com reads (private repositories)
  GITLAB_TOKEN             token used for GitLab reads (private repositories)
  STACKATLAS_GITLAB_HOSTS  extra self-hosted GitLab hosts, comma-separated
  STACKATLAS_SOURCE        atlas, when not given as an argument
  STACKATLAS_ADDR          address to listen on (default :8080)
  STACKATLAS_POSTHOG_KEY   PostHog project key, to turn on usage analytics (off by default)
  STACKATLAS_POSTHOG_HOST  PostHog host (default https://us.i.posthog.com)

Flags:
`)
		flag.PrintDefaults()
	}
	flag.Parse()
	if *showVersion {
		fmt.Println(version)
		return
	}

	source := flag.Arg(0)
	if source == "" {
		source = os.Getenv("STACKATLAS_SOURCE")
	}

	mux := http.NewServeMux()

	web, _ := fs.Sub(webFiles, "web")
	if *webDir != "" {
		web = os.DirFS(*webDir)
	}
	mux.Handle("/", noCache(http.FileServer(http.FS(web))))

	if source != "" && !isRemote(source) {
		dir, file, err := localAtlas(source)
		if err != nil {
			log.Fatal(err)
		}
		mux.Handle("/local/", http.StripPrefix("/local/", noCache(http.FileServer(http.Dir(dir)))))
		source = "/local/" + file
		log.Printf("serving local atlas %s", filepath.Join(dir, file))
	}

	p := newProxy()
	mux.HandleFunc("/api/config", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]any{
			"source":      source,
			"proxy":       true,
			"version":     version,
			"gitlabHosts": p.gitlabHosts,
			// Whether tokens are set, never their values
			"tokens": map[string]bool{"github": p.githubToken != "", "gitlab": p.gitlabToken != ""},
			// Optional usage analytics; off unless set
			"posthogKey":  os.Getenv("STACKATLAS_POSTHOG_KEY"),
			"posthogHost": os.Getenv("STACKATLAS_POSTHOG_HOST"),
		})
	})
	mux.Handle("/api/fetch", p)

	log.Printf("GitHub token: %s, GitLab token: %s", setOrNot(p.githubToken), setOrNot(p.gitlabToken))
	log.Printf("stackatlas %s listening on %s", version, *addr)
	srv := &http.Server{Addr: *addr, Handler: mux, ReadHeaderTimeout: 10 * time.Second}
	log.Fatal(srv.ListenAndServe())
}

func setOrNot(token string) string {
	if token == "" {
		return "not set"
	}
	return "set"
}

func envOr(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func isRemote(source string) bool {
	for _, prefix := range []string{"github:", "gitlab:", "https://", "http://"} {
		if strings.HasPrefix(source, prefix) {
			return true
		}
	}
	return false
}

// localAtlas splits a local atlas path into the directory to serve and the
// file inside it. A directory resolves to its atlas.yaml or stackatlas.yaml.
func localAtlas(source string) (dir, file string, err error) {
	abs, err := filepath.Abs(source)
	if err != nil {
		return "", "", err
	}
	info, err := os.Stat(abs)
	if err != nil {
		return "", "", err
	}
	if !info.IsDir() {
		return filepath.Dir(abs), filepath.Base(abs), nil
	}
	for _, name := range []string{"atlas.yaml", "atlas.yml", "stackatlas.yaml", "stackatlas.yml"} {
		if _, err := os.Stat(filepath.Join(abs, name)); err == nil {
			return abs, name, nil
		}
	}
	return "", "", fmt.Errorf("%s has no atlas.yaml or stackatlas.yaml", abs)
}

func noCache(h http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-store")
		h.ServeHTTP(w, r)
	})
}

// proxy fetches YAML files from GitHub and GitLab on behalf of the viewer.
//
// It only reads .yaml/.yml files from known hosts, so a token given to it
// cannot be used through the proxy to read anything else, such as source code.
type proxy struct {
	client      *http.Client
	githubToken string
	gitlabToken string
	gitlabHosts []string
}

var gitlabFilePath = regexp.MustCompile(`^/api/v4/projects/[^/]+/repository/files/([^/]+)/raw$`)

func newProxy() *proxy {
	hosts := []string{"gitlab.com"}
	for _, h := range strings.Split(os.Getenv("STACKATLAS_GITLAB_HOSTS"), ",") {
		if h = strings.TrimSpace(h); h != "" {
			hosts = append(hosts, h)
		}
	}
	p := &proxy{
		githubToken: os.Getenv("GITHUB_TOKEN"),
		gitlabToken: os.Getenv("GITLAB_TOKEN"),
		gitlabHosts: hosts,
	}
	p.client = &http.Client{
		Timeout: 15 * time.Second,
		CheckRedirect: func(req *http.Request, via []*http.Request) error {
			// Never follow a redirect off the original host: the token headers
			// would go with it.
			if req.URL.Host != via[0].URL.Host {
				return errors.New("redirect to another host refused")
			}
			return nil
		},
	}
	return p
}

func (p *proxy) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	target, err := url.Parse(r.URL.Query().Get("url"))
	if err != nil || target.Scheme != "https" {
		http.Error(w, "url must be an https URL", http.StatusBadRequest)
		return
	}

	req, _ := http.NewRequestWithContext(r.Context(), http.MethodGet, target.String(), nil)
	token := "none"
	switch {
	case target.Host == "raw.githubusercontent.com" && isYAML(target.Path):
		if p.githubToken != "" {
			req.Header.Set("Authorization", "Bearer "+p.githubToken)
			token = "github"
		}
	case p.isGitlab(target.Host) && p.isGitlabYAML(target.EscapedPath()):
		if p.gitlabToken != "" {
			req.Header.Set("PRIVATE-TOKEN", p.gitlabToken)
			token = "gitlab"
		}
	default:
		http.Error(w, "only .yaml files on GitHub or GitLab can be fetched", http.StatusForbidden)
		return
	}

	resp, err := p.client.Do(req)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadGateway)
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		log.Printf("fetch %s: %d (token: %s)", target.Redacted(), resp.StatusCode, token)
	}
	w.Header().Set("Content-Type", "text/plain; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("X-Stackatlas-Token", token) // which token went with the request, so errors can say so
	w.WriteHeader(resp.StatusCode)
	io.Copy(w, io.LimitReader(resp.Body, maxFileSize))
}

func (p *proxy) isGitlab(host string) bool {
	for _, h := range p.gitlabHosts {
		if host == h {
			return true
		}
	}
	return false
}

func (p *proxy) isGitlabYAML(escapedPath string) bool {
	m := gitlabFilePath.FindStringSubmatch(escapedPath)
	if m == nil {
		return false
	}
	file, err := url.PathUnescape(m[1])
	return err == nil && isYAML(file)
}

func isYAML(p string) bool {
	ext := strings.ToLower(path.Ext(p))
	return ext == ".yaml" || ext == ".yml"
}
