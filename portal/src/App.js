// src/App.js
import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { useAuth0 } from '@auth0/auth0-react';

import Navbar from './components/Navbar';
import HomePage from './components/HomePage';
import DebatePage from './components/DebatePage';
import MyDebatesPage from './components/MyDebatesPage';
import PublicDebatesPage from './components/PublicDebatesPage';
import ProtectedRoute from './components/ProtectedRoute';
import UserSettingsPage from './components/UserSettingsPage';
import './App.css';

const MainAppLoadingIndicator = () => (
  <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', fontSize: '1.5rem', color: '#333' }}>
    <p>Initializing Application...</p>
  </div>
);

function App() {
  const { isLoading: authIsLoading, error: authError } = useAuth0();

  if (authIsLoading) {
    return <MainAppLoadingIndicator />;
  }

  if (authError) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', height: '100vh', color: 'red', padding: '20px', textAlign: 'center' }}>
        <h2>Authentication Error</h2>
        <p>{authError.message}</p>
        <p>Please check your Auth0 configuration in the .env file and the Auth0 dashboard.</p>
        <p>Ensure Redirect URIs and Web Origins are correctly set (e.g., http://localhost:3000).</p>
      </div>
    );
  }
  
  return (
    <Router>
      <div className="App">
        <Navbar />
        <main className="App-content">
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route
              path="/my-debates"
              element={
                <ProtectedRoute>
                  <MyDebatesPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/public-debates"
              element={
                <ProtectedRoute>
                  <PublicDebatesPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/debate/:debateId"
              element={
                <ProtectedRoute>
                  <DebatePage />
                </ProtectedRoute>
              }
            />
            <Route 
              path="/settings" 
              element={
                <ProtectedRoute>
                  <UserSettingsPage />
                </ProtectedRoute>
              } 
            />
          </Routes>
        </main>
      </div>
    </Router>
  );
}

export default App;