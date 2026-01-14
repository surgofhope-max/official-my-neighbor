import React, { createContext, useContext, useState, useEffect } from "react";
import { supabase } from "@/lib/supabase/supabaseClient";
import type { User } from "@supabase/supabase-js";

type AuthContextValue = {
  user: User | null;
  isAuthenticated: boolean;
  isLoadingAuth: boolean;
  isLoadingPublicSettings: boolean;
  authError: null;
  appPublicSettings: null;
  logout: () => void;
  navigateToLogin: () => void;
  checkAppState: () => void;
};

const noop = () => {};

const defaultValue: AuthContextValue = {
  user: null,
  isAuthenticated: false,
  isLoadingAuth: true,
  isLoadingPublicSettings: false,
  authError: null,
  appPublicSettings: null,
  logout: noop,
  navigateToLogin: noop,
  checkAppState: noop,
};

const SupabaseAuthContext = createContext<AuthContextValue>(defaultValue);

export const SupabaseAuthProvider: React.FC<{
  children: React.ReactNode;
}> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);

  useEffect(() => {
    // Check initial session on mount
    const checkSession = async () => {
      try {
        const { data } = await supabase.auth.getSession();
        const sessionUser = data.session?.user ?? null;
        console.log("[AUTH DEBUG][Provider] checkSession result:", sessionUser?.id ?? null);
        setUser(sessionUser);
        setIsAuthenticated(Boolean(sessionUser));
      } catch (error) {
        console.error("Failed to get session:", error);
        setUser(null);
        setIsAuthenticated(false);
      } finally {
        setIsLoadingAuth(false);
      }
    };

    checkSession();

    // Subscribe to auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        const sessionUser = session?.user ?? null;
        console.log("[AUTH DEBUG][Provider] event:", event, "session_user:", sessionUser?.id ?? null);
        setUser(sessionUser);
        setIsAuthenticated(Boolean(sessionUser));
      }
    );

    // Cleanup subscription on unmount
    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const logout = async () => {
    try {
      await supabase.auth.signOut();
    } catch (error) {
      console.error("Failed to sign out:", error);
    } finally {
      setUser(null);
      setIsAuthenticated(false);
    }
  };

  const value: AuthContextValue = {
    user,
    isAuthenticated,
    isLoadingAuth,
    isLoadingPublicSettings: false,
    authError: null,
    appPublicSettings: null,
    logout,
    navigateToLogin: noop,
    checkAppState: noop,
  };

  return (
    <SupabaseAuthContext.Provider value={value}>
      {children}
    </SupabaseAuthContext.Provider>
  );
};

export const useSupabaseAuth = () => {
  return useContext(SupabaseAuthContext);
};
