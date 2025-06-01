// src/components/DebatePage.js
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import '../App.css'; // Assuming App.css is in src/

const API_URL = 'http://127.0.0.1:5000'; // Or your aiohttp URL

// --- Web Speech API Helper ---
const synth = window.speechSynthesis;
let voices = []; // Keep this global to the module or manage in React state if preferred

const loadVoices = () => {
    voices = synth.getVoices();
    // console.log("Voices loaded in DebatePage:", voices.length);
};

const speak = (text, speakerRole) => { // speakerRole for voice selection heuristic
    return new Promise((resolve, reject) => {
        if (!text || text.trim() === "") {
            // console.warn("Speak called with empty text.");
            resolve(); // Resolve immediately for empty text
            return;
        }
        if (!synth) {
            console.warn("Speech Synthesis not supported.");
            resolve();
            return;
        }

        // If synth is already speaking, cancel the previous utterance.
        // Then, use a short timeout to ensure the cancel operation completes
        // before starting the new one. This helps prevent overlaps or errors.
        if (synth.speaking) {
            // console.warn("Synth was already speaking - cancelling before new utterance.");
            synth.cancel();
            setTimeout(() => startSpeakingInternal(text, speakerRole, resolve, reject), 50); // Short delay
        } else {
            startSpeakingInternal(text, speakerRole, resolve, reject);
        }
    });
};

const startSpeakingInternal = (text, speakerRole, resolve, reject) => {
    if (voices.length === 0) { // Ensure voices are loaded
        loadVoices();
        if (voices.length === 0) {
            // console.warn("Voices not available yet for speech synthesis.");
            // Attempt to load them again after a short delay, then proceed.
            // This is a fallback, ideally onvoiceschanged handles this.
            setTimeout(() => {
                loadVoices();
                proceedWithSpeech(text, speakerRole, resolve, reject);
            }, 250);
            return;
        }
    }
    proceedWithSpeech(text, speakerRole, resolve, reject);
};

