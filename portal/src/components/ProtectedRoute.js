// src/components/ProtectedRoute.js
import React from 'react';
import { useAuth0 } from '@auth0/auth0-react';
import './ProtectedRoute.css';

function ProtectedRoute({ children }) {
  const { isAuthenticated, isLoading, error } = useAuth0();

  if (isLoading) {
    return (
      <div className="protected-route">
        <div className="loading-container">
          <div className="loading-spinner"></div>
          <p className="loading-text">Loading authentication...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="protected-route">
        <div className="error-container">
          <div className="error-icon">⚠️</div>
          <h2 className="error-title">Authentication Error</h2>
          <p className="error-message">
            {error.message || 'An error occurred during authentication. Please try again.'}
          </p>
          <button 
            className="retry-button"
            onClick={() => window.location.reload()}
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="protected-route">
        <div className="error-container">
          <div className="error-icon">🔒</div>
          <h2 className="error-title">Authentication Required</h2>
          <p className="error-message">
            Please log in to access this page.
          </p>
          <button 
            className="retry-button"
            onClick={() => window.location.href = '/'}
          >
            Go to Home
          </button>
        </div>
      </div>
    );
  }

  return children;
}

export default ProtectedRoute;