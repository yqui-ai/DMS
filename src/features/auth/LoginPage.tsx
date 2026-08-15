import { useState, type FormEvent } from 'react';
import { supabase } from '../../lib/supabase';
import { Card } from '../../components/Card';
import { Field, Input } from '../../components/Field';
import { Button } from '../../components/Button';

export function LoginPage() {
  const [mode, setMode] = useState<'sign-in' | 'sign-up'>('sign-in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error: authError } =
      mode === 'sign-in'
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({ email, password });
    setBusy(false);
    if (authError) setError(authError.message);
  };

  return (
    <div className="min-h-screen w-screen grid place-items-center bg-bg">
      <Card className="w-[380px]">
        <h1 className="text-2xl font-bold text-text mb-1">Data Migration Solution</h1>
        <p className="text-sm text-muted mb-5">{mode === 'sign-in' ? 'Sign in to continue.' : 'Create an account.'}</p>
        <form onSubmit={submit} className="flex flex-col gap-3.5">
          <Field label="Email" htmlFor="login-email">
            <Input id="login-email" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <Field label="Password" htmlFor="login-password">
            <Input
              id="login-password" type="password" required
              autoComplete={mode === 'sign-in' ? 'current-password' : 'new-password'}
              value={password} onChange={(e) => setPassword(e.target.value)}
            />
          </Field>
          {error && <p className="text-xs text-red">{error}</p>}
          <Button type="submit" variant="primary" disabled={busy} className="justify-center mt-1">
            {busy ? 'Please wait…' : mode === 'sign-in' ? 'Sign in' : 'Create account'}
          </Button>
        </form>
        <button
          onClick={() => setMode((m) => (m === 'sign-in' ? 'sign-up' : 'sign-in'))}
          className="text-sm text-blue font-semibold mt-4 hover:underline"
        >
          {mode === 'sign-in' ? "Don't have an account? Sign up" : 'Already have an account? Sign in'}
        </button>
      </Card>
    </div>
  );
}
