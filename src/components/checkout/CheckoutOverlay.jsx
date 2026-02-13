import React, { useState, useEffect, useMemo, useRef } from "react";
import { supabase } from "@/lib/supabase/supabaseClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { CheckCircle, MapPin, AlertCircle, CreditCard, X, Shield, Loader2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getBuyerProfileByUserId, createBuyerProfile } from "@/api/buyers";
import { getProductById } from "@/api/products";
import { createPaymentIntent, pollOrderPaymentStatus, pollCheckoutIntentConverted } from "@/api/payments";
import { checkAccountActiveAsync } from "@/lib/auth/accountGuards";
import { isShowLive } from "@/api/streamSync";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, useStripe, useElements } from "@stripe/react-stripe-js";

// Feature flag for live payments
const USE_LIVE_PAYMENTS = import.meta.env.VITE_STRIPE_ENABLED === "true";

// Inner component for Stripe payment form (must be inside <Elements>)
function StripePaymentForm({
  onPaymentSuccess,
  onPaymentError,
  isSubmitting,
  setIsSubmitting,
  checkoutIntentId,
  seller,
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [paymentError, setPaymentError] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!stripe || !elements) {
      setPaymentError("Payment system not ready. Please wait.");
      return;
    }

    if (isSubmitting || isProcessing) {
      return;
    }

    setIsProcessing(true);
    setIsSubmitting(true);
    setPaymentError(null);

    try {
      // Confirm payment with Stripe
      const { error, paymentIntent } = await stripe.confirmPayment({
        elements,
        confirmParams: {
          return_url: window.location.href,
        },
        redirect: "if_required",
      });

      if (error) {
        // Payment failed
        setPaymentError(error.message || "Payment failed. Please try again.");
        onPaymentError(error.message || "Payment failed");
      } else if (paymentIntent && (paymentIntent.status === "succeeded" || paymentIntent.status === "processing")) {
        if (checkoutIntentId) {
          const converted = await pollCheckoutIntentConverted(checkoutIntentId, 30, 2000);
          if (converted) {
            onPaymentSuccess(converted.orderId, converted.completionCode);
          } else {
            setPaymentError("Payment is still processing. You'll receive confirmation shortly.");
          }
        } else {
          setPaymentError("Checkout session missing. Please try again.");
        }
      } else {
        // Fallback: show processing message
        setPaymentError("Payment is still processing. You'll receive confirmation shortly.");
      }
    } catch (err) {
      setPaymentError(err.message || "An unexpected error occurred.");
      onPaymentError(err.message);
    } finally {
      setIsProcessing(false);
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="bg-white border border-gray-200 rounded-lg p-4">
        <PaymentElement
          options={{
            layout: "tabs",
          }}
        />
      </div>

      {paymentError && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{paymentError}</AlertDescription>
        </Alert>
      )}

      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertDescription className="text-xs">
          Your payment is processed securely via Stripe.
          This is a local pickup only from {seller?.business_name}.
        </AlertDescription>
      </Alert>

      <Button
        type="submit"
        className="w-full bg-gradient-to-r from-purple-600 to-blue-500 text-lg py-6"
        disabled={!stripe || !elements || isSubmitting || isProcessing}
      >
        {isSubmitting || isProcessing ? (
          <>
            <Loader2 className="w-5 h-5 mr-2 animate-spin" />
            Processing Payment...
          </>
        ) : (
          <>
            <CreditCard className="w-5 h-5 mr-2" />
            Pay Now
          </>
        )}
      </Button>

      <p className="text-xs text-center text-gray-500">
        Secure payment powered by Stripe
      </p>
    </form>
  );
}

