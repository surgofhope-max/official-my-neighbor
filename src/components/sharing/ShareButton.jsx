import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { 
  Share2, 
  Copy, 
  Facebook, 
  Twitter, 
  MessageCircle, 
  Mail, 
  Link as LinkIcon,
  CheckCircle,
  Instagram
} from "lucide-react";
import { supabaseApi as base44 } from "@/api/supabaseClient";
import { toast } from "sonner";

/**
 * Universal Share Button Component
 * Supports sharing Shows, Communities, and Seller Profiles
 * Integrates with GIVI tracking system
 */
export default function ShareButton({ 
  type, // "show" | "community" | "seller"
  id, // The ID of the content
  title, // Title to display in share messages
  description, // Optional description
  imageUrl, // Optional image for social sharing
  className,
  variant = "outline",
  size = "sm",
  showLabel = true
}) {
  const [showModal, setShowModal] = useState(false);
  const [copied, setCopied] = useState(false);
  const [user, setUser] = useState(null);

  // Load user on mount
  React.useEffect(() => {
    loadUser();
  }, []);

  const loadUser = async () => {
    try {
      const currentUser = await base44.auth.me();
      setUser(currentUser);
    } catch (error) {
      setUser(null);
    }
  };

  // Generate unique share URL with referral tracking
  const generateShareUrl = () => {
    const baseUrl = window.location.origin;
    let path = "";
    
    switch (type) {
      case "show":
        path = `/LiveShow?showId=${id}`;
        break;
      case "community":
        path = `/CommunityPage?community=${id}`;
        break;
      case "seller":
        path = `/SellerStorefront?sellerId=${id}`;
        break;
      default:
        path = `/`;
    }

    // Add referral tracking if user is logged in
    const params = new URLSearchParams();
    if (user) {
      params.set('ref', user.id);
      params.set('givi', `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`);
    }

    const queryString = params.toString();
    return `${baseUrl}${path}${queryString ? '?' + queryString : ''}`;
  };

  // Log share activity
  const logShare = async (platform) => {
    try {
      const shareUrl = generateShareUrl();
      
      await base44.entities.ShareLog.create({
        shared_type: type,
        shared_id: id,
        shared_by_user_id: user?.id || null,
        shared_to_platform: platform,
        share_url: shareUrl,
        referrer_url: window.location.href,
        referral_id: user?.id || null,
        givi_entry_id: user ? `${Date.now()}-${user.id}` : null
      });

      console.log("✅ Share logged:", platform, type, id);
    } catch (error) {
      console.error("❌ Error logging share:", error);
    }
  };

  // Native Share API (mobile devices)
  const handleNativeShare = async () => {
    const shareUrl = generateShareUrl();
    const shareData = {
      title: title || `Check this out on AZ Live Market!`,
      text: description || `Join this ${type} on AZ Live Market! 🎉`,
      url: shareUrl
    };

    if (navigator.share) {
      try {
        await navigator.share(shareData);
        await logShare('native_share');
        toast.success('Shared successfully!');
        setShowModal(false);
      } catch (error) {
        if (error.name !== 'AbortError') {
          console.error('Error sharing:', error);
          toast.error('Failed to share');
        }
      }
    } else {
      // Fallback to copy link
      handleCopyLink();
    }
  };

  // Copy link to clipboard
  const handleCopyLink = async () => {
    const shareUrl = generateShareUrl();
    
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      await logShare('copy_link');
      toast.success('Link copied to clipboard!');
      
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Error copying:', error);
      toast.error('Failed to copy link');
    }
  };

  // Share to specific platform
  const handlePlatformShare = async (platform) => {
    const shareUrl = generateShareUrl();
    const encodedUrl = encodeURIComponent(shareUrl);
    const encodedTitle = encodeURIComponent(title || 'Check this out!');
    const encodedText = encodeURIComponent(description || `Join this ${type} on AZ Live Market!`);

    let shareLink = '';

    switch (platform) {
      case 'facebook':
        shareLink = `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`;
        break;
      case 'twitter':
        shareLink = `https://twitter.com/intent/tweet?url=${encodedUrl}&text=${encodedTitle}`;
        break;
      case 'whatsapp':
        shareLink = `https://wa.me/?text=${encodedTitle}%20${encodedUrl}`;
        break;
      case 'sms':
        shareLink = `sms:?body=${encodedTitle}%20${encodedUrl}`;
        break;
      case 'email':
        shareLink = `mailto:?subject=${encodedTitle}&body=${encodedText}%20${encodedUrl}`;
        break;
      default:
        return;
    }

    await logShare(platform);
    window.open(shareLink, '_blank', 'width=600,height=400');
  };

  const shareOptions = [
    { id: 'copy', label: 'Copy Link', icon: Copy, action: handleCopyLink, color: 'text-gray-700' },
    { id: 'facebook', label: 'Facebook', icon: Facebook, action: () => handlePlatformShare('facebook'), color: 'text-blue-600' },
    { id: 'twitter', label: 'Twitter', icon: Twitter, action: () => handlePlatformShare('twitter'), color: 'text-sky-500' },
    { id: 'whatsapp', label: 'WhatsApp', icon: MessageCircle, action: () => handlePlatformShare('whatsapp'), color: 'text-green-600' },
    { id: 'sms', label: 'Messages', icon: MessageCircle, action: () => handlePlatformShare('sms'), color: 'text-purple-600' },
    { id: 'email', label: 'Email', icon: Mail, action: () => handlePlatformShare('email'), color: 'text-orange-600' },
  ];

  return (
    <>
      <Button
        variant={variant}
        size={size}
        onClick={() => {
          // Try native share first on mobile
          if (navigator.share && window.innerWidth < 768) {
            handleNativeShare();
          } else {
            setShowModal(true);
          }
        }}
        className={className}
      >
        <Share2 className="w-4 h-4" />
        {showLabel && <span className="ml-2">Share</span>}
      </Button>

      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Share2 className="w-5 h-5 text-purple-600" />
              Share {type === 'show' ? 'Show' : type === 'community' ? 'Community' : 'Seller'}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Preview */}
            <div className="bg-gradient-to-r from-purple-50 to-blue-50 rounded-lg p-4 border border-purple-200">
              <h4 className="font-semibold text-gray-900 mb-1">{title}</h4>
              {description && (
                <p className="text-sm text-gray-600 line-clamp-2">{description}</p>
              )}
            </div>

            {/* Share Options */}
            <div className="grid grid-cols-3 gap-3">
              {shareOptions.map((option) => (
                <button
                  key={option.id}
                  onClick={option.action}
                  className="flex flex-col items-center gap-2 p-4 rounded-lg border border-gray-200 hover:bg-gray-50 transition-all hover:shadow-md"
                >
                  <option.icon className={`w-6 h-6 ${option.color}`} />
                  <span className="text-xs font-medium text-gray-700">{option.label}</span>
                  {option.id === 'copy' && copied && (
                    <CheckCircle className="w-4 h-4 text-green-600" />
                  )}
                </button>
              ))}
            </div>

            {/* GIVI Notice (if user is logged in) */}
            {user && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 mt-4">
                <p className="text-xs text-yellow-800">
                  <strong>🎁 GIVI Tracking Active:</strong> Each share counts toward giveaway entries! Share more to increase your chances.
                </p>
              </div>
            )}

            {/* Direct Share URL Display */}
            <div className="mt-4">
              <label className="text-xs text-gray-600 mb-2 block">Share URL:</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={generateShareUrl()}
                  readOnly
                  className="flex-1 text-xs bg-gray-100 rounded px-3 py-2 border border-gray-200"
                  onClick={(e) => e.target.select()}
                />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleCopyLink}
                >
                  {copied ? <CheckCircle className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}