from pathlib import Path
import pandas as pd,numpy as np,matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
P=Path(__file__).resolve().parent
O=P.parent/'figures';O.mkdir(exist_ok=True)
plt.rcParams.update({'font.family':'DejaVu Sans','font.size':10,'axes.spines.top':False,'axes.spines.right':False,'svg.fonttype':'none'})
C=['#27649b','#a55e17'];M=['o','s']
def draw():
 a=pd.read_csv(P/'annual_acs/first_marriage/marginal_contrasts.csv')
 terms=[('Unemployed vs employed','employment','Unemployed'),('High school vs bachelor','education','High school/GED'),('USD100–149k vs50–74k','income_group','100,000-149,999'),('USD200k+ vs50–74k','income_group','200,000+'),('Master vs bachelor','education','Master')]
 fig,ax=plt.subplots(figsize=(10,5.5))
 for i,sex in enumerate(['Men','Women']):
  ss=[a[(a.sex==sex)&(a.factor==f)&(a.level==v)].iloc[0] for _,f,v in terms];v=np.array([r.estimate for r in ss]);lo=np.array([r.ci95_low for r in ss]);hi=np.array([r.ci95_high for r in ss]);y=np.arange(len(terms))+(i-.5)*.22
  ax.errorbar(v,y,xerr=np.vstack([v-lo,hi-v]),fmt=M[i],color=C[i],capsize=3,label=sex)
 ax.set_yticks(range(len(terms)),[t[0] for t in terms]);ax.invert_yaxis();ax.axvline(0,color='#555',lw=1);ax.grid(axis='x',alpha=.2);ax.set_axisbelow(True);ax.set_xlabel('Adjusted annual difference (percentage points): first group minus reference');ax.set_title('Annual associations after fitting the factors jointly',loc='left',fontsize=14,pad=20);ax.legend(frameon=False,loc='lower right');fig.tight_layout(rect=(0,.08,1,1));fig.text(.02,.02,'ACS 2023 | first-married ages 30–64 | approximate at-risk denominator | 95% SDR CIs | associations, not causes',fontsize=8)
 fig.savefig(O/'annual_driver_contrasts.png',dpi=180,facecolor='white');fig.savefig(O/'annual_driver_contrasts.svg',facecolor='white');plt.close(fig)
 a=pd.read_csv(P/'annual_nlsy/legally_married_primary/annual_adjusted_without_separation_state.csv')
 terms=[('Bachelor vs high school','education_model: Bachelor vs High school'),('Graduate vs high school','education_model: Graduate vs High school'),('Lowest income quartile vs Q2','income_quartile: Q1 vs Q2'),('Highest income quartile vs Q2','income_quartile: Q4 vs Q2'),('Weekly attendance vs never','religion_2000: Weekly or more vs Never')]
 fig,ax=plt.subplots(figsize=(10,5.5))
 for i,sex in enumerate(['Men','Women']):
  ss=[a[(a.sex==sex)&(a.term==v)].iloc[0] for _,v in terms];v=np.array([r.rate_ratio for r in ss]);lo=np.array([r.ci_low for r in ss]);hi=np.array([r.ci_high for r in ss]);y=np.arange(len(terms))+(i-.5)*.22
  ax.errorbar(v,y,xerr=np.vstack([v-lo,hi-v]),fmt=M[i],color=C[i],capsize=3,label=sex)
 ax.set_yticks(range(len(terms)),[t[0] for t in terms]);ax.invert_yaxis();ax.axvline(1,color='#555',lw=1);ax.set_xscale('log');ax.set_xticks([.4,.5,1,2,4],['0.4','0.5','1','2','4']);ax.set_xlim(.35,4.2);ax.grid(axis='x',alpha=.2);ax.set_axisbelow(True);ax.set_xlabel('Adjusted incidence-rate ratio (log scale; 1 = no association)');ax.set_title('Prospective results do not confirm a universal protective profile',loc='left',fontsize=14,pad=20);ax.legend(frameon=False,loc='lower right');fig.tight_layout(rect=(0,.08,1,1));fig.text(.02,.02,'NLSY79, 2000–2022 | predictors before event | legal marriage exposure | approximate respondent-cluster 95% CIs',fontsize=8)
 fig.savefig(O/'prospective_rate_ratios.png',dpi=180,facecolor='white');fig.savefig(O/'prospective_rate_ratios.svg',facecolor='white');plt.close(fig)
if __name__=='__main__':draw()