const proceedWithSpeech = (text, speakerRole, resolve, reject) => {
    const utterance = new SpeechSynthesisUtterance(text);

    utterance.onend = () => {
        // console.log("Finished speaking:", text.substring(0,30) + "...");
        resolve();
    };
    utterance.onerror = (event) => {
        console.error('SpeechSynthesisUtterance.onerror for text "' + text.substring(0,30) + '...":', event);
        reject(event);
    };

    let selectedVoice = null;
    if (voices.length > 0) {
        const lowerSpeakerRole = speakerRole.toLowerCase();
        // Heuristic voice selection based on role
        if (lowerSpeakerRole.includes('judge') || lowerSpeakerRole.includes('moderator')) {
            selectedVoice = voices.find(v => (v.name.includes('David') || v.name.includes('Google US English')) && v.lang.startsWith('en')) || voices.find(v => v.lang.startsWith('en-US') && (v.name.includes('Google') || v.default));
        } else if (lowerSpeakerRole.includes('pro')) {
            selectedVoice = voices.find(v => (v.name.includes('Zira') || v.name.includes('Google UK English Female')) && v.lang.startsWith('en')) || voices.find(v => v.lang.startsWith('en-GB') && v.gender === 'female');
        } else if (lowerSpeakerRole.includes('con')) {
            selectedVoice = voices.find(v => (v.name.includes('Mark') || v.name.includes('Google UK English Male')) && v.lang.startsWith('en')) || voices.find(v => v.lang.startsWith('en-GB') && v.gender === 'male');
        }
        // Fallbacks if specific role voices aren't found
        if (!selectedVoice) {
            selectedVoice = voices.find(v => v.lang.startsWith('en') && v.default) || voices.find(v => v.lang.startsWith('en')) || voices[0];
        }
    } else {
        // console.warn("No voices available for selection.");
    }
    
    utterance.voice = selectedVoice;
    if (selectedVoice) {
        // console.log(`Speaking "${text.substring(0, 20)}..." with ${utterance.voice?.name || 'default'}`);
    } else if (voices.length > 0) {
        // console.log(`Speaking "${text.substring(0, 20)}..." with system default voice (no specific match found, fallback to voices[0] if available).`);
        utterance.voice = voices[0]; // Try setting to the first available voice if no selection was made
    } else {
        // console.log(`Speaking "${text.substring(0, 20)}..." with system default voice (no voices loaded).`);
    }


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
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [needsQuestion, setNeedsQuestion] = useState(false);
  const [isDebateEnded, setIsDebateEnded] = useState(false);
  const [isJudged, setIsJudged] = useState(false);
  const [isDebateUiReady, setIsDebateUiReady] = useState(false); // Tracks if initial sequence is done

  const debateLogRef = useRef(null);
  const initialSequenceStartedRef = useRef(false); // Prevents initial sequence from running multiple times

  // Memoized addLogEntryAndSpeak
  const addLogEntryAndSpeak = useCallback(async (speaker, textToSpeak) => {
    if (textToSpeak && textToSpeak.trim() !== "") { // Only process if text is not empty
      setDebateLog(prevLog => [...prevLog, { speaker, text: textToSpeak }]);
      try {
        await speak(textToSpeak, speaker); // speaker is for voice selection heuristic
      } catch (err) {
        console.error("Speech failed for:", textToSpeak, err);
        setError(prevError => prevError ? prevError + "\nText-to-speech issue." : "Text-to-speech failed. Check browser support/permissions.");
      }
    }
  }, [setError]); // setError is stable

  // Effect for loading voices
  useEffect(() => {
    loadVoices(); // Initial attempt
    if (speechSynthesis.onvoiceschanged !== undefined) {
        speechSynthesis.onvoiceschanged = loadVoices;
    }
    // Fallback loading, as onvoiceschanged can be unreliable
    const voiceLoadInterval = setInterval(() => {
        if (voices.length === 0) {
            // console.log("Attempting to load voices via interval...");
            loadVoices();
        } else {
            clearInterval(voiceLoadInterval);
        }
    }, 500);

    return () => {
        clearInterval(voiceLoadInterval);
        if (speechSynthesis.onvoiceschanged !== undefined) { // Clean up listener
            speechSynthesis.onvoiceschanged = null;
        }
        synth.cancel(); // Cancel any speech when component unmounts
    };
  }, []);

  // Effect for initial debate sequence (runs once)
  useEffect(() => {
    const startInitialDebateSequence = async () => {
        if (location.state?.initialTopic && !initialSequenceStartedRef.current) {
            initialSequenceStartedRef.current = true; // Set flag immediately
            
            setIsLoading(true);
            setTopic(location.state.initialTopic);
            setDebateLog([]); // Clear any previous log from potential fast re-renders
            setError(null); // Clear previous errors

            await addLogEntryAndSpeak("Moderator", `Debate started on: ${location.state.initialTopic}`);
            await addLogEntryAndSpeak("Pro", location.state.proInitial);
            await addLogEntryAndSpeak("Con", location.state.conInitial);
            
            setIsDebateUiReady(true); // UI is now ready for questions
            setNeedsQuestion(true);
            setIsLoading(false);
        } else if (!location.state && debateId && !initialSequenceStartedRef.current) {
            initialSequenceStartedRef.current = true; // Also set flag here
            // This case handles a direct browser reload on the /debate/:debateId page.
            // We don't have location.state. We'd need to fetch the debate state.
            console.warn("DebatePage loaded without initial state from navigation. Fetching debate data from backend is required here but not implemented in this example.");
            setError("Debate data not available on reload. Please start a new debate or implement fetching existing debate state.");
            setIsLoading(false); // Stop loading as we can't proceed
            // To implement: call a backend endpoint like GET /debate_details/:debateId
            // then populate topic, and potentially replay the log or get current state.
        }
    };

    // Delay slightly to ensure voices might be loaded if `onvoiceschanged` is slow
    const initialSequenceTimeout = setTimeout(() => {
        startInitialDebateSequence();
    }, 100); // Small delay for voice loading contingency

    return () => {
        clearTimeout(initialSequenceTimeout);
    };
}, [location.state, debateId, addLogEntryAndSpeak]); // Dependencies


  useEffect(() => {
    if (debateLogRef.current) {
      debateLogRef.current.scrollTop = debateLogRef.current.scrollHeight;
    }
  }, [debateLog]);


  const handleApiCall = async (endpoint, payload) => {
    setIsLoading(true);
    setError(null);
    // Do not cancel speech here, let `speak` function handle ongoing speech if necessary
    // synth.cancel();

    try {
      const response = await fetch(`${API_URL}/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...payload, debate_id: debateId }),
      });
      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || `HTTP error! status: ${response.status}`);
      }
      return await response.json();
    } catch (err) {
      console.error(`Error calling ${endpoint}:`, err);
      setError(err.message || `Failed to process request on ${endpoint}.`);
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  const handleProcessTurn = async (e) => {
    e.preventDefault();
    if (!currentInput.trim()) return;
    setNeedsQuestion(false); // User is submitting a question
    const question = currentInput;
    setCurrentInput('');

    try {
      const data = await handleApiCall('process_turn', { question });
      await addLogEntryAndSpeak("Moderator", `Next question: ${data.question}`);
      await addLogEntryAndSpeak("Pro", data.pro_side_response);
      await addLogEntryAndSpeak("Con", data.con_side_response);
      await addLogEntryAndSpeak("Pro (Rebuttal)", data.pro_side_rebuttal);
      await addLogEntryAndSpeak("Con (Rebuttal)", data.con_side_rebuttal);
      setNeedsQuestion(true); // Ready for a new question
    } catch (err) {
      // Error already set by handleApiCall
      setNeedsQuestion(true); // Allow user to try again
    }
  };

  const handleClosingArguments = async () => {
    setNeedsQuestion(false);
    try {
      const data = await handleApiCall('closing_arguments', {});
      await addLogEntryAndSpeak("Moderator", "We will now hear the closing arguments.");
      await addLogEntryAndSpeak("Pro", data.pro_closing);
      await addLogEntryAndSpeak("Con", data.con_closing);
      await addLogEntryAndSpeak("Moderator", "This concludes our debate. We will now await judgment.");
      setIsDebateEnded(true);
    } catch (err) {
      // Error handled by handleApiCall
    }
  };

  const handleJudgeDebate = async () => {
    try {
      const data = await handleApiCall('judge_debate', {});
      const winner = data.judgment?.toUpperCase() || "UNDEFINED";
      await addLogEntryAndSpeak("Judge", `After careful consideration, the winner of this debate is... the ${winner} side!`);
      setIsJudged(true);
    } catch (err) {
      // Error handled by handleApiCall
    }
  };

  const resetAndGoHome = () => {
    synth.cancel(); // Stop any speech before navigating
    initialSequenceStartedRef.current = false; // Reset for potential new debate if user navigates back
    navigate('/');
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
        {topic && ( // Only show topic if it's set
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
                <div key={index} className={`log-entry ${entry.speaker.toLowerCase().replace(/[^a-z0-9]/g, '')}`}>
                    <strong>{entry.speaker}:</strong>
                    <p>{entry.text}</p>
                </div>
            ))}
            {isLoading && debateLog.length > 0 && <div className="loading-indicator">Processing... 🤔</div>}
            {isJudged && <div className="log-entry judge"><strong>--- FINAL VERDICT RENDERED ---</strong></div>}
            </div>
        </section>

        {isLoading && debateLog.length === 0 && !error && ( // Show initial loading only if log is empty
            <div className="loading-indicator" style={{textAlign: 'center', padding: '2rem'}}>Loading Debate...</div>
        )}


        {isDebateUiReady && needsQuestion && !isLoading && !isDebateEnded && (
            <section className="input-section">
                <h2>Engage Further</h2>
                <form onSubmit={handleProcessTurn} className="question-form">
                    <input
                        type="text"
                        value={currentInput}
                        onChange={(e) => setCurrentInput(e.target.value)}
                        placeholder="Enter Next Question..."
                        disabled={isLoading}
                    />
                    <button type="submit" disabled={isLoading}>
                        Submit Question
                    </button>
                </form>
                <button
                    className="closing-button"
                    onClick={handleClosingArguments}
                    disabled={isLoading}
                >
                    Closing Arguments
                </button>
            </section>
        )}

        {isDebateUiReady && isDebateEnded && !isJudged && !isLoading && (
            <section className="input-section judge-section">
                <h2>Awaiting Verdict</h2>
                <button
                    className="judge-button"
                    onClick={handleJudgeDebate}
                    disabled={isLoading}
                >
                    Judge the Debate! 🧑‍⚖️
                </button>
            </section>
        )}

        {isDebateUiReady && isJudged && !isLoading && (
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