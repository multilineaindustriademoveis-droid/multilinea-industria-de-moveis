import React, { useState, useMemo, useEffect } from 'react';
import {
  Machine,
  CatalogPart,
  ProductionLog,
  InefficiencyReason,
  DowntimeLog,
  InefficiencyCategory,
  INEFFICIENCY_CATEGORIES,
  SECTORS,
  SECTOR_LIST,
  SHIFTS,
  ShiftId,
  MachineStatus,
  SectorId,
  ProductionOrder,
  getOrderProductQty,
  getOrderTotalVolumes,
  getOrderVolumesPerProduct,
} from '../types';
import {
  Lock,
  LogOut,
  CheckCircle2,
  AlertTriangle,
  Plus,
  Minus,
  Layers,
  KeyRound,
  UserCheck,
  Search,
  Clock,
  QrCode,
  Printer,
  Camera,
} from 'lucide-react';
import {
  PartIdentificationTicketModal,
  parseTicketBarcode,
  buildTicketBarcode,
} from './PartIdentificationTicketModal';
import { QrCameraScannerModal } from './QrCameraScannerModal';

interface MachineTerminalProps {
  machines: Machine[];
  catalogParts: CatalogPart[];
  inefficiencyReasons: InefficiencyReason[];
  logs: ProductionLog[];
  downtimeLogs: DowntimeLog[];
  productionOrders?: ProductionOrder[];
  activeMachine: Machine | null;
  onLoginMachine: (machine: Machine) => void;
  onLogoutMachine: () => void;
  onUpdateMachineJob: (
    machineId: string,
    payload: {
      status: MachineStatus;
      currentProduct: string;
      currentPaCode: string;
      currentPart: string;
      currentPartCode: string;
      currentBatch: string;
    }
  ) => Promise<void>;
  onRecordDelivery: (payload: {
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
  }) => Promise<void>;
  onRecordDowntime: (payload: {
    machine: Machine;
    reasonCode: string;
    reasonName: string;
    category: InefficiencyCategory;
    durationMinutes: number;
    operatorName: string;
    shift: ShiftId;
    notes: string;
  }) => Promise<void>;
  onNavigateToCatalog?: () => void;
}

