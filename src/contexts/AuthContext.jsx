import { createContext, useContext, useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  async function fetchProfile(userId) {
    if (!supabase) return;
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", userId)
        .single();
      if (!error && data) setProfile(data);
      else setProfile(null);
    } catch {
      setProfile(null);
    }
  }

  useEffect(() => {
    if (!supabase) {
      // Dev modu: otomatik giriş yapma, login sayfasını göster.
      // signIn() çağrıldığında kullanıcı set edilecek.
      setLoading(false);
      return;
    }

    let mounted = true;
    // Safety net: never keep global auth loading forever.
    const loadingGuard = setTimeout(() => {
      if (mounted) setLoading(false);
    }, 8000);

    supabase.auth
      .getSession()
      .then(async ({ data: { session } }) => {
        if (!mounted) return;
        const u = session?.user ?? null;
        setUser(u);
        // Do not block auth bootstrap on profile fetch.
        if (u) void fetchProfile(u.id);
      })
      .catch(() => {
        if (!mounted) return;
        setUser(null);
        setProfile(null);
      })
      .finally(() => {
        if (!mounted) return;
        setLoading(false);
      });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (!mounted) return;
      try {
        const u = session?.user ?? null;
        setUser(u);
        // Keep UI responsive even if profile query is slow.
        if (u) void fetchProfile(u.id);
        else setProfile(null);
      } catch {
        setUser(null);
        setProfile(null);
      } finally {
        setLoading(false);
      }
    });

    return () => {
      mounted = false;
      clearTimeout(loadingGuard);
      subscription.unsubscribe();
    };
  }, []);

  async function signIn(email, password) {
    if (!supabase) {
      return { message: "Supabase bağlantısı bulunamadı. Lütfen .env yapılandırmasını kontrol edin." };
    }
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return error;
  }

  async function signOut() {
    // Her iki modda da state temizlenir
    setUser(null);
    setProfile(null);
    if (supabase) {
      await supabase.auth.signOut();
    }
  }

  const role = profile?.role ?? null;
  const displayName = profile?.full_name || user?.email || "Kullanıcı";

  return (
    <AuthContext.Provider
      value={{ user, profile, role, displayName, loading, signIn, signOut }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
