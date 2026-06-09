/**
 * Application Configuration
 */

// Base URL for backend API calls. Points to VITE_API_URL (e.g. Render backend URL) if defined.
// Defaults to empty string (same origin) for local dev proxy and Vercel serverless modes.
const defaultApiUrl = "https://wa-fort-cb.onrender.com";
export const API_URL = ((import.meta as any).env.VITE_API_URL || defaultApiUrl).replace(/\/$/, "");
