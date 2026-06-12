import { useState, type FormEvent } from 'react';
import { errorMessage } from '../../lib/error';
import { ErrorText } from '../../ui/Field';
import { useAuth } from './auth-context';
import { useTheme } from '../theme/ThemeContext';
import { Icon } from '../../ui/Icon';

export function SignInScreen() {
  const { signIn, signUp } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [mode, setMode] = useState<'sign-in' | 'sign-up'>('sign-in');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const isDark = theme === 'dark';
  const isSignUp = mode === 'sign-up';

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (isSignUp) {
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

  if (isDark) {
    // Direction B — Atlas (Dark Mode)
    return (
      <div className="b-root relative min-h-dvh overflow-hidden bg-[#0E140F]">
        <div className="b-scroll">
          {/* Theme Toggle */}
          <div style={{ position: 'absolute', top: 56, right: 18 }}>
            <button
              type="button"
              className="b-tap"
              onClick={toggleTheme}
              aria-label="Switch to light mode"
              style={{
                width: 38,
                height: 38,
                borderRadius: 99,
                cursor: 'pointer',
                background: 'transparent',
                border: '1px solid rgba(255,255,255,.09)',
                color: '#F2F6EF',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Icon name="sun" size={17} stroke={1.9} />
            </button>
          </div>

          <form
            onSubmit={handleSubmit}
            className="flex min-h-dvh flex-col justify-center px-6 py-10"
            style={{ boxSizing: 'border-box' }}
          >
            {/* Header */}
            <div className="b-rise" style={{ marginBottom: 26 }}>
              <span
                style={{
                  width: 60,
                  height: 60,
                  borderRadius: 18,
                  background: '#C7F24A',
                  color: '#0E140F',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Icon name="leaf" size={30} stroke={2} />
              </span>
              <h1
                style={{
                  margin: '18px 0 0',
                  fontSize: 44,
                  fontWeight: 700,
                  letterSpacing: '-.03em',
                  lineHeight: 0.95,
                  color: '#F2F6EF',
                }}
              >
                PlantDoc
              </h1>
              <p
                className="mono"
                style={{
                  margin: '10px 0 0',
                  fontSize: 12,
                  color: '#9BAA98',
                  letterSpacing: '.04em',
                  lineHeight: 1.6,
                }}
              >
                TRACK HOUSEPLANT CARE, HEALTH,
                <br />
                AND WHAT ACTUALLY WORKS.
              </p>
              <div
                className="b-underline"
                style={{
                  height: 3,
                  width: 56,
                  background: '#C7F24A',
                  marginTop: 18,
                  borderRadius: 9,
                }}
              ></div>
            </div>

            {/* Inputs & Buttons */}
            <div className="b-rise space-y-4" style={{ animationDelay: '70ms' }}>
              <h2 style={{ margin: 0, fontSize: 19, fontWeight: 700, color: '#F2F6EF' }}>
                {isSignUp ? 'Create your account' : 'Welcome back'}
              </h2>

              {isSignUp && (
                <label style={{ display: 'block' }}>
                  <span className="b-kicker" style={{ display: 'block', marginBottom: 8 }}>
                    Name
                  </span>
                  <input
                    className="b-input"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Sam Rivera"
                    autoComplete="name"
                    required
                    disabled={busy}
                  />
                </label>
              )}

              <label style={{ display: 'block' }}>
                <span className="b-kicker" style={{ display: 'block', marginBottom: 8 }}>
                  Email
                </span>
                <input
                  className="b-input"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  autoComplete="email"
                  required
                  disabled={busy}
                />
              </label>

              <label style={{ display: 'block' }}>
                <span className="b-kicker" style={{ display: 'block', marginBottom: 8 }}>
                  Password
                </span>
                <input
                  className="b-input"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete={isSignUp ? 'new-password' : 'current-password'}
                  minLength={8}
                  required
                  disabled={busy}
                />
              </label>

              <ErrorText>{error}</ErrorText>

              <button
                type="submit"
                className="b-tap"
                disabled={busy}
                style={{
                  width: '100%',
                  borderRadius: 15,
                  border: 'none',
                  background: '#C7F24A',
                  color: '#0E140F',
                  padding: '15px 0',
                  fontFamily: "'Space Grotesk',sans-serif",
                  fontWeight: 700,
                  fontSize: 15.5,
                  cursor: busy ? 'default' : 'pointer',
                }}
              >
                {busy ? 'Please wait…' : isSignUp ? 'Create account' : 'Sign in'}
              </button>

              <button
                type="button"
                onClick={() => {
                  setMode(isSignUp ? 'sign-in' : 'sign-up');
                  setError(null);
                }}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#C7F24A',
                  fontFamily: "'Space Grotesk',sans-serif",
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: 'pointer',
                  padding: 4,
                  width: '100%',
                  textAlign: 'center',
                }}
              >
                {isSignUp ? 'Already have an account? Sign in' : 'New here? Create an account'}
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  // Direction A — Greenhouse (Light Mode)
  return (
    <div className="a-root relative min-h-dvh overflow-hidden bg-[#F4EFE4]">
      <div className="a-scroll">
        {/* Theme Toggle */}
        <div style={{ position: 'absolute', top: 54, right: 18 }}>
          <button
            type="button"
            className="a-tap"
            onClick={toggleTheme}
            aria-label="Switch to dark mode"
            style={{
              width: 42,
              height: 42,
              borderRadius: 99,
              cursor: 'pointer',
              background: '#FFFDF8',
              border: '1px solid #E7E0D2',
              color: '#23302A',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Icon name="moon" size={18} stroke={2} />
          </button>
        </div>

        <form
          onSubmit={handleSubmit}
          className="flex min-h-dvh flex-col justify-center px-6 py-10"
          style={{ boxSizing: 'border-box' }}
        >
          {/* Header */}
          <div className="a-rise" style={{ textAlign: 'center', marginBottom: 22 }}>
            <span
              style={{
                width: 64,
                height: 64,
                borderRadius: 22,
                background: 'linear-gradient(135deg, #2F5934, #3C7140)',
                color: '#fff',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 12px 28px -10px rgba(60,113,64,.6)',
              }}
            >
              <Icon name="leaf" size={32} stroke={1.9} />
            </span>
            <h1
              className="serif"
              style={{
                margin: '16px 0 0',
                fontSize: 38,
                fontWeight: 600,
                letterSpacing: '-.02em',
                color: '#23302A',
              }}
            >
              PlantDoc
            </h1>
            <p
              style={{
                margin: '6px 0 0',
                fontSize: 14.5,
                color: '#6B7568',
                lineHeight: 1.5,
              }}
            >
              Track houseplant care, health,
              <br />
              and what actually works.
            </p>
          </div>

          {/* Form Card */}
          <div
            className="a-card a-rise space-y-4"
            style={{ animationDelay: '70ms', borderRadius: 24, padding: 20 }}
          >
            <h2
              className="serif"
              style={{ margin: 0, fontSize: 21, fontWeight: 600, color: '#23302A' }}
            >
              {isSignUp ? 'Create your account' : 'Welcome back'}
            </h2>

            {isSignUp && (
              <label style={{ display: 'block' }}>
                <span style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#6B7568', marginBottom: 7 }}>
                  Name
                </span>
                <input
                  className="a-input"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Sam Rivera"
                  autoComplete="name"
                  required
                  disabled={busy}
                />
              </label>
            )}

            <label style={{ display: 'block' }}>
              <span style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#6B7568', marginBottom: 7 }}>
                Email
              </span>
              <input
                className="a-input"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
                required
                disabled={busy}
              />
            </label>

            <label style={{ display: 'block' }}>
              <span style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#6B7568', marginBottom: 7 }}>
                Password
              </span>
              <input
                className="a-input"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete={isSignUp ? 'new-password' : 'current-password'}
                minLength={8}
                required
                disabled={busy}
              />
            </label>

            <ErrorText>{error}</ErrorText>

            <button
              type="submit"
              className="a-tap"
              disabled={busy}
              style={{
                width: '100%',
                borderRadius: 16,
                border: 'none',
                background: '#3C7140',
                color: '#fff',
                padding: '15px 0',
                fontFamily: 'inherit',
                fontWeight: 700,
                fontSize: 15.5,
                cursor: busy ? 'default' : 'pointer',
                boxShadow: '0 10px 22px -10px rgba(60,113,64,.7)',
              }}
            >
              {busy ? 'Please wait…' : isSignUp ? 'Create account' : 'Sign in'}
            </button>

            <button
              type="button"
              onClick={() => {
                setMode(isSignUp ? 'sign-in' : 'sign-up');
                setError(null);
              }}
              style={{
                background: 'none',
                border: 'none',
                color: '#3C7140',
                fontFamily: 'inherit',
                fontSize: 14,
                fontWeight: 600,
                cursor: 'pointer',
                padding: 4,
                width: '100%',
                textAlign: 'center',
              }}
            >
              {isSignUp ? 'Already have an account? Sign in' : 'New here? Create an account'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
