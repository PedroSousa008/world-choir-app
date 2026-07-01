import React, { useState } from 'react';
import ImagineLyricPlayer from './ImagineLyricPlayer';
import './ImagineLyricPlayerDemo.css';

const ImagineLyricPlayerDemo = () => {
  const [autoPlay, setAutoPlay] = useState(true);
  const [showControls, setShowControls] = useState(true);

  return (
    <div className="imagine-lyric-player-demo">
      {showControls && (
        <div className="demo-controls">
          <h2>Imagine Lyric Player Demo</h2>
          <div className="control-options">
            <label>
              <input 
                type="checkbox" 
                checked={autoPlay} 
                onChange={(e) => setAutoPlay(e.target.checked)} 
              />
              Auto-play
            </label>
            <button 
              className="fullscreen-toggle"
              onClick={() => setShowControls(false)}
            >
              Enter Fullscreen Mode
            </button>
          </div>
          <div className="demo-info">
            <p>🎵 Features:</p>
            <ul>
              <li>10-second delay before lyrics appear</li>
              <li>Precise timing with start/end times</li>
              <li>Smooth fade-in transitions</li>
              <li>Single lyric line display</li>
              <li>Dark, emotional design</li>
            </ul>
          </div>
        </div>
      )}
      
      <ImagineLyricPlayer 
        autoPlay={autoPlay}
        onSongEnd={() => console.log('Song ended')}
        className={showControls ? 'with-controls' : 'fullscreen'}
      />
      
      {!showControls && (
        <button 
          className="exit-fullscreen"
          onClick={() => setShowControls(true)}
        >
          Exit Fullscreen
        </button>
      )}
    </div>
  );
};

export default ImagineLyricPlayerDemo; 