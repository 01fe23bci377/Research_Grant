'use strict';

const { FACULTY, facultyUsers } = require('./faculty');

/**
 * Seed corpus for the AURA grant system.
 *
 * Everything here is synthetic demo data for evaluation. The two records at the
 * bottom of CALLS exist to prove the discovery guardrail: one expired, one from
 * an unverified aggregator.
 */

/* ------------------------------- 8 agents -------------------------------- */

const AGENTS = [
  {
    id: 'coordinator', order: 0, group: 'Orchestration', name: 'apniLeap AURA Coordinator', short: 'Coordinator',
    stage: 'Intake & orchestration', kind: 'ai',
    role: 'Receives the faculty/Dean R&D prompt command, checks permissions, creates the run plan, initializes agents with scoped instructions, and monitors state.',
    guardrails: 'Never bypass human approval; enforce data scope, audit logging, source citation, and exception routing.',
    inputs: ['Faculty request', 'Run parameters', 'Actor permissions', 'Locked plan'],
    outputs: ['Clarified request', 'Locked run plan', 'Scoped task packets', 'Run state'],
    tools: ['connector.invoke', 'memory.retrieve', 'runtime.checkpoint'],
  },
  {
    id: 'funding', order: 1, group: 'Group A', name: 'Funding Discovery Agent', short: 'Funding Discovery',
    stage: 'Parallel discovery', kind: 'ai',
    role: "Surfaces funding calls matched to a faculty member's research area, eligibility, and deadline window, aggregating agency listings (DST, SERB, AICTE, industry CSR). Receives a task packet from apniLeap AURA in parallel with Group B, and returns a ranked list of matching calls.",
    guardrails: 'Surface only calls from verified, approved funding agencies; never present an expired or unverified call as active; cite the source and deadline for every call.',
    inputs: ['Clarified request', 'Funding call store', 'Eligibility profile'],
    outputs: ['Ranked call list', 'Match rationale', 'Deadline window'],
    tools: ['funding.calls', 'funding.guidelines', 'scoring.match'],
  },
  {
    id: 'literature', order: 2, group: 'Group B', name: 'Literature Review Agent', short: 'Literature Review',
    stage: 'Parallel discovery', kind: 'ai',
    role: "Compiles related work and a novelty/gap summary for the faculty member's proposed research area, drawing from approved academic databases. Receives a task packet from apniLeap AURA in parallel with Group A, and returns a structured literature summary with citations.",
    guardrails: 'Cite every claim to a real, verifiable source; never fabricate a reference; flag areas where existing literature coverage is thin rather than overstating novelty.',
    inputs: ['Clarified request', 'Approved literature corpus', 'Prior proposals'],
    outputs: ['Related work summary', 'Novelty & gap analysis', 'Citation list'],
    tools: ['literature.corpus', 'history.proposals', 'similarity.cosine'],
  },
  {
    id: 'drafting', order: 3, group: 'Group C', name: 'Proposal Drafting Agent', short: 'Proposal Drafting',
    stage: 'Sequential drafting', kind: 'ai',
    role: "Drafts the proposal narrative — objectives, methodology, timeline — using the matched funding call's requirements and the literature summary. Receives the combined output of Groups A and B via apniLeap AURA and returns a structured draft proposal.",
    guardrails: 'Draft only within the scope the faculty member provided; mark all AI-generated text clearly as a draft requiring faculty edit; never present preliminary findings as established results.',
    inputs: ['Matched call + guidelines', 'Literature summary', 'Personnel data', 'Domain template'],
    outputs: ['Structured draft proposal', 'Claim-level evidence links'],
    tools: ['plan.read', 'skill.plan', 'skill.format'],
  },
  {
    id: 'budget', order: 4, group: 'Group D', name: 'Budget Planning Agent', short: 'Budget Planning',
    stage: 'Parallel budget & compliance', kind: 'ai',
    role: "Prepares the budget breakup — manpower, equipment, consumables, travel, overheads — per the funding agency's norms and limits. Receives the draft proposal from apniLeap AURA in parallel with Group E, and returns a structured, itemized budget.",
    guardrails: "Use only the funding agency's approved budget templates and ceilings; flag any line item exceeding agency norms; never round or adjust figures without showing the basis.",
    inputs: ['Draft proposal', 'Agency budget rules', 'Personnel & rate data'],
    outputs: ['Itemized budget', 'Cap checks', 'Budget justification'],
    tools: ['budget.personnel', 'budget.rates', 'budget.compute'],
  },
  {
    id: 'compliance', order: 5, group: 'Group E', name: 'Compliance Checking Agent', short: 'Compliance Checking',
    stage: 'Parallel budget & compliance', kind: 'ai',
    role: "Checks the draft proposal and budget against the funding agency's eligibility, formatting, and documentation requirements. Receives the draft proposal from apniLeap AURA in parallel with Group D, and returns a compliance checklist with pass/fail per requirement.",
    guardrails: "Check only against the specific agency's published guidelines for this call; never mark a requirement compliant without evidence; flag ambiguous requirements for human interpretation.",
    inputs: ['Draft proposal', 'Budget', 'Call guidelines', 'Compliance rules'],
    outputs: ['Pass/fail checklist', 'Manual-interpretation flags', 'Remediation notes'],
    tools: ['compliance.rules', 'policy.institutional', 'checks.evaluate'],
  },
  {
    id: 'submission', order: 6, group: 'Group F', name: 'Submission Agent', short: 'Submission',
    stage: 'Sequential packaging', kind: 'ai',
    role: "Packages the final proposal, budget, and compliance checklist into the funding agency's required submission format. Receives the combined output of Groups D and E via apniLeap AURA and returns a submission-ready package.",
    guardrails: 'Do not submit to the funding agency without Dean R&D/HoD/Research Office sign-off; keep a version-controlled record of the submitted package; never alter a figure or claim after compliance sign-off without re-triggering review.',
    inputs: ['Approved draft', 'Budget', 'Compliance checklist', 'Agency format'],
    outputs: ['Submission-ready package', 'Manifest + checksum', 'Version record'],
    tools: ['format.package', 'governance.version'],
  },
  {
    id: 'review', order: 7, group: 'Human authority', name: 'Dean R&D / HoD / Research Office Review', short: 'Research Office Review',
    stage: 'Stakeholder approval', kind: 'human',
    role: "Reviews the submission-ready package, budget, and compliance checklist; approves or requests corrections; and authorizes final submission to the funding agency. apniLeap AURA then resumes the relevant agent.",
    guardrails: "Dean R&D/HoD/Research Office decision is the final authority for authorizing a grant proposal's submission.",
    inputs: ['Submission-ready package', 'Compliance checklist', 'Budget'],
    outputs: ['Approval decision', 'Corrections routed to the owning agent'],
    tools: ['governance.approve', 'governance.rollback'],
  },
];

