import React, { useState, useEffect } from "react";
import { supabaseApi as base44 } from "@/api/supabaseClient";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
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
  Scale
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

  useEffect(() => {
    loadUser();
  }, []);

  const loadUser = async () => {
    try {
      // Check if user is authenticated first
      const isAuthenticated = await base44.auth.isAuthenticated();
      
      if (!isAuthenticated) {
        // Not logged in - redirect to login, then come back here
        console.log("🔐 User not authenticated - redirecting to login");
        base44.auth.redirectToLogin(createPageUrl("SellerSafetyAgreement"));
        return;
      }
      
      const currentUser = await base44.auth.me();
      setUser(currentUser);

      // If already agreed, redirect based on completion status
      // CRITICAL: Do NOT redirect if onboarding_reset is true - force re-agreement
      if (currentUser.seller_safety_agreed && currentUser.seller_onboarding_reset !== true) {
        // Check if seller entity exists (Legacy/Sync fix)
        const existingSellers = await base44.entities.Seller.filter({ created_by: currentUser.email });
        const hasSellerEntity = existingSellers.length > 0;

        if (currentUser.seller_onboarding_completed || hasSellerEntity) {
          console.log("✅ Safety agreed & Onboarding complete - redirecting to Dashboard");
          navigate(createPageUrl("SellerDashboard"), { replace: true });
        } else {
          // Check if steps are done (Auto-repair logic mirror)
          const completedSteps = currentUser.seller_onboarding_steps_completed || [];
          if (completedSteps.length >= 9) {
             console.log("✅ Safety agreed & Steps complete (flag missing) - redirecting to Dashboard");
             navigate(createPageUrl("SellerDashboard"), { replace: true });
          } else {
             console.log("⚠️ Safety agreed but Onboarding incomplete - redirecting to Onboarding");
             navigate(createPageUrl("SellerOnboarding"), { replace: true });
          }
        }
        return;
      }
      } catch (error) {
      console.error("Error loading user:", error);
      // Only redirect to login if strictly necessary (e.g. 401)
      // Avoid redirect loop if it's just a network cancellation
      if (error?.response?.status === 401) {
        base44.auth.redirectToLogin(createPageUrl("SellerSafetyAgreement"));
      }
      return;
      }
    setLoading(false);
  };

  const allAgreed = Object.values(agreements).every(v => v === true);

  const handleSubmit = async () => {
    if (!allAgreed) return;

    setSubmitting(true);
    try {
      const now = new Date().toISOString();
      
      await base44.auth.updateMe({
        seller_safety_agreed: true,
        seller_safety_agreed_at: now,
        seller_status: "pending",
        // Clear the onboarding reset flag once agreement is accepted
        seller_onboarding_reset: false,
        seller_onboarding_reset_at: null,
        seller_onboarding_reset_by: null
      });

      // Redirect to seller onboarding steps
      navigate(createPageUrl("SellerOnboarding"), { replace: true });
      } catch (error) {
      console.error("Error saving agreement:", error);
      alert("Failed to save agreement. Please try again.");
      }
      setSubmitting(false);
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
    </div>
  );
}