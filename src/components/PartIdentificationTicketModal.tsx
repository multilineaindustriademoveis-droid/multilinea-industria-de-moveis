import React, { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
  ProductionOrder,
  CatalogPart,
  ProductionLog,
  getOrderProductQty,
  getOrderTotalVolumes,
  getOrderVolumesPerProduct,
  isFundoCatalogPart,
  isFundoPiece,
  extractThicknessMm,
} from '../types';
import { Printer, QrCode, X, Plus, Sparkles } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { MultilineaLogo } from './MultilineaLogo';

export { isFundoCatalogPart };

// Official Multilinea Ficha de Identificação de Peças sectors from the physical green form
export const OFFICIAL_TICKET_SECTORS: string[] = [
  '01 - SECCIONADORA',
  '02 - TECMATIC',
  '03 - COLADEIRA GIBEN',
  '04 - COLADEIRA BIESSE LADO',
  '05 - COLADEIRA BIESSE TOPO',
  '06 - COLADEIRA MAN.',
  '07 - FURADEIRA MAC.',
  '08 - FURD. MAN. LIDEAR',
  '09 - FURAD. INV. INF.',
  '10 - FURAD. INV. SUP.',
  '11 - FURAD. BIESSE',
  '12 - FURD. LIDEAR',
  '13 - FURAD. BANC. LIDEAR',
  '14 - SERRA CIRCULAR',
  '15 - TUPIA INVICTA',
  '16 - HILLER USINNER 250',
  '17 - TÚPIA COPIADORA',
  '56 - LINHA U.V.',
  '66 - REVISÃO',
  '67 - REVISÃO',
  '65 - EMBALAGEM',
];

export interface ParsedTicketBarcode {
  batchNumber: string;
  partCode: string;
  stackQty: number;
  stackIndex: number;
  totalStacks: number;
  ticketId: string; // ID único e exclusivo da Ficha, ex: "F-M2605206-403411-P01"
  isLegacyFormat: boolean;
  rawCode: string;
}

export const TicketQrCodeBox: React.FC<{
  value: string;
  uniqueCode?: string;
  size?: number;
}> = ({ value, uniqueCode, size = 86 }) => {
  return (
    <div className="inline-flex flex-col items-center bg-white p-2 print:p-1 rounded-md border-2 border-[#163a5f] shadow-2xs shrink-0">
      <QRCodeSVG
        value={value}
        size={size}
        level="M"
        bgColor="#ffffff"
        fgColor="#000000"
        className="print:w-[54px] print:h-[54px]"
      />
      <span className="font-mono text-[9px] print:text-[7.5px] font-black tracking-tight text-slate-950 mt-1 print:mt-0.5 leading-none text-center max-w-[130px] break-all">
        {uniqueCode || value}
      </span>
      <span className="text-[7.5px] print:text-[6.5px] font-bold text-emerald-800 uppercase tracking-tighter mt-0.5 leading-none">
        QR Único · 1 Bipagem
      </span>
    </div>
  );
};

/**
 * Generates an unmistakable unique identification code for every physical ticket.
 * Format: F-{batchNumber}-{partCode}-P{stackIndex}
 * Example: F-M2605206-403411-P01
 */
export function buildUniqueTicketCode(
  batchNumber: string,
  partCode: string,
  stackIndex: number = 1,
  totalStacks: number = 1
): string {
  const b = (batchNumber || 'LOTE').trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '');
  const p = (partCode || 'PECA').trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '');
  const sNum = String(Math.max(1, Math.round(stackIndex))).padStart(2, '0');
  return `F-${b}-${p}-P${sNum}`;
}

/**
 * Builds the canonical QR Code payload string for instant scanner reading:
 * Format: LOTE|COD_PECA|QTD_PILHA|P{stackIndex}-{totalStacks}|{uniqueTicketId}
 * Example: M2605206|403411|80|P1-3|F-M2605206-403411-P01
 * 
 * Supports backward compatibility when called with 3 arguments (legacy).
 */
export function buildTicketBarcode(
  batchNumber: string,
  partCode: string,
  stackQty: number,
  stackIndex: number = 1,
  totalStacks: number = 1,
  explicitTicketId?: string
): string {
  const b = (batchNumber || 'LOTE').trim().toUpperCase();
  const p = (partCode || 'PECA').trim().toUpperCase();
  const q = Math.max(1, Math.round(stackQty || 1));
  const sIdx = Math.max(1, Math.round(stackIndex || 1));
  const tStk = Math.max(sIdx, Math.round(totalStacks || 1));
  const uniqueId =
    (explicitTicketId && explicitTicketId.trim().toUpperCase()) ||
    buildUniqueTicketCode(b, p, sIdx, tStk);

  return `${b}|${p}|${q}|P${sIdx}-${tStk}|${uniqueId}`;
}

/**
 * Parses any scanned QR Code string (either modern unique format or legacy 3/2-part format).
 */
export function parseTicketBarcode(rawBarcode: string): ParsedTicketBarcode | null {
  const clean = (rawBarcode || '').trim().toUpperCase();
  if (!clean) return null;

  // Split primarily by pipe '|'
  const parts = clean.split('|').map((s) => s.trim()).filter(Boolean);

  // 1. Modern 4 or 5 part format: LOTE|COD_PECA|QTD_PILHA|P1-3|F-M2605206-403411-P01
  if (parts.length >= 4) {
    const batchNumber = parts[0];
    const partCode = parts[1];
    const stackQty = parseInt(parts[2].replace(/\D/g, ''), 10) || 0;

    let stackIndex = 1;
    let totalStacks = 1;
    const stackInfo = parts[3]; // e.g. "P1-3" or "P1/3" or "1"
    const matchStack = stackInfo.match(/P?(\d+)[-/](\d+)/i) || stackInfo.match(/(\d+)/);
    if (matchStack) {
      stackIndex = parseInt(matchStack[1], 10) || 1;
      if (matchStack[2]) {
        totalStacks = parseInt(matchStack[2], 10) || stackIndex;
      }
    }

    const ticketId =
      parts.length >= 5 && parts[4].length >= 3
        ? parts[4]
        : parts[3].startsWith('F-')
        ? parts[3]
        : buildUniqueTicketCode(batchNumber, partCode, stackIndex, totalStacks);

    if (batchNumber && partCode && stackQty > 0) {
      return {
        batchNumber,
        partCode,
        stackQty,
        stackIndex,
        totalStacks,
        ticketId,
        isLegacyFormat: false,
        rawCode: clean,
      };
    }
  }

  // 2. 3-part legacy format: LOTE|COD_PECA|QTD_PILHA
  if (parts.length === 3) {
    const batchNumber = parts[0];
    const partCode = parts[1];
    const stackQty = parseInt(parts[2].replace(/\D/g, ''), 10) || 0;
    if (batchNumber && partCode && stackQty > 0) {
      return {
        batchNumber,
        partCode,
        stackQty,
        stackIndex: 1,
        totalStacks: 1,
        ticketId: `F-${batchNumber}-${partCode}-Q${stackQty}`,
        isLegacyFormat: true,
        rawCode: clean,
      };
    }
  }

  // 3. 2-part legacy format: LOTE|COD_PECA
  if (parts.length === 2) {
    const batchNumber = parts[0];
    const partCode = parts[1];
    if (batchNumber && partCode) {
      return {
        batchNumber,
        partCode,
        stackQty: 0,
        stackIndex: 1,
        totalStacks: 1,
        ticketId: `F-${batchNumber}-${partCode}-P01`,
        isLegacyFormat: true,
        rawCode: clean,
      };
    }
  }

  // 4. Fallback for alternate delimiters like ';' or '/'
  const altParts = clean.split(/[;/]/).map((s) => s.trim()).filter(Boolean);
  if (altParts.length >= 3) {
    const batchNumber = altParts[0];
    const partCode = altParts[1];
    const stackQty = parseInt(altParts[2].replace(/\D/g, ''), 10) || 0;
    if (batchNumber && partCode && stackQty > 0) {
      return {
        batchNumber,
        partCode,
        stackQty,
        stackIndex: 1,
        totalStacks: 1,
        ticketId: `F-${batchNumber}-${partCode}-Q${stackQty}`,
        isLegacyFormat: true,
        rawCode: clean,
      };
    }
  }

  return null;
}

/**
 * Extracts the ticketId from a production log notes or dedicated field
 */
export function getLogTicketId(log: ProductionLog): string | null {
  if (log.ticketId) return log.ticketId.trim().toUpperCase();
  if (!log.notes) return null;
  const match = log.notes.match(/\[FICHA:([^\]]+)\]/i);
  if (match) return match[1].trim().toUpperCase();
  return null;
}

/**
 * Dedicated Full-Page A4 Card for "CONTROLE DE FUNDOS" (Folha Completa A4).
 * Replicates the factory document layout from the uploaded photo with 100% fidelity:
 * - MultiLinea Móveis centered header
 * - Bold uppercase "CONTROLE DE FUNDOS" title
 * - Ruled underline fields: PRODUTO, LOTE, MEDIDA, QTD PEÇAS, QTD PALETE, RESPONSÁVEL
 * - Digital MES QR Code box for 1-bip scanning at Seccionadora terminal
 */
