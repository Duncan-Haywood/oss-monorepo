"""Where each decision-evidence record's quote is checked.

`fetch` is the argument list for ../../literature_evidence/scripts/fetch_sources.py (run by
fetch_sources.py here); the cache files it writes are `cache_files`. Texts are copyrighted and
never committed: source_cache/ is git-ignored. `repo` sources are files in this project, so
their checks always run.
"""

def _pmc(pmc, title, url, lic='open access (PubMed Central)'):
    return {'title': title, 'url': url, 'kind': 'pmc', 'license': lic,
            'fetch': ['pmc', pmc], 'cache_files': [f'pmc_{pmc}.txt']}


def _pubmed(pmid, title):
    return {'title': title, 'url': f'https://pubmed.ncbi.nlm.nih.gov/{pmid}/', 'kind': 'abstract',
            'license': 'abstract (NCBI PubMed); short quotes only', 'fetch': ['pubmed', pmid],
            'cache_files': [f'pubmed_{pmid}.txt']}


def _doi(doi, title):
    import re
    key = 'doi_' + re.sub(r'[^A-Za-z0-9]+', '_', doi)
    return {'title': title, 'url': f'https://doi.org/{doi}', 'kind': 'abstract',
            'license': 'abstract (Crossref / OpenAlex / Europe PMC); short quotes only', 'fetch': ['doi', doi],
            'cache_files': [key + '.txt']}


def _pdf(name, title, url, sha, lic):
    return {'title': title, 'url': url, 'kind': 'pdf', 'pdf_sha256': sha, 'license': lic,
            'fetch': ['pdf', url, name], 'cache_files': [f'pdf_{name}.layout.txt', f'pdf_{name}.raw.txt']}


def _repo(path, title):
    return {'title': title, 'url': path, 'kind': 'repo', 'license': 'this repository (MIT)',
            'repo_path': path, 'cache_files': [path]}


