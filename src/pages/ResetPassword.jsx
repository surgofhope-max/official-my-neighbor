import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase/supabaseClient";
import { createPageUrl } from "@/utils";

export default function ResetPassword() {
  const navigate = useNavigate();
  const [session, setSession] = useState(null);
  const [isResolving, setIsResolving] = useState(true);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    const resolveSession = async () => {
      try {
        const { data } = await supabase.auth.getSession();
        const sess = data?.session ?? null;
        setSession(sess);

        if (sess) {
          // Remove URL hash after successful session detection (security)
          window.history.replaceState({}, document.title, window.location.pathname);
        }
      } catch (err) {
        setSession(null);
      } finally {
        setIsResolving(false);
      }
    };

    resolveSession();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    // Validation
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      setLoading(false);
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      setLoading(false);
      return;
    }

    try {
      const { error: updateError } = await supabase.auth.updateUser({ password });

      if (updateError) {
        setError(updateError.message || "Could not update password.");
        setLoading(false);
        return;
      }

      setSuccess(true);
      await supabase.auth.signOut();
      setTimeout(() => {
        navigate(createPageUrl("Login"), { replace: true, state: { resetSuccess: true } });
      }, 1500);
    } catch (err) {
      setError("An unexpected error occurred.");
      setLoading(false);
    }
  };

  if (isResolving) {
    return (
      <div className="min-h-screen relative bg-gradient-to-br from-purple-900 via-indigo-900 to-blue-900">
        <div className="relative z-10 min-h-screen flex flex-col items-center justify-center px-4 py-8 sm:px-6 lg:px-8">
          <div className="w-full max-w-md space-y-6">
            <div className="text-center space-y-3">
              <h1 className="text-4xl sm:text-5xl font-extrabold text-white drop-shadow-lg">
                MyNeighbor.Live
              </h1>
              <p className="text-lg sm:text-xl font-semibold text-white/90">
                Local Live Shopping
              </p>
            </div>
            <div className="bg-white/95 backdrop-blur-sm rounded-2xl shadow-2xl p-8 flex flex-col items-center justify-center">
              <div className="w-8 h-8 border-4 border-purple-500 border-t-transparent rounded-full animate-spin" />
              <p className="mt-4 text-sm text-gray-600">Verifying reset link...</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="min-h-screen relative bg-gradient-to-br from-purple-900 via-indigo-900 to-blue-900">
        <div className="relative z-10 min-h-screen flex flex-col items-center justify-center px-4 py-8 sm:px-6 lg:px-8">
          <div className="w-full max-w-md space-y-6">
            <div className="text-center space-y-3">
              <h1 className="text-4xl sm:text-5xl font-extrabold text-white drop-shadow-lg">
                MyNeighbor.Live
              </h1>
              <p className="text-lg sm:text-xl font-semibold text-white/90">
                Local Live Shopping
              </p>
            </div>
            <div className="bg-white/95 backdrop-blur-sm rounded-2xl shadow-2xl p-6 sm:p-8 space-y-6">
              <div className="text-center">
                <h2 className="text-xl sm:text-2xl font-bold text-gray-900">
                  Invalid or expired link
                </h2>
                <p className="mt-2 text-sm text-red-600">
                  This password reset link is invalid or has expired.
                </p>
                <p className="mt-4 text-sm text-gray-600">
                  Request a new password reset from the login page.
                </p>
              </div>
              <button
                type="button"
                onClick={() => navigate(createPageUrl("Login"), { replace: true })}
                className="w-full py-3 px-4 bg-gradient-to-r from-purple-600 to-blue-500 text-white font-semibold rounded-lg shadow-md hover:from-purple-700 hover:to-blue-600 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 transition-all"
              >
                Go to Login
              </button>
            </div>
            <p className="text-center text-xs text-white/60">
              Shop local. Support neighbors. Watch live.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="min-h-screen relative bg-gradient-to-br from-purple-900 via-indigo-900 to-blue-900">
        <div className="relative z-10 min-h-screen flex flex-col items-center justify-center px-4 py-8 sm:px-6 lg:px-8">
          <div className="w-full max-w-md space-y-6">
            <div className="text-center space-y-3">
              <h1 className="text-4xl sm:text-5xl font-extrabold text-white drop-shadow-lg">
                MyNeighbor.Live
              </h1>
              <p className="text-lg sm:text-xl font-semibold text-white/90">
                Local Live Shopping
              </p>
            </div>
            <div className="bg-white/95 backdrop-blur-sm rounded-2xl shadow-2xl p-6 sm:p-8 space-y-6">
              <div className="text-center">
                <h2 className="text-xl sm:text-2xl font-bold text-gray-900">
                  Password updated
                </h2>
                <p className="mt-2 text-sm text-green-600">
                  Your password has been updated successfully. Redirecting to login...
                </p>
              </div>
              <div className="w-full flex justify-center">
                <div className="w-8 h-8 border-4 border-green-500 border-t-transparent rounded-full animate-spin" />
              </div>
            </div>
            <p className="text-center text-xs text-white/60">
              Shop local. Support neighbors. Watch live.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen relative bg-gradient-to-br from-purple-900 via-indigo-900 to-blue-900">
      <div className="relative z-10 min-h-screen flex flex-col items-center justify-center px-4 py-8 sm:px-6 lg:px-8">
        <div className="w-full max-w-md space-y-6">
          <div className="text-center space-y-3">
            <h1 className="text-4xl sm:text-5xl font-extrabold text-white drop-shadow-lg">
              MyNeighbor.Live
            </h1>
            <p className="text-lg sm:text-xl font-semibold text-white/90">
              Local Live Shopping
            </p>
            <div className="pt-2 space-y-1">
              <p className="text-sm sm:text-base text-amber-300 font-medium">
                Exclusive to Arizona
              </p>
              <p className="text-sm text-white/80">
                Shop local. Pick up nearby.
              </p>
            </div>
          </div>

          <div className="bg-white/95 backdrop-blur-sm rounded-2xl shadow-2xl p-6 sm:p-8 space-y-6">
            <div className="text-center">
              <h2 className="text-xl sm:text-2xl font-bold text-gray-900">
                Set new password
              </h2>
              <p className="mt-1 text-sm text-gray-500">
                Enter your new password below.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
                  New password
                </label>
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={8}
                  disabled={loading}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none transition-all disabled:bg-gray-100 disabled:cursor-not-allowed"
                  placeholder="At least 8 characters"
                />
              </div>
              <div>
                <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 mb-1">
                  Confirm password
                </label>
                <input
                  id="confirmPassword"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  minLength={8}
                  disabled={loading}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none transition-all disabled:bg-gray-100 disabled:cursor-not-allowed"
                  placeholder="Confirm your password"
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
                {loading ? "Updating..." : "Update password"}
              </button>
            </form>

            <button
              type="button"
              onClick={() => navigate(createPageUrl("Login"), { replace: true })}
              className="w-full text-sm font-semibold text-purple-600 hover:text-purple-700 focus:outline-none"
            >
              Cancel and go to Login
            </button>
          </div>

          <p className="text-center text-xs text-white/60">
            Shop local. Support neighbors. Watch live.
          </p>
        </div>
      </div>
    </div>
  );
}
