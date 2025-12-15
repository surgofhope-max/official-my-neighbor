import React, { useState } from "react";
import { supabaseApi as base44 } from "@/api/supabaseClient";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Ban, AlertTriangle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

export default function BanBuyerDialog({ 
  open, 
  onOpenChange, 
  buyer, 
  sellerId,
  onSuccess 
}) {
  const [banLevel, setBanLevel] = useState("full_block");
  const [reason, setReason] = useState("");
  const queryClient = useQueryClient();

  const banMutation = useMutation({
    mutationFn: async (data) => {
      return await base44.entities.SellerBannedBuyer.create(data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['seller-banned-buyers'] });
      onSuccess?.();
      onOpenChange(false);
      setBanLevel("full_block");
      setReason("");
    },
  });

  const handleBan = () => {
    if (!buyer || !sellerId) return;
    
    banMutation.mutate({
      seller_id: sellerId,
      buyer_id: buyer.user_id || buyer.id,
      buyer_email: buyer.email,
      buyer_name: buyer.full_name || buyer.buyer_name || "Unknown",
      ban_level: banLevel,
      reason: reason.trim() || undefined,
      banned_at: new Date().toISOString()
    });
  };

  if (!buyer) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-red-600">
            <Ban className="w-5 h-5" />
            Ban Buyer from Your Business
          </DialogTitle>
          <DialogDescription>
            Restrict {buyer.full_name || buyer.buyer_name || "this buyer"} from interacting with your seller account
          </DialogDescription>
        </DialogHeader>

        <Alert className="bg-orange-50 border-orange-200">
          <AlertTriangle className="h-4 w-4 text-orange-600" />
          <AlertDescription className="text-orange-800 text-sm">
            This action will immediately restrict this buyer. You can unban them later from your dashboard.
          </AlertDescription>
        </Alert>

        <div className="space-y-4">
          <div className="space-y-3">
            <Label className="text-base font-semibold">Ban Level</Label>
            <RadioGroup value={banLevel} onValueChange={setBanLevel}>
              <div className="flex items-start space-x-3 p-3 border rounded-lg hover:bg-gray-50">
                <RadioGroupItem value="show_only" id="show_only" className="mt-1" />
                <div className="flex-1">
                  <Label htmlFor="show_only" className="font-semibold cursor-pointer">
                    Show Ban Only
                  </Label>
                  <p className="text-sm text-gray-600 mt-1">
                    Can't join your live shows or chat. Can still view profile and buy products later.
                  </p>
                </div>
              </div>

              <div className="flex items-start space-x-3 p-3 border rounded-lg hover:bg-gray-50">
                <RadioGroupItem value="purchase_ban" id="purchase_ban" className="mt-1" />
                <div className="flex-1">
                  <Label htmlFor="purchase_ban" className="font-semibold cursor-pointer">
                    Purchase Ban
                  </Label>
                  <p className="text-sm text-gray-600 mt-1">
                    Can't buy products or enter giveaways. Can view shows and profile in read-only mode.
                  </p>
                </div>
              </div>

              <div className="flex items-start space-x-3 p-3 border rounded-lg hover:bg-gray-50 bg-red-50 border-red-200">
                <RadioGroupItem value="full_block" id="full_block" className="mt-1" />
                <div className="flex-1">
                  <Label htmlFor="full_block" className="font-semibold cursor-pointer text-red-900">
                    Full Block (Recommended)
                  </Label>
                  <p className="text-sm text-red-700 mt-1">
                    Complete restriction. Can't view your profile, shows, products, or message you.
                  </p>
                </div>
              </div>
            </RadioGroup>
          </div>

          <div className="space-y-2">
            <Label>Reason (Optional)</Label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g., Repeated no-shows, harassment, spam..."
              rows={3}
            />
          </div>

          <div className="flex gap-3 pt-4">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="flex-1"
              disabled={banMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              onClick={handleBan}
              className="flex-1 bg-red-600 hover:bg-red-700"
              disabled={banMutation.isPending}
            >
              {banMutation.isPending ? "Banning..." : "Ban Buyer"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}