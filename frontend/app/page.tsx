import { Navbar } from '@/components/landing/navbar';
import { Hero } from '@/components/landing/hero';
import { FeaturesSection } from '@/components/landing/features-section';
import { Footer } from '@/components/landing/footer';
import { SplineBackground } from '@/components/landing/spline-background';

export default function Home() {
  return (
    <main className="min-h-screen relative overflow-x-hidden">
      {/* 3D Background - Now abstracted as a Client Component */}
      <SplineBackground />

      <div className="relative z-10 w-full pointer-events-none">
        <div className="pointer-events-auto">
          <Navbar />
        </div>
        
        <Hero />
        
        <div className="pointer-events-auto bg-stone-50/50 dark:bg-stone-950/50 backdrop-blur-3xl">
          <FeaturesSection />
          <Footer />
        </div>
      </div>
    </main>
  );
}
