/**
 * Butaca — Lógica del portal
 * Consumo de la API pública de TVMaze con fetch():
 * async/await, Promesas (.then/.catch), Promise.all, AbortController y manejo de errores.
 */

document.addEventListener('DOMContentLoaded', () => {
    const API = 'https://api.tvmaze.com';
    const TIEMPO_LIMITE = 10000; // 10 s

    // ---------- Elementos del DOM ----------
    const $ = (id) => document.getElementById(id);
    const form = $('searchForm');
    const input = $('searchInput');
    const btnThen = $('btnThen');
    const grid = $('grid');
    const jsonOutput = $('jsonOutput');
    const jsonUrl = $('jsonUrl');
    const codeOutput = $('codeOutput');
    const codeTitle = $('codeTitle');
    const schedule = $('schedule');
    const hoyFecha = $('hoyFecha');
    const paisSelect = $('paisSelect');
    const modal = $('modal');
    const modalBody = $('modalBody');

    let totalPeticiones = 0;

    // ---------- Utilidades ----------
    const escapar = (texto = '') => String(texto)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

    const quitarHtml = (html) => {
        const div = document.createElement('div');
        div.innerHTML = html || '';
        return div.textContent.trim();
    };

    const anio = (fecha) => (fecha ? fecha.slice(0, 4) : '—');

    const fechaLocal = (d = new Date()) => {
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        return `${d.getFullYear()}-${mm}-${dd}`;
    };

    // fetch con límite de tiempo usando AbortController
    function fetchConLimite(url) {
        const controlador = new AbortController();
        const temporizador = setTimeout(() => controlador.abort(), TIEMPO_LIMITE);
        totalPeticiones++;
        $('mTotal').textContent = totalPeticiones;
        return fetch(url, { signal: controlador.signal })
            .finally(() => clearTimeout(temporizador));
    }

    function mensajeError(error) {
        if (error.name === 'AbortError') return 'La petición tardó demasiado y fue cancelada (timeout).';
        if (error instanceof TypeError) return 'No se pudo conectar con el servidor. Revisa tu conexión a internet.';
        return error.message;
    }

    function estadoApi(ok) {
        $('apiDot').className = 'dot ' + (ok ? 'ok' : 'bad');
        $('apiState').textContent = ok ? 'API TVMaze en línea' : 'API TVMaze con error';
    }

    function actualizarMetricas({ status, ok, ms, cantidad, modo }) {
        const mStatus = $('mStatus');
        mStatus.textContent = status ? `${status} ${ok ? 'OK' : 'Error'}` : 'Sin respuesta';
        mStatus.className = 'metric-value ' + (ok ? 'ok' : 'bad');
        $('mTime').textContent = ms != null ? `${ms} ms` : '—';
        $('mCount').textContent = cantidad != null ? cantidad : '—';
        $('mMode').textContent = modo;
        estadoApi(ok);
    }

    // ---------- Estados de la interfaz ----------
    function mostrarCargando() {
        grid.innerHTML = Array.from({ length: 10 }, () => `
            <div class="skeleton"><div class="poster"></div><div class="line"></div><div class="line short"></div></div>
        `).join('');
        jsonOutput.textContent = '// Esperando respuesta del servidor…';
    }

    function mostrarError(mensaje) {
        grid.innerHTML = `<div class="state error"><h3>Algo salió mal</h3><p>${escapar(mensaje)}</p></div>`;
        jsonOutput.textContent = `// Error:\n${mensaje}`;
    }

    function mostrarVacio(termino) {
        grid.innerHTML = `<div class="state"><h3>Sin resultados</h3><p>No se encontraron series para “${escapar(termino)}”. Prueba con otro nombre.</p></div>`;
    }

    // ---------- Renderizado ----------
    function tarjeta(show, i) {
        const img = show.image?.medium;
        const rating = show.rating?.average;
        const generos = (show.genres || []).slice(0, 2).join(' · ') || 'Sin género';
        return `
            <button class="card" data-id="${show.id}" style="animation-delay:${i * 40}ms">
                ${rating ? `<span class="rating">★ ${rating}</span>` : ''}
                <div class="poster">
                    ${img ? `<img src="${img}" alt="Póster de ${escapar(show.name)}" loading="lazy">`
                          : `<div class="poster-empty">${escapar(show.name)}</div>`}
                </div>
                <div class="card-body">
                    <h3>${escapar(show.name)}</h3>
                    <p class="card-meta">${anio(show.premiered)} · ${escapar(generos)}</p>
                </div>
            </button>`;
    }

    function renderResultados(datos, termino) {
        if (!datos.length) return mostrarVacio(termino);
        grid.innerHTML = datos.map((r, i) => tarjeta(r.show, i)).join('');
    }

    function renderJson(url, datos) {
        jsonUrl.textContent = `GET ${url}`;
        jsonOutput.textContent = JSON.stringify(datos, null, 2);
    }

    function mostrarCodigo(modo, termino) {
        const url = `${API}/search/shows?q=${encodeURIComponent(termino)}`;
        if (modo === 'async') {
            codeTitle.textContent = 'async / await';
            codeOutput.textContent =
`async function buscarSeries() {
  const url = '${url}';
  try {
    // 1. Petición HTTP GET
    const response = await fetch(url);

    // 2. Validar el estado HTTP
    if (!response.ok) {
      throw new Error(\`Error HTTP \${response.status}\`);
    }

    // 3. Convertir la respuesta a JSON
    const data = await response.json();

    // 4. Usar los datos
    console.log(data.map(r => r.show.name));
  } catch (error) {
    // 5. Manejo de errores
    console.error('No se pudo obtener la información:', error.message);
  }
}

buscarSeries();`;
        } else {
            codeTitle.textContent = 'Promesas: .then() / .catch()';
            codeOutput.textContent =
`const url = '${url}';

fetch(url)
  .then(response => {
    if (!response.ok) {
      throw new Error(\`Error HTTP \${response.status}\`);
    }
    return response.json();
  })
  .then(data => {
    console.log(data.map(r => r.show.name));
  })
  .catch(error => {
    console.error('No se pudo obtener la información:', error.message);
  });`;
        }
    }

    // ---------- 1) Búsqueda con async / await ----------
    async function buscarAsync(termino) {
        const url = `${API}/search/shows?q=${encodeURIComponent(termino)}`;
        mostrarCargando();
        mostrarCodigo('async', termino);
        const inicio = performance.now();

        try {
            const response = await fetchConLimite(url);
            const ms = Math.round(performance.now() - inicio);

            if (!response.ok) {
                actualizarMetricas({ status: response.status, ok: false, ms, modo: 'async/await' });
                throw new Error(`El servidor respondió con el código HTTP ${response.status}.`);
            }

            const datos = await response.json();
            actualizarMetricas({ status: response.status, ok: true, ms, cantidad: datos.length, modo: 'async/await' });
            renderResultados(datos, termino);
            renderJson(url, datos);
        } catch (error) {
            if (!error.message.startsWith('El servidor')) actualizarMetricas({ ok: false, modo: 'async/await' });
            mostrarError(mensajeError(error));
        }
    }

    // ---------- 2) Búsqueda con Promesas (.then / .catch) ----------
    function buscarThen(termino) {
        const url = `${API}/search/shows?q=${encodeURIComponent(termino)}`;
        mostrarCargando();
        mostrarCodigo('then', termino);
        const inicio = performance.now();
        let respuesta;

        fetchConLimite(url)
            .then(response => {
                respuesta = { status: response.status, ms: Math.round(performance.now() - inicio) };
                if (!response.ok) throw new Error(`El servidor respondió con el código HTTP ${response.status}.`);
                return response.json();
            })
            .then(datos => {
                actualizarMetricas({ ...respuesta, ok: true, cantidad: datos.length, modo: '.then()' });
                renderResultados(datos, termino);
                renderJson(url, datos);
            })
            .catch(error => {
                actualizarMetricas({ ...(respuesta || {}), ok: false, modo: '.then()' });
                mostrarError(mensajeError(error));
            });
    }

    // ---------- 3) Error 404 controlado ----------
    async function probarError() {
        const url = `${API}/shows/99999999`;
        mostrarCargando();
        codeTitle.textContent = 'Manejo de un error 404';
        codeOutput.textContent =
`const response = await fetch('${url}');

if (!response.ok) {
  // response.status === 404 → la serie no existe
  throw new Error(\`Error HTTP \${response.status}\`);
}`;
        const inicio = performance.now();
        try {
            const response = await fetchConLimite(url);
            const ms = Math.round(performance.now() - inicio);
            actualizarMetricas({ status: response.status, ok: response.ok, ms, cantidad: 0, modo: 'async/await' });
            jsonUrl.textContent = `GET ${url}`;
            if (!response.ok) throw new Error(`Error HTTP ${response.status}: la serie con id 99999999 no existe. El error fue detectado con response.ok y controlado sin romper la página.`);
        } catch (error) {
            mostrarError(mensajeError(error));
        }
    }

    // ---------- 4) Detalle con Promise.all (3 peticiones en paralelo) ----------
    async function abrirDetalle(id) {
        modal.hidden = false;
        document.body.style.overflow = 'hidden';
        modalBody.innerHTML = `<div class="state" style="margin:24px">
            <h3>Cargando…</h3><p>Consultando información, reparto y temporadas en paralelo.</p></div>`;
        const inicio = performance.now();

        try {
            const urls = [`${API}/shows/${id}`, `${API}/shows/${id}/cast`, `${API}/shows/${id}/seasons`];
            const respuestas = await Promise.all(urls.map(u => fetchConLimite(u)));
            const fallida = respuestas.find(r => !r.ok);
            if (fallida) throw new Error(`Error HTTP ${fallida.status} al cargar el detalle.`);

            const [show, reparto, temporadas] = await Promise.all(respuestas.map(r => r.json()));
            const ms = Math.round(performance.now() - inicio);
            renderDetalle(show, reparto, temporadas, ms);
            renderJson(urls[0], show);
        } catch (error) {
            modalBody.innerHTML = `<div class="state error" style="margin:24px"><h3>No se pudo cargar</h3><p>${escapar(mensajeError(error))}</p></div>`;
        }
    }

    function renderDetalle(show, reparto, temporadas, ms) {
        const img = show.image?.original || show.image?.medium;
        const episodios = temporadas.reduce((t, s) => t + (s.episodeOrder || 0), 0);
        const generos = (show.genres || []).map(g => `<span class="tag">${escapar(g)}</span>`).join('');
        const actores = reparto.slice(0, 8).map(c => `
            <li>
                ${c.person?.image?.medium ? `<img src="${c.person.image.medium}" alt="${escapar(c.person.name)}" loading="lazy">` : '<span class="sin-foto"></span>'}
                <div><strong>${escapar(c.person?.name)}</strong><small>${escapar(c.character?.name || '')}</small></div>
            </li>`).join('');

        modalBody.innerHTML = `
            <div class="detalle">
                <div class="detalle-poster">${img ? `<img src="${img}" alt="Póster de ${escapar(show.name)}">` : ''}</div>
                <div class="detalle-info">
                    <p class="eyebrow">${escapar(show.network?.name || show.webChannel?.name || 'Serie')} · ${anio(show.premiered)}</p>
                    <h2 id="modalTitle">${escapar(show.name)}</h2>
                    <div class="tags">
                        ${show.rating?.average ? `<span class="tag gold">★ ${show.rating.average}</span>` : ''}
                        <span class="tag">${escapar(show.status || '')}</span>
                        ${generos}
                    </div>
                    <p class="resumen">${escapar(quitarHtml(show.summary) || 'Sin descripción disponible.')}</p>
                    <dl class="datos">
                        <div><dt>Temporadas</dt><dd>${temporadas.length}</dd></div>
                        <div><dt>Episodios</dt><dd>${episodios || '—'}</dd></div>
                        <div><dt>Idioma</dt><dd>${escapar(show.language || '—')}</dd></div>
                    </dl>
                    ${actores ? `<p class="sub">Reparto principal</p><ul class="reparto">${actores}</ul>` : ''}
                    <p class="peticiones">Promise.all → 3 peticiones en paralelo · ${ms} ms</p>
                </div>
            </div>`;
    }

    function cerrarDetalle() {
        modal.hidden = true;
        document.body.style.overflow = '';
    }

    // ---------- 5) Programación del día ----------
    async function cargarProgramacion(pais) {
        const fecha = fechaLocal();
        const url = `${API}/schedule?country=${pais}&date=${fecha}`;
        schedule.innerHTML = Array.from({ length: 6 }, () => '<li class="skeleton" style="height:90px"></li>').join('');

        try {
            const response = await fetchConLimite(url);
            if (!response.ok) throw new Error(`Error HTTP ${response.status}`);
            const datos = await response.json();
            const nombrePais = paisSelect.options[paisSelect.selectedIndex].text;
            hoyFecha.textContent = `${datos.length} emisiones · ${nombrePais} · ${new Date().toLocaleDateString('es-NI', { weekday: 'long', day: 'numeric', month: 'long' })}`;

            if (!datos.length) {
                schedule.innerHTML = '<li class="state" style="display:block">No hay programación registrada para hoy en este país.</li>';
                return;
            }
            schedule.innerHTML = datos.slice(0, 12).map((ep, i) => `
                <li data-id="${ep.show.id}" style="animation-delay:${i * 40}ms">
                    <span class="hora">${escapar(ep.airtime || '--:--')}</span>
                    ${ep.show.image?.medium ? `<img class="mini" src="${ep.show.image.medium}" alt="" loading="lazy">` : '<span class="mini"></span>'}
                    <div>
                        <h3>${escapar(ep.show.name)}</h3>
                        <p>T${ep.season ?? '-'} · E${ep.number ?? '-'} — ${escapar(ep.name || 'Episodio')}</p>
                    </div>
                </li>`).join('');
        } catch (error) {
            hoyFecha.textContent = 'No se pudo cargar la programación.';
            schedule.innerHTML = `<li class="state error" style="display:block">${escapar(mensajeError(error))}</li>`;
        }
    }

    // ---------- Eventos ----------
    const termino = () => input.value.trim() || 'breaking bad';

    form.addEventListener('submit', (e) => { e.preventDefault(); buscarAsync(termino()); });
    btnThen.addEventListener('click', () => buscarThen(termino()));

    document.querySelectorAll('.chip').forEach(chip => {
        chip.addEventListener('click', () => {
            if (chip.classList.contains('chip-error')) return probarError();
            input.value = chip.textContent;
            buscarAsync(chip.textContent);
        });
    });

    grid.addEventListener('click', (e) => {
        const card = e.target.closest('.card');
        if (card) abrirDetalle(card.dataset.id);
    });
    schedule.addEventListener('click', (e) => {
        const fila = e.target.closest('li[data-id]');
        if (fila) abrirDetalle(fila.dataset.id);
    });

    modal.addEventListener('click', (e) => { if (e.target.closest('[data-close]')) cerrarDetalle(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !modal.hidden) cerrarDetalle(); });

    document.querySelectorAll('.tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
            tab.classList.add('active');
            $(tab.dataset.tab).classList.add('active');
        });
    });

    document.querySelectorAll('.copy').forEach(boton => {
        boton.addEventListener('click', () => {
            const texto = $(boton.dataset.copy).textContent;
            const original = boton.textContent;
            navigator.clipboard.writeText(texto)
                .then(() => { boton.textContent = '¡Copiado!'; })
                .catch(() => { boton.textContent = 'No se pudo copiar'; })
                .finally(() => setTimeout(() => (boton.textContent = original), 1800));
        });
    });

    paisSelect.addEventListener('change', () => cargarProgramacion(paisSelect.value));

    // ---------- Carga inicial ----------
    buscarAsync(termino());
    cargarProgramacion(paisSelect.value);
});

