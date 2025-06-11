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
  const [isLoading, setIsLoading] = useState(false); // For API call loading

  // Fallback for Canvas-provided global variables when running locally
  // These will be defined by Canvas when deployed there, but not locally.
  const canvasAppId = typeof __app_id !== 'undefined' ? __app_id : 'local-dev-app-id';
  const canvasFirebaseConfig = typeof __firebase_config !== 'undefined' ? __firebase_config : '{}';
  const canvasInitialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : '';


  // Game scenarios, each leading to a disbarment in a unique way
  const gameScenarios = {
    start: {
      text: "You are a rising defense attorney, fresh off a major win. Your next case involves a high-profile client accused of financial fraud. The evidence is complex, and the stakes are incredibly high. Your reputation, and perhaps more, hinges on this case. What's your first move to prepare?",
      options: [
        { text: "Dive deep into the client's financial records, cross-referencing every detail.", next: "financialRecords" },
        { text: "Focus on building a strong relationship with your client, gaining their absolute trust.", next: "clientRelationship" },
        { text: "Begin extensive research into legal precedents for complex fraud cases.", next: "legalResearch" },
      ],
    },
    financialRecords: {
      text: "You've uncovered a discrepancy! A large sum of client funds was moved to a personal account, then back, several times. Your client insists it was a 'temporary transfer' for an emergency, and promises it's all there now. This could look bad, but your client is persuasive. What do you do?",
      options: [
        { text: "Document the discrepancy and urge your client to immediately rectify it with a clear, verifiable explanation for the court.", next: "rectifyFunds" },
        { text: "Dismiss it as a minor oversight and focus on other aspects of the defense, trusting your client's explanation.", next: "minorOversight" },
        { text: "Suggest your client 'clarify' the accounting to make the transfers appear legitimate.", next: "clarifyAccounting" },
      ],
    },
    clientRelationship: {
      text: "Your client, a charismatic but enigmatic figure, has developed immense trust in you. They've hinted at 'creative' ways to handle certain pieces of evidence, suggesting they might expedite the process. They assure you it's 'all in the spirit of justice.' How do you respond?",
      options: [
        { text: "Firmly reiterate the importance of strict adherence to legal and ethical guidelines.", next: "strictEthics" },
        { text: "Listen to their suggestions, considering if any 'creative' approaches are ethically permissible.", next: "considerCreative" },
        { text: "Tell them you'll explore all options, subtly implying you're open to their 'creativity.'", next: "exploreOptions" },
      ],
    },
    legalResearch: {
      text: "During your research, you stumble upon an obscure loophole that, if stretched, could potentially dismiss a key piece of evidence against your client. It's a high-risk, high-reward move, bordering on legal acrobatics. Do you pursue it?",
      options: [
        { text: "Present the loophole to the judge, fully disclosing its tenuous nature and arguing its merits.", next: "presentLoophole" },
        { text: "Attempt to exploit the loophole without drawing attention to its fragile foundation.", next: "exploitLoophole" },
        { text: "Decide against it, fearing it might backfire and damage your credibility.", next: "avoidLoophole" },
      ],
    },
    // Disbarment paths
    rectifyFunds: {
      text: "Despite your efforts to rectify the funds and explain, an unexpected random audit (as described in NJ's program) flags the historical transfers. The audit uncovers a pattern of commingling and apparent misappropriation. The bar association finds that even with 'good intentions,' your failure to report the initial discovery and ensure absolute segregation of client funds constitutes a knowing violation. Your client's subsequent 'clarification' attempts are seen as obstructive.",
      options: [],
      disbarment: "Disbarred: Automatic disbarment for knowing misappropriation of client funds. Your attempts to 'fix' it were too late, and the bar's zero-tolerance policy on trust accounts prevails. Your client's subsequent 'clarification' attempts are seen as obstructive, and you are implicated in covering up the issue.",
    },
    minorOversight: {
      text: "You dismiss the discrepancy, confident in your client's honesty. However, during discovery, opposing counsel finds evidence of the 'temporary transfer' and frames it as a deliberate act of embezzlement. Your initial dismissal of the issue is seen by the court as a lack of due diligence and potentially aiding in commingling client funds. Your client's subsequent 'creative' accounting, which you allowed, is now seen as intentional deception.",
      options: [],
      disbarment: "Disbarred: Found to have aided in the commingling and potential misappropriation of client funds by overlooking obvious discrepancies. Your judgment is questioned, and you are deemed unfit to handle client finances. The 'creative' accounting you allowed is presented as your intent to deceive, leading to your disbarment.",
    },
    clarifyAccounting: {
      text: "You instruct your client to 'clarify' the accounting. The changes are subtle but deceptive. During cross-examination, a forensic accountant from the prosecution meticulously dismantles the 'clarified' records, exposing the fabrications. The judge is furious, citing your direct involvement in presenting false information to the court. The bar association starts an immediate investigation for fraud and deceit.",
      options: [],
      disbarment: "Disbarred: For knowingly engaging in dishonesty, fraud, and misrepresentation by instructing your client to fabricate financial records. Your actions are deemed a direct subversion of justice, leading to immediate and permanent disbarment.",
    },
    strictEthics: {
      text: "You firmly uphold ethical boundaries. Your client, feeling frustrated by your 'lack of flexibility,' begins making their own 'creative' moves outside your advice, including making false statements to the press. When these statements are exposed, your client attempts to shift blame onto you, claiming you advised them to mislead the public. Though you have a clear paper trail of ethical advice, the public scandal and your client's blatant lies, combined with intense media scrutiny, lead to a disciplinary investigation. The bar, facing public pressure, decides to make an example, citing your association with such a 'deceptive' client and your 'failure to control' their actions as a breach of professional conduct, even though you acted ethically.",
      options: [],
      disbarment: "Disbarred: Although you adhered strictly to ethical guidelines, your high-profile client's outrageous and public lies, coupled with intense media pressure and the client's false accusations against you, lead the bar to disbar you. They cite your 'failure to control' a 'deceptive' client in a high-stakes case as a breach of your professional responsibility and a detriment to the public's trust in the legal system. Your ethical conduct is not enough to save you from the ensuing scandal.",
    },
    considerCreative: {
      text: "You entertain your client's ideas, trying to find an ethical angle. Your client, emboldened, takes a drastic step: they forge a document to 'prove' their innocence, believing you tacitly approved their 'creativity.' The forgery is quickly discovered by opposing counsel. When questioned, your client claims you were fully aware and complicit, stating you told them to 'explore all options' and 'be creative.' Despite your denial, the court finds your encouragement of 'creative' solutions led directly to the forgery and constitutes a lack of candor and aiding in criminal activity.",
      options: [],
      disbarment: "Disbarred: For aiding and abetting in the presentation of falsified evidence and a profound lack of candor with the court. Your openness to 'creative' solutions created an environment where your client felt empowered to commit forgery, leading to your professional ruin.",
    },
    exploreOptions: {
      text: "Your subtle implication is taken as a green light. Your client, a master manipulator, orchestrates a bizarre public stunt outside the courthouse, making wildly false claims about the case and implicating the judge and prosecution in a conspiracy. The stunt garners massive media attention, and the judge, furious, holds you accountable for your client's actions, citing your implied encouragement and failure to control their behavior. The bar association immediately launches an investigation into your conduct, accusing you of encouraging prejudicial publicity and bringing the profession into disrepute.",
      options: [],
      disbarment: "Disbarred: For encouraging outrageous and prejudicial public conduct by your client, leading to a media circus that undermines the integrity of the judicial process. Your failure to control your client and your subtle implications are seen as direct complicity in their 'bizarre' actions, resulting in your disbarment.",
    },
    presentLoophole: {
      text: "You present the loophole. The judge, while initially intrigued, finds your argument to be an 'insult to judicial intelligence,' citing its tenuous foundation. They rule against you, and in their written opinion, they lambaste your 'audacious attempt to pervert justice through legal gymnastics.' The bar association takes note of the judge's strong rebuke, viewing your aggressive, borderline-frivolous attempt to exploit a loophole as conduct prejudicial to the administration of justice.",
      options: [],
      disbarment: "Disbarred: For engaging in conduct prejudicial to the administration of justice and presenting a frivolous legal argument with deceptive intent. Your aggressive, high-risk strategy backfired spectacularly, leading to a judicial rebuke and disbarment for undermining the court's dignity.",
    },
    exploitLoophole: {
      text: "You attempt to subtly exploit the loophole. Opposing counsel, however, is sharp and quickly identifies your tactic, exposing it as a deceptive attempt to mislead the court by obscuring the true intent of the obscure rule. The judge, feeling manipulated, expresses severe disappointment and initiates disciplinary proceedings against you for lack of candor and undermining the integrity of the court.",
      options: [],
      disbarment: "Disbarred: For deliberate deception and lack of candor with the court. Your attempt to 'exploit' a legal loophole without full disclosure is seen as a direct attack on the judicial process, resulting in your disbarment.",
    },
    avoidLoophole: {
      text: "You decide against the loophole, prioritizing your credibility. However, in a desperate attempt to save their case, your client, unbeknownst to you, mails a feces-filled Pringles can to the judge's chambers, claiming it's a 'gift' from a 'secret admirer' who knows the judge is biased. The media coverage is immediate and sensational, completely derailing the trial. While you had no knowledge of this act, the bar association, seeking to protect the public image of the legal profession, holds you responsible for failing to anticipate or control your 'unstable' client, stating your 'lack_of_judgment' in dealing with such a character brings discredit to the bar.",
      options: [],
      disbarment: "Disbarred: For a profound lack of judgment in client selection and control, leading to a bizarre public spectacle that brought extreme discredit to the legal profession. Despite your personal innocence in the Pringles can incident, your association with such an outrageous act, and your failure to prevent it, lead to your disbarment.",
    },
  };

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
    setShowWelcomeMessage(false);
    setIsLoading(true); // Start loading
    try {
      // Load history and initialize with the last known scenario, or start fresh
      const history = await loadGameHistory();
      if (history.length > 0) {
        const lastEntry = history[history.length - 1];
        // Attempt to find the next scenario based on the last known state, or restart if at disbarment
        let nextStep = 'start';
        // A more robust way to find the last valid scenario would be needed for complex saves
        // For simplicity, if the last state was a disbarment or an invalid next step, we restart.
        if (gameScenarios[lastEntry.chosenOption] && !gameScenarios[lastEntry.chosenOption].disbarment) {
            nextStep = lastEntry.chosenOption; // This part is a simplified assumption
        }

        if (gameScenarios[nextStep] && !gameScenarios[nextStep].disbarment) {
           setScenario(gameScenarios[nextStep]);
           setChoices(gameScenarios[nextStep].options);
           setGameStarted(true);
           setShowRestartButton(false);
        } else {
           // If the last state was a disbarment or an invalid next state, restart
           setScenario(gameScenarios.start);
           setChoices(gameScenarios.start.options);
           setGameStarted(true);
           setShowRestartButton(false);
        }
      } else {
        // No history, start fresh
        setScenario(gameScenarios.start);
        setChoices(gameScenarios.start.options);
        setGameStarted(true);
        setShowRestartButton(false);
      }
    } finally {
      setIsLoading(false); // End loading
    }
  }, [gameScenarios, loadGameHistory]);

  // Function to handle player choice
  const handleChoice = useCallback(async (choice) => {
    // Add current scenario and chosen option to history
    setStoryHistory(prev => [...prev, { scenarioText: scenario.text, chosenOption: choice.text }]);
    await saveGameHistory(scenario, choice.text); // Save to Firestore

    const nextScenario = gameScenarios[choice.next];
    if (nextScenario) {
      setScenario(nextScenario);
      setChoices(nextScenario.options || []); // Ensure choices is an array
      if (nextScenario.disbarment) {
        setShowRestartButton(true);
      }
    }
  }, [scenario, gameScenarios, saveGameHistory]);

  // Function to restart the game
  const restartGame = () => {
    setScenario(gameScenarios.start);
    setChoices(gameScenarios.start.options);
    setStoryHistory([]);
    setGameStarted(true);
    setShowRestartButton(false);
    setShowWelcomeMessage(false);
  };

  // Effect to manage welcome message and start button
  useEffect(() => {
    if (!gameStarted && !showWelcomeMessage) {
      setScenario(gameScenarios.start);
      setChoices(gameScenarios.start.options);
    }
  }, [gameStarted, showWelcomeMessage, gameScenarios]);

  // Display user ID for debugging and collaborative features
  const [userId, setUserId] = useState('');
  useEffect(() => {
    const initAuth = async () => {
      const firebaseConfig = JSON.parse(canvasFirebaseConfig);
      const app = initializeApp(firebaseConfig);
      const auth = getAuth(app);
      onAuthStateChanged(auth, (user) => {
        if (user) {
          setUserId(user.uid);
        } else {
          // If no user is authenticated, use a random ID. This part should ideally be handled
          // by signInAnonymously or signInWithCustomToken to get a stable ID.
          setUserId(crypto.randomUUID());
        }
      });

      // Ensure initial sign-in for Canvas environment
      if (canvasInitialAuthToken) {
        try {
          await signInWithCustomToken(auth, canvasInitialAuthToken);
        } catch (error) {
          console.error("Error signing in with custom token:", error);
          await signInAnonymously(auth); // Fallback to anonymous
        }
      } else {
        await signInAnonymously(auth); // Sign in anonymously if no token
      }
    };
    initAuth();
  }, [canvasFirebaseConfig, canvasInitialAuthToken]); // Added dependencies to useEffect

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
        <h1 className="text-3xl font-bold text-gray-900 mb-6 text-center">Defense Attorney: The Disbarment Adventure</h1>
        <p className="text-sm text-gray-500 mb-4 text-center">Your User ID: {userId}</p>

        {showWelcomeMessage ? (
          <div className="text-center">
            <p className="text-lg text-gray-700 mb-6">
              Welcome to the Defense Attorney: The Disbarment Adventure! In this game, you are a defense attorney trying your best to navigate the legal world. However, no matter what, your journey will end in a wild and outrageous disbarment.
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
                <p className="font-bold">Disbarment Event!</p>
                <p>{scenario.disbarment}</p>
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