/* ----------------------------- institution -------------------------------- */

const INSTITUTION = {
  id: 'inst-mist',
  name: 'Meridian Institute of Science and Technology',
  short: 'MIST',
  type: 'university',
  city: 'Pune',
  country: 'IN',
  researchOffice: 'Research & Development Office',
  signatory: 'Dean, Research & Development',
};

const PERSONNEL = [
  { id: 'per-uma', name: 'Dr. Uma Mudengudi', role: 'PI', title: 'Dean (R&D) & Professor', department: 'SoECE', monthlyCost: 0, defaultEffortPct: 10, careerStage: 'associate', expertise: ['embedded systems', 'VLSI', 'applied AI'] },
  { id: 'per-suneeta', name: 'Dr. Suneeta V Budihal', role: 'PI', title: 'Faculty Member', department: 'SoECE', monthlyCost: 0, defaultEffortPct: 10, careerStage: 'associate', expertise: ['computer vision', 'precision agriculture'] },
  { id: 'per-satyadhyan', name: 'Dr. Satyadhyan Chickerur', role: 'PI', title: 'Faculty Member', department: 'CSE', monthlyCost: 0, defaultEffortPct: 10, careerStage: 'associate', expertise: ['distributed computing', 'diabetic retinopathy'] },
  { id: 'per-arun', name: 'Dr. Arun Y Patil', role: 'Co-I', title: 'Faculty Member', department: 'SME', monthlyCost: 0, defaultEffortPct: 10, careerStage: 'associate', expertise: ['design', 'tribology', 'materials'] },
  { id: 'per-ujwala', name: 'Dr. Ujwala Patil', role: 'Co-I', title: 'Faculty Member', department: 'ECE', monthlyCost: 0, defaultEffortPct: 10, careerStage: 'associate', expertise: ['visual intelligence', 'medical imaging'] },
  { id: 'per-sangeeta', name: 'Dr. Sangeeta B Kolavekar', role: 'Co-I', title: 'Faculty Member', department: 'Physics', monthlyCost: 0, defaultEffortPct: 10, careerStage: 'associate', expertise: ['metal nano particles', 'optodevices'] },
  { id: 'per-saroja', name: 'Dr. Saroja V Siddamal', role: 'Co-I', title: 'Faculty Member', department: 'SoECE', monthlyCost: 0, defaultEffortPct: 10, careerStage: 'associate', expertise: ['LPWAN', 'ASIC/SoC'] },
  { id: 'per-ra', name: 'Research Associate (to be appointed)', role: 'RA', title: 'Research Associate', department: 'Research Office', monthlyCost: 48000, defaultEffortPct: 100, careerStage: 'n/a', expertise: [] },
  { id: 'per-phd', name: 'Doctoral Scholar (to be appointed)', role: 'PhD', title: 'Doctoral Scholar', department: 'Research Office', monthlyCost: 36000, defaultEffortPct: 100, careerStage: 'n/a', expertise: [] },
];

const RATE_CARD = {
  institutionId: 'inst-mist',
  overheadPct: 15,
  contingencyPct: 5,
  salaryEscalationPct: 5,
  equipmentMaintenancePct: 4,
  effectiveFrom: '2026-04-01',
  note: 'Institutional default rates. Agency-published rates for a call always take precedence.',
};

const USERS = [
  { id: 'usr-krishnan', name: 'Dr. Uma Mudengudi', email: 'uma.mudengudi@mist.edu.in', password: 'password123', role: 'dean', title: 'Dean, Research & Development', department: 'Office of Dean R&D', permissions: ['run:create', 'run:read:all', 'review:approve', 'package:view', 'audit:read', 'version:rollback', 'metrics:read'] },
  ...facultyUsers(),
  { id: 'usr-research-office', name: 'Research & Development Office', email: 'grants.cell@mist.edu.in', password: 'password123', role: 'research_office', title: 'Grants Cell & Compliance', department: 'Office of Dean R&D', permissions: ['run:create', 'run:read:all', 'review:approve', 'package:view', 'audit:read', 'version:rollback'] },
  { id: 'usr-admin', name: 'Platform Administrator', email: 'admin@mist.edu.in', password: 'password123', role: 'admin', title: 'AURA Platform Administrator', department: 'Central IT', permissions: ['run:create', 'run:read:all', 'review:approve', 'audit:read', 'version:rollback', 'metrics:read', 'connector:invoke'] },
];

const POLICIES = [
  { id: 'pol-overhead', title: 'Institutional overhead and costing policy', tags: ['budget', 'overhead'], text: 'Overheads are charged at the rate published by the funding agency for the call. Where the agency publishes no rate, the institutional default of 15% of total direct costs applies. Overhead may not fund permanent faculty salaries.' },
  { id: 'pol-ethics', title: 'Human subjects research ethics policy', tags: ['compliance', 'ethics', 'health'], text: 'Any proposal involving human participants, identifiable health data or clinical validation requires Institutional Ethics Committee approval before the award is activated. A conditional certificate may be attached at submission and must be converted to full approval before funds are released.' },
  { id: 'pol-data', title: 'Research data protection policy (DPDP-aligned)', tags: ['compliance', 'data', 'privacy'], text: 'Proposals collecting personal data must include a Data Management Plan covering lawful basis, de-identification, storage location, retention period and a named data steward. Cross-border transfer of health data requires a documented risk assessment.' },
  { id: 'pol-ai', title: 'Disclosure of AI-assisted writing', tags: ['compliance', 'ai', 'authorship'], text: 'AI-assisted drafting must be disclosed in the proposal cover declaration and in the institutional submission record. AI-generated text is a draft until a named faculty member reviews and accepts it; AI tools may not be listed as authors or investigators.' },
  { id: 'pol-coi', title: 'Conflict of interest declaration', tags: ['compliance', 'coi'], text: 'Every investigator must declare financial interests, advisory roles and institutional relationships that could reasonably be perceived to influence the research. Declarations are collected by the Research Office and retained for the audit period.' },
  { id: 'pol-signoff', title: 'Authorised signatory policy', tags: ['compliance', 'approval'], text: 'Only the Dean, Research & Development, or a delegated Research Office signatory, may authorise submission to a funding agency. The authorising officer must record the decision, the version reviewed, and any conditions attached to approval.' },
];

