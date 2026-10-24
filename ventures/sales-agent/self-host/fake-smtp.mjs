// A tiny in-memory SMTP server for tests: EHLO, AUTH PLAIN, MAIL, RCPT, DATA, QUIT. Records commands and delivered messages.
import net from "node:net";
export function fakeSmtp({ user = "me@example.com", pass = "pw", rejectRcpt = null } = {}) {
  const log = [], delivered = [];
  const server = net.createServer((s) => {
    s.write("220 fake ESMTP\r\n");
    let buf = "", data = null;
    s.on("data", (d) => {
      buf += d;
      for (let i; (i = buf.indexOf("\r\n")) >= 0;) {
        const line = buf.slice(0, i); buf = buf.slice(i + 2);
        if (data !== null) { if (line === ".") { delivered.push(data.join("\r\n").replace(/^\.\./gm, ".")); data = null; s.write("250 2.0.0 queued as FAKE1\r\n"); } else data.push(line); continue; }
        log.push(line); const C = line.split(" ")[0].toUpperCase();
        if (C === "EHLO") s.write("250-fake\r\n250 AUTH PLAIN LOGIN\r\n");
        else if (C === "AUTH") s.write(Buffer.from(line.split(" ")[2], "base64").toString() === `\0${user}\0${pass}` ? "235 ok\r\n" : "535 5.7.8 bad credentials\r\n");
        else if (C === "MAIL") s.write("250 ok\r\n");
        else if (C === "RCPT") s.write(rejectRcpt && line.includes(rejectRcpt) ? "550 5.1.1 no such user\r\n" : "250 ok\r\n");
        else if (C === "DATA") { data = []; s.write("354 go\r\n"); }
        else if (C === "QUIT") { s.write("221 bye\r\n"); s.end(); }
        else s.write("500 what\r\n");
      }
    });
  });
  return { server, log, delivered, listen: () => new Promise((r) => server.listen(0, "127.0.0.1", () => r(server.address().port))), close: () => new Promise((r) => { server.close(r); server.closeAllConnections?.(); }) };
}
