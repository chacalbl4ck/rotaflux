import React, { useState, useEffect, useRef } from 'react';
import { Plus, MapPin, Navigation, Trash2, Menu, X, CheckCircle, Search, Truck, Layers, Settings, AlertCircle, Info, Car, Bike, AlertTriangle, Bus, Copy, Heart, Wifi, WifiOff, Download, CloudRain } from 'lucide-react';

/**
 * ROTAFLUX (OPEN SOURCE)
 * ------------------------------------------------------------------
 * Este aplicativo utiliza APIs abertas:
 * 1. Mapas: OpenStreetMap (via Leaflet)
 * 2. Geocodificação: Nominatim (OSM)
 * 3. Roteirização/Otimização: OSRM (Open Source Routing Machine)
 * ------------------------------------------------------------------
 */

// Configuração de Estilos e Ícones do Leaflet
const LEAFLET_CDN_CSS = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
const LEAFLET_CDN_JS = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";

const DefaultIcon = "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSIjM2I4MmY2IiBzdHJva2U9IiMxZTNiOGEiIHN0cm9rZS13aWR0aD0iMiIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIj48cGF0aCBkPSJNMjEgMTB1MC03LTMtMy03LTMtNyAzLTMgNyAwIDd2MTd6Ii8+PHBhdGggZD0iTTMgMjF2LThhMiAyIDAgMCAxIDItMmgxNGEyIDIgMCAwIDEgMiAydjgiLz48cGF0aCBkPSJNMTIgMTJ2OSIvPjwvc3ZnPg==";

// Componente Auxiliar para carregar scripts externos (Leaflet)
const useScript = (url) => {
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    if (document.querySelector(`script[src="${url}"]`)) {
      setLoaded(true);
      return;
    }
    const script = document.createElement('script');
    script.src = url;
    script.async = true;
    script.onload = () => setLoaded(true);
    document.body.appendChild(script);
  }, [url]);
  return loaded;
};

const useStyle = (url) => {
  useEffect(() => {
    if (document.querySelector(`link[href="${url}"]`)) return;
    const link = document.createElement('link');
    link.href = url;
    link.rel = 'stylesheet';
    document.head.appendChild(link);
  }, [url]);
};

