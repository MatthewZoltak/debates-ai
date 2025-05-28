import React, { useState, useRef, useEffect } from 'react';
import './App.css';

// Define the base URL for your Flask API
const API_URL = 'http://127.0.0.1:5000';

// --- Web Speech API Helper ---
const synth = window.speechSynthesis;
let voices = []; // Will hold available voices

const loadVoices = () => {
    voices = synth.getVoices();
};

if (synth.onvoiceschanged !== undefined) {
    synth.onvoiceschanged = loadVoices;
}
loadVoices();

const speakText = (text, speaker) => {
    return new Promise((resolve, reject) => {
        if (!synth) {
            console.warn("Speech Synthesis not supported.");
            resolve();
            return;
        }

        const utterance = new SpeechSynthesisUtterance(text);
        utterance.onend = resolve;
        utterance.onerror = (event) => {
            console.error('SpeechSynthesisUtterance.onerror', event);
            reject(event);
        };

        let selectedVoice = null;
        if (voices.length > 0) {
            const lowerSpeaker = speaker.toLowerCase();
            if (lowerSpeaker.includes('moderator')) {
                selectedVoice = voices.find(v => v.name.includes('David') || v.name.includes('Google US English')) || voices[0];
            } else if (lowerSpeaker.includes('pro')) {
                selectedVoice = voices.find(v => v.name.includes('Zira') || v.name.includes('Google UK English Female')) || (voices.length > 1 ? voices[1] : voices[0]);
            } else if (lowerSpeaker.includes('con')) {
                selectedVoice = voices.find(v => v.name.includes('Mark') || v.name.includes('Google UK English Male')) || (voices.length > 2 ? voices[2] : voices[0]);
            }
        }
        utterance.voice = selectedVoice || voices[0];
        synth.speak(utterance);
    });
};

const proceedWithSpeech = (text, speaker, resolve, reject) => {
    // Check if speaking, cancel if needed, then proceed
    if (synth.speaking) {
        // console.warn('Cancelling previous speech.');
        synth.cancel();
        // Give a slight delay before starting new speech
        setTimeout(() => speakNow(text, speaker, resolve, reject), 100);
    } else {
        speakNow(text, speaker, resolve, reject);
    }
};

const speakNow = (text, speaker, resolve, reject) => {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.onend = resolve;
    utterance.onerror = (event) => {
        console.error('SpeechSynthesisUtterance.onerror', event);
        reject(event);
    };

    let selectedVoice = null;
    if (voices.length > 0) {
        const lowerSpeaker = speaker.toLowerCase();
        if (lowerSpeaker.includes('moderator')) {
            selectedVoice = voices.find(v => v.name.includes('David') || v.name.includes('Google US English')) || voices[0];
        } else if (lowerSpeaker.includes('pro')) {
            selectedVoice = voices.find(v => v.name.includes('Zira') || v.name.includes('Google UK English Female')) || (voices.length > 1 ? voices[1] : voices[0]);
        } else if (lowerSpeaker.includes('con')) {
            selectedVoice = voices.find(v => v.name.includes('Mark') || v.name.includes('Google UK English Male')) || (voices.length > 2 ? voices[2] : voices[0]);
        }
    }
    utterance.voice = selectedVoice || voices[0]; // Use selected or fallback to default
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
  const [isDebateEnded, setIsDebateEnded] = useState(false); // New state

  const debateLogRef = useRef(null);

  useEffect(() => {
    loadVoices();
    const voiceLoadTimeout = setTimeout(loadVoices, 500);
    return () => clearTimeout(voiceLoadTimeout);
  }, []);

  const scrollToBottom = () => {
    if (debateLogRef.current) {
      debateLogRef.current.scrollTop = debateLogRef.current.scrollHeight;
    }
  };

  useEffect(() => {
    scrollToBottom();
  }, [debateLog]);

  const addLogEntryAndSpeak = async (speaker, text) => {
    setDebateLog(prevLog => [...prevLog, { speaker, text }]);
    try {
        // Ensure synth is ready and not speaking before starting
        if (synth.speaking) {
            synth.cancel();
            await new Promise(resolve => setTimeout(resolve, 100)); // Short pause
        }
        await speakText(text, speaker);
    } catch (err) {
        console.error("Speech failed:", err);
        setError("Text-to-speech failed. Check browser support/permissions.");
    }
  };

  const handleStartDebate = async (e) => {
    e.preventDefault();
    if (!currentInput.trim()) {
      setError("Please enter a topic.");
      return;
    }

    setIsLoading(true);
    setError(null);
    setTopic(currentInput);
    setIsDebateEnded(false); // Reset ended state
    synth.cancel();

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
      setDebateLog([]);
      setIsDebateStarted(true);

      await addLogEntryAndSpeak("Moderator", `Debate started on: ${data.topic}`);
      await addLogEntryAndSpeak("Pro", data.pro_initial);
      await addLogEntryAndSpeak("Con", data.con_initial);

      setNeedsQuestion(true);
      setCurrentInput('');

    } catch (err) {
      console.error("Failed to start debate:", err);
      setError(`Failed to start debate: ${err.message}`);
      setTopic('');
      setIsDebateStarted(false);
    } finally {
      setIsLoading(false);
    }
  };

  const handleProcessTurn = async (e) => {
    e.preventDefault();
    if (!currentInput.trim()) {
      setError("Please enter a question.");
      return;
    }

    setIsLoading(true);
    setError(null);
    setNeedsQuestion(false);
    synth.cancel();

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

    } catch (err) {
      console.error("Failed to process turn:", err);
      setError(`Failed to process turn: ${err.message}`);
      setNeedsQuestion(true);
    } finally {
      setIsLoading(false);
    }
  };

  // --- NEW: Closing Arguments Handler ---
  const handleClosingArguments = async () => {
    setIsLoading(true);
    setError(null);
    setNeedsQuestion(false);
    synth.cancel();

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
      await addLogEntryAndSpeak("Moderator", "This concludes our debate. Thank you!");


      setIsDebateEnded(true); // Set debate as ended
      setNeedsQuestion(false); // Ensure no more questions can be asked

    } catch (err) {
      console.error("Failed to get closing arguments:", err);
      setError(`Failed to get closing arguments: ${err.message}`);
      setNeedsQuestion(true); // Allow trying again or asking a question if failed
    } finally {
      setIsLoading(false);
    }
  };

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
                {isDebateEnded && <div className="log-entry moderator"><strong>--- DEBATE ENDED ---</strong></div>}
             </div>
           </section>
        )}

        {/* --- Input Section (Shows only if debate started and not ended) --- */}
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

      </main>
      <footer className="App-footer">
          <p>Powered by Flask & React with Browser TTS</p>
      </footer>
    </div>
  );
}

export default App;