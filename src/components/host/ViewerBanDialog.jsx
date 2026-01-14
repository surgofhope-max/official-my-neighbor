import React, { useState } from "react";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/supabaseClient";
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
import { MessageSquareOff, AlertTriangle, Info } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

export default function ViewerBanDialog({ open, onOpenChange, viewer, sellerId, showId }) {
  const queryClient = useQueryClient();
  const [reason, setReason] = useState("");
  const [error, setError] = useState(null);

  // DEDUPLICATION: Check if user is already banned
  const { data: existingBan, isLoading: checkingBan } = useQuery({
    queryKey: ['viewer-ban-check', sellerId, viewer?.user_id],
    queryFn: async () => {
      if (!sellerId || !viewer?.user_id) return null;
      console.log("🔍 DEDUPLICATION - Checking for existing ban:", { sellerId, viewerId: viewer.user_id });
      const { data } = await supabase
        .from('viewer_bans')
        .select('id, ban_type')
        .eq('seller_id', sellerId)
        .eq('viewer_id', viewer.user_id)
        .maybeSingle();
      
      if (data) {
        console.log("⚠️ EXISTING BAN FOUND:", data);
        return data;
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
      
      const { data: result, error: insertError } = await supabase
        .from("viewer_bans")
        .insert([{
          seller_id: data.seller_id,
          viewer_id: data.viewer_id,
          ban_type: data.ban_type,
          reason: data.reason || null
        }])
        .select()
        .single();

      if (insertError) {
        console.error("❌ SUPABASE BAN INSERT FAILED", insertError);
        throw insertError;
      }
      
      console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
      console.log("✅✅✅ DATABASE WRITE SUCCESS ✅✅✅");
      console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
      console.log("📋 Created Record:");
      console.log("   Ban ID:", result.id);
      console.log("   Seller ID:", result.seller_id);
      console.log("   Viewer ID:", result.viewer_id);
      console.log("   Viewer Name:", result.viewer_name);
      console.log("   Ban Type:", result.ban_type);
      console.log("   Created At:", result.created_at);
      console.log("   Reason:", result.reason || "N/A");
      console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
      
      return result;
    },
    onSuccess: (result) => {
      console.log("🎉 BAN SUCCESS - Invalidating all queries");
      console.log("[VB MUTATION] success; calling invalidations", { sellerId, viewerId: viewer?.user_id ?? null });
      queryClient.invalidateQueries({ queryKey: ['viewer-bans'] });
      queryClient.invalidateQueries({ queryKey: ['chat-messages'] });
      queryClient.invalidateQueries({ queryKey: ['viewer-ban-check'] });
      queryClient.invalidateQueries({ queryKey: ['viewer-ban-check', result.seller_id, result.viewer_id] });
      queryClient.invalidateQueries({ queryKey: ['seller-banned-viewers-count'] });
      queryClient.invalidateQueries({ queryKey: ['existing-ban-check'] });
      
      setError(null);
      onOpenChange(false);
      setReason("");
      
      alert(`✅ VIEWER MUTED SUCCESSFULLY!\n\n` +
        `Viewer: ${result.viewer_name}\n` +
        `Ban ID: ${result.id}\n\n` +
        `✓ Database record created\n` +
        `✓ Enforcement active\n\n` +
        `User will be blocked from:\n` +
        `• Sending chat messages in your shows\n\n` +
        `Go to Dashboard → Moderation Center to unmute.`);
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

    // DEDUPLICATION: Block if user is already muted
    if (existingBan) {
      setError(`This user is already muted. Unmute them first from Moderation Center.`);
      console.error("❌ DUPLICATE MUTE BLOCKED - User already muted:", existingBan);
      return;
    }

    const banData = {
      seller_id: sellerId,
      viewer_id: viewer.user_id,
      viewer_name: viewer.user_name || "Unknown User",
      ban_type: "chat",
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
            <MessageSquareOff className="w-5 h-5 text-orange-600" />
            Mute from chat
          </DialogTitle>
          <DialogDescription>
            This will mute {viewer.user_name || "this user"} from chatting in your shows.
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
              <strong>Already Muted:</strong> This user is already muted ({existingBan.ban_type}).
              {existingBan.reason && <><br/>Reason: {existingBan.reason}</>}
              <br/>Go to Moderation Center to unmute first.
            </AlertDescription>
          </Alert>
        )}

        <div className="space-y-4 py-4">
          <div className="p-3 border rounded-lg bg-orange-50 border-orange-200">
            <div className="flex items-center gap-2 font-semibold text-gray-900">
              <MessageSquareOff className="w-4 h-4 text-orange-600" />
              Chat Mute
            </div>
            <p className="text-sm text-gray-600 mt-1">
              User won't be able to send messages but can still watch the show.
            </p>
          </div>

          <div>
            <Label>Reason (Optional)</Label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Why are you muting this user?"
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
            className="flex-1 bg-orange-600 hover:bg-orange-700"
          >
            {checkingBan ? "Checking..." : banViewerMutation.isPending ? "Muting..." : existingBan ? "Already Muted" : "Mute User"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}