'use client';

import { useState, useRef } from 'react';
import {
  Upload, Loader2, CheckCircle2, AlertCircle,
  Plus, Trash2, Download, Eye, ChevronDown, ChevronUp, Search,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

type AnalysisResult = {
  score: number;
  matchedKeywords: number;
  totalKeywords: number;
  strengths: string[];
  improvements: string[];
  sectionScores: { name: string; present: boolean }[];
};

type EducationEntry  = { degree: string; institution: string; year: string; cgpa: string };
type ExperienceEntry = { title: string; company: string; duration: string; description: string };
type ProjectEntry    = { name: string; tech: string; description: string; link: string };

type ResumeData = {
  name: string; phone: string; email: string; linkedin: string; github: string;
  objective: string;
  education: EducationEntry[];
  skills: string;
  experience: ExperienceEntry[];
  projects: ProjectEntry[];
  achievements: string;
};

const CARD = { backgroundColor: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: '0.75rem' } as const;
const INPUT_STYLE: React.CSSProperties = {
  backgroundColor: 'var(--input-bg)',
  border: '1px solid var(--border)',
  borderRadius: '0.5rem',
  padding: '0.6rem 0.75rem',
  fontSize: '0.875rem',
  color: 'var(--text-main)',
  width: '100%',
  outline: 'none',
};
const LABEL: React.CSSProperties = {
  fontSize: '0.7rem',
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  color: 'var(--text-muted)',
  display: 'block',
  marginBottom: '0.35rem',
};

// ─── Score Ring ───────────────────────────────────────────────────────────────
function ScoreRing({ score }: { score: number }) {
  const r = 52; const circ = 2 * Math.PI * r;
  const offset = circ - (score / 100) * circ;
  const color = score >= 70 ? '#22c55e' : score >= 40 ? '#FACC15' : '#ef4444';
  return (
    <div className="flex flex-col items-center gap-1">
      <svg width="130" height="130" viewBox="0 0 120 120">
        <circle cx="60" cy="60" r={r} fill="none" stroke="var(--card-bg2)" strokeWidth="10" />
        <circle cx="60" cy="60" r={r} fill="none" stroke={color} strokeWidth="10"
          strokeDasharray={circ} strokeDashoffset={offset}
          strokeLinecap="round" transform="rotate(-90 60 60)"
          style={{ transition: 'stroke-dashoffset 1s ease-out' }} />
        <text x="60" y="58" textAnchor="middle" dominantBaseline="middle"
          style={{ fontSize: 24, fontWeight: 800, fill: 'var(--text-main)' }}>{score}</text>
        <text x="60" y="76" textAnchor="middle" style={{ fontSize: 11, fill: 'var(--text-muted)' }}>/100</text>
      </svg>
      <span className="text-xs font-semibold" style={{ color }}>
        {score >= 70 ? 'Strong' : score >= 40 ? 'Average' : 'Needs Work'}
      </span>
    </div>
  );
}

// ─── Analyzer Tab ─────────────────────────────────────────────────────────────
function AnalyzerTab() {
  const [dragging,  setDragging]  = useState(false);
  const [loading,   setLoading]   = useState(false);
  const [result,    setResult]    = useState<AnalysisResult | null>(null);
  const [error,     setError]     = useState('');
  const [fileName,  setFileName]  = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  async function analyze(file: File) {
    setLoading(true); setError(''); setResult(null); setFileName(file.name);
    try {
      const fd = new FormData(); fd.append('file', file);
      const res = await fetch('/api/resume/analyze', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Analysis failed');
      setResult(data);
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault(); setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) analyze(f);
  }

  return (
    <div className="space-y-6">
      {/* Upload zone */}
      <div
        onDragOver={e => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => fileRef.current?.click()}
        className="p-12 flex flex-col items-center justify-center cursor-pointer rounded-xl transition-all"
        style={{
          ...CARD,
          border: dragging ? '2px dashed #FACC15' : '2px dashed rgba(250,204,21,0.4)',
          backgroundColor: dragging ? 'var(--card-bg2)' : 'var(--card-bg)',
        }}
      >
        <input ref={fileRef} type="file" accept=".pdf,.doc,.docx,.txt" className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) analyze(f); }} />
        {loading ? (
          <div className="flex flex-col items-center gap-3">
            <Loader2 size={36} className="animate-spin text-yellow-500" />
            <p className="text-sm font-medium" style={{ color: 'var(--text-muted)' }}>Analyzing {fileName}…</p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3 text-center">
            <div className="w-14 h-14 rounded-xl flex items-center justify-center"
                 style={{ backgroundColor: 'var(--card-bg2)' }}>
              <Upload size={26} style={{ color: '#B45309' }} />
            </div>
            <div>
              <p className="font-semibold text-sm" style={{ color: 'var(--text-main)' }}>
                Drop your resume or click to browse
              </p>
              <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>PDF, DOC, DOCX, TXT supported</p>
            </div>
          </div>
        )}
      </div>

      {error && (
        <div className="flex items-center gap-2 p-3 rounded-xl bg-red-50 text-red-600 text-sm">
          <AlertCircle size={16} /> {error}
        </div>
      )}

      {/* Results */}
      {result && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {/* Score */}
          <div className="dark-card p-6 flex flex-col items-center gap-3" style={CARD}>
            <p className="text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>ATS Score</p>
            <ScoreRing score={result.score} />
            <p className="text-xs text-center" style={{ color: 'var(--text-muted)' }}>
              {result.matchedKeywords} of {result.totalKeywords} keywords matched
            </p>
          </div>

          {/* Section detection */}
          <div className="dark-card p-5" style={CARD}>
            <p className="text-xs font-bold uppercase tracking-widest mb-4" style={{ color: 'var(--text-muted)' }}>Sections Found</p>
            <div className="space-y-2">
              {result.sectionScores.map((s, i) => (
                <div key={i} className="flex items-center gap-2 text-sm">
                  <div className={`w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0 ${
                    s.present ? 'bg-emerald-100 text-emerald-600' : 'bg-red-50 text-red-400'}`}>
                    {s.present ? <CheckCircle2 size={10} /> : <AlertCircle size={10} />}
                  </div>
                  <span style={{ color: s.present ? '#1F2937' : '#9CA3AF' }}>{s.name}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Feedback */}
          <div className="dark-card p-5 space-y-4" style={CARD}>
            {result.strengths.length > 0 && (
              <div>
                <p className="text-xs font-bold uppercase tracking-widest mb-2 text-emerald-700">Strengths</p>
                <ul className="space-y-1.5">
                  {result.strengths.map((s, i) => (
                    <li key={i} className="text-xs flex gap-2" style={{ color: 'var(--text-main)' }}>
                      <span className="text-emerald-500 flex-shrink-0 mt-0.5">✓</span>{s}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {result.improvements.length > 0 && (
              <div>
                <p className="text-xs font-bold uppercase tracking-widest mb-2 text-amber-700">Improve</p>
                <ul className="space-y-1.5">
                  {result.improvements.map((s, i) => (
                    <li key={i} className="text-xs flex gap-2" style={{ color: 'var(--text-main)' }}>
                      <span className="text-yellow-500 flex-shrink-0 mt-0.5">→</span>{s}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── LaTeX Generator ──────────────────────────────────────────────────────────
function buildLatex(d: ResumeData): string {
  const esc = (s: string) =>
    s.replace(/&/g, '\\&').replace(/%/g, '\\%').replace(/#/g, '\\#').replace(/_/g, '\\_');

  const eduRows = d.education.map(e =>
    `  ${esc(e.degree)} & ${esc(e.institution)} & ${esc(e.year)} & ${esc(e.cgpa)} \\\\`
  ).join('\n');

  const expBlock = d.experience.map(e =>
    `\\textbf{${esc(e.title)}} \\hfill ${esc(e.duration)}\\\\\n${esc(e.company)}\n\\begin{itemize}\n  \\item ${esc(e.description)}\n\\end{itemize}`
  ).join('\n\n');

  const projBlock = d.projects.map(p =>
    `\\textbf{${esc(p.name)}}${p.tech ? ` \\textit{(${esc(p.tech)})}` : ''}\\\\\n${esc(p.description)}${p.link ? `\\\\\n\\textit{${esc(p.link)}}` : ''}`
  ).join('\n\n');

  const achList = d.achievements.split('\n').filter(Boolean).map(a =>
    `  \\item ${esc(a)}`
  ).join('\n');

  return `\\documentclass[a4paper,11pt]{article}
\\usepackage[margin=1in]{geometry}
\\usepackage{array,tabularx,enumitem,hyperref,parskip}
\\hypersetup{colorlinks=true,urlcolor=blue}
\\pagestyle{empty}
\\begin{document}

%--- HEADER ---%
\\begin{center}
  {\\LARGE \\textbf{${esc(d.name)}}}\\\\[4pt]
  ${esc(d.phone)} \\quad|\\quad \\href{mailto:${esc(d.email)}}{${esc(d.email)}}
  ${d.linkedin ? `\\quad|\\quad \\href{https://${esc(d.linkedin)}}{${esc(d.linkedin)}}` : ''}
  ${d.github   ? `\\quad|\\quad \\href{https://${esc(d.github)}}{${esc(d.github)}}` : ''}
\\end{center}
\\vspace{4pt}

%--- OBJECTIVE ---%
${d.objective ? `\\section*{Objective}\n${esc(d.objective)}\n` : ''}

%--- EDUCATION ---%
\\section*{Education}
\\begin{tabular}{|l|l|c|c|}
\\hline
\\textbf{Degree} & \\textbf{Institution} & \\textbf{Year} & \\textbf{CGPA/\\%} \\\\
\\hline
${eduRows}
\\hline
\\end{tabular}

%--- TECHNICAL SKILLS ---%
\\section*{Technical Skills}
${esc(d.skills)}

%--- EXPERIENCE ---%
${expBlock ? `\\section*{Experience}\n${expBlock}\n` : ''}

%--- PROJECTS ---%
${projBlock ? `\\section*{Projects}\n${projBlock}\n` : ''}

%--- ACHIEVEMENTS ---%
${achList ? `\\section*{Achievements}\n\\begin{itemize}\n${achList}\n\\end{itemize}` : ''}

\\end{document}`;
}

// ─── Builder Tab ──────────────────────────────────────────────────────────────
const EMPTY: ResumeData = {
  name: '', phone: '', email: '', linkedin: '', github: '', objective: '',
  education:   [{ degree: '', institution: '', year: '', cgpa: '' }],
  skills:      '',
  experience:  [{ title: '', company: '', duration: '', description: '' }],
  projects:    [{ name: '', tech: '', description: '', link: '' }],
  achievements: '',
};

function Section({ title, open, toggle, children }: {
  title: string; open: boolean; toggle: () => void; children: React.ReactNode;
}) {
  return (
    <div className="dark-card rounded-xl overflow-hidden" style={CARD}>
      <button onClick={toggle}
        className="w-full px-5 py-4 flex items-center justify-between text-sm font-semibold text-left"
        style={{ color: 'var(--text-main)' }}>
        {title}
        {open ? <ChevronUp size={15} style={{ color: 'var(--text-muted)' }} /> : <ChevronDown size={15} style={{ color: 'var(--text-muted)' }} />}
      </button>
      {open && <div className="px-5 pb-5 pt-1 space-y-3">{children}</div>}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={LABEL}>{label}</label>
      {children}
    </div>
  );
}

function BuilderTab() {
  const [data,       setData]       = useState<ResumeData>(EMPTY);
  const [open,       setOpen]       = useState<Record<string, boolean>>({
    personal: true, objective: false, education: false,
    skills: false, experience: false, projects: false, achievements: false,
  });
  const [preview,    setPreview]    = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);
  const previewRef = useRef<HTMLDivElement>(null);

  const set = (k: keyof ResumeData, v: any) => setData(d => ({ ...d, [k]: v }));

  function addEdu()  { set('education',   [...data.education,  { degree: '', institution: '', year: '', cgpa: '' }]); }
  function addExp()  { set('experience',  [...data.experience, { title: '', company: '', duration: '', description: '' }]); }
  function addProj() { set('projects',    [...data.projects,   { name: '', tech: '', description: '', link: '' }]); }

  const updateEdu  = (i: number, k: keyof EducationEntry,  v: string) =>
    set('education',  data.education.map((e, j)  => j === i ? { ...e, [k]: v } : e));
  const updateExp  = (i: number, k: keyof ExperienceEntry, v: string) =>
    set('experience', data.experience.map((e, j) => j === i ? { ...e, [k]: v } : e));
  const updateProj = (i: number, k: keyof ProjectEntry,    v: string) =>
    set('projects',   data.projects.map((p, j)   => j === i ? { ...p, [k]: v } : p));

  function downloadTex() {
    const tex  = buildLatex(data);
    const blob = new Blob([tex], { type: 'text/plain' });
    const a    = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = 'resume.tex'; a.click();
  }

  async function downloadPDF() {
    if (!data.name.trim()) return;
    setPdfLoading(true);
    try {
      const res = await fetch('/api/resume/build', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error('PDF generation failed');
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href = url; a.download = 'resume.pdf'; a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error(e);
    } finally {
      setPdfLoading(false);
    }
  }

  const hasName = data.name.trim().length > 0;

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
          Fill in your details — then preview and download.
        </p>
        <div className="flex gap-2">
          <button onClick={() => setPreview(v => !v)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold border transition-all"
            style={{ backgroundColor: 'var(--card-bg2)', borderColor: 'var(--border)', color: 'var(--text-main)' }}>
            <Eye size={14} /> {preview ? 'Hide Preview' : 'Preview'}
          </button>
          <button onClick={downloadTex} disabled={!hasName}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold border transition-all disabled:opacity-40"
            style={{ backgroundColor: 'var(--card-bg2)', borderColor: 'var(--border)', color: 'var(--text-main)' }}>
            <Download size={14} /> .tex
          </button>
          <button onClick={downloadPDF} disabled={!hasName || pdfLoading}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold hover:shadow-md transition-all disabled:opacity-40"
            style={{ backgroundColor: '#FACC15', color: '#1F2937' }}>
            {pdfLoading
              ? <Loader2 size={14} className="animate-spin" />
              : <Download size={14} />}
            {pdfLoading ? 'Generating…' : 'Download PDF'}
          </button>
        </div>
      </div>

      <div className={`grid gap-5 ${preview ? 'grid-cols-1 xl:grid-cols-2' : 'grid-cols-1'}`}>
        {/* ── Form ── */}
        <div className="space-y-3">

          {/* Personal */}
          <Section title="Personal Info" open={open.personal} toggle={() => setOpen(o => ({ ...o, personal: !o.personal }))}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Field label="Full Name"><input style={INPUT_STYLE} value={data.name}     onChange={e => set('name', e.target.value)}     placeholder="John Doe" /></Field>
              <Field label="Phone">    <input style={INPUT_STYLE} value={data.phone}    onChange={e => set('phone', e.target.value)}    placeholder="+91 98765 43210" /></Field>
              <Field label="Email">    <input style={INPUT_STYLE} value={data.email}    onChange={e => set('email', e.target.value)}    placeholder="hello@example.com" type="email" /></Field>
              <Field label="LinkedIn"> <input style={INPUT_STYLE} value={data.linkedin} onChange={e => set('linkedin', e.target.value)} placeholder="linkedin.com/in/johndoe" /></Field>
              <Field label="GitHub">   <input style={INPUT_STYLE} value={data.github}   onChange={e => set('github', e.target.value)}   placeholder="github.com/johndoe" /></Field>
            </div>
          </Section>

          {/* Objective */}
          <Section title="Objective" open={open.objective} toggle={() => setOpen(o => ({ ...o, objective: !o.objective }))}>
            <Field label="Career Objective">
              <textarea rows={3} style={{ ...INPUT_STYLE, resize: 'vertical' }}
                value={data.objective} onChange={e => set('objective', e.target.value)}
                placeholder="Motivated software engineer seeking…" />
            </Field>
          </Section>

          {/* Education */}
          <Section title="Education" open={open.education} toggle={() => setOpen(o => ({ ...o, education: !o.education }))}>
            {data.education.map((e, i) => (
              <div key={i} className="space-y-2 pb-3" style={{ borderBottom: i < data.education.length - 1 ? '1px solid rgba(250,204,21,0.2)' : 'none' }}>
                <div className="grid grid-cols-2 gap-2">
                  <Field label="Degree/Course"><input style={INPUT_STYLE} value={e.degree}      onChange={ev => updateEdu(i, 'degree',      ev.target.value)} placeholder="B.Tech CSE" /></Field>
                  <Field label="Institution">  <input style={INPUT_STYLE} value={e.institution} onChange={ev => updateEdu(i, 'institution', ev.target.value)} placeholder="MIT" /></Field>
                  <Field label="Year">         <input style={INPUT_STYLE} value={e.year}        onChange={ev => updateEdu(i, 'year',        ev.target.value)} placeholder="2020–2026" /></Field>
                  <Field label="CGPA / %">     <input style={INPUT_STYLE} value={e.cgpa}        onChange={ev => updateEdu(i, 'cgpa',        ev.target.value)} placeholder="8.5" /></Field>
                </div>
                {i > 0 && (
                  <button onClick={() => set('education', data.education.filter((_, j) => j !== i))}
                    className="flex items-center gap-1 text-xs text-red-400 hover:text-red-600 transition-colors">
                    <Trash2 size={12} /> Remove
                  </button>
                )}
              </div>
            ))}
            <button onClick={addEdu} className="flex items-center gap-1 text-xs font-semibold mt-1 hover:underline" style={{ color: '#B45309' }}>
              <Plus size={13} /> Add Education
            </button>
          </Section>

          {/* Skills */}
          <Section title="Technical Skills" open={open.skills} toggle={() => setOpen(o => ({ ...o, skills: !o.skills }))}>
            <Field label="Skills (comma separated)">
              <textarea rows={3} style={{ ...INPUT_STYLE, resize: 'vertical' }}
                value={data.skills} onChange={e => set('skills', e.target.value)}
                placeholder="Python, React, Node.js, PostgreSQL, Docker, AWS…" />
            </Field>
          </Section>

          {/* Experience */}
          <Section title="Experience" open={open.experience} toggle={() => setOpen(o => ({ ...o, experience: !o.experience }))}>
            {data.experience.map((e, i) => (
              <div key={i} className="space-y-2 pb-3" style={{ borderBottom: i < data.experience.length - 1 ? '1px solid rgba(250,204,21,0.2)' : 'none' }}>
                <div className="grid grid-cols-2 gap-2">
                  <Field label="Job Title">  <input style={INPUT_STYLE} value={e.title}    onChange={ev => updateExp(i, 'title',    ev.target.value)} placeholder="Software Engineer" /></Field>
                  <Field label="Company">    <input style={INPUT_STYLE} value={e.company}  onChange={ev => updateExp(i, 'company',  ev.target.value)} placeholder="Google" /></Field>
                  <Field label="Duration">   <input style={INPUT_STYLE} value={e.duration} onChange={ev => updateExp(i, 'duration', ev.target.value)} placeholder="Jan 2023 – Present" className="col-span-2" /></Field>
                </div>
                <Field label="Description">
                  <textarea rows={3} style={{ ...INPUT_STYLE, resize: 'vertical' }}
                    value={e.description} onChange={ev => updateExp(i, 'description', ev.target.value)}
                    placeholder="Key responsibilities and achievements…" />
                </Field>
                {i > 0 && (
                  <button onClick={() => set('experience', data.experience.filter((_, j) => j !== i))}
                    className="flex items-center gap-1 text-xs text-red-400 hover:text-red-600">
                    <Trash2 size={12} /> Remove
                  </button>
                )}
              </div>
            ))}
            <button onClick={addExp} className="flex items-center gap-1 text-xs font-semibold mt-1 hover:underline" style={{ color: '#B45309' }}>
              <Plus size={13} /> Add Experience
            </button>
          </Section>

          {/* Projects */}
          <Section title="Projects" open={open.projects} toggle={() => setOpen(o => ({ ...o, projects: !o.projects }))}>
            {data.projects.map((p, i) => (
              <div key={i} className="space-y-2 pb-3" style={{ borderBottom: i < data.projects.length - 1 ? '1px solid rgba(250,204,21,0.2)' : 'none' }}>
                <div className="grid grid-cols-2 gap-2">
                  <Field label="Project Name"><input style={INPUT_STYLE} value={p.name} onChange={ev => updateProj(i, 'name', ev.target.value)} placeholder="Job Scraper" /></Field>
                  <Field label="Tech Stack">  <input style={INPUT_STYLE} value={p.tech} onChange={ev => updateProj(i, 'tech', ev.target.value)} placeholder="Python, FastAPI" /></Field>
                  <Field label="Link (opt)">  <input style={INPUT_STYLE} value={p.link} onChange={ev => updateProj(i, 'link', ev.target.value)} placeholder="github.com/…" className="col-span-2" /></Field>
                </div>
                <Field label="Description">
                  <textarea rows={2} style={{ ...INPUT_STYLE, resize: 'vertical' }}
                    value={p.description} onChange={ev => updateProj(i, 'description', ev.target.value)}
                    placeholder="Built a real-time job scraper that…" />
                </Field>
                {i > 0 && (
                  <button onClick={() => set('projects', data.projects.filter((_, j) => j !== i))}
                    className="flex items-center gap-1 text-xs text-red-400 hover:text-red-600">
                    <Trash2 size={12} /> Remove
                  </button>
                )}
              </div>
            ))}
            <button onClick={addProj} className="flex items-center gap-1 text-xs font-semibold mt-1 hover:underline" style={{ color: '#B45309' }}>
              <Plus size={13} /> Add Project
            </button>
          </Section>

          {/* Achievements */}
          <Section title="Achievements" open={open.achievements} toggle={() => setOpen(o => ({ ...o, achievements: !o.achievements }))}>
            <Field label="One achievement per line">
              <textarea rows={4} style={{ ...INPUT_STYLE, resize: 'vertical' }}
                value={data.achievements} onChange={e => set('achievements', e.target.value)}
                placeholder="Ranked top 5% on LeetCode&#10;Winner — National Hackathon 2023&#10;Published paper in IEEE CONF" />
            </Field>
          </Section>
        </div>

        {/* ── Live Preview ── */}
        {preview && (
          <div className="rounded-xl overflow-auto shadow-md" style={{ backgroundColor: '#fff', border: '1px solid #ddd', maxHeight: '80vh' }}>
            <div ref={previewRef} style={{ padding: '0.75in 1in', fontFamily: 'Times New Roman, serif', fontSize: '11pt', color: '#000', minHeight: '11in' }}>
              {/* Header */}
              <div style={{ textAlign: 'center', marginBottom: 12 }}>
                <div style={{ fontSize: 20, fontWeight: 'bold' }}>{data.name || 'Your Name'}</div>
                <div style={{ fontSize: 10, color: '#444', marginTop: 4 }}>
                  {[data.phone, data.email, data.linkedin, data.github].filter(Boolean).join(' | ')}
                </div>
              </div>

              {/* Objective */}
              {data.objective && (
                <div>
                  <SectionHead>Objective</SectionHead>
                  <p style={{ fontSize: 10.5, lineHeight: 1.5 }}>{data.objective}</p>
                </div>
              )}

              {/* Education */}
              {data.education.some(e => e.degree) && (
                <div>
                  <SectionHead>Education</SectionHead>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10 }}>
                    <thead>
                      <tr>
                        {['Degree / Course', 'Institution', 'Year', 'CGPA / %'].map(h => (
                          <th key={h} style={{ border: '1px solid #000', padding: '3px 8px', backgroundColor: '#f5f5f5', textAlign: 'left' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {data.education.filter(e => e.degree).map((e, i) => (
                        <tr key={i}>
                          <td style={{ border: '1px solid #000', padding: '3px 8px' }}>{e.degree}</td>
                          <td style={{ border: '1px solid #000', padding: '3px 8px' }}>{e.institution}</td>
                          <td style={{ border: '1px solid #000', padding: '3px 8px' }}>{e.year}</td>
                          <td style={{ border: '1px solid #000', padding: '3px 8px' }}>{e.cgpa}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Skills */}
              {data.skills && (
                <div>
                  <SectionHead>Technical Skills</SectionHead>
                  <p style={{ fontSize: 10.5 }}>{data.skills}</p>
                </div>
              )}

              {/* Experience */}
              {data.experience.some(e => e.title) && (
                <div>
                  <SectionHead>Experience</SectionHead>
                  {data.experience.filter(e => e.title).map((e, i) => (
                    <div key={i} style={{ marginBottom: 10 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ fontWeight: 'bold', fontSize: 10.5 }}>{e.title}</span>
                        <span style={{ fontSize: 10, color: '#555' }}>{e.duration}</span>
                      </div>
                      <div style={{ fontSize: 10, color: '#444', marginBottom: 3 }}>{e.company}</div>
                      <ul style={{ paddingLeft: 18, margin: 0 }}>
                        <li style={{ fontSize: 10.5 }}>{e.description}</li>
                      </ul>
                    </div>
                  ))}
                </div>
              )}

              {/* Projects */}
              {data.projects.some(p => p.name) && (
                <div>
                  <SectionHead>Projects</SectionHead>
                  {data.projects.filter(p => p.name).map((p, i) => (
                    <div key={i} style={{ marginBottom: 10 }}>
                      <span style={{ fontWeight: 'bold', fontSize: 10.5 }}>{p.name}</span>
                      {p.tech && <span style={{ fontStyle: 'italic', fontSize: 10, color: '#555' }}> ({p.tech})</span>}
                      <p style={{ fontSize: 10.5, marginTop: 2 }}>{p.description}</p>
                      {p.link && <p style={{ fontSize: 10, color: '#1a6bc4' }}>{p.link}</p>}
                    </div>
                  ))}
                </div>
              )}

              {/* Achievements */}
              {data.achievements.trim() && (
                <div>
                  <SectionHead>Achievements</SectionHead>
                  <ul style={{ paddingLeft: 18, margin: 0 }}>
                    {data.achievements.split('\n').filter(Boolean).map((a, i) => (
                      <li key={i} style={{ fontSize: 10.5, marginBottom: 3 }}>{a}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Job Match Tab ────────────────────────────────────────────────────────────
function JobMatchTab() {
  const [resumeText, setResumeText] = useState('');
  const [jdText,     setJdText]     = useState('');
  const [loading,    setLoading]    = useState(false);
  const [result,     setResult]     = useState<{ score: number; matched: string[]; missing: string[] } | null>(null);
  const [error,      setError]      = useState('');



  async function handleMatch() {
    if (!resumeText.trim() || !jdText.trim()) return;
    setLoading(true); setError(''); setResult(null);
    try {
      const resumeWords = new Set(
        resumeText.toLowerCase().match(/\b[a-z][a-z0-9.+#-]{1,}\b/g) ?? []
      );
      const jdKeywords = (jdText.toLowerCase().match(/\b[a-z][a-z0-9.+#-]{1,}\b/g) ?? [])
        .filter((w, i, arr) => arr.indexOf(w) === i)
        .filter(w => w.length > 3)
        .filter(w => !['with', 'that', 'this', 'from', 'have', 'will', 'your', 'team', 'work', 'able', 'good', 'must'].includes(w));

      const matched = jdKeywords.filter(k => resumeWords.has(k));
      const missing = jdKeywords.filter(k => !resumeWords.has(k)).slice(0, 20);
      const score   = jdKeywords.length > 0
        ? Math.round((matched.length / jdKeywords.length) * 100)
        : 0;
      setResult({ score, matched: matched.slice(0, 20), missing });
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  }

  return (
    <div className="space-y-5">
      <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
        Paste your resume text and the job description to see keyword match score.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Resume input */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label style={LABEL}>Your Resume Text</label>
          </div>
          <textarea
            rows={10}
            style={{ ...INPUT_STYLE, resize: 'vertical' }}
            value={resumeText}
            onChange={e => setResumeText(e.target.value)}
            placeholder="Paste your resume text here…"
          />
        </div>

        {/* JD input */}
        <div className="space-y-2">
          <label style={LABEL}>Job Description</label>
          <textarea
            rows={10}
            style={{ ...INPUT_STYLE, resize: 'vertical' }}
            value={jdText}
            onChange={e => setJdText(e.target.value)}
            placeholder="Paste the job description here…"
          />
        </div>
      </div>

      <button
        onClick={handleMatch}
        disabled={!resumeText.trim() || !jdText.trim() || loading}
        className="flex items-center gap-2 px-6 py-2.5 rounded-lg text-sm font-semibold hover:shadow-md transition-all disabled:opacity-40"
        style={{ backgroundColor: '#FACC15', color: '#1F2937' }}
      >
        {loading ? <Loader2 size={15} className="animate-spin" /> : <Search size={15} />}
        {loading ? 'Matching…' : 'Check Match'}
      </button>

      {error && (
        <div className="flex items-center gap-2 p-3 rounded-xl bg-red-50 text-red-600 text-sm">
          <AlertCircle size={16} /> {error}
        </div>
      )}

      {result && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {/* Score */}
          <div className="dark-card p-6 flex flex-col items-center gap-3" style={CARD}>
            <p className="text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>Match Score</p>
            <ScoreRing score={result.score} />
            <p className="text-xs text-center" style={{ color: 'var(--text-muted)' }}>
              {result.matched.length} keywords matched
            </p>
          </div>

          {/* Matched */}
          <div className="dark-card p-5" style={CARD}>
            <p className="text-xs font-bold uppercase tracking-widest mb-3 text-emerald-700">Present in Resume</p>
            <div className="flex flex-wrap gap-1.5">
              {result.matched.map((k, i) => (
                <span key={i} className="px-2 py-1 rounded-md text-xs font-medium"
                      style={{ backgroundColor: '#d1fae5', color: '#065f46' }}>
                  {k}
                </span>
              ))}
              {result.matched.length === 0 && (
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>No matches found.</p>
              )}
            </div>
          </div>

          {/* Missing */}
          <div className="dark-card p-5" style={CARD}>
            <p className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: '#B45309' }}>Missing Keywords</p>
            <div className="flex flex-wrap gap-1.5">
              {result.missing.map((k, i) => (
                <span key={i} className="px-2 py-1 rounded-md text-xs font-medium"
                      style={{ backgroundColor: 'var(--card-bg2)', color: '#92400e' }}>
                  {k}
                </span>
              ))}
              {result.missing.length === 0 && (
                <p className="text-xs text-emerald-700">Great — no obvious gaps!</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SectionHead({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: 12, fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.05em',
      borderBottom: '1px solid #000', paddingBottom: 2, margin: '14px 0 6px',
    }}>
      {children}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function ResumePage() {
  const [tab, setTab] = useState<'analyze' | 'build' | 'match'>('analyze');

  return (
    <div className="space-y-6 py-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold" style={{ color: 'var(--text-main)' }}>Resume</h1>
        <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
          Analyze, build, or match your resume to a job description.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 rounded-xl w-fit"
           style={{ backgroundColor: 'var(--card-bg)', border: '1px solid var(--border)' }}>
        {([
          ['analyze', 'Analyze'],
          ['build',   'Build'],
          ['match',   'Job Match'],
        ] as const).map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)}
            className="px-5 py-2 rounded-lg text-sm font-semibold transition-all"
            style={{
              backgroundColor: tab === key ? '#FACC15' : 'transparent',
              color: tab === key ? '#1F2937' : 'var(--text-muted)',
              boxShadow: tab === key ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
            }}>
            {label}
          </button>
        ))}
      </div>

      {/* Content */}
      {tab === 'analyze' && <AnalyzerTab />}
      {tab === 'build'   && <BuilderTab />}
      {tab === 'match'   && <JobMatchTab />}
    </div>
  );
}
