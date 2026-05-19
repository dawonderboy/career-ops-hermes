// Demo tracker data for the public dashboard. All names, companies, dates, and notes are fictional.
window.APPS = [
  { n: 108, date: "2026-05-09", company: "Northstar Labs", role: "Senior IT Systems Engineer", score: 4.6, status: "Applied", remote: "Hybrid", comp: "$135–165K", archetype: "IT Engineering", tldr: "Strong identity, endpoint, and automation match for a fictional demo candidate.", note: "Demo data" },
  { n: 107, date: "2026-05-08", company: "Acme Systems", role: "Executive IT Support Specialist", score: 4.4, status: "Interview", remote: "Onsite", comp: "$120–145K", archetype: "Exec Support", tldr: "Fictional interview-stage role used to exercise dashboard state rendering.", note: "HM screen scheduled" },
  { n: 106, date: "2026-05-07", company: "Nimbus Cloud", role: "Workplace Technology Engineer", score: 4.1, status: "Responded", remote: "Remote", comp: "$125–155K", archetype: "Workplace IT", tldr: "Demo role with SaaS administration and device management overlap.", note: "Recruiter replied" },
  { n: 105, date: "2026-05-06", company: "Example Robotics", role: "Desktop Engineering Lead", score: 3.9, status: "Evaluated", remote: "Hybrid", comp: "$115–140K", archetype: "Desktop Engineering", tldr: "Good technical match; level and commute tradeoffs are examples only.", note: "Review before apply" },
  { n: 104, date: "2026-05-05", company: "Helio Health Demo", role: "IT Support Engineer", score: 3.7, status: "Discarded", remote: "Onsite", comp: "$90–110K", archetype: "IT Support", tldr: "Discarded example to show lower-fit pipeline behavior.", note: "Demo closed role" },
  { n: 103, date: "2026-05-04", company: "Evergreen Finance", role: "Client Platform Engineer", score: 4.3, status: "Applied", remote: "Hybrid", comp: "$130–160K", archetype: "Client Platform", tldr: "Fictional macOS/MDM and automation match.", note: "Application submitted in demo" },
  { n: 102, date: "2026-05-03", company: "Pioneer AI", role: "IT Operations Engineer", score: 4.0, status: "Rejected", remote: "Remote", comp: "$120–150K", archetype: "IT Operations", tldr: "Rejected state sample; not based on a real application.", note: "Demo rejection" },
  { n: 101, date: "2026-05-02", company: "Summit Apps", role: "AV / Collaboration Engineer", score: 3.8, status: "Evaluated", remote: "Hybrid", comp: "$105–135K", archetype: "AV Engineering", tldr: "Sample AV/collaboration role for UI filtering and score buckets.", note: "Demo only" },
];

window.UPCOMING = [
  { when: "Mon 5/12", date: "2026-05-12", time: "10:00a", co: "Acme Systems", kind: "Recruiter screen", stage: "recruiter", who: "Jordan Recruiter", n: 107 },
  { when: "Tue 5/13", date: "2026-05-13", time: "1:30p", co: "Nimbus Cloud", kind: "Hiring manager", stage: "hm", who: "Taylor Manager", n: 106 },
  { when: "Thu 5/15", date: "2026-05-15", time: "3:00p", co: "Northstar Labs", kind: "Technical screen", stage: "technical", who: "Alex Interviewer", n: 108 },
];

window.PAST_INTERVIEWS = [
  { date: "2026-05-01", time: "11:00a", co: "Example Robotics", kind: "Intro call", stage: "recruiter", who: "Casey Recruiter", n: 105 },
];

window.FUNNEL = [
  { label: "Evaluated", count: 8, pct: 100 },
  { label: "Applied",   count: 3, pct: 37.5 },
  { label: "Responded", count: 1, pct: 12.5 },
  { label: "Interview", count: 1, pct: 12.5 },
  { label: "Rejected",  count: 1, pct: 12.5 },
  { label: "Offer",     count: 0, pct: 0 },
];

window.SCORE_BUCKETS = [
  { label: "4.5–5.0", count: 1 },
  { label: "4.0–4.4", count: 4 },
  { label: "3.5–3.9", count: 3 },
  { label: "3.0–3.4", count: 0 },
  { label: "<3.0",    count: 0 },
];

window.WEEKLY = [
  { week: "W14", count: 2 },
  { week: "W15", count: 4 },
  { week: "W16", count: 5 },
  { week: "W17", count: 3 },
  { week: "W18", count: 6 },
  { week: "W19", count: 4 },
];

window.ARCHETYPES = [
  { label: "IT Engineering", count: 2 },
  { label: "Exec Support", count: 1 },
  { label: "Workplace IT", count: 1 },
  { label: "Desktop Engineering", count: 1 },
  { label: "IT Support", count: 1 },
  { label: "Client Platform", count: 1 },
  { label: "AV Engineering", count: 1 },
];
