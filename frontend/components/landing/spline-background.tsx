'use client';

import dynamic from 'next/dynamic';

const Spline = dynamic(() => import('@splinetool/react-spline'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full bg-[#0c0a09] animate-pulse" />
  ),
});

interface SplineBackgroundProps {
  scene?: string;
}

export function SplineBackground({ 
  scene = "https://prod.spline.design/tK54zJNzKkmizMQo/scene.splinecode" 
}: SplineBackgroundProps) {
  return (
    <div className="fixed top-0 left-0 h-screen w-full z-0 pointer-events-none">
      {/* Dark base so Spline renders on black */}
      <div className="absolute inset-0 bg-stone-950" />
      <div className="relative w-full h-full pointer-events-auto opacity-90">
        <Spline scene={scene} />
      </div>
      <div className="absolute inset-0 bg-stone-950/10 pointer-events-none" />
    </div>
  );
}
