// src/components/MyDebatesPage.js
import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import '../App.css'; // For general styles
import './MyDebatesPage.css'; // For specific styles

const API_URL = 'http://127.0.0.1:5000'; // Your backend API URL
const USER_ID_FOR_MY_DEBATES = 1; // Hardcoded User ID for now

function MyDebatesPage() {
  const [debatesList, setDebatesList] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchDebates = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const response = await fetch(`${API_URL}/get_user_debates?user_id=${USER_ID_FOR_MY_DEBATES}`);
        if (!response.ok) {
          const errData = await response.json().catch(() => ({})); // Try to parse error, default to empty obj
          throw new Error(errData.error || `HTTP error! Status: ${response.status}`);
        }
        const data = await response.json();
        setDebatesList(data.debates || []);
      } catch (err) {
        console.error("Failed to fetch debates:", err);
        setError(err.message || "Could not load debates.");
      } finally {
        setIsLoading(false);
      }
    };

    fetchDebates();
  }, []); // Empty dependency array means this runs once on mount

  if (isLoading) {
    return <div className="App-main loading-indicator" style={{ textAlign: 'center', padding: '2rem', fontSize: '1.5em' }}>Loading My Debates...</div>;
  }

  if (error) {
    return <div className="App-main error-message" style={{ textAlign: 'center', padding: '2rem' }}>Error: {error}</div>;
  }

  return (
    <div className="my-debates-page App-main">
      <header className="page-header">
        <h2>My Past Debates</h2>
      </header>
      {debatesList.length === 0 ? (
        <p className="no-debates-message">You haven't participated in any debates yet.</p>
      ) : (
        <div className="debates-grid">
          {debatesList.map(debate => (
            <div key={debate.id} className="debate-card">
              <h3 className="debate-card-topic">{debate.topic || "Untitled Debate"}</h3>
              {debate.winner ? (
                <p className="debate-card-winner">Winner: <span className={debate.winner.toLowerCase()}>{debate.winner.toUpperCase()}</span></p>
              ) : (
                <p className="debate-card-winner">Winner: Not yet determined</p>
              )}
              <Link to={`/debate/${debate.id}`} className="debate-card-button">
                View Debate
              </Link>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default MyDebatesPage;