const COMPLIANCE_RULES = [
  { id: 'rule-sections', kind: 'sections', appliesTo: 'all', severity: 'blocking', requirement: 'Every section required by the call is present and non-empty.', evidence: 'Call required-section list vs draft section index.' },
  { id: 'rule-pages', kind: 'pageLimit', appliesTo: 'all', severity: 'blocking', requirement: 'The narrative stays within the page limit published for the call.', evidence: 'Word count converted at 500 words per page.' },
  { id: 'rule-budget-ceiling', kind: 'budgetCeiling', appliesTo: 'all', severity: 'blocking', requirement: 'The requested total does not exceed the agency ceiling for this call.', evidence: 'Budget total vs call award maximum.' },
  { id: 'rule-budget-floor', kind: 'budgetFloor', appliesTo: 'all', severity: 'advisory', requirement: 'The requested total meets the agency minimum award for this call.', evidence: 'Budget total vs call award minimum.' },
  { id: 'rule-equipment-cap', kind: 'equipmentCap', appliesTo: 'all', severity: 'blocking', requirement: 'Equipment does not exceed the percentage ceiling in the call guidelines.', evidence: 'Equipment subtotal / total requested.' },
  { id: 'rule-salary-cap', kind: 'salaryCap', appliesTo: 'all', severity: 'blocking', requirement: 'Manpower costs stay within the call salary ceiling.', evidence: 'Personnel subtotal / total requested.' },
  { id: 'rule-overhead', kind: 'overheadRate', appliesTo: 'all', severity: 'blocking', requirement: 'Overhead is charged at exactly the rate published for the call.', evidence: 'Overhead amount vs rate x direct costs.' },
  { id: 'rule-eligibility-stage', kind: 'eligibilityStage', appliesTo: 'all', severity: 'blocking', requirement: 'The PI career stage is eligible for this call.', evidence: 'PI profile vs call eligibility.' },
  { id: 'rule-eligibility-institution', kind: 'eligibilityInstitution', appliesTo: 'all', severity: 'blocking', requirement: 'The institution type is eligible for this call.', evidence: 'Institution record vs call eligibility.' },
  { id: 'rule-consortium', kind: 'consortium', appliesTo: 'all', severity: 'blocking', requirement: 'A consortium of the required minimum size is declared where the call mandates one.', evidence: 'Declared partners vs call consortium rule.' },
  { id: 'rule-deadline', kind: 'deadline', appliesTo: 'all', severity: 'blocking', requirement: 'Submission is scheduled with the internal review buffer before the agency deadline.', evidence: 'Today + review buffer vs call deadline.' },
  { id: 'rule-ethics', kind: 'document', docKey: 'ethics', appliesTo: 'all', severity: 'blocking', requirement: 'Ethics clearance is attached where the call or the research involves human participants.', evidence: 'Document register vs call requirement.' },
  { id: 'rule-coi', kind: 'document', docKey: 'coi', appliesTo: 'all', severity: 'blocking', requirement: 'Conflict-of-interest declarations are attached for all investigators.', evidence: 'Document register vs call requirement.' },
  { id: 'rule-dmp', kind: 'document', docKey: 'dmp', appliesTo: 'all', severity: 'blocking', requirement: 'A Data Management Plan is attached where required.', evidence: 'Document register vs call requirement.' },
  { id: 'rule-disclosure', kind: 'aiDisclosure', appliesTo: 'all', severity: 'blocking', requirement: 'AI-assisted drafting is disclosed in the submission declaration.', evidence: 'Institutional AI disclosure policy vs package declaration.' },
  { id: 'rule-anonymity', kind: 'anonymity', appliesTo: 'international', severity: 'manual', requirement: 'Two-stage calls require an anonymised first-stage narrative.', evidence: 'Agency guide; requires human interpretation.' },
  { id: 'rule-csr', kind: 'csrEligibility', appliesTo: 'industry', severity: 'blocking', requirement: 'The activity qualifies as CSR under Section 135 Schedule VII and a CSR-1 registration is attached.', evidence: 'Company CSR policy vs activity description.' },
  { id: 'rule-open-science', kind: 'openScience', appliesTo: 'international', severity: 'advisory', requirement: 'Open-science outputs are described in the impact section.', evidence: 'Draft impact section vs open-science requirement.' },
];

const DOCUMENT_REGISTER = [
  { key: 'ethics', label: 'Institutional Ethics Committee clearance', status: 'conditional', note: 'Conditional certificate available; full approval pending protocol review.' },
  { key: 'coi', label: 'Conflict-of-interest declarations (all investigators)', status: 'attached', note: 'Signed by all investigators.' },
  { key: 'dmp', label: 'Data Management Plan', status: 'attached', note: 'Deposited in the institutional DMP registry.' },
  { key: 'budget-justification', label: 'Budget justification', status: 'attached', note: 'Generated by the Budget Planning Agent.' },
  { key: 'csr-1', label: 'CSR-1 registration and company CSR policy', status: 'pending', note: 'Company secretarial certificate requested.' },
  { key: 'consortium-agreement', label: 'Consortium agreement and partner letters', status: 'pending', note: 'Letters of intent collected; agreement under legal review.' },
];

/* ------------------------------ funding calls ----------------------------- */

function mk(def) {
  const id = def.id;
  return {
    currency: 'INR', status: 'open', verified: true, pageLimit: 25, country: 'IN',
    ...def,
    requiredDocuments: (def.requiredDocuments || []).map((d) => ({ required: true, condition: null, ...d })),
    guidelines: (def.guidelines || []).map((g, i) => ({ id: `${id}#g${i + 1}`, section: g.section, text: g.text })),
    reviewCriteria: def.reviewCriteria || [
      { criterion: 'Scientific merit and originality', weight: 0.4 },
      { criterion: 'Feasibility and methodology', weight: 0.3 },
      { criterion: 'Team capability and infrastructure', weight: 0.2 },
      { criterion: 'Impact and dissemination', weight: 0.1 },
    ],
  };
}

