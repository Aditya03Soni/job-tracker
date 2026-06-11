'use strict';
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const os = require('os');

const app = express();
const PORT = 3001;
const DATA_DIR = path.join(os.homedir(), '.job-tracker');
const DATA_FILE = path.join(DATA_DIR, 'data.json');

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// ---------------------------------------------------------------------------
// Data store (JSON file)
// ---------------------------------------------------------------------------
function readData() {
  if (!fs.existsSync(DATA_FILE)) {
    const init = { jobs: [], settings: {}, nextId: 1 };
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(DATA_FILE, JSON.stringify(init, null, 2));
    return init;
  }
  return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
}

function writeData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

// ---------------------------------------------------------------------------
// LaTeX helpers
// ---------------------------------------------------------------------------
function tex(str = '') {
  return String(str)
    .replace(/\\/g, '\\textbackslash{}')
    .replace(/&/g, '\\&')
    .replace(/%/g, '\\%')
    .replace(/\$/g, '\\$')
    .replace(/#/g, '\\#')
    .replace(/_/g, '\\_')
    .replace(/\{/g, '\\{')
    .replace(/\}/g, '\\}')
    .replace(/~/g, '\\textasciitilde{}')
    .replace(/\^/g, '\\textasciicircum{}')
    .replace(/\*\*(.+?)\*\*/g, '\\textbf{$1}');
}

// Strip role-type suffixes the AI should never include in titles
function cleanTitle(title = '') {
  return title.replace(/\s*[–\-]\s*(extern|externship|contract|part[\s-]?time|temp|temporary|freelance)\s*$/i, '').trim();
}

// Post-process AI output: enforce structural rules the prompt alone can't guarantee
function sanitizeResumeContent(c) {
  const experiences = (c.experiences || []).map(e => ({
    ...e,
    title: cleanTitle(e.title),
    // cap at 3, strip internal newlines that would break LaTeX paragraph spacing
    bullets: (e.bullets || []).slice(0, 3).map(b => b.replace(/\s*\n\s*/g, ' ').trim()),
  }));

  // Log a warning if any experience came back with fewer than 3 bullets
  experiences.forEach(e => {
    if (e.bullets.length < 3) {
      console.warn(`[sanitize] "${e.company} – ${e.title}" has only ${e.bullets.length} bullet(s); AI under-generated.`);
    }
  });

  return { ...c, experiences };
}

// ---------------------------------------------------------------------------
// Batch bullet fill — single API call for all under-generated experiences
// ---------------------------------------------------------------------------
async function batchFillBullets(underGenerated, job, openrouter_api_key, model) {
  const experiencesBlock = underGenerated.map((e, i) => {
    const existing = (e.bullets || []).map((b, j) => `  ${j + 1}. ${b}`).join('\n') || '  (none yet)';
    return `[${i}] ${e.title} at ${e.company} (${e.dates}) — needs ${3 - (e.bullets || []).length} bullet(s)\nExisting bullets (DO NOT repeat):\n${existing}`;
  }).join('\n\n');

  const prompt = `You are filling in missing resume bullets. For each experience below, generate exactly the number of bullets requested.

Job context: ${job.title} at ${job.company}
Description excerpt: ${(job.description || '').slice(0, 800)}

Experiences needing bullets:
${experiencesBlock}

Rules:
- Each bullet must be specific and include a real number, %, $, or named deliverable
- Start each bullet with a strong past-tense action verb (Built, Drove, Reduced, Led, Designed, ...)
- NEVER end with "supporting X", "enhancing Y", "demonstrating skills in Z", "providing insights into X"
- Return ONLY a JSON object keyed by index: {"0": ["bullet..."], "1": ["bullet...", "bullet..."]}`;

  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${openrouter_api_key}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'http://localhost:5173',
      'X-Title': 'Job Tracker',
    },
    body: JSON.stringify({ model, messages: [{ role: 'user', content: prompt }], temperature: 0.3 }),
  });

  if (!res.ok) throw new Error(`Batch fill API error: ${res.status}`);
  const json = await res.json();
  let raw = json.choices[0].message.content.trim();
  const fenceMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) raw = fenceMatch[1].trim();
  return JSON.parse(raw);
}

