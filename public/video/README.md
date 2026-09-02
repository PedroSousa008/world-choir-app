# Pre-event live film

Place the official World Choir pre-event video here.

## Required file

| File | URL served by the app |
|------|------------------------|
| `pre-event.mp4` | `/video/pre-event.mp4` |

**Full path in this repo:** `public/video/pre-event.mp4`

The global live event loads this automatically at **15:55 UTC** on event day. No code changes are needed if you use this exact filename.

> **Official pre-event film** (~5 minutes). Plays once from **15:55 UTC**; the app transitions to the live song at **16:00 UTC**.

## Before event day — update duration

After you export the final film, open:

`public/js/live-event/live-event-config.js`

Set `videoDurationSeconds` to the **exact** runtime of your file in seconds (e.g. `297` for 4m 57s). This keeps late joiners and sync aligned until the browser reads video metadata.

## Format recommendations

- **Orientation:** landscape (16:9)
- **Container:** MP4
- **Video codec:** H.264 (best compatibility on mobile Safari and desktop)
- **Audio:** AAC (stereo is fine)

The film should be edited so its **ending aligns with 16:00 UTC** when playback starts at 15:55 UTC. The app transitions to the live song when the video **ends**, not when the countdown hits zero.

## Different filename or format

If you use another name (e.g. `world-choir-2027-pre-event.mp4`), update `videoUrl` in `live-event-config.js`:

```js
videoUrl: '/video/your-filename.mp4',
```

Bump the `?v=` cache query on that script in HTML if browsers cached an old config.
