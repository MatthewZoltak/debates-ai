// src/components/DebatePage.js
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import '../App.css';

const API_URL = 'http://127.0.0.1:5000'; // Your backend API URL

// --- Web Speech API Helper (ensure this is robust) ---
const synth = window.speechSynthesis;
let voices = [];

const loadVoices = () => {
    voices = synth.getVoices();
    // console.log("Voices loaded in DebatePage:", voices.length, voices.map(v => v.name));
};

const speak = (text, speakerRole) => {
    return new Promise((resolve, reject) => {
        if (!text || text.trim() === "") {
            // console.warn("Speak called with empty or whitespace-only text.");
            resolve(); return;
        }
        if (!synth) {
            console.warn("Speech Synthesis not supported.");
            resolve(); return;
        }
        if (synth.speaking) {
            // console.warn("Synth was already speaking - cancelling before new utterance for:", text.substring(0,20));
            synth.cancel(); // Cancel previous, then queue new one after a short delay
            setTimeout(() => startSpeakingInternal(text, speakerRole, resolve, reject), 150); // Increased delay slightly for cancel to settle
        } else {
            startSpeakingInternal(text, speakerRole, resolve, reject);
        }
    });
};

const startSpeakingInternal = (text, speakerRole, resolve, reject) => {
    if (voices.length === 0) {
        loadVoices(); // Attempt to load voices if empty
        // If still no voices, try once more after a delay. This is a fallback.
        if (voices.length === 0) {
            // console.warn("Voices not available on first attempt in startSpeakingInternal. Retrying...");
            setTimeout(() => {
                loadVoices();
                proceedWithSpeech(text, speakerRole, resolve, reject);
            }, 300); // Further delay
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
        reject(event); // Reject the promise on error
    };
    console.log(`Speaking: "${text.substring(0,30)}..." with role: ${speakerRole}`);
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
    utterance.voice = selectedVoice || (voices.length > 0 ? voices[0] : undefined); // Fallback to first available voice
    // console.log(`Attempting to speak: "${text.substring(0,30)}..." with voice: ${utterance.voice?.name || 'System Default'}`);
    synth.speak(utterance);
};
// --- End Speech API Helper ---

function DebatePage() {
  const { debateId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();

  const [topic, setTopic] = useState('');
  const [currentInput, setCurrentInput] = useState('');
  const [debateLog, setDebateLog] = useState([]);
  const [questionsList, setQuestionsList] = useState([]);
  const [winner, setWinner] = useState(null);

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [needsQuestion, setNeedsQuestion] = useState(false);
  const [isDebateEnded, setIsDebateEnded] = useState(false);
  const [isJudged, setIsJudged] = useState(false);
  
  const debateLogRef = useRef(null);
  const initialLoadDoneRef = useRef(false); // Tracks if initial data load logic has run

  // Load voices (runs once on mount)
  useEffect(() => {
    loadVoices(); // Initial attempt
    if (speechSynthesis.onvoiceschanged !== undefined) {
        speechSynthesis.onvoiceschanged = loadVoices;
    }
    const voiceLoadInterval = setInterval(() => { // Fallback polling
        if (voices.length === 0) loadVoices();
        else clearInterval(voiceLoadInterval);
    }, 500);
    return () => {
        clearInterval(voiceLoadInterval);
        if (speechSynthesis.onvoiceschanged !== undefined) speechSynthesis.onvoiceschanged = null;
        synth.cancel(); // Important: Cancel any speech when component unmounts
    };
  }, []);


  const updateStateFromApiData = useCallback((data, isInitialSetup = false) => {
    setTopic(data.topic || '');
    setDebateLog(data.logs || []);
    setQuestionsList(data.questions || []);
    setWinner(data.winner || null);

    const hasWinner = !!data.winner;
    setIsJudged(hasWinner);
    const hasClosingArgs = data.logs?.some(log => log.response_type === 'closing_argument');
    setIsDebateEnded(hasWinner || hasClosingArgs || false);
    
    // Only set needsQuestion to true during initial setup if not ended/judged
    // For subsequent calls, the specific handler (like handleProcessTurn) will manage needsQuestion.
    if (isInitialSetup) {
        setNeedsQuestion(!hasWinner && !hasClosingArgs);
    }
    setIsLoading(false);
  }, []); // Empty deps as setters are stable


  // Effect for Initial Data Load (from navigation state or API)
  useEffect(() => {
    const loadInitialDebateData = async () => {
      // Ensure this entire block runs only once per component mount or debateId change
      if (initialLoadDoneRef.current && location.state === null) return; // Allow re-eval if location.state appears later (unlikely)

      setIsLoading(true);
      setError(null); // Clear previous errors on new load attempt

      if (location.state?.initialTopicData) {
        // console.log("DebatePage: Using initial data passed from HomePage via location.state");
        const initialData = location.state.initialTopicData;
        updateStateFromApiData(initialData, true); // true for isInitialSetup
        initialLoadDoneRef.current = true;

        // Speak the opening statements from the logs that were part of initialTopicData
        const openingLogs = initialData.logs || [];
        if (openingLogs.length > 0) {
            // console.log("DebatePage: Speaking opening statements...", openingLogs);
            for (const logEntry of openingLogs) {
                if (logEntry && logEntry.text) { // Ensure logEntry and text exist
                    await speak(logEntry.text, logEntry.speaker);
                }
            }
        }
        // No need to set isLoading(false) here, updateStateFromApiData does it.
      } else if (debateId) { // Direct load or reload, fetch from /get_debate
        if (initialLoadDoneRef.current) return; // Already loaded or tried loading
        // console.log(`DebatePage: No location.state.initialTopicData. Fetching data for debate ID: ${debateId}`);
        try {
          const response = await fetch(`${API_URL}/get_debate?debate_id=${debateId}`);
          if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            throw new Error(errData.error || `HTTP error! Status: ${response.status}`);
          }
          const data = await response.json();
          updateStateFromApiData(data, true); // true for isInitialSetup
          initialLoadDoneRef.current = true;
          // On direct load, we display logs but don't auto-speak the entire history.
        } catch (err) {
          console.error("DebatePage: Failed to fetch debate data on direct load:", err);
          setError(err.message || "Failed to load debate. Please try again or start a new one.");
          setIsLoading(false);
          initialLoadDoneRef.current = true; // Mark as attempted even if failed
        }
      } else {
        setError("No debate ID found and no initial data. Cannot load debate.");
        setIsLoading(false);
        initialLoadDoneRef.current = true; // Mark as attempted
      }
    };
    
    // Using a small timeout to allow voice loading mechanisms to potentially fire first
    const timeoutId = setTimeout(loadInitialDebateData, 100);
    return () => clearTimeout(timeoutId);

  }, [debateId, location.state, updateStateFromApiData]); // updateStateFromApiData is stable due to useCallback


  useEffect(() => {
    if (debateLogRef.current) {
      debateLogRef.current.scrollTop = debateLogRef.current.scrollHeight;
    }
  }, [debateLog]);


  const handleApiCall = async (endpoint, payload) => {
    setIsLoading(true); // Set loading true at the start of any API action
    setError(null);
    // Note: `speak` function now handles synth.cancel() if it's already speaking.
    // Avoid a general synth.cancel() here as it might cut off intended final speech from a previous step.

    try {
      const response = await fetch(`${API_URL}/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...payload, debate_id: debateId }),
      });
      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || `HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      
      // Update main state from the backend's source of truth
      updateStateFromApiData(data); // isInitialSetup is false here

      return data; // Return data for speaking the *new* parts
    } catch (err) {
      console.error(`Error calling ${endpoint}:`, err);
      setError(err.message || `Failed to process request on ${endpoint}.`);
      setIsLoading(false); // Ensure loading is false on error
      throw err; // Re-throw for the specific handler to catch if needed
    }
    // setIsLoading(false) will be handled by the specific calling function after speech
  };

  const handleProcessTurn = async (e) => {
    e.preventDefault();
    if (!currentInput.trim()) return;
    const question = currentInput;
    setCurrentInput('');
    setNeedsQuestion(false); // Submitted a question

    try {
      const data = await handleApiCall('process_turn', { question });
      // `updateStateFromApiData` (called within `handleApiCall`) has already updated the debateLog
      // Now, speak the new parts of this interaction
      await speak(`Next question: ${data.question}`, "Moderator"); // data.question is the user's input
      await speak(data.pro_side_response, "pro");
      await speak(data.con_side_response, "con");
      await speak(data.pro_side_rebuttal, "pro");
      await speak(data.con_side_rebuttal, "con");
      
      setNeedsQuestion(true); // Ready for a new question
    } catch (err) {
      setNeedsQuestion(true); // Allow user to try again even if API call failed
    } finally {
        setIsLoading(false); // Final loading state management
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
      // updateStateFromApiData already set isDebateEnded if logs reflect it
    } catch (err) {
      // Error handled
    } finally {
        setIsLoading(false);
    }
  };

  const handleJudgeDebate = async () => {
    try {
      const data = await handleApiCall('judge_debate', {});
      const winnerText = data.judgment?.toUpperCase() || "UNDEFINED";
      await speak(`After careful consideration, the winner of this debate is... the ${winnerText} side!`, "Judge");
      // updateStateFromApiData already set isJudged & winner
    } catch (err) {
      // Error handled
    } finally {
        setIsLoading(false);
    }
  };

  const resetAndGoHome = () => {
    synth.cancel();
    initialLoadDoneRef.current = false; // Reset for a fully fresh load if they come back
    navigate('/');
  }

  // Render Logic
  if (isLoading && !initialLoadDoneRef.current) {
    return <div className="App-main loading-indicator" style={{textAlign: 'center', padding: '2rem', fontSize: '1.5em'}}>Loading Debate Details...</div>;
  }

  return (
    <>
      <header className="App-header">
        <h1>🗣️ AI Debate Arena 🤖</h1>
        <button onClick={() => synth.cancel()} disabled={!synth || typeof synth.speaking === 'undefined' || !synth.speaking}>
            Stop Speaking
        </button>
        <button onClick={resetAndGoHome} style={{ marginLeft: '10px'}}>New Debate Topic</button>
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
                <div key={`${debateId}-${index}-${entry.speaker}-${entry.text?.slice(0,10)}`} /* More robust key */
                     className={`log-entry ${entry.speaker?.toLowerCase().replace(/[^a-z0-9]/g, '')}`}>
                    <strong>{entry.speaker}:</strong>
                    <p>{entry.text}</p>
                </div>
            ))}
            {isLoading && <div className="loading-indicator-inline">Processing... 🤔</div>} 
            {isJudged && winner && <div className="log-entry judge"><strong>--- FINAL VERDICT: {winner.toUpperCase()} WINS ---</strong></div>}
            </div>
        </section>

        {/* Input sections based on current debate state */}
        {!isJudged && !isDebateEnded && needsQuestion && !isLoading && (
            <section className="input-section">
                <h2>Engage Further</h2>
                <form onSubmit={handleProcessTurn} className="question-form">
                    <input
                        type="text"
                        value={currentInput}
                        onChange={(e) => setCurrentInput(e.target.value)}
                        placeholder="Enter Next Question..."
                    />
                    <button type="submit">Submit Question</button>
                </form>
                <button
                    className="closing-button"
                    onClick={handleClosingArguments}
                >
                    Proceed to Closing Arguments
                </button>
            </section>
        )}

        {!isJudged && isDebateEnded && !isLoading && (
            <section className="input-section judge-section">
                <h2>Awaiting Verdict</h2>
                <button
                    className="judge-button"
                    onClick={handleJudgeDebate}
                >
                    Judge the Debate! 🧑‍⚖️
                </button>
            </section>
        )}

        {isJudged && !isLoading && (
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
      <footer className="App-footer">
          <p>AI Debate Arena</p>
      </footer>
    </>
  );
}

export default DebatePage;