SOURCES = {
    # ---- relationship education --------------------------------------------------------
    'pmc_PMC2902195': _pmc('PMC2902195', 'Stanley et al. (2010), J Couple Relatsh Ther 9(2)', 'https://pmc.ncbi.nlm.nih.gov/articles/PMC2902195/'),
    'pmc_PMC4237282': _pmc('PMC4237282', 'Stanley et al. (2014), Family Relations 63(4)', 'https://pmc.ncbi.nlm.nih.gov/articles/PMC4237282/'),
    'pmc_PMC4461475': _pmc('PMC4461475', 'Rhoades et al. (2015), J Fam Psychol 29(3)', 'https://pmc.ncbi.nlm.nih.gov/articles/PMC4461475/'),
    'pubmed_24060193': _pubmed('24060193', 'Rogge et al. (2013), J Consult Clin Psychol 81(6)'),
    'pdf_bsf36': _pdf('bsf36', 'Wood, Moore, Clarkwest, Killewald & Monahan (2012), The Long-Term Effects of Building Strong Families, OPRE Report 2012-28A',
                      'https://mdrc.org/publication/long-term-effects-building-strong-families/file-full',
                      '5b906ec107faddaf3b80e5eb89662a3ff0c9f9eac1c29f84a0748c0a35cd626e', 'public domain (U.S. federal government report)'),
    'pdf_shm30': _pdf('shm30', 'Lundquist et al. (2014), A Family-Strengthening Program for Low-Income Families: Final Impacts from the Supporting Healthy Marriage Evaluation, OPRE Report 2014-09A',
                      'https://www.mdrc.org/work/publications/family-strengthening-program-low-income-families/file-full',
                      '31804a6d9d433f3d06fd06f2b0df6d10ebe497b2a10125a93e8e435a4988b142', 'public domain (U.S. federal government report)'),
    'pubmed_18837590': _pubmed('18837590', 'Hawkins et al. (2008), J Consult Clin Psychol 76(5)'),
    'pubmed_25419911': _pubmed('25419911', 'Hawkins & Erickson (2015), J Fam Psychol 29(1)'),
    'pubmed_35040124': _pubmed('35040124', 'Hawkins et al. (2022), Family Process 61(3)'),
    'doi_10_1111_j_1741_3729_2003_00105_x': _doi('10.1111/j.1741-3729.2003.00105.x', 'Carroll & Doherty (2003), Family Relations 52(2)'),
    'pubmed_8450110': _pubmed('8450110', 'Markman et al. (1993), J Consult Clin Psychol 61(1)'),
    'pubmed_16569096': _pubmed('16569096', 'Stanley et al. (2006), J Fam Psychol 20(1)'),
    # ---- couple therapy ----------------------------------------------------------------
    'pubmed_20350033': _pubmed('20350033', 'Christensen et al. (2010), J Consult Clin Psychol 78(2)'),
    'pubmed_15709827': _pubmed('15709827', 'Shadish & Baldwin (2005), J Consult Clin Psychol 73(1)'),
    'pubmed_32551734': _pubmed('32551734', 'Roddy et al. (2020), J Consult Clin Psychol 88(7)'),
    'pmc_PMC9645475': _pmc('PMC9645475', 'Bodenmann et al. (2020), Clinical Psychology in Europe 2(3)', 'https://pmc.ncbi.nlm.nih.gov/articles/PMC9645475/'),
    'pmc_PMC13474905': _pmc('PMC13474905', 'Jackson et al. (2026), J Marital Fam Ther 52(4) (abstract only in PMC XML)', 'https://pmc.ncbi.nlm.nih.gov/articles/PMC13474905/'),
    # ---- natural experiments and income support ----------------------------------------
    'pdf_nber_w10014': _pdf('nber_w10014', 'Wolfers (2003), NBER Working Paper 10014', 'https://www.nber.org/system/files/working_papers/w10014/w10014.pdf',
                            '0657eda5a318dde7dfdba4212d15a6aead7f134875cd04672bfa3cb5263e3dc2', 'NBER working paper; short quotes only'),
    'doi_10_1257_aer_96_5_1802': _doi('10.1257/aer.96.5.1802', 'Wolfers (2006), American Economic Review 96(5)'),
    'pdf_nber_w8578': _pdf('nber_w8578', 'Charles & Stephens (2001), NBER Working Paper 8578', 'https://www.nber.org/system/files/working_papers/w8578/w8578.pdf',
                           'b44efa92fcb819ff01bb16b6b61e7916273184a0d6ae8168670e35f85f43907f', 'NBER working paper; short quotes only'),
    'doi_10_1086_381258': _doi('10.1086/381258', 'Charles & Stephens (2004), Journal of Labor Economics 22(2)'),
    'pdf_iser2004_21': _pdf('iser2004_21', 'Eliason (2004), ISER Working Paper 2004-21', 'https://www.iser.essex.ac.uk/wp-content/uploads/files/working-papers/iser/2004-21.pdf',
                            '14ea7a928bd5a6a8a684196cf4be32792593ce861fcae97af8eac0d05f95732d', 'ISER working paper; short quotes only'),
    'doi_10_3368_jhr_46_2_403': _doi('10.3368/jhr.46.2.403', 'Hankins & Hoekstra (2011), Journal of Human Resources 46(2)'),
    'pdf_mfip2003': _pdf('mfip2003', 'Gennetian & Knox (2003), The Long-Term Effects of the Minnesota Family Investment Program on Marriage and Divorce Among Two-Parent Families (MDRC for ASPE)',
                         'https://aspe.hhs.gov/sites/default/files/migrated_legacy_files//39951/report.pdf', 'f0ad279567d21bcca51658b72638953987c4e64ae7a33c5110b86be27a14fb2e', 'public domain (U.S. federal government report)'),
    'doi_10_1086_229428': _doi('10.1086/229428', 'Cain & Wissoker (1990), American Journal of Sociology 95(5)'),
    'doi_10_1086_229429': _doi('10.1086/229429', 'Hannan & Tuma (1990), American Journal of Sociology 95(5)'),
    'doi_10_1353_dem_0_0120': _doi('10.1353/dem.0.0120', 'Dahl (2010), Demography 47(3)'),
    'doi_10_2307_2061690': _doi('10.2307/2061690', 'Lillard, Brien & Waite (1995), Demography 32(3)'),
    'doi_10_3368_jhr_51_4_0214_6224r': _doi('10.3368/jhr.51.4.0214-6224r', 'Rotz (2016), Journal of Human Resources 51(4)'),
    'doi_10_1111_j_1741_3729_2012_00715_x': _doi('10.1111/j.1741-3729.2012.00715.x', 'Dew, Britt & Huston (2012), Family Relations 61(4)'),
    # ---- this project's own analyses ---------------------------------------------------
    'repo_nsfg_pooled': _repo('reproducibility/nsfg_pooled_first_marriage/METHODS.md', 'This project: NSFG 1995-2023 pooled first marriages, METHODS.md'),
    'repo_sipp': _repo('reproducibility/sipp_marital_history/METHODS.md', 'This project: SIPP marital histories and couples, METHODS.md'),
    # ---- decision-aid standards and risk communication ---------------------------------
    'pmc_PMC1553508': _pmc('PMC1553508', 'Elwyn et al. (2006), BMJ 333:417', 'https://pmc.ncbi.nlm.nih.gov/articles/PMC1553508/'),
    'pubmed_23963501': _pubmed('23963501', 'Joseph-Williams et al. (2014), Med Decis Making 34(6)'),
    'pmc_PMC4045391': _pmc('PMC4045391', 'Trevena et al. (2013), BMC Med Inform Decis Mak 13(Suppl 2):S7', 'https://pmc.ncbi.nlm.nih.gov/articles/PMC4045391/'),
    'pubmed_33660551': _pubmed('33660551', 'Bonner et al. (2021), Med Decis Making 41(7)'),
    'pmc_PMC6464912': _pmc('PMC6464912', 'Akl et al. (2011), Cochrane Database Syst Rev CD006776', 'https://pmc.ncbi.nlm.nih.gov/articles/PMC6464912/'),
    'pubmed_19290713': _pubmed('19290713', 'Galesic, Garcia-Retamero & Gigerenzer (2009), Health Psychol 28(2)'),
    'pmc_PMC2988162': _pmc('PMC2988162', 'Garcia-Retamero & Galesic (2010), J Gen Intern Med 25(12)', 'https://pmc.ncbi.nlm.nih.gov/articles/PMC2988162/'),
    'pmc_PMC8482297': _pmc('PMC8482297', 'Witteman et al. (2021), Med Decis Making 41(7)', 'https://pmc.ncbi.nlm.nih.gov/articles/PMC8482297/'),
    'pubmed_25133362': _pubmed('25133362', 'Zipkin et al. (2014), Ann Intern Med 161(4)'),
    'pmc_PMC7149229': _pmc('PMC7149229', 'van der Bles et al. (2020), PNAS 117(14)', 'https://pmc.ncbi.nlm.nih.gov/articles/PMC7149229/'),
    'pmc_PMC10823577': _pmc('PMC10823577', 'Stacey et al. (2024), Cochrane Database Syst Rev CD001431', 'https://pmc.ncbi.nlm.nih.gov/articles/PMC10823577/'),
}
