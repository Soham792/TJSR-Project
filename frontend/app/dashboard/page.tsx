'use client';

import {
  Briefcase, Clock, Star, Send, ArrowUpRight,
  Search, FileText, Zap, Sparkles, Calendar, Upload,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { JobCard } from '@/components/dashboard/job-card';
import { Chatbot } from '@/components/dashboard/chatbot';
import { useAuth } from '@/lib/auth-context';
import { apiFetch, BACKEND } from '@/lib/api';
import Link from 'next/link';
import { db } from '@/lib/firebase';
import { doc, getDoc } from 'firebase/firestore';
import dynamic from 'next/dynamic';
import { useState, useEffect } from 'react';

// Dynamically import Lottie to stay client-side
const Lottie = dynamic(() => import('lottie-react'), { ssr: false });
import resumeAnimation from '@/public/resumeanimation.json';

const BACKEND_URL = BACKEND;

function AnimatedNumber({ value, duration = 2000 }: { value: number, duration?: number }) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let startTime: number | null = null;
    let animationFrame: number;

    const animate = (timestamp: number) => {
      if (!startTime) startTime = timestamp;
      const progress = timestamp - startTime;
      const percentage = Math.min(progress / duration, 1);
      
      // Easing function (easeOutExpo)
      const easeOutExpo = (x: number): number => {
        return x === 1 ? 1 : 1 - Math.pow(2, -10 * x);
      };
      
      setCount(Math.floor(easeOutExpo(percentage) * value));

      if (percentage < 1) {
        animationFrame = requestAnimationFrame(animate);
      }
    };

    animationFrame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animationFrame);
  }, [value, duration]);

  return <>{count.toLocaleString()}</>;
}

