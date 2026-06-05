// endpoint untuk mencari destinasi
app.get('/api/rajaongkir/destination', async (req, res) => {
  try {
    const { search, limit = 10, offset = 0 } = req.query;
    
    const response = await fetch(
      `https://rajaongkir.komerce.id/api/v1/destination/domestic-destination?search=${encodeURIComponent(search)}&limit=${limit}&offset=${offset}`,
      {
        headers: {
          'key': 'h9wQ46icebd23e99942bf7cdHdGEelYR'
        }
      }
    );

    const result = await response.json();
    
    if (result.meta.code === 200) {
      res.json({
        success: true,
        data: result.data
      });
    } else {
      res.status(400).json({
        success: false,
        message: result.meta.message
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching destination data'
    });
  }
});
