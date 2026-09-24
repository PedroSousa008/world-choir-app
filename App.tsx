import React, { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { WebView, WebViewNavigation } from 'react-native-webview';

/** Live World Choir product — website remains the source of truth. */
const APP_URL = 'https://worldchoirapp.com';

const ALLOWED_HOSTS = new Set([
  'worldchoirapp.com',
  'www.worldchoirapp.com',
  'world-choir-app.vercel.app',
]);

function isAllowedWorldChoirUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return false;
    const host = parsed.hostname.toLowerCase();
    if (ALLOWED_HOSTS.has(host)) return true;
    // Preview / alias deploys on the same Vercel project
    if (host.endsWith('.vercel.app') && host.includes('world-choir')) return true;
    return false;
  } catch {
    return false;
  }
}

export default function App() {
  const webRef = useRef<WebView>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const retry = useCallback(() => {
    setError(null);
    setLoading(true);
    setReloadKey((k) => k + 1);
  }, []);

  const onShouldStartLoadWithRequest = useCallback((request: { url: string }) => {
    const { url } = request;
    if (!url || url === 'about:blank') return true;
    if (isAllowedWorldChoirUrl(url)) return true;

    // External links (Stripe, mailto, tel, social) open outside the app shell
    Linking.openURL(url).catch(() => {});
    return false;
  }, []);

  const onNavigationStateChange = useCallback((nav: WebViewNavigation) => {
    if (nav.loading) setLoading(true);
  }, []);

  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
        <View style={styles.shell}>
          {!error ? (
            <WebView
              key={reloadKey}
              ref={webRef}
              source={{ uri: APP_URL }}
              style={styles.webview}
              onLoadStart={() => {
                setLoading(true);
                setError(null);
              }}
              onLoadEnd={() => setLoading(false)}
              onError={() => {
                setLoading(false);
                setError("Couldn't connect to World Choir. Check your connection and try again.");
              }}
              onHttpError={(e) => {
                const code = e.nativeEvent.statusCode;
                if (code >= 500) {
                  setLoading(false);
                  setError('World Choir is temporarily unavailable. Please try again.');
                }
              }}
              onNavigationStateChange={onNavigationStateChange}
              onShouldStartLoadWithRequest={onShouldStartLoadWithRequest}
              allowsBackForwardNavigationGestures
              allowsInlineMediaPlayback
              mediaPlaybackRequiresUserAction={false}
              javaScriptEnabled
              domStorageEnabled
              sharedCookiesEnabled
              thirdPartyCookiesEnabled
              setSupportMultipleWindows={false}
              originWhitelist={['https://*', 'http://*']}
              applicationNameForUserAgent={`WorldChoirApp/${Platform.OS}`}
              startInLoadingState={false}
            />
          ) : (
            <View style={styles.errorBox}>
              <Text style={styles.errorTitle}>World Choir App</Text>
              <Text style={styles.errorBody}>{error}</Text>
              <Pressable style={styles.retryBtn} onPress={retry} accessibilityRole="button">
                <Text style={styles.retryLabel}>Retry</Text>
              </Pressable>
            </View>
          )}

          {loading && !error ? (
            <View style={styles.loadingOverlay} pointerEvents="none">
              <ActivityIndicator size="large" color="#4ec5e8" />
              <Text style={styles.loadingLabel}>Loading World Choir…</Text>
            </View>
          ) : null}
        </View>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#000000',
  },
  shell: {
    flex: 1,
    backgroundColor: '#000000',
  },
  webview: {
    flex: 1,
    backgroundColor: '#000000',
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#000000',
    gap: 14,
  },
  loadingLabel: {
    color: '#8a8e9a',
    fontSize: 15,
    fontWeight: '500',
  },
  errorBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
    backgroundColor: '#000000',
    gap: 12,
  },
  errorTitle: {
    color: '#ffffff',
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 4,
  },
  errorBody: {
    color: '#8a8e9a',
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
  },
  retryBtn: {
    marginTop: 10,
    backgroundColor: '#4ec5e8',
    paddingHorizontal: 22,
    paddingVertical: 12,
    borderRadius: 10,
  },
  retryLabel: {
    color: '#000000',
    fontSize: 16,
    fontWeight: '700',
  },
});
