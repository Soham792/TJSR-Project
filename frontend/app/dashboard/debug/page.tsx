'use client';

import { Bug, Terminal, Activity, AlertTriangle, Search, Trash2 } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';

export default function DebugPage() {
  const { data: logs = [] } = useQuery({
    queryKey: ['debug_logs'],
    queryFn: async () => {
      const resp = await fetch(`${BACKEND_URL}/api/v1/logs?limit=50`);
      if (!resp.ok) return [];
      return resp.json();
    },
    refetchInterval: 5000,
  });

  return (
    <div className="space-y-8 py-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 animate-slide-up">
        <div>
          <h1 className="text-3xl font-bold text-stone-900 dark:text-stone-100 mb-2 flex items-center gap-3">
            <Bug className="text-amber-500" size={32} />
            Debug Logs
          </h1>
          <p className="text-stone-500 dark:text-stone-400">
            Real-time system telemetry and error tracking for developer troubleshooting.
          </p>
        </div>
        <div className="flex gap-2">
          <button className="flex items-center gap-2 px-6 py-2.5 rounded-2xl bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-300 font-bold hover:bg-stone-200 dark:hover:bg-stone-700 transition-all">
            <Trash2 size={18} />
            Clear Logs
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 animate-slide-up" style={{ animationDelay: '0.1s' }}>
        <div className="glass-card p-6 border-l-4 border-emerald-500">
          <p className="text-xs font-semibold text-stone-400 uppercase tracking-widest mb-1">API Health</p>
          <div className="flex items-center gap-2">
            <Activity size={18} className="text-emerald-500" />
            <p className="text-xl font-bold text-stone-800 dark:text-stone-100">Healthy</p>
          </div>
        </div>
        <div className="glass-card p-6 border-l-4 border-amber-500">
          <p className="text-xs font-semibold text-stone-400 uppercase tracking-widest mb-1">Response Time</p>
          <div className="flex items-center gap-2">
            <Activity size={18} className="text-amber-500" />
            <p className="text-xl font-bold text-stone-800 dark:text-stone-100">124ms</p>
          </div>
        </div>
        <div className="glass-card p-6 border-l-4 border-red-500">
          <p className="text-xs font-semibold text-stone-400 uppercase tracking-widest mb-1">Errors (24h)</p>
          <div className="flex items-center gap-2">
            <AlertTriangle size={18} className="text-red-500" />
            <p className="text-xl font-bold text-stone-800 dark:text-stone-100">0</p>
          </div>
        </div>
        <div className="glass-card p-6 border-l-4 border-blue-500">
          <p className="text-xs font-semibold text-stone-400 uppercase tracking-widest mb-1">Memory Usage</p>
          <div className="flex items-center gap-2">
            <Activity size={18} className="text-blue-500" />
            <p className="text-xl font-bold text-stone-800 dark:text-stone-100">256MB</p>
          </div>
        </div>
      </div>

      <div className="glass-card bg-stone-950 border-stone-800 overflow-hidden animate-slide-up" style={{ animationDelay: '0.2s' }}>
        <div className="p-4 bg-stone-900 border-b border-stone-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Terminal size={18} className="text-emerald-500" />
            <h3 className="text-xs font-bold text-stone-400 uppercase tracking-widest">System Console</h3>
          </div>
          <div className="flex items-center gap-4">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -track-y-1/2 text-stone-600" size={14} />
              <input type="text" placeholder="Filter logs..." className="bg-stone-800 border-none rounded-lg py-1.5 pl-9 pr-4 text-xs text-stone-300 outline-none w-48" />
            </div>
            <div className="flex gap-1">
              <span className="w-2 h-2 rounded-full bg-red-500" />
              <span className="w-2 h-2 rounded-full bg-amber-500" />
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
            </div>
          </div>
        </div>
        <div className="p-4 h-[500px] overflow-y-auto font-mono text-[11px] leading-relaxed space-y-1.5">
          {logs.length > 0 ? (
            logs.map((log: any, i) => (
              <div key={i} className="flex gap-4 group">
                <span className="text-stone-600 select-none w-32 shrink-0">{new Date(log.timestamp).toISOString()}</span>
                <span className={`px-1.5 rounded uppercase font-bold shrink-0 h-fit ${
                  log.level === 'ERROR' ? 'bg-red-900/40 text-red-500' :
                  log.level === 'WARN' ? 'bg-amber-900/40 text-amber-500' :
                  'bg-stone-800 text-stone-400'
                }`}>
                  {log.level}
                </span>
                <span className="text-stone-300 group-hover:text-stone-100 transition-colors">{log.message}</span>
              </div>
            ))
          ) : (
            <div className="text-stone-600 py-4 italic">No logs currently flowing...</div>
          )}
          <div className="text-emerald-500/50 animate-pulse">_</div>
        </div>
      </div>
    </div>
  );
}
