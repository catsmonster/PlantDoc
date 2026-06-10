import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { ID, type Models } from 'appwrite';
import { account } from '../../lib/appwrite';
import { AuthContext } from './auth-context';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Models.User<Models.Preferences> | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    account
      .get()
      .then((current) => {
        if (!cancelled) setUser(current);
      })
      .catch(() => {
        // No session — the sign-in screen handles it.
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    await account.createEmailPasswordSession({ email, password });
    setUser(await account.get());
  }, []);

  const signUp = useCallback(
    async (email: string, password: string, name: string) => {
      await account.create({ userId: ID.unique(), email, password, name });
      await signIn(email, password);
    },
    [signIn],
  );

  const signOut = useCallback(async () => {
    await account.deleteSession({ sessionId: 'current' });
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({ user, loading, signIn, signUp, signOut }),
    [user, loading, signIn, signUp, signOut],
  );

  return <AuthContext value={value}>{children}</AuthContext>;
}
