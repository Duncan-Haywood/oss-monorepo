from pathlib import Path
import pandas as pd,numpy as np,matplotlib.pyplot as plt
from matplotlib.patches import Rectangle
P=Path(__file__).resolve().parent;O=P.parent.parent if P.parent.name=='reproducibility' else P.parents[1]/'outputs';(O/'figures').mkdir(parents=True,exist_ok=True);(O/'report-app/src/content/assets').mkdir(parents=True,exist_ok=True);d=pd.read_csv(P/'husband_wife_wages_matrix.csv');d=d[d.reporting_sex=='All'].set_index(['husband_wage_band','wife_wage_band']);bands=['Zero','Q1','Q2','Q3','Q4'];z=np.array([[d.loc[(h,w),'rate_per_1000'] for w in bands] for h in bands]);plt.rcParams.update({'font.family':'DejaVu Sans','font.size':16,'axes.titleweight':'bold'})
fig=plt.figure(figsize=(8,8.15),dpi=125,facecolor='#fbfaf6');ax=fig.add_axes([.18,.245,.72,.61]);im=ax.imshow(z,vmin=0,vmax=20,cmap='PuBu',aspect='equal')
for i,h in enumerate(bands):
 for j,w in enumerate(bands):
  row=d.loc[(h,w)];n=int(row.events);star='*' if n<10 else '';color='white' if z[i,j]>13 else '#10364b'
  ax.text(j,i-.13,f'{z[i,j]:.1f}{star}',ha='center',va='center',fontsize=22,fontweight='bold',color=color)
  ax.text(j,i+.24,f'{n} events',ha='center',va='center',fontsize=11,color=color)
ax.set_xticks(range(5),['Zero','Q1','Q2','Q3','Q4'],fontsize=17);ax.set_yticks(range(5),['Zero','Q1','Q2','Q3','Q4'],fontsize=17);fig.text(.54,.875,"Wife's prior-year wages",fontsize=15,ha='center',color='#153b4b');ax.set_ylabel("Husband's prior-year wages",fontsize=17,labelpad=10)
ax.set_xticks(np.arange(-.5,5,1),minor=True);ax.set_yticks(np.arange(-.5,5,1),minor=True);ax.grid(which='minor',color='white',linewidth=2);ax.tick_params(which='both',length=0)
for spine in ax.spines.values():spine.set_visible(False)
for j in [0,4]:ax.add_patch(Rectangle((j-.48,3.52),.96,.96,fill=False,linewidth=2.2,edgecolor='#2b536a'))
fig.text(.08,.958,'Paired earnings and subsequent divorce',fontsize=19,fontweight='bold',color='#153b4b');fig.text(.08,.921,'Annual divorces per 1,000 observed person-years',fontsize=14,color='#355466')
cax=fig.add_axes([.18,.16,.72,.023]);cb=fig.colorbar(im,cax=cax,orientation='horizontal',ticks=[0,5,10,15,20]);cb.ax.tick_params(labelsize=11,length=0);cb.outline.set_visible(False)
fig.text(.08,.095,'Q1 = lowest; Q4 = highest quarter of positive wages.',fontsize=11,color='#355466');fig.text(.08,.069,'Common dollar cutpoints for both spouses within each wave.',fontsize=10.5,color='#355466');fig.text(.08,.043,'* Fewer than 10 divorce events. Cells are descriptive, not causal.',fontsize=10.5,color='#355466');fig.text(.08,.018,'NLSY79, 2000–2022 survey rounds. Approximate CIs are in the data table.',fontsize=9.5,color='#526974')
fig.savefig(O/'figures/paired_incomes.png',dpi=125,facecolor=fig.get_facecolor());fig.savefig(O/'report-app/src/content/assets/pairedIncomes.png',dpi=125,facecolor=fig.get_facecolor());plt.close(fig)
