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
        <div className="fixed inset-x-0 z-[9999] pointer-events-none flex justify-center items-start" style={{ top: '15vh' }}>
          <motion.div
            initial={{ opacity: 0, y: -50, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -50, scale: 0.9 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
            className="w-[75vw] max-w-[340px] min-w-[260px]"
          >
            <div className="bg-gradient-to-r from-yellow-400 via-orange-500 to-red-500 rounded-xl shadow-2xl px-4 py-3 sm:px-6 sm:py-4">
            {/* Confetti Animation */}
            <div className="absolute inset-0 overflow-hidden rounded-2xl">
              {[...Array(20)].map((_, i) => (
                <motion.div
                  key={i}
                  initial={{ 
                    y: -20, 
                    x: Math.random() * 100 + '%',
                    rotate: Math.random() * 360,
                    opacity: 1
                  }}
                  animate={{ 
                    y: '120%',
                    rotate: Math.random() * 720,
                    opacity: 0
                  }}
                  transition={{ 
                    duration: 1.5,
                    ease: "easeOut"
                  }}
                  className="absolute text-base md:text-xl"
                >
                  {i % 3 === 0 ? '🎉' : i % 3 === 1 ? '✨' : '🎊'}
                </motion.div>
              ))}
            </div>

            {/* Content */}
            <div className="relative z-10 text-center space-y-2 md:space-y-3">
              <motion.div
                animate={{ 
                  rotate: [0, 10, -10, 10, 0],
                  scale: [1, 1.1, 1]
                }}
                transition={{ 
                  duration: 0.5,
                  repeat: 1
                }}
              >
                <Trophy className="w-8 h-8 md:w-12 md:h-12 text-white mx-auto drop-shadow-lg" />
              </motion.div>

              <div>
                <p className="text-base sm:text-xl md:text-2xl font-black text-white drop-shadow-lg mb-1">
                  🎉 WINNER! 🎉
                </p>
                <p className="text-lg sm:text-2xl md:text-3xl font-black text-white drop-shadow-lg break-words">
                  {winnerName || "Winner"}
                </p>
              </div>

              <div className="flex items-center justify-center gap-1.5 sm:gap-2">
                <Sparkles className="w-3 h-3 sm:w-4 sm:h-4 text-yellow-200" />
                <p className="text-[10px] sm:text-xs md:text-sm font-bold text-yellow-100 tracking-wide uppercase">
                  Congratulations!
                </p>
                <Sparkles className="w-3 h-3 sm:w-4 sm:h-4 text-yellow-200" />
              </div>
            </div>
          </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}