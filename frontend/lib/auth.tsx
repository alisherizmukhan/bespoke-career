"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { api, getToken, setToken } from "./api";

export type User = {
  id: string;
  email: string;
  role: "user" | "admin";
  full_name: string;
  email_verified: boolean;
  onboarding_completed: boolean;
  profile_type: string | null;
};

type Ctx = {
  user: User | null;
  loading: boolean;
  signIn: (token: string, user: User) => void;
  signOut: () => void;
  refresh: () => Promise<void>;
};

const AuthCtx = createContext<Ctx>({ user: null, loading: true, signIn: () => {}, signOut: () => {}, refresh: async () => {} });

export function Providers({ children }: { children: React.ReactNode }) {
  const [qc] = useState(() => new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: false } } }));
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!getToken()) {
      setUser(null);
      setLoading(false);
      return;
    }
    try {
      setUser(await api<User>("/auth/me"));
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const signIn = (token: string, u: User) => {
    setToken(token);
    setUser(u);
    qc.clear();
  };
  const signOut = () => {
    api("/auth/logout", { method: "POST" }).catch(() => {});
    setToken(null);
    setUser(null);
    qc.clear();
    window.location.href = "/";
  };

  return (
    <QueryClientProvider client={qc}>
      <AuthCtx.Provider value={{ user, loading, signIn, signOut, refresh }}>{children}</AuthCtx.Provider>
    </QueryClientProvider>
  );
}

export const useAuth = () => useContext(AuthCtx);
