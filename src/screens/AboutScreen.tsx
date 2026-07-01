import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { EVENT_CONFIG } from '../constants/event';

export const AboutScreen: React.FC = () => {
  const formatEventDate = (date: Date): string => {
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  const formatEventTime = (date: Date): string => {
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      timeZoneName: 'short',
    });
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>About World Choir</Text>
          <Text style={styles.headerSubtitle}>A Global Moment of Unity</Text>
        </View>

        <View style={styles.content}>
          {/* Mission Section */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>🌍 Our Mission</Text>
            <Text style={styles.sectionText}>
              World Choir creates a synchronized moment where people across the globe step outside 
              and sing together, creating a powerful wave of unity that transcends borders, 
              languages, and cultures.
            </Text>
          </View>

          {/* Event Details */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>📅 Event Details</Text>
            <View style={styles.eventCard}>
              <Text style={styles.eventDateText}>
                {formatEventDate(EVENT_CONFIG.EVENT_DATE)}
              </Text>
              <Text style={styles.eventTimeText}>
                {formatEventTime(EVENT_CONFIG.EVENT_DATE)}
              </Text>
              <Text style={styles.eventLocationText}>
                Global • Go outside and sing
              </Text>
            </View>
          </View>

          {/* How It Works */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>🎵 How It Works</Text>
            
            <View style={styles.stepContainer}>
              <View style={styles.stepNumber}>
                <Text style={styles.stepNumberText}>1</Text>
              </View>
              <View style={styles.stepContent}>
                <Text style={styles.stepTitle}>Pledge to Participate</Text>
                <Text style={styles.stepText}>
                  Tap "I'll Be There" to join the global choir from your city.
                </Text>
              </View>
            </View>

            <View style={styles.stepContainer}>
              <View style={styles.stepNumber}>
                <Text style={styles.stepNumberText}>2</Text>
              </View>
              <View style={styles.stepContent}>
                <Text style={styles.stepTitle}>Get Notified</Text>
                <Text style={styles.stepText}>
                  Receive reminders 1 hour and 5 minutes before the event.
                </Text>
              </View>
            </View>

            <View style={styles.stepContainer}>
              <View style={styles.stepNumber}>
                <Text style={styles.stepNumberText}>3</Text>
              </View>
              <View style={styles.stepContent}>
                <Text style={styles.stepTitle}>Sing Together</Text>
                <Text style={styles.stepText}>
                  At the appointed time, go outside and sing with the world.
                </Text>
              </View>
            </View>
          </View>

          {/* What to Sing */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>🎶 What to Sing</Text>
            <Text style={styles.sectionText}>
              Choose any song that brings you joy and unity. It could be a traditional folk song, 
              a popular anthem, or even just humming a melody. The important thing is that you're 
              participating in this global moment of connection.
            </Text>
          </View>

          {/* Privacy */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>🔒 Privacy</Text>
            <Text style={styles.sectionText}>
              We respect your privacy. The app only uses your location to show your city on the 
              global map. No audio or video is recorded. This is about participation, not performance.
            </Text>
          </View>

          {/* Contact */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>📧 Contact</Text>
            <Text style={styles.sectionText}>
              Questions or suggestions? We'd love to hear from you.
            </Text>
            <TouchableOpacity style={styles.contactButton}>
              <Text style={styles.contactButtonText}>Get in Touch</Text>
            </TouchableOpacity>
          </View>

          {/* Footer */}
          <View style={styles.footer}>
            <Text style={styles.footerText}>
              Made with ❤️ for global unity
            </Text>
            <Text style={styles.footerVersion}>
              Version 1.0.0
            </Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  scrollView: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 30,
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '300',
    color: '#FFFFFF',
    textAlign: 'center',
    letterSpacing: 2,
  },
  headerSubtitle: {
    fontSize: 16,
    color: '#CCCCCC',
    textAlign: 'center',
    marginTop: 10,
    letterSpacing: 1,
  },
  content: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  section: {
    marginBottom: 30,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 15,
    letterSpacing: 1,
  },
  sectionText: {
    fontSize: 16,
    color: '#CCCCCC',
    lineHeight: 24,
  },
  eventCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 15,
    padding: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  eventDateText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFFFFF',
    textAlign: 'center',
  },
  eventTimeText: {
    fontSize: 16,
    color: '#FF6B6B',
    textAlign: 'center',
    marginTop: 5,
  },
  eventLocationText: {
    fontSize: 14,
    color: '#CCCCCC',
    textAlign: 'center',
    marginTop: 5,
  },
  stepContainer: {
    flexDirection: 'row',
    marginBottom: 20,
    alignItems: 'flex-start',
  },
  stepNumber: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#FF6B6B',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 15,
    marginTop: 2,
  },
  stepNumberText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  stepContent: {
    flex: 1,
  },
  stepTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 5,
  },
  stepText: {
    fontSize: 14,
    color: '#CCCCCC',
    lineHeight: 20,
  },
  contactButton: {
    backgroundColor: '#FF6B6B',
    borderRadius: 25,
    paddingVertical: 12,
    paddingHorizontal: 24,
    alignSelf: 'center',
    marginTop: 15,
  },
  contactButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  footer: {
    alignItems: 'center',
    marginTop: 20,
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.1)',
  },
  footerText: {
    fontSize: 14,
    color: '#CCCCCC',
    textAlign: 'center',
  },
  footerVersion: {
    fontSize: 12,
    color: '#888888',
    marginTop: 5,
  },
}); 