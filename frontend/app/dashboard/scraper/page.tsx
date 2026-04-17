'use client';

import { useEffect, useState, useCallback } from 'react';
import { Zap, Play, Square, Database, Globe, Clock, AlertCircle, CheckCircle2, Loader2, RefreshCw } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { apiFetch, BACKEND } from '@/lib/api';

// ── Types ──────────────────────────────────────────────────────────────────────

interface ScraperStatus {
  is_running: boolean;
  progress: number;
  jobs_found: number;
  sources_completed: number;
  sources_total: number;
  current_source: string | null;
  last_run_at: string | null;
}

interface CompanySource {
  name: string;
  url: string;
}

interface DashboardStats {
  total_jobs: number;
  jobs_today: number;
}

const CARD: React.CSSProperties = {
  backgroundColor: 'var(--card-bg)',
  border: '1px solid var(--border)',
  borderRadius: '0.75rem',
};

function domainOf(url: string): string {
  try { return new URL(url).hostname.replace('www.', ''); }
  catch { return url; }
}

function timeAgo(iso: string | null): string {
  if (!iso) return 'Never';
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60)  return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ScraperPage() {
  const { user } = useAuth();

  const [status,    setStatus]    = useState<ScraperStatus | null>(null);
  const [sources,   setSources]   = useState<CompanySource[]>([]);
  const [stats,     setStats]     = useState<DashboardStats | null>(null);
  const [starting,  setStarting]  = useState(false);
  const [stopping,  setStopping]  = useState(false);
  const [error,     setError]     = useState('');

  // ── Fetch helpers ──────────────────────────────────────────────────────────

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch(`${BACKEND}/api/v1/scraper/company-status`);
      if (res.ok) setStatus(await res.json());
    } catch { /* non-fatal */ }
  }, []);

  const fetchStats = useCallback(async () => {
    if (!user) return;
    try {
      const res = await apiFetch('/api/v1/stats/dashboard', user);
      if (res.ok) setStats(await res.json());
    } catch { /* non-fatal */ }
  }, [user]);

  const fetchSources = useCallback(async () => {
    try {
      const res = await fetch(`${BACKEND}/api/v1/scraper/companies`);
      if (res.ok) setSources(await res.json());
    } catch { /* non-fatal */ }
  }, []);

  // ── Initial load + polling ─────────────────────────────────────────────────

  useEffect(() => {
    fetchStatus();
    fetchSources();
  }, [fetchStatus, fetchSources]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  // Poll status every 5 s; poll stats every 15 s
  useEffect(() => {
    const statusTimer = setInterval(fetchStatus, 5_000);
    const statsTimer  = setInterval(fetchStats,  15_000);
    return () => { clearInterval(statusTimer); clearInterval(statsTimer); };
  }, [fetchStatus, fetchStats]);

  // ── Actions ────────────────────────────────────────────────────────────────

  const handleStart = async () => {
    if (!user) return;
    setError('');
    setStarting(true);
    try {
      const res = await apiFetch('/api/v1/scraper/run/companies', user, { method: 'POST' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.detail || `Start failed (${res.status})`);
      } else {
        // Kick off an immediate status refresh
        setTimeout(fetchStatus, 800);
      }
    } catch (e: any) {
      setError(e.message || 'Failed to start scraper');
    } finally {
      setStarting(false);
    }
  };

  const handleStop = async () => {
    if (!user) return;
    setError('');
    setStopping(true);
    try {
      const res = await apiFetch('/api/v1/scraper/stop/companies', user, { method: 'POST' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.detail || `Stop failed (${res.status})`);
      } else {
        setTimeout(fetchStatus, 1_500);
      }
    } catch (e: any) {
      setError(e.message || 'Failed to stop scraper');
    } finally {
      setStopping(false);
    }
  };

  // ── Derived values ─────────────────────────────────────────────────────────

  const isRunning = status?.is_running ?? false;
  const totalJobs = stats?.total_jobs ?? 0;

  function sourceStatus(name: string, idx: number): 'active' | 'done' | 'idle' {
    if (!status) return 'idle';
    if (status.current_source === name) return 'active';
    if (idx < status.sources_completed) return 'done';
    return 'idle';
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-8 py-6">

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 animate-slide-up">
        <div>
          <h1 className="text-3xl font-bold mb-2 flex items-center gap-3" style={{ color: 'var(--text-main)' }}>
            <Zap className="text-yellow-500" size={32} />
            Scraper Control
          </h1>
          <p style={{ color: 'var(--text-muted)' }}>
            Monitor and control real-time job scanning across {sources.length} sources.
          </p>
        </div>
        <div className="flex gap-2 items-center">
          {!user && (
            <span className="text-xs px-3 py-1 rounded-lg" style={{ backgroundColor: 'var(--card-bg2)', color: 'var(--text-muted)' }}>
              Sign in to control scraper
            </span>
          )}
          <button
            onClick={handleStart}
            disabled={!user || isRunning || starting}
            className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-emerald-500 text-white font-bold
                       shadow-sm hover:shadow-md transition-all active:scale-95 disabled:opacity-40"
          >
            {starting ? <Loader2 size={18} className="animate-spin" /> : <Play size={18} fill="currentColor" />}
            {starting ? 'Starting…' : 'Start All'}
          </button>
          <button
            onClick={handleStop}
            disabled={!user || !isRunning || stopping}
            className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-red-400 text-white font-bold
                       shadow-sm hover:shadow-md transition-all active:scale-95 disabled:opacity-40"
          >
            {stopping ? <Loader2 size={18} className="animate-spin" /> : <Square size={18} fill="currentColor" />}
            {stopping ? 'Stopping…' : 'Stop All'}
          </button>
          <button
            onClick={() => { fetchStatus(); fetchStats(); }}
            className="p-2.5 rounded-xl transition-all"
            style={{ backgroundColor: 'var(--card-bg2)', color: 'var(--text-muted)' }}
            title="Refresh"
          >
            <RefreshCw size={16} />
          </button>
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-red-50 text-red-600 text-sm animate-slide-up">
          <AlertCircle size={16} className="flex-shrink-0" />
          {error}
          <button onClick={() => setError('')} className="ml-auto text-xs underline">Dismiss</button>
        </div>
      )}

      {/* Stat cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 animate-slide-up" style={{ animationDelay: '0.1s' }}>

        {/* Total Jobs */}
        <div className="dark-card p-6 shadow-sm flex items-center gap-4" style={CARD}>
          <div className="w-12 h-12 rounded-xl bg-yellow-100 flex items-center justify-center text-yellow-700 flex-shrink-0">
            <Database size={24} />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>
              Total Jobs
            </p>
            <p className="text-2xl font-bold" style={{ color: 'var(--text-main)' }}>
              {totalJobs.toLocaleString()}
            </p>
          </div>
        </div>

        {/* Active Sources */}
        <div className="dark-card p-6 shadow-sm flex items-center gap-4" style={CARD}>
          <div className="w-12 h-12 rounded-xl bg-amber-100 flex items-center justify-center text-amber-700 flex-shrink-0">
            <Globe size={24} />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>
              Sources
            </p>
            <p className="text-2xl font-bold" style={{ color: 'var(--text-main)' }}>
              {sources.length}
            </p>
          </div>
        </div>

        {/* Status */}
        <div className="dark-card p-6 shadow-sm flex items-center gap-4" style={CARD}>
          <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${
            isRunning ? 'bg-emerald-100 text-emerald-600' : 'bg-yellow-100 text-yellow-600'
          }`}>
            <Zap size={24} fill={isRunning ? 'currentColor' : 'none'} />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>
              Status
            </p>
            <p className={`text-2xl font-bold ${isRunning ? 'text-emerald-600' : ''}`}
               style={!isRunning ? { color: 'var(--text-main)' } : {}}>
              {isRunning ? 'Running' : 'Idle'}
            </p>
            {status?.last_run_at && (
              <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                Last run: {timeAgo(status.last_run_at)}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Progress (only visible while running) */}
      {isRunning && status && (
        <div className="dark-card p-5 animate-slide-up space-y-3" style={CARD}>
          <div className="flex items-center justify-between text-sm">
            <span className="font-semibold flex items-center gap-2" style={{ color: 'var(--text-main)' }}>
              <Loader2 size={14} className="animate-spin text-yellow-500" />
              {status.current_source ? `Scraping ${status.current_source}…` : 'Processing…'}
            </span>
            <span style={{ color: 'var(--text-muted)' }}>
              {status.sources_completed} / {status.sources_total} sources &nbsp;·&nbsp; {status.jobs_found} new jobs
            </span>
          </div>
          <div className="h-2 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--card-bg2)' }}>
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${status.progress}%`,
                background: 'linear-gradient(to right, #FACC15, #EAB308)',
              }}
            />
          </div>
          <p className="text-xs text-right" style={{ color: 'var(--text-muted)' }}>{status.progress}%</p>
        </div>
      )}

      {/* Sources table */}
      <div className="dark-card rounded-xl overflow-hidden shadow-sm animate-slide-up" style={{ ...CARD, animationDelay: '0.2s' }}>
        <div className="p-5 flex items-center justify-between"
             style={{ borderBottom: '1px solid var(--border)', backgroundColor: 'var(--card-bg2)' }}>
          <h3 className="font-bold" style={{ color: 'var(--text-main)' }}>Scraper Sources</h3>
          <span className="text-xs font-semibold px-3 py-1 rounded-full"
                style={{ backgroundColor: isRunning ? '#d1fae5' : 'var(--card-bg)', color: isRunning ? '#065f46' : 'var(--text-muted)' }}>
            {isRunning ? '● Live' : '○ Idle'}
          </span>
        </div>

        {sources.length === 0 ? (
          <div className="p-8 text-center" style={{ color: 'var(--text-muted)' }}>
            <Globe size={32} className="mx-auto mb-3 opacity-30" />
            <p className="text-sm">Loading sources…</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="text-xs font-bold uppercase tracking-widest"
                    style={{ borderBottom: '1px solid var(--border)', color: 'var(--text-muted)', backgroundColor: 'var(--card-bg2)' }}>
                  <th className="px-6 py-3">Source</th>
                  <th className="px-6 py-3">Domain</th>
                  <th className="px-6 py-3">Status</th>
                  <th className="px-6 py-3 text-right">Progress</th>
                </tr>
              </thead>
              <tbody className="text-sm">
                {sources.map((src, idx) => {
                  const st = sourceStatus(src.name, idx);
                  return (
                    <tr key={src.name}
                        style={{ borderBottom: '1px solid var(--border)' }}
                        className="transition-colors">
                      <td className="px-6 py-3.5 font-semibold" style={{ color: 'var(--text-main)' }}>
                        {src.name}
                      </td>
                      <td className="px-6 py-3.5" style={{ color: 'var(--text-muted)' }}>
                        {domainOf(src.url)}
                      </td>
                      <td className="px-6 py-3.5">
                        {st === 'active' ? (
                          <span className="flex items-center gap-1.5 text-yellow-600 font-semibold text-xs">
                            <Loader2 size={12} className="animate-spin" /> Scraping
                          </span>
                        ) : st === 'done' ? (
                          <span className="flex items-center gap-1.5 text-emerald-600 font-semibold text-xs">
                            <CheckCircle2 size={12} /> Done
                          </span>
                        ) : (
                          <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
                            {isRunning ? 'Pending' : 'Idle'}
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-3.5 text-right">
                        {st === 'done' && status ? (
                          <span className="text-xs font-medium text-emerald-600">✓</span>
                        ) : st === 'active' ? (
                          <span className="text-xs text-yellow-600">…</span>
                        ) : (
                          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
