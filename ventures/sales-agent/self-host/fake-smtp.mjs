// A tiny in-memory SMTP server for tests: EHLO, STARTTLS, AUTH PLAIN, MAIL, RCPT, DATA, QUIT. Records commands and delivered messages.
// mode: "plain" (default), "implicit" (TLS from the first byte, like port 465) or "starttls" (offers STARTTLS and refuses AUTH
// until it). The two TLS modes need tlsOpts = { key, cert }.
import net from "node:net";
import tls from "node:tls";
export function fakeSmtp({ user = "me@example.com", pass = "pw", token = null, rejectRcpt = null, mode = "plain", tlsOpts = null } = {}) {
  const log = [], delivered = [];
  const onConn = (s) => {
    let buf = "", data = null, secured = mode !== "starttls", authFail = false;
    const wire = (sock) => {
      sock.on("error", () => {});
      sock.on("data", (d) => {
        buf += d;
        for (let i; (i = buf.indexOf("\r\n")) >= 0;) {
          const line = buf.slice(0, i); buf = buf.slice(i + 2);
          if (data !== null) { if (line === ".") { delivered.push(data.join("\r\n").replace(/^\.\./gm, ".")); data = null; sock.write("250 2.0.0 queued as FAKE1\r\n"); } else data.push(line); continue; }
          if (authFail) { authFail = false; sock.write("535 5.7.8 token rejected\r\n"); continue; }
          log.push(line); const C = line.split(" ")[0].toUpperCase();
          if (C === "EHLO") sock.write(secured ? `250-fake\r\n250 AUTH PLAIN LOGIN${token ? " XOAUTH2" : ""}\r\n` : "250-fake\r\n250 STARTTLS\r\n");
          else if (C === "STARTTLS" && !secured) {
            sock.write("220 go ahead\r\n"); sock.removeAllListeners("data");
            secured = true; buf = ""; wire(new tls.TLSSocket(sock, { isServer: true, ...tlsOpts })); return;
          }
          else if (C === "AUTH" && !secured) sock.write("530 5.7.0 Must issue a STARTTLS command first\r\n");
          else if (C === "AUTH" && line.split(" ")[1] === "XOAUTH2") {
            if (token && Buffer.from(line.split(" ")[2] || "", "base64").toString() === `user=${user}\x01auth=Bearer ${token}\x01\x01`) sock.write("235 2.7.0 accepted\r\n");
            else { sock.write("334 " + Buffer.from('{"status":"401"}').toString("base64") + "\r\n"); authFail = true; }
          }
          else if (C === "AUTH") sock.write(Buffer.from(line.split(" ")[2], "base64").toString() === `\0${user}\0${pass}` ? "235 ok\r\n" : "535 5.7.8 bad credentials\r\n");
          else if (C === "MAIL") sock.write("250 ok\r\n");
          else if (C === "RCPT") sock.write(rejectRcpt && line.includes(rejectRcpt) ? "550 5.1.1 no such user\r\n" : "250 ok\r\n");
          else if (C === "DATA") { data = []; sock.write("354 go\r\n"); }
          else if (C === "QUIT") { sock.write("221 bye\r\n"); sock.end(); }
          else sock.write("500 what\r\n");
        }
      });
      if (sock === s || mode === "implicit") sock.write("220 fake ESMTP\r\n");
    };
    wire(s);
  };
  const server = mode === "implicit" ? tls.createServer(tlsOpts, onConn) : net.createServer(onConn);
  return { server, log, delivered, listen: () => new Promise((r) => server.listen(0, "127.0.0.1", () => r(server.address().port))), close: () => new Promise((r) => { server.close(r); server.closeAllConnections?.(); }) };
}
