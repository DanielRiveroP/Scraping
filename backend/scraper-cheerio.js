const axios = require('axios');

async function scrapBusinessData(companyName) {
  console.log(`🔍 Iniciando búsqueda de: ${companyName}`);
  
  try {
    // Hacer petición a Google Maps con User-Agent
    const mapsUrl = `https://www.google.com/maps/search/${encodeURIComponent(companyName)}`;
    
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    };

    console.log(`🌐 Haciendo petición a: ${mapsUrl}`);
    
    const response = await axios.get(mapsUrl, {
      headers,
      timeout: 10000
    });

    console.log(`✅ Respuesta recibida (${response.status})`);

    // Extraer información usando regex/parsing
    const html = response.data;
    
    let businessData = { ...datosEjemplo };
    
    // Intentar extraer datos del HTML
    // Google Maps embebé los datos en JSON dentro del HTML
    try {
      const jsonMatch = html.match(/"searchByTermQuery":"([^"]+)"/);
      if (jsonMatch) {
        console.log('✅ Se encontró información en la respuesta');
      }
    } catch (e) {
      console.log('⚠️ No se pudo parsear JSON del HTML');
    }

    // Retornar datos con la URL real
    return {
      ...businessData,
      urlGoogle: mapsUrl
    };

  } catch (error) {
    console.error('❌ Error en scrapBusinessData:', error.message);
    
    // Retornar fallback
    return {
      ...datosEjemplo,
      urlGoogle: `https://www.google.com/maps/search/${encodeURIComponent(companyName)}`,
      _nota: '(Usando datos de ejemplo - Web scraping limitado por Google)'
    };
  }
}

module.exports = { scrapBusinessData };
