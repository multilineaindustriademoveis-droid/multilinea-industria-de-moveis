import React, { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { AssistanceOrder, CatalogPart } from '../types';
import {
  Printer,
  QrCode,
  X,
  CheckSquare,
  Square,
  AlertTriangle,
  Wrench,
  Search,
  Calendar,
  Layers,
  Sparkles,
  Check,
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';

// Official Multilinea Ficha de Identificação de Peças sectors from the physical green form
export const OFFICIAL_ASSISTANCE_TICKET_SECTORS: string[] = [
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
  '65 - EMBALAGEM / EXPEDIÇÃO',
];

interface AssistancePartTicketModalProps {
  planNumber: string;
  planDate: string;
  items: AssistanceOrder[];
  initialSelectedItem?: AssistanceOrder | null;
  catalogParts: CatalogPart[];
  onClose: () => void;
}

export const AssistancePartTicketModal: React.FC<AssistancePartTicketModalProps> = ({
  planNumber,
  planDate,
  items,
  initialSelectedItem,
  catalogParts,
  onClose,
}) => {
  // Print options
  const [ticketsPerPage, setTicketsPerPage] = useState<1 | 2>(2);
  const [searchFilter, setSearchFilter] = useState('');

  // Per-item selection map: { [id]: boolean }
  const [selectedItemIds, setSelectedItemIds] = useState<Record<string, boolean>>(() => {
    const map: Record<string, boolean> = {};
    if (initialSelectedItem) {
      // If modal was opened for a single item, default select only that item
      items.forEach((it) => {
        map[it.id] = it.id === initialSelectedItem.id;
      });
    } else {
      // Otherwise select all by default
      items.forEach((it) => {
        map[it.id] = true;
      });
    }
    return map;
  });

  // Fast catalog lookup map by partCode
  const catalogByCode = useMemo(() => {
    const map = new Map<string, CatalogPart>();
    catalogParts.forEach((cp) => {
      if (cp.partCode) {
        map.set(cp.partCode.trim().toUpperCase(), cp);
      }
    });
    return map;
  }, [catalogParts]);

  // Toggle select all
  const allSelected = useMemo(() => {
    return items.length > 0 && items.every((it) => selectedItemIds[it.id]);
  }, [items, selectedItemIds]);

  const handleToggleSelectAll = () => {
    setSelectedItemIds((prev) => {
      const next: Record<string, boolean> = {};
      const targetState = !allSelected;
      items.forEach((it) => {
        next[it.id] = targetState;
      });
      return next;
    });
  };

  const handleToggleItem = (id: string) => {
    setSelectedItemIds((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  // Selected items to print
  const itemsToPrint = useMemo(() => {
    return items.filter((it) => {
      if (!selectedItemIds[it.id]) return false;
      if (searchFilter.trim()) {
        const q = searchFilter.trim().toUpperCase();
        return (
          it.partCode.toUpperCase().includes(q) ||
          it.partName.toUpperCase().includes(q) ||
          it.productName.toUpperCase().includes(q) ||
          (it.notes && it.notes.toUpperCase().includes(q))
        );
      }
      return true;
    });
  }, [items, selectedItemIds, searchFilter]);

  // Helper to resolve technical specs (dimensions, m², edge, uv)
  const getTicketSpecs = (item: AssistanceOrder) => {
    const cleanCode = (item.partCode || '').trim().toUpperCase();
    const catPart = catalogByCode.get(cleanCode);

    // Dimensions
    let dimensions = catPart?.dimensions || '';
    if (!dimensions) {
      const dimMatch = item.partName.match(/(\d{2,4})\s*[xX*×]\s*(\d{2,4})(?:\s*[xX*×]\s*(\d{1,3}))?/);
      if (dimMatch) {
        dimensions = dimMatch[0];
      }
    }

    // Square Meters
    let m2 = catPart?.squareMeters || 0;
    if (m2 === 0) {
      const dimNums = (dimensions || item.partName).match(/(\d{2,4})\s*[xX*×]\s*(\d{2,4})/);
      if (dimNums) {
        const d1 = parseFloat(dimNums[1]);
        const d2 = parseFloat(dimNums[2]);
        if (d1 > 0 && d2 > 0) {
          m2 = Number(((d1 * d2) / 1000000).toFixed(4));
        }
      }
    }

    // Special piece 402943
    if (cleanCode === '402943') {
      m2 = 0.335;
    }

    // Linear Meters
    let linM = catPart?.linearMeters || 0;
    let edgeConfig = catPart?.edgeConfig || 'FITA DE BORDA PADRÃO';
    if (linM === 0 && dimensions) {
      const dimNums = dimensions.match(/\d+/g);
      if (dimNums && dimNums.length >= 2) {
        const l = parseFloat(dimNums[0]);
        const w = parseFloat(dimNums[1]);
        linM = Number(((l + 2 * w) / 1000).toFixed(3));
      }
    }

    // UV
    const uvM2 = catPart?.uvSquareMeters || m2 * 2;
    const isSemFurar = (item.notes || '').toUpperCase().includes('SEM FURAR');
    const isSemCanal = (item.notes || '').toUpperCase().includes('SEM CANAL');

    // Unique barcode & ticket ID
    const cleanPlan = planNumber.replace(/[\/\s]/g, '-').toUpperCase();
    const uniqueTicketCode = `F-AST-${cleanPlan}-${cleanCode}-P01`;
    // Format: AST-{cleanPlan}|{partCode}|{quantity}|P1-1|{uniqueTicketCode}
    const barcodeValue = `AST-${cleanPlan}|${cleanCode}|${item.quantity}|P1-1|${uniqueTicketCode}`;

    return {
      dimensions,
      m2,
      totalM2: Number((m2 * item.quantity).toFixed(2)),
      linM,
      totalLinM: Number((linM * item.quantity).toFixed(2)),
      edgeConfig,
      uvM2: Number(uvM2.toFixed(4)),
      isSemFurar,
      isSemCanal,
      uniqueTicketCode,
      barcodeValue,
    };
  };

  // Group items into printable pages (1 or 2 per page)
  const ticketPages = useMemo(() => {
    const pages: AssistanceOrder[][] = [];
    for (let i = 0; i < itemsToPrint.length; i += ticketsPerPage) {
      pages.push(itemsToPrint.slice(i, i + ticketsPerPage));
    }
    return pages;
  }, [itemsToPrint, ticketsPerPage]);

  return createPortal(
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/80 backdrop-blur-xs flex flex-col items-center p-2 sm:p-4 print:p-0 print:bg-white print:overflow-visible">
      {/* Non-Printable Header & Controls Toolbar */}
      <div className="w-full max-w-5xl bg-[#091428] rounded-2xl border border-slate-700/80 p-4 mb-4 shadow-2xl print:hidden space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <span className="p-2.5 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/40">
              <QrCode className="w-6 h-6" />
            </span>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-lg font-black text-white tracking-tight flex items-center gap-2">
                  Fichas de Identificação de Peças com QR-Code
                  <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40 uppercase">
                    Assistência Técnica
                  </span>
                </h2>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Plano Mestre: <strong className="text-amber-400 font-mono">{planNumber}</strong> · Emissão:{' '}
                <strong className="text-white font-mono">{planDate}</strong> · Bipagem integrada no Terminal de Máquina.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => window.print()}
              disabled={itemsToPrint.length === 0}
              className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs sm:text-sm shadow-md flex items-center gap-2 cursor-pointer transition-all active:scale-95 disabled:opacity-50"
              title="Imprimir todas as fichas selecionadas em A4 Paisagem"
            >
              <Printer className="w-4 h-4 text-blue-200" />
              <span>Imprimir Fichas ({itemsToPrint.length})</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="p-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 cursor-pointer transition-all"
              title="Fechar"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Filters and Selection Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-3 flex-wrap">
            <button
              type="button"
              onClick={handleToggleSelectAll}
              className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 font-bold flex items-center gap-1.5 cursor-pointer"
            >
              {allSelected ? (
                <CheckSquare className="w-4 h-4 text-amber-400" />
              ) : (
                <Square className="w-4 h-4 text-slate-400" />
              )}
              <span>{allSelected ? 'Desmarcar Todas' : 'Selecionar Todas'}</span>
            </button>

            <div className="flex items-center gap-1.5 bg-slate-900 px-2.5 py-1.5 rounded-lg border border-slate-800">
              <span className="text-slate-400 font-bold">Fichas por folha A4:</span>
              <button
                type="button"
                onClick={() => setTicketsPerPage(1)}
                className={`px-2 py-0.5 rounded text-[11px] font-bold cursor-pointer ${
                  ticketsPerPage === 1 ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                1 por folha
              </button>
              <button
                type="button"
                onClick={() => setTicketsPerPage(2)}
                className={`px-2 py-0.5 rounded text-[11px] font-bold cursor-pointer ${
                  ticketsPerPage === 2 ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                2 por folha (Padrão)
              </button>
            </div>

            <span className="text-slate-400">
              Selecionadas: <strong className="text-amber-400 font-mono font-bold">{itemsToPrint.length}</strong> de{' '}
              <strong className="text-white font-mono">{items.length}</strong> peças
            </span>
          </div>

          <div className="relative w-full sm:w-56">
            <input
              type="text"
              placeholder="Filtrar por código ou peça..."
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg pl-2.5 pr-7 py-1 text-xs text-white focus:outline-hidden focus:border-blue-500"
            />
            {searchFilter && (
              <button
                type="button"
                onClick={() => setSearchFilter('')}
                className="absolute right-2 top-1 text-slate-400 hover:text-white text-xs cursor-pointer"
              >
                ✕
              </button>
            )}
          </div>
        </div>

        {/* Item Chips selector for fast individual picking */}
        <div className="pt-2 border-t border-slate-800/80 flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
          {items.map((it) => {
            const isSel = !!selectedItemIds[it.id];
            return (
              <button
                key={it.id}
                type="button"
                onClick={() => handleToggleItem(it.id)}
                className={`px-2 py-1 rounded-md text-[11px] font-mono font-bold transition-all cursor-pointer flex items-center gap-1 ${
                  isSel
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/50'
                    : 'bg-slate-900 text-slate-500 border border-slate-800 hover:text-slate-300'
                }`}
              >
                <span>{it.partCode}</span>
                <span className="text-[9px] opacity-70">({it.quantity})</span>
                {it.notes && <span className="text-amber-400">⚠️</span>}
              </button>
            );
          })}
        </div>
      </div>

      {/* Printable Sheet Viewport */}
      <div className="w-full max-w-5xl space-y-6 print:space-y-0 print:w-full print:max-w-none">
        {itemsToPrint.length === 0 ? (
          <div className="bg-[#091428] rounded-2xl border border-slate-800 p-12 text-center text-slate-400 text-sm">
            Nenhuma ficha selecionada para impressão. Marque as peças acima.
          </div>
        ) : (
          ticketPages.map((pageItems, pageIdx) => (
            <div
              key={pageIdx}
              className={`ticket-page bg-white p-4 print:p-2 rounded-2xl print:rounded-none shadow-2xl print:shadow-none border border-slate-800 print:border-none print:break-after-page ${
                ticketsPerPage === 2
                  ? 'grid grid-cols-1 md:grid-cols-2 print:grid-cols-2 gap-4 print:gap-2'
                  : 'flex flex-col gap-4'
              }`}
              style={{ minHeight: 'auto' }}
            >
              {pageItems.map((item) => {
                const specs = getTicketSpecs(item);

                return (
                  <div
                    key={item.id}
                    className="ticket-card bg-[#e3efe8] print:bg-white border-2 border-[#163a5f] text-[#102a45] rounded-md shadow-md print:shadow-none overflow-hidden break-inside-avoid flex flex-col justify-between"
                  >
                    {/* Header Box: MultiLinea Logo + Title + Distinct Assistência Badge */}
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
                          <h3 className="text-xs sm:text-sm print:text-[10px] font-black tracking-wide uppercase text-[#163a5f] leading-tight">
                            FICHA DE IDENTIFICAÇÃO DE PEÇAS
                          </h3>
                        </div>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className="px-2 py-0.5 rounded bg-amber-600 text-white font-black text-[9px] print:text-[7.5px] uppercase tracking-wider leading-none shadow-2xs">
                            🛠️ ASSISTÊNCIA TÉCNICA
                          </span>
                          <span className="px-1.5 py-0.5 rounded bg-[#163a5f] text-amber-300 font-mono font-black text-[9px] print:text-[7.5px] tracking-wider leading-none">
                            ID: {specs.uniqueTicketCode}
                          </span>
                        </div>
                        <span className="text-[9.5px] print:text-[8px] font-mono font-bold text-slate-700 leading-tight mt-0.5">
                          Plano Mestre: <strong className="text-black">{planNumber}</strong> · Emissão: {planDate}
                        </span>
                      </div>
                    </div>

                    {/* Pre-filled Ticket Fields */}
                    <div className="text-xs divide-y border-b-2 border-[#163a5f] divide-[#163a5f]">
                      {/* Row 1: Produto + Lote de Assistência */}
                      <div className="grid grid-cols-12">
                        <div className="col-span-8 p-2 print:py-0.5 print:px-1.5 border-r border-[#163a5f] flex items-baseline gap-1">
                          <span className="font-bold text-[11px] print:text-[8.5px] text-[#163a5f] shrink-0">
                            Produto:
                          </span>
                          <span className="font-extrabold text-xs sm:text-sm print:text-[9.5px] text-slate-950 truncate">
                            {item.productName}
                          </span>
                        </div>
                        <div className="col-span-4 p-2 print:py-0.5 print:px-1.5 flex items-baseline gap-1">
                          <span className="font-bold text-[11px] print:text-[8.5px] text-[#163a5f] shrink-0">
                            Lote:
                          </span>
                          <span className="font-mono font-black text-sm sm:text-base print:text-[11px] text-red-900">
                            AST-{planNumber}
                          </span>
                        </div>
                      </div>

                      {/* Row 2: Quantidade Solicitada + Prazo de Entrega */}
                      <div className="grid grid-cols-12">
                        <div className="col-span-4 p-2 print:py-0.5 print:px-1.5 border-r border-[#163a5f] flex flex-col justify-center bg-amber-50/70 print:bg-white">
                          <span className="font-bold text-[10px] print:text-[7.5px] uppercase tracking-tight text-[#163a5f] leading-none">
                            Qtd Assistência:
                          </span>
                          <div className="flex items-baseline gap-1 mt-0.5 print:mt-0">
                            <span className="font-mono font-black text-sm sm:text-base print:text-[11px] text-slate-950 leading-tight">
                              {item.quantity}
                            </span>
                            <span className="text-[10px] print:text-[7.5px] font-bold text-amber-900">
                              peças
                            </span>
                          </div>
                        </div>
                        <div className="col-span-4 p-2 print:py-0.5 print:px-1.5 border-r border-[#163a5f] flex flex-col justify-center">
                          <span className="font-bold text-[10px] print:text-[7.5px] uppercase tracking-tight text-[#163a5f] leading-none">
                            Prazo Entrega:
                          </span>
                          <div className="flex items-baseline gap-1 mt-0.5 print:mt-0">
                            <span className="font-mono font-black text-xs sm:text-sm print:text-[10px] text-slate-950 leading-tight">
                              {item.deliveryDeadline || 'ATÉ 06/11'}
                            </span>
                          </div>
                        </div>
                        <div className="col-span-4 p-2 print:py-0.5 print:px-1.5 flex flex-col justify-center">
                          <span className="font-bold text-[10px] print:text-[7.5px] uppercase tracking-tight text-[#163a5f] leading-none">
                            Faturamento / NF:
                          </span>
                          <div className="flex items-baseline gap-1 mt-0.5 print:mt-0 truncate">
                            <span className="font-mono font-bold text-[11px] print:text-[8px] text-blue-900 truncate">
                              {item.invoiceNotes || 'Pendente'}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Row 3: Cod. + Peça */}
                      <div className="grid grid-cols-12 bg-[#d7e8de]/70 print:bg-slate-50">
                        <div className="col-span-4 p-2 print:py-0.5 print:px-1.5 border-r border-[#163a5f] flex items-baseline gap-1">
                          <span className="font-bold text-[11px] print:text-[8.5px] text-[#163a5f]">Cod.:</span>
                          <span className="font-mono font-black text-sm sm:text-base print:text-[11px] text-[#081530]">
                            {item.partCode}
                          </span>
                        </div>
                        <div className="col-span-8 p-2 print:py-0.5 print:px-1.5 flex items-baseline gap-1.5 flex-wrap">
                          <span className="font-bold text-[11px] print:text-[8.5px] text-[#163a5f] shrink-0">
                            Peça:
                          </span>
                          <span className="font-black text-xs sm:text-sm print:text-[10px] text-slate-950 truncate">
                            {item.partName}
                          </span>
                        </div>
                      </div>

                      {/* Row 4: Special Warning Banner if OBS exists (ex: SEM FURAR) */}
                      {item.notes && item.notes.trim() && (
                        <div className="p-2 print:py-0.5 print:px-1.5 bg-amber-200/90 print:bg-amber-100 flex items-center gap-2">
                          <AlertTriangle className="w-4 h-4 text-amber-900 shrink-0" />
                          <div className="text-[11px] print:text-[8.5px] font-black text-amber-950 uppercase tracking-tight">
                            ATENÇÃO OPERADOR: {item.notes}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* QR-CODE BOX WITH INSTANT SCANNING PAYLOAD */}
                    <div className="p-2.5 print:py-1 print:px-1.5 bg-white border-b-2 border-[#163a5f] flex flex-row items-center justify-between gap-2">
                      <div className="text-[11px] print:text-[8px] leading-snug print:leading-tight text-slate-700 space-y-1 print:space-y-0 flex-1">
                        <div className="font-extrabold uppercase text-[#081530] flex items-center gap-1.5">
                          <QrCode className="w-4 h-4 print:w-3 print:h-3 text-[#163a5f]" />
                          <span>QR-CODE DE APONTAMENTO (BIPAGEM ÚNICA):</span>
                        </div>
                        <div className="inline-flex items-center gap-1 font-mono text-[10px] print:text-[7.5px] font-bold text-blue-900 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-200">
                          <span>Assistência:</span>
                          <span className="font-black text-amber-900">{specs.uniqueTicketCode}</span>
                          <span>({item.quantity} pçs)</span>
                        </div>
                        <div className="font-mono text-[10px] print:text-[8px]">
                          • 1. Corte:{' '}
                          <strong>
                            {specs.m2 > 0 ? `${specs.m2} m²/pç (Total: ${specs.totalM2} m²)` : 'Dimensões do PA'}
                          </strong>
                        </div>
                        <div className="font-mono text-[10px] print:text-[8px]">
                          • 2. Coladeira:{' '}
                          {specs.linM > 0 ? (
                            <strong>
                              {specs.linM} m/pç ({specs.edgeConfig}) (Total: {specs.totalLinM} m lin.)
                            </strong>
                          ) : (
                            <strong className="text-slate-600">Conforme Peça de Linha</strong>
                          )}
                        </div>
                        <div className="font-mono text-[10px] print:text-[8px]">
                          • 3. Furadeira:{' '}
                          {specs.isSemFurar ? (
                            <strong className="text-red-700 bg-red-100 px-1 rounded">
                              🚫 NÃO FURAR (CONFORME OBS)
                            </strong>
                          ) : (
                            <strong>{item.quantity} pçs</strong>
                          )}{' '}
                          · 4. UV:{' '}
                          {specs.uvM2 > 0 ? <strong>{specs.uvM2} m²/pç</strong> : 'Conforme Peça'}
                        </div>
                      </div>

                      {/* QR Code Graphic Box */}
                      <div className="inline-flex flex-col items-center bg-white p-1.5 print:p-1 rounded-md border-2 border-[#163a5f] shadow-2xs shrink-0">
                        <QRCodeSVG
                          value={specs.barcodeValue}
                          size={70}
                          level="M"
                          bgColor="#ffffff"
                          fgColor="#000000"
                          className="print:w-[48px] print:h-[48px]"
                        />
                        <span className="font-mono text-[8px] print:text-[7px] font-black text-slate-950 mt-0.5 text-center max-w-[120px] truncate">
                          {specs.uniqueTicketCode}
                        </span>
                        <span className="text-[7px] print:text-[6px] font-bold text-amber-800 uppercase mt-0.5">
                          Assistência Técnica
                        </span>
                      </div>
                    </div>

                    {/* Official Sectors Checklist Table */}
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
                        {OFFICIAL_ASSISTANCE_TICKET_SECTORS.map((secName, idx) => {
                          const isSeccionadora = idx === 0;
                          const isFuradeira = secName.includes('FURAD');
                          const isObsSemFurar = specs.isSemFurar && isFuradeira;

                          return (
                            <tr
                              key={secName}
                              className={`border-b border-[#163a5f]/40 ${
                                isObsSemFurar ? 'bg-red-50/80 font-bold' : ''
                              }`}
                            >
                              <td className="py-0.5 px-2 print:py-0.2 print:px-1 border-r border-[#163a5f]/40 font-bold text-[#163a5f] truncate">
                                {secName}
                              </td>
                              <td className="py-0.5 px-1.5 print:py-0.2 print:px-0.5 text-center border-r border-[#163a5f]/40 font-mono font-bold text-slate-900">
                                {isObsSemFurar ? '0' : isSeccionadora ? item.quantity : ''}
                              </td>
                              <td className="py-0.5 px-1.5 print:py-0.2 print:px-0.5 text-center border-r border-[#163a5f]/40 font-mono text-[9px] text-slate-700">
                                {isObsSemFurar ? 'N/A' : ''}
                              </td>
                              <td className="py-0.5 px-2 print:py-0.2 print:px-1 text-slate-800 text-[10px] print:text-[7.5px] truncate">
                                {isObsSemFurar ? (
                                  <span className="text-red-700 font-black">NÃO FURAR</span>
                                ) : isSeccionadora ? (
                                  `Corte p/ Assistência ${planNumber}`
                                ) : (
                                  ''
                                )}
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
          ))
        )}
      </div>
    </div>,
    document.body
  );
};
