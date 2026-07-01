import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState, UserPledge } from '../types';

// Storage keys
const STORAGE_KEYS = {
  APP_STATE: 'world_choir_app_state',
  USER_PLEDGE: 'world_choir_user_pledge',
  USER_ID: 'world_choir_user_id',
};

// Generate anonymous user ID
export const generateUserId = (): string => {
  return 'user_' + Math.random().toString(36).substr(2, 9) + Date.now().toString(36);
};

// Get or create user ID
export const getUserId = async (): Promise<string> => {
  try {
    let userId = await AsyncStorage.getItem(STORAGE_KEYS.USER_ID);
    if (!userId) {
      userId = generateUserId();
      await AsyncStorage.setItem(STORAGE_KEYS.USER_ID, userId);
    }
    return userId;
  } catch (error) {
    console.error('Error getting user ID:', error);
    return generateUserId();
  }
};

// Save app state
export const saveAppState = async (state: Partial<AppState>): Promise<void> => {
  try {
    const currentState = await getAppState();
    const newState = { ...currentState, ...state };
    await AsyncStorage.setItem(STORAGE_KEYS.APP_STATE, JSON.stringify(newState));
  } catch (error) {
    console.error('Error saving app state:', error);
  }
};

// Get app state
export const getAppState = async (): Promise<AppState> => {
  try {
    const state = await AsyncStorage.getItem(STORAGE_KEYS.APP_STATE);
    if (state) {
      return JSON.parse(state);
    }
  } catch (error) {
    console.error('Error getting app state:', error);
  }
  
  // Default state
  return {
    hasPledged: false,
    userLocation: null,
    notificationsEnabled: false,
    calendarEventAdded: false,
  };
};

// Save user pledge
export const saveUserPledge = async (pledge: UserPledge): Promise<void> => {
  try {
    await AsyncStorage.setItem(STORAGE_KEYS.USER_PLEDGE, JSON.stringify(pledge));
  } catch (error) {
    console.error('Error saving user pledge:', error);
  }
};

// Get user pledge
export const getUserPledge = async (): Promise<UserPledge | null> => {
  try {
    const pledge = await AsyncStorage.getItem(STORAGE_KEYS.USER_PLEDGE);
    if (pledge) {
      return JSON.parse(pledge);
    }
  } catch (error) {
    console.error('Error getting user pledge:', error);
  }
  return null;
};

// Clear all data (for testing)
export const clearAllData = async (): Promise<void> => {
  try {
    await AsyncStorage.multiRemove([
      STORAGE_KEYS.APP_STATE,
      STORAGE_KEYS.USER_PLEDGE,
      STORAGE_KEYS.USER_ID,
    ]);
  } catch (error) {
    console.error('Error clearing data:', error);
  }
}; 