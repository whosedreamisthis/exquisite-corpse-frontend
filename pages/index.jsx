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

	// --- Utility to clear canvas ---
	const clearCanvas = useCallback(() => {
		const canvas = canvasRef.current;
		if (canvas && contextRef.current) {
			contextRef.current.clearRect(0, 0, canvas.width, canvas.height);
			setReceivedCanvasImage(null); // Clear any background image
			console.log(
				'[clearCanvas] Canvas cleared and receivedCanvasImage reset.'
			);
		}
	}, []);

	// --- Canvas Context Initialization (runs once on mount, as canvas is now always in DOM) ---
	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas) {
			console.error(
				'[useEffect Canvas Init] Canvas ref is null after initial render. This should not happen now.'
			);
			return;
		}

		const ctx = canvas.getContext('2d');
		if (ctx) {
			contextRef.current = ctx; // Store context in ref

			ctx.lineCap = 'round';
			ctx.strokeStyle = 'black';
			ctx.lineWidth = 2;

			ctx.clearRect(0, 0, canvas.width, canvas.height); // Clear canvas on initial load
			console.log(
				'[useEffect Canvas Init] Canvas context initialized and cleared.'
			);
		} else {
			console.error(
				'[useEffect Canvas Init] Could not get 2D context from canvas.'
			);
		}
	}, []); // Empty dependency array because canvasRef.current is now always available from the start

	// --- WebSocket Connection & Message Handling ---
	useEffect(() => {
		console.log('[useEffect] Initializing WebSocket...');
		wsRef.current = new WebSocket(WS_URL);

		wsRef.current.onopen = () => {
			console.log('WebSocket connected!');
			setMessage(
				'Connected to server. Enter a game code to join or create!'
			);
		};

		wsRef.current.onmessage = (event) => {
			const data = JSON.parse(event.data);
			console.log('Received from server (full data):', data); // Log full data for inspection

			switch (data.type) {
				case 'playerJoined': // Broadcast when a player joins, or re-sent to all to update state
				case 'gameStarted': // Sent when game transitions from waiting to in-progress (2 players joined)
					setGameRoomId(data.gameRoomId); // The backend assigns and sends the gameRoomId
					setPlayerCount(data.playerCount);
					setCurrentSegmentIndex(data.currentSegmentIndex);
					setMessage(data.message);
					setIsGameOver(false); // Ensure not game over if it was before
					setFinalArtwork(null); // Clear any previous final artwork

					// These are the critical values to check from the backend
					setCanDrawOnCanvas(data.canDraw);
					setIsWaitingForOtherPlayers(data.isWaitingForOthers);

					console.log(
						`[WS Message - ${data.type}] After setting states: gameRoomId=${data.gameRoomId}, canDraw=${data.canDraw}, isWaitingForOthers=${data.isWaitingForOthers}`
					);

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
							console.log(
								'[WS Message] Cleared canvas for new game/segment 0.'
							);
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
								console.log(
									'[WS Message] Drawn received canvasData onto canvas.'
								);
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
					console.log(
						`[WS Message - playerDisconnected] playerCount: ${data.playerCount}, canDraw: ${data.canDraw}, isWaitingForOthers: ${data.isWaitingForOthers}`
					);
					// Optionally clear canvas or reset game if only one player remains, or if game becomes unplayable
					if (data.playerCount < 2) {
						clearCanvas();
						setGameRoomId(null); // Game effectively ended for this client
						setMessage(
							'Another player disconnected. Please create or join a new game.'
						);
						console.log(
							'[WS Message - playerDisconnected] Game room ID cleared due to low players.'
						);
					}
					break;

				case 'submissionReceived': // This is sent ONLY to the player who submitted
					setMessage(data.message);
					setCanDrawOnCanvas(data.canDraw); // Submitting player gets canDraw: false
					setIsWaitingForOtherPlayers(data.isWaitingForOthers); // Submitting player gets isWaitingForOthers: true
					console.log(
						`[WS Message - submissionReceived] canDraw: ${data.canDraw}, isWaitingForOthers: ${data.isWaitingForOthers}`
					);
					break;

				case 'playerSubmitted': // Sent to other players when one player submits
					setMessage(data.message);
					console.log(
						`[WS Message - playerSubmitted] Message: ${data.message}`
					);
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

					console.log(
						`[WS Message - segmentAdvanced] currentSegmentIndex: ${data.currentSegmentIndex}, canDraw: ${data.canDraw}, isWaitingForOthers: ${data.isWaitingForOthers}`
					);

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
								console.log(
									'[WS Message] Drawn received canvasData for advanced segment.'
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
					clearCanvas();
					break;

				case 'error':
					setMessage(`Error: ${data.message}`);
					console.error('Server error:', data.message);
					setCanDrawOnCanvas(false);
					setIsWaitingForOtherPlayers(false);
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
					clearCanvas();
					console.log(
						'[WS Message - error] Game state reset due to error.'
					);
					break;

				case 'clearCanvas': // Handle clear canvas from backend
					clearCanvas();
					setMessage(data.message);
					console.log('[WS Message] Backend requested canvas clear.');
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
			clearCanvas();
			console.log('[WS Error] Game state reset due to WebSocket error.');
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
			clearCanvas();
			console.log('[WS Close] Game state reset due to WebSocket close.');
		};

		// Cleanup on component unmount
		return () => {
			if (wsRef.current) {
				wsRef.current.close();
				console.log('[useEffect cleanup] WebSocket closed.');
			}
		};
	}, [clearCanvas]);

	// --- Drawing Functions ---
	const draw = useCallback(
		(e) => {
			// Only allow drawing if drawing is active AND we are allowed to draw on canvas
			if (
				!isDrawing ||
				!canvasRef.current ||
				!contextRef.current || // contextRef.current should now be reliably available
				!canDrawOnCanvas
			) {
				return;
			}

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
			// Diagnostic log for debugging drawing start
			console.log(
				`[handleMouseDown] canDrawOnCanvas: ${canDrawOnCanvas}, canvasRef.current: ${!!canvasRef.current}, contextRef.current: ${!!contextRef.current}`
			);

			// Only allow drawing if in drawing phase
			if (!canvasRef.current || !contextRef.current || !canDrawOnCanvas) {
				// contextRef.current should now be reliably available
				console.log(
					'[handleMouseDown] Drawing start aborted: conditions not met (canvas/context not ready or not permitted).'
				);
				return;
			}

			setIsDrawing(true);
			const rect = canvasRef.current.getBoundingClientRect();
			const clientX = e.touches ? e.touches[0].clientX : e.clientX;
			const clientY = e.touches ? e.touches[0].clientY : e.clientY;

			setLastX(clientX - rect.left);
			setLastY(clientY - rect.top);
			console.log(
				`[handleMouseDown] Drawing started at (${
					clientX - rect.left
				}, ${clientY - rect.top}).`
			);
		},
		[canDrawOnCanvas] // Depend on canDrawOnCanvas
	);

	const handleMouseUp = useCallback(() => {
		setIsDrawing(false);
		console.log('[handleMouseUp] Drawing ended.');
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
		console.log(
			`[handleGameCodeChange] Game code set to: ${e.target.value.toUpperCase()}`
		);
	}, []);

	const joinOrCreateGame = useCallback(() => {
		if (!gameCode) {
			setMessage('Please enter a game code.');
			console.warn('[joinOrCreateGame] No game code entered.');
			return;
		}

		const ws = wsRef.current;
		// Check if connection is open before sending
		if (ws && ws.readyState === WebSocket.OPEN) {
			console.log(
				`[joinOrCreateGame] Sending joinGame for gameCode: ${gameCode}`
			);
			ws.send(
				JSON.stringify({
					type: 'joinGame',
					gameCode: gameCode,
					nickname: `Player${Math.floor(Math.random() * 1000)}`, // Simple dynamic nickname
				})
			);
			setMessage(`Attempting to join/create game ${gameCode}...`);
		} else {
			console.error(
				'[joinOrCreateGame] WebSocket not connected or ready. ReadyState:',
				ws?.readyState
			);
			setMessage('WebSocket is not connected. Please wait or refresh.');
		}
	}, [gameCode]);

	const submitSegment = useCallback(() => {
		const canvas = canvasRef.current;
		const ctx = contextRef.current;

		// Diagnostic log: ALL conditions for submission
		console.log(`--- [submitSegment] Check conditions before sending ---`);
		console.log(
			`WS readyState: ${
				wsRef.current?.readyState === WebSocket.OPEN
					? 'OPEN'
					: wsRef.current?.readyState
			}`
		);
		console.log(`canvasRef.current: ${!!canvasRef.current}`);
		console.log(`contextRef.current: ${!!contextRef.current}`); // Should be true now
		console.log(`gameRoomId: ${gameRoomId}`);
		console.log(`playerCount: ${playerCount}`);
		console.log(
			`currentSegmentIndex: ${currentSegmentIndex} (TOTAL_SEGMENTS: ${TOTAL_SEGMENTS})`
		);
		console.log(`canDrawOnCanvas: ${canDrawOnCanvas}`);
		console.log(`isWaitingForOtherPlayers: ${isWaitingForOtherPlayers}`);
		console.log(`-----------------------------------------------------`);

		if (
			!wsRef.current ||
			wsRef.current.readyState !== WebSocket.OPEN ||
			!canvas ||
			!ctx || // Now 'ctx' should be reliably available
			!gameRoomId // Ensure gameRoomId is set from the WebSocket connection
		) {
			setMessage(
				'Not connected to the game server or canvas not ready. Please join a game.'
			);
			console.error(
				'[submitSegment] Submission failed: Pre-conditions not met.'
			);
			return;
		}

		if (playerCount < 2) {
			setMessage('Waiting for another player to join before submitting.');
			console.warn(
				'[submitSegment] Submission failed: Not enough players.'
			);
			return;
		}
		if (currentSegmentIndex >= TOTAL_SEGMENTS) {
			setMessage('Game is already over!');
			console.warn(
				'[submitSegment] Submission failed: Game is already over.'
			);
			return;
		}
		// Only allow submission if currently able to draw and not already waiting
		if (!canDrawOnCanvas || isWaitingForOtherPlayers) {
			setMessage("It's not your turn to draw, or you already submitted.");
			console.warn(
				`[submitSegment] Submission failed: canDrawOnCanvas=${canDrawOnCanvas}, isWaitingForOtherPlayers=${isWaitingForOtherPlayers}`
			);
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
		console.log(
			`[submitSegment] Segment ${segments[currentSegmentIndex]} submitted.`
		);
	}, [
		gameRoomId,
		playerCount,
		currentSegmentIndex,
		canDrawOnCanvas,
		isWaitingForOtherPlayers,
	]);

	// Diagnostic log for current render state
	console.log(
		`[RENDER CYCLE] gameRoomId: ${gameRoomId}, playerCount: ${playerCount}, currentSegmentIndex: ${currentSegmentIndex}, canDrawOnCanvas: ${canDrawOnCanvas}, isWaitingForOtherPlayers: ${isWaitingForOtherPlayers}, isGameOver: ${isGameOver}`
	);

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

				{/* Conditional rendering for join/create game input */}
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

				{/* Conditional rendering for waiting message */}
				{gameRoomId && playerCount < 2 && !isGameOver && (
					<p className="text-xl text-center text-blue-600 font-medium animate-pulse">
						Waiting for another player to join game{' '}
						<b>{gameCode}</b>...
					</p>
				)}

				{/* Canvas and Submit Button - Always render canvas, control interaction via state */}
				<div
					style={{
						display:
							gameRoomId && playerCount >= 2 && !isGameOver
								? 'block'
								: 'none',
					}}
				>
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
									isWaitingForOtherPlayers || !canDrawOnCanvas
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
				</div>

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
