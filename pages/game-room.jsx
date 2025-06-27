// game-room.jsx
import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import GameButtons from './game-buttons'; // Corrected import path (removed .jsx)
import GameOver from './game-over'; // Corrected import path (removed .jsx)

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
	backendCanvasHeight, // New prop: original canvas height from backend
	setCanDrawOrPlaceLine, // Accept the setter
	setIsWaitingForOtherPlayers, // Accept the setter
}) {
	useEffect(() => {
		if (typeof window !== 'undefined') {
			window.scrollTo(0, 0);
		}
	}, [gameRoomId]);
	// Refs for the two canvases and their contexts
	const drawingCanvasRef = useRef(null); // Main canvas for actual drawing
	const drawingContextRef = useRef(null);

	const overlayCanvasRef = useRef(null); // Overlay canvas for temporary red line
	const overlayContextRef = useRef(null);

	// Drawing state using refs for performance
	const isDrawingRef = useRef(false); // Changed from useState to useRef
	const lastPoint = useRef({ x: 0, y: 0 }); // To store last point, not strictly needed as state
	const pathPoints = useRef([]); // Stores points for the current stroke being drawn
	const currentStrokeSettings = useRef({}); // Stores color, lineWidth for the current stroke

	// New state for red line positioning
	const [isPlacingRedLine, setIsPlacingRedLine] = useState(false);
	const [redLineY, setRedLineY] = useState(dynamicCanvasHeight); // Initial position at bottom of canvas

	const isLastSegment = currentSegmentIndex === TOTAL_SEGMENTS - 1;

	// State for the scaled previous red line Y position for the overlay
	const [scaledPreviousRedLineY, setScaledPreviousRedLineY] = useState(null);

	// NEW: States for Undo/Redo history
	const [drawingHistory, setDrawingHistory] = useState([]); // Array of completed stroke objects
	const [undoneStrokes, setUndoneStrokes] = useState([]); // Array of strokes for redo functionality
	// New state to track if any drawing has occurred in the current segment
	// This now reflects if there's anything in drawingHistory
	const hasDrawnSomething = drawingHistory.length > 0;

	// Effect to scale previousRedLineY when dynamicCanvasHeight or previousRedLineY changes
	useEffect(() => {
		console.log(
			'[Overlay Debug] Effect triggered for previousRedLineY scaling.'
		);
		console.log(
			`[Overlay Debug] Raw previousRedLineY from backend: ${previousRedLineY}`
		);
		console.log(
			`[Overlay Debug] Current dynamicCanvasHeight: ${dynamicCanvasHeight}`
		);
		console.log(
			`[Overlay Debug] Backend original CanvasHeight: ${backendCanvasHeight}`
		);

		if (
			previousRedLineY !== null &&
			backendCanvasHeight &&
			dynamicCanvasHeight
		) {
			const scaleFactor = dynamicCanvasHeight / backendCanvasHeight;
			const calculatedScaledY = previousRedLineY * scaleFactor;
			setScaledPreviousRedLineY(calculatedScaledY);
			console.log(
				`[Overlay Debug] Calculated scaleFactor: ${scaleFactor}`
			);
			console.log(
				`[Overlay Debug] Scaled previousRedLineY: ${calculatedScaledY}`
			);
		} else {
			setScaledPreviousRedLineY(null);
			console.log(
				'[Overlay Debug] previousRedLineY is null or dimensions missing, not applying overlay.'
			);
		}
	}, [previousRedLineY, backendCanvasHeight, dynamicCanvasHeight]);

	// NEW: Function to redraw the entire canvas from history
	const redrawCanvas = useCallback(() => {
		const dCtx = drawingContextRef.current;
		const drawingCanvas = drawingCanvasRef.current;

		if (!dCtx || !drawingCanvas) return;

		// Clear the entire canvas first
		dCtx.clearRect(0, 0, dynamicCanvasWidth, dynamicCanvasHeight);
		dCtx.fillStyle = 'white';
		dCtx.fillRect(0, 0, dynamicCanvasWidth, dynamicCanvasHeight);

		// Draw the received previous segment image if it exists
		if (receivedCanvasImage) {
			const image = new Image();
			image.onload = () => {
				if (
					drawingContextRef.current &&
					drawingCanvasRef.current.width === dynamicCanvasWidth
				) {
					drawingContextRef.current.drawImage(
						image,
						0,
						0,
						dynamicCanvasWidth,
						dynamicCanvasHeight
					);
					// After drawing the background image, draw all historical strokes
					drawingHistory.forEach((stroke) => {
						drawStroke(
							dCtx,
							stroke,
							dynamicCanvasWidth,
							dynamicCanvasHeight
						);
					});
				}
			};
			image.onerror = (error) => {
				console.error(
					'Error loading received canvas image for redraw:',
					error
				);
			};
			image.src = receivedCanvasImage;
		} else {
			// If no received image, just draw the historical strokes
			drawingHistory.forEach((stroke) => {
				drawStroke(
					dCtx,
					stroke,
					dynamicCanvasWidth,
					dynamicCanvasHeight
				);
			});
		}
	}, [
		dynamicCanvasWidth,
		dynamicCanvasHeight,
		receivedCanvasImage,
		drawingHistory,
	]);

	// Helper function to draw a single stroke (moved from outside for clarity)
	const drawStroke = useCallback((ctx, stroke) => {
		if (!ctx || !stroke || !stroke.points || stroke.points.length === 0)
			return;

		ctx.strokeStyle = stroke.color;
		ctx.lineWidth = stroke.lineWidth;
		ctx.lineCap = stroke.lineCap || 'round';
		ctx.lineJoin = stroke.lineJoin || 'round';

		ctx.beginPath();
		ctx.moveTo(stroke.points[0].x, stroke.points[0].y);

		for (let i = 1; i < stroke.points.length; i++) {
			ctx.lineTo(stroke.points[i].x, stroke.points[i].y);
		}
		ctx.stroke();
	}, []);

	// Canvas setup: Initialize contexts, size canvases, and initial redraw
	useEffect(() => {
		const drawingCanvas = drawingCanvasRef.current;
		const overlayCanvas = overlayCanvasRef.current;
		let dCtx = drawingContextRef.current;
		let oCtx = overlayContextRef.current;

		if (!drawingCanvas || !overlayCanvas) return; // Ensure canvases exist

		// Always set canvas dimensions dynamically
		drawingCanvas.width = dynamicCanvasWidth;
		drawingCanvas.height = dynamicCanvasHeight;
		overlayCanvas.width = dynamicCanvasWidth;
		overlayCanvas.height = dynamicCanvasHeight;

		// Initialize contexts if they don't already exist
		if (!dCtx) {
			dCtx = drawingCanvas.getContext('2d');
			dCtx.lineCap = 'round';
			dCtx.lineJoin = 'round'; // Added lineJoin for smoother corners
			dCtx.strokeStyle = 'black';
			drawingContextRef.current = dCtx;
		}
		if (!oCtx) {
			oCtx = overlayCanvas.getContext('2d');
			oCtx.lineCap = 'round';
			oCtx.lineJoin = 'round'; // Added lineJoin for smoother corners
			oCtx.strokeStyle = 'black'; // Overlay context also needs stroke style
			overlayContextRef.current = oCtx;
		}

		// Apply dynamic line width
		const BASE_LINE_WIDTH = 5; // The desired line width at backendCanvasHeight
		const scaleFactorForLineWidth =
			dynamicCanvasHeight / backendCanvasHeight;
		dCtx.lineWidth = BASE_LINE_WIDTH * scaleFactorForLineWidth;
		oCtx.lineWidth = BASE_LINE_WIDTH * scaleFactorForLineWidth; // Apply to overlay context too

		// Initial clear of the overlay canvas (it should remain transparent)
		oCtx.clearRect(0, 0, dynamicCanvasWidth, dynamicCanvasHeight);

		// Initial redraw of the main canvas based on received image and current history
		redrawCanvas();
	}, [
		dynamicCanvasWidth,
		dynamicCanvasHeight,
		backendCanvasHeight,
		redrawCanvas, // Depend on redrawCanvas so it updates if its dependencies change
	]);

	// Effect to trigger redraw when drawingHistory or receivedCanvasImage changes
	useEffect(() => {
		redrawCanvas();
	}, [drawingHistory, receivedCanvasImage, redrawCanvas]); // Ensure redraws on history changes

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
		e.preventDefault();
		const rect = canvas.getBoundingClientRect();
		// Use canvas.width and canvas.height directly for scaling, as they are already set to dynamic values
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

			// Restrict drawing/line placement if currentSegmentIndex > 0 and y is above the scaledPreviousRedLineY
			if (
				currentSegmentIndex > 0 &&
				scaledPreviousRedLineY !== null &&
				y < scaledPreviousRedLineY
			) {
				return; // Do not start drawing if above the hidden area
			}

			isDrawingRef.current = true; // Set ref value
			lastPoint.current = { x, y }; // Store last point in ref

			if (!isPlacingRedLine) {
				// Start a new path for drawing
				pathPoints.current = [{ x, y }]; // Initialize path points
				currentStrokeSettings.current = {
					color: drawingContextRef.current.strokeStyle,
					lineWidth: drawingContextRef.current.lineWidth,
					lineCap: drawingContextRef.current.lineCap,
					lineJoin: drawingContextRef.current.lineJoin,
				};
				// Begin path on the overlay canvas for real-time feedback
				overlayContextRef.current.beginPath();
				overlayContextRef.current.moveTo(x, y);
			}
		},
		[
			canDrawOrPlaceLine,
			isGameOver,
			isPlacingRedLine,
			getCoordinates,
			currentSegmentIndex,
			scaledPreviousRedLineY,
		]
	);

	const handleCanvasMove = useCallback(
		(e) => {
			// Use isDrawingRef.current to check drawing state
			if (!isDrawingRef.current || !canDrawOrPlaceLine || isGameOver)
				return;

			e.preventDefault(); // Prevent scrolling on touch devices

			const canvas = overlayCanvasRef.current;
			if (!canvas) return;

			const { x, y } = getCoordinates(e, canvas);

			// Restrict drawing/line placement if currentSegmentIndex > 0 and y is above the scaledPreviousRedLineY
			if (
				currentSegmentIndex > 0 &&
				scaledPreviousRedLineY !== null &&
				y < scaledPreviousRedLineY
			) {
				return; // Do not draw or move line if above the hidden area
			}

			if (!isPlacingRedLine) {
				// Drawing mode - draw on overlay
				overlayContextRef.current.lineTo(x, y);
				overlayContextRef.current.stroke();
				pathPoints.current.push({ x, y }); // Add point to current stroke's path
			} else {
				// Red line placing mode
				const newRedLineY = Math.max(
					0,
					Math.min(dynamicCanvasHeight, y)
				);
				setRedLineY(newRedLineY); // Update the red line's Y position
				drawRedLineOnOverlay(newRedLineY); // Redraw the line
			}
			lastPoint.current = { x, y }; // Update last point in ref
		},
		[
			canDrawOrPlaceLine,
			isGameOver,
			isPlacingRedLine,
			drawRedLineOnOverlay,
			getCoordinates,
			dynamicCanvasHeight,
			currentSegmentIndex,
			scaledPreviousRedLineY,
		]
	);

	const handleCanvasEnd = useCallback(() => {
		if (!canDrawOrPlaceLine || isGameOver) return;

		if (isDrawingRef.current) {
			// Use ref value
			if (!isPlacingRedLine) {
				// For drawing mode, complete the stroke and add to history
				overlayContextRef.current.closePath(); // Close path on overlay
				overlayContextRef.current.clearRect(
					0,
					0,
					dynamicCanvasWidth,
					dynamicCanvasHeight
				); // Clear overlay

				// NEW: Require a minimum number of points for a stroke to be saved.
				// This helps filter out accidental clicks that don't involve actual drawing.
				// A single point (length 1) registers a dot. A length of 2 or more implies a drag.
				// Setting it to 2 means the user needs to drag at least 1px for a stroke to be saved.
				const MIN_STROKE_POINTS = 2;

				if (pathPoints.current.length >= MIN_STROKE_POINTS) {
					// Changed condition

					const newStroke = {
						...currentStrokeSettings.current,
						points: [...pathPoints.current], // Deep copy points
					};
					setDrawingHistory((prevHistory) => [
						...prevHistory,
						newStroke,
					]);
					setUndoneStrokes([]); // Clear redo history when a new stroke is added
				}
			} else {
				// Red line placing mode ends, no additional action needed beyond current state
				// The red line remains visible on the overlay until cleared by button actions
			}
			isDrawingRef.current = false; // Reset ref value
			pathPoints.current = []; // Reset current path for next stroke
		}
	}, [
		canDrawOrPlaceLine,
		isGameOver,
		isPlacingRedLine,
		dynamicCanvasWidth,
		dynamicCanvasHeight,
	]);

	// Use onMouseOut to also stop drawing or placing line if mouse leaves canvas
	const handleMouseOut = useCallback(() => {
		if (isDrawingRef.current && !isPlacingRedLine) {
			// Check ref value
			handleCanvasEnd(); // Stop drawing
		} else if (isPlacingRedLine && isDrawingRef.current) {
			// Check ref value
			// If dragging the line and mouse goes out
			isDrawingRef.current = false; // Stop the "drag" state for the line
			// The red line remains visible where it was last
		}
	}, [isPlacingRedLine, handleCanvasEnd]);

	// NEW: Undo last drawing stroke
	const handleUndo = useCallback(() => {
		setDrawingHistory((prevHistory) => {
			if (prevHistory.length > 0) {
				const lastStroke = prevHistory[prevHistory.length - 1];
				setUndoneStrokes((prevUndone) => [...prevUndone, lastStroke]); // Add to redo stack
				return prevHistory.slice(0, prevHistory.length - 1); // Remove last stroke
			}
			return prevHistory;
		});
	}, []);

	// NEW: Redo last undone stroke
	const handleRedo = useCallback(() => {
		setUndoneStrokes((prevUndone) => {
			if (prevUndone.length > 0) {
				const redoneStroke = prevUndone[prevUndone.length - 1];
				setDrawingHistory((prevHistory) => [
					...prevHistory,
					redoneStroke,
				]); // Add back to drawing history
				return prevUndone.slice(0, prevUndone.length - 1); // Remove from redo stack
			}
			return prevUndone;
		});
	}, []);

	// --- Action Buttons ---
	// The `clearCanvas` prop to GameButtons is replaced by `handleUndo` and `handleRedo`.
	// The actual "clear all" would be achieved by repeatedly pressing undo or starting a new segment.
	// For a full clear button that ignores history:
	// const clearAllDrawing = useCallback(() => {
	//     setDrawingHistory([]);
	//     setUndoneStrokes([]);
	//     redrawCanvas(); // Force redraw to clear
	// }, [redrawCanvas]);

	const submitSegment = () => {
		if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
			setMessage('WebSocket not connected. Cannot submit.');
			return;
		}

		if (
			!canDrawOrPlaceLine ||
			isWaitingForOtherPlayers ||
			isGameOver ||
			(!isPlacingRedLine && !isLastSegment && !hasDrawnSomething) || // Must be in placing mode if not the last segment and has drawn OR must have drawn something
			(!hasDrawnSomething && !isPlacingRedLine && !isLastSegment) // If not last segment, must have drawn or be placing line
		) {
			setMessage(
				'Cannot submit: Not your turn, game over, or conditions not met.'
			);
			return;
		}

		// Get the current canvas data as a Data URL (PNG format for transparency)
		// Ensure the canvas reflects the current drawingHistory state before submitting
		const currentCanvasData =
			drawingCanvasRef.current.toDataURL('image/png');

		// Scale the redLineY back to the backend's expected height (1920) before sending
		let normalizedRedLineY = null;
		if (!isLastSegment && redLineY !== null) {
			const scaleFactorToBackend =
				backendCanvasHeight / dynamicCanvasHeight;
			normalizedRedLineY = Math.round(redLineY * scaleFactorToBackend);
			console.log(`[Submit Debug] Frontend redLineY: ${redLineY}`);
			console.log(
				`[Submit Debug] Scale factor to backend: ${scaleFactorToBackend}`
			);
			console.log(
				`[Submit Debug] Normalized redLineY sent to backend: ${normalizedRedLineY}`
			);
		}

		// Send the current drawing and the normalized red line Y position to the server
		wsRef.current.send(
			JSON.stringify({
				type: 'submitSegment',
				gameRoomId: gameRoomId,
				canvasData: currentCanvasData,
				redLineY: normalizedRedLineY, // Send the normalized value
				playerId: currentPlayersWsId, // Use the state variable for player ID
			})
		);
		isDrawingRef.current = false; // Stop drawing ref
		setIsWaitingForOtherPlayers(true); // This state is now managed by parent based on WS message
		setCanDrawOrPlaceLine(false); // This state is now managed by parent based on WS message
		// Reset drawing history and red line state for the next segment
		setDrawingHistory([]);
		setUndoneStrokes([]);
		setIsPlacingRedLine(false);
		setRedLineY(dynamicCanvasHeight); // Reset red line position
		clearRedLineFromOverlay(); // Clear the red line from the overlay after submission
	};

	// New function to handle "Done Drawing" to transition to red line placement
	const handleDoneDrawing = useCallback(() => {
		// Only trigger if not the last segment
		if (currentSegmentIndex === TOTAL_SEGMENTS - 1) return;
		// If the user hasn't drawn anything, they can't 'done drawing'
		if (!hasDrawnSomething) {
			setMessage('Please draw something before marking as Done.');
			return;
		}

		// Ensure drawing is stopped and path is closed (if it wasn't already)
		isDrawingRef.current = false; // Ensure drawing state is false
		if (drawingContextRef.current) {
			// Path closing isn't strictly needed if managing by points
		}

		// Transition to red line placement mode
		setIsPlacingRedLine(true);
		// Set initial red line position (e.g., center or bottom)
		setRedLineY(dynamicCanvasHeight / 2); // Start red line in the middle
		drawRedLineOnOverlay(dynamicCanvasHeight / 2); // Draw it immediately
	}, [
		drawRedLineOnOverlay,
		currentSegmentIndex,
		dynamicCanvasHeight,
		hasDrawnSomething, // Now a computed value
		setMessage,
	]);

	// Determine if the "Submit Segment" button should be enabled/visible
	const canSubmitSegment =
		canDrawOrPlaceLine &&
		!isWaitingForOtherPlayers &&
		!isGameOver &&
		(isPlacingRedLine || (isLastSegment && hasDrawnSomething)); // Simplified condition

	return (
		<div className="w-full max-w-3xl flex flex-col items-center relative">
			{' '}
			{/* This is the main game container */}
			{!isGameOver ? ( // Conditional rendering for the main canvas and its controls
				<>
					{/* Container for the canvases to enforce aspect ratio */}
					<div
						className="relative bg-gray-100 rounded-lg shadow-inner overflow-hidden m-[5px]" // Removed p-[2px]
						style={{
							width: dynamicCanvasWidth,
							height: dynamicCanvasHeight,
						}}
					>
						{/* Main Drawing Canvas (z-index 0, lowest) */}
						<canvas
							ref={drawingCanvasRef}
							// width and height attributes are set in useEffect for dynamic sizing
							className="absolute top-0 left-0 w-full h-full rounded-lg border-2 border-solid border-gray-400 box-border" // Added box-border
							style={{
								zIndex: 0,
								userSelect: 'none',
								WebkitUserSelect: 'none',
							}} // ADDED OR MERGED THIS LINE
						></canvas>

						{/* Message displayed within the canvas container */}
						<div
							className="absolute top-1 left-2 p-2 rounded-lg text-gray-800 text-lg font-medium bg-opacity-75 z-40"
							style={
								{
									// This div is now inside the canvas container, so top/left are relative to it
								}
							}
						>
							{message}
						</div>

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
								scaledPreviousRedLineY !== null && ( // Use scaledPreviousRedLineY
									<div
										className="absolute top-0 left-0 w-full bg-indigo-300 bg-opacity-75 flex items-center justify-center text-gray-800 text-xl font-semibold" // Changed bg-gray-200 to bg-indigo-300 and text-gray-600 to text-gray-800
										style={{
											// Cover everything from the top down to the previous player's red line
											height: `${scaledPreviousRedLineY}px`, // Apply scaled value here
											pointerEvents: 'none',
											overflow: 'hidden',
										}}
									>
										Hidden
									</div>
								)}
						</div>

						{/* Overlay Canvas for Red Line (z-index 2, highest, interactive) */}
						<canvas
							ref={overlayCanvasRef}
							// width and height attributes are set in useEffect for dynamic sizing
							// Attach mouse events for both drawing and line placement
							onMouseDown={handleCanvasStart}
							onMouseMove={handleCanvasMove}
							onMouseUp={handleCanvasEnd}
							onMouseOut={handleMouseOut}
							onTouchStart={handleCanvasStart} // This already calls e.preventDefault() via getCoordinates
							onTouchMove={handleCanvasMove} // This already calls e.preventDefault() via getCoordinates
							onTouchEnd={(e) => {
								// Explicitly prevent default on touch end
								e.preventDefault();
								handleCanvasEnd();
							}}
							onTouchCancel={(e) => {
								// Explicitly prevent default on touch cancel
								e.preventDefault();
								handleCanvasEnd();
							}}
							className={`relative w-full h-full rounded-lg border-2 border-solid border-gray-400 box-border ${
								// Added box-border
								canDrawOrPlaceLine
									? 'cursor-crosshair'
									: 'cursor-not-allowed'
							} touch-none select-none`} // ADDED 'select-none' here
							style={{
								zIndex: 2,
								userSelect: 'none',
								WebkitUserSelect: 'none',
							}} // ADDED OR MERGED THIS LINE
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

						<div
							className="absolute bottom-2 right-2 z-40 flex space-x-2" // Position bottom-right within the game container, added flex and space-x-2 for buttons
						>
							<GameButtons
								// Removed clearCanvas, replaced with undo/redo
								handleUndo={handleUndo} // NEW
								handleRedo={handleRedo} // NEW
								isGameOver={isGameOver}
								canDrawOrPlaceLine={canDrawOrPlaceLine}
								handleDoneDrawing={handleDoneDrawing}
								isLastSegment={isLastSegment}
								canSubmitSegment={canSubmitSegment}
								submitSegment={submitSegment}
								isPlacingRedLine={isPlacingRedLine}
								isWaitingForOtherPlayers={
									isWaitingForOtherPlayers
								}
								hasDrawnSomething={hasDrawnSomething} // Now derived from drawingHistory.length
								isDrawing={isDrawingRef.current} // Use ref value
								hasUndoneStrokes={undoneStrokes.length > 0} // NEW: Pass if there are undone strokes
							></GameButtons>
						</div>
					</div>
				</>
			) : (
				<GameOver
					finalArtwork={finalArtwork}
					finalArtwork2={finalArtwork2}
					dynamicCanvasWidth={dynamicCanvasWidth} // Pass dynamic canvas width
					dynamicCanvasHeight={dynamicCanvasHeight}
					handlePlayAgain={handlePlayAgain}
				></GameOver>
			)}
		</div>
	);
}
