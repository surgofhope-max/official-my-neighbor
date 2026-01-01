import React, { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ChevronDown,
  ChevronUp,
  Store,
  Phone,
  FileCheck,
  Grid3X3,
  Layers,
  Building2,
  DollarSign,
  ShoppingCart,
  MapPin,
  ClipboardList,
  CreditCard,
  CheckCircle,
  XCircle,
  AlertTriangle
} from "lucide-react";
import { format } from "date-fns";

function CollapsibleSection({ title, icon: Icon, children, defaultOpen = false, badge = null, badgeColor = "bg-gray-100 text-gray-800" }) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className="border rounded-lg overflow-hidden bg-white">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between p-3 hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Icon className="w-4 h-4 text-gray-600" />
          <span className="font-medium text-gray-900">{title}</span>
          {badge && (
            <Badge className={`text-xs ml-2 ${badgeColor}`}>{badge}</Badge>
          )}
        </div>
        {isOpen ? (
          <ChevronUp className="w-4 h-4 text-gray-500" />
        ) : (
          <ChevronDown className="w-4 h-4 text-gray-500" />
        )}
      </button>
      {isOpen && (
        <div className="border-t p-3 bg-gray-50">
          {children}
        </div>
      )}
    </div>
  );
}

function InfoRow({ label, value, icon: Icon }) {
  return (
    <div className="flex items-start gap-2 py-1.5">
      {Icon && <Icon className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />}
      <div className="flex-1 min-w-0">
        <p className="text-xs text-gray-500">{label}</p>
        <p className="text-sm font-medium text-gray-900 truncate">
          {value || <span className="text-gray-400 italic">Not set</span>}
        </p>
      </div>
    </div>
  );
}

function StatusIndicator({ label, status, timestamp }) {
  return (
    <div className="flex items-center justify-between py-1.5">
      <span className="text-sm text-gray-700">{label}</span>
      <div className="flex items-center gap-2">
        {status ? (
          <CheckCircle className="w-4 h-4 text-green-600" />
        ) : (
          <XCircle className="w-4 h-4 text-red-400" />
        )}
        {timestamp && (
          <span className="text-xs text-gray-500">
            {format(new Date(timestamp), "MMM d, yyyy")}
          </span>
        )}
      </div>
    </div>
  );
}

const CATEGORY_OPTIONS = [
  "Sports Cards", "Trading Cards", "Coins", "Comics", "Sneakers", "Vintage Clothing",
  "Electronics", "Collectibles", "Art", "Jewelry", "Antiques", "Books", "Music",
  "Movies", "Video Games", "Toys", "Home & Garden", "Tools", "Auto Parts", "Other"
];

const REVENUE_LABELS = {
  "0-500": "$0 - $500",
  "500-2000": "$500 - $2,000",
  "2000-10000": "$2,000 - $10,000",
  "10000-50000": "$10,000 - $50,000",
  "50000+": "$50,000+"
};

const SALES_CHANNEL_LABELS = {
  "website": "Website",
  "social_media": "Social Media",
  "store_warehouse": "Store/Warehouse",
  "other_platforms": "Other Platforms (Amazon/eBay/Etsy)",
  "just_starting": "Just Getting Started"
};

