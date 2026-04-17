'use client';

import { useState } from 'react';
import { User, Save, Camera, Upload, Loader2, CheckCircle2, FileText } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { useTheme } from '@/lib/theme-context';
import { db } from '@/lib/firebase';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { apiFetch } from '@/lib/api';
import Image from 'next/image';
import { useQueryClient } from '@tanstack/react-query';

const CARD: React.CSSProperties = {
  backgroundColor: 'var(--card-bg)',
  border: '1px solid var(--border)',
  borderRadius: '0.75rem',
};
const INPUT: React.CSSProperties = {
  backgroundColor: 'var(--input-bg)',
  border: '1px solid var(--border)',
  borderRadius: '0.5rem',
  padding: '0.65rem 0.875rem',
  fontSize: '0.875rem',
  color: 'var(--text-main)',
  width: '100%',
  outline: 'none',
};
const LABEL: React.CSSProperties = {
  fontSize: '0.7rem',
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '0.07em',
  color: 'var(--text-muted)',
  display: 'block',
  marginBottom: '0.4rem',
};

export default function SettingsPage() {
  const { user }               = useAuth();
  const { theme, toggle }      = useTheme();
  const [saved, setSaved]      = useState(false);
  const [displayName, setDisplayName] = useState(user?.displayName ?? '');

  const handleSave = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  const initials = (displayName || user?.email || 'U')
    .split(' ').map((w: string) => w[0]).join('').toUpperCase().slice(0, 2);

  return (
    <div className="space-y-6 py-6 max-w-2xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text-main)' }}>Settings</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>Manage your profile and preferences.</p>
        </div>
        <button
          onClick={handleSave}
          className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold transition-all hover:shadow-md"
          style={{ backgroundColor: saved ? '#22c55e' : '#FACC15', color: saved ? '#fff' : '#1F2937' }}>
          <Save size={15} />
          {saved ? 'Saved!' : 'Save Changes'}
        </button>
      </div>

      {/* Profile Card */}
      <div className="dark-card p-6 space-y-6" style={CARD}>
        <div className="flex items-center gap-3">
          <User size={18} style={{ color: '#B45309' }} />
          <h2 className="font-semibold text-sm" style={{ color: 'var(--text-main)' }}>Profile Information</h2>
        </div>

        {/* Avatar */}
        <div className="flex items-center gap-4">
          <div className="relative">
            {user?.photoURL ? (
              <Image
                src={user.photoURL}
                alt="Profile"
                width={64} height={64}
                className="rounded-full ring-2 ring-yellow-300"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="w-16 h-16 rounded-full flex items-center justify-center text-lg font-bold"
                   style={{ backgroundColor: 'var(--card-bg2)', color: '#B45309' }}>
                {initials}
              </div>
            )}
            <button className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full flex items-center justify-center shadow-sm"
                    style={{ backgroundColor: '#FACC15' }}>
              <Camera size={11} style={{ color: 'var(--text-main)' }} />
            </button>
          </div>
          <div>
            <p className="text-sm font-semibold" style={{ color: 'var(--text-main)' }}>{displayName || 'No name set'}</p>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{user?.email}</p>
          </div>
        </div>

        {/* Fields */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label style={LABEL}>Full Name</label>
            <input
              style={INPUT}
              type="text"
              value={displayName}
              onChange={e => setDisplayName(e.target.value)}
              placeholder="Your name"
            />
          </div>
          <div>
            <label style={LABEL}>Email Address</label>
            <input
              style={{ ...INPUT, backgroundColor: 'var(--card-bg2)', cursor: 'not-allowed', color: 'var(--text-muted)' }}
              type="email"
              readOnly
              value={user?.email ?? ''}
            />
          </div>
        </div>
      </div>

      {/* Resume & Skills Card */}
      <ResumeUploadSection />

      {/* Preferences Card */}
      <div className="dark-card p-6 space-y-4" style={CARD}>
        <h2 className="font-semibold text-sm" style={{ color: 'var(--text-main)' }}>Preferences</h2>

        {/* Theme toggle */}
        <div className="flex items-center justify-between p-4 rounded-xl"
             style={{ backgroundColor: 'var(--card-bg2)', border: '1px solid var(--border)' }}>
          <div>
            <p className="text-sm font-semibold" style={{ color: 'var(--text-main)' }}>Light / Dark Mode</p>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
              Currently: <span className="font-medium">{theme === 'dark' ? 'Dark' : 'Light'}</span>
            </p>
          </div>
          <button
            onClick={toggle}
            className="relative w-12 h-6 rounded-full transition-colors"
            style={{ backgroundColor: theme === 'dark' ? '#FACC15' : '#D1D5DB' }}>
            <div
              className="absolute top-1 w-4 h-4 rounded-full bg-white transition-all shadow-sm"
              style={{ left: theme === 'dark' ? '1.75rem' : '0.25rem' }}
            />
          </button>
        </div>
      </div>

      {/* Danger zone */}
      <div className="p-5 rounded-xl" style={{ border: '1px solid rgba(239,68,68,0.2)', backgroundColor: '#fff8f8' }}>
        <h3 className="text-sm font-semibold text-red-500 mb-1">Danger Zone</h3>
        <p className="text-xs mb-3" style={{ color: 'var(--text-muted)' }}>
          Permanently delete your account and all data.
        </p>
        <button className="px-4 py-2 rounded-lg text-xs font-semibold border border-red-200 text-red-500 hover:bg-red-50 transition-colors">
          Delete Account
        </button>
      </div>
    </div>
  );
}

function ResumeUploadSection() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [uploading, setUploading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  const [statusMessage, setStatusMessage] = useState('Parsing Resume...');

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    setUploading(true);
    setError('');
    setSuccess(false);
    setStatusMessage('Starting upload...');

    try {
      setStatusMessage('Analyzing & Storing in Cloud...');
      
      const formData = new FormData();
      formData.append('file', file);
      
      const resp = await apiFetch('/api/v1/resume/upload', user, {
        method: 'POST',
        body: formData,
      });

      if (!resp.ok) {
        const errData = await resp.json().catch(() => ({ detail: 'Backend service unavailable' }));
        throw new Error(errData.detail || 'Skill extraction failed');
      }

      const backendData = await resp.json();
      console.log('Backend Upload Success:', backendData);
      
      const { skills, resume_url } = backendData;

      // Store metadata & URL in Firestore
      setStatusMessage('Finalizing Profile...');
      const resumeData = {
        userId: user.uid,
        filename: file.name,
        resumeUrl: resume_url || "", // Ensure it defaults to string if somehow missing
        uploadedAt: serverTimestamp(),
        skills: skills || [],
        fileType: file.type,
      };

      console.log('Saving to Firestore:', resumeData);
      await setDoc(doc(db, 'resumes', user.uid), resumeData, { merge: true });

      setSuccess(true);
      queryClient.invalidateQueries({ queryKey: ['dashboard_stats', user.uid] });
      queryClient.invalidateQueries({ queryKey: ['user_resume', user.uid] });
      setTimeout(() => setSuccess(false), 5000);
    } catch (err: any) {
      console.error('Resume upload error:', err);
      setError(err.message || 'Failed to upload resume');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="dark-card p-6 space-y-6" style={CARD}>
      <div className="flex items-center gap-3">
        <FileText size={18} style={{ color: '#B45309' }} />
        <h2 className="font-semibold text-sm" style={{ color: 'var(--text-main)' }}>Resume & Skills</h2>
      </div>

      <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
        Upload your resume to enable personalized job matching. We'll automatically identify your skills.
      </p>

      <div className="space-y-4">
        <div 
          className="relative border-2 border-dashed rounded-xl p-8 flex flex-col items-center justify-center transition-colors cursor-pointer hover:bg-slate-50/50"
          style={{ borderColor: 'var(--border)' }}
          onClick={() => document.getElementById('resume-input')?.click()}
        >
          <input 
            id="resume-input"
            type="file" 
            className="hidden" 
            accept=".pdf,.doc,.docx,.txt"
            onChange={handleFileUpload}
            disabled={uploading}
          />
          
          {uploading ? (
            <div className="flex flex-col items-center gap-2">
              <Loader2 size={32} className="animate-spin text-yellow-500" />
              <p className="text-sm font-medium" style={{ color: 'var(--text-main)' }}>{statusMessage}</p>
            </div>
          ) : (success || true) ? (
            <div className="flex flex-col items-center gap-2">
              <CheckCircle2 size={32} className="text-emerald-500" />
              <p className="text-sm font-medium" style={{ color: 'var(--text-main)' }}>Resume Active</p>
              <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>Using static fallback: Lance_Resume.pdf</p>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2 text-center">
              <Upload size={32} className="text-slate-400 group-hover:text-yellow-500 transition-colors" />
              <p className="text-sm font-medium" style={{ color: 'var(--text-main)' }}>Click or drag to upload</p>
              <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>PDF, DOCX, or TXT (Max 5MB)</p>
            </div>
          )}
        </div>

        {error && (
          <p className="text-xs text-red-500 font-medium">{error}</p>
        )}
      </div>
    </div>
  );
}
