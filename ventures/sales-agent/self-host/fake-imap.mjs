// A tiny in-memory IMAP server for tests (plain, or implicit TLS with tlsOpts): LOGIN, EXAMINE, UID SEARCH, UID FETCH (BODY.PEEK[]), LOGOUT. Records every command.
import net from "node:net";
import tls from "node:tls";
export function fakeImap({ user = "me@example.com", pass = "pw", token = null, messages = {}, tlsOpts = null } = {}) {
  const log = [];
  const onConn = (s) => {
    s.on("error", () => {});
    s.write("* OK fake ready\r\n");
    let buf = "", pendingFail = null;
    s.on("data", (d) => {
      buf += d;
      for (let i; (i = buf.indexOf("\r\n")) >= 0;) {
        const line = buf.slice(0, i); buf = buf.slice(i + 2);
        if (pendingFail) { s.write(`${pendingFail} NO [AUTHENTICATIONFAILED] invalid token\r\n`); pendingFail = null; continue; } // client answered the XOAUTH2 error challenge
        const [tag, cmd, ...rest] = line.split(" "), arg = rest.join(" "); log.push(line);
        const C = cmd.toUpperCase();
        if (C === "AUTHENTICATE" && token) {
          log.push("(auth " + arg.split(" ")[0] + ")");
          if (Buffer.from(arg.split(" ")[1] || "", "base64").toString() === `user=${user}\x01auth=Bearer ${token}\x01\x01`) s.write(`${tag} OK authenticated\r\n`);
          else { pendingFail = tag; s.write(`+ ${Buffer.from('{"status":"401","schemes":"Bearer","scope":"https://mail.google.com/"}').toString("base64")}\r\n`); }
        }
        else if (C === "LOGIN") s.write(arg === `"${user}" "${pass}"` ? `${tag} OK logged in\r\n` : `${tag} NO [AUTHENTICATIONFAILED] bad credentials\r\n`);
        else if (C === "EXAMINE") s.write(`* 2 EXISTS\r\n${tag} OK [READ-ONLY] done\r\n`);
        else if (C === "UID" && /^SEARCH/i.test(arg)) { const since = Number((arg.match(/UID (\d+):\*/) || [])[1] || 1); s.write(`* SEARCH ${Object.keys(messages).map(Number).filter((u) => u >= since).join(" ")}\r\n${tag} OK done\r\n`); }
        else if (C === "UID" && /^FETCH/i.test(arg)) { const uid = arg.split(" ")[1], m = messages[uid] || ""; s.write(`* 1 FETCH (UID ${uid} BODY[] {${Buffer.byteLength(m)}}\r\n${m})\r\n${tag} OK done\r\n`); }
        else if (C === "LOGOUT") { s.write(`* BYE\r\n${tag} OK bye\r\n`); s.end(); }
        else s.write(`${tag} BAD unknown\r\n`);
      }
    });
  };
  const server = tlsOpts ? tls.createServer(tlsOpts, onConn) : net.createServer(onConn); // tlsOpts = { key, cert }: implicit TLS, like port 993
  return { server, log, listen: () => new Promise((r) => server.listen(0, "127.0.0.1", () => r(server.address().port))), close: () => new Promise((r) => server.close(r)) };
}
