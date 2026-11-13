import React, { useEffect, useState, useRef, useMemo } from 'react';
import {
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  User,
} from 'firebase/auth';
import {
  collection,
  doc,
  onSnapshot,
  setDoc,
  updateDoc,
  deleteDoc,
  writeBatch,
  query,
  where,
  serverTimestamp,
  orderBy,
} from 'firebase/firestore';
import {
  auth,
  db,
  googleProvider,
  handleFirestoreError,
  OperationType,
} from './firebase';
import {
  Machine,
  CatalogPart,
  FactorySettings,
  ProductionLog,
  InefficiencyReason,
  DowntimeLog,
  InefficiencyCategory,
  MachineStatus,
  ShiftId,
  SectorId,
  ProductionOrder,
  ScheduleColor,
  AssistanceOrder,
} from './types';
import {
  INITIAL_MACHINES,
  INITIAL_CATALOG_PARTS,
  INITIAL_FACTORY_SETTINGS,
  INITIAL_INEFFICIENCY_REASONS,
  INITIAL_PRODUCTION_ORDERS,
  INITIAL_ASSISTANCE_ORDERS,
} from './seedData';
import { MachineTerminal } from './components/MachineTerminal';
import { FactoryDashboard } from './components/FactoryDashboard';
import { MachineAndCatalogManager } from './components/MachineAndCatalogManager';
import { MasterProductionPlan } from './components/MasterProductionPlan';
import { MultilineaLogo } from './components/MultilineaLogo';
import { FactoryPresentationModal } from './components/FactoryPresentationModal';
import { CorteDeliveryReport } from './components/CorteDeliveryReport';
import { AssistancePlanManager } from './components/AssistancePlanManager';
import {
  LogIn,
  LogOut,
  ShieldAlert,
  LayoutDashboard,
  Layers,
  Laptop,
  Database,
  Presentation,
  BarChart3,
  Wrench,
} from 'lucide-react';

