import React, { useState, useEffect } from 'react';
import {
  View,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  Text,
  Alert,
} from 'react-native';
import { CountdownTimer } from '../components/CountdownTimer';
import { PledgeButton } from '../components/PledgeButton';
import { EVENT_CONFIG, THEME, EventState } from '../constants/event';
import { AppState } from '../types';
import { getAppState, saveAppState, getUserPledge, saveUserPledge, getUserId } from '../utils/storage';
import { getUserLocationWithCity } from '../utils/location';
import { scheduleEventNotifications, addEventToCalendar, showCalendarPermissionMessage, checkNotificationStatus } from '../utils/notifications';

export const HomeScreen: React.FC = () => {
  const [appState, setAppState] = useState<AppState>({
    hasPledged: false,
    userLocation: null,
    notificationsEnabled: false,
    calendarEventAdded: false,
  });
  const [eventState, setEventState] = useState<EventState>(EventState.COUNTDOWN);
  const [isLoading, setIsLoading] = useState(false);
  const [hasJoined, setHasJoined] = useState(true);

  useEffect(() => {
    loadAppState();
  }, []);

  const loadAppState = async () => {
    try {
      const savedState = await getAppState();
      const userPledge = await getUserPledge();
      const notificationsEnabled = await checkNotificationStatus();
      
      setAppState({
        ...savedState,
        hasPledged: !!userPledge,
        notificationsEnabled,
      });
      // Don't auto-set hasJoined from storage - user must click Participate button
      
      setIsLoading(false);
    } catch (error) {
      console.error('Error loading app state:', error);
      setIsLoading(false);
    }
  };

  const handlePledge = async () => {
    try {
      setIsLoading(true);
      
      // Get user location
      const location = await getUserLocationWithCity();
      if (!location) {
        Alert.alert(
          'Location Required',
          'Please enable location services to join the global choir.',
          [{ text: 'OK' }]
        );
        setIsLoading(false);
        return;
      }

      // Create user pledge
      const userId = await getUserId();
      const pledge = {
        id: userId,
        city: location.city,
        country: location.country,
        latitude: location.latitude,
        longitude: location.longitude,
        timestamp: Date.now(),
        anonymous: true,
      };

      // Save pledge
      await saveUserPledge(pledge);
      await saveAppState({ hasPledged: true, userLocation: location });

      // Schedule notifications
      await scheduleEventNotifications();

      // Update local state
      setAppState(prev => ({
        ...prev,
        hasPledged: true,
        userLocation: location,
        notificationsEnabled: true,
      }));

      // Show success message
      Alert.alert(
        'Welcome to the Global Choir! 🌍',
        `You're now part of the global moment of unity from ${location.city}, ${location.country}.`,
        [
          {
            text: 'Add to Calendar',
            onPress: handleAddToCalendar,
          },
          {
            text: 'Share',
            onPress: () => {}, // Will be handled by PledgeButton
          },
          {
            text: 'OK',
            style: 'cancel',
          },
        ]
      );

    } catch (error) {
      console.error('Error creating pledge:', error);
      Alert.alert('Error', 'Failed to join the global choir. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddToCalendar = async () => {
    try {
      const result = await addEventToCalendar();
      if (result === 'success') {
        await saveAppState({ calendarEventAdded: true });
        setAppState(prev => ({ ...prev, calendarEventAdded: true }));
        return;
      }
      if (result === 'denied') {
        showCalendarPermissionMessage();
        return;
      }
      Alert.alert(
        'Could not open calendar',
        'We could not open your calendar app. Please try again later.',
        [{ text: 'OK' }]
      );
    } catch (error) {
      console.error('Error adding to calendar:', error);
      Alert.alert(
        'Could not open calendar',
        'We could not open your calendar app. Please try again later.',
        [{ text: 'OK' }]
      );
    }
  };

  const handleStateChange = (newState: EventState) => {
    setEventState(newState);
  };

  const handleParticipate = () => {
    setHasJoined(true);
  };

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>Loading...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>World Choir</Text>
        {appState.hasPledged && appState.userLocation && (
          <Text style={styles.locationText}>
            {appState.userLocation.city}, {appState.userLocation.country}
          </Text>
        )}
      </View>

      <View style={styles.content}>
        {hasJoined ? (
          <>
            <CountdownTimer onStateChange={handleStateChange} />
            
            {eventState === EventState.COUNTDOWN && (
              <View style={styles.buttonContainer}>
                <PledgeButton
                  hasPledged={appState.hasPledged}
                  onPledge={handlePledge}
                  disabled={isLoading}
                />
                
                {!appState.calendarEventAdded && (
                  <TouchableOpacity
                    style={styles.calendarButton}
                    onPress={handleAddToCalendar}
                  >
                    <Text style={styles.calendarButtonText}>📅 Add to Calendar</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}
          </>
        ) : (
          <View style={styles.joinContainer}>
            <Text style={styles.joinTitle}>Join the Global Moment</Text>
            <Text style={styles.joinSubtitle}>
              Tap below to reveal the live countdown and get ready to sing with the world.
            </Text>
            <TouchableOpacity
              style={styles.joinButton}
              onPress={handleParticipate}
              disabled={isLoading}
            >
              <Text style={styles.joinButtonText}>Participate</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: THEME.bgVoid,
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 10,
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '600',
    color: THEME.textPrimary,
    letterSpacing: 1,
  },
  locationText: {
    fontSize: 14,
    color: THEME.textSecondary,
    marginTop: 5,
  },
  content: {
    flex: 1,
    justifyContent: 'space-between',
  },
  buttonContainer: {
    paddingHorizontal: 20,
    paddingBottom: 40,
    alignItems: 'center',
  },
  joinContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 30,
  },
  joinTitle: {
    fontSize: 28,
    fontWeight: '300',
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: 15,
    letterSpacing: 1.5,
  },
  joinSubtitle: {
    fontSize: 16,
    color: '#CCCCCC',
    textAlign: 'center',
    marginBottom: 40,
    lineHeight: 22,
    letterSpacing: 0.5,
  },
  joinButton: {
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 28,
    backgroundColor: '#FFFFFF',
  },
  joinButtonText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#000000',
    letterSpacing: 1,
  },
  calendarButton: {
    marginTop: 20,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 25,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  calendarButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '500',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: '#FFFFFF',
    fontSize: 18,
  },
}); 