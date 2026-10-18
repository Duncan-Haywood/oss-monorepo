// Fictional "Acme Notes" answers and a fictional customer questionnaire.
// Nothing here describes a real company's controls.
export const SAMPLE_LIBRARY = `question,answer,tags
Do you require multi-factor authentication for all employee accounts?,Yes. Acme Notes enforces MFA on every employee account through our identity provider.,access
Is customer data encrypted at rest?,Yes. Customer data is encrypted at rest with AES-256.,encryption
Is data encrypted in transit?,Yes. All traffic uses TLS 1.2 or higher.,encryption
How often do you perform penetration tests?,An independent firm tests the application once a year and after major releases.,pentest
Do you have an incident response plan?,Yes. The plan is reviewed yearly and exercised in a tabletop test.,incident
Within how many hours will you notify customers of a security incident?,We notify affected customers within 72 hours of confirming an incident.,incident
Do you perform background checks on employees?,Yes. All employees are screened before their start date where the law allows.,people
Do you maintain backups and test restores?,Daily encrypted backups are kept for 30 days and a restore is tested every quarter.,continuity
Do you use subprocessors that handle customer data?,Yes. The current list is published on our trust page and customers are told before changes.,vendors
Do you have a SOC 2 Type II report?,Yes. A report is available under NDA.,compliance
`;

export const SAMPLE_QUESTIONS = `1.1 Is multi-factor authentication enforced for all staff?
1.2 Describe how customer data is encrypted when stored.
1.3 Do you encrypt data sent over public networks?
2.1 How frequently is a third-party penetration test conducted?
2.2 Will you tell us about a breach within 24 hours?
2.3 Do you NOT allow staff to access production data without approval?
3.1 Do you carry cyber insurance and for what limit?
3.2 Is a SOC 2 Type II or ISO 27001 report available?
3.3 List the data centre regions where customer data is stored.
3.4 Do you run annual security awareness training?
`;
