import dotenv from "dotenv";
import app from "./api/index";

// Load environment variables
dotenv.config();

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

// Start the standalone Express backend server
async function startServer() {
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[WA Fort Billing Server] running at http://localhost:${PORT}`);
  });
}

startServer();
