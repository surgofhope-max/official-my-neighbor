import React, { useState } from "react";
import { supabaseApi as base44 } from "@/api/supabaseClient";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Copy, Check, AlertCircle } from "lucide-react";

export default function ShowVideoDebug() {
  const [searchId, setSearchId] = useState("");
  const [copiedField, setCopiedField] = useState(null);

  // Fetch ALL shows
  const { data: allShows = [], isLoading } = useQuery({
    queryKey: ['all-shows-debug'],
    queryFn: () => base44.entities.Show.list('-created_date'),
  });

  // Find show by ID if searching
  const searchedShow = searchId 
    ? allShows.find(s => s.id.toLowerCase().includes(searchId.toLowerCase()))
    : null;

  const copyToClipboard = (text, field) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-purple-50 to-blue-50 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="bg-white rounded-xl shadow-lg p-6">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            🔍 Show Video Debug Tool
          </h1>
          <p className="text-gray-600 mb-4">
            Check if video_preview_url is being saved correctly to the database
          </p>

          {/* Search */}
          <div className="flex gap-3 mb-6">
            <Input
              placeholder="Enter Show ID to search..."
              value={searchId}
              onChange={(e) => setSearchId(e.target.value)}
              className="flex-1"
            />
            <Button variant="outline" onClick={() => setSearchId("")}>
              Clear
            </Button>
          </div>

          {/* Summary Stats */}
          <div className="grid grid-cols-3 gap-4 mb-6">
            <Card>
              <CardContent className="p-4 text-center">
                <div className="text-3xl font-bold text-purple-600">
                  {allShows.length}
                </div>
                <div className="text-sm text-gray-600">Total Shows</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <div className="text-3xl font-bold text-green-600">
                  {allShows.filter(s => s.video_preview_url).length}
                </div>
                <div className="text-sm text-gray-600">With Video Preview</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <div className="text-3xl font-bold text-blue-600">
                  {allShows.filter(s => s.thumbnail_url).length}
                </div>
                <div className="text-sm text-gray-600">With Thumbnail</div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Searched Show Detail */}
        {searchedShow && (
          <Card className="border-2 border-purple-500">
            <CardHeader className="bg-purple-50">
              <CardTitle className="flex items-center gap-2">
                🔍 Found: {searchedShow.title}
                <Badge className="bg-purple-600 text-white">
                  {searchedShow.status}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6 space-y-4">
              {/* Show ID */}
              <div>
                <label className="text-sm font-semibold text-gray-700">Show ID:</label>
                <div className="flex items-center gap-2 mt-1">
                  <code className="flex-1 bg-gray-100 p-2 rounded text-xs break-all">
                    {searchedShow.id}
                  </code>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => copyToClipboard(searchedShow.id, 'id')}
                  >
                    {copiedField === 'id' ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
                  </Button>
                </div>
              </div>

              {/* Video Preview URL */}
              <div>
                <label className="text-sm font-semibold text-gray-700">Video Preview URL:</label>
                {searchedShow.video_preview_url ? (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 mt-1">
                      <code className="flex-1 bg-green-50 border border-green-200 p-2 rounded text-xs break-all">
                        {searchedShow.video_preview_url}
                      </code>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => copyToClipboard(searchedShow.video_preview_url, 'video')}
                      >
                        {copiedField === 'video' ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
                      </Button>
                    </div>
                    <video
                      src={searchedShow.video_preview_url}
                      className="w-full h-64 object-cover rounded-lg border-2 border-green-500"
                      controls
                      preload="metadata"
                    />
                    <Badge className="bg-green-600 text-white">✅ VIDEO EXISTS</Badge>
                  </div>
                ) : (
                  <div className="bg-red-50 border border-red-200 p-3 rounded mt-1">
                    <p className="text-red-800 text-sm font-semibold">❌ NO VIDEO PREVIEW URL</p>
                  </div>
                )}
              </div>

              {/* Thumbnail URL */}
              <div>
                <label className="text-sm font-semibold text-gray-700">Thumbnail URL:</label>
                {searchedShow.thumbnail_url ? (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 mt-1">
                      <code className="flex-1 bg-blue-50 border border-blue-200 p-2 rounded text-xs break-all">
                        {searchedShow.thumbnail_url}
                      </code>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => copyToClipboard(searchedShow.thumbnail_url, 'thumb')}
                      >
                        {copiedField === 'thumb' ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
                      </Button>
                    </div>
                    <img
                      src={searchedShow.thumbnail_url}
                      alt={searchedShow.title}
                      className="w-full h-64 object-cover rounded-lg border-2 border-blue-500"
                    />
                    <Badge className="bg-blue-600 text-white">✅ THUMBNAIL EXISTS</Badge>
                  </div>
                ) : (
                  <div className="bg-red-50 border border-red-200 p-3 rounded mt-1">
                    <p className="text-red-800 text-sm font-semibold">❌ NO THUMBNAIL URL</p>
                  </div>
                )}
              </div>

              {/* Other Fields */}
              <div className="grid grid-cols-2 gap-4 pt-4 border-t">
                <div>
                  <label className="text-xs text-gray-500">Status:</label>
                  <p className="font-semibold">{searchedShow.status}</p>
                </div>
                <div>
                  <label className="text-xs text-gray-500">Is Streaming:</label>
                  <p className="font-semibold">{searchedShow.is_streaming ? "Yes" : "No"}</p>
                </div>
                <div>
                  <label className="text-xs text-gray-500">Scheduled Start:</label>
                  <p className="text-sm">{new Date(searchedShow.scheduled_start).toLocaleString()}</p>
                </div>
                <div>
                  <label className="text-xs text-gray-500">Community:</label>
                  <p className="text-sm">{searchedShow.community}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* All Shows List */}
        <Card>
          <CardHeader>
            <CardTitle>📋 All Shows (Most Recent First)</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-12 text-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600 mx-auto mb-4"></div>
                <p className="text-gray-600">Loading shows...</p>
              </div>
            ) : allShows.length === 0 ? (
              <div className="p-12 text-center">
                <AlertCircle className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-600">No shows found</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-200">
                {allShows.map((show) => (
                  <div key={show.id} className="p-4 hover:bg-gray-50 transition-colors">
                    <div className="flex items-start gap-4">
                      {/* Preview */}
                      <div className="w-32 h-20 flex-shrink-0 rounded-lg overflow-hidden bg-gray-100">
                        {show.video_preview_url ? (
                          <video
                            src={show.video_preview_url}
                            className="w-full h-full object-cover"
                            preload="metadata"
                          />
                        ) : show.thumbnail_url ? (
                          <img
                            src={show.thumbnail_url}
                            alt={show.title}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-gray-400 text-xs">
                            No media
                          </div>
                        )}
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <h3 className="font-bold text-gray-900 mb-1 truncate">
                          {show.title}
                        </h3>
                        <p className="text-xs text-gray-500 mb-2 truncate">
                          ID: {show.id}
                        </p>
                        <div className="flex flex-wrap gap-2">
                          <Badge className={show.status === "live" ? "bg-red-500" : "bg-gray-500"}>
                            {show.status}
                          </Badge>
                          {show.video_preview_url && (
                            <Badge className="bg-green-600 text-white">✅ Video</Badge>
                          )}
                          {show.thumbnail_url && (
                            <Badge className="bg-blue-600 text-white">🖼️ Thumb</Badge>
                          )}
                          {!show.video_preview_url && !show.thumbnail_url && (
                            <Badge className="bg-red-600 text-white">❌ No Media</Badge>
                          )}
                        </div>
                      </div>

                      {/* Action */}
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setSearchId(show.id)}
                      >
                        Inspect
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}