export default function DashboardPage() {
  const { user } = useAuth();
  const [showResume, setShowResume] = useState(false);
  const firstName = user?.displayName?.split(' ')[0] || 'there';

  const { data: jobs = [], isLoading: jobsLoading } = useQuery({
    queryKey: ['jobs', user?.uid],
    enabled: !!user,
    queryFn: async () => {
      const resp = await apiFetch(`/api/v1/jobs?page_size=6`, user);
      if (!resp.ok) return [];
      const data = await resp.json();
      return data.jobs ?? [];
    },
  });

  const { data: stats } = useQuery({
    queryKey: ['dashboard_stats', user?.uid],
    enabled: !!user,
    queryFn: async () => {
      const resp = await apiFetch('/api/v1/stats/dashboard', user);
      if (!resp.ok) {
        console.error('Stats fetch failed:', resp.status);
        return { applications_sent: 0, matched_jobs: 0, total_jobs: 0, jobs_today: 0 };
      }
      const data = await resp.json();
      console.log('Dashboard Stats Loaded:', data);
      return data;
    },
  });

  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric',
  });

  const statCards = [
    { label: 'Total Jobs',   value: 1485, icon: Briefcase, bg: 'bg-yellow-100', text: 'text-yellow-700' },
    { label: 'Jobs Today',   value: 1485, icon: Calendar,  bg: 'bg-sky-100',    text: 'text-sky-600'    },
    { label: 'Matched Jobs', value: 105, icon: Star,      bg: 'bg-amber-100',  text: 'text-amber-600'  },
  ];

  // Fetch Resume from Firestore
  const { data: resumeDoc } = useQuery({
    queryKey: ['user_resume', user?.uid],
    enabled: !!user,
    queryFn: async () => {
      const d = await getDoc(doc(db, 'resumes', user!.uid));
      return d.exists() ? d.data() : null;
    }
  });

  return (
    <div className="space-y-6 py-6">

      {/* ── HERO VIDEO BANNER ── */}
      <div className="relative rounded-xl overflow-hidden" style={{ minHeight: '260px' }}>
        {/* Background video */}
        <video
          className="absolute inset-0 w-full h-full object-cover"
          autoPlay
          loop
          muted
          playsInline
          src="/welcomeback.mp4"
        />
        {/* Dark overlay for text readability */}
        <div className="absolute inset-0" style={{ backgroundColor: 'rgba(0,0,0,0.35)' }} />

        {/* Content */}
        <div className="relative px-7 py-10 md:px-10 md:py-14">
          <p className="text-white/60 text-xs font-semibold uppercase tracking-widest mb-2">{today}</p>
          <h1 className="text-3xl md:text-[2.4rem] font-bold text-white tracking-tight leading-tight mb-2">
            Welcome back, {firstName} 👋
          </h1>
          <p className="text-white/75 text-sm md:text-base mb-8 max-w-lg leading-relaxed">
            {(stats?.matched_jobs ?? 0) > 0
              ? `You have ${stats!.matched_jobs} new AI‑matched jobs waiting. Let's get you hired.`
              : 'Your AI job assistant is ready. Start exploring opportunities.'}
          </p>
          <div className="flex flex-wrap gap-3">
            <Link href="/dashboard/jobs"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg
                         text-sm font-semibold text-[#1F2937]
                         active:scale-95 transition-all duration-150 shadow-sm hover:shadow-md"
              style={{ backgroundColor: '#FACC15' }}>
              <Search size={15} />
              Explore Jobs
            </Link>
            <Link href="/dashboard/resume"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg
                         text-sm font-semibold text-[#1F2937]
                         border active:scale-95 transition-all duration-150"
              style={{ backgroundColor: 'var(--card-bg2)', borderColor: 'var(--border)' }}>
              <FileText size={15} />
              Analyze Resume
            </Link>
          </div>
        </div>
      </div>

      {/* ── STAT CARDS ── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {statCards.map((card, i) => {
          const Icon = card.icon;
          const content = (
            <div key={i}
              className="dark-card rounded-xl p-5 border shadow-sm hover:shadow-md transition-all duration-200 cursor-pointer"
              style={{ backgroundColor: 'var(--card-bg)', borderColor: 'var(--border)' }}>
              <div className="flex items-center justify-between mb-4">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${card.bg} ${card.text}`}>
                  <Icon size={18} />
                </div>
              </div>
              <p className="text-2xl font-bold leading-none" style={{ color: 'var(--text-main)' }}>
                <AnimatedNumber value={card.value} />
              </p>
              <p className="text-xs mt-1.5 font-medium" style={{ color: 'var(--text-muted)' }}>{card.label}</p>
            </div>
          );

          if (card.label === 'Matched Jobs') {
            return (
              <Link href="/dashboard/jobs?sort_by=match_score" key={i}>
                {content}
              </Link>
            );
          }
          return content;
        })}
      </div>

      {/* ── MAIN CONTENT GRID ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Recent AI Matches */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Clock size={16} className="text-yellow-500" />
              <h2 className="text-sm font-semibold" style={{ color: 'var(--text-main)' }}>Recent AI Matches</h2>
            </div>
            <Link href="/dashboard/jobs"
              className="text-xs font-medium flex items-center gap-1 hover:underline"
              style={{ color: '#B45309' }}>
              View all <ArrowUpRight size={12} />
            </Link>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {jobsLoading ? (
              [...Array(4)].map((_, i) => (
                <div key={i}
                  className="h-52 rounded-xl border animate-pulse"
                  style={{ backgroundColor: 'var(--card-bg)', borderColor: 'var(--border)' }} />
              ))
            ) : jobs.length > 0 ? (
              jobs.map((job: any) => <JobCard key={job.id} job={job} />)
            ) : (
              <div className="col-span-2 py-14 text-center rounded-xl border"
                   style={{ backgroundColor: 'var(--card-bg)', borderColor: 'var(--border)' }}>
                <div className="w-14 h-14 rounded-xl flex items-center justify-center mx-auto mb-4"
                     style={{ backgroundColor: 'var(--card-bg2)' }}>
                  <Briefcase size={22} style={{ color: 'var(--text-muted)' }} />
                </div>
                <p className="font-semibold text-sm" style={{ color: 'var(--text-main)' }}>No matches yet</p>
                <p className="text-xs mt-1.5" style={{ color: 'var(--text-muted)' }}>Run a scraper scan to discover new jobs.</p>
              </div>
            )}
          </div>
        </div>

        {/* Right Sidebar */}
        <div className="space-y-4">
          {/* My Resume Preview - High Fidelity Embed */}
          <div className="dark-card p-0 rounded-2xl border shadow-xl overflow-hidden flex flex-col group transition-all"
               style={{ backgroundColor: 'var(--card-bg)', borderColor: 'var(--border)', height: '650px' }}>
            <div className="px-5 py-4 flex items-center justify-between border-b" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--card-bg2)' }}>
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-indigo-100 flex items-center justify-center text-indigo-600">
                  <FileText size={18} />
                </div>
                <div>
                  <h3 className="text-sm font-bold tracking-tight" style={{ color: 'var(--text-main)' }}>
                    {showResume ? ((resumeDoc?.filename?.toLowerCase().includes('soham') ? 'Lance_Resume.pdf' : resumeDoc?.filename) || 'Lance_Resume.pdf') : 'View Your Resume'}
                  </h3>
                  <p className="text-[10px] font-medium" style={{ color: 'var(--text-muted)' }}>
                    {showResume ? 'Direct Dashboard View' : 'Click animation to preview'}
                  </p>
                </div>
              </div>
              {showResume && (
                <button 
                  onClick={() => setShowResume(false)}
                  className="text-[10px] font-bold text-indigo-600 hover:underline"
                >
                  Close Preview
                </button>
              )}
            </div>
            
            <div className="flex-1 bg-white relative flex flex-col items-center justify-center cursor-pointer">
              {showResume ? (
                <iframe 
                  src={(resumeDoc?.resumeUrl && !resumeDoc.resumeUrl.toLowerCase().includes('soham') ? resumeDoc.resumeUrl : '/Lance_Resume.pdf') + '#toolbar=0&navpanes=0&scrollbar=0'}
                  className="w-full h-full border-0"
                  title="Resume Preview"
                />
              ) : (
                <div 
                  className="w-full h-full flex flex-col items-center justify-center p-8 text-center"
                  onClick={() => setShowResume(true)}
                >
                  <div className="w-64 h-64">
                    <Lottie 
                      animationData={resumeAnimation} 
                      loop={true} 
                    />
                  </div>
                  <p className="mt-4 text-sm font-semibold text-indigo-600 animate-bounce">
                    Click to Open Resume
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Scan Status */}
          <div className="dark-card rounded-xl border shadow-sm overflow-hidden"
               style={{ backgroundColor: 'var(--card-bg)', borderColor: 'var(--border)' }}>
            <div className="px-5 py-4 flex items-center justify-between"
                 style={{ borderBottom: '1px solid var(--border)' }}>
              <h3 className="text-sm font-semibold" style={{ color: 'var(--text-main)' }}>Scan Status</h3>
              <span className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full ${
                stats?.is_scraper_running
                  ? 'bg-emerald-100 text-emerald-700'
                  : 'bg-yellow-100 text-yellow-700'
              }`}>
                {stats?.is_scraper_running ? '● Live' : '○ Idle'}
              </span>
            </div>
            <div className="p-5 space-y-4">
              <div className="flex items-center justify-between text-xs">
                <span style={{ color: 'var(--text-muted)' }}>Last scanned</span>
                <span className="font-medium" style={{ color: 'var(--text-main)' }}>2 hours ago</span>
              </div>
              <div>
                <div className="flex items-center justify-between mb-2 text-xs">
                  <span style={{ color: 'var(--text-muted)' }}>Success rate</span>
                  <span className="text-emerald-600 font-semibold">98%</span>
                </div>
                <div className="h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--card-bg2)' }}>
                  <div
                    className="h-full rounded-full progress-bar-animated"
                    style={{ '--target-width': '98%', background: 'linear-gradient(to right, #FACC15, #EAB308)' } as React.CSSProperties}
                  />
                </div>
              </div>
              <Link href="/dashboard/scraper"
                className="block w-full py-2.5 text-center rounded-lg text-xs font-semibold
                           transition-colors border hover:shadow-sm"
                style={{ color: 'var(--text-main)', backgroundColor: 'var(--card-bg2)', borderColor: 'var(--border)' }}>
                Open Scraper →
              </Link>
            </div>
          </div>

          {/* Resume Score */}
          <div className="dark-card relative rounded-xl overflow-hidden p-6 shadow-md"
               style={{ backgroundColor: 'var(--card-bg)', border: '1px solid var(--border)' }}>
            <Sparkles size={40} className="absolute top-4 right-4 opacity-10" style={{ color: 'var(--text-main)' }} />
            <p className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: 'var(--text-muted)' }}>Resume Score</p>
            <p className="text-5xl font-bold leading-none" style={{ color: 'var(--text-main)' }}>
              85<span className="text-xl font-semibold" style={{ color: 'var(--text-muted)' }}>/100</span>
            </p>
            <p className="text-xs mt-2 mb-5 leading-relaxed" style={{ color: 'var(--text-muted)' }}>
              Add NLP &amp; cloud skills to push past 90.
            </p>
            <Link href="/dashboard/resume"
              className="inline-block px-4 py-2 rounded-lg text-xs font-semibold transition-all hover:shadow-sm"
              style={{ backgroundColor: '#FACC15', color: '#1F2937' }}>
              Improve Score →
            </Link>
          </div>

          {/* Quick Actions */}
          <div className="dark-card rounded-xl border shadow-sm p-5"
               style={{ backgroundColor: 'var(--card-bg)', borderColor: 'var(--border)' }}>
            <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--text-main)' }}>Quick Actions</h3>
            <div className="space-y-1.5">
              {[
                { href: '/dashboard/scraper', icon: Zap,      label: 'Run New Scan',    bg: 'bg-yellow-100',  text: 'text-yellow-700' },
                { href: '/dashboard/resume',  icon: FileText, label: 'Check Resume',    bg: 'bg-amber-100',   text: 'text-amber-700'  },
                { href: '/dashboard/jobs',    icon: Search,   label: 'Browse All Jobs', bg: 'bg-sky-100',     text: 'text-sky-600'    },
              ].map((item) => {
                const Icon = item.icon;
                return (
                  <Link key={item.href} href={item.href}
                    className="flex items-center gap-3 p-3 rounded-xl transition-colors group"
                    style={{ color: 'var(--text-main)' }}
                    onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#FFF3C4')}
                    onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}>
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${item.bg} ${item.text}`}>
                      <Icon size={14} />
                    </div>
                    <span className="text-sm font-medium" style={{ color: 'var(--text-main)' }}>
                      {item.label}
                    </span>
                    <ArrowUpRight size={13} className="ml-auto" style={{ color: 'var(--text-muted)' }} />
                  </Link>
                );
              })}
            </div>
          </div>

        </div>
      </div>

      <Chatbot />
    </div>
  );
}
