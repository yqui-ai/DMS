import { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Wand2 } from 'lucide-react';
import { Dialog } from '../../components/Dialog';
import { Button } from '../../components/Button';
import { Field } from '../../components/Field';
import { Card } from '../../components/Card';
import { useToast } from '../../components/Toast';
import { useMigrationObjects } from '../../lib/queries/scope';
import { useDefaultProgram, useProjects, useSubprojects } from '../../lib/queries/programme';
import { supabase } from '../../lib/supabase';
import { useQueryClient } from '@tanstack/react-query';

/** Turns a plain-language description into a rule expression. Deterministic keyword-matching,
 * not a real LLM call — matches this tool's mocked behavior in the source prototype. */
function generateExpression(description: string): string {
  const d = description.toLowerCase();
  const parts: string[] = [];
  const lenMatch = /(\d+)\s*characters?/.exec(d);
  const fieldMatch = /\b([A-Z][A-Z0-9_]{2,})\b/.exec(description);
  const field = fieldMatch?.[1] ?? 'FIELD';
  if (lenMatch) parts.push(`LENGTH(${field}) == ${lenMatch[1]}`);
  if (d.includes('numeric')) parts.push(`IS_NUMERIC(${field})`);
  if (d.includes('not null') || d.includes('mandatory') || d.includes('required')) parts.push(`${field} IS NOT NULL`);
  if (d.includes('leading zero')) parts.push(`NOT STARTS_WITH_STRIPPED_ZERO(${field})`);
  if (d.includes('unique')) parts.push(`IS_UNIQUE(${field})`);
  return parts.length ? parts.join(' AND ') : `-- describe the check to generate an expression for ${field}`;
}

export function RuleGeneratorDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const { subprojectId: paramSubprojectId } = useParams();
  const { data: program } = useDefaultProgram();
  const { data: projects = [] } = useProjects(program?.id);
  const projectIds = useMemo(() => projects.map((r) => r.id), [projects]);
  const { data: subprojects = [] } = useSubprojects(projectIds);
  const { data: objects = [] } = useMigrationObjects();

  const [subprojectId, setSubprojectId] = useState('');
  const [objectId, setObjectId] = useState('');
  const [scope, setScope] = useState<'Local' | 'Global'>('Local');
  const [description, setDescription] = useState('');
  const [expression, setExpression] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const effectiveSubprojectId = paramSubprojectId ?? subprojectId ?? subprojects[0]?.id;
  const targetObjects = objects.filter((o) => o.category === 'Master data').slice(0, 30);

  const generate = () => setExpression(generateExpression(description));

  const save = async () => {
    if (!expression || !effectiveSubprojectId) { toast.error('Generate a rule and pick a subproject first.'); return; }
    setBusy(true);
    try {
      const obj = objects.find((o) => o.id === objectId);
      const code = `GEN-${Math.floor(1000 + Math.random() * 9000)}`;
      const { error } = await supabase.from('rules').insert({
        subproject_id: effectiveSubprojectId, code, name: description.slice(0, 60) || 'Generated rule',
        migration_object_id: objectId || null, type: 'Validation', severity: 'Medium', status: 'Draft',
        expression, version: 'v1.0.0',
      });
      if (error) throw error;
      await queryClient.invalidateQueries({ queryKey: ['rules', effectiveSubprojectId] });
      await queryClient.invalidateQueries({ queryKey: ['rules-all'] });
      toast.success(`Rule ${code} saved to catalog${obj ? ` for ${obj.objectId}` : ''}.`);
      setDescription(''); setExpression(null); setObjectId('');
      onClose();
    } catch (err: any) {
      toast.error(err.message ?? 'Could not save rule.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} title="Rule Generator" size="md" footer={
      <>
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button variant="primary" onClick={save} disabled={!expression || busy}>{busy ? 'Saving…' : 'Save to Catalog'}</Button>
      </>
    }>
      <p className="text-sm text-muted mb-4">Describe the check in plain language and generate a data quality rule.</p>
      <div className="flex flex-col gap-3.5">
        {!paramSubprojectId && (
          <Field label="Subproject">
            <select value={subprojectId} onChange={(e) => setSubprojectId(e.target.value)} className="w-full text-base bg-surface border border-[#d6dbe2] rounded-[8px] px-[11px] py-2 min-h-[38px]">
              <option value="">Select a subproject…</option>
              {subprojects.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
          </Field>
        )}
        <Field label="Applies to">
          <select value={objectId} onChange={(e) => setObjectId(e.target.value)} className="w-full text-base bg-surface border border-[#d6dbe2] rounded-[8px] px-[11px] py-2 min-h-[38px]">
            <option value="">Select an object…</option>
            {targetObjects.map((o) => <option key={o.id} value={o.id}>{o.objectId} — {o.description}</option>)}
          </select>
        </Field>
        <Field label="Rule scope">
          <select value={scope} onChange={(e) => setScope(e.target.value as 'Local' | 'Global')} className="w-full text-base bg-surface border border-[#d6dbe2] rounded-[8px] px-[11px] py-2 min-h-[38px]">
            <option value="Local">Local (this program)</option>
            <option value="Global">Global (all programs)</option>
          </select>
        </Field>
        <Field label="Describe the check">
          <textarea
            value={description} onChange={(e) => setDescription(e.target.value)} rows={3}
            placeholder="e.g. MATNR must be 18 characters, numeric, no leading zeros stripped"
            className="w-full text-base bg-surface border border-[#d6dbe2] rounded-[8px] px-[11px] py-2 resize-y"
          />
        </Field>
        <Button variant="primary" onClick={generate} className="self-start"><Wand2 size={14} /> Generate Rule</Button>
        {expression && (
          <Card className="bg-surface-2">
            <div className="text-2xs font-bold uppercase tracking-[.04em] text-muted mb-1.5">Generated rule preview</div>
            <div className="font-mono text-sm2">{expression}</div>
          </Card>
        )}
      </div>
    </Dialog>
  );
}
