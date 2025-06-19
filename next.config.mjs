/** @type {import('next').NextConfig} */
const nextConfig = {
	output: 'export', // Ensures a static export
	basePath: '/exquisite-corpse-frontend', // <--- IMPORTANT: This is your repository name
	assetPrefix: '/exquisite-corpse-frontend/', // <--- IMPORTANT: Also needed for assets
	images: {
		unoptimized: true, // Optional: Improves static export compatibility for images
	},
};

export default nextConfig;
