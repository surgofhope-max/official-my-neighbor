import React, { useState, useEffect } from "react";
import { supabaseApi as base44 } from "@/api/supabaseClient";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  Share2, 
  TrendingUp, 
  Users, 
  Facebook, 
  Twitter, 
  MessageCircle, 
  Mail,
  Copy,
  Gift
} from "lucide-react";

/**
 * Share Analytics Component
 * Displays share statistics and GIVI performance for content
 */
export default function ShareAnalytics({ type, id, title }) {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadStats();
  }, [type, id]);

  const loadStats = async () => {
    try {
      setLoading(true);
      const response = await base44.functions.invoke('getShareStats', {
        type: type,
        id: id
      });
      
      setStats(response.data.stats);
    } catch (error) {
      console.error('Error loading share stats:', error);
    }
    setLoading(false);
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600 mx-auto"></div>
          <p className="text-sm text-gray-600 mt-2">Loading share stats...</p>
        </CardContent>
      </Card>
    );
  }

  if (!stats) {
    return null;
  }

  const platformIcons = {
    facebook: Facebook,
    twitter: Twitter,
    whatsapp: MessageCircle,
    sms: MessageCircle,
    email: Mail,
    copy_link: Copy,
    native_share: Share2
  };

  return (
    <div className="space-y-6">
      {/* Overview Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-0 shadow-lg">
          <CardContent className="p-6">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600 mb-2">Total Shares</p>
                <p className="text-3xl font-bold text-gray-900">{stats.totalShares}</p>
              </div>
              <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center">
                <Share2 className="w-6 h-6 text-white" />
              </div>
            </div>
          </CardContent>
        </Card>

        {stats.giviStats && (
          <>
            <Card className="border-0 shadow-lg">
              <CardContent className="p-6">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600 mb-2">GIVI Entries</p>
                    <p className="text-3xl font-bold text-gray-900">{stats.giviStats.totalEntries}</p>
                  </div>
                  <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-yellow-500 to-orange-500 flex items-center justify-center">
                    <Gift className="w-6 h-6 text-white" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-lg">
              <CardContent className="p-6">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600 mb-2">Unique Referrers</p>
                    <p className="text-3xl font-bold text-gray-900">{stats.giviStats.uniqueReferrers}</p>
                  </div>
                  <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-green-500 to-emerald-500 flex items-center justify-center">
                    <Users className="w-6 h-6 text-white" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-lg">
              <CardContent className="p-6">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600 mb-2">Conversion Rate</p>
                    <p className="text-3xl font-bold text-gray-900">{stats.giviStats.conversionRate}%</p>
                  </div>
                  <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center">
                    <TrendingUp className="w-6 h-6 text-white" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>

      {/* Platform Breakdown */}
      <Card className="border-0 shadow-lg">
        <CardHeader>
          <CardTitle>Share Breakdown by Platform</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {Object.entries(stats.platformBreakdown).map(([platform, count]) => {
              const Icon = platformIcons[platform] || Share2;
              const percentage = ((count / stats.totalShares) * 100).toFixed(1);
              
              return (
                <div key={platform} className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0">
                    <Icon className="w-5 h-5 text-gray-600" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium text-gray-900 capitalize">
                        {platform.replace('_', ' ')}
                      </span>
                      <span className="text-sm text-gray-600">{count} shares</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div
                        className="bg-gradient-to-r from-purple-600 to-blue-500 h-2 rounded-full transition-all"
                        style={{ width: `${percentage}%` }}
                      ></div>
                    </div>
                  </div>
                  <Badge variant="outline" className="text-xs">
                    {percentage}%
                  </Badge>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Recent Shares */}
      {stats.recentShares && stats.recentShares.length > 0 && (
        <Card className="border-0 shadow-lg">
          <CardHeader>
            <CardTitle>Recent Share Activity</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {stats.recentShares.map((share, index) => (
                <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div className="flex items-center gap-3">
                    {(() => {
                      const Icon = platformIcons[share.platform] || Share2;
                      return <Icon className="w-4 h-4 text-gray-600" />;
                    })()}
                    <span className="text-sm text-gray-900 capitalize">
                      {share.platform.replace('_', ' ')}
                    </span>
                  </div>
                  <span className="text-xs text-gray-500">
                    {new Date(share.sharedAt).toLocaleDateString()}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}