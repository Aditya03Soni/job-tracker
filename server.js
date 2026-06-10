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
function buildKitPrompt(profile, job) {
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
  "cover_letter": "full professional cover letter addressed to the hiring team (3-4 paragraphs, no placeholders)",
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
- Cover letter must name the company and role specifically — no generic placeholders
- Interview questions should be insightful behavioral/situational questions for this specific role`;
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

    const prompt = buildKitPrompt(profile, job);
    const model = openrouter_model || 'anthropic/claude-sonnet-4-5';

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

    // Fill any experience that came back with fewer than 3 bullets
    const underGenerated = resumeContent.experiences.filter(e => (e.bullets || []).length < 3);
    for (const exp of underGenerated) {
      const needed = 3 - exp.bullets.length;
      const fillPrompt = `Generate exactly ${needed} additional resume bullet point(s) for this work experience, tailored to the job below.

Experience: ${exp.title} at ${exp.company} (${exp.dates})
Existing bullets (do NOT repeat these):
${exp.bullets.map((b, i) => `${i + 1}. ${b}`).join('\n')}

Job: ${job.title} at ${job.company}
Description excerpt: ${(job.description || '').slice(0, 800)}

Rules:
- Each bullet must be specific and include a real number, %, $, or named deliverable
- NEVER end with "supporting X", "enhancing Y", "demonstrating skills in Z", "providing insights into X"
- Return ONLY a JSON array of strings — e.g. ["Bullet one text.", "Bullet two text."]`;

      try {
        const fillRes = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${openrouter_api_key}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': 'http://localhost:5173',
            'X-Title': 'Job Tracker',
          },
          body: JSON.stringify({ model, messages: [{ role: 'user', content: fillPrompt }], temperature: 0.3 }),
        });
        if (fillRes.ok) {
          const fillJson = await fillRes.json();
          let fillRaw = fillJson.choices[0].message.content.trim();
          const fenceMatch = fillRaw.match(/```(?:json)?\s*([\s\S]*?)```/);
          if (fenceMatch) fillRaw = fenceMatch[1].trim();
          const newBullets = JSON.parse(fillRaw);
          if (Array.isArray(newBullets)) {
            const i = resumeContent.experiences.findIndex(e => e.company === exp.company && e.title === exp.title);
            if (i !== -1) resumeContent.experiences[i].bullets.push(...newBullets.slice(0, needed));
          }
        }
      } catch (fillErr) {
        console.warn(`[bullet-fill] Failed for "${exp.company} – ${exp.title}":`, fillErr.message);
      }
    }

    // Re-sanitize to cap at 3 after fill
    resumeContent = sanitizeResumeContent(resumeContent);

    const kit = {
      resume_content: resumeContent,
      resume_latex: buildResumeLatex(resumeContent),
      cover_letter: resumeContent.cover_letter || '',
      interview_questions: resumeContent.interview_questions || [],
      company_brief: resumeContent.company_brief || '',
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

// ---------------------------------------------------------------------------
// Settings routes
// ---------------------------------------------------------------------------
app.get('/api/settings', (req, res) => {
  const data = readData();
  res.json(data.settings || {});
});

app.put('/api/settings', (req, res) => {
  const data = readData();
  const allowed = ['profile', 'openrouter_api_key', 'openrouter_model', 'apify_api_key', 'apify_actor_id'];
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
// Start
// ---------------------------------------------------------------------------
app.listen(PORT, () => {
  console.log(`Job Tracker server running on http://localhost:${PORT}`);
});
