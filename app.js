// --- API KEY de OpenWeatherMap (pon la tuya aquí) ---
    const OWM_API_KEY = '06aac0fd4ba239a20d824ef89602f311'; // tu API key personal

    // --- Capa global de condiciones actuales OWM ---
    let owmCurrentLayer;
    // Configuración de Mapbox
    const MAPBOX_API_KEY = 'pk.eyJ1IjoiaGFzdHl0dWJlIiwiYSI6ImNsa2hkZTh6bzAwazQzZHFyNmF5aTRsZGwifQ.5QJvYIHo0odZ5jCFApV7yw';
    const MAPBOX_STYLE = 'hastytube/clli6kx8u004m01p28nb47zz2';

    // Variables globales
    let map, radarLayers = {}, satelliteLayers = {}, apiData = {}, mapFrames = [];
    let infraSatLayers = [], infraSatTimestamps = [], infraSatAnimationTimer = null, infraSatPosition = 0;
    let animationPosition = 0, animationTimer = null;
    let animationSpeed = 250;
    let optionColorScheme = 6, optionSmoothData = 0, optionSnowColors = 1;
    let optionTileSize = 256, optionExtension = 'png';
    let preloadedImages = 0;
    let totalImagesToPreload = 0;
    let geoMarker = null;
    let updateTimer = null;
    let framesToPreloadCount = 10;
    let baseLayer = null; // Variable para almacenar el mapa base

    function changeFrames(val) {
        framesToPreloadCount = parseInt(val);
        loadRadarData(false);
    }

    function initMap() {
        map = L.map('mapid', {
            zoomControl: false,
            preferCanvas: true,
            fadeAnimation: false,
            zoomAnimation: false
        }).setView([20, -80], 3);

        L.control.zoom({ position: 'topright' }).addTo(map);
        // Los estilos del control de zoom se han movido a style.css

        // Capa base satélite de Mapbox
        const satelliteLayer = L.tileLayer(
            `https://api.mapbox.com/styles/v1/mapbox/satellite-v9/tiles/512/{z}/{x}/{y}?access_token=${MAPBOX_API_KEY}`,
            {
                attribution: '© Mapbox © OpenStreetMap',
                tileSize: 512,
                zoomOffset: -1,
                zIndex: 1,
                detectRetina: false
            }
        ).addTo(map);

        // Capa de labels (calles y nombres) para efecto híbrido
        const labelsLayer = L.tileLayer(
            `https://api.mapbox.com/styles/v1/mapbox/streets-v11/tiles/512/{z}/{x}/{y}?access_token=${MAPBOX_API_KEY}`,
            {
                attribution: '',
                tileSize: 512,
                zoomOffset: -1,
                zIndex: 2,
                detectRetina: false,
                opacity: 0.7 // Puedes ajustar la opacidad para mejor visualización
            }
        ).addTo(map);

        // Guardar referencia al mapa base (satélite)
        baseLayer = satelliteLayer;
        // Si quieres alternar entre capas, puedes guardar labelsLayer también
        window.labelsLayer = labelsLayer;

        addGeolocateButton();

        // --- Carga diferida de fronteras para no bloquear el renderizado inicial ---
        setTimeout(() => {
            fetch('https://raw.githubusercontent.com/datasets/geo-countries/master/data/countries.geojson')
                .then(response => {
                    if (!response.ok) {
                        throw new Error(`HTTP error! status: ${response.status} for URL: ${response.url}`);
                    }
                    return response.json();
                })
                .then(geojson => {
                    const countryBorders = L.geoJSON(geojson, {
                        style: {
                            color: '#ff7800',
                            weight: 1.5,
                            fill: false,
                            opacity: 0.7
                        },
                        onEachFeature: function (feature, layer) {
                            // Etiqueta permanente con el nombre del país, centrada en el centroide
                            if (feature.properties.ADMIN && feature.geometry) {
                                // Calcular centroide aproximado
                                let latlng;
                                if (feature.geometry.type === 'Polygon') {
                                    latlng = getPolygonCenter(feature.geometry.coordinates[0]);
                                } else if (feature.geometry.type === 'MultiPolygon') {
                                    latlng = getPolygonCenter(feature.geometry.coordinates[0][0]);
                                }
                                if (latlng) {
                                    L.marker(latlng, {
                                        icon: L.divIcon({
                                            className: 'country-label',
                                            html: feature.properties.ADMIN,
                                            iconSize: [100, 18],
                                            iconAnchor: [50, 9]
                                        }),
                                        interactive: false
                                    }).addTo(map);
                                }
                            }
                        }
                    }).addTo(map);
                })
                .catch(e => console.error('Error fetching country borders:', e));
        }, 2000); // Retraso de 2 segundos

        // --- Añadir fronteras y nombres de estados de Venezuela (URL deshabilitada temporalmente) ---
        /* fetch('https://raw.githubusercontent.com/codeforvenezuela/geojson-venezuela/master/venezuela_estados.geojson')
            .then(response => {
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status} for URL: ${response.url}`);
                }
                return response.json();
            })
            .then(geojson => {
                L.geoJSON(geojson, {
                    style: {
                        color: '#0066cc',
                        weight: 1,
                        fill: false,
                        opacity: 0.8
                    },
                    onEachFeature: function (feature, layer) {
                        // Etiqueta permanente con el nombre del estado, centrada
                        if (feature.properties && (feature.properties.ESTADO || feature.properties.NOM_ESTADO || feature.properties.NOMBRE) && feature.geometry) {
                            let nombre = feature.properties.ESTADO || feature.properties.NOM_ESTADO || feature.properties.NOMBRE;
                            let latlng;
                            if (feature.geometry.type === 'Polygon') {
                                latlng = getPolygonCenter(feature.geometry.coordinates[0]);
                            } else if (feature.geometry.type === 'MultiPolygon') {
                                latlng = getPolygonCenter(feature.geometry.coordinates[0][0]);
                            }
                            if (latlng) {
                                L.marker(latlng, {
                                    icon: L.divIcon({
                                        className: 'state-label',
                                        html: nombre,
                                        iconSize: [120, 16],
                                        iconAnchor: [60, 8]
                                    }),
                                    interactive: false
                                }).addTo(map);
                            }
                        }
                    }
                }).addTo(map);
            })
            .catch(e => console.error('Error fetching Venezuela state borders:', e)); */

        // --- Añadir capa global de condiciones actuales OWM ---
        owmCurrentLayer = L.OWM.current({
            appId: OWM_API_KEY,
            intervall: 15,
            lang: 'es',
            minZoom: 3,
            markerFunction: function(data) {
                var iconUrl = 'icons/' + data.weather[0].icon + '.png';
                var icon = L.icon({
                    iconUrl: iconUrl,
                    iconSize: [80, 80],
                    iconAnchor: [40, 80],
                    popupAnchor: [0, -80]
                });
                var marker = L.marker([data.coord.Lat, data.coord.Lon], {icon: icon});
                var ciudad = data.name || 'Ubicación desconocida';
                var temp = data.main && data.main.temp ? Math.round(data.main.temp) + '°C' : '';
                var desc = data.weather && data.weather[0] ? data.weather[0].description : '';
                // Etiqueta visual sobre el icono, ligeramente separada arriba
                // Etiqueta con flechita (puntero) hacia el icono
                var labelHtml = `
                  <div class="owm-label-arrow">
                    <div class="owm-label-arrow-content">
                      <b>${ciudad}</b><br>${temp}
                    </div>
                    <div class="owm-label-arrow-pointer"></div>
                  </div>`;
                // La etiqueta se coloca un poco más al norte (arriba) del icono
                var label = L.divIcon({
                    className: 'owm-label-arrow-icon',
                    html: labelHtml,
                    iconSize: [120, 40],
                    iconAnchor: [60, 95] // Mover la etiqueta más arriba
                });
                // Asegurar que el icono del clima (marker) esté sobre la etiqueta (labelMarker)
                var labelMarker = L.marker([data.coord.Lat, data.coord.Lon], {icon: label, interactive: false, zIndexOffset: 100});
                marker.options.zIndexOffset = 200;

                marker.bindPopup(`<b>${ciudad}</b><br>${desc}<br>${temp}`);
                // Agrupar icono y etiqueta
                var group = L.layerGroup([marker, labelMarker]);
                return group;
            },
            imageLoadingUrl: 'https://openweathermap.org/img/w/01d.png'
        });
        // Por defecto, NO añadir la capa OWM al mapa (solo si el usuario la activa en el menú)
        // if (document.getElementById('toggleOWMCurrent')?.checked) {
        //     owmCurrentLayer.addTo(map);
        // }

        // Función para activar/desactivar la capa OWM desde el menú
        window.toggleOWMCurrentLayer = function() {
            var chk = document.getElementById('toggleOWMCurrent');
            if (chk && owmCurrentLayer) {
                if (chk.checked) {
                    owmCurrentLayer.addTo(map);
                } else {
                    map.removeLayer(owmCurrentLayer);
                }
            }
        };
        // --- Función para calcular centroide de un polígono simple ---
        function getPolygonCenter(coords) {
            let lat = 0, lng = 0;
            coords.forEach(c => { lat += c[1]; lng += c[0]; });
            let n = coords.length;
            return [lat / n, lng / n];
        }

        // Los estilos para las etiquetas se han movido a style.css
    }

    function locateUser(flyTo = true) {
        if (!navigator.geolocation) {
            alert("Geolocalización no es soportada por este navegador.");
            return;
        }
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                const lat = pos.coords.latitude;
                const lng = pos.coords.longitude;
                if (flyTo) {
                    map.flyTo([lat, lng], 8);
                }
                if (geoMarker) map.removeLayer(geoMarker);
                geoMarker = L.marker([lat, lng]).addTo(map).bindPopup("Tu ubicación").openPopup();
            },
            () => {
                alert("No se pudo obtener la ubicación. Asegúrate de haber concedido los permisos.");
            }
        );
    }

    function addGeolocateButton() {
        const LocateControl = L.Control.extend({
            options: { position: 'topright' },
            onAdd: function(map) {
                const container = L.DomUtil.create('div', 'leaflet-control-locate');
                container.title = "Ir a mi ubicación";
                container.innerHTML = '<svg width="20" height="20" viewBox="0 0 20 20"><circle cx="10" cy="10" r="8" stroke="#333" stroke-width="2" fill="none"/><circle cx="10" cy="10" r="2" fill="#333"/></svg>';
                
                container.onclick = function(e) {
                    e.stopPropagation();
                    locateUser();
                };
                return container;
            }
        });
        map.addControl(new LocateControl());
    }

    function clearAllTiles() {
        // Limpiar todos los tiles del mapa excepto el base, el satélite infrarrojo y OWM
        map.eachLayer(layer => {
            // No eliminar baseLayer, ni ninguna capa de infraSatLayers, ni owmCurrentLayer
            if (
                (layer instanceof L.TileLayer && layer !== baseLayer)
                && (!infraSatLayers.includes(layer))
                && (layer !== owmCurrentLayer)
            ) {
                map.removeLayer(layer);
                if (typeof layer.remove === 'function') layer.remove();
            }
        });
        // No quitar la capa OWM ni la de satélite infrarrojo aquí
        // Forzar limpieza del caché de tiles si existe
        if (map._tileLoader) {
            map._tileLoader.clear();
        }
    }

    async function loadRadarData(keepPosition = true) {
        stopAnimation();
        document.getElementById('timestampText').textContent = "Cargando datos del radar...";
        setProgressBar(0);
        try {
            // Limpiar frames anteriores
            mapFrames = [];
            const response = await fetch(`https://api.rainviewer.com/public/weather-maps.json?t=${Date.now()}`);
            if (!response.ok) throw new Error("Error en la respuesta del servidor");
            apiData = await response.json();

            // RADAR: frames más recientes primero
            let allRadarFrames = [...apiData.radar.past, ...(apiData.radar.nowcast || [])];
            // Reducción automática de calidad y frames en móviles
            let isMobile = /Android|iPhone|iPad|iPod|Opera Mini|IEMobile|WPDesktop/i.test(navigator.userAgent);
            let framesCount = framesToPreloadCount;
            if (isMobile) {
                optionTileSize = 128;
                framesCount = Math.min(6, framesToPreloadCount);
                document.getElementById('qualitySelect').value = '128';
                document.getElementById('framesSelect').value = framesCount.toString();
            }
            mapFrames = allRadarFrames.slice(-framesCount);

            preloadedImages = 0;
            totalImagesToPreload = 0;
            // Limpiar completamente los layers antiguos
            clearAllTiles();
            radarLayers = {};
            satelliteLayers = {};
            await preloadImagesAsync();
            initializeLayers();
            showFrame(mapFrames.length - 1);
            startAnimation();
            // --- Recargar capa de satélite infrarrojo si está activada ---
            if (document.getElementById('toggleInfraSat') && document.getElementById('toggleInfraSat').checked) {
                addInfraSatLayer();
            }
        } catch (error) {
            console.error("Error:", error);
            document.getElementById('timestampText').textContent = `Error: ${error.message}. Reintentando...`;
            setTimeout(() => loadRadarData(false), 5000);
        }
    }


    // Precarga y paralelización de imágenes con Promise.all
    async function preloadImagesAsync() {
        const framesToPreload = mapFrames;
        const allFrames = [...apiData.radar.past, ...(apiData.radar.nowcast || [])];
        const framesInBackground = allFrames.slice(0, allFrames.length - framesToPreload.length);

        totalImagesToPreload = 1;
        const loadingBar = document.getElementById('loadingBar');
        if (loadingBar) {
            loadingBar.style.display = 'block';
            const progress = document.getElementById('loadingBarProgress');
            if (progress) progress.style.width = '0%';
        }
        mapFrames.forEach(frame => {
            totalImagesToPreload++;
            if (apiData.satellite?.infrared) {
                const satFrame = apiData.satellite.infrared.find(f => f.time === frame.time);
                if (satFrame) totalImagesToPreload++;
            }
        });

        let loaded = 0;
        function updateBar() {
            const loadingBarProgress = document.getElementById('loadingBarProgress');
            if (loadingBarProgress) {
                loadingBarProgress.style.width = `${Math.min((loaded / totalImagesToPreload) * 100, 100)}%`;
            }
        }

        // Función para precargar una imagen y resolver cuando esté lista
        function preloadImg(src) {
            return new Promise(resolve => {
                const img = new window.Image();
                img.onload = () => { loaded++; updateBar(); resolve(); };
                img.onerror = () => { loaded++; updateBar(); resolve(); };
                img.src = src;
            });
        }

        // Precargar cobertura
        let promises = [preloadImg(`https://tilecache.rainviewer.com/v2/coverage/0/${optionTileSize}/6/32/32/0/0_0.png`)];

        // Precargar frames principales (radar y satélite)
        framesToPreload.forEach(frame => {
            promises.push(preloadImg(`${apiData.host}${frame.path}/${optionTileSize}/6/0/0/${optionColorScheme}/${optionSmoothData}_${optionSnowColors}.${optionExtension}`));
            if (apiData.satellite?.infrared) {
                const satFrame = apiData.satellite.infrared.find(f => f.time === frame.time);
                if (satFrame) {
                    promises.push(preloadImg(`${apiData.host}${satFrame.path}/${optionTileSize}/6/0/0/0_0.${optionExtension}`));
                }
            }
        });

        // Precarga en background (no bloqueante)
        setTimeout(() => {
            framesInBackground.forEach(frame => {
                preloadImg(`${apiData.host}${frame.path}/${optionTileSize}/6/0/0/${optionColorScheme}/${optionSmoothData}_${optionSnowColors}.${optionExtension}`);
                if (apiData.satellite?.infrared) {
                    const satFrame = apiData.satellite.infrared.find(f => f.time === frame.time);
                    if (satFrame) {
                        preloadImg(`${apiData.host}${satFrame.path}/${optionTileSize}/6/0/0/0_0.${optionExtension}`);
                    }
                }
            });
        }, 500);

        // Esperar a que terminen los frames principales
        await Promise.all(promises);
        setTimeout(() => {
            if (loadingBar) loadingBar.style.display = 'none';
        }, 400);
    }

