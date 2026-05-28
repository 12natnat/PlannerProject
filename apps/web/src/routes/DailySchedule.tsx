import React, { useState } from 'react';
import { useDailySchedules, useUpsertDailySchedule, useBulkUpsertDailySchedule, useUpdateDailySchedule, useDeleteDailySchedule } from '../hooks/useDailySchedule';
import { useItems, useCreateItem } from '../hooks/useItems';
import { SearchableSelect } from '../components/SearchableSelect';
import { Calendar, Plus, Save, Upload, Trash2, Search, Edit2 } from 'lucide-react';
import { format } from 'date-fns';
import * as XLSX from 'xlsx';

interface ImportRecord {
  id: string;
  toyName: string;
  itemCode: string;
  date: string;
  shift: number;
  quantity: number;
}

// Helper to convert Excel serial date number to YYYY-MM-DD string
function excelSerialToDate(serial: number): string {
  // Excel's epoch is 1900-01-01, but it considers 1900 as a leap year (bug)
  // JS Date epoch is 1970-01-01
  const utcDays = Math.floor(serial - 25569);
  const d = new Date(utcDays * 86400 * 1000);
  return d.toISOString().split('T')[0];
}

/**
 * Parse the FA_Attach sheet from the weekly production schedule Excel.
 * 
 * Layout:
 *   Row 8 (0-indexed): Headers => col B = "Toy Name", col E/H/K/N/Q/T/W = date serial numbers (merged across 3 shift cols)
 *   Row 9: Sub-headers => "Shift 1", "Shift 2", "Shift 3" repeating for each day
 *   Row 10+: Data rows
 *     - Group header rows: col A = "ND", col B = long toy group name (e.g. "BRB RFRSH GYMNST PS"), no shift data
 *     - Part number rows: col A = "ND", col B = part number (e.g. "HRG52-9565"), shift data in columns
 *     - Total rows: col B = "Total"
 * 
 * We detect group headers vs part numbers:
 *   - Group headers have 0 total quantity across all shifts
 *   - Part numbers have actual quantity data
 */
function parseFAAttachSheet(ws: XLSX.WorkSheet): ImportRecord[] {
  const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
  const results: ImportRecord[] = [];

  // Step 1: Find header row with "Toy Name" in column B
  let headerRow = -1;
  for (let r = 0; r <= Math.min(20, range.e.r); r++) {
    const cellB = ws[XLSX.utils.encode_cell({ r, c: 1 })];
    if (cellB && String(cellB.v).trim().toLowerCase() === 'toy name') {
      headerRow = r;
      break;
    }
  }
  if (headerRow === -1) return results;

  // Step 2: Extract date columns from header row
  // Dates are at columns E(4), H(7), K(10), N(13), Q(16), T(19), W(22) — every 3 columns starting at 4
  const dateColumns: { col: number; date: string }[] = [];
  for (let c = 4; c <= Math.min(24, range.e.c); c += 3) {
    const cell = ws[XLSX.utils.encode_cell({ r: headerRow, c })];
    if (cell && typeof cell.v === 'number' && cell.v > 40000) {
      dateColumns.push({ col: c, date: excelSerialToDate(cell.v) });
    }
  }

  if (dateColumns.length === 0) return results;

  // Step 3: Parse data rows
  const dataStartRow = headerRow + 2; // Skip sub-header row (Shift 1/2/3)
  let currentToyName = '';
  let idCounter = 0;

  for (let r = dataStartRow; r <= range.e.r; r++) {
    const cellA = ws[XLSX.utils.encode_cell({ r, c: 0 })];
    const cellB = ws[XLSX.utils.encode_cell({ r, c: 1 })];

    const colAVal = cellA ? String(cellA.v).trim() : '';
    const colBVal = cellB ? String(cellB.v).trim() : '';

    // Skip empty rows or non-ND rows
    if (!colBVal) continue;
    if (colBVal.toLowerCase() === 'total') continue;

    // Check if this is a group header (toy name) or a part number row
    // Group headers have all-zero quantities across all shift columns
    let totalQty = 0;
    for (const dc of dateColumns) {
      for (let s = 0; s < 3; s++) {
        const qtyCell = ws[XLSX.utils.encode_cell({ r, c: dc.col + s })];
        if (qtyCell && typeof qtyCell.v === 'number') {
          totalQty += qtyCell.v;
        }
      }
    }

    if (totalQty === 0 && colAVal.toUpperCase() === 'ND') {
      // This is a toy name group header
      currentToyName = colBVal;
      continue;
    }

    if (colAVal.toUpperCase() !== 'ND') continue;

    // This is a part number data row
    const partNumber = colBVal;

    for (const dc of dateColumns) {
      for (let s = 0; s < 3; s++) {
        const shiftNum = s + 1;
        const qtyCell = ws[XLSX.utils.encode_cell({ r, c: dc.col + s })];
        const qty = qtyCell && typeof qtyCell.v === 'number' ? qtyCell.v : 0;

        if (qty > 0) {
          idCounter++;
          results.push({
            id: `import-${idCounter}`,
            toyName: currentToyName,
            itemCode: partNumber,
            date: dc.date,
            shift: shiftNum,
            quantity: Math.round(qty * 1000),
          });
        }
      }
    }
  }

  return results;
}

