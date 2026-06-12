import { useEffect, useState } from 'react';
import type { Models } from 'appwrite';
import { AuthProvider } from './features/auth/AuthContext';
import { useAuth } from './features/auth/auth-context';
import { SignInScreen } from './features/auth/SignInScreen';
import { LocationsScreen } from './features/locations/LocationsScreen';
import { OnboardingScreen } from './features/onboarding/OnboardingScreen';
import { PlantForm } from './features/plants/PlantForm';
import { PlantsScreen } from './features/plants/PlantsScreen';
import { PlantScreen } from './features/timeline/PlantScreen';
import { getProfile } from './lib/repo';
import type { Plant, Profile } from './lib/types';
import { FullScreenSpinner } from './ui/Spinner';
import { ThemeProvider } from './features/theme/ThemeContext';

type View =
  | { name: 'plants' }
  | { name: 'add-plant' }
  | { name: 'edit-plant'; plant: Plant }
  | { name: 'plant'; plantId: string }
  | { name: 'locations' };

function Gate() {
  const { user, loading } = useAuth();
  if (loading) return <FullScreenSpinner />;
  if (!user) return <SignInScreen />;
  // Keyed by user so profile state resets cleanly across sign-out/sign-in.
  return <SignedIn key={user.$id} user={user} />;
}

function SignedIn({ user }: { user: Models.User<Models.Preferences> }) {
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
    <div className="relative mx-auto min-h-dvh w-full max-w-md overflow-hidden bg-transparent shadow-2xl">
      <main className="w-full">
        {view.name === 'plants' && (
          <PlantsScreen
            userId={user.$id}
            profile={profile}
            onAdd={() => setView({ name: 'add-plant' })}
            onSelect={(plant) => setView({ name: 'plant', plantId: plant.$id })}
            onOpenLocations={() => setView({ name: 'locations' })}
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
        {view.name === 'locations' && (
          <LocationsScreen userId={user.$id} onBack={() => setView({ name: 'plants' })} />
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
    <ThemeProvider>
      <AuthProvider>
        <Gate />
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;

