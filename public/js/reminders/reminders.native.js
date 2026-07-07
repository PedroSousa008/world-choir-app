/**
 * Remind Me — native app shell bridge (future Expo / React Native WebView)
 */
const WorldChoirRemindersNative = (() => {
  function isAvailable() {
    return !!(window.ReactNativeWebView || window.expo);
  }

  function open() {
    if (window.ReactNativeWebView?.postMessage) {
      window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'wc-open-reminders' }));
      return true;
    }
    return false;
  }

  return { isAvailable, open };
})();
