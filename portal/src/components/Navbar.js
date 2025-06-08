// src/components/Navbar.js
import React from 'react';
import { Link, NavLink } from 'react-router-dom';
import { useAuth0 } from '@auth0/auth0-react';
import './Navbar.css';

function Navbar() {
  const {
    loginWithRedirect,
    logout,
    user,
    isAuthenticated,
    isLoading: authIsLoading,
  } = useAuth0();

  return (
    <nav className="navbar">
      <div className="navbar-container">
        <Link to="/" className="navbar-logo">
          🗣️ AI Debate Arena
        </Link>
        <ul className="nav-menu">
          <li className="nav-item">
            <NavLink to="/" className={({ isActive }) => "nav-links" + (isActive ? " activated" : "")} end>
              Home
            </NavLink>
          </li>
          {isAuthenticated && ( // Only show "My Debates" if authenticated
            <li className="nav-item">
              <NavLink to="/my-debates" className={({ isActive }) => "nav-links" + (isActive ? " activated" : "")}>
                My Debates
              </NavLink>
            </li>
          )}
        </ul>
        <div className="navbar-auth-buttons">
          {authIsLoading ? (
            <span className="nav-links">Loading...</span>
          ) : !isAuthenticated ? (
            <button onClick={() => loginWithRedirect()} className="nav-button login-button">
              Log In / Sign Up
            </button>
          ) : (
            <>
              {user?.picture && <img src={user.picture} alt={user.name || "User"} className="navbar-user-pic" />}
              <span className="nav-links user-greeting">Hi, {user?.given_name || user?.nickname || 'User'}!</span>
              <button
                onClick={() => logout({ logoutParams: { returnTo: window.location.origin } })}
                className="nav-button logout-button"
              >
                Log Out
              </button>
            </>
          )}
        </div>
      </div>
    </nav>
  );
}

export default Navbar;