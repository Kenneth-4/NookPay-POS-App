import { Slot, useSegments, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Platform, View, Text, StyleSheet, Alert } from 'react-native';
import * as ScreenOrientation from 'expo-screen-orientation';
import { UserProvider, useUser } from './contexts/UserContext';
import NetInfo from '@react-native-community/netinfo';
import React from 'react';

// Define allowed routes for staff
const STAFF_ALLOWED_ROUTES = [
  '/',           // index.tsx
  '/orders',     // orders.tsx
  '/inventory1', // inventory1.tsx
  '/dashboard',  // dashboard.tsx
  '/settings',   // settings.tsx
];

// Offline Banner component
function OfflineBanner() {
  return (
    <View style={styles.offlineBanner}>
      <Text style={styles.offlineText}>You are currently offline. Some features may be limited.</Text>
    </View>
  );
}

function RootLayoutNav() {
  const segments = useSegments();
  const router = useRouter();
  const { user, role, loading } = useUser();
  const [isOffline, setIsOffline] = useState(false);

  // Set up screen orientation
  useEffect(() => {
    if (Platform.OS !== 'web') {
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE);
    }
  }, []);

  // Set up network connectivity listener
  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener(state => {
      const offline = !state.isConnected;
      setIsOffline(offline);
      
      // Alert on network status change
      if (offline) {
        console.log('App is offline');
      } else {
        console.log('App is back online');
      }
    });

    // Check initial network state
    NetInfo.fetch().then(state => {
      setIsOffline(!state.isConnected);
    });

    // Clean up listener
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (loading) return;

    const inAuthGroup = segments[0]?.startsWith('(auth)');
    const currentPath = '/' + segments.join('/');

    // Handle authentication
    if (!user && !inAuthGroup) {
      router.replace('/(auth)/login');
      return;
    }

    // Handle authenticated users in auth group
    if (user && inAuthGroup) {
      if (role === 'owner') {
        router.replace('/dashboard');
      } else if (role === 'employee') {
        router.replace('/');
      }
      return;
    }

    // Handle staff access restrictions
    if (role === 'employee') {
      const isAllowedRoute = STAFF_ALLOWED_ROUTES.some(route => 
        currentPath === route || currentPath === route + '/'
      );
      
      if (!isAllowedRoute) {
        console.log('Staff attempting to access restricted route:', currentPath);
        router.replace('/');
      }
    }
  }, [user, role, segments, loading]);

  return (
    <>
      {isOffline && <OfflineBanner />}
      <Slot />
    </>
  );
}

export default function RootLayout() {
  return (
    <UserProvider>
      <RootLayoutNav />
    </UserProvider>
  );
}

const styles = StyleSheet.create({
  offlineBanner: {
    backgroundColor: '#EF4444',
    paddingVertical: 10,
    alignItems: 'center',
    width: '100%',
    position: 'absolute',
    top: 0,
    zIndex: 999,
  },
  offlineText: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 14,
  },
});
