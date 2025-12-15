import React, { useState } from "react";
import { supabaseApi as base44 } from "@/api/supabaseClient";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Shield,
  CheckCircle,
  XCircle,
  AlertCircle,
  Calendar,
  User,
  Store,
  Save,
  RotateCcw,
  Ban,
  UserCheck,
  FileText
} from "lucide-react";
import { format } from "date-fns";
import BuyerOnboardingSection from "./BuyerOnboardingSection";
import SellerOnboardingSection from "./SellerOnboardingSection";

export default function UserProfileDialog({ open, onOpenChange, user, buyerProfile, sellerProfile }) {
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);
  
  // Form state for editable fields
  const [formData, setFormData] = useState({
    buyer_safety_agreed: user?.buyer_safety_agreed || false,
    seller_safety_agreed: user?.seller_safety_agreed || false,
    age_verified: user?.age_verified || false,
    location_permission_granted: user?.location_permission_granted || false,
    explicit_content_permission: user?.explicit_content_permission || false,
    identity_verified: user?.identity_verified || false,
    seller_status: user?.seller_status || "none",
    seller_verification_notes: user?.seller_verification_notes || ""
  });

  // Reset form when user changes
  React.useEffect(() => {
    if (user) {
      setFormData({
        buyer_safety_agreed: user.buyer_safety_agreed || false,
        seller_safety_agreed: user.seller_safety_agreed || false,
        age_verified: user.age_verified || false,
        location_permission_granted: user.location_permission_granted || false,
        explicit_content_permission: user.explicit_content_permission || false,
        identity_verified: user.identity_verified || false,
        seller_status: user.seller_status || "none",
        seller_verification_notes: user.seller_verification_notes || ""
      });
    }
  }, [user]);

  const updateUserMutation = useMutation({
    mutationFn: async (data) => {
      await base44.entities.User.update(user.id, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['all-users-manage'] });
      alert("User profile updated successfully");
    },
    onError: (error) => {
      alert(`Failed to update: ${error.message}`);
    }
  });

  const handleSave = async () => {
    setSaving(true);
    const now = new Date().toISOString();
    
    const updateData = { ...formData };
    
    // Set timestamps for newly verified fields
    if (formData.identity_verified && !user.identity_verified) {
      updateData.identity_verified_at = now;
    }
    
    await updateUserMutation.mutateAsync(updateData);
    setSaving(false);
  };

  const handleResetBuyerSafety = async () => {
    if (!confirm("Reset buyer safety agreement? User will need to re-agree.")) return;
    
    await updateUserMutation.mutateAsync({
      buyer_safety_agreed: false,
      buyer_safety_agreed_at: null,
      age_verified: false,
      age_verified_at: null,
      location_permission_granted: false,
      location_permission_granted_at: null,
      explicit_content_permission: false,
      explicit_content_permission_at: null
    });
    
    setFormData(prev => ({
      ...prev,
      buyer_safety_agreed: false,
      age_verified: false,
      location_permission_granted: false,
      explicit_content_permission: false
    }));
  };

  const handleResetSellerSafety = async () => {
    if (!confirm("Reset seller safety agreement? User will need to re-agree.")) return;
    
    await updateUserMutation.mutateAsync({
      seller_safety_agreed: false,
      seller_safety_agreed_at: null,
      seller_status: "none"
    });
    
    setFormData(prev => ({
      ...prev,
      seller_safety_agreed: false,
      seller_status: "none"
    }));
  };

  const handleResetSellerOnboarding = async () => {
    if (!confirm("Reset FULL seller onboarding? This will lock the seller out of all show-related features until they complete the entire onboarding flow again (Agreement → Identity → Categories → Profile → Review).")) return;
    
    const now = new Date().toISOString();
    const adminUser = await base44.auth.me();
    
    await updateUserMutation.mutateAsync({
      seller_onboarding_reset: true,
      seller_onboarding_reset_at: now,
      seller_onboarding_reset_by: adminUser.email,
      seller_safety_agreed: false,
      seller_safety_agreed_at: null,
      seller_status: "pending",
      // Clear all seller onboarding data
      seller_guideline_honor_purchases: false,
      seller_guideline_no_counterfeit: false,
      seller_guideline_accurate_descriptions: false,
      seller_guideline_ship_safely: false,
      seller_guideline_minor_preapproval: false,
      seller_guidelines_accepted_at: null,
      seller_onboarding_steps_completed: [],
      seller_onboarding_steps_remaining: ["agreement", "identity", "categories", "profile", "review"]
    });
    
    setFormData(prev => ({
      ...prev,
      seller_safety_agreed: false,
      seller_status: "pending"
    }));
    
    alert("Seller onboarding has been reset. The seller must complete the full onboarding flow again before accessing any show-related features.");
  };

  const handleApproveSeller = async () => {
    const now = new Date().toISOString();
    await updateUserMutation.mutateAsync({
      seller_status: "approved",
      identity_verified: true,
      identity_verified_at: now,
      seller_verification_notes: formData.seller_verification_notes + `\n[${format(new Date(), "yyyy-MM-dd HH:mm")}] Approved by admin`
    });
    setFormData(prev => ({ ...prev, seller_status: "approved", identity_verified: true }));
  };

  const handleRejectSeller = async () => {
    const reason = prompt("Reason for rejection:");
    if (!reason) return;
    
    await updateUserMutation.mutateAsync({
      seller_status: "rejected",
      seller_verification_notes: formData.seller_verification_notes + `\n[${format(new Date(), "yyyy-MM-dd HH:mm")}] Rejected: ${reason}`
    });
    setFormData(prev => ({ ...prev, seller_status: "rejected" }));
  };

  const handleBanUser = async () => {
    const reason = prompt("Reason for ban:");
    if (!reason) return;
    
    const now = new Date().toISOString();
    const adminUser = await base44.auth.me();
    
    await updateUserMutation.mutateAsync({
      account_status: "banned",
      suspended_at: now,
      suspended_by: adminUser.email,
      suspension_reason: reason
    });
  };

  const handleUnbanUser = async () => {
    await updateUserMutation.mutateAsync({
      account_status: "active",
      suspended_at: null,
      suspended_by: null,
      suspension_reason: null
    });
  };

  if (!user) return null;

  const statusColors = {
    none: "bg-gray-100 text-gray-800",
    pending: "bg-yellow-100 text-yellow-800",
    approved: "bg-green-100 text-green-800",
    rejected: "bg-red-100 text-red-800",
    banned: "bg-red-100 text-red-800"
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <User className="w-5 h-5" />
            User Profile: {user.full_name || user.email}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Basic Info */}
          <div className="bg-gray-50 rounded-lg p-4">
            <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
              <User className="w-4 h-4" />
              Basic Information
            </h3>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <Label className="text-gray-500">Email</Label>
                <p className="font-medium">{user.email}</p>
              </div>
              <div>
                <Label className="text-gray-500">Full Name</Label>
                <p className="font-medium">{user.full_name || "Not set"}</p>
              </div>
              <div>
                <Label className="text-gray-500">Role</Label>
                <Badge className={user.role === "admin" ? "bg-purple-100 text-purple-800" : "bg-blue-100 text-blue-800"}>
                  {user.role || "user"}
                </Badge>
              </div>
              <div>
                <Label className="text-gray-500">Account Status</Label>
                <Badge className={statusColors[user.account_status] || statusColors.none}>
                  {user.account_status || "active"}
                </Badge>
              </div>
            </div>

            {/* Buyer Onboarding Section - Collapsible */}
            <BuyerOnboardingSection user={user} buyerProfile={buyerProfile} />

            {/* Seller Onboarding Section - Collapsible */}
            <SellerOnboardingSection user={user} sellerProfile={sellerProfile} />
          </div>

          <Separator />

          {/* Buyer Safety Section */}
          <div className="bg-blue-50 rounded-lg p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                <Shield className="w-4 h-4 text-blue-600" />
                Buyer Safety
              </h3>
              <Button
                size="sm"
                variant="outline"
                className="text-orange-600 border-orange-200"
                onClick={handleResetBuyerSafety}
              >
                <RotateCcw className="w-3 h-3 mr-1" />
                Reset
              </Button>
            </div>
            
            <div className="space-y-3">
              <div className="flex items-center justify-between p-2 bg-white rounded border">
                <div>
                  <p className="font-medium text-sm">Buyer Safety Agreement</p>
                  {user.buyer_safety_agreed_at && (
                    <p className="text-xs text-gray-500">
                      Accepted: {format(new Date(user.buyer_safety_agreed_at), "MMM d, yyyy h:mm a")}
                    </p>
                  )}
                </div>
                {formData.buyer_safety_agreed ? (
                  <CheckCircle className="w-5 h-5 text-green-600" />
                ) : (
                  <XCircle className="w-5 h-5 text-red-500" />
                )}
              </div>

              <div className="flex items-center justify-between p-2 bg-white rounded border">
                <p className="font-medium text-sm">Age Verified (18+)</p>
                {formData.age_verified ? (
                  <CheckCircle className="w-5 h-5 text-green-600" />
                ) : (
                  <XCircle className="w-5 h-5 text-red-500" />
                )}
              </div>

              <div className="flex items-center justify-between p-2 bg-white rounded border">
                <p className="font-medium text-sm">Explicit Content Permission</p>
                {formData.explicit_content_permission ? (
                  <CheckCircle className="w-5 h-5 text-green-600" />
                ) : (
                  <XCircle className="w-5 h-5 text-red-500" />
                )}
              </div>

              <div className="flex items-center justify-between p-2 bg-white rounded border">
                <p className="font-medium text-sm">Location Permissions</p>
                {formData.location_permission_granted ? (
                  <CheckCircle className="w-5 h-5 text-green-600" />
                ) : (
                  <XCircle className="w-5 h-5 text-red-500" />
                )}
              </div>
            </div>
          </div>

          <Separator />

          {/* Seller Safety Section */}
          <div className="bg-green-50 rounded-lg p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                <Store className="w-4 h-4 text-green-600" />
                Seller Safety
              </h3>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="text-orange-600 border-orange-200"
                  onClick={handleResetSellerSafety}
                >
                  <RotateCcw className="w-3 h-3 mr-1" />
                  Reset Agreement
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="text-red-600 border-red-200"
                  onClick={handleResetSellerOnboarding}
                >
                  <RotateCcw className="w-3 h-3 mr-1" />
                  Reset Full Onboarding
                </Button>
              </div>
            </div>
            
            <div className="space-y-3">
              <div className="flex items-center justify-between p-2 bg-white rounded border">
                <div>
                  <p className="font-medium text-sm">Seller Safety Agreement</p>
                  {user.seller_safety_agreed_at && (
                    <p className="text-xs text-gray-500">
                      Accepted: {format(new Date(user.seller_safety_agreed_at), "MMM d, yyyy h:mm a")}
                    </p>
                  )}
                </div>
                {formData.seller_safety_agreed ? (
                  <CheckCircle className="w-5 h-5 text-green-600" />
                ) : (
                  <XCircle className="w-5 h-5 text-red-500" />
                )}
              </div>

              <div className="flex items-center justify-between p-2 bg-white rounded border">
                <div>
                  <p className="font-medium text-sm">Identity Verified</p>
                  {user.identity_verified_at && (
                    <p className="text-xs text-gray-500">
                      Verified: {format(new Date(user.identity_verified_at), "MMM d, yyyy")}
                    </p>
                  )}
                </div>
                <Switch
                  checked={formData.identity_verified}
                  onCheckedChange={(checked) => setFormData(prev => ({ ...prev, identity_verified: checked }))}
                />
              </div>

              <div className="p-2 bg-white rounded border">
                <Label className="text-sm font-medium">Seller Status</Label>
                <Select
                  value={formData.seller_status}
                  onValueChange={(value) => setFormData(prev => ({ ...prev, seller_status: value }))}
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="approved">Approved</SelectItem>
                    <SelectItem value="rejected">Rejected</SelectItem>
                    <SelectItem value="banned">Banned</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="p-2 bg-white rounded border">
                <Label className="text-sm font-medium">Verification Notes</Label>
                <Textarea
                  value={formData.seller_verification_notes}
                  onChange={(e) => setFormData(prev => ({ ...prev, seller_verification_notes: e.target.value }))}
                  placeholder="Admin notes about this seller..."
                  rows={3}
                  className="mt-1"
                />
              </div>

              {/* Quick Actions */}
              <div className="flex gap-2 pt-2">
                {formData.seller_status === "pending" && (
                  <>
                    <Button
                      size="sm"
                      className="bg-green-600 hover:bg-green-700"
                      onClick={handleApproveSeller}
                    >
                      <CheckCircle className="w-3 h-3 mr-1" />
                      Approve Seller
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-red-600 border-red-200"
                      onClick={handleRejectSeller}
                    >
                      <XCircle className="w-3 h-3 mr-1" />
                      Reject Seller
                    </Button>
                  </>
                )}
              </div>
            </div>
          </div>

          <Separator />

          {/* Admin Actions */}
          <div className="bg-red-50 rounded-lg p-4">
            <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-red-600" />
              Admin Actions
            </h3>
            <div className="flex flex-wrap gap-2">
              {user.account_status === "banned" ? (
                <Button
                  size="sm"
                  className="bg-green-600 hover:bg-green-700"
                  onClick={handleUnbanUser}
                >
                  <UserCheck className="w-3 h-3 mr-1" />
                  Unban User
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={handleBanUser}
                >
                  <Ban className="w-3 h-3 mr-1" />
                  Ban User
                </Button>
              )}
            </div>
          </div>

          {/* Save Button */}
          <div className="flex justify-end gap-3 pt-4 border-t">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              className="bg-gradient-to-r from-purple-600 to-blue-600"
              onClick={handleSave}
              disabled={saving}
            >
              <Save className="w-4 h-4 mr-2" />
              {saving ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}