/**
 * GPS + Geofence utilities for Field Command
 *
 * Geofence rule: warn + flag, never hard-block.
 * Crew can override off-site warning and proceed — punch gets flagged for office review.
 */
import * as Location from 'expo-location';

/**
 * Request location permissions and get current position.
 * Returns { latitude, longitude } or null if denied.
 */
export async function getCurrentPosition() {
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== 'granted') return null;

  const loc = await Location.getCurrentPositionAsync({
    accuracy: Location.Accuracy.High,
  });
  return {
    latitude: loc.coords.latitude,
    longitude: loc.coords.longitude,
  };
}

/**
 * Check if a position is within a job's geofence.
 * Uses Haversine formula.
 *
 * @param {object} position  - { latitude, longitude }
 * @param {object} jobSite   - { latitude, longitude, geofence_radius }
 * @returns {{ onSite: boolean, distanceMeters: number }}
 */
export function checkGeofence(position, jobSite) {
  if (
    !position ||
    !jobSite ||
    jobSite.latitude == null ||
    jobSite.longitude == null
  ) {
    // No geofence data — assume on-site (don't block crew)
    return { onSite: true, distanceMeters: 0 };
  }

  const radius = jobSite.geofence_radius || 150; // default 150m
  const distance = haversine(
    position.latitude,
    position.longitude,
    jobSite.latitude,
    jobSite.longitude
  );

  return {
    onSite: distance <= radius,
    distanceMeters: Math.round(distance),
  };
}

/**
 * Haversine distance in meters between two lat/lng points.
 */
function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371000; // Earth radius in meters
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Demo mode: simulated positions
 */
export const DEMO_POSITIONS = {
  onSite: { latitude: 33.4484, longitude: -112.074 },   // Phoenix, AZ (example)
  offSite: { latitude: 33.5, longitude: -112.2 },        // ~15km away
};
