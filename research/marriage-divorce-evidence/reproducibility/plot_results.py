from pathlib import Path
import pandas as pd,numpy as np,matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
P=Path(__file__).resolve().parent
O=P.parent/'figures';O.mkdir(exist_ok=True)
plt.rcParams.update({'font.family':'DejaVu Sans','font.size':11,'axes.spines.top':False,'axes.spines.right':False,'svg.fonttype':'none'})
def plot(d,groups,sexcol,groupcol,value,low,high,sexes,title,xlabel,name,div=1,xlim=None):
 fig,ax=plt.subplots(figsize=(10,5.5));colors=['#27649b','#a55e17']; markers=['o','s']
 for i,sex in enumerate(sexes):
  x=d[d[sexcol]==sex].set_index(groupcol).reindex(groups);v=x[value].to_numpy()/div;l=x[low].to_numpy()/div;h=x[high].to_numpy()/div;y=np.arange(len(groups))+(i-.5)*.23
  ax.errorbar(v,y,xerr=np.vstack([v-l,h-v]),fmt=markers[i],color=colors[i],capsize=3,ms=6,label=['Men','Women'][i])
 ax.set_yticks(range(len(groups)),groups);ax.invert_yaxis();ax.set_xlabel(xlabel);ax.set_title(title,loc='left',fontsize=15,pad=24);ax.grid(axis='x',alpha=.2);ax.set_axisbelow(True);ax.legend(loc='upper right',frameon=False)
 if xlim:ax.set_xlim(*xlim)
 fig.tight_layout(rect=(0,.055,1,1));fig.text(.02,.015,('ACS 2023 | ever-married ages 30–64 | 95% replicate-weight CIs' if name=='annual_degrees' else 'NSFG 2017–2019 | ever-married ages 25–49 | 95% Taylor survey CIs | current attendance'),fontsize=9,color='#444444');fig.savefig(O/(name+'.png'),dpi=180,facecolor='white');fig.savefig(O/(name+'.svg'),facecolor='white');plt.close(fig)
a=pd.read_csv(P/'acs/results.csv');a=a[(a.variable=='education')&(a.outcome=='annual_ever_married')&(a.measure=='age_standardized')].copy()
for c in ['proportion','ci95_low','ci95_high']:a[c]*=100
plot(a,['Less than high school','High school/GED','Some college','Associate','Bachelor','Master','Professional','Doctorate'],'sex','group','proportion','ci95_low','ci95_high',['Men','Women'],'Graduate degrees do not show a consistent annual-divorce hierarchy','Past-12-month divorce reports per 100 ever-married adults (age standardized)','annual_degrees',xlim=(0,2))
n=pd.read_csv(P/'nsfg/age_standardized.csv');n=n[(n.dimension=='religious_attendance')&(n.outcome=='first_marriage_divorced_separated')]
plot(n,['Weekly or more','1–3 times monthly','Less than monthly','Never'],'sex','group','percent','ci_low','ci_high',['male','female'],'Religious attendance is associated with first-marriage dissolution','First marriage ended in divorce/annulment or separation by interview (%)','religious_attendance',xlim=(0,55))