function imageLoaded(callback, isInitialDone) {
    preloadedImages++;
    // Actualizar barra de carga visual
    const loadingBarProgress = document.getElementById('loadingBarProgress');
    if (loadingBarProgress) {
        loadingBarProgress.style.width = `${Math.min((preloadedImages / totalImagesToPreload) * 100, 100)}%`;
    }
    if (preloadedImages >= totalImagesToPreload) {
        setTimeout(() => {
            const loadingBar = document.getElementById('loadingBar');
            if (loadingBar) loadingBar.style.display = 'none';
        }, 400);
    }
    if (isInitialDone && callback) callback();
}

    function setProgressBar(percent) {
        const bar = document.getElementById('progressBar');
        bar.style.width = `${Math.min(percent, 100)}%`;
        if (percent >= 100) {
            setTimeout(() => { bar.style.width = '0%'; }, 1500);
        }
    }

    function initializeLayers() {
        // Eliminar cualquier layer residual
        clearAllTiles();

        // CAPA DE COBERTURA (coverage) usando el tamaño seleccionado
        if (window.coverageLayer) {
            map.removeLayer(window.coverageLayer);
            window.coverageLayer = null;
        }
        window.coverageLayer = L.tileLayer(
            `https://tilecache.rainviewer.com/v2/coverage/0/${optionTileSize}/{z}/{x}/{y}/0/0_0.png`,
            {
                tileSize: optionTileSize,
                opacity: 0.3,
                zIndex: 60,
                maxZoom: 10,
                crossOrigin: true,
                detectRetina: false
            }
        );
        if (document.getElementById('toggleCoverage')?.checked !== false) {
            window.coverageLayer.addTo(map);
        }

        // Reutilización eficiente de instancias de L.tileLayer
        mapFrames.forEach(frame => {
            // RADAR
            if (!radarLayers[frame.path]) {
                radarLayers[frame.path] = L.tileLayer(`${apiData.host}${frame.path}/${optionTileSize}/{z}/{x}/{y}/${optionColorScheme}/${optionSmoothData}_${optionSnowColors}.${optionExtension}`, {
                    tileSize: optionTileSize,
                    opacity: 0,
                    zIndex: 200,
                    crossOrigin: true,
                    detectRetina: false,
                    updateWhenIdle: false
                });
            }
            if (!map.hasLayer(radarLayers[frame.path])) {
                radarLayers[frame.path].addTo(map);
            }

            // SATÉLITE
            if (apiData.satellite?.infrared) {
                const satFrame = apiData.satellite.infrared.find(f => f.time === frame.time);
                if (satFrame && !satelliteLayers[frame.path]) {
                    var colorScheme = 0;
                    var smooth = 0;
                    var snow = 0;
                    var framePath = satFrame.path;
                    satelliteLayers[frame.path] = L.tileLayer(
                        `${apiData.host}${framePath}/${optionTileSize}/{z}/{x}/{y}/${colorScheme}/${smooth}_${snow}.${optionExtension}`,
                        {
                            tileSize: optionTileSize,
                            opacity: 0,
                            zIndex: 150,
                            maxZoom: 10,
                            crossOrigin: true,
                            detectRetina: false
                        }
                    );
                }
                if (satFrame && !map.hasLayer(satelliteLayers[frame.path])) {
                    satelliteLayers[frame.path].addTo(map);
                }
            }
        });

        // Forzar redibujado
        if (map) {
            if (window.requestIdleCallback) {
                requestIdleCallback(() => {
                    map._onResize();
                    map.invalidateSize();
                });
            } else {
                setTimeout(() => {
                    map._onResize();
                    map.invalidateSize();
                }, 0);
            }
        }
    }

    function showFrame(pos) {
        if (!mapFrames.length || pos < 0 || pos >= mapFrames.length) return;
        let frame = mapFrames[pos];
        animationPosition = pos;

        // Verificar si el frame de satélite tiene tiles disponibles
        let satOk = true;
        if (apiData.satellite?.infrared && document.getElementById('toggleSatellite').checked) {
            const satFrame = apiData.satellite.infrared.find(f => f.time === frame.time);
            if (satFrame) {
                // Probar si el tile central existe (z=6, x=32, y=32 para zoom global)
                const testUrl = `https://tilecache.rainviewer.com/v2/satellite/${satFrame.time}/6/32/32/0/0_0.png`;
                fetch(testUrl, { method: 'HEAD' }).then(resp => {
                    if (!resp.ok) {
                        // Si no existe, buscar el frame anterior disponible
                        buscarFrameSatDisponible(pos - 1);
                        satOk = false;
                    } else {
                        mostrarFrameReal(frame);
                    }
                }).catch(() => {
                    buscarFrameSatDisponible(pos - 1);
                    satOk = false;
                });
            } else {
                mostrarFrameReal(frame);
            }
        }
        if (!apiData.satellite?.infrared || !document.getElementById('toggleSatellite').checked || satOk) {
            mostrarFrameReal(frame);
        }
    }

    function buscarFrameSatDisponible(pos) {
        // Busca hacia atrás el primer frame de satélite con tile disponible
        for (let i = pos; i >= 0; i--) {
            const frame = mapFrames[i];
            const satFrame = apiData.satellite?.infrared?.find(f => f.time === frame.time);
            if (satFrame) {
                const testUrl = `https://tilecache.rainviewer.com/v2/satellite/${satFrame.time}/6/32/32/0/0_0.png`;
                fetch(testUrl, { method: 'HEAD' }).then(resp => {
                    if (resp.ok) {
                        mostrarFrameReal(frame);
                    } else if (i > 0) {
                        buscarFrameSatDisponible(i - 1);
                    }
                }).catch(() => {
                    if (i > 0) buscarFrameSatDisponible(i - 1);
                });
                break;
            }
        }
    }

    function mostrarFrameReal(frame) {
        // Radar
        Object.values(radarLayers).forEach(layer => {
            if (layer && map.hasLayer(layer)) layer.setOpacity(0);
        });
        if (document.getElementById('toggleRadar').checked && radarLayers[frame.path]) {
            radarLayers[frame.path].setOpacity(document.getElementById('opacityRange').value);
        }

        // Satélite
        Object.values(satelliteLayers).forEach(layer => {
            if (layer && map.hasLayer(layer)) layer.setOpacity(0);
        });
        if (document.getElementById('toggleSatellite').checked && satelliteLayers[frame.path]) {
            satelliteLayers[frame.path].setOpacity(document.getElementById('opacityRange').value);
        }

        // --- Mostrar hora del frame de radar ---
        document.getElementById('timestampText').textContent = 'Radar: ' + new Date(frame.time * 1000).toLocaleString();

        // --- Barra de progreso (animación) ---
        let bar = document.getElementById('progressBar');
        let start = document.getElementById('progressStart');
        let end = document.getElementById('progressEnd');
        if (mapFrames.length > 0) {
            let percent = ((animationPosition + 1) / mapFrames.length) * 100;
            bar.style.width = percent + '%';
            // Mostrar hora del primer y último frame
            let t0 = mapFrames[0].time;
            let t1 = mapFrames[mapFrames.length - 1].time;
            start.textContent = new Date(t0 * 1000).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
            end.textContent = new Date(t1 * 1000).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
        } else {
            bar.style.width = '0%';
            start.textContent = '';
            end.textContent = '';
        }

        // --- Mostrar hora del frame de satélite infrarrojo sincronizado ---
        let satActive = document.getElementById('toggleInfraSat') && document.getElementById('toggleInfraSat').checked && infraSatLayers.length > 0;
        let radarLen = mapFrames.length;
        let satLen = infraSatLayers.length;
        let satIdx = 0;
        if (satActive && satLen > 0) {
            if (animationPosition < radarLen - 1) {
                satIdx = Math.floor((animationPosition / (radarLen - 1)) * (satLen - 1));
            } else {
                satIdx = satLen - 1;
            }
            let satTs = infraSatTimestamps[satIdx]?.ts;
            if (satTs) {
                document.getElementById('satTimestampText').style.display = '';
                document.getElementById('satTimestampText').textContent = 'Satélite infrarrojo: ' + new Date(satTs * 1000).toLocaleString();
            } else {
                document.getElementById('satTimestampText').style.display = 'none';
            }
        } else {
            document.getElementById('satTimestampText').style.display = 'none';
        }
    }

