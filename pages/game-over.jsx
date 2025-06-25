export default function GameOver({
	finalArtwork,
	finalArtwork2,
	handlePlayAgain,
	dynamicCanvasWidth, // New prop
	dynamicCanvasHeight, // New prop
}) {
	return (
		<div className="text-center mt-5">
			<h2 className="text-4xl font-extrabold text-purple-700 my-4 animate-bounce">
				Game Over!
			</h2>
			<div className="flex flex-col items-center space-y-8 mb-8">
				{finalArtwork && (
					<img
						src={finalArtwork}
						alt="Final Combined Artwork 1"
						className="bg-white border-4 border-purple-500 rounded-xl shadow-2xl block"
						style={{
							width: dynamicCanvasWidth,
							height: dynamicCanvasHeight,
							objectFit: 'contain', // Ensures the image fits within the bounds without stretching
						}}
					/>
				)}
				{finalArtwork2 && (
					<img
						src={finalArtwork2}
						alt="Final Combined Artwork 2"
						className="bg-white border-4 border-purple-500 rounded-xl shadow-2xl block"
						style={{
							width: dynamicCanvasWidth,
							height: dynamicCanvasHeight,
							objectFit: 'contain',
						}}
					/>
				)}
			</div>
			<button
				onClick={handlePlayAgain}
				className="px-8 py-4 text-xl font-bold rounded-lg bg-blue-600 text-white shadow-lg hover:bg-blue-700 transition-colors transform hover:scale-105"
			>
				Play Again
			</button>
		</div>
	);
}
