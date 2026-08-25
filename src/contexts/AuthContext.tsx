import React, { createContext, useContext, useEffect, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "../lib/supabaseClient";

// Same convention as services/auth_service.py's EMAIL_DOMAIN — usernames
// map to a placeholder email under the hood, but the UI only ever asks
// for a username. IMPORTANT: this does NOT lowercase, matching the fix
// applied to auth_service.py (case must match exactly what an account
// was created with).
const EMAIL_DOMAIN = "evolspace.local";
function emailFor(username: string): string {
  return `${username.trim()}@${EMAIL_DOMAIN}`;
}

export type AppUser = { id: string; username: string };

interface AuthContextValue {
  user: AppUser | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<{ ok: boolean; message: string }>;
  signup: (username: string, password: string) => Promise<{ ok: boolean; message: string }>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function toAppUser(u: User | null | undefined): AppUser | null {
  if (!u) return null;
  return { id: u.id, username: (u.user_metadata?.username as string) || "" };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // On mount: pick up whatever session supabase-js already restored
    // from localStorage (equivalent to the Python side's restore_session).
    supabase.auth.getSession().then(({ data: { session } }: { data: { session: Session | null } }) => {
      setUser(toAppUser(session?.user));
      setLoading(false);
    });

    // Keep in sync with login/logout/token-refresh events anywhere in the app.
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(toAppUser(session?.user));
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  async function login(username: string, password: string) {
    const { error } = await supabase.auth.signInWithPassword({
      email: emailFor(username),
      password,
    });
    if (error) return { ok: false, message: "Wrong username or password." };
    return { ok: true, message: "Welcome back!" };
  }

  async function signup(username: string, password: string) {
    if (!username.trim() || !password) return { ok: false, message: "Username and password are required." };
    if (password.length < 6) return { ok: false, message: "Password must be at least 6 characters." };

    const { data, error } = await supabase.auth.signUp({
      email: emailFor(username),
      password,
      options: { data: { username: username.trim() } },
    });
    if (error) {
      const msg = error.message.toLowerCase();
      if (msg.includes("already registered") || msg.includes("already exists")) {
        return { ok: false, message: "That username is already taken." };
      }
      return { ok: false, message: `Couldn't create account: ${error.message}` };
    }
    if (!data.user) return { ok: false, message: "Couldn't create account." };
    return { ok: true, message: "Account created — you can log in now." };
  }

  async function logout() {
    await supabase.auth.signOut();
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, signup, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