const CALLS = [
  mk({
    id: 'call-serb-crg', agency: 'SERB', agencyFull: 'Science and Engineering Research Board, DST',
    program: 'Core Research Grant (CRG)', title: 'SERB Core Research Grant 2026 — Individual Investigator',
    fundingType: 'government',
    domains: ['ai-ml', 'energy', 'materials', 'health', 'climate'],
    tags: ['artificial intelligence', 'machine learning', 'federated learning', 'sustainable energy', 'materials science', 'medical imaging'],
    deadline: '2026-12-15', opensAt: '2026-09-01', budgetMin: 3000000, budgetMax: 7500000, durationMonths: 36, pageLimit: 25,
    eligibility: { careerStages: ['assistant', 'associate', 'professor'], institutionTypes: ['university', 'institute'], piCitizenship: 'IN', consortiumRequired: false, minPartners: 0, coFundingRequired: false },
    requiredSections: ['abstract', 'objectives', 'background', 'methodology', 'timeline', 'team', 'outcomes', 'data-management', 'budget-justification', 'references'],
    requiredDocuments: [
      { key: 'coi', label: 'Conflict-of-interest declarations' },
      { key: 'budget-justification', label: 'Budget justification' },
      { key: 'dmp', label: 'Data Management Plan' },
      { key: 'ethics', label: 'Ethics clearance (if human participants)', required: false, condition: 'human-subjects' },
    ],
    budgetRules: { overheadPct: 15, salaryCapPct: 45, equipmentCapPct: 40, travelCapPct: 10, contingencyPct: 5 },
    guidelines: [
      { section: 'submission', text: 'Proposals must be routed through the institutional research office; individual submissions are not accepted.' },
      { section: 'budget', text: 'The total request may not exceed INR 75,00,000 for a duration of up to 36 months.' },
      { section: 'budget', text: 'Equipment may not exceed 40% of the total requested budget; requests above this ceiling require a written justification from the Head of Institution.' },
      { section: 'budget', text: 'Overheads are payable at 15% of total direct costs.' },
      { section: 'documents', text: 'A Data Management Plan and a conflict-of-interest declaration are mandatory at submission.' },
      { section: 'format', text: 'The narrative may not exceed 25 pages excluding references and the budget annexure.' },
    ],
    sourceUrl: 'https://example.org/serb/crg-2026',
  }),
  mk({
    id: 'call-icmr-adhoc', agency: 'ICMR', agencyFull: 'Indian Council of Medical Research',
    program: 'Ad-hoc Research Project', title: 'ICMR Ad-hoc Research Project 2026 — Diagnostics & Public Health',
    fundingType: 'government', domains: ['health', 'ai-ml', 'public-health'],
    tags: ['diabetic retinopathy', 'medical imaging', 'rural health', 'screening', 'federated learning', 'digital health', 'primary care'],
    deadline: '2026-12-05', opensAt: '2026-09-05', budgetMin: 2000000, budgetMax: 6000000, durationMonths: 36, pageLimit: 25,
    eligibility: { careerStages: ['assistant', 'associate', 'professor'], institutionTypes: ['university', 'institute', 'hospital'], piCitizenship: 'IN', consortiumRequired: false, minPartners: 0, coFundingRequired: false },
    requiredSections: ['abstract', 'objectives', 'background', 'methodology', 'timeline', 'team', 'outcomes', 'data-management', 'budget-justification', 'references'],
    requiredDocuments: [
      { key: 'ethics', label: 'Institutional Ethics Committee clearance' },
      { key: 'coi', label: 'Conflict-of-interest declarations' },
      { key: 'dmp', label: 'Data Management Plan' },
      { key: 'budget-justification', label: 'Budget justification' },
    ],
    budgetRules: { overheadPct: 15, salaryCapPct: 50, equipmentCapPct: 30, travelCapPct: 10, contingencyPct: 5 },
    guidelines: [
      { section: 'eligibility', text: 'Applicants must hold a regular position in a recognised institution or hospital and demonstrate access to the study population.' },
      { section: 'budget', text: 'The total request must fall between INR 20,00,000 and INR 60,00,000; equipment is capped at 30%.' },
      { section: 'ethics', text: 'Institutional Ethics Committee approval is mandatory for any study involving human participants or their data.' },
      { section: 'data', text: 'A Data Management Plan describing de-identification and retention is required; identifiable health data may not leave the institution without a documented risk assessment.' },
      { section: 'deliverables', text: 'The proposal must state measurable clinical or public-health outcomes for the funding period.' },
    ],
    sourceUrl: 'https://example.org/icmr/adhoc-2026',
  }),
  mk({
    id: 'call-dst-icps', agency: 'DST', agencyFull: 'Department of Science & Technology',
    program: 'Interdisciplinary Cyber-Physical Systems (ICPS)', title: 'DST ICPS 2026 — Cyber-Physical Systems for Public Good',
    fundingType: 'government', domains: ['ai-ml', 'robotics', 'manufacturing', 'mobility', 'health'],
    tags: ['cyber-physical systems', 'edge computing', 'robotics', 'digital twins', 'federated learning', 'smart manufacturing'],
    deadline: '2026-11-30', opensAt: '2026-08-15', budgetMin: 5000000, budgetMax: 12000000, durationMonths: 36, pageLimit: 30,
    eligibility: { careerStages: ['assistant', 'associate', 'professor'], institutionTypes: ['university', 'institute'], piCitizenship: 'IN', consortiumRequired: false, minPartners: 0, coFundingRequired: true },
    requiredSections: ['abstract', 'objectives', 'background', 'methodology', 'timeline', 'team', 'outcomes', 'data-management', 'budget-justification', 'references'],
    requiredDocuments: [
      { key: 'coi', label: 'Conflict-of-interest declarations' },
      { key: 'budget-justification', label: 'Budget justification with industry co-funding letter' },
      { key: 'dmp', label: 'Data Management Plan' },
    ],
    budgetRules: { overheadPct: 12, salaryCapPct: 40, equipmentCapPct: 50, travelCapPct: 8, contingencyPct: 5 },
    guidelines: [
      { section: 'scope', text: 'Proposals must address an interdisciplinary cyber-physical system with a validated deployment partner.' },
      { section: 'budget', text: 'Requests between INR 50,00,000 and INR 1,20,00,000 are considered; industry co-funding of at least 10% is expected.' },
      { section: 'budget', text: 'Equipment is capped at 50% of the total request and overheads at 12%.' },
      { section: 'deliverables', text: 'Each proposal must define at least three measurable milestones with acceptance criteria.' },
    ],
    sourceUrl: 'https://example.org/dst/icps-2026',
  }),
  mk({
    id: 'call-aicte-rps', agency: 'AICTE', agencyFull: 'All India Council for Technical Education',
    program: 'Research Promotion Scheme (RPS)', title: 'AICTE Research Promotion Scheme 2026',
    fundingType: 'government', domains: ['education', 'ai-ml', 'engineering'],
    tags: ['engineering education', 'teaching innovation', 'artificial intelligence', 'outcome-based education', 'laboratory development'],
    deadline: '2026-11-20', opensAt: '2026-09-10', budgetMin: 500000, budgetMax: 2000000, durationMonths: 24, pageLimit: 20,
    eligibility: { careerStages: ['assistant', 'associate'], institutionTypes: ['university', 'institute', 'college'], piCitizenship: 'IN', consortiumRequired: false, minPartners: 0, coFundingRequired: false },
    requiredSections: ['abstract', 'objectives', 'background', 'methodology', 'timeline', 'team', 'outcomes', 'budget-justification', 'references'],
    requiredDocuments: [
      { key: 'coi', label: 'Conflict-of-interest declarations' },
      { key: 'budget-justification', label: 'Budget justification' },
    ],
    budgetRules: { overheadPct: 10, salaryCapPct: 40, equipmentCapPct: 35, travelCapPct: 12, contingencyPct: 5 },
    guidelines: [
      { section: 'eligibility', text: 'The Principal Investigator must be a regular faculty member at Assistant or Associate Professor level.' },
      { section: 'budget', text: 'The maximum grant is INR 20,00,000 for 24 months, with equipment limited to 35% of the total.' },
      { section: 'scope', text: 'Proposals must demonstrate a direct improvement to technical education outcomes.' },
    ],
    sourceUrl: 'https://example.org/aicte/rps-2026',
  }),
  mk({
    id: 'call-eu-horizon', agency: 'EU Horizon Europe', agencyFull: 'European Commission — Horizon Europe',
    program: 'Cluster 4: Digital, Industry and Space', title: 'Horizon Europe 2027 — Trustworthy AI for Health Systems (RIA)',
    fundingType: 'international', domains: ['ai-ml', 'health', 'digital'],
    tags: ['trustworthy ai', 'federated learning', 'health systems', 'digital health', 'data governance', 'open science'],
    deadline: '2027-01-20', opensAt: '2026-10-01', budgetMin: 18000000, budgetMax: 45000000, durationMonths: 36, pageLimit: 45,
    eligibility: { careerStages: ['assistant', 'associate', 'professor'], institutionTypes: ['university', 'institute', 'hospital'], piCitizenship: null, consortiumRequired: true, minPartners: 3, coFundingRequired: false },
    requiredSections: ['excellence', 'objectives', 'methodology', 'impact', 'implementation', 'consortium', 'ethics-security', 'data-management', 'budget-justification', 'references'],
    requiredDocuments: [
      { key: 'dmp', label: 'Data Management Plan (FAIR)' },
      { key: 'consortium-agreement', label: 'Consortium agreement and partner letters' },
      { key: 'ethics', label: 'Ethics and security self-assessment' },
      { key: 'coi', label: 'Conflict-of-interest declarations' },
    ],
    budgetRules: { overheadPct: 25, salaryCapPct: 40, equipmentCapPct: 30, travelCapPct: 15, contingencyPct: 0 },
    guidelines: [
      { section: 'eligibility', text: 'Proposals require a consortium of at least three independent legal entities from three different countries.' },
      { section: 'budget', text: 'The requested EU contribution must be between EUR 2.0 million and EUR 5.0 million, roughly INR 18,00,00,000 to INR 45,00,00,000.' },
      { section: 'budget', text: 'Personnel costs may not exceed 40% and equipment 30% of the total eligible cost; a 25% flat rate covers indirect costs.' },
      { section: 'open-science', text: 'Open science practices, FAIR data management and a gender and inclusion plan are evaluated under the impact criterion.' },
      { section: 'ethics', text: 'An ethics and security self-assessment is mandatory; AI components must describe human oversight and bias mitigation.' },
    ],
    sourceUrl: 'https://example.org/eu/horizon-cluster4-2027',
  }),
  mk({
    id: 'call-gates-gc', agency: 'Gates Foundation', agencyFull: 'Bill & Melinda Gates Foundation',
    program: 'Grand Challenges', title: 'Grand Challenges 2026 — AI for Primary Health Care',
    fundingType: 'international', domains: ['health', 'ai-ml', 'public-health'],
    tags: ['primary care', 'ai diagnostics', 'federated learning', 'low-resource settings', 'maternal health'],
    deadline: '2026-12-01', opensAt: '2026-09-01', budgetMin: 8500000, budgetMax: 34000000, durationMonths: 18, pageLimit: 15,
    eligibility: { careerStages: ['assistant', 'associate', 'professor'], institutionTypes: ['university', 'institute', 'hospital', 'ngo'], piCitizenship: null, consortiumRequired: false, minPartners: 0, coFundingRequired: false },
    requiredSections: ['abstract', 'objectives', 'background', 'methodology', 'timeline', 'team', 'outcomes', 'budget-justification', 'references'],
    requiredDocuments: [
      { key: 'coi', label: 'Conflict-of-interest declarations' },
      { key: 'dmp', label: 'Data Management Plan' },
      { key: 'budget-justification', label: 'Budget justification' },
    ],
    budgetRules: { overheadPct: 12, salaryCapPct: 45, equipmentCapPct: 25, travelCapPct: 12, contingencyPct: 5 },
    guidelines: [
      { section: 'scope', text: 'Projects must demonstrate a credible path to impact in low- and middle-income country primary care within 18 months.' },
      { section: 'budget', text: 'Awards range from USD 100,000 to USD 400,000; equipment is limited to 25% of the request.' },
      { section: 'metrics', text: 'Applicants must define baseline and target values for at least two primary outcome metrics.' },
    ],
    sourceUrl: 'https://example.org/gates/gc-2026',
  }),
  mk({
    id: 'call-dst-daad', agency: 'DST–DAAD', agencyFull: 'DST (India) — DAAD (Germany) Bilateral Programme',
    program: 'Bilateral Research Mobility', title: 'DST–DAAD Bilateral Research Mobility 2026',
    fundingType: 'international', domains: ['ai-ml', 'health', 'materials', 'climate'],
    tags: ['research mobility', 'federated learning', 'digital health', 'joint supervision', 'capacity building'],
    deadline: '2026-11-25', opensAt: '2026-08-20', budgetMin: 2000000, budgetMax: 8000000, durationMonths: 24, pageLimit: 20,
    eligibility: { careerStages: ['assistant', 'associate', 'professor'], institutionTypes: ['university', 'institute'], piCitizenship: 'IN', consortiumRequired: true, minPartners: 2, coFundingRequired: false },
    requiredSections: ['abstract', 'objectives', 'background', 'methodology', 'timeline', 'team', 'outcomes', 'budget-justification', 'references'],
    requiredDocuments: [
      { key: 'consortium-agreement', label: 'Bilateral partner letter of intent' },
      { key: 'coi', label: 'Conflict-of-interest declarations' },
      { key: 'budget-justification', label: 'Budget justification' },
    ],
    budgetRules: { overheadPct: 10, salaryCapPct: 30, equipmentCapPct: 20, travelCapPct: 25, contingencyPct: 5 },
    guidelines: [
      { section: 'eligibility', text: 'Each proposal must name at least one partner institution in Germany and one in India.' },
      { section: 'budget', text: 'Mobility grants range from INR 20,00,000 to INR 80,00,000; travel and mobility may absorb up to 25%.' },
      { section: 'deliverables', text: 'Joint publications and at least two exchange visits per year are expected deliverables.' },
    ],
    sourceUrl: 'https://example.org/dst-daad/mobility-2026',
  }),
  mk({
    id: 'call-tata-csr', agency: 'Tata Trusts', agencyFull: 'Tata Trusts — Corporate Social Responsibility',
    program: 'CSR Research Partnership', title: 'Tata Trusts CSR Research Partnership 2026 — Health & Education',
    fundingType: 'industry', domains: ['health', 'education', 'public-health'],
    tags: ['community health', 'digital health', 'education technology', 'rural outreach', 'screening'],
    deadline: '2026-11-15', opensAt: '2026-08-01', budgetMin: 2500000, budgetMax: 10000000, durationMonths: 24, pageLimit: 20,
    eligibility: { careerStages: ['assistant', 'associate', 'professor'], institutionTypes: ['university', 'institute', 'hospital', 'ngo'], piCitizenship: 'IN', consortiumRequired: false, minPartners: 0, coFundingRequired: false },
    requiredSections: ['executive-summary', 'need-assessment', 'objectives', 'approach', 'implementation-plan', 'monitoring-evaluation', 'sustainability', 'budget-justification', 'compliance', 'references'],
    requiredDocuments: [
      { key: 'csr-1', label: 'CSR-1 registration and company CSR policy' },
      { key: 'coi', label: 'Conflict-of-interest declarations' },
      { key: 'budget-justification', label: 'Budget justification' },
    ],
    budgetRules: { overheadPct: 8, salaryCapPct: 55, equipmentCapPct: 25, travelCapPct: 10, contingencyPct: 3 },
    guidelines: [
      { section: 'compliance', text: 'The activity must fall within Schedule VII of the Companies Act 2013 and the implementing partner must hold a valid CSR-1 registration.' },
      { section: 'budget', text: 'Grants range from INR 25,00,000 to INR 1,00,00,000 over 24 months; overheads are capped at 8%.' },
      { section: 'reporting', text: 'Quarterly outcome reporting against agreed indicators is a condition of release of the second tranche.' },
      { section: 'sustainability', text: 'Applicants must describe how the activity continues after CSR funding ends.' },
    ],
    sourceUrl: 'https://example.org/tata/csr-2026',
  }),
  mk({
    id: 'call-infosys-foundation', agency: 'Infosys Foundation', agencyFull: 'Infosys Foundation',
    program: 'Education & Health Technology Grant', title: 'Infosys Foundation Grant 2027 — Assistive & Learning Technology',
    fundingType: 'industry', domains: ['education', 'health', 'ai-ml'],
    tags: ['assistive technology', 'learning analytics', 'education technology', 'accessibility', 'digital inclusion'],
    deadline: '2027-01-10', opensAt: '2026-10-15', budgetMin: 1000000, budgetMax: 5000000, durationMonths: 18, pageLimit: 15,
    eligibility: { careerStages: ['assistant', 'associate', 'professor'], institutionTypes: ['university', 'institute', 'college', 'ngo'], piCitizenship: 'IN', consortiumRequired: false, minPartners: 0, coFundingRequired: false },
    requiredSections: ['executive-summary', 'need-assessment', 'objectives', 'approach', 'implementation-plan', 'monitoring-evaluation', 'sustainability', 'budget-justification', 'compliance', 'references'],
    requiredDocuments: [
      { key: 'coi', label: 'Conflict-of-interest declarations' },
      { key: 'budget-justification', label: 'Budget justification' },
    ],
    budgetRules: { overheadPct: 5, salaryCapPct: 50, equipmentCapPct: 30, travelCapPct: 12, contingencyPct: 3 },
    guidelines: [
      { section: 'scope', text: 'Proposals must improve access to education or healthcare for underserved groups.' },
      { section: 'budget', text: 'Grants range from INR 10,00,000 to INR 50,00,000 over 18 months; overheads are capped at 5%.' },
      { section: 'evaluation', text: 'The proposal must specify a pre/post evaluation design with an independent assessor.' },
    ],
    sourceUrl: 'https://example.org/infosys/education-2027',
  }),
  mk({
    id: 'call-serb-supra-expired', agency: 'SERB', agencyFull: 'Science and Engineering Research Board, DST',
    program: 'SUPRA', title: 'SERB SUPRA 2026 — Closed',
    fundingType: 'government', domains: ['ai-ml', 'health'], tags: ['artificial intelligence', 'medical imaging'],
    deadline: '2026-06-30', opensAt: '2026-03-01', budgetMin: 1000000, budgetMax: 3000000, durationMonths: 24, status: 'closed',
    requiredSections: ['abstract', 'objectives', 'methodology'],
    eligibility: { careerStages: ['assistant', 'associate', 'professor'], institutionTypes: ['university'], consortiumRequired: false, minPartners: 0 },
    budgetRules: { overheadPct: 15, salaryCapPct: 45, equipmentCapPct: 40, travelCapPct: 10, contingencyPct: 5 },
    guidelines: [{ section: 'status', text: 'This call closed on 30 June 2026 and is retained for reference only.' }],
    sourceUrl: 'https://example.org/serb/supra-2026',
  }),
  mk({
    id: 'call-aicte-modrob-unverified', agency: 'Unknown Aggregator', agencyFull: 'Third-party opportunity aggregator',
    program: 'MODROB (unverified listing)', title: 'AICTE MODROB 2027 — Unverified Listing',
    fundingType: 'government', domains: ['engineering', 'education'], tags: ['laboratory development', 'engineering education'],
    deadline: '2027-02-01', opensAt: '2026-10-01', budgetMin: 800000, budgetMax: 2500000, durationMonths: 24,
    verified: false, status: 'unverified', requiredSections: ['abstract', 'objectives', 'methodology'],
    eligibility: { careerStages: ['assistant', 'associate', 'professor'], institutionTypes: ['college'], consortiumRequired: false, minPartners: 0 },
    guidelines: [{ section: 'status', text: 'Listing could not be confirmed against an official AICTE notification.' }],
    sourceUrl: 'https://example.org/aggregator/modrob-2027',
  }),
];

