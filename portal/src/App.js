import React, { useState, useRef, useEffect } from 'react';
import './App.css';

// Define the base URL for your Flask API
const API_URL = 'http://127.0.0.1:5000';

// --- Web Speech API Helper ---
const synth = window.speechSynthesis;
let voices = []; // Will hold available voices

// Function to load voices (they load asynchronously)
const loadVoices = () => {
    voices = synth.getVoices();
    // console.log("Voices loaded:", voices.length);
};

// --- Single, Reliable Speak Function ---
const speak = (text, speaker) => {
    return new Promise((resolve, reject) => {
        if (!synth) {
            console.warn("Speech Synthesis not supported.");
            resolve(); // Resolve immediately if not supported
            return;
        }

        // If for some reason it's stuck speaking, cancel before starting a new one.
        // This is a safety net; ideally, the await sequence prevents this.
        if (synth.speaking) {
             console.warn("Synth was already speaking - cancelling before new utterance.");
             synth.cancel();
             // Give a tiny delay for cancellation to process
             setTimeout(() => startSpeaking(text, speaker, resolve, reject), 150);
        } else {
             startSpeaking(text, speaker, resolve, reject);
        }
    });
};

const startSpeaking = (text, speaker, resolve, reject) => {
    // Ensure voices are loaded (sometimes takes a moment)
    if (voices.length === 0) {
        loadVoices();
    }

    const utterance = new SpeechSynthesisUtterance(text);

    utterance.onend = () => {
        // console.log("Finished:", text.substring(0, 20) + "...");
        resolve();
    };

    utterance.onerror = (event) => {
        console.error('SpeechSynthesisUtterance.onerror', event);
        reject(event);
    };

    // --- Voice Selection Logic (Heuristic) ---
    let selectedVoice = null;
    if (voices.length > 0) {
        const lowerSpeaker = speaker.toLowerCase();
        if (lowerSpeaker.includes('judge') || lowerSpeaker.includes('moderator')) {
            selectedVoice = voices.find(v => (v.name.includes('David') || v.name.includes('Google US English')) && v.lang.startsWith('en')) || voices.find(v => v.lang.startsWith('en-US') && v.name.includes('Google')) || voices[0];
        } else if (lowerSpeaker.includes('pro')) {
            selectedVoice = voices.find(v => (v.name.includes('Zira') || v.name.includes('Google UK English Female')) && v.lang.startsWith('en')) || voices.find(v => v.lang.startsWith('en-GB') && v.gender === 'female') || (voices.length > 1 ? voices[1] : voices[0]);
        } else if (lowerSpeaker.includes('con')) {
            selectedVoice = voices.find(v => (v.name.includes('Mark') || v.name.includes('Google UK English Male')) && v.lang.startsWith('en')) || voices.find(v => v.lang.startsWith('en-GB') && v.gender === 'male') || (voices.length > 2 ? voices[2] : voices[0]);
        }
    }

    utterance.voice = selectedVoice || voices.find(v => v.lang.startsWith('en')) || voices[0]; // Fallback to any english or first voice
    // console.log(`Speaking "${text.substring(0, 20)}..." with ${utterance.voice?.name || 'default'}`);

    synth.speak(utterance);
}


