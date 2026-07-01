import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  Animated,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { getTimeRemaining, getEventState, EventState, EVENT_CONFIG } from '../constants/event';

const { width, height } = Dimensions.get('window');

interface CountdownTimerProps {
  onStateChange?: (state: EventState) => void;
}

export const CountdownTimer: React.FC<CountdownTimerProps> = ({ onStateChange }) => {
  const [timeRemaining, setTimeRemaining] = useState(getTimeRemaining());
  const [eventState, setEventState] = useState(getEventState());
  const pulseAnim = new Animated.Value(1);
  const eventDate = EVENT_CONFIG.EVENT_DATE;

  const formattedEventDate = React.useMemo(() => {
    try {
      const dateFormatter = new Intl.DateTimeFormat('en-GB', {
        day: '2-digit',
        month: 'long',
        year: 'numeric',
        timeZone: 'Europe/Lisbon',
      });
      const timeFormatter = new Intl.DateTimeFormat('en-GB', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
        timeZone: 'Europe/Lisbon',
      });

      return `${dateFormatter.format(eventDate)} • ${timeFormatter.format(eventDate)} Lisbon Time`;
    } catch (error) {
      // Fallback if Intl or timezone data is unavailable
      return eventDate.toUTCString();
    }
  }, [eventDate]);

  useEffect(() => {
    const timer = setInterval(() => {
      const newTimeRemaining = getTimeRemaining();
      const newEventState = getEventState();
      
      setTimeRemaining(newTimeRemaining);
      setEventState(newEventState);
      
      if (onStateChange) {
        onStateChange(newEventState);
      }
    }, 1000);

    // Pulse animation for live state
    if (eventState === EventState.LIVE) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.1,
            duration: 1000,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 1000,
            useNativeDriver: true,
          }),
        ])
      ).start();
    }

    return () => clearInterval(timer);
  }, [eventState, onStateChange, pulseAnim]);

  const formatNumber = (num: number): string => {
    return num.toString().padStart(2, '0');
  };

  const renderCountdown = () => {
    if (eventState === EventState.COMPLETED) {
      return (
        <View style={styles.completedContainer}>
          <Text style={styles.completedTitle}>The world just sang together</Text>
          <Text style={styles.completedSubtitle}>Thank you for being part of this moment</Text>
        </View>
      );
    }

    if (eventState === EventState.LIVE) {
      return (
        <Animated.View style={[styles.liveContainer, { transform: [{ scale: pulseAnim }] }]}>
          <Text style={styles.liveTitle}>🎵 The World is Singing! 🎵</Text>
          <Text style={styles.liveSubtitle}>Go outside and join the global choir</Text>
        </Animated.View>
      );
    }

    return (
      <View style={styles.countdownContainer}>
        <Text style={styles.eventTitle}>{EVENT_CONFIG.EVENT_TITLE}</Text>
        <Text style={styles.eventDate}>{formattedEventDate}</Text>
        
        <View style={styles.timerContainer}>
          <View style={styles.timeUnit}>
            <Text style={styles.timeNumber}>{formatNumber(timeRemaining.days)}</Text>
            <Text style={styles.timeLabel}>Days</Text>
          </View>
          <Text style={styles.timeSeparator}>:</Text>
          <View style={styles.timeUnit}>
            <Text style={styles.timeNumber}>{formatNumber(timeRemaining.hours)}</Text>
            <Text style={styles.timeLabel}>Hours</Text>
          </View>
          <Text style={styles.timeSeparator}>:</Text>
          <View style={styles.timeUnit}>
            <Text style={styles.timeNumber}>{formatNumber(timeRemaining.minutes)}</Text>
            <Text style={styles.timeLabel}>Minutes</Text>
          </View>
          <Text style={styles.timeSeparator}>:</Text>
          <View style={styles.timeUnit}>
            <Text style={styles.timeNumber}>{formatNumber(timeRemaining.seconds)}</Text>
            <Text style={styles.timeLabel}>Seconds</Text>
          </View>
        </View>
      </View>
    );
  };

  return (
    <LinearGradient
      colors={eventState === EventState.LIVE ? ['#FF6B6B', '#4ECDC4'] : ['#000000', '#1a1a1a']}
      style={styles.container}
    >
      {renderCountdown()}
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  countdownContainer: {
    alignItems: 'center',
  },
  eventTitle: {
    fontSize: 28,
    fontWeight: '300',
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: 10,
    letterSpacing: 2,
  },
  eventDate: {
    fontSize: 16,
    color: '#CCCCCC',
    textAlign: 'center',
    marginBottom: 60,
    letterSpacing: 1,
  },
  timerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  timeUnit: {
    alignItems: 'center',
    marginHorizontal: 10,
  },
  timeNumber: {
    fontSize: 48,
    fontWeight: '200',
    color: '#FFFFFF',
    fontVariant: ['tabular-nums'],
  },
  timeLabel: {
    fontSize: 12,
    color: '#CCCCCC',
    marginTop: 5,
    letterSpacing: 1,
  },
  timeSeparator: {
    fontSize: 48,
    fontWeight: '200',
    color: '#FFFFFF',
    marginHorizontal: 5,
  },
  liveContainer: {
    alignItems: 'center',
  },
  liveTitle: {
    fontSize: 32,
    fontWeight: '600',
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: 20,
  },
  liveSubtitle: {
    fontSize: 18,
    color: '#FFFFFF',
    textAlign: 'center',
    opacity: 0.9,
  },
  completedContainer: {
    alignItems: 'center',
  },
  completedTitle: {
    fontSize: 28,
    fontWeight: '300',
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: 20,
  },
  completedSubtitle: {
    fontSize: 16,
    color: '#CCCCCC',
    textAlign: 'center',
  },
}); 