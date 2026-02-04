import React from "react";
import { supabase } from "@/lib/supabase/supabaseClient";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Bookmark, BookmarkCheck } from "lucide-react";

export default function BookmarkButton({ show, user, variant = "ghost", size = "icon", className = "" }) {
  const queryClient = useQueryClient();

  // Check if user has bookmarked this show
  const { data: bookmarkData } = useQuery({
    queryKey: ['is-bookmarked', user?.id, show?.id],
    queryFn: async () => {
      if (!user?.id || !show?.id) return null;
      const { data, error } = await supabase
        .from("bookmarked_shows")
        .select("id")
        .eq("user_id", user.id)
        .eq("show_id", show.id)
        .maybeSingle();
      if (error) return null;
      return data;
    },
    enabled: !!user?.id && !!show?.id
  });

  const isBookmarked = !!bookmarkData?.id;

  // Bookmark mutation
  const bookmarkMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase
        .from("bookmarked_shows")
        .insert({
          user_id: user.id,
          show_id: show.id
        })
        .select("id")
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['is-bookmarked', user?.id, show.id] });
      queryClient.invalidateQueries({ queryKey: ['bookmarked-shows', user?.id] });
      // NearMe show lists
      queryClient.invalidateQueries({ queryKey: ['nearme-live-shows'] });
      queryClient.invalidateQueries({ queryKey: ['nearme-upcoming-shows'] });
      // Community show lists
      queryClient.invalidateQueries({ queryKey: ['community-live-shows'] });
      queryClient.invalidateQueries({ queryKey: ['community-upcoming-shows'] });
    },
    onError: () => {
      // Fail silently — do not redirect, do not modify auth state
    }
  });

  // Unbookmark mutation
  const unbookmarkMutation = useMutation({
    mutationFn: async () => {
      let error;
      if (bookmarkData?.id) {
        const result = await supabase
          .from("bookmarked_shows")
          .delete()
          .eq("id", bookmarkData.id);
        error = result.error;
      } else if (user?.id && show?.id) {
        // Fallback: delete by user_id + show_id
        const result = await supabase
          .from("bookmarked_shows")
          .delete()
          .eq("user_id", user.id)
          .eq("show_id", show.id);
        error = result.error;
      }
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['is-bookmarked', user?.id, show.id] });
      queryClient.invalidateQueries({ queryKey: ['bookmarked-shows', user?.id] });
      // NearMe show lists
      queryClient.invalidateQueries({ queryKey: ['nearme-live-shows'] });
      queryClient.invalidateQueries({ queryKey: ['nearme-upcoming-shows'] });
      // Community show lists
      queryClient.invalidateQueries({ queryKey: ['community-live-shows'] });
      queryClient.invalidateQueries({ queryKey: ['community-upcoming-shows'] });
    },
    onError: () => {
      // Fail silently — do not redirect, do not modify auth state
    }
  });

  const handleClick = (e) => {
    e.stopPropagation();
    
    if (!user) {
      // Store return URL and redirect to login
      sessionStorage.setItem("login_return_url", window.location.href);
      window.location.href = "/Login";
      return;
    }

    if (isBookmarked) {
      unbookmarkMutation.mutate();
    } else {
      bookmarkMutation.mutate();
    }
  };

  const isPending = bookmarkMutation.isPending || unbookmarkMutation.isPending;

  return (
    <Button
      variant={variant}
      size={size}
      onClick={handleClick}
      disabled={isPending}
      className={`${className} ${isBookmarked ? "text-yellow-500" : "text-white"}`}
    >
      {isBookmarked ? (
        <BookmarkCheck className="w-4 h-4" />
      ) : (
        <Bookmark className="w-4 h-4" />
      )}
    </Button>
  );
}