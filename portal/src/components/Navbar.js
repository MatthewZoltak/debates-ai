// src/components/Navbar.js
import React from 'react';
import { Link, NavLink } from 'react-router-dom';
import './Navbar.css'; // We'll create this CSS file

function Navbar() {
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
          <li className="nav-item">
            <NavLink to="/my-debates" className={({ isActive }) => "nav-links" + (isActive ? " activated" : "")}>
              My Debates
            </NavLink>
          </li>
        </ul>
      </div>
    </nav>
  );
}

export default Navbar;