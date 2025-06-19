import { useEffect, useRef, useState, useCallback } from 'react';

// IMPORTANT: Replace this with the URL of your deployed Render backend later
// For now, it will use localhost for testing against your local backend.
// const WS_URL = 'wss://your-render-backend-name.onrender.com';
const WS_URL = 'http://localhost:8080'; // Using localhost for local testing as per your latest change

export default function ExquisiteCorpseGame() {
	const canvasRef = useRef(null);
	const wsRef = useRef(null);
	const [isDrawing, setIsDrawing] = useState(false);
	const [lastX, setLastX] = useState(0);
	const [lastY, setLastY] = useState(0);

	// New State Variables
	const [gameRoomId, setGameRoomId] = useState('');
	const [message, setMessage] = useState(
		'Enter a game code to join or create one!'
	);
	const [playerCount, setPlayerCount] = useState(0); // To track how many players are in the room
	const [currentSegmentIndex, setCurrentSegmentIndex] = useState(0); // 0: Head, 1: Torso, 2: Legs, 3: Feet
	const [receivedCanvasImage, setReceivedCanvasImage] = useState(null); // Stores the image from the swapped canvas
	const [isMyTurnToDraw, setIsMyTurnToDraw] = useState(false); // To manage when the player can draw
	const [isWaitingForOtherPlayer, setIsWaitingForOtherPlayer] =
		useState(false); // To indicate waiting for submission
	const [isConnected, setIsConnected] = useState(false); // New state to track connection status

	const segments = ['Head', 'Torso', 'Legs', 'Feet'];

	// --- Drawing Functions (unchanged from previous version, moved here for clarity) ---
	const draw = useCallback(
		(e) => {
			if (!isDrawing || !isMyTurnToDraw) return;
			const canvas = canvasRef.current;
			const ctx = canvas.getContext('2d');
			const rect = canvas.getBoundingClientRect();
			const x = e.clientX - rect.left;
			const y = e.clientY - rect.top;

			ctx.strokeStyle = '#000000';
			ctx.lineWidth = 2;
			ctx.lineCap = 'round';
			ctx.lineJoin = 'round';

			ctx.beginPath();
			ctx.moveTo(lastX, lastY);
			ctx.lineTo(x, y);
			ctx.stroke();

			setLastX(x);
			setLastY(y);
		},
		[isDrawing, isMyTurnToDraw, lastX, lastY]
	);

	const handleMouseDown = useCallback(
		(e) => {
			if (!isMyTurnToDraw) return;
			setIsDrawing(true);
			const canvas = canvasRef.current;
			const rect = canvas.getBoundingClientRect();
			setLastX(e.clientX - rect.left);
			setLastY(e.clientY - rect.top);
		},
		[isMyTurnToDraw]
	);

	const handleMouseUp = useCallback(() => {
		if (!isMyTurnToDraw) return;
		setIsDrawing(false);
	}, [isMyTurnToDraw]);

	const handleMouseMove = useCallback(
		(e) => {
			draw(e);
		},
		[draw]
	);

	// --- WebSocket Cleanup (useEffect now only for unmount cleanup) ---
	useEffect(() => {
		// This useEffect will now only handle closing the WebSocket when the component unmounts
		return () => {
			if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
				console.log('Closing WebSocket on component unmount.');
				wsRef.current.close();
			}
		};
	}, []); // Empty dependency array means it runs once on mount, and cleanup runs on unmount

	// --- Canvas Drawing Logic (Crucial new useEffect for drawing when state changes) ---
	useEffect(() => {
		const canvas = canvasRef.current;
		// Only proceed if canvas is available and either playerCount is 2, or there's an image to draw
		if (!canvas || (playerCount < 2 && !receivedCanvasImage)) {
			return;
		}

		const ctx = canvas.getContext('2d');

		// Clear canvas at the start of a new segment or game (when 2 players are connected)
		// This handles the initial clear when game starts for 2 players.
		if (playerCount === 2 && !receivedCanvasImage) {
			ctx.clearRect(0, 0, canvas.width, canvas.height);
		}

		if (receivedCanvasImage) {
			const img = new Image();
			img.src = receivedCanvasImage;
			img.onload = () => {
				ctx.drawImage(img, 0, 0);

				// Apply masking based on segment
				ctx.fillStyle = 'white'; // Use white to mask
				switch (currentSegmentIndex) {
					case 1: // Drawing Torso - hide Head (top 200px)
						ctx.fillRect(0, 0, canvas.width, 200);
						break;
					case 2: // Drawing Legs - hide Head and Torso (top 400px)
						ctx.fillRect(0, 0, canvas.width, 400);
						break;
					case 3: // Drawing Feet - hide Head, Torso, Legs (top 550px)
						ctx.fillRect(0, 0, canvas.width, 550);
						break;
					default:
						break;
				}
			};
			img.onerror = (e) => {
				console.error('Error loading received canvas image:', e);
				setMessage('Error loading previous drawing segment.');
			};
		}
	}, [receivedCanvasImage, currentSegmentIndex, playerCount]); // Dependencies: run when these states change

	// --- User Actions ---
	const handleGameCodeChange = (e) => {
		setGameRoomId(e.target.value.toUpperCase());
	};

	// This function now handles initiating the WebSocket connection
	const joinOrCreateGame = useCallback(() => {
		if (!gameRoomId) {
			setMessage('Please enter a game code.');
			return;
		}

		// If a connection already exists and is open, close it before trying to create a new one
		if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
			console.log(
				'Closing existing WebSocket connection before joining new game.'
			);
			wsRef.current.close();
		}

		// --- WebSocket Connection Initiation moved HERE ---
		wsRef.current = new WebSocket(WS_URL);

		wsRef.current.onopen = () => {
			console.log('Connected to WebSocket backend!');
			setMessage('Connected! Sending join request...');
			wsRef.current.send(
				JSON.stringify({ type: 'joinGame', gameCode: gameRoomId })
			);
			setIsConnected(true); // Set connection status
		};

		wsRef.current.onmessage = (event) => {
			const data = JSON.parse(event.data);
			console.log('Received from backend:', data);

			switch (data.type) {
				case 'initialState':
					setMessage(
						data.message ||
							`Joined game ${data.gameCode}. Waiting for other player...`
					);
					setPlayerCount(data.playerCount);
					setCurrentSegmentIndex(data.currentSegmentIndex || 0);

					if (data.playerCount === 2) {
						setMessage(
							`Game ${data.gameCode} started! Draw your ${
								segments[data.currentSegmentIndex]
							}.`
						);
						setIsMyTurnToDraw(true);
						// Removed: Direct canvas clearing here. Handled by useEffect.
					}
					break;

				case 'playerJoined':
					setMessage(
						data.message ||
							`Player joined! ${data.playerCount}/2 players.`
					);
					setPlayerCount(data.playerCount);
					if (data.playerCount === 2) {
						setMessage(
							`Game ${data.gameCode} started! Draw your ${segments[currentSegmentIndex]}.`
						);
						setIsMyTurnToDraw(true);
					}
					break;

				case 'canvasSwap':
					setMessage(
						data.message ||
							`Canvas swapped! Draw the ${
								segments[data.currentSegmentIndex]
							}.`
					);
					setReceivedCanvasImage(data.canvasData); // This will trigger the new useEffect
					setCurrentSegmentIndex(data.currentSegmentIndex); // This will also trigger the new useEffect
					setIsWaitingForOtherPlayer(false);
					setIsMyTurnToDraw(true);
					// Removed: Direct canvas manipulation and image loading here. Handled by useEffect.
					break;

				case 'finalDrawing':
					setMessage(
						'Game Over! Here is the final exquisite corpse.'
					);
					const finalCanvas = canvasRef.current;
					const finalCtx = finalCanvas.getContext('2d');
					finalCtx.clearRect(
						0,
						0,
						finalCanvas.width,
						finalCanvas.height
					);
					const finalImg = new Image();
					finalImg.src = data.canvasData;
					finalImg.onload = () => {
						finalCtx.drawImage(finalImg, 0, 0);
					};
					setIsMyTurnToDraw(false);
					break;

				case 'error':
					setMessage(`Error: ${data.message}`);
					setIsMyTurnToDraw(false);
					// Importantly, on an error, consider disconnecting to allow user to retry
					if (
						wsRef.current &&
						wsRef.current.readyState === WebSocket.OPEN
					) {
						wsRef.current.close();
					}
					break;

				case 'waitingForOtherPlayerSubmit':
					setMessage(
						data.message ||
							'Waiting for other player to submit their segment...'
					);
					setIsMyTurnToDraw(false);
					setIsWaitingForOtherPlayer(true);
					break;

				default:
					console.warn('Unknown message type:', data.type);
			}
		};

		wsRef.current.onclose = () => {
			console.log('Disconnected from WebSocket backend.');
			setMessage('Disconnected from game. Please refresh to try again.');
			setIsConnected(false); // Update connection status
			setIsMyTurnToDraw(false);
			setPlayerCount(0); // Reset player count on disconnect
		};

		wsRef.current.onerror = (error) => {
			console.error('WebSocket error:', error);
			setMessage('WebSocket error. See console for details.');
			setIsConnected(false); // Update connection status
			setIsMyTurnToDraw(false);
			setPlayerCount(0); // Reset player count on error
		};
	}, [gameRoomId, currentSegmentIndex, segments]); // Dependencies for useCallback for joinOrCreateGame

	const submitSegment = useCallback(() => {
		if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
			setMessage('Not connected to the game server.');
			return;
		}
		if (!isMyTurnToDraw && !isWaitingForOtherPlayer) {
			setMessage("It's not your turn to submit.");
			return;
		}

		const canvas = canvasRef.current;
		const dataURL = canvas.toDataURL('image/png');

		wsRef.current.send(
			JSON.stringify({
				type: 'submitSegment',
				gameRoomId: gameRoomId,
				canvasData: dataURL,
				segmentIndex: currentSegmentIndex,
			})
		);
		setMessage(
			`Submitted ${segments[currentSegmentIndex]}! Waiting for other player to submit...`
		);
		setIsMyTurnToDraw(false);
		setIsWaitingForOtherPlayer(true);
	}, [
		gameRoomId,
		currentSegmentIndex,
		isMyTurnToDraw,
		isWaitingForOtherPlayer,
		segments,
	]);

	return (
		<div
			style={{
				display: 'flex',
				flexDirection: 'column',
				alignItems: 'center',
				justifyContent: 'center',
				minHeight: '100vh',
				fontFamily: 'sans-serif',
			}}
		>
			<h1>Exquisite Corpse</h1>

			<p>{message}</p>

			{!isConnected &&
				playerCount < 2 && ( // Only show join/create input if not connected AND less than 2 players
					<div style={{ marginBottom: '15px' }}>
						<input
							type="text"
							placeholder="Enter Game Code"
							value={gameRoomId}
							onChange={handleGameCodeChange}
							maxLength={6}
							style={{ padding: '8px', marginRight: '10px' }}
						/>
						<button
							onClick={joinOrCreateGame}
							style={{ padding: '8px 15px' }}
							disabled={!gameRoomId} // Disable if no game code is entered
						>
							Join/Create Game
						</button>
					</div>
				)}

			{playerCount === 2 && ( // Only show game elements when 2 players are connected
				<>
					<h2>Current Segment: {segments[currentSegmentIndex]}</h2>
					<canvas
						ref={canvasRef}
						width={800}
						height={600}
						style={{
							border: '2px solid #333',
							borderRadius: '8px',
							backgroundColor: 'white',
							touchAction: 'none',
						}}
						onMouseDown={handleMouseDown}
						onMouseUp={handleMouseUp}
						onMouseLeave={handleMouseUp}
						onMouseMove={handleMouseMove}
					></canvas>
					<button
						onClick={submitSegment}
						disabled={!isMyTurnToDraw && !isWaitingForOtherPlayer}
						style={{
							padding: '10px 20px',
							marginTop: '15px',
							fontSize: '1.2em',
						}}
					>
						Submit {segments[currentSegmentIndex]}
					</button>
				</>
			)}
		</div>
	);
}
