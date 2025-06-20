import { useEffect, useRef, useState, useCallback } from 'react';

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
	const [gameCode, setGameCode] = useState(''); // User input for game code
	const [gameRoomId, setGameRoomId] = useState(null); // Actual DB ID of the game room, set by WS
	const [message, setMessage] = useState(
		'Enter a game code to join or create one!'
	);
	const [playerCount, setPlayerCount] = useState(0); // Tracks how many players are in the room
	const [currentSegmentIndex, setCurrentSegmentIndex] = useState(0); // Current drawing segment (0: Head, 1: Torso, etc.)
	const [receivedCanvasImage, setReceivedCanvasImage] = useState(null); // Stores the image from previous combined segments
	const [canDrawOnCanvas, setCanDrawOnCanvas] = useState(false); // Frontend state for drawing ability
	const [isWaitingForOtherPlayers, setIsWaitingForOtherPlayers] =
		useState(false); // True after *this player* submits, waiting for others
	const [isGameOver, setIsGameOver] = useState(false); // True when the game has ended
	const [finalArtwork, setFinalArtwork] = useState(null); // Stores the final combined artwork from gameOver message

	// --- Utility to clear canvas (Moved definition here) ---
	const clearCanvas = useCallback(() => {
		const canvas = canvasRef.current;
		if (canvas && contextRef.current) {
			contextRef.current.clearRect(0, 0, canvas.width, canvas.height);
			setReceivedCanvasImage(null); // Clear any background image
		}
	}, []); // This useCallback has no dependencies itself, so it's stable

	// --- WebSocket Connection & Message Handling ---
	useEffect(() => {
		// Initialize WebSocket connection
		wsRef.current = new WebSocket(WS_URL);

		wsRef.current.onopen = () => {
			console.log('WebSocket connected!');
			setMessage(
				'Connected to server. Enter a game code to join or create!'
			);
			// If already in a game (e.g., refreshing page and gameRoomId was persisted somehow, or you want to re-request state)
			// For this version, we assume `gameRoomId` is lost on refresh and user needs to re-enter code.
			// If the backend handles session restoration, this part would need more logic.
		};

		wsRef.current.onmessage = (event) => {
			const data = JSON.parse(event.data);
			console.log('Received from server:', data.type, data);

			switch (data.type) {
				case 'playerJoined': // Broadcast when a player joins, or re-sent to all to update state
				case 'gameStarted': // Sent when game transitions from waiting to in-progress (2 players joined)
					setGameRoomId(data.gameRoomId); // The backend assigns and sends the gameRoomId
					setPlayerCount(data.playerCount);
					setCurrentSegmentIndex(data.currentSegmentIndex);
					setMessage(data.message);
					setIsGameOver(false); // Ensure not game over if it was before
					setFinalArtwork(null); // Clear any previous final artwork

					// *** CRITICAL: Set drawing ability based on server's instruction (using data.canDraw) ***
					setCanDrawOnCanvas(data.canDraw);
					setIsWaitingForOtherPlayers(data.isWaitingForOthers);

					// Handle canvas display for the new segment
					const canvas = canvasRef.current;
					const ctx = contextRef.current;
					if (canvas && ctx) {
						if (
							data.currentSegmentIndex === 0 &&
							!data.canvasData // Only clear if it's the very first segment (Head) and no previous data
						) {
							ctx.clearRect(0, 0, canvas.width, canvas.height);
							setReceivedCanvasImage(null); // Clear any previous image
						} else if (data.canvasData) {
							// Later segment or rejoining, draw the received image as background
							const img = new Image();
							img.onload = () => {
								ctx.clearRect(
									0,
									0,
									canvas.width,
									canvas.height
								); // Clear existing before drawing new background
								ctx.drawImage(
									img,
									0,
									0,
									canvas.width,
									canvas.height
								); // Draw combined previous
							};
							img.onerror = (e) =>
								console.error(
									'Error loading received canvas image on playerJoined/gameStarted:',
									e
								);
							img.src = data.canvasData;
							setReceivedCanvasImage(data.canvasData);
						}
					}
					break;

				case 'playerDisconnected':
					setPlayerCount(data.playerCount);
					setMessage(data.message);
					setCanDrawOnCanvas(data.canDraw); // Server will likely send false
					setIsWaitingForOtherPlayers(data.isWaitingForOthers); // Server will likely send false
					setIsGameOver(false);
					// Optionally clear canvas or reset game if only one player remains, or if game becomes unplayable
					if (data.playerCount < 2) {
						clearCanvas(); // Now `clearCanvas` is defined
						setGameRoomId(null); // Game effectively ended for this client
						setMessage(
							'Another player disconnected. Please create or join a new game.'
						);
					}
					break;

				case 'submissionReceived': // This is sent ONLY to the player who submitted
					setMessage(data.message);
					setCanDrawOnCanvas(data.canDraw); // Submitting player gets canDraw: false
					setIsWaitingForOtherPlayers(data.isWaitingForOthers); // Submitting player gets isWaitingForOthers: true
					break;

				case 'playerSubmitted': // Sent to other players when one player submits
					setMessage(data.message);
					// Their own canDraw/isWaitingForOthers state should not change by this message
					break;

				case 'segmentAdvanced': // Sent to ALL players when a new segment starts
					setReceivedCanvasImage(data.canvasData); // The combined image from previous segment(s)
					setCurrentSegmentIndex(data.currentSegmentIndex);
					setMessage(data.message);
					// *** CRITICAL: Reset drawing ability for ALL players when segment advances ***
					setCanDrawOnCanvas(data.canDraw); // Should be true for the current drawer
					setIsWaitingForOtherPlayers(data.isWaitingForOthers); // Should be false
					setIsGameOver(false);
					setFinalArtwork(null); // Clear final artwork if a new segment is starting (just in case)

					// Redraw the canvas with the received combined image
					const canvasAdvanced = canvasRef.current;
					const ctxAdvanced = contextRef.current;
					if (canvasAdvanced && ctxAdvanced) {
						ctxAdvanced.clearRect(
							0,
							0,
							canvasAdvanced.width,
							canvasAdvanced.height
						); // Clear existing before drawing new background
						if (data.canvasData) {
							const img = new Image();
							img.onload = () => {
								ctxAdvanced.drawImage(
									img,
									0,
									0,
									canvasAdvanced.width,
									canvasAdvanced.height
								);
							};
							img.onerror = (e) =>
								console.error(
									'Error loading received canvas image on segmentAdvanced:',
									e
								);
							img.src = data.canvasData;
						}
					}
					break;

				case 'gameOver':
					setIsGameOver(true);
					setMessage(data.message);
					setFinalArtwork(data.finalArtwork); // Stores the final combined artwork
					setCanDrawOnCanvas(false);
					setIsWaitingForOtherPlayers(false);
					setCurrentSegmentIndex(data.currentSegmentIndex); // Should be TOTAL_SEGMENTS
					console.log('Game Over! Final artwork:', data.finalArtwork);
					// Clear the drawing canvas when game is over
					clearCanvas(); // Now `clearCanvas` is defined
					break;

				case 'error':
					setMessage(`Error: ${data.message}`);
					console.error('Server error:', data.message);
					setCanDrawOnCanvas(false);
					setIsWaitingForOtherPlayers(false);
					// Importantly, on an error, consider disconnecting to allow user to retry
					if (
						wsRef.current &&
						wsRef.current.readyState === WebSocket.OPEN
					) {
						wsRef.current.close();
					}
					setGameRoomId(null); // Clear game room ID on error to prompt re-entry
					setPlayerCount(0);
					setCurrentSegmentIndex(0);
					setIsGameOver(false);
					setFinalArtwork(null);
					clearCanvas(); // Now `clearCanvas` is defined
					break;

				case 'clearCanvas': // Handle clear canvas from backend
					clearCanvas(); // Now `clearCanvas` is defined
					setMessage(data.message);
					break;

				default:
					console.log(
						'Unknown message type received:',
						data.type,
						data
					);
					break;
			}
		};

		wsRef.current.onerror = (error) => {
			console.error('WebSocket error:', error);
			setMessage('WebSocket error. See console for details.');
			setCanDrawOnCanvas(false);
			setIsWaitingForOtherPlayers(false);
			setGameRoomId(null); // Reset game state fully on connection error
			setPlayerCount(0);
			setIsGameOver(false);
			setFinalArtwork(null);
			clearCanvas(); // Now `clearCanvas` is defined
		};

		wsRef.current.onclose = () => {
			console.log('WebSocket disconnected.');
			setMessage(
				'Disconnected from server. Please refresh to try again.'
			);
			setCanDrawOnCanvas(false);
			setIsWaitingForOtherPlayers(false);
			setGameRoomId(null); // Reset game state fully on disconnect
			setPlayerCount(0);
			setIsGameOver(false);
			setFinalArtwork(null);
			clearCanvas(); // Now `clearCanvas` is defined
		};

		// Cleanup on component unmount
		return () => {
			if (wsRef.current) {
				wsRef.current.close();
			}
		};
	}, [clearCanvas]); // This useEffect correctly depends on clearCanvas now

	// --- Canvas Context Initialization (runs once after canvasRef is set) ---
	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas) return;

		const ctx = canvas.getContext('2d');
		if (ctx) {
			contextRef.current = ctx; // Store context in ref

			ctx.lineCap = 'round';
			ctx.strokeStyle = 'black';
			ctx.lineWidth = 2;

			// Clear canvas on initial load (only once)
			ctx.clearRect(0, 0, canvas.width, canvas.height);
		}
	}, []); // Empty dependency array means this runs only once after initial render

	// --- Drawing Functions ---
	const draw = useCallback(
		(e) => {
			// Only allow drawing if drawing is active AND we are allowed to draw on canvas
			if (
				!isDrawing ||
				!canvasRef.current ||
				!contextRef.current ||
				!canDrawOnCanvas
			)
				return;

			const canvas = canvasRef.current;
			const ctx = contextRef.current; // Use context from ref
			const rect = canvas.getBoundingClientRect();

			// Handle both mouse and touch events
			const clientX = e.touches ? e.touches[0].clientX : e.clientX;
			const clientY = e.touches ? e.touches[0].clientY : e.clientY;

			const currentX = clientX - rect.left;
			const currentY = clientY - rect.top;

			ctx.beginPath();
			ctx.moveTo(lastX, lastY);
			ctx.lineTo(currentX, currentY);
			ctx.stroke();

			setLastX(currentX);
			setLastY(currentY);
		},
		[isDrawing, lastX, lastY, canDrawOnCanvas] // Depend on canDrawOnCanvas
	);

	const handleMouseDown = useCallback(
		(e) => {
			e.preventDefault(); // Prevent scrolling on touch devices
			// Only allow drawing if in drawing phase
			if (!canvasRef.current || !canDrawOnCanvas) return;

			setIsDrawing(true);
			const rect = canvasRef.current.getBoundingClientRect();
			const clientX = e.touches ? e.touches[0].clientX : e.clientX;
			const clientY = e.touches ? e.touches[0].clientY : e.clientY;

			setLastX(clientX - rect.left);
			setLastY(clientY - rect.top);
		},
		[canDrawOnCanvas] // Depend on canDrawOnCanvas
	);

	const handleMouseUp = useCallback(() => {
		setIsDrawing(false);
	}, []);

	const handleMouseMove = useCallback(
		(e) => {
			e.preventDefault(); // Prevent scrolling on touch devices
			draw(e);
		},
		[draw]
	);

	// --- UI Interactions ---
	const handleGameCodeChange = useCallback((e) => {
		setGameCode(e.target.value.toUpperCase());
	}, []);

	const joinOrCreateGame = useCallback(() => {
		if (!gameCode) {
			setMessage('Please enter a game code.');
			return;
		}

		const ws = wsRef.current;
		// Check if connection is open before sending
		if (ws && ws.readyState === WebSocket.OPEN) {
			ws.send(
				JSON.stringify({
					type: 'joinGame',
					gameCode: gameCode,
					nickname: `Player${Math.floor(Math.random() * 1000)}`, // Simple dynamic nickname
				})
			);
			setMessage(`Attempting to join/create game ${gameCode}...`);
		} else {
			setMessage('WebSocket is not connected. Please wait or refresh.');
		}
	}, [gameCode]);

	const submitSegment = useCallback(() => {
		const canvas = canvasRef.current;
		const ctx = contextRef.current;

		if (
			!wsRef.current ||
			wsRef.current.readyState !== WebSocket.OPEN ||
			!canvas ||
			!ctx ||
			!gameRoomId // Ensure gameRoomId is set from the WebSocket connection
		) {
			setMessage(
				'Not connected to the game server or canvas not ready. Please join a game.'
			);
			return;
		}

		if (playerCount < 2) {
			setMessage('Waiting for another player to join before submitting.');
			return;
		}
		if (currentSegmentIndex >= TOTAL_SEGMENTS) {
			setMessage('Game is already over!');
			return;
		}
		// Only allow submission if currently able to draw and not already waiting
		if (!canDrawOnCanvas || isWaitingForOtherPlayers) {
			setMessage("It's not your turn to draw, or you already submitted.");
			return;
		}

		const canvasData = canvas.toDataURL('image/png'); // Get the current canvas content as a Data URL
		wsRef.current.send(
			JSON.stringify({
				type: 'submitSegment',
				gameRoomId: gameRoomId, // The gameRoomId comes from the WS server's 'playerJoined' message
				segmentIndex: currentSegmentIndex,
				canvasData: canvasData,
			})
		);
		setMessage(
			`Submitted ${segments[currentSegmentIndex]}! Waiting for other player to submit...`
		);
		setCanDrawOnCanvas(false); // Disable drawing immediately after submitting
		setIsWaitingForOtherPlayers(true); // Set state to waiting
	}, [
		gameRoomId,
		playerCount,
		currentSegmentIndex,
		canDrawOnCanvas,
		isWaitingForOtherPlayers,
	]);

	return (
		<div className="flex flex-col items-center p-5 bg-gray-100 min-h-screen font-inter">
			<div className="max-w-4xl w-full bg-white p-6 rounded-lg shadow-xl border border-gray-200">
				<h1 className="text-3xl font-bold text-center text-gray-800 mb-4">
					Exquisite Corpse Game
				</h1>
				<p className="text-lg text-center text-gray-600 mb-4 font-semibold">
					{message}
				</p>
				<p className="text-md text-center text-gray-700 mb-2">
					Players: {playerCount}
				</p>

				{!gameRoomId && !isGameOver && (
					<div className="flex justify-center mb-6">
						<input
							type="text"
							placeholder="Enter Game Code"
							value={gameCode}
							onChange={handleGameCodeChange}
							maxLength={6}
							className="p-3 border border-gray-300 rounded-md mr-3 text-lg uppercase focus:ring-blue-500 focus:border-blue-500"
							style={{ minWidth: '200px' }}
						/>
						<button
							onClick={joinOrCreateGame}
							className={`px-6 py-3 text-lg font-semibold rounded-md transition-colors duration-300
                                ${
									!gameCode ||
									wsRef.current?.readyState !== WebSocket.OPEN
										? 'bg-gray-400 cursor-not-allowed'
										: 'bg-blue-600 hover:bg-blue-700 text-white shadow-md'
								}`}
							disabled={
								!gameCode ||
								wsRef.current?.readyState !== WebSocket.OPEN
							}
						>
							Join/Create Game
						</button>
					</div>
				)}

				{gameRoomId && playerCount < 2 && !isGameOver && (
					<p className="text-xl text-center text-blue-600 font-medium animate-pulse">
						Waiting for another player to join game{' '}
						<b>{gameCode}</b>...
					</p>
				)}

				{gameRoomId && playerCount >= 2 && !isGameOver && (
					<>
						<h2 className="text-2xl font-bold text-center text-gray-800 mb-4">
							Current Segment: {segments[currentSegmentIndex]}
						</h2>
						<canvas
							ref={canvasRef}
							width={800}
							height={600}
							className="border-2 border-gray-400 rounded-lg bg-white w-full max-w-full h-auto block mx-auto mb-6"
							style={{
								touchAction: 'none', // Disable default touch actions for drawing
								cursor: canDrawOnCanvas
									? 'crosshair'
									: 'not-allowed',
								opacity: canDrawOnCanvas ? 1 : 0.6,
							}}
							onMouseDown={handleMouseDown}
							onMouseUp={handleMouseUp}
							onMouseLeave={handleMouseUp}
							onMouseMove={handleMouseMove}
							onTouchStart={handleMouseDown}
							onTouchEnd={handleMouseUp}
							onTouchCancel={handleMouseUp}
							onTouchMove={handleMouseMove}
						></canvas>
						<div className="flex justify-center">
							<button
								onClick={submitSegment}
								className={`px-8 py-4 text-xl font-bold rounded-lg transition-all duration-300 ease-in-out transform hover:scale-105
                                    ${
										isWaitingForOtherPlayers ||
										!canDrawOnCanvas
											? 'bg-gray-400 cursor-not-allowed shadow-inner'
											: 'bg-green-600 text-white shadow-lg hover:bg-green-700'
									}`}
								disabled={
									isWaitingForOtherPlayers || !canDrawOnCanvas
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
						{finalArtwork && (
							<img
								src={finalArtwork}
								alt="Final Combined Artwork"
								className="max-w-full h-auto border-4 border-purple-500 rounded-xl shadow-2xl mx-auto block mb-8"
							/>
						)}
						<button
							onClick={() => window.location.reload()}
							className="px-8 py-4 text-xl font-bold rounded-lg bg-indigo-600 text-white shadow-lg
                                transition-all duration-300 ease-in-out transform hover:scale-105 hover:bg-indigo-700"
						>
							Start New Game
						</button>
					</div>
				)}
			</div>
		</div>
	);
}