export const ControleDeFundosA4Card: React.FC<{
  ticket: {
    ticketId: string;
    uniqueTicketCode: string;
    part: CatalogPart;
    piecesPerProduct: number;
    stackIndex: number;
    totalStacks: number;
    stackQty: number;
    isRemainderStack: boolean;
    cumulativeStart: number;
    cumulativeEnd: number;
    productLotQty: number;
    partLotQty: number;
    barcodeValue: string;
  };
  order: ProductionOrder;
  responsavel?: string;
  onResponsavelChange?: (val: string) => void;
}> = ({ ticket, order, responsavel, onResponsavelChange }) => {
  // Extract clean dimensions matching the factory document, e.g. "1195 X 170" or "770 X 680"
  const rawDims = (ticket.part.dimensions || '').replace(/mm/gi, '').trim();
  const dimNumbers = rawDims.match(/\d+/g);
  const cleanDims =
    dimNumbers && dimNumbers.length >= 2
      ? `${dimNumbers[0]} X ${dimNumbers[1]}${dimNumbers[2] ? ` X ${dimNumbers[2]}` : ''}`
      : rawDims || 'N/D';

  const palletAreaM2 = ((ticket.part.squareMeters || 0) * ticket.stackQty).toFixed(2);

  return (
    <div className="w-full max-w-4xl mx-auto bg-white text-slate-950 p-6 sm:p-10 flex flex-col justify-between min-h-[268mm] print:min-h-0 print:p-2 border border-slate-300 print:border-0 rounded-2xl print:rounded-none shadow-lg print:shadow-none box-sizing:border-box">
      {/* Top Header: MultiLinea Logo + CONTROLE DE FUNDOS */}
      <div>
        <div className="flex flex-col items-center justify-center pt-2">
          <MultilineaLogo size="lg" showMesBadge={false} />
          <h1 className="text-3xl sm:text-4xl print:text-3xl font-black text-slate-950 tracking-wider text-center mt-3 uppercase font-sans">
            CONTROLE DE FUNDOS
          </h1>
          <div className="text-[11px] print:text-[10px] font-mono font-bold text-slate-500 uppercase tracking-widest mt-0.5">
            Documento Oficial de Movimentação de Paletes de Fundos
          </div>
        </div>

        {/* Ruled Horizontal Fields with exact styling of the factory sheet in user photo */}
        <div className="mt-6 sm:mt-8 space-y-6 sm:space-y-7 print:space-y-5">
          {/* 1. PRODUTO */}
          <div className="space-y-2">
            <div className="border-b-[2.5px] border-slate-950 pb-1.5 flex items-baseline gap-3">
              <span className="text-xl sm:text-2xl print:text-xl font-black text-slate-950 uppercase shrink-0">
                PRODUTO:
              </span>
              <span className="text-xl sm:text-2xl print:text-xl font-extrabold text-[#081530] uppercase truncate">
                {order.productLine} {order.productDescription}
              </span>
            </div>
            {/* Second ruled line for product/part specifics */}
            <div className="border-b-[2.5px] border-slate-950 pb-1.5 flex items-baseline justify-between gap-2">
              <span className="text-base sm:text-lg print:text-base font-black text-[#163a5f] uppercase truncate">
                {ticket.part.partName} · CÓD. PRODUTO (PA): {order.productCode} · CÓD. PEÇA: {ticket.part.partCode}
              </span>
              <span className="text-xs sm:text-sm print:text-xs font-mono font-bold text-slate-600 shrink-0">
                ({ticket.piecesPerProduct} pç/produto)
              </span>
            </div>
          </div>

          {/* 2. LOTE */}
          <div className="border-b-[2.5px] border-slate-950 pb-1.5 flex items-baseline gap-3">
            <span className="text-xl sm:text-2xl print:text-xl font-black text-slate-950 uppercase shrink-0">
              LOTE:
            </span>
            <span className="text-3xl sm:text-4xl print:text-3xl font-mono font-black text-blue-950 tracking-wider">
              {order.batchNumber}
            </span>
            <span className="text-xs sm:text-sm print:text-xs font-mono font-bold text-slate-500 ml-auto">
              Encomenda: {order.orderCode} · Cor: {order.finishColor}
            </span>
          </div>

          {/* 3. MEDIDA */}
          <div className="border-b-[2.5px] border-slate-950 pb-1.5 flex items-baseline gap-3">
            <span className="text-xl sm:text-2xl print:text-xl font-black text-slate-950 uppercase shrink-0">
              MEDIDA:
            </span>
            <span className="text-3xl sm:text-4xl print:text-3xl font-mono font-black text-slate-950 tracking-wider">
              {cleanDims}
            </span>
            <span className="text-xs sm:text-sm print:text-xs font-mono font-bold text-slate-500 ml-auto">
              (Corte Unitário: {ticket.part.squareMeters || 0} m²)
            </span>
          </div>

          {/* 4. QTD PEÇAS */}
          <div className="border-b-[2.5px] border-slate-950 pb-1.5 flex items-baseline gap-3">
            <span className="text-xl sm:text-2xl print:text-xl font-black text-slate-950 uppercase shrink-0">
              QTD PEÇAS:
            </span>
            <span className="text-3xl sm:text-4xl print:text-3xl font-mono font-black text-slate-950">
              {ticket.partLotQty}
            </span>
            <span className="text-sm sm:text-base print:text-sm font-bold text-slate-700 ml-2">
              peças no lote total ({ticket.productLotQty} produtos programados)
            </span>
          </div>

          {/* 5. QTD PALETE */}
          <div className="border-b-[2.5px] border-slate-950 pb-1.5 flex items-baseline gap-3">
            <span className="text-xl sm:text-2xl print:text-xl font-black text-slate-950 uppercase shrink-0">
              QTD PALETE:
            </span>
            <span className="text-3xl sm:text-4xl print:text-3xl font-mono font-black text-emerald-900">
              {ticket.stackQty}
            </span>
            <span className="text-base sm:text-lg print:text-base font-bold text-slate-800 ml-2">
              {ticket.totalStacks > 1
                ? `(PALETE ${ticket.stackIndex} DE ${ticket.totalStacks}${ticket.isRemainderStack ? ' · RESTANTE' : ''})`
                : '(PALETE ÚNICO)'}
            </span>
            {ticket.totalStacks > 1 && (
              <span className="text-xs sm:text-sm print:text-xs font-mono font-bold text-slate-500 ml-auto">
                Peças {ticket.cumulativeStart} a {ticket.cumulativeEnd}
              </span>
            )}
          </div>

          {/* 6. RESPONSÁVEL */}
          <div className="border-b-[2.5px] border-slate-950 pb-1.5 flex items-baseline gap-3">
            <span className="text-xl sm:text-2xl print:text-xl font-black text-slate-950 uppercase shrink-0">
              RESPONSÁVEL:
            </span>
            <span className="text-2xl sm:text-3xl print:text-2xl font-mono font-black text-blue-950 tracking-wider uppercase">
              {responsavel || ''}
            </span>
            {!responsavel && (
              <span className="text-xs font-mono text-slate-400 print:hidden italic">
                (Digite o nome no cabeçalho ou assine na linha após imprimir)
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Digital MES Factory Tracking & QR-Code Block (Bottom of A4 page) */}
      <div className="mt-8 pt-4 border-t-2 border-slate-400">
        <div className="border-2 border-slate-900 rounded-xl p-4 bg-slate-50 print:bg-white flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="space-y-1.5 text-center sm:text-left flex-1">
            <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
              <span className="px-2.5 py-0.5 rounded bg-blue-950 text-amber-300 font-mono font-black text-xs uppercase tracking-wider">
                MES MULTILINEA
              </span>
              <span className="px-2.5 py-0.5 rounded bg-emerald-100 border border-emerald-400 text-emerald-950 font-black text-xs uppercase tracking-wider">
                PEÇA TIPO FUNDO · SOMENTE CORTE
              </span>
              <span className="px-2 py-0.5 rounded bg-slate-200 text-slate-800 font-mono font-bold text-[11px]">
                ID: {ticket.uniqueTicketCode}
              </span>
            </div>
            <div className="text-sm font-extrabold text-slate-900">
              Roteiro Produtivo:{' '}
              <span className="text-blue-900 underline font-black">
                01 - SECCIONADORA (CORTE)
              </span>{' '}
              ➔{' '}
              <span className="text-emerald-800 font-black">
                ESTOQUE DE FUNDOS / EMBALAGEM
              </span>
            </div>
            <p className="text-xs text-slate-600 font-mono">
              Peça dispensada de Coladeira de Borda, Furadeiras e Linha UV · m² Total no Palete:{' '}
              <strong className="text-slate-950 font-black">{palletAreaM2} m²</strong>
            </p>
            <p className="text-[10px] text-slate-500 font-mono">
              Código de leitura: {ticket.barcodeValue}
            </p>
          </div>

          {/* QR Code SVG for Pallet Scanner Reading */}
          <div className="shrink-0 flex flex-col items-center bg-white p-2.5 rounded-lg border-2 border-slate-900 shadow-xs">
            <QRCodeSVG
              value={ticket.barcodeValue}
              size={92}
              level="M"
              bgColor="#ffffff"
              fgColor="#000000"
              className="print:w-[72px] print:h-[72px]"
            />
            <span className="font-mono text-[9px] print:text-[8px] font-black text-slate-950 mt-1.5 leading-none text-center">
              {ticket.uniqueTicketCode}
            </span>
            <span className="text-[8px] print:text-[7px] font-bold text-emerald-800 uppercase tracking-tighter mt-0.5 leading-none">
              1 Bip Seccionadora
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

interface PartIdentificationTicketModalProps {
  order: ProductionOrder;
  catalogParts: CatalogPart[];
  logs: ProductionLog[];
  onClose: () => void;
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

export const PartIdentificationTicketModal: React.FC<
  PartIdentificationTicketModalProps
> = ({ order, catalogParts, logs, onClose, onQuickCreatePart }) => {
  // Product quantity (e.g., 200 products when V01=200 [1/2] and V02=200 [2/2], even though totalVolumes is 400 boxes)
  const initialLotQty = getOrderProductQty(order) || 200;
  const totalOrderVolumes = getOrderTotalVolumes(order);
  const volumesPerProduct = getOrderVolumesPerProduct(order);

  // Editable Lot Quantity & Per-Part Stack Height (Quant. Pilha por Código de Peça)
  const [customLotQty, setCustomLotQty] = useState<number>(initialLotQty);
  const [defaultStackQty, setDefaultStackQty] = useState<number>(75);
  const [splitIntoStacks, setSplitIntoStacks] = useState<boolean>(true);
  // Per-part stack height overrides: { [partCode]: stackQty }
  const [partStackOverrides, setPartStackOverrides] = useState<Record<string, number>>({});
  // Per-part print selection: { [partCode]: boolean } (default true for all)
  const [selectedPartCodes, setSelectedPartCodes] = useState<Record<string, boolean>>({});

  // View mode: 'STANDARD_TICKETS' (Fichas de Identificação de Peças · A4 Paisagem) | 'CONTROLE_FUNDOS' (Controle de Fundos · Folha Completa A4)
  const [activeTicketView, setActiveTicketView] = useState<'STANDARD_TICKETS' | 'CONTROLE_FUNDOS'>('STANDARD_TICKETS');

  // Option to print or not print A4 sheets for Fundos: true = Sim, Imprimir | false = Não Imprimir
  const [printFundosA4, setPrintFundosA4] = useState<boolean>(true);
  // Option to also include fundo pieces in standard A4 landscape tickets if desired
  const [includeFundosInStandard, setIncludeFundosInStandard] = useState<boolean>(false);

  // Operator name for Controle de Fundos (e.g. "NATANAEL" as shown in the user's photo)
  const [fundoOperatorName, setFundoOperatorName] = useState<string>('NATANAEL');

  // Dynamic print orientation: 'PORTRAIT' when viewing Fundos (Folha A4 Completa), 'LANDSCAPE' for Standard Identification Tickets
  const printPageOrientation = activeTicketView === 'CONTROLE_FUNDOS' ? 'PORTRAIT' : 'LANDSCAPE';

  // Print layout mode: 2 tickets side-by-side per A4 page by default, fitting strictly inside page margins
  const [ticketsPerPage, setTicketsPerPage] = useState<1 | 2>(2);
  // Print vertical position on A4 landscape sheet: 'BOTTOM' (blank space at top, tickets printed at bottom) or 'TOP'
  const [printVerticalPosition, setPrintVerticalPosition] = useState<'BOTTOM' | 'TOP'>('BOTTOM');
  // Top blank space in millimeters when printing at the bottom of the A4 landscape sheet (default 42mm pushes the ~148mm ticket to the bottom of the 198mm printable area)
  const [topBlankSpaceMm, setTopBlankSpaceMm] = useState<number>(42);

  React.useEffect(() => {
    const updatedLotQty = getOrderProductQty(order) || 200;
    setCustomLotQty(updatedLotQty);
  }, [order]);

  // Quick Add Part inside Ticket Modal if user hasn't registered all parts of this product yet
  const [showQuickAddPart, setShowQuickAddPart] = useState<boolean>(false);
  const [newPartCode, setNewPartCode] = useState<string>('403411');
  const [newPartName, setNewPartName] = useState<string>('TAMPO');
  const [newPiecesPerProduct, setNewPiecesPerProduct] = useState<number>(1);
  const [newLengthMm, setNewLengthMm] = useState<string>('1568');
  const [newWidthMm, setNewWidthMm] = useState<string>('297');
  const [newThicknessMm, setNewThicknessMm] = useState<string>('15');
  const [newHasCorte, setNewHasCorte] = useState<boolean>(true);
  const [newUvFaces, setNewUvFaces] = useState<number>(1);
  const [newEdgeConfig, setNewEdgeConfig] = useState<string>('1C + 2L');
  const [addingPart, setAddingPart] = useState<boolean>(false);
  const [inlineAutoFilledMsg, setInlineAutoFilledMsg] = useState<string | null>(null);

  // Distinct known parts across all catalog parts for fast auto-fill in modal
  const distinctKnownPartsForModal = useMemo(() => {
    const map = new Map<string, CatalogPart>();
    catalogParts.forEach((p) => {
      const code = (p.partCode || '').trim().toUpperCase();
      if (!code) return;
      if (!map.has(code)) {
        map.set(code, p);
      } else {
        const prev = map.get(code)!;
        if ((!prev.linearMeters && p.linearMeters) || (!prev.dimensions && p.dimensions)) {
          map.set(code, p);
        }
      }
    });
    return Array.from(map.values()).sort((a, b) =>
      a.partCode.localeCompare(b.partCode, undefined, { numeric: true })
    );
  }, [catalogParts]);

  const applyModalPartAutofill = (part: CatalogPart) => {
    if (!part) return;
    if (part.partName) setNewPartName(part.partName);
    if (part.dimensions) {
      const nums = part.dimensions.match(/\d+/g);
      if (nums && nums.length >= 2) {
        setNewLengthMm(nums[0]);
        setNewWidthMm(nums[1]);
        if (nums[2]) setNewThicknessMm(nums[2]);
      }
    }
    const hasCut = typeof part.squareMeters === 'number' ? part.squareMeters > 0 : true;
    setNewHasCorte(hasCut);
    const faces =
      typeof part.uvFaces === 'number' && (part.uvFaces === 0 || part.uvFaces === 1 || part.uvFaces === 2)
        ? part.uvFaces
        : 1;
    setNewUvFaces(faces);
    setNewEdgeConfig(part.edgeConfig || '1C + 2L');

    const origin = part.paCode ? `PA ${part.paCode}` : 'outro produto';
    const isFundo = isFundoCatalogPart(part);

    if (isFundo) {
      setInlineAutoFilledMsg(
        `✓ Peça Tipo FUNDO [${part.partCode}] reconhecida (${origin})! Somente Cortada (${part.dimensions || 'N/D'} · Corte: ${part.squareMeters} m² · Sem UV · Sem Borda) carregada automaticamente.`
      );
    } else {
      setInlineAutoFilledMsg(
        `✓ Peça [${part.partCode}] reconhecida (${origin})! Dimensões (${part.dimensions || 'N/D'}), corte (${hasCut ? 'Sim' : 'Sem corte'}), UV (${faces}L) e borda (${part.edgeConfig || '1C + 2L'}) carregados automaticamente.`
      );
    }
    setTimeout(() => setInlineAutoFilledMsg(null), 7000);
  };

  const applyModalFundoPreset = () => {
    setNewHasCorte(true);
    setNewUvFaces(0);
    setNewEdgeConfig('SEM_BORDA');
    if (!newThicknessMm || newThicknessMm === '15') {
      setNewThicknessMm('2.5');
    }
    if (!newPartName.trim() || !newPartName.toUpperCase().includes('FUNDO')) {
      setNewPartName('FUNDO TRASEIRO');
    }
    setInlineAutoFilledMsg('✓ Preset FUNDO ativado: Peça configurada como SOMENTE CORTADA (Passa no Corte: Sim · Sem UV · Sem Borda · Espessura 2,5mm).');
    setTimeout(() => setInlineAutoFilledMsg(null), 6000);
  };

  const handleModalPartNameChange = (val: string) => {
    setNewPartName(val);
    const upper = val.toUpperCase().trim();
    if (upper.includes('FUNDO') && newEdgeConfig !== 'SEM_BORDA' && newUvFaces !== 0) {
      setNewHasCorte(true);
      setNewUvFaces(0);
      setNewEdgeConfig('SEM_BORDA');
      if (!newThicknessMm || newThicknessMm === '15') {
        setNewThicknessMm('3');
      }
      setInlineAutoFilledMsg('✓ Peça identificada como FUNDO: Configurada automaticamente como SOMENTE CORTADA (Sem UV e Sem Borda).');
      setTimeout(() => setInlineAutoFilledMsg(null), 6000);
    }
  };

  const handleModalPartCodeChange = (rawVal: string) => {
    const upper = rawVal.toUpperCase();
    setNewPartCode(upper);
    const clean = upper.trim();
    if (!clean) return;
    const match = catalogParts.find((p) => p.partCode.trim().toUpperCase() === clean);
    if (match) {
      applyModalPartAutofill(match);
    }
  };

  // Parts belonging to this order's productCode (PA)
  const matchingParts = useMemo(() => {
    const cleanProd = (order.productCode || '').trim().toUpperCase();
    return catalogParts.filter(
      (c) => (c.paCode || '').trim().toUpperCase() === cleanProd
    );
  }, [catalogParts, order.productCode]);

  // If no catalog parts exist yet for this product, provide a preview ticket using the photo's example or order info
  const effectivePartsForTickets = useMemo(() => {
    if (matchingParts.length > 0) return matchingParts;
    return [
      {
        id: 'preview_part',
        productName: `${order.productLine} - ${order.productDescription}`,
        paCode: order.productCode,
        partName: 'TAMPO (EXEMPLO — CADASTRE AS PEÇAS DESTE PRODUTO ABAIXO)',
        partCode: '403411',
        dimensions: '1568 x 297 x 15 mm',
        squareMeters: 0.4657,
        uvFaces: 1,
        uvSquareMeters: 0.4657,
        linearMeters: 2.162,
        edgeConfig: '1C + 2L',
        ownerId: 'system',
      } as CatalogPart,
    ];
  }, [matchingParts, order]);

  // Exact breakdown summary of Full Stacks + Remainder Stack
  const stackCalculationSummary = useMemo(() => {
    const lotQty = Math.max(1, Math.round(customLotQty || initialLotQty));
    const maxStackHeight = Math.max(1, Math.round(defaultStackQty || lotQty));

    if (!splitIntoStacks || maxStackHeight >= lotQty) {
      return {
        lotQty,
        maxStackHeight,
        fullStacksCount: 1,
        remainderQty: 0,
        totalStacks: 1,
        stackSizes: [lotQty],
      };
    }

    const fullStacksCount = Math.floor(lotQty / maxStackHeight);
    const remainderQty = lotQty % maxStackHeight;
    const stackSizes: number[] = [];

    for (let i = 0; i < fullStacksCount; i++) {
      stackSizes.push(maxStackHeight);
    }
    if (remainderQty > 0) {
      stackSizes.push(remainderQty);
    }

    return {
      lotQty,
      maxStackHeight,
      fullStacksCount,
      remainderQty,
      totalStacks: stackSizes.length,
      stackSizes,
    };
  }, [customLotQty, initialLotQty, defaultStackQty, splitIntoStacks]);

  // Helper to get the configured stack height for a specific part code
  const getStackHeightForPart = (part: CatalogPart, baseProductLotQty: number) => {
    const codeKey = (part.partCode || '').trim().toUpperCase();
    const qtyPerProd = Math.max(1, Math.round(part.piecesPerProduct || 1));
    const partTotalLotQty = baseProductLotQty * qtyPerProd;
    const override = partStackOverrides[codeKey];
    if (override !== undefined && override > 0) {
      return Math.max(1, Math.round(override));
    }
    return Math.max(1, Math.round(defaultStackQty || partTotalLotQty));
  };

  const isPartSelectedForPrint = (partCode: string) => {
    const codeKey = (partCode || '').trim().toUpperCase();
    return selectedPartCodes[codeKey] !== false;
  };

  const allEffectivePartCodes = useMemo(
    () => effectivePartsForTickets.map((p) => (p.partCode || '').trim().toUpperCase()),
    [effectivePartsForTickets]
  );

  const selectedPartsCount = useMemo(
    () => allEffectivePartCodes.filter((code) => selectedPartCodes[code] !== false).length,
    [allEffectivePartCodes, selectedPartCodes]
  );

  const isAllPartsSelected = selectedPartsCount === allEffectivePartCodes.length && allEffectivePartCodes.length > 0;
  const isNoPartSelected = selectedPartsCount === 0;

  const handleSelectAllParts = () => {
    const next: Record<string, boolean> = {};
    allEffectivePartCodes.forEach((code) => {
      next[code] = true;
    });
    setSelectedPartCodes(next);
  };

  const handleDeselectAllParts = () => {
    const next: Record<string, boolean> = {};
    allEffectivePartCodes.forEach((code) => {
      next[code] = false;
    });
    setSelectedPartCodes(next);
  };

  // Generate list of tickets where each part code uses its own configured stack height (Quant. Pilha) + remainder
  const generatedTickets = useMemo(() => {
    const list: {
      ticketId: string;
      uniqueTicketCode: string;
      part: CatalogPart;
      piecesPerProduct: number;
      stackIndex: number;
      totalStacks: number;
      stackQty: number;
      isRemainderStack: boolean;
      cumulativeStart: number;
      cumulativeEnd: number;
      productLotQty: number;
      partLotQty: number;
      barcodeValue: string;
      isFundo: boolean;
    }[] = [];

    const baseProductLotQty = Math.max(1, Math.round(customLotQty || initialLotQty));

    effectivePartsForTickets.forEach((part) => {
      const codeKey = (part.partCode || '').trim().toUpperCase();
      if (selectedPartCodes[codeKey] === false) return;

      const qtyPerProd = Math.max(1, Math.round(part.piecesPerProduct || 1));
      const partTotalLotQty = baseProductLotQty * qtyPerProd;
      const overrideVal = partStackOverrides[codeKey];
      const partMaxStackHeight =
        overrideVal !== undefined && overrideVal > 0
          ? Math.max(1, Math.round(overrideVal))
          : Math.max(1, Math.round(defaultStackQty || partTotalLotQty));

      const partStackSizes: number[] = [];
      if (!splitIntoStacks || partMaxStackHeight >= partTotalLotQty) {
        partStackSizes.push(partTotalLotQty);
      } else {
        const fullCount = Math.floor(partTotalLotQty / partMaxStackHeight);
        const rem = partTotalLotQty % partMaxStackHeight;
        for (let i = 0; i < fullCount; i++) {
          partStackSizes.push(partMaxStackHeight);
        }
        if (rem > 0) {
          partStackSizes.push(rem);
        }
      }

      const partTotalStacks = partStackSizes.length;
      let cumulative = 0;
      partStackSizes.forEach((thisQty, idx) => {
        const stackIndex = idx + 1;
        const cumulativeStart = cumulative + 1;
        cumulative += thisQty;
        const cumulativeEnd = cumulative;
        const isRemainderStack =
          partTotalStacks > 1 &&
          stackIndex === partTotalStacks &&
          thisQty < partMaxStackHeight;

        const uniqueTicketCode = buildUniqueTicketCode(
          order.batchNumber,
          part.partCode,
          stackIndex,
          partTotalStacks
        );

        const barcodeValue = buildTicketBarcode(
          order.batchNumber,
          part.partCode,
          thisQty,
          stackIndex,
          partTotalStacks,
          uniqueTicketCode
        );

        const isFundo = isFundoCatalogPart(part);

        list.push({
          ticketId: uniqueTicketCode,
          uniqueTicketCode,
          part,
          piecesPerProduct: qtyPerProd,
          stackIndex,
          totalStacks: partTotalStacks,
          stackQty: thisQty,
          isRemainderStack,
          cumulativeStart,
          cumulativeEnd,
          productLotQty: baseProductLotQty,
          partLotQty: partTotalLotQty,
          barcodeValue,
          isFundo,
        });
      });
    });

    return list;
  }, [
    effectivePartsForTickets,
    order.batchNumber,
    customLotQty,
    initialLotQty,
    defaultStackQty,
    splitIntoStacks,
    partStackOverrides,
    selectedPartCodes,
  ]);

  const standardTickets = useMemo(() => {
    if (includeFundosInStandard) return generatedTickets;
    const nonFundos = generatedTickets.filter((t) => !t.isFundo);
    // Se o usuário selecionou apenas peças de fundo e está na aba de Fichas Padrão,
    // não deixa zerado (0 fichas) — permite que sejam geradas fichas normais
    if (nonFundos.length === 0 && generatedTickets.length > 0) {
      return generatedTickets;
    }
    return nonFundos;
  }, [generatedTickets, includeFundosInStandard]);
  const fundoTickets = useMemo(
    () => generatedTickets.filter((t) => t.isFundo),
    [generatedTickets]
  );

  const handleCreatePartInline = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!onQuickCreatePart || !newPartCode.trim() || !newPartName.trim()) return;
    setAddingPart(true);
    try {
      const l = Math.max(1, Number(newLengthMm) || 1000);
      const w = Math.max(1, Number(newWidthMm) || 500);
      const t = Math.max(1, Number(newThicknessMm) || 15);
      const safeQtyPerProd = Math.max(1, Math.min(1000, Math.round(Number(newPiecesPerProduct) || 1)));
      const unitGeomM2 = Number(((l / 1000) * (w / 1000)).toFixed(4));
      const cutM2 = newHasCorte ? unitGeomM2 : 0;
      const uvM2 = Number((unitGeomM2 * newUvFaces).toFixed(4));
      let unitLinM = 0;
      if (newEdgeConfig === 'SEM_BORDA') {
        unitLinM = 0;
      } else if (newEdgeConfig === '2L') {
        unitLinM = Number((2 * (w / 1000)).toFixed(3));
      } else if (newEdgeConfig === '1L') {
        unitLinM = Number((1 * (w / 1000)).toFixed(3));
      } else if (newEdgeConfig === '1C') {
        unitLinM = Number((1 * (l / 1000)).toFixed(3));
      } else if (newEdgeConfig === '2C') {
        unitLinM = Number((2 * (l / 1000)).toFixed(3));
      } else if (newEdgeConfig === '2C + 2L' || newEdgeConfig.includes('4 Lados')) {
        unitLinM = Number((2 * (l / 1000) + 2 * (w / 1000)).toFixed(3));
      } else {
        unitLinM = Number(((l / 1000) + 2 * (w / 1000)).toFixed(3));
      }
      const linM = unitLinM;

      await onQuickCreatePart({
        productName: `${order.productLine} - ${order.productDescription}`,
        paCode: order.productCode,
        partName: newPartName.trim().toUpperCase(),
        partCode: newPartCode.trim().toUpperCase(),
        piecesPerProduct: safeQtyPerProd,
        dimensions: `${l} x ${w} x ${t} mm`,
        squareMeters: cutM2,
        uvSquareMeters: uvM2,
        uvFaces: newUvFaces,
        linearMeters: linM,
        edgeConfig: newEdgeConfig,
      });
      setNewPartCode('');
      setNewPartName('');
      setNewPiecesPerProduct(1);
      setNewHasCorte(true);
      setShowQuickAddPart(false);
    } finally {
      setAddingPart(false);
    }
  };

  // Group standard tickets into pages of 1 or 2 tickets in A4 Landscape (Exact previous configuration)
  const paginatedStandardTicketGroups = useMemo(() => {
    const groups: (typeof standardTickets)[] = [];
    for (let i = 0; i < standardTickets.length; i += ticketsPerPage) {
      groups.push(standardTickets.slice(i, i + ticketsPerPage));
    }
    return groups;
  }, [standardTickets, ticketsPerPage]);

  // Group fundo tickets into 1 full A4 portrait page per pallet (when printFundosA4 is true)
  const paginatedFundoTicketGroups = useMemo(() => {
    if (!printFundosA4) return [];
    return fundoTickets.map((t) => [t]);
  }, [fundoTickets, printFundosA4]);

  const totalStandardCount = standardTickets.length;
  const totalFundosCount = fundoTickets.length;

  const handlePrintStandardOnly = () => {
    setActiveTicketView('STANDARD_TICKETS');
    setTimeout(() => {
      window.print();
    }, 120);
  };

  const handlePrintFundosOnly = () => {
    setActiveTicketView('CONTROLE_FUNDOS');
    setPrintFundosA4(true);
    setTimeout(() => {
      window.print();
    }, 120);
  };

  const modalContent = (
    <div
      id="ticket-print-root"
      className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-xs flex items-start justify-center overflow-y-auto p-2 sm:p-6 print:static print:bg-white print:p-0 print:overflow-visible"
    >
      <div className="bg-white border-2 border-[#081530] rounded-2xl max-w-6xl w-full overflow-hidden shadow-2xl my-auto print:border-0 print:rounded-none print:shadow-none print:max-w-none print:w-full print:my-0">
        {/* Dynamic @page orientation rule: Portrait for Fundos (Folha Completa A4), Landscape for Standard Tickets */}
        <style>{`
          @media print {
            @page {
              size: ${printPageOrientation === 'PORTRAIT' ? 'A4 portrait' : 'A4 landscape'};
              margin: ${printPageOrientation === 'PORTRAIT' ? '8mm' : '5mm'};
            }
          }
        `}</style>

        {/* Top Control Bar (Hidden when printing) */}
        <div className="print:hidden bg-[#081530] text-white p-3 sm:p-5 flex flex-col gap-3">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 sm:gap-4">
            <div>
              <div className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-wider text-amber-400">
                <QrCode className="w-4 h-4 shrink-0" />
                <span>Gerador de Fichas com QR-CODE</span>
              </div>
              <h2 className="text-base sm:text-xl font-extrabold mt-0.5">
                {activeTicketView === 'STANDARD_TICKETS'
                  ? `Ficha de Identificação — Lote ${order.batchNumber} (Cód. ${order.productCode})`
                  : `Controle de Fundos em Folha A4 — Lote ${order.batchNumber} (Cód. ${order.productCode})`}
              </h2>
              <p className="text-xs text-blue-200 mt-0.5">
                {activeTicketView === 'STANDARD_TICKETS'
                  ? 'Impressão das fichas em folha A4 Paisagem (2 fichas por página dentro das margens normais)'
                  : 'Documento oficial de paletes de fundos (somente corte) em Folha Completa A4 Retrato'}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2 self-stretch sm:self-auto">
              {/* Controls for Standard Landscape Tickets */}
              {activeTicketView === 'STANDARD_TICKETS' && (
                <>
                  {/* Vertical Position on Page Selector */}
                  <div className="flex items-center bg-blue-950 border border-blue-800 rounded-lg p-1 text-xs gap-1 overflow-x-auto">
                    <button
                      type="button"
                      onClick={() => setPrintVerticalPosition('BOTTOM')}
                      className={`px-2 py-1 rounded-md font-extrabold cursor-pointer transition-colors whitespace-nowrap ${
                        printVerticalPosition === 'BOTTOM'
                          ? 'bg-amber-500 text-slate-950'
                          : 'text-blue-200 hover:text-white'
                      }`}
                      title="Deixa a parte em branco em cima e imprime as fichas na parte de baixo da folha"
                    >
                      Embaixo
                    </button>
                    {printVerticalPosition === 'BOTTOM' && (
                      <div className="flex items-center gap-1 px-1 text-[11px] text-amber-300 font-mono shrink-0">
                        <span>Topo:</span>
                        <input
                          type="number"
                          min={5}
                          max={80}
                          value={topBlankSpaceMm}
                          onChange={(e) =>
                            setTopBlankSpaceMm(Math.max(0, Math.min(90, Number(e.target.value) || 0)))
                          }
                          className="w-10 h-6 px-1 rounded bg-slate-900 border border-amber-400 text-white text-center font-bold"
                          title="Altura em milímetros da parte em branco no topo da folha"
                        />
                        <span>mm</span>
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => setPrintVerticalPosition('TOP')}
                      className={`px-2 py-1 rounded-md font-extrabold cursor-pointer transition-colors whitespace-nowrap ${
                        printVerticalPosition === 'TOP'
                          ? 'bg-amber-500 text-slate-950'
                          : 'text-blue-200 hover:text-white'
                      }`}
                      title="Imprime as fichas no topo da folha"
                    >
                      Cima
                    </button>
                  </div>

                  {/* Print Page Centering Mode Selector */}
                  <div className="flex items-center bg-blue-950 border border-blue-800 rounded-lg p-1 text-xs shrink-0">
                    <button
                      type="button"
                      onClick={() => setTicketsPerPage(2)}
                      className={`px-2 py-1 rounded-md font-extrabold cursor-pointer transition-colors ${
                        ticketsPerPage === 2
                          ? 'bg-amber-500 text-slate-950'
                          : 'text-blue-200 hover:text-white'
                      }`}
                      title="Imprime 2 fichas lado a lado em folha Paisagem dentro das margens"
                    >
                      2 / Pág.
                    </button>
                    <button
                      type="button"
                      onClick={() => setTicketsPerPage(1)}
                      className={`px-2 py-1 rounded-md font-extrabold cursor-pointer transition-colors ${
                        ticketsPerPage === 1
                          ? 'bg-amber-500 text-slate-950'
                          : 'text-blue-200 hover:text-white'
                      }`}
                      title="Imprime 1 ficha centralizada por página"
                    >
                      1 / Pág.
                    </button>
                  </div>

                  {/* Option to include fundo parts in standard tickets if product has fundos */}
                  {totalFundosCount > 0 && (
                    <label
                      className="flex items-center gap-1.5 px-2.5 py-1 bg-blue-950 border border-blue-800 rounded-lg text-xs font-bold text-blue-200 cursor-pointer hover:text-white transition-colors select-none"
                      title="Marque para também gerar Fichas de Identificação normais (A4 Paisagem) para peças de fundo"
                    >
                      <input
                        type="checkbox"
                        checked={includeFundosInStandard}
                        onChange={(e) => setIncludeFundosInStandard(e.target.checked)}
                        className="accent-amber-500 w-3.5 h-3.5 cursor-pointer"
                      />
                      <span className="whitespace-nowrap">Incluir Fundos nas Fichas Padrão</span>
                    </label>
                  )}
                </>
              )}

              {/* Fundos quick toggle when in CONTROLE_FUNDOS view */}
              {activeTicketView === 'CONTROLE_FUNDOS' && (
                <div className="flex items-center bg-blue-950 border border-blue-800 rounded-lg p-1 text-xs gap-1">
                  <span className="text-[11px] text-blue-200 px-1 font-bold">Imprimir Fundos?</span>
                  <button
                    type="button"
                    onClick={() => setPrintFundosA4(true)}
                    className={`px-2 py-1 rounded-md font-extrabold cursor-pointer transition-colors ${
                      printFundosA4
                        ? 'bg-emerald-500 text-slate-950'
                        : 'text-blue-200 hover:text-white'
                    }`}
                  >
                    ✓ Sim
                  </button>
                  <button
                    type="button"
                    onClick={() => setPrintFundosA4(false)}
                    className={`px-2 py-1 rounded-md font-extrabold cursor-pointer transition-colors ${
                      !printFundosA4
                        ? 'bg-red-500 text-white'
                        : 'text-blue-200 hover:text-white'
                    }`}
                  >
                    ✕ Não
                  </button>
                </div>
              )}

              {onQuickCreatePart && (
                <button
                  type="button"
                  onClick={() => setShowQuickAddPart(!showQuickAddPart)}
                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-extrabold rounded-lg flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap"
                >
                  <Plus className="w-4 h-4 shrink-0" />
                  <span>+ Peça</span>
                </button>
              )}

              {/* Close Button */}
              <button
                type="button"
                onClick={onClose}
                className="p-1.5 bg-blue-950 hover:bg-blue-900 text-blue-200 hover:text-white rounded-lg cursor-pointer flex items-center justify-center"
                title="Fechar"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* View Mode Switcher and Print Action Buttons */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-blue-900/60">
            {/* View Switcher Tabs */}
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setActiveTicketView('STANDARD_TICKETS')}
                className={`px-3.5 py-2 rounded-lg text-xs font-extrabold cursor-pointer transition-colors flex items-center gap-2 ${
                  activeTicketView === 'STANDARD_TICKETS'
                    ? 'bg-amber-500 text-slate-950 shadow-sm'
                    : 'bg-blue-950 hover:bg-blue-900 text-blue-200'
                }`}
              >
                <span>Fichas de Identificação (Padrão · A4 Paisagem)</span>
                <span className="px-1.5 py-0.5 rounded-full bg-slate-900/40 text-[11px] font-mono">
                  {totalStandardCount}
                </span>
              </button>

              {totalFundosCount > 0 && (
                <button
                  type="button"
                  onClick={() => setActiveTicketView('CONTROLE_FUNDOS')}
                  className={`px-3.5 py-2 rounded-lg text-xs font-extrabold cursor-pointer transition-colors flex items-center gap-2 ${
                    activeTicketView === 'CONTROLE_FUNDOS'
                      ? 'bg-amber-500 text-slate-950 shadow-sm'
                      : 'bg-emerald-950 hover:bg-emerald-900 text-emerald-200 border border-emerald-700/60'
                  }`}
                >
                  <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                  <span>Controle de Fundos (Folha A4)</span>
                  <span
                    className={`px-1.5 py-0.5 rounded-full text-[10px] font-mono font-bold ${
                      printFundosA4
                        ? 'bg-emerald-800 text-emerald-100'
                        : 'bg-red-900 text-red-200'
                    }`}
                  >
                    {totalFundosCount} {printFundosA4 ? '· Sim, Imprimir' : '· Não Imprimir'}
                  </span>
                </button>
              )}
            </div>

            {/* Print Action Buttons */}
            <div className="flex flex-wrap items-center gap-2">
              {activeTicketView === 'STANDARD_TICKETS' ? (
                <>
                  <button
                    type="button"
                    onClick={() => window.print()}
                    className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-black rounded-lg flex items-center gap-2 cursor-pointer shadow-sm whitespace-nowrap"
                    title="Imprime todas as fichas padrão no formato A4 Paisagem"
                  >
                    <Printer className="w-4 h-4 shrink-0" />
                    <span>Imprimir Fichas de Identificação ({totalStandardCount} Fichas)</span>
                  </button>

                  {totalFundosCount > 0 && printFundosA4 && (
                    <button
                      type="button"
                      onClick={handlePrintFundosOnly}
                      className="px-3 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-lg flex items-center gap-1.5 cursor-pointer shadow-xs whitespace-nowrap"
                      title="Muda para a aba de Fundos e imprime as folhas A4 de Controle de Paletes"
                    >
                      <Printer className="w-4 h-4 shrink-0" />
                      <span>Imprimir Folhas A4 de Fundos ({totalFundosCount})</span>
                    </button>
                  )}
                </>
              ) : (
                <>
                  {printFundosA4 ? (
                    <button
                      type="button"
                      onClick={() => window.print()}
                      className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-black rounded-lg flex items-center gap-2 cursor-pointer shadow-sm whitespace-nowrap"
                      title="Imprime as folhas de Controle de Fundos em A4 Retrato Completo"
                    >
                      <Printer className="w-4 h-4 shrink-0" />
                      <span>Imprimir Controle de Fundos ({totalFundosCount} Paletes · Folha A4)</span>
                    </button>
                  ) : (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-red-300 font-bold">Folha A4 desativada</span>
                      <button
                        type="button"
                        onClick={() => setPrintFundosA4(true)}
                        className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-lg cursor-pointer"
                      >
                        Ativar Impressão de Fundos
                      </button>
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={handlePrintStandardOnly}
                    className="px-3 py-2 bg-blue-700 hover:bg-blue-600 text-white text-xs font-bold rounded-lg flex items-center gap-1.5 cursor-pointer shadow-xs whitespace-nowrap"
                    title="Volta para as fichas padrão A4 Paisagem"
                  >
                    <span>Ver Fichas Padrão ({totalStandardCount})</span>
                  </button>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Configuration Bar for Stack Quantity (Quant. Pilha) & Quick Part Registration (Hidden when printing) */}
        <div className="print:hidden bg-slate-100 border-b border-slate-300 p-4 space-y-3">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <label className="block text-[11px] font-extrabold uppercase text-slate-700 mb-1">
                  Quantidade do Lote (Produtos)
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={1}
                    value={customLotQty}
                    onChange={(e) => setCustomLotQty(Math.max(1, Number(e.target.value)))}
                    className="h-10 w-32 px-3 bg-white border-2 border-slate-400 rounded-lg font-mono text-sm font-extrabold text-[#081530]"
                  />
                  {volumesPerProduct > 1 && (
                    <div className="px-2.5 py-1 rounded-lg bg-amber-100 border border-amber-400 text-[11px] font-mono text-amber-950 leading-tight">
                      <div className="font-extrabold">
                        {customLotQty} Produtos = {totalOrderVolumes} Volumes ({volumesPerProduct} vol/prod)
                      </div>
                      <div className="text-[10px] text-amber-900">
                        {[
                          order.qtyV01 > 0 ? `${order.qtyV01} vol 1/${volumesPerProduct} (V01)` : null,
                          order.qtyV02 > 0 ? `${order.qtyV02} vol 2/${volumesPerProduct} (V02)` : null,
                          order.qtyV03 > 0 ? `${order.qtyV03} vol 3/${volumesPerProduct} (V03)` : null,
                        ]
                          .filter(Boolean)
                          .join(' + ')}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-extrabold uppercase text-slate-700 mb-1">
                  Altura da Pilha (Peças por Ficha)
                </label>
                <input
                  type="number"
                  min={1}
                  value={defaultStackQty}
                  onChange={(e) => setDefaultStackQty(Math.max(1, Number(e.target.value)))}
                  className="h-10 w-40 px-3 bg-white border-2 border-amber-500 rounded-lg font-mono text-sm font-extrabold text-[#081530]"
                />
              </div>

              {/* Quick Preset Buttons for Testing 200, 300, 400 Lot Sizes */}
              <div className="flex items-center gap-1.5 pb-0.5">
                {[200, 300, 400].map((presetLot) => (
                  <button
                    key={presetLot}
                    type="button"
                    onClick={() => setCustomLotQty(presetLot)}
                    className={`px-2.5 py-2 rounded-lg font-mono text-xs font-extrabold cursor-pointer transition-colors ${
                      customLotQty === presetLot
                        ? 'bg-[#081530] text-amber-400'
                        : 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    Lote {presetLot}
                  </button>
                ))}
              </div>

              <label className="flex items-center gap-2 text-xs font-bold text-slate-800 cursor-pointer pb-2">
                <input
                  type="checkbox"
                  checked={splitIntoStacks}
                  onChange={(e) => setSplitIntoStacks(e.target.checked)}
                  className="accent-[#081530] w-4 h-4"
                />
                <span>Gerar 1 ficha por pilha até fechar o saldo exato do lote</span>
              </label>
            </div>

            <div className="text-xs text-slate-600 font-medium pb-1">
              Peças vinculadas ao Código{' '}
              <strong className="font-mono text-slate-900">{order.productCode}</strong>:{' '}
              <strong className="text-emerald-800">{matchingParts.length} peças cadastradas</strong>
            </div>
          </div>

          {/* PER-PART STACK QUANTITY CONFIGURATION TABLE (Evita desperdício de impressões definindo a altura da pilha por Código de Peça) */}
          <div className="bg-white border-2 border-[#081530] rounded-xl overflow-hidden shadow-xs">
            <div className="bg-[#081530] text-white px-3.5 py-2 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded bg-amber-500 text-slate-950 font-extrabold uppercase text-[10px]">
                  Configuração por Código de Peça
                </span>
                <span className="text-xs font-extrabold">
                  Defina quantas peças saem por pilha em cada código de peça (ou clique em &quot;1 Ficha (Lote Todo)&quot; para evitar impressões extras)
                </span>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                {/* Botões de Selecionar / Remover Seleção de Todas */}
                {selectedPartsCount > 0 ? (
                  <button
                    type="button"
                    onClick={handleDeselectAllParts}
                    className="px-2.5 py-1 rounded bg-rose-600 hover:bg-rose-500 text-white text-[11px] font-black cursor-pointer transition-colors shadow-xs flex items-center gap-1"
                    title="Desmarca todas as peças para remover da impressão"
                  >
                    <span>✕ Remover Seleção de Todas ({selectedPartsCount})</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleSelectAllParts}
                    className="px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-black cursor-pointer transition-colors shadow-xs flex items-center gap-1"
                    title="Seleciona todas as peças para impressão"
                  >
                    <span>✓ Selecionar Todas as Peças ({allEffectivePartCodes.length})</span>
                  </button>
                )}

                {selectedPartsCount > 0 && selectedPartsCount < allEffectivePartCodes.length && (
                  <button
                    type="button"
                    onClick={handleSelectAllParts}
                    className="px-2.5 py-1 rounded bg-slate-700 hover:bg-slate-600 text-amber-300 text-[11px] font-bold cursor-pointer transition-colors"
                    title="Marca todas as peças restantes"
                  >
                    Selecionar Todas ({allEffectivePartCodes.length})
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => {
                    const baseProdQty = Math.max(1, Math.round(customLotQty || initialLotQty));
                    const nextOverrides: Record<string, number> = {};
                    effectivePartsForTickets.forEach((p) => {
                      const k = (p.partCode || '').trim().toUpperCase();
                      const qtyPerProd = Math.max(1, Math.round(p.piecesPerProduct || 1));
                      nextOverrides[k] = baseProdQty * qtyPerProd;
                    });
                    setPartStackOverrides(nextOverrides);
                  }}
                  className="px-2.5 py-1 rounded bg-emerald-700 hover:bg-emerald-600 text-white text-[11px] font-extrabold cursor-pointer transition-colors"
                >
                  Todas em 1 Única Ficha por Peça
                </button>
                {Object.keys(partStackOverrides).length > 0 && (
                  <button
                    type="button"
                    onClick={() => setPartStackOverrides({})}
                    className="px-2.5 py-1 rounded bg-slate-700 hover:bg-slate-600 text-amber-300 text-[11px] font-extrabold cursor-pointer transition-colors"
                  >
                    Restaurar Altura Geral ({defaultStackQty} pçs)
                  </button>
                )}
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-100 border-b border-slate-300 text-[10px] font-extrabold uppercase text-slate-700">
                    <th className="py-2 px-3 w-16 text-center">
                      <div
                        className="flex flex-col items-center justify-center gap-0.5 cursor-pointer select-none"
                        onClick={() => (isAllPartsSelected ? handleDeselectAllParts() : handleSelectAllParts())}
                        title={isAllPartsSelected ? 'Clique para desmarcar todas' : 'Clique para marcar todas'}
                      >
                        <input
                          type="checkbox"
                          checked={isAllPartsSelected}
                          onChange={(e) => {
                            if (e.target.checked) handleSelectAllParts();
                            else handleDeselectAllParts();
                          }}
                          className="accent-[#081530] w-4 h-4 cursor-pointer"
                        />
                        <span className="text-[9px] font-black uppercase text-slate-700">
                          {isNoPartSelected ? 'Nenhuma' : isAllPartsSelected ? 'Todas' : 'Imp.'}
                        </span>
                      </div>
                    </th>
                    <th className="py-2 px-3">Cód. Peça</th>
                    <th className="py-2 px-3">Descrição da Peça</th>
                    <th className="py-2 px-3 text-center">Qtd. Lote (Prod.)</th>
                    <th className="py-2 px-3 text-center">Qtd / Prod.</th>
                    <th className="py-2 px-3 text-center">Total Peças no Lote</th>
                    <th className="py-2 px-3">Peças por Pilha (Específico desta Peça)</th>
                    <th className="py-2 px-3">Resultado de Impressão (Pilhas / Fichas)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {effectivePartsForTickets.map((part) => {
                    const codeKey = (part.partCode || '').trim().toUpperCase();
                    const baseProdLot = Math.max(1, Math.round(customLotQty || initialLotQty));
                    const qtyPerProd = Math.max(1, Math.round(part.piecesPerProduct || 1));
                    const partTotalLot = baseProdLot * qtyPerProd;
                    const currentStackHeight = getStackHeightForPart(part, baseProdLot);
                    const hasCustomOverride = partStackOverrides[codeKey] !== undefined;
                    const isSelected = isPartSelectedForPrint(part.partCode);

                    // Calculate stacks for this specific part
                    const stackList: number[] = [];
                    if (!splitIntoStacks || currentStackHeight >= partTotalLot) {
                      stackList.push(partTotalLot);
                    } else {
                      const full = Math.floor(partTotalLot / currentStackHeight);
                      const rem = partTotalLot % currentStackHeight;
                      for (let i = 0; i < full; i++) stackList.push(currentStackHeight);
                      if (rem > 0) stackList.push(rem);
                    }

                    return (
                      <tr
                        key={part.id || codeKey}
                        className={`${
                          !isSelected
                            ? 'bg-slate-100/70 opacity-60'
                            : hasCustomOverride
                            ? 'bg-amber-50/70'
                            : 'hover:bg-slate-50'
                        }`}
                      >
                        <td className="py-2 px-3 text-center">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={(e) =>
                              setSelectedPartCodes((prev) => ({
                                ...prev,
                                [codeKey]: e.target.checked,
                              }))
                            }
                            className="accent-[#081530] w-4 h-4 cursor-pointer"
                            title="Marque para incluir esta peça na impressão"
                          />
                        </td>
                        <td className="py-2 px-3 font-mono font-black text-slate-900">
                          {part.partCode}
                        </td>
                        <td className="py-2 px-3 font-bold text-slate-800">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span>{part.partName}</span>
                            {isFundoCatalogPart(part) && (
                              <span className="px-1.5 py-0.2 rounded bg-blue-100 text-blue-900 border border-blue-200 text-[9px] font-black uppercase">
                                Fundo (Somente Corte)
                              </span>
                            )}
                          </div>
                          <span className="block text-[10px] font-mono text-slate-500">
                            {part.dimensions}
                          </span>
                        </td>
                        <td className="py-2 px-3 text-center font-mono font-bold text-slate-700">
                          {baseProdLot} prod.
                        </td>
                        <td className="py-2 px-3 text-center font-mono font-bold text-amber-900">
                          {qtyPerProd}x
                        </td>
                        <td className="py-2 px-3 text-center font-mono font-black text-[#081530] text-sm">
                          {partTotalLot} pçs
                        </td>
                        <td className="py-2 px-3">
                          <div className="flex items-center gap-1.5">
                            <input
                              type="number"
                              min={1}
                              max={100000}
                              value={currentStackHeight}
                              onChange={(e) => {
                                const val = Math.max(1, Math.round(Number(e.target.value) || 1));
                                setPartStackOverrides((prev) => ({
                                  ...prev,
                                  [codeKey]: val,
                                }));
                              }}
                              className={`h-8 w-24 px-2 rounded font-mono text-xs font-black border-2 ${
                                hasCustomOverride
                                  ? 'bg-amber-100 border-amber-600 text-[#081530]'
                                  : 'bg-white border-slate-300 text-slate-900'
                              }`}
                            />
                            <button
                              type="button"
                              onClick={() =>
                                setPartStackOverrides((prev) => ({
                                  ...prev,
                                  [codeKey]: partTotalLot,
                                }))
                              }
                              className={`px-2 py-1 rounded text-[10px] font-extrabold cursor-pointer transition-colors ${
                                currentStackHeight >= partTotalLot
                                  ? 'bg-[#081530] text-amber-400'
                                  : 'bg-slate-200 hover:bg-slate-300 text-slate-800'
                              }`}
                              title="Colocar todas as peças deste código em 1 única ficha (sem dividir em várias pilhas)"
                            >
                              1 Ficha ({partTotalLot} pçs)
                            </button>
                          </div>
                        </td>
                        <td className="py-2 px-3 font-mono text-xs">
                          {!isSelected ? (
                            <span className="text-slate-400 font-bold">Não imprimir</span>
                          ) : (
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-950 font-black">
                                {stackList.length} {stackList.length === 1 ? 'ficha' : 'fichas'}
                              </span>
                              <span className="text-slate-600 font-bold">
                                ({stackList.join(' + ')} = {partTotalLot} pçs)
                              </span>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Inline Form to Register a New Part directly for this Product Code */}
          {showQuickAddPart && (
            <form
              onSubmit={handleCreatePartInline}
              className="bg-white border-2 border-emerald-600 rounded-xl p-4 space-y-3"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <h3 className="text-xs font-extrabold uppercase text-emerald-900">
                    Vincular Nova Peça ao Produto {order.productCode} ({order.productDescription})
                  </h3>
                  <span className="px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 text-[10px] font-bold flex items-center gap-1">
                    <Sparkles className="w-3 h-3 text-emerald-600" />
                    Inteligência Ativa
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setShowQuickAddPart(false)}
                  className="text-xs font-bold text-slate-500 hover:text-slate-800 cursor-pointer"
                >
                  Fechar
                </button>
              </div>

              {/* Feedback de Autopreenchimento Inteligente */}
              {inlineAutoFilledMsg && (
                <div className="p-2.5 bg-emerald-50 border border-emerald-400 rounded-lg text-xs font-bold text-emerald-950 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>{inlineAutoFilledMsg}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setInlineAutoFilledMsg(null)}
                    className="text-emerald-800 hover:text-emerald-950 ml-2"
                  >
                    ✕
                  </button>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-7 gap-2.5">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    Cód. Peça (Ex: 403411) *
                  </label>
                  <input
                    type="text"
                    required
                    list="modal-known-parts-datalist"
                    value={newPartCode}
                    onChange={(e) => handleModalPartCodeChange(e.target.value)}
                    placeholder="403411"
                    className="w-full h-9 px-2.5 bg-slate-50 border border-slate-300 rounded font-mono text-xs font-bold"
                  />
                  <datalist id="modal-known-parts-datalist">
                    {distinctKnownPartsForModal.map((item) => (
                      <option
                        key={`${item.partCode}-${item.paCode}`}
                        value={item.partCode}
                      >
                        {item.partName} | {item.dimensions} | PA {item.paCode}
                      </option>
                    ))}
                  </datalist>
                </div>
                <div className="sm:col-span-2">
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-[11px] font-bold text-slate-700">
                      Nome da Peça (Ex: TAMPO / FUNDO) *
                    </label>
                    {isFundoCatalogPart({
                      partName: newPartName,
                      dimensions: `${newLengthMm} x ${newWidthMm} x ${newThicknessMm} mm`,
                      edgeConfig: newEdgeConfig,
                      uvFaces: newUvFaces,
                    }) && (
                      <span className="text-[9px] font-black text-blue-900 bg-blue-100 border border-blue-200 px-1 rounded">
                        Fundo (Somente Corte)
                      </span>
                    )}
                  </div>
                  <input
                    type="text"
                    required
                    value={newPartName}
                    onChange={(e) => handleModalPartNameChange(e.target.value.toUpperCase())}
                    placeholder="TAMPO OU FUNDO"
                    className="w-full h-9 px-2.5 bg-slate-50 border border-slate-300 rounded text-xs font-bold"
                  />
                  <div className="mt-1">
                    <button
                      type="button"
                      onClick={applyModalFundoPreset}
                      className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-100 hover:bg-amber-200 border border-amber-300 text-amber-950 text-[10px] font-extrabold rounded cursor-pointer transition-colors"
                      title="Definir rapidamente como FUNDO (Somente corte, sem UV e sem borda)"
                    >
                      <Sparkles className="w-3 h-3 text-amber-700" />
                      <span>⚡ Preset Peça Tipo FUNDO (Somente Corte)</span>
                    </button>
                  </div>
                </div>
                <div>
                  <label
                    className="block text-[11px] font-extrabold text-[#081530] mb-1"
                    title="Quantidade desta peça que vai em 1 produto"
                  >
                    Qtd / Produto *
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={1000}
                    required
                    value={newPiecesPerProduct}
                    onChange={(e) =>
                      setNewPiecesPerProduct(Math.max(1, Math.round(Number(e.target.value) || 1)))
                    }
                    className="w-full h-9 px-2.5 bg-amber-50 border-2 border-amber-500 rounded font-mono text-xs font-extrabold text-[#081530]"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    Comp. (mm) *
                  </label>
                  <input
                    type="number"
                    required
                    value={newLengthMm}
                    onChange={(e) => setNewLengthMm(e.target.value)}
                    placeholder="1568"
                    className="w-full h-9 px-2.5 bg-slate-50 border border-slate-300 rounded font-mono text-xs font-bold"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    Larg. (mm) *
                  </label>
                  <input
                    type="number"
                    required
                    value={newWidthMm}
                    onChange={(e) => setNewWidthMm(e.target.value)}
                    placeholder="297"
                    className="w-full h-9 px-2.5 bg-slate-50 border border-slate-300 rounded font-mono text-xs font-bold"
                  />
                </div>
                <div className="flex items-end">
                  <button
                    type="submit"
                    disabled={addingPart}
                    className="w-full h-9 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-extrabold rounded cursor-pointer"
                  >
                    {addingPart ? 'Salvando...' : '+ Salvar Peça'}
                  </button>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-3 pt-1 border-t border-slate-200 text-xs">
                <div className="flex items-center gap-1.5">
                  <span className="font-bold text-slate-700">1. Operação Corte:</span>
                  <button
                    type="button"
                    onClick={() => setNewHasCorte(true)}
                    className={`px-2 py-1 rounded font-bold cursor-pointer ${
                      newHasCorte
                        ? 'bg-[#081530] text-white'
                        : 'bg-slate-100 text-slate-700 border border-slate-300'
                    }`}
                  >
                    Passa no Corte
                  </button>
                  <button
                    type="button"
                    onClick={() => setNewHasCorte(false)}
                    className={`px-2 py-1 rounded font-bold cursor-pointer ${
                      !newHasCorte
                        ? 'bg-rose-700 text-white'
                        : 'bg-slate-100 text-slate-700 border border-slate-300'
                    }`}
                  >
                    Somente Colada/Pintada (0 m² Corte)
                  </button>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="font-bold text-slate-700">2. Pintura UV:</span>
                  {[
                    { v: 1, l: '1 Lado' },
                    { v: 2, l: '2 Lados' },
                    { v: 0, l: 'Sem UV' },
                  ].map((opt) => (
                    <button
                      key={opt.v}
                      type="button"
                      onClick={() => setNewUvFaces(opt.v)}
                      className={`px-2 py-1 rounded font-bold cursor-pointer ${
                        newUvFaces === opt.v
                          ? 'bg-amber-600 text-white'
                          : 'bg-slate-100 text-slate-700 border border-slate-300'
                      }`}
                    >
                      {opt.l}
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="font-bold text-slate-700">3. Borda:</span>
                  {[
                    { id: '2L', l: '2 Larguras (2L)' },
                    { id: '1C + 2L', l: '1C + 2L' },
                    { id: '2C + 2L', l: '4 Lados' },
                    { id: '1C', l: '1C' },
                    { id: '1L', l: '1L' },
                    { id: 'SEM_BORDA', l: 'Sem Borda' },
                  ].map((edge) => (
                    <button
                      key={edge.id}
                      type="button"
                      onClick={() => setNewEdgeConfig(edge.id)}
                      className={`px-2 py-1 rounded font-bold cursor-pointer ${
                        newEdgeConfig === edge.id
                          ? 'bg-[#081530] text-amber-400 border border-amber-400'
                          : 'bg-slate-100 text-slate-700 border border-slate-300'
                      }`}
                    >
                      {edge.l}
                    </button>
                  ))}
                </div>
              </div>
            </form>
          )}
        </div>

        {/* TICKETS GRID — 2 TICKETS PER PAGE IN A4 LANDSCAPE FITTING STRICTLY INSIDE PAGE MARGINS */}
        {/* TICKETS GRID */}
        <div className="p-4 sm:p-6 bg-slate-200/70 print:bg-white print:p-0 space-y-6 print:space-y-0">
          {activeTicketView === 'CONTROLE_FUNDOS' ? (
            !printFundosA4 ? (
              <div className="bg-white p-10 text-center rounded-2xl border-2 border-slate-300 max-w-xl mx-auto my-8 shadow-md">
                <div className="w-12 h-12 mx-auto rounded-full bg-slate-100 flex items-center justify-center text-slate-500 mb-3 font-black text-xl">
                  ✕
                </div>
                <h3 className="text-lg font-black text-slate-900">
                  Impressão de Folha A4 para Fundos Desativada
                </h3>
                <p className="text-xs text-slate-600 mt-2 max-w-md mx-auto">
                  A opção de impressão em folha completa A4 para peças do tipo fundo está definida como <strong>Não Imprimir</strong>. Nenhuma folha de fundo será impressa.
                </p>
                <div className="mt-5 flex justify-center gap-3">
                  <button
                    type="button"
                    onClick={() => setPrintFundosA4(true)}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-xs rounded-xl shadow-xs cursor-pointer flex items-center gap-1.5"
                  >
                    <span>✓ Ativar e Imprimir em Folha A4</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTicketView('STANDARD_TICKETS')}
                    className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 font-extrabold text-xs rounded-xl cursor-pointer"
                  >
                    Voltar para Fichas Padrão
                  </button>
                </div>
              </div>
            ) : paginatedFundoTicketGroups.length === 0 ? (
              <div className="bg-white p-12 text-center rounded-xl border border-slate-300 max-w-xl mx-auto my-8">
                <p className="text-base font-extrabold text-[#081530]">
                  Nenhuma peça do tipo FUNDO cadastrada para este produto.
                </p>
                <p className="text-xs text-slate-500 mt-2">
                  Peças do tipo Fundo são somente cortadas (sem coladeira de borda e sem pintura UV). Você pode cadastrar uma peça com o botão &ldquo;+ Peça&rdquo; acima.
                </p>
              </div>
            ) : (
              paginatedFundoTicketGroups.map((pageGroup, pageIdx) => {
                const fundoTicket = pageGroup[0];
                return (
                  <div
                    key={`page_fundo_${fundoTicket.ticketId}_${pageIdx}`}
                    className="fundo-a4-portrait-page w-full flex justify-center py-2 print:py-0"
                  >
                    <ControleDeFundosA4Card
                      ticket={fundoTicket}
                      order={order}
                      responsavel={fundoOperatorName}
                      onResponsavelChange={setFundoOperatorName}
                    />
                  </div>
                );
              })
            )
          ) : paginatedStandardTicketGroups.length === 0 ? (
            <div className="bg-white p-12 text-center rounded-2xl border-2 border-slate-300 max-w-xl mx-auto my-8 shadow-md">
              <div className="w-12 h-12 mx-auto rounded-full bg-amber-100 flex items-center justify-center text-amber-700 mb-3 font-black text-xl">
                ✕
              </div>
              <p className="text-base font-extrabold text-[#081530]">
                {isNoPartSelected
                  ? 'Todas as peças foram desmarcadas (Nenhuma impressão selecionada).'
                  : 'Nenhuma ficha padrão selecionada para impressão.'}
              </p>
              <p className="text-xs text-slate-500 mt-2">
                {isNoPartSelected
                  ? 'Você pode marcar peças individualmente na tabela de códigos acima ou clicar no botão abaixo para selecionar todas novamente:'
                  : 'Verifique a seleção de peças na tabela de códigos acima.'}
              </p>
              {isNoPartSelected && (
                <div className="mt-4">
                  <button
                    type="button"
                    onClick={handleSelectAllParts}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-xs rounded-xl shadow-xs cursor-pointer inline-flex items-center gap-1.5"
                  >
                    <span>✓ Selecionar Todas as Peças</span>
                  </button>
                </div>
              )}
            </div>
          ) : (
            paginatedStandardTicketGroups.map((pageTickets, pageIdx) => {
              return (
                <div key={`page_${pageIdx}`} className="ticket-print-page w-full">
                  {/* Top blank margin spacer when printing with Blank Space on Top and Tickets on Bottom */}
                  {printVerticalPosition === 'BOTTOM' && (
                    <div
                      className="hidden print:block w-full"
                      style={{ height: `${topBlankSpaceMm}mm` }}
                    />
                  )}
                  <div
                    className={`w-full ${
                      ticketsPerPage === 1
                        ? 'flex justify-center items-start'
                        : 'grid grid-cols-1 lg:grid-cols-2 gap-6 print:grid-cols-2 print:gap-4 print:items-start'
                    }`}
                  >
                    {pageTickets.map((t) => {
                // Check if any sectors already have logs for this batch + partCode
                const partLogs = logs.filter(
                  (l) =>
                    (l.batchNumber || '').trim().toUpperCase() ===
                      order.batchNumber.trim().toUpperCase() &&
                    (l.partCode || '').trim().toUpperCase() ===
                      t.part.partCode.trim().toUpperCase()
                );
                const corteQty = partLogs
                  .filter((l) => l.sector === 'SECCIONADORA')
                  .reduce((a, b) => a + b.quantityGood, 0);
                const coladeiraQty = partLogs
                  .filter((l) => l.sector === 'COLADEIRA')
                  .reduce((a, b) => a + b.quantityGood, 0);
                const furadeiraQty = partLogs
                  .filter((l) => l.sector === 'FURADEIRA')
                  .reduce((a, b) => a + b.quantityGood, 0);
                const uvQty = partLogs
                  .filter((l) => l.sector === 'LINHA_UV')
                  .reduce((a, b) => a + b.quantityGood, 0);

                // Clean compact dimensions string (e.g. "1568 x 297") for line 01 - SECCIONADORA
                const cleanDims = t.part.dimensions.replace(/mm/gi, '').trim();
                const isFundoPart = isFundoCatalogPart(t.part);

                return (
                  <div
                    key={t.ticketId}
                    className={`ticket-card-print bg-[#e3efe8] print:bg-white border-2 border-[#163a5f] text-[#102a45] rounded-md shadow-md print:shadow-none overflow-hidden break-inside-avoid mx-auto ${
                      ticketsPerPage === 1
                        ? 'w-full max-w-2xl print:w-[190mm] print:max-w-[190mm]'
                        : 'w-full'
                    }`}
                  >
                    {/* Header Box: MultiLinea Logo + FICHA DE IDENTIFICAÇÃO DE PEÇAS */}
                    <div className="grid grid-cols-12 border-b-2 border-[#163a5f]">
                      <div className="col-span-4 p-2 print:py-1 print:px-1.5 border-r-2 border-[#163a5f] flex flex-col justify-center items-center bg-[#d7e8de] print:bg-white">
                        <div className="font-black text-lg print:text-sm tracking-tight text-[#163a5f] leading-none">
                          MultiLinea
                        </div>
                        <div className="text-[10px] print:text-[8px] font-bold tracking-widest uppercase text-[#163a5f] mt-0.5 print:mt-0">
                          Móveis
                        </div>
                      </div>
                      <div className="col-span-8 p-2 print:py-1 print:px-1.5 flex flex-col items-center justify-center text-center">
                        <div className="flex flex-wrap items-center justify-center gap-1.5">
                          <h3 className="text-sm sm:text-base print:text-[11px] font-black tracking-wide uppercase text-[#163a5f] leading-tight">
                            FICHA DE IDENTIFICAÇÃO DE PEÇAS
                          </h3>
                          <span className="px-1.5 py-0.5 rounded bg-[#163a5f] text-amber-300 font-mono font-black text-[9px] print:text-[7.5px] tracking-wider leading-none">
                            ID: {t.uniqueTicketCode}
                          </span>
                        </div>
                        <span className="text-[10px] print:text-[8.5px] font-mono font-bold text-slate-700 leading-tight">
                          Encomenda: {order.orderCode} · Cód. Produto: {order.productCode} (
                          {order.finishColor})
                        </span>
                      </div>
                    </div>

                    {/* Top Pre-filled Fields (Replacing Handwriting!) */}
                    <div className="text-xs divide-y border-b-2 border-[#163a5f] divide-[#163a5f]">
                      {/* Row 1: Produto + Lote */}
                      <div className="grid grid-cols-12">
                        <div className="col-span-8 p-2 print:py-0.5 print:px-1.5 border-r border-[#163a5f] flex items-baseline gap-1">
                          <span className="font-bold text-[11px] print:text-[8.5px] text-[#163a5f] shrink-0">
                            Produto:
                          </span>
                          <span className="font-extrabold text-xs sm:text-sm print:text-[10px] text-slate-950 truncate">
                            {order.productLine} - {order.productDescription}
                          </span>
                        </div>
                        <div className="col-span-4 p-2 print:py-0.5 print:px-1.5 flex items-baseline gap-1">
                          <span className="font-bold text-[11px] print:text-[8.5px] text-[#163a5f] shrink-0">
                            Lote:
                          </span>
                          <span className="font-mono font-black text-sm sm:text-base print:text-[11px] text-red-900">
                            {order.batchNumber}
                          </span>
                        </div>
                      </div>

                      {/* Row 2: Quantidade do lote + Quantidade de peças por lote + Quant. Pilha */}
                      <div className="grid grid-cols-12">
                        <div className="col-span-4 p-2 print:py-0.5 print:px-1.5 border-r border-[#163a5f] flex flex-col justify-center">
                          <span className="font-bold text-[10px] print:text-[7.5px] uppercase tracking-tight text-[#163a5f] leading-none">
                            Quantidade do lote:
                          </span>
                          <div className="flex items-baseline gap-1 mt-0.5 print:mt-0">
                            <span className="font-mono font-black text-sm sm:text-base print:text-[11px] text-slate-950 leading-tight">
                              {t.productLotQty}
                            </span>
                            <span className="text-[10px] print:text-[7.5px] font-bold text-slate-600">
                              prod.
                              {volumesPerProduct > 1
                                ? ` (${totalOrderVolumes} vol. 1/${volumesPerProduct}..${volumesPerProduct}/${volumesPerProduct})`
                                : ''}
                            </span>
                          </div>
                        </div>
                        <div className="col-span-4 p-2 print:py-0.5 print:px-1.5 border-r border-[#163a5f] flex flex-col justify-center bg-amber-50/70 print:bg-white">
                          <span className="font-bold text-[10px] print:text-[7.5px] uppercase tracking-tight text-[#163a5f] leading-none">
                            Quant. de peças por lote:
                          </span>
                          <div className="flex items-baseline gap-1 mt-0.5 print:mt-0">
                            <span className="font-mono font-black text-sm sm:text-base print:text-[11px] text-[#081530] leading-tight">
                              {t.partLotQty}
                            </span>
                            <span className="text-[10px] print:text-[7.5px] font-bold text-amber-900">
                              pçs ({t.piecesPerProduct}x/prod.)
                            </span>
                          </div>
                        </div>
                        <div
                          className={`col-span-4 p-2 print:py-0.5 print:px-1.5 flex flex-col justify-center ${
                            t.isRemainderStack ? 'bg-amber-200/80 print:bg-amber-100' : ''
                          }`}
                        >
                          <span className="font-bold text-[10px] print:text-[7.5px] uppercase tracking-tight text-[#163a5f] leading-none">
                            Quant. Pilha:
                          </span>
                          <div className="flex items-baseline gap-1 mt-0.5 print:mt-0">
                            <span className="font-mono font-black text-sm sm:text-base print:text-[11px] text-slate-950 leading-tight">
                              {t.stackQty}
                            </span>
                            {t.totalStacks > 1 && (
                              <span className="text-[10px] print:text-[7.5px] font-bold text-[#163a5f]">
                                ({t.isRemainderStack ? 'Restante' : 'Pilha'} {t.stackIndex}/
                                {t.totalStacks})
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Row 3: Cod. (Part Code) + Peça (Part Name) */}
                      <div className="grid grid-cols-12 bg-[#d7e8de]/70 print:bg-slate-50">
                        <div className="col-span-4 p-2 print:py-0.5 print:px-1.5 border-r border-[#163a5f] flex items-baseline gap-1">
                          <span className="font-bold text-[11px] print:text-[8.5px] text-[#163a5f]">Cod.:</span>
                          <span className="font-mono font-black text-sm sm:text-base print:text-[11px] text-[#081530]">
                            {t.part.partCode}
                          </span>
                        </div>
                        <div className="col-span-8 p-2 print:py-0.5 print:px-1.5 flex items-baseline gap-1.5 flex-wrap">
                          <span className="font-bold text-[11px] print:text-[8.5px] text-[#163a5f] shrink-0">
                            Peça:
                          </span>
                          <span className="font-black text-sm sm:text-base print:text-[11px] text-slate-950 truncate">
                            {t.part.partName}
                          </span>
                          {isFundoPart && (
                            <span className="px-1.5 py-0.5 rounded bg-blue-100 text-[#163a5f] border border-blue-300 font-extrabold text-[9px] print:text-[7px] uppercase tracking-wider">
                              Somente Corte (Fundo)
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* QR-CODE BOX FOR INSTANT SCANNING AT EACH SECTOR */}
                    <div className="p-3 print:py-1 print:px-1.5 bg-white border-b-2 border-[#163a5f] flex flex-row items-center justify-between gap-2">
                      <div className="text-[11px] print:text-[8px] leading-snug print:leading-tight text-slate-700 space-y-1 print:space-y-0 flex-1">
                        <div className="font-extrabold uppercase text-[#081530] flex items-center gap-1.5">
                          <QrCode className="w-4 h-4 print:w-3 print:h-3 text-[#163a5f]" />
                          <span>QR-CODE ÚNICO DA FICHA (ANTIDUPLICIDADE):</span>
                        </div>
                        <div className="inline-flex items-center gap-1 font-mono text-[10px] print:text-[7.5px] font-bold text-blue-900 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-200">
                          <span>Ficha {t.stackIndex} de {t.totalStacks}:</span>
                          <span className="font-black text-amber-900">{t.uniqueTicketCode}</span>
                          <span>({t.stackQty} pçs)</span>
                        </div>
                        <div className="font-mono text-[10px] print:text-[8px]">
                          • 1. Corte:{' '}
                          {t.part.squareMeters === 0 ? (
                            <strong>Sem Corte — Montagem Bancada (0 m²)</strong>
                          ) : (
                            <>
                              <strong>{t.part.squareMeters} m²/pç</strong> (Total Pilha:{' '}
                              <strong>{(t.part.squareMeters * t.stackQty).toFixed(2)} m²</strong>)
                              {isFundoPart && <span className="ml-1 text-blue-900 font-black">[Fundo]</span>}
                            </>
                          )}
                        </div>
                        <div className="font-mono text-[10px] print:text-[8px]">
                          • 2. Coladeira:{' '}
                          {isFundoPart || t.part.edgeConfig === 'SEM_BORDA' || t.part.linearMeters === 0 ? (
                            <strong className="text-slate-600">NÃO PASSA (Sem Fita de Borda — 0 m)</strong>
                          ) : (
                            <>
                              <strong>{t.part.linearMeters} m/pç</strong> ({t.part.edgeConfig}) (Total Pilha:{' '}
                              <strong>{(t.part.linearMeters * t.stackQty).toFixed(2)} m lin.</strong>)
                            </>
                          )}
                        </div>
                        <div className="font-mono text-[10px] print:text-[8px]">
                          • 3. Furadeira: {isFundoPart ? '—' : <strong>{t.stackQty} pçs</strong>} · 4. UV:{' '}
                          {isFundoPart || t.part.uvFaces === 0 ? (
                            <strong className="text-slate-600">NÃO PASSA (Sem UV — 0 m²)</strong>
                          ) : (
                            <strong>
                              {(
                                (t.part.uvSquareMeters ?? t.part.squareMeters) * t.stackQty
                              ).toFixed(2)}{' '}
                              m²
                            </strong>
                          )}
                        </div>
                      </div>
                      <TicketQrCodeBox
                        value={t.barcodeValue}
                        uniqueCode={t.uniqueTicketCode}
                        size={70}
                      />
                    </div>

                    {/* OFFICIAL SECTOR TABLE (01 - SECCIONADORA through 65 - EMBALAGEM) */}
                    <table className="w-full border-collapse text-[11px] print:text-[8.5px]">
                      <thead>
                        <tr className="bg-[#163a5f] text-white font-extrabold uppercase">
                          <th className="py-1 print:py-0.5 px-2 print:px-1.5 text-left border-r border-slate-400 w-[44%]">
                            SETOR
                          </th>
                          <th className="py-1 print:py-0.5 px-1.5 print:px-1 text-center border-r border-slate-400 w-[14%]">
                            QTD
                          </th>
                          <th className="py-1 print:py-0.5 px-1.5 print:px-1 text-center border-r border-slate-400 w-[14%]">
                            VISTO
                          </th>
                          <th className="py-1 print:py-0.5 px-2 print:px-1.5 text-left w-[28%]">
                            OBSERVAÇÕES
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#163a5f]/50">
                        {OFFICIAL_TICKET_SECTORS.map((secName, idx) => {
                          const isSeccionadora = idx === 0;
                          const isColadeiraGiben = secName.startsWith('03 -');
                          const isFuradeiraBiesse = secName.startsWith('11 -');
                          const isLinhaUv = secName.startsWith('56 -');

                          // Check if THIS specific unique ticket has been scanned in this sector
                          const isTicketInSector = (secKey: string) =>
                            logs.some((l) => {
                              if (l.sector !== secKey) return false;
                              const tid = getLogTicketId(l);
                              return Boolean(tid && tid === t.uniqueTicketCode);
                            });

                          let prefilledQty = '';
                          let prefilledVisto = '';
                          let prefilledObs = '';

                          if (isSeccionadora) {
                            prefilledQty = String(t.stackQty);
                            prefilledVisto = isTicketInSector('SECCIONADORA')
                              ? '✓ BIPADO (Ficha Única)'
                              : corteQty >= t.cumulativeEnd
                              ? '✓ BIPADO'
                              : '';
                            prefilledObs = isFundoPart ? `${cleanDims} (CORTE FUNDO)` : cleanDims;
                          } else if (isColadeiraGiben) {
                            if (isFundoPart || t.part.edgeConfig === 'SEM_BORDA' || t.part.linearMeters === 0) {
                              prefilledQty = '—';
                              prefilledVisto = '— NÃO PASSA —';
                              prefilledObs = isFundoPart ? 'Fundo (Sem Borda)' : 'Sem Borda (0 m)';
                            } else {
                              prefilledQty =
                                isTicketInSector('COLADEIRA') || coladeiraQty >= t.cumulativeEnd
                                  ? String(t.stackQty)
                                  : '';
                              prefilledVisto = isTicketInSector('COLADEIRA')
                                ? '✓ BIPADO (Ficha Única)'
                                : coladeiraQty >= t.cumulativeEnd
                                ? '✓ BIPADO'
                                : '';
                              prefilledObs = t.part.edgeConfig ? `Borda: ${t.part.edgeConfig}` : '';
                            }
                          } else if (isFuradeiraBiesse) {
                            if (isFundoPart) {
                              prefilledQty = '—';
                              prefilledVisto = '—';
                              prefilledObs = 'Fundo (Sem Furação)';
                            } else {
                              prefilledQty =
                                isTicketInSector('FURADEIRA') || furadeiraQty >= t.cumulativeEnd
                                  ? String(t.stackQty)
                                  : '';
                              prefilledVisto = isTicketInSector('FURADEIRA')
                                ? '✓ BIPADO (Ficha Única)'
                                : furadeiraQty >= t.cumulativeEnd
                                ? '✓ BIPADO'
                                : '';
                            }
                          } else if (isLinhaUv) {
                            if (isFundoPart || t.part.uvFaces === 0) {
                              prefilledQty = '—';
                              prefilledVisto = '— NÃO PASSA —';
                              prefilledObs = isFundoPart ? 'Fundo (Sem Pintura UV)' : 'Sem UV (0 m²)';
                            } else {
                              prefilledQty =
                                isTicketInSector('LINHA_UV') || uvQty >= t.cumulativeEnd
                                  ? String(t.stackQty)
                                  : '';
                              prefilledVisto = isTicketInSector('LINHA_UV')
                                ? '✓ BIPADO (Ficha Única)'
                                : uvQty >= t.cumulativeEnd
                                ? '✓ BIPADO'
                                : '';
                              prefilledObs =
                                t.part.uvFaces === 2
                                  ? 'Pintura 2 Lados'
                                  : 'Pintura 1 Lado';
                            }
                          }

                          return (
                            <tr key={secName} className="h-5 print:h-[13.5px]">
                              <td className="px-2 print:px-1.5 py-0.5 print:py-0 font-bold text-[#102a45] border-r border-[#163a5f]/60 whitespace-nowrap leading-none">
                                {secName}
                              </td>
                              <td className="px-1.5 print:px-1 py-0.5 print:py-0 text-center font-mono font-extrabold text-slate-950 border-r border-[#163a5f]/60 leading-none">
                                {prefilledQty}
                              </td>
                              <td className="px-1.5 print:px-1 py-0.5 print:py-0 text-center font-mono text-[10px] print:text-[7.5px] font-bold text-emerald-800 border-r border-[#163a5f]/60 leading-none">
                                {prefilledVisto}
                              </td>
                              <td className="px-2 print:px-1.5 py-0.5 print:py-0 font-mono text-[10px] print:text-[7.5px] font-bold text-slate-900 truncate leading-none">
                                {prefilledObs}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                );
              })}
              </div>
            </div>
          );
        })
      )}
        </div>
      </div>
    </div>
  );

  return typeof document !== 'undefined'
    ? createPortal(modalContent, document.body)
    : modalContent;
};
