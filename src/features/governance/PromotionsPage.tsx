import { useParams } from 'react-router-dom';
import { ArrowRight, Check, X } from 'lucide-react';
import { PageHeader } from '../../components/PageHeader';
import { EmptyState } from '../../components/EmptyState';
import { Tag } from '../../components/Tag';
import { Button } from '../../components/Button';
import { useToast } from '../../components/Toast';
import { usePromotions, usePromotionMutations } from '../../lib/queries/jobMonitor';
import { fmtDateTime } from '../../lib/format';

const STATUS_VARIANT = { Pending: 'warn', Approved: 'accent', Rejected: 'danger', Promoted: 'accent' } as const;

export function PromotionsPage() {
  const { waveId } = useParams();
  const toast = useToast();
  const { data: promotions = [], isLoading } = usePromotions(waveId);
  const mutations = usePromotionMutations(waveId!);

  const decide = async (id: string, status: 'Approved' | 'Rejected' | 'Promoted') => {
    try { await mutations.setStatus(id, status); toast.success(`Promotion ${status.toLowerCase()}.`); }
    catch (err: any) { toast.error(err.message ?? 'Could not update promotion.'); }
  };

  return (
    <div>
      <PageHeader title="Promotions" description="DEV → QSA → PRD transports with approvals." />
      {!isLoading && promotions.length === 0 ? (
        <EmptyState title="No promotion requests" description="Requests to move artefacts between environments will list here." />
      ) : (
        <div className="flex flex-col gap-3">
          {promotions.map((p) => (
            <div key={p.id} className="bg-surface rounded-lg shadow-card p-4 flex items-center gap-4">
              <div className="min-w-0 flex-1">
                <div className="font-semibold text-text">{p.artefactName ?? p.artefactType}</div>
                <div className="text-2xs text-muted mt-0.5 flex items-center gap-1.5">
                  <Tag variant="neutral">{p.artefactType}</Tag>
                  {p.fromEnv && p.toEnv && <span className="flex items-center gap-1">{p.fromEnv} <ArrowRight size={11} /> {p.toEnv}</span>}
                  {p.requestedBy && <span>· {p.requestedBy}</span>}
                  {p.requestedAt && <span>· {fmtDateTime(p.requestedAt)}</span>}
                </div>
              </div>
              <Tag variant={STATUS_VARIANT[p.status]}>{p.status}</Tag>
              {p.status === 'Pending' && (
                <div className="flex gap-1.5">
                  <Button variant="ghost" onClick={() => decide(p.id, 'Approved')}><Check size={13} /> Approve</Button>
                  <Button variant="dangerGhost" onClick={() => decide(p.id, 'Rejected')}><X size={13} /> Reject</Button>
                </div>
              )}
              {p.status === 'Approved' && (
                <Button variant="primary" onClick={() => decide(p.id, 'Promoted')}>Promote</Button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
