// One CSV text cell for the tax-pack exports. Payee, vendor, project and asset names come from bank files and
// the user's own books, and a name that starts with = + - @ (or a tab or CR) runs as a formula when the CSV is
// opened in Excel or Sheets. So it gets a leading apostrophe (OWASP's CSV-injection advice), then the usual quoting.
export const q = (s) => {
  let t = String(s ?? "");
  if (/^[=+\-@\t\r]/.test(t)) t = "'" + t;
  return /[",\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
};
