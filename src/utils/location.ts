import * as Location from 'expo-location';

// Get user's current location
export const getCurrentLocation = async (): Promise<Location.LocationObject | null> => {
  try {
    // Request permissions
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      console.log('Location permission denied');
      return null;
    }

    // Get current position
    const location = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
      timeInterval: 5000,
      distanceInterval: 10,
    });

    return location;
  } catch (error) {
    console.error('Error getting location:', error);
    return null;
  }
};

// Reverse geocoding to get city and country
export const getCityFromCoordinates = async (
  latitude: number,
  longitude: number
): Promise<{ city: string; country: string } | null> => {
  try {
    const results = await Location.reverseGeocodeAsync({
      latitude,
      longitude,
    });

    if (results.length > 0) {
      const result = results[0];
      return {
        city: result.city || result.subregion || result.region || 'Unknown City',
        country: result.country || 'Unknown Country',
      };
    }

    return null;
  } catch (error) {
    console.error('Error reverse geocoding:', error);
    return null;
  }
};

// Get user's location with city info
export const getUserLocationWithCity = async (): Promise<{
  latitude: number;
  longitude: number;
  city: string;
  country: string;
} | null> => {
  try {
    const location = await getCurrentLocation();
    if (!location) {
      return null;
    }

    const cityInfo = await getCityFromCoordinates(
      location.coords.latitude,
      location.coords.longitude
    );

    if (!cityInfo) {
      return null;
    }

    return {
      latitude: location.coords.latitude,
      longitude: location.coords.longitude,
      city: cityInfo.city,
      country: cityInfo.country,
    };
  } catch (error) {
    console.error('Error getting user location with city:', error);
    return null;
  }
};

// Calculate distance between two points in kilometers
export const calculateDistance = (
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number => {
  const R = 6371; // Earth's radius in kilometers
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) *
      Math.cos(lat2 * (Math.PI / 180)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}; 