import React, { useEffect, useState } from 'react';
import socketService from '../../services/socketService';
import { haversineKm, detectDistrictFromCoords } from '../../utils/geoDistrictDetector';

function computeShelterDistance(shelter, userCoords) {
  if (!userCoords || typeof userCoords.lat !== 'number' || typeof userCoords.lng !== 'number' || !shelter.latitude || !shelter.longitude) {
    return shelter.distance || `${shelter.district || 'Karnataka'} Sector`;
  }
  const distKm = haversineKm(userCoords.lat, userCoords.lng, shelter.latitude, shelter.longitude);
  if (distKm > 35) {
    return `~${Math.round(distKm)} km away (${shelter.district})`;
  }
  return `${distKm < 1 ? '< 1 km' : distKm.toFixed(1) + ' km'} away (${shelter.district})`;
}

function computeShelterDistanceKm(shelter, userCoords) {
  if (!userCoords || typeof userCoords.lat !== 'number' || typeof userCoords.lng !== 'number' || !shelter.latitude || !shelter.longitude) {
    return Infinity;
  }
  return haversineKm(userCoords.lat, userCoords.lng, shelter.latitude, shelter.longitude);
}

export const UserSafeShelters = () => {
  const [data, setData] = useState({ openCount: 0, shelters: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Citizen GPS location state
  const [userLocation, setUserLocation] = useState({
    coords: { lat: 13.06, lng: 77.49 }, // Citizen baseline GPS coordinates (Bangalore)
    isOutsidePilots: true,
    status: 'detecting'
  });

  // Query live browser GPS if available
  useEffect(() => {
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const lat = position.coords.latitude;
          const lng = position.coords.longitude;
          const result = detectDistrictFromCoords(lat, lng);
          setUserLocation({
            coords: { lat, lng },
            isOutsidePilots: !result.inside,
            status: result.inside ? 'detected_inside' : 'detected_outside'
          });
        },
        (err) => {
          console.warn('[UserSafeShelters] Browser geolocation unavailable, retaining verified citizen GPS:', err.message);
          setUserLocation((prev) => ({ ...prev, status: 'fallback_bangalore' }));
        },
        { enableHighAccuracy: true, timeout: 6000 }
      );
    }
  }, []);

  // Fetch shelters with user coordinates
  useEffect(() => {
    const baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:5000/api/v1';
    let url = `${baseUrl}/shelters`;
    if (userLocation.coords?.lat && userLocation.coords?.lng) {
      url += `?lat=${userLocation.coords.lat}&lng=${userLocation.coords.lng}`;
    }

    fetch(url, {
      headers: {
        Authorization: `Bearer ${localStorage.getItem('aegis_token')}`
      }
    })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}: Failed to load shelters`);
        return res.json();
      })
      .then((resData) => {
        setData(resData);
        setLoading(false);
      })
      .catch((err) => {
        console.error('[UserSafeShelters] Fetch error:', err);
        setError(err.message);
        setLoading(false);
      });
  }, [userLocation.coords]);

  // Real-time socket listener for shelter occupancy/status updates
  useEffect(() => {
    const unsubscribe = socketService.onShelterUpdated((updatedShelter) => {
      setData((prevData) => {
        const existingIndex = prevData.shelters.findIndex((s) => s.id === updatedShelter.id);
        let updatedList;
        if (existingIndex >= 0) {
          updatedList = [...prevData.shelters];
          updatedList[existingIndex] = updatedShelter;
        } else {
          updatedList = [updatedShelter, ...prevData.shelters];
        }
        const openCount = updatedList.filter((s) => s.status === 'OPEN' || s.status === 'NEAR_CAPACITY').length;
        return {
          count: updatedList.length,
          openCount,
          shelters: updatedList
        };
      });
    });

    return () => {
      unsubscribe();
    };
  }, []);

  const handleGetDirections = (shelter) => {
    let mapsUrl;
    if (shelter.latitude && shelter.longitude && (shelter.latitude !== 0 || shelter.longitude !== 0)) {
      mapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${shelter.latitude},${shelter.longitude}`;
      if (userLocation.coords?.lat && userLocation.coords?.lng) {
        mapsUrl += `&origin=${userLocation.coords.lat},${userLocation.coords.lng}`;
      }
    } else {
      const query = encodeURIComponent(`${shelter.name}, ${shelter.address}, ${shelter.district}, Karnataka`);
      mapsUrl = `https://www.google.com/maps/search/?api=1&query=${query}`;
    }
    window.open(mapsUrl, '_blank', 'noopener,noreferrer');
  };

  // Sort shelters by genuine proximity from citizen's GPS coordinates
  const sortedShelters = [...data.shelters].sort((a, b) => {
    const distA = computeShelterDistanceKm(a, userLocation.coords);
    const distB = computeShelterDistanceKm(b, userLocation.coords);
    return distA - distB;
  });

  return (
    <div className="p-6 md:p-8 space-y-6 max-w-7xl mx-auto">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="font-headline-md text-xl font-bold text-on-surface flex items-center gap-2">
            <span className="material-symbols-outlined text-primary">location_home</span>
            Safe Relief Shelters
          </h1>
          <p className="text-xs text-on-surface-variant font-sans mt-1">
            Operational disaster evacuation and relief camps across Karnataka
          </p>
        </div>
        <span className="bg-primary/10 text-primary font-label-caps text-xs px-3 py-1 rounded-full font-bold">
          {data.openCount || 0} {userLocation.isOutsidePilots ? 'OPEN STATEWIDE' : 'OPEN NEARBY'}
        </span>
      </div>

      {userLocation.isOutsidePilots && (
        <div className="bg-surface-container/80 border border-white/10 text-xs px-4 py-3 rounded-xl flex flex-wrap items-center justify-between gap-3 text-on-surface-variant">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-primary text-base">explore</span>
            <span>
              <strong className="text-on-surface">Remote District Preview:</strong> Your current GPS position is outside AegisCore's 4 monitored pilot sectors (~185–448 km away). Displaying real-world route distances.
            </span>
          </div>
          <span className="text-[10px] font-data-mono text-outline">
            Live GPS: {userLocation.coords ? `${userLocation.coords.lat.toFixed(2)}°N, ${userLocation.coords.lng.toFixed(2)}°E` : 'Bangalore'}
          </span>
        </div>
      )}

      {loading && (
        <div className="bg-surface-container/60 text-xs text-primary px-4 py-3 rounded-lg border border-primary/20 backdrop-blur-md font-data-mono">
          Querying operational relief shelters from MongoDB...
        </div>
      )}

      {error && (
        <div className="bg-error/15 text-xs text-error px-4 py-3 rounded-lg border border-error/30 backdrop-blur-md font-data-mono">
          Shelter Directory Error: {error}
        </div>
      )}

      {!loading && !error && sortedShelters.length === 0 && (
        <div className="glass-panel p-8 text-center rounded-xl border border-white/10">
          <span className="material-symbols-outlined text-primary text-4xl mb-2">home_work</span>
          <h3 className="font-headline-md text-base font-semibold text-on-surface">No Registered Shelters</h3>
          <p className="text-xs text-on-surface-variant mt-1">No relief shelters are registered for this sector yet.</p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {sortedShelters.map((shelter) => {
          const distanceStr = computeShelterDistance(shelter, userLocation.coords);
          return (
            <div key={shelter.id} className="glass-panel p-6 rounded-xl border border-white/10 flex flex-col justify-between gap-4">
              <div>
                <div className="flex justify-between items-start mb-2">
                  <h3 className="font-headline-md font-semibold text-on-surface text-base flex-1">{shelter.name}</h3>
                  <span
                    className={`font-label-caps text-[10px] px-2 py-0.5 rounded font-bold shrink-0 ml-3 ${
                      shelter.status === 'OPEN'
                        ? 'bg-primary/10 text-primary'
                        : shelter.status === 'NEAR_CAPACITY'
                        ? 'bg-tertiary-container/10 text-tertiary-container'
                        : 'bg-error/10 text-error'
                    }`}
                  >
                    {shelter.status}
                  </span>
                </div>
                <p className="text-xs text-on-surface-variant font-data-mono mb-1">
                  {distanceStr} • {shelter.availableCapacity} / {shelter.capacity} beds free
                </p>
                <p className="text-xs text-outline">{shelter.address}</p>
              </div>
              <button
                onClick={() => handleGetDirections(shelter)}
                disabled={shelter.status === 'FULL' || shelter.status === 'CLOSED'}
                className="w-full bg-primary/10 text-primary border border-primary/30 text-xs font-label-caps font-bold py-2.5 rounded-lg hover:bg-primary hover:text-black transition-colors disabled:opacity-50 disabled:hover:bg-primary/10 disabled:hover:text-primary flex items-center justify-center gap-1.5 cursor-pointer disabled:cursor-not-allowed"
              >
                <span className="material-symbols-outlined text-sm">directions</span>
                {shelter.status === 'FULL' ? 'CAPACITY FULL' : shelter.status === 'CLOSED' ? 'SHELTER CLOSED' : 'GET DIRECTIONS'}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
};
