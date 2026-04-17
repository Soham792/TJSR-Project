'use client';

import { StatCard } from '@/components/dashboard/stat-card';
import { TrendingUp, CheckCircle, Clock, Eye } from 'lucide-react';

export default function TrackingPage() {
  return (
    <div className="max-w-7xl">
      {/* Page Header */}
      <div className="mb-8">
        <h1 className="text-4xl font-bold text-white mb-2">Job Tracking Dashboard</h1>
        <p className="text-gray-400">Monitor your job applications and search progress</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        <StatCard 
          label="Total Applications" 
          value="34"
          change={3}
          icon={<CheckCircle size={24} className="text-blue-400" />}
        />
        <StatCard 
          label="In Progress" 
          value="8"
          change={1}
          icon={<Clock size={24} className="text-yellow-400" />}
        />
        <StatCard 
          label="Interviews" 
          value="3"
          change={0}
          icon={<Eye size={24} className="text-green-400" />}
        />
        <StatCard 
          label="Response Rate" 
          value="35%"
          change={5}
          icon={<TrendingUp size={24} className="text-purple-400" />}
        />
      </div>

      {/* Charts and Tables */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Application Status */}
        <div className="lg:col-span-2 bg-slate-900/50 border border-purple-500/20 rounded-lg p-6">
          <h2 className="text-2xl font-bold text-white mb-6">Application Status</h2>
          
          <div className="space-y-4">
            {[
              { company: 'TechCorp', role: 'Senior Frontend Dev', status: 'Interview Scheduled', date: 'Mar 28' },
              { company: 'CloudAI', role: 'Full Stack Engineer', status: 'Under Review', date: 'Mar 25' },
              { company: 'DataFlow', role: 'Backend Developer', status: 'Interview Scheduled', date: 'Mar 23' },
              { company: 'DesignFlow', role: 'UI/UX Designer', status: 'Rejected', date: 'Mar 20' },
              { company: 'InfraScale', role: 'DevOps Engineer', status: 'Under Review', date: 'Mar 18' },
              { company: 'AI Labs', role: 'ML Engineer', status: 'Applied', date: 'Mar 15' },
            ].map((app, index) => (
              <div key={index} className="flex items-center justify-between p-4 bg-slate-800/50 rounded-lg border border-purple-500/10 hover:border-purple-500/30 smooth-transition">
                <div className="flex-1">
                  <p className="text-white font-semibold">{app.company}</p>
                  <p className="text-gray-400 text-sm">{app.role}</p>
                </div>
                <div className="text-right">
                  <span className={`inline-block px-3 py-1 rounded-full text-sm font-medium ${
                    app.status === 'Interview Scheduled' ? 'bg-green-500/20 text-green-300' :
                    app.status === 'Under Review' ? 'bg-blue-500/20 text-blue-300' :
                    app.status === 'Applied' ? 'bg-purple-500/20 text-purple-300' :
                    'bg-red-500/20 text-red-300'
                  }`}>
                    {app.status}
                  </span>
                  <p className="text-gray-500 text-xs mt-1">{app.date}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Activity Timeline */}
        <div className="bg-slate-900/50 border border-purple-500/20 rounded-lg p-6">
          <h2 className="text-lg font-bold text-white mb-4">Recent Activity</h2>
          <div className="space-y-3">
            {[
              { event: 'Interview scheduled with TechCorp', time: '2 hours ago' },
              { event: 'Application viewed by CloudAI', time: '4 hours ago' },
              { event: 'Applied to DataFlow Systems', time: '1 day ago' },
              { event: 'Application rejected by DesignFlow', time: '3 days ago' },
              { event: 'Resume updated', time: '5 days ago' },
            ].map((activity, index) => (
              <div key={index} className="flex items-start space-x-3">
                <div className="w-2 h-2 bg-purple-500 rounded-full mt-2 flex-shrink-0"></div>
                <div className="flex-1">
                  <p className="text-gray-300 text-sm">{activity.event}</p>
                  <p className="text-gray-500 text-xs">{activity.time}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Stats Summary */}
      <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-gradient-to-br from-green-500/20 to-green-600/10 border border-green-500/30 rounded-lg p-6">
          <h3 className="text-lg font-bold text-white mb-2">Success Rate</h3>
          <div className="text-4xl font-bold text-green-400 mb-2">35%</div>
          <p className="text-green-300/80">Excellent progress! Keep applying and refining your approach.</p>
        </div>
        <div className="bg-gradient-to-br from-blue-500/20 to-blue-600/10 border border-blue-500/30 rounded-lg p-6">
          <h3 className="text-lg font-bold text-white mb-2">Next Steps</h3>
          <ul className="space-y-2 text-blue-300/80">
            <li>• Prepare for TechCorp interview on March 30</li>
            <li>• Follow up on CloudAI application</li>
            <li>• Update portfolio with latest projects</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
