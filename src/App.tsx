import { useEffect, useState } from 'react';
import type { Models } from 'appwrite';
import { AuthProvider } from './features/auth/AuthContext';
import { useAuth } from './features/auth/auth-context';
import { SignInScreen } from './features/auth/SignInScreen';
import { OnboardingScreen } from './features/onboarding/OnboardingScreen';
import { PlantForm } from './features/plants/PlantForm';
import { PlantsScreen } from './features/plants/PlantsScreen';
import { PlantScreen } from './features/timeline/PlantScreen';
import { getProfile } from './lib/repo';
import type { Plant, Profile } from './lib/types';
import { Button } from './ui/Button';
import { FullScreenSpinner } from './ui/Spinner';

type View =
  | { name: 'plants' }
  | { name: 'add-plant' }
  | { name: 'edit-plant'; plant: Plant }
  | { name: 'plant'; plantId: string };

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
  const [view, setView] = useState<View>({ name: 'plants' });

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
      <header className="flex items-center justify-between bg-leaf-700 px-4 py-4 text-white">
        <button
          type="button"
          className="text-left"
          onClick={() => setView({ name: 'plants' })}
        >
          <h1 className="text-xl font-semibold tracking-tight">PlantDoc</h1>
          <p className="mt-0.5 text-sm text-leaf-100">
            Hi {profile.display_name ?? 'there'}
          </p>
        </button>
        <Button variant="ghost" className="text-leaf-100" onClick={() => void signOut()}>
          Sign out
        </Button>
      </header>
      <main className="mx-auto w-full max-w-md px-4 pb-12">
        {view.name === 'plants' && (
          <PlantsScreen
            userId={user.$id}
            onAdd={() => setView({ name: 'add-plant' })}
            onSelect={(plant) => setView({ name: 'plant', plantId: plant.$id })}
          />
        )}
        {(view.name === 'add-plant' || view.name === 'edit-plant') && (
          <PlantForm
            userId={user.$id}
            plant={view.name === 'edit-plant' ? view.plant : undefined}
            onSaved={(plant) =>
              setView(
                view.name === 'edit-plant'
                  ? { name: 'plant', plantId: plant.$id }
                  : { name: 'plants' },
              )
            }
            onCancel={() =>
              setView(
                view.name === 'edit-plant'
                  ? { name: 'plant', plantId: view.plant.$id }
                  : { name: 'plants' },
              )
            }
          />
        )}
        {view.name === 'plant' && (
          <PlantScreen
            plantId={view.plantId}
            userId={user.$id}
            profile={profile}
            onEdit={(plant) => setView({ name: 'edit-plant', plant })}
            onBack={() => setView({ name: 'plants' })}
          />
        )}
      </main>
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
