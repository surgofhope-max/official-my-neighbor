# GIVEY EVIDENCE EXTRACTION
## Exact Code Blocks for 6 Critical Findings

---

## SECTION 1 — Old winner banner during new givey

### 1a. Realtime handles status === "active" (LiveShow.jsx)

```javascript
  useEffect(() => {
    setGiveyEntryStatus(null);
  }, [activeGivey?.id]);

  useEffect(() => {
    if (!show?.id) return;

    const channel = supabase
      .channel("buyer-givey-" + show.id)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "givey_events",
          filter: `show_id=eq.${show.id}`,
        },
        (payload) => {
          giveyLastPayloadAtRef.current = Date.now();
          console.log("BUYER GIVEY REALTIME PAYLOAD:", payload);
          if (!payload.new) return;
          const status = payload.new.status;
          if (status === "active") {
            setActiveGivey(payload.new);
          } else if (status === "winner_selected") {
            setActiveGivey(null);
            setLatestGivey(payload.new);
            setWinnerDisplayName(payload.new.winner_name ?? "Winner");
          } else if (status === "expired") {
            setActiveGivey(null);
            setLatestGivey(payload.new);
          }
        }
      )
      .subscribe((status) => {
        giveyChannelStatusRef.current = status;
        console.log("📡 BUYER GIVEY CHANNEL STATUS:", show.id, status);
        if (status === "SUBSCRIBED") {
          syncActiveGiveyFromDb();
          syncLatestGiveyFromDb();
        }
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          console.warn("⚠️ BUYER GIVEY REALTIME NOT ACTIVE:", status);
          syncLatestGiveyFromDb();
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [show?.id, syncActiveGiveyFromDb, syncLatestGiveyFromDb]);
```

### 1b. Realtime handles status === "winner_selected" (LiveShow.jsx)

Same block as 1a — see lines 429-432:

```javascript
          } else if (status === "winner_selected") {
            setActiveGivey(null);
            setLatestGivey(payload.new);
            setWinnerDisplayName(payload.new.winner_name ?? "Winner");
```

### 1c. WinnerBanner is rendered (LiveShow.jsx)

```javascript
  const filteredProducts = allShowProducts.filter(p => {
    const searchLower = buyerSearchTerm.trim().toLowerCase();
    if (!searchLower) return true;

    const isNumeric = /^\d+$/.test(searchLower);

    if (isNumeric) {
      const boxNumber = p.box_number?.toString() || "";
      return boxNumber.includes(searchLower);
    }

    const title = p.title?.toLowerCase() || "";
    const description = p.description?.toLowerCase() || "";

    return (
      title.includes(searchLower) ||
      description.includes(searchLower)
    );
  });

  if (isLoadingAuth) return authLoadingUI;

  const WinnerBanner =
    latestGivey?.status === "winner_selected" && winnerDisplayName && (
      <div className="fixed top-24 left-1/2 -translate-x-1/2 z-[9999] bg-green-600 text-white px-6 py-3 rounded-xl shadow-lg">
        Winner: {winnerDisplayName}
      </div>
    );

  const GiveyEntryBanner = activeGivey && (
    <div
      style={{
        position: "absolute",
        top: "20px",
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 50,
        width: "90%",
        maxWidth: "28rem",
      }}
    >
```

---

## SECTION 2 — 8-second stale threshold

### 2a. HostConsole.jsx

