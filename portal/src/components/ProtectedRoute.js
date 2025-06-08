// src/components/ProtectedRoute.js
import React from 'react';
import { withAuthenticationRequired } from '@auth0/auth0-react';

const LoadingIndicator = () => (
  <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 'calc(100vh - 60px)', fontSize: '1.5rem', color: '#333' }}>
    <p>Loading...</p>
  </div>
);

const ProtectedRoute = ({ component, ...args }) => {
  const Component = withAuthenticationRequired(component, {
    onRedirecting: () => <LoadingIndicator />,
    // This ensures that after login, the user is returned to the page they were trying to access
    returnTo: window.location.pathname + window.location.search,
  });

  return <Component {...args} />;
};

export default ProtectedRoute;