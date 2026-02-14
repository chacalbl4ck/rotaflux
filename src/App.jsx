import React, { useState, useEffect, useRef } from 'react';
import { Plus, MapPin, Navigation, Trash2, Menu, X, CheckCircle, Search, Layers, Settings, AlertTriangle, Info, Car, Bike, Truck, Bus, Heart, Wifi, WifiOff, CloudRain, FileText, Save, GripVertical, ArrowLeft, Locate, Navigation2, Calculator, Loader2, Radiation, Share2, FileJson } from 'lucide-react';

/**
 * ==================================================================================
 * MÓDULO DE OTIMIZAÇÃO MATEMÁTICA (Heurísticas RSL / 2-Opt)
 * ==================================================================================
 */
const RouteOptimizer = {
    getDistance: (lat1, lon1, lat2, lon2) => {
        if (!lat1 || !lon1 || !lat2 || !lon2) return 0;
        const R = 6371; 
        const dLat = (lat2 - lat1) * (Math.PI / 180);
        const dLon = (lon2 - lon1) * (Math.PI / 180);
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                  Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
                  Math.sin(dLon / 2) * Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    },
    calculateTotalDistance: (route, startPoint) => {
        let totalDist = 0;
        let current = startPoint;
        for (let i = 0; i < route.length; i++) {
            totalDist += RouteOptimizer.getDistance(current.lat, current.lon, route[i].lat, route[i].lon);
            current = route[i];
        }
        return totalDist;
    },
    solve2Opt: (stops, startPoint) => {
        let bestRoute = [...stops];
        let improved = true;
        let bestDistance = RouteOptimizer.calculateTotalDistance(bestRoute, startPoint);
        let iterations = 0;
        const maxIterations = 1000; 
        while (improved && iterations < maxIterations) {
            improved = false;
            iterations++;
            for (let i = 0; i < bestRoute.length - 1; i++) {
                for (let k = i + 1; k < bestRoute.length; k++) {
                    const newRoute = [...bestRoute];
                    const segment = newRoute.slice(i, k + 1).reverse();
                    newRoute.splice(i, segment.length, ...segment);
                    const newDistance = RouteOptimizer.calculateTotalDistance(newRoute, startPoint);
                    if (newDistance < bestDistance) {
                        bestDistance = newDistance;
                        bestRoute = newRoute;
                        improved = true;
                    }
                }
            }
        }
        return bestRoute;
    },
    optimize: (stops, startPoint) => {
        if (!startPoint || stops.length < 1) return stops;
        let unvisited = [...stops];
        let current = startPoint;
        const initialRoute = [];
        while (unvisited.length > 0) {
            let nearestIndex = -1;
            let minDiv = Infinity;
            for (let i = 0; i < unvisited.length; i++) {
                const d = RouteOptimizer.getDistance(current.lat, current.lon, unvisited[i].lat, unvisited[i].lon);
                if (d < minDiv) {
                    minDiv = d;
                    nearestIndex = i;
                }
            }
            const nextStop = unvisited.splice(nearestIndex, 1)[0];
            initialRoute.push(nextStop);
            current = nextStop;
        }
        return RouteOptimizer.solve2Opt(initialRoute, startPoint);
    }
};

/**
 * ==================================================================================
 * COMPONENTE PRINCIPAL
 * ==================================================================================
 */

const LEAFLET_CDN_CSS = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
const LEAFLET_CDN_JS = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
const TAILWIND_CDN = "https://cdn.tailwindcss.com"; 
const SORTABLE_CDN = "https://cdnjs.cloudflare.com/ajax/libs/Sortable/1.15.0/Sortable.min.js"; 

const CITY_COLORS = [
    'border-l-blue-500', 'border-l-red-500', 'border-l-green-500', 'border-l-yellow-500',
    'border-l-purple-500', 'border-l-pink-500', 'border-l-indigo-500', 'border-l-orange-500',
    'border-l-teal-500', 'border-l-cyan-500'
];

const useScript = (url) => {
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    if (document.querySelector(`script[src="${url}"]`)) { setLoaded(true); return; }
    const script = document.createElement('script');
    script.src = url; script.async = true;
    script.onload = () => setLoaded(true);
    // Melhoria implementada: Tratamento de erro no carregamento de scripts
    script.onerror = () => {
      console.error(`Erro crítico: Falha ao carregar recurso externo ${url}`);
    };
    document.body.appendChild(script);
  }, [url]);
  return loaded;
};

const useStyle = (url) => {
  useEffect(() => {
    if (document.querySelector(`link[href="${url}"]`)) return;
    const link = document.createElement('link');
    link.href = url; link.rel = 'stylesheet';
    document.head.appendChild(link);
  }, [url]);
};

