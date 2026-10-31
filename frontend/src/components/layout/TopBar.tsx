import React, { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { GitBranch, FolderGit2, Activity, ArrowLeftRight, Package, Info } from 'lucide-react';
import { LiveIndicator } from './LiveIndicator';
import { DemoControls } from './DemoControls';
import { ArchitectureModal } from './ArchitectureModal';

interface TopBarProps {
  connected: boolean;
  projectId?: string;
  branch?: string;
}

export const TopBar: React.FC<TopBarProps> = ({
  connected,
  projectId = 'demo-app',
  branch = 'main',
}) => {
  const [archModalOpen, setArchModalOpen] = useState(false);

  return (
    <>
      <header className="sticky top-0 z-40 w-full h-14 bg-surface-1/90 backdrop-blur border-b border-border px-4 lg:px-6 flex items-center justify-between gap-4 select-none">
        {/* Left: Brand + Scope Chips + Nav Tabs */}
        <div className="flex items-center gap-4 lg:gap-6 shrink-0">
          {/* Brand */}
          <NavLink
            to="/"
            className="flex items-center gap-1.5 font-mono text-base font-bold text-text hover:text-accent transition-colors shrink-0"
          >
            <span className="text-accent">▲</span>
            <span>buildcliff</span>
            <span className="text-accent animate-blink">_</span>
          </NavLink>

          {/* Scope Chips */}
          <div className="hidden sm:flex items-center gap-1.5 p-1 rounded-md bg-surface-2 border border-border text-xs font-mono text-text-muted shrink-0">
            <span className="flex items-center gap-1 px-1.5 py-0.5 text-text">
              <FolderGit2 size={12} className="text-text-muted" />
              <span>{projectId}</span>
            </span>
            <span className="text-border-strong">/</span>
            <span className="flex items-center gap-1 px-1.5 py-0.5 text-text">
              <GitBranch size={12} className="text-text-muted" />
              <span>{branch}</span>
            </span>
          </div>

          {/* Nav Tabs */}
          <nav className="flex items-center gap-1 shrink-0">
            <NavLink
              to="/"
              className={({ isActive }) =>
                `flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-mono font-medium transition-colors ${
                  isActive
                    ? 'bg-surface-3 text-text border border-border-strong'
                    : 'text-text-muted hover:text-text hover:bg-surface-2 border border-transparent'
                }`
              }
            >
              <Activity size={13} className="text-accent" />
              <span>Timeline</span>
            </NavLink>
            <NavLink
              to="/compare"
              className={({ isActive }) =>
                `flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-mono font-medium transition-colors ${
                  isActive
                    ? 'bg-surface-3 text-text border border-border-strong'
                    : 'text-text-muted hover:text-text hover:bg-surface-2 border border-transparent'
                }`
              }
            >
              <ArrowLeftRight size={13} />
              <span>Compare</span>
            </NavLink>
            <NavLink
              to="/dependencies"
              className={({ isActive }) =>
                `flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-mono font-medium transition-colors ${
                  isActive
                    ? 'bg-surface-3 text-text border border-border-strong'
                    : 'text-text-muted hover:text-text hover:bg-surface-2 border border-transparent'
                }`
              }
            >
              <Package size={13} />
              <span>Dependencies</span>
            </NavLink>
          </nav>

          {/* Architecture trigger */}
          <button
            onClick={() => setArchModalOpen(true)}
            className="hidden md:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-mono text-text-muted hover:text-text hover:bg-surface-2 border border-border transition-colors shrink-0"
            title="View system architecture diagram"
          >
            <Info size={12} />
            <span>Architecture</span>
          </button>
        </div>

        {/* Right: Live Status & Demo Controls */}
        <div className="flex items-center gap-3 shrink-0">
          <LiveIndicator connected={connected} />
          <DemoControls />
        </div>
      </header>

      {/* Architecture Modal Dialog */}
      <ArchitectureModal isOpen={archModalOpen} onClose={() => setArchModalOpen(false)} />
    </>
  );
};
