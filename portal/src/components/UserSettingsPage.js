import React, { useEffect, useState } from 'react';
import { useAuth0 } from '@auth0/auth0-react';
import { authenticatedFetch } from '../services/api';
import './UserSettingsPage.css';

function UserSettingsPage() {
  const [apiKeys, setApiKeys] = useState([]);
  const [showing, setShowing] = useState({});
  const [keyValues, setKeyValues] = useState({});
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [newKey, setNewKey] = useState('');
  const [newNickname, setNewNickname] = useState('');
  const [newProvider, setNewProvider] = useState('gemini');
  const [editing, setEditing] = useState({});
  const [editValues, setEditValues] = useState({});
  const { getAccessTokenSilently } = useAuth0();

  useEffect(() => {
    async function fetchKeys() {
      setLoading(true);
      try {
        const data = await authenticatedFetch('/api/user/api-keys', { method: 'GET' }, getAccessTokenSilently);
        setApiKeys(data.api_keys || []);
      } catch (e) {
        setStatus('Error fetching API keys.');
      } finally {
        setLoading(false);
      }
    }
    fetchKeys();
  }, [getAccessTokenSilently]);

  const handleShowHide = async (id, provider, show) => {
    if (show && !keyValues[id]) {
      try {
        const data = await authenticatedFetch(`/api/user/api-key/${id}`, { method: 'GET' }, getAccessTokenSilently);
        setKeyValues(kv => ({ ...kv, [id]: data.value }));
      } catch (e) {
        setStatus('Error fetching API key value.');
        return;
      }
    }
    setShowing(s => ({ ...s, [id]: show }));
  };

  async function handleAddKey(e) {
    e.preventDefault();
    setSaving(true);
    setStatus('');
    try {
      await authenticatedFetch(
        '/api/user/api-key',
        {
          method: 'POST',
          body: JSON.stringify({ 
            api_key: newKey, 
            nickname: newNickname,
            provider: newProvider 
          }),
        },
        getAccessTokenSilently
      );
      setStatus('API key added!');
      setNewKey('');
      setNewNickname('');
      const data = await authenticatedFetch('/api/user/api-keys', { method: 'GET' }, getAccessTokenSilently);
      setApiKeys(data.api_keys || []);
    } catch (e) {
      setStatus('Error adding API key.');
    } finally {
      setSaving(false);
    }
  }

  const handleEdit = (key) => {
    setEditing(e => ({ ...e, [key.id]: true }));
    setEditValues(ev => ({ ...ev, [key.id]: { provider: key.provider, nickname: key.nickname, value: '' } }));
  };

  const handleCancelEdit = (id) => {
    setEditing(e => ({ ...e, [id]: false }));
    setEditValues(ev => ({ ...ev, [id]: undefined }));
  };

  const handleSaveEdit = async (id) => {
    setSaving(true);
    setStatus('');
    try {
      const { provider, nickname, value } = editValues[id];
      await authenticatedFetch(
        `/api/user/api-key/${id}`,
        {
          method: 'PATCH',
          body: JSON.stringify({ 
            ...(provider && { provider }), 
            ...(nickname && { nickname }),
            ...(value && { api_key: value }) 
          }),
        },
        getAccessTokenSilently
      );
      setStatus('API key updated!');
      setEditing(e => ({ ...e, [id]: false }));
      setEditValues(ev => ({ ...ev, [id]: undefined }));
      const data = await authenticatedFetch('/api/user/api-keys', { method: 'GET' }, getAccessTokenSilently);
      setApiKeys(data.api_keys || []);
    } catch (e) {
      setStatus('Error updating API key.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    setSaving(true);
    setStatus('');
    try {
      await authenticatedFetch(
        `/api/user/api-key/${id}`,
        { method: 'DELETE' },
        getAccessTokenSilently
      );
      setStatus('API key deleted!');
      const data = await authenticatedFetch('/api/user/api-keys', { method: 'GET' }, getAccessTokenSilently);
      setApiKeys(data.api_keys || []);
    } catch (e) {
      setStatus('Error deleting API key.');
    } finally {
      setSaving(false);
    }
  };

  const getStatusClass = () => {
    if (status.includes('Error')) return 'error';
    if (status.includes('added') || status.includes('updated') || status.includes('deleted')) return 'success';
    return 'info';
  };

  return (
    <div className="user-settings-page">
      <div className="user-settings-header">
        <h2>API Key Management</h2>
        <p>Securely manage your Gemini API keys with descriptive nicknames</p>
      </div>

      <div className="add-key-section">
        <h3>Add New API Key</h3>
        <form onSubmit={handleAddKey} className="add-key-form">
          <div className="form-group">
            <label htmlFor="new-nickname">Nickname</label>
            <input
              id="new-nickname"
              type="text"
              value={newNickname}
              onChange={e => setNewNickname(e.target.value)}
              placeholder="e.g., 'My Personal Key', 'Work Project Key'"
              autoComplete="off"
            />
          </div>
          <div className="form-group">
            <label htmlFor="new-api-key">Gemini API Key</label>
            <input
              id="new-api-key"
              type="password"
              value={newKey}
              onChange={e => setNewKey(e.target.value)}
              placeholder="Paste your Gemini API key here"
              autoComplete="off"
            />
          </div>
          <div className="form-group">
            <label htmlFor="new-provider">Provider</label>
            <select
              id="new-provider"
              value={newProvider}
              onChange={e => setNewProvider(e.target.value)}
            >
              <option value="gemini">Gemini</option>
            </select>
          </div>
          <button type="submit" disabled={saving || !newKey || !newNickname} className="add-key-button">
            {saving ? 'Adding...' : 'Add API Key'}
          </button>
        </form>
      </div>

      {status && (
        <div className={`status-message ${getStatusClass()}`}>
          {loading ? 'Loading...' : status}
        </div>
      )}

      <div className="keys-section">
        <h3>Your API Keys</h3>
        {apiKeys.length === 0 ? (
          <div className="empty-state">
            <h4>No API keys yet</h4>
            <p>Add your first Gemini API key above to get started</p>
          </div>
        ) : (
          <table className="keys-table">
            <thead>
              <tr>
                <th>Nickname</th>
                <th>Provider</th>
                <th>Created</th>
                <th>API Key</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {apiKeys.map(key => (
                <tr key={key.id}>
                  {editing[key.id] ? (
                    <>
                      <td>
                        <div className="edit-form">
                          <div className="form-group">
                            <input
                              type="text"
                              value={editValues[key.id]?.nickname || ''}
                              onChange={e => setEditValues(ev => ({
                                ...ev,
                                [key.id]: { ...ev[key.id], nickname: e.target.value }
                              }))}
                              placeholder="Nickname"
                            />
                          </div>
                        </div>
                      </td>
                      <td>
                        <div className="edit-form">
                          <div className="form-group">
                            <select
                              value={editValues[key.id]?.provider || ''}
                              onChange={e => setEditValues(ev => ({
                                ...ev,
                                [key.id]: { ...ev[key.id], provider: e.target.value }
                              }))}
                            >
                              <option value="gemini">Gemini</option>
                            </select>
                          </div>
                        </div>
                      </td>
                      <td>{new Date(key.created_at).toLocaleDateString()}</td>
                      <td>
                        <div className="edit-form">
                          <div className="form-group">
                            <input
                              type="password"
                              value={editValues[key.id]?.value || ''}
                              onChange={e => setEditValues(ev => ({
                                ...ev,
                                [key.id]: { ...ev[key.id], value: e.target.value }
                              }))}
                              placeholder="New API key (leave blank to keep current)"
                            />
                          </div>
                        </div>
                      </td>
                      <td>
                        <div className="action-buttons">
                          <button
                            onClick={() => handleSaveEdit(key.id)}
                            disabled={saving}
                            className="save-button"
                          >
                            Save
                          </button>
                          <button
                            onClick={() => handleCancelEdit(key.id)}
                            disabled={saving}
                            className="cancel-button"
                          >
                            Cancel
                          </button>
                        </div>
                      </td>
                    </>
                  ) : (
                    <>
                      <td>{key.nickname}</td>
                      <td>{key.provider}</td>
                      <td>{new Date(key.created_at).toLocaleDateString()}</td>
                      <td>{new Date(key.updated_at).toLocaleDateString()}</td>
                      <td>
                        <div className="api-key-display">
                          {showing[key.id] ? (
                            <span className="key-value">{keyValues[key.id]}</span>
                          ) : (
                            <span className="key-masked">••••••••••••••••</span>
                          )}
                          <button
                            onClick={() => handleShowHide(key.id, key.provider, !showing[key.id])}
                            className="show-hide-button"
                          >
                            {showing[key.id] ? 'Hide' : 'Show'}
                          </button>
                        </div>
                      </td>
                      <td>
                        <div className="action-buttons">
                          <button
                            onClick={() => handleEdit(key)}
                            className="edit-button"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleDelete(key.id)}
                            disabled={saving}
                            className="delete-button"
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

export default UserSettingsPage; 