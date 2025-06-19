/** @type {import('next').NextConfig} */
const nextConfig = {
	output: 'export', // THIS IS CRUCIAL for static HTML export to GitHub Pages
	images: {
		unoptimized: true, // Required if you use Next.js Image component with static export
	},
	// IMPORTANT: If your GitHub Pages URL will be like 'yourusername.github.io/your-repo-name/'
	// you MUST uncomment and set basePath and assetPrefix to your repository name.
	// If it's 'yourusername.github.io/' (a user/org page), you do NOT need these.
	// basePath: '/your-repo-name', // Example: If your repo is 'exquisite-corpse-frontend'
	// assetPrefix: '/your-repo-name/', // Example: If your repo is 'exquisite-corpse-frontend'
};

export default nextConfig;
