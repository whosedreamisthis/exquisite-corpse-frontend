/** @type {import('next').NextConfig} */
const nextConfig = {
	output: 'export', // Ensures a static export
	basePath: '/exquisite-corpse-frontend-v2', // <--- IMPORTANT: This is your repository name
	// assetPrefix: '/exquisite-corpse-frontend-v2/', // <--- IMPORTANT: Also needed for assets
	images: {
		unoptimized: true, // Optional: Improves static export compatibility for images
	},
};

export default nextConfig;
