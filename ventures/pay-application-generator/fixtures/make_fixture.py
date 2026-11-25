import sys, openpyxl
wb = openpyxl.Workbook(); ws0 = wb.active; ws0.title = "G702"; ws0["A1"] = "APPLICATION FOR PAYMENT"
ws = wb.create_sheet("Continuation Sheet")
ws["A1"] = "CONTINUATION SHEET"; ws["A2"] = "Application No:"; ws["C2"] = 7
hdr1 = ["ITEM", "DESCRIPTION OF WORK", "SCHEDULED", "WORK COMPLETED", None, "MATERIALS PRESENTLY STORED", "TOTAL COMPLETED AND STORED TO DATE", "%", "BALANCE TO FINISH", "RETAINAGE"]
hdr2 = ["NO.", None, "VALUE", "FROM PREVIOUS APPLICATION (D + E)", "THIS PERIOD", "(NOT IN D OR E)", "(D+E+F)", "(G ÷ C)", "(C - G)", "(IF VARIABLE RATE)"]
ws.append([]); ws.append(hdr1); ws.append(hdr2); ws.append(list("ABCDEFGHIJ"))
ws.merge_cells("D4:E4")
lines = [(1,"Mobilization",12500,12500,0,0),(2,"Underground conduit",48250.75,30000,9125.25,0),(3,"Switchgear",96000,0,0,41000),(4,"Branch wiring",73400,22020,14680,3500),("CO-1","Added EV chargers",18900,0,6300,0)]
start = ws.max_row + 1
for i,(a,b,c,d,e,f) in enumerate(lines):
    r = start + i
    ws.append([a,b,c,d,e,f,f"=SUM(D{r}:F{r})",f"=IF(C{r}=0,0,G{r}/C{r})",f"=C{r}-G{r}",f"=ROUND(G{r}*0.1,2)"])
    ws[f"H{r}"].number_format = "0.00%"
end = ws.max_row
ws.append([None,"GRAND TOTAL"]+[f"=SUM({c}{start}:{c}{end})" for c in "CDEFG"]+[None,f"=SUM(I{start}:I{end})",f"=SUM(J{start}:J{end})"])
wb.save(sys.argv[1])
