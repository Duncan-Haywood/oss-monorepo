// A tiny in-memory SMTP server for tests: EHLO (advertises AUTH PLAIN LOGIN), AUTH, MAIL, RCPT, DATA, QUIT. Plain TCP, so the
// client under test needs secure=false and no credentials-in-clear guard tripped (tests pass no user, or set allowClear).
// Records every command and each delivered message. `rcptReject` makes RCPT fail with 550.
import net from "node:net";
export function fakeSmtp({ user = "me@example.com", pass = "pw", rcptReject = [] } = {}) {
  const log = [], delivered = [];
  const server = net.createServer((s) => {
    s.write("220 fake ESMTP ready\r\n");
    let buf = "", data = null, from = "", rcpt = [], authStep = 0;
    s.on("data", (d) => {
      buf += d;
      for (let i; (i = buf.indexOf("\r\n")) >= 0;) {
        const line = buf.slice(0, i); buf = buf.slice(i + 2);
        if (data !== null) {
          if (line === ".") { delivered.push({ from, rcpt, raw: data.join("\r\n") + "\r\n" }); data = null; s.write("250 2.0.0 queued\r\n"); }
          else data.push(line.startsWith("..") ? line.slice(1) : line);
          continue;
        }
        log.push(authStep ? "(credential)" : line);
        const C = line.split(" ")[0].toUpperCase();
        if (authStep === 1) { authStep = 2; s.write("334 UGFzc3dvcmQ6\r\n"); }
        else if (authStep === 2) { authStep = 0; s.write(line === Buffer.from(pass).toString("base64") ? "235 ok\r\n" : "535 5.7.8 bad credentials\r\n"); }
        else if (C === "EHLO") s.write("250-fake\r\n250 AUTH PLAIN LOGIN\r\n");
        else if (C === "AUTH" && /^AUTH PLAIN /i.test(line)) s.write(Buffer.from(line.slice(11), "base64").toString() === `\0${user}\0${pass}` ? "235 ok\r\n" : "535 5.7.8 bad credentials\r\n");
        else if (C === "AUTH") { authStep = 1; s.write("334 VXNlcm5hbWU6\r\n"); }
        else if (C === "MAIL") { from = (line.match(/<(.*)>/) || [])[1]; rcpt = []; s.write("250 ok\r\n"); }
        else if (C === "RCPT") { const r = (line.match(/<(.*)>/) || [])[1]; if (rcptReject.includes(r)) s.write("550 5.1.1 no such user\r\n"); else { rcpt.push(r); s.write("250 ok\r\n"); } }
        else if (C === "DATA") { data = []; s.write("354 go ahead\r\n"); }
        else if (C === "QUIT") { s.write("221 bye\r\n"); s.end(); }
        else s.write("500 unknown\r\n");
      }
    });
  });
  return { server, log, delivered, listen: () => new Promise((r) => server.listen(0, "127.0.0.1", () => r(server.address().port))), close: () => new Promise((r) => server.close(r)) };
}
