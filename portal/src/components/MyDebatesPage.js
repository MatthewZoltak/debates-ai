// src/components/MyDebatesPage.js
import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth0 } from '@auth0/auth0-react'; // Import useAuth0
import { authenticatedFetch } from '../services/api'; // Import your helper
import '../App.css';
import './MyDebatesPage.css';


function MyDebatesPage() {
  const [debatesList, setDebatesList] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const { getAccessTokenSilently, isAuthenticated } = useAuth0(); // Get token function and auth state

  useEffect(() => {
    const fetchDebates = async () => {
      if (!isAuthenticated) { // Don't fetch if not authenticated
        setIsLoading(false);
        // Optionally, you could redirect or show a message,
        // but ProtectedRoute should handle unauthorized access.
        return;
      }
      setIsLoading(true);
      setError(null);
      try {
        // Backend should use the JWT to identify the user.
        // No user_id query parameter is needed anymore.
        // Ensure your backend endpoint /get_user_debates is updated accordingly.
        const data = await authenticatedFetch(
          '/get_user_debates', // Assuming your backend route is /get_user_debates
          {}, // No options needed for a GET request
          getAccessTokenSilently
        );
        setDebatesList(data.debates || []);
      } catch (err) {
        console.error("Failed to fetch debates:", err);
        setError(err.message || "Could not load debates. You might need to log in again.");
      } finally {
        setIsLoading(false);
      }
    };

    fetchDebates();
  }, [getAccessTokenSilently, isAuthenticated]); // Re-fetch if auth state or token function changes

  if (isLoading) {
    return <div className="App-main loading-indicator" style={{ textAlign: 'center', padding: '2rem', fontSize: '1.5em' }}>Loading My Debates...</div>;
  }

  if (error) {
    return <div className="App-main error-message" style={{ textAlign: 'center', padding: '2rem' }}>Error: {error}</div>;
  }

  if (!isAuthenticated) { // Should be handled by ProtectedRoute, but as a fallback
      return <div className="App-main" style={{ textAlign: 'center', padding: '2rem' }}>Please log in to see your debates.</div>
  }

  return (
    <div className="my-debates-page App-main">
      <header className="page-header">
        <h2>My Past Debates</h2>
      </header>
      {debatesList.length === 0 ? (
        <p className="no-debates-message">You haven't participated in any debates yet, or we couldn't load them.</p>
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