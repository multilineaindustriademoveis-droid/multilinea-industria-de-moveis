import React, { useState, useMemo, useRef } from 'react';
import * as XLSX from 'xlsx';
import {
  ProductionOrder,
  CatalogPart,
  ProductionLog,
  ScheduleColor,
  SCHEDULE_COLORS,
  getOrderProductQty,
  getOrderTotalVolumes,
  getOrderVolumesPerProduct,
} from '../types';
import {
  Plus,
  Search,
  Trash2,
  Edit2,
  FileSpreadsheet,
  CheckCircle2,
  Calendar,
  Layers,
  Star,
  Download,
  Upload,
  X,
  PackageCheck,
  QrCode,
  Printer,
  AlertCircle,
  FileUp,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  ChevronRight,
  Minimize2,
  Maximize2,
  Check,
} from 'lucide-react';
import { PartIdentificationTicketModal, buildTicketBarcode } from './PartIdentificationTicketModal';

interface MasterProductionPlanProps {
  orders: ProductionOrder[];
  catalogParts?: CatalogPart[];
  logs: ProductionLog[];
  onCreateOrder: (
    payload: Omit<ProductionOrder, 'id' | 'ownerId' | 'createdAt'>
  ) => Promise<void>;
  onUpdateOrder: (
    orderId: string,
    payload: Omit<ProductionOrder, 'id' | 'ownerId' | 'createdAt'>
  ) => Promise<void>;
  onDeleteOrder: (orderId: string) => Promise<void>;
  onClearAllOrders?: () => Promise<number>;
  onRestoreDefaultOrders?: () => Promise<number>;
  onDeleteEncomenda?: (encomendaCode: string) => Promise<number>;
  onBulkImportOrders: (
    items: Omit<ProductionOrder, 'id' | 'ownerId' | 'createdAt'>[]
  ) => Promise<number>;
  onQuickCreatePart?: (payload: {
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
  }) => Promise<void>;
}

// Helper to derive Encomenda prefix from Lote (e.g. M2605101 -> M26051, I2603612 -> I26036, I2603808 -> I26038)
export function deriveOrderCodeFromBatch(batch: string): string {
  const clean = (batch || '').trim().toUpperCase().replace(/[\s\-_/]+/g, '');
  const match = clean.match(/^([A-Z]\d{5})/);
  if (match) {
    return match[1];
  }
  if (clean.length >= 6 && /^[A-Z]+\d+/.test(clean)) {
    return clean.slice(0, 6);
  }
  return clean || 'ENC-GERAL';
}

// Helper that ensures a valid Encomenda code, always respecting user's explicit encomenda name
// and automatically consolidating full lot codes (e.g. I2603808) under their canonical 6-char Encomenda (I26038)
export function getCanonicalEncomendaCode(order: {
  orderCode?: string;
  batchNumber?: string;
}): string {
  let rawOrder = (order.orderCode || '').trim().toUpperCase().replace(/[\s\-_/]+/g, '');
  const rawBatch = (order.batchNumber || '').trim().toUpperCase().replace(/[\s\-_/]+/g, '');

  // 1. If rawOrder matches a full lote pattern (e.g. I2603808, M2605101) with 7+ chars, extract the 6-char Encomenda prefix (I26038)
  const lotMatch = rawOrder.match(/^([A-Z]\d{5})\d+$/);
  if (lotMatch) {
    return lotMatch[1];
  }

  // 2. If the user typed an explicit order code (and didn't just paste the whole batch into both fields), preserve it!
  if (rawOrder && rawOrder !== rawBatch) {
    return rawOrder;
  }

  const derived = deriveOrderCodeFromBatch(rawBatch);
  return derived || rawOrder || 'ENC-GERAL';
}

