'use client';

import { useEffect, useState } from 'react';

const phrases = [
  "Discover",
  "real",
  "job opportunities,",
  "filtered",
  "and delivered",
  "just for you."
];

const PHRASE_DURATION = 7;

export function OpeningSequence() {
  const [key, setKey] = useState(0);

  useEffect(() => {
    // Each phrase takes PHRASE_DURATION seconds.
    // We restart the sequence exactly when the last phrase finishes.
    const total = phrases.length * PHRASE_DURATION * 1000;
    const interval = setInterval(() => {
      setKey(k => k + 1);
    }, total);
    return () => clearInterval(interval);
  }, []);

  return (
    <div key={key} className="absolute inset-0 w-full h-full pointer-events-none z-20 flex items-center justify-center">
      <div className="os-phrases w-full h-full">
        {phrases.map((phrase, tIdx) => {
          const phraseDelay = tIdx * PHRASE_DURATION;
          const words = phrase.split(' ');
          let charOffset = 0;
          return (
            <h2
              key={tIdx}
              className="os-phrase"
              style={{ animationDelay: `${phraseDelay}s` }}
            >
              {words.map((word, wIdx) => {
                const chars = word.split('');
                const wordEl = (
                  <span key={wIdx} className="word">
                    {chars.map((char, cIdx) => {
                      const delay = phraseDelay + charOffset * 0.05;
                      charOffset++;
                      return (
                        <span key={cIdx} className="char">
                          <span className="char-inner" style={{ animationDelay: `${delay}s` }}>
                            {char}
                          </span>
                        </span>
                      );
                    })}
                  </span>
                );
                charOffset++; // space between words
                return wordEl;
              })}
            </h2>
          );
        })}
      </div>
    </div>
  );
}