// ---------------------------------------------------------------------------
// ATS keyword extraction + scoring
// ---------------------------------------------------------------------------
async function extractJdKeywords(jdText, openrouter_api_key, keywordModel) {
  if (!jdText || jdText.length < 50) return [];

  const prompt = `Extract the 10-15 most important ATS keywords from this job description.
Focus on: required/preferred technical skills, tools, frameworks, domain terms, and role-specific action nouns.
Exclude generic words like "team", "work", "role", "company", "experience", "candidate".

Job Description:
${jdText.slice(0, 3000)}

Return ONLY a JSON array of strings — e.g. ["Python", "SQL", "data pipeline", "stakeholder alignment"]`;

  try {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openrouter_api_key}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'http://localhost:5173',
        'X-Title': 'Job Tracker',
      },
      body: JSON.stringify({
        model: keywordModel || 'openai/gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.1,
      }),
    });
    if (!res.ok) return [];
    const json = await res.json();
    let raw = json.choices[0].message.content.trim();
    const fenceMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenceMatch) raw = fenceMatch[1].trim();
    const keywords = JSON.parse(raw);
    return Array.isArray(keywords) ? keywords.filter(k => typeof k === 'string') : [];
  } catch {
    return [];
  }
}

function computeAtsScore(resumeContent, keywords) {
  if (!keywords || keywords.length === 0) {
    return { score: null, matched_keywords: [], missing_keywords: [], keywords_extracted: [] };
  }

  const allText = [
    resumeContent.technical_skills || '',
    resumeContent.business_skills || '',
    resumeContent.coursework || '',
    ...(resumeContent.experiences || []).flatMap(e => e.bullets || []),
    ...(resumeContent.projects || []).flatMap(p => p.bullets || []),
    resumeContent.cover_letter || '',
  ].join(' ').toLowerCase();

  const matched = keywords.filter(k => allText.includes(k.toLowerCase()));
  const missing = keywords.filter(k => !allText.includes(k.toLowerCase()));
  const score = Math.round((matched.length / keywords.length) * 1000) / 10;

  return { score, matched_keywords: matched, missing_keywords: missing, keywords_extracted: keywords };
}

