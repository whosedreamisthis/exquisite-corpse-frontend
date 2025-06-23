// useGameWebSocket.js
import { useRef, useEffect, useState, useCallback } from 'react';
import axios from 'axios';
import { WS_URL, segments, TOTAL_SEGMENTS, MAX_PLAYERS } from './game-config';

/**
 * Custom hook for WebSocket communication and game state management.
 * @param {string} gameCode User-entered game code.
 * @param {string} generatedGameCode Game code generated if creating a new game.
 * @param {boolean} hasJoinedGame Flag indicating if a game has been joined.
 * @param {string | null} currentPlayersWsId The WebSocket ID of the current player.
 * @param {string | null} latestSegmentDataUrl The most recent canvas data to send to the server.
 * @param {number} currentRedLineY The Y-coordinate for the red line being placed.
 * @param {number} currentSegmentIndex The index of the current segment being drawn.
 * @returns {{
 * message: string,
 * gameRoomId: string | null,
 * playerCount: number,
 * currentSegmentIndex: number,
 * currentSegmentName: string,
 * canDraw: boolean,
 * isWaitingForOthers: boolean,
 * receivedCanvasImage: string | null,
 * previousRedLineY: number | null,
 * isGameOver: boolean,
 * finalArtwork: string | null,
 * finalArtwork2: string | null,
 * createGame: () => Promise<void>,
 * joinGame: () => void,
 * submitSegment: (segmentDataUrl: string, redLineY: number) => void,
 * currentPlayersWsId: string | null,
 * setGeneratedGameCode: React.Dispatch<React.SetStateAction<string>>, // Expose setter for external updates
 * }}
 */
