import React, { useState } from 'react';
import { AegisMap } from '../../components/map/AegisMap';

export const AdminRiskMap = () => {
  const [selectedDistrict, setSelectedDistrict] = useState(null);

  return (
    <div className="flex-1 h-full overflow-hidden flex flex-col">
      {/* Header */}
      <header className="h-16 border-b border-white/10 flex items-center justify-between px-6 bg-surface/50 backdrop-blur-md shrink-0">
        <div className="flex items-center gap-4">
          <h1 className="font-headline-md text-xl font-bold text-on-surface flex items-center gap-2">
            <span className="material-symbols-outlined text-primary">travel_explore</span>
            Risk & Disaster Map
          </h1>
          <div className="flex items-center gap-2 bg-primary/10 px-3 py-1 rounded-full border border-primary/30">
            <span className="w-2 h-2 rounded-full bg-primary animate-pulse"></span>
            <span className="font-label-caps text-[10px] text-primary font-bold tracking-wider">DISASTER INTELLIGENCE</span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-surface-container px-3 py-1.5 rounded border border-white/5">
            <span className="material-symbols-outlined text-sm text-on-surface-variant">location_on</span>
            <span className="text-xs font-data-mono">
              {selectedDistrict ? selectedDistrict.toUpperCase() : 'KARNATAKA REGION'}
            </span>
          </div>
        </div>
      </header>

      {/* Full Map Area */}
      <div className="flex-1 relative overflow-hidden">
        <div className="absolute inset-0">
          <AegisMap
            mode="risk"
            selectedDistrict={selectedDistrict}
            onSelectDistrict={(districtName) => setSelectedDistrict(districtName)}
          />
        </div>
      </div>
    </div>
  );
};
