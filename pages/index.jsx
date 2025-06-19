import { useEffect, useRef, useState, useCallback } from 'react';

// IMPORTANT: Replace this with the URL of your deployed Render backend later
// For now, it will use localhost for testing against your local backend.
// const WS_URL = 'wss://your-render-backend-name.onrender.com';
const WS_URL = 'ws://localhost:8080'; // For local testing against your local backend

export default function ExquisiteCorpseGame() {
	const canvasRef = useRef(null);
	const wsRef = useRef(null);
	const [isDrawing, setIsDrawing] = useState(false);
	const [currentDrawingData, setCurrentDrawingData] = useState(null);
	const [gameRoomId, setGameRoomId] = useState('');
	const [message, setMessage] = useState(
		'Enter a game code to join or create one!'
	);

	// ---- WebSocket Connection Logic ----
	useEffect(() => {
		if (!gameRoomId) return;

		if (wsRef.current) {
			wsRef.current.close();
		}

		wsRef.current = new WebSocket(WS_URL);

		wsRef.current.onopen = () => {
			console.log('Connected to WebSocket backend!');
			setMessage('Connected! Sending join request...');
			wsRef.current.send(
				JSON.stringify({ type: 'joinGame', gameCode: gameRoomId })
			);
		};

		wsRef.current.onmessage = (event) => {
			const data = JSON.parse(event.data);
			console.log('Received from backend:', data);

			if (data.type === 'initialGameState' && data.gameRoom) {
				setMessage(
					`Joined game: ${data.gameRoom.gameCode}. Waiting for turn.`
				);
				if (
					data.gameRoom.canvasSegments &&
					data.gameRoom.canvasSegments.length > 0
				) {
					setCurrentDrawingData(
						data.gameRoom.canvasSegments[
							data.gameRoom.canvasSegments.length - 1
						]
					);
				}
			} else if (
				data.type === 'canvasUpdate' &&
				data.gameRoomId === gameRoomId
			) {
				setCurrentDrawingData(data.canvasData);
				setMessage('Drawing updated by another player!');
			} else if (data.type === 'error') {
				setMessage(`Error: ${data.message}`);
			}
		};

		wsRef.current.onclose = () => {
			console.log('Disconnected from WebSocket backend.');
			setMessage('Disconnected from game. Attempting to reconnect...');
			setTimeout(() => {
				if (gameRoomId) {
					wsRef.current = new WebSocket(WS_URL);
				}
			}, 3000);
		};

		wsRef.current.onerror = (error) => {
			console.error('WebSocket error:', error);
			setMessage('WebSocket connection error!');
		};

		return () => {
			wsRef.current?.close();
		};
	}, [gameRoomId]);

	// ---- Canvas Drawing Logic ----
	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas) return;
		const ctx = canvas.getContext('2d');
		if (!ctx) return;

		ctx.clearRect(0, 0, canvas.width, canvas.height);

		if (currentDrawingData) {
			const img = new Image();
			img.onload = () => {
				ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
			};
			img.src = currentDrawingData;
		} else {
			ctx.clearRect(0, 0, canvas.width, canvas.height);
		}
	}, [currentDrawingData]);

	const getMousePos = useCallback((event) => {
		const canvas = canvasRef.current;
		if (!canvas) return { x: 0, y: 0 };

		const rect = canvas.getBoundingClientRect();
		let clientX, clientY;

		if (event instanceof MouseEvent) {
			clientX = event.clientX;
			clientY = event.clientY;
		} else {
			// TouchEvent
			clientX = event.touches[0].clientX;
			clientY = event.touches[0].clientY;
		}

		return {
			x: clientX - rect.left,
			y: clientY - rect.top,
		};
	}, []);

	const startDrawing = useCallback(
		(event) => {
			const canvas = canvasRef.current;
			if (!canvas) return;
			const ctx = canvas.getContext('2d');
			if (!ctx) return;

			setIsDrawing(true);
			ctx.beginPath();
			const { x, y } = getMousePos(event.nativeEvent);
			ctx.moveTo(x, y);
		},
		[getMousePos]
	);

	const draw = useCallback(
		(event) => {
			if (!isDrawing) return;
			const canvas = canvasRef.current;
			if (!canvas) return;
			const ctx = canvas.getContext('2d');
			if (!ctx) return;

			const { x, y } = getMousePos(event.nativeEvent);
			ctx.lineTo(x, y);
			ctx.stroke();
		},
		[isDrawing, getMousePos]
	);

	const endDrawing = useCallback(() => {
		if (!isDrawing) return;
		setIsDrawing(false);
		const canvas = canvasRef.current;
		if (!canvas) return;

		const dataURL = canvas.toDataURL('image/png');
		if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
			wsRef.current.send(
				JSON.stringify({
					type: 'drawUpdate',
					gameRoomId: gameRoomId,
					canvasData: dataURL,
					segmentIndex: 0,
				})
			);
		}
	}, [isDrawing, gameRoomId]);

	const handleGameCodeChange = (e) => {
		setGameRoomId(e.target.value.toUpperCase());
	};

	const joinOrCreateGame = async () => {
		if (!gameRoomId) {
			setMessage('Please enter a game code.');
			return;
		}
		setMessage(`Attempting to join/create game: ${gameRoomId}...`);
	};

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
				>
					Join/Create Game
				</button>
			</div>

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
				onMouseDown={startDrawing}
				onMouseMove={draw}
				onMouseUp={endDrawing}
				onMouseLeave={endDrawing}
				onTouchStart={startDrawing}
				onTouchMove={draw}
				onTouchEnd={endDrawing}
				onTouchCancel={endDrawing}
			/>
		</div>
	);
}
