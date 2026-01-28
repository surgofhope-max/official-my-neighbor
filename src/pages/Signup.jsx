import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase/supabaseClient";
import { createPageUrl } from "@/utils";
import { Eye, EyeOff, MessageCircle, ShoppingBag, MapPin, CheckCircle2 } from "lucide-react";

export default function Signup() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);
  
  // UI-only state for password visibility toggle
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const { data, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
      });

      if (signUpError) {
        setError(signUpError.message);
        return;
      }

      // Check if email confirmation is required
      if (data.user && !data.session) {
        // Email confirmation required
        setSuccess(true);
      } else if (data.session) {
        // Auto-confirmed (e.g., in development or disabled confirmation)
        navigate(createPageUrl("BuyerProfile"), { replace: true });
      }
    } catch (err) {
      setError("An unexpected error occurred");
    } finally {
      setLoading(false);
    }
  };

  // Show success message if email confirmation is required
  if (success) {
    return (
      <div className="min-h-screen relative bg-gradient-to-br from-purple-900 via-indigo-900 to-blue-900">
        <div className="relative z-10 min-h-screen flex flex-col items-center justify-center px-4 py-8 sm:px-6 lg:px-8">
          <div className="w-full max-w-md space-y-6">
            {/* Branding */}
            <div className="text-center space-y-3">
              <h1 className="text-4xl sm:text-5xl font-extrabold text-white drop-shadow-lg">
                MyNeighbor.Live
              </h1>
              <p className="text-lg sm:text-xl font-semibold text-white/90">
                Local Live Shopping
              </p>
            </div>

            {/* Success Card */}
            <div className="bg-white/95 backdrop-blur-sm rounded-2xl shadow-2xl p-6 sm:p-8 space-y-6">
              <div className="text-center space-y-4">
                <div className="mx-auto w-16 h-16 bg-green-100 rounded-full flex items-center justify-center">
                  <CheckCircle2 className="w-10 h-10 text-green-600" />
                </div>
                <h2 className="text-xl sm:text-2xl font-bold text-gray-900">
                  Check Your Email
                </h2>
                <p className="text-gray-600">
                  We've sent a confirmation link to{" "}
                  <strong className="text-gray-900">{email}</strong>
                </p>
                <p className="text-sm text-gray-500">
                  Please check your inbox and click the link to activate your account.
                </p>
              </div>

              {/* What happens next */}
              <div className="bg-purple-50 rounded-xl p-4 space-y-3">
                <h3 className="text-sm font-semibold text-purple-900">What happens next?</h3>
                <ol className="text-sm text-purple-800 space-y-2">
                  <li className="flex items-start gap-2">
                    <span className="font-semibold text-purple-600">1.</span>
                    <span>Confirm your email</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="font-semibold text-purple-600">2.</span>
                    <span>Complete your profile to unlock chat</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="font-semibold text-purple-600">3.</span>
                    <span>Discover live shows near you</span>
                  </li>
                </ol>
              </div>

              <button
                onClick={() => navigate(createPageUrl("Login"))}
                className="w-full py-3 px-4 bg-gradient-to-r from-purple-600 to-blue-500 text-white font-semibold rounded-lg shadow-md hover:from-purple-700 hover:to-blue-600 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 transition-all"
              >
                Go to Login
              </button>
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

  return (
    <div className="min-h-screen relative bg-gradient-to-br from-purple-900 via-indigo-900 to-blue-900">
      {/* Content */}
      <div className="relative z-10 min-h-screen flex flex-col items-center justify-center px-4 py-8 sm:px-6 lg:px-8">
        <div className="w-full max-w-md space-y-6">
          
          {/* ══════════════════════════════════════════════════════════════════
              SECTION 1: BRAND / ARIZONA IDENTITY
              ══════════════════════════════════════════════════════════════════ */}
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
                Built for Arizona. By Arizonans.
              </p>
              <p className="text-sm text-white/80">
                Live local shopping with real sellers.
              </p>
              <p className="text-sm text-white/80">
                Local pickup only. No shipping.
              </p>
            </div>
          </div>

          {/* Main Card */}
          <div className="bg-white/95 backdrop-blur-sm rounded-2xl shadow-2xl p-6 sm:p-8 space-y-6">
            
            {/* ══════════════════════════════════════════════════════════════════
                SECTION 2: HOW IT WORKS (EDUCATIONAL BLOCK)
                ══════════════════════════════════════════════════════════════════ */}
            <div className="space-y-4">
              <h2 className="text-lg font-bold text-gray-900 text-center">
                How It Works
              </h2>
              <div className="grid gap-3">
                {/* Chat */}
                <div className="flex items-start gap-3 p-3 bg-purple-50 rounded-lg">
                  <div className="flex-shrink-0 w-8 h-8 bg-purple-100 rounded-full flex items-center justify-center">
                    <MessageCircle className="w-4 h-4 text-purple-600" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-gray-900">Chat</h3>
                    <p className="text-xs text-gray-600">
                      Create an account and complete your profile to chat in live shows and communities.
                    </p>
                  </div>
                </div>
                
                {/* Buy */}
                <div className="flex items-start gap-3 p-3 bg-blue-50 rounded-lg">
                  <div className="flex-shrink-0 w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                    <ShoppingBag className="w-4 h-4 text-blue-600" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-gray-900">Buy</h3>
                    <p className="text-xs text-gray-600">
                      Buying unlocks at your first purchase with quick buyer onboarding.
                    </p>
                  </div>
                </div>
                
                {/* Near Me */}
                <div className="flex items-start gap-3 p-3 bg-amber-50 rounded-lg">
                  <div className="flex-shrink-0 w-8 h-8 bg-amber-100 rounded-full flex items-center justify-center">
                    <MapPin className="w-4 h-4 text-amber-600" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-gray-900">Near Me</h3>
                    <p className="text-xs text-gray-600">
                      Discover live shows, sellers, and communities near you — all local to Arizona.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Divider */}
            <div className="border-t border-gray-200" />

            {/* ══════════════════════════════════════════════════════════════════
                SECTION 3: SIGNUP FORM (LOGIC UNCHANGED)
                ══════════════════════════════════════════════════════════════════ */}
            <div className="text-center">
              <h2 className="text-xl sm:text-2xl font-bold text-gray-900">
                Create Account
              </h2>
              <p className="mt-1 text-sm text-gray-500">
                Join your local live shopping community
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Email Field */}
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
              
              {/* Password Field with Visibility Toggle */}
              <div>
                <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
                  Password
                </label>
                <div className="relative">
                  <input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    disabled={loading}
                    minLength={6}
                    className="w-full px-4 py-3 pr-12 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none transition-all disabled:bg-gray-100 disabled:cursor-not-allowed"
                    placeholder="At least 6 characters"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 focus:outline-none"
                    tabIndex={-1}
                  >
                    {showPassword ? (
                      <EyeOff className="w-5 h-5" />
                    ) : (
                      <Eye className="w-5 h-5" />
                    )}
                  </button>
                </div>
                <p className="mt-1 text-xs text-gray-500">
                  Must be at least 6 characters
                </p>
              </div>

              {/* Error Message */}
              {error && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                  <p className="text-sm text-red-600">{error}</p>
                </div>
              )}

              {/* Submit Button */}
              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 px-4 bg-gradient-to-r from-purple-600 to-blue-500 text-white font-semibold rounded-lg shadow-md hover:from-purple-700 hover:to-blue-600 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? "Creating account..." : "Create Account"}
              </button>
            </form>

            {/* ══════════════════════════════════════════════════════════════════
                SECTION 4: WHAT HAPPENS NEXT
                ══════════════════════════════════════════════════════════════════ */}
            <div className="bg-gray-50 rounded-xl p-4 space-y-3">
              <h3 className="text-sm font-semibold text-gray-900">What happens next?</h3>
              <ol className="text-sm text-gray-600 space-y-2">
                <li className="flex items-start gap-2">
                  <span className="font-semibold text-purple-600">1.</span>
                  <span>Complete your profile to unlock chat</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="font-semibold text-purple-600">2.</span>
                  <span>Browse live shows and sellers near you</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="font-semibold text-purple-600">3.</span>
                  <span>Buy when ready — onboarding happens at checkout</span>
                </li>
              </ol>
            </div>

            {/* ══════════════════════════════════════════════════════════════════
                SECTION 5: TRUST / LOCAL SAFETY BLOCK
                ══════════════════════════════════════════════════════════════════ */}
            <div className="text-center space-y-1 pt-2">
              <p className="text-xs text-gray-500">
                Local sellers. Local pickup.
              </p>
              <p className="text-xs text-gray-500">
                Buyer and seller verification required to complete sales.
              </p>
            </div>

            {/* Divider */}
            <div className="border-t border-gray-200" />

            {/* Already have account? */}
            <div className="text-center">
              <p className="text-sm text-gray-600">
                Already have an account?{" "}
                <button
                  type="button"
                  onClick={() => navigate(createPageUrl("Login"))}
                  className="font-semibold text-purple-600 hover:text-purple-500 transition-colors"
                >
                  Log in
                </button>
              </p>
            </div>
          </div>

          {/* ══════════════════════════════════════════════════════════════════
              SECTION 6: FOOTER
              ══════════════════════════════════════════════════════════════════ */}
          <p className="text-center text-xs text-white/60">
            Shop local. Support neighbors. Watch live.
          </p>
        </div>
      </div>
    </div>
  );
}






















