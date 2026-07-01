# LyricPlayer Component

A React component for playing "Imagine" by John Lennon with synchronized lyrics display. Features elegant, minimalist design with smooth animations and karaoke-style lyric highlighting.

## Features

- 🎵 **Synchronized Lyrics**: Lyrics change automatically based on audio timestamps
- 🎨 **Elegant Design**: Minimalist, modern UI with smooth transitions
- 📱 **Responsive**: Works on desktop and mobile devices
- 🎮 **Play Controls**: Play/pause button with visual feedback
- 📊 **Progress Bar**: Visual progress indicator
- 📜 **Lyrics History**: Optional display of all lyrics with current line highlighting
- 🔄 **Auto-play**: Optional automatic playback
- 🎯 **Smooth Animations**: Fade-in transitions for each lyric line

## Installation

1. Copy the component files to your React project:
   - `LyricPlayer.jsx`
   - `LyricPlayer.css`

2. Ensure you have the `Imagine.mp3` file in your public directory

## Usage

### Basic Usage

```jsx
import LyricPlayer from './components/LyricPlayer';

function App() {
  return (
    <div>
      <LyricPlayer />
    </div>
  );
}
```

### Advanced Usage

```jsx
import LyricPlayer from './components/LyricPlayer';

function App() {
  const handleSongEnd = () => {
    console.log('Song finished playing');
  };

  return (
    <LyricPlayer
      autoPlay={true}
      showHistory={false}
      onSongEnd={handleSongEnd}
      className="custom-lyric-player"
    />
  );
}
```

## Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `autoPlay` | boolean | `true` | Whether to start playing automatically |
| `showHistory` | boolean | `false` | Show all lyrics history below current line |
| `onSongEnd` | function | `() => {}` | Callback when song finishes |
| `className` | string | `''` | Additional CSS class name |

## Lyrics Timestamps

The component uses these predefined timestamps for "Imagine":

```javascript
[
  { time: 0, text: "Imagine there's no heaven" },
  { time: 5, text: "It's easy if you try" },
  { time: 10, text: "No hell below us" },
  { time: 14, text: "Above us only sky" },
  { time: 19, text: "Imagine all the people" },
  { time: 23, text: "Living for today... ah" },
  { time: 30, text: "Imagine there's no countries" },
  { time: 35, text: "It isn't hard to do" },
  { time: 39, text: "Nothing to kill or die for" },
  { time: 44, text: "And no religion too" },
  { time: 49, text: "Imagine all the people" },
  { time: 53, text: "Living life in peace... you..." },
  { time: 60, text: "You may say I'm a dreamer" },
  { time: 65, text: "But I'm not the only one" },
  { time: 69, text: "I hope someday you'll join us" },
  { time: 74, text: "And the world will be as one" }
]
```

## Styling

The component uses CSS modules with elegant styling:

- **Background**: Gradient blue background
- **Typography**: Clean, readable fonts with text shadows
- **Animations**: Smooth fade-in transitions for lyrics
- **Controls**: Glassmorphism-style play button with pulse animation
- **Progress Bar**: Elegant progress indicator
- **Responsive**: Adapts to different screen sizes

## Customization

You can customize the appearance by:

1. **Modifying CSS variables** in `LyricPlayer.css`
2. **Adding custom classes** via the `className` prop
3. **Overriding styles** with CSS specificity

## Browser Compatibility

- ✅ Chrome/Edge (latest)
- ✅ Firefox (latest)
- ✅ Safari (latest)
- ✅ Mobile browsers

## Audio Requirements

- **File**: `Imagine.mp3` must be in the public directory
- **Format**: MP3 format recommended
- **Size**: Optimize for web (typically 3-5MB)

## Demo

To see the component in action, use the `LyricPlayerDemo` component:

```jsx
import LyricPlayerDemo from './components/LyricPlayerDemo';

function App() {
  return <LyricPlayerDemo />;
}
```

## Troubleshooting

### Audio Not Playing
- Ensure `Imagine.mp3` is in the public directory
- Check browser autoplay policies
- Verify audio file is not corrupted

### Lyrics Not Syncing
- Check that timestamps match your audio file
- Ensure audio file is the same version as timestamps
- Verify browser supports audio APIs

### Styling Issues
- Check CSS file is properly imported
- Verify no conflicting styles
- Test on different browsers

## License

This component is part of the World Choir project. 