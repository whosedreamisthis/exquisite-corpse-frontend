// index.jsx
import { useEffect, useRef, useState, useCallback } from 'react';
import axios from 'axios';
import GameRoom from './game-room.jsx';
import Lobby from './lobby.jsx';
import Loader from './loader';

const WS_URL = 'ws://localhost:8080';
const BASE_URL = 'http://localhost:8080';

const TOTAL_SEGMENTS = 4;
const segments = ['Head', 'Torso', 'Legs', 'Feet'];

const BACKEND_CANVAS_WIDTH = 1080;
const BACKEND_CANVAS_HEIGHT = 1920;

const CANVAS_MARGIN = 20;

export default function ExquisiteCorpseGame() {
	const wsRef = useRef(null);

	// Game State Variables, all managed via WebSocket
	const [gameCode, setGameCode] = useState('');
	const [generatedGameCode, setGeneratedGameCode] = useState('');
	const [gameRoomId, setGameRoomId] = useState(null);
	const [message, setMessage] = useState(
		'Enter a game code to join or create one!'
	);
	const [playerCount, setPlayerCount] = useState(0);
	const [currentSegmentIndex, setCurrentSegmentIndex] = useState(0);
	const [currentSegment, setCurrentSegment] = useState(
		segments[(currentSegmentIndex + 1) % TOTAL_SEGMENTS]
	);
	const [canDrawOrPlaceLine, setCanDrawOrPlaceLine] = useState(false);
	const [isWaitingForOtherPlayers, setIsWaitingForOtherPlayers] =
		useState(false);
	const [receivedCanvasImage, setReceivedCanvasImage] = useState(null);
	const [previousRedLineY, setPreviousRedLineY] = useState(null);
	const [isGameOver, setIsGameOver] = useState(false);
	const [finalArtwork, setFinalArtwork] = useState(null);
	const [finalArtwork2, setFinalArtwork2] = useState(null);
	const [hasJoinedGame, setHasJoinedGame] = useState(false);

	// FIX: Initialize currentPlayersWsId to null, and then load from localStorage in useEffect
	const [currentPlayersWsId, setCurrentPlayersWsId] = useState(null);

	const [dynamicCanvasWidth, setDynamicCanvasWidth] = useState(0);
	const [dynamicCanvasHeight, setDynamicCanvasHeight] = useState(0);
	const [isLoading, setIsLoading] = useState(false);
	const isClosingIntentionallyRef = useRef(false);
	const [shouldAttemptReconnect, setShouldAttemptReconnect] = useState(false);
	const [reconnectAttempts, setReconnectAttempts] = useState(0);
	const MAX_RECONNECT_ATTEMPTS_CLIENT = 5;
	const RECONNECT_INTERVAL_MS = 3000;
	const [redLinePlaced, setRedLinePlaced] = useState(false);

	// FIX: Use useEffect to load from localStorage after component mounts
	useEffect(() => {
		if (typeof window !== 'undefined') {
			setCurrentPlayersWsId(
				localStorage.getItem('exquisiteCorpsePlayerId') || null
			);
			// Also load gameCode from localStorage if present on initial load
			const storedGameCode = localStorage.getItem(
				'exquisiteCorpseGameCode'
			);
			if (storedGameCode) {
				setGameCode(storedGameCode);
				setGeneratedGameCode(storedGameCode); // Also set generatedGameCode for consistency
				setHasJoinedGame(true); // If a game code exists, assume joined status
			}
		}
	}, []); // Empty dependency array means this runs once on mount

	// Dynamically update canvas size
	useEffect(() => {
		const targetAspectRatio = BACKEND_CANVAS_WIDTH / BACKEND_CANVAS_HEIGHT;

		function updateCanvasSize() {
			if (typeof window !== 'undefined') {
				const availableWidth = window.innerWidth - CANVAS_MARGIN * 2;
				const availableHeight = window.innerHeight - CANVAS_MARGIN * 2;

				let newWidth;
				let newHeight;

				const widthBasedHeight = availableWidth / targetAspectRatio;
				const heightBasedWidth = availableHeight * targetAspectRatio;

				if (widthBasedHeight <= availableHeight) {
					newWidth = availableWidth;
					newHeight = widthBasedHeight;
				} else {
					newHeight = availableHeight;
					newWidth = heightBasedWidth;
				}

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
				setDynamicCanvasHeight(Math.round(newHeight));
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

	// STEP 1 ADDITION: Detect browser visibility changes
	useEffect(() => {
		const handleVisibilityChange = () => {
			if (document.visibilityState === 'visible') {
				console.log('Browser tab became visible.');
				// Only attempt reconnect if currently in a game and WS is not active
				if (hasJoinedGame && !wsRef.current && !isLoading) {
					setShouldAttemptReconnect(true);
					// The main WS effect will pick this up
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
	}, [hasJoinedGame, isLoading]); // Add hasJoinedGame and isLoading to dependencies

	// WebSocket Initialization and Message Handling
	useEffect(() => {
		let reconnectTimeoutId;

		const connectWebSocket = () => {
			if (wsRef.current) {
				console.log(
					'WebSocket already exists or is connecting, skipping new connection.'
				);
				return;
			}

			console.log('Attempting to establish WebSocket connection...');
			const ws = new WebSocket(WS_URL);
			wsRef.current = ws;

			ws.onopen = () => {
				console.log('WebSocket connected.');
				setShouldAttemptReconnect(false); // Connection successful, no need to reconnect
				setReconnectAttempts(0); // Reset reconnect attempts

				// Ensure localStorage is accessible before trying to read from it
				const storedPlayerId =
					typeof window !== 'undefined'
						? localStorage.getItem('exquisiteCorpsePlayerId')
						: null;
				const storedGameCode =
					typeof window !== 'undefined'
						? localStorage.getItem('exquisiteCorpseGameCode')
						: null;

				const code = generatedGameCode || gameCode || storedGameCode; // Prioritize generated/current, then stored

				// If we have a stored playerId and a game code, attempt to reconnect with it
				if (storedPlayerId && code) {
					console.log(
						`Sending reconnectGame message for playerId: ${storedPlayerId} to game: ${code}`
					);
					ws.send(
						JSON.stringify({
							type: 'reconnectGame',
							gameCode: code,
							playerId: storedPlayerId,
						})
					);
				} else if (code) {
					// Otherwise, if we have a game code, join normally (e.g., first time joining or fresh start)
					console.log(`Sending joinGame message to game: ${code}`);
					ws.send(
						JSON.stringify({
							type: 'joinGame',
							gameCode: code,
							// playerId will be null for truly new connections, server will assign
						})
					);
				} else {
					console.log(
						'No game code or player ID to send on WS open. Waiting for user action.'
					);
					// This case can happen if the component mounts without a game in progress
					// or user has not yet created/joined
				}
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

				// Store player ID and game code in localStorage for persistence
				if (typeof window !== 'undefined') {
					if (data.playerId && data.playerId !== currentPlayersWsId) {
						setCurrentPlayersWsId(data.playerId);
						localStorage.setItem(
							'exquisiteCorpsePlayerId',
							data.playerId
						);
					}
					if (data.gameCode) {
						localStorage.setItem(
							'exquisiteCorpseGameCode',
							data.gameCode
						);
					}
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
				setRedLinePlaced(data.redLinePlaced || false);

				if (data.status === 'completed') {
					setIsGameOver(true);
					setFinalArtwork(data.finalArtwork1 || null);
					setFinalArtwork2(data.finalArtwork2 || null);
					setCanDrawOrPlaceLine(false);
					setIsWaitingForOtherPlayers(false);
					if (typeof window !== 'undefined') {
						localStorage.removeItem('exquisiteCorpsePlayerId');
						localStorage.removeItem('exquisiteCorpseGameCode');
					}
				} else if (
					data.type === 'playerDisconnected' ||
					data.type === 'playerTemporarilyDisconnected' ||
					data.type === 'playerPermanentlyDisconnected'
				) {
					setIsGameOver(false);
					setFinalArtwork(null);
					setFinalArtwork2(null);
					if (data.type === 'playerPermanentlyDisconnected') {
						if (typeof window !== 'undefined') {
							localStorage.removeItem('exquisiteCorpsePlayerId');
							localStorage.removeItem('exquisiteCorpseGameCode');
						}
						setCurrentPlayersWsId(null);
						setGameCode('');
						setGeneratedGameCode('');
						setHasJoinedGame(false);
					}
				}

				if (
					data.type === 'initialState' ||
					data.type === 'gameStarted' ||
					data.type === 'reconnected' ||
					data.type === 'gameJoined'
				) {
					setGameCode(data.gameCode || gameCode);
					setGeneratedGameCode(data.gameCode || generatedGameCode);
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
					setHasJoinedGame(true);
				}

				if (data.type === 'reconnectFailed') {
					setMessage(
						`Reconnect failed: ${data.message} Please try creating or joining a new game.`
					);
					setHasJoinedGame(false);
					setGameCode('');
					setGeneratedGameCode('');
					setCurrentPlayersWsId(null);
					if (typeof window !== 'undefined') {
						localStorage.removeItem('exquisiteCorpsePlayerId');
						localStorage.removeItem('exquisiteCorpseGameCode');
					}
					setShouldAttemptReconnect(false);
				}
			};

			ws.onclose = () => {
				console.log(
					'WebSocket disconnected. Intentional close flag:',
					isClosingIntentionallyRef.current
				);
				wsRef.current = null;

				if (isClosingIntentionallyRef.current) {
					isClosingIntentionallyRef.current = false;
					console.log(
						"Intentional disconnect detected in onclose. Preventing 'Connection lost' message."
					);
					return;
				}

				if (hasJoinedGame) {
					setMessage(
						`Connection lost. Attempting to reconnect... (Attempt ${
							reconnectAttempts + 1
						}/${MAX_RECONNECT_ATTEMPTS_CLIENT})`
					);
					setShouldAttemptReconnect(true);
					setReconnectAttempts((prev) => prev + 1);
				} else {
					setMessage('Enter a game code to join or create one!');
					setShouldAttemptReconnect(false);
					setReconnectAttempts(0);
					setCurrentPlayersWsId(null);
					if (typeof window !== 'undefined') {
						localStorage.removeItem('exquisiteCorpsePlayerId');
						localStorage.removeItem('exquisiteCorpseGameCode');
					}
				}
			};

			ws.onerror = (error) => {
				console.error('WebSocket error:', error);
				wsRef.current = null;
				if (hasJoinedGame) {
					setMessage(
						`WebSocket error. Attempting to reconnect... (Attempt ${
							reconnectAttempts + 1
						}/${MAX_RECONNECT_ATTEMPTS_CLIENT})`
					);
					setShouldAttemptReconnect(true);
					setReconnectAttempts((prev) => prev + 1);
				}
			};
		};

		// Only connect if hasJoinedGame is true AND there is no existing connection AND not currently loading
		if (hasJoinedGame && !wsRef.current && !isLoading) {
			// Trigger reconnect if signalled AND within attempt limits
			if (
				shouldAttemptReconnect &&
				reconnectAttempts < MAX_RECONNECT_ATTEMPTS_CLIENT
			) {
				reconnectTimeoutId = setTimeout(
					connectWebSocket,
					RECONNECT_INTERVAL_MS
				);
			} else if (!shouldAttemptReconnect) {
				// Initial join or created game (not a reconnect attempt)
				connectWebSocket();
			} else if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS_CLIENT) {
				// Max reconnect attempts reached, reset state
				setMessage(
					'Maximum reconnect attempts reached. Please create or join a new game.'
				);
				setHasJoinedGame(false);
				setGameCode('');
				setGeneratedGameCode('');
				setCurrentPlayersWsId(null);
				if (typeof window !== 'undefined') {
					localStorage.removeItem('exquisiteCorpsePlayerId');
					localStorage.removeItem('exquisiteCorpseGameCode');
				}
				setShouldAttemptReconnect(false); // Stop trying to reconnect
				setReconnectAttempts(0); // Reset attempts
			}
		}

		// Cleanup function for useEffect
		return () => {
			console.log('Cleaning up WebSocket connection useEffect...');
			clearTimeout(reconnectTimeoutId); // Clear any pending reconnect timeouts

			// Only close if marked for intentional close AND WebSocket is open
			if (
				wsRef.current &&
				wsRef.current.readyState === WebSocket.OPEN &&
				isClosingIntentionallyRef.current
			) {
				console.log(
					'Closing WebSocket intentionally during useEffect cleanup.'
				);
				wsRef.current.close();
				// Do not set wsRef.current = null here. onclose will handle it.
			}
		};
	}, [
		hasJoinedGame,
		generatedGameCode,
		gameCode,
		shouldAttemptReconnect,
		reconnectAttempts,
		isLoading,
		// currentPlayersWsId is intentionally NOT a dependency here.
		// Its value is read inside connectWebSocket, which is triggered by other dependencies.
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
			// The currentPlayersWsId will be set by the server's response via onmessage
		} catch (error) {
			console.error('Error creating game:', error);
			setMessage('Failed to create game. Please try again.');
			setIsLoading(false);
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
		// The currentPlayersWsId will be used from localStorage or set by the server's response
		// The `useEffect` for WebSocket connection will trigger due to `hasJoinedGame` becoming true
	};

	const handlePlayAgain = useCallback(() => {
		// Set flag to indicate intentional close *before* closing the WebSocket
		isClosingIntentionallyRef.current = true;

		// Ensure the WebSocket is closed if it's open
		if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
			wsRef.current.close();
		}

		// Crucial: Manually set wsRef.current to null immediately
		// This explicitly signals the useEffect that no WebSocket is active.
		wsRef.current = null;

		// Reset all game-specific states to their initial, pre-joined game values
		setMessage('Enter a game code to join or create one!');
		setHasJoinedGame(false);
		setGameCode('');
		setGeneratedGameCode('');
		setGameRoomId(null);
		setPlayerCount(0);
		setCurrentSegmentIndex(0);
		setCurrentSegment(segments[0]); // Reset to Head for the first segment
		setCanDrawOrPlaceLine(false);
		setIsWaitingForOtherPlayers(false);
		setReceivedCanvasImage(null);
		setPreviousRedLineY(null);
		setIsGameOver(false);
		setFinalArtwork(null);
		setFinalArtwork2(null);
		setCurrentPlayersWsId(null); // Explicitly clear for a fresh start

		if (typeof window !== 'undefined') {
			localStorage.removeItem('exquisiteCorpsePlayerId'); // Clear local storage on play again
			localStorage.removeItem('exquisiteCorpseGameCode'); // Clear local storage on play again
		}
		setShouldAttemptReconnect(false); // Ensure no reconnection attempts when returning to lobby
		setReconnectAttempts(0); // Reset reconnect attempts
		setRedLinePlaced(false);
		// isClosingIntentionallyRef.current is reset within onclose or if a new WS connects.
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
					gameRoomId={generatedGameCode || gameCode}
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
					setCanDrawOrPlaceLine={setCanDrawOrPlaceLine}
					setIsWaitingForOtherPlayers={setIsWaitingForOtherPlayers}
					handlePlayAgain={handlePlayAgain}
					dynamicCanvasWidth={dynamicCanvasWidth}
					dynamicCanvasHeight={dynamicCanvasHeight}
					backendCanvasHeight={BACKEND_CANVAS_HEIGHT}
					setRedLinePlaced={setRedLinePlaced}
					redLinePlaced={redLinePlaced}
				/>
			)}
		</div>
	);
}
