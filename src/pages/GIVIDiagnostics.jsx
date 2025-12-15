import React, { useState, useEffect } from "react";
import { supabaseApi as base44 } from "@/api/supabaseClient";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Search,
  User,
  ShoppingBag,
  Gift,
  CheckCircle,
  XCircle,
  AlertTriangle,
  RefreshCw,
  Database
} from "lucide-react";

export default function GIVIDiagnostics() {
  const [user, setUser] = useState(null);
  const [searchEmail, setSearchEmail] = useState("");
  const [diagnosticResults, setDiagnosticResults] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadUser();
  }, []);

  const loadUser = async () => {
    try {
      const currentUser = await base44.auth.me();
      setUser(currentUser);
      setSearchEmail(currentUser.email);
    } catch (error) {
      console.error("Error loading user:", error);
    }
  };

  const runDiagnostics = async () => {
    if (!searchEmail) return;
    
    setLoading(true);
    setDiagnosticResults(null);

    try {
      console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
      console.log("🔍 RUNNING GIVI DIAGNOSTICS FOR:", searchEmail);
      console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

      // Check User record
      const users = await base44.entities.User.list();
      const userRecord = users.find(u => u.email === searchEmail);

      // Check Seller profile
      const sellers = await base44.entities.Seller.filter({ created_by: searchEmail });
      const sellerProfile = sellers.length > 0 ? sellers[0] : null;

      // Check BuyerProfile
      let buyerProfile = null;
      if (userRecord) {
        const buyerProfiles = await base44.entities.BuyerProfile.filter({ user_id: userRecord.id });
        buyerProfile = buyerProfiles.length > 0 ? buyerProfiles[0] : null;
      }

      // Check GIVI Entries
      let giviEntries = [];
      if (userRecord) {
        giviEntries = await base44.entities.GIVIEntry.filter({ user_id: userRecord.id });
      }

      // Check Orders (as buyer)
      let orders = [];
      let batches = [];
      if (userRecord) {
        orders = await base44.entities.Order.filter({ buyer_id: userRecord.id });
        batches = await base44.entities.Batch.filter({ buyer_id: userRecord.id });
      }

      // Check for orphaned orders (orders without batches)
      const orphanedOrders = orders.filter(order => {
        if (!order.batch_id) return true;
        const batchExists = batches.some(b => b.id === order.batch_id);
        return !batchExists;
      });

      // GIVI specific checks
      const giviOrders = orders.filter(o => o.price === 0);
      const giviWins = giviEntries.filter(e => e.is_winner);
      const giviOrdersWithoutEntry = giviOrders.filter(order => {
        const hasEntry = giviEntries.some(entry => 
          entry.is_winner && 
          entry.givi_event_id && 
          order.product_title?.includes("GIVI")
        );
        return !hasEntry;
      });

      const results = {
        userRecord,
        sellerProfile,
        buyerProfile,
        giviEntries,
        orders,
        batches,
        orphanedOrders,
        giviOrders,
        giviWins,
        giviOrdersWithoutEntry,
        issues: []
      };

      // Identify issues
      if (!userRecord) {
        results.issues.push({
          type: "error",
          message: `No User record found for email: ${searchEmail}`
        });
      }

      if (userRecord && !buyerProfile) {
        results.issues.push({
          type: "warning",
          message: "User has no BuyerProfile - may cause order routing issues"
        });
      }

      if (sellerProfile && buyerProfile) {
        results.issues.push({
          type: "info",
          message: "User is BOTH seller and buyer (this is OK - dual role supported)"
        });
      }

      if (orphanedOrders.length > 0) {
        results.issues.push({
          type: "error",
          message: `${orphanedOrders.length} orphaned orders found (no matching batch)`
        });
      }

      if (giviWins.length > giviOrders.length) {
        results.issues.push({
          type: "error",
          message: `User won ${giviWins.length} GIVIs but only has ${giviOrders.length} GIVI orders`
        });
      }

      if (giviOrdersWithoutEntry.length > 0) {
        results.issues.push({
          type: "warning",
          message: `${giviOrdersWithoutEntry.length} GIVI orders have no matching winning entry`
        });
      }

      console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
      console.log("📊 DIAGNOSTIC RESULTS:");
      console.log("   User ID:", userRecord?.id);
      console.log("   Has Seller Profile:", !!sellerProfile);
      console.log("   Has Buyer Profile:", !!buyerProfile);
      console.log("   GIVI Entries:", giviEntries.length);
      console.log("   GIVI Wins:", giviWins.length);
      console.log("   GIVI Orders:", giviOrders.length);
      console.log("   Total Orders:", orders.length);
      console.log("   Total Batches:", batches.length);
      console.log("   Orphaned Orders:", orphanedOrders.length);
      console.log("   Issues Found:", results.issues.length);
      console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

      setDiagnosticResults(results);
    } catch (error) {
      console.error("❌ Diagnostic failed:", error);
      setDiagnosticResults({
        error: error.message,
        issues: [{
          type: "error",
          message: `Diagnostic failed: ${error.message}`
        }]
      });
    }

    setLoading(false);
  };

  const createMissingBuyerProfile = async () => {
    if (!diagnosticResults?.userRecord || diagnosticResults?.buyerProfile) return;

    try {
      const userRecord = diagnosticResults.userRecord;
      
      await base44.entities.BuyerProfile.create({
        user_id: userRecord.id,
        full_name: userRecord.full_name || "Buyer",
        email: userRecord.email,
        phone: "",
        total_orders: 0,
        total_spent: 0
      });

      alert("✅ BuyerProfile created successfully! Rerun diagnostics.");
      runDiagnostics();
    } catch (error) {
      console.error("❌ Failed to create BuyerProfile:", error);
      alert(`Failed to create BuyerProfile: ${error.message}`);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-purple-50 to-blue-50 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold text-gray-900">GIVI Diagnostics Tool</h1>
          <p className="text-gray-600 mt-1">Debug buyer authentication, profile routing, and GIVI order issues</p>
        </div>

        {/* Search Section */}
        <Card className="border-0 shadow-lg">
          <CardHeader>
            <CardTitle>Search User</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-3">
              <div className="flex-1">
                <Input
                  value={searchEmail}
                  onChange={(e) => setSearchEmail(e.target.value)}
                  placeholder="Enter email address..."
                  className="text-lg"
                />
              </div>
              <Button
                onClick={runDiagnostics}
                disabled={!searchEmail || loading}
                className="bg-gradient-to-r from-purple-600 to-blue-500"
              >
                {loading ? (
                  <>
                    <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                    Scanning...
                  </>
                ) : (
                  <>
                    <Search className="w-4 h-4 mr-2" />
                    Run Diagnostics
                  </>
                )}
              </Button>
            </div>
            
            {user && (
              <p className="text-sm text-gray-600">
                Current user: <strong>{user.email}</strong> (ID: {user.id})
              </p>
            )}
          </CardContent>
        </Card>

        {/* Results */}
        {diagnosticResults && (
          <div className="space-y-6">
            {/* Issues Summary */}
            {diagnosticResults.issues && diagnosticResults.issues.length > 0 && (
              <Card className="border-0 shadow-lg">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <AlertTriangle className="w-5 h-5 text-orange-600" />
                    Issues Found ({diagnosticResults.issues.length})
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {diagnosticResults.issues.map((issue, idx) => (
                    <Alert key={idx} className={
                      issue.type === "error" ? "bg-red-50 border-red-200" :
                      issue.type === "warning" ? "bg-yellow-50 border-yellow-200" :
                      "bg-blue-50 border-blue-200"
                    }>
                      <div className="flex items-start gap-2">
                        {issue.type === "error" ? (
                          <XCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                        ) : issue.type === "warning" ? (
                          <AlertTriangle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
                        ) : (
                          <CheckCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                        )}
                        <AlertDescription className="text-sm">
                          {issue.message}
                        </AlertDescription>
                      </div>
                    </Alert>
                  ))}
                  
                  {/* Auto-fix for missing BuyerProfile */}
                  {diagnosticResults.userRecord && !diagnosticResults.buyerProfile && (
                    <Button
                      onClick={createMissingBuyerProfile}
                      className="w-full bg-green-600 hover:bg-green-700"
                    >
                      <User className="w-4 h-4 mr-2" />
                      Create Missing BuyerProfile
                    </Button>
                  )}
                </CardContent>
              </Card>
            )}

            {/* User Identity Card */}
            <Card className="border-0 shadow-lg">
              <CardHeader className="bg-gradient-to-r from-purple-100 to-blue-100">
                <CardTitle className="flex items-center gap-2">
                  <User className="w-5 h-5" />
                  User Identity
                </CardTitle>
              </CardHeader>
              <CardContent className="p-6">
                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm font-semibold text-gray-600 mb-1">User Record</p>
                    {diagnosticResults.userRecord ? (
                      <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                        <p className="text-sm"><strong>ID:</strong> {diagnosticResults.userRecord.id}</p>
                        <p className="text-sm"><strong>Email:</strong> {diagnosticResults.userRecord.email}</p>
                        <p className="text-sm"><strong>Name:</strong> {diagnosticResults.userRecord.full_name || "Not set"}</p>
                        <p className="text-sm"><strong>Role:</strong> {diagnosticResults.userRecord.role}</p>
                      </div>
                    ) : (
                      <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-800">
                        ❌ No user record found
                      </div>
                    )}
                  </div>

                  <div>
                    <p className="text-sm font-semibold text-gray-600 mb-1">Seller Profile</p>
                    {diagnosticResults.sellerProfile ? (
                      <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                        <p className="text-sm"><strong>ID:</strong> {diagnosticResults.sellerProfile.id}</p>
                        <p className="text-sm"><strong>Business:</strong> {diagnosticResults.sellerProfile.business_name}</p>
                        <p className="text-sm"><strong>Status:</strong> {diagnosticResults.sellerProfile.status}</p>
                        <p className="text-sm"><strong>Created By:</strong> {diagnosticResults.sellerProfile.created_by}</p>
                      </div>
                    ) : (
                      <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-sm text-gray-600">
                        No seller profile
                      </div>
                    )}
                  </div>

                  <div>
                    <p className="text-sm font-semibold text-gray-600 mb-1">Buyer Profile</p>
                    {diagnosticResults.buyerProfile ? (
                      <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                        <p className="text-sm"><strong>ID:</strong> {diagnosticResults.buyerProfile.id}</p>
                        <p className="text-sm"><strong>User ID:</strong> {diagnosticResults.buyerProfile.user_id}</p>
                        <p className="text-sm"><strong>Name:</strong> {diagnosticResults.buyerProfile.full_name}</p>
                        <p className="text-sm"><strong>Email:</strong> {diagnosticResults.buyerProfile.email}</p>
                      </div>
                    ) : (
                      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-sm text-yellow-800">
                        ⚠️ No buyer profile (may cause GIVI order routing issues)
                      </div>
                    )}
                  </div>

                  <div>
                    <p className="text-sm font-semibold text-gray-600 mb-1">ID Consistency Check</p>
                    {diagnosticResults.userRecord && diagnosticResults.buyerProfile && 
                     diagnosticResults.userRecord.id === diagnosticResults.buyerProfile.user_id ? (
                      <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                        <div className="flex items-center gap-2 text-green-700">
                          <CheckCircle className="w-5 h-5" />
                          <p className="text-sm font-semibold">IDs Match ✅</p>
                        </div>
                        <p className="text-xs text-gray-600 mt-1">
                          User.id = BuyerProfile.user_id
                        </p>
                      </div>
                    ) : (
                      <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                        <div className="flex items-center gap-2 text-red-700">
                          <XCircle className="w-5 h-5" />
                          <p className="text-sm font-semibold">ID Mismatch ❌</p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* GIVI Activity */}
            <Card className="border-0 shadow-lg">
              <CardHeader className="bg-gradient-to-r from-yellow-100 to-orange-100">
                <CardTitle className="flex items-center gap-2">
                  <Gift className="w-5 h-5" />
                  GIVI Activity
                </CardTitle>
              </CardHeader>
              <CardContent className="p-6">
                <div className="grid sm:grid-cols-3 gap-4 mb-6">
                  <div className="text-center p-4 bg-blue-50 rounded-lg">
                    <p className="text-3xl font-bold text-blue-600">{diagnosticResults.giviEntries.length}</p>
                    <p className="text-sm text-gray-600">Total Entries</p>
                  </div>
                  <div className="text-center p-4 bg-yellow-50 rounded-lg">
                    <p className="text-3xl font-bold text-yellow-600">{diagnosticResults.giviWins.length}</p>
                    <p className="text-sm text-gray-600">GIVI Wins</p>
                  </div>
                  <div className="text-center p-4 bg-green-50 rounded-lg">
                    <p className="text-3xl font-bold text-green-600">{diagnosticResults.giviOrders.length}</p>
                    <p className="text-sm text-gray-600">GIVI Orders</p>
                  </div>
                </div>

                {/* GIVI Entries List */}
                {diagnosticResults.giviEntries.length > 0 && (
                  <div className="mb-6">
                    <h4 className="font-semibold text-gray-900 mb-3">GIVI Entries</h4>
                    <div className="space-y-2 max-h-64 overflow-y-auto">
                      {diagnosticResults.giviEntries.map((entry) => (
                        <div key={entry.id} className={`p-3 rounded-lg border text-sm ${
                          entry.is_winner 
                            ? 'bg-yellow-50 border-yellow-300' 
                            : 'bg-gray-50 border-gray-200'
                        }`}>
                          <div className="flex items-center justify-between mb-1">
                            <Badge className={entry.is_winner ? "bg-yellow-500 text-white" : "bg-gray-500 text-white"}>
                              Entry #{entry.entry_number}
                            </Badge>
                            {entry.is_winner && (
                              <Badge className="bg-green-500 text-white">WINNER 🏆</Badge>
                            )}
                          </div>
                          <p className="text-xs text-gray-600">Event: {entry.givi_event_id}</p>
                          <p className="text-xs text-gray-600">User: {entry.user_name} ({entry.user_email})</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* GIVI Orders List */}
                {diagnosticResults.giviOrders.length > 0 && (
                  <div>
                    <h4 className="font-semibold text-gray-900 mb-3">GIVI Orders (FREE)</h4>
                    <div className="space-y-2 max-h-64 overflow-y-auto">
                      {diagnosticResults.giviOrders.map((order) => (
                        <div key={order.id} className="bg-green-50 border border-green-200 rounded-lg p-3 text-sm">
                          <div className="flex items-center justify-between mb-1">
                            <p className="font-semibold text-gray-900">{order.product_title}</p>
                            <Badge className="bg-green-600 text-white">$0.00</Badge>
                          </div>
                          <p className="text-xs text-gray-600">Order ID: {order.id}</p>
                          <p className="text-xs text-gray-600">Batch ID: {order.batch_id || "⚠️ MISSING"}</p>
                          <p className="text-xs text-gray-600">Buyer ID: {order.buyer_id}</p>
                          <p className="text-xs text-gray-600">Status: {order.status}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Orders & Batches */}
            <Card className="border-0 shadow-lg">
              <CardHeader className="bg-gradient-to-r from-green-100 to-emerald-100">
                <CardTitle className="flex items-center gap-2">
                  <ShoppingBag className="w-5 h-5" />
                  Orders & Batches
                </CardTitle>
              </CardHeader>
              <CardContent className="p-6">
                <div className="grid sm:grid-cols-2 gap-4 mb-6">
                  <div className="text-center p-4 bg-purple-50 rounded-lg">
                    <p className="text-3xl font-bold text-purple-600">{diagnosticResults.orders.length}</p>
                    <p className="text-sm text-gray-600">Total Orders</p>
                  </div>
                  <div className="text-center p-4 bg-blue-50 rounded-lg">
                    <p className="text-3xl font-bold text-blue-600">{diagnosticResults.batches.length}</p>
                    <p className="text-sm text-gray-600">Total Batches</p>
                  </div>
                </div>

                {/* Orphaned Orders Warning */}
                {diagnosticResults.orphanedOrders.length > 0 && (
                  <Alert className="bg-red-50 border-red-200 mb-4">
                    <XCircle className="w-5 h-5 text-red-600" />
                    <AlertDescription>
                      <strong>Orphaned Orders Detected:</strong> {diagnosticResults.orphanedOrders.length} order(s) have no matching batch
                      <div className="mt-2 space-y-1">
                        {diagnosticResults.orphanedOrders.map(order => (
                          <p key={order.id} className="text-xs font-mono">
                            • {order.product_title} (Order ID: {order.id})
                          </p>
                        ))}
                      </div>
                    </AlertDescription>
                  </Alert>
                )}

                {/* All Orders Summary */}
                {diagnosticResults.orders.length > 0 && (
                  <div className="space-y-2 max-h-96 overflow-y-auto">
                    <h4 className="font-semibold text-gray-900 mb-2">All Orders</h4>
                    {diagnosticResults.orders.map((order) => (
                      <div key={order.id} className={`p-3 rounded-lg border text-sm ${
                        order.price === 0 
                          ? 'bg-yellow-50 border-yellow-200' 
                          : 'bg-gray-50 border-gray-200'
                      }`}>
                        <div className="flex items-center justify-between mb-1">
                          <p className="font-semibold text-gray-900 line-clamp-1">{order.product_title}</p>
                          <Badge className={order.price === 0 ? "bg-yellow-500 text-white" : "bg-gray-500 text-white"}>
                            {order.price === 0 ? "FREE" : `$${order.price.toFixed(2)}`}
                          </Badge>
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-xs text-gray-600">
                          <p>Order: {order.id.substring(0, 8)}...</p>
                          <p>Batch: {order.batch_id ? order.batch_id.substring(0, 8) + "..." : "❌ NONE"}</p>
                          <p>Buyer: {order.buyer_id.substring(0, 8)}...</p>
                          <p>Status: {order.status}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Raw Data Export */}
            <Card className="border-0 shadow-lg">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Database className="w-5 h-5" />
                  Raw Data (for debugging)
                </CardTitle>
              </CardHeader>
              <CardContent>
                <details className="bg-gray-50 rounded-lg p-4">
                  <summary className="cursor-pointer font-semibold text-gray-900 mb-2">
                    View Full Diagnostic Data (JSON)
                  </summary>
                  <pre className="text-xs bg-white p-3 rounded border overflow-auto max-h-96">
                    {JSON.stringify(diagnosticResults, null, 2)}
                  </pre>
                </details>
              </CardContent>
            </Card>
          </div>
        )}

        {diagnosticResults === null && !loading && (
          <Card className="border-2 border-dashed border-gray-300">
            <CardContent className="p-12 text-center">
              <Search className="w-16 h-16 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Ready to Diagnose</h3>
              <p className="text-gray-600">
                Enter an email address above and click "Run Diagnostics" to check for GIVI routing issues
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}