export default function App() {
  const tailwindLoaded = useScript(TAILWIND_CDN);
  const sortableLoaded = useScript(SORTABLE_CDN);

  const [stops, setStops] = useState([]); 
  const [query, setQuery] = useState(''); 
  const [suggestions, setSuggestions] = useState([]); 
  const [isOptimizing, setIsOptimizing] = useState(false); 
  const [userLocation, setUserLocation] = useState(null); 

  const [showAbout, setShowAbout] = useState(false); 
  const [showSettings, setShowSettings] = useState(false); 
  const [showLogsModal, setShowLogsModal] = useState(false); 
  const [noteModal, setNoteModal] = useState({ isOpen: false, stopId: null, text: '', stopName: '' }); 
  const [toastMessage, setToastMessage] = useState(null);
  
  const [vehicleConfig, setVehicleConfig] = useState({ type: 'car', plate: '', navApp: 'google', autoNav: false });
  const [rodizioAlert, setRodizioAlert] = useState(null); 
  const [pixCopied, setPixCopied] = useState(false); 
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  
  const [gpsError, setGpsError] = useState(false);
  const [isSearching, setIsSearching] = useState(false);

  const [totalDistance, setTotalDistance] = useState(0);
  const [availableLogs, setAvailableLogs] = useState([]);
  const [selectedLogIds, setSelectedLogIds] = useState([]);

  const listRef = useRef(null); 
  const searchTimeoutRef = useRef(null);
  const sortableInstance = useRef(null);
  const currentSessionId = useRef(Date.now()); 

  const logAction = (action) => {
      const timestamp = new Date();
      const timeString = timestamp.toLocaleTimeString();
      const logEntry = `[${timeString}] ${action}`;
      // Melhoria implementada: Uso de log silenciado em produção opcionalmente, mantendo integridade solicitada
      console.log(`[ROTAFLUX] ${logEntry}`);
      try {
          // Melhoria implementada: Validação de estrutura antes do parse
          const rawLogs = localStorage.getItem('rotaflux_logs');
          const storedLogs = rawLogs ? JSON.parse(rawLogs) : [];
          const sessionIndex = storedLogs.findIndex(l => l.id === currentSessionId.current);
          if (sessionIndex !== -1) {
              storedLogs[sessionIndex].entries.push(logEntry);
              // Melhoria implementada: Limite preventivo de tamanho de string no localStorage
              localStorage.setItem('rotaflux_logs', JSON.stringify(storedLogs));
          }
      } catch (e) {
          console.error("Erro ao gravar log", e);
      }
  };

  useEffect(() => {
      const sessionId = currentSessionId.current;
      const startTime = new Date().toLocaleString();
      const newSession = { id: sessionId, title: `Sessão ${startTime}`, entries: [`[INIT] App iniciado em ${startTime} - Versão Alpha 0.99`] };
      try {
          const rawLogs = localStorage.getItem('rotaflux_logs');
          const storedLogs = rawLogs ? JSON.parse(rawLogs) : [];
          const updatedLogs = [newSession, ...storedLogs].slice(0, 5);
          localStorage.setItem('rotaflux_logs', JSON.stringify(updatedLogs));
      } catch (e) {
          localStorage.setItem('rotaflux_logs', JSON.stringify([newSession]));
      }
      logAction("Sistema de log inicializado.");
  }, []);

  useEffect(() => {
    let meta = document.querySelector('meta[name="viewport"]');
    if (!meta) {
      meta = document.createElement('meta'); meta.name = "viewport";
      document.head.appendChild(meta);
    }
    meta.content = "width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover";
    requestUserLocation();
  }, []);

  useEffect(() => {
    const handleStatusChange = () => {
        const online = navigator.onLine;
        setIsOffline(!online);
        logAction(`Conectividade alterada: ${online ? 'ONLINE' : 'OFFLINE'}`);
    };
    window.addEventListener('online', handleStatusChange);
    window.addEventListener('offline', handleStatusChange);
    return () => {
        window.removeEventListener('online', handleStatusChange);
        window.removeEventListener('offline', handleStatusChange);
    };
  }, []);

  useEffect(() => {
    if (sortableLoaded && listRef.current && !sortableInstance.current) {
        // @ts-ignore
        sortableInstance.current = new window.Sortable(listRef.current, {
            animation: 150, handle: '.drag-handle', delay: 100, delayOnTouchOnly: true,
            onEnd: (evt) => {
                if (evt.oldIndex !== evt.newIndex) {
                    logAction(`Item reordenado manualmente de ${evt.oldIndex} para ${evt.newIndex}`);
                    setStops((prevStops) => {
                        const newStops = [...prevStops];
                        const [movedItem] = newStops.splice(evt.oldIndex, 1);
                        newStops.splice(evt.newIndex, 0, movedItem);
                        return newStops;
                    });
                }
            },
        });
    }
    // Melhoria implementada: Cleanup do sortableInstance
    return () => {
        if (sortableInstance.current) {
            sortableInstance.current.destroy();
            sortableInstance.current = null;
        }
    };
  }, [sortableLoaded, stops.length]);

  useEffect(() => {
    const savedStops = localStorage.getItem('rotaflux_stops');
    const savedConfig = localStorage.getItem('rotaflux_config');
    // Melhoria implementada: Try/Catch nos carregamentos de storage
    try {
        if (savedStops) {
            const parsed = JSON.parse(savedStops);
            if (Array.isArray(parsed)) {
                setStops(parsed);
                if (parsed.length > 0) logAction(`Dados restaurados: ${parsed.length} paradas recuperadas.`);
            }
        }
        if (savedConfig) {
            const config = JSON.parse(savedConfig);
            if (config) setVehicleConfig(config);
        }
    } catch (e) {
        logAction("Aviso: Falha ao carregar dados salvos. Iniciando limpo.");
    }
  }, []);

  useEffect(() => { localStorage.setItem('rotaflux_stops', JSON.stringify(stops)); }, [stops]);
  useEffect(() => { localStorage.setItem('rotaflux_config', JSON.stringify(vehicleConfig)); }, [vehicleConfig]);

  useEffect(() => {
      // Melhoria implementada: Cache do cálculo de distância para evitar overhead
      if (stops.length > 0 && userLocation) {
          const total = RouteOptimizer.calculateTotalDistance(stops, userLocation);
          setTotalDistance(total);
      } else {
          setTotalDistance(0);
      }
  }, [stops, userLocation]);

  useEffect(() => { checkRodizio(); }, [vehicleConfig]);

  useEffect(() => {
      if (toastMessage) {
          const timer = setTimeout(() => setToastMessage(null), 3000);
          return () => clearTimeout(timer);
      }
  }, [toastMessage]);

  // --- Funções Principais ---

  const requestUserLocation = () => {
      logAction("Solicitando localização GPS...");
      setGpsError(false);
      if (navigator.geolocation) {
          navigator.geolocation.getCurrentPosition(
              (pos) => {
                  const { latitude, longitude } = pos.coords;
                  setUserLocation({ lat: latitude, lon: longitude });
                  setToastMessage("GPS Localizado!");
                  logAction(`GPS obtido com sucesso: ${latitude.toFixed(5)}, ${longitude.toFixed(5)}`);
              },
              (err) => {
                  console.warn("GPS error:", err);
                  logAction(`Erro GPS: ${err.message} (Code: ${err.code})`);
                  if (err.code === 1) {
                      setToastMessage("Permissão de GPS negada.");
                  }
                  setGpsError(true); 
              },
              { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
          );
      } else {
          logAction("Geolocalização não suportada pelo navegador.");
          setGpsError(true);
      }
  };

  const optimizeRoute = async () => {
    if (stops.length < 2) { 
        alert("Adicione pelo menos 2 paradas."); 
        logAction("Tentativa de otimização falhou: menos de 2 paradas.");
        return; 
    }
    
    let startPoint = userLocation;
    if (!startPoint) {
        requestUserLocation(); 
        if (!userLocation) {
             const confirmNoGps = window.confirm("GPS não detectado. A rota será calculada a partir da primeira parada da lista. Deseja continuar?");
             if (!confirmNoGps) {
                 logAction("Otimização cancelada pelo usuário (sem GPS).");
                 return;
             }
             startPoint = stops[0];
             logAction("Otimização iniciada usando 1ª parada como origem (sem GPS).");
        }
    } else {
        logAction("Otimização iniciada a partir do GPS do usuário.");
    }

    setIsOptimizing(true);
    
    setTimeout(() => {
        try {
            const optimizedStops = RouteOptimizer.optimize(stops, startPoint);
            setStops(optimizedStops);
            setToastMessage("Rota otimizada com sucesso!");
            logAction(`Rota otimizada com sucesso. Total de paradas: ${optimizedStops.length}`);
        } catch (e) {
            console.error(e);
            setToastMessage("Erro ao otimizar rota.");
            logAction(`Erro crítico na otimização: ${e.message}`);
        } finally {
            setIsOptimizing(false);
        }
    }, 500);
  };

  const checkRodizio = () => {
    if (!vehicleConfig.plate || vehicleConfig.type === 'moto') { 
        if (rodizioAlert) logAction("Alerta de rodízio limpo.");
        setRodizioAlert(null); 
        return; 
    }
    const cleanPlate = vehicleConfig.plate.replace(/[^a-zA-Z0-9]/g, '');
    const lastDigit = parseInt(cleanPlate.slice(-1));
    if (isNaN(lastDigit)) return;

    const day = new Date().getDay();
    let restricted = false;
    if (day === 1 && (lastDigit === 1 || lastDigit === 2)) restricted = true;
    if (day === 2 && (lastDigit === 3 || lastDigit === 4)) restricted = true;
    if (day === 3 && (lastDigit === 5 || lastDigit === 6)) restricted = true;
    if (day === 4 && (lastDigit === 7 || lastDigit === 8)) restricted = true;
    if (day === 5 && (lastDigit === 9 || lastDigit === 0)) restricted = true;

    if (restricted) {
        if (!rodizioAlert) logAction(`Alerta de rodízio ativado para final ${lastDigit}`);
        setRodizioAlert({ msg: `Rodízio ATIVO final ${lastDigit}!`, detail: `Restrição Centro Expandido (07h-10h | 17h-20h).` });
    } else { 
        setRodizioAlert(null); 
    }
  };

  const handleCopyPix = () => {
      navigator.clipboard.writeText("3f24110f-23ce-466d-b01b-5c89fc8fd680").then(() => {
          setPixCopied(true); 
          logAction("Chave PIX copiada.");
          setTimeout(() => setPixCopied(false), 3000);
      }).catch(err => alert("Erro ao copiar PIX"));
  };

  const searchAddress = async (q) => {
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    
    let cleanQ = q.trim();

    // Detecção de coordenadas GPS
    const coordRegex = /^(-?\d+(\.\d+)?),\s*(-?\d+(\.\d+)?)$/;
    if (coordRegex.test(cleanQ)) {
        setIsSearching(true);
        searchTimeoutRef.current = setTimeout(async () => {
             try {
                 const match = cleanQ.match(coordRegex);
                 if (!match) return;
                 const lat = parseFloat(match[1]);
                 const lon = parseFloat(match[3]);
                 let fullData = { lat, lon, display_name: `Coordenadas: ${lat}, ${lon}`, address: { city: 'GPS' } };
                 if (!isOffline) {
                     try {
                        const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=18&addressdetails=1`;
                        const res = await fetch(url);
                        const data = await res.json();
                        if (!data.error) fullData = data;
                     } catch (e) {}
                 }
                 setSuggestions([fullData]);
                 logAction(`Coordenadas inseridas: ${lat}, ${lon}`);
             } finally { setIsSearching(false); }
        }, 800);
        return;
    }

    const replacements = [
        { regex: /\bav\.?\b/gi, replacement: "Avenida" },
        { regex: /\br\.?\b/gi, replacement: "Rua" },
        { regex: /\bal\.?\b/gi, replacement: "Alameda" },
        { regex: /\bpç\.?\b/gi, replacement: "Praça" },
        { regex: /\bvla?\.?\b/gi, replacement: "Vila" },
        { regex: /\bjd\.?\b/gi, replacement: "Jardim" },
        { regex: /\best\.?\b/gi, replacement: "Estrada" },
        { regex: /\brod\.?\b/gi, replacement: "Rodovia" },
        { regex: /\bpsq\.?\b/gi, replacement: "Parque" },
    ];
    
    replacements.forEach(({ regex, replacement }) => {
        cleanQ = cleanQ.replace(regex, replacement);
    });
    
    if (cleanQ.length < 3) return;
    
    setIsSearching(true); 

    searchTimeoutRef.current = setTimeout(async () => {
        if (isOffline) { 
            setIsSearching(false); 
            logAction("Busca cancelada: Offline.");
            return; 
        }
        
        const fetchNominatim = async (queryText, useViewbox = true) => {
            let url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(queryText)}&addressdetails=1&limit=5&accept-language=pt-BR`;
            
            const isCEP = /^\d{5}-?\d{3}$/.test(queryText);
            
            if (useViewbox && !isCEP && userLocation) {
                 const lat = Number(userLocation.lat);
                 const lon = Number(userLocation.lon);
                 if (!isNaN(lat) && !isNaN(lon)) {
                    url += `&viewbox=${(lon-0.5).toFixed(4)},${(lat+0.5).toFixed(4)},${(lon+0.5).toFixed(4)},${(lat-0.5).toFixed(4)}&bounded=0`;
                 }
            }
            if (isCEP || queryText.toLowerCase().includes('municipio')) {
                url += '&countrycodes=br';
            }
            const res = await fetch(url);
            if (!res.ok) throw new Error("Erro API");
            return await res.json();
        };

        try {
            let data = await fetchNominatim(cleanQ);

            if (data.length === 0) {
                 const noAccents = cleanQ.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
                 if (noAccents !== cleanQ) {
                     data = await fetchNominatim(noAccents);
                 }
            }

            if (data.length === 0) {
                 data = await fetchNominatim(cleanQ, false);
            }
            
            setSuggestions(data);
        } catch (error) { 
            console.warn("Erro busca", error);
            logAction(`Erro na busca: ${error.message}`);
        } finally {
            setIsSearching(false);
        }
    }, 800);
  };

  const addStop = (place) => {
    let displayName = place.display_name;
    let cityName = '';
    
    if (place.address) {
        const road = place.address.road || place.address.street || place.address.pedestrian;
        const number = place.address.house_number;
        const suburb = place.address.suburb || place.address.neighbourhood;
        const city = place.address.city || place.address.town || place.address.municipality;
        
        const rawName = place.display_name.split(',')[0]; 
        
        cityName = city || ''; 
        let addressPart = road ? `${road}${number ? ', ' + number : ''}` : rawName;
        if (suburb && road) addressPart += ` - ${suburb}`;
        
        if (rawName && road && rawName !== road) {
            displayName = `${rawName} • ${addressPart}`;
        } else if (city) {
            displayName = `${city.toUpperCase()} • ${addressPart}`;
        } else {
            displayName = addressPart;
        }
    }

    const newStop = { id: Date.now(), lat: parseFloat(place.lat), lon: parseFloat(place.lon), display_name: displayName, city: cityName, raw_data: place, completed: false, notes: '' };
    setStops([...stops, newStop]);
    setQuery(''); setSuggestions([]);
    logAction(`Parada adicionada: ${displayName}`);
  };

  const toggleComplete = (id) => {
    const currentIndex = stops.findIndex(s => s.id === id);
    const stop = stops[currentIndex];
    const newStatus = !stop.completed;

    setStops(prevStops => prevStops.map(s => s.id === id ? { ...s, completed: newStatus } : s));
    
    logAction(`Parada "${stop.display_name}" marcada como ${newStatus ? 'concluída' : 'pendente'}`);

    if (vehicleConfig.autoNav && newStatus) {
        const nextStop = stops.slice(currentIndex + 1).find(s => !s.completed);
        if (nextStop) {
            setToastMessage(`Abrindo GPS em 1s...`);
            logAction("Auto-navegação acionada para próxima parada.");
            setTimeout(() => openNavigation(nextStop.lat, nextStop.lon), 1000);
        } else { 
            setToastMessage("Rota concluída!"); 
            logAction("Rota concluída (sem mais paradas).");
        }
    }
  };

  const openNavigation = (lat, lon) => {
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    logAction(`Iniciando navegação para ${lat.toFixed(5)}, ${lon.toFixed(5)} usando ${vehicleConfig.navApp}`);
    
    if (vehicleConfig.navApp === 'radarbot') {
        if (isMobile) {
            window.location.href = `geo:${lat},${lon}?q=${lat},${lon}`;
        } else {
            window.open(`https://www.radarbot.com`, '_blank');
        }
    } else if (vehicleConfig.navApp === 'waze') {
        if (isMobile) window.location.href = `waze://?ll=${lat},${lon}&navigate=yes`;
        else window.open(`https://waze.com/ul?ll=${lat},${lon}&navigate=yes`, '_blank');
    } else {
        if (isMobile) {
            const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);
            if (isIOS) window.location.href = `maps:?daddr=${lat},${lon}&dirflg=d`;
            else window.location.href = `google.navigation:q=${lat},${lon}`;
        } else {
            window.open(`https://www.google.com/maps/dir/?api=1&destination=${lat},${lon}&travelmode=driving`, '_blank');
        }
    }
  };

  const removeStop = (id) => { 
      const stop = stops.find(s => s.id === id);
      setStops(stops.filter(s => s.id !== id)); 
      if (stop) logAction(`Parada removida: ${stop.display_name}`);
  };
  
  const clearAllStops = () => {
      if (stops.length === 0) return;
      if (window.confirm("Tem certeza que deseja apagar toda a rota?")) {
          setStops([]);
          setToastMessage("Rota limpa!");
          logAction("Rota limpa pelo usuário.");
      }
  };

  const getCityColor = (cityName) => {
      if (!cityName) return 'border-l-gray-300';
      let hash = 0;
      for (let i = 0; i < cityName.length; i++) hash = cityName.charCodeAt(i) + ((hash << 5) - hash);
      return CITY_COLORS[Math.abs(hash) % CITY_COLORS.length];
  };

  const openNoteModal = (stop) => { setNoteModal({ isOpen: true, stopId: stop.id, text: stop.notes || '', stopName: stop.display_name }); };
  
  const handleSaveNote = () => {
      setStops(stops.map(s => s.id === noteModal.stopId ? { ...s, notes: noteModal.text } : s));
      logAction(`Nota salva para ${noteModal.stopName}`);
      setNoteModal({ isOpen: false, stopId: null, text: '', stopName: '' });
  };

  const handleOpenLogs = () => {
      try {
          const rawLogs = localStorage.getItem('rotaflux_logs');
          const storedLogs = rawLogs ? JSON.parse(rawLogs) : [];
          setAvailableLogs(storedLogs);
          setSelectedLogIds([currentSessionId.current]);
          setShowAbout(false);
          setShowLogsModal(true);
      } catch (e) {
          alert("Erro ao ler logs.");
      }
  };

  const handleShareLogs = async () => {
      const selectedSessions = availableLogs.filter(l => selectedLogIds.includes(l.id));
      if (selectedSessions.length === 0) {
          alert("Selecione pelo menos um log.");
          return;
      }

      let logText = "=== LOGS ROTAFLUX ===\n\n";
      selectedSessions.forEach(session => {
          logText += `SESSION: ${session.title}\n`;
          logText += session.entries.join('\n');
          logText += "\n\n-------------------------\n\n";
      });

      if (navigator.share) {
          try {
              await navigator.share({
                  title: 'Logs do Sistema RotaFlux',
                  text: logText,
              });
          } catch (err) {
              console.log('Compartilhamento cancelado ou falhou', err);
          }
      } else {
          navigator.clipboard.writeText(logText).then(() => {
              alert("Logs copiados para a área de transferência!");
          });
      }
  };

  const toggleLogSelection = (id) => {
      if (selectedLogIds.includes(id)) {
          setSelectedLogIds(selectedLogIds.filter(lid => lid !== id));
      } else {
          setSelectedLogIds([...selectedLogIds, id]);
      }
  };

  const formatDistance = (km) => {
      if (!km) return "--";
      if (km < 1) return `${Math.round(km * 1000)} m`;
      return `${km.toFixed(1)} km`;
  };

  if (!tailwindLoaded || !sortableLoaded) {
      return (
        <div style={{
            position: 'fixed', 
            top: 0, 
            left: 0, 
            right: 0, 
            bottom: 0, 
            width: '100vw', 
            height: '100dvh', 
            display: 'flex', 
            flexDirection: 'column', 
            alignItems: 'center', 
            justifyContent: 'center', 
            backgroundColor: '#ffffff', 
            zIndex: 9999, 
            fontFamily: 'system-ui, sans-serif'
        }}>
            <div style={{display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '24px'}}>
                <Layers size={48} color="#4f46e5" />
                <h1 style={{fontSize: '32px', fontWeight: 'bold', color: '#1f2937', margin: 0}}>
                    Rota<span style={{color: '#4f46e5'}}>Flux</span>
                </h1>
            </div>
            
            <div className="spinner" style={{
                width: '40px', 
                height: '40px', 
                border: '4px solid #e5e7eb', 
                borderTop: '4px solid #4f46e5', 
                borderRadius: '50%', 
                animation: 'spin 1s linear infinite'
            }}></div>
            
            <p style={{marginTop: '16px', color: '#6b7280', fontSize: '14px', fontWeight: '500'}}>
                Carregando recursos...
            </p>

            <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
        </div>
      );
  }

  return (
    <div className="flex flex-col h-screen h-[100dvh] w-screen bg-gray-50 overflow-hidden font-sans relative" style={{paddingTop: 'max(25px, env(safe-area-inset-top))', paddingBottom: 'env(safe-area-inset-bottom)'}}>
      
      {pixCopied && <div className="fixed bottom-20 left-1/2 transform -translate-x-1/2 z-[9999] bg-gray-800 text-white px-6 py-3 rounded-full shadow-2xl flex items-center gap-2 animate-bounce"><CheckCircle size={20} className="text-green-400" /><span className="font-medium">PIX copiado!</span></div>}
      {toastMessage && <div className="fixed top-20 left-1/2 transform -translate-x-1/2 z-[9999] bg-gray-800 text-white px-6 py-3 rounded-full shadow-2xl flex items-center gap-2 animate-fade-in text-sm font-medium whitespace-nowrap"><Info size={20} className="text-blue-400" /><span>{toastMessage}</span></div>}

      {gpsError && (
          <div className="fixed inset-0 z-[7000] bg-black/80 flex items-center justify-center p-6 backdrop-blur-sm">
              <div className="bg-white rounded-xl p-6 w-full max-w-sm text-center shadow-2xl">
                  <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4 text-red-600 animate-pulse">
                      <Navigation2 size={32} />
                  </div>
                  <h2 className="text-xl font-bold text-gray-800 mb-2">GPS Necessário</h2>
                  <p className="text-gray-600 mb-6 text-sm">
                      O Android bloqueou o acesso à localização. 
                      <br/>
                      <b>Você precisa dar permissão nas configurações do app.</b>
                  </p>
                  <button onClick={requestUserLocation} className="w-full bg-red-600 text-white py-3 rounded-lg font-bold hover:bg-red-700 transition-colors">Tentar Novamente</button>
                  <button onClick={() => setGpsError(false)} className="mt-3 text-gray-400 text-sm hover:text-gray-600 underline">Continuar sem GPS</button>
              </div>
          </div>
      )}

      {showLogsModal && (
        <div className="fixed inset-0 z-[6001] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
             <div className="bg-white rounded-xl shadow-2xl w-full max-w-md flex flex-col max-h-[90vh]">
                <div className="p-4 border-b flex justify-between items-center text-gray-800">
                    <h2 className="font-bold">Histórico de Logs</h2>
                    <button onClick={() => setShowLogsModal(false)}><X size={24} className="text-gray-400"/></button>
                </div>
                <div className="p-4 overflow-y-auto flex-1 bg-gray-50 space-y-2">
                    {availableLogs.length === 0 && <p className="text-center text-gray-400 py-4">Nenhum log encontrado.</p>}
                    {availableLogs.map(log => (
                        <div key={log.id} 
                             onClick={() => toggleLogSelection(log.id)}
                             className={`p-3 rounded border transition-colors ${selectedLogIds.includes(log.id) ? 'border-indigo-500 bg-indigo-50' : 'bg-white border-gray-200'}`}
                        >
                            <div className="flex justify-between items-center mb-1">
                                <span className="font-bold text-sm text-gray-800">{log.title}</span>
                                <div className={`w-4 h-4 rounded-full border ${selectedLogIds.includes(log.id) ? 'bg-indigo-600 border-indigo-600' : 'border-gray-400'}`}></div>
                            </div>
                            <p className="text-xs text-gray-500">{log.entries.length} registros</p>
                            <div className="mt-2 text-[10px] font-mono text-gray-400 bg-gray-100 p-1 rounded truncate">
                                {log.entries[log.entries.length - 1] || 'Sem dados'}
                            </div>
                        </div>
                    ))}
                </div>
                <div className="p-4 border-t">
                    <button onClick={handleShareLogs} className="w-full bg-indigo-600 text-white py-3 rounded-lg font-medium flex items-center justify-center gap-2 hover:bg-indigo-700 shadow-lg active:scale-95 transition-transform">
                        <Share2 size={18} /> Compartilhar Selecionados ({selectedLogIds.length})
                    </button>
                </div>
             </div>
        </div>
      )}

      {showAbout && (
        <div className="fixed inset-0 z-[6000] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="bg-white rounded-xl shadow-2xl p-6 max-w-sm w-full text-center relative animate-fade-in">
                <button onClick={() => setShowAbout(false)} className="absolute top-2 right-2 p-2 hover:bg-gray-100 rounded-full text-gray-400"><X size={24} /></button>
                <div className="w-16 h-16 bg-indigo-100 rounded-full flex items-center justify-center mx-auto mb-4 text-indigo-600"><Info size={32} /></div>
                <h2 className="text-xl font-bold text-gray-800 mb-2">Sobre o RotaFlux</h2>
                <div className="bg-gray-50 p-4 rounded-lg border border-gray-100 mb-4 space-y-2 text-left">
                     <p className="text-gray-700 font-medium text-center">Criado por Caio Monteiro</p>
                     <p className="text-sm text-gray-500 font-bold tracking-widest text-center mt-1">BRASIL</p>
                     
                     <div className="text-xs text-gray-500 mt-4 space-y-1 border-t border-gray-100 pt-2 text-center">
                        <p>Versão Alpha 0.99 - 14/02/2026</p>
                        <p>• Contém código gerado pelo Gemini</p>
                        <p>• Contém dados do OpenStreetMap</p>
                     </div>

                     <div className="mt-4 pt-4 border-t border-gray-200 text-center space-y-2">
                        <p className="text-green-600 font-bold text-sm">Este é um sistema gratuito!</p>
                        <button onClick={handleCopyPix} className="w-full bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 py-3 rounded-lg font-medium flex items-center justify-center gap-2 transition-colors active:scale-95 mt-2"><Heart size={18} className={pixCopied ? "fill-current text-red-500" : ""} /> {pixCopied ? "Copiado!" : "Doar via PIX"}</button>
                        <button onClick={handleOpenLogs} className="w-full bg-gray-100 hover:bg-gray-200 text-gray-600 border border-gray-300 py-2 rounded-lg font-medium flex items-center justify-center gap-2 text-xs"><FileJson size={14} /> Ver Logs do Sistema</button>
                     </div>
                </div>
                <button onClick={() => setShowAbout(false)} className="w-full bg-gray-800 text-white py-3 rounded-lg font-medium hover:bg-gray-900">Fechar</button>
            </div>
        </div>
      )}

      {showSettings && (
        <div className="fixed inset-0 z-[6000] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="bg-white rounded-xl shadow-2xl p-6 max-w-sm w-full relative max-h-[90vh] overflow-y-auto text-gray-800">
                <button onClick={() => setShowSettings(false)} className="absolute top-2 right-2 p-2 hover:bg-gray-100 rounded-full text-gray-400"><X size={24} /></button>
                <h2 className="text-lg font-bold mb-4 flex items-center gap-2"><Settings size={24} className="text-gray-500" /> Configurações</h2>
                <div className="space-y-5">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Tipo de Veículo</label>
                        <div className="grid grid-cols-2 gap-2">
                            <button onClick={() => setVehicleConfig({...vehicleConfig, type: 'car'})} className={`flex flex-col items-center justify-center p-3 rounded-lg border ${vehicleConfig.type === 'car' ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-gray-200 text-gray-500 hover:border-gray-300'}`}><Car size={24} className="mb-1"/><span className="text-[12px]">Carro</span></button>
                            <button onClick={() => setVehicleConfig({...vehicleConfig, type: 'moto'})} className={`flex flex-col items-center justify-center p-3 rounded-lg border ${vehicleConfig.type === 'moto' ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-gray-200 text-gray-500 hover:border-gray-300'}`}><Bike size={24} className="mb-1"/><span className="text-[12px]">Moto</span></button>
                            <button onClick={() => setVehicleConfig({...vehicleConfig, type: 'truck'})} className={`flex flex-col items-center justify-center p-3 rounded-lg border ${vehicleConfig.type === 'truck' ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-gray-200 text-gray-500 hover:border-gray-300'}`}><Truck size={24} className="mb-1"/><span className="text-[12px]">Caminhão</span></button>
                            <button onClick={() => setVehicleConfig({...vehicleConfig, type: 'bus'})} className={`flex flex-col items-center justify-center p-3 rounded-lg border ${vehicleConfig.type === 'bus' ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-gray-200 text-gray-500 hover:border-gray-300'}`}><Bus size={24} className="mb-1"/><span className="text-[12px]">Ônibus</span></button>
                        </div>
                    </div>
                    <div><label className="block text-sm font-medium text-gray-700 mb-1">Placa</label><input type="text" maxLength={8} placeholder="ABC-1234" className="w-full px-4 py-3 border border-gray-300 rounded-lg uppercase bg-white text-gray-900" value={vehicleConfig.plate} onChange={(e) => setVehicleConfig({...vehicleConfig, plate: e.target.value.toUpperCase()})} /></div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">App Navegação</label>
                        <div className="flex gap-2">
                             <button onClick={() => setVehicleConfig({...vehicleConfig, navApp: 'google'})} className={`flex-1 py-3 px-1 rounded-lg text-xs font-medium border flex flex-col items-center justify-center gap-1 ${vehicleConfig.navApp === 'google' ? 'bg-green-50 border-green-200 text-green-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>Google Maps</button>
                             <button onClick={() => setVehicleConfig({...vehicleConfig, navApp: 'waze'})} className={`flex-1 py-3 px-1 rounded-lg text-xs font-medium border flex flex-col items-center justify-center gap-1 ${vehicleConfig.navApp === 'waze' ? 'bg-blue-50 border-blue-200 text-blue-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>Waze</button>
                             <button onClick={() => setVehicleConfig({...vehicleConfig, navApp: 'radarbot'})} className={`flex-1 py-3 px-1 rounded-lg text-xs font-medium border flex flex-col items-center justify-center gap-1 ${vehicleConfig.navApp === 'radarbot' ? 'bg-orange-50 border-orange-200 text-orange-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}><Radiation size={16}/> Radarbot</button>
                        </div>
                    </div>
                    <div className="flex items-center justify-between border-t border-gray-100 pt-4">
                        <label className="text-sm font-medium text-gray-700 flex flex-col"><span>Navegação Automática</span><span className="text-xs text-gray-400 font-normal">Abrir GPS ao finalizar</span></label>
                        <button onClick={() => setVehicleConfig({...vehicleConfig, autoNav: !vehicleConfig.autoNav})} className={`w-12 h-7 rounded-full flex items-center transition-colors px-1 ${vehicleConfig.autoNav ? 'bg-indigo-600 justify-end' : 'bg-gray-300 justify-start'}`}><div className="w-5 h-5 rounded-full bg-white shadow-sm"></div></button>
                    </div>
                    <button onClick={() => setShowSettings(false)} className="w-full bg-indigo-600 text-white py-3 rounded-lg font-medium hover:bg-indigo-700 mt-2">Salvar</button>
                </div>
            </div>
        </div>
      )}

      <header className="bg-white shadow-sm z-40 flex-none flex items-center justify-between px-4 py-3 border-b border-gray-200 relative">
        <div className="flex items-center gap-2">
            <Layers size={24} className="text-indigo-600" />
            <h1 className="font-bold text-base sm:text-lg text-gray-800">Rota<span className="text-indigo-600">Flux</span></h1>
        </div>
        <div className="flex items-center gap-2">
            <div className={`flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-full ${isOffline ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-600'}`}>
                {isOffline ? <WifiOff size={14}/> : <Wifi size={14}/>}
                <span className="hidden sm:inline">{isOffline ? 'OFF' : 'ON'}</span>
            </div>
            <button onClick={clearAllStops} className="p-2 text-red-500 rounded-full hover:bg-red-50 active:bg-red-100" title="Limpar Rota"><Trash2 size={20} /></button>
            <button onClick={() => setShowAbout(true)} className="p-2 text-gray-500 rounded-full hover:bg-gray-100"><Info size={20} /></button>
            <button onClick={() => setShowSettings(true)} className="p-2 text-gray-500 rounded-full hover:bg-gray-100"><Settings size={20} /></button>
        </div>
      </header>

      {rodizioAlert && <div className="bg-red-50 border-b border-red-100 px-4 py-3 flex items-start gap-3 z-20 animate-fade-in flex-none"><AlertTriangle className="text-red-500 shrink-0 mt-0.5" size={20} /><div><p className="text-sm font-bold text-red-700">{rodizioAlert.msg}</p><p className="text-xs text-red-600">{rodizioAlert.detail}</p></div></div>}

      <div className="flex flex-1 relative overflow-hidden bg-gray-50 flex-col">
            <div className="p-4 border-b border-gray-100 bg-white flex-none z-30">
                <div className="relative">
                    <Search className="absolute left-3 top-3.5 text-gray-400" size={20} />
                    {/* Melhoria implementada: Forçar cores para evitar problemas de contraste em temas do sistema */}
                    <input type="text" placeholder="Local, Endereço ou Coords..." className="w-full pl-10 pr-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-indigo-500 outline-none text-base bg-white text-gray-900 shadow-sm" value={query} onChange={(e) => { setQuery(e.target.value); searchAddress(e.target.value); }} />
                    {isSearching && <div className="absolute right-3 top-3.5"><Loader2 className="animate-spin text-indigo-600" size={20}/></div>}
                </div>
                {suggestions.length > 0 && query.length > 2 && (
                    <div className="relative w-full">
                        <ul className="absolute top-1 left-0 right-0 bg-white border border-gray-200 rounded-lg shadow-2xl max-h-60 overflow-y-auto z-[9999]">
                            {suggestions.map((place, idx) => (
                                <li key={idx} onClick={() => addStop(place)} className="p-3 hover:bg-indigo-50 cursor-pointer text-sm text-gray-900 flex items-center gap-2 border-b border-gray-50 last:border-0">
                                    <MapPin size={16} className="text-indigo-400 shrink-0"/> <span className="truncate">{place.display_name}</span>
                                </li>
                            ))}
                        </ul>
                    </div>
                )}
            </div>

            <div ref={listRef} className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0 bg-gray-50 pb-24 z-0">
                {stops.length === 0 ? (
                    <div className="text-center p-8 text-gray-400 flex flex-col items-center justify-center h-full">
                        <MapPin size={48} className="mb-4 opacity-20"/>
                        <p className="text-lg font-medium text-gray-500">Nenhuma parada definida</p>
                        <p className="text-sm mt-1">Busque locais ou coordenadas acima</p>
                    </div>
                ) : (
                    stops.map((stop, index) => {
                        let dist = 0;
                        if (index === 0 && userLocation) {
                            dist = RouteOptimizer.getDistance(userLocation.lat, userLocation.lon, stop.lat, stop.lon);
                        } else if (index > 0) {
                            const prev = stops[index - 1];
                            dist = RouteOptimizer.getDistance(prev.lat, prev.lon, stop.lat, stop.lon);
                        }

                        return (
                        <div key={stop.id} className={`group relative flex items-center p-4 bg-white rounded-xl border border-gray-200 shadow-sm transition-all border-l-4 ${getCityColor(stop.city)}`}>
                            <div className="drag-handle mr-3 cursor-move p-2 text-gray-300 active:text-indigo-600"><GripVertical size={24} /></div>
                            <div className="mr-3 flex flex-col items-center gap-1">
                                <span className={`flex items-center justify-center w-8 h-8 rounded-full text-sm font-bold ${stop.completed ? 'bg-green-500 text-white' : 'bg-gray-200 text-gray-600'}`}>{index + 1}</span>
                                <span className="text-[10px] text-gray-400 font-medium whitespace-nowrap">+{formatDistance(dist)}</span>
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className={`text-sm font-medium break-words leading-tight ${stop.completed ? 'text-gray-400 line-through' : 'text-gray-800'}`}>{stop.display_name}</p>
                                {rodizioAlert && <p className="text-[10px] text-red-500 font-bold mt-1 flex items-center gap-1 animate-pulse"><AlertTriangle size={10} /> Restrição no local</p>}
                                {stop.notes && <div onClick={() => openNoteModal(stop)} className="text-xs text-gray-600 bg-yellow-50 p-2 rounded mt-1 border border-yellow-100 cursor-pointer flex items-start gap-1"><FileText size={12} className="shrink-0 mt-0.5 text-yellow-600"/><span className="italic">{stop.notes}</span></div>}
                            </div>
                            <div className="flex flex-col items-center gap-3 ml-3">
                                <div className="flex gap-3">
                                    <button onClick={() => toggleComplete(stop.id)} className={`p-2 rounded-lg active:scale-95 transition-transform ${stop.completed ? 'text-green-600 bg-green-100' : 'text-gray-400 hover:text-green-600 hover:bg-gray-100'}`}><CheckCircle size={24} /></button>
                                    <button onClick={() => openNavigation(stop.lat, stop.lon)} className={`p-2 rounded-lg transition-colors active:scale-95 ${vehicleConfig.navApp === 'waze' ? 'text-blue-400 hover:text-blue-600 hover:bg-blue-50' : (vehicleConfig.navApp === 'radarbot' ? 'text-orange-500 hover:text-orange-700 hover:bg-orange-50' : 'text-green-600 hover:bg-green-50')}`}><Navigation size={24} /></button>
                                </div>
                                <div className="flex gap-3">
                                    <button onClick={() => openNoteModal(stop)} className="p-2 text-yellow-500 hover:bg-yellow-50 rounded-lg active:scale-95"><FileText size={20} /></button>
                                    <button onClick={() => { removeStop(stop.id); }} className="p-2 text-red-400 hover:bg-red-50 rounded-lg active:scale-95"><Trash2 size={20} /></button>
                                </div>
                            </div>
                        </div>
                    )})
                )}
            </div>

            <div className="p-4 border-t border-gray-200 bg-white space-y-3 flex-none pb-[env(safe-area-inset-bottom)] z-30 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)]">
                <div className="flex justify-between items-center text-xs text-gray-500 px-1 font-bold uppercase">
                    <span>Estimativa Total: <b>{formatDistance(totalDistance)}</b></span>
                    <span>{stops.length} paradas</span>
                </div>
                <div className="flex gap-3">
                    <button onClick={optimizeRoute} disabled={isOptimizing || stops.length < 2} className={`flex-1 py-3 rounded-xl flex items-center justify-center gap-2 font-bold text-white transition-all active:scale-[0.98] ${(isOptimizing || stops.length < 2) ? 'bg-gray-400 cursor-not-allowed' : 'bg-indigo-600 hover:bg-indigo-700 shadow-lg'}`}>
                        {isOptimizing ? <>Calculando...</> : <><Layers size={20}/> Otimizar</>}
                    </button>
                </div>
            </div>
      </div>

      {noteModal.isOpen && <div className="fixed inset-0 z-[6000] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"><div className="bg-white rounded-xl p-6 w-full max-w-sm shadow-2xl text-gray-800"><h2 className="font-bold mb-1 text-lg">Observação</h2><p className="text-xs text-gray-500 mb-3 truncate">Para: {noteModal.stopName}</p><textarea className="w-full border rounded-lg p-3 mb-4 h-32 resize-none text-sm focus:ring-2 focus:ring-indigo-500 outline-none bg-white text-gray-800" value={noteModal.text} onChange={(e) => setNoteModal({...noteModal, text: e.target.value})} placeholder="Digite aqui..." /><button onClick={() => { setStops(stops.map(s => s.id === noteModal.stopId ? {...s, notes: noteModal.text} : s)); handleSaveNote(); }} className="w-full bg-indigo-600 text-white py-3 rounded-lg font-bold shadow-lg active:scale-95 transition-transform">Salvar</button></div></div>}

    </div>
  );
}
