import React, { useState, useMemo, useEffect } from 'react';
import {
  Machine,
  CatalogPart,
  FactorySettings,
  ProductionLog,
  DowntimeLog,
  INEFFICIENCY_CATEGORIES,
  SECTORS,
  SECTOR_LIST,
  SectorId,
  SHIFTS,
  ShiftId,
  ProductionOrder,
  isFundoPiece,
} from '../types';
import {
  Split,
  Search,
  Download,
  Trash2,
  Terminal,
  Settings,
  RotateCcw,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Tv,
  Play,
  Pause,
  X,
  Maximize2,
  Calendar,
  TrendingUp,
  BarChart3,
  Layers,
  Activity,
  Sun,
  Moon,
  Sparkles,
  RefreshCw,
  Gauge,
  Zap,
  LayoutGrid,
  List,
  SlidersHorizontal,
  Folder,
  FolderOpen,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import { SemicircleGaugeCard } from './SemicircleGaugeCard';
import { CorteDailyHeroCard } from './CorteDailyHeroCard';

interface FactoryDashboardProps {
  machines: Machine[];
  catalogParts: CatalogPart[];
  productionOrders?: ProductionOrder[];
  factorySettings: FactorySettings | null;
  logs: ProductionLog[];
  downtimeLogs: DowntimeLog[];
  onSelectMachineForTerminal: (machine: Machine) => void;
  onNavigateToSettings: () => void;
  onDeleteLog: (logId: string) => Promise<void>;
  onDeleteDowntimeLog: (downtimeId: string) => Promise<void>;
  onClearAllLogs: (onlyToday: boolean) => Promise<number>;
  onPurgeFictitiousLogs?: () => Promise<number>;
  onOpenCorteReport?: () => void;
}

export const FactoryDashboard: React.FC<FactoryDashboardProps> = ({
  machines,
  catalogParts,
  productionOrders = [],
  factorySettings,
  logs,
  downtimeLogs,
  onSelectMachineForTerminal,
  onNavigateToSettings,
  onDeleteLog,
  onDeleteDowntimeLog,
  onClearAllLogs,
  onPurgeFictitiousLogs,
  onOpenCorteReport,
}) => {
  const [sectorFilter, setSectorFilter] = useState<SectorId | 'ALL'>('ALL');
  const [selectedGaugeSector, setSelectedGaugeSector] = useState<SectorId | 'ALL'>('SECCIONADORA');
  // Sub-dashboard do Corte: 'ALL' (Consolidado), 'MDF' (Corte MDF), 'FUNDO' (Corte de Fundo), 'SPLIT_BOTH' (2 Dashboards Lado a Lado)
  const [corteViewMode, setCorteViewMode] = useState<'ALL' | 'MDF' | 'FUNDO' | 'SPLIT_BOTH'>('SPLIT_BOTH');
  const [corteSubFilter, setCorteSubFilter] = useState<'ALL' | 'MDF' | 'FUNDO'>('ALL');
  const [batchSearch, setBatchSearch] = useState('');
  const [historyTab, setHistoryTab] = useState<'PRODUCAO' | 'PARADAS'>('PRODUCAO');
  const [downtimePeriod, setDowntimePeriod] = useState<'TODAY' | 'MONTH' | 'ALL'>('ALL');
  const [selectedDowntimeSector, setSelectedDowntimeSector] = useState<SectorId | 'ALL'>('ALL');

  // Pastas Diárias do Histórico (agrupamento por dia para reduzir informações expostas)
  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({});
  const [expandedDowntimeFolders, setExpandedDowntimeFolders] = useState<Record<string, boolean>>({});

  // Presentation Mode (Modo Apresentação / TV) State
  const [isPresentationMode, setIsPresentationMode] = useState(false);
  const [presentationAutoRotate, setPresentationAutoRotate] = useState(true);
  const [presentationIntervalSec, setPresentationIntervalSec] = useState<number>(15);
  const [presentationViewMode, setPresentationViewMode] = useState<'SINGLE' | 'CORTE_SPLIT' | 'GRID_4'>('SINGLE');
  const [presentationHeaderVisible, setPresentationHeaderVisible] = useState(true);

  const sectorOrder: SectorId[] = ['SECCIONADORA', 'COLADEIRA', 'FURADEIRA', 'LINHA_UV'];

  // Auto-rotate sectors in Presentation Mode when in SINGLE view and autoRotate is enabled
  useEffect(() => {
    if (!isPresentationMode || !presentationAutoRotate || presentationViewMode !== 'SINGLE') {
      return;
    }
    const timer = setInterval(() => {
      setSelectedGaugeSector((prev) => {
        const currentIdx = sectorOrder.indexOf(prev as SectorId);
        const nextIdx = currentIdx === -1 ? 0 : (currentIdx + 1) % sectorOrder.length;
        return sectorOrder[nextIdx];
      });
    }, presentationIntervalSec * 1000);
    return () => clearInterval(timer);
  }, [isPresentationMode, presentationAutoRotate, presentationIntervalSec, presentationViewMode]);

  // Lock background scroll when in Presentation Mode
  useEffect(() => {
    if (!isPresentationMode) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [isPresentationMode]);

  // Listen for ESC key to exit presentation mode
  useEffect(() => {
    if (!isPresentationMode) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsPresentationMode(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isPresentationMode]);

  const handleEnterPresentationMode = async (forcedMode?: 'SINGLE' | 'CORTE_SPLIT' | 'GRID_4' | React.MouseEvent) => {
    const validMode = typeof forcedMode === 'string' ? forcedMode : undefined;
    if (validMode) {
      setPresentationViewMode(validMode);
      if (validMode === 'CORTE_SPLIT') {
        setSelectedGaugeSector('SECCIONADORA');
        setCorteViewMode('SPLIT_BOTH');
      }
    } else if (corteViewMode === 'SPLIT_BOTH') {
      setPresentationViewMode('CORTE_SPLIT');
      setSelectedGaugeSector('SECCIONADORA');
    } else if (selectedGaugeSector === 'ALL') {
      setPresentationViewMode('GRID_4');
      setSelectedGaugeSector('SECCIONADORA');
    } else {
      setPresentationViewMode('SINGLE');
    }
    setIsPresentationMode(true);
    try {
      if (document.documentElement.requestFullscreen && !document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
      }
    } catch {
      // Ignore if iframe blocks native fullscreen; fixed z-50 overlay still covers 100% of viewport
    }
  };

  const handleExitPresentationMode = async () => {
    setIsPresentationMode(false);
    try {
      if (document.fullscreenElement && document.exitFullscreen) {
        await document.exitFullscreen();
      }
    } catch {
      // Ignore
    }
  };

  // State for Reset / Clear Production Logs Confirmation Modal
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [resetScope, setResetScope] = useState<'TODAY' | 'ALL'>('ALL');
  const [resetting, setResetting] = useState(false);
  const [resetSuccessMsg, setResetSuccessMsg] = useState<string | null>(null);

  // Map partCode -> CatalogPart for fast lookup (fallback)
  const catalogByCode = useMemo(() => {
    const map = new Map<string, CatalogPart>();
    catalogParts.forEach((p) => {
      map.set(p.partCode.trim().toUpperCase(), p);
    });
    return map;
  }, [catalogParts]);

  // Composite map: PA_CODE:::PART_CODE for exact product-specific piece specifications
  const catalogByPaAndCode = useMemo(() => {
    const map = new Map<string, CatalogPart>();
    catalogParts.forEach((p) => {
      const pa = (p.paCode || '').trim().toUpperCase();
      const code = (p.partCode || '').trim().toUpperCase();
      if (pa && code) {
        map.set(`${pa}:::${code}`, p);
      }
    });
    return map;
  }, [catalogParts]);

  // Fast map of orders by batchNumber
  const ordersByBatch = useMemo(() => {
    const map = new Map<string, ProductionOrder>();
    (productionOrders || []).forEach((o) => {
      if (o.batchNumber) {
        map.set(o.batchNumber.trim().toUpperCase(), o);
      }
    });
    return map;
  }, [productionOrders]);

  // Canonical product PA code & product description resolver
  const getLogProductInfo = (log: ProductionLog): { paCode: string; productName: string } => {
    const cleanBatch = (log.batchNumber || '').trim().toUpperCase();
    const cleanPart = (log.partCode || '').trim().toUpperCase();
    const cleanPa = (log.paCode || '').trim().toUpperCase();
    const order = ordersByBatch.get(cleanBatch);
    const catPart =
      (cleanPa ? catalogByPaAndCode.get(`${cleanPa}:::${cleanPart}`) : null) ||
      catalogByCode.get(cleanPart);

    // 1. If order found by batchNumber in PMP, that is the authoritative product
    if (order && order.productCode) {
      return {
        paCode: order.productCode,
        productName: order.productDescription
          ? `${order.productLine} - ${order.productDescription}`
          : order.productDescription,
      };
    }

    // 2. Explicit fix for historical corrupt batch I2603604 (which belongs to 500698)
    if (cleanBatch === 'I2603604') {
      return {
        paCode: '500698',
        productName:
          order?.productDescription
            ? `${order.productLine} - ${order.productDescription}`
            : catPart?.productName || 'RAINHA - BALC. 1PT BASC 1GV NESHER 80CM• ENCAB',
      };
    }

    // 3. If catalog part has paCode and matches log product or log has no product
    if (catPart && catPart.paCode && (!cleanPa || cleanPa === catPart.paCode.toUpperCase())) {
      return {
        paCode: catPart.paCode,
        productName: catPart.productName || log.productName,
      };
    }

    // 4. Fallback: If log has stale paCode 501040 but batch is from Encomenda I26036
    if (log.paCode === '501040' && cleanBatch.startsWith('I26036')) {
      return {
        paCode: '500698',
        productName: 'RAINHA - BALC. 1PT BASC 1GV NESHER 80CM• ENCAB',
      };
    }

    return {
      paCode: log.paCode || catPart?.paCode || 'PA-GERAL',
      productName: log.productName || catPart?.productName || 'Peça da Produção',
    };
  };

  // Helper para identificar se um apontamento de corte é de FUNDO (chapa fina/costa 2,5mm) ou MDF (painel estrutural 9, 15, 18 e 25mm)
  const isLogFundo = (log: ProductionLog): boolean => {
    const cleanPart = (log.partCode || '').trim().toUpperCase();
    const cleanPa = (log.paCode || '').trim().toUpperCase();
    const catPart =
      (cleanPa ? catalogByPaAndCode.get(`${cleanPa}:::${cleanPart}`) : null) ||
      catalogByCode.get(cleanPart);
    return isFundoPiece(log.partName, log.partCode, catPart);
  };

  const nowDate = new Date();
  const todayIso = nowDate.toISOString().slice(0, 10);
  const [selectedDayDate, setSelectedDayDate] = useState<string>(todayIso);
  const [dailyViewMode, setDailyViewMode] = useState<
    'ALL' | 'GAUGES' | 'TURNOS' | 'HORARIO' | 'MAQUINAS' | 'PARADAS'
  >('ALL');
  const [machineViewMode, setMachineViewMode] = useState<'CARDS' | 'TABLE'>('CARDS');
  const [purgingLogs, setPurgingLogs] = useState(false);
  const [simulationMsg, setSimulationMsg] = useState<string | null>(null);

  const todayStr = nowDate.toLocaleDateString('pt-BR');

  const selectedDayStr = useMemo(() => {
    if (!selectedDayDate) return todayStr;
    const parts = selectedDayDate.split('-');
    if (parts.length === 3) {
      return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
    return todayStr;
  }, [selectedDayDate, todayStr]);

  const isSelectedDateToday = selectedDayStr === todayStr;

  const selectedDateObject = useMemo(() => {
    if (!selectedDayDate) return nowDate;
    const [y, m, d] = selectedDayDate.split('-').map(Number);
    return new Date(y, m - 1, d, 12, 0, 0);
  }, [selectedDayDate]);

  const selectedLongDatePt = useMemo(() => {
    return selectedDateObject.toLocaleDateString('pt-BR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  }, [selectedDateObject]);

  const longDatePt = selectedLongDatePt;
  const currentMonth = selectedDateObject.getMonth();
  const currentYear = selectedDateObject.getFullYear();

  const getLogMeasuredAmount = (log: ProductionLog): number => {
    if (log.sector === 'FURADEIRA') {
      return log.quantityGood;
    }

    const cleanPart = (log.partCode || '').trim().toUpperCase();

    // Special case for piece 402943 (770x500 mm): 0.335 m² por PEÇA (300 peças = 100,50 m²)
    if (cleanPart === '402943') {
      if (log.sector === 'COLADEIRA') {
        return Number((log.quantityGood * 2.54).toFixed(2));
      }
      if (log.sector === 'LINHA_UV') {
        return Number((log.quantityGood * 0.67).toFixed(2));
      }
      return Number((log.quantityGood * 0.335).toFixed(2));
    }

    const prodInfo = getLogProductInfo(log);
    const targetPa = (prodInfo.paCode || log.paCode || '').trim().toUpperCase();
    const part =
      (targetPa ? catalogByPaAndCode.get(`${targetPa}:::${cleanPart}`) : null) ||
      catalogByCode.get(cleanPart);

    // If part exists in catalog, catalog piece measurement is the authoritative value (STRICTLY PER PIECE)
    if (part) {
      const pQty = Math.max(1, Math.round(part.piecesPerProduct || 1));
      let cutM2 = part.squareMeters || 0;
      if (pQty > 1 && cutM2 > 0.8) {
        cutM2 = Number((cutM2 / pQty).toFixed(4));
      }

      if (log.sector === 'COLADEIRA') {
        let linM = part.linearMeters || 0;
        if (pQty > 1 && linM > 4.5) linM = Number((linM / pQty).toFixed(3));
        return Number((log.quantityGood * linM).toFixed(2));
      }
      if (log.sector === 'LINHA_UV') {
        const dimNums = (part.dimensions || '').match(/\d+/g);
        const geomM2 =
          dimNums && dimNums.length >= 2
            ? (Number(dimNums[0]) * Number(dimNums[1])) / 1_000_000
            : 0.385;
        let uvUnit =
          typeof part.uvSquareMeters === 'number' && part.uvSquareMeters > 0
            ? part.uvSquareMeters
            : (part.squareMeters && part.squareMeters > 0 ? part.squareMeters : geomM2) * (part.uvFaces ?? 1);
        if (pQty > 1 && uvUnit > 1.5) uvUnit = Number((uvUnit / pQty).toFixed(4));
        return Number((log.quantityGood * uvUnit).toFixed(2));
      }
      // SECCIONADORA (Corte)
      return Number((log.quantityGood * cutM2).toFixed(2));
    }

    // Special case for piece 402999: 770x500 = 0.39 m² (200 pieces = 78.00 m²)
    if (cleanPart === '402999') {
      if (log.sector === 'COLADEIRA') {
        return Number((log.quantityGood * 2.54).toFixed(2));
      }
      if (log.sector === 'LINHA_UV') {
        return Number((log.quantityGood * 0.78).toFixed(2));
      }
      return Number((log.quantityGood * 0.39).toFixed(2));
    }

    // Attempt to extract dimensions from partName (e.g. "770X500" -> 0.385 m² -> 0.39 m²)
    const dimMatch = (log.partName + ' ' + (log.notes || '')).match(
      /(\d{2,4})\s*[xX*×]\s*(\d{2,4})/
    );
    if (dimMatch) {
      const d1 = parseFloat(dimMatch[1]);
      const d2 = parseFloat(dimMatch[2]);
      if (d1 > 0 && d2 > 0) {
        const pieceM2 = (d1 * d2) / 1000000;
        if (log.sector === 'COLADEIRA') {
          const pieceMl = (d1 + 2 * d2) / 1000;
          return Number((log.quantityGood * pieceMl).toFixed(2));
        }
        if (log.sector === 'LINHA_UV') {
          return Number((log.quantityGood * pieceM2 * 2).toFixed(2));
        }
        return Number((log.quantityGood * pieceM2).toFixed(2));
      }
    }

    // If log has measuredAmount AND it's not the erroneous 1:1 piece-to-meter bug:
    if (
      typeof log.measuredAmount === 'number' &&
      log.measuredAmount > 0 &&
      (log.measuredAmount !== log.quantityGood || log.quantityGood <= 1)
    ) {
      return log.measuredAmount;
    }

    // Fallback if measuredAmount was stored and no better info available
    if (typeof log.measuredAmount === 'number' && log.measuredAmount > 0) {
      return log.measuredAmount;
    }

    return log.quantityGood;
  };

  // Compute the 4 Production Lines "Previsto x Realizado" (Daily & Monthly)
  const sectorComparisonCards = useMemo(() => {
    const dCorte = factorySettings?.targetCorteM2 ?? 1800;
    const dCol = factorySettings?.targetColadeiraMl ?? 6500;
    const dFur = factorySettings?.targetFuradeiraPcs ?? 3200;
    const dUv = factorySettings?.targetPinturaUvM2 ?? 1600;

    const targets: Record<
      SectorId,
      { primaryTarget: number; monthlyTarget: number; piecesTarget: number }
    > = {
      SECCIONADORA: {
        primaryTarget: dCorte,
        monthlyTarget: factorySettings?.targetCorteMonthlyM2 ?? dCorte * 22,
        piecesTarget: factorySettings?.targetCortePcs ?? 2400,
      },
      COLADEIRA: {
        primaryTarget: dCol,
        monthlyTarget: factorySettings?.targetColadeiraMonthlyMl ?? dCol * 22,
        piecesTarget: factorySettings?.targetColadeiraPcs ?? 2200,
      },
      FURADEIRA: {
        primaryTarget: dFur,
        monthlyTarget: factorySettings?.targetFuradeiraMonthlyPcs ?? dFur * 22,
        piecesTarget: dFur,
      },
      LINHA_UV: {
        primaryTarget: dUv,
        monthlyTarget: factorySettings?.targetPinturaUvMonthlyM2 ?? dUv * 22,
        piecesTarget: factorySettings?.targetPinturaUvPcs ?? 2100,
      },
    };

    return SECTOR_LIST.map((sec) => {
      const secLogs = logs.filter((l) => l.sector === sec.id);
      const secDowntimes = downtimeLogs.filter((d) => d.sector === sec.id);
      let doneTodayPrimary = 0;
      let doneTodayPieces = 0;
      let doneMonthPrimary = 0;
      let doneAllTimePrimary = 0;
      let downtimeTodayMinutes = 0;

      let mdfDoneTodayPrimary = 0;
      let mdfDoneTodayPieces = 0;
      let mdfDoneMonthPrimary = 0;
      let fundoDoneTodayPrimary = 0;
      let fundoDoneTodayPieces = 0;
      let fundoDoneMonthPrimary = 0;

      secLogs.forEach((l) => {
        const amt = getLogMeasuredAmount(l);
        doneAllTimePrimary += amt;
        const dtObj = l.createdAt ? new Date(l.createdAt.seconds * 1000) : nowDate;
        const logDate = dtObj.toLocaleDateString('pt-BR');
        const isToday = logDate === selectedDayStr;
        const isThisMonth = dtObj.getMonth() === currentMonth && dtObj.getFullYear() === currentYear;

        if (isToday) {
          doneTodayPrimary += amt;
          doneTodayPieces += l.quantityGood;
        }
        if (isThisMonth) {
          doneMonthPrimary += amt;
        }

        if (sec.id === 'SECCIONADORA') {
          const isFnd = isLogFundo(l);
          if (isFnd) {
            if (isToday) {
              fundoDoneTodayPrimary += amt;
              fundoDoneTodayPieces += l.quantityGood;
            }
            if (isThisMonth) {
              fundoDoneMonthPrimary += amt;
            }
          } else {
            if (isToday) {
              mdfDoneTodayPrimary += amt;
              mdfDoneTodayPieces += l.quantityGood;
            }
            if (isThisMonth) {
              mdfDoneMonthPrimary += amt;
            }
          }
        }
      });

      let downtimeMonthMinutes = 0;
      let downtimeAllMinutes = 0;

      secDowntimes.forEach((d) => {
        downtimeAllMinutes += d.durationMinutes;
        const dtObj = d.createdAt ? new Date(d.createdAt.seconds * 1000) : nowDate;
        const logDate = dtObj.toLocaleDateString('pt-BR');
        if (logDate === selectedDayStr) {
          downtimeTodayMinutes += d.durationMinutes;
        }
        if (dtObj.getMonth() === currentMonth && dtObj.getFullYear() === currentYear) {
          downtimeMonthMinutes += d.durationMinutes;
        }
      });

      const targetPrimary = targets[sec.id].primaryTarget;
      const targetMonthly = targets[sec.id].monthlyTarget;
      const targetPieces = targets[sec.id].piecesTarget;
      const pctPrimary =
        targetPrimary > 0
          ? Math.min(999, Math.round((doneTodayPrimary / targetPrimary) * 100))
          : 0;
      const pctMonthly =
        targetMonthly > 0
          ? Math.min(999, Math.round((doneMonthPrimary / targetMonthly) * 100))
          : 0;
      // Negative when below daily target (e.g. 28 - 987 = -959), matching the Packaging Dashboard
      const signedRemainingDaily = doneTodayPrimary - targetPrimary;
      const balancePrimary = Math.max(0, targetPrimary - doneTodayPrimary);

      // Metas e Indicadores dedicados para os 2 Dashboards de Corte: MDF (9, 15, 18 e 25mm) e Fundo (2,5mm / costas)
      const targetCorteMdfPrimary =
        factorySettings?.targetCorteMdfM2 ?? Math.round(targetPrimary * 0.75);
      const targetCorteMdfMonthly =
        factorySettings?.targetCorteMdfMonthlyM2 ?? Math.round(targetMonthly * 0.75);
      const targetCorteMdfPieces =
        factorySettings?.targetCorteMdfPcs ?? Math.round(targetPieces * 0.67);

      const targetCorteFundoPrimary =
        factorySettings?.targetCorteFundoM2 ?? Math.round(targetPrimary * 0.25);
      const targetCorteFundoMonthly =
        factorySettings?.targetCorteFundoMonthlyM2 ?? Math.round(targetMonthly * 0.25);
      const targetCorteFundoPieces =
        factorySettings?.targetCorteFundoPcs ?? Math.round(targetPieces * 0.33);

      const mdfPctPrimary =
        targetCorteMdfPrimary > 0
          ? Math.min(999, Math.round((mdfDoneTodayPrimary / targetCorteMdfPrimary) * 100))
          : 0;
      const mdfPctMonthly =
        targetCorteMdfMonthly > 0
          ? Math.min(999, Math.round((mdfDoneMonthPrimary / targetCorteMdfMonthly) * 100))
          : 0;
      const mdfSignedRemainingDaily = mdfDoneTodayPrimary - targetCorteMdfPrimary;

      const fundoPctPrimary =
        targetCorteFundoPrimary > 0
          ? Math.min(999, Math.round((fundoDoneTodayPrimary / targetCorteFundoPrimary) * 100))
          : 0;
      const fundoPctMonthly =
        targetCorteFundoMonthly > 0
          ? Math.min(999, Math.round((fundoDoneMonthPrimary / targetCorteFundoMonthly) * 100))
          : 0;
      const fundoSignedRemainingDaily = fundoDoneTodayPrimary - targetCorteFundoPrimary;

      const corteSubDashboards =
        sec.id === 'SECCIONADORA'
          ? {
              mdf: {
                id: 'CORTE_MDF' as const,
                label: 'Corte de MDF (9, 15, 18 e 25mm)',
                shortLabel: 'Corte MDF',
                subTitle: 'Painéis Estruturais (9, 15, 18 e 25mm — Laterais, Tampos, Portas, Gavetas)',
                doneTodayPrimary: mdfDoneTodayPrimary,
                doneTodayPieces: mdfDoneTodayPieces,
                doneMonthPrimary: mdfDoneMonthPrimary,
                targetPrimary: targetCorteMdfPrimary,
                targetMonthly: targetCorteMdfMonthly,
                targetPieces: targetCorteMdfPieces,
                pctPrimary: mdfPctPrimary,
                pctMonthly: mdfPctMonthly,
                signedRemainingDaily: mdfSignedRemainingDaily,
                primaryMetricUnit: 'm²',
                primaryMetricShort: 'm²',
                themeColor: 'sky',
              },
              fundo: {
                id: 'CORTE_FUNDO' as const,
                label: 'Corte de Fundo (2,5mm / Costas)',
                shortLabel: 'Corte Fundo',
                subTitle: 'Chapas Finas de 2,5mm (Costas de Armários, Fundos de Módulo e Gaveta)',
                doneTodayPrimary: fundoDoneTodayPrimary,
                doneTodayPieces: fundoDoneTodayPieces,
                doneMonthPrimary: fundoDoneMonthPrimary,
                targetPrimary: targetCorteFundoPrimary,
                targetMonthly: targetCorteFundoMonthly,
                targetPieces: targetCorteFundoPieces,
                pctPrimary: fundoPctPrimary,
                pctMonthly: fundoPctMonthly,
                signedRemainingDaily: fundoSignedRemainingDaily,
                primaryMetricUnit: 'm²',
                primaryMetricShort: 'm²',
                themeColor: 'amber',
              },
            }
          : null;

      const sectorMachines = machines.filter((m) => m.sector === sec.id);

      // Compute downtime per machine inside this sector
      const machinesDowntimeToday = sectorMachines.map((m) => {
        const mDownToday = secDowntimes
          .filter((d) => {
            if (d.machineId !== m.id) return false;
            const dStr = d.createdAt
              ? new Date(d.createdAt.seconds * 1000).toLocaleDateString('pt-BR')
              : todayStr;
            return dStr === selectedDayStr;
          })
          .reduce((acc, d) => acc + d.durationMinutes, 0);
        return {
          id: m.id,
          name: m.name,
          status: m.status,
          downtimeTodayMin: mDownToday,
        };
      });

      return {
        ...sec,
        doneTodayPrimary,
        doneTodayPieces,
        doneMonthPrimary,
        doneAllTimePrimary,
        downtimeTodayMinutes,
        downtimeMonthMinutes,
        downtimeAllMinutes,
        downtimeOccurrencesCount: secDowntimes.length,
        machinesDowntimeToday,
        targetPrimary,
        targetMonthly,
        targetPieces,
        pctPrimary,
        pctMonthly,
        signedRemainingDaily,
        balancePrimary,
        machinesCount: sectorMachines.length,
        corteSubDashboards,
      };
    });
  }, [
    logs,
    downtimeLogs,
    machines,
    catalogByCode,
    catalogByPaAndCode,
    factorySettings,
    selectedDayStr,
    todayStr,
    currentMonth,
    currentYear,
  ]);

  // Executive Daily Totals for selectedDayStr across the entire factory
  const dailyFactoryTotals = useMemo(() => {
    let totalPieces = 0;
    let totalScrap = 0;
    let totalCorteM2 = 0;
    let totalCorteMdfM2 = 0;
    let totalCorteFundoM2 = 0;
    let totalCortePieces = 0;
    let totalCorteMdfPieces = 0;
    let totalCorteFundoPieces = 0;
    let totalColadeiraMl = 0;
    let totalFuradeiraPcs = 0;
    let totalPinturaM2 = 0;
    let totalDowntimeMin = 0;
    let downtimeEventsCount = 0;

    logs.forEach((l) => {
      const dtObj = l.createdAt ? new Date(l.createdAt.seconds * 1000) : null;
      const logDate = dtObj ? dtObj.toLocaleDateString('pt-BR') : todayStr;
      if (logDate === selectedDayStr) {
        totalPieces += l.quantityGood;
        totalScrap += l.quantityScrap;
        const amt = getLogMeasuredAmount(l);
        if (l.sector === 'SECCIONADORA') {
          totalCorteM2 += amt;
          totalCortePieces += l.quantityGood;
          if (isLogFundo(l)) {
            totalCorteFundoM2 += amt;
            totalCorteFundoPieces += l.quantityGood;
          } else {
            totalCorteMdfM2 += amt;
            totalCorteMdfPieces += l.quantityGood;
          }
        } else if (l.sector === 'COLADEIRA') totalColadeiraMl += amt;
        else if (l.sector === 'FURADEIRA') totalFuradeiraPcs += l.quantityGood;
        else if (l.sector === 'LINHA_UV') totalPinturaM2 += amt;
      }
    });

    downtimeLogs.forEach((d) => {
      const dtObj = d.createdAt ? new Date(d.createdAt.seconds * 1000) : null;
      const logDate = dtObj ? dtObj.toLocaleDateString('pt-BR') : todayStr;
      if (logDate === selectedDayStr) {
        totalDowntimeMin += d.durationMinutes;
        downtimeEventsCount += 1;
      }
    });

    const targetCorte = factorySettings?.targetCorteM2 ?? 1800;
    const targetCorteMdf = factorySettings?.targetCorteMdfM2 ?? Math.round(targetCorte * 0.75);
    const targetCorteFundo = factorySettings?.targetCorteFundoM2 ?? Math.round(targetCorte * 0.25);
    const targetColadeira = factorySettings?.targetColadeiraMl ?? 6500;
    const targetFuradeira = factorySettings?.targetFuradeiraPcs ?? 3200;
    const targetPintura = factorySettings?.targetPinturaUvM2 ?? 1600;

    const pctCorte = targetCorte > 0 ? Math.min(999, Math.round((totalCorteM2 / targetCorte) * 100)) : 0;
    const pctCorteMdf = targetCorteMdf > 0 ? Math.min(999, Math.round((totalCorteMdfM2 / targetCorteMdf) * 100)) : 0;
    const pctCorteFundo = targetCorteFundo > 0 ? Math.min(999, Math.round((totalCorteFundoM2 / targetCorteFundo) * 100)) : 0;
    const pctColadeira = targetColadeira > 0 ? Math.min(999, Math.round((totalColadeiraMl / targetColadeira) * 100)) : 0;
    const pctFuradeira = targetFuradeira > 0 ? Math.min(999, Math.round((totalFuradeiraPcs / targetFuradeira) * 100)) : 0;
    const pctPintura = targetPintura > 0 ? Math.min(999, Math.round((totalPinturaM2 / targetPintura) * 100)) : 0;

    const averagePct = Math.round((pctCorte + pctColadeira + pctFuradeira + pctPintura) / 4);
    const operatingCount = machines.filter((m) => m.status === 'OPERANDO').length;

    return {
      totalPieces,
      totalScrap,
      totalCorteM2,
      totalCorteMdfM2,
      totalCorteFundoM2,
      totalCortePieces,
      totalCorteMdfPieces,
      totalCorteFundoPieces,
      totalColadeiraMl,
      totalFuradeiraPcs,
      totalPinturaM2,
      totalDowntimeMin,
      downtimeEventsCount,
      targetCorte,
      targetCorteMdf,
      targetCorteFundo,
      targetColadeira,
      targetFuradeira,
      targetPintura,
      pctCorte,
      pctCorteMdf,
      pctCorteFundo,
      pctColadeira,
      pctFuradeira,
      pctPintura,
      averagePct,
      operatingCount,
    };
  }, [logs, downtimeLogs, selectedDayStr, todayStr, factorySettings, machines, getLogMeasuredAmount]);

  // Production by Shift on the selected day
  const shiftProduction = useMemo(() => {
    const shifts: Record<
      ShiftId,
      {
        id: ShiftId;
        label: string;
        hours: string;
        pieces: number;
        corteM2: number;
        corteMdfM2: number;
        corteFundoM2: number;
        coladeiraMl: number;
        furadeiraPcs: number;
        uvM2: number;
        downtimeMin: number;
        scrap: number;
        logsCount: number;
      }
    > = {
      TURNO_1: {
        id: 'TURNO_1',
        label: 'Turno 1 — Manhã',
        hours: '05:00 às 13:40',
        pieces: 0,
        corteM2: 0,
        corteMdfM2: 0,
        corteFundoM2: 0,
        coladeiraMl: 0,
        furadeiraPcs: 0,
        uvM2: 0,
        downtimeMin: 0,
        scrap: 0,
        logsCount: 0,
      },
      TURNO_2: {
        id: 'TURNO_2',
        label: 'Turno 2 — Tarde / Noite',
        hours: '13:40 às 22:00',
        pieces: 0,
        corteM2: 0,
        corteMdfM2: 0,
        corteFundoM2: 0,
        coladeiraMl: 0,
        furadeiraPcs: 0,
        uvM2: 0,
        downtimeMin: 0,
        scrap: 0,
        logsCount: 0,
      },
      TURNO_3: {
        id: 'TURNO_3',
        label: 'Turno 3 — Madrugada',
        hours: '22:00 às 05:00',
        pieces: 0,
        corteM2: 0,
        corteMdfM2: 0,
        corteFundoM2: 0,
        coladeiraMl: 0,
        furadeiraPcs: 0,
        uvM2: 0,
        downtimeMin: 0,
        scrap: 0,
        logsCount: 0,
      },
    };

    logs.forEach((l) => {
      const dtObj = l.createdAt ? new Date(l.createdAt.seconds * 1000) : null;
      const logDate = dtObj ? dtObj.toLocaleDateString('pt-BR') : todayStr;
      if (logDate !== selectedDayStr) return;
      const sh = shifts[l.shift] || shifts['TURNO_1'];
      sh.pieces += l.quantityGood;
      sh.scrap += l.quantityScrap;
      sh.logsCount += 1;
      const amt = getLogMeasuredAmount(l);
      if (l.sector === 'SECCIONADORA') {
        sh.corteM2 += amt;
        if (isLogFundo(l)) {
          sh.corteFundoM2 += amt;
        } else {
          sh.corteMdfM2 += amt;
        }
      } else if (l.sector === 'COLADEIRA') sh.coladeiraMl += amt;
      else if (l.sector === 'FURADEIRA') sh.furadeiraPcs += l.quantityGood;
      else if (l.sector === 'LINHA_UV') sh.uvM2 += amt;
    });

    downtimeLogs.forEach((d) => {
      const dtObj = d.createdAt ? new Date(d.createdAt.seconds * 1000) : null;
      const logDate = dtObj ? dtObj.toLocaleDateString('pt-BR') : todayStr;
      if (logDate !== selectedDayStr) return;
      const sh = shifts[d.shift] || shifts['TURNO_1'];
      sh.downtimeMin += d.durationMinutes;
    });

    return Object.values(shifts);
  }, [logs, downtimeLogs, selectedDayStr, todayStr, getLogMeasuredAmount]);

  // Hourly Cadence (Hour by hour 06:00 to 22:00) on selectedDayStr
  const hourlyCadence = useMemo(() => {
    const hourSlots = Array.from({ length: 17 }, (_, i) => i + 6);
    const slots = hourSlots.map((hour) => ({
      hour,
      hourLabel: `${String(hour).padStart(2, '0')}:00`,
      pieces: 0,
      corteM2: 0,
      corteMdfM2: 0,
      corteFundoM2: 0,
      coladeiraMl: 0,
      furadeiraPcs: 0,
      uvM2: 0,
      downtimeMin: 0,
      logsCount: 0,
    }));

    const slotMap = new Map<number, (typeof slots)[0]>();
    slots.forEach((s) => slotMap.set(s.hour, s));

    logs.forEach((l) => {
      const dtObj = l.createdAt ? new Date(l.createdAt.seconds * 1000) : null;
      const logDate = dtObj ? dtObj.toLocaleDateString('pt-BR') : todayStr;
      if (logDate !== selectedDayStr) return;
      if (!dtObj) return;
      const h = dtObj.getHours();
      const slot = slotMap.get(h);
      if (slot) {
        slot.pieces += l.quantityGood;
        slot.logsCount += 1;
        const amt = getLogMeasuredAmount(l);
        if (l.sector === 'SECCIONADORA') {
          slot.corteM2 += amt;
          if (isLogFundo(l)) {
            slot.corteFundoM2 += amt;
          } else {
            slot.corteMdfM2 += amt;
          }
        } else if (l.sector === 'COLADEIRA') slot.coladeiraMl += amt;
        else if (l.sector === 'FURADEIRA') slot.furadeiraPcs += l.quantityGood;
        else if (l.sector === 'LINHA_UV') slot.uvM2 += amt;
      }
    });

    downtimeLogs.forEach((d) => {
      const dtObj = d.createdAt ? new Date(d.createdAt.seconds * 1000) : null;
      const logDate = dtObj ? dtObj.toLocaleDateString('pt-BR') : todayStr;
      if (logDate !== selectedDayStr) return;
      if (!dtObj) return;
      const h = dtObj.getHours();
      const slot = slotMap.get(h);
      if (slot) {
        slot.downtimeMin += d.durationMinutes;
      }
    });

    const maxPieces = Math.max(1, ...slots.map((s) => s.pieces));

    return {
      slots,
      maxPieces,
    };
  }, [logs, downtimeLogs, selectedDayStr, todayStr, getLogMeasuredAmount]);

  const formatMinutesAndHours = (mins: number) => {
    if (mins <= 0) return '0 min';
    if (mins < 60) return `${mins} min`;
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return m > 0 ? `${mins} min (${h}h ${m}m)` : `${mins} min (${h}h)`;
  };

  const getKpiValueSize = (valStr: string) => {
    const len = valStr.length;
    if (len <= 4) return 'text-2xl sm:text-3xl lg:text-4xl';
    if (len <= 6) return 'text-xl sm:text-2xl lg:text-3xl';
    if (len <= 8) return 'text-lg sm:text-xl lg:text-2xl';
    return 'text-base sm:text-lg lg:text-xl';
  };

  const getTvKpiValueSize = (valStr: string) => {
    const len = valStr.length;
    if (len <= 4) return 'text-3xl sm:text-4xl lg:text-5xl';
    if (len <= 6) return 'text-2xl sm:text-3xl lg:text-4xl';
    if (len <= 8) return 'text-xl sm:text-2xl lg:text-3xl';
    return 'text-lg sm:text-xl lg:text-2xl';
  };

  // Pareto Ranking of P1-P22 Inefficiency Stoppages + Sector & Machine Breakdown
  const inefficiencySummary = useMemo(() => {
    const map = new Map<
      string,
      { code: string; name: string; minutes: number; occurrences: number }
    >();
    let totalMinutesAll = 0;
    let totalOccurrences = 0;

    const matchPeriod = (d: DowntimeLog) => {
      if (downtimePeriod === 'ALL') return true;
      const dtObj = d.createdAt ? new Date(d.createdAt.seconds * 1000) : nowDate;
      if (downtimePeriod === 'TODAY') {
        return dtObj.toLocaleDateString('pt-BR') === selectedDayStr;
      }
      return dtObj.getMonth() === currentMonth && dtObj.getFullYear() === currentYear;
    };

    const periodDowntimes = downtimeLogs.filter(matchPeriod);

    periodDowntimes.forEach((d) => {
      if (selectedDowntimeSector !== 'ALL' && d.sector !== selectedDowntimeSector) return;
      totalMinutesAll += d.durationMinutes;
      totalOccurrences += 1;
      const key = d.reasonCode.toUpperCase();
      const prev = map.get(key) || {
        code: d.reasonCode,
        name: d.reasonName,
        minutes: 0,
        occurrences: 0,
      };
      prev.minutes += d.durationMinutes;
      prev.occurrences += 1;
      map.set(key, prev);
    });

    // Breakdown by Sector (always across all 4 sectors for the selected period)
    const totalFactoryPeriodMinutes = periodDowntimes.reduce(
      (acc, d) => acc + d.durationMinutes,
      0
    );

    const bySector = SECTOR_LIST.map((sec) => {
      const sLogs = periodDowntimes.filter((d) => d.sector === sec.id);
      const minutes = sLogs.reduce((acc, d) => acc + d.durationMinutes, 0);
      const occurrences = sLogs.length;

      // Top reason for this sector
      const reasonCounts = new Map<string, { code: string; name: string; min: number }>();
      sLogs.forEach((d) => {
        const k = d.reasonCode.toUpperCase();
        const r = reasonCounts.get(k) || { code: d.reasonCode, name: d.reasonName, min: 0 };
        r.min += d.durationMinutes;
        reasonCounts.set(k, r);
      });
      const topReason = Array.from(reasonCounts.values()).sort((a, b) => b.min - a.min)[0] || null;

      // Machines in this sector with their downtime in the period
      const secMachines = machines
        .filter((m) => m.sector === sec.id)
        .map((m) => {
          const mLogs = sLogs.filter((d) => d.machineId === m.id);
          const mMin = mLogs.reduce((acc, d) => acc + d.durationMinutes, 0);
          const mReasons = new Map<string, { code: string; name: string; min: number }>();
          mLogs.forEach((d) => {
            const k = d.reasonCode.toUpperCase();
            const r = mReasons.get(k) || { code: d.reasonCode, name: d.reasonName, min: 0 };
            r.min += d.durationMinutes;
            mReasons.set(k, r);
          });
          const mTopReason =
            Array.from(mReasons.values()).sort((a, b) => b.min - a.min)[0] || null;

          return {
            machine: m,
            minutes: mMin,
            occurrences: mLogs.length,
            topReason: mTopReason,
          };
        });

      return {
        sector: sec,
        minutes,
        occurrences,
        sharePct:
          totalFactoryPeriodMinutes > 0
            ? Math.round((minutes / totalFactoryPeriodMinutes) * 100)
            : 0,
        topReason,
        machines: secMachines,
      };
    });

    const ranked = Array.from(map.values()).sort((a, b) => b.minutes - a.minutes);
    return {
      ranked,
      totalMinutesAll,
      totalOccurrences,
      totalFactoryPeriodMinutes,
      bySector,
    };
  }, [
    downtimeLogs,
    machines,
    downtimePeriod,
    selectedDowntimeSector,
    todayStr,
    currentMonth,
    currentYear,
  ]);

  // Machine-by-machine performance today across the 4 lines
  const machinePerformanceToday = useMemo(() => {
    return machines.map((m) => {
      const mLogs = logs.filter((l) => l.machineId === m.id);
      const mDown = downtimeLogs.filter((d) => d.machineId === m.id);
      let todayMetric = 0;
      let todayPieces = 0;
      let todayScrap = 0;
      let todayDowntimeMin = 0;
      let monthDowntimeMin = 0;
      let allTimeDowntimeMin = 0;
      let downtimeCountToday = 0;
      const reasonMapToday = new Map<string, { code: string; name: string; min: number }>();

      mLogs.forEach((l) => {
        const logDate = l.createdAt
          ? new Date(l.createdAt.seconds * 1000).toLocaleDateString('pt-BR')
          : todayStr;
        if (logDate === selectedDayStr) {
          todayMetric += getLogMeasuredAmount(l);
          todayPieces += l.quantityGood;
          todayScrap += l.quantityScrap;
        }
      });

      mDown.forEach((d) => {
        allTimeDowntimeMin += d.durationMinutes;
        const dtObj = d.createdAt ? new Date(d.createdAt.seconds * 1000) : nowDate;
        const logDate = dtObj.toLocaleDateString('pt-BR');
        if (logDate === selectedDayStr) {
          todayDowntimeMin += d.durationMinutes;
          downtimeCountToday += 1;
          const k = d.reasonCode.toUpperCase();
          const prev = reasonMapToday.get(k) || {
            code: d.reasonCode,
            name: d.reasonName,
            min: 0,
          };
          prev.min += d.durationMinutes;
          reasonMapToday.set(k, prev);
        }
        if (dtObj.getMonth() === currentMonth && dtObj.getFullYear() === currentYear) {
          monthDowntimeMin += d.durationMinutes;
        }
      });

      const topReasonToday =
        Array.from(reasonMapToday.values()).sort((a, b) => b.min - a.min)[0] || null;

      return {
        machine: m,
        sectorInfo: SECTORS[m.sector],
        todayMetric,
        todayPieces,
        todayScrap,
        todayDowntimeMin,
        monthDowntimeMin,
        allTimeDowntimeMin,
        downtimeCountToday,
        topReasonToday,
      };
    });
  }, [machines, logs, downtimeLogs, selectedDayStr, todayStr, currentMonth, currentYear, catalogByCode]);

  const filteredDowntimes = useMemo(() => {
    return downtimeLogs.filter((dt) => {
      const matchesSector = sectorFilter === 'ALL' || dt.sector === sectorFilter;
      const q = batchSearch.trim().toLowerCase();
      const matchesQuery =
        !q ||
        dt.reasonCode.toLowerCase().includes(q) ||
        dt.reasonName.toLowerCase().includes(q) ||
        dt.machineName.toLowerCase().includes(q) ||
        dt.operatorName.toLowerCase().includes(q);
      return matchesSector && matchesQuery;
    });
  }, [downtimeLogs, sectorFilter, batchSearch]);

  const filteredLogs = useMemo(() => {
    return logs.filter((log) => {
      const matchesSector = sectorFilter === 'ALL' || log.sector === sectorFilter;
      if (!matchesSector) return false;

      // Filtro específico para sub-divisão de Corte (MDF vs Fundo)
      if (log.sector === 'SECCIONADORA' && corteSubFilter !== 'ALL') {
        const isFnd = isLogFundo(log);
        if (corteSubFilter === 'MDF' && isFnd) return false;
        if (corteSubFilter === 'FUNDO' && !isFnd) return false;
      }

      const q = batchSearch.trim().toLowerCase();
      const prodInfo = getLogProductInfo(log);

      const matchesQuery =
        !q ||
        log.batchNumber.toLowerCase().includes(q) ||
        log.partCode.toLowerCase().includes(q) ||
        prodInfo.paCode.toLowerCase().includes(q) ||
        prodInfo.productName.toLowerCase().includes(q) ||
        log.productName.toLowerCase().includes(q) ||
        log.partName.toLowerCase().includes(q) ||
        log.machineName.toLowerCase().includes(q);
      return matchesQuery;
    });
  }, [logs, sectorFilter, corteSubFilter, batchSearch, catalogByCode, catalogByPaAndCode, ordersByBatch]);

  interface DayLogsGroup {
    dateKey: string;
    dateLabel: string;
    dateLongLabel: string;
    isToday: boolean;
    isYesterday: boolean;
    logs: ProductionLog[];
    totalPieces: number;
    totalMdfM2: number;
    totalFundoM2: number;
    totalColadeiraMLin: number;
    totalFuradeiraPieces: number;
    totalPinturaM2: number;
    uniqueMachinesCount: number;
  }

  const groupedLogsByDay = useMemo<DayLogsGroup[]>(() => {
    const groupsMap = new Map<string, DayLogsGroup>();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    filteredLogs.forEach((log) => {
      const dt = log.createdAt ? new Date(log.createdAt.seconds * 1000) : new Date();
      const y = dt.getFullYear();
      const m = String(dt.getMonth() + 1).padStart(2, '0');
      const d = String(dt.getDate()).padStart(2, '0');
      const dateKey = `${y}-${m}-${d}`;

      const dateOnly = new Date(dt);
      dateOnly.setHours(0, 0, 0, 0);
      const isToday = dateOnly.getTime() === today.getTime();
      const isYesterday = dateOnly.getTime() === yesterday.getTime();

      if (!groupsMap.has(dateKey)) {
        const dateLabel = dt.toLocaleDateString('pt-BR');
        const dateLongLabel = dt.toLocaleDateString('pt-BR', {
          weekday: 'long',
          day: '2-digit',
          month: 'long',
          year: 'numeric',
        });

        groupsMap.set(dateKey, {
          dateKey,
          dateLabel,
          dateLongLabel,
          isToday,
          isYesterday,
          logs: [],
          totalPieces: 0,
          totalMdfM2: 0,
          totalFundoM2: 0,
          totalColadeiraMLin: 0,
          totalFuradeiraPieces: 0,
          totalPinturaM2: 0,
          uniqueMachinesCount: 0,
        });
      }

      const group = groupsMap.get(dateKey)!;
      group.logs.push(log);
      group.totalPieces += log.quantityGood || 0;

      const amt = getLogMeasuredAmount(log);
      if (log.sector === 'SECCIONADORA') {
        if (isLogFundo(log)) {
          group.totalFundoM2 += amt;
        } else {
          group.totalMdfM2 += amt;
        }
      } else if (log.sector === 'COLADEIRA') {
        group.totalColadeiraMLin += amt;
      } else if (log.sector === 'FURADEIRA') {
        group.totalFuradeiraPieces += amt;
      } else if (log.sector === 'LINHA_UV') {
        group.totalPinturaM2 += amt;
      }
    });

    const sorted = Array.from(groupsMap.values()).sort((a, b) => b.dateKey.localeCompare(a.dateKey));
    sorted.forEach((g) => {
      const machines = new Set(g.logs.map((l) => l.machineId));
      g.uniqueMachinesCount = machines.size;
    });
    return sorted;
  }, [filteredLogs, catalogByCode, catalogByPaAndCode, ordersByBatch]);

  interface DayDowntimesGroup {
    dateKey: string;
    dateLabel: string;
    dateLongLabel: string;
    isToday: boolean;
    isYesterday: boolean;
    downtimes: DowntimeLog[];
    totalMinutes: number;
    eventsCount: number;
  }

  const groupedDowntimesByDay = useMemo<DayDowntimesGroup[]>(() => {
    const groupsMap = new Map<string, DayDowntimesGroup>();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    filteredDowntimes.forEach((dt) => {
      const d = dt.createdAt ? new Date(dt.createdAt.seconds * 1000) : new Date();
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      const dateKey = `${y}-${m}-${day}`;

      const dateOnly = new Date(d);
      dateOnly.setHours(0, 0, 0, 0);
      const isToday = dateOnly.getTime() === today.getTime();
      const isYesterday = dateOnly.getTime() === yesterday.getTime();

      if (!groupsMap.has(dateKey)) {
        const dateLabel = d.toLocaleDateString('pt-BR');
        const dateLongLabel = d.toLocaleDateString('pt-BR', {
          weekday: 'long',
          day: '2-digit',
          month: 'long',
          year: 'numeric',
        });
        groupsMap.set(dateKey, {
          dateKey,
          dateLabel,
          dateLongLabel,
          isToday,
          isYesterday,
          downtimes: [],
          totalMinutes: 0,
          eventsCount: 0,
        });
      }

      const group = groupsMap.get(dateKey)!;
      group.downtimes.push(dt);
      group.totalMinutes += dt.durationMinutes || 0;
      group.eventsCount += 1;
    });

    return Array.from(groupsMap.values()).sort((a, b) => b.dateKey.localeCompare(a.dateKey));
  }, [filteredDowntimes]);

  const toggleFolder = (dateKey: string, defaultOpen: boolean) => {
    setExpandedFolders((prev) => {
      const current = prev[dateKey] !== undefined ? prev[dateKey] : defaultOpen;
      return { ...prev, [dateKey]: !current };
    });
  };

  const toggleDowntimeFolder = (dateKey: string, defaultOpen: boolean) => {
    setExpandedDowntimeFolders((prev) => {
      const current = prev[dateKey] !== undefined ? prev[dateKey] : defaultOpen;
      return { ...prev, [dateKey]: !current };
    });
  };

  const expandAllFolders = (dateKeys: string[]) => {
    const next: Record<string, boolean> = {};
    dateKeys.forEach((k) => { next[k] = true; });
    if (historyTab === 'PRODUCAO') {
      setExpandedFolders(next);
    } else {
      setExpandedDowntimeFolders(next);
    }
  };

  const collapseAllFolders = (dateKeys: string[]) => {
    const next: Record<string, boolean> = {};
    dateKeys.forEach((k) => { next[k] = false; });
    if (historyTab === 'PRODUCAO') {
      setExpandedFolders(next);
    } else {
      setExpandedDowntimeFolders(next);
    }
  };

  const isFolderOpen = (dateKey: string, index: number): boolean => {
    if (batchSearch.trim().length > 0) return true;
    if (expandedFolders[dateKey] !== undefined) {
      return expandedFolders[dateKey];
    }
    return index === 0;
  };

  const isDowntimeFolderOpen = (dateKey: string, index: number): boolean => {
    if (batchSearch.trim().length > 0) return true;
    if (expandedDowntimeFolders[dateKey] !== undefined) {
      return expandedDowntimeFolders[dateKey];
    }
    return index === 0;
  };

  const handleConfirmReset = async () => {
    setResetting(true);
    try {
      const deletedCount = await onClearAllLogs(resetScope === 'TODAY');
      setShowResetConfirm(false);
      setResetSuccessMsg(
        `Os dados apontados pelos operadores foram zerados com sucesso (${deletedCount} apontamentos removidos).`
      );
      setTimeout(() => setResetSuccessMsg(null), 5000);
    } finally {
      setResetting(false);
    }
  };

  const handleExportCSV = () => {
    const headers = [
      'Data_Hora',
      'Linha_Setor',
      'Maquina',
      'Usuario_Maquina',
      'Codigo_Modulo_PA',
      'Modulo_Produto',
      'Peca',
      'Codigo_Peca',
      'Lote',
      'Qtd_Pecas',
      'Medida_Processada',
      'Unidade_Setor',
      'Qtd_Refugo',
      'Operador',
      'Turno',
    ];

    const rows = filteredLogs.map((l) => {
      const dt = l.createdAt
        ? new Date(l.createdAt.seconds * 1000).toLocaleString('pt-BR')
        : '';
      const sec = SECTORS[l.sector];
      const prodInfo = getLogProductInfo(l);
      const measuredVal = getLogMeasuredAmount(l);

      return [
        dt,
        sec.shortLabel,
        l.machineName,
        l.machineUsername,
        prodInfo.paCode,
        prodInfo.productName,
        l.partName,
        l.partCode,
        l.batchNumber,
        String(l.quantityGood),
        measuredVal.toFixed(2),
        sec.primaryMetricUnit,
        String(l.quantityScrap),
        l.operatorName,
        SHIFTS[l.shift] || l.shift,
      ]
        .map((cell) => `"${String(cell || '').replace(/"/g, '""')}"`)
        .join(';');
    });

    const csvContent = '\uFEFF' + [headers.join(';'), ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `dashboard_producao_multilinea_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <>
      {/* FULLSCREEN PRESENTATION MODE OVERLAY (TV / GESTÃO À VISTA) */}
      {isPresentationMode && (
        <div className="fixed inset-0 top-0 left-0 right-0 bottom-0 w-screen h-screen min-h-dvh z-[9999] m-0 bg-[#f2f2f2] text-slate-900 overflow-hidden flex flex-col justify-between p-1.5 sm:p-2.5">
          {/* Top MULTILINEA Header + TV Controls in a single sleek row */}
          {presentationHeaderVisible && (
            <div className="shrink-0 flex items-center justify-between gap-2 bg-white border border-slate-700/80 rounded-xl px-2.5 sm:px-3 py-1 shadow-2xs mb-1">
              {/* Left: Brand title & Subtitle */}
              <div className="flex items-center gap-2 min-w-0">
                <h1 className="text-sm sm:text-base font-black tracking-wide text-slate-900 uppercase shrink-0">
                  MULTILINEA
                </h1>
                <span className="hidden sm:inline-block text-[10px] font-bold text-amber-800 bg-amber-50 px-2 py-0.5 rounded border border-amber-200 truncate">
                  {presentationViewMode === 'CORTE_SPLIT' ||
                  (presentationViewMode === 'SINGLE' && selectedGaugeSector === 'SECCIONADORA')
                    ? 'Corte MDF & Fundo (Painel Unificado)'
                    : presentationViewMode === 'SINGLE' && selectedGaugeSector !== 'ALL'
                    ? SECTORS[selectedGaugeSector].shortLabel
                    : '4 Linhas'}
                </span>
                <span className="text-[10px] text-slate-500 font-medium hidden md:inline truncate">
                  • {longDatePt}
                </span>
              </div>

              {/* Center: Sector selection pills (Compact single row) */}
              <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-lg shrink-0">
                {sectorComparisonCards.map((sec) => {
                  const active =
                    (presentationViewMode === 'SINGLE' || presentationViewMode === 'CORTE_SPLIT') &&
                    selectedGaugeSector === sec.id;
                  return (
                    <button
                      key={sec.id}
                      type="button"
                      onClick={() => {
                        setPresentationViewMode('SINGLE');
                        setSelectedGaugeSector(sec.id);
                      }}
                      className={`px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-md text-xs font-bold transition-all cursor-pointer ${
                        active
                          ? 'bg-slate-900 text-white shadow-xs'
                          : 'text-slate-700 hover:bg-white'
                      }`}
                    >
                      {sec.id === 'SECCIONADORA' ? 'Corte (MDF + Fundo)' : sec.shortLabel}
                    </button>
                  );
                })}
                <button
                  type="button"
                  onClick={() => setPresentationViewMode('GRID_4')}
                  className={`px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-md text-xs font-bold transition-all cursor-pointer ${
                    presentationViewMode === 'GRID_4'
                      ? 'bg-slate-900 text-white shadow-xs'
                      : 'text-slate-700 hover:bg-white'
                  }`}
                >
                  4 Linhas
                </button>
              </div>

              {/* Right: Controls (Rotation, Fullscreen, Sair) */}
              <div className="flex items-center gap-1.5 shrink-0">
                {presentationViewMode === 'SINGLE' && (
                  <div className="hidden sm:flex items-center gap-1 bg-slate-100 rounded-lg px-1.5 py-0.5 text-xs text-slate-800">
                    <button
                      type="button"
                      onClick={() => setPresentationAutoRotate(!presentationAutoRotate)}
                      className={`px-1.5 py-0.5 rounded text-[11px] font-bold flex items-center gap-1 cursor-pointer ${
                        presentationAutoRotate
                          ? 'bg-emerald-600 text-white'
                          : 'bg-slate-200 text-slate-700'
                      }`}
                    >
                      {presentationAutoRotate ? (
                        <>
                          <Pause className="w-2.5 h-2.5" /> Girando
                        </>
                      ) : (
                        <>
                          <Play className="w-2.5 h-2.5" /> Pausado
                        </>
                      )}
                    </button>
                    <select
                      value={presentationIntervalSec}
                      onChange={(e) => setPresentationIntervalSec(Number(e.target.value))}
                      className="bg-transparent font-bold text-[11px] text-slate-800 focus:outline-none cursor-pointer"
                      title="Tempo de troca entre linhas"
                    >
                      <option value={10}>10s</option>
                      <option value={15}>15s</option>
                      <option value={30}>30s</option>
                      <option value={60}>60s</option>
                    </select>
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => setPresentationHeaderVisible(false)}
                  className="p-1 sm:px-2 sm:py-1 bg-white border border-slate-700/80 hover:bg-slate-100 text-slate-700 text-xs font-semibold rounded-lg cursor-pointer shadow-2xs"
                  title="Ocultar barra de controle para tela limpa"
                >
                  <Maximize2 className="w-3.5 h-3.5" />
                </button>

                <button
                  type="button"
                  onClick={handleExitPresentationMode}
                  className="px-2.5 py-1 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-lg flex items-center gap-1 cursor-pointer shadow-xs"
                  title="Sair do modo TV (Esc)"
                >
                  <X className="w-3.5 h-3.5" />
                  <span>Sair</span>
                </button>
              </div>
            </div>
          )}

          {/* Floating toggle button when header is hidden */}
          {!presentationHeaderVisible && (
            <button
              type="button"
              onClick={() => setPresentationHeaderVisible(true)}
              className="fixed top-2 right-2 z-[10000] p-1.5 bg-white/80 hover:bg-white border border-slate-400 rounded-lg shadow-md text-slate-700 opacity-60 hover:opacity-100 transition-opacity cursor-pointer"
              title="Exibir barra de controle da TV"
            >
              <Maximize2 className="w-4 h-4" />
            </button>
          )}

          {/* Main Presentation Body */}
          {presentationViewMode === 'CORTE_SPLIT' ||
          (presentationViewMode === 'SINGLE' &&
            selectedGaugeSector === 'SECCIONADORA') ? (
            (() => {
              const secCard =
                sectorComparisonCards.find((c) => c.id === 'SECCIONADORA') ||
                sectorComparisonCards[0];
              const mdf = secCard.corteSubDashboards?.mdf;
              const fundo = secCard.corteSubDashboards?.fundo;

              if (!mdf || !fundo) {
                return null;
              }

              const totalDailyM2 = mdf.doneTodayPrimary + fundo.doneTodayPrimary;
              const totalDailyTarget = mdf.targetPrimary + fundo.targetPrimary;
              const totalDailyPieces = mdf.doneTodayPieces + fundo.doneTodayPieces;
              const totalDailyPct = totalDailyTarget > 0 ? Math.round((totalDailyM2 / totalDailyTarget) * 100) : 0;

              const totalMonthlyM2 = mdf.doneMonthPrimary + fundo.doneMonthPrimary;
              const totalMonthlyTarget = mdf.targetMonthly + fundo.targetMonthly;
              const totalMonthlyPct = totalMonthlyTarget > 0 ? Math.round((totalMonthlyM2 / totalMonthlyTarget) * 100) : 0;

              return (
                <div className="flex-1 min-h-0 flex flex-col justify-between gap-1.5 sm:gap-2 w-full overflow-hidden">
                  {/* 1º GRÁFICO PRINCIPAL COM RESULTADOS DO DIA:
                      - ESQUERDA: CORTE DE MDF NO DIA (9, 15, 18 e 25mm)
                      - DIREITA: CORTE DE FUNDO NO DIA (2,5mm)
                      Destaque total e prioritário aos gráficos com máxima altura na TV */}
                  <div className="grid grid-cols-2 gap-2 sm:gap-2.5 flex-1 min-h-0 items-stretch">
                    <CorteDailyHeroCard
                      title="Corte de MDF"
                      materialSpec="9, 15, 18 e 25mm"
                      machineNote="Painéis Estruturais · Giben + Selco"
                      icon="🪵"
                      theme="sky"
                      doneTodayPrimary={mdf.doneTodayPrimary}
                      targetDaily={mdf.targetPrimary}
                      doneTodayPieces={mdf.doneTodayPieces}
                      signedRemainingDaily={mdf.signedRemainingDaily}
                      pctPrimary={mdf.pctPrimary}
                      isTvMode={true}
                    />

                    <CorteDailyHeroCard
                      title="Corte de Fundo"
                      materialSpec="2,5mm / Costas"
                      machineNote="Chapas Finas · Giben + Selco"
                      icon="📦"
                      theme="amber"
                      doneTodayPrimary={fundo.doneTodayPrimary}
                      targetDaily={fundo.targetPrimary}
                      doneTodayPieces={fundo.doneTodayPieces}
                      signedRemainingDaily={fundo.signedRemainingDaily}
                      pctPrimary={fundo.pctPrimary}
                      isTvMode={true}
                    />
                  </div>

                  {/* 2º ACOMPANHAMENTO MENSAL ULTRA DISCRETO E COMPACTO EM LINHA ÚNICA (PRESERVA TODO ESPAÇO PARA OS GRÁFICOS) */}
                  <div className="bg-white/95 border border-slate-200/90 rounded-lg px-2.5 py-1 sm:py-1.5 shrink-0 shadow-2xs flex items-center justify-between gap-2.5 text-xs">
                    <div className="flex items-center gap-1.5 shrink-0 text-slate-500 font-bold uppercase tracking-wider text-[9px] sm:text-[10px]">
                      <Calendar className="w-3 h-3 text-slate-400" />
                      <span className="hidden sm:inline">Acompanhamento Mensal:</span>
                      <span className="sm:hidden">Mês:</span>
                    </div>

                    <div className="flex-1 flex items-center justify-between sm:justify-around gap-2 min-w-0">
                      {/* MDF Mensal */}
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="font-extrabold text-sky-950 text-[10px] sm:text-xs flex items-center gap-1">
                          <span>🪵</span> <span className="hidden md:inline">MDF:</span>
                        </span>
                        <span className="font-mono font-black text-slate-800 text-[10px] sm:text-xs">
                          {mdf.doneMonthPrimary.toLocaleString('pt-BR', { maximumFractionDigits: 0 })} <span className="text-[9px] font-sans text-slate-500">m²</span>
                        </span>
                        <span className="text-slate-400 text-[9px] sm:text-[10px] font-normal hidden lg:inline">
                          / {mdf.targetMonthly.toLocaleString('pt-BR')} m²
                        </span>
                        <span className={`font-mono font-bold text-[9px] sm:text-[10px] px-1 py-0.2 rounded ${
                          mdf.pctMonthly >= 70 ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-sky-50 text-sky-900 border border-sky-200'
                        }`}>
                          {mdf.pctMonthly}%
                        </span>
                        <div className="w-10 sm:w-14 h-1.5 bg-sky-100 rounded-full overflow-hidden hidden sm:block">
                          <div
                            className={`h-full rounded-full transition-all duration-500 ${
                              mdf.pctMonthly >= 70 ? 'bg-emerald-500' : 'bg-sky-500'
                            }`}
                            style={{ width: `${Math.min(100, Math.max(3, mdf.pctMonthly))}%` }}
                          />
                        </div>
                      </div>

                      {/* Fundo Mensal */}
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="font-extrabold text-amber-950 text-[10px] sm:text-xs flex items-center gap-1">
                          <span>📦</span> <span className="hidden md:inline">Fundo:</span>
                        </span>
                        <span className="font-mono font-black text-slate-800 text-[10px] sm:text-xs">
                          {fundo.doneMonthPrimary.toLocaleString('pt-BR', { maximumFractionDigits: 0 })} <span className="text-[9px] font-sans text-slate-500">m²</span>
                        </span>
                        <span className="text-slate-400 text-[9px] sm:text-[10px] font-normal hidden lg:inline">
                          / {fundo.targetMonthly.toLocaleString('pt-BR')} m²
                        </span>
                        <span className={`font-mono font-bold text-[9px] sm:text-[10px] px-1 py-0.2 rounded ${
                          fundo.pctMonthly >= 70 ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-amber-50 text-amber-950 border border-amber-200'
                        }`}>
                          {fundo.pctMonthly}%
                        </span>
                        <div className="w-10 sm:w-14 h-1.5 bg-amber-100 rounded-full overflow-hidden hidden sm:block">
                          <div
                            className={`h-full rounded-full transition-all duration-500 ${
                              fundo.pctMonthly >= 70 ? 'bg-emerald-500' : 'bg-amber-500'
                            }`}
                            style={{ width: `${Math.min(100, Math.max(3, fundo.pctMonthly))}%` }}
                          />
                        </div>
                      </div>

                      {/* Total Consolidado */}
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="font-extrabold text-slate-800 text-[10px] sm:text-xs flex items-center gap-1">
                          <span>📊</span> <span className="hidden md:inline">Total:</span>
                        </span>
                        <span className="font-mono font-black text-slate-900 text-[10px] sm:text-xs">
                          {totalMonthlyM2.toLocaleString('pt-BR', { maximumFractionDigits: 0 })} <span className="text-[9px] font-sans text-slate-500">m²</span>
                        </span>
                        <span className="text-slate-400 text-[9px] sm:text-[10px] font-normal hidden lg:inline">
                          / {totalMonthlyTarget.toLocaleString('pt-BR')} m²
                        </span>
                        <span className={`font-mono font-bold text-[9px] sm:text-[10px] px-1 py-0.2 rounded ${
                          totalMonthlyPct >= 70 ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-slate-100 text-slate-800 border border-slate-200'
                        }`}>
                          {totalMonthlyPct}%
                        </span>
                        <div className="w-10 sm:w-14 h-1.5 bg-slate-200 rounded-full overflow-hidden hidden sm:block">
                          <div
                            className="h-full rounded-full bg-slate-700 transition-all duration-500"
                            style={{ width: `${Math.min(100, Math.max(3, totalMonthlyPct))}%` }}
                          />
                        </div>
                      </div>
                    </div>

                    <span className="text-[9px] text-slate-400 font-semibold capitalize shrink-0 hidden sm:inline">
                      {nowDate.toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' })}
                    </span>
                  </div>
                </div>
              );
            })()
          ) : presentationViewMode === 'SINGLE' ? (
            (() => {
              const activeSecId =
                selectedGaugeSector === 'ALL' ? 'SECCIONADORA' : selectedGaugeSector;
              const baseCard =
                sectorComparisonCards.find((c) => c.id === activeSecId) ||
                sectorComparisonCards[0];

              // Adapt Seccionadora in case user chooses MDF or FUNDO exclusive view in SINGLE mode
              let card = baseCard;
              let titleDaily = 'Acompanhamento Diário';
              let titleMonthly = 'Acompanhamento Mensal';

              if (activeSecId === 'SECCIONADORA' && baseCard.corteSubDashboards) {
                if (corteViewMode === 'MDF') {
                  const m = baseCard.corteSubDashboards.mdf;
                  titleDaily = 'Acompanhamento Diário — MDF (9, 15, 18 e 25mm)';
                  titleMonthly = 'Acompanhamento Mensal — MDF (9, 15, 18 e 25mm)';
                  card = {
                    ...baseCard,
                    label: m.label,
                    shortLabel: m.shortLabel,
                    doneTodayPrimary: m.doneTodayPrimary,
                    targetPrimary: m.targetPrimary,
                    doneMonthPrimary: m.doneMonthPrimary,
                    targetMonthly: m.targetMonthly,
                    pctPrimary: m.pctPrimary,
                    pctMonthly: m.pctMonthly,
                    signedRemainingDaily: m.signedRemainingDaily,
                  };
                } else if (corteViewMode === 'FUNDO') {
                  const f = baseCard.corteSubDashboards.fundo;
                  titleDaily = 'Acompanhamento Diário — Fundo (2,5mm / Costas)';
                  titleMonthly = 'Acompanhamento Mensal — Fundo (2,5mm / Costas)';
                  card = {
                    ...baseCard,
                    label: f.label,
                    shortLabel: f.shortLabel,
                    doneTodayPrimary: f.doneTodayPrimary,
                    targetPrimary: f.targetPrimary,
                    doneMonthPrimary: f.doneMonthPrimary,
                    targetMonthly: f.targetMonthly,
                    pctPrimary: f.pctPrimary,
                    pctMonthly: f.pctMonthly,
                    signedRemainingDaily: f.signedRemainingDaily,
                  };
                }
              }

              const decimals = card.id === 'FURADEIRA' ? 0 : 1;
              const remainingFormatted =
                card.signedRemainingDaily >= 0
                  ? `+${card.signedRemainingDaily.toLocaleString('pt-BR', {
                      minimumFractionDigits: 0,
                      maximumFractionDigits: decimals,
                    })}`
                  : card.signedRemainingDaily.toLocaleString('pt-BR', {
                      minimumFractionDigits: 0,
                      maximumFractionDigits: decimals,
                    });

              return (
                <div className="flex-1 min-h-0 flex flex-col justify-between gap-2.5 w-full overflow-hidden">
                  {/* Top: SOMENTE O ACOMPANHAMENTO DIÁRIO (Gráfico Gigante e Centralizado) */}
                  <div className="flex-[3.5] min-h-0 flex items-center justify-center">
                    <div className="w-full max-w-2xl h-full">
                      <SemicircleGaugeCard
                        title={titleDaily}
                        currentValue={card.doneTodayPrimary}
                        targetValue={card.targetPrimary}
                        unitLabel={card.primaryMetricUnit}
                        decimals={decimals}
                        presentation={true}
                        isMonthly={false}
                      />
                    </div>
                  </div>

                  {/* Parte Baixa do Dashboard: KPIs Diários + Barra de Acompanhamento Mensal */}
                  <div className="space-y-2 shrink-0">
                    {/* Linha 1: KPIs Diários */}
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
                      <div className="bg-slate-50 border border-slate-200 rounded-xl p-2 sm:p-2.5 text-center shadow-xs">
                        <span className="text-[10px] sm:text-xs font-semibold text-slate-500 uppercase block mb-0.5">
                          Meta Diária
                        </span>
                        <span className="text-base sm:text-xl lg:text-2xl font-black text-slate-900 tabular-nums">
                          {card.targetPrimary.toLocaleString('pt-BR')} <span className="text-xs font-normal text-slate-500">{card.primaryMetricShort}</span>
                        </span>
                      </div>

                      <div className="bg-slate-50 border border-slate-200 rounded-xl p-2 sm:p-2.5 text-center shadow-xs">
                        <span className="text-[10px] sm:text-xs font-semibold text-slate-500 uppercase block mb-0.5">
                          Realizado Hoje
                        </span>
                        <span className="text-base sm:text-xl lg:text-2xl font-black text-slate-900 tabular-nums">
                          {card.doneTodayPrimary.toLocaleString('pt-BR', { maximumFractionDigits: decimals })} <span className="text-xs font-normal text-slate-500">{card.primaryMetricShort}</span>
                        </span>
                      </div>

                      <div className="bg-slate-50 border border-slate-200 rounded-xl p-2 sm:p-2.5 text-center shadow-xs">
                        <span className="text-[10px] sm:text-xs font-semibold text-slate-500 uppercase block mb-0.5">
                          Saldo Restante
                        </span>
                        <span className={`text-base sm:text-xl lg:text-2xl font-black tabular-nums ${
                          card.signedRemainingDaily < 0 ? 'text-rose-600' : 'text-emerald-600'
                        }`}>
                          {remainingFormatted} <span className="text-xs font-normal text-slate-400">{card.primaryMetricShort}</span>
                        </span>
                      </div>

                      <div className="bg-slate-50 border border-slate-200 rounded-xl p-2 sm:p-2.5 text-center shadow-xs">
                        <span className="text-[10px] sm:text-xs font-semibold text-slate-500 uppercase block mb-0.5">
                          Ritmo Hoje
                        </span>
                        <span className={`text-base sm:text-xl lg:text-2xl font-black tabular-nums ${
                          card.pctPrimary >= 100 ? 'text-emerald-600' : card.pctPrimary >= 70 ? 'text-blue-600' : 'text-rose-600'
                        }`}>
                          {card.pctPrimary}%
                        </span>
                      </div>
                    </div>

                    {/* Linha 2: Acompanhamento Mensal na Parte Baixa do Dashboard */}
                    <div className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-2">
                      <div className="flex items-center gap-2 shrink-0">
                        <Calendar className="w-4 h-4 text-slate-500" />
                        <div>
                          <span className="text-xs font-bold uppercase tracking-wider text-slate-800 block leading-tight">
                            Acompanhamento Mensal — {card.shortLabel}
                          </span>
                          <span className="text-[10px] text-slate-500 capitalize">
                            Mês de {nowDate.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}
                          </span>
                        </div>
                      </div>

                      <div className="flex-1 w-full sm:max-w-md flex flex-col justify-center px-2">
                        <div className="flex items-baseline justify-between text-xs mb-1">
                          <span className="font-bold text-slate-800">
                            {card.doneMonthPrimary.toLocaleString('pt-BR', { maximumFractionDigits: decimals })} <span className="text-[10px] text-slate-500">{card.primaryMetricShort} realizados</span>
                          </span>
                          <span className="text-[11px] font-medium text-slate-500">
                            Meta: <strong className="text-slate-800">{card.targetMonthly.toLocaleString('pt-BR')} {card.primaryMetricShort}</strong>
                          </span>
                        </div>
                        <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-500 ${
                              card.pctMonthly >= 70 ? 'bg-emerald-500' : 'bg-blue-600'
                            }`}
                            style={{ width: `${Math.min(100, Math.max(2, card.pctMonthly))}%` }}
                          />
                        </div>
                      </div>

                      <div className="shrink-0 text-right">
                        <span className={`inline-flex items-center text-xs sm:text-sm font-bold px-2.5 py-1 rounded-lg border ${
                          card.pctMonthly >= 70 ? 'bg-emerald-50 text-emerald-800 border-emerald-200' : 'bg-blue-50 text-blue-800 border-blue-200'
                        }`}>
                          {card.pctMonthly}% do mês atingido
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })()
          ) : (
            /* 4 LINES SIMULTANEOUSLY IN TV GRID */
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 flex-1 min-h-0 w-full overflow-y-auto">
              {sectorComparisonCards.map((card) => {
                const decimals = card.id === 'FURADEIRA' ? 0 : 1;
                const remainingFormatted =
                  card.signedRemainingDaily >= 0
                    ? `+${card.signedRemainingDaily.toLocaleString('pt-BR', {
                        minimumFractionDigits: 0,
                        maximumFractionDigits: decimals,
                      })}`
                    : card.signedRemainingDaily.toLocaleString('pt-BR', {
                        minimumFractionDigits: 0,
                        maximumFractionDigits: decimals,
                      });
                  return (
                    <div
                      key={card.id}
                      className="bg-white border border-slate-200 text-slate-800 rounded-xl p-2.5 flex flex-col justify-between shadow-xs min-h-0 overflow-hidden"
                    >
                      <div className="flex items-center justify-between border-b border-slate-100 pb-1 mb-1 shrink-0">
                        <span className="text-xs sm:text-sm font-bold text-slate-800 uppercase tracking-wide">
                          {card.label} ({card.primaryMetricUnit})
                        </span>
                        <span className="text-[11px] font-semibold text-rose-600">
                          Paradas Hoje: {card.downtimeTodayMinutes} min
                        </span>
                      </div>
                    {/* Somente o Acompanhamento Diário como gráfico */}
                    <div className="flex-1 min-h-0 my-0.5 flex items-center justify-center">
                      <div className="w-full max-w-[280px] h-full">
                        <SemicircleGaugeCard
                          title="Acompanhamento Diário"
                          currentValue={card.doneTodayPrimary}
                          targetValue={card.targetPrimary}
                          unitLabel={card.primaryMetricShort}
                          decimals={decimals}
                          compact={true}
                          presentation={false}
                          isMonthly={false}
                        />
                      </div>
                    </div>

                    {/* Parte Baixa: Informações do Dia e Acompanhamento Mensal */}
                    <div className="mt-1 space-y-1 shrink-0">
                      <div className="grid grid-cols-3 gap-1 text-center">
                        <div className="bg-slate-50 border border-slate-200 rounded-md p-1">
                          <p className="text-[9px] text-slate-500 font-medium uppercase">Meta Diária</p>
                          <p className="text-xs sm:text-sm font-bold text-slate-800 tabular-nums">
                            {card.targetPrimary.toLocaleString('pt-BR')} <span className="text-[9px] text-slate-400">{card.primaryMetricShort}</span>
                          </p>
                        </div>
                        <div className="bg-slate-50 border border-slate-200 rounded-md p-1">
                          <p className="text-[9px] text-slate-500 font-medium uppercase">Realizado</p>
                          <p className="text-xs sm:text-sm font-bold text-slate-900 tabular-nums">
                            {card.doneTodayPrimary.toLocaleString('pt-BR', { maximumFractionDigits: decimals })} <span className="text-[9px] text-slate-400">{card.primaryMetricShort}</span>
                          </p>
                        </div>
                        <div className="bg-slate-50 border border-slate-200 rounded-md p-1">
                          <p className="text-[9px] text-slate-500 font-medium uppercase">Saldo Diário</p>
                          <p
                            className={`text-xs sm:text-sm font-bold tabular-nums ${
                              card.signedRemainingDaily < 0 ? 'text-rose-600' : 'text-emerald-600'
                            }`}
                          >
                            {remainingFormatted}
                          </p>
                        </div>
                      </div>

                      {/* Faixa de Acompanhamento Mensal na parte baixa */}
                      <div className="bg-slate-50 border border-slate-200 rounded-md px-2 py-1 flex items-center justify-between gap-1.5 text-[10px]">
                        <span className="font-semibold text-slate-700 truncate">
                          Mês: {card.doneMonthPrimary.toLocaleString('pt-BR', { maximumFractionDigits: decimals })} / {card.targetMonthly.toLocaleString('pt-BR')} {card.primaryMetricShort}
                        </span>
                        <div className="flex-1 max-w-[80px] h-1.5 bg-slate-200 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${card.pctMonthly >= 70 ? 'bg-emerald-500' : 'bg-blue-600'}`}
                            style={{ width: `${Math.min(100, Math.max(2, card.pctMonthly))}%` }}
                          />
                        </div>
                        <span className={`font-semibold px-1 py-0.2 rounded text-[9px] ${
                          card.pctMonthly >= 70 ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-slate-100 text-slate-700'
                        }`}>
                          {card.pctMonthly}%
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      <div className="max-w-7xl mx-auto py-4 sm:py-6 px-3 sm:px-6 space-y-6 sm:space-y-8">
        {/* Header & Global Actions */}
        <div className="bg-[#091428] text-white rounded-2xl p-4 sm:p-6 space-y-4 shadow-sm border border-slate-800">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div>
              <div className="flex flex-wrap items-center gap-2 mb-1.5">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-slate-800 text-[11px] font-semibold text-amber-400 border border-slate-700">
                  <Activity className="w-3.5 h-3.5 text-amber-400" />
                  Telemetria em Tempo Real
                </span>
                {isSelectedDateToday ? (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-950/80 text-[11px] font-semibold text-emerald-400 border border-emerald-800">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                    Online (Hoje)
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-slate-800 text-[11px] font-semibold text-slate-300 border border-slate-700">
                    <Calendar className="w-3 h-3 text-amber-400" />
                    Histórico Diário
                  </span>
                )}
              </div>
              <h1 className="text-xl sm:text-2xl lg:text-3xl font-extrabold tracking-tight text-white capitalize">
                Produção de {selectedLongDatePt}
              </h1>
              <p className="text-xs sm:text-sm text-slate-300 mt-0.5">
                Acompanhamento consolidado de Previsto x Realizado nas 4 linhas (Corte, Borda, Furação, Pintura UV), turnos e máquinas
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2 self-stretch sm:self-start lg:self-auto">
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 border border-slate-700 text-slate-200 text-xs font-medium rounded-xl">
                <SlidersHorizontal className="w-3.5 h-3.5 text-slate-400" />
                <span>Teste Físico Ativo: Somente Seccionadoras</span>
              </span>

              {onPurgeFictitiousLogs && (
                <button
                  type="button"
                  disabled={purgingLogs}
                  onClick={async () => {
                    setPurgingLogs(true);
                    try {
                      const count = await onPurgeFictitiousLogs();
                      setSimulationMsg(
                        count > 0
                          ? `${count} apontamentos residuais de teste/demonstração foram excluídos com sucesso!`
                          : 'Apontamentos verificados: apenas dados reais das seccionadoras estão no banco.'
                      );
                      setTimeout(() => setSimulationMsg(null), 6000);
                    } finally {
                      setPurgingLogs(false);
                    }
                  }}
                  className="flex-1 sm:flex-initial px-3 sm:px-3.5 py-2 bg-slate-800/80 hover:bg-slate-800 text-slate-200 text-xs font-semibold rounded-xl flex items-center justify-center gap-1.5 transition-all cursor-pointer min-h-[40px] border border-slate-700"
                  title="Remover apontamentos de teste / fictícios (Lucas Mendes, Rafael Lima, Tiago Santos, etc.)"
                >
                  <Trash2 className="w-4 h-4 text-rose-400" />
                  <span>{purgingLogs ? 'Limpando...' : 'Limpar Demonstração'}</span>
                </button>
              )}

              <button
                type="button"
                onClick={handleEnterPresentationMode}
                className="flex-1 sm:flex-initial px-3.5 sm:px-4 py-2 sm:py-2.5 bg-amber-400 hover:bg-amber-300 text-slate-950 text-xs font-extrabold rounded-xl flex items-center justify-center gap-2 transition-all whitespace-nowrap cursor-pointer shadow-xs min-h-[40px]"
              >
                <Tv className="w-4 h-4 shrink-0" />
                <span>Modo TV (Tela Cheia)</span>
              </button>

              <button
                type="button"
                onClick={() => setShowResetConfirm(true)}
                className="flex-1 sm:flex-initial px-3 sm:px-3.5 py-2 sm:py-2.5 bg-rose-950/70 border border-rose-800 hover:bg-rose-900 text-rose-200 text-xs font-semibold rounded-xl flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap cursor-pointer min-h-[40px]"
              >
                <RotateCcw className="w-4 h-4 text-rose-400 shrink-0" />
                <span>Zerar Dados</span>
              </button>

              <button
                type="button"
                onClick={onNavigateToSettings}
                className="w-full sm:w-auto px-3 sm:px-3.5 py-2 sm:py-2.5 bg-slate-800 border border-slate-700 hover:bg-slate-700 text-slate-100 text-xs font-semibold rounded-xl flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap cursor-pointer min-h-[40px]"
              >
                <Settings className="w-4 h-4 text-amber-400 shrink-0" />
                <span>Metas & Cadastros</span>
              </button>

              <button
                type="button"
                onClick={handleExportCSV}
                className="w-full sm:w-auto px-3 sm:px-4 py-2 sm:py-2.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-100 text-xs font-semibold rounded-xl flex items-center justify-center gap-2 transition-colors whitespace-nowrap cursor-pointer min-h-[40px]"
              >
                <Download className="w-4 h-4 shrink-0 text-slate-300" />
                <span>Exportar CSV ({filteredLogs.length})</span>
              </button>
            </div>
          </div>

          {/* Interactive Date Filter Bar for Daily Tracking */}
          <div className="pt-3 border-t border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold text-slate-300 flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-amber-400" />
                Data de Acompanhamento:
              </span>
              <button
                type="button"
                onClick={() => setSelectedDayDate(todayIso)}
                className={`px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer ${
                  isSelectedDateToday
                    ? 'bg-amber-400 text-slate-950 shadow-xs'
                    : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                }`}
              >
                Hoje ({todayStr})
              </button>
              <button
                type="button"
                onClick={() => {
                  const y = new Date();
                  y.setDate(y.getDate() - 1);
                  setSelectedDayDate(y.toISOString().slice(0, 10));
                }}
                className={`px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer ${
                  !isSelectedDateToday &&
                  selectedDayDate ===
                    new Date(Date.now() - 86400000).toISOString().slice(0, 10)
                    ? 'bg-amber-400 text-slate-950 shadow-xs'
                    : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                }`}
              >
                Ontem
              </button>
              <div className="inline-flex items-center gap-1.5 bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1">
                <span className="text-[11px] text-slate-400">Outra Data:</span>
                <input
                  type="date"
                  value={selectedDayDate}
                  onChange={(e) => setSelectedDayDate(e.target.value)}
                  className="bg-transparent text-white text-xs font-bold focus:outline-none cursor-pointer"
                />
              </div>
            </div>

            <div className="text-slate-300 text-[11px]">
              Apontamentos do Dia: <strong className="text-amber-400">{dailyFactoryTotals.totalPieces.toLocaleString('pt-BR')} peças</strong>
              <span className="mx-1.5 text-slate-600">·</span>
              Paradas: <strong className="text-rose-400">{formatMinutesAndHours(dailyFactoryTotals.totalDowntimeMin)}</strong>
            </div>
          </div>
        </div>

        {simulationMsg && (
          <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-between gap-3 text-sm text-emerald-800">
            <div className="flex items-center gap-2.5">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
              <span className="font-semibold text-xs sm:text-sm">{simulationMsg}</span>
            </div>
            <button
              type="button"
              onClick={() => setSimulationMsg(null)}
              className="text-xs font-bold text-emerald-700 underline cursor-pointer"
            >
              Fechar
            </button>
          </div>
        )}

        {/* Sub-Tabs de Navegação Especializada do Acompanhamento Diário */}
        <div className="p-1.5 bg-slate-100 rounded-2xl border border-slate-200 flex items-center gap-1.5 overflow-x-auto scrollbar-none">
          <button
            type="button"
            onClick={() => setDailyViewMode('ALL')}
            className={`px-3.5 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 shrink-0 ${
              dailyViewMode === 'ALL'
                ? 'bg-slate-900 text-amber-400 shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-white/80'
            }`}
          >
            <BarChart3 className="w-4 h-4 text-amber-400" />
            <span>Visão Geral do Dia</span>
          </button>
          <button
            type="button"
            onClick={() => setDailyViewMode('GAUGES')}
            className={`px-3.5 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 shrink-0 ${
              dailyViewMode === 'GAUGES'
                ? 'bg-slate-900 text-amber-400 shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-white/80'
            }`}
          >
            <Gauge className="w-4 h-4 text-amber-400" />
            <span>Velocímetros (Previsto x Realizado)</span>
          </button>
          <button
            type="button"
            onClick={() => setDailyViewMode('TURNOS')}
            className={`px-3.5 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 shrink-0 ${
              dailyViewMode === 'TURNOS'
                ? 'bg-slate-900 text-amber-400 shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-white/80'
            }`}
          >
            <Sun className="w-4 h-4 text-amber-400" />
            <span>Produção por Turno (1, 2 e 3)</span>
          </button>
          <button
            type="button"
            onClick={() => setDailyViewMode('HORARIO')}
            className={`px-3.5 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 shrink-0 ${
              dailyViewMode === 'HORARIO'
                ? 'bg-slate-900 text-amber-400 shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-white/80'
            }`}
          >
            <Clock className="w-4 h-4 text-slate-400" />
            <span>Cadência Horária (06h às 22h)</span>
          </button>
          <button
            type="button"
            onClick={() => setDailyViewMode('MAQUINAS')}
            className={`px-3.5 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 shrink-0 ${
              dailyViewMode === 'MAQUINAS'
                ? 'bg-slate-900 text-amber-400 shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-white/80'
            }`}
          >
            <Terminal className="w-4 h-4 text-slate-400" />
            <span>10 Máquinas no Dia ({machines.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setDailyViewMode('PARADAS')}
            className={`px-3.5 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 shrink-0 ${
              dailyViewMode === 'PARADAS'
                ? 'bg-rose-600 text-white shadow-xs'
                : 'text-slate-600 hover:text-rose-700 hover:bg-rose-50'
            }`}
          >
            <AlertTriangle className="w-4 h-4 text-rose-500" />
            <span>Paradas do Dia (P1–P22)</span>
          </button>
        </div>

        {/* PLACAR EXECUTIVO DA PRODUÇÃO DIÁRIA (4 Linhas + Metas do Dia) */}
        <section aria-label="Placar Executivo de Produção Diária" className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* 1. CORTE NO DIA (Seccionadoras — 2 Dashboards: MDF vs Fundo) */}
            <div className={`bg-white border border-slate-200/90 rounded-2xl p-5 flex flex-col justify-between shadow-xs text-slate-800 transition-all ${
              corteViewMode === 'SPLIT_BOTH' ? 'sm:col-span-2 lg:col-span-2' : ''
            }`}>
              <div>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs pb-3 border-b border-slate-100">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-blue-600" />
                    <span className="font-bold uppercase tracking-wide text-slate-900 text-xs">
                      Corte — Seccionadoras
                    </span>
                    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-slate-100 text-slate-700">
                      Giben + Selco
                    </span>
                  </div>

                  {/* Switcher dos 2 Dashboards de Corte */}
                  <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-lg self-start sm:self-auto overflow-x-auto max-w-full">
                    <button
                      type="button"
                      onClick={() => setCorteViewMode('SPLIT_BOTH')}
                      className={`px-2 py-1 text-[11px] font-bold rounded-md transition-all cursor-pointer whitespace-nowrap flex items-center gap-1 ${
                        corteViewMode === 'SPLIT_BOTH'
                          ? 'bg-white text-slate-900 shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                      title="Exibir os 2 dashboards lado a lado"
                    >
                      <Split className="w-3 h-3 text-blue-600" />
                      <span>2 Lado a Lado</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setCorteViewMode('MDF')}
                      className={`px-2 py-1 text-[11px] font-bold rounded-md transition-all cursor-pointer whitespace-nowrap ${
                        corteViewMode === 'MDF'
                          ? 'bg-white text-slate-900 shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                      title="Ver apenas Corte de MDF (9, 15, 18 e 25mm)"
                    >
                      🪵 MDF
                    </button>
                    <button
                      type="button"
                      onClick={() => setCorteViewMode('FUNDO')}
                      className={`px-2 py-1 text-[11px] font-bold rounded-md transition-all cursor-pointer whitespace-nowrap ${
                        corteViewMode === 'FUNDO'
                          ? 'bg-white text-slate-900 shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                      title="Ver apenas Corte de Fundo (2,5mm / Costas)"
                    >
                      📦 Fundo
                    </button>
                    <button
                      type="button"
                      onClick={() => setCorteViewMode('ALL')}
                      className={`px-2 py-1 text-[11px] font-bold rounded-md transition-all cursor-pointer whitespace-nowrap ${
                        corteViewMode === 'ALL'
                          ? 'bg-white text-slate-900 shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                      title="Ver Total Consolidado"
                    >
                      📊 Todos
                    </button>
                  </div>
                </div>

                {/* Conteúdo Dinâmico conforme o Modo de Corte Escolhido */}
                {corteViewMode === 'SPLIT_BOTH' ? (
                  /* Renderização dos 2 Dashboards Lado a Lado */
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 mt-3.5">
                    {/* Dashboard 1: Corte MDF */}
                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 flex flex-col justify-between">
                      <div>
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-extrabold text-blue-700 flex items-center gap-1.5">
                            <span>🪵</span>
                            <span>Corte de MDF (9, 15, 18 e 25mm)</span>
                          </span>
                          <span className="font-mono text-[10px] font-bold px-1.5 py-0.5 rounded bg-white text-slate-700 border border-slate-200">
                            {dailyFactoryTotals.totalCorteMdfPieces.toLocaleString('pt-BR')} pçs
                          </span>
                        </div>
                        <div className="flex items-baseline gap-1 mt-1.5">
                          <span className="text-2xl sm:text-3xl font-black text-slate-900 font-mono tracking-tight tabular-nums">
                            {dailyFactoryTotals.totalCorteMdfM2.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}
                          </span>
                          <span className="text-xs font-bold text-slate-600">m²</span>
                        </div>
                      </div>

                      <div className="mt-3 pt-2.5 border-t border-slate-200 space-y-1.5">
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="text-slate-500 font-medium">Meta: <strong className="text-slate-800">{dailyFactoryTotals.targetCorteMdf.toLocaleString('pt-BR')} m²</strong></span>
                          <span className={`font-mono font-bold px-1.5 py-0.5 rounded text-[11px] border ${
                            dailyFactoryTotals.pctCorteMdf >= 100
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : 'bg-blue-50 text-blue-700 border-blue-200'
                          }`}>
                            {dailyFactoryTotals.pctCorteMdf}%
                          </span>
                        </div>
                        <div className="w-full h-1.5 bg-slate-200 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-500 ${
                              dailyFactoryTotals.pctCorteMdf >= 100
                                ? 'bg-emerald-500'
                                : 'bg-blue-600'
                            }`}
                            style={{ width: `${Math.min(100, Math.max(3, dailyFactoryTotals.pctCorteMdf))}%` }}
                          />
                        </div>
                        <p className="text-[10px] font-medium text-slate-500">
                          {dailyFactoryTotals.totalCorteMdfM2 >= dailyFactoryTotals.targetCorteMdf ? (
                            <span className="text-emerald-600 font-bold">✓ Superou (+{(dailyFactoryTotals.totalCorteMdfM2 - dailyFactoryTotals.targetCorteMdf).toFixed(1)} m²)</span>
                          ) : (
                            <span>Faltam {(dailyFactoryTotals.targetCorteMdf - dailyFactoryTotals.totalCorteMdfM2).toFixed(1)} m²</span>
                          )}
                        </p>
                      </div>
                    </div>

                    {/* Dashboard 2: Corte Fundo */}
                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 flex flex-col justify-between">
                      <div>
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-extrabold text-amber-700 flex items-center gap-1.5">
                            <span>📦</span>
                            <span>Corte de Fundo (2,5mm / Costas)</span>
                          </span>
                          <span className="font-mono text-[10px] font-bold px-1.5 py-0.5 rounded bg-white text-slate-700 border border-slate-200">
                            {dailyFactoryTotals.totalCorteFundoPieces.toLocaleString('pt-BR')} pçs
                          </span>
                        </div>
                        <div className="flex items-baseline gap-1 mt-1.5">
                          <span className="text-2xl sm:text-3xl font-black text-slate-900 font-mono tracking-tight tabular-nums">
                            {dailyFactoryTotals.totalCorteFundoM2.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}
                          </span>
                          <span className="text-xs font-bold text-slate-600">m²</span>
                        </div>
                      </div>

                      <div className="mt-3 pt-2.5 border-t border-slate-200 space-y-1.5">
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="text-slate-500 font-medium">Meta: <strong className="text-slate-800">{dailyFactoryTotals.targetCorteFundo.toLocaleString('pt-BR')} m²</strong></span>
                          <span className={`font-mono font-bold px-1.5 py-0.5 rounded text-[11px] border ${
                            dailyFactoryTotals.pctCorteFundo >= 100
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : 'bg-amber-50 text-amber-700 border-amber-200'
                          }`}>
                            {dailyFactoryTotals.pctCorteFundo}%
                          </span>
                        </div>
                        <div className="w-full h-1.5 bg-slate-200 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-500 ${
                              dailyFactoryTotals.pctCorteFundo >= 100
                                ? 'bg-emerald-500'
                                : 'bg-amber-500'
                            }`}
                            style={{ width: `${Math.min(100, Math.max(3, dailyFactoryTotals.pctCorteFundo))}%` }}
                          />
                        </div>
                        <p className="text-[10px] font-medium text-slate-400 font-mono">
                          {dailyFactoryTotals.totalCorteFundoM2 >= dailyFactoryTotals.targetCorteFundo ? (
                            <span className="text-emerald-400 font-bold">✓ Superou (+{(dailyFactoryTotals.totalCorteFundoM2 - dailyFactoryTotals.targetCorteFundo).toFixed(1)} m²)</span>
                          ) : (
                            <span>Faltam {(dailyFactoryTotals.targetCorteFundo - dailyFactoryTotals.totalCorteFundoM2).toFixed(1)} m²</span>
                          )}
                        </p>
                      </div>
                    </div>
                  </div>
                ) : corteViewMode === 'MDF' ? (
                  /* Modo Exclusivo MDF */
                  <div className="mt-3.5">
                    <span className="text-[11px] font-mono uppercase tracking-wider text-cyan-400/80 block">
                      Corte de MDF Realizado no Dia (9, 15, 18 e 25mm)
                    </span>
                    <div className="flex items-baseline gap-1.5 mt-0.5">
                      <span className="text-3xl sm:text-4xl font-black text-white font-mono tracking-tight tabular-nums">
                        {dailyFactoryTotals.totalCorteMdfM2.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}
                      </span>
                      <span className="text-sm font-bold text-cyan-400 font-mono">m²</span>
                      <span className="text-xs font-mono font-medium text-slate-400 ml-2">
                        ({dailyFactoryTotals.totalCorteMdfPieces.toLocaleString('pt-BR')} peças)
                      </span>
                    </div>
                  </div>
                ) : corteViewMode === 'FUNDO' ? (
                  /* Modo Exclusivo Fundo */
                  <div className="mt-3.5">
                    <span className="text-[11px] font-mono uppercase tracking-wider text-amber-400/80 block">
                      Corte de Fundo Realizado no Dia (2,5mm / Costas)
                    </span>
                    <div className="flex items-baseline gap-1.5 mt-0.5">
                      <span className="text-3xl sm:text-4xl font-black text-white font-mono tracking-tight tabular-nums">
                        {dailyFactoryTotals.totalCorteFundoM2.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}
                      </span>
                      <span className="text-sm font-bold text-amber-400 font-mono">m²</span>
                      <span className="text-xs font-mono font-medium text-slate-400 ml-2">
                        ({dailyFactoryTotals.totalCorteFundoPieces.toLocaleString('pt-BR')} peças)
                      </span>
                    </div>
                  </div>
                ) : (
                  /* Modo Consolidado (MDF + Fundo) */
                  <div className="mt-3.5">
                    <span className="text-[11px] font-mono uppercase tracking-wider text-cyan-400/80 block">
                      Total Geral Cortado no Dia (MDF + Fundos)
                    </span>
                    <div className="flex items-baseline gap-1.5 mt-0.5">
                      <span className="text-3xl sm:text-4xl font-black text-white font-mono tracking-tight tabular-nums">
                        {dailyFactoryTotals.totalCorteM2.toLocaleString('pt-BR', {
                          maximumFractionDigits: 1,
                        })}
                      </span>
                      <span className="text-sm font-bold text-cyan-400 font-mono">m²</span>
                      <span className="text-xs font-mono font-medium text-slate-400 ml-2">
                        ({dailyFactoryTotals.totalCortePieces.toLocaleString('pt-BR')} peças)
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {/* Rodapé do Card */}
              {corteViewMode === 'SPLIT_BOTH' ? (
                <div className="mt-3.5 pt-2.5 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500">
                  <span>
                    Total Geral Cortado: <strong className="font-mono text-slate-900">{dailyFactoryTotals.totalCorteM2.toFixed(1)} m²</strong> ({dailyFactoryTotals.totalCortePieces} pçs)
                  </span>
                  <span className="font-bold text-slate-800">
                    Meta Geral: {dailyFactoryTotals.targetCorte.toLocaleString('pt-BR')} m² ({dailyFactoryTotals.pctCorte}%)
                  </span>
                </div>
              ) : corteViewMode === 'MDF' ? (
                <div className="mt-4 pt-3.5 border-t border-slate-200 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-500 font-medium">Meta MDF: <strong className="text-slate-800">{dailyFactoryTotals.targetCorteMdf.toLocaleString('pt-BR')} m²</strong></span>
                    <span className={`font-mono font-bold text-xs px-2 py-0.5 rounded-md border ${
                      dailyFactoryTotals.pctCorteMdf >= 100
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        : 'bg-blue-50 text-blue-700 border-blue-200'
                    }`}>
                      {dailyFactoryTotals.pctCorteMdf}%
                    </span>
                  </div>
                  <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        dailyFactoryTotals.pctCorteMdf >= 100
                          ? 'bg-emerald-500'
                          : 'bg-blue-600'
                      }`}
                      style={{ width: `${Math.min(100, Math.max(3, dailyFactoryTotals.pctCorteMdf))}%` }}
                    />
                  </div>
                  <p className="text-[11px] font-medium text-slate-500">
                    {dailyFactoryTotals.totalCorteMdfM2 >= dailyFactoryTotals.targetCorteMdf ? (
                      <span className="text-emerald-600 font-semibold">✓ Meta de MDF superada (+{(dailyFactoryTotals.totalCorteMdfM2 - dailyFactoryTotals.targetCorteMdf).toFixed(1)} m²)</span>
                    ) : (
                      <span>Faltam <strong>{(dailyFactoryTotals.targetCorteMdf - dailyFactoryTotals.totalCorteMdfM2).toFixed(1)} m²</strong> de MDF</span>
                    )}
                  </p>
                </div>
              ) : corteViewMode === 'FUNDO' ? (
                <div className="mt-4 pt-3.5 border-t border-slate-200 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-500 font-medium">Meta Fundos: <strong className="text-slate-800">{dailyFactoryTotals.targetCorteFundo.toLocaleString('pt-BR')} m²</strong></span>
                    <span className={`font-mono font-bold text-xs px-2 py-0.5 rounded-md border ${
                      dailyFactoryTotals.pctCorteFundo >= 100
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        : 'bg-amber-50 text-amber-700 border-amber-200'
                    }`}>
                      {dailyFactoryTotals.pctCorteFundo}%
                    </span>
                  </div>
                  <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        dailyFactoryTotals.pctCorteFundo >= 100
                          ? 'bg-emerald-500'
                          : 'bg-amber-500'
                      }`}
                      style={{ width: `${Math.min(100, Math.max(3, dailyFactoryTotals.pctCorteFundo))}%` }}
                    />
                  </div>
                  <p className="text-[11px] font-medium text-slate-500">
                    {dailyFactoryTotals.totalCorteFundoM2 >= dailyFactoryTotals.targetCorteFundo ? (
                      <span className="text-emerald-600 font-semibold">✓ Meta de Fundos superada (+{(dailyFactoryTotals.totalCorteFundoM2 - dailyFactoryTotals.targetCorteFundo).toFixed(1)} m²)</span>
                    ) : (
                      <span>Faltam <strong>{(dailyFactoryTotals.targetCorteFundo - dailyFactoryTotals.totalCorteFundoM2).toFixed(1)} m²</strong> de Fundos</span>
                    )}
                  </p>
                </div>
              ) : (
                <div className="mt-4 pt-3.5 border-t border-slate-200 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-500 font-medium">Meta: <strong className="text-slate-800">{dailyFactoryTotals.targetCorte.toLocaleString('pt-BR')} m²</strong></span>
                    <span
                      className={`font-mono font-bold text-xs px-2 py-0.5 rounded-md border ${
                        dailyFactoryTotals.pctCorte >= 100
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          : 'bg-blue-50 text-blue-700 border-blue-200'
                      }`}
                    >
                      {dailyFactoryTotals.pctCorte}%
                    </span>
                  </div>

                  <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        dailyFactoryTotals.pctCorte >= 100
                          ? 'bg-emerald-500'
                          : 'bg-blue-600'
                      }`}
                      style={{ width: `${Math.min(100, Math.max(3, dailyFactoryTotals.pctCorte))}%` }}
                    />
                  </div>

                  <div className="flex items-center justify-between text-[11px] text-slate-500">
                    <span>
                      🪵 MDF: <strong className="text-slate-700 font-mono">{dailyFactoryTotals.totalCorteMdfM2.toFixed(1)} m²</strong> ({dailyFactoryTotals.pctCorteMdf}%)
                    </span>
                    <span>
                      📦 Fundo: <strong className="text-slate-700 font-mono">{dailyFactoryTotals.totalCorteFundoM2.toFixed(1)} m²</strong> ({dailyFactoryTotals.pctCorteFundo}%)
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* 2. COLADEIRAS NO DIA */}
            <div className="bg-white border border-slate-200/90 rounded-2xl p-5 flex flex-col justify-between shadow-xs text-slate-800 transition-all">
              <div>
                <div className="flex items-center justify-between text-xs pb-3 border-b border-slate-100">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-600" />
                    <span className="font-bold uppercase tracking-wide text-slate-900 text-xs">
                      Coladeiras de Borda
                    </span>
                  </div>
                  <span className="text-[11px] font-semibold px-2 py-0.5 rounded-md bg-slate-100 text-slate-700">
                    3 Máquinas
                  </span>
                </div>

                <div className="mt-3.5">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 block">
                    Realizado no Dia
                  </span>
                  <div className="flex items-baseline gap-1.5 mt-0.5">
                    <span className="text-3xl sm:text-4xl font-black text-slate-900 tracking-tight tabular-nums">
                      {dailyFactoryTotals.totalColadeiraMl.toLocaleString('pt-BR', {
                        maximumFractionDigits: 1,
                      })}
                    </span>
                    <span className="text-sm font-bold text-slate-500">m lin.</span>
                  </div>
                </div>
              </div>

              <div className="mt-4 pt-3.5 border-t border-slate-100 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-600 font-medium">Meta: <strong className="text-slate-900">{dailyFactoryTotals.targetColadeira.toLocaleString('pt-BR')} m</strong></span>
                  <span
                    className={`font-bold text-xs px-2 py-0.5 rounded-md ${
                      dailyFactoryTotals.pctColadeira >= 100
                        ? 'bg-emerald-50 text-emerald-800'
                        : 'bg-slate-100 text-slate-700'
                    }`}
                  >
                    {dailyFactoryTotals.pctColadeira}%
                  </span>
                </div>

                <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full bg-emerald-500 transition-all duration-500"
                    style={{ width: `${Math.min(100, Math.max(3, dailyFactoryTotals.pctColadeira))}%` }}
                  />
                </div>

                <p className="text-[11px] text-slate-500">
                  {dailyFactoryTotals.totalColadeiraMl >= dailyFactoryTotals.targetColadeira ? (
                    <span className="text-emerald-700 font-semibold">
                      ✓ Meta superada (+{(dailyFactoryTotals.totalColadeiraMl - dailyFactoryTotals.targetColadeira).toFixed(1)} m)
                    </span>
                  ) : (
                    <span>
                      Faltam <strong className="text-slate-800">{(dailyFactoryTotals.targetColadeira - dailyFactoryTotals.totalColadeiraMl).toFixed(1)} m</strong> lineares
                    </span>
                  )}
                </p>
              </div>
            </div>

            {/* 3. FURADEIRAS NO DIA */}
            <div className="bg-white border border-slate-200/90 rounded-2xl p-5 flex flex-col justify-between shadow-xs text-slate-800 transition-all">
              <div>
                <div className="flex items-center justify-between text-xs pb-3 border-b border-slate-100">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-sky-600" />
                    <span className="font-bold uppercase tracking-wide text-slate-900 text-xs">
                      Furadeiras
                    </span>
                  </div>
                  <span className="text-[11px] font-semibold px-2 py-0.5 rounded-md bg-slate-100 text-slate-700">
                    4 Máquinas
                  </span>
                </div>

                <div className="mt-3.5">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 block">
                    Realizado no Dia
                  </span>
                  <div className="flex items-baseline gap-1.5 mt-0.5">
                    <span className="text-3xl sm:text-4xl font-black text-slate-900 tracking-tight tabular-nums">
                      {dailyFactoryTotals.totalFuradeiraPcs.toLocaleString('pt-BR')}
                    </span>
                    <span className="text-sm font-bold text-slate-500">peças</span>
                  </div>
                </div>
              </div>

              <div className="mt-4 pt-3.5 border-t border-slate-100 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-600 font-medium">Meta: <strong className="text-slate-900">{dailyFactoryTotals.targetFuradeira.toLocaleString('pt-BR')} pçs</strong></span>
                  <span
                    className={`font-bold text-xs px-2 py-0.5 rounded-md ${
                      dailyFactoryTotals.pctFuradeira >= 100
                        ? 'bg-emerald-50 text-emerald-800'
                        : 'bg-slate-100 text-slate-700'
                    }`}
                  >
                    {dailyFactoryTotals.pctFuradeira}%
                  </span>
                </div>

                <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full bg-sky-500 transition-all duration-500"
                    style={{ width: `${Math.min(100, Math.max(3, dailyFactoryTotals.pctFuradeira))}%` }}
                  />
                </div>

                <p className="text-[11px] text-slate-500">
                  {dailyFactoryTotals.totalFuradeiraPcs >= dailyFactoryTotals.targetFuradeira ? (
                    <span className="text-emerald-700 font-semibold">
                      ✓ Meta superada (+{dailyFactoryTotals.totalFuradeiraPcs - dailyFactoryTotals.targetFuradeira} pçs)
                    </span>
                  ) : (
                    <span>
                      Faltam <strong className="text-slate-800">{dailyFactoryTotals.targetFuradeira - dailyFactoryTotals.totalFuradeiraPcs} peças</strong> para a meta
                    </span>
                  )}
                </p>
              </div>
            </div>

            {/* 4. PINTURA UV NO DIA */}
            <div className="bg-white border border-slate-200/90 rounded-2xl p-5 flex flex-col justify-between shadow-xs text-slate-800 transition-all">
              <div>
                <div className="flex items-center justify-between text-xs pb-3 border-b border-slate-100">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-amber-600" />
                    <span className="font-bold uppercase tracking-wide text-slate-900 text-xs">
                      Linha de Pintura UV
                    </span>
                  </div>
                  <span className="text-[11px] font-semibold px-2 py-0.5 rounded-md bg-slate-100 text-slate-700">
                    Linha Contínua
                  </span>
                </div>

                <div className="mt-3.5">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 block">
                    Realizado no Dia
                  </span>
                  <div className="flex items-baseline gap-1.5 mt-0.5">
                    <span className="text-3xl sm:text-4xl font-black text-slate-900 tracking-tight tabular-nums">
                      {dailyFactoryTotals.totalPinturaM2.toLocaleString('pt-BR', {
                        maximumFractionDigits: 1,
                      })}
                    </span>
                    <span className="text-sm font-bold text-slate-500">m²</span>
                  </div>
                </div>
              </div>

              <div className="mt-4 pt-3.5 border-t border-slate-100 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-600 font-medium">Meta: <strong className="text-slate-900">{dailyFactoryTotals.targetPintura.toLocaleString('pt-BR')} m²</strong></span>
                  <span
                    className={`font-bold text-xs px-2 py-0.5 rounded-md ${
                      dailyFactoryTotals.pctPintura >= 100
                        ? 'bg-emerald-50 text-emerald-800'
                        : 'bg-slate-100 text-slate-700'
                    }`}
                  >
                    {dailyFactoryTotals.pctPintura}%
                  </span>
                </div>

                <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full bg-amber-500 transition-all duration-500"
                    style={{ width: `${Math.min(100, Math.max(3, dailyFactoryTotals.pctPintura))}%` }}
                  />
                </div>

                <p className="text-[11px] text-slate-500">
                  {dailyFactoryTotals.totalPinturaM2 >= dailyFactoryTotals.targetPintura ? (
                    <span className="text-emerald-700 font-semibold">
                      ✓ Meta superada (+{(dailyFactoryTotals.totalPinturaM2 - dailyFactoryTotals.targetPintura).toFixed(1)} m²)
                    </span>
                  ) : (
                    <span>
                      Faltam <strong className="text-slate-800">{(dailyFactoryTotals.targetPintura - dailyFactoryTotals.totalPinturaM2).toFixed(1)} m²</strong> para a meta
                    </span>
                  )}
                </p>
              </div>
            </div>
          </div>

          {/* 4 Mini-KPIs Executivos de Apoio Diário */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-white border border-slate-200/90 rounded-2xl p-4 flex items-center justify-between shadow-xs">
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Peças Produzidas</p>
                <p className="text-2xl font-black text-slate-900 mt-0.5">
                  {dailyFactoryTotals.totalPieces.toLocaleString('pt-BR')}
                </p>
              </div>
              <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center font-bold text-xs">
                PÇS
              </div>
            </div>

            <div className="bg-white border border-slate-200/90 rounded-2xl p-4 flex items-center justify-between shadow-xs">
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Tempo Parado</p>
                <p className={`text-2xl font-black mt-0.5 ${
                  dailyFactoryTotals.totalDowntimeMin > 0 ? 'text-rose-600' : 'text-emerald-600'
                }`}>
                  {formatMinutesAndHours(dailyFactoryTotals.totalDowntimeMin)}
                </p>
              </div>
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                dailyFactoryTotals.totalDowntimeMin > 0 ? 'bg-rose-50 text-rose-600' : 'bg-emerald-50 text-emerald-600'
              }`}>
                <Clock className="w-5 h-5" />
              </div>
            </div>

            <div className="bg-white border border-slate-200/90 rounded-2xl p-4 flex items-center justify-between shadow-xs">
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Ritmo Médio Fábrica</p>
                <p className="text-2xl font-black text-amber-600 mt-0.5">
                  {dailyFactoryTotals.averagePct}%
                </p>
              </div>
              <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center font-bold">
                <TrendingUp className="w-5 h-5" />
              </div>
            </div>

            <div className="bg-white border border-slate-200/90 rounded-2xl p-4 flex items-center justify-between shadow-xs">
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Máquinas em Operação</p>
                <p className="text-2xl font-black text-emerald-600 mt-0.5">
                  {dailyFactoryTotals.operatingCount} <span className="text-xs font-normal text-slate-400">de {machines.length}</span>
                </p>
              </div>
              <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                <Activity className="w-5 h-5" />
              </div>
            </div>
          </div>
        </section>

        {/* SEÇÃO 2: PRODUÇÃO POR TURNO NO DIA (Turno 1, Turno 2, Turno 3) */}
        {(dailyViewMode === 'ALL' || dailyViewMode === 'TURNOS') && (
          <section className="bg-white border border-slate-200/90 rounded-2xl p-5 sm:p-6 shadow-xs space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100">
              <div>
                <h2 className="text-base sm:text-lg font-black text-[#091428] tracking-tight flex items-center gap-2">
                  <Sun className="w-5 h-5 text-amber-500" />
                  Produção Diária por Turno de Trabalho
                </h2>
                <p className="text-xs text-slate-500">
                  Comparativo de entregas e paradas entre o Turno 1 (Manhã), Turno 2 (Tarde) e Turno 3 (Madrugada)
                </p>
              </div>
              <span className="font-mono text-xs font-bold text-slate-700 bg-slate-100 border border-slate-200 px-3 py-1.5 rounded-xl self-start sm:self-auto">
                Data: {selectedDayStr}
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {shiftProduction.map((sh, idx) => {
                const shiftTheme =
                  idx === 0
                    ? { bg: 'bg-amber-50/40 border-amber-200/90', badge: 'bg-amber-100 text-amber-900', bar: 'bg-amber-500' }
                    : idx === 1
                    ? { bg: 'bg-sky-50/40 border-sky-200/90', badge: 'bg-sky-100 text-sky-900', bar: 'bg-sky-500' }
                    : { bg: 'bg-indigo-50/40 border-indigo-200/90', badge: 'bg-indigo-100 text-indigo-900', bar: 'bg-indigo-500' };

                return (
                  <div
                    key={sh.id}
                    className={`rounded-2xl border p-5 flex flex-col justify-between shadow-2xs hover:shadow-xs transition-all relative overflow-hidden ${shiftTheme.bg}`}
                  >
                    <div className={`absolute top-0 left-0 right-0 h-1 ${shiftTheme.bar}`} />

                    <div>
                      <div className="flex items-center justify-between pb-3 border-b border-slate-200/70 pt-0.5">
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="text-sm font-black text-slate-900 tracking-tight">{sh.label}</h3>
                            <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-md ${shiftTheme.badge}`}>
                              {sh.hours}
                            </span>
                          </div>
                        </div>
                        <span className="font-mono text-lg font-black text-slate-900 tabular-nums">
                          {sh.pieces.toLocaleString('pt-BR')}{' '}
                          <span className="text-xs font-normal text-slate-600">pçs</span>
                        </span>
                      </div>

                      <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
                        <div className="bg-white/90 border border-slate-200/80 rounded-xl p-2.5">
                          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wide block">Corte</span>
                          <strong className="font-mono text-slate-900 text-sm font-black">{sh.corteM2.toFixed(1)} m²</strong>
                        </div>
                        <div className="bg-white/90 border border-slate-200/80 rounded-xl p-2.5">
                          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wide block">Coladeiras</span>
                          <strong className="font-mono text-slate-900 text-sm font-black">{sh.coladeiraMl.toFixed(1)} m</strong>
                        </div>
                        <div className="bg-white/90 border border-slate-200/80 rounded-xl p-2.5">
                          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wide block">Furadeiras</span>
                          <strong className="font-mono text-slate-900 text-sm font-black">{sh.furadeiraPcs} pçs</strong>
                        </div>
                        <div className="bg-white/90 border border-slate-200/80 rounded-xl p-2.5">
                          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wide block">Pintura UV</span>
                          <strong className="font-mono text-slate-900 text-sm font-black">{sh.uvM2.toFixed(1)} m²</strong>
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 pt-3 border-t border-slate-200/70 flex items-center justify-between text-xs">
                      <span className="text-slate-500 font-medium">Paradas no turno:</span>
                      <strong className={`font-mono font-black ${sh.downtimeMin > 0 ? 'text-rose-600' : 'text-emerald-700'}`}>
                        {sh.downtimeMin} min
                      </strong>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* SEÇÃO 3: CADÊNCIA HORÁRIA (Hora a Hora das 06:00 às 22:00) */}
        {(dailyViewMode === 'ALL' || dailyViewMode === 'HORARIO') && (
          <section className="bg-white border border-slate-200/90 rounded-2xl p-5 sm:p-6 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
              <div>
                <h2 className="text-base sm:text-lg font-black text-[#091428] tracking-tight flex items-center gap-2">
                  <Clock className="w-5 h-5 text-sky-600" />
                  Cadência de Produção Horária (Hora a Hora no Dia)
                </h2>
                <p className="text-xs text-slate-500">
                  Volume de peças entregues e paradas registradas ao longo das horas do expediente (06:00 às 22:00)
                </p>
              </div>
              <span className="font-mono text-xs font-black text-slate-700 bg-slate-100 border border-slate-200 px-3 py-1.5 rounded-xl self-start sm:self-auto">
                Pico: {hourlyCadence.maxPieces} pçs/hora
              </span>
            </div>

            <div className="overflow-x-auto pb-2">
              <div className="min-w-[700px] flex items-end justify-between gap-2.5 h-48 pt-6 px-3 border-b border-slate-200">
                {hourlyCadence.slots.map((s) => {
                  const heightPct =
                    hourlyCadence.maxPieces > 0
                      ? Math.max(8, Math.round((s.pieces / hourlyCadence.maxPieces) * 100))
                      : 8;
                  const hasDowntime = s.downtimeMin > 0;
                  return (
                    <div key={s.hour} className="flex-1 flex flex-col items-center h-full justify-end group">
                      <span className="text-[10px] font-mono font-bold text-slate-600 mb-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        {s.pieces}
                      </span>
                      <div
                        className={`w-full rounded-t-lg transition-all duration-300 relative shadow-2xs ${
                          s.pieces > 0
                            ? 'bg-[#091428] hover:bg-amber-500 cursor-pointer'
                            : 'bg-slate-100'
                        }`}
                        style={{ height: `${s.pieces > 0 ? heightPct : 4}%` }}
                        title={`Horário ${s.hourLabel}: ${s.pieces} peças · Corte: ${s.corteM2.toFixed(1)}m² · Coladeira: ${s.coladeiraMl.toFixed(1)}m · Paradas: ${s.downtimeMin}min`}
                      >
                        {hasDowntime && (
                          <span
                            className="absolute -top-2 left-1/2 -translate-x-1/2 w-2 h-2 rounded-full bg-rose-500 ring-2 ring-white"
                            title={`Parada: ${s.downtimeMin} min nesta hora`}
                          />
                        )}
                      </div>
                      <span className="text-[10px] font-mono font-bold text-slate-500 mt-2">
                        {s.hour}h
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between text-xs text-slate-500 pt-1">
              <div className="flex items-center gap-4">
                <span className="flex items-center gap-1.5 font-medium">
                  <span className="w-3 h-3 rounded-xs bg-[#091428]" /> Peças Produzidas
                </span>
                <span className="flex items-center gap-1.5 font-medium">
                  <span className="w-2.5 h-2.5 rounded-full bg-rose-500" /> Parada Registrada na Hora
                </span>
              </div>
              <span className="font-mono text-[11px] text-slate-400">Horário industrial contínuo das 06:00 às 22:00</span>
            </div>
          </section>
        )}

      {/* Confirmation Box for Resetting Operator Data */}
      {showResetConfirm && (
        <div className="bg-red-50 border border-red-300 rounded-xl p-4 sm:p-5 space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
              <div>
                <h2 className="text-sm font-bold text-red-900">
                  Zerar Dados Apontados pelos Operadores
                </h2>
                <p className="text-xs text-red-800 mt-0.5">
                  Esta ação apagará os registros de produção lançados nas máquinas e limpará o status de peça/lote atual em processamento nas 10 máquinas. Os cadastros de Módulos (PA), Peças e Máquinas serão mantidos intactos.
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-4 pt-2 border-t border-red-200/80">
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:gap-4 text-xs font-semibold text-red-900">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="resetScope"
                  checked={resetScope === 'ALL'}
                  onChange={() => setResetScope('ALL')}
                  className="accent-red-600"
                />
                Zerar todos os apontamentos ({logs.length} registros) + limpar lote atual das máquinas
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="resetScope"
                  checked={resetScope === 'TODAY'}
                  onChange={() => setResetScope('TODAY')}
                  className="accent-red-600"
                />
                Zerar apenas os apontamentos de hoje ({todayStr})
              </label>
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto">
              <button
                type="button"
                disabled={resetting}
                onClick={() => setShowResetConfirm(false)}
                className="flex-1 sm:flex-initial px-4 py-2 bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 text-xs font-semibold rounded-lg cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={resetting}
                onClick={handleConfirmReset}
                className="flex-1 sm:flex-initial px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-slate-400 text-white text-xs font-bold rounded-lg cursor-pointer"
              >
                {resetting ? 'Zerando...' : 'Confirmar e Zerar Agora'}
              </button>
            </div>
          </div>
        </div>
      )}

      {resetSuccessMsg && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-between gap-3 text-sm text-emerald-900">
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            <span className="font-medium text-xs sm:text-sm">{resetSuccessMsg}</span>
          </div>
          <button
            type="button"
            onClick={() => setResetSuccessMsg(null)}
            className="text-xs font-semibold text-emerald-800 underline whitespace-nowrap"
          >
            Fechar
          </button>
        </div>
      )}

      {/* 1. Primary Focal Anchor: MULTILINEA Gauge Dashboard (Exact Packaging Chart Layout) */}
      {(dailyViewMode === 'ALL' || dailyViewMode === 'GAUGES') && (
        <section aria-label="Painel Velocímetro Previsto x Realizado por Linha">
        {/* Sector Switcher Pills — smoothly scrollable on mobile */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-1.5 sm:gap-2 overflow-x-auto pb-1.5 scrollbar-none sm:flex-wrap w-full sm:w-auto -mx-1 px-1">
            {sectorComparisonCards.map((sec) => {
              const isSelected = selectedGaugeSector === sec.id;
              const getSecAccent = () => {
                if (sec.id === 'SECCIONADORA') return { active: 'bg-blue-600 text-white border-blue-600 shadow-xs', badge: 'bg-blue-700 text-white' };
                if (sec.id === 'COLADEIRA') return { active: 'bg-emerald-600 text-white border-emerald-600 shadow-xs', badge: 'bg-emerald-700 text-white' };
                if (sec.id === 'FURADEIRA') return { active: 'bg-sky-600 text-white border-sky-600 shadow-xs', badge: 'bg-sky-700 text-white' };
                return { active: 'bg-amber-600 text-white border-amber-600 shadow-xs', badge: 'bg-amber-700 text-white' };
              };
              const accent = getSecAccent();
              return (
                <button
                  key={sec.id}
                  type="button"
                  onClick={() => setSelectedGaugeSector(sec.id)}
                  className={`px-3.5 py-2 sm:py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer flex items-center gap-2 shrink-0 whitespace-nowrap border ${
                    isSelected
                      ? `${accent.active}`
                      : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50 hover:text-slate-900 shadow-xs'
                  }`}
                >
                  <span>{sec.label}</span>
                  <span
                    className={`font-mono text-[11px] px-2 py-0.5 rounded-md ${
                      isSelected ? accent.badge : 'bg-slate-100 text-slate-600 border border-slate-200'
                    }`}
                  >
                    {sec.primaryMetricUnit}
                  </span>
                </button>
              );
            })}
            <button
              type="button"
              onClick={() => setSelectedGaugeSector('ALL')}
              className={`px-3.5 py-2 sm:py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer shrink-0 whitespace-nowrap border ${
                selectedGaugeSector === 'ALL'
                  ? 'bg-slate-900 text-amber-400 border-slate-900 shadow-xs'
                  : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50 hover:text-slate-900 shadow-xs'
              }`}
            >
              4 Linhas Simultâneas
            </button>
          </div>

          <button
            type="button"
            onClick={handleEnterPresentationMode}
            className="w-full sm:w-auto px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-amber-400 border border-slate-800 rounded-xl text-xs sm:text-sm font-bold flex items-center justify-center gap-2 transition-all cursor-pointer shadow-xs whitespace-nowrap"
          >
            <Tv className="w-4 h-4 shrink-0 text-amber-400" />
            <span>Modo TV (Tela Cheia)</span>
          </button>
        </div>

        {/* High-Tech Industrial Gauge Board for the Selected Sector (or all 4 stacked) */}
        <div className="space-y-6 sm:space-y-8">
          {(selectedGaugeSector === 'ALL'
            ? sectorComparisonCards
            : sectorComparisonCards.filter((c) => c.id === selectedGaugeSector)
          ).map((card) => {
            const decimals = card.id === 'FURADEIRA' ? 0 : 1;
            const remainingFormatted =
              card.signedRemainingDaily >= 0
                ? `+${card.signedRemainingDaily.toLocaleString('pt-BR', {
                    minimumFractionDigits: 0,
                    maximumFractionDigits: decimals,
                  })}`
                : card.signedRemainingDaily.toLocaleString('pt-BR', {
                    minimumFractionDigits: 0,
                    maximumFractionDigits: decimals,
                  });

            return (
              <div
                key={card.id}
                className="relative bg-white border border-slate-200/90 rounded-2xl p-4 sm:p-6 shadow-xs space-y-4"
              >
                {/* Modern Integrated Sector Header */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50 border border-slate-200 rounded-xl p-3.5 sm:px-6 shadow-xs">
                  <div className="flex items-center gap-3">
                    <div className={`w-3 h-3 rounded-full shrink-0 ${
                      card.id === 'SECCIONADORA' ? 'bg-blue-600' :
                      card.id === 'COLADEIRA' ? 'bg-emerald-600' :
                      card.id === 'FURADEIRA' ? 'bg-sky-600' : 'bg-amber-500'
                    }`} />
                    <div>
                      <h2 className="text-base sm:text-xl font-bold tracking-tight text-slate-900 uppercase">
                        Multilinea — {card.shortLabel}
                      </h2>
                      <p className="text-[11px] sm:text-xs text-slate-500 font-medium">
                        Unidade Oficial: <strong className="text-slate-800">{card.primaryMetricUnit}</strong> · {longDatePt}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
                    {/* Seletor específico dos 2 Dashboards para o Setor de CORTE */}
                    {card.id === 'SECCIONADORA' && (
                      <div className="flex items-center gap-1 bg-slate-200/70 p-1 rounded-xl overflow-x-auto">
                        <button
                          type="button"
                          onClick={() => setCorteViewMode('SPLIT_BOTH')}
                          className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1 whitespace-nowrap ${
                            corteViewMode === 'SPLIT_BOTH'
                              ? 'bg-white text-slate-900 shadow-xs'
                              : 'text-slate-600 hover:text-slate-900'
                          }`}
                          title="Exibir os 2 dashboards lado a lado"
                        >
                          <Split className="w-3.5 h-3.5 text-blue-600" />
                          <span>Painel Unificado (MDF + Fundo)</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setCorteViewMode('MDF')}
                          className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                            corteViewMode === 'MDF'
                              ? 'bg-white text-slate-900 shadow-xs'
                              : 'text-slate-600 hover:text-slate-900'
                          }`}
                        >
                          🪵 Apenas MDF
                        </button>
                        <button
                          type="button"
                          onClick={() => setCorteViewMode('FUNDO')}
                          className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                            corteViewMode === 'FUNDO'
                              ? 'bg-white text-slate-900 shadow-xs'
                              : 'text-slate-600 hover:text-slate-900'
                          }`}
                        >
                          📦 Apenas Fundo
                        </button>
                        <button
                          type="button"
                          onClick={() => setCorteViewMode('ALL')}
                          className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                            corteViewMode === 'ALL'
                              ? 'bg-white text-slate-900 shadow-xs'
                              : 'text-slate-600 hover:text-slate-900'
                          }`}
                        >
                          📊 Consolidado
                        </button>
                      </div>
                    )}

                    {card.id === 'SECCIONADORA' && onOpenCorteReport && (
                      <button
                        type="button"
                        onClick={onOpenCorteReport}
                        className="px-2.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 whitespace-nowrap bg-blue-600 hover:bg-blue-500 text-white shadow-xs"
                        title="Extrair Relatório de Corte por Período & Gráficos"
                      >
                        <BarChart3 className="w-3.5 h-3.5 text-blue-200" />
                        <span>Extrair por Período & Gráficos</span>
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => {
                        setSelectedGaugeSector(card.id);
                        if (card.id === 'SECCIONADORA' && corteViewMode === 'SPLIT_BOTH') {
                          handleEnterPresentationMode('CORTE_SPLIT');
                        } else {
                          handleEnterPresentationMode('SINGLE');
                        }
                      }}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 rounded-lg text-xs font-bold shadow-xs cursor-pointer transition-colors"
                      title={`Apresentar ${card.shortLabel} em tela cheia`}
                    >
                      <Maximize2 className="w-3.5 h-3.5 text-slate-600" />
                      Modo TV
                    </button>
                  </div>
                </div>

                {/* Corpo do Dashboard: Modo SPLIT_BOTH (Painel Unificado de Corte: MDF + Fundo) */}
                {card.id === 'SECCIONADORA' && corteViewMode === 'SPLIT_BOTH' && card.corteSubDashboards ? (
                  (() => {
                    const mdf = card.corteSubDashboards.mdf;
                    const fundo = card.corteSubDashboards.fundo;
                    const totalDailyM2 = mdf.doneTodayPrimary + fundo.doneTodayPrimary;
                    const totalDailyTarget = mdf.targetPrimary + fundo.targetPrimary;
                    const totalDailyPieces = mdf.doneTodayPieces + fundo.doneTodayPieces;
                    const totalDailyPct = totalDailyTarget > 0 ? Math.round((totalDailyM2 / totalDailyTarget) * 100) : 0;

                    const totalMonthlyM2 = mdf.doneMonthPrimary + fundo.doneMonthPrimary;
                    const totalMonthlyTarget = mdf.targetMonthly + fundo.targetMonthly;
                    const totalMonthlyPct = totalMonthlyTarget > 0 ? Math.round((totalMonthlyM2 / totalMonthlyTarget) * 100) : 0;

                    return (
                      <div className="space-y-4">
                        {/* 1º GRÁFICOS PRINCIPAIS COM RESULTADOS DO DIA:
                            - ESQUERDA: CORTE DE MDF NO DIA (9, 15, 18 e 25mm)
                            - DIREITA: CORTE DE FUNDO NO DIA (2,5mm / Costas)
                            FOCO TOTAL NO REALIZADO COM GRÁFICOS GRANDES E IMPACTANTES */}
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-5">
                          <CorteDailyHeroCard
                            title="Corte de MDF"
                            materialSpec="9, 15, 18 e 25mm"
                            machineNote="Painéis Estruturais · Giben + Selco"
                            icon="🪵"
                            theme="sky"
                            doneTodayPrimary={mdf.doneTodayPrimary}
                            targetDaily={mdf.targetPrimary}
                            doneTodayPieces={mdf.doneTodayPieces}
                            signedRemainingDaily={mdf.signedRemainingDaily}
                            pctPrimary={mdf.pctPrimary}
                            isTvMode={false}
                          />

                          <CorteDailyHeroCard
                            title="Corte de Fundo"
                            materialSpec="2,5mm / Costas"
                            machineNote="Chapas Finas · Giben + Selco"
                            icon="📦"
                            theme="amber"
                            doneTodayPrimary={fundo.doneTodayPrimary}
                            targetDaily={fundo.targetPrimary}
                            doneTodayPieces={fundo.doneTodayPieces}
                            signedRemainingDaily={fundo.signedRemainingDaily}
                            pctPrimary={fundo.pctPrimary}
                            isTvMode={false}
                          />
                        </div>

                        {/* 2º ACOMPANHAMENTO MENSAL DISCRETO E COMPACTO NA PARTE INFERIOR */}
                        <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 sm:p-3.5 space-y-2">
                          <div className="flex items-center justify-between pb-1.5 border-b border-slate-200">
                            <div className="flex items-center gap-1.5">
                              <Calendar className="w-3.5 h-3.5 text-slate-400" />
                              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-700">
                                ACOMPANHAMENTO MENSAL ACUMULADO
                              </span>
                              <span className="text-[9px] font-semibold text-slate-500 hidden sm:inline">
                                (Visão secundária do mês)
                              </span>
                            </div>
                            <span className="text-[10px] font-semibold text-slate-500 capitalize">
                              Mês de {nowDate.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}
                            </span>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
                            {/* MDF Mensal */}
                            <div className="bg-slate-50 border border-slate-200 rounded-lg p-2.5 flex flex-col justify-between">
                              <div className="flex items-center justify-between text-[11px]">
                                <span className="font-bold text-slate-800 flex items-center gap-1">
                                  <span>🪵</span> MDF Mensal (9, 15, 18, 25mm)
                                </span>
                                <span className={`text-[11px] font-bold px-1.5 py-0.2 rounded ${
                                  mdf.pctMonthly >= 70 ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-blue-50 text-blue-800 border border-blue-200'
                                }`}>
                                  {mdf.pctMonthly}%
                                </span>
                              </div>
                              <div className="flex items-baseline justify-between mt-1 text-[11px]">
                                <span className="font-bold text-slate-900">
                                  {mdf.doneMonthPrimary.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} <span className="text-[9px] text-slate-500">m²</span>
                                </span>
                                <span className="text-[10px] text-slate-500">
                                  Meta: <strong className="text-slate-800">{mdf.targetMonthly.toLocaleString('pt-BR')} m²</strong>
                                </span>
                              </div>
                              <div className="w-full h-1.5 bg-slate-200 rounded-full overflow-hidden mt-1.5">
                                <div
                                  className={`h-full rounded-full transition-all duration-500 ${
                                    mdf.pctMonthly >= 70 ? 'bg-emerald-500' : 'bg-blue-600'
                                  }`}
                                  style={{ width: `${Math.min(100, Math.max(2, mdf.pctMonthly))}%` }}
                                />
                              </div>
                            </div>

                            {/* Fundo Mensal */}
                            <div className="bg-slate-50 border border-slate-200 rounded-lg p-2.5 flex flex-col justify-between">
                              <div className="flex items-center justify-between text-[11px]">
                                <span className="font-bold text-slate-800 flex items-center gap-1">
                                  <span>📦</span> Fundo Mensal (2,5mm / Costas)
                                </span>
                                <span className={`text-[11px] font-bold px-1.5 py-0.2 rounded ${
                                  fundo.pctMonthly >= 70 ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-amber-50 text-amber-900 border border-amber-200'
                                }`}>
                                  {fundo.pctMonthly}%
                                </span>
                              </div>
                              <div className="flex items-baseline justify-between mt-1 text-[11px]">
                                <span className="font-bold text-slate-900">
                                  {fundo.doneMonthPrimary.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} <span className="text-[9px] text-slate-500">m²</span>
                                </span>
                                <span className="text-[10px] text-slate-500">
                                  Meta: <strong className="text-slate-800">{fundo.targetMonthly.toLocaleString('pt-BR')} m²</strong>
                                </span>
                              </div>
                              <div className="w-full h-1.5 bg-slate-200 rounded-full overflow-hidden mt-1.5">
                                <div
                                  className={`h-full rounded-full transition-all duration-500 ${
                                    fundo.pctMonthly >= 70 ? 'bg-emerald-500' : 'bg-amber-500'
                                  }`}
                                  style={{ width: `${Math.min(100, Math.max(2, fundo.pctMonthly))}%` }}
                                />
                              </div>
                            </div>

                            {/* Total Consolidado Mensal */}
                            <div className="bg-slate-50 border border-slate-200 rounded-lg p-2.5 flex flex-col justify-between">
                              <div className="flex items-center justify-between text-[11px]">
                                <span className="font-bold text-slate-800 flex items-center gap-1">
                                  <span>📊</span> Consolidado Mensal
                                </span>
                                <span className={`text-[11px] font-bold px-1.5 py-0.2 rounded ${
                                  totalMonthlyPct >= 70 ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-slate-100 text-slate-800 border border-slate-200'
                                }`}>
                                  {totalMonthlyPct}%
                                </span>
                              </div>
                              <div className="flex items-baseline justify-between mt-1 text-[11px]">
                                <span className="font-bold text-slate-900">
                                  {totalMonthlyM2.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} <span className="text-[9px] text-slate-500">m²</span>
                                </span>
                                <span className="text-[10px] text-slate-500">
                                  Meta: <strong className="text-slate-800">{totalMonthlyTarget.toLocaleString('pt-BR')} m²</strong>
                                </span>
                              </div>
                              <div className="w-full h-1.5 bg-slate-200 rounded-full overflow-hidden mt-1.5">
                                <div
                                  className="h-full rounded-full bg-slate-700 transition-all duration-500"
                                  style={{ width: `${Math.min(100, Math.max(2, totalMonthlyPct))}%` }}
                                />
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })()
                ) : card.id === 'SECCIONADORA' && corteViewMode === 'MDF' && card.corteSubDashboards ? (
                  /* Modo Exclusivo MDF: Apenas Acompanhamento Diário no topo */
                  <div className="space-y-4">
                    <CorteDailyHeroCard
                      title="Corte de MDF"
                      materialSpec="9, 15, 18 e 25mm"
                      machineNote="Painéis Estruturais · Giben + Selco"
                      icon="🪵"
                      theme="sky"
                      doneTodayPrimary={card.corteSubDashboards.mdf.doneTodayPrimary}
                      targetDaily={card.corteSubDashboards.mdf.targetPrimary}
                      doneTodayPieces={card.corteSubDashboards.mdf.doneTodayPieces}
                      signedRemainingDaily={card.corteSubDashboards.mdf.signedRemainingDaily}
                      pctPrimary={card.corteSubDashboards.mdf.pctPrimary}
                      isTvMode={false}
                    />

                    {/* Acompanhamento Mensal na parte baixa */}
                    <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-3 text-slate-800">
                      <div className="flex items-center gap-2.5 shrink-0">
                        <Calendar className="w-5 h-5 text-slate-500" />
                        <div>
                          <h4 className="text-sm font-bold uppercase tracking-wider text-slate-800">
                            Acompanhamento Mensal — MDF (9, 15, 18 e 25mm)
                          </h4>
                          <p className="text-xs text-slate-500 capitalize">
                            Mês de {nowDate.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}
                          </p>
                        </div>
                      </div>

                      <div className="flex-1 w-full sm:max-w-md flex flex-col justify-center px-2">
                        <div className="flex items-baseline justify-between text-xs mb-1.5">
                          <span className="font-bold text-slate-900 text-sm">
                            {card.corteSubDashboards.mdf.doneMonthPrimary.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} <span className="text-[11px] text-slate-500">m² realizados</span>
                          </span>
                          <span className="text-xs font-medium text-slate-500">
                            Meta: <strong className="text-slate-800">{card.corteSubDashboards.mdf.targetMonthly.toLocaleString('pt-BR')} m²</strong>
                          </span>
                        </div>
                        <div className="w-full h-2.5 bg-slate-200 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-500 ${
                              card.corteSubDashboards.mdf.pctMonthly >= 70 ? 'bg-emerald-500' : 'bg-blue-600'
                            }`}
                            style={{ width: `${Math.min(100, Math.max(2, card.corteSubDashboards.mdf.pctMonthly))}%` }}
                          />
                        </div>
                      </div>

                      <div className="shrink-0 text-right">
                        <span className={`inline-flex items-center text-sm font-bold px-3 py-1.5 rounded-xl border ${
                          card.corteSubDashboards.mdf.pctMonthly >= 70 ? 'bg-emerald-50 text-emerald-800 border-emerald-200' : 'bg-blue-50 text-blue-800 border-blue-200'
                        }`}>
                          {card.corteSubDashboards.mdf.pctMonthly}% do mês atingido
                        </span>
                      </div>
                    </div>
                  </div>
                ) : card.id === 'SECCIONADORA' && corteViewMode === 'FUNDO' && card.corteSubDashboards ? (
                  /* Modo Exclusivo Fundo: Apenas Acompanhamento Diário no topo */
                  <div className="space-y-4">
                    <CorteDailyHeroCard
                      title="Corte de Fundo"
                      materialSpec="2,5mm / Costas"
                      machineNote="Chapas Finas · Giben + Selco"
                      icon="📦"
                      theme="amber"
                      doneTodayPrimary={card.corteSubDashboards.fundo.doneTodayPrimary}
                      targetDaily={card.corteSubDashboards.fundo.targetPrimary}
                      doneTodayPieces={card.corteSubDashboards.fundo.doneTodayPieces}
                      signedRemainingDaily={card.corteSubDashboards.fundo.signedRemainingDaily}
                      pctPrimary={card.corteSubDashboards.fundo.pctPrimary}
                      isTvMode={false}
                    />

                    {/* Acompanhamento Mensal na parte baixa */}
                    <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-3 text-slate-800">
                      <div className="flex items-center gap-2.5 shrink-0">
                        <Calendar className="w-5 h-5 text-amber-500" />
                        <div>
                          <h4 className="text-sm font-bold uppercase tracking-wider text-slate-800">
                            Acompanhamento Mensal — Fundo (2,5mm / Costas)
                          </h4>
                          <p className="text-xs text-slate-500 capitalize">
                            Mês de {nowDate.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}
                          </p>
                        </div>
                      </div>

                      <div className="flex-1 w-full sm:max-w-md flex flex-col justify-center px-2">
                        <div className="flex items-baseline justify-between text-xs mb-1.5">
                          <span className="font-bold text-slate-900 text-sm">
                            {card.corteSubDashboards.fundo.doneMonthPrimary.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} <span className="text-[11px] text-slate-500">m² realizados</span>
                          </span>
                          <span className="text-xs font-medium text-slate-500">
                            Meta: <strong className="text-slate-800">{card.corteSubDashboards.fundo.targetMonthly.toLocaleString('pt-BR')} m²</strong>
                          </span>
                        </div>
                        <div className="w-full h-2.5 bg-slate-200 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-500 ${
                              card.corteSubDashboards.fundo.pctMonthly >= 70 ? 'bg-emerald-500' : 'bg-amber-500'
                            }`}
                            style={{ width: `${Math.min(100, Math.max(2, card.corteSubDashboards.fundo.pctMonthly))}%` }}
                          />
                        </div>
                      </div>

                      <div className="shrink-0 text-right">
                        <span className={`inline-flex items-center text-sm font-bold px-3 py-1.5 rounded-xl border ${
                          card.corteSubDashboards.fundo.pctMonthly >= 70 ? 'bg-emerald-50 text-emerald-800 border-emerald-200' : 'bg-amber-50 text-amber-900 border border-amber-200'
                        }`}>
                          {card.corteSubDashboards.fundo.pctMonthly}% do mês atingido
                        </span>
                      </div>
                    </div>
                  </div>
                ) : (
                  /* Modo Padrão / Consolidado (ou outros setores): SOMENTE Acompanhamento Diário no topo */
                  <div className="space-y-4">
                    {/* Top: Apenas o Gráfico de Acompanhamento Diário */}
                    <div className="flex justify-center w-full">
                      <div className="w-full max-w-3xl">
                        <SemicircleGaugeCard
                          title="Acompanhamento Diário"
                          currentValue={card.doneTodayPrimary}
                          targetValue={card.targetPrimary}
                          unitLabel={card.primaryMetricUnit}
                          decimals={decimals}
                          isMonthly={false}
                        />
                      </div>
                    </div>

                    {/* KPIs Diários */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 sm:gap-3.5">
                      <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3 sm:p-4 flex flex-col items-center justify-center text-center shadow-xs">
                        <span className="text-[11px] sm:text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
                          Meta Diária
                        </span>
                        <span className={`${getKpiValueSize(card.targetPrimary.toLocaleString('pt-BR'))} font-black text-slate-900 tabular-nums`}>
                          {card.targetPrimary.toLocaleString('pt-BR')} <span className="text-xs text-slate-500">{card.primaryMetricShort}</span>
                        </span>
                      </div>

                      <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3 sm:p-4 flex flex-col items-center justify-center text-center shadow-xs">
                        <span className="text-[11px] sm:text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
                          Realizado Hoje
                        </span>
                        <span className={`${getKpiValueSize(card.doneTodayPrimary.toLocaleString('pt-BR'))} font-black text-slate-900 tabular-nums`}>
                          {card.doneTodayPrimary.toLocaleString('pt-BR', { maximumFractionDigits: decimals })} <span className="text-xs text-slate-500">{card.primaryMetricShort}</span>
                        </span>
                      </div>

                      <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3 sm:p-4 flex flex-col items-center justify-center text-center shadow-xs">
                        <span className="text-[11px] sm:text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
                          Saldo Restante
                        </span>
                        <span className={`${getKpiValueSize(remainingFormatted)} font-black tabular-nums ${
                          card.signedRemainingDaily < 0 ? 'text-rose-600' : 'text-emerald-600'
                        }`}>
                          {remainingFormatted} <span className="text-xs text-slate-400">{card.primaryMetricShort}</span>
                        </span>
                      </div>
                    </div>

                    {/* Acompanhamento Mensal na parte baixa do dashboard */}
                    <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-3 text-slate-800">
                      <div className="flex items-center gap-2.5 shrink-0">
                        <Calendar className="w-5 h-5 text-slate-500" />
                        <div>
                          <h4 className="text-sm font-bold uppercase tracking-wider text-slate-800">
                            Acompanhamento Mensal — {card.shortLabel}
                          </h4>
                          <p className="text-xs text-slate-500 capitalize">
                            Mês de {nowDate.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}
                          </p>
                        </div>
                      </div>

                      <div className="flex-1 w-full sm:max-w-md flex flex-col justify-center px-2">
                        <div className="flex items-baseline justify-between text-xs mb-1.5">
                          <span className="font-bold text-slate-900 text-sm">
                            {card.doneMonthPrimary.toLocaleString('pt-BR', { maximumFractionDigits: decimals })} <span className="text-[11px] text-slate-500">{card.primaryMetricShort} realizados</span>
                          </span>
                          <span className="text-xs font-medium text-slate-500">
                            Meta: <strong className="text-slate-800">{card.targetMonthly.toLocaleString('pt-BR')} {card.primaryMetricShort}</strong>
                          </span>
                        </div>
                        <div className="w-full h-2.5 bg-slate-200 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-500 ${
                              card.pctMonthly >= 70 ? 'bg-emerald-500' : 'bg-blue-600'
                            }`}
                            style={{ width: `${Math.min(100, Math.max(2, card.pctMonthly))}%` }}
                          />
                        </div>
                      </div>

                      <div className="shrink-0 text-right">
                        <span className={`inline-flex items-center text-sm font-bold px-3 py-1.5 rounded-xl border ${
                          card.pctMonthly >= 70 ? 'bg-emerald-50 text-emerald-800 border-emerald-200' : 'bg-blue-50 text-blue-800 border-blue-200'
                        }`}>
                          {card.pctMonthly}% do mês atingido
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Strip de Tempo de Parada por Máquina deste Setor */}
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 sm:px-4 sm:py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 shadow-2xs">
                  <div className="flex flex-wrap items-center gap-2">
                    <Clock className="w-4 h-4 text-rose-500 shrink-0" />
                    <span className="text-xs font-bold text-slate-800 uppercase">
                      Tempo de Parada — {card.shortLabel}:
                    </span>
                    <span className="text-xs font-bold px-2 py-0.5 rounded-md bg-rose-50 text-rose-700 border border-rose-200">
                      Hoje: {formatMinutesAndHours(card.downtimeTodayMinutes)}
                    </span>
                    <span className="text-xs font-semibold text-slate-500">
                      · Mês: {formatMinutesAndHours(card.downtimeMonthMinutes)}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {card.machinesDowntimeToday.map((m) => (
                      <span
                        key={m.id}
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs ${
                          m.downtimeTodayMin > 0
                            ? 'bg-rose-50 border-rose-200 text-rose-700 font-bold'
                            : 'bg-white border-slate-200 text-slate-700'
                        }`}
                      >
                        <span
                          className={`w-2 h-2 rounded-full ${
                            m.status === 'OPERANDO'
                              ? 'bg-emerald-500'
                              : m.status === 'SETUP'
                              ? 'bg-amber-500'
                              : 'bg-rose-600'
                          }`}
                        />
                        <span className="font-semibold">{m.name}:</span>
                        <span>{m.downtimeTodayMin} min</span>
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Quick Overview Strip of all 4 Sectors */}
        {selectedGaugeSector !== 'ALL' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mt-4">
            {sectorComparisonCards.map((card) => {
              const isSelected = selectedGaugeSector === card.id;
              return (
                <button
                  key={card.id}
                  type="button"
                  onClick={() => setSelectedGaugeSector(card.id)}
                  className={`p-4 rounded-xl border text-left transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-slate-900 text-white border-slate-900 shadow-md ring-2 ring-amber-400'
                      : 'bg-white text-slate-800 border-slate-200/90 hover:border-slate-300 hover:shadow-xs'
                  }`}
                >
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold uppercase tracking-wide">{card.shortLabel}</span>
                    <span
                      className={`font-semibold ${
                        isSelected ? 'text-amber-400' : 'text-slate-500'
                      }`}
                    >
                      Dia: {card.pctPrimary}% · Mês: {card.pctMonthly}%
                    </span>
                  </div>
                  <p className="text-sm font-black mt-1.5 tabular-nums">
                    {card.doneTodayPrimary.toLocaleString('pt-BR', {
                      maximumFractionDigits: card.id === 'FURADEIRA' ? 0 : 1,
                    })}{' '}
                    / {card.targetPrimary.toLocaleString('pt-BR')} {card.primaryMetricShort}
                  </p>
                  <p
                    className={`text-[11px] mt-1 font-medium ${
                      isSelected
                        ? 'text-rose-300'
                        : card.downtimeTodayMinutes > 0
                        ? 'text-rose-600'
                        : 'text-slate-400'
                    }`}
                  >
                    Paradas Hoje: {card.downtimeTodayMinutes} min · Mês: {card.downtimeMonthMinutes} min
                  </p>
                </button>
              );
            })}
          </div>
        )}
      </section>
      )}

      {/* 2. Painel de Tempo de Parada por Setor, Máquina e Motivo (P1 a P22) */}
      {(dailyViewMode === 'ALL' || dailyViewMode === 'PARADAS') && (
        <section className="bg-white border border-slate-200/90 rounded-2xl p-5 sm:p-6 shadow-xs space-y-6 text-slate-900">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-100">
          <div className="flex items-start gap-2.5">
            <Clock className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
            <div>
              <h2 className="text-base sm:text-lg font-bold text-slate-900 tracking-tight">
                Tempo de Parada por Setor e Máquina (Ineficiências P1 a P22)
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Acompanhe os minutos e horas paradas em cada linha produtiva, máquina e os principais códigos de ineficiência
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Filtro de Período: Hoje / Mês / Geral */}
            <div className="inline-flex items-center bg-slate-100 p-1 rounded-xl">
              <button
                type="button"
                onClick={() => setDowntimePeriod('TODAY')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  downtimePeriod === 'TODAY'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Hoje ({todayStr})
              </button>
              <button
                type="button"
                onClick={() => setDowntimePeriod('MONTH')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  downtimePeriod === 'MONTH'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Neste Mês
              </button>
              <button
                type="button"
                onClick={() => setDowntimePeriod('ALL')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  downtimePeriod === 'ALL'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Acumulado Geral
              </button>
            </div>

            <span className="text-xs font-bold px-3.5 py-1.5 rounded-xl bg-rose-50 text-rose-700 border border-rose-200">
              Total Parado: {formatMinutesAndHours(inefficiencySummary.totalMinutesAll)} ({inefficiencySummary.totalOccurrences}{' '}
              {inefficiencySummary.totalOccurrences === 1 ? 'parada' : 'paradas'})
            </span>
          </div>
        </div>

        {/* 2.1. Cards dos 4 Setores com Desdobramento por Máquina */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Tempo Parado por Linha / Setor e Equipamento
            </h3>
            {selectedDowntimeSector !== 'ALL' && (
              <button
                type="button"
                onClick={() => setSelectedDowntimeSector('ALL')}
                className="text-xs font-bold text-amber-600 hover:text-amber-700 underline cursor-pointer"
              >
                Mostrar Todos os 4 Setores
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
            {inefficiencySummary.bySector.map((secData) => {
              const isSelected = selectedDowntimeSector === secData.sector.id;
              const sectorColor =
                secData.sector.id === 'SECCIONADORA'
                  ? 'border-sky-500'
                  : secData.sector.id === 'COLADEIRA'
                  ? 'border-emerald-500'
                  : secData.sector.id === 'FURADEIRA'
                  ? 'border-indigo-500'
                  : 'border-amber-500';

              return (
                <div
                  key={secData.sector.id}
                  onClick={() =>
                    setSelectedDowntimeSector(
                      isSelected ? 'ALL' : secData.sector.id
                    )
                  }
                  className={`rounded-2xl border p-4 sm:p-5 flex flex-col justify-between transition-all cursor-pointer relative overflow-hidden ${
                    isSelected
                      ? 'bg-rose-50/60 border-rose-300 ring-2 ring-rose-200 shadow-xs'
                      : 'bg-white border-slate-200/90 hover:border-slate-300 shadow-xs'
                  }`}
                >
                  <div className={`absolute top-0 left-0 right-0 h-1 border-t-2 ${sectorColor}`} />

                  <div>
                    {/* Cabeçalho do Setor */}
                    <div className="flex items-start justify-between gap-2 pb-2.5 border-b border-slate-100 pt-0.5">
                      <div>
                        <span className="text-xs font-bold uppercase text-slate-900 block tracking-wide">
                          {secData.sector.label}
                        </span>
                        <span className="text-[11px] text-slate-500">
                          {secData.occurrences}{' '}
                          {secData.occurrences === 1 ? 'ocorrência' : 'ocorrências'} ({secData.sharePct}% do total)
                        </span>
                      </div>
                      <div className="text-right">
                        <span
                          className={`text-base font-black tabular-nums ${
                            secData.minutes > 0 ? 'text-rose-600' : 'text-emerald-600'
                          }`}
                        >
                          {secData.minutes} min
                        </span>
                        {secData.minutes >= 60 && (
                          <span className="block text-[10px] font-bold text-rose-500">
                            {Math.floor(secData.minutes / 60)}h {secData.minutes % 60}m
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Lista de Máquinas dentro do Setor */}
                    <div className="mt-3 space-y-2">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                        Tempo Parado por Máquina:
                      </p>
                      {secData.machines.map((mItem) => {
                        const pctOfSector =
                          secData.minutes > 0
                            ? Math.round((mItem.minutes / secData.minutes) * 100)
                            : 0;
                        return (
                          <div
                            key={mItem.machine.id}
                            className="bg-slate-50 rounded-xl p-2.5 text-xs"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-1.5 min-w-0">
                                <span
                                  className={`w-2 h-2 rounded-full shrink-0 ${
                                    mItem.machine.status === 'OPERANDO'
                                      ? 'bg-emerald-500'
                                      : mItem.machine.status === 'SETUP'
                                      ? 'bg-amber-500'
                                      : 'bg-rose-500'
                                  }`}
                                />
                                <span className="font-bold text-slate-800 truncate">
                                  {mItem.machine.name}
                                </span>
                              </div>
                              <span
                                className={`font-bold shrink-0 ${
                                  mItem.minutes > 0 ? 'text-rose-600' : 'text-emerald-600'
                                }`}
                              >
                                {mItem.minutes} min
                              </span>
                            </div>

                            {/* Barra proporcional e principal motivo da máquina */}
                            {mItem.minutes > 0 ? (
                              <div className="mt-1.5 space-y-1">
                                <div className="w-full h-1.5 bg-slate-200 rounded-full overflow-hidden">
                                  <div
                                    className="h-full bg-rose-500 rounded-full"
                                    style={{ width: `${Math.max(8, pctOfSector)}%` }}
                                  />
                                </div>
                                <div className="flex items-center justify-between text-[11px] text-slate-500">
                                  <span>
                                    {mItem.occurrences}{' '}
                                    {mItem.occurrences === 1 ? 'parada' : 'paradas'}
                                  </span>
                                  {mItem.topReason && (
                                    <span className="font-semibold text-rose-600 truncate max-w-[160px]">
                                      Maior: {mItem.topReason.code} ({mItem.topReason.min}m)
                                    </span>
                                  )}
                                </div>
                              </div>
                            ) : (
                              <p className="text-[11px] text-emerald-600 font-medium mt-1">
                                Sem paradas no período
                              </p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Maior motivo do setor no rodapé do card */}
                  <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between text-[11px]">
                    <span className="text-slate-500 font-medium">Maior ofensor:</span>
                    {secData.topReason ? (
                      <span className="font-bold text-rose-600 truncate max-w-[180px]">
                        {secData.topReason.code} — {secData.topReason.name} ({secData.topReason.min}m)
                      </span>
                    ) : (
                      <span className="text-emerald-600 font-semibold">0 min parado</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* 2.2. Ranking de Motivos de Parada P1 a P22 */}
        <div className="pt-2 border-t border-slate-100">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Ranking de Motivos de Ineficiência · P1 a P22{' '}
              {selectedDowntimeSector !== 'ALL' &&
                `— Filtrado: ${SECTORS[selectedDowntimeSector].label}`}
            </h3>
          </div>

          {inefficiencySummary.ranked.length === 0 ? (
            <div className="py-6 text-center text-xs text-slate-500 bg-slate-50 rounded-xl">
              Nenhuma parada por ineficiência (P1 a P22) apontada neste período/setor.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {inefficiencySummary.ranked.slice(0, 8).map((item) => {
                const sharePct =
                  inefficiencySummary.totalMinutesAll > 0
                    ? Math.round((item.minutes / inefficiencySummary.totalMinutesAll) * 100)
                    : 0;
                return (
                  <div
                    key={item.code}
                    className="p-4 bg-slate-50 border border-slate-200/90 rounded-2xl flex flex-col justify-between hover:border-slate-300 transition-all shadow-xs"
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-200">
                        <span className="text-xs font-bold px-2.5 py-0.5 rounded-md bg-white text-slate-900 border border-slate-200 shadow-2xs">
                          {item.code}
                        </span>
                        <span className="text-xs font-bold text-rose-600">
                          {item.minutes} min ({sharePct}%)
                        </span>
                      </div>
                      <p className="text-xs font-bold text-slate-900 mt-2 leading-snug">
                        {item.name}
                      </p>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-3 pt-2 border-t border-slate-200">
                      {item.occurrences}{' '}
                      {item.occurrences === 1 ? 'parada registrada' : 'paradas registradas'}
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>
      )}

      {/* 3. Produção do Dia por Máquina (As 10 Máquinas divididas por Linha) */}
      {(dailyViewMode === 'ALL' || dailyViewMode === 'MAQUINAS') && (
        <section className="bg-white border border-slate-200/90 rounded-2xl p-5 sm:p-6 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-200">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-0.5">
                TELEMETRIA · PARQUE DE 10 MÁQUINAS INDUSTRIAIS
              </p>
              <h2 className="text-base sm:text-lg font-bold text-slate-900 flex items-center gap-2">
                <Terminal className="w-5 h-5 text-amber-500" />
                Desempenho das 10 Máquinas no Dia
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Status em tempo real, módulo (PA), peça em processamento, lote e volume entregue hoje respeitando a unidade real de cada máquina
              </p>
            </div>

            {/* View Mode Toggle: Cards vs Tabela */}
            <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl border border-slate-200 self-start sm:self-auto">
              <button
                type="button"
                onClick={() => setMachineViewMode('CARDS')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                  machineViewMode === 'CARDS'
                    ? 'bg-white text-slate-900 shadow-xs border border-slate-200/60'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <LayoutGrid className="w-3.5 h-3.5" />
                <span>Cards Modernos</span>
              </button>
              <button
                type="button"
                onClick={() => setMachineViewMode('TABLE')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                  machineViewMode === 'TABLE'
                    ? 'bg-white text-slate-900 shadow-xs border border-slate-200/60'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <List className="w-3.5 h-3.5" />
                <span>Tabela Completa</span>
              </button>
            </div>
          </div>

          {machineViewMode === 'CARDS' ? (
            /* Modern Card Grid for 10 Machines */
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3.5">
              {machinePerformanceToday.map(
                ({
                  machine: m,
                  sectorInfo,
                  todayMetric,
                  todayPieces,
                  todayDowntimeMin,
                  monthDowntimeMin,
                  downtimeCountToday,
                  topReasonToday,
                }) => {
                  const getSectorAccent = () => {
                    if (m.sector === 'SECCIONADORA') return { dot: 'bg-sky-500', badge: 'bg-sky-50 text-sky-700 border-sky-200', bar: 'bg-sky-500' };
                    if (m.sector === 'COLADEIRA') return { dot: 'bg-emerald-500', badge: 'bg-emerald-50 text-emerald-700 border-emerald-200', bar: 'bg-emerald-500' };
                    if (m.sector === 'FURADEIRA') return { dot: 'bg-indigo-500', badge: 'bg-indigo-50 text-indigo-700 border-indigo-200', bar: 'bg-indigo-500' };
                    return { dot: 'bg-amber-500', badge: 'bg-amber-50 text-amber-700 border-amber-200', bar: 'bg-amber-500' };
                  };
                  const secAcc = getSectorAccent();

                  return (
                    <div
                      key={m.id}
                      className="bg-white border border-slate-200/90 rounded-2xl p-4 flex flex-col justify-between shadow-xs hover:border-slate-300 hover:shadow-md transition-all group relative overflow-hidden"
                    >
                      {/* Top Hairline Sector Indicator */}
                      <div className={`absolute top-0 left-0 right-0 h-1 ${secAcc.bar}`} />

                      <div>
                        {/* Sector Chip & Status Pill */}
                        <div className="flex items-center justify-between gap-1 pb-2 border-b border-slate-100 text-[11px] pt-0.5">
                          <span className={`font-bold px-2 py-0.5 rounded-md border flex items-center gap-1.5 ${secAcc.badge}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${secAcc.dot}`} />
                            {sectorInfo.shortLabel}
                          </span>
                          <span
                            className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full font-bold text-[10px] ${
                              m.status === 'OPERANDO'
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                : m.status === 'SETUP'
                                ? 'bg-amber-50 text-amber-700 border border-amber-200'
                                : 'bg-rose-50 text-rose-700 border border-rose-200'
                            }`}
                          >
                            <span
                              className={`w-1.5 h-1.5 rounded-full ${
                                m.status === 'OPERANDO'
                                  ? 'bg-emerald-500 animate-pulse'
                                  : m.status === 'SETUP'
                                  ? 'bg-amber-500'
                                  : 'bg-rose-500'
                              }`}
                            />
                            {m.status}
                          </span>
                        </div>

                        {/* Machine Name */}
                        <div className="mt-2.5">
                          <h3 className="font-extrabold text-sm text-slate-900 leading-tight">
                            {m.name}
                          </h3>
                          <p className="text-[11px] text-slate-500 mt-0.5">
                            Terminal: {m.username}
                          </p>
                        </div>

                        {/* Realized Metric Output Today */}
                        <div className="mt-3 p-2.5 bg-slate-50 rounded-xl border border-slate-200/80">
                          <span className="text-[10px] uppercase text-slate-500 block">
                            Produzido Hoje
                          </span>
                          <div className="flex items-baseline gap-1 mt-0.5">
                            <span className="text-xl font-black text-slate-900 tabular-nums font-mono">
                              {todayMetric.toLocaleString('pt-BR', {
                                minimumFractionDigits: m.sector === 'FURADEIRA' ? 0 : 2,
                                maximumFractionDigits: m.sector === 'FURADEIRA' ? 0 : 2,
                              })}
                            </span>
                            <span className="text-xs font-bold text-slate-600">
                              {sectorInfo.primaryMetricUnit}
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-600 mt-1 font-medium">
                            {todayPieces.toLocaleString('pt-BR')} peças entregues
                          </div>
                        </div>

                        {/* Current Job in Machine */}
                        <div className="mt-2.5 text-xs">
                          <span className="text-[10px] text-slate-500 uppercase block">
                            Trabalho Atual
                          </span>
                          {m.currentPart ? (
                            <div className="mt-0.5">
                              <p className="font-bold text-slate-900 truncate" title={m.currentPart}>
                                {m.currentPart}
                              </p>
                              <p className="text-[11px] text-slate-600 truncate mt-0.5">
                                {m.currentPaCode ? `PA: ${m.currentPaCode}` : ''}
                                {m.currentBatch ? ` · Lote: ${m.currentBatch}` : ''}
                              </p>
                            </div>
                          ) : (
                            <p className="text-[11px] text-slate-400 italic mt-0.5">
                              Aguardando apontamento
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Footer: Downtime & Action */}
                      <div className="mt-3 pt-2.5 border-t border-slate-100 space-y-2">
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="text-slate-500">Paradas hoje:</span>
                          <span
                            className={`font-mono font-bold ${
                              todayDowntimeMin > 0 ? 'text-rose-600' : 'text-emerald-600'
                            }`}
                          >
                            {formatMinutesAndHours(todayDowntimeMin)}
                          </span>
                        </div>

                        <button
                          type="button"
                          onClick={() => onSelectMachineForTerminal(m)}
                          className="w-full py-1.5 px-2 bg-slate-100 hover:bg-slate-200 text-slate-700 hover:text-slate-900 border border-slate-200 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-xs"
                        >
                          <Terminal className="w-3.5 h-3.5" />
                          <span>Abrir Terminal</span>
                        </button>
                      </div>
                    </div>
                  );
                }
              )}
            </div>
          ) : (
            /* Structured Table View */
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 text-xs font-semibold text-slate-500 uppercase">
                    <th className="py-3 pr-4">Linha / Máquina</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4">Módulo (PA) & Peça Atual</th>
                    <th className="py-3 px-4">Lote Atual</th>
                    <th className="py-3 px-4 text-right">Metragem / Volume Hoje</th>
                    <th className="py-3 px-4 text-right">Peças Hoje</th>
                    <th className="py-3 px-4 text-right">Tempo Parado (Hoje / Mês)</th>
                    <th className="py-3 pl-4 text-right">Acesso</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  {machinePerformanceToday.map(
                    ({
                      machine: m,
                      sectorInfo,
                      todayMetric,
                      todayPieces,
                      todayDowntimeMin,
                      monthDowntimeMin,
                      downtimeCountToday,
                      topReasonToday,
                    }) => (
                      <tr key={m.id} className="hover:bg-slate-50 transition-colors">
                        <td className="py-3 pr-4">
                          <span className="text-[11px] font-bold text-slate-500 block">
                            {sectorInfo.shortLabel}
                          </span>
                          <p className="font-bold text-slate-900">{m.name}</p>
                          <p className="text-xs text-slate-500">
                            Login: {m.username}
                          </p>
                        </td>
                        <td className="py-3 px-4 text-xs font-semibold whitespace-nowrap">
                          <span
                            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold ${
                              m.status === 'OPERANDO'
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                : m.status === 'SETUP'
                                ? 'bg-amber-50 text-amber-700 border border-amber-200'
                                : 'bg-rose-50 text-rose-700 border border-rose-200'
                            }`}
                          >
                            <span
                              className={`w-1.5 h-1.5 rounded-full ${
                                m.status === 'OPERANDO'
                                  ? 'bg-emerald-500'
                                  : m.status === 'SETUP'
                                  ? 'bg-amber-500'
                                  : 'bg-rose-500'
                              }`}
                            />
                            {m.status}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <p className="font-medium text-slate-900">
                            {m.currentPart || 'Sem peça em processamento'}
                          </p>
                          <p className="text-xs text-slate-500">
                            <span className="font-semibold text-slate-700">
                              {m.currentPaCode || '—'}
                            </span>{' '}
                            · {m.currentProduct || '—'} ({m.currentPartCode || '—'})
                          </p>
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap font-mono text-xs font-semibold text-slate-700">
                          {m.currentBatch || '—'}
                        </td>
                        <td className="py-3 px-4 text-right whitespace-nowrap">
                          <span className="font-mono text-sm font-bold text-slate-900 tabular-nums">
                            {todayMetric.toLocaleString('pt-BR', {
                              minimumFractionDigits: m.sector === 'FURADEIRA' ? 0 : 2,
                              maximumFractionDigits: m.sector === 'FURADEIRA' ? 0 : 2,
                            })}{' '}
                            {sectorInfo.primaryMetricUnit}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right whitespace-nowrap font-mono text-xs font-semibold text-slate-600 tabular-nums">
                          {todayPieces.toLocaleString('pt-BR')} pçs
                        </td>
                        <td className="py-3 px-4 text-right whitespace-nowrap">
                          <div className="font-mono text-xs font-extrabold text-rose-600 tabular-nums">
                            Hoje: {formatMinutesAndHours(todayDowntimeMin)}
                          </div>
                          <div className="font-mono text-[11px] text-slate-500 tabular-nums">
                            Mês: {formatMinutesAndHours(monthDowntimeMin)}
                            {downtimeCountToday > 0 && topReasonToday
                              ? ` · Maior hoje: ${topReasonToday.code}`
                              : ''}
                          </div>
                        </td>
                        <td className="py-3 pl-4 text-right whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => onSelectMachineForTerminal(m)}
                            className="px-3 py-1.5 text-xs font-semibold text-slate-700 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded-lg inline-flex items-center gap-1.5 transition-colors cursor-pointer"
                          >
                            <Terminal className="w-3.5 h-3.5" />
                            Abrir Máquina
                          </button>
                        </td>
                      </tr>
                    )
                  )}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {/* 4. Detailed Production & Stoppage Ledger */}
      <section className="bg-white border border-slate-200/90 rounded-2xl p-5 sm:p-6 shadow-xs">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-200 mb-4">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setHistoryTab('PRODUCAO')}
              className={`px-4 py-2 text-xs font-bold rounded-xl transition-all cursor-pointer ${
                historyTab === 'PRODUCAO'
                  ? 'bg-slate-900 text-amber-400 border border-slate-800 shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:text-slate-900 border border-slate-200'
              }`}
            >
              HISTÓRICO DE PRODUÇÃO ({filteredLogs.length})
            </button>
            <button
              type="button"
              onClick={() => setHistoryTab('PARADAS')}
              className={`px-4 py-2 text-xs font-bold rounded-xl transition-all cursor-pointer ${
                historyTab === 'PARADAS'
                  ? 'bg-rose-600 text-white border border-rose-700 shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:text-rose-600 border border-slate-200'
              }`}
            >
              HISTÓRICO DE PARADAS P1–P22 ({filteredDowntimes.length})
            </button>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={batchSearch}
                onChange={(e) => setBatchSearch(e.target.value)}
                placeholder="Buscar módulo, código P1-P22, máquina..."
                className="h-9 pl-9 pr-3 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 placeholder-slate-400 focus:bg-white focus:border-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-600 w-full sm:w-64 transition-all"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl border border-slate-200 overflow-x-auto">
                <button
                  type="button"
                  onClick={() => setSectorFilter('ALL')}
                  className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all whitespace-nowrap cursor-pointer ${
                    sectorFilter === 'ALL'
                      ? 'bg-white text-slate-900 shadow-xs border border-slate-200/60'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Todos
                </button>
                {SECTOR_LIST.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setSectorFilter(s.id)}
                    className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all whitespace-nowrap cursor-pointer ${
                      sectorFilter === s.id
                        ? 'bg-white text-slate-900 shadow-xs border border-slate-200/60'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {s.shortLabel}
                  </button>
                ))}
              </div>

              {/* Sub-filtro específico quando filtrando Seccionadoras ou no modo Geral */}
              {(sectorFilter === 'SECCIONADORA' || sectorFilter === 'ALL') && historyTab === 'PRODUCAO' && (
                <div className="flex items-center gap-1 p-1 bg-slate-100 border border-slate-200 rounded-xl">
                  <button
                    type="button"
                    onClick={() => setCorteSubFilter('ALL')}
                    className={`px-2 py-1 text-[11px] font-bold rounded-lg transition-all cursor-pointer whitespace-nowrap ${
                      corteSubFilter === 'ALL'
                        ? 'bg-white text-blue-700 shadow-xs border border-slate-200/60'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Todos Cortes
                  </button>
                  <button
                    type="button"
                    onClick={() => setCorteSubFilter('MDF')}
                    title="Filtrar apenas Corte de MDF (9, 15, 18 e 25mm)"
                    className={`px-2 py-1 text-[11px] font-bold rounded-lg transition-all cursor-pointer whitespace-nowrap flex items-center gap-1 ${
                      corteSubFilter === 'MDF'
                        ? 'bg-blue-600 text-white shadow-xs'
                        : 'text-blue-700 hover:text-blue-900'
                    }`}
                  >
                    <span>🪵</span>
                    <span>MDF</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setCorteSubFilter('FUNDO')}
                    title="Filtrar apenas Corte de Fundo (2,5mm / Costas)"
                    className={`px-2 py-1 text-[11px] font-bold rounded-lg transition-all cursor-pointer whitespace-nowrap flex items-center gap-1 ${
                      corteSubFilter === 'FUNDO'
                        ? 'bg-amber-600 text-white shadow-xs'
                        : 'text-amber-700 hover:text-amber-900'
                    }`}
                  >
                    <span>📦</span>
                    <span>Fundo</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Barra de Controle de Pastas Diárias */}
        <div className="flex flex-wrap items-center justify-between gap-2 px-1 pb-2 border-b border-slate-200">
          <div className="flex items-center gap-2">
            <Folder className="w-4 h-4 text-slate-400" />
            <span className="text-xs font-bold text-slate-700">
              {historyTab === 'PRODUCAO'
                ? `${groupedLogsByDay.length} ${groupedLogsByDay.length === 1 ? 'pasta diária' : 'pastas diárias'} de produção (${filteredLogs.length} apontamentos)`
                : `${groupedDowntimesByDay.length} ${groupedDowntimesByDay.length === 1 ? 'pasta diária' : 'pastas diárias'} de paradas (${filteredDowntimes.length} ocorrências)`}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() =>
                historyTab === 'PRODUCAO'
                  ? expandAllFolders(groupedLogsByDay.map((g) => g.dateKey))
                  : expandAllFolders(groupedDowntimesByDay.map((g) => g.dateKey))
              }
              className="px-2.5 py-1 text-[11px] font-bold rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 transition-colors cursor-pointer"
            >
              Abrir todas
            </button>
            <button
              type="button"
              onClick={() =>
                historyTab === 'PRODUCAO'
                  ? collapseAllFolders(groupedLogsByDay.map((g) => g.dateKey))
                  : collapseAllFolders(groupedDowntimesByDay.map((g) => g.dateKey))
              }
              className="px-2.5 py-1 text-[11px] font-bold rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 transition-colors cursor-pointer"
            >
              Recolher todas
            </button>
          </div>
        </div>

        {historyTab === 'PRODUCAO' ? (
          filteredLogs.length === 0 ? (
            <div className="py-12 text-center bg-slate-50 rounded-2xl border border-dashed border-slate-200">
              <p className="text-sm font-medium text-slate-500">
                Nenhum apontamento registrado. Os indicadores estão zerados.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {groupedLogsByDay.map((dayGroup, index) => {
                const isOpen = isFolderOpen(dayGroup.dateKey, index);

                return (
                  <div
                    key={dayGroup.dateKey}
                    className={`bg-white border rounded-2xl shadow-xs overflow-hidden transition-all duration-200 ${
                      isOpen
                        ? 'border-slate-300 ring-1 ring-slate-200 shadow-xs'
                        : 'border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    {/* Botão Cabeçalho da Pasta (clicável para abrir / fechar) */}
                    <button
                      type="button"
                      onClick={() => toggleFolder(dayGroup.dateKey, index === 0)}
                      className="w-full p-3 sm:p-4 bg-slate-50 hover:bg-slate-100/80 transition-colors flex flex-col md:flex-row md:items-center justify-between gap-3 text-left cursor-pointer"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div
                          className={`w-10 h-10 rounded-xl border flex items-center justify-center shrink-0 transition-colors ${
                            isOpen
                              ? 'bg-blue-50 text-blue-600 border-blue-200'
                              : 'bg-white text-slate-400 border-slate-200'
                          }`}
                        >
                          {isOpen ? (
                            <FolderOpen className="w-5 h-5 text-blue-600" />
                          ) : (
                            <Folder className="w-5 h-5 text-slate-400" />
                          )}
                        </div>

                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span
                              className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider border ${
                                dayGroup.isToday
                                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                  : dayGroup.isYesterday
                                  ? 'bg-blue-50 text-blue-700 border-blue-200'
                                  : 'bg-white text-slate-700 border-slate-200'
                              }`}
                            >
                              {dayGroup.isToday ? 'Hoje' : dayGroup.isYesterday ? 'Ontem' : dayGroup.dateLabel}
                            </span>
                            <h3 className="text-sm sm:text-base font-bold text-slate-900 capitalize truncate">
                              {dayGroup.dateLongLabel}
                            </h3>
                          </div>
                          <p className="text-[11px] text-slate-500 font-medium mt-0.5">
                            {dayGroup.logs.length} {dayGroup.logs.length === 1 ? 'apontamento' : 'apontamentos'} · {dayGroup.uniqueMachinesCount} {dayGroup.uniqueMachinesCount === 1 ? 'máquina ativa' : 'máquinas ativas'}
                          </p>
                        </div>
                      </div>

                      {/* Resumo do Dia na Capa da Pasta (visível mesmo fechada) */}
                      <div className="flex items-center gap-2 flex-wrap justify-between md:justify-end">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-mono text-xs font-bold px-2.5 py-1 rounded-lg bg-white text-slate-900 border border-slate-200 shadow-xs">
                            {dayGroup.totalPieces.toLocaleString('pt-BR')} pçs
                          </span>
                          {dayGroup.totalMdfM2 > 0 && (
                            <span className="font-mono text-xs font-bold px-2 py-1 rounded-lg bg-blue-50 text-blue-700 border border-blue-200">
                              🪵 MDF: {dayGroup.totalMdfM2.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} m²
                            </span>
                          )}
                          {dayGroup.totalFundoM2 > 0 && (
                            <span className="font-mono text-xs font-bold px-2 py-1 rounded-lg bg-amber-50 text-amber-700 border border-amber-200">
                              📦 Fundo: {dayGroup.totalFundoM2.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} m²
                            </span>
                          )}
                          {dayGroup.totalColadeiraMLin > 0 && (
                            <span className="font-mono text-xs font-bold px-2 py-1 rounded-lg bg-purple-50 text-purple-700 border border-purple-200">
                              📏 Bordas: {dayGroup.totalColadeiraMLin.toLocaleString('pt-BR', { maximumFractionDigits: 0 })} m
                            </span>
                          )}
                        </div>

                        <div className="inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-lg bg-white border border-slate-200 text-slate-700 shadow-xs shrink-0">
                          {isOpen ? (
                            <ChevronDown className="w-4 h-4 text-slate-600" />
                          ) : (
                            <ChevronRight className="w-4 h-4 text-slate-400" />
                          )}
                          <span className="hidden sm:inline">
                            {isOpen ? 'Recolher' : 'Abrir pasta'}
                          </span>
                        </div>
                      </div>
                    </button>

                    {/* Conteúdo Aberto da Pasta: Tabela de Apontamentos deste Dia */}
                    {isOpen && (
                      <div className="border-t border-slate-200 p-2 sm:p-4 bg-white">
                        <div className="overflow-x-auto">
                          <table className="w-full text-left border-collapse">
                            <thead>
                              <tr className="border-b border-slate-200 text-xs font-semibold text-slate-500 uppercase">
                                <th className="py-2.5 pr-3">Horário</th>
                                <th className="py-2.5 px-3">Linha / Máquina</th>
                                <th className="py-2.5 px-3">Módulo (PA)</th>
                                <th className="py-2.5 px-3">Peça / Código / Lote</th>
                                <th className="py-2.5 px-3 text-right">Metragem / Medida do Setor</th>
                                <th className="py-2.5 px-3 text-right">Qtd. Peças</th>
                                <th className="py-2.5 px-3">Operador</th>
                                <th className="py-2.5 pl-3 text-right">Excluir</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 text-sm">
                              {dayGroup.logs.map((log) => {
                                const timeFormatted = log.createdAt
                                  ? new Date(log.createdAt.seconds * 1000).toLocaleTimeString('pt-BR', {
                                      hour: '2-digit',
                                      minute: '2-digit',
                                      second: '2-digit',
                                    })
                                  : 'Agora';
                                const sec = SECTORS[log.sector];
                                const catPart = catalogByCode.get(log.partCode.trim().toUpperCase());
                                const prodInfo = getLogProductInfo(log);
                                const paCodeDisplay = prodInfo.paCode || '—';
                                const productNameDisplay = prodInfo.productName || log.productName;
                                const partNameDisplay =
                                  log.partCode.trim().toUpperCase() === '402999'
                                    ? 'PORTA BASCULANTE 770X500'
                                    : catPart?.partName || log.partName;
                                const measuredVal = getLogMeasuredAmount(log);

                                return (
                                  <tr key={log.id} className="hover:bg-slate-50 transition-colors">
                                    <td className="py-2.5 pr-3 font-mono text-xs text-slate-500 whitespace-nowrap">
                                      {timeFormatted}
                                    </td>
                                    <td className="py-2.5 px-3">
                                      <p className="font-semibold text-slate-900">{log.machineName}</p>
                                      <div className="flex items-center gap-1.5">
                                        <p className="text-xs text-slate-500">{sec.shortLabel}</p>
                                        {log.sector === 'SECCIONADORA' && (
                                          isLogFundo(log) ? (
                                            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                                              <span>📦</span> Fundo
                                            </span>
                                          ) : (
                                            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                                              <span>🪵</span> MDF
                                            </span>
                                          )
                                        )}
                                      </div>
                                    </td>
                                    <td className="py-2.5 px-3">
                                      <p className="font-mono text-xs font-bold text-slate-800">
                                        {paCodeDisplay}
                                      </p>
                                      <p className="text-xs text-slate-500">{productNameDisplay}</p>
                                    </td>
                                    <td className="py-2.5 px-3">
                                      <p className="font-medium text-slate-900">{partNameDisplay}</p>
                                      <p className="font-mono text-xs text-slate-500">
                                        {log.partCode} ·{' '}
                                        <span className="text-slate-700 font-semibold">
                                          {log.batchNumber}
                                        </span>
                                      </p>
                                    </td>
                                    <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-900 tabular-nums whitespace-nowrap">
                                      +{measuredVal.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}{' '}
                                      {sec.primaryMetricUnit}
                                    </td>
                                    <td className="py-2.5 px-3 text-right font-mono text-xs font-semibold text-slate-600 tabular-nums whitespace-nowrap">
                                      {log.quantityGood} pçs
                                    </td>
                                    <td className="py-2.5 px-3 text-xs text-slate-500">
                                      <p className="font-medium text-slate-900">{log.operatorName}</p>
                                      <p className="text-slate-500">{log.shift}</p>
                                    </td>
                                    <td className="py-2.5 pl-3 text-right whitespace-nowrap">
                                      <button
                                        type="button"
                                        onClick={() => onDeleteLog(log.id)}
                                        title="Excluir apontamento"
                                        className="p-1.5 text-slate-400 hover:text-rose-600 rounded-md transition-colors cursor-pointer"
                                      >
                                        <Trash2 className="w-4 h-4" />
                                      </button>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )
        ) : filteredDowntimes.length === 0 ? (
          <div className="py-12 text-center bg-slate-50 rounded-2xl border border-dashed border-slate-200">
            <p className="text-sm font-medium text-slate-500">
              Nenhuma parada de linha (P1 a P22) registrada.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {groupedDowntimesByDay.map((dayGroup, index) => {
              const isOpen = isDowntimeFolderOpen(dayGroup.dateKey, index);

              return (
                <div
                  key={dayGroup.dateKey}
                  className={`bg-white border rounded-2xl shadow-xs overflow-hidden transition-all duration-200 ${
                    isOpen
                      ? 'border-rose-300 ring-1 ring-rose-200 shadow-xs'
                      : 'border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => toggleDowntimeFolder(dayGroup.dateKey, index === 0)}
                    className="w-full p-3 sm:p-4 bg-slate-50 hover:bg-slate-100/80 transition-colors flex flex-col md:flex-row md:items-center justify-between gap-3 text-left cursor-pointer"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className={`w-10 h-10 rounded-xl border flex items-center justify-center shrink-0 transition-colors ${
                          isOpen
                            ? 'bg-rose-50 text-rose-600 border-rose-200'
                            : 'bg-white text-slate-400 border-slate-200'
                        }`}
                      >
                        {isOpen ? (
                          <FolderOpen className="w-5 h-5 text-rose-600" />
                        ) : (
                          <Folder className="w-5 h-5 text-slate-400" />
                        )}
                      </div>

                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span
                            className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider border ${
                              dayGroup.isToday
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                : dayGroup.isYesterday
                                ? 'bg-blue-50 text-blue-700 border-blue-200'
                                : 'bg-white text-slate-700 border-slate-200'
                            }`}
                          >
                            {dayGroup.isToday ? 'Hoje' : dayGroup.isYesterday ? 'Ontem' : dayGroup.dateLabel}
                          </span>
                          <h3 className="text-sm sm:text-base font-bold text-slate-900 capitalize truncate">
                            {dayGroup.dateLongLabel}
                          </h3>
                        </div>
                        <p className="text-[11px] text-slate-500 font-medium mt-0.5">
                          {dayGroup.downtimes.length} {dayGroup.downtimes.length === 1 ? 'parada registrada' : 'paradas registradas'}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 flex-wrap justify-between md:justify-end">
                      <span className="font-mono text-xs font-bold px-2.5 py-1 rounded-lg bg-rose-50 text-rose-700 border border-rose-200 shadow-xs">
                        {dayGroup.totalMinutes} min parados no dia
                      </span>

                      <div className="inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-lg bg-white border border-slate-200 text-slate-700 shadow-xs shrink-0">
                        {isOpen ? (
                          <ChevronDown className="w-4 h-4 text-slate-600" />
                        ) : (
                          <ChevronRight className="w-4 h-4 text-slate-400" />
                        )}
                        <span className="hidden sm:inline">
                          {isOpen ? 'Recolher' : 'Abrir pasta'}
                        </span>
                      </div>
                    </div>
                  </button>

                  {isOpen && (
                    <div className="border-t border-slate-200 p-2 sm:p-4 bg-white">
                      <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                          <thead>
                            <tr className="border-b border-slate-200 text-xs font-semibold text-slate-500 uppercase">
                              <th className="py-2.5 pr-3">Horário</th>
                              <th className="py-2.5 px-3">Linha / Máquina</th>
                              <th className="py-2.5 px-3">Código & Motivo da Ineficiência</th>
                              <th className="py-2.5 px-3">Categoria</th>
                              <th className="py-2.5 px-3 text-right">Tempo Parado</th>
                              <th className="py-2.5 px-3">Operador / Obs</th>
                              <th className="py-2.5 pl-3 text-right">Excluir</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 text-sm">
                            {dayGroup.downtimes.map((dt) => {
                              const timeFormatted = dt.createdAt
                                ? new Date(dt.createdAt.seconds * 1000).toLocaleTimeString('pt-BR', {
                                    hour: '2-digit',
                                    minute: '2-digit',
                                    second: '2-digit',
                                  })
                                : 'Agora';
                              const sec = SECTORS[dt.sector];

                              return (
                                <tr key={dt.id} className="hover:bg-slate-50 transition-colors">
                                  <td className="py-2.5 pr-3 font-mono text-xs text-slate-500 whitespace-nowrap">
                                    {timeFormatted}
                                  </td>
                                  <td className="py-2.5 px-3">
                                    <p className="font-semibold text-slate-900">{dt.machineName}</p>
                                    <p className="text-xs text-slate-500">{sec.shortLabel}</p>
                                  </td>
                                  <td className="py-2.5 px-3">
                                    <div className="flex items-center gap-2">
                                      <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-800 border border-slate-200">
                                        {dt.reasonCode}
                                      </span>
                                      <span className="font-bold text-slate-900">{dt.reasonName}</span>
                                    </div>
                                  </td>
                                  <td className="py-2.5 px-3 text-xs text-slate-500">
                                    {INEFFICIENCY_CATEGORIES[dt.category] || dt.category}
                                  </td>
                                  <td className="py-2.5 px-3 text-right font-mono font-bold text-rose-600 tabular-nums whitespace-nowrap">
                                    {dt.durationMinutes} min
                                  </td>
                                  <td className="py-2.5 px-3 text-xs text-slate-500">
                                    <p className="font-medium text-slate-900">{dt.operatorName}</p>
                                    {dt.notes && <p className="text-slate-400">{dt.notes}</p>}
                                  </td>
                                  <td className="py-2.5 pl-3 text-right whitespace-nowrap">
                                    <button
                                      type="button"
                                      onClick={() => onDeleteDowntimeLog(dt.id)}
                                      title="Excluir parada"
                                      className="p-1.5 text-slate-400 hover:text-rose-600 rounded-md transition-colors cursor-pointer"
                                    >
                                      <Trash2 className="w-4 h-4" />
                                    </button>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>
      </div>
    </>
  );
};
