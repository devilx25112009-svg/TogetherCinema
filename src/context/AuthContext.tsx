import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, type User as FirebaseUser } from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';
import {
  auth,
  db,
  handleFirestoreError,
  loginWithEmail,
  logoutFirebase,
  OperationType,
  registerWithEmail,
  sendPasswordReset,
  signInWithGoogle,
  testFirestoreConnection,
} from '../lib/firebase';
import type { PartnerProfile } from '../types/cinema';

interface AuthContextValue {
  user: PartnerProfile | null;
  firebaseUser: FirebaseUser | null;
  isDemoSession: boolean;
  loading: boolean;
  firestoreReady: boolean;
  signInGoogle: () => Promise<void>;
  signInEmail: (email: string, password: string) => Promise<void>;
  registerEmail: (email: string, password: string, displayName: string) => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  enterDemoCoupleMode: (persona?: 'a' | 'b') => void;
  logout: () => Promise<void>;
  refreshPartnerStatus: () => Promise<void>;
  updateDisplayName: (name: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const DEMO_STORAGE_KEY = 'together_cinema_demo_persona';

function buildDemoProfile(persona: 'a' | 'b'): PartnerProfile {
  if (persona === 'b') {
    return {
      uid: 'demo-partner-b',
      displayName: 'Maya',
      email: 'maya@togethercinema.demo',
      partnerId: 'demo-partner-a',
      partnerName: 'Aayush',
      connectionId: 'conn-demo-couple',
      connectionStatus: 'connected',
      partnerOnline: true,
      inviteCode: 'DUET-7721',
      subscriptionTier: 'duet_plus',
      storageUsedBytes: 112_350_000_000,
      storageQuotaBytes: 214_748_364_800,
    };
  }
  return {
    uid: 'demo-partner-a',
    displayName: 'Aayush',
    email: 'aayush@togethercinema.demo',
    partnerId: 'demo-partner-b',
    partnerName: 'Maya',
    connectionId: 'conn-demo-couple',
    connectionStatus: 'connected',
    partnerOnline: true,
    inviteCode: 'DUET-7721',
    subscriptionTier: 'duet_plus',
    storageUsedBytes: 112_350_000_000,
    storageQuotaBytes: 214_748_364_800,
  };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [user, setUser] = useState<PartnerProfile | null>(() => {
    const saved = localStorage.getItem(DEMO_STORAGE_KEY);
    return saved === 'b' ? buildDemoProfile('b') : saved === 'none' ? null : buildDemoProfile('a');
  });
  const [isDemoSession, setIsDemoSession] = useState<boolean>(() => {
    return localStorage.getItem(DEMO_STORAGE_KEY) !== 'none';
  });
  const [loading, setLoading] = useState(true);
  const [firestoreReady, setFirestoreReady] = useState(false);

  const syncPartnerFromServer = useCallback(async (profile: PartnerProfile): Promise<PartnerProfile> => {
    try {
      const res = await fetch('/api/partners/status', {
        headers: {
          'X-User-Id': profile.uid,
          'X-User-Name': profile.displayName,
        },
      });
      if (!res.ok) return profile;
      const data = (await res.json()) as {
        connected: boolean;
        connection: { partnerId: string; partnerName: string; connectionId: string } | null;
        activeInviteCode: string | null;
      };
      return {
        ...profile,
        partnerId: data.connection?.partnerId,
        partnerName: data.connection?.partnerName,
        connectionId: data.connection?.connectionId,
        connectionStatus: data.connected ? 'connected' : 'disconnected',
        inviteCode: data.activeInviteCode || profile.inviteCode,
      };
    } catch {
      return profile;
    }
  }, []);

  useEffect(() => {
    testFirestoreConnection().then(setFirestoreReady);

    const unsub = onAuthStateChanged(auth, async (fbUser) => {
      setFirebaseUser(fbUser);
      if (fbUser) {
        localStorage.setItem(DEMO_STORAGE_KEY, 'none');
        setIsDemoSession(false);
        const now = new Date().toISOString();
        const displayName = fbUser.displayName || fbUser.email?.split('@')[0] || 'Cinema Lover';

        // Sync public profile & isolated private PII in Firestore
        try {
          await setDoc(
            doc(db, 'users', fbUser.uid),
            {
              uid: fbUser.uid,
              displayName,
              avatarUrl: fbUser.photoURL || '',
              subscriptionTier: 'free',
              storageUsedBytes: 0,
              createdAt: now,
              updatedAt: now,
            },
            { merge: true }
          );
          if (fbUser.email) {
            await setDoc(
              doc(db, 'users', fbUser.uid, 'private', 'info'),
              {
                uid: fbUser.uid,
                email: fbUser.email,
                updatedAt: now,
              },
              { merge: true }
            );
          }
        } catch (err) {
          handleFirestoreError(err, OperationType.WRITE, `users/${fbUser.uid}`);
        }

        const baseProfile: PartnerProfile = {
          uid: fbUser.uid,
          displayName,
          email: fbUser.email || undefined,
          avatarUrl: fbUser.photoURL || undefined,
          connectionStatus: 'disconnected',
          subscriptionTier: 'free',
          storageUsedBytes: 0,
          storageQuotaBytes: 214_748_364_800,
        };
        const hydrated = await syncPartnerFromServer(baseProfile);
        setUser(hydrated);
      } else {
        const saved = localStorage.getItem(DEMO_STORAGE_KEY);
        if (saved !== 'none') {
          const demo = buildDemoProfile(saved === 'b' ? 'b' : 'a');
          const hydrated = await syncPartnerFromServer(demo);
          setUser(hydrated);
          setIsDemoSession(true);
        } else {
          setUser(null);
          setIsDemoSession(false);
        }
      }
      setLoading(false);
    });

    return () => unsub();
  }, [syncPartnerFromServer]);

  const refreshPartnerStatus = useCallback(async () => {
    if (!user) return;
    const hydrated = await syncPartnerFromServer(user);
    setUser(hydrated);
  }, [user, syncPartnerFromServer]);

  const signInGoogle = async () => {
    await signInWithGoogle();
  };

  const signInEmail = async (email: string, password: string) => {
    await loginWithEmail(email, password);
  };

  const registerEmail = async (email: string, password: string, displayName: string) => {
    await registerWithEmail(email, password, displayName);
  };

  const resetPassword = async (email: string) => {
    await sendPasswordReset(email);
  };

  const enterDemoCoupleMode = (persona: 'a' | 'b' = 'a') => {
    localStorage.setItem(DEMO_STORAGE_KEY, persona);
    const demo = buildDemoProfile(persona);
    setIsDemoSession(true);
    setUser(demo);
    syncPartnerFromServer(demo).then(setUser);
  };

  const logout = async () => {
    localStorage.setItem(DEMO_STORAGE_KEY, 'none');
    setIsDemoSession(false);
    if (firebaseUser) {
      await logoutFirebase();
    }
    setUser(null);
  };

  const updateDisplayName = async (name: string) => {
    if (!user || !name.trim()) return;
    const clean = name.trim().slice(0, 80);
    setUser({ ...user, displayName: clean });
    if (firebaseUser) {
      try {
        await setDoc(
          doc(db, 'users', firebaseUser.uid),
          {
            uid: firebaseUser.uid,
            displayName: clean,
            updatedAt: new Date().toISOString(),
          },
          { merge: true }
        );
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `users/${firebaseUser.uid}`);
      }
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        firebaseUser,
        isDemoSession,
        loading,
        firestoreReady,
        signInGoogle,
        signInEmail,
        registerEmail,
        resetPassword,
        enterDemoCoupleMode,
        logout,
        refreshPartnerStatus,
        updateDisplayName,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
