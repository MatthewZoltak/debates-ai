// src/components/HomePage.js
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth0 } from '@auth0/auth0-react';
import { authenticatedFetch } from '../services/api';
import './HomePage.css';

function HomePage() {
  const [topic, setTopic] = useState('');
  const [model, setModel] = useState('models/gemini-1.5-pro-latest');
  const [selectedApiKeyId, setSelectedApiKeyId] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [hasKey, setHasKey] = useState(false);
  const [keyValid, setKeyValid] = useState(false);
  const [checkingKey, setCheckingKey] = useState(true);
  const [availableApiKeys, setAvailableApiKeys] = useState([]);
  const navigate = useNavigate();
  const { getAccessTokenSilently, isAuthenticated, loginWithRedirect } = useAuth0();

  useEffect(() => {
    async function fetchKeyStatus() {
      setCheckingKey(true);
      try {
        const data = await authenticatedFetch('/api/user/api-key', { method: 'GET' }, getAccessTokenSilently);
        setHasKey(data.has_key);
        setKeyValid(data.valid);
        setAvailableApiKeys(data.api_keys || []);
        
        // Auto-select the first available key
        if (data.api_keys && data.api_keys.length > 0) {
          setSelectedApiKeyId(data.api_keys[0].id);
        }
      } catch (e) {
        console.error('Failed to fetch API key status:', e);
        setHasKey(false);
        setKeyValid(false);
        setAvailableApiKeys([]);
      } finally {
        setCheckingKey(false);
      }
    }
    if (isAuthenticated) fetchKeyStatus();
  }, [isAuthenticated, getAccessTokenSilently]);

  const handleStartDebate = async (e) => {
    e.preventDefault();
    if (!topic.trim()) {
      setError('Please enter a debate topic.');
      return;
    }
    if (!isAuthenticated) {
      loginWithRedirect({
        appState: { returnTo: window.location.pathname }
      });
      return;
    }
    if (!keyValid || !selectedApiKeyId) {
      setError('You must select a valid API key before starting a debate.');
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const data = await authenticatedFetch(
        '/start_debate',
        {
          method: 'POST',
          body: JSON.stringify({ 
            topic: topic, 
            model,
            api_key_id: selectedApiKeyId
          }),
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

  const getStatusClass = () => {
    if (error?.includes('API key')) return 'warning';
    if (error) return 'error';
    return 'info';
  };

  return (
    <div className="home-page">
      <div className="home-header">
        <h1>🗣️ AI Debate Arena 🤖</h1>
        <p>Welcome! Enter a topic to begin a new debate.</p>
        {!isAuthenticated && <p className="auth-notice">Please log in to start or view debates.</p>}
      </div>

      <div className="debate-section">
        <h2>Start a New Debate</h2>
        <form onSubmit={handleStartDebate} className="debate-form">
          <div className="form-group">
            <label htmlFor="debate-topic">Debate Topic</label>
            <input
              id="debate-topic"
              type="text"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="E.g., 'Should AI have rights?'"
              disabled={isLoading}
            />
          </div>
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="debate-model">Model</label>
              <select
                id="debate-model"
                value={model}
                onChange={e => setModel(e.target.value)}
                disabled={isLoading}
              >
                <option value="models/gemini-1.5-pro-latest">Gemini 1.5 Pro (latest)</option>
                <option value="models/gemini-1.0-pro">Gemini 1.0 Pro</option>
              </select>
            </div>
            <div className="form-group">
              <label htmlFor="api-key-select">API Key</label>
              <select
                id="api-key-select"
                value={selectedApiKeyId}
                onChange={e => setSelectedApiKeyId(e.target.value)}
                disabled={isLoading || availableApiKeys.length === 0}
              >
                {availableApiKeys.length === 0 ? (
                  <option value="">No API keys available</option>
                ) : (
                  availableApiKeys.map(key => (
                    <option key={key.id} value={key.id}>
                      {key.nickname} ({key.provider})
                    </option>
                  ))
                )}
              </select>
            </div>
            <button type="submit" disabled={isLoading || !keyValid || checkingKey || !selectedApiKeyId} className="start-debate-button">
              {isLoading ? 'Starting...' : (isAuthenticated ? 'Start Debate' : 'Log In to Start')}
            </button>
          </div>
        </form>

        {checkingKey && isAuthenticated && (
          <div className="loading-indicator">Checking API key status...</div>
        )}

        {!keyValid && isAuthenticated && !checkingKey && (
          <div className="api-key-notice">
            You must set a valid Gemini API key in <a href="/settings">Settings</a> before starting a debate.
          </div>
        )}

        {error && (
          <div className={`status-message ${getStatusClass()}`}>
            {error}
          </div>
        )}
      </div>

      <div className="home-footer">
        <p>Ready to engage?</p>
      </div>
    </div>
  );
}

export default HomePage;