// src/App.js
import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { useAuth0 } from '@auth0/auth0-react';

import Navbar from './components/Navbar';
import HomePage from './components/HomePage';
import DebatePage from './components/DebatePage';
import MyDebatesPage from './components/MyDebatesPage';
import ProtectedRoute from './components/ProtectedRoute'; // Import ProtectedRoute
import './App.css';

const MainAppLoadingIndicator = () => (
  <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', fontSize: '1.5rem', color: '#333' }}>
    <p>Initializing Application...</p>
  </div>
);

function App() {
  const { isLoading: authIsLoading, error: authError, isAuthenticated, loginWithRedirect } = useAuth0();

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

  if (!isAuthenticated) {
    loginWithRedirect(); // Redirect to Auth0 login if not authenticated
    return null; // Prevent rendering the app until authentication completes
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
              element={<ProtectedRoute component={MyDebatesPage} />}
            />
            <Route
              path="/debate/:debateId"
              element={<ProtectedRoute component={DebatePage} />}
            />
          </Routes>
        </main>
      </div>
    </Router>
  );
}

export default App;