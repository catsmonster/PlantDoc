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
import { useRouter } from './features/router/useRouter';
import { getProfile } from './lib/repo';
import type { Plant, Profile } from './lib/types';
import { FullScreenSpinner } from './ui/Spinner';
import { ThemeProvider } from './features/theme/ThemeContext';

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
  const { route, navigate } = useRouter();
  // Cached when the user opens the edit form from a screen that already holds
  // the loaded plant, so the form can prefill without a second read.
  const [editPlant, setEditPlant] = useState<Plant | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    getProfile(user.$id).then((found) => {
      if (!cancelled) setProfile(found);
    });
    return () => {
      cancelled = true;
    };
  }, [user.$id]);

  // A cold deep-link to /plants/:id/edit has no cached plant to prefill the
  // form, so drop the user on the plant detail screen and clean up the URL.
  const editReady = route.name === 'edit-plant' && editPlant?.$id === route.plantId;
  useEffect(() => {
    if (route.name === 'edit-plant' && editPlant?.$id !== route.plantId) {
      navigate({ name: 'plant', plantId: route.plantId }, { replace: true });
    }
  }, [route, editPlant, navigate]);

  if (profile === undefined) return <FullScreenSpinner />;
  if (profile === null) return <OnboardingScreen onComplete={setProfile} />;

  const detailPlantId =
    route.name === 'plant' || route.name === 'edit-plant' ? route.plantId : null;

  return (
    <div className="relative mx-auto min-h-dvh w-full max-w-md overflow-hidden bg-transparent shadow-2xl">
      <main className="w-full">
        {route.name === 'plants' && (
          <PlantsScreen
            userId={user.$id}
            profile={profile}
            onAdd={() => navigate({ name: 'add-plant' })}
            onSelect={(plant) => navigate({ name: 'plant', plantId: plant.$id })}
            onOpenLocations={() => navigate({ name: 'locations' })}
          />
        )}
        {route.name === 'add-plant' && (
          <PlantForm
            userId={user.$id}
            onSaved={() => navigate({ name: 'plants' })}
            onCancel={() => navigate({ name: 'plants' })}
          />
        )}
        {route.name === 'edit-plant' && editReady && editPlant && (
          <PlantForm
            userId={user.$id}
            plant={editPlant}
            onSaved={(plant) => navigate({ name: 'plant', plantId: plant.$id })}
            onCancel={() => navigate({ name: 'plant', plantId: editPlant.$id })}
          />
        )}
        {route.name === 'locations' && (
          <LocationsScreen userId={user.$id} onBack={() => navigate({ name: 'plants' })} />
        )}
        {detailPlantId && !editReady && (
          <PlantScreen
            plantId={detailPlantId}
            userId={user.$id}
            profile={profile}
            onEdit={(plant) => {
              setEditPlant(plant);
              navigate({ name: 'edit-plant', plantId: plant.$id });
            }}
            onBack={() => navigate({ name: 'plants' })}
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

