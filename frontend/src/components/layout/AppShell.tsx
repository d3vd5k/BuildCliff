import React, { ReactNode } from 'react';
import { TopBar } from './TopBar';
import { DevModeToggle } from '../ui/DevModeToggle';
import { useStream } from '../../hooks/useStream';

interface AppShellProps {
  children: ReactNode;
}

export const AppShell: React.FC<AppShellProps> = ({ children }) => {
  const { connected } = useStream('demo-app', 'main');

  return (
    <div className="min-h-screen flex flex-col bg-bg text-text antialiased">
      <TopBar connected={connected} />
      <main className="flex-1 w-full max-w-[1600px] mx-auto p-4 md:p-6 pb-20">
        {children}
      </main>
      <DevModeToggle />
    </div>
  );
};

