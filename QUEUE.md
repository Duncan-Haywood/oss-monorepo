# Security queue

Open code-scanning alerts, most severe then oldest first. Generated hourly by
`.github/workflows/security-alert-queue.yml` from `platform/ci/security_alerts.py`;
do not edit by hand. Take the first one whose claim branch
(`security-fix/code-scanning-<n>`) does not exist; its file says how.

Empty: no open alerts.
