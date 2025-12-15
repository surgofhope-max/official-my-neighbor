import React, { useState, useEffect, useRef } from "react";
import { supabaseApi as base44 } from "@/api/supabaseClient";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Plus } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Gift, Play, Pause, StopCircle, Trophy, Users, Clock, Sparkles, ShoppingBag } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

export default function GIVIHostPanel({ show, seller, formOnly = false, onFormClose, externalDrawerOpen = false, onCloseExternalDrawer, onAddNewGivi }) {
  const queryClient = useQueryClient();
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  
  // Use external drawer state if provided
  const isCreateFormOpen = externalDrawerOpen !== undefined ? externalDrawerOpen : showCreateDialog;
  const closeCreateForm = onCloseExternalDrawer || (() => setShowCreateDialog(false));
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [duration, setDuration] = useState("300");
  const [numberOfWinners, setNumberOfWinners] = useState("1");
  const [timeRemaining, setTimeRemaining] = useState(null);
  const [winnerSelectionInProgress, setWinnerSelectionInProgress] = useState(false);
  const winnerSelectionTriggeredRef = useRef(null); // Track which GIVI has triggered selection

  // CRITICAL: Early return if seller or show is null
  if (!seller || !show) {
    return (
      <div className="space-y-4">
        <Alert>
          <AlertDescription>
            Unable to load GIVI system. Missing seller or show information.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  // Generate 9-digit completion code
  const generateCompletionCode = () => {
    return Math.floor(100000000 + Math.random() * 900000000).toString();
  };

  // Generate batch number
  const generateBatchNumber = (showId, buyerId) => {
    const shortShowId = showId.substring(0, 8);
    const shortBuyerId = buyerId.substring(0, 8);
    const timestamp = new Date().toISOString().split('T')[0].replace(/-/g, '');
    return `BATCH-${shortShowId}-${shortBuyerId}-${timestamp}`;
  };

  // Fetch GIVI products (products marked as is_givey)
  const { data: giviProducts = [] } = useQuery({
    queryKey: ['givi-products', seller?.id],
    queryFn: async () => {
      if (!seller?.id) return [];
      const products = await base44.entities.Product.filter({
        seller_id: seller.id,
        is_givey: true
      });
      return products;
    },
    enabled: !!seller?.id
  });

  // Fetch active GIVI event for this show
  const { data: activeGIVI } = useQuery({
    queryKey: ['active-givi', show?.id],
    queryFn: async () => {
      if (!show?.id) return null;
      const events = await base44.entities.GIVIEvent.filter({
        show_id: show.id,
        status: ["active", "paused"]
      }, '-created_date');
      return events.length > 0 ? events[0] : null;
    },
    enabled: !!show?.id,
    refetchInterval: 5000 // REDUCED: Poll less frequently to prevent race conditions
  });
  
  // Reset trigger ref when GIVI changes or completes
  useEffect(() => {
    if (!activeGIVI || activeGIVI.status === "result" || activeGIVI.status === "closed") {
      winnerSelectionTriggeredRef.current = null;
    }
  }, [activeGIVI?.id, activeGIVI?.status]);

  // Fetch entries for active GIVI
  const { data: entries = [] } = useQuery({
    queryKey: ['givi-entries', activeGIVI?.id],
    queryFn: async () => {
      if (!activeGIVI?.id) return [];
      return await base44.entities.GIVIEntry.filter({
        givi_event_id: activeGIVI.id
      });
    },
    enabled: !!activeGIVI?.id,
    refetchInterval: 3000 // REDUCED: Poll less frequently
  });

  // ENHANCED: Create GIVI with product quantity validation AND ghost GIVI cleanup
  const createGIVIMutation = useMutation({
    mutationFn: async () => {
      if (!seller?.id || !show?.id) {
        throw new Error("Missing seller or show information");
      }

      const product = giviProducts.find(p => p.id === selectedProduct);
      if (!product) {
        throw new Error("Product not found");
      }

      // CRITICAL: Validate product quantity BEFORE starting GIVI
      if (!product.quantity || product.quantity <= 0) {
        throw new Error(`Cannot start GIVI - "${product.title}" has 0 quantity. Please add inventory first.`);
      }

      const winnersRequested = parseInt(numberOfWinners);
      
      // Validate we have enough quantity for winners
      if (product.quantity < winnersRequested) {
        throw new Error(`Cannot start GIVI - Product has ${product.quantity} in stock but ${winnersRequested} winners requested. Reduce winners or add inventory.`);
      }

      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      // CRITICAL: GHOST GIVI CLEANUP - Clean up zero-entry GIVIs before starting new one
      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      console.log("🧹 Checking for ghost GIVIs to clean up...");
      
      try {
        // Find all GIVIs for this show that are stuck/closed with zero entries
        const allShowGIVIs = await base44.entities.GIVIEvent.filter({
          show_id: show.id
        });
        
        for (const givi of allShowGIVIs) {
          // Check if this GIVI is a "ghost" (closed/result with no entries or no winners)
          const isGhost = (givi.status === "closed" || givi.status === "result") &&
                          (!givi.total_entries || givi.total_entries === 0) &&
                          (!givi.winner_ids || givi.winner_ids.length === 0);
          
          // Also check for stuck active/paused GIVIs that ended long ago
          const now = new Date();
          const endTime = givi.end_time ? new Date(givi.end_time) : null;
          const isStuck = (givi.status === "active" || givi.status === "paused") &&
                          endTime && (now - endTime) > 300000; // 5+ minutes past end
          
          if (isGhost || isStuck) {
            console.log(`🧹 Cleaning ghost/stuck GIVI: ${givi.id} (status: ${givi.status}, entries: ${givi.total_entries || 0})`);
            
            // Delete all entries for this GIVI (should be none for ghosts, but just in case)
            const ghostEntries = await base44.entities.GIVIEntry.filter({
              givi_event_id: givi.id
            });
            
            for (const entry of ghostEntries) {
              await base44.entities.GIVIEntry.delete(entry.id);
            }
            
            // Delete the ghost GIVI event
            await base44.entities.GIVIEvent.delete(givi.id);
            
            console.log(`✅ Ghost GIVI cleaned: ${givi.id}`);
          }
        }
      } catch (cleanupError) {
        console.warn("⚠️ Ghost GIVI cleanup failed (non-fatal):", cleanupError.message);
        // Don't throw - cleanup failure shouldn't block new GIVI creation
      }
      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

      const durationSeconds = parseInt(duration);
      const startTime = new Date();
      const endTime = new Date(startTime.getTime() + durationSeconds * 1000);

      console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
      console.log("🎁 CREATING GIVI EVENT");
      console.log("   Product:", product.title);
      console.log("   Product ID:", product.id);
      console.log("   Current Quantity:", product.quantity);
      console.log("   Winners to Select:", winnersRequested);
      console.log("   Duration:", durationSeconds, "seconds");
      console.log("   Quantity Validation: PASSED ✅");
      console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

      const giviEvent = await base44.entities.GIVIEvent.create({
        show_id: show.id,
        host_id: seller.id,
        product_id: product.id,
        product_title: product.title,
        product_image_url: product.image_urls?.[0],
        duration_seconds: durationSeconds,
        number_of_winners: winnersRequested,
        start_time: startTime.toISOString(),
        end_time: endTime.toISOString(),
        status: "active",
        total_entries: 0,
        new_followers_count: 0,
        auto_winner_select: true
      });

      // DEBUG LOG: GIVI Started
      await base44.entities.GIVIDebugLog.create({
        givi_event_id: giviEvent.id,
        seller_id: seller.id,
        show_id: show.id,
        action: "givi_started",
        status: "success",
        metadata: {
          product_title: product.title,
          duration_seconds: durationSeconds,
          number_of_winners: parseInt(numberOfWinners),
          timestamp: new Date().toISOString()
        }
      });

      return giviEvent;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['active-givi'] });
      // Don't close the form if we're in external drawer mode - let parent handle it
      if (!externalDrawerOpen) {
        closeCreateForm();
        setShowCreateDialog(false);
      }
      if (onFormClose) onFormClose();
      setSelectedProduct(null);
      console.log("✅ GIVI EVENT CREATED - Button now visible to all viewers");
      }
  });

  // Pause GIVI mutation
  const pauseGIVIMutation = useMutation({
    mutationFn: async () => {
      if (!activeGIVI?.id) throw new Error("No active GIVI");
      console.log("⏸️ PAUSING GIVI");
      await base44.entities.GIVIEvent.update(activeGIVI.id, {
        status: "paused"
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['active-givi'] });
    }
  });

  // Resume GIVI mutation
  const resumeGIVIMutation = useMutation({
    mutationFn: async () => {
      if (!activeGIVI?.id) throw new Error("No active GIVI");
      console.log("▶️ RESUMING GIVI");
      await base44.entities.GIVIEvent.update(activeGIVI.id, {
        status: "active"
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['active-givi'] });
    }
  });

  // End GIVI mutation
  const endGIVIMutation = useMutation({
    mutationFn: async () => {
      if (!activeGIVI?.id) throw new Error("No active GIVI");
      console.log("⏹️ ENDING GIVI");
      await base44.entities.GIVIEvent.update(activeGIVI.id, {
        status: "closed",
        end_time: new Date().toISOString()
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['active-givi'] });
    }
  });

  // ENHANCED: Select winners with atomic idempotency and comprehensive debug logging
  const selectWinnersMutation = useMutation({
    mutationFn: async () => {
      // CRITICAL: Frontend safeguard - Check if already in progress
      if (winnerSelectionInProgress) {
        console.log("⚠️ Winner selection already in progress - blocking duplicate call");
        throw new Error("Winner selection already in progress");
      }

      // CRITICAL: Set flag IMMEDIATELY to prevent race conditions
      setWinnerSelectionInProgress(true);

      // CRITICAL: Verify seller exists before proceeding
      if (!seller?.id) {
        throw new Error("Seller information is missing");
      }
      
      if (!activeGIVI?.id) {
        throw new Error("No active GIVI");
      }

      // CRITICAL: ATOMIC IDEMPOTENCY CHECK - Prevent duplicate winner selection
      // Re-fetch the latest GIVI state to prevent race conditions
      const latestGIVIState = await base44.entities.GIVIEvent.filter({ id: activeGIVI.id });
      const currentGIVI = latestGIVIState[0];
      
      if (!currentGIVI) {
        throw new Error("GIVI event not found");
      }

      if (currentGIVI.status === "result" || currentGIVI.status === "closed") {
        console.log("⚠️ GIVI already completed - skipping duplicate winner selection");
        throw new Error("Winners already selected for this GIVI");
      }

      if (currentGIVI.winner_ids && currentGIVI.winner_ids.length > 0) {
        console.log("⚠️ Winners already exist - preventing duplicate selection");
        console.log("   Winner IDs:", currentGIVI.winner_ids);
        throw new Error("Winners already selected for this GIVI");
      }
      
      console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
      console.log("✅ IDEMPOTENCY CHECK PASSED - Safe to select winners");
      console.log("   GIVI ID:", activeGIVI.id);
      console.log("   Current Status:", currentGIVI.status);
      console.log("   Current Winner IDs:", currentGIVI.winner_ids);
      console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
      
      if (entries.length === 0) {
        // DEBUG LOG: No entries error
        await base44.entities.GIVIDebugLog.create({
          givi_event_id: activeGIVI.id,
          seller_id: seller.id,
          show_id: show.id,
          action: "winner_selected",
          status: "error",
          error_message: "No entries to select from",
          metadata: {
            total_entries: 0,
            timestamp: new Date().toISOString()
          }
        });
        
        throw new Error("No entries to select from");
      }

      const numberOfWinnersToSelect = Math.min(activeGIVI.number_of_winners, entries.length);
      
      // ENHANCED: Validate all entries have required data
      const validEntries = entries.filter(entry => {
        const isValid = entry.user_id && entry.user_name && entry.user_email;
        if (!isValid) {
          console.error("⚠️ INVALID ENTRY DETECTED:", entry);
        }
        return isValid;
      });

      console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
      console.log("🏆 SELECTING WINNERS");
      console.log("   Total Entries:", entries.length);
      console.log("   Valid Entries:", validEntries.length);
      console.log("   Invalid Entries:", entries.length - validEntries.length);
      console.log("   Winners to Select:", numberOfWinnersToSelect);
      console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

      // Use only valid entries for selection
      const shuffled = [...validEntries].sort(() => Math.random() - 0.5);
      const winners = shuffled.slice(0, numberOfWinnersToSelect);

      // DEBUG LOG: Log each winner with full details
      console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
      console.log("🎉 WINNERS SELECTED:");
      winners.forEach((winner, idx) => {
        console.log(`   Winner ${idx + 1}:`, {
          user_id: winner.user_id,
          user_name: winner.user_name,
          user_email: winner.user_email,
          entry_number: winner.entry_number,
          was_following: winner.was_already_following,
          followed_during: winner.followed_during_givi
        });
      });
      console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

      // Mark winners in GIVIEntry
      for (const winner of winners) {
        await base44.entities.GIVIEntry.update(winner.id, {
          is_winner: true
        });
      }

      // Update GIVI event to "result" - this triggers immediate UI reset
      console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
      console.log("🎯 UPDATING GIVI STATUS TO 'result'");
      console.log("   This will trigger immediate UI reset for all clients");
      console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
      
      await base44.entities.GIVIEvent.update(activeGIVI.id, {
        status: "result",
        winner_ids: winners.map(w => w.user_id),
        winner_names: winners.map(w => w.user_name),
        announced_at: new Date().toISOString()
      });
      
      console.log("✅ GIVI status updated - UI reset should trigger immediately");
      
      // CRITICAL: Immediately invalidate queries to trigger UI reset BEFORE order creation
      queryClient.invalidateQueries({ queryKey: ['active-givi'] });
      queryClient.invalidateQueries({ queryKey: ['viewer-active-givi'] });
      queryClient.invalidateQueries({ queryKey: ['has-entered-givi'] });

      // CREATE $0 ORDERS FOR WINNERS with idempotency checks
      console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
      console.log("📦 CREATING $0.00 ORDERS FOR WINNERS");
      console.log("   Total Winners:", winners.length);
      console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
      
      let ordersCreated = 0;
      let ordersDuplicate = 0;
      
      for (const winner of winners) {
        try {
          console.log(`💰 Processing winner ${ordersCreated + 1}/${winners.length}: ${winner.user_name}`);
          console.log(`   User ID: ${winner.user_id}`);
          console.log(`   User Email: ${winner.user_email}`);
          
          // CRITICAL: Verify we're using the correct user_id
          if (!winner.user_id) {
            throw new Error(`Winner missing user_id: ${JSON.stringify(winner)}`);
          }

          // CRITICAL: ENHANCED IDEMPOTENCY CHECK - Prevent duplicate orders for same GIVI + buyer
          const existingOrders = await base44.entities.Order.filter({
            buyer_id: winner.user_id,
            givi_event_id: activeGIVI.id  // CRITICAL: Check specific GIVI event
          });

          if (existingOrders.length > 0) {
            console.log(`   ⚠️ DUPLICATE ORDER PREVENTED - Order already exists for this GIVI+buyer`);
            console.log(`      Existing Order ID:`, existingOrders[0].id);
            console.log(`      GIVI Event ID:`, activeGIVI.id);
            console.log(`      Buyer ID:`, winner.user_id);
            ordersDuplicate++;
            
            // Log duplicate prevention
            await base44.entities.GIVIDebugLog.create({
              givi_event_id: activeGIVI.id,
              buyer_id: winner.user_id,
              buyer_name: winner.user_name,
              buyer_email: winner.user_email,
              seller_id: seller.id,
              show_id: show.id,
              action: "duplicate_order_prevented",
              status: "success",
              metadata: {
                existing_order_id: existingOrders[0].id,
                timestamp: new Date().toISOString()
              }
            });
            
            continue; // Skip to next winner
          }

          const pickupCode = `GIVI${Date.now().toString().slice(-8)}`;

          // CRITICAL: Check if a batch exists AND is not completed
          const existingBatches = await base44.entities.Batch.filter({
            buyer_id: winner.user_id,
            seller_id: seller.id,
            show_id: show.id
          });

          // Filter out completed batches - they cannot be reused
          const activeBatches = existingBatches.filter(b => b.status !== 'completed');

          console.log(`   Existing batches for this user:`, existingBatches.length);
          console.log(`   Active (non-completed) batches:`, activeBatches.length);

          let batch;
          let batchCompletionCode;
          let batchNumber;

          // Build pickup location safely
          const pickupAddress = seller.pickup_address || "Pickup location";
          const pickupCity = seller.pickup_city || "";
          const pickupState = seller.pickup_state || "";
          const pickupLocation = `${pickupAddress}${pickupCity ? ', ' + pickupCity : ''}${pickupState ? ', ' + pickupState : ''}`;

          if (activeBatches.length > 0) {
            // Reuse the first active (non-completed) batch
            batch = activeBatches[0];
            batchCompletionCode = batch.completion_code;
            batchNumber = batch.batch_number;
            console.log(`   ✅ Reusing ACTIVE batch: ${batchNumber}`);
          } else if (existingBatches.length > 0) {
            // All existing batches are completed - create new one
            console.log(`   ⚠️ All batches COMPLETED - creating NEW batch`);
            batchCompletionCode = generateCompletionCode();
            batchNumber = generateBatchNumber(show.id, winner.user_id);

            console.log(`   🆕 Creating new batch: ${batchNumber}`);
            console.log(`      Buyer ID: ${winner.user_id}`);
            console.log(`      Buyer Name: ${winner.user_name}`);
            console.log(`      Buyer Email: ${winner.user_email}`);

            batch = await base44.entities.Batch.create({
              batch_number: batchNumber,
              buyer_id: winner.user_id,
              buyer_name: winner.user_name || "Winner",
              buyer_email: winner.user_email || "",
              buyer_phone: "",
              seller_id: seller.id,
              show_id: show.id,
              completion_code: batchCompletionCode,
              total_items: 0,
              total_amount: 0,
              status: "pending",
              pickup_location: pickupLocation,
              pickup_notes: seller.pickup_notes || ""
            });

            console.log(`   ✅ New batch created (previous was completed):`, {
              batch_id: batch.id,
              buyer_id: batch.buyer_id,
              completion_code: batch.completion_code
            });
          } else {
            // No batches exist at all - create first one
            // Create new batch
            batchCompletionCode = generateCompletionCode();
            batchNumber = generateBatchNumber(show.id, winner.user_id);
            
            console.log(`   🆕 Creating new batch: ${batchNumber}`);
            console.log(`      Buyer ID: ${winner.user_id}`);
            console.log(`      Buyer Name: ${winner.user_name}`);
            console.log(`      Buyer Email: ${winner.user_email}`);
            
            batch = await base44.entities.Batch.create({
              batch_number: batchNumber,
              buyer_id: winner.user_id,
              buyer_name: winner.user_name || "Winner",
              buyer_email: winner.user_email || "",
              buyer_phone: "",
              seller_id: seller.id,
              show_id: show.id,
              completion_code: batchCompletionCode,
              total_items: 0,
              total_amount: 0,
              status: "pending",
              pickup_location: pickupLocation,
              pickup_notes: seller.pickup_notes || ""
            });
            
            console.log(`   ✅ Batch created successfully:`, {
              batch_id: batch.id,
              buyer_id: batch.buyer_id,
              completion_code: batch.completion_code
            });
          }
          
          // CRITICAL: Create the $0 FREE GIVI order with explicit buyer_id and givi_event_id
          console.log(`   🎁 Creating FREE GIVI order...`);
          console.log(`      Product: ${activeGIVI.product_title}`);
          console.log(`      Buyer ID: ${winner.user_id}`);
          console.log(`      GIVI Event ID: ${activeGIVI.id}`);
          console.log(`      Batch ID: ${batch.id}`);
          
          const order = await base44.entities.Order.create({
            buyer_id: winner.user_id,  // CRITICAL: Use winner's user_id
            buyer_name: winner.user_name || "Winner",
            buyer_email: winner.user_email || "",
            buyer_phone: "",
            seller_id: seller.id,
            product_id: activeGIVI.product_id,
            show_id: show.id,
            product_title: `[FREE GIVI] ${activeGIVI.product_title || "Prize"}`,
            product_image_url: activeGIVI.product_image_url || "",
            price: 0.00,
            status: "paid",
            pickup_code: pickupCode,
            pickup_location: pickupLocation,
            pickup_notes: `🎁 FREE GIVEAWAY ITEM - No payment required. Winner selected from GIVI event.`,
            group_code: batchNumber,
            completion_code: batchCompletionCode,
            batch_id: batch.id,
            givi_event_id: activeGIVI.id  // CRITICAL: Track which GIVI this order came from
          });
          
          console.log(`   ✅ GIVI Order Created Successfully:`, {
            order_id: order.id,
            buyer_id: order.buyer_id,
            buyer_name: order.buyer_name,
            buyer_email: order.buyer_email,
            product: order.product_title,
            price: order.price,
            batch_id: order.batch_id,
            status: order.status
          });
          
          ordersCreated++;
          
          // Update batch totals
          const newTotalItems = batch.total_items + 1;
          const newTotalAmount = batch.total_amount + 0;
          
          await base44.entities.Batch.update(batch.id, {
            total_items: newTotalItems,
            total_amount: newTotalAmount
          });
          
          console.log(`   ✅ Batch updated: ${newTotalItems} items, $${newTotalAmount.toFixed(2)}`);

          // DEBUG LOG: Order created successfully
          await base44.entities.GIVIDebugLog.create({
            givi_event_id: activeGIVI.id,
            buyer_id: winner.user_id,
            buyer_name: winner.user_name,
            buyer_email: winner.user_email,
            seller_id: seller.id,
            show_id: show.id,
            action: "order_created",
            status: "success",
            metadata: {
              order_id: order.id,
              batch_id: batch.id,
              batch_number: batchNumber,
              pickup_code: pickupCode,
              buyer_id_used: winner.user_id,
              orders_created_count: ordersCreated,
              timestamp: new Date().toISOString()
            }
          });
          
        } catch (error) {
          console.error("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
          console.error("❌ FAILED TO CREATE ORDER FOR WINNER");
          console.error("   Winner Name:", winner.user_name);
          console.error("   Winner User ID:", winner.user_id);
          console.error("   Error:", error.message);
          console.error("   Stack:", error.stack);
          console.error("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
          
          // DEBUG LOG: Order creation failed
          await base44.entities.GIVIDebugLog.create({
            givi_event_id: activeGIVI.id,
            buyer_id: winner.user_id,
            buyer_name: winner.user_name,
            buyer_email: winner.user_email,
            seller_id: seller.id,
            show_id: show.id,
            action: "order_created",
            status: "error",
            error_message: error.message,
            metadata: {
              error_stack: error.stack,
              winner_data: {
                user_id: winner.user_id,
                user_name: winner.user_name,
                user_email: winner.user_email
              },
              timestamp: new Date().toISOString()
            }
          });
        }
      }

      // CRITICAL: Only decrement product quantity if orders were actually created
      // This prevents inventory loss on zero-entry GIVIs
      console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
      console.log("📦 UPDATING PRODUCT QUANTITY");
      
      if (ordersCreated === 0) {
        console.log("   ⚠️ No orders created - SKIPPING inventory decrement");
        console.log("   Product quantity remains unchanged");
      } else {
        const currentProduct = await base44.entities.Product.filter({ id: activeGIVI.product_id });
        if (currentProduct.length > 0) {
          const newQuantity = Math.max(0, (currentProduct[0].quantity || 0) - ordersCreated);
          const newStatus = newQuantity === 0 ? "sold" : currentProduct[0].status;
          
          console.log("   Product:", currentProduct[0].title);
          console.log("   Previous Quantity:", currentProduct[0].quantity);
          console.log("   Winners/Orders:", ordersCreated);
          console.log("   New Quantity:", newQuantity);
          console.log("   New Status:", newStatus);
          
          await base44.entities.Product.update(activeGIVI.product_id, {
            quantity: newQuantity,
            status: newStatus
          });
          
          console.log("   ✅ Product quantity decremented");
        }
      }
      console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

      // DEBUG LOG: Winner selection complete
      await base44.entities.GIVIDebugLog.create({
        givi_event_id: activeGIVI.id,
        seller_id: seller.id,
        show_id: show.id,
        action: "winner_selected",
        status: "success",
        metadata: {
          total_entries: entries.length,
          valid_entries: validEntries.length,
          winners_selected: winners.length,
          orders_created: ordersCreated,
          orders_skipped_duplicate: ordersDuplicate,
          winner_names: winners.map(w => w.user_name),
          winner_ids: winners.map(w => w.user_id),
          winner_emails: winners.map(w => w.user_email),
          product_quantity_decremented: ordersCreated,
          timestamp: new Date().toISOString()
        }
      });

      console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
      console.log("🎉 WINNER SELECTION COMPLETE");
      console.log("   Winners Selected:", winners.length);
      console.log("   Orders Created:", ordersCreated);
      console.log("   Duplicates Prevented:", ordersDuplicate);
      console.log("   Product Quantity Decremented: YES");
      console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
      
      // CRITICAL: Auto-close GIVI after 5 seconds to prevent stuck state
      console.log("⏰ Setting auto-close timer for 5 seconds...");
      setTimeout(async () => {
        try {
          const currentState = await base44.entities.GIVIEvent.filter({ id: activeGIVI.id });
          if (currentState[0] && currentState[0].status === "result") {
            console.log("🔄 Auto-closing GIVI after result phase");
            await base44.entities.GIVIEvent.update(activeGIVI.id, {
              status: "closed"
            });
            queryClient.invalidateQueries({ queryKey: ['active-givi'] });
            queryClient.invalidateQueries({ queryKey: ['viewer-active-givi'] });
            console.log("✅ GIVI auto-closed successfully");
          }
        } catch (error) {
          console.error("❌ Failed to auto-close GIVI:", error);
        }
      }, 5000);
      
      return winners;
    },
    onSuccess: () => {
      // CRITICAL: Reset flag on success
      setWinnerSelectionInProgress(false);
      
      // Invalidate all relevant queries to show updated data
      queryClient.invalidateQueries({ queryKey: ['active-givi'] });
      queryClient.invalidateQueries({ queryKey: ['givi-entries'] });
      queryClient.invalidateQueries({ queryKey: ['seller-orders'] });
      queryClient.invalidateQueries({ queryKey: ['buyer-orders'] });
      queryClient.invalidateQueries({ queryKey: ['buyer-batches'] });
      queryClient.invalidateQueries({ queryKey: ['buyer-all-orders'] });
      queryClient.invalidateQueries({ queryKey: ['show-products'] });
      queryClient.invalidateQueries({ queryKey: ['givi-products'] });
    },
    onError: async (error) => {
      console.error("❌ Winner selection failed:", error);
      
      // CRITICAL: Reset flag on error
      setWinnerSelectionInProgress(false);
      
      // CRITICAL: Don't show error popup if it's just an idempotency check
      if (error.message.includes("Winners already selected") || 
          error.message.includes("already in progress")) {
        console.log("✅ Idempotency check prevented duplicate - no user notification needed");
        queryClient.invalidateQueries({ queryKey: ['active-givi'] });
        return;
      }
      
      // CRITICAL: Handle rate limit errors gracefully - retry once after 2 seconds
      if (error.message.includes("Rate limit") || error.message.includes("rate limit") || error.message.includes("429")) {
        console.warn("⚠️ Rate limit detected - scheduling single retry in 2 seconds");
        
        setTimeout(() => {
          console.log("🔄 Retrying winner selection after rate limit...");
          selectWinnersMutation.mutate();
        }, 2000);
        
        return; // Don't show error or close GIVI - let retry handle it
      }
      
      // CRITICAL: Close the GIVI event to prevent stuck state
      if (activeGIVI?.id) {
        try {
          console.log("🔄 Closing GIVI due to error...");
          await base44.entities.GIVIEvent.update(activeGIVI.id, {
            status: "closed",
            end_time: new Date().toISOString()
          });
          
          // Log error to debug table
          await base44.entities.GIVIDebugLog.create({
            givi_event_id: activeGIVI.id,
            seller_id: seller?.id,
            show_id: show?.id,
            action: "winner_selection_failed",
            status: "error",
            error_message: error.message,
            metadata: {
              error_stack: error.stack,
              total_entries: entries.length,
              timestamp: new Date().toISOString()
            }
          });
          
          queryClient.invalidateQueries({ queryKey: ['active-givi'] });
          console.log("✅ GIVI closed successfully after error");
        } catch (closeError) {
          console.error("❌ Failed to close GIVI after error:", closeError);
        }
      }
      
      alert(`Failed to select winners: ${error.message}\n\nThe GIVI has been closed. You can start a new one.`);
    }
  });

  // Timer countdown with idempotency protection and failsafe cleanup
  useEffect(() => {
    if (activeGIVI && activeGIVI.status === "active" && activeGIVI.end_time) {
      const interval = setInterval(() => {
        const now = new Date().getTime();
        const end = new Date(activeGIVI.end_time).getTime();
        const remaining = Math.max(0, Math.floor((end - now) / 1000));
        
        setTimeRemaining(remaining);

        // CRITICAL: Auto-clear GIVIs with zero entries
        if (remaining === 0 && 
            activeGIVI.status === "active" &&
            entries.length === 0 &&
            winnerSelectionTriggeredRef.current !== activeGIVI.id) {
          console.log("⏰ Timer expired - No entries, auto-closing GIVI");
          winnerSelectionTriggeredRef.current = activeGIVI.id;
          base44.entities.GIVIEvent.update(activeGIVI.id, {
            status: "closed",
            end_time: new Date().toISOString()
          }).then(() => {
            queryClient.invalidateQueries({ queryKey: ['active-givi'] });
            queryClient.invalidateQueries({ queryKey: ['viewer-active-givi'] });
          });
        }
        // CRITICAL: Enhanced idempotency - check ALL conditions before auto-selecting
        // PLUS: Check if we've already triggered selection for THIS specific GIVI
        else if (remaining === 0 && 
            activeGIVI.auto_winner_select && 
            activeGIVI.status === "active" &&
            entries.length > 0 &&
            (!activeGIVI.winner_ids || activeGIVI.winner_ids.length === 0) &&
            !winnerSelectionInProgress &&
            !selectWinnersMutation.isPending &&
            winnerSelectionTriggeredRef.current !== activeGIVI.id) {
          console.log("⏰ Timer expired - Auto-selecting winners (ONCE per GIVI)");
          winnerSelectionTriggeredRef.current = activeGIVI.id; // Mark as triggered
          selectWinnersMutation.mutate();
        }
        
        // CRITICAL FAILSAFE: If timer has been at 0 for more than 2 minutes, force close
        if (remaining === 0 && (now - end) > 120000) { // 2 min past end
          console.warn("🚨 GIVI stuck at 0:00 for 2+ minutes - force closing");
          base44.entities.GIVIEvent.update(activeGIVI.id, {
            status: "closed",
            end_time: new Date().toISOString()
          }).then(() => {
            queryClient.invalidateQueries({ queryKey: ['active-givi'] });
          });
        }
      }, 1000);

      return () => clearInterval(interval);
    } else {
      setTimeRemaining(null);
    }
  }, [activeGIVI, selectWinnersMutation, queryClient, winnerSelectionInProgress]);

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };
  
  // CRITICAL: If formOnly mode, render JUST the form (no buttons, no container)
  if (formOnly) {
    return (
      <div className="space-y-4">
        <div>
          <Label>Select GIVI Product</Label>
          <Select value={selectedProduct} onValueChange={setSelectedProduct}>
            <SelectTrigger>
              <SelectValue placeholder="Choose a product" />
            </SelectTrigger>
            <SelectContent className="z-[1100]">
              {giviProducts.map((product) => {
                const hasStock = product.quantity > 0;
                return (
                  <SelectItem 
                    key={product.id} 
                    value={product.id}
                    disabled={!hasStock}
                  >
                    {product.title} (Qty: {product.quantity}) {!hasStock && "❌ OUT OF STOCK"}
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
          {selectedProduct && giviProducts.find(p => p.id === selectedProduct)?.quantity === 0 && (
            <Alert className="mt-2 bg-red-50 border-red-200">
              <AlertDescription className="text-red-800 text-xs">
                ⚠️ This product has 0 quantity. Add inventory before starting GIVI.
              </AlertDescription>
            </Alert>
          )}
        </div>

        <div>
          <Label>Duration</Label>
          <Select value={duration} onValueChange={setDuration}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="z-[1100]">
              <SelectItem value="120">2 minutes</SelectItem>
              <SelectItem value="300">5 minutes</SelectItem>
              <SelectItem value="600">10 minutes</SelectItem>
              <SelectItem value="900">15 minutes</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label>Number of Winners</Label>
          <Input
            type="number"
            min="1"
            max="10"
            value={numberOfWinners}
            onChange={(e) => setNumberOfWinners(e.target.value)}
          />
        </div>

        <Alert>
          <ShoppingBag className="w-4 h-4" />
          <AlertDescription className="text-xs">
            Winners will receive a $0.00 order in Manage Orders for pickup tracking.
          </AlertDescription>
        </Alert>

        <Button
          onClick={() => createGIVIMutation.mutate()}
          disabled={!selectedProduct || createGIVIMutation.isPending}
          className="w-full bg-gradient-to-r from-purple-600 to-blue-600"
        >
          <Play className="w-4 h-4 mr-2" />
          {createGIVIMutation.isPending ? "Starting..." : "Start GIVI"}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* GIVI Control Console - Always visible */}
      <Card className="border-2 border-purple-200 bg-gradient-to-br from-purple-50 to-blue-50">
        <CardHeader className="p-3 sm:p-6">
          <div className="flex items-center justify-between mb-3">
            <div className="text-xs sm:text-sm font-semibold text-gray-700">GIVI Control Console</div>
            {onAddNewGivi && (
              <Button
                size="sm"
                onClick={onAddNewGivi}
                className="bg-green-600 hover:bg-green-700 text-white px-3 py-1 h-auto text-xs"
              >
                <Plus className="w-3 h-3 mr-1" />
                ADD
              </Button>
            )}
          </div>

          {/* No Active GIVI State */}
          {!activeGIVI && (
            <div className="text-center py-8">
              <Sparkles className="w-12 h-12 text-purple-300 mx-auto mb-4" />
              <p className="text-gray-600 mb-2 text-sm">No active GIVI event</p>
              <p className="text-gray-400 text-xs mb-4">Create a new GIVI to get started</p>
              {onAddNewGivi ? (
                <Button
                  onClick={onAddNewGivi}
                  className="bg-gradient-to-r from-purple-600 to-blue-600"
                  disabled={giviProducts.length === 0}
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Create GIVI Event
                </Button>
              ) : (
                <Button
                  onClick={() => setShowCreateDialog(true)}
                  className="bg-gradient-to-r from-purple-600 to-blue-600"
                  disabled={giviProducts.length === 0}
                >
                  <Sparkles className="w-4 h-4 mr-2" />
                  <span>Create GIVI Event</span>
                </Button>
              )}
            </div>
          )}

          {/* Active GIVI Display */}
          {activeGIVI && (
            <>
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <CardTitle className="flex items-center gap-2 mb-2 text-sm sm:text-base">
                    <Badge className={`${
                      activeGIVI.status === "active" ? "bg-green-500 animate-pulse" :
                      activeGIVI.status === "paused" ? "bg-yellow-500" :
                      "bg-gray-500"
                    } text-white border-0 text-xs`}>
                      {activeGIVI.status.toUpperCase()}
                    </Badge>
                    {activeGIVI.product_title || "GIVI Product"}
                  </CardTitle>
                  {activeGIVI.product_image_url && (
                    <img
                      src={activeGIVI.product_image_url}
                      alt={activeGIVI.product_title || "GIVI Product"}
                      className="w-20 h-20 sm:w-32 sm:h-32 object-cover rounded-lg mt-2"
                    />
                  )}
                </div>
              </div>
            </>
          )}
        </CardHeader>
        <CardContent className="space-y-3 sm:space-y-4 p-3 sm:p-6 pt-0">
          {activeGIVI && (
            <>
            {/* Stats Grid */}
            <div className="grid grid-cols-3 gap-2 sm:gap-4">
              <div className="text-center p-2 sm:p-4 bg-white rounded-lg shadow">
                <Users className="w-4 h-4 sm:w-6 sm:h-6 text-blue-600 mx-auto mb-1" />
                <p className="text-sm sm:text-2xl font-bold text-gray-900">{entries.length}</p>
                <p className="text-[10px] sm:text-xs text-gray-600">Entries</p>
              </div>
              <div className="text-center p-2 sm:p-4 bg-white rounded-lg shadow">
                <Trophy className="w-4 h-4 sm:w-6 sm:h-6 text-yellow-600 mx-auto mb-1" />
                <p className="text-sm sm:text-2xl font-bold text-gray-900">{activeGIVI.number_of_winners}</p>
                <p className="text-[10px] sm:text-xs text-gray-600">Winners</p>
              </div>
              <div className="text-center p-2 sm:p-4 bg-white rounded-lg shadow">
                <Clock className="w-4 h-4 sm:w-6 sm:h-6 text-purple-600 mx-auto mb-1" />
                <p className="text-sm sm:text-2xl font-bold text-gray-900">
                  {timeRemaining !== null ? formatTime(timeRemaining) : "--:--"}
                </p>
                <p className="text-[10px] sm:text-xs text-gray-600">Time Left</p>
              </div>
            </div>

            {/* New Followers */}
            {activeGIVI.new_followers_count > 0 && (
              <Alert className="bg-green-50 border-green-200">
                <AlertDescription>
                  🎉 {activeGIVI.new_followers_count} new follower{activeGIVI.new_followers_count !== 1 ? 's' : ''} from this GIVI!
                </AlertDescription>
              </Alert>
            )}

            {/* Winners Display */}
            {activeGIVI.status === "result" && activeGIVI.winner_names && (
              <Alert className="bg-yellow-50 border-yellow-200">
                <Trophy className="w-4 h-4 text-yellow-600" />
                <AlertDescription>
                  <strong>Winner{activeGIVI.winner_names.length > 1 ? 's' : ''}:</strong>{" "}
                  {activeGIVI.winner_names.join(", ")}
                  <br />
                  <span className="text-xs text-gray-600 mt-1 block">
                    ✅ $0.00 orders created and added to Manage Orders
                  </span>
                </AlertDescription>
              </Alert>
            )}

            {/* Control Buttons */}
            <div className="flex gap-2 flex-wrap">
              {activeGIVI.status === "active" && (
                <>
                  <Button
                    variant="outline"
                    onClick={() => pauseGIVIMutation.mutate()}
                    disabled={pauseGIVIMutation.isPending}
                    className="text-xs sm:text-sm"
                  >
                    <Pause className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2" />
                    Pause
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => endGIVIMutation.mutate()}
                    disabled={endGIVIMutation.isPending}
                    className="text-xs sm:text-sm"
                  >
                    <StopCircle className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2" />
                    End Now
                  </Button>
                </>
              )}
              
              {activeGIVI.status === "paused" && (
                <Button
                  onClick={() => resumeGIVIMutation.mutate()}
                  disabled={resumeGIVIMutation.isPending}
                  className="bg-green-600 text-xs sm:text-sm"
                >
                  <Play className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2" />
                  Resume
                </Button>
              )}

              {(activeGIVI.status === "closed" || activeGIVI.status === "paused") && (
                <Button
                  onClick={() => selectWinnersMutation.mutate()}
                  disabled={
                    selectWinnersMutation.isPending || 
                    winnerSelectionInProgress ||
                    entries.length === 0 ||
                    (activeGIVI.winner_ids && activeGIVI.winner_ids.length > 0) ||
                    activeGIVI.status === "result"
                  }
                  className="bg-gradient-to-r from-yellow-500 to-orange-500 text-xs sm:text-sm"
                >
                  <Trophy className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2" />
                  {selectWinnersMutation.isPending || winnerSelectionInProgress ? "Selecting..." : `Select Winner${activeGIVI.number_of_winners > 1 ? 's' : ''}`}
                </Button>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>

    {/* No GIVI Products Warning */}
    {giviProducts.length === 0 && (
      <Alert className="sm:block hidden">
        <AlertDescription>
          No GIVI products found. Mark products as "GIVEY" in your product inventory to enable giveaways.
        </AlertDescription>
      </Alert>
    )}

      {/* Create GIVI Dialog - Hidden when using external drawer */}
      <Dialog open={showCreateDialog && !externalDrawerOpen} onOpenChange={setShowCreateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New GIVI Event</DialogTitle>
            <DialogDescription>
              Set up a giveaway for your viewers. The button will appear for all viewers when you start.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Select GIVI Product</Label>
              <Select value={selectedProduct} onValueChange={setSelectedProduct}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose a product" />
                </SelectTrigger>
                <SelectContent>
                  {giviProducts.map((product) => {
                    const hasStock = product.quantity > 0;
                    return (
                      <SelectItem 
                        key={product.id} 
                        value={product.id}
                        disabled={!hasStock}
                      >
                        {product.title} (Qty: {product.quantity}) {!hasStock && "❌ OUT OF STOCK"}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
              {selectedProduct && giviProducts.find(p => p.id === selectedProduct)?.quantity === 0 && (
                <Alert className="mt-2 bg-red-50 border-red-200">
                  <AlertDescription className="text-red-800 text-xs">
                    ⚠️ This product has 0 quantity. Add inventory before starting GIVI.
                  </AlertDescription>
                </Alert>
              )}
            </div>

            <div>
              <Label>Duration</Label>
              <Select value={duration} onValueChange={setDuration}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="120">2 minutes</SelectItem>
                  <SelectItem value="300">5 minutes</SelectItem>
                  <SelectItem value="600">10 minutes</SelectItem>
                  <SelectItem value="900">15 minutes</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Number of Winners</Label>
              <Input
                type="number"
                min="1"
                max="10"
                value={numberOfWinners}
                onChange={(e) => setNumberOfWinners(e.target.value)}
              />
            </div>

            <Alert>
              <ShoppingBag className="w-4 h-4" />
              <AlertDescription className="text-xs">
                Winners will receive a $0.00 order in Manage Orders for pickup tracking.
              </AlertDescription>
            </Alert>

            <Button
              onClick={() => createGIVIMutation.mutate()}
              disabled={!selectedProduct || createGIVIMutation.isPending}
              className="w-full bg-gradient-to-r from-purple-600 to-blue-600"
            >
              <Play className="w-4 h-4 mr-2" />
              {createGIVIMutation.isPending ? "Starting..." : "Start GIVI"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}