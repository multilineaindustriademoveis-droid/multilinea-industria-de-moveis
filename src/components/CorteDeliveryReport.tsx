import React, { useState, useMemo } from 'react';
import {
  Calendar,
  Download,
  Printer,
  Search,
  Filter,
  Scissors,
  BarChart3,
  PieChart,
  Layers,
  ChevronDown,
  ChevronUp,
  FileSpreadsheet,
  FileText,
  Sparkles,
  ArrowLeft,
  CheckCircle2,
  Clock,
  Cpu,
  RefreshCw,
  Box,
  TrendingUp,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import {
  ProductionLog,
  CatalogPart,
  FactorySettings,
  ProductionOrder,
  Machine,
  ShiftId,
  isFundoPiece,
  extractThicknessMm,
} from '../types';

interface CorteDeliveryReportProps {
  logs: ProductionLog[];
  catalogParts: CatalogPart[];
  factorySettings: FactorySettings | null;
  productionOrders?: ProductionOrder[];
  machines?: Machine[];
  onBackToDashboard?: () => void;
}

type PeriodPreset =
  | 'TODAY'
  | 'YESTERDAY'
  | 'LAST_7'
  | 'LAST_15'
  | 'LAST_30'
  | 'THIS_MONTH'
  | 'LAST_MONTH'
  | 'CUSTOM';

interface DailyCorteSummary {
  dateStr: string; // YYYY-MM-DD
  dateObj: Date;
  formattedDate: string; // DD/MM/YYYY
  dayOfWeek: string;
  totalPieces: number;
  piecesMdf: number;
  piecesFundo: number;
  totalM2: number;
  m2Mdf: number;
  m2Fundo: number;
  gibenM2: number;
  selcoM2: number;
  logs: ProductionLog[];
}

export const CorteDeliveryReport: React.FC<CorteDeliveryReportProps> = ({
  logs,
  catalogParts,
  factorySettings,
  productionOrders = [],
  machines = [],
  onBackToDashboard,
}) => {
  // Preset or Custom dates
  const [periodPreset, setPeriodPreset] = useState<PeriodPreset>('LAST_7');

  // Custom date range state (defaults to last 7 days)
  const today = new Date();
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(today.getDate() - 6);

  const formatInputDate = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  const [customStart, setCustomStart] = useState<string>(formatInputDate(sevenDaysAgo));
  const [customEnd, setCustomEnd] = useState<string>(formatInputDate(today));

  // Filters
  const [machineFilter, setMachineFilter] = useState<string>('ALL');
  const [shiftFilter, setShiftFilter] = useState<string>('ALL');
  const [materialFilter, setMaterialFilter] = useState<'ALL' | 'MDF' | 'FUNDO'>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Expandable table rows
  const [expandedDays, setExpandedDays] = useState<Record<string, boolean>>({});

  // Active chart tab (M² vs Peças)
  const [chartView, setChartView] = useState<'M2' | 'PIECES'>('M2');

  // Targets from settings
  const targetMdfDaily = factorySettings?.targetCorteMdfM2 ?? 1350;
  const targetFundoDaily = factorySettings?.targetCorteFundoM2 ?? 450;
  const targetTotalDaily = factorySettings?.targetCorteM2 ?? 1800;

  // Catalog fast lookup maps
  const catalogByCode = useMemo(() => {
    const map = new Map<string, CatalogPart>();
    catalogParts.forEach((cp) => {
      if (cp.partCode) {
        map.set(cp.partCode.trim().toUpperCase(), cp);
      }
    });
    return map;
  }, [catalogParts]);

  const catalogByPaAndCode = useMemo(() => {
    const map = new Map<string, CatalogPart>();
    catalogParts.forEach((cp) => {
      const pa = (cp.paCode || '').trim().toUpperCase();
      const code = (cp.partCode || '').trim().toUpperCase();
      if (pa && code) {
        map.set(`${pa}:::${code}`, cp);
      }
    });
    return map;
  }, [catalogParts]);

  const ordersByBatch = useMemo(() => {
    const map = new Map<string, ProductionOrder>();
    productionOrders.forEach((o) => {
      if (o.batchNumber) {
        map.set(o.batchNumber.trim().toUpperCase(), o);
      }
    });
    return map;
  }, [productionOrders]);

  // Resolver for canonical log date
  const getLogDate = (log: ProductionLog): Date => {
    if (log.createdAt && typeof (log.createdAt as any).toDate === 'function') {
      return (log.createdAt as any).toDate();
    }
    if (log.createdAt && typeof (log.createdAt as any).seconds === 'number') {
      return new Date((log.createdAt as any).seconds * 1000);
    }
    if (log.createdAt) {
      const d = new Date(log.createdAt as any);
      if (!isNaN(d.getTime())) return d;
    }
    return new Date();
  };

  // Helper to check if piece is Fundo
  const checkIsFundo = (log: ProductionLog): boolean => {
    const cleanPart = (log.partCode || '').trim().toUpperCase();
    const cleanPa = (log.paCode || '').trim().toUpperCase();
    const part =
      (cleanPa ? catalogByPaAndCode.get(`${cleanPa}:::${cleanPart}`) : null) ||
      catalogByCode.get(cleanPart);
    return isFundoPiece(log.partName, log.partCode, part);
  };

  // Helper to calculate exact m2
  const getLogM2 = (log: ProductionLog): number => {
    const cleanPart = (log.partCode || '').trim().toUpperCase();
    if (cleanPart === '402943') {
      return Number((log.quantityGood * 0.335).toFixed(2));
    }
    if (cleanPart === '402999') {
      return Number((log.quantityGood * 0.39).toFixed(2));
    }

    const cleanPa = (log.paCode || '').trim().toUpperCase();
    const part =
      (cleanPa ? catalogByPaAndCode.get(`${cleanPa}:::${cleanPart}`) : null) ||
      catalogByCode.get(cleanPart);

    if (part) {
      const pQty = Math.max(1, Math.round(part.piecesPerProduct || 1));
      let cutM2 = part.squareMeters || 0;
      if (pQty > 1 && cutM2 > 0.8) {
        cutM2 = Number((cutM2 / pQty).toFixed(4));
      }
      return Number((log.quantityGood * cutM2).toFixed(2));
    }

    const dimMatch = (log.partName + ' ' + (log.notes || '')).match(
      /(\d{2,4})\s*[xX*×]\s*(\d{2,4})/
    );
    if (dimMatch) {
      const d1 = parseFloat(dimMatch[1]);
      const d2 = parseFloat(dimMatch[2]);
      if (d1 > 0 && d2 > 0) {
        const pieceM2 = (d1 * d2) / 1000000;
        return Number((log.quantityGood * pieceM2).toFixed(2));
      }
    }

    if (
      typeof log.measuredAmount === 'number' &&
      log.measuredAmount > 0 &&
      (log.measuredAmount !== log.quantityGood || log.quantityGood <= 1)
    ) {
      return Number(log.measuredAmount.toFixed(2));
    }

    return 0;
  };

  // Determine current active date boundary
  const { startDate, endDate, periodLabel } = useMemo(() => {
    const now = new Date();
    let start = new Date(now);
    let end = new Date(now);
    let label = '';

    switch (periodPreset) {
      case 'TODAY':
        start.setHours(0, 0, 0, 0);
        end.setHours(23, 59, 59, 999);
        label = `Hoje (${start.toLocaleDateString('pt-BR')})`;
        break;
      case 'YESTERDAY':
        start.setDate(now.getDate() - 1);
        start.setHours(0, 0, 0, 0);
        end.setDate(now.getDate() - 1);
        end.setHours(23, 59, 59, 999);
        label = `Ontem (${start.toLocaleDateString('pt-BR')})`;
        break;
      case 'LAST_7':
        start.setDate(now.getDate() - 6);
        start.setHours(0, 0, 0, 0);
        end.setHours(23, 59, 59, 999);
        label = `Últimos 7 Dias (${start.toLocaleDateString('pt-BR')} a ${end.toLocaleDateString('pt-BR')})`;
        break;
      case 'LAST_15':
        start.setDate(now.getDate() - 14);
        start.setHours(0, 0, 0, 0);
        end.setHours(23, 59, 59, 999);
        label = `Últimos 15 Dias (${start.toLocaleDateString('pt-BR')} a ${end.toLocaleDateString('pt-BR')})`;
        break;
      case 'LAST_30':
        start.setDate(now.getDate() - 29);
        start.setHours(0, 0, 0, 0);
        end.setHours(23, 59, 59, 999);
        label = `Últimos 30 Dias (${start.toLocaleDateString('pt-BR')} a ${end.toLocaleDateString('pt-BR')})`;
        break;
      case 'THIS_MONTH':
        start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
        end.setHours(23, 59, 59, 999);
        label = `Este Mês (${start.toLocaleDateString('pt-BR')} a ${end.toLocaleDateString('pt-BR')})`;
        break;
      case 'LAST_MONTH':
        start = new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0, 0, 0);
        end = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
        label = `Mês Anterior (${start.toLocaleDateString('pt-BR')} a ${end.toLocaleDateString('pt-BR')})`;
        break;
      case 'CUSTOM':
      default: {
        const [sy, sm, sd] = (customStart || formatInputDate(sevenDaysAgo)).split('-').map(Number);
        const [ey, em, ed] = (customEnd || formatInputDate(now)).split('-').map(Number);
        start = new Date(sy, sm - 1, sd, 0, 0, 0, 0);
        end = new Date(ey, em - 1, ed, 23, 59, 59, 999);
        label = `Período Customizado (${start.toLocaleDateString('pt-BR')} a ${end.toLocaleDateString('pt-BR')})`;
        break;
      }
    }

    return { startDate: start, endDate: end, periodLabel: label };
  }, [periodPreset, customStart, customEnd]);

  // Filter cutting logs within range and with applied filters
  const { filteredLogs, corteLogsInRange } = useMemo(() => {
    // 1. All cutting logs in date range
    const inRange = logs.filter((log) => {
      if (log.sector !== 'SECCIONADORA') return false;
      const d = getLogDate(log);
      return d >= startDate && d <= endDate;
    });

    // 2. Filter by machine, shift, material, search query
    const filtered = inRange.filter((log) => {
      // Machine filter
      if (machineFilter !== 'ALL') {
        const machId = (log.machineId || '').toUpperCase();
        if (machineFilter === 'GIBEN' && !machId.includes('GIBEN')) return false;
        if (machineFilter === 'SELCO' && !machId.includes('SELCO')) return false;
        if (machineFilter !== 'GIBEN' && machineFilter !== 'SELCO' && log.machineId !== machineFilter) {
          return false;
        }
      }

      // Shift filter
      if (shiftFilter !== 'ALL' && log.shift !== shiftFilter) {
        return false;
      }

      // Material filter
      const isFundo = checkIsFundo(log);
      if (materialFilter === 'MDF' && isFundo) return false;
      if (materialFilter === 'FUNDO' && !isFundo) return false;

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toUpperCase();
        const match =
          (log.partName || '').toUpperCase().includes(q) ||
          (log.partCode || '').toUpperCase().includes(q) ||
          (log.paCode || '').toUpperCase().includes(q) ||
          (log.batchNumber || '').toUpperCase().includes(q) ||
          (log.operatorName || '').toUpperCase().includes(q);
        if (!match) return false;
      }

      return true;
    });

    return { filteredLogs: filtered, corteLogsInRange: inRange };
  }, [logs, startDate, endDate, machineFilter, shiftFilter, materialFilter, searchQuery]);

  // Aggregate totals
  const totals = useMemo(() => {
    let piecesTotal = 0;
    let piecesMdf = 0;
    let piecesFundo = 0;
    let m2Total = 0;
    let m2Mdf = 0;
    let m2Fundo = 0;
    let gibenM2 = 0;
    let selcoM2 = 0;
    let gibenPieces = 0;
    let selcoPieces = 0;

    const shiftData: Record<string, { m2: number; pieces: number }> = {
      '1': { m2: 0, pieces: 0 },
      '2': { m2: 0, pieces: 0 },
      '3': { m2: 0, pieces: 0 },
      OUTROS: { m2: 0, pieces: 0 },
    };

    filteredLogs.forEach((log) => {
      const isFundo = checkIsFundo(log);
      const m2 = getLogM2(log);
      const pcs = log.quantityGood || 0;

      piecesTotal += pcs;
      m2Total += m2;

      if (isFundo) {
        piecesFundo += pcs;
        m2Fundo += m2;
      } else {
        piecesMdf += pcs;
        m2Mdf += m2;
      }

      const mach = (log.machineId || '').toUpperCase();
      if (mach.includes('GIBEN')) {
        gibenM2 += m2;
        gibenPieces += pcs;
      } else if (mach.includes('SELCO')) {
        selcoM2 += m2;
        selcoPieces += pcs;
      }

      const s = String(log.shift || '1');
      if (shiftData[s]) {
        shiftData[s].m2 += m2;
        shiftData[s].pieces += pcs;
      } else {
        shiftData['OUTROS'].m2 += m2;
        shiftData['OUTROS'].pieces += pcs;
      }
    });

    return {
      piecesTotal,
      piecesMdf,
      piecesFundo,
      m2Total: Number(m2Total.toFixed(2)),
      m2Mdf: Number(m2Mdf.toFixed(2)),
      m2Fundo: Number(m2Fundo.toFixed(2)),
      gibenM2: Number(gibenM2.toFixed(2)),
      selcoM2: Number(selcoM2.toFixed(2)),
      gibenPieces,
      selcoPieces,
      shiftData,
    };
  }, [filteredLogs]);

  // Aggregate daily summaries
  const dailySummaries: DailyCorteSummary[] = useMemo(() => {
    const dayMap = new Map<string, DailyCorteSummary>();

    // Generate continuous date range between startDate and endDate
    const cur = new Date(startDate);
    cur.setHours(0, 0, 0, 0);
    const endBoundary = new Date(endDate);
    endBoundary.setHours(23, 59, 59, 999);

    const weekdays = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

    while (cur <= endBoundary) {
      const y = cur.getFullYear();
      const m = String(cur.getMonth() + 1).padStart(2, '0');
      const d = String(cur.getDate()).padStart(2, '0');
      const dateKey = `${y}-${m}-${d}`;
      const dayOfWeek = weekdays[cur.getDay()];
      const formattedDate = `${d}/${m}/${y}`;

      dayMap.set(dateKey, {
        dateStr: dateKey,
        dateObj: new Date(cur),
        formattedDate,
        dayOfWeek,
        totalPieces: 0,
        piecesMdf: 0,
        piecesFundo: 0,
        totalM2: 0,
        m2Mdf: 0,
        m2Fundo: 0,
        gibenM2: 0,
        selcoM2: 0,
        logs: [],
      });

      cur.setDate(cur.getDate() + 1);
    }

    filteredLogs.forEach((log) => {
      const logDate = getLogDate(log);
      const y = logDate.getFullYear();
      const m = String(logDate.getMonth() + 1).padStart(2, '0');
      const d = String(logDate.getDate()).padStart(2, '0');
      const dateKey = `${y}-${m}-${d}`;

      let item = dayMap.get(dateKey);
      if (!item) {
        const weekdays = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
        item = {
          dateStr: dateKey,
          dateObj: new Date(logDate),
          formattedDate: `${d}/${m}/${y}`,
          dayOfWeek: weekdays[logDate.getDay()],
          totalPieces: 0,
          piecesMdf: 0,
          piecesFundo: 0,
          totalM2: 0,
          m2Mdf: 0,
          m2Fundo: 0,
          gibenM2: 0,
          selcoM2: 0,
          logs: [],
        };
        dayMap.set(dateKey, item);
      }

      const isFundo = checkIsFundo(log);
      const m2 = getLogM2(log);
      const pcs = log.quantityGood || 0;

      item.totalPieces += pcs;
      item.totalM2 += m2;
      item.logs.push(log);

      if (isFundo) {
        item.piecesFundo += pcs;
        item.m2Fundo += m2;
      } else {
        item.piecesMdf += pcs;
        item.m2Mdf += m2;
      }

      const mach = (log.machineId || '').toUpperCase();
      if (mach.includes('GIBEN')) item.gibenM2 += m2;
      if (mach.includes('SELCO')) item.selcoM2 += m2;
    });

    const list = Array.from(dayMap.values());
    list.sort((a, b) => a.dateStr.localeCompare(b.dateStr));

    // Round values
    list.forEach((item) => {
      item.totalM2 = Number(item.totalM2.toFixed(2));
      item.m2Mdf = Number(item.m2Mdf.toFixed(2));
      item.m2Fundo = Number(item.m2Fundo.toFixed(2));
      item.gibenM2 = Number(item.gibenM2.toFixed(2));
      item.selcoM2 = Number(item.selcoM2.toFixed(2));
    });

    return list;
  }, [startDate, endDate, filteredLogs]);

  // Working days count (days with production or total days)
  const daysWithProduction = dailySummaries.filter((d) => d.totalPieces > 0).length || 1;
  const totalDaysInPeriod = dailySummaries.length || 1;

  // Daily averages
  const avgM2PerDay = Number((totals.m2Total / daysWithProduction).toFixed(1));
  const avgMdfM2PerDay = Number((totals.m2Mdf / daysWithProduction).toFixed(1));
  const avgFundoM2PerDay = Number((totals.m2Fundo / daysWithProduction).toFixed(1));
  const avgPiecesPerDay = Math.round(totals.piecesTotal / daysWithProduction);

  // Attainment percentages
  const pctMdfAttainment = targetMdfDaily > 0 ? (avgMdfM2PerDay / targetMdfDaily) * 100 : 0;
  const pctFundoAttainment = targetFundoDaily > 0 ? (avgFundoM2PerDay / targetFundoDaily) * 100 : 0;
  const pctTotalAttainment = targetTotalDaily > 0 ? (avgM2PerDay / targetTotalDaily) * 100 : 0;

  // Chart max value calculation
  const maxDayM2 = Math.max(
    targetTotalDaily * 1.1,
    ...dailySummaries.map((d) => d.totalM2),
    500
  );

  const maxDayPieces = Math.max(
    ...dailySummaries.map((d) => d.totalPieces),
    100
  );

  // Toggle day row accordion
  const toggleDayExpand = (dateStr: string) => {
    setExpandedDays((prev) => ({
      ...prev,
      [dateStr]: !prev[dateStr],
    }));
  };

  // Export to Excel (.xlsx)
  const handleExportXLSX = () => {
    try {
      // Sheet 1: Resumo Diário
      const summaryRows = dailySummaries.map((d) => ({
        Data: d.formattedDate,
        Dia: d.dayOfWeek,
        'Total Peças': d.totalPieces,
        'Peças MDF': d.piecesMdf,
        'Peças Fundo': d.piecesFundo,
        'M² MDF': d.m2Mdf,
        'M² Fundo': d.m2Fundo,
        'M² Total': d.totalM2,
        'Giben M²': d.gibenM2,
        'Selco M²': d.selcoM2,
        'Meta MDF (m²)': targetMdfDaily,
        'Meta Fundo (m²)': targetFundoDaily,
        'Meta Total (m²)': targetTotalDaily,
        '% Atingimento Total': `${((d.totalM2 / targetTotalDaily) * 100).toFixed(1)}%`,
      }));

      // Sheet 1 Total row
      summaryRows.push({
        Data: 'TOTAL CONSOLIDADO',
        Dia: '-',
        'Total Peças': totals.piecesTotal,
        'Peças MDF': totals.piecesMdf,
        'Peças Fundo': totals.piecesFundo,
        'M² MDF': totals.m2Mdf,
        'M² Fundo': totals.m2Fundo,
        'M² Total': totals.m2Total,
        'Giben M²': totals.gibenM2,
        'Selco M²': totals.selcoM2,
        'Meta MDF (m²)': targetMdfDaily * daysWithProduction,
        'Meta Fundo (m²)': targetFundoDaily * daysWithProduction,
        'Meta Total (m²)': targetTotalDaily * daysWithProduction,
        '% Atingimento Total': `${pctTotalAttainment.toFixed(1)}%`,
      });

      // Sheet 2: Apontamentos Detalhados
      const detailedRows = filteredLogs.map((l) => {
        const lDate = getLogDate(l);
        const isFundo = checkIsFundo(l);
        const m2 = getLogM2(l);
        const cleanPa = (l.paCode || '').trim();
        const order = ordersByBatch.get((l.batchNumber || '').trim().toUpperCase());

        return {
          'Data / Hora': lDate.toLocaleString('pt-BR'),
          Data: lDate.toLocaleDateString('pt-BR'),
          Hora: lDate.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
          Máquina: l.machineId || 'Seccionadora',
          Turno: `${l.shift}º Turno`,
          'Produto (PA)': cleanPa || order?.productCode || '-',
          'Lote / OP': l.batchNumber || '-',
          'Código da Peça': l.partCode,
          'Nome da Peça': l.partName,
          'Tipo Material': isFundo ? 'FUNDO (2,8mm/3mm)' : 'MDF (Estrutural)',
          'Qtd Boas': l.quantityGood,
          'Qtd Refugo': l.quantityScrap || 0,
          'M² Unitário': l.quantityGood > 0 ? Number((m2 / l.quantityGood).toFixed(4)) : 0,
          'M² Total': m2,
          Operador: l.operatorName || '-',
          Observações: l.notes || '',
        };
      });

      const wb = XLSX.utils.book_new();
      const wsSummary = XLSX.utils.json_to_sheet(summaryRows);
      const wsDetailed = XLSX.utils.json_to_sheet(detailedRows);

      XLSX.utils.book_append_sheet(wb, wsSummary, 'Resumo Diário de Corte');
      XLSX.utils.book_append_sheet(wb, wsDetailed, 'Apontamentos Detalhados');

      const fileName = `Entrega_Corte_Multilinea_${formatInputDate(startDate)}_a_${formatInputDate(endDate)}.xlsx`;
      XLSX.writeFile(wb, fileName);
    } catch (err) {
      console.error('Erro ao exportar Excel:', err);
      alert('Erro ao gerar arquivo Excel. Tente novamente.');
    }
  };

  // Export to CSV
  const handleExportCSV = () => {
    try {
      const headers = [
        'Data',
        'Dia',
        'Pecas_Total',
        'Pecas_MDF',
        'Pecas_Fundo',
        'M2_MDF',
        'M2_Fundo',
        'M2_Total',
        'Giben_M2',
        'Selco_M2',
      ];
      const rows = dailySummaries.map((d) => [
        d.formattedDate,
        d.dayOfWeek,
        d.totalPieces,
        d.piecesMdf,
        d.piecesFundo,
        d.m2Mdf.toFixed(2).replace('.', ','),
        d.m2Fundo.toFixed(2).replace('.', ','),
        d.totalM2.toFixed(2).replace('.', ','),
        d.gibenM2.toFixed(2).replace('.', ','),
        d.selcoM2.toFixed(2).replace('.', ','),
      ]);

      const csvContent =
        '\uFEFF' +
        [headers.join(';'), ...rows.map((r) => r.join(';'))].join('\r\n');

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute(
        'download',
        `Entrega_Corte_${formatInputDate(startDate)}_a_${formatInputDate(endDate)}.csv`
      );
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      console.error('Erro ao exportar CSV:', err);
      alert('Erro ao exportar CSV.');
    }
  };

  // Print view
  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-6 pb-20 animate-fade-in print:p-0 print:space-y-4">
      {/* Top Header Card */}
      <div className="bg-gradient-to-r from-[#0a1836] via-[#0c2048] to-[#091428] rounded-2xl border border-slate-700/70 p-5 shadow-xl relative overflow-hidden">
        {/* Glow ambient background */}
        <div className="absolute -right-20 -top-20 w-80 h-80 bg-blue-600/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute right-60 -bottom-20 w-80 h-80 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start gap-4">
            {onBackToDashboard && (
              <button
                type="button"
                onClick={onBackToDashboard}
                className="mt-1 p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 transition-all cursor-pointer shadow-sm"
                title="Voltar ao Dashboard Geral"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
            )}

            <div>
              <div className="flex items-center gap-2.5">
                <span className="p-2 rounded-xl bg-blue-600/20 border border-blue-500/30 text-blue-400">
                  <Scissors className="w-6 h-6" />
                </span>
                <div>
                  <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight flex items-center gap-2">
                    Relatório & Extração de Entrega do Corte
                    <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/40 uppercase tracking-wider">
                      Seccionadoras
                    </span>
                  </h1>
                  <p className="text-xs sm:text-sm text-slate-400 mt-0.5">
                    Extração analítica e gráfica de peças cortadas, M² de MDF e M² de Fundo por período configurável.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Quick Export Actions */}
          <div className="flex items-center flex-wrap gap-2 print:hidden">
            <button
              type="button"
              onClick={handleExportXLSX}
              className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs sm:text-sm shadow-md flex items-center gap-2 cursor-pointer transition-all active:scale-95"
              title="Exportar planilha completa em Excel (.xlsx) com duas abas: resumo e apontamentos"
            >
              <FileSpreadsheet className="w-4 h-4 text-emerald-200" />
              <span>Exportar Excel (.xlsx)</span>
            </button>

            <button
              type="button"
              onClick={handleExportCSV}
              className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs sm:text-sm border border-slate-700 shadow-sm flex items-center gap-2 cursor-pointer transition-all active:scale-95"
              title="Exportar dados consolidados em CSV"
            >
              <FileText className="w-4 h-4 text-slate-400" />
              <span>CSV</span>
            </button>

            <button
              type="button"
              onClick={handlePrint}
              className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs sm:text-sm border border-slate-700 shadow-sm flex items-center gap-2 cursor-pointer transition-all active:scale-95"
              title="Imprimir relatório analítico"
            >
              <Printer className="w-4 h-4 text-amber-400" />
              <span className="hidden sm:inline">Imprimir / PDF</span>
            </button>
          </div>
        </div>
      </div>

      {/* Filter & Period Selector Bar */}
      <div className="bg-[#091428] rounded-2xl border border-slate-800 p-4 sm:p-5 shadow-lg space-y-4 print:hidden">
        {/* Row 1: Period Presets */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
              <Calendar className="w-4 h-4 text-amber-400" />
              Selecionar Período de Extração:
            </span>
            <span className="text-xs text-amber-400 font-semibold">{periodLabel}</span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-1.5">
            {[
              { id: 'TODAY', label: 'Hoje' },
              { id: 'YESTERDAY', label: 'Ontem' },
              { id: 'LAST_7', label: 'Últimos 7 Dias' },
              { id: 'LAST_15', label: 'Últimos 15 Dias' },
              { id: 'LAST_30', label: 'Últimos 30 Dias' },
              { id: 'THIS_MONTH', label: 'Este Mês' },
              { id: 'LAST_MONTH', label: 'Mês Anterior' },
              { id: 'CUSTOM', label: 'Personalizado' },
            ].map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setPeriodPreset(p.id as PeriodPreset)}
                className={`px-3 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer text-center ${
                  periodPreset === p.id
                    ? 'bg-blue-600 text-white shadow-md shadow-blue-900/50 border border-blue-400'
                    : 'bg-slate-900/80 hover:bg-slate-800 text-slate-300 border border-slate-800 hover:border-slate-700'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* Row 2: Custom Date Pickers (if CUSTOM) */}
        {periodPreset === 'CUSTOM' && (
          <div className="p-3.5 rounded-xl bg-slate-900/90 border border-blue-500/30 flex flex-wrap items-center gap-3 animate-fade-in">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-slate-300">De:</span>
              <input
                type="date"
                value={customStart}
                onChange={(e) => setCustomStart(e.target.value)}
                className="bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-hidden focus:border-blue-500"
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-slate-300">Até:</span>
              <input
                type="date"
                value={customEnd}
                onChange={(e) => setCustomEnd(e.target.value)}
                className="bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-hidden focus:border-blue-500"
              />
            </div>
            <span className="text-[11px] text-slate-400 ml-auto">
              Selecione o intervalo de datas exato para filtrar todos os apontamentos de corte.
            </span>
          </div>
        )}

        {/* Row 3: Secondary Filters (Machine, Shift, Material, Search) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-2 border-t border-slate-800/80">
          {/* Machine Filter */}
          <div>
            <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1 flex items-center gap-1">
              <Cpu className="w-3.5 h-3.5 text-slate-400" />
              Máquina:
            </label>
            <select
              value={machineFilter}
              onChange={(e) => setMachineFilter(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-hidden focus:border-blue-500 font-medium"
            >
              <option value="ALL">Todas as Seccionadoras</option>
              <option value="GIBEN">Giben SP 100</option>
              <option value="SELCO">Selco WN 600</option>
              {machines
                .filter((m) => m.sector === 'SECCIONADORA' && !m.id.includes('GIBEN') && !m.id.includes('SELCO'))
                .map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
            </select>
          </div>

          {/* Shift Filter */}
          <div>
            <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1 flex items-center gap-1">
              <Clock className="w-3.5 h-3.5 text-slate-400" />
              Turno:
            </label>
            <select
              value={shiftFilter}
              onChange={(e) => setShiftFilter(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-hidden focus:border-blue-500 font-medium"
            >
              <option value="ALL">Todos os Turnos</option>
              <option value="1">1º Turno</option>
              <option value="2">2º Turno</option>
              <option value="3">3º Turno</option>
            </select>
          </div>

          {/* Material Filter */}
          <div>
            <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1 flex items-center gap-1">
              <Box className="w-3.5 h-3.5 text-slate-400" />
              Material de Corte:
            </label>
            <select
              value={materialFilter}
              onChange={(e) => setMaterialFilter(e.target.value as any)}
              className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-hidden focus:border-blue-500 font-medium"
            >
              <option value="ALL">Todos (MDF + Fundo)</option>
              <option value="MDF">Apenas MDF (Estrutural)</option>
              <option value="FUNDO">Apenas Fundo (2,8mm/3mm)</option>
            </select>
          </div>

          {/* Search Input */}
          <div>
            <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1 flex items-center gap-1">
              <Search className="w-3.5 h-3.5 text-slate-400" />
              Busca por Peça / PA / Lote:
            </label>
            <div className="relative">
              <input
                type="text"
                placeholder="Ex: 402943, Lateral, Lote..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-xl pl-3 pr-8 py-2 text-xs text-white focus:outline-hidden focus:border-blue-500 font-medium placeholder-slate-500"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-2.5 text-slate-400 hover:text-white text-xs cursor-pointer"
                >
                  ✕
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* KPI Hero Cards: Total M², MDF M², Fundo M², Peças Totais */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Total Geral de Corte */}
        <div className="bg-[#091428] rounded-2xl border border-blue-500/30 p-4 shadow-lg relative overflow-hidden flex flex-col justify-between">
          <div className="flex items-start justify-between">
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-blue-400 flex items-center gap-1.5">
                <Scissors className="w-4 h-4 text-blue-400" />
                Total Geral Cortado
              </span>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-3xl font-black text-white tracking-tight font-mono">
                  {totals.m2Total.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
                </span>
                <span className="text-sm font-bold text-blue-300">m²</span>
              </div>
            </div>
            <div className="text-right">
              <span className="text-[10px] uppercase font-bold text-slate-400 block">Peças</span>
              <span className="text-xl font-black text-slate-200 font-mono">
                {totals.piecesTotal.toLocaleString('pt-BR')}
              </span>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs">
            <span className="text-slate-400">
              Média diária:{' '}
              <strong className="text-white font-mono font-bold">
                {avgM2PerDay.toLocaleString('pt-BR')} m²/dia
              </strong>
            </span>
            <span
              className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                pctTotalAttainment >= 100
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                  : pctTotalAttainment >= 75
                  ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                  : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
              }`}
            >
              {pctTotalAttainment.toFixed(1)}% da Meta
            </span>
          </div>
        </div>

        {/* Card 2: Corte de MDF */}
        <div className="bg-[#091428] rounded-2xl border border-sky-500/40 p-4 shadow-lg relative overflow-hidden flex flex-col justify-between">
          <div className="flex items-start justify-between">
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-sky-400 flex items-center gap-1.5">
                <Box className="w-4 h-4 text-sky-400" />
                Corte MDF (Estrutural)
              </span>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-3xl font-black text-white tracking-tight font-mono">
                  {totals.m2Mdf.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
                </span>
                <span className="text-sm font-bold text-sky-300">m²</span>
              </div>
            </div>
            <div className="text-right">
              <span className="text-[10px] uppercase font-bold text-slate-400 block">Peças MDF</span>
              <span className="text-xl font-black text-sky-300 font-mono">
                {totals.piecesMdf.toLocaleString('pt-BR')}
              </span>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs">
            <span className="text-slate-400">
              Meta diária: <strong className="text-sky-300 font-mono">{targetMdfDaily} m²</strong>
            </span>
            <span
              className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                pctMdfAttainment >= 100
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                  : pctMdfAttainment >= 75
                  ? 'bg-sky-500/20 text-sky-300 border border-sky-500/30'
                  : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
              }`}
            >
              {pctMdfAttainment.toFixed(1)}% Ating.
            </span>
          </div>
        </div>

        {/* Card 3: Corte de Fundo */}
        <div className="bg-[#091428] rounded-2xl border border-amber-500/40 p-4 shadow-lg relative overflow-hidden flex flex-col justify-between">
          <div className="flex items-start justify-between">
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
                <Layers className="w-4 h-4 text-amber-400" />
                Corte Fundo (2,8mm / 3mm)
              </span>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-3xl font-black text-white tracking-tight font-mono">
                  {totals.m2Fundo.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
                </span>
                <span className="text-sm font-bold text-amber-300">m²</span>
              </div>
            </div>
            <div className="text-right">
              <span className="text-[10px] uppercase font-bold text-slate-400 block">Peças Fundo</span>
              <span className="text-xl font-black text-amber-300 font-mono">
                {totals.piecesFundo.toLocaleString('pt-BR')}
              </span>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs">
            <span className="text-slate-400">
              Meta diária: <strong className="text-amber-300 font-mono">{targetFundoDaily} m²</strong>
            </span>
            <span
              className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                pctFundoAttainment >= 100
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                  : pctFundoAttainment >= 75
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                  : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
              }`}
            >
              {pctFundoAttainment.toFixed(1)}% Ating.
            </span>
          </div>
        </div>

        {/* Card 4: Mix de Materiais & Máquinas */}
        <div className="bg-[#091428] rounded-2xl border border-slate-800 p-4 shadow-lg relative overflow-hidden flex flex-col justify-between">
          <div>
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
              <PieChart className="w-4 h-4 text-emerald-400" />
              Mix de Materiais & Máquinas
            </span>

            {/* Proportion Bar */}
            <div className="mt-3">
              <div className="flex items-center justify-between text-[11px] font-bold mb-1">
                <span className="text-sky-400">
                  MDF: {totals.m2Total > 0 ? ((totals.m2Mdf / totals.m2Total) * 100).toFixed(1) : 0}%
                </span>
                <span className="text-amber-400">
                  Fundo: {totals.m2Total > 0 ? ((totals.m2Fundo / totals.m2Total) * 100).toFixed(1) : 0}%
                </span>
              </div>
              <div className="h-2.5 w-full bg-slate-950 rounded-full overflow-hidden flex">
                <div
                  style={{ width: `${totals.m2Total > 0 ? (totals.m2Mdf / totals.m2Total) * 100 : 50}%` }}
                  className="bg-sky-500 h-full"
                  title="MDF"
                />
                <div
                  style={{ width: `${totals.m2Total > 0 ? (totals.m2Fundo / totals.m2Total) * 100 : 50}%` }}
                  className="bg-amber-500 h-full"
                  title="Fundo"
                />
              </div>
            </div>
          </div>

          <div className="mt-3 pt-2 border-t border-slate-800/80 grid grid-cols-2 gap-2 text-xs">
            <div>
              <span className="text-[10px] text-slate-400 block font-bold">Giben SP 100</span>
              <strong className="text-slate-200 font-mono font-bold">
                {totals.gibenM2.toLocaleString('pt-BR')} m²
              </strong>
            </div>
            <div>
              <span className="text-[10px] text-slate-400 block font-bold">Selco WN 600</span>
              <strong className="text-slate-200 font-mono font-bold">
                {totals.selcoM2.toLocaleString('pt-BR')} m²
              </strong>
            </div>
          </div>
        </div>
      </div>

      {/* Main Interactive Charts Section */}
      <div className="bg-[#091428] rounded-2xl border border-slate-800 p-5 shadow-lg space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800">
          <div>
            <h2 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-blue-400" />
              Evolução Diária da Entrega de Corte
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Comparativo dia a dia com divisão de MDF, Fundo e linha de meta diária ({targetTotalDaily.toLocaleString('pt-BR')} m²).
            </p>
          </div>

          {/* Toggle between M² and Pieces */}
          <div className="flex items-center gap-1 bg-slate-900 p-1 rounded-xl border border-slate-800">
            <button
              type="button"
              onClick={() => setChartView('M2')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                chartView === 'M2'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <span>Metros Quadrados (M²)</span>
            </button>
            <button
              type="button"
              onClick={() => setChartView('PIECES')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                chartView === 'PIECES'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <span>Quantidade de Peças</span>
            </button>
          </div>
        </div>

        {/* Legend */}
        <div className="flex flex-wrap items-center gap-4 text-xs font-medium text-slate-300">
          <div className="flex items-center gap-2">
            <div className="w-3.5 h-3.5 rounded bg-sky-500" />
            <span>MDF (Estrutural)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3.5 h-3.5 rounded bg-amber-500" />
            <span>Fundo (2,8mm / 3mm)</span>
          </div>
          {chartView === 'M2' && (
            <div className="flex items-center gap-2">
              <div className="w-4 h-0.5 bg-rose-500 border-t border-dashed border-rose-400" />
              <span className="text-rose-400 font-bold">Meta Diária Geral ({targetTotalDaily} m²)</span>
            </div>
          )}
        </div>

        {/* Responsive Daily Bar Chart (SVG) */}
        <div className="w-full overflow-x-auto pt-4 pb-2">
          <div className="min-w-[640px] h-72 relative">
            {dailySummaries.length === 0 ? (
              <div className="h-full flex items-center justify-center text-slate-500 text-xs">
                Nenhum apontamento de corte encontrado no período selecionado.
              </div>
            ) : (
              <svg className="w-full h-full" viewBox={`0 0 ${Math.max(640, dailySummaries.length * 64)} 260`}>
                <defs>
                  <linearGradient id="mdfGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#38bdf8" />
                    <stop offset="100%" stopColor="#0284c7" />
                  </linearGradient>
                  <linearGradient id="fundoGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#fbbf24" />
                    <stop offset="100%" stopColor="#d97706" />
                  </linearGradient>
                </defs>

                {/* Y-Axis Gridlines */}
                {[0.25, 0.5, 0.75, 1.0].map((frac, idx) => {
                  const y = 200 - 180 * frac;
                  const labelVal =
                    chartView === 'M2'
                      ? Math.round(maxDayM2 * frac)
                      : Math.round(maxDayPieces * frac);
                  return (
                    <g key={idx}>
                      <line
                        x1="45"
                        y1={y}
                        x2={Math.max(640, dailySummaries.length * 64) - 20}
                        y2={y}
                        stroke="#1e293b"
                        strokeDasharray="4 4"
                      />
                      <text
                        x="40"
                        y={y + 4}
                        fill="#64748b"
                        fontSize="10"
                        textAnchor="end"
                        fontWeight="600"
                        fontFamily="monospace"
                      >
                        {labelVal}
                      </text>
                    </g>
                  );
                })}

                {/* Daily Target Reference Line (for M²) */}
                {chartView === 'M2' && targetTotalDaily > 0 && maxDayM2 > 0 && (
                  <g>
                    {(() => {
                      const targetY = 200 - 180 * (targetTotalDaily / maxDayM2);
                      return (
                        <>
                          <line
                            x1="45"
                            y1={targetY}
                            x2={Math.max(640, dailySummaries.length * 64) - 20}
                            y2={targetY}
                            stroke="#f43f5e"
                            strokeWidth="2"
                            strokeDasharray="6 4"
                          />
                          <text
                            x={Math.max(640, dailySummaries.length * 64) - 25}
                            y={targetY - 5}
                            fill="#f43f5e"
                            fontSize="10"
                            fontWeight="bold"
                            textAnchor="end"
                          >
                            Meta: {targetTotalDaily} m²
                          </text>
                        </>
                      );
                    })()}
                  </g>
                )}

                {/* Daily Bars */}
                {dailySummaries.map((day, idx) => {
                  const totalSvgWidth = Math.max(640, dailySummaries.length * 64);
                  const availableWidth = totalSvgWidth - 70;
                  const colWidth = availableWidth / dailySummaries.length;
                  const barWidth = Math.min(36, Math.max(16, colWidth * 0.65));
                  const x = 55 + idx * colWidth + (colWidth - barWidth) / 2;

                  if (chartView === 'M2') {
                    const totalVal = day.totalM2;
                    const mdfVal = day.m2Mdf;
                    const fundoVal = day.m2Fundo;

                    const totalHeight = maxDayM2 > 0 ? (totalVal / maxDayM2) * 180 : 0;
                    const mdfHeight = maxDayM2 > 0 ? (mdfVal / maxDayM2) * 180 : 0;
                    const fundoHeight = maxDayM2 > 0 ? (fundoVal / maxDayM2) * 180 : 0;

                    const mdfY = 200 - mdfHeight;
                    const fundoY = mdfY - fundoHeight;

                    return (
                      <g key={day.dateStr} className="group cursor-pointer">
                        {/* MDF Bar (bottom of stack) */}
                        {mdfHeight > 0 && (
                          <rect
                            x={x}
                            y={mdfY}
                            width={barWidth}
                            height={mdfHeight}
                            rx={fundoHeight > 0 ? 0 : 3}
                            fill="url(#mdfGradient)"
                          />
                        )}

                        {/* Fundo Bar (top of stack) */}
                        {fundoHeight > 0 && (
                          <rect
                            x={x}
                            y={fundoY}
                            width={barWidth}
                            height={fundoHeight}
                            rx="3"
                            fill="url(#fundoGradient)"
                          />
                        )}

                        {/* Value label on top of bar */}
                        {totalVal > 0 && (
                          <text
                            x={x + barWidth / 2}
                            y={200 - totalHeight - 6}
                            fill="#ffffff"
                            fontSize="10"
                            fontWeight="bold"
                            textAnchor="middle"
                            fontFamily="monospace"
                          >
                            {Math.round(totalVal)}
                          </text>
                        )}

                        {/* Date Label on X Axis */}
                        <text
                          x={x + barWidth / 2}
                          y="220"
                          fill="#94a3b8"
                          fontSize="10"
                          fontWeight="bold"
                          textAnchor="middle"
                        >
                          {day.formattedDate.slice(0, 5)}
                        </text>
                        <text
                          x={x + barWidth / 2}
                          y="234"
                          fill="#64748b"
                          fontSize="9"
                          textAnchor="middle"
                        >
                          {day.dayOfWeek}
                        </text>
                      </g>
                    );
                  } else {
                    // Pieces Chart
                    const totalPcs = day.totalPieces;
                    const mdfPcs = day.piecesMdf;
                    const fundoPcs = day.piecesFundo;

                    const totalHeight = maxDayPieces > 0 ? (totalPcs / maxDayPieces) * 180 : 0;
                    const mdfHeight = maxDayPieces > 0 ? (mdfPcs / maxDayPieces) * 180 : 0;
                    const fundoHeight = maxDayPieces > 0 ? (fundoPcs / maxDayPieces) * 180 : 0;

                    const mdfY = 200 - mdfHeight;
                    const fundoY = mdfY - fundoHeight;

                    return (
                      <g key={day.dateStr} className="group cursor-pointer">
                        {mdfHeight > 0 && (
                          <rect
                            x={x}
                            y={mdfY}
                            width={barWidth}
                            height={mdfHeight}
                            rx={fundoHeight > 0 ? 0 : 3}
                            fill="url(#mdfGradient)"
                          />
                        )}
                        {fundoHeight > 0 && (
                          <rect
                            x={x}
                            y={fundoY}
                            width={barWidth}
                            height={fundoHeight}
                            rx="3"
                            fill="url(#fundoGradient)"
                          />
                        )}

                        {totalPcs > 0 && (
                          <text
                            x={x + barWidth / 2}
                            y={200 - totalHeight - 6}
                            fill="#ffffff"
                            fontSize="10"
                            fontWeight="bold"
                            textAnchor="middle"
                            fontFamily="monospace"
                          >
                            {totalPcs}
                          </text>
                        )}

                        <text
                          x={x + barWidth / 2}
                          y="220"
                          fill="#94a3b8"
                          fontSize="10"
                          fontWeight="bold"
                          textAnchor="middle"
                        >
                          {day.formattedDate.slice(0, 5)}
                        </text>
                        <text
                          x={x + barWidth / 2}
                          y="234"
                          fill="#64748b"
                          fontSize="9"
                          textAnchor="middle"
                        >
                          {day.dayOfWeek}
                        </text>
                      </g>
                    );
                  }
                })}

                {/* Base X Axis */}
                <line
                  x1="45"
                  y1="200"
                  x2={Math.max(640, dailySummaries.length * 64) - 20}
                  y2="200"
                  stroke="#334155"
                  strokeWidth="1.5"
                />
              </svg>
            )}
          </div>
        </div>

        {/* Turnos & Máquinas Breakdown Row */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t border-slate-800">
          {/* Seccionadoras Output */}
          <div className="p-4 rounded-xl bg-slate-900/70 border border-slate-800">
            <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-3 flex items-center gap-2">
              <Cpu className="w-4 h-4 text-blue-400" />
              Volume por Seccionadora no Período
            </h3>
            <div className="space-y-3">
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="font-bold text-slate-200">Giben SP 100</span>
                  <span className="text-blue-400 font-mono font-bold">
                    {totals.gibenM2.toLocaleString('pt-BR')} m² ({totals.gibenPieces} pçs)
                  </span>
                </div>
                <div className="h-2 w-full bg-slate-800 rounded-full overflow-hidden">
                  <div
                    style={{ width: `${totals.m2Total > 0 ? (totals.gibenM2 / totals.m2Total) * 100 : 0}%` }}
                    className="h-full bg-blue-500 rounded-full"
                  />
                </div>
              </div>

              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="font-bold text-slate-200">Selco WN 600</span>
                  <span className="text-amber-400 font-mono font-bold">
                    {totals.selcoM2.toLocaleString('pt-BR')} m² ({totals.selcoPieces} pçs)
                  </span>
                </div>
                <div className="h-2 w-full bg-slate-800 rounded-full overflow-hidden">
                  <div
                    style={{ width: `${totals.m2Total > 0 ? (totals.selcoM2 / totals.m2Total) * 100 : 0}%` }}
                    className="h-full bg-amber-500 rounded-full"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Turnos Output */}
          <div className="p-4 rounded-xl bg-slate-900/70 border border-slate-800">
            <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-3 flex items-center gap-2">
              <Clock className="w-4 h-4 text-amber-400" />
              Volume por Turno no Período
            </h3>
            <div className="grid grid-cols-3 gap-2">
              {(['1', '2', '3'] as const).map((shiftKey) => {
                const sData = totals.shiftData[shiftKey] || { m2: 0, pieces: 0 };
                const pct = totals.m2Total > 0 ? (sData.m2 / totals.m2Total) * 100 : 0;
                return (
                  <div
                    key={shiftKey}
                    className="p-2.5 rounded-lg bg-slate-950/80 border border-slate-800/80 text-center"
                  >
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                      {shiftKey}º Turno
                    </span>
                    <span className="text-sm font-black text-white font-mono block mt-1">
                      {sData.m2.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} m²
                    </span>
                    <span className="text-[10px] text-slate-400 block mt-0.5">
                      {sData.pieces} peças ({pct.toFixed(0)}%)
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Analytical Table: Daily Breakdown & Drill-Down */}
      <div className="bg-[#091428] rounded-2xl border border-slate-800 overflow-hidden shadow-lg">
        <div className="p-4 sm:p-5 border-b border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <FileSpreadsheet className="w-5 h-5 text-emerald-400" />
              Tabela Analítica de Entrega por Dia
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Detalhamento de volume e peças cortadas dia a dia. Clique em qualquer linha para ver todas as peças cortadas.
            </p>
          </div>

          <span className="text-xs text-slate-400 font-semibold">
            Mostrando <strong>{dailySummaries.length}</strong> dias no período
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-900/90 text-slate-400 border-b border-slate-800 uppercase tracking-wider text-[11px] font-bold">
                <th className="py-3 px-4">Data</th>
                <th className="py-3 px-4 text-center">Dia</th>
                <th className="py-3 px-4 text-right">Qtd Peças Total</th>
                <th className="py-3 px-4 text-right text-sky-400">Pçs MDF</th>
                <th className="py-3 px-4 text-right text-amber-400">Pçs Fundo</th>
                <th className="py-3 px-4 text-right text-sky-400">M² MDF</th>
                <th className="py-3 px-4 text-right text-amber-400">M² Fundo</th>
                <th className="py-3 px-4 text-right text-white font-bold">M² Total</th>
                <th className="py-3 px-4 text-center">Status Meta</th>
                <th className="py-3 px-4 text-center print:hidden">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-medium">
              {dailySummaries.map((day) => {
                const isExpanded = !!expandedDays[day.dateStr];
                const pctDay = targetTotalDaily > 0 ? (day.totalM2 / targetTotalDaily) * 100 : 0;
                const hasProduction = day.totalPieces > 0;

                return (
                  <React.Fragment key={day.dateStr}>
                    <tr
                      onClick={() => hasProduction && toggleDayExpand(day.dateStr)}
                      className={`hover:bg-slate-800/40 transition-colors ${
                        hasProduction ? 'cursor-pointer' : 'opacity-60'
                      } ${isExpanded ? 'bg-slate-800/60' : ''}`}
                    >
                      <td className="py-3 px-4 text-white font-bold font-mono">
                        {day.formattedDate}
                      </td>
                      <td className="py-3 px-4 text-center text-slate-400">
                        {day.dayOfWeek}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-slate-200">
                        {day.totalPieces.toLocaleString('pt-BR')}
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-sky-400">
                        {day.piecesMdf.toLocaleString('pt-BR')}
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-amber-400">
                        {day.piecesFundo.toLocaleString('pt-BR')}
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-sky-300 font-bold">
                        {day.m2Mdf.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-amber-300 font-bold">
                        {day.m2Fundo.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-white font-black text-sm">
                        {day.totalM2.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
                      </td>
                      <td className="py-3 px-4 text-center">
                        {hasProduction ? (
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              pctDay >= 100
                                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                : pctDay >= 70
                                ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                                : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                            }`}
                          >
                            {pctDay.toFixed(0)}%
                          </span>
                        ) : (
                          <span className="text-[10px] text-slate-500">Sem Prod.</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-center print:hidden">
                        {hasProduction ? (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleDayExpand(day.dateStr);
                            }}
                            className="p-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-all cursor-pointer"
                            title="Ver apontamentos detalhados deste dia"
                          >
                            {isExpanded ? (
                              <ChevronUp className="w-4 h-4 text-amber-400" />
                            ) : (
                              <ChevronDown className="w-4 h-4 text-slate-400" />
                            )}
                          </button>
                        ) : null}
                      </td>
                    </tr>

                    {/* Drill-down Expandable Row */}
                    {isExpanded && day.logs.length > 0 && (
                      <tr className="bg-slate-950/90 border-y border-blue-500/30">
                        <td colSpan={10} className="p-4 space-y-3">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-white flex items-center gap-2">
                              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                              Apontamentos de Corte em {day.formattedDate} ({day.logs.length} registros)
                            </span>
                            <span className="text-[11px] text-slate-400">
                              Giben: <strong className="text-slate-200">{day.gibenM2} m²</strong> · Selco:{' '}
                              <strong className="text-slate-200">{day.selcoM2} m²</strong>
                            </span>
                          </div>

                          <div className="overflow-x-auto rounded-xl border border-slate-800 bg-[#091428]">
                            <table className="w-full text-left text-xs">
                              <thead>
                                <tr className="bg-slate-900 text-slate-400 text-[10px] uppercase font-bold border-b border-slate-800">
                                  <th className="py-2 px-3">Hora</th>
                                  <th className="py-2 px-3">Máquina</th>
                                  <th className="py-2 px-3">Turno</th>
                                  <th className="py-2 px-3">PA</th>
                                  <th className="py-2 px-3">Lote</th>
                                  <th className="py-2 px-3">Peça</th>
                                  <th className="py-2 px-3">Material</th>
                                  <th className="py-2 px-3 text-right">Qtd Boas</th>
                                  <th className="py-2 px-3 text-right">M² Total</th>
                                  <th className="py-2 px-3">Operador</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-800/60 font-medium">
                                {day.logs.map((log) => {
                                  const lDate = getLogDate(log);
                                  const isFundo = checkIsFundo(log);
                                  const m2 = getLogM2(log);
                                  return (
                                    <tr key={log.id} className="hover:bg-slate-800/30">
                                      <td className="py-2 px-3 font-mono text-slate-300">
                                        {lDate.toLocaleTimeString('pt-BR', {
                                          hour: '2-digit',
                                          minute: '2-digit',
                                        })}
                                      </td>
                                      <td className="py-2 px-3 text-slate-200">{log.machineId}</td>
                                      <td className="py-2 px-3 text-slate-400">{log.shift}º</td>
                                      <td className="py-2 px-3 font-mono text-blue-400">
                                        {log.paCode || '-'}
                                      </td>
                                      <td className="py-2 px-3 font-mono text-amber-400">
                                        {log.batchNumber || '-'}
                                      </td>
                                      <td className="py-2 px-3 text-slate-200">
                                        <div className="font-bold">{log.partCode}</div>
                                        <div className="text-[10px] text-slate-400 truncate max-w-[200px]">
                                          {log.partName}
                                        </div>
                                      </td>
                                      <td className="py-2 px-3">
                                        <span
                                          className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                            isFundo
                                              ? 'bg-amber-500/20 text-amber-300'
                                              : 'bg-sky-500/20 text-sky-300'
                                          }`}
                                        >
                                          {isFundo ? 'Fundo' : 'MDF'}
                                        </span>
                                      </td>
                                      <td className="py-2 px-3 text-right font-mono font-bold text-white">
                                        {log.quantityGood}
                                      </td>
                                      <td className="py-2 px-3 text-right font-mono font-bold text-amber-300">
                                        {m2.toFixed(2)}
                                      </td>
                                      <td className="py-2 px-3 text-slate-400">
                                        {log.operatorName || '-'}
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
            {/* Total Footer Row */}
            <tfoot>
              <tr className="bg-slate-900 text-white font-bold border-t-2 border-slate-700">
                <td className="py-3 px-4 font-black">TOTAL PERÍODO</td>
                <td className="py-3 px-4 text-center text-slate-400">-</td>
                <td className="py-3 px-4 text-right font-mono font-black text-amber-400">
                  {totals.piecesTotal.toLocaleString('pt-BR')}
                </td>
                <td className="py-3 px-4 text-right font-mono text-sky-300 font-black">
                  {totals.piecesMdf.toLocaleString('pt-BR')}
                </td>
                <td className="py-3 px-4 text-right font-mono text-amber-300 font-black">
                  {totals.piecesFundo.toLocaleString('pt-BR')}
                </td>
                <td className="py-3 px-4 text-right font-mono text-sky-400 font-black text-sm">
                  {totals.m2Mdf.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
                </td>
                <td className="py-3 px-4 text-right font-mono text-amber-400 font-black text-sm">
                  {totals.m2Fundo.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
                </td>
                <td className="py-3 px-4 text-right font-mono text-white font-black text-base">
                  {totals.m2Total.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
                </td>
                <td className="py-3 px-4 text-center">
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-500/20 text-blue-300 border border-blue-500/40">
                    {pctTotalAttainment.toFixed(1)}% Meta
                  </span>
                </td>
                <td className="py-3 px-4 text-center print:hidden">-</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
};