type ActiveTab = 'TERMINAL' | 'DASHBOARD' | 'PMP' | 'GESTAO' | 'RELATORIO_CORTE' | 'ASSISTENCIA';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState<boolean>(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [isPresentationOpen, setIsPresentationOpen] = useState<boolean>(false);

  const [activeTab, setActiveTab] = useState<ActiveTab>(() => {
    return localStorage.getItem('multilinea_active_machine_id')
      ? 'TERMINAL'
      : 'DASHBOARD';
  });
  const [machines, setMachines] = useState<Machine[]>([]);
  const [catalogParts, setCatalogParts] = useState<CatalogPart[]>([]);
  const [inefficiencyReasons, setInefficiencyReasons] = useState<InefficiencyReason[]>([]);
  const [productionOrders, setProductionOrders] = useState<ProductionOrder[]>([]);
  const [factorySettings, setFactorySettings] = useState<FactorySettings | null>(null);
  const [logs, setLogs] = useState<ProductionLog[]>([]);
  const [downtimeLogs, setDowntimeLogs] = useState<DowntimeLog[]>([]);
  const [loadingData, setLoadingData] = useState<boolean>(true);
  const [catalogLoaded, setCatalogLoaded] = useState<boolean>(false);
  const [inefLoaded, setInefLoaded] = useState<boolean>(false);
  const [ordersLoaded, setOrdersLoaded] = useState<boolean>(false);
  const [assistanceOrders, setAssistanceOrders] = useState<AssistanceOrder[]>([]);
  const [assistanceLoaded, setAssistanceLoaded] = useState<boolean>(false);
  const [deletedAssistanceIds, setDeletedAssistanceIds] = useState<string[]>(() => {
    return typeof window !== 'undefined'
      ? JSON.parse(localStorage.getItem('multilinea_deleted_assistance_ids') || '[]')
      : [];
  });
  const [clearedAssistancePlans, setClearedAssistancePlans] = useState<string[]>(() => {
    return typeof window !== 'undefined'
      ? JSON.parse(localStorage.getItem('multilinea_cleared_assistance_plans') || '[]')
      : [];
  });
  const [seeding, setSeeding] = useState<boolean>(false);
  const [seedingInef, setSeedingInef] = useState<boolean>(false);
  const [seedingOrders, setSeedingOrders] = useState<boolean>(false);

  const hasSeededMachinesRef = useRef<boolean>(false);
  const hasSeededInefRef = useRef<boolean>(false);
  const hasSeededOrdersRef = useRef<boolean>(false);
  const hasRepairedLogsRef = useRef<boolean>(false);
  const hasSeededCatalogPartsRef = useRef<boolean>(false);

  const [activeMachineId, setActiveMachineId] = useState<string | null>(() => {
    return localStorage.getItem('multilinea_active_machine_id');
  });

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setAuthReady(true);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!authReady || !user) {
      setMachines([]);
      setCatalogParts([]);
      setFactorySettings(null);
      setLogs([]);
      setLoadingData(false);
      return;
    }

    setLoadingData(true);
    setLoadingData(true);
    const machinesRef = collection(db, 'machines');
    const catalogRef = collection(db, 'catalog_parts');
    const settingsRef = collection(db, 'factory_settings');
    const logsRef = query(collection(db, 'production_logs'), orderBy('createdAt', 'desc'));
    const inefRef = collection(db, 'inefficiency_reasons');
    const downtimeRef = query(collection(db, 'downtime_logs'), orderBy('createdAt', 'desc'));
    const ordersRef = collection(db, 'production_orders');
    const assistanceRef = collection(db, 'assistance_orders');

    const unsubMachines = onSnapshot(
      machinesRef,
      (snap) => {
        const list: Machine[] = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<Machine, 'id'>),
        }));
        const orderMap: Record<SectorId, number> = {
          SECCIONADORA: 1,
          COLADEIRA: 2,
          FURADEIRA: 3,
          LINHA_UV: 4,
        };
        list.sort((a, b) => {
          const diff = (orderMap[a.sector] || 9) - (orderMap[b.sector] || 9);
          return diff !== 0 ? diff : a.name.localeCompare(b.name);
        });
        setMachines(list);
        setLoadingData(false);
      },
      (err) => {
        handleFirestoreError(err, OperationType.LIST, 'machines');
      }
    );

    const unsubCatalog = onSnapshot(
      catalogRef,
      (snap) => {
        const list: CatalogPart[] = snap.docs.map((d) => {
          const raw = d.data() as Record<string, unknown>;
          const cleanP = String(raw.partCode || '').trim().toUpperCase();
          const qtyPerProd =
            typeof raw.piecesPerProduct === 'number' && raw.piecesPerProduct >= 1
              ? Math.round(raw.piecesPerProduct)
              : 1;

          const dimStr = String(raw.dimensions || '');
          const dimMatch = dimStr.match(/\d+/g);
          const geomM2 =
            dimMatch && dimMatch.length >= 2
              ? (Number(dimMatch[0]) * Number(dimMatch[1])) / 1_000_000
              : 0.385;

          let cutM2 = typeof raw.squareMeters === 'number' ? raw.squareMeters : geomM2;

          // Special piece 402943 (770x500 mm): strictly 0.335 m² PER PIECE (300 pçs = 100,50 m²; 3 pçs/prod = 1,005 m² p/ produto)
          if (cleanP === '402943') {
            cutM2 = 0.335;
          } else if (cutM2 > 0 && qtyPerProd > 1 && (cutM2 >= geomM2 * (qtyPerProd - 0.2) || (cutM2 > 0.8 && geomM2 < 0.6))) {
            cutM2 = Number((cutM2 / qtyPerProd).toFixed(4));
          }

          const faces =
            typeof raw.uvFaces === 'number' && (raw.uvFaces === 0 || raw.uvFaces === 1 || raw.uvFaces === 2)
              ? raw.uvFaces
              : 2;

          let uvM2 =
            typeof raw.uvSquareMeters === 'number' && (raw.uvSquareMeters > 0 || faces === 0)
              ? raw.uvSquareMeters
              : Number(((cutM2 > 0 ? cutM2 : geomM2) * faces).toFixed(4));
          if (cleanP === '402943') {
            uvM2 = 0.67;
          } else if (qtyPerProd > 1 && (uvM2 >= (cutM2 > 0 ? cutM2 : geomM2) * faces * (qtyPerProd - 0.2) || (uvM2 > 1.5 && (cutM2 > 0 ? cutM2 : geomM2) * faces < 1.0))) {
            uvM2 = Number((uvM2 / qtyPerProd).toFixed(4));
          }

          let linM = typeof raw.linearMeters === 'number' ? raw.linearMeters : 2.54;
          if (cleanP === '402943') {
            linM = 2.54;
          } else if (qtyPerProd > 1 && linM > 4.5) {
            linM = Number((linM / qtyPerProd).toFixed(3));
          }

          return {
            id: d.id,
            productName: String(raw.productName || ''),
            paCode: String(raw.paCode || raw.defaultBatch || 'MOD-001'),
            partName: String(raw.partName || ''),
            partCode: String(raw.partCode || ''),
            piecesPerProduct: qtyPerProd,
            dimensions: String(raw.dimensions || ''),
            squareMeters: cutM2,
            uvFaces: faces,
            uvSquareMeters: uvM2,
            linearMeters: linM,
            edgeConfig: String(raw.edgeConfig || '1C + 2L'),
            rawMaterial: typeof raw.rawMaterial === 'string' ? raw.rawMaterial : undefined,
            isFundo: typeof raw.isFundo === 'boolean' ? raw.isFundo : undefined,
            ownerId: String(raw.ownerId || ''),
            createdAt: (raw.createdAt as any) || null,
            updatedAt: (raw.updatedAt as any) || null,
          };
        });
        list.sort((a, b) => {
          const codeDiff = (a.partCode || '').localeCompare(b.partCode || '');
          if (codeDiff !== 0) return codeDiff;
          const paDiff = (a.paCode || '').localeCompare(b.paCode || '');
          if (paDiff !== 0) return paDiff;
          return (a.partName || '').localeCompare(b.partName || '');
        });
        setCatalogParts(list);
        setCatalogLoaded(true);
      },
      (err) => {
        handleFirestoreError(err, OperationType.LIST, 'catalog_parts');
      }
    );

    const unsubSettings = onSnapshot(
      settingsRef,
      (snap) => {
        if (!snap.empty) {
          const docSnap = snap.docs[0];
          const raw = docSnap.data() as Record<string, unknown>;
          const dCorte = typeof raw.targetCorteM2 === 'number' ? raw.targetCorteM2 : 1800;
          const dCortePcs = typeof raw.targetCortePcs === 'number' ? raw.targetCortePcs : 2400;
          const dCol = typeof raw.targetColadeiraMl === 'number' ? raw.targetColadeiraMl : 6500;
          const dFur = typeof raw.targetFuradeiraPcs === 'number' ? raw.targetFuradeiraPcs : 3200;
          const dUv = typeof raw.targetPinturaUvM2 === 'number' ? raw.targetPinturaUvM2 : 1600;

          const dMdfM2 =
            typeof raw.targetCorteMdfM2 === 'number'
              ? raw.targetCorteMdfM2
              : Math.round(dCorte * 0.75);
          const dMdfMonthlyM2 =
            typeof raw.targetCorteMdfMonthlyM2 === 'number'
              ? raw.targetCorteMdfMonthlyM2
              : dMdfM2 * 22;
          const dMdfPcs =
            typeof raw.targetCorteMdfPcs === 'number'
              ? raw.targetCorteMdfPcs
              : Math.round(dCortePcs * 0.67);

          const dFundoM2 =
            typeof raw.targetCorteFundoM2 === 'number'
              ? raw.targetCorteFundoM2
              : Math.round(dCorte * 0.25);
          const dFundoMonthlyM2 =
            typeof raw.targetCorteFundoMonthlyM2 === 'number'
              ? raw.targetCorteFundoMonthlyM2
              : dFundoM2 * 22;
          const dFundoPcs =
            typeof raw.targetCorteFundoPcs === 'number'
              ? raw.targetCorteFundoPcs
              : Math.round(dCortePcs * 0.33);

          setFactorySettings({
            id: docSnap.id,
            targetCorteM2: dCorte,
            targetCorteMonthlyM2:
              typeof raw.targetCorteMonthlyM2 === 'number'
                ? raw.targetCorteMonthlyM2
                : dCorte * 22,
            targetCortePcs: dCortePcs,
            targetCorteMdfM2: dMdfM2,
            targetCorteMdfMonthlyM2: dMdfMonthlyM2,
            targetCorteMdfPcs: dMdfPcs,
            targetCorteFundoM2: dFundoM2,
            targetCorteFundoMonthlyM2: dFundoMonthlyM2,
            targetCorteFundoPcs: dFundoPcs,
            targetColadeiraMl: dCol,
            targetColadeiraMonthlyMl:
              typeof raw.targetColadeiraMonthlyMl === 'number'
                ? raw.targetColadeiraMonthlyMl
                : dCol * 22,
            targetColadeiraPcs:
              typeof raw.targetColadeiraPcs === 'number' ? raw.targetColadeiraPcs : 2200,
            targetFuradeiraPcs: dFur,
            targetFuradeiraMonthlyPcs:
              typeof raw.targetFuradeiraMonthlyPcs === 'number'
                ? raw.targetFuradeiraMonthlyPcs
                : dFur * 22,
            targetPinturaUvM2: dUv,
            targetPinturaUvMonthlyM2:
              typeof raw.targetPinturaUvMonthlyM2 === 'number'
                ? raw.targetPinturaUvMonthlyM2
                : dUv * 22,
            targetPinturaUvPcs:
              typeof raw.targetPinturaUvPcs === 'number' ? raw.targetPinturaUvPcs : 2100,
            ownerId: String(raw.ownerId || ''),
          });
        } else {
          setFactorySettings(null);
        }
      },
      (err) => {
        handleFirestoreError(err, OperationType.LIST, 'factory_settings');
      }
    );

    const unsubLogs = onSnapshot(
      logsRef,
      (snap) => {
        const list: ProductionLog[] = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<ProductionLog, 'id'>),
        }));
        list.sort((a, b) => {
          const tA = a.createdAt?.seconds || 0;
          const tB = b.createdAt?.seconds || 0;
          return tB - tA;
        });
        setLogs(list);
      },
      (err) => {
        handleFirestoreError(err, OperationType.LIST, 'production_logs');
      }
    );

    const unsubInef = onSnapshot(
      inefRef,
      (snap) => {
        const list: InefficiencyReason[] = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<InefficiencyReason, 'id'>),
        }));
        list.sort((a, b) => {
          const numA = parseInt(a.code.replace(/\D/g, ''), 10) || 999;
          const numB = parseInt(b.code.replace(/\D/g, ''), 10) || 999;
          return numA !== numB ? numA - numB : a.code.localeCompare(b.code);
        });
        setInefficiencyReasons(list);
        setInefLoaded(true);
      },
      (err) => {
        handleFirestoreError(err, OperationType.LIST, 'inefficiency_reasons');
      }
    );

    const unsubDowntime = onSnapshot(
      downtimeRef,
      (snap) => {
        const list: DowntimeLog[] = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<DowntimeLog, 'id'>),
        }));
        list.sort((a, b) => {
          const tA = a.createdAt?.seconds || 0;
          const tB = b.createdAt?.seconds || 0;
          return tB - tA;
        });
        setDowntimeLogs(list);
      },
      (err) => {
        handleFirestoreError(err, OperationType.LIST, 'downtime_logs');
      }
    );

    const unsubOrders = onSnapshot(
      ordersRef,
      (snap) => {
        const list: ProductionOrder[] = snap.docs.map((d) => {
          const raw = d.data() as Record<string, unknown>;
          const v1 = typeof raw.qtyV01 === 'number' ? raw.qtyV01 : 0;
          const v2 = typeof raw.qtyV02 === 'number' ? raw.qtyV02 : 0;
          const v3 = typeof raw.qtyV03 === 'number' ? raw.qtyV03 : 0;
          let rawOrderCode = String(raw.orderCode || '').trim().toUpperCase().replace(/[\s\-_/]+/g, '');
          const rawBatchNumber = String(raw.batchNumber || '').trim().toUpperCase().replace(/[\s\-_/]+/g, '');

          // Auto-normalize any full lot code mistakenly used as Encomenda (e.g. I2603808 -> I26038)
          const lotLikeMatch = rawOrderCode.match(/^([A-Z]\d{5})\d+$/);
          if (lotLikeMatch) {
            rawOrderCode = lotLikeMatch[1];
          }

          // Derive standard 6-char Encomenda prefix (e.g. I2603612 -> I26036, I2603808 -> I26038)
          const derivedFromBatch =
            rawBatchNumber.length >= 6 && /^[A-Z]\d{5}/.test(rawBatchNumber)
              ? rawBatchNumber.slice(0, 6)
              : '';

          // If orderCode was provided by the user, respect it! Only derive if orderCode is empty or equal to full batch
          const normalizedOrderCode =
            rawOrderCode && rawOrderCode !== rawBatchNumber
              ? rawOrderCode
              : derivedFromBatch || rawOrderCode || 'M26051';

          return {
            id: d.id,
            orderCode: normalizedOrderCode,
            productCode: String(raw.productCode || ''),
            batchNumber: rawBatchNumber,
            productLine: String(raw.productLine || ''),
            scheduleColor: (raw.scheduleColor as ScheduleColor) || 'BRANCO',
            productDescription: String(raw.productDescription || ''),
            finishColor: String(raw.finishColor || ''),
            qtyV01: v1,
            qtyV02: v2,
            qtyV03: v3,
            totalVolumes:
              typeof raw.totalVolumes === 'number' ? raw.totalVolumes : v1 + v2 + v3,
            dateCorte: String(raw.dateCorte || ''),
            dateColadeira: String(raw.dateColadeira || ''),
            dateFuradeira: String(raw.dateFuradeira || ''),
            datePintura: String(raw.datePintura || ''),
            isHighlighted: Boolean(raw.isHighlighted),
            isEncab: Boolean(raw.isEncab),
            ownerId: String(raw.ownerId || ''),
            createdAt: (raw.createdAt as any) || null,
            updatedAt: (raw.updatedAt as any) || null,
          };
        });
        list.sort((a, b) => {
          const encCmp = a.orderCode.localeCompare(b.orderCode, undefined, { numeric: true });
          if (encCmp !== 0) return encCmp;
          return a.batchNumber.localeCompare(b.batchNumber, undefined, { numeric: true });
        });
        setProductionOrders(list);
        setOrdersLoaded(true);

        // Auto-heal any Firestore orders where orderCode was mistakenly stored as a full lote code (e.g. I2603808)
        snap.docs.forEach((d) => {
          const docData = d.data() as Record<string, unknown>;
          const currentOrderCode = String(docData.orderCode || '').trim().toUpperCase().replace(/[\s\-_/]+/g, '');
          const match = currentOrderCode.match(/^([A-Z]\d{5})\d+$/);
          if (match) {
            updateDoc(doc(db, 'production_orders', d.id), {
              orderCode: match[1],
            }).catch((err) => {
              console.warn('Could not auto-heal orderCode in Firestore:', err);
            });
          }
        });
      },
      (err) => {
        handleFirestoreError(err, OperationType.LIST, 'production_orders');
      }
    );

    const unsubAssistance = onSnapshot(
      assistanceRef,
      (snap) => {
        const list: AssistanceOrder[] = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<AssistanceOrder, 'id'>),
        }));
        list.sort((a, b) => a.partCode.localeCompare(b.partCode, undefined, { numeric: true }));
        setAssistanceOrders(list);
        setAssistanceLoaded(true);
      },
      (err) => {
        handleFirestoreError(err, OperationType.LIST, 'assistance_orders');
      }
    );

    return () => {
      unsubMachines();
      unsubCatalog();
      unsubSettings();
      unsubLogs();
      unsubInef();
      unsubDowntime();
      unsubOrders();
      unsubAssistance();
    };
  }, [authReady, user]);

  // Effective PMP orders: merge INITIAL_PRODUCTION_ORDERS (including Encomenda I26036 registered on Friday 09/10/2026, M26051, M26052) with Firestore orders
  const effectiveProductionOrders: ProductionOrder[] = React.useMemo(() => {
    const wasCleared =
      localStorage.getItem('multilinea_orders_cleared_by_user') === '1' &&
      productionOrders.length === 0;
    if (wasCleared) {
      return [];
    }

    const deletedBatches: string[] =
      typeof window !== 'undefined'
        ? JSON.parse(localStorage.getItem('multilinea_deleted_batches') || '[]')
        : [];
    const deletedBatchesSet = new Set(
      deletedBatches.map((s) => (s || '').trim().toUpperCase())
    );

    const deletedEncomendas: string[] =
      typeof window !== 'undefined'
        ? JSON.parse(localStorage.getItem('multilinea_deleted_encomendas') || '[]')
        : [];
    const deletedEncomendasSet = new Set(
      deletedEncomendas.map((s) => (s || '').trim().toUpperCase())
    );

    const map = new Map<string, ProductionOrder>();
    // 1. First add initial official production orders (including Encomenda I26036 from 09/10/2026) if not deleted
    INITIAL_PRODUCTION_ORDERS.forEach((o) => {
      const bKey = (o.batchNumber || '').trim().toUpperCase();
      const encCode = (o.orderCode || '').trim().toUpperCase();
      const oId = (o.id || '').trim().toUpperCase();

      if (
        (bKey && deletedBatchesSet.has(bKey)) ||
        (oId && deletedBatchesSet.has(oId)) ||
        (encCode && deletedEncomendasSet.has(encCode))
      ) {
        return;
      }

      map.set(bKey || oId, {
        ...o,
        ownerId: user?.uid || 'system',
      });
    });

    // 2. Overlay any Firestore orders (user-created, edited, or imported orders) if not deleted
    productionOrders.forEach((o) => {
      const bKey = (o.batchNumber || '').trim().toUpperCase();
      const encCode = (o.orderCode || '').trim().toUpperCase();
      const oId = (o.id || '').trim().toUpperCase();

      if (
        (bKey && deletedBatchesSet.has(bKey)) ||
        (oId && deletedBatchesSet.has(oId)) ||
        (encCode && deletedEncomendasSet.has(encCode))
      ) {
        return;
      }

      // If it overrides a seed order with the same batch, remove the seed placeholder
      if (bKey && map.has(bKey)) {
        map.delete(bKey);
      }
      map.set(o.id, o);
    });

    return Array.from(map.values()).sort((a, b) => {
      const encCmp = (a.orderCode || '').localeCompare(b.orderCode || '', undefined, {
        numeric: true,
      });
      if (encCmp !== 0) return encCmp;
      return (a.batchNumber || '').localeCompare(b.batchNumber || '', undefined, {
        numeric: true,
      });
    });
  }, [productionOrders, user]);

  const effectiveAssistanceOrders: AssistanceOrder[] = useMemo(() => {
    const deletedSet = new Set(deletedAssistanceIds.map((id) => (id || '').trim().toLowerCase()));
    const clearedPlanSet = new Set(clearedAssistancePlans.map((p) => (p || '').trim().toUpperCase()));

    const map = new Map<string, AssistanceOrder>();

    // 1. Initial seed orders (Plan 17/26) if plan is not cleared and item is not deleted
    INITIAL_ASSISTANCE_ORDERS.forEach((item) => {
      const plan = (item.planNumber || '').trim().toUpperCase();
      const idKey = (item.id || '').trim().toLowerCase();
      if (clearedPlanSet.has(plan) || deletedSet.has(idKey)) {
        return;
      }
      map.set(item.id, {
        ...item,
        ownerId: user?.uid || 'multilinea_owner',
      } as AssistanceOrder);
    });

    // 2. Overlay Firestore assistance orders (if not deleted and not in cleared plan)
    assistanceOrders.forEach((o) => {
      const plan = (o.planNumber || '').trim().toUpperCase();
      const idKey = (o.id || '').trim().toLowerCase();
      if (clearedPlanSet.has(plan) || deletedSet.has(idKey)) {
        return;
      }
      map.set(o.id, o);
    });

    return Array.from(map.values()).sort((a, b) =>
      a.partCode.localeCompare(b.partCode, undefined, { numeric: true })
    );
  }, [assistanceOrders, user, deletedAssistanceIds, clearedAssistancePlans]);

  // Clean, production-authoritative logs filtered of any simulated or fictitious test operators
  const effectiveLogs = useMemo(() => {
    const fakeOperators = new Set([
      'Lucas Mendes',
      'Rafael Lima',
      'Tiago Santos',
      'José Roberto',
      'Carlos Silveira',
      'Marcos Souza',
    ]);
    return logs.filter(
      (l) =>
        !l.id.startsWith('log_sim_') &&
        !(l.notes && l.notes.toLowerCase().includes('demonstração')) &&
        !(l.notes && l.notes.toLowerCase().includes('simula')) &&
        !fakeOperators.has(l.operatorName)
    );
  }, [logs]);

  // Clean, production-authoritative downtime logs filtered of simulated setup/stoppages
  const effectiveDowntimeLogs = useMemo(() => {
    return downtimeLogs.filter(
      (d) =>
        !d.id.startsWith('dt_sim_') &&
        !(d.notes && d.notes.toLowerCase().includes('ajuste de corte seccionadora')) &&
        !(d.notes && d.notes.toLowerCase().includes('simula'))
    );
  }, [downtimeLogs]);

  // Automatically sync missing official production orders into Firestore production_orders
  useEffect(() => {
    if (
      !authReady ||
      !user ||
      loadingData ||
      !ordersLoaded ||
      seedingOrders ||
      hasSeededOrdersRef.current
    ) {
      return;
    }
    const wasCleared = localStorage.getItem('multilinea_orders_cleared_by_user') === '1';
    if (wasCleared && productionOrders.length === 0) {
      return;
    }

    const deletedBatches: string[] =
      typeof window !== 'undefined'
        ? JSON.parse(localStorage.getItem('multilinea_deleted_batches') || '[]')
        : [];
    const deletedBatchesSet = new Set(
      deletedBatches.map((s) => (s || '').trim().toUpperCase())
    );

    const deletedEncomendas: string[] =
      typeof window !== 'undefined'
        ? JSON.parse(localStorage.getItem('multilinea_deleted_encomendas') || '[]')
        : [];
    const deletedEncomendasSet = new Set(
      deletedEncomendas.map((s) => (s || '').trim().toUpperCase())
    );

    const existingBatches = new Set(
      productionOrders.map((o) => (o.batchNumber || '').trim().toUpperCase())
    );
    const missingOrders = INITIAL_PRODUCTION_ORDERS.filter((o) => {
      const bKey = (o.batchNumber || '').trim().toUpperCase();
      const encCode = (o.orderCode || '').trim().toUpperCase();
      const oId = (o.id || '').trim().toUpperCase();

      if (
        deletedBatchesSet.has(bKey) ||
        deletedBatchesSet.has(oId) ||
        deletedEncomendasSet.has(encCode)
      ) {
        return false;
      }

      return !existingBatches.has(bKey);
    });
    hasSeededOrdersRef.current = true;
    if (missingOrders.length > 0) {
      const seedMissingOrders = async () => {
        setSeedingOrders(true);
        try {
          const batch = writeBatch(db);
          for (const item of missingOrders) {
            const docId = `${item.id}_${user.uid.slice(0, 6)}`;
            batch.set(doc(db, 'production_orders', docId), {
              orderCode: item.orderCode,
              productCode: item.productCode,
              batchNumber: item.batchNumber,
              productLine: item.productLine,
              scheduleColor: item.scheduleColor,
              productDescription: item.productDescription,
              finishColor: item.finishColor,
              qtyV01: item.qtyV01,
              qtyV02: item.qtyV02,
              qtyV03: item.qtyV03,
              totalVolumes: item.totalVolumes,
              dateCorte: item.dateCorte,
              dateColadeira: item.dateColadeira,
              dateFuradeira: item.dateFuradeira,
              datePintura: item.datePintura,
              isHighlighted: Boolean(item.isHighlighted),
              isEncab: Boolean(item.isEncab),
              ownerId: user.uid,
              createdAt: serverTimestamp(),
            });
          }
          await batch.commit();
        } catch (err) {
          console.error('Error auto-syncing production orders to Firestore:', err);
        } finally {
          setSeedingOrders(false);
        }
      };
      seedMissingOrders();
    }
  }, [authReady, user, loadingData, ordersLoaded, productionOrders, seedingOrders]);

  // Automatically purge any simulated / demonstration logs and downtimes so live factory testing is 100% clean
  useEffect(() => {
    if (!authReady || !user || loadingData || logs.length === 0) return;
    const fakeOperators = new Set([
      'Lucas Mendes',
      'Rafael Lima',
      'Tiago Santos',
      'José Roberto',
      'Carlos Silveira',
      'Marcos Souza',
    ]);
    const mockLogs = logs.filter(
      (l) =>
        l.id.startsWith('log_sim_') ||
        (l.notes && l.notes.toLowerCase().includes('demonstração')) ||
        (l.notes && l.notes.toLowerCase().includes('simula')) ||
        fakeOperators.has(l.operatorName)
    );
    if (mockLogs.length > 0) {
      mockLogs.forEach(async (l) => {
        try {
          await deleteDoc(doc(db, 'production_logs', l.id));
        } catch (err) {
          console.error('Error auto-purging mock log:', err);
        }
      });
      setLogs((prev) => prev.filter((p) => !mockLogs.some((m) => m.id === p.id)));
    }

    const mockDowntimes = downtimeLogs.filter(
      (d) =>
        d.id.startsWith('dt_sim_') ||
        (d.notes && d.notes.toLowerCase().includes('ajuste de corte seccionadora')) ||
        (d.notes && d.notes.toLowerCase().includes('simula'))
    );
    if (mockDowntimes.length > 0) {
      mockDowntimes.forEach(async (d) => {
        try {
          await deleteDoc(doc(db, 'downtime_logs', d.id));
        } catch (err) {
          console.error('Error auto-purging mock downtime:', err);
        }
      });
      setDowntimeLogs((prev) => prev.filter((p) => !mockDowntimes.some((m) => m.id === p.id)));
    }
  }, [authReady, user, loadingData, logs, downtimeLogs]);

  // Automatically seed/sync P1 to P22 Inefficiency Reasons in ONE atomic batch if any are missing
  useEffect(() => {
    if (!authReady || !user || loadingData || !inefLoaded || seedingInef || hasSeededInefRef.current) {
      return;
    }
    const existingCodes = new Set(
      inefficiencyReasons.map((r) => (r.code || '').toUpperCase())
    );
    const missingReasons = INITIAL_INEFFICIENCY_REASONS.filter(
      (r) => !existingCodes.has(r.code.toUpperCase())
    );
    hasSeededInefRef.current = true;
    if (missingReasons.length > 0) {
      const seedInefficiencies = async () => {
        setSeedingInef(true);
        try {
          const batch = writeBatch(db);
          for (const r of missingReasons) {
            const docId = `${r.id}_${user.uid.slice(0, 6)}`;
            batch.set(doc(db, 'inefficiency_reasons', docId), {
              code: r.code,
              name: r.name,
              category: r.category,
              sector: r.sector,
              ownerId: user.uid,
              createdAt: serverTimestamp(),
            });
          }
          await batch.commit();
        } catch (err) {
          handleFirestoreError(err, OperationType.CREATE, 'inefficiency_reasons');
        } finally {
          setSeedingInef(false);
        }
      };
      seedInefficiencies();
    }
  }, [authReady, user, loadingData, inefLoaded, inefficiencyReasons, seedingInef]);

  // Merge initial machines with Firestore machines and deduplicate by username
  // Guarantees all official factory machines (Giben, Selco, Maclinea, Homag, etc.) always exist
  // while seamlessly applying custom machines and live changes from Firestore without duplicates
  const effectiveMachines: Machine[] = React.useMemo(() => {
    const map = new Map<string, Machine>();

    // 1. Initial official machines baseline (ensures Giben, Selco, etc. are never lost)
    INITIAL_MACHINES.forEach((m) => {
      const cleanKey = m.username.trim().toLowerCase();
      map.set(cleanKey, {
        ...m,
        ownerId: user?.uid || 'multilinea_admin',
        createdAt: null,
        updatedAt: null,
      });
    });

    // 2. Real Firestore machines override/supplement (preserving live status, custom PINs, or newly added machines)
    machines.forEach((m) => {
      const cleanKey = (m.username || '').trim().toLowerCase();
      if (cleanKey) {
        const base = map.get(cleanKey);
        map.set(cleanKey, {
          ...(base || {}),
          ...m,
        });
      } else if (m.id) {
        map.set(m.id, m);
      }
    });

    const list = Array.from(map.values());
    const orderMap: Record<SectorId, number> = {
      SECCIONADORA: 1,
      COLADEIRA: 2,
      FURADEIRA: 3,
      LINHA_UV: 4,
    };
    list.sort((a, b) => {
      const diff = (orderMap[a.sector] || 9) - (orderMap[b.sector] || 9);
      return diff !== 0 ? diff : a.name.localeCompare(b.name);
    });
    return list;
  }, [machines, user]);

  // Merge initial catalog parts with Firestore catalog parts preserving all parts across different products
  const effectiveCatalogParts: CatalogPart[] = React.useMemo(() => {
    const map = new Map<string, CatalogPart>();

    const deletedPartsList: string[] =
      typeof window !== 'undefined'
        ? JSON.parse(localStorage.getItem('multilinea_deleted_catalog_parts') || '[]')
        : [];
    const deletedPartsSet = new Set(deletedPartsList);

    // 1. All parts loaded from Firestore are authoritative.
    // Deduplicate by compKey (paCode:::partCode) so that even if duplicate documents exist in Firestore,
    // only ONE pristine entry is shown in the catalog, preventing duplicated rows.
    const firestoreByCompKey = new Map<string, CatalogPart>();

    catalogParts.forEach((c) => {
      if (!c.id || deletedPartsSet.has(c.id)) {
        return;
      }
      const compKey = `${(c.paCode || '').trim().toUpperCase()}:::${(c.partCode || '').trim().toUpperCase()}`;

      if (!firestoreByCompKey.has(compKey)) {
        firestoreByCompKey.set(compKey, c);
      } else {
        // Automatically clean up orphan duplicate from Firestore in the background
        console.warn(`[Catalog] Duplicate Firestore doc found for ${compKey} (id: ${c.id}), auto-purging orphan.`);
        deleteDoc(doc(db, 'catalog_parts', c.id)).catch(() => {});
      }
    });

    firestoreByCompKey.forEach((c) => {
      map.set(c.id, c);
    });

    // 2. Supplement with INITIAL_CATALOG_PARTS if not cleared and not deleted
    const wasClearedByUser =
      typeof window !== 'undefined' &&
      localStorage.getItem('multilinea_catalog_cleared') === '1';

    if (!wasClearedByUser) {
      INITIAL_CATALOG_PARTS.forEach((initPart) => {
        const initPa = (initPart.paCode || '').trim().toUpperCase();
        const initCode = (initPart.partCode || '').trim().toUpperCase();
        const compKey = `${initPa}:::${initCode}`;

        if (deletedPartsSet.has(initPart.id) || deletedPartsSet.has(compKey)) {
          return;
        }

        const alreadyExists = firestoreByCompKey.has(compKey);
        if (!alreadyExists) {
          map.set(initPart.id, {
            ...initPart,
            ownerId: user?.uid || 'system',
          });
        }
      });
    }

    const list = Array.from(map.values());
    list.sort((a, b) => {
      const codeDiff = (a.partCode || '').localeCompare(b.partCode || '');
      if (codeDiff !== 0) return codeDiff;
      const paDiff = (a.paCode || '').localeCompare(b.paCode || '');
      if (paDiff !== 0) return paDiff;
      return (a.partName || '').localeCompare(b.partName || '');
    });
    return list;
  }, [catalogParts, user]);

  // Automatically sync missing official parts (like 402999) to Firestore catalog_parts without overwriting different products
  useEffect(() => {
    if (
      !authReady ||
      !user ||
      loadingData ||
      !catalogLoaded ||
      hasSeededCatalogPartsRef.current
    ) {
      return;
    }
    const wasClearedByUser =
      typeof window !== 'undefined' &&
      localStorage.getItem('multilinea_catalog_cleared') === '1';
    if (wasClearedByUser) {
      hasSeededCatalogPartsRef.current = true;
      return;
    }

    // 1. Purge unwanted mock parts for 500686 that were not registered by the user
    const unwanted500686Docs = catalogParts.filter((p) => {
      const pa = (p.paCode || '').trim().toUpperCase();
      const code = (p.partCode || '').trim().toUpperCase();
      const id = p.id || '';
      return (
        (pa === '500686' &&
          (code.startsWith('500686-') ||
            code === '500686-LAT' ||
            code === '500686-BAS' ||
            code === '500686-PRT' ||
            code === '500686-FRG')) ||
        id.startsWith('cat_m01') ||
        id.startsWith('cat_m02') ||
        id.startsWith('cat_m03') ||
        id.startsWith('cat_m04')
      );
    });

    if (unwanted500686Docs.length > 0) {
      unwanted500686Docs.forEach(async (docToRemove) => {
        try {
          await deleteDoc(doc(db, 'catalog_parts', docToRemove.id));
        } catch (e) {
          console.warn('Could not auto-purge ghost part:', docToRemove.id, e);
        }
      });
      setCatalogParts((prev) =>
        prev.filter((p) => !unwanted500686Docs.some((u) => u.id === p.id))
      );
    }

    // Auto-heal: unblock any custom pieces (specifically 500686:::402834 and other user parts)
    // that were blacklisted by compKey in localStorage when an operator deleted a duplicate entry
    if (typeof window !== 'undefined') {
      try {
        const storedDeleted: string[] = JSON.parse(
          localStorage.getItem('multilinea_deleted_catalog_parts') || '[]'
        );
        const seedKeys = new Set(
          INITIAL_CATALOG_PARTS.map(
            (p) => `${(p.paCode || '').trim().toUpperCase()}:::${(p.partCode || '').trim().toUpperCase()}`
          )
        );
        const cleaned = storedDeleted.filter(
          (k) => !k.includes(':::') || seedKeys.has(k)
        );
        if (cleaned.length !== storedDeleted.length) {
          localStorage.setItem('multilinea_deleted_catalog_parts', JSON.stringify(cleaned));
        }
      } catch (e) {
        console.warn('Could not clean deleted parts localStorage:', e);
      }
    }

    const deletedPartsList: string[] =
      typeof window !== 'undefined'
        ? JSON.parse(localStorage.getItem('multilinea_deleted_catalog_parts') || '[]')
        : [];
    const deletedPartsSet = new Set(deletedPartsList);

    // Composite key: PA_CODE:::PART_CODE so parts with the same code in different products are never overwritten or skipped
    const existingCompositeKeys = new Set(
      catalogParts.map(
        (p) => `${(p.paCode || '').trim().toUpperCase()}:::${(p.partCode || '').trim().toUpperCase()}`
      )
    );
    const missingParts = INITIAL_CATALOG_PARTS.filter((p) => {
      const compKey = `${(p.paCode || '').trim().toUpperCase()}:::${(p.partCode || '').trim().toUpperCase()}`;
      if (deletedPartsSet.has(p.id) || deletedPartsSet.has(compKey)) {
        return false;
      }
      return !existingCompositeKeys.has(compKey);
    });
    hasSeededCatalogPartsRef.current = true;
    if (missingParts.length > 0) {
      const seedMissingCatalog = async () => {
        try {
          const batch = writeBatch(db);
          for (const c of missingParts) {
            const docId = `${c.id}_${user.uid.slice(0, 6)}`;
            batch.set(doc(db, 'catalog_parts', docId), {
              productName: c.productName,
              paCode: c.paCode,
              partName: c.partName,
              partCode: c.partCode,
              piecesPerProduct: c.piecesPerProduct ?? 1,
              dimensions: c.dimensions,
              squareMeters: c.squareMeters,
              uvFaces: c.uvFaces ?? 1,
              uvSquareMeters: c.uvSquareMeters ?? c.squareMeters,
              linearMeters: c.linearMeters,
              edgeConfig: c.edgeConfig || '1C + 2L',
              ownerId: user.uid,
              createdAt: serverTimestamp(),
            });
          }
          await batch.commit();
        } catch (err) {
          console.error('Error auto-seeding missing catalog parts:', err);
        }
      };
      seedMissingCatalog();
    }

    // Auto-heal Part 402943 strictly for product 500698 or 770x500 dimensions (not other products)
    const part402943Doc = catalogParts.find(
      (p) =>
        (p.partCode || '').trim().toUpperCase() === '402943' &&
        ((p.paCode || '').trim().toUpperCase() === '500698' ||
          (p.dimensions || '').includes('770'))
    );
    if (part402943Doc && part402943Doc.squareMeters > 0.5) {
      updateDoc(doc(db, 'catalog_parts', part402943Doc.id), {
        squareMeters: 0.335,
        uvSquareMeters: 0.67,
        linearMeters: 2.54,
      }).catch((e) => console.error('Error repairing catalog part 402943 in Firestore:', e));
    }
  }, [authReady, user, loadingData, catalogLoaded, catalogParts]);

  // Automated data correction for corrupted logs:
  // 1. Piece 402999 / Batch I2603604 belongs to Product 500698 (not 501040), 200 pcs = 78.00 m² (not 200 m²)
  // 2. Fix all other logs produced on 10/10/2026 where paCode was mistakenly recorded as 501040
  // 3. Fix 1-peça = 1-metro bug in SECCIONADORA where measuredAmount === quantityGood
  useEffect(() => {
    if (!authReady || !user || loadingData || logs.length === 0 || hasRepairedLogsRef.current) {
      return;
    }
    hasRepairedLogsRef.current = true;

    const repairCorruptedLogs = async () => {
      try {
        for (const log of logs) {
          const cleanBatch = (log.batchNumber || '').trim().toUpperCase();
          const cleanPart = (log.partCode || '').trim().toUpperCase();

          let shouldUpdate = false;
          let newPaCode = log.paCode;
          let newProductName = log.productName;
          let newPartName = log.partName;
          let newMeasured = log.measuredAmount;

          // Case A: Specific historical corrupt batch I2603604 -> Product 500698 and 78.00 m² for 200 pcs
          if (cleanBatch === 'I2603604') {
            if (newPaCode !== '500698') {
              newPaCode = '500698';
              newProductName = 'RAINHA - BALC. 1PT BASC 1GV NESHER 80CM• ENCAB';
              shouldUpdate = true;
            }
            if (
              cleanPart === '402999' &&
              (!newPartName || newPartName.includes('Cód. 402999') || newPartName.includes('TAMPO'))
            ) {
              newPartName = 'PORTA BASCULANTE 770X500';
              shouldUpdate = true;
            }
            if (
              log.sector === 'SECCIONADORA' &&
              (typeof newMeasured !== 'number' || newMeasured === log.quantityGood || newMeasured === 200)
            ) {
              newMeasured = Number((log.quantityGood * 0.39).toFixed(2));
              shouldUpdate = true;
            }
          }

          // Case B: Any other logs with stale paCode 501040 where batch is not M2605206
          if (log.paCode === '501040' && cleanBatch !== 'M2605206') {
            const order =
              productionOrders.find((o) => o.batchNumber.trim().toUpperCase() === cleanBatch) ||
              INITIAL_PRODUCTION_ORDERS.find((o) => o.batchNumber.trim().toUpperCase() === cleanBatch);

            if (order && order.productCode && order.productCode !== '501040') {
              newPaCode = order.productCode;
              newProductName = `${order.productLine} - ${order.productDescription}`;
              shouldUpdate = true;
            } else if (cleanBatch.startsWith('I26036')) {
              newPaCode = '500698';
              newProductName = 'RAINHA - BALC. 1PT BASC 1GV NESHER 80CM• ENCAB';
              shouldUpdate = true;
            }
          }

          // Case C: Any SECCIONADORA log where measuredAmount === quantityGood (1 piece = 1 meter bug)
          if (
            log.sector === 'SECCIONADORA' &&
            typeof log.measuredAmount === 'number' &&
            log.measuredAmount === log.quantityGood &&
            log.quantityGood > 1
          ) {
            const catPart =
              effectiveCatalogParts.find(
                (c) =>
                  c.partCode.trim().toUpperCase() === cleanPart &&
                  (!newPaCode || (c.paCode || '').trim().toUpperCase() === (newPaCode || '').trim().toUpperCase())
              ) ||
              effectiveCatalogParts.find(
                (c) => c.partCode.trim().toUpperCase() === cleanPart
              );
            if (catPart && catPart.squareMeters > 0 && catPart.squareMeters !== 1) {
              newMeasured = Number((log.quantityGood * catPart.squareMeters).toFixed(2));
              shouldUpdate = true;
            } else if (cleanPart === '402999' && (newPaCode === '500698' || cleanBatch.startsWith('I26036'))) {
              newMeasured = Number((log.quantityGood * 0.39).toFixed(2));
              shouldUpdate = true;
            } else {
              const dimMatch = (log.partName + ' ' + (log.notes || '')).match(
                /(\d{2,4})\s*[xX*×]\s*(\d{2,4})/
              );
              if (dimMatch) {
                const d1 = parseFloat(dimMatch[1]);
                const d2 = parseFloat(dimMatch[2]);
                if (d1 > 0 && d2 > 0) {
                  const pieceM2 = (d1 * d2) / 1000000;
                  newMeasured = Number((log.quantityGood * pieceM2).toFixed(2));
                  shouldUpdate = true;
                }
              }
            }
          }

          // Case D: Part 402943 (PORTA 770X500) strictly 0.335 m² PER PIECE for product 500698 / batch I26036
          if (cleanPart === '402943' && (cleanBatch.startsWith('I26036') || !newPaCode)) {
            if (newPaCode !== '500698') {
              newPaCode = '500698';
              newProductName = 'RAINHA - BALC. 1PT BASC 1GV NESHER 80CM• ENCAB';
              shouldUpdate = true;
            }
            if (!newPartName || newPartName.includes('Cód. 402943')) {
              newPartName = 'PORTA 770X500';
              shouldUpdate = true;
            }
            if (log.sector === 'SECCIONADORA') {
              const expectedM2 = Number((log.quantityGood * 0.335).toFixed(2));
              if (typeof newMeasured !== 'number' || Math.abs(newMeasured - expectedM2) > 0.05) {
                newMeasured = expectedM2;
                shouldUpdate = true;
              }
            } else if (log.sector === 'COLADEIRA') {
              const expectedMl = Number((log.quantityGood * 2.54).toFixed(2));
              if (typeof newMeasured !== 'number' || Math.abs(newMeasured - expectedMl) > 0.05) {
                newMeasured = expectedMl;
                shouldUpdate = true;
              }
            } else if (log.sector === 'LINHA_UV') {
              const expectedUv = Number((log.quantityGood * 0.67).toFixed(2));
              if (typeof newMeasured !== 'number' || Math.abs(newMeasured - expectedUv) > 0.05) {
                newMeasured = expectedUv;
                shouldUpdate = true;
              }
            }
          }

          if (shouldUpdate) {
            await updateDoc(doc(db, 'production_logs', log.id), {
              paCode: newPaCode,
              productName: newProductName,
              partName: newPartName,
              measuredAmount: newMeasured,
            });
          }
        }
      } catch (err) {
        console.error('Error repairing logs in Firestore:', err);
      }
    };

    repairCorruptedLogs();
  }, [authReady, user, loadingData, logs, productionOrders, effectiveCatalogParts]);
  const effectiveInefficiencyReasons: InefficiencyReason[] = React.useMemo(() => {
    const map = new Map<string, InefficiencyReason>();
    INITIAL_INEFFICIENCY_REASONS.forEach((r) => {
      map.set(r.code.toUpperCase(), {
        ...r,
        ownerId: user?.uid || 'system',
      });
    });
    inefficiencyReasons.forEach((r) => {
      if (r.code) {
        map.set(r.code.toUpperCase(), r);
      }
    });
    return Array.from(map.values()).sort((a, b) => {
      const numA = parseInt((a.code || '').replace(/\D/g, ''), 10) || 999;
      const numB = parseInt((b.code || '').replace(/\D/g, ''), 10) || 999;
      return numA !== numB ? numA - numB : a.code.localeCompare(b.code);
    });
  }, [inefficiencyReasons, user]);

  // Automatically upgrade or seed the 10 real factory machines in ONE atomic batch if not yet loaded
  useEffect(() => {
    if (
      !authReady ||
      !user ||
      loadingData ||
      !catalogLoaded ||
      seeding ||
      hasSeededMachinesRef.current
    ) {
      return;
    }
    const hasGiben = machines.some((m) => m.username === 'giben');
    hasSeededMachinesRef.current = true;
    if (machines.length === 0 || (!hasGiben && machines.length <= 8)) {
      const syncRealMachines = async () => {
        setSeeding(true);
        try {
          const batch = writeBatch(db);
          for (const oldM of machines) {
            if (oldM.username.startsWith('sec0') || oldM.username.startsWith('col0') || oldM.username.startsWith('fur0') || oldM.username.startsWith('uv0')) {
              batch.delete(doc(db, 'machines', oldM.id));
            }
          }

          for (const m of INITIAL_MACHINES) {
            const docId = `${m.id}_${user.uid.slice(0, 6)}`;
            batch.set(doc(db, 'machines', docId), {
              name: m.name,
              sector: m.sector,
              username: m.username,
              accessPin: m.accessPin,
              status: m.status,
              currentProduct: m.currentProduct,
              currentPaCode: m.currentPaCode || 'MOD-001',
              currentPart: m.currentPart,
              currentPartCode: m.currentPartCode,
              currentBatch: m.currentBatch,
              ownerId: user.uid,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            });
          }

          const wasClearedByUser =
            localStorage.getItem('multilinea_catalog_cleared') === '1';
          if (catalogParts.length === 0 && !wasClearedByUser) {
            for (const c of INITIAL_CATALOG_PARTS) {
              const docId = `${c.id}_${user.uid.slice(0, 6)}`;
              batch.set(doc(db, 'catalog_parts', docId), {
                productName: c.productName,
                paCode: c.paCode,
                partName: c.partName,
                partCode: c.partCode,
                dimensions: c.dimensions,
                squareMeters: c.squareMeters,
                uvFaces: c.uvFaces ?? 1,
                uvSquareMeters: c.uvSquareMeters ?? c.squareMeters,
                linearMeters: c.linearMeters,
                edgeConfig: c.edgeConfig || '1C + 2L',
                ownerId: user.uid,
                createdAt: serverTimestamp(),
              });
            }
          }

          if (!factorySettings) {
            const settingsDocId = `settings_${user.uid.slice(0, 8)}`;
            batch.set(doc(db, 'factory_settings', settingsDocId), {
              ...INITIAL_FACTORY_SETTINGS,
              ownerId: user.uid,
              updatedAt: serverTimestamp(),
            });
          }
          await batch.commit();
        } catch (err) {
          handleFirestoreError(err, OperationType.CREATE, 'machines');
        } finally {
          setSeeding(false);
        }
      };
      syncRealMachines();
    }
  }, [authReady, user, loadingData, catalogLoaded, machines, catalogParts.length, factorySettings, seeding]);

  const handleResetMachinesToFactoryDefault = async () => {
    if (!user) return;
    try {
      for (const oldM of machines) {
        await deleteDoc(doc(db, 'machines', oldM.id));
      }
      for (const m of INITIAL_MACHINES) {
        const docId = `${m.id}_${user.uid.slice(0, 6)}`;
        await setDoc(doc(db, 'machines', docId), {
          name: m.name,
          sector: m.sector,
          username: m.username,
          accessPin: m.accessPin,
          status: m.status,
          currentProduct: m.currentProduct,
          currentPaCode: m.currentPaCode || 'MOD-001',
          currentPart: m.currentPart,
          currentPartCode: m.currentPartCode,
          currentBatch: m.currentBatch,
          ownerId: user.uid,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'machines');
    }
  };

  const handleGoogleSignIn = async () => {
    setAuthError(null);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      setAuthError(
        err instanceof Error ? err.message : 'Falha na autenticação com Google.'
      );
    }
  };

  const handleSignOut = async () => {
    localStorage.removeItem('multilinea_active_machine_id');
    setActiveMachineId(null);
    await signOut(auth);
  };

  const activeMachine =
    effectiveMachines.find(
      (m) =>
        m.id === activeMachineId ||
        m.username.trim().toLowerCase() === activeMachineId?.trim().toLowerCase()
    ) || null;

  const handleLoginMachine = (machine: Machine) => {
    localStorage.setItem('multilinea_active_machine_id', machine.id);
    setActiveMachineId(machine.id);
    setActiveTab('TERMINAL');
  };

  const handleLogoutMachine = () => {
    localStorage.removeItem('multilinea_active_machine_id');
    setActiveMachineId(null);
  };

  const handleUpdateMachineJob = async (
    machineId: string,
    payload: {
      status: MachineStatus;
      currentProduct: string;
      currentPaCode: string;
      currentPart: string;
      currentPartCode: string;
      currentBatch: string;
    }
  ) => {
    if (!user) return;
    try {
      await setDoc(
        doc(db, 'machines', machineId),
        {
          status: payload.status,
          currentProduct: payload.currentProduct,
          currentPaCode: payload.currentPaCode,
          currentPart: payload.currentPart,
          currentPartCode: payload.currentPartCode,
          currentBatch: payload.currentBatch,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `machines/${machineId}`);
    }
  };

  const handleRecordDelivery = async (payload: {
    machine: Machine;
    productName: string;
    paCode: string;
    partName: string;
    partCode: string;
    batchNumber: string;
    quantityGood: number;
    quantityScrap: number;
    measuredAmount: number;
    operatorName: string;
    shift: ShiftId;
    notes: string;
  }) => {
    if (!user) return;
    const logId = `log_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    try {
      await setDoc(doc(db, 'production_logs', logId), {
        machineId: payload.machine.id,
        machineName: payload.machine.name,
        machineUsername: payload.machine.username,
        sector: payload.machine.sector,
        productName: payload.productName,
        paCode: payload.paCode,
        partName: payload.partName,
        partCode: payload.partCode,
        batchNumber: payload.batchNumber,
        quantityGood: payload.quantityGood,
        quantityScrap: payload.quantityScrap,
        measuredAmount: payload.measuredAmount,
        operatorName: payload.operatorName,
        shift: payload.shift,
        notes: payload.notes,
        ownerId: user.uid,
        createdAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `production_logs/${logId}`);
    }
  };

  const handleSaveFactorySettings = async (payload: {
    targetCorteM2: number;
    targetCorteMonthlyM2: number;
    targetCortePcs: number;
    targetCorteMdfM2?: number;
    targetCorteMdfMonthlyM2?: number;
    targetCorteMdfPcs?: number;
    targetCorteFundoM2?: number;
    targetCorteFundoMonthlyM2?: number;
    targetCorteFundoPcs?: number;
    targetColadeiraMl: number;
    targetColadeiraMonthlyMl: number;
    targetColadeiraPcs: number;
    targetFuradeiraPcs: number;
    targetFuradeiraMonthlyPcs: number;
    targetPinturaUvM2: number;
    targetPinturaUvMonthlyM2: number;
    targetPinturaUvPcs: number;
  }) => {
    if (!user) {
      throw new Error('Você precisa estar conectado à conta Google da fábrica para salvar as metas.');
    }
    const docId = factorySettings?.id || `settings_${user.uid.slice(0, 8)}`;
    const effectiveMdfM2 = payload.targetCorteMdfM2 ?? Math.round(payload.targetCorteM2 * 0.75);
    const effectiveMdfMonthly =
      payload.targetCorteMdfMonthlyM2 ?? Math.round(payload.targetCorteMonthlyM2 * 0.75);
    const effectiveMdfPcs =
      payload.targetCorteMdfPcs ?? Math.round(payload.targetCortePcs * 0.67);
    const effectiveFundoM2 = payload.targetCorteFundoM2 ?? Math.round(payload.targetCorteM2 * 0.25);
    const effectiveFundoMonthly =
      payload.targetCorteFundoMonthlyM2 ?? Math.round(payload.targetCorteMonthlyM2 * 0.25);
    const effectiveFundoPcs =
      payload.targetCorteFundoPcs ?? Math.round(payload.targetCortePcs * 0.33);

    // Optimistically update local state & cache so UI and dashboards reflect changes instantly
    const updatedSettings: FactorySettings = {
      id: docId,
      targetCorteM2: payload.targetCorteM2,
      targetCorteMonthlyM2: payload.targetCorteMonthlyM2,
      targetCortePcs: payload.targetCortePcs,
      targetCorteMdfM2: effectiveMdfM2,
      targetCorteMdfMonthlyM2: effectiveMdfMonthly,
      targetCorteMdfPcs: effectiveMdfPcs,
      targetCorteFundoM2: effectiveFundoM2,
      targetCorteFundoMonthlyM2: effectiveFundoMonthly,
      targetCorteFundoPcs: effectiveFundoPcs,
      targetColadeiraMl: payload.targetColadeiraMl,
      targetColadeiraMonthlyMl: payload.targetColadeiraMonthlyMl,
      targetColadeiraPcs: payload.targetColadeiraPcs,
      targetFuradeiraPcs: payload.targetFuradeiraPcs,
      targetFuradeiraMonthlyPcs: payload.targetFuradeiraMonthlyPcs,
      targetPinturaUvM2: payload.targetPinturaUvM2,
      targetPinturaUvMonthlyM2: payload.targetPinturaUvMonthlyM2,
      targetPinturaUvPcs: payload.targetPinturaUvPcs,
      ownerId: user.uid,
    };
    setFactorySettings(updatedSettings);
    try {
      localStorage.setItem('multilinea_factory_settings_cache', JSON.stringify(updatedSettings));
    } catch (e) {
      console.warn('Could not cache settings to localStorage:', e);
    }

    try {
      await setDoc(doc(db, 'factory_settings', docId), {
        targetCorteM2: payload.targetCorteM2,
        targetCorteMonthlyM2: payload.targetCorteMonthlyM2,
        targetCortePcs: payload.targetCortePcs,
        targetCorteMdfM2: effectiveMdfM2,
        targetCorteMdfMonthlyM2: effectiveMdfMonthly,
        targetCorteMdfPcs: effectiveMdfPcs,
        targetCorteFundoM2: effectiveFundoM2,
        targetCorteFundoMonthlyM2: effectiveFundoMonthly,
        targetCorteFundoPcs: effectiveFundoPcs,
        targetColadeiraMl: payload.targetColadeiraMl,
        targetColadeiraMonthlyMl: payload.targetColadeiraMonthlyMl,
        targetColadeiraPcs: payload.targetColadeiraPcs,
        targetFuradeiraPcs: payload.targetFuradeiraPcs,
        targetFuradeiraMonthlyPcs: payload.targetFuradeiraMonthlyPcs,
        targetPinturaUvM2: payload.targetPinturaUvM2,
        targetPinturaUvMonthlyM2: payload.targetPinturaUvMonthlyM2,
        targetPinturaUvPcs: payload.targetPinturaUvPcs,
        ownerId: user.uid,
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `factory_settings/${docId}`);
      throw err;
    }
  };

  const handleCreateMachine = async (payload: {
    name: string;
    sector: SectorId;
    username: string;
    accessPin: string;
  }) => {
    if (!user) return;
    const machineId = `mac_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    try {
      await setDoc(doc(db, 'machines', machineId), {
        name: payload.name,
        sector: payload.sector,
        username: payload.username,
        accessPin: payload.accessPin,
        status: 'OPERANDO',
        currentProduct: '',
        currentPaCode: '',
        currentPart: '',
        currentPartCode: '',
        currentBatch: '',
        ownerId: user.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `machines/${machineId}`);
    }
  };

  const handleDeleteMachine = async (machineId: string) => {
    try {
      if (activeMachineId === machineId) {
        handleLogoutMachine();
      }
      await deleteDoc(doc(db, 'machines', machineId));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `machines/${machineId}`);
    }
  };

  const handleCreateCatalogPart = async (payload: {
    productName: string;
    paCode: string;
    partName: string;
    partCode: string;
    piecesPerProduct?: number;
    dimensions: string;
    squareMeters: number;
    uvSquareMeters: number;
    uvFaces: number;
    linearMeters: number;
    edgeConfig: string;
    rawMaterial?: string;
    isFundo?: boolean;
  }) => {
    if (!user) return;
    const cleanPa = (payload.paCode || '').trim().toUpperCase();
    const cleanPart = (payload.partCode || '').trim().toUpperCase();
    const safePiecesPerProd = Math.max(1, Math.min(1000, Math.round(Number(payload.piecesPerProduct) || 1)));
    const newCompKey = `${cleanPa}:::${cleanPart}`;

    // Check if a piece with the exact same PA and partCode already exists
    const existingDoc = catalogParts.find(
      (p) =>
        (p.paCode || '').trim().toUpperCase() === cleanPa &&
        (p.partCode || '').trim().toUpperCase() === cleanPart
    );

    // Use existing document ID or create a deterministic ID based on PA and Part code to guarantee zero duplicates
    const sanitizedPa = cleanPa.replace(/[^a-zA-Z0-9_-]/g, '_');
    const sanitizedPart = cleanPart.replace(/[^a-zA-Z0-9_-]/g, '_');
    const partId = existingDoc?.id || `part_${sanitizedPa}_${sanitizedPart}`;

    // Ensure newly created part is not blocked by any previous deletion marker
    if (typeof window !== 'undefined') {
      const deletedList: string[] = JSON.parse(
        localStorage.getItem('multilinea_deleted_catalog_parts') || '[]'
      );
      if (deletedList.includes(newCompKey) || deletedList.includes(partId)) {
        const nextDeleted = deletedList.filter((k) => k !== newCompKey && k !== partId);
        localStorage.setItem('multilinea_deleted_catalog_parts', JSON.stringify(nextDeleted));
      }
    }

    try {
      const docRef = doc(db, 'catalog_parts', partId);
      const dataToSave: Record<string, unknown> = {
        productName: payload.productName,
        paCode: payload.paCode,
        partName: payload.partName,
        partCode: payload.partCode,
        piecesPerProduct: safePiecesPerProd,
        dimensions: payload.dimensions,
        squareMeters: payload.squareMeters,
        uvSquareMeters: payload.uvSquareMeters,
        uvFaces: payload.uvFaces,
        linearMeters: payload.linearMeters,
        edgeConfig: payload.edgeConfig,
        ...(typeof payload.rawMaterial === 'string' ? { rawMaterial: payload.rawMaterial } : {}),
        ...(typeof payload.isFundo === 'boolean' ? { isFundo: payload.isFundo } : {}),
        ownerId: user.uid,
      };

      if (existingDoc) {
        dataToSave.updatedAt = serverTimestamp();
      } else {
        dataToSave.createdAt = serverTimestamp();
      }

      await setDoc(docRef, dataToSave, { merge: true });

      // Cleanly update local state: replace existing item if matching, or append if new
      setCatalogParts((prev) => {
        const itemIdx = prev.findIndex(
          (p) =>
            p.id === partId ||
            ((p.paCode || '').trim().toUpperCase() === cleanPa &&
              (p.partCode || '').trim().toUpperCase() === cleanPart)
        );
        const updatedItem: CatalogPart = {
          id: partId,
          productName: payload.productName,
          paCode: payload.paCode,
          partName: payload.partName,
          partCode: payload.partCode,
          piecesPerProduct: safePiecesPerProd,
          dimensions: payload.dimensions,
          squareMeters: payload.squareMeters,
          uvSquareMeters: payload.uvSquareMeters,
          uvFaces: payload.uvFaces,
          linearMeters: payload.linearMeters,
          edgeConfig: payload.edgeConfig,
          rawMaterial: payload.rawMaterial,
          isFundo: payload.isFundo,
          ownerId: existingDoc?.ownerId || user.uid,
          createdAt: existingDoc?.createdAt || null,
        };

        if (itemIdx >= 0) {
          const next = [...prev];
          next[itemIdx] = { ...next[itemIdx], ...updatedItem };
          return next;
        }
        return [...prev, updatedItem];
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `catalog_parts/${partId}`);
    }
  };

  const handleBatchCreateCatalogParts = async (
    items: {
      productName: string;
      paCode: string;
      partName: string;
      partCode: string;
      piecesPerProduct?: number;
      dimensions: string;
      squareMeters: number;
      uvSquareMeters: number;
      uvFaces: number;
      linearMeters: number;
      edgeConfig: string;
      rawMaterial?: string;
      isFundo?: boolean;
    }[]
  ): Promise<{ createdCount: number; updatedCount: number }> => {
    if (!user || items.length === 0) return { createdCount: 0, updatedCount: 0 };

    let createdCount = 0;
    let updatedCount = 0;
    const nextPartsMap = new Map<string, CatalogPart>();
    catalogParts.forEach((p) => nextPartsMap.set(p.id, p));

    // Clear deleted marker from localStorage if any of the keys were previously deleted
    if (typeof window !== 'undefined') {
      const deletedList: string[] = JSON.parse(
        localStorage.getItem('multilinea_deleted_catalog_parts') || '[]'
      );
      if (deletedList.length > 0) {
        const toUnmark = new Set<string>();
        items.forEach((it) => {
          const cPa = (it.paCode || '').trim().toUpperCase();
          const cPart = (it.partCode || '').trim().toUpperCase();
          toUnmark.add(`${cPa}:::${cPart}`);
        });
        const remainingDeleted = deletedList.filter((k) => !toUnmark.has(k));
        localStorage.setItem('multilinea_deleted_catalog_parts', JSON.stringify(remainingDeleted));
      }
    }

    try {
      const BATCH_SIZE = 450;
      for (let i = 0; i < items.length; i += BATCH_SIZE) {
        const slice = items.slice(i, i + BATCH_SIZE);
        const batch = writeBatch(db);

        slice.forEach((payload) => {
          const cleanPa = (payload.paCode || '').trim().toUpperCase();
          const cleanPart = (payload.partCode || '').trim().toUpperCase();
          const safePiecesPerProd = Math.max(1, Math.min(1000, Math.round(Number(payload.piecesPerProduct) || 1)));

          const existingDoc = catalogParts.find(
            (p) =>
              (p.paCode || '').trim().toUpperCase() === cleanPa &&
              (p.partCode || '').trim().toUpperCase() === cleanPart
          );

          const sanitizedPa = cleanPa.replace(/[^a-zA-Z0-9_-]/g, '_');
          const sanitizedPart = cleanPart.replace(/[^a-zA-Z0-9_-]/g, '_');
          const partId = existingDoc?.id || `part_${sanitizedPa}_${sanitizedPart}`;

          const docRef = doc(db, 'catalog_parts', partId);
          const dataToSave: Record<string, unknown> = {
            productName: payload.productName || 'PRODUTO NÃO ESPECIFICADO',
            paCode: payload.paCode || cleanPa,
            partName: payload.partName || `PEÇA ${cleanPart}`,
            partCode: payload.partCode || cleanPart,
            piecesPerProduct: safePiecesPerProd,
            dimensions: payload.dimensions || '',
            squareMeters: typeof payload.squareMeters === 'number' ? payload.squareMeters : 0,
            uvSquareMeters: Number(payload.uvSquareMeters) || 0,
            uvFaces: typeof payload.uvFaces === 'number' ? payload.uvFaces : 2,
            linearMeters: Number(payload.linearMeters) || 0,
            edgeConfig: payload.edgeConfig || '1C + 2L',
            ...(typeof payload.rawMaterial === 'string' ? { rawMaterial: payload.rawMaterial } : {}),
            ...(typeof payload.isFundo === 'boolean' ? { isFundo: payload.isFundo } : {}),
            ownerId: user.uid,
          };

          if (existingDoc) {
            dataToSave.updatedAt = serverTimestamp();
            updatedCount++;
          } else {
            dataToSave.createdAt = serverTimestamp();
            createdCount++;
          }

          batch.set(docRef, dataToSave, { merge: true });

          nextPartsMap.set(partId, {
            id: partId,
            productName: payload.productName || 'PRODUTO NÃO ESPECIFICADO',
            paCode: payload.paCode || cleanPa,
            partName: payload.partName || `PEÇA ${cleanPart}`,
            partCode: payload.partCode || cleanPart,
            piecesPerProduct: safePiecesPerProd,
            dimensions: payload.dimensions || '',
            squareMeters: typeof payload.squareMeters === 'number' ? payload.squareMeters : 0,
            uvSquareMeters: Number(payload.uvSquareMeters) || 0,
            uvFaces: typeof payload.uvFaces === 'number' ? payload.uvFaces : 2,
            linearMeters: Number(payload.linearMeters) || 0,
            edgeConfig: payload.edgeConfig || '1C + 2L',
            rawMaterial: payload.rawMaterial,
            isFundo: payload.isFundo,
            ownerId: existingDoc?.ownerId || user.uid,
            createdAt: existingDoc?.createdAt || null,
          });
        });

        await batch.commit();
      }

      setCatalogParts(Array.from(nextPartsMap.values()));
      return { createdCount, updatedCount };
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'catalog_parts/batch_import');
      throw err;
    }
  };

  const handleUpdateCatalogPart = async (
    partId: string,
    payload: {
      productName: string;
      paCode: string;
      partName: string;
      partCode: string;
      piecesPerProduct?: number;
      dimensions: string;
      squareMeters: number;
      uvSquareMeters: number;
      uvFaces: number;
      linearMeters: number;
      edgeConfig: string;
      rawMaterial?: string;
      isFundo?: boolean;
    }
  ) => {
    if (!user) return;
    const safePiecesPerProd = Math.max(1, Math.min(1000, Math.round(Number(payload.piecesPerProduct) || 1)));

    // Track old vs new composite keys
    const oldPart = effectiveCatalogParts.find((p) => p.id === partId);
    if (typeof window !== 'undefined') {
      const deletedList: string[] = JSON.parse(
        localStorage.getItem('multilinea_deleted_catalog_parts') || '[]'
      );
      let updatedDeleted = [...deletedList];

      if (oldPart) {
        const oldCompKey = `${(oldPart.paCode || '').trim().toUpperCase()}:::${(oldPart.partCode || '').trim().toUpperCase()}`;
        const newCompKey = `${(payload.paCode || '').trim().toUpperCase()}:::${(payload.partCode || '').trim().toUpperCase()}`;
        if (oldCompKey !== newCompKey && !updatedDeleted.includes(oldCompKey)) {
          updatedDeleted.push(oldCompKey);
        }
      }
      const newKey = `${(payload.paCode || '').trim().toUpperCase()}:::${(payload.partCode || '').trim().toUpperCase()}`;
      updatedDeleted = updatedDeleted.filter((k) => k !== newKey && k !== partId);
      localStorage.setItem('multilinea_deleted_catalog_parts', JSON.stringify(updatedDeleted));
    }

    try {
      const docRef = doc(db, 'catalog_parts', partId);
      // Try updateDoc first: this ONLY modifies the fields that changed,
      // strictly preserving createdAt and ownerId without triggering rule mismatches.
      try {
        await updateDoc(docRef, {
          productName: payload.productName,
          paCode: payload.paCode,
          partName: payload.partName,
          partCode: payload.partCode,
          piecesPerProduct: safePiecesPerProd,
          dimensions: payload.dimensions,
          squareMeters: payload.squareMeters,
          uvSquareMeters: payload.uvSquareMeters,
          uvFaces: payload.uvFaces,
          linearMeters: payload.linearMeters,
          edgeConfig: payload.edgeConfig,
          ...(typeof payload.rawMaterial === 'string' ? { rawMaterial: payload.rawMaterial } : {}),
          ...(typeof payload.isFundo === 'boolean' ? { isFundo: payload.isFundo } : {}),
          updatedAt: serverTimestamp(),
        });
      } catch (updateErr: any) {
        // If document didn't exist in Firestore yet or updateDoc threw, save it permanently with setDoc merge
        await setDoc(
          docRef,
          {
            productName: payload.productName,
            paCode: payload.paCode,
            partName: payload.partName,
            partCode: payload.partCode,
            piecesPerProduct: safePiecesPerProd,
            dimensions: payload.dimensions,
            squareMeters: payload.squareMeters,
            uvSquareMeters: payload.uvSquareMeters,
            uvFaces: payload.uvFaces,
            linearMeters: payload.linearMeters,
            edgeConfig: payload.edgeConfig,
            ...(typeof payload.rawMaterial === 'string' ? { rawMaterial: payload.rawMaterial } : {}),
            ...(typeof payload.isFundo === 'boolean' ? { isFundo: payload.isFundo } : {}),
            ownerId: oldPart?.ownerId || user.uid,
            createdAt: oldPart?.createdAt || serverTimestamp(),
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );
      }

      // Also ensure any matching document with the same composite key (e.g. user-suffixed doc) is synced so it never reverts
      const newCompKey = `${(payload.paCode || '').trim().toUpperCase()}:::${(payload.partCode || '').trim().toUpperCase()}`;
      const duplicateDocs = catalogParts.filter(
        (p) =>
          p.id !== partId &&
          `${(p.paCode || '').trim().toUpperCase()}:::${(p.partCode || '').trim().toUpperCase()}` === newCompKey
      );
      for (const d of duplicateDocs) {
        try {
          await setDoc(
            doc(db, 'catalog_parts', d.id),
            {
              productName: payload.productName,
              paCode: payload.paCode,
              partName: payload.partName,
              partCode: payload.partCode,
              piecesPerProduct: safePiecesPerProd,
              dimensions: payload.dimensions,
              squareMeters: payload.squareMeters,
              uvSquareMeters: payload.uvSquareMeters,
              uvFaces: payload.uvFaces,
              linearMeters: payload.linearMeters,
              edgeConfig: payload.edgeConfig,
              ...(typeof payload.rawMaterial === 'string' ? { rawMaterial: payload.rawMaterial } : {}),
              ...(typeof payload.isFundo === 'boolean' ? { isFundo: payload.isFundo } : {}),
              updatedAt: serverTimestamp(),
            },
            { merge: true }
          );
        } catch {
          // ignore secondary sync error
        }
      }

      // Immediately update local state
      setCatalogParts((prev) => {
        const idx = prev.findIndex((p) => p.id === partId);
        const updatedItem: CatalogPart = {
          id: partId,
          productName: payload.productName,
          paCode: payload.paCode,
          partName: payload.partName,
          partCode: payload.partCode,
          piecesPerProduct: safePiecesPerProd,
          dimensions: payload.dimensions,
          squareMeters: payload.squareMeters,
          uvSquareMeters: payload.uvSquareMeters,
          uvFaces: payload.uvFaces,
          linearMeters: payload.linearMeters,
          edgeConfig: payload.edgeConfig,
          rawMaterial: payload.rawMaterial,
          isFundo: payload.isFundo,
          ownerId: oldPart?.ownerId || user.uid,
          createdAt: oldPart?.createdAt || null,
        };
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = { ...next[idx], ...updatedItem };
          return next;
        }
        return [...prev, updatedItem];
      });
    } catch (err) {
      console.error('Error updating catalog part in Firestore:', err);
      handleFirestoreError(err, OperationType.UPDATE, `catalog_parts/${partId}`);
      throw err;
    }
  };

  const handleDeleteCatalogPart = async (partId: string) => {
    try {
      const targetPart = effectiveCatalogParts.find((p) => p.id === partId);
      const targetPa = (targetPart?.paCode || '').trim().toUpperCase();
      const targetCode = (targetPart?.partCode || '').trim().toUpperCase();
      const compKey = targetPart ? `${targetPa}:::${targetCode}` : '';

      // 1. Delete document from Firestore
      await deleteDoc(doc(db, 'catalog_parts', partId));

      // 2. Also attempt deletion of user-suffixed docId if present
      if (user) {
        const suffixedId = `${partId}_${user.uid.slice(0, 6)}`;
        try {
          await deleteDoc(doc(db, 'catalog_parts', suffixedId));
        } catch {
          // ignore if doc doesn't exist
        }
      }

      // 3. If there are any duplicate Firestore documents with the exact same PA & partCode, purge them too
      if (targetPa && targetCode) {
        const duplicateDocs = catalogParts.filter(
          (p) =>
            p.id !== partId &&
            (p.paCode || '').trim().toUpperCase() === targetPa &&
            (p.partCode || '').trim().toUpperCase() === targetCode
        );
        for (const dup of duplicateDocs) {
          try {
            await deleteDoc(doc(db, 'catalog_parts', dup.id));
          } catch {
            // ignore
          }
        }
      }

      // 4. Mark in deleted list ONLY for partId, or for compKey ONLY IF it is an initial seed part
      if (typeof window !== 'undefined') {
        const deletedList: string[] = JSON.parse(
          localStorage.getItem('multilinea_deleted_catalog_parts') || '[]'
        );
        if (!deletedList.includes(partId)) {
          deletedList.push(partId);
        }

        // Only add composite key to localStorage if this was an INITIAL SEED part (to prevent resurrection)
        // For custom user-created parts, NEVER block the compKey so the user can freely re-register if desired!
        const isSeedPart = INITIAL_CATALOG_PARTS.some(
          (ip) =>
            ip.id === partId ||
            (compKey &&
              `${(ip.paCode || '').trim().toUpperCase()}:::${(ip.partCode || '').trim().toUpperCase()}` ===
                compKey)
        );

        if (isSeedPart && compKey && !deletedList.includes(compKey)) {
          deletedList.push(compKey);
        } else if (!isSeedPart && compKey) {
          // If a custom compKey was previously mistakenly stored, remove it
          const filtered = deletedList.filter((k) => k !== compKey);
          localStorage.setItem('multilinea_deleted_catalog_parts', JSON.stringify(filtered));
          return;
        }

        localStorage.setItem('multilinea_deleted_catalog_parts', JSON.stringify(deletedList));
      }

      // 5. Immediately remove from local state
      setCatalogParts((prev) =>
        prev.filter((p) => {
          if (p.id === partId || p.id === `${partId}_${user?.uid?.slice(0, 6)}`) {
            return false;
          }
          if (
            targetPa &&
            targetCode &&
            (p.paCode || '').trim().toUpperCase() === targetPa &&
            (p.partCode || '').trim().toUpperCase() === targetCode
          ) {
            return false;
          }
          return true;
        })
      );
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `catalog_parts/${partId}`);
    }
  };

  const handleClearAllCatalogParts = async (): Promise<number> => {
    if (!user) return 0;
    try {
      localStorage.setItem('multilinea_catalog_cleared', '1');
      const batch = writeBatch(db);
      for (const p of catalogParts) {
        batch.delete(doc(db, 'catalog_parts', p.id));
      }
      await batch.commit();
      return catalogParts.length;
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, 'catalog_parts');
      return 0;
    }
  };

  const handleRestoreDefaultCatalogParts = async (): Promise<number> => {
    if (!user) return 0;
    try {
      localStorage.removeItem('multilinea_catalog_cleared');
      localStorage.removeItem('multilinea_deleted_catalog_parts');
      const batch = writeBatch(db);
      for (const c of INITIAL_CATALOG_PARTS) {
        const docId = `${c.id}_${user.uid.slice(0, 6)}`;
        batch.set(doc(db, 'catalog_parts', docId), {
          productName: c.productName,
          paCode: c.paCode,
          partName: c.partName,
          partCode: c.partCode,
          piecesPerProduct: c.piecesPerProduct ?? 1,
          dimensions: c.dimensions,
          squareMeters: c.squareMeters,
          uvFaces: c.uvFaces ?? 1,
          uvSquareMeters: c.uvSquareMeters ?? c.squareMeters,
          linearMeters: c.linearMeters,
          edgeConfig: c.edgeConfig || '1C + 2L',
          ownerId: user.uid,
          createdAt: serverTimestamp(),
        });
      }
      await batch.commit();
      return INITIAL_CATALOG_PARTS.length;
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'catalog_parts');
      return 0;
    }
  };

  const handleRestoreDefaultOrders = async (): Promise<number> => {
    if (!user) return 0;
    try {
      localStorage.removeItem('multilinea_orders_cleared_by_user');
      localStorage.removeItem('multilinea_deleted_batches');
      localStorage.removeItem('multilinea_deleted_encomendas');
      const batch = writeBatch(db);
      for (const item of INITIAL_PRODUCTION_ORDERS) {
        const docId = `${item.id}_${user.uid.slice(0, 6)}`;
        batch.set(doc(db, 'production_orders', docId), {
          orderCode: item.orderCode,
          productCode: item.productCode,
          batchNumber: item.batchNumber,
          productLine: item.productLine,
          scheduleColor: item.scheduleColor,
          productDescription: item.productDescription,
          finishColor: item.finishColor,
          qtyV01: item.qtyV01,
          qtyV02: item.qtyV02,
          qtyV03: item.qtyV03,
          totalVolumes: item.totalVolumes,
          dateCorte: item.dateCorte,
          dateColadeira: item.dateColadeira,
          dateFuradeira: item.dateFuradeira,
          datePintura: item.datePintura,
          isHighlighted: Boolean(item.isHighlighted),
          isEncab: Boolean(item.isEncab),
          ownerId: user.uid,
          createdAt: serverTimestamp(),
        });
      }
      await batch.commit();
      return INITIAL_PRODUCTION_ORDERS.length;
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'production_orders');
      return 0;
    }
  };

  const handleDeleteLog = async (logId: string) => {
    try {
      await deleteDoc(doc(db, 'production_logs', logId));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `production_logs/${logId}`);
    }
  };

  const handleRecordDowntime = async (payload: {
    machine: Machine;
    reasonCode: string;
    reasonName: string;
    category: InefficiencyCategory;
    durationMinutes: number;
    operatorName: string;
    shift: ShiftId;
    notes: string;
  }) => {
    if (!user) return;
    const dtId = `dt_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    try {
      await setDoc(doc(db, 'downtime_logs', dtId), {
        machineId: payload.machine.id,
        machineName: payload.machine.name,
        machineUsername: payload.machine.username,
        sector: payload.machine.sector,
        reasonCode: payload.reasonCode,
        reasonName: payload.reasonName,
        category: payload.category,
        durationMinutes: payload.durationMinutes,
        operatorName: payload.operatorName,
        shift: payload.shift,
        notes: payload.notes,
        ownerId: user.uid,
        createdAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `downtime_logs/${dtId}`);
    }
  };

  const handleDeleteDowntimeLog = async (downtimeId: string) => {
    try {
      await deleteDoc(doc(db, 'downtime_logs', downtimeId));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `downtime_logs/${downtimeId}`);
    }
  };

  const handleCreateInefficiencyReason = async (payload: {
    code: string;
    name: string;
    category: InefficiencyCategory;
    sector: SectorId | 'ALL';
  }) => {
    if (!user) return;
    const reasonId = `inef_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    try {
      await setDoc(doc(db, 'inefficiency_reasons', reasonId), {
        code: payload.code,
        name: payload.name,
        category: payload.category,
        sector: payload.sector,
        ownerId: user.uid,
        createdAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `inefficiency_reasons/${reasonId}`);
    }
  };

  const handleDeleteInefficiencyReason = async (reasonId: string) => {
    try {
      await deleteDoc(doc(db, 'inefficiency_reasons', reasonId));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `inefficiency_reasons/${reasonId}`);
    }
  };

  const handleCreateProductionOrder = async (
    payload: Omit<ProductionOrder, 'id' | 'ownerId' | 'createdAt'>
  ) => {
    if (!user) return;
    localStorage.removeItem('multilinea_orders_cleared_by_user');
    const orderId = `pmp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const batchKey = (payload.batchNumber || '').trim().toUpperCase();
    let encCode = (payload.orderCode || '').trim().toUpperCase().replace(/[\s\-_/]+/g, '');
    const lotEncMatch = encCode.match(/^([A-Z]\d{5})\d+$/);
    if (lotEncMatch) {
      encCode = lotEncMatch[1];
    }

    // Ensure newly created order isn't suppressed by previous deletions
    if (typeof window !== 'undefined') {
      const deletedBatches: string[] = JSON.parse(
        localStorage.getItem('multilinea_deleted_batches') || '[]'
      );
      if (deletedBatches.includes(batchKey) || deletedBatches.includes(orderId)) {
        const nextBatches = deletedBatches.filter(
          (b) => b !== batchKey && b !== orderId
        );
        localStorage.setItem('multilinea_deleted_batches', JSON.stringify(nextBatches));
      }

      const deletedEncomendas: string[] = JSON.parse(
        localStorage.getItem('multilinea_deleted_encomendas') || '[]'
      );
      if (deletedEncomendas.includes(encCode)) {
        const nextEnc = deletedEncomendas.filter((e) => e !== encCode);
        localStorage.setItem('multilinea_deleted_encomendas', JSON.stringify(nextEnc));
      }
    }

    const newOrder: ProductionOrder = {
      id: orderId,
      orderCode: encCode || payload.orderCode,
      productCode: payload.productCode,
      batchNumber: payload.batchNumber,
      productLine: payload.productLine,
      scheduleColor: payload.scheduleColor,
      productDescription: payload.productDescription,
      finishColor: payload.finishColor,
      qtyV01: payload.qtyV01,
      qtyV02: payload.qtyV02,
      qtyV03: payload.qtyV03,
      totalVolumes: payload.totalVolumes,
      dateCorte: payload.dateCorte || '',
      dateColadeira: payload.dateColadeira || '',
      dateFuradeira: payload.dateFuradeira || '',
      datePintura: payload.datePintura || '',
      isHighlighted: Boolean(payload.isHighlighted),
      isEncab: Boolean(payload.isEncab),
      ownerId: user.uid,
    };

    setProductionOrders((prev) => [...prev, newOrder]);

    try {
      await setDoc(doc(db, 'production_orders', orderId), {
        orderCode: encCode || payload.orderCode,
        productCode: payload.productCode,
        batchNumber: payload.batchNumber,
        productLine: payload.productLine,
        scheduleColor: payload.scheduleColor,
        productDescription: payload.productDescription,
        finishColor: payload.finishColor,
        qtyV01: payload.qtyV01,
        qtyV02: payload.qtyV02,
        qtyV03: payload.qtyV03,
        totalVolumes: payload.totalVolumes,
        dateCorte: payload.dateCorte || '',
        dateColadeira: payload.dateColadeira || '',
        dateFuradeira: payload.dateFuradeira || '',
        datePintura: payload.datePintura || '',
        isHighlighted: Boolean(payload.isHighlighted),
        isEncab: Boolean(payload.isEncab),
        ownerId: user.uid,
        createdAt: serverTimestamp(),
      });
    } catch (err) {
      console.error('Error creating production order in Firestore:', err);
      throw err;
    }
  };

  const handleUpdateProductionOrder = async (
    orderId: string,
    payload: Omit<ProductionOrder, 'id' | 'ownerId' | 'createdAt'>
  ) => {
    if (!user) return;
    localStorage.removeItem('multilinea_orders_cleared_by_user');
    const batchKey = (payload.batchNumber || '').trim().toUpperCase();
    let encCode = (payload.orderCode || '').trim().toUpperCase().replace(/[\s\-_/]+/g, '');
    const lotEncMatch = encCode.match(/^([A-Z]\d{5})\d+$/);
    if (lotEncMatch) {
      encCode = lotEncMatch[1];
    }

    // Ensure updated order isn't suppressed
    if (typeof window !== 'undefined') {
      const deletedBatches: string[] = JSON.parse(
        localStorage.getItem('multilinea_deleted_batches') || '[]'
      );
      if (deletedBatches.includes(batchKey) || deletedBatches.includes(orderId)) {
        const nextBatches = deletedBatches.filter(
          (b) => b !== batchKey && b !== orderId
        );
        localStorage.setItem('multilinea_deleted_batches', JSON.stringify(nextBatches));
      }

      const deletedEncomendas: string[] = JSON.parse(
        localStorage.getItem('multilinea_deleted_encomendas') || '[]'
      );
      if (deletedEncomendas.includes(encCode)) {
        const nextEnc = deletedEncomendas.filter((e) => e !== encCode);
        localStorage.setItem('multilinea_deleted_encomendas', JSON.stringify(nextEnc));
      }
    }

    const existingDoc = productionOrders.find((o) => o.id === orderId);
    const effectiveOrderCode = encCode || payload.orderCode;

    // Immediately update local state
    setProductionOrders((prev) => {
      const idx = prev.findIndex((o) => o.id === orderId);
      const updated: ProductionOrder = {
        id: orderId,
        ...payload,
        orderCode: effectiveOrderCode,
        ownerId: existingDoc?.ownerId || user.uid,
      };
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = { ...next[idx], ...updated };
        return next;
      }
      return [...prev, updated];
    });

    try {
      const docRef = doc(db, 'production_orders', orderId);
      // Try updateDoc first: this only modifies the fields that changed,
      // preserving createdAt and ownerId without triggering rule mismatches.
      try {
        await updateDoc(docRef, {
          orderCode: effectiveOrderCode,
          productCode: payload.productCode,
          batchNumber: payload.batchNumber,
          productLine: payload.productLine,
          scheduleColor: payload.scheduleColor,
          productDescription: payload.productDescription,
          finishColor: payload.finishColor,
          qtyV01: payload.qtyV01,
          qtyV02: payload.qtyV02,
          qtyV03: payload.qtyV03,
          totalVolumes: payload.totalVolumes,
          dateCorte: payload.dateCorte || '',
          dateColadeira: payload.dateColadeira || '',
          dateFuradeira: payload.dateFuradeira || '',
          datePintura: payload.datePintura || '',
          isHighlighted: Boolean(payload.isHighlighted),
          isEncab: Boolean(payload.isEncab),
          updatedAt: serverTimestamp(),
        });
      } catch (updateErr: any) {
        // If document didn't exist in Firestore yet (e.g. from initial seed data), create it
        if (
          updateErr?.code === 'not-found' ||
          !existingDoc ||
          String(updateErr?.message || '').includes('No document to update')
        ) {
          await setDoc(docRef, {
            orderCode: effectiveOrderCode,
            productCode: payload.productCode,
            batchNumber: payload.batchNumber,
            productLine: payload.productLine,
            scheduleColor: payload.scheduleColor,
            productDescription: payload.productDescription,
            finishColor: payload.finishColor,
            qtyV01: payload.qtyV01,
            qtyV02: payload.qtyV02,
            qtyV03: payload.qtyV03,
            totalVolumes: payload.totalVolumes,
            dateCorte: payload.dateCorte || '',
            dateColadeira: payload.dateColadeira || '',
            dateFuradeira: payload.dateFuradeira || '',
            datePintura: payload.datePintura || '',
            isHighlighted: Boolean(payload.isHighlighted),
            isEncab: Boolean(payload.isEncab),
            ownerId: user.uid,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        } else {
          throw updateErr;
        }
      }
    } catch (err) {
      console.error('Error updating production order in Firestore:', err);
      throw err;
    }
  };

  const handleDeleteProductionOrder = async (orderId: string) => {
    // 1. Locate order to record its batch and identifier
    const target =
      effectiveProductionOrders.find((o) => o.id === orderId) ||
      productionOrders.find((o) => o.id === orderId);
    const batchKey = (target?.batchNumber || '').trim().toUpperCase();

    // 2. Persist deletion marker so it NEVER resurrects
    if (typeof window !== 'undefined') {
      const deletedBatches: string[] = JSON.parse(
        localStorage.getItem('multilinea_deleted_batches') || '[]'
      );
      const nextBatches = [...deletedBatches];
      if (!nextBatches.includes(orderId)) nextBatches.push(orderId);
      if (batchKey && !nextBatches.includes(batchKey)) nextBatches.push(batchKey);
      localStorage.setItem('multilinea_deleted_batches', JSON.stringify(nextBatches));
    }

    // 3. Update local state immediately for instant feedback
    setProductionOrders((prev) =>
      prev.filter(
        (o) =>
          o.id !== orderId &&
          (batchKey ? (o.batchNumber || '').trim().toUpperCase() !== batchKey : true)
      )
    );

    // 4. Delete primary document and any matching Firestore documents
    try {
      await deleteDoc(doc(db, 'production_orders', orderId));

      if (user) {
        const suffixedId = `${orderId}_${user.uid.slice(0, 6)}`;
        try {
          await deleteDoc(doc(db, 'production_orders', suffixedId));
        } catch {
          // ignore
        }
      }

      if (batchKey) {
        const matches = productionOrders.filter(
          (o) =>
            o.id !== orderId &&
            (o.batchNumber || '').trim().toUpperCase() === batchKey
        );
        for (const m of matches) {
          try {
            await deleteDoc(doc(db, 'production_orders', m.id));
          } catch {
            // ignore
          }
        }
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `production_orders/${orderId}`);
    }
  };

  const handleClearAllProductionOrders = async (): Promise<number> => {
    if (!user) return 0;
    try {
      localStorage.setItem('multilinea_orders_cleared_by_user', '1');
      const total = effectiveProductionOrders.length || productionOrders.length;
      if (total === 0) return 0;

      // Mark all current batches and encomendas as deleted
      if (typeof window !== 'undefined') {
        const allBatches = effectiveProductionOrders.map((o) =>
          (o.batchNumber || o.id).trim().toUpperCase()
        );
        localStorage.setItem('multilinea_deleted_batches', JSON.stringify(allBatches));
      }

      setProductionOrders([]);

      const batch = writeBatch(db);
      for (const o of productionOrders) {
        batch.delete(doc(db, 'production_orders', o.id));
      }
      await batch.commit();
      return total;
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, 'production_orders');
      return 0;
    }
  };

  const handleDeleteEncomenda = async (encomendaCode: string): Promise<number> => {
    if (!user) return 0;
    const cleanCode = encomendaCode.trim().toUpperCase().replace(/[\s\-_/]+/g, '');
    const canonicalClean = cleanCode.match(/^([A-Z]\d{5})/)?.[1] || cleanCode;

    const matchesEnc = (oCode: string) => {
      const c = (oCode || '').trim().toUpperCase().replace(/[\s\-_/]+/g, '');
      const match = c.match(/^([A-Z]\d{5})/);
      return c === cleanCode || c === canonicalClean || (match && match[1] === canonicalClean);
    };

    // 1. Identify all matching orders in both effectiveProductionOrders and productionOrders
    const toDeleteEffective = effectiveProductionOrders.filter((o) => matchesEnc(o.orderCode));
    const toDeleteFirestore = productionOrders.filter((o) => matchesEnc(o.orderCode));

    const totalRemoved = Math.max(toDeleteEffective.length, toDeleteFirestore.length);
    if (totalRemoved === 0) return 0;

    // 2. Persist deletion of this encomenda and all its batch numbers
    if (typeof window !== 'undefined') {
      const deletedEncomendas: string[] = JSON.parse(
        localStorage.getItem('multilinea_deleted_encomendas') || '[]'
      );
      if (!deletedEncomendas.includes(cleanCode)) {
        deletedEncomendas.push(cleanCode);
        localStorage.setItem(
          'multilinea_deleted_encomendas',
          JSON.stringify(deletedEncomendas)
        );
      }

      const deletedBatches: string[] = JSON.parse(
        localStorage.getItem('multilinea_deleted_batches') || '[]'
      );
      const updatedBatches = [...deletedBatches];

      toDeleteEffective.forEach((o) => {
        const b = (o.batchNumber || '').trim().toUpperCase();
        if (b && !updatedBatches.includes(b)) updatedBatches.push(b);
        if (o.id && !updatedBatches.includes(o.id)) updatedBatches.push(o.id);
      });
      toDeleteFirestore.forEach((o) => {
        const b = (o.batchNumber || '').trim().toUpperCase();
        if (b && !updatedBatches.includes(b)) updatedBatches.push(b);
        if (o.id && !updatedBatches.includes(o.id)) updatedBatches.push(o.id);
      });

      localStorage.setItem('multilinea_deleted_batches', JSON.stringify(updatedBatches));
    }

    // 3. Immediately clear from local state
    setProductionOrders((prev) =>
      prev.filter((o) => (o.orderCode || '').trim().toUpperCase() !== cleanCode)
    );

    // 4. Batch delete all from Firestore
    try {
      const batch = writeBatch(db);
      const docIds = new Set<string>();

      toDeleteFirestore.forEach((o) => docIds.add(o.id));
      toDeleteEffective.forEach((o) => {
        docIds.add(o.id);
        if (user) {
          docIds.add(`${o.id}_${user.uid.slice(0, 6)}`);
        }
      });

      for (const id of docIds) {
        batch.delete(doc(db, 'production_orders', id));
      }
      await batch.commit();
      return totalRemoved;
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, 'production_orders');
      return totalRemoved;
    }
  };

  const handleBulkImportOrders = async (
    items: Omit<ProductionOrder, 'id' | 'ownerId' | 'createdAt'>[]
  ): Promise<number> => {
    if (!user) return 0;
    localStorage.removeItem('multilinea_orders_cleared_by_user');
    let count = 0;
    try {
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const cleanBatch = item.batchNumber.trim().toUpperCase();
        const existingOrder = productionOrders.find(
          (o) => o.batchNumber.trim().toUpperCase() === cleanBatch
        );

        if (existingOrder) {
          await updateDoc(doc(db, 'production_orders', existingOrder.id), {
            orderCode: item.orderCode,
            productCode: item.productCode,
            batchNumber: item.batchNumber,
            productLine: item.productLine,
            scheduleColor: item.scheduleColor,
            productDescription: item.productDescription,
            finishColor: item.finishColor,
            qtyV01: item.qtyV01,
            qtyV02: item.qtyV02,
            qtyV03: item.qtyV03,
            totalVolumes: item.totalVolumes,
            dateCorte: item.dateCorte,
            dateColadeira: item.dateColadeira,
            dateFuradeira: item.dateFuradeira,
            datePintura: item.datePintura,
            isHighlighted: Boolean(item.isHighlighted),
            isEncab: Boolean(item.isEncab),
          });
        } else {
          const orderId = `pmp_${Date.now()}_${i}_${Math.random().toString(36).slice(2, 5)}`;
          await setDoc(doc(db, 'production_orders', orderId), {
            orderCode: item.orderCode,
            productCode: item.productCode,
            batchNumber: item.batchNumber,
            productLine: item.productLine,
            scheduleColor: item.scheduleColor,
            productDescription: item.productDescription,
            finishColor: item.finishColor,
            qtyV01: item.qtyV01,
            qtyV02: item.qtyV02,
            qtyV03: item.qtyV03,
            totalVolumes: item.totalVolumes,
            dateCorte: item.dateCorte,
            dateColadeira: item.dateColadeira,
            dateFuradeira: item.dateFuradeira,
            datePintura: item.datePintura,
            isHighlighted: Boolean(item.isHighlighted),
            isEncab: Boolean(item.isEncab),
            ownerId: user.uid,
            createdAt: serverTimestamp(),
          });
        }
        count++;
      }
      return count;
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'production_orders');
      return count;
    }
  };

  const handleClearAllLogs = async (onlyToday: boolean): Promise<number> => {
    if (!user) return 0;
    const todayStr = new Date().toLocaleDateString('pt-BR');
    const logsToDelete = onlyToday
      ? logs.filter((l) => {
          const logDate = l.createdAt
            ? new Date(l.createdAt.seconds * 1000).toLocaleDateString('pt-BR')
            : todayStr;
          return logDate === todayStr;
        })
      : logs;

    const downtimesToDelete = onlyToday
      ? downtimeLogs.filter((d) => {
          const logDate = d.createdAt
            ? new Date(d.createdAt.seconds * 1000).toLocaleDateString('pt-BR')
            : todayStr;
          return logDate === todayStr;
        })
      : downtimeLogs;

    let deletedCount = 0;
    try {
      for (const l of logsToDelete) {
        await deleteDoc(doc(db, 'production_logs', l.id));
        deletedCount++;
      }

      for (const d of downtimesToDelete) {
        await deleteDoc(doc(db, 'downtime_logs', d.id));
        deletedCount++;
      }

      if (!onlyToday) {
        for (const m of machines) {
          await updateDoc(doc(db, 'machines', m.id), {
            status: 'OPERANDO',
            currentProduct: '',
            currentPaCode: '',
            currentPart: '',
            currentPartCode: '',
            currentBatch: '',
            updatedAt: serverTimestamp(),
          });
        }
      }
      return deletedCount;
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, 'production_logs');
      return deletedCount;
    }
  };

  const handlePurgeFictitiousLogs = async (): Promise<number> => {
    if (!user) return 0;
    const fakeOperators = new Set([
      'Lucas Mendes',
      'Rafael Lima',
      'Tiago Santos',
      'José Roberto',
      'Carlos Silveira',
      'Marcos Souza',
    ]);
    const targets = logs.filter(
      (l) =>
        l.id.startsWith('log_sim_') ||
        (l.notes && l.notes.toLowerCase().includes('demonstração')) ||
        fakeOperators.has(l.operatorName)
    );
    const dtTargets = downtimeLogs.filter(
      (d) =>
        d.id.startsWith('dt_sim_') ||
        (d.notes && d.notes.toLowerCase().includes('ajuste de corte seccionadora'))
    );

    let count = 0;
    for (const l of targets) {
      try {
        await deleteDoc(doc(db, 'production_logs', l.id));
        count++;
      } catch (e) {
        console.error('Error deleting mock log:', e);
      }
    }
    for (const d of dtTargets) {
      try {
        await deleteDoc(doc(db, 'downtime_logs', d.id));
        count++;
      } catch (e) {
        console.error('Error deleting mock downtime:', e);
      }
    }
    return count;
  };

  const handleCreateAssistanceOrder = async (
    payload: Omit<AssistanceOrder, 'id' | 'ownerId' | 'createdAt' | 'updatedAt'>
  ) => {
    if (!user) return;
    const orderId = `ast_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const newOrder: AssistanceOrder = {
      ...payload,
      id: orderId,
      ownerId: user.uid,
    };
    setAssistanceOrders((prev) => [...prev, newOrder]);
    try {
      await setDoc(doc(db, 'assistance_orders', orderId), {
        ...payload,
        notes: payload.notes || '',
        invoiceNotes: payload.invoiceNotes || '',
        deliveredQuantity: payload.deliveredQuantity ?? 0,
        status: payload.status || 'PENDENTE',
        ownerId: user.uid,
        createdAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `assistance_orders/${orderId}`);
    }
  };

  const handleUpdateAssistanceOrder = async (
    orderId: string,
    payload: Partial<Omit<AssistanceOrder, 'id' | 'ownerId' | 'createdAt'>>
  ) => {
    if (!user) return;
    setAssistanceOrders((prev) =>
      prev.map((o) => (o.id === orderId ? { ...o, ...payload } : o))
    );
    try {
      const cleanPayload: Record<string, any> = {
        ...payload,
        updatedAt: serverTimestamp(),
      };
      await updateDoc(doc(db, 'assistance_orders', orderId), cleanPayload);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `assistance_orders/${orderId}`);
    }
  };

  const handleDeleteAssistanceOrder = async (orderId: string) => {
    if (!user) return;
    const cleanId = orderId.trim();

    // 1. Mark as deleted in state and localStorage so even seed orders disappear instantly and permanently
    setDeletedAssistanceIds((prev) => {
      const next = Array.from(new Set([...prev, cleanId.toLowerCase()]));
      localStorage.setItem('multilinea_deleted_assistance_ids', JSON.stringify(next));
      return next;
    });

    // 2. Remove from local assistance orders state
    setAssistanceOrders((prev) => prev.filter((o) => o.id !== cleanId));

    // 3. Delete from Firestore if it exists there
    try {
      await deleteDoc(doc(db, 'assistance_orders', cleanId));
    } catch (err) {
      console.warn('Could not delete from Firestore (might be initial seed or already removed):', err);
    }
  };

  const handleClearAllAssistanceOrders = async (planNumber?: string): Promise<number> => {
    if (!user) return 0;
    const targetPlan = (planNumber || '').trim().toUpperCase();

    // 1. Mark target plan as cleared in localStorage
    if (targetPlan) {
      setClearedAssistancePlans((prev) => {
        const next = Array.from(new Set([...prev, targetPlan]));
        localStorage.setItem('multilinea_cleared_assistance_plans', JSON.stringify(next));
        return next;
      });
    }

    // 2. Find all matching items to delete from Firestore
    const toDelete = assistanceOrders.filter(
      (o) => !targetPlan || (o.planNumber || '').trim().toUpperCase() === targetPlan
    );

    // Also collect all IDs from effectiveAssistanceOrders belonging to this plan to add to deletedAssistanceIds
    const affectedItemIds = effectiveAssistanceOrders
      .filter((o) => !targetPlan || (o.planNumber || '').trim().toUpperCase() === targetPlan)
      .map((o) => o.id.toLowerCase());

    setDeletedAssistanceIds((prev) => {
      const next = Array.from(new Set([...prev, ...affectedItemIds]));
      localStorage.setItem('multilinea_deleted_assistance_ids', JSON.stringify(next));
      return next;
    });

    // 3. Optimistically remove from assistanceOrders state
    setAssistanceOrders((prev) =>
      prev.filter((o) => targetPlan && (o.planNumber || '').trim().toUpperCase() !== targetPlan)
    );

    // 4. Batch delete in Firestore
    if (toDelete.length > 0) {
      try {
        const batch = writeBatch(db);
        toDelete.forEach((item) => {
          batch.delete(doc(db, 'assistance_orders', item.id));
        });
        await batch.commit();
      } catch (err) {
        console.warn('Batch delete error in Firestore:', err);
      }
    }

    return affectedItemIds.length;
  };

  const handleRestoreDefaultAssistanceOrders = async (): Promise<number> => {
    if (!user) return 0;
    // 1. Un-clear Plan 17/26
    setClearedAssistancePlans((prev) => {
      const next = prev.filter((p) => p !== '17/26');
      localStorage.setItem('multilinea_cleared_assistance_plans', JSON.stringify(next));
      return next;
    });

    // 2. Un-delete ast_17_* IDs
    setDeletedAssistanceIds((prev) => {
      const next = prev.filter((id) => !id.startsWith('ast_17_'));
      localStorage.setItem('multilinea_deleted_assistance_ids', JSON.stringify(next));
      return next;
    });

    return INITIAL_ASSISTANCE_ORDERS.length;
  };

  const handleBulkImportAssistanceOrders = async (
    items: Omit<AssistanceOrder, 'id' | 'ownerId' | 'createdAt' | 'updatedAt'>[]
  ): Promise<number> => {
    if (!user || items.length === 0) return 0;
    const batch = writeBatch(db);
    const newItems: AssistanceOrder[] = [];

    items.forEach((item, index) => {
      const id = `ast_${Date.now()}_${index}_${Math.random().toString(36).slice(2, 6)}`;
      const ref = doc(db, 'assistance_orders', id);
      const data = {
        ...item,
        notes: item.notes || '',
        invoiceNotes: item.invoiceNotes || '',
        deliveredQuantity: item.deliveredQuantity ?? 0,
        status: item.status || 'PENDENTE',
        ownerId: user.uid,
        createdAt: serverTimestamp(),
      };
      batch.set(ref, data);
      newItems.push({
        ...item,
        id,
        ownerId: user.uid,
      });
    });

    setAssistanceOrders((prev) => [...prev, ...newItems]);
    try {
      await batch.commit();
      return items.length;
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'assistance_orders/batch_import');
      return items.length;
    }
  };

  if (!authReady) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#061024] px-4">
        <p className="text-sm font-medium text-blue-200">
          Inicializando conexão segura com o banco de dados...
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900 selection:bg-amber-500 selection:text-black">
      {/* Strict 3-Zone Top Bar Contract */}
      <header className="flex items-center justify-between px-3 sm:px-6 py-2.5 bg-[#091428] text-white border-b border-slate-800 sticky top-0 z-30 shadow-xs">
        {/* Zone 1: Brand Title + Official Logo */}
        <div className="flex items-center gap-3">
          <a
            href="#top"
            onClick={(e) => {
              e.preventDefault();
              setActiveTab('DASHBOARD');
            }}
            className="whitespace-nowrap transition-opacity hover:opacity-95"
          >
            <MultilineaLogo size="md" showMesBadge={true} />
          </a>

          {user && (
            <div className="hidden xl:flex items-center gap-2 pl-3 border-l border-slate-800 text-[11px] text-slate-300 font-mono">
              <span className="font-bold text-amber-400">PCP & MES</span>
              <span className="text-slate-600">·</span>
              <span className="text-slate-300 font-bold">4 Linhas</span>
              <span className="text-slate-600">·</span>
              <span className="text-slate-300 font-semibold">{effectiveMachines.length} Máquinas</span>
            </div>
          )}

          {/* Mobile Current Section Chip */}
          {user && (
            <span className="md:hidden inline-flex items-center px-2 py-0.5 rounded-md bg-slate-800 text-[10px] font-bold text-amber-400 font-mono">
              {activeTab === 'DASHBOARD'
                ? 'Dashboard'
                : activeTab === 'PMP'
                ? 'Plano Mestre'
                : activeTab === 'ASSISTENCIA'
                ? 'Assistência'
                : activeTab === 'TERMINAL'
                ? 'Apontamento'
                : activeTab === 'RELATORIO_CORTE'
                ? 'Entrega Corte'
                : 'Cadastros'}
            </span>
          )}
        </div>

        {/* Zone 2: Navigation Links for Tablet & Desktop */}
        {user && (
          <nav className="hidden md:flex items-center gap-1 text-xs lg:text-sm font-medium bg-slate-900/60 p-1 rounded-xl border border-slate-800">
            <button
              type="button"
              onClick={() => setActiveTab('DASHBOARD')}
              className={`px-3.5 py-1.5 rounded-lg transition-all whitespace-nowrap cursor-pointer flex items-center gap-1.5 text-xs font-bold ${
                activeTab === 'DASHBOARD'
                  ? 'bg-slate-800 text-amber-400 shadow-xs'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
              }`}
            >
              <LayoutDashboard className="w-4 h-4 text-amber-400" />
              <span>Dashboard Diário</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('PMP')}
              className={`px-3.5 py-1.5 rounded-lg transition-all whitespace-nowrap cursor-pointer flex items-center gap-1.5 text-xs font-bold ${
                activeTab === 'PMP'
                  ? 'bg-slate-800 text-amber-400 shadow-xs'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
              }`}
            >
              <Layers className="w-4 h-4 text-amber-400" />
              <span>Plano Mestre (PMP)</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('ASSISTENCIA')}
              className={`px-3.5 py-1.5 rounded-lg transition-all whitespace-nowrap cursor-pointer flex items-center gap-1.5 text-xs font-bold ${
                activeTab === 'ASSISTENCIA'
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-xs'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
              }`}
            >
              <Wrench className="w-4 h-4 text-amber-400" />
              <span>Assistência Técnica</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('RELATORIO_CORTE')}
              className={`px-3.5 py-1.5 rounded-lg transition-all whitespace-nowrap cursor-pointer flex items-center gap-1.5 text-xs font-bold ${
                activeTab === 'RELATORIO_CORTE'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
              }`}
            >
              <BarChart3 className="w-4 h-4 text-amber-400" />
              <span>Entrega do Corte</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('TERMINAL')}
              className={`px-3.5 py-1.5 rounded-lg transition-all whitespace-nowrap cursor-pointer flex items-center gap-1.5 text-xs font-bold ${
                activeTab === 'TERMINAL'
                  ? 'bg-slate-800 text-amber-400 shadow-xs'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
              }`}
            >
              <Laptop className="w-4 h-4 text-amber-400" />
              <span>Terminal de Máquina</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('GESTAO')}
              className={`px-3.5 py-1.5 rounded-lg transition-all whitespace-nowrap cursor-pointer flex items-center gap-1.5 text-xs font-bold ${
                activeTab === 'GESTAO'
                  ? 'bg-slate-800 text-amber-400 shadow-xs'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
              }`}
            >
              <Database className="w-4 h-4 text-amber-400" />
              <span>Cadastros & Metas</span>
            </button>
          </nav>
        )}

        {/* Zone 3: 1-2 Primary Actions */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setIsPresentationOpen(true)}
            className="px-2.5 sm:px-3.5 py-1.5 sm:py-2 text-xs font-bold text-amber-300 hover:text-white bg-slate-800 hover:bg-slate-700 border border-amber-500/40 hover:border-amber-400 rounded-lg transition-all whitespace-nowrap flex items-center gap-1.5 cursor-pointer shadow-xs"
            title="Abrir Apresentação Oficial do Sistema com Áudio e Ilustrações de Ferramentas"
          >
            <Presentation className="w-3.5 h-3.5 text-amber-400" />
            <span className="hidden sm:inline">Apresentação Fábrica</span>
          </button>

          {user ? (
            <button
              type="button"
              onClick={handleSignOut}
              className="px-2.5 sm:px-3.5 py-1.5 sm:py-2 text-xs font-semibold text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg transition-colors whitespace-nowrap flex items-center gap-1.5 cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Sair</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={handleGoogleSignIn}
              className="px-3 sm:px-4 py-1.5 sm:py-2 text-xs font-bold text-slate-950 bg-amber-400 hover:bg-amber-300 rounded-lg transition-colors whitespace-nowrap flex items-center gap-1.5 cursor-pointer shadow-xs"
            >
              <LogIn className="w-3.5 h-3.5" />
              Conectar Fábrica
            </button>
          )}
        </div>
      </header>

      {/* Main Content Area — with bottom padding on mobile for thumb navigation bar */}
      <main className="flex-1 pb-24 md:pb-8">
        {!user ? (
          <div className="max-w-3xl mx-auto py-16 px-4 sm:px-6">
            <div className="bg-[#091428] text-white border border-slate-800 rounded-2xl p-8 sm:p-10 space-y-6 shadow-sm">
              <div className="pb-4 border-b border-slate-800 flex items-center justify-between gap-4">
                <MultilineaLogo size="lg" showMesBadge={true} />
              </div>
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-amber-400">
                  Controle Industrial Multilinea · 4 Linhas & 10 Máquinas
                </p>
                <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white mt-1">
                  Controle de Produção por Linha, Máquina e Unidade de Medida
                </h1>
                <p className="text-sm text-slate-300 mt-2 leading-relaxed">
                  Acompanhe o previsto x realizado no dia respeitando a
                  medida real de cada processo: <strong className="text-white">Corte em m² cortado</strong> (Giben e Selco),{' '}
                  <strong className="text-white">Coladeiras em metros lineares colados</strong> (Maclinea Dupla, Esquadra
                  Biesse e Homag Unilateral), <strong className="text-white">Furadeiras em peças furadas</strong> (Techno
                  Logic, Techno 7, Lidear F-400 e Morbidelli) e{' '}
                  <strong className="text-white">Pintura em m² pintado</strong> (Linha de UV).
                </p>
              </div>

              {authError && (
                <div className="p-4 bg-red-950/80 border border-red-500/60 rounded-lg flex items-center gap-2.5 text-xs text-red-200">
                  <ShieldAlert className="w-4 h-4 text-red-400 shrink-0" />
                  <span>{authError}</span>
                </div>
              )}

              <div className="pt-2 flex flex-col sm:flex-row items-center gap-3">
                <button
                  type="button"
                  onClick={handleGoogleSignIn}
                  className="w-full sm:w-auto px-6 py-3.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-sm rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer shadow-sm"
                >
                  <LogIn className="w-4 h-4" />
                  Entrar com Conta Google da Fábrica
                </button>

                <button
                  type="button"
                  onClick={() => setIsPresentationOpen(true)}
                  className="w-full sm:w-auto px-5 py-3.5 bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white border border-slate-700 font-bold text-sm rounded-xl transition-colors flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Presentation className="w-4 h-4 text-amber-400" />
                  Apresentação para a Fábrica (Slides & Áudio)
                </button>
              </div>
            </div>
          </div>
        ) : loadingData || seeding ? (
          <div className="max-w-7xl mx-auto py-12 px-4 sm:px-6 space-y-4">
            <div className="h-8 w-64 bg-slate-200 rounded animate-pulse" />
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
              <div className="h-28 bg-slate-200 rounded-xl animate-pulse" />
              <div className="h-28 bg-slate-200 rounded-xl animate-pulse" />
              <div className="h-28 bg-slate-200 rounded-xl animate-pulse" />
              <div className="h-28 bg-slate-200 rounded-xl animate-pulse" />
            </div>
          </div>
        ) : (
          <>
            {activeTab === 'TERMINAL' && (
              <MachineTerminal
                machines={effectiveMachines}
                catalogParts={effectiveCatalogParts}
                inefficiencyReasons={effectiveInefficiencyReasons}
                logs={effectiveLogs}
                downtimeLogs={effectiveDowntimeLogs}
                productionOrders={effectiveProductionOrders}
                activeMachine={activeMachine}
                onLoginMachine={handleLoginMachine}
                onLogoutMachine={handleLogoutMachine}
                onUpdateMachineJob={handleUpdateMachineJob}
                onRecordDelivery={handleRecordDelivery}
                onRecordDowntime={handleRecordDowntime}
                onNavigateToCatalog={() => setActiveTab('GESTAO')}
              />
            )}

            {activeTab === 'PMP' && (
              <MasterProductionPlan
                orders={effectiveProductionOrders}
                catalogParts={effectiveCatalogParts}
                logs={effectiveLogs}
                onCreateOrder={handleCreateProductionOrder}
                onUpdateOrder={handleUpdateProductionOrder}
                onDeleteOrder={handleDeleteProductionOrder}
                onClearAllOrders={handleClearAllProductionOrders}
                onRestoreDefaultOrders={handleRestoreDefaultOrders}
                onDeleteEncomenda={handleDeleteEncomenda}
                onBulkImportOrders={handleBulkImportOrders}
                onQuickCreatePart={handleCreateCatalogPart}
              />
            )}

            {activeTab === 'DASHBOARD' && (
              <FactoryDashboard
                machines={effectiveMachines}
                catalogParts={effectiveCatalogParts}
                productionOrders={effectiveProductionOrders}
                factorySettings={factorySettings}
                logs={effectiveLogs}
                downtimeLogs={effectiveDowntimeLogs}
                onSelectMachineForTerminal={(m) => handleLoginMachine(m)}
                onNavigateToSettings={() => setActiveTab('GESTAO')}
                onDeleteLog={handleDeleteLog}
                onDeleteDowntimeLog={handleDeleteDowntimeLog}
                onClearAllLogs={handleClearAllLogs}
                onPurgeFictitiousLogs={handlePurgeFictitiousLogs}
                onOpenCorteReport={() => setActiveTab('RELATORIO_CORTE')}
              />
            )}

            {activeTab === 'RELATORIO_CORTE' && (
              <CorteDeliveryReport
                logs={effectiveLogs}
                catalogParts={effectiveCatalogParts}
                factorySettings={factorySettings}
                productionOrders={effectiveProductionOrders}
                machines={effectiveMachines}
                onBackToDashboard={() => setActiveTab('DASHBOARD')}
              />
            )}

            {activeTab === 'ASSISTENCIA' && (
              <AssistancePlanManager
                assistanceOrders={effectiveAssistanceOrders}
                catalogParts={effectiveCatalogParts}
                onCreateAssistanceOrder={handleCreateAssistanceOrder}
                onUpdateAssistanceOrder={handleUpdateAssistanceOrder}
                onDeleteAssistanceOrder={handleDeleteAssistanceOrder}
                onBulkImportAssistanceOrders={handleBulkImportAssistanceOrders}
                onClearAllAssistanceOrders={handleClearAllAssistanceOrders}
                onRestoreDefaultAssistanceOrders={handleRestoreDefaultAssistanceOrders}
              />
            )}

            {activeTab === 'GESTAO' && (
              <MachineAndCatalogManager
                machines={effectiveMachines}
                catalogParts={effectiveCatalogParts}
                inefficiencyReasons={effectiveInefficiencyReasons}
                factorySettings={factorySettings}
                productionOrders={effectiveProductionOrders}
                onSaveFactorySettings={handleSaveFactorySettings}
                onCreateMachine={handleCreateMachine}
                onDeleteMachine={handleDeleteMachine}
                onResetMachinesToFactoryDefault={handleResetMachinesToFactoryDefault}
                onCreateCatalogPart={handleCreateCatalogPart}
                onBatchCreateCatalogParts={handleBatchCreateCatalogParts}
                onUpdateCatalogPart={handleUpdateCatalogPart}
                onDeleteCatalogPart={handleDeleteCatalogPart}
                onClearAllCatalogParts={handleClearAllCatalogParts}
                onRestoreDefaultCatalogParts={handleRestoreDefaultCatalogParts}
                onCreateInefficiencyReason={handleCreateInefficiencyReason}
                onDeleteInefficiencyReason={handleDeleteInefficiencyReason}
                onOpenPresentation={() => setIsPresentationOpen(true)}
              />
            )}
          </>
        )}
      </main>

      {/* Persistent Mobile Bottom Navigation Bar (Thumb-accessible for Celular / Tablet) */}
      {user && (
        <nav
          aria-label="Navegação Principal Mobile"
          className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-[#091428]/95 backdrop-blur-md border-t border-slate-800 px-2 py-1.5 flex items-center justify-around shadow-lg safe-area-bottom overflow-x-auto"
        >
          <button
            type="button"
            onClick={() => setActiveTab('DASHBOARD')}
            className={`flex-1 py-1.5 px-1 flex flex-col items-center justify-center rounded-xl transition-all cursor-pointer min-h-[48px] ${
              activeTab === 'DASHBOARD'
                ? 'text-amber-400 font-bold bg-slate-800/80'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <LayoutDashboard className="w-5 h-5" />
            <span className="text-[11px] mt-1 font-medium tracking-tight leading-none">Dashboard</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('PMP')}
            className={`flex-1 py-1.5 px-1 flex flex-col items-center justify-center rounded-xl transition-all cursor-pointer min-h-[48px] ${
              activeTab === 'PMP'
                ? 'text-amber-400 font-bold bg-slate-800/80'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Layers className="w-5 h-5" />
            <span className="text-[11px] mt-1 font-medium tracking-tight leading-none">PMP</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('ASSISTENCIA')}
            className={`flex-1 py-1.5 px-1 flex flex-col items-center justify-center rounded-xl transition-all cursor-pointer min-h-[48px] ${
              activeTab === 'ASSISTENCIA'
                ? 'text-amber-400 font-bold bg-slate-800/80'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Wrench className="w-5 h-5" />
            <span className="text-[11px] mt-1 font-medium tracking-tight leading-none">Assist.</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('RELATORIO_CORTE')}
            className={`flex-1 py-1.5 px-1 flex flex-col items-center justify-center rounded-xl transition-all cursor-pointer min-h-[48px] ${
              activeTab === 'RELATORIO_CORTE'
                ? 'text-amber-400 font-bold bg-slate-800/80'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <BarChart3 className="w-5 h-5" />
            <span className="text-[11px] mt-1 font-medium tracking-tight leading-none">Corte</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('TERMINAL')}
            className={`flex-1 py-1.5 px-1 flex flex-col items-center justify-center rounded-xl transition-all cursor-pointer min-h-[48px] ${
              activeTab === 'TERMINAL'
                ? 'text-amber-400 font-bold bg-slate-800/80'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Laptop className="w-5 h-5" />
            <span className="text-[11px] mt-1 font-medium tracking-tight leading-none">Apontamento</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('GESTAO')}
            className={`flex-1 py-1.5 px-1 flex flex-col items-center justify-center rounded-xl transition-all cursor-pointer min-h-[48px] ${
              activeTab === 'GESTAO'
                ? 'text-amber-400 font-bold bg-slate-800/80'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Database className="w-5 h-5" />
            <span className="text-[11px] mt-1 font-medium tracking-tight leading-none">Cadastros</span>
          </button>
        </nav>
      )}

      {/* Official Factory Slide Presentation Modal with Audio Narration & Tool Anatomy */}
      <FactoryPresentationModal
        isOpen={isPresentationOpen}
        onClose={() => setIsPresentationOpen(false)}
      />
    </div>
  );
}
