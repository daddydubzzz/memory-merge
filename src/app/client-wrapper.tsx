'use client';

import React from 'react';
import { AuthProvider } from '@/contexts/AuthContext';

interface ClientWrapperProps {
  children: React.ReactNode;
}

export default function ClientWrapper({ children }: ClientWrapperProps) {
  return (
    <AuthProvider>
      {children}
    </AuthProvider>
  );
}

// Explicit export for better TypeScript resolution
export { ClientWrapper }; 