/* -------------------------------- literature ------------------------------ */

function lit(n, title, authors, year, venue, tags, abstract, citations) {
  return { id: `lit-${String(n).padStart(3, '0')}`, title, authors, year, venue, tags, abstract, citations: citations ?? 0, doi: `10.5555/aura.demo.${String(n).padStart(3, '0')}`, database: 'AURA demo corpus', synthetic: true };
}

const LITERATURE = [
  lit(1, 'Federated learning for diabetic retinopathy screening across rural clinics', ['S. Banerjee', 'R. Iyer', 'M. Kulkarni'], 2024, 'Journal of Medical AI Research', ['federated learning', 'diabetic retinopathy', 'rural health', 'medical imaging', 'screening'], 'A four-site federated study reports comparable sensitivity to centralised training while keeping 1.2 million fundus images inside participating clinics.', 61),
  lit(2, 'Deep learning detection of referable diabetic retinopathy in primary care', ['L. Fernandes', 'A. Gupta'], 2023, 'Ophthalmology Informatics', ['diabetic retinopathy', 'medical imaging', 'primary care', 'screening', 'deep learning'], 'A prospective primary-care evaluation of 8,400 patients reports 92% sensitivity and 88% specificity for referable retinopathy.', 148),
  lit(3, 'Privacy-preserving federated learning in healthcare: a systematic review', ['H. Park', 'J. Okafor', 'N. Singh'], 2024, 'Health Data Science Review', ['federated learning', 'privacy', 'health systems', 'data governance'], 'Reviews 74 studies and finds that differential privacy and secure aggregation are rarely combined in clinical deployments.', 96),
  lit(4, 'Non-mydriatic fundus photography in resource-limited settings', ['P. Adjei', 'T. Nguyen'], 2022, 'Global Eye Health', ['rural health', 'screening', 'medical imaging', 'primary care'], 'Image quality is the dominant failure mode for non-mydriatic cameras operated by trained community health workers.', 57),
  lit(5, 'Teleophthalmology screening pathways in low-resource districts', ['K. Rao', 'D. Bhattacharya'], 2023, 'Indian Journal of Public Health', ['screening', 'rural health', 'health systems', 'telemedicine'], 'Hub-and-spoke teleophthalmology reduced time-to-diagnosis from 26 to 9 days across six districts.', 73),
  lit(6, 'Fairness and bias in medical imaging models', ['E. Novak', 'F. Haddad'], 2024, 'Medical Image Analysis', ['medical imaging', 'fairness', 'trustworthy ai', 'bias'], 'Skin tone and camera heterogeneity produce up to 14-point sensitivity gaps when models are externally validated.', 132),
  lit(7, 'Edge inference for point-of-care imaging devices', ['R. Chen', 'S. Deshmukh'], 2023, 'Embedded Systems for Health', ['edge computing', 'medical imaging', 'point-of-care', 'deployment'], 'Quantised models run at 11 frames per second on a 4 W accelerator, enabling offline screening at the point of care.', 41),
  lit(8, 'Data governance for cross-institution health AI', ['M. Lindqvist', 'A. Verma'], 2024, 'Journal of Health Data Policy', ['data governance', 'privacy', 'health systems', 'consent'], 'Proposes a custodianship model that separates model access from record access in multi-hospital collaborations.', 38),
  lit(9, 'Clinical validation of AI diagnostics: TRIPOD-AI reporting in practice', ['C. Osei', 'B. Ramaswamy'], 2023, 'BMJ Evidence & Diagnostics', ['clinical validation', 'diagnostics', 'reporting', 'trustworthy ai'], 'Only 31% of evaluated diagnostic AI studies report calibration and decision-curve analysis together.', 119),
  lit(10, 'Human oversight and escalation in AI screening programmes', ['J. Mitchell', 'S. Farooq'], 2024, 'Implementation Science', ['human oversight', 'screening', 'health systems', 'trustworthy ai'], 'Escalation protocols with a named clinical owner were associated with lower false-positive downstream referral.', 44),
  lit(11, 'Communication-efficient federated optimisation under heterogeneous data', ['X. Li', 'P. Laurent'], 2023, 'Machine Learning Systems', ['federated learning', 'optimisation', 'distributed systems'], 'Compression and partial participation reduce communication cost by 6x with a 0.4-point accuracy trade-off.', 87),
  lit(12, 'Differential privacy budgets for small clinical cohorts', ['N. Abebe', 'G. Rossi'], 2024, 'Privacy in Machine Learning', ['privacy', 'federated learning', 'clinical data'], 'Small cohorts exhaust privacy budgets quickly; the paper recommends cohort-aware accounting before deployment.', 29),
  lit(13, 'Self-supervised representation learning for medical images', ['Y. Zhao', 'T. Krishnan'], 2023, 'Computer Vision for Healthcare', ['medical imaging', 'representation learning', 'deep learning'], 'Pretraining on unlabelled hospital archives improves low-label performance by 9 AUC points.', 103),
  lit(14, 'Distribution shift and external validation in clinical machine learning', ['D. Kim', 'R. Bose'], 2024, 'Clinical ML', ['external validation', 'medical imaging', 'deployment'], 'Site-level distribution shift degrades performance more than label noise in 17 of 20 evaluated models.', 91),
  lit(15, 'Learning analytics dashboards and student outcomes', ['S. Iyer', 'K. Mbeki'], 2023, 'Computers & Education', ['learning analytics', 'education technology', 'outcomes'], 'Dashboard use correlated with a 0.18 SD improvement only when paired with tutor training.', 64),
  lit(16, 'Assistive technology adoption in inclusive classrooms', ['R. Fernandes', 'T. Ansari'], 2024, 'Journal of Inclusive Education', ['assistive technology', 'accessibility', 'education technology'], 'Teacher self-efficacy predicted sustained adoption better than device quality.', 47),
  lit(17, 'AI tutors in low-resource schools: a field trial', ['P. Nair', 'E. Duarte'], 2024, 'Learning at Scale', ['education technology', 'ai tutors', 'field trial'], 'A 12-week trial found gains concentrated in numeracy and no measurable effect on reading.', 35),
  lit(18, 'Outcome-based education assessment frameworks', ['V. Deshpande', 'H. Ali'], 2022, 'Engineering Education Review', ['engineering education', 'outcome-based education', 'assessment'], 'Maps accreditation criteria to measurable assessment instruments across 40 programmes.', 52),
  lit(19, 'Perovskite tandem solar cells: stability challenges', ['M. Ostrowski', 'S. Bhatt'], 2024, 'Advanced Energy Materials', ['solar', 'materials science', 'energy', 'stability'], 'Encapsulation and halide management extend damp-heat lifetime beyond 1,000 hours in tandem stacks.', 88),
  lit(20, 'Grid integration of distributed solar in Indian states', ['A. Sharma', 'N. Gupta'], 2023, 'Energy Policy', ['solar', 'energy', 'grid', 'policy'], 'Curtailment risk is concentrated in three states with weak forecasting capability.', 71),
  lit(21, 'Sodium-ion battery cathode materials', ['J. Wang', 'R. Pillai'], 2024, 'Journal of Power Sources', ['battery', 'materials science', 'energy'], 'Layered oxide cathodes trade energy density for cycle life depending on sodium stoichiometry.', 66),
  lit(22, 'Machine learning interatomic potentials for materials discovery', ['L. Fischer', 'A. Iyer'], 2023, 'Computational Materials Science', ['machine learning', 'materials science', 'simulation'], 'ML potentials reach DFT-adjacent accuracy at three orders of magnitude lower cost for defect screening.', 94),
  lit(23, 'CRISPR-based point-of-care biosensors', ['S. Chatterjee', 'K. Yamamoto'], 2024, 'Biosensors and Bioelectronics', ['biosensors', 'genomics', 'point-of-care', 'diagnostics'], 'Isothermal amplification with CRISPR detection reaches 95% concordance with laboratory PCR.', 82),
  lit(24, 'Community health worker screening programmes: evidence review', ['A. Mwangi', 'L. Das'], 2023, 'Global Health Action', ['rural health', 'screening', 'community health', 'public health'], 'Programmes with supervision and referral feedback loops retained 3x more screening coverage.', 81),
  lit(25, 'Health systems readiness for AI adoption in LMICs', ['N. Hasan', 'P. Menon'], 2024, 'Health Policy and Technology', ['health systems', 'trustworthy ai', 'adoption', 'rural health'], 'Readiness is limited by maintenance capacity, not by model accuracy.', 49),
  lit(26, 'Cost-effectiveness of retinal screening programmes', ['C. D Souza', 'R. Mehta'], 2022, 'Cost Effectiveness and Resource Allocation', ['cost-effectiveness', 'screening', 'public health', 'diabetic retinopathy'], 'Annual screening is cost-effective where prevalence exceeds 8% and loss-to-follow-up stays below 30%.', 63),
  lit(27, 'Consent models for secondary use of health data', ['E. Lund', 'A. Chatterjee'], 2024, 'Journal of Medical Ethics', ['consent', 'data governance', 'privacy'], 'Dynamic consent improves participant trust but raises operational cost for low-resource sites.', 31),
  lit(28, 'DPDP Act and research data: compliance implications', ['S. Aggarwal', 'M. Thomas'], 2024, 'Indian Journal of Law and Technology', ['DPDP', 'data governance', 'privacy', 'compliance'], 'Maps the DPDP Act 2023 obligations onto research data flows, including de-identification and retention limits.', 27),
  lit(29, 'Retinal image quality assessment with lightweight models', ['B. Costa', 'S. Kumar'], 2023, 'Ophthalmic Imaging', ['medical imaging', 'quality assurance', 'screening', 'edge computing'], 'A 1.8 MB quality classifier rejected 71% of ungradable images before inference.', 44),
  lit(30, 'Digital twins for smart manufacturing lines', ['G. Almeida', 'V. Kulkarni'], 2023, 'Manufacturing Systems', ['digital twins', 'smart manufacturing', 'cyber-physical systems'], 'Synchronised digital twins reduced commissioning time by 23% in two automotive lines.', 68),
  lit(31, 'Safety assurance for collaborative robots', ['K. Tanaka', 'R. Singh'], 2024, 'Robotics and Safety', ['robotics', 'safety', 'cyber-physical systems'], 'Proposes a runtime assurance monitor that bounds human-robot contact force without stopping throughput.', 55),
  lit(32, 'Edge-cloud orchestration for cyber-physical systems', ['M. Ivanov', 'S. Ghosh'], 2023, 'IoT Systems', ['edge computing', 'cyber-physical systems', 'orchestration'], 'Latency-aware placement lowers p95 control-loop latency by 40% under network contention.', 62),
];

