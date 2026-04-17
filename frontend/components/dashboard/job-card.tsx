'use client';

import Image from 'next/image';
import { MapPin, Bookmark, ExternalLink, CheckCircle2, Clock } from 'lucide-react';
import { useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { apiFetch } from '@/lib/api';
import { useMutation, useQueryClient } from '@tanstack/react-query';

interface JobCardProps {
  job: {
    id: string;
    title: string;
    company: string;
    location: string;
    salary_range?: string;
    posted_at: string;
    description?: string;
    is_saved?: boolean;
    apply_link?: string;
    job_type?: string;
  };
}

const KNOWN_LOGOS = [
  'Accenture', 'Adobe', 'Airbnb', 'Amazon', 'Apple', 'Coinbase',
  'Discord', 'Dropbox', 'Figma', 'Google', 'Ibm', 'Intel',
  'Intercom', 'Meta', 'Microsoft', 'Netflix', 'Oracle', 'Robinhood', 'Stripe',
];

function getLogoPath(company: string): string | null {
  const lower = company.toLowerCase();
  const match = KNOWN_LOGOS.find(k => lower.includes(k.toLowerCase()));
  // Logos are located in the root public folder
  return match ? `/${match}.png` : null;
}

export function JobCard({ job }: JobCardProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [isSaved, setIsSaved] = useState(job.is_saved || false);
  const [logoError, setLogoError] = useState(false);
  const logoPath = getLogoPath(job.company);

  const saveMutation = useMutation({
    mutationFn: async (save: boolean) => {
      const method = save ? 'POST' : 'DELETE';
      const resp = await apiFetch(`/api/v1/jobs/${job.id}/save`, user, { method });
      if (!resp.ok) throw new Error('Failed to save job');
      return resp.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dashboard_stats'] });
      queryClient.invalidateQueries({ queryKey: ['jobs', 'saved'] });
    },
    onError: () => {
      // Revert UI state on error
      setIsSaved(!isSaved);
    }
  });

  const toggleSave = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const nextState = !isSaved;
    setIsSaved(nextState);
    saveMutation.mutate(nextState);
  };

  const getTimeAgo = (dateStr: string) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    const now = new Date();
    const diffInMs = now.getTime() - date.getTime();
    const diffInDays = Math.floor(diffInMs / (1000 * 60 * 60 * 24));
    
    if (diffInDays === 0) return 'Posted today';
    if (diffInDays === 1) return 'Posted 1 day ago';
    return `Posted ${diffInDays} days ago`;
  };

  return (
    <div
      className="group relative flex flex-col bg-white rounded-[24px] p-6 border transition-all duration-300
                 hover:shadow-[0_20px_50px_rgba(0,0,0,0.08)] hover:-translate-y-1 border-gray-100"
    >
      {/* Top Section: Logo & Action Buttons */}
      <div className="flex justify-between items-start mb-4">
        <div className="relative">
          <div className="w-16 h-16 rounded-full flex items-center justify-center overflow-hidden bg-slate-50 border border-gray-100 p-0">
            {logoPath && !logoError ? (
              <Image
                src={logoPath}
                alt={job.company}
                width={80}
                height={80}
                className="w-full h-full object-cover"
                onError={() => setLogoError(true)}
              />
            ) : (
              <span className="text-xl font-bold text-slate-400">
                {job.company?.[0]?.toUpperCase() ?? '?'}
              </span>
            )}
          </div>
          {/* Verified Badge */}
          <div className="absolute -top-1 -right-1 bg-white rounded-full p-0.5 shadow-sm">
            <CheckCircle2 size={18} className="text-blue-500 fill-blue-500 text-white" />
          </div>
        </div>

        <div className="flex gap-2">
          <button
            onClick={toggleSave}
            title={isSaved ? "Unsave job" : "Save job"}
            className="p-2 rounded-full transition-colors hover:bg-slate-50"
            style={{ color: isSaved ? '#EAB308' : '#94A3B8' }}
          >
            <Bookmark size={20} fill={isSaved ? 'currentColor' : 'none'} className={isSaved ? 'scale-110' : ''} />
          </button>
          <a
            href={job.apply_link || '#'}
            target="_blank"
            rel="noopener noreferrer"
            className="p-2 rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-50 transition-colors"
          >
            <ExternalLink size={18} />
          </a>
        </div>
      </div>

      {/* Job Title & Company */}
      <div className="mb-4">
        <h3 className="text-lg font-bold text-slate-900 leading-tight mb-1 group-hover:text-yellow-600 transition-colors">
          {job.title}
        </h3>
        <p className="text-sm font-medium text-slate-500">{job.company}</p>
      </div>

      {/* Meta Location */}
      <div className="flex items-center gap-1.5 text-slate-400 mb-4">
        <MapPin size={14} />
        <span className="text-xs font-medium">{job.location || 'Remote'}</span>
      </div>

      {/* Tags */}
      <div className="flex flex-wrap gap-2 mb-6">
        <span className="px-3 py-1.5 rounded-full text-[11px] font-semibold bg-slate-50 text-slate-600 border border-slate-100">
          {job.job_type || 'Full-time'}
        </span>
        <span className="px-3 py-1.5 rounded-full text-[11px] font-semibold bg-slate-50 text-slate-600 border border-slate-100">
          Remote
        </span>
        <span className="px-3 py-1.5 rounded-full text-[11px] font-semibold bg-slate-50 text-slate-600 border border-slate-100">
          Senior Level
        </span>
        {job.salary_range && (
          <span className="px-3 py-1.5 rounded-full text-[11px] font-semibold bg-yellow-50 text-yellow-700 border border-yellow-100">
            {job.salary_range}
          </span>
        )}
      </div>

      {/* Description */}
      {job.description && (
        <p className="text-sm text-slate-600 leading-relaxed line-clamp-2 mb-auto pb-6">
          {job.description}
        </p>
      )}

      {/* Footer: Date & Apply Button */}
      <div className="flex items-center justify-between mt-auto pt-4 border-t border-slate-50">
        <div className="flex items-center gap-1.5 text-[11px] font-medium text-slate-400">
          <Clock size={12} />
          <span>{getTimeAgo(job.posted_at)}</span>
        </div>
        <a
          href={job.apply_link || '#'}
          target="_blank"
          rel="noopener noreferrer"
          className="px-6 py-2.5 rounded-xl text-sm font-bold bg-[#FACC15] text-[#1F2937]
                     hover:bg-[#EAB308] hover:shadow-lg active:scale-95 transition-all duration-200"
        >
          Apply Now
        </a>
      </div>
    </div>
  );
}
