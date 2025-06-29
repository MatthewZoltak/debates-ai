// src/components/DebatePage.js
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import { useAuth0 } from '@auth0/auth0-react'; // Import useAuth0
import { authenticatedFetch } from '../services/api'; // Import your helper
import '../App.css';

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

  const resetAndGoHome = () => { /* ... same as before ... */
    synth.cancel();
    initialLoadDoneRef.current = false; 
    navigate('/');
  };

  if (isLoading) { // Page-level initial loading
    return <div className="App-main loading-indicator" style={{textAlign: 'center', padding: '2rem', fontSize: '1.5em'}}>Loading Debate Details...</div>;
  }

  if (!isAuthenticated && !initialLoadDoneRef.current) { // If initial check shows not authenticated
      return <div className="App-main error-message" style={{textAlign: 'center', padding: '2rem'}}>Please log in to view or participate in debates.</div>;
  }
  
  return ( // Your existing JSX, ensure buttons use `isProcessingAction` for disabled state
    <>
      <header className="App-header">
        <h1>🗣️ AI Debate Arena 🤖</h1>
        <button onClick={() => synth.cancel()} disabled={!synth || typeof synth.speaking === 'undefined' || !synth.speaking}>
            Stop Speaking
        </button>
        <button onClick={resetAndGoHome} style={{ marginLeft: '10px'}} disabled={isProcessingAction}>New Debate Topic</button>
      </header>

      <main className="App-main">
        {topic && (
          <section className="topic-display">
            <h2>Debating: {topic}</h2>
            <p style={{fontSize: '0.8em', color: '#aaa'}}>Debate ID: {debateId}</p>
          </section>
        )}

        {error && <div className="error-message">{error}</div>}

        <section className="debate-log-section">
            <h2>Debate Log</h2>
            <div className="debate-log" ref={debateLogRef}>
            {debateLog.map((entry, index) => (
                <div key={`${debateId}-${index}-${entry.speaker}-${entry.text?.slice(0,10)}`}
                     className={`log-entry ${entry.speaker?.toLowerCase().replace(/[^a-z0-9]/g, '')}`}>
                    <strong>{entry.speaker}:</strong>
                    <p>{entry.text}</p>
                </div>
            ))}
            {isProcessingAction && <div className="loading-indicator-inline">Processing... 🤔</div>}
            {isJudged && winner && <div className="log-entry judge"><strong>--- FINAL VERDICT: {winner.toUpperCase()} WINS ---</strong></div>}
            </div>
        </section>

        {!isJudged && !isDebateEnded && needsQuestion && !isProcessingAction && (
            <section className="input-section">
                <h2>Engage Further</h2>
                <form onSubmit={handleProcessTurn} className="question-form">
                    <input
                        type="text"
                        value={currentInput}
                        onChange={(e) => setCurrentInput(e.target.value)}
                        placeholder="Enter Next Question..."
                        disabled={isProcessingAction}
                    />
                    <button type="submit" disabled={isProcessingAction}>Submit Question</button>
                </form>
                <button
                    className="closing-button"
                    onClick={handleClosingArguments}
                    disabled={isProcessingAction}
                >
                    Proceed to Closing Arguments
                </button>
            </section>
        )}

        {!isJudged && isDebateEnded && !isProcessingAction && (
            <section className="input-section judge-section">
                <h2>Awaiting Verdict</h2>
                <button
                    className="judge-button"
                    onClick={handleJudgeDebate}
                    disabled={isProcessingAction}
                >
                    Judge the Debate! 🧑‍⚖️
                </button>
            </section>
        )}

        {isJudged && !isProcessingAction && (
            <section className="input-section new-debate-section">
                <h2>Debate Complete!</h2>
                <button
                    className="new-debate-button"
                    onClick={resetAndGoHome}
                >
                    Start a New Debate
                </button>
            </section>
        )}
      </main>
      {/* ... footer ... */}
    </>
  );
}

export default DebatePage;