import { useEffect, useRef, useState, useCallback } from 'react';
import axios from 'axios'; // Import axios for HTTP requests

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
	const [playerName, setPlayerName] = useState(''); // State for player name input
	const [isGameOver, setIsGameOver] = useState(false);
	const [finalArtwork, setFinalArtwork] = useState(null); // Stores the final combined artwork for player 1
	const [finalArtwork2, setFinalArtwork2] = useState(null); // New state to store the final combined artwork for player 2
	const [hasJoinedGame, setHasJoinedGame] = useState(false); // New state to manage initial screen vs game screen
	const [currentPlayersWsId, setCurrentPlayersWsId] = useState(null); // State to store the player's WS ID from the server

	// WebSocket Initialization and Message Handling
	useEffect(() => {
		// Only connect if we haven't already and are about to join a game
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
	}, [
		hasJoinedGame,
		generatedGameCode,
		gameCode,
		playerName,
		currentPlayersWsId,
	]); // Ensure all dependencies are correctly listed

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

	// --- Event Handlers for Drawing Phase ---
	const startDrawing = useCallback(
		(e) => {
			if (
				!drawingContextRef.current ||
				!canDrawOrPlaceLine ||
				isGameOver ||
				isPlacingRedLine // Cannot draw if placing red line
			)
				return;
			const { offsetX, offsetY } = e.nativeEvent;
			setIsDrawing(true);
			setLastX(offsetX);
			setLastY(offsetY);

			// Start drawing path on the main drawing canvas
			drawingContextRef.current.beginPath();
			drawingContextRef.current.moveTo(offsetX, offsetY);
		},
		[canDrawOrPlaceLine, isGameOver, isPlacingRedLine]
	);

	const draw = useCallback(
		(e) => {
			// This handler will be used for both drawing and moving the red line
			if (!canDrawOrPlaceLine || isGameOver) return;

			const { offsetX, offsetY } = e.nativeEvent;

			if (isDrawing && !isPlacingRedLine) {
				// Drawing mode
				if (!drawingContextRef.current) return;
				drawingContextRef.current.lineTo(offsetX, offsetY);
				drawingContextRef.current.stroke();
				setLastX(offsetX);
				setLastY(offsetY);
				setHasDrawnSomething(true); // User has drawn something
			} else if (isPlacingRedLine && isDrawing) {
				// Only move line if mouse is down AND in placing mode
				// Constrain redLineY within canvas bounds
				const newRedLineY = Math.max(
					0,
					Math.min(CANVAS_HEIGHT, offsetY)
				);
				setRedLineY(newRedLineY); // Update the red line's Y position
				drawRedLineOnOverlay(newRedLineY); // Redraw the line
			}
		},
		[
			isDrawing,
			canDrawOrPlaceLine,
			isGameOver,
			isPlacingRedLine,
			drawRedLineOnOverlay,
		]
	);

	const stopDrawing = useCallback(() => {
		if (!canDrawOrPlaceLine || isGameOver) return;

		if (isDrawing) {
			// If we were in drawing mode, close the path
			if (drawingContextRef.current) {
				drawingContextRef.current.closePath();
			}
			setIsDrawing(false);
			// DO NOT immediately transition to isPlacingRedLine here.
			// That transition will be handled by the "Done Drawing" button.
		}
		// If it was the red line being dragged, just stop the dragging state (isDrawing false)
		// The line remains visible as per its last setRedLineY and drawRedLineOnOverlay call.
	}, [canDrawOrPlaceLine, isGameOver, isDrawing]);

	// Use onMouseOut to also stop drawing or placing line if mouse leaves canvas
	const handleMouseOut = useCallback(() => {
		if (isDrawing && !isPlacingRedLine) {
			// If actively drawing and not placing line
			stopDrawing(); // This just stops the stroke, doesn't transition to line placement
		} else if (isPlacingRedLine && isDrawing) {
			// If dragging the line and mouse goes out
			setIsDrawing(false); // Stop the "drag" state for the line
			// The red line remains visible where it was last
		}
	}, [isDrawing, isPlacingRedLine, stopDrawing]);

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
		// If it's the last segment, we don't need isPlacingRedLine to be true for submission
		const isLastSegment = currentSegmentIndex === TOTAL_SEGMENTS - 1;

		if (
			!canDrawOrPlaceLine ||
			isWaitingForOtherPlayers ||
			isGameOver ||
			(!isPlacingRedLine && !isLastSegment) // If not last segment, must be placing red line
		) {
			setMessage('Cannot submit now.');
			return;
		}

		const canvas = drawingCanvasRef.current; // Get data from the main drawing canvas
		if (!canvas) return;

		// Get current canvas content as data URL
		const dataURL = canvas.toDataURL('image/png');
		wsRef.current.send(
			JSON.stringify({
				type: 'submitSegment',
				gameRoomId: gameRoomId,
				canvasData: dataURL,
				redLineY: isLastSegment ? CANVAS_HEIGHT : redLineY, // Send redLineY, but for last segment, send canvas height (effectively no peek)
				playerId: currentPlayersWsId, // Use the state variable for player ID
			})
		);

		setMessage(
			`Submitting segment ${
				segments[currentSegmentIndex % TOTAL_SEGMENTS]
			}... Waiting for others.`
		);
		setCanDrawOrPlaceLine(false);
		setIsWaitingForOtherPlayers(true);
		setIsPlacingRedLine(false); // Exit line placement mode
		clearRedLineFromOverlay(); // Ensure red line is cleared on submit
		setHasDrawnSomething(false); // Reset drawing flag
	};

	// --- Game Setup / Join ---
	const createNewGame = async () => {
		if (playerName.trim() === '') {
			setMessage('Please enter your name before creating a game.');
			return;
		}
		try {
			const response = await axios.post(
				'http://localhost:8080/api/createGame'
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
		if (playerName.trim() === '') {
			setMessage('Please enter your name before joining a game.');
			return;
		}
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
		setCurrentSegment(segments[0]); // Reset to show Head for the next game
		setCanDrawOrPlaceLine(false);
		setIsWaitingForOtherPlayers(false);
		setReceivedCanvasImage(null);
		setPreviousRedLineY(null); // Clear previous red line Y
		setIsGameOver(false);
		setFinalArtwork(null);
		setFinalArtwork2(null);
		setCurrentPlayersWsId(null);
		setIsPlacingRedLine(false); // Reset red line placement mode
		setRedLineY(CANVAS_HEIGHT); // Reset red line position
		clearRedLineFromOverlay(); // Ensure red line is cleared from overlay
		setHasDrawnSomething(false); // Reset drawing flag

		setHasJoinedGame(false); // Set hasJoinedGame to false to render the initial game screen
	};

	// Determine if the "Submit Segment" button should be enabled/visible
	const isLastSegment = currentSegmentIndex === TOTAL_SEGMENTS - 1;
	const canSubmitSegment =
		canDrawOrPlaceLine &&
		!isWaitingForOtherPlayers &&
		!isGameOver &&
		(isPlacingRedLine ||
			(isLastSegment && hasDrawnSomething && !isDrawing));

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
									onMouseDown={(e) => {
										// If it's the last segment, only allow drawing, no red line placement.
										if (isLastSegment) {
											startDrawing(e);
										} else if (isPlacingRedLine) {
											// When in line placing mode, onMouseDown starts a "drag" for the line
											setIsDrawing(true); // Re-use isDrawing to indicate dragging
											setLastY(e.nativeEvent.offsetY);
										} else {
											// Otherwise, start drawing a stroke
											startDrawing(e);
										}
									}}
									onMouseMove={draw}
									onMouseUp={stopDrawing}
									onMouseOut={handleMouseOut}
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

							<div className="flex space-x-4 mt-4">
								<button
									onClick={clearCanvas}
									className={`px-8 py-4 text-xl font-bold rounded-lg transition-all duration-300 ease-in-out transform hover:scale-105
                                ${
									canDrawOrPlaceLine && !isGameOver
										? 'bg-red-500 text-white shadow-lg hover:bg-red-600'
										: 'bg-gray-400 cursor-not-allowed shadow-inner'
								}`}
									disabled={!canDrawOrPlaceLine || isGameOver}
								>
									Clear Canvas
								</button>

								{/* Conditionally show Done Drawing or Submit Segment button */}
								{!isLastSegment &&
									!isPlacingRedLine && ( // Show "Done Drawing" if not last segment and not placing line
										<button
											onClick={handleDoneDrawing}
											className={`px-8 py-4 text-xl font-bold rounded-lg transition-all duration-300 ease-in-out transform hover:scale-105
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
										>
											Done Drawing
										</button>
									)}

								{(isPlacingRedLine || isLastSegment) && ( // Show "Submit Segment" if in line placing mode OR if it's the last segment
									<button
										onClick={submitSegment}
										className={`px-8 py-4 text-xl font-bold rounded-lg transition-all duration-300 ease-in-out transform hover:scale-105
                                        ${
											canSubmitSegment
												? 'bg-green-600 text-white shadow-lg hover:bg-green-700'
												: 'bg-gray-400 cursor-not-allowed shadow-inner'
										}`}
										disabled={!canSubmitSegment}
									>
										{isLastSegment &&
										hasDrawnSomething &&
										!isDrawing // Change text for final submission
											? 'Submit Final Artwork'
											: 'Submit Segment'}
									</button>
								)}
							</div>
						</>
					)}

					{isGameOver && (
						<div className="mt-8 text-center">
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
