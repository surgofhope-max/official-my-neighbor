import React, { useState, useEffect } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Shield, X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { supabase } from "@/lib/supabase/supabaseClient";
import { supabaseApi as base44 } from "@/api/supabaseClient"; // Keep for entities
import { useQuery } from "@tanstack/react-query";

export default function ImpersonationBanner() {
  const navigate = useNavigate();
  const sellerId = sessionStorage.getItem('admin_impersonate_seller_id');
  const impersonatedUserId = sessionStorage.getItem('admin_impersonate_user_id');
  const [adminUserId, setAdminUserId] = useState(null);

  useEffect(() => {
    const loadAdminId = async () => {
      try {
        const { data, error } = await supabase.auth.getUser();
        if (error || !data?.user) return;
        setAdminUserId(data.user.id);
      } catch (error) {
        console.error("Error loading admin ID:", error);
      }
    };
    
    if (sellerId) {
      loadAdminId();
    }
  }, [sellerId]);

  const { data: impersonatedSeller } = useQuery({
    queryKey: ['impersonated-seller', sellerId],
    queryFn: async () => {
      if (!sellerId) return null;
      const allSellers = await base44.entities.Seller.list();
      return allSellers.find(s => s.id === sellerId);
    },
    enabled: !!sellerId
  });

  const handleEndImpersonation = async () => {
    console.log("🔚 ENDING IMPERSONATION");
    const startTime = sessionStorage.getItem('admin_impersonate_start');
    
    if (sellerId && startTime) {
      try {
        const { data: authData } = await supabase.auth.getUser();
        const user = authData?.user ?? null;
        if (!user) return;
        const logs = await base44.entities.AdminAccessLog.filter({
          admin_id: user.id,
          seller_id: sellerId,
          action_type: "impersonate_seller"
        }, '-created_date');
        
        if (logs.length > 0) {
          const latestLog = logs[0];
          await base44.entities.AdminAccessLog.update(latestLog.id, {
            session_end: new Date().toISOString()
          });
        }
      } catch (error) {
        console.error("Error updating access log:", error);
      }
    }
    
    // CRITICAL: Clear ALL impersonation state
    console.log("🧹 Clearing all impersonation session storage");
    sessionStorage.removeItem('admin_impersonate_seller_id');
    sessionStorage.removeItem('admin_impersonate_user_id');
    sessionStorage.removeItem('admin_impersonate_user_email');
    sessionStorage.removeItem('admin_impersonate_start');
    
    // Clear any other potential impersonation flags
    Object.keys(sessionStorage).forEach(key => {
      if (key.includes('impersonate')) {
        console.log(`🧹 Removing orphaned key: ${key}`);
        sessionStorage.removeItem(key);
      }
    });
    
    console.log("✅ Impersonation state cleared, reloading to SellerDashboard");
    
    // Force a full page reload to clear all state
    window.location.href = createPageUrl("SellerDashboard");
  };

  if (!sellerId) return null;

  return (
    <Alert className="rounded-none border-l-0 border-r-0 border-t-0 bg-gradient-to-r from-red-600 to-orange-600 text-white border-0 sticky top-0 z-50 shadow-lg">
      <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-start sm:items-center justify-between px-4 py-2 gap-2">
        <div className="flex flex-col gap-1 flex-1">
          <div className="flex items-center gap-3">
            <Shield className="w-5 h-5 flex-shrink-0" />
            <AlertDescription className="text-white font-semibold">
              ADMIN MODE: Impersonating {impersonatedSeller?.business_name || "seller"} • Stripe blocked
            </AlertDescription>
          </div>
          <div className="text-xs text-white/80 ml-8 font-mono">
            Admin ID: {adminUserId?.slice(0, 8) || "..."} • Impersonated User: {impersonatedUserId?.slice(0, 8) || "..."}
          </div>
        </div>
        <Button
          size="sm"
          variant="ghost"
          className="text-white hover:bg-white/20 flex-shrink-0"
          onClick={handleEndImpersonation}
        >
          <X className="w-4 h-4 mr-2" />
          End Impersonation
        </Button>
      </div>
    </Alert>
  );
}