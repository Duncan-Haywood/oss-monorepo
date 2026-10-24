from pathlib import Path
import pandas as pd,numpy as np,matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
P=Path(__file__).resolve().parent;O=P.parent/'outputs' if P.name=='work' else P.parent
x=pd.read_csv(P/'couple_profiles/complete_couple_profiles.csv');x=x[x.supported]
labels=[f'{z.profile_id}  {z.schooling.replace("Both ","")} school years each · {z.couple_wages} wages · '+{'Balanced 40–60% wife':'balanced','Husband majority, both positive':'husband majority, both earn','Husband only':'husband only'}[z.earnings_role] for z in x.itertuples()]
fig,ax=plt.subplots(figsize=(11,4.6),dpi=150);fig.subplots_adjust(left=.45,right=.96,top=.81,bottom=.18)
y=np.arange(len(x));ax.errorbar(x.rate_per_1000,y,xerr=[x.rate_per_1000-x.ci_low,x.ci_high-x.rate_per_1000],fmt='o',color='#286b78',ecolor='#72969e',capsize=3,markersize=6)
ax.set_yticks(y,labels,fontsize=9);ax.invert_yaxis();ax.set_xlim(0,max(x.ci_high)*1.07);ax.set_xlabel('Adjusted divorces per 1,000 married person-years',fontsize=10);ax.grid(axis='x',alpha=.2);ax.spines[['top','right','left']].set_visible(False);ax.tick_params(axis='y',length=0)
fig.suptitle('Supported couple profiles on one annual scale',fontsize=15,x=.04,ha='left',y=.97);fig.text(.04,.87,'NLSY79 midlife marriages · common standardization target · approximate 95% confidence intervals',fontsize=9,color='#444');fig.text(.04,.035,'School years are not verified degrees. Q1/Q4 are combined positive-wage quartiles.\nExploratory model associations; sparse profiles withheld. CIs omit full survey design.',fontsize=8,color='#555')
(O/'figures').mkdir(exist_ok=True);fig.savefig(O/'figures/couple_profiles.png',facecolor='white');fig.savefig(O/'report-app/src/content/assets/coupleProfiles.png',facecolor='white');plt.close(fig)
