/* Axelrod (1997) culture model, no media, von Neumann lattice without wrap.
 * Same rule as culture.py, in C so L = 50..150 is feasible (milestone 4 follow-up).
 * usage: axelrod L F q seed runs   -> one line per run: "S regions sweeps"
 * S = largest region / L^2. Stops at an absorbing state, checked every 20 sweeps. */
#include <stdio.h>
#include <stdlib.h>
#include <stdint.h>
static uint64_t s[2];
static inline uint64_t rotl(uint64_t x,int k){return (x<<k)|(x>>(64-k));}
static inline uint64_t nxt(void){uint64_t s0=s[0],s1=s[1],r=s0+s1;s1^=s0;s[0]=rotl(s0,55)^s1^(s1<<14);s[1]=rotl(s1,36);return r;}
static inline uint32_t rnd(uint32_t n){return (uint32_t)(((nxt()>>32)*(uint64_t)n)>>32);}
static inline double unif(void){return (nxt()>>11)*(1.0/9007199254740992.0);}
static int L,F,q,n; static int *c,*nbr,*deg;
static int overlap(int a,int b){int k=0;for(int f=0;f<F;f++)k+=c[a*F+f]==c[b*F+f];return k;}
static int active(void){
  for(int i=0;i<n;i++)for(int d=0;d<deg[i];d++){int j=nbr[i*4+d];if(j>i){int o=overlap(i,j);if(o>0&&o<F)return 1;}}
  return 0;}
int main(int argc,char**argv){
  if(argc<6){fprintf(stderr,"usage\n");return 2;}
  L=atoi(argv[1]);F=atoi(argv[2]);q=atoi(argv[3]);uint64_t seed=strtoull(argv[4],0,10);int runs=atoi(argv[5]);
  n=L*L;c=malloc(sizeof(int)*n*F);nbr=malloc(sizeof(int)*n*4);deg=calloc(n,sizeof(int));
  for(int x=0;x<L;x++)for(int y=0;y<L;y++){int i=x*L+y;
    if(x+1<L)nbr[i*4+deg[i]++]=(x+1)*L+y; if(x>0)nbr[i*4+deg[i]++]=(x-1)*L+y;
    if(y+1<L)nbr[i*4+deg[i]++]=x*L+y+1; if(y>0)nbr[i*4+deg[i]++]=x*L+y-1;}
  int *seen=malloc(sizeof(int)*n),*stack=malloc(sizeof(int)*n);
  for(int r=0;r<runs;r++){
    s[0]=seed*0x9E3779B97F4A7C15ULL+r*2+1; s[1]=0xD1B54A32D192ED03ULL^(seed+r*7919); for(int k=0;k<20;k++)nxt();
    for(int i=0;i<n*F;i++)c[i]=rnd(q);
    long sweeps=0; const long MAXS=2000000;
    for(;sweeps<MAXS;sweeps++){
      for(int t=0;t<n;t++){int i=rnd(n);int j=nbr[i*4+rnd(deg[i])];int o=overlap(i,j);
        if(o>0&&o<F&&unif()<(double)o/F){int k=rnd(F-o),f;for(f=0;f<F;f++)if(c[i*F+f]!=c[j*F+f]){if(k--==0)break;}c[i*F+f]=c[j*F+f];}}
      if(sweeps%20==19&&!active()){sweeps++;break;}
    }
    for(int i=0;i<n;i++)seen[i]=0; int reg=0,best=0;
    for(int s0=0;s0<n;s0++){if(seen[s0])continue;reg++;int sp=0,sz=0;stack[sp++]=s0;seen[s0]=1;
      while(sp){int u=stack[--sp];sz++;for(int d=0;d<deg[u];d++){int v=nbr[u*4+d];if(!seen[v]){int same=1;for(int f=0;f<F;f++)if(c[u*F+f]!=c[v*F+f]){same=0;break;}if(same){seen[v]=1;stack[sp++]=v;}}}}
      if(sz>best)best=sz;}
    printf("%.6f %d %ld\n",(double)best/n,reg,sweeps);
  }
  return 0;}
