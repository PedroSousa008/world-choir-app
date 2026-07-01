// User pledge data
export interface UserPledge {
  id: string;
  city: string;
  country: string;
  latitude: number;
  longitude: number;
  timestamp: number;
  anonymous: boolean;
}

// City participation data for heat map
export interface CityParticipation {
  city: string;
  country: string;
  latitude: number;
  longitude: number;
  participantCount: number;
  lastUpdated: number;
}

// App state
export interface AppState {
  hasPledged: boolean;
  userLocation: {
    latitude: number;
    longitude: number;
    city: string;
    country: string;
  } | null;
  notificationsEnabled: boolean;
  calendarEventAdded: boolean;
}

// Navigation types
export type RootStackParamList = {
  Home: undefined;
  Map: undefined;
  About: undefined;
};

// Countdown timer state
export interface CountdownState {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  isLive: boolean;
  isCompleted: boolean;
}

// Map region for react-native-maps
export interface MapRegion {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
} 