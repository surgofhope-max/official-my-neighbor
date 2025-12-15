import React, { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ChevronDown,
  ChevronUp,
  User,
  MapPin,
  Settings,
  Calendar,
  ClipboardList,
  FileText,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Phone,
  Mail,
  CreditCard,
  Shield,
  Bell,
  Eye
} from "lucide-react";
import { format } from "date-fns";

function CollapsibleSection({ title, icon: Icon, children, defaultOpen = false, badge = null }) {
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
            <Badge className="text-xs ml-2">{badge}</Badge>
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

export default function BuyerOnboardingSection({ user, buyerProfile }) {
  const [isExpanded, setIsExpanded] = useState(false);

  if (!isExpanded) {
    return (
      <Button
        variant="outline"
        className="w-full mt-4 border-blue-200 text-blue-600 hover:bg-blue-50"
        onClick={() => setIsExpanded(true)}
      >
        <ClipboardList className="w-4 h-4 mr-2" />
        View Buyer Onboarding Info
        <ChevronDown className="w-4 h-4 ml-2" />
      </Button>
    );
  }

  return (
    <div className="mt-4 space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="font-semibold text-gray-900 flex items-center gap-2">
          <ClipboardList className="w-4 h-4 text-blue-600" />
          Buyer Onboarding Information
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

      <div className="space-y-2">
        {/* Basic Buyer Profile Info */}
        <CollapsibleSection 
          title="Buyer Profile Information" 
          icon={User}
          defaultOpen={true}
          badge={buyerProfile ? "Complete" : "Incomplete"}
        >
          <div className="grid grid-cols-2 gap-x-4 gap-y-1">
            <InfoRow 
              label="Full Name" 
              value={buyerProfile?.full_name || user?.full_name} 
              icon={User}
            />
            <InfoRow 
              label="Display Name" 
              value={user?.display_name || user?.full_name}
            />
            <InfoRow 
              label="Email" 
              value={buyerProfile?.email || user?.email} 
              icon={Mail}
            />
            <InfoRow 
              label="Phone" 
              value={buyerProfile?.phone} 
              icon={Phone}
            />
            <InfoRow 
              label="Profile Image" 
              value={buyerProfile?.profile_image_url ? "Uploaded" : "Not set"}
            />
            <InfoRow 
              label="User ID" 
              value={user?.id}
            />
          </div>
        </CollapsibleSection>

        {/* Contact & Address Information */}
        <CollapsibleSection 
          title="Contact & Address Information" 
          icon={MapPin}
        >
          <div className="space-y-2">
            <InfoRow 
              label="Primary Address" 
              value={buyerProfile?.address || user?.address}
              icon={MapPin}
            />
            <div className="grid grid-cols-3 gap-2">
              <InfoRow label="City" value={buyerProfile?.city || user?.city} />
              <InfoRow label="State" value={buyerProfile?.state || user?.state} />
              <InfoRow label="ZIP Code" value={buyerProfile?.zip_code || user?.zip_code} />
            </div>
            <InfoRow 
              label="Location Permissions" 
              value={user?.location_permission_granted ? "Granted" : "Not Granted"}
            />
          </div>
        </CollapsibleSection>

        {/* Account Details */}
        <CollapsibleSection 
          title="Account Details" 
          icon={Calendar}
        >
          <div className="grid grid-cols-2 gap-x-4 gap-y-1">
            <InfoRow 
              label="Account Created" 
              value={user?.created_date ? format(new Date(user.created_date), "MMM d, yyyy h:mm a") : null}
              icon={Calendar}
            />
            <InfoRow 
              label="Last Updated" 
              value={user?.updated_date ? format(new Date(user.updated_date), "MMM d, yyyy h:mm a") : null}
            />
            <InfoRow 
              label="Total Orders" 
              value={buyerProfile?.total_orders?.toString() || "0"}
              icon={CreditCard}
            />
            <InfoRow 
              label="Total Spent" 
              value={buyerProfile?.total_spent ? `$${buyerProfile.total_spent.toFixed(2)}` : "$0.00"}
            />
            <InfoRow 
              label="Account Status" 
              value={user?.account_status || "active"}
            />
            <InfoRow 
              label="Role" 
              value={user?.role || "user"}
            />
          </div>
        </CollapsibleSection>

        {/* Buyer Settings / Preferences */}
        <CollapsibleSection 
          title="Buyer Settings & Preferences" 
          icon={Settings}
        >
          <div className="space-y-2">
            <StatusIndicator 
              label="Email Notifications" 
              status={user?.email_notifications_enabled !== false}
            />
            <StatusIndicator 
              label="Push Notifications" 
              status={user?.push_notifications_enabled}
            />
            <StatusIndicator 
              label="SMS Notifications" 
              status={user?.sms_notifications_enabled}
            />
            <StatusIndicator 
              label="Marketing Emails" 
              status={user?.marketing_emails_enabled}
            />
            <InfoRow 
              label="Preferred Language" 
              value={user?.preferred_language || "English"}
            />
            <InfoRow 
              label="Timezone" 
              value={user?.timezone || "Auto-detect"}
            />
          </div>
        </CollapsibleSection>

        {/* Onboarding Steps */}
        <CollapsibleSection 
          title="Onboarding Steps Completed" 
          icon={ClipboardList}
          badge={user?.buyer_safety_agreed ? "Complete" : "Incomplete"}
        >
          <div className="space-y-2">
            <StatusIndicator 
              label="Buyer Safety Agreement" 
              status={user?.buyer_safety_agreed}
              timestamp={user?.buyer_safety_agreed_at}
            />
            <StatusIndicator 
              label="Age Verification (18+)" 
              status={user?.age_verified}
              timestamp={user?.age_verified_at}
            />
            <StatusIndicator 
              label="Explicit Content Acknowledged" 
              status={user?.explicit_content_permission}
              timestamp={user?.explicit_content_permission_at}
            />
            <StatusIndicator 
              label="Location Services" 
              status={user?.location_permission_granted}
              timestamp={user?.location_permission_granted_at}
            />
            <StatusIndicator 
              label="Terms & Conditions Accepted" 
              status={user?.terms_accepted}
              timestamp={user?.terms_accepted_at}
            />
            <StatusIndicator 
              label="Privacy Policy Accepted" 
              status={user?.privacy_accepted}
              timestamp={user?.privacy_accepted_at}
            />
          </div>
        </CollapsibleSection>

        {/* Internal Notes */}
        <CollapsibleSection 
          title="Internal Notes" 
          icon={FileText}
        >
          <div className="space-y-2">
            <div className="bg-white p-3 rounded border min-h-[60px]">
              <p className="text-sm text-gray-600">
                {user?.admin_notes || buyerProfile?.admin_notes || (
                  <span className="italic text-gray-400">No internal notes for this buyer.</span>
                )}
              </p>
            </div>
            <InfoRow 
              label="Last Reviewed By" 
              value={user?.last_reviewed_by}
            />
            <InfoRow 
              label="Last Review Date" 
              value={user?.last_reviewed_at ? format(new Date(user.last_reviewed_at), "MMM d, yyyy") : null}
            />
          </div>
        </CollapsibleSection>

        {/* Flags & Safety Indicators */}
        <CollapsibleSection 
          title="Flags & Safety Indicators" 
          icon={AlertTriangle}
          badge={user?.account_status === "banned" ? "Flagged" : null}
        >
          <div className="space-y-2">
            <StatusIndicator 
              label="Identity Verified" 
              status={user?.identity_verified}
              timestamp={user?.identity_verified_at}
            />
            <StatusIndicator 
              label="Email Verified" 
              status={user?.email_verified !== false}
            />
            <StatusIndicator 
              label="Phone Verified" 
              status={user?.phone_verified}
            />
            
            {user?.account_status === "suspended" && (
              <div className="bg-yellow-50 border border-yellow-200 rounded p-2 mt-2">
                <div className="flex items-center gap-2 text-yellow-800">
                  <AlertTriangle className="w-4 h-4" />
                  <span className="text-sm font-medium">Account Suspended</span>
                </div>
                {user?.suspension_reason && (
                  <p className="text-xs text-yellow-700 mt-1">Reason: {user.suspension_reason}</p>
                )}
                {user?.suspended_at && (
                  <p className="text-xs text-yellow-600 mt-1">
                    Since: {format(new Date(user.suspended_at), "MMM d, yyyy")}
                  </p>
                )}
              </div>
            )}

            {user?.account_status === "banned" && (
              <div className="bg-red-50 border border-red-200 rounded p-2 mt-2">
                <div className="flex items-center gap-2 text-red-800">
                  <AlertTriangle className="w-4 h-4" />
                  <span className="text-sm font-medium">Account Banned</span>
                </div>
                {user?.suspension_reason && (
                  <p className="text-xs text-red-700 mt-1">Reason: {user.suspension_reason}</p>
                )}
                {user?.suspended_by && (
                  <p className="text-xs text-red-600 mt-1">By: {user.suspended_by}</p>
                )}
              </div>
            )}

            <InfoRow 
              label="Report Count" 
              value={user?.report_count?.toString() || "0"}
            />
            <InfoRow 
              label="Warning Count" 
              value={user?.warning_count?.toString() || "0"}
            />
          </div>
        </CollapsibleSection>
      </div>
    </div>
  );
}