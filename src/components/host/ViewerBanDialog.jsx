import React, { useState } from "react";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { supabaseApi as base44 } from "@/api/supabaseClient";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Ban, MessageSquareOff, EyeOff, ShieldOff, AlertTriangle, Info } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

export default function ViewerBanDialog({ open, onOpenChange, viewer, sellerId, showId }) {
  const queryClient = useQueryClient();
  const [banType, setBanType] = useState("chat");
  const [reason, setReason] = useState("");
  const [error, setError] = useState(null);

  // DEDUPLICATION: Check if user is already banned
  const { data: existingBan, isLoading: checkingBan } = useQuery({
    queryKey: ['existing-ban-check', sellerId, viewer?.user_id],
    queryFn: async () => {
      if (!sellerId || !viewer?.user_id) return null;
      console.log("🔍 DEDUPLICATION - Checking for existing ban:", { sellerId, viewerId: viewer.user_id });
      const bans = await base44.entities.ViewerBan.filter({
        seller_id: sellerId,
        viewer_id: viewer.user_id
      });
      
      if (bans.length > 0) {
        console.log("⚠️ EXISTING BAN FOUND:", bans[0]);
        return bans[0];
      }
      console.log("✅ No existing ban - safe to create new ban");
      return null;
    },
    enabled: open && !!sellerId && !!viewer?.user_id,
    staleTime: 0,
    refetchOnMount: true
  });

  const banViewerMutation = useMutation({
    mutationFn: async (data) => {
      console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
      console.log("🚫 BAN MUTATION - STARTING");
      console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
      console.log("📝 Input Data:");
      console.log("   Seller ID:", data.seller_id);
      console.log("   Viewer ID (user_id):", data.viewer_id);
      console.log("   Viewer Name:", data.viewer_name);
      console.log("   Ban Type:", data.ban_type);
      console.log("   Show ID:", data.show_id);
      console.log("   Reason:", data.reason);
      console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
      
      if (!data.seller_id) throw new Error("seller_id is required");
      if (!data.viewer_id) throw new Error("viewer_id is required");
      if (!data.ban_type) throw new Error("ban_type is required");
      
      console.log("✅ Validation passed, calling database...");
      
      const result = await base44.entities.ViewerBan.create(data);
      
      console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
      console.log("✅✅✅ DATABASE WRITE SUCCESS ✅✅✅");
      console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
      console.log("📋 Created Record:");
      console.log("   Ban ID:", result.id);
      console.log("   Seller ID:", result.seller_id);
      console.log("   Viewer ID:", result.viewer_id);
      console.log("   Viewer Name:", result.viewer_name);
      console.log("   Ban Type:", result.ban_type);
      console.log("   Created Date:", result.created_date);
      console.log("   Reason:", result.reason || "N/A");
      console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
      
      console.log("🔍 Verifying ban was saved...");
      const verifyBans = await base44.entities.ViewerBan.filter({ id: result.id });
      
      if (verifyBans.length === 0) {
        console.error("❌ VERIFICATION FAILED - Ban not found in database");
        throw new Error("Ban was not saved to database - verification failed");
      }
      
      console.log("✅ BAN VERIFIED IN DATABASE");
      console.log("   Verified Record:", verifyBans[0]);
      console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
      
      return result;
    },
    onSuccess: (result) => {
      console.log("🎉 BAN SUCCESS - Invalidating all queries");
      queryClient.invalidateQueries({ queryKey: ['viewer-bans'] });
      queryClient.invalidateQueries({ queryKey: ['chat-messages'] });
      queryClient.invalidateQueries({ queryKey: ['viewer-ban-check'] });
      queryClient.invalidateQueries({ queryKey: ['seller-banned-viewers-count'] });
      queryClient.invalidateQueries({ queryKey: ['existing-ban-check'] });
      
      setError(null);
      onOpenChange(false);
      setReason("");
      setBanType("chat");
      
      alert(`✅ USER BANNED SUCCESSFULLY!\n\n` +
        `Viewer: ${result.viewer_name}\n` +
        `Ban Type: ${result.ban_type}\n` +
        `Ban ID: ${result.id}\n\n` +
        `✓ Database record created\n` +
        `✓ Verification passed\n` +
        `✓ Enforcement active\n\n` +
        `User will be blocked from:\n` +
        `${result.ban_type === 'chat' ? '• Sending chat messages' : ''}\n` +
        `${result.ban_type === 'view' ? '• Viewing your shows\n• Sending chat messages' : ''}\n` +
        `${result.ban_type === 'full' ? '• Viewing your shows\n• Sending chat messages\n• Purchasing from you' : ''}\n\n` +
        `Go to Dashboard → Moderation Center to confirm.`);
    },
    onError: (error) => {
      console.error("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
      console.error("❌ BAN MUTATION FAILED");
      console.error("   Error:", error);
      console.error("   Message:", error.message);
      console.error("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
      setError(error.message);
    }
  });

  const handleBan = () => {
    setError(null);

    if (!viewer) {
      setError("No viewer data provided");
      console.error("❌ VALIDATION FAILED: viewer is null/undefined");
      return;
    }

    if (!viewer.user_id) {
      setError("Viewer ID (user_id) is missing - cannot ban user without ID");
      console.error("❌ VALIDATION FAILED: viewer.user_id is missing");
      console.error("   Viewer object:", viewer);
      return;
    }

    if (!sellerId) {
      setError("Seller ID is missing - cannot process ban");
      console.error("❌ VALIDATION FAILED: sellerId is missing");
      return;
    }

    // DEDUPLICATION: Block if user is already banned
    if (existingBan) {
      setError(`This user is already banned (${existingBan.ban_type}). Unban them first if you want to change the ban level.`);
      console.error("❌ DUPLICATE BAN BLOCKED - User already banned:", existingBan);
      return;
    }

    const banData = {
      seller_id: sellerId,
      viewer_id: viewer.user_id,
      viewer_name: viewer.user_name || "Unknown User",
      ban_type: banType,
      reason: reason.trim() || undefined,
      show_id: showId || undefined
    };

    console.log("🎯 BAN SUBMISSION - All validations passed");
    console.log("   Submitting ban data:", banData);
    
    banViewerMutation.mutate(banData);
  };

  if (!viewer) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Ban className="w-5 h-5 text-red-600" />
            Ban Viewer
          </DialogTitle>
          <DialogDescription>
            Ban {viewer.user_name || "this user"} (ID: {viewer.user_id || "NO ID"}) from your shows
          </DialogDescription>
        </DialogHeader>

        {error && (
          <Alert className="border-red-500 bg-red-50">
            <AlertTriangle className="w-5 h-5 text-red-600" />
            <AlertDescription className="text-red-900 text-sm">
              <strong>Ban Failed:</strong> {error}
            </AlertDescription>
          </Alert>
        )}

        {existingBan && (
          <Alert className="border-yellow-500 bg-yellow-50">
            <Info className="w-5 h-5 text-yellow-600" />
            <AlertDescription className="text-yellow-900 text-sm">
              <strong>Already Banned:</strong> This user is already banned ({existingBan.ban_type}).
              {existingBan.reason && <><br/>Reason: {existingBan.reason}</>}
              <br/>Go to Moderation Center to unban first.
            </AlertDescription>
          </Alert>
        )}

        <div className="space-y-4 py-4">
          <div>
            <Label className="text-base font-semibold mb-3 block">Ban Level</Label>
            <RadioGroup value={banType} onValueChange={setBanType} className="space-y-3">
              <div className="flex items-start space-x-3 p-3 border rounded-lg hover:bg-gray-50 cursor-pointer">
                <RadioGroupItem value="chat" id="chat" disabled={!!existingBan} />
                <label htmlFor="chat" className="flex-1 cursor-pointer">
                  <div className="flex items-center gap-2 font-semibold text-gray-900">
                    <MessageSquareOff className="w-4 h-4 text-orange-600" />
                    Chat Ban Only
                  </div>
                  <p className="text-sm text-gray-600 mt-1">
                    User can't send messages but can still watch the show
                  </p>
                </label>
              </div>

              <div className="flex items-start space-x-3 p-3 border rounded-lg hover:bg-gray-50 cursor-pointer">
                <RadioGroupItem value="view" id="view" disabled={!!existingBan} />
                <label htmlFor="view" className="flex-1 cursor-pointer">
                  <div className="flex items-center gap-2 font-semibold text-gray-900">
                    <EyeOff className="w-4 h-4 text-red-600" />
                    View Ban
                  </div>
                  <p className="text-sm text-gray-600 mt-1">
                    User can't watch any of your shows (includes chat ban)
                  </p>
                </label>
              </div>

              <div className="flex items-start space-x-3 p-3 border rounded-lg hover:bg-gray-50 cursor-pointer">
                <RadioGroupItem value="full" id="full" disabled={!!existingBan} />
                <label htmlFor="full" className="flex-1 cursor-pointer">
                  <div className="flex items-center gap-2 font-semibold text-gray-900">
                    <ShieldOff className="w-4 h-4 text-red-700" />
                    Full Ban
                  </div>
                  <p className="text-sm text-gray-600 mt-1">
                    Complete restriction: can't watch, chat, or purchase from you
                  </p>
                </label>
              </div>
            </RadioGroup>
          </div>

          <div>
            <Label>Reason (Optional)</Label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Why are you banning this user?"
              rows={3}
              className="mt-1"
              disabled={!!existingBan}
            />
          </div>
        </div>

        <div className="flex gap-3">
          <Button
            variant="outline"
            onClick={() => {
              setError(null);
              onOpenChange(false);
            }}
            className="flex-1"
          >
            Cancel
          </Button>
          <Button
            onClick={handleBan}
            disabled={banViewerMutation.isPending || !viewer?.user_id || !!existingBan || checkingBan}
            className="flex-1 bg-red-600 hover:bg-red-700"
          >
            {checkingBan ? "Checking..." : banViewerMutation.isPending ? "Banning..." : existingBan ? "Already Banned" : "Ban User"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}