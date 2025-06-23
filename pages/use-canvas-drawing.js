// useCanvasDrawing.js
import { useRef, useState, useEffect, useCallback } from 'react';
import { PEEK_HEIGHT } from './game-config';

/**
 * Custom hook for managing canvas drawing and red line placement.
 * @param {number} canvasWidth The current width of the canvas.
 * @param {number} canvasHeight The current height of the canvas.
 * @param {boolean} canDraw Whether the player is currently allowed to draw.
 * @param {string | null} receivedCanvasImage Data URL of the image from the previous player.
 * @param {number | null} previousRedLineY Y-coordinate of the red line from the previous player.
 * @returns {{
 * drawingCanvasRef: React.RefObject<HTMLCanvasElement>,
 * overlayCanvasRef: React.RefObject<HTMLCanvasElement>,
 * isDrawing: boolean,
 * hasDrawnSomething: boolean,
 * isPlacingRedLine: boolean,
 * redLineY: number,
 * startDrawing: (e: MouseEvent | TouchEvent) => void,
 * draw: (e: MouseEvent | TouchEvent) => void,
 * stopDrawing: () => void,
 * clearDrawingCanvas: () => void,
 * toggleRedLinePlacement: () => void,
 * getDrawingDataUrl: () => string | null,
 * }}
 */
