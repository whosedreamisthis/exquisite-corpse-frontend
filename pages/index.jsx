import { useEffect, useRef, useState, useCallback } from 'react';
import axios from 'axios'; // Import axios for HTTP requests

// IMPORTANT: Replace this with the URL of your deployed Render backend later
// For now, it will use localhost for testing against your local backend.
// const WS_URL = 'wss://your-render-backend-name.onrender.com';
const WS_URL = 'ws://localhost:8080'; // Correct protocol for WebSockets

// Define total segments here, matching your backend
const TOTAL_SEGMENTS = 4;
const segments = ['Head', 'Torso', 'Legs', 'Feet']; // Matches backend messaging

export default function ExquisiteCorpseGame() {
	const canvasRef = useRef(null);
	const contextRef = useRef(null); // Store the 2D context
	const wsRef = useRef(null); // WebSocket instance

	const [isDrawing, setIsDrawing] = useState(false);
	const [lastX, setLastX] = useState(0);
	const [lastY, setLastY] = useState(0);

	// Game State Variables, all managed via WebSocket
	const [gameCode, setGameCode] = useState(''); // User input for joining game code
	const [generatedGameCode, setGeneratedGameCode] = useState(''); // Game code received from createGame API
	const [gameRoomId, setGameRoomId] = useState(null); // Actual DB ID of the game room, set by WS
	const [message, setMessage] = useState(
		'Enter a game code to join or create one!'
	);
	const [playerCount, setPlayerCount] = useState(0); // Tracks how many players are in the room
	const [currentSegmentIndex, setCurrentSegmentIndex] = useState(0); // Which part is being drawn (0-Head, 1-Torso, etc.)
	// Added state to hold the current segment name (e.g., 'Head', 'Torso')
	const [currentSegment, setCurrentSegment] = useState(segments[0]);
	const [canDrawOnCanvas, setCanDrawOnCanvas] = useState(false); // Whether the current player can draw
	const [isWaitingForOtherPlayers, setIsWaitingForOtherPlayers] =
		useState(false); // Whether current player submitted and is waiting
	const [receivedCanvasImage, setReceivedCanvasImage] = useState(null); // Data URL for the previous segment's peek
	const [playerName, setPlayerName] = useState(''); // State for player name input
	const [isGameOver, setIsGameOver] = useState(false);
	const [finalArtwork, setFinalArtwork] = useState(null); // Stores the final combined artwork for player 1
	// New state to store the final combined artwork for player 2
	const [finalArtwork2, setFinalArtwork2] = useState(null);
	const [hasJoinedGame, setHasJoinedGame] = useState(false); // New state to manage initial screen vs game screen
	const [currentPlayersWsId, setCurrentPlayersWsId] = useState(null); // State to store the player's WS ID from the server
	// Removed the `socket` state as it's redundant

	// WebSocket Initialization and Message Handling
	useEffect(() => {
		// Only connect if we haven't already and are about to join a game
		// CRITICAL: Ensure wsRef.current is null to prevent re-connections
		if (hasJoinedGame && !wsRef.current) {
			console.log('Attempting to establish WebSocket connection...');
			const ws = new WebSocket(WS_URL);
			wsRef.current = ws;

			// Capture the current values for initial joinGame message
			const codeToJoinOnOpen = generatedGameCode || gameCode;
			const nameForJoin = playerName;

			ws.onopen = () => {
				console.log('WebSocket connected. Sending joinGame message...');
				// After connection, send the joinGame message with the correct code
				// playerId is sent as null initially; the server will assign and send it back.
				ws.send(
					JSON.stringify({
						type: 'joinGame',
						gameCode: codeToJoinOnOpen,
						playerId: null, // Send null initially, server will set this
						playerName: nameForJoin,
					})
				);
			};

			ws.onmessage = (event) => {
				const data = JSON.parse(event.data);
				console.log('Received from server:', data);

				setMessage(data.message);
				setPlayerCount(data.playerCount || 0);
				setCurrentSegmentIndex(data.currentSegmentIndex || 0);
				// Update the current segment name based on the index
				setCurrentSegment(segments[data.currentSegmentIndex || 0]);
				setCanDrawOnCanvas(data.canDraw || false);
				setIsWaitingForOtherPlayers(data.isWaitingForOthers || false);
				setGameRoomId(data.gameRoomId || null);

				// Set the current player's WebSocket ID if received from the server
				// Only update if the ID is provided and different from current state
				if (data.playerId && data.playerId !== currentPlayersWsId) {
					setCurrentPlayersWsId(data.playerId);
				}

				if (data.canvasData) {
					setReceivedCanvasImage(data.canvasData);
					// Draw the received image (peek or current canvas) onto the canvas
					if (canvasRef.current) {
						const image = new Image();
						image.onload = () => {
							const ctx = canvasRef.current.getContext('2d');
							ctx.clearRect(0, 0, 800, 600); // Clear before drawing new
							ctx.drawImage(image, 0, 0);
						};
						image.onerror = (error) => {
							console.error(
								'Error loading received canvas image:',
								error
							);
						};
						image.src = data.canvasData;
					}
				} else {
					setReceivedCanvasImage(null); // Clear if no canvas data
					// If no canvasData and not game over, clear the canvas
					if (canvasRef.current && data.status !== 'completed') {
						const ctx = canvasRef.current.getContext('2d');
						ctx.clearRect(0, 0, 800, 600);
					}
				}

				if (data.status === 'completed') {
					setIsGameOver(true);
					// Ensure finalArtwork1 and finalArtwork2 are correctly set
					setFinalArtwork(data.finalArtwork1 || null);
					setFinalArtwork2(data.finalArtwork2 || null);
					setCanDrawOnCanvas(false);
				} else if (data.type === 'playerDisconnected') {
					setIsGameOver(false); // Reset if game was over but player disconnected
					setFinalArtwork(null);
					setFinalArtwork2(null); // Clear the second artwork as well
				}

				// Initial state request: when a player connects or re-connects
				if (
					data.type === 'initialState' ||
					data.type === 'gameStarted'
				) {
					setGameCode(data.gameCode || gameCode); // Use received code, fallback to existing
					setGeneratedGameCode(data.gameCode || generatedGameCode); // Use received code, fallback to existing
					setCanDrawOnCanvas(data.canDraw);
					setIsWaitingForOtherPlayers(data.isWaitingForOthers);
					setReceivedCanvasImage(data.canvasData);
					setFinalArtwork(data.finalArtwork1 || null);
					setFinalArtwork2(data.finalArtwork2 || null);
					if (data.status === 'completed') {
						setIsGameOver(true);
					} else {
						setIsGameOver(false);
					}
				}
			};

			ws.onclose = () => {
				console.log('WebSocket disconnected.');
				// Set hasJoinedGame to false to return to the initial screen on disconnect
				setMessage(
					'Disconnected from game. Please create or rejoin a game.'
				);
				setHasJoinedGame(false); // Go back to initial screen on disconnect
				setCurrentPlayersWsId(null); // Clear player ID on disconnect
				wsRef.current = null; // CRITICAL: Clear the ref so a new connection can be attempted next time
			};

			ws.onerror = (error) => {
				console.error('WebSocket error:', error);
				setMessage('WebSocket error. Check console for details.');
				wsRef.current = null; // Clear ref on error too
				setHasJoinedGame(false); // Go back to initial screen on error
			};

			// Cleanup function: This runs when the component unmounts or before the effect re-runs
			return () => {
				if (
					wsRef.current &&
					wsRef.current.readyState === WebSocket.OPEN
				) {
					console.log('Cleaning up WebSocket connection...');
					wsRef.current.close();
				}
				wsRef.current = null; // Ensure the ref is cleared
			};
		}
		// CRITICAL CHANGE: The dependency array now only includes `hasJoinedGame`.
		// This ensures the WebSocket connection logic only runs when we explicitly intend to connect.
	}, [hasJoinedGame]);

	// Canvas setup and drawing logic (remains mostly the same, now draws from receivedCanvasImage)
	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas) return;

		const context = canvas.getContext('2d');
		context.lineCap = 'round';
		context.strokeStyle = 'black';
		context.lineWidth = 5;
		contextRef.current = context;

		// The drawing of receivedCanvasImage is now primarily handled in the ws.onmessage handler.
		// This useEffect can ensure the canvas is cleared initially or if image becomes null.
		if (!receivedCanvasImage && currentSegmentIndex === 0) {
			context.clearRect(0, 0, canvas.width, canvas.height);
		}
	}, [canvasRef.current, receivedCanvasImage, currentSegmentIndex]);

	const startDrawing = useCallback(
		(e) => {
			// Add null check for contextRef.current
			if (!contextRef.current || !canDrawOnCanvas || isGameOver) return;
			const { offsetX, offsetY } = e.nativeEvent;
			setIsDrawing(true);
			setLastX(offsetX);
			setLastY(offsetY);
			contextRef.current.beginPath();
			contextRef.current.moveTo(offsetX, offsetY);
		},
		[canDrawOnCanvas, isGameOver]
	);

	const draw = useCallback(
		(e) => {
			// Add null check for contextRef.current
			if (
				!isDrawing ||
				!contextRef.current ||
				!canDrawOnCanvas ||
				isGameOver
			)
				return;
			const { offsetX, offsetY } = e.nativeEvent;
			contextRef.current.lineTo(offsetX, offsetY);
			contextRef.current.stroke();
			setLastX(offsetX);
			setLastY(offsetY);
		},
		[isDrawing, canDrawOnCanvas, isGameOver]
	);

	const stopDrawing = useCallback(() => {
		// Add null check for contextRef.current
		if (!contextRef.current || !canDrawOnCanvas || isGameOver) return;
		setIsDrawing(false);
		contextRef.current.closePath();
	}, [canDrawOnCanvas, isGameOver]);

	const submitSegment = () => {
		if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
			setMessage('WebSocket not connected. Cannot submit.');
			return;
		}
		if (!canDrawOnCanvas || isWaitingForOtherPlayers || isGameOver) {
			setMessage('Cannot submit now.');
			return;
		}

		const canvas = canvasRef.current;
		if (!canvas) return;

		const dataURL = canvas.toDataURL('image/png'); // Get current canvas content as data URL
		wsRef.current.send(
			JSON.stringify({
				type: 'submitSegment',
				gameRoomId: gameRoomId,
				canvasData: dataURL,
				playerId: currentPlayersWsId, // Use the state variable for player ID
			})
		);
		setMessage(
			`Submitting segment ${segments[currentSegmentIndex]}... Waiting for others.`
		);
		setCanDrawOnCanvas(false);
		setIsWaitingForOtherPlayers(true);
	};

	const createNewGame = async () => {
		if (playerName.trim() === '') {
			setMessage('Please enter your name before creating a game.');
			return;
		}
		try {
			const response = await axios.post(
				'http://localhost:8080/api/createGame'
			); // Make HTTP POST request
			const { gameCode: newGameCode } = response.data;
			setGeneratedGameCode(newGameCode); // Store the generated code
			setGameCode(''); // Clear any manually entered code
			setMessage(`Game created! Share this code: ${newGameCode}`);
			setHasJoinedGame(true); // Indicate we are ready to join with the generated code
		} catch (error) {
			console.error('Error creating game:', error);
			setMessage('Failed to create game. Please try again.');
		}
	};

	const joinExistingGame = () => {
		if (playerName.trim() === '') {
			setMessage('Please enter your name before joining a game.');
			return;
		}
		if (gameCode.trim() === '') {
			setMessage('Please enter a game code to join.');
			return;
		}
		setGeneratedGameCode(''); // Clear generated code if joining existing
		setMessage(`Attempting to join game ${gameCode}...`);
		setHasJoinedGame(true); // Indicate we are ready to join with the user-entered code
	};

	const clearCanvas = () => {
		const canvas = canvasRef.current;
		if (canvas) {
			const context = canvas.getContext('2d');
			context.clearRect(0, 0, canvas.width, canvas.height); // Clear the entire canvas
			// If there's a peek image, re-draw it after clearing
			if (receivedCanvasImage) {
				const img = new Image();
				img.onload = () => {
					context.drawImage(img, 0, 0, canvas.width, canvas.height);
				};
				img.src = receivedCanvasImage;
			}
		}
	};

	// New function to handle "Play Again" by returning to the initial screen
	const handlePlayAgain = () => {
		// 1. Close existing WebSocket connection if open
		if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
			wsRef.current.close();
		}
		wsRef.current = null; // Ensure the ref is cleared immediately

		// 2. Reset all game-specific states to their initial, pre-joined game values
		// PlayerName is intentionally kept to avoid re-typing
		setIsDrawing(false);
		setLastX(0);
		setLastY(0);
		setGameCode('');
		setGeneratedGameCode('');
		setGameRoomId(null);
		setMessage(
			'Your game ended. Enter a game code to join or create a new one!'
		);
		setPlayerCount(0);
		setCurrentSegmentIndex(0);
		setCurrentSegment(segments[0]); // Reset to 'Head'
		setCanDrawOnCanvas(false);
		setIsWaitingForOtherPlayers(false);
		setReceivedCanvasImage(null);
		setIsGameOver(false);
		setFinalArtwork(null);
		setFinalArtwork2(null);
		setCurrentPlayersWsId(null);

		// 3. Set hasJoinedGame to false to render the initial game screen
		setHasJoinedGame(false);
	};

	return (
		<div className="min-h-screen bg-gradient-to-br from-purple-100 to-indigo-200 p-8 flex flex-col items-center justify-center font-sans">
			<h1 className="text-5xl font-extrabold text-purple-800 mb-6 drop-shadow-lg">
				Exquisite Corpse Game
			</h1>

			{!hasJoinedGame ? (
				// Initial screen: Join or Create
				<div className="bg-white p-8 rounded-2xl shadow-xl max-w-md w-full text-center space-y-6">
					<h2 className="text-2xl font-semibold text-gray-800 mb-4">
						Welcome!
					</h2>
					<input
						type="text"
						placeholder="Enter your Player Name"
						value={playerName}
						onChange={(e) => setPlayerName(e.target.value)}
						className="w-full p-3 border border-gray-300 rounded-lg text-lg focus:ring-purple-500 focus:border-purple-500"
						maxLength={20}
					/>
					<div className="space-y-4">
						<button
							onClick={createNewGame}
							className="w-full bg-purple-600 text-white py-3 rounded-lg text-xl font-bold hover:bg-purple-700 transition-colors shadow-md"
						>
							Create New Game
						</button>
						<div className="relative flex items-center py-2">
							<div className="flex-grow border-t border-gray-300"></div>
							<span className="flex-shrink mx-4 text-gray-500 text-lg">
								OR
							</span>
							<div className="flex-grow border-t border-gray-300"></div>
						</div>
						<input
							type="text"
							placeholder="Enter Game Code to Join"
							value={gameCode}
							onChange={(e) =>
								setGameCode(e.target.value.toUpperCase())
							}
							className="w-full p-3 border border-gray-300 rounded-lg text-lg focus:ring-purple-500 focus:border-purple-500 uppercase"
							maxLength={6}
						/>
						<button
							onClick={joinExistingGame}
							className="w-full bg-indigo-600 text-white py-3 rounded-lg text-xl font-bold hover:bg-indigo-700 transition-colors shadow-md"
						>
							Join Existing Game
						</button>
					</div>
					<p className="text-red-500 text-md mt-4">{message}</p>
				</div>
			) : (
				// Game screen once a game is joined/created
				<div className="bg-white p-8 rounded-2xl shadow-xl w-full max-w-4xl flex flex-col items-center space-y-6">
					<p className="text-xl text-gray-700 font-medium">
						{message}
					</p>
					{gameRoomId &&
						!isGameOver && ( // Only show game code when not game over
							<p className="text-2xl font-bold text-purple-700">
								Game Code: {generatedGameCode || gameCode}
							</p>
						)}
					{!isGameOver && ( // Only show player count when not game over
						<p className="text-lg text-gray-600">
							Players in room: {playerCount} / 2
						</p>
					)}
					{/* Only show current segment when not game over */}
					{!isGameOver && (
						<p className="text-xl font-semibold text-gray-800">
							Drawing: {currentSegment}
						</p>
					)}

					{!isGameOver && ( // Conditional rendering for the main canvas and its controls
						<>
							<div className="relative bg-gray-100 rounded-lg shadow-inner border border-gray-200">
								<canvas
									ref={canvasRef}
									width={800}
									height={600}
									onMouseDown={startDrawing}
									onMouseMove={draw}
									onMouseUp={stopDrawing}
									onMouseOut={stopDrawing}
									className={`rounded-lg ${
										canDrawOnCanvas
											? 'cursor-crosshair'
											: 'cursor-not-allowed'
									}`}
								></canvas>
							</div>

							<div className="flex space-x-4 mt-4">
								<button
									onClick={clearCanvas}
									className={`px-8 py-4 text-xl font-bold rounded-lg transition-all duration-300 ease-in-out transform hover:scale-105
                                ${
									canDrawOnCanvas && !isGameOver
										? 'bg-red-500 text-white shadow-lg hover:bg-red-600'
										: 'bg-gray-400 cursor-not-allowed shadow-inner'
								}`}
									disabled={!canDrawOnCanvas || isGameOver}
								>
									Clear Canvas
								</button>
								<button
									onClick={submitSegment}
									className={`px-8 py-4 text-xl font-bold rounded-lg transition-all duration-300 ease-in-out transform hover:scale-105
                                ${
									isWaitingForOtherPlayers ||
									!canDrawOnCanvas ||
									isGameOver
										? 'bg-gray-400 cursor-not-allowed shadow-inner'
										: 'bg-green-600 text-white shadow-lg hover:bg-green-700'
								}`}
									disabled={
										isWaitingForOtherPlayers ||
										!canDrawOnCanvas ||
										isGameOver
									}
								>
									{isWaitingForOtherPlayers
										? 'Waiting for Others...'
										: 'Submit Segment'}
								</button>
							</div>
						</>
					)}

					{isGameOver && (
						<div className="mt-8 text-center">
							<h2 className="text-4xl font-extrabold text-purple-700 mb-4 animate-bounce">
								Game Over!
							</h2>
							<p className="text-xl text-gray-700 mb-6">
								The Exquisite Corpse is complete!
							</p>
							{/* Display both final artworks one below the other */}
							<div className="flex flex-col items-center space-y-8 mb-8">
								{' '}
								{/* Changed to flex-col and space-y */}
								{finalArtwork && (
									<img
										src={finalArtwork}
										alt="Final Combined Artwork 1"
										className="max-w-full h-auto border-4 border-purple-500 rounded-xl shadow-2xl block" // Removed mx-auto for flex-col centering
									/>
								)}
								{finalArtwork2 && (
									<img
										src={finalArtwork2}
										alt="Final Combined Artwork 2"
										className="max-w-full h-auto border-4 border-purple-500 rounded-xl shadow-2xl block" // Removed mx-auto for flex-col centering
									/>
								)}
							</div>
							<button
								onClick={handlePlayAgain} // Changed to call handlePlayAgain
								className="px-8 py-4 text-xl font-bold rounded-lg bg-blue-600 text-white shadow-lg hover:bg-blue-700 transition-colors transform hover:scale-105"
							>
								Play Again
							</button>
						</div>
					)}
				</div>
			)}
		</div>
	);
}
