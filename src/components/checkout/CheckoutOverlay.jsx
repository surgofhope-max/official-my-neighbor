import React, { useState, useEffect } from "react";
import { supabaseApi as base44 } from "@/api/supabaseClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { CheckCircle, MapPin, AlertCircle, CreditCard, X, Shield, Loader2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getBuyerProfileByUserId, createBuyerProfile } from "@/api/buyers";
import { findOrCreateBatch, updateBatch } from "@/api/batches";
import { createOrderWithResult } from "@/api/orders";
import { getProductById } from "@/api/products";
import { createPaymentIntent, pollOrderPaymentStatus } from "@/api/payments";

// Feature flag for live payments
const USE_LIVE_PAYMENTS = import.meta.env.VITE_STRIPE_ENABLED === "true";

export default function CheckoutOverlay({ product, seller, show, buyerProfile, onClose }) {
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

  useEffect(() => {
    loadUser();
  }, []);

  const loadUser = async () => {
    try {
      const currentUser = await base44.auth.me();
      if (!currentUser) {
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
          full_name: profile.full_name || currentUser.full_name || "",
          phone: profile.phone || "",
          email: profile.email || currentUser.email || ""
        });
        
        // Skip to confirmation step
        setStep("confirm");
      } else {
        // Pre-fill with user data from authentication
        setProfileData({
          full_name: currentUser.full_name || "",
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
  const needsSafetyAgreement = user && user.buyer_safety_agreed !== true;

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    setTimeout(() => setIsVisible(true), 10);
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, []);

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
    // Check current product availability
    const currentProduct = await getProductById(product.id);
    
    if (!currentProduct) {
      throw new Error("Product not found");
    }
    
    if ((currentProduct.quantity || 0) <= 0) {
      throw new Error("Product is out of stock");
    }
    
    if (currentProduct.status === "sold_out" || currentProduct.status === "sold") {
      throw new Error("Product is sold out");
    }
    
    return currentProduct;
  };

  const processOrder = async () => {
    if (!user) {
      throw new Error("Please log in to complete your purchase");
    }

    const pickupCode = `PU${Date.now().toString().slice(-8)}`;
    const pickupLocation = seller.pickup_address 
      ? `${seller.pickup_address}, ${seller.pickup_city || ""}, ${seller.pickup_state || ""}`
      : "";

    // Validate product is still available
    await validateProductAvailability();

    // Find or create batch
    const batchNumber = generateBatchNumber(show.id, user.id);
    const batchCompletionCode = generateCompletionCode();

    const { batch, isNew } = await findOrCreateBatch({
      buyer_id: user.id,
      buyer_name: profileData.full_name,
      buyer_email: profileData.email,
      buyer_phone: profileData.phone,
      seller_id: seller.id,
      show_id: show.id,
      batch_number: batchNumber,
      completion_code: batchCompletionCode,
      pickup_location: pickupLocation,
      pickup_notes: seller.pickup_notes || "",
    });

    if (!batch) {
      throw new Error("Failed to create order batch");
    }

    // Use the batch's completion code (either existing or newly generated)
    const finalCompletionCode = batch.completion_code || batchCompletionCode;
    const finalBatchNumber = batch.batch_number || batchNumber;

    // Create the order (with inventory enforcement at DB layer)
    // Use live payments if enabled, otherwise demo mode
    const { order, error: orderError } = await createOrderWithResult({
      batch_id: batch.id,
      buyer_id: user.id,
      buyer_name: profileData.full_name,
      buyer_email: profileData.email,
      buyer_phone: profileData.phone,
      seller_id: seller.id,
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
    });

    // Handle inventory/sold out errors from database
    if (orderError) {
      if (orderError.isSoldOut) {
        const soldOutError = new Error("SOLD_OUT");
        soldOutError.isSoldOut = true;
        soldOutError.displayMessage = "Sorry, this item just sold out!";
        throw soldOutError;
      }
      throw new Error(orderError.message || "Failed to create order");
    }

    if (!order) {
      throw new Error("Failed to create order");
    }

    // Update batch totals
    const newTotalItems = (batch.total_items || 0) + 1;
    const newTotalAmount = (batch.total_amount || 0) + (product.price || 0) + (product.delivery_fee || 0);

    await updateBatch(batch.id, {
      total_items: newTotalItems,
      total_amount: newTotalAmount,
    });

    return { order, completionCode: finalCompletionCode, batch, useLivePayment: USE_LIVE_PAYMENTS };
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

  const handleCheckout = async () => {
    // QA HARDENING: Prevent double-click/double-submit
    if (isSubmitting) {
      return;
    }

    setIsSubmitting(true);
    setCheckoutError(null);
    setIsSoldOut(false);
    setPaymentStep("processing");

    try {
      // Process the order (creates pending order if live payments enabled)
      const result = await processOrder();
      
      if (result.useLivePayment) {
        // Live payment flow - create PaymentIntent and redirect to Stripe
        setPendingOrderId(result.order.id);
        setPaymentStep("awaiting_confirmation");
        
        // Create PaymentIntent via Edge Function
        const { clientSecret: secret, error: paymentError } = await createPaymentIntent(result.order.id);
        
        if (paymentError || !secret) {
          throw new Error(paymentError || "Failed to initialize payment");
        }
        
        setClientSecret(secret);
        
        // Redirect to Stripe Checkout or use Stripe Elements
        // For now, open Stripe hosted checkout page
        // In production, you would integrate Stripe Elements here
        const stripePublicKey = import.meta.env.VITE_STRIPE_PUBLIC_KEY;
        
        if (stripePublicKey) {
          // Poll for payment completion (webhook will update status)
          setPaymentStep("awaiting_confirmation");
          setCompletionCode(result.completionCode);
          
          // For demo purposes, we'll show the client secret and poll for status
          // In production, integrate Stripe Elements for inline payment form
          const status = await pollOrderPaymentStatus(result.order.id, 30, 2000);
          
          if (status === "paid") {
            setOrderId(result.order.id);
            setOrderComplete(true);
            setPaymentStep(null);
          } else if (status === "cancelled") {
            throw new Error("Payment was cancelled");
          } else {
            // Still pending - show manual instructions
            setCheckoutError("Payment is processing. You'll receive confirmation shortly.");
          }
        } else {
          throw new Error("Stripe is not configured. Please contact support.");
        }
      } else {
        // Demo mode - order is already marked as paid
        setOrderId(result.order.id);
        setCompletionCode(result.completionCode);
        setOrderComplete(true);
        setPaymentStep(null);
      }
    } catch (error) {
      setPaymentStep(null);
      // Check for sold out error
      if (error.isSoldOut || error.message === "SOLD_OUT") {
        setIsSoldOut(true);
        setCheckoutError(error.displayMessage || "Sorry, this item is no longer available.");
      } else if (error.message?.includes("out of stock") || error.message?.includes("sold out")) {
        setIsSoldOut(true);
        setCheckoutError("Sorry, this item just sold out!");
      } else {
        setCheckoutError(error.message || "Checkout failed. Please try again.");
      }
    } finally {
      setIsSubmitting(false);
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

  return (
    <div
      className={`fixed inset-0 z-[200] flex items-end transition-opacity duration-300 ${isVisible ? 'opacity-100' : 'opacity-0'}`}
    >
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={handleClose}
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
                  navigate(createPageUrl(`BuyerSafetyAgreement?redirect=LiveShow`));
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
                    onClick={handleClose}
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
                    <Button variant="outline" className="flex-1" onClick={handleClose}>
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
                    onClick={handleClose}
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
                          onClick={handleClose}
                        >
                          Back to Show
                        </Button>
                      ) : paymentStep === "awaiting_confirmation" ? (
                        <div className="text-center space-y-4">
                          <Loader2 className="w-8 h-8 animate-spin mx-auto text-purple-600" />
                          <p className="text-gray-600">Processing payment...</p>
                          <p className="text-xs text-gray-500">
                            Please complete payment in the new window. Do not close this page.
                          </p>
                        </div>
                      ) : (
                        <>
                          <Alert>
                            <AlertCircle className="h-4 w-4" />
                            <AlertDescription className="text-xs">
                              {USE_LIVE_PAYMENTS ? (
                                <>
                                  You will be redirected to complete payment securely via Stripe.
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
                            disabled={isSubmitting}
                          >
                            {isSubmitting ? (
                              <>
                                <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                                Processing...
                              </>
                            ) : (
                              <>
                                <CreditCard className="w-5 h-5 mr-2" />
                                {USE_LIVE_PAYMENTS ? "Pay Now" : "Complete Order (Demo)"}
                              </>
                            )}
                          </Button>
                        </>
                      )}
                      <p className="text-xs text-center text-gray-500">
                        {USE_LIVE_PAYMENTS 
                          ? "Secure payment powered by Stripe" 
                          : "Demo mode - order will be marked as paid automatically"}
                      </p>
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