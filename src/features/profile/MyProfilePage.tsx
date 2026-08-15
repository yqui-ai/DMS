import { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';
import { useAuth } from '../../lib/auth';
import { useTheme } from '../../lib/theme';
import { supabase } from '../../lib/supabase';
import { Card } from '../../components/Card';
import { PageHeader } from '../../components/PageHeader';
import { Field, Input } from '../../components/Field';
import { Button } from '../../components/Button';
import { useToast } from '../../components/Toast';

export function MyProfilePage() {
  const { user } = useAuth();
  const { dark, toggle } = useTheme();
  const toast = useToast();
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) return;
    supabase.from('app_users').select('name').eq('id', user.id).maybeSingle().then(({ data }) => {
      setName(data?.name ?? '');
      setLoading(false);
    });
  }, [user]);

  const save = async () => {
    if (!user) return;
    setSaving(true);
    const { error } = await supabase.from('app_users').update({ name }).eq('id', user.id);
    setSaving(false);
    if (error) toast.error(error.message);
    else toast.success('Profile saved.');
  };

  return (
    <div className="max-w-lg">
      <PageHeader title="My Profile" description="Preferences for your account." />
      <Card>
        <div className="flex flex-col gap-4">
          <Field label="Email"><Input value={user?.email ?? ''} disabled /></Field>
          <Field label="Display name">
            <Input value={name} disabled={loading} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Button variant="primary" onClick={save} disabled={saving || loading} className="self-start">
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </Card>

      <Card className="mt-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="font-semibold text-text">Appearance</div>
            <div className="text-sm text-muted">Switch between light and dark theme.</div>
          </div>
          <Button variant="secondary" onClick={toggle}>
            {dark ? <><Sun size={14} /> Light mode</> : <><Moon size={14} /> Dark mode</>}
          </Button>
        </div>
      </Card>
    </div>
  );
}
