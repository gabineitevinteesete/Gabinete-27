'use client';

import type { ButtonHTMLAttributes } from 'react';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost';
}

const VARIANT_CLASSES: Record<NonNullable<ButtonProps['variant']>, string> = {
  primary: 'bg-primary text-white hover:bg-primary-dark',
  secondary: 'bg-secondary text-white hover:bg-secondary-dark',
  ghost: 'bg-transparent text-primary-dark border border-primary hover:bg-primary-light',
};

export function Button({ variant = 'primary', className = '', disabled, ...props }: ButtonProps) {
  return (
    <button
      {...props}
      disabled={disabled}
      className={`w-full rounded-xl px-4 py-3 text-base font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${VARIANT_CLASSES[variant]} ${className}`}
    />
  );
}
