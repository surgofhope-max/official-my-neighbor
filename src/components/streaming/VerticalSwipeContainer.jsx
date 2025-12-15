import React, { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";

export default function VerticalSwipeContainer({ 
  shows, 
  currentIndex, 
  onIndexChange,
  renderCard 
}) {
  const [isDragging, setIsDragging] = useState(false);
  const [direction, setDirection] = useState(null);
  const containerRef = useRef(null);
  const startYRef = useRef(0);
  const lastYRef = useRef(0);
  const velocityRef = useRef(0);
  const lastTimeRef = useRef(0);

  // Axis locking - detect if gesture is vertical dominant
  const [isVerticalGesture, setIsVerticalGesture] = useState(false);
  const startXRef = useRef(0);

  const handleTouchStart = (e) => {
    // Don't intercept if touching interactive elements
    const target = e.target;
    const isInteractive = target.closest('button, input, textarea, a, [role="button"]');
    
    if (isInteractive) {
      return;
    }

    startYRef.current = e.touches[0].clientY;
    startXRef.current = e.touches[0].clientX;
    lastYRef.current = e.touches[0].clientY;
    lastTimeRef.current = Date.now();
    velocityRef.current = 0;
    setIsVerticalGesture(false);
    setIsDragging(false);
  };

  const handleTouchMove = (e) => {
    const currentY = e.touches[0].clientY;
    const currentX = e.touches[0].clientX;
    const deltaY = currentY - startYRef.current;
    const deltaX = currentX - startXRef.current;
    const currentTime = Date.now();
    const timeDelta = currentTime - lastTimeRef.current;

    // Axis locking - determine if vertical gesture
    if (!isVerticalGesture && (Math.abs(deltaY) > 10 || Math.abs(deltaX) > 10)) {
      if (Math.abs(deltaY) > Math.abs(deltaX) * 1.5) {
        setIsVerticalGesture(true);
      } else {
        // Horizontal gesture, ignore
        return;
      }
    }

    if (!isVerticalGesture) return;

    // Prevent default scrolling
    e.preventDefault();

    // Calculate velocity
    if (timeDelta > 0) {
      const yDelta = currentY - lastYRef.current;
      velocityRef.current = yDelta / timeDelta;
    }

    lastYRef.current = currentY;
    lastTimeRef.current = currentTime;

    // Only start dragging if moved enough
    if (Math.abs(deltaY) > 20) {
      setIsDragging(true);
    }
  };

  const handleTouchEnd = (e) => {
    if (!isVerticalGesture || !isDragging) {
      setIsDragging(false);
      setIsVerticalGesture(false);
      return;
    }

    const endY = lastYRef.current;
    const deltaY = endY - startYRef.current;
    const absDelta = Math.abs(deltaY);
    const velocity = Math.abs(velocityRef.current);

    // Threshold for switching: 80px or high velocity
    const shouldSwitch = absDelta > 80 || velocity > 0.5;

    if (shouldSwitch) {
      if (deltaY < 0) {
        // Swiped UP - go to next show
        if (currentIndex < shows.length - 1) {
          setDirection('up');
          onIndexChange(currentIndex + 1);
        }
      } else {
        // Swiped DOWN - go to previous show
        if (currentIndex > 0) {
          setDirection('down');
          onIndexChange(currentIndex - 1);
        }
      }
    }

    setIsDragging(false);
    setIsVerticalGesture(false);
  };

  // Prevent page scroll
  useEffect(() => {
    const preventScroll = (e) => {
      if (isVerticalGesture) {
        e.preventDefault();
      }
    };

    document.addEventListener('touchmove', preventScroll, { passive: false });
    return () => document.removeEventListener('touchmove', preventScroll);
  }, [isVerticalGesture]);

  const currentShow = shows[currentIndex];
  const prevShow = currentIndex > 0 ? shows[currentIndex - 1] : null;
  const nextShow = currentIndex < shows.length - 1 ? shows[currentIndex + 1] : null;

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 overflow-hidden"
      style={{ touchAction: 'none' }}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      <AnimatePresence mode="wait">
        <motion.div
          key={currentIndex}
          initial={{ 
            y: direction === 'up' ? '100%' : direction === 'down' ? '-100%' : 0,
            opacity: direction ? 0 : 1
          }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ 
            y: direction === 'up' ? '-100%' : '100%',
            opacity: 0
          }}
          transition={{ 
            duration: 0.25,
            ease: [0.25, 0.1, 0.25, 1]
          }}
          className="absolute inset-0"
        >
          {renderCard(currentShow, currentIndex)}
        </motion.div>
      </AnimatePresence>

      {/* Debug info - remove in production */}
      {process.env.NODE_ENV === 'development' && (
        <div className="absolute top-20 right-4 bg-black/70 text-white text-xs p-2 rounded z-[9999] pointer-events-none">
          <div>Show: {currentIndex + 1}/{shows.length}</div>
          <div>Vertical: {isVerticalGesture ? '✅' : '❌'}</div>
          <div>Dragging: {isDragging ? '✅' : '❌'}</div>
        </div>
      )}
    </div>
  );
}