function buildResumeLatex(c) {
  const expEntries = (c.experiences || []).map(e =>
    `    \\resumeSubheading\n      {${tex(e.company)}}{${tex(e.location)}}\n      {${tex(e.title)}}{${tex(e.dates)}}\n      \\resumeItemListStart\n${(e.bullets || []).map(b => `        \\resumeItem{${tex(b)}}`).join('\n')}\n      \\resumeItemListEnd`
  ).join('\n');

  const projEntries = (c.projects || []).map(p =>
    `      \\resumeProjectHeading\n          {\\textbf{${tex(p.title)}} $|$ \\emph{${tex(p.tools || '')}}}{${tex(p.date)}}\n          \\resumeItemListStart\n${(p.bullets || []).map(b => `            \\resumeItem{${tex(b)}}`).join('\n')}\n          \\resumeItemListEnd`
  ).join('\n');

  return `\\documentclass[letterpaper,11pt]{article}

\\usepackage{latexsym}
\\usepackage[empty]{fullpage}
\\usepackage{titlesec}
\\usepackage{marvosym}
\\usepackage[usenames,dvipsnames]{color}
\\usepackage{verbatim}
\\usepackage{enumitem}
\\usepackage[hidelinks]{hyperref}
\\usepackage{fancyhdr}
\\usepackage[english]{babel}
\\usepackage{tabularx}
\\input{glyphtounicode}

\\pagestyle{fancy}
\\fancyhf{}
\\fancyfoot{}
\\renewcommand{\\headrulewidth}{0pt}
\\renewcommand{\\footrulewidth}{0pt}

\\addtolength{\\oddsidemargin}{-0.5in}
\\addtolength{\\evensidemargin}{-0.5in}
\\addtolength{\\textwidth}{1in}
\\addtolength{\\topmargin}{-.5in}
\\addtolength{\\textheight}{1.0in}

\\urlstyle{same}
\\raggedbottom
\\raggedright
\\setlength{\\tabcolsep}{0in}
\\setlength{\\parskip}{0pt}

\\titleformat{\\section}{
  \\vspace{-4pt}\\scshape\\raggedright\\large
}{}{0em}{}[\\color{black}\\titlerule \\vspace{-4pt}]

\\pdfgentounicode=1

\\newcommand{\\resumeItem}[1]{
  \\item\\small{#1}
}

\\newcommand{\\resumeSubheading}[4]{
  \\vspace{-1pt}\\item
    \\begin{tabular*}{0.97\\textwidth}[t]{l@{\\extracolsep{\\fill}}r}
      \\textbf{#1} & #2 \\\\
      \\textit{\\small#3} & \\textit{\\small #4} \\\\
    \\end{tabular*}\\vspace{-5pt}
}

\\newcommand{\\resumeProjectHeading}[2]{
    \\item
    \\begin{tabular*}{0.97\\textwidth}{l@{\\extracolsep{\\fill}}r}
      \\small#1 & #2 \\\\
    \\end{tabular*}\\vspace{-5pt}
}

\\newcommand{\\resumeSubItem}[1]{\\resumeItem{#1}\\vspace{-4pt}}

\\renewcommand\\labelitemii{$\\vcenter{\\hbox{\\tiny$\\bullet$}}$}

\\newcommand{\\resumeSubHeadingListStart}{\\begin{itemize}[leftmargin=0.15in, label={}]}
\\newcommand{\\resumeSubHeadingListEnd}{\\end{itemize}\\vspace{0pt}}
\\newcommand{\\resumeItemListStart}{\\begin{itemize}[itemsep=2pt, topsep=2pt, parsep=0pt, partopsep=0pt]}
\\newcommand{\\resumeItemListEnd}{\\end{itemize}\\vspace{-2pt}}

\\begin{document}

\\begin{center}
    \\textbf{\\Huge \\scshape Aditya Raj Soni} \\\\ \\vspace{1pt}
    \\small San Jose, CA $|$ (408) 210-7302 $|$ \\href{mailto:aditya.soni@sjsu.edu}{aditya.soni@sjsu.edu} $|$ \\href{https://linkedin.com/in/aditya03s}{linkedin.com/in/aditya03s} $|$ \\href{https://github.com/Aditya03Soni}{github.com/Aditya03Soni}
\\end{center}

\\section{Education}
  \\resumeSubHeadingListStart
    \\resumeSubheading
      {San Jose State University}{San Jose, CA}
      {Bachelor of Science in Economics}{Expected May 2027}
      \\resumeItemListStart
        \\resumeItem{\\textbf{Major GPA:} 3.92 / 4.0 $|$ \\textbf{Cumulative GPA:} 3.66 / 4.0 $|$ President's Scholar (2024--2025) $|$ A.S. St. Saffold Leadership Scholarship}
        \\resumeItem{\\textbf{Relevant Coursework:} ${tex(c.coursework)}}
      \\resumeItemListEnd
  \\resumeSubHeadingListEnd

\\section{Skills}
 \\begin{itemize}[leftmargin=0.15in, label={}]
    \\small{\\item{
     \\textbf{Technical}{: ${tex(c.technical_skills)}} \\\\
     \\textbf{Business \\& Professional}{: ${tex(c.business_skills)}}
    }}
 \\end{itemize}

\\section{Experience}
  \\resumeSubHeadingListStart
${expEntries}
  \\resumeSubHeadingListEnd

\\section{Projects}
    \\resumeSubHeadingListStart
${projEntries}
    \\resumeSubHeadingListEnd

\\section{Leadership}
  \\resumeSubHeadingListStart
    \\resumeSubheading
      {International Cricket Club, SJSU}{San Jose, CA}
      {President}{Aug 2025 -- Present}
      \\resumeItemListStart
        \\resumeItem{Expanded club reach by \\textbf{30\\%} through targeted outreach campaigns and inclusive event programming across SJSU's international student community.}
        \\resumeItem{Directed planning and financial management for \\textbf{5+ tournaments} with 150+ attendees, managing a \\$1,000 budget and cutting costs by \\textbf{18\\%}.}
        \\resumeItem{Coordinated logistics, sponsorships, and team scheduling across \\textbf{20+ club members}, maintaining consistent weekly practice attendance and event turnout.}
      \\resumeItemListEnd
  \\resumeSubHeadingListEnd

\\end{document}`;
}