export const MasterProductionPlan: React.FC<MasterProductionPlanProps> = ({
  orders,
  catalogParts = [],
  logs,
  onCreateOrder,
  onUpdateOrder,
  onDeleteOrder,
  onClearAllOrders,
  onRestoreDefaultOrders,
  onDeleteEncomenda,
  onBulkImportOrders,
  onQuickCreatePart,
}) => {
  // Filters & View Modes
  const [selectedEncomenda, setSelectedEncomenda] = useState<string>('ALL');
  const [viewLayout, setViewLayout] = useState<'UNIFIED_EXCEL' | 'BY_ENCOMENDA'>(
    'BY_ENCOMENDA'
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [colorFilter, setColorFilter] = useState<ScheduleColor | 'ALL'>('ALL');
  const [stageDateFilter, setStageDateFilter] = useState<string>('ALL');
  const [confirmClearAll, setConfirmClearAll] = useState(false);
  const [clearingAll, setClearingAll] = useState(false);
  const [restoringOrders, setRestoringOrders] = useState(false);

  // Lookup State: Peças Entregues por Lote X Código de Produto
  const [lookupBatch, setLookupBatch] = useState<string>('I2603605');
  const [lookupProductCode, setLookupProductCode] = useState<string>('500738');
  const [expandedOrderIds, setExpandedOrderIds] = useState<Record<string, boolean>>({});
  const [ticketModalOrder, setTicketModalOrder] = useState<ProductionOrder | null>(null);

  // Collapse & Space Optimization State
  const [collapsedEncomendas, setCollapsedEncomendas] = useState<Record<string, boolean>>(() => {
    try {
      const stored = localStorage.getItem('multilinea_collapsed_encomendas');
      return stored ? JSON.parse(stored) : {};
    } catch {
      return {};
    }
  });

  const [autoCollapseCompleted, setAutoCollapseCompleted] = useState<boolean>(() => {
    try {
      const stored = localStorage.getItem('multilinea_auto_collapse_completed');
      return stored !== null ? stored === '1' : true; // Enabled by default
    } catch {
      return true;
    }
  });

  const [completionFilter, setCompletionFilter] = useState<
    'ALL' | 'PENDING_ONLY' | 'COMPLETED_ONLY'
  >('ALL');

  const [collapseCompletedRows, setCollapseCompletedRows] = useState<boolean>(false);

  // Form / Modal States
  const [showAddForm, setShowAddForm] = useState(false);
  const [showExcelModal, setShowExcelModal] = useState(false);
  const [editingOrderId, setEditingOrderId] = useState<string | null>(null);
  const [feedbackMsg, setFeedbackMsg] = useState<string | null>(null);

  // New/Edit Order Form Fields
  const [orderCode, setOrderCode] = useState('M26051');
  const [productCode, setProductCode] = useState('');
  const [batchNumber, setBatchNumber] = useState('');
  const [productLine, setProductLine] = useState('RAINHA');
  const [scheduleColor, setScheduleColor] = useState<ScheduleColor>('VERDE');
  const [productDescription, setProductDescription] = useState('');
  const [finishColor, setFinishColor] = useState('NATURE');
  const [qtyV01, setQtyV01] = useState<number>(200);
  const [qtyV02, setQtyV02] = useState<number>(0);
  const [qtyV03, setQtyV03] = useState<number>(0);
  const [dateCorte, setDateCorte] = useState('01/10/2026');
  const [dateColadeira, setDateColadeira] = useState('02/10/2026');
  const [dateFuradeira, setDateFuradeira] = useState('05/10/2026');
  const [datePintura, setDatePintura] = useState('06/10/2026');
  const [isHighlighted, setIsHighlighted] = useState(false);
  const [isEncab, setIsEncab] = useState(false);

  // Inline Quantity Editing State
  const [inlineEditing, setInlineEditing] = useState<{
    orderId: string;
    field: 'qtyV01' | 'qtyV02' | 'qtyV03' | 'totalVolumes';
    valStr: string;
  } | null>(null);
  const [savingInline, setSavingInline] = useState(false);

  // Excel File Upload & Paste State
  const [pastedText, setPastedText] = useState('');
  const [defaultImportEncomenda, setDefaultImportEncomenda] = useState('');
  const [importing, setImporting] = useState(false);
  const [excelErrorMsg, setExcelErrorMsg] = useState<string | null>(null);
  const [excelFileName, setExcelFileName] = useState<string | null>(null);
  const [excelSheetNames, setExcelSheetNames] = useState<string[]>([]);
  const [selectedSheetName, setSelectedSheetName] = useState<string>('');
  const [workbookRef, setWorkbookRef] = useState<XLSX.WorkBook | null>(null);
  const [previewExcelItems, setPreviewExcelItems] = useState<
    Omit<ProductionOrder, 'id' | 'ownerId' | 'createdAt'>[]
  >([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Format Excel serial date or string date to DD/MM/YYYY
  const normalizeExcelDate = (val: unknown, fallback: string): string => {
    if (val === null || val === undefined || val === '') return fallback;
    if (val instanceof Date && !isNaN(val.getTime())) {
      const dd = String(val.getDate()).padStart(2, '0');
      const mm = String(val.getMonth() + 1).padStart(2, '0');
      const yyyy = val.getFullYear();
      return `${dd}/${mm}/${yyyy}`;
    }
    if (typeof val === 'number' && val > 20000 && val < 90000) {
      // Excel serial date
      const utcDays = Math.floor(val - 25569);
      const utcValue = utcDays * 86400;
      const dateInfo = new Date(utcValue * 1000);
      const dd = String(dateInfo.getUTCDate()).padStart(2, '0');
      const mm = String(dateInfo.getUTCMonth() + 1).padStart(2, '0');
      const yyyy = dateInfo.getUTCFullYear();
      return `${dd}/${mm}/${yyyy}`;
    }
    const str = String(val).trim();
    if (!str) return fallback;
    // Match YYYY-MM-DD
    const isoMatch = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (isoMatch) {
      return `${isoMatch[3]}/${isoMatch[2]}/${isoMatch[1]}`;
    }
    // Match D/M/YY or DD/MM/YYYY
    const brMatch = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
    if (brMatch) {
      const dd = brMatch[1].padStart(2, '0');
      const mm = brMatch[2].padStart(2, '0');
      const yyyy = brMatch[3].length === 2 ? `20${brMatch[3]}` : brMatch[3];
      return `${dd}/${mm}/${yyyy}`;
    }
    return str.slice(0, 30);
  };

  // Index known products by PA code for rapid autocomplete in order creation
  const knownProductsByPa = useMemo(() => {
    const map = new Map<string, { paCode: string; description: string; line: string }>();
    (catalogParts || []).forEach((p) => {
      const pa = (p.paCode || '').trim().toUpperCase();
      if (pa && !map.has(pa)) {
        map.set(pa, { paCode: pa, description: p.productName || '', line: '' });
      }
    });
    (orders || []).forEach((o) => {
      const pa = (o.productCode || '').trim().toUpperCase();
      if (pa) {
        map.set(pa, {
          paCode: pa,
          description: o.productDescription || '',
          line: o.productLine || '',
        });
      }
    });
    return Array.from(map.values()).sort((a, b) =>
      a.paCode.localeCompare(b.paCode, undefined, { numeric: true })
    );
  }, [catalogParts, orders]);

  // Parse a 2D array of rows (either from XLSX sheet or from pasted text)
  const extractOrdersFromRows = (
    rows: unknown[][],
    overrideEncomenda: string
  ): Omit<ProductionOrder, 'id' | 'ownerId' | 'createdAt'>[] => {
    const items: Omit<ProductionOrder, 'id' | 'ownerId' | 'createdAt'>[] = [];
    let lastCorte = '01/10/2026';
    let lastColadeira = '02/10/2026';
    let lastFuradeira = '05/10/2026';
    let lastPintura = '06/10/2026';
    let activeEncomendaFromBanner = '';

    // Column index mapping (automatically adapts if ENCOMENDA column is present or not)
    let colIdx = {
      encomenda: -1,
      codigo: 0,
      lote: 1,
      linha: 2,
      corProg: 3,
      descricao: 4,
      corProd: 5,
      v01: 6,
      v02: 7,
      v03: 8,
      corte: 9,
      coladeira: 10,
      furadeira: 11,
      pintura: 12,
    };

    for (const rawRow of rows) {
      if (!Array.isArray(rawRow)) continue;
      const cols = rawRow.map((c) => (c === null || c === undefined ? '' : String(c).trim()));
      const nonEmpty = cols.filter((c) => c.length > 0);
      if (nonEmpty.length === 0) continue;

      const joinedUpper = cols.join(' ').toUpperCase();

      // Detect if a banner row defines the Encomenda (e.g. "ENCOMENDA I26036" or "M26051")
      const bannerMatch = joinedUpper.match(/ENCOMENDA\s*[:\-]?\s*([A-Z]\d{5})/i);
      if (bannerMatch && nonEmpty.length <= 4) {
        activeEncomendaFromBanner = bannerMatch[1].toUpperCase();
        continue;
      }

      // Detect header row to auto-calibrate column positions
      if (
        (joinedUpper.includes('CÓDIGO') || joinedUpper.includes('CODIGO')) &&
        joinedUpper.includes('LOTE')
      ) {
        const findCol = (keywords: string[]) =>
          cols.findIndex((cell) => {
            const u = cell.toUpperCase();
            return keywords.some((k) => u === k || u.includes(k));
          });

        const cEnc = findCol(['ENCOMENDA']);
        const cCod = findCol(['CÓDIGO', 'CODIGO', 'COD.']);
        const cLote = findCol(['LOTE']);
        const cLinha = findCol(['LINHA']);
        const cCorProg = findCol(['COR PROGRAMAÇÃO', 'COR PROGRAMACAO', 'PROGRAMAÇÃO']);
        const cDesc = findCol(['DESCRIÇÃO', 'DESCRICAO', 'PRODUTO']);
        const cV01 = findCol(['V01', 'V1']);
        const cV02 = findCol(['V02', 'V2']);
        const cV03 = findCol(['V03', 'V3']);
        const cCorte = findCol(['CORTE', 'SECCIONADORA']);
        const cColad = findCol(['COLADEIRA', 'BORDA']);
        const cFurad = findCol(['FURADEIRA', 'FURAÇÃO']);
        const cPint = findCol(['PINTURA', 'LINHA UV', 'UV']);

        if (cCod >= 0 && cLote >= 0) {
          const offset = cEnc >= 0 && cEnc < cCod ? 1 : 0;
          colIdx = {
            encomenda: cEnc,
            codigo: cCod,
            lote: cLote,
            linha: cLinha >= 0 ? cLinha : 2 + offset,
            corProg: cCorProg >= 0 ? cCorProg : 3 + offset,
            descricao: cDesc >= 0 ? cDesc : 4 + offset,
            corProd:
              cols.findIndex(
                (cell, idx) =>
                  idx > (cDesc >= 0 ? cDesc : 4 + offset) &&
                  (cell.toUpperCase() === 'COR' || cell.toUpperCase() === 'ACABAMENTO')
              ) >= 0
                ? cols.findIndex(
                    (cell, idx) =>
                      idx > (cDesc >= 0 ? cDesc : 4 + offset) &&
                      (cell.toUpperCase() === 'COR' || cell.toUpperCase() === 'ACABAMENTO')
                  )
                : 5 + offset,
            v01: cV01 >= 0 ? cV01 : 6 + offset,
            v02: cV02 >= 0 ? cV02 : 7 + offset,
            v03: cV03 >= 0 ? cV03 : 8 + offset,
            corte: cCorte >= 0 ? cCorte : 9 + offset,
            coladeira: cColad >= 0 ? cColad : 10 + offset,
            furadeira: cFurad >= 0 ? cFurad : 11 + offset,
            pintura: cPint >= 0 ? cPint : 12 + offset,
          };
        }
        continue;
      }

      // Skip sub-headers or total rows
      const firstCellUpper = (cols[0] || '').toUpperCase();
      if (
        firstCellUpper.includes('DATAS DE ETAPAS') ||
        firstCellUpper.includes('QTDE / VOLUMES') ||
        firstCellUpper.includes('PLANO MESTRE') ||
        firstCellUpper === 'TOTAL'
      ) {
        continue;
      }

      // Auto-detect if row has an Encomenda column at index 0 even without header
      // Example: cols[0] = "I26036", cols[1] = "500686", cols[2] = "I2603612"
      let rowOffset = 0;
      if (
        colIdx.encomenda === -1 &&
        /^[A-Z]\d{5}$/i.test(cols[0] || '') &&
        /^\d{3,10}$/.test(cols[1] || '') &&
        /^[A-Z]\d{6,9}$/i.test(cols[2] || '')
      ) {
        rowOffset = 1;
      }

      const rawProdCode = cols[colIdx.codigo + rowOffset] || '';
      const rawBatch = (cols[colIdx.lote + rowOffset] || '')
        .toUpperCase()
        .replace(/\s+/g, '');

      // Also handle case where Lote is in col 0 and Codigo is in col 1
      let finalProdCode = rawProdCode.trim();
      let finalBatch = rawBatch.trim();
      if (
        /^[A-Z]\d{6,9}$/.test(finalProdCode.toUpperCase()) &&
        /^\d{3,10}$/.test(finalBatch)
      ) {
        const tmp = finalProdCode.toUpperCase();
        finalProdCode = finalBatch;
        finalBatch = tmp;
      }

      if (!finalProdCode || !finalBatch) continue;
      // Ignore header-like words
      if (
        finalBatch === 'LOTE' ||
        finalProdCode.toUpperCase() === 'CÓDIGO' ||
        finalProdCode.toUpperCase() === 'CODIGO'
      ) {
        continue;
      }

      const rawLine = (cols[colIdx.linha + rowOffset] || 'GERAL').toUpperCase().trim();
      const rawSchedColor = (cols[colIdx.corProg + rowOffset] || 'BRANCO')
        .toUpperCase()
        .trim();
      const validColor: ScheduleColor = SCHEDULE_COLORS.includes(
        rawSchedColor as ScheduleColor
      )
        ? (rawSchedColor as ScheduleColor)
        : 'BRANCO';

      const rawDesc = (cols[colIdx.descricao + rowOffset] || finalProdCode)
        .toUpperCase()
        .trim();
      const rawFinish = (cols[colIdx.corProd + rowOffset] || 'PADRÃO')
        .toUpperCase()
        .trim();

      const parseVol = (v: unknown) => {
        if (typeof v === 'number') return Math.max(0, Math.round(v));
        const s = String(v || '')
          .replace(/\./g, '')
          .replace(/,/g, '.')
          .replace(/[^\d.]/g, '');
        const n = parseFloat(s);
        return isNaN(n) ? 0 : Math.max(0, Math.round(n));
      };

      const v1 = parseVol(rawRow[colIdx.v01 + rowOffset]);
      const v2 = parseVol(rawRow[colIdx.v02 + rowOffset]);
      const v3 = parseVol(rawRow[colIdx.v03 + rowOffset]);

      const cellCorte = rawRow[colIdx.corte + rowOffset];
      const cellColad = rawRow[colIdx.coladeira + rowOffset];
      const cellFurad = rawRow[colIdx.furadeira + rowOffset];
      const cellPint = rawRow[colIdx.pintura + rowOffset];

      if (cellCorte !== undefined && cellCorte !== null && String(cellCorte).trim() !== '') {
        lastCorte = normalizeExcelDate(cellCorte, lastCorte);
      }
      if (cellColad !== undefined && cellColad !== null && String(cellColad).trim() !== '') {
        lastColadeira = normalizeExcelDate(cellColad, lastColadeira);
      }
      if (cellFurad !== undefined && cellFurad !== null && String(cellFurad).trim() !== '') {
        lastFuradeira = normalizeExcelDate(cellFurad, lastFuradeira);
      }
      if (cellPint !== undefined && cellPint !== null && String(cellPint).trim() !== '') {
        lastPintura = normalizeExcelDate(cellPint, lastPintura);
      }

      const explicitRowEnc =
        rowOffset === 1
          ? cols[0].toUpperCase()
          : colIdx.encomenda >= 0
          ? (cols[colIdx.encomenda] || '').toUpperCase()
          : '';

      const encCode = getCanonicalEncomendaCode({
        orderCode:
          overrideEncomenda.trim().toUpperCase() ||
          explicitRowEnc ||
          activeEncomendaFromBanner,
        batchNumber: finalBatch,
      });

      items.push({
        orderCode: (encCode || 'M26051').slice(0, 60),
        productCode: (finalProdCode || 'S/COD').slice(0, 60),
        batchNumber: finalBatch.slice(0, 60),
        productLine: (rawLine || 'GERAL').slice(0, 80),
        scheduleColor: validColor,
        productDescription: (rawDesc || 'PRODUTO').slice(0, 160),
        finishColor: (rawFinish || 'PADRÃO').slice(0, 80),
        qtyV01: v1,
        qtyV02: v2,
        qtyV03: v3,
        totalVolumes: v1 + v2 + v3,
        dateCorte: lastCorte.slice(0, 30),
        dateColadeira: lastColadeira.slice(0, 30),
        dateFuradeira: lastFuradeira.slice(0, 30),
        datePintura: lastPintura.slice(0, 30),
        isHighlighted: false,
        isEncab: rawDesc.includes('ENCAB') || rawDesc.includes('•'),
      });
    }

    return items;
  };

  // Distinct Encomendas summary
  const encomendasSummary = useMemo(() => {
    const map = new Map<
      string,
      {
        orderCode: string;
        lotesCount: number;
        totalProducts: number;
        totalV01: number;
        totalV02: number;
        totalV03: number;
        totalVolumes: number;
        lines: Set<string>;
      }
    >();

    orders.forEach((o) => {
      const code = getCanonicalEncomendaCode(o);
      const prev = map.get(code) || {
        orderCode: code,
        lotesCount: 0,
        totalProducts: 0,
        totalV01: 0,
        totalV02: 0,
        totalV03: 0,
        totalVolumes: 0,
        lines: new Set<string>(),
      };
      prev.lotesCount += 1;
      prev.totalProducts += getOrderProductQty(o);
      prev.totalV01 += o.qtyV01 || 0;
      prev.totalV02 += o.qtyV02 || 0;
      prev.totalV03 += o.qtyV03 || 0;
      prev.totalVolumes += getOrderTotalVolumes(o);
      if (o.productLine) prev.lines.add(o.productLine);
      map.set(code, prev);
    });

    return Array.from(map.values());
  }, [orders]);

  // Distinct Corte dates for quick filtering
  const distinctCorteDates = useMemo(() => {
    const set = new Set<string>();
    orders.forEach((o) => {
      if (o.dateCorte) set.add(o.dateCorte);
    });
    return Array.from(set);
  }, [orders]);

  // Helper to compute delivered parts breakdown and product completion percentage for a specific Lote X Product Code
  // Example: Product has 5 types of parts and 1 type of part is delivered -> 20% completed
  const getDeliveredPartsForOrder = (batchNum: string, prodCode: string, plannedQty: number) => {
    const cleanBatch = (batchNum || '').trim().toUpperCase();
    const cleanProd = (prodCode || '').trim().toUpperCase();
    const baseLotProducts = Math.max(0, Number(plannedQty) || 0);

    // 1. Catalog parts registered for this Product Code (PA)
    const registeredParts = catalogParts.filter(
      (c) => (c.paCode || '').trim().toUpperCase() === cleanProd
    );

    // 2. Logs matching this batch (and optionally productCode if specified)
    const matchingLogs = logs.filter((l) => {
      const lBatch = (l.batchNumber || '').trim().toUpperCase();
      const lPa = (l.paCode || '').trim().toUpperCase();
      if (cleanBatch && lBatch === cleanBatch) {
        return !cleanProd || !lPa || lPa === cleanProd || lBatch === cleanBatch;
      }
      return false;
    });

    // Build map by partCode
    const partMap = new Map<
      string,
      {
        partCode: string;
        partName: string;
        dimensions: string;
        piecesPerProduct: number;
        partTargetQty: number;
        cortePcs: number;
        coladeiraPcs: number;
        furadeiraPcs: number;
        pinturaPcs: number;
        scrapPcs: number;
        lastOperator: string;
      }
    >();

    // Pre-populate with catalog parts for this PA so missing/pending parts also show
    registeredParts.forEach((cp) => {
      const key = cp.partCode.trim().toUpperCase();
      const qtyPerProd = Math.max(1, Math.round(cp.piecesPerProduct || 1));
      partMap.set(key, {
        partCode: cp.partCode,
        partName: cp.partName,
        dimensions: cp.dimensions,
        piecesPerProduct: qtyPerProd,
        partTargetQty: baseLotProducts * qtyPerProd,
        cortePcs: 0,
        coladeiraPcs: 0,
        furadeiraPcs: 0,
        pinturaPcs: 0,
        scrapPcs: 0,
        lastOperator: '-',
      });
    });

    // Aggregate actual operator deliveries
    matchingLogs.forEach((l) => {
      const key = (l.partCode || l.partName || 'PECA-AVULSA').trim().toUpperCase();
      const catalogMatch =
        (cleanProd
          ? catalogParts.find(
              (c) =>
                c.partCode.trim().toUpperCase() === key &&
                (c.paCode || '').trim().toUpperCase() === cleanProd
            )
          : null) ||
        catalogParts.find(
          (c) => c.partCode.trim().toUpperCase() === key
        );
      const qtyPerProd = Math.max(1, Math.round(catalogMatch?.piecesPerProduct || 1));
      const prev = partMap.get(key) || {
        partCode: l.partCode || 'S/CÓD',
        partName: l.partName || l.productName || 'Peça Apontada',
        dimensions: catalogMatch?.dimensions || '-',
        piecesPerProduct: qtyPerProd,
        partTargetQty: baseLotProducts * qtyPerProd,
        cortePcs: 0,
        coladeiraPcs: 0,
        furadeiraPcs: 0,
        pinturaPcs: 0,
        scrapPcs: 0,
        lastOperator: l.operatorName,
      };
      if (l.sector === 'SECCIONADORA') prev.cortePcs += l.quantityGood;
      if (l.sector === 'COLADEIRA') prev.coladeiraPcs += l.quantityGood;
      if (l.sector === 'FURADEIRA') prev.furadeiraPcs += l.quantityGood;
      if (l.sector === 'LINHA_UV') prev.pinturaPcs += l.quantityGood;
      prev.scrapPcs += l.quantityScrap || 0;
      prev.lastOperator = l.operatorName || prev.lastOperator;
      partMap.set(key, prev);
    });

    const partsList = Array.from(partMap.values());
    const totalPartTypes = partsList.length;

    // Calculate completion across all part types of this product
    // If the product has N part types (e.g. 5 types of parts), each part type represents (100 / N)% of the product.
    // A part type is considered delivered (100% of its share) when its delivered pieces >= partTargetQty, or proportional if partially delivered.
    let completedPartTypesCount = 0;
    let startedPartTypesCount = 0;
    let sumPartRatios = 0;
    let sumCorteRatios = 0;
    let sumColadeiraRatios = 0;
    let sumFuradeiraRatios = 0;
    let sumPinturaRatios = 0;
    let totalRequiredAllParts = 0;
    let totalCortePcs = 0;
    let totalColadeiraPcs = 0;
    let totalFuradeiraPcs = 0;
    let totalPinturaPcs = 0;

    partsList.forEach((pt) => {
      const req = pt.partTargetQty > 0 ? pt.partTargetQty : Math.max(1, baseLotProducts);
      totalRequiredAllParts += req;
      totalCortePcs += pt.cortePcs;
      totalColadeiraPcs += pt.coladeiraPcs;
      totalFuradeiraPcs += pt.furadeiraPcs;
      totalPinturaPcs += pt.pinturaPcs;

      const maxDeliv = Math.max(
        pt.cortePcs,
        pt.coladeiraPcs,
        pt.furadeiraPcs,
        pt.pinturaPcs
      );
      const partRatio = req > 0 ? Math.min(1, maxDeliv / req) : maxDeliv > 0 ? 1 : 0;
      sumPartRatios += partRatio;
      sumCorteRatios += req > 0 ? Math.min(1, pt.cortePcs / req) : 0;
      sumColadeiraRatios += req > 0 ? Math.min(1, pt.coladeiraPcs / req) : 0;
      sumFuradeiraRatios += req > 0 ? Math.min(1, pt.furadeiraPcs / req) : 0;
      sumPinturaRatios += req > 0 ? Math.min(1, pt.pinturaPcs / req) : 0;

      if (maxDeliv > 0) startedPartTypesCount += 1;
      if (req > 0 && maxDeliv >= req) completedPartTypesCount += 1;
    });

    // Percentage across all part types of the product (Example: 5 part types, 1 delivered = 20%)
    const overallPct =
      totalPartTypes > 0
        ? Math.min(100, Math.round((sumPartRatios / totalPartTypes) * 100))
        : 0;
    const cortePct =
      totalPartTypes > 0
        ? Math.min(100, Math.round((sumCorteRatios / totalPartTypes) * 100))
        : 0;
    const coladeiraPct =
      totalPartTypes > 0
        ? Math.min(100, Math.round((sumColadeiraRatios / totalPartTypes) * 100))
        : 0;
    const furadeiraPct =
      totalPartTypes > 0
        ? Math.min(100, Math.round((sumFuradeiraRatios / totalPartTypes) * 100))
        : 0;
    const pinturaPct =
      totalPartTypes > 0
        ? Math.min(100, Math.round((sumPinturaRatios / totalPartTypes) * 100))
        : 0;

    const corteCompletedTypes = partsList.filter(
      (pt) => pt.partTargetQty > 0 && pt.cortePcs >= pt.partTargetQty
    ).length;
    const coladeiraCompletedTypes = partsList.filter(
      (pt) => pt.partTargetQty > 0 && pt.coladeiraPcs >= pt.partTargetQty
    ).length;
    const furadeiraCompletedTypes = partsList.filter(
      (pt) => pt.partTargetQty > 0 && pt.furadeiraPcs >= pt.partTargetQty
    ).length;
    const pinturaCompletedTypes = partsList.filter(
      (pt) => pt.partTargetQty > 0 && pt.pinturaPcs >= pt.partTargetQty
    ).length;

    return {
      parts: partsList,
      totalPartTypes,
      completedPartTypesCount,
      startedPartTypesCount,
      overallPct,
      cortePct,
      coladeiraPct,
      furadeiraPct,
      pinturaPct,
      corteCompletedTypes,
      coladeiraCompletedTypes,
      furadeiraCompletedTypes,
      pinturaCompletedTypes,
      totalCortePcs,
      totalColadeiraPcs,
      totalFuradeiraPcs,
      totalPinturaPcs,
      totalRequiredAllParts,
      totalLogsCount: matchingLogs.length,
      plannedQty: baseLotProducts,
    };
  };

  const activeLookupOrder = useMemo(() => {
    const b = lookupBatch.trim().toUpperCase();
    const p = lookupProductCode.trim().toUpperCase();
    if (!b && !p) return null;

    // 1. If both batch and product code are entered, check exact match first
    if (b && p) {
      const exact = orders.find(
        (o) =>
          o.batchNumber.toUpperCase() === b &&
          o.productCode.toUpperCase() === p
      );
      if (exact) return exact;
    }

    // 2. If batch is entered, match strictly by batch (never fall back to unrelated product!)
    if (b) {
      const byBatch = orders.find((o) => o.batchNumber.toUpperCase() === b);
      if (byBatch) return byBatch;
      // If batch is not found, return null so we don't display a fake product and fake percentage
      return null;
    }

    // 3. If only product code is entered, find by product code
    if (p) {
      return orders.find((o) => o.productCode.toUpperCase() === p) || null;
    }

    return null;
  }, [orders, lookupBatch, lookupProductCode]);

  // Check if a similar batch exists in orders when typed batch is not found (e.g. I2603808 vs I2603608)
  const similarBatchSuggestion = useMemo(() => {
    const b = lookupBatch.trim().toUpperCase();
    if (!b || activeLookupOrder) return null;
    const cleanB = b.replace(/\s+/g, '');
    return (
      orders.find((o) => {
        const ob = (o.batchNumber || '').trim().toUpperCase().replace(/\s+/g, '');
        if (ob === cleanB) return false;
        if (ob.length === cleanB.length) {
          let diffs = 0;
          for (let i = 0; i < ob.length; i++) {
            if (ob[i] !== cleanB[i]) diffs++;
          }
          if (diffs <= 2) return true;
        }
        return false;
      }) || null
    );
  }, [lookupBatch, activeLookupOrder, orders]);

  const activeLookupBreakdown = useMemo(() => {
    // If user specified a batch that doesn't exist in orders, do NOT mix with an unrelated product code
    const effectiveProd = activeLookupOrder
      ? activeLookupOrder.productCode
      : lookupBatch && !activeLookupOrder
      ? ''
      : lookupProductCode;
    return getDeliveredPartsForOrder(
      lookupBatch,
      effectiveProd,
      getOrderProductQty(activeLookupOrder)
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lookupBatch, lookupProductCode, activeLookupOrder, logs, catalogParts]);
  // Map batchNumber -> produced pieces per sector from operator logs
  const batchProgressMap = useMemo(() => {
    const map = new Map<
      string,
      { cortePcs: number; coladeiraPcs: number; furadeiraPcs: number; pinturaPcs: number }
    >();
    logs.forEach((l) => {
      const key = (l.batchNumber || '').trim().toUpperCase();
      if (!key) return;
      const prev = map.get(key) || {
        cortePcs: 0,
        coladeiraPcs: 0,
        furadeiraPcs: 0,
        pinturaPcs: 0,
      };
      if (l.sector === 'SECCIONADORA') prev.cortePcs += l.quantityGood;
      if (l.sector === 'COLADEIRA') prev.coladeiraPcs += l.quantityGood;
      if (l.sector === 'FURADEIRA') prev.furadeiraPcs += l.quantityGood;
      if (l.sector === 'LINHA_UV') prev.pinturaPcs += l.quantityGood;
      map.set(key, prev);
    });
    return map;
  }, [logs]);

  // Filtered Orders
  const filteredOrders = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return orders
      .filter((o) => {
        const encCode = getCanonicalEncomendaCode(o);
        // When the user types a search query, search across ALL encomendas so they never miss a batch
        const matchesEncomenda =
          Boolean(q) ||
          selectedEncomenda === 'ALL' ||
          encCode === selectedEncomenda.toUpperCase();
        const matchesColor = colorFilter === 'ALL' || o.scheduleColor === colorFilter;
        const matchesDate = stageDateFilter === 'ALL' || o.dateCorte === stageDateFilter;
        const matchesSearch =
          !q ||
          (o.productCode || '').toLowerCase().includes(q) ||
          (o.batchNumber || '').toLowerCase().includes(q) ||
          encCode.toLowerCase().includes(q) ||
          (o.productLine || '').toLowerCase().includes(q) ||
          (o.productDescription || '').toLowerCase().includes(q) ||
          (o.finishColor || '').toLowerCase().includes(q);
        return matchesEncomenda && matchesColor && matchesDate && matchesSearch;
      })
      .sort((a, b) => {
        const encA = getCanonicalEncomendaCode(a);
        const encB = getCanonicalEncomendaCode(b);
        const cmpEnc = encA.localeCompare(encB, undefined, { numeric: true });
        if (cmpEnc !== 0) return cmpEnc;
        return (a.batchNumber || '').localeCompare(b.batchNumber || '', undefined, {
          numeric: true,
        });
      });
  }, [orders, selectedEncomenda, colorFilter, stageDateFilter, searchQuery]);

  // Group filtered orders by Encomenda when in BY_ENCOMENDA layout
  const ordersGroupedByEncomenda = useMemo(() => {
    const groups = new Map<string, ProductionOrder[]>();
    filteredOrders.forEach((o) => {
      const enc = getCanonicalEncomendaCode(o);
      const list = groups.get(enc) || [];
      list.push(o);
      groups.set(enc, list);
    });
    // Sort batches inside each encomenda naturally (e.g. I2603601 ... I2603611, I2603612)
    groups.forEach((list) => {
      list.sort((a, b) =>
        (a.batchNumber || '').localeCompare(b.batchNumber || '', undefined, {
          numeric: true,
        })
      );
    });
    return Array.from(groups.entries());
  }, [filteredOrders]);

  // Precompute completion status for each encomenda
  const encomendaCompletionStats = useMemo(() => {
    const stats = new Map<
      string,
      {
        totalLots: number;
        completedLots: number;
        inProgressLots: number;
        pendingLots: number;
        isFullyCompleted: boolean;
        avgPct: number;
      }
    >();

    ordersGroupedByEncomenda.forEach(([encCode, groupOrders]) => {
      let completedLots = 0;
      let inProgressLots = 0;
      let pendingLots = 0;
      let totalPctSum = 0;

      groupOrders.forEach((o) => {
        const plannedProducts = getOrderProductQty(o);
        const breakdown = getDeliveredPartsForOrder(
          o.batchNumber,
          o.productCode,
          plannedProducts
        );
        const pct = breakdown.overallPct;
        totalPctSum += pct;

        if (o.status === 'CONCLUIDO' || pct >= 100) {
          completedLots++;
        } else if (pct > 0 || breakdown.totalLogsCount > 0) {
          inProgressLots++;
        } else {
          pendingLots++;
        }
      });

      const totalLots = groupOrders.length;
      const isFullyCompleted = totalLots > 0 && completedLots === totalLots;
      const avgPct = totalLots > 0 ? Math.round(totalPctSum / totalLots) : 0;

      stats.set(encCode, {
        totalLots,
        completedLots,
        inProgressLots,
        pendingLots,
        isFullyCompleted,
        avgPct,
      });
    });

    return stats;
  }, [ordersGroupedByEncomenda, catalogParts, logs]);

  const totalCompletedEncomendas = useMemo(() => {
    let count = 0;
    encomendaCompletionStats.forEach((s) => {
      if (s.isFullyCompleted) count++;
    });
    return count;
  }, [encomendaCompletionStats]);

  const isEncomendaCollapsed = (encCode: string): boolean => {
    if (collapsedEncomendas[encCode] !== undefined) {
      return collapsedEncomendas[encCode];
    }
    const stats = encomendaCompletionStats.get(encCode);
    if (autoCollapseCompleted && stats?.isFullyCompleted) {
      return true;
    }
    return false;
  };

  const toggleCollapseEncomenda = (encCode: string) => {
    setCollapsedEncomendas((prev) => {
      const current = isEncomendaCollapsed(encCode);
      const next = { ...prev, [encCode]: !current };
      try {
        localStorage.setItem('multilinea_collapsed_encomendas', JSON.stringify(next));
      } catch (e) {
        console.error(e);
      }
      return next;
    });
  };

  const collapseAllCompleted = () => {
    setCollapsedEncomendas((prev) => {
      const next = { ...prev };
      ordersGroupedByEncomenda.forEach(([encCode]) => {
        const stats = encomendaCompletionStats.get(encCode);
        if (stats?.isFullyCompleted) {
          next[encCode] = true;
        }
      });
      try {
        localStorage.setItem('multilinea_collapsed_encomendas', JSON.stringify(next));
      } catch (e) {
        console.error(e);
      }
      return next;
    });
  };

  const collapseAllEncomendas = () => {
    const next: Record<string, boolean> = {};
    ordersGroupedByEncomenda.forEach(([encCode]) => {
      next[encCode] = true;
    });
    setCollapsedEncomendas(next);
    try {
      localStorage.setItem('multilinea_collapsed_encomendas', JSON.stringify(next));
    } catch (e) {
      console.error(e);
    }
  };

  const expandAllEncomendas = () => {
    const next: Record<string, boolean> = {};
    ordersGroupedByEncomenda.forEach(([encCode]) => {
      next[encCode] = false;
    });
    setCollapsedEncomendas(next);
    try {
      localStorage.setItem('multilinea_collapsed_encomendas', JSON.stringify(next));
    } catch (e) {
      console.error(e);
    }
  };

  const handleToggleAutoCollapse = (val: boolean) => {
    setAutoCollapseCompleted(val);
    try {
      localStorage.setItem('multilinea_auto_collapse_completed', val ? '1' : '0');
    } catch (e) {
      console.error(e);
    }
    if (val) {
      setCollapsedEncomendas((prev) => {
        const next = { ...prev };
        ordersGroupedByEncomenda.forEach(([encCode]) => {
          const stats = encomendaCompletionStats.get(encCode);
          if (stats?.isFullyCompleted) {
            next[encCode] = true;
          }
        });
        return next;
      });
    }
  };

  const displayedOrdersGroupedByEncomenda = useMemo(() => {
    return ordersGroupedByEncomenda.filter(([encCode]) => {
      if (completionFilter === 'ALL') return true;
      const stats = encomendaCompletionStats.get(encCode);
      if (completionFilter === 'COMPLETED_ONLY') {
        return !!stats?.isFullyCompleted;
      }
      if (completionFilter === 'PENDING_ONLY') {
        return !stats?.isFullyCompleted;
      }
      return true;
    });
  }, [ordersGroupedByEncomenda, completionFilter, encomendaCompletionStats]);

  const displayedUnifiedOrders = useMemo(() => {
    return filteredOrders.filter((o) => {
      if (completionFilter === 'ALL') return true;
      const plannedProducts = getOrderProductQty(o);
      const breakdown = getDeliveredPartsForOrder(
        o.batchNumber,
        o.productCode,
        plannedProducts
      );
      const isCompleted = o.status === 'CONCLUIDO' || breakdown.overallPct >= 100;
      if (completionFilter === 'COMPLETED_ONLY') {
        return isCompleted;
      }
      if (completionFilter === 'PENDING_ONLY') {
        return !isCompleted;
      }
      return true;
    });
  }, [filteredOrders, completionFilter, catalogParts, logs]);

  const handleStartEdit = (order: ProductionOrder) => {
    setEditingOrderId(order.id);
    setOrderCode(getCanonicalEncomendaCode(order));
    setProductCode(order.productCode);
    setBatchNumber(order.batchNumber);
    setProductLine(order.productLine);
    setScheduleColor(order.scheduleColor);
    setProductDescription(order.productDescription);
    setFinishColor(order.finishColor);
    setQtyV01(order.qtyV01);
    setQtyV02(order.qtyV02);
    setQtyV03(order.qtyV03);
    setDateCorte(order.dateCorte);
    setDateColadeira(order.dateColadeira);
    setDateFuradeira(order.dateFuradeira);
    setDatePintura(order.datePintura);
    setIsHighlighted(Boolean(order.isHighlighted));
    setIsEncab(Boolean(order.isEncab));
    setShowAddForm(true);

    setTimeout(() => {
      const el = document.getElementById('pmp-order-form');
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 50);
  };

  const handleOpenNewOrderForm = (prefilledOrderCode?: string, suggestedBatch?: string) => {
    setEditingOrderId(null);
    const code =
      prefilledOrderCode !== undefined
        ? prefilledOrderCode
        : selectedEncomenda !== 'ALL'
        ? selectedEncomenda
        : '';
    setOrderCode(code);
    if (suggestedBatch) {
      setBatchNumber(suggestedBatch);
    } else if (code) {
      const existingInEnc = orders.filter(
        (o) => (o.orderCode || '').trim().toUpperCase() === code.trim().toUpperCase()
      );
      const nextIdx = String(existingInEnc.length + 1).padStart(2, '0');
      setBatchNumber(`${code}${nextIdx}`);
    } else {
      setBatchNumber('');
    }
    setProductCode('');
    setProductDescription('');
    setProductLine('RAINHA');
    setScheduleColor('VERDE');
    setFinishColor('NATURE');
    setQtyV01(200);
    setQtyV02(0);
    setQtyV03(0);

    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const dStr = (offsetDays: number) => {
      const d = new Date();
      d.setDate(now.getDate() + offsetDays);
      return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
    };
    setDateCorte(dStr(0));
    setDateColadeira(dStr(1));
    setDateFuradeira(dStr(2));
    setDatePintura(dStr(3));
    setIsHighlighted(false);
    setIsEncab(false);
    setShowAddForm(true);

    setTimeout(() => {
      const el = document.getElementById('pmp-order-form');
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 50);
  };

  const handleResetForm = () => {
    setEditingOrderId(null);
    setProductCode('');
    setBatchNumber('');
    setProductDescription('');
    setQtyV01(200);
    setQtyV02(0);
    setQtyV03(0);
    setIsHighlighted(false);
    setIsEncab(false);
    setShowAddForm(false);
  };

  const handleInlineSaveQty = async (
    order: ProductionOrder,
    field: 'qtyV01' | 'qtyV02' | 'qtyV03' | 'totalVolumes',
    newQtyVal: number
  ) => {
    const validQty = Math.max(0, Math.round(newQtyVal));
    let v1 = order.qtyV01 || 0;
    let v2 = order.qtyV02 || 0;
    let v3 = order.qtyV03 || 0;

    if (field === 'qtyV01') v1 = validQty;
    else if (field === 'qtyV02') v2 = validQty;
    else if (field === 'qtyV03') v3 = validQty;
    else if (field === 'totalVolumes') {
      if (v2 === 0 && v3 === 0) {
        v1 = validQty;
      } else {
        const currentSum = v1 + v2 + v3 || 1;
        const ratio = validQty / currentSum;
        v1 = Math.round(v1 * ratio);
        v2 = Math.round(v2 * ratio);
        v3 = Math.max(0, validQty - (v1 + v2));
      }
    }
    const newTotal = v1 + v2 + v3;

    try {
      setSavingInline(true);
      await onUpdateOrder(order.id, {
        orderCode: order.orderCode,
        productCode: order.productCode,
        batchNumber: order.batchNumber,
        productLine: order.productLine,
        scheduleColor: order.scheduleColor,
        productDescription: order.productDescription,
        finishColor: order.finishColor,
        qtyV01: v1,
        qtyV02: v2,
        qtyV03: v3,
        totalVolumes: newTotal,
        dateCorte: order.dateCorte || '',
        dateColadeira: order.dateColadeira || '',
        dateFuradeira: order.dateFuradeira || '',
        datePintura: order.datePintura || '',
        isHighlighted: Boolean(order.isHighlighted),
        isEncab: Boolean(order.isEncab),
      });
      setInlineEditing(null);
      setFeedbackMsg(
        `Quantidade do lote [${order.batchNumber}] atualizada para ${newTotal} volumes com sucesso!`
      );
      setTimeout(() => setFeedbackMsg(null), 4000);
    } catch (err) {
      console.error(err);
      setFeedbackMsg(
        `Erro ao salvar quantidade: ${err instanceof Error ? err.message : String(err)}`
      );
    } finally {
      setSavingInline(false);
    }
  };

  const handleSaveOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    setExcelErrorMsg(null);
    const v1 = Math.max(0, Number(qtyV01) || 0);
    const v2 = Math.max(0, Number(qtyV02) || 0);
    const v3 = Math.max(0, Number(qtyV03) || 0);
    const total = v1 + v2 + v3;

    const rawTypedOrderCode = orderCode.trim().toUpperCase().replace(/\s+/g, '').slice(0, 60);
    const cleanBatch = (
      batchNumber.trim().toUpperCase().replace(/\s+/g, '') ||
      (rawTypedOrderCode ? `${rawTypedOrderCode}01` : 'LOTE-01')
    ).slice(0, 60);

    const cleanOrderCode =
      getCanonicalEncomendaCode({
        orderCode: rawTypedOrderCode,
        batchNumber: cleanBatch,
      }) ||
      rawTypedOrderCode ||
      'M26051';

    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const defaultDateStr = `${pad(now.getDate())}/${pad(now.getMonth() + 1)}/${now.getFullYear()}`;

    const payload: Omit<ProductionOrder, 'id' | 'ownerId' | 'createdAt'> = {
      orderCode: cleanOrderCode.slice(0, 60),
      productCode: (productCode.trim().toUpperCase() || 'S/COD').slice(0, 60),
      batchNumber: cleanBatch,
      productLine: (productLine.trim().toUpperCase() || 'GERAL').slice(0, 80),
      scheduleColor: scheduleColor || 'VERDE',
      productDescription: (productDescription.trim().toUpperCase() || 'PRODUTO').slice(0, 160),
      finishColor: (finishColor.trim().toUpperCase() || 'PADRÃO').slice(0, 80),
      qtyV01: v1,
      qtyV02: v2,
      qtyV03: v3,
      totalVolumes: total > 0 ? total : v1,
      dateCorte: (dateCorte.trim() || defaultDateStr).slice(0, 30),
      dateColadeira: (dateColadeira.trim() || defaultDateStr).slice(0, 30),
      dateFuradeira: (dateFuradeira.trim() || defaultDateStr).slice(0, 30),
      datePintura: (datePintura.trim() || defaultDateStr).slice(0, 30),
      isHighlighted: Boolean(isHighlighted),
      isEncab: Boolean(isEncab),
    };

    try {
      if (editingOrderId) {
        await onUpdateOrder(editingOrderId, payload);
        setFeedbackMsg(
          `Lote [${payload.batchNumber}] da Encomenda [${payload.orderCode}] atualizado com sucesso!`
        );
      } else {
        await onCreateOrder(payload);
        setFeedbackMsg(
          `Encomenda [${payload.orderCode}] cadastrada com o lote [${payload.batchNumber}] com sucesso!`
        );
      }
      // Ensure the Encomenda is expanded and focused so the user immediately sees it
      setCollapsedEncomendas((prev) => {
        const next = { ...prev, [payload.orderCode]: false };
        try {
          localStorage.setItem('multilinea_collapsed_encomendas', JSON.stringify(next));
        } catch {}
        return next;
      });
      if (completionFilter === 'COMPLETED_ONLY') {
        setCompletionFilter('ALL');
      }
      if (selectedEncomenda !== 'ALL' && selectedEncomenda !== payload.orderCode) {
        setSelectedEncomenda(payload.orderCode);
      }
      setLookupBatch(cleanBatch);
      if (payload.productCode) {
        setLookupProductCode(payload.productCode);
      }
      handleResetForm();
      setTimeout(() => setFeedbackMsg(null), 5000);
    } catch (err) {
      setFeedbackMsg(
        `Erro ao salvar: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  };

  const handleToggleHighlight = async (order: ProductionOrder) => {
    await onUpdateOrder(order.id, {
      orderCode: order.orderCode,
      productCode: order.productCode,
      batchNumber: order.batchNumber,
      productLine: order.productLine,
      scheduleColor: order.scheduleColor,
      productDescription: order.productDescription,
      finishColor: order.finishColor,
      qtyV01: order.qtyV01,
      qtyV02: order.qtyV02,
      qtyV03: order.qtyV03,
      totalVolumes: order.totalVolumes,
      dateCorte: order.dateCorte,
      dateColadeira: order.dateColadeira,
      dateFuradeira: order.dateFuradeira,
      datePintura: order.datePintura,
      isHighlighted: !order.isHighlighted,
      isEncab: Boolean(order.isEncab),
    });
  };

  // Handle direct .xlsx / .xls / .csv file upload
  const handleExcelFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setExcelErrorMsg(null);
    setExcelFileName(file.name);

    try {
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer, { type: 'array', cellDates: true });
      setWorkbookRef(wb);
      const sheets = wb.SheetNames || [];
      setExcelSheetNames(sheets);

      if (sheets.length === 0) {
        setExcelErrorMsg('Nenhuma aba encontrada no arquivo Excel.');
        return;
      }

      // Find the first sheet that yields valid orders, or fallback to sheets[0]
      let chosenSheet = sheets[0];
      let extracted: Omit<ProductionOrder, 'id' | 'ownerId' | 'createdAt'>[] = [];
      for (const sName of sheets) {
        const ws = wb.Sheets[sName];
        const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, {
          header: 1,
          defval: '',
          raw: false,
        });
        const candidate = extractOrdersFromRows(rows, defaultImportEncomenda);
        if (candidate.length > 0) {
          chosenSheet = sName;
          extracted = candidate;
          break;
        }
      }

      setSelectedSheetName(chosenSheet);
      setPreviewExcelItems(extracted);

      if (extracted.length === 0) {
        setExcelErrorMsg(
          'Não encontramos linhas com Código e Lote automaticamente nesta aba. Selecione outra aba da planilha ou confira as colunas (CÓDIGO e LOTE).'
        );
      }
    } catch (err) {
      setExcelErrorMsg(
        `Erro ao ler o arquivo Excel: ${err instanceof Error ? err.message : String(err)}`
      );
    } finally {
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  // Handle changing sheet in an uploaded Excel workbook
  const handleSelectExcelSheet = (sheetName: string) => {
    setSelectedSheetName(sheetName);
    setExcelErrorMsg(null);
    if (!workbookRef) return;
    const ws = workbookRef.Sheets[sheetName];
    if (!ws) return;
    const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, {
      header: 1,
      defval: '',
      raw: false,
    });
    const extracted = extractOrdersFromRows(rows, defaultImportEncomenda);
    setPreviewExcelItems(extracted);
    if (extracted.length === 0) {
      setExcelErrorMsg(
        `Nenhum lote identificado na aba "${sheetName}". Verifique se há colunas de CÓDIGO e LOTE.`
      );
    }
  };

  // Parse pasted Excel rows (TSV or CSV) matching the user's spreadsheet columns
  const handlePasteChange = (text: string, overrideEnc: string) => {
    setPastedText(text);
    setExcelErrorMsg(null);
    const rawLines = text
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0);
    if (rawLines.length === 0) {
      if (!workbookRef) setPreviewExcelItems([]);
      return;
    }
    const rows = rawLines.map((line) =>
      line.includes('\t')
        ? line.split('\t')
        : line.includes(';')
        ? line.split(';')
        : line.split(/\s{2,}/)
    );
    const extracted = extractOrdersFromRows(rows, overrideEnc);
    setPreviewExcelItems(extracted);
  };

  const handleImportFromExcelPaste = async (e: React.FormEvent) => {
    e.preventDefault();
    setExcelErrorMsg(null);

    let itemsToSave = previewExcelItems;
    if (itemsToSave.length === 0 && pastedText.trim()) {
      const rawLines = pastedText
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter((l) => l.length > 0);
      const rows = rawLines.map((line) =>
        line.includes('\t')
          ? line.split('\t')
          : line.includes(';')
          ? line.split(';')
          : line.split(/\s{2,}/)
      );
      itemsToSave = extractOrdersFromRows(rows, defaultImportEncomenda);
    }

    if (itemsToSave.length === 0) {
      setExcelErrorMsg(
        'Nenhum lote válido encontrado para importar. Envie o arquivo .xlsx da sua planilha ou cole as linhas com Código e Lote.'
      );
      return;
    }

    setImporting(true);
    try {
      const count = await onBulkImportOrders(itemsToSave);
      const firstEnc = itemsToSave[0]?.orderCode;
      if (firstEnc && selectedEncomenda !== 'ALL' && selectedEncomenda !== firstEnc) {
        setSelectedEncomenda('ALL');
      }
      setFeedbackMsg(
        `${count} ${count === 1 ? 'lote importado' : 'lotes importados'} do Excel para o Plano Mestre de Produção com sucesso!`
      );
      setPastedText('');
      setPreviewExcelItems([]);
      setWorkbookRef(null);
      setExcelFileName(null);
      setExcelSheetNames([]);
      setShowExcelModal(false);
      setTimeout(() => setFeedbackMsg(null), 6000);
    } catch (err) {
      setExcelErrorMsg(
        `Falha ao salvar os lotes no banco de dados: ${
          err instanceof Error ? err.message : String(err)
        }`
      );
    } finally {
      setImporting(false);
    }
  };

  const handleExportPmpCSV = () => {
    const headers = [
      'ENCOMENDA',
      'CODIGO',
      'LOTE',
      'LINHA',
      'COR_PROGRAMACAO',
      'DESCRICAO_DO_PRODUTO',
      'COR',
      'V01',
      'V02',
      'V03',
      'TOTAL_VOLUMES',
      'DATA_CORTE',
      'DATA_COLADEIRA',
      'DATA_FURADEIRA',
      'DATA_PINTURA',
    ];
    const rows = filteredOrders.map((o) =>
      [
        o.orderCode,
        o.productCode,
        o.batchNumber,
        o.productLine,
        o.scheduleColor,
        o.productDescription,
        o.finishColor,
        o.qtyV01 || '',
        o.qtyV02 || '',
        o.qtyV03 || '',
        o.totalVolumes,
        o.dateCorte,
        o.dateColadeira,
        o.dateFuradeira,
        o.datePintura,
      ]
        .map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`)
        .join(';')
    );
    const csv = '\uFEFF' + [headers.join(';'), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `plano_mestre_producao_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Helper to render the exact Excel table for a list of orders
  const renderExcelScheduleTable = (tableOrders: ProductionOrder[]) => {
    const completedLotsInTable = tableOrders.filter((o) => {
      const plannedProducts = getOrderProductQty(o);
      const breakdown = getDeliveredPartsForOrder(
        o.batchNumber,
        o.productCode,
        plannedProducts
      );
      return o.status === 'CONCLUIDO' || breakdown.overallPct >= 100;
    }).length;

    return (
      <div className="space-y-1">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between text-[11px] text-slate-500 px-1 gap-2 pb-1">
          <span>Deslize a tabela para o lado para ver volumes e datas ↔</span>
          <div className="flex items-center gap-2">
            <span className="font-mono font-bold text-slate-700">{tableOrders.length} lotes</span>
            {completedLotsInTable > 0 && (
              <button
                type="button"
                onClick={() => setCollapseCompletedRows((prev) => !prev)}
                className={`px-2.5 py-1 rounded text-xs font-bold border transition-colors cursor-pointer flex items-center gap-1.5 ${
                  collapseCompletedRows
                    ? 'bg-emerald-50 border-emerald-300 text-emerald-800 hover:bg-emerald-100'
                    : 'bg-slate-50 border-slate-300 text-slate-700 hover:bg-slate-100'
                }`}
                title={
                  collapseCompletedRows
                    ? 'Clique para voltar a exibir todos os lotes'
                    : 'Recolhe os lotes já finalizados para dar espaço aos subsequentes'
                }
              >
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                {collapseCompletedRows
                  ? `Expandir ${completedLotsInTable} lotes concluídos recolhidos`
                  : `Recolher ${completedLotsInTable} lotes 100% concluídos`}
              </button>
            )}
          </div>
        </div>
        <div className="overflow-x-auto border border-slate-400 rounded-lg shadow-xs bg-white touch-pan-x -mx-1 sm:mx-0">
          <table className="w-full border-collapse text-xs min-w-[980px]">
          <thead>
            {/* Top Group Header: QTDE / VOLUMES & DATAS DE ETAPAS */}
            <tr className="bg-[#1b436c] text-white border-b border-slate-400">
              <th
                colSpan={7}
                className="py-1.5 px-2 text-left font-bold text-[11px] tracking-wider uppercase bg-[#081530] border-r border-slate-500"
              >
                PLANO MESTRE DE PRODUÇÃO — MULTILINEA
              </th>
              <th
                colSpan={3}
                className="py-1.5 px-2 text-center font-extrabold text-[11px] tracking-wider uppercase border-r border-slate-400"
              >
                QTDE / VOLUMES
              </th>
              <th
                colSpan={4}
                className="py-1.5 px-2 text-center font-extrabold text-[11px] tracking-wider uppercase border-r border-slate-400"
              >
                DATAS DE ETAPAS
              </th>
              <th className="py-1.5 px-2 text-center font-extrabold text-[11px] uppercase bg-[#081530]">
                REALIZADO / AÇÕES
              </th>
            </tr>

            {/* Column Headers */}
            <tr className="bg-[#1b436c] text-white font-extrabold text-[11px] uppercase tracking-wide border-b border-slate-500">
              <th className="py-2 px-2 border-r border-slate-400 text-center">ENCOMENDA</th>
              <th className="py-2 px-2 border-r border-slate-400 text-center">CÓDIGO</th>
              <th className="py-2 px-2 border-r border-slate-400 text-center">LOTE</th>
              <th className="py-2 px-2.5 border-r border-slate-400 text-center">LINHA</th>
              <th className="py-2 px-2 border-r border-slate-400 text-center">
                COR PROGRAMAÇÃO
              </th>
              <th className="py-2 px-3 border-r border-slate-400 text-left min-w-[250px]">
                DESCRIÇÃO DO PRODUTOS
              </th>
              <th className="py-2 px-2.5 border-r border-slate-400 text-center">COR</th>
              <th className="py-2 px-2 border-r border-slate-400 text-center w-14">V01</th>
              <th className="py-2 px-2 border-r border-slate-400 text-center w-14">V02</th>
              <th className="py-2 px-2 border-r border-slate-400 text-center w-14">V03</th>
              <th className="py-2 px-2.5 border-r border-slate-400 text-center">CORTE</th>
              <th className="py-2 px-2.5 border-r border-slate-400 text-center">
                COLADEIRA
              </th>
              <th className="py-2 px-2.5 border-r border-slate-400 text-center">
                FURADEIRA
              </th>
              <th className="py-2 px-2.5 border-r border-slate-400 text-center">PINTURA</th>
              <th className="py-2 px-2 text-center bg-[#081530]">OPÇÕES</th>
            </tr>
          </thead>

          <tbody className="divide-y divide-slate-300">
            {collapseCompletedRows && completedLotsInTable > 0 && (
              <tr className="bg-emerald-50/80 border-b border-emerald-200">
                <td colSpan={15} className="py-2.5 px-3 text-emerald-950 font-semibold text-xs">
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5 font-bold">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                      {completedLotsInTable} {completedLotsInTable === 1 ? 'lote 100% concluído foi recolhido' : 'lotes 100% concluídos foram recolhidos'} desta tabela para economizar espaço de tela.
                    </span>
                    <button
                      type="button"
                      onClick={() => setCollapseCompletedRows(false)}
                      className="text-emerald-800 underline font-bold hover:text-emerald-950 cursor-pointer ml-2"
                    >
                      Mostrar todos os lotes
                    </button>
                  </div>
                </td>
              </tr>
            )}

            {tableOrders.map((order, idx) => {
              const plannedProducts = getOrderProductQty(order);
              const plannedVolumes = getOrderTotalVolumes(order);
              const volsPerProduct = getOrderVolumesPerProduct(order);

              // Calculate product completion across all its registered part types based on PRODUCT quantity (e.g., 200 products, not 400 volumes!)
              const rowPartsBreakdown = getDeliveredPartsForOrder(
                order.batchNumber,
                order.productCode,
                plannedProducts
              );

              const totalPartTypes = rowPartsBreakdown.totalPartTypes;
              const completedPartTypesCount = rowPartsBreakdown.completedPartTypesCount;
              const overallPct = rowPartsBreakdown.overallPct;
              const cortePct = rowPartsBreakdown.cortePct;
              const coladeiraPct = rowPartsBreakdown.coladeiraPct;
              const furadeiraPct = rowPartsBreakdown.furadeiraPct;
              const pinturaPct = rowPartsBreakdown.pinturaPct;
              const hasAnyLog = rowPartsBreakdown.totalLogsCount > 0;

              // If completed rows are collapsed in table, skip completed rows
              const isDone = order.status === 'CONCLUIDO' || overallPct >= 100;
              if (collapseCompletedRows && isDone) {
                return null;
              }

              // Check if previous row had identical stage dates for visual grouping
              const prevOrder = idx > 0 ? tableOrders[idx - 1] : null;
              const isNewDateGroup =
                !prevOrder ||
                prevOrder.dateCorte !== order.dateCorte ||
                prevOrder.datePintura !== order.datePintura;

              const rowBg = order.isHighlighted
                ? 'bg-[#ffff00] font-bold'
                : 'bg-white hover:bg-blue-50/40';

              const batchCellStyle = order.isEncab
                ? 'bg-[#f8cbad] text-[#9c0006] font-bold'
                : '';

              const isExpanded = Boolean(expandedOrderIds[order.id]);

              return (
                <React.Fragment key={order.id}>
                <tr
                  id={`order_row_${order.id}`}
                  className={`${rowBg} ${
                    isNewDateGroup && idx > 0 ? 'border-t-2 border-t-slate-600' : ''
                  } transition-colors text-slate-900`}
                >
                  {/* ENCOMENDA */}
                  <td className="py-1.5 px-2 border-r border-slate-300 text-center font-mono font-bold text-[#081530]">
                    {getCanonicalEncomendaCode(order)}
                  </td>

                  {/* CÓDIGO */}
                  <td className="py-1.5 px-2 border-r border-slate-300 text-center font-mono font-semibold">
                    {order.productCode}
                  </td>

                  {/* LOTE */}
                  <td
                    className={`py-1.5 px-2 border-r border-slate-300 text-center font-mono ${batchCellStyle}`}
                  >
                    {order.batchNumber}
                  </td>

                  {/* LINHA */}
                  <td className="py-1.5 px-2.5 border-r border-slate-300 text-center font-medium whitespace-nowrap">
                    {order.productLine}
                  </td>

                  {/* COR PROGRAMAÇÃO */}
                  <td className="py-1.5 px-2 border-r border-slate-300 text-center font-medium">
                    {order.scheduleColor}
                  </td>

                  {/* DESCRIÇÃO DO PRODUTOS */}
                  <td className="py-1.5 px-3 border-r border-slate-300 text-left">
                    <div className="flex items-center gap-1.5">
                      {order.isEncab && (
                        <span
                          className="w-2 h-2 rounded-full bg-red-600 shrink-0"
                          title="Item ENCAB"
                        />
                      )}
                      <span className={order.isEncab ? 'font-extrabold' : 'font-normal'}>
                        {order.productDescription}
                      </span>
                    </div>
                  </td>

                  {/* COR */}
                  <td className="py-1.5 px-2.5 border-r border-slate-300 text-center whitespace-nowrap">
                    {order.finishColor}
                  </td>

                  {/* V01 */}
                  <td className="py-1.5 px-2 border-r border-slate-300 text-center font-mono tabular-nums">
                    {inlineEditing?.orderId === order.id && inlineEditing?.field === 'qtyV01' ? (
                      <div className="flex items-center justify-center gap-1 p-0.5">
                        <input
                          type="number"
                          min={0}
                          autoFocus
                          value={inlineEditing.valStr}
                          onChange={(e) =>
                            setInlineEditing({ ...inlineEditing, valStr: e.target.value })
                          }
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              handleInlineSaveQty(order, 'qtyV01', Number(inlineEditing.valStr));
                            } else if (e.key === 'Escape') {
                              setInlineEditing(null);
                            }
                          }}
                          className="w-16 h-7 px-1 text-center text-xs font-bold font-mono bg-white border-2 border-blue-600 rounded text-slate-900 shadow-sm focus:outline-none"
                        />
                        <button
                          type="button"
                          disabled={savingInline}
                          onClick={() =>
                            handleInlineSaveQty(order, 'qtyV01', Number(inlineEditing.valStr))
                          }
                          className="w-6 h-7 bg-emerald-600 hover:bg-emerald-700 text-white rounded flex items-center justify-center cursor-pointer shadow-xs"
                          title="Salvar quantidade (Enter)"
                        >
                          <Check className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setInlineEditing(null)}
                          className="w-6 h-7 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded flex items-center justify-center cursor-pointer"
                          title="Cancelar (Esc)"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ) : (
                      <div
                        onClick={() =>
                          setInlineEditing({
                            orderId: order.id,
                            field: 'qtyV01',
                            valStr: String(order.qtyV01 || 0),
                          })
                        }
                        className="group/qty relative p-1 rounded hover:bg-blue-100/70 hover:ring-1 hover:ring-blue-400 cursor-pointer transition-all"
                        title="Clique para editar a quantidade de V01 na programação"
                      >
                        <div className="font-bold text-slate-900 flex items-center justify-center gap-1">
                          <span>{order.qtyV01 > 0 ? order.qtyV01 : '-'}</span>
                          <Edit2 className="w-2.5 h-2.5 text-blue-600 opacity-0 group-hover/qty:opacity-100 transition-opacity" />
                        </div>
                        {volsPerProduct > 1 && (
                          <div className="text-[9px] font-bold text-slate-500 leading-none">
                            vol 1/{volsPerProduct}
                          </div>
                        )}
                        {hasAnyLog && (
                          <div
                            className={`text-[10px] font-extrabold ${
                              overallPct >= 100 ? 'text-emerald-700' : 'text-amber-800'
                            }`}
                          >
                            {overallPct}%
                          </div>
                        )}
                      </div>
                    )}
                  </td>

                  {/* V02 */}
                  <td className="py-1.5 px-2 border-r border-slate-300 text-center font-mono tabular-nums">
                    {inlineEditing?.orderId === order.id && inlineEditing?.field === 'qtyV02' ? (
                      <div className="flex items-center justify-center gap-1 p-0.5">
                        <input
                          type="number"
                          min={0}
                          autoFocus
                          value={inlineEditing.valStr}
                          onChange={(e) =>
                            setInlineEditing({ ...inlineEditing, valStr: e.target.value })
                          }
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              handleInlineSaveQty(order, 'qtyV02', Number(inlineEditing.valStr));
                            } else if (e.key === 'Escape') {
                              setInlineEditing(null);
                            }
                          }}
                          className="w-16 h-7 px-1 text-center text-xs font-bold font-mono bg-white border-2 border-blue-600 rounded text-slate-900 shadow-sm focus:outline-none"
                        />
                        <button
                          type="button"
                          disabled={savingInline}
                          onClick={() =>
                            handleInlineSaveQty(order, 'qtyV02', Number(inlineEditing.valStr))
                          }
                          className="w-6 h-7 bg-emerald-600 hover:bg-emerald-700 text-white rounded flex items-center justify-center cursor-pointer shadow-xs"
                          title="Salvar quantidade (Enter)"
                        >
                          <Check className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setInlineEditing(null)}
                          className="w-6 h-7 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded flex items-center justify-center cursor-pointer"
                          title="Cancelar (Esc)"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ) : (
                      <div
                        onClick={() =>
                          setInlineEditing({
                            orderId: order.id,
                            field: 'qtyV02',
                            valStr: String(order.qtyV02 || 0),
                          })
                        }
                        className="group/qty relative p-1 rounded hover:bg-blue-100/70 hover:ring-1 hover:ring-blue-400 cursor-pointer transition-all"
                        title="Clique para editar a quantidade de V02 na programação"
                      >
                        <div className="font-bold text-slate-900 flex items-center justify-center gap-1">
                          <span>{order.qtyV02 > 0 ? order.qtyV02 : '-'}</span>
                          <Edit2 className="w-2.5 h-2.5 text-blue-600 opacity-0 group-hover/qty:opacity-100 transition-opacity" />
                        </div>
                        {volsPerProduct > 1 && (
                          <div className="text-[9px] font-bold text-slate-500 leading-none">
                            vol 2/{volsPerProduct}
                          </div>
                        )}
                        {hasAnyLog && (
                          <div
                            className={`text-[10px] font-extrabold ${
                              overallPct >= 100 ? 'text-emerald-700' : 'text-amber-800'
                            }`}
                          >
                            {overallPct}%
                          </div>
                        )}
                      </div>
                    )}
                  </td>

                  {/* V03 */}
                  <td className="py-1.5 px-2 border-r border-slate-300 text-center font-mono tabular-nums">
                    {inlineEditing?.orderId === order.id && inlineEditing?.field === 'qtyV03' ? (
                      <div className="flex items-center justify-center gap-1 p-0.5">
                        <input
                          type="number"
                          min={0}
                          autoFocus
                          value={inlineEditing.valStr}
                          onChange={(e) =>
                            setInlineEditing({ ...inlineEditing, valStr: e.target.value })
                          }
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              handleInlineSaveQty(order, 'qtyV03', Number(inlineEditing.valStr));
                            } else if (e.key === 'Escape') {
                              setInlineEditing(null);
                            }
                          }}
                          className="w-16 h-7 px-1 text-center text-xs font-bold font-mono bg-white border-2 border-blue-600 rounded text-slate-900 shadow-sm focus:outline-none"
                        />
                        <button
                          type="button"
                          disabled={savingInline}
                          onClick={() =>
                            handleInlineSaveQty(order, 'qtyV03', Number(inlineEditing.valStr))
                          }
                          className="w-6 h-7 bg-emerald-600 hover:bg-emerald-700 text-white rounded flex items-center justify-center cursor-pointer shadow-xs"
                          title="Salvar quantidade (Enter)"
                        >
                          <Check className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setInlineEditing(null)}
                          className="w-6 h-7 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded flex items-center justify-center cursor-pointer"
                          title="Cancelar (Esc)"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ) : (
                      <div
                        onClick={() =>
                          setInlineEditing({
                            orderId: order.id,
                            field: 'qtyV03',
                            valStr: String(order.qtyV03 || 0),
                          })
                        }
                        className="group/qty relative p-1 rounded hover:bg-blue-100/70 hover:ring-1 hover:ring-blue-400 cursor-pointer transition-all"
                        title="Clique para editar a quantidade de V03 na programação"
                      >
                        <div className="font-bold text-slate-900 flex items-center justify-center gap-1">
                          <span>{order.qtyV03 > 0 ? order.qtyV03 : '-'}</span>
                          <Edit2 className="w-2.5 h-2.5 text-blue-600 opacity-0 group-hover/qty:opacity-100 transition-opacity" />
                        </div>
                        {volsPerProduct > 1 && (
                          <div className="text-[9px] font-bold text-slate-500 leading-none">
                            vol 3/{volsPerProduct}
                          </div>
                        )}
                        {hasAnyLog && (
                          <div
                            className={`text-[10px] font-extrabold ${
                              overallPct >= 100 ? 'text-emerald-700' : 'text-amber-800'
                            }`}
                          >
                            {overallPct}%
                          </div>
                        )}
                      </div>
                    )}
                  </td>

                  {/* DATAS DE ETAPAS: CORTE */}
                  <td className="py-1.5 px-2 border-r border-slate-300 text-center font-mono bg-[#f2f2f2]/80 whitespace-nowrap">
                    <div className="font-semibold text-slate-800">{order.dateCorte}</div>
                    <div
                      className={`text-[10px] font-extrabold mt-0.5 px-1.5 py-0.5 rounded ${
                        cortePct >= 100
                          ? 'bg-emerald-600 text-white'
                          : cortePct > 0 || rowPartsBreakdown.totalCortePcs > 0
                          ? 'bg-amber-200 text-amber-950'
                          : 'text-slate-500'
                      }`}
                      title={
                        totalPartTypes > 0
                          ? `${rowPartsBreakdown.corteCompletedTypes} de ${totalPartTypes} tipos de peças concluídos no Corte`
                          : 'Cadastre as peças do produto para ver a porcentagem exata'
                      }
                    >
                      {totalPartTypes > 0
                        ? `${cortePct}% (${rowPartsBreakdown.corteCompletedTypes}/${totalPartTypes} pçs)`
                        : `${cortePct}%`}
                    </div>
                  </td>

                  {/* DATAS DE ETAPAS: COLADEIRA */}
                  <td className="py-1.5 px-2 border-r border-slate-300 text-center font-mono bg-[#f2f2f2]/80 whitespace-nowrap">
                    <div className="font-semibold text-slate-800">{order.dateColadeira}</div>
                    <div
                      className={`text-[10px] font-extrabold mt-0.5 px-1.5 py-0.5 rounded ${
                        coladeiraPct >= 100
                          ? 'bg-emerald-600 text-white'
                          : coladeiraPct > 0 || rowPartsBreakdown.totalColadeiraPcs > 0
                          ? 'bg-amber-200 text-amber-950'
                          : 'text-slate-500'
                      }`}
                      title={
                        totalPartTypes > 0
                          ? `${rowPartsBreakdown.coladeiraCompletedTypes} de ${totalPartTypes} tipos de peças concluídos na Coladeira`
                          : 'Cadastre as peças do produto para ver a porcentagem exata'
                      }
                    >
                      {totalPartTypes > 0
                        ? `${coladeiraPct}% (${rowPartsBreakdown.coladeiraCompletedTypes}/${totalPartTypes} pçs)`
                        : `${coladeiraPct}%`}
                    </div>
                  </td>

                  {/* DATAS DE ETAPAS: FURADEIRA */}
                  <td className="py-1.5 px-2 border-r border-slate-300 text-center font-mono bg-[#f2f2f2]/80 whitespace-nowrap">
                    <div className="font-semibold text-slate-800">{order.dateFuradeira}</div>
                    <div
                      className={`text-[10px] font-extrabold mt-0.5 px-1.5 py-0.5 rounded ${
                        furadeiraPct >= 100
                          ? 'bg-emerald-600 text-white'
                          : furadeiraPct > 0 || rowPartsBreakdown.totalFuradeiraPcs > 0
                          ? 'bg-amber-200 text-amber-950'
                          : 'text-slate-500'
                      }`}
                      title={
                        totalPartTypes > 0
                          ? `${rowPartsBreakdown.furadeiraCompletedTypes} de ${totalPartTypes} tipos de peças concluídos na Furadeira`
                          : 'Cadastre as peças do produto para ver a porcentagem exata'
                      }
                    >
                      {totalPartTypes > 0
                        ? `${furadeiraPct}% (${rowPartsBreakdown.furadeiraCompletedTypes}/${totalPartTypes} pçs)`
                        : `${furadeiraPct}%`}
                    </div>
                  </td>

                  {/* DATAS DE ETAPAS: PINTURA */}
                  <td className="py-1.5 px-2 border-r border-slate-300 text-center font-mono bg-[#f2f2f2]/80 whitespace-nowrap">
                    <div className="font-semibold text-slate-800">{order.datePintura}</div>
                    <div
                      className={`text-[10px] font-extrabold mt-0.5 px-1.5 py-0.5 rounded ${
                        pinturaPct >= 100
                          ? 'bg-emerald-600 text-white'
                          : pinturaPct > 0 || rowPartsBreakdown.totalPinturaPcs > 0
                          ? 'bg-amber-200 text-amber-950'
                          : 'text-slate-500'
                      }`}
                      title={
                        totalPartTypes > 0
                          ? `${rowPartsBreakdown.pinturaCompletedTypes} de ${totalPartTypes} tipos de peças concluídos na Pintura UV`
                          : 'Cadastre as peças do produto para ver a porcentagem exata'
                      }
                    >
                      {totalPartTypes > 0
                        ? `${pinturaPct}% (${rowPartsBreakdown.pinturaCompletedTypes}/${totalPartTypes} pçs)`
                        : `${pinturaPct}%`}
                    </div>
                  </td>

                  {/* AÇÕES + VÍNCULO PROGRAMADO X REALIZADO EM PORCENTAGEM POR TIPOS DE PEÇAS */}
                  <td className="py-1.5 px-2 text-center whitespace-nowrap">
                    <div className="flex flex-col items-center gap-1">
                      <div className="flex items-center gap-1.5 text-[10px] font-mono font-extrabold">
                        <span
                          className={`px-2 py-0.5 rounded ${
                            overallPct >= 100
                              ? 'bg-emerald-600 text-white'
                              : overallPct > 0 || hasAnyLog
                              ? 'bg-amber-500 text-slate-950'
                              : 'bg-slate-200 text-slate-700'
                          }`}
                          title={
                            totalPartTypes > 0
                              ? `${completedPartTypesCount} de ${totalPartTypes} tipos de peças concluídos (${overallPct}% do produto processado)`
                              : 'Porcentagem realizada do produto'
                          }
                        >
                          {overallPct}% Realizado
                          {totalPartTypes > 0
                            ? ` (${completedPartTypesCount}/${totalPartTypes} tipos)`
                            : ''}
                        </span>
                      </div>
                      {/* Mini progress bar */}
                      <div className="w-28 h-1.5 bg-slate-200 rounded-full overflow-hidden">
                        <div
                          className={`h-full transition-all ${
                            overallPct >= 100 ? 'bg-emerald-600' : 'bg-amber-500'
                          }`}
                          style={{ width: `${overallPct}%` }}
                        />
                      </div>
                      <div className="flex items-center justify-center gap-1">
                        <button
                          type="button"
                          onClick={() => setTicketModalOrder(order)}
                          className="px-2 py-0.5 rounded text-[10px] font-extrabold bg-[#081530] hover:bg-blue-950 text-amber-400 flex items-center gap-1 cursor-pointer transition-colors"
                          title="Gerar e Imprimir Ficha de Identificação de Peças pronta com QR-CODE"
                        >
                          <QrCode className="w-3 h-3" />
                          <span>Ficha / QR-Code</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setExpandedOrderIds((prev) => ({
                              ...prev,
                              [order.id]: !prev[order.id],
                            }));
                            setLookupBatch(order.batchNumber);
                            setLookupProductCode(order.productCode);
                          }}
                          className={`px-2 py-0.5 rounded text-[10px] font-extrabold flex items-center gap-1 cursor-pointer transition-colors ${
                            isExpanded
                              ? 'bg-[#081530] text-amber-400'
                              : hasAnyLog
                              ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                              : 'bg-slate-100 hover:bg-blue-100 text-slate-800 border border-slate-300'
                          }`}
                          title="Consultar quais peças já foram entregues deste Lote x Código de Produto"
                        >
                          <PackageCheck className="w-3 h-3" />
                          <span>Peças</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleToggleHighlight(order)}
                          className={`p-1 rounded cursor-pointer ${
                            order.isHighlighted
                              ? 'bg-amber-500 text-slate-950'
                              : 'text-slate-400 hover:text-amber-600'
                          }`}
                          title="Destacar linha em amarelo (igual na planilha)"
                        >
                          <Star className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleStartEdit(order)}
                          className="p-1 text-slate-500 hover:text-blue-700 rounded cursor-pointer"
                          title="Editar lote"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={async () => {
                            await onDeleteOrder(order.id);
                            setFeedbackMsg(
                              `Lote [${order.batchNumber}] (${order.productDescription}) excluído com sucesso.`
                            );
                            setTimeout(() => setFeedbackMsg(null), 4000);
                          }}
                          className="p-1 text-slate-400 hover:text-red-600 rounded cursor-pointer transition-colors"
                          title={`Excluir lote ${order.batchNumber}`}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </td>
                </tr>

                {/* EXPANDED SUB-ROW: PEÇAS ENTREGUES DESTE LOTE X CÓDIGO DE PRODUTO */}
                {isExpanded && rowPartsBreakdown && (
                  <tr className="bg-blue-50/80 border-b-2 border-[#081530]">
                    <td colSpan={15} className="p-3">
                      <div className="bg-white border border-blue-900/30 rounded-xl p-3.5 space-y-2.5 shadow-2xs">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-mono text-xs font-extrabold px-2.5 py-1 rounded bg-[#081530] text-amber-400">
                              LOTE {order.batchNumber} × CÓD. {order.productCode}
                            </span>
                            <span className="text-xs font-bold text-slate-900">
                              {order.productDescription} ({order.finishColor}) — Lote:{' '}
                              <strong className="font-mono text-[#081530]">
                                {plannedProducts} produtos
                              </strong>
                              {volsPerProduct > 1 && (
                                <span className="font-mono text-amber-900 ml-1">
                                  ({plannedVolumes} volumes: {[
                                    order.qtyV01 > 0 ? `${order.qtyV01} vol 1/${volsPerProduct}` : null,
                                    order.qtyV02 > 0 ? `${order.qtyV02} vol 2/${volsPerProduct}` : null,
                                    order.qtyV03 > 0 ? `${order.qtyV03} vol 3/${volsPerProduct}` : null,
                                  ]
                                    .filter(Boolean)
                                    .join(' + ')})
                                </span>
                              )}
                            </span>
                            <span
                              className={`font-mono text-xs font-extrabold px-2.5 py-0.5 rounded ${
                                rowPartsBreakdown.overallPct >= 100
                                  ? 'bg-emerald-600 text-white'
                                  : rowPartsBreakdown.overallPct > 0
                                  ? 'bg-amber-500 text-slate-950'
                                  : 'bg-slate-200 text-slate-700'
                              }`}
                            >
                              Status do Produto: {rowPartsBreakdown.overallPct}% Concluído (
                              {rowPartsBreakdown.completedPartTypesCount}/
                              {rowPartsBreakdown.totalPartTypes} tipos de peças entregues)
                            </span>
                          </div>
                          <span className="text-[11px] text-slate-500">
                            Cada tipo de peça equivale a{' '}
                            {rowPartsBreakdown.totalPartTypes > 0
                              ? `${Math.round(100 / rowPartsBreakdown.totalPartTypes)}%`
                              : '100%'}{' '}
                            do produto
                          </span>
                        </div>

                        {rowPartsBreakdown.parts.length === 0 ? (
                          <p className="text-xs text-slate-500 py-2">
                            Nenhuma peça cadastrada ou apontada ainda para o Lote{' '}
                            <strong className="font-mono">{order.batchNumber}</strong> / Produto{' '}
                            <strong className="font-mono">{order.productCode}</strong>. Cadastre as peças deste código na aba Cadastros ou faça um apontamento no terminal.
                          </p>
                        ) : (
                          <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse text-xs">
                              <thead>
                                <tr className="border-b border-slate-200 text-[10px] font-extrabold uppercase text-slate-500">
                                  <th className="py-1.5 pr-3">Cód. Peça</th>
                                  <th className="py-1.5 px-3">Descrição da Peça</th>
                                  <th className="py-1.5 px-2 text-center">Qtd/Prod</th>
                                  <th className="py-1.5 px-3 text-center">Meta Peça no Lote</th>
                                  <th className="py-1.5 px-3 text-center">1. Corte</th>
                                  <th className="py-1.5 px-3 text-center">2. Coladeira</th>
                                  <th className="py-1.5 px-3 text-center">3. Furadeira</th>
                                  <th className="py-1.5 px-3 text-center">4. Pintura UV</th>
                                  <th className="py-1.5 pl-3 text-right">% da Peça / Saldo</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100">
                                {rowPartsBreakdown.parts.map((pt) => {
                                  const partTarget =
                                    pt.partTargetQty ||
                                    plannedProducts * (pt.piecesPerProduct || 1);
                                  const maxDelivered = Math.max(
                                    pt.cortePcs,
                                    pt.coladeiraPcs,
                                    pt.furadeiraPcs,
                                    pt.pinturaPcs
                                  );
                                  const partPct =
                                    partTarget > 0
                                      ? Math.min(100, Math.round((maxDelivered / partTarget) * 100))
                                      : 0;
                                  const remaining = Math.max(0, partTarget - maxDelivered);
                                  const isDone = partTarget > 0 && maxDelivered >= partTarget;
                                  return (
                                    <tr key={pt.partCode} className="hover:bg-slate-50">
                                      <td className="py-1.5 pr-3 font-mono font-bold text-[#081530]">
                                        {pt.partCode}
                                      </td>
                                      <td className="py-1.5 px-3 font-semibold text-slate-900">
                                        {pt.partName}{' '}
                                        {pt.dimensions !== '-' && (
                                          <span className="text-[10px] font-mono text-slate-500">
                                            ({pt.dimensions})
                                          </span>
                                        )}
                                      </td>
                                      <td className="py-1.5 px-2 text-center font-mono font-bold text-amber-900">
                                        {pt.piecesPerProduct || 1}x
                                      </td>
                                      <td className="py-1.5 px-3 text-center font-mono font-bold text-slate-700">
                                        {partTarget} pçs
                                      </td>
                                      <td className="py-1.5 px-3 text-center font-mono">
                                        <span
                                          className={`px-2 py-0.5 rounded font-bold ${
                                            pt.cortePcs >= partTarget && partTarget > 0
                                              ? 'bg-emerald-100 text-emerald-800'
                                              : pt.cortePcs > 0
                                              ? 'bg-amber-100 text-amber-900'
                                              : 'bg-slate-100 text-slate-500'
                                          }`}
                                        >
                                          {pt.cortePcs} / {partTarget}
                                        </span>
                                      </td>
                                      <td className="py-1.5 px-3 text-center font-mono">
                                        <span
                                          className={`px-2 py-0.5 rounded font-bold ${
                                            pt.coladeiraPcs >= partTarget && partTarget > 0
                                              ? 'bg-emerald-100 text-emerald-800'
                                              : pt.coladeiraPcs > 0
                                              ? 'bg-amber-100 text-amber-900'
                                              : 'bg-slate-100 text-slate-500'
                                          }`}
                                        >
                                          {pt.coladeiraPcs} / {partTarget}
                                        </span>
                                      </td>
                                      <td className="py-1.5 px-3 text-center font-mono">
                                        <span
                                          className={`px-2 py-0.5 rounded font-bold ${
                                            pt.furadeiraPcs >= partTarget && partTarget > 0
                                              ? 'bg-emerald-100 text-emerald-800'
                                              : pt.furadeiraPcs > 0
                                              ? 'bg-amber-100 text-amber-900'
                                              : 'bg-slate-100 text-slate-500'
                                          }`}
                                        >
                                          {pt.furadeiraPcs} / {partTarget}
                                        </span>
                                      </td>
                                      <td className="py-1.5 px-3 text-center font-mono">
                                        <span
                                          className={`px-2 py-0.5 rounded font-bold ${
                                            pt.pinturaPcs >= partTarget && partTarget > 0
                                              ? 'bg-emerald-100 text-emerald-800'
                                              : pt.pinturaPcs > 0
                                              ? 'bg-amber-100 text-amber-900'
                                              : 'bg-slate-100 text-slate-500'
                                          }`}
                                        >
                                          {pt.pinturaPcs} / {partTarget}
                                        </span>
                                      </td>
                                      <td className="py-1.5 pl-3 text-right font-mono font-bold">
                                        {isDone ? (
                                          <span className="text-emerald-700">
                                            ✓ 100% ({partTarget}/{partTarget})
                                          </span>
                                        ) : (
                                          <span className="text-amber-700">
                                            {partPct}% (Faltam {remaining} pçs)
                                          </span>
                                        )}
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
        </div>
      </div>
    );
  };

  return (
    <div className="max-w-[1600px] mx-auto py-4 sm:py-6 px-3 sm:px-6 space-y-5 sm:space-y-6">
      {/* Top Header Banner */}
      <div className="bg-[#091428] text-white border border-slate-800 rounded-2xl p-4 sm:p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-4 shadow-xs">
        <div>
          <div className="flex items-center gap-2 text-xs font-black text-amber-400 uppercase tracking-wider">
            <Calendar className="w-4 h-4" />
            <span>Programação Industrial PCP · Multilinea</span>
          </div>
          <h1 className="text-lg sm:text-2xl font-black tracking-tight text-white mt-1">
            Plano Mestre de Produção (PMP) — Programação por Encomenda e Lote
          </h1>
          <p className="text-xs sm:text-sm text-slate-300/85 mt-0.5">
            Controle os lotes por Encomenda, volumes (V01, V02, V03) e datas de etapas (Corte, Coladeira, Furadeira e Pintura)
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 self-stretch sm:self-start lg:self-auto">
          <button
            type="button"
            onClick={() => {
              if (showAddForm && !editingOrderId) {
                setShowAddForm(false);
              } else {
                handleOpenNewOrderForm();
              }
            }}
            className="flex-1 sm:flex-initial px-3.5 sm:px-4 py-2 sm:py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-extrabold rounded-lg flex items-center justify-center gap-2 transition-colors cursor-pointer shadow-xs min-h-[40px]"
          >
            <Plus className="w-4 h-4 shrink-0" />
            <span>Novo Lote / Encomenda</span>
          </button>

          <button
            type="button"
            onClick={() => setShowExcelModal(!showExcelModal)}
            className="flex-1 sm:flex-initial px-3.5 sm:px-4 py-2 sm:py-2.5 bg-emerald-700 hover:bg-emerald-600 text-white text-xs font-bold rounded-lg flex items-center justify-center gap-2 transition-colors cursor-pointer min-h-[40px]"
          >
            <Upload className="w-4 h-4 shrink-0" />
            <span>Importar / Colar Excel</span>
          </button>

          <button
            type="button"
            onClick={handleExportPmpCSV}
            className="w-full sm:w-auto px-3.5 py-2 sm:py-2.5 bg-blue-900 hover:bg-blue-800 border border-blue-700 text-white text-xs font-bold rounded-lg flex items-center justify-center gap-1.5 transition-colors cursor-pointer min-h-[40px]"
          >
            <Download className="w-4 h-4 shrink-0" />
            <span>Exportar Planilha ({filteredOrders.length})</span>
          </button>

          {onRestoreDefaultOrders && (
            <button
              type="button"
              disabled={restoringOrders}
              onClick={async () => {
                setRestoringOrders(true);
                try {
                  const count = await onRestoreDefaultOrders();
                  setSelectedEncomenda('ALL');
                  setFeedbackMsg(
                    `${count} lotes oficiais do PMP (incluindo as encomendas M26051, M26052 e I26036 com lotes de sexta-feira 09/10/2026) foram restaurados com sucesso!`
                  );
                  setTimeout(() => setFeedbackMsg(null), 5000);
                } finally {
                  setRestoringOrders(false);
                }
              }}
              className="w-full sm:w-auto px-3.5 py-2 sm:py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-extrabold rounded-lg flex items-center justify-center gap-1.5 transition-colors cursor-pointer min-h-[40px] shadow-sm"
              title="Restaurar lotes oficiais da fábrica (Encomendas M26051, M26052 e I26036 de 09/10/2026)"
            >
              <RefreshCw className={`w-4 h-4 shrink-0 ${restoringOrders ? 'animate-spin' : ''}`} />
              <span>{restoringOrders ? 'Restaurando...' : 'Restaurar Lotes Oficiais'}</span>
            </button>
          )}

          {onClearAllOrders && orders.length > 0 && (
            <button
              type="button"
              onClick={() => setConfirmClearAll(true)}
              className="w-full sm:w-auto px-3.5 py-2 sm:py-2.5 bg-red-700 hover:bg-red-600 border border-red-500 text-white text-xs font-extrabold rounded-lg flex items-center justify-center gap-1.5 transition-colors cursor-pointer min-h-[40px]"
            >
              <Trash2 className="w-4 h-4 shrink-0" />
              <span>Apagar Todas ({orders.length})</span>
            </button>
          )}
        </div>
      </div>

      {confirmClearAll && onClearAllOrders && (
        <div className="p-4 bg-red-50 border-2 border-red-600 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 text-xs sm:text-sm font-bold text-red-950">
            <AlertCircle className="w-5 h-5 text-red-600 shrink-0" />
            <span>
              Tem certeza que deseja apagar TODAS as encomendas e lotes cadastrados ({orders.length} lotes)?
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setConfirmClearAll(false)}
              className="px-3.5 py-1.5 bg-white border border-slate-300 text-slate-700 text-xs font-bold rounded-lg cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={clearingAll}
              onClick={async () => {
                setClearingAll(true);
                try {
                  const deleted = await onClearAllOrders();
                  setSelectedEncomenda('ALL');
                  setConfirmClearAll(false);
                  setFeedbackMsg(
                    `Todas as encomendas (${deleted} lotes) foram apagadas com sucesso! O Plano Mestre está limpo.`
                  );
                  setTimeout(() => setFeedbackMsg(null), 5000);
                } finally {
                  setClearingAll(false);
                }
              }}
              className="px-4 py-1.5 bg-red-700 hover:bg-red-800 text-white text-xs font-extrabold rounded-lg cursor-pointer"
            >
              {clearingAll ? 'Apagando...' : 'Sim, Apagar Tudo Agora'}
            </button>
          </div>
        </div>
      )}

      {feedbackMsg && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-between gap-3 text-sm text-emerald-900">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            <span className="font-semibold">{feedbackMsg}</span>
          </div>
          <button
            type="button"
            onClick={() => setFeedbackMsg(null)}
            className="text-xs font-bold text-emerald-800 underline"
          >
            Fechar
          </button>
        </div>
      )}

      {/* MODAL / PANEL: EXTRAIR E IMPORTAR DIRETO DO ARQUIVO EXCEL (.XLSX / .XLS / .CSV) OU COPIAR E COLAR */}
      {showExcelModal && (
        <form
          onSubmit={handleImportFromExcelPaste}
          className="bg-white border-2 border-emerald-700 rounded-xl p-6 space-y-5 shadow-md"
        >
          <div className="flex items-center justify-between pb-3 border-b border-slate-200">
            <div className="flex items-center gap-2.5">
              <FileSpreadsheet className="w-6 h-6 text-emerald-700" />
              <div>
                <h2 className="text-base sm:text-lg font-extrabold text-slate-900">
                  Extrair Programação Direto do Excel (Arquivo .XLSX ou Copiar e Colar)
                </h2>
                <p className="text-xs text-slate-600">
                  Envie sua planilha Excel pronta ou cole as linhas. O sistema identifica automaticamente as colunas (Encomenda, Código, Lote, Linha, Descrição, Cor, V01/V02/V03 e Datas)
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setShowExcelModal(false)}
              className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {excelErrorMsg && (
            <div className="p-3.5 bg-red-50 border border-red-300 rounded-xl flex items-center gap-2.5 text-xs font-bold text-red-900">
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
              <span>{excelErrorMsg}</span>
            </div>
          )}

          {/* OPÇÃO 1: UPLOAD DIRETO DO ARQUIVO EXCEL (.XLSX, .XLS, .CSV) */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch">
            <div className="lg:col-span-7 bg-emerald-50/70 border-2 border-dashed border-emerald-600 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="space-y-1">
                <span className="inline-flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-wider text-emerald-800">
                  <FileUp className="w-4 h-4" />
                  Opção 1 — Carregar Planilha do Computador / Celular
                </span>
                <p className="text-xs font-bold text-slate-900">
                  Selecione o seu arquivo Excel (<code className="font-mono">.xlsx</code>,{' '}
                  <code className="font-mono">.xls</code> ou <code className="font-mono">.csv</code>)
                </p>
                <p className="text-[11px] text-slate-600">
                  Extrai todos os lotes (ex: <strong className="font-mono">I2603612</strong>) e agrupa automaticamente na Encomenda correta (ex: <strong className="font-mono">I26036</strong>).
                </p>
                {excelFileName && (
                  <p className="text-xs font-mono font-extrabold text-emerald-900 pt-1">
                    Arquivo lido: {excelFileName} ({previewExcelItems.length} lotes extraídos)
                  </p>
                )}
              </div>

              <div className="shrink-0">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  onChange={handleExcelFileUpload}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="px-4 py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-extrabold rounded-lg flex items-center gap-2 cursor-pointer shadow-xs"
                >
                  <Upload className="w-4 h-4" />
                  <span>Escolher Arquivo Excel (.xlsx)</span>
                </button>
              </div>
            </div>

            <div className="lg:col-span-5 bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Forçar Código da Encomenda (Opcional — deixe vazio p/ extrair automático do Lote ex: I2603612 → I26036)
                </label>
                <input
                  type="text"
                  value={defaultImportEncomenda}
                  onChange={(e) => {
                    const val = e.target.value.toUpperCase();
                    setDefaultImportEncomenda(val);
                    if (pastedText.trim()) {
                      handlePasteChange(pastedText, val);
                    } else if (workbookRef && selectedSheetName) {
                      const ws = workbookRef.Sheets[selectedSheetName];
                      if (ws) {
                        const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, {
                          header: 1,
                          defval: '',
                          raw: false,
                        });
                        setPreviewExcelItems(extractOrdersFromRows(rows, val));
                      }
                    }
                  }}
                  placeholder="Automático pelo Lote (ex: I26036, M26051...)"
                  className="w-full h-9 px-3 bg-white border border-slate-300 rounded-lg font-mono text-xs font-bold text-slate-900"
                />
              </div>

              {excelSheetNames.length > 1 && (
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Aba da Planilha Excel ({excelSheetNames.length} abas encontradas)
                  </label>
                  <select
                    value={selectedSheetName}
                    onChange={(e) => handleSelectExcelSheet(e.target.value)}
                    className="w-full h-9 px-3 bg-white border border-slate-300 rounded-lg text-xs font-bold text-[#081530]"
                  >
                    {excelSheetNames.map((s) => (
                      <option key={s} value={s}>
                        Aba: {s}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          </div>

          {/* OPÇÃO 2: COPIAR E COLAR LINHAS DO EXCEL */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Opção 2 — Ou copie uma ou mais linhas no Excel (Ctrl+C) e cole (Ctrl+V) abaixo (com ou sem coluna Encomenda):
            </label>
            <textarea
              rows={4}
              value={pastedText}
              onChange={(e) => handlePasteChange(e.target.value, defaultImportEncomenda)}
              placeholder={`Cole direto do Excel! Aceita linha única (ex: lote I2603612) ou a planilha inteira:\n500738\tI2603612\tKIT REALEZA\tVERDE\tKIT REALEZA 6PT 2GV\tCARVALHO-VERDE\t200\t\t\t01/10/2026\t02/10/2026\t05/10/2026\t06/10/2026`}
              className="w-full p-3 bg-slate-50 border border-slate-300 rounded-lg font-mono text-xs text-slate-900 focus:bg-white focus:border-emerald-600 focus:outline-none"
            />
          </div>

          {/* PRÉ-VISUALIZAÇÃO DOS LOTES EXTRAÍDOS DO EXCEL ANTES DE SALVAR */}
          {previewExcelItems.length > 0 && (
            <div className="border-2 border-emerald-600 rounded-xl overflow-hidden bg-emerald-50/30">
              <div className="bg-emerald-800 text-white px-4 py-2 flex flex-wrap items-center justify-between gap-2 text-xs">
                <span className="font-extrabold">
                  ✓ {previewExcelItems.length}{' '}
                  {previewExcelItems.length === 1
                    ? 'Lote extraído do Excel pronto para salvar'
                    : 'Lotes extraídos do Excel prontos para salvar'}
                </span>
                <span className="font-mono">
                  Encomendas identificadas:{' '}
                  {Array.from(new Set(previewExcelItems.map((i) => i.orderCode))).join(', ')}
                </span>
              </div>
              <div className="max-h-60 overflow-y-auto">
                <table className="w-full text-left border-collapse text-[11px]">
                  <thead>
                    <tr className="bg-slate-100 border-b border-slate-300 font-extrabold uppercase text-slate-700">
                      <th className="py-1.5 px-2.5">Encomenda</th>
                      <th className="py-1.5 px-2.5">Código</th>
                      <th className="py-1.5 px-2.5">Lote</th>
                      <th className="py-1.5 px-2.5">Linha</th>
                      <th className="py-1.5 px-2.5">Descrição</th>
                      <th className="py-1.5 px-2.5">Cor</th>
                      <th className="py-1.5 px-2 text-center">V01</th>
                      <th className="py-1.5 px-2 text-center">V02</th>
                      <th className="py-1.5 px-2 text-center">V03</th>
                      <th className="py-1.5 px-2 text-center">Corte</th>
                      <th className="py-1.5 px-2 text-center">Pintura</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 bg-white">
                    {previewExcelItems.slice(0, 30).map((it, idx) => (
                      <tr key={`${it.batchNumber}_${idx}`} className="hover:bg-emerald-50/50">
                        <td className="py-1 px-2.5 font-mono font-extrabold text-[#081530]">
                          {it.orderCode}
                        </td>
                        <td className="py-1 px-2.5 font-mono font-semibold">{it.productCode}</td>
                        <td className="py-1 px-2.5 font-mono font-extrabold text-red-700">
                          {it.batchNumber}
                        </td>
                        <td className="py-1 px-2.5">{it.productLine}</td>
                        <td className="py-1 px-2.5 font-semibold truncate max-w-[220px]">
                          {it.productDescription}
                        </td>
                        <td className="py-1 px-2.5">{it.finishColor}</td>
                        <td className="py-1 px-2 text-center font-mono font-bold">
                          {it.qtyV01 || '-'}
                        </td>
                        <td className="py-1 px-2 text-center font-mono font-bold">
                          {it.qtyV02 || '-'}
                        </td>
                        <td className="py-1 px-2 text-center font-mono font-bold">
                          {it.qtyV03 || '-'}
                        </td>
                        <td className="py-1 px-2 text-center font-mono">{it.dateCorte}</td>
                        <td className="py-1 px-2 text-center font-mono">{it.datePintura}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setShowExcelModal(false);
                setExcelErrorMsg(null);
              }}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-lg cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={importing}
              className="px-5 py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-extrabold rounded-lg cursor-pointer shadow-xs"
            >
              {importing
                ? 'Salvando Lotes no Banco...'
                : `Confirmar e Salvar ${
                    previewExcelItems.length > 0 ? `(${previewExcelItems.length} Lotes)` : ''
                  } na Programação`}
            </button>
          </div>
        </form>
      )}

      {/* MODAL / PANEL: ADICIONAR OU EDITAR LOTE DA ENCOMENDA */}
      {showAddForm && (
        <form
          id="pmp-order-form"
          onSubmit={handleSaveOrder}
          className="bg-white border-2 border-[#081530] rounded-xl p-6 space-y-4 shadow-md"
        >
          <div className="flex items-center justify-between pb-3 border-b border-slate-200">
            <div>
              <h2 className="text-base font-bold text-[#081530]">
                {editingOrderId
                  ? 'Editar Lote do Plano Mestre'
                  : 'Cadastrar Novo Lote / Encomenda no Plano Mestre'}
              </h2>
              <p className="text-xs text-slate-500">
                Preencha os dados abaixo ou cole direto a linha do seu Excel para preencher tudo automaticamente
              </p>
            </div>
            <button
              type="button"
              onClick={handleResetForm}
              className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* BARRA RÁPIDA: COLAR LINHA DO EXCEL PARA PREENCHER OS CAMPOS AUTOMATICAMENTE */}
          <div className="bg-emerald-50/80 border border-emerald-300 rounded-xl p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-xs font-bold text-emerald-950">
              <FileSpreadsheet className="w-4 h-4 text-emerald-700 shrink-0" />
              <span>
                Preenchimento Rápido do Excel: copie a linha da planilha (ex: lote{' '}
                <strong className="font-mono">I2603612</strong>) e cole no campo ao lado →
              </span>
            </div>
            <input
              type="text"
              placeholder="Cole (Ctrl+V) a linha do Excel aqui para preencher tudo..."
              onChange={(e) => {
                const raw = e.target.value;
                if (!raw.trim()) return;
                const cols = raw.includes('\t')
                  ? raw.split('\t')
                  : raw.includes(';')
                  ? raw.split(';')
                  : raw.split(/\s{2,}/);
                const parsed = extractOrdersFromRows([cols], '');
                if (parsed.length > 0) {
                  const item = parsed[0];
                  setOrderCode(item.orderCode);
                  setProductCode(item.productCode);
                  setBatchNumber(item.batchNumber);
                  setProductLine(item.productLine);
                  setScheduleColor(item.scheduleColor);
                  setProductDescription(item.productDescription);
                  setFinishColor(item.finishColor);
                  setQtyV01(item.qtyV01);
                  setQtyV02(item.qtyV02);
                  setQtyV03(item.qtyV03);
                  setDateCorte(item.dateCorte);
                  setDateColadeira(item.dateColadeira);
                  setDateFuradeira(item.dateFuradeira);
                  setDatePintura(item.datePintura);
                  setIsEncab(Boolean(item.isEncab));
                  e.target.value = '';
                }
              }}
              className="w-full sm:w-96 h-9 px-3 bg-white border border-emerald-500 rounded-lg font-mono text-xs text-slate-900 focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Encomenda *
              </label>
              <input
                type="text"
                required
                value={orderCode}
                onChange={(e) => {
                  const val = e.target.value.toUpperCase();
                  const clean = val.trim().replace(/[\s\-_/]+/g, '');
                  const lotMatch = clean.match(/^([A-Z]\d{5})(\d{2,4})$/);
                  if (lotMatch) {
                    setOrderCode(lotMatch[1]);
                    if (!batchNumber.trim() || batchNumber === `${clean}01` || batchNumber.startsWith(lotMatch[1])) {
                      setBatchNumber(clean);
                    }
                  } else {
                    setOrderCode(val);
                    if (!batchNumber.trim() && val.trim()) {
                      setBatchNumber(`${val.trim()}01`);
                    }
                  }
                }}
                placeholder="Ex: M26051 ou I26038"
                className="w-full h-10 px-3 bg-slate-50 border border-slate-300 rounded-lg font-mono text-xs font-bold text-[#081530]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Código Produto (PA) *
              </label>
              <input
                type="text"
                required
                list="pmp-known-pa-codes"
                value={productCode}
                onChange={(e) => {
                  const val = e.target.value.toUpperCase();
                  setProductCode(val);
                  const found = knownProductsByPa.find((k) => k.paCode === val.trim());
                  if (found) {
                    if (found.description && !productDescription.trim()) {
                      setProductDescription(found.description);
                    }
                    if (found.line && !productLine.trim()) {
                      setProductLine(found.line);
                    }
                  }
                }}
                placeholder="Ex: 500686 ou 501208"
                className="w-full h-10 px-3 bg-slate-50 border border-slate-300 rounded-lg font-mono text-xs font-bold text-slate-900 focus:bg-white focus:border-amber-600 focus:outline-none"
              />
              <datalist id="pmp-known-pa-codes">
                {knownProductsByPa.map((kp) => (
                  <option key={kp.paCode} value={kp.paCode}>
                    {kp.description}
                  </option>
                ))}
              </datalist>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Lote *
              </label>
              <input
                type="text"
                required
                value={batchNumber}
                onChange={(e) => {
                  const val = e.target.value.toUpperCase();
                  setBatchNumber(val);
                  if (!orderCode.trim() && val.length >= 6) {
                    setOrderCode(deriveOrderCodeFromBatch(val));
                  }
                }}
                placeholder="Ex: M2605101"
                className="w-full h-10 px-3 bg-slate-50 border border-slate-300 rounded-lg font-mono text-xs font-bold text-red-800"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Linha *
              </label>
              <input
                type="text"
                required
                value={productLine}
                onChange={(e) => setProductLine(e.target.value.toUpperCase())}
                placeholder="Ex: RAINHA, KIT REALEZA"
                className="w-full h-10 px-3 bg-slate-50 border border-slate-300 rounded-lg text-xs font-bold text-slate-900"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Cor Programação *
              </label>
              <select
                value={scheduleColor}
                onChange={(e) => setScheduleColor(e.target.value as ScheduleColor)}
                className="w-full h-10 px-3 bg-slate-50 border border-slate-300 rounded-lg text-xs font-bold text-slate-900"
              >
                {SCHEDULE_COLORS.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Cor do Produto *
              </label>
              <input
                type="text"
                required
                value={finishColor}
                onChange={(e) => setFinishColor(e.target.value.toUpperCase())}
                placeholder="Ex: NATURE, CARVALHO"
                className="w-full h-10 px-3 bg-slate-50 border border-slate-300 rounded-lg text-xs font-bold text-slate-900"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
            <div className="sm:col-span-6">
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Descrição do Produto *
              </label>
              <input
                type="text"
                required
                value={productDescription}
                onChange={(e) => setProductDescription(e.target.value.toUpperCase())}
                placeholder="Ex: ARM. AEREO 2PT NESHER RAINHA 120CM NT"
                className="w-full h-10 px-3 bg-slate-50 border border-slate-300 rounded-lg text-xs font-bold text-slate-900"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Volume V01
              </label>
              <input
                type="number"
                min={0}
                value={qtyV01}
                onChange={(e) => setQtyV01(Number(e.target.value))}
                className="w-full h-10 px-3 bg-slate-50 border border-slate-300 rounded-lg font-mono text-xs font-bold text-slate-900"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Volume V02
              </label>
              <input
                type="number"
                min={0}
                value={qtyV02}
                onChange={(e) => setQtyV02(Number(e.target.value))}
                className="w-full h-10 px-3 bg-slate-50 border border-slate-300 rounded-lg font-mono text-xs font-bold text-slate-900"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Volume V03 (Caixa 3)
              </label>
              <input
                type="number"
                min={0}
                value={qtyV03}
                onChange={(e) => setQtyV03(Number(e.target.value))}
                className="w-full h-10 px-3 bg-slate-50 border border-slate-300 rounded-lg font-mono text-xs font-bold text-slate-900"
              />
            </div>

            {(() => {
              const formProdQty = Math.max(qtyV01 || 0, qtyV02 || 0, qtyV03 || 0);
              const formTotalVols = (qtyV01 || 0) + (qtyV02 || 0) + (qtyV03 || 0);
              const formVolCount =
                (qtyV01 > 0 ? 1 : 0) + (qtyV02 > 0 ? 1 : 0) + (qtyV03 > 0 ? 1 : 0);
              if (formProdQty <= 0) return null;
              return (
                <div className="sm:col-span-12 px-3.5 py-2 bg-amber-50 border border-amber-300 rounded-lg flex flex-wrap items-center justify-between gap-2 text-xs font-mono">
                  <div>
                    <span className="font-sans font-bold text-slate-700">
                      Cálculo do Lote:{' '}
                    </span>
                    <strong className="text-[#081530] font-extrabold">
                      {formProdQty} PRODUTOS a produzir
                    </strong>
                    {formVolCount > 1 && (
                      <span className="text-amber-900 font-bold ml-2">
                        · {formTotalVols} VOLUMES no total (
                        {[
                          qtyV01 > 0 ? `${qtyV01} volumes 1/${formVolCount}` : null,
                          qtyV02 > 0 ? `${qtyV02} volumes 2/${formVolCount}` : null,
                          qtyV03 > 0 ? `${qtyV03} volumes 3/${formVolCount}` : null,
                        ]
                          .filter(Boolean)
                          .join(' e ')}
                        )
                      </span>
                    )}
                  </div>
                </div>
              );
            })()}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 pt-1">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Data Etapa 1: CORTE *
              </label>
              <input
                type="text"
                required
                value={dateCorte}
                onChange={(e) => setDateCorte(e.target.value)}
                placeholder="Ex: 01/10/2026"
                className="w-full h-10 px-3 bg-slate-50 border border-slate-300 rounded-lg font-mono text-xs text-slate-900"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Data Etapa 2: COLADEIRA *
              </label>
              <input
                type="text"
                required
                value={dateColadeira}
                onChange={(e) => setDateColadeira(e.target.value)}
                placeholder="Ex: 02/10/2026"
                className="w-full h-10 px-3 bg-slate-50 border border-slate-300 rounded-lg font-mono text-xs text-slate-900"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Data Etapa 3: FURADEIRA *
              </label>
              <input
                type="text"
                required
                value={dateFuradeira}
                onChange={(e) => setDateFuradeira(e.target.value)}
                placeholder="Ex: 05/10/2026"
                className="w-full h-10 px-3 bg-slate-50 border border-slate-300 rounded-lg font-mono text-xs text-slate-900"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Data Etapa 4: PINTURA *
              </label>
              <input
                type="text"
                required
                value={datePintura}
                onChange={(e) => setDatePintura(e.target.value)}
                placeholder="Ex: 06/10/2026"
                className="w-full h-10 px-3 bg-slate-50 border border-slate-300 rounded-lg font-mono text-xs text-slate-900"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-4 pt-2 border-t border-slate-100">
            <div className="flex items-center gap-5 text-xs font-bold text-slate-800">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isEncab}
                  onChange={(e) => setIsEncab(e.target.checked)}
                  className="accent-red-600"
                />
                <span>Item • ENCAB (Ponto vermelho e lote destacado)</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isHighlighted}
                  onChange={(e) => setIsHighlighted(e.target.checked)}
                  className="accent-amber-500"
                />
                <span>Destacar linha inteira em Amarelo</span>
              </label>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {editingOrderId && (
                <button
                  type="button"
                  onClick={async () => {
                    await onDeleteOrder(editingOrderId);
                    setFeedbackMsg(`Lote [${batchNumber}] excluído com sucesso.`);
                    handleResetForm();
                    setTimeout(() => setFeedbackMsg(null), 4000);
                  }}
                  className="px-4 py-2 bg-red-50 hover:bg-red-100 border border-red-300 text-red-700 text-xs font-bold rounded-lg flex items-center gap-1.5 cursor-pointer transition-colors"
                  title="Excluir este lote do Plano Mestre"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Excluir Este Lote</span>
                </button>
              )}
              <button
                type="button"
                onClick={handleResetForm}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-lg cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="px-5 py-2 bg-[#081530] hover:bg-blue-950 text-amber-400 text-xs font-extrabold rounded-lg cursor-pointer"
              >
                {editingOrderId ? 'Salvar Alterações do Lote' : 'Adicionar Lote ao Plano Mestre'}
              </button>
            </div>
          </div>
        </form>
      )}

      {/* PAINEL DE CONSULTA DIRETA: QUAI PEÇAS JÁ FORAM ENTREGUES DE UM LOTE X CÓDIGO DE PRODUTO */}
      <div className="bg-white border-2 border-[#081530] rounded-2xl p-5 space-y-4 shadow-xs">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-3 border-b border-slate-200">
          <div>
            <div className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-wider text-amber-600">
              <PackageCheck className="w-4 h-4" />
              <span>Rastreabilidade de Entregas por Peça (Iniciando em M26051)</span>
            </div>
            <h2 className="text-base sm:text-lg font-extrabold text-[#081530] mt-0.5">
              Consultar Quais Peças Já Foram Entregues (Lote × Código de Produto)
            </h2>
            <p className="text-xs text-slate-500">
              Informe ou selecione o Lote (ex: M2605101) e o Código do Produto (ex: 500686) para ver todas as peças entregues e o saldo pendente em cada setor
            </p>
          </div>

          <div className="flex flex-wrap items-end gap-2.5">
            <div>
              <label className="block text-[11px] font-bold text-slate-700 mb-1">
                Selecionar Lote × Produto Rápido
              </label>
              <select
                value={`${lookupBatch}|${lookupProductCode}`}
                onChange={(e) => {
                  const [b, p] = e.target.value.split('|');
                  if (b) setLookupBatch(b);
                  if (p !== undefined) setLookupProductCode(p);
                }}
                className="h-10 px-3 bg-slate-50 border border-slate-300 rounded-lg font-mono text-xs font-bold text-[#081530]"
              >
                {orders.map((o) => (
                  <option key={o.id} value={`${o.batchNumber}|${o.productCode}`}>
                    Enc. {o.orderCode} · Lote {o.batchNumber} × Cód. {o.productCode} ({o.productDescription.slice(0, 26)})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-700 mb-1">
                Digite o Lote
              </label>
              <input
                type="text"
                value={lookupBatch}
                onChange={(e) => {
                  const val = e.target.value.toUpperCase();
                  setLookupBatch(val);
                  const clean = val.trim();
                  if (clean) {
                    const found = orders.find((o) => o.batchNumber.toUpperCase() === clean);
                    if (found) {
                      setLookupProductCode(found.productCode);
                    }
                  }
                }}
                placeholder="Ex: M2605101"
                className="h-10 w-36 px-3 bg-slate-50 border border-slate-300 rounded-lg font-mono text-xs font-extrabold text-red-800"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-700 mb-1">
                Código do Produto
              </label>
              <input
                type="text"
                value={lookupProductCode}
                onChange={(e) => setLookupProductCode(e.target.value.toUpperCase())}
                placeholder="Ex: 500686"
                className="h-10 w-32 px-3 bg-slate-50 border border-slate-300 rounded-lg font-mono text-xs font-extrabold text-[#081530]"
              />
            </div>
          </div>
        </div>

        {/* ALERTA CLARO QUANDO O LOTE DIGITADO NÃO EXISTE EM NENHUMA ENCOMENDA DO PMP */}
        {!activeLookupOrder && lookupBatch.trim() && (
          <div className="p-4 bg-amber-50 border-2 border-amber-400 rounded-2xl space-y-3 text-xs text-amber-950 shadow-sm">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-6 h-6 text-amber-600 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <div className="font-black text-sm text-amber-900">
                  Lote &ldquo;{lookupBatch.trim()}&rdquo; não está cadastrado em nenhuma Encomenda do PMP
                </div>
                <p className="text-slate-700 leading-relaxed text-xs">
                  Este lote não foi localizado na lista de Ordens de Produção do Plano Mestre. É exatamente por este motivo que, ao procurar na tabela da encomenda, o produto não aparece lá.
                </p>
                {similarBatchSuggestion && (
                  <div className="mt-2.5 p-3 bg-blue-50 border-2 border-blue-200 rounded-xl space-y-1.5">
                    <div className="font-bold text-blue-900 text-xs">
                      💡 Você quis consultar o lote{' '}
                      <strong className="font-mono text-blue-950 text-sm font-black">
                        {similarBatchSuggestion.batchNumber}
                      </strong>
                      ?
                    </div>
                    <div className="text-[11px] text-blue-800">
                      Encomenda: <strong className="font-mono">{getCanonicalEncomendaCode(similarBatchSuggestion)}</strong> · Código:{' '}
                      <strong className="font-mono">{similarBatchSuggestion.productCode}</strong> ({similarBatchSuggestion.productDescription})
                    </div>
                    <div className="pt-1">
                      <button
                        type="button"
                        onClick={() => {
                          setLookupBatch(similarBatchSuggestion.batchNumber);
                          setLookupProductCode(similarBatchSuggestion.productCode);
                        }}
                        className="px-3 py-1.5 bg-blue-900 hover:bg-blue-800 text-white font-extrabold rounded-lg cursor-pointer text-xs shadow-xs"
                      >
                        Carregar Lote {similarBatchSuggestion.batchNumber} da Encomenda {getCanonicalEncomendaCode(similarBatchSuggestion)}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="pt-2 border-t border-amber-200 flex flex-wrap items-center justify-between gap-2">
              <span className="text-[11px] text-slate-600">
                Se você precisa produzir este lote, você pode cadastrá-lo agora no PMP:
              </span>
              <button
                type="button"
                onClick={() => {
                  const derived = deriveOrderCodeFromBatch(lookupBatch.trim());
                  setOrderCode(derived);
                  setBatchNumber(lookupBatch.trim());
                  setShowAddForm(true);
                }}
                className="px-3.5 py-1.5 bg-[#081530] hover:bg-blue-950 text-amber-400 font-black rounded-lg cursor-pointer flex items-center gap-1.5 shadow-xs"
              >
                <Plus className="w-4 h-4" />
                <span>+ Cadastrar Lote {lookupBatch.trim()} no PMP (Encomenda {deriveOrderCodeFromBatch(lookupBatch.trim())})</span>
              </button>
            </div>
          </div>
        )}

        {/* Resultado da Consulta Lote X Código de Produto */}
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 bg-[#081530] text-white rounded-xl px-4 py-3">
            <div className="flex flex-wrap items-center gap-2.5">
              {activeLookupOrder ? (
                <span className="font-mono text-xs font-black px-2.5 py-1 rounded bg-amber-400 text-slate-950">
                  ENCOMENDA: {getCanonicalEncomendaCode(activeLookupOrder)}
                </span>
              ) : (
                <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-slate-800 text-slate-400">
                  SEM ENCOMENDA
                </span>
              )}
              <span className="font-mono text-xs font-extrabold px-2.5 py-1 rounded bg-amber-500 text-slate-950">
                LOTE: {lookupBatch || '---'}
              </span>
              <span className="font-mono text-xs font-extrabold px-2.5 py-1 rounded bg-blue-900 border border-blue-700 text-white">
                CÓDIGO: {activeLookupOrder?.productCode || lookupProductCode || '---'}
              </span>
              {activeLookupOrder && (
                <span className="text-xs font-bold text-blue-100">
                  {activeLookupOrder.productLine} — {activeLookupOrder.productDescription} ({activeLookupOrder.finishColor})
                </span>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2 font-mono text-xs font-bold">
              {activeLookupOrder && (() => {
                const lookupProdQty = getOrderProductQty(activeLookupOrder);
                const lookupTotalVol = getOrderTotalVolumes(activeLookupOrder);
                const lookupVolsPerProd = getOrderVolumesPerProduct(activeLookupOrder);
                return (
                  <>
                    <span className="px-2.5 py-0.5 rounded bg-emerald-600 text-white font-extrabold">
                      Lote: {lookupProdQty} produtos
                    </span>
                    {activeLookupOrder.qtyV01 > 0 && (
                      <span className="px-2 py-0.5 rounded bg-blue-950 border border-blue-800 text-amber-300">
                        V01 {lookupVolsPerProd > 1 ? `(1/${lookupVolsPerProd})` : ''}: {activeLookupOrder.qtyV01}
                      </span>
                    )}
                    {activeLookupOrder.qtyV02 > 0 && (
                      <span className="px-2 py-0.5 rounded bg-blue-950 border border-blue-800 text-amber-300">
                        V02 {lookupVolsPerProd > 1 ? `(2/${lookupVolsPerProd})` : ''}: {activeLookupOrder.qtyV02}
                      </span>
                    )}
                    {activeLookupOrder.qtyV03 > 0 && (
                      <span className="px-2 py-0.5 rounded bg-blue-950 border border-blue-800 text-amber-300">
                        V03 {lookupVolsPerProd > 1 ? `(3/${lookupVolsPerProd})` : ''}: {activeLookupOrder.qtyV03}
                      </span>
                    )}
                    {lookupVolsPerProd > 1 && (
                      <span className="px-2.5 py-0.5 rounded bg-blue-950 border border-amber-400 text-amber-300 font-extrabold">
                        Total Volumes: {lookupTotalVol} vol.
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        const enc = getCanonicalEncomendaCode(activeLookupOrder);
                        setSelectedEncomenda('ALL');
                        if (collapsedEncomendas[enc]) {
                          setCollapsedEncomendas((prev) => ({ ...prev, [enc]: false }));
                        }
                        setTimeout(() => {
                          const el = document.getElementById(`order_row_${activeLookupOrder.id}`);
                          if (el) {
                            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                            el.classList.add('ring-4', 'ring-amber-400');
                            setTimeout(() => el.classList.remove('ring-4', 'ring-amber-400'), 3500);
                          }
                        }, 120);
                      }}
                      className="px-3 py-1 rounded bg-blue-700 hover:bg-blue-600 text-white font-sans font-bold text-xs flex items-center gap-1.5 cursor-pointer shadow-xs whitespace-nowrap"
                      title="Rolar a tela até esta encomenda na tabela abaixo"
                    >
                      <span>Ver na Encomenda {getCanonicalEncomendaCode(activeLookupOrder)} ↓</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setTicketModalOrder(activeLookupOrder)}
                      className="px-3 py-1 rounded bg-amber-500 hover:bg-amber-400 text-slate-950 font-sans font-extrabold text-xs flex items-center gap-1.5 cursor-pointer shadow-xs whitespace-nowrap"
                    >
                      <QrCode className="w-3.5 h-3.5" />
                      <span>Gerar Fichas c/ QR-CODE</span>
                    </button>
                  </>
                );
              })()}
            </div>
          </div>

          {/* 4-SECTOR PROGRAMADO X REALIZADO PROGRESS BAR FOR SELECTED LOTE (PORCENTAGEM POR TIPOS DE PEÇAS DO PRODUTO) */}
          {activeLookupOrder && (() => {
            const totalTypes = activeLookupBreakdown.totalPartTypes;
            const stages = [
              {
                label: '1. CORTE',
                date: activeLookupOrder.dateCorte,
                pct: activeLookupBreakdown.cortePct,
                doneTypes: activeLookupBreakdown.corteCompletedTypes,
                donePcs: activeLookupBreakdown.totalCortePcs,
              },
              {
                label: '2. COLADEIRA',
                date: activeLookupOrder.dateColadeira,
                pct: activeLookupBreakdown.coladeiraPct,
                doneTypes: activeLookupBreakdown.coladeiraCompletedTypes,
                donePcs: activeLookupBreakdown.totalColadeiraPcs,
              },
              {
                label: '3. FURADEIRA',
                date: activeLookupOrder.dateFuradeira,
                pct: activeLookupBreakdown.furadeiraPct,
                doneTypes: activeLookupBreakdown.furadeiraCompletedTypes,
                donePcs: activeLookupBreakdown.totalFuradeiraPcs,
              },
              {
                label: '4. PINTURA UV',
                date: activeLookupOrder.datePintura,
                pct: activeLookupBreakdown.pinturaPct,
                doneTypes: activeLookupBreakdown.pinturaCompletedTypes,
                donePcs: activeLookupBreakdown.totalPinturaPcs,
              },
            ];
            return (
              <div className="space-y-2.5">
                {/* Banner Geral de Porcentagem do Produto */}
                <div className="p-3 bg-slate-100 border border-slate-300 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="text-xs font-bold text-slate-800">
                    Status Geral do Produto no PMP:{' '}
                    <strong className="text-[#081530] font-mono">
                      {activeLookupBreakdown.overallPct}% Realizado
                    </strong>{' '}
                    ({activeLookupBreakdown.completedPartTypesCount} de {totalTypes} tipos de peças entregues)
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-40 h-2.5 bg-slate-300 rounded-full overflow-hidden">
                      <div
                        className={`h-full transition-all ${
                          activeLookupBreakdown.overallPct >= 100
                            ? 'bg-emerald-600'
                            : 'bg-amber-500'
                        }`}
                        style={{ width: `${activeLookupBreakdown.overallPct}%` }}
                      />
                    </div>
                    <span className="font-mono text-xs font-extrabold text-[#081530]">
                      {activeLookupBreakdown.overallPct}%
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
                  {stages.map((st) => {
                    return (
                      <div
                        key={st.label}
                        className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1.5"
                      >
                        <div className="flex items-center justify-between text-[11px] font-bold">
                          <span className="text-[#081530]">{st.label}</span>
                          <span className="font-mono text-slate-500">Data: {st.date}</span>
                        </div>
                        <div className="flex items-baseline justify-between font-mono">
                          <span className="text-base font-extrabold text-slate-900">
                            {st.pct}%
                          </span>
                          <span
                            className={`text-xs font-extrabold ${
                              st.pct >= 100
                                ? 'text-emerald-700'
                                : st.pct > 0 || st.donePcs > 0
                                ? 'text-amber-700'
                                : 'text-slate-500'
                            }`}
                          >
                            {totalTypes > 0
                              ? `${st.doneTypes}/${totalTypes} tipos de peças`
                              : `${st.donePcs} pçs`}
                          </span>
                        </div>
                        <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden">
                          <div
                            className={`h-full transition-all ${
                              st.pct >= 100 ? 'bg-emerald-600' : 'bg-amber-500'
                            }`}
                            style={{ width: `${st.pct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}

          {activeLookupBreakdown.parts.length === 0 ? (
            <div className="p-4 bg-amber-50/70 border border-amber-200 rounded-xl text-xs text-amber-950">
              Ainda não há peças cadastradas ou apontadas para o par{' '}
              <strong className="font-mono">
                Lote {lookupBatch} × Código {lookupProductCode}
              </strong>
              . Assim que você cadastrar as peças do código{' '}
              <strong className="font-mono">{lookupProductCode}</strong> na aba{' '}
              <strong>Cadastros</strong> ou o operador apontar na máquina, a lista de peças entregues aparecerá aqui.
            </div>
          ) : (
            <div className="overflow-x-auto border border-slate-200 rounded-xl">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-100 border-b border-slate-200 text-[11px] font-extrabold uppercase text-slate-700">
                    <th className="py-2 px-3">Código da Peça</th>
                    <th className="py-2 px-3">Nome da Peça</th>
                    <th className="py-2 px-3">Medidas</th>
                    <th className="py-2 px-2 text-center">Qtd / Prod.</th>
                    <th className="py-2 px-3 text-center">Meta Peça no Lote</th>
                    <th className="py-2 px-3 text-center">1. Corte</th>
                    <th className="py-2 px-3 text-center">2. Coladeira</th>
                    <th className="py-2 px-3 text-center">3. Furadeira</th>
                    <th className="py-2 px-3 text-center">4. Pintura UV</th>
                    <th className="py-2 px-3 text-right">Status / % da Peça</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {activeLookupBreakdown.parts.map((pt) => {
                    const baseProdQty = getOrderProductQty(activeLookupOrder);
                    const qtyPerProd = Math.max(1, Math.round(pt.piecesPerProduct || 1));
                    const target = pt.partTargetQty || baseProdQty * qtyPerProd;
                    const maxDelivered = Math.max(
                      pt.cortePcs,
                      pt.coladeiraPcs,
                      pt.furadeiraPcs,
                      pt.pinturaPcs
                    );
                    const partPct =
                      target > 0 ? Math.min(100, Math.round((maxDelivered / target) * 100)) : 0;
                    const remaining = Math.max(0, target - maxDelivered);
                    const isComplete = target > 0 && maxDelivered >= target;
                    const weightInProductPct =
                      activeLookupBreakdown.totalPartTypes > 0
                        ? Math.round(100 / activeLookupBreakdown.totalPartTypes)
                        : 100;

                    return (
                      <tr key={pt.partCode} className="hover:bg-slate-50">
                        <td className="py-2 px-3 font-mono font-extrabold text-[#081530]">
                          {pt.partCode}
                        </td>
                        <td className="py-2 px-3 font-bold text-slate-900">{pt.partName}</td>
                        <td className="py-2 px-3 font-mono text-slate-600">{pt.dimensions}</td>
                        <td className="py-2 px-2 text-center font-mono">
                          <span
                            className={`px-2 py-0.5 rounded font-extrabold ${
                              qtyPerProd > 1
                                ? 'bg-amber-100 text-amber-900 border border-amber-300'
                                : 'bg-slate-100 text-slate-700'
                            }`}
                          >
                            {qtyPerProd}x / prod.
                          </span>
                        </td>
                        <td className="py-2 px-3 text-center font-mono font-bold text-slate-900">
                          {target > 0 ? `${target} pçs` : '-'}
                        </td>
                        <td className="py-2 px-3 text-center font-mono">
                          <span
                            className={`px-2 py-0.5 rounded font-bold ${
                              target > 0 && pt.cortePcs >= target
                                ? 'bg-emerald-100 text-emerald-800'
                                : pt.cortePcs > 0
                                ? 'bg-amber-100 text-amber-900'
                                : 'bg-slate-100 text-slate-500'
                            }`}
                          >
                            {pt.cortePcs} / {target}
                          </span>
                        </td>
                        <td className="py-2 px-3 text-center font-mono">
                          <span
                            className={`px-2 py-0.5 rounded font-bold ${
                              target > 0 && pt.coladeiraPcs >= target
                                ? 'bg-emerald-100 text-emerald-800'
                                : pt.coladeiraPcs > 0
                                ? 'bg-amber-100 text-amber-900'
                                : 'bg-slate-100 text-slate-500'
                            }`}
                          >
                            {pt.coladeiraPcs} / {target}
                          </span>
                        </td>
                        <td className="py-2 px-3 text-center font-mono">
                          <span
                            className={`px-2 py-0.5 rounded font-bold ${
                              target > 0 && pt.furadeiraPcs >= target
                                ? 'bg-emerald-100 text-emerald-800'
                                : pt.furadeiraPcs > 0
                                ? 'bg-amber-100 text-amber-900'
                                : 'bg-slate-100 text-slate-500'
                            }`}
                          >
                            {pt.furadeiraPcs} / {target}
                          </span>
                        </td>
                        <td className="py-2 px-3 text-center font-mono">
                          <span
                            className={`px-2 py-0.5 rounded font-bold ${
                              target > 0 && pt.pinturaPcs >= target
                                ? 'bg-emerald-100 text-emerald-800'
                                : pt.pinturaPcs > 0
                                ? 'bg-amber-100 text-amber-900'
                                : 'bg-slate-100 text-slate-500'
                            }`}
                          >
                            {pt.pinturaPcs} / {target}
                          </span>
                        </td>
                        <td className="py-2 px-3 text-right font-mono font-bold">
                          {isComplete ? (
                            <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800">
                              ✓ 100% da peça (+{weightInProductPct}% no produto)
                            </span>
                          ) : maxDelivered > 0 ? (
                            <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-900">
                              {partPct}% da peça ({maxDelivered}/{target} · Faltam {remaining})
                            </span>
                          ) : (
                            <span className="text-slate-400">0% (Pendente)</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* ENCOMENDAS SELECTOR CARDS (SEPARAÇÃO POR ENCOMENDA) */}
      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <h2 className="text-sm font-extrabold text-[#081530] uppercase tracking-wider flex items-center gap-2">
            <Layers className="w-4 h-4 text-amber-600" />
            Programação Separada por Encomenda ({encomendasSummary.length} Encomendas Ativas)
          </h2>

          {/* View Mode Toggle: Separado por Encomenda vs Tabela Unificada */}
          <div className="flex items-center gap-1 bg-white border border-slate-300 p-1 rounded-xl">
            <button
              type="button"
              onClick={() => setViewLayout('BY_ENCOMENDA')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                viewLayout === 'BY_ENCOMENDA'
                  ? 'bg-[#081530] text-white'
                  : 'text-slate-700 hover:bg-slate-100'
              }`}
            >
              Quadros Separados por Encomenda
            </button>
            <button
              type="button"
              onClick={() => setViewLayout('UNIFIED_EXCEL')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                viewLayout === 'UNIFIED_EXCEL'
                  ? 'bg-[#081530] text-white'
                  : 'text-slate-700 hover:bg-slate-100'
              }`}
            >
              Planilha Contínua (Idêntica ao Excel)
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <button
            type="button"
            onClick={() => setSelectedEncomenda('ALL')}
            className={`p-4 rounded-xl border text-left transition-all cursor-pointer ${
              selectedEncomenda === 'ALL'
                ? 'bg-[#081530] text-white border-blue-900 ring-2 ring-amber-400 shadow-sm'
                : 'bg-white text-slate-900 border-slate-300 hover:border-slate-400'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-extrabold uppercase tracking-wider text-amber-500">
                Visão Geral PMP
              </span>
              <span className="font-mono text-xs font-bold">
                {orders.length} lotes
              </span>
            </div>
            <p className="text-lg font-extrabold mt-1">Todas as Encomendas</p>
            <p
              className={`text-xs font-mono mt-1 ${
                selectedEncomenda === 'ALL' ? 'text-blue-200' : 'text-slate-500'
              }`}
            >
              {orders
                .reduce((acc, o) => acc + getOrderProductQty(o), 0)
                .toLocaleString('pt-BR')}{' '}
              produtos ·{' '}
              {orders
                .reduce((acc, o) => acc + getOrderTotalVolumes(o), 0)
                .toLocaleString('pt-BR')}{' '}
              volumes
            </p>
          </button>

          {encomendasSummary.map((enc) => {
            const isSelected = selectedEncomenda === enc.orderCode;
            return (
              <button
                key={enc.orderCode}
                type="button"
                onClick={() => setSelectedEncomenda(enc.orderCode)}
                className={`p-4 rounded-xl border text-left transition-all cursor-pointer ${
                  isSelected
                    ? 'bg-[#081530] text-white border-blue-900 ring-2 ring-amber-400 shadow-sm'
                    : 'bg-white text-slate-900 border-slate-300 hover:border-slate-400'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <span
                      className={`font-mono text-xs font-extrabold px-2 py-0.5 rounded ${
                        isSelected
                          ? 'bg-amber-500 text-slate-950'
                          : 'bg-[#081530] text-amber-400'
                      }`}
                    >
                      ENCOMENDA {enc.orderCode}
                    </span>
                    {encomendaCompletionStats.get(enc.orderCode)?.isFullyCompleted && (
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-extrabold bg-emerald-100 text-emerald-800 border border-emerald-300">
                        ✓ 100%
                      </span>
                    )}
                  </div>
                  <span className="font-mono text-xs font-bold">
                    {enc.lotesCount} {enc.lotesCount === 1 ? 'lote' : 'lotes'}
                  </span>
                </div>
                <p className="text-lg font-extrabold font-mono mt-1.5 tabular-nums">
                  {enc.totalProducts.toLocaleString('pt-BR')} produtos
                </p>
                <p
                  className={`text-xs font-mono font-bold mt-0.5 tabular-nums ${
                    isSelected ? 'text-amber-300' : 'text-slate-600'
                  }`}
                >
                  {enc.totalVolumes.toLocaleString('pt-BR')} volumes (V01: {enc.totalV01}
                  {enc.totalV02 > 0 ? ` · V02: ${enc.totalV02}` : ''}
                  {enc.totalV03 > 0 ? ` · V03: ${enc.totalV03}` : ''})
                </p>
                <p
                  className={`text-[11px] truncate mt-0.5 ${
                    isSelected ? 'text-blue-200' : 'text-slate-500'
                  }`}
                >
                  Linhas: {Array.from(enc.lines).join(', ')}
                </p>
              </button>
            );
          })}

          {/* Botão Direto: + Incluir Nova Encomenda */}
          <button
            type="button"
            onClick={() => {
              handleOpenNewOrderForm();
            }}
            className="p-4 rounded-xl border-2 border-dashed border-amber-500 bg-amber-50/60 hover:bg-amber-100/70 text-left transition-all cursor-pointer flex flex-col justify-between"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-extrabold uppercase tracking-wider text-amber-800">
                Criar Nova Encomenda
              </span>
              <Plus className="w-4 h-4 text-amber-700" />
            </div>
            <p className="text-base font-extrabold text-[#081530] mt-1">
              + Incluir Nova Encomenda
            </p>
            <p className="text-[11px] text-slate-600 mt-0.5">
              Clique para cadastrar uma nova encomenda (ex: M26053) e seus lotes
            </p>
          </button>
        </div>
      </div>

      {/* SEARCH & STAGE DATE FILTERS */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar código (500686), lote (M2605101), linha, produto..."
              className="h-9 pl-9 pr-3 bg-slate-50 border border-slate-300 rounded-lg text-xs text-slate-900 focus:bg-white focus:border-amber-600 focus:outline-none w-full sm:w-80"
            />
          </div>

          <select
            value={stageDateFilter}
            onChange={(e) => setStageDateFilter(e.target.value)}
            className="h-9 px-3 bg-slate-50 border border-slate-300 rounded-lg text-xs font-semibold text-slate-800"
          >
            <option value="ALL">Todas as Datas de Corte</option>
            {distinctCorteDates.map((dt) => (
              <option key={dt} value={dt}>
                Corte: {dt}
              </option>
            ))}
          </select>

          <select
            value={colorFilter}
            onChange={(e) => setColorFilter(e.target.value as ScheduleColor | 'ALL')}
            className="h-9 px-3 bg-slate-50 border border-slate-300 rounded-lg text-xs font-semibold text-slate-800"
          >
            <option value="ALL">Todas as Cores de Programação</option>
            {SCHEDULE_COLORS.map((c) => (
              <option key={c} value={c}>
                Cor Programação: {c}
              </option>
            ))}
          </select>
        </div>

        <div className="text-xs font-mono font-bold text-slate-700">
          Exibindo {filteredOrders.length} lotes ·{' '}
          {filteredOrders
            .reduce((acc, o) => acc + getOrderProductQty(o), 0)
            .toLocaleString('pt-BR')}{' '}
          produtos ({' '}
          {filteredOrders
            .reduce((acc, o) => acc + getOrderTotalVolumes(o), 0)
            .toLocaleString('pt-BR')}{' '}
          volumes )
        </div>
      </div>

      {/* TOOLBAR DE CONTROLE DE RECOLHIMENTO DA PROGRAMAÇÃO */}
      <div className="bg-slate-50 border border-slate-300 rounded-xl p-3 sm:p-3.5 flex flex-col md:flex-row md:items-center justify-between gap-3 shadow-xs">
        <div className="flex flex-wrap items-center gap-2.5">
          <span className="text-xs font-extrabold text-[#081530] flex items-center gap-1.5 uppercase tracking-wide">
            <Minimize2 className="w-4 h-4 text-amber-600" />
            Otimização de Espaço:
          </span>

          <label className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-bold text-slate-800 cursor-pointer select-none hover:bg-slate-50 shadow-xs transition-colors">
            <input
              type="checkbox"
              checked={autoCollapseCompleted}
              onChange={(e) => handleToggleAutoCollapse(e.target.checked)}
              className="w-4 h-4 text-amber-600 rounded border-slate-300 focus:ring-amber-500 cursor-pointer"
            />
            <span>Recolher Concluídas Automaticamente</span>
          </label>

          {/* Status Filter Buttons */}
          <div className="flex items-center gap-1 bg-white border border-slate-300 p-0.5 rounded-lg shadow-xs">
            <button
              type="button"
              onClick={() => setCompletionFilter('ALL')}
              className={`px-2.5 py-1 rounded text-xs font-bold cursor-pointer transition-colors ${
                completionFilter === 'ALL'
                  ? 'bg-[#081530] text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Todas ({ordersGroupedByEncomenda.length})
            </button>
            <button
              type="button"
              onClick={() => setCompletionFilter('PENDING_ONLY')}
              className={`px-2.5 py-1 rounded text-xs font-bold cursor-pointer transition-colors ${
                completionFilter === 'PENDING_ONLY'
                  ? 'bg-amber-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Apenas Em Andamento / Pendentes ({ordersGroupedByEncomenda.length - totalCompletedEncomendas})
            </button>
            <button
              type="button"
              onClick={() => setCompletionFilter('COMPLETED_ONLY')}
              className={`px-2.5 py-1 rounded text-xs font-bold cursor-pointer transition-colors ${
                completionFilter === 'COMPLETED_ONLY'
                  ? 'bg-emerald-700 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              ✓ Concluídas ({totalCompletedEncomendas})
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={collapseAllCompleted}
            className="px-2.5 py-1.5 rounded-lg bg-white hover:bg-emerald-50 border border-slate-300 hover:border-emerald-300 text-xs font-bold text-slate-800 hover:text-emerald-900 flex items-center gap-1.5 cursor-pointer shadow-xs transition-colors"
            title="Recolhe todas as programações 100% finalizadas"
          >
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
            <span>Recolher Concluídas</span>
          </button>
          <button
            type="button"
            onClick={collapseAllEncomendas}
            className="px-2.5 py-1.5 rounded-lg bg-white hover:bg-slate-50 border border-slate-300 text-xs font-bold text-slate-800 flex items-center gap-1.5 cursor-pointer shadow-xs transition-colors"
            title="Recolhe todas as programações para um resumo compacto"
          >
            <Minimize2 className="w-3.5 h-3.5 text-slate-600" />
            <span>Recolher Todas</span>
          </button>
          <button
            type="button"
            onClick={expandAllEncomendas}
            className="px-2.5 py-1.5 rounded-lg bg-white hover:bg-slate-50 border border-slate-300 text-xs font-bold text-slate-800 flex items-center gap-1.5 cursor-pointer shadow-xs transition-colors"
            title="Expande todas as programações na tela"
          >
            <Maximize2 className="w-3.5 h-3.5 text-slate-600" />
            <span>Expandir Todas</span>
          </button>
        </div>
      </div>

      {/* MAIN SCHEDULE DISPLAY: SEPARATED BY ENCOMENDA OR UNIFIED EXCEL TABLE */}
      {orders.length === 0 ? (
        <div className="bg-white border-2 border-dashed border-slate-300 rounded-2xl p-10 text-center space-y-4">
          <div className="w-12 h-12 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-700 flex items-center justify-center mx-auto">
            <FileSpreadsheet className="w-6 h-6" />
          </div>
          <div className="space-y-1 max-w-lg mx-auto">
            <h3 className="text-base sm:text-lg font-extrabold text-[#081530]">
              Nenhuma encomenda cadastrada — Plano Mestre limpo!
            </h3>
            <p className="text-xs sm:text-sm text-slate-600">
              Todas as encomendas anteriores foram apagadas. Clique abaixo para extrair sua programação direto da planilha Excel (<code className="font-mono">.xlsx</code>) ou cadastrar um novo lote manualmente.
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-3 pt-1">
            <button
              type="button"
              onClick={() => setShowExcelModal(true)}
              className="px-5 py-2.5 bg-emerald-700 hover:bg-emerald-600 text-white text-xs font-extrabold rounded-lg flex items-center gap-2 cursor-pointer shadow-xs"
            >
              <Upload className="w-4 h-4" />
              Extrair / Importar do Excel (.xlsx)
            </button>
            <button
              type="button"
              onClick={() => {
                handleOpenNewOrderForm();
              }}
              className="px-5 py-2.5 bg-[#081530] hover:bg-blue-950 text-amber-400 text-xs font-extrabold rounded-lg flex items-center gap-2 cursor-pointer shadow-xs"
            >
              <Plus className="w-4 h-4" />
              Cadastrar Nova Encomenda / Lote
            </button>
          </div>
        </div>
      ) : viewLayout === 'BY_ENCOMENDA' ? (
        <div className="space-y-6">
          {displayedOrdersGroupedByEncomenda.map(([encCode, groupOrders]) => {
            const sumProducts = groupOrders.reduce((a, b) => a + getOrderProductQty(b), 0);
            const sumV01 = groupOrders.reduce((a, b) => a + (b.qtyV01 || 0), 0);
            const sumV02 = groupOrders.reduce((a, b) => a + (b.qtyV02 || 0), 0);
            const sumV03 = groupOrders.reduce((a, b) => a + (b.qtyV03 || 0), 0);
            const sumTotal = groupOrders.reduce((a, b) => a + getOrderTotalVolumes(b), 0);
            const stats = encomendaCompletionStats.get(encCode);
            const isCollapsed = isEncomendaCollapsed(encCode);

            if (isCollapsed) {
              return (
                <div
                  key={encCode}
                  className={`border-2 rounded-2xl p-3.5 sm:p-4 transition-all duration-200 shadow-xs hover:shadow-md ${
                    stats?.isFullyCompleted
                      ? 'bg-gradient-to-r from-emerald-50/90 via-slate-50 to-white border-emerald-400 hover:border-emerald-500'
                      : 'bg-slate-50/90 border-slate-300 hover:border-slate-400'
                  }`}
                >
                  <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => toggleCollapseEncomenda(encCode)}
                        className={`w-9 h-9 rounded-xl flex items-center justify-center transition-colors cursor-pointer shrink-0 ${
                          stats?.isFullyCompleted
                            ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs'
                            : 'bg-[#081530] hover:bg-blue-950 text-amber-400 shadow-xs'
                        }`}
                        title="Expandir esta programação"
                      >
                        <ChevronRight className="w-5 h-5" />
                      </button>

                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={`font-mono text-xs sm:text-sm font-extrabold px-2.5 py-0.5 rounded-md ${
                              stats?.isFullyCompleted
                                ? 'bg-emerald-700 text-white'
                                : 'bg-[#081530] text-amber-400'
                            }`}
                          >
                            ENCOMENDA {encCode}
                          </span>

                          {stats?.isFullyCompleted ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-extrabold bg-emerald-100 text-emerald-800 border border-emerald-300">
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                              ✓ 100% CONCLUÍDA ({stats.completedLots}/{stats.totalLots} lotes finalizados)
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-extrabold bg-amber-100 text-amber-800 border border-amber-300">
                              Em Andamento ({stats?.completedLots || 0}/{stats?.totalLots || 0} lotes concluídos · {stats?.avgPct || 0}%)
                            </span>
                          )}

                          <span className="text-xs text-slate-500 font-mono">
                            Lotes: {groupOrders[0]?.batchNumber} até {groupOrders[groupOrders.length - 1]?.batchNumber}
                          </span>
                        </div>

                        <p className="text-xs text-slate-600 mt-1">
                          <strong className="text-slate-900 font-mono">{groupOrders.length} lotes</strong> ({sumProducts.toLocaleString('pt-BR')} produtos · {sumTotal.toLocaleString('pt-BR')} volumes) — Programação recolhida para otimizar espaço de tela.
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2.5 font-mono text-xs">
                      {/* Mini progress bar */}
                      <div className="hidden sm:flex flex-col items-end gap-1 mr-2 min-w-[130px]">
                        <span className={`text-[11px] font-bold ${stats?.isFullyCompleted ? 'text-emerald-700' : 'text-slate-700'}`}>
                          {stats?.avgPct || 0}% Realizado
                        </span>
                        <div className="w-32 h-2 bg-slate-200 rounded-full overflow-hidden">
                          <div
                            className={`h-full transition-all duration-300 ${
                              stats?.isFullyCompleted ? 'bg-emerald-600' : 'bg-amber-500'
                            }`}
                            style={{ width: `${stats?.avgPct || 0}%` }}
                          />
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => toggleCollapseEncomenda(encCode)}
                        className="px-3.5 py-1.5 rounded-lg bg-white border border-slate-300 hover:border-slate-400 hover:bg-slate-50 text-slate-800 font-sans font-bold text-xs flex items-center gap-1.5 cursor-pointer shadow-xs transition-colors"
                      >
                        <ChevronDown className="w-4 h-4 text-slate-600" />
                        <span>Expandir Programação</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          handleOpenNewOrderForm(encCode);
                        }}
                        className="px-3 py-1.5 rounded-lg bg-[#081530] hover:bg-blue-950 text-amber-400 font-sans font-bold text-xs flex items-center gap-1 cursor-pointer shadow-xs"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>+ Lote</span>
                      </button>
                    </div>
                  </div>
                </div>
              );
            }

            return (
              <section
                key={encCode}
                className="bg-white border-2 border-[#081530] rounded-2xl p-4 sm:p-5 space-y-3 shadow-xs"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-slate-200">
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => toggleCollapseEncomenda(encCode)}
                      className="w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 flex items-center justify-center transition-colors cursor-pointer shrink-0"
                      title="Recolher esta programação para liberar espaço na tela"
                    >
                      <ChevronUp className="w-4 h-4" />
                    </button>
                    <span className="font-mono text-sm sm:text-base font-extrabold px-3 py-1 rounded-lg bg-[#081530] text-amber-400">
                      ENCOMENDA {encCode}
                    </span>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm sm:text-base font-extrabold text-slate-900">
                          Programação da Encomenda {encCode} ({groupOrders.length}{' '}
                          {groupOrders.length === 1 ? 'Lote' : 'Lotes'})
                        </h3>
                        {stats?.isFullyCompleted && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-extrabold bg-emerald-100 text-emerald-800 border border-emerald-300">
                            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                            ✓ 100% Concluída
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-500">
                        Lotes: {groupOrders[0]?.batchNumber} até{' '}
                        {groupOrders[groupOrders.length - 1]?.batchNumber}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 font-mono text-xs">
                    <span className="px-3 py-1 rounded bg-[#081530] text-amber-400 font-extrabold">
                      Produtos: {sumProducts.toLocaleString('pt-BR')} un.
                    </span>
                    <span className="px-2.5 py-1 rounded bg-slate-100 text-slate-800 font-bold">
                      V01: {sumV01.toLocaleString('pt-BR')}
                    </span>
                    <span className="px-2.5 py-1 rounded bg-slate-100 text-slate-800 font-bold">
                      V02: {sumV02.toLocaleString('pt-BR')}
                    </span>
                    <span className="px-2.5 py-1 rounded bg-slate-100 text-slate-800 font-bold">
                      V03: {sumV03.toLocaleString('pt-BR')}
                    </span>
                    <span className="px-3 py-1 rounded bg-amber-500 text-slate-950 font-extrabold">
                      Total Volumes: {sumTotal.toLocaleString('pt-BR')} vol.
                    </span>

                    <button
                      type="button"
                      onClick={() => toggleCollapseEncomenda(encCode)}
                      className="px-3 py-1 rounded bg-slate-100 hover:bg-slate-200 border border-slate-300 text-slate-800 font-sans font-bold text-xs flex items-center gap-1 cursor-pointer transition-colors"
                      title="Recolher esta programação para liberar espaço na tela"
                    >
                      <ChevronUp className="w-3.5 h-3.5 text-slate-600" />
                      <span>Recolher Programação</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        handleOpenNewOrderForm(encCode);
                      }}
                      className="px-3 py-1 rounded bg-[#081530] hover:bg-blue-950 text-amber-400 font-sans font-bold text-xs flex items-center gap-1 cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Adicionar Lote em {encCode}</span>
                    </button>
                    {onDeleteEncomenda && (
                      <button
                        type="button"
                        onClick={async () => {
                          const removed = await onDeleteEncomenda(encCode);
                          setFeedbackMsg(
                            `Encomenda [${encCode}] (${removed} lotes) excluída com sucesso.`
                          );
                          setTimeout(() => setFeedbackMsg(null), 4500);
                        }}
                        className="px-2.5 py-1 rounded bg-red-50 hover:bg-red-100 border border-red-200 text-red-700 font-sans font-bold text-xs flex items-center gap-1 cursor-pointer"
                        title={`Apagar todos os lotes da Encomenda ${encCode}`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Apagar {encCode}</span>
                      </button>
                    )}
                  </div>
                </div>

                {renderExcelScheduleTable(groupOrders)}
              </section>
            );
          })}
        </div>
      ) : (
        renderExcelScheduleTable(displayedUnifiedOrders)
      )}

      {/* MODAL GERADOR DE FICHA DE IDENTIFICAÇÃO DE PEÇAS COM CÓDIGO DE BARRAS */}
      {ticketModalOrder && (
        <PartIdentificationTicketModal
          order={ticketModalOrder}
          catalogParts={catalogParts}
          logs={logs}
          onClose={() => setTicketModalOrder(null)}
          onQuickCreatePart={onQuickCreatePart}
        />
      )}
    </div>
  );
};
