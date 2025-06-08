// src/components/HomePage.js
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth0 } from '@auth0/auth0-react'; // Import useAuth0
import { authenticatedFetch } from '../services/api'; // Import your helper
import '../App.css';

// API_URL is handled by authenticatedFetch
// const API_URL = 'http://127.0.0.1:5000';

function HomePage() {
  const [topic, setTopic] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const navigate = useNavigate();
  const { getAccessTokenSilently, isAuthenticated, loginWithRedirect } = useAuth0(); // Get token function and auth state

  const handleStartDebate = async (e) => {
    e.preventDefault();
    if (!topic.trim()) {
      setError('Please enter a debate topic.');
      return;
    }

    // If not authenticated, prompt to login before starting a debate
    if (!isAuthenticated) {
      loginWithRedirect({
        appState: { returnTo: window.location.pathname } // Optional: return to current page after login
      });
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const data = await authenticatedFetch(
        '/start_debate', // Assuming your backend route is /api/start_debate
        {
          method: 'POST',
          body: JSON.stringify({ topic: topic }),
          // Content-Type is handled by authenticatedFetch
        },
        getAccessTokenSilently
      );

      if (!data.debate_id) {
        throw new Error("Debate ID not received from server.");
      }

      navigate(`/debate/${data.debate_id}`, {
        state: {
          initialTopicData: data
        }
      });

    } catch (err) {
      console.error("Failed to start debate:", err);
      setError(err.message || "Failed to start debate. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="App-main">
      <header className="App-header">
        <h1>🗣️ AI Debate Arena 🤖</h1>
        <p>Welcome! Enter a topic to begin a new debate.</p>
        {!isAuthenticated && <p style={{color: '#ffcc00'}}>Please log in to start or view debates.</p>}
      </header>
      <section className="input-section">
        <h2>Start a New Debate</h2>
        <form onSubmit={handleStartDebate}>
          <input
            type="text"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="E.g., 'Should AI have rights?'"
            disabled={isLoading}
            className="topic-input-homepage"
          />
          <button type="submit" disabled={isLoading} className="start-button-homepage">
            {isLoading ? 'Starting...' : (isAuthenticated ? 'Start Debate' : 'Log In to Start')}
          </button>
        </form>
        {error && <div className="error-message" style={{marginTop: '1rem'}}>{error}</div>}
      </section>
      <footer className="App-footer">
          <p>Ready to engage?</p>
      </footer>
    </div>
  );
}

export default HomePage;