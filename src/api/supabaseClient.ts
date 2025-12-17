/**
 * Supabase API Client Placeholder
 *
 * This is a drop-in replacement scaffold for the Base44 client.
 * Real Supabase integration will be wired in later.
 *
 * Safe to import anywhere — no side effects until methods are called.
 */

import { supabase } from "@/lib/supabase/supabaseClient";

class SupabaseApiNotWiredError extends Error {
  constructor(method: string) {
    super(`Supabase API not wired yet: ${method}() called`);
    this.name = "SupabaseApiNotWiredError";
  }
}

const notImplemented = (methodName: string) => {
  return (..._args: unknown[]): never => {
    throw new SupabaseApiNotWiredError(methodName);
  };
};

/**
 * Placeholder Supabase API client
 *
 * Mimics the structure of base44Client for easy migration.
 * All methods throw controlled errors until real implementation is added.
 */
export const supabaseApi = {
  /**
   * Raw Supabase client instance
   */
  client: supabase,

  /**
   * Generic request method placeholder
   */
  request: notImplemented("request"),

  /**
   * Auth namespace
   */
  auth: {
    /**
     * Get current authenticated user.
     * Returns Supabase User if logged in, null if logged out.
     * Never throws, never redirects.
     */
    me: async () => {
      try {
        const { data, error } = await supabase.auth.getUser();
        if (error || !data.user) {
          return null;
        }
        return data.user;
      } catch {
        return null;
      }
    },
    isAuthenticated: notImplemented("auth.isAuthenticated"),
    redirectToLogin: notImplemented("auth.redirectToLogin"),
    logout: notImplemented("auth.logout"),
    updateMe: notImplemented("auth.updateMe"),
  },

  /**
   * Entities namespace placeholder
   */
  entities: {
    Query: notImplemented("entities.Query"),
  },

  /**
   * Integrations namespace placeholder
   */
  integrations: {
    Core: {
      InvokeLLM: notImplemented("integrations.Core.InvokeLLM"),
      SendEmail: notImplemented("integrations.Core.SendEmail"),
      SendSMS: notImplemented("integrations.Core.SendSMS"),
      UploadFile: notImplemented("integrations.Core.UploadFile"),
      GenerateImage: notImplemented("integrations.Core.GenerateImage"),
      ExtractDataFromUploadedFile: notImplemented(
        "integrations.Core.ExtractDataFromUploadedFile"
      ),
    },
  },

  /**
   * App logs namespace placeholder
   * Safe no-op until logging is wired.
   */
  appLogs: {
    logUserInApp: (..._args: unknown[]): Promise<void> => {
      // No-op: logging not wired yet
      return Promise.resolve();
    },
  },
};

export default supabaseApi;