// ---------------------------------------------------------------------------
// AI kit prompt
// ---------------------------------------------------------------------------
function buildKitPrompt(profile, job, keywords = []) {
  const keywordsBlock = keywords.length > 0
    ? `\nATS KEYWORDS — use these exact terms naturally across skills and bullets (do not force or repeat awkwardly):\n${keywords.join(', ')}\nEach keyword should appear at least once across skills + bullets combined. For skills the candidate clearly lacks, frame adjacent transferable experience — never fabricate.\n`
    : '';

  const selfCheckKeywordLine = keywords.length > 0
    ? '[ ] Uses at least one keyword from the ATS KEYWORDS list\n'
    : '';

  return `You are an expert resume writer and career coach. Return ONLY valid JSON — no markdown fences, no explanation.

Given the candidate profile and job below, create tailored resume content and application materials.

CANDIDATE PROFILE:
${profile}

JOB:
Title: ${job.title || 'Not specified'}
Company: ${job.company || 'Not specified'}
Location: ${job.location || 'Not specified'}
Description:
${(job.description || '').slice(0, 4000)}

REASONING STEP (mental only — do NOT include in output):
1. Identify the 5 most critical requirements in the JD.
2. For each work experience, decide which 1-2 requirements it best demonstrates.
3. Ensure every requirement from step 1 is addressed at least once across all experience bullets.

Return exactly this JSON structure:
{
  "coursework": "comma-separated list of the most relevant coursework from the profile",
  "technical_skills": "tailored technical skills string emphasizing tools relevant to this role",
  "business_skills": "tailored business/professional skills string",
  "experiences": [
    {
      "company": "company name only",
      "location": "City, ST",
      "title": "job title",
      "dates": "date range (e.g. Sep – Dec 2025)",
      "bullets": ["bullet 1", "bullet 2", "bullet 3"]
    }
  ],
  "projects": [
    {
      "title": "project title",
      "tools": "Tools, Technologies",
      "date": "Month Year or range",
      "bullets": ["bullet 1", "bullet 2"]
    }
  ],
  "cover_letter": "full professional cover letter (4 paragraphs): P1 — hook specific to this company's product, mission, or recent news (reference the company_brief you generate); P2 — strongest matching experience with a specific metric; P3 — bridge between the candidate's trajectory and this role's growth path; P4 — concise call to action. NEVER open with 'I am excited to apply' or 'I am writing to express my interest' or any similar generic opener.",
  "interview_questions": ["q1", "q2", "q3", "q4", "q5"],
  "company_brief": "2-3 sentences: what the company does and why this role is a strong fit for the candidate"
}

Rules:
- Keep ALL work experiences from the profile with the same company/location/title/dates — only tailor the bullets
- Clean job titles: strip suffixes like "– Extern", "– Externship", "– Contract", "(Part-time)" etc. — keep only the core title
- Each experience MUST have exactly 3 bullets — never 2, never 4
- Select 3-4 most relevant projects; each project MUST have exactly 2-3 bullets
- Use **bold** around key metrics and impact words in bullets (rendered as LaTeX bold)
- Every bullet MUST be specific and quantified — include a number, %, $, named deliverable, or concrete outcome
- FORBIDDEN bullet endings — never use any of these patterns:
    "resulting in increased engagement" (no metric)
    "supporting client expansion goals" / "supporting X goals"
    "showcasing skills in X" / "demonstrating skills relevant to X"
    "providing insights into X"
    "ensuring accurate X"
    "strengthen market positioning"
    "informed investment decisions" (without a number)
    "across multiple scenarios" (without naming the outcome)
  Replace each with the actual number, decision, or deliverable that resulted
- Project bullets must state a real output: ARIMA MAPE figure, DCF valuation range, IRR/cap rate, % improvement, etc.
- Apple DCF bullet must include a specific implied share price or enterprise value estimate
- Interview questions should be insightful behavioral/situational questions for this specific role
${keywordsBlock}
SELF-CHECK each bullet before finalizing:
[ ] Starts with a strong past-tense action verb (Built, Drove, Reduced, Designed, Led, Analyzed, Developed, Automated, ...)
[ ] Contains at least one quantity (number, %, $, named deliverable, or time saved)
${selfCheckKeywordLine}[ ] Does NOT end with a vague phrase from the FORBIDDEN list above
Rewrite any bullet that fails a check before including it in the JSON.`;
}

// ---------------------------------------------------------------------------
// Jobs routes
// ---------------------------------------------------------------------------
app.get('/api/jobs', (req, res) => {
  const data = readData();
  res.json(data.jobs);
});

app.get('/api/jobs/:id', (req, res) => {
  const data = readData();
  const job = data.jobs.find(j => j.id === parseInt(req.params.id));
  if (!job) return res.status(404).json({ error: 'Job not found' });
  res.json(job);
});

app.post('/api/jobs', (req, res) => {
  const data = readData();
  const now = new Date().toISOString();
  const job = {
    id: data.nextId++,
    title: req.body.title || '',
    company: req.body.company || '',
    location: req.body.location || '',
    url: req.body.url || '',
    description: req.body.description || '',
    status: req.body.status || 'Saved',
    notes: req.body.notes || '',
    kit: null,
    created_at: now,
    updated_at: now,
  };
  data.jobs.push(job);
  writeData(data);
  res.status(201).json(job);
});

app.put('/api/jobs/:id', (req, res) => {
  const data = readData();
  const idx = data.jobs.findIndex(j => j.id === parseInt(req.params.id));
  if (idx === -1) return res.status(404).json({ error: 'Job not found' });
  const allowed = ['title', 'company', 'location', 'url', 'description', 'status', 'notes', 'kit'];
  for (const key of allowed) {
    if (key in req.body) data.jobs[idx][key] = req.body[key];
  }
  data.jobs[idx].updated_at = new Date().toISOString();
  writeData(data);
  res.json(data.jobs[idx]);
});

