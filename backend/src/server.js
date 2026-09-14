require("dotenv").config();
const app = require("./app");
const db = require("./config/database");
const seedAdmin = require("./utils/seedAdmin");
const repairLegacySeedData = require("./utils/repairLegacySeedData");

const PORT = 5000;  // Fixed port — do not change without updating frontend .env.local and CORS_ORIGIN

async function start() {
  try {
    await db.query("SELECT NOW()");
    console.log("✅ Database connected");

    // AUTO CREATE ADMIN
    await seedAdmin();
    await repairLegacySeedData();

  } catch (err) {
    console.error("❌ Database connection failed:", err.message);
    process.exit(1);
  }

  app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
  });
}

start();
