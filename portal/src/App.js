// src/App.js
import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Navbar from './components/Navbar'; // Import Navbar
import HomePage from './components/HomePage';
import DebatePage from './components/DebatePage';
import MyDebatesPage from './components/MyDebatesPage'; // Import MyDebatesPage
import './App.css';


function App() {
  return (
    <Router>
      <div className="App"> {/* Base container for the whole app */}
        <Navbar /> {/* Navbar rendered consistently across pages */}
        <main className="App-content"> {/* Wrapper for page content below navbar */}
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/my-debates" element={<MyDebatesPage />} />
            <Route path="/debate/:debateId" element={<DebatePage />} />
          </Routes>
        </main>
      </div>
    </Router>
  );
}

export default App;