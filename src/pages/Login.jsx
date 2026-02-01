import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase/supabaseClient";
import { createPageUrl } from "@/utils";
import { useSupabaseAuth } from "@/lib/auth/SupabaseAuthProvider";

export default function Login() {
  const navigate = useNavigate();
  const { user, isLoadingAuth } = useSupabaseAuth();
  
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // ═══════════════════════════════════════════════════════════════════════════
  // AUTH REDIRECT: If user becomes authenticated while on Login, redirect away
  // This prevents the "double login" visual flash during auth state propagation
  // ═══════════════════════════════════════════════════════════════════════════
  useEffect(() => {
    if (!isLoadingAuth && user) {
      navigate(createPageUrl("Marketplace"), { replace: true });
    }
  }, [isLoadingAuth, user, navigate]);

  // Early return: Don't render login form if user is authenticated
  if (!isLoadingAuth && user) {
    return null;
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (signInError) {
        setError(signInError.message);
        setLoading(false);
        return;
      }

      // Login successful - check for stored return URL (e.g., from BUY NOW click)
      const returnUrl = sessionStorage.getItem("login_return_url");
      if (returnUrl) {
        sessionStorage.removeItem("login_return_url");
        // Use window.location for full page navigation to preserve query params
        window.location.href = returnUrl;
        return;
      }

      // Explicit default redirect after login
      navigate(createPageUrl("Marketplace"), { replace: true });
      return;

    } catch (err) {
      setError("An unexpected error occurred");
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen relative bg-gradient-to-br from-purple-900 via-indigo-900 to-blue-900">
      
      {/* Content */}
      <div className="relative z-10 min-h-screen flex flex-col items-center justify-center px-4 py-8 sm:px-6 lg:px-8">
        {/* Landing Section */}
        <div className="w-full max-w-md space-y-6">
          {/* Branding / Title */}
          <div className="text-center space-y-3">
            <h1 className="text-4xl sm:text-5xl font-extrabold text-white drop-shadow-lg">
              MyNeighbor.Live
            </h1>
            <p className="text-lg sm:text-xl font-semibold text-white/90">
              Local Live Shopping
            </p>
            
            {/* Arizona-focused copy */}
            <div className="pt-2 space-y-1">
              <p className="text-sm sm:text-base text-amber-300 font-medium">
                Exclusive to Arizona
              </p>
              <p className="text-sm text-white/80">
                Shop local. Pick up nearby.
              </p>
              <p className="text-sm text-white/80">
                Support real neighbors and local businesses.
              </p>
            </div>
          </div>

          {/* Login Card */}
          <div className="bg-white/95 backdrop-blur-sm rounded-2xl shadow-2xl p-6 sm:p-8 space-y-6">
            {/* Create Account CTA - Primary action for new users */}
            <div className="space-y-3">
              <p className="text-center text-sm font-medium text-gray-700">New to MyNeighbor.Live?</p>
              <button
                type="button"
                onClick={() => navigate(createPageUrl("Signup"))}
                className="w-full py-4 px-4 bg-white border-2 border-purple-500 text-purple-600 font-bold text-lg rounded-lg shadow-sm hover:bg-purple-50 hover:border-purple-600 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 transition-all"
              >
                Create Account
              </button>
            </div>

            {/* Divider */}
            <div className="relative py-2">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-200"></div>
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-4 bg-white text-gray-500">Already have an account?</span>
              </div>
            </div>

            <div className="text-center">
              <h2 className="text-xl sm:text-2xl font-bold text-gray-900">
                Welcome back
              </h2>
              <p className="mt-1 text-sm text-gray-500">
                Sign in to your account
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  disabled={loading}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none transition-all disabled:bg-gray-100 disabled:cursor-not-allowed"
                  placeholder="you@example.com"
                />
              </div>
              <div>
                <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
                  Password
                </label>
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  disabled={loading}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none transition-all disabled:bg-gray-100 disabled:cursor-not-allowed"
                  placeholder="Enter your password"
                />
              </div>

              {error && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                  <p className="text-sm text-red-600">{error}</p>
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 px-4 bg-gradient-to-r from-purple-600 to-blue-500 text-white font-semibold rounded-lg shadow-md hover:from-purple-700 hover:to-blue-600 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? "Logging in..." : "Log In"}
              </button>
            </form>
          </div>

          {/* Footer */}
          <p className="text-center text-xs text-white/60">
            Shop local. Support neighbors. Watch live.
          </p>
        </div>
      </div>
    </div>
  );
}
