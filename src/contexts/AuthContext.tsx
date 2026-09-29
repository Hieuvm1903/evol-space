import React, { createContext, useContext, useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabaseClient";

const EMAIL_DOMAIN = "evolspace.local";
function emailFor(username: string): string {
  return `${username.trim()}@${EMAIL_DOMAIN}`;
}

export type Role = "user" | "admin";
const ROLES: Role[] = ["user", "admin"];

// username = login handle (never shown as a title), name = display name
// (falls back to username when no display name has been set).
export type AppUser = { id: string; username: string; name: string; role: Role };
type Result = { ok: boolean; message: string };

interface AuthContextValue {
  user: AppUser | null;
  isAdmin: boolean;
  loading: boolean;
  login: (username: string, password: string) => Promise<Result>;
  signup: (username: string, password: string, name?: string) => Promise<Result>;
  logout: () => Promise<void>;
  updateName: (newName: string) => Promise<Result>;
  updateUsername: (newUsername: string) => Promise<Result>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<Result>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

// --- JWT helpers -----------------------------------------------------------
// Decoding is for UI only (show/hide things). It does NOT verify the
// signature — real enforcement must happen in RLS / edge functions using
// auth.jwt(), which is what the SQL helper public.jwt_role() does.
function decodeJwtPayload(token: string): Record<string, any> | null {
  try {
    const part = token.split(".")[1];
    const b64 = part.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(part.length / 4) * 4, "=");
    const json = decodeURIComponent(
      atob(b64).split("").map((c) => "%" + c.charCodeAt(0).toString(16).padStart(2, "0")).join(""),
    );
    return JSON.parse(json);
  } catch {
    return null;
  }
}

function roleFromSession(session: Session): Role {
  const raw = decodeJwtPayload(session.access_token)?.app_metadata?.role;
  return ROLES.includes(raw) ? raw : "user";
}

function toAppUser(session: Session | null | undefined): AppUser | null {
  if (!session?.user) return null;
  const meta = session.user.user_metadata ?? {};
  const username = (meta.username as string) || "";
  const name = ((meta.display_name as string) || "").trim() || username;
  return {
    id: session.user.id,
    username,
    name,
    role: roleFromSession(session),
  };
}

function isTakenError(error: { message: string; code?: string }): boolean {
  const msg = error.message.toLowerCase();
  return error.code === "email_exists" || msg.includes("already");
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(toAppUser(session));
      setLoading(false);
    });

    // Fires on login/logout/TOKEN_REFRESHED/USER_UPDATED — so the role
    // and display name re-derive from the new session automatically.
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(toAppUser(session));
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  async function login(username: string, password: string): Promise<Result> {
    const { error } = await supabase.auth.signInWithPassword({ email: emailFor(username), password });
    if (error) return { ok: false, message: "Wrong username or password." };
    return { ok: true, message: "Welcome back!" };
  }

  async function signup(username: string, password: string, name?: string): Promise<Result> {
    if (!username.trim() || !password) return { ok: false, message: "Username and password are required." };
    if (password.length < 6) return { ok: false, message: "Password must be at least 6 characters." };

    const displayName = name?.trim();
    if (displayName && displayName.length > 40) {
      return { ok: false, message: "Name must be 40 characters or fewer." };
    }

    const { data, error } = await supabase.auth.signUp({
      email: emailFor(username),
      password,
      options: {
        data: {
          username: username.trim(),
          ...(displayName ? { display_name: displayName } : {}),
        },
      },
    });
    if (error) {
      if (isTakenError(error)) return { ok: false, message: "That username is already taken." };
      return { ok: false, message: `Couldn't create account: ${error.message}` };
    }
    if (!data.user) return { ok: false, message: "Couldn't create account." };
    return { ok: true, message: "Account created — you can log in now." };
  }

  async function logout() {
    await supabase.auth.signOut();
  }

  // Display name lives in user_metadata only — no email involved, so
  // there's nothing that can lock the user out. An empty string clears it
  // and the UI falls back to the username.
  async function updateName(newName: string): Promise<Result> {
    if (!user) return { ok: false, message: "Not logged in." };
    const name = newName.trim();
    if (name.length > 40) return { ok: false, message: "Name must be 40 characters or fewer." };
    if (name === user.name) return { ok: false, message: "That's already your name." };

    const { error } = await supabase.auth.updateUser({ data: { display_name: name } });
    if (error) return { ok: false, message: `Couldn't update name: ${error.message}` };
    return { ok: true, message: name ? "Name updated." : "Name cleared, showing your username." };
  }

  // Login goes through emailFor(username), so renaming must change the
  // placeholder email too — updating user_metadata alone would lock the
  // user out of logging in with their new name.
  async function updateUsername(newUsername: string): Promise<Result> {
    const username = newUsername.trim();
    if (!user) return { ok: false, message: "Not logged in." };
    if (!username) return { ok: false, message: "Username can't be empty." };
    if (username === user.username) return { ok: false, message: "That's already your username." };

    const targetEmail = emailFor(username);
    const { data, error } = await supabase.auth.updateUser({
      email: targetEmail,
      data: { username },
    });
    if (error) {
      if (isTakenError(error)) return { ok: false, message: "That username is already taken." };
      return { ok: false, message: `Couldn't update username: ${error.message}` };
    }
    // If "Secure email change" is on, Supabase leaves the old email in place
    // and waits for a confirmation click that can never arrive (fake domain).
    if (data.user && data.user.email !== targetEmail) {
      return {
        ok: false,
        message: "Change is pending email confirmation — disable 'Secure email change' in Supabase Auth settings.",
      };
    }
    await supabase.auth.refreshSession(); // pick up a fresh JWT with the new claims
    return { ok: true, message: "Username updated. Use it the next time you log in." };
  }

  async function changePassword(currentPassword: string, newPassword: string): Promise<Result> {
    if (!user) return { ok: false, message: "Not logged in." };
    if (newPassword.length < 6) return { ok: false, message: "Password must be at least 6 characters." };
    if (newPassword === currentPassword) return { ok: false, message: "New password must be different." };

    // Re-authenticate with the current password before allowing the change.
    const { data: { session } } = await supabase.auth.getSession();
    const email = session?.user.email;
    if (!email) return { ok: false, message: "Session expired — please log in again." };
    const { error: reauthError } = await supabase.auth.signInWithPassword({ email, password: currentPassword });
    if (reauthError) return { ok: false, message: "Current password is wrong." };

    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) return { ok: false, message: `Couldn't change password: ${error.message}` };
    return { ok: true, message: "Password changed." };
  }

  return (
    <AuthContext.Provider
      value={{
        user, isAdmin: user?.role === "admin", loading,
        login, signup, logout, updateName, updateUsername, changePassword,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}