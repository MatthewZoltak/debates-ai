// src/services/api.js
const API_BASE_URL = process.env.REACT_APP_BACKEND_BASE_URL;

/**
 * Makes an authenticated API request.
 * @param {string} path The API path (e.g., '/start_debate').
 * @param {object} options Fetch options (method, body, etc.).
 * @param {function} getAccessTokenSilently Function from useAuth0().
 * @returns {Promise<any>} The JSON response from the API.
 * @throws {Error} If the API request fails or returns an error.
 */
export const authenticatedFetch = async (path, options = {}, getAccessTokenSilently) => {
  try {
    const token = await getAccessTokenSilently({
      authorizationParams: {
        audience: process.env.REACT_APP_AUTH0_AUDIENCE, // From your .env file
      },
    });

    const fetchOptions = {
      ...options,
      headers: {
        ...options.headers,
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json', // Default, can be overridden in options.headers
      },
    };

    const response = await fetch(`${API_BASE_URL}${path}`, fetchOptions);

    if (!response.ok) {
      let errorData;
      try {
        errorData = await response.json();
      } catch (e) {
        errorData = { error: response.statusText || 'Unknown server error' };
      }
      console.error('API Error Response:', errorData);
      throw new Error(errorData.error || `Request failed with status ${response.status}`);
    }

    // If response has no content, return null or an empty object as appropriate
    const contentType = response.headers.get("content-type");
    if (contentType && contentType.indexOf("application/json") !== -1) {
        return response.json();
    } else {
        return null; // Or response.text() if you expect text
    }

  } catch (error) {
    console.error('Authenticated fetch error:', error.message);
    // Handle specific Auth0 errors like 'login_required', 'consent_required' if necessary
    // For example, by re-throwing a specific error type or redirecting
    throw error; // Re-throw the error to be caught by the calling component
  }
};