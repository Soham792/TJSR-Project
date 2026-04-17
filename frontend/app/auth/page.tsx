'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Mail, Lock, User, ArrowRight, Loader2 } from 'lucide-react';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  updateProfile,
} from 'firebase/auth';
import Image from 'next/image';
import { auth, googleProvider } from '@/lib/firebase';
import { useAuth } from '@/lib/auth-context';

export default function AuthPage() {
  const router = useRouter();
  const [isSignUp,  setIsSignUp]  = useState(false);
  const [email,     setEmail]     = useState('');
  const [password,  setPassword]  = useState('');
  const [name,      setName]      = useState('');
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState('');
  const { user: currentUser, loading: authLoading } = useAuth();

  useEffect(() => {
    if (!authLoading && currentUser) {
      router.push('/onboarding');
    }
  }, [currentUser, authLoading, router]);

  // ── Helpers ────────────────────────────────────────────────────────────────

  function friendlyError(err: unknown): string {
    const raw = err instanceof Error ? err.message : String(err);

    // Extract Firebase error code for a human-readable message
    const codeMatch = raw.match(/\(auth\/([\w-]+)\)/);
    const code = codeMatch?.[1];
    const codeMessages: Record<string, string> = {
      'user-not-found':       'No account with this email. Try signing up.',
      'wrong-password':       'Incorrect password.',
      'email-already-in-use': 'An account with this email already exists.',
      'weak-password':        'Password must be at least 6 characters.',
      'invalid-email':        'Please enter a valid email address.',
      'too-many-requests':    'Too many failed attempts. Try again later.',
      'popup-closed-by-user': 'Sign-in was cancelled.',
      'popup-blocked':        'Popup was blocked by your browser.',
      'unauthorized-domain':  'This domain is not authorised in Firebase. Add it in the Firebase Console → Authentication → Settings → Authorised domains.',
      'network-request-failed': 'Network error. Check your internet connection.',
    };
    if (code && codeMessages[code]) return codeMessages[code];

    console.error('Firebase Auth Error:', err); // Log the full error for debugging in F12
    return raw.replace('Firebase: ', '').replace(/\(auth\/[\w-]+\)\.?/g, '').trim() || 'Authentication failed.';
  }

  // ── Email/password sign-in ─────────────────────────────────────────────────

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      if (isSignUp) {
        const cred = await createUserWithEmailAndPassword(auth, email, password);
        if (name) await updateProfile(cred.user, { displayName: name });
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }
      window.location.href = '/dashboard';
    } catch (err: unknown) {
      setError(friendlyError(err));
      setLoading(false);
    }
  };

  // ── Handle Google sign-in (using Popup to keep URL clean) ───────────────────
  const handleGoogleSignIn = async () => {
    setLoading(true);
    setError('');
    try {
      const result = await signInWithPopup(auth, googleProvider);
      if (result.user) {
        window.location.href = '/onboarding';
      }
    } catch (err: unknown) {
      setError(friendlyError(err));
      setLoading(false);
    }
  };

  // ── Full-page spinner while resolving the redirect result ──────────────────

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 size={36} className="animate-spin text-purple-400" />
          <p className="text-gray-400 text-sm">Signing you in…</p>
          <button 
            onClick={() => window.location.href = '/onboarding'}
            className="text-purple-400 text-xs mt-4 hover:underline"
          >
            Click here if you aren't redirected automatically
          </button>
        </div>
      </div>
    );
  }

  // ── Auth form ──────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-black flex items-center justify-center px-4 relative overflow-hidden">
      {/* Background blobs */}
      <div className="absolute inset-0 -z-10 pointer-events-none">
        <div className="absolute top-10 right-20 w-72 h-72 bg-purple-500/20 rounded-full blur-3xl animate-pulse" />
        <div className="absolute bottom-10 left-20 w-96 h-96 bg-blue-500/20 rounded-full blur-3xl animate-pulse delay-700" />
      </div>

      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex items-center mb-6">
            <Image
              src="/TJSR.png"
              alt="TJSR Logo"
              width={600}
              height={200}
              className="w-72 md:w-80 h-auto object-contain"
              priority
            />
          </Link>
          <h1 className="text-3xl font-bold mb-2 text-white">
            {isSignUp ? 'Create Account' : 'Welcome Back'}
          </h1>
          <p className="text-gray-400">
            {isSignUp
              ? 'Join thousands finding their dream job'
              : 'Sign in to continue your job search'}
          </p>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm text-center">
            {error}
          </div>
        )}

        {/* Email/password form */}
        <form onSubmit={handleSubmit} className="space-y-4 mb-6">
          {isSignUp && (
            <div>
              <label htmlFor="name" className="block text-sm font-medium text-gray-300 mb-2">
                Full Name
              </label>
              <div className="relative">
                <User className="absolute left-3 top-3 text-gray-400" size={20} />
                <input
                  type="text"
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="John Doe"
                  className="w-full bg-slate-900 border border-purple-500/20 rounded-lg py-3 pl-10 pr-4 text-white placeholder-gray-500 focus:outline-none focus:border-purple-500/50 transition-colors"
                  required={isSignUp}
                />
              </div>
            </div>
          )}

          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-300 mb-2">
              Email Address
            </label>
            <div className="relative">
              <Mail className="absolute left-3 top-3 text-gray-400" size={20} />
              <input
                type="email"
                id="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full bg-slate-900 border border-purple-500/20 rounded-lg py-3 pl-10 pr-4 text-white placeholder-gray-500 focus:outline-none focus:border-purple-500/50 transition-colors"
                required
              />
            </div>
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-300 mb-2">
              Password
            </label>
            <div className="relative">
              <Lock className="absolute left-3 top-3 text-gray-400" size={20} />
              <input
                type="password"
                id="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full bg-slate-900 border border-purple-500/20 rounded-lg py-3 pl-10 pr-4 text-white placeholder-gray-500 focus:outline-none focus:border-purple-500/50 transition-colors"
                required
              />
            </div>
          </div>

          {!isSignUp && (
            <div className="text-right">
              <button type="button" className="text-sm text-purple-400 hover:text-purple-300 transition-colors">
                Forgot password?
              </button>
            </div>
          )}

          <button
            type="submit"
            className="w-full bg-gradient-to-r from-purple-600 to-blue-500 rounded-lg py-3 text-white font-semibold
                       hover:shadow-lg transition-all flex items-center justify-center gap-2"
          >
            <span>{isSignUp ? 'Create Account' : 'Sign In'}</span>
            <ArrowRight size={20} />
          </button>
        </form>

        {/* Divider */}
        <div className="relative mb-6">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-purple-500/20" />
          </div>
          <div className="relative flex justify-center text-sm">
            <span className="px-2 bg-black text-gray-400">Or continue with</span>
          </div>
        </div>

        {/* Google button */}
        <div className="mb-6">
          <button
            onClick={handleGoogleSignIn}
            className="w-full bg-slate-900 border border-purple-500/20 rounded-lg py-3 text-white font-medium
                       hover:bg-slate-800 transition-all flex items-center justify-center gap-3"
          >
            <svg className="w-5 h-5 flex-shrink-0" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
            </svg>
            <span>Continue with Google</span>
          </button>
        </div>

        {/* Toggle sign-in / sign-up */}
        <p className="text-center text-gray-400">
          {isSignUp ? 'Already have an account?' : "Don't have an account?"}{' '}
          <button
            onClick={() => { setIsSignUp(!isSignUp); setName(''); setEmail(''); setPassword(''); setError(''); }}
            className="text-purple-400 hover:text-purple-300 font-semibold transition-colors"
          >
            {isSignUp ? 'Sign in' : 'Sign up'}
          </button>
        </p>

        <p className="text-center text-xs text-gray-500 mt-6">
          By continuing, you agree to our{' '}
          <a href="#" className="text-purple-400 hover:text-purple-300">Terms of Service</a>
          {' '}and{' '}
          <a href="#" className="text-purple-400 hover:text-purple-300">Privacy Policy</a>
        </p>
      </div>
    </div>
  );
}
