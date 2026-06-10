import { useEffect, useState } from 'react';
import type { Models } from 'appwrite';
import { AuthProvider } from './features/auth/AuthContext';
import { useAuth } from './features/auth/auth-context';
import { SignInScreen } from './features/auth/SignInScreen';
import { OnboardingScreen } from './features/onboarding/OnboardingScreen';
import { getProfile } from './lib/repo';
import type { Profile } from './lib/types';
import { Button } from './ui/Button';
import { FullScreenSpinner } from './ui/Spinner';

function Gate() {
  const { user, loading } = useAuth();
  if (loading) return <FullScreenSpinner />;
  if (!user) return <SignInScreen />;
  // Keyed by user so profile state resets cleanly across sign-out/sign-in.
  return <SignedIn key={user.$id} user={user} />;
}

function SignedIn({ user }: { user: Models.User<Models.Preferences> }) {
  const { signOut } = useAuth();
  // undefined = still loading; null = no profile yet (needs onboarding).
  const [profile, setProfile] = useState<Profile | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    getProfile(user.$id).then((found) => {
      if (!cancelled) setProfile(found);
    });
    return () => {
      cancelled = true;
    };
  }, [user.$id]);

  if (profile === undefined) return <FullScreenSpinner />;
  if (profile === null) return <OnboardingScreen onComplete={setProfile} />;

  return (
    <div className="min-h-dvh bg-leaf-50">
      <header className="flex items-center justify-between bg-leaf-700 px-4 py-5 text-white">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">PlantDoc</h1>
          <p className="mt-0.5 text-sm text-leaf-100">
            Hi {profile.display_name ?? 'there'} — your plants live here soon.
          </p>
        </div>
        <Button variant="ghost" className="text-leaf-100" onClick={() => void signOut()}>
          Sign out
        </Button>
      </header>
    </div>
  );
}

function App() {
  return (
    <AuthProvider>
      <Gate />
    </AuthProvider>
  );
}

export default App;
