import csv, sys, datetime as dt, collections
# UCI Online Retail invoice lines -> one row per calendar day (README "A real shop's daily series", data/SOURCE.md).
#   python3 eval/real-shop-daily.py online-retail-dataset.csv data/online-retail-daily.csv
src, out = sys.argv[1], sys.argv[2]
orders=collections.defaultdict(set); canc=collections.defaultdict(set); rev=collections.defaultdict(int)
first={}
rows=0
with open(src, newline='', encoding='utf-8', errors='replace') as f:
    for r in csv.DictReader(f):
        rows+=1
        d=dt.datetime.strptime(r['InvoiceDate'],'%m/%d/%Y %H:%M').date()
        inv=r['InvoiceNo']; q=int(r['Quantity']); p=float(r['UnitPrice'])
        if inv.startswith('C'): canc[d].add(inv); continue
        if q<=0 or p<=0: continue
        orders[d].add(inv); rev[d]+=round(q*p*100)
        c=r['CustomerID']
        if c and (c not in first or d<first[c]): first[c]=d
newc=collections.Counter(first.values())
days=sorted(set(orders)|set(canc)); d=days[0]; last=days[-1]
with open(out,'w') as f:
    f.write('date,orders,revenue,cancellations,new_customers\n')
    while d<=last:
        f.write(f"{d},{len(orders[d])},{rev[d]/100:.2f},{len(canc[d])},{newc[d]}\n"); d+=dt.timedelta(1)
print(rows, days[0], last)
