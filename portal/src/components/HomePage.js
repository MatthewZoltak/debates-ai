import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import '../App.css';

const API_URL = 'http://127.0.0.1:5000'; 

function HomePage() {
  const [topic, setTopic] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  const handleStartDebate = async (e) => {
    e.preventDefault();
    if (!topic.trim()) {
      setError('Please enter a debate topic.');
      return;
    }
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`${API_URL}/start_debate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic: topic }),
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || `HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      // Backend should now return debate_id along with initial data
      if (!data.debate_id) {
        throw new Error("Debate ID not received from server.");
      }

      // Navigate to the debate page, passing initial data via route state
      navigate(`/debate/${data.debate_id}`, {
        state: {
          initialTopicData: data // 'data' is the full JSON response from your /start_debate backend
        }
      });

    } catch (err) {
      console.error("Failed to start debate:", err);
      setError(err.message || "Failed to start debate. Please try again.");
      setIsLoading(false);
    }
  };

  return (
    <div className="App-main"> {/* Use App-main for consistent styling if needed */}
      <header className="App-header">
        <h1>🗣️ AI Debate Arena 🤖</h1>
        <p>Welcome! Enter a topic to begin a new debate.</p>
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
            {isLoading ? 'Starting...' : 'Start Debate'}
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