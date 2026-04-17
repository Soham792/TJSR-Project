'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import Image from 'next/image';
import { useAuth } from '@/lib/auth-context';

const Lottie = dynamic(() => import('lottie-react'), { ssr: false });

export default function OnboardingPage() {
  const router   = useRouter();
  const { user } = useAuth();
  const [fadeOut,  setFadeOut]  = useState(false);
  const [animData, setAnimData] = useState<object | null>(null);

  useEffect(() => {
    fetch('/Welcome.json').then(r => r.json()).then(setAnimData).catch(console.error);
  }, []);

  useEffect(() => {
    const fade     = setTimeout(() => setFadeOut(true), 5400);
    const redirect = setTimeout(() => router.push('/dashboard'), 6000);
    return () => { clearTimeout(fade); clearTimeout(redirect); };
  }, [router]);

  const initials = (user?.displayName || user?.email || 'U')
    .split(' ').map((w: string) => w[0]).join('').toUpperCase().slice(0, 2);

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center gap-6"
      style={{
        backgroundColor: '#FFF8E7',
        opacity: fadeOut ? 0 : 1,
        transition: 'opacity 0.6s ease-out',
      }}
    >
      {/* Profile photo */}
      {user && (
        <div className="flex flex-col items-center gap-3 animate-slide-up">
          {user.photoURL ? (
            <Image
              src={user.photoURL}
              alt="Profile"
              width={80}
              height={80}
              className="rounded-full ring-4 ring-yellow-300 shadow-lg"
              referrerPolicy="no-referrer"
            />
          ) : (
            <div
              className="w-20 h-20 rounded-full flex items-center justify-center text-2xl font-bold ring-4 ring-yellow-300 shadow-lg"
              style={{ backgroundColor: '#FFF3C4', color: '#B45309' }}
            >
              {initials}
            </div>
          )}
          <p
            className="namaste-anim text-2xl font-bold tracking-widest"
            style={{ color: '#B45309', fontFamily: 'serif' }}
          >
            नमस्ते
          </p>
        </div>
      )}

      {/* Lottie */}
      <div className="w-72 h-72 md:w-80 md:h-80">
        {animData && (
          <Lottie animationData={animData} loop={false} autoplay />
        )}
      </div>
    </div>
  );
}