export function DailySchedule() {
  const [filterDate, setFilterDate] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [importData, setImportData] = useState<ImportRecord[]>([]);
  const [importSearch, setImportSearch] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterShift, setFilterShift] = useState('');
  
  const { data: scheduleData, isLoading: loadingSchedules } = useDailySchedules(filterDate || undefined);
  const { data: itemsData } = useItems();
  const createItem = useCreateItem();
  const upsertSchedule = useUpsertDailySchedule();
  const bulkUpsertSchedule = useBulkUpsertDailySchedule();

  const [formData, setFormData] = useState({
    date: new Date().toISOString().split('T')[0],
    shift: 1,
    itemId: '',
    quantity: 0,
  });

  const schedules = scheduleData?.data || [];
  const items = itemsData?.data || [];

  const filteredSchedules = schedules.filter(s => {
    if (filterShift && s.shift !== Number(filterShift)) return false;
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return s.item.itemCode.toLowerCase().includes(q) ||
           s.item.itemName.toLowerCase().includes(q);
  });

  const updateSchedule = useUpdateDailySchedule();
  const deleteSchedule = useDeleteDailySchedule();

  const [editModal, setEditModal] = useState<{ isOpen: boolean; data: any }>({
    isOpen: false,
    data: null,
  });

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editModal.data) return;
    try {
      await updateSchedule.mutateAsync({
        id: editModal.data.id,
        date: editModal.data.date,
        shift: Number(editModal.data.shift),
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
      await deleteSchedule.mutateAsync(id);
    } catch (err: any) {
      alert(err.message || 'Failed to delete schedule');
    }
  };

  const handleSubmit = async (e: React.FormEvent, saveMode: 'overwrite' | 'add') => {
    e.preventDefault();
    if (!formData.itemId) return;
    try {
      await upsertSchedule.mutateAsync({
        ...formData,
        shift: Number(formData.shift),
        quantity: Number(formData.quantity),
        saveMode,
      });
      setShowForm(false);
      setFormData(prev => ({ ...prev, itemId: '', quantity: 0 }));
    } catch (err: any) {
      alert(err.message || 'Failed to save schedule');
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });

        // Try FA_Attach sheet first, then fallback to first sheet
        let ws = wb.Sheets['FA_Attach'];
        let parsed: ImportRecord[] = [];
        
        if (ws) {
          parsed = parseFAAttachSheet(ws);
        }

        // If no FA_Attach or no results, try to parse as simple format
        if (parsed.length === 0) {
          // Fallback: try any sheet for FA_Attach-like structure
          for (const sheetName of wb.SheetNames) {
            ws = wb.Sheets[sheetName];
            parsed = parseFAAttachSheet(ws);
            if (parsed.length > 0) break;
          }
        }

        if (parsed.length === 0) {
          alert('Could not parse the Excel file. Make sure it has the FA_Attach sheet with the correct format (Toy Name header, dates, and Shift 1/2/3 columns).');
          return;
        }

        setImportData(parsed);
      } catch (err) {
        console.error('Excel parse error:', err);
        alert('Failed to parse Excel file. Please check the file format.');
      }
    };
    reader.readAsBinaryString(file);
    e.target.value = '';
  };

  const handleBulkSubmit = async (saveMode: 'overwrite' | 'add') => {
    if (importData.length === 0) return;
    try {
      await bulkUpsertSchedule.mutateAsync({
        records: importData.map(r => ({
          date: r.date,
          shift: r.shift,
          itemCode: r.itemCode,
          toyName: r.toyName,
          quantity: r.quantity,
        })),
        saveMode,
      });
      setShowImportModal(false);
      setImportData([]);
      alert(`Successfully imported ${importData.length} schedule records!`);
    } catch (err: any) {
      alert(err.message || 'Failed to bulk import Daily Schedule');
    }
  };

  const filteredImportData = importData.filter(d => {
    if (!importSearch) return true;
    const q = importSearch.toLowerCase();
    return d.itemCode.toLowerCase().includes(q) ||
           d.toyName.toLowerCase().includes(q) ||
           d.date.includes(q);
  });

  // Group import data summary
  const importSummary = importData.reduce((acc, r) => {
    acc.totalQty += r.quantity;
    acc.uniqueParts.add(r.itemCode);
    acc.dates.add(r.date);
    return acc;
  }, { totalQty: 0, uniqueParts: new Set<string>(), dates: new Set<string>() });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Daily Demand Schedule</h2>
          <p className="text-muted-foreground text-sm">Manage daily production demand requirements.</p>
        </div>
        <div className="flex items-center gap-3">
          <input 
            type="date" 
            className="h-10 px-3 py-2 border rounded-md text-sm bg-background"
            value={filterDate}
            onChange={(e) => setFilterDate(e.target.value)}
          />
          <button 
            onClick={() => setShowImportModal(true)}
            className="bg-secondary text-secondary-foreground border hover:bg-secondary/80 px-4 py-2 rounded-md font-medium text-sm flex items-center space-x-2 transition-colors"
          >
            <Upload size={16} />
            <span>Import Data</span>
          </button>
          <button 
            onClick={() => setShowForm(!showForm)}
            className="bg-primary text-primary-foreground hover:bg-primary/90 px-4 py-2 rounded-md font-medium text-sm flex items-center space-x-2 transition-colors"
          >
            <Plus size={16} />
            <span>Add Demand</span>
          </button>
        </div>
      </div>

      {showForm && (
        <div className="bg-card text-card-foreground border rounded-lg p-6 shadow-sm">
          <h3 className="font-semibold mb-4 flex items-center gap-2">
            <Calendar size={18} /> Record Daily Schedule
          </h3>
          <p className="text-xs text-muted-foreground mb-4">Note: Use "Save Add" to add to existing quantity, or "Save Overwrite" to replace it entirely.</p>
          
          <form className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 items-end">
            <div className="space-y-2">
              <label className="text-sm font-medium">Date</label>
              <input 
                type="date" required
                className="w-full h-10 px-3 border rounded-md bg-background"
                value={formData.date} onChange={e => setFormData({...formData, date: e.target.value})}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Shift</label>
              <select 
                className="w-full h-10 px-3 border rounded-md bg-background"
                value={formData.shift} onChange={e => setFormData({...formData, shift: Number(e.target.value)})}
              >
                <option value={1}>Shift 1</option>
                <option value={2}>Shift 2</option>
                <option value={3}>Shift 3</option>
              </select>
            </div>
            
            <div className="space-y-2">
              <label className="text-sm font-medium">Part Number</label>
              <SearchableSelect
                options={items.map((item: any) => ({ value: item.id, label: item.itemCode }))}
                value={formData.itemId}
                onChange={val => setFormData({...formData, itemId: val})}
                onAdd={async (search) => {
                  try {
                    const res = await createItem.mutateAsync({ itemCode: search, itemName: search, unit: 'PCS' }) as any;
                    if (res?.data?.id) setFormData(prev => ({...prev, itemId: res.data.id}));
                  } catch (e: any) {
                    alert(e.message || "Failed to create part number");
                  }
                }}
                placeholder="Search Part Number..."
              />
            </div>
            
            <div className="space-y-2">
              <label className="text-sm font-medium">Toy Name</label>
              <SearchableSelect
                options={items.map((item: any) => ({ value: item.id, label: item.itemName }))}
                value={formData.itemId}
                onChange={val => setFormData({...formData, itemId: val})}
                onAdd={async (search) => {
                  try {
                    const randomCode = `PN-${Date.now().toString().slice(-5)}`;
                    const res = await createItem.mutateAsync({ itemCode: randomCode, itemName: search, unit: 'PCS' }) as any;
                    if (res?.data?.id) setFormData(prev => ({...prev, itemId: res.data.id}));
                  } catch (e: any) {
                    alert(e.message || "Failed to create toy name");
                  }
                }}
                placeholder="Search Toy Name..."
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Quantity Required</label>
              <input 
                type="number" required min="1"
                className="w-full h-10 px-3 border rounded-md bg-background"
                value={formData.quantity} onChange={e => setFormData({...formData, quantity: Number(e.target.value)})}
              />
            </div>
            
            <div className="md:col-span-2 lg:col-span-5 flex justify-end gap-3 mt-4">
              <button type="button" onClick={() => setShowForm(false)} className="h-10 border px-6 rounded-md font-medium hover:bg-muted transition-colors">Cancel</button>
              <button 
                type="button" 
                onClick={(e) => handleSubmit(e, 'add')} 
                disabled={upsertSchedule.isPending} 
                className="h-10 bg-green-600 hover:bg-green-700 text-white px-6 rounded-md font-medium flex items-center gap-2 transition-colors"
              >
                <Plus size={16} /> {upsertSchedule.isPending ? 'Saving...' : 'Save Add'}
              </button>
              <button 
                type="button" 
                onClick={(e) => handleSubmit(e, 'overwrite')} 
                disabled={upsertSchedule.isPending} 
                className="h-10 bg-primary text-primary-foreground hover:bg-primary/90 px-6 rounded-md font-medium flex items-center gap-2 transition-colors"
              >
                <Save size={16} /> {upsertSchedule.isPending ? 'Saving...' : 'Save Overwrite'}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="bg-card text-card-foreground border rounded-lg shadow-sm overflow-hidden">
        <div className="p-4 border-b bg-muted/10 flex flex-wrap items-center gap-3">
          <div className="relative max-w-sm flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
            <input 
              type="text"
              placeholder="Search Part Number or Toy Name..."
              className="w-full h-9 pl-9 pr-3 border rounded-md bg-background text-sm"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <select
            className="h-9 px-3 border rounded-md bg-background text-sm min-w-[130px]"
            value={filterShift}
            onChange={(e) => setFilterShift(e.target.value)}
          >
            <option value="">All Shifts</option>
            <option value="1">Shift 1</option>
            <option value="2">Shift 2</option>
            <option value="3">Shift 3</option>
          </select>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-secondary/50 text-muted-foreground uppercase text-xs font-medium">
              <tr>
                <th className="px-6 py-3">Date</th>
                <th className="px-6 py-3">Shift</th>
                <th className="px-6 py-3">Part Number</th>
                <th className="px-6 py-3">Toy Name</th>
                <th className="px-6 py-3 text-right">Target Demand</th>
                <th className="px-6 py-3 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loadingSchedules ? (
                <tr><td colSpan={6} className="p-8 text-center">Loading...</td></tr>
              ) : filteredSchedules.length === 0 ? (
                <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">No demand scheduled.</td></tr>
              ) : (
                filteredSchedules.map((schedule) => (
                  <tr key={schedule.id} className="hover:bg-muted/50 transition-colors">
                    <td className="px-6 py-4 font-medium">{format(new Date(schedule.date), 'dd MMM yyyy')}</td>
                    <td className="px-6 py-4">Shift {schedule.shift}</td>
                    <td className="px-6 py-4 font-medium">{schedule.item.itemCode}</td>
                    <td className="px-6 py-4">{schedule.item.itemName}</td>
                    <td className="px-6 py-4 text-right font-bold text-destructive">{schedule.quantity}</td>
                    <td className="px-6 py-4 text-center">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={() => setEditModal({
                            isOpen: true,
                            data: {
                              id: schedule.id,
                              date: schedule.date.split('T')[0],
                              shift: schedule.shift,
                              quantity: schedule.quantity,
                              itemCode: schedule.item.itemCode,
                              itemName: schedule.item.itemName,
                            }
                          })}
                          className="p-1.5 text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-950 rounded-md transition-colors"
                          title="Edit Record"
                        >
                          <Edit2 size={16} />
                        </button>
                        <button
                          onClick={() => handleDelete(schedule.id)}
                          className="p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-950 rounded-md transition-colors"
                          title="Delete Record"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Import Modal */}
      {showImportModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
          <div className="bg-card text-card-foreground border rounded-lg shadow-lg max-w-5xl w-full max-h-[90vh] flex flex-col">
            <div className="flex justify-between items-center p-6 border-b">
              <h3 className="text-xl font-bold flex items-center gap-2"><Upload size={20} /> Import Daily Schedule</h3>
              <button onClick={() => { setShowImportModal(false); setImportData([]); }} className="text-muted-foreground hover:text-foreground text-lg">✕</button>
            </div>
            
            <div className="p-6 flex-1 overflow-auto space-y-4">
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">
                  Upload the <strong>NEXT Week Daily Production Schedule</strong> Excel file (.xlsm / .xlsx). 
                  The system will automatically parse the <strong>FA_Attach</strong> sheet.
                </p>
                <input 
                  type="file" 
                  accept=".xlsx, .xls, .xlsm, .csv" 
                  onChange={handleFileUpload} 
                  className="block w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-primary/10 file:text-primary hover:file:bg-primary/20 cursor-pointer"
                />
              </div>

              {importData.length > 0 && (
                <>
                  {/* Summary Cards */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div className="bg-muted/30 rounded-lg p-3 text-center">
                      <div className="text-2xl font-bold text-primary">{importData.length}</div>
                      <div className="text-xs text-muted-foreground">Total Records</div>
                    </div>
                    <div className="bg-muted/30 rounded-lg p-3 text-center">
                      <div className="text-2xl font-bold text-green-600">{importSummary.uniqueParts.size}</div>
                      <div className="text-xs text-muted-foreground">Unique Parts</div>
                    </div>
                    <div className="bg-muted/30 rounded-lg p-3 text-center">
                      <div className="text-2xl font-bold text-blue-600">{importSummary.dates.size}</div>
                      <div className="text-xs text-muted-foreground">Days</div>
                    </div>
                    <div className="bg-muted/30 rounded-lg p-3 text-center">
                      <div className="text-2xl font-bold text-orange-600">{Math.round(importSummary.totalQty * 100) / 100}</div>
                      <div className="text-xs text-muted-foreground">Total Quantity</div>
                    </div>
                  </div>

                  {/* Search */}
                  <div className="flex justify-between items-center">
                    <span className="font-medium text-sm">{filteredImportData.length} of {importData.length} records shown</span>
                    <div className="relative w-72">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
                      <input 
                        type="text" 
                        placeholder="Search by Part Number, Toy Name, Date..." 
                        className="w-full h-9 pl-9 pr-4 text-sm border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-primary/20"
                        value={importSearch}
                        onChange={e => setImportSearch(e.target.value)}
                      />
                    </div>
                  </div>

                  {/* Table */}
                  <div className="border rounded-md overflow-hidden max-h-[45vh] overflow-y-auto">
                    <table className="w-full text-sm text-left">
                      <thead className="bg-muted text-muted-foreground text-xs uppercase font-medium sticky top-0">
                        <tr>
                          <th className="px-4 py-3">Toy Name</th>
                          <th className="px-4 py-3">Part Number</th>
                          <th className="px-4 py-3">Date</th>
                          <th className="px-4 py-3">Shift</th>
                          <th className="px-4 py-3 text-right">Qty</th>
                          <th className="px-4 py-3 text-center w-16">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {filteredImportData.map((row) => (
                          <tr key={row.id} className="hover:bg-muted/50">
                            <td className="px-4 py-2 text-xs text-muted-foreground max-w-[160px] truncate" title={row.toyName}>{row.toyName || '-'}</td>
                            <td className="px-4 py-2 font-medium">{row.itemCode}</td>
                            <td className="px-4 py-2 text-xs">{row.date}</td>
                            <td className="px-4 py-2">Shift {row.shift}</td>
                            <td className="px-4 py-2 text-right">
                              <input 
                                type="number" 
                                className="w-20 h-8 px-2 border rounded text-right bg-background"
                                value={row.quantity}
                                onChange={e => {
                                  const newData = [...importData];
                                  const idx = newData.findIndex(r => r.id === row.id);
                                  if (idx >= 0) newData[idx] = { ...newData[idx], quantity: Number(e.target.value) };
                                  setImportData(newData);
                                }}
                              />
                            </td>
                            <td className="px-4 py-2 text-center">
                              <button 
                                onClick={() => setImportData(importData.filter(r => r.id !== row.id))}
                                className="p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-950 rounded-md transition-colors"
                                title="Delete Record"
                              >
                                <Trash2 size={16} />
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
            
            <div className="p-6 border-t flex justify-end gap-3 bg-muted/10">
              <button 
                onClick={() => { setShowImportModal(false); setImportData([]); }}
                className="h-10 border px-6 rounded-md font-medium hover:bg-muted text-sm transition-colors"
              >
                Cancel
              </button>
              <button 
                onClick={() => handleBulkSubmit('add')} 
                disabled={bulkUpsertSchedule.isPending || importData.length === 0} 
                className="h-10 bg-green-600 hover:bg-green-700 text-white px-6 rounded-md font-medium flex items-center gap-2 disabled:opacity-50 text-sm transition-colors"
              >
                <Plus size={16} /> {bulkUpsertSchedule.isPending ? 'Saving...' : 'Save (Add)'}
              </button>
              <button 
                onClick={() => handleBulkSubmit('overwrite')} 
                disabled={bulkUpsertSchedule.isPending || importData.length === 0} 
                className="h-10 bg-slate-900 dark:bg-slate-800 hover:bg-slate-800 dark:hover:bg-slate-700 text-white px-6 rounded-md font-medium flex items-center gap-2 disabled:opacity-50 text-sm transition-colors"
              >
                <Save size={16} /> {bulkUpsertSchedule.isPending ? 'Saving...' : 'Save Overwrite'}
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
              <h3 className="text-lg font-bold">Edit Daily Schedule</h3>
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
                <label className="text-sm font-medium">Date</label>
                <input 
                  type="date" required
                  className="w-full h-10 px-3 border rounded-md bg-background"
                  value={editModal.data.date} onChange={e => setEditModal(prev => ({...prev, data: {...prev.data, date: e.target.value}}))}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Shift</label>
                <select 
                  className="w-full h-10 px-3 border rounded-md bg-background"
                  value={editModal.data.shift} onChange={e => setEditModal(prev => ({...prev, data: {...prev.data, shift: Number(e.target.value)}}))}
                >
                  <option value={1}>Shift 1</option>
                  <option value={2}>Shift 2</option>
                  <option value={3}>Shift 3</option>
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Quantity Required</label>
                <input 
                  type="number" required min="1"
                  className="w-full h-10 px-3 border rounded-md bg-background"
                  value={editModal.data.quantity} onChange={e => setEditModal(prev => ({...prev, data: {...prev.data, quantity: Number(e.target.value)}}))}
                />
              </div>
              <div className="flex justify-end gap-3 pt-4">
                <button type="button" onClick={() => setEditModal({ isOpen: false, data: null })} className="h-10 border px-4 rounded-md font-medium hover:bg-muted transition-colors">Cancel</button>
                <button type="submit" disabled={updateSchedule.isPending} className="h-10 bg-primary text-primary-foreground hover:bg-primary/90 px-4 rounded-md font-medium flex items-center gap-2 transition-colors">
                  <Save size={16} /> {updateSchedule.isPending ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
