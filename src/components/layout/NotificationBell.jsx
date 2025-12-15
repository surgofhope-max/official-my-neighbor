import React from "react";
import { Bell } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useQuery } from "@tanstack/react-query";
import { supabaseApi as base44 } from "@/api/supabaseClient";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";

export default function NotificationBell({ user }) {
  const navigate = useNavigate();

  const { data: unreadCount = 0 } = useQuery({
    queryKey: ['notification-count', user?.id],
    queryFn: async () => {
      if (!user) return 0;
      const notifications = await base44.entities.Notification.filter({
        user_id: user.id,
        read: false
      });
      return notifications.length;
    },
    enabled: !!user,
    refetchInterval: 10000
  });

  const handleClick = () => {
    navigate(createPageUrl("Notifications"));
  };

  return (
    <Button
      variant="ghost"
      size="icon"
      className="relative"
      onClick={handleClick}
    >
      <Bell className="w-5 h-5 pointer-events-none" />
      {unreadCount > 0 && (
        <Badge 
          className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 bg-red-500 text-white text-xs pointer-events-none"
        >
          {unreadCount > 9 ? "9+" : unreadCount}
        </Badge>
      )}
    </Button>
  );
}