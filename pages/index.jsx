// index.jsx
import { useEffect, useRef, useState, useCallback } from 'react';
import axios from 'axios'; // Import axios for HTTP requests
import GameRoom from './game-room.jsx'; // Import the new GameRoom component
import Lobby from './lobby.jsx'; // Corrected import path
import Loader from './loader';
// const WS_URL = 'wss://your-render-backend-name.onrender.com';
const WS_URL = 'ws://localhost:8080'; // Correct protocol for WebSockets
const BASE_URL = 'http://localhost:8080';
//const WS_URL = 'wss://satin-lumbar-book.glitch.me';
//const BASE_URL = 'https://satin-lumbar-book.glitch.me';
// Define total segments here
const TOTAL_SEGMENTS = 4;
const segments = ['Head', 'Torso', 'Legs', 'Feet']; // Matches backend messaging

// Define a constant for the backend canvas dimensions
// This is crucial for scaling previousRedLineY correctly
const BACKEND_CANVAS_WIDTH = 1080; // Assuming this is the fixed width on the backend
const BACKEND_CANVAS_HEIGHT = 1920; // Assuming this is the fixed height on the backend

// Define a constant for the desired margin around the canvas
const CANVAS_MARGIN = 20; // 5 pixels margin on all sides

export default function ExquisiteCorpseGame() {
	const wsRef = useRef(null); // WebSocket instance

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
	const [canDrawOrPlaceLine, setCanDrawOrPlaceLine] = useState(false);
	const [isWaitingForOtherPlayers, setIsWaitingForOtherPlayers] =
		useState(false); // Whether current player submitted and is waiting
	const [receivedCanvasImage, setReceivedCanvasImage] = useState(null); // Data URL for the previous player's full drawing
	const [previousRedLineY, setPreviousRedLineY] = useState(null); // The redLineY from the previous player's submission
	const [isGameOver, setIsGameOver] = useState(false);
	const [finalArtwork, setFinalArtwork] = useState(null); // Stores the final combined artwork for player 1
	const [finalArtwork2, setFinalArtwork2] = useState(null); // New state to store the final combined artwork for player 2
	const [hasJoinedGame, setHasJoinedGame] = useState(false); // New state to manage initial screen vs game screen
	const [currentPlayersWsId, setCurrentPlayersWsId] = useState(null); // State to store the player's WS ID from the server
	const [dynamicCanvasWidth, setDynamicCanvasWidth] = useState(0);
	const [dynamicCanvasHeight, setDynamicCanvasHeight] = useState(0);
	const [isLoading, setIsLoading] = useState(false);
	const [shouldAttemptReconnect, setShouldAttemptReconnect] = useState(false);

	// Dynamically update canvas size
	useEffect(() => {
		const targetAspectRatio = BACKEND_CANVAS_WIDTH / BACKEND_CANVAS_HEIGHT; // Width / Height = 1080 / 1920

		function updateCanvasSize() {
			if (typeof window !== 'undefined') {
				// Calculate available space minus the total margin (margin on left + margin on right)
				const availableWidth = window.innerWidth - CANVAS_MARGIN * 2;
				const availableHeight = window.innerHeight - CANVAS_MARGIN * 2;

				let newWidth;
				let newHeight;

				// Calculate dimensions based on available space while maintaining aspect ratio
				// Prioritize width if height is sufficient, otherwise prioritize height
				const widthBasedHeight = availableWidth / targetAspectRatio;
				const heightBasedWidth = availableHeight * targetAspectRatio;

				if (widthBasedHeight <= availableHeight) {
					// Available width is the limiting factor
					newWidth = availableWidth;
					newHeight = widthBasedHeight;
				} else {
					// Available height is the limiting factor
					newHeight = availableHeight;
					newWidth = heightBasedWidth;
				}

				// Cap the canvas size to the maximum desired resolution if viewport is larger
				const maxDesiredWidth = BACKEND_CANVAS_WIDTH;
				const maxDesiredHeight = BACKEND_CANVAS_HEIGHT;

				if (
					newWidth > maxDesiredWidth ||
					newHeight > maxDesiredHeight
				) {
					const scaleFactor = Math.min(
						maxDesiredWidth / newWidth,
						maxDesiredHeight / newHeight
					);
					newWidth *= scaleFactor;
					newHeight *= scaleFactor;
				}

				setDynamicCanvasWidth(Math.round(newWidth));
				+setDynamicCanvasHeight(Math.round(newHeight));
			}
		}

		updateCanvasSize(); // Set initial size
		if (typeof window !== 'undefined') {
			window.addEventListener('resize', updateCanvasSize);
		}

		return () => {
			if (typeof window !== 'undefined') {
				window.removeEventListener('resize', updateCanvasSize);
			}
		};
	}, []);

	// STEP 1 ADDITION: Detect browser visibility changes
	useEffect(() => {
		const handleVisibilityChange = () => {
			if (document.visibilityState === 'visible') {
				console.log('Browser tab became visible.');
				if (
					!wsRef.current ||
					wsRef.current.readyState === WebSocket.CLOSED
				) {
					if (
						hasJoinedGame &&
						(generatedGameCode || gameCode) &&
						currentPlayersWsId
					) {
						console.log(
							'Attempting to reconnect via explicit message on tab visible...'
						);
						// Set shouldAttemptReconnect to true to trigger the main WebSocket useEffect
						setShouldAttemptReconnect(true);
						// The main useEffect will then try to establish the connection and send joinGame
						// The server-side will handle this as a reconnect based on playerId and gameCode
					}
				}
			} else {
				console.log('Browser tab became hidden.');
			}
		};

		document.addEventListener('visibilitychange', handleVisibilityChange);

		return () => {
			document.removeEventListener(
				'visibilitychange',
				handleVisibilityChange
			);
		};
	}, []);

	// WebSocket Initialization and Message Handling
	useEffect(() => {
		let reconnectTimeoutId;
		if (hasJoinedGame && !wsRef.current) {
			console.log('Attempting to establish WebSocket connection...');
			const ws = new WebSocket(WS_URL);
			wsRef.current = ws;

			const codeToJoinOnOpen = generatedGameCode || gameCode;

			ws.onopen = () => {
				console.log('WebSocket connected. Sending joinGame message...');
				ws.send(
					JSON.stringify({
						type: 'joinGame',
						gameCode: codeToJoinOnOpen,
						playerId: null,
					})
				);
				setShouldAttemptReconnect(false); // Connection successful, no need to reconnect
			};

			ws.onmessage = (event) => {
				const data = JSON.parse(event.data);
				console.log('Received from server:', data);

				setMessage(data.message);
				setPlayerCount(data.playerCount || 0);
				setCurrentSegmentIndex(data.currentSegmentIndex || 0);
				setCurrentSegment(
					segments[(data.currentSegmentIndex + 1) % TOTAL_SEGMENTS]
				);

				setCanDrawOrPlaceLine(
					data.canDraw &&
						data.playerCount === 2 &&
						!data.isWaitingForOthers
				);
				setIsWaitingForOtherPlayers(data.isWaitingForOthers || false);
				setGameRoomId(data.gameRoomId || null);

				if (data.playerId && data.playerId !== currentPlayersWsId) {
					setCurrentPlayersWsId(data.playerId);
				}

				if (
					data.hasOwnProperty('canvasData') &&
					data.canvasData !== null
				) {
					setReceivedCanvasImage(data.canvasData);
				} else if (
					data.hasOwnProperty('canvasData') &&
					data.canvasData === null
				) {
					setReceivedCanvasImage(null);
				}

				setPreviousRedLineY(
					data.currentSegmentIndex === 0
						? null
						: data.previousRedLineY || null
				);

				if (data.status === 'completed') {
					setIsGameOver(true);
					setFinalArtwork(data.finalArtwork1 || null);
					setFinalArtwork2(data.finalArtwork2 || null);
					setCanDrawOrPlaceLine(false);
					setIsWaitingForOtherPlayers(false);
				} else if (data.type === 'playerDisconnected') {
					setIsGameOver(false);
					setFinalArtwork(null);
					setFinalArtwork2(null);
				}

				if (
					data.type === 'initialState' ||
					data.type === 'gameStarted'
				) {
					setGameCode(data.gameCode || gameCode);
					setGeneratedGameCode(data.gameCode || generatedGameCode);
					// setCanDrawOrPlaceLine(data.canDraw);
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
				}
			};

			ws.onclose = () => {
				console.log('WebSocket disconnected.');
				setMessage('Connection lost. Attempting to reconnect...');

				setCurrentPlayersWsId(null);
				wsRef.current = null;
				setShouldAttemptReconnect(true); // Set to true to trigger a reconnect attempt
			};

			ws.onerror = (error) => {
				console.error('WebSocket error:', error);
				setMessage('WebSocket error. Attempting to reconnect...');
				wsRef.current = null;
				setShouldAttemptReconnect(true);
			};

			return () => {
				if (
					wsRef.current &&
					wsRef.current.readyState === WebSocket.OPEN
				) {
					console.log('Cleaning up WebSocket connection...');
					wsRef.current.close();
				}
				wsRef.current = null;
				clearTimeout(reconnectTimeoutId);
			};
		} else if (shouldAttemptReconnect && hasJoinedGame) {
			// Only attempt reconnect if shouldAttemptReconnect is true AND we are supposed to be in a game
			reconnectTimeoutId = setTimeout(() => {
				console.log('Attempting to reconnect...');
				// Set wsRef.current to null to force the useEffect to re-run and create a new WebSocket
				wsRef.current = null;
				// This will trigger the useEffect due to `wsRef.current` being null and `hasJoinedGame` being true
				// We don't change shouldAttemptReconnect here; it will be set to false on successful open.
			}, 3000); // Wait 3 seconds before attempting to reconnect

			return () => {
				clearTimeout(reconnectTimeoutId); // Clean up timeout if component re-renders or unmounts
			};
		}
	}, [
		hasJoinedGame,
		generatedGameCode,
		gameCode,
		currentPlayersWsId,
		shouldAttemptReconnect,
	]);

	// --- Game Setup / Join ---
	const createNewGame = async () => {
		try {
			setIsLoading(true);
			const response = await axios.post(`${BASE_URL}/api/createGame`, {});
			setIsLoading(false);
			const { gameCode: newGameCode } = response.data;
			setGeneratedGameCode(newGameCode);
			setGameCode('');
			setMessage(`Game created! Share this code: ${newGameCode}`);
			setHasJoinedGame(true);
			setShouldAttemptReconnect(false);
		} catch (error) {
			console.error('Error creating game:', error);
			setMessage('Failed to create game. Please try again.');
		}
	};

	const joinExistingGame = () => {
		if (gameCode.trim() === '') {
			setMessage('Please enter a game code to join.');
			return;
		}
		setGeneratedGameCode('');
		setMessage(`Attempting to join game ${gameCode}...`);
		setHasJoinedGame(true);
		setShouldAttemptReconnect(false);
	};

	const handlePlayAgain = useCallback(() => {
		if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
			wsRef.current.close();
		}
		wsRef.current = null;

		// Reset all game-specific states to their initial, pre-joined game values
		setGameCode('');
		setGeneratedGameCode('');
		setGameRoomId(null);
		setMessage('Enter a game code to join or create one!');
		setPlayerCount(0);
		setCurrentSegmentIndex(0);
		setCurrentSegment(segments[1]);
		setCanDrawOrPlaceLine(false);
		setIsWaitingForOtherPlayers(false);
		setReceivedCanvasImage(null);
		setPreviousRedLineY(null);
		setIsGameOver(false);
		setFinalArtwork(null);
		setFinalArtwork2(null);
		setHasJoinedGame(false);
		setCurrentPlayersWsId(null);
		setShouldAttemptReconnect(false);
	}, []);

	return (
		<div
			className={`min-h-screen bg-indigo-100 flex flex-col items-center justify-center font-sans px-4 sm:px-8 ${
				!isGameOver ? 'overflow-hidden' : ''
			}`}
		>
			{!hasJoinedGame ? (
				// Initial screen: Join or Create
				<>
					{isLoading && <Loader />}
					<Lobby
						message={message}
						gameCode={gameCode}
						setGameCode={setGameCode}
						createNewGame={createNewGame}
						joinExistingGame={joinExistingGame}
					/>
				</>
			) : (
				// Game screen once a game is joined/created, rendered by GameRoom
				<GameRoom
					gameRoomId={generatedGameCode || gameCode} // Pass the active game code
					message={message}
					playerCount={playerCount}
					currentSegmentIndex={currentSegmentIndex}
					canDrawOrPlaceLine={canDrawOrPlaceLine}
					isWaitingForOtherPlayers={isWaitingForOtherPlayers}
					receivedCanvasImage={receivedCanvasImage}
					previousRedLineY={previousRedLineY}
					isGameOver={isGameOver}
					finalArtwork={finalArtwork}
					finalArtwork2={finalArtwork2}
					currentPlayersWsId={currentPlayersWsId}
					wsRef={wsRef}
					setMessage={setMessage}
					setCanDrawOrPlaceLine={setCanDrawOrPlaceLine} // Pass the setter
					setIsWaitingForOtherPlayers={setIsWaitingForOtherPlayers} // Pass the setter
					handlePlayAgain={handlePlayAgain}
					dynamicCanvasWidth={dynamicCanvasWidth}
					dynamicCanvasHeight={dynamicCanvasHeight}
					backendCanvasHeight={BACKEND_CANVAS_HEIGHT} // Pass backend canvas height
				/>
			)}
		</div>
	);
}
