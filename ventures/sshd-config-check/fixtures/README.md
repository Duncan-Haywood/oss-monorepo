# Fixtures

- `ubuntu-24.04-stock/sshd_config` is the `sshd_config` shipped in Ubuntu 24.04's
  `openssh-server` package, version `1:9.6p1-3ubuntu13.20` (installed from
  `/usr/share/openssh/sshd_config`), copied unchanged. It is part of OpenSSH and
  Debian's packaging; its copyright and licence terms are in
  [`OPENSSH-COPYRIGHT`](OPENSSH-COPYRIGHT), the package's own
  `/usr/share/doc/openssh-server/copyright`, kept as that licence asks.
- `ubuntu-24.04-cloud-init/` is the same file plus two drop-ins we wrote to show
  the most common ordering trap: `sshd_config.d/50-cloud-init.conf` holds the one
  line `PasswordAuthentication yes` (the setting cloud-init writes there when a
  cloud image asks for password logins, `ssh_pwauth: true`), and
  `sshd_config.d/hardening` turns passwords and root login off but is never read,
  because the stock Include matches only names ending in `.conf`.
