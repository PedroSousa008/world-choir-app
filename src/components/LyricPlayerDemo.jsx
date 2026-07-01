import React, { useState } from 'react';
import LyricPlayer from './LyricPlayer';
import './LyricPlayerDemo.css';

const LyricPlayerDemo = () => {
  const [showHistory, setShowHistory] = useState(false);
  const [autoPlay, setAutoPlay] = useState(true);

  return (
    <div className="lyric-player-demo">
      <div className="demo-controls">
        <h2>LyricPlayer Demo</h2>
        <div className="control-options">
          <label>
            <input
              type="checkbox"
              checked={autoPlay}
              onChange={(e) => setAutoPlay(e.target.checked)}
            />
            Auto-play
          </label>
          <label>
            <input
              type="checkbox"
              checked={showHistory}
              onChange={(e) => setShowHistory(e.target.checked)}
            />
            Show lyrics history
          </label>
        </div>
      </div>
      
      <LyricPlayer
        autoPlay={autoPlay}
        showHistory={showHistory}
        onSongEnd={() => console.log('Song ended')}
      />
    </div>
  );
};

export default LyricPlayerDemo; 