import type { HTMLAttributes } from 'react';
import clsx from 'clsx';

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={clsx('bg-surface rounded-lg shadow-card p-5', className)} {...props} />;
}
