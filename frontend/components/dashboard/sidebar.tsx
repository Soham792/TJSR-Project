'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Home, Briefcase, Zap, Settings, FileText, Bug, LogOut, Menu, X } from 'lucide-react';
import { useState } from 'react';
import { signOut } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import Image from 'next/image';

const navItems = [
  { icon: Home,      label: 'Dashboard',       href: '/dashboard' },
  { icon: Briefcase, label: 'Job Listings',     href: '/dashboard/jobs' },
  { icon: Zap,       label: 'Scraper Control',  href: '/dashboard/scraper' },
  { icon: FileText,  label: 'Resume Analyzer',  href: '/dashboard/resume' },
  { icon: Bug,       label: 'Debug Logs',       href: '/dashboard/debug' },
  { icon: Settings,  label: 'Settings',         href: '/dashboard/settings' },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);

  const isActive = (href: string) => pathname === href;

  const handleLogout = async () => {
    await signOut(auth);
    router.push('/auth');
  };

  return (
    <>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="md:hidden fixed top-4 left-4 z-40 p-2 bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-xl text-stone-600 dark:text-stone-300 shadow-sm"
      >
        {isOpen ? <X size={20} /> : <Menu size={20} />}
      </button>

      <div className={`fixed left-0 top-0 h-screen w-64 bg-white dark:bg-stone-950
                       border-r border-stone-200/80 dark:border-stone-800/80
                       pt-20 px-4 overflow-y-auto transform transition-transform duration-300 md:translate-x-0 z-30
                       ${isOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <Link href="/dashboard" className="flex items-center mb-8 px-2">
          <Image src="/TJSR.png" alt="TJSR" width={400} height={120} className="w-48 h-auto object-contain" priority />
        </Link>

        <nav className="space-y-1 mb-8">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.href);
            return (
              <Link key={item.href} href={item.href} onClick={() => setIsOpen(false)}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150 ${
                  active
                    ? 'bg-amber-50 dark:bg-amber-900/20 text-amber-800 dark:text-amber-400 border border-amber-200/50 dark:border-amber-700/30'
                    : 'text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100 hover:bg-stone-100 dark:hover:bg-stone-900'
                }`}>
                <Icon size={17} />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-stone-100 dark:border-stone-800 pt-4">
          <button onClick={handleLogout}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium
                       text-stone-500 dark:text-stone-400 hover:text-red-600 dark:hover:text-red-400
                       hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">
            <LogOut size={17} />
            Logout
          </button>
        </div>
      </div>

      {isOpen && (
        <div className="fixed inset-0 bg-black/30 md:hidden z-20" onClick={() => setIsOpen(false)} />
      )}
    </>
  );
}
