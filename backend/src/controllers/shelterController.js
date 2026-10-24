const Shelter = require('../models/Shelter');
const socketService = require('../services/socketService');


class ShelterController {
  /**
   * Helper to compute/normalize shelter status based on capacity & admin settings
   */
  determineStatus(capacity, occupied, currentStatus) {
    if (currentStatus === 'CLOSED') {
      return 'CLOSED';
    }
    if (occupied >= capacity) {
      return 'FULL';
    }
    if (capacity > 0 && occupied / capacity >= 0.85) {
      return 'NEAR_CAPACITY';
    }
    return 'OPEN';
  }

  /**
   * Helper to format shelter document for API responses
   */
  formatShelter(shelter, userCoords = null) {
    const totalCap = shelter.capacity || 0;
    const occupiedCap = shelter.occupied || 0;
    const availableCap = Math.max(0, totalCap - occupiedCap);
    const calculatedStatus = this.determineStatus(totalCap, occupiedCap, shelter.status);

    const coords = shelter.location && shelter.location.coordinates ? shelter.location.coordinates : [0, 0];
    const shLat = coords[1];
    const shLng = coords[0];

    let distanceStr = `${shelter.district} Sector`;
    let distanceKm = null;

    if (userCoords && typeof userCoords.lat === 'number' && typeof userCoords.lng === 'number' && (shLat !== 0 || shLng !== 0)) {
      const R = 6371;
      const dLat = ((shLat - userCoords.lat) * Math.PI) / 180;
      const dLon = ((shLng - userCoords.lng) * Math.PI) / 180;
      const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos((userCoords.lat * Math.PI) / 180) *
          Math.cos((shLat * Math.PI) / 180) *
          Math.sin(dLon / 2) *
          Math.sin(dLon / 2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      distanceKm = R * c;
      if (distanceKm > 35) {
        distanceStr = `~${Math.round(distanceKm)} km away (${shelter.district})`;
      } else {
        distanceStr = `${distanceKm < 1 ? '< 1 km' : distanceKm.toFixed(1) + ' km'} away (${shelter.district})`;
      }
    }

    return {
      id: shelter._id.toString(),
      name: shelter.name,
      address: shelter.address,
      district: shelter.district,
      latitude: shLat,
      longitude: shLng,
      location: shelter.location,
      capacity: totalCap,
      occupied: occupiedCap,
      availableCapacity: availableCap,
      freeBeds: availableCap,
      status: calculatedStatus,
      contactPhone: shelter.contactPhone || '',
      facilities: shelter.facilities || [],
      distance: distanceStr,
      distanceKm: distanceKm !== null ? Number(distanceKm.toFixed(1)) : null,
      createdAt: shelter.createdAt,
      updatedAt: shelter.updatedAt
    };
  }

  /**
   * Public / Authenticated Users: GET /api/v1/shelters
   */
  async getPublicShelters(req, res) {
    try {
      const { district, status, lat, lng } = req.query || {};
      const query = {
        isTest: { $ne: true },
        source: { $ne: 'test' },
        name: { $not: /E2E/i }
      };

      if (district) {
        query.district = new RegExp(district, 'i');
      }
      if (status) {
        query.status = status.toUpperCase();
      }

      let userCoords = null;
      if (lat !== undefined && lng !== undefined && !isNaN(Number(lat)) && !isNaN(Number(lng))) {
        userCoords = { lat: Number(lat), lng: Number(lng) };
      }

      const shelters = await Shelter.find(query).sort({ name: 1 });
      const formattedShelters = shelters.map((s) => this.formatShelter(s, userCoords));

      if (userCoords) {
        formattedShelters.sort((a, b) => {
          if (a.distanceKm === null) return 1;
          if (b.distanceKm === null) return -1;
          return a.distanceKm - b.distanceKm;
        });
      }

      const openCount = formattedShelters.filter((s) => s.status === 'OPEN' || s.status === 'NEAR_CAPACITY').length;

      return res.status(200).json({
        count: formattedShelters.length,
        openCount,
        shelters: formattedShelters
      });
    } catch (err) {
      console.error('[ShelterController.getPublicShelters] Error:', err);
      return res.status(500).json({ error: 'Failed to retrieve shelters' });
    }
  }

  /**
   * Public / Authenticated Users: GET /api/v1/shelters/:id
   */
  async getShelterById(req, res) {
    try {
      const shelter = await Shelter.findById(req.params.id);
      if (!shelter) {
        return res.status(404).json({ error: 'Shelter not found' });
      }

      return res.status(200).json(this.formatShelter(shelter));
    } catch (err) {
      console.error('[ShelterController.getShelterById] Error:', err);
      return res.status(500).json({ error: 'Failed to retrieve shelter details' });
    }
  }

  /**
   * Admin: GET /api/v1/admin/shelters
   */
  async getAdminShelters(req, res) {
    try {
      const query = {
        isTest: { $ne: true },
        source: { $ne: 'test' },
        name: { $not: /E2E/i }
      };
      const shelters = await Shelter.find(query).sort({ createdAt: -1 });
      const formattedShelters = shelters.map((s) => this.formatShelter(s));

      let totalCapacity = 0;
      let totalOccupied = 0;
      let availableCount = 0;
      let nearCapacityCount = 0;
      let fullCount = 0;
      let closedCount = 0;

      formattedShelters.forEach((s) => {
        totalCapacity += s.capacity;
        totalOccupied += s.occupied;

        if (s.status === 'OPEN') availableCount++;
        else if (s.status === 'NEAR_CAPACITY') nearCapacityCount++;
        else if (s.status === 'FULL') fullCount++;
        else if (s.status === 'CLOSED') closedCount++;
      });

      const utilizationPct = totalCapacity > 0 ? Math.round((totalOccupied / totalCapacity) * 100) : 0;

      return res.status(200).json({
        metrics: {
          totalCapacity,
          totalOccupied,
          totalAvailable: Math.max(0, totalCapacity - totalOccupied),
          utilizationPct,
          availableCount,
          nearCapacityCount,
          fullCount,
          closedCount
        },
        shelters: formattedShelters
      });
    } catch (err) {
      console.error('[ShelterController.getAdminShelters] Error:', err);
      return res.status(500).json({ error: 'Failed to retrieve admin shelters' });
    }
  }

  /**
   * District default coordinates for automated geo-referencing
   */
  getDistrictCentroid(district) {
    const centroids = {
      'Kodagu': [75.7382, 12.4244],
      'Uttara Kannada': [74.6868, 14.8153],
      'Belagavi': [74.4977, 15.8497],
      'Bagalkot': [75.6868, 16.1853]
    };
    return centroids[district] || [75.7382, 12.4244];
  }

  /**
   * Admin: POST /api/v1/admin/shelters
   */
  async createShelter(req, res) {
    try {
      const {
        name,
        address,
        district,
        location,
        latitude,
        longitude,
        capacity,
        occupied,
        status,
        contactPhone,
        facilities
      } = req.body;

      if (!name || !name.trim() || !address || !address.trim() || !district || !district.trim() || capacity === undefined) {
        return res.status(400).json({
          error: 'Name, address, district, and total capacity are required'
        });
      }

      const totalCap = Number(capacity);
      if (isNaN(totalCap) || totalCap <= 0 || !Number.isInteger(totalCap)) {
        return res.status(400).json({
          error: 'Total capacity must be a positive whole integer greater than 0'
        });
      }

      const occupiedCap = occupied !== undefined ? Number(occupied) : 0;
      if (isNaN(occupiedCap) || occupiedCap < 0 || !Number.isInteger(occupiedCap)) {
        return res.status(400).json({
          error: 'Occupied count must be a non-negative whole integer'
        });
      }

      if (occupiedCap > totalCap) {
        return res.status(400).json({
          error: 'Occupied count cannot exceed total capacity'
        });
      }

      // Resolve Coordinates: user supplied lat/lng or district centroid fallback
      let coords = this.getDistrictCentroid(district.trim());
      if (longitude !== undefined && latitude !== undefined && String(longitude).trim() !== '' && String(latitude).trim() !== '') {
        const lngNum = Number(longitude);
        const latNum = Number(latitude);
        if (isNaN(lngNum) || isNaN(latNum) || latNum < -90 || latNum > 90 || lngNum < -180 || lngNum > 180) {
          return res.status(400).json({
            error: 'Invalid coordinates: Latitude must be between -90 and 90, Longitude between -180 and 180'
          });
        }
        coords = [lngNum, latNum];
      } else if (location && Array.isArray(location.coordinates) && location.coordinates.length === 2) {
        coords = location.coordinates;
      }

      const calculatedStatus = this.determineStatus(totalCap, occupiedCap, status);

      const isTestSignal = Boolean(
        req.body.isTest ||
        req.body.source === 'test' ||
        (name && String(name).toLowerCase().includes('e2e')) ||
        (address && String(address).toLowerCase().includes('e2e'))
      );

      const newShelter = await Shelter.create({
        name: name.trim(),
        address: address.trim(),
        district: district.trim(),
        location: { type: 'Point', coordinates: coords },
        capacity: totalCap,
        occupied: occupiedCap,
        status: calculatedStatus,
        contactPhone: contactPhone ? String(contactPhone).trim() : '',
        facilities: Array.isArray(facilities) ? facilities : ['Food', 'Water', 'Medical Care'],
        isTest: isTestSignal,
        source: req.body.source || (isTestSignal ? 'test' : 'admin')
      });

      const formattedShelter = this.formatShelter(newShelter);
      socketService.notifyShelterUpdated(formattedShelter);

      return res.status(201).json({
        message: 'Shelter created successfully',
        shelter: formattedShelter
      });
    } catch (err) {
      console.error('[ShelterController.createShelter] Error:', err);
      return res.status(500).json({ error: 'Failed to create shelter: ' + err.message });
    }
  }

  /**
   * Admin: PUT /api/v1/admin/shelters/:id
   */
  async updateShelter(req, res) {
    try {
      const { id } = req.params;
      const updateData = req.body;

      const existing = await Shelter.findById(id);
      if (!existing) {
        return res.status(404).json({ error: 'Shelter not found' });
      }

      const totalCap = updateData.capacity !== undefined ? Number(updateData.capacity) : existing.capacity;
      if (isNaN(totalCap) || totalCap <= 0 || !Number.isInteger(totalCap)) {
        return res.status(400).json({
          error: 'Total capacity must be a positive whole integer greater than 0'
        });
      }

      const occupiedCap = updateData.occupied !== undefined ? Number(updateData.occupied) : existing.occupied;
      if (isNaN(occupiedCap) || occupiedCap < 0 || !Number.isInteger(occupiedCap)) {
        return res.status(400).json({
          error: 'Occupied count must be a non-negative whole integer'
        });
      }

      if (occupiedCap > totalCap) {
        return res.status(400).json({
          error: 'Occupied capacity cannot exceed total capacity'
        });
      }

      updateData.capacity = totalCap;
      updateData.occupied = occupiedCap;

      if (updateData.longitude !== undefined && updateData.latitude !== undefined && String(updateData.longitude).trim() !== '' && String(updateData.latitude).trim() !== '') {
        const lngNum = Number(updateData.longitude);
        const latNum = Number(updateData.latitude);
        if (isNaN(lngNum) || isNaN(latNum) || latNum < -90 || latNum > 90 || lngNum < -180 || lngNum > 180) {
          return res.status(400).json({
            error: 'Invalid coordinates: Latitude must be between -90 and 90, Longitude between -180 and 180'
          });
        }
        updateData.location = {
          type: 'Point',
          coordinates: [lngNum, latNum]
        };
      }

      const targetStatus = updateData.status !== undefined ? updateData.status : existing.status;
      updateData.status = this.determineStatus(totalCap, occupiedCap, targetStatus);

      const updated = await Shelter.findByIdAndUpdate(id, updateData, { new: true, runValidators: true });

      const formattedShelter = this.formatShelter(updated);
      socketService.notifyShelterUpdated(formattedShelter);

      return res.status(200).json({
        message: 'Shelter updated successfully',
        shelter: formattedShelter
      });
    } catch (err) {
      console.error('[ShelterController.updateShelter] Error:', err);
      return res.status(500).json({ error: 'Failed to update shelter: ' + err.message });
    }
  }

  /**
   * Admin: PATCH /api/v1/admin/shelters/:id/status
   */
  async updateShelterStatus(req, res) {
    try {
      const { id } = req.params;
      const { status } = req.body;

      const validStatuses = ['OPEN', 'NEAR_CAPACITY', 'FULL', 'CLOSED'];
      if (!status || !validStatuses.includes(status.toUpperCase())) {
        return res.status(400).json({ error: 'Invalid status. Allowed: OPEN, NEAR_CAPACITY, FULL, CLOSED' });
      }

      const existing = await Shelter.findById(id);
      if (!existing) {
        return res.status(404).json({ error: 'Shelter not found' });
      }

      const targetStatus = status.toUpperCase();
      let finalStatus = targetStatus;

      if (targetStatus !== 'CLOSED') {
        finalStatus = this.determineStatus(existing.capacity, existing.occupied, targetStatus);
      }

      const updated = await Shelter.findByIdAndUpdate(id, { status: finalStatus }, { new: true });

      const formattedShelter = this.formatShelter(updated);
      socketService.notifyShelterUpdated(formattedShelter);

      return res.status(200).json({
        message: `Shelter status updated to ${finalStatus}`,
        shelter: formattedShelter
      });
    } catch (err) {
      console.error('[ShelterController.updateShelterStatus] Error:', err);
      return res.status(500).json({ error: 'Failed to update shelter status' });
    }
  }

  /**
   * Admin: DELETE /api/v1/admin/shelters/:id
   */
  async deleteShelter(req, res) {
    try {
      const shelter = await Shelter.findByIdAndDelete(req.params.id);
      if (!shelter) {
        return res.status(404).json({ error: 'Shelter not found' });
      }
      return res.status(200).json({ message: 'Shelter deleted successfully' });
    } catch (err) {
      console.error('[ShelterController.deleteShelter] Error:', err);
      return res.status(500).json({ error: 'Failed to delete shelter' });
    }
  }
}

module.exports = new ShelterController();
