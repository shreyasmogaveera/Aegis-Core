import React, { useState, useEffect } from 'react';
import socketService from '../../services/socketService';

export const UserEmergencySOS = () => {
  const [sosSent, setSosSent] = useState(false);
  const [activeSos, setActiveSos] = useState(null);
  const [transmitting, setTransmitting] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    // Check if user already has active SOS beacon
    const baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:5000/api/v1';
    fetch(`${baseUrl}/user/sos`, {
      headers: { Authorization: `Bearer ${localStorage.getItem('aegis_token')}` }
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data && data.sosRequests && data.sosRequests.length > 0) {
          const active = data.sosRequests.find(
            (s) => s.status === 'PENDING' || s.status === 'RESPONDING' || s.status === 'IN_PROGRESS'
          );
          if (active) {
            setActiveSos(active);
            setSosSent(true);
          } else {
            setActiveSos(null);
            setSosSent(false);
          }
        } else {
          setActiveSos(null);
          setSosSent(false);
        }
      })
      .catch(() => {
        setActiveSos(null);
        setSosSent(false);
      });

    const unsubscribeUpdated = socketService.onSosUpdated((updatedSos) => {
      if (!updatedSos) return;
      setActiveSos((prevActive) => {
        if (prevActive && prevActive.id === updatedSos.id) {
          if (updatedSos.status === 'CANCELLED' || updatedSos.status === 'RESOLVED') {
            setSosSent(false);
            return null;
          }
          return updatedSos;
        }
        return prevActive;
      });
    });

    return () => {
      unsubscribeUpdated();
    };
  }, []);

  const triggerSOS = () => {
    setError(null);
    setTransmitting(true);

    const transmitData = (lat, lng) => {
      const baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:5000/api/v1';
      fetch(`${baseUrl}/user/sos`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('aegis_token')}`
        },
        body: JSON.stringify({
          latitude: lat,
          longitude: lng,
          emergencyType: 'FLOOD_TRAPPED',
          details: 'Immediate life safety distress beacon activated by citizen',
          address: 'Current GPS Location',
          district: 'Karnataka'
        })
      })
        .then((res) => {
          if (!res.ok) throw new Error('Failed to transmit SOS distress signal');
          return res.json();
        })
        .then((data) => {
          setActiveSos(data.sos);
          setSosSent(true);
          setTransmitting(false);
        })
        .catch((err) => {
          console.error('[UserEmergencySOS] Transmission error:', err);
          setError(err.message);
          setTransmitting(false);
        });
    };

    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          transmitData(position.coords.latitude, position.coords.longitude);
        },
        (err) => {
          console.warn('[UserEmergencySOS] Geolocation permission denied or unavailable:', err.message);
          setError('GPS location permission denied or unavailable. Real-time GPS location is required to transmit an emergency SOS beacon.');
          setTransmitting(false);
        },
        { enableHighAccuracy: true, timeout: 10000 }
      );
    } else {
      setError('Browser geolocation is not supported by your device.');
      setTransmitting(false);
    }
  };

  const cancelSOS = () => {
    if (!activeSos) {
      setSosSent(false);
      return;
    }

    const baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:5000/api/v1';
    fetch(`${baseUrl}/user/sos/${activeSos.id}/cancel`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${localStorage.getItem('aegis_token')}`
      }
    })
      .then((res) => {
        if (!res.ok) throw new Error('Failed to cancel SOS distress beacon on server');
        return res.json();
      })
      .then(() => {
        setActiveSos(null);
        setSosSent(false);
      })
      .catch((err) => {
        console.error('[UserEmergencySOS] Cancellation error:', err);
        setError(err.message);
        setActiveSos(null);
        setSosSent(false);
      });
  };

  return (
    <div className="flex-1 h-full overflow-hidden flex flex-col items-center justify-center p-6 md:p-8">
      {sosSent ? (
        <div className="glass-panel p-8 rounded-xl border border-error/40 flex flex-col items-center gap-5 max-w-lg w-full text-center relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-error/10 rounded-full blur-3xl -mr-10 -mt-10 pointer-events-none"></div>
          <div className="w-20 h-20 rounded-full bg-error/20 text-error flex items-center justify-center animate-pulse">
            <span className="material-symbols-outlined text-5xl">satellite_alt</span>
          </div>
          <h2 className="font-headline-lg text-error text-2xl font-bold tracking-tight">DISTRESS BEACON ACTIVE</h2>
          <p className="text-sm text-on-surface-variant max-w-sm leading-relaxed">
            Your live GPS coordinates have been transmitted directly to emergency response teams and rescue coordinators.
          </p>
          <div className="bg-surface-container p-4 rounded-lg text-left w-full font-data-mono text-sm text-on-surface space-y-2 border border-white/5">
            <div className="flex justify-between">
              <span className="text-on-surface-variant">BEACON STATUS:</span>
              <span className="text-error font-bold flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-error animate-pulse"></span> {activeSos?.status || 'BROADCASTING'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-on-surface-variant">COORDINATES:</span>
              <span>{activeSos?.coords || '12.4244° N, 75.7382° E'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-on-surface-variant">ESTIMATED ETA:</span>
              <span className="text-primary font-bold">~18 MINS</span>
            </div>
          </div>
          <button
            onClick={cancelSOS}
            className="w-full py-3 bg-transparent border border-white/10 text-on-surface-variant hover:text-white rounded-lg font-label-caps text-xs tracking-wider transition-colors"
          >
            CANCEL DISTRESS BEACON
          </button>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-8 max-w-md text-center">
          <div className="flex flex-col items-center gap-3">
            <div className="w-16 h-16 rounded-full bg-error/10 text-error flex items-center justify-center mb-1">
              <span className="material-symbols-outlined text-4xl">emergency</span>
            </div>
            <h1 className="font-headline-lg text-on-surface text-2xl md:text-3xl font-bold">Emergency SOS</h1>
            <p className="text-sm text-on-surface-variant max-w-xs leading-relaxed">
              Press the button below if you are in immediate life safety danger and require rescue extraction.
            </p>
          </div>

          {error && (
            <div className="bg-error/15 text-xs text-error px-4 py-2 rounded-lg border border-error/30 backdrop-blur-md font-data-mono">
              Transmission Alert: {error}
            </div>
          )}

          <button
            onClick={triggerSOS}
            disabled={transmitting}
            className="w-48 h-48 rounded-full bg-error text-white font-headline-lg font-bold text-3xl shadow-[0_0_60px_rgba(239,68,68,0.5)] hover:scale-105 active:scale-95 transition-all flex flex-col items-center justify-center gap-1 border-4 border-white/20 disabled:opacity-50"
          >
            <span>{transmitting ? 'SENDING' : 'SOS'}</span>
            <span className="text-[10px] font-label-caps font-normal tracking-widest uppercase">
              {transmitting ? 'LOCKING GPS...' : 'TRANSMIT GPS'}
            </span>
          </button>

          <p className="font-sans text-[11px] text-on-surface-variant/70">
            Automated location tracking and continuous signal broadcast will engage upon activation.
          </p>
        </div>
      )}
    </div>
  );
};