function startAnimation() {
    stopAnimation();
    if (!mapFrames.length) return;

    // Si hay satélite infrarrojo activo, sincronizar ambos
    let satActive = document.getElementById('toggleInfraSat') && document.getElementById('toggleInfraSat').checked && infraSatLayers.length > 0;
    let radarLen = mapFrames.length;
    let satLen = infraSatLayers.length;

    function nextFrame() {
        animationPosition = (animationPosition + 1) % radarLen;

        // Calcular el frame proporcional del satélite
        let satIdx = 0;
        if (satActive && satLen > 0) {
            if (animationPosition < radarLen - 1) {
                // Proporcional: Math.floor((pos / (radarLen-1)) * (satLen-1))
                satIdx = Math.floor((animationPosition / (radarLen - 1)) * (satLen - 1));
            } else {
                // Si el radar está en el último frame, el satélite también
                satIdx = satLen - 1;
            }
            // Ocultar todos los frames de satélite
            infraSatLayers.forEach(l => l.setOpacity(0));
            // Mostrar el frame correspondiente
            infraSatLayers[satIdx].setOpacity(document.getElementById('opacityRange').value);
        }

        // Mostrar el frame de radar y satélite (el showFrame solo controla radar y RainViewer satellite)
        showFrame(animationPosition);

        // Pausa larga en el último frame
        if (animationPosition === radarLen - 1) {
            animationTimer = setTimeout(nextFrame, 1000);
        } else {
            animationTimer = setTimeout(nextFrame, animationSpeed);
        }
    }

    nextFrame();
}