export default function App() {
  // --- Carregamento de Recursos ---
  const leafletLoaded = useScript(LEAFLET_CDN_JS);
  useStyle(LEAFLET_CDN_CSS);

  // --- Estados da Aplicação ---
  const [stops, setStops] = useState([]); // Lista de paradas
  const [query, setQuery] = useState(''); // Busca de endereço
  const [suggestions, setSuggestions] = useState([]); // Sugestões de busca
  const [isSidebarOpen, setIsSidebarOpen] = useState(true); // Controle da UI
  const [isOptimizing, setIsOptimizing] = useState(false); // Loading state
  const [mapInstance, setMapInstance] = useState(null); // Referência ao mapa
  const [routeLayer, setRouteLayer] = useState(null); // Camada da rota desenhada
  const [markersLayer, setMarkersLayer] = useState(null); // Camada de marcadores
  const [userLocation, setUserLocation] = useState(null); // GPS do usuário

  // Novos Estados
  const [showAbout, setShowAbout] = useState(false); // Modal Sobre
  const [showSettings, setShowSettings] = useState(false); // Modal Configurações
  // navApp: 'google' | 'waze'
  const [vehicleConfig, setVehicleConfig] = useState({ type: 'car', plate: '', navApp: 'google' });
  const [rodizioAlert, setRodizioAlert] = useState(null); // Alerta de rodizio
  const [pixCopied, setPixCopied] = useState(false); // Estado para feedback do PIX
  
  // Melhoria: Estados para Offline e Download
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [isDownloadingMap, setIsDownloadingMap] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);

  const mapContainerRef = useRef(null);
  
  // Melhoria: Ref para Debounce da busca (Evitar erro "Failed to fetch")
  const searchTimeoutRef = useRef(null);

  // --- Efeitos ---

  // Melhoria: Listener de Conexão
  useEffect(() => {
    const handleStatusChange = () => setIsOffline(!navigator.onLine);
    window.addEventListener('online', handleStatusChange);
    window.addEventListener('offline', handleStatusChange);
    return () => {
        window.removeEventListener('online', handleStatusChange);
        window.removeEventListener('offline', handleStatusChange);
    };
  }, []);

  // Melhoria: Persistência de Dados (Salvar estado ao fechar/recarregar)
  useEffect(() => {
    const savedStops = localStorage.getItem('rotaflux_stops');
    const savedConfig = localStorage.getItem('rotaflux_config');
    
    if (savedStops) setStops(JSON.parse(savedStops));
    if (savedConfig) setVehicleConfig(JSON.parse(savedConfig));
  }, []);

  useEffect(() => {
    localStorage.setItem('rotaflux_stops', JSON.stringify(stops));
  }, [stops]);

  useEffect(() => {
    localStorage.setItem('rotaflux_config', JSON.stringify(vehicleConfig));
  }, [vehicleConfig]);


  // 1. Inicializar Mapa com Camada Offline Personalizada
  useEffect(() => {
    if (leafletLoaded && mapContainerRef.current && !mapInstance) {
      const L = window.L;
      
      // Centro inicial (Brasil genérico ou localização do usuário)
      const map = L.map(mapContainerRef.current).setView([-23.5505, -46.6333], 13);

      // Melhoria: Camada de Mapa com Cache (Intercepta requisições)
      // Tenta carregar do cache do navegador primeiro, se falhar e tiver online, baixa e salva.
      const OfflineTileLayer = L.TileLayer.extend({
        createTile: function(coords, done) {
            const tile = document.createElement('img');
            const url = this.getTileUrl(coords);
            
            tile.onload = () => done(null, tile);
            tile.onerror = () => done(new Error('Failed to load tile'), tile);

            // Tenta usar Cache API se disponível
            if ('caches' in window) {
                caches.match(url).then(response => {
                    if (response) {
                        return response.blob();
                    }
                    // Se não tiver no cache, fetch normal (o browser gerencia, mas forçamos para garantir)
                    return fetch(url).then(res => {
                        if (res.ok) {
                            const resClone = res.clone();
                            caches.open('rotaflux-tiles-v1').then(cache => cache.put(url, resClone));
                        }
                        return res.blob();
                    });
                }).then(blob => {
                    tile.src = URL.createObjectURL(blob);
                }).catch(() => {
                    // Fallback direto se cache falhar
                    tile.src = url; 
                });
            } else {
                tile.src = url;
            }

            return tile;
        }
      });

      new OfflineTileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors',
        crossOrigin: true 
      }).addTo(map);

      // Grupos de camadas para facilitar limpeza
      const routeGroup = L.layerGroup().addTo(map);
      const markersGroup = L.layerGroup().addTo(map);

      setRouteLayer(routeGroup);
      setMarkersLayer(markersGroup);
      setMapInstance(map);

      // Tentar pegar localização atual
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                const { latitude, longitude } = pos.coords;
                setUserLocation({ lat: latitude, lng: longitude });
                // Só muda o view se não tiver paradas carregadas
                if (!localStorage.getItem('rotaflux_stops')) {
                    map.setView([latitude, longitude], 15);
                }
                
                // Marcador da posição atual
                L.circleMarker([latitude, longitude], {
                    radius: 8,
                    fillColor: "#3b82f6",
                    color: "#fff",
                    weight: 2,
                    opacity: 1,
                    fillOpacity: 0.8
                }).addTo(map);
            },
            () => console.log("Permissão de GPS negada"),
            { enableHighAccuracy: true }
        );
      }
    }
  }, [leafletLoaded, mapInstance]);

  // 2. Atualizar Marcadores no Mapa quando a lista `stops` muda
  useEffect(() => {
    if (!mapInstance || !markersLayer) return;

    markersLayer.clearLayers();
    const L = window.L;

    stops.forEach((stop, index) => {
      // Ícone customizado baseado no status (Pendente/Concluído)
      const iconHtml = `
        <div class="relative flex items-center justify-center w-8 h-8 rounded-full border-2 border-white shadow-lg ${stop.completed ? 'bg-green-500' : 'bg-blue-600'} text-white font-bold text-sm">
          ${index + 1}
        </div>
      `;

      const customIcon = L.divIcon({
        html: iconHtml,
        className: '', // Remove estilos padrão do leaflet divIcon
        iconSize: [32, 32],
        iconAnchor: [16, 32]
      });

      const marker = L.marker([stop.lat, stop.lon], { icon: customIcon })
        .bindPopup(`<b>${index + 1}. ${stop.display_name}</b><br>${stop.completed ? 'Concluído' : 'Pendente'}`);
      
      markersLayer.addLayer(marker);
    });

    // Ajustar zoom para caber todos os pontos
    if (stops.length > 0) {
      const group = L.featureGroup(markersLayer.getLayers());
      if (group.getLayers().length > 0) {
        mapInstance.fitBounds(group.getBounds().pad(0.1));
      }
    }

  }, [stops, mapInstance, markersLayer]);

  // 3. Verificar Rodízio quando config ou data muda
  useEffect(() => {
    checkRodizio();
  }, [vehicleConfig]);

  // --- Funções Lógicas ---

  const checkRodizio = () => {
    if (!vehicleConfig.plate || vehicleConfig.type === 'moto') {
        setRodizioAlert(null);
        return;
    }

    // Remove caracteres não alfanuméricos para processar tanto AAA-0000 quanto AAA0A00
    const cleanPlate = vehicleConfig.plate.replace(/[^a-zA-Z0-9]/g, '');
    
    // Tanto no padrão antigo quanto no Mercosul, o último caractere define o rodízio
    const lastChar = cleanPlate.slice(-1);
    const lastDigit = parseInt(lastChar);

    if (isNaN(lastDigit)) return;

    const day = new Date().getDay(); // 0 = Dom, 1 = Seg, ...
    let restricted = false;

    // Regra Padrão (SP):
    // Seg: 1/2, Ter: 3/4, Qua: 5/6, Qui: 7/8, Sex: 9/0
    if (day === 1 && (lastDigit === 1 || lastDigit === 2)) restricted = true;
    if (day === 2 && (lastDigit === 3 || lastDigit === 4)) restricted = true;
    if (day === 3 && (lastDigit === 5 || lastDigit === 6)) restricted = true;
    if (day === 4 && (lastDigit === 7 || lastDigit === 8)) restricted = true;
    if (day === 5 && (lastDigit === 9 || lastDigit === 0)) restricted = true;

    if (restricted) {
        let msgType = "Veículo";
        if(vehicleConfig.type === 'truck') msgType = "Caminhão";
        if(vehicleConfig.type === 'bus') msgType = "Ônibus";

        setRodizioAlert({
            msg: `Rodízio ATIVO hoje para final ${lastDigit}!`,
            detail: `${msgType} com restrição no Centro Expandido (07h-10h | 17h-20h).`
        });
    } else {
        setRodizioAlert(null);
    }
  };

  // Funçao copiar PIX
  const handleCopyPix = () => {
      const pixKey = "3f24110f-23ce-466d-b01b-5c89fc8fd680";
      navigator.clipboard.writeText(pixKey).then(() => {
          setPixCopied(true);
          setTimeout(() => setPixCopied(false), 3000); // Resetar após 3s
      }).catch(err => {
          console.error("Erro ao copiar: ", err);
          alert("Erro ao copiar. A chave é: " + pixKey);
      });
  };

  // Melhoria: Função para baixar mapas da área atual (Simulação de Offline)
  const downloadCurrentArea = async () => {
    if (!mapInstance) return;
    if (!navigator.onLine) {
        alert("Você precisa estar online para baixar mapas.");
        return;
    }

    const confirmDownload = window.confirm("Deseja baixar o mapa desta área para uso offline? Isso pode consumir dados.");
    if (!confirmDownload) return;

    setIsDownloadingMap(true);
    setDownloadProgress(0);

    // Lógica para calcular tiles na viewport atual
    const bounds = mapInstance.getBounds();
    const minZoom = 13;
    const maxZoom = 15; // Limita zoom para não explodir downloads
    const tilesToFetch = [];

    // Função utilitária para converter lat/lon em tile coords
    const long2tile = (lon, zoom) => (Math.floor((lon + 180) / 360 * Math.pow(2, zoom)));
    const lat2tile = (lat, zoom) => (Math.floor((1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2 * Math.pow(2, zoom)));

    for (let z = minZoom; z <= maxZoom; z++) {
        const top = lat2tile(bounds.getNorth(), z);
        const left = long2tile(bounds.getWest(), z);
        const bottom = lat2tile(bounds.getSouth(), z);
        const right = long2tile(bounds.getEast(), z);

        for (let x = left; x <= right; x++) {
            for (let y = top; y <= bottom; y++) {
                tilesToFetch.push(`https://a.tile.openstreetmap.org/${z}/${x}/${y}.png`);
            }
        }
    }

    // Limite de segurança
    if (tilesToFetch.length > 500) {
        alert(`Área muito grande (${tilesToFetch.length} blocos). Dê zoom in para baixar.`);
        setIsDownloadingMap(false);
        return;
    }

    // Processo de Download e Cache
    try {
        const cache = await caches.open('rotaflux-tiles-v1');
        let completed = 0;
        
        // Faz download em lotes pequenos para não travar
        const batchSize = 10;
        for (let i = 0; i < tilesToFetch.length; i += batchSize) {
            const batch = tilesToFetch.slice(i, i + batchSize);
            await Promise.all(batch.map(url => fetch(url).then(res => {
                if (res.ok) cache.put(url, res.clone());
            }).catch(e => console.warn(e))));
            
            completed += batch.length;
            setDownloadProgress(Math.round((completed / tilesToFetch.length) * 100));
        }
        alert("Mapa baixado com sucesso! Agora você pode ver esta área mesmo sem internet.");
    } catch (e) {
        console.error(e);
        alert("Erro ao baixar mapas.");
    } finally {
        setIsDownloadingMap(false);
    }
  };

  // Buscar endereços (Nominatim API) com Debounce
  const searchAddress = async (q) => {
    // 1. Limpa timeout anterior se houver (Debounce)
    if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
    }

    if (q.length < 3) return;
    
    // 2. Cria novo timeout para buscar só após 800ms de pausa na digitação
    searchTimeoutRef.current = setTimeout(async () => {
        if (isOffline) {
            // Em modo offline, não tentamos buscar para evitar erro
            return;
        }

        try {
            // URL Base
            let searchUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&addressdetails=1&limit=5`;
            
            // Priorização Local (Viewbox)
            if (mapInstance) {
                const b = mapInstance.getBounds();
                searchUrl += `&viewbox=${b.getWest()},${b.getNorth()},${b.getEast()},${b.getSouth()}&bounded=0`;
            }

            // Removido User-Agent que causava erro em alguns ambientes
            const response = await fetch(searchUrl);
            
            if (!response.ok) throw new Error("Erro na rede");
            
            const data = await response.json();
            setSuggestions(data);
        } catch (error) {
            console.warn("Erro na busca (pode ser conexão):", error);
        }
    }, 800);
  };

  const addStop = (place) => {
    const newStop = {
      id: Date.now(),
      lat: parseFloat(place.lat),
      lon: parseFloat(place.lon),
      display_name: place.address ? `${place.address.road || ''}, ${place.address.house_number || ''} - ${place.address.suburb || ''}` : place.display_name.split(',')[0],
      raw_data: place,
      completed: false
    };

    setStops([...stops, newStop]);
    setQuery('');
    setSuggestions([]);
    
    // Centralizar mapa no novo ponto
    if (mapInstance) {
        mapInstance.setView([newStop.lat, newStop.lon], 16);
    }
  };

  const removeStop = (id) => {
    setStops(stops.filter(s => s.id !== id));
    // Limpar rota ao alterar paradas para evitar inconsistência
    if(routeLayer) routeLayer.clearLayers();
  };

  const toggleComplete = (id) => {
    setStops(stops.map(s => s.id === id ? { ...s, completed: !s.completed } : s));
  };

  // Otimização de Rota (OSRM Trip Service)
  const optimizeRoute = async () => {
    if (stops.length < 2) {
      alert("Adicione pelo menos 2 paradas para otimizar.");
      return;
    }

    // Melhoria: Permite clicar mesmo "Offline" para dar feedback
    if (isOffline) {
        const confirmOffline = window.confirm("Você parece estar offline. O cálculo de otimização precisa de internet. Deseja traçar uma linha simples seguindo a ordem atual?");
        
        if (confirmOffline && routeLayer && window.L) {
            // Fallback Offline: Desenha linhas retas na ordem da lista
            routeLayer.clearLayers();
            const L = window.L;
            const latLngs = stops.map(s => [s.lat, s.lon]);
            const polyline = L.polyline(latLngs, { color: '#6366f1', weight: 4, opacity: 0.6, dashArray: '5, 10' }).addTo(routeLayer);
            mapInstance.fitBounds(polyline.getBounds().pad(0.1));
            setIsSidebarOpen(false);
        }
        return;
    }

    // Validação de coordenadas
    const invalidStops = stops.filter(s => isNaN(s.lat) || isNaN(s.lon));
    if (invalidStops.length > 0) {
        alert("Erro: Algumas paradas possuem coordenadas inválidas. Remova-as e tente novamente.");
        return;
    }

    setIsOptimizing(true);
    
    try {
      // Formata coordenadas: {lon},{lat};{lon},{lat}...
      const coordsString = stops.map(s => `${s.lon},${s.lat}`).join(';');
      
      // Servidor Primário (OSRM Demo)
      let url = `https://router.project-osrm.org/trip/v1/driving/${coordsString}?source=first&geometry=geojson`;
      
      let response;
      let data;
      let usedBackup = false;

      try {
          response = await fetch(url);
          // Se falhar (ex: 429 Too Many Requests), força erro para cair no catch
          if (!response.ok) throw new Error("Server Error");
          data = await response.json();
      } catch (primaryError) {
          console.warn("Servidor primário falhou, tentando backup...", primaryError);
          // Servidor Secundário (OSRM Alemão - geralmente mais estável)
          url = `https://routing.openstreetmap.de/routed-car/trip/v1/driving/${coordsString}?source=first&geometry=geojson`;
          
          try {
              response = await fetch(url);
              if (!response.ok) throw new Error("Backup Server Error");
              data = await response.json();
              usedBackup = true;
          } catch (backupError) {
              throw new Error("Ambos servidores de rota falharam. Verifique sua conexão ou tente mais tarde.");
          }
      }

      // Verificação rigorosa do código de retorno OSRM
      if (data && data.code !== 'Ok') {
          console.error("OSRM Error Details:", data);
          let errorMsg = "Não foi possível calcular a rota.";
          if (data.code === 'NoRoute') errorMsg = "Não foi possível encontrar um caminho (rota impossível entre os pontos).";
          if (data.code === 'InvalidValue') errorMsg = "Coordenadas inválidas detectadas.";
          
          throw new Error(`${errorMsg} (Código: ${data.code})`);
      }

      if (data && data.waypoints && data.trips) {
          const waypointOrder = data.waypoints.map(wp => wp.waypoint_index);
          const tripGeometry = data.trips[0].geometry;

          // Reordenar o array `stops` baseado no índice retornado pelo OSRM
          const optimizedStops = waypointOrder.map(index => stops[index]);
          setStops(optimizedStops);

          // Desenhar rota no mapa
          if (routeLayer && window.L) {
            routeLayer.clearLayers();
            const L = window.L;
            
            // Inverter coordenadas de GeoJSON (Lon,Lat) para Leaflet (Lat,Lon)
            const latLngs = tripGeometry.coordinates.map(coord => [coord[1], coord[0]]);
            
            const polyline = L.polyline(latLngs, { color: '#6366f1', weight: 5, opacity: 0.8 }).addTo(routeLayer);
            mapInstance.fitBounds(polyline.getBounds().pad(0.1));
          }

          setIsSidebarOpen(false); // Fecha sidebar para ver o mapa
          
          if (usedBackup) {
              console.log("Rota calculada usando servidor de backup.");
          }

          // Sugerir download após calcular
          if (window.confirm("Rota calculada! Deseja baixar o mapa desta rota para economizar dados e usar offline?")) {
              downloadCurrentArea();
          }
      } else {
          throw new Error("Dados de rota inválidos recebidos.");
      }

    } catch (error) {
      console.error(error);
      alert(`Erro ao otimizar rota: ${error.message}`);
    } finally {
      setIsOptimizing(false);
    }
  };

  const openNavigation = (lat, lon) => {
    // Verifica preferência do usuário
    if (vehicleConfig.navApp === 'waze') {
        // Deep Link do Waze
        // navigate=yes força o início da navegação
        window.open(`https://waze.com/ul?ll=${lat},${lon}&navigate=yes`, '_blank');
    } else {
        // Padrão Google Maps
        window.open(`https://www.google.com/maps/dir/?api=1&destination=${lat},${lon}`, '_blank');
    }
  };

  // --- Renderização ---
  if (!leafletLoaded) return <div className="flex items-center justify-center h-screen bg-gray-100 text-gray-600">Carregando mapa...</div>;

  return (
    <div className="flex flex-col h-screen bg-gray-50 overflow-hidden font-sans relative">
      
      {/* Toast de Confirmação PIX */}
      {pixCopied && (
          <div className="fixed bottom-10 left-1/2 transform -translate-x-1/2 z-[700] bg-gray-800 text-white px-6 py-3 rounded-full shadow-2xl flex items-center gap-2 animate-bounce">
              <CheckCircle size={20} className="text-green-400" />
              <span className="font-medium">Chave PIX copiada com sucesso!</span>
          </div>
      )}

      {/* Modal Sobre */}
      {showAbout && (
        <div className="fixed inset-0 z-[600] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="bg-white rounded-xl shadow-2xl p-6 max-w-sm w-full text-center relative animate-fade-in">
                <button 
                    onClick={() => setShowAbout(false)}
                    className="absolute top-2 right-2 p-2 hover:bg-gray-100 rounded-full text-gray-400"
                >
                    <X size={20} />
                </button>
                <div className="w-16 h-16 bg-indigo-100 rounded-full flex items-center justify-center mx-auto mb-4 text-indigo-600">
                    <Info size={32} />
                </div>
                <h2 className="text-xl font-bold text-gray-800 mb-2">Sobre o RotaFlux</h2>
                <div className="bg-gray-50 p-4 rounded-lg border border-gray-100 mb-4 space-y-2">
                     <p className="text-gray-700 font-medium">Criado por Caio Monteiro</p>
                     <p className="text-sm text-gray-500 font-bold tracking-widest mt-1">BRASIL</p>
                     <p className="text-xs text-gray-400">Com auxílio do Gemini</p>
                     
                     <div className="mt-4 pt-4 border-t border-gray-200">
                        <p className="text-green-600 font-bold text-sm">
                           Este é um sistema gratuito e não exige nenhum pagamento!
                        </p>
                        <p className="text-gray-500 text-xs mt-2 mb-2">
                           Gostou? Ajude a manter o projeto:
                        </p>
                        <button 
                            onClick={handleCopyPix}
                            className="w-full bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 py-2 rounded-lg font-medium flex items-center justify-center gap-2 transition-colors active:scale-95"
                        >
                            <Heart size={16} className={pixCopied ? "fill-current text-red-500" : ""} />
                            {pixCopied ? "Chave Copiada!" : "Doar via PIX (Copiar)"}
                        </button>
                     </div>
                </div>
                <button 
                    onClick={() => setShowAbout(false)}
                    className="w-full bg-gray-800 text-white py-2 rounded-lg font-medium hover:bg-gray-900"
                >
                    Fechar
                </button>
            </div>
        </div>
      )}

      {/* Modal Configurações */}
      {showSettings && (
        <div className="fixed inset-0 z-[600] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="bg-white rounded-xl shadow-2xl p-6 max-w-sm w-full relative">
                <button 
                    onClick={() => setShowSettings(false)}
                    className="absolute top-2 right-2 p-2 hover:bg-gray-100 rounded-full text-gray-400"
                >
                    <X size={20} />
                </button>
                <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
                    <Settings size={20} className="text-gray-500" />
                    Configurações
                </h2>
                
                <div className="space-y-5">
                    {/* Seção Veículo */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Tipo de Veículo</label>
                        <div className="grid grid-cols-4 gap-2">
                            <button 
                                onClick={() => setVehicleConfig({...vehicleConfig, type: 'car'})}
                                className={`flex flex-col items-center justify-center p-2 rounded-lg border ${vehicleConfig.type === 'car' ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-gray-200 text-gray-500 hover:border-gray-300'}`}
                            >
                                <Car size={20} className="mb-1"/>
                                <span className="text-[10px]">Carro</span>
                            </button>
                            <button 
                                onClick={() => setVehicleConfig({...vehicleConfig, type: 'moto'})}
                                className={`flex flex-col items-center justify-center p-2 rounded-lg border ${vehicleConfig.type === 'moto' ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-gray-200 text-gray-500 hover:border-gray-300'}`}
                            >
                                <Bike size={20} className="mb-1"/>
                                <span className="text-[10px]">Moto</span>
                            </button>
                            <button 
                                onClick={() => setVehicleConfig({...vehicleConfig, type: 'truck'})}
                                className={`flex flex-col items-center justify-center p-2 rounded-lg border ${vehicleConfig.type === 'truck' ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-gray-200 text-gray-500 hover:border-gray-300'}`}
                            >
                                <Truck size={20} className="mb-1"/>
                                <span className="text-[10px]">Caminhão</span>
                            </button>
                            <button 
                                onClick={() => setVehicleConfig({...vehicleConfig, type: 'bus'})}
                                className={`flex flex-col items-center justify-center p-2 rounded-lg border ${vehicleConfig.type === 'bus' ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-gray-200 text-gray-500 hover:border-gray-300'}`}
                            >
                                <Bus size={20} className="mb-1"/>
                                <span className="text-[10px]">Ônibus</span>
                            </button>
                        </div>
                    </div>

                    {/* Seção Placa */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Placa (Mercosul ou Antiga)</label>
                        <input 
                            type="text" 
                            maxLength={8}
                            placeholder="Ex: ABC1D23 ou ABC-1234"
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none uppercase"
                            value={vehicleConfig.plate}
                            onChange={(e) => setVehicleConfig({...vehicleConfig, plate: e.target.value.toUpperCase()})}
                        />
                        <p className="text-xs text-gray-400 mt-1">Usado para alertas de rodízio municipal.</p>
                    </div>

                    {/* Seção App Navegação */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">App de Navegação Preferido</label>
                        <div className="flex gap-3">
                             <button 
                                onClick={() => setVehicleConfig({...vehicleConfig, navApp: 'google'})}
                                className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium border flex items-center justify-center gap-2 ${vehicleConfig.navApp === 'google' ? 'bg-green-50 border-green-200 text-green-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}
                            >
                                Google Maps
                            </button>
                            <button 
                                onClick={() => setVehicleConfig({...vehicleConfig, navApp: 'waze'})}
                                className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium border flex items-center justify-center gap-2 ${vehicleConfig.navApp === 'waze' ? 'bg-blue-50 border-blue-200 text-blue-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}
                            >
                                Waze
                            </button>
                        </div>
                    </div>

                    <button 
                        onClick={() => setShowSettings(false)}
                        className="w-full bg-indigo-600 text-white py-2 rounded-lg font-medium hover:bg-indigo-700 mt-2"
                    >
                        Salvar Configuração
                    </button>
                </div>
            </div>
        </div>
      )}

      {/* Barra Superior */}
      <header className="bg-white shadow-sm z-30 flex items-center justify-between px-4 py-3 border-b border-gray-200 relative">
        <div className="flex items-center gap-2">
            <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="p-2 hover:bg-gray-100 rounded-full lg:hidden">
                {isSidebarOpen ? <X size={20}/> : <Menu size={20}/>}
            </button>
            <div className="flex items-center gap-2 text-indigo-600">
                <Layers size={24} />
                <h1 className="font-bold text-lg text-gray-800">Rota<span className="text-indigo-600">Flux</span></h1>
            </div>
        </div>
        
        <div className="flex items-center gap-2">
            {/* Melhoria: Indicador de Conexão */}
            <div className={`flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-full ${isOffline ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-600'}`}>
                {isOffline ? <WifiOff size={12}/> : <Wifi size={12}/>}
                <span className="hidden sm:inline">{isOffline ? 'OFFLINE' : 'ONLINE'}</span>
            </div>

            <button 
                onClick={() => setShowAbout(true)}
                className="hidden sm:flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-gray-600 bg-gray-100 rounded-full hover:bg-gray-200 transition-colors"
            >
                <Info size={14} /> Sobre
            </button>
            <button 
                onClick={() => setShowSettings(true)}
                className="p-2 text-gray-500 hover:bg-gray-100 rounded-full hover:text-indigo-600 transition-colors relative"
            >
                <Settings size={20} />
                {vehicleConfig.plate && <span className="absolute top-1 right-1 w-2 h-2 bg-green-500 rounded-full border border-white"></span>}
            </button>
        </div>
      </header>

      {/* Alerta de Rodízio (Faixa) */}
      {rodizioAlert && (
          <div className="bg-red-50 border-b border-red-100 px-4 py-2 flex items-start gap-3 z-20 animate-fade-in">
              <AlertTriangle className="text-red-500 shrink-0 mt-0.5" size={18} />
              <div>
                  <p className="text-sm font-bold text-red-700">{rodizioAlert.msg}</p>
                  <p className="text-xs text-red-600">{rodizioAlert.detail}</p>
              </div>
          </div>
      )}

      {/* Melhoria: Barra de Progresso de Download */}
      {isDownloadingMap && (
        <div className="absolute top-16 left-0 right-0 z-50 px-4">
            <div className="bg-white rounded-lg shadow-lg p-3 flex items-center gap-3 animate-fade-in mx-auto max-w-md border border-indigo-100">
                <Download className="text-indigo-600 animate-bounce" size={20} />
                <div className="flex-1">
                    <div className="flex justify-between text-xs font-medium text-gray-600 mb-1">
                        <span>Baixando mapa para offline...</span>
                        <span>{downloadProgress}%</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                        <div className="bg-indigo-600 h-2 rounded-full transition-all duration-300" style={{width: `${downloadProgress}%`}}></div>
                    </div>
                </div>
            </div>
        </div>
      )}

      <div className="flex flex-1 relative overflow-hidden">
        
        {/* Painel Lateral (Sidebar) */}
        <div className={`
            absolute inset-y-0 left-0 z-40 w-full sm:w-96 bg-white shadow-xl transform transition-transform duration-300 ease-in-out flex flex-col
            ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}
            lg:relative lg:translate-x-0 border-r border-gray-200
        `}>
            {/* Input de Busca */}
            <div className="p-4 border-b border-gray-100 bg-gray-50">
                <div className="relative">
                    <Search className="absolute left-3 top-3 text-gray-400" size={18} />
                    <input
                        type="text"
                        placeholder="Adicionar endereço..."
                        className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-gray-300 focus:ring-2 focus:ring-indigo-500 focus:outline-none shadow-sm transition-all disabled:opacity-50"
                        value={query}
                        // Removemos o 'disabled={isOffline}' para o usuário poder tentar buscar se a net voltar
                        onChange={(e) => {
                            setQuery(e.target.value);
                            searchAddress(e.target.value);
                        }}
                    />
                    {isOffline && <span className="absolute right-3 top-3 text-red-400 text-xs font-bold">OFF</span>}
                </div>
                {/* Lista de Sugestões */}
                {suggestions.length > 0 && query.length > 2 && (
                    <ul className="mt-2 bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-y-auto divide-y divide-gray-100 absolute w-[92%] z-50">
                        {suggestions.map((place, idx) => (
                            <li 
                                key={idx} 
                                onClick={() => addStop(place)}
                                className="p-3 hover:bg-indigo-50 cursor-pointer text-sm text-gray-700 flex items-center gap-2"
                            >
                                <MapPin size={14} className="text-indigo-400 shrink-0"/>
                                <span className="truncate">{place.display_name}</span>
                            </li>
                        ))}
                    </ul>
                )}
            </div>

            {/* Lista de Paradas */}
            <div className="flex-1 overflow-y-auto p-2 space-y-2">
                {stops.length === 0 ? (
                    <div className="text-center p-8 text-gray-400 flex flex-col items-center">
                        <MapPin size={48} className="mb-2 opacity-20"/>
                        <p>Nenhuma parada adicionada.</p>
                        <p className="text-xs mt-1">{isOffline ? 'Conecte-se para buscar endereços.' : 'Busque endereços acima.'}</p>
                    </div>
                ) : (
                    stops.map((stop, index) => (
                        <div 
                            key={stop.id} 
                            className={`group relative flex items-center p-3 bg-white rounded-lg border ${stop.completed ? 'border-green-200 bg-green-50' : 'border-gray-200 hover:border-indigo-300'} shadow-sm transition-all`}
                        >
                            <div className="mr-3 flex flex-col items-center gap-1">
                                <span className={`flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold ${stop.completed ? 'bg-green-500 text-white' : 'bg-gray-200 text-gray-600'}`}>
                                    {index + 1}
                                </span>
                            </div>
                            
                            <div className="flex-1 min-w-0">
                                <p className={`text-sm font-medium truncate ${stop.completed ? 'text-gray-400 line-through' : 'text-gray-800'}`}>
                                    {stop.display_name}
                                </p>
                            </div>

                            <div className="flex items-center gap-1 ml-2">
                                <button 
                                    onClick={() => toggleComplete(stop.id)}
                                    className={`p-1.5 rounded-md ${stop.completed ? 'text-green-600 bg-green-100' : 'text-gray-400 hover:text-green-600 hover:bg-gray-100'}`}
                                    title="Marcar como feito"
                                >
                                    <CheckCircle size={18} />
                                </button>
                                <button 
                                    onClick={() => openNavigation(stop.lat, stop.lon)}
                                    className={`p-1.5 rounded-md transition-colors ${vehicleConfig.navApp === 'waze' ? 'text-blue-400 hover:text-blue-600 hover:bg-blue-50' : 'text-green-600 hover:bg-green-50'}`}
                                    title={`Navegar com ${vehicleConfig.navApp === 'waze' ? 'Waze' : 'Google Maps'}`}
                                >
                                    <Navigation size={18} />
                                </button>
                                <button 
                                    onClick={() => removeStop(stop.id)}
                                    className="p-1.5 text-red-400 hover:bg-red-50 rounded-md"
                                    title="Remover"
                                >
                                    <Trash2 size={18} />
                                </button>
                            </div>
                        </div>
                    ))
                )}
            </div>

            {/* Rodapé da Sidebar (Botão Sobre visível no mobile aqui) */}
            <div className="p-2 border-t border-gray-100 sm:hidden">
                <button 
                    onClick={() => setShowAbout(true)}
                    className="w-full flex items-center justify-center gap-2 py-2 text-xs font-medium text-gray-500 hover:bg-gray-50 rounded-lg"
                >
                    <Info size={14} /> Sobre o App
                </button>
            </div>

            {/* Botões de Ação */}
            <div className="p-4 border-t border-gray-200 bg-white space-y-3">
                <button 
                    onClick={optimizeRoute}
                    // Melhoria: Botão ativado mesmo offline (para dar feedback)
                    disabled={isOptimizing || stops.length < 2} 
                    className={`w-full py-3 rounded-lg flex items-center justify-center gap-2 font-semibold text-white transition-all
                        ${(isOptimizing || stops.length < 2) ? 'bg-gray-400 cursor-not-allowed' : 'bg-indigo-600 hover:bg-indigo-700 shadow-lg hover:shadow-xl'}
                    `}
                >
                    {isOptimizing ? (
                        <>Processando...</>
                    ) : (
                        // Texto adaptativo
                        <><Layers size={20}/> {isOffline ? 'Traçar Linha (Offline)' : 'Otimizar Rota'}</>
                    )}
                </button>
                
                {/* Melhoria: Botão Download Mapa */}
                <button 
                    onClick={downloadCurrentArea}
                    disabled={isOffline || isDownloadingMap}
                    className={`w-full py-2 rounded-lg flex items-center justify-center gap-2 text-xs font-medium border border-indigo-100 transition-all
                        ${isOffline ? 'text-gray-400 bg-gray-50' : 'text-indigo-600 hover:bg-indigo-50'}
                    `}
                >
                    <CloudRain size={16}/> {isDownloadingMap ? 'Baixando...' : 'Baixar Mapa Desta Área (Offline)'}
                </button>

                <div className="text-[10px] text-center text-gray-400">
                    Dados via OpenStreetMap & OSRM
                </div>
            </div>
        </div>

        {/* Área do Mapa */}
        <div className="flex-1 relative bg-gray-200">
            <div ref={mapContainerRef} className="absolute inset-0 z-0" />
            
            {/* Botão flutuante para reabrir menu no mobile */}
            {!isSidebarOpen && (
                <button 
                    onClick={() => setIsSidebarOpen(true)}
                    className="absolute bottom-6 left-1/2 transform -translate-x-1/2 bg-indigo-600 text-white px-6 py-3 rounded-full shadow-xl flex items-center gap-2 z-[400] font-medium"
                >
                    <Menu size={20}/> Ver Paradas
                </button>
            )}
        </div>

      </div>
    </div>
  );
}
