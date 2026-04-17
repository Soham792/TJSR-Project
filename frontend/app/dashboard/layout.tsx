'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { Topbar } from '@/components/dashboard/topbar';
import { useAuth } from '@/lib/auth-context';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    // Debug logging to help identify why the redirect is happening
    console.log('Dashboard Auth State:', { user: !!user, loading });

    if (!loading && !user) {
      console.warn('Dashboard: No user found after loading, redirecting to /auth');
      router.replace('/auth');
    }
  }, [user, loading, router]);

  if (loading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center page-bg">
        <Loader2 size={32} className="animate-spin text-yellow-400" />
      </div>
    );
  }

  return (
    <div className="page-bg">
      <Topbar />
      <main className="pt-16 pb-16">
        <div className="max-w-7xl mx-auto px-4 md:px-6 lg:px-8">
          {children}
        </div>
      </main>
    </div>
  );
}
