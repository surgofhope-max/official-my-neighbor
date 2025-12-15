import React, { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function BottomDrawer({ isOpen, onClose, title, children, height = '33.33vh' }) {
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen]);

  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop - Transparent, no blur/dim */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[60]"
            onClick={handleBackdropClick}
          />

          {/* Drawer */}
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ 
              type: "spring", 
              damping: 30, 
              stiffness: 300 
            }}
            drag="y"
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={0.2}
            onDragEnd={(e, info) => {
              if (info.offset.y > 100) {
                onClose();
              }
            }}
            className="fixed bottom-0 left-0 right-0 z-[70] bg-white rounded-t-3xl shadow-2xl"
            style={{ height, minHeight: '250px' }}
          >
            {/* Drag Handle */}
            <div className="absolute top-2 left-1/2 transform -translate-x-1/2 w-12 h-1.5 bg-gray-300 rounded-full" />

            {/* Header - Only render if title exists */}
            {title && (
              <div className="flex items-center justify-between px-4 pt-6 pb-3 border-b border-gray-200">
                <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={onClose}
                  className="h-8 w-8"
                >
                  <X className="h-5 w-5" />
                </Button>
              </div>
            )}

            {/* Content */}
            <div className="overflow-y-auto" style={{ height: title ? 'calc(100% - 70px)' : 'calc(100% - 20px)' }}>
              {children}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}