import React, { useState } from "react";
import { supabaseApi as base44 } from "@/api/supabaseClient";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
import { Ban, Unlock, Search, AlertCircle } from "lucide-react";
import { format } from "date-fns";
import { Alert, AlertDescription } from "@/components/ui/alert";

export default function BannedBuyersManager({ sellerId }) {
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState("");
  const [unbanningBuyer, setUnbanningBuyer] = useState(null);

  const { data: bannedBuyers = [], isLoading } = useQuery({
    queryKey: ['seller-banned-buyers', sellerId],
    queryFn: () => base44.entities.SellerBannedBuyer.filter({ seller_id: sellerId }, '-banned_at'),
    enabled: !!sellerId
  });

  const unbanMutation = useMutation({
    mutationFn: (banId) => base44.entities.SellerBannedBuyer.delete(banId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['seller-banned-buyers'] });
      setUnbanningBuyer(null);
    },
  });

  const filteredBans = bannedBuyers.filter(ban =>
    ban.buyer_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    ban.buyer_email?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const banLevelColors = {
    show_only: "bg-yellow-100 text-yellow-800 border-yellow-200",
    purchase_ban: "bg-orange-100 text-orange-800 border-orange-200",
    full_block: "bg-red-100 text-red-800 border-red-200"
  };

  const banLevelLabels = {
    show_only: "Show Ban",
    purchase_ban: "Purchase Ban",
    full_block: "Full Block"
  };

  return (
    <div className="space-y-6">
      <Card className="shadow-lg border-0">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Ban className="w-6 h-6 text-red-600" />
              <CardTitle>Banned Buyers</CardTitle>
            </div>
            <Badge variant="secondary" className="text-lg">
              {bannedBuyers.length}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {bannedBuyers.length > 0 && (
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search banned buyers..."
                className="pl-10"
              />
            </div>
          )}

          {isLoading ? (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600 mx-auto"></div>
            </div>
          ) : filteredBans.length === 0 ? (
            <Alert className="bg-green-50 border-green-200">
              <AlertCircle className="h-4 w-4 text-green-600" />
              <AlertDescription className="text-green-800">
                {searchTerm ? "No banned buyers match your search." : "You haven't banned any buyers yet."}
              </AlertDescription>
            </Alert>
          ) : (
            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-gray-50">
                    <TableHead>Buyer</TableHead>
                    <TableHead>Ban Level</TableHead>
                    <TableHead>Banned On</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredBans.map((ban) => (
                    <TableRow key={ban.id}>
                      <TableCell>
                        <div>
                          <p className="font-semibold text-gray-900">{ban.buyer_name}</p>
                          <p className="text-sm text-gray-600">{ban.buyer_email}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge className={`${banLevelColors[ban.ban_level]} border`}>
                          {banLevelLabels[ban.ban_level]}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm text-gray-600">
                          {format(new Date(ban.banned_at || ban.created_date), "MMM d, yyyy")}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm text-gray-600">
                          {ban.reason || "No reason provided"}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setUnbanningBuyer(ban)}
                          className="text-green-600 border-green-200 hover:bg-green-50"
                        >
                          <Unlock className="w-4 h-4 mr-1" />
                          Unban
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={!!unbanningBuyer} onOpenChange={() => setUnbanningBuyer(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Unban Buyer?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove all restrictions for {unbanningBuyer?.buyer_name}. They will be able to view your profile, join your shows, and purchase from you again.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => unbanMutation.mutate(unbanningBuyer.id)}
              className="bg-green-600 hover:bg-green-700"
            >
              {unbanMutation.isPending ? "Unbanning..." : "Unban Buyer"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}