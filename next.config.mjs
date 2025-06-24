/** @type {import('next').NextConfig} */
const nextConfig = {
	// This is crucial for static HTML export, required by GitHub Pages
	output: 'export',

	// Set the basePath to your GitHub repository name.
	// For example, if your repository is named 'my-exquisite-corpse-game',
	// this should be '/my-exquisite-corpse-game'.
	basePath: '/exquisite-corpse-frontend', // <<< IMPORTANT: Replace with your actual repository name

	// If you are using next/image, unoptimized: true is recommended for static exports
	images: {
		unoptimized: true,
	},

	// Add any other existing Next.js configurations here
};
export default nextConfig;
