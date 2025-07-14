// src/components/DebatePage.js
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import { useAuth0 } from '@auth0/auth0-react'; // Import useAuth0
import { authenticatedFetch } from '../services/api'; // Import your helper
import './DebatePage.css';

// Speech API Helper - Keep your existing robust version here
// ... (your existing speak, startSpeakingInternal, proceedWithSpeech, loadVoices functions)
// Ensure synth and voices are defined as before
const synth = window.speechSynthesis;
let voices = [];
const loadVoices = () => { voices = synth.getVoices(); };
// ... rest of your speech helper functions ...
const speak = (text, speakerRole) => {
    return new Promise((resolve, reject) => {
        if (!text || text.trim() === "") { resolve(); return; }
        if (!synth) { console.warn("Speech Synthesis not supported."); resolve(); return; }
        if (synth.speaking) {
            synth.cancel(); 
            setTimeout(() => startSpeakingInternal(text, speakerRole, resolve, reject), 150);
        } else {
            startSpeakingInternal(text, speakerRole, resolve, reject);
        }
    });
};
const startSpeakingInternal = (text, speakerRole, resolve, reject) => {
    if (voices.length === 0) {
        loadVoices();
        if (voices.length === 0) {
            setTimeout(() => {
                loadVoices();
                proceedWithSpeech(text, speakerRole, resolve, reject);
            }, 300);
            return;
        }
    }
    proceedWithSpeech(text, speakerRole, resolve, reject);
};
const proceedWithSpeech = (text, speakerRole, resolve, reject) => {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.onend = resolve;
    utterance.onerror = (event) => {
        console.error('SpeechSynthesisUtterance.onerror for text "' + text.substring(0,30) + '...":', event);
        reject(event); 
    };
    let selectedVoice = null;
    if (voices.length > 0) {
        const lowerSpeakerRole = speakerRole.toLowerCase();
        if (lowerSpeakerRole.includes('judge') || lowerSpeakerRole.includes('moderator')) {
            selectedVoice = voices.find(v => (v.name.includes('David') || v.name.includes('Google US English')) && v.lang.startsWith('en')) || voices.find(v => v.lang.startsWith('en-US') && (v.name.includes('Google') || v.default));
        } else if (lowerSpeakerRole.includes('pro')) {
            selectedVoice = voices.find(v => (v.name.includes('Zira') || v.name.includes('Google UK English Female')) && v.lang.startsWith('en')) || voices.find(v => v.lang.startsWith('en-GB') && v.gender === 'female');
        } else if (lowerSpeakerRole.includes('con')) {
            selectedVoice = voices.find(v => (v.name.includes('Mark') || v.name.includes('Google UK English Male')) && v.lang.startsWith('en')) || voices.find(v => v.lang.startsWith('en-GB') && v.gender === 'male');
        }
        if (!selectedVoice) {
            selectedVoice = voices.find(v => v.lang.startsWith('en') && v.default) || voices.find(v => v.lang.startsWith('en')) || voices[0];
        }
    }
    utterance.voice = selectedVoice || (voices.length > 0 ? voices[0] : undefined); 
    synth.speak(utterance);
};


