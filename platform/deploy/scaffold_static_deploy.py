#!/usr/bin/env python3
"""Add one-click self-host files (Dockerfile, compose, fly.toml, render.yaml,
deploy.test.mjs) to a static browser-only venture, copying the pattern of
ventures/reverb-fee-calculator. Idempotent: never overwrites an existing file.

    python3 platform/deploy/scaffold_static_deploy.py <slug> [<slug> ...]

The Dockerfile copies exactly the .mjs modules the page imports (non-test),
plus the guide pages (*-*.html), robots.txt and sitemap.xml when present.
"""
import re, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2] / "ventures"
HOST_SECTION = """
## Host your own copy

Your data stays in your browser either way, but you can serve the page from an address you control. It is a static
site: the server only hands out files and never sees a figure you type.

- **Docker:** `docker compose up -d`, then open <http://localhost:8080> (`Dockerfile` is nginx plus the page's files).
- **Fly.io:** `fly launch --copy-config --no-deploy --dockerfile Dockerfile`, then `fly deploy` (`fly.toml`).
- **Render:** deploy from your fork with `render.yaml` (static site, no paid plan needed).
- Nothing runs on the author's accounts. The Docker image has not been built in the session that added these files,
  so build it once and open the page before relying on it. Tests: `node --test deploy.test.mjs`.
"""


def modules(d: Path):
    seen, todo = [], ["index.html"]
    while todo:
        f = todo.pop()
        text = (d / f).read_text()
        for m in re.finditer(r"""(?:from |import\()\s*["']\./([\w.-]+\.mjs)["']""", text):
            if m[1] not in seen:
                seen.append(m[1])
                todo.append(m[1])
    return seen


def write(p: Path, s: str):
    if p.exists():
        return
    p.write_text(s)
    print("wrote", p.relative_to(ROOT.parent))


def scaffold(slug: str):
    d = ROOT / slug
    if not (d / "index.html").exists():
        sys.exit(f"{slug}: no index.html")
    files = ["index.html"] + modules(d)
    files += [f for f in ("robots.txt", "sitemap.xml") if (d / f).exists()]
    if any(p.name != "index.html" and "-" in p.name for p in d.glob("*.html")):
        files.append("*-*.html")
    write(d / "Dockerfile", f"""FROM nginx:1.27-alpine
# Static site: the page, its modules and the guides. Tests stay out of the image.
COPY {' '.join(files)} /usr/share/nginx/html/
RUN printf 'types {{ text/javascript mjs; }}\\n' > /etc/nginx/conf.d/mjs.conf
EXPOSE 80
HEALTHCHECK CMD wget -qO- http://127.0.0.1/ >/dev/null || exit 1
""")
    write(d / "docker-compose.yml", f"""# Any box with Docker:  docker compose up -d   (then open http://localhost:8080)
# Put a TLS proxy in front for a public address. Nothing you type reaches the server: it only serves files.
services:
  {slug}:
    build: .
    restart: unless-stopped
    ports: ["8080:80"]
""")
    write(d / "fly.toml", f"""# Fly.io self-deploy, in your own account (needs flyctl):
#   fly launch --copy-config --no-deploy --dockerfile Dockerfile
#   fly deploy
app = "{slug}-CHANGE-ME"
primary_region = "iad"

[build]
  dockerfile = "Dockerfile"

[http_service]
  internal_port = 80
  force_https = true
  auto_stop_machines = "stop"
  auto_start_machines = true
  min_machines_running = 0
""")
    write(d / "render.yaml", f"""# One-click self-deploy: https://render.com/deploy?repo=<your fork URL>
# Render serves the files as a static site in YOUR account; nothing runs on the author's.
services:
  - type: web
    name: {slug}
    runtime: static
    rootDir: ventures/{slug}
    staticPublishPath: .
    buildCommand: "true"
    headers:
      - path: /*.mjs
        name: Content-Type
        value: text/javascript
""")
    ref = ROOT / "reverb-fee-calculator" / "deploy.test.mjs"
    write(d / "deploy.test.mjs", ref.read_text())
    readme = d / "README.md"
    if readme.exists() and "## Host your own copy" not in readme.read_text():
        readme.write_text(readme.read_text().rstrip("\n") + "\n" + HOST_SECTION)
        print("updated", readme.relative_to(ROOT.parent))


if __name__ == "__main__":
    for s in sys.argv[1:] or sys.exit(__doc__):
        scaffold(s)