export function useGameWebSocket(
	gameCode,
	generatedGameCode,
	hasJoinedGame,
	currentPlayersWsId,
	latestSegmentDataUrl, // The canvas data to send with submission
	currentRedLineY, // The red line Y to send with submission
	currentSegmentIndex // The segment being completed with submission
) {
	const wsRef = useRef(null);

	// Game state managed by WebSocket updates
	const [message, setMessage] = useState(
		'Enter a game code to join or create one!'
	);
	const [gameRoomId, setGameRoomId] = useState(null);
	const [playerCount, setPlayerCount] = useState(0);
	const [currentSegmentName, setCurrentSegmentName] = useState(segments[0]);
	const [canDraw, setCanDraw] = useState(false);
	const [isWaitingForOthers, setIsWaitingForOthers] = useState(false);
	const [receivedCanvasImage, setReceivedCanvasImage] = useState(null);
	const [previousRedLineY, setPreviousRedLineY] = useState(null);
	const [isGameOver, setIsGameOver] = useState(false);
	const [finalArtwork, setFinalArtwork] = useState(null);
	const [finalArtwork2, setFinalArtwork2] = useState(null);

	// Expose generatedGameCode setter for outside control (e.g., in App.jsx when creating game)
	const [internalGeneratedGameCode, setInternalGeneratedGameCode] =
		useState(generatedGameCode);
	useEffect(() => {
		setInternalGeneratedGameCode(generatedGameCode);
	}, [generatedGameCode]);

	// WebSocket connection and message handling
	useEffect(() => {
		// Only connect if hasJoinedGame is true and no existing WS connection
		if (!hasJoinedGame || wsRef.current) return;

		const ws = new WebSocket(WS_URL);
		wsRef.current = ws;

		ws.onopen = () => {
			console.log('WebSocket connected.');
			// Send joinGame message with the correct code
			const codeToJoin = internalGeneratedGameCode || gameCode;
			ws.send(
				JSON.stringify({
					type: 'joinGame',
					gameCode: codeToJoin,
					playerId: currentPlayersWsId, // Send current playerId if known, else null for server to assign
				})
			);
		};

		ws.onmessage = (event) => {
			const data = JSON.parse(event.data);
			console.log('WS received:', data);

			setMessage(data.message || 'Game state updated.');
			setPlayerCount(data.playerCount || 0);
			setCurrentSegmentName(segments[data.currentSegmentIndex || 0]);
			setCanDraw(data.canDraw || false);
			setIsWaitingForOthers(data.isWaitingForOthers || false);
			setReceivedCanvasImage(data.canvasData || null);
			setPreviousRedLineY(
				data.previousRedLineY !== undefined
					? data.previousRedLineY
					: null
			);
			setGameRoomId(data.gameRoomId || null);

			// Update internalGeneratedGameCode if it's the game creator
			if (data.type === 'gameCodeGenerated' && data.gameCode) {
				setInternalGeneratedGameCode(data.gameCode);
			}

			if (data.status === 'completed') {
				setIsGameOver(true);
				setFinalArtwork(data.finalArtwork1 || null);
				setFinalArtwork2(data.finalArtwork2 || null);
				setCanDraw(false); // No drawing when game is over
			} else {
				setIsGameOver(false);
				setFinalArtwork(null);
				setFinalArtwork2(null);
			}
		};

		ws.onclose = () => {
			console.log('WebSocket disconnected.');
			setMessage('Disconnected from game. Please refresh to rejoin.');
			wsRef.current = null; // Clear the ref
			// Note: External state `hasJoinedGame` needs to be managed by the component using this hook
		};

		ws.onerror = (error) => {
			console.error('WebSocket error:', error);
			setMessage('WebSocket error. Please check console and refresh.');
			wsRef.current = null;
		};

		// Cleanup
		return () => {
			if (wsRef.current) {
				wsRef.current.close();
				wsRef.current = null;
			}
		};
	}, [
		hasJoinedGame,
		gameCode,
		internalGeneratedGameCode,
		currentPlayersWsId,
	]); // Dependencies for WS connection

	const createGame = useCallback(async () => {
		try {
			const response = await axios.post(
				`${WS_URL.replace('ws', 'http')}/api/createGame`
			);
			console.log('Game created:', response.data);
			setInternalGeneratedGameCode(response.data.gameCode); // Update internal state
			setMessage(`Game created! Share code: ${response.data.gameCode}`);
			// This triggers useEffect to connect WebSocket
		} catch (error) {
			console.error('Error creating game:', error);
			setMessage('Failed to create game. Please try again.');
		}
	}, []);

	const joinGame = useCallback(() => {
		// This triggers useEffect to connect WebSocket
		// Actual join message is sent in ws.onopen
	}, []);

	const submitSegment = useCallback(() => {
		if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
			console.error('WebSocket is not connected. Cannot submit segment.');
			setMessage('Error: Not connected to game server. Please refresh.');
			return;
		}

		if (!latestSegmentDataUrl) {
			setMessage('No drawing to submit!');
			return;
		}

		console.log('Sending submitSegment:', {
			gameRoomId,
			playerId: currentPlayersWsId,
			segmentDataUrl: latestSegmentDataUrl,
			redLineY: currentRedLineY,
			currentSegmentIndex: currentSegmentIndex, // Ensure this is sent with submission
		});

		wsRef.current.send(
			JSON.stringify({
				type: 'submitSegment',
				gameRoomId: gameRoomId,
				playerId: currentPlayersWsId,
				canvasData: latestSegmentDataUrl, // Renamed from segmentDataUrl to canvasData for consistency with backend
				redLineY: currentRedLineY,
				currentSegmentIndex: currentSegmentIndex, // Pass current segment index
			})
		);
		setMessage('Segment submitted! Waiting for other players...');
		setIsWaitingForOthers(true);
		setCanDraw(false); // Disable drawing after submission
	}, [
		wsRef,
		gameRoomId,
		currentPlayersWsId,
		latestSegmentDataUrl,
		currentRedLineY,
		currentSegmentIndex,
	]);

	return {
		message,
		gameRoomId,
		playerCount,
		currentSegmentIndex,
		currentSegmentName,
		canDraw,
		isWaitingForOthers,
		receivedCanvasImage,
		previousRedLineY,
		isGameOver,
		finalArtwork,
		finalArtwork2,
		createGame,
		joinGame,
		submitSegment,
		currentPlayersWsId,
		generatedGameCode: internalGeneratedGameCode, // Return internal state as generatedGameCode
		setGeneratedGameCode: setInternalGeneratedGameCode,
	};
}
