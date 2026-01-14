import React, { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase/supabaseClient";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Shield,
  MapPin,
  Calendar,
  AlertTriangle,
  CheckCircle,
  Eye,
  FileText,
  ArrowRight
} from "lucide-react";

/**
 * Validate and sanitize buyer redirect destination.
 * Prevents redirecting to invalid/unsafe pages (e.g., LiveShow without showId).
 * 
 * @param redirect - Raw redirect param from URL
 * @param searchParams - URLSearchParams to check for showId
 * @returns Safe, lowercase route name
 */
const getSafeBuyerRedirect = (redirect, searchParams) => {
  // Routes that are always safe for buyer redirect
  const safeRoutes = ['marketplace', 'buyerprofile'];

  if (!redirect) return 'marketplace';

  const normalized = redirect.toLowerCase();

  // LiveShow requires a showId parameter to be valid
  if (normalized === 'liveshow') {
    const showId = searchParams.get('showId') || searchParams.get('showid');
    if (showId) {
      return 'liveshow';
    }
    console.warn('[BuyerSafetyAgreement] LiveShow redirect blocked: missing showId. Falling back to Marketplace.');
    return 'marketplace';
  }

  // Allow known safe routes
  if (safeRoutes.includes(normalized)) {
    return normalized;
  }

  // Default fallback for unknown routes
  console.warn(`[BuyerSafetyAgreement] Unknown redirect "${redirect}" blocked. Falling back to Marketplace.`);
  return 'marketplace';
};

