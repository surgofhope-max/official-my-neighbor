import React, { useState } from "react";
import { supabaseApi as base44 } from "@/api/supabaseClient";
import { Button } from "@/components/ui/button";
import { MessageCircle, Loader2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { findOrCreateConversation } from "@/api/conversations";

export default function MessageSellerButton({ seller, orderId = null, variant = "default", size = "default", className = "" }) {
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(false);

  const handleMessageClick = async (e) => {
    e.stopPropagation();
    
    if (!seller?.id) {
      alert("ERROR: No seller ID provided");
      return;
    }

    setIsLoading(true);

    try {
      const user = await base44.auth.me();
      
      if (!user) {
        // Not logged in - redirect to login
        navigate(createPageUrl("Login"));
        return;
      }
      
      // SAFETY CHECK: Verify buyer safety agreement before messaging
      if (user.buyer_safety_agreed !== true) {
        setIsLoading(false);
        navigate(createPageUrl(`BuyerSafetyAgreement?redirect=Messages`));
        return;
      }
      
      // Find or create conversation using Supabase API
      const conversation = await findOrCreateConversation(user.id, seller.id);
      
      if (!conversation) {
        alert("ERROR: Could not create conversation");
        return;
      }
      
      // Navigate to Messages page with conversation ID
      const timestamp = Date.now();
      navigate(createPageUrl(`Messages?conversationId=${conversation.id}&t=${timestamp}`));

    } catch (error) {
      console.warn("Error creating conversation:", error);
      alert(`ERROR: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Button
      variant={variant}
      size={size}
      className={className}
      onClick={handleMessageClick}
      disabled={isLoading}
    >
      {isLoading ? (
        <>
          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          Loading...
        </>
      ) : (
        <>
          <MessageCircle className="w-4 h-4 mr-2" />
          Message Seller
        </>
      )}
    </Button>
  );
}