app.delete('/api/jobs/:id', (req, res) => {
  const data = readData();
  const idx = data.jobs.findIndex(j => j.id === parseInt(req.params.id));
  if (idx === -1) return res.status(404).json({ error: 'Job not found' });
  data.jobs.splice(idx, 1);
  writeData(data);
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Kit generation
// ---------------------------------------------------------------------------
app.post('/api/jobs/:id/kit', async (req, res) => {
  try {
    const data = readData();
    const job = data.jobs.find(j => j.id === parseInt(req.params.id));
    if (!job) return res.status(404).json({ error: 'Job not found' });

    const { openrouter_api_key, openrouter_model, profile } = data.settings;
    if (!openrouter_api_key) return res.status(400).json({ error: 'OpenRouter API key not configured in Settings' });
    if (!profile) return res.status(400).json({ error: 'Profile not configured in Settings' });

    const model = openrouter_model || 'anthropic/claude-sonnet-4-5';
    const keywordModel = data.settings.keyword_model || 'openai/gpt-4o-mini';

    // Extract ATS keywords from the JD (lightweight separate call using a fast model)
    const keywords = await extractJdKeywords(job.description || '', openrouter_api_key, keywordModel);
    if (keywords.length > 0) console.log(`[ats] Extracted ${keywords.length} keywords:`, keywords.join(', '));

    const prompt = buildKitPrompt(profile, job, keywords);

    const aiRes = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openrouter_api_key}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'http://localhost:5173',
        'X-Title': 'Job Tracker',
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3,
      }),
    });

    if (!aiRes.ok) {
      const errText = await aiRes.text();
      return res.status(500).json({ error: `OpenRouter error: ${errText}` });
    }

    const aiJson = await aiRes.json();
    const raw = aiJson.choices[0].message.content.trim();

    let resumeContent;
    try {
      resumeContent = JSON.parse(raw);
    } catch {
      const match = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (match) resumeContent = JSON.parse(match[1].trim());
      else throw new Error('AI did not return valid JSON');
    }

    resumeContent = sanitizeResumeContent(resumeContent);

    // Batch-fill all under-generated experiences in a single API call
    const underGenerated = resumeContent.experiences.filter(e => (e.bullets || []).length < 3);
    if (underGenerated.length > 0) {
      try {
        const fills = await batchFillBullets(underGenerated, job, openrouter_api_key, model);
        for (const [idxStr, newBullets] of Object.entries(fills)) {
          const exp = underGenerated[parseInt(idxStr)];
          if (!exp || !Array.isArray(newBullets)) continue;
          const i = resumeContent.experiences.findIndex(e => e.company === exp.company && e.title === exp.title);
          if (i !== -1) {
            const needed = 3 - resumeContent.experiences[i].bullets.length;
            resumeContent.experiences[i].bullets.push(...newBullets.slice(0, needed));
          }
        }
        console.log(`[bullet-fill] Batch-filled ${underGenerated.length} experience(s) in one API call`);
      } catch (fillErr) {
        console.warn('[bullet-fill] Batch fill failed:', fillErr.message);
      }
    }

    // Re-sanitize to cap at 3 after fill
    resumeContent = sanitizeResumeContent(resumeContent);

    // Compute ATS keyword match score (pure JS, no API call)
    const ats_analysis = computeAtsScore(resumeContent, keywords);
    if (ats_analysis.score !== null) {
      console.log(`[ats] Score: ${ats_analysis.score}% (${ats_analysis.matched_keywords.length}/${keywords.length} keywords matched)`);
    }

    const kit = {
      resume_content: resumeContent,
      resume_latex: buildResumeLatex(resumeContent),
      cover_letter: resumeContent.cover_letter || '',
      interview_questions: resumeContent.interview_questions || [],
      company_brief: resumeContent.company_brief || '',
      ats_analysis,
    };

    const idx = data.jobs.findIndex(j => j.id === job.id);
    data.jobs[idx].kit = kit;
    data.jobs[idx].updated_at = new Date().toISOString();
    writeData(data);

    res.json({ kit });
  } catch (err) {
    console.error('Kit generation error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ATS score read endpoint (no AI call — reads stored analysis)
app.get('/api/jobs/:id/kit/ats-score', (req, res) => {
  const data = readData();
  const job = data.jobs.find(j => j.id === parseInt(req.params.id));
  if (!job) return res.status(404).json({ error: 'Job not found' });
  if (!job.kit) return res.status(400).json({ error: 'Kit not yet generated for this job' });
  res.json({ ats_analysis: job.kit.ats_analysis || null });
});

// ---------------------------------------------------------------------------
// Rank all jobs by fit score (AI)
// ---------------------------------------------------------------------------
app.post('/api/jobs/rank-all', async (req, res) => {
  const data = readData();
  const { openrouter_api_key, openrouter_model, profile } = data.settings || {};
  if (!openrouter_api_key) return res.status(400).json({ error: 'OpenRouter API key not configured' });
  if (!profile) return res.status(400).json({ error: 'Profile not configured in settings' });

  const jobs = data.jobs;
  if (jobs.length === 0) return res.json({ ranked: 0, jobs: [] });

  const summaries = jobs.map(j =>
    `ID ${j.id}: ${j.title} at ${j.company}${j.location ? `, ${j.location}` : ''}. Description: ${(j.description || '').slice(0, 300)}`
  ).join('\n');

  const prompt = `You are a career coach. Given a candidate profile and a list of job postings, rate each job's fit on a 0-100 scale.

Candidate profile:
${profile.slice(0, 1000)}

Jobs:
${summaries}

Return a JSON array with one object per job: [{ "id": <number>, "fit_score": <0-100>, "fit_reason": "<one sentence>" }, ...]
Return ONLY valid JSON, no markdown.`;

  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${openrouter_api_key}` },
      body: JSON.stringify({
        model: openrouter_model || 'anthropic/claude-3.5-sonnet',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3,
      }),
    });
    const aiRes = await response.json();
    const raw = aiRes.choices?.[0]?.message?.content || '[]';
    const rankings = JSON.parse(raw.replace(/```json|```/g, '').trim());

    let ranked = 0;
    for (const r of rankings) {
      const job = data.jobs.find(j => j.id === r.id);
      if (!job) continue;
      job.fit_score = r.fit_score;
      job.fit_reason = r.fit_reason;
      ranked++;
    }
    writeData(data);
    res.json({ ranked, jobs: data.jobs });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// Apify sync — fetch Apify jobs and add new ones as tracked jobs
// ---------------------------------------------------------------------------
app.post('/api/apify/sync', async (req, res) => {
  const data = readData();
  const { apify_api_key, apify_actor_id } = data.settings || {};
  if (!apify_api_key || !apify_actor_id) return res.status(400).json({ error: 'Apify API key and actor ID not configured' });

  try {
    const apifyRes = await fetch(
      `https://api.apify.com/v2/acts/${apify_actor_id}/run-sync-get-dataset-items?token=${apify_api_key}&timeout=60`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) }
    );
    const items = await apifyRes.json();
    if (!Array.isArray(items)) return res.status(500).json({ error: 'Unexpected Apify response format' });

    let added = 0;
    let skipped = 0;
    const existingUrls = new Set(data.jobs.map(j => j.url).filter(Boolean));

    for (const item of items) {
      const url = item.url || item.jobUrl || item.link || '';
      if (url && existingUrls.has(url)) { skipped++; continue; }

      const now = new Date().toISOString();
      const job = {
        id: data.nextId++,
        title: item.title || item.position || 'Unknown Title',
        company: item.company || item.companyName || 'Unknown Company',
        location: item.location || '',
        url,
        description: item.description || item.jobDescription || '',
        status: 'Saved',
        notes: '',
        kit: null,
        created_at: now,
        updated_at: now,
      };
      data.jobs.push(job);
      if (url) existingUrls.add(url);
      added++;
    }

    writeData(data);
    res.json({ added, skipped, total: items.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// Settings routes
// ---------------------------------------------------------------------------
app.get('/api/settings', (req, res) => {
  const data = readData();
  res.json(data.settings || {});
});

app.put('/api/settings', (req, res) => {
  const data = readData();
  const allowed = ['profile', 'openrouter_api_key', 'openrouter_model', 'apify_api_key', 'apify_actor_id', 'keyword_model'];
  if (!data.settings) data.settings = {};
  for (const key of allowed) {
    if (key in req.body) data.settings[key] = req.body[key];
  }
  writeData(data);
  res.json(data.settings);
});

// ---------------------------------------------------------------------------
// URL parse (fetch job description)
// ---------------------------------------------------------------------------
app.post('/api/parse-url', async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: 'url required' });

  const data = readData();
  const { apify_api_key, apify_actor_id } = data.settings || {};

  // Try Apify scraper first
  if (apify_api_key && apify_actor_id) {
    try {
      const runRes = await fetch(
        `https://api.apify.com/v2/acts/${apify_actor_id}/run-sync-get-dataset-items?token=${apify_api_key}&timeout=30`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ startUrls: [{ url }] }),
        }
      );
      if (runRes.ok) {
        const items = await runRes.json();
        if (Array.isArray(items) && items.length > 0) {
          const item = items[0];
          return res.json({
            title: item.title || item.positionName || '',
            company: item.company || item.companyName || '',
            location: item.location || '',
            description: item.description || item.text || '',
          });
        }
      }
    } catch (e) {
      console.warn('Apify scrape failed, falling back to direct fetch:', e.message);
    }
  }

  // Fallback: direct fetch + naive text extract
  try {
    const pageRes = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(10000) });
    if (!pageRes.ok) return res.status(400).json({ error: `Could not fetch URL (status ${pageRes.status})` });
    const html = await pageRes.text();
    const text = html.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
                     .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
                     .replace(/<[^>]+>/g, ' ')
                     .replace(/\s{2,}/g, ' ')
                     .trim()
                     .slice(0, 5000);
    res.json({ description: text });
  } catch (err) {
    res.status(500).json({ error: `Fetch failed: ${err.message}` });
  }
});

