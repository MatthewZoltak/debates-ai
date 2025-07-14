import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth0 } from '@auth0/auth0-react';
import { authenticatedFetch } from '../services/api';
import './PublicDebatesPage.css';

function PublicDebatesPage() {
  const [debates, setDebates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [sortBy, setSortBy] = useState('created_at');
  const [liking, setLiking] = useState({});
  const { getAccessTokenSilently, isAuthenticated } = useAuth0();

  useEffect(() => {
    fetchPublicDebates();
  }, [page, sortBy]);

  const fetchPublicDebates = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await authenticatedFetch(
        `/get_public_debates?page=${page}&per_page=10&sort_by=${sortBy}`,
        { method: 'GET' },
        getAccessTokenSilently
      );
      setDebates(data.debates || []);
      setTotalPages(data.total_pages || 1);
    } catch (err) {
      console.error('Failed to fetch public debates:', err);
      setError('Failed to load public debates. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleLike = async (debateId) => {
    if (!isAuthenticated) {
      setError('Please log in to like debates.');
      return;
    }

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

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const getWinnerDisplay = (winner) => {
    if (!winner) return <span className="winner pending">Pending</span>;
    return <span className={`winner ${winner.toLowerCase()}`}>{winner}</span>;
  };

  if (loading && page === 1) {
    return (
      <div className="public-debates-page">
        <div className="loading-section">
          <p>Loading public debates...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="public-debates-page">
      <div className="public-debates-header">
        <h2>🌍 Public Debates</h2>
        <p>Discover and engage with debates from the community</p>
      </div>

      <div className="controls-section">
        <div className="sort-controls">
          <label htmlFor="sort-select">Sort by:</label>
          <select
            id="sort-select"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="sort-select"
          >
            <option value="created_at">Newest First</option>
            <option value="likes">Most Liked</option>
            <option value="topic">Topic A-Z</option>
          </select>
        </div>
      </div>

      {error && (
        <div className="error-message">
          {error}
        </div>
      )}

      {debates.length === 0 && !loading ? (
        <div className="empty-state">
          <h3>No public debates yet</h3>
          <p>Be the first to share a completed debate with the community!</p>
          <Link to="/" className="start-debate-button">
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
                  <span className="creator">by {debate.creator_name}</span>
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

              <div className="debate-actions">
                <Link to={`/debate/${debate.id}`} className="view-debate-button">
                  View Debate
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <div className="pagination">
          <button
            onClick={() => setPage(prev => Math.max(1, prev - 1))}
            disabled={page === 1}
            className="pagination-button"
          >
            Previous
          </button>
          <span className="page-info">
            Page {page} of {totalPages}
          </span>
          <button
            onClick={() => setPage(prev => Math.min(totalPages, prev + 1))}
            disabled={page === totalPages}
            className="pagination-button"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}

export default PublicDebatesPage; 