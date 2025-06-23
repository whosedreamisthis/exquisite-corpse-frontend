// GameConfig.js

// WebSocket URL for your backend
export const WS_URL = 'ws://localhost:8080';

// Game-related constants
export const TOTAL_SEGMENTS = 4;
export const segments = ['Head', 'Torso', 'Legs', 'Feet'];
export const MAX_PLAYERS = 2; // Consistent with backend
export const PEEK_HEIGHT = 20; // Consistent with backend stitching logic

// Default canvas dimensions for SSR. Will be updated client-side.
export const DEFAULT_CANVAS_WIDTH = 800;
export const DEFAULT_CANVAS_HEIGHT = 600;