export const MachineTerminal: React.FC<MachineTerminalProps> = ({
  machines,
  catalogParts,
  inefficiencyReasons,
  logs,
  downtimeLogs,
  productionOrders = [],
  activeMachine,
  onLoginMachine,
  onLogoutMachine,
  onUpdateMachineJob,
  onRecordDelivery,
  onRecordDowntime,
  onNavigateToCatalog,
}) => {
  // Login state
  const [selectedSectorFilter, setSelectedSectorFilter] = useState<SectorId | 'ALL'>('ALL');
  const [selectedStationId, setSelectedStationId] = useState<string>('');
  const [usernameInput, setUsernameInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [loginError, setLoginError] = useState<string | null>(null);
  const [showCredentialsGuide, setShowCredentialsGuide] = useState(true);
  const [showAllCodesModal, setShowAllCodesModal] = useState(false);
  const [selectedOrderEncomenda, setSelectedOrderEncomenda] = useState<string>('M26051');

  // Terminal Mode: PRODUCAO vs PARADA (Ineficiências P1-P22)
  const [terminalMode, setTerminalMode] = useState<'PRODUCAO' | 'PARADA'>('PRODUCAO');

  // Operator Quick Search across ~180 Modules
  const [moduleSearch, setModuleSearch] = useState('');
  const [selectedModulePaCode, setSelectedModulePaCode] = useState<string>('ALL');

  // Active Machine Production Form state
  const [productName, setProductName] = useState(activeMachine?.currentProduct || '');
  const [paCode, setPaCode] = useState(activeMachine?.currentPaCode || '');
  const [partName, setPartName] = useState(activeMachine?.currentPart || '');
  const [partCode, setPartCode] = useState(activeMachine?.currentPartCode || '');
  const [batchNumber, setBatchNumber] = useState(activeMachine?.currentBatch || '');
  const [machineStatus, setMachineStatus] = useState<MachineStatus>(
    activeMachine?.status || 'OPERANDO'
  );
  const [quantityGood, setQuantityGood] = useState<number>(50);
  const [quantityScrap, setQuantityScrap] = useState<number>(0);

  // Manual override if operator is processing a custom piece not in catalog
  const [manualUnitMetric, setManualUnitMetric] = useState<number>(1.0);

  // Downtime / Inefficiency Form State (P1 to P22)
  const [inefSearch, setInefSearch] = useState('');
  const [inefCategoryFilter, setInefCategoryFilter] = useState<InefficiencyCategory | 'ALL'>('ALL');
  const [selectedReasonCode, setSelectedReasonCode] = useState<string>('P1');
  const [selectedReasonName, setSelectedReasonName] = useState<string>('MANUTENÇÃO MECÂNICA');
  const [selectedReasonCategory, setSelectedReasonCategory] =
    useState<InefficiencyCategory>('MANUTENCAO');
  const [durationMinutes, setDurationMinutes] = useState<number>(15);
  const [downtimeNotes, setDowntimeNotes] = useState<string>('');

  // Live Stoppage Stopwatch (Cronômetro de Parada em Tempo Real)
  const [activeStoppageStartMs, setActiveStoppageStartMs] = useState<number | null>(null);
  const [elapsedStoppageSeconds, setElapsedStoppageSeconds] = useState<number>(0);

  useEffect(() => {
    if (!activeStoppageStartMs) {
      setElapsedStoppageSeconds(0);
      return;
    }
    const interval = setInterval(() => {
      const diffSec = Math.max(0, Math.floor((Date.now() - activeStoppageStartMs) / 1000));
      setElapsedStoppageSeconds(diffSec);
      const mins = Math.max(1, Math.ceil(diffSec / 60));
      setDurationMinutes(mins);
    }, 1000);
    return () => clearInterval(interval);
  }, [activeStoppageStartMs]);

  const [operatorName, setOperatorName] = useState<string>('Operador Turno 1');
  const [shift, setShift] = useState<ShiftId>('TURNO_1');
  const [notes, setNotes] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);
  const [feedbackBanner, setFeedbackBanner] = useState<string | null>(null);

  // Optical Barcode Scanner state for instant sector recording (Bipar Etiqueta da Ficha)
  const [barcodeInput, setBarcodeInput] = useState<string>('');
  const [autoSubmitOnScan, setAutoSubmitOnScan] = useState<boolean>(true);
  const [terminalTicketOrder, setTerminalTicketOrder] = useState<ProductionOrder | null>(null);
  const [isCameraScannerOpen, setIsCameraScannerOpen] = useState<boolean>(false);
  const [duplicateScanWarning, setDuplicateScanWarning] = useState<{
    batchNumber: string;
    partCode: string;
    partName: string;
    stackQty: number;
    unitVal: number;
    calculatedMeasure: number;
    previousCount: number;
    totalAccumulatedQty: number;
    lastLog?: ProductionLog;
    payloadToSubmit?: {
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
    };
  } | null>(null);

  useEffect(() => {
    if (activeMachine) {
      setProductName(activeMachine.currentProduct);
      setPaCode(activeMachine.currentPaCode || '');
      setPartName(activeMachine.currentPart);
      setPartCode(activeMachine.currentPartCode);
      setBatchNumber(activeMachine.currentBatch);
      setMachineStatus(activeMachine.status);
    }
    // Only reset local form state when switching which machine is logged in
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeMachine?.id]);

  // Distinct Modules (PA) for 2-tap filtering
  const distinctModules = useMemo(() => {
    const map = new Map<string, string>();
    catalogParts.forEach((c) => {
      if (c.paCode) map.set(c.paCode.toUpperCase(), c.productName);
    });
    return Array.from(map.entries());
  }, [catalogParts]);

  // Filtered catalog parts for quick operator tap
  const filteredCatalogForOperator = useMemo(() => {
    return catalogParts.filter((c) => {
      const codeUpper = (c.paCode || '').toUpperCase();
      const matchesMod =
        selectedModulePaCode === 'ALL' || codeUpper === selectedModulePaCode;
      const q = moduleSearch.trim().toLowerCase();
      const matchesSearch =
        !q ||
        (c.paCode || '').toLowerCase().includes(q) ||
        (c.productName || '').toLowerCase().includes(q) ||
        (c.partCode || '').toLowerCase().includes(q) ||
        (c.partName || '').toLowerCase().includes(q);
      return matchesMod && matchesSearch;
    });
  }, [catalogParts, selectedModulePaCode, moduleSearch]);

  // Filtered Inefficiency Reasons (P1 - P22) for the current machine sector, sorted numerically P1 -> P22
  const filteredInefficiencyReasons = useMemo(() => {
    const q = inefSearch.trim().toLowerCase();
    return inefficiencyReasons
      .filter((r) => {
        const matchesSector =
          !activeMachine || !r.sector || r.sector === 'ALL' || r.sector === activeMachine.sector;
        const matchesCategory =
          inefCategoryFilter === 'ALL' || r.category === inefCategoryFilter;
        const matchesQuery =
          !q ||
          (r.code || '').toLowerCase().includes(q) ||
          (r.name || '').toLowerCase().includes(q);
        return matchesSector && matchesCategory && matchesQuery;
      })
      .sort((a, b) => {
        const numA = parseInt((a.code || '').replace(/\D/g, ''), 10) || 999;
        const numB = parseInt((b.code || '').replace(/\D/g, ''), 10) || 999;
        return numA - numB;
      });
  }, [inefficiencyReasons, activeMachine, inefSearch, inefCategoryFilter]);

  const handleStationLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError(null);
    const cleanUser = usernameInput.trim().toLowerCase();
    const cleanPass = passwordInput.trim();

    // 1. Try matching by selected station dropdown first
    let matched: Machine | undefined = selectedStationId
      ? machines.find((m) => m.id === selectedStationId)
      : undefined;

    // 2. Try matching by exact username, machine name, partial name, or machine ID
    if (!matched && cleanUser) {
      matched = machines.find((m) => {
        const mUser = (m.username || '').trim().toLowerCase();
        const mName = (m.name || '').trim().toLowerCase();
        return (
          mUser === cleanUser ||
          mName === cleanUser ||
          (cleanUser.length >= 3 && mName.includes(cleanUser)) ||
          (cleanUser.length >= 3 && cleanUser.includes(mUser)) ||
          (m.id && m.id.toLowerCase() === cleanUser)
        );
      });
    }

    // 3. If operator left username blank or only typed PIN, match if unique
    if (!matched && !cleanUser && cleanPass) {
      const pinMatches = machines.filter(
        (m) => String(m.accessPin || '').trim() === cleanPass
      );
      if (pinMatches.length === 1) {
        matched = pinMatches[0];
      }
    }

    if (!matched) {
      setLoginError(
        `Posto ou usuário "${usernameInput || 'não preenchido'}" não encontrado. Escolha a sua máquina na lista acima ou clique em "Entrar" no quadro ao lado.`
      );
      return;
    }

    // 4. Validate password / PIN
    const machinePin = String(matched.accessPin || '').trim();
    if (cleanPass && cleanPass !== machinePin) {
      setLoginError(
        `Senha/PIN incorreto para "${matched.name}". Verifique o PIN cadastrado (${matched.accessPin}) ou utilize o botão Entrar Direto.`
      );
      return;
    }

    setUsernameInput('');
    setPasswordInput('');
    setSelectedStationId('');
    onLoginMachine(matched);
  };

  const handleQuickFillCredentials = (machine: Machine) => {
    setSelectedStationId(machine.id);
    setUsernameInput(machine.username);
    setPasswordInput(machine.accessPin);
    setLoginError(null);
  };

  const handleSelectCatalogPart = (part: CatalogPart) => {
    setProductName(part.productName);
    setPaCode(part.paCode || '');
    setPartName(part.partName);
    setPartCode(part.partCode);
    if (activeMachine?.sector === 'COLADEIRA') {
      setManualUnitMetric(typeof part.linearMeters === 'number' ? part.linearMeters : 1.0);
    } else if (activeMachine?.sector === 'LINHA_UV') {
      const uvVal =
        typeof part.uvSquareMeters === 'number'
          ? part.uvSquareMeters
          : (part.squareMeters || 1.0) * (part.uvFaces ?? 1);
      setManualUnitMetric(uvVal);
    } else if (activeMachine?.sector === 'SECCIONADORA') {
      setManualUnitMetric(typeof part.squareMeters === 'number' ? part.squareMeters : 1.0);
    } else {
      setManualUnitMetric(1);
    }
  };

  const handleSelectInefficiencyReason = (reason: InefficiencyReason) => {
    setSelectedReasonCode(reason.code);
    setSelectedReasonName(reason.name);
    setSelectedReasonCategory(reason.category);
  };

  // Compute the sector-specific measurement for the current entry (strictly per individual piece)
  const selectedPartObj = useMemo(() => {
    const cleanP = partCode.trim().toUpperCase();
    const cleanPa = paCode.trim().toUpperCase();
    return (
      (cleanPa
        ? catalogParts.find(
            (c) =>
              c.partCode.trim().toUpperCase() === cleanP &&
              c.paCode.trim().toUpperCase() === cleanPa
          )
        : null) ||
      catalogParts.find((c) => c.partCode.trim().toUpperCase() === cleanP)
    );
  }, [catalogParts, partCode, paCode]);

  const unitMeasurement = useMemo(() => {
    if (!activeMachine) return 1;
    if (activeMachine.sector === 'FURADEIRA') {
      return 1; // Furadeira is measured in quantity of drilled pieces
    }
    const cleanP = partCode.trim().toUpperCase();

    // Specific piece 402943: 770x500 = 0.335 m² per piece (300 pcs = 100.5 m²)
    if (cleanP === '402943') {
      if (activeMachine.sector === 'COLADEIRA') return 2.54;
      if (activeMachine.sector === 'LINHA_UV') return 0.67;
      return 0.335;
    }

    if (cleanP === '402999') {
      if (activeMachine.sector === 'COLADEIRA') return 2.54;
      if (activeMachine.sector === 'LINHA_UV') return 0.78;
      return 0.39;
    }

    if (activeMachine.sector === 'COLADEIRA') {
      if (selectedPartObj) {
        let ml = selectedPartObj.linearMeters || 0;
        const pQty = Math.max(1, Math.round(selectedPartObj.piecesPerProduct || 1));
        if (pQty > 1 && ml > 4.5) ml = Number((ml / pQty).toFixed(3));
        return ml;
      }
      return manualUnitMetric;
    }

    if (activeMachine.sector === 'LINHA_UV') {
      if (selectedPartObj) {
        let uvM2 =
          typeof selectedPartObj.uvSquareMeters === 'number'
            ? selectedPartObj.uvSquareMeters
            : Number(
                ((selectedPartObj.squareMeters || 0) * (selectedPartObj.uvFaces ?? 1)).toFixed(4)
              );
        const pQty = Math.max(1, Math.round(selectedPartObj.piecesPerProduct || 1));
        if (pQty > 1 && uvM2 > 1.2) uvM2 = Number((uvM2 / pQty).toFixed(4));
        return uvM2;
      }
      return manualUnitMetric;
    }

    // SECCIONADORA (Corte) -> measured in 1-face m² strictly PER PIECE (unitário por peça)
    if (selectedPartObj) {
      const cleanSelCode = (selectedPartObj.partCode || '').trim().toUpperCase();
      if (cleanSelCode === '402943') {
        return 0.335; // 300 pieces = 100.50 m²
      }
      let cutM2 = selectedPartObj.squareMeters || 0;
      const pQty = Math.max(1, Math.round(selectedPartObj.piecesPerProduct || 1));
      const nums = selectedPartObj.dimensions.match(/\d+/g);
      const geomM2 = nums && nums.length >= 2 ? (Number(nums[0]) * Number(nums[1])) / 1_000_000 : 0.385;
      if (pQty > 1 && (cutM2 >= geomM2 * (pQty - 0.2) || (cutM2 > 0.8 && geomM2 < 0.6))) {
        cutM2 = Number((cutM2 / pQty).toFixed(4));
      }
      return cutM2;
    }

    // Attempt dimension extraction from partName (e.g. "PORTA 770X500")
    const dimMatch = (partName + ' ' + partCode).match(/(\d{2,4})\s*[xX*×]\s*(\d{2,4})/);
    if (dimMatch) {
      const d1 = parseFloat(dimMatch[1]);
      const d2 = parseFloat(dimMatch[2]);
      if (d1 > 0 && d2 > 0) {
        return Number(((d1 * d2) / 1000000).toFixed(4));
      }
    }
    return manualUnitMetric;
  }, [activeMachine, selectedPartObj, manualUnitMetric, partCode, partName]);

  const totalMeasuredForDelivery = useMemo(() => {
    if (!activeMachine) return 0;
    if (activeMachine.sector === 'FURADEIRA') {
      return Math.max(0, Math.floor(quantityGood));
    }
    return Number((Math.max(0, quantityGood) * unitMeasurement).toFixed(3));
  }, [activeMachine, quantityGood, unitMeasurement]);

  const todayStr = new Date().toLocaleDateString('pt-BR');

  const machineLogs = useMemo(() => {
    if (!activeMachine) return [];
    return logs.filter((l) => l.machineId === activeMachine.id);
  }, [logs, activeMachine]);

  const machineDowntimes = useMemo(() => {
    if (!activeMachine) return [];
    return downtimeLogs.filter((d) => d.machineId === activeMachine.id);
  }, [downtimeLogs, activeMachine]);

  // Calculate today's processed volume & downtime minutes on this machine (MUST be above early return to satisfy Rules of Hooks)
  const machineTodaySummary = useMemo(() => {
    let todayPrimaryMetric = 0;
    let todayPieces = 0;
    let todayDowntimeMinutes = 0;

    if (!activeMachine) {
      return { todayPrimaryMetric, todayPieces, todayDowntimeMinutes };
    }

    machineLogs.forEach((l) => {
      const logDate = l.createdAt
        ? new Date(l.createdAt.seconds * 1000).toLocaleDateString('pt-BR')
        : todayStr;
      if (logDate === todayStr) {
        todayPieces += l.quantityGood;
        const cleanP = (l.partCode || '').toUpperCase().trim();
        if (typeof l.measuredAmount === 'number') {
          if (cleanP === '402943' && activeMachine.sector === 'SECCIONADORA' && l.measuredAmount > 150) {
            todayPrimaryMetric += Number((l.quantityGood * 0.335).toFixed(2));
          } else {
            todayPrimaryMetric += l.measuredAmount;
          }
        } else {
          const cat =
            catalogParts.find(
              (c) =>
                (c.partCode || '').toUpperCase().trim() === cleanP &&
                (!l.paCode || (c.paCode || '').toUpperCase().trim() === (l.paCode || '').toUpperCase().trim())
            ) ||
            catalogParts.find(
              (c) => (c.partCode || '').toUpperCase().trim() === cleanP
            );
          if (activeMachine.sector === 'FURADEIRA') {
            todayPrimaryMetric += l.quantityGood;
          } else if (activeMachine.sector === 'COLADEIRA') {
            const linUnit = cleanP === '402943' ? 2.54 : (cat?.linearMeters || 0);
            todayPrimaryMetric += l.quantityGood * linUnit;
          } else if (activeMachine.sector === 'LINHA_UV') {
            const uvUnit =
              cleanP === '402943'
                ? 0.67
                : typeof cat?.uvSquareMeters === 'number'
                ? cat.uvSquareMeters
                : (cat?.squareMeters || 0) * (cat?.uvFaces ?? 1);
            todayPrimaryMetric += l.quantityGood * uvUnit;
          } else {
            const cutUnit = cleanP === '402943' ? 0.335 : (cat?.squareMeters || 0);
            todayPrimaryMetric += l.quantityGood * cutUnit;
          }
        }
      }
    });

    machineDowntimes.forEach((d) => {
      const logDate = d.createdAt
        ? new Date(d.createdAt.seconds * 1000).toLocaleDateString('pt-BR')
        : todayStr;
      if (logDate === todayStr) {
        todayDowntimeMinutes += d.durationMinutes;
      }
    });

    return { todayPrimaryMetric, todayPieces, todayDowntimeMinutes };
  }, [machineLogs, machineDowntimes, todayStr, catalogParts, activeMachine]);

  const handleSyncActiveJobToMachine = async () => {
    if (!activeMachine) return;
    setSubmitting(true);
    try {
      await onUpdateMachineJob(activeMachine.id, {
        status: machineStatus,
        currentProduct: productName.trim().slice(0, 120),
        currentPaCode: paCode.trim().toUpperCase().slice(0, 60),
        currentPart: partName.trim().slice(0, 120),
        currentPartCode: partCode.trim().toUpperCase().slice(0, 60),
        currentBatch: batchNumber.trim().toUpperCase().slice(0, 60),
      });
      setFeedbackBanner('Peça e lote fixados como "Em Processamento" nesta máquina.');
      setTimeout(() => setFeedbackBanner(null), 3500);
    } finally {
      setSubmitting(false);
    }
  };

  // Web Audio chime for scanner feedback on factory floor
  const playScanChime = (type: 'SUCCESS' | 'WARNING') => {
    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      if (ctx.state === 'suspended') {
        ctx.resume();
      }
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);

      if (type === 'SUCCESS') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(880, ctx.currentTime);
        gain.gain.setValueAtTime(0.2, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.18);
        osc.start();
        osc.stop(ctx.currentTime + 0.18);
      } else {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(320, ctx.currentTime);
        osc.frequency.setValueAtTime(220, ctx.currentTime + 0.12);
        gain.gain.setValueAtTime(0.25, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.32);
        osc.start();
        osc.stop(ctx.currentTime + 0.32);
      }
    } catch {
      // Audio might be blocked by browser policy
    }
  };

  const handleBarcodeScan = async (rawCode: string) => {
    if (!activeMachine) return;
    const parsed = parseTicketBarcode(rawCode);
    if (!parsed) {
      setFeedbackBanner(
        'Formato de QR-CODE inválido. Use o padrão LOTE|COD_PECA|QTD_PILHA (ex: M2605206|403411|80).'
      );
      return;
    }

    const cleanBatch = parsed.batchNumber.toUpperCase();
    const cleanPart = parsed.partCode.toUpperCase();

    // 1. Find order in Plano Mestre by batchNumber
    const matchedOrder = productionOrders.find(
      (o) => o.batchNumber.trim().toUpperCase() === cleanBatch
    );

    const targetProductCode = (matchedOrder?.productCode || paCode || '').trim().toUpperCase();
    const matchedPart =
      (targetProductCode
        ? catalogParts.find(
            (c) =>
              c.partCode.trim().toUpperCase() === cleanPart &&
              c.paCode.trim().toUpperCase() === targetProductCode
          )
        : null) ||
      catalogParts.find((c) => c.partCode.trim().toUpperCase() === cleanPart);

    const isBatchI2603604 = cleanBatch === 'I2603604' || (cleanBatch.startsWith('I26036') && cleanPart === '402999');
    const resolvedPaCode =
      matchedOrder?.productCode ||
      (isBatchI2603604 ? '500698' : matchedPart?.paCode || paCode || 'PA-GERAL');

    const resolvedProductName =
      matchedOrder
        ? `${matchedOrder.productLine} - ${matchedOrder.productDescription}${
            matchedOrder.finishColor ? ` (${matchedOrder.finishColor})` : ''
          }`
        : isBatchI2603604
        ? 'RAINHA - BALC. 1PT BASC 1GV NESHER 80CM• ENCAB'
        : matchedPart?.productName || productName || 'Produto Lido via QR-Code';

    const resolvedPartName =
      matchedPart?.partName ||
      (cleanPart === '402943' ? 'PORTA 770X500' : '') ||
      (cleanPart === '402999' ? 'PORTA BASCULANTE 770X500' : '') ||
      (cleanPart === '403411' ? 'TAMPO 1568 X 297' : '') ||
      `Peça Cód. ${cleanPart}`;

    const orderProdQty = getOrderProductQty(matchedOrder);
    const partMult = Math.max(1, Math.round(matchedPart?.piecesPerProduct || 1));
    const resolvedQty =
      parsed.stackQty > 0
        ? parsed.stackQty
        : orderProdQty > 0
        ? orderProdQty * partMult
        : quantityGood || 80;

    // 3. Calculate exact measurement for THIS machine's sector strictly PER PIECE (unitário por peça)
    let unitVal = 1;
    if (activeMachine.sector === 'FURADEIRA') {
      unitVal = 1;
    } else if (activeMachine.sector === 'COLADEIRA') {
      if (cleanPart === '402943') {
        unitVal = 2.54;
      } else if (cleanPart === '402999') {
        unitVal = 2.54;
      } else if (matchedPart) {
        let ml = typeof matchedPart.linearMeters === 'number' ? matchedPart.linearMeters : 2.162;
        const pQty = Math.max(1, Math.round(matchedPart.piecesPerProduct || 1));
        if (pQty > 1 && ml > 4.5) ml = Number((ml / pQty).toFixed(3));
        unitVal = ml;
      } else {
        unitVal = manualUnitMetric;
      }
    } else if (activeMachine.sector === 'LINHA_UV') {
      if (cleanPart === '402943') {
        unitVal = 0.67;
      } else if (cleanPart === '402999') {
        unitVal = 0.78;
      } else if (matchedPart) {
        let uvM2 =
          typeof matchedPart.uvSquareMeters === 'number'
            ? matchedPart.uvSquareMeters
            : matchedPart.uvFaces === 0
            ? 0
            : Number(((matchedPart.squareMeters || 0.4657) * (matchedPart.uvFaces ?? 1)).toFixed(4));
        const pQty = Math.max(1, Math.round(matchedPart.piecesPerProduct || 1));
        if (pQty > 1 && uvM2 > 1.2) uvM2 = Number((uvM2 / pQty).toFixed(4));
        unitVal = uvM2;
      } else {
        unitVal = manualUnitMetric;
      }
    } else {
      // SECCIONADORA (Corte) -> Estritamente M² por Peça
      if (cleanPart === '402943') {
        unitVal = 0.335; // 300 peças = 100,50 m² (0.335 m²/peça)
      } else if (cleanPart === '402999') {
        unitVal = 0.39; // 200 peças = 78,00 m² (0.39 m²/peça)
      } else if (matchedPart) {
        let cutM2 = matchedPart.squareMeters || 0.39;
        const pQty = Math.max(1, Math.round(matchedPart.piecesPerProduct || 1));
        const nums = matchedPart.dimensions.match(/\d+/g);
        const geomM2 = nums && nums.length >= 2 ? (Number(nums[0]) * Number(nums[1])) / 1_000_000 : 0.385;
        if (pQty > 1 && cutM2 >= geomM2 * (pQty - 0.2)) {
          cutM2 = Number((cutM2 / pQty).toFixed(4));
        }
        unitVal = cutM2;
      } else {
        const dimMatch = resolvedPartName.match(/(\d{2,4})\s*[xX*×]\s*(\d{2,4})/);
        if (dimMatch) {
          const d1 = parseFloat(dimMatch[1]);
          const d2 = parseFloat(dimMatch[2]);
          unitVal = (d1 > 0 && d2 > 0) ? Number(((d1 * d2) / 1000000).toFixed(4)) : manualUnitMetric;
        } else {
          unitVal = manualUnitMetric;
        }
      }
    }

    const calculatedMeasure =
      activeMachine.sector === 'FURADEIRA'
        ? Math.max(1, Math.round(resolvedQty))
        : Number((resolvedQty * unitVal).toFixed(3));

    // Populate form fields
    setBatchNumber(cleanBatch);
    setPartCode(cleanPart);
    setPartName(resolvedPartName);
    setPaCode(resolvedPaCode);
    setProductName(resolvedProductName);
    setQuantityGood(resolvedQty);
    setManualUnitMetric(unitVal);
    setBarcodeInput('');

    // CHECK IF THIS QR-CODE HAS ALREADY BEEN BIPPED IN THIS SECTOR
    const previousLogsForPart = logs.filter((l) => {
      const matchBatch = (l.batchNumber || '').trim().toUpperCase() === cleanBatch;
      const matchPart = (l.partCode || '').trim().toUpperCase() === cleanPart;
      const matchSector = l.sector === activeMachine.sector;
      return matchBatch && matchPart && matchSector;
    });

    const isAlreadyBipped = previousLogsForPart.length > 0;
    const totalPreviousQty = previousLogsForPart.reduce((acc, l) => acc + (l.quantityGood || 0), 0);
    const lastScanLog = previousLogsForPart[0];
    const sectorMeta = SECTORS[activeMachine.sector];

    const payloadForDelivery = {
      machine: activeMachine,
      productName: resolvedProductName.slice(0, 120),
      paCode: resolvedPaCode.toUpperCase().slice(0, 60),
      partName: resolvedPartName.slice(0, 120),
      partCode: cleanPart.slice(0, 60),
      batchNumber: cleanBatch.slice(0, 60),
      quantityGood: resolvedQty,
      quantityScrap: 0,
      measuredAmount: calculatedMeasure,
      operatorName: (operatorName.trim() || 'Operador (Leitor QR-Code)').slice(0, 80),
      shift,
      notes: `Lido via QR-CODE da Ficha [${cleanBatch}|${cleanPart}|${resolvedQty}]`,
    };

    if (isAlreadyBipped) {
      // PROMPT OPERATOR CLEARLY: THIS QR-CODE WAS ALREADY SCANNED BEFORE!
      playScanChime('WARNING');
      setDuplicateScanWarning({
        batchNumber: cleanBatch,
        partCode: cleanPart,
        partName: resolvedPartName,
        stackQty: resolvedQty,
        unitVal,
        calculatedMeasure,
        previousCount: previousLogsForPart.length,
        totalAccumulatedQty: totalPreviousQty,
        lastLog: lastScanLog,
        payloadToSubmit: payloadForDelivery,
      });

      setFeedbackBanner(
        `⚠️ ATENÇÃO: ESTE QR-CODE JÁ FOI BIPADO ANTERIORMENTE! Lote ${cleanBatch} · Peça ${cleanPart} já possui ${previousLogsForPart.length} apontamento(s) com ${totalPreviousQty} pçs somadas neste setor. O lançamento automático foi pausado para evitar duplicidade.`
      );
      return;
    }

    // IF NOT BIPPED YET:
    setDuplicateScanWarning(null);
    playScanChime('SUCCESS');

    // If autoSubmitOnScan is enabled and never bipped before, immediately record!
    if (autoSubmitOnScan) {
      setSubmitting(true);
      try {
        await onRecordDelivery(payloadForDelivery);

        await onUpdateMachineJob(activeMachine.id, {
          status: 'OPERANDO',
          currentProduct: resolvedProductName.slice(0, 120),
          currentPaCode: resolvedPaCode.toUpperCase().slice(0, 60),
          currentPart: resolvedPartName.slice(0, 120),
          currentPartCode: cleanPart.slice(0, 60),
          currentBatch: cleanBatch.slice(0, 60),
        });

        setFeedbackBanner(
          `✓ QR-CODE LIDO COM SUCESSO (1ª LEITURA)! Lote ${cleanBatch} · Peça ${cleanPart} (${resolvedPartName}) · Pilha de ${resolvedQty} pçs → Calculado e somado hoje: +${calculatedMeasure.toLocaleString(
            'pt-BR'
          )} ${sectorMeta.primaryMetricLabel} na ${activeMachine.name}!`
        );
        setTimeout(() => setFeedbackBanner(null), 6500);
      } finally {
        setSubmitting(false);
      }
    } else {
      setFeedbackBanner(
        `✓ QR-CODE NOVO VALIDADO: Lote ${cleanBatch} · Peça ${cleanPart} (${resolvedQty} pçs). Nenhuma leitura anterior nesta linha. Confira e clique em Apontar.`
      );
    }
  };

  const handleConfirmDuplicateScan = async () => {
    if (!duplicateScanWarning?.payloadToSubmit || !activeMachine) return;
    const sectorMeta = SECTORS[activeMachine.sector];
    setSubmitting(true);
    try {
      await onRecordDelivery({
        ...duplicateScanWarning.payloadToSubmit,
        notes: `${duplicateScanWarning.payloadToSubmit.notes} (Pilha Adicional Confirmada)`,
      });
      await onUpdateMachineJob(activeMachine.id, {
        status: 'OPERANDO',
        currentProduct: duplicateScanWarning.payloadToSubmit.productName,
        currentPaCode: duplicateScanWarning.payloadToSubmit.paCode,
        currentPart: duplicateScanWarning.partName,
        currentPartCode: duplicateScanWarning.partCode,
        currentBatch: duplicateScanWarning.batchNumber,
      });
      setFeedbackBanner(
        `✓ APONTAMENTO ADICIONAL CONFIRMADO! Lote ${duplicateScanWarning.batchNumber} · Peça ${duplicateScanWarning.partCode} (+${duplicateScanWarning.calculatedMeasure} ${sectorMeta.primaryMetricLabel} na ${activeMachine.name}).`
      );
      setDuplicateScanWarning(null);
      setTimeout(() => setFeedbackBanner(null), 6000);
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancelDuplicateScan = () => {
    setDuplicateScanWarning(null);
    setFeedbackBanner('Apontamento cancelado pelo operador para evitar duplicidade de leitura.');
    setTimeout(() => setFeedbackBanner(null), 4000);
  };

  const handleSubmitDelivery = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeMachine) return;
    if (
      !productName.trim() ||
      !paCode.trim() ||
      !partName.trim() ||
      !partCode.trim() ||
      !batchNumber.trim()
    ) {
      setFeedbackBanner(
        'Selecione uma peça do catálogo (ou preencha Módulo/PA, Peça, Código e Lote) antes de apontar.'
      );
      return;
    }
    if (quantityGood <= 0 && quantityScrap <= 0) {
      setFeedbackBanner('A quantidade entregue deve ser maior que zero.');
      return;
    }

    const sectorMeta = SECTORS[activeMachine.sector];

    setSubmitting(true);
    try {
      await onRecordDelivery({
        machine: activeMachine,
        productName: productName.trim().slice(0, 120),
        paCode: paCode.trim().toUpperCase().slice(0, 60),
        partName: partName.trim().slice(0, 120),
        partCode: partCode.trim().toUpperCase().slice(0, 60),
        batchNumber: batchNumber.trim().toUpperCase().slice(0, 60),
        quantityGood: Math.max(0, Math.min(100000, Math.floor(quantityGood))),
        quantityScrap: Math.max(0, Math.min(100000, Math.floor(quantityScrap))),
        measuredAmount: totalMeasuredForDelivery,
        operatorName: (operatorName.trim() || 'Operador').slice(0, 80),
        shift,
        notes: notes.trim().slice(0, 250),
      });

      await onUpdateMachineJob(activeMachine.id, {
        status: machineStatus,
        currentProduct: productName.trim().slice(0, 120),
        currentPaCode: paCode.trim().toUpperCase().slice(0, 60),
        currentPart: partName.trim().slice(0, 120),
        currentPartCode: partCode.trim().toUpperCase().slice(0, 60),
        currentBatch: batchNumber.trim().toUpperCase().slice(0, 60),
      });

      setNotes('');
      setQuantityScrap(0);
      setFeedbackBanner(
        `Apontamento confirmado na ${activeMachine.name}: +${totalMeasuredForDelivery.toLocaleString(
          'pt-BR'
        )} ${sectorMeta.primaryMetricLabel} (${quantityGood} pçs · Lote ${batchNumber}).`
      );
      setTimeout(() => setFeedbackBanner(null), 4500);
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmitDowntime = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeMachine) return;
    if (!selectedReasonCode.trim() || !selectedReasonName.trim()) {
      setFeedbackBanner('Selecione o código da ineficiência (P1 a P22).');
      return;
    }
    if (durationMinutes <= 0) {
      setFeedbackBanner('O tempo de parada deve ser maior que 0 minutos.');
      return;
    }

    setSubmitting(true);
    try {
      await onRecordDowntime({
        machine: activeMachine,
        reasonCode: selectedReasonCode.trim().toUpperCase().slice(0, 30),
        reasonName: selectedReasonName.trim().slice(0, 120),
        category: selectedReasonCategory,
        durationMinutes: Math.max(1, Math.min(1440, Math.round(durationMinutes))),
        operatorName: (operatorName.trim() || 'Operador').slice(0, 80),
        shift,
        notes: downtimeNotes.trim().slice(0, 250),
      });

      setDowntimeNotes('');
      setActiveStoppageStartMs(null);
      setFeedbackBanner(
        `Parada registrada na ${activeMachine.name}: [${selectedReasonCode} - ${selectedReasonName}] por ${durationMinutes} minutos.`
      );
      setTimeout(() => setFeedbackBanner(null), 4500);
    } finally {
      setSubmitting(false);
    }
  };

  const handleQuickTriggerStoppage = (code: string) => {
    const found = inefficiencyReasons.find(
      (r) => (r.code || '').toUpperCase() === code.toUpperCase()
    );
    if (found) {
      setSelectedReasonCode(found.code);
      setSelectedReasonName(found.name);
      setSelectedReasonCategory(found.category);
    }
    setTerminalMode('PARADA');
  };

  const handleMachineStatusClick = async (st: MachineStatus) => {
    setMachineStatus(st);
    if (st === 'PARADA') {
      setTerminalMode('PARADA');
    } else if (st === 'MANUTENCAO') {
      handleQuickTriggerStoppage('P1');
    } else if (st === 'SETUP') {
      handleQuickTriggerStoppage('P4');
    } else if (st === 'OPERANDO') {
      setTerminalMode('PRODUCAO');
    }
    if (activeMachine) {
      try {
        await onUpdateMachineJob(activeMachine.id, {
          status: st,
          currentProduct: productName.trim().slice(0, 120),
          currentPaCode: paCode.trim().toUpperCase().slice(0, 60),
          currentPart: partName.trim().slice(0, 120),
          currentPartCode: partCode.trim().toUpperCase().slice(0, 60),
          currentBatch: batchNumber.trim().toUpperCase().slice(0, 60),
        });
      } catch {
        // Ignore transient status sync error
      }
    }
  };

  // SCREEN 1: MACHINE LOGIN (Organized by the 4 Production Lines)
  if (!activeMachine) {
    const filteredMachines =
      selectedSectorFilter === 'ALL'
        ? machines
        : machines.filter((m) => m.sector === selectedSectorFilter);

    return (
      <div className="max-w-6xl mx-auto py-6 px-4 sm:px-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Left Column: Machine Login Card */}
          <div className="lg:col-span-5 bg-white border-t-4 border-t-[#081530] border-x border-b border-blue-900/15 rounded-xl p-6 sm:p-8 shadow-xs">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-6">
              <div>
                <p className="text-xs font-semibold text-[#1e3a8a]">
                  Acesso Individual por Máquina
                </p>
                <h1 className="text-xl font-bold text-[#081530] mt-0.5">
                  Login do Operador na Máquina
                </h1>
              </div>
              <Lock className="w-5 h-5 text-[#1e3a8a] shrink-0" />
            </div>

            <form onSubmit={handleStationLogin} className="space-y-4">
              <div>
                <label
                  htmlFor="station-dropdown"
                  className="block text-xs font-bold text-slate-900 mb-1.5 flex items-center justify-between"
                >
                  <span>1. Selecione o Posto / Máquina *</span>
                  <span className="text-[11px] font-semibold text-amber-700 font-mono">
                    {machines.length} disponíveis
                  </span>
                </label>
                <select
                  id="station-dropdown"
                  value={selectedStationId}
                  onChange={(e) => {
                    const mId = e.target.value;
                    setSelectedStationId(mId);
                    const found = machines.find((m) => m.id === mId);
                    if (found) {
                      setUsernameInput(found.username);
                      setPasswordInput(found.accessPin);
                      setLoginError(null);
                    }
                  }}
                  className="w-full h-12 px-3.5 bg-amber-50/70 border-2 border-amber-300 rounded-lg text-sm text-slate-900 font-bold focus:bg-white focus:border-amber-600 focus:outline-none transition-colors cursor-pointer"
                >
                  <option value="">-- Toque para escolher seu posto de trabalho --</option>
                  {SECTOR_LIST.map((sec) => {
                    const secMs = machines.filter((m) => m.sector === sec.id);
                    if (secMs.length === 0) return null;
                    return (
                      <optgroup key={sec.id} label={sec.label}>
                        {secMs.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.name} — Usuário: {m.username} (PIN: {m.accessPin})
                          </option>
                        ))}
                      </optgroup>
                    );
                  })}
                </select>
              </div>

              <div className="pt-1">
                <div className="flex items-center justify-between mb-1">
                  <label
                    htmlFor="machine-user"
                    className="block text-xs font-semibold text-slate-700"
                  >
                    2. Usuário da Máquina
                  </label>
                  <span className="text-[11px] text-slate-400">Preenchimento automático</span>
                </div>
                <input
                  id="machine-user"
                  type="text"
                  required
                  value={usernameInput}
                  onChange={(e) => setUsernameInput(e.target.value)}
                  placeholder="Ex: giben, selco, maclinea..."
                  className="w-full h-11 px-3.5 bg-slate-50 border border-slate-300 rounded-lg font-mono text-sm text-slate-900 focus:bg-white focus:border-amber-600 focus:outline-none transition-colors"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label
                    htmlFor="machine-pin"
                    className="block text-xs font-semibold text-slate-700"
                  >
                    3. Senha / PIN da Máquina *
                  </label>
                  {selectedStationId && (
                    <span className="text-[11px] font-mono text-emerald-700 font-bold">
                      PIN pré-carregado
                    </span>
                  )}
                </div>
                <input
                  id="machine-pin"
                  type="text"
                  required
                  value={passwordInput}
                  onChange={(e) => setPasswordInput(e.target.value)}
                  placeholder="Digite a senha / PIN"
                  className="w-full h-11 px-3.5 bg-slate-50 border border-slate-300 rounded-lg font-mono text-sm text-slate-900 focus:bg-white focus:border-amber-600 focus:outline-none transition-colors"
                />
              </div>

              {loginError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2.5 text-xs text-red-800">
                  <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                  <span>{loginError}</span>
                </div>
              )}

              <button
                type="submit"
                className="w-full h-12 bg-amber-600 hover:bg-amber-700 text-white font-extrabold text-sm rounded-lg transition-colors cursor-pointer flex items-center justify-center gap-2 whitespace-nowrap shadow-xs"
              >
                <KeyRound className="w-4 h-4" />
                Entrar no Terminal do Posto
              </button>
            </form>

            {/* Quick Helper for Cutting Operators */}
            <div className="mt-5 p-3.5 bg-blue-50/90 border border-blue-200 rounded-lg text-xs space-y-1.5">
              <p className="font-bold text-blue-950 flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                Credenciais Oficiais de Corte (Seccionadoras):
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-0.5">
                <button
                  type="button"
                  onClick={() => {
                    const m = machines.find((x) => x.username === 'giben');
                    if (m) handleQuickFillCredentials(m);
                  }}
                  className="text-left p-2 bg-white rounded border border-blue-200 hover:border-amber-500 transition-colors cursor-pointer"
                >
                  <p className="font-bold text-slate-900 text-[11px]">Seccionadora Giben</p>
                  <p className="text-[10px] text-slate-600 font-mono mt-0.5">
                    User: <strong>giben</strong> · PIN: <strong>1010</strong>
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const m = machines.find((x) => x.username === 'selco');
                    if (m) handleQuickFillCredentials(m);
                  }}
                  className="text-left p-2 bg-white rounded border border-blue-200 hover:border-amber-500 transition-colors cursor-pointer"
                >
                  <p className="font-bold text-slate-900 text-[11px]">Seccionadora Selco</p>
                  <p className="text-[10px] text-slate-600 font-mono mt-0.5">
                    User: <strong>selco</strong> · PIN: <strong>1020</strong>
                  </p>
                </button>
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
              <button
                type="button"
                onClick={() => setShowCredentialsGuide(!showCredentialsGuide)}
                className="text-xs font-semibold text-slate-600 hover:text-slate-900 underline cursor-pointer"
              >
                {showCredentialsGuide
                  ? 'Ocultar senhas no quadro ao lado'
                  : 'Exibir todos usuários e senhas'}
              </button>
              <span className="text-[11px] text-slate-400 font-mono">Multilínea MES</span>
            </div>
          </div>

          {/* Right Column: The 4 Lines & Their Respective Machines */}
          <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-6 sm:p-8">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100 mb-5">
              <div>
                <h2 className="text-base font-bold text-slate-900">
                  4 Linhas de Produção e Postos ({machines.length})
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Toque em <strong>Entrar Direto</strong> ou <strong>Preencher</strong> para acessar o posto imediatamente
                </p>
              </div>

              <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg overflow-x-auto">
                <button
                  type="button"
                  onClick={() => setSelectedSectorFilter('ALL')}
                  className={`px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                    selectedSectorFilter === 'ALL'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Todas
                </button>
                {SECTOR_LIST.map((sec) => (
                  <button
                    key={sec.id}
                    type="button"
                    onClick={() => setSelectedSectorFilter(sec.id)}
                    className={`px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                      selectedSectorFilter === sec.id
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {sec.shortLabel}
                  </button>
                ))}
              </div>
            </div>

            <div className="divide-y divide-slate-100">
              {filteredMachines.map((machine) => {
                const sectorMeta = SECTORS[machine.sector] || SECTORS.SECCIONADORA;
                return (
                  <div
                    key={machine.id}
                    className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50/80 px-2 rounded-lg transition-colors border border-transparent hover:border-slate-200"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                        <span className="font-bold text-[#1e3a8a] bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                          {sectorMeta.shortLabel} ({sectorMeta.primaryMetricUnit})
                        </span>
                        <span className="font-mono text-slate-900 bg-slate-100 px-1.5 py-0.5 rounded">
                          Usuário: <strong>{machine.username}</strong>
                        </span>
                        {showCredentialsGuide && (
                          <span className="font-mono text-amber-900 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200 font-bold">
                            Senha: {machine.accessPin}
                          </span>
                        )}
                      </div>
                      <p className="text-sm font-extrabold text-slate-900 mt-1 truncate">
                        {machine.name}
                      </p>
                      <p className="text-xs text-slate-500 mt-0.5 truncate">
                        Processando: {machine.currentPart || 'Aguardando peça'} (Módulo:{' '}
                        <span className="font-mono">{machine.currentPaCode || '—'}</span> · Lote:{' '}
                        <span className="font-mono">{machine.currentBatch || '—'}</span>)
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 shrink-0 w-full sm:w-auto mt-2 sm:mt-0">
                      <button
                        type="button"
                        onClick={() => handleQuickFillCredentials(machine)}
                        className="px-2.5 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded-lg transition-colors whitespace-nowrap cursor-pointer min-h-[38px]"
                        title="Preencher usuário e senha no formulário"
                      >
                        Preencher PIN
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setTerminalMode('PARADA');
                          onLoginMachine(machine);
                        }}
                        className="px-2.5 py-2 text-xs font-bold text-red-700 bg-red-50 hover:bg-red-100 border border-red-200 rounded-lg transition-colors whitespace-nowrap cursor-pointer flex items-center justify-center gap-1 min-h-[38px]"
                        title="Abrir tela de Parada de Máquina (P1 a P22) direto"
                      >
                        <Clock className="w-3.5 h-3.5" />
                        <span>Parada</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setTerminalMode('PRODUCAO');
                          onLoginMachine(machine);
                        }}
                        className="px-3.5 py-2 text-xs font-bold text-white bg-[#081530] hover:bg-[#1e3a8a] rounded-lg transition-colors whitespace-nowrap cursor-pointer min-h-[38px] text-center shadow-xs"
                      >
                        Entrar Direto
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* QUADRO COMPLETO DE TODOS OS CÓDIGOS CADASTRADOS PARA LANÇAMENTO (P1-P22 E PEÇAS/MÓDULOS) */}
        <div className="mt-8 bg-white border border-slate-200 rounded-xl p-6 sm:p-8 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100">
            <div>
              <h2 className="text-base sm:text-lg font-extrabold text-[#081530]">
                Todos os Códigos Cadastrados para Lançamento ({inefficiencyReasons.length} Códigos de Parada P1–P22 e {catalogParts.length} Peças)
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Consulte abaixo todos os códigos de parada de máquina (P1 a P22) e códigos de módulos/peças, ou gerencie na aba Cadastros
              </p>
            </div>
            {onNavigateToCatalog && (
              <button
                type="button"
                onClick={onNavigateToCatalog}
                className="px-4 py-2.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-lg transition-colors cursor-pointer whitespace-nowrap self-start sm:self-auto"
              >
                Gerenciar / Cadastrar Novos Códigos
              </button>
            )}
          </div>

          {/* 1. Todos os 22 Códigos de Parada (P1 a P22) */}
          <div>
            <h3 className="text-xs font-extrabold uppercase tracking-wider text-red-800 mb-3">
              Códigos de Parada de Linha por Ineficiência (P1 a P22)
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
              {inefficiencyReasons.map((r) => (
                <div
                  key={r.id}
                  className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg flex items-center gap-2.5"
                >
                  <span className="font-mono text-xs font-extrabold px-2 py-1 rounded bg-[#081530] text-amber-400 shrink-0">
                    {r.code}
                  </span>
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-slate-900 truncate">{r.name}</p>
                    <p className="text-[10px] text-slate-500 truncate">
                      {INEFFICIENCY_CATEGORIES[r.category] || r.category}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 2. Todos os Códigos de Módulos (PA) e Peças Cadastradas */}
          <div className="pt-4 border-t border-slate-100">
            <h3 className="text-xs font-extrabold uppercase tracking-wider text-[#081530] mb-3">
              Códigos de Módulos (PA) e Peças Cadastradas para Produção ({catalogParts.length})
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500 font-semibold">
                    <th className="py-2 pr-3">Código Módulo (PA)</th>
                    <th className="py-2 px-3">Código da Peça</th>
                    <th className="py-2 px-3">Descrição da Peça / Módulo</th>
                    <th className="py-2 px-3 text-right">Corte (m²)</th>
                    <th className="py-2 px-3 text-right">Pintura UV (m²)</th>
                    <th className="py-2 pl-3 text-right">Coladeira (m lin.)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {catalogParts.map((part) => {
                    const faces = part.uvFaces ?? 1;
                    const uvVal =
                      typeof part.uvSquareMeters === 'number'
                        ? part.uvSquareMeters
                        : Number(((part.squareMeters || 0) * faces).toFixed(4));
                    return (
                      <tr key={part.id} className="hover:bg-slate-50">
                        <td className="py-2 pr-3 font-mono font-bold text-[#1e3a8a]">
                          {part.paCode}
                        </td>
                        <td className="py-2 px-3 font-mono font-bold text-slate-900">
                          {part.partCode}
                        </td>
                        <td className="py-2 px-3">
                          <span className="font-semibold text-slate-900">{part.partName}</span>{' '}
                          <span className="text-slate-500">({part.productName})</span>
                        </td>
                        <td className="py-2 px-3 text-right font-mono font-bold text-slate-900">
                          {part.squareMeters} m²
                        </td>
                        <td className="py-2 px-3 text-right font-mono font-bold text-amber-800">
                          {uvVal} m² ({faces}L)
                        </td>
                        <td className="py-2 pl-3 text-right font-mono font-bold text-slate-900">
                          {part.linearMeters} m
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // SCREEN 2: LOGGED-IN MACHINE OPERATOR TERMINAL
  const sectorInfo = SECTORS[activeMachine.sector] || SECTORS.SECCIONADORA;
  const quickFrequentCodes = ['P1', 'P4', 'P3', 'P6', 'P7', 'P11', 'P12', 'P16'];

  return (
    <div className="max-w-7xl mx-auto py-4 sm:py-6 px-3 sm:px-6 space-y-4 sm:space-y-5">
      {/* Top Machine Banner with Native Sector Measurement + Downtime Summary */}
      <div className="bg-[#081530] border border-blue-900 text-white rounded-xl p-4 sm:p-6 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-sm">
        <div>
          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 text-xs text-blue-200">
            <span className="font-semibold text-amber-400">{sectorInfo.label}</span>
            <span aria-hidden="true">·</span>
            <span>Medida: {sectorInfo.primaryMetricLabel}</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono">Usuário: {activeMachine.username}</span>
          </div>
          <h1 className="text-lg sm:text-2xl font-bold tracking-tight mt-1">
            {activeMachine.name}
          </h1>
          <div className="flex flex-wrap items-center gap-2 sm:gap-4 text-xs text-blue-200 mt-1.5">
            <span>
              Produzido Hoje:{' '}
              <strong className="font-mono text-amber-400 text-xs sm:text-sm tabular-nums">
                {machineTodaySummary.todayPrimaryMetric.toLocaleString('pt-BR', {
                  minimumFractionDigits: activeMachine.sector === 'FURADEIRA' ? 0 : 2,
                  maximumFractionDigits: activeMachine.sector === 'FURADEIRA' ? 0 : 2,
                })}{' '}
                {sectorInfo.primaryMetricLabel}
              </strong>{' '}
              ({machineTodaySummary.todayPieces.toLocaleString('pt-BR')} pçs)
            </span>
            <span>·</span>
            <span>
              Paradas Hoje:{' '}
              <strong className="font-mono text-red-400 text-xs sm:text-sm tabular-nums">
                {machineTodaySummary.todayDowntimeMinutes} min
              </strong>
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 self-stretch sm:self-auto">
          <div className="flex items-center gap-1 bg-blue-950 border border-blue-800 p-1 rounded-lg overflow-x-auto max-w-full">
            {(['OPERANDO', 'SETUP', 'MANUTENCAO', 'PARADA'] as MachineStatus[]).map((st) => (
              <button
                key={st}
                type="button"
                onClick={() => handleMachineStatusClick(st)}
                className={`px-2.5 sm:px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                  machineStatus === st
                    ? st === 'PARADA' || st === 'MANUTENCAO'
                      ? 'bg-red-600 text-white'
                      : 'bg-amber-600 text-white'
                    : 'text-blue-200 hover:text-white'
                }`}
              >
                {st}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              type="button"
              onClick={() => setShowAllCodesModal(!showAllCodesModal)}
              className="flex-1 sm:flex-initial px-3 sm:px-3.5 py-2 text-xs font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-lg flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap cursor-pointer min-h-[40px]"
            >
              {showAllCodesModal ? 'Ocultar Códigos' : 'Códigos P1–P22'}
            </button>

            <button
              type="button"
              onClick={onLogoutMachine}
              className="flex-1 sm:flex-initial px-3 sm:px-4 py-2 text-xs font-semibold bg-blue-950 hover:bg-blue-900 border border-blue-800 text-blue-100 rounded-lg flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap cursor-pointer min-h-[40px]"
            >
              <LogOut className="w-4 h-4" />
              <span>Trocar</span>
            </button>
          </div>
        </div>
      </div>

      {/* EXPANDABLE TABLE OF ALL REGISTERED CODES INSIDE TERMINAL */}
      {showAllCodesModal && (
        <div className="bg-white border-2 border-[#081530] rounded-xl p-5 space-y-5 shadow-md">
          <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-200">
            <div>
              <h2 className="text-base font-extrabold text-[#081530]">
                Tabela Completa de Códigos Cadastrados para Lançamento
              </h2>
              <p className="text-xs text-slate-500">
                Toque em qualquer código de parada (P1 a P22) ou peça abaixo para selecioná-lo imediatamente nesta máquina
              </p>
            </div>
            <div className="flex items-center gap-2">
              {onNavigateToCatalog && (
                <button
                  type="button"
                  onClick={onNavigateToCatalog}
                  className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-lg cursor-pointer"
                >
                  Ir para Aba Cadastros (Criar/Editar Códigos)
                </button>
              )}
              <button
                type="button"
                onClick={() => setShowAllCodesModal(false)}
                className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-lg cursor-pointer"
              >
                Fechar
              </button>
            </div>
          </div>

          <div>
            <h3 className="text-xs font-extrabold uppercase text-red-800 mb-2">
              1. Códigos de Parada por Ineficiência (P1 a P22) — Toque para Selecionar
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
              {inefficiencyReasons.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => {
                    handleQuickTriggerStoppage(r.code);
                    setShowAllCodesModal(false);
                  }}
                  className="p-2.5 bg-slate-50 hover:bg-red-50 border border-slate-200 hover:border-red-400 rounded-lg flex items-center gap-2 text-left cursor-pointer transition-colors"
                >
                  <span className="font-mono text-xs font-extrabold px-2 py-1 rounded bg-[#081530] text-amber-400 shrink-0">
                    {r.code}
                  </span>
                  <span className="text-xs font-bold text-slate-900 truncate">{r.name}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="pt-3 border-t border-slate-100">
            <h3 className="text-xs font-extrabold uppercase text-[#081530] mb-2">
              2. Códigos de Módulos (PA) e Peças ({catalogParts.length}) — Toque para Selecionar
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {catalogParts.map((part) => (
                <button
                  key={part.id}
                  type="button"
                  onClick={() => {
                    handleSelectCatalogPart(part);
                    setTerminalMode('PRODUCAO');
                    setShowAllCodesModal(false);
                  }}
                  className="p-2.5 bg-slate-50 hover:bg-amber-50 border border-slate-200 hover:border-amber-500 rounded-lg text-left cursor-pointer transition-colors"
                >
                  <div className="flex items-center justify-between text-xs font-mono font-bold">
                    <span className="text-[#1e3a8a]">PA: {part.paCode}</span>
                    <span className="text-slate-900">Peça: {part.partCode}</span>
                  </div>
                  <p className="text-xs font-semibold text-slate-900 truncate mt-0.5">
                    {part.partName}
                  </p>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* BARRA DE ATALHO RÁPIDO DE PARADA DE MÁQUINA (SEMPRE VISÍVEL COM 1 TOQUE) */}
      <div className="bg-red-50/90 border border-red-200 rounded-xl p-3.5 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="flex items-center gap-2 shrink-0">
          <span className="w-2.5 h-2.5 rounded-full bg-red-600 animate-pulse" />
          <span className="text-xs font-extrabold text-red-950 uppercase tracking-wide">
            Atalho Rápido de Parada:
          </span>
          <span className="text-xs text-red-800 hidden sm:inline">
            Toque em um código para abrir a parada imediatamente
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {quickFrequentCodes.map((code) => {
            const reasonObj = inefficiencyReasons.find(
              (r) => (r.code || '').toUpperCase() === code
            );
            if (!reasonObj) return null;
            const isSelected =
              terminalMode === 'PARADA' &&
              selectedReasonCode.toUpperCase() === reasonObj.code.toUpperCase();
            return (
              <button
                key={code}
                type="button"
                onClick={() => handleQuickTriggerStoppage(code)}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                  isSelected
                    ? 'bg-red-700 text-white shadow-xs ring-2 ring-red-400'
                    : 'bg-white hover:bg-red-100 text-slate-900 border border-red-200'
                }`}
              >
                <span
                  className={`font-mono text-[11px] font-extrabold px-1.5 py-0.5 rounded ${
                    isSelected ? 'bg-red-900 text-amber-300' : 'bg-[#081530] text-amber-400'
                  }`}
                >
                  {reasonObj.code}
                </span>
                <span className="truncate max-w-[130px]">{reasonObj.name}</span>
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => setTerminalMode('PARADA')}
            className="px-3 py-1.5 rounded-lg text-xs font-extrabold bg-red-700 hover:bg-red-800 text-white cursor-pointer transition-colors"
          >
            Ver Todos (P1 a P22)
          </button>
        </div>
      </div>

      {/* Mode Switcher: Apontar Produção vs Apontar Parada por Ineficiência (P1-P22) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => setTerminalMode('PRODUCAO')}
          className={`p-4 rounded-xl border text-left transition-all cursor-pointer flex items-center justify-between ${
            terminalMode === 'PRODUCAO'
              ? 'bg-[#081530] text-white border-blue-900 shadow-sm'
              : 'bg-white text-slate-700 border-slate-200 hover:border-blue-300'
          }`}
        >
          <div>
            <p
              className={`text-xs font-bold uppercase tracking-wider ${
                terminalMode === 'PRODUCAO' ? 'text-amber-400' : 'text-slate-500'
              }`}
            >
              Modo 1 · Entrega de Peças e Metragem
            </p>
            <p className="text-base font-bold mt-0.5">
              Apontar Produção ({sectorInfo.primaryMetricUnit})
            </p>
          </div>
          <Layers
            className={`w-6 h-6 shrink-0 ${
              terminalMode === 'PRODUCAO' ? 'text-amber-400' : 'text-slate-400'
            }`}
          />
        </button>

        <button
          type="button"
          onClick={() => setTerminalMode('PARADA')}
          className={`p-4 rounded-xl border text-left transition-all cursor-pointer flex items-center justify-between ${
            terminalMode === 'PARADA'
              ? 'bg-red-900 text-white border-red-800 shadow-sm'
              : 'bg-white text-slate-700 border-slate-200 hover:border-red-300'
          }`}
        >
          <div>
            <p
              className={`text-xs font-bold uppercase tracking-wider ${
                terminalMode === 'PARADA' ? 'text-amber-300' : 'text-red-700'
              }`}
            >
              Modo 2 · Códigos P1 a P22
            </p>
            <p className="text-base font-bold mt-0.5">
              Apontar Parada de Máquina (P1 a P22)
            </p>
          </div>
          <Clock
            className={`w-6 h-6 shrink-0 ${
              terminalMode === 'PARADA' ? 'text-amber-300' : 'text-red-600'
            }`}
          />
        </button>
      </div>

      {/* DUPLICATE SCAN WARNING DIALOG (Alerta para o operador se o QR-Code já foi bipado) */}
      {duplicateScanWarning && (
        <div className="p-4 sm:p-5 bg-amber-500/10 border-2 border-amber-500 rounded-2xl shadow-lg space-y-3 animate-in fade-in slide-in-from-top-2">
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="p-2.5 rounded-xl bg-amber-500 text-slate-950 shrink-0 mt-0.5">
                <AlertTriangle className="w-6 h-6 animate-pulse" />
              </div>
              <div>
                <span className="inline-block px-2 py-0.5 rounded bg-amber-500 text-slate-950 font-black text-[11px] uppercase tracking-wider mb-1">
                  Atenção: QR-CODE já bipado anteriormente nesta linha!
                </span>
                <h3 className="text-base sm:text-lg font-extrabold text-[#081530]">
                  Lote {duplicateScanWarning.batchNumber} · Peça {duplicateScanWarning.partCode} — {duplicateScanWarning.partName}
                </h3>
                <p className="text-xs sm:text-sm text-slate-700 mt-1 leading-relaxed">
                  Esta peça já possui{' '}
                  <strong className="text-red-700 font-bold">
                    {duplicateScanWarning.previousCount} apontamento(s) anterior(es)
                  </strong>{' '}
                  neste setor, totalizando{' '}
                  <strong className="text-red-700 font-bold">
                    {duplicateScanWarning.totalAccumulatedQty.toLocaleString('pt-BR')} peças acumuladas
                  </strong>
                  .
                  {duplicateScanWarning.lastLog && (
                    <span className="block text-slate-600 mt-0.5 font-mono text-[11px]">
                      Último registro por {duplicateScanWarning.lastLog.operatorName} na máquina{' '}
                      {duplicateScanWarning.lastLog.machineName}
                      {duplicateScanWarning.lastLog.createdAt
                        ? ` às ${new Date(
                            duplicateScanWarning.lastLog.createdAt.seconds * 1000
                          ).toLocaleString('pt-BR')}`
                        : ''}
                      .
                    </span>
                  )}
                </p>
                <p className="text-xs font-bold text-amber-900 mt-2">
                  Deseja registrar esta nova pilha de {duplicateScanWarning.stackQty} peças (+{duplicateScanWarning.calculatedMeasure} {sectorInfo.primaryMetricLabel}) como produção adicional ou cancelar para evitar duplicidade?
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-amber-300/80">
            <button
              type="button"
              disabled={submitting}
              onClick={handleConfirmDuplicateScan}
              className="flex-1 sm:flex-initial px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-xs sm:text-sm rounded-xl cursor-pointer flex items-center justify-center gap-2 shadow-sm"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>Confirmar Apontamento Adicional (Nova Pilha)</span>
            </button>
            <button
              type="button"
              onClick={handleCancelDuplicateScan}
              className="flex-1 sm:flex-initial px-4 py-2.5 bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold text-xs sm:text-sm rounded-xl cursor-pointer flex items-center justify-center gap-1.5"
            >
              <span>Cancelar Leitura (Evitar Duplicidade)</span>
            </button>
          </div>
        </div>
      )}

      {feedbackBanner && !duplicateScanWarning && (
        <div
          className={`p-4 rounded-xl flex items-center justify-between gap-3 text-sm ${
            feedbackBanner.startsWith('⚠️')
              ? 'bg-amber-50 border-2 border-amber-400 text-amber-950 font-bold'
              : 'bg-emerald-50 border border-emerald-200 text-emerald-900'
          }`}
        >
          <div className="flex items-center gap-2.5">
            {feedbackBanner.startsWith('⚠️') ? (
              <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
            ) : (
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            )}
            <span className="font-medium">{feedbackBanner}</span>
          </div>
          <button
            type="button"
            onClick={() => setFeedbackBanner(null)}
            className="text-xs font-semibold underline whitespace-nowrap cursor-pointer"
          >
            Fechar
          </button>
        </div>
      )}

      {/* Main Split Interface */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Production Form OR Inefficiency Stoppage Form */}
        {terminalMode === 'PRODUCAO' ? (
          <form
            onSubmit={handleSubmitDelivery}
            className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-6 space-y-6"
          >
            {/* LEITOR DE QR-CODE DA FICHA DE IDENTIFICAÇÃO (BIPAGEM AUTOMÁTICA POR SETOR) */}
            <div className="p-4 bg-[#081530] text-white border-2 border-amber-500 rounded-xl space-y-3 shadow-sm">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <div className="p-2 rounded-lg bg-amber-500 text-slate-950 shrink-0">
                    <QrCode className="w-5 h-5" />
                  </div>
                  <div>
                    <span className="text-[10px] font-extrabold uppercase tracking-wider text-amber-400">
                      Leitura Rápida por QR-CODE · {sectorInfo.label}
                    </span>
                    <h2 className="text-sm sm:text-base font-extrabold text-white">
                      Ler / Bipar QR-CODE da Ficha de Identificação de Peças
                    </h2>
                  </div>
                </div>

                <label className="flex items-center gap-2 text-xs font-bold text-amber-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={autoSubmitOnScan}
                    onChange={(e) => setAutoSubmitOnScan(e.target.checked)}
                    className="accent-amber-500 w-4 h-4"
                  />
                  <span>Lançar metragem automaticamente ao ler QR-CODE</span>
                </label>
              </div>

              <div className="flex flex-col sm:flex-row gap-2">
                <button
                  type="button"
                  onClick={() => setIsCameraScannerOpen(true)}
                  className="px-4 h-11 bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold text-xs sm:text-sm rounded-lg cursor-pointer whitespace-nowrap flex items-center justify-center gap-2 shadow-md ring-2 ring-amber-300/60"
                >
                  <Camera className="w-5 h-5" />
                  <span>Abrir Câmera (Celular / Tablet)</span>
                </button>

                <div className="relative flex-1">
                  <QrCode className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={barcodeInput}
                    onChange={(e) => setBarcodeInput(e.target.value.toUpperCase())}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        if (barcodeInput.trim()) {
                          handleBarcodeScan(barcodeInput);
                        }
                      }
                    }}
                    placeholder="Ou use leitor sem fio / digite o QR-Code (Ex: M2605206|403411|80)..."
                    className="w-full h-11 pl-10 pr-3 bg-white text-slate-950 border-2 border-amber-400 rounded-lg font-mono text-xs sm:text-sm font-extrabold placeholder:text-slate-400 focus:outline-none"
                  />
                </div>
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => {
                    if (barcodeInput.trim()) {
                      handleBarcodeScan(barcodeInput);
                    } else {
                      setIsCameraScannerOpen(true);
                    }
                  }}
                  className="px-4 h-11 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-600 text-white font-extrabold text-xs rounded-lg cursor-pointer whitespace-nowrap flex items-center justify-center gap-1.5"
                >
                  <QrCode className="w-4 h-4" />
                  <span>{barcodeInput.trim() ? 'Processar QR-Code' : 'Ler QR-Code'}</span>
                </button>
              </div>

              {/* Simulador de Leitura QR-Code com 1 Clique */}
              <div className="pt-2 border-t border-blue-900/80 flex flex-wrap items-center justify-between gap-2 text-[11px]">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-blue-200 font-semibold">
                    Testar / Ler QR-Code com 1 Toque:
                  </span>
                  <button
                    type="button"
                    onClick={() => handleBarcodeScan('M2605206|403411|80')}
                    className="px-2.5 py-1 rounded bg-blue-900 hover:bg-amber-500 hover:text-slate-950 text-amber-300 font-mono font-bold cursor-pointer transition-colors"
                    title="Simular leitura do QR-Code da Ficha da foto: Lote M2605206 · Cód. 403411 TAMPO · Pilha de 80 pçs"
                  >
                    ⚡ Ler QR-Code Ficha Foto (M2605206 | 403411 TAMPO | 80 pçs)
                  </button>
                  {batchNumber && partCode && (
                    <button
                      type="button"
                      onClick={() =>
                        handleBarcodeScan(
                          buildTicketBarcode(batchNumber, partCode, quantityGood || 80)
                        )
                      }
                      className="px-2.5 py-1 rounded bg-emerald-800 hover:bg-emerald-600 text-white font-mono font-bold cursor-pointer transition-colors"
                    >
                      ⚡ Ler QR-Code Peça Atual ({batchNumber}|{partCode}|{quantityGood || 80})
                    </button>
                  )}
                </div>

                {/* Botão para abrir e imprimir a Ficha de Identificação com QR-Code diretamente na Seccionadora / Terminal */}
                <button
                  type="button"
                  onClick={() => {
                    const ord =
                      productionOrders.find(
                        (o) =>
                          o.batchNumber.trim().toUpperCase() === batchNumber.trim().toUpperCase()
                      ) ||
                      productionOrders.find((o) => o.batchNumber === 'M2605206') ||
                      productionOrders[0];
                    if (ord) setTerminalTicketOrder(ord);
                  }}
                  className="px-3 py-1 rounded bg-white/10 hover:bg-white/20 text-white font-bold flex items-center gap-1.5 cursor-pointer"
                >
                  <Printer className="w-3.5 h-3.5 text-amber-400" />
                  <span>Ver / Imprimir Ficha c/ QR-CODE</span>
                </button>
              </div>
            </div>

            {/* PLANO MESTRE DE PRODUÇÃO (PMP): SELEÇÃO POR ENCOMENDA E LOTE */}
            {productionOrders.length > 0 && (
              <div className="p-4 bg-blue-50/70 border border-blue-200 rounded-xl space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <h2 className="text-sm font-extrabold text-[#081530]">
                      Programação por Encomenda (Plano Mestre de Produção)
                    </h2>
                    <p className="text-xs text-slate-600">
                      Selecione a Encomenda e toque no Lote para carregar Código, Produto e Lote automaticamente
                    </p>
                  </div>
                </div>

                {/* Encomenda Filter Pills */}
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
                  <button
                    type="button"
                    onClick={() => setSelectedOrderEncomenda('ALL')}
                    className={`px-3 py-1.5 text-xs font-extrabold rounded-lg whitespace-nowrap cursor-pointer ${
                      selectedOrderEncomenda === 'ALL'
                        ? 'bg-[#081530] text-amber-400'
                        : 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    Todas as Encomendas ({productionOrders.length} lotes)
                  </button>
                  {Array.from(
                    new Set(productionOrders.map((o) => (o.orderCode || 'GERAL').toUpperCase()))
                  ).map((enc) => (
                    <button
                      key={enc}
                      type="button"
                      onClick={() => setSelectedOrderEncomenda(enc)}
                      className={`px-3 py-1.5 text-xs font-mono font-extrabold rounded-lg whitespace-nowrap cursor-pointer ${
                        selectedOrderEncomenda === enc
                          ? 'bg-amber-500 text-slate-950 shadow-2xs'
                          : 'bg-white border border-slate-300 text-[#081530] hover:bg-slate-100'
                      }`}
                    >
                      Encomenda {enc}
                    </button>
                  ))}
                </div>

                {/* Lote Cards for Selected Encomenda */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-44 overflow-y-auto pr-1">
                  {productionOrders
                    .filter(
                      (o) =>
                        selectedOrderEncomenda === 'ALL' ||
                        (o.orderCode || '').toUpperCase() === selectedOrderEncomenda
                    )
                    .map((order) => {
                      const isCurrentBatch =
                        batchNumber.toUpperCase() === order.batchNumber.toUpperCase();
                      const stageDate =
                        activeMachine.sector === 'SECCIONADORA'
                          ? order.dateCorte
                          : activeMachine.sector === 'COLADEIRA'
                          ? order.dateColadeira
                          : activeMachine.sector === 'FURADEIRA'
                          ? order.dateFuradeira
                          : order.datePintura;

                      return (
                        <button
                          key={order.id}
                          type="button"
                          onClick={() => {
                            setPaCode(order.productCode);
                            setSelectedModulePaCode(order.productCode.toUpperCase());
                            setProductName(
                              `${order.productLine} - ${order.productDescription} (${order.finishColor})`
                            );
                            setBatchNumber(order.batchNumber);
                            const matchingParts = catalogParts.filter(
                              (cp) =>
                                (cp.paCode || '').toUpperCase() ===
                                order.productCode.toUpperCase()
                            );
                            if (matchingParts.length > 0) {
                              setPartName(matchingParts[0].partName);
                              setPartCode(matchingParts[0].partCode);
                            } else {
                              setPartName(order.productDescription);
                              setPartCode(`PEC-${order.productCode}`);
                            }
                            const prodQty = getOrderProductQty(order);
                            const firstPartMult = Math.max(
                              1,
                              Math.round(matchingParts[0]?.piecesPerProduct || 1)
                            );
                            if (prodQty > 0) {
                              setQuantityGood(prodQty * firstPartMult);
                            }
                          }}
                          className={`p-2.5 rounded-lg border text-left transition-all cursor-pointer ${
                            isCurrentBatch
                              ? 'bg-[#081530] text-white border-blue-900 ring-2 ring-amber-400'
                              : order.isHighlighted
                              ? 'bg-amber-100/90 border-amber-400 text-slate-900'
                              : 'bg-white border-slate-200 hover:border-blue-400 text-slate-900'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2 text-[11px] font-mono">
                            <span
                              className={`font-extrabold ${
                                isCurrentBatch ? 'text-amber-400' : 'text-red-800'
                              }`}
                            >
                              Lote: {order.batchNumber} (Enc. {order.orderCode})
                            </span>
                            <span
                              className={`font-bold ${
                                isCurrentBatch ? 'text-blue-200' : 'text-slate-700'
                              }`}
                            >
                              Cód: {order.productCode}
                            </span>
                          </div>
                          <p className="text-xs font-bold truncate mt-0.5">
                            {order.productDescription}
                          </p>
                          <div
                            className={`flex items-center justify-between text-[10px] font-mono mt-0.5 ${
                              isCurrentBatch ? 'text-blue-200' : 'text-slate-500'
                            }`}
                          >
                            <span>
                              {order.productLine} · {getOrderProductQty(order)} prod.
                              {getOrderVolumesPerProduct(order) > 1
                                ? ` (${getOrderTotalVolumes(order)} vol. 1/${getOrderVolumesPerProduct(order)}..${getOrderVolumesPerProduct(order)}/${getOrderVolumesPerProduct(order)})`
                                : ''}
                            </span>
                            <span>Data Etapa: {stageDate}</span>
                          </div>
                        </button>
                      );
                    })}
                </div>
              </div>
            )}

            {/* EASY ACCESS MODULE & PART SELECTOR FOR ~180 MODULES */}
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h2 className="text-sm font-bold text-slate-900">
                    1. Seleção Rápida de Módulo (PA) e Peça
                  </h2>
                  <p className="text-xs text-slate-500">
                    Pesquise entre os módulos ou filtre para carregar a peça com um toque
                  </p>
                </div>

                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={moduleSearch}
                    onChange={(e) => setModuleSearch(e.target.value)}
                    placeholder="Buscar módulo, PA ou peça..."
                    className="h-9 pl-8 pr-3 bg-white border border-slate-300 rounded-lg text-xs text-slate-900 focus:border-amber-600 focus:outline-none w-full sm:w-56"
                  />
                </div>
              </div>

              {/* Filter by Module PA Pills */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
                <button
                  type="button"
                  onClick={() => setSelectedModulePaCode('ALL')}
                  className={`px-2.5 py-1 text-xs font-semibold rounded-md whitespace-nowrap cursor-pointer ${
                    selectedModulePaCode === 'ALL'
                      ? 'bg-[#081530] text-white'
                      : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  Todos os Módulos ({distinctModules.length})
                </button>
                {distinctModules.map(([code, name]) => (
                  <button
                    key={code}
                    type="button"
                    onClick={() => setSelectedModulePaCode(code)}
                    className={`px-2.5 py-1 text-xs font-semibold rounded-md whitespace-nowrap cursor-pointer ${
                      selectedModulePaCode === code
                        ? 'bg-amber-600 text-white'
                        : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    {code} · {name.slice(0, 22)}
                  </button>
                ))}
              </div>

                {/* Tap-to-Select Part Cards with Delivered Count for Active Lote */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-56 overflow-y-auto pr-1">
                {filteredCatalogForOperator.map((part) => {
                  const isSelected = partCode.toUpperCase() === part.partCode.toUpperCase();
                  const uvFacesCount = part.uvFaces ?? 1;
                  const uvVal =
                    typeof part.uvSquareMeters === 'number'
                      ? part.uvSquareMeters
                      : Number(((part.squareMeters || 0) * uvFacesCount).toFixed(4));
                  const metricText =
                    activeMachine.sector === 'COLADEIRA'
                      ? `${part.linearMeters ?? 0} m lin./pç`
                      : activeMachine.sector === 'FURADEIRA'
                      ? `1 pç furada`
                      : activeMachine.sector === 'LINHA_UV'
                      ? `${uvVal} m² UV/pç (${uvFacesCount} ${uvFacesCount === 1 ? 'lado' : 'lados'})`
                      : `${part.squareMeters} m² Corte/pç`;

                  // Delivered pieces of this specific part for the currently selected Batch (Lote) in this Sector
                  const deliveredInSectorForBatch = logs
                    .filter(
                      (l) =>
                        l.sector === activeMachine.sector &&
                        (l.batchNumber || '').trim().toUpperCase() ===
                          batchNumber.trim().toUpperCase() &&
                        (l.partCode || '').trim().toUpperCase() ===
                          part.partCode.trim().toUpperCase()
                    )
                    .reduce((acc, l) => acc + l.quantityGood, 0);

                  return (
                    <button
                      key={part.id}
                      type="button"
                      onClick={() => handleSelectCatalogPart(part)}
                      className={`p-2.5 rounded-lg border text-left transition-colors cursor-pointer ${
                        isSelected
                          ? 'bg-amber-50 border-amber-600 ring-1 ring-amber-500'
                          : deliveredInSectorForBatch > 0
                          ? 'bg-emerald-50/60 border-emerald-300 hover:border-emerald-500'
                          : 'bg-white border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 text-[11px] font-mono">
                        <span className="font-bold text-[#1e3a8a]">Cód. Prod: {part.paCode}</span>
                        <span className="font-semibold text-slate-700">{part.partCode}</span>
                      </div>
                      <p className="text-xs font-bold text-slate-900 truncate mt-0.5">
                        {part.partName}
                      </p>
                      <div className="flex items-center justify-between gap-2 mt-1">
                        <span className="text-[11px] text-slate-500 font-mono">
                          {metricText} · {part.dimensions}
                        </span>
                        {batchNumber && (
                          <span
                            className={`text-[10px] font-mono font-extrabold px-1.5 py-0.5 rounded ${
                              deliveredInSectorForBatch > 0
                                ? 'bg-emerald-600 text-white'
                                : 'bg-slate-200 text-slate-700'
                            }`}
                          >
                            Entregue Lote {batchNumber}: {deliveredInSectorForBatch} pçs
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* RESUMO DE PEÇAS JÁ ENTREGUES DO LOTE X CÓDIGO DE PRODUTO SELECIONADO */}
              {batchNumber && (
                <div className="pt-2 border-t border-slate-200">
                  <div className="flex items-center justify-between text-xs font-bold text-[#081530] mb-1.5">
                    <span>
                      Peças já entregues do Lote{' '}
                      <strong className="font-mono text-red-800">{batchNumber}</strong>
                      {paCode ? (
                        <>
                          {' '}
                          × Cód. Produto{' '}
                          <strong className="font-mono text-[#1e3a8a]">{paCode}</strong>
                        </>
                      ) : null}{' '}
                      neste setor ({sectorInfo.shortLabel}):
                    </span>
                  </div>
                  {(() => {
                    const batchLogs = logs.filter(
                      (l) =>
                        l.sector === activeMachine.sector &&
                        (l.batchNumber || '').trim().toUpperCase() ===
                          batchNumber.trim().toUpperCase() &&
                        (!paCode ||
                          !l.paCode ||
                          l.paCode.trim().toUpperCase() === paCode.trim().toUpperCase())
                    );
                    if (batchLogs.length === 0) {
                      return (
                        <p className="text-[11px] text-slate-500 font-mono">
                          Nenhuma peça entregue ainda neste setor para o Lote {batchNumber}.
                        </p>
                      );
                    }
                    const grouped = new Map<string, { code: string; name: string; qty: number }>();
                    batchLogs.forEach((l) => {
                      const k = (l.partCode || l.partName).toUpperCase();
                      const prev = grouped.get(k) || {
                        code: l.partCode,
                        name: l.partName,
                        qty: 0,
                      };
                      prev.qty += l.quantityGood;
                      grouped.set(k, prev);
                    });
                    return (
                      <div className="flex flex-wrap gap-1.5">
                        {Array.from(grouped.values()).map((g) => (
                          <span
                            key={g.code}
                            className="px-2.5 py-1 rounded-md bg-emerald-100 border border-emerald-300 text-emerald-950 font-mono text-xs font-bold"
                          >
                            ✓ {g.code} ({g.name}): {g.qty} pçs entregues
                          </span>
                        ))}
                      </div>
                    );
                  })()}
                </div>
              )}
            </div>

            {/* Selected Part, PA, Code & Batch Details */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Módulo / Produto Acabado *
                </label>
                <input
                  type="text"
                  required
                  value={productName}
                  onChange={(e) => setProductName(e.target.value)}
                  placeholder="Ex: Módulo Roupeiro 6 Portas Modena"
                  className="w-full h-11 px-3 bg-slate-50 border border-slate-300 rounded-lg text-sm text-slate-900 focus:bg-white focus:border-amber-600 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Código do Módulo (PA) *
                </label>
                <input
                  type="text"
                  required
                  value={paCode}
                  onChange={(e) => setPaCode(e.target.value.toUpperCase())}
                  placeholder="Ex: MOD-001"
                  className="w-full h-11 px-3 bg-slate-50 border border-slate-300 rounded-lg font-mono text-sm font-bold text-[#1e3a8a] focus:bg-white focus:border-amber-600 focus:outline-none"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Peça em Processamento *
                </label>
                <input
                  type="text"
                  required
                  value={partName}
                  onChange={(e) => setPartName(e.target.value)}
                  placeholder="Ex: Lateral Direita 2300x560x15mm"
                  className="w-full h-11 px-3 bg-slate-50 border border-slate-300 rounded-lg text-sm text-slate-900 focus:bg-white focus:border-amber-600 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Código da Peça *
                </label>
                <input
                  type="text"
                  required
                  value={partCode}
                  onChange={(e) => {
                    const newPart = e.target.value.toUpperCase();
                    setPartCode(newPart);
                    const cleanP = newPart.trim();
                    const cleanPa = paCode.trim().toUpperCase();

                    // Prioritize finding a part that matches BOTH the part code and the current module/product
                    const catPart =
                      (cleanPa
                        ? catalogParts.find(
                            (c) =>
                              c.partCode.trim().toUpperCase() === cleanP &&
                              (c.paCode || '').trim().toUpperCase() === cleanPa
                          )
                        : null) ||
                      catalogParts.find(
                        (c) => c.partCode.trim().toUpperCase() === cleanP
                      );

                    if (catPart) {
                      handleSelectCatalogPart(catPart);
                    } else if (cleanP === '402999') {
                      setPartName((prev) => prev || 'PORTA BASCULANTE 770X500');
                      if (!paCode) {
                        setPaCode('500698');
                        setProductName('RAINHA - BALC. 1PT BASC 1GV NESHER 80CM• ENCAB');
                      }
                      if (activeMachine?.sector === 'SECCIONADORA') {
                        setManualUnitMetric(0.39);
                      } else if (activeMachine?.sector === 'COLADEIRA') {
                        setManualUnitMetric(2.54);
                      } else if (activeMachine?.sector === 'LINHA_UV') {
                        setManualUnitMetric(0.78);
                      }
                    }
                  }}
                  placeholder="Ex: PEC-MOD-001"
                  className="w-full h-11 px-3 bg-slate-50 border border-slate-300 rounded-lg font-mono text-sm font-semibold text-slate-900 focus:bg-white focus:border-amber-600 focus:outline-none"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Lote de Produção *
                </label>
                <input
                  type="text"
                  required
                  value={batchNumber}
                  onChange={(e) => {
                    const newBatch = e.target.value.toUpperCase();
                    setBatchNumber(newBatch);
                    const cleanB = newBatch.trim();
                    if (cleanB === 'I2603604') {
                      setPaCode('500698');
                      setProductName('RAINHA - BALC. 1PT BASC 1GV NESHER 80CM• ENCAB');
                    } else {
                      const matchedOrder = productionOrders.find(
                        (o) => o.batchNumber.trim().toUpperCase() === cleanB
                      );
                      if (matchedOrder) {
                        setPaCode(matchedOrder.productCode);
                        setProductName(
                          `${matchedOrder.productLine} - ${matchedOrder.productDescription}`
                        );
                      }
                    }
                  }}
                  placeholder="Ex: LOTE-2026-104"
                  className="w-full h-11 px-3 bg-slate-50 border border-slate-300 rounded-lg font-mono text-sm font-bold text-slate-900 focus:bg-white focus:border-amber-600 focus:outline-none"
                />
              </div>

              <div className="flex items-end">
                <button
                  type="button"
                  disabled={submitting}
                  onClick={handleSyncActiveJobToMachine}
                  className="w-full h-11 px-3 text-xs font-semibold text-[#081530] bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
                >
                  Fixar na Máquina
                </button>
              </div>
            </div>

            {/* VÍNCULO DIRETO: LOTE PROGRAMADO X REALIZADO (EX: I2603605 -> 300 V01 DO CÓD 500738) */}
            {(() => {
              const cleanB = batchNumber.trim().toUpperCase();
              const cleanP = paCode.trim().toUpperCase();
              const linkedOrder =
                productionOrders.find(
                  (o) =>
                    o.batchNumber.toUpperCase() === cleanB &&
                    (!cleanP || o.productCode.toUpperCase() === cleanP)
                ) ||
                productionOrders.find((o) => o.batchNumber.toUpperCase() === cleanB);

              if (!linkedOrder) return null;

              const plannedProducts = getOrderProductQty(linkedOrder);
              const totalVolumes = getOrderTotalVolumes(linkedOrder);
              const volsPerProd = getOrderVolumesPerProduct(linkedOrder);
              const partMult = Math.max(1, Math.round(selectedPartObj?.piecesPerProduct || 1));
              const plannedPartQty = plannedProducts * partMult;

              // Delivered in this sector for this batch & current part (or overall batch if no specific part match)
              const deliveredForCurrentPart = logs
                .filter(
                  (l) =>
                    l.sector === activeMachine.sector &&
                    (l.batchNumber || '').trim().toUpperCase() === cleanB &&
                    (!partCode ||
                      (l.partCode || '').trim().toUpperCase() ===
                        partCode.trim().toUpperCase())
                )
                .reduce((acc, l) => acc + l.quantityGood, 0);

              const remainingToDeliver = Math.max(0, plannedPartQty - deliveredForCurrentPart);
              const afterThisDelivery = deliveredForCurrentPart + (Number(quantityGood) || 0);
              const pctDone =
                plannedPartQty > 0
                  ? Math.min(100, Math.round((deliveredForCurrentPart / plannedPartQty) * 100))
                  : 0;

              const volBreakdown = [
                linkedOrder.qtyV01 > 0
                  ? `${linkedOrder.qtyV01} vol${volsPerProd > 1 ? ` 1/${volsPerProd}` : ' V01'}`
                  : null,
                linkedOrder.qtyV02 > 0
                  ? `${linkedOrder.qtyV02} vol${volsPerProd > 1 ? ` 2/${volsPerProd}` : ' V02'}`
                  : null,
                linkedOrder.qtyV03 > 0
                  ? `${linkedOrder.qtyV03} vol${volsPerProd > 1 ? ` 3/${volsPerProd}` : ' V03'}`
                  : null,
              ]
                .filter(Boolean)
                .join(' + ');

              return (
                <div className="p-4 bg-amber-50/90 border-2 border-amber-500 rounded-xl space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <span className="text-[11px] font-extrabold uppercase tracking-wider text-amber-900">
                        Vínculo Lote Programado × Realizado ({sectorInfo.shortLabel})
                      </span>
                      <h3 className="text-sm font-extrabold text-[#081530]">
                        Lote {linkedOrder.batchNumber} · Cód. {linkedOrder.productCode} —{' '}
                        {linkedOrder.productDescription}
                      </h3>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5 font-mono text-xs font-extrabold">
                      <span className="px-2.5 py-1 rounded bg-[#081530] text-amber-400">
                        Lote: {plannedProducts} Produtos
                      </span>
                      {volsPerProd > 1 && (
                        <span className="px-2.5 py-1 rounded bg-amber-200 text-amber-950 border border-amber-400">
                          {totalVolumes} Volumes ({volBreakdown})
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center font-mono">
                    <div className="p-2 bg-white border border-amber-300 rounded-lg">
                      <p className="text-[10px] font-sans font-bold text-slate-500 uppercase">
                        Meta Peça no Lote ({partMult}x/prod.)
                      </p>
                      <p className="text-base font-extrabold text-[#081530]">
                        {plannedPartQty} pçs
                      </p>
                    </div>
                    <div className="p-2 bg-white border border-amber-300 rounded-lg">
                      <p className="text-[10px] font-sans font-bold text-slate-500 uppercase">
                        Já Entregue
                      </p>
                      <p className="text-base font-extrabold text-emerald-700">
                        {deliveredForCurrentPart} pçs ({pctDone}%)
                      </p>
                    </div>
                    <div className="p-2 bg-white border border-amber-300 rounded-lg">
                      <p className="text-[10px] font-sans font-bold text-slate-500 uppercase">
                        Saldo Restante
                      </p>
                      <p className="text-base font-extrabold text-red-700">
                        Faltam {remainingToDeliver}
                      </p>
                    </div>
                    <div className="p-2 bg-[#081530] text-white rounded-lg">
                      <p className="text-[10px] font-sans font-bold text-blue-200 uppercase">
                        Após Esta Entrega
                      </p>
                      <p className="text-base font-extrabold text-amber-400">
                        {afterThisDelivery} / {plannedPartQty}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                    <div className="flex-1 min-w-[180px] h-2.5 bg-amber-200 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-emerald-600 transition-all"
                        style={{ width: `${pctDone}%` }}
                      />
                    </div>
                    {remainingToDeliver > 0 && (
                      <button
                        type="button"
                        onClick={() => setQuantityGood(remainingToDeliver)}
                        className="px-3 py-1.5 bg-[#081530] hover:bg-blue-950 text-amber-400 text-xs font-extrabold rounded-lg cursor-pointer"
                      >
                        Preencher Saldo Restante ({remainingToDeliver} pçs)
                      </button>
                    )}
                  </div>
                </div>
              );
            })()}

            {/* Touch-Friendly Quantity Steppers + Real-Time Sector Measurement Preview */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl">
                <label className="block text-xs font-semibold text-slate-700 mb-2">
                  Quantidade de Peças Processadas *
                </label>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setQuantityGood(Math.max(0, quantityGood - 50))}
                    className="w-10 h-11 bg-white border border-slate-300 hover:bg-slate-100 rounded-lg flex items-center justify-center text-slate-700 font-mono text-xs font-bold cursor-pointer shrink-0"
                  >
                    -50
                  </button>
                  <button
                    type="button"
                    onClick={() => setQuantityGood(Math.max(0, quantityGood - 10))}
                    className="w-10 h-11 bg-white border border-slate-300 hover:bg-slate-100 rounded-lg flex items-center justify-center text-slate-700 font-mono text-xs font-bold cursor-pointer shrink-0"
                  >
                    -10
                  </button>
                  <input
                    type="number"
                    min={0}
                    max={100000}
                    value={quantityGood}
                    onChange={(e) => setQuantityGood(Number(e.target.value))}
                    className="w-full h-11 px-2 bg-white border border-slate-300 rounded-lg text-center font-mono text-lg font-bold text-slate-900 tabular-nums"
                  />
                  <button
                    type="button"
                    onClick={() => setQuantityGood(quantityGood + 10)}
                    className="w-10 h-11 bg-white border border-slate-300 hover:bg-slate-100 rounded-lg flex items-center justify-center text-slate-700 font-mono text-xs font-bold cursor-pointer shrink-0"
                  >
                    +10
                  </button>
                  <button
                    type="button"
                    onClick={() => setQuantityGood(quantityGood + 50)}
                    className="w-10 h-11 bg-white border border-slate-300 hover:bg-slate-100 rounded-lg flex items-center justify-center text-slate-700 font-mono text-xs font-bold cursor-pointer shrink-0"
                  >
                    +50
                  </button>
                </div>
              </div>

              {/* Live Box Showing the Sector's Specific Measurement Being Generated */}
              <div className="p-4 bg-[#081530] border border-blue-900 text-white rounded-xl flex flex-col justify-between">
                <div className="flex items-center justify-between text-xs text-blue-200">
                  <span>Medida do Processo ({sectorInfo.shortLabel}):</span>
                  <span className="font-mono text-amber-400">
                    {activeMachine.sector === 'FURADEIRA'
                      ? '1 pç = 1 pç furada'
                      : `${unitMeasurement} ${sectorInfo.primaryMetricShort}/pç`}
                  </span>
                </div>
                <div className="my-1">
                  <span className="text-2xl font-bold font-mono text-amber-400 tabular-nums">
                    {totalMeasuredForDelivery.toLocaleString('pt-BR', {
                      minimumFractionDigits: activeMachine.sector === 'FURADEIRA' ? 0 : 2,
                      maximumFractionDigits: activeMachine.sector === 'FURADEIRA' ? 0 : 2,
                    })}{' '}
                  </span>
                  <span className="text-xs font-semibold text-white">
                    {sectorInfo.primaryMetricLabel}
                  </span>
                </div>
                <p className="text-[11px] text-blue-300/80">
                  {quantityGood} peças × {unitMeasurement} {sectorInfo.primaryMetricShort}/pç = {totalMeasuredForDelivery.toLocaleString('pt-BR')} {sectorInfo.primaryMetricShort}
                </p>
                {selectedPartObj && selectedPartObj.piecesPerProduct && selectedPartObj.piecesPerProduct > 1 && (
                  <p className="text-[10px] text-amber-300 font-mono mt-0.5">
                    Consumo por produto ({selectedPartObj.piecesPerProduct} pçs): {(unitMeasurement * selectedPartObj.piecesPerProduct).toFixed(4)} {sectorInfo.primaryMetricShort}
                  </p>
                )}
              </div>
            </div>

            {/* Operator, Shift & Scrap */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Operador Responsável *
                </label>
                <input
                  type="text"
                  required
                  value={operatorName}
                  onChange={(e) => setOperatorName(e.target.value)}
                  className="w-full h-10 px-3 bg-slate-50 border border-slate-300 rounded-lg text-sm text-slate-900"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Turno
                </label>
                <select
                  value={shift}
                  onChange={(e) => setShift(e.target.value as ShiftId)}
                  className="w-full h-10 px-3 bg-slate-50 border border-slate-300 rounded-lg text-sm text-slate-900"
                >
                  {(Object.keys(SHIFTS) as ShiftId[]).map((sh) => (
                    <option key={sh} value={sh}>
                      {SHIFTS[sh]}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Refugo / Quebra (pçs)
                </label>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setQuantityScrap(Math.max(0, quantityScrap - 1))}
                    className="w-9 h-10 bg-slate-100 rounded-lg flex items-center justify-center text-slate-700 cursor-pointer"
                  >
                    <Minus className="w-3.5 h-3.5" />
                  </button>
                  <input
                    type="number"
                    min={0}
                    value={quantityScrap}
                    onChange={(e) => setQuantityScrap(Number(e.target.value))}
                    className="w-full h-10 px-2 bg-slate-50 border border-slate-300 rounded-lg text-center font-mono text-sm font-bold text-red-700 tabular-nums"
                  />
                  <button
                    type="button"
                    onClick={() => setQuantityScrap(quantityScrap + 1)}
                    className="w-9 h-10 bg-slate-100 rounded-lg flex items-center justify-center text-slate-700 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full h-13 bg-amber-600 hover:bg-amber-700 disabled:bg-slate-400 text-white font-bold text-sm rounded-xl transition-colors cursor-pointer flex items-center justify-center gap-2 whitespace-nowrap"
            >
              <UserCheck className="w-5 h-5" />
              {submitting
                ? 'Registrando Produção...'
                : `Apontar ${totalMeasuredForDelivery.toLocaleString('pt-BR')} ${
                    sectorInfo.primaryMetricLabel
                  } (${quantityGood} pçs)`}
            </button>
          </form>
        ) : (
          /* MODE 2: APONTAR PARADA POR INEFICIÊNCIA (P1 - P22) — REDESIGNED FOR 1-TAP EASE */
          <form
            onSubmit={handleSubmitDowntime}
            className="lg:col-span-7 bg-white border-t-4 border-t-red-800 border-x border-b border-slate-200 rounded-xl p-5 sm:p-6 space-y-5"
          >
            {/* STEP 1: FULL P1 TO P22 TOUCH BOARD (NO HIDDEN SCROLLBOX) */}
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3.5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h2 className="text-base font-extrabold text-slate-900">
                    1. Toque no Motivo da Parada (P1 a P22)
                  </h2>
                  <p className="text-xs text-slate-600">
                    Todos os 22 códigos visíveis em ordem numérica para seleção imediata
                  </p>
                </div>

                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={inefSearch}
                    onChange={(e) => setInefSearch(e.target.value)}
                    placeholder="Filtrar P1 a P22..."
                    className="h-9 pl-8 pr-3 bg-white border border-slate-300 rounded-lg text-xs text-slate-900 focus:border-red-600 focus:outline-none w-full sm:w-48"
                  />
                </div>
              </div>

              {/* Category Filter Pills */}
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setInefCategoryFilter('ALL')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                    inefCategoryFilter === 'ALL'
                      ? 'bg-[#081530] text-white'
                      : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  Todos ({inefficiencyReasons.length})
                </button>
                {(Object.keys(INEFFICIENCY_CATEGORIES) as InefficiencyCategory[]).map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setInefCategoryFilter(cat)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                      inefCategoryFilter === cat
                        ? 'bg-red-700 text-white'
                        : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    {INEFFICIENCY_CATEGORIES[cat]}
                  </button>
                ))}
              </div>

              {/* Full P1 - P22 Touch Grid (3 columns on desktop, all visible without cramped scroll) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2">
                {filteredInefficiencyReasons.map((reason) => {
                  const isSelected =
                    selectedReasonCode.toUpperCase() === reason.code.toUpperCase();
                  return (
                    <button
                      key={reason.id}
                      type="button"
                      onClick={() => handleSelectInefficiencyReason(reason)}
                      className={`p-3 rounded-xl border text-left transition-all cursor-pointer flex items-center gap-2.5 ${
                        isSelected
                          ? 'bg-red-700 text-white border-red-800 shadow-sm ring-2 ring-red-400'
                          : 'bg-white text-slate-900 border-slate-200 hover:border-red-400 hover:bg-red-50/40'
                      }`}
                    >
                      <span
                        className={`font-mono text-sm font-extrabold px-2.5 py-1.5 rounded-lg shrink-0 ${
                          isSelected
                            ? 'bg-white text-red-800'
                            : 'bg-[#081530] text-amber-400'
                        }`}
                      >
                        {reason.code}
                      </span>
                      <div className="min-w-0">
                        <p
                          className={`text-xs font-extrabold leading-tight ${
                            isSelected ? 'text-white' : 'text-slate-900'
                          }`}
                        >
                          {reason.name}
                        </p>
                        <p
                          className={`text-[10px] mt-0.5 truncate ${
                            isSelected ? 'text-red-100' : 'text-slate-500'
                          }`}
                        >
                          {INEFFICIENCY_CATEGORIES[reason.category] || reason.category}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* STEP 2: TEMPO DE PARADA (BOTÕES DE 1 TOQUE OU CRONÔMETRO AO VIVO) */}
            <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
              {/* Left: Selected Code + Live Stopwatch */}
              <div className="md:col-span-5 p-4 bg-[#081530] text-white rounded-xl flex flex-col justify-between space-y-3">
                <div>
                  <span className="text-xs text-blue-200">Motivo Selecionado:</span>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="font-mono text-xl font-extrabold px-2.5 py-0.5 rounded bg-amber-500 text-slate-950">
                      {selectedReasonCode}
                    </span>
                    <span className="text-sm font-bold text-white leading-tight">
                      {selectedReasonName}
                    </span>
                  </div>
                </div>

                {/* Live Stoppage Timer (Cronômetro de Parada) */}
                <div className="pt-2 border-t border-blue-900/80">
                  {!activeStoppageStartMs ? (
                    <button
                      type="button"
                      onClick={() => {
                        setActiveStoppageStartMs(Date.now());
                        setMachineStatus('PARADA');
                      }}
                      className="w-full py-2.5 px-3 bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold text-xs rounded-lg flex items-center justify-center gap-2 cursor-pointer transition-colors"
                    >
                      <Clock className="w-4 h-4" />
                      Iniciar Cronômetro de Parada Agora
                    </button>
                  ) : (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between bg-red-950/90 border border-red-700 rounded-lg px-3 py-2">
                        <span className="text-xs font-bold text-red-200 flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-red-400 animate-ping" />
                          Máquina Parada:
                        </span>
                        <span className="font-mono text-base font-extrabold text-amber-300 tabular-nums">
                          {Math.floor(elapsedStoppageSeconds / 60)
                            .toString()
                            .padStart(2, '0')}
                          :
                          {(elapsedStoppageSeconds % 60).toString().padStart(2, '0')} (
                          {durationMinutes} min)
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setActiveStoppageStartMs(null)}
                        className="w-full py-1.5 text-[11px] font-semibold text-blue-200 hover:text-white underline cursor-pointer"
                      >
                        Zerar / Cancelar Cronômetro
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Right: Big Touch Presets for Duration in Minutes */}
              <div className="md:col-span-7 p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-extrabold text-slate-900 uppercase">
                    2. Toque no Tempo de Parada (Minutos)
                  </label>
                  <span className="font-mono text-sm font-extrabold text-red-700">
                    {durationMinutes} min selecionados
                  </span>
                </div>

                {/* Big 1-Tap Minute Buttons */}
                <div className="grid grid-cols-4 sm:grid-cols-5 gap-1.5">
                  {[5, 10, 15, 20, 30, 40, 45, 60, 90, 120].map((mins) => (
                    <button
                      key={mins}
                      type="button"
                      onClick={() => setDurationMinutes(mins)}
                      className={`py-2.5 px-2 text-xs font-mono font-extrabold rounded-lg transition-all cursor-pointer ${
                        durationMinutes === mins
                          ? 'bg-red-700 text-white shadow-xs ring-2 ring-red-400'
                          : 'bg-white border border-slate-300 text-slate-800 hover:bg-red-50 hover:border-red-300'
                      }`}
                    >
                      {mins} min
                    </button>
                  ))}
                </div>

                {/* Fine adjustment stepper */}
                <div className="flex items-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setDurationMinutes(Math.max(1, durationMinutes - 5))}
                    className="px-3 h-10 bg-white border border-slate-300 hover:bg-slate-100 rounded-lg font-mono text-xs font-bold text-slate-700 cursor-pointer"
                  >
                    -5 min
                  </button>
                  <button
                    type="button"
                    onClick={() => setDurationMinutes(Math.max(1, durationMinutes - 1))}
                    className="px-3 h-10 bg-white border border-slate-300 hover:bg-slate-100 rounded-lg font-mono text-xs font-bold text-slate-700 cursor-pointer"
                  >
                    -1 min
                  </button>
                  <input
                    type="number"
                    min={1}
                    max={1440}
                    required
                    value={durationMinutes}
                    onChange={(e) => setDurationMinutes(Number(e.target.value))}
                    className="w-full h-10 px-2 bg-white border border-slate-300 rounded-lg text-center font-mono text-base font-bold text-red-700 tabular-nums"
                  />
                  <button
                    type="button"
                    onClick={() => setDurationMinutes(Math.min(1440, durationMinutes + 1))}
                    className="px-3 h-10 bg-white border border-slate-300 hover:bg-slate-100 rounded-lg font-mono text-xs font-bold text-slate-700 cursor-pointer"
                  >
                    +1 min
                  </button>
                  <button
                    type="button"
                    onClick={() => setDurationMinutes(Math.min(1440, durationMinutes + 5))}
                    className="px-3 h-10 bg-white border border-slate-300 hover:bg-slate-100 rounded-lg font-mono text-xs font-bold text-slate-700 cursor-pointer"
                  >
                    +5 min
                  </button>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Operador Responsável *
                </label>
                <input
                  type="text"
                  required
                  value={operatorName}
                  onChange={(e) => setOperatorName(e.target.value)}
                  className="w-full h-10 px-3 bg-slate-50 border border-slate-300 rounded-lg text-sm text-slate-900"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Turno
                </label>
                <select
                  value={shift}
                  onChange={(e) => setShift(e.target.value as ShiftId)}
                  className="w-full h-10 px-3 bg-slate-50 border border-slate-300 rounded-lg text-sm text-slate-900"
                >
                  {(Object.keys(SHIFTS) as ShiftId[]).map((sh) => (
                    <option key={sh} value={sh}>
                      {SHIFTS[sh]}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Observação (Opcional)
                </label>
                <input
                  type="text"
                  value={downtimeNotes}
                  onChange={(e) => setDowntimeNotes(e.target.value)}
                  placeholder="Ex: Aguardando peça da manutenção"
                  className="w-full h-10 px-3 bg-slate-50 border border-slate-300 rounded-lg text-sm text-slate-900"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full h-14 bg-red-700 hover:bg-red-800 disabled:bg-slate-400 text-white font-extrabold text-base rounded-xl transition-colors cursor-pointer flex items-center justify-center gap-2 whitespace-nowrap shadow-sm"
            >
              <Clock className="w-5 h-5" />
              {submitting
                ? 'Registrando Parada...'
                : `Confirmar Parada [${selectedReasonCode} - ${selectedReasonName}] (${durationMinutes} min)`}
            </button>
          </form>
        )}

        {/* Right Column: Latest Deliveries & Stoppages from THIS Machine */}
        <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-6 space-y-6">
          {/* Recent Stoppages on this machine */}
          {machineDowntimes.length > 0 && (
            <div>
              <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-3">
                <div>
                  <h3 className="text-sm font-bold text-red-900">
                    Paradas por Ineficiência — {activeMachine.name}
                  </h3>
                  <p className="text-xs text-slate-500">
                    Total parado hoje: {machineTodaySummary.todayDowntimeMinutes} min
                  </p>
                </div>
                <Clock className="w-4 h-4 text-red-600 shrink-0" />
              </div>

              <div className="divide-y divide-slate-100 max-h-48 overflow-y-auto pr-1">
                {machineDowntimes.slice(0, 8).map((dt) => {
                  const timeStr = dt.createdAt
                    ? new Date(dt.createdAt.seconds * 1000).toLocaleTimeString('pt-BR', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })
                    : 'Agora';
                  return (
                    <div
                      key={dt.id}
                      className="py-2.5 flex items-center justify-between gap-2 text-xs"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono font-bold px-1.5 py-0.5 rounded bg-red-100 text-red-800">
                            {dt.reasonCode}
                          </span>
                          <span className="font-bold text-slate-900 truncate">
                            {dt.reasonName}
                          </span>
                        </div>
                        <p className="text-slate-500 mt-0.5">
                          {timeStr} · Op: {dt.operatorName}
                          {dt.notes ? ` · ${dt.notes}` : ''}
                        </p>
                      </div>
                      <span className="font-mono font-bold text-red-700 shrink-0 tabular-nums">
                        {dt.durationMinutes} min
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Recent Production Deliveries */}
          <div>
            <div className="flex items-center justify-between pb-4 border-b border-slate-100 mb-4">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Produção Hoje — {activeMachine.name}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Medida: {sectorInfo.primaryMetricLabel}
                </p>
              </div>
              <Layers className="w-5 h-5 text-slate-400 shrink-0" />
            </div>

            {machineLogs.length === 0 ? (
              <div className="py-10 text-center">
                <p className="text-sm font-medium text-slate-600">
                  Nenhum apontamento de produção nesta máquina ainda.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100 max-h-[420px] overflow-y-auto pr-1">
                {machineLogs.slice(0, 15).map((item) => {
                  const dateStr = item.createdAt
                    ? new Date(item.createdAt.seconds * 1000).toLocaleTimeString('pt-BR', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })
                    : 'Agora';

                  const cat = catalogParts.find(
                    (c) => c.partCode.toUpperCase() === item.partCode.toUpperCase()
                  );
                  const valMeasured =
                    typeof item.measuredAmount === 'number'
                      ? item.measuredAmount
                      : activeMachine.sector === 'FURADEIRA'
                      ? item.quantityGood
                      : activeMachine.sector === 'COLADEIRA'
                      ? item.quantityGood * (cat?.linearMeters || 0)
                      : activeMachine.sector === 'LINHA_UV'
                      ? item.quantityGood *
                        (typeof cat?.uvSquareMeters === 'number'
                          ? cat.uvSquareMeters
                          : (cat?.squareMeters || 0) * (cat?.uvFaces ?? 1))
                      : item.quantityGood * (cat?.squareMeters || 0);

                  return (
                    <div key={item.id} className="py-3.5 flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 text-xs text-slate-500">
                          {item.paCode && (
                            <>
                              <span className="font-mono font-bold text-[#1e3a8a]">
                                {item.paCode}
                              </span>
                              <span aria-hidden="true">·</span>
                            </>
                          )}
                          <span className="font-mono font-semibold text-slate-800">
                            {item.partCode}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span className="font-mono text-amber-700 font-medium">
                            {item.batchNumber}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span className="font-mono">{dateStr}</span>
                        </div>
                        <p className="text-sm font-semibold text-slate-900 mt-0.5 truncate">
                          {item.partName}
                        </p>
                        <p className="text-xs text-slate-500 truncate">
                          {item.productName} · Op: {item.operatorName}
                        </p>
                      </div>

                      <div className="text-right shrink-0">
                        <p className="font-mono text-sm font-bold text-emerald-700 tabular-nums">
                          +{valMeasured.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}{' '}
                          {sectorInfo.primaryMetricShort}
                        </p>
                        <p className="font-mono text-xs text-slate-500 tabular-nums">
                          {item.quantityGood} pçs
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* MODAL GERADOR DE FICHA DE IDENTIFICAÇÃO DE PEÇAS NO TERMINAL DO OPERADOR */}
      {terminalTicketOrder && (
        <PartIdentificationTicketModal
          order={terminalTicketOrder}
          catalogParts={catalogParts}
          logs={logs}
          onClose={() => setTerminalTicketOrder(null)}
        />
      )}

      {/* MODAL LEITOR DE QR-CODE PELA CÂMERA DO CELULAR OU TABLET */}
      {isCameraScannerOpen && (
        <QrCameraScannerModal
          sectorLabel={sectorInfo.label}
          onScanSuccess={(decodedText) => {
            setBarcodeInput(decodedText);
            handleBarcodeScan(decodedText);
          }}
          onClose={() => setIsCameraScannerOpen(false)}
        />
      )}
    </div>
  );
};
