import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { HomeScreen } from '../screens/HomeScreen';
import { MapScreen } from '../screens/MapScreen';
import { AboutScreen } from '../screens/AboutScreen';
import { RootStackParamList } from '../types';
import { Text } from 'react-native';

const Tab = createBottomTabNavigator<RootStackParamList>();

export const AppNavigator: React.FC = () => {
  return (
    <NavigationContainer>
      <Tab.Navigator
        screenOptions={{
          tabBarStyle: {
            backgroundColor: '#05060a',
            borderTopColor: 'rgba(255, 255, 255, 0.06)',
            borderTopWidth: 1,
            paddingBottom: 10,
            paddingTop: 10,
            height: 80,
          },
          tabBarActiveTintColor: '#4ec5e8',
          tabBarInactiveTintColor: '#6b6f7d',
          tabBarLabelStyle: {
            fontSize: 12,
            fontWeight: '500',
            marginTop: 5,
          },
          headerShown: false,
        }}
      >
        <Tab.Screen
          name="Home"
          component={HomeScreen}
          options={{
            tabBarLabel: 'Countdown',
            tabBarIcon: ({ color, size }: { color: string; size: number }) => (
              <Text style={{ color, fontSize: size }}>⏰</Text>
            ),
          }}
        />
        <Tab.Screen
          name="Map"
          component={MapScreen}
          options={{
            tabBarLabel: 'Global Map',
            tabBarIcon: ({ color, size }: { color: string; size: number }) => (
              <Text style={{ color, fontSize: size }}>🌍</Text>
            ),
          }}
        />
        <Tab.Screen
          name="About"
          component={AboutScreen}
          options={{
            tabBarLabel: 'About',
            tabBarIcon: ({ color, size }: { color: string; size: number }) => (
              <Text style={{ color, fontSize: size }}>ℹ️</Text>
            ),
          }}
        />
      </Tab.Navigator>
    </NavigationContainer>
  );
}; 