import { useState, type FormEvent } from 'react';
import { errorMessage } from '../../lib/error';
import { Button } from '../../ui/Button';
import { ErrorText, TextField } from '../../ui/Field';
import { useAuth } from './auth-context';

export function SignInScreen() {
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState<'sign-in' | 'sign-up'>('sign-in');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (mode === 'sign-up') {
        await signUp(email, password, name.trim());
      } else {
        await signIn(email, password);
      }
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-dvh flex-col bg-leaf-50">
      <header className="bg-leaf-700 px-4 py-8 text-white">
        <h1 className="text-2xl font-semibold tracking-tight">PlantDoc</h1>
        <p className="mt-1 text-sm text-leaf-100">
          Track houseplant care, health, and what actually works.
        </p>
      </header>
      <main className="mx-auto w-full max-w-md flex-1 px-4 py-8">
        <form
          onSubmit={handleSubmit}
          className="space-y-4 rounded-xl border border-leaf-100 bg-white p-5 shadow-sm"
        >
          <h2 className="text-lg font-semibold text-slate-800">
            {mode === 'sign-in' ? 'Welcome back' : 'Create your account'}
          </h2>
          {mode === 'sign-up' && (
            <TextField
              label="Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="name"
              required
            />
          )}
          <TextField
            label="Email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            required
          />
          <TextField
            label="Password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={mode === 'sign-up' ? 'new-password' : 'current-password'}
            minLength={8}
            required
          />
          <ErrorText>{error}</ErrorText>
          <Button type="submit" disabled={busy} className="w-full">
            {busy ? 'Please wait…' : mode === 'sign-in' ? 'Sign in' : 'Sign up'}
          </Button>
          <button
            type="button"
            className="w-full text-center text-sm text-leaf-600 hover:underline"
            onClick={() => {
              setMode(mode === 'sign-in' ? 'sign-up' : 'sign-in');
              setError(null);
            }}
          >
            {mode === 'sign-in'
              ? 'New here? Create an account'
              : 'Already have an account? Sign in'}
          </button>
        </form>
      </main>
    </div>
  );
}
