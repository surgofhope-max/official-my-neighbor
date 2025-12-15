import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabaseApi as base44 } from "@/api/supabaseClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Search, Ban, MessageSquareOff, EyeOff, ShieldOff, Unlock, RefreshCw, Database, AlertCircle } from "lucide-react";
import { format } from "date-fns";

export default function ModerationCenter({ sellerId }) {
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState("");
  const [unbanningViewer, setUnbanningViewer] = useState(null);

  const { data: viewerBans = [], isLoading, error, refetch } = useQuery({
    queryKey: ['viewer-bans', sellerId],
    queryFn: async () => {
      console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
      console.log("📋 MODERATION CENTER - FETCHING BANS");
      console.log("   Seller ID:", sellerId);
      console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
      
      if (!sellerId) {
        throw new Error("Seller ID is required to fetch bans");
      }

      const bans = await base44.entities.ViewerBan.filter({ seller_id: sellerId }, '-created_date');
      
      console.log("✅ BANS LOADED FROM DATABASE");
      console.log("   Total Count:", bans.length);
      
      if (bans.length > 0) {
        console.log("   First ban sample:", bans[0]);
        bans.forEach((ban, idx) => {
          console.log(`   Ban ${idx + 1}:`, {
            id: ban.id,
            viewer_id: ban.viewer_id,
            viewer_name: ban.viewer_name,
            ban_type: ban.ban_type,
            created_date: ban.created_date
          });
        });
      } else {
        console.log("   ⚠️ No bans found for seller:", sellerId);
      }
      console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
      
      return bans;
    },
    enabled: !!sellerId,
    staleTime: 2000,
    refetchInterval: 10000
  });

  const unbanMutation = useMutation({
    mutationFn: async (banId) => {
      console.log("🔓 UNBANNING viewer, deleting ban ID:", banId);
      const result = await base44.entities.ViewerBan.delete(banId);
      console.log("✅ UNBAN SUCCESS:", result);
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['viewer-bans'] });
      queryClient.invalidateQueries({ queryKey: ['viewer-ban-check'] });
      queryClient.invalidateQueries({ queryKey: ['seller-banned-buyers-count'] });
      setUnbanningViewer(null);
      alert("✅ User unbanned successfully!");
    },
    onError: (error) => {
      console.error("❌ UNBAN FAILED:", error);
      alert(`❌ Failed to unban user: ${error.message}`);
    }
  });

  const filteredBans = viewerBans.filter(ban =>
    ban.viewer_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    ban.viewer_id?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getBanIcon = (banType) => {
    switch (banType) {
      case 'chat':
        return <MessageSquareOff className="w-4 h-4 text-orange-600" />;
      case 'view':
        return <EyeOff className="w-4 h-4 text-red-600" />;
      case 'full':
        return <ShieldOff className="w-4 h-4 text-red-700" />;
      default:
        return <Ban className="w-4 h-4" />;
    }
  };

  const getBanLabel = (banType) => {
    switch (banType) {
      case 'chat':
        return 'Chat Ban';
      case 'view':
        return 'View Ban';
      case 'full':
        return 'Full Ban';
      default:
        return banType;
    }
  };

  const getBanColor = (banType) => {
    switch (banType) {
      case 'chat':
        return 'bg-orange-100 text-orange-800 border-orange-300';
      case 'view':
        return 'bg-red-100 text-red-800 border-red-300';
      case 'full':
        return 'bg-red-200 text-red-900 border-red-400';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-300';
    }
  };

  if (!sellerId) {
    return (
      <Alert className="border-red-500 bg-red-50">
        <AlertCircle className="w-5 h-5 text-red-600" />
        <AlertDescription className="text-red-900">
          <strong>Error:</strong> Seller ID is required to display bans.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-4">
      <Card className="border-0 shadow-lg">
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                <Ban className="w-5 h-5 text-red-600 flex-shrink-0" />
                Viewer / Chat Bans
              </CardTitle>
              <p className="text-xs sm:text-sm text-gray-600 mt-1">
                Manage viewers banned from chat, viewing, or fully restricted
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-base sm:text-lg">
                {viewerBans.length} Banned
              </Badge>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  console.log("🔄 Manual refresh triggered");
                  refetch();
                }}
                disabled={isLoading}
              >
                <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="px-3 sm:px-6">
          {error && (
            <Alert className="border-red-500 bg-red-50 mb-4">
              <AlertCircle className="w-5 h-5 text-red-600" />
              <AlertDescription className="text-red-900 text-xs sm:text-sm">
                <strong>Error loading bans:</strong> {error.message}
              </AlertDescription>
            </Alert>
          )}

          <div className="mb-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search by name or viewer ID..."
                className="pl-10 text-sm"
              />
            </div>
          </div>

          {isLoading ? (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600 mx-auto mb-2"></div>
              <p className="text-xs sm:text-sm text-gray-600">Loading bans...</p>
            </div>
          ) : filteredBans.length === 0 ? (
            <div className="text-center py-8 sm:py-12">
              <Database className="w-12 h-12 sm:w-16 sm:h-16 text-gray-400 mx-auto mb-4" />
              <h3 className="text-base sm:text-lg font-semibold text-gray-900 mb-2">
                {searchTerm ? "No Results" : viewerBans.length === 0 ? "No Viewer Bans" : "No Matching Bans"}
              </h3>
              <p className="text-xs sm:text-sm text-gray-600 mb-4 px-4">
                {searchTerm
                  ? "No banned viewers match your search"
                  : "You haven't banned any viewers from chat or viewing"}
              </p>
              <div className="flex gap-2 justify-center">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    console.log("🔍 Checking database for bans...");
                    console.log("   Seller ID:", sellerId);
                    refetch();
                  }}
                >
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Check Database
                </Button>
              </div>
              {viewerBans.length === 0 && (
                <p className="text-xs text-gray-500 mt-4 px-4">
                  If you just banned someone, click "Check Database" to refresh.
                </p>
              )}
            </div>
          ) : (
            <div className="space-y-3 sm:space-y-0">
              {/* Mobile Card View */}
              <div className="block sm:hidden space-y-3">
                {filteredBans.map((ban) => (
                  <Card key={ban.id} className="border shadow-sm">
                    <CardContent className="p-4 space-y-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          <Avatar className="w-10 h-10 flex-shrink-0">
                            <AvatarFallback className="bg-gray-200 text-gray-700">
                              {ban.viewer_name?.[0]?.toUpperCase() || '?'}
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold text-gray-900 text-sm truncate">{ban.viewer_name}</p>
                            <p className="text-xs text-gray-500 truncate">ID: {ban.viewer_id}</p>
                          </div>
                        </div>
                        <Badge className={`${getBanColor(ban.ban_type)} border flex items-center gap-1 text-xs flex-shrink-0`}>
                          {getBanIcon(ban.ban_type)}
                          <span className="hidden xs:inline">{getBanLabel(ban.ban_type)}</span>
                        </Badge>
                      </div>

                      {ban.reason && (
                        <div>
                          <p className="text-xs font-medium text-gray-600 mb-1">Reason:</p>
                          <p className="text-xs text-gray-700 line-clamp-2">
                            {ban.reason}
                          </p>
                        </div>
                      )}

                      <div className="flex items-center justify-between pt-2 border-t">
                        <p className="text-xs text-gray-500">
                          {format(new Date(ban.created_date), 'MMM d, yyyy')}
                        </p>
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-green-600 border-green-300 hover:bg-green-50 h-8 text-xs"
                          onClick={() => setUnbanningViewer(ban)}
                        >
                          <Unlock className="w-3 h-3 mr-1" />
                          Unban
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>

              {/* Desktop Table View */}
              <div className="hidden sm:block overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">Viewer</th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">Ban Type</th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">Reason</th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">Date</th>
                      <th className="text-right py-3 px-4 text-sm font-medium text-gray-700">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredBans.map((ban) => (
                      <tr key={ban.id} className="border-b hover:bg-gray-50">
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-3">
                            <Avatar className="w-10 h-10">
                              <AvatarFallback className="bg-gray-200 text-gray-700">
                                {ban.viewer_name?.[0]?.toUpperCase() || '?'}
                              </AvatarFallback>
                            </Avatar>
                            <div>
                              <p className="font-semibold text-gray-900 text-sm">{ban.viewer_name}</p>
                              <p className="text-xs text-gray-500">ID: {ban.viewer_id}</p>
                            </div>
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <Badge className={`${getBanColor(ban.ban_type)} border flex items-center gap-1 w-fit text-xs`}>
                            {getBanIcon(ban.ban_type)}
                            {getBanLabel(ban.ban_type)}
                          </Badge>
                        </td>
                        <td className="py-3 px-4">
                          <p className="text-sm text-gray-700 line-clamp-2">
                            {ban.reason || <span className="text-gray-400 italic">No reason provided</span>}
                          </p>
                        </td>
                        <td className="py-3 px-4">
                          <p className="text-sm text-gray-700">
                            {format(new Date(ban.created_date), 'MMM d, yyyy')}
                          </p>
                        </td>
                        <td className="py-3 px-4 text-right">
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-green-600 border-green-300 hover:bg-green-50"
                            onClick={() => setUnbanningViewer(ban)}
                          >
                            <Unlock className="w-4 h-4 mr-1" />
                            Unban
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={!!unbanningViewer} onOpenChange={() => setUnbanningViewer(null)}>
        <AlertDialogContent className="max-w-[90vw] sm:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-base sm:text-lg">Unban Viewer?</AlertDialogTitle>
            <AlertDialogDescription className="text-xs sm:text-sm">
              Are you sure you want to unban <strong>{unbanningViewer?.viewer_name}</strong>? 
              They will be able to {
                unbanningViewer?.ban_type === 'chat' ? 'chat in your shows again' :
                unbanningViewer?.ban_type === 'view' ? 'watch your shows again' :
                'fully interact with your shows and products again'
              }.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col sm:flex-row gap-2">
            <AlertDialogCancel className="w-full sm:w-auto">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => unbanningViewer && unbanMutation.mutate(unbanningViewer.id)}
              className="bg-green-600 hover:bg-green-700 w-full sm:w-auto"
            >
              {unbanMutation.isPending ? "Unbanning..." : "Unban"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}