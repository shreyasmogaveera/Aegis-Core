import React from 'react';
import { AegisMap } from '../../components/map/AegisMap';

export const UserRiskMap = () => (
  <div className="flex-1 h-full overflow-hidden flex flex-col">
    {/* Header */}
    <header className="h-16 border-b border-white/10 flex items-center justify-between px-6 bg-surface/50 backdrop-blur-md shrink-0">
      <div className="flex items-center gap-4">
        <h1 className="font-headline-md text-xl font-bold text-on-surface flex items-center gap-2">
          <span className="material-symbols-outlined text-primary">map</span>
          Citizen Safety Risk Map
        </h1>
        <span className="bg-primary/10 text-primary font-label-caps text-[10px] px-2.5 py-1 rounded-full font-bold">
          LIVE OVERLAY
        </span>
      </div>
      <div className="flex items-center gap-2 bg-surface-container px-3 py-1.5 rounded border border-white/5">
        <span className="material-symbols-outlined text-sm text-on-surface-variant">my_location</span>
        <span className="text-xs font-data-mono">KARNATAKA SECTORS</span>
      </div>
    </header>

    {/* Map View */}
    <div className="flex-1 relative overflow-hidden">
      <div className="absolute inset-0">
        <AegisMap mode="user" />
      </div>
    </div>
  </div>
);
