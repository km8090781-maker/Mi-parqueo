import React, { useState, useEffect, useMemo } from 'react';
import { initializeApp } from 'firebase/app';
import { 
  getFirestore, collection, addDoc, updateDoc, doc, 
  onSnapshot, query, setDoc, deleteDoc, getDoc 
} from 'firebase/firestore';
import { 
  getAuth, signInAnonymously, onAuthStateChanged, signInWithCustomToken 
} from 'firebase/auth';
import { 
  Car, LogIn, LogOut, LayoutDashboard, Map, 
  Settings, History, Clock, AlertCircle, 
  Search, Plus, X, Camera, Printer, 
  Menu, ChevronRight, Bell, CheckCircle, QrCode, Sliders,
  FileText, Download, TrendingUp, Calendar as CalendarIcon
} from 'lucide-react';

// --- Configuración de Firebase ---
const firebaseConfig = JSON.parse(__firebase_config);
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const appId = typeof __app_id !== 'undefined' ? __app_id : 'parkpro-reports-v3';

// --- Tarifas y Tipos ---
const VEHICLE_TYPES = {
  CAR: { id: 'car', label: 'Automóvil', rate: 3.00 },
  MOTO: { id: 'moto', label: 'Motocicleta', rate: 1.50 },
  TRUCK: { id: 'truck', label: 'Camioneta', rate: 5.00 }
};

const SECTORS_LIST = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

// --- Función para Cargar jsPDF dinámicamente ---
const loadJsPDF = () => {
  return new Promise((resolve) => {
    if (window.jspdf) return resolve(window.jspdf);
    const script = document.createElement('script');
    script.src = "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js";
    script.onload = () => {
      const autoTableScript = document.createElement('script');
      autoTableScript.src = "https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.5.25/jspdf.plugin.autotable.min.js";
      autoTableScript.onload = () => resolve(window.jspdf);
      document.head.appendChild(autoTableScript);
    };
    document.head.appendChild(script);
  });
};