function DebatePage() {
  const { debateId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { getAccessTokenSilently, isAuthenticated } = useAuth0(); // Get token function

  // ... (your existing useState hooks for topic, debateLog, etc.)
  const [topic, setTopic] = useState('');
  const [currentInput, setCurrentInput] = useState('');
  const [debateLog, setDebateLog] = useState([]);
  // const [questionsList, setQuestionsList] = useState([]); // No longer directly used for display, but backend tracks
  const [winner, setWinner] = useState(null);

  const [isLoading, setIsLoading] = useState(true); // For page-level loading
  const [isProcessingAction, setIsProcessingAction] = useState(false); // For button actions
  const [error, setError] = useState(null);
  const [needsQuestion, setNeedsQuestion] = useState(false);
  const [isDebateEnded, setIsDebateEnded] = useState(false);
  const [isJudged, setIsJudged] = useState(false);
  const [debateInfo, setDebateInfo] = useState({
    is_public: false,
    like_count: 0,
    is_liked_by_user: false,
    creator_name: '',
    user_id: null,
  });
  const [liking, setLiking] = useState(false);
  const [togglingVisibility, setTogglingVisibility] = useState(false);
  
  const debateLogRef = useRef(null);
  const initialLoadDoneRef = useRef(false);

  useEffect(() => { /* ... your existing voice loading useEffect ... */
    loadVoices(); 
    if (speechSynthesis.onvoiceschanged !== undefined) {
        speechSynthesis.onvoiceschanged = loadVoices;
    }
    const voiceLoadInterval = setInterval(() => { 
        if (voices.length === 0) loadVoices();
        else clearInterval(voiceLoadInterval);
    }, 500);
    return () => {
        clearInterval(voiceLoadInterval);
        if (speechSynthesis.onvoiceschanged !== undefined) speechSynthesis.onvoiceschanged = null;
        synth.cancel(); 
    };
  }, []);

  const updateStateFromApiData = useCallback((data, isInitialSetup = false) => {
    setTopic(data.topic || '');
    setDebateLog(data.logs || []);
    // setQuestionsList(data.questions || []); // Backend manages this internally
    setWinner(data.winner || null);

    // Update debate info
    setDebateInfo({
      is_public: data.is_public || false,
      like_count: data.like_count || 0,
      is_liked_by_user: data.is_liked_by_user || false,
      creator_name: data.creator_name || '',
      user_id: data.user_id || null,
    });

    const hasWinner = !!data.winner;
    setIsJudged(hasWinner);
    
    const hasClosingArgs = data.logs?.some(
      log => log.speaker === 'moderator' && log.text.toLowerCase().includes('closing argument')
    ); 
    
    setIsDebateEnded(hasWinner || hasClosingArgs || false);
    
    if (isInitialSetup) {
        setNeedsQuestion(!hasWinner && !hasClosingArgs);
    }
    setIsLoading(false); // Page-level loading
    setIsProcessingAction(false); // Action-specific loading
  }, []);


  useEffect(() => { /* ... your existing initial data load useEffect ... */
    const loadInitialDebateData = async () => {
      if (initialLoadDoneRef.current && location.state === null) return;
      setIsLoading(true);
      setError(null);

      if (location.state?.initialTopicData) {
        const initialData = location.state.initialTopicData;
        updateStateFromApiData(initialData, true);
        initialLoadDoneRef.current = true;
        const openingLogs = initialData.logs || [];
        if (openingLogs.length > 0) {
            for (const logEntry of openingLogs) {
                if (logEntry && logEntry.text) {
                    await speak(logEntry.text, logEntry.speaker);
                }
            }
        }
      } else if (debateId && isAuthenticated) { // Only fetch if authenticated
        if (initialLoadDoneRef.current) { setIsLoading(false); return; }
        try {
          const data = await authenticatedFetch(
            `/get_debate?debate_id=${debateId}`, // Assuming this is your backend endpoint
            {},
            getAccessTokenSilently
          );
          updateStateFromApiData(data, true);
          initialLoadDoneRef.current = true;
        } catch (err) {
          console.error("DebatePage: Failed to fetch debate data on direct load:", err);
          setError(err.message || "Failed to load debate. Please ensure you are logged in or try again.");
          setIsLoading(false);
          initialLoadDoneRef.current = true;
        }
      } else if (debateId && !isAuthenticated) {
          setError("Please log in to view this debate.");
          setIsLoading(false);
          initialLoadDoneRef.current = true;
      } else {
        setError("No debate ID found. Cannot load debate.");
        setIsLoading(false);
        initialLoadDoneRef.current = true;
      }
    };
    
    const timeoutId = setTimeout(loadInitialDebateData, 100);
    return () => clearTimeout(timeoutId);

  }, [debateId, location.state, updateStateFromApiData, isAuthenticated, getAccessTokenSilently]);


  useEffect(() => { /* ... scroll to bottom ... */
    if (debateLogRef.current) {
      debateLogRef.current.scrollTop = debateLogRef.current.scrollHeight;
    }
  }, [debateLog]);

  // --- Updated handleApiCall to use authenticatedFetch ---
  const handleApiCall = async (endpoint, payload) => {
    setIsProcessingAction(true); // Use for button loading states
    setError(null);

    try {
      const data = await authenticatedFetch(
        `/${endpoint}`, // Assuming backend routes are prefixed with /api/
        {
          method: 'POST',
          body: JSON.stringify({ ...payload, debate_id: debateId }),
        },
        getAccessTokenSilently
      );
      
      updateStateFromApiData(data); // Update with the full state from backend
      return data; // Return data for speaking the *new* parts if needed
    } catch (err) {
      console.error(`Error calling ${endpoint}:`, err);
      setError(err.message || `Failed to process request on ${endpoint}.`);
      setIsProcessingAction(false); // Ensure loading is false on error
      throw err;
    }
    // setIsProcessingAction(false) will be handled by specific calling functions after speech
  };

  const handleProcessTurn = async (e) => {
    e.preventDefault();
    if (!currentInput.trim()) return;
    const questionText = currentInput; // Renamed to avoid conflict with backend's `question`
    setCurrentInput('');
    setNeedsQuestion(false);

    try {
      const data = await handleApiCall('process_turn', { question: questionText });
      // Backend's response `data` will have all the new statements.
      // `updateStateFromApiData` already updated the log.
      // Speak the new items if they are distinct from what updateStateFromApiData rendered.
      // For simplicity, we can rely on the backend sending specific fields for new speech.
      await speak(`Next question: ${data.last_question || questionText}`, "Moderator");
      await speak(data.pro_side_response, "pro");
      await speak(data.con_side_response, "con");
      await speak(data.pro_side_rebuttal, "pro");
      await speak(data.con_side_rebuttal, "con");
      
      setNeedsQuestion(true);
    } catch (err) {
      setNeedsQuestion(true);
    } finally {
        setIsProcessingAction(false);
    }
  };

  const handleClosingArguments = async () => {
    setNeedsQuestion(false);
    try {
      const data = await handleApiCall('closing_arguments', {});
      await speak("We will now hear the closing arguments.", "Moderator");
      await speak(data.pro_closing, "Pro");
      await speak(data.con_closing, "Con");
      await speak("This concludes our debate. We will now await judgment.", "Moderator");
    } catch (err) {
      // Error handled by handleApiCall
    } finally {
        setIsProcessingAction(false);
    }
  };

  const handleJudgeDebate = async () => {
    try {
      const data = await handleApiCall('judge_debate', {});
      const winnerText = data.judgment?.toUpperCase() || "UNDEFINED";
      await speak(`After careful consideration, the winner of this debate is... the ${winnerText} side!`, "Judge");
    } catch (err) {
      // Error handled
    } finally {
        setIsProcessingAction(false);
    }
  };

  const handleLike = async () => {
    if (!isAuthenticated) {
      setError('Please log in to like debates.');
      return;
    }

    setLiking(true);
    try {
      const data = await authenticatedFetch(
        '/toggle_like',
        {
          method: 'POST',
          body: JSON.stringify({ debate_id: debateId }),
        },
        getAccessTokenSilently
      );
      
      setDebateInfo(prev => ({
        ...prev,
        is_liked_by_user: data.is_liked,
        like_count: data.like_count,
      }));
    } catch (err) {
      console.error('Failed to toggle like:', err);
      setError('Failed to update like. Please try again.');
    } finally {
      setLiking(false);
    }
  };

  const handleToggleVisibility = async () => {
    setTogglingVisibility(true);
    try {
      const data = await authenticatedFetch(
        '/toggle_debate_visibility',
        {
          method: 'POST',
          body: JSON.stringify({ 
            debate_id: debateId, 
            is_public: !debateInfo.is_public 
          }),
        },
        getAccessTokenSilently
      );
      
      setDebateInfo(prev => ({
        ...prev,
        is_public: data.is_public,
      }));
    } catch (err) {
      console.error('Failed to toggle visibility:', err);
      setError('Failed to update debate visibility. Please try again.');
    } finally {
      setTogglingVisibility(false);
    }
  };

  const resetAndGoHome = () => { /* ... same as before ... */
    synth.cancel();
    initialLoadDoneRef.current = false; 
    navigate('/');
  };

  if (isLoading) { // Page-level initial loading
    return (
      <div className="debate-page">
        <div className="loading-message">Loading Debate Details...</div>
      </div>
    );
  }

  if (!isAuthenticated && !initialLoadDoneRef.current) { // If initial check shows not authenticated
      return (
        <div className="debate-page">
          <div className="error-message">Please log in to view or participate in debates.</div>
        </div>
      );
  }
  
  const getDebateStatus = () => {
    if (isJudged) return 'completed';
    if (isDebateEnded) return 'in-progress';
    return 'pending';
  };

  return ( // Your existing JSX, ensure buttons use `isProcessingAction` for disabled state
    <div className="debate-page">
      <div className="debate-header">
        <h2>🗣️ AI Debate Arena 🤖</h2>
        {topic && (
          <>
            <div className="debate-topic">{topic}</div>
            <div className={`debate-status ${getDebateStatus()}`}>
              {isJudged ? 'Completed' : isDebateEnded ? 'In Progress' : 'Pending'}
            </div>
            
            <div className="debate-info">
              <div className="debate-meta">
                <span className="creator">by {debateInfo.creator_name}</span>
                <div className="debate-stats">
                  <button
                    onClick={handleLike}
                    disabled={liking}
                    className={`like-button ${debateInfo.is_liked_by_user ? 'liked' : ''}`}
                  >
                    {debateInfo.is_liked_by_user ? '❤️' : '🤍'} {debateInfo.like_count}
                  </button>
                </div>
              </div>
              
              {isJudged && debateInfo.user_id && (
                <div className="debate-controls">
                  <button
                    onClick={handleToggleVisibility}
                    disabled={togglingVisibility}
                    className={`visibility-button ${debateInfo.is_public ? 'public' : 'private'}`}
                  >
                    {togglingVisibility ? 'Updating...' : 
                     debateInfo.is_public ? '🌍 Public' : '🔒 Private'}
                  </button>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {error && <div className="error-message">{error}</div>}

      {winner && (
        <div className="winner-announcement">
          🏆 Winner: {winner.toUpperCase()} SIDE 🏆
        </div>
      )}

      <div className="debate-chat">
        <div className="chat-messages" ref={debateLogRef}>
          {debateLog.map((entry, index) => (
            <div key={`${debateId}-${index}-${entry.speaker}-${entry.text?.slice(0,10)}`} className="message">
              <div className={`message-avatar ${entry.speaker?.toLowerCase()}`}>
                {entry.speaker?.charAt(0).toUpperCase()}
              </div>
              <div className="message-content">
                <div className="message-header">
                  <span className="message-author">{entry.speaker}</span>
                  <span className="message-time">
                    {new Date().toLocaleTimeString()}
                  </span>
                </div>
                <div className="message-text">{entry.text}</div>
              </div>
            </div>
          ))}
          {isProcessingAction && (
            <div className="message">
              <div className="message-avatar moderator">M</div>
              <div className="message-content">
                <div className="message-text">Processing... 🤔</div>
              </div>
            </div>
          )}
        </div>

        {!isJudged && !isDebateEnded && needsQuestion && !isProcessingAction && (
          <div className="chat-input">
            <form onSubmit={handleProcessTurn} className="input-form">
              <div className="input-group">
                <label htmlFor="question-input">Enter Next Question</label>
                <textarea
                  id="question-input"
                  value={currentInput}
                  onChange={(e) => setCurrentInput(e.target.value)}
                  placeholder="Ask a follow-up question to continue the debate..."
                  disabled={isProcessingAction}
                />
              </div>
              <button type="submit" className="send-button" disabled={isProcessingAction}>
                Submit Question
              </button>
            </form>
          </div>
        )}
      </div>

      <div className="debate-actions">
        {!isJudged && !isDebateEnded && !needsQuestion && !isProcessingAction && (
          <button
            className="action-button primary"
            onClick={handleClosingArguments}
            disabled={isProcessingAction}
          >
            Proceed to Closing Arguments
          </button>
        )}

        {!isJudged && isDebateEnded && !isProcessingAction && (
          <button
            className="action-button primary"
            onClick={handleJudgeDebate}
            disabled={isProcessingAction}
          >
            🧑‍⚖️ Judge the Debate!
          </button>
        )}

        {isJudged && !isProcessingAction && (
          <button
            className="action-button primary"
            onClick={resetAndGoHome}
          >
            Start a New Debate
          </button>
        )}

        <button
          className="action-button secondary"
          onClick={() => synth.cancel()}
          disabled={!synth || typeof synth.speaking === 'undefined' || !synth.speaking}
        >
          Stop Speaking
        </button>
      </div>
    </div>
  );
}

export default DebatePage;