function stopAnimation() {
    if (animationTimer) {
        clearTimeout(animationTimer);
        animationTimer = null;
    }
    // También detener la animación de satélite infrarrojo si existía
    if (infraSatAnimationTimer) {
        clearTimeout(infraSatAnimationTimer);
        infraSatAnimationTimer = null;
    }
}

    function stepForward() {
        stopAnimation();
        animationPosition = (animationPosition + 1) % mapFrames.length;
        showFrame(animationPosition);
    }

    function stepBackward() {
        stopAnimation();
        animationPosition = (animationPosition - 1 + mapFrames.length) % mapFrames.length;
        showFrame(animationPosition);
    }

    function toggleMenu() {
        const menu = document.getElementById("menuContent");
        menu.style.display = menu.style.display === "block" ? "none" : "block";
    }

function toggleLayer(kind) {
    if (kind === 'radar') {
        showFrame(animationPosition);
    } else if (kind === 'satellite') {
        showFrame(animationPosition);
    } else if (kind === 'coverage') {
        if (document.getElementById('toggleCoverage').checked) {
            if (window.coverageLayer && !map.hasLayer(window.coverageLayer)) {
                window.coverageLayer.addTo(map);
            }
        } else {
            if (window.coverageLayer && map.hasLayer(window.coverageLayer)) {
                map.removeLayer(window.coverageLayer);
            }
        }
    } else if (kind === 'infraSat') {
        if (document.getElementById('toggleInfraSat').checked) {
            addInfraSatLayer();
        } else {
            removeInfraSatLayer();
        }
    }
    // No tocar la capa OWM aquí, solo se controla con su propio checkbox
}

    function adjustOpacity(val) {
        showFrame(animationPosition);
    }

    function changeSpeed(val) {
        animationSpeed = parseInt(val);
        if (animationTimer) startAnimation();
    }

    function toggleSmooth(val) {
        optionSmoothData = val ? 1 : 0;
        loadRadarData(false);
    }

    function changeQuality(val) {
        optionTileSize = parseInt(val);
        loadRadarData(false);
    }

    function startAutoUpdate() {
        if (updateTimer) clearInterval(updateTimer);
        updateTimer = setInterval(() => {
            loadRadarData(false);
        }, 5 * 60 * 1000);
    }

        function createRadarLegend() {
            const legendData = [
                { dbz: 80, color: '#ffffff' }, { dbz: 70, color: '#9c52c6' },
                { dbz: 60, color: '#bd0000' }, { dbz: 50, color: '#ff0000' },
                { dbz: 40, color: '#ecce00' }, { dbz: 30, color: '#087305' },
                { dbz: 20, color: '#00ff00' }, { dbz: 10, color: '#009cf7' },
                { dbz: 0, color: '#04e9e7' }
            ];

            const legendContainer = document.getElementById('radar-legend');
            if (!legendContainer) return;
            legendContainer.innerHTML = '<div class="legend-label" style="font-weight:bold; margin-bottom:5px;">dBZ</div>';

            legendData.forEach(item => {
                const legendItem = document.createElement('div');
                legendItem.className = 'legend-item';
                legendItem.innerHTML = `
                    <div class="legend-color" style="background-color: ${item.color};"></div>
                    <div class="legend-label">${item.dbz}</div>
                `;
                legendContainer.appendChild(legendItem);
            });
        }

        document.addEventListener('DOMContentLoaded', () => {
            optionTileSize = 256;
            document.getElementById('qualitySelect').value = '256';
            document.getElementById('framesSelect').value = '10';
            framesToPreloadCount = 10;
            initMap();
            locateUser(true); // Solicitar ubicación al cargar la página
            createRadarLegend(); // Llamar a la función para crear la leyenda
            document.getElementById('toggleSatellite').checked = true;
            document.getElementById('speedSelect').value = '250';
            document.getElementById('smoothToggle').checked = false;
            loadRadarData();
            startAutoUpdate();
            // Activar la capa infrarroja por defecto
            document.getElementById('toggleInfraSat').checked = true;
            addInfraSatLayer();
            // NO activar OWM por defecto
            // Refrescar la capa infrarroja cada 10 minutos
            setInterval(() => {
                removeInfraSatLayer();
                addInfraSatLayer();
            }, 10 * 60 * 1000);
        });

    // --- Satélite Infrarrojo Weather.com ---
    // --- Eliminar capa de satélite infrarrojo Weather.com ---
    function removeInfraSatLayer() {
        if (infraSatLayers && infraSatLayers.length > 0) {
            infraSatLayers.forEach(layer => {
                if (map && map.hasLayer(layer)) map.removeLayer(layer);
            });
            infraSatLayers = [];
            infraSatTimestamps = [];
        }
    }
    // --- Satélite Infrarrojo Weather.com ---
    // Manejo incremental y persistente de frames
    async function addInfraSatLayer() {
        // Elimina cualquier capa anterior
        if (infraSatLayers && infraSatLayers.length > 0) {
            infraSatLayers.forEach(layer => { if (map.hasLayer(layer)) map.removeLayer(layer); });
            infraSatLayers = [];
            infraSatTimestamps = [];
        }
        var apiKey = 'e1f10a1e78da46f5b10a1e78da96f525';
        let resp = await fetch('https://api.weather.com/v3/TileServer/series/productSet/PPAcore?filter=satrad&apiKey=' + apiKey);
        let data = await resp.json();
        if (!data.seriesInfo || !data.seriesInfo.satrad || !data.seriesInfo.satrad.series) {
            console.warn('No hay datos de satélite infrarrojo disponibles.');
            document.getElementById('timestampText').textContent = 'No hay datos de satélite infrarrojo disponibles.';
            return;
        }
        let allSatFrames = data.seriesInfo.satrad.series.sort((a, b) => a.ts - b.ts);
        let minTime = null;
        if (mapFrames.length > 0) {
            let lastRadarTime = mapFrames[mapFrames.length - 1].time;
            minTime = lastRadarTime - 2 * 3600;
        }
        let newTimestamps = minTime ? allSatFrames.filter(f => f.ts >= minTime) : allSatFrames;
        if (!newTimestamps.length) {
            console.warn('No hay frames recientes de satélite infrarrojo.');
            document.getElementById('timestampText').textContent = 'No hay frames recientes de satélite infrarrojo.';
            return;
        }
        infraSatTimestamps = [...newTimestamps];
        infraSatLayers = infraSatTimestamps.map(tsObj => {
            // ¡OJO! El formato correcto es xyz={x}:{y}:{z}
            return L.tileLayer(
                `https://api.weather.com/v3/TileServer/tile/satrad?ts=${tsObj.ts}&xyz={x}:{y}:{z}&apiKey=${apiKey}`,
                {
                    tileSize: 256,
                    opacity: 0,
                    zIndex: 120,
                    maxZoom: 10,
                    crossOrigin: true
                }
            ).addTo(map);
        });
        infraSatPosition = 0;
        // Mostrar el frame más reciente
        if (infraSatLayers.length > 0) {
            infraSatLayers.forEach(l => l.setOpacity(0));
            infraSatLayers[infraSatLayers.length - 1].setOpacity(document.getElementById('opacityRange').value);
        }
        // Sincronizar con la animación principal: SIEMPRE reiniciar animación para que radar y satélite estén sincronizados
        stopInfraSatAnimation();
        stopAnimation();
        startAnimation();
    }

