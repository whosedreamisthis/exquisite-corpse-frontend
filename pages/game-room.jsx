// game-room.jsx
import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import GameButtons from './game-buttons';
import GameOver from './game-over'; // Make sure to import GameOver

const TOTAL_SEGMENTS = 4; // Define total segments here
const segments = ['Head', 'Torso', 'Legs', 'Feet']; // Matches backend messaging
const PEEK_HEIGHT = 20; // This should be consistent with frontend logic

export default function GameRoom({
	gameRoomId,
	message,
	playerCount,
	currentSegmentIndex,
	canDrawOrPlaceLine,
	isWaitingForOtherPlayers,
	receivedCanvasImage,
	previousRedLineY,
	isGameOver,
	finalArtwork,
	finalArtwork2,
	currentPlayersWsId,
	wsRef,
	setMessage,
	handlePlayAgain,
	dynamicCanvasWidth, // Passed from index.jsx
	dynamicCanvasHeight, // Passed from index.jsx
	setCanDrawOrPlaceLine, // Accept the setter
	setIsWaitingForOtherPlayers, // Accept the setter
}) {
	// Refs for the two canvases and their contexts
	const drawingCanvasRef = useRef(null); // Main canvas for actual drawing
	const drawingContextRef = useRef(null);

	const overlayCanvasRef = useRef(null); // Overlay canvas for temporary red line
	const overlayContextRef = useRef(null);

	const [isDrawing, setIsDrawing] = useState(false);
	const [lastX, setLastX] = useState(0); // Not strictly needed with two canvases, but kept for consistency
	const [lastY, setLastY] = useState(0); // Not strictly needed, but kept for consistency

	// New state to track if any drawing has occurred in the current segment
	const [hasDrawnSomething, setHasDrawnSomething] = useState(false);

	// New state for red line positioning
	const [isPlacingRedLine, setIsPlacingRedLine] = useState(false);
	const [redLineY, setRedLineY] = useState(dynamicCanvasHeight); // Initial position at bottom of canvas

	const isLastSegment = currentSegmentIndex === TOTAL_SEGMENTS - 1;

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
		oCtx.clearRect(0, 0, dynamicCanvasWidth, dynamicCanvasHeight);

		// Clear drawing canvas initially if no image is present for the first segment
		if (!receivedCanvasImage && currentSegmentIndex === 0) {
			dCtx.clearRect(0, 0, dynamicCanvasWidth, dynamicCanvasHeight);
		}
	}, [
		drawingCanvasRef,
		overlayCanvasRef,
		receivedCanvasImage,
		currentSegmentIndex,
		dynamicCanvasWidth,
		dynamicCanvasHeight,
	]);

	// Draw received canvas image when it updates
	useEffect(() => {
		if (receivedCanvasImage && drawingCanvasRef.current) {
			const image = new Image();
			image.onload = () => {
				const ctx = drawingCanvasRef.current.getContext('2d');
				ctx.clearRect(0, 0, dynamicCanvasWidth, dynamicCanvasHeight); // Clear before drawing new base image
				ctx.drawImage(image, 0, 0);
			};
			image.onerror = (error) => {
				console.error('Error loading received canvas image:', error);
			};
			image.src = receivedCanvasImage;
		} else if (!receivedCanvasImage && drawingCanvasRef.current) {
			// Clear canvas if receivedCanvasImage becomes null
			const ctx = drawingCanvasRef.current.getContext('2d');
			ctx.clearRect(0, 0, dynamicCanvasWidth, dynamicCanvasHeight);
		}
	}, [receivedCanvasImage, dynamicCanvasWidth, dynamicCanvasHeight]);

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
				const newRedLineY = Math.max(
					0,
					Math.min(dynamicCanvasHeight, y)
				);
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
			dynamicCanvasHeight,
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
			drawingContext.clearRect(
				0,
				0,
				dynamicCanvasWidth,
				dynamicCanvasHeight
			); // Clear the entire drawing canvas
			// If there's a previous segment image, re-draw it after clearing
			if (receivedCanvasImage) {
				const img = new Image();
				img.onload = () => {
					drawingContext.drawImage(
						img,
						0,
						0,
						dynamicCanvasWidth,
						dynamicCanvasHeight
					);
				};
				img.src = receivedCanvasImage;
			}
		}
		clearRedLineFromOverlay(); // Also clear the red line from the overlay
		setIsPlacingRedLine(false); // Exit line placement mode if clearing
		setRedLineY(dynamicCanvasHeight); // Reset red line position
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
		setIsWaitingForOtherPlayers(true); // This state is now managed by parent based on WS message
		setCanDrawOrPlaceLine(false); // This state is now managed by parent based on WS message
		setHasDrawnSomething(false); // Reset drawing flag for next turn
		setIsPlacingRedLine(false); // Exit line placing mode after submission
		clearRedLineFromOverlay(); // Clear the red line from the overlay after submission
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
		setRedLineY(dynamicCanvasHeight / 2); // Start red line in the middle
		drawRedLineOnOverlay(dynamicCanvasHeight / 2); // Draw it immediately
	}, [drawRedLineOnOverlay, currentSegmentIndex, dynamicCanvasHeight]);

	// Determine if the "Submit Segment" button should be enabled/visible
	const canSubmitSegment =
		canDrawOrPlaceLine &&
		!isWaitingForOtherPlayers &&
		!isGameOver &&
		(isPlacingRedLine ||
			(isLastSegment && hasDrawnSomething && !isDrawing));

	return (
		<div className="w-full max-w-3xl flex flex-col items-center relative">
			<p className="message text-xl text-gray-700 font-medium">
				{message}
			</p>

			{!isGameOver ? ( // Conditional rendering for the main canvas and its controls
				<>
					<div className="relative bg-gray-100 rounded-lg shadow-inner border border-gray-200 overflow-hidden">
						{/* Main Drawing Canvas (z-index 0, lowest) */}
						<canvas
							ref={drawingCanvasRef}
							width={dynamicCanvasWidth}
							height={dynamicCanvasHeight}
							className="absolute top-0 left-0 rounded-lg"
							style={{ zIndex: 0 }}
						></canvas>

						{/* This div contains the previous segment hiding overlay (z-index 1, middle) */}
						<div
							className="absolute top-0 left-0 w-full h-full"
							style={{
								width: dynamicCanvasWidth,
								height: dynamicCanvasHeight,
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
							width={dynamicCanvasWidth}
							height={dynamicCanvasHeight}
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
					<GameButtons
						clearCanvas={clearCanvas}
						isGameOver={isGameOver}
						canDrawOrPlaceLine={canDrawOrPlaceLine}
						handleDoneDrawing={handleDoneDrawing}
						isLastSegment={isLastSegment}
						canSubmitSegment={canSubmitSegment}
						submitSegment={submitSegment}
						isPlacingRedLine={isPlacingRedLine}
						isWaitingForOtherPlayers={isWaitingForOtherPlayers}
						hasDrawnSomething={hasDrawnSomething}
						isDrawing={isDrawing}
					></GameButtons>
				</>
			) : (
				<GameOver
					finalArtwork={finalArtwork}
					finalArtwork2={finalArtwork2}
					handlePlayAgain={handlePlayAgain}
				></GameOver>
			)}
		</div>
	);
}
