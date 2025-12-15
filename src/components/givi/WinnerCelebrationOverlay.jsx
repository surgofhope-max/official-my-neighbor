import React, { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Trophy, Sparkles } from "lucide-react";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";

export default function WinnerCelebrationOverlay({ winners, onComplete }) {
  useEffect(() => {
    if (winners && winners.length > 0) {
      // Auto-dismiss after 2 seconds
      const timer = setTimeout(() => {
        onComplete();
      }, 2000);

      return () => clearTimeout(timer);
    }
  }, [winners, onComplete]);

  if (!winners || winners.length === 0) return null;

  // Show first winner if multiple
  const winner = winners[0];

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[9999] pointer-events-none flex items-center justify-center">
        {/* Confetti Background */}
        <div className="absolute inset-0 overflow-hidden">
          {[...Array(30)].map((_, i) => (
            <motion.div
              key={i}
              initial={{ 
                y: -100, 
                x: Math.random() * (typeof window !== 'undefined' ? window.innerWidth : 800),
                rotate: Math.random() * 360,
                opacity: 1
              }}
              animate={{ 
                y: (typeof window !== 'undefined' ? window.innerHeight : 600) + 100,
                rotate: Math.random() * 720,
                opacity: 0
              }}
              transition={{ 
                duration: 2,
                ease: "easeOut"
              }}
              className="absolute text-2xl"
            >
              {i % 5 === 0 ? '🎉' : i % 5 === 1 ? '✨' : i % 5 === 2 ? '🎊' : i % 5 === 3 ? '⭐' : '💫'}
            </motion.div>
          ))}
        </div>

        {/* Winner Card */}
        <motion.div
          initial={{ scale: 0, rotate: -180, opacity: 0 }}
          animate={{ scale: 1, rotate: 0, opacity: 1 }}
          exit={{ scale: 0, rotate: 180, opacity: 0 }}
          transition={{ 
            type: "spring",
            stiffness: 200,
            damping: 20
          }}
          className="relative bg-gradient-to-br from-yellow-400 via-orange-500 to-red-500 rounded-2xl shadow-2xl p-6 pointer-events-auto"
          style={{
            maxWidth: "280px"
          }}
        >
          {/* Shine effect */}
          <motion.div
            animate={{ 
              x: ["-100%", "200%"]
            }}
            transition={{ 
              duration: 1.5,
              ease: "easeInOut"
            }}
            className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent"
            style={{ 
              transform: "skewX(-20deg)"
            }}
          />

          <div className="relative z-10 text-center space-y-3">
            {/* Trophy Icon */}
            <motion.div
              animate={{ 
                rotate: [0, 10, -10, 10, 0],
                scale: [1, 1.1, 1]
              }}
              transition={{ 
                duration: 0.5,
                repeat: 2
              }}
            >
              <Trophy className="w-12 h-12 text-white mx-auto drop-shadow-lg" />
            </motion.div>

            {/* Winner Avatar */}
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.2 }}
            >
              <Avatar className="w-20 h-20 mx-auto border-4 border-white shadow-xl">
                <AvatarImage src={winner.profile_image_url} />
                <AvatarFallback className="bg-white text-orange-600 text-2xl font-bold">
                  {winner.user_name?.[0] || winner.winner_name?.[0] || "W"}
                </AvatarFallback>
              </Avatar>
            </motion.div>

            {/* Winner Name */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
            >
              <h2 className="text-2xl font-black text-white drop-shadow-lg">
                {winner.user_name || winner.winner_name || "Winner"}
              </h2>
            </motion.div>

            {/* Winner Label */}
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.4 }}
              className="flex items-center justify-center gap-2"
            >
              <Sparkles className="w-5 h-5 text-yellow-200" />
              <span className="text-lg font-bold text-yellow-100 tracking-wider uppercase">
                Winner!
              </span>
              <Sparkles className="w-5 h-5 text-yellow-200" />
            </motion.div>

            {/* Multiple Winners Badge */}
            {winners.length > 1 && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.5 }}
                className="text-sm text-white/80 font-medium"
              >
                +{winners.length - 1} more {winners.length - 1 === 1 ? 'winner' : 'winners'}!
              </motion.div>
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}