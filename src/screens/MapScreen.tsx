import React, { useState, useEffect } from 'react';
import {
  View,
  StyleSheet,
  SafeAreaView,
  Text,
  ActivityIndicator,
} from 'react-native';
import { HeatMap } from '../components/HeatMap';
import { CityParticipation } from '../types';
import { getUserPledge } from '../utils/storage';

// Mock data for development - in production this would come from a backend
const MOCK_CITY_DATA: CityParticipation[] = [
  {
    city: 'New York',
    country: 'United States',
    latitude: 40.7128,
    longitude: -74.0060,
    participantCount: 125,
    lastUpdated: Date.now(),
  },
  {
    city: 'London',
    country: 'United Kingdom',
    latitude: 51.5074,
    longitude: -0.1278,
    participantCount: 89,
    lastUpdated: Date.now(),
  },
  {
    city: 'Tokyo',
    country: 'Japan',
    latitude: 35.6762,
    longitude: 139.6503,
    participantCount: 67,
    lastUpdated: Date.now(),
  },
  {
    city: 'Paris',
    country: 'France',
    latitude: 48.8566,
    longitude: 2.3522,
    participantCount: 45,
    lastUpdated: Date.now(),
  },
  {
    city: 'Sydney',
    country: 'Australia',
    latitude: -33.8688,
    longitude: 151.2093,
    participantCount: 34,
    lastUpdated: Date.now(),
  },
  {
    city: 'São Paulo',
    country: 'Brazil',
    latitude: -23.5505,
    longitude: -46.6333,
    participantCount: 28,
    lastUpdated: Date.now(),
  },
  {
    city: 'Mumbai',
    country: 'India',
    latitude: 19.0760,
    longitude: 72.8777,
    participantCount: 23,
    lastUpdated: Date.now(),
  },
  {
    city: 'Cairo',
    country: 'Egypt',
    latitude: 30.0444,
    longitude: 31.2357,
    participantCount: 19,
    lastUpdated: Date.now(),
  },
  {
    city: 'Lagos',
    country: 'Nigeria',
    latitude: 6.5244,
    longitude: 3.3792,
    participantCount: 15,
    lastUpdated: Date.now(),
  },
  {
    city: 'Moscow',
    country: 'Russia',
    latitude: 55.7558,
    longitude: 37.6176,
    participantCount: 12,
    lastUpdated: Date.now(),
  },
];

export const MapScreen: React.FC = () => {
  const [cityData, setCityData] = useState<CityParticipation[]>([]);
  const [userLocation, setUserLocation] = useState<{
    latitude: number;
    longitude: number;
  } | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadMapData();
  }, []);

  const loadMapData = async () => {
    try {
      // Load user pledge to get location
      const userPledge = await getUserPledge();
      if (userPledge) {
        setUserLocation({
          latitude: userPledge.latitude,
          longitude: userPledge.longitude,
        });
      }

      // In production, this would fetch real data from a backend
      // For now, we'll use mock data with some randomization
      const randomizedData = MOCK_CITY_DATA.map(city => ({
        ...city,
        participantCount: Math.floor(Math.random() * 150) + 1,
        lastUpdated: Date.now(),
      }));

      setCityData(randomizedData);
      setIsLoading(false);
    } catch (error) {
      console.error('Error loading map data:', error);
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#FFFFFF" />
          <Text style={styles.loadingText}>Loading global participation...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Global Participation</Text>
        <Text style={styles.headerSubtitle}>
          {cityData.reduce((total, city) => total + city.participantCount, 0)} people pledged worldwide
        </Text>
      </View>
      
      <HeatMap cityData={cityData} userLocation={userLocation} />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 10,
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '300',
    color: '#FFFFFF',
    letterSpacing: 2,
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#CCCCCC',
    marginTop: 5,
    letterSpacing: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: '#FFFFFF',
    fontSize: 16,
    marginTop: 20,
  },
}); 