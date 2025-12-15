import React, { useState, useEffect } from "react";
import { supabaseApi as base44 } from "@/api/supabaseClient";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  CheckCircle,
  Circle,
  ArrowRight,
  Store,
  Phone,
  FileCheck,
  Grid3X3,
  Layers,
  Building2,
  DollarSign,
  ShoppingCart,
  MapPin,
  CreditCard,
  Lock,
  ShieldCheck,
  AlertCircle,
  LogOut
} from "lucide-react";

const STEPS = [
  { id: "phone", label: "Phone Verification", icon: Phone },
  { id: "guidelines", label: "Guidelines & Agreements", icon: FileCheck },
  { id: "category", label: "Main Selling Category", icon: Grid3X3 },
  { id: "subcategory", label: "Subcategory", icon: Layers },
  { id: "type", label: "Seller Type", icon: Building2 },
  { id: "revenue", label: "Revenue Range", icon: DollarSign },
  { id: "channels", label: "Sales Channels", icon: ShoppingCart },
  { id: "address", label: "Return Address", icon: MapPin },
  { id: "payment", label: "Payment Method Setup", icon: CreditCard },
];

const CATEGORY_OPTIONS = [
  "Sports Cards", "Trading Cards", "Coins", "Comics", "Sneakers", "Vintage Clothing",
  "Electronics", "Collectibles", "Art", "Jewelry", "Antiques", "Books", "Music",
  "Movies", "Video Games", "Toys", "Home & Garden", "Tools", "Auto Parts", "Other"
];

const REVENUE_RANGES = [
  { value: "0-500", label: "$0 - $500" },
  { value: "500-2000", label: "$500 - $2,000" },
  { value: "2000-10000", label: "$2,000 - $10,000" },
  { value: "10000-50000", label: "$10,000 - $50,000" },
  { value: "50000+", label: "$50,000+" }
];

const SALES_CHANNELS = [
  { id: "website", label: "Website" },
  { id: "social_media", label: "Social Media" },
  { id: "store_warehouse", label: "Store/Warehouse" },
  { id: "other_platforms", label: "Other Platforms (Amazon/eBay/Etsy)" },
  { id: "just_starting", label: "Just Getting Started" }
];