function stopInfraSatAnimation() {
    if (infraSatAnimationTimer) {
        clearTimeout(infraSatAnimationTimer);
        infraSatAnimationTimer = null;
    }
}

// --- Música de fondo ---
const musicPath = "https://raw.githubusercontent.com/PicelBoi/Weirderscan/assets/audio/";
const musicOrderOriginal = [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,32,33,34,35,36,37,38,39,40,41,42,43,44,45,46,47,48,49,50,51,52,53,54,55,56,57,58,59,60,61,62,63,64,65,66,67];
let musicOrder = [];
let currentTrack = 0;
const audio = document.getElementById('weatherMusic');
audio.volume = 0.5;

function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
}

function startMusicPlaylist() {
    musicOrder = [...musicOrderOriginal];
    shuffleArray(musicOrder);
    currentTrack = 0;
    audio.src = musicPath + '(' + musicOrder[currentTrack] + ').mp3';
    audio.play();
}

function playNextTrack() {
    currentTrack++;
    if (currentTrack >= musicOrder.length) {
        // Al terminar la lista, barajar y empezar de nuevo
        shuffleArray(musicOrder);
        currentTrack = 0;
    }
    audio.src = musicPath + '(' + musicOrder[currentTrack] + ').mp3';
    audio.play();
}

audio.addEventListener('ended', function() {
    // Asegura que no se repita la misma canción
    if (!audio.loop) playNextTrack();
});
// Iniciar la primera canción aleatoria al cargar
startMusicPlaylist();
// Permitir reproducir en dispositivos móviles tras interacción
// (algunos navegadores requieren interacción para iniciar audio)
document.addEventListener('click', function enableMusic() {
    if (audio.paused) audio.play();
    document.removeEventListener('click', enableMusic);
});
// Función para activar/desactivar la música
toggleMusic = function() {
    const chk = document.getElementById('toggleMusic');
    if (chk && audio) {
        if (chk.checked) {
            audio.play();
        } else {
            audio.pause();
        }
    }
};