// src/components/Navbar.js
import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth0 } from '@auth0/auth0-react';
import './Navbar.css';

function Navbar() {
  const { isAuthenticated, loginWithRedirect, logout, user } = useAuth0();
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleLogin = () => {
    loginWithRedirect({
      appState: { returnTo: window.location.pathname }
    });
  };

  const handleLogout = () => {
    logout({
      logoutParams: {
        returnTo: window.location.origin
      }
    });
  };

  const toggleMobileMenu = () => {
    setMobileMenuOpen(!mobileMenuOpen);
  };

  const closeMobileMenu = () => {
    setMobileMenuOpen(false);
  };

  const isActive = (path) => {
    return location.pathname === path;
  };

  return (
    <nav className="navbar">
      <div className="navbar-container">
        <Link to="/" className="navbar-brand" onClick={closeMobileMenu}>
          <img src="/logo.svg" alt="AI Debate Arena" className="navbar-logo" />
          <span className="navbar-title">AI Debate Arena</span>
        </Link>

        {/* Desktop Navigation */}
        <ul className="navbar-nav">
          <li className="nav-item">
            <Link 
              to="/" 
              className={`nav-link ${isActive('/') ? 'active' : ''}`}
              onClick={closeMobileMenu}
            >
              🏠 Home
            </Link>
          </li>
          <li className="nav-item">
            <Link 
              to="/public-debates" 
              className={`nav-link ${isActive('/public-debates') ? 'active' : ''}`}
              onClick={closeMobileMenu}
            >
              🌍 Public Debates
            </Link>
          </li>
          {isAuthenticated && (
            <li className="nav-item">
              <Link 
                to="/my-debates" 
                className={`nav-link ${isActive('/my-debates') ? 'active' : ''}`}
                onClick={closeMobileMenu}
              >
                📚 My Debates
              </Link>
            </li>
          )}
          {isAuthenticated && (
            <li className="nav-item">
              <Link 
                to="/settings" 
                className={`nav-link ${isActive('/settings') ? 'active' : ''}`}
                onClick={closeMobileMenu}
              >
                ⚙️ Settings
              </Link>
            </li>
          )}
        </ul>

        {/* Desktop Auth Section */}
        <div className="auth-section">
          {isAuthenticated ? (
            <div className="user-info">
              <div className="user-avatar">
                {user?.name?.charAt(0) || user?.email?.charAt(0) || 'U'}
              </div>
              <span>{user?.name || user?.email}</span>
              <button onClick={handleLogout} className="auth-button logout">
                🚪 Logout
              </button>
            </div>
          ) : (
            <button onClick={handleLogin} className="auth-button login">
              🔑 Login
            </button>
          )}
        </div>

        {/* Mobile Menu Button */}
        <button 
          className="mobile-menu-button" 
          onClick={toggleMobileMenu}
          aria-label="Toggle mobile menu"
        >
          {mobileMenuOpen ? '✕' : '☰'}
        </button>
      </div>

      {/* Mobile Menu */}
      <div className={`mobile-menu ${mobileMenuOpen ? 'open' : ''}`}>
        <ul className="mobile-nav">
          <li className="nav-item">
            <Link 
              to="/" 
              className={`nav-link ${isActive('/') ? 'active' : ''}`}
              onClick={closeMobileMenu}
            >
              🏠 Home
            </Link>
          </li>
          <li className="nav-item">
            <Link 
              to="/public-debates" 
              className={`nav-link ${isActive('/public-debates') ? 'active' : ''}`}
              onClick={closeMobileMenu}
            >
              🌍 Public Debates
            </Link>
          </li>
          {isAuthenticated && (
            <li className="nav-item">
              <Link 
                to="/my-debates" 
                className={`nav-link ${isActive('/my-debates') ? 'active' : ''}`}
                onClick={closeMobileMenu}
              >
                📚 My Debates
              </Link>
            </li>
          )}
          {isAuthenticated && (
            <li className="nav-item">
              <Link 
                to="/settings" 
                className={`nav-link ${isActive('/settings') ? 'active' : ''}`}
                onClick={closeMobileMenu}
              >
                ⚙️ Settings
              </Link>
            </li>
          )}
        </ul>

        <div className="mobile-auth">
          {isAuthenticated ? (
            <>
              <div className="user-info">
                <div className="user-avatar">
                  {user?.name?.charAt(0) || user?.email?.charAt(0) || 'U'}
                </div>
                <span>{user?.name || user?.email}</span>
              </div>
              <button onClick={handleLogout} className="auth-button logout">
                🚪 Logout
              </button>
            </>
          ) : (
            <button onClick={handleLogin} className="auth-button login">
              🔑 Login
            </button>
          )}
        </div>
      </div>
    </nav>
  );
}

export default Navbar;