function App() {
  const [topic, setTopic] = useState('');
  const [currentInput, setCurrentInput] = useState('');
  const [debateLog, setDebateLog] = useState([]);
  const [isDebateStarted, setIsDebateStarted] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [needsQuestion, setNeedsQuestion] = useState(false);
  const [isDebateEnded, setIsDebateEnded] = useState(false);
  const [isJudged, setIsJudged] = useState(false);

  const debateLogRef = useRef(null);

  useEffect(() => {
    loadVoices(); // Initial load
    if (synth.onvoiceschanged !== undefined) {
        synth.onvoiceschanged = loadVoices; // Set listener
    }
    // Also try after a delay
    const voiceLoadTimeout = setTimeout(loadVoices, 500);
    return () => {
        clearTimeout(voiceLoadTimeout);
        synth.cancel(); // Cancel any speech when component unmounts
    };
  }, []);

  const scrollToBottom = () => {
    if (debateLogRef.current) {
      debateLogRef.current.scrollTop = debateLogRef.current.scrollHeight;
    }
  };

  useEffect(() => {
    scrollToBottom();
  }, [debateLog]);

  // --- This function now correctly uses the robust `speak` function ---
  const addLogEntryAndSpeak = async (speaker, text) => {
    setDebateLog(prevLog => [...prevLog, { speaker, text }]);
    try {
        await speak(text, speaker); // Await the reliable `speak` promise
    } catch (err) {
        console.error("Speech failed:", err);
        setError("Text-to-speech failed. Check browser support/permissions.");
    }
  };

  const resetDebate = () => {
      setTopic('');
      setCurrentInput('');
      setDebateLog([]);
      setIsDebateStarted(false);
      setIsLoading(false);
      setError(null);
      setNeedsQuestion(false);
      setIsDebateEnded(false);
      setIsJudged(false);
      synth.cancel();
  }

  // --- Handler functions now call `synth.cancel()` ONLY at the start ---
  const handleStartDebate = async (e) => {
    e.preventDefault();
    if (!currentInput.trim()) { /* ... */ return; }
    resetDebate();
    setIsLoading(true);
    setTopic(currentInput);
    synth.cancel(); // <--- Cancel before starting sequence

    try {
      const response = await fetch(`${API_URL}/start_debate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic: currentInput }),
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || `HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      setIsDebateStarted(true);

      await addLogEntryAndSpeak("Moderator", `Debate started on: ${data.topic}`);
      await addLogEntryAndSpeak("Pro", data.pro_initial);
      await addLogEntryAndSpeak("Con", data.con_initial);

      setNeedsQuestion(true);
      setCurrentInput('');
    } catch (err) { /* ... */ }
    finally { setIsLoading(false); }
  };

  const handleProcessTurn = async (e) => {
    e.preventDefault();
    if (!currentInput.trim()) { /* ... */ return; }
    setIsLoading(true);
    setError(null);
    setNeedsQuestion(false);
    synth.cancel(); // <--- Cancel before starting sequence

    const question = currentInput;
    try {
      const response = await fetch(`${API_URL}/process_turn`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: question }),
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || `HTTP error! status: ${response.status}`);
      }

      const data = await response.json();

      await addLogEntryAndSpeak("Moderator", `Next question: ${data.question}`);
      await addLogEntryAndSpeak("Pro", data.pro_side_response);
      await addLogEntryAndSpeak("Con", data.con_side_response);
      await addLogEntryAndSpeak("Pro (Rebuttal)", data.pro_side_rebuttal);
      await addLogEntryAndSpeak("Con (Rebuttal)", data.con_side_rebuttal);

      setNeedsQuestion(true);
      setCurrentInput('');
    } catch (err) { /* ... */ }
    finally { setIsLoading(false); }
  };

  const handleClosingArguments = async () => {
    setIsLoading(true);
    setError(null);
    setNeedsQuestion(false);
    synth.cancel(); // <--- Cancel before starting sequence

    try {
      const response = await fetch(`${API_URL}/closing_arguments`, {
        method: 'POST', // Using POST as it modifies the debate state (moves to closing)
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}), // Sending empty body, adjust if Flask needs info
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || `HTTP error! status: ${response.status}`);
      }

      const data = await response.json();

      await addLogEntryAndSpeak("Moderator", "We will now hear the closing arguments.");
      await addLogEntryAndSpeak("Pro", data.pro_closing);
      await addLogEntryAndSpeak("Con", data.con_closing);
      await addLogEntryAndSpeak("Moderator", "This concludes our debate. We will now await judgment.");

      setIsDebateEnded(true);
      setNeedsQuestion(false);
    } catch (err) { /* ... */ }
    finally { setIsLoading(false); }
  };

  const handleJudgeDebate = async () => {
    setIsLoading(true);
    setError(null);
    synth.cancel(); // <--- Cancel before starting sequence

    try {
        const response = await fetch(`${API_URL}/judge_debate`, {
          method: 'POST', // Using POST as it modifies the debate state (moves to closing)
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}), // Sending empty body, adjust if Flask needs info
        });
        const data = await response.json();
        const winner = data.judgment.toUpperCase();
        await addLogEntryAndSpeak("Judge", `After careful consideration, the winner of this debate is... the ${winner} side!`);
        setIsJudged(true);
    } catch (err) { /* ... */ }
    finally { setIsLoading(false); }
  };

  // --- Render Logic (No changes needed here, just include for context) ---
  return (
    <div className="App">
      <header className="App-header">
        <h1>🗣️ AI Debate Arena 🤖</h1>
        <button onClick={() => synth.cancel()} disabled={!synth || !synth.speaking}>
            Stop Speaking
        </button>
      </header>

      <main className="App-main">
        {!isDebateStarted ? (
          <section className="input-section">
            <h2>Enter Debate Topic</h2>
            <form onSubmit={handleStartDebate}>
              <input
                type="text"
                value={currentInput}
                onChange={(e) => setCurrentInput(e.target.value)}
                placeholder="E.g., 'Should AI have rights?'"
                disabled={isLoading}
              />
              <button type="submit" disabled={isLoading}>
                {isLoading ? 'Starting...' : 'Start Debate'}
              </button>
            </form>
          </section>
        ) : (
          <section className="topic-display">
            <h2>Debating: {topic}</h2>
          </section>
        )}

        {error && <div className="error-message">{error}</div>}

        {isDebateStarted && (
           <section className="debate-log-section">
             <h2>Debate Log</h2>
             <div className="debate-log" ref={debateLogRef}>
                {debateLog.map((entry, index) => (
                   <div key={index} className={`log-entry ${entry.speaker.toLowerCase().split(' ')[0]}`}>
                      <strong>{entry.speaker}:</strong>
                      <p>{entry.text}</p>
                   </div>
                ))}
                {isLoading && <div className="loading-indicator">Processing... 🤔</div>}
                {isJudged && <div className="log-entry judge"><strong>--- FINAL VERDICT RENDERED ---</strong></div>}
             </div>
           </section>
        )}

        {isDebateStarted && needsQuestion && !isLoading && !isDebateEnded && (
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

        {isDebateEnded && !isJudged && !isLoading && (
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

        {isJudged && !isLoading && (
            <section className="input-section new-debate-section">
                <h2>Debate Complete!</h2>
                <button
                    className="new-debate-button"
                    onClick={resetDebate}
                >
                    Start a New Debate
                </button>
            </section>
        )}


      </main>
      <footer className="App-footer">
          <p>Powered by Flask & React with Browser TTS</p>
      </footer>
    </div>
  );
}

export default App;