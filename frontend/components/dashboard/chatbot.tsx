'use client';

import { useState, useRef, useEffect } from 'react';
import { Send, X, Maximize2, Minimize2, Loader2, Bot } from 'lucide-react';
import Image from 'next/image';
import { toast } from 'sonner';

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';

type Msg = { role: 'user' | 'bot'; content: string };

export function Chatbot() {
  const [isOpen,    setIsOpen]    = useState(false);
  const [isFull,    setIsFull]    = useState(false);
  const [messages,  setMessages]  = useState<Msg[]>([
    { role: 'bot', content: "Hi! I'm your TJSR career assistant. How can I help you discover your next opportunity today?" },
  ]);
  const [input,     setInput]     = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isOpen]);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;
    const userMsg = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: userMsg }]);
    setIsLoading(true);

    try {
      toast.success("AI Assistant is analyzing...", {
        icon: <Bot size={16} className="text-yellow-500" />,
        duration: 3000,
      });

      const res = await fetch(`${BACKEND_URL}/api/v1/chat/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userMsg }),
      });
      if (!res.ok) throw new Error('Failed to connect');
      const reader = res.body?.getReader();
      if (!reader) throw new Error('No reader');

      let botText = '';
      setMessages(prev => [...prev, { role: 'bot', content: '' }]);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const lines = new TextDecoder().decode(value).split('\n');
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const raw = line.replace('data: ', '').trim();
          if (raw === '[DONE]') continue;
          try {
            const data = JSON.parse(raw);
            if (data.content) {
              botText += data.content;
              setMessages(prev => {
                const copy = [...prev];
                copy[copy.length - 1] = { role: 'bot', content: botText };
                return copy;
              });
            }
          } catch { /* ignore parse errors */ }
        }
      }
      
      toast.success("Response received!", {
        description: "Your session history has been updated and mirrored to Telegram.",
        duration: 4000,
      });
    } catch {
      setMessages(prev => [...prev, { role: 'bot', content: "Sorry, I'm having trouble connecting right now. Please try again later." }]);
      toast.error("Cloud connection failed.");
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 w-16 h-16 rounded-full shadow-2xl
                   hover:scale-110 active:scale-95 transition-all duration-300 z-50
                   overflow-hidden ring-2 ring-yellow-300/60"
        style={{ padding: 0 }}
      >
        <Image src="/chatbot.png" alt="Chat" width={64} height={64} className="object-cover" />
      </button>
    );
  }

  const windowStyle: React.CSSProperties = isFull
    ? { inset: 0, margin: 0, borderRadius: 0 }
    : { bottom: 24, right: 24, width: 400, height: 580, borderRadius: '1.25rem' };

  return (
    <div
      className="fixed z-50 flex flex-col overflow-hidden shadow-2xl transition-all duration-300"
      style={{
        ...windowStyle,
        backgroundColor: 'var(--card-bg)',
        border: '1px solid var(--border)',
      }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3 flex-shrink-0"
        style={{ borderBottom: '1px solid var(--border)', backgroundColor: 'var(--card-bg2)' }}
      >
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-full overflow-hidden ring-2 flex-shrink-0"
               style={{ ringColor: '#FACC15' }}>
            <Image src="/chatbot.png" alt="Bot" width={36} height={36} className="object-cover" />
          </div>
          <div>
            <p className="text-sm font-semibold" style={{ color: 'var(--text-main)' }}>TJSR Assistant</p>
            <div className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              <span className="text-[10px] font-medium" style={{ color: 'var(--text-muted)' }}>Online</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setIsFull(f => !f)}
            className="p-2 rounded-lg transition-colors hover:bg-black/5 dark:hover:bg-white/10"
            style={{ color: 'var(--text-muted)' }}
          >
            {isFull ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
          </button>
          <button
            onClick={() => setIsOpen(false)}
            className="p-2 rounded-lg transition-colors hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-500"
            style={{ color: 'var(--text-muted)' }}
          >
            <X size={15} />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3" style={{ backgroundColor: 'var(--input-bg)' }}>
        {messages.map((msg, idx) => (
          <div
            key={idx}
            className={`flex ${msg.role === 'user' ? 'justify-end msg-right' : 'justify-start msg-left'}`}
          >
            {msg.role === 'bot' && (
              <div className="w-7 h-7 rounded-full overflow-hidden flex-shrink-0 mr-2 mt-0.5 ring-1 ring-yellow-300/50">
                <Image src="/chatbot.png" alt="Bot" width={28} height={28} className="object-cover" />
              </div>
            )}
            <div
              className="max-w-[78%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed shadow-sm"
              style={msg.role === 'user'
                ? {
                    backgroundColor: '#FACC15',
                    color: '#1F2937',
                    borderBottomRightRadius: '4px',
                  }
                : {
                    backgroundColor: 'var(--card-bg)',
                    color: 'var(--text-main)',
                    border: '1px solid var(--border)',
                    borderBottomLeftRadius: '4px',
                  }
              }
            >
              {msg.content || (isLoading && idx === messages.length - 1
                ? <Loader2 size={14} className="animate-spin opacity-60" />
                : '')}
            </div>
            {msg.role === 'user' && (
              <div className="w-7 h-7 rounded-full flex-shrink-0 ml-2 mt-0.5 flex items-center justify-center text-xs font-bold"
                   style={{ backgroundColor: '#FDECC8', color: '#B45309' }}>
                U
              </div>
            )}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div
        className="p-3 flex-shrink-0"
        style={{ borderTop: '1px solid var(--border)', backgroundColor: 'var(--card-bg)' }}
      >
        <form onSubmit={e => { e.preventDefault(); handleSend(); }} className="flex items-center gap-2">
          <input
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder="Type your message…"
            className="flex-1 px-4 py-2.5 rounded-xl text-sm outline-none transition-all"
            style={{
              backgroundColor: 'var(--input-bg)',
              border: '1px solid var(--border)',
              color: 'var(--text-main)',
            }}
          />
          <button
            type="submit"
            disabled={!input.trim() || isLoading}
            className="w-10 h-10 rounded-xl flex items-center justify-center transition-all
                       hover:shadow-md active:scale-95 disabled:opacity-40"
            style={{ backgroundColor: '#FACC15', color: '#1F2937' }}
          >
            <Send size={16} />
          </button>
        </form>
      </div>
    </div>
  );
}