export default function App() {
  const [user, setUser] = useState(null);
  const [activeTab, setActiveTab] = useState('home');
  const [vehicles, setVehicles] = useState([]);
  const [history, setHistory] = useState([]);
  const [settings, setSettings] = useState({ sectors: ['A', 'B', 'C'], spacesPerSector: 12 });
  const [loading, setLoading] = useState(true);
  
  // Modales
  const [modal, setModal] = useState(null); 
  const [selectedVehicle, setSelectedVehicle] = useState(null);
  const [ticketType, setTicketType] = useState('entry');

  // Inicialización
  useEffect(() => {
    const initAuth = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }
      } catch (err) { console.error("Error Auth:", err); }
    };
    initAuth();
    loadJsPDF(); // Cargar librería de PDF en segundo plano
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      if (u) setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Listeners Firestore
  useEffect(() => {
    if (!user) return;
    const vCol = collection(db, 'artifacts', appId, 'public', 'data', 'active_vehicles');
    const hCol = collection(db, 'artifacts', appId, 'public', 'data', 'history');
    const sDoc = doc(db, 'artifacts', appId, 'public', 'data', 'settings');

    const unsubV = onSnapshot(vCol, (snap) => setVehicles(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
    const unsubH = onSnapshot(hCol, (snap) => setHistory(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
    const unsubS = onSnapshot(sDoc, (snap) => snap.exists() && setSettings(snap.data()));

    return () => { unsubV(); unsubH(); unsubS(); };
  }, [user]);

  // Handlers
  const handleCheckIn = async (data) => {
    try {
      const newEntry = { ...data, entryTime: new Date().toISOString(), status: 'parked' };
      const docRef = await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'active_vehicles'), newEntry);
      setSelectedVehicle({ ...newEntry, id: docRef.id });
      setTicketType('entry');
      setModal('ticket');
    } catch (e) { console.error(e); }
  };

  const handleCheckOut = async (vehicle) => {
    const now = new Date();
    const entry = new Date(vehicle.entryTime);
    const diffHours = Math.max(1, Math.ceil((now - entry) / (1000 * 60 * 60)));
    const total = diffHours * (VEHICLE_TYPES[vehicle.type.toUpperCase()]?.rate || 2);
    
    const checkoutData = { ...vehicle, exitTime: now.toISOString(), totalAmount: total, paymentMethod: 'Efectivo' };
    try {
      await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'history'), checkoutData);
      await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'active_vehicles', vehicle.id));
      setSelectedVehicle(checkoutData);
      setTicketType('exit');
      setModal('ticket');
    } catch (e) { console.error(e); }
  };

  const exportPDF = async (type = 'daily') => {
    const { jsPDF } = await loadJsPDF();
    const doc = new jsPDF();
    const today = new Date().toLocaleDateString();
    const currentMonth = new Date().toLocaleString('es-ES', { month: 'long', year: 'numeric' });

    const filteredData = type === 'daily' 
      ? history.filter(h => new Date(h.exitTime).toLocaleDateString() === today)
      : history.filter(h => new Date(h.exitTime).getMonth() === new Date().getMonth());

    const title = type === 'daily' ? `Reporte Diario - ${today}` : `Reporte Mensual - ${currentMonth}`;
    
    doc.setFontSize(18);
    doc.text("ParkPro - Sistema de Gestión", 14, 20);
    doc.setFontSize(12);
    doc.text(title, 14, 30);

    const totalRevenue = filteredData.reduce((acc, curr) => acc + curr.totalAmount, 0);
    doc.text(`Total Recaudado: $${totalRevenue.toFixed(2)}`, 14, 40);
    doc.text(`Total Servicios: ${filteredData.length}`, 14, 48);

    const tableRows = filteredData.map(h => [
      new Date(h.exitTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      h.plate,
      h.space,
      h.type,
      `$${h.totalAmount.toFixed(2)}`
    ]);

    doc.autoTable({
      startY: 55,
      head: [['Hora', 'Patente', 'Espacio', 'Tipo', 'Monto']],
      body: tableRows,
      theme: 'grid',
      headStyles: { fillColor: [37, 99, 235] }
    });

    doc.save(`ParkPro_${type}_${new Date().toISOString().slice(0,10)}.pdf`);
  };

  if (loading) return <LoadingScreen />;

  return (
    <div className="flex flex-col h-screen bg-slate-50 text-slate-900 overflow-hidden font-sans">
      <header className="bg-white border-b px-5 py-4 flex justify-between items-center z-10 shadow-sm">
        <div className="flex items-center gap-2">
          <div className="bg-blue-600 p-1.5 rounded-lg text-white"><Car size={20} /></div>
          <h1 className="font-black text-xl tracking-tight text-slate-800 uppercase">ParkPro</h1>
        </div>
        <div className="flex gap-4"><Bell size={22} className="text-slate-300" /></div>
      </header>

      <main className="flex-1 overflow-y-auto pb-24">
        {activeTab === 'home' && <DashboardView vehicles={vehicles} history={history} setModal={setModal} settings={settings} />}
        {activeTab === 'active' && <ActiveList vehicles={vehicles} onCheckOut={(v) => { setSelectedVehicle(v); setModal('checkout'); }} />}
        {activeTab === 'reports' && <ReportsView history={history} onExport={exportPDF} />}
        {activeTab === 'more' && <MoreMenu setModal={setModal} settings={settings} history={history} />}
      </main>

      <nav className="bg-white border-t flex justify-around items-center py-3 px-2 fixed bottom-0 w-full z-20 shadow-lg">
        <TabButton id="home" icon={LayoutDashboard} label="Inicio" active={activeTab} onClick={setActiveTab} />
        <TabButton id="active" icon={Clock} label="Playa" active={activeTab} onClick={setActiveTab} />
        <div className="relative -top-6">
          <button onClick={() => setModal('entry')} className="bg-blue-600 text-white p-4 rounded-full shadow-xl active:scale-90 ring-4 ring-white"><Plus size={28} /></button>
        </div>
        <TabButton id="reports" icon={FileText} label="Reportes" active={activeTab} onClick={setActiveTab} />
        <TabButton id="more" icon={Menu} label="Ajustes" active={activeTab} onClick={setActiveTab} />
      </nav>

      {/* Modales */}
      {modal === 'entry' && <EntryModal onClose={() => setModal(null)} onSubmit={handleCheckIn} settings={settings} />}
      {modal === 'checkout' && <CheckOutModal vehicle={selectedVehicle} onClose={() => setModal(null)} onConfirm={handleCheckOut} />}
      {modal === 'ticket' && <TicketModal vehicle={selectedVehicle} type={ticketType} onClose={() => setModal(null)} />}
      {modal === 'qr_scan' && <QRScannerModal onClose={() => setModal(null)} vehicles={vehicles} onFound={(v) => { setSelectedVehicle(v); setModal('checkout'); }} />}
      {modal === 'settings' && <SettingsModal onClose={() => setModal(null)} settings={settings} onSave={async (s, sp) => { await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'settings'), { sectors: s, spacesPerSector: sp }); setModal(null); }} />}
    </div>
  );
}

