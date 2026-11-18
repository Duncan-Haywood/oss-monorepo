// Example data shipped with the page. Sources: data/SOURCE.md.

/** Graduate admissions at UC Berkeley, fall 1973, six largest departments (Bickel, Hammel & O'Connell 1975; R's UCBAdmissions). */
export const BERKELEY_CSV = `department,gender,decision,applicants
A,Male,Admitted,512
A,Male,Rejected,313
A,Female,Admitted,89
A,Female,Rejected,19
B,Male,Admitted,353
B,Male,Rejected,207
B,Female,Admitted,17
B,Female,Rejected,8
C,Male,Admitted,120
C,Male,Rejected,205
C,Female,Admitted,202
C,Female,Rejected,391
D,Male,Admitted,138
D,Male,Rejected,279
D,Female,Admitted,131
D,Female,Rejected,244
E,Male,Admitted,53
E,Male,Rejected,138
E,Female,Admitted,94
E,Female,Rejected,299
F,Male,Admitted,22
F,Male,Rejected,351
F,Female,Admitted,24
F,Female,Rejected,317`;

/** Convictions of the same-sex twins of convicted criminals, as given in R's fisher.test documentation, which cites Fisher (1962, 1970). */
export const TWINS_CSV = `twins,Convicted,Not convicted
Dizygotic,2,15
Monozygotic,10,3`;

/** Job satisfaction by income (Agresti 2002, p. 57, from the General Social Survey; R's fisher.test example). */
export const JOBS_CSV = `income,Very dissatisfied,A little dissatisfied,Moderately satisfied,Very satisfied
< 15k,1,3,10,6
15-25k,2,3,10,7
25-40k,1,6,14,12
> 40k,0,1,9,11`;
