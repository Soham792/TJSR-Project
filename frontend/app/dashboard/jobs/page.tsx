'use client';

import { useState } from 'react';
import { Search, Briefcase } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { JobCard } from '@/components/dashboard/job-card';

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';

import { useSearchParams } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';

export default function JobsPage() {
  const { user } = useAuth();
  const searchParams = useSearchParams();
  const sortBy = searchParams.get('sort_by');
  const [searchTerm, setSearchTerm] = useState('');
  const [submitted,  setSubmitted]  = useState('');
  const [currentPage, setCurrentPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ['jobs', submitted, sortBy, currentPage, user?.uid],
    queryFn: async () => {
      const qParams = new URLSearchParams({ 
        page_size: '21', // Use 21 so we get 3 clean rows of 3 on desktop
        page: currentPage.toString() 
      });
      if (submitted) qParams.set('search', submitted);
      if (sortBy) qParams.set('sort_by', sortBy);
      
      const resp = await apiFetch(`/api/v1/jobs?${qParams}`, user);
      if (!resp.ok) return { jobs: [], total_pages: 0, total: 0 };
      return await resp.json();
    },
  });

  const { jobs = [], total_pages = 0, total = 0 } = data || {};

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(searchTerm);
    setCurrentPage(1); // Reset to first page on new search
  };

  return (
    <div className="space-y-8 py-7 pb-20">

      {/* Header + Search */}
      <div className="max-w-xl mx-auto text-center space-y-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight" style={{ color: 'var(--text-main)' }}>
            Discover Opportunities
          </h1>
          <p className="text-sm mt-1.5" style={{ color: 'var(--text-muted)' }}>
            Real-time jobs from Google, Apple, Stripe, Airbnb and more.
          </p>
        </div>

        <form onSubmit={handleSearch} className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--text-muted)' }} />
            <input
              type="text"
              placeholder="Search by title, company, or keywords…"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full h-11 pl-10 pr-4 rounded-xl text-sm
                         focus:outline-none focus:ring-2 focus:ring-yellow-300/50
                         shadow-sm transition-all"
              style={{
                backgroundColor: 'var(--card-bg)',
                border: '1px solid var(--border)',
                color: 'var(--text-main)',
              }}
            />
          </div>
          <button
            type="submit"
            className="h-11 px-6 rounded-lg flex-shrink-0 text-sm font-semibold
                       hover:shadow-md active:scale-95 transition-all duration-150"
            style={{ backgroundColor: '#FACC15', color: '#1F2937' }}>
            Search
          </button>
        </form>
      </div>

      {/* Count */}
      {!isLoading && jobs.length > 0 && (
        <div className="flex justify-between items-center">
          <p className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
            Found {total} job{total !== 1 ? 's' : ''} 
            {submitted ? ` for "${submitted}"` : ''}
          </p>
          <p className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
            Page {currentPage} of {total_pages}
          </p>
        </div>
      )}

      {/* Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-60 rounded-xl border animate-pulse"
                 style={{ backgroundColor: 'var(--card-bg)', borderColor: 'var(--border)' }} />
          ))}
        </div>
      ) : jobs.length > 0 ? (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {jobs.map((job: any) => (
              <JobCard key={job.id} job={job} />
            ))}
          </div>

          {/* Pagination Controls */}
          {total_pages > 1 && (
            <div className="flex justify-center items-center gap-2 mt-12 py-6">
              <button
                disabled={currentPage === 1}
                onClick={() => { setCurrentPage(p => p - 1); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                className="px-4 py-2 rounded-lg text-sm font-medium border transition-all disabled:opacity-30"
                style={{ backgroundColor: 'var(--card-bg)', borderColor: 'var(--border)', color: 'var(--text-main)' }}>
                Previous
              </button>
              
              <div className="flex gap-1">
                {[...Array(Math.min(total_pages, 5))].map((_, i) => {
                  // Basic window logic for pagination
                  let pageNum = i + 1;
                  if (currentPage > 3 && total_pages > 5) {
                    pageNum = currentPage - 2 + i;
                    if (pageNum + 2 > total_pages) pageNum = total_pages - 4 + i;
                  }
                  
                  return (
                    <button
                      key={pageNum}
                      onClick={() => { setCurrentPage(pageNum); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                      className={`w-10 h-10 rounded-lg text-sm font-bold transition-all ${
                        currentPage === pageNum ? 'bg-yellow-400 text-slate-900 shadow-md' : 'hover:bg-slate-100'
                      }`}
                      style={{ 
                        backgroundColor: currentPage === pageNum ? '#FACC15' : 'transparent',
                        color: currentPage === pageNum ? '#1F2937' : 'var(--text-muted)',
                        border: currentPage === pageNum ? 'none' : '1px solid var(--border)'
                      }}
                    >
                      {pageNum}
                    </button>
                  );
                })}
              </div>

              <button
                disabled={currentPage === total_pages}
                onClick={() => { setCurrentPage(p => p + 1); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                className="px-4 py-2 rounded-lg text-sm font-medium border transition-all disabled:opacity-30"
                style={{ backgroundColor: 'var(--card-bg)', borderColor: 'var(--border)', color: 'var(--text-main)' }}>
                Next
              </button>
            </div>
          )}
        </>
      ) : (
        <div className="dark-card py-20 text-center rounded-xl border"
             style={{ backgroundColor: 'var(--card-bg)', borderColor: 'var(--border)' }}>
          <div className="w-16 h-16 rounded-xl flex items-center justify-center mx-auto mb-4"
               style={{ backgroundColor: 'var(--card-bg2)' }}>
            <Briefcase size={26} style={{ color: 'var(--text-muted)' }} />
          </div>
          <p className="font-semibold" style={{ color: 'var(--text-main)' }}>No jobs found</p>
          <p className="text-sm mt-1.5" style={{ color: 'var(--text-muted)' }}>
            {submitted ? 'Try different search terms.' : 'Run a scraper scan to populate jobs.'}
          </p>
        </div>
      )}
    </div>
  );
}
