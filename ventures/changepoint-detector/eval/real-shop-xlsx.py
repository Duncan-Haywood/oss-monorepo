import csv, sys, openpyxl
# UCI Online Retail II (dataset 502) workbook -> one sheet as CSV, dates as ISO (README "Closed days", data/SOURCE.md).
#   python3 eval/real-shop-xlsx.py online_retail_II.xlsx "Year 2009-2010" online-retail-ii-2009.csv
src, sheet, out = sys.argv[1], sys.argv[2], sys.argv[3]
ws = openpyxl.load_workbook(src, read_only=True)[sheet]
with open(out, 'w', newline='') as f:
    w = csv.writer(f)
    for i, row in enumerate(ws.iter_rows(values_only=True)):
        w.writerow([c.isoformat(sep=' ') if hasattr(c, 'isoformat') else ('' if c is None else c) for c in row])
print(i)