export function useCanvasDrawing(
	canvasWidth,
	canvasHeight,
	canDraw,
	receivedCanvasImage,
	previousRedLineY,
	currentSegmentIndex,
	TOTAL_SEGMENTS
) {
	const drawingCanvasRef = useRef(null);
	const drawingContextRef = useRef(null);
	const overlayCanvasRef = useRef(null);
	const overlayContextRef = useRef(null);

	const [isDrawing, setIsDrawing] = useState(false);
	const [lastX, setLastX] = useState(0);
	const [lastY, setLastY] = useState(0);
	const [hasDrawnSomething, setHasDrawnSomething] = useState(false);
	const [isPlacingRedLine, setIsPlacingRedLine] = useState(false);
	const [redLineY, setRedLineY] = useState(canvasHeight); // Initialized to canvasHeight

	// Helper to get coordinates from mouse or touch event
	const getEventCoords = useCallback((canvas, event) => {
		const rect = canvas.getBoundingClientRect();
		let x, y;

		if (event.touches) {
			// Touch event
			x = event.touches[0].clientX - rect.left;
			y = event.touches[0].clientY - rect.top;
		} else {
			// Mouse event
			x = event.clientX - rect.left;
			y = event.clientY - rect.top;
		}
		// Scale coordinates if canvas display size is different from its internal pixel size
		const scaleX = canvas.width / rect.width;
		const scaleY = canvas.height / rect.height;
		return { x: x * scaleX, y: y * scaleY };
	}, []);

	// Initialize canvas contexts and event listeners
	useEffect(() => {
		const drawingCanvas = drawingCanvasRef.current;
		const overlayCanvas = overlayCanvasRef.current;

		if (!drawingCanvas || !overlayCanvas) return;

		// Set canvas dimensions
		drawingCanvas.width = canvasWidth;
		drawingCanvas.height = canvasHeight;
		overlayCanvas.width = canvasWidth;
		overlayCanvas.height = canvasHeight;

		const dCtx = drawingCanvas.getContext('2d');
		dCtx.lineCap = 'round';
		dCtx.strokeStyle = 'black';
		dCtx.lineWidth = 5;
		drawingContextRef.current = dCtx;

		const oCtx = overlayCanvas.getContext('2d');
		overlayContextRef.current = oCtx;

		// Clear both canvases initially
		dCtx.clearRect(0, 0, canvasWidth, canvasHeight);
		oCtx.clearRect(0, 0, canvasWidth, canvasHeight);

		// --- Event Handlers for Drawing ---
		const handleStartDrawing = (e) => {
			if (!canDraw || isPlacingRedLine) return;
			e.preventDefault(); // Prevent scrolling on touch
			const { x, y } = getEventCoords(drawingCanvas, e);
			setIsDrawing(true);
			setHasDrawnSomething(true);
			dCtx.beginPath();
			dCtx.moveTo(x, y);
			setLastX(x);
			setLastY(y);
		};

		const handleDraw = (e) => {
			if (!isDrawing || !canDraw || isPlacingRedLine) return;
			e.preventDefault(); // Prevent scrolling on touch
			const { x, y } = getEventCoords(drawingCanvas, e);
			dCtx.lineTo(x, y);
			dCtx.stroke();
			setLastX(x);
			setLastY(y);
		};

		const handleStopDrawing = () => {
			if (isDrawing) {
				dCtx.closePath();
				setIsDrawing(false);
			}
		};

		// --- Event Handlers for Red Line Placement ---
		const handleRedLineInteractionStart = (e) => {
			if (!canDraw || !isPlacingRedLine) return;
			e.preventDefault();
			setIsDrawing(true); // Re-use isDrawing to indicate dragging action for the line
			const { y } = getEventCoords(overlayCanvas, e);
			setRedLineY(y); // Set initial line position
		};

		const handleRedLineInteractionMove = (e) => {
			if (!isDrawing || !canDraw || !isPlacingRedLine) return;
			e.preventDefault();
			const { y } = getEventCoords(overlayCanvas, e);
			// Constrain redLineY within reasonable bounds
			const minLineY =
				previousRedLineY !== null
					? previousRedLineY + PEEK_HEIGHT
					: PEEK_HEIGHT;
			const maxLineY = canvasHeight - PEEK_HEIGHT; // Ensure space for peek below
			setRedLineY(Math.max(minLineY, Math.min(y, maxLineY)));
		};

		const handleRedLineInteractionEnd = () => {
			setIsDrawing(false); // Stop dragging the line
		};

		// Attach Drawing Listeners
		drawingCanvas.addEventListener('mousedown', handleStartDrawing);
		drawingCanvas.addEventListener('mousemove', handleDraw);
		drawingCanvas.addEventListener('mouseup', handleStopDrawing);
		drawingCanvas.addEventListener('mouseout', handleStopDrawing); // Stop drawing if mouse leaves
		drawingCanvas.addEventListener('touchstart', handleStartDrawing);
		drawingCanvas.addEventListener('touchmove', handleDraw);
		drawingCanvas.addEventListener('touchend', handleStopDrawing);
		drawingCanvas.addEventListener('touchcancel', handleStopDrawing);

		// Attach Overlay/Red Line Listeners
		// These are distinct from drawing listeners to allow interaction on the overlay for line placement
		overlayCanvas.addEventListener(
			'mousedown',
			handleRedLineInteractionStart
		);
		overlayCanvas.addEventListener(
			'mousemove',
			handleRedLineInteractionMove
		);
		overlayCanvas.addEventListener('mouseup', handleRedLineInteractionEnd);
		overlayCanvas.addEventListener('mouseout', handleRedLineInteractionEnd);
		overlayCanvas.addEventListener(
			'touchstart',
			handleRedLineInteractionStart
		);
		overlayCanvas.addEventListener(
			'touchmove',
			handleRedLineInteractionMove
		);
		overlayCanvas.addEventListener('touchend', handleRedLineInteractionEnd);
		overlayCanvas.addEventListener(
			'touchcancel',
			handleRedLineInteractionEnd
		);

		return () => {
			// Cleanup event listeners
			drawingCanvas.removeEventListener('mousedown', handleStartDrawing);
			drawingCanvas.removeEventListener('mousemove', handleDraw);
			drawingCanvas.removeEventListener('mouseup', handleStopDrawing);
			drawingCanvas.removeEventListener('mouseout', handleStopDrawing);
			drawingCanvas.removeEventListener('touchstart', handleStartDrawing);
			drawingCanvas.removeEventListener('touchmove', handleDraw);
			drawingCanvas.removeEventListener('touchend', handleStopDrawing);
			drawingCanvas.removeEventListener('touchcancel', handleStopDrawing);

			overlayCanvas.removeEventListener(
				'mousedown',
				handleRedLineInteractionStart
			);
			overlayCanvas.removeEventListener(
				'mousemove',
				handleRedLineInteractionMove
			);
			overlayCanvas.removeEventListener(
				'mouseup',
				handleRedLineInteractionEnd
			);
			overlayCanvas.removeEventListener(
				'mouseout',
				handleRedLineInteractionEnd
			);
			overlayCanvas.removeEventListener(
				'touchstart',
				handleRedLineInteractionStart
			);
			overlayCanvas.removeEventListener(
				'touchmove',
				handleRedLineInteractionMove
			);
			overlayCanvas.removeEventListener(
				'touchend',
				handleRedLineInteractionEnd
			);
			overlayCanvas.removeEventListener(
				'touchcancel',
				handleRedLineInteractionEnd
			);
		};
	}, [
		canvasWidth,
		canvasHeight,
		canDraw,
		isDrawing,
		isPlacingRedLine,
		lastX,
		lastY,
		getEventCoords,
		previousRedLineY, // Added previousRedLineY as dependency for line constraints
	]);

	// Effect to redraw received image and previous red line when they change
	useEffect(() => {
		const dCtx = drawingContextRef.current;
		const oCtx = overlayContextRef.current;

		if (!dCtx || !oCtx) return;

		// Clear both canvases
		dCtx.clearRect(0, 0, canvasWidth, canvasHeight);
		oCtx.clearRect(0, 0, canvasWidth, canvasHeight);

		// Draw received image if available
		if (receivedCanvasImage) {
			const img = new Image();
			img.onload = () => {
				dCtx.drawImage(img, 0, 0, canvasWidth, canvasHeight);
			};
			img.onerror = (error) => {
				console.error(
					'Error loading received canvas image for redraw:',
					error
				);
			};
			img.src = receivedCanvasImage;
		}

		// Draw previous red line on drawing canvas if it exists
		if (previousRedLineY !== null) {
			dCtx.save();
			dCtx.strokeStyle = 'rgba(255, 0, 0, 0.5)'; // Lighter red for previous
			dCtx.lineWidth = 2;
			dCtx.setLineDash([5, 5]); // Dashed line
			dCtx.beginPath();
			dCtx.moveTo(0, previousRedLineY);
			dCtx.lineTo(canvasWidth, previousRedLineY);
			dCtx.stroke();
			dCtx.restore(); // Restore to remove dashed line for new drawings
		}

		// Draw current red line on overlay if in placing mode
		if (isPlacingRedLine) {
			oCtx.strokeStyle = 'red';
			oCtx.lineWidth = 2;
			oCtx.beginPath();
			oCtx.moveTo(0, redLineY);
			oCtx.lineTo(canvasWidth, redLineY);
			oCtx.stroke();
		}
	}, [
		receivedCanvasImage,
		previousRedLineY,
		isPlacingRedLine,
		redLineY,
		canvasWidth,
		canvasHeight,
	]);

	const clearDrawingCanvas = useCallback(() => {
		const dCtx = drawingContextRef.current;
		const oCtx = overlayContextRef.current;
		if (dCtx && oCtx) {
			dCtx.clearRect(0, 0, canvasWidth, canvasHeight);
			oCtx.clearRect(0, 0, canvasWidth, canvasHeight); // Clear overlay as well
			setHasDrawnSomething(false);
			setIsPlacingRedLine(false); // Exit red line placing mode
			setRedLineY(canvasHeight); // Reset red line position
			// Re-draw previous segment if exists after clearing current drawing
			if (receivedCanvasImage) {
				const img = new Image();
				img.onload = () => {
					dCtx.drawImage(img, 0, 0, canvasWidth, canvasHeight);
				};
				img.src = receivedCanvasImage;
			}
		}
	}, [canvasWidth, canvasHeight, receivedCanvasImage]);

	const toggleRedLinePlacement = useCallback(() => {
		// Only allow toggling to red line placement if something has been drawn and it's not the last segment
		if (currentSegmentIndex === TOTAL_SEGMENTS - 1) {
			// For the last segment, there's no red line to place. The "Done Drawing" button should turn into "Submit Final Artwork"
			// This case should be handled by the button logic in GameUI.
			return;
		}

		if (!hasDrawnSomething) {
			console.log('Please draw something before placing the red line!');
			return;
		}

		setIsPlacingRedLine((prev) => !prev);
		// If entering red line placement, set a default position
		if (!isPlacingRedLine) {
			// Default position is the start of the current segment + half the segment height
			// adjusted for previous red line if it exists
			const defaultY =
				previousRedLineY !== null
					? previousRedLineY + (canvasHeight - previousRedLineY) / 2 // Mid-point of available space
					: canvasHeight / 2; // Mid-point of full canvas for first segment
			setRedLineY(defaultY);
		} else {
			// If exiting red line placement, clear the overlay
			if (overlayContextRef.current) {
				overlayContextRef.current.clearRect(
					0,
					0,
					canvasWidth,
					canvasHeight
				);
			}
		}
	}, [
		hasDrawnSomething,
		isPlacingRedLine,
		previousRedLineY,
		canvasWidth,
		canvasHeight,
		currentSegmentIndex,
		TOTAL_SEGMENTS,
	]);

	const getDrawingDataUrl = useCallback(() => {
		// Return the full content of the drawing canvas
		return drawingCanvasRef.current
			? drawingCanvasRef.current.toDataURL('image/png')
			: null;
	}, []);

	return {
		drawingCanvasRef,
		overlayCanvasRef,
		isDrawing,
		hasDrawnSomething,
		isPlacingRedLine,
		redLineY,
		startDrawing: useCallback(
			(e) => {
				if (!canDraw || isPlacingRedLine) return; // Cannot draw if placing line
				const canvas = drawingCanvasRef.current;
				if (!canvas) return;
				const { x, y } = getEventCoords(canvas, e);
				setIsDrawing(true);
				setHasDrawnSomething(true);
				drawingContextRef.current.beginPath();
				drawingContextRef.current.moveTo(x, y);
				setLastX(x);
				setLastY(y);
			},
			[canDraw, isPlacingRedLine]
		),
		draw: useCallback(
			(e) => {
				if (!isDrawing || !canDraw || isPlacingRedLine) return; // Cannot draw if placing line
				const canvas = drawingCanvasRef.current;
				if (!canvas) return;
				const { x, y } = getEventCoords(canvas, e);
				drawingContextRef.current.lineTo(x, y);
				drawingContextRef.current.stroke();
				setLastX(x);
				setLastY(y);
			},
			[isDrawing, canDraw, isPlacingRedLine]
		),
		stopDrawing: useCallback(() => {
			if (isDrawing) {
				drawingContextRef.current.closePath();
				setIsDrawing(false);
			}
		}, [isDrawing]),
		clearDrawingCanvas,
		toggleRedLinePlacement,
		getDrawingDataUrl,
	};
}
