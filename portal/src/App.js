// src/App.js
import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import DebatePage from './components/DebatePage';
import HomePage from './components/HomePage';

import './App.css';

function App() {
  return (
    <Router>
      <div className="App"> {/* Moved className="App" here for consistent base styling */}
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/debate/:debateId" element={<DebatePage />} />
        </Routes>
      </div>
    </Router>
  );
}

export default App;