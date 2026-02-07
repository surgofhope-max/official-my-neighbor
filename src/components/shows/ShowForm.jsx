import React, { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/lib/supabase/supabaseClient";
import { useQuery } from "@tanstack/react-query";
import { Upload, Loader2, Video, X as CloseIcon, AlertCircle, Image as ImageIcon } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { uploadShowThumbnail, uploadShowPreviewVideo } from "@/api/storage/showStorage";

export default function ShowForm({ show, onSave, onCancel, isSubmitting }) {
  const [formData, setFormData] = useState({
    title: show?.title || "",
    description: show?.description || "",
    pickup_instructions: show?.pickup_instructions || "",
    community: show?.community || "all",
    scheduled_start: show?.scheduled_start ? show.scheduled_start.substring(0, 16) : "",
    thumbnail_url: show?.thumbnail_url || "",
    preview_video_url: show?.preview_video_url || ""
  });
  const [uploadingThumbnail, setUploadingThumbnail] = useState(false);
  const [uploadingVideo, setUploadingVideo] = useState(false);
  const [videoError, setVideoError] = useState("");
  const thumbnailInputRef = useRef(null);
  const videoInputRef = useRef(null);

  // ═══════════════════════════════════════════════════════════════════════════
  // STEP C6-E: Fetch communities from Supabase (replaces base44.entities.Community)
  // ═══════════════════════════════════════════════════════════════════════════
  const { data: dbCommunities = [], isLoading: communitiesLoading } = useQuery({
    queryKey: ['communities-for-show-form'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("communities")
        .select("id, name, label")
        .eq("is_active", true)
        .order("sort_order", { ascending: true });

      if (error) throw error;
      return data ?? [];
    }
  });

  // Build community options: Always include "All Communities" + active communities from DB
  const communityOptions = [
    { value: "all", label: "All Communities" },
    ...dbCommunities.map(community => ({
      value: community.name,
      label: community.label
    }))
  ];

  // ═══════════════════════════════════════════════════════════════════════════
  // PHASE S1: Thumbnail upload using Supabase Storage
  // ═══════════════════════════════════════════════════════════════════════════
  const handleThumbnailUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setUploadingThumbnail(true);
    try {
      // Upload to Supabase Storage (show?.id if editing, pending folder if new)
      const result = await uploadShowThumbnail({
        showId: show?.id,
        file,
      });

      if (!result.success) {
        console.error("Error uploading thumbnail:", result.error);
        alert(result.error || "Failed to upload image. Please try again.");
        setUploadingThumbnail(false);
        return;
      }

      setFormData(prev => ({ ...prev, thumbnail_url: result.url }));
    } catch (error) {
      console.error("Error uploading thumbnail:", error);
      alert("Failed to upload image. Please try again.");
    }
    setUploadingThumbnail(false);
  };

  const handleVideoUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setVideoError("");
    setUploadingVideo(true);
    try {
      // Upload to Supabase Storage (validation happens inside uploadShowPreviewVideo)
      const publicUrl = await uploadShowPreviewVideo({ file });
      setFormData(prev => ({ ...prev, preview_video_url: publicUrl }));
    } catch (error) {
      console.error("Error uploading video:", error);
      setVideoError(error.message || "Failed to upload video. Please try again.");
    }
    setUploadingVideo(false);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    
    // Validate required fields
    if (!formData.title.trim()) {
      alert("Please enter a show title");
      return;
    }
    
    if (!formData.scheduled_start) {
      alert("Please select a scheduled start time");
      return;
    }
    
    onSave({
      ...formData,
      scheduled_start: new Date(formData.scheduled_start).toISOString()
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Thumbnail */}
      <div className="space-y-3">
        <Label>Show Thumbnail (Image)</Label>
        <p className="text-xs text-gray-500">
          Static image displayed when video is not available • Recommended: 1200×800px
        </p>
        {formData.thumbnail_url ? (
          <div className="relative">
            <img
              src={formData.thumbnail_url}
              alt="Thumbnail"
              className="w-full h-48 object-cover rounded-lg"
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="absolute top-2 right-2"
              onClick={() => thumbnailInputRef.current?.click()}
              disabled={uploadingThumbnail}
            >
              {uploadingThumbnail ? <Loader2 className="w-4 h-4 animate-spin" /> : "Change"}
            </Button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => thumbnailInputRef.current?.click()}
            className="w-full h-48 border-2 border-dashed border-gray-300 rounded-lg flex flex-col items-center justify-center hover:border-purple-500 transition-colors"
            disabled={uploadingThumbnail}
          >
            {uploadingThumbnail ? (
              <>
                <Loader2 className="w-8 h-8 text-purple-600 mb-2 animate-spin" />
                <span className="text-sm text-purple-600">Uploading...</span>
              </>
            ) : (
              <>
                <Upload className="w-8 h-8 text-gray-400 mb-2" />
                <span className="text-sm text-gray-500">Upload Thumbnail</span>
              </>
            )}
          </button>
        )}
        <input
          ref={thumbnailInputRef}
          type="file"
          accept="image/*"
          onChange={handleThumbnailUpload}
          className="hidden"
        />
      </div>

      {/* Video Preview Upload - NEW */}
      <div className="space-y-3 bg-gradient-to-r from-purple-50 to-blue-50 rounded-lg p-4">
        <div className="flex items-center gap-2">
          <Video className="w-5 h-5 text-purple-600" />
          <Label className="text-base">Video Preview (Optional)</Label>
        </div>
        <p className="text-xs text-gray-600">
          Upload a 20-30 second video preview • Plays on show cards and in waiting room before going live
          <br />
          <strong>Max size:</strong> 25MB • <strong>Formats:</strong> MP4, MOV, WebM
        </p>

        {videoError && (
          <Alert className="border-red-500 bg-red-50">
            <AlertCircle className="h-4 w-4 text-red-600" />
            <AlertDescription className="text-red-900">{videoError}</AlertDescription>
          </Alert>
        )}

        {formData.preview_video_url ? (
          <div className="relative">
            <video
              src={formData.preview_video_url}
              className="w-full h-48 object-cover rounded-lg"
              controls
              preload="metadata"
            />
            <button
              type="button"
              onClick={() => setFormData(prev => ({ ...prev, preview_video_url: "" }))}
              className="absolute top-2 right-2 bg-red-500 text-white rounded-full p-2 hover:bg-red-600 shadow-lg"
            >
              <CloseIcon className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => videoInputRef.current?.click()}
            className="w-full h-32 border-2 border-dashed border-purple-300 rounded-lg flex flex-col items-center justify-center hover:border-purple-500 hover:bg-purple-50/50 transition-colors"
            disabled={uploadingVideo}
          >
            {uploadingVideo ? (
              <>
                <Loader2 className="w-8 h-8 text-purple-600 mb-2 animate-spin" />
                <span className="text-sm text-purple-600">Uploading Video...</span>
                <span className="text-xs text-gray-500 mt-1">This may take a minute</span>
              </>
            ) : (
              <>
                <Video className="w-8 h-8 text-purple-500 mb-2" />
                <span className="text-sm text-purple-700 font-medium">Upload Video Preview</span>
                <span className="text-xs text-gray-500 mt-1">Click to browse</span>
              </>
            )}
          </button>
        )}
        <input
          ref={videoInputRef}
          type="file"
          accept="video/mp4,video/quicktime,video/webm"
          onChange={handleVideoUpload}
          className="hidden"
        />
      </div>

      {/* Title */}
      <div className="space-y-2">
        <Label>Show Title *</Label>
        <Input
          value={formData.title}
          onChange={(e) => setFormData({ ...formData, title: e.target.value })}
          placeholder="e.g., Weekly Deals Livestream"
          required
        />
      </div>

      {/* Description */}
      <div className="space-y-2">
        <Label>Description</Label>
        <Textarea
          value={formData.description}
          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
          placeholder="What will you be showing in this stream?"
          rows={4}
        />
      </div>

      {/* Pickup Instructions */}
      <div className="space-y-2">
        <Label>Pickup Instructions</Label>
        <Textarea
          value={formData.pickup_instructions}
          onChange={(e) => setFormData({ ...formData, pickup_instructions: e.target.value })}
          placeholder="e.g., Pickup at 123 Main St, Phoenix AZ. Available 2-5pm. Gate code: #1234"
          rows={3}
        />
        <p className="text-xs text-gray-500">
          Share pickup location, time windows, gate codes, or other instructions with buyers
        </p>
      </div>

      {/* Community Selection */}
      <div className="space-y-2">
        <Label>Community Category</Label>
        {communitiesLoading ? (
          <div className="flex items-center justify-center h-10 border border-gray-300 rounded-md bg-gray-50">
            <Loader2 className="w-4 h-4 animate-spin text-gray-500" />
            <span className="ml-2 text-sm text-gray-500">Loading communities...</span>
          </div>
        ) : (
          <Select
            value={formData.community}
            onValueChange={(value) => setFormData({ ...formData, community: value })}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select a community" />
            </SelectTrigger>
            <SelectContent>
              {communityOptions.map((community) => (
                <SelectItem key={community.value} value={community.value}>
                  {community.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <p className="text-xs text-gray-500">
          Your show will appear in the selected community category on the Marketplace
          {dbCommunities.length > 0 && ` • ${dbCommunities.length} active communities`}
        </p>
      </div>

      {/* Scheduled Start */}
      <div className="space-y-2">
        <Label>Scheduled Start Time *</Label>
        <Input
          type="datetime-local"
          value={formData.scheduled_start}
          onChange={(e) => setFormData({ ...formData, scheduled_start: e.target.value })}
          required
        />
      </div>

      {/* Actions */}
      <div className="flex gap-3 pt-4">
        <Button
          type="button"
          variant="outline"
          className="flex-1"
          onClick={onCancel}
          disabled={isSubmitting || uploadingThumbnail || uploadingVideo}
        >
          Cancel
        </Button>
        <Button
          type="submit"
          className="flex-1 bg-gradient-to-r from-purple-600 to-blue-500"
          disabled={isSubmitting || uploadingThumbnail || uploadingVideo || communitiesLoading}
        >
          {isSubmitting ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Saving...
            </>
          ) : (
            "Schedule Show"
          )}
        </Button>
      </div>
    </form>
  );
}