/* --------------------------------- history -------------------------------- */

const HISTORY = [
  { id: 'hist-retina-2024', title: 'AI-assisted retinal screening for diabetic retinopathy in Pune district', agency: 'ICMR', year: 2024, outcome: 'not-funded', amount: 5600000, tags: ['diabetic retinopathy', 'screening', 'rural health', 'medical imaging'], abstract: 'Proposed a three-site pilot of automated retinal grading with referral support for 12,000 patients.', lessons: 'Reviewers questioned the missing ethics clearance and the absence of a site-level data-governance plan. Both are now prerequisites.' },
  { id: 'hist-fl-testbed-2023', title: 'Federated learning testbed for multi-hospital medical imaging', agency: 'SERB', year: 2023, outcome: 'funded', amount: 6200000, tags: ['federated learning', 'medical imaging', 'privacy', 'testbed'], abstract: 'Built a three-hospital federated learning testbed with secure aggregation and site-level audit logging.', lessons: 'Delivered the testbed; clinical validation was out of scope and remains the open gap.' },
  { id: 'hist-chw-2022', title: 'Community health worker decision support for chronic disease', agency: 'Gates Foundation', year: 2022, outcome: 'not-funded', amount: 12000000, tags: ['community health', 'public health', 'rural health', 'digital health'], abstract: 'Proposed a mobile decision-support tool for community health workers in two districts.', lessons: 'Budget was judged unrealistic for the 18-month window; personnel effort dominated the request.' },
  { id: 'hist-fundus-2021', title: 'Low-cost fundus camera calibration for primary care', agency: 'DST', year: 2021, outcome: 'funded', amount: 1800000, tags: ['medical imaging', 'screening', 'primary care', 'quality assurance'], abstract: 'Developed a calibration protocol that improved image gradability by 22% in primary-care settings.', lessons: 'Protocol adopted by two clinics; needs integration with automated grading.' },
  { id: 'hist-analytics-2023', title: 'Learning analytics for first-year engineering cohorts', agency: 'AICTE', year: 2023, outcome: 'funded', amount: 1600000, tags: ['learning analytics', 'engineering education', 'education technology', 'outcomes'], abstract: 'Piloted an early-warning dashboard for first-year engineering students across four departments.', lessons: 'Dashboard adoption depended on tutor training; the effect disappeared in departments without it.' },
];

module.exports = { AGENTS, INSTITUTION, PERSONNEL, RATE_CARD, USERS, POLICIES, COMPLIANCE_RULES, DOCUMENT_REGISTER, CALLS, LITERATURE, HISTORY };
