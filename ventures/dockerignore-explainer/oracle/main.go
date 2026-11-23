// Command oracle runs BuildKit's own context filter over test trees, so the
// JavaScript engine (../dockerignore.mjs) can be checked against it.
//
// Input on stdin: a JSON array of cases {"ignore": "<.dockerignore text>",
// "files": ["a/b.txt", ...], "dirs": ["empty", ...]}. For each case it builds
// the tree in a temporary directory, reads the ignore text with
// moby/patternmatcher/ignorefile.ReadAll (what BuildKit's dockerui frontend
// calls) and walks it with tonistiigi/fsutil.Walk and those ExcludePatterns
// (what BuildKit's local source does when it sends the context). It prints a
// JSON array of {"patterns": [...], "sent": [...], "error": "..."}; a folder
// in "sent" ends with "/".
//
// Run: cd oracle && go run . < cases.json > results.json
// (../oracle.gen.mjs writes the cases and the fixture; see the README.)
package main

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"sort"
	"strings"

	"github.com/moby/patternmatcher/ignorefile"
	"github.com/tonistiigi/fsutil"
)

type tcase struct {
	Ignore string   `json:"ignore"`
	Files  []string `json:"files"`
	Dirs   []string `json:"dirs"`
}

type result struct {
	Patterns []string `json:"patterns"`
	Sent     []string `json:"sent"`
	Error    string   `json:"error,omitempty"`
}

func run(c tcase) result {
	var r result
	pats, err := ignorefile.ReadAll(strings.NewReader(c.Ignore))
	if err != nil {
		r.Error = "read: " + err.Error()
		return r
	}
	r.Patterns = pats
	if r.Patterns == nil {
		r.Patterns = []string{}
	}
	root, err := os.MkdirTemp("", "dockerignore-oracle")
	if err != nil {
		panic(err)
	}
	defer os.RemoveAll(root)
	for _, d := range c.Dirs {
		if err := os.MkdirAll(filepath.Join(root, d), 0o755); err != nil {
			panic(err)
		}
	}
	for _, f := range c.Files {
		p := filepath.Join(root, f)
		if err := os.MkdirAll(filepath.Dir(p), 0o755); err != nil {
			panic(err)
		}
		if err := os.WriteFile(p, []byte("x"), 0o644); err != nil {
			panic(err)
		}
	}
	r.Sent = []string{}
	err = fsutil.Walk(context.Background(), root, &fsutil.FilterOpt{ExcludePatterns: pats}, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return err
		}
		if info.IsDir() {
			path += "/"
		}
		r.Sent = append(r.Sent, path)
		return nil
	})
	if err != nil {
		r.Error = err.Error()
		r.Sent = nil
	}
	sort.Strings(r.Sent)
	return r
}

func main() {
	var cases []tcase
	if err := json.NewDecoder(os.Stdin).Decode(&cases); err != nil {
		panic(err)
	}
	out := make([]result, len(cases))
	for i, c := range cases {
		out[i] = run(c)
	}
	enc := json.NewEncoder(os.Stdout)
	enc.SetEscapeHTML(false)
	if err := enc.Encode(out); err != nil {
		panic(err)
	}
}
