import type { InputHTMLAttributes, ReactNode } from 'react';
import clsx from 'clsx';

export interface FieldProps {
  label: string;
  htmlFor?: string;
  error?: string;
  hint?: string;
  children: ReactNode;
}

export function Field({ label, htmlFor, error, hint, children }: FieldProps) {
  return (
    <div>
      <label htmlFor={htmlFor} className="block text-sm2 font-semibold text-muted mb-[5px]">{label}</label>
      {children}
      {error ? <p className="mt-1 text-2xs text-red">{error}</p> : hint ? <p className="mt-1 text-2xs text-muted">{hint}</p> : null}
    </div>
  );
}

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={clsx(
        'w-full text-sm2 bg-surface border border-line-strong rounded px-[11px] py-2 min-h-[38px]',
        'hover:border-[#b9c1cc] focus-visible:outline-none focus-visible:border-blue-mid focus-visible:ring-4 focus-visible:ring-blue-light',
        className,
      )}
      {...props}
    />
  );
}
