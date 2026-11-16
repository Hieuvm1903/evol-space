import { createClient, type Session, type SupabaseClient, type User } from "@supabase/supabase-js";

const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim();
const anonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim();

export const isSupabaseConfigured = Boolean(url && anonKey);

interface LocalUserRecord {
  id: string;
  email: string;
  password: string;
  user_metadata: {
    username: string;
    display_name?: string;
  };
  app_metadata: {
    role: "user" | "admin";
  };
  created_at: string;
}

const LOCAL_USERS_KEY = "evol_local_users";
const LOCAL_SESSION_KEY = "evol_local_session_uid";

function toBase64Url(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let bin = "";
  bytes.forEach((b) => {
    bin += String.fromCharCode(b);
  });
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function buildLocalJwt(record: LocalUserRecord): string {
  const header = toBase64Url(JSON.stringify({ alg: "none", typ: "JWT" }));
  const payload = toBase64Url(
    JSON.stringify({
      sub: record.id,
      email: record.email,
      app_metadata: record.app_metadata,
      user_metadata: record.user_metadata,
      exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30,
    }),
  );
  return `${header}.${payload}.local`;
}

function readLocalUsers(): LocalUserRecord[] {
  try {
    const raw = localStorage.getItem(LOCAL_USERS_KEY);
    if (raw) return JSON.parse(raw) as LocalUserRecord[];
  } catch {
    // ignore storage errors
  }
  const seeded: LocalUserRecord[] = [
    {
      id: "local-evol-demo",
      email: "evol@evolspace.local",
      password: "evolspace",
      user_metadata: { username: "evol", display_name: "EVOL Explorer" },
      app_metadata: { role: "user" },
      created_at: new Date().toISOString(),
    },
  ];
  writeLocalUsers(seeded);
  return seeded;
}

function writeLocalUsers(users: LocalUserRecord[]): void {
  try {
    localStorage.setItem(LOCAL_USERS_KEY, JSON.stringify(users));
  } catch {
    // ignore storage errors
  }
}

function toSession(record: LocalUserRecord): Session {
  const user: User = {
    id: record.id,
    aud: "authenticated",
    role: "authenticated",
    email: record.email,
    created_at: record.created_at,
    app_metadata: record.app_metadata,
    user_metadata: record.user_metadata,
  };
  return {
    access_token: buildLocalJwt(record),
    refresh_token: "local-refresh-token",
    expires_in: 60 * 60 * 24 * 30,
    token_type: "bearer",
    user,
  };
}

function createMockSupabaseClient(): SupabaseClient {
  const notConfiguredError = {
    message: "Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to connect.",
    name: "SupabaseNotConfiguredError",
  };

  type AuthListener = (event: string, session: Session | null) => void;
  const listeners = new Set<AuthListener>();

  const getActiveSession = (): Session | null => {
    try {
      const uid = localStorage.getItem(LOCAL_SESSION_KEY);
      if (!uid) return null;
      const users = readLocalUsers();
      const found = users.find((u) => u.id === uid);
      return found ? toSession(found) : null;
    } catch {
      return null;
    }
  };

  const setActiveSessionId = (uid: string | null) => {
    try {
      if (uid) localStorage.setItem(LOCAL_SESSION_KEY, uid);
      else localStorage.removeItem(LOCAL_SESSION_KEY);
    } catch {
      // ignore storage errors
    }
  };

  const notifyListeners = (event: string, session: Session | null) => {
    listeners.forEach((cb) => {
      try {
        cb(event, session);
      } catch {
        // ignore listener errors
      }
    });
  };

  const makeQueryBuilder = () => {
    let singleMode = false;
    const resolveResult = () => ({
      data: singleMode ? null : [],
      error: singleMode ? notConfiguredError : null,
    });
    const builder: any = new Proxy(
      {},
      {
        get(_target, prop) {
          if (prop === "then") {
            return (onFulfilled: any, onRejected: any) =>
              Promise.resolve(resolveResult()).then(onFulfilled, onRejected);
          }
          if (prop === "single" || prop === "maybeSingle") {
            return () => {
              singleMode = true;
              return builder;
            };
          }
          return () => builder;
        },
      },
    );
    return builder;
  };

  const mockStorageBucket = {
    getPublicUrl: (path: string) => ({ data: { publicUrl: path ? `/${path}` : "" } }),
    upload: async () => ({ data: null, error: notConfiguredError }),
    remove: async () => ({ data: null, error: null }),
    createSignedUrl: async () => ({ data: null, error: notConfiguredError }),
    download: async () => ({ data: null, error: notConfiguredError }),
  };

  const mockClient = {
    auth: {
      getSession: async () => ({ data: { session: getActiveSession() }, error: null }),
      onAuthStateChange: (callback: AuthListener) => {
        listeners.add(callback);
        return {
          data: {
            subscription: {
              unsubscribe: () => {
                listeners.delete(callback);
              },
            },
          },
        };
      },
      signInWithPassword: async ({ email, password }: { email: string; password: string }) => {
        const users = readLocalUsers();
        const found = users.find(
          (u) => u.email.toLowerCase() === email.trim().toLowerCase() && u.password === password,
        );
        if (!found) {
          return {
            data: { user: null, session: null },
            error: { message: "Invalid login credentials" },
          };
        }
        setActiveSessionId(found.id);
        const session = toSession(found);
        notifyListeners("SIGNED_IN", session);
        return { data: { user: session.user, session }, error: null };
      },
      signUp: async ({
        email,
        password,
        options,
      }: {
        email: string;
        password: string;
        options?: { data?: { username?: string; display_name?: string } };
      }) => {
        const users = readLocalUsers();
        const normalizedEmail = email.trim().toLowerCase();
        if (users.some((u) => u.email.toLowerCase() === normalizedEmail)) {
          return {
            data: { user: null, session: null },
            error: { message: "User already registered", code: "email_exists" },
          };
        }
        const record: LocalUserRecord = {
          id: `local-${crypto.randomUUID()}`,
          email: normalizedEmail,
          password,
          user_metadata: {
            username: options?.data?.username || normalizedEmail.split("@")[0],
            ...(options?.data?.display_name ? { display_name: options.data.display_name } : {}),
          },
          app_metadata: { role: "user" },
          created_at: new Date().toISOString(),
        };
        users.push(record);
        writeLocalUsers(users);
        setActiveSessionId(record.id);
        const session = toSession(record);
        notifyListeners("SIGNED_IN", session);
        return { data: { user: session.user, session }, error: null };
      },
      signOut: async () => {
        setActiveSessionId(null);
        notifyListeners("SIGNED_OUT", null);
        return { error: null };
      },
      updateUser: async (attrs: {
        email?: string;
        password?: string;
        data?: { username?: string; display_name?: string };
      }) => {
        const current = getActiveSession();
        if (!current) {
          return { data: { user: null }, error: { message: "Not authenticated" } };
        }
        const users = readLocalUsers();
        const idx = users.findIndex((u) => u.id === current.user.id);
        if (idx === -1) {
          return { data: { user: null }, error: { message: "User not found" } };
        }
        const target = users[idx];
        if (attrs.email) {
          const nextEmail = attrs.email.trim().toLowerCase();
          if (users.some((u) => u.id !== target.id && u.email.toLowerCase() === nextEmail)) {
            return {
              data: { user: null },
              error: { message: "Email already in use", code: "email_exists" },
            };
          }
          target.email = nextEmail;
        }
        if (attrs.password) {
          target.password = attrs.password;
        }
        if (attrs.data) {
          target.user_metadata = { ...target.user_metadata, ...attrs.data };
        }
        users[idx] = target;
        writeLocalUsers(users);
        const nextSession = toSession(target);
        notifyListeners("USER_UPDATED", nextSession);
        return { data: { user: nextSession.user }, error: null };
      },
      refreshSession: async () => {
        const session = getActiveSession();
        notifyListeners("TOKEN_REFRESHED", session);
        return { data: { session, user: session?.user ?? null }, error: null };
      },
    },
    from: () => makeQueryBuilder(),
    storage: {
      from: () => mockStorageBucket,
    },
    functions: {
      invoke: async () => ({ data: null, error: notConfiguredError }),
    },
    rpc: async () => ({ data: null, error: notConfiguredError }),
  };

  return mockClient as unknown as SupabaseClient;
}

if (!isSupabaseConfigured) {
  console.warn(
    "[AI Studio] Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY — running with local auth + offline Supabase stub.",
  );
}

// persistSession + autoRefreshToken (both default true) give us the
// browser-side equivalent of the old "remember me" cookie for free —
// supabase-js stores the session in localStorage and refreshes it
// automatically, no manual cookie/token code needed like the Python side had.
export const supabase: SupabaseClient = isSupabaseConfigured
  ? createClient(url!, anonKey!)
  : createMockSupabaseClient();
