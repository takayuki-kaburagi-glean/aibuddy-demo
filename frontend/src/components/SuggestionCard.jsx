import React from 'react';

// A clean one-line suggestion row (spark + text + arrow). Long text is truncated.
export default function SuggestionCard({ title, onClick }) {
  return (
    <button className="suggestion" onClick={onClick} title={title}>
      <span className="suggestion-spark">✦</span>
      <span className="suggestion-title">{title}</span>
      <span className="suggestion-arrow">→</span>
    </button>
  );
}
