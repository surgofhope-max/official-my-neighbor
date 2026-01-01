import React, { useState } from "react";
import { supabase } from "@/lib/supabase/supabaseClient";
import { useQueryClient } from "@tanstack/react-query";
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

  // ─────────────────────────────────────────────────────────────────────────
  // HELPER: Update user in public.users via Supabase (replaces base44.entities)
  // ─────────────────────────────────────────────────────────────────────────
  const updateUser = async (userId, data) => {
    if (!userId) {
      console.warn("[UserProfileDialog] updateUser called with no userId");
      throw new Error("No user ID provided");
    }
    const { error } = await supabase
      .from("users")
      .update(data)
      .eq("id", userId);
    
    if (error) {
      console.error("[UserProfileDialog] Failed to update user:", error.message);
      throw new Error(error.message);
    }
  };

  // ─────────────────────────────────────────────────────────────────────────
  // HELPER: Update seller in public.sellers via Supabase
  // ─────────────────────────────────────────────────────────────────────────
  const updateSeller = async (userId, data) => {
    if (!userId) {
      console.warn("[UserProfileDialog] updateSeller called with no userId");
      return; // Don't throw, seller may not exist
    }
    const { error } = await supabase
      .from("sellers")
      .update(data)
      .eq("user_id", userId);
    
    if (error) {
      console.warn("[UserProfileDialog] Failed to update seller (may not exist):", error.message);
      // Don't throw - seller profile may not exist
    }
  };

  // ─────────────────────────────────────────────────────────────────────────
  // HANDLER: Save all form changes
  // ─────────────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!user?.id) {
      console.warn("[UserProfileDialog] handleSave: No user selected");
      alert("No user selected");
      return;
    }
    
    setSaving(true);
    try {
      // Only include columns that exist in public.users
      const updateData = {
        buyer_safety_agreed: formData.buyer_safety_agreed,
        seller_safety_agreed: formData.seller_safety_agreed,
        age_verified: formData.age_verified,
        location_permission_granted: formData.location_permission_granted,
        explicit_content_permission: formData.explicit_content_permission,
        identity_verified: formData.identity_verified,
        seller_status: formData.seller_status,
        seller_verification_notes: formData.seller_verification_notes
      };
      
      await updateUser(user.id, updateData);
      queryClient.invalidateQueries({ queryKey: ['all-users-manage'] });
      alert("User profile updated successfully");
    } catch (err) {
      alert(`Failed to update: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  // ─────────────────────────────────────────────────────────────────────────
  // HANDLER: Reset Buyer Safety Agreement
  // Only updates columns that exist in public.users
  // ─────────────────────────────────────────────────────────────────────────
  const handleResetBuyerSafety = async () => {
    if (!user?.id) {
      console.warn("[UserProfileDialog] handleResetBuyerSafety: No user selected");
      alert("No user selected");
      return;
    }
    if (!confirm("Reset buyer safety agreement? User will need to re-agree.")) return;
    
    try {
      await updateUser(user.id, {
        buyer_safety_agreed: false,
        buyer_safety_agreed_at: null,
        age_verified: false,
        age_verified_at: null,
        location_permission_granted: false,
        explicit_content_permission: false
      });
      
      setFormData(prev => ({
        ...prev,
        buyer_safety_agreed: false,
        age_verified: false,
        location_permission_granted: false,
        explicit_content_permission: false
      }));
      
      queryClient.invalidateQueries({ queryKey: ['all-users-manage'] });
      alert("Buyer safety agreement has been reset.");
    } catch (err) {
      alert(`Failed to reset buyer safety: ${err.message}`);
    }
  };

  // ─────────────────────────────────────────────────────────────────────────
  // HANDLER: Reset Seller Safety Agreement (partial reset)
  // ─────────────────────────────────────────────────────────────────────────
  const handleResetSellerSafety = async () => {
    if (!user?.id) {
      console.warn("[UserProfileDialog] handleResetSellerSafety: No user selected");
      alert("No user selected");
      return;
    }
    if (!confirm("Reset seller safety agreement? User will need to re-agree.")) return;
    
    try {
      // Reset user flags
      await updateUser(user.id, {
        seller_safety_agreed: false,
        seller_safety_agreed_at: null,
        identity_verified: false,
        seller_onboarding_completed: false
      });
      
      setFormData(prev => ({
        ...prev,
        seller_safety_agreed: false,
        identity_verified: false,
        seller_status: prev.seller_status
      }));
      
      queryClient.invalidateQueries({ queryKey: ['all-users-manage'] });
      alert("Seller safety agreement has been reset.");
    } catch (err) {
      alert(`Failed to reset seller safety: ${err.message}`);
    }
  };

  // ─────────────────────────────────────────────────────────────────────────
  // HANDLER: Reset FULL Seller Onboarding (complete reset)
  // Only updates columns that exist in public.users
  // ─────────────────────────────────────────────────────────────────────────
  const handleResetSellerOnboarding = async () => {
    if (!user?.id) {
      console.warn("[UserProfileDialog] handleResetSellerOnboarding: No user selected");
      alert("No user selected");
      return;
    }
    if (!confirm("Reset FULL seller onboarding? This will lock the seller out of all show-related features until they complete the entire onboarding flow again (Agreement → Identity → Categories → Profile → Review).")) return;
    
    try {
      // Reset user-side seller onboarding flags (only columns that exist)
      await updateUser(user.id, {
        seller_safety_agreed: false,
        seller_safety_agreed_at: null,
        seller_onboarding_completed: false,
        identity_verified: false,
        seller_status: "pending",
        seller_verification_notes: null
      });
      
      // Also reset seller entity status to pending (if seller profile exists)
      await updateSeller(user.id, {
        status: "pending",
        verification_notes: null
      });
      
      setFormData(prev => ({
        ...prev,
        seller_safety_agreed: false,
        identity_verified: false,
        seller_status: "pending",
        seller_verification_notes: ""
      }));
      
      queryClient.invalidateQueries({ queryKey: ['all-users-manage'] });
      queryClient.invalidateQueries({ queryKey: ['all-sellers-manage'] });
      alert("Seller onboarding has been reset. The seller must complete the full onboarding flow again before accessing any show-related features.");
    } catch (err) {
      alert(`Failed to reset seller onboarding: ${err.message}`);
    }
  };

  // ─────────────────────────────────────────────────────────────────────────
  // HANDLER: Approve Seller
  // Only updates columns that exist in public.users
  // ─────────────────────────────────────────────────────────────────────────
  const handleApproveSeller = async () => {
    if (!user?.id) {
      console.warn("[UserProfileDialog] handleApproveSeller: No user selected");
      alert("No user selected");
      return;
    }
    
    try {
      const notes = (formData.seller_verification_notes || "") + `\n[${format(new Date(), "yyyy-MM-dd HH:mm")}] Approved by admin`;
      
      // Update user record (only columns that exist)
      await updateUser(user.id, {
        seller_status: "approved",
        identity_verified: true,
        seller_verification_notes: notes
      });
      
      // Also update seller entity if exists
      await updateSeller(user.id, {
        status: "approved"
      });
      
      setFormData(prev => ({ 
        ...prev, 
        seller_status: "approved", 
        identity_verified: true,
        seller_verification_notes: notes
      }));
      
      queryClient.invalidateQueries({ queryKey: ['all-users-manage'] });
      queryClient.invalidateQueries({ queryKey: ['all-sellers-manage'] });
      alert("Seller has been approved.");
    } catch (err) {
      alert(`Failed to approve seller: ${err.message}`);
    }
  };

  // ─────────────────────────────────────────────────────────────────────────
  // HANDLER: Reject Seller
  // ─────────────────────────────────────────────────────────────────────────
  const handleRejectSeller = async () => {
    if (!user?.id) {
      console.warn("[UserProfileDialog] handleRejectSeller: No user selected");
      alert("No user selected");
      return;
    }
    
    const reason = prompt("Reason for rejection:");
    if (!reason) return;
    
    try {
      const notes = (formData.seller_verification_notes || "") + `\n[${format(new Date(), "yyyy-MM-dd HH:mm")}] Rejected: ${reason}`;
      
      // Update user record
      await updateUser(user.id, {
        seller_status: "rejected",
        seller_verification_notes: notes
      });
      
      // Also update seller entity if exists
      await updateSeller(user.id, {
        status: "declined"
      });
      
      setFormData(prev => ({ 
        ...prev, 
        seller_status: "rejected",
        seller_verification_notes: notes
      }));
      
      queryClient.invalidateQueries({ queryKey: ['all-users-manage'] });
      queryClient.invalidateQueries({ queryKey: ['all-sellers-manage'] });
      alert("Seller has been rejected.");
    } catch (err) {
      alert(`Failed to reject seller: ${err.message}`);
    }
  };

  // ─────────────────────────────────────────────────────────────────────────
  // HANDLER: Ban User
  // ─────────────────────────────────────────────────────────────────────────
  const handleBanUser = async () => {
    if (!user?.id) {
      console.warn("[UserProfileDialog] handleBanUser: No user selected");
      alert("No user selected");
      return;
    }
    
    const reason = prompt("Reason for ban:");
    if (!reason) return;
    
    try {
      const now = new Date().toISOString();
      const { data: authData } = await supabase.auth.getUser();
      const adminId = authData?.user?.id ?? null;
      
      // Use canonical account_status columns
      await updateUser(user.id, {
        account_status: "suspended",
        account_status_reason: reason,
        account_status_updated_at: now,
        account_status_updated_by: adminId
      });
      
      queryClient.invalidateQueries({ queryKey: ['all-users-manage'] });
      alert("User has been suspended.");
    } catch (err) {
      alert(`Failed to suspend user: ${err.message}`);
    }
  };

  // ─────────────────────────────────────────────────────────────────────────
  // HANDLER: Unsuspend User (formerly Unban)
  // ─────────────────────────────────────────────────────────────────────────
  const handleUnbanUser = async () => {
    if (!user?.id) {
      console.warn("[UserProfileDialog] handleUnbanUser: No user selected");
      alert("No user selected");
      return;
    }
    
    try {
      const now = new Date().toISOString();
      const { data: authData } = await supabase.auth.getUser();
      const adminId = authData?.user?.id ?? null;
      
      // Use canonical account_status columns
      await updateUser(user.id, {
        account_status: "active",
        account_status_reason: null,
        account_status_updated_at: now,
        account_status_updated_by: adminId
      });
      
      queryClient.invalidateQueries({ queryKey: ['all-users-manage'] });
      alert("User has been unsuspended.");
    } catch (err) {
      alert(`Failed to unsuspend user: ${err.message}`);
    }
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
                <Label className="text-gray-500">Display Name</Label>
                <p className="font-medium">{user.display_name || "Not set"}</p>
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