export default function BuyerSafetyAgreement() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [agreements, setAgreements] = useState({
    ageConfirmed: false,
    explicitContent: false,
    locationPermission: false,
    safetyRules: false,
    termsConditions: false
  });

  // Get redirect URL from query params with safety validation
  const urlParams = new URLSearchParams(window.location.search);
  const rawRedirect = urlParams.get('redirect');
  const redirectTo = getSafeBuyerRedirect(rawRedirect, urlParams);

  useEffect(() => {
    loadUser();
  }, []);

  const loadUser = async () => {
    try {
      const { data: { session }, error } = await supabase.auth.getSession();
      
      if (error || !session) {
        console.error("Error loading user:", error);
        navigate(createPageUrl("Login"), { replace: true });
        return;
      }

      const currentUser = session.user;
      setUser(currentUser);

      // If already agreed (check user_metadata), redirect
      if (currentUser.user_metadata?.buyer_safety_agreed === true) {
        // Preserve showId for LiveShow redirects
        const showId = urlParams.get('showId') || urlParams.get('showid');
        const targetUrl = redirectTo === 'liveshow' && showId
          ? createPageUrl("liveshow") + `?showId=${showId}`
          : createPageUrl(redirectTo);
        navigate(targetUrl, { replace: true });
        return;
      }
    } catch (error) {
      console.error("Error loading user:", error);
      navigate(createPageUrl("Login"), { replace: true });
    } finally {
      setLoading(false);
    }
  };

  const allAgreed = Object.values(agreements).every(v => v === true);

  const handleSubmit = async () => {
    if (!allAgreed || !user) return;

    setSubmitting(true);
    try {
      const now = new Date().toISOString();
      
      // ═══════════════════════════════════════════════════════════════════════════
      // STEP 1: Write canonical flag to public.users (Admin reads from here)
      // ═══════════════════════════════════════════════════════════════════════════
      const { error: usersUpdateError } = await supabase
        .from("users")
        .update({
          buyer_safety_agreed: true,
          buyer_safety_agreed_at: now,
          age_verified: true,
          age_verified_at: now,
          explicit_content_permission: true,
          location_permission_granted: true
        })
        .eq("id", user.id);

      if (usersUpdateError) {
        console.error("[BuyerSafetyAgreement] public.users update failed:", usersUpdateError);
        throw new Error("Failed to save agreement. Please try again.");
      }

      // ═══════════════════════════════════════════════════════════════════════════
      // STEP 2: Also write to user_metadata (for compatibility/UI convenience)
      // ═══════════════════════════════════════════════════════════════════════════
      const { error: metadataError } = await supabase.auth.updateUser({
        data: {
          buyer_safety_agreed: true,
          buyer_safety_agreed_at: now,
          age_verified: true,
          age_verified_at: now,
          explicit_content_permission: true,
          explicit_content_permission_at: now,
          location_permission_granted: true,
          location_permission_granted_at: now
        }
      });

      if (metadataError) {
        // Non-blocking - public.users is authoritative
        console.warn("[BuyerSafetyAgreement] metadata update failed (non-blocking):", metadataError);
      }

      // Redirect to intended page (preserve showId for LiveShow)
      const showId = urlParams.get('showId') || urlParams.get('showid');
      const targetUrl = redirectTo === 'liveshow' && showId
        ? createPageUrl("liveshow") + `?showId=${showId}`
        : createPageUrl(redirectTo);
      navigate(targetUrl, { replace: true });
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

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-purple-50 p-4 sm:p-8">
      <div className="max-w-2xl mx-auto">
        <Card className="shadow-xl border-0 overflow-hidden">
          <CardHeader className="bg-gradient-to-r from-purple-600 to-blue-600 text-white text-center py-8">
            <div className="w-20 h-20 bg-white/20 rounded-full mx-auto mb-4 flex items-center justify-center">
              <Shield className="w-10 h-10 text-white" />
            </div>
            <CardTitle className="text-2xl sm:text-3xl">Buyer Safety Agreement</CardTitle>
            <p className="text-white/80 mt-2">
              Please review and agree to our community safety guidelines
            </p>
          </CardHeader>

          <CardContent className="p-6 sm:p-8 space-y-6">
            {/* Age Confirmation */}
            <div className="space-y-3">
              <div className="flex items-start gap-3 p-4 bg-blue-50 rounded-lg border border-blue-200">
                <Calendar className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
                <div className="flex-1">
                  <h3 className="font-semibold text-gray-900 mb-1">Age Verification</h3>
                  <p className="text-sm text-gray-600 mb-3">
                    You must be at least 18 years old to use this platform. By checking this box, you confirm that you meet this age requirement.
                  </p>
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="ageConfirmed"
                      checked={agreements.ageConfirmed}
                      onCheckedChange={(checked) => setAgreements(prev => ({ ...prev, ageConfirmed: checked }))}
                    />
                    <Label htmlFor="ageConfirmed" className="text-sm font-medium cursor-pointer">
                      I confirm I am 18 years or older
                    </Label>
                  </div>
                </div>
              </div>
            </div>

            {/* Explicit Content */}
            <div className="space-y-3">
              <div className="flex items-start gap-3 p-4 bg-orange-50 rounded-lg border border-orange-200">
                <Eye className="w-5 h-5 text-orange-600 mt-0.5 flex-shrink-0" />
                <div className="flex-1">
                  <h3 className="font-semibold text-gray-900 mb-1">Content Acknowledgment</h3>
                  <p className="text-sm text-gray-600 mb-3">
                    Live shows may contain products or discussions intended for mature audiences. We prohibit illegal content but allow legal adult-oriented items.
                  </p>
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="explicitContent"
                      checked={agreements.explicitContent}
                      onCheckedChange={(checked) => setAgreements(prev => ({ ...prev, explicitContent: checked }))}
                    />
                    <Label htmlFor="explicitContent" className="text-sm font-medium cursor-pointer">
                      I acknowledge and accept the content policy
                    </Label>
                  </div>
                </div>
              </div>
            </div>

            {/* Location Permission */}
            <div className="space-y-3">
              <div className="flex items-start gap-3 p-4 bg-green-50 rounded-lg border border-green-200">
                <MapPin className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
                <div className="flex-1">
                  <h3 className="font-semibold text-gray-900 mb-1">Location Services</h3>
                  <p className="text-sm text-gray-600 mb-3">
                    The "Near Me" feature uses your location to show local sellers and pickup points. Your location is never shared publicly.
                  </p>
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="locationPermission"
                      checked={agreements.locationPermission}
                      onCheckedChange={(checked) => setAgreements(prev => ({ ...prev, locationPermission: checked }))}
                    />
                    <Label htmlFor="locationPermission" className="text-sm font-medium cursor-pointer">
                      I consent to location-based features
                    </Label>
                  </div>
                </div>
              </div>
            </div>

            {/* Safety Rules */}
            <div className="space-y-3">
              <div className="flex items-start gap-3 p-4 bg-purple-50 rounded-lg border border-purple-200">
                <Shield className="w-5 h-5 text-purple-600 mt-0.5 flex-shrink-0" />
                <div className="flex-1">
                  <h3 className="font-semibold text-gray-900 mb-1">Buyer Safety Rules</h3>
                  <ul className="text-sm text-gray-600 space-y-1 mb-3">
                    <li>• Only purchase from verified sellers</li>
                    <li>• Never share personal financial information in chat</li>
                    <li>• Report suspicious activity immediately</li>
                    <li>• Verify items at pickup before accepting</li>
                    <li>• Use in-app payment methods only</li>
                  </ul>
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="safetyRules"
                      checked={agreements.safetyRules}
                      onCheckedChange={(checked) => setAgreements(prev => ({ ...prev, safetyRules: checked }))}
                    />
                    <Label htmlFor="safetyRules" className="text-sm font-medium cursor-pointer">
                      I agree to follow the buyer safety rules
                    </Label>
                  </div>
                </div>
              </div>
            </div>

            {/* Terms and Conditions */}
            <div className="space-y-3">
              <div className="flex items-start gap-3 p-4 bg-gray-50 rounded-lg border border-gray-200">
                <FileText className="w-5 h-5 text-gray-600 mt-0.5 flex-shrink-0" />
                <div className="flex-1">
                  <h3 className="font-semibold text-gray-900 mb-1">Terms & Conditions</h3>
                  <p className="text-sm text-gray-600 mb-3">
                    By using this platform, you agree to our Terms of Service and Privacy Policy. You understand that all transactions are between you and the seller.
                  </p>
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="termsConditions"
                      checked={agreements.termsConditions}
                      onCheckedChange={(checked) => setAgreements(prev => ({ ...prev, termsConditions: checked }))}
                    />
                    <Label htmlFor="termsConditions" className="text-sm font-medium cursor-pointer">
                      I agree to the Terms of Service and Privacy Policy
                    </Label>
                  </div>
                </div>
              </div>
            </div>

            {/* Warning */}
            <Alert className="border-yellow-200 bg-yellow-50">
              <AlertTriangle className="h-4 w-4 text-yellow-600" />
              <AlertDescription className="text-yellow-800">
                <strong>Important:</strong> Providing false information or violating these terms may result in account suspension or permanent ban.
              </AlertDescription>
            </Alert>

            {/* Submit Button */}
            <Button
              onClick={handleSubmit}
              disabled={!allAgreed || submitting}
              className="w-full h-12 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-lg"
            >
              {submitting ? (
                "Processing..."
              ) : (
                <>
                  <CheckCircle className="w-5 h-5 mr-2" />
                  I Agree — Continue
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
    </div>
  );
}