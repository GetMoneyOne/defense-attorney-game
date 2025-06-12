/* global __app_id, __firebase_config, __initial_auth_token */
import React, { useState, useEffect, useCallback } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, addDoc, query, getDocs } from 'firebase/firestore';


// Main App component
const App = () => {
  // Game state variables
  const [scenario, setScenario] = useState({});
  const [choices, setChoices] = useState([]);
  const [storyHistory, setStoryHistory] = useState([]);
  const [gameStarted, setGameStarted] = useState(false);
  const [showWelcomeMessage, setShowWelcomeMessage] = useState(true);
  const [showRestartButton, setShowRestartButton] = useState(false);
  const [isLoading, setIsLoading] = useState(true); // Set to true initially to load scenarios
  const [allGameScenarios, setAllGameScenarios] = useState(null); // To store loaded scenarios

  // Fallback for Canvas-provided global variables when running locally
  const canvasAppId = typeof __app_id !== 'undefined' ? __app_id : 'local-dev-app-id';
  const canvasFirebaseConfig = typeof __firebase_config !== 'undefined' ? __firebase_config : '{}';
  const canvasInitialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : '';

  // Effect to load game scenarios from JSON
  useEffect(() => {
    const loadScenarios = async () => {
      try {
        setIsLoading(true);
        // Fetch from the public folder
        const response = await fetch('/scenarios.json');
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        setAllGameScenarios(data);
      } catch (error) {
        console.error("Failed to load scenarios:", error);
        // Handle error, e.g., display a message to the user
      } finally {
        setIsLoading(false);
      }
    };

    loadScenarios();
  }, []); // Run only once on component mount


  // Function to save game history to Firestore
  const saveGameHistory = useCallback(async (currentScenario, chosenOptionText) => {
    try {
      const firebaseConfig = JSON.parse(canvasFirebaseConfig);
      const app = initializeApp(firebaseConfig);
      const db = getFirestore(app);
      const auth = getAuth(app);

      let currentUserId;
      if (canvasInitialAuthToken) {
        await signInWithCustomToken(auth, canvasInitialAuthToken);
        currentUserId = auth.currentUser?.uid;
      } else {
        await signInAnonymously(auth);
        currentUserId = auth.currentUser?.uid || crypto.randomUUID();
      }

      const historyEntry = {
        timestamp: new Date(),
        scenarioText: currentScenario.text,
        chosenOption: chosenOptionText,
        userId: currentUserId,
        appId: canvasAppId,
      };

      // Store in public data for collaborative aspect (can be seen by others)
      const publicDataCollectionRef = collection(db, `artifacts/${canvasAppId}/public/data/gameHistory`);
      await addDoc(publicDataCollectionRef, historyEntry);

      // Also store in private data for user's own history
      const privateDataCollectionRef = collection(db, `artifacts/${canvasAppId}/users/${currentUserId}/myGameHistory`);
      await addDoc(privateDataCollectionRef, historyEntry);

      console.log("Game history saved successfully!");
    } catch (error) {
      console.error("Error saving game history:", error);
    }
  }, [canvasAppId, canvasFirebaseConfig, canvasInitialAuthToken]);

  // Function to load game history from Firestore
  const loadGameHistory = useCallback(async () => {
    try {
      const firebaseConfig = JSON.parse(canvasFirebaseConfig);
      const app = initializeApp(firebaseConfig);
      const db = getFirestore(app);
      const auth = getAuth(app);

      let currentUserId;
      if (canvasInitialAuthToken) {
        await signInWithCustomToken(auth, canvasInitialAuthToken);
        currentUserId = auth.currentUser?.uid;
      } else {
        await signInAnonymously(auth);
        currentUserId = auth.currentUser?.uid || crypto.randomUUID();
      }

      const privateDataCollectionRef = collection(db, `artifacts/${canvasAppId}/users/${currentUserId}/myGameHistory`);
      const q = query(privateDataCollectionRef); // You can add orderBy here if needed, but per instructions, we avoid it for simplicity.
      const querySnapshot = await getDocs(q);

      const loadedHistory = [];
      querySnapshot.forEach((doc) => {
        loadedHistory.push(doc.data());
      });

      // Sort by timestamp if desired, as orderBy is avoided in query
      loadedHistory.sort((a, b) => a.timestamp.toDate() - b.timestamp.toDate());

      setStoryHistory(loadedHistory);
      console.log("Game history loaded successfully:", loadedHistory);
      return loadedHistory;
    } catch (error) {
      console.error("Error loading game history:", error);
      return [];
    }
  }, [canvasAppId, canvasFirebaseConfig, canvasInitialAuthToken]);

  // Function to start the game
  const startGame = useCallback(async () => {
    if (!allGameScenarios) return; // Ensure scenarios are loaded

    setShowWelcomeMessage(false);
    setIsLoading(true);
    try {
      const history = await loadGameHistory();
      if (history.length > 0) {
        // For now, if there's history, we simply restart to the main 'start' for fresh playthroughs
        // A more robust system for saving and resuming game state would be complex.
        setScenario(allGameScenarios.start);
        setChoices(allGameScenarios.start.options);
        setStoryHistory([]); // Clear history for a fresh start with external scenarios
        setGameStarted(true);
        setShowRestartButton(false);
      } else {
        // No history, start fresh
        setScenario(allGameScenarios.start);
        setChoices(allGameScenarios.start.options);
        setGameStarted(true);
        setShowRestartButton(false);
      }
    } finally {
      setIsLoading(false);
    }
  }, [allGameScenarios, loadGameHistory]);


  // Function to handle player choice
  const handleChoice = useCallback(async (choice) => {
    if (!allGameScenarios) return; // Ensure scenarios are loaded

    // Add current scenario and chosen option to history
    setStoryHistory(prev => [...prev, { scenarioText: scenario.text, chosenOption: choice.text }]);
    await saveGameHistory(scenario, choice.text); // Save to Firestore

    const nextScenario = allGameScenarios[choice.next];
    if (nextScenario) {
      setScenario(nextScenario);
      setChoices(nextScenario.options || []); // Ensure choices is an array
      if (nextScenario.disbarment) {
        setShowRestartButton(true);
      }
    }
  }, [scenario, allGameScenarios, saveGameHistory]);

  // Function to restart the game
  const restartGame = () => {
    if (!allGameScenarios) return; // Ensure scenarios are loaded
    setScenario(allGameScenarios.start);
    setChoices(allGameScenarios.start.options);
    setStoryHistory([]);
    setGameStarted(true);
    setShowRestartButton(false);
    setShowWelcomeMessage(false);
  };

  // Effect to manage welcome message and start button based on scenarios loaded
  useEffect(() => {
    if (!gameStarted && !showWelcomeMessage && allGameScenarios) {
      setScenario(allGameScenarios.start);
      setChoices(allGameScenarios.start.options);
      setIsLoading(false); // Done loading initial scenario
    }
  }, [gameStarted, showWelcomeMessage, allGameScenarios]);

  // Display user ID for debugging and collaborative features
  const [userId, setUserId] = useState('');
  useEffect(() => {
    const initAuth = async () => {
      // Don't initialize Firebase if config is clearly invalid
      if (canvasFirebaseConfig === '{}') {
          console.warn("Firebase config is empty. Firestore will not function locally.");
          setUserId(crypto.randomUUID()); // Assign a local dummy ID
          return;
      }
      try {
          const firebaseConfig = JSON.parse(canvasFirebaseConfig);
          const app = initializeApp(firebaseConfig);
          const auth = getAuth(app);
          onAuthStateChanged(auth, (user) => {
            if (user) {
              setUserId(user.uid);
            } else {
              setUserId(crypto.randomUUID()); // Fallback if auth state isn't immediately available
            }
          });

          if (canvasInitialAuthToken) {
            await signInWithCustomToken(auth, canvasInitialAuthToken);
          } else {
            await signInAnonymously(auth);
          }
      } catch (error) {
          console.error("Error initializing Firebase or signing in:", error);
          setUserId(crypto.randomUUID()); // Ensure a userId is set even on error
      }
    };
    initAuth();
  }, [canvasFirebaseConfig, canvasInitialAuthToken]);

  // Prevent game from starting until scenarios are loaded
  if (isLoading || !allGameScenarios) { // Also check if allGameScenarios is null
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-xl p-8 w-full max-w-2xl text-center">
          <p className="text-xl text-gray-700 animate-pulse">Loading Game Scenarios...</p>
        </div>
      </div>
    );
  }


  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
      <script src="https://cdn.tailwindcss.com"></script>
      {/* Firebase SDK imports for HTML context - not strictly needed in React but good for reference */}
      {/* These script tags are for the Canvas environment and generally not needed or recommended for local Create React App setups
          as Firebase is installed via npm. Leaving them for fidelity to original immersive. */}
      <script type="module" src="https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js"></script>
      <script type="module" src="https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js"></script>
      <script type="module" src="https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js"></script>

      <style>
        {`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap');
        body {
          font-family: 'Inter', sans-serif;
        }
        /* Custom button styling for a more engaging feel */
        .game-button {
          background-image: linear-gradient(to right, #6EE7B7 0%, #34D399 51%, #10B981 100%);
          margin: 10px;
          padding: 15px 30px;
          text-align: center;
          text-transform: uppercase;
          transition: 0.5s;
          background-size: 200% auto;
          color: white;
          box-shadow: 0 0 20px #eee;
          border-radius: 10px;
          display: block;
          cursor: pointer;
        }
        .game-button:hover {
          background-position: right center; /* change the direction of the change */
          color: #fff;
          text-decoration: none;
        }
        .game-button:active {
          transform: translateY(2px);
        }
        `}
      </style>

      <div className="bg-white rounded-lg shadow-xl p-8 w-full max-w-2xl">
        <h1 className="text-3xl font-bold text-gray-900 mb-6 text-center">Attorney Disbarment Adventure</h1> {/* Updated Title */}
        <p className="text-sm text-gray-500 mb-4 text-center">Your User ID: {userId}</p>

        {showWelcomeMessage ? (
          <div className="text-center">
            <p className="text-lg text-gray-700 mb-6">
              Welcome to the Attorney Disbarment Adventure! In this game, you are an attorney trying your best to navigate the legal world. However, no matter what, your journey will end in a wild and outrageous disbarment.
            </p>
            <button
              onClick={startGame}
              className="game-button focus:outline-none"
              disabled={isLoading}
            >
              {isLoading ? 'Loading Game...' : 'Start Your Career'}
            </button>
          </div>
        ) : (
          <div>
            <div className="bg-gray-50 p-6 rounded-lg mb-6 shadow-inner min-h-[120px] flex items-center justify-center">
              {isLoading ? (
                <p className="text-lg text-gray-600 animate-pulse">Loading scenario...</p>
              ) : (
                <p className="text-lg text-gray-800 text-center">{scenario.text}</p>
              )}
            </div>

            {scenario.disbarment && (
              <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-4 rounded-lg mb-6" role="alert">
                <p className="font-bold">{scenario.disbarment.message}</p>
                {scenario.disbarment.moral && (
                  <>
                    <hr className="my-3 border-red-300" />
                    <p className="font-semibold mt-2">Moral of the Story:</p>
                    <p>{scenario.disbarment.moral}</p>
                  </>
                )}
              </div>
            )}

            {!scenario.disbarment && (
              <div className="space-y-4">
                {choices.map((choice, index) => (
                  <button
                    key={index}
                    onClick={() => handleChoice(choice)}
                    className="game-button w-full focus:outline-none"
                    disabled={isLoading}
                  >
                    {choice.text}
                  </button>
                ))}
              </div>
            )}

            {showRestartButton && (
              <div className="text-center mt-8">
                <button
                  onClick={restartGame}
                  className="game-button focus:outline-none bg-blue-500 hover:bg-blue-600"
                >
                  Restart Game
                </button>
              </div>
            )}
            
            <div className="mt-8 pt-6 border-t border-gray-200">
              <h3 className="text-xl font-semibold text-gray-800 mb-4">Your Story So Far:</h3>
              <div className="max-h-60 overflow-y-auto bg-gray-50 p-4 rounded-md border border-gray-200">
                {storyHistory.length === 0 ? (
                  <p className="text-gray-600 italic">No history yet. Make a choice to begin your story!</p>
                ) : (
                  storyHistory.map((entry, index) => (
                    <p key={index} className="text-sm text-gray-700 mb-2">
                      <span className="font-semibold">Scenario:</span> {entry.scenarioText} <br />
                      <span className="font-semibold">Your Choice:</span> {entry.chosenOption}
                    </p>
                  ))
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default App;
