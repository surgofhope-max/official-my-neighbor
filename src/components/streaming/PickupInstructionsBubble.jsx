import React, { useState, useEffect } from "react";
import { MapPin, X as CloseIcon } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

export default function PickupInstructionsBubble({ pickupInstructions, isIOS }) {
  const [isExpanded, setIsExpanded] = useState(false);

  useEffect(() => {
    console.log("🗺️ PickupInstructionsBubble mounted");
    console.log("   Pickup Instructions:", pickupInstructions);
  }, [pickupInstructions]);

  const handleBubbleClick = () => {
    console.log("🔵 Bubble clicked - expanding");
    setIsExpanded(true);
  };

  const handleClose = () => {
    console.log("🔴 Close clicked - collapsing");
    setIsExpanded(false);
  };

  if (!pickupInstructions || !pickupInstructions.trim()) {
    console.log("⚠️ No pickup instructions - component hidden");
    return null;
  }

  return (
    <div className="pointer-events-none fixed inset-0 z-[150]">
      <AnimatePresence>
        {!isExpanded && (
          <motion.button
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={handleBubbleClick}
            onTouchEnd={(e) => {
              e.preventDefault();
              handleBubbleClick();
            }}
            className="pointer-events-auto fixed left-4 w-7 h-7 bg-gradient-to-br from-green-500 to-emerald-600 rounded-full flex items-center justify-center active:scale-95 transition-transform cursor-pointer"
            style={{
              top: isIOS ? "calc(env(safe-area-inset-top) + 48px)" : "4rem",
              WebkitTapHighlightColor: 'transparent',
              boxShadow: '0 0 20px 4px rgba(34, 197, 94, 0.8), 0 0 40px 8px rgba(34, 197, 94, 0.4), 0 0 60px 12px rgba(34, 197, 94, 0.2)'
            }}
          >
            <MapPin className="w-3 h-3 text-white pointer-events-none" />
          </motion.button>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ x: -300, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: -300, opacity: 0 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
            className="pointer-events-auto fixed left-4 w-80 max-w-[calc(100vw-2rem)]"
            style={{
              top: isIOS ? "calc(env(safe-area-inset-top) + 48px)" : "4rem"
            }}
          >
            <div className="bg-white rounded-xl shadow-2xl border-2 border-green-500 overflow-hidden">
              {/* Header */}
              <div className="bg-gradient-to-r from-green-500 to-emerald-600 p-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <MapPin className="w-5 h-5 text-white" />
                  <h3 className="text-white font-bold text-base">Pickup Instructions</h3>
                </div>
                <button
                  onClick={handleClose}
                  onTouchEnd={(e) => {
                    e.preventDefault();
                    handleClose();
                  }}
                  className="text-white hover:bg-white/20 active:bg-white/30 rounded-full p-1 transition-colors cursor-pointer"
                  style={{ WebkitTapHighlightColor: 'transparent' }}
                >
                  <CloseIcon className="w-5 h-5" />
                </button>
              </div>

              {/* Content */}
              <div className="p-4 max-h-[50vh] overflow-y-auto">
                <p className="text-gray-700 text-sm leading-relaxed whitespace-pre-wrap">
                  {pickupInstructions}
                </p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}