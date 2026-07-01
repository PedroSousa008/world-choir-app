import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Alert,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Sharing from 'expo-sharing';
import { EVENT_CONFIG } from '../constants/event';

interface PledgeButtonProps {
  hasPledged: boolean;
  onPledge: () => void;
  disabled?: boolean;
}

export const PledgeButton: React.FC<PledgeButtonProps> = ({
  hasPledged,
  onPledge,
  disabled = false,
}) => {
  const [scaleAnim] = useState(new Animated.Value(1));

  const handlePress = () => {
    if (disabled) return;

    // Animate button press
    Animated.sequence([
      Animated.timing(scaleAnim, {
        toValue: 0.95,
        duration: 100,
        useNativeDriver: true,
      }),
      Animated.timing(scaleAnim, {
        toValue: 1,
        duration: 100,
        useNativeDriver: true,
      }),
    ]).start();

    if (hasPledged) {
      showShareOptions();
    } else {
      onPledge();
    }
  };

  const showShareOptions = async () => {
    try {
      const shareMessage = `${EVENT_CONFIG.SHARE_MESSAGE} ${EVENT_CONFIG.SHARE_URL}`;
      
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(shareMessage, {
          mimeType: 'text/plain',
          dialogTitle: 'Share World Choir',
        });
      } else {
        Alert.alert(
          'Share World Choir',
          shareMessage,
          [{ text: 'OK' }]
        );
      }
    } catch (error) {
      console.error('Error sharing:', error);
    }
  };

  const renderButtonContent = () => {
    if (hasPledged) {
      return (
        <View style={styles.buttonContent}>
          <Text style={styles.buttonText}>✓ I'll Be There</Text>
          <Text style={styles.buttonSubtext}>Tap to share</Text>
        </View>
      );
    }

    return (
      <View style={styles.buttonContent}>
        <Text style={styles.buttonText}>I'll Be There</Text>
        <Text style={styles.buttonSubtext}>Join the global choir</Text>
      </View>
    );
  };

  return (
    <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
      <TouchableOpacity
        style={[styles.button, disabled && styles.buttonDisabled]}
        onPress={handlePress}
        activeOpacity={0.8}
        disabled={disabled}
      >
        <LinearGradient
          colors={hasPledged ? ['#4CAF50', '#45A049'] : ['#FF6B6B', '#FF5252']}
          style={styles.gradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        >
          {renderButtonContent()}
        </LinearGradient>
      </TouchableOpacity>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  button: {
    borderRadius: 50,
    overflow: 'hidden',
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  gradient: {
    paddingVertical: 20,
    paddingHorizontal: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonContent: {
    alignItems: 'center',
  },
  buttonText: {
    fontSize: 20,
    fontWeight: '600',
    color: '#FFFFFF',
    textAlign: 'center',
    letterSpacing: 1,
  },
  buttonSubtext: {
    fontSize: 12,
    color: '#FFFFFF',
    textAlign: 'center',
    marginTop: 4,
    opacity: 0.9,
  },
}); 