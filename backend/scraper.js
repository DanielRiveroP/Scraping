const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

function getBusinessBaseData(companyName) {
  try {
    const dataPath = path.join(__dirname, 'businessData.json');
    const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
    return data[companyName] || null;
  } catch (e) {
    console.log('⚠️ No se pudo cargar businessData.json');
    return null;
  }
}
async function scrapBusinessData(companyName) {
  console.log(`🔍 Iniciando extracción de datos de: ${companyName}`);
  
  let baseData = getBusinessBaseData(companyName);

  const mapsUrl = `https://www.google.com/maps/search/${encodeURIComponent(companyName)}`;

  // Si no tenemos datos locales, inicializamos una base mínima y dejamos que el scraping los complete.
  if (!baseData) {
    console.log('⚠️ Datos no encontrados en base local, inicializando base mínima');
    baseData = {
      nombre: companyName,
      puntuacion: 'No disponible',
      numeroResenas: '0',
      horario: 'No disponible',
      telefono: 'No disponible',
      sitioWeb: 'No disponible'
    };
  }

  console.log(`✅ Datos base preparados: ${baseData.nombre} | ${baseData.puntuacion} ★ | ${baseData.numeroResenas}`);

  
  
  let resenas = [];
  let browser;
  
  try {
    browser = await puppeteer.launch({
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--disable-blink-features=AutomationControlled'
      ]
    });

    const page = await browser.newPage();
    
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => false });
    });

    await page.setDefaultNavigationTimeout(60000);
    await page.setViewport({ width: 1440, height: 900 });
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );

    console.log(`🌐 Navegando a Google Maps...`);
    
    try {
      await page.goto(mapsUrl, { waitUntil: 'load', timeout: 45000 });
    } catch (e) {
      console.log('⚠️ Timeout inicial, continuando');
    }

    await wait(4000);

    try {
      await page.evaluate(() => {
        const buttons = document.querySelectorAll('button');
        for (let btn of buttons) {
          if (btn.textContent.toLowerCase().includes('aceptar')) btn.click();
        }
      });
      await wait(1500);
    } catch (e) {}

    // Intentar localizar la página del lugar (place page) y navegar a ella para obtener datos estructurados
    try {
      const placeHref = await page.evaluate(() => {
        const anchors = Array.from(document.querySelectorAll('a'));
        for (let a of anchors) {
          const h = a.href || '';
          if (h.includes('/place/') || h.includes('/maps/place') || h.includes('maps?cid=')) return h;
        }
        // fallback: elementos con data-result-index o links dentro de result cards
        const cardLink = document.querySelector('[data-result-index] a');
        if (cardLink && cardLink.href) return cardLink.href;
        return null;
      });

      if (placeHref) {
        console.log('🔗 Found place link, navegando a la página del lugar...');
        try {
          await page.goto(placeHref, { waitUntil: 'networkidle2', timeout: 45000 });
          await wait(2500);
        } catch (e) {
          console.log('⚠️ Timeout al navegar a placeHref, intentando click en elemento');
          try {
            await page.evaluate((h) => { const a = Array.from(document.querySelectorAll('a')).find(x => x.href===h); if(a) a.click(); }, placeHref);
            await wait(3000);
          } catch (e) {}
        }
      } else {
        console.log('⚠️ No se encontró enlace directo al lugar, intentando abrir primer resultado');
        try {
          await page.evaluate(() => {
            const items = document.querySelectorAll('[data-item-id]');
            if (items.length > 0) items[0].click();
          });
          await wait(3000);
        } catch (e) {}
      }
    } catch (e) {
      console.log('⚠️ Error intentando navegar a place page:', e && e.message ? e.message : e);
    }

    // Extraer datos base desde JSON-LD si está disponible o mediante heurísticas en DOM
    try {
      const extracted = await page.evaluate(() => {
        function safeText(el) { return el ? el.innerText.trim() : null; }

        // 1) Buscar JSON-LD
        const scripts = Array.from(document.querySelectorAll('script[type="application/ld+json"]'));
        for (let s of scripts) {
          try {
            const j = JSON.parse(s.innerText);
            if (j && (j['@type'] === 'LocalBusiness' || j['@type'] === 'Organization' || j.name)) {
              const nombre = j.name || null;
              const telefono = j.telephone || null;
              const sitioWeb = j.url || j.sameAs || null;
              const rating = j.aggregateRating && j.aggregateRating.ratingValue ? String(j.aggregateRating.ratingValue) : null;
              const reviewCount = j.aggregateRating && j.aggregateRating.reviewCount ? String(j.aggregateRating.reviewCount) : null;
              const horario = j.hasOwnProperty('openingHours') ? (Array.isArray(j.openingHours) ? j.openingHours.join('; ') : j.openingHours) : null;
              return { nombre, telefono, sitioWeb, puntuacion: rating, numeroResenas: reviewCount, horario };
            }
          } catch (e) {}
        }

        // 2) Heurísticas DOM
        const nombreEl = document.querySelector('h1') || document.querySelector('[role="heading"]');
        const nombre = safeText(nombreEl) || null;

        // rating: buscar elementos con aria-label que contengan 'estrellas' o 'rating'
        let puntuacion = null;
        const ratingEl = Array.from(document.querySelectorAll('[aria-label]')).find(e => /\d(\.\d)?\s*(estrella|estrellas|star|stars|rating)/i.test(e.getAttribute('aria-label')));
        if (ratingEl) {
          const m = ratingEl.getAttribute('aria-label').match(/(\d+(?:[\.,]\d+)?)/);
          if (m) puntuacion = m[1].replace(',', '.');
        }

        // review count
        let numeroResenas = null;
        const rcEl = Array.from(document.querySelectorAll('button, span, div')).find(e => /\d[\d\.\,]*\s*(reseñ|review|opin)/i.test(safeText(e)));
        if (rcEl) {
          const m = safeText(rcEl).match(/(\d[\d\.\,]*)/);
          if (m) numeroResenas = m[1].replace('.', '').replace(',', '');
        }

        // telefono: buscar patterns de teléfono
        let telefono = null;
        const phoneRegex = /\+?\d[\d\s\-()]{6,}\d/;
        const texts = Array.from(document.querySelectorAll('span, div, a, button')).map(n => n.innerText || '').filter(Boolean);
        for (let t of texts) {
          const m = t.match(phoneRegex);
          if (m) { telefono = m[0]; break; }
        }

        // sitio web: anchor con href http que no sea maps.google
        let sitioWeb = null;
        const anchors = Array.from(document.querySelectorAll('a')).map(a => a.href).filter(Boolean);
        for (let h of anchors) {
          if (/^https?:\/\//.test(h) && !h.includes('google.com/maps') && !h.includes('/search?')) { sitioWeb = h; break; }
        }

        // horario: buscar texto con 'Horario' o 'Abierto'
        let horario = null;
        const horarioEl = Array.from(document.querySelectorAll('div, span')).find(e => /Horario|Abierto|Cierra|Abre/i.test(safeText(e)));
        if (horarioEl) horario = safeText(horarioEl);

        return { nombre, telefono, sitioWeb, puntuacion, numeroResenas, horario };
      });

      // Merge extracted into baseData when available
      if (extracted) {
        baseData.nombre = baseData.nombre || extracted.nombre || baseData.nombre;
        baseData.telefono = baseData.telefono && baseData.telefono !== 'No disponible' ? baseData.telefono : (extracted.telefono || baseData.telefono);
        baseData.sitioWeb = baseData.sitioWeb && baseData.sitioWeb !== 'No disponible' ? baseData.sitioWeb : (extracted.sitioWeb || baseData.sitioWeb);
        baseData.puntuacion = baseData.puntuacion && baseData.puntuacion !== 'No disponible' ? baseData.puntuacion : (extracted.puntuacion || baseData.puntuacion);
        baseData.numeroResenas = baseData.numeroResenas && baseData.numeroResenas !== '0' ? baseData.numeroResenas : (extracted.numeroResenas || baseData.numeroResenas);
        baseData.horario = baseData.horario && baseData.horario !== 'No disponible' ? baseData.horario : (extracted.horario || baseData.horario);
      }
      console.log('ℹ️ Datos base extraídos desde la página (scraping):', { nombre: baseData.nombre, puntuacion: baseData.puntuacion, numeroResenas: baseData.numeroResenas });
    } catch (e) {
      console.log('⚠️ Error extrayendo datos base desde la página:', e && e.message ? e.message : e);
    }

    // Sanitizar campos que pueden contener mucho texto o HTML embebido
    try {
      if (baseData.horario && typeof baseData.horario === 'string') {
        // Mantener solo la primera sección relevante y acortar
        let h = baseData.horario.replace(/\s+/g, ' ').trim();
        if (h.length > 200) {
          // intentar recortar entre 'Abierto' y 'Fotos' si existe
          const start = h.indexOf('Abierto');
          const fotos = h.indexOf('Fotos');
          if (start !== -1 && fotos !== -1 && fotos > start) {
            h = h.substring(start, Math.min(fotos, start + 200));
          } else {
            h = h.substring(0, 200);
          }
        }
        baseData.horario = h;
      }

      if (baseData.sitioWeb && typeof baseData.sitioWeb === 'string') {
        // evitar enlaces que apunten a políticas de Google
        if (/support\.google\.com|maps\.google\.com/.test(baseData.sitioWeb)) baseData.sitioWeb = 'No disponible';
      }
    } catch (e) {}

    // Abrir el listado completo de reseñas si existe el botón "Más reseñas"
    try {
      await page.evaluate(() => {
        const candidates = Array.from(document.querySelectorAll('button, a, span[role="button"]'));
        const moreReviews = candidates.find(el => {
          const txt = (el.textContent || '').toLowerCase();
          return txt.includes('más reseñas') || txt.includes('more reviews');
        });
        if (moreReviews) moreReviews.click();
      });
      await wait(1800);
    } catch (e) {}

    // Abrir la pestaña de reseñas explícitamente
    try {
      console.log('🔍 Abriendo pestaña de reseñas...');
      await page.evaluate(() => {
        const tabs = Array.from(document.querySelectorAll('button, [role="tab"]'));
        const reviewsTab = tabs.find(el => {
          const txt = (el.textContent || '').toLowerCase();
          const aria = (el.getAttribute('aria-label') || '').toLowerCase();
          return txt.includes('reseñas') || txt.includes('reviews') || aria.includes('reseñas') || aria.includes('reviews');
        });
        if (reviewsTab) reviewsTab.click();
      });
      await wait(2500);
    } catch (e) {
      console.log('⚠️ No se pudo abrir la pestaña de reseñas:', e && e.message ? e.message : e);
    }

    try {
      console.log('🔄 Buscando filtro "Más recientes"...');
      await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const sortButton = buttons.find(btn => {
          const text = (btn.textContent || '').toLowerCase();
          return text.includes('más recientes') || text.includes('más reciente') || text.includes('newest');
        });
        if (sortButton) sortButton.click();
      });
      await wait(1200);
    } catch (e) {
      console.log('⚠️ No se encontró/activó el filtro de recientes');
    }

    console.log('⬇️ Haciendo scroll en el panel de reseñas...');
    for (let attempt = 0; attempt < 16; attempt++) {
      try {
        await page.evaluate(() => {
          const panels = Array.from(document.querySelectorAll('[role="region"], [aria-label], .m6QErb')); 
          const reviewPanel = panels.find(p => {
            const aria = (p.getAttribute && p.getAttribute('aria-label')) ? p.getAttribute('aria-label').toLowerCase() : '';
            return aria.includes('reseña') || aria.includes('review');
          }) || document.querySelector('.m6QErb[tabindex="0"]') || document.querySelector('.m6QErb');

          if (reviewPanel) {
            reviewPanel.scrollTop = reviewPanel.scrollHeight;
          } else {
            window.scrollBy(0, 900);
          }
        });
      } catch (e) {}
      await wait(700);
    }

    console.log('📝 Extrayendo reseñas desde tarjetas visibles...');
    resenas = await page.evaluate(() => {
      const out = [];
      const seen = new Set();

      const cardSelectors = [
        'div[data-review-id]',
        'div.jftiEf',
        'div[class*="jftiEf"]',
        'div[role="article"]'
      ];

      let cards = [];
      for (const selector of cardSelectors) {
        const found = Array.from(document.querySelectorAll(selector));
        if (found.length > cards.length) cards = found;
      }

      // Expandir textos truncados (botón "Más") dentro de tarjetas
      const moreButtons = Array.from(document.querySelectorAll('button, span[role="button"]')).filter(el => {
        const t = (el.textContent || '').trim().toLowerCase();
        return t === 'más' || t === 'more';
      });
      for (const b of moreButtons) {
        try { b.click(); } catch (e) {}
      }

      for (const card of cards) {
        try {
          const txt = (card.innerText || '').trim();
          if (!txt || txt.length < 20) continue;

          const lines = txt.split('\n').map(l => l.trim()).filter(Boolean);
          if (lines.length < 2) continue;

          const autorSel = card.querySelector('.d4r55, [class*="d4r55"], a[href*="/contrib/"]');
          const autor = (autorSel && autorSel.textContent ? autorSel.textContent.trim() : lines[0] || 'Usuario').substring(0, 60);

          let puntuacion = 0;
          const starEl = card.querySelector('span[aria-label*="estrella"], span[aria-label*="star"]');
          if (starEl) {
            const m = (starEl.getAttribute('aria-label') || '').match(/(\d+(?:[\.,]\d+)?)/);
            if (m) puntuacion = Math.round(parseFloat(m[1].replace(',', '.')));
          }
          if (!puntuacion) {
            const starMatch = txt.match(/★+/);
            if (starMatch) puntuacion = starMatch[0].length;
          }

          let fecha = '';
          const dateSel = card.querySelector('.rsqaWe, [class*="rsqaWe"]');
          if (dateSel && dateSel.textContent) fecha = dateSel.textContent.trim();
          if (!fecha) {
            const dateLine = lines.find(l => /^hace\s+/i.test(l) || /\d+\s+(día|días|semana|semanas|mes|meses|año|años)/i.test(l));
            if (dateLine) fecha = dateLine;
          }

          let texto = '';
          const textSel = card.querySelector('.wiI7pd, .MyEned, [class*="wiI7pd"]');
          if (textSel && textSel.textContent) texto = textSel.textContent.trim();
          if (!texto) {
            const candidate = lines.find(l => l.length > 25 && !/^hace\s+/i.test(l) && !/reseñ|opiniones|google|maps/i.test(l));
            if (candidate) texto = candidate;
          }

          if (puntuacion >= 1 && puntuacion <= 5 && texto.length >= 15) {
            const key = `${autor}|${puntuacion}|${texto.substring(0, 40)}`;
            if (!seen.has(key)) {
              seen.add(key);
              out.push({
                autor,
                puntuacion,
                fecha: fecha || 'Hace poco',
                texto: texto.substring(0, 500)
              });
            }
          }
        } catch (e) {}
        if (out.length >= 30) break;
      }

      return out;
    });

  await browser.close();
  console.log(`✅ ${resenas.length} reseñas extraídas de Google Maps`);

  } catch (error) {
    console.error('❌ Error en scraping:', error && error.message ? error.message : error);
    if (browser) {
      try {
        await browser.close();
      } catch (e) {}
    }
  }

  // Nunca devolver reseñas mockeadas automáticamente; devolver array vacío si no hay datos reales.
  if (!Array.isArray(resenas)) resenas = [];

  return {
    nombre: baseData.nombre,
    puntuacion: baseData.puntuacion,
    numeroResenas: baseData.numeroResenas,
    horario: baseData.horario,
    telefono: baseData.telefono,
    sitioWeb: baseData.sitioWeb,
    urlGoogle: mapsUrl,
    resenas: resenas,
    _resenaCount: resenas.length,
    _fallback: resenas.length === 0
  };
}

module.exports = { scrapBusinessData };
