# Android WebView Configuration for Daily.co Broadcasting

## Required WebView Settings

```kotlin
// In your Android Activity or Fragment
webView.settings.apply {
    // CRITICAL: Enable JavaScript
    javaScriptEnabled = true
    
    // CRITICAL: Enable DOM storage for Daily.co
    domStorageEnabled = true
    
    // CRITICAL: Allow third-party cookies for Daily.co iframe
    mixedContentMode = WebSettings.MIXED_CONTENT_ALWAYS_ALLOW
    
    // Enable media playback
    mediaPlaybackRequiresUserGesture = false
    
    // Allow file access (for camera/mic)
    allowFileAccess = true
    allowContentAccess = true
    
    // Database support
    databaseEnabled = true
}

// CRITICAL: Grant camera/mic permissions automatically
webView.webChromeClient = object : WebChromeClient() {
    override fun onPermissionRequest(request: PermissionRequest) {
        // Auto-grant camera and microphone permissions
        request.grant(request.resources)
    }
}

// Enable remote debugging (optional, for troubleshooting)
WebView.setWebContentsDebuggingEnabled(true)
```

## Required AndroidManifest.xml Permissions

```xml
<!-- Camera and Microphone -->
<uses-permission android:name="android.permission.CAMERA" />
<uses-permission android:name="android.permission.RECORD_AUDIO" />
<uses-permission android:name="android.permission.MODIFY_AUDIO_SETTINGS" />

<!-- Internet -->
<uses-permission android:name="android.permission.INTERNET" />
<uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />

<!-- Foreground service (if running in background) -->
<uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
<uses-permission android:name="android.permission.FOREGROUND_SERVICE_CAMERA" />
<uses-permission android:name="android.permission.FOREGROUND_SERVICE_MICROPHONE" />

<!-- Wake lock (keep screen on during broadcast) -->
<uses-permission android:name="android.permission.WAKE_LOCK" />
```

## Runtime Permission Requests

```kotlin
// Request permissions before loading WebView
private fun requestPermissions() {
    val permissions = arrayOf(
        Manifest.permission.CAMERA,
        Manifest.permission.RECORD_AUDIO
    )
    
    ActivityCompat.requestPermissions(this, permissions, PERMISSION_REQUEST_CODE)
}

override fun onRequestPermissionsResult(
    requestCode: Int,
    permissions: Array<out String>,
    grantResults: IntArray
) {
    super.onRequestPermissionsResult(requestCode, permissions, grantResults)
    
    if (requestCode == PERMISSION_REQUEST_CODE) {
        if (grantResults.all { it == PackageManager.PERMISSION_GRANTED }) {
            // Permissions granted - safe to load WebView
            webView.loadUrl("https://your-app-url.com")
        } else {
            // Show error - camera/mic required
            Toast.makeText(this, "Camera and microphone required", Toast.LENGTH_LONG).show()
        }
    }
}
```

## Troubleshooting

### If Daily.co iframe is null:
1. Check `domStorageEnabled = true`
2. Check `javaScriptEnabled = true`
3. Verify `mixedContentMode = ALWAYS_ALLOW`
4. Enable remote debugging: `WebView.setWebContentsDebuggingEnabled(true)`
5. Check Chrome DevTools → `chrome://inspect` for errors

### If camera preview doesn't show:
1. Verify runtime permissions granted
2. Check `onPermissionRequest` auto-grants resources
3. Ensure `mediaPlaybackRequiresUserGesture = false`
4. Check logcat for permission denials

### If postMessage errors occur:
1. Daily.co requires iframe messaging - ensure no CSP blocking
2. Check for `SecurityError` in Chrome DevTools
3. Verify third-party cookies allowed