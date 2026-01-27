import React, { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase/supabaseClient";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { isSuperAdmin } from "@/lib/auth/routeGuards";
import { getSellerOnboardingCompleted, getSellerSafetyAgreed } from "@/lib/auth/onboardingState";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Shield,
  Package,
  MapPin,
  AlertTriangle,
  CheckCircle,
  FileText,
  ArrowRight,
  Users,
  DollarSign,
  Scale,
  AlertCircle
} from "lucide-react";

export default function SellerSafetyAgreement() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [agreements, setAgreements] = useState({
    inventorySafety: false,
    pickupRules: false,
    buyerProtection: false,
    fraudPrevention: false,
    liabilityCompliance: false,
    termsAgreement: false
  });
  // ═══════════════════════════════════════════════════════════════════════════
  // FAIL-SAFE: Track if canonical user query failed to prevent redirect loops
  // ═══════════════════════════════════════════════════════════════════════════
  const [canonicalUserLoadFailed, setCanonicalUserLoadFailed] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [showSellerTermsModal, setShowSellerTermsModal] = useState(false);

  useEffect(() => {
    loadUser();
  }, []);

  const loadUser = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();

      if (!session) {
        navigate(createPageUrl("Login"), { replace: true });
        return;
      }

      const currentUser = session.user;
      setUser(currentUser);

      // 🔐 SUPER_ADMIN BYPASS: Skip all onboarding/safety checks
      if (isSuperAdmin(currentUser)) {
        console.log("🔑 SUPER_ADMIN detected — bypassing safety agreement, redirecting to AdminDashboard");
        navigate(createPageUrl("AdminDashboard"), { replace: true });
        return;
      }

      // ═══════════════════════════════════════════════════════════════════════════
      // CANONICAL GATING: Query public.users for onboarding state
      // This is the ONLY source of truth for re-entry blocking
      // ═══════════════════════════════════════════════════════════════════════════
      const { data: canonicalUser, error: userQueryError } = await supabase
        .from("users")
        .select("seller_onboarding_completed, seller_safety_agreed")
        .eq("id", currentUser.id)
        .maybeSingle();

      // ═══════════════════════════════════════════════════════════════════════════
      // FAIL-SAFE: If query fails, DO NOT redirect — render error state instead
      // This prevents infinite redirect loops when schema is wrong
      // ═══════════════════════════════════════════════════════════════════════════
      if (userQueryError) {
        console.error("[SellerSafetyAgreement] Failed to query canonical user:", userQueryError);
        setCanonicalUserLoadFailed(true);
        setLoadError(userQueryError.message || "Failed to load user data");
        // Allow form to render in degraded mode — no redirects
        setLoading(false);
        return; // EXIT — do not proceed with redirect logic
      }

      // ═══════════════════════════════════════════════════════════════════════════
      // REDIRECT LOGIC: Uses dual-source helpers (DB OR auth.user_metadata)
      // This prevents race conditions where metadata is updated before DB
      // ═══════════════════════════════════════════════════════════════════════════
      
      // Block re-entry if BOTH flags are true (fully completed)
      if (getSellerSafetyAgreed(currentUser) && getSellerOnboardingCompleted(currentUser)) {
        console.log("[SellerSafetyAgreement] Onboarding fully complete — redirecting to BuyerProfile");
        navigate(createPageUrl("BuyerProfile"), { replace: true });
        return;
      }

      // If safety already agreed but onboarding not complete, skip to onboarding
      if (getSellerSafetyAgreed(currentUser) && !getSellerOnboardingCompleted(currentUser)) {
        console.log("[SellerSafetyAgreement] Safety agreed, onboarding incomplete — redirecting to SellerOnboarding");
        navigate(createPageUrl("SellerOnboarding"), { replace: true });
        return;
      }

      // ALLOW safety agreement to render — user needs to complete this step

    } catch (error) {
      console.error("Error loading user:", error);
    } finally {
      setLoading(false);
    }
  };

  const allAgreed = Object.values(agreements).every(v => v === true);

  const handleSubmit = async () => {
    if (!allAgreed) return;

    setSubmitting(true);
    try {
      const now = new Date().toISOString();
      
      // Get current user for ID
      const { data: { user: currentUser }, error: userError } = await supabase.auth.getUser();
      if (userError || !currentUser) {
        throw new Error("Unable to get current user");
      }

      // ═══════════════════════════════════════════════════════════════════════════
      // STEP 1: Write canonical flag to public.users (gate reads from here)
      // ═══════════════════════════════════════════════════════════════════════════
      const { error: usersUpdateError } = await supabase
        .from("users")
        .update({
          seller_safety_agreed: true,
          seller_safety_agreed_at: now
        })
        .eq("id", currentUser.id);

      if (usersUpdateError) {
        console.error("[SellerSafetyAgreement] public.users update failed:", usersUpdateError);
        throw new Error("Failed to save safety agreement. Please try again.");
      }

      // ═══════════════════════════════════════════════════════════════════════════
      // STEP 2: Also write to user_metadata (for compatibility/UI convenience)
      // ═══════════════════════════════════════════════════════════════════════════
      const { error: metadataError } = await supabase.auth.updateUser({
        data: {
          seller_safety_agreed: true,
          seller_safety_agreed_at: now,

          // Reset onboarding state to ensure fresh start
          seller_onboarding_completed: false,
          seller_onboarding_steps_completed: [],
          seller_onboarding_steps_remaining: [
            "phone",
            "guidelines",
            "category",
            "subcategory",
            "type",
            "revenue",
            "channels",
            "address",
            "payment"
          ],

          seller_onboarding_reset: false
        }
      });

      if (metadataError) {
        // Non-blocking - public.users is authoritative
        console.warn("[SellerSafetyAgreement] metadata update failed (non-blocking):", metadataError);
      }

      // Redirect to seller onboarding steps
      navigate(createPageUrl("SellerOnboarding"), { replace: true });
    } catch (error) {
      console.error("Error saving agreement:", error);
      alert(error.message || "Failed to save agreement. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-blue-50 to-purple-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600"></div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // FAIL-SAFE ERROR STATE: Render stable error UI instead of redirecting
  // This prevents infinite redirect loops when canonical user query fails
  // ═══════════════════════════════════════════════════════════════════════════
  if (canonicalUserLoadFailed) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-purple-50 p-4 sm:p-8">
        <div className="max-w-md mx-auto mt-20">
          <Card className="border-amber-200 bg-amber-50">
            <CardHeader>
              <CardTitle className="text-amber-800 flex items-center gap-2">
                <AlertCircle className="w-5 h-5" />
                Unable to Load Safety Agreement
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-amber-700">
                We couldn't verify your onboarding status. This may be a temporary issue.
              </p>
              {loadError && (
                <p className="text-sm text-amber-600 font-mono bg-amber-100 p-2 rounded">
                  {loadError}
                </p>
              )}
              <div className="flex gap-3">
                <Button 
                  onClick={() => window.location.reload()} 
                  className="bg-amber-600 hover:bg-amber-700"
                >
                  Try Again
                </Button>
                <Button 
                  variant="outline"
                  onClick={() => navigate(createPageUrl("BuyerProfile"), { replace: true })}
                >
                  Go to Profile
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-purple-50 p-4 sm:p-8">
      <div className="max-w-2xl mx-auto">
        <Card className="shadow-xl border-0 overflow-hidden">
          <CardHeader className="bg-gradient-to-r from-green-600 to-emerald-600 text-white text-center py-8">
            <div className="w-20 h-20 bg-white/20 rounded-full mx-auto mb-4 flex items-center justify-center">
              <Shield className="w-10 h-10 text-white" />
            </div>
            <CardTitle className="text-2xl sm:text-3xl">Seller Safety Agreement</CardTitle>
            <p className="text-white/80 mt-2">
              Please review and agree to our seller guidelines before setting up your profile
            </p>
          </CardHeader>

          <CardContent className="p-6 sm:p-8 space-y-6">
            {/* Inventory Safety Rules */}
            <div className="space-y-3">
              <div className="flex items-start gap-3 p-4 bg-blue-50 rounded-lg border border-blue-200">
                <Package className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
                <div className="flex-1">
                  <h3 className="font-semibold text-gray-900 mb-1">Inventory Safety Rules</h3>
                  <ul className="text-sm text-gray-600 space-y-1 mb-3">
                    <li>• Only list items you physically possess and can sell</li>
                    <li>• Accurately describe product condition and specifications</li>
                    <li>• Keep inventory counts accurate and up-to-date</li>
                    <li>• Do not list prohibited, illegal, or counterfeit items</li>
                    <li>• Provide clear, honest photos of actual items</li>
                  </ul>
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="inventorySafety"
                      checked={agreements.inventorySafety}
                      onCheckedChange={(checked) => setAgreements(prev => ({ ...prev, inventorySafety: checked }))}
                    />
                    <Label htmlFor="inventorySafety" className="text-sm font-medium cursor-pointer">
                      I agree to follow inventory safety rules
                    </Label>
                  </div>
                </div>
              </div>
            </div>

            {/* Pickup Rules */}
            <div className="space-y-3">
              <div className="flex items-start gap-3 p-4 bg-green-50 rounded-lg border border-green-200">
                <MapPin className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
                <div className="flex-1">
                  <h3 className="font-semibold text-gray-900 mb-1">Pickup & Handoff Rules</h3>
                  <ul className="text-sm text-gray-600 space-y-1 mb-3">
                    <li>• Provide a safe, accessible pickup location</li>
                    <li>• Be available during stated pickup hours</li>
                    <li>• Verify buyer identity using the pickup code</li>
                    <li>• Keep records of completed pickups</li>
                    <li>• Report no-shows and suspicious behavior</li>
                  </ul>
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="pickupRules"
                      checked={agreements.pickupRules}
                      onCheckedChange={(checked) => setAgreements(prev => ({ ...prev, pickupRules: checked }))}
                    />
                    <Label htmlFor="pickupRules" className="text-sm font-medium cursor-pointer">
                      I agree to follow pickup and handoff rules
                    </Label>
                  </div>
                </div>
              </div>
            </div>

            {/* Buyer Protection */}
            <div className="space-y-3">
              <div className="flex items-start gap-3 p-4 bg-purple-50 rounded-lg border border-purple-200">
                <Users className="w-5 h-5 text-purple-600 mt-0.5 flex-shrink-0" />
                <div className="flex-1">
                  <h3 className="font-semibold text-gray-900 mb-1">Buyer Protection Rules</h3>
                  <ul className="text-sm text-gray-600 space-y-1 mb-3">
                    <li>• Honor all completed purchases</li>
                    <li>• Respond to buyer inquiries within 24 hours</li>
                    <li>• Issue refunds for items not as described</li>
                    <li>• Never request payment outside the platform</li>
                    <li>• Treat all buyers with respect and professionalism</li>
                  </ul>
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="buyerProtection"
                      checked={agreements.buyerProtection}
                      onCheckedChange={(checked) => setAgreements(prev => ({ ...prev, buyerProtection: checked }))}
                    />
                    <Label htmlFor="buyerProtection" className="text-sm font-medium cursor-pointer">
                      I agree to protect buyer interests
                    </Label>
                  </div>
                </div>
              </div>
            </div>

            {/* Fraud Prevention */}
            <div className="space-y-3">
              <div className="flex items-start gap-3 p-4 bg-red-50 rounded-lg border border-red-200">
                <DollarSign className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" />
                <div className="flex-1">
                  <h3 className="font-semibold text-gray-900 mb-1">Fraud Prevention</h3>
                  <ul className="text-sm text-gray-600 space-y-1 mb-3">
                    <li>• Never manipulate pricing or create fake urgency</li>
                    <li>• Do not use bots or fake accounts to inflate metrics</li>
                    <li>• Report any fraudulent buyer behavior immediately</li>
                    <li>• Maintain accurate sales and transaction records</li>
                    <li>• Cooperate fully with platform investigations</li>
                  </ul>
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="fraudPrevention"
                      checked={agreements.fraudPrevention}
                      onCheckedChange={(checked) => setAgreements(prev => ({ ...prev, fraudPrevention: checked }))}
                    />
                    <Label htmlFor="fraudPrevention" className="text-sm font-medium cursor-pointer">
                      I agree to prevent and report fraud
                    </Label>
                  </div>
                </div>
              </div>
            </div>

            {/* Liability & Compliance */}
            <div className="space-y-3">
              <div className="flex items-start gap-3 p-4 bg-orange-50 rounded-lg border border-orange-200">
                <Scale className="w-5 h-5 text-orange-600 mt-0.5 flex-shrink-0" />
                <div className="flex-1">
                  <h3 className="font-semibold text-gray-900 mb-1">Liability & Compliance</h3>
                  <ul className="text-sm text-gray-600 space-y-1 mb-3">
                    <li>• You are responsible for all items you sell</li>
                    <li>• Comply with all local, state, and federal laws</li>
                    <li>• Maintain appropriate licenses for regulated items</li>
                    <li>• Accept liability for product safety and accuracy</li>
                    <li>• Platform provides marketplace only, not guarantees</li>
                  </ul>
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="liabilityCompliance"
                      checked={agreements.liabilityCompliance}
                      onCheckedChange={(checked) => setAgreements(prev => ({ ...prev, liabilityCompliance: checked }))}
                    />
                    <Label htmlFor="liabilityCompliance" className="text-sm font-medium cursor-pointer">
                      I understand and accept seller liability
                    </Label>
                  </div>
                </div>
              </div>
            </div>

            {/* Terms Agreement */}
            <div className="space-y-3">
              <div className="flex items-start gap-3 p-4 bg-gray-50 rounded-lg border border-gray-200">
                <FileText className="w-5 h-5 text-gray-600 mt-0.5 flex-shrink-0" />
                <div className="flex-1">
                  <h3 className="font-semibold text-gray-900 mb-1">Seller Terms & Conditions</h3>
                  <p className="text-sm text-gray-600 mb-3">
                    By becoming a seller, you agree to our Seller Terms of Service, Payment Processing Agreement, and Platform Fee Structure. Violations may result in suspension, fund holds, or permanent removal.
                  </p>
                  <button
                    type="button"
                    onClick={() => setShowSellerTermsModal(true)}
                    className="text-sm text-blue-600 hover:underline mb-3"
                  >
                    Read more →
                  </button>
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="termsAgreement"
                      checked={agreements.termsAgreement}
                      onCheckedChange={(checked) => setAgreements(prev => ({ ...prev, termsAgreement: checked }))}
                    />
                    <Label htmlFor="termsAgreement" className="text-sm font-medium cursor-pointer">
                      I agree to the Seller Terms of Service
                    </Label>
                  </div>
                </div>
              </div>
            </div>

            {/* Warning */}
            <Alert className="border-yellow-200 bg-yellow-50">
              <AlertTriangle className="h-4 w-4 text-yellow-600" />
              <AlertDescription className="text-yellow-800">
                <strong>Important:</strong> Your seller application will be reviewed by our team. Providing false information or violating these terms will result in permanent removal and potential legal action.
              </AlertDescription>
            </Alert>

            {/* Submit Button */}
            <Button
              onClick={handleSubmit}
              disabled={!allAgreed || submitting}
              className="w-full h-12 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-lg"
            >
              {submitting ? (
                "Processing..."
              ) : (
                <>
                  <CheckCircle className="w-5 h-5 mr-2" />
                  I Agree — Continue to Seller Profile Setup
                  <ArrowRight className="w-5 h-5 ml-2" />
                </>
              )}
            </Button>

            {!allAgreed && (
              <p className="text-center text-sm text-gray-500">
                Please check all boxes above to continue
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Seller Terms Modal */}
      {showSellerTermsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white max-w-3xl w-full max-h-[85vh] overflow-y-auto rounded-lg shadow-lg p-6 relative mx-4">
            <button
              type="button"
              onClick={() => setShowSellerTermsModal(false)}
              className="absolute top-4 right-4 text-gray-500 hover:text-gray-700"
            >
              ✕
            </button>

            <h2 className="text-2xl font-bold mb-4">
              Seller Terms & Conditions
            </h2>

            <div className="space-y-4 text-sm text-gray-700 leading-relaxed">

              <p>
                By participating as a seller on MyNeighbor Live Stream Shopping Marketplace,
                you acknowledge that selling on the platform is a privilege and is subject
                to compliance with these terms.
              </p>

              <h3 className="font-semibold">Platform Role</h3>
              <p>
                MyNeighbor provides marketplace technology only. All transactions are
                between buyers and sellers. The platform does not provide shipping services,
                labels, or delivery guarantees.
              </p>

              <h3 className="font-semibold">Local Delivery & Pickup</h3>
              <p>
                All sales are local. Sellers are responsible for coordinating pickup or
                delivery directly with buyers and completing delivery within five (5)
                calendar days.
              </p>

              <h3 className="font-semibold">Seller Responsibilities</h3>
              <p>
                Sellers are fully responsible for item accuracy, legality, taxes, delivery,
                buyer verification, and compliance with all applicable Arizona state,
                county, and local laws.
              </p>

              <h3 className="font-semibold">Buyer Responsibilities</h3>
              <p>
                Buyers are responsible for inspecting items at pickup or delivery and
                verifying condition at the time of exchange.
              </p>

              <h3 className="font-semibold">Platform Fees</h3>
              <p>
                Sellers agree to pay the platform fee. The current platform fee is eleven
                percent (11%). Sellers acknowledge that fees may increase or decrease as
                the platform evolves, and continued use constitutes acceptance of the
                current fee structure.
              </p>

              <h3 className="font-semibold">Prohibited & Illegal Items</h3>
              <p>
                Sellers must comply with all Arizona laws and regulations. Sellers assume
                full liability for prohibited, restricted, or illegal items.
              </p>

              <h3 className="font-semibold">Advertising-Only Use</h3>
              <p>
                Using the platform solely for advertising without genuine sales activity
                is not permitted and may result in suspension or penalties.
              </p>

              <h3 className="font-semibold">Enforcement & Changes</h3>
              <p>
                Violations may result in suspension or removal. These terms are subject
                to change, and the platform reserves the right to enforce policies to
                protect the marketplace community.
              </p>

            </div>
          </div>
        </div>
      )}
    </div>
  );
}