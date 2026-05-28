import React, { useState, useMemo } from 'react';
import { useWeeklyScheduleSummary, useBulkUpsertWeeklySchedule, useUpsertWeeklySchedule, useUpdateWeeklySchedule, useDeleteWeeklySchedule } from '../hooks/useWeeklySchedule';
import { useItems, useCreateItem } from '../hooks/useItems';
import { SearchableSelect } from '../components/SearchableSelect';
import { Upload, Search, Save, Plus, CalendarRange, Trash2, ChevronLeft, ChevronRight, Calendar, Edit2 } from 'lucide-react';
import * as XLSX from 'xlsx';

// ─── Excel Parser ────────────────────────────────────────────────────────────
interface ImportWeekData {
  weekNumber: number;
  weekStartDate: string; // YYYY-MM-DD
  quantity: number;
}

interface ImportRow {
  id: string;
  itemCode: string;
  toyName: string;
  weeks: ImportWeekData[];
  total: number;
}

function excelSerialToDate(serial: number): string {
  const utcDays = Math.floor(serial - 25569);
  const d = new Date(utcDays * 86400 * 1000);
  return d.toISOString().split('T')[0];
}

/**
 * Parse the 26-week demand Excel (26Weeks.xlsx format):
 *   Row 0: blank, blank, blank, 1, 2, 3 … 26  (week numbers at cols 3+)
 *   Row 1: "PN", "Description", "Total", date1, date2 … (Excel serial dates at cols 3+)
 *   Row 2+: itemCode, toyName, total, qty1, qty2 …
 */
function parse26WeekExcel(ws: XLSX.WorkSheet): { rows: ImportRow[]; year: number } {
  const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');

  // Find header row where col 0 = "PN"
  let headerRow = -1;
  for (let r = 0; r <= Math.min(10, range.e.r); r++) {
    const cell = ws[XLSX.utils.encode_cell({ r, c: 0 })];
    if (cell && String(cell.v).trim().toUpperCase() === 'PN') { headerRow = r; break; }
  }
  if (headerRow === -1) return { rows: [], year: new Date().getFullYear() };

  // Week numbers are in the row ABOVE the header row (cols 3+)
  const weekNumRow = headerRow > 0 ? headerRow - 1 : -1;

  const weekColumns: { col: number; weekNumber: number; weekStartDate: string }[] = [];
  for (let c = 3; c <= range.e.c; c++) {
    const wCell = weekNumRow >= 0 ? ws[XLSX.utils.encode_cell({ r: weekNumRow, c })] : null;
    const dCell = ws[XLSX.utils.encode_cell({ r: headerRow, c })];
    if (!wCell || wCell.t !== 'n') continue;
    const weekNum = Math.round(wCell.v);
    if (weekNum < 1 || weekNum > 52) continue;
    let startDate = '';
    if (dCell && typeof dCell.v === 'number' && dCell.v > 40000) startDate = excelSerialToDate(dCell.v);
    weekColumns.push({ col: c, weekNumber: weekNum, weekStartDate: startDate });
  }

  if (weekColumns.length === 0) return { rows: [], year: new Date().getFullYear() };
  let year = new Date().getFullYear();
  if (weekColumns[0].weekStartDate) year = parseInt(weekColumns[0].weekStartDate.split('-')[0]);

  const rows: ImportRow[] = [];
  let idCounter = 0;
  for (let r = headerRow + 1; r <= range.e.r; r++) {
    const cellPN = ws[XLSX.utils.encode_cell({ r, c: 0 })];
    const cellDesc = ws[XLSX.utils.encode_cell({ r, c: 1 })];
    const itemCode = cellPN ? String(cellPN.v).trim() : '';
    const toyName = cellDesc ? String(cellDesc.v).trim() : '';
    if (!itemCode || itemCode.toUpperCase() === 'PN' || itemCode.toLowerCase().includes('total')) continue;

    const weeks: ImportWeekData[] = [];
    let rowTotal = 0;
    for (const wc of weekColumns) {
      const qtyCell = ws[XLSX.utils.encode_cell({ r, c: wc.col })];
      const qty = qtyCell && typeof qtyCell.v === 'number' ? qtyCell.v : 0;
      if (qty > 0) {
        weeks.push({ weekNumber: wc.weekNumber, weekStartDate: wc.weekStartDate, quantity: Math.round(qty) });
        rowTotal += qty;
      }
    }
    if (weeks.length === 0) continue;
    idCounter++;
    rows.push({ id: `r-${idCounter}`, itemCode, toyName, weeks, total: Math.round(rowTotal) });
  }
  return { rows, year };
}

