'use strict';

/**
 * Real faculty directory, derived from every PI / Co-PI in the sanctioned
 * project tables. This is the single source for login accounts, the people
 * collection and project links. No dummy faculty are defined here.
 */
const FACULTY = [
  { id: 'usr-uma-mudengudi', Name: 'Dr. Uma Mudengudi', Role: 'dean', Dept: 'SoECE', email: 'uma.mudengudi@mist.edu.in', title: 'Dean, Research & Development', aliases: ['uma mudengudi'] },
  { id: 'usr-meena-s-m', Name: 'Dr. Meena S M', Role: 'faculty', Dept: 'SoECE', email: 'meena.s.m@mist.edu.in', title: 'Faculty Member', aliases: ['meena s m'] },
  { id: 'usr-sujatha-c', Name: 'Dr. Sujatha C', Role: 'faculty', Dept: 'SoECE', email: 'sujatha.c@mist.edu.in', title: 'Faculty Member', aliases: ['sujatha c'] },
  { id: 'usr-sangeeta-b-kolavekar', Name: 'Dr. Sangeeta B Kolavekar', Role: 'faculty', Dept: 'Physics', email: 'sangeeta.b.kolavekar@mist.edu.in', title: 'Faculty Member', aliases: ['sangeeta b kolavekar', 'sangeeta kolavekar'] },
  { id: 'usr-girish-karkatti', Name: 'Girish Karkatti', Role: 'faculty', Dept: 'A&R', email: 'girish.karkatti@mist.edu.in', title: 'Faculty Member', aliases: ['girish karkatti'] },
  { id: 'usr-suneeta-v-budihal', Name: 'Dr. Suneeta V Budihal', Role: 'faculty', Dept: 'SoECE', email: 'suneeta.v.budihal@mist.edu.in', title: 'Faculty Member', aliases: ['suneeta v budihal', 'suneeta budihal'] },
  { id: 'usr-saroja-v-siddamal', Name: 'Dr. Saroja V Siddamal', Role: 'faculty', Dept: 'SoECE', email: 'saroja.v.siddamal@mist.edu.in', title: 'Faculty Member', aliases: ['saroja v siddamal', 'saroja siddamal'] },
  { id: 'usr-sachin-karadai', Name: 'Sachin Karadai', Role: 'faculty', Dept: 'A&R', email: 'sachin.karadai@mist.edu.in', title: 'Faculty Member', aliases: ['sachin karadai'] },
  { id: 'usr-nagaraj-p-shetty', Name: 'Dr. Nagaraj P Shetty', Role: 'faculty', Dept: 'SAS', email: 'nagaraj.p.shetty@mist.edu.in', title: 'Faculty Member', aliases: ['nagaraj p shetty', 'nagaraj shetty'] },
  { id: 'usr-gururaj-fattepur', Name: 'Gururaj Fattepur', Role: 'faculty', Dept: 'SME', email: 'gururaj.fattepur@mist.edu.in', title: 'Faculty Member', aliases: ['gururaj fattepur'] },
  { id: 'usr-arun-y-patil', Name: 'Dr. Arun Y Patil', Role: 'faculty', Dept: 'SME', email: 'arun.y.patil@mist.edu.in', title: 'Faculty Member', aliases: ['arun y patil', 'arun patil'] },
  { id: 'usr-mohanakrishna-gunda', Name: 'Mohanakrishna Gunda', Role: 'faculty', Dept: 'SAS', email: 'mohanakrishna.gunda@mist.edu.in', title: 'Faculty Member', aliases: ['mohanakrishna gunda'] },
  { id: 'usr-shridhar-doddamani', Name: 'Shridhar Doddamani', Role: 'faculty', Dept: 'A&R', email: 'shridhar.doddamani@mist.edu.in', title: 'Faculty Member', aliases: ['shridhar doddamani'] },
  { id: 'usr-shweta-j-malode', Name: 'Dr. Shweta J Malode', Role: 'faculty', Dept: 'SAS', email: 'shweta.j.malode@mist.edu.in', title: 'Faculty Member', aliases: ['shweta j malode', 'shweta malode'] },
  { id: 'usr-ujwala-patil', Name: 'Dr. Ujwala Patil', Role: 'faculty', Dept: 'ECE', email: 'ujwala.patil@mist.edu.in', title: 'Faculty Member', aliases: ['ujwala patil'] },
  { id: 'usr-satyadhyan-chickerur', Name: 'Dr. Satyadhyan Chickerur', Role: 'faculty', Dept: 'CSE', email: 'satyadhyan.chickerur@mist.edu.in', title: 'Faculty Member', aliases: ['satyadhyan chickerur'] },
  { id: 'usr-s-r-nirmala', Name: 'Dr. S R Nirmala', Role: 'faculty', Dept: 'ECE', email: 's.r.nirmala@mist.edu.in', title: 'Faculty Member', aliases: ['s r nirmala', 'nirmala s r'] },
  { id: 'usr-satish-chikkamath', Name: 'Satish Chikkamath', Role: 'faculty', Dept: 'ECE', email: 'satish.chikkamath@mist.edu.in', title: 'Faculty Member', aliases: ['satish chikkamath'] },
  { id: 'usr-kiran-r-patil', Name: 'Dr. Kiran R Patil', Role: 'faculty', Dept: 'E&E', email: 'kiran.r.patil@mist.edu.in', title: 'Faculty Member', aliases: ['kiran r patil', 'kiran patil'] },
  { id: 'usr-n-r-banapurmatti', Name: 'Dr. N R Banapurmatti', Role: 'faculty', Dept: 'SME', email: 'n.r.banapurmatti@mist.edu.in', title: 'Faculty Member', aliases: ['n r banapurmatti', 'banapurmatti'] },
  { id: 'usr-b-s-hungund', Name: 'Dr. B S Hungund', Role: 'faculty', Dept: 'BT', email: 'b.s.hungund@mist.edu.in', title: 'Faculty Member', aliases: ['b s hungund', 'hungund'] },
  { id: 'usr-namrata-hegde', Name: 'Namrata Hegde', Role: 'faculty', Dept: 'BT', email: 'namrata.hegde@mist.edu.in', title: 'Faculty Member', aliases: ['namrata hegde'] },
  { id: 'usr-jyoti-bali', Name: 'Dr. Jyoti Bali', Role: 'faculty', Dept: 'ARE', email: 'jyoti.bali@mist.edu.in', title: 'Faculty Member', aliases: ['jyoti bali'] },
  { id: 'usr-s-v-hiremath', Name: 'Dr. S V Hiremath', Role: 'faculty', Dept: 'SAS', email: 's.v.hiremath@mist.edu.in', title: 'Faculty Member', aliases: ['s v hiremath', 'hiremath'] },
  { id: 'usr-zabin-bagewadi', Name: 'Dr. Zabin Bagewadi', Role: 'faculty', Dept: 'SAS', email: 'zabin.bagewadi@mist.edu.in', title: 'Faculty Member', aliases: ['zabin bagewadi'] },
  { id: 'usr-shantala-giraddi', Name: 'Dr. Shantala Giraddi', Role: 'faculty', Dept: 'CSE', email: 'shantala.giraddi@mist.edu.in', title: 'Faculty Member', aliases: ['shantala giraddi'] },
  { id: 'usr-mahesh-patil', Name: 'Mr. Mahesh Patil', Role: 'faculty', Dept: 'CSE', email: 'mahesh.patil@mist.edu.in', title: 'Faculty Member', aliases: ['mahesh patil'] },
  { id: 'usr-shivaraj-hublikar', Name: 'Mr. Shivaraj Hublikar', Role: 'faculty', Dept: 'ECE', email: 'shivaraj.hublikar@mist.edu.in', title: 'Faculty Member', aliases: ['shivaraj hublikar'] },
  { id: 'usr-r-b-shettar', Name: 'Dr. R B Shettar', Role: 'faculty', Dept: 'ECE', email: 'r.b.shettar@mist.edu.in', title: 'Faculty Member', aliases: ['r b shettar', 'shettar'] },
  { id: 'usr-sharanappa-achappa', Name: 'Mr. Sharanappa Achappa', Role: 'faculty', Dept: 'BT', email: 'sharanappa.achappa@mist.edu.in', title: 'Faculty Member', aliases: ['sharanappa achappa'] },
];

