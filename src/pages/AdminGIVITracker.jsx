import React, { useState } from "react";
import { supabaseApi as base44 } from "@/api/supabaseClient";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertTriangle,
  CheckCircle,
  XCircle,
  Search,
  Gift,
  Users,
  TrendingUp,
  AlertCircle,
  RefreshCw
} from "lucide-react";
import { format } from "date-fns";

export default function AdminGIVITracker() {
  const [searchTerm, setSearchTerm] = useState("");

  // Fetch all GIVI events
  const { data: giviEvents = [], refetch: refetchEvents } = useQuery({
    queryKey: ['admin-givi-events'],
    queryFn: () => base44.entities.GIVIEvent.list('-created_date'),
    refetchInterval: 10000
  });

  // Fetch all GIVI entries
  const { data: giviEntries = [], refetch: refetchEntries } = useQuery({
    queryKey: ['admin-givi-entries'],
    queryFn: () => base44.entities.GIVIEntry.list('-created_date'),
    refetchInterval: 10000
  });

  // Fetch all debug logs
  const { data: debugLogs = [], refetch: refetchLogs } = useQuery({
    queryKey: ['admin-givi-debug-logs'],
    queryFn: () => base44.entities.GIVIDebugLog.list('-created_date'),
    refetchInterval: 5000
  });

  // Fetch shows for reference
  const { data: shows = [] } = useQuery({
    queryKey: ['admin-shows'],
    queryFn: () => base44.entities.Show.list()
  });

  // Fetch sellers for reference
  const { data: sellers = [] } = useQuery({
    queryKey: ['admin-sellers'],
    queryFn: () => base44.entities.Seller.list()
  });

  const showsMap = shows.reduce((acc, show) => {
    acc[show.id] = show;
    return acc;
  }, {});

  const sellersMap = sellers.reduce((acc, seller) => {
    acc[seller.id] = seller;
    return acc;
  }, {});

  // Fetch all orders to check for duplicate GIVI orders
  const { data: allOrders = [] } = useQuery({
    queryKey: ['admin-all-orders'],
    queryFn: () => base44.entities.Order.list('-created_date'),
    refetchInterval: 10000
  });

  // Calculate stats per GIVI event
  const eventsWithStats = giviEvents.map(event => {
    const eventEntries = giviEntries.filter(e => e.givi_event_id === event.id);
    const validEntries = eventEntries.filter(e => e.user_id && e.user_name && e.user_email);
    const invalidEntries = eventEntries.filter(e => !e.user_id || !e.user_name || !e.user_email);
    const winners = eventEntries.filter(e => e.is_winner);
    const eventLogs = debugLogs.filter(log => log.givi_event_id === event.id);
    const errorLogs = eventLogs.filter(log => log.status === 'error');
    
    // CRITICAL: Check for duplicate orders (same buyer + product + GIVI)
    const giviOrders = allOrders.filter(o => 
      o.product_id === event.product_id && 
      o.price === 0 &&
      o.show_id === event.show_id
    );
    
    // Group by buyer to find duplicates
    const ordersByBuyer = {};
    giviOrders.forEach(order => {
      if (!ordersByBuyer[order.buyer_id]) {
        ordersByBuyer[order.buyer_id] = [];
      }
      ordersByBuyer[order.buyer_id].push(order);
    });
    
    const duplicateOrders = Object.values(ordersByBuyer).filter(orders => orders.length > 1);
    const hasDuplicates = duplicateOrders.length > 0;
    const totalDuplicateCount = duplicateOrders.reduce((sum, orders) => sum + (orders.length - 1), 0);
    
    return {
      ...event,
      totalEntries: eventEntries.length,
      validEntries: validEntries.length,
      invalidEntries: invalidEntries.length,
      winners: winners.length,
      errorCount: errorLogs.length,
      hasErrors: errorLogs.length > 0 || hasDuplicates,
      ordersCreated: giviOrders.length,
      expectedOrders: winners.length,
      hasDuplicates,
      duplicateCount: totalDuplicateCount,
      show: showsMap[event.show_id],
      seller: sellersMap[event.host_id]
    };
  });

  // Filter events
  const filteredEvents = eventsWithStats.filter(event => {
    const matchesSearch = 
      event.product_title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      event.show?.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      event.seller?.business_name?.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesSearch;
  });

  // Summary stats
  const totalGIVIs = giviEvents.length;
  const totalEntries = giviEntries.length;
  const totalErrors = debugLogs.filter(log => log.status === 'error').length;
  const totalWinners = giviEntries.filter(e => e.is_winner).length;

  const handleRefreshAll = () => {
    refetchEvents();
    refetchEntries();
    refetchLogs();
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-purple-50 to-blue-50 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">GIVI Debug Tracker</h1>
            <p className="text-gray-600 mt-1">Monitor GIVI health, entries, winners, and errors</p>
          </div>
          <Button onClick={handleRefreshAll} variant="outline">
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </Button>
        </div>

        {/* Summary Stats */}
        <div className="grid sm:grid-cols-4 gap-4">
          <Card className="border-0 shadow-lg bg-gradient-to-br from-purple-500 to-blue-500">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-white/80 text-sm mb-1">Total GIVIs</p>
                  <p className="text-3xl font-bold text-white">{totalGIVIs}</p>
                </div>
                <Gift className="w-8 h-8 text-white/80" />
              </div>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-lg bg-gradient-to-br from-green-500 to-emerald-500">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-white/80 text-sm mb-1">Total Entries</p>
                  <p className="text-3xl font-bold text-white">{totalEntries}</p>
                </div>
                <Users className="w-8 h-8 text-white/80" />
              </div>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-lg bg-gradient-to-br from-yellow-500 to-orange-500">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-white/80 text-sm mb-1">Total Winners</p>
                  <p className="text-3xl font-bold text-white">{totalWinners}</p>
                </div>
                <TrendingUp className="w-8 h-8 text-white/80" />
              </div>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-lg bg-gradient-to-br from-red-500 to-pink-500">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-white/80 text-sm mb-1">Errors</p>
                  <p className="text-3xl font-bold text-white">{totalErrors}</p>
                </div>
                <AlertTriangle className="w-8 h-8 text-white/80" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Search */}
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search GIVIs, shows, sellers..."
            className="pl-10"
          />
        </div>

        {/* GIVI Events List */}
        <div className="space-y-4">
          <h2 className="text-xl font-semibold text-gray-900">GIVI Events ({filteredEvents.length})</h2>
          
          {filteredEvents.map((event) => {
            const eventLogs = debugLogs.filter(log => log.givi_event_id === event.id);
            const errorLogs = eventLogs.filter(log => log.status === 'error');
            
            return (
              <Card key={event.id} className={`border-0 shadow-lg ${event.hasErrors ? 'border-l-4 border-red-500' : ''}`}>
                <CardHeader className="bg-gradient-to-r from-gray-50 to-gray-100">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <Badge className={
                          event.status === "active" ? "bg-green-500 text-white" :
                          event.status === "paused" ? "bg-yellow-500 text-white" :
                          event.status === "result" ? "bg-blue-500 text-white" :
                          "bg-gray-500 text-white"
                        }>
                          {event.status.toUpperCase()}
                        </Badge>
                        {event.hasErrors && (
                          <Badge className="bg-red-500 text-white">
                            <AlertTriangle className="w-3 h-3 mr-1" />
                            {event.errorCount} Errors
                          </Badge>
                        )}
                      </div>
                      <CardTitle className="text-lg">{event.product_title}</CardTitle>
                      <div className="flex items-center gap-4 mt-2 text-sm text-gray-600">
                        <span>Show: {event.show?.title || "Unknown"}</span>
                        <span>•</span>
                        <span>Seller: {event.seller?.business_name || "Unknown"}</span>
                      </div>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="p-6">
                  {/* Stats Grid */}
                  <div className="grid grid-cols-2 sm:grid-cols-6 gap-4 mb-4">
                    <div className="text-center p-3 bg-blue-50 rounded-lg">
                      <p className="text-2xl font-bold text-blue-600">{event.totalEntries}</p>
                      <p className="text-xs text-gray-600">Total Entries</p>
                    </div>
                    <div className="text-center p-3 bg-green-50 rounded-lg">
                      <p className="text-2xl font-bold text-green-600">{event.validEntries}</p>
                      <p className="text-xs text-gray-600">Valid Entries</p>
                    </div>
                    <div className="text-center p-3 bg-red-50 rounded-lg">
                      <p className="text-2xl font-bold text-red-600">{event.invalidEntries}</p>
                      <p className="text-xs text-gray-600">Invalid Entries</p>
                    </div>
                    <div className="text-center p-3 bg-yellow-50 rounded-lg">
                      <p className="text-2xl font-bold text-yellow-600">{event.winners}</p>
                      <p className="text-xs text-gray-600">Winners</p>
                    </div>
                    <div className={`text-center p-3 rounded-lg ${
                      event.hasDuplicates ? 'bg-red-50' : 'bg-green-50'
                    }`}>
                      <p className={`text-2xl font-bold ${
                        event.hasDuplicates ? 'text-red-600' : 'text-green-600'
                      }`}>
                        {event.ordersCreated}
                        {event.hasDuplicates && ` (+${event.duplicateCount})`}
                      </p>
                      <p className="text-xs text-gray-600">Orders Created</p>
                      {event.hasDuplicates && (
                        <p className="text-xs text-red-600 font-semibold mt-1">
                          {event.duplicateCount} duplicates!
                        </p>
                      )}
                    </div>
                    <div className="text-center p-3 bg-purple-50 rounded-lg">
                      <p className="text-2xl font-bold text-purple-600">{event.new_followers_count || 0}</p>
                      <p className="text-xs text-gray-600">New Followers</p>
                    </div>
                  </div>

                  {/* Winners Display */}
                  {event.winner_names && event.winner_names.length > 0 && (
                    <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-4">
                      <div className="flex items-start gap-2">
                        <CheckCircle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
                        <div className="flex-1">
                          <p className="font-semibold text-gray-900 mb-1">Winners:</p>
                          <p className="text-sm text-gray-700 mb-2">
                            {event.winner_names.join(", ")}
                          </p>
                          {event.hasDuplicates && (
                            <Alert className="bg-red-50 border-red-300 mt-2">
                              <AlertTriangle className="w-4 h-4 text-red-600" />
                              <AlertDescription className="text-red-800 text-xs">
                                <strong>DUPLICATE ORDERS DETECTED:</strong> {event.duplicateCount} extra order(s) created. 
                                Expected {event.expectedOrders} orders but found {event.ordersCreated}.
                              </AlertDescription>
                            </Alert>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Error Logs */}
                  {errorLogs.length > 0 && (
                    <div className="bg-red-50 border-2 border-red-200 rounded-lg p-4">
                      <div className="flex items-center gap-2 mb-3">
                        <XCircle className="w-5 h-5 text-red-600" />
                        <h4 className="font-semibold text-red-900">Errors Detected ({errorLogs.length})</h4>
                      </div>
                      <div className="space-y-2 max-h-64 overflow-y-auto">
                        {errorLogs.map((log) => (
                          <div key={log.id} className="bg-white rounded-lg p-3 border border-red-200">
                            <div className="flex items-start justify-between gap-2 mb-2">
                              <Badge className="bg-red-500 text-white text-xs">
                                {log.action}
                              </Badge>
                              <span className="text-xs text-gray-500">
                                {format(new Date(log.created_date), "MMM d, h:mm a")}
                              </span>
                            </div>
                            <p className="text-sm text-red-800 font-mono mb-2">
                              {log.error_message}
                            </p>
                            {log.buyer_name && (
                              <p className="text-xs text-gray-600">
                                Buyer: {log.buyer_name} ({log.buyer_email})
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Metadata */}
                  <div className="grid grid-cols-2 gap-4 pt-4 border-t text-xs text-gray-600">
                    <div>
                      <p className="font-semibold mb-1">Started:</p>
                      <p>{format(new Date(event.start_time), "MMM d, yyyy 'at' h:mm a")}</p>
                    </div>
                    {event.announced_at && (
                      <div>
                        <p className="font-semibold mb-1">Winner Announced:</p>
                        <p>{format(new Date(event.announced_at), "MMM d, yyyy 'at' h:mm a")}</p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}

          {filteredEvents.length === 0 && (
            <Card className="border-2 border-dashed border-gray-300">
              <CardContent className="p-12 text-center">
                <Gift className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-gray-900 mb-2">No GIVI Events Found</h3>
                <p className="text-gray-600">No giveaway events have been created yet</p>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Recent Debug Logs */}
        <Card className="border-0 shadow-lg">
          <CardHeader>
            <CardTitle>Recent Debug Logs</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {debugLogs.slice(0, 50).map((log) => (
                <div
                  key={log.id}
                  className={`p-3 rounded-lg border ${
                    log.status === 'error' ? 'bg-red-50 border-red-200' :
                    log.status === 'warning' ? 'bg-yellow-50 border-yellow-200' :
                    'bg-green-50 border-green-200'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2">
                      {log.status === 'error' ? (
                        <XCircle className="w-4 h-4 text-red-600" />
                      ) : log.status === 'warning' ? (
                        <AlertCircle className="w-4 h-4 text-yellow-600" />
                      ) : (
                        <CheckCircle className="w-4 h-4 text-green-600" />
                      )}
                      <Badge className={`text-xs ${
                        log.status === 'error' ? 'bg-red-500 text-white' :
                        log.status === 'warning' ? 'bg-yellow-500 text-white' :
                        'bg-green-500 text-white'
                      }`}>
                        {log.action}
                      </Badge>
                    </div>
                    <span className="text-xs text-gray-500">
                      {format(new Date(log.created_date), "MMM d, h:mm:ss a")}
                    </span>
                  </div>
                  
                  {log.buyer_name && (
                    <p className="text-sm font-medium text-gray-900 mb-1">
                      {log.buyer_name} ({log.buyer_email})
                    </p>
                  )}
                  
                  {log.error_message && (
                    <p className="text-xs text-red-800 font-mono bg-white/50 p-2 rounded">
                      {log.error_message}
                    </p>
                  )}
                  
                  {log.metadata && (
                    <details className="mt-2">
                      <summary className="text-xs text-gray-600 cursor-pointer hover:text-gray-900">
                        View Metadata
                      </summary>
                      <pre className="text-xs bg-white/50 p-2 rounded mt-1 overflow-auto max-h-32">
                        {JSON.stringify(log.metadata, null, 2)}
                      </pre>
                    </details>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}