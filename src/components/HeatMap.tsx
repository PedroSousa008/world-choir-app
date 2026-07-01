import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  StyleSheet,
  Dimensions,
  Animated,
  Text,
} from 'react-native';
import MapView, { Marker, Circle } from 'react-native-maps';
import { CityParticipation } from '../types';

const { width, height } = Dimensions.get('window');

interface HeatMapProps {
  cityData: CityParticipation[];
  userLocation?: {
    latitude: number;
    longitude: number;
  } | null;
}

export const HeatMap: React.FC<HeatMapProps> = ({ cityData, userLocation }) => {
  const [mapRegion, setMapRegion] = useState({
    latitude: 20,
    longitude: 0,
    latitudeDelta: 100,
    longitudeDelta: 100,
  });

  const pulseAnimations = useRef<{ [key: string]: Animated.Value }>({});

  useEffect(() => {
    // Initialize pulse animations for each city
    cityData.forEach(city => {
      const cityKey = `${city.city}-${city.country}`;
      if (!pulseAnimations.current[cityKey]) {
        pulseAnimations.current[cityKey] = new Animated.Value(1);
      }
    });

    // Start pulse animations
    cityData.forEach(city => {
      const cityKey = `${city.city}-${city.country}`;
      const anim = pulseAnimations.current[cityKey];
      if (anim) {
        Animated.loop(
          Animated.sequence([
            Animated.timing(anim, {
              toValue: 1.3,
              duration: 2000,
              useNativeDriver: true,
            }),
            Animated.timing(anim, {
              toValue: 1,
              duration: 2000,
              useNativeDriver: true,
            }),
          ])
        ).start();
      }
    });
  }, [cityData]);

  const getCircleRadius = (participantCount: number): number => {
    // Scale radius based on participant count
    const baseRadius = 5000; // 5km base radius
    const maxRadius = 50000; // 50km max radius
    const scale = Math.min(participantCount / 100, 10); // Cap at 10x scale
    return Math.max(baseRadius, Math.min(maxRadius, baseRadius * scale));
  };

  const getCircleOpacity = (participantCount: number): number => {
    // Scale opacity based on participant count
    const baseOpacity = 0.3;
    const maxOpacity = 0.8;
    const scale = Math.min(participantCount / 50, 5); // Cap at 5x scale
    return Math.max(baseOpacity, Math.min(maxOpacity, baseOpacity * scale));
  };

  const getCircleColor = (participantCount: number): string => {
    // Color gradient based on participation
    if (participantCount >= 100) return '#FF6B6B'; // Red for high participation
    if (participantCount >= 50) return '#FFA726'; // Orange for medium-high
    if (participantCount >= 20) return '#FFD54F'; // Yellow for medium
    if (participantCount >= 10) return '#81C784'; // Light green for low-medium
    return '#4FC3F7'; // Blue for low participation
  };

  const renderCityCircles = () => {
    return cityData.map((city, index) => {
      const cityKey = `${city.city}-${city.country}`;
      const anim = pulseAnimations.current[cityKey];
      
      return (
        <View key={`${cityKey}-${index}`}>
          {/* Static circle for base */}
          <Circle
            center={{
              latitude: city.latitude,
              longitude: city.longitude,
            }}
            radius={getCircleRadius(city.participantCount)}
            fillColor={getCircleColor(city.participantCount)}
            strokeColor={getCircleColor(city.participantCount)}
            strokeWidth={2}
          />
          
          {/* Animated pulse circle */}
          {anim && (
            <Animated.View
              style={[
                styles.pulseCircle,
                {
                  position: 'absolute',
                  left: 0,
                  top: 0,
                  transform: [{ scale: anim }],
                  opacity: anim.interpolate({
                    inputRange: [1, 1.3],
                    outputRange: [0.6, 0],
                  }),
                },
              ]}
            >
              <Circle
                center={{
                  latitude: city.latitude,
                  longitude: city.longitude,
                }}
                radius={getCircleRadius(city.participantCount)}
                fillColor={getCircleColor(city.participantCount)}
                strokeColor="transparent"
              />
            </Animated.View>
          )}
          
          {/* City marker with count */}
          <Marker
            coordinate={{
              latitude: city.latitude,
              longitude: city.longitude,
            }}
            title={`${city.city}, ${city.country}`}
            description={`${city.participantCount} participants`}
          >
            <View style={styles.markerContainer}>
              <View style={[styles.marker, { backgroundColor: getCircleColor(city.participantCount) }]}>
                <Text style={styles.markerText}>{city.participantCount}</Text>
              </View>
            </View>
          </Marker>
        </View>
      );
    });
  };

  return (
    <View style={styles.container}>
      <MapView
        style={styles.map}
        region={mapRegion}
        onRegionChangeComplete={setMapRegion}
        showsUserLocation={!!userLocation}
        showsMyLocationButton={true}
        showsCompass={true}
        showsScale={true}
        mapType="standard"
      >
        {renderCityCircles()}
        
        {/* User location marker */}
        {userLocation && (
          <Marker
            coordinate={userLocation}
            title="Your Location"
            description="You are here"
            pinColor="#4CAF50"
          />
        )}
      </MapView>
      
      {/* Legend */}
      <View style={styles.legend}>
        <Text style={styles.legendTitle}>Global Participation</Text>
        <View style={styles.legendItems}>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: '#FF6B6B' }]} />
            <Text style={styles.legendText}>100+ participants</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: '#FFA726' }]} />
            <Text style={styles.legendText}>50+ participants</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: '#FFD54F' }]} />
            <Text style={styles.legendText}>20+ participants</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: '#81C784' }]} />
            <Text style={styles.legendText}>10+ participants</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: '#4FC3F7' }]} />
            <Text style={styles.legendText}>1+ participants</Text>
          </View>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  map: {
    flex: 1,
  },
  pulseCircle: {
    position: 'absolute',
  },
  markerContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  marker: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  markerText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '600',
  },
  legend: {
    position: 'absolute',
    bottom: 20,
    left: 20,
    right: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    borderRadius: 10,
    padding: 15,
  },
  legendTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 10,
    textAlign: 'center',
  },
  legendItems: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 5,
    minWidth: '45%',
  },
  legendDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 8,
  },
  legendText: {
    color: '#FFFFFF',
    fontSize: 12,
  },
}); 