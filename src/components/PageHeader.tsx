import type { ReactNode } from 'react';

export interface PageHeaderProps {
  title: string;
  description?: string;
  actions?: ReactNode;
}

/** Screen title block. Deliberately quiet: the title used to be 21px bold above a 12.5px description
 * and a 12px table — 68% larger than anything it introduced, while carrying no information the
 * highlighted sidebar item doesn't already give. At 16px it still reads as the page title, reclaims
 * roughly 40px of vertical space on every screen, and stops competing with the data underneath,
 * which is what people actually came for. */
export function PageHeader({ title, description, actions }: PageHeaderProps) {
  return (
    <div className="flex items-start justify-between gap-4 mb-3.5">
      <div className="min-w-0">
        <h1 className="text-xl font-semibold text-text truncate">{title}</h1>
        {description && <p className="text-sm2 text-muted mt-0.5">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
    </div>
  );
}
