import csv, sys, datetime as dt, collections
# UCI Online Retail invoice lines -> one row per calendar day (README "A real shop's daily series", data/SOURCE.md).
#   python3 eval/real-shop-daily.py online-retail-dataset.csv data/online-retail-daily.csv
#   python3 eval/real-shop-daily.py online-retail-ii-2009.csv data/online-retail-2009-daily.csv   (from eval/real-shop-xlsx.py)
src, out = sys.argv[1], sys.argv[2]
orders=collections.defaultdict(set); canc=collections.defaultdict(set); rev=collections.defaultdict(int)
first={}
rows=0
with open(src, newline='', encoding='utf-8', errors='replace') as f:
    for r in csv.DictReader(f):
        rows+=1
        t=r['InvoiceDate']
        d=(dt.datetime.fromisoformat(t) if '-' in t else dt.datetime.strptime(t,'%m/%d/%Y %H:%M')).date()
        # Online Retail (352) names the columns InvoiceNo, UnitPrice, CustomerID; Online Retail II (502) Invoice, Price, Customer ID.
        inv=str(r.get('InvoiceNo', r.get('Invoice'))); q=int(float(r['Quantity'])); p=float(r.get('UnitPrice', r.get('Price')))
        if inv.startswith('C'): canc[d].add(inv); continue
        if q<=0 or p<=0: continue
        orders[d].add(inv); rev[d]+=round(q*p*100)
        c=r.get('CustomerID', r.get('Customer ID'))
        if c and c.endswith('.0'): c=c[:-2]
        if c and (c not in first or d<first[c]): first[c]=d
newc=collections.Counter(first.values())
days=sorted(set(orders)|set(canc)); d=days[0]; last=days[-1]
with open(out,'w') as f:
    f.write('date,orders,revenue,cancellations,new_customers\n')
    while d<=last:
        f.write(f"{d},{len(orders[d])},{rev[d]/100:.2f},{len(canc[d])},{newc[d]}\n"); d+=dt.timedelta(1)
print(rows, days[0], last)
