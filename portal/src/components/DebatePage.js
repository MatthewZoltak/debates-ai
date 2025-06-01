// src/components/DebatePage.js
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import '../App.css';

const API_URL = 'http://127.0.0.1:5000'; // Your backend API URL

// --- Web Speech API Helper (largely unchanged, ensure it's robust) ---
const synth = window.speechSynthesis;
let voices = [];

const loadVoices = () => {
    voices = synth.getVoices();
};

const speak = (text, speakerRole) => {
    return new Promise((resolve, reject) => {
        if (!text || text.trim() === "") {
            resolve(); return;
        }
        if (!synth) {
            console.warn("Speech Synthesis not supported.");
            resolve(); return;
        }
        if (synth.speaking) {
            synth.cancel();
            setTimeout(() => startSpeakingInternal(text, speakerRole, resolve, reject), 100); // Increased delay slightly
        } else {
            startSpeakingInternal(text, speakerRole, resolve, reject);
        }
    });
};

const startSpeakingInternal = (text, speakerRole, resolve, reject) => {
    if (voices.length === 0) {
        loadVoices();
        if (voices.length === 0) {
            setTimeout(() => { // Retry voice loading if still empty
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

  const [isLoading, setIsLoading] = useState(true); // Start with loading true
  const [error, setError] = useState(null);
  const [needsQuestion, setNeedsQuestion] = useState(false);
  const [isDebateEnded, setIsDebateEnded] = useState(false); // Based on fetched data or closing args
  const [isJudged, setIsJudged] = useState(false); // Based on fetched data or judge action

  const debateLogRef = useRef(null);
  const initialLoadCompleteRef = useRef(false); // Tracks if initial data load has occurred

  // Load voices
  useEffect(() => {
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

  const updateStateFromFetchedData = useCallback((data) => {
    setTopic(data.topic || '');
    setDebateLog(data.logs || []);
    setQuestionsList(data.questions || []);
    setWinner(data.winner || null);

    // Determine UI states from fetched data
    const hasWinner = !!data.winner;
    setIsJudged(hasWinner);

    // A simple heuristic for "ended": if there's a winner, or if closing arguments are prominent in logs
    const hasClosingArgs = data.logs?.some(log => log.response_type === 'closing_argument');
    setIsDebateEnded(hasWinner || hasClosingArgs || false);
    
    setNeedsQuestion(!hasWinner && !hasClosingArgs); // Needs question if not judged and not at closing yet
    setIsLoading(false);
  }, []);


  // Effect for Initial Data Load (from navigation state or API)
  useEffect(() => {
    const loadInitialData = async () => {
      if (initialLoadCompleteRef.current) return; // Ensure this runs only once

      setIsLoading(true);
      setError(null);
      
      if (location.state?.initialTopicData) { // Data passed from HomePage after /start_debate
        // console.log("Using initial data from HomePage:", location.state.initialTopicData);
        updateStateFromFetchedData(location.state.initialTopicData);
        initialLoadCompleteRef.current = true;

        // Speak the opening statements from the logs provided by /start_debate
        const openingLogs = location.state.initialTopicData.logs || [];
        if (openingLogs.length > 0) {
            for (const logEntry of openingLogs) {
                await speak(logEntry.text, logEntry.speaker);
            }
        }
        setNeedsQuestion(true); // After opening, it needs a question

      } else if (debateId) { // Direct load or reload, fetch from /get_debate
        // console.log(`Fetching data for debate ID: ${debateId}`);
        try {
          const response = await fetch(`${API_URL}/get_debate?debate_id=${debateId}`);
          if (!response.ok) {
            const errData = await response.json();
            throw new Error(errData.error || `HTTP error! Status: ${response.status}`);
          }
          const data = await response.json();
          updateStateFromFetchedData(data);
          initialLoadCompleteRef.current = true;
          // On direct load, we typically don't replay all speech.
          // UI is updated, user can proceed.
        } catch (err) {
          console.error("Failed to fetch debate data:", err);
          setError(err.message || "Failed to load debate. Please try again or start a new one.");
          setIsLoading(false);
        }
      } else {
        setError("No debate ID found. Cannot load debate.");
        setIsLoading(false);
      }
    };
    
    // Delay slightly for voices, and ensure it runs only once
    const timeoutId = setTimeout(loadInitialData, 100); 
    return () => clearTimeout(timeoutId);

  }, [debateId, location.state, updateStateFromFetchedData]);


  useEffect(() => {
    if (debateLogRef.current) {
      debateLogRef.current.scrollTop = debateLogRef.current.scrollHeight;
    }
  }, [debateLog]);

  const handleApiCall = async (endpoint, payload, method = 'POST') => {
    setIsLoading(true);
    setError(null);

    try {
      const requestOptions = {
        method: method,
        headers: { 'Content-Type': 'application/json' },
      };
      if (method === 'POST') {
        requestOptions.body = JSON.stringify({ ...payload, debate_id: debateId });
      }
      
      const fullUrl = method === 'GET' ? `${API_URL}/${endpoint}?${new URLSearchParams(payload)}` : `${API_URL}/${endpoint}`;
      const response = await fetch(fullUrl, requestOptions);

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || `HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      
      // Update logs and questions from the API response
      setDebateLog(data.logs || []);
      setQuestionsList(data.questions || []);
      if (data.topic) setTopic(data.topic); // Update topic if backend changes it (e.g. if it was null)
      if (data.winner) setWinner(data.winner);


      return data; // Return data for further processing (like speaking parts)
    } catch (err) {
      console.error(`Error calling ${endpoint}:`, err);
      setError(err.message || `Failed to process request on ${endpoint}.`);
      setIsLoading(false); // Ensure loading is false on error
      throw err;
    }
    // setIsLoading will be set to false by the calling function after speech
  };

  const handleProcessTurn = async (e) => {
    e.preventDefault();
    if (!currentInput.trim()) return;
    setNeedsQuestion(false);
    const question = currentInput;
    setCurrentInput('');

    try {
      // The backend /process_turn already adds all relevant entries to its logs
      // The response will contain these updated logs, and specific fields for the new spoken parts.
      const data = await handleApiCall('process_turn', { question });
      
      // Speak the new parts of the interaction
      // Assuming backend returns distinct fields for what was just generated
      await speak(`Next question: ${data.question}`, "Moderator"); // `data.question` is what user submitted
      await speak(data.pro_side_response, "Pro");
      await speak(data.con_side_response, "Con");
      await speak(data.pro_side_rebuttal, "Pro (Rebuttal)");
      await speak(data.con_side_rebuttal, "Con (Rebuttal)");
      
      setNeedsQuestion(true);
    } catch (err) {
      // Error already set by handleApiCall
      setNeedsQuestion(true); // Allow user to try again if API call failed
    } finally {
        setIsLoading(false);
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
      
      setIsDebateEnded(true);
    } catch (err) {
      // Error handled by handleApiCall
    } finally {
        setIsLoading(false);
    }
  };

  const handleJudgeDebate = async () => {
    try {
      const data = await handleApiCall('judge_debate', {});
      const winnerText = data.judgment?.toUpperCase() || "UNDEFINED";
      await speak(`After careful consideration, the winner of this debate is... the ${winnerText} side!`, "Judge");
      
      setIsJudged(true);
      setWinner(data.judgment); // Ensure winner state is updated
      setNeedsQuestion(false);
      setIsDebateEnded(true); // Judging implies debate ended
    } catch (err) {
      // Error handled by handleApiCall
    } finally {
        setIsLoading(false);
    }
  };

  const resetAndGoHome = () => {
    synth.cancel();
    initialLoadCompleteRef.current = false; // Reset for a fully fresh load if they come back
    navigate('/');
  }

  // Render Logic
  if (isLoading && !initialLoadCompleteRef.current && debateLog.length === 0) { // Show full page loading only on very initial load
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
                <div key={`${index}-${entry.speaker}-${entry.text?.substring(0,10)}`} /* More robust key */
                     className={`log-entry ${entry.speaker?.toLowerCase().replace(/[^a-z0-9]/g, '')}`}>
                    <strong>{entry.speaker}:</strong>
                    <p>{entry.text}</p>
                </div>
            ))}
            {/* More subtle loading indicator for subsequent actions */}
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