// ─── Main Component ──────────────────────────────────────────────────────────
const WEEKS_PER_PAGE = 13; // Show 13 weeks at a time (half of 26)

export function WeeklyDemand() {
  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [search, setSearch] = useState('');
  const [weekPage, setWeekPage] = useState(0);
  const [rowPage, setRowPage] = useState(0);
  const [showImport, setShowImport] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [importRows, setImportRows] = useState<ImportRow[]>([]);
  const [importYear, setImportYear] = useState(currentYear);
  const [importSearch, setImportSearch] = useState('');

  // Manual add form state
  const [formData, setFormData] = useState({
    itemId: '',
    weekFrom: 1,
    weekTo: 1,
    quantity: 0,
  });

  const { data: summaryData, isLoading } = useWeeklyScheduleSummary(selectedYear);
  const { data: itemsData } = useItems();
  const createItem = useCreateItem();
  const bulkUpsert = useBulkUpsertWeeklySchedule();
  const upsertWeekly = useUpsertWeeklySchedule();
  const updateWeekly = useUpdateWeeklySchedule();
  const deleteWeekly = useDeleteWeeklySchedule();

  const [editModal, setEditModal] = useState<{ isOpen: boolean; data: any }>({
    isOpen: false,
    data: null,
  });

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editModal.data) return;
    try {
      await updateWeekly.mutateAsync({
        id: editModal.data.id,
        quantity: Number(editModal.data.quantity),
      });
      setEditModal({ isOpen: false, data: null });
    } catch (err: any) {
      alert(err.message || 'Failed to update schedule');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this record?')) return;
    try {
      await deleteWeekly.mutateAsync(id);
    } catch (err: any) {
      alert(err.message || 'Failed to delete schedule');
    }
  };

  const items = itemsData?.data || [];

  const allData = summaryData?.data || [];

  const ROWS_PER_PAGE = 50;

  // All week numbers present in data
  const allWeeks = useMemo(() => {
    const wSet = new Set<number>();
    allData.forEach((row) => Object.keys(row.weeks).forEach((w) => wSet.add(Number(w))));
    return Array.from(wSet).sort((a, b) => a - b);
  }, [allData]);

  const visibleWeeks = useMemo(
    () => allWeeks.slice(weekPage * WEEKS_PER_PAGE, (weekPage + 1) * WEEKS_PER_PAGE),
    [allWeeks, weekPage],
  );
  const totalPages = useMemo(() => Math.ceil(allWeeks.length / WEEKS_PER_PAGE), [allWeeks]);

  const filteredData = useMemo(() => {
    if (!search) return allData;
    const q = search.toLowerCase();
    return allData.filter(
      (row) => row.itemCode.toLowerCase().includes(q) || row.itemName.toLowerCase().includes(q),
    );
  }, [allData, search]);

  const totalRowPages = Math.ceil(filteredData.length / ROWS_PER_PAGE);
  const paginatedData = filteredData.slice(rowPage * ROWS_PER_PAGE, (rowPage + 1) * ROWS_PER_PAGE);

  // ── Import handlers ──
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const wb = XLSX.read(evt.target?.result, { type: 'binary' });
        let parsed: { rows: ImportRow[]; year: number } = { rows: [], year: currentYear };
        for (const sheetName of wb.SheetNames) {
          parsed = parse26WeekExcel(wb.Sheets[sheetName]);
          if (parsed.rows.length > 0) break;
        }
        if (parsed.rows.length === 0) {
          alert('Tidak dapat memparse file Excel. Pastikan format sesuai (kolom PN, Description, Week 1-26).');
          return;
        }
        setImportRows(parsed.rows);
        setImportYear(parsed.year || currentYear);
      } catch {
        alert('Gagal membaca file Excel.');
      }
    };
    reader.readAsBinaryString(file);
    e.target.value = '';
  };

  const handleBulkSave = async (saveMode: 'overwrite' | 'add') => {
    if (importRows.length === 0) return;
    const records: any[] = [];
    for (const row of importRows) {
      for (const w of row.weeks) {
        records.push({
          year: importYear,
          weekNumber: w.weekNumber,
          weekStartDate: w.weekStartDate || undefined,
          weekEndDate: w.weekStartDate
            ? new Date(new Date(w.weekStartDate).getTime() + 6 * 86400000).toISOString().split('T')[0]
            : undefined,
          itemCode: row.itemCode,
          toyName: row.toyName,
          quantity: w.quantity,
        });
      }
    }
    try {
      const res: any = await bulkUpsert.mutateAsync({ records, saveMode });
      setShowImport(false);
      setImportRows([]);
      alert(`Berhasil import ${res?.count ?? records.length} data!`);
    } catch (err: any) {
      alert(err.message || 'Gagal menyimpan data.');
    }
  };

  const filteredImport = importRows.filter((r) => {
    if (!importSearch) return true;
    const q = importSearch.toLowerCase();
    return r.itemCode.toLowerCase().includes(q) || r.toyName.toLowerCase().includes(q);
  });

  const importSummary = useMemo(() => {
    const parts = new Set(importRows.map((r) => r.itemCode));
    const total = importRows.reduce((a, r) => a + r.total, 0);
    const weeks = new Set(importRows.flatMap((r) => r.weeks.map((w) => w.weekNumber)));
    return { parts: parts.size, total, weeks: weeks.size };
  }, [importRows]);

  const handleManualSave = async (saveMode: 'overwrite' | 'add') => {
    if (!formData.itemId || !formData.quantity) return;
    const item = items.find((i: any) => i.id === formData.itemId);
    if (!item) return;
    const records: any[] = [];
    for (let w = formData.weekFrom; w <= formData.weekTo; w++) {
      records.push({
        year: selectedYear,
        weekNumber: w,
        itemCode: (item as any).itemCode,
        toyName: (item as any).itemName,
        quantity: formData.quantity,
      });
    }
    try {
      await bulkUpsert.mutateAsync({ records, saveMode });
      setShowForm(false);
      setFormData({ itemId: '', weekFrom: 1, weekTo: 1, quantity: 0 });
    } catch (err: any) {
      alert(err.message || 'Gagal menyimpan data.');
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <CalendarRange size={24} /> 26-Week Demand Plan
          </h2>
          <p className="text-muted-foreground text-sm">Rencana kebutuhan produksi selama 26 minggu ke depan.</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <button onClick={() => setSelectedYear((y) => y - 1)} className="h-9 w-9 flex items-center justify-center border rounded-md hover:bg-muted transition-colors"><ChevronLeft size={16} /></button>
            <span className="font-semibold text-sm w-12 text-center">{selectedYear}</span>
            <button onClick={() => setSelectedYear((y) => y + 1)} className="h-9 w-9 flex items-center justify-center border rounded-md hover:bg-muted transition-colors"><ChevronRight size={16} /></button>
          </div>
          <button onClick={() => setShowImport(true)} className="bg-secondary border hover:bg-secondary/80 px-4 py-2 rounded-md font-medium text-sm flex items-center gap-2 transition-colors">
            <Upload size={16} /> Import Excel
          </button>
          <button onClick={() => setShowForm(!showForm)} className="bg-primary text-primary-foreground hover:bg-primary/90 px-4 py-2 rounded-md font-medium text-sm flex items-center gap-2 transition-colors">
            <Plus size={16} /> Add Demand
          </button>
        </div>
      </div>

      {/* Manual Add Form */}
      {showForm && (
        <div className="bg-card text-card-foreground border rounded-lg p-6 shadow-sm">
          <h3 className="font-semibold mb-4 flex items-center gap-2"><Calendar size={18} /> Add Weekly Demand</h3>
          <p className="text-xs text-muted-foreground mb-4">Use "Save Add" to add to existing, or "Save Overwrite" to replace.</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-end">
            <div className="space-y-2">
              <label className="text-sm font-medium">Part Number</label>
              <SearchableSelect
                options={items.map((i: any) => ({ value: i.id, label: i.itemCode }))}
                value={formData.itemId}
                onChange={(val) => setFormData({ ...formData, itemId: val })}
                onAdd={async (search) => {
                  try {
                    const res = await createItem.mutateAsync({ itemCode: search, itemName: search, unit: 'PCS' }) as any;
                    if (res?.data?.id) setFormData(f => ({ ...f, itemId: res.data.id }));
                  } catch (e: any) { alert(e.message); }
                }}
                placeholder="Search Part Number..."
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Toy Name</label>
              <SearchableSelect
                options={items.map((i: any) => ({ value: i.id, label: i.itemName }))}
                value={formData.itemId}
                onChange={(val) => setFormData({ ...formData, itemId: val })}
                onAdd={async (search) => {
                  try {
                    const code = `PN-${Date.now().toString().slice(-5)}`;
                    const res = await createItem.mutateAsync({ itemCode: code, itemName: search, unit: 'PCS' }) as any;
                    if (res?.data?.id) setFormData(f => ({ ...f, itemId: res.data.id }));
                  } catch (e: any) { alert(e.message); }
                }}
                placeholder="Search Toy Name..."
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">From Week</label>
              <select className="w-full h-10 px-3 border rounded-md bg-background text-sm" value={formData.weekFrom} onChange={e => setFormData({ ...formData, weekFrom: Number(e.target.value) })}>
                {Array.from({ length: 26 }, (_, i) => i + 1).map(w => <option key={w} value={w}>Week {w}</option>)}
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Until Week</label>
              <select className="w-full h-10 px-3 border rounded-md bg-background text-sm" value={formData.weekTo} onChange={e => setFormData({ ...formData, weekTo: Number(e.target.value) })}>
                {Array.from({ length: 26 }, (_, i) => i + 1).map(w => <option key={w} value={w}>Week {w}</option>)}
              </select>
            </div>
            <div className="space-y-2 md:col-span-2">
              <label className="text-sm font-medium">Quantity / Week</label>
              <input type="number" min="0" className="w-full h-10 px-3 border rounded-md bg-background text-sm" value={formData.quantity} onChange={e => setFormData({ ...formData, quantity: Number(e.target.value) })} />
            </div>
            <div className="md:col-span-2 flex justify-end gap-3 mt-2">
              <button type="button" onClick={() => setShowForm(false)} className="h-10 border px-6 rounded-md font-medium hover:bg-muted text-sm transition-colors">Cancel</button>
              <button type="button" onClick={() => handleManualSave('add')} disabled={bulkUpsert.isPending} className="h-10 bg-green-600 hover:bg-green-700 text-white px-6 rounded-md font-medium flex items-center gap-2 text-sm transition-colors">
                <Plus size={16} /> {bulkUpsert.isPending ? 'Saving...' : 'Save Add'}
              </button>
              <button type="button" onClick={() => handleManualSave('overwrite')} disabled={bulkUpsert.isPending} className="h-10 bg-primary text-primary-foreground hover:bg-primary/90 px-6 rounded-md font-medium flex items-center gap-2 text-sm transition-colors">
                <Save size={16} /> {bulkUpsert.isPending ? 'Saving...' : 'Save Overwrite'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Table */}
      <div className="bg-card text-card-foreground border rounded-lg shadow-sm overflow-hidden">
        {/* Filter bar */}
        <div className="p-4 border-b bg-muted/10 flex items-center gap-3">
          <div className="relative max-w-sm flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
            <input
              type="text"
              placeholder="Cari Part Number atau Toy Name..."
              className="w-full h-9 pl-9 pr-3 border rounded-md bg-background text-sm"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setRowPage(0); }}
            />
          </div>
          {allWeeks.length > 0 && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span>Week {visibleWeeks[0]}–{visibleWeeks[visibleWeeks.length - 1]}</span>
              <button
                onClick={() => setWeekPage((p) => Math.max(0, p - 1))}
                disabled={weekPage === 0}
                className="h-8 w-8 flex items-center justify-center border rounded-md hover:bg-muted disabled:opacity-40 transition-colors"
              >
                <ChevronLeft size={14} />
              </button>
              <span className="text-xs">{weekPage + 1}/{totalPages || 1}</span>
              <button
                onClick={() => setWeekPage((p) => Math.min(totalPages - 1, p + 1))}
                disabled={weekPage >= totalPages - 1}
                className="h-8 w-8 flex items-center justify-center border rounded-md hover:bg-muted disabled:opacity-40 transition-colors"
              >
                <ChevronRight size={14} />
              </button>
            </div>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-secondary/50 text-muted-foreground uppercase text-xs font-medium">
              <tr>
                <th className="px-4 py-3 sticky left-0 bg-secondary/80 z-10 min-w-[130px]">Part Number</th>
                <th className="px-4 py-3 sticky left-[130px] bg-secondary/80 z-10 min-w-[180px]">Toy Name</th>
                {visibleWeeks.map((w) => {
                  const weekData = allData[0]?.weeks?.[w];
                  const startLabel = weekData?.weekStartDate
                    ? new Date(weekData.weekStartDate).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })
                    : '';
                  return (
                    <th key={w} className="px-3 py-1 text-center min-w-[80px]">
                      <div className="font-bold">W{w}</div>
                      {startLabel && <div className="text-[10px] font-normal normal-case text-muted-foreground/80">{startLabel}</div>}
                    </th>
                  );
                })}
                <th className="px-4 py-3 text-right min-w-[90px] bg-secondary/80">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading ? (
                <tr>
                  <td colSpan={visibleWeeks.length + 3} className="p-8 text-center">
                    Loading...
                  </td>
                </tr>
              ) : filteredData.length === 0 ? (
                <tr>
                  <td colSpan={visibleWeeks.length + 3} className="p-8 text-center text-muted-foreground">
                    Belum ada data. Klik <strong>Import Excel</strong> untuk upload data 26-week demand.
                  </td>
                </tr>
              ) : (
                paginatedData.map((row) => (
                  <tr key={row.itemId} className="hover:bg-muted/50 transition-colors">
                    <td className="px-4 py-3 font-medium sticky left-0 bg-card z-[5]">{row.itemCode}</td>
                    <td className="px-4 py-3 text-muted-foreground sticky left-[130px] bg-card z-[5] max-w-[180px] truncate" title={row.itemName}>
                      {row.itemName}
                    </td>
                    {visibleWeeks.map((w) => {
                      const weekData = row.weeks?.[w];
                      const qty = weekData?.quantity;
                      return (
                        <td key={w} className="px-3 py-3 text-center relative group min-w-[80px]">
                          {qty ? (
                            <div className="flex flex-col items-center justify-center w-full h-full">
                              <span className="font-medium text-blue-600 dark:text-blue-400">
                                {qty.toLocaleString()}
                              </span>
                              <div className="absolute inset-0 flex items-center justify-center gap-1 opacity-0 group-hover:opacity-100 bg-card/90 backdrop-blur-[1px] transition-all">
                                <button
                                  onClick={() => setEditModal({
                                    isOpen: true,
                                    data: {
                                      id: weekData.id,
                                      itemCode: row.itemCode,
                                      itemName: row.itemName,
                                      weekNumber: w,
                                      quantity: qty,
                                    }
                                  })}
                                  className="p-1.5 text-blue-500 hover:bg-blue-100 dark:hover:bg-blue-900/50 rounded-md transition-colors"
                                  title="Edit"
                                >
                                  <Edit2 size={14} />
                                </button>
                                <button
                                  onClick={() => handleDelete(weekData.id)}
                                  className="p-1.5 text-red-500 hover:bg-red-100 dark:hover:bg-red-900/50 rounded-md transition-colors"
                                  title="Delete"
                                >
                                  <Trash2 size={14} />
                                </button>
                              </div>
                            </div>
                          ) : (
                            <span className="text-muted-foreground/30">—</span>
                          )}
                        </td>
                      );
                    })}
                    <td className="px-4 py-3 text-right font-bold text-primary">
                      {row.total.toLocaleString()}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {filteredData.length > 0 && (
          <div className="px-4 py-3 border-t bg-muted/10 flex items-center justify-between text-xs text-muted-foreground">
            <span>Menampilkan {filteredData.length} item · {allWeeks.length} minggu</span>
            {totalRowPages > 1 && (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setRowPage((p) => Math.max(0, p - 1))}
                  disabled={rowPage === 0}
                  className="h-7 w-7 flex items-center justify-center border rounded hover:bg-muted disabled:opacity-40"
                >
                  <ChevronLeft size={13} />
                </button>
                <span>Baris {rowPage * ROWS_PER_PAGE + 1}–{Math.min((rowPage + 1) * ROWS_PER_PAGE, filteredData.length)} / {filteredData.length}</span>
                <button
                  onClick={() => setRowPage((p) => Math.min(totalRowPages - 1, p + 1))}
                  disabled={rowPage >= totalRowPages - 1}
                  className="h-7 w-7 flex items-center justify-center border rounded hover:bg-muted disabled:opacity-40"
                >
                  <ChevronRight size={13} />
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Import Modal */}
      {showImport && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
          <div className="bg-card text-card-foreground border rounded-lg shadow-xl max-w-5xl w-full max-h-[92vh] flex flex-col">
            {/* Modal Header */}
            <div className="flex justify-between items-center p-6 border-b">
              <h3 className="text-xl font-bold flex items-center gap-2">
                <Upload size={20} /> Import 26-Week Demand Plan
              </h3>
              <button
                onClick={() => { setShowImport(false); setImportRows([]); setImportSearch(''); }}
                className="text-muted-foreground hover:text-foreground text-lg leading-none"
              >
                ✕
              </button>
            </div>

            <div className="p-6 flex-1 overflow-auto space-y-5">
              {/* Upload */}
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">
                  Upload file Excel dengan format: kolom <strong>PN</strong> (Part Number), <strong>Description</strong> (Toy Name),
                  lalu kolom Week <strong>1–26</strong> dengan tanggal di bawahnya.
                </p>
                <input
                  type="file"
                  accept=".xlsx,.xls,.xlsm,.csv"
                  onChange={handleFileUpload}
                  className="block w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-primary/10 file:text-primary hover:file:bg-primary/20 cursor-pointer"
                />
              </div>

              {importRows.length > 0 && (
                <>
                  {/* Summary */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div className="bg-muted/30 rounded-lg p-3 text-center">
                      <div className="text-2xl font-bold text-primary">{importRows.length}</div>
                      <div className="text-xs text-muted-foreground">Total Items</div>
                    </div>
                    <div className="bg-muted/30 rounded-lg p-3 text-center">
                      <div className="text-2xl font-bold text-green-600">{importSummary.parts}</div>
                      <div className="text-xs text-muted-foreground">Unique Parts</div>
                    </div>
                    <div className="bg-muted/30 rounded-lg p-3 text-center">
                      <div className="text-2xl font-bold text-blue-600">{importSummary.weeks}</div>
                      <div className="text-xs text-muted-foreground">Minggu</div>
                    </div>
                    <div className="bg-muted/30 rounded-lg p-3 text-center">
                      <div className="text-2xl font-bold text-orange-600">{importSummary.total.toLocaleString()}</div>
                      <div className="text-xs text-muted-foreground">Total Qty</div>
                    </div>
                  </div>

                  {/* Tahun import */}
                  <div className="flex items-center gap-3">
                    <label className="text-sm font-medium whitespace-nowrap">Tahun Data:</label>
                    <input
                      type="number"
                      className="h-9 w-28 px-3 border rounded-md bg-background text-sm"
                      value={importYear}
                      onChange={(e) => setImportYear(Number(e.target.value))}
                    />
                    <div className="flex-1 relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={15} />
                      <input
                        type="text"
                        placeholder="Cari Part Number / Toy Name..."
                        className="w-full h-9 pl-9 pr-3 border rounded-md bg-background text-sm"
                        value={importSearch}
                        onChange={(e) => setImportSearch(e.target.value)}
                      />
                    </div>
                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                      {filteredImport.length}/{importRows.length} items
                    </span>
                  </div>

                  {/* Preview Table */}
                  <div className="border rounded-md overflow-hidden max-h-[40vh] overflow-y-auto">
                    <table className="w-full text-sm text-left">
                      <thead className="bg-muted text-muted-foreground text-xs uppercase font-medium sticky top-0">
                        <tr>
                          <th className="px-4 py-2">Part Number</th>
                          <th className="px-4 py-2">Toy Name</th>
                          <th className="px-4 py-2 text-center">Minggu Data</th>
                          <th className="px-4 py-2 text-right">Total Qty</th>
                          <th className="px-4 py-2 text-center w-12">Del</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {filteredImport.map((row) => (
                          <tr key={row.id} className="hover:bg-muted/40">
                            <td className="px-4 py-2 font-medium">{row.itemCode}</td>
                            <td className="px-4 py-2 text-muted-foreground max-w-[200px] truncate" title={row.toyName}>
                              {row.toyName}
                            </td>
                            <td className="px-4 py-2">
                              <div className="text-xs text-muted-foreground">
                                <div className="font-medium mb-1">
                                  W{row.weeks[0]?.weekNumber}–W{row.weeks[row.weeks.length - 1]?.weekNumber} ({row.weeks.length} minggu)
                                </div>
                                <div className="text-[10px] space-y-0.5 max-w-md">
                                  {row.weeks.map((week, idx) => {
                                    const endDate = week.weekStartDate 
                                      ? new Date(week.weekStartDate).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })
                                      : '';
                                    const startDate = week.weekStartDate
                                      ? new Date(new Date(week.weekStartDate).getTime() - 6 * 86400000).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })
                                      : '';
                                    return (
                                      <div key={idx} className="flex items-center gap-1">
                                        <span className="font-medium text-blue-600">W{week.weekNumber}</span>
                                        {startDate && endDate && (
                                          <span className="text-muted-foreground/60">({startDate} - {endDate})</span>
                                        )}
                                        <span className="text-foreground font-medium">: {week.quantity.toLocaleString()}</span>
                                      </div>
                                    );
                                  })}
                                  <div className="flex items-center gap-1 pt-1 border-t border-border/50 mt-1">
                                    <span className="font-bold text-primary">Total:</span>
                                    <span className="font-bold text-primary">{row.total.toLocaleString()}</span>
                                  </div>
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-2 text-right font-semibold text-blue-600">
                              {row.total.toLocaleString()}
                            </td>
                            <td className="px-4 py-2 text-center">
                              <button
                                onClick={() => setImportRows((rows) => rows.filter((r) => r.id !== row.id))}
                                className="p-1 text-red-500 hover:bg-red-50 dark:hover:bg-red-950 rounded transition-colors"
                              >
                                <Trash2 size={15} />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-5 border-t flex justify-end gap-3 bg-muted/10">
              <button
                onClick={() => { setShowImport(false); setImportRows([]); }}
                className="h-10 border px-6 rounded-md font-medium hover:bg-muted text-sm transition-colors"
              >
                Batal
              </button>
              <button
                onClick={() => handleBulkSave('add')}
                disabled={bulkUpsert.isPending || importRows.length === 0}
                className="h-10 bg-green-600 hover:bg-green-700 text-white px-6 rounded-md font-medium flex items-center gap-2 disabled:opacity-50 text-sm transition-colors"
              >
                <Plus size={16} />
                {bulkUpsert.isPending ? 'Menyimpan...' : 'Save (Add)'}
              </button>
              <button
                onClick={() => handleBulkSave('overwrite')}
                disabled={bulkUpsert.isPending || importRows.length === 0}
                className="h-10 bg-slate-900 dark:bg-slate-700 hover:bg-slate-800 text-white px-6 rounded-md font-medium flex items-center gap-2 disabled:opacity-50 text-sm transition-colors"
              >
                <Save size={16} />
                {bulkUpsert.isPending ? 'Menyimpan...' : 'Save Overwrite'}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Edit Modal */}
      {editModal.isOpen && editModal.data && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
          <div className="bg-card text-card-foreground border rounded-lg shadow-lg max-w-md w-full p-6 space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-bold">Edit Demand</h3>
              <button 
                type="button" 
                onClick={() => setEditModal({ isOpen: false, data: null })}
                className="text-muted-foreground hover:text-foreground text-sm"
              >
                ✕
              </button>
            </div>
            <form onSubmit={handleEditSubmit} className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-muted-foreground">Part Number</label>
                <div className="font-semibold">{editModal.data.itemCode} - {editModal.data.itemName}</div>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-muted-foreground">Week</label>
                <div className="font-semibold">Week {editModal.data.weekNumber} ({selectedYear})</div>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Quantity</label>
                <input 
                  type="number" required min="1"
                  className="w-full h-10 px-3 border rounded-md bg-background"
                  value={editModal.data.quantity} onChange={e => setEditModal(prev => ({...prev, data: {...prev.data, quantity: Number(e.target.value)}}))}
                />
              </div>
              <div className="flex justify-end gap-3 pt-4">
                <button type="button" onClick={() => setEditModal({ isOpen: false, data: null })} className="h-10 border px-4 rounded-md font-medium hover:bg-muted transition-colors">Cancel</button>
                <button type="submit" disabled={updateWeekly.isPending} className="h-10 bg-primary text-primary-foreground hover:bg-primary/90 px-4 rounded-md font-medium flex items-center gap-2 transition-colors">
                  <Save size={16} /> {updateWeekly.isPending ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