// ---------------------------------------------------------------------------
// Job recommendations
// ---------------------------------------------------------------------------
function deriveRoleAndLocation(profile = '') {
  const rolePatterns = [
    /seeking\s+(?:a\s+)?(?:position\s+as\s+)?([A-Za-z\s]+?)(?:\s+role|\s+position|\s+at|\.|,|$)/i,
    /looking\s+for\s+(?:a\s+)?([A-Za-z\s]+?)(?:\s+role|\s+position|\s+at|\.|,|$)/i,
    /aspiring\s+([A-Za-z\s]+?)(?:\s+at|\.|,|$)/i,
  ];
  let role = '';
  for (const pat of rolePatterns) {
    const m = profile.match(pat);
    if (m) { role = m[1].trim(); break; }
  }
  if (!role) {
    const titleMatch = profile.match(/\b([A-Za-z\s]+(?:Analyst|Engineer|Manager|Developer|Consultant|Associate|Researcher))\b/);
    if (titleMatch) role = titleMatch[1].trim();
  }
  if (!role) role = 'Data Analyst';

  const locMatch = profile.match(/\b([A-Za-z\s]+,\s*(?:CA|NY|TX|WA|IL|GA|MA|FL|CO|OR|VA|NC|AZ|OH|MI|PA))\b/);
  const location = locMatch ? locMatch[1].trim() : 'United States';

  return { role, location };
}

