import React from "react";
import { supabaseApi as base44 } from "@/api/supabaseClient";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Bookmark, BookmarkCheck } from "lucide-react";

export default function BookmarkButton({ show, user, variant = "ghost", size = "icon", className = "" }) {
  const queryClient = useQueryClient();

  // Check if user has bookmarked this show
  const { data: bookmarkData = [] } = useQuery({
    queryKey: ['is-bookmarked', user?.id, show?.id],
    queryFn: async () => {
      if (!user?.id || !show?.id) return [];
      return await base44.entities.BookmarkedShow.filter({
        buyer_id: user.id,
        show_id: show.id
      });
    },
    enabled: !!user?.id && !!show?.id
  });

  const isBookmarked = bookmarkData.length > 0;

  // Bookmark mutation
  const bookmarkMutation = useMutation({
    mutationFn: () => base44.entities.BookmarkedShow.create({
      buyer_id: user.id,
      show_id: show.id
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['is-bookmarked', user.id, show.id] });
      queryClient.invalidateQueries({ queryKey: ['bookmarked-shows', user.id] });
    }
  });

  // Unbookmark mutation
  const unbookmarkMutation = useMutation({
    mutationFn: async () => {
      if (bookmarkData[0]?.id) {
        await base44.entities.BookmarkedShow.delete(bookmarkData[0].id);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['is-bookmarked', user.id, show.id] });
      queryClient.invalidateQueries({ queryKey: ['bookmarked-shows', user.id] });
    }
  });

  const handleClick = (e) => {
    e.stopPropagation();
    
    if (!user) {
      base44.auth.redirectToLogin(window.location.href);
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