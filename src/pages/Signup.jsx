import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase/supabaseClient";
import { createPageUrl } from "@/utils";
import { MessageCircle, Video, Truck, MapPin, CheckCircle2, Heart } from "lucide-react";
import { PasswordInput } from "@/components/ui/password-input";

export default function Signup() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

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
              {/* Welcome Header */}
              <div className="text-center space-y-4">
                <div className="mx-auto w-16 h-16 bg-green-100 rounded-full flex items-center justify-center">
                  <CheckCircle2 className="w-10 h-10 text-green-600" />
                </div>
                <h2 className="text-2xl sm:text-3xl font-bold text-gray-900">
                  Welcome to MyNeighbor.Live 🎉
                </h2>
                <div className="space-y-2">
                  <p className="text-lg text-gray-700 font-medium">
                    Thanks for joining!
                  </p>
                  <p className="text-gray-600">
                    We've sent a confirmation link to{" "}
                    <strong className="text-gray-900">{email}</strong>
                  </p>
                </div>
              </div>

              {/* What you'll be able to do */}
              <div className="bg-gradient-to-br from-purple-50 to-blue-50 rounded-xl p-5 space-y-4">
                <h3 className="text-sm font-bold text-purple-900">
                  Once you're in, you'll be able to:
                </h3>
                <ul className="space-y-3 text-sm text-gray-700">
                  <li className="flex items-start gap-3">
                    <MessageCircle className="w-5 h-5 text-purple-500 flex-shrink-0 mt-0.5" />
                    <span>Chat with local sellers during live shows</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <MapPin className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
                    <span>Discover sellers and communities near you</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <Video className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
                    <span>Negotiate live and pick up locally</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <Heart className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
                    <span>Support Arizona businesses and neighbors</span>
                  </li>
                </ul>
              </div>

              {/* Community message */}
              <div className="text-center space-y-3 py-2">
                <p className="text-gray-600 italic">
                  You're not joining a marketplace —
                </p>
                <p className="text-lg font-semibold text-purple-700">
                  you're joining a community.
                </p>
              </div>

              {/* Slogan */}
              <div className="text-center py-3 border-t border-b border-gray-200">
                <p className="text-xl font-bold text-gray-800 italic">
                  "Just neighbors doing business with neighbors."
                </p>
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
              Support your neighbors. Strengthen your community.
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
              SECTION 1: HERO — BRAND / ARIZONA IDENTITY / SLOGAN
              ══════════════════════════════════════════════════════════════════ */}
          <div className="text-center space-y-4">
            <h1 className="text-4xl sm:text-5xl font-extrabold text-white drop-shadow-lg">
              MyNeighbor.Live
            </h1>
            
            {/* Large quoted slogan */}
            <p className="text-xl sm:text-2xl font-bold text-white/95 italic px-4">
              "Just neighbors doing business with neighbors."
            </p>
            
            {/* Arizona-focused copy */}
            <div className="pt-2 space-y-1">
              <p className="text-sm sm:text-base text-amber-300 font-semibold">
                Built for Arizona. By Arizonans.
              </p>
              <p className="text-sm text-white/80">
                Local sellers, local services, local pickup — all live.
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
                How it works — it's easy and fun
              </h2>
              <div className="grid gap-3">
                {/* Chat & Connect */}
                <div className="flex items-start gap-3 p-3 bg-purple-50 rounded-lg">
                  <div className="flex-shrink-0 w-8 h-8 bg-purple-100 rounded-full flex items-center justify-center">
                    <MessageCircle className="w-4 h-4 text-purple-600" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-gray-900">Chat & Connect</h3>
                    <p className="text-xs text-gray-600">
                      Fill out your profile and jump right into live chat.
                      Talk directly with sellers during live shows.
                    </p>
                  </div>
                </div>
                
                {/* Go Live & Negotiate */}
                <div className="flex items-start gap-3 p-3 bg-blue-50 rounded-lg">
                  <div className="flex-shrink-0 w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                    <Video className="w-4 h-4 text-blue-600" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-gray-900">Go Live & Negotiate</h3>
                    <p className="text-xs text-gray-600">
                      Watch sellers go live, ask questions, negotiate in real time,
                      and close deals face-to-face — digitally.
                    </p>
                  </div>
                </div>
                
                {/* Local Pickup */}
                <div className="flex items-start gap-3 p-3 bg-green-50 rounded-lg">
                  <div className="flex-shrink-0 w-8 h-8 bg-green-100 rounded-full flex items-center justify-center">
                    <Truck className="w-4 h-4 text-green-600" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-gray-900">Local Pickup</h3>
                    <p className="text-xs text-gray-600">
                      No shipping. No waiting.
                      Buy from sellers around the Valley and pick up the same day.
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
                      Explore shows, sellers, and communities happening near you.
                      Discover what your neighbors are selling — live.
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
              
              {/* Password Field */}
              <div>
                <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
                  Password
                </label>
                <PasswordInput
                  id="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  disabled={loading}
                  minLength={6}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none transition-all disabled:bg-gray-100 disabled:cursor-not-allowed"
                  placeholder="At least 6 characters"
                />
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
            <div className="text-center space-y-2 pt-2">
              <p className="text-sm text-gray-600 font-medium">
                Local sellers. Real people.
              </p>
              <p className="text-xs text-gray-500">
                Buyer and seller verification help keep the community safe.
              </p>
              <p className="text-xs text-purple-600 font-medium pt-1">
                Support your neighbors. Strengthen your community.
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






















