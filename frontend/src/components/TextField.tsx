'use client';

import type { InputHTMLAttributes } from 'react';

interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
}

export function TextField({ label, error, id, className = '', ...props }: TextFieldProps) {
  const fieldId = id ?? props.name;
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={fieldId} className="text-sm font-medium text-gray-700">
        {label}
      </label>
      <input
        {...props}
        id={fieldId}
        className={`rounded-xl border px-4 py-3 text-base outline-none focus:ring-2 focus:ring-primary ${
          error ? 'border-red-500' : 'border-gray-300'
        } ${className}`}
      />
      {error && <span className="text-sm text-red-600">{error}</span>}
    </div>
  );
}
