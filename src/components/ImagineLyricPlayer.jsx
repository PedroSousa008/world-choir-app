import React, { useState, useEffect, useRef } from 'react';
import './ImagineLyricPlayer.css';

const ImagineLyricPlayer = ({ 
  autoPlay = true, 
  onSongEnd = () => {},
  className = '' 
}) => {
  const [currentLyric, setCurrentLyric] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [showLyrics, setShowLyrics] = useState(false);
  const [lyricsStarted, setLyricsStarted] = useState(false);
  
  const audioRef = useRef(null);
  const animationRef = useRef(null);

  const lyrics = [
    { start: 14, end: 17, text: "Imagine there's no heaven" },
    { start: 20, end: 24, text: "It's easy if you try" },
    { start: 26, end: 29, text: "No hell below us" },
    { start: 33, end: 36, text: "Above us, only sky" },
    { start: 39, end: 43, text: "Imagine all the people" },
    { start: 44, end: 51, text: "Living for today" },

    { start: 52, end: 56, text: "Imagine there's no countries" },
    { start: 58, end: 62, text: "It isn't hard to do" },
    { start: 65, end: 68, text: "Nothing to kill or die for" },
    { start: 70, end: 75, text: "And no religion too" },
    { start: 77, end: 81, text: "Imagine all the people" },
    { start: 83, end: 90, text: "Living life in peace" },

    { start: 91, end: 94, text: "You may say I'm a dreamer" },
    { start: 97, end: 99, text: "But I'm not the only one" },
    { start: 102, end: 106, text: "I hope someday you'll join us" },
    { start: 109, end: 114, text: "And the world will be as one" },

    { start: 116, end: 119, text: "Imagine no possessions" },
    { start: 121, end: 124, text: "I wonder if you can" },
    { start: 127, end: 131, text: "No need for greed or hunger" },
    { start: 133, end: 137, text: "A brotherhood of man" },
    { start: 140, end: 144, text: "Imagine all the people" },
    { start: 146, end: 153, text: "Sharing all the world" },

    { start: 154, end: 157, text: "You may say I'm a dreamer" },
    { start: 160, end: 163, text: "But I'm not the only one" },
    { start: 165, end: 170, text: "I hope someday you'll join us" },
    { start: 171, end: 177, text: "And the world will be as one" }
  ];

  // Handle audio time updates
  const handleTimeUpdate = () => {
    if (!audioRef.current) return;
    
    const currentTime = audioRef.current.currentTime;
    
    // Wait 10 seconds before showing lyrics
    if (currentTime >= 10 && !lyricsStarted) {
      setLyricsStarted(true);
      setShowLyrics(true);
    }
    
    if (!lyricsStarted) return;
    
    // Find the current lyric based on timing
    const activeLyric = lyrics.find(lyric => 
      currentTime >= lyric.start && currentTime <= lyric.end
    );
    
    setCurrentLyric(activeLyric || null);
  };

  // Handle play/pause
  const togglePlay = () => {
    if (!audioRef.current) return;
    
    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play();
    }
  };

  // Handle song end
  const handleSongEnd = () => {
    setIsPlaying(false);
    setCurrentLyric(null);
    setShowLyrics(false);
    setLyricsStarted(false);
    onSongEnd();
  };

  // Auto-play effect
  useEffect(() => {
    if (autoPlay && audioRef.current) {
      audioRef.current.play().catch(e => console.log('Auto-play blocked:', e));
    }
  }, [autoPlay]);

  // Animation loop
  useEffect(() => {
    const animate = () => {
      handleTimeUpdate();
      animationRef.current = requestAnimationFrame(animate);
    };
    
    if (isPlaying) {
      animationRef.current = requestAnimationFrame(animate);
    }
    
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [isPlaying, lyricsStarted]);

  // Audio event handlers
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);
    const handleEnded = handleSongEnd;

    audio.addEventListener('play', handlePlay);
    audio.addEventListener('pause', handlePause);
    audio.addEventListener('ended', handleEnded);

    return () => {
      audio.removeEventListener('play', handlePlay);
      audio.removeEventListener('pause', handlePause);
      audio.removeEventListener('ended', handleEnded);
    };
  }, []);

  return (
    <div className={`imagine-lyric-player ${className}`}>
      <audio 
        ref={audioRef} 
        src="./Imagine.mp3" 
        preload="auto"
        onTimeUpdate={handleTimeUpdate}
      />
      
      <div className="lyric-player-content">
        <div className="song-info">
          <h1>Imagine</h1>
          <p>by John Lennon</p>
        </div>
        
        <div className="lyric-display">
          {!lyricsStarted && (
            <div className="waiting-message">
              <div className="spinner"></div>
              <p>Preparing lyrics...</p>
            </div>
          )}
          
          {showLyrics && currentLyric && (
            <div className="current-lyric">
              {currentLyric.text}
            </div>
          )}
          
          {showLyrics && !currentLyric && (
            <div className="no-lyric">
              <span>♪</span>
            </div>
          )}
        </div>
        
        <div className="controls">
          <button 
            className={`play-button ${isPlaying ? 'playing' : ''}`} 
            onClick={togglePlay}
          >
            {isPlaying ? '⏸️' : '▶️'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ImagineLyricPlayer; 