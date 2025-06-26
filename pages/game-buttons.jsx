export default function GameButtons({
	handleUndo, // NEW prop for undo
	handleRedo, // NEW prop for redo
	isGameOver,
	canDrawOrPlaceLine,
	handleDoneDrawing,
	isLastSegment,
	canSubmitSegment,
	submitSegment,
	isPlacingRedLine,
	isWaitingForOtherPlayers,
	hasDrawnSomething,
	isDrawing,
	hasUndoneStrokes,
}) {
	return (
		<div className="game-buttons-container">
			{/* Undo Button */}
			<button
				onClick={handleUndo}
				className={`px-2 py-2 text-sm font-bold rounded-lg transition-all duration-300 ease-in-out transform hover:scale-105 flex items-center justify-center
                                ${
									canDrawOrPlaceLine &&
									!isGameOver &&
									hasDrawnSomething &&
									!isPlacingRedLine &&
									!isDrawing
										? 'bg-orange-500 text-white shadow-lg hover:bg-orange-600'
										: 'bg-gray-400 cursor-not-allowed shadow-inner'
								}`}
				disabled={
					!canDrawOrPlaceLine ||
					isGameOver ||
					!hasDrawnSomething ||
					isPlacingRedLine ||
					isDrawing
				}
				title="Undo Last Stroke"
			>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					fill="none"
					viewBox="0 0 24 24"
					strokeWidth={2.5}
					stroke="currentColor"
					className="w-7 h-7"
				>
					<path
						strokeLinecap="round"
						strokeLinejoin="round"
						d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3"
					/>
				</svg>
				<span className="sr-only">Undo</span>
			</button>

			{/* Redo Button */}
			<button
				onClick={handleRedo}
				className={`px-2 py-2 text-sm font-bold rounded-lg transition-all duration-300 ease-in-out transform hover:scale-105 flex items-center justify-center
                                ${
									canDrawOrPlaceLine &&
									!isGameOver &&
									hasUndoneStrokes &&
									!isPlacingRedLine &&
									!isDrawing
										? 'bg-purple-500 text-white shadow-lg hover:bg-purple-600'
										: 'bg-gray-400 cursor-not-allowed shadow-inner'
								}`}
				disabled={
					!canDrawOrPlaceLine ||
					isGameOver ||
					!hasUndoneStrokes ||
					isPlacingRedLine ||
					isDrawing
				} // Redo should be enabled if there's something to redo
				title="Redo Last Undone Stroke"
			>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					fill="none"
					viewBox="0 0 24 24"
					strokeWidth={2.5}
					stroke="currentColor"
					className="w-7 h-7"
				>
					<path
						strokeLinecap="round"
						strokeLinejoin="round"
						d="M15 9l6 6m0 0l-6 6m6-6H9a6 6 0 010-12h3"
					/>
				</svg>
				<span className="sr-only">Redo</span>
			</button>

			{/* Conditionally show Done Drawing or Submit Segment button */}
			{!isLastSegment &&
				!isPlacingRedLine && ( // Show "Done Drawing" if not last segment and not placing line
					<button
						onClick={handleDoneDrawing}
						className={`px-2 py-2 text-lg font-bold rounded-lg transition-all duration-300 ease-in-out transform hover:scale-105 flex items-center justify-center
                                        ${
											canDrawOrPlaceLine &&
											!isWaitingForOtherPlayers &&
											!isGameOver &&
											hasDrawnSomething &&
											!isDrawing // Enabled if player can act, isn't waiting, isn't over, has drawn, and isn't actively drawing
												? 'bg-blue-600 text-white shadow-lg hover:bg-blue-700'
												: 'bg-gray-400 cursor-not-allowed shadow-inner'
										}`}
						disabled={
							!canDrawOrPlaceLine ||
							isWaitingForOtherPlayers ||
							isGameOver ||
							!hasDrawnSomething ||
							isDrawing
						} // Disabled if conditions not met
						title="Done Drawing" // Add a title for accessibility
					>
						<svg
							xmlns="http://www.w3.org/2000/svg"
							fill="none"
							viewBox="0 0 24 24"
							strokeWidth={2.5}
							stroke="currentColor"
							className="w-7 h-7"
						>
							<path
								strokeLinecap="round"
								strokeLinejoin="round"
								d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
							/>
						</svg>
						<span className="sr-only">Done Drawing</span>{' '}
						{/* For screen readers */}
					</button>
				)}
			{(isPlacingRedLine || isLastSegment) && ( // Show "Submit Segment" if in line placing mode OR if it's the last segment
				<button
					onClick={submitSegment}
					className={`px-3 py-3 text-lg font-bold rounded-lg transition-all duration-300 ease-in-out transform hover:scale-105 flex items-center justify-center
                                        ${
											canSubmitSegment
												? 'bg-green-600 text-white shadow-lg hover:bg-green-700'
												: 'bg-gray-400 cursor-not-allowed shadow-inner'
										}`}
					disabled={!canSubmitSegment}
					title={
						isLastSegment
							? 'Submit Final Artwork'
							: 'Submit Segment'
					} // Dynamic title
				>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						fill="none"
						viewBox="0 0 24 24"
						strokeWidth={2.5}
						stroke="currentColor"
						className="w-7 h-7"
					>
						{isLastSegment ? (
							<path
								strokeLinecap="round"
								strokeLinejoin="round"
								d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
							/> // Checkmark for final submit
						) : (
							<path
								strokeLinecap="round"
								strokeLinejoin="round"
								d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5"
							/> // Send icon for segment
						)}
					</svg>
					<span className="sr-only">
						{isLastSegment
							? 'Submit Final Artwork'
							: 'Submit Segment'}
					</span>
				</button>
			)}
		</div>
	);
}
