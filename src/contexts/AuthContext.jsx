import { createContext, useContext, useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  async function fetchProfile(userId) {
    if (!supabase) return;
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .single();
    if (!error && data) setProfile(data);
    else setProfile(null);
  }

  useEffect(() => {
    if (!supabase) {
      // Dev modu: otomatik giriş yapma, login sayfasını göster.
      // signIn() çağrıldığında kullanıcı set edilecek.
      setLoading(false);
      return;
    }

    let mounted = true;

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!mounted) return;
      const u = session?.user ?? null;
      setUser(u);
      if (u) await fetchProfile(u.id);
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (!mounted) return;
      const u = session?.user ?? null;
      setUser(u);
      if (u) await fetchProfile(u.id);
      else setProfile(null);
      setLoading(false);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  async function signIn(email, password) {
    // Dev modu: Supabase bağlı değilken herhangi bir e-posta/şifre kabul edilir
    if (!supabase) {
      const devProfile = {
        id: "dev",
        full_name: email.split("@")[0] || "Geliştirici",
        email,
        role: "admin",
        created_at: new Date().toISOString(),
      };
      setUser({ id: "dev", email });
      setProfile(devProfile);
      return null; // hata yok
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