async function fetchAiRecommendations(role, location, limit, profile, openrouter_api_key, model) {
  const prompt = `You are a job search advisor. Based on the candidate profile below, suggest ${limit} specific job opportunities.
For each, name a real company and role that plausibly exists and is a strong match for this candidate.

Profile:
${(profile || '').slice(0, 2000)}

Target role: ${role}
Target location: ${location}

Return ONLY a JSON array:
[
  {
    "title": "Data Analyst",
    "company": "Stripe",
    "location": "San Francisco, CA",
    "url": "",
    "description": "150-300 word description of the role responsibilities and requirements",
    "match_reasoning": "1-2 sentences citing specific skills or experiences from the profile that match"
  }
]

Rules:
- Name real companies that actively hire ${role} roles at a student/entry level
- match_reasoning must reference specific details from the profile (skills, projects, coursework)
- description must be 150-300 words of realistic JD content for this role
- Vary company size: include a mix of large tech, mid-size, and startups`;

  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${openrouter_api_key}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'http://localhost:5173',
      'X-Title': 'Job Tracker',
    },
    body: JSON.stringify({
      model: model || 'anthropic/claude-sonnet-4-5',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7,
    }),
  });
  if (!res.ok) throw new Error(`AI recommendations failed: ${res.status}`);
  const json = await res.json();
  let raw = json.choices[0].message.content.trim();
  const fenceMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) raw = fenceMatch[1].trim();
  const recs = JSON.parse(raw);
  return Array.isArray(recs) ? recs : [];
}

async function fetchApifyRecommendations(role, location, limit, apify_api_key, apify_actor_id) {
  const res = await fetch(
    `https://api.apify.com/v2/acts/${apify_actor_id}/run-sync-get-dataset-items?token=${apify_api_key}&timeout=60`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ position: role, location, maxItems: limit }),
    }
  );
  if (!res.ok) throw new Error(`Apify job search failed: ${res.status}`);
  const items = await res.json();
  if (!Array.isArray(items)) return [];
  return items.map(item => ({
    title: item.title || item.positionName || role,
    company: item.company || item.companyName || '',
    location: item.location || location,
    url: item.url || item.jobUrl || '',
    description: item.description || item.text || '',
    match_reasoning: '',
  }));
}

