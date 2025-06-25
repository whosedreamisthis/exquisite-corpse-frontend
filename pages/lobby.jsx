// lobby.jsx
export default function Lobby({
	message,
	gameCode,
	setGameCode,
	createNewGame,
	joinExistingGame,
}) {
	return (
		<div className="mx-4 sm:mx-8 w-full flex flex-col items-center">
			{' '}
			{/* Outer wrapper for consistent margin */}
			{/* The main lobby content container (formerly the direct child of the fragment) */}
			<h1 className="text-5xl font-extrabold text-purple-800 mb-6 drop-shadow-lg text-center">
				Exquisite Corpse Game
			</h1>
			<div className="bg-white p-8 rounded-2xl shadow-xl max-w-md w-full text-center space-y-6">
				{' '}
				{/* Removed mx-4/sm:mx-8 here */}
				<h2 className="text-2xl font-semibold text-gray-800 mb-4">
					Welcome!
				</h2>
				<div className="space-y-4">
					<button
						onClick={createNewGame}
						className="w-full p-3 border border-gray-300 rounded-lg text-lg focus:ring-purple-500 focus:border-purple-500"
					>
						Create New Game
					</button>
					<div className="relative flex items-center py-2">
						<div className="flex-grow border-t border-gray-300"></div>
						<span className="flex-shrink mx-4 text-gray-500 text-lg">
							OR
						</span>
						<div className="flex-grow border-t border-gray-300"></div>
					</div>
					<input
						type="text"
						placeholder="Enter Game Code to Join"
						value={gameCode}
						onChange={(e) =>
							setGameCode(e.target.value.toUpperCase())
						}
						className="w-full p-3 border border-gray-300 rounded-lg text-lg focus:ring-purple-500 focus:border-purple-500 uppercase"
						maxLength={6}
					/>
					<button
						onClick={joinExistingGame}
						className="w-full bg-indigo-600 text-white py-3 rounded-lg text-xl font-bold hover:bg-indigo-700 transition-colors shadow-md"
					>
						Join Existing Game
					</button>
				</div>
				<p className="text-red-500 text-md mt-4">{message}</p>
			</div>
		</div>
	);
}
