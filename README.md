# World Choir 🌍🎶

A minimalist but powerful mobile app that enables a real-world, global moment of unity through a synchronized countdown event.

## Overview

World Choir creates a synchronized moment where people across the globe step outside and sing together, creating a powerful wave of unity that transcends borders, languages, and cultures. The app coordinates and visualizes participation without capturing any audio or video - it's about the ritual, not the recording.

## Key Features

### ⏳ Global Countdown
- Real-time countdown to the global event (October 20, 2025 at 19:00 UTC)
- Dynamic state changes: Countdown → Live → Completed
- Beautiful, minimalist design with smooth animations

### 🌍 Live Heat Map
- World map with glowing circles representing participation by city
- Animated pulse effects for active cities
- Color-coded participation levels
- Real-time updates (mock data for MVP)

### 🤝 Pledge System
- Simple "I'll Be There" button
- Location-based city detection
- Anonymous user IDs stored locally
- Social sharing after pledging

### 📱 Notifications & Calendar
- Push notifications 1 hour and 5 minutes before the event
- Calendar integration to add the event
- Permission handling for location and notifications

## Tech Stack

- **Frontend**: React Native with Expo
- **Navigation**: React Navigation v6
- **Maps**: React Native Maps
- **Storage**: AsyncStorage for local data
- **Location**: Expo Location with reverse geocoding
- **Notifications**: Expo Notifications
- **Calendar**: Expo Calendar
- **Sharing**: Expo Sharing
- **Styling**: React Native StyleSheet with LinearGradient

## Project Structure

```
src/
├── components/          # Reusable UI components
│   ├── CountdownTimer.tsx
│   ├── PledgeButton.tsx
│   └── HeatMap.tsx
├── screens/            # Main app screens
│   ├── HomeScreen.tsx
│   ├── MapScreen.tsx
│   └── AboutScreen.tsx
├── navigation/         # Navigation configuration
│   └── AppNavigator.tsx
├── utils/             # Utility functions
│   ├── storage.ts
│   ├── location.ts
│   └── notifications.ts
├── constants/         # App constants
│   └── event.ts
└── types/            # TypeScript type definitions
    └── index.ts
```

## Getting Started

### Prerequisites

- Node.js (v16 or higher)
- npm or yarn
- Expo CLI
- iOS Simulator or Android Emulator (or physical device)

### Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd WorldChoirApp
```

2. Install dependencies:
```bash
npm install
```

3. Start the development server:
```bash
npm start
```

4. Run on your preferred platform:
```bash
# iOS
npm run ios

# Android
npm run android

# Web
npm run web
```

## Configuration

### Event Settings

Edit `src/constants/event.ts` to modify:
- Event date and time
- Notification timing
- Social sharing messages
- Map update intervals

### App Configuration

The `app.json` file contains:
- App metadata and branding
- Permissions configuration
- Platform-specific settings

## Features in Detail

### Countdown Timer
- Displays days, hours, minutes, and seconds remaining
- Automatically transitions between states
- Pulse animation during live event
- Post-event completion screen

### Heat Map
- Uses react-native-maps for world map display
- Animated circles with color-coded participation levels
- User location marker
- Interactive legend
- Mock data for development (replace with real backend)

### Pledge System
- Location permission handling
- Reverse geocoding to get city/country
- Local storage for user data
- Social sharing integration

### Notifications
- Permission requests
- Scheduled notifications
- Calendar event creation
- Error handling

## Development Notes

### Mock Data
The app currently uses mock data for the heat map. In production, you would:
1. Set up a backend (Firebase/Supabase recommended)
2. Replace mock data with real-time database queries
3. Implement user authentication if needed
4. Add real-time updates for participation counts

### Location Services
- Requires location permissions
- Falls back gracefully if permissions denied
- Uses reverse geocoding for city detection

### Notifications
- Currently has some TypeScript issues with trigger types
- Works on device but may need adjustments for production
- Calendar integration tested on iOS/Android

## Future Enhancements

### Phase 2 Features
- Real-time backend integration
- User authentication (optional)
- Post-event statistics and time-lapse
- Social media hashtag tracking
- Multiple event support

### Technical Improvements
- Add unit tests
- Implement error boundaries
- Add accessibility features
- Optimize performance
- Add offline support

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Support

For questions or support, please open an issue in the repository.

---

Made with ❤️ for global unity 