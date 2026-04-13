const express = require('express');
const cors = require('cors');
const { scrapBusinessData } = require('./scraper');
const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

app.post('/api/scrape', async (req, res) => {
    const { companyName } = req.body;
    
    console.log('📥 Recibido:', companyName);
    
    try {
        console.log('🔄 Iniciando scraping de Google Maps...');
        const datos = await scrapBusinessData(companyName);
        console.log('📤 Datos extraídos correctamente');
        res.json(datos);
    } catch (error) {
        console.error('❌ Error en el servidor:', error.message);
        res.status(500).json({
            error: 'Error al hacer scraping: ' + error.message
        });
    }
});

app.listen(PORT, () => {
    console.log(`✅ Servidor: http://localhost:3000`);
});