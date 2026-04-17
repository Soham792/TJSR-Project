import { NextRequest, NextResponse } from 'next/server';
import { getDocument, extractText } from 'unpdf';

export const runtime = 'nodejs';

// ─── ATS Score Calculator ─────────────────────────────────────────────────────

const ATS_KEYWORDS = [
  "javascript", "python", "java", "c", "c++", "c#", "typescript", "go", "rust", "kotlin", "swift",
  "html", "css", "react", "next.js", "angular", "vue", "node", "express", "rest api", "graphql",
  "machine learning", "deep learning", "nlp", "computer vision", "tensorflow", "pytorch", "scikit-learn",
  "data analysis", "pandas", "numpy", "matplotlib", "power bi", "tableau", "excel",
  "mongodb", "mysql", "postgresql", "firebase", "sql", "redis", "dynamodb",
  "aws", "azure", "gcp", "docker", "kubernetes", "ci/cd", "jenkins", "github actions",
  "cybersecurity", "penetration testing", "ethical hacking", "network security", "encryption",
  "android", "ios", "flutter", "react native", "swift", "kotlin",
  "git", "github", "gitlab", "bitbucket", "jira", "postman",
  "problem solving", "algorithms", "data structures", "oop", "system design",
];

const SECTION_DEFS = [
  { name: 'Contact Info',      keywords: ['phone', 'email', 'linkedin', 'github', 'portfolio', '@', '.com'] },
  { name: 'Summary / Profile', keywords: ['summary', 'objective', 'profile', 'about', 'overview'] },
  { name: 'Education',         keywords: ['education', 'degree', 'university', 'college', 'bachelor', 'master', 'b.e', 'b.tech', 'b.sc', 'cgpa', 'gpa'] },
  { name: 'Work Experience',   keywords: ['experience', 'employment', 'intern', 'engineer', 'developer', 'analyst', 'manager', 'work history'] },
  { name: 'Skills',            keywords: ['skills', 'technologies', 'technical', 'proficiency', 'tools', 'languages'] },
  { name: 'Projects',          keywords: ['project', 'portfolio', 'built', 'developed', 'created', 'implemented'] },
  { name: 'Certifications',    keywords: ['certification', 'certificate', 'certified', 'credential', 'course'] },
  { name: 'Achievements',      keywords: ['achievement', 'award', 'recognition', 'honor', 'ranked', 'winner', 'prize'] },
];

function calcSectionScores(text: string) {
  const lower = text.toLowerCase();
  return SECTION_DEFS.map(s => {
    if (s.name === 'Contact Info') {
      const hasEmail = /@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/.test(text);
      const hasPhone = /\d{3,}[\s-]?\d{3,}[\s-]?\d{3,}/.test(text);
      return { name: s.name, present: hasEmail || hasPhone || s.keywords.some(k => lower.includes(k)) };
    }
    return { name: s.name, present: s.keywords.some(k => lower.includes(k)) };
  });
}

function analyzeTextLocal(text: string) {
  if (!text) return null;
  const lower = text.toLowerCase();
  
  let matchedKeywords = 0;
  const matchedList: string[] = [];
  ATS_KEYWORDS.forEach(word => {
    if (lower.includes(word)) {
      matchedKeywords++;
      matchedList.push(word);
    }
  });
  
  const keywordScore = (matchedKeywords / ATS_KEYWORDS.length) * 70;
  const lengthScore = lower.length > 1200 ? 20 : (lower.length / 1200) * 20;
  
  let sectionScore = 0;
  if (lower.includes("experience")) sectionScore += 5;
  if (lower.includes("projects"))   sectionScore += 5;
  if (lower.includes("education"))  sectionScore += 5;
  if (lower.includes("skills"))     sectionScore += 5;
  
  const diversityScore = matchedKeywords > 15 ? 10 : 0;
  const finalScore = Math.min(100, Math.round(keywordScore + lengthScore + sectionScore + diversityScore));
  
  const sectionScores = calcSectionScores(text);
  const wordCount = text.split(/\s+/).filter(Boolean).length;

  const strengths: string[] = [];
  const improvements: string[] = [];

  if (matchedKeywords > 10) strengths.push(`Strong skills profile — matched ${matchedKeywords} keywords.`);
  if (sectionScore >= 15) strengths.push('Good coverage across major resume sections.');
  if (matchedKeywords <= 10) improvements.push('Consider adding more industry-standard technical keywords.');
  if (sectionScore < 20) improvements.push('Ensure Experience, Projects, Education, and Skills sections are clearly labeled.');

  return {
    score: finalScore,
    matchedKeywords,
    totalKeywords: ATS_KEYWORDS.length,
    matchedList,
    strengths,
    improvements,
    sectionScores,
    wordCount,
  };
}

function parseResumeEntities(text: string) {
  const result: any = { name: '', email: '', phone: '', linkedin: '', github: '', flatSkills: '', bio: '' };
  const emailMatch = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
  if (emailMatch) result.email = emailMatch[0];
  const phoneMatch = text.match(/(?:\+?\d{1,3}[\s-]?)?\(?\d{3}\)?[\s-]?\d{3}[\s-]?\d{4}/);
  if (phoneMatch) result.phone = phoneMatch[0];
  
  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  if (lines.length > 0) {
    const nameCandidate = lines[0].match(/^[A-Z][a-z]+\s+[A-Z][a-z]+/);
    if (nameCandidate) result.name = nameCandidate[0];
  }
  return result;
}

export async function POST(req: NextRequest) {
  try {
    let text = '';
    const ct = req.headers.get('content-type') ?? '';

    if (ct.includes('multipart/form-data')) {
      const fd = await req.formData();
      const file = fd.get('file') as File | null;
      if (!file) return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
      
      if (file.name.endsWith('.pdf')) {
        try {
          const arrayBuffer = await file.arrayBuffer();
          const buffer = Buffer.from(arrayBuffer);
          
          // Use unpdf for serverless compatibility
          const pdf = await getDocument({ data: buffer }).promise;
          const { text: extractedText } = await extractText(pdf);
          text = extractedText ?? '';
          pdf.destroy();
          
          console.log(`[analyze] PDF (unpdf) parsing successful. Extracted ${text.length} chars.`);
        } catch (pdfErr: any) {
          console.error('[analyze] PDF Parsing Error (unpdf):', pdfErr.message);
          return NextResponse.json({ 
            error: 'Failed to read PDF. The environment could not initialize the parser.',
            details: pdfErr.message 
          }, { status: 500 });
        }
      } else {
        text = await file.text();
      }
    } else {
      text = (await req.json()).text ?? '';
    }

    text = text.trim();
    if (text.length < 20) {
      return NextResponse.json({ error: 'Resume text too short. Could not analyze.' }, { status: 422 });
    }

    const analysis = analyzeTextLocal(text);
    if (!analysis) throw new Error('Internal analysis failure');

    return NextResponse.json({
      ...analysis,
      rawText: text,
      parsedForm: parseResumeEntities(text),
    });

  } catch (err: any) {
    console.error('[analyze] CRITICAL ERROR:', err.message);
    return NextResponse.json({ 
      error: 'An unexpected error occurred during analysis.',
      details: err.message
    }, { status: 500 });
  }
}
