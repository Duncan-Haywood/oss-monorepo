import React from 'react';
import {DataComponent,DataTable,ReportSection,RichNarrative,useDataApp} from '../../data-app-public.jsx';
import annual from '../assets/annual.png';
import religion from '../assets/religion.png';
import annualDrivers from '../assets/annualDrivers.png';
import prospective from '../assets/prospective.png';
import duration from '../assets/duration.png';
import coupleProfiles from '../assets/coupleProfiles.png';
import pairedIncomes from '../assets/pairedIncomes.png';
import {researchDownload} from '../research-download.js';
const figures={annual,religion,annualDrivers,prospective,pairedIncomes,coupleProfiles,duration};
const pct=x=>Number.isFinite(x)?(100*x).toFixed(2)+'%':'—';
function EvidenceTable({block}) {
 const {reviewedRows}=useDataApp();const rows=reviewedRows(block.queryId);
 const cols=block.columns.map(c=>({...c,renderCell:c.format==='pct'?(v=>pct(v)):c.format==='scientific'?(v=>Number(v).toExponential(2)):undefined}));
 return <DataComponent id={block.id} queryId={block.queryId} title={block.title} kind="table" sourceRows={rows} displayRows={rows}>
 <DataTable rows={rows} columns={cols} searchable={Boolean(block.searchable)} caption={block.title}/>
 </DataComponent>;
}
export function ReportContent(){
 const {snapshot,appTitle,visible}=useDataApp();
 return <article className="report-content marriage-report">
 <header className="report-hero"><p className="research-eyebrow">U.S. MARRIAGE MICRODATA · RESEARCH SNAPSHOT · 19 OCTOBER 2026</p><h1 data-data-app-title>{appTitle}</h1><p className="research-deck">Which observed couple pairings have lower annual divorce incidence, and which differences matter most? Joint couple profiles lead; supporting analyses retain their uncertainty, populations and sources.</p><a className="research-download" href={researchDownload} download="Marriage_Divorce_Tables_and_Code.zip">Download aggregate tables, methods and analysis code ↓</a></header>
 <nav className="research-nav" aria-label="Report sections">{[['ml-overview','Prediction models'],['ml-effects','Effect sizes explained'],['ml-degrees','Degrees & occupations'],['couple-goal','Couple profiles'],['couple-effects-text','Effect sizes'],['landmark-duration','Years married'],['milestone-birth-text','Life events'],['landmark-matching','Matching for your profile'],['annual-summary','Supporting annual models'],['pairdemo_wages_intro','Paired incomes'],['pairdemo_education_intro','Education matching'],['pairdemo_religion_pairs_intro','Religion matching'],['pairdemo_demographics_intro','Demographics'],['methods','Methods & sources']].map(([id,label])=><a key={id} href={'#section-'+id}>{label}</a>)}</nav>
 {(snapshot.report?.blocks||[]).map(b=>!visible(b.id)?null:<section className="research-block" id={'section-'+b.id} key={b.id}>{b.type==='table'?<EvidenceTable key={b.id} block={b}/>:b.type==='figure'?<DataComponent key={b.id} id={b.id} queryId={b.queryId} title={b.title} kind="custom" sourceRows={snapshot.queries[b.queryId].rows}><img className="research-figure" src={figures[b.name]} alt={b.title}/><RichNarrative className="research-caption" id={b.id+':caption'} value={b.caption}/></DataComponent>:b.queryId?
 <ReportSection key={b.id} id={b.id} queryId={b.queryId} queryIds={b.queryIds||[b.queryId]} sourceRowsByQuery={Object.fromEntries((b.queryIds||[b.queryId]).map(q=>[q,snapshot.queries[q].rows]))} title={b.title||'Analysis'} showHeading={false}><RichNarrative id={b.id+':body'} value={b.text}/></ReportSection>:
 <RichNarrative key={b.id} id={b.id} value={b.text} sourcePreviews={snapshot.report.sourcePreviews||{}}/>}</section>)}
 <footer className="research-footer"><p>Published snapshot, not a live data feed. Estimates describe associations in specified survey populations; they do not establish what causes a particular marriage to last.</p><a href={researchDownload} download="Marriage_Divorce_Tables_and_Code.zip">Download the research tables and code</a><p>The download contains aggregate results and scripts. Original public microdata are linked in Sources and remain available in the full local research bundle.</p></footer>
 </article>;
}
