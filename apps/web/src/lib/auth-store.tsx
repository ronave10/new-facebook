"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ROLE_PERMISSIONS, type OrgRole, type Permission } from "@campaignos/shared";
import { api, clearTokens, setTokens } from "./api";

interface Session {
  user: { id: string; email: string; name: string };
  organizationId: string;
  organizationName: string;
  role: OrgRole;
}

interface AuthContextValue {
  session: Session | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (b: { email: string; password: string; name: string; organizationName: string }) => Promise<void>;
  logout: () => void;
  hasPermission: (p: Permission) => boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);
const SESSION_KEY = "campaignos.session";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const raw = localStorage.getItem(SESSION_KEY);
    if (raw) {
      try {
        setSession(JSON.parse(raw));
      } catch {
        localStorage.removeItem(SESSION_KEY);
      }
    }
    setLoading(false);
  }, []);

  function persist(s: Session) {
    localStorage.setItem(SESSION_KEY, JSON.stringify(s));
    setSession(s);
  }

  async function login(email: string, password: string) {
    const res = await api.login({ email, password });
    setTokens(res.accessToken, res.refreshToken);
    persist({
      user: res.user,
      organizationId: res.organizationId,
      organizationName: res.organizationName,
      role: res.role,
    });
  }

  async function register(b: { email: string; password: string; name: string; organizationName: string }) {
    const res = await api.register(b);
    setTokens(res.accessToken, res.refreshToken);
    persist({
      user: res.user,
      organizationId: res.organizationId,
      organizationName: res.organizationName,
      role: res.role,
    });
  }

  function logout() {
    clearTokens();
    localStorage.removeItem(SESSION_KEY);
    setSession(null);
    router.push("/login");
  }

  function hasPermission(p: Permission): boolean {
    if (!session) return false;
    return ROLE_PERMISSIONS[session.role]?.includes(p) ?? false;
  }

  return (
    <AuthContext.Provider value={{ session, loading, login, register, logout, hasPermission }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
