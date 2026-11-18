# igmp cloud worker: scores, edits and makes reels from a bucket, continuously (`igmp worker`).
# Build from the package folder:  docker build -f deploy/Dockerfile -t igmp-worker .
# Run: see deploy/README.md. No secrets are baked in; they come from the environment at run time.
FROM python:3.12-slim-bookworm

# ffmpeg: renders and probes; exiftool: metadata; rawtherapee-cli: RAW edits (no GUI is started)
RUN apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg libimage-exiftool-perl rawtherapee \
 && rm -rf /var/lib/apt/lists/*

ENV PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    IGMP_CONFIG=/config/config.toml \
    HOME=/data

WORKDIR /app
COPY pyproject.toml README.md LICENSE ./
COPY src ./src
COPY style ./style
# editable, so the style guide is found next to the source (config.style_guide_text)
RUN pip install -e '.[cloud]'

RUN useradd --create-home --home-dir /home/igmp --uid 10001 igmp \
 && mkdir -p /data /config \
 && chown igmp:igmp /data
USER igmp
VOLUME ["/data"]

ENTRYPOINT ["igmp", "worker"]