// --- Componentes UI ---

const TabButton = ({ id, icon: Icon, label, active, onClick }) => (
  <button onClick={() => onClick(id)} className={`flex flex-col items-center gap-1 transition-colors ${active === id ? 'text-blue-600' : 'text-slate-400'}`}>
    <Icon size={22} />
    <span className="text-[10px] font-bold uppercase tracking-tighter">{label}</span>
  </button>
);

const DashboardView = ({ vehicles, history, setModal, settings }) => {
  const totalCapacity = settings.sectors.length * settings.spacesPerSector;
  const today = new Date().toLocaleDateString();
  const revenueToday = history.filter(h => new Date(h.exitTime).toLocaleDateString() === today).reduce((acc, curr) => acc + curr.totalAmount, 0);

  return (
    <div className="p-5 space-y-5">
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-blue-600 text-white p-5 rounded-3xl shadow-lg">
          <p className="opacity-70 text-[10px] font-bold uppercase mb-1 tracking-widest">Ocupación</p>
          <div className="flex items-baseline gap-1"><span className="text-3xl font-black">{vehicles.length}</span><span className="opacity-50 text-sm">/ {totalCapacity}</span></div>
          <div className="w-full bg-white/20 h-1 rounded-full mt-3 overflow-hidden"><div className="bg-white h-full" style={{ width: `${(vehicles.length / totalCapacity) * 100}%` }}></div></div>
        </div>
        <div className="bg-white p-5 rounded-3xl border shadow-sm">
          <p className="text-slate-400 text-[10px] font-bold uppercase mb-1 tracking-widest">Caja Hoy</p>
          <p className="text-2xl font-black text-slate-800">${revenueToday.toFixed(0)}</p>
          <div className="flex items-center gap-1 text-green-500 text-[10px] font-bold mt-1"><TrendingUp size={10} /> +12% vs ayer</div>
        </div>
      </div>

      <button onClick={() => setModal('qr_scan')} className="w-full bg-slate-800 text-white p-5 rounded-2xl flex items-center justify-between font-bold">
        <div className="flex items-center gap-3"><QrCode size={20} className="text-blue-400" /> Cobro con Ticket QR</div>
        <ChevronRight size={18} className="opacity-40" />
      </button>

      <div className="bg-white rounded-3xl border p-5 shadow-sm">
        <h3 className="font-black text-slate-800 text-xs uppercase mb-4 tracking-widest flex items-center gap-2"><Clock size={14} className="text-blue-600"/> En Playa Recientemente</h3>
        <div className="space-y-4">
          {vehicles.slice(-3).reverse().map(v => (
            <div key={v.id} className="flex items-center justify-between border-b border-slate-50 pb-3 last:border-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center font-bold">{v.space}</div>
                <div>
                  <p className="font-mono font-bold text-sm uppercase">{v.plate}</p>
                  <p className="text-[10px] text-slate-400 uppercase font-bold italic">Ingreso {new Date(v.entryTime).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</p>
                </div>
              </div>
              <ChevronRight size={14} className="text-slate-200" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

const ActiveList = ({ vehicles, onCheckOut }) => (
  <div className="p-5 space-y-3">
    <div className="flex justify-between items-center mb-2 px-1">
      <h2 className="font-black text-xl text-slate-800">Vehículos en Playa</h2>
      <span className="bg-blue-100 text-blue-600 px-3 py-1 rounded-full text-xs font-black">{vehicles.length} Activos</span>
    </div>
    {vehicles.map(v => (
      <div key={v.id} className="bg-white p-4 rounded-2xl border shadow-sm flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="bg-slate-50 w-14 h-14 rounded-2xl flex flex-col items-center justify-center border border-slate-100">
            <span className="text-[8px] text-slate-400 font-black uppercase">Espacio</span>
            <span className="font-black text-blue-600 text-lg leading-none">{v.space}</span>
          </div>
          <div>
            <h4 className="font-mono font-black text-lg uppercase leading-none tracking-tight">{v.plate}</h4>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-[10px] bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded font-bold uppercase">{v.type}</span>
              <span className="text-[10px] text-slate-400 font-bold">{new Date(v.entryTime).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
            </div>
          </div>
        </div>
        <button onClick={() => onCheckOut(v)} className="bg-red-50 text-red-600 p-4 rounded-xl active:scale-90 transition shadow-sm shadow-red-100">
          <LogOut size={22} />
        </button>
      </div>
    ))}
  </div>
);

const ReportsView = ({ history, onExport }) => {
  const today = new Date().toLocaleDateString();
  const currentMonth = new Date().getMonth();
  
  const dailyHistory = history.filter(h => new Date(h.exitTime).toLocaleDateString() === today);
  const monthlyHistory = history.filter(h => new Date(h.exitTime).getMonth() === currentMonth);

  const dailyTotal = dailyHistory.reduce((acc, curr) => acc + curr.totalAmount, 0);
  const monthlyTotal = monthlyHistory.reduce((acc, curr) => acc + curr.totalAmount, 0);

  return (
    <div className="p-5 space-y-6">
      <h2 className="font-black text-2xl text-slate-800">Reportes de Caja</h2>

      <div className="bg-white p-6 rounded-3xl border shadow-sm border-l-4 border-l-blue-600">
        <div className="flex justify-between items-start mb-4">
          <div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Resumen del Día</p>
            <h3 className="text-3xl font-black text-slate-800">${dailyTotal.toFixed(2)}</h3>
          </div>
          <button onClick={() => onExport('daily')} className="bg-blue-600 text-white p-3 rounded-2xl shadow-lg active:scale-95 transition">
            <Download size={20} />
          </button>
        </div>
        <div className="grid grid-cols-2 gap-4 mt-6 text-center border-t pt-4 border-slate-50">
          <div><p className="text-lg font-black">{dailyHistory.length}</p><p className="text-[10px] font-bold text-slate-400 uppercase">Ingresos</p></div>
          <div className="border-l border-slate-50"><p className="text-lg font-black text-blue-600">${(dailyTotal / (dailyHistory.length || 1)).toFixed(1)}</p><p className="text-[10px] font-bold text-slate-400 uppercase">Promedio</p></div>
        </div>
      </div>

      <div className="bg-slate-800 p-6 rounded-3xl shadow-xl text-white">
        <div className="flex justify-between items-start mb-4">
          <div>
            <p className="text-[10px] font-black opacity-50 uppercase tracking-widest">Resumen Mensual</p>
            <h3 className="text-3xl font-black">${monthlyTotal.toFixed(2)}</h3>
          </div>
          <button onClick={() => onExport('monthly')} className="bg-white/20 text-white p-3 rounded-2xl active:scale-95 transition">
            <Download size={20} />
          </button>
        </div>
        <div className="flex items-center gap-2 mt-4 text-[11px] font-bold opacity-70 bg-white/10 p-2 rounded-xl">
          <CalendarIcon size={14} /> Período: {new Date().toLocaleString('es-ES', { month: 'long', year: 'numeric' })}
        </div>
      </div>

      <div className="bg-white rounded-3xl border shadow-sm overflow-hidden">
        <div className="p-5 border-b flex justify-between items-center bg-slate-50">
          <h4 className="font-black text-xs uppercase tracking-widest text-slate-500">Últimos Cobros</h4>
          <span className="text-[10px] font-black text-blue-600">VER TODOS</span>
        </div>
        <div className="divide-y divide-slate-50">
          {history.slice(-5).reverse().map(h => (
            <div key={h.id} className="p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="bg-slate-100 p-2 rounded-lg text-slate-400"><History size={16}/></div>
                <div><p className="font-mono font-bold text-sm uppercase">{h.plate}</p><p className="text-[9px] text-slate-400 uppercase font-black">{new Date(h.exitTime).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</p></div>
              </div>
              <p className="font-black text-green-600">${h.totalAmount.toFixed(2)}</p>
            </div>
          ))}
          {history.length === 0 && <p className="p-8 text-center text-slate-300 text-xs">Aún no hay registros de caja.</p>}
        </div>
      </div>
    </div>
  );
};

const SettingsModal = ({ onClose, settings, onSave }) => {
  const [numSectors, setNumSectors] = useState(settings.sectors.length);
  const [spaces, setSpaces] = useState(settings.spacesPerSector);

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-6">
      <div className="bg-white w-full max-w-sm rounded-[40px] p-8 animate-in zoom-in duration-200 shadow-2xl">
        <h2 className="text-2xl font-black mb-2 text-slate-800">Configurar Playa</h2>
        <p className="text-slate-400 text-sm mb-8 leading-tight">Define la capacidad de tu establecimiento.</p>
        <div className="space-y-6">
          <div>
            <label className="text-[10px] font-black uppercase text-slate-400 mb-2 block">Número de Sectores</label>
            <div className="flex items-center gap-4">
              <input type="range" min="1" max="10" value={numSectors} onChange={e => setNumSectors(e.target.value)} className="flex-1 accent-blue-600" />
              <span className="font-black text-blue-600 bg-blue-50 w-10 h-10 rounded-xl flex items-center justify-center">{numSectors}</span>
            </div>
          </div>
          <div>
            <label className="text-[10px] font-black uppercase text-slate-400 mb-2 block">Espacios por Sector</label>
            <input type="number" value={spaces} onChange={e => setSpaces(e.target.value)} className="w-full bg-slate-50 border-0 p-4 rounded-2xl font-black focus:ring-2 focus:ring-blue-600 outline-none" />
          </div>
          <div className="flex gap-3 pt-4">
            <button onClick={onClose} className="flex-1 py-4 font-bold text-slate-400">DESCARTAR</button>
            <button onClick={() => onSave(SECTORS_LIST.slice(0, numSectors), parseInt(spaces))} className="flex-2 bg-blue-600 text-white py-4 px-8 rounded-2xl font-black shadow-lg">GUARDAR</button>
          </div>
        </div>
      </div>
    </div>
  );
};

const EntryModal = ({ onClose, onSubmit, settings }) => {
  const [data, setData] = useState({ plate: '', type: 'car', space: '' });
  const [error, setError] = useState('');

  const submit = () => {
    if (!data.plate || !data.space) return;
    const sector = data.space.charAt(0);
    const num = parseInt(data.space.slice(1));
    if (!settings.sectors.includes(sector) || isNaN(num) || num > settings.spacesPerSector) {
      setError("Espacio inválido o inexistente.");
      return;
    }
    onSubmit(data);
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-end">
      <div className="bg-white w-full rounded-t-[40px] p-8 animate-in slide-in-from-bottom duration-300 shadow-2xl">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-black">Nuevo Ingreso</h2>
          <button onClick={onClose} className="p-2 bg-slate-100 rounded-full"><X size={20}/></button>
        </div>
        <div className="space-y-5">
          <div>
            <label className="text-[10px] font-black uppercase text-slate-400 mb-1 block tracking-widest">Patente / Placa</label>
            <input autoFocus className="w-full bg-slate-100 border-0 p-5 rounded-2xl font-mono text-2xl uppercase font-black focus:ring-2 focus:ring-blue-600 outline-none" placeholder="ABC 123" value={data.plate} onChange={e => setData({...data, plate: e.target.value.toUpperCase()})} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-[10px] font-black uppercase text-slate-400 mb-1 block tracking-widest">Vehículo</label>
              <select className="w-full bg-slate-100 border-0 p-4 rounded-2xl font-bold outline-none" value={data.type} onChange={e => setData({...data, type: e.target.value})}>
                {Object.values(VEHICLE_TYPES).map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[10px] font-black uppercase text-slate-400 mb-1 block tracking-widest">Espacio</label>
              <input className="w-full bg-slate-100 border-0 p-4 rounded-2xl font-black uppercase outline-none" placeholder="Ej: A5" value={data.space} onChange={e => setData({...data, space: e.target.value.toUpperCase()})} />
            </div>
          </div>
          {error && <p className="text-red-500 text-[10px] font-black text-center uppercase">{error}</p>}
          <button onClick={submit} className="w-full bg-blue-600 text-white font-black py-5 rounded-3xl shadow-xl active:scale-95 transition mt-4">INGRESAR Y GENERAR QR</button>
        </div>
      </div>
    </div>
  );
};

const TicketModal = ({ vehicle, type, onClose }) => (
  <div className="fixed inset-0 bg-slate-900/95 backdrop-blur-md z-[400] p-6 flex items-center justify-center">
    <div className="bg-white w-full max-w-xs rounded-3xl p-6 font-mono text-[10px] shadow-2xl animate-in zoom-in duration-300">
      <div className="text-center mb-4 border-b border-dashed pb-3 border-slate-200">
        <h3 className="font-black text-lg tracking-tight uppercase">ParkPro Parking</h3>
        <p className="text-[8px] text-slate-400 uppercase tracking-[2px] mt-1">{type === 'entry' ? 'Ticket de Entrada' : 'Comprobante de Pago'}</p>
      </div>
      <div className="space-y-1.5 mb-4">
        <div className="flex justify-between"><span>FECHA:</span> <span>{new Date().toLocaleDateString()}</span></div>
        <div className="flex justify-between"><span>PLACA:</span> <span className="font-black">{vehicle.plate}</span></div>
        <div className="flex justify-between"><span>ESPACIO:</span> <span className="font-black text-blue-600">{vehicle.space}</span></div>
        <div className="flex justify-between"><span>INGRESO:</span> <span>{new Date(vehicle.entryTime).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</span></div>
        {type === 'exit' && (
          <div className="flex justify-between pt-2 border-t font-black text-xs mt-2">
            <span>TOTAL PAGADO:</span> <span className="text-blue-600">${vehicle.totalAmount.toFixed(2)}</span>
          </div>
        )}
      </div>
      <div className="bg-slate-50 p-4 rounded-2xl flex flex-col items-center gap-2">
        <div className="w-24 h-24 bg-slate-900 p-2 rounded-xl grid grid-cols-5 gap-0.5 overflow-hidden">
          {Array.from({ length: 25 }).map((_, i) => <div key={i} className={`rounded-sm ${Math.random() > 0.4 ? 'bg-white' : 'bg-transparent'}`}></div>)}
        </div>
        <p className="text-[7px] text-slate-300 font-black tracking-widest uppercase">{vehicle.id}</p>
      </div>
      <button onClick={onClose} className="mt-6 w-full bg-blue-600 text-white py-4 rounded-2xl font-black shadow-lg uppercase tracking-widest text-[11px]">Continuar</button>
    </div>
  </div>
);

const MoreMenu = ({ setModal, settings, history }) => (
  <div className="p-5 space-y-4">
    <h2 className="font-black text-2xl mb-4 text-slate-800">Ajustes Generales</h2>
    <div className="bg-white rounded-3xl border overflow-hidden shadow-sm">
      <div onClick={() => setModal('settings')} className="p-5 border-b flex items-center justify-between active:bg-slate-50">
        <div className="flex items-center gap-3 text-slate-700 font-bold text-sm"><Settings size={20} className="text-blue-500"/> Capacidad de Parqueo</div>
        <span className="text-[10px] font-black text-slate-400 uppercase">{settings.sectors.length * settings.spacesPerSector} ESPACIOS</span>
      </div>
      <div className="p-5 border-b flex items-center justify-between active:bg-slate-50">
        <div className="flex items-center gap-3 text-slate-700 font-bold text-sm"><History size={20} className="text-blue-500"/> Historial Completo</div>
        <span className="bg-slate-100 text-slate-500 px-2 py-0.5 rounded text-[10px] font-black">{history.length}</span>
      </div>
      <div className="p-5 flex items-center justify-between active:bg-slate-50 opacity-40">
        <div className="flex items-center gap-3 text-slate-700 font-bold text-sm"><Printer size={20} className="text-blue-500"/> Impresora Bluetooth</div>
        <span className="text-[9px] font-black">DESCONECTADO</span>
      </div>
    </div>
  </div>
);

const CheckOutModal = ({ vehicle, onClose, onConfirm }) => {
  const diffHours = Math.max(1, Math.ceil((new Date() - new Date(vehicle.entryTime)) / (1000 * 60 * 60)));
  const total = diffHours * (VEHICLE_TYPES[vehicle.type.toUpperCase()]?.rate || 2);
  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[100] flex items-end">
      <div className="bg-white w-full rounded-t-[40px] p-8 text-center animate-in slide-in-from-bottom duration-300">
        <h2 className="text-2xl font-black mb-1">Finalizar Servicio</h2>
        <p className="text-slate-400 font-mono font-bold uppercase mb-6 tracking-[2px]">{vehicle.plate}</p>
        <div className="bg-blue-50 rounded-3xl p-6 mb-8 border border-blue-100">
          <p className="text-[10px] font-black text-blue-400 uppercase mb-1">Monto a Cobrar</p>
          <span className="text-4xl font-black text-blue-600">${total.toFixed(2)}</span>
          <p className="text-[10px] font-bold text-blue-300 mt-2 uppercase tracking-widest">{diffHours} Hora(s) de estadía</p>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <button onClick={onClose} className="bg-slate-100 py-5 rounded-3xl font-bold text-slate-400 uppercase text-xs">Atrás</button>
          <button onClick={() => onConfirm(vehicle)} className="bg-green-600 text-white py-5 rounded-3xl font-black shadow-lg shadow-green-100 uppercase text-xs">PAGADO</button>
        </div>
      </div>
    </div>
  );
};

const QRScannerModal = ({ onClose, vehicles, onFound }) => {
  useEffect(() => {
    const timer = setTimeout(() => vehicles.length > 0 && onFound(vehicles[0]), 2000);
    return () => clearTimeout(timer);
  }, [vehicles]);
  return (
    <div className="fixed inset-0 bg-slate-900 z-[300] flex flex-col items-center justify-center text-white p-6">
      <button onClick={onClose} className="absolute top-10 right-10 text-white/50"><X size={32}/></button>
      <div className="relative w-64 h-64 border-4 border-blue-500/30 rounded-3xl overflow-hidden flex items-center justify-center">
        <div className="absolute top-0 left-0 w-full h-1 bg-blue-500 shadow-lg animate-scan"></div>
        <QrCode size={100} className="text-white/10" />
      </div>
      <p className="mt-10 font-black text-sm uppercase tracking-[3px] text-center">Escaneando Ticket...</p>
    </div>
  );
};

const LoadingScreen = () => (
  <div className="h-screen flex flex-col items-center justify-center bg-white">
    <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
    <p className="mt-4 font-black text-slate-300 text-[10px] uppercase tracking-[5px]">ParkPro</p>
  </div>
);

if (typeof document !== 'undefined') {
  const style = document.createElement('style');
  style.innerHTML = `@keyframes scan { 0% { top: 0%; } 100% { top: 100%; } } .animate-scan { animation: scan 2s infinite ease-in-out; position: absolute; }`;
  document.head.appendChild(style);
}
