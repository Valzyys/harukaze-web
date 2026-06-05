// Endpoint untuk mendapatkan Mux live streams
app.get("/api/mux/live-streams", async (req, res) => {
  try {
    // Get Mux credentials from environment variables
    const MUX_TOKEN_ID = process.env.MUX_TOKEN_ID;
    const MUX_TOKEN_SECRET = process.env.MUX_TOKEN_SECRET;

    if (!MUX_TOKEN_ID || !MUX_TOKEN_SECRET) {
      return res.status(500).json({
        error: "Mux credentials not configured",
        message:
          "Please set MUX_TOKEN_ID and MUX_TOKEN_SECRET in environment variables",
      });
    }

    // Create Basic Auth header
    const authHeader =
      "Basic " +
      Buffer.from(`${MUX_TOKEN_ID}:${MUX_TOKEN_SECRET}`).toString("base64");

    const response = await fetch("https://api.mux.com/video/v1/live-streams", {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: authHeader,
      },
    });

    if (!response.ok) {
      const errorData = await response.text();
      console.error("Mux API error:", errorData);
      return res.status(response.status).json({
        error: "Mux API request failed",
        status: response.status,
        message: errorData,
      });
    }

    const data = await response.json();

    // Add CORS headers
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    // Return the data
    return res.status(200).json({
      success: true,
      data: data,
    });
  } catch (error) {
    console.error("Error fetching Mux live streams:", error);
    return res.status(500).json({
      success: false,
      error: "Internal server error",
      message: error.message,
    });
  }
});

export default app;

// ==========================================
// Environment Variables Setup (Vercel):
// ==========================================
// 1. Go to your Vercel project settings
// 2. Navigate to "Environment Variables"
// 3. Add these variables:
//    - MUX_TOKEN_ID: 17e2da50-09b2-455a-84ec-1f73fe23d28e
//    - MUX_TOKEN_SECRET: uwSUIK05zK81OjfV6mGRyl21EA8rgHdU9ZZe3YdE4Gn37/G48svDGwzb7ASt63fAXAb+lBSaob0
//
// After deployment, your endpoint will be:
// https://your-domain.vercel.app/api/mux/live-streams
