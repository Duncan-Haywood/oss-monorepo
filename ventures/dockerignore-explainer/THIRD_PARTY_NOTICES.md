# Third-party notices

The rest of this folder is original work under the MIT licence in `LICENSE`. `matcher.mjs` is a translation into
JavaScript of parts of three Go projects. Those parts keep their original licences, reproduced in `licenses/`:

| Upstream | Version | What `matcher.mjs` translates | Licence |
| --- | --- | --- | --- |
| [moby/patternmatcher](https://github.com/moby/patternmatcher) | v0.6.1 | `ignorefile.ReadAll`; `New`, `MatchesUsingParentResults`, `Pattern.match`, `Pattern.compile` | Apache-2.0 (`licenses/Apache-2.0.txt`), Copyright 2012-2017 Docker, Inc. |
| [Go](https://go.dev) `path/filepath` | go1.25 | `Clean`, `Match`, `scanChunk`, `matchChunk`, `getEsc` | BSD-3-Clause (`licenses/Go-BSD-3-Clause.txt`), Copyright 2009 The Go Authors |
| [tonistiigi/fsutil](https://github.com/tonistiigi/fsutil) | v0.0.0-20261103125000-e075fd9305eb | `filterFS.Walk` (exclude patterns), `patternWithoutTrailingGlob` | MIT (`licenses/fsutil-MIT.txt`), Copyright 2017 Tõnis Tiigi |

Changes made (Apache-2.0 §4(b)): the Go code was rewritten in JavaScript; the regexp step goes through a
translator to JS regular expressions (`goRegexToJs`) instead of Go's `regexp`; the walk runs over an in-memory tree
instead of a file system and records the deciding pattern for each path; include patterns, symlink following and
the walk's map hook were left out.

moby/patternmatcher's NOTICE file reads, in part: "Docker. Copyright 2012-2017 Docker, Inc. This product includes
software developed at Docker, Inc. (https://www.docker.com)."

`oracle/main.go` is original; it imports moby/patternmatcher and tonistiigi/fsutil as Go module dependencies to
check the translation.
