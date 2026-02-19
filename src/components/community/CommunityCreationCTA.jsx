import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Sparkles } from "lucide-react";

export default function CommunityCreationCTA() {
  return (
    <section className="mt-12">
      <Card className="border-0 bg-gradient-to-r from-blue-600 via-purple-600 to-blue-600 overflow-hidden">
        <CardContent className="p-8 sm:p-12 relative">
          <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZGVmcz48cGF0dGVybiBpZD0iZ3JpZCIgd2lkdGg9IjQwIiBoZWlnaHQ9IjQwIiBwYXR0ZXJuVW5pdHM9InVzZXJTcGFjZU9uVXNlIj48cGF0aCBkPSJNIDQwIDAgTCAwIDAgMCA0MCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSJ3aGl0ZSIgc3Ryb2tlLW9wYWNpdHk9IjAuMSIgc3Ryb2tlLXdpZHRoPSIxIi8+PC9wYXR0ZXJuPjwvZGVmcz48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSJ1cmwoI2dyaWQpIi8+PC9zdmc+')] opacity-20"></div>
          <div className="relative text-center">
            <Sparkles className="w-12 h-12 text-white mx-auto mb-4" />
            <h2 className="text-2xl sm:text-4xl font-bold text-white mb-4">
              Want to create your own community?
            </h2>
            <p className="text-lg sm:text-xl text-white/90 mb-6">
              Community creation is coming soon! Join existing communities while we build this feature.
            </p>
            <Badge className="bg-white/20 text-white border-white/50 border text-sm px-4 py-2">
              Coming Soon
            </Badge>
          </div>
        </CardContent>
      </Card>
    </section>
  );
}
