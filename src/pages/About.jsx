import React from "react";

export default function About() {
  return (
    <div className="relative min-h-screen pb-20 overflow-hidden">
      {/* Background Image */}
      <div
        className="absolute inset-0 bg-cover bg-center border-4 border-red-500"
        style={{
          backgroundImage: "url('https://dpdrkbinnebyksuezgq.supabase.co/storage/v1/object/public/seller-images/06acba31-f911-4dac-9aa0-94a2627484a5.jpg')"
        }}
      />

      {/* Dark Overlay */}
      <div className="absolute inset-0 bg-gradient-to-b from-black/70 via-black/60 to-black/70" />

      <div className="relative z-10 max-w-4xl mx-auto px-4 py-8 space-y-8">

        {/* Hero Section */}
        <div className="text-center space-y-3">
          <h1 className="text-3xl sm:text-4xl font-bold text-white">
            What is MyNeighbor.Live?
          </h1>
          <p className="text-gray-200 text-base sm:text-lg">
            Just neighbors doing business with neighbors — Arizona local, live, and personal.
          </p>
        </div>

        {/* About Section */}
        <div className="bg-white rounded-xl shadow-sm p-6 space-y-4">
          <h2 className="text-xl font-semibold text-gray-800">
            Built for Arizona
          </h2>
          <p className="text-gray-600">
            MyNeighbor.Live connects local buyers and sellers across Arizona through live commerce,
            direct messaging, and in-person pickup. No shipping. No middlemen.
            Just real connections in your community.
          </p>
        </div>

        {/* How It Works */}
        <div className="bg-white rounded-xl shadow-sm p-6 space-y-4">
          <h2 className="text-xl font-semibold text-gray-800">
            How It Works
          </h2>
          <ul className="space-y-2 text-gray-600 list-disc list-inside">
            <li>Go live and showcase your products.</li>
            <li>Buyers join, chat, and interact in real time.</li>
            <li>Secure checkout through the platform.</li>
            <li>Local pickup — simple and safe.</li>
          </ul>
        </div>

        {/* Community Focus */}
        <div className="bg-white rounded-xl shadow-sm p-6 space-y-4">
          <h2 className="text-xl font-semibold text-gray-800">
            Support Your Local Community
          </h2>
          <p className="text-gray-600">
            Every purchase supports Arizona entrepreneurs, creators, and families.
            We believe commerce should feel exciting, transparent, and neighborly.
          </p>
        </div>

      </div>
    </div>
  );
}
