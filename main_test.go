package main

import (
	"net/http"
	"net/http/httptest"
	"net/url"
	"testing"
)

func TestProxyRefusesWhatIsNotAYAMLFileOnGitHubOrGitLab(t *testing.T) {
	p := newProxy()
	for _, target := range []string{
		"https://raw.githubusercontent.com/owner/repo/HEAD/README.md",
		"https://raw.githubusercontent.com/owner/repo/HEAD/src/main.go",
		"https://evil.example.com/atlas.yaml",
		"https://gitlab.com/api/v4/user",
		"https://gitlab.com/api/v4/projects/group%2Frepo/repository/files/main.go/raw",
		"https://gitlab.example.com/api/v4/projects/a%2Fb/repository/files/x.yaml/raw",
		"http://raw.githubusercontent.com/owner/repo/HEAD/stackatlas.yaml",
		"file:///etc/passwd",
	} {
		rec := httptest.NewRecorder()
		p.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/api/fetch?url="+url.QueryEscape(target), nil))
		if rec.Code != http.StatusForbidden && rec.Code != http.StatusBadRequest {
			t.Errorf("%s: got %d, want 403 or 400", target, rec.Code)
		}
	}
}

func TestProxyAcceptsYAMLFiles(t *testing.T) {
	p := newProxy()
	for path, want := range map[string]bool{
		"/api/v4/projects/group%2Frepo/repository/files/stackatlas.yaml/raw":         true,
		"/api/v4/projects/group%2Fsub%2Frepo/repository/files/docs%2Fa.yml/raw":      true,
		"/api/v4/projects/group%2Frepo/repository/files/README.md/raw":               false,
		"/api/v4/projects/group%2Frepo/repository/files/stackatlas.yaml/blame":       false,
		"/api/v4/projects/group%2Frepo/repository/files/x.yaml/raw/../../../../user": false,
	} {
		if got := p.isGitlabYAML(path); got != want {
			t.Errorf("isGitlabYAML(%q) = %v, want %v", path, got, want)
		}
	}
	if !isYAML("/owner/repo/HEAD/stackatlas.yaml") || isYAML("/owner/repo/HEAD/stackatlas.yaml.md") {
		t.Error("isYAML misjudges file extensions")
	}
}

func TestGitlabHostsFromEnvironment(t *testing.T) {
	t.Setenv("STACKATLAS_GITLAB_HOSTS", "git.example.com, gitlab.internal ")
	p := newProxy()
	for _, h := range []string{"gitlab.com", "git.example.com", "gitlab.internal"} {
		if !p.isGitlab(h) {
			t.Errorf("%s should be a GitLab host", h)
		}
	}
}
