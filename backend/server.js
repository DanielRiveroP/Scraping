const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { scrapBusinessData } = require('./scraper');
const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

const RESENAS_PATH = path.join(__dirname, 'resenas.json');

function readResenasStore() {
    try {
        const raw = fs.readFileSync(RESENAS_PATH, 'utf8');
        return JSON.parse(raw || '{}');
    } catch (e) {
        return {};
    }
}

function writeResenasStore(obj) {
    try {
        fs.writeFileSync(RESENAS_PATH, JSON.stringify(obj, null, 2), 'utf8');
        return true;
    } catch (e) {
        console.error('❌ Error escribiendo resenas.json:', e.message);
        return false;
    }
}

app.post('/api/scrape', async (req, res) => {
        const { companyName } = req.body || {};
        if (!companyName || typeof companyName !== 'string') {
            return res.status(400).json({ error: 'companyName es requerido' });
        }

        console.log('📥 Recibido:', companyName);

        try {
                console.log('🔄 Iniciando scraping de Google Maps...');
                const datos = await scrapBusinessData(companyName);

                // Adjuntar reseñas guardadas por el usuario (si existen)
                const store = readResenasStore();
                const saved = store[companyName] || [];
                datos.resenas = Array.isArray(datos.resenas) ? datos.resenas.concat(saved) : saved;
                datos._resenaCount = datos.resenas.length;

                console.log('📤 Datos extraídos correctamente');
                res.json(datos);
        } catch (error) {
                console.error('❌ Error en el servidor:', error && error.message ? error.message : error);
                res.status(500).json({
                        error: 'Error al hacer scraping: ' + (error && error.message ? error.message : 'desconocido')
                });
        }
});

app.post('/api/add-resena', (req, res) => {
    const { companyName, autor, puntuacion, texto } = req.body || {};
    if (!companyName || !autor || !texto || typeof puntuacion !== 'number') {
        return res.status(400).json({ error: 'companyName, autor, puntuacion (number) y texto son requeridos' });
    }

    const store = readResenasStore();
    store[companyName] = store[companyName] || [];
    store[companyName].unshift({ autor, puntuacion, fecha: 'Ahora', texto });
    const ok = writeResenasStore(store);
    if (!ok) return res.status(500).json({ error: 'No se pudo guardar la reseña' });
    res.json({ ok: true });
});

app.get('/api/resenas/:empresa', (req, res) => {
    const empresa = decodeURIComponent(req.params.empresa || '');
    const store = readResenasStore();
    res.json({ resenas: store[empresa] || [] });
});

app.listen(PORT, () => {
        console.log(`✅ Servidor: http://localhost:${PORT}`);
});