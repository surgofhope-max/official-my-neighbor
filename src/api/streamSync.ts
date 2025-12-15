/**
 * Stream Sync API
 *
 * Provides frontend integration for synchronizing AWS IVS stream status.
 * This allows the application to reflect real-time streaming state.
 *
 * Usage:
 * - After seller presses "Go Live" to detect stream start
 * - Periodically while viewing a live show
 * - On admin dashboard to see all stream statuses
 */

import { supabase } from "@/lib/supabase/supabaseClient";

/**
 * Result of syncing a single show
 */
export interface SyncResult {
  showId: string;
  previousStatus: string | null;
  newStatus: string;
  changed: boolean;
  viewerCount?: number;
  error?: string;
}

/**
 * Summary of a batch sync operation
 */
export interface SyncSummary {
  total: number;
  changed: number;
  errors: number;
  live: number;
  offline: number;
}

/**
 * Response from the sync function
 */
export interface SyncResponse {
  success: boolean;
  summary: SyncSummary;
  results: SyncResult | SyncResult[];
}

/**
 * Sync stream status for a single show or all shows.
 *
 * This calls the server-side Edge Function which:
 * 1. Queries AWS IVS for current stream state
 * 2. Updates the Show record with live/offline status
 * 3. Returns the sync results
 *
 * @param showId - Optional show ID to sync (syncs all if not provided)
 * @returns Sync response or error
 *
 * Example (single show):
 * ```typescript
 * const { data, error } = await syncStreamStatus("show-uuid");
 *
 * if (data?.results?.newStatus === "live") {
 *   console.log("Stream is now live!");
 * }
 * ```
 *
 * Example (all shows):
 * ```typescript
 * const { data, error } = await syncStreamStatus();
 * console.log(`${data?.summary.live} shows currently live`);
 * ```
 */
export async function syncStreamStatus(
  showId?: string
): Promise<{ data: SyncResponse | null; error: string | null }> {
  try {
    const { data, error } = await supabase.functions.invoke(
      "sync-ivs-stream-status",
      {
        body: showId ? { showId } : {},
      }
    );

    if (error) {
      console.warn("Failed to sync stream status:", error.message);
      return { data: null, error: error.message };
    }

    if (data.error) {
      console.warn("Stream sync error:", data.error);
      return { data: null, error: data.error };
    }

    return { data: data as SyncResponse, error: null };
  } catch (err) {
    console.error("Unexpected error syncing stream status:", err);
    return { data: null, error: "Failed to sync stream status" };
  }
}

/**
 * Check if a show is currently live.
 *
 * This is a lightweight check that only reads from the database.
 * For real-time accuracy, use syncStreamStatus() first.
 *
 * @param showId - The show ID to check
 * @returns True if the show is currently streaming
 */
export async function isShowLive(showId: string): Promise<boolean> {
  if (!showId) {
    return false;
  }

  try {
    const { data, error } = await supabase
      .from("shows")
      .select("is_streaming, stream_status")
      .eq("id", showId)
      .single();

    if (error || !data) {
      return false;
    }

    return data.is_streaming === true || data.stream_status === "live";
  } catch {
    return false;
  }
}

/**
 * Wait for a show to go live with polling.
 *
 * This is useful after a seller starts streaming to detect when
 * the stream becomes available.
 *
 * @param showId - The show ID to watch
 * @param options - Polling options
 * @returns True when show goes live, false on timeout
 *
 * Example:
 * ```typescript
 * // Wait up to 60 seconds for stream to go live
 * const isLive = await waitForShowToGoLive("show-uuid", {
 *   timeout: 60000,
 *   pollInterval: 5000,
 *   onPoll: (attempt) => console.log(`Checking... attempt ${attempt}`),
 * });
 * ```
 */
export async function waitForShowToGoLive(
  showId: string,
  options: {
    timeout?: number;
    pollInterval?: number;
    onPoll?: (attempt: number) => void;
  } = {}
): Promise<boolean> {
  const { timeout = 60000, pollInterval = 5000, onPoll } = options;

  const startTime = Date.now();
  let attempt = 0;

  while (Date.now() - startTime < timeout) {
    attempt++;

    if (onPoll) {
      onPoll(attempt);
    }

    // Sync and check status
    const { data } = await syncStreamStatus(showId);

    if (data) {
      const result = data.results as SyncResult;
      if (result.newStatus === "live") {
        return true;
      }
    }

    // Wait before next poll
    await new Promise((resolve) => setTimeout(resolve, pollInterval));
  }

  return false;
}

/**
 * Create a stream status poller for a show.
 *
 * Returns start/stop functions for controlling the polling.
 *
 * @param showId - The show ID to poll
 * @param onStatusChange - Callback when status changes
 * @param options - Polling options
 *
 * Example:
 * ```typescript
 * const { start, stop, getStatus } = createStreamPoller(
 *   "show-uuid",
 *   (status, viewerCount) => {
 *     console.log(`Stream is ${status} with ${viewerCount} viewers`);
 *   },
 *   { interval: 10000 }
 * );
 *
 * // Start polling
 * start();
 *
 * // Stop when component unmounts
 * useEffect(() => stop, []);
 * ```
 */
export function createStreamPoller(
  showId: string,
  onStatusChange: (status: string, viewerCount?: number) => void,
  options: { interval?: number } = {}
): {
  start: () => void;
  stop: () => void;
  getStatus: () => string | null;
  poll: () => Promise<void>;
} {
  const { interval = 10000 } = options;

  let timer: number | null = null;
  let currentStatus: string | null = null;
  let isPolling = false;

  const poll = async () => {
    if (isPolling) return;
    isPolling = true;

    try {
      const { data } = await syncStreamStatus(showId);

      if (data) {
        const result = data.results as SyncResult;
        const newStatus = result.newStatus;

        if (newStatus !== currentStatus) {
          currentStatus = newStatus;
          onStatusChange(newStatus, result.viewerCount);
        } else if (result.viewerCount !== undefined) {
          // Status same but viewer count may have changed
          onStatusChange(newStatus, result.viewerCount);
        }
      }
    } catch (err) {
      console.warn("Stream polling error:", err);
    } finally {
      isPolling = false;
    }
  };

  const start = () => {
    if (timer !== null) return;

    // Poll immediately
    poll();

    // Then poll on interval
    timer = setInterval(poll, interval) as unknown as number;
  };

  const stop = () => {
    if (timer !== null) {
      clearInterval(timer);
      timer = null;
    }
  };

  const getStatus = () => currentStatus;

  return { start, stop, getStatus, poll };
}