```javascript
  // Sync lifecycle ref from activeGivey (handles syncActiveGiveyFromDb on load; never clears ref)
  useEffect(() => {
    if (activeGivey?.id && activeGivey?.ends_at) {
      giveyLifecycleRef.current = { id: activeGivey.id, endsAt: activeGivey.ends_at };
    }
  }, [activeGivey?.id, activeGivey?.ends_at]);

  // TEMPORARY: Audit auth.uid() vs expected seller owner (remove after verification)
  useEffect(() => {
    if (!show?.id) return;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      console.log("🪪 HOSTCONSOLE AUTH USER:", user?.id);
      console.log("🪪 HOSTCONSOLE AUTH EMAIL:", user?.email ?? "(none)");
      console.log("🪪 EXPECTED SELLER OWNER USER_ID:", "c33adf0f-c4d2-4de9-89bd-f0552abfcf4c");
    })();
  }, [show?.id]);

  // Realtime subscription: sync from DB on givey_events UPDATE (DB-authoritative)
  useEffect(() => {
    console.log("🟡 GIVEY EFFECT EVALUATED. show?.id:", show?.id);

    if (!show?.id) {
      console.log("⛔ GIVEY EFFECT EXITED — show.id missing");
      return;
    }

    console.log("🟢 GIVEY EFFECT RUNNING — attaching channel for show:", show.id);

    const channelName = "givey-events-" + show.id;

    const channel = supabase
      .channel(channelName)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "givey_events",
          filter: `show_id=eq.${show.id}`,
        },
        (payload) => {
          giveyLastPayloadAtRef.current = Date.now();
          console.log("🔥 GIVEY REALTIME UPDATE RECEIVED:", payload);

          if (!payload.new) return;

          const status = payload.new.status;

          if (status === "active") {
            setActiveGivey(payload.new);
            giveyLifecycleRef.current = {
              id: payload.new?.id,
              endsAt: payload.new?.ends_at
            };
            console.log("[GIVEY LIFECYCLE START]", { id: payload.new?.id, endsAt: payload.new?.ends_at });
          }

          if (status === "winner_selected" || status === "expired") {
            setActiveGivey(null);
          }
        }
      )
      .subscribe((status) => {
        giveyChannelStatusRef.current = status;
        console.log("📡 GIVEY CHANNEL STATUS:", show.id, status);
      });

    return () => {
      console.log("🔴 GIVEY CHANNEL CLEANUP:", channelName);
      supabase.removeChannel(channel);
    };
  }, [show?.id, syncActiveGiveyFromDb]);

  useEffect(() => {
    if (!show?.id) return;

    const interval = setInterval(async () => {
      if (giveyChannelStatusRef.current !== "SUBSCRIBED") return;
      if (!activeGivey) return;
      if (Date.now() - giveyLastPayloadAtRef.current <= 8000) return;

      console.warn("[GIVEY] realtime stale >8s, reconciling from DB", {
        showId: show.id,
        lastPayloadMsAgo: Date.now() - giveyLastPayloadAtRef.current,
      });
      await syncActiveGiveyFromDb();
      giveyLastPayloadAtRef.current = Date.now();
    }, 2000);

    return () => clearInterval(interval);
  }, [show?.id, activeGivey, syncActiveGiveyFromDb]);
```

### 2b. LiveShow.jsx

```javascript
    return () => {
      supabase.removeChannel(channel);
    };
  }, [show?.id, syncActiveGiveyFromDb, syncLatestGiveyFromDb]);

  useEffect(() => {
    if (!show?.id) return;

    const interval = setInterval(async () => {
      if (giveyChannelStatusRef.current !== "SUBSCRIBED") return;
      if (!activeGivey) return;
      if (Date.now() - giveyLastPayloadAtRef.current <= 8000) return;

      console.warn("[GIVEY] realtime stale >8s, reconciling from DB", {
        showId: show.id,
        lastPayloadMsAgo: Date.now() - giveyLastPayloadAtRef.current,
      });
      await syncActiveGiveyFromDb();
      await syncLatestGiveyFromDb();
      giveyLastPayloadAtRef.current = Date.now();
    }, 2000);

    return () => clearInterval(interval);
  }, [show?.id, activeGivey, syncActiveGiveyFromDb, syncLatestGiveyFromDb]);

  useEffect(() => {
    if (!activeGivey?.ends_at) {
      setGiveyTimeLeft(null);
      return;
    }

    const interval = setInterval(() => {
      const now = new Date().getTime();
      const end = new Date(activeGivey.ends_at).getTime();
      const diff = Math.max(0, end - now);
      setGiveyTimeLeft(diff);
    }, 1000);

    return () => clearInterval(interval);
  }, [activeGivey]);
```

---

## SECTION 3 — syncLatestGiveyFromDb

### Full function definition (LiveShow.jsx)

