// src/index.js
import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import reportWebVitals from './reportWebVitals';
import { Auth0Provider } from '@auth0/auth0-react';

const domain = process.env.REACT_APP_AUTH0_DOMAIN;
const clientId = process.env.REACT_APP_AUTH0_CLIENT_ID;
const audience = process.env.REACT_APP_AUTH0_AUDIENCE;

if (!domain || !clientId || !audience) {
  console.error(
    "Auth0 configuration is missing. " +
    "Ensure REACT_APP_AUTH0_DOMAIN, REACT_APP_AUTH0_CLIENT_ID, and REACT_APP_AUTH0_AUDIENCE are set in your .env file."
  );
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <Auth0Provider
      domain={domain}
      clientId={clientId}
      authorizationParams={{
        redirect_uri: window.location.origin, // e.g., http://localhost:3000
        audience: audience, // Request an access token for your API
      }}
      // You can also request specific scopes for the access token if your API uses them
      // scope="openid profile email read:debates"
    >
      <App />
    </Auth0Provider>
  </React.StrictMode>
);

reportWebVitals();