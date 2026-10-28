'use strict';

/**
 * Institutional grant portfolio, transcribed from the sanctioned-project tables
 * (2020-21 to 2023-24). Every listed project is treated as APPROVED; completion
 * state is deliberately not modelled or displayed. Amounts are in lakh INR.
 */
const PROJECTS = [
  // ---------------------------- 2023-24 ----------------------------
  { id: 'PRJ-2324-01', year: '2023-24', department: 'SoECE', title: 'Digital Creation to Enable Gamification Based on Indian Ethos', pi: ['Dr. Uma Mudengudi', 'Dr. Meena S M', 'Dr. Sujatha C'], agency: 'SERB-INAE', amountLakh: 63.89 },
  { id: 'PRJ-2324-02', year: '2023-24', department: 'Physics', title: 'Study of optical and transport properties of Metal Nano particles doped lithium bismuth borate glasses for the optoelectronic device and biomaterial applications', pi: ['Dr. Sangeeta B Kolavekar'], agency: 'VGST', amountLakh: 30.00 },
  { id: 'PRJ-2324-03', year: '2023-24', department: 'A&R', title: 'Development of 3D Digital Twin of PCB/maker', pi: ['Girish Karkatti'], agency: 'La Fondation Dassault Systemes', amountLakh: 0.50 },

  // ---------------------------- 2022-23 ----------------------------
  { id: 'PRJ-2223-01', year: '2022-23', department: 'SoECE', title: 'e Krushi Precision Agriculture', pi: ['Dr. Suneeta V Budihal'], coPIs: ['Dr. Saroja V Siddamal'], agency: 'SERB Power', amountLakh: 15.68 },
  { id: 'PRJ-2223-02', year: '2022-23', department: 'A&R', title: 'Development of Cobots integrated with Autonomous Mobile Robots (AMRs) for automation of warehousing logistics and delivery planning', pi: ['Sachin Karadai'], agency: 'La Fondation Dassault Systemes', amountLakh: 7.20 },
  { id: 'PRJ-2223-03', year: '2022-23', department: 'SAS', title: 'Bio-chemically synthesized nanomaterials for the detection and degradation of pesticides', pi: ['Nagaraj Shetty'], agency: 'SERB', amountLakh: 28.69 },
  { id: 'PRJ-2223-04', year: '2022-23', department: 'SME', title: 'Project Development of a Design Framework to Practice Nature Inspired Design for Product Innovation', pi: ['Gururaj Fattepur'], coPIs: ['Dr. Arun Y Patil'], agency: 'La Fondation Dassault Systemes', amountLakh: 5.52 },
  { id: 'PRJ-2223-05', year: '2022-23', department: 'SAS', title: 'Microbial Electrosynthesis based production of ethylene from the valorization of food and processing waste', pi: ['Mohanakrishna Gunda', 'Dr. Nagaraj P Shetty'], agency: 'SERB', amountLakh: 46.01 },
  { id: 'PRJ-2223-06', year: '2022-23', department: 'A&R', title: 'Design and development of multi mobile robot path planning and navigation system Framework', pi: ['Shridhar Doddamani'], agency: 'La Fondation Dassault Systemes', amountLakh: 11.00 },
  { id: 'PRJ-2223-07', year: '2022-23', department: 'SoECE', title: 'MATOMAC: Development of LPWAN ASIC/SoC', pi: ['Saroja Siddamal'], coPIs: ['Dr. Suneeta V Budihal'], agency: 'MeitY', amountLakh: 500.00 },
  { id: 'PRJ-2223-08', year: '2022-23', department: 'SAS', title: 'Green synthesis of nanoparticles in developing electronanalytical sensors for pharmaceutical and biomedical applications', pi: ['Dr. Shweta J Malode'], coPIs: ['Nagaraj Shetty'], agency: 'VGST', amountLakh: 3.00 },
  { id: 'PRJ-2223-09', year: '2022-23', department: 'SoECE', title: 'Research changes and Application in Visual Intelligence', pi: ['Dr. Ujwala Patil'], agency: 'AICTE', amountLakh: 3.00 },
  { id: 'PRJ-2223-10', year: '2022-23', department: 'SoECE', title: 'Meity-Qcal-QSDL-Diabetic Retinopathy', pi: ['Dr. Satyadhyan Chickerur'], agency: 'Meity', amountLakh: 15.88 },

  // ---------------------------- 2021-22 ----------------------------
  { id: 'PRJ-2122-01', year: '2021-22', department: 'ECE', title: 'Speech Database resources for speaker recognition', pi: ['Dr S R Nirmala', 'Satish Chikkamath'], agency: 'MEITY', amountLakh: 22.23 },
  { id: 'PRJ-2122-02', year: '2021-22', department: 'E&E', title: 'Intelligent Machines', pi: ['Dr. Kiran R Patil'], agency: 'TIH Technology Innovation Hub – IoT Chanakya Intern 2022', amountLakh: 4.80 },
  { id: 'PRJ-2122-03', year: '2021-22', department: 'ECE', title: 'E – Krushi : Precision agriculture', pi: ['Dr Suneeta Budihal'], agency: 'Science & Engineering Research Board (SERB)', amountLakh: 22.80 },
  { id: 'PRJ-2122-04', year: '2021-22', department: 'SME', title: 'Synthesis of Novel Bio nano material for tribological applications', pi: ['Dr N R Banapurmatti', 'Dr Arun Patil'], agency: 'AICTE RPS', amountLakh: 14.75 },
  { id: 'PRJ-2122-05', year: '2021-22', department: 'SME', title: 'Real time testing of sheep horn as impact resistive material for accident prone regions in consumer vehicles', pi: ['Dr Arun Patil'], agency: 'Dassault Systems Foundation', amountLakh: 12.30 },
  { id: 'PRJ-2122-06', year: '2021-22', department: 'SME', title: 'Amrita Startups', pi: ['Dr Arun Patil'], agency: 'Karnataka Start up cell (Elevate)', amountLakh: 15.00 },
  { id: 'PRJ-2122-07', year: '2021-22', department: 'BT', title: 'Development of herbal formulation/active metabolites from plant source as anticancer agent.', pi: ['Dr B S Hungund', 'Namrata Hegde'], agency: 'Institutions Innovation Council', amountLakh: 6.00 },
  { id: 'PRJ-2122-08', year: '2021-22', department: 'ARE', title: 'Design & development of a learning kit on FPGA/SoC based hardware accelerator for boosting the performance of AI based application in autonomous Robot', pi: ['Dr Jyoti Bali'], agency: 'AICTE / Dassault Systems Foundation', amountLakh: 3.80 },
  { id: 'PRJ-2122-09', year: '2021-22', department: 'SAS', title: 'Identification of potential metabolic biomarker for early diagnosis of oral squamous cell carcinoma in human saliva', pi: ['Dr S V Hiremath', 'Dr Zabin Bagewadi'], agency: 'Multi-Disciplinary Research Unit (KIMS Hubli)', amountLakh: 0, amountNote: 'In-kind: consumables, chemicals and materials provided by MRU' },

  // ---------------------------- 2020-21 ----------------------------
  { id: 'PRJ-2021-01', year: '2020-21', department: 'CSE', title: 'Automatic Grading of Diabetic Retinopathy at Primary Health Care Centers using Distributed Deep Learning Framework', pi: ['Dr Satyadhyan Chickerur', 'Dr Shantala Giraddi', 'Mr Mahesh Patil'], agency: 'IISc Bangalore', amountLakh: 19.886 },
  { id: 'PRJ-2021-02', year: '2020-21', department: 'CSE', title: 'SEED Lab', pi: ['Dr. Uma Mudengudi'], agency: 'SAMSUNG', amountLakh: 83.96 },
  { id: 'PRJ-2021-03', year: '2020-21', department: 'ECE', title: 'V-vaidya: Visual Intelligence based analysis of histopathology data towards the detection of oral cancer', pi: ['Dr. Ujwala Patil'], agency: 'VGST K-FIST L2', amountLakh: 20.00 },
  { id: 'PRJ-2021-04', year: '2020-21', department: 'ECE', title: 'Atal FDP - DL for Audio and Speech Processing', pi: ['Dr. Nirmala S R'], agency: 'AICTE', amountLakh: 0.93 },
  { id: 'PRJ-2021-05', year: '2020-21', department: 'ECE', title: 'Atal FDP - FPGS based DL in signal Processing', pi: ['Dr. R B Shettar'], agency: 'AICTE', amountLakh: 0.93 },
  { id: 'PRJ-2021-06', year: '2020-21', department: 'ECE', title: 'Atal FDP - Digital forensics & Investigation', pi: ['Mr. Shivaraj Hublikar'], agency: 'AICTE', amountLakh: 0.93 },
  { id: 'PRJ-2021-07', year: '2020-21', department: 'ECE', title: 'SEED Lab', pi: ['Dr. Uma Mudengudi'], agency: 'SAMSUNG', amountLakh: 31.31 },
  { id: 'PRJ-2021-08', year: '2020-21', department: 'BT', title: 'Exploring the interactions of envelope and NSS proteins of Kyasanur forest disease virus with existing and novel drugs using molecular modelling approach', pi: ['Mr. Sharanappa Achappa'], agency: 'VGST: Research Grant for scientist / faculty (RGS/F)', amountLakh: 3.00 },
].map((p, index) => ({
  ...p,
  approved: true,
  status: 'approved',
  // Faculty-entered budget lines: Requirement + Cost (rupees).
  budgetLines: [],
  createdAt: '2026-10-28T00:00:00.000Z',
  order: index + 1,
}));

const YEARS = [...new Set(PROJECTS.map((p) => p.year))];
const DEPARTMENTS = [...new Set(PROJECTS.map((p) => p.department))];

module.exports = { PROJECTS, YEARS, DEPARTMENTS };