```javascript
    enabled: !!show?.seller_id && !!user?.id
  });

  const syncActiveGiveyFromDb = useCallback(async () => {
    if (!show?.id) return;

    const { data, error } = await supabase
      .from("givey_events")
      .select("*")
      .eq("show_id", show.id)
      .eq("status", "active")
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    console.log("BUYER GIVEY SYNC RESULT:", {
      showId: show?.id,
      givey: data
    });

    if (error) {
      console.warn("GIVEY BUYER SYNC ERROR:", error);
      setActiveGivey(null);
      return;
    }

    setActiveGivey(data ?? null);
  }, [show?.id]);

  const syncLatestGiveyFromDb = useCallback(async () => {
    if (!show?.id) return;

    const { data, error } = await supabase
      .from("givey_events")
      .select("*")
      .eq("show_id", show.id)
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.warn("LATEST GIVEY SYNC ERROR:", error);
      return;
    }

    setLatestGivey(data ?? null);

    if (data?.status === "winner_selected" && data?.winner_user_id) {
      const { data: userData } = await supabase
        .from("users")
        .select("display_name")
        .eq("id", data.winner_user_id)
        .maybeSingle();

      setWinnerDisplayName(userData?.display_name ?? "Winner");
    }
  }, [show?.id]);

  useEffect(() => {
    if (!show?.id) return;
    syncActiveGiveyFromDb();
    syncLatestGiveyFromDb();
  }, [show?.id, syncActiveGiveyFromDb, syncLatestGiveyFromDb]);
```

---

## SECTION 4 — Reconciliation exits when activeGivey is null

### 4a. HostConsole.jsx

```javascript
  }, [show?.id, syncActiveGiveyFromDb]);

  useEffect(() => {
    if (!show?.id) return;

    const interval = setInterval(async () => {
      if (giveyChannelStatusRef.current !== "SUBSCRIBED") return;
      if (!activeGivey) return;
      if (Date.now() - giveyLastPayloadAtRef.current <= 8000) return;

      console.warn("[GIVEY] realtime stale >8s, reconciling from DB", {
        showId: show.id,
        lastPayloadMsAgo: Date.now() - giveyLastPayloadAtRef.current,
      });
      await syncActiveGiveyFromDb();
      giveyLastPayloadAtRef.current = Date.now();
    }, 2000);

    return () => clearInterval(interval);
  }, [show?.id, activeGivey, syncActiveGiveyFromDb]);

  useEffect(() => {
    if (!show?.id) return;

    const interval = setInterval(async () => {
      if (!giveyLifecycleRef.current) return;

      const { id: giveyId, endsAt } = giveyLifecycleRef.current;
      if (!giveyId || !endsAt) return;

      const endTime = new Date(endsAt).getTime();
      const now = Date.now();

      if (now >= endTime) {
        console.log("[GIVEY FINALIZED BY HOST]", { giveyId });

        try {
          await supabase.rpc("finalize_givey_event", {
            p_givey_event_id: giveyId
          });
          giveyLifecycleRef.current = null;
        } catch (err) {
          console.error("[GIVEY] finalize_givey_event failed:", err);
        }
      }
    }, 500);

    console.log("[GIVEY WATCHER ACTIVE]", { showId: show?.id });
    return () => clearInterval(interval);
  }, [show?.id]);
```

### 4b. LiveShow.jsx

```javascript
  }, [show?.id, syncActiveGiveyFromDb, syncLatestGiveyFromDb]);

  useEffect(() => {
    if (!show?.id) return;

    const interval = setInterval(async () => {
      if (giveyChannelStatusRef.current !== "SUBSCRIBED") return;
      if (!activeGivey) return;
      if (Date.now() - giveyLastPayloadAtRef.current <= 8000) return;

      console.warn("[GIVEY] realtime stale >8s, reconciling from DB", {
        showId: show.id,
        lastPayloadMsAgo: Date.now() - giveyLastPayloadAtRef.current,
      });
      await syncActiveGiveyFromDb();
      await syncLatestGiveyFromDb();
      giveyLastPayloadAtRef.current = Date.now();
    }, 2000);

    return () => clearInterval(interval);
  }, [show?.id, activeGivey, syncActiveGiveyFromDb, syncLatestGiveyFromDb]);

  useEffect(() => {
    if (!activeGivey?.ends_at) {
      setGiveyTimeLeft(null);
      return;
    }

    const interval = setInterval(() => {
      const now = new Date().getTime();
      const end = new Date(activeGivey.ends_at).getTime();
      const diff = Math.max(0, end - now);
      setGiveyTimeLeft(diff);
    }, 1000);

    return () => clearInterval(interval);
  }, [activeGivey]);
```

