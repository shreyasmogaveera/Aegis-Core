import React, { useEffect, useState } from 'react';
import socketService from '../../services/socketService';
import { AegisMap } from '../../components/map/AegisMap';

export const AdminShelterManagement = () => {
  const [data, setData] = useState({ metrics: {}, shelters: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filterText, setFilterText] = useState('');

  // Modal State for Add / Edit
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingShelter, setEditingShelter] = useState(null);

  // Form State
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [district, setDistrict] = useState('Kodagu');
  const [latitude, setLatitude] = useState(12.4244);
  const [longitude, setLongitude] = useState(75.7382);
  const [capacity, setCapacity] = useState(500);
  const [occupied, setOccupied] = useState(100);
  const [status, setStatus] = useState('OPEN');
  const [contactPhone, setContactPhone] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');
  const [confirmedCentroid, setConfirmedCentroid] = useState(false);
  const [showCentroidConfirm, setShowCentroidConfirm] = useState(false);

  const DISTRICT_DEFAULTS = {
    'Kodagu': { lat: 12.4244, lng: 75.7382 },
    'Uttara Kannada': { lat: 14.8153, lng: 74.6868 },
    'Belagavi': { lat: 15.8497, lng: 74.4977 },
    'Bagalkot': { lat: 16.1853, lng: 75.6868 }
  };

  const isUsingCentroid =
    district &&
    DISTRICT_DEFAULTS[district] &&
    Math.abs(Number(latitude) - DISTRICT_DEFAULTS[district].lat) < 0.0001 &&
    Math.abs(Number(longitude) - DISTRICT_DEFAULTS[district].lng) < 0.0001;

  const handleDistrictChange = (newDistrict) => {
    setDistrict(newDistrict);
    setConfirmedCentroid(false);
    setShowCentroidConfirm(false);
    if (!editingShelter && DISTRICT_DEFAULTS[newDistrict]) {
      setLatitude(DISTRICT_DEFAULTS[newDistrict].lat);
      setLongitude(DISTRICT_DEFAULTS[newDistrict].lng);
    }
  };

  const computeShelterMetrics = (shelters) => {
    let totalCapacity = 0;
    let totalOccupied = 0;
    let availableCount = 0;
    let nearCapacityCount = 0;
    let fullCount = 0;
    let closedCount = 0;

    shelters.forEach((s) => {
      totalCapacity += (s.capacity || 0);
      totalOccupied += (s.occupied || 0);

      if (s.status === 'OPEN') availableCount++;
      else if (s.status === 'NEAR_CAPACITY') nearCapacityCount++;
      else if (s.status === 'FULL') fullCount++;
      else if (s.status === 'CLOSED') closedCount++;
    });

    const utilizationPct = totalCapacity > 0 ? Math.round((totalOccupied / totalCapacity) * 100) : 0;

    return {
      totalCapacity,
      totalOccupied,
      totalAvailable: Math.max(0, totalCapacity - totalOccupied),
      utilizationPct,
      availableCount,
      nearCapacityCount,
      fullCount,
      closedCount,
      sheltersCount: shelters.length
    };
  };

  const fetchShelters = () => {
    setLoading(true);
    const baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:5000/api/v1';
    fetch(`${baseUrl}/admin/shelters`, {
      headers: {
        Authorization: `Bearer ${localStorage.getItem('aegis_token')}`
      }
    })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}: Failed to fetch admin shelters`);
        return res.json();
      })
      .then((resData) => {
        setData(resData);
        setLoading(false);
      })
      .catch((err) => {
        console.error('[AdminShelterManagement] Error:', err);
        setError(err.message);
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchShelters();

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
        return {
          metrics: computeShelterMetrics(updatedList),
          shelters: updatedList
        };
      });
    });

    return () => {
      unsubscribe();
    };
  }, []);

  const openAddModal = () => {
    setEditingShelter(null);
    setFormError('');
    setConfirmedCentroid(false);
    setShowCentroidConfirm(false);
    setName('');
    setAddress('');
    setDistrict('Kodagu');
    setLatitude(DISTRICT_DEFAULTS['Kodagu'].lat);
    setLongitude(DISTRICT_DEFAULTS['Kodagu'].lng);
    setCapacity(500);
    setOccupied(0);
    setStatus('OPEN');
    setContactPhone('');
    setShowAddModal(true);
  };

  const openEditModal = (shelter) => {
    setEditingShelter(shelter);
    setFormError('');
    setConfirmedCentroid(false);
    setShowCentroidConfirm(false);
    setName(shelter.name);
    setAddress(shelter.address);
    setDistrict(shelter.district);
    setLatitude(shelter.latitude !== undefined ? shelter.latitude : 12.4244);
    setLongitude(shelter.longitude !== undefined ? shelter.longitude : 75.7382);
    setCapacity(shelter.capacity);
    setOccupied(shelter.occupied);
    setStatus(shelter.status);
    setContactPhone(shelter.contactPhone || '');
    setShowAddModal(true);
  };

  const handleSaveShelter = (e) => {
    e.preventDefault();
    setFormError('');

    // Pre-flight Client Validation Safeguards
    const capNum = Number(capacity);
    const occNum = Number(occupied);
    const latNum = Number(latitude);
    const lngNum = Number(longitude);

    if (!name.trim() || name.trim().length < 3) {
      setFormError('Shelter name must be at least 3 characters long.');
      return;
    }
    if (!address.trim() || address.trim().length < 3) {
      setFormError('Address must be at least 3 characters long.');
      return;
    }
    if (isNaN(capNum) || capNum <= 0 || !Number.isInteger(capNum)) {
      setFormError('Capacity must be a positive integer greater than 0.');
      return;
    }
    if (isNaN(occNum) || occNum < 0 || !Number.isInteger(occNum)) {
      setFormError('Occupancy must be 0 or a positive whole integer.');
      return;
    }
    if (occNum > capNum) {
      setFormError('Occupied capacity cannot exceed total capacity.');
      return;
    }
    if (isNaN(latNum) || latNum < -90 || latNum > 90) {
      setFormError('Latitude must be a valid number between -90 and 90.');
      return;
    }
    if (isNaN(lngNum) || lngNum < -180 || lngNum > 180) {
      setFormError('Longitude must be a valid number between -180 and 180.');
      return;
    }

    // Require verification if saving with default district centroid
    if (!editingShelter && isUsingCentroid && !confirmedCentroid) {
      setFormError('Precise Facility Coordinates Required: Default district centroid coordinates detected. True citizen evacuation distances require verified building coordinates. Enter genuine building coordinates or check the confirmation box below.');
      setShowCentroidConfirm(true);
      return;
    }

    setSubmitting(true);
    const baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:5000/api/v1';

    const payload = {
      name: name.trim(),
      address: address.trim(),
      district: district.trim(),
      latitude: latNum,
      longitude: lngNum,
      capacity: capNum,
      occupied: occNum,
      status,
      contactPhone: contactPhone.trim()
    };

    const isEdit = Boolean(editingShelter);
    const url = isEdit ? `${baseUrl}/admin/shelters/${editingShelter.id}` : `${baseUrl}/admin/shelters`;
    const method = isEdit ? 'PUT' : 'POST';

    fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${localStorage.getItem('aegis_token')}`
      },
      body: JSON.stringify(payload)
    })
      .then((res) => {
        if (!res.ok) {
          return res.json().then((errData) => {
            throw new Error(errData.error || 'Failed to save shelter');
          });
        }
        return res.json();
      })
      .then(() => {
        setShowAddModal(false);
        setSubmitting(false);
        fetchShelters();
      })
      .catch((err) => {
        setFormError(err.message);
        setSubmitting(false);
      });
  };

  const filteredShelters = data.shelters.filter(
    (s) =>
      s.name.toLowerCase().includes(filterText.toLowerCase()) ||
      s.district.toLowerCase().includes(filterText.toLowerCase()) ||
      s.address.toLowerCase().includes(filterText.toLowerCase())
  );

  const metrics = data.metrics || {};

  return (
    <div className="flex-1 overflow-hidden p-6 z-10 flex gap-6 relative h-full min-h-0">
      {/* Left Column: Metrics */}
      <div className="w-72 flex flex-col gap-6 overflow-y-auto pr-2 custom-scrollbar shrink-0">
        <h2 className="font-headline-lg text-headline-lg text-on-surface m-0 tracking-tight">Shelter Ops</h2>

        {/* Total Capacity Card */}
        <div className="glass-panel p-panel-padding rounded-xl flex flex-col gap-4">
          <div className="flex justify-between items-center">
            <span className="font-label-caps text-label-caps text-on-surface-variant">Total Capacity</span>
            <span className="material-symbols-outlined text-primary">groups</span>
          </div>
          <div className="font-display-stat text-display-stat text-primary-fixed">
            {metrics.totalCapacity !== undefined ? metrics.totalCapacity.toLocaleString() : 0}
          </div>
          <div className="w-full bg-surface-variant h-1 rounded-full overflow-hidden mt-2">
            <div className="bg-primary h-full" style={{ width: `${metrics.utilizationPct || 0}%` }}></div>
          </div>
          <div className="font-data-mono text-data-mono text-on-surface-variant text-right">
            {metrics.utilizationPct || 0}% Utilized ({metrics.totalOccupied || 0} occupied)
          </div>
        </div>

        {/* Status Breakdown Card */}
        <div className="glass-panel p-panel-padding rounded-xl grid grid-cols-2 gap-4">
          <div>
            <div className="font-label-caps text-label-caps text-on-surface-variant mb-1 flex items-center gap-2">
              <span className="status-dot bg-primary"></span>Available
            </div>
            <div className="font-data-mono text-headline-md font-bold text-on-surface">{metrics.availableCount || 0}</div>
          </div>
          <div>
            <div className="font-label-caps text-label-caps text-on-surface-variant mb-1 flex items-center gap-2">
              <span className="status-dot bg-tertiary-container"></span>Near Cap
            </div>
            <div className="font-data-mono text-headline-md font-bold text-on-surface">{metrics.nearCapacityCount || 0}</div>
          </div>
          <div className="col-span-2 pt-2 border-t border-white/5">
            <div className={`font-label-caps text-label-caps mb-1 flex items-center gap-2 ${
              ((metrics.fullCount || 0) + (metrics.closedCount || 0)) > 0 ? 'text-error' : 'text-on-surface-variant'
            }`}>
              <span className={`status-dot ${
                ((metrics.fullCount || 0) + (metrics.closedCount || 0)) > 0 ? 'bg-error' : 'bg-on-surface-variant/40'
              }`}></span>Full / Closed
            </div>
            <div className={`font-data-mono text-headline-md font-bold ${
              ((metrics.fullCount || 0) + (metrics.closedCount || 0)) > 0 ? 'text-error' : 'text-on-surface-variant'
            }`}>
              {(metrics.fullCount || 0) + (metrics.closedCount || 0)}
            </div>
          </div>
        </div>

        {/* Add Shelter Button */}
        <button
          onClick={openAddModal}
          className="w-full bg-transparent border border-white/10 text-on-surface font-label-caps text-label-caps py-3 rounded-lg hover:bg-white/5 hover:border-primary/50 transition-all flex items-center justify-center gap-2 mt-auto cursor-pointer"
        >
          <span className="material-symbols-outlined">add</span> Add Shelter
        </button>
      </div>

      {/* Center Column: Map & Roster */}
      <div className="flex-1 flex flex-col gap-6 min-w-0 h-full">
        {/* Tactical Map */}
        <div className="glass-panel rounded-xl flex-1 relative overflow-hidden flex flex-col border border-white/10 shadow-[0_8px_32px_rgba(0,0,0,0.4)]">
          {/* Status Overlay */}
          <div className="absolute top-4 left-4 z-20 flex gap-2">
            <div className="status-chip text-primary">
              <span className="status-dot bg-primary"></span>Available ({metrics.availableCount || 0})
            </div>
            <div className="status-chip text-tertiary-container">
              <span className="status-dot bg-tertiary-container"></span>Near Cap ({metrics.nearCapacityCount || 0})
            </div>
            <div className="status-chip text-error bg-error/10">
              <span className="status-dot bg-error"></span>Full ({metrics.fullCount || 0})
            </div>
          </div>

          {/* Map Controls */}
          <div className="absolute top-4 right-4 z-20 bg-surface-container-low rounded p-1 border border-white/10 flex flex-col gap-1">
            <button className="p-1 hover:bg-white/10 rounded text-on-surface-variant">
              <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>add</span>
            </button>
            <button className="p-1 hover:bg-white/10 rounded text-on-surface-variant">
              <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>remove</span>
            </button>
          </div>

          {/* Faux Map Canvas replaced with real OpenStreetMap + Leaflet Map */}
          <div className="w-full h-full bg-[#101419] relative overflow-hidden">
            <AegisMap mode="shelters" />
          </div>
        </div>

        {/* Shelter Roster */}
        <div className="glass-panel h-64 rounded-xl flex flex-col overflow-hidden shrink-0">
          <div className="p-4 border-b border-white/10 flex justify-between items-center bg-white/5">
            <h3 className="font-data-mono text-data-mono text-on-surface m-0 uppercase tracking-wider">
              Active Roster ({metrics.sheltersCount || data.shelters.length} Total Shelters)
            </h3>
            <div className="flex gap-2">
              <input
                value={filterText}
                onChange={(e) => setFilterText(e.target.value)}
                className="bg-[#070A0F] border-b border-white/20 text-on-surface font-body-md text-body-md focus:border-primary focus:outline-none py-1 px-2 w-32 rounded-t text-sm h-8 font-data-mono"
                placeholder="Filter..."
                type="text"
              />
            </div>
          </div>

          <div className="flex-1 overflow-auto custom-scrollbar">
            {loading && (
              <div className="p-4 text-xs font-data-mono text-primary">Loading live shelter directory from MongoDB...</div>
            )}
            {error && (
              <div className="p-4 text-xs font-data-mono text-error">Failed to load shelters: {error}</div>
            )}
            {!loading && !error && (
              <table className="w-full text-left font-body-md text-sm border-collapse">
                <thead>
                  <tr className="text-on-surface-variant font-label-caps text-label-caps border-b border-white/10 sticky top-0 bg-[#181c21]">
                    <th className="p-3 font-normal">ID / Name</th>
                    <th className="p-3 font-normal">Zone / District</th>
                    <th className="p-3 font-normal text-right">Capacity (Occupied/Total)</th>
                    <th className="p-3 font-normal">Status</th>
                    <th className="p-3 font-normal text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredShelters.map((shelter) => {
                    const pct = shelter.capacity > 0 ? Math.round((shelter.occupied / shelter.capacity) * 100) : 0;
                    return (
                      <tr key={shelter.id} className="border-b border-white/5 hover:bg-white/5 transition-colors group">
                        <td className="p-3">
                          <div className="font-data-mono text-primary-fixed">{shelter.name}</div>
                          <div className="text-xs text-on-surface-variant">{shelter.address}</div>
                        </td>
                        <td className="p-3 text-on-surface">{shelter.district}</td>
                        <td className="p-3 text-right">
                          <span className="font-data-mono">
                            {shelter.occupied}/{shelter.capacity} ({shelter.availableCapacity} free)
                          </span>
                        </td>
                        <td className="p-3">
                          <span
                            className={`status-chip ${
                              shelter.status === 'OPEN'
                                ? 'text-primary'
                                : shelter.status === 'NEAR_CAPACITY'
                                ? 'text-tertiary-container'
                                : 'text-error bg-error/10'
                            }`}
                          >
                            <span
                              className={`status-dot ${
                                shelter.status === 'OPEN'
                                  ? 'bg-primary'
                                  : shelter.status === 'NEAR_CAPACITY'
                                  ? 'bg-tertiary-container'
                                  : 'bg-error'
                              }`}
                            ></span>
                            {shelter.status} ({pct}%)
                          </span>
                        </td>
                        <td className="p-3 text-right">
                          <button
                            onClick={() => openEditModal(shelter)}
                            className="text-primary hover:text-white transition-opacity px-2 py-1 bg-white/5 rounded border border-white/10"
                          >
                            <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>edit</span>
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      {/* Right Column: AI Insights */}
      <div className="w-80 flex flex-col gap-6 overflow-y-auto shrink-0 custom-scrollbar">
        <div className="glass-panel p-panel-padding rounded-xl border-l-2 border-l-[#a855f7]">
          <div className="flex items-center gap-2 mb-4 text-[#a855f7]">
            <span className="material-symbols-outlined">auto_awesome</span>
            <h3 className="font-label-caps text-label-caps m-0 uppercase">Shelter Capacity Intelligence</h3>
          </div>
          <p className="font-body-md text-sm text-on-surface mb-4">
            Shelter capacity and occupancy as registered in the system across active district facilities.
          </p>
          <div className="bg-[#0b0e13] p-3 rounded border border-white/10">
            <div className="flex justify-between text-xs text-on-surface-variant mb-1 font-data-mono">
              <span>Overall Utilization:</span>
              <span className="text-primary">{metrics.utilizationPct || 0}%</span>
            </div>
            <div className="w-full bg-surface-variant h-1 rounded-full overflow-hidden">
              <div className="bg-primary h-full" style={{ width: `${metrics.utilizationPct || 0}%` }}></div>
            </div>
          </div>
        </div>
      </div>

      {/* Add / Edit Shelter Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="glass-panel w-full max-w-lg rounded-xl p-6 border border-white/10 shadow-2xl max-h-[90vh] overflow-y-auto custom-scrollbar">
            <div className="flex justify-between items-center mb-4">
              <h2 className="font-headline-md text-lg font-bold text-on-surface flex items-center gap-2">
                <span className="material-symbols-outlined text-primary">domain</span>
                {editingShelter ? 'Edit Shelter Details' : 'Register New Shelter'}
              </h2>
              <button onClick={() => setShowAddModal(false)} className="text-on-surface-variant hover:text-on-surface">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            {formError && (
              <div className="mb-4 p-3 rounded-lg bg-error/15 border border-error/30 text-error text-xs font-semibold flex items-center gap-2">
                <span className="material-symbols-outlined text-base">error</span>
                <span>{formError}</span>
              </div>
            )}

            <form onSubmit={handleSaveShelter} className="space-y-4 text-xs font-data-mono">
              <div>
                <label className="block text-on-surface-variant mb-1 uppercase font-bold">Shelter Name</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Madikeri Relief Camp"
                  className="w-full bg-surface-container border border-white/10 rounded px-3 py-2 text-on-surface focus:outline-none focus:border-primary"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-on-surface-variant mb-1 uppercase font-bold">District</label>
                  <select
                    value={district}
                    onChange={(e) => handleDistrictChange(e.target.value)}
                    className="w-full bg-surface-container border border-white/10 rounded px-3 py-2 text-on-surface focus:outline-none focus:border-primary"
                  >
                    <option value="Kodagu">Kodagu</option>
                    <option value="Uttara Kannada">Uttara Kannada</option>
                    <option value="Belagavi">Belagavi</option>
                    <option value="Bagalkot">Bagalkot</option>
                  </select>
                </div>
                <div>
                  <label className="block text-on-surface-variant mb-1 uppercase font-bold">Status</label>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value)}
                    className="w-full bg-surface-container border border-white/10 rounded px-3 py-2 text-on-surface focus:outline-none focus:border-primary"
                  >
                    <option value="OPEN">OPEN</option>
                    <option value="NEAR_CAPACITY">NEAR CAPACITY</option>
                    <option value="FULL">FULL</option>
                    <option value="CLOSED">CLOSED</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-on-surface-variant mb-1 uppercase font-bold">Latitude (N)</label>
                  <input
                    type="number"
                    step="any"
                    required
                    value={latitude}
                    onChange={(e) => setLatitude(e.target.value)}
                    placeholder="e.g. 12.4244"
                    className="w-full bg-surface-container border border-white/10 rounded px-3 py-2 text-on-surface focus:outline-none focus:border-primary"
                  />
                </div>
                <div>
                  <label className="block text-on-surface-variant mb-1 uppercase font-bold">Longitude (E)</label>
                  <input
                    type="number"
                    step="any"
                    required
                    value={longitude}
                    onChange={(e) => setLongitude(e.target.value)}
                    placeholder="e.g. 75.7382"
                    className="w-full bg-surface-container border border-white/10 rounded px-3 py-2 text-on-surface focus:outline-none focus:border-primary"
                  />
                </div>
              </div>

              {/* Centroid Suggestion Advisory Callout */}
              {isUsingCentroid && (
                <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3 text-xs text-amber-200 flex flex-col gap-2">
                  <div className="flex items-start gap-2">
                    <span className="material-symbols-outlined text-base text-amber-400 shrink-0 mt-0.5">info</span>
                    <div>
                      <span className="font-semibold block text-amber-300">Suggestion Only: District Centroid Pre-filled</span>
                      These coordinates are the generic administrative centroid of {district}. Emergency dispatch and citizen evacuation distance calculations require the <strong>verified building address coordinates</strong> of the facility. Please enter genuine coordinates.
                    </div>
                  </div>
                  {showCentroidConfirm && (
                    <label className="flex items-center gap-2 mt-1 text-amber-100 cursor-pointer font-medium bg-amber-500/20 p-2 rounded border border-amber-500/40">
                      <input
                        type="checkbox"
                        checked={confirmedCentroid}
                        onChange={(e) => setConfirmedCentroid(e.target.checked)}
                        className="w-4 h-4 text-primary rounded"
                      />
                      <span>I confirm I want to save with centroid coordinates temporarily</span>
                    </label>
                  )}
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-on-surface-variant mb-1 uppercase font-bold">Total Capacity</label>
                  <input
                    type="number"
                    required
                    min="1"
                    value={capacity}
                    onChange={(e) => setCapacity(e.target.value)}
                    className="w-full bg-surface-container border border-white/10 rounded px-3 py-2 text-on-surface focus:outline-none focus:border-primary"
                  />
                </div>
                <div>
                  <label className="block text-on-surface-variant mb-1 uppercase font-bold">Occupied Count</label>
                  <input
                    type="number"
                    required
                    min="0"
                    max={capacity}
                    value={occupied}
                    onChange={(e) => setOccupied(e.target.value)}
                    className="w-full bg-surface-container border border-white/10 rounded px-3 py-2 text-on-surface focus:outline-none focus:border-primary"
                  />
                </div>
              </div>

              <div>
                <label className="block text-on-surface-variant mb-1 uppercase font-bold">Address</label>
                <input
                  type="text"
                  required
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="e.g. Town Hall Compound, Madikeri"
                  className="w-full bg-surface-container border border-white/10 rounded px-3 py-2 text-on-surface focus:outline-none focus:border-primary"
                />
              </div>

              <div>
                <label className="block text-on-surface-variant mb-1 uppercase font-bold">Contact Phone</label>
                <input
                  type="text"
                  value={contactPhone}
                  onChange={(e) => setContactPhone(e.target.value)}
                  placeholder="e.g. +91 8272228800"
                  className="w-full bg-surface-container border border-white/10 rounded px-3 py-2 text-on-surface focus:outline-none focus:border-primary"
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="flex-1 py-2.5 rounded bg-white/5 border border-white/10 hover:bg-white/10 font-bold"
                >
                  CANCEL
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 py-2.5 rounded bg-primary text-black font-bold hover:bg-primary-fixed disabled:opacity-50"
                >
                  {submitting ? 'SAVING...' : 'SAVE SHELTER'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
