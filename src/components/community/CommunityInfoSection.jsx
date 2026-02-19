import React from "react";
import { Card, CardContent } from "@/components/ui/card";

export default function CommunityInfoSection() {
  return (
    <section>
      <Card className="border-0 shadow-xl">
        <CardContent className="p-8">
          <h3 className="text-2xl font-bold text-gray-900 mb-4">What are Communities?</h3>
          <div className="space-y-4 text-gray-700">
            <p className="leading-relaxed">
              <strong>Communities</strong> are themed marketplaces within myneighbor.live where you can discover shows, sellers, and products specific to your interests. Whether you're into vintage treasures, local yard sales, or specialty stores, there's a community for you.
            </p>
            <p className="leading-relaxed">
              <strong>Follow communities</strong> to get notifications when sellers in those communities go live. Each community represents a unique shopping experience with its own vibe and product selection.
            </p>
            <p className="leading-relaxed">
              <strong>Future expansion:</strong> Soon, communities will have their own dedicated subdomains (like openhouses.live, yardsales.live) and advanced features like community-specific events, leaderboards, and exclusive deals.
            </p>
          </div>
        </CardContent>
      </Card>
    </section>
  );
}
