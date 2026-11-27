"""Writes sov-ruled-libreoffice.fods: a bordered schedule of values whose description column is too
narrow for its text, for LibreOffice to print (`soffice --headless --convert-to pdf
sov-ruled-libreoffice.fods`, giving ../sov-ruled-libreoffice.pdf). LibreOffice strokes each border as a
line and cuts the text off at the border itself, so the last letter shown touches the next cell's text.
The figures are made up. Run: python3 sov-ruled-libreoffice.py > sov-ruled-libreoffice.fods
"""
from xml.sax.saxutils import escape

rows = []
for i in range(1, 31):
    sched = round(48000 + 1731.25 * i, 2)
    prev = 0 if i % 5 == 0 else round(sched * 0.35, 2)
    cur = round(sched * 0.15, 2)
    desc = f"Line {i} " + ("interior partitions and ceilings, building B" if i % 2 else "doors, frames and hardware")
    rows.append((str(i), desc, sched, prev, cur, round(prev + cur, 2)))


def cell(v, style):
    if isinstance(v, (int, float)):
        return (f'<table:table-cell table:style-name="{style}" office:value-type="float" office:value="{v}">'
                f"<text:p>{v}</text:p></table:table-cell>")
    return f'<table:table-cell table:style-name="{style}" office:value-type="string"><text:p>{escape(v)}</text:p></table:table-cell>'


head = ["Item", "Description of work", "Scheduled value", "Previous applications", "This period", "Completed to date"]
header = "<table:table-row>" + "".join(cell(h, "ce1") for h in head) + "</table:table-row>"
body = "".join(
    "<table:table-row>" + cell(r[0], "ce1") + cell(r[1], "ce1") + "".join(cell(v, "ce2") for v in r[2:]) + "</table:table-row>"
    for r in rows
)
print(f'''<?xml version="1.0" encoding="UTF-8"?>
<office:document xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0" xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0" office:version="1.2" office:mimetype="application/vnd.oasis.opendocument.spreadsheet">
<office:automatic-styles>
<style:style style:name="co1" style:family="table-column"><style:table-column-properties style:column-width="0.35in"/></style:style>
<style:style style:name="co2" style:family="table-column"><style:table-column-properties style:column-width="1.6in"/></style:style>
<style:style style:name="co3" style:family="table-column"><style:table-column-properties style:column-width="0.82in"/></style:style>
<style:style style:name="ce1" style:family="table-cell"><style:table-cell-properties fo:border="0.5pt solid #000000"/><style:text-properties fo:font-size="8pt"/></style:style>
<style:style style:name="ce2" style:family="table-cell"><style:table-cell-properties fo:border="0.5pt solid #000000"/><style:paragraph-properties fo:text-align="end"/><style:text-properties fo:font-size="8pt"/></style:style>
</office:automatic-styles>
<office:body><office:spreadsheet><table:table table:name="SOV">
<table:table-column table:style-name="co1"/><table:table-column table:style-name="co2"/><table:table-column table:style-name="co3" table:number-columns-repeated="4"/>
<table:table-row><table:table-cell office:value-type="string"><text:p>Schedule of values - Unit 4 tenant fit-out</text:p></table:table-cell></table:table-row>
{header}{body}
</table:table></office:spreadsheet></office:body></office:document>''')
print(f"<!-- {len(rows)} lines, scheduled value total {sum(r[2] for r in rows):.2f} -->")
