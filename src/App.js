/* global __app_id, __firebase_config, __initial_auth_token */
import React, { useState, useEffect, useCallback } from 'react';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, addDoc, query, getDocs, setLogLevel } from 'firebase/firestore';


// Main App component
const App = () => {
  // Game state variables
  const [scene, setScene] = useState({});
  const [choices, setChoices] = useState([]);
  const [storyHistory, setStoryHistory] = useState([]);
  const [gameStarted, setGameStarted] = useState(false);
  const [showWelcomeMessage, setShowWelcomeMessage] = useState(true);
  const [showRestartButton, setShowRestartButton] = useState(false);
  const [isLoading, setIsLoading] = useState(true); // Set to true initially to load scenarios
  const [allGameScenarios, setAllGameScenarios] = useState(null); // To store loaded scenarios

  // Case-specific state for dynamic text and calculations
  const [currentCase, setCurrentCase] = useState(null);
  const [flightRisk, setFlightRisk] = useState(0);
  const [communityHarm, setCommunityHarm] = useState(0);
  const [professionalism, setProfessionalism] = useState(0); // Used for verdict calculation for Defense
  const [limineSuccess, setLimineSuccess] = useState(false); // Condition for 'violateLimine'
  const [visitedScenes, setVisitedScenes] = useState(new Set()); // Track visited scenes for risk factors

  // Firebase state
  const [db, setDb] = useState(null);
  const [auth, setAuth] = useState(null);
  const [userId, setUserId] = useState(null);
  const [isAuthReady, setIsAuthReady] = useState(false);

  // Fallback for Canvas-provided global variables when running locally
  const canvasAppId = typeof __app_id !== 'undefined' ? __app_id : 'local-dev-app-id';
  const canvasFirebaseConfig = typeof __firebase_config !== 'undefined' ? __firebase_config : '{}';
  const canvasInitialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : '';

  // Defendant profiles (moved here for simplicity, or could be in scenarios.json)
  const defendantProfiles = [
    {
      key: 'vandelay',
      name: "Mr. Arthur 'Art' Vandelay",
      charges: "Assault in the First Degree (Felony A)",
      history: "a prior Assault 3rd Degree (Gross Misdemeanor) from 5 years ago, and a DUI from 10 years ago. He is currently unemployed.",
      victim: "Ms. Elaine Benes, age 45, who sustained a broken nose and significant bruising. A protective order has been requested.",
      incident: "at a restaurant, following a verbal altercation, he allegedly threw a ceramic plate, striking the victim. Witnesses differ on who instigated the physical aspect.",
      riskFactors: { flight: 8, harm: 7 } // Increased for higher risk
    },
    {
      key: 'newman',
      name: "Mr. Newman 'The Mailman' Post",
      charges: "Malicious Mischief in the First Degree (Felony B) & Resisting Arrest",
      history: "multiple complaints for 'improper mail handling' and a restraining order from a local dog. He is employed by the US Postal Service.",
      victim: "the community mailbox for the 'Pleasant Valley' subdivision, which was found filled with jelly.",
      incident: "Mr. Post was found covered in jelly near the vandalized mailbox, muttering about 'a war on junk mail.' He allegedly tried to flee on his mail truck when police arrived.",
      riskFactors: { flight: 5, harm: 2 }
    },
    {
      key: 'peterman',
      name: "Mr. J. Peterman",
      charges: "Theft in the First Degree (Felony B)",
      history: "no criminal history, but a well-documented history of 'adventures' in Burma and other exotic locales. He owns a successful catalog company.",
      victim: "the 'Urban Sombrero,' a priceless artifact from the 'Sultan of Swat's' private collection.",
      incident: "Mr. Peterman was arrested at a high-society auction after allegedly swapping the real Urban Sombrero with a cheap knock-off he claims is 'even more authentic.' He insists it was a 'misunderstanding of epic proportions.'",
      riskFactors: { flight: 8, harm: 1 }
    },
    {
      key: 'brenda',
      name: "Ms. Brenda H.",
      charges: "Theft in the Third Degree (Gross Misdemeanor)",
      history: "no criminal history. She is a single mother of two.",
      victim: "a local branch of a national grocery store chain.",
      incident: "store security observed her placing baby formula and diapers into her bag and attempting to leave without paying. She expressed remorse and stated she had recently lost her job.",
      riskFactors: { flight: 1, harm: 1 }
    },
    {
      key: 'kenny',
      name: "Mr. Kenny R.",
      charges: "Driving While License Suspended in the Third Degree (Misdemeanor)",
      history: "two prior convictions for the same offense and a history of unpaid traffic tickets.",
      victim: "The State of Washington.",
      incident: "he was pulled over for a broken taillight. A routine check revealed his license was suspended for failure to pay fines.",
      riskFactors: { flight: 3, harm: 1 }
    }
  ];

  // --- FIREBASE INITIALIZATION ---
  useEffect(() => {
    const initFirebase = async () => {
      if (canvasFirebaseConfig === '{}') {
        console.warn("Firebase config is empty. Firestore will not function.");
        setUserId(crypto.randomUUID());
        setIsAuthReady(true);
        return;
      }

      try {
        const app = getApps().length === 0 ? initializeApp(JSON.parse(canvasFirebaseConfig)) : getApp();
        const authInstance = getAuth(app);
        const dbInstance = getFirestore(app);

        setAuth(authInstance);
        setDb(dbInstance);
        setLogLevel('debug'); // Set log level for Firebase debugging

        onAuthStateChanged(authInstance, async (user) => {
          if (user) {
            setUserId(user.uid);
            setIsAuthReady(true);
          } else {
            try {
              if (canvasInitialAuthToken) {
                await signInWithCustomToken(authInstance, canvasInitialAuthToken);
              } else {
                await signInAnonymously(authInstance);
              }
            } catch (authError) {
              console.error("Firebase sign-in error:", authError);
              setUserId(crypto.randomUUID());
              setIsAuthReady(true);
            }
          }
        });
      } catch (error) {
        console.error("Error initializing Firebase:", error);
        setUserId(crypto.randomUUID());
        setIsAuthReady(true);
      }
    };

    initFirebase();
  }, [canvasFirebaseConfig, canvasInitialAuthToken]);

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

  // --- GAME LOGIC FUNCTIONS ---

  const saveGameHistory = useCallback(async (currentScenarioText, chosenOptionText) => {
    if (!isAuthReady || !db || !userId) {
      console.log("Firestore not ready, skipping save.");
      return;
    }

    const historyEntry = {
      timestamp: new Date(),
      scenarioText: currentScenarioText,
      chosenOption: chosenOptionText,
      userId,
      appId: canvasAppId,
    };

    try {
      const publicHistoryRef = collection(db, `artifacts/${canvasAppId}/public/data/gameHistory`);
      await addDoc(publicHistoryRef, historyEntry);
      console.log("Game history saved to public collection.");
    } catch (error) {
      console.error("Error saving public game history:", error);
    }
  }, [db, userId, isAuthReady, canvasAppId]);


  const loadGameHistory = useCallback(async () => {
    if (!isAuthReady || !db || !userId) {
      console.log("Firestore not ready, skipping load.");
      return [];
    }

    try {
      const privateDataCollectionRef = collection(db, `artifacts/${canvasAppId}/users/${userId}/myGameHistory`);
      const q = query(privateDataCollectionRef);
      const querySnapshot = await getDocs(q);

      const loadedHistory = [];
      querySnapshot.forEach((doc) => {
        loadedHistory.push(doc.data());
      });

      loadedHistory.sort((a, b) => a.timestamp.toDate() - b.timestamp.toDate());
      setStoryHistory(loadedHistory);
      console.log("Game history loaded successfully:", loadedHistory);
      return loadedHistory;
    } catch (error) {
      console.error("Error loading game history:", error);
      return [];
    }
  }, [db, userId, isAuthReady, canvasAppId]);

  const startGame = useCallback(async () => {
    if (!allGameScenarios) return; // Ensure scenarios are loaded

    setShowWelcomeMessage(false);
    setIsLoading(true);
    try {
      // For this HTML version, we simplify by always starting fresh if history exists
      // A more robust system for saving and resuming game state would be complex.
      setStoryHistory([]); // Clear history for a fresh start with external scenarios
      setCurrentCase(null);
      setFlightRisk(0);
      setCommunityHarm(0);
      setProfessionalism(0);
      setLimineSuccess(false);
      setVisitedScenes(new Set());
      setShowRiskScores(false);

      setScene(allGameScenarios.start);
      setChoices(allGameScenarios.start.options);
      setGameStarted(true);
      setShowRestartButton(false);

    } finally {
      setIsLoading(false);
    }
  }, [allGameScenarios]); // Removed loadGameHistory as dependency for simplicity of HTML version


  const handleChoice = useCallback((choice) => {
    if (!allGameScenarios) return; // Ensure scenarios are loaded

    const currentScenario = scene;
    let chosenOptionText = choice.text;

    setStoryHistory(prev => [...prev, { scenarioText: currentScenario.text, chosenOption: chosenOptionText }]);
    saveGameHistory(currentScenario.text, chosenOptionText);

    if (choice.proPoints) {
      setProfessionalism(prev => prev + choice.proPoints);
    }

    let nextSceneKey = choice.next;

    // --- Special game logic for dynamic paths ---
    if (nextSceneKey === 'caseAssignmentDefense') {
      const randomCase = defendantProfiles[Math.floor(Math.random() * defendantProfiles.length)];
      setCurrentCase(randomCase);
      setFlightRisk(randomCase.riskFactors.flight);
      setCommunityHarm(randomCase.riskFactors.harm);
      setShowRiskScores(true);
    }
    if (nextSceneKey === 'calculateRuling') {
      let finalScore = flightRisk + communityHarm;
      if (choice.argument === 'OR') finalScore += communityHarm > 7 ? 5 : -2;
      else if (choice.argument === 'Conditions') finalScore -= 4;
      else if (choice.argument === 'Bond') finalScore += 1;

      if (finalScore <= 2) nextSceneKey = 'commissionerDecisionOR';
      else if (finalScore <= 12) nextSceneKey = 'commissionerDecisionStrictConditions';
      else nextSceneKey = 'commissionerDecisionHighBond';
    }
    if (nextSceneKey === 'verdictDefense') { // Defense Verdict Calculation
      if (professionalism >= 5) { // Threshold for "winning" as defense
        nextSceneKey = 'acquittal';
      } else {
        nextSceneKey = 'guiltyVerdict';
      }
    }
    if (nextSceneKey === 'prosecutorVerdict') { // Prosecutor Verdict Calculation
        if (professionalism >= 5) { // Threshold for "winning" as prosecutor
            nextSceneKey = 'prosecutorGuiltyVerdict';
        } else {
            nextSceneKey = 'prosecutorAcquittal'; // New scenario for prosecutor losing
        }
    }
    if (nextSceneKey === 'limineSuccess') {
      setLimineSuccess(true);
    }
    // --- End special game logic ---

    const nextScene = allGameScenarios[nextSceneKey];

    if (nextScene) {
      // Update risk scores if the scene has them and hasn't been visited in current path
      if (!visitedScenes.has(nextSceneKey) && nextScene.riskFactors) {
        setFlightRisk(prev => prev + (nextScene.riskFactors.flight || 0));
        setCommunityHarm(prev => prev + (nextScene.riskFactors.harm || 0));
        setVisitedScenes(prev => new Set(prev).add(nextSceneKey));
        setShowRiskScores(true); // Ensure risk scores are shown if new scene has them
      } else if (!nextScene.riskFactors) {
          // If a scene doesn't have risk factors, hide the score display for clarity
          setShowRiskScores(false);
      }


      setScene(nextScene);
      setChoices(nextScene.options || []);

      if (nextScene.disbarment || nextScene.isEnding) {
        setShowRestartButton(true);
      } else {
        setShowRestartButton(false);
      }
    }
  }, [scene, allGameScenarios, saveGameHistory, flightRisk, communityHarm, professionalism, visitedScenes]);

  const restartGame = useCallback(() => {
    setScene(allGameScenarios.start);
    setChoices(allGameScenarios.start.options);
    setStoryHistory([]);
    setGameStarted(false); // Go back to welcome screen
    setShowRestartButton(false);
    setShowWelcomeMessage(true);
    setCurrentCase(null);
    setFlightRisk(0);
    setCommunityHarm(0);
    setProfessionalism(0);
    setLimineSuccess(false);
    setVisitedScenes(new Set());
    setShowRiskScores(false);
  }, [allGameScenarios]);

  // Render text with dynamic replacements and markdown
  const renderSceneText = useCallback(() => {
    let text = scene.text || "Loading...";
    if (currentCase) {
      text = text.replace(/\[defendantName\]/g, currentCase.name || 'Unknown');
      text = text.replace(/\[charges\]/g, currentCase.charges || 'Unknown');
      text = text.replace(/\[history\]/g, currentCase.history || 'None');
      text = text.replace(/\[victim\]/g, currentCase.victim || 'Unknown');
      text = text.replace(/\[incident\]/g, currentCase.incident || 'Unknown');
    }
    // Simple markdown for bolding and paragraph breaks
    const htmlText = `<p>${text.replace(/\*\*(.*?)\*\*/g, '<b class="text-amber-400">$1</b>').split('\n').join('</p><p>')}</p>`;
    return { __html: htmlText };
  }, [scene.text, currentCase]);

  // Effect to manage welcome message and initial game state
  useEffect(() => {
    if (allGameScenarios && isAuthReady && showWelcomeMessage) {
      // If everything is loaded, display welcome and ready to start
      setIsLoading(false);
    } else if (allGameScenarios && isAuthReady && !gameStarted && !isLoading) {
      // If scenarios loaded and auth ready, and game not started, kick off
      startGame();
    }
  }, [allGameScenarios, isAuthReady, showWelcomeMessage, gameStarted, isLoading, startGame]);


  // Display initial loading screen if scenarios or auth not ready
  if (isLoading || !allGameScenarios || !isAuthReady) {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center p-4">
        <div className="text-center">
          <p className="text-xl animate-pulse">
            {isLoading ? 'Loading Game Scenarios...' : isAuthReady ? 'Initializing Game...' : 'Authenticating...'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 text-gray-200 font-sans flex items-center justify-center p-4">
      {/* Tailwind CSS and Fonts already loaded via CDN in index.html in the HTML version, but kept here for React consistency if you move back */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700&family=Inter:wght@400;500;600&display=swap');
        .font-serif { font-family: 'Playfair Display', serif; }
        .font-sans { font-family: 'Inter', sans-serif; }
        .btn { transition: all 0.2s ease-in-out; }
        .btn:hover { transform: translateY(-2px); box-shadow: 0 4px 10px rgba(0, 0, 0, 0.4); }
      `}</style>
      
      <div className="w-full max-w-2xl mx-auto bg-gray-800 rounded-xl shadow-2xl p-6 md:p-8">
        <div className="text-center mb-6">
          <h1 className="text-3xl md:text-4xl font-bold font-serif text-amber-300">Attorney Disbarment Adventure</h1>
          <p className="text-gray-400 mt-2">Your journey to professional ruin starts now.</p>
        </div>

        <p className="text-sm text-gray-500 mb-4 text-center">Your User ID: {userId}</p>

        {showWelcomeMessage ? (
          <div className="text-center">
            <p className="text-lg text-gray-700 mb-6">
              Welcome to the Attorney Disbarment Adventure! In this game, you are an attorney trying your best to navigate the legal world. However, no matter what, your journey will end in a wild and outrageous disbarment.
            </p>
            <button
              onClick={startGame}
              className="btn w-full mt-6 bg-amber-500 hover:bg-amber-600 text-gray-900 font-bold py-3 px-4 rounded-lg">
              Start Your Career
            </button>
          </div>
        ) : (
          <div>
            {showRiskScores && (
              <div className="bg-gray-900 border border-gray-700 p-3 rounded-lg mb-6 text-sm text-center text-gray-300">
                <span className="font-semibold">Case Assessment:</span> Flight Risk: <b className="text-amber-400">{flightRisk}</b> | Community Harm: <b className="text-red-400">{communityHarm}</b>
              </div>
            )}
            
            <div className="text-lg leading-relaxed text-gray-300 mb-6" dangerouslySetInnerHTML={renderSceneText()} />
            
            {scene.disbarment || scene.isEnding ? (
              <div className="mt-4">
                <div className="bg-red-900/50 border-l-4 border-red-500 text-red-200 p-6 rounded-lg">
                  <h2 className="text-2xl font-bold font-serif text-red-400 mb-3">{scene.disbarment ? scene.disbarment.message : scene.text}</h2>
                  {scene.disbarment && scene.disbarment.moral && (
                    <>
                      <hr className="my-3 border-red-300" />
                      <p className="italic text-red-300 pt-4">
                        <b>Moral of the story:</b> {scene.disbarment.moral}
                      </p>
                    </>
                  )}
                </div>
                <button onClick={restartGame} className="btn w-full mt-6 bg-amber-500 hover:bg-amber-600 text-gray-900 font-bold py-3 px-4 rounded-lg">
                  Play Again & Fail Differently
                </button>
              </div>
            ) : (
              <div className="flex flex-col space-y-3">
                {choices.filter(choice => !choice.condition || (choice.condition === 'limineSuccess' && limineSuccess)).map((choice, index) => (
                  <button key={index} onClick={() => handleChoice(choice)} className="btn w-full bg-gray-700 hover:bg-gray-600 text-gray-200 font-medium py-3 px-4 rounded-lg text-left">
                    {choice.text}
                  </button>
                ))}
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
