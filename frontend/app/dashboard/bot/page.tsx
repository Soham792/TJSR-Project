'use client';

import { StatCard } from '@/components/dashboard/stat-card';
import { MessageSquare, Send, Users, Clock } from 'lucide-react';

export default function BotPage() {
  return (
    <div className="max-w-7xl">
      {/* Page Header */}
      <div className="mb-8">
        <h1 className="text-4xl font-bold text-white mb-2">Telegram Bot Control</h1>
        <p className="text-gray-400">Manage your daily job digest and bot settings</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <StatCard 
          label="Bot Status" 
          value="Connected"
          icon={<MessageSquare size={24} className="text-green-400" />}
        />
        <StatCard 
          label="Subscribers" 
          value="1,234"
          change={8}
          icon={<Users size={24} />}
        />
        <StatCard 
          label="Digests Sent" 
          value="5,678"
          icon={<Send size={24} />}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Settings */}
        <div className="lg:col-span-2 bg-slate-900/50 border border-purple-500/20 rounded-lg p-6">
          <h2 className="text-2xl font-bold text-white mb-6">Bot Settings</h2>

          <div className="space-y-6">
            {/* Daily Digest */}
            <div className="border-b border-purple-500/10 pb-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-white">Daily Digest</h3>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input type="checkbox" className="sr-only peer" defaultChecked />
                  <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-purple-500 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-600"></div>
                </label>
              </div>
              <p className="text-gray-400 text-sm">Receive a digest of matching jobs every morning at 8 AM</p>
            </div>

            {/* Delivery Time */}
            <div className="border-b border-purple-500/10 pb-6">
              <h3 className="text-lg font-semibold text-white mb-4 flex items-center space-x-2">
                <Clock size={20} />
                <span>Delivery Time</span>
              </h3>
              <select className="w-full bg-slate-800 border border-purple-500/20 rounded-lg py-2 px-3 text-white focus:outline-none focus:border-purple-500/50">
                <option>8:00 AM</option>
                <option>9:00 AM</option>
                <option>10:00 AM</option>
                <option>12:00 PM</option>
                <option>6:00 PM</option>
                <option>9:00 PM</option>
              </select>
            </div>

            {/* Notification Preferences */}
            <div className="border-b border-purple-500/10 pb-6">
              <h3 className="text-lg font-semibold text-white mb-4">Notification Preferences</h3>
              <div className="space-y-3">
                {['New matching jobs', 'Application updates', 'Interview reminders', 'Trending companies'].map((pref, index) => (
                  <label key={index} className="flex items-center space-x-3 cursor-pointer">
                    <input type="checkbox" className="w-4 h-4 rounded border-purple-500/20 bg-slate-800 accent-purple-600" defaultChecked />
                    <span className="text-gray-300">{pref}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Commands */}
            <div>
              <h3 className="text-lg font-semibold text-white mb-4">Available Commands</h3>
              <div className="space-y-2 text-sm">
                {[
                  { cmd: '/jobs', desc: 'Get latest matching jobs' },
                  { cmd: '/stats', desc: 'View your job search stats' },
                  { cmd: '/apply', desc: 'Quick apply to jobs' },
                  { cmd: '/settings', desc: 'Adjust bot settings' },
                ].map((item, index) => (
                  <div key={index} className="flex items-start space-x-3 p-3 bg-slate-800/50 rounded-lg">
                    <code className="text-purple-400 font-mono font-semibold">{item.cmd}</code>
                    <span className="text-gray-400">{item.desc}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Bot Status */}
        <div className="bg-slate-900/50 border border-purple-500/20 rounded-lg p-6">
          <h2 className="text-lg font-bold text-white mb-6">Bot Status</h2>

          <div className="space-y-4">
            <div className="bg-gradient-to-br from-green-500/20 to-green-600/10 border border-green-500/30 rounded-lg p-4">
              <div className="flex items-center space-x-2 mb-2">
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                <span className="text-green-400 font-semibold">Active</span>
              </div>
              <p className="text-green-300/80 text-sm">Bot is running smoothly and delivering messages</p>
            </div>

            <div className="border border-purple-500/20 rounded-lg p-4">
              <p className="text-gray-300 text-sm font-semibold mb-2">Chat ID:</p>
              <p className="text-gray-400 font-mono text-xs">123456789</p>
            </div>

            <button className="w-full bg-gradient-to-r from-purple-600 to-blue-500 rounded-lg py-3 text-white font-semibold hover:shadow-lg glow-purple-hover smooth-transition">
              Open Telegram Bot
            </button>

            <button className="w-full border border-purple-500/20 rounded-lg py-3 text-white font-semibold hover:bg-purple-500/10 smooth-transition">
              Disconnect Bot
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
