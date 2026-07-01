import React, { useState, useEffect, useRef } from 'react';
import './LyricPlayer.css';

const LyricPlayer = ({ 
  autoPlay = true, 
  showHistory = false,
  onSongEnd = () => {},
  className = ''
}) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [currentLyricIndex, setCurrentLyricIndex] = useState(-1);
  const [showCurrentLine, setShowCurrentLine] = useState(false);
  const audioRef = useRef(null);
  const animationRef = useRef(null);

  // Lyrics with timestamps
  const lyrics = [
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
  ];

  // Handle audio time updates
  const handleTimeUpdate = () => {
    if (audioRef.current) {
      const time = audioRef.current.currentTime;
      setCurrentTime(time);
      
      // Find current lyric based on time
      let newIndex = -1;
      for (let i = 0; i < lyrics.length; i++) {
        if (time >= lyrics[i].time) {
          newIndex = i;
        } else {
          break;
        }
      }
      
      if (newIndex !== currentLyricIndex) {
        setCurrentLyricIndex(newIndex);
        if (newIndex >= 0) {
          setShowCurrentLine(false);
          setTimeout(() => setShowCurrentLine(true), 50);
        }
      }
    }
  };

  // Handle play/pause
  const togglePlay = () => {
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
      } else {
        audioRef.current.play();
      }
    }
  };

  // Handle song end
  const handleSongEnd = () => {
    setIsPlaying(false);
    setCurrentLyricIndex(-1);
    setShowCurrentLine(false);
    onSongEnd();
  };

  // Auto-play effect
  useEffect(() => {
    if (autoPlay && audioRef.current) {
      audioRef.current.play().catch(e => {
        console.log('Auto-play blocked:', e);
      });
    }
  }, [autoPlay]);

  // Animation loop
  useEffect(() => {
    const animate = () => {
      if (audioRef.current) {
        handleTimeUpdate();
      }
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
  }, [isPlaying, currentLyricIndex]);

  // Handle audio events
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

  const currentLyric = currentLyricIndex >= 0 ? lyrics[currentLyricIndex] : null;
  const nextLyric = currentLyricIndex < lyrics.length - 1 ? lyrics[currentLyricIndex + 1] : null;

  return (
    <div className={`lyric-player ${className}`}>
      {/* Audio Element */}
      <audio
        ref={audioRef}
        src="./Imagine.mp3"
        preload="auto"
        onTimeUpdate={handleTimeUpdate}
      />
      
      {/* Main Content */}
      <div className="lyric-player-content">
        {/* Song Title */}
        <div className="song-title">
          <h1>Imagine</h1>
          <p>by John Lennon</p>
        </div>
        
        {/* Current Lyric Display */}
        <div className="current-lyric-container">
          {currentLyric && (
            <div className={`current-lyric ${showCurrentLine ? 'show' : ''}`}>
              {currentLyric.text}
            </div>
          )}
          
          {/* Next Lyric Preview */}
          {nextLyric && showHistory && (
            <div className="next-lyric">
              {nextLyric.text}
            </div>
          )}
        </div>
        
        {/* Controls */}
        <div className="lyric-controls">
          <button 
            className={`play-button ${isPlaying ? 'playing' : ''}`}
            onClick={togglePlay}
          >
            {isPlaying ? '⏸️' : '▶️'}
          </button>
          
          <div className="progress-container">
            <div 
              className="progress-bar"
              style={{ 
                width: `${audioRef.current ? (audioRef.current.currentTime / audioRef.current.duration) * 100 : 0}%` 
              }}
            />
          </div>
        </div>
        
        {/* Lyrics History */}
        {showHistory && (
          <div className="lyrics-history">
            {lyrics.map((lyric, index) => (
              <div 
                key={index}
                className={`history-line ${
                  index === currentLyricIndex ? 'current' : 
                  index < currentLyricIndex ? 'past' : 'future'
                }`}
              >
                {lyric.text}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default LyricPlayer; 