const FACULTY_PERMISSIONS = ['run:create', 'run:read:own', 'draft:edit', 'package:view'];

const ALIASES = new Map();
(function buildAliases() {
  for (const f of FACULTY) {
    const keys = [f.Name, ...(f.aliases || [])];
    for (const key of keys) ALIASES.set(normalizeKey(key), f);
  }
})();

function normalizeKey(name) {
  return String(name || '')
    .replace(/^(dr|mr|mrs|ms|prof|professor)\.?\s+/i, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function canonicalFaculty(name) {
  return ALIASES.get(normalizeKey(name)) || null;
}

function canonicalName(name) {
  const f = canonicalFaculty(name);
  return f ? f.Name : String(name || '').replace(/\s+/g, ' ').trim();
}

function facultyById(id) {
  return FACULTY.find((f) => f.id === id) || null;
}

/** Login/user records (lowercase fields consumed by the app). */
function facultyUsers() {
  return FACULTY.filter((f) => f.Role !== 'dean').map((f) => ({
    id: f.id,
    name: f.Name,
    email: f.email,
    role: f.Role,
    title: f.title,
    department: f.Dept,
    permissions: FACULTY_PERMISSIONS,
  }));
}

module.exports = {
  FACULTY,
  FACULTY_PERMISSIONS,
  facultyUsers,
  canonicalName,
  canonicalFaculty,
  facultyById,
  normalizeKey,
};
