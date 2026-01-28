import React, { useState, useRef, useEffect } from "react";
import { useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Send, Loader2 } from "lucide-react";

export default function MessageInput({ onSend, disabled, placeholder = "Type a message..." }) {
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const textareaRef = useRef(null);

  // LiveShow isolation: prevent DM input from mounting on LiveShow page
  const location = useLocation();
  const isLiveShow =
    location.pathname.toLowerCase().includes("liveshow") ||
    location.search.toLowerCase().includes("showid");

  useEffect(() => {
    // Auto-resize textarea (skip if LiveShow isolation active)
    if (isLiveShow) return;
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 120) + "px";
    }
  }, [message, isLiveShow]);

  if (isLiveShow) {
    return null;
  }

  const handleSend = async () => {
    if (!message.trim() || sending) return;

    setSending(true);
    try {
      await onSend(message.trim());
      setMessage("");
      if (textareaRef.current) {
        textareaRef.current.style.height = "auto";
      }
    } catch (error) {
      console.error("Error sending message:", error);
    }
    setSending(false);
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="p-3 sm:p-4 bg-white">
      <div className="flex gap-2 items-end max-w-4xl mx-auto">
        <Textarea
          ref={textareaRef}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled || sending}
          className="resize-none min-h-[44px] max-h-[120px] flex-1 text-base"
          rows={1}
          style={{
            fontSize: '16px', // Prevents zoom on iOS
            WebkitAppearance: 'none'
          }}
        />
        <Button
          onClick={handleSend}
          disabled={!message.trim() || disabled || sending}
          className="bg-purple-600 hover:bg-purple-700 flex-shrink-0 h-11 w-11"
          size="icon"
        >
          {sending ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            <Send className="w-5 h-5" />
          )}
        </Button>
      </div>
      <p className="text-xs text-gray-500 mt-1.5 px-1 max-w-4xl mx-auto">
        Press Enter to send • Shift+Enter for new line
      </p>
    </div>
  );
}