export default function SellerOnboardingSection({ user, sellerProfile }) {
  const [isExpanded, setIsExpanded] = useState(false);

  // Determine if user has seller onboarding data
  // Check sellers table (canonical) OR user metadata (legacy)
  const hasSellerData = user?.seller_safety_agreed || sellerProfile?.main_category || user?.seller_main_category || sellerProfile;

  if (!hasSellerData) {
    return (
      <div className="mt-4 p-3 bg-gray-100 rounded-lg text-center">
        <Store className="w-6 h-6 text-gray-400 mx-auto mb-2" />
        <p className="text-sm text-gray-500">No seller onboarding data available</p>
      </div>
    );
  }

  if (!isExpanded) {
    return (
      <Button
        variant="outline"
        className="w-full mt-4 border-green-200 text-green-600 hover:bg-green-50"
        onClick={() => setIsExpanded(true)}
      >
        <Store className="w-4 h-4 mr-2" />
        View Seller Onboarding Info
        <ChevronDown className="w-4 h-4 ml-2" />
      </Button>
    );
  }

  // Calculate onboarding completion
  const completedSteps = user?.seller_onboarding_steps_completed?.length || 0;
  const remainingSteps = user?.seller_onboarding_steps_remaining?.length || 0;
  const totalSteps = completedSteps + remainingSteps || 8; // Default 8 steps
  const progressPercent = totalSteps > 0 ? Math.round((completedSteps / totalSteps) * 100) : 0;

  return (
    <div className="mt-4 space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="font-semibold text-gray-900 flex items-center gap-2">
          <Store className="w-4 h-4 text-green-600" />
          Seller Onboarding Information
        </h4>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setIsExpanded(false)}
          className="text-gray-500"
        >
          <ChevronUp className="w-4 h-4 mr-1" />
          Collapse
        </Button>
      </div>

      {/* Onboarding Progress Bar */}
      <div className="bg-white p-3 rounded-lg border">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-gray-700">Onboarding Progress</span>
          <span className="text-sm text-gray-500">{progressPercent}% Complete</span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2">
          <div
            className="bg-green-500 h-2 rounded-full transition-all"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>

      <div className="space-y-2">
        {/* CANONICAL IDENTITY - From public.users and sellers tables */}
        <CollapsibleSection
          title="Canonical Identity"
          icon={Store}
          defaultOpen={true}
          badge="Source of Truth"
          badgeColor="bg-blue-100 text-blue-800"
        >
          <div className="grid grid-cols-2 gap-x-4 gap-y-1">
            <InfoRow
              label="Full Name"
              value={user?.full_name}
            />
            <InfoRow
              label="Phone"
              value={user?.phone}
              icon={Phone}
            />
            <InfoRow
              label="Email"
              value={user?.email}
            />
            {sellerProfile && (
              <>
                <InfoRow
                  label="Business Name"
                  value={sellerProfile?.business_name}
                />
                <InfoRow
                  label="Seller Contact Phone"
                  value={sellerProfile?.contact_phone}
                  icon={Phone}
                />
                <InfoRow
                  label="Seller Contact Email"
                  value={sellerProfile?.contact_email}
                />
              </>
            )}
          </div>
        </CollapsibleSection>

        {/* A. Account Creation Information (Historical) */}
        <CollapsibleSection
          title="Account Creation Information"
          icon={Store}
        >
          <div className="grid grid-cols-2 gap-x-4 gap-y-1">
            <InfoRow
              label="Signup Method"
              value={user?.onboarding_signup_method?.charAt(0).toUpperCase() + user?.onboarding_signup_method?.slice(1)}
            />
            <InfoRow
              label="Full Name at Signup"
              value={user?.onboarding_full_name}
            />
            <InfoRow
              label="Email at Signup"
              value={user?.onboarding_email}
            />
            <InfoRow
              label="Country"
              value={user?.onboarding_country}
            />
            <InfoRow
              label="Username"
              value={user?.onboarding_username}
            />
            <InfoRow
              label="Onboarding Completed"
              value={user?.onboarding_completed_at ? format(new Date(user.onboarding_completed_at), "MMM d, yyyy h:mm a") : null}
            />
          </div>
        </CollapsibleSection>

        {/* B. Phone Verification */}
        <CollapsibleSection
          title="Phone Verification"
          icon={Phone}
          badge={user?.phone_verified ? "Verified" : "Not Verified"}
          badgeColor={user?.phone_verified ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}
        >
          <div className="space-y-2">
            {/* Canonical phone from public.users, fallback to sellerProfile.contact_phone */}
            <InfoRow label="Phone Number" value={user?.phone || sellerProfile?.contact_phone} icon={Phone} />
            <StatusIndicator
              label="Phone Verified"
              status={user?.phone_verified}
              timestamp={user?.phone_verified_at}
            />
          </div>
        </CollapsibleSection>

        {/* C. Guidelines & Agreements */}
        <CollapsibleSection
          title="Guidelines & Agreements"
          icon={FileCheck}
          badge={user?.seller_guidelines_accepted_at ? "Accepted" : "Pending"}
          badgeColor={user?.seller_guidelines_accepted_at ? "bg-green-100 text-green-800" : "bg-yellow-100 text-yellow-800"}
        >
          <div className="space-y-2">
            <StatusIndicator label="Honor all purchases" status={user?.seller_guideline_honor_purchases} />
            <StatusIndicator label="No counterfeit items" status={user?.seller_guideline_no_counterfeit} />
            <StatusIndicator label="Accurate item descriptions" status={user?.seller_guideline_accurate_descriptions} />
            <StatusIndicator label="Ship quickly & safely" status={user?.seller_guideline_ship_safely} />
            <StatusIndicator label="13-17 pre-approval acknowledged" status={user?.seller_guideline_minor_preapproval} />
            {user?.seller_guidelines_accepted_at && (
              <div className="pt-2 border-t mt-2">
                <p className="text-xs text-gray-500">
                  Accepted: {format(new Date(user.seller_guidelines_accepted_at), "MMM d, yyyy h:mm a")}
                </p>
              </div>
            )}
          </div>
        </CollapsibleSection>

        {/* D. Main Selling Category */}
        <CollapsibleSection
          title="Main Selling Category"
          icon={Grid3X3}
        >
          <div className="space-y-2">
            {/* Read from sellers table (canonical), fallback to metadata for legacy data */}
            <InfoRow label="Selected Category" value={sellerProfile?.main_category || user?.seller_main_category} />
            <div className="pt-2 border-t">
              <p className="text-xs text-gray-500 mb-2">Available Categories:</p>
              <div className="flex flex-wrap gap-1">
                {CATEGORY_OPTIONS.map((cat) => {
                  const selectedCategory = sellerProfile?.main_category || user?.seller_main_category;
                  return (
                    <Badge
                      key={cat}
                      className={`text-xs ${selectedCategory === cat ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-600"}`}
                    >
                      {cat}
                    </Badge>
                  );
                })}
              </div>
            </div>
          </div>
        </CollapsibleSection>

        {/* E. Subcategory */}
        <CollapsibleSection
          title="Subcategory"
          icon={Layers}
        >
          {/* Read from sellers table (canonical), fallback to metadata for legacy data */}
          <InfoRow label="Selected Subcategory" value={sellerProfile?.subcategory || user?.seller_subcategory} />
        </CollapsibleSection>

        {/* F. Seller Type */}
        <CollapsibleSection
          title="Seller Type"
          icon={Building2}
        >
          {(() => {
            const sellerType = sellerProfile?.seller_type || user?.seller_type;
            return (
              <InfoRow
                label="Type"
                value={sellerType === "individual" ? "Individual" : sellerType === "registered_business" ? "Registered Business" : null}
              />
            );
          })()}
        </CollapsibleSection>

        {/* G. Revenue Range */}
        <CollapsibleSection
          title="Revenue Range"
          icon={DollarSign}
        >
          {(() => {
            const revenueRange = sellerProfile?.estimated_monthly_revenue || user?.seller_revenue_range;
            return (
              <InfoRow
                label="Estimated Monthly Revenue"
                value={REVENUE_LABELS[revenueRange] || revenueRange}
              />
            );
          })()}
        </CollapsibleSection>

        {/* H. Sales Channels */}
        <CollapsibleSection
          title="Sales Channels"
          icon={ShoppingCart}
        >
          <div className="space-y-1">
            {/* Read from sellers table (canonical), fallback to metadata for legacy data */}
            {(() => {
              const salesChannels = sellerProfile?.sales_channels || user?.seller_sales_channels;
              if (salesChannels && salesChannels.length > 0) {
                return salesChannels.map((channel) => (
                  <div key={channel} className="flex items-center gap-2 py-1">
                    <CheckCircle className="w-4 h-4 text-green-600" />
                    <span className="text-sm">{SALES_CHANNEL_LABELS[channel] || channel}</span>
                  </div>
                ));
              }
              return <p className="text-sm text-gray-400 italic">No sales channels selected</p>;
            })()}
          </div>
        </CollapsibleSection>

        {/* I. Return Address */}
        <CollapsibleSection
          title="Return Address"
          icon={MapPin}
        >
          <div className="space-y-1">
            {/* Canonical full_name from public.users, fallback to sellerProfile business_name */}
            <InfoRow label="Full Name" value={user?.full_name || sellerProfile?.business_name} />
            {/* Address fields from sellerProfile (seller-specific) */}
            <InfoRow label="Address Line 1" value={sellerProfile?.pickup_address || user?.seller_return_address_1} />
            <InfoRow label="Address Line 2" value={user?.seller_return_address_2} />
            <div className="grid grid-cols-3 gap-2">
              <InfoRow label="City" value={sellerProfile?.pickup_city || user?.seller_return_city} />
              <InfoRow label="State" value={sellerProfile?.pickup_state || user?.seller_return_state} />
              <InfoRow label="ZIP" value={sellerProfile?.pickup_zip || user?.seller_return_zip} />
            </div>
            <InfoRow label="Country" value={user?.seller_return_country} />
          </div>
        </CollapsibleSection>

        {/* J. Seller Access Progress */}
        <CollapsibleSection
          title="Seller Access Progress"
          icon={ClipboardList}
          badge={`${completedSteps}/${totalSteps} Steps`}
        >
          <div className="space-y-3">
            {user?.seller_onboarding_steps_completed?.length > 0 && (
              <div>
                <p className="text-xs font-medium text-green-700 mb-1">Completed Steps:</p>
                <div className="flex flex-wrap gap-1">
                  {user.seller_onboarding_steps_completed.map((step) => (
                    <Badge key={step} className="bg-green-100 text-green-800 text-xs">
                      {step}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {user?.seller_onboarding_steps_remaining?.length > 0 && (
              <div>
                <p className="text-xs font-medium text-yellow-700 mb-1">Remaining Steps:</p>
                <div className="flex flex-wrap gap-1">
                  {user.seller_onboarding_steps_remaining.map((step) => (
                    <Badge key={step} className="bg-yellow-100 text-yellow-800 text-xs">
                      {step}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {user?.seller_review_notes && (
              <div className="pt-2 border-t">
                <p className="text-xs font-medium text-gray-700 mb-1">Internal Review Notes:</p>
                <p className="text-sm text-gray-600 bg-white p-2 rounded border">{user.seller_review_notes}</p>
              </div>
            )}
          </div>
        </CollapsibleSection>

        {/* K. Payment Method Setup */}
        <CollapsibleSection
          title="Payment Method Setup"
          icon={CreditCard}
          badge={user?.payment_setup_status === "completed" ? "Completed" : user?.payment_setup_status === "pending" ? "Pending" : "Not Started"}
          badgeColor={
            user?.payment_setup_status === "completed" ? "bg-green-100 text-green-800" :
            user?.payment_setup_status === "pending" ? "bg-yellow-100 text-yellow-800" :
            "bg-gray-100 text-gray-600"
          }
        >
          <div className="space-y-2">
            <div className="bg-yellow-50 border border-yellow-200 rounded p-2 mb-3">
              <div className="flex items-center gap-2 text-yellow-800">
                <AlertTriangle className="w-4 h-4" />
                <span className="text-xs font-medium">Admin View Only - No sensitive card data stored</span>
              </div>
            </div>
            <InfoRow label="Billing ZIP" value={user?.payment_billing_zip} />
            <InfoRow label="Billing Country" value={user?.payment_billing_country} />
            <InfoRow
              label="Setup Status"
              value={
                user?.payment_setup_status === "completed" ? "Completed" :
                user?.payment_setup_status === "pending" ? "Pending" :
                "Not Started"
              }
            />
            {user?.payment_setup_completed_at && (
              <InfoRow
                label="Completed At"
                value={format(new Date(user.payment_setup_completed_at), "MMM d, yyyy h:mm a")}
              />
            )}
          </div>
        </CollapsibleSection>

        {/* Seller Profile from Seller Entity */}
        {sellerProfile && (
          <CollapsibleSection
            title="Seller Profile (Public Data)"
            icon={Store}
            badge={sellerProfile.status}
            badgeColor={
              sellerProfile.status === "approved" ? "bg-green-100 text-green-800" :
              sellerProfile.status === "pending" ? "bg-yellow-100 text-yellow-800" :
              "bg-red-100 text-red-800"
            }
          >
            <div className="bg-blue-50 border border-blue-200 rounded p-2 mb-3">
              <p className="text-xs text-blue-800">
                ⓘ This data is from the public Seller profile and can be edited by the user.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1">
              <InfoRow label="Business Name" value={sellerProfile.business_name} />
              <InfoRow label="Contact Email" value={sellerProfile.contact_email} />
              <InfoRow label="Contact Phone" value={sellerProfile.contact_phone} />
              <InfoRow label="Stripe Connected" value={sellerProfile.stripe_connected ? "Yes" : "No"} />
              <InfoRow label="Pickup City" value={sellerProfile.pickup_city} />
              <InfoRow label="Total Sales" value={sellerProfile.total_sales?.toString()} />
            </div>
          </CollapsibleSection>
        )}
      </div>
    </div>
  );
}