app.post('/api/recommendations', async (req, res) => {
  try {
    const data = readData();
    const { openrouter_api_key, openrouter_model, profile, apify_api_key, apify_actor_id } = data.settings || {};
    if (!openrouter_api_key && !apify_api_key) {
      return res.status(400).json({ error: 'OpenRouter API key not configured in Settings' });
    }

    const limit = Math.min(parseInt(req.body.limit) || 10, 20);
    const { role: derivedRole, location: derivedLocation } = deriveRoleAndLocation(profile || '');
    const role = req.body.role || derivedRole;
    const location = req.body.location || derivedLocation;

    let recommendations, source;
    if (apify_api_key && apify_actor_id) {
      try {
        recommendations = await fetchApifyRecommendations(role, location, limit, apify_api_key, apify_actor_id);
        source = 'apify';
      } catch (apifyErr) {
        console.warn('Apify recommendations failed, falling back to AI:', apifyErr.message);
        recommendations = await fetchAiRecommendations(role, location, limit, profile, openrouter_api_key, openrouter_model);
        source = 'ai';
      }
    } else {
      recommendations = await fetchAiRecommendations(role, location, limit, profile, openrouter_api_key, openrouter_model);
      source = 'ai';
    }

    if (!data.nextRecId) data.nextRecId = 1;
    const now = new Date().toISOString();
    const stamped = recommendations.map(r => ({
      ...r,
      id: `rec_${data.nextRecId++}`,
      source,
      created_at: now,
    }));
    data.recommendations = stamped;
    writeData(data);

    res.json({ source, recommendations: stamped });
  } catch (err) {
    console.error('Recommendations error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/recommendations/:recId/save', (req, res) => {
  const data = readData();
  const rec = (data.recommendations || []).find(r => r.id === req.params.recId);
  if (!rec) return res.status(404).json({ error: 'Recommendation not found' });

  const now = new Date().toISOString();
  const job = {
    id: data.nextId++,
    title: rec.title || '',
    company: rec.company || '',
    location: rec.location || '',
    url: rec.url || '',
    description: rec.description || '',
    status: 'Saved',
    notes: rec.match_reasoning ? `Recommended: ${rec.match_reasoning}` : '',
    kit: null,
    created_at: now,
    updated_at: now,
  };
  data.jobs.push(job);
  writeData(data);
  res.status(201).json({ job });
});

// ---------------------------------------------------------------------------
// Daily Apify recommendation refresh
// ---------------------------------------------------------------------------
const REFRESH_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours

async function refreshRecommendations() {
  const data = readData();
  const { apify_api_key, apify_actor_id, openrouter_api_key, openrouter_model, profile } = data.settings || {};

  if (!apify_api_key || !apify_actor_id) {
    console.log('[daily-refresh] Skipped — Apify not configured.');
    return;
  }

  const { role, location } = deriveRoleAndLocation(profile || '');
  console.log(`[daily-refresh] Fetching Apify recommendations for "${role}" in "${location}"...`);

  try {
    let recommendations, source;
    try {
      recommendations = await fetchApifyRecommendations(role, location, 10, apify_api_key, apify_actor_id);
      source = 'apify';
    } catch (apifyErr) {
      console.warn('[daily-refresh] Apify failed, falling back to AI:', apifyErr.message);
      if (!openrouter_api_key) throw apifyErr;
      recommendations = await fetchAiRecommendations(role, location, 10, profile, openrouter_api_key, openrouter_model);
      source = 'ai';
    }

    const fresh = readData(); // re-read in case settings changed during fetch
    if (!fresh.nextRecId) fresh.nextRecId = 1;
    const now = new Date().toISOString();
    fresh.recommendations = recommendations.map(r => ({
      ...r,
      id: `rec_${fresh.nextRecId++}`,
      source,
      created_at: now,
    }));
    fresh.last_rec_refresh = now;
    writeData(fresh);
    console.log(`[daily-refresh] Stored ${recommendations.length} recommendations (source: ${source}).`);
  } catch (err) {
    console.error('[daily-refresh] Failed:', err.message);
  }
}

function scheduleRefresh() {
  const data = readData();
  const last = data.last_rec_refresh ? new Date(data.last_rec_refresh).getTime() : 0;
  const age = Date.now() - last;

  if (age >= REFRESH_INTERVAL_MS) {
    console.log('[daily-refresh] Recommendations are stale — refreshing now...');
    refreshRecommendations();
  } else {
    const nextMs = REFRESH_INTERVAL_MS - age;
    console.log(`[daily-refresh] Next refresh in ${Math.round(nextMs / 3600000 * 10) / 10}h`);
  }

  // Re-check every hour so a long-running server catches the next window
  setInterval(() => {
    const d = readData();
    const lastTs = d.last_rec_refresh ? new Date(d.last_rec_refresh).getTime() : 0;
    if (Date.now() - lastTs >= REFRESH_INTERVAL_MS) {
      console.log('[daily-refresh] 24h elapsed — refreshing recommendations...');
      refreshRecommendations();
    }
  }, 60 * 60 * 1000);
}

// Manual trigger endpoint
app.post('/api/recommendations/refresh', async (req, res) => {
  try {
    await refreshRecommendations();
    const data = readData();
    res.json({ ok: true, count: (data.recommendations || []).length, last_refresh: data.last_rec_refresh });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------
app.listen(PORT, () => {
  console.log(`Job Tracker server running on http://localhost:${PORT}`);
  scheduleRefresh();
});
