'use client';

import React from 'react';
import { Heart } from 'lucide-react';

interface BrandIconProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}

export default function BrandIcon({ size = 'md', className = '' }: BrandIconProps) {
  const sizeClasses = {
    sm: 'w-5 h-5',
    md: 'w-6 h-6',
    lg: 'w-8 h-8',
    xl: 'w-12 h-12'
  };

  return (
    <div className={`relative ${className}`}>
      <Heart className={`${sizeClasses[size]} text-pink-500`} />
      <div className={`absolute inset-0 ${sizeClasses[size]} text-blue-500 opacity-20`}>
        <Heart className="w-full h-full" />
      </div>
    </div>
  );
} 