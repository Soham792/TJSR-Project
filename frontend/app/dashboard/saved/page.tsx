'use client';

import { Bookmark, ArrowRight } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { JobCard } from '@/components/dashboard/job-card';
import { apiFetch } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import Link from 'next/link';

export default function SavedJobsPage() {
  const { user } = useAuth();
  const { data: savedJobs = [], isLoading } = useQuery({
    queryKey: ['jobs', 'saved', user?.uid],
    enabled: !!user,
    queryFn: async () => {
      const resp = await apiFetch('/api/v1/jobs/saved/all', user);
      if (!resp.ok) return [];
      const data = await resp.json();
      return data.jobs ?? [];
    }
  });

  const cardStyle = { backgroundColor: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: '0.75rem' };

  return (
    <div className="space-y-8 py-6">
      <div className="animate-slide-up">
        <h1 className="text-3xl font-bold mb-2 flex items-center gap-3" style={{ color: 'var(--text-main)' }}>
          <div className="w-10 h-10 rounded-xl bg-yellow-400 flex items-center justify-center shadow-sm" style={{ color: 'var(--text-main)' }}>
            <Bookmark size={20} fill="currentColor" />
          </div>
          Saved Opportunities
        </h1>
        <p style={{ color: 'var(--text-muted)' }}>
          Your curated list of jobs to apply for. Keep track of your favorites here.
        </p>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-64 rounded-xl animate-pulse" style={cardStyle} />
          ))}
        </div>
      ) : savedJobs.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {savedJobs.map((job: any) => (
            <JobCard key={job.id} job={job} />
          ))}
        </div>
      ) : (
        <div className="dark-card py-24 text-center max-w-2xl mx-auto animate-slide-up rounded-xl shadow-sm" style={cardStyle}>
          <div className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6"
               style={{ backgroundColor: 'var(--card-bg2)', color: 'var(--text-muted)' }}>
            <Bookmark size={32} />
          </div>
          <h2 className="text-2xl font-bold" style={{ color: 'var(--text-main)' }}>Your collection is empty</h2>
          <p className="mt-2 mb-8" style={{ color: 'var(--text-muted)' }}>
            Start exploring jobs and bookmark the ones that catch your eye.
          </p>
          <Link
            href="/dashboard/jobs"
            className="inline-flex items-center gap-2 px-8 py-3 rounded-xl font-bold shadow-sm hover:shadow-md transition-all active:scale-95"
            style={{ backgroundColor: '#FACC15', color: '#1F2937' }}
          >
            Explore Jobs
            <ArrowRight size={18} />
          </Link>
        </div>
      )}
    </div>
  );
}