---

## SECTION 5 — Winner banner has no auto-dismiss

### 5a. Givey WinnerBanner (LiveShow.jsx) — no auto-dismiss

State declarations:

```javascript
  const [showWinnerBanner, setShowWinnerBanner] = useState(false);
  const [showPurchaseBanner, setShowPurchaseBanner] = useState(false);
  const [__auditSalesCount, set__auditSalesCount] = useState(null);
  const [showProductOverlay, setShowProductOverlay] = useState(false);
  const [buyerSearchTerm, setBuyerSearchTerm] = useState("");
  const [activeGivey, setActiveGivey] = useState(null);
  const [enteringGivey, setEnteringGivey] = useState(false);
  const [enteredGivey, setEnteredGivey] = useState(false);
  const [giveyEntryStatus, setGiveyEntryStatus] = useState(null); // "entered" | "error" | null
  const [giveyTimeLeft, setGiveyTimeLeft] = useState(null);
  const [latestGivey, setLatestGivey] = useState(null);
  const [winnerDisplayName, setWinnerDisplayName] = useState(null);
```

WinnerBanner definition and render (no useEffect, no setTimeout for Givey winner):

```javascript
  const WinnerBanner =
    latestGivey?.status === "winner_selected" && winnerDisplayName && (
      <div className="fixed top-24 left-1/2 -translate-x-1/2 z-[9999] bg-green-600 text-white px-6 py-3 rounded-xl shadow-lg">
        Winner: {winnerDisplayName}
      </div>
    );
```

```javascript
      {WinnerBanner}
      {GiveyEntryBanner}
```

### 5b. GIVIWinnerBanner auto-dismiss (comparison)

```javascript
import React, { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Trophy, Sparkles } from "lucide-react";

export default function GIVIWinnerBanner({ show, winnerName, onDismiss }) {
  useEffect(() => {
    if (show) {
      // Auto-dismiss after 2 seconds
      const timer = setTimeout(() => {
        onDismiss();
      }, 2000);

      return () => clearTimeout(timer);
    }
  }, [show, onDismiss]);

  return (
    <AnimatePresence>
      {show && (
```

---

## SECTION 6 — HostConsole realtime UPDATE-only subscription

```javascript
  // Realtime subscription: sync from DB on givey_events UPDATE (DB-authoritative)
  useEffect(() => {
    console.log("🟡 GIVEY EFFECT EVALUATED. show?.id:", show?.id);

    if (!show?.id) {
      console.log("⛔ GIVEY EFFECT EXITED — show.id missing");
      return;
    }

    console.log("🟢 GIVEY EFFECT RUNNING — attaching channel for show:", show.id);

    const channelName = "givey-events-" + show.id;

    const channel = supabase
      .channel(channelName)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "givey_events",
          filter: `show_id=eq.${show.id}`,
        },
        (payload) => {
          giveyLastPayloadAtRef.current = Date.now();
          console.log("🔥 GIVEY REALTIME UPDATE RECEIVED:", payload);

          if (!payload.new) return;

          const status = payload.new.status;

          if (status === "active") {
            setActiveGivey(payload.new);
            giveyLifecycleRef.current = {
              id: payload.new?.id,
              endsAt: payload.new?.ends_at
            };
            console.log("[GIVEY LIFECYCLE START]", { id: payload.new?.id, endsAt: payload.new?.ends_at });
          }

          if (status === "winner_selected" || status === "expired") {
            setActiveGivey(null);
          }
        }
      )
      .subscribe((status) => {
        giveyChannelStatusRef.current = status;
        console.log("📡 GIVEY CHANNEL STATUS:", show.id, status);
      });

    return () => {
      console.log("🔴 GIVEY CHANNEL CLEANUP:", channelName);
      supabase.removeChannel(channel);
    };
  }, [show?.id, syncActiveGiveyFromDb]);
```
