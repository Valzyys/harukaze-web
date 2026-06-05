// endpoint untuk menghitung ongkir
app.post('/api/rajaongkir/cost', async (req, res) => {
  try {
    const { origin, destination, weight, courier, price } = req.body;
    
    const formData = new URLSearchParams();
    formData.append('origin', origin);
    formData.append('destination', destination);
    formData.append('weight', weight);
    formData.append('courier', courier);
    formData.append('price', price);

    const response = await fetch(
      'https://rajaongkir.komerce.id/api/v1/calculate/domestic-cost',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'key': 'hWqTkgElebd23e99942bf7cdFcmovLVf'
        },
        body: formData
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
      message: 'Error calculating shipping cost'
    });
  }
});
