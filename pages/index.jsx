// index.jsx
import { useEffect, useRef, useState, useCallback } from 'react';
import axios from 'axios'; // Import axios for HTTP requests
import GameRoom from './game-room'; // Import the new GameRoom component
import Lobby from './lobby';
// const WS_URL = 'wss://your-render-backend-name.onrender.com';
const WS_URL = 'ws://localhost:8080'; // Correct protocol for WebSockets
//const WS_URL = 'https://satin-lumbar-book.glitch.me';
// Define total segments here
const TOTAL_SEGMENTS = 4;
const segments = ['Head', 'Torso', 'Legs', 'Feet']; // Matches backend messaging

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

	// Dynamically update canvas size
	useEffect(() => {
		function updateCanvasSize() {
			if (typeof window !== 'undefined') {
				setDynamicCanvasWidth(window.innerWidth);
				+setDynamicCanvasHeight(window.innerHeight);
			}
		}

		updateCanvasSize();
		if (typeof window !== 'undefined') {
			window.addEventListener('resize', updateCanvasSize);
		}

		return () => {
			if (typeof window !== 'undefined') {
				window.removeEventListener('resize', updateCanvasSize);
			}
		};
	}, []);

	// WebSocket Initialization and Message Handling
	useEffect(() => {
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
				setMessage(
					'Disconnected from game. Please create or rejoin a game.'
				);
				setHasJoinedGame(false);
				setCurrentPlayersWsId(null);
				wsRef.current = null;
			};

			ws.onerror = (error) => {
				console.error('WebSocket error:', error);
				setMessage('WebSocket error. Check console for details.');
				wsRef.current = null;
				setHasJoinedGame(false);
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
			};
		}
	}, [hasJoinedGame, generatedGameCode, gameCode, currentPlayersWsId]);

	// --- Game Setup / Join ---
	const createNewGame = async () => {
		try {
			const response = await axios.post(
				'http://localhost:8080/api/createGame',
				{}
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
		if (gameCode.trim() === '') {
			setMessage('Please enter a game code to join.');
			return;
		}
		setGeneratedGameCode('');
		setMessage(`Attempting to join game ${gameCode}...`);
		setHasJoinedGame(true);
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
	}, []);

	return (
		<div
			className={`min-h-screen bg-gradient-to-br from-purple-100 to-indigo-200 flex flex-col items-center justify-center font-sans  ${
				!isGameOver ? 'overflow-hidden' : ''
			}`}
		>
			{!hasJoinedGame ? (
				// Initial screen: Join or Create

				<Lobby
					message={message}
					gameCode={gameCode}
					setGameCode={setGameCode}
					createNewGame={createNewGame}
					joinExistingGame={joinExistingGame}
				/>
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
				/>
			)}
		</div>
	);
}
