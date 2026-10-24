/**
 * Geo District Detector Utility
 *
 * Uses official Karnataka administrative GeoJSON polygons to determine whether
 * a user's real-world GPS coordinates fall within or near AegisCore's 4 pilot districts:
 * - Kodagu
 * - Uttara Kannada
 * - Belagavi
 * - Bagalkot
 */

import { KARNATAKA_DISTRICTS_GEOJSON } from '../data/karnatakaDistricts.js';

/**
 * Standard ray-casting point-in-polygon algorithm.
 * pt: [longitude, latitude]
 * ring: [[lng, lat], [lng, lat], ...]
 */
function pointInRing(pt, ring) {
  let inside = false;
  const x = pt[0], y = pt[1];
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1];
    const xj = ring[j][0], yj = ring[j][1];
    const intersect = ((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

function pointInPolygon(pt, coordinates) {
  if (!coordinates || coordinates.length === 0) return false;
  if (!pointInRing(pt, coordinates[0])) return false;
  // Check interior holes if any
  for (let i = 1; i < coordinates.length; i++) {
    if (pointInRing(pt, coordinates[i])) return false;
  }
  return true;
}

function pointInMultiPolygon(pt, coordinates) {
  if (!coordinates) return false;
  for (let i = 0; i < coordinates.length; i++) {
    if (pointInPolygon(pt, coordinates[i])) return true;
  }
  return false;
}

/**
 * Calculates Haversine distance in kilometers between two GPS coordinates.
 */
export function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth's mean radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Evaluates real-world GPS coordinates against AegisCore's 4 pilot districts.
 *
 * @param {number} latitude
 * @param {number} longitude
 * @returns {{
 *   district: string|null,
 *   inside: boolean,
 *   distanceKm: number,
 *   nearestDistrict: string,
 *   isNear: boolean
 * }}
 */
export function detectDistrictFromCoords(latitude, longitude) {
  if (typeof latitude !== 'number' || typeof longitude !== 'number') {
    return { district: null, inside: false, distanceKm: 0, nearestDistrict: 'Kodagu', isNear: false };
  }

  const pt = [longitude, latitude]; // GeoJSON standard [lng, lat]
  const features = KARNATAKA_DISTRICTS_GEOJSON?.features || [];

  // 1. Strict point-in-polygon boundary check
  for (const feature of features) {
    const geom = feature.geometry;
    let inside = false;
    if (geom.type === 'Polygon') {
      inside = pointInPolygon(pt, geom.coordinates);
    } else if (geom.type === 'MultiPolygon') {
      inside = pointInMultiPolygon(pt, geom.coordinates);
    }

    if (inside) {
      return {
        district: feature.properties.name,
        inside: true,
        distanceKm: 0,
        nearestDistrict: feature.properties.name,
        isNear: false
      };
    }
  }

  // 2. Proximity check for users near district boundaries
  let nearestDistrict = 'Kodagu';
  let minDistance = Infinity;

  for (const feature of features) {
    const center = feature.properties?.center; // [lat, lng]
    if (center && center.length >= 2) {
      const dist = haversineKm(latitude, longitude, center[0], center[1]);
      if (dist < minDistance) {
        minDistance = dist;
        nearestDistrict = feature.properties.name;
      }
    }
  }

  // If within 25km buffer of a district center/boundary, consider near
  if (minDistance <= 25) {
    return {
      district: nearestDistrict,
      inside: true,
      distanceKm: Math.round(minDistance),
      nearestDistrict,
      isNear: true
    };
  }

  // 3. User is outside all 4 monitored pilot districts (e.g. Bangalore, Mangalore, Delhi, etc.)
  return {
    district: null,
    inside: false,
    distanceKm: Math.round(minDistance),
    nearestDistrict,
    isNear: false
  };
}

/**
 * Retrieves the reference centroid coordinates [latitude, longitude] for a given district name.
 *
 * @param {string} districtName - District name (case-insensitive)
 * @returns {[number, number]|null} [latitude, longitude] or null if not found
 */
export function getDistrictCentroid(districtName) {
  if (!districtName) return null;
  const features = KARNATAKA_DISTRICTS_GEOJSON?.features || [];
  const feature = features.find(
    (f) => f.properties?.name?.toLowerCase() === districtName.trim().toLowerCase()
  );
  const center = feature?.properties?.center;
  if (center && Array.isArray(center) && center.length >= 2) {
    return [center[0], center[1]]; // [latitude, longitude]
  }
  return null;
}

/**
 * Calculates the real-world distance in kilometers from a user's GPS coordinates
 * to the specified district's reference centroid.
 *
 * @param {number} latitude - User GPS latitude
 * @param {number} longitude - User GPS longitude
 * @param {string} districtName - Name of the pilot district (e.g. 'Kodagu', 'Uttara Kannada', 'Belagavi', 'Bagalkot')
 * @returns {number|null} Distance in rounded kilometers, or null if coordinates/district invalid
 */
export function calculateDistanceToDistrict(latitude, longitude, districtName) {
  if (typeof latitude !== 'number' || typeof longitude !== 'number' || !districtName) {
    return null;
  }
  const centroid = getDistrictCentroid(districtName);
  if (!centroid) return null;
  const [distLat, distLng] = centroid;
  const dist = haversineKm(latitude, longitude, distLat, distLng);
  return Math.round(dist);
}