export default function CheckoutOverlay({ product, seller, show, buyerProfile, checkoutIntentId, onClose, onIntentExpired }) {
  const navigate = useNavigate();
  const [step, setStep] = useState(buyerProfile ? "confirm" : "profile");
  const [profileData, setProfileData] = useState({
    full_name: "",
    phone: "",
    email: ""
  });
  const [orderComplete, setOrderComplete] = useState(false);
  const [orderId, setOrderId] = useState(null);
  const [completionCode, setCompletionCode] = useState(null);
  const [isVisible, setIsVisible] = useState(false);
  const [user, setUser] = useState(null);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [checkoutError, setCheckoutError] = useState(null);
  const [isSoldOut, setIsSoldOut] = useState(false);
  const [paymentStep, setPaymentStep] = useState(null); // null | "processing" | "awaiting_confirmation"
  const [pendingOrderId, setPendingOrderId] = useState(null);
  const [clientSecret, setClientSecret] = useState(null);
  const [lockExpiresAt, setLockExpiresAt] = useState(null);
  const [sessionExpired, setSessionExpired] = useState(false);
  const [intentValid, setIntentValid] = useState(null);
  const checkoutInFlightRef = useRef(false);
  const onIntentExpiredRef = useRef(onIntentExpired);
  const onCloseRef = useRef(onClose);

  useEffect(() => { onIntentExpiredRef.current = onIntentExpired; }, [onIntentExpired]);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);

  // On mount: fetch checkout_intents by id; if invalid or expired, close overlay and show banner (do not render Stripe)
  useEffect(() => {
    if (!checkoutIntentId) {
      setIntentValid(false);
      setSessionExpired(true);
      if (typeof onIntentExpiredRef.current === "function") onIntentExpiredRef.current();
      return;
    }
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("checkout_intents")
        .select("intent_status, intent_expires_at")
        .eq("id", checkoutIntentId)
        .single();
      if (cancelled) return;
      if (error || !data) {
        setIntentValid(false);
        setSessionExpired(true);
        if (typeof onIntentExpiredRef.current === "function") onIntentExpiredRef.current();
        return;
      }
      const notExpired = data?.intent_expires_at ? new Date(data.intent_expires_at) > new Date() : false;
      const status = data?.intent_status;
      const valid = (status === "intent" || status === "locked") && notExpired;
      setIntentValid(valid);
      if (!valid) {
        setSessionExpired(true);
        if (typeof onIntentExpiredRef.current === "function") onIntentExpiredRef.current();
      }
    })();
    return () => { cancelled = true; };
  }, [checkoutIntentId]);

  // On unmount: clear client secret so Stripe Elements are not left mounted
  useEffect(() => {
    return () => setClientSecret(null);
  }, []);

  // ═══════════════════════════════════════════════════════════════════════════
  // STRIPE CONNECT: Initialize Stripe with connected account ID
  // For Stripe Connect, PaymentElement requires stripeAccount to match the
  // account where the PaymentIntent was created (destination charges)
  // ═══════════════════════════════════════════════════════════════════════════
  const stripePromise = useMemo(() => {
    if (!USE_LIVE_PAYMENTS) return null;
    
    const publishableKey = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY;
    if (!publishableKey) return null;
    
    // If seller has a connected Stripe account, pass it to loadStripe
    // This is REQUIRED for PaymentElement to work with Connect
    const stripeOptions = seller?.stripe_account_id
      ? { stripeAccount: seller.stripe_account_id }
      : undefined;
    
    return loadStripe(publishableKey, stripeOptions);
  }, [seller?.stripe_account_id]);

  useEffect(() => {
    loadUser();
  }, []);

  const loadUser = async () => {
    try {
      const { data, error } = await supabase.auth.getUser();
      const currentUser = data?.user ?? null;
      
      if (error || !currentUser) {
        setUser(null);
        setLoadingProfile(false);
        return;
      }

      setUser(currentUser);
      
      // Check if buyer profile exists using Supabase API
      const profile = await getBuyerProfileByUserId(currentUser.id);
      
      if (profile) {
        // Pre-fill form data with existing profile
        setProfileData({
          full_name: profile.full_name || currentUser.user_metadata?.full_name || "",
          phone: profile.phone || "",
          email: profile.email || currentUser.email || ""
        });
        
        // Skip to confirmation step
        setStep("confirm");
      } else {
        // Pre-fill with user data from authentication
        setProfileData({
          full_name: currentUser.user_metadata?.full_name || "",
          phone: "",
          email: currentUser.email || ""
        });
        // Show profile form
        setStep("profile");
      }
    } catch (error) {
      setUser(null);
    } finally {
      setLoadingProfile(false);
    }
  };

  // SAFETY CHECK: Verify buyer safety agreement
  const needsSafetyAgreement = user && user.user_metadata?.buyer_safety_agreed !== true;

  // ═══════════════════════════════════════════════════════════════════════════
  // LIFECYCLE GATING: Early check if show is live (stream_status === "live")
  // ═══════════════════════════════════════════════════════════════════════════
  const showIsLive = isShowLive(show);

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    setTimeout(() => setIsVisible(true), 10);
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, []);

  // Force close checkout when lock expires (4 min); no payment after expiry
  useEffect(() => {
    if (!lockExpiresAt) return;
    const t = new Date(lockExpiresAt).getTime() - Date.now();
    if (t <= 0) {
      if (typeof onIntentExpiredRef.current === "function") onIntentExpiredRef.current();
      handleClose();
      return;
    }
    const timer = setTimeout(() => {
      if (typeof onIntentExpiredRef.current === "function") onIntentExpiredRef.current();
      handleClose();
    }, t);
    return () => clearTimeout(timer);
  }, [lockExpiresAt]);

  const handleClose = () => {
    setIsVisible(false);
    setTimeout(() => onClose(), 300);
  };

  const generateCompletionCode = () => {
    return Math.floor(100000000 + Math.random() * 900000000).toString();
  };

  const generateBatchNumber = (showId, buyerId) => {
    const shortShowId = showId.substring(0, 8);
    const shortBuyerId = buyerId.substring(0, 8);
    const timestamp = new Date().toISOString().split('T')[0].replace(/-/g, '');
    return `BATCH-${shortShowId}-${shortBuyerId}-${timestamp}`;
  };

  const handleCreateBuyerProfile = async (data) => {
    if (!user) return false;
    
    const profile = await createBuyerProfile({
      user_id: user.id,
      full_name: data.full_name,
      phone: data.phone,
      email: data.email,
    });
    
    if (profile) {
      setStep("confirm");
      return true;
    }
    return false;
  };

  const validateProductAvailability = async () => {
    console.log("[VALIDATE AVAILABILITY] checking product.id:", product?.id);
    // Check current product availability
    const currentProduct = await getProductById(product.id);
    console.log("[VALIDATE AVAILABILITY] fetched currentProduct:", {
      id: currentProduct?.id,
      status: currentProduct?.status,
      quantity: currentProduct?.quantity,
      title: currentProduct?.title,
    });
    
    if (!currentProduct) {
      console.log("[CHECKOUT BLOCKED] reason: product not found in DB", {
        requestedProductId: product?.id,
        productTitle: product?.title,
      });
      throw new Error("Product not found");
    }
      
    if ((currentProduct.quantity || 0) <= 0) {
      console.log("[CHECKOUT BLOCKED] reason: DB quantity <= 0", {
        productId: currentProduct?.id,
        dbQuantity: currentProduct?.quantity,
        dbStatus: currentProduct?.status,
        propQuantity: product?.quantity,
      });
      throw new Error("Product is out of stock");
    }
      
    if (currentProduct.status !== "active") {
      console.log("[CHECKOUT BLOCKED] reason: DB status is not active", {
        productId: currentProduct?.id,
        dbStatus: currentProduct?.status,
        dbQuantity: currentProduct?.quantity,
      });
      throw new Error("Product is not available");
    }
    
    console.log("[VALIDATE AVAILABILITY] product is available, proceeding");
    return currentProduct;
  };

  const processOrder = async () => {
    console.log("[PROCESS ORDER] starting processOrder()");
    if (!user) {
      console.log("[CHECKOUT BLOCKED] reason: no user", { user });
      throw new Error("Please log in to complete your purchase");
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // LIFECYCLE GATING: Only allow orders when show is actually live
    // ═══════════════════════════════════════════════════════════════════════════
    if (!isShowLive(show)) {
      const status = show?.status || "unknown";
      console.log("[CHECKOUT BLOCKED] reason: show not live", {
        showStatus: status,
        streamStatus: show?.stream_status,
        showId: show?.id,
      });
      if (status === "scheduled") {
        throw new Error("This show hasn't started yet. Please wait for the show to go live.");
      } else if (status === "ended") {
        throw new Error("This show has ended. Orders are no longer being accepted.");
      } else if (status === "cancelled") {
        throw new Error("This show has been cancelled. Orders cannot be placed.");
      } else {
        throw new Error("Orders can only be placed during a live show.");
      }
    }

    const pickupCode = `PU${Date.now().toString().slice(-8)}`;
    const pickupLocation = seller.pickup_address 
      ? `${seller.pickup_address}, ${seller.pickup_city || ""}, ${seller.pickup_state || ""}`
      : "";

    // Validate product is still available
    await validateProductAvailability();

    // Paid-only batch: no batch creation here. Batch will be created on payment success (webhook).
    const finalBatchNumber = generateBatchNumber(show.id, user.id);
    const finalCompletionCode = generateCompletionCode();

    // ═══════════════════════════════════════════════════════════════════════════
    // DIAGNOSTIC LOGGING: Trace product ID at INSERT payload creation
    // ═══════════════════════════════════════════════════════════════════════════
    console.log("[CHECKOUT INSERT] product.id:", product?.id);
    console.log("[CHECKOUT INSERT] product.show_product_id:", product?.show_product_id);
    console.log("[CHECKOUT INSERT] product.product_id:", product?.product_id);
    console.log("[CHECKOUT INSERT] product.title:", product?.title);

    // Create the order (with inventory enforcement at DB layer)
    // Use live payments if enabled, otherwise demo mode
    // DUAL-WRITE (Step T3.6): Pass both seller identifiers
    // Paid-only: batch_id is null for live payment; batch created on payment success (webhook)
    const orderPayload = {
      batch_id: null,
      buyer_id: user.id,
      buyer_name: profileData.full_name,
      buyer_email: profileData.email,
      buyer_phone: profileData.phone,
      seller_user_id: seller.user_id,  // Legacy: auth.users.id (DB FK)
      seller_id: seller.id,            // Canonical: sellers.id (entity PK)
      show_id: show.id,
      product_id: product.id,
      product_title: product.title,
      product_image_url: product.image_urls?.[0] || product.image_url,
      price: (product.price || 0) + (product.delivery_fee || 0),
      delivery_fee: product.delivery_fee || 0,
      pickup_code: pickupCode,
      pickup_location: pickupLocation,
      pickup_notes: product.pickup_notes || seller.pickup_notes || "",
      group_code: finalBatchNumber,
      completion_code: finalCompletionCode,
      useLivePayment: USE_LIVE_PAYMENTS,
    };
    console.log("[ORDER PAYLOAD FINAL]", orderPayload);

    const { order, error: orderError } = await createOrderWithResult(orderPayload);
    console.log("[PROCESS ORDER] createOrderWithResult returned:", {
      orderId: order?.id,
      orderError: orderError,
      errorType: orderError?.type,
      errorMessage: orderError?.message,
      isSoldOut: orderError?.isSoldOut,
    });

    // Handle inventory/sold out errors from database
    if (orderError) {
      console.log("[CHECKOUT BLOCKED] reason: orderError from DB", {
        errorType: orderError?.type,
        errorMessage: orderError?.message,
        isSoldOut: orderError?.isSoldOut,
        fullError: orderError,
      });
      if (orderError.isSoldOut) {
        console.log("[SOLD OUT MESSAGE TRIGGERED] source: orderError.isSoldOut flag");
        const soldOutError = new Error("SOLD_OUT");
        soldOutError.isSoldOut = true;
        soldOutError.displayMessage = "Sorry, this item just sold out!";
        throw soldOutError;
      }
      throw new Error(orderError.message || "Failed to create order");
    }

    if (!order) {
      console.log("[CHECKOUT BLOCKED] reason: order is null after createOrderWithResult");
      throw new Error("Failed to create order");
    }
    console.log("[PROCESS ORDER] order created successfully:", order?.id);

    // Signal LiveShow to refresh product list (slight delay for read-after-write consistency)
    setTimeout(() => {
      window.dispatchEvent(new Event("lm:inventory_updated"));
    }, 300);

    // Paid-only: batch totals updated by webhook on payment success
    return { order, completionCode: finalCompletionCode, batch: null, batchCreated: false, useLivePayment: USE_LIVE_PAYMENTS };
  };

  const handleProfileSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    setCheckoutError(null);
    
    try {
      const success = await handleCreateBuyerProfile(profileData);
      if (!success) {
        setCheckoutError("Failed to save profile. Please try again.");
      }
      } catch (error) {
      setCheckoutError(error.message || "Failed to save profile");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle successful payment from StripePaymentForm
  const handlePaymentSuccess = (paidOrderId, paidCompletionCode) => {
    setOrderId(paidOrderId);
    setCompletionCode(paidCompletionCode);
    setOrderComplete(true);
    setPaymentStep(null);
    setClientSecret(null);
  };

  // Handle payment error from StripePaymentForm
  const handlePaymentError = (errorMessage) => {
    setCheckoutError(errorMessage);
    setPaymentStep(null);
  };

  const handleCheckout = async () => {
    // hard single-flight guard (prevents double click/tap before state updates)
    if (checkoutInFlightRef.current) return;
    checkoutInFlightRef.current = true;

    try {
      if (isSubmitting) return;
      if (!checkoutIntentId) {
        setCheckoutError("Checkout session not found. Please try again from the product.");
        return;
      }

      if (user?.id) {
        const { canProceed, error: guardError } = await checkAccountActiveAsync(supabase, user.id);
        if (!canProceed) {
          setCheckoutError(guardError);
          return;
        }
      }

      setIsSubmitting(true);
      setCheckoutError(null);
      setIsSoldOut(false);
      setPaymentStep("processing");

      if (!stripePromise || !import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY) {
        throw new Error("Stripe is not configured. Please contact support.");
      }

      const result = await createPaymentIntent(checkoutIntentId);
      const errMsg = result.error || null;

      if (errMsg && (errMsg.toLowerCase().includes("expired") || errMsg.toLowerCase().includes("intent expired"))) {
        if (typeof onIntentExpired === "function") onIntentExpired();
        handleClose();
        return;
      }

      if (errMsg || !result.clientSecret) {
        throw new Error(errMsg || "Failed to initialize payment");
      }

      setClientSecret(result.clientSecret);
      setLockExpiresAt(result.lockExpiresAt || null);
      setPaymentStep("stripe_elements");
      setIsSubmitting(false);
    } catch (error) {
      setPaymentStep(null);
      setClientSecret(null);
      const msg = error?.message || "Checkout failed. Please try again.";
      if (msg.toLowerCase().includes("expired") || msg.toLowerCase().includes("intent expired")) {
        if (typeof onIntentExpired === "function") onIntentExpired();
        handleClose();
        return;
      }
      setCheckoutError(msg);
    } finally {
      checkoutInFlightRef.current = false;
      if (!clientSecret) {
        setIsSubmitting(false);
      }
    }
  };

  const handleViewOrder = () => {
    handleClose();
    setTimeout(() => navigate(createPageUrl("BuyerOrders")), 300);
  };

  // Show loading state while checking profile
  if (loadingProfile) {
    return (
      <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm">
        <div className="bg-white rounded-lg p-6 flex flex-col items-center gap-4">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600"></div>
          <p className="text-gray-700">Loading...</p>
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // LIFECYCLE GATING UI: Show error if show is not live
  // ═══════════════════════════════════════════════════════════════════════════
  if (!showIsLive) {
    const statusMessage = show?.status === "scheduled" 
      ? "This show hasn't started yet"
      : show?.status === "ended"
        ? "This show has ended"
        : show?.status === "cancelled"
          ? "This show was cancelled"
          : "Show is not currently live";
    
    return (
      <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm">
        <div className="bg-white rounded-lg p-6 max-w-sm mx-4 text-center">
          <AlertCircle className="w-12 h-12 text-orange-500 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-900 mb-2">
            Cannot Place Order
          </h3>
          <p className="text-gray-600 mb-4">
            {statusMessage}. Orders can only be placed during live shows.
          </p>
          <Button onClick={() => handleClose()} className="w-full">
            Close
          </Button>
        </div>
      </div>
    );
  }

  // Session expired: show banner only; do not render Stripe Elements
  if (sessionExpired || intentValid === false) {
    return (
      <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm">
        <div className="bg-white rounded-lg p-6 max-w-sm mx-4 text-center">
          <AlertCircle className="w-12 h-12 text-orange-500 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-900 mb-2">
            Session expired — item is being restocked
          </h3>
          <p className="text-gray-600 mb-4">
            This checkout session has expired. The product is being returned to the show.
          </p>
          <Button onClick={() => handleClose()} className="w-full">
            Close
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`fixed inset-0 z-[200] flex items-end transition-opacity duration-300 ${isVisible ? 'opacity-100' : 'opacity-0'}`}
    >
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={() => handleClose()}
      />
      
      {/* Bottom Sheet */}
      <Card 
        className={`relative w-full shadow-2xl border-0 rounded-t-3xl rounded-b-none transform transition-transform duration-300 ${
          orderComplete ? 'max-h-[85vh]' : 'max-h-[40vh]'
        } overflow-y-auto ${isVisible ? 'translate-y-0' : 'translate-y-full'}`}
      >
        {/* SAFETY: Redirect to safety agreement if not accepted */}
        {needsSafetyAgreement ? (
          <>
            <CardHeader className="bg-gradient-to-r from-purple-600 to-blue-600 text-white">
              <CardTitle className="flex items-center gap-2">
                <Shield className="w-6 h-6" />
                Safety Agreement Required
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6 text-center">
              <Shield className="w-16 h-16 text-purple-500 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                Please Accept Our Safety Terms
              </h3>
              <p className="text-gray-600 mb-4">
                Before making a purchase, you need to review and accept our buyer safety guidelines.
              </p>
              <Button
                onClick={() => {
                  handleClose();
                  navigate(createPageUrl("BuyerSafetyAgreement") + `?redirect=LiveShow`);
                }}
                className="w-full bg-gradient-to-r from-purple-600 to-blue-600"
              >
                <Shield className="w-4 h-4 mr-2" />
                Review Safety Agreement
              </Button>
            </CardContent>
          </>
        ) : (
          <>
            {orderComplete ? (
              // Order Complete View (adapted for Card structure)
              <>
                <CardHeader className="relative pb-2">
                  <div className="flex justify-center mb-4">
                    <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center">
                      <CheckCircle className="w-10 h-10 text-green-600" />
                    </div>
                  </div>
                  <CardTitle className="text-2xl font-bold text-center">Order Complete!</CardTitle>
                  <button
                    onClick={() => handleClose()}
                    className="absolute top-4 right-4 p-2 hover:bg-gray-100 rounded-full transition-colors"
                  >
                    <X className="w-5 h-5 text-gray-600" />
                  </button>
                </CardHeader>
                <CardContent className="px-6 pb-6 pt-0">
                  <p className="text-gray-600 text-center mb-6">
                    Your order has been placed successfully with {seller?.business_name || "the seller"}.
                  </p>

                  {completionCode && (
                    <div className="bg-gradient-to-r from-purple-50 to-blue-50 border-2 border-purple-200 p-5 rounded-xl mb-4">
                      <p className="text-sm text-gray-600 mb-1 text-center font-semibold">Your Pickup Verification Code</p>
                      <p className="text-4xl font-bold text-purple-600 text-center tracking-wider">
                        {completionCode}
                      </p>
                      <p className="text-xs text-gray-500 text-center mt-2">
                        Show this code to the seller at pickup
                      </p>
                    </div>
                  )}

                  {orderId && (
                    <div className="bg-blue-50 p-4 rounded-lg mb-6">
                      <p className="text-sm text-gray-600 mb-1 text-center">Individual Item Code</p>
                      <p className="text-xl font-bold text-blue-600 text-center">
                        {orderId.slice(-8).toUpperCase()}
                      </p>
                    </div>
                  )}

                  {seller?.pickup_address && (
                    <div className="space-y-3 mb-6">
                      <div className="flex items-start gap-2">
                        <MapPin className="w-5 h-5 text-gray-500 flex-shrink-0 mt-0.5" />
                        <div>
                          <p className="font-semibold text-sm">Pickup Location</p>
                          <p className="text-gray-600 text-sm">{seller.pickup_address}</p>
                          {seller.pickup_city && seller.pickup_state && (
                            <p className="text-gray-600 text-sm">{seller.pickup_city}, {seller.pickup_state} {seller.pickup_zip || ""}</p>
                          )}
                          {seller.pickup_notes && (
                            <p className="text-gray-500 mt-2 text-xs">
                              <strong>Note:</strong> {seller.pickup_notes}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  <Alert className="mb-6">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>
                      Show your <strong>9-digit verification code</strong> to {seller?.business_name || "the seller"} when collecting your items.
                    </AlertDescription>
                  </Alert>

                  <div className="flex gap-3">
                    <Button variant="outline" className="flex-1" onClick={() => handleClose()}>
                      Back to Show
                    </Button>
                    <Button className="flex-1 bg-gradient-to-r from-purple-600 to-blue-500" onClick={handleViewOrder}>
                      View Order
                    </Button>
                  </div>
                </CardContent>
              </>
            ) : (
              // Profile/Confirmation Steps (adapted for Card structure)
              <>
                <CardHeader className="relative pb-3 border-b">
                  <CardTitle className="text-xl font-bold">
                    {step === "profile" ? "Your Information" : "Complete Purchase"}
                  </CardTitle>
                  <button
                    onClick={() => handleClose()}
                    className="absolute top-4 right-4 p-2 hover:bg-gray-100 rounded-full transition-colors"
                  >
                    <X className="w-5 h-5 text-gray-600" />
                  </button>
                </CardHeader>
                <CardContent className="px-6 py-4">
                  {step === "profile" && (
                    <form onSubmit={handleProfileSubmit} className="space-y-4">
                      <p className="text-gray-600 text-sm">
                        We need your information for pickup and order confirmation.
                      </p>
                      {checkoutError && (
                        <Alert variant="destructive">
                          <AlertCircle className="h-4 w-4" />
                          <AlertDescription>{checkoutError}</AlertDescription>
                        </Alert>
                      )}
                      <div className="space-y-2">
                        <Label>Full Name *</Label>
                        <Input
                          value={profileData.full_name}
                          onChange={(e) => setProfileData({ ...profileData, full_name: e.target.value })}
                          placeholder="John Doe"
                          required
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Phone Number *</Label>
                        <Input
                          type="tel"
                          value={profileData.phone}
                          onChange={(e) => setProfileData({ ...profileData, phone: e.target.value })}
                          placeholder="(555) 123-4567"
                          required
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Email *</Label>
                        <Input
                          type="email"
                          value={profileData.email}
                          onChange={(e) => setProfileData({ ...profileData, email: e.target.value })}
                          placeholder="john@example.com"
                          required
                        />
                      </div>
                      <Button
                        type="submit"
                        className="w-full bg-gradient-to-r from-purple-600 to-blue-500"
                        disabled={isSubmitting}
                      >
                        {isSubmitting ? "Saving..." : "Continue to Checkout"}
                      </Button>
                    </form>
                  )}

                  {step === "confirm" && (
                    <div className="space-y-6">
                      <div className="flex gap-4 p-4 bg-gray-50 rounded-lg">
                        <img
                          src={product.image_urls?.[0] || ""}
                          alt={product.title}
                          className="w-24 h-24 object-cover rounded-lg"
                        />
                        <div className="flex-1">
                          <h3 className="font-semibold text-lg">{product.title}</h3>
                          <p className="text-gray-600 text-sm mt-1">{seller.business_name}</p>
                          <div className="mt-2">
                            <div className="flex justify-between items-center">
                              <span className="text-gray-600 text-sm">Price:</span>
                              <span className="font-semibold">${product.price?.toFixed(2)}</span>
                            </div>
                            {product.delivery_fee > 0 && (
                              <div className="flex justify-between items-center mt-1 text-blue-600">
                                <span className="text-sm">Delivery Fee:</span>
                                <span className="font-semibold">+${product.delivery_fee?.toFixed(2)}</span>
                              </div>
                            )}
                            <div className="border-t border-gray-200 mt-2 pt-2 flex justify-between items-center">
                              <span className="font-bold text-gray-900">Total:</span>
                              <span className="text-2xl font-bold text-gray-900">
                                ${((product.price || 0) + (product.delivery_fee || 0)).toFixed(2)}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="space-y-3">
                        <h4 className="font-semibold">Pickup Information</h4>
                        <div className="flex items-start gap-2 text-sm">
                          <MapPin className="w-5 h-5 text-gray-500 flex-shrink-0" />
                          <div>
                            <p className="font-medium">{seller.pickup_address}</p>
                            <p className="text-gray-600">{seller.pickup_city}, {seller.pickup_state} {seller.pickup_zip}</p>
                            {(product.pickup_notes || seller.pickup_notes) && (
                              <p className="text-gray-600 mt-2">
                                <strong>Pickup Notes:</strong> {product.pickup_notes || seller.pickup_notes}
                              </p>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <h4 className="font-semibold">Your Contact Information</h4>
                        <div className="text-sm space-y-1">
                          <p>{profileData.full_name}</p>
                          <p>{profileData.phone}</p>
                          <p>{profileData.email}</p>
                        </div>
                      </div>

                      {checkoutError && (
                        <Alert variant="destructive" className={isSoldOut ? "border-red-500 bg-red-50" : ""}>
                          <AlertCircle className="h-4 w-4" />
                          <AlertDescription className={isSoldOut ? "font-semibold" : ""}>
                            {checkoutError}
                          </AlertDescription>
                        </Alert>
                      )}

                      {isSoldOut ? (
                        <Button
                          variant="outline"
                          className="w-full text-lg py-6"
                          onClick={() => handleClose()}
                        >
                          Back to Show
                        </Button>
                      ) : paymentStep === "processing" ? (
                        <div className="text-center space-y-4">
                          <Loader2 className="w-8 h-8 animate-spin mx-auto text-purple-600" />
                          <p className="text-gray-600">Creating order...</p>
                        </div>
                      ) : paymentStep === "stripe_elements" && clientSecret && stripePromise && intentValid !== false && !sessionExpired ? (
                        // Stripe Elements payment form (only when intent valid and not expired)
                        <Elements 
                          stripe={stripePromise} 
                          options={{ 
                            clientSecret,
                            appearance: {
                              theme: 'stripe',
                              variables: {
                                colorPrimary: '#9333ea',
                                borderRadius: '8px',
                              },
                            },
                          }}
                        >
                          <StripePaymentForm
                            onPaymentSuccess={handlePaymentSuccess}
                            onPaymentError={handlePaymentError}
                            isSubmitting={isSubmitting}
                            setIsSubmitting={setIsSubmitting}
                            checkoutIntentId={checkoutIntentId}
                            seller={seller}
                          />
                        </Elements>
                      ) : (
                        <>
                      <Alert>
                        <AlertCircle className="h-4 w-4" />
                        <AlertDescription className="text-xs">
                              {USE_LIVE_PAYMENTS ? (
                                <>
                                  Enter your payment details securely via Stripe.
                                  This is a local pickup only from {seller.business_name}.
                                </>
                              ) : (
                                <>
                                  This is demo mode - no real payment will be processed. 
                                  This is a local pickup only from {seller.business_name}.
                                </>
                              )}
                        </AlertDescription>
                      </Alert>

                      <Button
                        className="w-full bg-gradient-to-r from-purple-600 to-blue-500 text-lg py-6"
                        onClick={handleCheckout}
                        disabled={isSubmitting || intentValid !== true}
                      >
                            {isSubmitting ? (
                              <>
                                <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                                Processing...
                              </>
                        ) : (
                          <>
                            <CreditCard className="w-5 h-5 mr-2" />
                                {USE_LIVE_PAYMENTS ? "Continue to Payment" : "Complete Order (Demo)"}
                          </>
                        )}
                      </Button>
                        </>
                      )}
                      {paymentStep !== "stripe_elements" && (
                        <p className="text-xs text-center text-gray-500">
                          {USE_LIVE_PAYMENTS 
                            ? "Secure payment powered by Stripe" 
                            : "Demo mode - order will be marked as paid automatically"}
                        </p>
                      )}
                    </div>
                  )}
                </CardContent>
              </>
            )}
          </>
        )}
      </Card>
    </div>
  );
}