// DrawingCanvas.jsx
import React, { useEffect, useRef, useCallback } from 'react';
import { CANVAS_WIDTH, CANVAS_HEIGHT } from './Constants'; // Import constants

export default function DrawingCanvas({
	drawingCanvasRef,
	drawingContextRef,
	overlayCanvasRef,
	overlayContextRef,
	isDrawing,
	setIsDrawing,
	lastX,
	setLastX,
	lastY,
	setLastY,
	redLineY,
	setRedLineY,
	currentSegmentIndex,
	segmentHeight,
	peekHeight,
	previousDrawing,
	previousRedLineY,
	canDrawOrPlaceLine,
	setHasDrawnSomething,
	isPlacingRedLine,
	setIsPlacingRedLine,
}) {
	// Initialize contexts when canvases are available
	useEffect(() => {
		const drawingCanvas = drawingCanvasRef.current;
		const overlayCanvas = overlayCanvasRef.current;

		if (drawingCanvas) {
			drawingContextRef.current = drawingCanvas.getContext('2d');
			drawingContextRef.current.lineCap = 'round';
			drawingContextRef.current.strokeStyle = 'black';
			drawingContextRef.current.lineWidth = 2;
		}
		if (overlayCanvas) {
			overlayContextRef.current = overlayCanvas.getContext('2d');
		}
	}, [
		drawingCanvasRef,
		drawingContextRef,
		overlayCanvasRef,
		overlayContextRef,
	]);

	// Redraw previous segment and red line when `previousDrawing` changes
	useEffect(() => {
		const drawingCanvas = drawingCanvasRef.current;
		const drawingCtx = drawingContextRef.current;
		const overlayCtx = overlayContextRef.current;

		if (!drawingCtx || !overlayCtx || !drawingCanvas) return;

		// Clear canvases
		drawingCtx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
		overlayCtx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

		// Draw previous drawing if it exists
		if (previousDrawing) {
			const img = new Image();
			img.src = previousDrawing;
			img.onload = () => {
				drawingCtx.drawImage(img, 0, 0);
				// Draw the red peek line if it exists
				if (previousRedLineY !== null) {
					overlayCtx.beginPath();
					overlayCtx.moveTo(0, previousRedLineY);
					overlayCtx.lineTo(CANVAS_WIDTH, previousRedLineY);
					overlayCtx.strokeStyle = 'red';
					overlayCtx.lineWidth = 2;
					overlayCtx.stroke();
				}
			};
		}
	}, [
		previousDrawing,
		previousRedLineY,
		drawingCanvasRef,
		drawingContextRef,
		overlayContextRef,
	]);

	// Drawing functions (start, draw, end)
	const startDrawing = useCallback(
		(e) => {
			if (!canDrawOrPlaceLine || isPlacingRedLine) return; // Prevent drawing if placing line
			setIsDrawing(true);
			setHasDrawnSomething(true);
			const { offsetX, offsetY } = e.nativeEvent;
			setLastX(offsetX);
			setLastY(offsetY);
		},
		[
			canDrawOrPlaceLine,
			isPlacingRedLine,
			setIsDrawing,
			setHasDrawnSomething,
			setLastX,
			setLastY,
		]
	);

	const draw = useCallback(
		(e) => {
			if (!isDrawing || isPlacingRedLine) return;
			const { offsetX, offsetY } = e.nativeEvent;
			const drawingCtx = drawingContextRef.current;

			if (drawingCtx) {
				drawingCtx.beginPath();
				drawingCtx.moveTo(lastX, lastY);
				drawingCtx.lineTo(offsetX, offsetY);
				drawingCtx.stroke();
				setLastX(offsetX);
				setLastY(offsetY);
			}
		},
		[
			isDrawing,
			isPlacingRedLine,
			lastX,
			lastY,
			drawingContextRef,
			setLastX,
			setLastY,
		]
	);

	const endDrawing = useCallback(() => {
		setIsDrawing(false);
	}, [setIsDrawing]);

	// Red Line placement functions
	const handleOverlayMouseDown = useCallback(
		(e) => {
			if (canDrawOrPlaceLine && currentSegmentIndex < 3) {
				// Only allow red line for first 3 segments
				setIsPlacingRedLine(true);
				setRedLineY(e.nativeEvent.offsetY);
			}
		},
		[
			canDrawOrPlaceLine,
			currentSegmentIndex,
			setIsPlacingRedLine,
			setRedLineY,
		]
	);

	const handleOverlayMouseMove = useCallback(
		(e) => {
			if (isPlacingRedLine) {
				setRedLineY(e.nativeEvent.offsetY);
				const overlayCtx = overlayContextRef.current;
				overlayCtx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT); // Clear previous line
				overlayCtx.beginPath();
				overlayCtx.moveTo(0, e.nativeEvent.offsetY);
				overlayCtx.lineTo(CANVAS_WIDTH, e.nativeEvent.offsetY);
				overlayCtx.strokeStyle = 'red';
				overlayCtx.lineWidth = 2;
				overlayCtx.stroke();
			}
		},
		[isPlacingRedLine, overlayContextRef, setRedLineY]
	);

	const handleOverlayMouseUp = useCallback(() => {
		if (isPlacingRedLine) {
			setIsPlacingRedLine(false);
			// The redLineY state is already updated by mouseMove, no need to do anything here
		}
	}, [isPlacingRedLine, setIsPlacingRedLine]);

	return (
		<div className="relative">
			{/* Drawing Canvas */}
			<canvas
				ref={drawingCanvasRef}
				width={CANVAS_WIDTH}
				height={CANVAS_HEIGHT}
				onMouseDown={startDrawing}
				onMouseMove={draw}
				onMouseUp={endDrawing}
				onMouseOut={endDrawing}
				className="border-2 border-gray-600 rounded-lg shadow-lg bg-white relative z-10"
			></canvas>

			{/* Overlay Canvas for Red Line (on top of drawing canvas) */}
			<canvas
				ref={overlayCanvasRef}
				width={CANVAS_WIDTH}
				height={CANVAS_HEIGHT}
				onMouseDown={handleOverlayMouseDown}
				onMouseMove={handleOverlayMouseMove}
				onMouseUp={handleOverlayMouseUp}
				onMouseOut={handleOverlayMouseUp} // End red line placement if mouse leaves
				className="absolute top-0 left-0 z-20"
				style={{
					cursor: isPlacingRedLine
						? 'grabbing'
						: canDrawOrPlaceLine && currentSegmentIndex < 3
						? 'crosshair'
						: 'default',
				}}
			></canvas>
		</div>
	);
}
