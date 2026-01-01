import React, { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase/supabaseClient";
import { supabaseApi as base44 } from "@/api/supabaseClient"; // Keep for entities
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Gift, Check, UserPlus, Clock, Trophy, Sparkles, PartyPopper } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import WinnerCelebrationOverlay from "./WinnerCelebrationOverlay";

export default function GIVIViewerOverlay({ show, seller }) {
  const queryClient = useQueryClient();
  const [user, setUser] = useState(null);
  const [timeRemaining, setTimeRemaining] = useState(null);
  const [showWinnerAnnouncement, setShowWinnerAnnouncement] = useState(false);
  const [showDetailOverlay, setShowDetailOverlay] = useState(false);
  const [showEntryConfirmation, setShowEntryConfirmation] = useState(false);
  const [showCelebration, setShowCelebration] = useState(false);
  const [celebrationWinners, setCelebrationWinners] = useState(null);

  // CRITICAL: Early return if seller or show is null
  if (!seller || !show) {
    return null;
  }

  useEffect(() => {
    loadUser();
  }, []);

  const loadUser = async () => {
    try {
      const { data, error } = await supabase.auth.getUser();
      if (error) {
        setUser(null);
        return;
      }
      setUser(data?.user ?? null);
    } catch (error) {
      setUser(null);
    }
  };

  // CRITICAL FIX: Fetch GIVI when show exists (regardless of streaming status)
  // This ensures buyers see the GIVI bubble as soon as the seller starts it
  const { data: activeGIVI, refetch: refetchGIVI } = useQuery({
    queryKey: ['viewer-active-givi', show?.id],
    queryFn: async () => {
      if (!show?.id) return null;

      console.log("🎁 [GIVI Viewer] Fetching active GIVI for show:", show.id);

      try {
        const events = await base44.entities.GIVIEvent.filter({
          show_id: show.id,
          status: ["active", "paused"]
        }, '-created_date');

        console.log("🎁 [GIVI Viewer] Found events:", events.length);

        const event = events.length > 0 ? events[0] : null;
        if (!event) {
          console.log("🎁 [GIVI Viewer] No active GIVI found");
          return null;
        }
        
        console.log("🎁 [GIVI Viewer] Active GIVI:", {
          id: event.id,
          status: event.status,
          product: event.product_title
        });
      
        // Auto-close stuck GIVIs (simplified - no verbose logging)
        const now = new Date();
        const endTime = event.end_time ? new Date(event.end_time) : null;
        const endedMoreThan5MinAgo = endTime && (now - endTime) > 300000;
        const hasNoWinners = !event.winner_ids || event.winner_ids.length === 0;
        
        if (endedMoreThan5MinAgo && hasNoWinners) {
          try {
            console.log("🧹 [GIVI Viewer] Auto-closing stuck GIVI:", event.id);
            await base44.entities.GIVIEvent.update(event.id, { status: "closed" });
            return null;
          } catch (error) {
            // Ignore update errors
          }
        }
      
        return event;
      } catch (err) {
        if (err?.response?.status === 429 || err?.message?.includes('429')) {
          console.warn("⚠️ [GIVI Viewer] Rate limited, keeping previous data");
          return undefined;
        }
        throw err;
      }
    },
    // CRITICAL: Enable when show exists - don't require streaming
    // The GIVI should appear even if buyer is on "Waiting for Stream" screen
    enabled: !!show?.id,
    refetchInterval: (query) => {
      const givi = query.state.data;
      // ALWAYS poll every 5s to catch new GIVIs - this is the fix for "GIVI not appearing"
      if (!givi) return 5000;
      if (givi.status === "paused") return 8000;
      if (givi.status === "active") return 5000;
      return 5000;
    },
    staleTime: 3000,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    keepPreviousData: true
  });

  // CRITICAL: Force immediate refetch when show changes or component mounts
  useEffect(() => {
    if (show?.id) {
      console.log("🎁 [GIVI Viewer] Show loaded, forcing GIVI refetch");
      refetchGIVI();
    }
  }, [show?.id, refetchGIVI]);

  // OPTIMIZED: Check if user is following - static data, poll less
  const { data: isFollowing } = useQuery({
    queryKey: ['is-following', user?.id, seller?.id],
    queryFn: async () => {
      if (!user?.id || !seller?.id) return false;
      try {
        const follows = await base44.entities.FollowedSeller.filter({
          buyer_id: user.id,
          seller_id: seller.id
        });
        return follows.length > 0;
      } catch (err) {
        if (err?.response?.status === 429 || err?.message?.includes('429')) {
          console.warn("⚠️ Follow check rate limited");
          return undefined;
        }
        throw err;
      }
    },
    enabled: !!user?.id && !!seller?.id,
    staleTime: 120000, // 2 minutes - rarely changes
    refetchOnWindowFocus: false,
    keepPreviousData: true
  });

  // OPTIMIZED: Check if user has entered - with aggressive reset on GIVI completion
  const { data: hasEntered } = useQuery({
    queryKey: ['has-entered-givi', user?.id, activeGIVI?.id],
    queryFn: async () => {
      if (!user?.id || !activeGIVI?.id) return false;

      // CRITICAL: IMMEDIATELY return false if GIVI is completed/closed
      if (activeGIVI.status === "closed" || activeGIVI.status === "result") {
        return false;
      }

      // CRITICAL: Only check database if GIVI is still active
      if (activeGIVI.status !== "active" && activeGIVI.status !== "paused") {
        return false;
      }

      try {
        const entries = await base44.entities.GIVIEntry.filter({
          givi_event_id: activeGIVI.id,
          user_id: user.id
        });

        return entries.length > 0;
      } catch (err) {
        if (err?.response?.status === 429 || err?.message?.includes('429')) {
          console.warn("⚠️ Entry check rate limited");
          return undefined;
        }
        throw err;
      }
    },
    enabled: !!user?.id && !!activeGIVI?.id && (activeGIVI.status === "active" || activeGIVI.status === "paused"),
    refetchInterval: (query) => {
      // Stop polling if already entered or GIVI completed
      if (query.state.data === true || activeGIVI?.status === "result" || activeGIVI?.status === "closed") {
        return false;
      }
      return 15000; // INCREASED from 10s
    },
    staleTime: 10000,
    refetchOnWindowFocus: false,
    keepPreviousData: true
  });

  // CRITICAL: ONLY run entry state reset when a REAL GIVI with valid ID transitions to closed/result
  // DO NOT run when activeGIVI is undefined/null - that causes the loop bug
  useEffect(() => {
    // CRITICAL FIX: Only act when there's an actual GIVI with a real ID that has ended
    if (activeGIVI?.id && (activeGIVI.status === "closed" || activeGIVI.status === "result")) {
      // Only set the specific query for this GIVI ID - never touch parent queries
      queryClient.setQueryData(['has-entered-givi', user?.id, activeGIVI.id], false);
    }
    // DO NOTHING when activeGIVI is null/undefined - this prevents the glitch loop
  }, [activeGIVI?.id, activeGIVI?.status, user?.id, queryClient]);

  // Removed aggressive query removal that was affecting parent state

  // Timer countdown
  useEffect(() => {
    if (activeGIVI && activeGIVI.status === "active" && activeGIVI.end_time) {
      const interval = setInterval(() => {
        const now = new Date().getTime();
        const end = new Date(activeGIVI.end_time).getTime();
        const remaining = Math.max(0, Math.floor((end - now) / 1000));
        setTimeRemaining(remaining);
      }, 1000);

      return () => clearInterval(interval);
    } else {
      setTimeRemaining(null);
    }
  }, [activeGIVI]);

  // ENHANCED: Show winner announcement - ONLY when there's a REAL GIVI with valid ID
  useEffect(() => {
    // CRITICAL: Skip entirely if no valid GIVI ID exists - prevents glitch loop
    if (!activeGIVI?.id || !user?.id) {
      return;
    }
    
    const isWinner = activeGIVI.status === "result" && 
                     activeGIVI.winner_ids?.includes(user.id);
    
    // CRITICAL: Only show announcement once per GIVI event
    if (isWinner && !showWinnerAnnouncement) {
      console.log("🎉 WINNER DETECTED - GIVI ID:", activeGIVI.id);
      
      setShowWinnerAnnouncement(true);
      
      // Only invalidate buyer-specific queries, NEVER parent show queries
      queryClient.invalidateQueries({ queryKey: ['buyer-batches'] });
      queryClient.invalidateQueries({ queryKey: ['buyer-all-orders'] });
      
      localStorage.setItem(`givi_winner_shown_${activeGIVI.id}`, 'true');
      
      const timer = setTimeout(() => {
        setShowWinnerAnnouncement(false);
      }, 3000);

      return () => clearTimeout(timer);
    }
  }, [activeGIVI?.id, activeGIVI?.status, activeGIVI?.winner_ids, user?.id, queryClient, showWinnerAnnouncement]);

  // CRITICAL: Show celebration overlay - ONLY when there's a REAL GIVI with valid ID and winners
  useEffect(() => {
    // CRITICAL: Skip entirely if no valid GIVI ID - prevents glitch loop
    if (!activeGIVI?.id) {
      return;
    }
    
    if (activeGIVI.status === "result" && 
        activeGIVI.winner_ids?.length > 0 &&
        !showCelebration) {
      
      const celebrationShownKey = `givi_celebration_shown_${activeGIVI.id}`;
      
      if (localStorage.getItem(celebrationShownKey) === 'true') {
        return;
      }

      const winnerData = activeGIVI.winner_ids.map((id, index) => ({
        user_id: id,
        user_name: activeGIVI.winner_names?.[index] || "Winner",
        winner_name: activeGIVI.winner_names?.[index] || "Winner"
      }));
      
      setCelebrationWinners(winnerData);
      setShowCelebration(true);
      localStorage.setItem(celebrationShownKey, 'true');
    }
  }, [activeGIVI?.id, activeGIVI?.status, activeGIVI?.winner_ids, activeGIVI?.winner_names, showCelebration]);

  // Follow mutation with analytics logging
  const followMutation = useMutation({
    mutationFn: async () => {
      if (!user?.id || !seller?.id) {
        throw new Error("Missing user or seller information");
      }
      
      console.log("📊 GIVI Analytics: User following seller", {
        buyer_id: user.id,
        seller_id: seller.id,
        givi_event_id: activeGIVI?.id,
        timestamp: new Date().toISOString()
      });

      return await base44.entities.FollowedSeller.create({
        buyer_id: user.id,
        seller_id: seller.id
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['is-following'] });
      
      // Update GIVI event follower count
      if (activeGIVI?.id) {
        base44.entities.GIVIEvent.update(activeGIVI.id, {
          new_followers_count: (activeGIVI.new_followers_count || 0) + 1
        });
        queryClient.invalidateQueries({ queryKey: ['viewer-active-givi'] });
      }
    },
    onError: (error) => {
      console.error("❌ Follow failed:", error);
    }
  });

  // ENHANCED: Enter GIVI with comprehensive validation and boolean coercion
  const enterGIVIMutation = useMutation({
    mutationFn: async (wasAlreadyFollowing) => {
      if (!user?.id || !activeGIVI?.id || !show?.id) {
        throw new Error("Missing required information");
      }

      // CRITICAL: Validate user has required fields
      if (!user.email) {
        console.error("❌ User missing email:", user);
        throw new Error("User profile incomplete - missing email");
      }

      // CRITICAL: Force boolean coercion to prevent validation errors
      const wasFollowing = Boolean(wasAlreadyFollowing ?? false);
      const followedDuringGivi = !wasFollowing;

      const userName = user.full_name || user.email.split('@')[0] || "Anonymous";
      const userEmail = user.email;

      console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
      console.log("📊 GIVI ENTRY VALIDATION");
      console.log("   User ID:", user.id);
      console.log("   User Name:", userName);
      console.log("   User Email:", userEmail);
      console.log("   Already Following (raw):", wasAlreadyFollowing);
      console.log("   Already Following (validated):", wasFollowing, typeof wasFollowing);
      console.log("   Followed During GIVI:", followedDuringGivi, typeof followedDuringGivi);
      console.log("   GIVI Event ID:", activeGIVI.id);
      console.log("   Show ID:", show.id);
      console.log("   Seller ID:", seller.id);
      console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

      // Check for duplicate entry
      const existingEntries = await base44.entities.GIVIEntry.filter({
        givi_event_id: activeGIVI.id,
        user_id: user.id
      });

      if (existingEntries.length > 0) {
        console.log("⚠️ User already entered GIVI - skipping duplicate");
        throw new Error("You've already entered this giveaway");
      }

      const allEntries = await base44.entities.GIVIEntry.filter({
        givi_event_id: activeGIVI.id
      });

      const entryNumber = allEntries.length + 1;

      console.log("📊 GIVI Analytics: User entering GIVI", {
        buyer_id: user.id,
        buyer_name: userName,
        buyer_email: userEmail,
        seller_id: seller?.id,
        show_id: show.id,
        givi_event_id: activeGIVI.id,
        followed_during_givi: followedDuringGivi,
        was_already_following: wasFollowing,
        entry_number: entryNumber,
        timestamp: new Date().toISOString()
      });

      // Create entry with validated boolean data
      const entry = await base44.entities.GIVIEntry.create({
        givi_event_id: activeGIVI.id,
        show_id: show.id,
        user_id: user.id,
        user_name: userName,
        user_email: userEmail,
        followed_during_givi: followedDuringGivi,
        was_already_following: wasFollowing,
        entry_number: entryNumber
      });

      console.log("✅ GIVI Entry Created Successfully:", {
        entry_id: entry.id,
        entry_number: entryNumber,
        user_id: user.id,
        user_name: userName,
        user_email: userEmail
      });

      // DEBUG LOG: Entry created successfully
      await base44.entities.GIVIDebugLog.create({
        givi_event_id: activeGIVI.id,
        buyer_id: user.id,
        buyer_name: userName,
        buyer_email: userEmail,
        seller_id: seller.id,
        show_id: show.id,
        action: "entry_created",
        status: "success",
        metadata: {
          entry_id: entry.id,
          entry_number: entryNumber,
          was_following: wasFollowing,
          followed_during: followedDuringGivi,
          boolean_types_validated: true,
          timestamp: new Date().toISOString()
        }
      });

      return entry;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['has-entered-givi'] });
      
      // Update total entries count
      if (activeGIVI?.id) {
        base44.entities.GIVIEvent.update(activeGIVI.id, {
          total_entries: (activeGIVI.total_entries || 0) + 1
        });
        queryClient.invalidateQueries({ queryKey: ['viewer-active-givi'] });
      }
      
      // Show entry confirmation
      setShowEntryConfirmation(true);
      setTimeout(() => setShowEntryConfirmation(false), 2000);
      
      // Close detail overlay after entering
      setShowDetailOverlay(false);
    },
    onError: async (error) => {
      console.error("❌ GIVI entry failed:", error);
      
      // DEBUG LOG: Entry failed
      if (activeGIVI?.id && user?.id) {
        await base44.entities.GIVIDebugLog.create({
          givi_event_id: activeGIVI.id,
          buyer_id: user.id,
          buyer_name: user.full_name || user.email,
          buyer_email: user.email,
          seller_id: seller?.id,
          show_id: show?.id,
          action: "entry_failed",
          status: "error",
          error_message: error.message,
          metadata: {
            error_stack: error.stack,
            timestamp: new Date().toISOString()
          }
        });
      }
      
      alert(`Entry failed: ${error.message}`);
    }
  });

  const handleEnterGIVI = async () => {
    if (!user) {
      console.log("🔐 User not logged in - redirecting to login");
      sessionStorage.setItem("login_return_url", window.location.href);
      window.location.href = "/Login";
      return;
    }

    // SAFETY CHECK: Verify buyer safety agreement before entering GIVI
    if (user.user_metadata?.buyer_safety_agreed !== true) {
      console.log("🛡️ User hasn't agreed to buyer safety - redirecting");
      window.location.href = `/BuyerSafetyAgreement?redirect=LiveShow`;
      return;
    }

    try {
      // CRITICAL: Ensure wasAlreadyFollowing is ALWAYS a boolean
      const wasAlreadyFollowing = Boolean(isFollowing ?? false);
      
      console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
      console.log("🎁 GIVI ENTRY ATTEMPT");
      console.log("   User ID:", user.id);
      console.log("   isFollowing (raw):", isFollowing);
      console.log("   wasAlreadyFollowing (validated):", wasAlreadyFollowing);
      console.log("   Type:", typeof wasAlreadyFollowing);
      console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

      if (!wasAlreadyFollowing) {
        console.log("📊 User not following - following seller first");
        await followMutation.mutateAsync();
      }
      
      console.log("🎁 Entering GIVI...");
      await enterGIVIMutation.mutateAsync(wasAlreadyFollowing);
    } catch (error) {
      console.error("❌ GIVI entry process failed:", error);
      alert(`Entry failed: ${error.message}`);
    }
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // CRITICAL FIX: When no GIVI exists, just return null - DO NOTHING ELSE
  // This prevents the glitch loop caused by running logic on undefined values
  if (!activeGIVI || !activeGIVI.id) {
    // No GIVI running - render nothing, don't run any state changes
    return null;
  }
  
  // GIVI exists but is closed - also render nothing
  if (activeGIVI.status === "closed") {
    return null;
  }

  // CRITICAL: Check localStorage to prevent re-showing winner announcement on refresh
  const winnerAnnouncementShown = localStorage.getItem(`givi_winner_shown_${activeGIVI.id}`) === 'true';
  const isCurrentWinner = activeGIVI.status === "result" && activeGIVI.winner_ids?.includes(user?.id);

  // ENHANCED: Winner Announcement Overlay with idempotency
  if (showWinnerAnnouncement && activeGIVI.status === "result" && !winnerAnnouncementShown) {
    return (
      <AnimatePresence>
        <motion.div
          initial={{ opacity: 0, scale: 0.5 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.5 }}
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-sm pointer-events-none"
        >
          {/* Confetti/Coin Animation Background */}
          <div className="absolute inset-0 overflow-hidden">
            {[...Array(30)].map((_, i) => (
              <motion.div
                key={i}
                initial={{ 
                  y: -100, 
                  x: Math.random() * (typeof window !== 'undefined' ? window.innerWidth : 800),
                  rotate: Math.random() * 360
                }}
                animate={{ 
                  y: (typeof window !== 'undefined' ? window.innerHeight : 600) + 100,
                  rotate: Math.random() * 720
                }}
                transition={{ 
                  duration: 2 + Math.random() * 1,
                  ease: "linear"
                }}
                className="absolute text-3xl"
              >
                {i % 3 === 0 ? '🪙' : i % 3 === 1 ? '🎉' : '✨'}
              </motion.div>
            ))}
          </div>

          <motion.div
            initial={{ y: -50 }}
            animate={{ y: 0 }}
            exit={{ y: 50, opacity: 0 }}
            className="relative max-w-md mx-4 p-8 bg-gradient-to-br from-yellow-400 via-orange-500 to-red-500 rounded-3xl shadow-2xl text-center"
          >
            <motion.div
              animate={{ 
                scale: [1, 1.2, 1],
                rotate: [0, 10, -10, 0]
              }}
              transition={{ 
                repeat: Infinity, 
                duration: 0.6
              }}
            >
              <Trophy className="w-24 h-24 text-white mx-auto mb-4 drop-shadow-2xl" />
            </motion.div>
            <h1 className="text-4xl font-bold text-white mb-2 drop-shadow-lg">
              🎉 YOU WON! 🎉
            </h1>
            <p className="text-2xl text-white/90 mb-4 font-semibold drop-shadow-md">
              {activeGIVI.product_title || "Prize"}
            </p>
            <p className="text-white/80 text-sm mb-2">
              Check "My Orders" for pickup details!
            </p>
            <p className="text-white/60 text-xs">
              🎁 This is a FREE item - no payment required
            </p>
          </motion.div>
        </motion.div>
      </AnimatePresence>
    );
  }

  // Hide button after winner announcement OR if result state with no winners
  if (activeGIVI.status === "result") {
    // If there are no winners, hide immediately
    if (!activeGIVI.winner_ids || activeGIVI.winner_ids.length === 0) {
      return null;
    }
    // Normal case: hide after winner announcement
    if (!showWinnerAnnouncement) {
      return null;
    }
  }

  // Entry Confirmation Toast
  const EntryConfirmation = () => (
    <AnimatePresence>
      {showEntryConfirmation && (
        <motion.div
          initial={{ opacity: 0, y: -20, scale: 0.8 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -20, scale: 0.8 }}
          className="fixed top-24 left-1/2 transform -translate-x-1/2 z-[150] bg-green-500 text-white px-6 py-3 rounded-full shadow-2xl font-bold text-sm"
        >
          <div className="flex items-center gap-2">
            <PartyPopper className="w-5 h-5" />
            🎉 You're In!
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );

  // Main GIVI Entry Button (Top-Right Quadrant)
  return (
    <>
      {/* Winner Celebration Overlay - Shows for ALL viewers */}
      {showCelebration && celebrationWinners && (
        <WinnerCelebrationOverlay 
          winners={celebrationWinners}
          onComplete={() => {
            setShowCelebration(false);
            setCelebrationWinners(null);
          }}
        />
      )}

      <EntryConfirmation />

      {/* Main GIVI Entry Button - CRITICAL: z-index must be ABOVE "Waiting for Stream" overlay */}
      <motion.div
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.8 }}
        transition={{ duration: 0.3 }}
        className="fixed z-[500]"
        style={{
          top: '80px',
          right: '12px',
        }}
      >
        <button
          onClick={() => setShowDetailOverlay(true)}
          className={`relative w-24 h-24 rounded-2xl shadow-2xl transition-all duration-200 hover:scale-105 ${
            hasEntered 
              ? 'bg-gradient-to-br from-green-500 to-emerald-600' 
              : 'bg-gradient-to-br from-purple-600 via-pink-600 to-orange-600 animate-pulse'
          }`}
        >
          {/* Product Image Background */}
          {activeGIVI.product_image_url && (
            <div className="absolute inset-0 rounded-2xl overflow-hidden opacity-30">
              <img
                src={activeGIVI.product_image_url}
                alt={activeGIVI.product_title || "GIVI Prize"}
                className="w-full h-full object-cover"
              />
            </div>
          )}

          {/* Content */}
          <div className="relative flex flex-col items-center justify-center h-full p-2 text-white">
            {/* Icon */}
            {hasEntered ? (
              <Check className="w-8 h-8 mb-1" />
            ) : !isFollowing ? (
              <UserPlus className="w-8 h-8 mb-1" />
            ) : (
              <Gift className="w-8 h-8 mb-1" />
            )}
            
            {/* Text */}
            <span className="text-[10px] font-bold text-center leading-tight drop-shadow-lg">
              {hasEntered ? "Entered" : !isFollowing ? "Follow & Enter" : "Enter GIVI"}
            </span>

            {/* Timer Badge */}
            {timeRemaining !== null && activeGIVI.status === "active" && !hasEntered && (
              <div className="absolute bottom-1 left-1/2 transform -translate-x-1/2 bg-black/70 backdrop-blur-sm px-2 py-0.5 rounded-full">
                <span className="text-[8px] font-bold text-white">
                  {formatTime(timeRemaining)}
                </span>
              </div>
            )}

            {/* Status Badge */}
            {activeGIVI.status === "paused" && (
              <div className="absolute top-1 right-1 bg-yellow-500 rounded-full p-1">
                <div className="w-2 h-2 bg-white rounded-full"></div>
              </div>
            )}
          </div>
        </button>
      </motion.div>

      {/* Detail Overlay Dialog */}
      <AnimatePresence>
        {showDetailOverlay && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm"
            onClick={() => setShowDetailOverlay(false)}
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              onClick={(e) => e.stopPropagation()}
              className="max-w-sm mx-4 bg-white rounded-2xl shadow-2xl overflow-hidden"
            >
              {/* Header with Gradient */}
              <div className="bg-gradient-to-r from-purple-600 via-pink-600 to-orange-600 p-6 text-center">
                <Gift className="w-12 h-12 text-white mx-auto mb-2" />
                <h3 className="text-xl font-bold text-white mb-1">
                  GIVEAWAY ACTIVE
                </h3>
                <Badge className="bg-white/20 text-white border-white/30 border">
                  {activeGIVI.total_entries || 0} {activeGIVI.total_entries === 1 ? 'entry' : 'entries'}
                </Badge>
              </div>

              {/* Product Details */}
              <div className="p-6">
                <div className="flex gap-4 mb-4">
                  {activeGIVI.product_image_url && (
                    <img
                      src={activeGIVI.product_image_url}
                      alt={activeGIVI.product_title || "GIVI Prize"}
                      className="w-24 h-24 rounded-lg object-cover"
                    />
                  )}
                  <div className="flex-1">
                    <h4 className="font-bold text-gray-900 text-lg mb-2">
                      {activeGIVI.product_title || "GIVI Prize"}
                    </h4>
                    
                    {/* Timer */}
                    {timeRemaining !== null && activeGIVI.status === "active" && (
                      <div className="flex items-center gap-2 text-sm text-gray-600 mb-2">
                        <Clock className="w-4 h-4" />
                        <span className="font-semibold">{formatTime(timeRemaining)}</span>
                        <span className="text-gray-500">left</span>
                      </div>
                    )}

                    {/* Status */}
                    {activeGIVI.status === "paused" && (
                      <Badge className="bg-yellow-500 text-white border-0 text-xs">
                        PAUSED
                      </Badge>
                    )}
                  </div>
                </div>

                {/* Entry Button */}
                {activeGIVI.status === "active" && (
                  <Button
                    onClick={handleEnterGIVI}
                    disabled={hasEntered || followMutation.isPending || enterGIVIMutation.isPending}
                    className={`w-full ${
                      hasEntered 
                        ? "bg-green-500 hover:bg-green-600" 
                        : "bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700"
                    } text-white font-bold py-3 text-base`}
                  >
                    {hasEntered ? (
                      <>
                        <Check className="w-5 h-5 mr-2" />
                        You're Entered! ✅
                      </>
                    ) : !isFollowing ? (
                      <>
                        <UserPlus className="w-5 h-5 mr-2" />
                        Follow & Enter GIVI
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-5 h-5 mr-2" />
                        Enter GIVI Now
                      </>
                    )}
                  </Button>
                )}

                {/* Info Text */}
                <p className="text-xs text-gray-500 text-center mt-4">
                  {hasEntered 
                    ? "Good luck! Winner will be announced when the timer ends." 
                    : "Enter now for a chance to win this product!"}
                </p>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}