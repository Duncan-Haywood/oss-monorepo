#!/bin/sh
# Stands up a real Dovecot (IMAP) and Postfix (SMTP submission) on 127.0.0.1 for real-servers.mjs.
# For a THROWAWAY container or VM only: it installs packages and overwrites /etc/postfix/main.cf and master.cf.
# Ports: IMAP 10143 (STARTTLS offered), IMAPS 10993, submission 10587 (STARTTLS required before AUTH), submissions 10465.
# Certificates: a private CA made here (ca.pem) signs a localhost certificate, the way a company's own mail server would be set up.
# Three mailbox users on the invented domain example.test: me@ (the sender), pat@ and lee@ (prospects). nobody@ does not exist (a bounce).
set -eu
DIR=${DIR:-/tmp/sa-real-mail}
PASS=${PASS:-correct-horse-battery}
command -v dovecot >/dev/null && command -v postfix >/dev/null || { apt-get update -qq; DEBIAN_FRONTEND=noninteractive apt-get install -y -qq dovecot-imapd dovecot-lmtpd postfix openssl >/dev/null; }
command -v /usr/lib/dovecot/lmtp >/dev/null 2>&1 || DEBIAN_FRONTEND=noninteractive apt-get install -y -qq dovecot-lmtpd >/dev/null
rm -rf "$DIR"; mkdir -p "$DIR/mail"
id vmail >/dev/null 2>&1 || useradd -r -M -d "$DIR/mail" -s /usr/sbin/nologin vmail
chown vmail:vmail "$DIR/mail"
cd "$DIR"
openssl req -x509 -newkey rsa:2048 -nodes -keyout ca.key -out ca.pem -days 2 -subj "/CN=Sales Agent Test CA" 2>/dev/null
openssl req -newkey rsa:2048 -nodes -keyout server.key -out server.csr -subj "/CN=localhost" 2>/dev/null
printf 'subjectAltName=DNS:localhost,IP:127.0.0.1\n' > san.ext
openssl x509 -req -in server.csr -CA ca.pem -CAkey ca.key -CAcreateserial -out server.pem -days 2 -extfile san.ext 2>/dev/null
chmod 644 server.key
H=$(doveadm pw -s SHA512-CRYPT -p "$PASS")
printf 'me@example.test:%s\npat@example.test:%s\nlee@example.test:%s\n' "$H" "$H" "$H" > users
cat > dovecot.conf <<CONF
protocols = imap lmtp
listen = 127.0.0.1
base_dir = $DIR/run
log_path = $DIR/dovecot.log
ssl = yes
ssl_cert = <$DIR/server.pem
ssl_key = <$DIR/server.key
disable_plaintext_auth = yes
auth_mechanisms = plain login
mail_location = maildir:$DIR/mail/%d/%n/Maildir
mail_uid = vmail
mail_gid = vmail
first_valid_uid = 1
passdb {
  driver = passwd-file
  args = scheme=SHA512-CRYPT $DIR/users
}
userdb {
  driver = static
  args = uid=vmail gid=vmail home=$DIR/mail/%d/%n
}
namespace inbox {
  inbox = yes
  mailbox Sent {
    special_use = \\Sent
    auto = subscribe
  }
}
service imap-login {
  inet_listener imap {
    port = 10143
  }
  inet_listener imaps {
    port = 10993
    ssl = yes
  }
}
service lmtp {
  unix_listener lmtp-pf {
    mode = 0666
  }
}
service auth {
  unix_listener auth-pf {
    mode = 0666
  }
}
CONF
mkdir -p run
dovecot -c "$DIR/dovecot.conf" -F >/dev/null 2>&1 &
postfix stop >/dev/null 2>&1 || true
cat > /etc/postfix/main.cf <<CONF
compatibility_level = 3.6
myhostname = mail.example.test
mydestination = localhost
inet_interfaces = loopback-only
inet_protocols = ipv4
virtual_mailbox_domains = example.test
virtual_transport = lmtp:unix:$DIR/run/lmtp-pf
smtpd_tls_cert_file = $DIR/server.pem
smtpd_tls_key_file = $DIR/server.key
smtpd_sasl_type = dovecot
smtpd_sasl_path = $DIR/run/auth-pf
smtpd_relay_restrictions = permit_sasl_authenticated, reject_unauth_destination
maillog_file_prefixes = /var, /dev/stdout, /tmp
maillog_file = $DIR/postfix.log
CONF
cat > /etc/postfix/master.cf <<'CONF'
127.0.0.1:10587 inet n - n - - smtpd -o smtpd_tls_security_level=encrypt -o smtpd_sasl_auth_enable=yes -o smtpd_tls_auth_only=yes -o smtpd_client_restrictions=permit_sasl_authenticated,reject
127.0.0.1:10465 inet n - n - - smtpd -o smtpd_tls_wrappermode=yes -o smtpd_sasl_auth_enable=yes -o smtpd_client_restrictions=permit_sasl_authenticated,reject
pickup    unix  n       -       n       60      1       pickup
cleanup   unix  n       -       n       -       0       cleanup
qmgr      unix  n       -       n       300     1       qmgr
tlsmgr    unix  -       -       n       1000?   1       tlsmgr
rewrite   unix  -       -       n       -       -       trivial-rewrite
bounce    unix  -       -       n       -       0       bounce
defer     unix  -       -       n       -       0       bounce
trace     unix  -       -       n       -       0       bounce
verify    unix  -       -       n       -       1       verify
flush     unix  n       -       n       1000?   0       flush
proxymap  unix  -       -       n       -       -       proxymap
smtp      unix  -       -       n       -       -       smtp
showq     unix  n       -       n       -       -       showq
error     unix  -       -       n       -       -       error
retry     unix  -       -       n       -       -       error
discard   unix  -       -       n       -       -       discard
lmtp      unix  -       -       n       -       -       lmtp
anvil     unix  -       -       n       -       1       anvil
scache    unix  -       -       n       -       1       scache
postlog   unix-dgram n  -       n       -       1       postlogd
CONF
sleep 1
postfix start >/dev/null 2>&1
sleep 1
echo "ready: DIR=$DIR CA=$DIR/ca.pem users me@, pat@, lee@example.test"
