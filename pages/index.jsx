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
	const wsRef = useRef(null);
	const [isDrawing, setIsDrawing] = useState(false);
	const [lastX, setLastX] = useState(0);
	const [lastY, setLastY] = useState(0);

	// Game State Variables
	const [gameCode, setGameCode] = useState(''); // Use gameCode for input, gameRoomId for actual ID
	const [gameRoomId, setGameRoomId] = useState(null); // Actual DB ID of the game room
	const [message, setMessage] = useState(
		'Enter a game code to join or create one!'
	);
	const [playerCount, setPlayerCount] = useState(0); // Tracks how many players are in the room
	const [currentSegmentIndex, setCurrentSegmentIndex] = useState(0); // Current drawing segment (0: Head, 1: Torso, etc.)
	const [receivedCanvasImage, setReceivedCanvasImage] = useState(null); // Stores the image from previous combined segments
	const [isDrawingPhase, setIsDrawingPhase] = useState(false); // True when it's actively drawing time for current player
	const [isWaitingForSubmissions, setIsWaitingForSubmissions] =
		useState(false); // True after player submits, waiting for others
	const [isGameOver, setIsGameOver] = useState(false); // True when the game has ended

	// --- WebSocket Connection ---
	useEffect(() => {
		// Initialize WebSocket connection
		wsRef.current = new WebSocket(WS_URL);

		wsRef.current.onopen = () => {
			console.log('WebSocket connected!');
			setMessage(
				'Connected to server. Enter a game code to join or create!'
			);
			// You might want to send a 'heartbeat' or 'identify' message here
		};

		wsRef.current.onmessage = (event) => {
			const data = JSON.parse(event.data);
			console.log('Received from server:', data.type, data);

			switch (data.type) {
				case 'playerJoined':
					setGameRoomId(data.gameRoomId);
					setPlayerCount(data.playerCount);
					setCurrentSegmentIndex(data.currentSegmentIndex);
					setMessage(data.message);

					if (
						data.playerCount >= 2 &&
						data.currentSegmentIndex === 0
					) {
						// Game starts, first player draws head
						setMessage('Game started! Draw the Head.');
						setIsDrawingPhase(true);
						setIsWaitingForSubmissions(false);
						setIsGameOver(false);
						// Clear canvas for new game
						const canvas = canvasRef.current;
						if (canvas) {
							const ctx = canvas.getContext('2d');
							ctx.clearRect(0, 0, canvas.width, canvas.height);
							setReceivedCanvasImage(null); // Clear any previous image
						}
					} else if (data.playerCount < 2) {
						setMessage(
							`Waiting for another player to join ${data.gameCode}...`
						);
						setIsDrawingPhase(false);
						setIsWaitingForSubmissions(false);
						setIsGameOver(false);
					} else if (
						data.currentSegmentIndex > 0 &&
						data.canvasData
					) {
						// Rejoining an ongoing game or starting a new segment
						setReceivedCanvasImage(data.canvasData);
						setMessage(
							`Game in progress. Draw the ${
								segments[data.currentSegmentIndex]
							}.`
						);
						// Redraw the canvas with the received image
						const canvas = canvasRef.current;
						if (canvas && data.canvasData) {
							const ctx = canvas.getContext('2d');
							const img = new Image();
							img.onload = () => {
								ctx.clearRect(
									0,
									0,
									canvas.width,
									canvas.height
								); // Clear existing
								ctx.drawImage(
									img,
									0,
									0,
									canvas.width,
									canvas.height
								); // Draw combined previous
								setIsDrawingPhase(true); // Allow drawing on top
								setIsWaitingForSubmissions(false);
								setIsGameOver(false);
							};
							img.src = data.canvasData;
						} else {
							// If no canvasData (e.g., first segment for rejoining player)
							setIsDrawingPhase(true);
							setIsWaitingForSubmissions(false);
							setIsGameOver(false);
							const ctx = canvas.getContext('2d');
							ctx.clearRect(0, 0, canvas.width, canvas.height);
						}
					}
					break;

				case 'playerDisconnected':
					setPlayerCount(data.playerCount);
					setMessage(data.message);
					setIsDrawingPhase(false); // Disable drawing if a player leaves
					setIsWaitingForSubmissions(false);
					setIsGameOver(false);
					// Optionally clear canvas or reset game if only one player remains
					break;

				case 'submissionReceived':
					setMessage(data.message);
					setIsDrawingPhase(false); // Current player can't draw anymore
					setIsWaitingForSubmissions(true); // Waiting for others
					break;

				case 'segmentAdvanced':
					setReceivedCanvasImage(data.canvasData); // The combined image from previous segment(s)
					setCurrentSegmentIndex(data.currentSegmentIndex);
					setMessage(data.message);
					setIsDrawingPhase(true); // New segment, current player can draw
					setIsWaitingForSubmissions(false); // No longer waiting, new turn
					setIsGameOver(false);

					// Redraw the canvas with the received combined image
					const canvas = canvasRef.current;
					if (canvas && data.canvasData) {
						const ctx = canvas.getContext('2d');
						const img = new Image();
						img.onload = () => {
							ctx.clearRect(0, 0, canvas.width, canvas.height); // Clear existing
							ctx.drawImage(
								img,
								0,
								0,
								canvas.width,
								canvas.height
							); // Draw combined previous
						};
						img.src = data.canvasData;
					} else if (canvas) {
						// If no canvasData (e.g., first segment, or issue with combine)
						const ctx = canvas.getContext('2d');
						ctx.clearRect(0, 0, canvas.width, canvas.height);
					}
					break;

				case 'gameOver':
					setIsGameOver(true);
					setMessage(data.message);
					setReceivedCanvasImage(data.canvasData); // The final combined image
					setIsDrawingPhase(false);
					setIsWaitingForSubmissions(false);
					setCurrentSegmentIndex(data.currentSegmentIndex); // Should be TOTAL_SEGMENTS
					console.log('Game Over! Final canvas:', data.canvasData);
					break;

				case 'error':
					setMessage(`Error: ${data.message}`);
					console.error('Server error:', data.message);
					setIsDrawingPhase(false);
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
			setIsDrawingPhase(false);
			setIsWaitingForSubmissions(false);
		};

		wsRef.current.onclose = () => {
			console.log('WebSocket disconnected.');
			setMessage('Disconnected from server. Attempting to reconnect...');
			setIsDrawingPhase(false);
			setIsWaitingForSubmissions(false);
			setGameRoomId(null);
			setPlayerCount(0);
			setIsGameOver(false); // Reset game over state on disconnect
			// Optional: Implement a reconnect logic here
		};

		// Cleanup on component unmount
		return () => {
			if (wsRef.current) {
				wsRef.current.close();
			}
		};
	}, []); // Empty dependency array means this effect runs once on mount

	// --- Canvas Drawing Logic ---
	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas) return;

		const ctx = canvas.getContext('2d');
		ctx.lineCap = 'round';
		ctx.strokeStyle = 'black';
		ctx.lineWidth = 2;

		// Optionally, draw the received image when the canvas is ready
		if (receivedCanvasImage) {
			const img = new Image();
			img.onload = () => {
				ctx.clearRect(0, 0, canvas.width, canvas.height); // Clear current
				ctx.drawImage(img, 0, 0, canvas.width, canvas.height); // Draw the background
			};
			img.src = receivedCanvasImage;
		} else {
			// If no image, ensure canvas is clear (e.g., for drawing head)
			ctx.clearRect(0, 0, canvas.width, canvas.height);
		}
	}, [receivedCanvasImage]); // Re-run effect when a new base image is received

	const draw = useCallback(
		(e) => {
			if (!isDrawing || !canvasRef.current || !isDrawingPhase) return;

			const canvas = canvasRef.current;
			const ctx = canvas.getContext('2d');
			const rect = canvas.getBoundingClientRect();

			const currentX = e.clientX - rect.left;
			const currentY = e.clientY - rect.top;

			ctx.beginPath();
			ctx.moveTo(lastX, lastY);
			ctx.lineTo(currentX, currentY);
			ctx.stroke();

			setLastX(currentX);
			setLastY(currentY);
		},
		[isDrawing, lastX, lastY, isDrawingPhase]
	); // Depend on isDrawingPhase

	const handleMouseDown = useCallback(
		(e) => {
			if (!canvasRef.current || !isDrawingPhase) return; // Only allow drawing if in drawing phase

			setIsDrawing(true);
			const rect = canvasRef.current.getBoundingClientRect();
			setLastX(e.clientX - rect.left);
			setLastY(e.clientY - rect.top);
		},
		[isDrawingPhase]
	);

	const handleMouseUp = useCallback(() => {
		setIsDrawing(false);
	}, []);

	const handleMouseMove = useCallback(
		(e) => {
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
			setMessage('WebSocket is not connected. Please refresh.');
		}
	}, [gameCode]);

	const submitSegment = useCallback(() => {
		const canvas = canvasRef.current;
		if (
			wsRef.current &&
			wsRef.current.readyState === WebSocket.OPEN &&
			canvas
		) {
			if (playerCount < 2) {
				setMessage(
					'Waiting for another player to join before submitting.'
				);
				return;
			}
			if (currentSegmentIndex >= TOTAL_SEGMENTS) {
				setMessage('Game is already over!');
				return;
			}
			if (!isDrawingPhase) {
				setMessage(
					"It's not your turn to draw, or you already submitted."
				);
				return;
			}

			const canvasData = canvas.toDataURL(); // Get the current canvas content as a Data URL
			wsRef.current.send(
				JSON.stringify({
					type: 'submitSegment',
					gameRoomId: gameRoomId, // Ensure gameRoomId is sent
					segmentIndex: currentSegmentIndex,
					canvasData: canvasData,
				})
			);
			setMessage('Submitting your drawing...');
			setIsDrawingPhase(false); // Disable drawing immediately after submitting
			setIsWaitingForSubmissions(true); // Set state to waiting
		} else {
			setMessage(
				'Cannot submit: WebSocket not connected or canvas not ready.'
			);
		}
	}, [gameRoomId, playerCount, currentSegmentIndex, isDrawingPhase]);

	return (
		<div
			style={{
				fontFamily: 'Arial, sans-serif',
				maxWidth: '850px',
				margin: '20px auto',
				padding: '20px',
				border: '1px solid #ccc',
				borderRadius: '10px',
				boxShadow: '0 0 10px rgba(0,0,0,0.1)',
			}}
		>
			<h1>Exquisite Corpse Game</h1>
			<p style={{ color: '#555', fontSize: '1.1em', fontWeight: 'bold' }}>
				{message}
			</p>
			<p>Players: {playerCount}</p>

			{!gameRoomId &&
				playerCount < 2 &&
				!isGameOver && ( // Only show join/create input if not in a room, less than 2 players, and not game over
					<div style={{ marginBottom: '15px' }}>
						<input
							type="text"
							placeholder="Enter Game Code"
							value={gameCode}
							onChange={handleGameCodeChange}
							maxLength={6}
							style={{ padding: '8px', marginRight: '10px' }}
						/>
						<button
							onClick={joinOrCreateGame}
							style={{ padding: '8px 15px' }}
							disabled={!gameCode} // Disable if no game code is entered
						>
							Join/Create Game
						</button>
					</div>
				)}

			{gameRoomId &&
				!isGameOver && ( // Only show game elements if in a room and game not over
					<>
						<h2>
							Current Segment: {segments[currentSegmentIndex]}
						</h2>
						<canvas
							ref={canvasRef}
							width={800}
							height={600}
							style={{
								border: '2px solid #333',
								borderRadius: '8px',
								backgroundColor: 'white',
								touchAction: 'none', // Disable default touch actions for drawing
								// Indicate if drawing is allowed
								cursor: isDrawingPhase
									? 'crosshair'
									: 'not-allowed',
								opacity: isDrawingPhase ? 1 : 0.6,
							}}
							onMouseDown={handleMouseDown}
							onMouseUp={handleMouseUp}
							onMouseLeave={handleMouseUp}
							onMouseMove={handleMouseMove}
						></canvas>
						<button
							onClick={submitSegment}
							style={{
								padding: '10px 20px',
								fontSize: '1.1em',
								marginTop: '20px',
								backgroundColor:
									isWaitingForSubmissions || !isDrawingPhase
										? '#ccc'
										: '#4CAF50',
								color: 'white',
								border: 'none',
								borderRadius: '5px',
								cursor:
									isWaitingForSubmissions || !isDrawingPhase
										? 'not-allowed'
										: 'pointer',
								transition: 'background-color 0.3s',
							}}
							onMouseEnter={(e) => {
								if (
									!isWaitingForSubmissions &&
									isDrawingPhase
								) {
									e.target.style.backgroundColor = '#45a049';
								}
							}}
							onMouseLeave={(e) => {
								if (
									!isWaitingForSubmissions &&
									isDrawingPhase
								) {
									e.target.style.backgroundColor = '#4CAF50';
								}
							}}
							disabled={
								isWaitingForSubmissions || !isDrawingPhase
							}
						>
							{isWaitingForSubmissions
								? 'Waiting for Others...'
								: 'Submit Segment'}
						</button>
					</>
				)}

			{isGameOver && ( // Game over state
				<div style={{ marginTop: '20px', textAlign: 'center' }}>
					<h2>Game Over!</h2>
					<p>The Exquisite Corpse is complete!</p>
					{receivedCanvasImage && (
						<img
							src={receivedCanvasImage}
							alt="Final Combined Artwork"
							style={{
								maxWidth: '800px',
								border: '2px solid #333',
								borderRadius: '8px',
							}}
						/>
					)}
					<button
						onClick={() => window.location.reload()}
						style={{
							padding: '10px 20px',
							fontSize: '1.1em',
							marginTop: '20px',
							backgroundColor: '#008CBA',
							color: 'white',
							border: 'none',
							borderRadius: '5px',
							cursor: 'pointer',
							transition: 'background-color 0.3s',
						}}
						onMouseEnter={(e) =>
							(e.target.style.backgroundColor = '#007b9e')
						}
						onMouseLeave={(e) =>
							(e.target.style.backgroundColor = '#008CBA')
						}
					>
						Start New Game
					</button>
				</div>
			)}
		</div>
	);
}
