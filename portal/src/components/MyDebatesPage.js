// src/components/MyDebatesPage.js
import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth0 } from '@auth0/auth0-react';
import { authenticatedFetch } from '../services/api';
import './MyDebatesPage.css';

function MyDebatesPage() {
  const [debates, setDebates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [togglingVisibility, setTogglingVisibility] = useState({});
  const [liking, setLiking] = useState({});
  const { getAccessTokenSilently } = useAuth0();

  useEffect(() => {
    fetchDebates();
  }, [getAccessTokenSilently]);

  const fetchDebates = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await authenticatedFetch('/get_user_debates', { method: 'GET' }, getAccessTokenSilently);
      setDebates(data.debates || []);
    } catch (err) {
      console.error('Failed to fetch debates:', err);
      setError('Failed to load your debates. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleToggleVisibility = async (debateId, currentVisibility) => {
    setTogglingVisibility(prev => ({ ...prev, [debateId]: true }));
    try {
      const data = await authenticatedFetch(
        '/toggle_debate_visibility',
        {
          method: 'POST',
          body: JSON.stringify({ 
            debate_id: debateId, 
            is_public: !currentVisibility 
          }),
        },
        getAccessTokenSilently
      );
      
      // Update the debate in the list
      setDebates(prevDebates =>
        prevDebates.map(debate =>
          debate.id === debateId
            ? { ...debate, is_public: data.is_public }
            : debate
        )
      );
    } catch (err) {
      console.error('Failed to toggle visibility:', err);
      setError('Failed to update debate visibility. Please try again.');
    } finally {
      setTogglingVisibility(prev => ({ ...prev, [debateId]: false }));
    }
  };

  const handleLike = async (debateId) => {
    setLiking(prev => ({ ...prev, [debateId]: true }));
    try {
      const data = await authenticatedFetch(
        '/toggle_like',
        {
          method: 'POST',
          body: JSON.stringify({ debate_id: debateId }),
        },
        getAccessTokenSilently
      );
      
      // Update the debate in the list
      setDebates(prevDebates =>
        prevDebates.map(debate =>
          debate.id === debateId
            ? {
                ...debate,
                is_liked_by_user: data.is_liked,
                like_count: data.like_count,
              }
            : debate
        )
      );
    } catch (err) {
      console.error('Failed to toggle like:', err);
      setError('Failed to update like. Please try again.');
    } finally {
      setLiking(prev => ({ ...prev, [debateId]: false }));
    }
  };

  const getWinnerDisplay = (winner) => {
    if (!winner) return <span className="winner pending">Pending</span>;
    return <span className={`winner ${winner.toLowerCase()}`}>{winner}</span>;
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  if (loading) {
    return (
      <div className="my-debates-page">
        <div className="loading-section">
          <p>Loading your debates...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="my-debates-page">
        <div className="error-section">
          <h3>Error Loading Debates</h3>
          <p>{error}</p>
          <button onClick={fetchDebates} className="retry-button">
            Try Again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="my-debates-page">
      <div className="my-debates-header">
        <h2>My Debates</h2>
        <p>View and continue your debate sessions</p>
      </div>

      {debates.length === 0 ? (
        <div className="no-debates-section">
          <h3>No debates yet</h3>
          <p>Start your first debate to see it here. Create engaging discussions on any topic you're curious about.</p>
          <Link to="/" className="start-first-debate-button">
            Start Your First Debate
          </Link>
        </div>
      ) : (
        <div className="debates-grid">
          {debates.map((debate) => (
            <div key={debate.id} className="debate-card">
              <div className="debate-header">
                <h3 className="debate-topic">{debate.topic}</h3>
                <div className="debate-meta">
                  <span className="date">{formatDate(debate.created_at)}</span>
                </div>
              </div>

              <div className="debate-status">
                {getWinnerDisplay(debate.winner)}
              </div>

              <div className="debate-stats">
                <div className="like-section">
                  <button
                    onClick={() => handleLike(debate.id)}
                    disabled={liking[debate.id]}
                    className={`like-button ${debate.is_liked_by_user ? 'liked' : ''}`}
                  >
                    {debate.is_liked_by_user ? '❤️' : '🤍'} {debate.like_count}
                  </button>
                </div>
              </div>

              <div className="debate-controls">
                {debate.winner && (
                  <button
                    onClick={() => handleToggleVisibility(debate.id, debate.is_public)}
                    disabled={togglingVisibility[debate.id]}
                    className={`visibility-button ${debate.is_public ? 'public' : 'private'}`}
                  >
                    {togglingVisibility[debate.id] ? 'Updating...' : 
                     debate.is_public ? '🌍 Public' : '🔒 Private'}
                  </button>
                )}
              </div>

              <div className="debate-actions">
                <Link to={`/debate/${debate.id}`} className="view-debate-button">
                  {debate.winner ? 'View Debate' : 'Continue Debate'}
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default MyDebatesPage;