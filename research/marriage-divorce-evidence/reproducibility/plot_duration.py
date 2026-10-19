from pathlib import Path
import pandas as pd,numpy as np,matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
P=Path(__file__).resolve().parent;O=P.parent/'outputs' if P.name=='work' else P.parent
x=pd.read_csv(P/'duration_nlsy/duration_crude_rates.csv');x=x[x.reporting_sex=='All'].reset_index(drop=True);a=pd.read_csv(P/'duration_nlsy/duration_adjusted_common_target_rates.csv')
fig,axes=plt.subplots(1,2,figsize=(10.5,4.5),dpi=150,sharey=True);fig.subplots_adjust(left=.11,right=.98,bottom=.23,top=.75,wspace=.13)
y=np.arange(len(x))
for ax,d,title,color in [(axes[0],x,'Observed midlife marriages','#68777d'),(axes[1],a,'Adjusted: common ages 55–64','#286b78')]:
 ax.errorbar(d.rate_per_1000,y,xerr=[d.rate_per_1000-d.ci_low,d.ci_high-d.rate_per_1000],fmt='o',capsize=3,color=color,ecolor=color,markersize=4);ax.set_title(title,fontsize=10,loc='left');ax.set_xlim(0,24);ax.set_xticks([0,5,10,15,20]);ax.grid(axis='x',alpha=.18);ax.spines[['top','right','left']].set_visible(False);ax.tick_params(axis='y',length=0);ax.set_xlabel('Divorces per 1,000 married person-years',fontsize=8)
axes[0].set_yticks(y,[z.replace('–<','–under ') for z in x.duration_band],fontsize=9);axes[0].invert_yaxis();axes[0].set_ylabel('Years married',fontsize=9)
fig.suptitle('Longer-surviving marriages: lower incidence, no clear cutoff',fontsize=14,x=.04,ha='left',y=.98)
fig.text(.04,.86,'Approximate 95% intervals · Same annual units, different comparison populations',fontsize=9,color='#444')
fig.text(.04,.055,'Birth cohort 1957–1964; not a newlywed life table. The 40+ band has only two divorces.\nNo adjacent-band contrast is statistically clear; lower incidence is not proof that waiting causes stability.',fontsize=8,color='#555')
fig.savefig(O/'figures/marriage_duration.png',facecolor='white');fig.savefig(O/'report-app/src/content/assets/duration.png',facecolor='white')
