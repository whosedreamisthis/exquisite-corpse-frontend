import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import axios from 'axios'; // Import axios for HTTP requests
// No need to import globals.css here, it should be in _app.js or _app.tsx

// IMPORTANT: Replace this with the URL of your deployed Render backend later
// For now, it will use localhost for testing against your local backend.
// const WS_URL = 'wss://your-render-backend-name.onrender.com';
const WS_URL = 'ws://localhost:8080'; // Correct protocol for WebSockets

// Define total segments here
const TOTAL_SEGMENTS = 4;
const segments = ['Head', 'Torso', 'Legs', 'Feet']; // Matches backend messaging
const CANVAS_WIDTH = 800; // Consistent width
const CANVAS_HEIGHT = 600; // Consistent height
const SEGMENT_HEIGHT = CANVAS_HEIGHT / TOTAL_SEGMENTS; // Calculate the height of each segment
const PEEK_HEIGHT = 20; // This should be consistent with frontend logic

export default function ExquisiteCorpseGame() {
	// Refs for the two canvases and their contexts
	const drawingCanvasRef = useRef(null); // Main canvas for actual drawing
	const drawingContextRef = useRef(null);

	const overlayCanvasRef = useRef(null); // Overlay canvas for temporary red line
	const overlayContextRef = useRef(null);

	const wsRef = useRef(null); // WebSocket instance

	const [isDrawing, setIsDrawing] = useState(false);
	const [lastX, setLastX] = useState(0); // Not strictly needed with two canvases, but kept for consistency
	const [lastY, setLastY] = useState(0); // Not strictly needed, but kept for consistency

	// New state to track if any drawing has occurred in the current segment
	const [hasDrawnSomething, setHasDrawnSomething] = useState(false);

	// New state for red line positioning
	const [isPlacingRedLine, setIsPlacingRedLine] = useState(false);
	const [redLineY, setRedLineY] = useState(CANVAS_HEIGHT); // Initial position at bottom of canvas

	// Game State Variables, all managed via WebSocket
	const [gameCode, setGameCode] = useState(''); // User input for joining game code
	const [generatedGameCode, setGeneratedGameCode] = useState(''); // Game code received from createGame API
	const [gameRoomId, setGameRoomId] = useState(null); // Actual DB ID of the game room, set by WS
	const [message, setMessage] = useState(
		'Enter a game code to join or create one!'
	);
	const [playerCount, setPlayerCount] = useState(0); // Tracks how many players are in the room
	const [currentSegmentIndex, setCurrentSegmentIndex] = useState(0); // Which part is being drawn (0-Head, 1-Torso, etc.)
	const [currentSegment, setCurrentSegment] = useState(
		segments[(currentSegmentIndex + 1) % TOTAL_SEGMENTS]
	); // Show next segment
	// canDrawOrPlaceLine will now depend on both game state and whether player is in drawing OR line placing mode
	const [canDrawOrPlaceLine, setCanDrawOrPlaceLine] = useState(false);
	const [isWaitingForOtherPlayers, setIsWaitingForOtherPlayers] =
		useState(false); // Whether current player submitted and is waiting
	const [receivedCanvasImage, setReceivedCanvasImage] = useState(null); // Data URL for the previous player's full drawing
	const [previousRedLineY, setPreviousRedLineY] = useState(null); // The redLineY from the previous player's submission
	// REMOVED: playerName state
	const [isGameOver, setIsGameOver] = useState(false);
	const [finalArtwork, setFinalArtwork] = useState(null); // Stores the final combined artwork for player 1
	const [finalArtwork2, setFinalArtwork2] = useState(null); // New state to store the final combined artwork for player 2
	const [hasJoinedGame, setHasJoinedGame] = useState(false); // New state to manage initial screen vs game screen
	const [currentPlayersWsId, setCurrentPlayersWsId] = useState(null); // State to store the player's WS ID from the server

	// Declare isLastSegment here so it's accessible by all functions
	const isLastSegment = currentSegmentIndex === TOTAL_SEGMENTS - 1;

	// WebSocket Initialization and Message Handling
	useEffect(() => {
		// Only connect if we haven't already and are about to join a game
		if (hasJoinedGame && !wsRef.current) {
			console.log('Attempting to establish WebSocket connection...');
			const ws = new WebSocket(WS_URL);
			wsRef.current = ws;

			// Capture the current values for initial joinGame message
			const codeToJoinOnOpen = generatedGameCode || gameCode;
			// REMOVED: nameForJoin variable as playerName is removed

			ws.onopen = () => {
				console.log('WebSocket connected. Sending joinGame message...');
				// After connection, send the joinGame message with the correct code
				ws.send(
					JSON.stringify({
						type: 'joinGame',
						gameCode: codeToJoinOnOpen,
						playerId: null, // Send null initially, server will set this
						// REMOVED: playerName from the message
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
				setCurrentSegment(
					segments[(data.currentSegmentIndex + 1) % TOTAL_SEGMENTS]
				); // Show next segment

				// canDrawOrPlaceLine is now the general permission
				setCanDrawOrPlaceLine(data.canDraw || false);
				setIsWaitingForOtherPlayers(data.isWaitingForOthers || false);
				setGameRoomId(data.gameRoomId || null);

				// Set the current player's WebSocket ID if received from the server
				if (data.playerId && data.playerId !== currentPlayersWsId) {
					setCurrentPlayersWsId(data.playerId);
				}

				if (
					data.hasOwnProperty('canvasData') &&
					data.canvasData !== null
				) {
					setReceivedCanvasImage(data.canvasData);
					// Draw the received image (previous segment) onto the MAIN drawing canvas immediately
					if (drawingCanvasRef.current) {
						const image = new Image();
						image.onload = () => {
							const ctx =
								drawingCanvasRef.current.getContext('2d');
							ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT); // Clear before drawing new base image
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
				} else if (
					data.hasOwnProperty('canvasData') &&
					data.canvasData === null
				) {
					setReceivedCanvasImage(null); // Clear if no canvas data
					// If no canvasData and not game over, clear the main drawing canvas
					if (
						drawingCanvasRef.current &&
						data.status !== 'completed'
					) {
						const ctx = drawingCanvasRef.current.getContext('2d');
						ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
					}
				}

				// Set the previous red line Y if available. If it's the first segment, it should be null.
				setPreviousRedLineY(
					data.currentSegmentIndex === 0
						? null
						: data.previousRedLineY || null
				);

				if (data.status === 'completed') {
					setIsGameOver(true);
					// Ensure finalArtwork1 and finalArtwork2 are correctly set
					setFinalArtwork(data.finalArtwork1 || null);
					setFinalArtwork2(data.finalArtwork2 || null);
					setCanDrawOrPlaceLine(false); // No drawing/placing line when game over
					setIsPlacingRedLine(false); // Exit line placing mode
				} else if (data.type === 'playerDisconnected') {
					setIsGameOver(false); // Reset if game was over but player disconnected
					setFinalArtwork(null);
					setFinalArtwork2(null); // Clear the second artwork as well
					setIsPlacingRedLine(false); // Exit line placing mode
				}

				// Initial state request: when a player connects or re-connects
				if (
					data.type === 'initialState' ||
					data.type === 'gameStarted'
				) {
					setGameCode(data.gameCode || gameCode); // Use received code, fallback to existing
					setGeneratedGameCode(data.gameCode || generatedGameCode); // Use received code, fallback to existing
					setCanDrawOrPlaceLine(data.canDraw);
					setIsWaitingForOtherPlayers(data.isWaitingForOthers);
					setReceivedCanvasImage(data.canvasData);
					setPreviousRedLineY(data.previousRedLineY || null);
					setFinalArtwork(data.finalArtwork1 || null);
					setFinalArtwork2(data.finalArtwork2 || null);
					if (data.status === 'completed') {
						setIsGameOver(true);
					} else {
						setIsGameOver(false);
					}
					// When a new segment begins, reset redLineY to bottom for next player to place
					setRedLineY(CANVAS_HEIGHT); // Default for placement phase
					setIsPlacingRedLine(false); // Start in drawing mode
					setHasDrawnSomething(false); // Reset drawing flag for new segment
					clearRedLineFromOverlay(); // Clear any existing red line on the overlay
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
				setIsPlacingRedLine(false); // Exit line placing mode
				setHasDrawnSomething(false); // Reset drawing flag
			};

			ws.onerror = (error) => {
				console.error('WebSocket error:', error);
				setMessage('WebSocket error. Check console for details.');
				wsRef.current = null; // Clear ref on error too
				setHasJoinedGame(false); // Go back to initial screen on error
				setIsPlacingRedLine(false); // Exit line placing mode
				setHasDrawnSomething(false); // Reset drawing flag
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
	}, [hasJoinedGame, generatedGameCode, gameCode, currentPlayersWsId]); // playerName removed from dependencies

	// Canvas setup: Initialize contexts for both canvases
	useEffect(() => {
		const drawingCanvas = drawingCanvasRef.current;
		const overlayCanvas = overlayCanvasRef.current;

		if (!drawingCanvas || !overlayCanvas) return;

		// Set up drawing canvas context
		const dCtx = drawingCanvas.getContext('2d');
		dCtx.lineCap = 'round';
		dCtx.strokeStyle = 'black';
		dCtx.lineWidth = 5;
		drawingContextRef.current = dCtx;

		// Set up overlay canvas context (must be transparent)
		const oCtx = overlayCanvas.getContext('2d');
		overlayContextRef.current = oCtx;
		// Ensure overlay is transparent
		oCtx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

		// Clear drawing canvas initially if no image is present for the first segment
		if (!receivedCanvasImage && currentSegmentIndex === 0) {
			dCtx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
		}
	}, [
		drawingCanvasRef,
		overlayCanvasRef,
		receivedCanvasImage,
		currentSegmentIndex,
	]); // Added dependencies for clarity

	// Function to draw the temporary red line on the overlay canvas
	const drawRedLineOnOverlay = useCallback(
		(y) => {
			const overlayCanvas = overlayCanvasRef.current;
			const oCtx = overlayContextRef.current;
			if (!overlayCanvas || !oCtx) return;

			oCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height); // Clear previous red line
			oCtx.strokeStyle = 'red';
			oCtx.lineWidth = 2; // Thinner for the red line
			oCtx.beginPath();
			oCtx.moveTo(0, y);
			oCtx.lineTo(overlayCanvas.width, y);
			oCtx.stroke();
			oCtx.closePath();
		},
		[] // No dependencies as it operates on refs
	);

	// Function to clear the temporary red line from the overlay canvas
	const clearRedLineFromOverlay = useCallback(() => {
		const overlayCanvas = overlayCanvasRef.current;
		const oCtx = overlayContextRef.current;
		if (!overlayCanvas || !oCtx) return;
		oCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height); // Clear the entire overlay
	}, []); // No dependencies as it operates on refs

	// Helper to get coordinates from mouse or touch events
	const getCoordinates = useCallback((e, canvas) => {
		const rect = canvas.getBoundingClientRect();
		const scaleX = canvas.width / rect.width;
		const scaleY = canvas.height / rect.height;

		let clientX, clientY;
		if (e.touches && e.touches.length > 0) {
			// Touch event
			clientX = e.touches[0].clientX;
			clientY = e.touches[0].clientY;
		} else {
			// Mouse event
			clientX = e.clientX;
			clientY = e.clientY;
		}

		const x = (clientX - rect.left) * scaleX;
		const y = (clientY - rect.top) * scaleY;
		return { x, y };
	}, []);

	// --- Event Handlers for Drawing Phase (adapted for touch) ---
	const handleCanvasStart = useCallback(
		(e) => {
			if (!canDrawOrPlaceLine || isGameOver) return;

			e.preventDefault(); // Prevent scrolling on touch devices

			const canvas = overlayCanvasRef.current;
			if (!canvas) return;

			const { x, y } = getCoordinates(e, canvas);

			setIsDrawing(true);
			setLastX(x);
			setLastY(y);

			if (!isPlacingRedLine) {
				// Start drawing path on the main drawing canvas
				if (!drawingContextRef.current) return;
				drawingContextRef.current.beginPath();
				drawingContextRef.current.moveTo(x, y);
			}
		},
		[canDrawOrPlaceLine, isGameOver, isPlacingRedLine, getCoordinates]
	);

	const handleCanvasMove = useCallback(
		(e) => {
			if (!isDrawing || !canDrawOrPlaceLine || isGameOver) return;

			e.preventDefault(); // Prevent scrolling on touch devices

			const canvas = overlayCanvasRef.current;
			if (!canvas) return;

			const { x, y } = getCoordinates(e, canvas);

			if (!isPlacingRedLine) {
				// Drawing mode
				if (!drawingContextRef.current) return;
				drawingContextRef.current.lineTo(x, y);
				drawingContextRef.current.stroke();
				setHasDrawnSomething(true); // User has drawn something
			} else {
				// Red line placing mode
				// Constrain redLineY within canvas bounds
				const newRedLineY = Math.max(0, Math.min(CANVAS_HEIGHT, y));
				setRedLineY(newRedLineY); // Update the red line's Y position
				drawRedLineOnOverlay(newRedLineY); // Redraw the line
			}
			setLastX(x);
			setLastY(y);
		},
		[
			isDrawing,
			canDrawOrPlaceLine,
			isGameOver,
			isPlacingRedLine,
			drawRedLineOnOverlay,
			getCoordinates,
		]
	);

	const handleCanvasEnd = useCallback(() => {
		if (!canDrawOrPlaceLine || isGameOver) return;

		if (isDrawing) {
			// If we were in drawing mode, close the path
			if (drawingContextRef.current && !isPlacingRedLine) {
				drawingContextRef.current.closePath();
			}
			setIsDrawing(false);
		}
	}, [canDrawOrPlaceLine, isGameOver, isDrawing, isPlacingRedLine]);

	// Use onMouseOut to also stop drawing or placing line if mouse leaves canvas
	const handleMouseOut = useCallback(() => {
		if (isDrawing && !isPlacingRedLine) {
			// If actively drawing and not placing line
			handleCanvasEnd(); // Stop drawing
		} else if (isPlacingRedLine && isDrawing) {
			// If dragging the line and mouse goes out
			setIsDrawing(false); // Stop the "drag" state for the line
			// The red line remains visible where it was last
		}
	}, [isDrawing, isPlacingRedLine, handleCanvasEnd]);

	// --- Action Buttons ---
	const clearCanvas = () => {
		const drawingCanvas = drawingCanvasRef.current;
		const drawingContext = drawingContextRef.current;
		if (drawingCanvas && drawingContext) {
			drawingContext.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT); // Clear the entire drawing canvas
			// If there's a previous segment image, re-draw it after clearing
			if (receivedCanvasImage) {
				const img = new Image();
				img.onload = () => {
					drawingContext.drawImage(
						img,
						0,
						0,
						CANVAS_WIDTH,
						CANVAS_HEIGHT
					);
				};
				img.src = receivedCanvasImage;
			}
		}
		clearRedLineFromOverlay(); // Also clear the red line from the overlay
		setIsPlacingRedLine(false); // Exit line placement mode if clearing
		setRedLineY(CANVAS_HEIGHT); // Reset red line position
		setHasDrawnSomething(false); // Reset drawing flag
	};

	const submitSegment = () => {
		if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
			setMessage('WebSocket not connected. Cannot submit.');
			return;
		}

		if (
			!canDrawOrPlaceLine ||
			isWaitingForOtherPlayers ||
			isGameOver ||
			(!isPlacingRedLine && !isLastSegment) || // Must be in placing mode if not the last segment
			(!hasDrawnSomething && !isPlacingRedLine) // Must have drawn something OR be in placing mode
		) {
			setMessage(
				'Cannot submit: Not your turn, game over, or conditions not met.'
			);
			return;
		}

		// Get the current canvas data as a Data URL (PNG format for transparency)
		const currentCanvasData =
			drawingCanvasRef.current.toDataURL('image/png');

		// Send the current drawing and the red line Y position to the server
		wsRef.current.send(
			JSON.stringify({
				type: 'submitSegment',
				gameRoomId: gameRoomId,
				canvasData: currentCanvasData,
				redLineY: isLastSegment ? null : redLineY, // Only send redLineY if it's not the last segment
				playerId: currentPlayersWsId, // Use the state variable for player ID
			})
		);
		setIsDrawing(false); // Stop drawing
		setIsWaitingForOtherPlayers(true); // Now waiting for other players
		setCanDrawOrPlaceLine(false); // Cannot draw anymore until next turn
		setHasDrawnSomething(false); // Reset drawing flag for next turn
		setIsPlacingRedLine(false); // Exit line placing mode after submission
		clearRedLineFromOverlay(); // Clear the red line from the overlay after submission
	};

	// --- Game Setup / Join ---
	const createNewGame = async () => {
		// REMOVED: playerName validation
		try {
			// Keeping endpoint as /api/createGame based on your feedback
			const response = await axios.post(
				'http://localhost:8080/api/createGame',
				{} // Add empty body explicitly
			);
			const { gameCode: newGameCode } = response.data;
			setGeneratedGameCode(newGameCode);
			setGameCode('');
			setMessage(`Game created! Share this code: ${newGameCode}`);
			setHasJoinedGame(true);
		} catch (error) {
			console.error('Error creating game:', error);
			setMessage('Failed to create game. Please try again.');
		}
	};

	const joinExistingGame = () => {
		// REMOVED: playerName validation
		if (gameCode.trim() === '') {
			setMessage('Please enter a game code to join.');
			return;
		}
		setGeneratedGameCode('');
		setMessage(`Attempting to join game ${gameCode}...`);
		setHasJoinedGame(true);
	};

	// New function to handle "Done Drawing" to transition to red line placement
	const handleDoneDrawing = useCallback(() => {
		// Only trigger if not the last segment
		if (currentSegmentIndex === TOTAL_SEGMENTS - 1) return;

		// Ensure drawing is stopped and path is closed (if it wasn't already)
		setIsDrawing(false); // Ensure drawing state is false
		if (drawingContextRef.current) {
			drawingContextRef.current.closePath();
		}

		// Transition to red line placement mode
		setIsPlacingRedLine(true);
		// Set initial red line position (e.g., center or bottom)
		setRedLineY(CANVAS_HEIGHT / 2); // Start red line in the middle
		drawRedLineOnOverlay(CANVAS_HEIGHT / 2); // Draw it immediately
	}, [drawRedLineOnOverlay, currentSegmentIndex]);

	const handlePlayAgain = () => {
		// Close existing WebSocket connection if open
		if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
			wsRef.current.close();
		}
		wsRef.current = null; // Ensure the ref is cleared immediately

		// Reset all game-specific states to their initial, pre-joined game values
		setIsDrawing(false);
		setLastX(0);
		setLastY(0);
		setHasDrawnSomething(false);
		setIsPlacingRedLine(false);
		setRedLineY(CANVAS_HEIGHT); // Reset to default bottom position

		setGameCode(''); // Clear user input game code
		setGeneratedGameCode(''); // Clear generated game code
		setGameRoomId(null);
		setMessage('Enter a game code to join or create one!'); // Initial message
		setPlayerCount(0);
		setCurrentSegmentIndex(0);
		setCurrentSegment(segments[1]); // Assuming 'Head' is segment 0, so next is 'Torso'
		setCanDrawOrPlaceLine(false);
		setIsWaitingForOtherPlayers(false);
		setReceivedCanvasImage(null);
		setPreviousRedLineY(null);
		setIsGameOver(false); // Explicitly reset game over state
		setFinalArtwork(null);
		setFinalArtwork2(null);
		setHasJoinedGame(false); // Go back to the initial screen
		setCurrentPlayersWsId(null); // Clear player ID

		// Clear canvases
		if (drawingContextRef.current) {
			drawingContextRef.current.clearRect(
				0,
				0,
				CANVAS_WIDTH,
				CANVAS_HEIGHT
			);
		}
		clearRedLineFromOverlay(); // Ensure overlay is clear
	};

	// Determine if the "Submit Segment" button should be enabled/visible
	const canSubmitSegment =
		canDrawOrPlaceLine &&
		!isWaitingForOtherPlayers &&
		!isGameOver &&
		(isPlacingRedLine ||
			(isLastSegment && hasDrawnSomething && !isDrawing));

	return (
		<div className="min-h-screen bg-gradient-to-br from-purple-100 to-indigo-200 p-8 flex flex-col items-center justify-center font-sans">
			{!hasJoinedGame && (
				<h1 className="text-5xl font-extrabold text-purple-800 mb-6 drop-shadow-lg">
					Exquisite Corpse Game
				</h1>
			)}

			{!hasJoinedGame ? (
				// Initial screen: Join or Create
				<div className="bg-white p-8 rounded-2xl shadow-xl max-w-md w-full text-center space-y-6">
					<h2 className="text-2xl font-semibold text-gray-800 mb-4">
						Welcome!
					</h2>
					{/* REMOVED: Player Name input field */}
					<div className="space-y-4">
						<button
							onClick={createNewGame}
							className="w-full p-3 border border-gray-300 rounded-lg text-lg focus:ring-purple-500 focus:border-purple-500"
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
				<div className="bg-red-300 rounded-2xl shadow-xl w-full max-w-3xl flex flex-col items-center relative">
					{' '}
					{/* Changed: Added 'relative' */}
					<p className="message text-xl text-gray-700 font-medium">
						{message}
					</p>
					{gameRoomId &&
						!isGameOver && ( // Only show game code when not game over
							<p className="text-2xl font-bold text-purple-700">
								Game Code: {generatedGameCode || gameCode}
							</p>
						)}
					{!isGameOver && ( // Conditional rendering for the main canvas and its controls
						<>
							<div className="relative bg-gray-100 rounded-lg shadow-inner border border-gray-200 overflow-hidden">
								{/* Main Drawing Canvas (z-index 0, lowest) */}
								<canvas
									ref={drawingCanvasRef}
									width={CANVAS_WIDTH}
									height={CANVAS_HEIGHT}
									className="absolute top-0 left-0 rounded-lg"
									style={{ zIndex: 0 }}
								></canvas>

								{/* This div contains the previous segment hiding overlay (z-index 1, middle) */}
								<div
									className="absolute top-0 left-0 w-full h-full"
									style={{
										width: CANVAS_WIDTH,
										height: CANVAS_HEIGHT,
										// Ensure pointerEvents are none so mouse events pass to overlayCanvasRef
										pointerEvents: 'none',
										zIndex: 1, // This div sits ABOVE drawingCanvasRef
									}}
								>
									{/* Overlay to hide previous segment based on previous player's redLineY */}
									{receivedCanvasImage &&
										currentSegmentIndex > 0 &&
										previousRedLineY !== null && (
											<div
												className="absolute top-0 left-0 w-full bg-gray-200 bg-opacity-75 flex items-center justify-center text-gray-600 text-xl font-semibold"
												style={{
													// Cover everything from the top down to the previous player's red line
													height: `${previousRedLineY}px`,
													pointerEvents: 'none', // Ensure it doesn't block mouse events
													overflow: 'hidden', // Important for content not to spill
												}}
											>
												Previous Segment Hidden
											</div>
										)}
								</div>

								{/* Overlay Canvas for Red Line (z-index 2, highest, interactive) */}
								<canvas
									ref={overlayCanvasRef}
									width={CANVAS_WIDTH}
									height={CANVAS_HEIGHT}
									// Attach mouse events for both drawing and line placement
									onMouseDown={handleCanvasStart}
									onMouseMove={handleCanvasMove}
									onMouseUp={handleCanvasEnd}
									onMouseOut={handleMouseOut}
									onTouchStart={handleCanvasStart}
									onTouchMove={handleCanvasMove}
									onTouchEnd={handleCanvasEnd}
									onTouchCancel={handleCanvasEnd}
									className={`relative rounded-lg ${
										canDrawOrPlaceLine
											? 'cursor-crosshair'
											: 'cursor-not-allowed'
									}`}
									style={{ zIndex: 2 }} // Ensure it's on top
								></canvas>

								{/* Overlay when waiting for other players */}
								{isWaitingForOtherPlayers && (
									<div className="absolute inset-0 bg-black bg-opacity-70 flex items-center justify-center rounded-lg text-white text-3xl font-bold text-center p-4 z-30">
										Submitted!
										<br />
										Waiting for other player to submit their
										segment...
									</div>
								)}
							</div>

							{/* This is the div containing your buttons */}
							<div className="game-buttons-container">
								{' '}
								{/* Changed: Added this class and removed Tailwind positioning */}
								<button
									onClick={clearCanvas}
									className={`px-2 py-2  text-lg font-bold rounded-lg transition-all duration-300 ease-in-out transform hover:scale-105 flex items-center justify-center
                                ${
									canDrawOrPlaceLine && !isGameOver
										? 'bg-red-500 text-white shadow-lg hover:bg-red-600'
										: 'bg-gray-400 cursor-not-allowed shadow-inner'
								}`}
									disabled={!canDrawOrPlaceLine || isGameOver}
									title="Clear Canvas" // Add a title for accessibility
								>
									<svg
										xmlns="http://www.w3.org/2000/svg"
										fill="none"
										viewBox="0 0 24 24"
										strokeWidth={2.5}
										stroke="currentColor"
										className="w-7 h-7"
									>
										<path
											strokeLinecap="round"
											strokeLinejoin="round"
											d="M6 18L18 6M6 6l12 12"
										/>
									</svg>
									<span className="sr-only">
										Clear Canvas
									</span>{' '}
									{/* For screen readers */}
								</button>
								{/* Conditionally show Done Drawing or Submit Segment button */}
								{!isLastSegment &&
									!isPlacingRedLine && ( // Show "Done Drawing" if not last segment and not placing line
										<button
											onClick={handleDoneDrawing}
											className={`px-2 py-2 text-lg font-bold rounded-lg transition-all duration-300 ease-in-out transform hover:scale-105 flex items-center justify-center
                                        ${
											canDrawOrPlaceLine &&
											!isWaitingForOtherPlayers &&
											!isGameOver &&
											hasDrawnSomething &&
											!isDrawing // Enabled if player can act, isn't waiting, isn't over, has drawn, and isn't actively drawing
												? 'bg-blue-600 text-white shadow-lg hover:bg-blue-700'
												: 'bg-gray-400 cursor-not-allowed shadow-inner'
										}`}
											disabled={
												!canDrawOrPlaceLine ||
												isWaitingForOtherPlayers ||
												isGameOver ||
												!hasDrawnSomething ||
												isDrawing
											} // Disabled if conditions not met
											title="Done Drawing" // Add a title for accessibility
										>
											<svg
												xmlns="http://www.w3.org/2000/svg"
												fill="none"
												viewBox="0 0 24 24"
												strokeWidth={2.5}
												stroke="currentColor"
												className="w-7 h-7"
											>
												<path
													strokeLinecap="round"
													strokeLinejoin="round"
													d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
												/>
											</svg>
											<span className="sr-only">
												Done Drawing
											</span>{' '}
											{/* For screen readers */}
										</button>
									)}
								{(isPlacingRedLine || isLastSegment) && ( // Show "Submit Segment" if in line placing mode OR if it's the last segment
									<button
										onClick={submitSegment}
										className={`px-3 py-3 text-lg font-bold rounded-lg transition-all duration-300 ease-in-out transform hover:scale-105 flex items-center justify-center
                                        ${
											canSubmitSegment
												? 'bg-green-600 text-white shadow-lg hover:bg-green-700'
												: 'bg-gray-400 cursor-not-allowed shadow-inner'
										}`}
										disabled={!canSubmitSegment}
										title={
											isLastSegment
												? 'Submit Final Artwork'
												: 'Submit Segment'
										} // Dynamic title
									>
										<svg
											xmlns="http://www.w3.org/2000/svg"
											fill="none"
											viewBox="0 0 24 24"
											strokeWidth={2.5}
											stroke="currentColor"
											className="w-7 h-7"
										>
											{isLastSegment ? (
												<path
													strokeLinecap="round"
													strokeLinejoin="round"
													d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
												/> // Checkmark for final submit
											) : (
												<path
													strokeLinecap="round"
													strokeLinejoin="round"
													d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5"
												/> // Send icon for segment
											)}
										</svg>
										<span className="sr-only">
											{isLastSegment
												? 'Submit Final Artwork'
												: 'Submit Segment'}
										</span>
									</button>
								)}
							</div>
						</>
					)}
					{isGameOver && (
						<div className="text-center">
							<h2 className="text-4xl font-extrabold text-purple-700 mb-4 animate-bounce">
								Game Over!
							</h2>
							<div className="flex flex-col items-center space-y-8 mb-8">
								{finalArtwork && (
									<img
										src={finalArtwork}
										alt="Final Combined Artwork 1"
										className="max-w-full h-auto border-4 border-purple-500 rounded-xl shadow-2xl block"
									/>
								)}
								{finalArtwork2 && (
									<img
										src={finalArtwork2}
										alt="Final Combined Artwork 2"
										className="max-w-full h-auto border-4 border-purple-500 rounded-xl shadow-2xl block"
									/>
								)}
							</div>
							<button
								onClick={handlePlayAgain}
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