export default function SellerOnboarding() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeStep, setActiveStep] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  
  // Form States
  const [phoneData, setPhoneData] = useState({ number: "", code: "" });
  const [guidelines, setGuidelines] = useState({
    honor: false,
    counterfeit: false,
    accurate: false,
    ship: false,
    minor: false
  });
  const [category, setCategory] = useState("");
  const [subcategory, setSubcategory] = useState("");
  const [sellerType, setSellerType] = useState("individual");
  const [revenueRange, setRevenueRange] = useState("");
  const [channels, setChannels] = useState([]);
  const [address, setAddress] = useState({
    fullName: "",
    line1: "",
    line2: "",
    city: "",
    state: "",
    zip: "",
    country: "US"
  });
  const [payment, setPayment] = useState({
    zip: "",
    country: "US"
  });

  useEffect(() => {
    loadUser();
  }, []);

  const loadUser = async () => {
    try {
      const currentUser = await base44.auth.me();
      
      // Check if seller entity exists (Legacy/Sync fix)
      const existingSellers = await base44.entities.Seller.filter({ created_by: currentUser.email });
      const hasSellerEntity = existingSellers.length > 0;

      // Redirect if already completed (prevent loop)
      if ((currentUser?.seller_onboarding_completed || hasSellerEntity) && currentUser.role !== "admin") {
        console.log("✅ Onboarding already complete - redirecting to Dashboard");
        navigate(createPageUrl("SellerDashboard"), { replace: true });
        return;
      }

      setUser(currentUser);
      
      // Pre-fill form data from user
      if (currentUser) {
        setPhoneData(prev => ({ ...prev, number: currentUser.phone_number || "" }));
        setGuidelines({
          honor: currentUser.seller_guideline_honor_purchases || false,
          counterfeit: currentUser.seller_guideline_no_counterfeit || false,
          accurate: currentUser.seller_guideline_accurate_descriptions || false,
          ship: currentUser.seller_guideline_ship_safely || false,
          minor: currentUser.seller_guideline_minor_preapproval || false
        });
        setCategory(currentUser.seller_main_category || "");
        setSubcategory(currentUser.seller_subcategory || "");
        setSellerType(currentUser.seller_type || "individual");
        setRevenueRange(currentUser.seller_revenue_range || "");
        setChannels(currentUser.seller_sales_channels || []);
        setAddress({
          fullName: currentUser.seller_return_full_name || "",
          line1: currentUser.seller_return_address_1 || "",
          line2: currentUser.seller_return_address_2 || "",
          city: currentUser.seller_return_city || "",
          state: currentUser.seller_return_state || "",
          zip: currentUser.seller_return_zip || "",
          country: currentUser.seller_return_country || "US"
        });
        setPayment({
          zip: currentUser.payment_billing_zip || "",
          country: currentUser.payment_billing_country || "US"
        });
      }
    } catch (error) {
      console.error("Error loading user:", error);
      base44.auth.redirectToLogin();
    } finally {
      setLoading(false);
    }
  };

  const updateStepStatus = async (stepId, isComplete) => {
    if (!user) return;

    const completedSteps = new Set(user.seller_onboarding_steps_completed || []);
    const remainingSteps = new Set(user.seller_onboarding_steps_remaining || STEPS.map(s => s.id));

    if (isComplete) {
      completedSteps.add(stepId);
      remainingSteps.delete(stepId);
    }

    const updates = {
      seller_onboarding_steps_completed: Array.from(completedSteps),
      seller_onboarding_steps_remaining: Array.from(remainingSteps)
    };

    // If all steps completed
    if (remainingSteps.size === 0) {
      updates.seller_onboarding_completed = true;
    }

    await base44.auth.updateMe(updates);
    await loadUser(); // Refresh user state
  };

  const handlePhoneSubmit = async () => {
    if (phoneData.number.length < 10) return alert("Please enter a valid phone number");
    setSubmitting(true);
    try {
      // Mock verification
      await base44.auth.updateMe({
        phone_number: phoneData.number,
        phone_verified: true,
        phone_verified_at: new Date().toISOString()
      });
      await updateStepStatus("phone", true);
      setActiveStep(null);
    } catch (error) {
      console.error("Error saving phone:", error);
    }
    setSubmitting(false);
  };

  const handleGuidelinesSubmit = async () => {
    if (!Object.values(guidelines).every(v => v)) return alert("Please accept all guidelines");
    setSubmitting(true);
    try {
      await base44.auth.updateMe({
        seller_guideline_honor_purchases: guidelines.honor,
        seller_guideline_no_counterfeit: guidelines.counterfeit,
        seller_guideline_accurate_descriptions: guidelines.accurate,
        seller_guideline_ship_safely: guidelines.ship,
        seller_guideline_minor_preapproval: guidelines.minor,
        seller_guidelines_accepted_at: new Date().toISOString()
      });
      await updateStepStatus("guidelines", true);
      setActiveStep(null);
    } catch (error) {
      console.error("Error saving guidelines:", error);
    }
    setSubmitting(false);
  };

  const handleGenericSubmit = async (fieldData, stepId) => {
    setSubmitting(true);
    try {
      await base44.auth.updateMe(fieldData);
      await updateStepStatus(stepId, true);
      setActiveStep(null);
    } catch (error) {
      console.error(`Error saving ${stepId}:`, error);
    }
    setSubmitting(false);
  };

  const isStepComplete = (stepId) => {
    return user?.seller_onboarding_steps_completed?.includes(stepId);
  };

  const allComplete = STEPS.every(step => isStepComplete(step.id));

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600"></div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-purple-50 to-blue-50 p-4 sm:p-8">
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-gradient-to-r from-purple-600 to-blue-600 rounded-full flex items-center justify-center mx-auto mb-4 shadow-lg">
            <Store className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-gray-900">Seller Setup</h1>
          <p className="text-gray-600 mt-2">Complete these steps to unlock your seller dashboard</p>
        </div>

        {/* Progress Bar */}
        <Card className="border-0 shadow-md mb-6">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-700">Setup Progress</span>
              <span className="text-sm text-purple-600 font-bold">
                {user?.seller_onboarding_steps_completed?.length || 0}/{STEPS.length}
              </span>
            </div>
            <div className="w-full bg-gray-100 rounded-full h-3">
              <div 
                className="bg-gradient-to-r from-purple-500 to-blue-500 h-3 rounded-full transition-all duration-500"
                style={{ width: `${((user?.seller_onboarding_steps_completed?.length || 0) / STEPS.length) * 100}%` }}
              />
            </div>
          </CardContent>
        </Card>

        {/* Steps List */}
        <div className="grid gap-4">
          {STEPS.map((step, index) => {
            const isComplete = isStepComplete(step.id);
            const StepIcon = step.icon;
            
            return (
              <Card 
                key={step.id}
                className={`border-l-4 transition-all hover:shadow-md cursor-pointer ${
                  isComplete 
                    ? "border-l-green-500 bg-white" 
                    : "border-l-gray-300 bg-gray-50/50"
                }`}
                onClick={() => setActiveStep(step.id)}
              >
                <CardContent className="p-4 flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                      isComplete ? "bg-green-100 text-green-600" : "bg-white border border-gray-200 text-gray-400"
                    }`}>
                      {isComplete ? <CheckCircle className="w-6 h-6" /> : <StepIcon className="w-5 h-5" />}
                    </div>
                    <div>
                      <h3 className={`font-semibold ${isComplete ? "text-gray-900" : "text-gray-700"}`}>
                        {step.label}
                      </h3>
                      <p className="text-xs text-gray-500">
                        {isComplete ? "Completed" : "Required"}
                      </p>
                    </div>
                  </div>
                  {!isComplete && <ArrowRight className="w-5 h-5 text-gray-400" />}
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Complete Button */}
        <Button 
          className={`w-full h-14 text-lg font-bold shadow-lg mt-8 transition-all ${
            allComplete 
              ? "bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700" 
              : "bg-gray-300 cursor-not-allowed"
          }`}
          disabled={!allComplete}
          onClick={async () => {
            // Force update completion flag to ensure consistency and prevent loops
            if (allComplete) {
              setSubmitting(true); // Show loading state
              try {
                // 1. Update the user record
                await base44.auth.updateMe({ 
                  seller_onboarding_completed: true,
                  // Also ensure completed steps are synced if needed
                  seller_onboarding_steps_remaining: [] 
                });
                
                // 2. Artificial delay to allow backend propagation and local cache update
                await new Promise(resolve => setTimeout(resolve, 1000));
                
                // 3. Redirect to dashboard
                console.log("✅ Onboarding complete, redirecting to dashboard...");
                navigate(createPageUrl("SellerDashboard"), { replace: true });
              } catch (error) {
                console.error("Error completing onboarding:", error);
                alert("Failed to complete setup. Please try again.");
                setSubmitting(false);
              }
            }
          }}
        >
          {allComplete ? (
            <>
              Go to Seller Dashboard <ArrowRight className="w-6 h-6 ml-2" />
            </>
          ) : (
            <>
              <Lock className="w-5 h-5 mr-2" /> Complete All Steps to Unlock Dashboard
            </>
          )}
        </Button>
        
        <Button
          variant="ghost"
          className="w-full text-gray-500 hover:text-red-600"
          onClick={() => base44.auth.logout()}
        >
          <LogOut className="w-4 h-4 mr-2" /> Log Out
        </Button>
      </div>

      {/* Step Dialogs */}
      <Dialog open={!!activeStep} onOpenChange={(open) => !open && setActiveStep(null)}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {activeStep && React.createElement(STEPS.find(s => s.id === activeStep)?.icon, { className: "w-5 h-5 text-purple-600" })}
              {STEPS.find(s => s.id === activeStep)?.label}
            </DialogTitle>
          </DialogHeader>

          <div className="py-4 space-y-6">
            {/* 1. Phone Verification */}
            {activeStep === "phone" && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Mobile Phone Number</Label>
                  <Input 
                    type="tel"
                    placeholder="(555) 123-4567"
                    value={phoneData.number}
                    onChange={(e) => setPhoneData({ ...phoneData, number: e.target.value })}
                  />
                  <p className="text-xs text-gray-500">We'll use this to verify your identity.</p>
                </div>
                <div className="p-3 bg-blue-50 rounded border border-blue-100 text-xs text-blue-800">
                  For this demo, just enter your number and click Verify. No SMS will be sent.
                </div>
                <Button onClick={handlePhoneSubmit} disabled={submitting} className="w-full bg-purple-600">
                  {submitting ? "Verifying..." : "Verify Phone"}
                </Button>
              </div>
            )}

            {/* 2. Guidelines */}
            {activeStep === "guidelines" && (
              <div className="space-y-4">
                {[
                  { id: "honor", label: "I agree to honor all completed purchases" },
                  { id: "counterfeit", label: "I will NOT sell counterfeit or prohibited items" },
                  { id: "accurate", label: "I will provide accurate item descriptions and photos" },
                  { id: "ship", label: "I will ship/deliver items quickly and safely" },
                  { id: "minor", label: "I acknowledge pre-approval is required for ages 13-17" }
                ].map((g) => (
                  <div key={g.id} className="flex items-start gap-3 p-3 border rounded-lg hover:bg-gray-50">
                    <Checkbox 
                      id={g.id}
                      checked={guidelines[g.id]}
                      onCheckedChange={(checked) => setGuidelines(prev => ({ ...prev, [g.id]: checked }))}
                    />
                    <Label htmlFor={g.id} className="text-sm leading-tight cursor-pointer font-normal">
                      {g.label}
                    </Label>
                  </div>
                ))}
                <Button onClick={handleGuidelinesSubmit} disabled={submitting} className="w-full bg-purple-600">
                  {submitting ? "Saving..." : "Accept Guidelines"}
                </Button>
              </div>
            )}

            {/* 3. Main Category */}
            {activeStep === "category" && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Select Your Primary Category</Label>
                  <Select value={category} onValueChange={setCategory}>
                    <SelectTrigger>
                      <SelectValue placeholder="Choose a category" />
                    </SelectTrigger>
                    <SelectContent className="max-h-[300px]">
                      {CATEGORY_OPTIONS.map(cat => (
                        <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button 
                  onClick={() => handleGenericSubmit({ seller_main_category: category }, "category")}
                  disabled={!category || submitting}
                  className="w-full bg-purple-600"
                >
                  Save Category
                </Button>
              </div>
            )}

            {/* 4. Subcategory */}
            {activeStep === "subcategory" && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Specific Niche / Subcategory</Label>
                  <Input 
                    placeholder="e.g., Vintage NBA Cards, Hand-poured Candles"
                    value={subcategory}
                    onChange={(e) => setSubcategory(e.target.value)}
                  />
                </div>
                <Button 
                  onClick={() => handleGenericSubmit({ seller_subcategory: subcategory }, "subcategory")}
                  disabled={!subcategory || submitting}
                  className="w-full bg-purple-600"
                >
                  Save Subcategory
                </Button>
              </div>
            )}

            {/* 5. Seller Type */}
            {activeStep === "type" && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div 
                    className={`p-4 border rounded-lg cursor-pointer text-center ${sellerType === "individual" ? "border-purple-600 bg-purple-50 ring-1 ring-purple-600" : "hover:bg-gray-50"}`}
                    onClick={() => setSellerType("individual")}
                  >
                    <Building2 className="w-8 h-8 mx-auto mb-2 text-gray-600" />
                    <p className="font-semibold">Individual</p>
                    <p className="text-xs text-gray-500">Casual seller</p>
                  </div>
                  <div 
                    className={`p-4 border rounded-lg cursor-pointer text-center ${sellerType === "registered_business" ? "border-purple-600 bg-purple-50 ring-1 ring-purple-600" : "hover:bg-gray-50"}`}
                    onClick={() => setSellerType("registered_business")}
                  >
                    <Store className="w-8 h-8 mx-auto mb-2 text-gray-600" />
                    <p className="font-semibold">Business</p>
                    <p className="text-xs text-gray-500">Registered LLC/Corp</p>
                  </div>
                </div>
                <Button 
                  onClick={() => handleGenericSubmit({ seller_type: sellerType }, "type")}
                  disabled={!sellerType || submitting}
                  className="w-full bg-purple-600"
                >
                  Save Seller Type
                </Button>
              </div>
            )}

            {/* 6. Revenue Range */}
            {activeStep === "revenue" && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Estimated Monthly Revenue</Label>
                  <Select value={revenueRange} onValueChange={setRevenueRange}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select range" />
                    </SelectTrigger>
                    <SelectContent>
                      {REVENUE_RANGES.map(range => (
                        <SelectItem key={range.value} value={range.value}>{range.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button 
                  onClick={() => handleGenericSubmit({ seller_revenue_range: revenueRange }, "revenue")}
                  disabled={!revenueRange || submitting}
                  className="w-full bg-purple-600"
                >
                  Save Revenue Info
                </Button>
              </div>
            )}

            {/* 7. Sales Channels */}
            {activeStep === "channels" && (
              <div className="space-y-4">
                <Label>Where else do you sell? (Select all that apply)</Label>
                <div className="space-y-2">
                  {SALES_CHANNELS.map((channel) => (
                    <div key={channel.id} className="flex items-center gap-3 p-3 border rounded-lg hover:bg-gray-50">
                      <Checkbox 
                        id={channel.id}
                        checked={channels.includes(channel.id)}
                        onCheckedChange={(checked) => {
                          if (checked) setChannels([...channels, channel.id]);
                          else setChannels(channels.filter(c => c !== channel.id));
                        }}
                      />
                      <Label htmlFor={channel.id} className="cursor-pointer font-normal">
                        {channel.label}
                      </Label>
                    </div>
                  ))}
                </div>
                <Button 
                  onClick={() => handleGenericSubmit({ seller_sales_channels: channels }, "channels")}
                  disabled={channels.length === 0 || submitting}
                  className="w-full bg-purple-600"
                >
                  Save Channels
                </Button>
              </div>
            )}

            {/* 8. Return Address */}
            {activeStep === "address" && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Full Name / Business Name</Label>
                  <Input 
                    value={address.fullName} 
                    onChange={e => setAddress({ ...address, fullName: e.target.value })} 
                  />
                </div>
                <div className="space-y-2">
                  <Label>Address Line 1</Label>
                  <Input 
                    value={address.line1} 
                    onChange={e => setAddress({ ...address, line1: e.target.value })} 
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-2">
                    <Label>City</Label>
                    <Input 
                      value={address.city} 
                      onChange={e => setAddress({ ...address, city: e.target.value })} 
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>State</Label>
                    <Input 
                      value={address.state} 
                      onChange={e => setAddress({ ...address, state: e.target.value })} 
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-2">
                    <Label>ZIP Code</Label>
                    <Input 
                      value={address.zip} 
                      onChange={e => setAddress({ ...address, zip: e.target.value })} 
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Country</Label>
                    <Input 
                      value={address.country} 
                      onChange={e => setAddress({ ...address, country: e.target.value })} 
                      disabled
                    />
                  </div>
                </div>
                <Button 
                  onClick={() => handleGenericSubmit({
                    seller_return_full_name: address.fullName,
                    seller_return_address_1: address.line1,
                    seller_return_address_2: address.line2,
                    seller_return_city: address.city,
                    seller_return_state: address.state,
                    seller_return_zip: address.zip,
                    seller_return_country: address.country
                  }, "address")}
                  disabled={!address.fullName || !address.line1 || !address.city || !address.state || !address.zip || submitting}
                  className="w-full bg-purple-600"
                >
                  Save Address
                </Button>
              </div>
            )}

            {/* 9. Payment Method Setup */}
            {activeStep === "payment" && (
              <div className="space-y-4">
                <div className="bg-yellow-50 p-4 rounded-lg border border-yellow-200 mb-4">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="w-5 h-5 text-yellow-600 mt-0.5" />
                    <p className="text-sm text-yellow-800">
                      Securely connect your payout method. For this onboarding demo, we'll just confirm your billing location.
                    </p>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Billing ZIP Code</Label>
                  <Input 
                    value={payment.zip} 
                    onChange={e => setPayment({ ...payment, zip: e.target.value })} 
                  />
                </div>
                <div className="space-y-2">
                  <Label>Billing Country</Label>
                  <Input 
                    value={payment.country} 
                    onChange={e => setPayment({ ...payment, country: e.target.value })} 
                    disabled
                  />
                </div>
                <Button 
                  onClick={() => handleGenericSubmit({
                    payment_billing_zip: payment.zip,
                    payment_billing_country: payment.country,
                    payment_setup_status: "completed",
                    payment_setup_completed_at: new Date().toISOString()
                  }, "payment")}
                  disabled={!payment.zip || submitting}
                  className="w-full bg-purple-600"
                >
                  Confirm Payment Setup
                </Button>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}