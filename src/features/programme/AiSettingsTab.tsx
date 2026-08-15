import { useState } from 'react';
import { Sparkles, Plus, Trash2 } from 'lucide-react';
import { Card } from '../../components/Card';
import { Button } from '../../components/Button';
import { Field, Input } from '../../components/Field';
import { Tag } from '../../components/Tag';
import { useToast } from '../../components/Toast';
import { useAiProviderKeys, useAiProviderKeyMutations } from '../../lib/queries/aiSettings';

const PROVIDERS = ['Anthropic Claude API', 'OpenAI API', 'Azure OpenAI', 'Custom endpoint'];

export function AiSettingsTab({ projectId }: { projectId: string }) {
  const toast = useToast();
  const { data: keys = [] } = useAiProviderKeys(projectId);
  const mutations = useAiProviderKeyMutations(projectId);
  const [setupOpen, setSetupOpen] = useState(false);
  const [form, setForm] = useState({ provider: PROVIDERS[0], label: '', endpoint: '', key: '', budget: '400' });

  const save = async () => {
    try {
      await mutations.add(form);
      setForm({ provider: PROVIDERS[0], label: '', endpoint: '', key: '', budget: '400' });
      setSetupOpen(false);
      toast.success('Provider connected.');
    } catch (err: any) {
      toast.error(err.message ?? 'Could not save provider.');
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <Card>
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2">
            <Sparkles size={16} className="text-violet-deep" />
            <span className="font-bold text-text">Usage this month</span>
          </div>
        </div>
        <p className="text-sm text-muted">No usage recorded yet — connect a provider below to start tracking spend.</p>
      </Card>

      <div>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-lg font-bold">Connected providers</h3>
          <Button variant="secondary" onClick={() => setSetupOpen((o) => !o)}><Plus size={14} /> Connect provider</Button>
        </div>

        {setupOpen && (
          <Card className="mb-3">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Provider">
                <select value={form.provider} onChange={(e) => setForm((f) => ({ ...f, provider: e.target.value }))} className="w-full text-base bg-surface border border-[#d6dbe2] rounded-[8px] px-[11px] py-2 min-h-[38px]">
                  {PROVIDERS.map((p) => <option key={p}>{p}</option>)}
                </select>
              </Field>
              <Field label="Label"><Input value={form.label} onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))} placeholder="e.g. Production key" /></Field>
              <Field label="Endpoint"><Input value={form.endpoint} onChange={(e) => setForm((f) => ({ ...f, endpoint: e.target.value }))} placeholder="Optional — for custom/self-hosted" /></Field>
              <Field label="Monthly budget ($)"><Input type="number" value={form.budget} onChange={(e) => setForm((f) => ({ ...f, budget: e.target.value }))} /></Field>
              <div className="col-span-2">
                <Field label="API key" hint="Stored masked — only the last 4 characters are kept.">
                  <Input type="password" value={form.key} onChange={(e) => setForm((f) => ({ ...f, key: e.target.value }))} />
                </Field>
              </div>
            </div>
            <div className="flex gap-2 mt-3">
              <Button variant="primary" onClick={save}>Save</Button>
              <Button variant="secondary" onClick={() => setSetupOpen(false)}>Cancel</Button>
            </div>
          </Card>
        )}

        {keys.length === 0 ? (
          <p className="text-sm text-muted">No providers connected yet.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {keys.map((k) => (
              <div key={k.id} className="flex items-center gap-3 bg-surface rounded-lg shadow-card p-3.5">
                <div className="flex-1">
                  <div className="font-semibold text-sm text-text">{k.label || k.provider}</div>
                  <div className="text-2xs text-muted">{k.provider} {k.keyMasked ? `· ${k.keyMasked}` : ''} {k.budget ? `· $${k.budget}/mo` : ''}</div>
                </div>
                <Tag variant={k.active ? 'accent' : 'neutral'}>{k.active ? 'Active' : 'Disabled'}</Tag>
                <button onClick={() => mutations.toggleActive(k.id, !k.active)} className="text-sm text-blue font-semibold hover:underline">
                  {k.active ? 'Disable' : 'Enable'}
                </button>
                <button onClick={() => mutations.remove(k.id)} className="text-red hover:bg-red-light p-1.5 rounded"><Trash2 size={14} /></button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
